// =====================================================================
// faststartVideo.js — video ko "turant chalne layak" banao (faststart)
//
// Phone se video seedha R2 par jaati hai (/upload-url). Us file me metadata (moov)
// aksar END me hota hai -> player ko pehle poori file ka aakhri hissa chahiye,
// isliye video der se shuru hoti hai.
//
// Ye file: R2 se mp4 uthao -> agar moov aakhir me hai to `-c copy -movflags +faststart`
// (RE-ENCODE NAHI, sirf box ki jagah badalti hai -> bahut halka, Render hang nahi hota)
// -> wahi key par wapas R2 me daal do (same URL, immutable cache).
//
// Ek baar me sirf EK job chalti hai (queue), 25 MB se badi file chhod di jaati hai.
// Kuch bhi fail ho to video jaisi thi waisi hi rehti hai (kuch toot-ta nahi).
// =====================================================================
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { pipeline } = require("stream/promises");
const { GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");

const MAX_BYTES = 25 * 1024 * 1024;
const R2_BASE = () => String(process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

function keyFromUrl(url) {
  const base = R2_BASE();
  if (typeof url !== "string" || !base || !url.startsWith(base + "/")) return null;
  if (url.includes("?") || url.includes("#") || !/\.mp4$/i.test(url)) return null;
  const key = decodeURIComponent(url.slice(base.length + 1));
  return key.includes("..") ? null : key;
}

// moov box mdat se pehle hai? (pehle 64 KB hi dekhte hain)
function moovIsFirst(file) {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const moov = buf.subarray(0, n).indexOf("moov");
    const mdat = buf.subarray(0, n).indexOf("mdat");
    return moov !== -1 && (mdat === -1 || moov < mdat);
  } finally {
    fs.closeSync(fd);
  }
}

function remux(ffmpegPath, input, output) {
  return new Promise((resolve, reject) => {
    const p = spawn(
      ffmpegPath,
      ["-y", "-i", input, "-c", "copy", "-movflags", "+faststart", output],
      { stdio: ["ignore", "ignore", "ignore"] }
    );
    const t = setTimeout(() => p.kill("SIGKILL"), 60 * 1000);
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (c) => { clearTimeout(t); c === 0 ? resolve() : reject(new Error("ffmpeg " + c)); });
  });
}

let chain = Promise.resolve();

async function fixOne({ r2, ffmpegPath, key }) {
  const dir = path.join(os.tmpdir(), "fs-" + crypto.randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  const src = path.join(dir, "in.mp4");
  const out = path.join(dir, "out.mp4");
  try {
    const obj = await r2.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
    if (Number(obj.ContentLength) > MAX_BYTES) return "skip-big";
    await pipeline(obj.Body, fs.createWriteStream(src));
    if (moovIsFirst(src)) return "already";
    await remux(ffmpegPath, src, out);
    if (!moovIsFirst(out)) return "skip-nofix";
    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: fs.createReadStream(out),
        ContentLength: fs.statSync(out).size,
        ContentType: "video/mp4",
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
    return "fixed";
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = function registerFaststart({ app, r2, ffmpegPath, verifyUser, uploadLimiter }) {
  // POST /video/faststart { videoUrl } -> { success, result }
  app.post("/video/faststart", uploadLimiter, verifyUser, (req, res) => {
    const key = keyFromUrl(req.body && req.body.videoUrl);
    if (!key) return res.status(400).json({ success: false, error: "Invalid video url" });
    // Sirf apni upload ki hui video (key me user ka folder ho to match karo, warna chalne do)
    const job = chain.then(() => fixOne({ r2, ffmpegPath, key }));
    chain = job.catch(() => {});
    job
      .then((result) => res.json({ success: true, result }))
      .catch((e) => {
        console.error("FASTSTART ERROR:", e.message);
        res.json({ success: false, result: "failed" }); // 200: client ise ignore karta hai
      });
  });
};
