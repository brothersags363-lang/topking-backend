// =====================================================================
// streamHls.js — har video ki KAI QUALITY (240p..1080p, HLS) Cloudflare Stream se
//
// Flow (app ka upload flow waisa hi rehta hai, R2 par seedha):
//   1) App video R2 par upload karta hai (compress ke baad) -> videoUrl (mp4)
//   2) App  POST /stream/ingest {videoUrl}  bulata hai -> hum Cloudflare Stream ko bolte hain
//      "is URL se video utha lo" -> Stream khud sab qualities banata hai -> uid milta hai
//   3) App Firestore doc me streamUid + hlsReady:false likhta hai
//   4) Ye file har minute pending docs dekhti hai; Stream ready ho to doc me
//      hlsUrl (.m3u8) + hlsReady:true likh deti hai
//   5) Feed: hlsReady ho to HLS chalta hai (net/phone ke hisaab se quality khud badalti hai),
//      warna R2 ka mp4 (fallback) -> koi video kabhi "nahi chal rahi" wali halat me nahi.
//
// Render ke Environment me ye 2 daalo:
//   CF_ACCOUNT_ID    = Cloudflare account id
//   CF_STREAM_TOKEN  = API token (permission: Account > Stream > Edit)
// Ye na ho to ye poori file chup-chap band rehti hai (app purane tareeke se chalta rahega).
// =====================================================================

const CF_ACCOUNT = process.env.CF_ACCOUNT_ID;
const CF_TOKEN = process.env.CF_STREAM_TOKEN;
const R2_BASE = String(process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

const ENABLED = !!(CF_ACCOUNT && CF_TOKEN && typeof fetch === "function");
const API = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/stream`;

// 1 ghante me bhi ready na ho to haar maan lo (fallback mp4 chalta rahega)
const GIVE_UP_MS = 60 * 60 * 1000;

async function cf(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {}
  if (!res.ok || !json || json.success === false) {
    const msg =
      (json && json.errors && json.errors[0] && json.errors[0].message) || `HTTP ${res.status}`;
    const err = new Error(`Cloudflare Stream: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json.result;
}

// R2 ke mp4 URL se Stream me video banao -> { uid, ... }
async function ingestFromUrl(url, name) {
  return cf("/copy", {
    method: "POST",
    body: JSON.stringify({
      url,
      meta: { name: name || "topking-video" },
      requireSignedURLs: false,
    }),
  });
}

const getVideo = (uid) => cf(`/${encodeURIComponent(uid)}`);

function isOurR2Mp4(url) {
  if (typeof url !== "string" || !R2_BASE) return false;
  if (!url.startsWith(`${R2_BASE}/`)) return false;
  if (url.includes("?") || url.includes("#")) return false;
  return /\.mp4$/i.test(url);
}

function tsMs(t) {
  try {
    if (!t) return 0;
    if (typeof t.toMillis === "function") return t.toMillis();
    if (typeof t.seconds === "number") return t.seconds * 1000;
  } catch (e) {}
  return 0;
}

module.exports = function registerStreamHls({ app, db, verifyUser, uploadLimiter, cron }) {
  if (!ENABLED) {
    console.log("streamHls: CF_ACCOUNT_ID / CF_STREAM_TOKEN set nahi -> HLS abhi band (mp4 chalega)");
    // Client ko saaf jawab do: "abhi nahi" (client ise ignore karke aage badhta hai)
    app.post("/stream/ingest", uploadLimiter, verifyUser, (req, res) =>
      res.status(501).json({ success: false, error: "Stream not enabled" })
    );
    return;
  }

  // ---------------------------------------------------------------
  // POST /stream/ingest  { videoUrl }  ->  { success, uid }
  // ---------------------------------------------------------------
  app.post("/stream/ingest", uploadLimiter, verifyUser, async (req, res) => {
    try {
      const videoUrl = req.body && req.body.videoUrl;
      // Sirf apne R2 ke mp4 (koi bhi dusra URL Stream se mat uthwao)
      if (!isOurR2Mp4(videoUrl)) {
        return res.status(400).json({ success: false, error: "Invalid video url" });
      }
      const r = await ingestFromUrl(videoUrl, `${req.user.uid}`);
      if (!r || !r.uid) throw new Error("uid nahi mila");
      return res.json({ success: true, uid: r.uid });
    } catch (e) {
      console.error("STREAM INGEST ERROR:", e.message);
      return res.status(502).json({ success: false, error: "Stream ingest failed" });
    }
  });

  // ---------------------------------------------------------------
  // CRON: har minute pending videos ko check karo
  // ---------------------------------------------------------------
  let running = false;

  async function pollPending() {
    if (running) return;
    running = true;
    try {
      const snap = await db.collection("all_videos").where("hlsReady", "==", false).limit(25).get();
      if (snap.empty) return;

      for (const docSnap of snap.docs) {
        const d = docSnap.data() || {};
        if (!d.streamUid) continue;
        try {
          const v = await getVideo(d.streamUid);
          const state = v && v.status && v.status.state;
          const hls = v && v.playback && v.playback.hls;

          if ((v.readyToStream || state === "ready") && hls) {
            await docSnap.ref.update({ hlsUrl: hls, hlsReady: true });
          } else if (state === "error") {
            await docSnap.ref.update({ hlsReady: "failed" });
          } else if (Date.now() - tsMs(d.createdAt) > GIVE_UP_MS && tsMs(d.createdAt) > 0) {
            await docSnap.ref.update({ hlsReady: "failed" });
          }
        } catch (e) {
          // Video Stream se hat gayi (404) -> dobara dobara mat poocho
          if (e && e.status === 404) {
            await docSnap.ref.update({ hlsReady: "failed" }).catch(() => {});
          } else {
            console.error("STREAM POLL ERROR:", docSnap.id, e.message);
          }
        }
      }
    } catch (e) {
      console.error("STREAM POLL LOOP ERROR:", e.message);
    } finally {
      running = false;
    }
  }

  cron.schedule("* * * * *", pollPending, {
    timezone: process.env.TZ || "Asia/Kolkata",
  });
  console.log("streamHls: ON (har minute pending HLS videos check hongi)");
};

// migrateToStream.js bhi yahi helpers use karta hai
module.exports.ingestFromUrl = ingestFromUrl;
module.exports.isOurR2Mp4 = isOurR2Mp4;
module.exports.ENABLED = ENABLED;
