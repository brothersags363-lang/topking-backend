import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../app/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { isFaceVerified } from '../UserTick';
import { auth, AVATAR_FALLBACK } from './feedShared';

// ==========================
// SEEN-VIDEO STORE (phone me save)  +  RANKING
// ==========================
// seen map: { [videoId]: { t: lastSeenTimestamp, n: kitni baar dekha } }
export const SEEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 din ki history rakho
export const SEEN_MAX = 2000;
// Ek baar dekha hua video itne din tak feed me wapas nahi aayega
export const SEEN_HIDE_MS = 3 * 24 * 60 * 60 * 1000; // 3 din (4 chahiye to 4 kar do)

// FIX: app kill karke kholne par auth.currentUser shuru me NULL hota hai
// (Firebase login baad me restore karta hai). Isliye pehle key 'guest' ban
// jaati thi aur seen history kabhi load hi nahi hoti thi -> har baar wahi
// video upar. Ab uid yaad rakhte hain aur load se pehle auth ka wait karte hain.
export let lastKnownUid = null;
export const keyUid = () => {
  if (auth.currentUser?.uid) lastKnownUid = auth.currentUser.uid;
  return lastKnownUid || 'guest';
};

export const waitForAuthUser = async () => {
  if (auth.currentUser) return auth.currentUser;
  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(null);
    };
    const timer = setTimeout(finish, 4000); // login na ho to atke nahi
    const unsub = onAuthStateChanged(auth, () => {
      clearTimeout(timer);
      try { unsub(); } catch (e) {}
      finish();
    });
  });
  return auth.currentUser;
};

export const seenStorageKey = () => `seen_videos_v2_${keyUid()}`;
export const lastTopStorageKey = () => `feed_last_top_v1_${keyUid()}`;

export const loadSeenMap = async () => {
  try {
    const raw = await AsyncStorage.getItem(seenStorageKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const now = Date.now();
    const out = {};
    Object.keys(parsed).forEach((id) => {
      const info = parsed[id];
      if (info && typeof info.t === 'number' && now - info.t < SEEN_TTL_MS) {
        out[id] = info;
      }
    });
    return out;
  } catch (e) {
    return {};
  }
};

export const saveSeenMap = async (map) => {
  try {
    const ids = Object.keys(map);
    if (ids.length > SEEN_MAX) {
      ids.sort((a, b) => map[b].t - map[a].t);
      ids.slice(SEEN_MAX).forEach((id) => delete map[id]);
    }
    await AsyncStorage.setItem(seenStorageKey(), JSON.stringify(map));
  } catch (e) {}
};

// Pichli baar feed me sabse upar kaunsa video tha
export const loadLastTop = async () => {
  try {
    return (await AsyncStorage.getItem(lastTopStorageKey())) || null;
  } catch (e) {
    return null;
  }
};

export const saveLastTop = async (id) => {
  try {
    await AsyncStorage.setItem(lastTopStorageKey(), id);
  } catch (e) {}
};

// ---------- VIEWS: ek hi user ek hi video ko har 30 minute baad dobara dekhe to view +1 ----------
export const VIEW_GAP_MS = 30 * 60 * 1000;
export const viewStampKey = () => `view_ts_v1_${keyUid()}`;
export let viewStampCache = null; // { [videoId]: lastCountedTimestamp }
export let viewStampUid = null;

export const loadViewStamps = async () => {
  const uid = keyUid();
  if (viewStampCache && viewStampUid === uid) return viewStampCache;
  viewStampUid = uid;
  try {
    const raw = await AsyncStorage.getItem(viewStampKey());
    const parsed = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    const out = {};
    // 30 min se purani entry ki zaroorat nahi -> map hamesha chhota rehta hai
    Object.keys(parsed).forEach((id) => {
      if (typeof parsed[id] === 'number' && now - parsed[id] < VIEW_GAP_MS) out[id] = parsed[id];
    });
    viewStampCache = out;
  } catch (e) {
    viewStampCache = {};
  }
  return viewStampCache;
};

// true = view gino (pehli baar ya pichle count se 30 min ho gaye), false = abhi nahi
export const shouldCountView = async (videoId) => {
  if (!videoId) return false;
  const map = await loadViewStamps();
  const now = Date.now();
  const last = map[videoId];
  if (typeof last === 'number' && now - last < VIEW_GAP_MS) return false;
  map[videoId] = now;
  AsyncStorage.setItem(viewStampKey(), JSON.stringify(map)).catch(() => {});
  return true;
};


// ==========================
// RESUME: jahan video roka tha wahi se dobara chalu
// ==========================
// videoPositions: { [videoId]: seconds }  (app chalte waqt memory me)
// feedCache: last feed + index (screen badalne par wapas aao to wahi video)
// persistResume: app background / band hone par phone me save (cold start resume)
export const RESUME_TTL_MS = 30 * 60 * 1000; // 30 min ke andar wapas aaye to resume
export const resumeStorageKey = () => `feed_resume_v1_${keyUid()}`;
export const videoPositions: Record<string, number> = {};
export let feedCache: any = null;
export const setFeedCache = (c: any) => { feedCache = c; };

// NOTE: Ab app band karke (cold start) dobara kholne par PURANA feed / video wapas nahi aata --
// jo video pichli baar upar tha wo dubara nahi dikhta, naya feed milta hai.
// Resume sirf tab hota hai jab app chal rahi ho aur user dusri screen se wapas feed par aaye
// (feedCache, memory me). Isliye phone me resume save/load band hai (speed bhi badhti hai).
export const persistResume = async () => {};

export const loadResume = async () => {
  if (
    feedCache &&
    feedCache.videos &&
    feedCache.videos.length > 0 &&
    Date.now() - feedCache.savedAt < RESUME_TTL_MS
  ) {
    return feedCache;
  }
  return null;
};

// ==========================
// INSTANT OPEN (Instagram jaisa): agli BINA DEKHI videos phone me
// ==========================
// App band karne se pehle feed me jo agli videos line me thin (user ne abhi dekhi nahi),
// unki list phone me rakhi jaati hai. Agli baar app khulte hi wahi turant dikhti hain
// (spinner / slow net ka wait nahi), aur naya feed peeche se aata rehta hai.
// Purani dekhi hui video wapas nahi aati (sirf unseen save hoti hain).
// Inme se kai videos pehle se phone me download ho chuki hoti hain -> net ke bina bhi chalti hain.
export const NEXTUP_TTL_MS = 12 * 60 * 60 * 1000; // 12 ghante
export const NEXTUP_MAX = 8;
export const nextUpStorageKey = () => `feed_nextup_v1_${keyUid()}`;

let nextUpTimer: any = null;
export const saveNextUp = (list: any[]) => {
  if (nextUpTimer) clearTimeout(nextUpTimer);
  // scroll ke beech har swipe par disk write nahi -> 1.5 sec ruk ke ek baar
  nextUpTimer = setTimeout(() => {
    nextUpTimer = null;
    try {
      const videos = (list || []).filter((v) => v && v.id).slice(0, NEXTUP_MAX);
      AsyncStorage.setItem(
        nextUpStorageKey(),
        JSON.stringify({ t: Date.now(), videos })
      ).catch(() => {});
    } catch (e) {}
  }, 1500);
};

export const loadNextUp = async () => {
  try {
    const raw = await AsyncStorage.getItem(nextUpStorageKey());
    if (!raw) return [];
    const o = JSON.parse(raw);
    if (!o || !Array.isArray(o.videos) || Date.now() - Number(o.t) > NEXTUP_TTL_MS) return [];
    return o.videos.filter((v) => v && v.id);
  } catch (e) {
    return [];
  }
};

// ==========================
// MY PROFILE (comment / reply / notification me naam + photo)
// ==========================
// FIX: app band karke kholne par currentUserData shuru me default 'User' hota
// tha (Firestore se aane me time lagta hai). Us beech comment karne par
// "User" naam se jata tha. Ab:
//  1) naam phone me cache hota hai -> app khulte hi turant sahi naam
//  2) comment bhejte waqt agar profile load nahi hui to pehle load hoti hai
//     (ya cache / login ka username) -> kabhi "User" nahi jayega
export const MY_PROFILE_CACHE_KEY = 'my_profile_cache_v1';
export let myProfilePromise: Promise<any> | null = null;
export let myProfileUid: string | null = null;

// users/{uid} doc se wahi naam + dp jo profile screen me dikhta hai
// (username, nahi to name; photo = profileImg). Email / Google photo kabhi nahi.
export const buildMyProfile = (user, data) => ({
  uid: user.uid,
  name: data?.username || data?.name || user.email?.split('@')[0] || 'User',
  photo: data?.profileImg || AVATAR_FALLBACK,
  verified: data?.verified || false,
  verifiedColor: data?.verifiedColor || '',
  faceVerified: isFaceVerified(data),
});

export const readCachedProfile = async () => {
  try {
    const raw = await AsyncStorage.getItem(MY_PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

export const saveCachedProfile = (profile) => {
  AsyncStorage.setItem(MY_PROFILE_CACHE_KEY, JSON.stringify(profile)).catch(() => {});
};

// Server se profile laata hai (3 baar retry). Fail hua to null --
// koi galat (email wala) naam kabhi return nahi hota.
export const loadMyProfile = async (force = false) => {
  const user = await waitForAuthUser();
  if (!user) return null;
  if (!force && myProfilePromise && myProfileUid === user.uid) {
    return myProfilePromise;
  }
  myProfileUid = user.uid;

  const p = (async () => {
    for (let i = 0; i < 3; i++) {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const profile = buildMyProfile(user, snap.exists() ? snap.data() : {});
        saveCachedProfile(profile);
        return profile;
      } catch (e) {
        await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      }
    }
    myProfilePromise = null; // dobara try ho sake
    const cached = await readCachedProfile();
    if (cached && cached.uid === user.uid && cached.name) return cached;
    return null;
  })();

  myProfilePromise = p;
  return p;
};

