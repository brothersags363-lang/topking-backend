require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const axios = require("axios");
const admin = require("firebase-admin");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const fsp = require("fs/promises");  
const path = require("path");
const crypto = require("crypto");
const dns = require("dns").promises;
const net = require("net");
const cron = require("node-cron");
const { spawn } = require("child_process");

const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const {
  RtcTokenBuilder,
  RtcRole,
} = require("agora-token");


// =====================================================
// BASIC ENV VALIDATION
// =====================================================

const REQUIRED_ENV = [
  "AGORA_APP_ID",
  "AGORA_APP_CERTIFICATE",
  "R2_ENDPOINT",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing environment variable: ${key}`);
    process.exit(1);
  }
}


// =====================================================
// FIREBASE
// =====================================================

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();


// =====================================================
// FFMPEG
// =====================================================

ffmpeg.setFfmpegPath(ffmpegPath);


// =====================================================
// EXPRESS
// =====================================================

const app = express();

app.get("/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ success: true, status: "ok", service: "topking-backend", time: new Date().toISOString() });
});

app.get("/version", (req, res) => {
  res.json({
    success: true,
    version: "reel-merge-v9-fast",
    features: ["subtitle", "music", "voice", "effect", "add-stars-v1", "admin-delete-v2"],
  });
});

app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

app.set("trust proxy", 1);


// =====================================================
// SECURITY HEADERS
// =====================================================

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);


// =====================================================
// CORS
// =====================================================

// IMPORTANT:
// Put your real domains in ALLOWED_ORIGINS.
// Android apps generally don't need CORS for direct API
// requests, but if your web frontend uses this API,
// add its exact HTTPS origin.

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || ""
)
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {

      // Allow non-browser requests such as native Android
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("CORS origin not allowed")
      );
    },

    methods: [
      "GET",
      "POST",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Authorization",
      "Content-Type",
    ],

    credentials: false,
  })
);


// =====================================================
// BODY LIMITS
// =====================================================

app.use(
  express.json({
    limit: "100kb",
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "100kb",
  })
);


// =====================================================
// REQUEST TIMEOUT
// =====================================================

app.use((req, res, next) => {

  res.setTimeout(
    10 * 60 * 1000,
    () => {

      if (!res.headersSent) {
        res.status(408).json({
          success: false,
          error: "Request timeout",
        });
      }

      req.destroy();
    }
  );

  next();
});


// =====================================================
// SAFE REQUEST LOGGER
// =====================================================

app.use((req, res, next) => {

  console.log(
    `${new Date().toISOString()} ${req.method} ${req.path}`
  );

  next();
});


// =====================================================
// RATE LIMITERS
// =====================================================

const generalLimiter = rateLimit({

  windowMs: 60 * 1000,

  max: 120,

  standardHeaders: true,

  legacyHeaders: false,

  message: {
    success: false,
    error: "Too many requests. Please try again later.",
  },

});


const uploadLimiter = rateLimit({

  windowMs: 60 * 1000,

  max: 10,

  standardHeaders: true,

  legacyHeaders: false,

  message: {
    success: false,
    error: "Too many upload requests.",
  },

});


const tokenLimiter = rateLimit({

  windowMs: 60 * 1000,

  max: 120,

  standardHeaders: true,

  legacyHeaders: false,

  message: {
    success: false,
    error: "Too many token requests.",
  },

});


const notificationLimiter = rateLimit({

  windowMs: 60 * 1000,

  max: 30,

  standardHeaders: true,

  legacyHeaders: false,

  message: {
    success: false,
    error: "Too many notification requests.",
  },

});


app.use(generalLimiter);


// =====================================================
// MULTER
// =====================================================

const upload = multer({

  dest: path.join(
    __dirname,
    "uploads"
  ),

  limits: {

    fileSize:
      250 * 1024 * 1024,

    files: 1,

    fields: 10,

  },

  fileFilter: (
    req,
    file,
    cb
  ) => {

    const allowedMimeTypes = [
      "video/mp4",
      "video/quicktime",
    ];

    const allowedExtensions = [
      ".mp4",
      ".mov",
    ];

    const ext =
      path
        .extname(file.originalname || "")
        .toLowerCase();

    if (
      allowedMimeTypes.includes(
        file.mimetype
      ) &&
      allowedExtensions.includes(ext)
    ) {

      return cb(null, true);
    }

    return cb(
      new Error(
        "Only MP4 and MOV videos are allowed"
      )
    );
  },

});


/*
 * Processing upload:
 * - video is the source reel
 * - voice is an optional local voice-over
 *
 * The normal /upload-video middleware above is intentionally
 * unchanged so existing upload behavior stays intact.
 */
const processUpload = multer({

  dest: path.join(
    __dirname,
    "uploads"
  ),

  limits: {

    fileSize:
      250 * 1024 * 1024,

    files: 2,

    fields: 20,

  },

  fileFilter: (
    req,
    file,
    cb
  ) => {

    const videoTypes = [
      "video/mp4",
      "video/quicktime",
    ];

    const videoExts = [
      ".mp4",
      ".mov",
    ];

    const voiceTypes = [
      "audio/mp4",
      "audio/m4a",
      "audio/aac",
      "audio/mpeg",
      "audio/wav",
      "audio/x-m4a",
      "video/mp4",
    ];

    const voiceExts = [
      ".m4a",
      ".mp4",
      ".aac",
      ".mp3",
      ".wav",
    ];

    const ext =
      path
        .extname(file.originalname || "")
        .toLowerCase();

    if (
      file.fieldname === "video" &&
      videoTypes.includes(file.mimetype) &&
      videoExts.includes(ext)
    ) {
      return cb(null, true);
    }

    if (
      file.fieldname === "voice" &&
      voiceTypes.includes(file.mimetype) &&
      voiceExts.includes(ext)
    ) {
      return cb(null, true);
    }

    return cb(
      new Error(
        "Invalid processing file"
      )
    );
  },

});


// =====================================================
// AGORA
// =====================================================

const APP_ID =
  process.env.AGORA_APP_ID;

const APP_CERTIFICATE =
  process.env.AGORA_APP_CERTIFICATE;


// =====================================================
// R2
// =====================================================

const r2 = new S3Client({

  region: "auto",

  endpoint:
    process.env.R2_ENDPOINT,

  credentials: {

    accessKeyId:
      process.env.R2_ACCESS_KEY_ID,

    secretAccessKey:
      process.env.R2_SECRET_ACCESS_KEY,

  },

});


// =====================================================
// FIREBASE AUTH MIDDLEWARE
// =====================================================

async function verifyUser(
  req,
  res,
  next
) {

  try {

    const authHeader =
      req.headers.authorization;

    if (
      !authHeader ||
      typeof authHeader !== "string"
    ) {

      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }


    if (
      !authHeader.startsWith("Bearer ")
    ) {

      return res.status(401).json({
        success: false,
        error: "Invalid authorization format",
      });
    }


    const token =
      authHeader.slice(7).trim();


    if (
      !token ||
      token.length > 10000
    ) {

      return res.status(401).json({
        success: false,
        error: "Invalid authentication token",
      });
    }


    const decodedToken =
      await admin
        .auth()
        .verifyIdToken(token, true);


    if (!decodedToken.uid) {

      return res.status(401).json({
        success: false,
        error: "Invalid user",
      });
    }


    req.user = decodedToken;

    next();

  } catch (err) {

    console.error(
      "AUTH ERROR:",
      err.code || "unknown"
    );

    return res.status(401).json({
      success: false,
      error: "Authentication failed",
    });
  }

}


// =====================================================
// ADMIN CHECK
// =====================================================

function requireAdmin(
  req,
  res,
  next
) {

  if (
    req.user &&
    req.user.admin === true
  ) {

    return next();
  }

  return res.status(403).json({
    success: false,
    error: "Admin access required",
  });
}


// =====================================================
// INPUT HELPERS
// =====================================================

function isValidUid(uid) {

  return (
    typeof uid === "string" &&
    uid.length >= 1 &&
    uid.length <= 200 &&
    /^[A-Za-z0-9_-]+$/.test(uid)
  );

}


function isValidChannelName(channel) {

  return (
    typeof channel === "string" &&
    channel.length >= 1 &&
    channel.length <= 100 &&
    /^[A-Za-z0-9_-]+$/.test(channel)
  );

}


function isValidMessage(message) {

  return (
    typeof message === "string" &&
    message.trim().length > 0 &&
    message.length <= 4000
  );

}


// =====================================================
// FCM PUSH NOTIFICATION
// =====================================================

async function sendPushNotification(
  targetUid,
  senderUid,
  title,
  body,
  extra = {}
) {

  if (!isValidUid(targetUid) || !isValidUid(senderUid)) {
    return;
  }

  if (typeof title !== "string" || title.length > 200) {
    return;
  }

  if (!isValidMessage(body)) {
    return;
  }

  const userSnap = await db.collection("users").doc(targetUid).get();

  if (!userSnap.exists) {
    return;
  }

  const token = userSnap.data().fcmToken;

  if (!token || typeof token !== "string" || token.length > 5000) {
    return;
  }

  // Instagram jaisa short preview
  const preview =
    body.length > 120 ? body.slice(0, 117) + "..." : body;

  // FCM data values sirf string ho sakti hain
  const str = (v) => (typeof v === "string" ? v.slice(0, 500) : "");

  try {

    await admin.messaging().send({

      token,

      notification: {
        title,
        body: preview,
      },

      data: {
        type: "chat",
        senderUid: senderUid,
        senderName: str(extra.senderName),
        senderImg: str(extra.senderImg),
      },

      android: {

        // Phone so raha ho ya app band ho tab bhi turant pahunche
        priority: "high",
        ttl: 24 * 60 * 60 * 1000,

        notification: {
          channelId: "messages",
          sound: "default",
          // Ek insaan ke kai message = ek hi notification (replace hota hai)
          tag: "chat_" + senderUid,
          defaultVibrateTimings: true,
          notificationPriority: "PRIORITY_MAX",
          visibility: "PRIVATE",
        },

      },

      apns: {

        headers: {
          "apns-priority": "10",
        },

        payload: {
          aps: {
            sound: "default",
            "thread-id": "chat_" + senderUid,
          },
        },

      },

    });

  } catch (e) {

    console.error("FCM ERROR:", e.code || "unknown");

    if (
      e.code === "messaging/registration-token-not-registered" ||
      e.code === "messaging/invalid-registration-token"
    ) {

      try {

        await db
          .collection("users")
          .doc(targetUid)
          .update({
            fcmToken: admin.firestore.FieldValue.delete(),
          });

      } catch (_) {}

    }

  }

}


// =====================================================
// AGORA TOKEN
// =====================================================
//
// IMPORTANT:
// Client cannot choose another user's UID.
// Firebase UID is authenticated first.
// Agora UID is generated from Firebase UID.
//
// =====================================================

app.get(

  "/token",

  tokenLimiter,

  verifyUser,

  async (req, res) => {

    try {

      const channelName =
        req.query.channel;


      if (
        !isValidChannelName(
          channelName
        )
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Invalid channel",

        });

      }


      if (
        !APP_ID ||
        !APP_CERTIFICATE
      ) {

        return res.status(500).json({

          success: false,

          error:
            "Agora configuration unavailable",

        });

      }


      // Generate a deterministic numeric Agora UID
      // from authenticated Firebase UID.

      const hash =
        crypto
          .createHash("sha256")
          .update(req.user.uid)
          .digest();


      // Keep Agora UID below 2^31 so the Android native bridge does not
      // convert an unsigned UID into a negative/invalid signed integer.
      let agoraUid =
        hash.readUInt32BE(0) & 0x7fffffff;

      // Keep one stable, positive 31-bit UID for Android/native Agora bridges.
      // The token and joinChannel() therefore always use exactly the same UID.
      agoraUid = Math.max(1, agoraUid);


      // Avoid zero.
      if (agoraUid === 0) {
        agoraUid = 1;
      }


      const role =
        RtcRole.PUBLISHER;


      // 1 hour
      const expireTime =
        60 * 60;


      const currentTime =
        Math.floor(
          Date.now() / 1000
        );


      const privilegeExpireTime =
        currentTime +
        expireTime;


      const token =
        RtcTokenBuilder.buildTokenWithUid(

          APP_ID,

          APP_CERTIFICATE,

          channelName,

          agoraUid,

          role,

          privilegeExpireTime

        );


      return res.json({

        success: true,

        token,

        uid: agoraUid,

        expiresIn:
          expireTime,

      });


    } catch (e) {

      console.error(
        "AGORA TOKEN ERROR:",
        e.message
      );


      return res.status(500).json({

        success: false,

        error:
          "Could not create Agora token",

      });

    }

  }

);


// =====================================================
// SSRF PROTECTION
// =====================================================

function isPrivateIp(ip) {

  if (net.isIP(ip) === 4) {

    const parts =
      ip.split(".").map(Number);

    const a = parts[0];
    const b = parts[1];

    if (a === 10) return true;

    if (
      a === 172 &&
      b >= 16 &&
      b <= 31
    ) return true;

    if (a === 192 && b === 168)
      return true;

    if (a === 127)
      return true;

    if (a === 169 && b === 254)
      return true;

    if (a === 0)
      return true;

  }


  if (net.isIP(ip) === 6) {

    const lower =
      ip.toLowerCase();

    if (
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80")
    ) {
      return true;
    }

  }


  return false;
}


async function validateExternalAudioUrl(
  input
) {

  let parsed;

  try {

    parsed =
      new URL(input);

  } catch (_) {

    throw new Error(
      "Invalid audio URL"
    );
  }


  if (
    parsed.protocol !== "https:"
  ) {

    throw new Error(
      "Only HTTPS audio URLs are allowed"
    );
  }


  if (
    parsed.username ||
    parsed.password
  ) {

    throw new Error(
      "Credentials in URL are not allowed"
    );
  }


  const hostname =
    parsed.hostname;


  const records =
    await dns.lookup(
      hostname,
      {
        all: true,
      }
    );


  if (!records.length) {

    throw new Error(
      "Audio host could not be resolved"
    );
  }


  for (const record of records) {

    if (
      isPrivateIp(record.address)
    ) {

      throw new Error(
        "Private/internal audio hosts are not allowed"
      );
    }

  }


  return parsed.href;
}


// =====================================================
// PROCESS VIDEO + MUSIC + VOICE + SUBTITLE
// =====================================================

function escapeDrawText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\r/g, "")
    .replace(/\n/g, "\\n");
}

function safeSubtitleColor(value) {
  const color =
    typeof value === "string"
      ? value.trim()
      : "";

  return /^#[0-9a-fA-F]{6}$/.test(color)
    ? color
    : "#FFFFFF";
}

function safeRatio(value, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(
    0,
    Math.min(1, number)
  );
}

function safeSizeRatio(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0.03;
  }

  return Math.max(
    0.005,
    Math.min(0.20, number)
  );
}

// Extra filters (Glossy, Sunset, Clarendon, ...) live in one shared file
// that the app also uses, so names can never get out of sync.
const FILTER_LIBRARY = require("./constants/filterLibrary");

function safeVideoEffect(value) {
  const allowed = [
    "none",
    "vivid",
    "soft",
    "bw",
    ...FILTER_LIBRARY.ids(),
  ];

  return allowed.includes(value)
    ? value
    : "none";
}

function assEscapeText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}

// -------------------------------------------------
// GET REAL VIDEO DIMENSIONS (no ffprobe binary needed)
// -------------------------------------------------
// We read ffmpeg's own "-i" stderr output, which always prints the
// input stream info including "WxH" for the video track. This lets us
// keep the FINAL POST at the SAME SIZE/ASPECT RATIO the user recorded
// or uploaded, instead of assuming every video is 1080x1920.
function getVideoDimensions(videoPath) {
  return new Promise((resolve) => {
    const probe = spawn(ffmpegPath, ["-i", videoPath]);
    let stderr = "";

    probe.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    probe.on("close", () => {
      // Matches lines like: "Stream #0:0(und): Video: h264 ... 1080x1920 ..."
      const match = stderr.match(
        /Video:.*?(\d{2,5})x(\d{2,5})/
      );

      if (match) {
        resolve({
          width: parseInt(match[1], 10),
          height: parseInt(match[2], 10),
        });
      } else {
        // Safe fallback so subtitle rendering never crashes.
        resolve({ width: 1080, height: 1920 });
      }
    });

    probe.on("error", () => {
      resolve({ width: 1080, height: 1920 });
    });
  });
}


// -------------------------------------------------
// AUTO COMPRESS (bada video -> ~75MB)
// -------------------------------------------------
// Agar video 100MB se bada ho to quality thodi kam karke use
// lagbhag 75MB ke aas-paas la dete hain, taaki post ho sake.
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const TARGET_VIDEO_MB = 75;

function getVideoDuration(videoPath) {
  return new Promise((resolve) => {
    const probe = spawn(ffmpegPath, ["-i", videoPath]);
    let stderr = "";
    probe.stderr.on("data", (c) => { stderr += c.toString(); });
    probe.on("close", () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m) {
        resolve(
          parseInt(m[1], 10) * 3600 +
          parseInt(m[2], 10) * 60 +
          parseFloat(m[3])
        );
      } else {
        resolve(0);
      }
    });
    probe.on("error", () => resolve(0));
  });
}

async function compressVideoIfTooLarge(inputPath, targetMB = TARGET_VIDEO_MB) {
  const stat = await fsp.stat(inputPath);
  if (stat.size <= MAX_VIDEO_BYTES) {
    return inputPath; // chhota hai, as-is
  }

  // Reel max 60 sec; duration na mile to 60 maan lo.
  let duration = await getVideoDuration(inputPath);
  if (!duration || duration > 60) duration = 60;

  const audioBps = 128 * 1000;
  const totalBps = (targetMB * 8 * 1024 * 1024) / duration;
  const videoBps = Math.max(1500 * 1000, Math.floor(totalBps - audioBps));

  const tempDir = path.join(__dirname, "temp");
  await fsp.mkdir(tempDir, { recursive: true });
  const outPath = path.join(tempDir, `${crypto.randomUUID()}-small.mp4`);

  const args = [
    "-y", "-i", inputPath,
    "-t", String(duration),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-b:v", String(videoBps),
    "-maxrate", String(videoBps),
    "-bufsize", String(videoBps * 2),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    outPath,
  ];

  await new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (c) => {
      stderr += c.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`compress failed (${code}): ${stderr}`))
    );
  });

  console.log("COMPRESSED:", {
    from: (stat.size / 1048576).toFixed(1) + "MB",
    to: ((await fsp.stat(outPath)).size / 1048576).toFixed(1) + "MB",
  });

  // original bada file hata do
  try { await fsp.unlink(inputPath); } catch (_) {}
  return outPath;
}

function hexToAssColor(hex) {
  const clean = String(hex || "#FFFFFF")
    .replace(/^#/, "")
    .padStart(6, "0")
    .slice(0, 6);
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b}${g}${r}`;
}

app.post(
  "/merge",

  uploadLimiter,

  verifyUser,

  processUpload.fields([
    {
      name: "video",
      maxCount: 1,
    },
    {
      name: "voice",
      maxCount: 1,
    },
  ]),

  async (req, res) => {

    let videoPath = null;
    let voicePath = null;
    let musicPath = null;
    let outputPath = null;
    let subtitlePath = null;
    let thumbnailPath = null;

    try {

      const videoFile =
        req.files?.video?.[0];

      const voiceFile =
        req.files?.voice?.[0];

      if (!videoFile) {
        return res.status(400).json({
          success: false,
          error: "Video missing",
        });
      }

      videoPath =
        videoFile.path;

      if (voiceFile) {
        voicePath =
          voiceFile.path;
      }

      const rawAudioUrl =
        req.body.audioUrl;

      const hasMusic =
        typeof rawAudioUrl === "string" &&
        rawAudioUrl.trim() !== "";

      // Client sends the exact recorded video duration so the final mix
      // can never keep music running beyond the video.
      const rawRequestedDuration = Number(req.body.videoDuration);
      // Reel max 60 sec. Thoda tolerance (61s) taaki 60.04s jaise
      // clips skip na ho; output hamesha 60s par clamp hota hai.
      const hasRequestedVideoDuration =
        Number.isFinite(rawRequestedDuration) &&
        rawRequestedDuration > 0 &&
        rawRequestedDuration <= 61;
      const requestedVideoDuration = Math.min(rawRequestedDuration, 60);

      const hasVoice =
        Boolean(voicePath);

      const subtitleText =
        typeof req.body.subtitleText === "string"
          ? req.body.subtitleText.trim()
          : "";

      const hasSubtitle =
        subtitleText.length > 0;

      if (hasSubtitle) {
        const tempDir = path.join(__dirname, "temp");
        await fsp.mkdir(tempDir, { recursive: true });
        const subtitleId = crypto.randomUUID();
        subtitlePath = path.join(tempDir, `${subtitleId}.ass`);

        const subtitleColor = safeSubtitleColor(req.body.subtitleColor);
        const xRatio = safeRatio(req.body.subtitleXRatio, 0.10);
        const yRatio = safeRatio(req.body.subtitleYRatio, 0.50);
        const sizeRatio = safeSizeRatio(req.body.subtitleSizeRatio);

        // Read the ACTUAL uploaded video's resolution instead of assuming
        // every reel is 1080x1920. This keeps subtitle placement correct
        // no matter what size/aspect ratio the user recorded or uploaded.
        const videoDims = await getVideoDimensions(videoPath);
        const playResX = videoDims.width || 1080;
        const playResY = videoDims.height || 1920;

        const x = Math.round(playResX * xRatio);
        const y = Math.round(playResY * yRatio);
        const fontSize = Math.max(12, Math.round(playResY * sizeRatio));
        const assColor = hexToAssColor(subtitleColor);
        const assText = assEscapeText(subtitleText);

        const assContent =
          `[Script Info]\n` +
          `ScriptType: v4.00+\n` +
          `PlayResX: ${playResX}\n` +
          `PlayResY: ${playResY}\n` +
          `ScaledBorderAndShadow: yes\n\n` +
          `[V4+ Styles]\n` +
          `Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n` +
          `Style: TopKing,DejaVu Sans,${fontSize},${assColor},${assColor},&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,2,7,0,0,0,1\n\n` +
          `[Events]\n` +
          `Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` +
          `Dialogue: 0,0:00:00.00,9:59:59.00,TopKing,,0,0,0,,{\\pos(${x},${y})}${assText}\n`;

        await fsp.writeFile(subtitlePath, assContent, "utf8");
      }

      const videoEffect =
        safeVideoEffect(
          req.body.videoEffect
        );

      const hasEffect =
        videoEffect !== "none";

      if (
        !hasMusic &&
        !hasVoice &&
        !hasSubtitle &&
        !hasEffect
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Nothing to process",
        });
      }

      // -------------------------------------------------
      // DOWNLOAD MUSIC
      // -------------------------------------------------

      if (hasMusic) {

        const audioUrl =
          await validateExternalAudioUrl(
            rawAudioUrl
          );

        const tempDir =
          path.join(
            __dirname,
            "temp"
          );

        await fsp.mkdir(
          tempDir,
          {
            recursive: true,
          }
        );

        const fileId =
          crypto.randomUUID();

        musicPath =
          path.join(
            tempDir,
            `${fileId}.mp3`
          );

        const audioResponse =
          await axios({
            url: audioUrl,
            method: "GET",
            responseType: "stream",
            timeout: 120000,
            maxContentLength:
              50 * 1024 * 1024,
            maxBodyLength:
              50 * 1024 * 1024,
            validateStatus:
              (status) =>
                status >= 200 &&
                status < 300,
          });

        await new Promise(
          (resolve, reject) => {

            const writer =
              fs.createWriteStream(
                musicPath
              );

            let totalBytes = 0;

            audioResponse.data.on(
              "data",
              (chunk) => {

                totalBytes +=
                  chunk.length;

                if (
                  totalBytes >
                  50 * 1024 * 1024
                ) {
                  audioResponse.data.destroy(
                    new Error(
                      "Audio file too large"
                    )
                  );
                }

              }
            );

            audioResponse.data.pipe(
              writer
            );

            writer.on(
              "finish",
              resolve
            );

            writer.on(
              "error",
              reject
            );

            audioResponse.data.on(
              "error",
              reject
            );

          }
        );
      }

      const tempDir =
        path.join(
          __dirname,
          "temp"
        );

      await fsp.mkdir(
        tempDir,
        {
          recursive: true,
        }
      );

      const fileId =
        crypto.randomUUID();

      outputPath =
        path.join(
          tempDir,
          `${fileId}.mp4`
        );

      // -------------------------------------------------
      // BUILD FFMPEG COMMAND (DIRECT SPAWN)
      // -------------------------------------------------
      // Do not use fluent-ffmpeg for filter_complex here.
      // Direct argv prevents fluent-ffmpeg from escaping filter
      // characters such as ':' and '*'.

      const escapeFilterPath = (value) =>
        String(value)
          .replace(/\\/g, "\\\\")
          .replace(/'/g, "\\'")
          .replace(/:/g, "\\:");

      const filterParts = [];
      let videoMap = "0:v:0";
      let audioMap = "0:a?";

      // Visual processing is always applied to the video stream.
      // Subtitle uses libass/subtitles because Render's FFmpeg has
      // libass enabled but does not provide drawtext.
      if (hasEffect || hasSubtitle) {
        const visualFilters = [];

        if (videoEffect === "vivid") {
          visualFilters.push("eq=saturation=1.35:contrast=1.08");
        } else if (videoEffect === "soft") {
          visualFilters.push("eq=saturation=0.85:contrast=0.95:brightness=0.03");
        } else if (videoEffect === "bw") {
          visualFilters.push("hue=s=0");
        } else if (FILTER_LIBRARY.get(videoEffect)) {
          visualFilters.push(
            ...FILTER_LIBRARY.toFfmpegChain(FILTER_LIBRARY.get(videoEffect))
          );
        }

        if (hasSubtitle && subtitlePath) {
          visualFilters.push(`subtitles=${escapeFilterPath(subtitlePath)}`);
        }

        // Use -vf for video-only visual processing. This avoids an
        // unnecessary filter_complex graph when there is no audio mix.
        if (visualFilters.length > 0 && !hasMusic && !hasVoice) {
          filterParts.push({ type: "video", value: visualFilters.join(",") });
        } else if (visualFilters.length > 0) {
          filterParts.push({ type: "video", value: visualFilters.join(",") });
        }
      }

      if (hasMusic && hasVoice) {
        filterParts.push({
          type: "complex",
          value:
            `[1:a:0]asetpts=N/SR/TB[music];` +
            `[2:a:0]apad[voice];` +
            `[music][voice]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
        });
        audioMap = "[aout]";
      } else if (hasMusic) {
        filterParts.push({
          type: "complex",
          value: `[1:a:0]asetpts=N/SR/TB[aout]`,
        });
        audioMap = "[aout]";
      } else if (hasVoice) {
        filterParts.push({
          type: "complex",
          value: `[1:a:0]apad[aout]`,
        });
        audioMap = "[aout]";
      }

      const ffmpegArgs = ["-y", "-i", videoPath];

      if (hasMusic) {
        ffmpegArgs.push("-i", musicPath);
      }

      if (hasVoice) {
        ffmpegArgs.push("-i", voicePath);
      }

      const visual = filterParts.find((x) => x.type === "video");
      const complex = filterParts
        .filter((x) => x.type === "complex")
        .map((x) => x.value);

      if (visual && complex.length === 0) {
        // Simple video filter path: no filter_complex at all.
        ffmpegArgs.push("-vf", visual.value);
      } else if (visual && complex.length > 0) {
        // Build one graph connecting the input video to the filtered
        // output and keep audio processing in the same graph.
        ffmpegArgs.push(
          "-filter_complex",
          `[0:v:0]${visual.value}[vout];${complex.join(";")}`
        );
        videoMap = "[vout]";
      } else if (complex.length > 0) {
        ffmpegArgs.push("-filter_complex", complex.join(";"));
      }

      ffmpegArgs.push(
        "-map", videoMap,
        "-map", audioMap,
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-shortest"
      );

      // Hard cap the output to the recorded video duration. This is the
      // final safety net for selected music longer than the recorded clip.
      if (hasRequestedVideoDuration) {
        ffmpegArgs.push("-t", requestedVideoDuration.toFixed(3));
      }

      if (hasSubtitle || hasEffect) {
        // Visual edits require video re-encoding. Use ultrafast on Render
        // to minimize CPU time; CRF keeps quality reasonable.
        ffmpegArgs.push(
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-crf", "24",
          "-pix_fmt", "yuv420p",
          "-threads", "0"
        );
      } else {
        // Music/voice-only edits do NOT need video re-encoding.
        // Copying the video stream is dramatically faster.
        ffmpegArgs.push("-c:v", "copy");
      }

      // CRITICAL: FFmpeg must receive the output filename as the final
      // positional argument. Without this it exits with:
      // "At least one output file must be specified".
      ffmpegArgs.push(outputPath);

      console.log("FFMPEG MODE:", {
        subtitle: hasSubtitle,
        music: hasMusic,
        voice: hasVoice,
        effect: videoEffect,
        output: outputPath,
      });
      console.log("FFMPEG ARGS:", ffmpegArgs);

      await new Promise((resolve, reject) => {
        const child = spawn(ffmpegPath, ffmpegArgs, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stderr = "";
        let stdout = "";

        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
          if (stdout.length > 12000) {
            stdout = stdout.slice(-12000);
          }
        });

        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
          if (stderr.length > 30000) {
            stderr = stderr.slice(-30000);
          }
        });

        child.on("error", reject);

        child.on("close", (code) => {
          if (code === 0) {
            return resolve();
          }

          const error = new Error(
            `ffmpeg exited with code ${code}: ${stderr || stdout || "unknown ffmpeg error"}`
          );
          error.code = code;
          reject(error);
        });
      });

      if (
        !fs.existsSync(
          outputPath
        )
      ) {
        throw new Error(
          "Processed video was not created"
        );
      }

      // Final output 100MB se bada ho to ~75MB tak compress karo
      outputPath = await compressVideoIfTooLarge(outputPath);

      // -------------------------------------------------
      // THUMBNAIL
      // -------------------------------------------------

      const thumbnailFileName =
        `${fileId}.jpg`;

      thumbnailPath =
        path.join(
          tempDir,
          thumbnailFileName
        );

      await new Promise(
        (resolve, reject) => {

          ffmpeg(outputPath)
            .screenshots({
              timestamps: ["10%"],
              filename:
                thumbnailFileName,
              folder:
                tempDir,
              size:
                "480x?",
            })
            .on(
              "end",
              resolve
            )
            .on(
              "error",
              reject
            );

        }
      );

      if (
        !fs.existsSync(
          thumbnailPath
        )
      ) {
        throw new Error(
          "Thumbnail creation failed"
        );
      }

      // -------------------------------------------------
      // R2 UPLOAD
      // -------------------------------------------------

      const videoFileName =
        `${crypto.randomUUID()}.mp4`;

      // Video aur thumbnail EK SAATH upload (pehle ek-ek karke hota tha).
      await Promise.all([
        r2.send(
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: videoFileName,
            Body: fs.createReadStream(outputPath),
            ContentType: "video/mp4",
            CacheControl: "public, max-age=31536000, immutable",
          })
        ),
        r2.send(
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: thumbnailFileName,
            Body: fs.createReadStream(thumbnailPath),
            ContentType: "image/jpeg",
            CacheControl: "public, max-age=31536000, immutable",
          })
        ),
      ]);

      const videoUrl =
        `${process.env.R2_PUBLIC_URL}/${videoFileName}`;

      const thumbnailUrl =
        `${process.env.R2_PUBLIC_URL}/${thumbnailFileName}`;

      return res.json({
        success: true,
        video:
          videoUrl,
        videoUrl,
        thumbnailUrl,
      });

    } catch (e) {

      console.error(
        "VIDEO PROCESS ERROR:",
        e.message
      );

      return res.status(500).json({
        success: false,
        error:
          "Video processing failed",
      });

    } finally {

      await cleanupFile(
        videoPath
      );

      await cleanupFile(
        voicePath
      );

      await cleanupFile(
        musicPath
      );

      await cleanupFile(
        outputPath
      );

      await cleanupFile(
        thumbnailPath
      );

      await cleanupFile(
        subtitlePath
      );

    }

  }

);


// =====================================================
// UPLOAD VIDEO
// =====================================================

app.post(

  "/upload-video",

  uploadLimiter,

  verifyUser,

  upload.single("video"),

  async (req, res) => {

    let videoPath = null;

    let thumbnailPath = null;

    let userRef = null;

    let lockEnabled = false;


    try {

      const uid =
        req.user.uid;


      userRef =
        db
          .collection("users")
          .doc(uid);


      const userSnap =
        await userRef.get();


      if (!userSnap.exists) {

        return res.status(404).json({

          success: false,

          error: "User not found",

        });

      }


      const userData =
        userSnap.data();


      if (
        userData.uploadStatus === true
      ) {

        return res.status(409).json({

          success: false,

          error:
            "Another upload is already in progress",

        });

      }


      if (!req.file) {

        return res.status(400).json({

          success: false,

          error: "Video missing",

        });

      }


      await userRef.update({

        uploadStatus: true,

      });


      lockEnabled = true;


      videoPath =
        req.file.path;

      // 100MB se bada ho to ~75MB tak compress karo
      videoPath = await compressVideoIfTooLarge(videoPath);


      const fileId =
        crypto.randomUUID();


      const videoFileName =
        `${fileId}.mp4`;


      const thumbnailFileName =
        `${fileId}.jpg`;


      const tempDir =
        path.join(
          __dirname,
          "temp"
        );


      await fsp.mkdir(
        tempDir,
        {
          recursive: true,
        }
      );


      thumbnailPath =
        path.join(
          tempDir,
          thumbnailFileName
        );


      // -------------------------------------------------
      // UPLOAD VIDEO
      // -------------------------------------------------

      await r2.send(

        new PutObjectCommand({

          Bucket:
            process.env.R2_BUCKET,

          Key:
            videoFileName,

          Body:
            fs.createReadStream(
              videoPath
            ),

          ContentType:
            "video/mp4",

        })

      );


      const videoUrl =
        `${process.env.R2_PUBLIC_URL}/${videoFileName}`;


      // -------------------------------------------------
      // THUMBNAIL
      // -------------------------------------------------

      await new Promise(
        (resolve, reject) => {

          ffmpeg(videoPath)

            .screenshots({

              timestamps: ["1"],

              filename:
                thumbnailFileName,

              folder:
                tempDir,

              size:
                "480x?",

            })

            .on(
              "end",
              resolve
            )

            .on(
              "error",
              reject
            );

        }
      );


      if (
        !fs.existsSync(
          thumbnailPath
        )
      ) {

        throw new Error(
          "Thumbnail creation failed"
        );

      }


      await r2.send(

        new PutObjectCommand({

          Bucket:
            process.env.R2_BUCKET,

          Key:
            thumbnailFileName,

          Body:
            fs.createReadStream(
              thumbnailPath
            ),

          ContentType:
            "image/jpeg",

        })

      );


      const thumbnailUrl =
        `${process.env.R2_PUBLIC_URL}/${thumbnailFileName}`;


      return res.json({

        success: true,

        videoUrl,

        thumbnailUrl,

      });


    } catch (e) {

      console.error(
        "UPLOAD ERROR:",
        e.message
      );


      return res.status(500).json({

        success: false,

        error:
          "Video upload failed",

      });


    } finally {

      if (
        userRef &&
        lockEnabled
      ) {

        try {

          await userRef.update({

            uploadStatus: false,

          });

        } catch (_) {}

      }


      await cleanupFile(
        videoPath
      );

      await cleanupFile(
        thumbnailPath
      );

    }

  }

);


// =====================================================
// SEND MESSAGE NOTIFICATION
// =====================================================

app.post(

  "/send-message-notification",

  notificationLimiter,

  verifyUser,

  async (req, res) => {

    try {

      const {

        receiverUid,

        message,

      } = req.body;


      const senderUid =
        req.user.uid;


      // Sender is NEVER accepted from client.


      if (
        !isValidUid(receiverUid)
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Invalid receiver",

        });

      }


      if (
        receiverUid === senderUid
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Cannot send notification to yourself",

        });

      }


      if (
        !isValidMessage(message)
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Invalid message",

        });

      }


      // Get sender name from trusted database
      // instead of trusting senderName from client.

      const senderSnap =
        await db
          .collection("users")
          .doc(senderUid)
          .get();


      let senderName = "Someone";
      let senderImg = "";

      if (senderSnap.exists) {

        const senderData = senderSnap.data();

        const nm =
          (typeof senderData.name === "string" && senderData.name.trim()) ||
          (typeof senderData.username === "string" && senderData.username.trim()) ||
          "";

        if (nm && nm.length <= 100) {
          senderName = nm;
        }

        if (
          typeof senderData.profileImg === "string" &&
          senderData.profileImg.length < 400
        ) {
          senderImg = senderData.profileImg;
        }

      }

      // Response turant do, push peeche se jaye (chat ko slow na kare)
      res.json({
        success: true,
      });

      sendPushNotification(
        receiverUid,
        senderUid,
        senderName + " ne message kiya",
        message,
        { senderName, senderImg }
      ).catch((e) =>
        console.error("PUSH SEND ERROR:", e.message)
      );

      return;

    } catch (e) {

      console.error(
        "NOTIFICATION ERROR:",
        e.message
      );

      return res.status(500).json({
        success: false,
        error: "Notification failed",
      });

    }

  }

);


// =====================================================
// FILE CLEANUP
// =====================================================

async function cleanupFile(
  filePath
) {

  if (!filePath) {
    return;
  }


  try {

    await fsp.unlink(
      filePath
    );

  } catch (e) {

    if (e.code !== "ENOENT") {

      console.error(
        "FILE CLEANUP ERROR:",
        e.message
      );

    }

  }

}


// =====================================================
// HEALTH CHECK
// =====================================================

app.get(
  "/health",
  (req, res) => {

    res.json({
      success: true,
      status: "ok",
    });

  }
);


// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

app.use(
  (
    err,
    req,
    res,
    next
  ) => {

    console.error(
      "GLOBAL ERROR:",
      err.message
    );


    if (
      err &&
      err.message ===
        "Only MP4 and MOV videos are allowed"
    ) {

      return res.status(400).json({

        success: false,

        error:
          "Only MP4 and MOV videos are allowed",

      });

    }


    if (
      err &&
      err.code ===
        "LIMIT_FILE_SIZE"
    ) {

      return res.status(413).json({

        success: false,

        error:
          "Video size must be less than 250MB",

      });

    }


    if (
      err &&
      err.message ===
        "CORS origin not allowed"
    ) {

      return res.status(403).json({

        success: false,

        error:
          "Origin not allowed",

      });

    }


    return res.status(500).json({

      success: false,

      error:
        "Internal server error",

    });

  }

);


// =====================================================
// MONTHLY AGENCY RESET
// =====================================================

async function resetAgencyMonthlyStars() {

  try {

    const agenciesSnap =
      await db
        .collection("agencies")
        .get();


    if (
      agenciesSnap.empty
    ) {

      return;
    }


    const batch =
      db.batch();


    agenciesSnap.forEach(
      (agencyDoc) => {

        batch.update(
          agencyDoc.ref,
          {
            monthlyStars: 0,
          }
        );

      }
    );


    await batch.commit();


    console.log(
      "Monthly agency reset completed"
    );


  } catch (e) {

    console.error(
      "AGENCY RESET ERROR:",
      e.message
    );

  }

}


// =====================================================
// CRON
// =====================================================

cron.schedule(

  "0 0 1 * *",

  async () => {

    await resetAgencyMonthlyStars();

  },

  {
    timezone:
      process.env.TZ ||
      "Asia/Kolkata",
  }

);



// =====================================================
// STORY MEDIA (photo / video) -> R2
// =====================================================

const STORY_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

const STORY_MIME_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
};

const storyUpload = multer({
  dest: path.join(__dirname, "uploads"),
  limits: { fileSize: 60 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (STORY_TYPES[ext] || STORY_MIME_EXT[file.mimetype]) return cb(null, true);
    return cb(new Error("Only JPG, PNG, WEBP, MP4 and MOV are allowed"));
  },
});

app.post(
  "/upload-story",
  uploadLimiter,
  verifyUser,
  storyUpload.single("media"),
  async (req, res) => {
    const file = req.file;
    try {
      if (!file) {
        return res.status(400).json({ success: false, error: "No file" });
      }

      const uid = req.user.uid;
      let ext = path.extname(file.originalname || "").toLowerCase();
      if (!STORY_TYPES[ext]) ext = STORY_MIME_EXT[file.mimetype] || ".jpg";
      const key = `stories/${uid}/${crypto.randomUUID()}${ext}`;

      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
          Body: fs.createReadStream(file.path),
          ContentType: STORY_TYPES[ext],
        })
      );

      return res.json({
        success: true,
        key,
        mediaUrl: `${process.env.R2_PUBLIC_URL}/${key}`,
        mediaType: STORY_TYPES[ext].startsWith("video") ? "video" : "image",
      });
    } catch (e) {
      console.error("STORY UPLOAD ERROR:", e);
      return res.status(500).json({ success: false, error: "Story upload failed" });
    } finally {
      if (file && file.path) fsp.unlink(file.path).catch(() => {});
    }
  }
);

app.post(
  "/delete-story-media",
  uploadLimiter,
  verifyUser,
  async (req, res) => {
    try {
      const key = req.body && req.body.key;
      const uid = req.user.uid;

      if (
        typeof key !== "string" ||
        !key.startsWith(`stories/${uid}/`) ||
        key.includes("..")
      ) {
        return res.status(400).json({ success: false, error: "Invalid key" });
      }

      await r2.send(
        new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key })
      );
      return res.json({ success: true });
    } catch (e) {
      console.error("STORY DELETE ERROR:", e);
      return res.status(500).json({ success: false, error: "Delete failed" });
    }
  }
);

// =====================================================
// ADMIN: USER KO STARS DENA (username search se)
// =====================================================

async function isAdminUser(decoded) {
  if (decoded && decoded.admin === true) return true;
  try {
    const snap = await db.collection("admins").doc(decoded.uid).get();
    return snap.exists && snap.data().role === "admin";
  } catch (_) {
    return false;
  }
}

async function requireAdminDoc(req, res, next) {
  if (await isAdminUser(req.user)) return next();
  console.warn(
    `ADMIN DENIED: uid=${req.user && req.user.uid} ${req.method} ${req.path} (admins/${req.user && req.user.uid} doc me role:"admin" nahi hai)`
  );
  return res.status(403).json({ success: false, error: "Admin access required" });
}

function starsToLevel(stars) {
  const t = [
    [499000, 50], [440000, 49], [385000, 48], [310000, 47], [299000, 46],
    [260000, 45], [210000, 44], [189000, 43], [155000, 42], [125000, 41],
    [110000, 40], [101000, 39], [99000, 38], [89000, 37], [78000, 36],
    [67000, 35], [51000, 34], [43000, 33], [31000, 32], [26000, 31],
    [23000, 30], [19000, 29], [17000, 28], [14000, 27], [12300, 26],
    [9000, 24], [8200, 23], [7200, 22], [6100, 21], [5050, 20],
    [4000, 19], [3500, 18], [2800, 17], [2400, 16], [1900, 15],
    [1600, 14], [1300, 13], [1150, 12], [1000, 11], [870, 10],
    [670, 9], [540, 8], [360, 7], [280, 6], [200, 5], [160, 4],
    [100, 3], [60, 2], [10, 1],
  ];
  for (const [min, lvl] of t) if (stars >= min) return lvl;
  return 0;
}

// ADMIN: kisi user ke wallet me Stars add karo
// body: { uid, stars, amount (rupees mile, optional), note (optional) }
app.post("/admin/add-stars", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const uid = String((req.body && req.body.uid) || "");
    const stars = Math.floor(Number(req.body && req.body.stars));
    const rawAmount = Number(req.body && req.body.amount);
    const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? Math.min(rawAmount, 10000000) : 0;
    const note = String((req.body && req.body.note) || "").slice(0, 200);

    // optional manual level (0-50). Na bheje to stars se auto lagega
    let manualLevel = null;
    if (req.body && req.body.level !== undefined && req.body.level !== null && req.body.level !== "") {
      manualLevel = Math.floor(Number(req.body.level));
      if (!Number.isFinite(manualLevel) || manualLevel < 0 || manualLevel > 50) {
        return res.status(400).json({ success: false, error: "Invalid level" });
      }
    }

    if (!isValidUid(uid)) {
      return res.status(400).json({ success: false, error: "Invalid user" });
    }
    if (!Number.isFinite(stars) || stars < 1 || stars > 10000000) {
      return res.status(400).json({ success: false, error: "Invalid stars" });
    }

    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const walletRef = db.collection("wallets").doc(uid);

    const result = await db.runTransaction(async (tx) => {
      const wSnap = await tx.get(walletRef);
      const oldStars = wSnap.exists ? Number(wSnap.data().stars || 0) : 0;
      const total = oldStars + stars;
      const level = manualLevel === null ? starsToLevel(total) : manualLevel;

      if (wSnap.exists) {
        tx.update(walletRef, { stars: total, level });
      } else {
        tx.set(walletRef, { stars: total, level, earnings: 0, receivedStars: 0 });
      }

      // user ki wallet History me dikhega
      tx.set(walletRef.collection("purchaseHistory").doc(), {
        stars,
        amount,
        paymentId: "ADMIN",
        status: "Completed",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // admin ka record (kisne, kisko, kitna diya)
      tx.set(db.collection("starGrants").doc(), {
        userId: uid,
        username: userSnap.data().username || "",
        stars,
        amount,
        level,
        note,
        adminId: req.user.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { oldStars, total, level };
    });

    return res.json({ success: true, ...result });
  } catch (e) {
    console.error("ADD STARS ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// ADMIN: kisi user ko Verified tick do / hatao
// body: { uid, verified: true|false, color: "white" | "yellow" }
const VERIFIED_COLORS = ["white", "yellow"];
app.post("/admin/set-verified", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const uid = String((req.body && req.body.uid) || "");
    const verified = !!(req.body && req.body.verified);
    const color = String((req.body && req.body.color) || "white");

    if (!isValidUid(uid)) {
      return res.status(400).json({ success: false, error: "Invalid user" });
    }
    if (verified && !VERIFIED_COLORS.includes(color)) {
      return res.status(400).json({ success: false, error: "Invalid verified type" });
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    await userRef.update(
      verified
        ? { verified: true, verifiedColor: color }
        : { verified: false, verifiedColor: admin.firestore.FieldValue.delete() }
    );

    await db.collection("verifiedGrants").add({
      userId: uid,
      username: userSnap.data().username || "",
      verified,
      color: verified ? color : null,
      adminId: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ success: true, verified, color: verified ? color : null });
  } catch (e) {
    console.error("SET VERIFIED ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// =====================================================
// ADMIN: VIDEO / USER DELETE + BAN / UNBAN
// =====================================================

// R2 public URL se object key nikalo (videoUrl / thumbnailUrl -> key)
function r2KeyFromUrl(url) {
  if (typeof url !== "string" || !url) return null;
  const base = String(process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!base || !url.startsWith(base + "/")) return null;
  let key = url.slice(base.length + 1).split("?")[0];
  try { key = decodeURIComponent(key); } catch (_) {}
  if (!key || key.includes("..")) return null;
  return key;
}

async function deleteR2Key(key) {
  if (!key) return;
  try {
    await r2.send(
      new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key })
    );
  } catch (e) {
    console.error("R2 DELETE ERROR:", key, e.message);
  }
}

// Ek video ka poora data hatao: R2 files + comments + doc
async function deleteVideoCompletely(videoId) {
  const ref = db.collection("all_videos").doc(videoId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const data = snap.data() || {};

  const urls = [data.videoUrl, data.video, data.thumbnailUrl, data.thumbnail];
  for (const u of urls) await deleteR2Key(r2KeyFromUrl(u));

  try {
    await db.recursiveDelete(ref); // comments / likes subcollections ke saath
  } catch (e) {
    console.error("RECURSIVE DELETE ERROR:", e.message);
    await ref.delete();
  }
  return true;
}

app.post(
  "/admin/delete-video",
  generalLimiter,
  verifyUser,
  requireAdminDoc,
  async (req, res) => {
    try {
      const videoId = String((req.body && req.body.videoId) || "");
      console.log(`ADMIN DELETE VIDEO start: admin=${req.user.uid} videoId=${videoId} body=${JSON.stringify(req.body)}`);
      if (!isValidUid(videoId)) {
        console.warn("ADMIN DELETE VIDEO: invalid videoId");
        return res.status(400).json({ success: false, error: "Invalid video" });
      }
      const ok = await deleteVideoCompletely(videoId);
      if (!ok) {
        console.warn("ADMIN DELETE VIDEO: video doc not found", videoId);
        return res.status(404).json({ success: false, error: "Video not found" });
      }
      console.log("ADMIN DELETE VIDEO done:", videoId);
      return res.json({ success: true });
    } catch (e) {
      console.error("ADMIN DELETE VIDEO ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  }
);

app.post(
  "/admin/delete-user",
  generalLimiter,
  verifyUser,
  requireAdminDoc,
  async (req, res) => {
    try {
      const uid = String((req.body && req.body.uid) || "");
      console.log(`ADMIN DELETE USER start: admin=${req.user.uid} uid=${uid}`);
      if (!isValidUid(uid)) {
        console.warn("ADMIN DELETE USER: invalid uid");
        return res.status(400).json({ success: false, error: "Invalid user" });
      }
      if (uid === req.user.uid) {
        console.warn("ADMIN DELETE USER: self delete blocked");
        return res
          .status(400)
          .json({ success: false, error: "Apna khud ka ID delete nahi kar sakte" });
      }
      const targetAdmin = await db.collection("admins").doc(uid).get();
      if (targetAdmin.exists) {
        return res
          .status(400)
          .json({ success: false, error: "Admin ID delete nahi ho sakta" });
      }

      // 1) User ke saare videos
      const vids = await db.collection("all_videos").where("userId", "==", uid).get();
      for (const d of vids.docs) {
        try { await deleteVideoCompletely(d.id); } catch (e) {
          console.error("USER VIDEO DELETE ERROR:", d.id, e.message);
        }
      }

      // 2) User ki stories (R2 media + doc)
      const stories = await db.collection("stories").where("userId", "==", uid).get();
      for (const d of stories.docs) {
        const s = d.data() || {};
        const key =
          typeof s.storagePath === "string" && s.storagePath.startsWith(`stories/${uid}/`)
            ? s.storagePath
            : r2KeyFromUrl(s.mediaUrl);
        await deleteR2Key(key);
        await d.ref.delete().catch(() => {});
      }

      // 3) Profile + wallet + baaki user docs
      await db.recursiveDelete(db.collection("users").doc(uid)).catch(async () => {
        await db.collection("users").doc(uid).delete();
      });
      await db.recursiveDelete(db.collection("wallets").doc(uid)).catch(() => {});
      await db.collection("userChats").doc(uid).delete().catch(() => {});

      // 4) Login (Firebase Auth) delete
      try {
        await admin.auth().deleteUser(uid);
      } catch (e) {
        if (e.code !== "auth/user-not-found") throw e;
      }

      console.log("ADMIN DELETE USER done:", uid);
      return res.json({ success: true });
    } catch (e) {
      console.error("ADMIN DELETE USER ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  }
);

async function setUserBan(req, res, ban) {
  try {
    const uid = String((req.body && req.body.uid) || "");
    if (!isValidUid(uid)) {
      return res.status(400).json({ success: false, error: "Invalid user" });
    }
    if (ban && uid === req.user.uid) {
      return res
        .status(400)
        .json({ success: false, error: "Apne aap ko ban nahi kar sakte" });
    }
    await admin.auth().updateUser(uid, { disabled: ban });
    if (ban) await admin.auth().revokeRefreshTokens(uid);
    await db.collection("users").doc(uid).set({ banned: ban }, { merge: true });
    return res.json({ success: true });
  } catch (e) {
    console.error("ADMIN BAN ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

app.post("/admin/ban-user", generalLimiter, verifyUser, requireAdminDoc, (req, res) =>
  setUserBan(req, res, true)
);
app.post("/admin/unban-user", generalLimiter, verifyUser, requireAdminDoc, (req, res) =>
  setUserBan(req, res, false)
);

// =====================================================
// BD (Business Development) SYSTEM
// - Admin kisi user ko BD bana sakta hai (bds/{uid} doc + users/{uid}.isBD)
// - BD sirf apni banayi hui agencies (bdUserId == BD ka uid) manage kar sakta hai
// - Saari checks server par hoti hain, client ke isBD flag par bharosa nahi
// =====================================================

async function requireBD(req, res, next) {
  try {
    const snap = await db.collection("bds").doc(req.user.uid).get();
    if (snap.exists && snap.data().active !== false) return next();
  } catch (_) {}
  return res.status(403).json({ success: false, error: "BD access required" });
}

function cleanText(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

function cleanLogo(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s) return "";
  if (s.length > 600 || !/^https:\/\//i.test(s)) return null; // invalid
  return s;
}

function agencyPublic(id, d) {
  return {
    id,
    agencyName: d.agencyName || "",
    ownerName: d.ownerName || "",
    ownerUsername: d.ownerUsername || "",
    ownerUserId: d.ownerUserId || "",
    logo: d.logo || d.agencyLogo || "",
    totalMembers: d.totalMembers || 0,
    totalStars: d.totalStars || 0,
    status: d.status || "active",
  };
}

// agency BD ki apni hai ya nahi
async function loadOwnAgency(req, res) {
  const agencyId = String((req.body && req.body.agencyId) || "");
  if (!isValidUid(agencyId)) {
    res.status(400).json({ success: false, error: "Invalid agency" });
    return null;
  }
  const ref = db.collection("agencies").doc(agencyId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().bdUserId !== req.user.uid) {
    res.status(404).json({ success: false, error: "Agency not found" });
    return null;
  }
  return { ref, data: snap.data(), id: agencyId };
}

// ---------- ADMIN: BD manage ----------

// body: { username }
app.post("/admin/add-bd", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const username = cleanText(req.body && req.body.username, 80);
    if (!username) {
      return res.status(400).json({ success: false, error: "Username daalo" });
    }
    const q = await db.collection("users").where("username", "==", username).limit(1).get();
    if (q.empty) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    const userDoc = q.docs[0];
    const u = userDoc.data();
    const uid = userDoc.id;

    const existing = await db.collection("bds").doc(uid).get();
    if (existing.exists && existing.data().active !== false) {
      return res.status(400).json({ success: false, error: "Ye user pehle se BD hai" });
    }

    await db.collection("bds").doc(uid).set(
      {
        uid,
        username: u.username || username,
        profileImg: u.profileImg || "",
        active: true,
        addedBy: req.user.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await db.collection("users").doc(uid).set({ isBD: true }, { merge: true });

    return res.json({ success: true, uid });
  } catch (e) {
    console.error("ADMIN ADD BD ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// body: { uid }
app.post("/admin/remove-bd", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const uid = String((req.body && req.body.uid) || "");
    if (!isValidUid(uid)) {
      return res.status(400).json({ success: false, error: "Invalid user" });
    }
    await db.collection("bds").doc(uid).delete();
    await db.collection("users").doc(uid).set({ isBD: false }, { merge: true });
    return res.json({ success: true });
  } catch (e) {
    console.error("ADMIN REMOVE BD ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

app.post("/admin/list-bds", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const snap = await db.collection("bds").get();
    const bds = await Promise.all(
      snap.docs.map(async (d) => {
        const ag = await db.collection("agencies").where("bdUserId", "==", d.id).get();
        const x = d.data();
        return {
          uid: d.id,
          username: x.username || "",
          profileImg: x.profileImg || "",
          agencyCount: ag.size,
        };
      })
    );
    bds.sort((a, b) => a.username.localeCompare(b.username));
    return res.json({ success: true, bds });
  } catch (e) {
    console.error("ADMIN LIST BDS ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// =====================================================
// ADMIN SPECIAL FRAMES
// - Admin kisi bhi user ko special frame de sakta hai (users/{uid}.adminFrame)
// - Ye purane level/agency/BD frames se alag hai, unhe nahi chhedta
// =====================================================
const ADMIN_FRAME_KEYS = ["gold_heart", "bd_helmet", "agency_ref", "agency_wings", "tk_team"];

function userBrief(id, d) {
  return {
    uid: id,
    username: d.username || "",
    name: d.name || d.realName || "",
    profileImg: d.profileImg || "",
    level: d.level || 1,
    adminFrame: d.adminFrame || null,
  };
}

// body: { q }  -> username prefix search (max 15)
app.post("/admin/search-users", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const q = cleanText(req.body && req.body.q, 40).toLowerCase().replace(/^@/, "");
    if (q.length < 1) return res.json({ success: true, users: [] });
    const snap = await db
      .collection("users")
      .where("username", ">=", q)
      .where("username", "<=", q + "\uf8ff")
      .orderBy("username")
      .limit(15)
      .get();
    return res.json({ success: true, users: snap.docs.map((d) => userBrief(d.id, d.data())) });
  } catch (e) {
    console.error("ADMIN SEARCH USERS ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// body: { uid, frame }  frame = key ya null/"" (hatane ke liye)
app.post("/admin/set-user-frame", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const uid = String((req.body && req.body.uid) || "");
    const frame = req.body && req.body.frame ? String(req.body.frame) : null;
    if (!isValidUid(uid)) {
      return res.status(400).json({ success: false, error: "Invalid user" });
    }
    if (frame !== null && !ADMIN_FRAME_KEYS.includes(frame)) {
      return res.status(400).json({ success: false, error: "Invalid frame" });
    }
    const ref = db.collection("users").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    await ref.set(
      { adminFrame: frame === null ? admin.firestore.FieldValue.delete() : frame },
      { merge: true }
    );
    return res.json({ success: true, uid, frame });
  } catch (e) {
    console.error("ADMIN SET FRAME ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// jin users ko abhi admin frame mila hua hai
app.post("/admin/list-framed-users", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const snap = await db.collection("users").where("adminFrame", "in", ADMIN_FRAME_KEYS).limit(200).get();
    const users = snap.docs.map((d) => userBrief(d.id, d.data()));
    users.sort((a, b) => a.username.localeCompare(b.username));
    return res.json({ success: true, users });
  } catch (e) {
    console.error("ADMIN LIST FRAMED ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// ---------- BD: apni agencies ----------

app.post("/bd/my-agencies", generalLimiter, verifyUser, requireBD, async (req, res) => {
  try {
    const snap = await db.collection("agencies").where("bdUserId", "==", req.user.uid).get();
    const agencies = snap.docs
      .map((d) => agencyPublic(d.id, d.data()))
      .sort((a, b) => a.agencyName.localeCompare(b.agencyName));
    return res.json({ success: true, agencies });
  } catch (e) {
    console.error("BD MY AGENCIES ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// body: { agencyName, ownerName, ownerUsername, logo(https url, optional) }
app.post("/bd/create-agency", generalLimiter, verifyUser, requireBD, async (req, res) => {
  try {
    const agencyName = cleanText(req.body && req.body.agencyName, 80);
    const ownerName = cleanText(req.body && req.body.ownerName, 80);
    const ownerUsername = cleanText(req.body && req.body.ownerUsername, 80);
    const logo = cleanLogo(req.body && req.body.logo);

    if (!agencyName || !ownerName || !ownerUsername) {
      return res
        .status(400)
        .json({ success: false, error: "Agency name, owner name aur owner username zaroori hain" });
    }
    if (logo === null) {
      return res.status(400).json({ success: false, error: "Invalid logo" });
    }

    const q = await db.collection("users").where("username", "==", ownerUsername).limit(1).get();
    if (q.empty) {
      return res.status(404).json({ success: false, error: "Owner Username Not Found" });
    }
    const ownerDoc = q.docs[0];
    const ownerUserId = ownerDoc.id;

    if (ownerDoc.data().agencyId) {
      return res
        .status(400)
        .json({ success: false, error: "Ye user pehle se kisi agency me hai" });
    }

    const bdSnap = await db.collection("bds").doc(req.user.uid).get();
    const agencyRef = db.collection("agencies").doc();
    const batch = db.batch();
    batch.set(agencyRef, {
      agencyName,
      ownerName,
      ownerUsername,
      ownerUserId,
      logo,
      totalMembers: 0,
      totalStars: 0,
      status: "active",
      bdUserId: req.user.uid,
      bdUsername: (bdSnap.exists && bdSnap.data().username) || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(
      db.collection("users").doc(ownerUserId),
      {
        agencyId: agencyRef.id,
        agencyName,
        isAgencyOwner: true,
        agencyApproved: true,
      },
      { merge: true }
    );
    await batch.commit();

    return res.json({ success: true, agencyId: agencyRef.id });
  } catch (e) {
    console.error("BD CREATE AGENCY ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// body: { agencyId, agencyName, ownerName, logo }
app.post("/bd/update-agency", generalLimiter, verifyUser, requireBD, async (req, res) => {
  try {
    const own = await loadOwnAgency(req, res);
    if (!own) return;

    const agencyName = cleanText(req.body && req.body.agencyName, 80);
    const ownerName = cleanText(req.body && req.body.ownerName, 80);
    const logo = cleanLogo(req.body && req.body.logo);
    if (!agencyName || !ownerName) {
      return res
        .status(400)
        .json({ success: false, error: "Agency name aur owner name zaroori hain" });
    }
    if (logo === null) {
      return res.status(400).json({ success: false, error: "Invalid logo" });
    }

    await own.ref.update({ agencyName, ownerName, logo, agencyLogo: logo });
    return res.json({ success: true });
  } catch (e) {
    console.error("BD UPDATE AGENCY ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// body: { agencyId, block: true/false }
app.post("/bd/block-agency", generalLimiter, verifyUser, requireBD, async (req, res) => {
  try {
    const own = await loadOwnAgency(req, res);
    if (!own) return;
    const block = !!(req.body && req.body.block);
    await own.ref.update({ status: block ? "blocked" : "active" });
    return res.json({ success: true });
  } catch (e) {
    console.error("BD BLOCK AGENCY ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// body: { agencyId }  -> agency + owner + saare hosts ke agency fields saaf
app.post("/bd/delete-agency", generalLimiter, verifyUser, requireBD, async (req, res) => {
  try {
    const own = await loadOwnAgency(req, res);
    if (!own) return;

    const members = await db.collection("users").where("agencyId", "==", own.id).get();
    const clear = {
      agencyId: "",
      agencyName: "",
      agencyHost: false,
      isAgencyOwner: false,
      agencyApproved: false,
    };
    for (let i = 0; i < members.docs.length; i += 400) {
      const batch = db.batch();
      members.docs.slice(i, i + 400).forEach((m) => batch.set(m.ref, clear, { merge: true }));
      await batch.commit();
    }
    await own.ref.delete();
    return res.json({ success: true });
  } catch (e) {
    console.error("BD DELETE AGENCY ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// ADMIN: kisi bhi agency ko delete karo (BD ne banayi ho ya admin ne).
// body: { agencyId }  -> agency + owner + saare hosts ke agency fields saaf
app.post("/admin/delete-agency", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const agencyId = String((req.body && req.body.agencyId) || "");
    if (!isValidUid(agencyId)) {
      return res.status(400).json({ success: false, error: "Invalid agency" });
    }
    const ref = db.collection("agencies").doc(agencyId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, error: "Agency not found" });
    }

    const members = await db.collection("users").where("agencyId", "==", agencyId).get();
    const clear = {
      agencyId: "",
      agencyName: "",
      agencyHost: false,
      isAgencyOwner: false,
      agencyApproved: false,
    };
    for (let i = 0; i < members.docs.length; i += 400) {
      const batch = db.batch();
      members.docs.slice(i, i + 400).forEach((m) => batch.set(m.ref, clear, { merge: true }));
      await batch.commit();
    }
    await ref.delete();
    console.log(`ADMIN DELETE AGENCY: admin=${req.user.uid} agency=${agencyId} bd=${snap.data().bdUserId || "-"}`);
    return res.json({ success: true });
  } catch (e) {
    console.error("ADMIN DELETE AGENCY ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// ADMIN: kisi bhi agency se kisi bhi host/user ko hatao.
// body: { agencyId, userId }
app.post("/admin/remove-agency-host", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const agencyId = String((req.body && req.body.agencyId) || "");
    const userId = String((req.body && req.body.userId) || "");
    if (!isValidUid(agencyId) || !isValidUid(userId)) {
      return res.status(400).json({ success: false, error: "Invalid request" });
    }
    const agencyRef = db.collection("agencies").doc(agencyId);
    const userRef = db.collection("users").doc(userId);

    await db.runTransaction(async (tx) => {
      const [aSnap, uSnap] = await Promise.all([tx.get(agencyRef), tx.get(userRef)]);
      if (!aSnap.exists) throw Object.assign(new Error("Agency not found"), { code: 404 });
      if (!uSnap.exists) throw Object.assign(new Error("User not found"), { code: 404 });
      const u = uSnap.data();
      if (u.agencyId !== agencyId) {
        throw Object.assign(new Error("Ye user is agency me nahi hai"), { code: 400 });
      }
      if (aSnap.data().ownerUserId === userId) {
        throw Object.assign(new Error("Owner ko host ki tarah nahi hata sakte. Agency delete karo."), { code: 400 });
      }
      tx.set(
        userRef,
        { agencyId: "", agencyName: "", agencyHost: false },
        { merge: true }
      );
      const members = Math.max(0, (aSnap.data().totalMembers || 0) - 1);
      tx.update(agencyRef, { totalMembers: members });
    });

    console.log(`ADMIN REMOVE HOST: admin=${req.user.uid} agency=${agencyId} user=${userId}`);
    return res.json({ success: true });
  } catch (e) {
    if (e && e.code && Number.isInteger(e.code) && e.code >= 400 && e.code < 500) {
      return res.status(e.code).json({ success: false, error: e.message });
    }
    console.error("ADMIN REMOVE HOST ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// =====================================================
// OFFICIAL: BD hatao + Agency delete (admin panel jaisa hi)
// - Official ya admin dono kar sakte hain
// - Asli check yahin server par hota hai (users/{uid}.isOfficial === true)
// =====================================================
async function requireOfficialOrAdmin(req, res, next) {
  try {
    if (await isAdminUser(req.user)) return next();
    const snap = await db.collection("users").doc(req.user.uid).get();
    if (snap.exists && snap.data().isOfficial === true) return next();
  } catch (_) {}
  console.warn(`OFFICIAL DENIED: uid=${req.user && req.user.uid} ${req.method} ${req.path}`);
  return res.status(403).json({ success: false, error: "Official access required" });
}

// body: { uid }  -> BD access hatao (admin /admin/remove-bd jaisa)
app.post("/official/remove-bd", generalLimiter, verifyUser, requireOfficialOrAdmin, async (req, res) => {
  try {
    const uid = String((req.body && req.body.uid) || "");
    if (!isValidUid(uid)) {
      return res.status(400).json({ success: false, error: "Invalid user" });
    }
    await db.collection("bds").doc(uid).delete();
    await db.collection("users").doc(uid).set({ isBD: false }, { merge: true });
    console.log(`OFFICIAL REMOVE BD: by=${req.user.uid} bd=${uid}`);
    return res.json({ success: true });
  } catch (e) {
    console.error("OFFICIAL REMOVE BD ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// body: { uid }  -> us user (agency owner) ki agency delete.
// Agency + owner + saare hosts ke agency fields saaf (admin /admin/delete-agency jaisa)
app.post("/official/delete-agency", generalLimiter, verifyUser, requireOfficialOrAdmin, async (req, res) => {
  try {
    const uid = String((req.body && req.body.uid) || "");
    if (!isValidUid(uid)) {
      return res.status(400).json({ success: false, error: "Invalid user" });
    }
    const uSnap = await db.collection("users").doc(uid).get();
    if (!uSnap.exists) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    const agencyId = String(uSnap.data().agencyId || "");
    if (!isValidUid(agencyId)) {
      return res.status(404).json({ success: false, error: "Is user ki koi agency nahi hai" });
    }
    const ref = db.collection("agencies").doc(agencyId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, error: "Agency not found" });
    }
    if (snap.data().ownerUserId && snap.data().ownerUserId !== uid) {
      return res.status(400).json({
        success: false,
        error: "Ye user agency ka owner nahi hai. Owner ko search karke delete karo.",
      });
    }

    const members = await db.collection("users").where("agencyId", "==", agencyId).get();
    const clear = {
      agencyId: "",
      agencyName: "",
      agencyHost: false,
      isAgencyOwner: false,
      agencyApproved: false,
    };
    for (let i = 0; i < members.docs.length; i += 400) {
      const batch = db.batch();
      members.docs.slice(i, i + 400).forEach((m) => batch.set(m.ref, clear, { merge: true }));
      await batch.commit();
    }
    await ref.delete();
    console.log(`OFFICIAL DELETE AGENCY: by=${req.user.uid} agency=${agencyId}`);
    return res.json({ success: true });
  } catch (e) {
    console.error("OFFICIAL DELETE AGENCY ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// =====================================================================
// OFFICIAL ROUTES (missing the wale) - server.js me
// "/official/delete-agency" route ke BAAD paste karo
// (requireOfficialOrAdmin, cleanText, isValidUid, userBrief, isAdminUser upar already hain)
// =====================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

// official panel ke liye user ka poora brief
function officialUserBrief(id, d) {
  return {
    uid: id,
    username: d.username || "",
    name: d.name || d.realName || "",
    profileImg: d.profileImg || "",
    level: d.level || 1,
    isBD: d.isBD === true,
    isOfficial: d.isOfficial === true,
    banned: d.banned === true,
    agencyId: d.agencyId || "",
    agencyName: d.agencyName || "",
    isAgencyOwner: d.isAgencyOwner === true,
    entryBanUntil: Number(d.entryBanUntil) > Date.now() ? Number(d.entryBanUntil) : 0,
    liveBanUntil: Number(d.liveBanUntil) > Date.now() ? Number(d.liveBanUntil) : 0,
  };
}

// body: { q } -> username prefix search (max 15)
app.post("/official/search-users", generalLimiter, verifyUser, requireOfficialOrAdmin, async (req, res) => {
  try {
    const raw = cleanText(req.body && req.body.q, 40).replace(/^@/, "");
    if (raw.length < 1) return res.json({ success: true, users: [] });

    const variants = Array.from(new Set([raw.toLowerCase(), raw]));
    const found = new Map();
    for (const q of variants) {
      const snap = await db
        .collection("users")
        .where("username", ">=", q)
        .where("username", "<=", q + "\uf8ff")
        .orderBy("username")
        .limit(15)
        .get();
      snap.docs.forEach((d) => found.set(d.id, officialUserBrief(d.id, d.data())));
    }
    return res.json({ success: true, users: Array.from(found.values()).slice(0, 15) });
  } catch (e) {
    console.error("OFFICIAL SEARCH USERS ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// body: { uid } -> BD banao
app.post("/official/add-bd", generalLimiter, verifyUser, requireOfficialOrAdmin, async (req, res) => {
  try {
    const uid = String((req.body && req.body.uid) || "");
    if (!isValidUid(uid)) return res.status(400).json({ success: false, error: "Invalid user" });
    const uSnap = await db.collection("users").doc(uid).get();
    if (!uSnap.exists) return res.status(404).json({ success: false, error: "User not found" });

    const existing = await db.collection("bds").doc(uid).get();
    if (existing.exists && existing.data().active !== false) {
      return res.status(400).json({ success: false, error: "Ye user pehle se BD hai" });
    }
    const u = uSnap.data();
    await db.collection("bds").doc(uid).set(
      {
        uid,
        username: u.username || "",
        profileImg: u.profileImg || "",
        active: true,
        addedBy: req.user.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await db.collection("users").doc(uid).set({ isBD: true }, { merge: true });
    console.log(`OFFICIAL ADD BD: by=${req.user.uid} bd=${uid}`);
    return res.json({ success: true });
  } catch (e) {
    console.error("OFFICIAL ADD BD ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// body: { uid, agencyName, ownerName } -> user ko agency do (owner bana do)
app.post("/official/create-agency", generalLimiter, verifyUser, requireOfficialOrAdmin, async (req, res) => {
  try {
    const uid = String((req.body && req.body.uid) || "");
    const agencyName = cleanText(req.body && req.body.agencyName, 80);
    const ownerName = cleanText(req.body && req.body.ownerName, 80);
    if (!isValidUid(uid)) return res.status(400).json({ success: false, error: "Invalid user" });
    if (!agencyName) return res.status(400).json({ success: false, error: "Agency ka naam daalo" });

    const uSnap = await db.collection("users").doc(uid).get();
    if (!uSnap.exists) return res.status(404).json({ success: false, error: "User not found" });
    const u = uSnap.data();
    if (u.agencyId) {
      return res.status(400).json({ success: false, error: "Ye user pehle se kisi agency me hai" });
    }

    const agencyRef = db.collection("agencies").doc();
    const batch = db.batch();
    batch.set(agencyRef, {
      agencyName,
      ownerName: ownerName || u.name || u.username || "",
      ownerUsername: u.username || "",
      ownerUserId: uid,
      logo: "",
      totalMembers: 0,
      totalStars: 0,
      status: "active",
      createdByOfficial: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(
      db.collection("users").doc(uid),
      { agencyId: agencyRef.id, agencyName, isAgencyOwner: true, agencyApproved: true },
      { merge: true }
    );
    await batch.commit();
    console.log(`OFFICIAL CREATE AGENCY: by=${req.user.uid} owner=${uid} agency=${agencyRef.id}`);
    return res.json({ success: true, agencyId: agencyRef.id });
  } catch (e) {
    console.error("OFFICIAL CREATE AGENCY ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// ID ban / unban (admin ko ya official ko ban nahi kar sakte)
async function officialSetBan(req, res, ban) {
  try {
    const uid = String((req.body && req.body.uid) || "");
    if (!isValidUid(uid)) return res.status(400).json({ success: false, error: "Invalid user" });
    if (ban && uid === req.user.uid) {
      return res.status(400).json({ success: false, error: "Apne aap ko ban nahi kar sakte" });
    }
    const uSnap = await db.collection("users").doc(uid).get();
    if (!uSnap.exists) return res.status(404).json({ success: false, error: "User not found" });
    if (ban && (uSnap.data().isOfficial === true || (await isAdminUser({ uid })))) {
      return res.status(403).json({ success: false, error: "Admin / Official ko ban nahi kar sakte" });
    }
    await admin.auth().updateUser(uid, { disabled: ban });
    if (ban) await admin.auth().revokeRefreshTokens(uid);
    await db.collection("users").doc(uid).set({ banned: ban }, { merge: true });
    console.log(`OFFICIAL ${ban ? "BAN" : "UNBAN"}: by=${req.user.uid} user=${uid}`);
    return res.json({ success: true });
  } catch (e) {
    console.error("OFFICIAL BAN ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}
app.post("/official/ban-user", generalLimiter, verifyUser, requireOfficialOrAdmin, (req, res) =>
  officialSetBan(req, res, true)
);
app.post("/official/unban-user", generalLimiter, verifyUser, requireOfficialOrAdmin, (req, res) =>
  officialSetBan(req, res, false)
);

// body: { uid, entryDays?, liveDays? }  days: 1/3/7/15/30, 0 = ban hatao
// users/{uid}.entryBanUntil / liveBanUntil (firestore rules yahi padhte hain)
// + liveBans/{uid} (app ka useLiveBanGuard yahi sunta hai)
app.post("/official/live-restrict", generalLimiter, verifyUser, requireOfficialOrAdmin, async (req, res) => {
  try {
    const uid = String((req.body && req.body.uid) || "");
    if (!isValidUid(uid)) return res.status(400).json({ success: false, error: "Invalid user" });
    const hasEntry = req.body && req.body.entryDays !== undefined;
    const hasLive = req.body && req.body.liveDays !== undefined;
    if (!hasEntry && !hasLive) return res.status(400).json({ success: false, error: "Days daalo" });

    const ALLOWED = [0, 1, 3, 7, 15, 30];
    const userUpd = {};
    const banUpd = { uid };
    const del = admin.firestore.FieldValue.delete();

    const apply = (field, days) => {
      const d = Number(days);
      if (!ALLOWED.includes(d)) throw Object.assign(new Error("Invalid days"), { code: 400 });
      if (d === 0) {
        userUpd[field] = del;
        banUpd[field] = 0;
      } else {
        const until = Date.now() + d * DAY_MS;
        userUpd[field] = until;
        banUpd[field] = until;
      }
    };
    if (hasEntry) apply("entryBanUntil", req.body.entryDays);
    if (hasLive) apply("liveBanUntil", req.body.liveDays);

    const uRef = db.collection("users").doc(uid);
    const uSnap = await uRef.get();
    if (!uSnap.exists) return res.status(404).json({ success: false, error: "User not found" });

    banUpd.updatedBy = req.user.uid;
    banUpd.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await uRef.set(userUpd, { merge: true });
    await db.collection("liveBans").doc(uid).set(banUpd, { merge: true });
    console.log(`OFFICIAL LIVE RESTRICT: by=${req.user.uid} user=${uid}`, JSON.stringify(req.body));
    return res.json({ success: true });
  } catch (e) {
    if (e && e.code === 400) return res.status(400).json({ success: false, error: e.message });
    console.error("OFFICIAL LIVE RESTRICT ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// jin users par abhi live ban hai
app.post("/official/list-live-bans", generalLimiter, verifyUser, requireOfficialOrAdmin, async (req, res) => {
  try {
    const now = Date.now();
    const [a, b] = await Promise.all([
      db.collection("users").where("entryBanUntil", ">", now).limit(200).get(),
      db.collection("users").where("liveBanUntil", ">", now).limit(200).get(),
    ]);
    const map = new Map();
    [...a.docs, ...b.docs].forEach((d) => map.set(d.id, officialUserBrief(d.id, d.data())));
    const bans = Array.from(map.values()).sort((x, y) => x.username.localeCompare(y.username));
    return res.json({ success: true, bans });
  } catch (e) {
    console.error("OFFICIAL LIST BANS ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// =====================================================================
// FIRESTORE RULES me add karo (app ka useLiveBanGuard liveBans/{uid} sunta hai):
//
//   match /liveBans/{uid} {
//     allow read: if isOwner(uid) || isAdmin() || isOfficial();
//     allow write: if false;
//   }
// =====================================================================

// body: { agencyId } -> agency ke hosts (View ke liye)
app.post("/bd/agency-hosts", generalLimiter, verifyUser, requireBD, async (req, res) => {
  try {
    const own = await loadOwnAgency(req, res);
    if (!own) return;
    const snap = await db
      .collection("users")
      .where("agencyId", "==", own.id)
      .where("agencyHost", "==", true)
      .limit(200)
      .get();
    const hosts = snap.docs.map((d) => ({
      id: d.id,
      username: d.data().username || "",
      profileImg: d.data().profileImg || "",
    }));
    return res.json({ success: true, hosts });
  } catch (e) {
    console.error("BD AGENCY HOSTS ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// =====================================================
// AGENCY JOIN REQUESTS (user -> agency)
// User agency profile par "Request to Join" dabata hai, agency owner
// accept kare to user us agency ka host/member ban jata hai.
// Collection: agencyJoinRequests/{agencyId}_{userId}
// (agencyHostRequests = agency -> user invite, alag cheez hai)
// =====================================================

function joinReqId(agencyId, userId) {
  return `${agencyId}_${userId}`;
}

function httpErr(code, message) {
  return Object.assign(new Error(message), { code });
}

function sendJoinError(res, e, label) {
  if (e && e.code && Number.isInteger(e.code) && e.code >= 400 && e.code < 500) {
    return res.status(e.code).json({ success: false, error: e.message });
  }
  console.error(label, e);
  return res.status(500).json({ success: false, error: "Server error" });
}

// body: { agencyId } -> is user ka is agency ke saath status
app.post("/agency/join-status", generalLimiter, verifyUser, async (req, res) => {
  try {
    const agencyId = String((req.body && req.body.agencyId) || "");
    if (!isValidUid(agencyId)) {
      return res.status(400).json({ success: false, error: "Invalid agency" });
    }
    const uid = req.user.uid;
    const [aSnap, uSnap, rSnap] = await Promise.all([
      db.collection("agencies").doc(agencyId).get(),
      db.collection("users").doc(uid).get(),
      db.collection("agencyJoinRequests").doc(joinReqId(agencyId, uid)).get(),
    ]);
    if (!aSnap.exists) {
      return res.status(404).json({ success: false, error: "Agency not found" });
    }
    const a = aSnap.data();
    const u = uSnap.exists ? uSnap.data() : {};

    let status = "none";
    if (a.ownerUserId === uid) status = "owner";
    else if (u.agencyId === agencyId) status = "member";
    else if (u.agencyId) status = "in_other_agency";
    else if (rSnap.exists && rSnap.data().status === "pending") status = "pending";

    return res.json({ success: true, status, blocked: a.status === "blocked" });
  } catch (e) {
    return sendJoinError(res, e, "AGENCY JOIN STATUS ERROR:");
  }
});

// body: { agencyId } -> join request bhejo
app.post("/agency/request-join", generalLimiter, verifyUser, async (req, res) => {
  try {
    const agencyId = String((req.body && req.body.agencyId) || "");
    if (!isValidUid(agencyId)) {
      return res.status(400).json({ success: false, error: "Invalid agency" });
    }
    const uid = req.user.uid;
    const agencyRef = db.collection("agencies").doc(agencyId);
    const userRef = db.collection("users").doc(uid);
    const reqRef = db.collection("agencyJoinRequests").doc(joinReqId(agencyId, uid));

    await db.runTransaction(async (tx) => {
      const [aSnap, uSnap, rSnap] = await Promise.all([
        tx.get(agencyRef),
        tx.get(userRef),
        tx.get(reqRef),
      ]);
      if (!aSnap.exists) throw httpErr(404, "Agency not found");
      if (!uSnap.exists) throw httpErr(404, "User not found");

      const a = aSnap.data();
      const u = uSnap.data();

      if (a.status === "blocked") throw httpErr(400, "Ye agency abhi available nahi hai");
      if (a.ownerUserId === uid) throw httpErr(400, "Ye aapki apni agency hai");
      if (u.agencyId) throw httpErr(400, "Aap pehle se kisi agency me ho");
      if (rSnap.exists && rSnap.data().status === "pending") {
        throw httpErr(400, "Request pehle se bheji ja chuki hai");
      }

      // same doc id -> duplicate pending request kabhi nahi banegi
      tx.set(reqRef, {
        agencyId,
        agencyName: a.agencyName || "",
        agencyLogo: a.logo || a.agencyLogo || "",
        ownerUserId: a.ownerUserId || "",
        userId: uid,
        username: u.username || "",
        profileImg: u.profileImg || "",
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return res.json({ success: true });
  } catch (e) {
    return sendJoinError(res, e, "AGENCY REQUEST JOIN ERROR:");
  }
});

// body: { agencyId } -> apni pending request wapas lo
app.post("/agency/cancel-join-request", generalLimiter, verifyUser, async (req, res) => {
  try {
    const agencyId = String((req.body && req.body.agencyId) || "");
    if (!isValidUid(agencyId)) {
      return res.status(400).json({ success: false, error: "Invalid agency" });
    }
    const reqRef = db
      .collection("agencyJoinRequests")
      .doc(joinReqId(agencyId, req.user.uid));
    const snap = await reqRef.get();
    if (!snap.exists || snap.data().status !== "pending") {
      return res.status(404).json({ success: false, error: "Pending request nahi mili" });
    }
    await reqRef.update({
      status: "cancelled",
      respondedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.json({ success: true });
  } catch (e) {
    return sendJoinError(res, e, "AGENCY CANCEL JOIN ERROR:");
  }
});

// body: { agencyId } -> sirf agency owner: pending requests ki list
app.post("/agency/join-requests", generalLimiter, verifyUser, async (req, res) => {
  try {
    const agencyId = String((req.body && req.body.agencyId) || "");
    if (!isValidUid(agencyId)) {
      return res.status(400).json({ success: false, error: "Invalid agency" });
    }
    const aSnap = await db.collection("agencies").doc(agencyId).get();
    if (!aSnap.exists) {
      return res.status(404).json({ success: false, error: "Agency not found" });
    }
    if (aSnap.data().ownerUserId !== req.user.uid) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    const snap = await db
      .collection("agencyJoinRequests")
      .where("agencyId", "==", agencyId)
      .where("status", "==", "pending")
      .limit(100)
      .get();

    const requests = snap.docs
      .map((d) => {
        const r = d.data();
        const t = r.createdAt && r.createdAt.toMillis ? r.createdAt.toMillis() : 0;
        return {
          id: d.id,
          userId: r.userId,
          username: r.username || "",
          profileImg: r.profileImg || "",
          createdAt: t,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt); // naye pehle (index ki zarurat nahi)

    return res.json({ success: true, requests });
  } catch (e) {
    return sendJoinError(res, e, "AGENCY JOIN REQUESTS ERROR:");
  }
});

// body: { requestId, accept: true/false } -> sirf agency owner
app.post("/agency/respond-join-request", generalLimiter, verifyUser, async (req, res) => {
  try {
    const requestId = String((req.body && req.body.requestId) || "");
    const accept = !!(req.body && req.body.accept === true);
    if (!isValidUid(requestId)) {
      return res.status(400).json({ success: false, error: "Invalid request" });
    }

    const reqRef = db.collection("agencyJoinRequests").doc(requestId);

    const result = await db.runTransaction(async (tx) => {
      const rSnap = await tx.get(reqRef);
      if (!rSnap.exists) throw httpErr(404, "Request not found");
      const r = rSnap.data();
      if (r.status !== "pending") throw httpErr(400, "Ye request pehle hi handle ho chuki hai");

      const agencyRef = db.collection("agencies").doc(r.agencyId);
      const userRef = db.collection("users").doc(r.userId);
      const [aSnap, uSnap] = await Promise.all([tx.get(agencyRef), tx.get(userRef)]);

      if (!aSnap.exists) throw httpErr(404, "Agency not found");
      const a = aSnap.data();
      // owner check server par: koi aur kisi ki request accept nahi kar sakta
      if (a.ownerUserId !== req.user.uid) throw httpErr(403, "Access denied");

      const now = admin.firestore.FieldValue.serverTimestamp();

      if (!accept) {
        tx.update(reqRef, { status: "rejected", respondedAt: now });
        return { joined: false };
      }

      if (a.status === "blocked") throw httpErr(400, "Agency blocked hai");
      if (!uSnap.exists) throw httpErr(404, "User not found");

      // user is beech kisi aur agency me chala gaya ho
      if (uSnap.data().agencyId) {
        tx.update(reqRef, { status: "cancelled", respondedAt: now });
        return { joined: false, alreadyInAgency: true };
      }

      tx.set(
        userRef,
        {
          agencyId: r.agencyId,
          agencyName: a.agencyName || "",
          agencyHost: true,
        },
        { merge: true }
      );
      tx.update(agencyRef, {
        totalMembers: admin.firestore.FieldValue.increment(1),
      });
      tx.update(reqRef, { status: "accepted", respondedAt: now });
      return { joined: true };
    });

    if (result.alreadyInAgency) {
      return res
        .status(400)
        .json({ success: false, error: "Ye user ab kisi aur agency me hai" });
    }

    console.log(
      `AGENCY JOIN ${accept ? "ACCEPT" : "REJECT"}: owner=${req.user.uid} request=${requestId}`
    );
    return res.json({ success: true, joined: result.joined });
  } catch (e) {
    return sendJoinError(res, e, "AGENCY RESPOND JOIN ERROR:");
  }
});

// Live/Gift reward (server-side). payments.js se PEHLE mount hota hai, isliye
// agar payments.js me purana /reward/claim ho to bhi ye wala hi chalega.
require("./rewards")({
  app,
  db,
  admin,
  verifyUser,
  rateLimit,
});

// payments module is optional: server still starts if ./payments.js is absent
try {
  require("./payments")({
    app,
    db,
    admin,
    verifyUser,
    rateLimit,
  });
} catch (e) {
  if (e && e.code === "MODULE_NOT_FOUND" && String(e.message).includes("payments")) {
    console.warn("payments.js not found - payment routes disabled");
  } else {
    throw e;
  }
}

// Unknown route -> JSON 404 (log ke saath)
app.use((req, res) => {
  console.warn(`404 NOT FOUND: ${req.method} ${req.path}`);
  res.status(404).json({ success: false, error: "Route not found: " + req.path });
});

// =====================================================
// SERVER
// =====================================================

const PORT =
  Number(
    process.env.PORT || 3000
  );


const server =
  app.listen(

    PORT,

    "0.0.0.0",

    () => {

      console.log(
        `Server running on port ${PORT}`
      );

    }

  );


// =====================================================
// KEEP WARM (Render free plan 15 min idle par so jata hai -> pehla
// /token 30-50 sec leta tha = live me voice late / join atakta tha).
// Server khud apne /health ko har 10 min hit karta hai.
// Render par RENDER_EXTERNAL_URL khud set hota hai. Isse bhi pakka
// karna ho to UptimeRobot se /health ko har 5 min ping karwao.
// =====================================================
const KEEP_WARM_URL = process.env.RENDER_EXTERNAL_URL || process.env.KEEP_WARM_URL;
if (KEEP_WARM_URL && typeof fetch === "function") {
  setInterval(() => {
    fetch(`${KEEP_WARM_URL}/health`).catch(() => {});
  }, 10 * 60 * 1000).unref();
}


// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================

async function shutdown(
  signal
) {

  console.log(
    `${signal} received. Shutting down...`
  );


  server.close(
    async () => {

      try {

        await admin
          .app()
          .delete();

      } catch (_) {}


      process.exit(0);

    }
  );

}


process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);


process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);