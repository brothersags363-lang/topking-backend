import { useEffect, useState } from 'react';
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

const MAX_RETRY = 3;

function fetchInfo(uid, attempt = 0) {
  if (inflight.has(uid)) return inflight.get(uid);
  const p = getDoc(doc(db, 'users', uid))
    .then((snap) => {
      const info = snap.exists() ? toInfo(snap.data()) : LOADED_EMPTY;
      cache.set(uid, { info, t: Date.now() });
      notify(uid, info);
      return info;
    })
    .catch(() => {
      // fail hone par "frame nahi hai" cache NAHI karte; thodi der baad khud dobara try.
      if (attempt < MAX_RETRY) {
        setTimeout(() => {
          if (listeners.has(uid)) fetchInfo(uid, attempt + 1);
        }, 1500 * (attempt + 1));
      }
      return undefined;
    })
    .finally(() => inflight.delete(uid));
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
    const c = cache.get(uid);
    // cache na ho to purane user ka frame mat rakho (seat par user badalne par galat frame dikhta tha)
    setInfo(c ? c.info : EMPTY_INFO);
    if (!c || Date.now() - c.t > TTL_MS) fetchInfo(uid);
    let set = listeners.get(uid);
    if (!set) { set = new Set(); listeners.set(uid, set); }
    set.add(setInfo);
    return () => { set.delete(setInfo); if (!set.size) listeners.delete(uid); };
  }, [uid]);

  return info;
}

// Purana naam (compat): sirf admin frame key chahiye ho to
export function useAdminFrame(uid) {
  return useFrameInfo(uid).adminFrame;
}
