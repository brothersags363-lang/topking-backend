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
import { videoLink } from '../../utils/shareLinks';

import { getAuth, onAuthStateChanged } from 'firebase/auth';

// Background reel-upload progress (post.tsx isko start karta hai,
// ye screen sirf isko "sunti" hai — jahan bhi user ho, yahi dikhega)
// File app/ ke BAHAR services/upload/ me hai, isliye '@/...' alias use kiya.
import { useUploadState } from '@/services/upload/uploadManager';



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

  // Popular video: chhota bonus (max 12)
  score += Math.min(12, Math.log10(1 + (video.engagementScore || 0)) * 4);

  // Random jitter: same level ke videos ka order har baar alag
  score += Math.random() * 45;

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
  allowRecentSeen = false
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

  while (queue.length > 0) {
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
const PRELOAD_BEHIND = 1;
const PRELOAD_AHEAD = 2; // SPEED: agle 2 videos ke player pehle se ready

const ACTIVE_BUFFER = {
  maxBufferBytes: 20 * 1024 * 1024,
  preferredForwardBufferDuration: 10,
  minBufferForPlayback: 1, // SPEED: 2 -> 1, video jaldi shuru
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
  maxBufferBytes: 4 * 1024 * 1024,
  preferredForwardBufferDuration: 4,
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
    const t = setInterval(tick, 100);
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
    const t = setInterval(save, 1000);
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
      player.play();
    } else {
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
        onFirstFrameRender={() => setReady(true)}
      />
      {!ready && thumbnail ? (
        <ExpoImage source={thumbnail} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" pointerEvents="none" />
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
  item,
  index,
  shouldRenderVideo,
  nearVideo,
  isVideoActive,
  isCurrent,
  showHeart,
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

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={{ width, height: height, backgroundColor: '#000' }}
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
        <ExpoImage source={item.thumbnail} style={{ width, height, backgroundColor: "#000" }} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <View
          style={{
            width,
            height,
            backgroundColor: "#000"
          }}
        />
      )}

      {showHeart && (
        <View style={styles.heartPopup}>
          <Ionicons
            name="heart"
            size={140}
            color="#ff004f"
          />
        </View>
      )}

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

          {item.verified && (
            <View style={styles.badge}>
              <MaterialCommunityIcons
                name="check-decagram"
                size={17}
                color={
                  item?.verifiedColor === "yellow"
                    ? "#FFD700"
                    : "#ffffff"
                }
              />
              <Ionicons
                name="checkmark"
                size={10}
                color="#131212"
                style={styles.badgeTick}
              />
            </View>
          )}
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
                transform: [
                  {
                    rotate: rotateAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "360deg"],
                    }),
                  },
                ],
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

        <TouchableOpacity style={styles.iconBox} onPress={() => onLike(item.id)}>
          <Ionicons name="heart" size={44} color={isLiked ? "#ff2d55" : "#ffffff"} style={styles.iconShadow} />
          <Text style={styles.iconText}>{formatCount(item.likes)}</Text>
        </TouchableOpacity>

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
      </TouchableOpacity>

      <View style={cs.body}>
        <View style={cs.nameRow}>
          <Text style={cs.name}>{item.username}</Text>
          {item.verified ? (
            <MaterialCommunityIcons
              name="check-decagram"
              size={17}
              color={item.verifiedColor === 'yellow' ? '#FFD700' : '#ffffff'}
              style={cs.badge}
            />
          ) : null}
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
                <ExpoImage
                  source={{ uri: reply.profilePic || AVATAR_FALLBACK }}
                  style={cs.replyAvatar}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={0}
                />

                <View style={cs.replyBody}>
                  <View style={cs.nameRow}>
                    <Text style={cs.replyName}>{reply.username}</Text>
                    {reply.verified ? (
                      <MaterialCommunityIcons
                        name="check-decagram"
                        size={15}
                        color={reply.verifiedColor === 'yellow' ? '#FFD700' : '#ffffff'}
                        style={cs.badge}
                      />
                    ) : null}
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


export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
const [showSharePopup, setShowSharePopup] = useState(false);
const [selectedShareVideo, setSelectedShareVideo] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeVideo, setActiveVideo] = useState(0);
  const [currentIndex,setCurrentIndex]=useState(0);
  // SMOOTH SCROLL: naye video players (native decoder) swipe ke BEECH me nahi,
  // swipe rukne ke baad mount hote hain -> scroll animation me jhatka nahi.
  const [mountIndex, setMountIndex] = useState(0);
  const mountTimeoutRef = useRef(null);
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

      const videoIds = nearbyVideos
        .map(video => video.id)
        .filter(Boolean);

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
                userId !== user.uid
            )
        )
      ];


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

      console.log(
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
    if (viewTimeout.current) clearTimeout(viewTimeout.current);
    if (heartTimeout.current) clearTimeout(heartTimeout.current);
  };
}, []);


  const [showComments, setShowComments] = useState(false);
const commentAnim = useRef(new Animated.Value(height)).current;

const keyboardHeight = useRef(new Animated.Value(0)).current;

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

const [currentUserData, setCurrentUserData] = useState({
  // name shuru me KHALI: "User" default se galat naam se comment jata tha
  name: '',
  photo: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
  verified: false,
  verifiedColor: '',
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
      }),

      Animated.timing(textAnim,{
        toValue:0,
        duration:0,
        useNativeDriver:true,
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
  feedCache = { videos, index: currentIndex, savedAt: Date.now() };
}, [videos, currentIndex]);

const toVideo = (docItem) => {
  const data = docItem.data();
  return {
    id: docItem.id,
    ...data,
    verified: data.verified || false,
    verifiedColor: data.verifiedColor || "",
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
  return sessionRef.current;
};

// Ek page ke docs pool me daalo (duplicate / blocked / hidden skip)
const ingestSnap = (snap) => {
  if (!snap || snap.empty) {
    exhaustedRef.current = true;
    return;
  }
  lastVideoDocRef.current = snap.docs[snap.docs.length - 1];
  snap.forEach((docItem) => {
    if (fetchedIdsRef.current.has(docItem.id)) return;
    fetchedIdsRef.current.add(docItem.id);
    if (!isAllowedVideo(docItem.data())) return;
    poolRef.current.push(toVideo(docItem));
  });
  if (snap.docs.length < PAGE_SIZE) exhaustedRef.current = true;
};

const countUnseen = () =>
  poolRef.current.reduce((n, v) => (seenRef.current[v.id] ? n : n + 1), 0);

// Pool me kam se kam `minUnseen` unseen video hone tak pages padho.
// Chain se serialize hota hai -> do jagah se ek saath same page nahi aata.
const ensurePool = (minUnseen, session) => {
  const run = async () => {
    let guard = 0;
    while (
      session === sessionRef.current &&
      countUnseen() < minUnseen &&
      !exhaustedRef.current &&
      guard < 25
    ) {
      const snap = await fetchVideoPage(lastVideoDocRef.current);
      if (session !== sessionRef.current) return;
      ingestSnap(snap);
      guard++;
    }
  };
  fillChainRef.current = fillChainRef.current.then(run, run);
  return fillChainRef.current;
};

// Pool ko rank karo, top `n` nikalo (user-gap ke saath)
const pullFromPool = (n, previous) => {
  const lastTop = previous.length === 0 ? lastTopIdRef.current : null;
  let ranked = rankFeed(poolRef.current, seenRef.current, previous, lastTop);

  // Feed bilkul khali na rahe: agar koi naya/purana video hi nahi bacha
  // (sab 3 din ke andar dekhe hue), to sabse purana dekha hua dikhao.
  if (
    ranked.length === 0 &&
    previous.length === 0 &&
    exhaustedRef.current &&
    poolRef.current.length > 0
  ) {
    ranked = rankFeed(poolRef.current, seenRef.current, previous, null, true);
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
      console.log("Firebase Video Error:", error);
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
    console.log("Refresh Videos Error:", error);
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
    console.log("Load More Videos Error:", error);
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
        console.log("Wallet Stars Load Error:", error);
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
        console.log("Wallet Stars Realtime Error:", error);
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

  const show = Keyboard.addListener(
    "keyboardDidShow",
    (e) => {

      Animated.timing(keyboardHeight,{
        toValue:e.endCoordinates.height,
        duration:250,
        useNativeDriver:false,
      }).start();

    }
  );

  const hide = Keyboard.addListener(
    "keyboardDidHide",
    ()=>{

      Animated.timing(keyboardHeight,{
        toValue:0,
        duration:250,
        useNativeDriver:false,
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
            speed:15,
            bounciness:4
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
      console.log("Comment Load Error", error);
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
      console.log("Like Firebase Error:", e);
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
    console.log("Follow Error:", e);
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

  // Heart animation
  setHeartVideoId(videoId);

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

const handleDoubleTapLikeRef = useRef(handleDoubleTapLike);
handleDoubleTapLikeRef.current = handleDoubleTapLike;
const onDoubleTapLike = useCallback((videoId) => handleDoubleTapLikeRef.current(videoId), []);

// Single tap = play/pause, double tap = like. lastTap/tapTimeout
// refs hain (already stable), aur setPausedVideoId React ka setState
// hai (hamesha stable), isliye ye callback bhi hamesha stable rehta hai.
const onItemPress = useCallback((videoId) => {
  const now = Date.now();

  if (lastTap.current && (now - lastTap.current) < 300) {
    if (tapTimeout.current) {
      clearTimeout(tapTimeout.current);
      tapTimeout.current = null;
    }
    lastTap.current = null;
    onDoubleTapLike(videoId);
    return;
  }

  lastTap.current = now;

  tapTimeout.current = setTimeout(() => {
    tapTimeout.current = null;
    lastTap.current = null;
    setPausedVideoId(prev => (prev === videoId ? null : videoId));
  }, 300);
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
const onOpenComments = useCallback((item) => {
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
  });
  setShowComments(true);
}, []);

const onOpenShare = useCallback((item) => {
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
    } catch (e) { console.log("Share Error", e); }
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

            console.log(error);

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

            console.log("Reply delete error",e);

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
    console.log('Comment Error:', error);
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
      console.log('Notification Error:', e);
    }
  })();
};


const postReply = async () => {
  const user = auth.currentUser;
  if (!user) return;

  const text = commentTextRef.current.trim();
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
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'all_videos', videoId), {
      commentsCount: increment(1),
      engagementScore: increment(1),
    });

    await batch.commit();
  } catch (error) {
    console.log("Reply Error:", error);
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

    // requestIdleCallback hata diya: wo play shuru hone me delay
    // karta tha. Ab video turant chalta hai.
    setCurrentIndex(index);
    setActiveVideo(index);
    setPausedVideoId(null);

    // Players ka window swipe settle hone ke baad badlo (heavy mount scroll me nahi)
    if (mountTimeoutRef.current) clearTimeout(mountTimeoutRef.current);
    mountTimeoutRef.current = setTimeout(() => {
      setMountIndex(index);
    }, 120); // SPEED: 250 -> 120, agla video jaldi ready

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


 const viewConfigRef = useRef({
  // 50%: video thoda pehle chalna shuru (60 me delay lagta tha)
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 0,
});

  const getIconColor = (path) => pathname === path ? '#3498db' : '#ffffff';



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
  const isVideoActive = isFocused && activeVideo === index && pausedVideoId !== item.id;
  // Pichla 1 + agle 3 videos ke player pehle se ready rakho:
  // scroll karte hi video turant chalega (na ruka, na black screen).
  const shouldRenderVideo =
    isFocused &&
    (index === currentIndex ||
      (index >= mountIndex - PRELOAD_BEHIND && index <= mountIndex + PRELOAD_AHEAD));
  const nearVideo = index === currentIndex + 1;
  const isCurrent = activeVideo === index;

  return (
    <VideoItem
      item={item}
      index={index}
      shouldRenderVideo={shouldRenderVideo}
      nearVideo={nearVideo}
      isVideoActive={isVideoActive}
      isCurrent={isCurrent}
      showHeart={heartVideoId === item.id}
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
  activeVideo,
  currentIndex,
  mountIndex,
  isFocused,
  pausedVideoId,
  heartVideoId,
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
    <View style={styles.fullScreenOverlay}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* BACKGROUND REEL UPLOAD — top-left percent indicator.
          Standalone component below re-renders on its own; ye line
          poore feed ko touch nahi karti. */}
      <UploadStatusBadge />



     <FlatList
     ref={scrollRef}
        data={videos}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        pagingEnabled
        snapToInterval={height}
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
        maxToRenderPerBatch={2}
        updateCellsBatchingPeriod={30}
        overScrollMode="never"
        scrollEventThrottle={16}
        directionalLockEnabled






        getItemLayout={getFeedItemLayout}
        initialScrollIndex={initialIndexRef.current}
      />



      {/* TOP TABS CONTAINER - LINKED WITH all-live SCREEN */}
      <View style={styles.topTabsContainer}>
          <TouchableOpacity onPress={() => router.push('/all-live')}>
            <Text style={styles.tabText}>🎥 Live</Text>
          </TouchableOpacity>
          
          <View style={styles.separator} />
          
          <TouchableOpacity>
            <Text style={[styles.tabText, { fontWeight: 'bold' }]}>For You</Text>
            <View style={styles.activeUnderline} />
          </TouchableOpacity>
      </View>

  

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

console.log(e);
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 9999,
  }}
>

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

    {selectedVideoData && (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 15,
          marginBottom: 15,
          borderBottomWidth: 0.5,
          borderBottomColor: '#333',
          paddingBottom: 12,
        }}
      >

        <Image
          source={{
            uri:
              selectedVideoData.profile ||
              'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
          }}
          style={{
            width: 45,
            height: 45,
            borderRadius: 22,
          }}
        />

        <View
          style={{
            marginLeft: 10,
            flex: 1,
          }}
        >

          

<View
  style={{
    flexDirection: "row",
    alignItems: "center",
  }}
>
  <Text
    style={{
      color: "#fff",
      fontWeight: "bold",
      fontSize: 15,
    }}
  >
    @{selectedVideoData.username}
  </Text>




{selectedVideoData?.verified && (
<View
  style={{
    marginLeft: 5,
    width: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  }}
>
  <MaterialCommunityIcons
  name="check-decagram"
  size={17}
  color={
  selectedVideoData?.verifiedColor === "yellow"
    ? "#FFD700"
    : "#ffffff"
}
/>

  

</View>

)}

   
</View>


          <Text
            style={{
              color: '#ccc',
              marginTop: 3,
            }}
            numberOfLines={2}
          >
            {selectedVideoData.caption}
          </Text>

        </View>

      </View>
    )}



{commentsLoading ? (
  <View style={{ flex: 1, justifyContent: "center", alignItems: "center", marginTop: 20 }}>
    <ActivityIndicator size="large" color="#FFD700" />
  </View>
) : (
  <FlatList
    data={comments}
    renderItem={renderComment}
    keyExtractor={commentKeyExtractor}
    style={{ flex: 1, marginTop: 20 }}
    contentContainerStyle={{ paddingBottom: 80 }}
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






      <Image
        source={{ uri: currentUserData.photo }}
        style={styles.commentProfile}
      />

    <TextInput
    ref={commentInputRef}
  onChangeText={onCommentChange}
  placeholder={
  replyingTo
    ? `Reply to @${replyingTo.username}`
    : currentUserData.name
    ? `Comment as ${currentUserData.name}...`
    : 'Add a comment...'
}
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


      <View style={styles.bottomSection}>
        <VideoSeekBar />
        <View style={styles.bottomNavContainer}>
          <View style={styles.bottomNav}>
            
            {/* HOME */}
            <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/')}>
              <Ionicons name="home-outline" size={26} color={getIconColor('/')} />
            </TouchableOpacity>

            {/* SEARCH */}
            <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/explore')}>
              <Ionicons name="search" size={26} color={getIconColor('/explore')} />
            </TouchableOpacity>

            {/* CENTER PLUS BUTTON */}
            <View style={styles.navItem}>
              <TouchableOpacity style={styles.plusBtn} onPress={() => router.push('/camera')}>
                <Text style={styles.plusText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* MESSAGES TAB (Synced Icon Style) */}
            <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/messages')}>
              <Ionicons name="chatbubble-ellipses" size={26} color={getIconColor('/messages')} />
            </TouchableOpacity>

            {/* PROFILE */}
         <TouchableOpacity
  style={styles.navItem}
  onPress={() => {
    const user = auth.currentUser;

    if (!user) {
      router.push('/login');
      return;
    }

    router.replace('/profile');
  }}
>
  <Ionicons
    name="person-outline"
    size={26}
    color={getIconColor('/profile')}
  />
</TouchableOpacity>

          </View>
        </View>
        <View style={styles.bottomFill} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  width: '100%',
  height: '89%',
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