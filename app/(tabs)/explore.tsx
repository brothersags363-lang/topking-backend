import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Dimensions,
  Platform,
  FlatList,
  Image,
  ActivityIndicator,
  BackHandler,
  RefreshControl,
  Animated,
  Easing,
  Keyboard,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// FIREBASE IMPORT
import { db, auth } from '../firebaseConfig';
import LevelFrame from '../../components/LevelFrame';
import { useBlockedIds } from '../../utils/useBlockedIds';

import {
  collection,
  query,
  where,
  getDocs,
  limit,
  startAfter,
  orderBy,
  doc,
  getDoc,
  runTransaction,
} from 'firebase/firestore';
import UserTick, { isFaceVerified } from '../../components/UserTick';

const { width } = Dimensions.get('window');
const BANNER_W = width - 32;
const DEFAULT_AVATAR = 'https://avatar.iran.liara.run/public/65';

/* ------------------------------------------------------------------ */
/*  STATIC DATA (module level => never re-created on re-render)        */
/* ------------------------------------------------------------------ */

const THEME_50 = { bg: '#7B1FFF', border: '#FFD700', text: '#fff', icon: '#FFD700' };
const THEME_40 = { bg: '#00BFFF', border: '#9EF8FF', text: '#fff', icon: '#fff' };
const THEME_30 = { bg: '#FF0066', border: '#FFB6C1', text: '#fff', icon: '#fff' };
const THEME_20 = { bg: '#FFC107', border: '#FFE082', text: '#000', icon: '#fff' };
const THEME_10 = { bg: '#BDBDBD', border: '#fff', text: '#fff', icon: '#fff' };
const THEME_0 = { bg: '#222', border: '#555', text: '#FFD700', icon: '#00E5FF' };

const getLevelTheme = (level = 1) => {
  if (level >= 50) return THEME_50;
  if (level >= 40) return THEME_40;
  if (level >= 30) return THEME_30;
  if (level >= 20) return THEME_20;
  if (level >= 10) return THEME_10;
  return THEME_0;
};

const FRAME_50 = require('../../assets/frames/lv50.png');
const FRAME_40 = require('../../assets/frames/lv40.png');
const FRAME_30 = require('../../assets/frames/lv30.png');
const FRAME_20 = require('../../assets/frames/lv20.png');
const FRAME_10 = require('../../assets/frames/lv10.png');

const getLevelFrame = (level = 1) => {
  if (level >= 50) return FRAME_50;
  if (level >= 40) return FRAME_40;
  if (level >= 30) return FRAME_30;
  if (level >= 20) return FRAME_20;
  if (level >= 10) return FRAME_10;
  return null;
};

const TRENDING_BANNERS_DATA = [
  require('../../assets/images/banner1.jpeg'),
  require('../../assets/images/banner2.png'),
  require('../../assets/images/banner3.jpeg'),
  require('../../assets/images/banner4.png'),
  require('../../assets/images/banner5.png'),
  require('../../assets/images/banner6.png'),
];

const TROPHY_ITEMS = [
  { label: 'Live', icon: 'mic-sharp', note: 'Go Live Now', route: '/all-live' },
  { label: 'Family Ranking', icon: 'trophy-sharp', note: 'Top Families', route: '../family' },
  { label: 'Agency', icon: 'people-sharp', note: 'Agency Ranking', route: '../AgencyTop' },
  { label: 'Creator', icon: 'ribbon-sharp', note: 'For Creators', route: '../top-followers' },
];

// constant style objects (avoid new object every render)
const SCROLL_STYLE = { backgroundColor: '#08080a' };
const SCROLL_CONTENT = { paddingBottom: 140 };
const TROPHY_CONTENT = { paddingHorizontal: 12 };
const TOPVIDEO_CONTENT = { paddingRight: 0 };
const GIFTKING_CONTENT = { paddingHorizontal: 15 };
const ACCOUNTS_CONTENT = { paddingTop: 10, paddingBottom: 120 };
const VIDEOS_CONTENT = { paddingTop: 10, paddingBottom: 120, gap: 6 };
const VIDEOS_COLUMN = { gap: 6 };
const RESULTS_WRAP = { flex: 1, backgroundColor: '#08080a' };
const ROW_CENTER = { flexDirection: 'row' as const, alignItems: 'center' as const };

const keyById = (item: any) => item.id;

// Top Video: screenshot jaisa => box ke andar 3 bade cards ek row me
const TV_GAP = 8;
const TV_PAD = 12;
const TV_CARD_W = Math.floor((width - 32 - TV_PAD * 2 - TV_GAP * 2) / 3);
const TV_CARD_H = Math.round(TV_CARD_W * 1.42);
const TV_HEAD = { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 10 };
const TOPVIDEO_ITEM_W = TV_CARD_W + TV_GAP;
const GIFTKING_ITEM_W = 152; // 140 card + 12 margin
const getTopVideoLayout = (_: any, index: number) => ({
  length: TOPVIDEO_ITEM_W,
  offset: TOPVIDEO_ITEM_W * index,
  index,
});
const getGiftKingLayout = (_: any, index: number) => ({
  length: GIFTKING_ITEM_W,
  offset: GIFTKING_ITEM_W * index,
  index,
});

/* ------------------------------------------------------------------ */
/*  CACHES (module level => survive leaving / re-opening the screen)   */
/* ------------------------------------------------------------------ */

const HOME_TTL = 60 * 1000; // home data fresh for 1 min
const SEARCH_TTL = 60 * 1000;
const VIDEO_CACHE_TTL = 5 * 60 * 1000;

const homeCache = {
  ts: 0,
  topVideos: [] as any[],
  giftKings: [] as any[],
  giftKingsMonth: '', // kis mahine ka data cache me hai
  profileImg: '',
  kingStar: [] as any[],
  kingAgencies: [] as any[],
  kingFamilies: [] as any[],
  kingMonth: '',
};

/* ------------------------------------------------------------------ */
/*  MONTHLY STAR UP (har mahine 0 se start)                            */
/* ------------------------------------------------------------------ */

// IST (UTC+5:30) se mahina nikalte hain => har phone par same month key
// Koi backend / gift-code change nahi: mahine ke pehle open par page khud
// 'star_baseline/<mahina>' me sabka starting total save karta hai.
// Is mahine ke stars = abhi ka total - starting total  => naya mahina = 0 se start
const IST_OFFSET = 5.5 * 60 * 60 * 1000;
const getMonthKey = (ts = Date.now()) => {
  const d = new Date(ts + IST_OFFSET);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const getDaysLeftInMonth = () => {
  const d = new Date(Date.now() + IST_OFFSET);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return last - d.getUTCDate() + 1;
};

const levelCache = new Map<string, number>();
const searchCache = new Map<string, { ts: number; users: any[]; vids: any[] }>();

let videoCache: { ts: number; items: any[]; hays: string[] } | null = null;
let videoCachePromise: Promise<void> | null = null;

// Top Video: home par sirf 3 thumbnail (fast), "All View" par baaki sab
const TOP_PREVIEW = 3;
const ALL_PAGE = 24;
const ALL_TTL = 5 * 60 * 1000;
const TOPVIDEO_ROW = { flexDirection: 'row' as const };
let allVideosCache: { ts: number; items: any[]; last: any; done: boolean } | null = null;
let allVideosPromise: Promise<void> | null = null;

// Page-by-page (24 video) => pehli baar jaldi khulta hai, scroll par aur aate hain
const fetchAllVideosPage = (reset = false): Promise<void> => {
  if (reset) allVideosCache = null;
  if (allVideosCache?.done) return Promise.resolve();
  if (allVideosPromise) return allVideosPromise;
  const prev = allVideosCache;
  const base = [collection(db, 'all_videos'), orderBy('views', 'desc')] as const;
  const q = prev?.last
    ? query(base[0], base[1], startAfter(prev.last), limit(ALL_PAGE))
    : query(base[0], base[1], limit(ALL_PAGE));
  allVideosPromise = getDocs(q)
    .then((snap) => {
      const fresh = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      const old = prev?.items || [];
      const seen = new Set(old.map((i: any) => i.id));
      allVideosCache = {
        ts: prev?.ts || Date.now(),
        items: old.concat(fresh.filter((i: any) => !seen.has(i.id))),
        last: snap.docs.length ? snap.docs[snap.docs.length - 1] : prev?.last || null,
        done: snap.docs.length < ALL_PAGE,
      };
      // pehle 12 thumbnails pehle se download => grid turant dikhta hai
      fresh.slice(0, 12).forEach((i: any) => {
        if (i.thumbnail) Image.prefetch(i.thumbnail).catch(() => {});
      });
    })
    .catch((e) => console.log(e))
    .finally(() => {
      allVideosPromise = null;
    });
  return allVideosPromise;
};

const BASE_SIZE = 50; // starting snapshot: top 50 wallets
const LIVE_SIZE = 30; // live compare: top 30 wallets (kam reads => fast)

/* ------------------------------------------------------------------ */
/*  SHARED FETCH + DISK CACHE (ek hi read, sab sections ke liye)       */
/* ------------------------------------------------------------------ */

const HOME_STORAGE_KEY = '@explore_home_v2';

// user docs: ek baar padh liye to dobara Firestore ko haath nahi
const userDocCache = new Map<string, any>();
const getUserCached = async (id: string) => {
  if (userDocCache.has(id)) return userDocCache.get(id);
  const s = await getDoc(doc(db, 'users', id));
  const data = s.exists() ? s.data() : null;
  if (data) userDocCache.set(id, data);
  return data;
};

// Top wallets (receivedStars): Star Up Earning + TopKing Star dono yahi use karte hain
const WALLET_TTL = 30 * 1000;
let walletTopCache: { ts: number; rows: { id: string; data: any }[] } | null = null;
let walletTopPromise: Promise<{ id: string; data: any }[]> | null = null;
const fetchTopWallets = (force = false) => {
  if (!force && walletTopCache && Date.now() - walletTopCache.ts < WALLET_TTL) {
    return Promise.resolve(walletTopCache.rows);
  }
  if (!walletTopPromise) {
    walletTopPromise = getDocs(
      query(collection(db, 'wallets'), orderBy('receivedStars', 'desc'), limit(LIVE_SIZE))
    )
      .then((snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, data: d.data() as any }));
        walletTopCache = { ts: Date.now(), rows };
        return rows;
      })
      .finally(() => {
        walletTopPromise = null;
      });
  }
  return walletTopPromise as Promise<{ id: string; data: any }[]>;
};

// Home data disk par => app band karke dobara kholo to bhi blank nahi
const saveHomeToDisk = () => {
  try {
    AsyncStorage.setItem(HOME_STORAGE_KEY, JSON.stringify(homeCache)).catch(() => {});
  } catch (e) {}
};
const readHomeFromDisk = async () => {
  try {
    const raw = await AsyncStorage.getItem(HOME_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};
// import hote hi disk padhna shuru => component mount hone tak data ready
const homeDiskPromise = readHomeFromDisk();
const baselineCaches: Record<
  string,
  { month: string; base: Record<string, number>; floor: number }
> = {};

// Naye mahine me pehla user snapshot banata hai (transaction => sirf ek hi banta hai)
// field: 'receivedStars' (creator ne kamaye) ya 'spentStars' (kisne kharide)
const ensureBaselineInner = async (monthKey: string, field: string = 'receivedStars') => {
  const cached = baselineCaches[field];
  if (cached && cached.month === monthKey) return cached;

  const docId = field === 'receivedStars' ? monthKey : `${monthKey}_${field}`;
  const ref = doc(db, 'star_baseline', docId);
  let base: Record<string, number> | null = null;

  const snap = await getDoc(ref);
  if (snap.exists()) {
    base = snap.data().base || {};
  } else {
    const top = await getDocs(
      query(collection(db, 'wallets'), orderBy(field, 'desc'), limit(BASE_SIZE))
    );
    const fresh: Record<string, number> = {};
    top.docs.forEach((d) => {
      fresh[d.id] = d.data()[field] || 0;
    });
    base = await runTransaction(db, async (tx) => {
      const again = await tx.get(ref);
      if (again.exists()) return again.data().base || {};
      tx.set(ref, { base: fresh, createdAt: Date.now() });
      return fresh;
    });
  }

  const b = base || {};
  const vals = Object.values(b) as number[];
  // snapshot me na ho wala user => uska total snapshot ke sabse chhote total se kam tha
  const floor = vals.length >= BASE_SIZE ? Math.min(...vals) : 0;
  baselineCaches[field] = { month: monthKey, base: b, floor };
  return baselineCaches[field];
};

type Baseline = { month: string; base: Record<string, number>; floor: number };
const baselinePromises: Record<string, Promise<Baseline>> = {};
// Do section ek saath maangen to Firestore par ek hi request jaati hai
const ensureBaseline = (monthKey: string, field: string = 'receivedStars'): Promise<Baseline> => {
  const cached = baselineCaches[field];
  if (cached && cached.month === monthKey) return Promise.resolve(cached);
  const k = `${monthKey}_${field}`;
  if (!baselinePromises[k]) {
    baselinePromises[k] = ensureBaselineInner(monthKey, field).finally(() => {
      delete baselinePromises[k];
    });
  }
  return baselinePromises[k];
};

// "1.2M" / "523K" style short number
const fmtStars = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
};

// Is mahine ke top 3 (field ke hisaab se) => [{id, stars}]
const loadMonthTop3 = async (field: string, force = false) => {
  const monthKey = getMonthKey();
  const [{ base, floor }, walletRows] = await Promise.all([
    ensureBaseline(monthKey, field),
    field === 'receivedStars'
      ? fetchTopWallets(force) // Star Up Earning ke saath shared => ek hi Firestore read
      : getDocs(
          query(collection(db, 'wallets'), orderBy(field, 'desc'), limit(LIVE_SIZE))
        ).then((snap) => snap.docs.map((d) => ({ id: d.id, data: d.data() as any }))),
  ]);
  const ranked = walletRows
    .map((w) => ({
      id: w.id,
      stars: Math.max(0, (w.data[field] || 0) - (base[w.id] ?? floor)),
    }))
    .filter((x) => x.stars > 0)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 3);

  const rows = await Promise.all(
    ranked.map(async (r) => {
      const d: any = await getUserCached(r.id);
      if (!d) return null;
      return {
        id: r.id,
        stars: r.stars,
        name: d.username || d.name || 'user',
        img: d.profileImg || '',
        verified: !!d.verified,
        verifiedColor: d.verifiedColor,
        faceVerified: isFaceVerified(d),
      };
    })
  );
  return rows.filter(Boolean) as any[];
};

// Top 3 agency - AgencyTop.js jaisa hi: agencies, totalStars desc, blocked chhod ke
const loadTopAgencies = async () => {
  const snap = await getDocs(
    query(collection(db, 'agencies'), orderBy('totalStars', 'desc'), limit(6))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((a: any) => a.status !== 'blocked')
    .slice(0, 3)
    .map((a: any) => ({
      id: a.id,
      stars: a.totalStars || 0,
      name: a.agencyName || 'Agency',
      img: a.logo || '',
      verified: false,
      verifiedColor: undefined,
    }));
};

// Top 3 family: sirf admin se approved families, points desc (family.js jaisa hi)
const loadTopFamilies = async () => {
  const snap = await getDocs(
    query(collection(db, 'families'), where('status', '==', 'approved'))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .sort((a: any, b: any) => (b.points || 0) - (a.points || 0))
    .slice(0, 3)
    .map((f: any) => ({
      id: f.id,
      stars: f.points || 0,
      name: f.name || 'Family',
      img: f.logo || '',
      verified: false,
      verifiedColor: undefined,
    }));
};


/* ------------------------------------------------------------------ */
/*  SEARCH HELPERS (pure, outside component)                           */
/* ------------------------------------------------------------------ */

// "@love" / "#love" / " Love " -> "love"
const cleanTerm = (t: string) => t.trim().replace(/^[@#]+/, '').toLowerCase();

const buildHay = (v: any) =>
  [
    v.caption,
    Array.isArray(v.hashtags) ? v.hashtags.join(' ') : '',
    v.username,
    v.userName,
    v.songName,
    v.musicName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

// Latest 200 videos ek baar fetch -> lowercase text pehle se ready.
// Concurrent calls ek hi request share karte hain.
const ensureVideoCache = (): Promise<void> => {
  if (videoCache && Date.now() - videoCache.ts < VIDEO_CACHE_TTL) {
    return Promise.resolve();
  }
  if (!videoCachePromise) {
    videoCachePromise = getDocs(
      query(collection(db, 'all_videos'), orderBy('createdAt', 'desc'), limit(200))
    )
      .then((snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        videoCache = { ts: Date.now(), items, hays: items.map(buildHay) };
      })
      .catch((e) => {
        console.log('Video cache error:', e);
        // 10 sec baad dobara try karega
        videoCache = {
          ts: Date.now() - VIDEO_CACHE_TTL + 10000,
          items: videoCache?.items || [],
          hays: videoCache?.hays || [],
        };
      })
      .finally(() => {
        videoCachePromise = null;
      });
  }
  return videoCachePromise;
};

const searchAccounts = async (term: string) => {
  if (!term) return [];
  const cap = term.charAt(0).toUpperCase() + term.slice(1);

  const mk = (field: string, value: string) =>
    getDocs(
      query(
        collection(db, 'users'),
        where(field, '>=', value),
        where(field, '<=', value + '\uf8ff'),
        limit(15)
      )
    ).catch(() => null);

  const snaps = await Promise.all([
    mk('username', term),
    mk('name', term),
    mk('name', cap),
  ]);

  const map = new Map<string, any>();
  snaps.forEach((snap) => {
    snap?.docs.forEach((d) => {
      if (!map.has(d.id)) map.set(d.id, { id: d.id, ...d.data() });
    });
  });

  // wallet level: cache me ho to Firestore read skip
  const users = await Promise.all(
    Array.from(map.values())
      .slice(0, 20)
      .map(async (u) => {
        let level = levelCache.get(u.id);
        if (level === undefined) {
          level = 1;
          try {
            const walletSnap = await getDoc(doc(db, 'wallets', u.id));
            if (walletSnap.exists()) level = walletSnap.data().level || 1;
            levelCache.set(u.id, level as number);
          } catch (e) {}
        }
        return { ...u, level };
      })
  );

  // exact / starts-with username pehle
  users.sort((a: any, b: any) => {
    const au = String(a.username || '').toLowerCase();
    const bu = String(b.username || '').toLowerCase();
    const ae = au === term ? 0 : au.startsWith(term) ? 1 : 2;
    const be = bu === term ? 0 : bu.startsWith(term) ? 1 : 2;
    return ae - be;
  });

  return users;
};

const searchVideos = async (term: string) => {
  if (!term) return [];

  const tagQuery = getDocs(
    query(
      collection(db, 'all_videos'),
      where('hashtags', 'array-contains', '#' + term),
      limit(40)
    )
  ).catch(() => null);

  // cache aur hashtag query parallel chalte hain
  await ensureVideoCache();
  const tagSnap = await tagQuery;

  const myUid = auth.currentUser?.uid;
  const map = new Map<string, any>();

  tagSnap?.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));

  const vc = videoCache;
  if (vc) {
    for (let i = 0; i < vc.items.length; i++) {
      if (vc.hays[i].includes(term)) map.set(vc.items[i].id, vc.items[i]);
    }
  }

  return Array.from(map.values())
    .filter((v: any) => v.privacy !== 'private' || v.userId === myUid)
    .sort((a: any, b: any) => (b.views || 0) - (a.views || 0));
};

const getFreshSearch = (term: string) => {
  const hit = searchCache.get(term);
  return hit && Date.now() - hit.ts < SEARCH_TTL ? hit : null;
};

/* ------------------------------------------------------------------ */
/*  MEMOIZED PIECES - sirf tab re-render jab unka data badle           */
/* ------------------------------------------------------------------ */

const LevelBadge = memo(function LevelBadge({
  level,
  iconSize,
  fontSize,
}: {
  level: number;
  iconSize: number;
  fontSize: number;
}) {
  const theme = getLevelTheme(level);
  return (
    <View
      style={[
        styles.levelBadge,
        { backgroundColor: theme.bg, borderColor: theme.border },
      ]}
    >
      <MaterialCommunityIcons name="diamond-stone" size={iconSize} color={theme.icon} />
      <Text
        style={{
          color: theme.text,
          fontSize,
          fontWeight: 'bold',
          marginLeft: 3,
        }}
      >
        LV {level || 1}
      </Text>
    </View>
  );
});

const UserCard = memo(function UserCard({
  item,
  onPress,
}: {
  item: any;
  onPress: (id: string) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.userCard}
      activeOpacity={0.8}
      onPress={() => onPress(item.id)}
    >
      <Image
        source={{ uri: item.profileImg || DEFAULT_AVATAR }}
        style={styles.userAvatar}
      />

      <View style={styles.userTextInfo}>
        <View style={ROW_CENTER}>
          <Text style={styles.userName}>@{item.username}</Text>

          <UserTick uid={item.id} verified={item.verified} verifiedColor={item.verifiedColor} faceVerified={item.faceVerified} size={16} whiteColor="#f8fbff" />

          <LevelBadge level={item.level} iconSize={12} fontSize={11} />
        </View>

        <Text style={styles.userSub}>{item.name || 'User'}</Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
    </TouchableOpacity>
  );
});

const SearchVideoCard = memo(function SearchVideoCard({
  item,
  index,
  onPress,
}: {
  item: any;
  index: number;
  onPress: (id: string, index: number) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.searchVideoCard}
      activeOpacity={0.85}
      onPress={() => onPress(item.id, index)}
    >
      <Image source={{ uri: item.thumbnail }} style={styles.searchVideoImage} />
      <View style={styles.searchVideoShade} />
      <View style={styles.searchVideoMeta}>
        <Ionicons name="eye" size={11} color="#fff" />
        <Text style={styles.searchVideoViews}>{item.views || 0}</Text>
      </View>
      {!!item.caption && (
        <Text style={styles.searchVideoCaption} numberOfLines={1}>
          {item.caption}
        </Text>
      )}
    </TouchableOpacity>
  );
});

const TopVideoCard = memo(function TopVideoCard({
  item,
  index,
  onPress,
}: {
  item: any;
  index: number;
  onPress: (id: string, index: number) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.topVideoCard}
      activeOpacity={0.85}
      onPress={() => onPress(item.id, index)}
    >
      <Image source={{ uri: item.thumbnail }} style={styles.topVideoImage} />
      <View style={styles.viewBox}>
        <Ionicons name="eye" size={11} color="#fff" />
        <Text style={styles.viewText}>{item.views || 0}</Text>
      </View>
      {!!item.caption && (
        <View style={styles.tvCaption}>
          <Text style={styles.tvCaptionText} numberOfLines={1}>
            {item.caption}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

const AllVideosScreen = memo(function AllVideosScreen({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (id: string, index: number, list: any[]) => void;
}) {
  const [items, setItems] = useState<any[]>(() =>
    allVideosCache?.items.length ? allVideosCache.items : homeCache.topVideos
  );
  const [loadingFirst, setLoadingFirst] = useState(!allVideosCache?.items.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const itemsRef = useRef<any[]>(items);
  itemsRef.current = items;
  const aliveRef = useRef(true);
  const busyRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    (async () => {
      const stale = !!allVideosCache && Date.now() - allVideosCache.ts > ALL_TTL;
      await fetchAllVideosPage(stale);
      if (!aliveRef.current) return;
      if (allVideosCache) setItems(allVideosCache.items);
      setLoadingFirst(false);
    })();
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const onEnd = useCallback(async () => {
    if (busyRef.current || !allVideosCache || allVideosCache.done) return;
    busyRef.current = true;
    setLoadingMore(true);
    await fetchAllVideosPage();
    busyRef.current = false;
    if (!aliveRef.current) return;
    if (allVideosCache) setItems(allVideosCache.items);
    setLoadingMore(false);
  }, []);

  const press = useCallback(
    (id: string, index: number) => onOpen(id, index, itemsRef.current),
    [onOpen]
  );
  const renderItem = useCallback(
    ({ item, index }: any) => <SearchVideoCard item={item} index={index} onPress={press} />,
    [press]
  );

  return (
    <View style={styles.allOverlay}>
      <View style={styles.allHeader}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.allTitle}>Top Videos</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={keyById}
        renderItem={renderItem}
        numColumns={3}
        columnWrapperStyle={VIDEOS_COLUMN}
        contentContainerStyle={VIDEOS_CONTENT}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={9}
        updateCellsBatchingPeriod={40}
        windowSize={5}
        removeClippedSubviews
        onEndReached={onEnd}
        onEndReachedThreshold={0.6}
        ListFooterComponent={
          loadingFirst || loadingMore ? (
            <ActivityIndicator color="#f1c40f" style={{ marginVertical: 16 }} />
          ) : null
        }
      />
    </View>
  );
});

const GiftKingCard = memo(function GiftKingCard({
  item,
  index,
  onPress,
}: {
  item: any;
  index: number;
  onPress: (id: string) => void;
}) {
  const frame = getLevelFrame(item.level) || !!item.id;
  return (
    <TouchableOpacity style={styles.giftKingCard} onPress={() => onPress(item.id)}>
      {/* Rank */}
      <View style={styles.rankCircle}>
        <Text style={styles.rankText}>{index + 1}</Text>
      </View>

      {/* Profile */}
      <View
        style={{
          width: 90,
          height: 90,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Image
          source={{ uri: item.profileImg || DEFAULT_AVATAR }}
          style={styles.giftKingImage}
        />
        {frame && (
          <LevelFrame
            level={item.level}
            uid={item.id}
            animated
            style={{ position: 'absolute', width: 110, height: 110, top: -15 }}
          />
        )}
      </View>

      {/* Username */}
      <Text style={styles.giftKingName} numberOfLines={1}>
        @{item.username}
      </Text>

      {/* Level */}
      <LevelBadge level={item.level} iconSize={11} fontSize={10} />

      {/* Gifts */}
      <Text style={styles.giftKingGift}>🎁 {item.gifts}</Text>
    </TouchableOpacity>
  );
});

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

// TopKing card: title + top 3 rows (rank, avatar, naam + tick, stars)
const RankCard = memo(function RankCard({
  title,
  icon,
  rows,
  onRowPress,
  onViewAll,
  valueIcon = 'star-circle',
  valueSuffix = '',
}: {
  title: string;
  icon: string;
  rows: any[];
  onRowPress?: (id: string) => void;
  onViewAll?: () => void;
  valueIcon?: string;
  valueSuffix?: string;
}) {
  return (
    <View style={styles.kingCard}>
      <View style={styles.kingCardHead}>
        <View style={ROW_CENTER}>
          <MaterialCommunityIcons name={icon as any} size={18} color="#FFD700" />
          <Text style={styles.kingCardTitle}>{title}</Text>
        </View>
        <TouchableOpacity onPress={onViewAll} disabled={!onViewAll}>
          <Text style={styles.kingViewAll}>View All ›</Text>
        </TouchableOpacity>
      </View>

      {rows.length === 0 ? (
        <Text style={styles.kingEmpty}>Is mahine abhi koi nahi</Text>
      ) : (
        rows.map((r, i) => (
          <TouchableOpacity
            key={r.id}
            style={styles.kingRow}
            activeOpacity={onRowPress ? 0.7 : 1}
            onPress={() => onRowPress && onRowPress(r.id)}
          >
            <Text style={[styles.kingRank, { color: RANK_COLORS[i] }]}>{i + 1}</Text>
            <Image
              source={{ uri: r.img || DEFAULT_AVATAR }}
              style={styles.kingAvatar}
            />
            <View style={{ flex: 1 }}>
              <View style={ROW_CENTER}>
                <Text style={styles.kingName} numberOfLines={1}>
                  {r.name}
                </Text>
                <UserTick uid={r.id} verified={r.verified} verifiedColor={r.verifiedColor} faceVerified={r.faceVerified} size={14} whiteColor="#f8fbff" />
              </View>
              <View style={ROW_CENTER}>
                <MaterialCommunityIcons name={valueIcon as any} size={13} color="#FFD700" />
                <Text style={styles.kingStars}>
                  {fmtStars(r.stars)}
                  {valueSuffix}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
});

// Banner apni state khud sambhalta hai => har 3 sec par poora page re-render nahi hota
const BannerSlider = memo(function BannerSlider({ paused }: { paused?: boolean }) {
  const [active, setActive] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (paused) return; // search khula hai => timer band, kaam kam
    const timer = setTimeout(() => {
      const next = (active + 1) % TRENDING_BANNERS_DATA.length;
      scrollRef.current?.scrollTo({ x: next * BANNER_W, animated: true });
      setActive(next);
    }, 3000);
    return () => clearTimeout(timer);
  }, [active, paused]);

  const onScrollEnd = useCallback((e: any) => {
    setActive(Math.round(e.nativeEvent.contentOffset.x / BANNER_W));
  }, []);

  return (
    <View style={styles.pinkSliderBannerContainer}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        snapToInterval={BANNER_W}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={{ width: '100%', height: '100%' }}
      >
        {TRENDING_BANNERS_DATA.map((src, index) => (
          <View key={index} style={styles.pinkSliderBanner}>
            <Image source={src} style={styles.bannerImageMainElement} resizeMode="cover" />
          </View>
        ))}
      </ScrollView>

      <View style={styles.sliderDotIndicatorRow}>
        {TRENDING_BANNERS_DATA.map((_, i) => (
          <View
            key={i}
            style={[styles.sliderDotMesh, active === i && styles.activeDot]}
          />
        ))}
      </View>
    </View>
  );
});

const BottomNav = memo(function BottomNav({ pathname }: { pathname: string }) {
  const router = useRouter();
  const getIconColor = (path: string) => (pathname === path ? '#3498db' : '#fff');

  const goProfile = () => {
    const user = auth.currentUser;
    if (!user) {
      router.push('/login');
      return;
    }
    router.replace('/profile');
  };

  return (
    <View style={styles.bottomSection}>
      <View style={styles.bottomNav}>
        {/* HOME */}
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/')}>
          <Ionicons name="home-outline" size={26} color={getIconColor('/')} />
        </TouchableOpacity>

        {/* SEARCH (ACTIVE ON THIS PAGE) */}
        <TouchableOpacity style={styles.navItem} onPress={() => { if (pathname !== '/explore') router.replace('/explore'); }}>
          <Ionicons name="search" size={26} color="#3498db" />
        </TouchableOpacity>

        {/* PLUS */}
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/camera')}>
          <View style={styles.plusBtn}>
            <Text style={styles.plusText}>+</Text>
          </View>
        </TouchableOpacity>

        {/* MESSAGE */}
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/messages')}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={26}
            color={getIconColor('/messages')}
          />
        </TouchableOpacity>

        {/* PROFILE */}
        <TouchableOpacity style={styles.navItem} onPress={goProfile}>
          <Ionicons name="person-outline" size={26} color={getIconColor('/profile')} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

/* ------------------------------------------------------------------ */
/*  HOME CONTENT - memo => search type karte waqt re-render nahi hota   */
/*  Hamesha mounted rehta hai (search me sirf hide) => wapas aate hi    */
/*  instant, banners / lists dobara build nahi hote                     */
/* ------------------------------------------------------------------ */

const HIDDEN_STYLE = { display: 'none' as const, height: 0 };
const HOME_WRAP = { flex: 1 };

const HomeContent = memo(function HomeContent({
  hidden,
  refreshControl,
  topVideos,
  giftKings,
  kingStar,
  kingAgencies,
  kingFamilies,
  openUser,
  renderTopVideo,
  renderGiftKing,
  openAllVideos,
}: any) {
  const router = useRouter();
  const goAgencyTop = useCallback(() => router.push('../AgencyTop' as any), [router]);
  const goFamily = useCallback(() => router.push('../family' as any), [router]);
  const openFamily = useCallback(
    (id: string) => router.push({ pathname: '/familyDetail', params: { id } } as any),
    [router]
  );

  return (
    <View style={hidden ? HIDDEN_STYLE : HOME_WRAP}>
        <ScrollView
          style={SCROLL_STYLE}
          contentContainerStyle={SCROLL_CONTENT}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical
          refreshControl={refreshControl}
        >
          <BannerSlider paused={hidden} />

          {/* DYNAMIC SCROLLABLE PLATFORM ACCESS TOKENS ROW */}
          <ScrollView
            horizontal
            style={styles.trophyRow}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={TROPHY_CONTENT}
          >
            {TROPHY_ITEMS.map((t) => (
              <TouchableOpacity
                key={t.label}
                style={styles.trophyBox}
                activeOpacity={0.8}
                onPress={() => {
                  if (t.route) router.push(t.route as any);
                }}
              >
                <View style={styles.trophyIconContainer}>
                  <Ionicons name={t.icon as any} size={22} color="#f1c40f" />
                </View>
                <Text style={styles.trophyBoxLabelText}>{t.label}</Text>
                <Text style={styles.trophyBoxSubLabelText}>{t.note}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* TOP VIDEO */}
          <View style={styles.topVideoBox}>
          <View style={[styles.sectionHead, TV_HEAD]}>
            <View style={styles.sectionHeadingWrapper}>
              <MaterialCommunityIcons name="emoticon-happy" size={20} color="#FFD700" style={{ marginRight: 6 }} />
              <Text style={styles.sectionTitle}>Top Video</Text>
            </View>
            <TouchableOpacity
              onPress={openAllVideos}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.viewsText}>
                All View{' '}
                <Ionicons name="chevron-forward" size={13} color="#f1c40f" />
              </Text>
            </TouchableOpacity>
          </View>

          {/* sirf 3 card => FlatList ki zarurat nahi, seedha row (fast) */}
          <View style={TOPVIDEO_ROW}>
            {topVideos.length > 0
              ? topVideos.slice(0, TOP_PREVIEW).map((item: any, index: number) => (
                  <React.Fragment key={item.id}>{renderTopVideo({ item, index })}</React.Fragment>
                ))
              : [0, 1, 2].map((i) => <View key={i} style={styles.topVideoCard} />)}
          </View>

          </View>

          {/* TOPKING STAR */}
          <View style={[styles.sectionHead, { marginTop: 14 }]}>
            <View style={styles.sectionHeadingWrapper}>
              {/* Logo: apna TopKing logo chahiye to is View ko <Image source={require(...)} /> se badal do */}
              <View style={styles.kingLogo}>
                <MaterialCommunityIcons name="crown" size={16} color="#000" />
              </View>
              <Text style={styles.sectionTitle}>TopKing Star</Text>
            </View>
            <Text style={styles.viewsText}>This Month · {getDaysLeftInMonth()}d left</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.kingScroll}
          >
            <RankCard
              title="Top Star"
              icon="star-circle"
              rows={kingStar}
              onRowPress={openUser}
            />
            <RankCard
              title="Top Agency"
              icon="office-building"
              rows={kingAgencies}
              onViewAll={goAgencyTop}
            />
            <RankCard
              title="Top Family"
              icon="home-heart"
              rows={kingFamilies}
              valueIcon="fire"
              onRowPress={openFamily}
              onViewAll={goFamily}
            />
          </ScrollView>

          {/* STAR UP EARNING */}
          <View style={styles.sectionHead}>
            <View style={styles.sectionHeadingWrapper}>
              <Ionicons
                name="heart-sharp"
                size={16}
                color="#f1c40f"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.sectionTitle}>Star Up Earning</Text>
            </View>

            <Text style={styles.viewsText}>
              {' '}
              This Month · {getDaysLeftInMonth()}d left{' '}
              <Ionicons name="chevron-forward" size={13} color="#f1c40f" />
            </Text>
          </View>

          <FlatList
            horizontal
            data={giftKings}
            keyExtractor={keyById}
            renderItem={renderGiftKing}
            getItemLayout={getGiftKingLayout}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={GIFTKING_CONTENT}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={5}
          />
        </ScrollView>
    </View>
  );
});


/* ------------------------------------------------------------------ */
/*  SCREEN                                                             */
/* ------------------------------------------------------------------ */

export default function ExplorePage() {
  const router = useRouter();
  const pathname = usePathname();

  const [searchQuery, setSearchQuery] = useState('');
  const { blocked: blockedIds } = useBlockedIds();
  const [rawSearchResults, setSearchResults] = useState<any[]>([]);
  const [rawVideoResults, setVideoResults] = useState<any[]>([]);
  // BLOCK: search me blocked users / unke videos nahi dikhenge
  const searchResults = useMemo(() => rawSearchResults.filter((u: any) => !blockedIds.has(u.id)), [rawSearchResults, blockedIds]);
  const videoResults = useMemo(() => rawVideoResults.filter((v: any) => !blockedIds.has(v.userId)), [rawVideoResults, blockedIds]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'accounts' | 'videos'>('accounts');

  // cache se start => screen khulte hi data dikhta hai (blank/spinner nahi)
  const [profileImg, setProfileImg] = useState(homeCache.profileImg);
  const [giftKings, setGiftKings] = useState<any[]>(
    homeCache.giftKingsMonth === getMonthKey() ? homeCache.giftKings : []
  );
  const [topVideos, setTopVideos] = useState<any[]>(homeCache.topVideos.slice(0, TOP_PREVIEW));
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // TopKing Star: creators / spenders / agencies (is mahine ke top 3)
  const [kingStar, setKingStar] = useState<any[]>(
    homeCache.kingMonth === getMonthKey() ? homeCache.kingStar : []
  );
  const [kingAgencies, setKingAgencies] = useState<any[]>(homeCache.kingAgencies);
  const [kingFamilies, setKingFamilies] = useState<any[]>(homeCache.kingFamilies);

  // tab bar poori screen width ka hai - pehle frame se hi sahi width
  const [tabBarWidth, setTabBarWidth] = useState(width);

  const tabAnim = useRef(new Animated.Value(0)).current; // 0 = accounts, 1 = videos
  const resultsFade = useRef(new Animated.Value(0)).current;
  const searchReqId = useRef(0);
  const searchDebounceRef = useRef<any>(null);

  // latest lists ko press handlers me bina re-create kiye use karne ke liye
  const videoResultsRef = useRef<any[]>([]);
  const topVideosRef = useRef<any[]>([]);
  videoResultsRef.current = videoResults;
  topVideosRef.current = topVideos;

  const hasQuery = searchQuery.length > 0;

  /* ---------------- DATA LOADERS ---------------- */

  const getCurrentUserProfile = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      if (userSnap.exists()) {
        const img = userSnap.data().profileImg || '';
        homeCache.profileImg = img;
        setProfileImg(img);
      }
    } catch (error) {
      console.log(error);
    }
  };

  // Firestore me hi orderBy + limit => sirf jitna dikhana hai utna hi download
  const loadTopVideos = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, 'all_videos'), orderBy('views', 'desc'), limit(TOP_PREVIEW))
      );
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      arr.forEach((v: any) => {
        if (v.thumbnail) Image.prefetch(v.thumbnail).catch(() => {});
      });
      homeCache.topVideos = arr;
      setTopVideos(arr);
    } catch (e) {
      console.log(e);
    }
  };

  // Sirf is mahine ke stars => naya mahina shuru hote hi list khali (0 se start)
  const loadGiftKing = async (force = false) => {
    try {
      const monthKey = getMonthKey();
      // wallets ka ek hi shared fetch (TopKing Star ke saath share hota hai)
      const [{ base, floor }, walletRows] = await Promise.all([
        ensureBaseline(monthKey),
        fetchTopWallets(force),
      ]);

      const ranked = walletRows
        .map((w) => {
          const total = w.data.receivedStars || 0;
          const startTotal = base[w.id] ?? floor;
          return { id: w.id, gifts: Math.max(0, total - startTotal), level: w.data.level || 1 };
        })
        .filter((x) => x.gifts > 0)
        .sort((x, y) => y.gifts - x.gifts)
        .slice(0, 10);

      const users = await Promise.all(
        ranked.map(async (r) => {
          const u: any = await getUserCached(r.id);
          if (!u) return null;
          levelCache.set(r.id, r.level);
          // sirf wahi fields jo card me chahiye => halka state, halka disk cache
          return {
            id: r.id,
            gifts: r.gifts,
            level: r.level,
            username: u.username || u.name || 'user',
            profileImg: u.profileImg || '',
          };
        })
      );

      const result = users.filter(Boolean) as any[];
      result.forEach((r: any) => {
        if (r.profileImg) Image.prefetch(r.profileImg).catch(() => {});
      });
      homeCache.giftKings = result;
      homeCache.giftKingsMonth = monthKey;
      setGiftKings(result);
    } catch (e) {
      console.log(e);
    }
  };

  // Har section apni baari par khud dikhta hai => sabse slow wale ka intezaar nahi
  // Fail hone par purana (cached) data hata ke khali nahi karte
  const loadTopKing = (force = false) => {
    const monthKey = getMonthKey();
    return Promise.all([
      loadMonthTop3('receivedStars', force)
        .then((rows) => {
          homeCache.kingStar = rows;
          homeCache.kingMonth = monthKey;
          setKingStar(rows);
        })
        .catch(() => {}),
      loadTopAgencies()
        .then((rows) => {
          homeCache.kingAgencies = rows;
          setKingAgencies(rows);
        })
        .catch(() => {}),
      loadTopFamilies()
        .then((rows) => {
          homeCache.kingFamilies = rows;
          setKingFamilies(rows);
        })
        .catch(() => {}),
    ]);
  };

  // Mount: pehle disk cache se turant dikhao (app restart ke baad bhi),
  // phir sirf tab fetch karo jab data purana ho
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!homeCache.ts) {
        const saved = await homeDiskPromise;
        if (saved && alive && !homeCache.ts) {
          Object.assign(homeCache, saved);
          const m = getMonthKey();
          setProfileImg(saved.profileImg || '');
          setTopVideos((saved.topVideos || []).slice(0, TOP_PREVIEW));
          if (saved.giftKingsMonth === m) setGiftKings(saved.giftKings || []);
          if (saved.kingMonth === m) setKingStar(saved.kingStar || []);
          setKingAgencies(saved.kingAgencies || []);
          setKingFamilies(saved.kingFamilies || []);
        }
      }

      const fresh =
        Date.now() - homeCache.ts < HOME_TTL &&
        homeCache.topVideos.length > 0 &&
        homeCache.giftKingsMonth === getMonthKey();
      if (fresh || !alive) return;

      await Promise.all([
        loadTopVideos(),
        loadGiftKing(),
        loadTopKing(),
        getCurrentUserProfile(),
      ]);
      homeCache.ts = Date.now();
      saveHomeToDisk();
      // All View pehle se tayyar => click par instant khulta hai
      fetchAllVideosPage();
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      videoCache = null; // search cache bhi naya
      allVideosCache = null;
      searchCache.clear();
      userDocCache.clear();
      await Promise.all([
        loadTopVideos(),
        loadGiftKing(true),
        getCurrentUserProfile(),
        loadTopKing(true),
      ]);
      homeCache.ts = Date.now();
      saveHomeToDisk();
    } catch (e) {
      console.log(e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  /* ---------------- SEARCH ---------------- */

  const clearSearch = useCallback(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchReqId.current++;
    Keyboard.dismiss();
    setSearchQuery('');
    setLoading(false);
    setSearchResults([]);
    setVideoResults([]);
    setActiveTab('accounts');
    tabAnim.setValue(0);
  }, [tabAnim]);

  const runSearch = useCallback(async (text: string) => {
    const term = cleanTerm(text);
    const reqId = ++searchReqId.current;

    if (!term) {
      setSearchResults([]);
      setVideoResults([]);
      setLoading(false);
      return;
    }

    // same term dobara (backspace etc.) => instant, Firestore ko haath nahi
    const hit = getFreshSearch(term);
    if (hit) {
      setSearchResults(hit.users);
      setVideoResults(hit.vids);
      setLoading(false);
      return;
    }

    try {
      const [users, vids] = await Promise.all([
        searchAccounts(term),
        searchVideos(term),
      ]);
      if (reqId !== searchReqId.current) return; // purana result ignore

      searchCache.set(term, { ts: Date.now(), users, vids });
      if (searchCache.size > 30) {
        searchCache.delete(searchCache.keys().next().value as string);
      }

      setSearchResults(users);
      setVideoResults(vids);
    } catch (error) {
      console.error('Search Error:', error);
    } finally {
      if (reqId === searchReqId.current) setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(
    (text: string) => {
      setSearchQuery(text);

      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

      if (text.trim().length === 0) {
        searchReqId.current++;
        setLoading(false);
        setSearchResults([]);
        setVideoResults([]);
        return;
      }

      setLoading(true);

      // cached term => bina wait ke, nahi to 300ms debounce
      const delay = getFreshSearch(cleanTerm(text)) ? 0 : 250;
      searchDebounceRef.current = setTimeout(() => runSearch(text), delay);
    },
    [runSearch]
  );

  // Search box par focus aate hi videos ka cache background me load
  const onSearchFocus = useCallback(() => {
    ensureVideoCache();
  }, []);

  /* ---------------- TABS / ANIMATION ---------------- */

  const switchTab = useCallback(
    (tab: 'accounts' | 'videos') => {
      setActiveTab(tab);
      Animated.timing(tabAnim, {
        toValue: tab === 'accounts' ? 0 : 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [tabAnim]
  );

  const indicatorX = useMemo(
    () =>
      tabAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, tabBarWidth / 2],
      }),
    [tabAnim, tabBarWidth]
  );

  const pagesX = useMemo(
    () =>
      tabAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -tabBarWidth],
      }),
    [tabAnim, tabBarWidth]
  );

  const onTabBarLayout = useCallback((e: any) => {
    setTabBarWidth(e.nativeEvent.layout.width);
  }, []);

  // Search result area fade-in
  useEffect(() => {
    Animated.timing(resultsFade, {
      toValue: hasQuery ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [hasQuery, resultsFade]);

  /* ---------------- BACK BUTTON ---------------- */

  // hasQuery boolean par depend => har keystroke par re-subscribe nahi hota
  useEffect(() => {
    const handleBackButton = () => {
      if (showAll) {
        setShowAll(false);
        return true;
      }
      if (hasQuery) {
        clearSearch();
        return true;
      }
      try {
        if (router.canGoBack()) router.back();
        else router.replace('/');
      } catch (error) {
        console.log('Navigation Error: ', error);
        router.replace('/');
      }
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', handleBackButton);
    return () => sub.remove();
  }, [router, hasQuery, showAll, clearSearch]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  /* ---------------- STABLE PRESS HANDLERS + RENDERERS ---------------- */

  const openUser = useCallback(
    (id: string) => router.push({ pathname: '/userProfile', params: { userId: id } }),
    [router]
  );

  const openSearchVideo = useCallback(
    (id: string, index: number) =>
      router.push({
        pathname: '/allvideo',
        params: {
          videoId: id,
          videos: JSON.stringify(videoResultsRef.current),
          index,
          from: 'explore',
        },
      }),
    [router]
  );

  const openTopVideo = useCallback(
    (id: string, index: number) =>
      router.push({
        pathname: '/allvideo',
        params: {
          videoId: id,
          videos: JSON.stringify(topVideosRef.current),
          index,
          from: 'explore',
        },
      }),
    [router]
  );

  const openAllVideos = useCallback(() => setShowAll(true), []);
  const closeAllVideos = useCallback(() => setShowAll(false), []);
  const openAllVideoItem = useCallback(
    (id: string, index: number, list: any[]) => {
      // poori list route params me bhejna bhaari hai => sirf aas-paas ke 30
      const start = Math.max(0, index - 5);
      router.push({
        pathname: '/allvideo',
        params: {
          videoId: id,
          videos: JSON.stringify(list.slice(start, start + 30)),
          index: index - start,
          from: 'explore',
        },
      });
    },
    [router]
  );

  const renderUser = useCallback(
    ({ item }: any) => <UserCard item={item} onPress={openUser} />,
    [openUser]
  );
  const renderSearchVideo = useCallback(
    ({ item, index }: any) => (
      <SearchVideoCard item={item} index={index} onPress={openSearchVideo} />
    ),
    [openSearchVideo]
  );
  const renderTopVideo = useCallback(
    ({ item, index }: any) => (
      <TopVideoCard item={item} index={index} onPress={openTopVideo} />
    ),
    [openTopVideo]
  );
  const renderGiftKing = useCallback(
    ({ item, index }: any) => (
      <GiftKingCard item={item} index={index} onPress={openUser} />
    ),
    [openUser]
  );

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor="#FFD700"
        colors={['#FFD700']}
      />
    ),
    [refreshing, onRefresh]
  );

  /* ---------------- RENDER ---------------- */

  return (
    <SafeAreaView style={styles.container}>
      {/* SEARCH HEADER */}
      <View style={styles.header}>
        {/* Profile Image Left Side */}
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => router.push('/profile')}
        >
          <Image
            source={{ uri: profileImg || DEFAULT_AVATAR }}
            style={styles.profileHeaderImage}
          />
        </TouchableOpacity>

        {/* Search Box */}
        <View style={styles.searchBarWrapper}>
          <Ionicons
            name="search-outline"
            size={18}
            color="rgba(255,255,255,0.4)"
            style={styles.searchIconFrame}
          />

          <TextInput
            style={styles.searchInput}
            placeholder="Search accounts or videos..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={searchQuery}
            onChangeText={handleSearch}
            onFocus={onSearchFocus}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />

          {loading && (
            <ActivityIndicator size="small" color="#f1c40f" style={{ marginRight: 10 }} />
          )}
        </View>
      </View>

      {/* HOME CONTENT (hamesha mounted => search band karne par dobara build nahi hota) */}
      <HomeContent
        hidden={hasQuery}
        refreshControl={refreshControl}
        topVideos={topVideos}
        giftKings={giftKings}
        kingStar={kingStar}
        kingAgencies={kingAgencies}
        kingFamilies={kingFamilies}
        openUser={openUser}
        renderTopVideo={renderTopVideo}
        renderGiftKing={renderGiftKing}
        openAllVideos={openAllVideos}
      />

      {/* SEARCH RESULTS: Accounts | Videos tabs */}
      {hasQuery && (
        <Animated.View style={[RESULTS_WRAP, { opacity: resultsFade }]}>
          {/* TAB BAR */}
          <View style={styles.tabBar} onLayout={onTabBarLayout}>
            <TouchableOpacity
              style={styles.tabBtn}
              activeOpacity={0.7}
              onPress={() => switchTab('accounts')}
            >
              <Ionicons
                name="person-outline"
                size={15}
                color={activeTab === 'accounts' ? '#FFD700' : 'rgba(255,255,255,0.45)'}
              />
              <Text
                style={[styles.tabText, activeTab === 'accounts' && styles.tabTextActive]}
              >
                Accounts{searchResults.length > 0 ? ` (${searchResults.length})` : ''}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tabBtn}
              activeOpacity={0.7}
              onPress={() => switchTab('videos')}
            >
              <Ionicons
                name="play-circle-outline"
                size={16}
                color={activeTab === 'videos' ? '#FFD700' : 'rgba(255,255,255,0.45)'}
              />
              <Text
                style={[styles.tabText, activeTab === 'videos' && styles.tabTextActive]}
              >
                Videos{videoResults.length > 0 ? ` (${videoResults.length})` : ''}
              </Text>
            </TouchableOpacity>

            {/* sliding underline */}
            <Animated.View
              style={[
                styles.tabIndicator,
                { width: tabBarWidth / 2, transform: [{ translateX: indicatorX }] },
              ]}
            />
          </View>

          {/* PAGES (slide left/right) */}
          <View style={{ flex: 1, overflow: 'hidden' }}>
            <Animated.View
              style={{
                flex: 1,
                flexDirection: 'row',
                width: tabBarWidth * 2,
                transform: [{ translateX: pagesX }],
              }}
            >
              {/* ACCOUNTS PAGE */}
              <View style={{ width: tabBarWidth }}>
                <FlatList
                  data={searchResults}
                  keyExtractor={keyById}
                  renderItem={renderUser}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  contentContainerStyle={ACCOUNTS_CONTENT}
                  initialNumToRender={10}
                  maxToRenderPerBatch={10}
                  windowSize={7}
                  removeClippedSubviews={false}
                  ListEmptyComponent={
                    !loading ? <Text style={styles.emptyText}>No accounts found</Text> : null
                  }
                />
              </View>

              {/* VIDEOS PAGE */}
              <View style={{ width: tabBarWidth }}>
                <FlatList
                  data={videoResults}
                  keyExtractor={keyById}
                  renderItem={renderSearchVideo}
                  numColumns={3}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  columnWrapperStyle={VIDEOS_COLUMN}
                  contentContainerStyle={VIDEOS_CONTENT}
                  initialNumToRender={12}
                  maxToRenderPerBatch={9}
                  windowSize={5}
                  removeClippedSubviews={false}
                  ListEmptyComponent={
                    !loading ? <Text style={styles.emptyText}>No videos found</Text> : null
                  }
                />
              </View>
            </Animated.View>
          </View>
        </Animated.View>
      )}

      {/* ALL VIDEOS (All View click par) */}
      {showAll && <AllVideosScreen onClose={closeAllVideos} onOpen={openAllVideoItem} />}

      {/* BOTTOM NAVBAR */}
      <BottomNav pathname={pathname} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08080a' },
  header: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#08080a',
    marginTop: Platform.OS === 'ios' ? 45 : 30,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  
  // CHANGED: SEARCH BOX WRAPPER ME GOLDEN MESH PARAT (BORDER OVERLAY) CHADHA DIYA HAI
  searchBarWrapper: {
    flex: 1,
    height: 44,
    backgroundColor: '#11121a',
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderWidth: 1.5,                      // Thicker premium parat
    borderColor: 'rgba(241,196,15,0.25)'  // Perfectly matches the trophyBox theme color
  },
  
  searchIconFrame: { marginRight: 8 },
  searchInput: {
    flex: 1,
    height: '100%',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600'
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#08080a',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabText: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#FFD700' },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#FFD700',
  },
  searchVideoCard: {
    flex: 1 / 3,
    aspectRatio: 0.62,
    maxWidth: '33%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  searchVideoImage: { width: '100%', height: '100%' },
  searchVideoShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 46,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  searchVideoMeta: {
    position: 'absolute',
    left: 6,
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  searchVideoViews: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  searchVideoCaption: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 5,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#11121a',
    borderRadius: 16,
    marginBottom: 10,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.02)'
  },
  userAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 14, backgroundColor: '#1a1b24' },
  userTextInfo: { flex: 1 },
  userName: { color: '#ffffff', fontSize: 14, fontWeight: '700', letterSpacing: 0.1 },
  userSub: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2, fontWeight: '500' },
  emptyText: { color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 30, fontSize: 13, fontWeight: '500' },
  
  // SLIDER CONTAINMENT
  pinkSliderBannerContainer: {
    width: width - 32,
    height: 160, 
    alignSelf: 'center',
    marginTop: 16,
    position: 'relative',
    backgroundColor: '#11121a',
    borderRadius: 12,
    overflow: 'hidden'
  },
  pinkSliderBanner: { 
    width: width - 32, 
    height: '100%', 
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden', 
  },
  bannerImageMainElement: {
    width: '100%',
    height: '100%',
    alignSelf: 'center'
  },
  sliderDotIndicatorRow: { flexDirection: 'row', alignItems: 'center', position: 'absolute', bottom: 12, alignSelf: 'center', zIndex: 10, backgroundColor: 'rgba(0, 0, 0, 0.5)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }, 
  sliderDotMesh: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)', marginHorizontal: 4 },
  activeDot: { width: 12, backgroundColor: '#ebd500', borderRadius: 3 },
  
  trophyRow: { paddingVertical: 10 },

  // TROPHY BOX PREMIUM PARAT
  trophyBox: { 
    alignItems: 'center', 
    width: (width - 90) / 2.5, 
    height: 100,
    backgroundColor: '#11121a', 
    marginRight: 7, 
    padding: 14.5, 
    borderRadius: 20,       
    borderWidth: 1.3,
borderColor: "#FFD700",
  },

profileButton: {
  marginRight: 10,
},

profileHeaderImage: {
  width: 42,
  height: 42,
  borderRadius: 21,
  borderWidth: 2,
  borderColor: '#f1c40f',
},

  
  trophyIconContainer: { 
    width: 34, 
    height: 34, 
    borderRadius: 17, 
    backgroundColor: 'rgba(241,196,15,0.05)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 6,
    borderWidth: 2, 
    borderColor: 'rgba(255, 230, 0, 0.25)' 
  },
  
  trophyBoxLabelText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  trophyBoxSubLabelText: { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '600', marginTop: 2 },
  
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 4 },
  sectionHeadingWrapper: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { color: '#ffffff', fontWeight: '900', fontSize: 15, letterSpacing: 0.2 },
  viewsText: { color: '#f1c40f', fontSize: 12, fontWeight: '700', flexDirection: 'row', alignItems: 'center' },
  
  rankRow: { flexDirection: 'row', paddingHorizontal: 12, marginTop: 12 },
  rankCard: { flex: 1, backgroundColor: '#11121a', marginHorizontal: 4, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)' },
  rankTitle: { color: '#f1c40f', fontWeight: '800', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.04)', paddingBottom: 6, marginBottom: 10 },
  rankCardRowLine: { flexDirection: 'row', alignItems: 'center' },
  rankNumberBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(241,200,15,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  rankNumberText: { color: '#f1c40f', fontSize: 10, fontWeight: '900' },
  rankUserText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', flex: 1 },
  
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#000',
    paddingBottom: Platform.OS === 'ios' ? 40 : 25,
    paddingTop: 5,
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 90,
  },
  navItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  plusBtn: {
    width: 48,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f1c40f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusText: { fontSize: 28, fontWeight: 'bold', color: '#000', marginTop: -4 },


verifiedBadge: {
  marginLeft: 6,
  justifyContent: "center",
  alignItems: "center",
},

levelBadge: {
  marginLeft: 6,
  flexDirection: "row",
  alignItems: "center",
  borderWidth: 1,
  paddingHorizontal: 8,
  paddingVertical: 3,
  borderRadius: 20,
},

topVideoCard:{
width:TV_CARD_W,
height:TV_CARD_H,
marginRight:TV_GAP,
borderRadius:10,
overflow:"hidden",
backgroundColor:"#111",
},

topVideoBox:{
marginHorizontal:16,
marginTop:6,
marginBottom:6,
backgroundColor:"#232427",
borderRadius:16,
borderWidth:1,
borderColor:"rgba(255,255,255,0.06)",
padding:TV_PAD,
overflow:"hidden",
},

tvCaption:{
position:"absolute",
left:6,
right:6,
bottom:6,
backgroundColor:"rgba(0,0,0,0.55)",
borderRadius:6,
paddingVertical:4,
paddingHorizontal:6,
},

tvCaptionText:{
color:"#fff",
fontSize:10,
fontWeight:"bold",
textAlign:"center",
},

topVideoImage:{
width:"100%",
height:"100%",
},

viewBox:{
position:"absolute",
top:8,
left:8,
flexDirection:"row",
alignItems:"center",
backgroundColor:"rgba(0,0,0,0.45)",
paddingHorizontal:6,
paddingVertical:2,
borderRadius:10,
},

viewText:{
color:"#fff",
fontSize:11,
marginLeft:3,
fontWeight:"bold",
},




giftKingCard: {
  width: 140,
  backgroundColor: "#11121a",
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "#FFD700",
  marginRight: 12,
  padding: 12,
  alignItems: "center",
},

rankCircle: {
  width: 20,
  height: 20,
  borderRadius: 12,
  backgroundColor: "#FFD700",
  justifyContent: "center",
  alignItems: "center",
  marginBottom: 8,
},

rankText: {
  color: "#000",
  fontWeight: "bold",
  fontSize: 12,
},

giftKingImage: {
  width: 65,
  height: 65,
  borderRadius: 33,
  marginBottom: 8,
},

giftKingName: {
  color: "#fff",
  fontWeight: "bold",
  fontSize: 12,
},

giftKingGift: {
  color: "#FFD700",
  marginTop: 8,
  fontWeight: "bold",
},

kingLogo: {
  width: 24,
  height: 24,
  borderRadius: 12,
  backgroundColor: '#FFD700',
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: 6,
},
kingScroll: { paddingHorizontal: 14, paddingTop: 8 },
kingCard: {
  width: width * 0.62,
  backgroundColor: '#11121a',
  borderRadius: 16,
  borderWidth: 1,
  borderColor: 'rgba(255,215,0,0.35)',
  padding: 12,
  marginRight: 10,
},
kingCardHead: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 10,
},
kingCardTitle: { color: '#fff', fontWeight: '800', fontSize: 13, marginLeft: 6 },
kingViewAll: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600' },
kingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
kingRank: { width: 18, fontWeight: '900', fontSize: 15 },
kingAvatar: { width: 38, height: 38, borderRadius: 19, marginRight: 10, backgroundColor: '#1a1b24' },
kingName: { color: '#fff', fontWeight: '700', fontSize: 13, flexShrink: 1 },
kingStars: { color: '#FFD700', fontWeight: '700', fontSize: 12, marginLeft: 3 },
allOverlay: {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: '#08080a',
  paddingTop: Platform.OS === 'ios' ? 45 : 30,
},
allHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 16,
  paddingVertical: 12,
  borderBottomWidth: 1,
  borderColor: 'rgba(255,255,255,0.05)',
},
allTitle: { color: '#fff', fontSize: 17, fontWeight: '800', marginLeft: 10 },
kingEmpty: { color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'center', paddingVertical: 20 },

});     
