import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../app/firebaseConfig';

// Admin ke diye hue special frames (level frames se alag).
// Admin Panel > "Special Frames" se kisi bhi user ko diye ja sakte hain.
// users/{uid}.adminFrame = key  (server /admin/set-user-frame se set hota hai)
// Nayi frame jodni ho: webp assets/admin_frames/ me daalo, yahan ek line add karo,
// aur backend server.js me ADMIN_FRAME_KEYS me key add karo.
export const ADMIN_FRAMES = {
  gold_heart:   { label: 'Official Gold Heart',   img: require('../assets/admin_frames/gold_heart.webp') },
  bd_helmet:    { label: 'BD Purple Helmet',      img: require('../assets/admin_frames/bd_helmet.webp') },
  agency_ref:   { label: 'Agency Reference',      img: require('../assets/admin_frames/agency_ref.webp') },
  agency_wings: { label: 'Official Agency Wings', img: require('../assets/admin_frames/agency_wings.webp') },
  tk_team:      { label: 'TK Team',               img: require('../assets/admin_frames/tk_team.webp') },
};

export const ADMIN_FRAME_KEYS = Object.keys(ADMIN_FRAMES);

// ---- uid -> frame info lookup (memory cache, har user ka 1 hi read) ----
// Ek hi read me user ka sab kuch aa jata hai: adminFrame, level, special/BD/agency,
// aur user ki apni pasand (frameOff / frameChoice / entryOff / entryChoice).
// Isse index, messages, profile, userProfile, live - sab jagah frame apne aap sahi lagta hai.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map();      // uid -> { info, t }
const inflight = new Map();   // uid -> Promise
const listeners = new Map();  // uid -> Set<fn>

const EMPTY_INFO = Object.freeze({
  loaded: false,   // true tab hota hai jab user doc padh liya gaya
  adminFrame: null,
  level: null,
  special: null,
  isBD: false,
  agencyId: null,
  frameOff: false,
  frameChoice: null,
  entryOff: false,
  entryChoice: null,
});

const LOADED_EMPTY = Object.freeze({ ...EMPTY_INFO, loaded: true });

function toInfo(data) {
  if (!data) return LOADED_EMPTY;
  const f = data.adminFrame;
  return {
    loaded: true,
    adminFrame: f && ADMIN_FRAMES[f] ? f : null,
    level: Number(data.level) || null,
    special: data.special || null,
    isBD: data.isBD === true,
    agencyId: data.agencyId || null,
    frameOff: data.frameOff === true,
    frameChoice: data.frameChoice || null,
    entryOff: data.entryOff === true,
    entryChoice: data.entryChoice || null,
  };
}

function notify(uid, info) {
  const set = listeners.get(uid);
  if (set) set.forEach((fn) => fn(info));
}

// FIX (frame kabhi dikhta kabhi nahi): pehle har seat/chat row alag getDoc chalata tha.
// Live room me 20-50 user ek saath aate hain -> sab reads ek saath, slow net par timeout,
// aur 3 retry ke baad frame hamesha ke liye "nahi hai" reh jata tha.
// Ab: (1) ek saath max MAX_PARALLEL reads (queue), (2) retry zyada + lamba backoff,
// (3) frame info phone me save (AsyncStorage) -> app dobara khulte hi frame turant,
// (4) fail hone par purani saved info dikhti rehti hai, khali nahi hoti.
const MAX_RETRY = 6;
const MAX_PARALLEL = 4;
const STORE_KEY = 'frameInfoCache:v1';
const STORE_MAX = 300;

const queue = [];
let running = 0;

function pump() {
  while (running < MAX_PARALLEL && queue.length) {
    const job = queue.shift();
    running += 1;
    job().finally(() => { running -= 1; pump(); });
  }
}

// ---- disk cache (best effort, kabhi crash nahi karega) ----
let diskLoaded = false;
let diskLoading = null;
let saveTimer = null;

function loadDisk() {
  if (diskLoaded) return Promise.resolve();
  if (diskLoading) return diskLoading;
  diskLoading = AsyncStorage.getItem(STORE_KEY)
    .then((raw) => {
      if (!raw) return;
      const obj = JSON.parse(raw);
      Object.keys(obj || {}).forEach((uid) => {
        if (!cache.has(uid) && obj[uid]) {
          // t: 0 => purana maana jayega, background me refresh hoga, par tab tak dikhega
          cache.set(uid, { info: { ...EMPTY_INFO, ...obj[uid], loaded: true }, t: 0 });
          notify(uid, cache.get(uid).info);
        }
      });
    })
    .catch(() => {})
    .finally(() => { diskLoaded = true; });
  return diskLoading;
}

function saveDiskSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const entries = Array.from(cache.entries())
        .filter(([, v]) => v && v.info && v.info.loaded)
        .sort((a, b) => b[1].t - a[1].t)
        .slice(0, STORE_MAX);
      const obj = {};
      entries.forEach(([uid, v]) => { obj[uid] = v.info; });
      AsyncStorage.setItem(STORE_KEY, JSON.stringify(obj)).catch(() => {});
    } catch (_) {}
  }, 2500);
}

function fetchInfo(uid, attempt = 0) {
  if (inflight.has(uid)) return inflight.get(uid);
  const p = new Promise((resolve) => {
    queue.push(() =>
      getDoc(doc(db, 'users', uid))
        .then((snap) => {
          const info = snap.exists() ? toInfo(snap.data()) : LOADED_EMPTY;
          cache.set(uid, { info, t: Date.now() });
          notify(uid, info);
          saveDiskSoon();
          resolve(info);
        })
        .catch(() => {
          // fail hone par "frame nahi hai" cache NAHI karte; backoff ke saath dobara try.
          if (attempt < MAX_RETRY) {
            setTimeout(() => {
              inflight.delete(uid);
              if (listeners.has(uid)) fetchInfo(uid, attempt + 1);
            }, Math.min(1500 * 2 ** attempt, 20000));
          }
          resolve(undefined);
        })
    );
    pump();
  }).finally(() => {
    // retry wala case upar khud inflight saaf karta hai; normal case me yahan.
    if (inflight.get(uid) === p) inflight.delete(uid);
  });
  inflight.set(uid, p);
  return p;
}

// Admin panel / settings se frame badalne par turant cache saaf karne ke liye
export function clearAdminFrameCache(uid) {
  if (uid) cache.delete(uid); else cache.clear();
}

// Settings screen kholte hi taaza info lao (cache ka 5 min wait nahi)
export function refreshFrameInfo(uid) {
  if (!uid) return Promise.resolve(undefined);
  cache.delete(uid);
  return fetchInfo(uid);
}

// Settings me user ne frame/entry badla -> cache turant update + sab screens ko khabar
// (server ka jawab aane ke baad call karo, taaki sab jagah ek saath badal jaye)
export function patchFrameInfo(uid, patch) {
  if (!uid) return;
  const c = cache.get(uid);
  const info = { ...(c ? c.info : EMPTY_INFO), loaded: true, ...patch };
  cache.set(uid, { info, t: Date.now() });
  notify(uid, info);
}

// uid do -> us user ki poori frame info (ya EMPTY_INFO jab tak load ho raha ho)
export function useFrameInfo(uid) {
  const [info, setInfo] = useState(() => {
    const c = uid ? cache.get(uid) : null;
    return c ? c.info : EMPTY_INFO;
  });

  useEffect(() => {
    if (!uid || typeof uid !== 'string') { setInfo(EMPTY_INFO); return undefined; }
    let dead = false;
    const c0 = cache.get(uid);
    // cache na ho to purane user ka frame mat rakho (seat par user badalne par galat frame dikhta tha)
    setInfo(c0 ? c0.info : EMPTY_INFO);

    let set = listeners.get(uid);
    if (!set) { set = new Set(); listeners.set(uid, set); }
    set.add(setInfo);

    // pehle phone me saved info (turant frame), phir zarurat ho to server se taaza
    loadDisk().then(() => {
      if (dead) return;
      const c = cache.get(uid);
      if (c) setInfo(c.info);
      if (!c || Date.now() - c.t > TTL_MS) fetchInfo(uid);
    });

    return () => { dead = true; set.delete(setInfo); if (!set.size) listeners.delete(uid); };
  }, [uid]);

  return info;
}

// Purana naam (compat): sirf admin frame key chahiye ho to
export function useAdminFrame(uid) {
  return useFrameInfo(uid).adminFrame;
}
