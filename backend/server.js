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

const {
  S3Client,
  PutObjectCommand,
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

app.disable("x-powered-by");

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
    5 * 60 * 1000,
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

  max: 30,

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
      100 * 1024 * 1024,

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
  body
) {

  if (
    !isValidUid(targetUid) ||
    !isValidUid(senderUid)
  ) {
    return;
  }


  if (
    typeof title !== "string" ||
    title.length > 200
  ) {
    return;
  }


  if (!isValidMessage(body)) {
    return;
  }


  const userSnap =
    await db
      .collection("users")
      .doc(targetUid)
      .get();


  if (!userSnap.exists) {
    return;
  }


  const userData =
    userSnap.data();


  const token =
    userData.fcmToken;


  if (
    !token ||
    typeof token !== "string" ||
    token.length > 5000
  ) {
    return;
  }


  try {

    await admin
      .messaging()
      .send({

        token,

        notification: {
          title,
          body,
        },

        data: {

          type: "chat",

          senderUid:
            senderUid || "",

        },

        android: {

          priority: "high",

          notification: {

            channelId: "default",

            sound: "default",

          },

        },

        apns: {

          payload: {

            aps: {
              sound: "default",
            },

          },

        },

      });


  } catch (e) {

    console.error(
      "FCM ERROR:",
      e.code || "unknown"
    );


    if (
      e.code ===
      "messaging/registration-token-not-registered"
    ) {

      try {

        await db
          .collection("users")
          .doc(targetUid)
          .update({

            fcmToken:
              admin.firestore
                .FieldValue
                .delete(),

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


      let agoraUid =
        hash.readUInt32BE(0);


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
// MERGE VIDEO + AUDIO
// =====================================================

app.post(

  "/merge",

  uploadLimiter,

  verifyUser,

  upload.single("video"),

  async (req, res) => {

    let videoPath = null;

    let audioPath = null;

    let outputPath = null;


    try {

      if (!req.file) {

        return res.status(400).json({

          success: false,

          error: "Video missing",

        });

      }


      const rawAudioUrl =
        req.body.audioUrl;


      if (
        typeof rawAudioUrl !== "string" ||
        rawAudioUrl.length > 2048
      ) {

        return res.status(400).json({

          success: false,

          error: "Invalid audio URL",

        });

      }


      const audioUrl =
        await validateExternalAudioUrl(
          rawAudioUrl
        );


      videoPath =
        req.file.path;


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


      audioPath =
        path.join(
          tempDir,
          `${fileId}.mp3`
        );


      outputPath =
        path.join(
          tempDir,
          `${fileId}.mp4`
        );


      // -------------------------------------------------
      // DOWNLOAD AUDIO
      // -------------------------------------------------

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
              audioPath
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


      // -------------------------------------------------
      // MERGE
      // -------------------------------------------------

      await new Promise(
        (resolve, reject) => {

          ffmpeg()

            .input(videoPath)

            .input(audioPath)

            .outputOptions([

              "-map 0:v:0",

              "-map 1:a:0",

              "-c:v copy",

              "-c:a aac",

              "-shortest",

            ])

            .save(outputPath)

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


      // -------------------------------------------------
      // R2 UPLOAD
      // -------------------------------------------------

      const fileName =
        `${crypto.randomUUID()}.mp4`;


      await r2.send(

        new PutObjectCommand({

          Bucket:
            process.env.R2_BUCKET,

          Key:
            fileName,

          Body:
            fs.createReadStream(
              outputPath
            ),

          ContentType:
            "video/mp4",

        })

      );


      const videoUrl =
        `${process.env.R2_PUBLIC_URL}/${fileName}`;


      return res.json({

        success: true,

        video: videoUrl,

      });


    } catch (e) {

      console.error(
        "MERGE ERROR:",
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
        audioPath
      );

      await cleanupFile(
        outputPath
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
                "720x?",

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


      let senderName =
        "New message";


      if (senderSnap.exists) {

        const senderData =
          senderSnap.data();


        if (
          typeof senderData.name === "string" &&
          senderData.name.length <= 100
        ) {

          senderName =
            senderData.name;

        }

      }


      await sendPushNotification(

        receiverUid,

        senderUid,

        senderName,

        message

      );


      return res.json({

        success: true,

      });


    } catch (e) {

      console.error(
        "NOTIFICATION ERROR:",
        e.message
      );


      return res.status(500).json({

        success: false,

        error:
          "Notification failed",

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
          "Video size must be less than 100MB",

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