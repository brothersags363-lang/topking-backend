// =====================================================================
// profilePrefetch.js — doosre user ki profile TURANT khule (Instagram jaisa)
//
// 1) seedProfile(uid, {...})  : feed me naam / username / photo pehle se pata hai ->
//    profile page khulte hi wahi dikhta hai (net ka wait nahi)
// 2) prefetchProfile(uid)     : video dekhte waqt creator ka user doc (aur thodi der baad
//    pehli 12 videos) peeche se le aao -> tap karte hi sab tayyar
// 3) getProfileSeed(uid)      : userProfile.js pehle frame me yahi padhta hai
//
// Sab kuch screenCache ('uprof_<uid>') me jata hai, isliye app band karke kholne par bhi
// pichli baar dekhi profile turant dikhti hai.
// Doosre user ka phone / email / birthday / token phone me SAVE NAHI hota (cleanUser).
// =====================================================================
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../app/firebaseConfig';
import { fetchUserVideos } from './userVideos';
import { peekScreenCache, readScreenCache, writeScreenCache } from './screenCache';

export const profileKey = (uid) => 'uprof_' + uid;

// Private cheezein kabhi cache me nahi
const SENSITIVE = /(phone|email|birth|token|device|location|latitude|longitude|address|ip$|password|otp)/i;
export function cleanUser(d) {
  if (!d || typeof d !== 'object') return d;
  const out = {};
  Object.keys(d).forEach((k) => {
    if (!SENSITIVE.test(k)) out[k] = d[k];
  });
  return out;
}

// Video docs me koi private cheez nahi -> poora object (grid se video kholne par sab chahiye)
export const slimVideos = (list) => (Array.isArray(list) ? list.slice(0, 30) : []);

export function getProfileSeed(uid) {
  return uid ? peekScreenCache(profileKey(uid)) : null;
}
export function readProfileSeed(uid) {
  return uid ? readScreenCache(profileKey(uid)) : Promise.resolve(null);
}

// Jo pata hai sirf wahi likho; pehle se zyada data ho to usko mat kaato
export function mergeProfileSeed(uid, patch) {
  if (!uid || !patch) return;
  const cur = peekScreenCache(profileKey(uid)) || {};
  const next = { ...cur, ...patch };
  if (patch.userData) next.userData = { ...(cur.userData || {}), ...cleanUser(patch.userData) };
  writeScreenCache(profileKey(uid), next);
}

// Feed ke video item se jo pata hai (naam / username / photo)
export function seedProfile(uid, partial) {
  if (!uid || !partial) return;
  const cur = peekScreenCache(profileKey(uid));
  if (cur && cur.userData && cur.userData.username) return; // asli data pehle se hai
  const u = {};
  if (partial.name) u.name = partial.name;
  if (partial.username) u.username = String(partial.username).replace(/^@/, '');
  if (partial.profileImg) u.profileImg = partial.profileImg;
  if (Object.keys(u).length) mergeProfileSeed(uid, { userData: u });
}

const lastFetch = new Map(); // uid -> { user: ts, videos: ts }
const FRESH_MS = 5 * 60 * 1000;

// what: 'user' (1 read) ya 'videos' (12 reads). Login zaroori (rules).
export async function prefetchProfile(uid, what = 'user') {
  try {
    if (!uid || !auth.currentUser) return;
    const h = lastFetch.get(uid) || {};
    if (h[what] && Date.now() - h[what] < FRESH_MS) return;
    lastFetch.set(uid, { ...h, [what]: Date.now() });

    if (what === 'user') {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) mergeProfileSeed(uid, { userData: snap.data() });
    } else {
      const list = await fetchUserVideos(uid, 12);
      const sorted = list.slice().sort((a, b) => {
        const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });
      const cur = getProfileSeed(uid);
      // poori (60) list pehle se cache me ho to 12 se mat badlo
      if (!cur || !Array.isArray(cur.videos) || cur.videos.length <= 12) {
        mergeProfileSeed(uid, { videos: slimVideos(sorted) });
      }
    }
  } catch (e) {
    // fail: kuch nahi, profile page khud la lega
    const h = lastFetch.get(uid) || {};
    lastFetch.set(uid, { ...h, [what]: 0 });
  }
}
