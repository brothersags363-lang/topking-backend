require("dotenv").config();

console.log("APP_ID =", process.env.APP_ID);
console.log("Cloud =", process.env.CLOUDINARY_CLOUD_NAME);


const multer = require("multer");
const axios = require("axios");
const cloudinary = require("cloudinary").v2;

const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

async function sendPushNotification(
  targetUid,
  title,
  body
) {
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

        android: {
          priority: "high",
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

  }
}


const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
ffmpeg.setFfmpegPath(ffmpegPath);

const express = require("express");
const { RtcTokenBuilder, RtcRole } = require("agora-token");

const helmet = require("helmet");

const cors = require("cors");

const rateLimit = require("express-rate-limit");

const app = express();
app.set("trust proxy", true);
app.use(express.json());

app.use(helmet());

app.use(cors());


const uploadLimiter = rateLimit({

  windowMs: 60 * 1000,

  max: 5,

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

const APP_ID = process.env.APP_ID;
const APP_CERTIFICATE = process.env.APP_CERTIFICATE;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
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

audioUrl = req.body.audioUrl;

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

const audioPath = path.join(tempDir, `${fileId}.mp3`);
const outputPath = path.join(tempDir, `${fileId}.mp4`);

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

    const upload = await cloudinary.uploader.upload(outputPath, {

      resource_type: "video"

    });

    

return res.json({
  success: true,
  video: upload.secure_url,
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
    try {



const uid = req.user.uid;

const userRef = db.collection("users").doc(uid);

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

await userRef.update({
  uploadStatus: true,
});


      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "Video missing",
        });
      }

      const result = await cloudinary.uploader.upload(req.file.path, {
        resource_type: "video",
      });

await userRef.update({
  uploadStatus: false,
});

      fs.unlinkSync(req.file.path);

      return res.json({
        success: true,
        videoUrl: result.secure_url,
      });

    } catch (e) {

if (req.file?.path && fs.existsSync(req.file.path)) {
  fs.unlinkSync(req.file.path);
}
// Upload lock remove
  if (req.user?.uid) {
    try {
      await db
        .collection("users")
        .doc(req.user.uid)
        .update({
          uploadStatus: false,
        });
    } catch (err) {
      console.log(err);
    }
  }



      console.log(e);

      return res.status(500).json({
        success: false,
        error: e.message,
      });

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
        senderName,
        message,
      } = req.body;

      await sendPushNotification(
        receiverUid,
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

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});


