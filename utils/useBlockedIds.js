// utils/useBlockedIds.js  (project root ke utils/ folder me rakho)
// Dono taraf ke block ek hi shared Set me:
//   maine jise block kiya   -> blockedUsers where blockerId == me
//   jisne mujhe block kiya  -> blockedUsers where blockedUserId == me
// Poori app me sirf 2 Firestore listeners chalte hain (har screen ke liye alag nahi).
import { useSyncExternalStore } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "../app/firebaseConfig";

const EMPTY = new Set();
const ref = { current: EMPTY }; // listeners / timers ke andar latest value ke liye
let blocked = EMPTY;
let iBlocked = new Set();
let blockedMe = new Set();
let unsubs = [];
let unsubAuth = null;
const listeners = new Set();

const publish = () => {
  blocked = new Set([...iBlocked, ...blockedMe]);
  ref.current = blocked;
  listeners.forEach((l) => l());
};

const stopDb = () => {
  unsubs.forEach((u) => { try { u(); } catch (_) {} });
  unsubs = [];
  iBlocked = new Set();
  blockedMe = new Set();
};

const startDb = (uid) => {
  stopDb();
  if (!uid || !db) { publish(); return; }
  unsubs.push(
    onSnapshot(
      query(collection(db, "blockedUsers"), where("blockerId", "==", uid)),
      (snap) => {
        iBlocked = new Set(snap.docs.map((d) => d.data().blockedUserId).filter(Boolean));
        publish();
      },
      () => {}
    ),
    onSnapshot(
      query(collection(db, "blockedUsers"), where("blockedUserId", "==", uid)),
      (snap) => {
        blockedMe = new Set(snap.docs.map((d) => d.data().blockerId).filter(Boolean));
        publish();
      },
      () => {}
    )
  );
};

const subscribe = (cb) => {
  listeners.add(cb);
  if (listeners.size === 1 && auth) {
    unsubAuth = onAuthStateChanged(auth, (u) => startDb(u?.uid));
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) {
      if (unsubAuth) { unsubAuth(); unsubAuth = null; }
      stopDb();
      blocked = EMPTY;
      ref.current = EMPTY;
    }
  };
};
const getSnapshot = () => blocked;

export function useBlockedIds() {
  const b = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { blocked: b, ref };
}
