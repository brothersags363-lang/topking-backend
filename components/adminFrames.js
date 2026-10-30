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

// ---- uid -> adminFrame lookup (memory cache, har user ka 1 hi read) ----
const TTL_MS = 5 * 60 * 1000;
const cache = new Map();      // uid -> { frame, t }
const inflight = new Map();   // uid -> Promise
const listeners = new Map();  // uid -> Set<fn>

function notify(uid, frame) {
  const set = listeners.get(uid);
  if (set) set.forEach((fn) => fn(frame));
}

const MAX_RETRY = 3;

function fetchFrame(uid, attempt = 0) {
  if (inflight.has(uid)) return inflight.get(uid);
  const p = getDoc(doc(db, 'users', uid))
    .then((snap) => {
      const f = snap.exists() ? snap.data()?.adminFrame : null;
      const frame = f && ADMIN_FRAMES[f] ? f : null;
      cache.set(uid, { frame, t: Date.now() });
      notify(uid, frame);
      return frame;
    })
    .catch(() => {
      // FIX: fail hone par "frame nahi hai" cache NAHI karte (pehle null cache ho jata tha
      // aur frame gayab rehta tha). Thodi der baad khud dobara try karte hain.
      if (attempt < MAX_RETRY) {
        setTimeout(() => {
          if (listeners.has(uid)) fetchFrame(uid, attempt + 1);
        }, 1500 * (attempt + 1));
      }
      return undefined;
    })
    .finally(() => inflight.delete(uid));
  inflight.set(uid, p);
  return p;
}

// Admin panel se frame badalne par turant cache saaf karne ke liye
export function clearAdminFrameCache(uid) {
  if (uid) cache.delete(uid); else cache.clear();
}

// uid do -> us user ka admin frame key (ya null)
export function useAdminFrame(uid) {
  const [frame, setFrame] = useState(() => {
    const c = uid ? cache.get(uid) : null;
    return c ? c.frame : null;
  });

  useEffect(() => {
    if (!uid || typeof uid !== 'string') { setFrame(null); return undefined; }
    const c = cache.get(uid);
    // FIX: cache na ho to purane user ka frame mat rakho (seat par user badalne par galat frame dikhta tha)
    setFrame(c ? c.frame : null);
    if (!c || Date.now() - c.t > TTL_MS) fetchFrame(uid);
    let set = listeners.get(uid);
    if (!set) { set = new Set(); listeners.set(uid, set); }
    set.add(setFrame);
    return () => { set.delete(setFrame); if (!set.size) listeners.delete(uid); };
  }, [uid]);

  return frame;
}
