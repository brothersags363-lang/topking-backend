// Video Comment / Share Lock
// users/{uid}.commentsLocked / shareLocked = true  ->  us user ke VIDEOS par
// koi (khud owner ke alawa) comment ya share nahi kar sakta.
// Setting: Settings > "Comments Lock" / "Share Lock".
// Ek owner ka ek hi read (60 sec cache) - feed scroll par extra load nahi.
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../app/firebaseConfig";

const TTL = 60 * 1000;
const cache = new Map();    // ownerUid -> { commentsLocked, shareLocked, t }
const inflight = new Map(); // ownerUid -> Promise

const OPEN = Object.freeze({ commentsLocked: false, shareLocked: false });

// Cache me ho to turant (sync) do, warna null
export function peekVideoLocks(ownerUid) {
  const c = ownerUid ? cache.get(ownerUid) : null;
  return c ? c : null;
}

export function getVideoLocks(ownerUid) {
  if (!ownerUid) return Promise.resolve(OPEN);
  const c = cache.get(ownerUid);
  if (c && Date.now() - c.t < TTL) return Promise.resolve(c);
  if (inflight.has(ownerUid)) return inflight.get(ownerUid);
  const p = getDoc(doc(db, "users", ownerUid))
    .then((snap) => {
      const d = snap.exists() ? snap.data() : {};
      const v = {
        commentsLocked: d.commentsLocked === true,
        shareLocked: d.shareLocked === true,
        t: Date.now(),
      };
      cache.set(ownerUid, v);
      return v;
    })
    .catch(() => c || OPEN) // network fail: purani value, warna khula (rules phir bhi rokte hain)
    .finally(() => inflight.delete(ownerUid));
  inflight.set(ownerUid, p);
  return p;
}

// Owner ne setting badli -> apna cache turant update
export function patchMyVideoLocks(patch) {
  const uid = auth.currentUser && auth.currentUser.uid;
  if (!uid) return;
  const c = cache.get(uid) || { ...OPEN };
  cache.set(uid, { ...c, ...patch, t: Date.now() });
}

// Kya current user is video par comment / share kar sakta hai?
// kind: "comments" | "share"   -> { ok: true } ya { ok: false, message }
export async function checkVideoAction(ownerUid, kind) {
  const me = auth.currentUser && auth.currentUser.uid;
  if (!ownerUid || ownerUid === me) return { ok: true }; // owner hamesha kar sakta hai
  const key = kind === "share" ? "shareLocked" : "commentsLocked";
  const hit = peekVideoLocks(ownerUid);
  const l = hit && Date.now() - hit.t < TTL ? hit : await getVideoLocks(ownerUid);
  if (l[key]) {
    return {
      ok: false,
      message:
        kind === "share"
          ? "Is video ka share band hai."
          : "Is video par comments band hain.",
    };
  }
  return { ok: true };
}
