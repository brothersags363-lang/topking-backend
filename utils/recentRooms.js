// utils/recentRooms.js
// SPEED: `rooms` collection me ended rooms hamesha rehte hain (videolive sirf status:"ended" likhta hai).
// Pehle har screen poori collection padhti thi -> JS thread par bhaari decode, app jam.
// Ab sirf pichhle 24 ghante ke rooms (teeno screens pehle se 1 din se purane room ko band maanti thin).
// createdAt kahin number (LiveStart: Date.now) aur kahin Timestamp (livevideostart: serverTimestamp)
// hai, aur Firestore inequality same type par hi chalti hai -> isliye dono type ki alag query.
import { collection, getDocs, onSnapshot, query, where, Timestamp } from 'firebase/firestore';

const ONE_DAY = 24 * 60 * 60 * 1000;

function queries(db) {
  const since = Date.now() - ONE_DAY;
  return {
    num: query(collection(db, 'rooms'), where('createdAt', '>', since)),
    ts: query(collection(db, 'rooms'), where('createdAt', '>', Timestamp.fromMillis(since))),
  };
}

// onSnap(snapshot, 'num' | 'ts'); onErr(error, key). Return: unsubscribe function.
export function listenRecentRooms(db, onSnap, onErr) {
  const q = queries(db);
  const u1 = onSnapshot(q.num, (s) => onSnap(s, 'num'), (e) => onErr && onErr(e, 'num'));
  const u2 = onSnapshot(q.ts, (s) => onSnap(s, 'ts'), (e) => onErr && onErr(e, 'ts'));
  return () => { u1(); u2(); };
}

// One-shot: purane getDocs(collection(db,'rooms')) jaisa, bas `.forEach(doc => ...)` deta hai.
// Dono query fail ho to null (purane .catch(() => null) jaisa).
export async function getRecentRooms(db) {
  const q = queries(db);
  const [a, b] = await Promise.all([
    getDocs(q.num).catch(() => null),
    getDocs(q.ts).catch(() => null),
  ]);
  if (!a && !b) return null;
  const docs = new Map();
  [a, b].forEach((s) => s && s.forEach((d) => docs.set(d.id, d)));
  return { forEach: (fn) => docs.forEach((d) => fn(d)) };
}
