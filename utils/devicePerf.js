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

const MB = 1024 * 1024;
const mk = (maxMB, fwdSec) => ({
  maxBufferBytes: maxMB * MB,
  preferredForwardBufferDuration: fwdSec,
  minBufferForPlayback: 1,
  prioritizeTimeOverSizeThreshold: true,
  // iOS: poora buffer bharne ka wait nahi -> play turant shuru
  waitsToMinimizeStalling: false,
});

const TIERS = ['min', 'low', 'mid', 'high'];

const CFG = {
  // Bahut weak / bahut slow net: sirf current video ka player. Agla video thumbnail se
  // dikhta hai, swipe ke baad load hota hai.
  min: {
    next: false,
    ahead: -1,
    listWindow: 1,
    buffers: { active: mk(10, 6), near: mk(3, 2), preload: mk(2, 2) },
  },
  // Weak phone: current + agla (2 player), chhote buffer.
  low: {
    next: true,
    ahead: 0,
    listWindow: 3,
    buffers: { active: mk(12, 8), near: mk(4, 3), preload: mk(2, 2) },
  },
  // Normal phone.
  mid: {
    next: true,
    ahead: 1,
    listWindow: 3,
    buffers: { active: mk(20, 15), near: mk(8, 6), preload: mk(3, 3) },
  },
  // Naya / tez phone: current + agle 2 videos ready.
  high: {
    next: true,
    ahead: 2,
    listWindow: 3,
    buffers: { active: mk(30, 20), near: mk(10, 10), preload: mk(4, 4) },
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

// Pichli baar jo tier seekha tha (atakne ki wajah se) wo 1 din tak yaad rakho
const KEY = 'perf_tier_cap_v1';
const TTL_MS = 24 * 60 * 60 * 1000;
try {
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (!raw) return;
      const o = JSON.parse(raw);
      if (
        o &&
        TIERS.includes(o.tier) &&
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

function downgrade() {
  const i = TIERS.indexOf(current);
  if (i <= 0) return;
  current = TIERS[i - 1];
  lastDowngradeAt = Date.now();
  stalls = [];
  try {
    AsyncStorage.setItem(KEY, JSON.stringify({ tier: current, ts: Date.now() })).catch(() => {});
  } catch (e) {}
}

// Active video chalte-chalte ruk gaya (buffering) -> yahan batao.
// 45 sec me 3 baar ruka to ek tier neeche (har 60 sec me ek baar se zyada nahi).
function reportStall() {
  const now = Date.now();
  stalls = stalls.filter((t) => now - t < 45000);
  stalls.push(now);
  if (stalls.length >= 3 && now - lastDowngradeAt > 60000) downgrade();
}

export default {
  cfg: () => CFG[current],
  tier: () => current,
  reportStall,
};
