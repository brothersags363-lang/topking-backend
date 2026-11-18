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

// Mobile data par kam preload (data bachta hai), WiFi par poora.
// Optional: npx expo install expo-network (+ naya build). Na ho to kuch nahi badalta.
let Network = null;
try {
  Network = require('expo-network');
} catch (e) {
  Network = null;
}
let onCellular = false;
const refreshNet = () => {
  try {
    if (!Network || typeof Network.getNetworkStateAsync !== 'function') return;
    Network.getNetworkStateAsync()
      .then((st) => {
        onCellular = !!st && st.type === Network.NetworkStateType.CELLULAR;
      })
      .catch(() => {});
  } catch (e) {}
};
refreshNet();
try {
  if (Network && typeof Network.addNetworkStateListener === 'function') {
    Network.addNetworkStateListener((st) => {
      onCellular = !!st && st.type === Network.NetworkStateType.CELLULAR;
    });
  }
} catch (e) {}

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
  high: {
    next: true,
    ahead: 2,
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

// Mobile data par 'high' ko 'mid' maano (preload 2 video tak); WiFi par jaisa tha waisa.
const effective = () => (onCellular && current === 'high' ? 'mid' : current);

export default {
  cfg: () => CFG[effective()],
  tier: () => effective(),
  cellular: () => onCellular,
  // 480p chalao? weak phone / slow net (atakna) / mobile data par haan.
  // Kaunsi quality: 360 (bahut slow / weak), 480 (mobile data / weak phone), 720 (WiFi + achha phone).
  // Atakne par tier khud neeche aata hai -> quality bhi khud neeche (720 -> 480 -> 360).
  quality: () => {
    const t = effective();
    if (t === 'min') return 360;
    if (onCellular || t === 'low') return 480;
    return 720;
  },
  lowQuality: () => onCellular || current === 'min' || current === 'low',
  reportStall,
};
