// @ts-nocheck
import React from 'react';
import { Dimensions } from 'react-native';
import { gifts } from '../../assets/giftsData';
import { where } from 'firebase/firestore';


export const { width, height } = Dimensions.get("window");

export const AGORA_APP_ID = "f75d0020d44345edb12bbf6847ef3d38";
export const TOKEN_ENDPOINT = "https://topking-backend.onrender.com/token";
export const STABLE_AVATAR = "https://avatar.iran.liara.run/public/65";
// ===== Same as LiveRoom.js: tick sirf jab verified === true; color sirf yellow/white =====
export const isVerified = (v: any) => v === true || v === "true";
export const normTickColor = (c: any) => (c === "yellow" ? "yellow" : "white");
export const cleanVerified = (o: any) => {
  if (!o) return o;
  const ok = isVerified(o.verified);
  const out: any = { ...o, verified: ok };
  if (ok) out.verifiedColor = o.verifiedColor === "yellow" ? "yellow" : "white";
  else delete out.verifiedColor;
  return out;
};
// Join animation: 'auto' (level se) | 'slide' | 'lv10' | 'lv20' | 'lv30' | 'lv40' | 'lv50'
export const JOIN_ANIM_VARIANT = "auto";

// Same 30s window all-live.js uses to decide a room is still "live".
export const HEARTBEAT_INTERVAL = 60000; // COST FIX: pehle 8s

// PK settings
export const PK_DURATION_SEC = 180; // 3 minutes
export const PK_RESULT_SHOW_MS = 6000; // PK ke baad 10 sec ruka rahe (loser punishment chalta hai), phir PK clear
export const PK_INVITE_TTL = 30000; // invite expires after 30s
export const PK_UID_OFFSET = 1000000; // uid used when we peek into the opponent's channel
// PK friend list:
//   "mutual"    = dono ek dusre ko follow kare
//   "following" = jise main follow karta hu
//   "either"    = jise main follow karta hu YA jo mujhe follow karta hai (default: koi live friend miss na ho)
export const PK_FRIEND_MODE: "mutual" | "following" | "either" = "either";
export const PK_FRIEND_LIMIT = 40; // PK sheet me max itne friends

// Host camera quality  (HEAT FIX)
// Pehle 720x1280 @ 24fps + 1500kbps tha: encoder + camera + modem teeno bahut
// garam hote the (30 min me phone tapta tha). 540x960 @ 15fps live apps ke liye
// kaafi sharp hai aur CPU / battery / data ~50% kam lagta hai.
// Phone thanda rahe aur aur smooth chahiye to frameRate 20 try karo.
export const VIDEO_PROFILE = {
  dimensions: { width: 540, height: 960 },
  frameRate: 24, // SMOOTH: 20 -> 24 fps. Phone zyada garam ho to wapas 20 kar do (weak network par auto LOW profile already hai).
  bitrate: 1100,
  minBitrate: 400,
  orientationMode: 2, // fixed portrait
  degradationPreference: 1, // weak network → resolution pehle girta hai, motion smooth rehta hai
};
// Weak network / phone bahut garam hone par host automatically isi profile par aa jata hai
export const VIDEO_PROFILE_LOW = {
  dimensions: { width: 360, height: 640 },
  frameRate: 15,
  bitrate: 450,
  minBitrate: 150,
  orientationMode: 2,
  degradationPreference: 1,
};

// PK length choices the host can pick before inviting (seconds)
export const PK_DURATIONS = [180]; // fixed 3 minutes

// ---- Guest seats: viewers who join the host's video call (tiles on the right) ----
export const MAX_GUESTS = 3; // seats at the same time (tiles stack on the right side)
export const GUEST_REQUEST_TTL = 5 * 60 * 1000; // old, never-answered requests are hidden
export const GUEST_JOIN_GRACE_MS = 20000; // host removes a seated guest who never showed up in the channel
// Guests publish a SMALL stream (their tile is small) → light on data for everyone.
export const GUEST_VIDEO_PROFILE = {
  dimensions: { width: 360, height: 640 },
  frameRate: 15,
  bitrate: 500,
  minBitrate: 150,
  orientationMode: 2,
  degradationPreference: 1,
};
export const GUEST_TILE_W = Math.round(Math.min(width * 0.27, 116));
export const GUEST_TILE_H = Math.round(GUEST_TILE_W * 1.3);
export const pkPanelHFixed = Math.round(Math.min((width / 2) * 1.547, height * 0.36)); // PK panel height (Tiki ratio 1.547)
export const PK_BAR_H = 16; // score bar height (Tiki)
export const PK_TIPS =
  "Great performance and active interaction with the audience will help you win the PK battle!      •      Send gifts to support your host and win the PK!      •      ";

// Weekly-host goal shown in the header pill + live-ended screen
export const WEEKLY_TARGET_MIN = 120; // 2 ghanta = 150 stars (24 ghante ke andar kul)
// Random Match gives up after this many seconds
export const MATCH_TIMEOUT_SEC = 90;
export const WELCOME_TEXT =
  "Welcome to TopKing Live, where you can interact with hosts and other viewers in real time. "
  + "Please abide by our community guidelines to help us maintain a good community environment";

// ===== SMOOTH FIX: collision-free Agora UID (LiveRoom.js jaisa SHA-256) =====
// Pehle UID = char codes ka sum % 1000000 tha -> sirf ~2000 alag values, do viewers ka UID same hone par
// Agora ek ko channel se nikal deta tha (rejoin / freeze). Ab sha256(uid) ke 4 bytes (server /token ke saath same).
export const _uidHashCache = new Map<string, number>();
export const sha256Bytes = (str: string): number[] => {
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
  const bytes: number[] = [];
  const utf8 = unescape(encodeURIComponent(str));
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
             (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const w: number[] = new Array(64);
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
  const out: number[] = [];
  H.forEach((x) => out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255));
  return out;
};
export const uidToNum = (id: string): number => {
  if (!id) return 0;
  let v = _uidHashCache.get(id);
  if (v === undefined) {
    const b = sha256Bytes(String(id));
    v = Math.max(1, ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) & 0x7fffffff);
    _uidHashCache.set(id, v);
  }
  return v;
};
export const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}K` : String(n || 0));

// Filter presets. `beauty` → Agora setBeautyEffectOptions,
// `color` → Agora setColorEnhanceOptions. Both change the PUBLISHED stream,
// so viewers see the filter too.
export const FILTERS = [
  { id: "off", label: "Original", icon: "🚫", beauty: null, color: null },
  {
    id: "natural",
    label: "Natural",
    icon: "🌿",
    beauty: { lighteningContrastLevel: 1, lighteningLevel: 0.4, smoothnessLevel: 0.4, rednessLevel: 0.2, sharpnessLevel: 0.2 },
    color: null,
  },
  {
    id: "smooth",
    label: "Smooth",
    icon: "✨",
    beauty: { lighteningContrastLevel: 1, lighteningLevel: 0.3, smoothnessLevel: 0.85, rednessLevel: 0.15, sharpnessLevel: 0.1 },
    color: null,
  },
  {
    id: "bright",
    label: "Bright",
    icon: "☀️",
    beauty: { lighteningContrastLevel: 2, lighteningLevel: 0.75, smoothnessLevel: 0.35, rednessLevel: 0.1, sharpnessLevel: 0.2 },
    color: { strengthLevel: 0.4, skinProtectLevel: 1 },
  },
  {
    id: "rosy",
    label: "Rosy",
    icon: "🌸",
    beauty: { lighteningContrastLevel: 1, lighteningLevel: 0.45, smoothnessLevel: 0.5, rednessLevel: 0.75, sharpnessLevel: 0.1 },
    color: null,
  },
  {
    id: "vivid",
    label: "Vivid",
    icon: "🎨",
    beauty: null,
    color: { strengthLevel: 0.85, skinProtectLevel: 0.8 },
  },
  {
    id: "sharp",
    label: "Sharp",
    icon: "🔍",
    beauty: { lighteningContrastLevel: 2, lighteningLevel: 0.2, smoothnessLevel: 0.1, rednessLevel: 0.1, sharpnessLevel: 0.9 },
    color: { strengthLevel: 0.3, skinProtectLevel: 1 },
  },
];

// Extra filters (Glossy, Sunset, Clarendon, Rosy, ...) from the shared library.
// Agora only supports beauty + colour-enhance, so these are mapped to the
// closest Agora options (see toAgora() in constants/filterLibrary.js).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { liveFilters } = require("../../constants/filterLibrary");
// Skip ids already defined above (e.g. "rosy") so React keys stay unique.
liveFilters().forEach((lf: any) => {
  if (!FILTERS.some((f) => f.id === lf.id)) FILTERS.push(lf);
});

// Where the "Recharge / Buy stars" button sends the user. Change to your real route.
export const RECHARGE_ROUTE = "/wallet";

// HEAT FIX (LiveRoom jaisa): gift WebView (canvas) me pixel ratio 1.5 par cap.
export const GIFT_WEB_PRE_JS = "try{var __r=window.devicePixelRatio||1;Object.defineProperty(window,'devicePixelRatio',{get:function(){return Math.min(__r,1.5)}})}catch(e){}true;";
export const GIFT_GOLD = "#F5C451";
// Normal (non-PK) mode me gift animation kitna UPAR ho (px). Zyada upar chahiye to number badhao.
export const GIFT_NORMAL_UP = 120;
// Gift Firestore writes ke beech minimum gap (ms). Chhota = zyada fast, par zyada writes.
export const GIFT_WRITE_GAP = 500;

// ---- Compact gift sheet pieces (same look as LiveRoom.js) ----
export const GIFTS_PER_PAGE = 8; // 4 columns x 2 rows
export const GIFT_PAGE_W = width; // Tiki jaisa: sheet edge-to-edge
export const GIFT_PAGES: any[] = (() => {
  const pages: any[] = [];
  for (let i = 0; i < gifts.length; i += GIFTS_PER_PAGE) {
    pages.push({ key: "p" + i, items: gifts.slice(i, i + GIFTS_PER_PAGE) });
  }
  return pages;
})();


// PERF: live chat ki har row me animated frame (40-80 rows) bahut load deta tha.
// false = chat me frame static (smooth). Seat/profile/host ke frames animated hi rehte hain.
export const CHAT_FRAME_ANIM = false;
