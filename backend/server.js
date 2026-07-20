require("dotenv").config();

console.log("APP_ID =", process.env.APP_ID);

const multer = require("multer");
const axios = require("axios");

const {
  PutObjectCommand,
} = require("@aws-sdk/client-s3");

const r2 = require("./config/r2");

const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

ffmpeg.setFfmpegPath(ffmpegPath);

const express = require("express");

const {
  RtcTokenBuilder,
  RtcRole,
} = require("agora-token");

const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();

app.set("trust proxy", 1);

app.use(express.json());
app.use(helmet());
app.use(cors());

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,

  max: 5,

  message: {
    success: false,
    error:
      "Too many upload requests. Please wait 1 minute.",
  },
});

app.use((req, res, next) => {
  console.log(
    "REQUEST:",
    req.method,
    req.url
  );

  next();
});



const imageUpload = multer({
  dest: "uploads/",

  fileFilter: (req, file, cb) => {

    const allowed = [
      "image/jpeg",
      "image/png",
      "image/jpg",
    ];

    if (
      allowed.includes(
        file.mimetype
      )
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only images allowed"
        )
      );
    }
  },
});


const upload = multer({
  dest: "uploads/",

  limits: {
    fileSize: 100 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
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

const APP_ID =
  process.env.APP_ID;

const APP_CERTIFICATE =
  process.env.APP_CERTIFICATE;



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
let thumbPath;
try {

const audioUrl = req.body.audioUrl;

if (!req.file || !audioUrl) {
  return res.status(400).json({
    error: "Video or Audio missing",
  });
}

videoPath = req.file.path;
 


    const tempDir = path.join(__dirname, "temp");

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    


const fileId = crypto.randomUUID();

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
    // Upload to Cloudflare R2

    const fileName = `videos/${fileId}.mp4`;

await r2.send(
  new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: fileName,
    Body: fs.readFileSync(outputPath),
    ContentType: "video/mp4",
  })
);


const thumbName =
  `thumb-${crypto.randomUUID()}.jpg`;

thumbPath = path.join(
  __dirname,
  "temp",
  thumbName
);

await new Promise((resolve, reject) => {
  ffmpeg(outputPath)
    .screenshots({
      count: 1,
      timemarks: ["1"],
      filename: thumbName,
      folder: path.join(__dirname, "temp"),
    })
    .on("end", resolve)
    .on("error", reject);
});

const thumbKey =
  `thumbnails/${thumbName}`;

await r2.send(
  new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: thumbKey,
    Body: fs.readFileSync(thumbPath),
    ContentType: "image/jpeg",
  })
);

const thumbnailUrl =
  `${process.env.CDN_URL}/${thumbKey}`;


return res.json({
  success: true,
  video: `${process.env.CDN_URL}/${fileName}`,
  thumbnailUrl,
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

if (thumbPath && fs.existsSync(thumbPath))
  fs.unlinkSync(thumbPath);

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

 const fileName =
  `videos/${crypto.randomUUID()}.mp4`;

await r2.send(
  new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: fileName,
    Body: fs.readFileSync(req.file.path),
    ContentType: "video/mp4",
  })
);

     const videoUrl =
  `${process.env.CDN_URL}/${fileName}`;

await userRef.update({
  uploadStatus: false,
});

fs.unlinkSync(req.file.path);

return res.json({
  success: true,
  videoUrl,
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
   "/upload-image",
   verifyUser,
   imageUpload.single("image"),


  async (req, res) => {

    try {



      if (!req.file) {

        return res.status(400).json({

          success: false,

          error: "Image missing",

        });

      }



      const fileName =

        `images/${crypto.randomUUID()}.jpg`;



      await r2.send(

        new PutObjectCommand({

          Bucket: process.env.R2_BUCKET,

          Key: fileName,

          Body: fs.readFileSync(req.file.path),

          ContentType: req.file.mimetype,

        })

      );



      fs.unlinkSync(req.file.path);



      return res.json({

        success: true,

        imageUrl:

          `${process.env.CDN_URL}/${fileName}`,

      });



    } catch (e) {



      console.log(e);



      return res.status(500).json({

        success: false,

        error: e.message,

      });



    }

  }

);



const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});


