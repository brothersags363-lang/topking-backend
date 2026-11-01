// utils/homeData.js  (project root ke utils/ folder me rakho)
// Follow + Discover ka data + cache ek jagah.
// - Dono screens yahin se data lete hain (cache fresh ho to turant, network nahi)
// - Ek hi time par do baar fetch nahi hota (in-flight share)
// - prefetchHome(): For You khulne ke kuch der baad chupchap data + pehle thumbnails
//   load kar deta hai -> Follow/Discover pehli baar bhi spinner ke bina khulte hain.
import { collection, query, orderBy, where, limit, getDocs } from 'firebase/firestore';
import { Image as ExpoImage } from 'expo-image';
import { auth, db } from '../app/firebaseConfig';
import { tsMs, AVATAR_FALLBACK } from '../components/GridParts';

export const DISCOVER_TTL = 90 * 1000;
export const FOLLOW_TTL = 45 * 1000;

export const discoverCache = { at: 0, videos: [] };
export const followCache = { at: 0, uid: null, videos: [], lives: [] };

let discoverJob = null;
let followJob = null;

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------------- DISCOVER ----------------
export function loadDiscover(force = false) {
  if (!force && discoverCache.at && Date.now() - discoverCache.at < DISCOVER_TTL) {
    return Promise.resolve(discoverCache.videos);
  }
  if (discoverJob) return discoverJob;
  discoverJob = (async () => {
    try {
      const snap = await getDocs(
        query(collection(db, 'all_videos'), orderBy('createdAt', 'desc'), limit(60))
      );
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.status === 'blocked' || data.hidden === true) return;
        list.push({ id: d.id, ...data });
      });
      discoverCache.videos = shuffle(list);
      discoverCache.at = Date.now();
    } catch (e) {
      console.log('Discover load error:', e);
    } finally {
      discoverJob = null;
    }
    return discoverCache.videos;
  })();
  return discoverJob;
}

// ---------------- FOLLOW ----------------
async function fetchFollow(uid) {
  const fSnap = await getDocs(
    query(collection(db, 'follows'), where('followerId', '==', uid), limit(60))
  );
  const ids = [];
  fSnap.forEach((d) => {
    const t = d.data()?.followingId || d.id.slice(uid.length + 1);
    if (t) ids.push(t);
  });
  if (ids.length === 0) return { videos: [], lives: [] };
  const idSet = new Set(ids);

  const chunks = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
  const [snaps, rooms] = await Promise.all([
    Promise.all(
      chunks.map((c) =>
        getDocs(query(collection(db, 'all_videos'), where('userId', 'in', c), limit(20))).catch(() => null)
      )
    ),
    getDocs(query(collection(db, 'rooms'), limit(150))).catch(() => null),
  ]);

  const videos = [];
  snaps.forEach((sn) => {
    if (!sn) return;
    sn.forEach((d) => {
      const data = d.data();
      if (data.status === 'blocked' || data.hidden === true) return;
      videos.push({ id: d.id, ...data });
    });
  });
  videos.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));

  const lives = [];
  const now = Date.now();
  if (rooms) {
    rooms.forEach((d) => {
      const r = d.data();
      const st = String(r.status || '').toLowerCase().trim();
      if (st === 'ended' || st === 'inactive' || st === 'closed') return;
      if ((r.roomType || 'public') !== 'public') return;
      const hb = tsMs(r.hostHeartbeat) || tsMs(r.lastHeartbeat);
      if (hb && now - hb > 10 * 60 * 1000) return;
      const hostId = r.hostId || r.seatsData?.seat_1?.userId;
      if (!hostId || !idSet.has(hostId)) return;
      lives.push({
        id: d.id,
        hostId,
        host: r.hostName || r.host || 'User',
        img: r.hostImg || r.profileImg || AVATAR_FALLBACK,
        type: String(r.type || 'audio').toLowerCase(),
        layout: String(r.roomLayout || 'chat').toLowerCase(),
      });
    });
  }
  return { videos: videos.slice(0, 40), lives };
}

export function loadFollow(uid, force = false) {
  if (!uid) return Promise.resolve({ videos: [], lives: [] });
  if (!force && followCache.uid === uid && followCache.at && Date.now() - followCache.at < FOLLOW_TTL) {
    return Promise.resolve(followCache);
  }
  if (followJob && followJob.uid === uid) return followJob.p;
  const p = (async () => {
    try {
      const res = await fetchFollow(uid);
      followCache.uid = uid;
      followCache.videos = res.videos;
      followCache.lives = res.lives;
      followCache.at = Date.now();
    } catch (e) {
      console.log('Follow load error:', e);
    } finally {
      followJob = null;
    }
    return followCache.uid === uid ? followCache : { videos: [], lives: [] };
  })();
  followJob = { uid, p };
  return p;
}

// ---------------- PREFETCH ----------------
const warmImages = (list) => {
  try {
    const urls = list.slice(0, 8).map((v) => v.thumbnail).filter(Boolean);
    if (urls.length) ExpoImage.prefetch(urls, 'memory-disk');
  } catch (e) {}
};

// For You feed chalne ke baad ek baar bulao (idle time me). Fail ho to koi asar nahi.
export async function prefetchHome() {
  try {
    const d = await loadDiscover(false);
    warmImages(d);
    const uid = auth?.currentUser?.uid;
    if (uid) {
      const f = await loadFollow(uid, false);
      warmImages(f.videos || []);
    }
  } catch (e) {}
}
