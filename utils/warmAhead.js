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
//   - Net ki ASLI speed (netQuality.js) dekh ke: kamzor net / mobile data par poori
//     downloads band, sirf chhota warm -> saara net chalti video ko
//   - Weak phone (tier 'min') ya offline par band
// Kuch bhi fail ho to chup-chap ignore -> feed par koi asar nahi.
// =====================================================================
import { Image as ExpoImage } from 'expo-image';
import PERF from './devicePerf';
import { pickVideoUri, isHlsUri, fixCdn } from './videoSource';
import { downloadAhead, stopDownloadAhead } from './videoCache';
import NET from './netQuality';

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
  const t0 = Date.now();
  const res = await fetch(uri, { headers: { Range: `bytes=0-${bytes - 1}` }, signal });
  // Body padho taaki connection poora data le (aur chhoda ja sake)
  const buf = await res.arrayBuffer();
  // NET METER: is chhoti request ki speed -> net kitna tez hai
  try { NET.addSample(buf ? buf.byteLength : 0, Date.now() - t0); } catch (e) {}
}

// videos = feed ki poori list, index = abhi dikh rahi video ka number
export default function warmAhead(videos, index) {
  try {
    cancelAll();
    if (!Array.isArray(videos) || typeof index !== 'number' || PERF.tier() === 'min') return;
    if (NET.isOffline()) return; // net hi nahi -> kuch mat mangao

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
      const net = NET.level();
      const low = PERF.quality();
      const bytes = low <= 360 ? 300 * 1024 : low <= 480 ? 450 * 1024 : 1024 * 1024;

      const cfg = PERF.cfg();
      const lead = Math.max(cfg.ahead, cfg.next ? 1 : 0);

      // (a) Agli swipe ke baad mount hone wali video (lead+1) ka sirf SHURU CDN par garam.
      // Isi chhoti request se net ki speed bhi naapi jaati hai.
      // Bahut kamzor net (bad) par ye bhi chhota (sirf speed naapne layak).
      const list = [];
      const warmBytes = net === 'bad' ? 96 * 1024 : bytes;
      const wi = index + lead + 1;
      if (wi < videos.length) {
        const uri = pickVideoUri(videos[wi], low, true);
        if (uri && !isHlsUri(uri) && !uri.startsWith('file:') && !warmed.has(uri)) list.push(uri);
      }

      for (const uri of list) {
        if (my !== runId) return; // user ne scroll kar diya
        ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        try {
          await warmOne(uri, warmBytes, ctrl ? ctrl.signal : undefined);
          remember(warmed, uri);
        } catch (e) {
          break; // abort / net error: baaki chhod do
        }
      }
      if (my !== runId) return;

      // Speed naapne ke BAAD faisla (net abhi kaisa hai)
      const net2 = NET.level();
      // (b) POORI video phone me utaro (mount hote hi file se turant chale, net ruke tab bhi).
      //   - WiFi + achha net: lead ke aage ki 3 videos
      //   - Mobile data + bahut achha net: sirf 1
      //   - Kamzor net (poor/bad) ya data + normal net: BILKUL nahi -> saara net active video ko
      //     (pehle mobile data pehchaan hi nahi hota tha, isliye data par bhi 3 poori videos
      //      background me utarti thin aur chalti video atakti thi)
      const fullCount =
        net2 === 'good' ? (cellular ? 1 : 3) : net2 === 'ok' && !cellular ? 2 : 0;
      const jobs = [];
      const from = index + lead + 1;
      for (let i = from; i < from + fullCount && i < videos.length; i++) {
        const uri = pickVideoUri(videos[i], low, true);
        if (videos[i] && videos[i].id && uri && !isHlsUri(uri) && !uri.startsWith('file:')) {
          jobs.push({ id: videos[i].id, uri });
        }
      }

      // Range warm ke BAAD poori downloads (ek saath do request net ko baant deti thin)
      downloadAhead(jobs);
    }, START_DELAY_MS);
  } catch (e) {}
}

export const stopWarmAhead = () => { cancelAll(); stopDownloadAhead(); };
