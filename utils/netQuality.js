// =====================================================================
// netQuality.js — net ki ASLI speed naapta hai (sirf WiFi / mobile data dekh ke andaza nahi)
//
// Pehle app sirf "WiFi hai ya mobile data" dekhta tha, aur wo bhi kaam nahi karta tha
// (expo-network package install hi nahi tha) -> mobile data par bhi 720p + poori
// videos background me download hoti thi = active video ko net nahi milta tha = atakna.
//
// Ab:
//   1) Har background download / warm request ki speed naapi jaati hai (bytes / time)
//   2) Video chalte-chalte ruke (stall) ya shuru hone me der lage -> net "kamzor" maana jata hai
//   3) In sab se ek level nikalta hai:  good > ok > poor > bad  (+ offline)
//   4) devicePerf / warmAhead isi level se quality (720/480/360), buffer aur preload chunte hain
//
// Kuch bhi fail ho to chup-chap ignore -> app par koi asar nahi.
// =====================================================================

let Network = null;
try {
  Network = require('expo-network');
} catch (e) {
  Network = null;
}

let cellular = false;
let offline = false;
let kbps = null; // naapi hui speed (kbit/s), EWMA
let lastSampleAt = 0;

const applyState = (st) => {
  try {
    if (!st || !Network) return;
    cellular = st.type === Network.NetworkStateType.CELLULAR;
    // isInternetReachable kabhi null hota hai (pata nahi) -> sirf false par offline
    offline = st.isConnected === false || st.isInternetReachable === false;
    // Network badla (WiFi <-> data) to purani speed bekaar -> dobara naapo
    kbps = null;
  } catch (e) {}
};

try {
  if (Network && typeof Network.getNetworkStateAsync === 'function') {
    Network.getNetworkStateAsync().then(applyState).catch(() => {});
  }
  if (Network && typeof Network.addNetworkStateListener === 'function') {
    Network.addNetworkStateListener(applyState);
  }
} catch (e) {}

// ---------------- speed (kbit/s), EWMA ----------------
const MIN_BYTES = 48 * 1024; // isse chhoti request me latency hi zyada hoti hai, speed nahi

export function addSample(bytes, ms) {
  try {
    if (!(bytes >= MIN_BYTES) || !(ms > 30)) return;
    const s = (bytes * 8) / ms; // bits per ms = kbit/s
    if (!Number.isFinite(s) || s <= 0) return;
    if (kbps == null) kbps = s;
    else {
      // speed girne par jaldi maano (atakna rokna zaroori), badhne par dheere
      const a = s < kbps ? 0.6 : 0.25;
      kbps = kbps * (1 - a) + s * a;
    }
    lastSampleAt = Date.now();
  } catch (e) {}
}

// ---------------- stalls / slow starts ----------------
let stalls = [];
let slowStarts = [];
const WINDOW_MS = 60 * 1000;

export function reportStall() {
  const now = Date.now();
  stalls = stalls.filter((t) => now - t < WINDOW_MS);
  stalls.push(now);
}

// Active video ko pehla frame dikhane me kitna time laga (ms)
export function reportStartup(ms) {
  if (!(ms > 0)) return;
  const now = Date.now();
  slowStarts = slowStarts.filter((t) => now - t < WINDOW_MS);
  if (ms > 2500) slowStarts.push(now);
}

const LEVELS = ['bad', 'poor', 'ok', 'good'];

export function level() {
  if (offline) return 'offline';
  const now = Date.now();

  // 5 min purani speed par bharosa kam -> unknown jaisa
  const k = kbps != null && now - lastSampleAt < 5 * 60 * 1000 ? kbps : null;

  let i;
  if (k == null) i = cellular ? 2 : 3; // pata nahi: data par 'ok', WiFi par 'good'
  else if (k < 700) i = 0;
  else if (k < 1600) i = 1;
  else if (k < 3000) i = 2;
  else i = 3;

  const st = stalls.filter((t) => now - t < WINDOW_MS).length;
  const ss = slowStarts.filter((t) => now - t < WINDOW_MS).length;
  if (st >= 5) i -= 2;
  else if (st >= 2) i -= 1;
  if (ss >= 2) i -= 1;

  return LEVELS[Math.max(0, Math.min(3, i))];
}

export const isCellular = () => cellular;
export const isOffline = () => offline;
export const speedKbps = () => kbps;

// kamzor net (poor / bad / offline)
export const isWeak = () => {
  const l = level();
  return l === 'bad' || l === 'poor' || l === 'offline';
};

export default { addSample, reportStall, reportStartup, level, isCellular, isOffline, isWeak, speedKbps };
