require("dotenv").config();

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



const multer = require("multer");
const axios = require("axios");


const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

async function sendPushNotification(
  targetUid,
  senderUid,
  title,
  body
)

{
  try {

    const userSnap = await db
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

/*
const activeScreen =
  userData.activeScreen;

if (
  activeScreen === "messages" ||
  activeScreen === "chat"
) {

  console.log(
    "NOTIFICATION BLOCKED - USER IS IN APP MESSAGE AREA"
  );

  return;
}
*/


    const token =
      userSnap.data().fcmToken;

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
  await admin.messaging().send({

    token,

    notification: {
      title,
      body,
    },

    data: {
      type: "chat",
      senderUid: senderUid || "",
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

    console.log(
      "NOTIFICATION SENT"
    );

    console.log(
      "FCM RESPONSE =",
      response
    );

  
} catch (e) {

  console.log("PUSH ERROR =", e);

  if (
    e.code === "messaging/registration-token-not-registered"
  ) {

    console.log(
      "INVALID TOKEN REMOVED =",
      targetUid
    );

    await db
      .collection("users")
      .doc(targetUid)
      .update({
        fcmToken: admin.firestore.FieldValue.delete(),
      });

  }

}

}


const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
ffmpeg.setFfmpegPath(ffmpegPath);

const express = require("express");
const { RtcTokenBuilder, RtcRole } = require("agora-token");

const helmet = require("helmet");

const cors = require("cors");

const rateLimit = require("express-rate-limit");
const cron = require("node-cron");

const app = express();
app.set("trust proxy", true);
app.use(express.json());

app.use(helmet());

app.use(cors());


const uploadLimiter = rateLimit({

  windowMs: 60000,

  max: 100,

  message: {
    success: false,
    error: "Too many upload requests. Please wait 1 minute.",
  },

});


app.use((req, res, next) => {
  console.log("REQUEST:", req.method, req.url);
  next();
});

const upload = multer({
  dest: "uploads/",

  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },

  fileFilter: (req, file, cb) => {

    const allowedTypes = [
      "video/mp4",
      "video/quicktime",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only MP4 and MOV videos are allowed"));
    }

  },

});

const APP_ID =
  process.env.AGORA_APP_ID;

const APP_CERTIFICATE =
  process.env.AGORA_APP_CERTIFICATE;



const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

console.log("Cloud =", process.env.CLOUDINARY_CLOUD_NAME);






async function verifyUser(req, res, next) {
  try {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: "Authorization header missing",
      });
    }

    const token = authHeader.replace("Bearer ", "");

    const decodedToken = await admin.auth().verifyIdToken(token);

    req.user = decodedToken;

    next();

  } catch (err) {

    console.log(err);

    return res.status(401).json({
      success: false,
      error: "Invalid Firebase Token",
    });

  }
}



app.get("/token", (req, res) => {

const channelName = req.query.channel;
const uid = Number(req.query.uid);

if (!channelName || !uid) {
  return res.status(400).json({
    success: false,
    error: "channel or uid missing",
  });
}



  const role = RtcRole.PUBLISHER;

  const expireTime = 3600;

  const currentTime = Math.floor(Date.now()/1000);

  const privilegeExpireTime = currentTime + expireTime;

  const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid,
      role,
      privilegeExpireTime
  );

  res.json({
      token
  });

});


app.post(
  "/merge",
  uploadLimiter,
  verifyUser,
  upload.single("video"),
  async (req, res) => {
console.log("===== /merge HIT =====");
let videoPath;
let audioPath;
let outputPath;

  try {

const audioUrl = req.body.audioUrl;

videoPath = req.file.path;

if (!req.file || !audioUrl) {
  return res.status(400).json({
    error: "Video or Audio missing"
  });
}


    const tempDir = path.join(__dirname, "temp");

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    


const fileId = crypto.randomUUID();

audioPath = path.join(tempDir, `${fileId}.mp3`);
outputPath = path.join(tempDir, `${fileId}.mp4`);

    // download video



    // download audio

    const audioResponse = await axios({
      url: audioUrl,
      method: "GET",
      responseType: "stream"
    });

    await new Promise((resolve, reject) => {

      const writer = fs.createWriteStream(audioPath);

      audioResponse.data.pipe(writer);

      writer.on("finish", resolve);

      writer.on("error", reject);

    });





    // merge

      
    await new Promise((resolve, reject) => {

      ffmpeg()

        .input(videoPath)

        .input(audioPath)

        .outputOptions([
          "-map 0:v:0",
          "-map 1:a:0",
          "-shortest"
        ])

        .save(outputPath)

        .on("end", resolve)

        .on("error", reject);

    });
console.log("MERGE API HIT");
    // upload cloudinary

const stream = fs.createReadStream(outputPath);

const fileName = `${crypto.randomUUID()}.mp4`;

await r2.send(
  new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: fileName,
    Body: stream,
    ContentType: "video/mp4",
  })
);

const videoUrl =
`${process.env.R2_PUBLIC_URL}/${fileName}`;

    
return res.json({
  success: true,
  video: videoUrl,
});


  }


catch (e) {

  console.log(e);

  if (e.message === "Only MP4 and MOV videos are allowed") {
    return res.status(400).json({
      success: false,
      error: e.message,
    });
  }

  return res.status(500).json({
    success: false,
    error: e.message,
  });

}

finally {

  if (videoPath && fs.existsSync(videoPath))
    fs.unlinkSync(videoPath);

  if (audioPath && fs.existsSync(audioPath))
    fs.unlinkSync(audioPath);

  if (outputPath && fs.existsSync(outputPath))
    fs.unlinkSync(outputPath);

}

});







app.post(
  "/upload-video",
  uploadLimiter,
  verifyUser,
  upload.single("video"),

  async (req, res) => {

    let videoPath = null;
    let thumbnailPath = null;

    try {

      console.log("===== /upload-video HIT =====");

      const uid = req.user.uid;

      const userRef = db
        .collection("users")
        .doc(uid);

      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      const userData = userSnap.data();

      if (userData.uploadStatus === true) {
        return res.status(400).json({
          success: false,
          error: "Another upload is already in progress.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "Video missing",
        });
      }

      // =========================
      // UPLOAD LOCK ON
      // =========================

      await userRef.update({
        uploadStatus: true,
      });

      videoPath = req.file.path;

      const fileId = crypto.randomUUID();

      const videoFileName =
        `${fileId}.mp4`;

      const thumbnailFileName =
        `${fileId}.jpg`;

      const tempDir =
        path.join(__dirname, "temp");

      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, {
          recursive: true,
        });
      }

      thumbnailPath =
        path.join(
          tempDir,
          thumbnailFileName
        );


      // =========================
      // 1. VIDEO -> R2
      // =========================

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


      // =========================
      // 2. CREATE THUMBNAIL
      // =========================

      console.log(
        "Creating thumbnail..."
      );

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

            .on("end", () => {

              console.log(
                "FFMPEG THUMBNAIL DONE"
              );

              resolve();

            })

            .on("error", (err) => {

              console.log(
                "FFMPEG THUMBNAIL ERROR =",
                err
              );

              reject(err);

            });

        }
      );


      // =========================
      // 3. CHECK THUMBNAIL
      // =========================

      console.log(
        "THUMBNAIL PATH =",
        thumbnailPath
      );

      if (!fs.existsSync(thumbnailPath)) {

        throw new Error(
          "Thumbnail file was not created"
        );

      }

      console.log(
        "THUMBNAIL FILE EXISTS = YES"
      );


      // =========================
      // 4. THUMBNAIL -> R2
      // =========================

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

console.log(
  "🔥 FINAL UPLOAD RESPONSE =",
  {
    success: true,
    videoUrl,
    thumbnailUrl,
  }
);


      const thumbnailUrl =
        `${process.env.R2_PUBLIC_URL}/${thumbnailFileName}`;

  console.log(
        "THUMBNAIL R2 URL =",
        thumbnailUrl
      ); 

      
        console.log("🔥 FINAL UPLOAD RESPONSE =", {
  success: true,
  videoUrl: videoUrl,
  thumbnailUrl: thumbnailUrl,
});

return res.json({
  success: true,
  videoUrl: videoUrl,
  thumbnailUrl: thumbnailUrl,
});

    


      // =========================
      // 5. UPLOAD LOCK OFF
      // =========================

      await userRef.update({
        uploadStatus: false,
      });


      // =========================
      // 6. RESPONSE
      // =========================

      return res.json({

        success: true,

        videoUrl:
          videoUrl,

        thumbnailUrl:
          thumbnailUrl,

      });

    }


    catch (e) {

      console.log(
        "UPLOAD ERROR =",
        e
      );


      // =========================
      // LOCK RESET
      // =========================

      if (req.user?.uid) {

        try {

          await db
            .collection("users")
            .doc(req.user.uid)
            .update({
              uploadStatus: false,
            });

        } catch (err) {

          console.log(
            "LOCK RESET ERROR =",
            err
          );

        }

      }


      return res.status(500).json({

        success: false,

        error:
          e.message,

      });

    }


    finally {

      // =========================
      // DELETE TEMP VIDEO
      // =========================

      if (
        videoPath &&
        fs.existsSync(videoPath)
      ) {

        fs.unlinkSync(
          videoPath
        );

        console.log(
          "TEMP VIDEO DELETED"
        );

      }


      // =========================
      // DELETE TEMP THUMBNAIL
      // =========================

      if (
        thumbnailPath &&
        fs.existsSync(thumbnailPath)
      ) {

        fs.unlinkSync(
          thumbnailPath
        );

        console.log(
          "TEMP THUMBNAIL DELETED"
        );

      }

    }

  }
);






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

      console.log(e);

      return res.status(500).json({
        success: false,
      });

    }

  }
);



async function resetAgencyMonthlyStars() {

  try {

    const agenciesSnap = await db
      .collection("agencies")
      .get();

    const batch = db.batch();

    agenciesSnap.forEach((agencyDoc) => {

      batch.update(agencyDoc.ref, {

        monthlyStars: 0,

      });

    });

    await batch.commit();

    console.log(
      "All Agency Monthly Stars Reset Successfully"
    );

  } catch (e) {

    console.log(e);

  }

}

cron.schedule(
  "0 0 1 * *",
  async () => {

    console.log(
      "Running Monthly Agency Reset..."
    );

    await resetAgencyMonthlyStars();

  }
);


const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});


