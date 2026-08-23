

require("dotenv").config();

const multer = require("multer");
const axios = require("axios");

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  S3Client,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");

const express = require("express");
const {
  RtcTokenBuilder,
  RtcRole,
} = require("agora-token");

const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const cron = require("node-cron");


// =====================================================
// ENV CHECK
// =====================================================

console.log(
  "AGORA_APP_ID =",
  process.env.AGORA_APP_ID
);

console.log(
  "AGORA_APP_CERTIFICATE =",
  process.env.AGORA_APP_CERTIFICATE
    ? "Loaded"
    : "Missing"
);

console.log(
  "R2_ENDPOINT =",
  process.env.R2_ENDPOINT
    ? "Loaded"
    : "Missing"
);

console.log(
  "R2_BUCKET =",
  process.env.R2_BUCKET
    ? "Loaded"
    : "Missing"
);

console.log(
  "R2_PUBLIC_URL =",
  process.env.R2_PUBLIC_URL
    ? "Loaded"
    : "Missing"
);


// =====================================================
// FIREBASE
// =====================================================

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

app.set("trust proxy", true);

app.use(express.json());

app.use(helmet());

app.use(cors());


// =====================================================
// RATE LIMIT
// =====================================================

const uploadLimiter = rateLimit({

  windowMs: 60 * 1000,

  max: 100,

  message: {
    success: false,
    error:
      "Too many upload requests. Please wait 1 minute.",
  },

});


// =====================================================
// REQUEST LOGGER
// =====================================================

app.use((req, res, next) => {

  console.log(
    "REQUEST:",
    req.method,
    req.url
  );

  next();

});


// =====================================================
// MULTER
// =====================================================

const upload = multer({

  dest: "uploads/",

  limits: {
    fileSize: 100 * 1024 * 1024,
  },

  fileFilter: (
    req,
    file,
    cb
  ) => {

    const allowedTypes = [
      "video/mp4",
      "video/quicktime",
    ];

    if (
      allowedTypes.includes(
        file.mimetype
      )
    ) {

      cb(null, true);

    } else {

      cb(
        new Error(
          "Only MP4 and MOV videos are allowed"
        )
      );

    }

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
// VERIFY USER
// =====================================================

async function verifyUser(
  req,
  res,
  next
) {

  try {

    const authHeader =
      req.headers.authorization;

    if (!authHeader) {

      return res.status(401).json({

        success: false,

        error:
          "Authorization header missing",

      });

    }

    const token =
      authHeader.replace(
        "Bearer ",
        ""
      );

    const decodedToken =
      await admin
        .auth()
        .verifyIdToken(token);

    req.user =
      decodedToken;

    next();

  } catch (err) {

    console.log(
      "AUTH ERROR =",
      err
    );

    return res.status(401).json({

      success: false,

      error:
        "Invalid Firebase Token",

    });

  }

}


// =====================================================
// PUSH NOTIFICATION
// =====================================================

async function sendPushNotification(

  targetUid,

  senderUid,

  title,

  body

) {

  try {

    const userSnap =
      await db
        .collection("users")
        .doc(targetUid)
        .get();

    if (!userSnap.exists) {

      console.log(
        "USER NOT FOUND =",
        targetUid
      );

      return;

    }

    const userData =
      userSnap.data();

    const token =
      userData.fcmToken;

    console.log(
      "FCM TOKEN =",
      token
    );

    console.log(
      "SENDING PUSH TO UID =",
      targetUid
    );

    if (!token) {

      console.log(
        "TOKEN MISSING"
      );

      return;

    }

    const response =
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

              channelId:
                "default",

              sound:
                "default",

            },

          },

          apns: {

            payload: {

              aps: {

                sound:
                  "default",

              },

            },

          },

        });

    console.log(
      "NOTIFICATION SENT"
    );

    console.log(
      "FCM RESPONSE =",
      response
    );

  } catch (e) {

    console.log(
      "PUSH ERROR =",
      e
    );

    if (
      e.code ===
      "messaging/registration-token-not-registered"
    ) {

      console.log(
        "INVALID TOKEN REMOVED =",
        targetUid
      );

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

      } catch (deleteError) {

        console.log(
          "TOKEN DELETE ERROR =",
          deleteError
        );

      }

    }

  }

}


// =====================================================
// AGORA TOKEN
// =====================================================

app.get(
  "/token",
  (req, res) => {

    try {

      const channelName =
        req.query.channel;

      const uid =
        Number(req.query.uid);

      if (
        !channelName ||
        !uid
      ) {

        return res.status(400).json({

          success: false,

          error:
            "channel or uid missing",

        });

      }

      if (
        !APP_ID ||
        !APP_CERTIFICATE
      ) {

        return res.status(500).json({

          success: false,

          error:
            "Agora configuration missing",

        });

      }

      const role =
        RtcRole.PUBLISHER;

      const expireTime =
        3600;

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

          uid,

          role,

          privilegeExpireTime

        );

      return res.json({

        success: true,

        token,

      });

    } catch (e) {

      console.log(
        "AGORA TOKEN ERROR =",
        e
      );

      return res.status(500).json({

        success: false,

        error:
          e.message,

      });

    }

  }
);


// =====================================================
// MERGE VIDEO + AUDIO
// =====================================================

app.post(

  "/merge",

  uploadLimiter,

  verifyUser,

  upload.single("video"),

  async (req, res) => {

    console.log(
      "===== /merge HIT ====="
    );

    let videoPath = null;

    let audioPath = null;

    let outputPath = null;

    try {

      // -------------------------------------------------
      // CHECK VIDEO
      // -------------------------------------------------

      if (!req.file) {

        return res.status(400).json({

          success: false,

          error:
            "Video missing",

        });

      }

      const audioUrl =
        req.body.audioUrl;

      if (
        !audioUrl ||
        typeof audioUrl !==
          "string"
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Audio URL missing",

        });

      }

      videoPath =
        req.file.path;


      // -------------------------------------------------
      // TEMP DIRECTORY
      // -------------------------------------------------

      const tempDir =
        path.join(
          __dirname,
          "temp"
        );

      if (
        !fs.existsSync(tempDir)
      ) {

        fs.mkdirSync(
          tempDir,
          {
            recursive: true,
          }
        );

      }


      // -------------------------------------------------
      // FILE NAMES
      // -------------------------------------------------

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

      console.log(
        "Downloading audio..."
      );

      const audioResponse =
        await axios({

          url:
            audioUrl,

          method:
            "GET",

          responseType:
            "stream",

          timeout:
            120000,

        });


      await new Promise(
        (
          resolve,
          reject
        ) => {

          const writer =
            fs.createWriteStream(
              audioPath
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

        }
      );


      // -------------------------------------------------
      // MERGE
      // -------------------------------------------------

      console.log(
        "Merging video + audio..."
      );

      await new Promise(
        (
          resolve,
          reject
        ) => {

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
      // UPLOAD MERGED VIDEO TO R2
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


      console.log(
        "MERGED VIDEO URL =",
        videoUrl
      );


      return res.json({

        success: true,

        video:
          videoUrl,

      });

    } catch (e) {

      console.log(
        "MERGE ERROR =",
        e
      );

      return res.status(500).json({

        success: false,

        error:
          e.message,

      });

    } finally {

      // -------------------------------------------------
      // CLEAN VIDEO
      // -------------------------------------------------

      if (
        videoPath &&
        fs.existsSync(videoPath)
      ) {

        try {

          fs.unlinkSync(
            videoPath
          );

        } catch (err) {

          console.log(
            "VIDEO DELETE ERROR =",
            err
          );

        }

      }


      // -------------------------------------------------
      // CLEAN AUDIO
      // -------------------------------------------------

      if (
        audioPath &&
        fs.existsSync(audioPath)
      ) {

        try {

          fs.unlinkSync(
            audioPath
          );

        } catch (err) {

          console.log(
            "AUDIO DELETE ERROR =",
            err
          );

        }

      }


      // -------------------------------------------------
      // CLEAN OUTPUT
      // -------------------------------------------------

      if (
        outputPath &&
        fs.existsSync(outputPath)
      ) {

        try {

          fs.unlinkSync(
            outputPath
          );

        } catch (err) {

          console.log(
            "OUTPUT DELETE ERROR =",
            err
          );

        }

      }

    }

  }

);


// =====================================================
// UPLOAD VIDEO
// VIDEO + THUMBNAIL
// =====================================================

app.post(

  "/upload-video",

  uploadLimiter,

  verifyUser,

  upload.single("video"),

  async (req, res) => {

    console.log(
      "===== /upload-video HIT ====="
    );

    let videoPath = null;

    let thumbnailPath = null;

    let userRef = null;

    let lockEnabled = false;

    try {

      // -------------------------------------------------
      // USER
      // -------------------------------------------------

      const uid =
        req.user.uid;

      userRef =
        db
          .collection("users")
          .doc(uid);


      // -------------------------------------------------
      // USER CHECK
      // -------------------------------------------------

      const userSnap =
        await userRef.get();

      if (
        !userSnap.exists
      ) {

        return res.status(404).json({

          success: false,

          error:
            "User not found",

        });

      }


      const userData =
        userSnap.data();


      // -------------------------------------------------
      // UPLOAD LOCK CHECK
      // -------------------------------------------------

      if (
        userData.uploadStatus ===
        true
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Another upload is already in progress.",

        });

      }


      // -------------------------------------------------
      // VIDEO CHECK
      // -------------------------------------------------

      if (!req.file) {

        return res.status(400).json({

          success: false,

          error:
            "Video missing",

        });

      }


      // -------------------------------------------------
      // LOCK ON
      // -------------------------------------------------

      await userRef.update({

        uploadStatus: true,

      });

      lockEnabled = true;


      videoPath =
        req.file.path;


      // -------------------------------------------------
      // FILE IDS
      // -------------------------------------------------

      const fileId =
        crypto.randomUUID();

      const videoFileName =
        `${fileId}.mp4`;

      const thumbnailFileName =
        `${fileId}.jpg`;


      // -------------------------------------------------
      // TEMP DIRECTORY
      // -------------------------------------------------

      const tempDir =
        path.join(
          __dirname,
          "temp"
        );

      if (
        !fs.existsSync(tempDir)
      ) {

        fs.mkdirSync(
          tempDir,
          {
            recursive: true,
          }
        );

      }


      thumbnailPath =
        path.join(
          tempDir,
          thumbnailFileName
        );


      // =================================================
      // 1. VIDEO -> R2
      // =================================================

      console.log(
        "Uploading video to R2..."
      );

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


      console.log(
        "VIDEO R2 URL =",
        videoUrl
      );


      // =================================================
      // 2. CREATE THUMBNAIL
      // =================================================

      console.log(
        "Creating thumbnail..."
      );


      await new Promise(
        (
          resolve,
          reject
        ) => {

          ffmpeg(videoPath)

            .screenshots({

              timestamps:
                ["1"],

              filename:
                thumbnailFileName,

              folder:
                tempDir,

              size:
                "720x?",

            })

            .on(
              "end",
              () => {

                console.log(
                  "FFMPEG THUMBNAIL DONE"
                );

                resolve();

              }
            )

            .on(
              "error",
              (err) => {

                console.log(
                  "FFMPEG THUMBNAIL ERROR =",
                  err
                );

                reject(err);

              }
            );

        }
      );


      // =================================================
      // 3. CHECK THUMBNAIL
      // =================================================

      console.log(
        "THUMBNAIL PATH =",
        thumbnailPath
      );


      if (
        !fs.existsSync(
          thumbnailPath
        )
      ) {

        throw new Error(
          "Thumbnail file was not created"
        );

      }


      console.log(
        "THUMBNAIL FILE EXISTS = YES"
      );


      // =================================================
      // 4. THUMBNAIL -> R2
      // =================================================

      console.log(
        "Uploading thumbnail to R2..."
      );


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


      // IMPORTANT:
      // thumbnailUrl declaration MUST happen
      // BEFORE using it.

      const thumbnailUrl =
        `${process.env.R2_PUBLIC_URL}/${thumbnailFileName}`;


      console.log(
        "THUMBNAIL R2 URL =",
        thumbnailUrl
      );


      // =================================================
      // FINAL RESPONSE
      // =================================================

      const responseData = {

        success: true,

        videoUrl:
          videoUrl,

        thumbnailUrl:
          thumbnailUrl,

      };


      console.log(
        "🔥 FINAL UPLOAD RESPONSE =",
        responseData
      );


      // IMPORTANT:
      // Do NOT return before finally.
      // finally will execute automatically.

      return res.json(
        responseData
      );

    } catch (e) {

      console.log(
        "🔥 UPLOAD ERROR =",
        e
      );


      return res.status(500).json({

        success: false,

        error:
          e.message,

      });

    } finally {

      // =================================================
      // LOCK OFF
      // =================================================

      if (
        userRef &&
        lockEnabled
      ) {

        try {

          await userRef.update({

            uploadStatus:
              false,

          });

          console.log(
            "UPLOAD LOCK OFF"
          );

        } catch (lockError) {

          console.log(
            "LOCK RESET ERROR =",
            lockError
          );

        }

      }


      // =================================================
      // DELETE TEMP VIDEO
      // =================================================

      if (
        videoPath &&
        fs.existsSync(
          videoPath
        )
      ) {

        try {

          fs.unlinkSync(
            videoPath
          );

          console.log(
            "TEMP VIDEO DELETED"
          );

        } catch (deleteError) {

          console.log(
            "TEMP VIDEO DELETE ERROR =",
            deleteError
          );

        }

      }


      // =================================================
      // DELETE TEMP THUMBNAIL
      // =================================================

      if (
        thumbnailPath &&
        fs.existsSync(
          thumbnailPath
        )
      ) {

        try {

          fs.unlinkSync(
            thumbnailPath
          );

          console.log(
            "TEMP THUMBNAIL DELETED"
          );

        } catch (deleteError) {

          console.log(
            "TEMP THUMBNAIL DELETE ERROR =",
            deleteError
          );

        }

      }

    }

  }

);


// =====================================================
// SEND MESSAGE NOTIFICATION
// =====================================================

app.post(

  "/send-message-notification",

  async (req, res) => {

    try {

      console.log(
        "NOTIFICATION BODY =",
        req.body
      );


      const {

        receiverUid,

        senderUid,

        senderName,

        message,

      } = req.body;


      if (!receiverUid) {

        return res.status(400).json({

          success: false,

          error:
            "receiverUid missing",

        });

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

      console.log(
        "NOTIFICATION ERROR =",
        e
      );

      return res.status(500).json({

        success: false,

        error:
          e.message,

      });

    }

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

      console.log(
        "No agencies found."
      );

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
      "All Agency Monthly Stars Reset Successfully"
    );

  } catch (e) {

    console.log(
      "AGENCY RESET ERROR =",
      e
    );

  }

}


// =====================================================
// CRON
// =====================================================

cron.schedule(

  "0 0 1 * *",

  async () => {

    console.log(
      "Running Monthly Agency Reset..."
    );

    await resetAgencyMonthlyStars();

  }

);


// =====================================================
// GLOBAL MULTER ERROR HANDLER
// =====================================================

app.use(
  (
    err,
    req,
    res,
    next
  ) => {

    console.log(
      "GLOBAL ERROR =",
      err
    );


    if (
      err &&
      err.message ===
        "Only MP4 and MOV videos are allowed"
    ) {

      return res.status(400).json({

        success: false,

        error:
          err.message,

      });

    }


    if (
      err &&
      err.code ===
        "LIMIT_FILE_SIZE"
    ) {

      return res.status(400).json({

        success: false,

        error:
          "Video size must be less than 100MB",

      });

    }


    return res.status(500).json({

      success: false,

      error:
        err?.message ||
        "Internal server error",

    });

  }

);


// =====================================================
// SERVER
// =====================================================

const PORT =
  process.env.PORT || 3000;


app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Server running on port ${PORT}`
    );

  }
);