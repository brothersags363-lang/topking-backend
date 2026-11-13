import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, memo } from 'react';
import { useBlockedIds } from '../utils/useBlockedIds';

import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { scopedBackHandler } from '../utils/scopedBack';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from 'expo-router';
import { useRouter } from '../utils/safeRouter';
import { listenRecentRooms } from '../utils/recentRooms';
import useSwipeTabs from '../utils/useSwipeTabs';

import AppBottomNav from "../components/AppBottomNav";

let db;

try {
  const firebaseModule = require('./firebaseConfig');
  db = firebaseModule.db;
} catch (e) {
  try {
    const firebaseModuleFallback = require('../firebaseConfig');
    db = firebaseModuleFallback.db;
  } catch (err) {
    __DEV__ && console.log("Firebase config file not found.");
  }
}

import { collection, doc, onSnapshot } from 'firebase/firestore';

const { width } = Dimensions.get('window');

// ------------------------------------
// LAYOUT
// ------------------------------------

const SIDE_PADDING = 16;
const CARD_GAP = 12;
const CARD_WIDTH = (width - SIDE_PADDING * 2 - CARD_GAP) / 2;
const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.28);
const BANNER_WIDTH = width - 32;

// ------------------------------------
// FALLBACKS
// ------------------------------------

const STABLE_DEFAULT_BANNER = 'https://picsum.photos/seed/livecover/400/400';
const STABLE_DEFAULT_AVATAR = 'https://avatar.iran.liara.run/public/65';

// ------------------------------------
// SETTINGS
// ------------------------------------

// Host LiveRoom se har ~20 sec me `hostHeartbeat` likhta hai.
const HEARTBEAT_TIMEOUT = 10 * 60 * 1000;
const HEARTBEAT_CHECK_INTERVAL = 30 * 1000;

// List ko itni der me ek hi baar update karte hain (gifts ki barish me
// har snapshot par re-render + re-sort nahi hota => taps turant chalte hain).
const LIST_FLUSH_MS = 1500;

// Ek tap ke baad itni der tak dusra tap ignore (4-5 baar tap = 4-5 LiveRoom
// ek ke upar khul jate the, isi se app hang hota tha).
const OPEN_LOCK_MS = 1500;

// ------------------------------------
// BANNERS
// ------------------------------------

const TRENDING_BANNERS_DATA = [
  require('../assets/images/banner1.jpeg'),
  require('../assets/images/banner2.png'),
  require('../assets/images/banner3.jpeg'),
  require('../assets/images/banner4.png'),
  require('../assets/images/banner5.png'),
  require('../assets/images/banner6.png'),
];

// ------------------------------------
// HELPERS
// ------------------------------------

const fmtCount = (n = 0) =>
  n >= 1000000
    ? (n / 1000000).toFixed(1).replace('.0', '') + 'M'
    : n >= 1000
      ? (n / 1000).toFixed(1).replace('.0', '') + 'K'
      : String(n);

const getTimeInMilliseconds = (value) => {
  if (!value) return 0;
  try {
    if (typeof value === 'number') return value;
    if (typeof value === 'object' && value.seconds) return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return isNaN(parsed) ? 0 : parsed;
  } catch (error) {
    return 0;
  }
};

// LiveRoom `hostHeartbeat` likhta hai (purana naam `lastHeartbeat`).
const getHeartbeatMs = (rawData) =>
  getTimeInMilliseconds(rawData.hostHeartbeat) ||
  getTimeInMilliseconds(rawData.lastHeartbeat);

const isRoomAlive = (rawData) => {
  const currentStatus = rawData.status
    ? String(rawData.status).toLowerCase().trim()
    : '';

  if (
    currentStatus === 'ended' ||
    currentStatus === 'inactive' ||
    currentStatus === 'closed'
  ) {
    return false;
  }

  const heartbeatTime = getHeartbeatMs(rawData);
  if (!heartbeatTime) return true;

  return Date.now() - heartbeatTime <= HEARTBEAT_TIMEOUT;
};

const validUrl = (v) =>
  typeof v === 'string' && v.trim().length > 10 ? v.trim() : null;

// Asli DP sirf wahi jo user ne khud lagayi ho. Default/random placeholder images "DP nahi" maani jaati hain
// -> card par random photo ki jagah user (person) icon dikhega.
const NO_DP_RE = /avatar\.iran\.liara\.run|ui-avatars\.com|picsum\.photos/i;
const realDp = (v) => {
  const u = validUrl(v);
  return u && !NO_DP_RE.test(u) ? u : null;
};

// ------------------------------------
// LIVE USER PROFILE (users/{uid}) - dp / naam badalte hi card turant badle
// ------------------------------------
// Ek uid ka ek hi listener (kai card/seat share karte hain). Koi sun-ne wala na bache to listener band.
const profileStore = new Map(); // uid -> { data, subs:Set, unsub }

const subscribeProfile = (uid, cb) => {
  let entry = profileStore.get(uid);
  if (!entry) {
    entry = { data: null, subs: new Set(), unsub: null };
    profileStore.set(uid, entry);
    const e = entry;
    try {
      e.unsub = onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          const d = snap.exists() ? snap.data() : {};
          e.data = {
            img: realDp(d.profileImg) || realDp(d.photoURL),
            name: d.username || d.name || null,
          };
          e.subs.forEach((fn) => fn(e.data));
        },
        () => {}
      );
    } catch (err) {}
  }
  entry.subs.add(cb);
  if (entry.data) cb(entry.data);
  return () => {
    entry.subs.delete(cb);
    if (entry.subs.size === 0) {
      try { entry.unsub && entry.unsub(); } catch (err) {}
      if (profileStore.get(uid) === entry) profileStore.delete(uid);
    }
  };
};

const useUserProfile = (uid, enabled = true) => {
  const [p, setP] = useState(() => (uid ? profileStore.get(uid)?.data || null : null));
  useEffect(() => {
    if (!uid || !db || !enabled) return undefined;
    return subscribeProfile(uid, setP);
  }, [uid, enabled]);
  return p;
};

// DP ho to photo, nahi ho to user (account) icon
const DpAvatar = memo(function DpAvatar({ uri, style, iconSize = 18 }) {
  if (uri) return <Image source={{ uri }} style={style} fadeDuration={0} />;
  return (
    <View style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#2b2b2b' }]}>
      <Ionicons name="person" size={iconSize} color="rgba(255,255,255,0.6)" />
    </View>
  );
});

// Sab se zyada star pane wala broadcaster upar; barabar ho to naya room pehle.
const compareStreams = (a, b) => {
  if (b.stars !== a.stars) return b.stars - a.stars;
  return b.createdAt - a.createdAt;
};

const sameList = (a, b) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

// Ek room doc -> card ka data (ya null agar dikhana nahi hai)
const parseRoom = (docId, rawData, now) => {
  if (!isRoomAlive(rawData)) return null;
  if ((rawData.roomType || 'public') !== 'public') return null;

  const roomTime = getTimeInMilliseconds(rawData.createdAt);
  if (roomTime && now - roomTime > 24 * 60 * 60 * 1000) return null;

  const hostImg = realDp(rawData.hostImg) || realDp(rawData.profileImg);
  // Room banner: host ne alag cover lagaya ho to wahi. Cover agar host ki (purani) DP ki copy hai
  // (LiveStart me default cover = host DP) to use custom nahi maante -> card live DP dikhayega.
  const rawCover =
    realDp(rawData.roomCover) ||
    realDp(rawData.cover) ||
    realDp(rawData.banner) ||
    realDp(rawData.roomImg);
  const cover = rawCover && rawCover !== validUrl(rawData.hostImg) && rawCover !== validUrl(rawData.profileImg)
    ? rawCover
    : null;

  const hostId = rawData.hostId || rawData.seatsData?.seat_1?.userId || null;

  // LiveRoom gift par `seatStars.{uid}` badhata hai -> host ke stars yahan se.
  const stars = hostId ? Math.max(0, Number(rawData.seatStars?.[hostId]) || 0) : 0;

  return {
    id: docId,
    hostId,
    title: rawData.title || rawData.roomName || 'Live Broadcast',
    host: rawData.hostName || rawData.host || 'User',
    type: String(rawData.type || 'audio').toLowerCase(),
    users: Math.max(0, Number(rawData.viewerCount) || 0),
    stars,
    roomCover: cover,
    hostImg: hostImg || null,
    createdAt: roomTime,
    layout: String(rawData.roomLayout || 'chat').toLowerCase(),
    seats: Object.keys(rawData.seatsData || {})
      .sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]))
      .slice(0, 9)
      .map((k) => {
        const st = rawData.seatsData[k] || {};
        return { uid: st.userId || null, img: realDp(st.userImg), taken: !!st.userId, muted: !!st.isMuted };
      }),
  };
};

// Card ki "pehchan": sirf tab badalta hai jab card me kuch dikhne wala badle.
const streamSig = (s) =>
  [
    s.id, s.hostId, s.title, s.host, s.type, s.users, s.stars, s.roomCover,
    s.hostImg, s.createdAt, s.layout,
    s.seats.map((x) => (x.taken ? '1' : '0') + (x.uid || '') + (x.img || '')).join(','),
  ].join('|');

// ------------------------------------
// SCREEN FOCUS (jab LiveRoom khula ho to ye screen kuch kaam na kare)
// ------------------------------------

const FocusContext = createContext(true);

const useScreenFocused = () => {
  const navigation = useNavigation();
  const [focused, setFocused] = useState(() => {
    try { return navigation.isFocused(); } catch (e) { return true; }
  });

  useEffect(() => {
    const a = navigation.addListener('focus', () => setFocused(true));
    const b = navigation.addListener('blur', () => setFocused(false));
    return () => { a(); b(); };
  }, [navigation]);

  return focused;
};

// ------------------------------------
// ONE SHARED "LIVE" PULSE
// ------------------------------------

const livePulse = new Animated.Value(1);
const claimTouch = () => true;
const noTerminate = () => false;

// ------------------------------------
// VIEWER COUNT (video live = room ke andar ke log, real-time)
// ------------------------------------
// Sirf video cards ka apna chhota component: count badle to sirf ye pill
// re-render hota hai, poora card nahi. Screen blur hone par listener band.

const VideoViewerPill = memo(function VideoViewerPill({ roomId, hostId, fallback }) {
  const focused = useContext(FocusContext);
  const [count, setCount] = useState(null);

  useEffect(() => {
    if (!db || !focused) return;
    const unsub = onSnapshot(
      collection(db, 'rooms', roomId, 'audience'),
      (snap) => {
        let n = 0;
        snap.forEach((d) => {
          if (d.id !== hostId) n++;
        });
        setCount(n);
      },
      () => {}
    );
    return () => unsub();
  }, [focused, roomId, hostId]);

  return (
    <View style={styles.viewerPill}>
      <Ionicons name="people" size={12} color="#fff" />
      <Text style={styles.viewerText}>{fmtCount(count === null ? fallback : count)}</Text>
    </View>
  );
});

// ------------------------------------
// LIVE CARD
// ------------------------------------

const SeatAvatar = memo(function SeatAvatar({ uid, fallbackImg }) {
  const focused = useContext(FocusContext);
  const prof = useUserProfile(uid, focused);
  const img = prof ? prof.img : fallbackImg;   // profile aate hi wahi sach (DP hata di to icon)
  return <DpAvatar uri={img} style={styles.seatImg} iconSize={12} />;
});

const LiveCard = memo(function LiveCard({ stream, onPress, opening, isTop }) {
  const handlePress = useCallback(() => onPress(stream), [onPress, stream]);
  const focused = useContext(FocusContext);
  // LIVE: host ne DP / naam badla to room doc ka wait nahi, users/{hostId} se turant
  const prof = useUserProfile(stream.hostId, focused);
  const liveHostImg = prof ? prof.img : stream.hostImg;
  const liveHostName = (prof && prof.name) || stream.host;
  const coverUri = stream.roomCover || liveHostImg;

  return (
    <TouchableOpacity
      style={[styles.liveCard, isTop && styles.liveCardTop]}
      activeOpacity={0.88}
      onPress={handlePress}
    >
      {/* Host / room banner */}
      {coverUri ? (
        <Image
          source={{ uri: coverUri }}
          style={styles.cardImage}
          resizeMode="cover"
          fadeDuration={0}
        />
      ) : (
        // DP / cover dono nahi -> random photo nahi, user (account) icon
        <View style={[styles.cardImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1d1d1d' }]}>
          <Ionicons name="person" size={Math.round(CARD_WIDTH * 0.42)} color="rgba(255,255,255,0.22)" />
        </View>
      )}

      {/* Soft top shade so badges are readable on any image */}
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}
        style={styles.topShade}
        pointerEvents="none"
      />

      {/* Bottom shade for name + title */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
        style={styles.bottomShade}
        pointerEvents="none"
      />

      {/* Multi-guest: 3x3 mini grid of seats */}
      {stream.layout === 'multiguest' && (
        <View style={styles.seatGrid} pointerEvents="none">
          {Array.from({ length: 9 }).map((_, i) => {
            const st = stream.seats?.[i];
            return (
              <View key={i} style={[styles.seatCell, st?.taken && styles.seatCellTaken]}>
                {st?.taken ? (
                  <SeatAvatar uid={st.uid} fallbackImg={st.img} />
                ) : (
                  <Ionicons name="person" size={12} color="rgba(255,255,255,0.25)" />
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* LIVE badge */}
      <View style={styles.liveBadge}>
        <Animated.View style={[styles.liveDot, { opacity: livePulse }]} />
        <Text style={styles.liveBadgeText}>LIVE</Text>
      </View>

      {/* TOP broadcaster tag (sab se zyada stars) */}
      {isTop && (
        <View style={styles.topTag}>
          <Ionicons name="trophy" size={10} color="#000" />
          <Text style={styles.topTagText}>TOP</Text>
        </View>
      )}

      {/* Viewer count */}
      {stream.type === 'video' ? (
        <VideoViewerPill roomId={stream.id} hostId={stream.hostId} fallback={stream.users} />
      ) : (
        <View style={styles.viewerPill}>
          <Ionicons name="people" size={12} color="#fff" />
          <Text style={styles.viewerText}>{fmtCount(stream.users)}</Text>
        </View>
      )}

      {/* Host info */}
      <View style={styles.bottomInfo}>
        <View style={styles.avatarRing}>
          <DpAvatar uri={liveHostImg} style={styles.profilePic} iconSize={20} />
        </View>

        <View style={styles.bottomTextCol}>
          <Text style={styles.hostName} numberOfLines={1}>
            {liveHostName}
          </Text>
          <Text style={styles.roomTitle} numberOfLines={1}>
            {stream.title}
          </Text>
          {stream.stars > 0 && (
            <View style={styles.starRow}>
              <Ionicons name="star" size={10} color="#ebd500" />
              <Text style={styles.starText}>{fmtCount(stream.stars)}</Text>
            </View>
          )}
        </View>

        <View style={styles.typeBadge}>
          <Ionicons
            name={stream.layout === 'multiguest' ? 'grid' : stream.type === 'video' ? 'videocam' : 'mic'}
            size={14}
            color="#fff"
          />
        </View>
      </View>

      {/* Tap par turant feedback: room khul raha hai, dobara tap mat karo */}
      {opening && (
        <View style={styles.openingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color="#ebd500" />
        </View>
      )}
    </TouchableOpacity>
  );
});

// ------------------------------------
// BANNER SLIDER (own state => 3s tick never re-renders the live list)
// ------------------------------------

const TrendingBanner = memo(function TrendingBanner() {
  const focused = useContext(FocusContext);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef(null);
  const indexRef = useRef(0);

  useEffect(() => {
    if (!focused) return; // LiveRoom khula ho to banner timer band
    const timer = setInterval(() => {
      let next = indexRef.current + 1;
      if (next >= TRENDING_BANNERS_DATA.length) next = 0;
      indexRef.current = next;
      scrollRef.current?.scrollTo({ x: next * BANNER_WIDTH, animated: true });
      setActiveIndex(next);
    }, 3500);
    return () => clearInterval(timer);
  }, [focused]);

  const onScrollEnd = useCallback((e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / BANNER_WIDTH);
    indexRef.current = idx;
    setActiveIndex(idx);
  }, []);

  return (
    // Banner par left/right swipe sirf banner badle, All Live band na ho (parent swipe yahan nahi chalega)
    <View style={styles.bannerContainer} onStartShouldSetResponder={claimTouch} onResponderTerminationRequest={noTerminate}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        snapToInterval={BANNER_WIDTH}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={{ width: '100%', height: '100%' }}
      >
        {TRENDING_BANNERS_DATA.map((src, i) => (
          <View key={i} style={styles.bannerSlide}>
            <Image source={src} style={styles.bannerImage} resizeMode="contain" />
          </View>
        ))}
      </ScrollView>

      <View style={styles.dotRow}>
        {TRENDING_BANNERS_DATA.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, activeIndex === i && styles.activeDot]}
          />
        ))}
      </View>
    </View>
  );
});

// ------------------------------------
// TABS
// ------------------------------------

const TabButton = memo(function TabButton({ label, icon, active, count, onPress }) {
  return (
    <TouchableOpacity
      style={styles.tabButton}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={16}
        color={active ? '#ebd500' : 'rgba(255,255,255,0.4)'}
        style={{ marginRight: 6 }}
      />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
      {count > 0 && (
        <View style={[styles.tabCount, active && styles.tabCountActive]}>
          <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>
            {count}
          </Text>
        </View>
      )}
      {active && <View style={styles.tabUnderline} />}
    </TouchableOpacity>
  );
});

// ------------------------------------
// MAIN SCREEN
// ------------------------------------

export default function AllLive() {
  const router = useRouter();
  const { blocked: blockedIds } = useBlockedIds(); // BLOCK
  const focused = useScreenFocused();

  // Swipe left -> wapas (Discover). Order: Live | Discover | Follow | For You
  const swipe = useSwipeTabs({
    onSwipeLeft: () => {
      try {
        if (router.canGoBack()) router.back();
        else router.replace('/');
      } catch (error) {
        router.replace('/');
      }
    },
  });

  const [activeTab, setActiveTab] = useState('audio');
  const [liveStreams, setLiveStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState(null);

  // Rooms React state me nahi, map me: snapshot aate hi sirf badle hue room update.
  const streamMapRef = useRef(new Map()); // id -> {stream, sig}
  const heartbeatMapRef = useRef({});
  const flushTimerRef = useRef(null);
  const navLockRef = useRef(0);

  // ------------------------------------
  // BACK BUTTON
  // ------------------------------------

  useEffect(() => {
    const handleBackButton = () => {
      try {
        if (router.canGoBack()) router.back();
        else router.replace('/');
      } catch (error) {
        router.replace('/');
      }
      return true;
    };

    const sub = scopedBackHandler('/all-live', 'hardwareBackPress', handleBackButton);
    return () => sub.remove();
  }, [router]);

  // ------------------------------------
  // SHARED LIVE-DOT PULSE (one loop for all cards, focus me hi chale)
  // ------------------------------------

  useEffect(() => {
    if (!focused) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, {
          toValue: 0.25,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(livePulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [focused]);

  // ------------------------------------
  // OPEN ROOM (double-tap guard + instant feedback)
  // ------------------------------------

  const openLiveRoom = useCallback((stream) => {
    const now = Date.now();
    if (now - navLockRef.current < OPEN_LOCK_MS) return; // pehle tap se room khul raha hai
    navLockRef.current = now;
    setOpeningId(stream.id);

    if (stream.type === 'video') {
      router.push({
        pathname: '/videolive',
        params: { id: stream.id, role: 'viewer' },
      });
      return;
    }

    if (stream.layout === 'multiguest') {
      router.push({ pathname: '/MultiGuestRoom', params: { id: stream.id } });
      return;
    }

    router.push({
      pathname: '/LiveRoom',
      params: { id: stream.id, from: 'alllive', layout: stream.layout },
    });
  }, [router]);

  // Screen wapas aaye to lock + spinner saaf
  useEffect(() => {
    if (focused) {
      navLockRef.current = 0;
      setOpeningId(null);
    }
  }, [focused]);

  // Agar push na ho paya to spinner atka na rahe
  useEffect(() => {
    if (!openingId) return;
    const t = setTimeout(() => setOpeningId(null), 3500);
    return () => clearTimeout(t);
  }, [openingId]);

  // ------------------------------------
  // LIST FLUSH (throttled + sorted by stars)
  // ------------------------------------

  const flushNow = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const arr = [];
    streamMapRef.current.forEach((v) => arr.push(v.stream));
    arr.sort(compareStreams);
    setLiveStreams((prev) => (sameList(prev, arr) ? prev : arr));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      flushNow();
    }, LIST_FLUSH_MS);
  }, [flushNow]);

  useEffect(() => () => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
  }, []);

  // ------------------------------------
  // FETCH LIVE ROOMS (sirf jab ye screen samne ho)
  // ------------------------------------

  useEffect(() => {
    if (!db) {
      setLiveStreams([]);
      setLoading(false);
      return;
    }
    if (!focused) return; // LiveRoom khula hai -> listener band, CPU free

    let unsubscribe = () => {};
    streamMapRef.current = new Map();
    heartbeatMapRef.current = {};

    // Map me ek room daalo; purana object reuse (taaki card re-render na ho)
    const upsert = (map, id, stream) => {
      const sig = streamSig(stream);
      const prev = streamMapRef.current.get(id);
      if (prev && prev.sig === sig) {
        map.set(id, prev);
        return false;
      }
      map.set(id, { stream, sig });
      return true;
    };

    try {
      // SPEED: sirf pichhle 24 ghante ke rooms (do query), diff-based updates pehle jaise.
      const firstByKey = { num: true, ts: true };
      unsubscribe = listenRecentRooms(
        db,
        (snapshot, key) => {
          const now = Date.now();
          const map = streamMapRef.current;
          let changed = false;

          // Pehla snapshot bhi docChanges me sab 'added' aata hai -> alag branch ki zarurat nahi
          snapshot.docChanges().forEach((change) => {
            const id = change.doc.id;
            if (change.type === 'removed') {
              if (map.delete(id)) changed = true;
              delete heartbeatMapRef.current[id];
              return;
            }
            const raw = change.doc.data();
            const s = parseRoom(id, raw, now);
            if (!s) {
              if (map.delete(id)) changed = true;
              delete heartbeatMapRef.current[id];
              return;
            }
            heartbeatMapRef.current[id] = getHeartbeatMs(raw);
            const prev = map.get(id);
            const sig = streamSig(s);
            if (!prev || prev.sig !== sig) {
              map.set(id, { stream: s, sig });
              changed = true;
            }
          });

          if (firstByKey[key]) {
            firstByKey[key] = false;
            flushNow(); // pehli baar turant dikhao
            setLoading(false);
            return;
          }
          // Heartbeat-only snapshot => changed=false => koi re-render nahi
          if (changed) scheduleFlush();
        },
        (error) => {
          __DEV__ && console.log('Firebase Sync Error:', error);
          setLoading(false);
        }
      );
    } catch (err) {
      __DEV__ && console.log('Firestore Connection Error:', err);
      setLiveStreams([]);
      setLoading(false);
    }

    return () => unsubscribe();
  }, [focused, flushNow, scheduleFlush]);

  // ------------------------------------
  // LOCAL HEARTBEAT CLEANUP
  // ------------------------------------

  useEffect(() => {
    if (!focused) return;
    const checkTimer = setInterval(() => {
      const now = Date.now();
      let removed = false;
      streamMapRef.current.forEach((_, id) => {
        const hb = heartbeatMapRef.current[id];
        if (hb && now - hb > HEARTBEAT_TIMEOUT) {
          streamMapRef.current.delete(id);
          removed = true;
        }
      });
      if (removed) flushNow();
    }, HEARTBEAT_CHECK_INTERVAL);

    return () => clearInterval(checkTimer);
  }, [focused, flushNow]);

  // ------------------------------------
  // DERIVED DATA
  // ------------------------------------

  const { filteredStreams, audioCount, videoCount, multiCount } = useMemo(() => {
    const audio = [];
    const video = [];
    const multi = [];
    liveStreams.forEach((s) => {
      if (!s) return;
      if (s.hostId && blockedIds.has(s.hostId)) return; // BLOCK
      if (s.layout === 'multiguest') multi.push(s);
      else if (s.type === 'video') video.push(s);
      else if (s.type === 'audio') audio.push(s);
    });
    return {
      filteredStreams:
        activeTab === 'video' ? video : activeTab === 'multi' ? multi : audio,
      audioCount: audio.length,
      videoCount: video.length,
      multiCount: multi.length,
    };
  }, [liveStreams, activeTab, blockedIds]);

  const setAudio = useCallback(() => setActiveTab('audio'), []);
  const setVideo = useCallback(() => setActiveTab('video'), []);
  const setMulti = useCallback(() => setActiveTab('multi'), []);

  // ------------------------------------
  // LIST PARTS
  // ------------------------------------

  const renderItem = useCallback(
    ({ item, index }) => (
      <LiveCard
        stream={item}
        onPress={openLiveRoom}
        opening={item.id === openingId}
        isTop={index === 0 && item.stars > 0}
      />
    ),
    [openLiveRoom, openingId]
  );

  const keyExtractor = useCallback((item) => item.id, []);

  const header = useMemo(
    () => (
      <View>
        <TrendingBanner />

        <View style={styles.tabStrip}>
          <TabButton
            label="Audio Live"
            icon="mic-outline"
            active={activeTab === 'audio'}
            count={audioCount}
            onPress={setAudio}
          />
          <TabButton
            label="Video Live"
            icon="videocam-outline"
            active={activeTab === 'video'}
            count={videoCount}
            onPress={setVideo}
          />
          <TabButton
            label="Multi Guest"
            icon="grid-outline"
            active={activeTab === 'multi'}
            count={multiCount}
            onPress={setMulti}
          />
        </View>
      </View>
    ),
    [activeTab, audioCount, videoCount, multiCount, setAudio, setVideo, setMulti]
  );

  const emptyComponent = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color="#ebd500" />
          <Text style={styles.emptyText}>Loading live rooms...</Text>
        </View>
      );
    }
    return (
      <View style={styles.centerBox}>
        <Ionicons
          name={activeTab === 'audio' ? 'mic-off-outline' : activeTab === 'multi' ? 'grid-outline' : 'videocam-off-outline'}
          size={46}
          color="rgba(255,255,255,0.12)"
        />
        <Text style={styles.emptyText}>
          No active {activeTab === 'multi' ? 'multi-guest' : activeTab} rooms live right now
        </Text>
      </View>
    );
  }, [loading, activeTab]);

  // ------------------------------------
  // RENDER
  // ------------------------------------

  return (
    <FocusContext.Provider value={focused}>
      <SafeAreaView style={styles.container} {...swipe}>
        <StatusBar backgroundColor="#08080a" barStyle="light-content" translucent={false} />

        {/* HEADER */}
        <View style={styles.headerBar}>
          <View>
            <Text style={styles.headerLogoText}>LIVES</Text>
            <Text style={styles.headerSubLogoText}>audio & video rooms</Text>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerIconButton} activeOpacity={0.7}>
              <Ionicons name="search-outline" size={18} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconButton} activeOpacity={0.7}>
              <Ionicons name="notifications-outline" size={18} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconButton} activeOpacity={0.7}>
              <Ionicons name="options-outline" size={18} color="#ebd500" />
            </TouchableOpacity>
          </View>
        </View>

        {/* FEED (virtualized grid: sirf screen par dikhne wale cards render) */}
        <FlatList
          data={filteredStreams}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          ListHeaderComponent={header}
          ListEmptyComponent={emptyComponent}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={4}
          updateCellsBatchingPeriod={60}
          windowSize={5}
          removeClippedSubviews={false}
        />

        <AppBottomNav />
      </SafeAreaView>
    </FocusContext.Provider>
  );
}

// ------------------------------------
// STYLES
// ------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08080a' },

  // header
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: Platform.OS === 'android' ? 85 : 75,
    paddingTop: Platform.OS === 'android' ? 20 : 15,
    backgroundColor: '#08080a',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  headerLogoText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ebd500',
    letterSpacing: 1,
  },
  headerSubLogoText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
    marginTop: -2,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerIconButton: {
    marginLeft: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },

  // list
  listContent: { paddingBottom: 110 },
  columnWrapper: {
    justifyContent: 'space-between',
    paddingHorizontal: SIDE_PADDING,
    marginBottom: CARD_GAP,
  },

  // banner
  bannerContainer: {
    width: BANNER_WIDTH,
    height: BANNER_WIDTH * (884 / 1774),
    alignSelf: 'center',
    marginTop: 16,
    backgroundColor: '#0d0e14',
    borderRadius: 20,
    overflow: 'hidden',
  },
  bannerSlide: {
    width: BANNER_WIDTH,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  bannerImage: { width: '100%', height: '100%', alignSelf: 'center' },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginHorizontal: 4,
  },
  activeDot: { width: 14, backgroundColor: '#ebd500' },

  // tabs
  tabStrip: {
    width: BANNER_WIDTH,
    height: 50,
    backgroundColor: '#12131a',
    marginTop: 20,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    alignSelf: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  tabButton: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  tabText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  tabTextActive: { color: '#ffffff', fontWeight: '800' },
  tabCount: {
    marginLeft: 6,
    minWidth: 18,
    paddingHorizontal: 5,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabCountActive: { backgroundColor: '#ebd500' },
  tabCountText: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.5)' },
  tabCountTextActive: { color: '#000' },
  tabUnderline: {
    position: 'absolute',
    bottom: -4,
    width: '40%',
    height: 3,
    backgroundColor: '#ebd500',
    borderRadius: 2,
  },

  // empty / loader
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    marginTop: 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  // card
  liveCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: '#14151c',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardImage: { width: '100%', height: '100%' },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 70 },
  bottomShade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 95 },

  liveBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,45,85,0.92)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    marginRight: 5,
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  viewerPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  viewerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 4,
  },

  bottomInfo: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#ebd500',
    overflow: 'hidden',
    backgroundColor: '#222',
  },
  profilePic: { width: '100%', height: '100%' },
  bottomTextCol: { flex: 1, marginLeft: 8 },
  hostName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  roomTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    marginTop: 1,
  },
  seatGrid: {
    position: 'absolute',
    top: 38,
    left: 10,
    right: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  seatCell: {
    width: (CARD_WIDTH - 20 - 12) / 3,
    height: (CARD_WIDTH - 20 - 12) / 3,
    marginBottom: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  seatCellTaken: { borderWidth: 1.5, borderColor: '#ebd500' },
  seatImg: { width: '100%', height: '100%' },
  typeBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(18,0,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },

  // NEW: top broadcaster (most stars), star count, opening feedback
  liveCardTop: { borderColor: '#ebd500', borderWidth: 2 },
  topTag: {
    position: 'absolute',
    top: 34,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ebd500',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  topTagText: { color: '#000', fontSize: 9, fontWeight: '900', marginLeft: 3, letterSpacing: 0.6 },
  starRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  starText: { color: '#ebd500', fontSize: 11, fontWeight: '800', marginLeft: 3 },
  openingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
