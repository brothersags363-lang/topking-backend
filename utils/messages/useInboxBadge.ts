// Bottom bar ke Message (mail) icon ka lal count.
// Count = naye like / comment / follow + naye chat messages (jo last baar Messages khulne ke BAAD aaye).
// Messages tab khulte hi count 0 ho jata hai (lastSeen = abhi).
// Firestore me kuch write nahi hota -> sasta aur safe. Ek hi listener poori app ke liye.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { collection, getFirestore, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useSyncExternalStore } from 'react';

const KEY = (uid: string) => `inbox_last_seen_${uid}`;
const ms = (t: any) => (t && typeof t.toMillis === 'function' ? t.toMillis() : typeof t === 'number' ? t : 0);

let uid: string | undefined;
let lastSeen = 0;
let notifs: { at: number }[] = [];
let chats: { at: number; n: number }[] = [];
let count = 0;
let unsubs: Array<() => void> = [];
const listeners = new Set<() => void>();

function recompute() {
  let c = 0;
  for (const n of notifs) if (n.at > lastSeen) c++;
  for (const f of chats) if (f.n > 0 && f.at > lastSeen) c += f.n;
  if (c !== count) {
    count = c;
    listeners.forEach((l) => l());
  }
}

function stop() {
  unsubs.forEach((u) => u());
  unsubs = [];
  notifs = [];
  chats = [];
  count = 0;
}

async function start(u: string) {
  stop();
  uid = u;
  try {
    lastSeen = Number((await AsyncStorage.getItem(KEY(u))) || 0);
  } catch {
    lastSeen = 0;
  }
  // pehli baar install: purane sab count na ho -> abhi se ginti shuru
  if (!lastSeen) {
    lastSeen = Date.now();
    AsyncStorage.setItem(KEY(u), String(lastSeen)).catch(() => {});
  }
  if (uid !== u) return;
  const db = getFirestore();

  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', u, 'notifications'), orderBy('createdAt', 'desc'), limit(100)),
      (snap) => {
        notifs = snap.docs
          .map((d) => ({ at: ms((d.data() as any).createdAt) }))
          // serverTimestamp pending ho to abhi ka maan lo
          .map((x) => (x.at ? x : { at: Date.now() }));
        recompute();
      },
      () => {}
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'userChats', u, 'friends'), orderBy('updatedAt', 'desc'), limit(50)),
      (snap) => {
        chats = snap.docs.map((d) => {
          const x: any = d.data();
          return { at: ms(x.updatedAt) || Date.now(), n: Number(x.unreadCount) > 0 ? Number(x.unreadCount) : 0 };
        });
        recompute();
      },
      () => {}
    )
  );
}

let inited = false;
function init() {
  if (inited) return;
  inited = true;
  onAuthStateChanged(getAuth(), (user) => {
    if (user?.uid) start(user.uid);
    else {
      uid = undefined;
      stop();
      listeners.forEach((l) => l());
    }
  });
}

// Messages tab khulne par call karo -> badge 0
export function markInboxSeen() {
  lastSeen = Date.now();
  if (uid) AsyncStorage.setItem(KEY(uid), String(lastSeen)).catch(() => {});
  recompute();
}

const subscribe = (cb: () => void) => {
  init();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function useInboxBadge(): number {
  return useSyncExternalStore(subscribe, () => count, () => 0);
}
