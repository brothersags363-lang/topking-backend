import PERF from '../../utils/devicePerf';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, orderBy, limit, getDocs, startAfter, Timestamp } from 'firebase/firestore';
import { db } from '../../app/firebaseConfig';
import { SEEN_HIDE_MS } from './feedStorage';

// ==========================
// BADI LIBRARY (1000+ videos) KE LIYE FETCH
// ==========================
// Pehle sirf "sabse naye" videos hi padhe jaate the -> purane videos kabhi
// feed me aate hi nahi the, aur sab dekhe hue hon to 25 pages (750 reads) padhta tha.
// Ab: naye videos + time ke RANDOM point se chhote pages (discovery).
// Purane videos bhi aate hain, reads kam lagte hain.
export const OLDEST_TS_KEY = 'feed_oldest_ts_v1';
export const RANDOM_PAGE_SIZE = 20;
export const MAX_FETCH_ROUNDS = 6;   // ek baar me max itne rounds (pehle 25 pages tak jata tha)
export let oldestTsCache: number | null = null;

// Sabse purane video ka time (sirf 1 read, phir phone me yaad)
export const getOldestTs = async (): Promise<number | null> => {
  if (oldestTsCache) return oldestTsCache;
  try {
    const raw = await AsyncStorage.getItem(OLDEST_TS_KEY);
    const n = raw ? Number(raw) : 0;
    if (n > 0) {
      oldestTsCache = n;
      return n;
    }
  } catch (e) {}
  try {
    const snap = await getDocs(
      query(collection(db, 'all_videos'), orderBy('createdAt', 'asc'), limit(1))
    );
    if (!snap.empty) {
      const c: any = snap.docs[0].data().createdAt;
      const ms = c && typeof c.seconds === 'number' ? c.seconds * 1000 : 0;
      if (ms > 0) {
        oldestTsCache = ms;
        AsyncStorage.setItem(OLDEST_TS_KEY, String(ms)).catch(() => {});
        return ms;
      }
    }
  } catch (e) {}
  return null;
};

// Purane se naye ke beech kisi random time ke aas-paas ka page
export const fetchRandomPage = (oldestMs: number) => {
  const ts = oldestMs + Math.random() * Math.max(1, Date.now() - oldestMs);
  return getDocs(
    query(
      collection(db, 'all_videos'),
      orderBy('createdAt', 'desc'),
      orderBy('__name__', 'desc'),
      startAfter(Timestamp.fromMillis(ts)),
      limit(RANDOM_PAGE_SIZE)
    )
  );
};

export const HOUR_MS = 60 * 60 * 1000;
export const RANK_USER_GAP = 3;      // ek hi user ke videos ke beech minimum gap
export const RANK_LOOKAHEAD = 8;     // gap ke liye kitne aage tak dekhna

export const videoTs = (video) => {
  const c = video.createdAt;
  if (!c) return 0;
  if (typeof c.seconds === 'number') return c.seconds * 1000;
  if (typeof c.toMillis === 'function') return c.toMillis();
  return 0;
};

// Sirf UNSEEN videos ke liye score: naya + popular + thoda random.
// (Seen videos ka order alag hota hai: sabse purana dekha hua pehle.)
export const scoreVideo = (video, now) => {
  const ageH = Math.max(0, (now - videoTs(video)) / HOUR_MS);
  let score = 0;

  // Naya video: 48h tak bada bonus, phir dheere dheere kam
  score += 60 * Math.exp(-ageH / 36);

  // Popular video: bonus (max 24) -> purane lekin acche videos bhi upar aate hain
  score += Math.min(24, Math.log10(1 + (video.engagementScore || 0)) * 7);

  // Quality: views ke muqable likes zyada -> acha video (max 20)
  const views = Math.max(10, Number(video.views) || 0);
  score += Math.min(1, (Number(video.likes) || 0) / views) * 20;

  // Random jitter: same level ke videos ka order har baar alag
  score += Math.random() * 35;

  return score;
};

// RULE:
//  1) Pehle saare UNSEEN videos (naye pehle)
//  2) Unseen khatam -> SEEN videos, jo sabse pehle dekha tha wo pehle
// Seen video kabhi unseen ke upar nahi aata.
export const isRecentlySeen = (seenMap, id, now = Date.now()) => {
  const info = seenMap[id];
  return !!info && now - info.t < SEEN_HIDE_MS;
};

export const rankFeed = (
  list,
  seenMap,
  previous = [],
  lastTopId = null,
  allowRecentSeen = false,
  need = Infinity
) => {
  if (!list || list.length === 0) return [];

  const now = Date.now();
  const unseen = [];
  const seen = [];
  list.forEach((v) => {
    if (!seenMap[v.id]) {
      unseen.push(v);
    } else if (allowRecentSeen || !isRecentlySeen(seenMap, v.id, now)) {
      // 3 din se purana seen hi wapas aa sakta hai
      seen.push(v);
    }
    // recently seen (3 din ke andar) -> feed se bahar
  });

  // score ek baar nikalo (comparator me random nahi chalna chahiye)
  const scores = new Map(unseen.map((v) => [v.id, scoreVideo(v, now)]));
  unseen.sort((a, b) => scores.get(b.id) - scores.get(a.id));
  seen.sort((a, b) => {
    const sa = seenMap[a.id];
    const sb = seenMap[b.id];
    return sa.t - sb.t;
  });

  const queue = [...unseen, ...seen];

  // SPEED: 1000+ videos me poora pool arrange nahi karna -- sirf aage ke
  // `need` (+ gap ke liye lookahead) videos chahiye.
  const queueLimit = need + RANK_LOOKAHEAD * 2;
  if (queue.length > queueLimit) queue.length = queueLimit;

  // Pichli baar ka top video is baar ke pehle batch me bilkul nahi aayega
  // (pehle 4th position par aata tha). Pool me rehta hai, par dekha ja chuka hone se
  // 3 din tak feed me nahi aata.
  if (lastTopId && previous.length === 0 && queue.length > 1) {
    const li = queue.findIndex((v) => v.id === lastTopId);
    if (li !== -1) queue.splice(li, 1);
  }

  const keyOf = (v) => v.userId || `video_${v.id}`;
  const recent = previous.slice(-RANK_USER_GAP).map(keyOf);
  const result = [];

  while (queue.length > 0 && result.length < need) {
    let idx = queue.findIndex(
      (v, i) => i < RANK_LOOKAHEAD && !recent.includes(keyOf(v))
    );
    if (idx === -1) idx = 0;

    const [next] = queue.splice(idx, 1);
    result.push(next);

    recent.push(keyOf(next));
    if (recent.length > RANK_USER_GAP) recent.shift();
  }

  return result;
};




// Active video ko poora bandwidth + bada buffer, agle (preload) video ko
// chhota buffer -> dono network ke liye ladte nahi, atakna kam hota hai.
// Kitne videos ke players pehle se ready rakhne hain.
// (Har ready player ek video decoder pakadta hai -> zyada karoge to
// kam RAM wale phone atkenge. 10 ek saath safe nahi, isliye 1 peeche + 3 aage.)
// SPEED: 1 peeche + 2 aage ke players ready -> fast swipe par bhi video turant chalta hai.
// INSTA: naye phone (iOS / Android 10+) par agle 3 videos ready -> tez swipe par bhi
// black/loader nahi. Purane/kam RAM wale Android par 2 (decoder limit).
// SMOOTH: kitne players / kitna buffer -> ab phone ke hisaab se utils/devicePerf.js se aata hai
// (PERF.cfg()). Weak phone par kam, naye phone par zyada; atakne par khud kam ho jata hai.

// STALL FIX: minBufferForPlayback 1 sec par network ek baar slow hote hi video
// 1 sec chalke dobara ruk jata tha (ruk-ruk ke chalna). Active video ko 2 sec
// ka buffer + bada forward buffer diya -> rebuffer ke baad bhi smooth chalta hai.
// Agla video (index+1): itna buffer ki scroll karte hi turant chal pade
// Door ke videos (pichla / index+2, +3): shuru ke ~3 sec,
// taaki active video ka bandwidth na khayein
// Sirf shuru ke ~4 sec: itna kaafi hai ki swipe par turant chal pade,
// aur 3 videos ek saath download karke active video ka network na khayein.

