// =====================================================================
// screenCache.js — screen ka pichla data turant dikhao, naya peeche se (Instagram jaisa)
//
// Firestore (JS SDK) React Native me phone par kuch save nahi karta. Isliye har screen
// har baar khulte hi net ka wait karti thi (slow net par spinner = "app atak raha hai").
// Ab: screen pichli baar ka data phone se turant dikhati hai, aur Firestore se naya
// data aate hi chupchap badal deti hai.
//
//   const cached = await readScreenCache('profile_' + uid);   // ya peekScreenCache (sync, memory)
//   writeScreenCache('profile_' + uid, data);                  // 1 sec debounce ke saath save
//
// Kuch bhi fail ho to null / ignore -> screen pehle jaisi chalti hai.
// =====================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'scr_cache_v1_';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 din se purana data mat dikhao

const mem = new Map(); // key -> { t, d } (app chalte waqt, turant)
const timers = new Map();

// Firestore Timestamp jaisi cheezein JSON me {seconds, nanoseconds} ban jaati hain.
// Unhe wapas aisa object do jisme toMillis() / toDate() bhi chale (purana code na toote).
const reviveTs = (v) => {
  if (Array.isArray(v)) return v.map(reviveTs);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (
      keys.length === 2 &&
      typeof v.seconds === 'number' &&
      typeof v.nanoseconds === 'number'
    ) {
      const ms = v.seconds * 1000 + Math.floor(v.nanoseconds / 1e6);
      return {
        seconds: v.seconds,
        nanoseconds: v.nanoseconds,
        toMillis: () => ms,
        toDate: () => new Date(ms),
      };
    }
    const out = {};
    for (const k of keys) out[k] = reviveTs(v[k]);
    return out;
  }
  return v;
};

// Sirf memory se (sync). App chalte waqt screen dobara khule to pehle frame me hi data.
// maxAgeMs: isse purana data ho to null (jaise live rooms: 10 min)
export const peekScreenCache = (key, maxAgeMs = MAX_AGE_MS) => {
  const h = key ? mem.get(key) : null;
  return h && Date.now() - h.t <= maxAgeMs ? h.d : null;
};

export async function readScreenCache(key, maxAgeMs = MAX_AGE_MS) {
  if (!key) return null;
  if (mem.has(key)) return peekScreenCache(key, maxAgeMs);
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o) return null;
    const t = Number(o.t) || 0;
    const data = reviveTs(o.d);
    mem.set(key, { t, d: data });
    return Date.now() - t <= maxAgeMs ? data : null;
  } catch (e) {
    return null;
  }
}

export function writeScreenCache(key, data) {
  if (!key) return;
  mem.set(key, { t: Date.now(), d: data });
  if (timers.has(key)) clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      try {
        AsyncStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), d: data })).catch(() => {});
      } catch (e) {}
    }, 1000)
  );
}

export function clearScreenCache(key) {
  if (!key) return;
  mem.delete(key);
  try { AsyncStorage.removeItem(PREFIX + key).catch(() => {}); } catch (e) {}
}
