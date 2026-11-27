// =====================================================================
// devicePerf.js — phone ke hisaab se video settings (auto)
//
// 1) START par phone dekhta hai (RAM / Android version) aur ek tier chunta hai:
//      high > mid > low > min
// 2) CHALTE waqt agar video bar-bar ataka (stall) to khud ek tier neeche
//    aa jata hai (kam players, chhota buffer) -> weak phone / slow net par
//    app khud halka ho jata hai. Ye tier 1 din yaad rakhta hai.
//
// Sahi RAM ke liye (optional, behtar): npx expo install expo-device  (+ naya build)
// Ye na ho to Android version / iOS version se andaza lagata hai, aur
// uske baad bhi atakne par khud neeche aa jata hai.
// =====================================================================
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let Device = null;
try {
  Device = require('expo-device');
} catch (e) {
  Device = null;
}

// Net ki asli speed + WiFi/data: netQuality.js (speed khud naapta hai).
// expo-network ab package.json me hai (naye build ke baad WiFi/data bhi pata chalta hai).
import NET from './netQuality';

const MB = 1024 * 1024;
const mk = (maxMB, fwdSec, minBuf = 1) => ({
  maxBufferBytes: maxMB * MB,
  preferredForwardBufferDuration: fwdSec,
  // rebuffer ke baad kam se kam itna buffer bhar ke chalo -> ruk-ruk ke chalna (stutter) nahi
  minBufferForPlayback: minBuf,
  prioritizeTimeOverSizeThreshold: true,
  // iOS: poora buffer bharne ka wait nahi -> play turant shuru
  waitsToMinimizeStalling: false,
});

const TIERS = ['min', 'low', 'mid', 'high'];

const CFG = {
  // NOTE: 'min' ab auto-downgrade se kabhi nahi lagta (neeche FLOOR dekho). Agar kabhi lage bhi
  // to agla video preload hota rahe -- pehle yahan next:false tha, jisse HAR swipe par naya
  // player zero se load hota tha = "scroll karte hi video ruk ke chalta hai".
  min: {
    next: true,
    ahead: 0,
    listWindow: 3,
    buffers: { active: mk(12, 8, 2), near: mk(4, 4), preload: mk(2, 2) },
  },
  // Weak phone: current + agla (2 player), chhote buffer.
  low: {
    next: true,
    ahead: 0,
    listWindow: 3,
    buffers: { active: mk(16, 12, 1.5), near: mk(5, 5), preload: mk(2, 2) },
  },
  // Normal phone.
  mid: {
    next: true,
    ahead: 1,
    listWindow: 3,
    buffers: { active: mk(24, 18, 1.5), near: mk(8, 8), preload: mk(3, 3) },
  },
  // Naya / tez phone: current + agle 2 videos ready.
  // HEAT FIX: pehle ahead 2 (3-4 decoder ek saath = phone garam). Ab 1; uske aage ki
  // videos WiFi par poori phone me download hoti hain (decoder nahi) -> phir bhi turant chalti hain.
  high: {
    next: true,
    ahead: 1,
    listWindow: 3,
    buffers: { active: mk(32, 24, 1.5), near: mk(10, 10), preload: mk(4, 4) },
  },
};

function detect() {
  // 1) Asli RAM mil jaye (expo-device) to wahi sabse sahi hai
  try {
    const ram = Device && typeof Device.totalMemory === 'number' ? Device.totalMemory : 0;
    if (ram > 0) {
      const gb = ram / (1024 * 1024 * 1024);
      let t = gb >= 5 ? 'high' : gb >= 3 ? 'mid' : 'low';
      // Purana Android ho to RAM zyada hone par bhi 'low' se upar nahi
      if (Platform.OS === 'android' && Number(Platform.Version) < 29 && t !== 'low') t = 'low';
      return t;
    }
  } catch (e) {}

  // 2) RAM nahi mili -> OS version se andaza
  if (Platform.OS === 'ios') {
    const major = parseInt(String(Platform.Version), 10) || 0;
    return major >= 15 ? 'high' : 'mid';
  }
  const api = Number(Platform.Version) || 0;
  if (api >= 33) return 'high';
  if (api >= 29) return 'mid';
  return 'low';
}

let current = detect();
if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[PERF] start tier =', current);

// Pichli baar jo tier seekha tha (atakne ki wajah se) wo 1 din tak yaad rakho
const KEY = 'perf_tier_cap_v2'; // v1 me bahut se phones 'min' par atke the -> reset
const TTL_MS = 24 * 60 * 60 * 1000;
try {
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (!raw) return;
      const o = JSON.parse(raw);
      if (
        o &&
        TIERS.includes(o.tier) &&
        o.tier !== 'min' &&
        Date.now() - Number(o.ts) < TTL_MS &&
        TIERS.indexOf(o.tier) < TIERS.indexOf(current)
      ) {
        current = o.tier;
      }
    })
    .catch(() => {});
} catch (e) {}

let stalls = [];
let lastDowngradeAt = 0;

// FLOOR: 'low' se neeche nahi. 'low' me bhi current + agla video ready rehta hai.
// (Pehle 'min' tak gir jata tha jahan preload band tha -> har swipe par atakna.)
const FLOOR_INDEX = TIERS.indexOf('low');

function downgrade() {
  const i = TIERS.indexOf(current);
  if (i <= FLOOR_INDEX) return;
  current = TIERS[i - 1];
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.log('[PERF] tier ->', current);
  lastDowngradeAt = Date.now();
  stalls = [];
  try {
    AsyncStorage.setItem(KEY, JSON.stringify({ tier: current, ts: Date.now() })).catch(() => {});
  } catch (e) {}
}

// Active video chalte-chalte ruk gaya (buffering) -> yahan batao.
// 45 sec me 5 baar (har baar 1.2 sec+ ruka) to ek tier neeche (har 2 min me ek baar se zyada nahi).
function reportStall() {
  const now = Date.now();
  stalls = stalls.filter((t) => now - t < 45000);
  stalls.push(now);
  if (stalls.length >= 5 && now - lastDowngradeAt > 120000) downgrade();
}

// Mobile data par 'high' ko 'mid' maano (chhote buffer); WiFi par jaisa tha waisa.
const effective = () => (NET.isCellular() && current === 'high' ? 'mid' : current);

// KAMZOR NET: active video ko poora net do. Agle (preload) videos ka buffer bahut chhota,
// active ka aage ka buffer bada, aur rukne ke baad 2.5 sec bhar ke hi chalao
// (warna 0.5 sec chala, phir ruka, phir chala = jhatke).
const WEAK_BUFFERS = {
  poor: { active: mk(16, 30, 2.5), near: mk(2, 3), preload: mk(1, 2) },
  bad: { active: mk(12, 40, 3), near: mk(1, 2), preload: mk(1, 1) },
};

const _cfgCache = new Map();
function cfg() {
  const t = effective();
  let n = NET.level();
  if (n === 'offline') n = 'bad';
  const key = t + '|' + n;
  let c = _cfgCache.get(key);
  if (c) return c;
  const base = CFG[t];
  if (n === 'poor' || n === 'bad') {
    // sirf agla 1 video taiyar (ahead 0 -> lead 1), baaki bandwidth active ki
    c = { ...base, ahead: 0, buffers: WEAK_BUFFERS[n] };
  } else {
    c = base;
  }
  _cfgCache.set(key, c);
  return c;
}

// Kaunsi quality: net ki naapi hui speed + phone dono dekh ke.
//   bad (<0.7 Mbps)  -> 360p
//   poor (<1.6 Mbps) -> 480p
//   ok (<3 Mbps)     -> mobile data par 480p, WiFi par 720p
//   good             -> 720p (weak phone par 480p)
// Har video ki quality pehli baar chalne par pakki hoti hai; net sudhre to AGLE videos 720p.
function quality() {
  const t = effective();
  const n = NET.level();
  if (n === 'bad' || n === 'offline' || t === 'min') return 360;
  if (n === 'poor' || t === 'low') return 480;
  if (n === 'ok' && NET.isCellular()) return 480;
  return 720;
}

// Active video chalte-chalte ruka: net ko bhi batao (quality turant agle video se kam),
// aur phone tier ka purana hisaab bhi chalta rahe.
// Phone ka tier sirf tab giro jab net achha ho fir bhi atke (tab phone hi kamzor hai).
// Kamzor net ki wajah se atakne par phone tier 1 din ke liye neeche nahi jata.
function reportStallBoth() {
  let netOk = true;
  try { netOk = !NET.isWeak(); } catch (e) {}
  if (netOk) reportStall();
  try { NET.reportStall(); } catch (e) {}
}

export default {
  cfg,
  tier: () => effective(),
  cellular: () => NET.isCellular(),
  net: () => NET.level(),
  quality,
  lowQuality: () => quality() < 720,
  reportStall: reportStallBoth,
  reportStartup: (ms) => { try { NET.reportStartup(ms); } catch (e) {} },
};
