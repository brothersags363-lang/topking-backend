import { blockIfProfane } from "../../utils/guardText";
import { checkVideoAction } from "../../utils/videoLocks";
// ==========================
// IMPORTS
// ==========================
import { notifyNewFollower, notifyVideoLike } from "../../utils/pushNotify";
import React, { memo,  useRef, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { 
  View,
  Text,
  TouchableOpacity,
  Pressable,  
  StyleSheet,
  Dimensions,
  FlatList,
  ScrollView,
  Platform,
  Image,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Share,
  Alert,
  TextInput,
  BackHandler,
    Keyboard, 
      Animated,
  Easing,
  AppState,
  PanResponder,
  InteractionManager,
} from 'react-native';





import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  increment,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  limit,
  addDoc,
  getDocs,
  startAfter,
  where,
  documentId,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';



import { VideoView, useVideoPlayer } from 'expo-video';
import { Image as ExpoImage } from 'expo-image';
import { useEvent } from 'expo';
import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { useRouter, usePathname, useFocusEffect } from 'expo-router';

// ==========================
// FIREBASE
// ==========================
import { db } from '../firebaseConfig';
import { useLiveHost } from '../../components/liveHosts';
import { callApi } from '../../utils/api';
import { loadDiscover, loadFollow } from '../../utils/homeData';
import { videoLink } from '../../utils/shareLinks';
import useSwipeTabs from '../../utils/useSwipeTabs';

import { getAuth, onAuthStateChanged } from 'firebase/auth';

// Background reel-upload progress (post.tsx isko start karta hai,
// ye screen sirf isko "sunti" hai — jahan bhi user ho, yahi dikhega)
// File app/ ke BAHAR services/upload/ me hai, isliye '@/...' alias use kiya.
import { useUploadState } from '@/services/upload/uploadManager';
import UserTick, { isFaceVerified } from '../../components/UserTick';
import { AvatarFrame } from '../../components/FramedAvatar';



const { height, width } = Dimensions.get('screen');

const auth = getAuth();

const AVATAR_FALLBACK = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'; 

// Count ko short form me dikhao: 813 -> 813, 76000 -> 76K, 19200 -> 19.2K, 1200000 -> 1.2M
const formatCount = (n) => {
  const num = Number(n) || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(num >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(num >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(num);
};

const feedKeyExtractor = (item) => item.id;

const getFeedItemLayout = (_data, index) => ({
  length: height,
  offset: height * index,
  index,
});

// ==========================
// SEEN-VIDEO STORE (phone me save)  +  RANKING
// ==========================
// seen map: { [videoId]: { t: lastSeenTimestamp, n: kitni baar dekha } }
const SEEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 din ki history rakho
const SEEN_MAX = 2000;
// Ek baar dekha hua video itne din tak feed me wapas nahi aayega
const SEEN_HIDE_MS = 3 * 24 * 60 * 60 * 1000; // 3 din (4 chahiye to 4 kar do)

// FIX: app kill karke kholne par auth.currentUser shuru me NULL hota hai
// (Firebase login baad me restore karta hai). Isliye pehle key 'guest' ban
// jaati thi aur seen history kabhi load hi nahi hoti thi -> har baar wahi
// video upar. Ab uid yaad rakhte hain aur load se pehle auth ka wait karte hain.
let lastKnownUid = null;
const keyUid = () => {
  if (auth.currentUser?.uid) lastKnownUid = auth.currentUser.uid;
  return lastKnownUid || 'guest';
};

const waitForAuthUser = async () => {
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

const seenStorageKey = () => `seen_videos_v2_${keyUid()}`;
const lastTopStorageKey = () => `feed_last_top_v1_${keyUid()}`;

const loadSeenMap = async () => {
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

const saveSeenMap = async (map) => {
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
const loadLastTop = async () => {
  try {
    return (await AsyncStorage.getItem(lastTopStorageKey())) || null;
  } catch (e) {
    return null;
  }
};

const saveLastTop = async (id) => {
  try {
    await AsyncStorage.setItem(lastTopStorageKey(), id);
  } catch (e) {}
};

// ==========================
// RESUME: jahan video roka tha wahi se dobara chalu
// ==========================
// videoPositions: { [videoId]: seconds }  (app chalte waqt memory me)
// feedCache: last feed + index (screen badalne par wapas aao to wahi video)
// persistResume: app background / band hone par phone me save (cold start resume)
const RESUME_TTL_MS = 30 * 60 * 1000; // 30 min ke andar wapas aaye to resume
const resumeStorageKey = () => `feed_resume_v1_${keyUid()}`;
const videoPositions: Record<string, number> = {};
let feedCache: any = null;

const persistResume = async () => {
  try {
    if (!feedCache || !feedCache.videos || feedCache.videos.length === 0) return;
    const start = Math.max(0, feedCache.index - 1);
    const slice = feedCache.videos.slice(start, start + 30);
    const idx = feedCache.index - start;
    const curId = feedCache.videos[feedCache.index]?.id;
    const payload = JSON.stringify({
      videos: slice,
      index: idx,
      position: curId ? videoPositions[curId] || 0 : 0,
      savedAt: Date.now(),
    });
    await AsyncStorage.setItem(resumeStorageKey(), payload);
  } catch (e) {}
};

const loadResume = async () => {
  if (
    feedCache &&
    feedCache.videos &&
    feedCache.videos.length > 0 &&
    Date.now() - feedCache.savedAt < RESUME_TTL_MS
  ) {
    return feedCache;
  }
  try {
    const raw = await AsyncStorage.getItem(resumeStorageKey());
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (
      !saved ||
      !saved.videos ||
      saved.videos.length === 0 ||
      Date.now() - saved.savedAt > RESUME_TTL_MS
    ) {
      return null;
    }
    const curId = saved.videos[saved.index]?.id;
    if (curId && saved.position > 0.5) videoPositions[curId] = saved.position;
    return saved;
  } catch (e) {
    return null;
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
const MY_PROFILE_CACHE_KEY = 'my_profile_cache_v1';
let myProfilePromise: Promise<any> | null = null;
let myProfileUid: string | null = null;

// users/{uid} doc se wahi naam + dp jo profile screen me dikhta hai
// (username, nahi to name; photo = profileImg). Email / Google photo kabhi nahi.
const buildMyProfile = (user, data) => ({
  uid: user.uid,
  name: data?.username || data?.name || user.email?.split('@')[0] || 'User',
  photo: data?.profileImg || AVATAR_FALLBACK,
  verified: data?.verified || false,
  verifiedColor: data?.verifiedColor || '',
  faceVerified: isFaceVerified(data),
});

const readCachedProfile = async () => {
  try {
    const raw = await AsyncStorage.getItem(MY_PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

const saveCachedProfile = (profile) => {
  AsyncStorage.setItem(MY_PROFILE_CACHE_KEY, JSON.stringify(profile)).catch(() => {});
};

// Server se profile laata hai (3 baar retry). Fail hua to null --
// koi galat (email wala) naam kabhi return nahi hota.
const loadMyProfile = async (force = false) => {
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

// ==========================
// BADI LIBRARY (1000+ videos) KE LIYE FETCH
// ==========================
// Pehle sirf "sabse naye" videos hi padhe jaate the -> purane videos kabhi
// feed me aate hi nahi the, aur sab dekhe hue hon to 25 pages (750 reads) padhta tha.
// Ab: naye videos + time ke RANDOM point se chhote pages (discovery).
// Purane videos bhi aate hain, reads kam lagte hain.
const OLDEST_TS_KEY = 'feed_oldest_ts_v1';
const RANDOM_PAGE_SIZE = 20;
const MAX_FETCH_ROUNDS = 6;   // ek baar me max itne rounds (pehle 25 pages tak jata tha)
let oldestTsCache: number | null = null;

// Sabse purane video ka time (sirf 1 read, phir phone me yaad)
const getOldestTs = async (): Promise<number | null> => {
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
const fetchRandomPage = (oldestMs: number) => {
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

const HOUR_MS = 60 * 60 * 1000;
const RANK_USER_GAP = 3;      // ek hi user ke videos ke beech minimum gap
const RANK_LOOKAHEAD = 8;     // gap ke liye kitne aage tak dekhna

const videoTs = (video) => {
  const c = video.createdAt;
  if (!c) return 0;
  if (typeof c.seconds === 'number') return c.seconds * 1000;
  if (typeof c.toMillis === 'function') return c.toMillis();
  return 0;
};

// Sirf UNSEEN videos ke liye score: naya + popular + thoda random.
// (Seen videos ka order alag hota hai: sabse purana dekha hua pehle.)
const scoreVideo = (video, now) => {
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
const isRecentlySeen = (seenMap, id, now = Date.now()) => {
  const info = seenMap[id];
  return !!info && now - info.t < SEEN_HIDE_MS;
};

const rankFeed = (
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

  // Pichli baar ka top video is baar top par nahi -> 4th position par
  if (
    lastTopId &&
    previous.length === 0 &&
    queue.length > 1 &&
    queue[0].id === lastTopId
  ) {
    const first = queue.shift();
    queue.splice(Math.min(3, queue.length), 0, first);
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
const PRELOAD_BEHIND = 1; // INSTA: peeche ka 1 video ready -> upar scroll karte hi turant chalta hai
const PRELOAD_AHEAD = 2; // SMOOTH: current video ke time agle 2 videos background me ready

// STALL FIX: minBufferForPlayback 1 sec par network ek baar slow hote hi video
// 1 sec chalke dobara ruk jata tha (ruk-ruk ke chalna). Active video ko 2 sec
// ka buffer + bada forward buffer diya -> rebuffer ke baad bhi smooth chalta hai.
const ACTIVE_BUFFER = {
  maxBufferBytes: 30 * 1024 * 1024,
  preferredForwardBufferDuration: 20,
  minBufferForPlayback: 2,
  prioritizeTimeOverSizeThreshold: true,
};
// Agla video (index+1): itna buffer ki scroll karte hi turant chal pade
const NEAR_BUFFER = {
  maxBufferBytes: 8 * 1024 * 1024,
  preferredForwardBufferDuration: 8,
  minBufferForPlayback: 1,
  prioritizeTimeOverSizeThreshold: true,
};
// Door ke videos (pichla / index+2, +3): shuru ke ~3 sec,
// taaki active video ka bandwidth na khayein
const PRELOAD_BUFFER = {
  maxBufferBytes: 6 * 1024 * 1024,
  preferredForwardBufferDuration: 6,
  minBufferForPlayback: 1,
  prioritizeTimeOverSizeThreshold: true,
};

// ======================================================
// SEEK BAR (niche menu se chipka PEELA line)
// ======================================================
// Active video ka player yahan register hota hai. VideoSeekBar (jo niche
// menu me hai) isi ko sunta hai -> video ke hisaab se line chalti hai,
// time (0:12 / 0:30) dikhta hai, aur ungli se aage-peeche kar sakte ho.
let seekTarget: { player: any; videoId: string } | null = null;
const seekListeners = new Set<() => void>();
const setSeekTarget = (t: { player: any; videoId: string } | null) => {
  seekTarget = t;
  seekListeners.forEach((fn) => fn());
};

const fmtTime = (sec: number) => {
  const t = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

const VideoSeekBar = memo(function VideoSeekBar() {
  const [target, setTarget] = useState(seekTarget);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [dragging, setDragging] = useState(false);

  const targetRef = useRef(seekTarget);
  const durRef = useRef(0);
  const draggingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const barWidthRef = useRef(width);
  const lastSeekAtRef = useRef(0);

  // Active video badalte hi naya player pakdo
  useEffect(() => {
    const fn = () => {
      targetRef.current = seekTarget;
      durRef.current = 0;
      setTarget(seekTarget);
      setPos(0);
      setDur(0);
    };
    seekListeners.add(fn);
    return () => {
      seekListeners.delete(fn);
    };
  }, []);

  // Video ke hisaab se line aage badhe (sirf ye chhota component re-render hota hai)
  useEffect(() => {
    if (!target) return;
    const p = target.player;
    const tick = () => {
      try {
        const d = p.duration || 0;
        if (d !== durRef.current) {
          durRef.current = d;
          setDur(d);
        }
        if (!draggingRef.current) setPos(p.currentTime || 0);
      } catch (e) {}
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [target]);

  const seekTo = (x: number, force: boolean) => {
    const d = durRef.current;
    const p = targetRef.current?.player;
    if (!d || !p) return;
    const ratio = Math.min(1, Math.max(0, x / (barWidthRef.current || width)));
    const t = ratio * d;
    setPos(t);
    const now = Date.now();
    if (force || now - lastSeekAtRef.current > 80) {
      lastSeekAtRef.current = now;
      try { p.currentTime = t; } catch (e) {}
    }
  };

  const finishDrag = (x: number) => {
    seekTo(x, true);
    draggingRef.current = false;
    setDragging(false);
    try {
      if (wasPlayingRef.current) targetRef.current?.player.play();
    } catch (e) {}
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !!targetRef.current && durRef.current > 0,
      onMoveShouldSetPanResponder: () => !!targetRef.current && durRef.current > 0,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        draggingRef.current = true;
        setDragging(true);
        try {
          const p = targetRef.current?.player;
          wasPlayingRef.current = !!p?.playing;
          p?.pause();
        } catch (err) {}
        seekTo(e.nativeEvent.pageX, true);
      },
      onPanResponderMove: (_, g) => seekTo(g.moveX, false),
      onPanResponderRelease: (_, g) => finishDrag(g.moveX),
      onPanResponderTerminate: (_, g) => finishDrag(g.moveX),
    })
  ).current;

  const ratio = dur > 0 ? Math.min(1, pos / dur) : 0;

  return (
    <View
      style={styles.seekWrap}
      onLayout={(e) => { barWidthRef.current = e.nativeEvent.layout.width; }}
      {...pan.panHandlers}
    >
      {/* time: sirf aage-peeche karte waqt dikhega */}
      {dragging && dur > 0 ? (
        <View style={styles.seekTimeBox} pointerEvents="none">
          <Text style={styles.seekTimeBig}>
            {fmtTime(pos)} / {fmtTime(dur)}
          </Text>
        </View>
      ) : null}

      {/* peela line: menu ke upar se chipka */}
      <View style={[styles.seekTrack, dragging && styles.seekTrackActive]} pointerEvents="none">
        <View style={[styles.seekFill, { width: `${ratio * 100}%` }]} />
      </View>
      {dragging ? (
        <View
          pointerEvents="none"
          style={[styles.seekThumb, { left: `${ratio * 100}%` }]}
        />
      ) : null}
    </View>
  );
});

// ======================================================
// AUDIO FIX: sab feed players ek registry me.
// Swipe par pichhle video ki awaaz React re-render ka intezaar nahi
// karti -> turant (synchronously) band/mute hoti hai.
// ======================================================
const feedPlayers = new Map<string, any>();

// activeId ke alawa sab players turant pause + mute
const silenceOthers = (activeId: string | null | undefined) => {
  feedPlayers.forEach((p, id) => {
    if (id === activeId) return;
    try { p.muted = true; } catch (e) {}
    try { p.pause(); } catch (e) {}
  });
};

// INSTA: swipe par naya video React re-render ka wait kiye bina TURANT chalu
// (registry ke player par seedha unmute + play)
const playActiveNow = (activeId: string | null | undefined) => {
  if (!activeId) return;
  const p = feedPlayers.get(activeId);
  if (!p) return;
  try { p.muted = false; } catch (e) {}
  try { p.play(); } catch (e) {}
};

// Sirf awaaz band/chalu (video wahi rahe) -> swipe ke beech me halka
const setActiveMuted = (activeId: string | null | undefined, muted: boolean) => {
  if (!activeId) return;
  const p = feedPlayers.get(activeId);
  if (!p) return;
  try { p.muted = muted; } catch (e) {}
};

const FeedVideo = memo(
function FeedVideo({ uri, active, thumbnail, near, videoId, isCurrent }) {

  // Thumbnail tab tak dikhta hai jab tak video ka pehla frame na aa jaye
  const [ready, setReady] = useState(false);

  // useCaching: video phone me cache hota hai -> loop / dubara dekhne par
  // dobara download nahi, loop point par atakna nahi.
  const source = useMemo(() => ({ uri, useCaching: true }), [uri]);

  // Pichli baar jaha roka tha (seconds) -> wahi se start
  const resumeAtRef = useRef(videoPositions[videoId] || 0);

  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.bufferOptions = PRELOAD_BUFFER;
    if (resumeAtRef.current > 0.5) {
      try { p.currentTime = resumeAtRef.current; } catch (e) {}
    }
  });

  // Registry me daalo / hatao
  useEffect(() => {
    if (!videoId) return;
    feedPlayers.set(videoId, player);
    return () => {
      if (feedPlayers.get(videoId) === player) feedPlayers.delete(videoId);
    };
  }, [player, videoId]);

  // Agar player ready hone par position set nahi hui to ek baar aur seek
  useEffect(() => {
    const target = resumeAtRef.current;
    if (!(target > 0.5)) return;

    const trySeek = () => {
      try {
        if (Math.abs(player.currentTime - target) > 1) {
          player.currentTime = target;
        }
      } catch (e) {}
      resumeAtRef.current = 0;
    };

    if (player.status === 'readyToPlay') {
      trySeek();
      return;
    }

    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && resumeAtRef.current > 0.5) {
        trySeek();
      }
    });
    return () => sub.remove();
  }, [player]);

  // Niche wali seek bar ko batao ki abhi kaunsa video current hai
  useEffect(() => {
    if (!isCurrent) return;
    setSeekTarget({ player, videoId });
    return () => {
      if (seekTarget && seekTarget.player === player) setSeekTarget(null);
    };
  }, [isCurrent, player, videoId]);

  // Chalte waqt har 1 sec me position yaad rakho (band/pause/screen change par bhi save)
  useEffect(() => {
    if (!active || !videoId) return;
    const save = () => {
      try {
        const c = player.currentTime;
        if (c > 0) videoPositions[videoId] = c;
      } catch (e) {}
    };
    // WATCHDOG: active video data ready hone ke baad bhi ruka ho (audio focus /
    // decoder hiccup / rebuffer ke baad) to khud dobara play karo.
    // Tap se pause hone par `active` false hota hai, isliye wo yahan nahi chhedta.
    const nudge = () => {
      try {
        if (player.status === 'readyToPlay' && !player.playing) player.play();
      } catch (e) {}
    };
    const t = setInterval(() => {
      save();
      nudge();
    }, 1000);
    return () => {
      clearInterval(t);
      save();
    };
  }, [active, player, videoId]);

  // App background se wapas aane par video khud dobara chale
  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        try { player.play(); } catch (e) {}
      }
    });
    return () => sub.remove();
  }, [active, player]);

  // Buffer settings alag effect me: sirf buffer badalna hai, play/pause/seek nahi.
  useEffect(() => {
    player.bufferOptions = active
      ? ACTIVE_BUFFER
      : near
      ? NEAR_BUFFER
      : PRELOAD_BUFFER;
  }, [active, near, player]);

  // SPEED FIX: pehle har baar (even preload hote waqt) currentTime = 0 seek
  // hota tha, jisse buffer reset ho sakta tha. Ab sirf tab reset hota hai
  // jab video pehle chal chuka ho aur ab scroll karke nikal gaya ho.
  // Sirf play / pause. (Pehle yahan pause hote hi video 0 par chala jata tha -
  // isi wajah se screen badalne / tap-pause ke baad video shuru se start hota tha.)
  useEffect(() => {
    if (active) {
      try { player.muted = false; } catch (e) {}
      player.play();
    } else {
      // inactive: pehle mute (turant), phir pause
      try { player.muted = true; } catch (e) {}
      player.pause();
    }
  }, [active, player]);

  // Video 0 par TABHI jaye jab user usse scroll karke aage/peeche nikal jaye
  // SMOOTH: seek(0) swipe animation ke BEECH me nahi hota (decoder ka kaam
  // scroll se ladta tha) -> swipe settle hone ke baad hota hai.
  const wasCurrentRef = useRef(false);
  useEffect(() => {
    if (isCurrent) {
      wasCurrentRef.current = true;
      return;
    }
    if (!wasCurrentRef.current) return;
    wasCurrentRef.current = false;
    delete videoPositions[videoId];
    const t = setTimeout(() => {
      try { player.currentTime = 0; } catch (e) {}
    }, 400);
    return () => clearTimeout(t); // user turant wapas aaya to reset nahi
  }, [isCurrent, player, videoId]);

  // Buffering ho rahi ho to chhota spinner dikhao (frozen frame nahi lagega)
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const isBuffering = active && ready && status === 'loading';

  return (
    <>
      <VideoView
        style={styles.video}
        player={player}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        contentFit="cover"
        // Android: SurfaceView scroll me black flash deta hai -> TextureView
        surfaceType="textureView"
        useExoShutter={false}
        onFirstFrameRender={() => setReady(true)}
      />
      {!ready && thumbnail ? (
        <ExpoImage source={thumbnail} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" priority="high" transition={0} pointerEvents="none" />
      ) : null}
      {isBuffering ? (
        <View style={styles.bufferSpinner} pointerEvents="none">
          <ActivityIndicator size="small" color="#ffffff" />
        </View>
      ) : null}
    </>
  );
},

(prevProps, nextProps) => {
  return (
    prevProps.uri === nextProps.uri &&
    prevProps.active === nextProps.active &&
    prevProps.near === nextProps.near &&
    prevProps.isCurrent === nextProps.isCurrent &&
    prevProps.videoId === nextProps.videoId &&
    prevProps.thumbnail === nextProps.thumbnail
  );
}

);


// ==========================================================
// TabGrid — Follow (live row + 2 column grid) / Discover (masonry)
// Alag memo component: For You feed se koi lena-dena nahi, isliye
// feed ki speed par asar nahi padta. Sirf thumbnail images dikhte hain
// (koi video player nahi) -> bahut halka.
// ==========================================================
const GRID_GAP = 6;
const GRID_PAD = 8;
const GRID_TOP = Platform.OS === 'ios' ? 112 : 92;
const GRID_BOTTOM = 96;
const DISC_RATIOS = [1.0, 1.5, 1.25, 1.65, 1.1, 1.4];

const timeAgo = (t) => {
  const ms = Date.now() - tsMsGlobal(t);
  if (!t || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} mins ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hrs ago`;
  return `${Math.floor(h / 24)} days ago`;
};
const tsMsGlobal = (t) => {
  if (!t) return 0;
  if (typeof t === 'number') return t;
  if (t.toMillis) return t.toMillis();
  if (t.seconds) return t.seconds * 1000;
  return 0;
};

const GridTile = memo(function GridTile({ item, idx, w, h, meta, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(idx)}
      style={{ width: w, height: h, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1a1a1a', marginBottom: GRID_GAP }}
    >
      {item.thumbnail ? (
        <ExpoImage
          source={item.thumbnail}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={item.id}
          transition={0}
        />
      ) : null}
      {meta ? (
        <View style={styles.gridMeta}>
          <ExpoImage
            source={item.profile || AVATAR_FALLBACK}
            style={styles.gridAvatar}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.gridName} numberOfLines={1}>{item.username || 'user'}</Text>
            <Text style={styles.gridTime} numberOfLines={1}>{timeAgo(item.createdAt)}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.gridCaption} numberOfLines={1}>{item.username || ''}</Text>
      )}
    </TouchableOpacity>
  );
});

const LiveBubble = memo(function LiveBubble({ st, onPress }) {
  const isLive = st.type === 'video';
  return (
    <TouchableOpacity style={styles.liveBubble} activeOpacity={0.8} onPress={() => onPress(st)}>
      <View style={[styles.liveRing, !isLive && { borderColor: '#ff8a00' }]}>
        <ExpoImage source={st.img} style={styles.liveImg} contentFit="cover" cachePolicy="memory-disk" />
        <View style={[styles.liveBadge, { backgroundColor: isLive ? '#FFEB00' : '#ff8a00' }]}>
          <Text style={styles.liveBadgeText}>{isLive ? 'LIVE' : 'CHAT'}</Text>
        </View>
      </View>
      <Text style={styles.liveName} numberOfLines={1}>{st.host}</Text>
    </TouchableOpacity>
  );
});

// SPEED: grid ke saare style / key / render function module-level -> har render par naye
// object/function nahi bante, isliye memo GridTile / FlatList bina wajah re-render nahi hote.
const TILE_W = (width - GRID_PAD * 2 - GRID_GAP) / 2;
const gridKey = (v) => String(v.id);
const FOLLOW_COL_STYLE = { justifyContent: 'space-between', paddingHorizontal: GRID_PAD };
const FOLLOW_LIST_STYLE = { paddingTop: GRID_TOP, paddingBottom: GRID_BOTTOM };
const LIVE_ROW_STYLE = { paddingHorizontal: GRID_PAD, paddingBottom: 10 };
const DISC_SCROLL_STYLE = { paddingTop: GRID_TOP, paddingBottom: GRID_BOTTOM, paddingHorizontal: GRID_PAD };
const DISC_ROW_STYLE = { flexDirection: 'row', justifyContent: 'space-between' };
const DISC_COL_STYLE = { width: TILE_W };
const FOLLOW_TILE_H = TILE_W * 1.55;

const TabGrid = memo(function TabGrid({ mode, data, live, loading, onOpen, onLive }) {
  const isFollow = mode === 'follow';
  // data ref me rakha -> `open` ka function har data update par naya nahi banta
  const dataRef = useRef(data);
  dataRef.current = data;
  const open = useCallback((idx) => onOpen(dataRef.current, idx), [onOpen]);

  const renderLive = useCallback(({ item }) => <LiveBubble st={item} onPress={onLive} />, [onLive]);
  const renderFollowItem = useCallback(
    ({ item, index }) => (
      <GridTile item={item} idx={index} w={TILE_W} h={FOLLOW_TILE_H} meta onPress={open} />
    ),
    [open]
  );

  const liveRow = useMemo(
    () =>
      live && live.length > 0 ? (
        <FlatList
          data={live}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={gridKey}
          renderItem={renderLive}
          contentContainerStyle={LIVE_ROW_STYLE}
          initialNumToRender={6}
          windowSize={3}
          overScrollMode="never"
        />
      ) : null,
    [live, renderLive]
  );
  const header = useMemo(() => <View>{liveRow}</View>, [liveRow]);

  // DISCOVER: 2 column masonry (alag-alag height). Max 30 tile = halka. useMemo -> sirf data badalne par banta hai.
  const cols = useMemo(() => {
    if (isFollow) return null;
    const c = [[], []];
    data.slice(0, 30).forEach((it, i) => {
      const ratio = DISC_RATIOS[i % DISC_RATIOS.length];
      c[i % 2].push({ it, i, h: TILE_W * ratio });
    });
    return c;
  }, [isFollow, data]);

  const empty = !loading && data.length === 0;
  const emptyView = empty ? (
    <Text style={styles.gridEmpty}>
      {isFollow ? 'Jin ko aap follow karte ho unke videos yahan dikhenge' : 'Abhi koi video nahi mila'}
    </Text>
  ) : loading && data.length === 0 ? (
    <ActivityIndicator size="large" color="#FFEB00" style={{ marginTop: 60 }} />
  ) : null;

  if (isFollow) {
    return (
      <View style={styles.gridRoot}>
        <FlatList
          data={data}
          numColumns={2}
          keyExtractor={gridKey}
          renderItem={renderFollowItem}
          columnWrapperStyle={FOLLOW_COL_STYLE}
          ListHeaderComponent={header}
          ListEmptyComponent={emptyView}
          contentContainerStyle={FOLLOW_LIST_STYLE}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={4}
          updateCellsBatchingPeriod={40}
          windowSize={5}
          overScrollMode="never"
          removeClippedSubviews
        />
      </View>
    );
  }

  return (
    <View style={styles.gridRoot}>
      <ScrollView
        contentContainerStyle={DISC_SCROLL_STYLE}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
      >
        {emptyView}
        <View style={DISC_ROW_STYLE}>
          {cols.map((col, ci) => (
            <View key={ci} style={DISC_COL_STYLE}>
              {col.map(({ it, i, h }) => (
                <GridTile key={it.id} item={it} idx={i} w={TILE_W} h={h} meta={false} onPress={open} />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
});

// ==========================================================
// FeedTopBar — Live icon + Discover / Follow / For You
// memo: sirf activeTab badalne par re-render, scroll/like par nahi
// ==========================================================
const FeedTopBar = memo(function FeedTopBar({
  activeTab,
  onLive,
  onDiscover,
  onFollow,
  onForYou,
}) {
  return (
    <View style={styles.topBar} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.topLiveBtn}
        onPress={onLive}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        activeOpacity={0.7}
      >
        <Ionicons name="radio-outline" size={26} color="#ffffff" style={styles.iconShadow} />
      </TouchableOpacity>

      <View style={styles.topTabsRow}>
        <TouchableOpacity
          style={styles.topTabBtn}
          onPress={onDiscover}
          hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
          activeOpacity={0.7}
        >
          <Text style={[styles.topTabText, activeTab === 'discover' && styles.topTabTextActive]}>Discover</Text>
          {activeTab === 'discover' && <View style={styles.topTabUnderline} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.topTabBtn}
          onPress={onFollow}
          hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
          activeOpacity={0.7}
        >
          <Text style={[styles.topTabText, activeTab === 'follow' && styles.topTabTextActive]}>Follow</Text>
          {activeTab === 'follow' && <View style={styles.topTabUnderline} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.topTabBtn}
          onPress={onForYou}
          hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
          activeOpacity={0.7}
        >
          <Text style={[styles.topTabText, activeTab === 'foryou' && styles.topTabTextActive]}>For You</Text>
          {activeTab === 'foryou' && <View style={styles.topTabUnderline} />}
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ======================================================
// UploadStatusBadge — background reel-upload progress pill
// ======================================================
// FIX (performance): isse jaan-boojh kar ek alag, standalone
// component me rakha gaya hai jiska koi prop nahi hai. `useUploadState`
// hook ke andar ka `useState` isi component ke fiber se juda hota
// hai — matlab jab bhi upload % badle (jo network chunk ke hisaab se
// baar-baar ho sakta hai), sirf ye chhota badge re-render hota hai,
// bhaari `BottomNav` (poora reels FlatList wala parent) bilkul touch
// nahi hota. Isse feed scroll karte waqt kabhi lag/jhatka mehsoos
// nahi hoga.
const UploadStatusBadge = memo(function UploadStatusBadge() {
  const uploadState = useUploadState();

  if (
    !uploadState.uploading &&
    !uploadState.justCompleted &&
    !uploadState.error &&
    !uploadState.retrying
  ) {
    return null;
  }

  return (
    <View style={styles.uploadBadge} pointerEvents="none">
      {uploadState.error ? (
        <Text style={styles.uploadBadgeErrorText} numberOfLines={1}>
          ⚠️ Upload failed
        </Text>
      ) : uploadState.retrying ? (
        <Text style={styles.uploadBadgeText} numberOfLines={1}>
          🔄 Retrying...
        </Text>
      ) : uploadState.justCompleted ? (
        <Text style={styles.uploadBadgeText}>✅ Posted</Text>
      ) : (
        <>
          <Text style={styles.uploadBadgeText}>{uploadState.progress}%</Text>
          <View style={styles.uploadBadgeTrack}>
            <View style={[styles.uploadBadgeFill, { width: `${uploadState.progress}%` }]} />
          </View>
        </>
      )}
    </View>
  );
});


// ======================================================
// SMOOTH LIKE: heart bounce + double-tap heart pop animation
// (native driver -> JS thread block hone par bhi smooth)
// ======================================================
const LikeButton = memo(function LikeButton({ liked, count, videoId, onLike }) {
  const scale = useRef(new Animated.Value(1)).current;
  const prevLiked = useRef(liked);

  useEffect(() => {
    if (liked !== prevLiked.current) {
      scale.stopAnimation();
      scale.setValue(liked ? 0.6 : 0.85);
      Animated.spring(scale, {
        toValue: 1,
        friction: liked ? 3 : 5,
        tension: liked ? 180 : 200,
        useNativeDriver: true,
      }).start();
      prevLiked.current = liked;
    }
  }, [liked, scale]);

  return (
    <TouchableOpacity
      style={styles.iconBox}
      activeOpacity={0.8}
      onPress={() => onLike(videoId)}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name="heart"
          size={44}
          color={liked ? "#ff2d55" : "#ffffff"}
          style={styles.iconShadow}
        />
      </Animated.View>
      <Text style={styles.iconText}>{formatCount(count)}</Text>
    </TouchableOpacity>
  );
});

const HeartPopup = memo(function HeartPopup() {
  const scale = useRef(new Animated.Value(0.3)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1.2,
        friction: 4,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.delay(480),
        Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]),
    ]).start();
  }, [scale, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.heartPopup, { opacity, transform: [{ scale }] }]}
    >
      <Ionicons name="heart" size={140} color="#ff004f" />
    </Animated.View>
  );
});

// ======================================================
// VideoItem — memoized single feed row
// ======================================================
// FIX (biggest perf change): pehle ye poora JSX seedha renderItem
// ke andar tha, aur renderItem ek useCallback tha jiski dependency
// list me activeVideo/currentIndex/pausedVideoId/localLikes/
// followingUsers/starAnimationVideoId the -- yani scroll ke har
// step par, ya kahin bhi like/follow hone par, renderItem ki
// identity badal jaati thi. Isse FlatList currently-mounted SAARE
// cells ko re-render kar deta tha, sirf jo actually change hua wo
// nahi.
//
// Ab actual row JSX ek alag React.memo() component me hai. renderItem
// ab sirf is item ke liye zaroori props compute karke <VideoItem/>
// return karta hai. React.memo apne aap shallow-compare karke sirf
// UN cells ko re-render karega jinke props sach me badle hain --
// baaki sab as-is rahenge. Isse scroll aur like/follow tap dono
// kaafi zyada smooth feel honge.
const VideoItem = memo(function VideoItem({
  itemHeight,
  fullHeight,
  item,
  index,
  shouldRenderVideo,
  nearVideo,
  isVideoActive,
  isCurrent,
  showHeart,
  heartTick,
  showStar,
  starCount,
  isLiked,
  isFollowing,
  rotateAnim,
  textAnim,
  starScale,
  starOpacity,
  starRotate,
  starJump,
  starTilt,
  onItemPress,
  onLike,
  onFollow,
  onOpenComments,
  onOpenShare,
  onOpenStar,
  onOpenProfile,
  onOpenMusic,
}) {
  // Is video ka creator abhi live hai? (shared single listener)
  const hostLive = useLiveHost(item.userId);

  // SMOOTH: interpolate har render par naya native node banata tha -> ek baar banao
  const discRotate = useMemo(
    () => rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }),
    [rotateAnim]
  );

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={{ width, height: itemHeight, backgroundColor: '#000' }}
      onPress={() => onItemPress(item.id)}
    >

      {shouldRenderVideo ? (
        <FeedVideo
          uri={item.videoUrl || item.video}
          active={isVideoActive}
          near={nearVideo}
          videoId={item.id}
          isCurrent={isCurrent}
          thumbnail={item.thumbnail}
        />
      ) : item.thumbnail ? (
        <ExpoImage source={item.thumbnail} style={{ width, height: itemHeight, backgroundColor: "#000" }} contentFit="cover" cachePolicy="memory-disk" priority="high" transition={0} />
      ) : (
        <View
          style={{
            width,
            height: itemHeight,
            backgroundColor: "#000"
          }}
        />
      )}

      {/* OVERLAY LAYER: poori screen ki height (fullHeight) ka, upar se aligned.
          Isse caption / icons / heart bilkul pehle wali jagah par rehte hain,
          chahe video ab nav bar ke upar tak hi ho. */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 0, left: 0, width, height: fullHeight }}
      >
      {showHeart && <HeartPopup key={heartTick} />}

      {showStar && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
            zIndex: 99999,
            elevation: 99999,
          }}
          pointerEvents="none"
        >
          {/* Background transparent -- sirf star + uske upar count */}
          <Animated.View
            style={{
              width: 150,
              height: 150,
              justifyContent: "center",
              alignItems: "center",
              opacity: starOpacity,
              transform: [{ scale: starScale }],
            }}
          >
            <Image
              source={require("../../assets/star-logo.png")}
              style={{ width: 150, height: 150, resizeMode: "contain" }}
            />

            {/* Chamak (shine): star ke upar safed flash, starRotate yahan shine value hai */}
            <Animated.Image
              source={require("../../assets/star-logo.png")}
              style={{
                position: "absolute",
                width: 150,
                height: 150,
                resizeMode: "contain",
                tintColor: "#ffffff",
                opacity: starRotate.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.65],
                }),
              }}
            />

            {/* Star ke upar count: 1 / 3 / 10 */}
            <Text
              style={{
                position: "absolute",
                fontSize: 44,
                fontWeight: "900",
                color: "#ffffff",
                textShadowColor: "rgba(0,0,0,0.55)",
                textShadowOffset: { width: 0, height: 2 },
                textShadowRadius: 6,
              }}
            >
              {starCount}
            </Text>
          </Animated.View>
        </View>
      )}

      <View style={styles.overlay} />
      <View style={styles.bottomLeft}>

        <View style={styles.userRow}>
          <Text style={styles.userName}>
            {item.username || "@user"}
          </Text>

          <UserTick uid={item.userId} verified={item.verified} verifiedColor={item.verifiedColor} faceVerified={isFaceVerified(item)} size={17} />
        </View>

        <Text style={styles.caption} numberOfLines={1} ellipsizeMode="tail">{item.caption}</Text>

        <TouchableOpacity
          style={styles.musicRow}
          activeOpacity={0.8}
          onPress={() => onOpenMusic(item)}
        >
          <Animated.View
            style={[
              styles.musicDiscOuter,
              {
                transform: [{ rotate: discRotate }],
              },
            ]}
          >
            <View style={styles.vinylDisc}>
              <ExpoImage source={item.profile || AVATAR_FALLBACK} style={styles.musicCenterImage} contentFit="cover" cachePolicy="memory-disk" />
              <View style={styles.musicDot} />
            </View>
          </Animated.View>

          <View style={styles.musicTextContainer}>
            <Animated.Text
              style={[
                styles.musicText,
                {
                  transform: [
                    { translateX: textAnim }
                  ]
                }
              ]}
              numberOfLines={1}
            >
              🎵 Music • {item.username} • Original Audio
            </Animated.Text>
          </View>
        </TouchableOpacity>

      </View>

      <View style={styles.rightIcons}>

        <View style={[styles.iconBox, { marginBottom: 20 }]}>
          <TouchableOpacity onPress={() => onOpenProfile(item.userId)}>
            <ExpoImage source={item.profile || AVATAR_FALLBACK} style={[styles.profileImage, hostLive && styles.profileImageLive]} contentFit="cover" cachePolicy="memory-disk" />
            {/* FRAME: video banane wale ka frame (level / agency / admin / user ki choice) */}
            <AvatarFrame uid={item.userId} size={50} animated={false} />
            {hostLive && (
              <View style={styles.liveTagFeed} pointerEvents="none">
                <Text style={styles.liveTagFeedText}>LIVE</Text>
              </View>
            )}
          </TouchableOpacity>

          {auth.currentUser?.uid !== item.userId && !isFollowing && (
            <TouchableOpacity
              style={styles.plusIconSmall}
              onPress={() => onFollow(item.userId)}
            >
              <Ionicons
                name="add"
                size={15}
                color="#000"
              />
            </TouchableOpacity>
          )}
        </View>

        <LikeButton
          liked={isLiked}
          count={item.likes}
          videoId={item.id}
          onLike={onLike}
        />

        <TouchableOpacity
          style={styles.iconBox}
          onPress={() => onOpenComments(item)}
        >
          <Ionicons name="chatbubble-ellipses" size={40} color="#ffffff" style={styles.iconShadow} />
          <Text style={styles.iconText}>{formatCount(item.commentsCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBox}
          onPress={() => onOpenShare(item)}
        >
          <Ionicons name="arrow-redo" size={42} color="#ffffff" style={styles.iconShadow} />
          <Text style={styles.iconText}>{formatCount(item.shares)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBox}
          onPress={() => onOpenStar(item.id)}
        >
          <Image
            source={require('../../assets/star-logo.png')}
            style={styles.starImage}
          />
          <Text style={styles.starUpText}>StarUp</Text>
        </TouchableOpacity>
      </View>
      </View>
    </TouchableOpacity>
  );
});


// ==========================
// COMMENTS: module-level helpers + memoized row
// (parent ke bahar -> typing / snapshot par poori list re-render nahi hoti)
// ==========================
const COMMENT_PAGE_SIZE = 25;

const commentKeyExtractor = (item) => item.id;

const commentTimeAgo = (timestamp) => {
  if (!timestamp?.seconds) return 'now';
  const diff = Math.floor((Date.now() - timestamp.seconds * 1000) / 1000);
  if (diff < 60) return `${Math.max(diff, 0)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  return `${Math.floor(diff / 2592000)}mo`;
};

const cs = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: 15, marginBottom: 15, alignItems: 'flex-start' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  body: { marginLeft: 10, flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { color: '#fff', fontWeight: 'bold' },
  badge: { marginLeft: 5 },
  text: { color: '#fff' },
  time: { color: '#999', fontSize: 11, marginTop: 3 },
  actions: { flexDirection: 'row', marginTop: 8 },
  actionText: { color: '#999', fontSize: 13, fontWeight: '600' },
  toggle: { marginTop: 8, marginLeft: 15 },
  repliesBox: { marginTop: 10, marginLeft: 15, borderLeftWidth: 1, borderLeftColor: '#333', paddingLeft: 12 },
  replyRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-start' },
  replyAvatar: { width: 30, height: 30, borderRadius: 15 },
  replyBody: { marginLeft: 8, flex: 1 },
  replyName: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  replyText: { color: '#fff', marginTop: 2 },
  replyTime: { color: '#888', fontSize: 11, marginTop: 3 },
  menu: { paddingLeft: 10, paddingTop: 5 },
  empty: { color: '#888', textAlign: 'center', marginTop: 30 },
});

const CommentsEmpty = (
  <Text style={cs.empty}>No comments yet. Be the first!</Text>
);

const CommentRow = memo(function CommentRow({
  item,
  replyList,
  expanded,
  currentUid,
  onProfile,
  onReply,
  onToggleReplies,
  onDeleteComment,
  onDeleteReply,
}) {
  const replyCount = replyList ? replyList.length : 0;

  return (
    <View style={cs.row}>
      <TouchableOpacity onPress={() => onProfile(item.userId)}>
        <ExpoImage
          source={{ uri: item.profilePic || AVATAR_FALLBACK }}
          style={cs.avatar}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
        <AvatarFrame uid={item.userId} size={40} animated={false} />
      </TouchableOpacity>

      <View style={cs.body}>
        <View style={cs.nameRow}>
          <Text style={cs.name}>{item.username}</Text>
          <UserTick uid={item.userId} verified={item.verified} verifiedColor={item.verifiedColor} faceVerified={isFaceVerified(item)} size={17} />
        </View>

        <Text style={cs.text}>{item.text}</Text>
        <Text style={cs.time}>{commentTimeAgo(item.createdAt)}</Text>

        <View style={cs.actions}>
          <TouchableOpacity onPress={() => onReply(item)}>
            <Text style={cs.actionText}>Reply</Text>
          </TouchableOpacity>
        </View>

        {replyCount > 0 ? (
          <TouchableOpacity onPress={() => onToggleReplies(item.id)} style={cs.toggle}>
            <Text style={cs.actionText}>
              {expanded
                ? 'Hide replies'
                : `View ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
            </Text>
          </TouchableOpacity>
        ) : null}

        {replyCount > 0 && expanded ? (
          <View style={cs.repliesBox}>
            {replyList.map((reply) => (
              <View key={reply.id} style={cs.replyRow}>
                <View style={{ width: 30, height: 30 }}>
                  <ExpoImage
                    source={{ uri: reply.profilePic || AVATAR_FALLBACK }}
                    style={cs.replyAvatar}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={0}
                  />
                  <AvatarFrame uid={reply.userId} size={30} animated={false} />
                </View>

                <View style={cs.replyBody}>
                  <View style={cs.nameRow}>
                    <Text style={cs.replyName}>{reply.username}</Text>
                    <UserTick uid={reply.userId} verified={reply.verified} verifiedColor={reply.verifiedColor} faceVerified={isFaceVerified(reply)} size={15} />
                  </View>
                  <Text style={cs.replyText}>{reply.text}</Text>
                  <Text style={cs.replyTime}>{commentTimeAgo(reply.createdAt)}</Text>
                </View>

                {currentUid === reply.userId ? (
                  <TouchableOpacity
                    onPress={() => onDeleteReply(item.id, reply.id)}
                    style={cs.menu}
                  >
                    <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {currentUid === item.userId ? (
        <TouchableOpacity onPress={() => onDeleteComment(item.id)} style={cs.menu}>
          <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
});


// ======================================================
// BottomBar — nav bar alag memo component
// Sirf pathname / onLayout badalne par re-render; swipe, like, comment par nahi.
// ======================================================
const BottomBar = memo(function BottomBar({ pathname, onLayout }) {
  const router = useRouter();
  const color = (p) => (pathname === p ? '#3498db' : '#ffffff');

  return (
    <View style={styles.bottomSection} onLayout={onLayout}>
      <VideoSeekBar />
      <View style={styles.bottomNavContainer}>
        <View style={styles.bottomNav}>

          {/* HOME */}
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/')}>
            <Ionicons name="home-outline" size={26} color={color('/')} />
          </TouchableOpacity>

          {/* SEARCH */}
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/explore')}>
            <Ionicons name="search" size={26} color={color('/explore')} />
          </TouchableOpacity>

          {/* CENTER PLUS BUTTON */}
          <View style={styles.navItem}>
            <TouchableOpacity style={styles.plusBtn} onPress={() => router.push('/camera')}>
              <Text style={styles.plusText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* MESSAGES */}
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/messages')}>
            <Ionicons name="chatbubble-ellipses" size={26} color={color('/messages')} />
          </TouchableOpacity>

          {/* PROFILE */}
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => {
              if (!auth.currentUser) {
                router.push('/login');
                return;
              }
              router.replace('/profile');
            }}
          >
            <Ionicons name="person-outline" size={26} color={color('/profile')} />
          </TouchableOpacity>

        </View>
      </View>
      <View style={styles.bottomFill} />
    </View>
  );
});

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
const [showSharePopup, setShowSharePopup] = useState(false);
const [selectedShareVideo, setSelectedShareVideo] = useState(null);
  const [videos, setVideos] = useState([]);
  // TOP BAR tab: 'foryou' (default) | 'follow' | 'discover' (discover alag screen kholta hai)
  const [feedTab, setFeedTab] = useState('foryou');
  const feedTabRef = useRef('foryou');
  const showGridRef = useRef(false);
  const [showGrid, setShowGrid] = useState(false); // Follow / Discover grid screen
  const [gridLoading, setGridLoading] = useState(false);
  const [followList, setFollowList] = useState([]);
  const [discoverList, setDiscoverList] = useState([]);
  const [liveList, setLiveList] = useState([]);
  const forYouSnapRef = useRef(null);
  const gridTimeRef = useRef({ follow: 0, discover: 0 });
  const [loading, setLoading] = useState(true);
  // VIDEO CHIPKAO: app ke bottom nav (bottomSection) ki asli height naapte hain.
  // Video list = poori screen - nav ki height, yaani video nav ke theek upar
  // tak aata hai, aur do videos ke beech koi black patti nahi bachti.
  // Nav bar ko chhua nahi gaya -- sirf uski height padhi jaati hai.
  const [fullH, setFullH] = useState(height);
  const [navH, setNavH] = useState(Platform.OS === 'ios' ? 115 : 105);
  const listH = Math.max(1, Math.round(fullH - navH));
  const listHRef = useRef(listH);
  listHRef.current = listH;
  const onRootLayout = useCallback((e) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0) setFullH((p) => (p === h ? p : h));
  }, []);
  const onNavLayout = useCallback((e) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0) setNavH((p) => (p === h ? p : h));
  }, []);
  const getItemLayoutFn = useCallback(
    (_data, index) => ({ length: listH, offset: listH * index, index }),
    [listH]
  );
  const [refreshing, setRefreshing] = useState(false);
  const [activeVideo, setActiveVideo] = useState(0);
  const [currentIndex,setCurrentIndex]=useState(0);
  // SMOOTH SCROLL: naye video players (native decoder) swipe ke BEECH me nahi,
  // swipe rukne ke baad mount hote hain -> scroll animation me jhatka nahi.
  const [mountIndex, setMountIndex] = useState(0);
  const mountTimeoutRef = useRef(null);
  const mountInteractionRef = useRef<any>(null);
  const [pausedVideoId, setPausedVideoId] = useState(null);

const [loadingMoreVideos, setLoadingMoreVideos] = useState(false);
const [hasMoreVideos, setHasMoreVideos] = useState(true);

const lastVideoDocRef = useRef(null);
const loadingMoreRef = useRef(false);


const scrollRef=useRef(null);
const commentInputRef = useRef(null);
  const [isFocused, setIsFocused] = useState(true);
  const [localLikes, setLocalLikes] = useState({}); 



// ======================================================
// SMART LIKE + FOLLOW LOADER
// Sirf current video ke aas-paas ke videos check honge
// ======================================================

const likeFollowWindowRef = useRef("");
const checkedLikesRef = useRef(new Set());
const checkedFollowRef = useRef(new Set());

useEffect(() => {

  const user = auth.currentUser;

  if (!user || videos.length === 0) {
    return;
  }

  // -----------------------------------------
  // Current video ke aas-paas ke 5 videos
  // currentIndex - 2 se currentIndex + 2
  // -----------------------------------------

  const startIndex = Math.max(0, currentIndex - 2);

  const endIndex = Math.min(
    videos.length - 1,
    currentIndex + 2
  );

  const nearbyVideos = videos.slice(
    startIndex,
    endIndex + 1
  );

  if (nearbyVideos.length === 0) {
    return;
  }

  // Same window ko baar-baar load mat karo
  const windowKey = nearbyVideos
    .map(video => video.id)
    .join("|");

  if (likeFollowWindowRef.current === windowKey) {
    return;
  }

  const loadNearbyLikesAndFollowing = async () => {

    try {

      // ==================================================
      // 1. LIKES
      // ==================================================

      // SPEED: sirf wahi ids jo pehle check nahi hue (window me 4/5 purane hote hain)
      const videoIds = nearbyVideos
        .map(video => video.id)
        .filter(id => id && !checkedLikesRef.current.has(id));
      videoIds.forEach(id => checkedLikesRef.current.add(id));

      if (videoIds.length > 0) {

        const likesQuery = query(
          collection(
            db,
            "userLikes",
            user.uid,
            "likedVideos"
          ),
          where(
            documentId(),
            "in",
            videoIds
          )
        );

        const likesSnapshot = await getDocs(
          likesQuery
        );

        const nearbyLikes = {};

        likesSnapshot.forEach((likeDoc) => {

          nearbyLikes[likeDoc.id] = true;

        });

        // Purane likes ko rakho
        // aur nearby videos ka data update karo
        setLocalLikes(prev => {

          let changed = false;
          const updated = {
            ...prev
          };

          videoIds.forEach(videoId => {

            // Slow network ke dauran optimistic like ko overwrite mat karo.
            if (!pendingLikeRef.current[videoId]) {
              const next = nearbyLikes[videoId] === true;
              if (!!prev[videoId] !== next) changed = true;
              updated[videoId] = next;
            }

          });

          // SPEED: kuch nahi badla -> purana object lauta do,
          // poori screen ka faltu re-render nahi hoga (swipe ke turant baad).
          return changed ? updated : prev;

        });

      }


      // ==================================================
      // 2. FOLLOWING
      // ==================================================

      const userIds = [
        ...new Set(
          nearbyVideos
            .map(video => video.userId)
            .filter(
              userId =>
                userId &&
                userId !== user.uid &&
                !checkedFollowRef.current.has(userId)
            )
        )
      ];
      userIds.forEach(u => checkedFollowRef.current.add(u));


      if (userIds.length > 0) {

        // FIX: follow data profile.tsx wali top-level "follows" collection
        // me hai (doc id = myUid_targetUid). Pehle yahan users/{uid}/following
        // padha ja raha tha, jo profile ke count se match hi nahi karta tha.
        const followDocIds = userIds.map(id => `${user.uid}_${id}`);

        const followingQuery = query(
          collection(db, "follows"),
          where(
            documentId(),
            "in",
            followDocIds
          )
        );

        const followingSnapshot =
          await getDocs(
            followingQuery
          );

        const nearbyFollowing = {};

        followingSnapshot.forEach(
          (followDoc) => {

            const targetId =
              followDoc.data()?.followingId ||
              followDoc.id.slice(user.uid.length + 1);

            if (targetId) nearbyFollowing[targetId] = true;

          }
        );


        setFollowingUsers(prev => {

          let changed = false;
          const updated = {
            ...prev
          };

          userIds.forEach(userId => {

            // Follow tap abhi server tak ja raha ho to optimistic state mat todo
            if (pendingFollowRef.current[userId]) return;

            const next = nearbyFollowing[userId] === true;
            if (!!prev[userId] !== next) changed = true;
            updated[userId] = next;

          });

          return changed ? updated : prev;

        });

      }

    } catch (error) {

      // retry ho sake isliye checked se hata do
      nearbyVideos.forEach(v => {
        checkedLikesRef.current.delete(v.id);
        checkedFollowRef.current.delete(v.userId);
      });
      __DEV__ && console.log(
        "Nearby Like/Following Error:",
        error
      );

    }

  };


  // SPEED: fast swipe karte waqt har video par Firestore query nahi chalegi.
  // Swipe ruke (350ms) tab hi like/follow check hoga. Pehli baar turant.
  const delay = likeFollowWindowRef.current === "" ? 0 : 350;
  const timer = setTimeout(() => {
    likeFollowWindowRef.current = windowKey;
    loadNearbyLikesAndFollowing();
  }, delay);

  return () => clearTimeout(timer);

}, [
  currentIndex,
  videos
]);



  const [heartVideoId, setHeartVideoId] = useState(null);
  const [heartTick, setHeartTick] = useState(0); // har double-tap par animation dobara chale
const lastTap = useRef(null);
const tapTimeout = useRef(null);
const likeQueueRef = useRef({});
const pendingLikeRef = useRef({});
const pendingFollowRef = useRef({});
const viewTimeout = useRef(null);
const heartTimeout = useRef(null);

useEffect(() => {
  return () => {
    if (tapTimeout.current) clearTimeout(tapTimeout.current);
    if (mountTimeoutRef.current) clearTimeout(mountTimeoutRef.current);
    mountInteractionRef.current?.cancel?.();
    if (viewTimeout.current) clearTimeout(viewTimeout.current);
    if (heartTimeout.current) clearTimeout(heartTimeout.current);
  };
}, []);


  const [showComments, setShowComments] = useState(false);
const commentAnim = useRef(new Animated.Value(height)).current;

const keyboardHeight = useRef(new Animated.Value(0)).current;
// Sheet ke saath backdrop bhi fade ho (pehle ekdam se dark ho jata tha)
const commentBackdrop = commentAnim.interpolate({
  inputRange: [0, height],
  outputRange: [0.5, 0],
  extrapolate: 'clamp',
});
const commentListRef = useRef(null);

const [selectedVideoId, setSelectedVideoId] = useState(null);
const commentTextRef = useRef('');
const onCommentChange = useCallback((t) => { commentTextRef.current = t; }, []);
const clearCommentInput = () => {
  commentTextRef.current = '';
  commentInputRef.current?.clear?.();
};
const [comments, setComments] = useState([]);
const [commentsLoading, setCommentsLoading] = useState(false);
const replyUnsubscribers = useRef(new Map());
const [replyingTo, setReplyingTo] = useState(null);

const [replies, setReplies] = useState({});

const [replyText, setReplyText] = useState("");

const [expandedReplies, setExpandedReplies] = useState({});

const [replyCounts, setReplyCounts] = useState({});

const [commentLimit, setCommentLimit] = useState(COMMENT_PAGE_SIZE);

const deleteCommentRef = useRef(null);
const deleteReplyRef = useRef(null);
const onDeleteComment = useCallback((id) => deleteCommentRef.current?.(id), []);
const onDeleteReply = useCallback((cid, rid) => deleteReplyRef.current?.(cid, rid), []);

const onToggleReplies = useCallback((id) => {
  setExpandedReplies((prev) => ({ ...prev, [id]: !prev[id] }));
}, []);

const onCommentReply = useCallback((c) => {
  setReplyingTo({ id: c.id, username: c.username });
  setReplyText("");
  setTimeout(() => commentInputRef.current?.focus(), 100);
}, []);

const onCommentProfile = useCallback((userId) => {
  setShowComments(false);
  setSelectedVideoId(null);
  router.push({ pathname: "/userProfile", params: { userId } });
}, [router]);

// Scroll karte-karte aur comments load (pagination)
const loadMoreComments = useCallback(() => {
  setCommentLimit((l) => (comments.length >= l ? l + COMMENT_PAGE_SIZE : l));
}, [comments.length]);

// Smooth band hone ka ek hi raasta (backdrop + Android back dono yahi use karte hain)
const closingCommentsRef = useRef(false);
const closeComments = useCallback(() => {
  if (closingCommentsRef.current) return;
  closingCommentsRef.current = true;
  Keyboard.dismiss();
  Animated.timing(commentAnim, {
    toValue: height,
    duration: 200,
    useNativeDriver: true,
  }).start(() => {
    closingCommentsRef.current = false;
    setShowComments(false);
    setSelectedVideoId(null);
    setComments([]);
    setReplies({});
    setReplyingTo(null);
    setCommentsLoading(false);
  });
}, [commentAnim]);

// Handle pakad ke neeche kheencho -> sheet band (finger ke saath chalti hai)
const commentPan = useMemo(
  () =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) commentAnim.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 120 || g.vy > 0.8) {
          closeComments();
        } else {
          Animated.spring(commentAnim, {
            toValue: 0,
            bounciness: 0,
            speed: 18,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(commentAnim, {
          toValue: 0,
          bounciness: 0,
          speed: 18,
          useNativeDriver: true,
        }).start();
      },
    }),
  [commentAnim, closeComments]
);

const [currentUserData, setCurrentUserData] = useState({
  // name shuru me KHALI: "User" default se galat naam se comment jata tha
  name: '',
  photo: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
  verified: false,
  verifiedColor: '',
  faceVerified: false,
});

// Latest loaded profile (uid ke saath) -- comment/like bhejte waqt yahi use hota hai
const currentUserRef = useRef<any>(null);

const applyMyProfile = (p) => {
  currentUserRef.current = p;
  setCurrentUserData({
    name: p.name,
    photo: p.photo,
    verified: p.verified || false,
    verifiedColor: p.verifiedColor || '',
    faceVerified: isFaceVerified(p),
  });
};

// Hamesha ek sahi profile deta hai (load na hui ho to pehle load karta hai)
const getMyProfileNow = async (user) => {
  const cur = currentUserRef.current;
  if (cur && cur.uid === user.uid && cur.name) return cur;
  const fresh = await loadMyProfile(true);
  if (fresh) {
    applyMyProfile(fresh);
    return fresh;
  }
  return null; // galat naam se comment nahi jayega
};
  
const [selectedVideoData, setSelectedVideoData] = useState(null);

const [showStarPopup, setShowStarPopup] = useState(false);
const [selectedStar, setSelectedStar] = useState(null);

const [myStars, setMyStars] = useState(0);
const starSending = useRef(false);

const [starAnimationVideoId, setStarAnimationVideoId] = useState(null);
const [starAnimationCount, setStarAnimationCount] = useState(0);

const starScale = useRef(new Animated.Value(0)).current;

const starRotate = useRef(new Animated.Value(0)).current;

const starOpacity = useRef(new Animated.Value(0)).current;

const starJump = useRef(new Animated.Value(0)).current;

const starTilt = useRef(new Animated.Value(0)).current;

const [blockedUsers, setBlockedUsers] = useState([]);

const [followingUsers, setFollowingUsers] = useState({});

const rotateAnim = useRef(new Animated.Value(0)).current;

const textAnim = useRef(new Animated.Value(0)).current;


// (blocked users ab FIRST LOAD ke saath parallel load hote hain)





useEffect(() => {

  Animated.loop(

    Animated.timing(
      rotateAnim,
      {
        toValue: 1,
        duration: 2200,
        useNativeDriver: true,
        isInteraction: false,
      }
    )

  ).start();

}, []);

useEffect(() => {

  Animated.loop(

    Animated.sequence([

      Animated.timing(textAnim,{
        toValue:-180,
        duration:5000,
        useNativeDriver:true,
        isInteraction:false,
      }),

      Animated.timing(textAnim,{
        toValue:0,
        duration:0,
        useNativeDriver:true,
        isInteraction:false,
      }),

    ])

  ).start();

},[]);


  // AUDIO SETUP



// ======================================================
// FEED MIXER
// Ek hi user ke videos ko lagatar aane se rokta hai.
// Example: A -> B -> C -> A
// Minimum 3 different-user positions ka GAP rakha jayega.
// Agar feed me sirf 1 user ke videos hain, to naturally
// same user repeat ho sakta hai.
// ======================================================
const FEED_USER_GAP = 3;

const arrangeFeedVideos = (inputVideos, previousVideos = []) => {
  if (!inputVideos || inputVideos.length <= 1) {
    return inputVideos || [];
  }

  // Har user ke videos ko alag queue me rakho.
  const groups = new Map();

  inputVideos.forEach((video) => {
    const userKey = video.userId || `video_${video.id}`;

    if (!groups.has(userKey)) {
      groups.set(userKey, []);
    }

    groups.get(userKey).push(video);
  });

  // Har user's videos ko thoda randomize karo, taki
  // same user ka hamesha same sequence na aaye.
  groups.forEach((queue) => {
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
  });

  const result = [];

  // Existing feed ke last 3 users ko bhi cooldown me rakho,
  // taki load-more ke boundary par same user repeat na ho.
  const recentUsers = previousVideos
    .slice(-FEED_USER_GAP)
    .map((video) => video.userId || `video_${video.id}`);

  while (groups.size > 0) {
    // Pehle un users ko choose karo jo recent 3 videos me nahi aaye.
    let availableUsers = [...groups.keys()].filter(
      (userKey) => !recentUsers.includes(userKey)
    );

    // Agar enough different users available nahi hain,
    // to remaining users me se choose karo. Isse feed rukega nahi.
    if (availableUsers.length === 0) {
      availableUsers = [...groups.keys()];
    }

    // Available users ko random order me rakho.
    for (let i = availableUsers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableUsers[i], availableUsers[j]] = [
        availableUsers[j],
        availableUsers[i],
      ];
    }

    // Jis user ke paas sabse zyada videos bache hain,
    // usko preference do, lekin recent-user restriction ke andar.
    const selectedUser = availableUsers.reduce((best, userKey) => {
      if (!best) return userKey;

      const bestCount = groups.get(best)?.length || 0;
      const currentCount = groups.get(userKey)?.length || 0;

      return currentCount > bestCount ? userKey : best;
    }, null);

    const queue = groups.get(selectedUser);
    const nextVideo = queue.shift();

    if (nextVideo) {
      result.push(nextVideo);

      recentUsers.push(selectedUser);
      if (recentUsers.length > FEED_USER_GAP) {
        recentUsers.shift();
      }
    }

    if (queue.length === 0) {
      groups.delete(selectedUser);
    }
  }

  return result;
};

// ======================================================
// SMART FEED v2  (score-based ranking, "har baar naya top video")
// ------------------------------------------------------
// Har video ko ek SCORE milta hai (module ke upar scoreVideo dekho):
//   + naya video  -> bonus (48h me sabse zyada, phir dheere dheere kam)
//   + unseen      -> bada bonus
//   + popular     -> chhota bonus (engagementScore)
//   - seen        -> penalty. Jitna RECENT dekha utna zyada neeche,
//                    time ke saath dheere dheere wapas upar aata hai
//   + random jitter -> same score wale videos ka order har baar alag
//
// Result:
//   * Jo video abhi dekha wo agli baar top par nahi aata
//   * Pichli baar ka top video agli baar top par KABHI nahi (lastTopId)
//   * Naye + unseen videos pehle, phir purane unseen, phir seen
//     (sabse purana dekha hua pehle) -> feed kabhi boring/khaali nahi
//   * Ek hi user ke videos lagatar nahi (3 ka gap)
//   * App background se 3 min baad wapas aaye to feed khud refresh
//   * Firestore reads sirf zaroorat ke hisaab se (lazy pages of 30)
// ======================================================
const PAGE_SIZE = 30;              // ek Firestore query me docs
const FIRST_SHOW = 10;             // pehli baar kitne video dikhane
const NEXT_BATCH_WANT = 10;        // load-more me kitne
const SEEN_DWELL_MS = 1000;        // itni der dekha = "seen"
const RESUME_REFRESH_MS = 30 * 60 * 1000; // itni der (30 min) background me raha to hi naya feed, warna wahi video resume

const blockedRef = useRef([]);
const seenRef = useRef({});
const lastTopIdRef = useRef(null);
const poolRef = useRef([]);             // candidates jo abhi tak dikhaye nahi
const fetchedIdsRef = useRef(new Set());
const exhaustedRef = useRef(false);
const fillChainRef = useRef(Promise.resolve());
const sessionRef = useRef(0);           // refresh par purane fetch cancel
const fetchRoundRef = useRef(0);        // kaunsa fetch round (fresh / random mix)
const videosRef = useRef([]);
const currentIndexRef = useRef(0);
const seenTimeout = useRef(null);
const seenSaveTimeout = useRef(null);
const refreshRef = useRef(null);
const lastViewableIndexRef = useRef(-1);
const lastViewableIdRef = useRef(null);
const initialIndexRef = useRef(0);

videosRef.current = videos;
currentIndexRef.current = currentIndex;

const markSeen = (videoId) => {
  if (!videoId) return;
  const now = Date.now();
  const prev = seenRef.current[videoId];
  // 30 min ke andar baar-baar scroll karne par count na badhe
  const n = prev && now - prev.t < 30 * 60 * 1000 ? prev.n : (prev?.n || 0) + 1;
  seenRef.current[videoId] = { t: now, n };
  if (seenSaveTimeout.current) clearTimeout(seenSaveTimeout.current);
  seenSaveTimeout.current = setTimeout(() => {
    saveSeenMap(seenRef.current);
  }, 400);
};

useEffect(() => {
  return () => {
    if (seenTimeout.current) clearTimeout(seenTimeout.current);
    if (seenSaveTimeout.current) clearTimeout(seenSaveTimeout.current);
    saveSeenMap(seenRef.current);
    persistResume();
  };
}, []);

// Feed + current index yaad rakho (screen badal kar wapas aane par wahi video)
useEffect(() => {
  if (videos.length === 0) return;
  if (feedTabRef.current !== 'foryou') return; // grid se khuli list resume me save nahi hogi
  feedCache = { videos, index: currentIndex, savedAt: Date.now() };
}, [videos, currentIndex]);

const toVideo = (docItem) => {
  const data = docItem.data();
  return {
    id: docItem.id,
    ...data,
    verified: data.verified || false,
    verifiedColor: data.verifiedColor || "",
    faceVerified: isFaceVerified(data),
  };
};

const isAllowedVideo = (data) =>
  data.status !== "blocked" &&
  data.hidden !== true &&
  !blockedRef.current.includes(data.userId);

const fetchVideoPage = (cursor) =>
  getDocs(
    cursor
      ? query(
          collection(db, "all_videos"),
          orderBy("createdAt", "desc"),
          orderBy("__name__", "desc"),
          startAfter(cursor),
          limit(PAGE_SIZE)
        )
      : query(
          collection(db, "all_videos"),
          orderBy("createdAt", "desc"),
          orderBy("__name__", "desc"),
          limit(PAGE_SIZE)
        )
  );

const resetFeedState = () => {
  sessionRef.current += 1;
  poolRef.current = [];
  fetchedIdsRef.current = new Set();
  exhaustedRef.current = false;
  lastVideoDocRef.current = null;
  loadingMoreRef.current = false;
  fillChainRef.current = Promise.resolve();
  fetchRoundRef.current = 0;
  return sessionRef.current;
};

// Ek page ke docs pool me daalo (duplicate / blocked / hidden skip)
const ingestSnap = (snap) => {
  if (!snap || snap.empty) {
    exhaustedRef.current = true;
    return 0;
  }
  lastVideoDocRef.current = snap.docs[snap.docs.length - 1];
  let added = 0;
  snap.forEach((docItem) => {
    if (fetchedIdsRef.current.has(docItem.id)) return;
    fetchedIdsRef.current.add(docItem.id);
    if (!isAllowedVideo(docItem.data())) return;
    poolRef.current.push(toVideo(docItem));
    added++;
  });
  if (snap.docs.length < PAGE_SIZE) exhaustedRef.current = true;
  return added;
};

// Random page ke docs (cursor / exhausted ko touch nahi karta)
const ingestRandom = (snap) => {
  if (!snap || snap.empty) return 0;
  let added = 0;
  snap.forEach((docItem) => {
    if (fetchedIdsRef.current.has(docItem.id)) return;
    fetchedIdsRef.current.add(docItem.id);
    if (!isAllowedVideo(docItem.data())) return;
    poolRef.current.push(toVideo(docItem));
    added++;
  });
  return added;
};

const countUnseen = () =>
  poolRef.current.reduce((n, v) => (seenRef.current[v.id] ? n : n + 1), 0);

// Pool me kam se kam `minUnseen` unseen video hone tak pages padho.
// Chain se serialize hota hai -> do jagah se ek saath same page nahi aata.
const ensurePool = (minUnseen, session) => {
  const run = async () => {
    let guard = 0;
    let dry = 0; // lagatar kitne round me naya kuch nahi mila
    while (
      session === sessionRef.current &&
      countUnseen() < minUnseen &&
      guard < MAX_FETCH_ROUNDS &&
      dry < 2
    ) {
      guard++;
      const round = fetchRoundRef.current++;
      let added = 0;

      // Naye videos (cursor) round 0 me, phir har 3rd round me.
      // Baaki rounds me random purane videos (discovery).
      if (round === 0 || (!exhaustedRef.current && round % 3 === 0)) {
        if (exhaustedRef.current) break;
        const snap = await fetchVideoPage(lastVideoDocRef.current);
        if (session !== sessionRef.current) return;
        added = ingestSnap(snap);
      } else {
        const oldest = await getOldestTs();
        if (session !== sessionRef.current) return;
        if (!oldest) {
          // random possible nahi -> seedha cursor se padho
          if (exhaustedRef.current) break;
          const snap = await fetchVideoPage(lastVideoDocRef.current);
          if (session !== sessionRef.current) return;
          added = ingestSnap(snap);
        } else {
          const [a, b] = await Promise.all([
            fetchRandomPage(oldest).catch(() => null),
            fetchRandomPage(oldest).catch(() => null),
          ]);
          if (session !== sessionRef.current) return;
          added = ingestRandom(a) + ingestRandom(b);
        }
      }

      dry = added === 0 ? dry + 1 : 0;
    }
  };
  fillChainRef.current = fillChainRef.current.then(run, run);
  return fillChainRef.current;
};

// Pool ko rank karo, top `n` nikalo (user-gap ke saath)
const pullFromPool = (n, previous) => {
  const lastTop = previous.length === 0 ? lastTopIdRef.current : null;
  let ranked = rankFeed(poolRef.current, seenRef.current, previous, lastTop, false, n);

  // Feed bilkul khali na rahe: agar koi naya/purana video hi nahi bacha
  // (sab 3 din ke andar dekhe hue), to sabse purana dekha hua dikhao.
  if (
    ranked.length === 0 &&
    previous.length === 0 &&
    exhaustedRef.current &&
    poolRef.current.length > 0
  ) {
    ranked = rankFeed(poolRef.current, seenRef.current, previous, null, true, n);
  }

  const picked = ranked.slice(0, n);
  const ids = new Set(picked.map((v) => v.id));
  poolRef.current = poolRef.current.filter((v) => !ids.has(v.id));
  return picked;
};

const syncHasMore = () => {
  const now = Date.now();
  const hasEligible = poolRef.current.some(
    (v) => !isRecentlySeen(seenRef.current, v.id, now)
  );
  setHasMoreVideos(hasEligible || !exhaustedRef.current);
};

// FIRST LOAD
useEffect(() => {
  let cancelled = false;

  const loadFirstVideos = async () => {
    try {
      // FIX: cold start par pehle login restore hone do, tabhi seen history
      // aur blocked users sahi key se load honge.
      // SPEED: feed ka first page login ka wait kiye bina turant shuru.
      // (pehle auth restore hone tak max 4s ruka rehta tha)
      const firstPagePromise = fetchVideoPage(null);
      firstPagePromise.catch(() => {}); // cancel hone par unhandled error na aaye

      const user = await waitForAuthUser();
      if (cancelled) return;

      // Sab ek saath -> sabse kam wait
      const [seenMap, blockedIds, lastTop, firstSnap, resume] = await Promise.all([
        loadSeenMap(),
        user
          ? Promise.all([
              getDocs(query(collection(db, "blockedUsers"), where("blockerId", "==", user.uid))),
              getDocs(query(collection(db, "blockedUsers"), where("blockedUserId", "==", user.uid))),
            ])
              .then(([a, b]) => [
                ...a.docs.map((d) => d.data().blockedUserId),
                ...b.docs.map((d) => d.data().blockerId),
              ].filter(Boolean))
              .catch(() => [])
          : Promise.resolve([]),
        loadLastTop(),
        firstPagePromise,
        loadResume(),
      ]);

      if (cancelled) return;

      seenRef.current = seenMap;
      lastTopIdRef.current = lastTop;
      blockedRef.current = blockedIds;
      setBlockedUsers(blockedIds);

      const session = resetFeedState();

      // RESUME: pichla feed + video wapas (jaha roka tha wahi se)
      let restoredList = null;
      let restoredIdx = 0;
      if (resume && resume.videos && resume.videos.length) {
        const curId = resume.videos[resume.index]?.id;
        const alive = resume.videos.filter(
          (v) =>
            v &&
            v.id &&
            v.status !== "blocked" &&
            v.hidden !== true &&
            !blockedIds.includes(v.userId)
        );
        if (alive.length) {
          const found = alive.findIndex((v) => v.id === curId);
          restoredList = alive;
          restoredIdx = found >= 0 ? found : 0;
          alive.forEach((v) => fetchedIdsRef.current.add(v.id));
        }
      }

      ingestSnap(firstSnap);

      if (restoredList) {
        initialIndexRef.current = restoredIdx;
        lastViewableIndexRef.current = restoredIdx;
        lastViewableIdRef.current = restoredList[restoredIdx].id;
        setCurrentIndex(restoredIdx);
        setActiveVideo(restoredIdx);
        setMountIndex(restoredIdx);
        setVideos(restoredList);
        syncHasMore();
        ensurePool(NEXT_BATCH_WANT * 2, session).catch(() => {});
        return;
      }

      // Sab 30 newest dekhe hue hon to aur pages padho jab tak unseen mile
      await ensurePool(FIRST_SHOW + 2, session);
      if (cancelled) return;

      const picked = pullFromPool(FIRST_SHOW, []);
      setVideos(picked);
      syncHasMore();

      if (picked[0]) {
        lastTopIdRef.current = picked[0].id;
        saveLastTop(picked[0].id);
      }

      // Background me agla batch taiyar rakho
      ensurePool(NEXT_BATCH_WANT * 2, session).catch(() => {});
    } catch (error) {
      __DEV__ && console.log("Firebase Video Error:", error);
    } finally {
      if (!cancelled) setLoading(false);
    }
  };

  loadFirstVideos();

  return () => {
    cancelled = true;
  };
}, []);

// PULL-TO-REFRESH (aur app wapas aane par auto-refresh)
const refreshVideos = useCallback(async () => {
  if (refreshing) return;
  if (feedTabRef.current !== 'foryou') return; // grid tabs ka refresh tab dobara tap se
  setRefreshing(true);

  try {
    // Jo video abhi screen par hai wo user ne dekha -> seen
    const cur = videosRef.current[currentIndexRef.current];
    if (cur) markSeen(cur.id);

    const session = resetFeedState();
    Object.keys(videoPositions).forEach((k) => delete videoPositions[k]);
    setHasMoreVideos(true);

    await ensurePool(FIRST_SHOW + 2, session);

    const picked = pullFromPool(FIRST_SHOW, []);

    lastViewableIndexRef.current = -1;
    lastViewableIdRef.current = null;
    setCurrentIndex(0);
    setActiveVideo(0);
    setMountIndex(0);
    setPausedVideoId(null);
    setVideos(picked);
    syncHasMore();
    scrollRef.current?.scrollToOffset?.({ offset: 0, animated: false });

    if (picked[0]) {
      lastTopIdRef.current = picked[0].id;
      saveLastTop(picked[0].id);
    }

    ensurePool(NEXT_BATCH_WANT * 2, session).catch(() => {});
  } catch (error) {
    __DEV__ && console.log("Refresh Videos Error:", error);
  } finally {
    setRefreshing(false);
  }
}, [refreshing]);

refreshRef.current = refreshVideos;

// App background -> seen turant save; 3+ min baad wapas aaye -> naya feed
useEffect(() => {
  let backgroundAt = 0;

  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      if (!backgroundAt) backgroundAt = Date.now();
      saveSeenMap(seenRef.current);
      persistResume();
      return;
    }

    if (state === 'active') {
      const away = backgroundAt ? Date.now() - backgroundAt : 0;
      backgroundAt = 0;
      if (away > RESUME_REFRESH_MS) {
        refreshRef.current?.();
      }
    }
  });

  return () => sub.remove();
}, []);

// LOAD MORE (background me, user ke last 4 video par pahunchne se pehle)
const loadMoreVideos = useCallback(async () => {
  if (feedTabRef.current !== 'foryou') return;
  if (loadingMoreRef.current) return;
  if (!hasMoreVideos) return;

  loadingMoreRef.current = true;

  try {
    const session = sessionRef.current;

    await ensurePool(NEXT_BATCH_WANT * 2, session);
    if (session !== sessionRef.current) return;

    const picked = pullFromPool(NEXT_BATCH_WANT, videosRef.current);

    if (picked.length > 0) {
      setVideos((prev) => {
        const ids = new Set(prev.map((v) => v.id));
        const fresh = picked.filter((v) => !ids.has(v.id));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    }

    syncHasMore();
  } catch (error) {
    __DEV__ && console.log("Load More Videos Error:", error);
  } finally {
    loadingMoreRef.current = false;
  }
}, [hasMoreVideos]);






useEffect(() => {
  let alive = true;
  let unsubDoc = null;

  // 1) Phone me saved naam turant (app khulte hi)
  readCachedProfile().then((c) => {
    if (alive && c && c.name && !currentUserRef.current) applyMyProfile(c);
  });

  // 2) Login restore hote hi users/{uid} ko LIVE sunte raho:
  //    profile me naam / dp badalte hi yahan bhi turant badal jata hai.
  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (unsubDoc) { unsubDoc(); unsubDoc = null; }

    if (!user) {
      currentUserRef.current = null;
      AsyncStorage.removeItem(MY_PROFILE_CACHE_KEY).catch(() => {});
      return;
    }

    unsubDoc = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (!alive) return;
        const profile = buildMyProfile(user, snap.exists() ? snap.data() : {});
        saveCachedProfile(profile);
        applyMyProfile(profile);
      },
      () => {
        loadMyProfile(true).then((p) => {
          if (alive && p) applyMyProfile(p);
        });
      }
    );
  });

  return () => {
    alive = false;
    if (unsubDoc) unsubDoc();
    unsubscribeAuth();
  };
}, []);

// Mere saare videos me naam + dp apne aap naya dikhe (feed me abhi load videos)
useEffect(() => {
  const uid = auth.currentUser?.uid;
  const name = currentUserData.name;
  const photo = currentUserData.photo;
  if (!uid || !name) return;

  setVideos((prev) => {
    let changed = false;
    const next = prev.map((v) => {
      if (v.userId === uid && (v.username !== name || v.profile !== photo)) {
        changed = true;
        return { ...v, username: name, profile: photo };
      }
      return v;
    });
    return changed ? next : prev;
  });
}, [currentUserData.name, currentUserData.photo, videos.length]);

useEffect(() => {
  let unsubscribeWallet = null;

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!user) {
      setMyStars(0);
      if (unsubscribeWallet) {
        unsubscribeWallet();
        unsubscribeWallet = null;
      }
      return;
    }

    const walletRef = doc(db, "wallets", user.uid);

    getDoc(walletRef)
      .then((snap) => {
        if (snap.exists()) {
          setMyStars(snap.data().stars || 0);
        } else {
          setMyStars(0);
        }
      })
      .catch((error) => {
        __DEV__ && console.log("Wallet Stars Load Error:", error);
      });

    if (unsubscribeWallet) {
      unsubscribeWallet();
    }

    unsubscribeWallet = onSnapshot(
      walletRef,
      (snap) => {
        if (snap.exists()) {
          setMyStars(snap.data().stars || 0);
        } else {
          setMyStars(0);
        }
      },
      (error) => {
        __DEV__ && console.log("Wallet Stars Realtime Error:", error);
      }
    );
  });

  return () => {
    unsubscribeAuth();
    if (unsubscribeWallet) {
      unsubscribeWallet();
    }
  };
}, []);


useEffect(() => {

  const isIOS = Platform.OS === 'ios';

  const show = Keyboard.addListener(
    isIOS ? "keyboardWillShow" : "keyboardDidShow",
    (e) => {
      Animated.timing(keyboardHeight,{
        toValue:e.endCoordinates.height,
        duration:isIOS ? (e.duration || 250) : 180,
        useNativeDriver:true,
      }).start();
    }
  );

  const hide = Keyboard.addListener(
    isIOS ? "keyboardWillHide" : "keyboardDidHide",
    (e)=>{
      Animated.timing(keyboardHeight,{
        toValue:0,
        duration:isIOS ? ((e && e.duration) || 250) : 180,
        useNativeDriver:true,
      }).start();
    }
  );

  return ()=>{
    show.remove();
    hide.remove();
  };

},[]);




useEffect(() => {
    if (!showComments) commentTextRef.current = '';

    if (showComments) {
        Animated.spring(commentAnim,{
            toValue:0,
            useNativeDriver:true,
            speed:16,
            bounciness:0
        }).start();

    } else {

        Animated.timing(commentAnim,{
            toValue:height,
            duration:250,
            useNativeDriver:true
        }).start();

    }

},[showComments]);



  // PAGE FOCUS LOGIC (Back aane par auto-resume karega)
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
  return () => {
  setIsFocused(false);
  persistResume();
};
    }, [])
  );


useEffect(() => {
  const backAction = () => {

    // Star Popup open hai to pehle usko close karo
if (showSharePopup) {
  setShowSharePopup(false);
  return true;
}

    if (showStarPopup) {
      setShowStarPopup(false);
      return true;
    }

    // Comments open hain to unko close karo
    if (showComments) {
      closeComments();
      return true;
    }

    // Feed home screen hai: back dabane par app se bahar jao
    // (camera/edit/post jaisi purani screens wapas nahi khulengi)
    BackHandler.exitApp();
    return true;
  };

  const backHandler = BackHandler.addEventListener(
    'hardwareBackPress',
    backAction
  );

  return () => backHandler.remove();
}, [showComments, showStarPopup, showSharePopup]);




// ==========================================================
// COMMENTS LISTENER
// FIX (loading hi loading): pehle ye effect sirf [selectedVideoId]
// par chalta tha. Comment band karne ke baad (back / profile se) ID
// same rehti thi, to dubara kholne par effect chalta hi nahi tha aur
// `commentsLoading` hamesha true reh jaata tha.
// Ab effect `showComments` par bhi depend karta hai: khulte hi
// listener lagta he, band hote hi cleanup se band ho jaata he.
// (Star popup ab comments ka listener nahi chalata.)
// ==========================================================
useEffect(() => {
  if (!showComments || !selectedVideoId) return;

  const videoId = selectedVideoId;
  const replyMap = replyUnsubscribers.current;
  let cancelled = false;

  const q = query(
    collection(db, "all_videos", videoId, "comments"),
    orderBy("createdAt", "desc"),
    limit(commentLimit)
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      if (cancelled) return;

      const fresh = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Jo comment badla nahi uska purana object rakho -> memo row re-render nahi hoti
      setComments((prev) => {
        const old = new Map(prev.map((c) => [c.id, c]));
        return fresh.map((n) => {
          const o = old.get(n.id);
          return o &&
            o.text === n.text &&
            o.username === n.username &&
            o.profilePic === n.profilePic &&
            o.verified === n.verified &&
            o.verifiedColor === n.verifiedColor &&
            o.faceVerified === n.faceVerified &&
            o.createdAt?.seconds === n.createdAt?.seconds
            ? o
            : n;
        });
      });
      setCommentsLoading(false);

      // Reply listeners DIFF se: sirf naye comments ke liye lagao,
      // delete hue comments ke band karo (pehle har snapshot par sab dobara bante the)
      const liveIds = new Set(fresh.map((c) => c.id));
      const removed = [];
      replyMap.forEach((unsub, id) => {
        if (!liveIds.has(id)) {
          unsub();
          replyMap.delete(id);
          removed.push(id);
        }
      });
      if (removed.length) {
        setReplies((prev) => {
          const next = { ...prev };
          removed.forEach((id) => delete next[id]);
          return next;
        });
      }

      fresh.forEach((c) => {
        if (replyMap.has(c.id)) return;

        const replyQuery = query(
          collection(db, "all_videos", videoId, "comments", c.id, "replies"),
          orderBy("createdAt", "asc")
        );

        const replyUnsub = onSnapshot(
          replyQuery,
          (replySnap) => {
            if (cancelled) return;
            const list = replySnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setReplies((prev) => {
              if (list.length === 0 && !prev[c.id]) return prev; // faltu render nahi
              return { ...prev, [c.id]: list };
            });
          },
          () => {}
        );

        replyMap.set(c.id, replyUnsub);
      });
    },
    (error) => {
      __DEV__ && console.log("Comment Load Error", error);
      if (!cancelled) setCommentsLoading(false);
    }
  );

  return () => {
    cancelled = true;
    unsubscribe();
    replyMap.forEach((unsub) => unsub());
    replyMap.clear();
  };
}, [showComments, selectedVideoId, commentLimit]);

  // INTERACTIONS
  

      const handleLike = (videoId) => {
  const user = auth.currentUser;

  if (!user) {
    Alert.alert(
      "Login Required",
      "Please login to like this video."
    );
    return;
  }

  const userId = user.uid;
  const alreadyLiked = !!localLikes[videoId];
  const nextLiked = !alreadyLiked;

  // =====================================================
  // OPTIMISTIC UI:
  // Heart RED + count dono ek hi tap par turant change.
  // Slow network me bhi next tap latest local state use karega.
  // =====================================================
  pendingLikeRef.current[videoId] = true;

  setLocalLikes(prev => ({
    ...prev,
    [videoId]: nextLiked,
  }));

  setVideos(prev =>
    prev.map(video =>
      video.id === videoId
        ? {
            ...video,
            likes: Math.max(
              0,
              (video.likes || 0) + (nextLiked ? 1 : -1)
            ),
          }
        : video
    )
  );

  // Same video ke Firebase operations ko order me chalao.
  const previousOperation =
    likeQueueRef.current[videoId] || Promise.resolve();

  const operation = previousOperation
    .catch(() => {})
    .then(async () => {
      const likeRef = doc(
        db,
        "all_videos",
        videoId,
        "likes",
        userId
      );

      const videoRef = doc(
        db,
        "all_videos",
        videoId
      );

      if (nextLiked) {
        // ===== LIKE =====
        await setDoc(likeRef, {
          userId: userId,
          createdAt: serverTimestamp()
        });

        await updateDoc(videoRef, {
          likes: increment(1),
          engagementScore: increment(5)
        });

        const videoSnap = await getDoc(videoRef);

        if (videoSnap.exists()) {
          const videoData = videoSnap.data();
          notifyVideoLike(videoId, videoData.likes); // milestone push

          const userLikeRef = doc(
            db,
            "userLikes",
            userId,
            "likedVideos",
            videoId
          );

          await setDoc(userLikeRef, {
            videoId: videoId,
            ownerId: videoData.userId,
            createdAt: serverTimestamp()
          });

          // Notification
          if (videoData.userId !== user.uid) {
            await addDoc(
              collection(
                db,
                "users",
                videoData.userId,
                "notifications"
              ),
              {
                type: "like",
                isRead: false,
                senderId: user.uid,
                senderName: (currentUserRef.current?.name || currentUserData.name || user.displayName || user.email?.split('@')[0] || 'User'),
                senderPhoto: (currentUserRef.current?.photo || currentUserData.photo),
                videoId: videoId,
                videoCaption: videoData.caption || "",
                videoThumbnail:
                  videoData.thumbnail ||
                  videoData.videoThumbnail ||
                  "",
                createdAt: serverTimestamp()
              }
            );
          }
        }

      } else {
        // ===== UNLIKE =====
        await deleteDoc(likeRef);

        await updateDoc(videoRef, {
          likes: increment(-1),
          engagementScore: increment(-5)
        });

        const userLikeRef = doc(
          db,
          "userLikes",
          userId,
          "likedVideos",
          videoId
        );

        await deleteDoc(userLikeRef);
      }
    })
    .catch((e) => {
      // UI ko rollback nahi karte:
      // user ko slow network me bhi latest tap state dikhti rahe.
      __DEV__ && console.log("Like Firebase Error:", e);
    })
    .finally(() => {
      if (likeQueueRef.current[videoId] === operation) {
        delete pendingLikeRef.current[videoId];
        delete likeQueueRef.current[videoId];
      }
    });

  likeQueueRef.current[videoId] = operation;
};

const handleFollow = async (targetUserId) => {
  const user = auth.currentUser;
  if (!user) {
    Alert.alert("Login Required", "Please login to follow.");
    return;
  }
  if (user.uid === targetUserId) return;

  const isFollowing = !!followingUsers[targetUserId];

  // Server me jaate waqt nearby-loader is state ko overwrite na kare
  pendingFollowRef.current[targetUserId] =
    (pendingFollowRef.current[targetUserId] || 0) + 1;

  // Optimistic: button turant badle
  setFollowingUsers(prev => ({ ...prev, [targetUserId]: !isFollowing }));

  try {
    // FIX: profile.tsx isi "follows" collection se Followers / Following
    // count nikalta hai (doc id = myUid_targetUid). Pehle yahan
    // users/{uid}/following + counter update hota tha, isliye profile ka
    // count kabhi nahi badhta tha (aur doosre user ke doc ka write rules
    // se fail hokar poora follow roll-back ho jata tha).
    const edgeRef = doc(db, "follows", `${user.uid}_${targetUserId}`);

    if (isFollowing) {
      await deleteDoc(edgeRef);
    } else {
      await setDoc(edgeRef, {
        followerId: user.uid,
        followingId: targetUserId,
        createdAt: Date.now(),
      });
      notifyNewFollower(targetUserId);
    }
  } catch (e) {
    // fail hua to wapas purani state
    setFollowingUsers(prev => ({ ...prev, [targetUserId]: isFollowing }));
    __DEV__ && console.log("Follow Error:", e);
    Alert.alert("Error", "Follow nahi ho paya, dobara try karo.");
  } finally {
    pendingFollowRef.current[targetUserId] =
      Math.max(0, (pendingFollowRef.current[targetUserId] || 1) - 1);
    if (!pendingFollowRef.current[targetUserId]) {
      delete pendingFollowRef.current[targetUserId];
    }
  }
};


const handleDoubleTapLike = (videoId) => {

  // Heart animation (tick badalne se popup dobara mount -> animation replay)
  setHeartVideoId(videoId);
  setHeartTick((t) => t + 1);

  if (heartTimeout.current) {
    clearTimeout(heartTimeout.current);
  }

  heartTimeout.current = setTimeout(() => {
    setHeartVideoId(null);
  }, 1000);

  // Agar pehle se like nahi hai tabhi like karo
  if (!localLikes[videoId]) {
    handleLike(videoId);
  }

};


// ======================================================
// STABLE CALLBACKS FOR THE MEMOIZED <VideoItem/>
// ======================================================
// handleLike / handleFollow / handleDoubleTapLike upar plain
// functions hain, isliye har render par inki identity badalti hai.
// Agar unhe directly VideoItem ko prop ki tarah diya jaye, to React.memo
// har render par "prop badla" samajh kar poori list ko re-render kar
// dega -- exactly wahi performance problem jo hum fix karna chahte hain.
//
// Fix: ref me hamesha latest function rakho, aur VideoItem ko ek
// useCallback(..., []) wrapper do jiski identity KABHI nahi badalti.
// Andar se wo hamesha ref.current (yaani latest version) hi call karta hai.
const handleLikeRef = useRef(handleLike);
handleLikeRef.current = handleLike;
const onLike = useCallback((videoId) => handleLikeRef.current(videoId), []);

const handleFollowRef = useRef(handleFollow);
handleFollowRef.current = handleFollow;
const onFollow = useCallback((userId) => handleFollowRef.current(userId), []);

// ==========================================================
// TOP BAR actions + Follow / Discover grid data
// (grid sirf tab load hota hai jab tab dabao; For You feed ko touch nahi)
// ==========================================================
const GRID_TTL_MS = 60 * 1000;
const tsMs = (t) => {
  if (!t) return 0;
  if (typeof t === 'number') return t;
  if (t.toMillis) return t.toMillis();
  if (t.seconds) return t.seconds * 1000;
  return 0;
};

const loadFollowGrid = useCallback(async (force) => {
  const user = auth.currentUser;
  if (!user) {
    setFollowList([]);
    setLiveList([]);
    return;
  }
  if (!force && Date.now() - gridTimeRef.current.follow < GRID_TTL_MS) return;
  gridTimeRef.current.follow = Date.now();
  setGridLoading(true);
  try {
    const fSnap = await getDocs(
      query(collection(db, "follows"), where("followerId", "==", user.uid), limit(60))
    );
    const ids = [];
    fSnap.forEach((d) => {
      const t = d.data()?.followingId || d.id.slice(user.uid.length + 1);
      if (t) ids.push(t);
    });
    if (ids.length === 0) {
      setFollowList([]);
      setLiveList([]);
      return;
    }
    const idSet = new Set(ids);

    // videos (10-10 ke chunk, bina orderBy -> naya index nahi chahiye) + live rooms ek saath
    const chunks = [];
    for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
    const [snaps, roomsSnap] = await Promise.all([
      Promise.all(
        chunks.map((c) =>
          getDocs(query(collection(db, "all_videos"), where("userId", "in", c), limit(20))).catch(() => null)
        )
      ),
      getDocs(collection(db, "rooms")).catch(() => null),
    ]);

    const list = [];
    snaps.forEach((sn) => {
      if (!sn) return;
      sn.forEach((docItem) => {
        if (!isAllowedVideo(docItem.data())) return;
        list.push(toVideo(docItem));
      });
    });
    list.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
    setFollowList(list.slice(0, 40));

    // followed logon ke live rooms (video = LIVE, audio = CHAT)
    const lives = [];
    const now = Date.now();
    if (roomsSnap) {
      roomsSnap.forEach((d) => {
        const r = d.data();
        const st = String(r.status || '').toLowerCase().trim();
        if (st === 'ended' || st === 'inactive' || st === 'closed') return;
        if ((r.roomType || 'public') !== 'public') return;
        const hb = tsMs(r.hostHeartbeat) || tsMs(r.lastHeartbeat);
        if (hb && now - hb > 10 * 60 * 1000) return;
        const hostId = r.hostId || r.seatsData?.seat_1?.userId;
        if (!hostId || !idSet.has(hostId) || blockedRef.current.includes(hostId)) return;
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
    setLiveList(lives);
  } catch (e) {
    __DEV__ && console.log("Follow grid error:", e);
    gridTimeRef.current.follow = 0;
  } finally {
    setGridLoading(false);
  }
}, []);

const loadDiscoverGrid = useCallback(async (force) => {
  if (!force && Date.now() - gridTimeRef.current.discover < GRID_TTL_MS) return;
  gridTimeRef.current.discover = Date.now();
  setGridLoading(true);
  try {
    const snap = await fetchVideoPage(null);
    const list = [];
    snap.forEach((docItem) => {
      if (!isAllowedVideo(docItem.data())) return;
      list.push(toVideo(docItem));
    });
    // halka sa mix (Fisher-Yates) taaki har baar same order na dikhe
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    setDiscoverList(list);
  } catch (e) {
    __DEV__ && console.log("Discover grid error:", e);
    gridTimeRef.current.discover = 0;
  } finally {
    setGridLoading(false);
  }
}, []);

// For You ki list yaad rakho (grid se video kholne par feed list badalti hai)
const saveForYouSnap = () => {
  if (feedTabRef.current === 'foryou') {
    forYouSnapRef.current = {
      videos: videosRef.current,
      index: currentIndexRef.current,
    };
  }
};

const onTopLive = useCallback(() => {
  router.push('/all-live');
}, []);

const onTopDiscover = useCallback(() => {
  if (feedTabRef.current === 'discover' && showGridRef.current) {
    loadDiscoverGrid(true);
    return;
  }
  saveForYouSnap();
  feedTabRef.current = 'discover';
  showGridRef.current = true;
  setFeedTab('discover');
  setShowGrid(true);
  setPausedVideoId(null);
  loadDiscoverGrid(false);
}, [loadDiscoverGrid]);

const onTopFollow = useCallback(() => {
  if (feedTabRef.current === 'follow' && showGridRef.current) {
    loadFollowGrid(true);
    return;
  }
  saveForYouSnap();
  feedTabRef.current = 'follow';
  showGridRef.current = true;
  setFeedTab('follow');
  setShowGrid(true);
  setPausedVideoId(null);
  loadFollowGrid(false);
}, [loadFollowGrid]);

const onTopForYou = useCallback(() => {
  if (feedTabRef.current === 'foryou') {
    scrollRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    return;
  }
  const snap = forYouSnapRef.current;
  feedTabRef.current = 'foryou';
  showGridRef.current = false;
  setFeedTab('foryou');
  setShowGrid(false);
  if (snap && snap.videos && snap.videos.length) {
    const idx = Math.min(snap.index || 0, snap.videos.length - 1);
    lastViewableIndexRef.current = idx;
    lastViewableIdRef.current = snap.videos[idx]?.id;
    initialIndexRef.current = idx;
    setCurrentIndex(idx);
    setActiveVideo(idx);
    setMountIndex(idx);
    setVideos(snap.videos);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToOffset?.({ offset: idx * listHRef.current, animated: false });
    });
  } else {
    refreshRef.current?.();
  }
}, []);

// Left/Right swipe se tab badlo: Discover | Follow | For You
const swipeTabs = useSwipeTabs({
  onSwipeRight: () => {
    if (feedTabRef.current === 'foryou') onTopFollow();
    else if (feedTabRef.current === 'follow') onTopDiscover();
    else if (feedTabRef.current === 'discover') onTopLive();   // Discover ke baad All Live
  },
  onSwipeLeft: () => {
    if (feedTabRef.current === 'discover') onTopFollow();
    else if (feedTabRef.current === 'follow') onTopForYou();
  },
});

// Grid ka koi video tap kiya -> wahi list full-screen feed me, usi video se
const onGridOpen = useCallback((list, idx) => {
  if (!list || !list[idx]) return;
  showGridRef.current = false;
  setShowGrid(false);
  lastViewableIndexRef.current = -1;
  lastViewableIdRef.current = "";
  initialIndexRef.current = idx;
  setCurrentIndex(idx);
  setActiveVideo(idx);
  setMountIndex(idx);
  setPausedVideoId(null);
  setVideos(list);
  requestAnimationFrame(() => {
    scrollRef.current?.scrollToOffset?.({ offset: idx * listHRef.current, animated: false });
  });
}, []);

const onGridLiveOpen = useCallback((st) => {
  if (st.type === 'video') {
    router.push({ pathname: '/videolive', params: { id: st.id, role: 'viewer' } });
  } else if (st.layout === 'multiguest') {
    router.push({ pathname: '/MultiGuestRoom', params: { id: st.id } });
  } else {
    router.push({ pathname: '/LiveRoom', params: { id: st.id, from: 'alllive', layout: st.layout } });
  }
}, []);

const handleDoubleTapLikeRef = useRef(handleDoubleTapLike);
handleDoubleTapLikeRef.current = handleDoubleTapLike;
const onDoubleTapLike = useCallback((videoId) => handleDoubleTapLikeRef.current(videoId), []);

// Single tap = play/pause, double tap = like. lastTap/tapTimeout
// refs hain (already stable), aur setPausedVideoId React ka setState
// hai (hamesha stable), isliye ye callback bhi hamesha stable rehta hai.
const onItemPress = useCallback((videoId) => {
  const now = Date.now();

  if (lastTap.current && (now - lastTap.current) < 250) {
    if (tapTimeout.current) {
      clearTimeout(tapTimeout.current);
      tapTimeout.current = null;
    }
    lastTap.current = null;
    onDoubleTapLike(videoId);
    return;
  }

  lastTap.current = now;

  // INSTA: 300 -> 250ms, pause jaldi lage, double-tap window bhi theek rahe
  tapTimeout.current = setTimeout(() => {
    tapTimeout.current = null;
    lastTap.current = null;
    setPausedVideoId(prev => (prev === videoId ? null : videoId));
  }, 250);
}, [onDoubleTapLike]);

// router.push navigation ke liye bhi wahi ref-pattern, taaki
// expo-router ka router object badalne se bhi VideoItem re-render
// na ho.
const routerRef = useRef(router);
routerRef.current = router;

const onOpenProfile = useCallback((userId) => {
  routerRef.current.push({
    pathname: "/userProfile",
    params: { userId },
  });
}, []);

const onOpenMusic = useCallback((item) => {
  routerRef.current.push({
    pathname: "/musicDetails",
    params: {
      musicId: item.musicId || item.id,
      musicName: item.songName || "Original Audio",
      username: item.username,
      profile: item.profile,
      audioUrl: item.audioUrl || item.songUrl || item.musicUrl,
    },
  });
}, []);

// Ye sab sirf useState setters call karte hain, jo hamesha stable
// hote hain -- isliye empty dependency array safe hai.
const onOpenComments = useCallback(async (item) => {
  // Owner ne comments lock kiye hon to panel nahi khulega
  const chk = await checkVideoAction(item.userId, "comments");
  if (!chk.ok) { Alert.alert("Comments Off", chk.message); return; }
  setComments([]);
  setReplies({});
  setExpandedReplies({});
  setReplyingTo(null);
  setCommentLimit(COMMENT_PAGE_SIZE);
  setCommentsLoading(true);
  setSelectedVideoId(item.id);
  setSelectedVideoData({
    username: item.username,
    profile: item.profile,
    caption: item.caption,
    userId: item.userId,
    verified: item.verified || false,
    verifiedColor: item.verifiedColor || "",
    faceVerified: isFaceVerified(item),
  });
  setShowComments(true);
}, []);

const onOpenShare = useCallback(async (item) => {
  // Owner ne share lock kiya ho to share popup nahi khulega
  const chk = await checkVideoAction(item.userId, "share");
  if (!chk.ok) { Alert.alert("Share Off", chk.message); return; }
  setSelectedShareVideo(item);
  setShowSharePopup(true);
}, []);

const onOpenStar = useCallback((videoId) => {
  setSelectedVideoId(videoId);
  setShowStarPopup(true);
}, []);





const playStarAnimation = () => {

  // Total ~3 second: chhota -> bara, beech me chamak, last me fade out
  // (starRotate yahan shine value ki tarah use hota hai)
  starScale.setValue(0.5);
  starOpacity.setValue(0);
  starRotate.setValue(0);

  const shinePulse = Animated.sequence([
    Animated.timing(starRotate,{ toValue:1, duration:300, useNativeDriver:true }),
    Animated.timing(starRotate,{ toValue:0, duration:300, useNativeDriver:true }),
  ]);

  Animated.sequence([

    Animated.parallel([
      // chhota se bara (2.6 sec)
      Animated.timing(starScale,{
        toValue:1.25,
        duration:2600,
        easing:Easing.out(Easing.cubic),
        useNativeDriver:true,
      }),

      Animated.timing(starOpacity,{
        toValue:1,
        duration:250,
        useNativeDriver:true,
      }),

      // chamak 4 baar
      Animated.sequence([
        shinePulse, shinePulse, shinePulse, shinePulse,
      ]),
    ]),

    // last me fade out (0.4 sec)
    Animated.parallel([
      Animated.timing(starOpacity,{
        toValue:0,
        duration:400,
        useNativeDriver:true,
      }),
      Animated.timing(starScale,{
        toValue:1.4,
        duration:400,
        useNativeDriver:true,
      }),
    ]),

  ]).start(()=>{
    setStarAnimationVideoId(null);
  });

};




  const handleShare = async (videoUrl, videoId) => {



    try {
      const result = await Share.share({ 
        message: `Check out this amazing video on TopKing 👑\n${videoLink(videoId)}`,
      });
      if (result.action === Share.sharedAction) {
        setVideos(prev => prev.map(video =>
          video.id === videoId
            ? { ...video, shares: (video.shares || 0) + 1 }
            : video
        ));
        await updateDoc(doc(db, 'all_videos', videoId), { shares: increment(1), engagementScore: increment(10) });
      }
    } catch (e) { __DEV__ && console.log("Share Error", e); }
  };

  const trackView = async (videoId) => {
    try {
      await updateDoc(doc(db, 'all_videos', videoId), { views: increment(1), engagementScore: increment(2) });
    } catch (error) {}
  };




const deleteComment = async (commentId) => {

  Alert.alert(
    "Delete Comment",
    "Do you want to delete this comment?",
    [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Delete",
        style: "destructive",

        onPress: async () => {

          try {

            const vid = selectedVideoId;
            setVideos((prev) => prev.map((video) =>
              video.id === vid
                ? { ...video, commentsCount: Math.max(0, (video.commentsCount || 1) - 1) }
                : video
            ));

            await deleteDoc(
              doc(
                db,
                "all_videos",
                selectedVideoId,
                "comments",
                commentId
              )
            );

            await updateDoc(
              doc(
                db,
                "all_videos",
                selectedVideoId
              ),
              {
                commentsCount: increment(-1),
              }
            );

          } catch (error) {

            __DEV__ && console.log(error);

            // fail hua -> feed ka count wapas
            setVideos((prev) => prev.map((video) =>
              video.id === selectedVideoId
                ? { ...video, commentsCount: (video.commentsCount || 0) + 1 }
                : video
            ));

            Alert.alert(
              "Error",
              "Comment delete failed"
            );
          }
        },
      },
    ]
  );
};



const deleteReply = async (commentId, replyId) => {

  Alert.alert(
    "Delete Reply",
    "Do you want to delete this reply?",
    [
      {
        text:"Cancel",
        style:"cancel",
      },

      {
        text:"Delete",
        style:"destructive",

        onPress: async()=>{

          try{


            const vid = selectedVideoId;
            setVideos((prev) => prev.map((video) =>
              video.id === vid
                ? { ...video, commentsCount: Math.max(0, (video.commentsCount || 1) - 1) }
                : video
            ));

            await deleteDoc(
              doc(
                db,
                "all_videos",
                selectedVideoId,
                "comments",
                commentId,
                "replies",
                replyId
              )
            );


            await updateDoc(
              doc(
                db,
                "all_videos",
                selectedVideoId
              ),
              {
                commentsCount: increment(-1),
              }
            );


          }catch(e){

            __DEV__ && console.log("Reply delete error",e);

          }

        }

      }

    ]
  );

};


const postComment = async () => {
  // Reply mode
  if (replyingTo) {
    await postReply();
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    Alert.alert('Login Required');
    return;
  }

  const text = commentTextRef.current.trim();

  if (blockIfProfane(text)) return;
  const videoId = selectedVideoId;
  if (!text || !videoId) return;

  // FIX: sahi naam/photo pakka karo (profile load na hui ho to yahin load hogi)
  const me = await getMyProfileNow(user);
  if (!me) {
    Alert.alert('Profile load nahi hui', 'Internet check karke dobara try karo.');
    return;
  }

  const videoMeta = videosRef.current.find((v) => v.id === videoId);

  // Turant UI clear + count badhao (optimistic)
  clearCommentInput();
  Keyboard.dismiss();
  commentListRef.current?.scrollToOffset?.({ offset: 0, animated: true });
  setVideos((prev) => prev.map((video) =>
    video.id === videoId
      ? { ...video, commentsCount: (video.commentsCount || 0) + 1 }
      : video
  ));

  try {
    // Comment + counter EK hi atomic batch me
    const batch = writeBatch(db);
    const commentRef = doc(collection(db, 'all_videos', videoId, 'comments'));

    batch.set(commentRef, {
      text,
      username: me.name,
      profilePic: me.photo,
      userId: user.uid,
      verified: me.verified || false,
      verifiedColor: me.verifiedColor || "",
      faceVerified: isFaceVerified(me),
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'all_videos', videoId), {
      commentsCount: increment(1),
      engagementScore: increment(3),
    });

    await batch.commit();
  } catch (error) {
    setVideos((prev) => prev.map((video) =>
      video.id === videoId
        ? { ...video, commentsCount: Math.max(0, (video.commentsCount || 1) - 1) }
        : video
    ));
    __DEV__ && console.log('Comment Error:', error);
    return;
  }

  // Notification BACKGROUND me (UI ko wait nahi karna padta)
  (async () => {
    try {
      let meta = videoMeta;
      if (!meta) {
        const snap = await getDoc(doc(db, 'all_videos', videoId));
        meta = snap.exists() ? snap.data() : null;
      }
      if (!meta || !meta.userId || meta.userId === user.uid) return;

      await addDoc(collection(db, 'users', meta.userId, 'notifications'), {
        type: 'comment',
        isRead: false,
        senderId: user.uid,
        senderName: me.name,
        senderPhoto: me.photo,
        videoId,
        text,
        videoCaption: meta.caption || '',
        videoThumbnail: meta.thumbnail || meta.videoThumbnail || '',
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      __DEV__ && console.log('Notification Error:', e);
    }
  })();
};


const postReply = async () => {
  const user = auth.currentUser;
  if (!user) return;

  const text = commentTextRef.current.trim();

  if (blockIfProfane(text)) return;
  const videoId = selectedVideoId;
  const parent = replyingTo;
  if (!text || !videoId || !parent) return;

  const me = await getMyProfileNow(user);
  if (!me) {
    Alert.alert('Profile load nahi hui', 'Internet check karke dobara try karo.');
    return;
  }

  // Turant UI: input clear, reply mode band, replies khul jaayein
  clearCommentInput();
  Keyboard.dismiss();
  setReplyingTo(null);
  setExpandedReplies((prev) => ({ ...prev, [parent.id]: true }));
  setVideos((prev) => prev.map((video) =>
    video.id === videoId
      ? { ...video, commentsCount: (video.commentsCount || 0) + 1 }
      : video
  ));

  try {
    const batch = writeBatch(db);
    const replyRef = doc(
      collection(db, 'all_videos', videoId, 'comments', parent.id, 'replies')
    );

    batch.set(replyRef, {
      text,
      username: me.name,
      profilePic: me.photo,
      userId: user.uid,
      verified: me.verified || false,
      verifiedColor: me.verifiedColor || "",
      faceVerified: isFaceVerified(me),
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'all_videos', videoId), {
      commentsCount: increment(1),
      engagementScore: increment(1),
    });

    await batch.commit();
  } catch (error) {
    setVideos((prev) => prev.map((video) =>
      video.id === videoId
        ? { ...video, commentsCount: Math.max(0, (video.commentsCount || 1) - 1) }
        : video
    ));
    __DEV__ && console.log("Reply Error:", error);
  }
};


// Memoized rows ke liye stable handlers (latest function ref se)
deleteCommentRef.current = deleteComment;
deleteReplyRef.current = deleteReply;

const currentUid = auth.currentUser?.uid;

const myName = currentUserData.name;
const myPhoto = currentUserData.photo;

const renderComment = useCallback(({ item: rawItem }) => {
  const mine = (o) =>
    currentUid && myName && o.userId === currentUid &&
    (o.username !== myName || o.profilePic !== myPhoto)
      ? { ...o, username: myName, profilePic: myPhoto }
      : o;
  const item = mine(rawItem);
  const rl = replies[rawItem.id];
  const replyList = rl ? rl.map(mine) : rl;
  return (
  <CommentRow
    item={item}
    replyList={replyList}
    expanded={!!expandedReplies[item.id]}
    currentUid={currentUid}
    onProfile={onCommentProfile}
    onReply={onCommentReply}
    onToggleReplies={onToggleReplies}
    onDeleteComment={onDeleteComment}
    onDeleteReply={onDeleteReply}
  />
  );
}, [replies, expandedReplies, currentUid, myName, myPhoto, onCommentProfile, onCommentReply,
    onToggleReplies, onDeleteComment, onDeleteReply]);





  const getTimeAgo = (timestamp) => {
  if (!timestamp?.seconds) return 'now';


  const now = Date.now();
  const commentTime = timestamp.seconds * 1000;

  const diff = Math.floor((now - commentTime) / 1000);

  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;

  return `${Math.floor(diff / 2592000)}mo`;
};

  // SCROLL DETECTION
  const onViewableItemsChanged = useRef(({ viewableItems }) => {

  if (viewableItems && viewableItems.length > 0) {

    const index = viewableItems[0].index;

    // SPEED: same video dobara report ho to kuch mat karo
    // (faltu re-render + timers reset nahi honge)
    if (index === lastViewableIndexRef.current && viewableItems[0].item?.id === lastViewableIdRef.current) {
      return;
    }
    lastViewableIndexRef.current = index;
    lastViewableIdRef.current = viewableItems[0].item?.id;

    // AUDIO FIX: state/re-render se pehle hi baaki sab videos band + mute
    silenceOthers(viewableItems[0].item?.id);
    // INSTA: React ka intezaar nahi -> naya video turant play
    if (!showGridRef.current) playActiveNow(viewableItems[0].item?.id);
    scrollMutedRef.current = false;

    // requestIdleCallback hata diya: wo play shuru hone me delay
    // karta tha. Ab video turant chalta hai.
    setCurrentIndex(index);
    setActiveVideo(index);
    setPausedVideoId(null);

    // Players ka window swipe settle hone ke baad badlo (heavy mount scroll me nahi)
    // SMOOTH: naye players (decoder) swipe animation khatam hone ke BAAD mount hon.
    // Pehle 60ms me mount hota tha -> scroll ke beech JS/native thread busy -> jhatka.
    if (mountTimeoutRef.current) clearTimeout(mountTimeoutRef.current);
    mountTimeoutRef.current = setTimeout(() => {
      setMountIndex(index);
    }, 80);

    const currentItem = viewableItems[0].item;

    if (currentItem) {

      if (viewTimeout.current) {
        clearTimeout(viewTimeout.current);
      }

      viewTimeout.current = setTimeout(() => {
        trackView(currentItem.id);
      }, 2000);

      // SEEN: user ne ~3 sec dekha -> dubara feed me nahi aayega
      if (seenTimeout.current) {
        clearTimeout(seenTimeout.current);
      }

      seenTimeout.current = setTimeout(() => {
        markSeen(currentItem.id);
      }, SEEN_DWELL_MS);

    }

  }

}).current;

// WARM-UP: feed settle hone ke baad (4 sec) Discover + Follow ka data chupchap
// cache me daal do -> un tabs par jaate hi TURANT khulte hain (loader nahi).
// Interaction/idle ke baad chalta hai, isliye feed ki swipe par asar nahi.
useEffect(() => {
  let cancelled = false;
  let timer: any = null;
  const task = InteractionManager.runAfterInteractions(() => {
    timer = setTimeout(() => {
      if (cancelled) return;
      try { Promise.resolve(loadDiscover(false)).catch(() => {}); } catch (e) {}
      const u = auth.currentUser?.uid;
      if (u) {
        try { Promise.resolve(loadFollow(u, false)).catch(() => {}); } catch (e) {}
      }
    }, 4000);
  });
  return () => {
    cancelled = true;
    task.cancel();
    if (timer) clearTimeout(timer);
  };
}, []);

// Agle 10 videos ke thumbnails pehle se cache me -> swipe par black flash nahi
useEffect(() => {
  const urls = videos
    .slice(currentIndex + 1, currentIndex + 7)
    .map((v) => v.thumbnail)
    .filter((t) => typeof t === 'string' && t.length > 0);
  if (urls.length) {
    try { ExpoImage.prefetch(urls, 'memory-disk'); } catch (e) {}
  }
}, [currentIndex, videos]);

// ==========================
// PRELOAD NEXT 5 VIDEOS
// ==========================
useEffect(() => {

  if (videos.length === 0) {
    return;
  }

  // Last 4 videos se pehle agle videos background me load
  if (
    currentIndex >= videos.length - 6 &&
    hasMoreVideos &&
    !loadingMoreRef.current
  ) {

    loadMoreVideos();

  }

}, [
  currentIndex,
  videos.length,
  hasMoreVideos,
  loadMoreVideos
]);


const scrollMutedRef = useRef(false);

 const viewConfigRef = useRef({
  // 50%: video thoda pehle chalna shuru (60 me delay lagta tha)
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 0,
  waitForInteraction: false,
});




const feedRefreshControl = useMemo(
  () => (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={refreshVideos}
      tintColor="#f1c40f"
      colors={["#f1c40f"]}
    />
  ),
  [refreshing, refreshVideos]
);

const renderItem = useCallback(({ item, index }) => {
  // FIX: yahan sirf is ek item ke liye zaroori booleans/values
  // compute ho rahe hain, aur heavy JSX ab memoized <VideoItem/>
  // ke andar hai. Isse sirf wahi row re-render hoti hai jiska
  // data sach me badla, poori list nahi.
  const isVideoActive = isFocused && !showGrid && activeVideo === index && pausedVideoId !== item.id;
  // Pichla 1 + agle 3 videos ke player pehle se ready rakho:
  // scroll karte hi video turant chalega (na ruka, na black screen).
  const shouldRenderVideo =
    isFocused &&
    !showGrid &&
    (index === currentIndex ||
      // agla + pichla video HAMESHA ready (mountIndex ka wait nahi) -> swipe par atakna nahi
      index === currentIndex + 1 ||
      index === currentIndex - 1 ||
      (index >= mountIndex - PRELOAD_BEHIND && index <= mountIndex + PRELOAD_AHEAD));
  const nearVideo = index === currentIndex + 1;
  const isCurrent = activeVideo === index;

  return (
    <VideoItem
      itemHeight={listH}
      fullHeight={fullH}
      item={item}
      index={index}
      shouldRenderVideo={shouldRenderVideo}
      nearVideo={nearVideo}
      isVideoActive={isVideoActive}
      isCurrent={isCurrent}
      showHeart={heartVideoId === item.id}
      heartTick={heartVideoId === item.id ? heartTick : 0}
      showStar={starAnimationVideoId === item.id}
      starCount={starAnimationVideoId === item.id ? starAnimationCount : 0}
      isLiked={!!localLikes[item.id]}
      isFollowing={!!followingUsers[item.userId]}
      rotateAnim={rotateAnim}
      textAnim={textAnim}
      starScale={starScale}
      starOpacity={starOpacity}
      starRotate={starRotate}
      starJump={starJump}
      starTilt={starTilt}
      onItemPress={onItemPress}
      onLike={onLike}
      onFollow={onFollow}
      onOpenComments={onOpenComments}
      onOpenShare={onOpenShare}
      onOpenStar={onOpenStar}
      onOpenProfile={onOpenProfile}
      onOpenMusic={onOpenMusic}
    />
  );
},[
  listH,
  fullH,
  activeVideo,
  currentIndex,
  mountIndex,
  isFocused,
  showGrid,
  pausedVideoId,
  heartVideoId,
  heartTick,
  starAnimationVideoId,
  starAnimationCount,
  localLikes,
  followingUsers,
  onItemPress,
  onLike,
  onFollow,
  onOpenComments,
  onOpenShare,
  onOpenStar,
  onOpenProfile,
  onOpenMusic,
]);


  if (loading) return <View style={styles.loadingBox}><ActivityIndicator size="large" color="#f1c40f" /></View>;

  return (
    <View style={styles.fullScreenOverlay} onLayout={onRootLayout} {...swipeTabs}>
      {/* STATUS BAR BLACK: charging / time / date wali top patti black.
          translucent rakha taaki layout (top bar, icons) ki jagah na badle;
          upar ek black strip status bar ki height ki lagayi hai. */}
      <StatusBar translucent backgroundColor="#000000" barStyle="light-content" />
      <View style={styles.statusBarBlack} pointerEvents="none" />

      {/* BACKGROUND REEL UPLOAD — top-left percent indicator.
          Standalone component below re-renders on its own; ye line
          poore feed ko touch nahi karti. */}
      <UploadStatusBadge />



     <FlatList
     ref={scrollRef}
        style={{ height: listH, flexGrow: 0 }}
        data={videos}
        renderItem={renderItem}
        keyExtractor={feedKeyExtractor}
        pagingEnabled={Platform.OS === 'ios'}
        snapToInterval={listH}
        snapToAlignment="start"
        decelerationRate="fast"
disableIntervalMomentum={true}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewConfigRef.current}
        refreshControl={feedRefreshControl}

        /* removeClippedSubviews video surface ko baar-baar detach/attach
           karta tha (black flash + atakna) -> band. */
        removeClippedSubviews={false}
        windowSize={5}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        updateCellsBatchingPeriod={30}
        scrollEventThrottle={16}
        bounces={false}
        overScrollMode="never"
        directionalLockEnabled






        getItemLayout={getItemLayoutFn}
        initialScrollIndex={initialIndexRef.current}
      />



      {/* TOP BAR: Live icon | Discover | Follow | For You (Tiki style) */}
      <FeedTopBar
        activeTab={feedTab}
        onLive={onTopLive}
        onDiscover={onTopDiscover}
        onFollow={onTopFollow}
        onForYou={onTopForYou}
      />

      {showGrid && (feedTab === 'follow' || feedTab === 'discover') && (
        <TabGrid
          mode={feedTab}
          data={feedTab === 'follow' ? followList : discoverList}
          live={feedTab === 'follow' ? liveList : null}
          loading={gridLoading}
          onOpen={onGridOpen}
          onLive={onGridLiveOpen}
        />
      )}

  

{showStarPopup && (

<View
  style={{
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 9999,
  }}
>

  <Pressable
    style={StyleSheet.absoluteFill}
    onPress={() => setShowStarPopup(false)}
  />

  <View style={styles.starPopup}>

    <View style={styles.myStarBox}>

      <Image
        source={require('../../assets/star-logo.png')}
        style={styles.myStarImage}
      />

      <Text style={styles.myStarText}>
        {myStars}
      </Text>

    </View>

    <View style={styles.starRow}>

      <TouchableOpacity
        style={[
          styles.starCard,
          selectedStar === 1 && styles.activeStar
        ]}
        onPress={() => setSelectedStar(1)}
      >
        <Image
          source={require('../../assets/star-logo.png')}
          style={styles.popupStarImage}
        />

        <Text style={styles.starValue}>x1</Text>

      </TouchableOpacity>


      <TouchableOpacity
        style={[
          styles.starCard,
          selectedStar === 3 && styles.activeStar
        ]}
        onPress={() => setSelectedStar(3)}
      >
        <Image
          source={require('../../assets/star-logo.png')}
          style={styles.popupStarImage}
        />

        <Text style={styles.starValue}>x3</Text>

      </TouchableOpacity>


      <TouchableOpacity
        style={[
          styles.starCard,
          selectedStar === 10 && styles.activeStar
        ]}
        onPress={() => setSelectedStar(10)}
      >
        <Image
          source={require('../../assets/star-logo.png')}
          style={styles.popupStarImage}
        />

        <Text style={styles.starValue}>x10</Text>

      </TouchableOpacity>

    </View>

  

<TouchableOpacity
style={styles.starSubmitBtn}
onPress={async()=>{

const user=auth.currentUser;

if(!user) return;

if(!selectedStar){
Alert.alert("Select Star");
return;
}

if(myStars<selectedStar){
Alert.alert("Not enough Stars");
return;
}

// double tap se 2 baar star na jaye
if(starSending.current) return;
starSending.current=true;

const giftAmount=selectedStar;

try{


setShowStarPopup(false);

setStarAnimationCount(giftAmount);

setStarAnimationVideoId(selectedVideoId);

setSelectedStar(null);

playStarAnimation();


await callApi("/gift/video-star",{
videoId:selectedVideoId,
stars:giftAmount
});

// myStars wallet snapshot se khud update hota hai (manual minus se double minus hota tha)

}catch(e){

__DEV__ && console.log(e);
Alert.alert("Star", (e as any)?.message || "Could not send star");

}finally{

starSending.current=false;

}

}}
>




      <Text style={styles.starSubmitText}>
        StarUp
      </Text>
    </TouchableOpacity>

  </View>

</View>

)}



{showSharePopup && (

<View style={styles.sharePopupContainer}>

 <Pressable
  style={StyleSheet.absoluteFill}
  onPress={() => setShowSharePopup(false)}
/>

  <View style={styles.sharePopup}>

    <View style={styles.actionRow}>

      {/* Report */}
      <TouchableOpacity
  style={styles.reportBtn}
  onPress={() => {

    setShowSharePopup(false);

    router.push({
      pathname: "/report",
      params: {
        videoId: selectedShareVideo?.id
      }
    });

  }}
>


        <Text style={styles.reportText}>
          Report Video
        </Text>
      </TouchableOpacity>


      {/* Save */}
      <TouchableOpacity
        style={styles.saveBtn}
        onPress={() => {

          setShowSharePopup(false);

          // Save Video Logic

        }}
      >
        <Text style={styles.saveText}>
          Video Save
        </Text>
      </TouchableOpacity>

    </View>


    {/* Share */}
<View style={styles.shareRow}>

  {/* Share Video Button */}
  <TouchableOpacity
    style={styles.shareBtn}
    onPress={() => {

      setShowSharePopup(false);

      handleShare(
        selectedShareVideo.videoUrl,
        selectedShareVideo.id
      );

    }}
  >
    <Text style={styles.shareText}>
      Share Video
    </Text>
  </TouchableOpacity>


  {/* TopKing Logo */}
  <TouchableOpacity
    style={styles.logoBtn}
    onPress={() => {

      setShowSharePopup(false);

    router.push({
  pathname: "../ShareVideo",
  params: {
    videoId: selectedShareVideo?.id,

    videoUrl:
      selectedShareVideo?.videoUrl ||
      selectedShareVideo?.video,

    thumbnail:
      selectedShareVideo?.thumbnail,
  },
});

    }}
  >

    <Image
      source={require('../../assets/logo.png')}
      style={styles.shareLogo}
    />

  </TouchableOpacity>

</View>

  </View>

</View>

)}



{showComments && (

<View
  style={{
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 9999,
  }}
>

  {/* Fading backdrop */}
  <Animated.View
    pointerEvents="none"
    style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: commentBackdrop }]}
  />

  {/* Background press */}
  <Pressable
    style={StyleSheet.absoluteFill}

   onPress={closeComments}
  />

  {/* Bottom Sheet */}
  <Animated.View
style={[
styles.commentsSheet,
{
transform:[
{
translateY:commentAnim
}
]
}
]}
>

    {/* SIMPLE: sirf chhota handle -- caption / username / photo hata diya */}
    <View style={styles.commentHandleArea} {...commentPan.panHandlers}>
      <View style={styles.commentHandle} pointerEvents="none" />
    </View>

{commentsLoading ? (
  <View style={{ flex: 1, justifyContent: "center", alignItems: "center", marginTop: 20 }}>
    <ActivityIndicator size="large" color="#FFD700" />
  </View>
) : (
  <FlatList
    ref={commentListRef}
    data={comments}
    renderItem={renderComment}
    keyExtractor={commentKeyExtractor}
    style={{ flex: 1, marginTop: 6 }}
    contentContainerStyle={{ paddingBottom: 90 }}
    showsVerticalScrollIndicator={false}
    keyboardDismissMode="interactive"
    keyboardShouldPersistTaps="handled"
    removeClippedSubviews={false}
    initialNumToRender={10}
    maxToRenderPerBatch={8}
    windowSize={8}
    onEndReached={loadMoreComments}
    onEndReachedThreshold={0.5}
    ListEmptyComponent={CommentsEmpty}
  />
)}

    <Animated.View
style={[
styles.commentInputContainer,
{

transform:[
{
translateY:Animated.multiply(keyboardHeight,-1)
}
]


}
]}
>






      <View style={{ width: 35, height: 35, marginRight: 10 }}>
        <Image
          source={{ uri: currentUserData.photo }}
          style={[styles.commentProfile, { marginRight: 0 }]}
        />
        <AvatarFrame uid={auth.currentUser?.uid} size={35} animated={false} />
      </View>

    <TextInput
    ref={commentInputRef}
  onChangeText={onCommentChange}
  placeholder={replyingTo ? 'Add a reply...' : 'Add a comment...'}
  placeholderTextColor="#999"
  style={styles.commentInput}

  // Keyboard ke send button ko enable karega
  returnKeyType="send"

  // Keyboard khula rahega
  blurOnSubmit={false}

  // Keyboard ka send button dabane par
  onSubmitEditing={() => {
    if (commentTextRef.current.trim()) {
      postComment();
    }
  }}
/>

      <TouchableOpacity onPress={postComment}>
        <Ionicons
          name="send"
          size={24}
          color="#FFD700"
        />
      </TouchableOpacity>

</Animated.View>


    </Animated.View>

  

</View>




)}


      <BottomBar pathname={pathname} onLayout={onNavLayout} />
    </View>
  );
}

const STATUS_BAR_H =
  Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 50;

const styles = StyleSheet.create({
  statusBarBlack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: STATUS_BAR_H,
    backgroundColor: '#000000',
    zIndex: 6,
    elevation: 6,
  },
  uploadBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 55 : 40,
    left: 14,
    zIndex: 1000,
    elevation: 20,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 74,
  },
  uploadBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  uploadBadgeErrorText: {
    color: '#ff5e5e',
    fontSize: 12,
    fontWeight: '700',
  },
  uploadBadgeTrack: {
    width: 60,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  uploadBadgeFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#FF5E00',
  },

  loadingBox: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  fullScreenOverlay: { flex: 1, backgroundColor: '#000' },
  video: {
  ...StyleSheet.absoluteFillObject,
},
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.1)' },

  bottomLeft:  {
  position: 'absolute',

  left: 12,

  bottom: 120,      // niche se kitna upar

  width: width * 0.7,

  zIndex: 999,
},


  userName: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 2 },
  caption: { color: '#ffffff', fontSize: 14, marginTop: 5, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 1 },




musicRow:{
flexDirection:"row",
alignItems:"center",
marginTop:10,
},

musicDiscOuter:{
marginRight:10,
},

vinylDisc:{
width:37,
height:37,
borderRadius:19,
backgroundColor:"#111",
justifyContent:"center",
alignItems:"center",

borderWidth:2,
borderColor:"#444",

shadowColor:"#000",
shadowOpacity:0.6,
shadowRadius:8,
shadowOffset:{
width:0,
height:4,
},

elevation:8,
},

musicCenterImage:{
width:26,
height:26,
borderRadius:13,
},

musicDot:{
position:"absolute",
width:2,
height:2,
borderRadius:3,
backgroundColor:"#fff",
},


  bufferSpinner: { position: 'absolute', top: '50%', left: 0, right: 0, alignItems: 'center', zIndex: 5 },

  rightIcons:  {
  position: 'absolute',

  right: 1,

  bottom: 110,   // video ke niche se kitna upar

  alignItems: 'center',

  zIndex: 999,
},


  iconBox: { marginBottom: 14, alignItems: 'center' },
  iconShadow: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  iconText: { color: '#ffffff', fontWeight: '700', marginTop: 2, fontSize: 14, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  profileImage: { width: 50, height: 50, borderRadius: 18, borderWidth: 1.5, borderColor: '#ffffff' },
  profileImageLive: { borderWidth: 3, borderColor: '#FFD700' },
  liveTagFeed: {
    zIndex: 30,        // frame (zIndex 5) ke UPAR dikhe
    elevation: 30,     // Android me bhi upar
    position: 'absolute',
    top: -7,
    alignSelf: 'center',
    backgroundColor: '#FF2D55',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#fff',
  },
  liveTagFeedText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },

 plusIconSmall:{

position:'absolute',

bottom:-8,

alignSelf:'center',

backgroundColor:'#FFD700',

width:27,

height:20,

borderRadius:8,

justifyContent:'center',

alignItems:'center',

zIndex:9999,

},

  starImage: { width: 65, height: 65, resizeMode: 'contain' },
  starUpText: { color: '#fffef7', fontSize: 13, fontWeight: 'bold', marginTop: 0, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 2 },
  gridRoot: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#000', zIndex: 5 },
  gridMeta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: 'rgba(0,0,0,0.35)' },
  gridAvatar: { width: 26, height: 26, borderRadius: 13, marginRight: 6, backgroundColor: '#333' },
  gridName: { color: '#fff', fontSize: 12, fontWeight: '700' },
  gridTime: { color: 'rgba(255,255,255,0.75)', fontSize: 10 },
  gridCaption: { position: 'absolute', left: 8, bottom: 6, right: 8, color: '#fff', fontSize: 11, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  gridEmpty: { color: 'rgba(255,255,255,0.8)', fontSize: 15, textAlign: 'center', marginTop: 120, paddingHorizontal: 40 },
  liveBubble: { alignItems: 'center', marginRight: 12, width: 70 },
  liveRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2.5, borderColor: '#FFEB00', justifyContent: 'center', alignItems: 'center' },
  liveImg: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#333' },
  liveBadge: { position: 'absolute', bottom: -6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  liveBadgeText: { color: '#000', fontSize: 9, fontWeight: '800' },
  liveName: { color: '#fff', fontSize: 11, marginTop: 8 },
  topBar: { position: 'absolute', top: Platform.OS === 'ios' ? 62 : 42, left: 0, right: 0, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  topLiveBtn: { position: 'absolute', left: 16, top: 6, width: 30, height: 28, justifyContent: 'center', alignItems: 'center' },
  topTabsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  topTabBtn: { marginHorizontal: 14, alignItems: 'center' },
  topTabText: { color: 'rgba(255,255,255,0.75)', fontSize: 17, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  topTabTextActive: { color: '#ffffff' },
  topTabUnderline: { width: 26, height: 3, backgroundColor: '#FFEB00', marginTop: 3, borderRadius: 2 },
  topTabsContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 30, width: width, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  tabText: { color: '#ffffff', fontSize: 18, marginHorizontal: 15, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  activeUnderline: { width: 30, height: 3, backgroundColor: '#ffffff', alignSelf: 'center', marginTop: 2, borderRadius: 2 },
  separator: { width: 1, height: 15, backgroundColor: 'rgba(255,255,255,0.4)' },
  
  // Custom Styles matched with standard messages layout structure
  bottomSection: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#000', borderTopWidth: 0.5, borderTopColor: '#222' },
  bottomNavContainer: { width: '100%', height: 60, justifyContent: 'center', marginBottom: Platform.OS === 'ios' ? 10 : 20 },
  bottomNav: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plusBtn: { backgroundColor: '#f1c40f', width: 48, height: 35, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  plusText: { fontSize: 28, fontWeight: 'bold', color: '#000', marginTop: -4 },
  // Seek bar (menu se chipka peela line)
  seekWrap: { width: '100%', height: 10, justifyContent: 'flex-start' },
  seekTrack: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  seekTrackActive: { height: 6 },
  seekFill: { height: '100%', backgroundColor: '#f1c40f' },
  seekThumb: { position: 'absolute', top: -4, marginLeft: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: '#f1c40f' },
  seekTimeBox: { position: 'absolute', bottom: '100%', left: 0, right: 0, alignItems: 'flex-end', paddingRight: 10, paddingBottom: 4 },
  seekTimeSmall: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  seekTimeBig: { color: '#fff', fontSize: 20, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 4, paddingBottom: 6 },
  bottomFill: { backgroundColor: '#000', width: '100%', height: Platform.OS === 'ios' ? 35 : 15 },

commentsSheet:{

width:'100%',

height:height*0.70,

backgroundColor:'#000',

borderTopLeftRadius:25,

borderTopRightRadius:25,
overflow:'hidden',
},
commentHandleArea: {
  width: '100%',
  paddingTop: 2,
  paddingBottom: 12,
},
commentHandle: {
  alignSelf: 'center',
  width: 40,
  height: 4,
  borderRadius: 2,
  backgroundColor: '#444',
  marginTop: 10,
},
commentInputContainer: {
  position: 'absolute',
  bottom: 45,
  left: 10,
  right: 10,
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#111',
  borderRadius: 30,
  paddingHorizontal: 10,
  paddingVertical: 8,
},

commentProfile: {
  width: 35,
  height: 35,
  borderRadius: 18,
  marginRight: 10,
},

commentInput: {
  flex: 1,
  color: '#fff',
  fontSize: 15,
},

heartPopup: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 9999,
  transform: [{ scale: 1.2 }],
},

starPopupContainer: {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: height,
  backgroundColor: 'rgba(0,0,0,0.4)',
  justifyContent: 'flex-end',
  zIndex: 9999,
},

starPopup: {
  width: '100%',
  height: 290,

  backgroundColor: '#111',

  borderTopLeftRadius: 25,
  borderTopRightRadius: 25,

  paddingTop: 20,
  paddingHorizontal: 20,
},

popupTitle: {
  color: '#fff',
  fontSize: 18,
  fontWeight: 'bold',
  textAlign: 'center',
  marginBottom: 20,
},

starOption: {
  backgroundColor: '#222',
  padding: 15,
  borderRadius: 12,
  marginBottom: 10,
},

starText: {
  color: '#FFD700',
  textAlign: 'center',
  fontWeight: 'bold',
  fontSize: 18,
},

starSubmitBtn: {
  backgroundColor: '#FFD700',
  paddingVertical: 14,
  borderRadius: 30,
  marginTop: 30,
  alignSelf: 'center',
  width: 180,
},

starSubmitText: {
  color: '#000',
  fontWeight: 'bold',
  textAlign: 'center',
},

starRow: {
  flexDirection: 'row',
  justifyContent: 'space-around',
  marginTop: -23,
},

starCard: {
  width: 90,
  height: 100,
  backgroundColor: 'transparent',
  borderRadius: 20,
  justifyContent: 'center',
  alignItems: 'center',
},

activeStar: {
  borderWidth: 3,
  borderColor: '#FFD700',

  shadowColor: '#FFD700',
  shadowOpacity: 1,
  shadowRadius: 15,
  elevation: 15,
},

starNumber: {
  fontSize: 30,
},

starValue: {
  color: '#272725',
  fontWeight: 'bold',
  fontSize: 15,
  marginTop: -45,   // upar layega
},

popupStarImage: {
  width: 90,
  height: 90,
  resizeMode: 'contain',
 marginTop: -15, 

},

myStarBox: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 20,
   top: -10,
  left: 0,
},

myStarImage: {
  width: 40,
  height: 40,
  resizeMode: 'contain',
},

myStarText: {
  color: '#f5e900',
  fontSize: 24,
  fontWeight: 'bold',
  marginLeft: -0,
},

sharePopupContainer: {
position: 'absolute',
left: 0,
right: 0,
bottom: 40,
height: height,
backgroundColor: 'rgba(0,0,0,0.5)',
justifyContent: 'flex-end',
zIndex: 9999,
},

sharePopup: {
backgroundColor: '#111',
borderTopLeftRadius: 20,
borderTopRightRadius: 20,
padding: 30,
},



shareBtn:{
  backgroundColor:'#FFD700',

  width:230,          // button ki lambai
  height:45,          // button ki unchai

  borderRadius:20,

  justifyContent:'center',
  alignItems:'center',

  marginLeft:5,      // left-right move
  marginRight:0,

  marginTop:0,        // upar-niche move
  marginBottom:0,
},

shareText: {
color: '#000',
fontWeight: 'bold',
fontSize: 18,
textAlign: 'center',
},


actionRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  marginBottom: 15,
},

reportBtn: {
  backgroundColor: '#ff3333',
  width: '48%',
  paddingVertical: 10,
  borderRadius: 12,
},

saveBtn: {
  backgroundColor: '#3498db',
  width: '48%',
  paddingVertical: 10,
  borderRadius: 12,
},

reportText: {
  color: '#fff',
  fontWeight: 'bold',
  textAlign: 'center',
  fontSize: 14,
},

saveText: {
  color: '#fff',
  fontWeight: 'bold',
  textAlign: 'center',
  fontSize: 14,
},

shareRow:{
  flexDirection:'row',
  alignItems:'center',
  justifyContent:'space-between',
  marginTop:10,
},

logoBtn:{
  width:60,
  height:60,
  borderRadius:45,      // gola banayega
  overflow:'hidden',    // image ko circle ke andar rakhega
  justifyContent:'center',
  alignItems:'center',
  backgroundColor:'#000',
},

shareLogo:{
  width:100,
  height:100,
  borderRadius:25,     // image ko gol karega
  resizeMode:'cover',  // poora circle fill karega
},


userRow: {
  flexDirection: "row",
  alignItems: "center",
},

badge: {
  marginLeft: 5,
  width: 18,
  height: 18,
  justifyContent: "center",
  alignItems: "center",
  position: "relative",
},

badgeTick: {
  position: "absolute",
  top: 4.6,
  left: 4.2,
},

musicTextContainer:{
flex:1,
overflow:"hidden",
},

musicText:{
color:"#fff",
fontSize:13,
fontWeight:"600",
width:400,
},


});   