// components/liveHosts.js
// ------------------------------------------------------------------
// Shared "who is live right now" store.
//
// * Ek hi Firestore listener (rooms collection) poori app ke liye,
//   chahe feed me 50 videos ho ya profile screen khuli ho.
// * all-live.js jaisi hi alive-rule: status ended/inactive/closed => band,
//   hostHeartbeat 10 min se purana => band, sirf public rooms.
// * useLiveHost(hostId) => { id, type, title, viewers, cover } | null
//   Sirf usi host ka component re-render hota hai jiski live state badli.
// ------------------------------------------------------------------
import { useCallback, useSyncExternalStore } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../app/firebaseConfig';
import { useBlockedIds } from '../utils/useBlockedIds';

const HEARTBEAT_TIMEOUT = 10 * 60 * 1000;
const RECHECK_INTERVAL = 30 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

const toMs = (v) => {
  if (!v) return 0;
  try {
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && v.seconds) return v.seconds * 1000;
    if (typeof v === 'object' && typeof v.toMillis === 'function') return v.toMillis();
    const p = new Date(v).getTime();
    return isNaN(p) ? 0 : p;
  } catch (e) {
    return 0;
  }
};

const heartbeatMs = (d) => toMs(d.hostHeartbeat) || toMs(d.lastHeartbeat);

const isAlive = (d) => {
  const s = d.status ? String(d.status).toLowerCase().trim() : '';
  if (s === 'ended' || s === 'inactive' || s === 'closed') return false;
  if ((d.roomType || 'public') !== 'public') return false;

  const now = Date.now();
  const created = toMs(d.createdAt);
  if (created && now - created > ONE_DAY) return false;

  const hb = heartbeatMs(d);
  if (!hb) return true;
  return now - hb <= HEARTBEAT_TIMEOUT;
};

const validUrl = (v) =>
  typeof v === 'string' && v.trim().length > 10 ? v.trim() : null;

// ---------------- store ----------------
let rawRooms = {};          // roomId -> raw firestore data
let liveByHost = {};        // hostId -> stable entry object
const listeners = new Set();
let unsubscribeFs = null;
let recheckTimer = null;

const sameEntry = (a, b) =>
  a && b &&
  a.id === b.id && a.type === b.type && a.title === b.title &&
  a.viewers === b.viewers && a.cover === b.cover && a.hostId === b.hostId;

const recompute = () => {
  const next = {};

  Object.keys(rawRooms).forEach((roomId) => {
    const d = rawRooms[roomId];
    if (!d || !isAlive(d)) return;

    const hostId = d.hostId || d.seatsData?.seat_1?.userId;
    if (!hostId) return;

    const created = toMs(d.createdAt);
    const prev = next[hostId];
    if (prev && prev._created >= created) return; // same host => newest room

    next[hostId] = {
      id: roomId,
      hostId,
      type: String(d.type || 'audio').toLowerCase(),
      title: d.title || d.roomName || 'Live',
      viewers: Math.max(0, Number(d.viewerCount) || 0),
      cover:
        validUrl(d.roomCover) || validUrl(d.cover) || validUrl(d.banner) ||
        validUrl(d.roomImg) || validUrl(d.hostImg) || validUrl(d.profileImg) || null,
      _created: created,
    };
  });

  // Purane object reuse karo jo badle nahi => useSyncExternalStore re-render skip
  let changed = Object.keys(next).length !== Object.keys(liveByHost).length;
  Object.keys(next).forEach((h) => {
    if (sameEntry(liveByHost[h], next[h])) next[h] = liveByHost[h];
    else changed = true;
  });

  if (changed) {
    liveByHost = next;
    listeners.forEach((l) => l());
  }
};

const start = () => {
  if (unsubscribeFs || !db) return;
  try {
    unsubscribeFs = onSnapshot(
      collection(db, 'rooms'),
      (snap) => {
        const m = {};
        snap.forEach((docItem) => {
          if (docItem.exists()) m[docItem.id] = docItem.data();
        });
        rawRooms = m;
        recompute();
      },
      () => {
        rawRooms = {};
        recompute();
      }
    );
  } catch (e) {
    unsubscribeFs = null;
  }
  // Host crash ho jaye to snapshot nahi aata; isliye stale heartbeat local check.
  recheckTimer = setInterval(recompute, RECHECK_INTERVAL);
};

const stop = () => {
  if (unsubscribeFs) { unsubscribeFs(); unsubscribeFs = null; }
  if (recheckTimer) { clearInterval(recheckTimer); recheckTimer = null; }
  rawRooms = {};
  liveByHost = {};
};

const subscribe = (cb) => {
  listeners.add(cb);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) stop();
  };
};

export function useLiveHost(hostId) {
  const { blocked } = useBlockedIds(); // BLOCK: blocked host ka live/ring nahi dikhe
  const getSnapshot = useCallback(
    () => (hostId && !blocked.has(hostId) ? liveByHost[hostId] || null : null),
    [hostId, blocked]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// all-live.js ke openLiveRoom jaisa hi navigation
export function openLiveRoom(router, live) {
  if (!live || !live.id) return;
  if (live.type === 'video') {
    router.push({ pathname: '/videolive', params: { id: live.id, role: 'viewer' } });
  } else {
    router.push({ pathname: '/LiveRoom', params: { id: live.id, from: 'alllive' } });
  }
}
