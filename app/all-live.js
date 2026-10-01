import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';

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

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import BottomNav from "../components/BottomNav";

let db;

try {
  const firebaseModule = require('./firebaseConfig');
  db = firebaseModule.db;
} catch (e) {
  try {
    const firebaseModuleFallback = require('../firebaseConfig');
    db = firebaseModuleFallback.db;
  } catch (err) {
    console.log("Firebase config file not found.");
  }
}

import { collection, onSnapshot } from 'firebase/firestore';

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
// HEARTBEAT SETTINGS
// ------------------------------------

// Host LiveRoom se har ~20 sec me `hostHeartbeat` likhta hai.
// Timeout lamba hai taaki background/doze me live band na dikhe;
// host live band kare to room doc delete hota hai.
const HEARTBEAT_TIMEOUT = 10 * 60 * 1000;
const HEARTBEAT_CHECK_INTERVAL = 30 * 1000;

// ------------------------------------
// BANNERS
// ------------------------------------

const TRENDING_BANNERS_DATA = [
  require('../assets/images/banner1.jpeg'),
  require('../assets/images/banner2.jpeg'),
  require('../assets/images/banner3.jpeg'),
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

// ------------------------------------
// ONE SHARED "LIVE" PULSE
// ------------------------------------
// Har card ka apna animation loop banane ke bajay ek hi native-driver
// loop sab cards share karte hain (kam CPU, smooth scroll).

const livePulse = new Animated.Value(1);

// ------------------------------------
// LIVE CARD
// ------------------------------------

const LiveCard = memo(function LiveCard({ stream, onPress }) {
  const handlePress = useCallback(() => onPress(stream), [onPress, stream]);

  return (
    <TouchableOpacity
      style={styles.liveCard}
      activeOpacity={0.88}
      onPress={handlePress}
    >
      {/* Host / room banner */}
      <Image
        source={{ uri: stream.roomCover }}
        style={styles.cardImage}
        resizeMode="cover"
      />

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

      {/* LIVE badge */}
      <View style={styles.liveBadge}>
        <Animated.View style={[styles.liveDot, { opacity: livePulse }]} />
        <Text style={styles.liveBadgeText}>LIVE</Text>
      </View>

      {/* Viewer count (real time, = people inside the room) */}
      <View style={styles.viewerPill}>
        <Ionicons name="people" size={12} color="#fff" />
        <Text style={styles.viewerText}>{fmtCount(stream.users)}</Text>
      </View>

      {/* Host info */}
      <View style={styles.bottomInfo}>
        <View style={styles.avatarRing}>
          <Image source={{ uri: stream.hostImg }} style={styles.profilePic} />
        </View>

        <View style={styles.bottomTextCol}>
          <Text style={styles.hostName} numberOfLines={1}>
            {stream.host}
          </Text>
          <Text style={styles.roomTitle} numberOfLines={1}>
            {stream.title}
          </Text>
        </View>

        <View style={styles.typeBadge}>
          <Ionicons
            name={stream.type === 'video' ? 'videocam' : 'mic'}
            size={14}
            color="#fff"
          />
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ------------------------------------
// BANNER SLIDER (own state => 3s tick never re-renders the live list)
// ------------------------------------

const TrendingBanner = memo(function TrendingBanner() {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef(null);
  const indexRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      let next = indexRef.current + 1;
      if (next >= TRENDING_BANNERS_DATA.length) next = 0;
      indexRef.current = next;
      scrollRef.current?.scrollTo({ x: next * BANNER_WIDTH, animated: true });
      setActiveIndex(next);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  const onScrollEnd = useCallback((e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / BANNER_WIDTH);
    indexRef.current = idx;
    setActiveIndex(idx);
  }, []);

  return (
    <View style={styles.bannerContainer}>
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

  const [activeTab, setActiveTab] = useState('audio');
  const [liveStreams, setLiveStreams] = useState([]);
  const [loading, setLoading] = useState(true);

  // Heartbeat React state me nahi: har 20s ke heartbeat par re-render hota tha.
  const heartbeatMapRef = useRef({});
  const lastStreamsSigRef = useRef('');

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

    const sub = BackHandler.addEventListener('hardwareBackPress', handleBackButton);
    return () => sub.remove();
  }, [router]);

  // ------------------------------------
  // SHARED LIVE-DOT PULSE (one loop for all cards)
  // ------------------------------------

  useEffect(() => {
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
  }, []);

  // ------------------------------------
  // OPEN ROOM
  // ------------------------------------
  // NOTE: pehle yahan `joinedUsers` me arrayUnion hota tha jo kabhi remove
  // nahi hota tha (isi wajah se count sirf badhta tha). Ab LiveRoom khud
  // `audience` me join/leave handle karta hai aur host real-time
  // `viewerCount` likhta hai, isliye yahan koi write nahi chahiye.

  const openLiveRoom = useCallback((stream) => {
    if (stream.type === 'video') {
      router.push({
        pathname: '/videolive',
        params: { id: stream.id, role: 'viewer' },
      });
      return;
    }

    router.push({
      pathname: '/LiveRoom',
      params: { id: stream.id, from: 'alllive' },
    });
  }, [router]);

  // ------------------------------------
  // FETCH LIVE ROOMS
  // ------------------------------------

  useEffect(() => {
    if (!db) {
      setLiveStreams([]);
      setLoading(false);
      return;
    }

    let unsubscribe = () => {};

    try {
      unsubscribe = onSnapshot(
        collection(db, 'rooms'),
        (snapshot) => {
          const streams = [];
          const heartbeatMap = {};
          const now = Date.now();
          const oneDay = 24 * 60 * 60 * 1000;

          snapshot.forEach((docItem) => {
            if (!docItem.exists()) return;

            const rawData = docItem.data();

            if (!isRoomAlive(rawData)) return;
            if ((rawData.roomType || 'public') !== 'public') return;

            const roomTime = getTimeInMilliseconds(rawData.createdAt);
            if (roomTime && now - roomTime > oneDay) return;

            const hostImg = validUrl(rawData.hostImg) || validUrl(rawData.profileImg);
            const cover =
              validUrl(rawData.roomCover) ||
              validUrl(rawData.cover) ||
              validUrl(rawData.banner) ||
              validUrl(rawData.roomImg) ||
              hostImg ||
              STABLE_DEFAULT_BANNER;

            heartbeatMap[docItem.id] = getHeartbeatMs(rawData);

            streams.push({
              id: docItem.id,
              title: rawData.title || rawData.roomName || 'Live Broadcast',
              host: rawData.hostName || rawData.host || 'User',
              type: String(rawData.type || 'audio').toLowerCase(),
              // REAL-TIME: host `viewerCount` me room ke andar ke log likhta hai
              // (join -> badhta hai, leave -> ghatta hai).
              users: Math.max(0, Number(rawData.viewerCount) || 0),
              roomCover: cover,
              hostImg: hostImg || STABLE_DEFAULT_AVATAR,
              createdAt: roomTime,
            });
          });

          // Newest first (stable order: count badalne par cards uchhalte nahi)
          streams.sort((a, b) => b.createdAt - a.createdAt);

          heartbeatMapRef.current = heartbeatMap;

          // Heartbeat-only snapshot (list same) -> re-render skip.
          let sig = '';
          try { sig = JSON.stringify(streams); } catch (e) { sig = ''; }
          if (!sig || sig !== lastStreamsSigRef.current) {
            lastStreamsSigRef.current = sig;
            setLiveStreams(streams);
          }
          setLoading(false);
        },
        (error) => {
          console.log('Firebase Sync Error:', error);
          setLiveStreams([]);
          setLoading(false);
        }
      );
    } catch (err) {
      console.log('Firestore Connection Error:', err);
      setLiveStreams([]);
      setLoading(false);
    }

    return () => unsubscribe();
  }, []);

  // ------------------------------------
  // LOCAL HEARTBEAT CLEANUP
  // ------------------------------------

  useEffect(() => {
    const checkTimer = setInterval(() => {
      setLiveStreams((current) => {
        const now = Date.now();
        const filtered = current.filter((stream) => {
          const hb = heartbeatMapRef.current[stream.id];
          if (!hb) return true;
          return now - hb <= HEARTBEAT_TIMEOUT;
        });
        if (filtered.length === current.length) return current;
        lastStreamsSigRef.current = '';
        return filtered;
      });
    }, HEARTBEAT_CHECK_INTERVAL);

    return () => clearInterval(checkTimer);
  }, []);

  // ------------------------------------
  // DERIVED DATA
  // ------------------------------------

  const { filteredStreams, audioCount, videoCount } = useMemo(() => {
    const audio = [];
    const video = [];
    liveStreams.forEach((s) => {
      if (!s) return;
      if (s.type === 'video') video.push(s);
      else if (s.type === 'audio') audio.push(s);
    });
    return {
      filteredStreams: activeTab === 'video' ? video : audio,
      audioCount: audio.length,
      videoCount: video.length,
    };
  }, [liveStreams, activeTab]);

  const setAudio = useCallback(() => setActiveTab('audio'), []);
  const setVideo = useCallback(() => setActiveTab('video'), []);

  // ------------------------------------
  // LIST PARTS
  // ------------------------------------

  const renderItem = useCallback(
    ({ item }) => <LiveCard stream={item} onPress={openLiveRoom} />,
    [openLiveRoom]
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
        </View>
      </View>
    ),
    [activeTab, audioCount, videoCount, setAudio, setVideo]
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
          name={activeTab === 'audio' ? 'mic-off-outline' : 'videocam-off-outline'}
          size={46}
          color="rgba(255,255,255,0.12)"
        />
        <Text style={styles.emptyText}>
          No active {activeTab} rooms live right now
        </Text>
      </View>
    );
  }, [loading, activeTab]);

  // ------------------------------------
  // RENDER
  // ------------------------------------

  return (
    <SafeAreaView style={styles.container}>
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
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      <BottomNav />
    </SafeAreaView>
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
  tabText: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
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
  typeBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(18,0,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
});
