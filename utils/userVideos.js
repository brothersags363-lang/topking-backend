// COST/SPEED FIX: pehle har profile par user ke SAARE videos (bina limit) download hote the.
// Ek heavy account par 1 query = 1000s reads => Firestore free quota khatam => poora app atakta tha.
// Ab: list limit ke saath, aur likes/views ka total server par sum hota hai (docs download nahi hote).
import {
  collection, query, where, orderBy, limit, getDocs, startAfter,
  getAggregateFromServer, sum, count,
} from 'firebase/firestore';
import { db } from '../app/firebaseConfig';

const TTL = 2 * 60 * 1000;
const listCache = new Map();
const totalsCache = new Map();

const fresh = (m, k) => {
  const h = m.get(k);
  return h && Date.now() - h.ts < TTL ? h.v : null;
};

export const clearUserVideosCache = (uid) => {
  if (uid) {
    for (const k of Array.from(listCache.keys())) if (k.startsWith(uid + ':')) listCache.delete(k);
    totalsCache.delete(uid);
  } else {
    listCache.clear();
    totalsCache.clear();
  }
};

// Newest `max` videos. Index na ho to bina orderBy ke fallback (phir bhi limit ke saath).
export async function fetchUserVideos(uid, max = 60, { force = false } = {}) {
  if (!uid) return [];
  const key = uid + ':' + max;
  if (!force) {
    const hit = fresh(listCache, key);
    if (hit) return hit;
  }
  const col = collection(db, 'all_videos');
  let snap;
  try {
    snap = await getDocs(query(col, where('userId', '==', uid), orderBy('createdAt', 'desc'), limit(max)));
  } catch (e) {
    snap = await getDocs(query(col, where('userId', '==', uid), limit(max)));
  }
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  listCache.set(key, { ts: Date.now(), v: list });
  return list;
}

// {likes, views, count} - server par sum (1 read / 1000 videos). Fail ho to null (full scan KABHI nahi).
export async function fetchUserVideoTotals(uid, { force = false } = {}) {
  if (!uid) return null;
  if (!force) {
    const hit = fresh(totalsCache, uid);
    if (hit) return hit;
  }
  try {
    const r = await getAggregateFromServer(
      query(collection(db, 'all_videos'), where('userId', '==', uid)),
      { likes: sum('likes'), views: sum('views'), count: count() }
    );
    const d = r.data();
    const v = { likes: Number(d.likes || 0), views: Number(d.views || 0), count: Number(d.count || 0) };
    totalsCache.set(uid, { ts: Date.now(), v });
    return v;
  } catch (e) {
    return null;
  }
}

// =====================================================================
// PAGE-BY-PAGE (Instagram jaisa): profile me 1000+ videos ho tab bhi sab dikhe.
// Pehle sirf 60 aati thin, uske baad kuch nahi. Ab:
//   const pager = createVideoPager(uid);
//   list = await pager.first();   // pinned + pehli 30
//   list = await pager.next();    // agli 30 (neeche scroll par); null = kuch naya nahi
//   pager.done                    // saari aa gayin
// =====================================================================
async function fetchUserVideosPage(uid, { after = null, size = 30, fallback = false } = {}) {
  const col = collection(db, 'all_videos');
  let snap;
  if (!fallback) {
    try {
      snap = await getDocs(
        query(
          col,
          where('userId', '==', uid),
          orderBy('createdAt', 'desc'),
          ...(after ? [startAfter(after)] : []),
          limit(size)
        )
      );
    } catch (e) {
      fallback = true; // index nahi bana -> bina orderBy (doc id ke order me), sort client par
    }
  }
  if (fallback) {
    snap = await getDocs(
      query(col, where('userId', '==', uid), ...(after ? [startAfter(after)] : []), limit(size))
    );
  }
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return {
    list,
    last: snap.docs.length ? snap.docs[snap.docs.length - 1] : after,
    done: snap.docs.length < size,
    fallback,
  };
}

// Pinned (max 5) alag se: page me na aayein tab bhi hamesha sabse upar dikhein
async function fetchPinnedVideos(uid) {
  try {
    const snap = await getDocs(
      query(collection(db, 'all_videos'), where('userId', '==', uid), where('pinned', '==', true), limit(10))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return [];
  }
}

export function createVideoPager(uid, pageSize = 30) {
  let last = null;
  let done = false;
  let busy = false;
  let fallback = false;
  let items = [];
  let ids = new Set();

  const merge = (arr) => {
    arr.forEach((v) => {
      if (v && v.id && !ids.has(v.id)) {
        ids.add(v.id);
        items.push(v);
      }
    });
  };

  return {
    get done() {
      return done;
    },
    async first() {
      last = null;
      done = false;
      fallback = false;
      items = [];
      ids = new Set();
      const [page, pins] = await Promise.all([
        fetchUserVideosPage(uid, { size: pageSize }),
        fetchPinnedVideos(uid),
      ]);
      merge(pins);
      merge(page.list);
      last = page.last;
      done = page.done;
      fallback = page.fallback;
      return items.slice();
    },
    async next() {
      if (done || busy || !last) return null;
      busy = true;
      try {
        const page = await fetchUserVideosPage(uid, { after: last, size: pageSize, fallback });
        const before = items.length;
        merge(page.list);
        last = page.last;
        done = page.done;
        return items.length > before ? items.slice() : null;
      } finally {
        busy = false;
      }
    },
  };
}
