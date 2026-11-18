// =====================================================================
// warmAhead.js — agle 5-10 videos ka SHURU (3-5 sec) peeche chupke se garam karo
//
// Kya karta hai (halka, phone garam nahi hota):
//   - Player / decoder BILKUL nahi banata (wo hi garmi + memory crash ki wajah hote hain)
//   - Sirf chhota HTTP Range request (pehle ~0.5-1 MB) bhejta hai -> CDN (Cloudflare) ke
//     paas wale server me video ka shuru ready ho jata hai + connection (DNS/TLS) khul jata hai
//   - Agle 10 videos ke thumbnail (poster) phone me pehle se rakh leta hai
//   - Ek baar me sirf EK request, user scroll kare to purani request turant band
//   - Active video ko pehle bandwidth milta hai (scroll settle ke 1.5 sec baad shuru)
//   - Mobile data par sirf 3 video (480p), WiFi par 8
//   - Weak phone / bahut slow net (tier 'min') par band
// Kuch bhi fail ho to chup-chap ignore -> feed par koi asar nahi.
// =====================================================================
import { Image as ExpoImage } from 'expo-image';
import PERF from './devicePerf';
import { pickVideoUri, isHlsUri, fixCdn } from './videoSource';
import { downloadAhead, stopDownloadAhead } from './videoCache';

// Active + agle (mounted) video ko pehle net milna chahiye -> background kaam 2.5 sec baad shuru.
// (Pehle 1.5 sec tha: bada download active video ke buffer se ladta tha = atakna.)
const START_DELAY_MS = 2500;
const THUMBS_AHEAD = 10;
const MAX_REMEMBER = 200;

const warmed = new Set();
const thumbDone = new Set();
let timer = null;
let ctrl = null;
let runId = 0;

const remember = (set, v) => {
  if (set.size > MAX_REMEMBER) set.clear();
  set.add(v);
};

function cancelAll() {
  runId++;
  if (timer) { clearTimeout(timer); timer = null; }
  if (ctrl) { try { ctrl.abort(); } catch (e) {} ctrl = null; }
  // SWIPE par chalti background download bhi roko -> naye active video ko poora net mile.
  // (Pehle ye chalti rehti thi aur naye video ke saath bandwidth ke liye ladti thi.)
  try { stopDownloadAhead(); } catch (e) {}
}

async function warmOne(uri, bytes, signal) {
  const res = await fetch(uri, { headers: { Range: `bytes=0-${bytes - 1}` }, signal });
  // Body padho taaki connection poora data le (aur chhoda ja sake)
  await res.arrayBuffer();
}

// videos = feed ki poori list, index = abhi dikh rahi video ka number
export default function warmAhead(videos, index) {
  try {
    cancelAll();
    if (!Array.isArray(videos) || typeof index !== 'number' || PERF.tier() === 'min') return;

    // 1) Thumbnails (sasta, turant) -> scroll par poster foran dikhe
    const thumbs = [];
    for (let i = index + 1; i <= index + THUMBS_AHEAD && i < videos.length; i++) {
      const t = videos[i] && fixCdn(videos[i].thumbnail);
      if (t && !thumbDone.has(t)) { thumbs.push(t); remember(thumbDone, t); }
    }
    if (thumbs.length) { try { ExpoImage.prefetch(thumbs, 'memory-disk'); } catch (e) {} }

    // 2) Video ka shuru: scroll settle hone ke baad, ek-ek karke
    const my = runId;
    timer = setTimeout(async () => {
      const cellular = PERF.cellular();
      const low = PERF.quality();
      const bytes = low <= 360 ? 300 * 1024 : low <= 480 ? 450 * 1024 : 1024 * 1024;

      // (a) Sirf wo video jo ABHI mount nahi hai par agli swipe ke baad mount hoga: shuru ka hissa
      // CDN par garam. (+1/+lead pehle se player me load ho rahe hain -- unki dobara request
      // sirf bandwidth doguni karti thi.)
      const cfg = PERF.cfg();
      const lead = Math.max(cfg.ahead, cfg.next ? 1 : 0);
      const list = [];
      for (let i = index + lead + 1; i <= index + lead + 1 && i < videos.length; i++) {
        const uri = pickVideoUri(videos[i], low, true);
        if (uri && !isHlsUri(uri) && !uri.startsWith('file:') && !warmed.has(uri)) list.push(uri);
      }

      // (b) Uske aage (+3..): POORI video phone me utaro -> mount hote hi file se turant chale
      //     WiFi par 3, mobile data par sirf 1 (kam download = active video ko zyada net)
      const jobs = [];
      const to = index + (cellular ? 3 : 5);
      for (let i = index + 3; i <= to && i < videos.length; i++) {
        const uri = pickVideoUri(videos[i], low, true);
        if (videos[i] && videos[i].id && uri && !isHlsUri(uri) && !uri.startsWith('file:')) {
          jobs.push({ id: videos[i].id, uri });
        }
      }
      downloadAhead(jobs);
      for (const uri of list) {
        if (my !== runId) return; // user ne scroll kar diya
        ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        try {
          await warmOne(uri, bytes, ctrl ? ctrl.signal : undefined);
          remember(warmed, uri);
        } catch (e) {
          return; // abort / net error: baaki chhod do
        }
      }
    }, START_DELAY_MS);
  } catch (e) {}
}

export const stopWarmAhead = () => { cancelAll(); stopDownloadAhead(); };
