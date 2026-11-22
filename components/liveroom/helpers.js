import { useEffect, useState } from 'react';
import { InteractionManager, Platform } from 'react-native';
import { LEVEL_THEMES } from './constants';

export const _uidHashCache = new Map();

// Pure-JS SHA-256 (UTF-8 string -> 32 byte array). Server (/token) isi hash se
// Agora UID banata hai, isliye app ko EXACTLY wahi formula chahiye.
export const sha256Bytes = (str) => {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];

  // UTF-8 encode
  const bytes = [];
  const utf8 = unescape(encodeURIComponent(str));
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
             (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);

  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const w = new Array(64);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = ((bytes[off + t*4] << 24) | (bytes[off + t*4 + 1] << 16) |
              (bytes[off + t*4 + 2] << 8) | bytes[off + t*4 + 3]) | 0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t-15], 7) ^ rotr(w[t-15], 18) ^ (w[t-15] >>> 3);
      const s1 = rotr(w[t-2], 17) ^ rotr(w[t-2], 19) ^ (w[t-2] >>> 10);
      w[t] = (w[t-16] + s0 + w[t-7] + s1) | 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  const out = [];
  H.forEach(x => out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255));
  return out;
};

// Firebase UID -> Agora numeric UID. server.js /token ke saath 100% same:
// sha256(uid) ke pehle 4 bytes (big-endian) & 0x7fffffff, minimum 1.
export const uidToNum = (id) => {
  if (!id) return 0;
  let v = _uidHashCache.get(id);
  if (v === undefined) {
    const b = sha256Bytes(String(id));
    v = (((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) & 0x7fffffff);
    v = Math.max(1, v);
    _uidHashCache.set(id, v);
  }
  return v;
};
// Tick sirf unhe jinke profile me verified === true ho. Baaki sab ke liye
// verified=false aur verifiedColor hata do (taaki koi component default tick na dikhaye).
export const cleanVerified = (o) => {
  if (!o) return o;
  const ok = o.verified === true || o.verified === 'true';
  const out = { ...o, verified: ok };
  if (ok) out.verifiedColor = o.verifiedColor === 'yellow' ? 'yellow' : 'white';
  else delete out.verifiedColor;
  return out;
};
// Single source of truth: tick tabhi jab verified === true (ya 'true'); color sirf yellow/white
export const isVerified = (v) => v === true || v === 'true';
export const normTickColor = (c) => (c === 'yellow' ? 'yellow' : 'white');
export const fmtCount = (n = 0) => n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
export const getLevelTheme = (level = 1) => {
  if (level >= 50) return LEVEL_THEMES[50];
  if (level >= 40) return LEVEL_THEMES[40];
  if (level >= 30) return LEVEL_THEMES[30];
  if (level >= 20) return LEVEL_THEMES[20];
  if (level >= 10) return LEVEL_THEMES[10];
  return LEVEL_THEMES[1];
};
// ===== SMOOTH ENTER/EXIT HELPERS =====
// runWhenIdle: animation/navigation khatam hone ke baad chalao (max `maxWait` ms ruko).
// Pehle sab kuch room khulte hi ek saath chalta tha (Agora engine, 12 animated frames, WebView)
// -> JS thread bhar jata tha aur entry lag karti thi. Ab bhaari kaam transition ke BAAD hota hai.
export const runWhenIdle = (fn, maxWait = 1200) => {
  let done = false;
  const go = () => { if (done) return; done = true; try { fn(); } catch (_) {} };
  InteractionManager.runAfterInteractions(go);
  setTimeout(go, maxWait);
};
// useSettled(delay): room khulne ke `delay` ms BAAD (aur animation khatam hone par) true hota hai.
// Seat frames ko isse stagger karke start karte hain (12 frames ek saath nahi).
export const useSettled = (delay = 0) => {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let t = null;
    let dead = false;
    runWhenIdle(() => { t = setTimeout(() => { if (!dead) setOk(true); }, delay); }, 1500);
    return () => { dead = true; if (t) clearTimeout(t); };
  }, [delay]);
  return ok;
};
// ===== NAVIGATION BAR GAP: har bottom popup is gap se upar rahega =====
// Kuch mobiles me Modal ke andar insets.bottom 0 aata hai (3-button nav bar) -> popup bar ke neeche chhup jata tha.
// Isliye Android par kam se kam 28px (aur gesture-bar wale phone par insets.bottom) hamesha chhodte hain.
export const navBarGap = (insetsBottom = 0) => {
  if (Platform.OS !== 'android') return Math.max(insetsBottom, 14);
  // insets mil gaye (gesture bar / edge-to-edge) -> wahi + thoda extra.
  // insets 0 aaye (3-button bar, Modal me insets nahi milte) -> bar ki asli unchai ~48dp chhodo.
  return insetsBottom > 0 ? insetsBottom + 14 : 52;
};
// PERF: room doc har update par naye seat objects banata hai -> pehle 9 seats + frames
// har baar re-render hote the. Ab sirf tab jab seat ki value sach me badli ho.
export const seatEqual = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (let i = 0; i < ka.length; i++) {
    const k = ka[i];
    const x = a[k], y = b[k];
    if (x === y) continue;
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      try { if (JSON.stringify(x) === JSON.stringify(y)) continue; } catch (_) {}
    }
    return false;
  }
  return true;
};

export const getBgKey = () => {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 20) return 'evening';
  return 'night';
};
