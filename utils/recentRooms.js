// utils/recentRooms.js
// =====================================================================
// LIVE ROOMS LIST - ab Firestore listener nahi, BACKEND CACHE se.
//
// PEHLE: har phone `rooms` collection ko onSnapshot se sunta tha => har room-write
//        (heartbeat, viewerCount, gift star) har phone ke liye 1 read. Isi se din ke
//        karodon reads ho rahe the.
// AB:    GET /live/list (backend/liveList.js) server ke memory-cache se aati hai.
//        Phone har POLL_MS me ek hi list leta hai. Firestore reads = 0 (phone se).
//
// Public API pehle jaisa hi hai (listenRecentRooms / getRecentRooms), isliye
// all-live.js, liveHosts.js, useLiveSwipe.js, useRooms.ts, index.tsx, homeData.js
// me koi badlav nahi chahiye. Snapshot ka shape Firestore jaisa hi hai:
//   snap.docs / snap.forEach / snap.docChanges() ; doc.id / doc.data() / doc.exists()
// =====================================================================
import { AppState } from 'react-native';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { API_BASE } from './api';
import { prefetchAgoraToken } from './agoraToken';

const POLL_MS = 15000;          // live list har 15 sec
const FAIL_RETRY_MS = 5000;     // fail hone par jaldi dobara
const FETCH_TIMEOUT_MS = 12000; // Render cold start ke liye thoda lamba
const ONE_DAY = 24 * 60 * 60 * 1000;

let shared = null; // { subs:Set, rooms:Map(id -> {sig,data}), loaded, timer, fails, inFlight, appSub }

const makeDoc = (id, data) => ({ id, data: () => data, exists: () => true });

const makeSnap = (list, changes) => ({
  docs: list,
  size: list.length,
  empty: list.length === 0,
  forEach: (fn) => list.forEach(fn),
  docChanges: () => changes,
});

const addedChanges = (list) =>
  list.map((d, i) => ({ type: 'added', doc: d, oldIndex: -1, newIndex: i }));

const currentDocs = (s) => {
  const arr = [];
  s.rooms.forEach((v, id) => arr.push(makeDoc(id, v.data)));
  return arr;
};

async function fetchList() {
  const { auth } = require('../app/firebaseConfig');
  const user = auth && auth.currentUser;
  if (!user) throw new Error('not-logged-in');
  const token = await user.getIdToken();

  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const to = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetch(API_BASE + '/live/list', {
      headers: { Authorization: 'Bearer ' + token },
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!res.ok) { const er = new Error('http-' + res.status); er.status = res.status; throw er; }
    const json = await res.json();
    if (!json || json.success === false || !Array.isArray(json.rooms)) throw new Error('bad-response');
    return json.rooms;
  } finally {
    if (to) clearTimeout(to);
  }
}


// JOIN SPEED: top rooms ka Agora token pehle se le lo (cache me rehta hai ~40 min).
// User card dabata hai to token tayyar milta hai => join me server ka wait nahi (cold start bhi nahi dikhta).
// Sirf 4 sabse zyada viewers wale rooms, 400ms ke gap par, apne room ko chhodkar.
function prefetchTopTokens(rooms) {
  try {
    const { auth } = require('../app/firebaseConfig');
    const me = auth && auth.currentUser && auth.currentUser.uid;
    rooms
      .filter((r) => r && r.id && r.hostId !== me)
      .sort((a, b) => (Number(b.viewerCount) || 0) - (Number(a.viewerCount) || 0))
      .slice(0, 4)
      .forEach((r, i) => setTimeout(() => prefetchAgoraToken(r.id), i * 400));
  } catch (_) {}
}

// Naya data -> purane se compare -> subscribers ko diff bhejo
function applyRooms(s, rooms) {
  const next = new Map();
  const changes = [];
  const seenIds = new Set();

  rooms.forEach((r) => {
    if (!r || !r.id) return;
    seenIds.add(r.id);
    const sig = JSON.stringify(r);
    const prev = s.rooms.get(r.id);
    if (prev && prev.sig === sig) {
      next.set(r.id, prev);
      return;
    }
    const entry = { sig, data: r };
    next.set(r.id, entry);
    changes.push({
      type: prev ? 'modified' : 'added',
      doc: makeDoc(r.id, r),
      oldIndex: -1,
      newIndex: -1,
    });
  });
  s.rooms.forEach((prev, id) => {
    if (!seenIds.has(id)) {
      changes.push({ type: 'removed', doc: makeDoc(id, prev.data), oldIndex: -1, newIndex: -1 });
    }
  });
  s.rooms = next;

  if (!s.loaded) {
    // Pehli baar: sabko poori list (num me sab, ts khali) - purane do-query jaisa
    s.loaded = true;
    const list = currentDocs(s);
    s.subs.forEach((x) => {
      try { x.onSnap(makeSnap(list, addedChanges(list)), 'num'); } catch (_) {}
      try { x.onSnap(makeSnap([], []), 'ts'); } catch (_) {}
    });
    return;
  }
  if (!changes.length) return; // kuch nahi badla => kisi ko khabar nahi => re-render nahi
  const list = currentDocs(s);
  s.subs.forEach((x) => {
    try { x.onSnap(makeSnap(list, changes), 'num'); } catch (_) {}
  });
}

// Backend na chale to ek-baar ka Firestore read (listener nahi) - sirf bhagwan bharose ka rasta
async function firestoreFallback(db) {
  const since = Date.now() - ONE_DAY;
  const [a, b] = await Promise.all([
    getDocs(query(collection(db, 'rooms'), where('createdAt', '>', since))).catch(() => null),
    getDocs(query(collection(db, 'rooms'), where('createdAt', '>', Timestamp.fromMillis(since)))).catch(() => null),
  ]);
  if (!a && !b) return null;
  const out = [];
  [a, b].forEach((sn) => sn && sn.forEach((d) => out.push({ id: d.id, ...d.data() })));
  return out;
}

const isGuest = () => {
  try {
    const { auth } = require('../app/firebaseConfig');
    return !(auth && auth.currentUser);
  } catch (_) {
    return true;
  }
};

async function poll(s, db) {
  if (s.inFlight || !shared || shared !== s) return;
  // GUEST (bina login): live list server aur Firestore dono login maangte hain -> har 5 sec
  // ki bekaar (fail hone wali) request mat bhejo. 30 sec me check karo ki login hua ya nahi.
  if (isGuest()) {
    schedule(s, db, 30000);
    return;
  }
  s.inFlight = true;
  let ok = false;
  let lastStatus = 0;
  try {
    let rooms;
    try {
      rooms = await fetchList();
      s.fails = 0;
    } catch (e) {
      s.fails += 1;
      lastStatus = (e && e.status) || 0;
      // 3 baar lagatar fail => ek baar Firestore se le lo, taaki list khali na rahe
      if (s.fails >= 3 && db) rooms = await firestoreFallback(db);
      if (!rooms) throw e;
    }
    ok = true;
    if (shared === s) {
      applyRooms(s, rooms);
      prefetchTopTokens(rooms);
    }
  } catch (e) {
    if (!s.loaded) {
      s.subs.forEach((x) => { try { x.onErr && x.onErr(e, 'num'); } catch (_) {} });
      s.subs.forEach((x) => { try { x.onErr && x.onErr(e, 'ts'); } catch (_) {} });
    }
  } finally {
    s.inFlight = false;
    if (shared === s) schedule(s, db, ok ? POLL_MS : (lastStatus === 429 ? 30000 : FAIL_RETRY_MS)); // 429 par 30 sec ruko
  }
}

function schedule(s, db, delay) {
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(() => {
    s.timer = null;
    // app background me ho to poll mat karo (battery + data bachao)
    if (AppState.currentState !== 'active') { schedule(s, db, POLL_MS); return; }
    poll(s, db);
  }, delay);
}

// onSnap(snapshot, 'num' | 'ts'); onErr(error, key). Return: unsubscribe function.
export function listenRecentRooms(db, onSnap, onErr) {
  const sub = { onSnap, onErr };
  if (!shared) {
    const s = { subs: new Set(), rooms: new Map(), loaded: false, timer: null, fails: 0, inFlight: false, appSub: null };
    shared = s;
    s.appSub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && shared === s && !s.inFlight) schedule(s, db, 0); // wapas aate hi taaza list
    });
    poll(s, db);
  }
  const s = shared;
  s.subs.add(sub);
  // Guest ke time list nahi aayi thi aur ab login ho gaya -> naya screen khulte hi turant lao
  if (!s.loaded && !s.inFlight && !isGuest()) schedule(s, db, 0);
  // pehle se loaded data naye subscriber ko turant (async: caller ka unsub variable set ho chuka ho)
  if (s.loaded) {
    setTimeout(() => {
      if (!s.subs.has(sub)) return;
      const list = currentDocs(s);
      try { onSnap(makeSnap(list, addedChanges(list)), 'num'); } catch (_) {}
      try { onSnap(makeSnap([], []), 'ts'); } catch (_) {}
    }, 0);
  }
  return () => {
    s.subs.delete(sub);
    if (s.subs.size === 0) {
      if (s.timer) clearTimeout(s.timer);
      try { s.appSub && s.appSub.remove(); } catch (_) {}
      if (shared === s) shared = null;
    }
  };
}

// One-shot: `.forEach(doc => ...)` deta hai. Backend se; fail ho to null.
let oneShot = { at: 0, docs: null, failAt: 0 };
export async function getRecentRooms(db) {
  if (shared && shared.loaded) {
    const docs = currentDocs(shared);
    return { forEach: (fn) => docs.forEach(fn) };
  }
  if (oneShot.docs && Date.now() - oneShot.at < 10000) {
    const docs = oneShot.docs;
    return { forEach: (fn) => docs.forEach(fn) };
  }
  // fail hone par 10 sec tak dobara backend ko mat maaro (429 storm se bachao)
  if (Date.now() - oneShot.failAt < 10000) return null;
  try {
    const rooms = await fetchList();
    const docs = rooms.map((r) => makeDoc(r.id, r));
    oneShot = { at: Date.now(), docs, failAt: 0 };
    return { forEach: (fn) => docs.forEach(fn) };
  } catch (_) {
    oneShot.failAt = Date.now();
    try {
      const rooms = await firestoreFallback(db);
      if (!rooms) return null;
      const docs = rooms.map((r) => makeDoc(r.id, r));
      return { forEach: (fn) => docs.forEach(fn) };
    } catch (e) {
      return null;
    }
  }
}
