import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../app/firebaseConfig';

export const MAX_PINNED = 5;

export const isPinnedVideo = (v) => !!(v && v.pinned);

const secs = (t) => {
  if (!t) return 0;
  if (typeof t.seconds === 'number') return t.seconds;
  if (typeof t.toMillis === 'function') return t.toMillis() / 1000;
  if (typeof t === 'number') return t > 1e12 ? t / 1000 : t;
  return 0;
};

// Pinned sabse upar (jo baad me pin hua wo pehle), baaki newest first. List in-place sort hoti hai.
export const sortProfileVideos = (arr) =>
  arr.sort((a, b) => {
    const pa = isPinnedVideo(a) ? 1 : 0;
    const pb = isPinnedVideo(b) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    if (pa && pb) return (Number(b.pinnedAt) || 0) - (Number(a.pinnedAt) || 0);
    return secs(b.createdAt) - secs(a.createdAt);
  });

// Max 5 pin. Pin karte waqt server se count check hota hai (2 equality => extra index nahi).
export async function setVideoPinned(videoId, uid, pin) {
  if (pin) {
    const snap = await getDocs(
      query(collection(db, 'all_videos'), where('userId', '==', uid), where('pinned', '==', true))
    );
    if (snap.size >= MAX_PINNED) return { ok: false, reason: 'limit' };
  }
  const pinnedAt = pin ? Date.now() : 0;
  await updateDoc(doc(db, 'all_videos', videoId), { pinned: !!pin, pinnedAt });
  return { ok: true, pinned: !!pin, pinnedAt };
}
