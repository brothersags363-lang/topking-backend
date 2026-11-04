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
  DeleteObjectsCommand,
  ListObjectsV2Command,
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
      "x-device-id",
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
// DEVICE BAN (helpers)
// App har request me x-device-id bhejti hai. Raw ID kahin store nahi hoti,
// sirf uska SHA-256 hash:
//   devices/{hash}        -> { uids: [...], lastSeen }   (is device par kaun-kaun login hua)
//   user_devices/{uid}    -> { hashes: [...] }           (user ke devices)
//   banned_devices/{hash} -> ban record
// Ye teeno collections sirf server (Admin SDK) se chalte hain.
// =====================================================

const deviceBanCache = new Map(); // hash -> { banned, exp }

function deviceHash(raw) {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (id.length < 8 || id.length > 200) return null;
  return crypto.createHash("sha256").update(id).digest("hex");
}

async function isDeviceBanned(hash) {
  if (!hash) return false;
  const c = deviceBanCache.get(hash);
  if (c && c.exp > Date.now()) return c.banned;
  try {
    const snap = await db.collection("banned_devices").doc(hash).get();
    const banned = snap.exists;
    if (deviceBanCache.size > 5000) deviceBanCache.clear();
    deviceBanCache.set(hash, { banned, exp: Date.now() + 20000 });
    return banned;
  } catch (e) {
    console.error("DEVICE BAN CHECK ERROR:", e.code || e.message);
    return false; // Firestore down ho to sabko mat roko
  }
}

// Banned device par koi bhi (naya ya purana) account aaye to wo account turant band.
// Isse "naya ID bana lo" wala bypass band ho jata hai. Unban par ye bhi wapas chalu hote hain
// (devices/{hash}.uids me jod dete hain taaki setDeviceBan unban inhe pakad sake).
async function lockAccountOnBannedDevice(uid, dh) {
  try {
    if (!uid || !dh) return;
    if (await isAdminUser({ uid })) return; // admin kabhi band nahi
    const FV = admin.firestore.FieldValue;
    const uRef = db.collection("users").doc(uid);
    const uSnap = await uRef.get();
    const ud = uSnap.exists ? uSnap.data() : {};
    if (ud.deviceBanned === true) return; // pehle se band
    await admin.auth().updateUser(uid, { disabled: true });
    await admin.auth().revokeRefreshTokens(uid);
    await Promise.all([
      uRef.set(
        { banned: true, deviceBanned: true, banBeforeDevice: ud.banned === true },
        { merge: true }
      ),
      db.collection("devices").doc(dh).set(
        { uids: FV.arrayUnion(uid), lastSeen: FV.serverTimestamp() },
        { merge: true }
      ),
      db.collection("user_devices").doc(uid).set(
        { hashes: FV.arrayUnion(dh), updatedAt: FV.serverTimestamp() },
        { merge: true }
      ),
    ]);
    console.log("DEVICE BAN AUTO-LOCK: uid=" + uid);
  } catch (e) {
    console.error("DEVICE AUTO-LOCK ERROR:", uid, e.code || e.message);
  }
}


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

    // Banned device se koi bhi login-wali request nahi chalegi
    req.deviceHash = deviceHash(req.headers["x-device-id"]);
    // Render env me REQUIRE_DEVICE_ID=1 karo (sab users ke updated app aa jane ke baad).
    // Tab bina device ID wali request (purani / modified app) chalegi hi nahi.
    if (!req.deviceHash && process.env.REQUIRE_DEVICE_ID === "1") {
      return res.status(400).json({
        success: false,
        code: "DEVICE_REQUIRED",
        error: "Please update the app",
      });
    }
    if (req.deviceHash && (await isDeviceBanned(req.deviceHash))) {
      await lockAccountOnBannedDevice(decodedToken.uid, req.deviceHash);
      return res.status(403).json({
        success: false,
        code: "DEVICE_BANNED",
        error: "This device has been banned",
      });
    }

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

// moderation.js yahan baad me set hota hai (neeche /official/list-live-bans ke baad)
let moderation = null;

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


      // ---- LIVE BAN CHECK (gali / abuse ban) ----
      // Ban wale user ko Agora token milega hi nahi => na live me ja sakta, na live chala sakta.
      if (moderation) {
        try {
          const banned = await moderation.checkLiveBan(req.user.uid, channelName);
          if (banned) {
            return res.status(403).json({
              success: false,
              code: banned.code,
              error: banned.error,
              until: banned.until,
            });
          }
        } catch (e) {
          // Firestore atka to live na roko, bas log karo
          console.error("LIVE BAN CHECK ERROR:", e.message);
        }
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

      // STT/voice-moderation webhook ko agoraUid se Firebase uid dhundhne ke liye
      db.collection("agoraUidMap")
        .doc(String(agoraUid))
        .set({ uid: req.user.uid, at: Date.now() }, { merge: true })
        .catch(() => {});


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
// DIRECT UPLOAD URL  (app -> R2 seedha, Render ke beech se nahi)
//   POST /upload-url  -> { videoUploadUrl, videoUrl, thumbnailUploadUrl, thumbnailUrl }
//   Client in URLs par PUT karta hai (Content-Type: video/mp4 / image/jpeg).
//   Isse server par na video aati hai na ffmpeg chalta hai -> bahut tez.
//   Zaroori: npm i @aws-sdk/s3-request-presigner
// =====================================================
let _presign = null;
function getPresigner() {
  if (_presign) return _presign;
  try {
    _presign = require("@aws-sdk/s3-request-presigner").getSignedUrl;
  } catch (e) {
    _presign = false;
  }
  return _presign;
}

app.post("/upload-url", uploadLimiter, verifyUser, async (req, res) => {
  try {
    const presign = getPresigner();
    if (!presign) {
      // package install nahi -> client purane /upload-video par chala jayega
      return res.status(501).json({ success: false, error: "Direct upload not enabled" });
    }

    const base = String(process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
    const fileId = crypto.randomUUID();
    const videoKey = `${fileId}.mp4`;
    const thumbKey = `${fileId}.jpg`;
    const EXPIRES = 2 * 60 * 60; // 2 ghante (badi video / dheemi net)

    const [videoUploadUrl, thumbnailUploadUrl] = await Promise.all([
      presign(
        r2,
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: videoKey,
          ContentType: "video/mp4",
        }),
        { expiresIn: EXPIRES }
      ),
      presign(
        r2,
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: thumbKey,
          ContentType: "image/jpeg",
        }),
        { expiresIn: EXPIRES }
      ),
    ]);

    return res.json({
      success: true,
      videoUploadUrl,
      videoUrl: `${base}/${videoKey}`,
      thumbnailUploadUrl,
      thumbnailUrl: `${base}/${thumbKey}`,
    });
  } catch (e) {
    console.error("UPLOAD-URL ERROR:", e.message);
    return res.status(500).json({ success: false, error: "Upload url nahi ban paya" });
  }
});

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
        userData.uploadStatus === true &&
        Date.now() - Number(userData.uploadStartedAt || 0) < 15 * 60 * 1000
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

        uploadStartedAt: Date.now(),

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
// PUSH NOTIFICATIONS: LIVE START / SHARE / FOLLOW / LIKE MILESTONE
// App ye routes pehle se call karta hai (utils/pushNotify.js, ShareVideo.js)
// =====================================================

const NOTIFY_MAX_FOLLOWERS = 5000;
const NOTIFY_LIKE_MILESTONES = [10, 50, 100, 1000, 10000, 50000];

function notifyClip(s, n) {
  const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function notifyIsId(v) {
  return typeof v === "string" && v.length >= 1 && v.length <= 256 && /^[A-Za-z0-9_-]+$/.test(v);
}

async function notifyUserInfo(uid) {
  try {
    const snap = await db.collection("users").doc(uid).get();
    const d = snap.exists ? snap.data() || {} : {};
    const name =
      (typeof d.name === "string" && d.name.trim()) ||
      (typeof d.username === "string" && d.username.trim()) ||
      "Someone";
    return { name: notifyClip(name, 40), img: typeof d.profileImg === "string" ? d.profileImg : "" };
  } catch (e) {
    return { name: "Someone", img: "" };
  }
}

// uids -> FCM push (batch). msg: { title, body, data, channelId, tag, ttlMs }
async function notifyPushMany(uids, msg) {
  try {
    const unique = [...new Set((uids || []).filter(isValidUid))];
    if (!unique.length) return { sent: 0, failed: 0 };

    const entries = [];
    for (let i = 0; i < unique.length; i += 300) {
      const refs = unique.slice(i, i + 300).map((u) => db.collection("users").doc(u));
      const snaps = await db.getAll(...refs, { fieldMask: ["fcmToken"] });
      for (const s of snaps) {
        const t = s.exists ? s.get("fcmToken") : null;
        if (typeof t === "string" && t.length > 0 && t.length < 5000) {
          entries.push({ uid: s.id, token: t });
        }
      }
    }

    const seen = new Set();
    const list = entries.filter((e) => !seen.has(e.token) && seen.add(e.token));
    if (!list.length) {
      console.log("PUSH " + (msg.data && msg.data.type) + ": no tokens");
      return { sent: 0, failed: 0 };
    }

    const data = {};
    for (const [k, v] of Object.entries(msg.data || {})) {
      if (v === undefined || v === null) continue;
      data[k] = String(v).slice(0, 500);
    }

    const payload = {
      notification: { title: notifyClip(msg.title, 100), body: notifyClip(msg.body, 160) },
      data,
      android: {
        priority: "high",
        ttl: msg.ttlMs || 24 * 60 * 60 * 1000,
        notification: {
          channelId: msg.channelId || "activity",
          sound: "default",
          tag: msg.tag || undefined,
          defaultVibrateTimings: true,
          notificationPriority: "PRIORITY_MAX",
          visibility: "PRIVATE",
        },
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: { aps: { sound: "default", ...(msg.tag ? { "thread-id": msg.tag } : {}) } },
      },
    };

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < list.length; i += 500) {
      const chunk = list.slice(i, i + 500);
      try {
        const r = await admin.messaging().sendEachForMulticast({ ...payload, tokens: chunk.map((e) => e.token) });
        sent += r.successCount;
        failed += r.failureCount;
        await Promise.all(
          r.responses.map((x, idx) => {
            if (x.success) return null;
            const code = x.error && x.error.code;
            console.error("FCM ERROR:", code || "unknown");
            if (
              code === "messaging/registration-token-not-registered" ||
              code === "messaging/invalid-registration-token"
            ) {
              return db
                .collection("users")
                .doc(chunk[idx].uid)
                .update({ fcmToken: admin.firestore.FieldValue.delete() })
                .catch(() => {});
            }
            return null;
          })
        );
      } catch (e) {
        failed += chunk.length;
        console.error("PUSH BATCH FAILED:", e && (e.code || e.message));
      }
    }
    console.log("PUSH " + (msg.data && msg.data.type) + ": sent=" + sent + " failed=" + failed);
    return { sent, failed };
  } catch (e) {
    console.error("PUSH MANY ERROR:", e && e.message);
    return { sent: 0, failed: 0 };
  }
}

// Ek hi event ka push dobara na jaye (create() doc pehle se ho to fail hota hai)
async function notifyOnce(key) {
  try {
    await db.collection("pushLog").doc(key).create({ at: admin.firestore.FieldValue.serverTimestamp() });
    return true;
  } catch (e) {
    return false;
  }
}

// ---- Host live start kare -> uske followers ko push ----
app.post("/notify/live-started", notificationLimiter, verifyUser, async (req, res) => {
  try {
    const roomId = req.body && req.body.roomId;
    if (!notifyIsId(roomId)) return res.status(400).json({ success: false, error: "Invalid room" });
    const uid = req.user.uid;

    const roomSnap = await db.collection("rooms").doc(roomId).get();
    if (!roomSnap.exists) return res.status(404).json({ success: false, error: "Room not found" });
    const room = roomSnap.data() || {};

    // Sirf host hi apni live ka push chala sakta hai
    if (room.hostId !== uid) return res.status(403).json({ success: false, error: "Not allowed" });
    if (String(room.status || "active").toLowerCase() !== "active") return res.json({ success: true, skipped: "inactive" });
    if (room.roomType === "private" || room.isPrivate === true) return res.json({ success: true, skipped: "private" });

    res.json({ success: true });

    if (!(await notifyOnce("live_" + roomId))) return;

    const fs = await db
      .collection("follows")
      .where("followingId", "==", uid)
      .select("followerId")
      .limit(NOTIFY_MAX_FOLLOWERS)
      .get();
    const followerIds = fs.docs.map((d) => d.get("followerId")).filter((x) => isValidUid(x) && x !== uid);
    if (!followerIds.length) return;

    const hostName = notifyClip(room.hostName || (await notifyUserInfo(uid)).name, 40);
    await notifyPushMany(followerIds, {
      title: hostName + " is LIVE now 🔴",
      body: notifyClip(room.title, 80) || "Tap to join the live room",
      channelId: "live",
      tag: "live_" + roomId,
      ttlMs: 10 * 60 * 1000,
      data: { type: "live", roomId, hostId: uid, senderUid: uid, senderName: hostName },
    });
  } catch (e) {
    console.error("NOTIFY LIVE ERROR:", e && e.message);
    if (!res.headersSent) return res.status(500).json({ success: false, error: "Notification failed" });
  }
});

// ---- Video / live room share -> receivers ko push ----
app.post("/notify/share", notificationLimiter, verifyUser, async (req, res) => {
  try {
    const body = req.body || {};
    const uid = req.user.uid;
    const kind = body.type === "live" ? "live" : "video";

    let receivers = Array.isArray(body.receiverUids) ? body.receiverUids : body.receiverUid ? [body.receiverUid] : [];
    receivers = [...new Set(receivers.filter((x) => isValidUid(x) && x !== uid))].slice(0, 50);
    if (!receivers.length) return res.status(400).json({ success: false, error: "Invalid receiver" });

    let videoId = "";
    let roomId = "";
    let caption = "";

    if (kind === "live") {
      roomId = body.roomId;
      if (!notifyIsId(roomId)) return res.status(400).json({ success: false, error: "Invalid room" });
    } else {
      videoId = body.videoId;
      if (!notifyIsId(videoId)) return res.status(400).json({ success: false, error: "Invalid video" });
      const vs = await db.collection("all_videos").doc(videoId).get();
      if (!vs.exists) return res.status(404).json({ success: false, error: "Video not found" });
      caption = notifyClip((vs.data() || {}).caption, 80);
    }

    res.json({ success: true });

    const me = await notifyUserInfo(uid);
    if (kind === "live") {
      await notifyPushMany(receivers, {
        title: me.name + " shared a live room 🔴",
        body: "Tap to join the live now",
        channelId: "live",
        tag: "share_" + uid,
        ttlMs: 30 * 60 * 1000,
        data: { type: "live_share", roomId, senderUid: uid, senderName: me.name, senderImg: me.img },
      });
    } else {
      await notifyPushMany(receivers, {
        title: me.name + " sent you a video 🎥",
        body: caption || "Tap to watch",
        channelId: "messages",
        tag: "share_" + uid,
        data: { type: "video_share", videoId, senderUid: uid, senderName: me.name, senderImg: me.img },
      });
    }
  } catch (e) {
    console.error("NOTIFY SHARE ERROR:", e && e.message);
    if (!res.headersSent) return res.status(500).json({ success: false, error: "Notification failed" });
  }
});

// ---- Kisi ko follow kiya -> us user ko push ----
app.post("/notify/new-follower", notificationLimiter, verifyUser, async (req, res) => {
  try {
    const targetUid = req.body && req.body.targetUid;
    const uid = req.user.uid;
    if (!isValidUid(targetUid) || targetUid === uid) {
      return res.status(400).json({ success: false, error: "Invalid target" });
    }

    // Follow sach me hua hai ya nahi (client par bharosa nahi)
    const fSnap = await db.collection("follows").doc(uid + "_" + targetUid).get();
    if (!fSnap.exists) return res.json({ success: true, skipped: "not-following" });

    res.json({ success: true });

    // Follow/unfollow baar-baar karke spam na ho: ek jodi ka ek hi push
    if (!(await notifyOnce("follow_" + uid + "_" + targetUid))) return;

    const me = await notifyUserInfo(uid);
    await notifyPushMany([targetUid], {
      title: "New follower 👤",
      body: me.name + " started following you",
      channelId: "activity",
      tag: "follow_" + uid,
      data: { type: "follow", senderUid: uid, senderName: me.name, senderImg: me.img },
    });
  } catch (e) {
    console.error("NOTIFY FOLLOW ERROR:", e && e.message);
    if (!res.headersSent) return res.status(500).json({ success: false, error: "Notification failed" });
  }
});

// ---- Video like milestone (10, 50, 100, 1000...) -> video owner ----
app.post("/notify/video-like", notificationLimiter, verifyUser, async (req, res) => {
  try {
    const videoId = req.body && req.body.videoId;
    if (!notifyIsId(videoId)) return res.status(400).json({ success: false, error: "Invalid video" });

    const vs = await db.collection("all_videos").doc(videoId).get();
    if (!vs.exists) return res.json({ success: true, skipped: "no-video" });
    const v = vs.data() || {};
    const ownerId = v.userId;
    const likes = Number(v.likes) || 0;

    res.json({ success: true });

    if (!isValidUid(ownerId) || ownerId === req.user.uid) return;
    let hit = 0;
    for (const m of NOTIFY_LIKE_MILESTONES) if (likes >= m) hit = m;
    if (!hit) return;
    if (!(await notifyOnce("like_" + videoId + "_" + hit))) return;

    await notifyPushMany([ownerId], {
      title: "Your video is trending ❤️",
      body: "Your video reached " + hit + " likes",
      channelId: "activity",
      tag: "like_" + videoId,
      data: { type: "video_like", videoId, senderUid: req.user.uid },
    });
  } catch (e) {
    console.error("NOTIFY LIKE ERROR:", e && e.message);
    if (!res.headersSent) return res.status(500).json({ success: false, error: "Notification failed" });
  }
});


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
// DP (PROFILE PHOTO) -> R2
//   POST /upload-dp   (multipart, field name: "media")
//   Key:  dp/{uid}/{timestamp}_{uuid}.{jpg|png|webp}
//   Har upload ka naya key -> CDN / app cache me purani photo nahi atakti.
// =====================================================

const DP_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// File ke asli bytes dekh ke type pakdo (client ke bheje mime/extension par bharosa nahi)
async function sniffImageType(filePath) {
  let fh;
  try {
    fh = await fsp.open(filePath, "r");
    const buf = Buffer.alloc(12);
    const { bytesRead } = await fh.read(buf, 0, 12, 0);
    if (bytesRead < 12) return null;

    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return { ext: ".jpg", mime: "image/jpeg" };
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
    ) {
      return { ext: ".png", mime: "image/png" };
    }
    // WEBP: "RIFF" ???? "WEBP"
    if (
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP"
    ) {
      return { ext: ".webp", mime: "image/webp" };
    }
    return null;
  } catch (_) {
    return null;
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}

const dpUpload = multer({
  dest: path.join(__dirname, "uploads"),
  limits: { fileSize: DP_MAX_BYTES, files: 1, fields: 2 },
  fileFilter: (req, file, cb) => {
    if (["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error("DP_BAD_TYPE"));
  },
});

// multer ke errors ko JSON me badlo (warna Express HTML error bhej deta hai)
function runDpUpload(req, res, next) {
  dpUpload.single("media")(req, res, (err) => {
    if (!err) return next();
    const msg =
      err.code === "LIMIT_FILE_SIZE"
        ? "Photo 5MB se badi hai. Chhoti photo chuno."
        : "Sirf JPG, PNG ya WEBP photo chalegi.";
    return res.status(400).json({ success: false, error: msg });
  });
}

// User ki purani DP R2 se hatao.
// Rakhte hain: (1) abhi-abhi upload hui nayi, (2) jo Firestore me abhi laga hai.
// Isse save beech me fail ho jaye to bhi user ki DP kabhi toot-ti nahi.
async function cleanupOldDp(uid, keepKey) {
  const prefix = `dp/${uid}/`;
  const keep = new Set([keepKey]);

  try {
    const snap = await db.collection("users").doc(uid).get();
    const currentKey = r2KeyFromUrl(snap.exists ? snap.data().profileImg : "");
    if (currentKey && currentKey.startsWith(prefix)) keep.add(currentKey);
  } catch (e) {
    // current DP pata nahi chali -> kuch bhi delete mat karo
    console.error("DP CLEANUP READ ERROR:", e.message);
    return;
  }

  const listed = await r2.send(
    new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET,
      Prefix: prefix,
      MaxKeys: 100,
    })
  );

  const stale = (listed.Contents || [])
    .map((o) => o.Key)
    .filter((k) => k && k.startsWith(prefix) && !keep.has(k));

  if (!stale.length) return;

  await r2.send(
    new DeleteObjectsCommand({
      Bucket: process.env.R2_BUCKET,
      Delete: { Objects: stale.map((Key) => ({ Key })), Quiet: true },
    })
  );
}

// Kisi prefix ke neeche sab kuch hatao (account delete ke time)
async function deleteR2Prefix(prefix) {
  try {
    let token;
    do {
      const listed = await r2.send(
        new ListObjectsV2Command({
          Bucket: process.env.R2_BUCKET,
          Prefix: prefix,
          ContinuationToken: token,
        })
      );
      const keys = (listed.Contents || []).map((o) => o.Key).filter(Boolean);
      if (keys.length) {
        await r2.send(
          new DeleteObjectsCommand({
            Bucket: process.env.R2_BUCKET,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
          })
        );
      }
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);
  } catch (e) {
    console.error("R2 PREFIX DELETE ERROR:", prefix, e.message);
  }
}

app.post(
  "/upload-dp",
  uploadLimiter,
  verifyUser,
  runDpUpload,
  async (req, res) => {
    const file = req.file;
    try {
      if (!file) {
        return res.status(400).json({ success: false, error: "Photo nahi mili" });
      }

      const kind = await sniffImageType(file.path);
      if (!kind) {
        return res
          .status(400)
          .json({ success: false, error: "Sirf JPG, PNG ya WEBP photo chalegi." });
      }

      const uid = req.user.uid;
      const key = `dp/${uid}/${Date.now()}_${crypto.randomUUID()}${kind.ext}`;

      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
          Body: fs.createReadStream(file.path),
          ContentLength: file.size,
          ContentType: kind.mime,
          CacheControl: "public, max-age=31536000, immutable",
        })
      );

      const base = String(process.env.R2_PUBLIC_URL).replace(/\/+$/, "");
      res.json({ success: true, key, url: `${base}/${key}` });

      // Response de diya; ab peeche se purani DP saaf karo (fail ho to koi dikkat nahi)
      cleanupOldDp(uid, key).catch((e) =>
        console.error("DP CLEANUP ERROR:", e.message)
      );
    } catch (e) {
      console.error("DP UPLOAD ERROR:", e);
      if (!res.headersSent) {
        return res.status(500).json({ success: false, error: "Photo upload nahi hui" });
      }
    } finally {
      if (file && file.path) fsp.unlink(file.path).catch(() => {});
    }
  }
);

// =====================================================
// LOGO (agency / family) -> R2
//   POST /upload-logo?kind=agency|family   (multipart, field name: "media")
//   Key:  logos/{kind}/{uid}/{timestamp}_{uuid}.{jpg|png|webp}
//   Har upload ka naya key -> cache me purani photo nahi atakti.
// =====================================================
const LOGO_KINDS = new Set(["agency", "family"]);

app.post(
  "/upload-logo",
  uploadLimiter,
  verifyUser,
  runDpUpload,
  async (req, res) => {
    const file = req.file;
    try {
      if (!file) {
        return res.status(400).json({ success: false, error: "Photo nahi mili" });
      }
      const kind = await sniffImageType(file.path);
      if (!kind) {
        return res
          .status(400)
          .json({ success: false, error: "Sirf JPG, PNG ya WEBP photo chalegi." });
      }
      const folder = String((req.query && req.query.kind) || "");
      if (!LOGO_KINDS.has(folder)) {
        return res.status(400).json({ success: false, error: "Invalid kind" });
      }

      const uid = req.user.uid;
      const key = `logos/${folder}/${uid}/${Date.now()}_${crypto.randomUUID()}${kind.ext}`;

      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
          Body: fs.createReadStream(file.path),
          ContentLength: file.size,
          ContentType: kind.mime,
          CacheControl: "public, max-age=31536000, immutable",
        })
      );

      const base = String(process.env.R2_PUBLIC_URL).replace(/\/+$/, "");
      return res.json({ success: true, key, url: `${base}/${key}` });
    } catch (e) {
      console.error("LOGO UPLOAD ERROR:", e);
      return res.status(500).json({ success: false, error: "Photo upload nahi hui" });
    } finally {
      if (file && file.path) fsp.unlink(file.path).catch(() => {});
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
      // Level ab stars add karne se NAHI badhta (level = kharche se, functions/syncWalletLevel).
      // Admin ne manual level diya ho tabhi level badlega.
      const level = manualLevel === null
        ? Number(wSnap.exists ? (wSnap.data().level || 0) : 0)
        : manualLevel;

      if (wSnap.exists) {
        tx.update(walletRef, manualLevel === null ? { stars: total } : { stars: total, level, manualLevel });
      } else {
        tx.set(walletRef, {
          stars: total, level, earnings: 0, receivedStars: 0, totalSpent: 0,
          ...(manualLevel === null ? {} : { manualLevel }),
        });
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

      // 2b) User ki DP (R2: dp/{uid}/...)
      await deleteR2Prefix(`dp/${uid}/`);

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
    await db.collection("users").doc(uid).set({ banned: ban, banBy: admin.firestore.FieldValue.delete() }, { merge: true });
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
// DEVICE BAN: register / check / admin ban + unban
// =====================================================

// App login ke baad is device ko user se jodti hai (har app launch par ek baar)
app.post("/device/register", generalLimiter, verifyUser, async (req, res) => {
  try {
    const dh = req.deviceHash || deviceHash(req.body && req.body.deviceId);
    if (!dh) {
      return res.status(400).json({ success: false, error: "Invalid device" });
    }
    if (await isDeviceBanned(dh)) {
      await lockAccountOnBannedDevice(req.user.uid, dh);
      return res.status(403).json({
        success: false,
        code: "DEVICE_BANNED",
        error: "This device has been banned",
      });
    }
    // Pakki ID ("d_" = Android ID / iOS vendor ID) ke bina login nahi: kamzor ID reinstall se badal jati hai
    const rawId = String((req.body && req.body.deviceId) || req.headers["x-device-id"] || "");
    if (!rawId.startsWith("d_")) {
      return res.status(400).json({
        success: false,
        code: "DEVICE_UNSUPPORTED",
        error: "Please update the app",
      });
    }
    const uid = req.user.uid;
    const platform = String((req.body && req.body.platform) || "").slice(0, 20);
    const FV = admin.firestore.FieldValue;
    await Promise.all([
      db.collection("devices").doc(dh).set(
        { uids: FV.arrayUnion(uid), platform, lastSeen: FV.serverTimestamp() },
        { merge: true }
      ),
      db.collection("user_devices").doc(uid).set(
        { hashes: FV.arrayUnion(dh), updatedAt: FV.serverTimestamp() },
        { merge: true }
      ),
      db.collection("users").doc(uid).set(
        {
          deviceRegistered: true,
          deviceIdKind: req.body && req.body.idKind === "stable" ? "stable" : "weak",
        },
        { merge: true }
      ),
    ]);
    return res.json({ success: true });
  } catch (e) {
    console.error("DEVICE REGISTER ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// Login screen / app start (bina login) - kya ye device banned hai?
app.post("/device/check", generalLimiter, async (req, res) => {
  try {
    const dh = deviceHash((req.body && req.body.deviceId) || req.headers["x-device-id"]);
    if (!dh) return res.json({ success: true, banned: false });
    return res.json({ success: true, banned: await isDeviceBanned(dh) });
  } catch (e) {
    return res.json({ success: true, banned: false });
  }
});

async function setDeviceBan(req, res, ban, opts) {
  const protectStaff = !!(opts && opts.protectStaff); // official ke liye: admin/official ka device ban nahi
  try {
    const uid = String((req.body && req.body.uid) || "");
    if (!isValidUid(uid)) {
      return res.status(400).json({ success: false, error: "Invalid user" });
    }
    const reason = String((req.body && req.body.reason) || "").slice(0, 200);

    const udSnap = await db.collection("user_devices").doc(uid).get();
    const hashes =
      udSnap.exists && Array.isArray(udSnap.data().hashes) ? udSnap.data().hashes : [];
    if (!hashes.length) {
      return res.status(404).json({
        success: false,
        error:
          "Is user ka device abhi register nahi hai. User ko updated app ek baar kholni hogi.",
      });
    }

    if (ban) {
      if (uid === req.user.uid || (req.deviceHash && hashes.includes(req.deviceHash))) {
        return res
          .status(400)
          .json({ success: false, error: "Apna khud ka device ban nahi kar sakte" });
      }
    }

    // Is device par jitne bhi accounts login hue
    const linked = new Set([uid]);
    const devSnaps = await Promise.all(
      hashes.map((h) => db.collection("devices").doc(h).get())
    );
    devSnaps.forEach((d) => {
      if (d.exists && Array.isArray(d.data().uids)) {
        d.data().uids.forEach((u) => isValidUid(u) && linked.add(u));
      }
    });

    // Official ban kare to: is device par koi Admin / Official account ho to device ban mana hai
    if (ban && protectStaff) {
      for (const u of linked) {
        if (await isStaffUser(u)) {
          return res.status(403).json({
            success: false,
            error: "Is device par Admin / Official ka account hai, isliye device ban nahi ho sakta",
          });
        }
      }
    }

    const FV = admin.firestore.FieldValue;
    for (const h of hashes) {
      if (ban) {
        await db.collection("banned_devices").doc(h).set({
          uid,
          reason,
          bannedBy: req.user.uid,
          createdAt: FV.serverTimestamp(),
        });
      } else {
        await db.collection("banned_devices").doc(h).delete();
      }
      deviceBanCache.delete(h);
    }

    for (const u of linked) {
      try {
        if (await isAdminUser({ uid: u })) continue; // admin account kabhi band nahi
        const uRef = db.collection("users").doc(u);
        const uSnap = await uRef.get();
        const ud = uSnap.exists ? uSnap.data() : {};

        if (ban) {
          if (ud.deviceBanned !== true) {
            // pehle se normal-ban tha to unban par wapas chalu na ho
            await admin.auth().updateUser(u, { disabled: true });
            await admin.auth().revokeRefreshTokens(u);
            if (uSnap.exists) {
              await uRef.set(
                { banned: true, deviceBanned: true, banBeforeDevice: ud.banned === true },
                { merge: true }
              );
            }
          }
        } else if (ud.deviceBanned === true) {
          const keepBanned = ud.banBeforeDevice === true;
          if (!keepBanned) await admin.auth().updateUser(u, { disabled: false });
          await uRef.set(
            {
              deviceBanned: false,
              banned: keepBanned,
              banBeforeDevice: FV.delete(),
            },
            { merge: true }
          );
        }
      } catch (e) {
        console.error("DEVICE BAN ACCOUNT ERROR:", u, e.code || e.message);
      }
    }

    console.log(`${protectStaff ? "OFFICIAL" : "ADMIN"} DEVICE ${ban ? "BAN" : "UNBAN"}: by=${req.user.uid} uid=${uid} devices=${hashes.length} accounts=${linked.size}`);
    logModeration(req, ban ? "device_ban" : "device_unban", uid, { devices: hashes.length, accounts: linked.size, reason });
    return res.json({ success: true, devices: hashes.length, accounts: linked.size });
  } catch (e) {
    console.error("ADMIN DEVICE BAN ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

app.post("/admin/ban-device", generalLimiter, verifyUser, requireAdminDoc, (req, res) =>
  setDeviceBan(req, res, true)
);
app.post("/admin/unban-device", generalLimiter, verifyUser, requireAdminDoc, (req, res) =>
  setDeviceBan(req, res, false)
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
app.post("/admin/add-bd", generalLimiter, verifyUser, requireOfficialOrAdmin, async (req, res) => {
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
app.post("/admin/remove-bd", generalLimiter, verifyUser, requireOfficialOrAdmin, async (req, res) => {
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

app.post("/admin/list-bds", generalLimiter, verifyUser, requireOfficialOrAdmin, async (req, res) => {
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



// =====================================================
// AUTO (ek baar): purane agency members ko live (liveGranted) - deploy par apne aap
// =====================================================
async function grandfatherAgencyLiveOnce() {
  const markerRef = db.collection("config").doc("liveGrandfather");
  if ((await markerRef.get()).exists) return;
  let granted = 0, last = null;
  let batch = db.batch(), inBatch = 0;
  for (;;) {
    let q = db.collection("users").where("agencyId", ">", "").orderBy("agencyId").limit(400);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      if (d.data().liveGranted !== true) {
        batch.update(d.ref, { liveGranted: true });
        granted++; inBatch++;
        if (inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
      }
    }
    last = snap.docs[snap.docs.length - 1];
  }
  if (inBatch > 0) await batch.commit();
  await markerRef.set({ doneAt: admin.firestore.FieldValue.serverTimestamp(), granted });
  console.log(`LIVE GRANDFATHER done: ${granted} users`);
}

// =====================================================
// ADMIN: LEVEL RECALC (ek baar chalao) - level = totalSpent se
// Purane galat level (recharge se mile) theek ho jate hain.
// body: { apply?: true }   apply na ho to sirf DRY-RUN (kuch badalta nahi, count batata hai)
// manualLevel wale users ka level uske neeche nahi jata.
// =====================================================
const LEVEL_STEPS_SRV = [10, 60, 100, 160, 200, 280, 360, 540, 670, 870, 1000, 1150, 1300, 1600, 1900, 2400, 2800, 3500, 4000, 5050, 6100, 7200, 8200, 9000, 10500, 12300, 14000, 17000, 19000, 23000, 26000, 31000, 43000, 51000, 67000, 78000, 89000, 99000, 101000, 110000, 125000, 155000, 189000, 210000, 260000, 299000, 310000, 385000, 440000, 499000];
function levelFromSpentSrv(spent) {
  const n = Number(spent) || 0;
  let lv = 0;
  for (let i = 0; i < LEVEL_STEPS_SRV.length; i++) {
    if (n >= LEVEL_STEPS_SRV[i]) lv = i + 1; else break;
  }
  return lv;
}

app.post("/admin/recalc-levels", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const apply = !!(req.body && req.body.apply === true);
    let scanned = 0, changed = 0, last = null;
    let batch = db.batch(), inBatch = 0;
    for (;;) {
      let q = db.collection("wallets").orderBy(admin.firestore.FieldPath.documentId()).limit(400);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      for (const docSnap of snap.docs) {
        scanned++;
        const d = docSnap.data() || {};
        const manual = Math.min(50, Math.max(0, Math.floor(Number(d.manualLevel) || 0)));
        const target = Math.max(levelFromSpentSrv(d.totalSpent), manual);
        if ((Number(d.level) || 0) !== target) {
          changed++;
          if (apply) {
            batch.update(docSnap.ref, { level: target });
            inBatch++;
            if (inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
          }
        }
      }
      last = snap.docs[snap.docs.length - 1];
    }
    if (apply && inBatch > 0) await batch.commit();
    console.log(`RECALC LEVELS by ${req.user.uid} apply=${apply} scanned=${scanned} changed=${changed}`);
    return res.json({ success: true, apply, scanned, changed });
  } catch (e) {
    console.error("RECALC LEVELS ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// =====================================================
// ADMIN: PURANE AGENCY MEMBERS KO LIVE (liveGranted) - ek baar chalao
// Naye rule ke baad agency join karne se live NAHI milta (white tick chahiye).
// Jo log ABHI agency me hain unko liveGranted = true de do taaki unka live na ruke.
// body: { apply?: true }  (dry-run default)
// IMPORTANT: ye naya app / naye rules lagane SE PEHLE chalao.
// =====================================================
app.post("/admin/grant-live-existing-agency", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const apply = !!(req.body && req.body.apply === true);
    let scanned = 0, granted = 0, last = null;
    let batch = db.batch(), inBatch = 0;
    for (;;) {
      let q = db.collection("users").where("agencyId", ">", "").orderBy("agencyId").limit(400);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      for (const docSnap of snap.docs) {
        scanned++;
        const d = docSnap.data() || {};
        if (d.liveGranted !== true) {
          granted++;
          if (apply) {
            batch.update(docSnap.ref, { liveGranted: true });
            inBatch++;
            if (inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
          }
        }
      }
      last = snap.docs[snap.docs.length - 1];
    }
    if (apply && inBatch > 0) await batch.commit();
    console.log(`GRANT LIVE EXISTING by ${req.user.uid} apply=${apply} scanned=${scanned} granted=${granted}`);
    return res.json({ success: true, apply, scanned, granted });
  } catch (e) {
    console.error("GRANT LIVE EXISTING ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// =====================================================
// USER APNA FRAME / ENTRY CHUNE YA HATAYE (Settings > Frames & Entries)
// users/{uid}:  frameOff, frameChoice, entryOff, entryChoice
//   frameChoice = "lv30" (level frame)  ya  "adm:<key>" (admin ka diya frame)  ya null (auto = sabse bada)
//   entryChoice = "slide" | "wing1".."wing5"  ya null (auto = level ke hisaab se)
// Server check karta hai ki user ke paas wo frame/entry sach me hai.
// =====================================================
const LEVEL_FRAME_TIERS = [10, 20, 30, 35, 40, 45, 50];
// Agency / BD ka frame ab apne aap NAHI milta (sirf admin frame de to). Sirf crown / vip1 (admin set kare).
const SPECIAL_FRAME_TIER = { crown: 40, vip1: 50 };
const ENTRY_MIN_LEVEL = { slide: 0, wing1: 10, wing2: 20, wing3: 30, wing4: 40, wing5: 50 };

function levelTierOf(lv) {
  lv = Number(lv) || 0;
  let t = 0;
  for (const x of LEVEL_FRAME_TIERS) if (lv >= x) t = x;
  return t;
}

function ownedFrameInfo(d) {
  let special = null;
  if (d.special && SPECIAL_FRAME_TIER[d.special]) special = d.special;
  const maxTier = Math.max(levelTierOf(d.level), special ? SPECIAL_FRAME_TIER[special] : 0);
  return { maxTier, adminFrame: d.adminFrame && ADMIN_FRAME_KEYS.includes(d.adminFrame) ? d.adminFrame : null };
}

// body: { frameOff?, frameChoice?, entryOff?, entryChoice? }  (jo bheje wahi badlega)
app.post("/user/set-frame-prefs", generalLimiter, verifyUser, async (req, res) => {
  try {
    const uid = req.user.uid;
    const b = req.body || {};
    const ref = db.collection("users").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ success: false, error: "User not found" });
    const d = snap.data();
    const owned = ownedFrameInfo(d);
    const lvl = Number(d.level) || 0;

    const update = {};
    const del = admin.firestore.FieldValue.delete();

    if (Object.prototype.hasOwnProperty.call(b, "frameOff")) {
      update.frameOff = b.frameOff === true ? true : del;
    }
    if (Object.prototype.hasOwnProperty.call(b, "entryOff")) {
      update.entryOff = b.entryOff === true ? true : del;
    }

    if (Object.prototype.hasOwnProperty.call(b, "frameChoice")) {
      const c = b.frameChoice ? String(b.frameChoice) : null;
      if (c === null) {
        update.frameChoice = del; // auto
      } else if (/^lv\d+$/.test(c)) {
        const t = Number(c.slice(2));
        if (!LEVEL_FRAME_TIERS.includes(t) || t > owned.maxTier) {
          return res.status(403).json({ success: false, error: "Ye frame abhi aapke paas nahi hai" });
        }
        update.frameChoice = c;
        update.frameOff = del; // frame chuna = frame ON
      } else if (c.indexOf("adm:") === 0) {
        const k = c.slice(4);
        if (!owned.adminFrame || owned.adminFrame !== k) {
          return res.status(403).json({ success: false, error: "Ye frame aapko admin se nahi mila" });
        }
        update.frameChoice = c;
        update.frameOff = del;
      } else {
        return res.status(400).json({ success: false, error: "Invalid frame" });
      }
    }

    if (Object.prototype.hasOwnProperty.call(b, "entryChoice")) {
      const c = b.entryChoice ? String(b.entryChoice) : null;
      if (c === null) {
        update.entryChoice = del; // auto
      } else if (Object.prototype.hasOwnProperty.call(ENTRY_MIN_LEVEL, c)) {
        if (lvl < ENTRY_MIN_LEVEL[c]) {
          return res.status(403).json({ success: false, error: "Ye entry abhi aapke paas nahi hai" });
        }
        update.entryChoice = c;
        update.entryOff = del; // entry chuni = entry ON
      } else {
        return res.status(400).json({ success: false, error: "Invalid entry" });
      }
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({ success: false, error: "Kuch badla nahi" });
    }
    await ref.set(update, { merge: true });

    const out = await ref.get();
    const o = out.data() || {};
    return res.json({
      success: true,
      prefs: {
        frameOff: o.frameOff === true,
        frameChoice: o.frameChoice || null,
        entryOff: o.entryOff === true,
        entryChoice: o.entryChoice || null,
      },
    });
  } catch (e) {
    console.error("USER SET FRAME PREFS ERROR:", e);
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
app.post("/admin/delete-agency", generalLimiter, verifyUser, requireOfficialOrAdmin, async (req, res) => {
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
    // banBy: sirf BD ne lagayi ban par BD uid; Official / Admin ki ban par hata deta hai (BD wo hata na sake)
    await db.collection("users").doc(uid).set(
      { banned: ban, banBy: ban && req.bdActor ? req.bdActor : admin.firestore.FieldValue.delete() },
      { merge: true }
    );
    console.log(`OFFICIAL ${ban ? "BAN" : "UNBAN"}: by=${req.user.uid} user=${uid}`);
    logModeration(req, ban ? "user_ban" : "user_unban", uid);
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
const officialLiveRestrict = async (req, res) => {
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

    const wanted = [];
    const apply = (field, days) => {
      const d = Number(days);
      if (!ALLOWED.includes(d)) throw Object.assign(new Error("Invalid days"), { code: 400 });
      wanted.push({ field, d });
      banUpd[field.replace("Until", "By")] = req.bdActor ? "bd:" + req.bdActor : "staff";
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

    // BD ki hadd: Official / Admin / auto ki pabandi BD hata ya chhoti nahi kar sakta (badha sakta hai)
    if (req.bdActor) {
      const lb = await db.collection("liveBans").doc(uid).get();
      const lbd = lb.exists ? lb.data() : {};
      const ud = uSnap.data() || {};
      for (const { field, d } of wanted) {
        const cur = Number(ud[field]) || 0;
        if (cur <= Date.now()) continue; // koi chalu pabandi nahi
        const byBd = typeof lbd[field.replace("Until", "By")] === "string" && lbd[field.replace("Until", "By")].startsWith("bd:");
        if (byBd) continue; // BD ki apni lagayi pabandi, badal sakta hai
        if (d === 0 || Date.now() + d * DAY_MS < cur) {
          return res.status(403).json({ success: false, error: "Ye pabandi Official / Admin ne lagayi hai, BD ise hata ya kam nahi kar sakta" });
        }
      }
    }

    banUpd.updatedBy = req.user.uid;
    banUpd.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await uRef.set(userUpd, { merge: true });
    await db.collection("liveBans").doc(uid).set(banUpd, { merge: true });
    console.log(`OFFICIAL LIVE RESTRICT: by=${req.user.uid} user=${uid}`, JSON.stringify(req.body));
    logModeration(req, "live_restrict", uid, { entryDays: req.body.entryDays, liveDays: req.body.liveDays });
    return res.json({ success: true });
  } catch (e) {
    if (e && e.code === 400) return res.status(400).json({ success: false, error: e.message });
    console.error("OFFICIAL LIVE RESTRICT ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};
app.post("/official/live-restrict", generalLimiter, verifyUser, requireOfficialOrAdmin, officialLiveRestrict);

// VIDEO LIVE AUTO BAN: host ka face 5 min se zyada nahi dikha / black screen raha -> 30 min live band.
// App (videolive.tsx) khud call karta hai. Sirf apni hi uid par lagta hai, aur pehle se bada ban ho to chhota nahi karta.
const AUTO_VIDEO_BAN_MS = 30 * 60 * 1000;
app.post("/live/auto-video-ban", generalLimiter, verifyUser, async (req, res) => {
  try {
    const uid = req.user.uid;
    const uRef = db.collection("users").doc(uid);
    const uSnap = await uRef.get();
    if (!uSnap.exists) return res.status(404).json({ success: false, error: "User not found" });

    const cur = Number((uSnap.data() || {}).liveBanUntil) || 0;
    const until = Math.max(cur, Date.now() + AUTO_VIDEO_BAN_MS);
    const reason = "Video live me 5 minute se zyada face nahi dikha / black screen raha";

    await uRef.set({ liveBanUntil: until }, { merge: true });
    await db.collection("liveBans").doc(uid).set(
      { uid, liveBanUntil: until, reason, updatedBy: "auto", updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    console.log(`AUTO VIDEO BAN: user=${uid} until=${until}`);
    return res.json({ success: true, until });
  } catch (e) {
    console.error("AUTO VIDEO BAN ERROR:", e);
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
// OFFICIAL LIVE TOOLS  (live me baithe-baithe: search + ID ban + DEVICE ban + live band)
// Saari checks server par: sirf Official / Admin. Admin ya Official ko koi ban / band nahi kar sakta.
// Har action moderation_logs me likha jata hai (kisne, kispar, kya).
// =====================================================================
async function isOfficialUser(uid) {
  try {
    const s = await db.collection("users").doc(uid).get();
    return s.exists && s.data().isOfficial === true;
  } catch (_) {
    return false;
  }
}

async function isStaffUser(uid) {
  return (await isAdminUser({ uid })) || (await isOfficialUser(uid));
}

function logModeration(req, action, targetUid, extra) {
  try {
    db.collection("moderation_logs")
      .add({
        action,
        by: req.user.uid,
        target: targetUid || "",
        extra: extra || {},
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      .catch(() => {});
  } catch (_) {}
}

// Official: device ban / unban (user ka device + us device par login saare accounts)
app.post("/official/ban-device", generalLimiter, verifyUser, requireOfficialOrAdmin, (req, res) =>
  setDeviceBan(req, res, true, { protectStaff: true })
);
app.post("/official/unban-device", generalLimiter, verifyUser, requireOfficialOrAdmin, (req, res) =>
  setDeviceBan(req, res, false, { protectStaff: true })
);

// body: { q } -> username prefix YA exact uid. Result me live status + device ban status bhi.
const officialLiveSearch = async (req, res) => {
  try {
    const raw = cleanText(req.body && req.body.q, 60).replace(/^@/, "");
    if (raw.length < 1) return res.json({ success: true, users: [] });

    const found = new Map(); // uid -> user data
    if (isValidUid(raw) && raw.length >= 20) {
      const d = await db.collection("users").doc(raw).get();
      if (d.exists) found.set(d.id, d.data());
    }
    const variants = Array.from(new Set([raw.toLowerCase(), raw]));
    for (const q of variants) {
      const snap = await db
        .collection("users")
        .where("username", ">=", q)
        .where("username", "<=", q + "\uf8ff")
        .orderBy("username")
        .limit(15)
        .get();
      snap.docs.forEach((d) => found.set(d.id, d.data()));
    }

    const ids = Array.from(found.keys()).slice(0, 15);
    const liveMap = new Map(); // hostId -> roomId
    const deviceKnown = new Set();
    if (ids.length) {
      for (let i = 0; i < ids.length; i += 10) {
        const chunk = ids.slice(i, i + 10);
        const rs = await db.collection("rooms").where("hostId", "in", chunk).get();
        rs.docs.forEach((r) => {
          const h = r.data().hostId;
          if (h && !liveMap.has(h)) liveMap.set(h, r.id);
        });
      }
      const udSnaps = await db.getAll(...ids.map((id) => db.collection("user_devices").doc(id)));
      udSnaps.forEach((d) => {
        if (d.exists && Array.isArray(d.data().hashes) && d.data().hashes.length) deviceKnown.add(d.id);
      });
    }

    const users = ids.map((id) => ({
      ...officialUserBrief(id, found.get(id)),
      deviceBanned: found.get(id).deviceBanned === true,
      deviceKnown: deviceKnown.has(id),
      liveRoomId: liveMap.get(id) || "",
    }));
    return res.json({ success: true, users });
  } catch (e) {
    console.error("OFFICIAL LIVE SEARCH ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};
app.post("/official/live-search", generalLimiter, verifyUser, requireOfficialOrAdmin, officialLiveSearch);

// body: { roomId } YA { uid }  -> us live ko sabke liye zabardasti band (host + sab viewers bahar).
// Room doc delete hote hi app ka handleRoomEnded sabko nikal deta hai.
const officialEndLive = async (req, res) => {
  try {
    const roomId = String((req.body && req.body.roomId) || "");
    const uid = String((req.body && req.body.uid) || "");
    const rooms = [];
    if (roomId) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(roomId)) {
        return res.status(400).json({ success: false, error: "Invalid room" });
      }
      const s = await db.collection("rooms").doc(roomId).get();
      if (s.exists) rooms.push(s);
    } else if (isValidUid(uid)) {
      const q = await db.collection("rooms").where("hostId", "==", uid).limit(5).get();
      q.docs.forEach((d) => rooms.push(d));
    } else {
      return res.status(400).json({ success: false, error: "Room ya user chahiye" });
    }
    if (!rooms.length) {
      return res.status(404).json({ success: false, error: "Live nahi mili (shayad pehle hi band ho gayi)" });
    }

    let ended = 0;
    for (const r of rooms) {
      const hostId = String(r.data().hostId || "");
      if (hostId && hostId !== req.user.uid && (await isStaffUser(hostId))) {
        return res.status(403).json({ success: false, error: "Admin / Official ki live band nahi kar sakte" });
      }
      await r.ref.delete(); // pehle doc: sabke "All Live" se turant gayab + sab bahar
      db.recursiveDelete(r.ref).catch((e) => console.error("END LIVE CLEANUP:", r.id, e.message)); // chat / audience
      ended += 1;
      logModeration(req, "end_live", hostId, { roomId: r.id });
      console.log(`OFFICIAL END LIVE: by=${req.user.uid} room=${r.id} host=${hostId}`);
    }
    return res.json({ success: true, ended });
  } catch (e) {
    console.error("OFFICIAL END LIVE ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};
app.post("/official/end-live", generalLimiter, verifyUser, requireOfficialOrAdmin, officialEndLive);

// =====================================================================
// BD: live room ke andar moderation (Official jaisa, par DEVICE BAN NAHI)
//  - search, ID ban/unban, live-chalane / live-dekhne par pabandi (sirf 3/7/30 din), live band
//  - Official / Admin par kuch nahi chalta, apne aap par bhi nahi
//  - Asli check yahin: bds/{uid} doc active (requireBD jaisa)
// =====================================================================
const BD_LIVE_DAYS = [0, 3, 7, 30]; // 0 = pabandi hatao
async function bdLiveGuard(req, res, next) {
  try {
    const snap = await db.collection("bds").doc(req.user.uid).get();
    if (snap.exists && snap.data().active !== false) return next();
  } catch (_) {}
  return res.status(403).json({ success: false, error: "BD access required" });
}
app.post("/bdlive/live-search", generalLimiter, verifyUser, bdLiveGuard, officialLiveSearch);
app.post("/bdlive/end-live", generalLimiter, verifyUser, bdLiveGuard, officialEndLive);
app.post("/bdlive/ban-user", generalLimiter, verifyUser, bdLiveGuard, (req, res) => {
  req.bdActor = req.user.uid;
  return officialSetBan(req, res, true);
});
app.post("/bdlive/unban-user", generalLimiter, verifyUser, bdLiveGuard, async (req, res) => {
  try {
    const uid = String((req.body && req.body.uid) || "");
    if (!isValidUid(uid)) return res.status(400).json({ success: false, error: "Invalid user" });
    const d = (await db.collection("users").doc(uid).get()).data() || {};
    // BD sirf apni (kisi BD ki) lagayi ID ban hata sakta hai; Official / Admin / device ban nahi
    if (d.deviceBanned === true || !(typeof d.banBy === "string" && d.banBy)) {
      return res.status(403).json({ success: false, error: "Ye ban Official / Admin ne lagayi hai, BD hata nahi sakta" });
    }
    if (!(await db.collection("bds").doc(d.banBy).get()).exists) {
      return res.status(403).json({ success: false, error: "Ye ban Official / Admin ne lagayi hai, BD hata nahi sakta" });
    }
    req.bdActor = req.user.uid;
    return officialSetBan(req, res, false);
  } catch (e) {
    console.error("BD UNBAN ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});
app.post("/bdlive/live-restrict", generalLimiter, verifyUser, bdLiveGuard, async (req, res) => {
  try {
    const b = req.body || {};
    for (const k of ["entryDays", "liveDays"]) {
      if (b[k] !== undefined && !BD_LIVE_DAYS.includes(Number(b[k]))) {
        return res.status(400).json({ success: false, error: "BD sirf 3, 7 ya 30 din laga sakta hai" });
      }
    }
    const uid = String(b.uid || "");
    if (!isValidUid(uid)) return res.status(400).json({ success: false, error: "Invalid user" });
    if (uid === req.user.uid) return res.status(400).json({ success: false, error: "Apne aap par nahi laga sakte" });
    if (await isStaffUser(uid)) {
      return res.status(403).json({ success: false, error: "Admin / Official par pabandi nahi laga sakte" });
    }
    req.bdActor = req.user.uid;
    return officialLiveRestrict(req, res);
  } catch (e) {
    console.error("BD LIVE RESTRICT ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// =====================================================================
// MODERATION (gali filter ke saath jude ban + voice report + STT webhook)
// =====================================================================
moderation = require("./moderation")({
  app,
  admin,
  db,
  verifyUser,
  generalLimiter,
  requireOfficialOrAdmin,
  isValidUid,
});

// =====================================================================
// FIRESTORE RULES me add karo (app ka useLiveBanGuard liveBans/{uid} sunta hai):
//
//   match /liveBans/{uid} {
//     allow read: if isOwner(uid) || isAdmin() || isOfficial();
//     allow write: if false;
//   }
// =====================================================================

// =====================================================================
// ADMIN PANEL -> Official manage (officialAdmin.js yahi 3 routes call karta hai)
// Sirf ADMIN. users/{uid}.isOfficial server (Admin SDK) hi set karta hai.
// =====================================================================

// body: { username }
app.post("/admin/add-official", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const raw = cleanText(req.body && req.body.username, 80).replace(/^@/, "");
    if (!raw) return res.status(400).json({ success: false, error: "Username daalo" });
    let q = await db.collection("users").where("username", "==", raw).limit(1).get();
    if (q.empty && raw.toLowerCase() !== raw) {
      q = await db.collection("users").where("username", "==", raw.toLowerCase()).limit(1).get();
    }
    if (q.empty) return res.status(404).json({ success: false, error: "User not found" });
    const uid = q.docs[0].id;
    if (q.docs[0].data().isOfficial === true) {
      return res.status(400).json({ success: false, error: "Ye user pehle se Official hai" });
    }
    await db.collection("users").doc(uid).set({ isOfficial: true }, { merge: true });
    console.log(`ADMIN ADD OFFICIAL: by=${req.user.uid} official=${uid}`);
    return res.json({ success: true, uid });
  } catch (e) {
    console.error("ADMIN ADD OFFICIAL ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// body: { uid }
app.post("/admin/remove-official", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const uid = String((req.body && req.body.uid) || "");
    if (!isValidUid(uid)) return res.status(400).json({ success: false, error: "Invalid user" });
    await db.collection("users").doc(uid).set({ isOfficial: false }, { merge: true });
    console.log(`ADMIN REMOVE OFFICIAL: by=${req.user.uid} official=${uid}`);
    return res.json({ success: true });
  } catch (e) {
    console.error("ADMIN REMOVE OFFICIAL ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

app.post("/admin/list-officials", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const snap = await db.collection("users").where("isOfficial", "==", true).limit(200).get();
    const officials = snap.docs
      .map((d) => ({
        uid: d.id,
        username: d.data().username || "",
        profileImg: d.data().profileImg || "",
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
    return res.json({ success: true, officials });
  } catch (e) {
    console.error("ADMIN LIST OFFICIALS ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

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

// Withdrawal (request + admin Success/Failed). Success par user ke Gift Stars katte hain.
require("./withdrawRoutes")({
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
// EVENT LEADERBOARD  (10 Nov -> 10 Dec)
// Event ke dauran jo videos post hue, unke views user-wise aur agency-wise.
// Result 60 sec cache hota hai, isliye app smooth/fast rehta hai.
// =====================================================

// IST me: 10 Nov 2026 00:00  ->  10 Dec 2026 23:59:59   (yahin se badlo, app ke event.js me bhi same rakho)
const EVENT_START_MS = new Date("2026-11-01T00:00:00+05:30").getTime();
const EVENT_END_MS = new Date("2026-12-10T23:59:59+05:30").getTime();
// Agency ka default target (members ko mile total STARS). Kisi agency ko alag target dena ho to
// agencies/{id} me `eventTarget` (number) daal do.
const EVENT_AGENCY_TARGET = 100000;
const EVENT_CACHE_MS = 60 * 1000;
const EVENT_MAX_VIDEOS = 20000;

let eventCache = { at: 0, data: null, pending: null };

async function buildEventBoard() {
  const vSnap = await db
    .collection("all_videos")
    .where("createdAt", ">=", admin.firestore.Timestamp.fromMillis(EVENT_START_MS))
    .where("createdAt", "<=", admin.firestore.Timestamp.fromMillis(EVENT_END_MS))
    .select("userId", "views")
    .limit(EVENT_MAX_VIDEOS)
    .get();

  // user -> { videos, views }
  const perUser = new Map();
  vSnap.docs.forEach((d) => {
    const x = d.data();
    const uid = x.userId;
    if (!uid || typeof uid !== "string") return;
    const cur = perUser.get(uid) || { uid, videos: 0, views: 0 };
    cur.videos += 1;
    cur.views += Number(x.views) || 0;
    perUser.set(uid, cur);
  });

  const users = Array.from(perUser.values());

  // saare uploaders ke profile (naam, dp, agency) - 300-300 ke batch me
  const uRefs = users.map((u) => db.collection("users").doc(u.uid));
  const profiles = new Map();
  for (let i = 0; i < uRefs.length; i += 300) {
    const snaps = await db.getAll(
      ...uRefs.slice(i, i + 300),
      { fieldMask: ["username", "name", "profileImg", "agencyId", "banned"] }
    );
    snaps.forEach((sn) => {
      if (sn.exists) profiles.set(sn.id, sn.data());
    });
  }

  const rows = [];
  const perAgency = new Map();
  users.forEach((u) => {
    const p = profiles.get(u.uid);
    if (!p || p.banned === true) return; // banned user event me nahi
    const row = {
      uid: u.uid,
      name: p.username || p.name || "User",
      dp: p.profileImg || "",
      videos: u.videos,
      views: u.views,
      agencyId: p.agencyId || "",
    };
    rows.push(row);
    if (row.agencyId) {
      const a = perAgency.get(row.agencyId) || { id: row.agencyId, views: 0, videos: 0, creators: 0 };
      a.views += row.views;
      a.videos += row.videos;
      a.creators += 1;
      perAgency.set(row.agencyId, a);
    }
  });

  rows.sort((a, b) => b.views - a.views || b.videos - a.videos);
  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));

  // Agency ranking = agency ke saare members ko mile stars ka total (wallets/{uid}.receivedStars)
  const [agSnap, memSnap] = await Promise.all([
    db.collection("agencies").get(),
    db.collection("users").where("agencyId", ">", "").select("agencyId").get(),
  ]);
  const memberOf = new Map(); // uid -> agencyId
  const memberCount = new Map();
  memSnap.docs.forEach((d) => {
    const id = d.data().agencyId;
    if (!id) return;
    memberOf.set(d.id, id);
    memberCount.set(id, (memberCount.get(id) || 0) + 1);
  });
  const memUids = Array.from(memberOf.keys());
  const starsOf = new Map(); // agencyId -> total stars
  for (let i = 0; i < memUids.length; i += 300) {
    const snaps = await db.getAll(
      ...memUids.slice(i, i + 300).map((u) => db.collection("wallets").doc(u)),
      { fieldMask: ["receivedStars"] }
    );
    snaps.forEach((sn) => {
      if (!sn.exists) return;
      const ag = memberOf.get(sn.id);
      starsOf.set(ag, (starsOf.get(ag) || 0) + (Number(sn.data().receivedStars) || 0));
    });
  }

  const agencies = [];
  agSnap.docs.forEach((sn) => {
    const d = sn.data();
    if (d.status === "blocked") return;
    const pa = perAgency.get(sn.id);
    const target = Number(d.eventTarget) > 0 ? Number(d.eventTarget) : EVENT_AGENCY_TARGET;
    agencies.push({
      id: sn.id,
      name: d.agencyName || "Agency",
      logo: d.logo || "",
      stars: starsOf.get(sn.id) || 0,
      members: memberCount.get(sn.id) || Number(d.totalMembers) || 0,
      views: pa ? pa.views : 0,
      videos: pa ? pa.videos : 0,
      target,
    });
  });
  agencies.sort((a, b) => b.stars - a.stars);

  return {
    startMs: EVENT_START_MS,
    endMs: EVENT_END_MS,
    updatedAt: Date.now(),
    totalCreators: ranked.length,
    totalVideos: ranked.reduce((s, r) => s + r.videos, 0),
    totalViews: ranked.reduce((s, r) => s + r.views, 0),
    ranked, // poori list (me ka rank nikalne ke liye); response me top 50 hi jati hai
    agencies: agencies.slice(0, 10).map((a, i) => ({ ...a, rank: i + 1 })),
  };
}

async function getEventBoard() {
  const now = Date.now();
  if (eventCache.data && now - eventCache.at < EVENT_CACHE_MS) return eventCache.data;
  if (eventCache.pending) return eventCache.pending; // ek hi baar DB padho, baaki wait karein
  eventCache.pending = buildEventBoard()
    .then((data) => {
      eventCache = { at: Date.now(), data, pending: null };
      return data;
    })
    .catch((e) => {
      eventCache.pending = null;
      if (eventCache.data) return eventCache.data; // error me purana data de do
      throw e;
    });
  return eventCache.pending;
}

app.post("/event/leaderboard", generalLimiter, verifyUser, async (req, res) => {
  try {
    const b = await getEventBoard();
    const uid = req.user.uid;
    const me = b.ranked.find((r) => r.uid === uid) || null;
    return res.json({
      success: true,
      startMs: b.startMs,
      endMs: b.endMs,
      updatedAt: b.updatedAt,
      totalCreators: b.totalCreators,
      totalVideos: b.totalVideos,
      totalViews: b.totalViews,
      users: b.ranked.slice(0, 50).map(({ agencyId, ...r }) => r),
      agencies: b.agencies,
      me: me ? { rank: me.rank, videos: me.videos, views: me.views } : null,
    });
  } catch (e) {
    console.error("EVENT LEADERBOARD ERROR:", e && e.message);
    return res.status(500).json({ success: false, error: "Event data load nahi hua" });
  }
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

      // Ek baar apne aap: jo log ABHI agency me hain unko liveGranted = true.
      // Marker doc (config/liveGrandfather) ban jaye to dobara kabhi nahi chalta,
      // isliye naye agency members ko ye live nahi dega (unko white tick chahiye).
      grandfatherAgencyLiveOnce().catch((e) =>
        console.error("LIVE GRANDFATHER ERROR:", e)
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