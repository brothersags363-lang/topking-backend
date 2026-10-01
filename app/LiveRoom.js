  import React, { useEffect, useState, useRef, useCallback, memo } from 'react';

  import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Image,
  ScrollView,
  Dimensions,
  TextInput,
  Modal,
  Platform,
  StatusBar,
  BackHandler,
  AppState,
   FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Animated,
  PermissionsAndroid,
  Easing as RNEasing,
  Share,
} from "react-native";


import ReAnimated,{
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { useLocalSearchParams, useRouter, useFocusEffect,  } from 'expo-router';
import { useLive } from '../context/LiveContext';

import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';

import {
  doc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  updateDoc,
  deleteDoc,
  getDoc,
  increment,
  setDoc,
  deleteField,
  addDoc,
  getCountFromServer,
serverTimestamp,
} from 'firebase/firestore';

import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  AudioProfileType,
  AudioScenarioType,
} from "react-native-agora";

import { gifts } from "../assets/giftsData";
import LevelFrame from '../components/LevelFrame';
import { LinearGradient } from 'expo-linear-gradient';
import SeatItem from '../components/live/SeatItem';
import JoinEntry from '../components/live/JoinEntry';
import FloatingHearts from '../components/live/FloatingHearts';
import { ViewersSheet, GiftersSheet, RoomMenuSheet, EmojiStrip } from '../components/live/RoomSheets';
import { T } from '../components/live/liveTheme';

import LottieView from "lottie-react-native";
import { WebView } from "react-native-webview";
import { giftHtml } from "../assets/giftWeb";

import { useSafeAreaInsets } from 'react-native-safe-area-context';

// import LottieView from "lottie-react-native";
// import { gifts } from "../assets/giftsData";

const { width, height } = Dimensions.get('window');
// Join animation: 'auto' (level se) | 'slide' | 'lv10' | 'lv20' | 'lv30' | 'lv40' | 'lv50'
const JOIN_ANIM_VARIANT = 'auto';
const log = __DEV__ ? console.log.bind(console) : () => {};
const STABLE_AVATAR = 'https://avatar.iran.liara.run/public/65';
const SEAT_KEYS = ['seat_1','seat_2','seat_3','seat_4','seat_5','seat_6','seat_7','seat_8'];
const EMPTY_SEAT = {};
const _uidHashCache = new Map();

// Pure-JS SHA-256 (UTF-8 string -> 32 byte array). Server (/token) isi hash se
// Agora UID banata hai, isliye app ko EXACTLY wahi formula chahiye.
const sha256Bytes = (str) => {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];

  // UTF-8 encode
  const bytes = [];
  const utf8 = unescape(encodeURIComponent(str));
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
             (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);

  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const w = new Array(64);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = ((bytes[off + t*4] << 24) | (bytes[off + t*4 + 1] << 16) |
              (bytes[off + t*4 + 2] << 8) | bytes[off + t*4 + 3]) | 0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t-15], 7) ^ rotr(w[t-15], 18) ^ (w[t-15] >>> 3);
      const s1 = rotr(w[t-2], 17) ^ rotr(w[t-2], 19) ^ (w[t-2] >>> 10);
      w[t] = (w[t-16] + s0 + w[t-7] + s1) | 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  const out = [];
  H.forEach(x => out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255));
  return out;
};

// Firebase UID -> Agora numeric UID. server.js /token ke saath 100% same:
// sha256(uid) ke pehle 4 bytes (big-endian) & 0x7fffffff, minimum 1.
const uidToNum = (id) => {
  if (!id) return 0;
  let v = _uidHashCache.get(id);
  if (v === undefined) {
    const b = sha256Bytes(String(id));
    v = (((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) & 0x7fffffff);
    v = Math.max(1, v);
    _uidHashCache.set(id, v);
  }
  return v;
};
const fmtCount = (n = 0) => n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);

// Firebase safety check
let db = null;
let auth = null;
try {
  const firebaseModule = require('./firebaseConfig');
  db = firebaseModule.db;
  auth = firebaseModule.auth;
} catch (e) {
  log("Firebase config not found.");
}


const getLevelTheme = (level = 1) => {

  if(level>=50){
    return{
      bg:"#7B1FFF",
      border:"#FFD700",
      text:"#fff",
      icon:"#FFD700"
    };
  }

  if(level>=40){
    return{
      bg:"#00BFFF",
      border:"#9EF8FF",
      text:"#fff",
      icon:"#fff"
    };
  }

  if(level>=30){
    return{
      bg:"#FF0066",
      border:"#FFB6C1",
      text:"#fff",
      icon:"#fff"
    };
  }

  if(level>=20){
    return{
      bg:"#FFC107",
      border:"#FFE082",
      text:"#000",
      icon:"#fff"
    };
  }

  if(level>=10){
    return{
      bg:"#BDBDBD",
      border:"#fff",
      text:"#fff",
      icon:"#fff"
    };
  }

  return{
    bg:"#222",
    border:"#555",
    text:"#FFD700",
    icon:"#00E5FF"
  };

};




const getLevelFrame=(level=1)=>{

if(level>=50){
return require("../assets/frames/lv50.png");
}

if(level>=40){
return require("../assets/frames/lv40.png");
}

if(level>=30){
return require("../assets/frames/lv30.png");
}

if(level>=20){
return require("../assets/frames/lv20.png");
}

if(level>=10){
return require("../assets/frames/lv10.png");
}

return null;

};




// ============================================================
// PERF: small memoized components that live OUTSIDE LiveRoom so a
// re-render of the big room screen doesn't re-render / restart them.
// ============================================================

// Timer used to be `roomTimer` state inside LiveRoom -> setState every
// second -> the ENTIRE 6000-line screen re-rendered 1x/sec. Now only this
// tiny <Text> re-renders.
const LiveTimer = memo(({ startTime }) => {
  const [label, setLabel] = useState("00:00:00");

  useEffect(() => {
    if (!startTime) return;

    const tick = () => {
      const diff = Math.max(0, Date.now() - startTime);
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setLabel(
        `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      );
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <Text style={styles.liveTagText}>● LIVE {label}</Text>;
});

// Full-screen gift animation. Memoized so chat / seat / snapshot updates
// in the room never re-render (or reload) the Lottie / WebView while a
// gift is playing. `playKey` changes on every new gift so the same gift
// sent twice in a row restarts instead of being ignored.
const GiftOverlay = memo(({ activeGift, playKey, onFinish }) => {
  const webSource = React.useMemo(
    () =>
      typeof activeGift === "string" && activeGift.startsWith("web:")
        ? { html: giftHtml(activeGift.slice(4)), baseUrl: "https://localhost" }
        : null,
    [activeGift]
  );

  if (!activeGift) return null;

  return (
    <View
      pointerEvents="none"
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
    >
      {webSource ? (
        <WebView
          key={playKey}
          source={webSource}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled={false}
          cacheEnabled
          overScrollMode="never"
          style={{ width: width, height: width * 1.3, backgroundColor: "transparent" }}
          containerStyle={{ backgroundColor: "transparent" }}
          androidLayerType="hardware"
          scrollEnabled={false}
          pointerEvents="none"
        />
      ) : (
        <LottieView
          key={playKey}
          source={activeGift}
          autoPlay
          loop={false}
          speed={2}
          hardwareAccelerationAndroid={true}
          renderMode="HARDWARE"
          cacheComposition={true}
          resizeMode="contain"
          onAnimationFinish={(cancelled) => {
            if (!cancelled) onFinish && onFinish();
          }}
          style={{
            width: 350,
            height: 350,
            backgroundColor: "transparent",
          }}
        />
      )}
    </View>
  );
});

// One chat row. Previously this was a ~340-line inline renderItem, so every
// re-render of LiveRoom re-rendered every visible row. As a memo component it
// only re-renders when that specific message object changes.
const ChatItem = memo(({ chat }) => {

        if (chat.type === "join") {

            return (
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                    }}
                >

                    <View>

                        <Image
                            source={{
                                uri:chat.userImg || STABLE_AVATAR
                            }}
                            style={{
                                width:22,
                                height:22,
                                borderRadius:11,
                                backgroundColor:'#2a2b38'
                            }}
                        />

                        {
                            chat.level>=10 && (

                                <LevelFrame level={chat.level} animated={false}
                                    style={{
                                        position:"absolute",
                                        width:30,
                                        height:30,
                                        top:-4,
                                        left:-4
                                    }}
                                />

                            )
                        }

                    </View>

                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            flexWrap: "wrap",
                        }}
                    >

                        <Text
                            style={{
                                color: "#d0d0d0",
                                fontSize: 13,
                                fontWeight: "600",
                            }}
                        >
                            {chat.senderName}
                        </Text>

                        {chat.verified && (
  <MaterialCommunityIcons
  name="check-decagram"
  size={17}
  color={
    chat?.verifiedColor === "yellow"
      ? "#FFD700"
      : "#ffffff"
  }
/>
)}

                        <View
                            style={[
                                styles.levelBadge,
                                {
                                    marginLeft: 5,
                                    backgroundColor:
                                        getLevelTheme(
                                            chat.level || 1
                                        ).bg,

                                    borderColor:
                                        getLevelTheme(
                                            chat.level || 1
                                        ).border,
                                },
                            ]}
                        >

                            <MaterialCommunityIcons
                                name="diamond-stone"
                                size={8}
                                color={
                                    getLevelTheme(
                                        chat.level || 1
                                    ).icon
                                }
                            />

                            <Text
                                style={{
                                    color:
                                        getLevelTheme(
                                            chat.level || 1
                                        ).text,
                                    fontSize: 8,
                                    fontWeight: "bold",
                                    marginLeft: 2,
                                }}
                            >
                                LV {chat.level || 1}
                            </Text>

                        </View>

                        <Text
                            style={{
                                color: "#d0d0d0",
                                fontSize: 13,
                                fontWeight: "600",
                                marginLeft: 5,
                            }}
                        >
                            joined
                        </Text>

                    </View>

                </View>
            );
        }

        if (chat.type === "gift") {
            const gd = gifts.find(g => String(g.id) === String(chat.giftId));
            return (
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                    }}
                >
                    <Image
                        source={{ uri: chat.userImg || STABLE_AVATAR }}
                        style={{ width:22, height:22, borderRadius:11, backgroundColor:'#2a2b38' }}
                    />
                    <Text style={{ color:"#d0d0d0", fontSize:13, fontWeight:"600", marginLeft:6 }}>
                        {chat.senderName}
                    </Text>
                    {chat.verified && (
                        <MaterialCommunityIcons
                            name="check-decagram"
                            size={17}
                            color={chat?.verifiedColor === "yellow" ? "#FFD700" : "#ffffff"}
                        />
                    )}
                    <Text style={{ color:"#d0d0d0", fontSize:13, marginLeft:5 }}>
                        sent
                    </Text>
                    {gd?.icon ? (
                        <Image
                            source={gd.icon}
                            style={{ width:24, height:24, resizeMode:"contain", marginHorizontal:4 }}
                        />
                    ) : (
                        <Text style={{ color:"#00FFFF", fontWeight:"bold", marginHorizontal:4 }}>
                            {chat.giftName}
                        </Text>
                    )}
                    <Text style={{ color:"#d0d0d0", fontSize:13 }}>to </Text>
                    <Text style={{ color:"#FFE600", fontSize:13, fontWeight:"bold" }}>
                        @{chat.receiverName}
                    </Text>
                </View>
            );
        }

        return (

            <View style={styles.chatRow}>

                <View
                    style={{
                        width:42,
                        height:42,
                        justifyContent:"center",
                        alignItems:"center"
                    }}
                >

                    <Image
                        source={{
                            uri:chat.userImg || STABLE_AVATAR
                        }}
                        style={styles.chatAva}
                    />

                    {
                        chat.level>=10 && (

                            <LevelFrame level={chat.level} animated={false}
                                style={styles.chatFrame}
                            />

                        )
                    }

                </View>

                <View style={styles.chatContent}>

                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            flexWrap: "wrap",
                        }}
                    >

                        <Text style={styles.chatUser}>
                            {chat.senderName}
                        </Text>

                        {chat.verified && (
                            <View style={styles.verifiedBadge}>
                                
<MaterialCommunityIcons
  name="check-decagram"
  size={15}
  color={
    chat?.verifiedColor === "yellow"
      ? "#FFD700"
      : "#ffffff"
  }
/>



                            </View>
                        )}

                        <View
                            style={[
                                styles.levelBadge,
                                {
                                    marginLeft: 6,
                                    backgroundColor:
                                        getLevelTheme(
                                            chat.level || 1
                                        ).bg,

                                    borderColor:
                                        getLevelTheme(
                                            chat.level || 1
                                        ).border,
                                },
                            ]}
                        >

                            <MaterialCommunityIcons
                                name="diamond-stone"
                                size={9}
                                color={
                                    getLevelTheme(
                                        chat.level || 1
                                    ).icon
                                }
                            />

                            <Text
                                style={{
                                    color:
                                        getLevelTheme(
                                            chat.level || 1
                                        ).text,
                                    fontSize: 8,
                                    fontWeight: "bold",
                                    marginLeft: 2,
                                }}
                            >
                                LV {chat.level || 1}
                            </Text>

                        </View>

                    </View>

                    <Text
                        style={{
                            color:"#888",
                            fontSize:11,
                            marginTop:2,
                        }}
                    >
                        @{chat.username}
                    </Text>

                    <View style={styles.bubble}>
                        <Text style={styles.chatMsg}>
                            {chat.message}
                        </Text>
                    </View>

                </View>

            </View>
        );
});

const renderChatItem = ({ item }) => <ChatItem chat={item} />;
const chatKeyExtractor = (item, index) => item.id || String(index);

const AvatarWithFrame = ({ uri, level, size = 70 }) => {
  return (
    <View
      style={{
        width: size + 20,
        height: size + 20,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Image
        source={{ uri: uri || STABLE_AVATAR }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          zIndex: 1,
        }}
      />

      {level >= 10 && (
        <LevelFrame level={level}
          style={{
            position: "absolute",
            width: size + 20,
            height: size + 20,
            resizeMode: "contain",
            zIndex: 10,
          }}
        />
      )}
    </View>
  );
};



// ============================================================
// ProfileFrame: animated level frame for profile popups.
//  - level >= 10 : uses the existing <LevelFrame> (lv10/20/30/40/50 art)
//  - level 1..9  : smooth pulsing + glowing ring, a different colour per
//                  level, so EVERY user has a frame in their profile.
// All animation runs on the native driver, so it stays smooth even in a
// busy live room. pointerEvents="none" so taps still reach the avatar.
// ============================================================
const LOW_LEVEL_RING_COLORS = [
  "#9AA0A6", // lv1
  "#4CAF50", // lv2
  "#26C6DA", // lv3
  "#42A5F5", // lv4
  "#7E57C2", // lv5
  "#AB47BC", // lv6
  "#EC407A", // lv7
  "#FF7043", // lv8
  "#FFB300", // lv9
];

const ProfileFrame = memo(({ level = 1, avatarSize = 100, frameSize }) => {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const outer = frameSize || avatarSize + 20;
  const offset = -(outer - avatarSize) / 2;

  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (lv >= 10) return;
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: RNEasing.inOut(RNEasing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: RNEasing.inOut(RNEasing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [lv, pulse]);

  const wrapStyle = {
    position: "absolute",
    width: outer,
    height: outer,
    top: offset,
    left: offset,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  };

  if (lv >= 10) {
    return (
      <View pointerEvents="none" style={wrapStyle}>
        <LevelFrame
          key={`lf-${lv}`}
          level={lv}
          animated={true}
          style={{ width: outer, height: outer, resizeMode: "contain" }}
        />
      </View>
    );
  }

  const color = LOW_LEVEL_RING_COLORS[Math.min(lv, 9) - 1];
  const ring = avatarSize + 8;

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });

  return (
    <View pointerEvents="none" style={wrapStyle}>
      {/* soft expanding halo */}
      <Animated.View
        style={{
          position: "absolute",
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          borderWidth: 2,
          borderColor: color,
          opacity: haloOpacity,
          transform: [{ scale: haloScale }],
        }}
      />
      {/* main ring */}
      <Animated.View
        style={{
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          borderWidth: 3,
          borderColor: color,
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.9,
          shadowRadius: 8,
          elevation: 6,
          transform: [{ scale }],
        }}
      />
    </View>
  );
});


// ============================================================
// GIFT SHEET (PERF)
// Pehle ye poora popup LiveRoom ke andar tha -> room me har snapshot /
// chat / seat update pe re-render, aur horizontal ScrollView ek saath
// SAARE gift images render karta tha -> left/right swipe pe lag.
// Ab: memo component + FlatList (sirf paas ke pages render hote hain)
// + memo GiftCard + native-driver animation.
// ============================================================
const GIFTS_PER_PAGE = 6;
const GIFT_PAGE_W = width - 40;
const GIFT_PAGES = (() => {
  const pages = [];
  for (let i = 0; i < gifts.length; i += GIFTS_PER_PAGE) {
    pages.push({ key: 'p' + i, items: gifts.slice(i, i + GIFTS_PER_PAGE) });
  }
  return pages;
})();

const GiftCard = memo(({ item, onSend }) => (
  <TouchableOpacity
    style={styles.giftCard}
    activeOpacity={0.7}
    onPress={() => onSend(item)}
  >
    <Image
      source={item.icon}
      style={{ width: 45, height: 45 }}
      resizeMode="contain"
      fadeDuration={0}
    />
    <Text style={styles.giftName}>{item.name}</Text>
    <Text style={styles.giftCoin}>{item.price}</Text>
  </TouchableOpacity>
));

const GiftPage = memo(({ page, onSend }) => (
  <View
    style={{
      width: GIFT_PAGE_W,
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      paddingHorizontal: 5,
    }}
  >
    {page.items.map((item) => (
      <GiftCard key={item.id} item={item} onSend={onSend} />
    ))}
  </View>
));

const GiftUserChip = memo(({ user, selected, onSelect }) => (
  <TouchableOpacity
    onPress={() => onSelect(user.uid)}
    style={{ alignItems: 'center', marginRight: 12 }}
  >
    <Image
      source={{ uri: user.img || STABLE_AVATAR }}
      style={{
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: selected ? 3 : 1,
        borderColor: selected ? '#ff1493' : '#555',
      }}
    />
    <Text
      style={{ color: '#fff', fontSize: 10, width: 65, textAlign: 'center', marginTop: 4 }}
      numberOfLines={1}
    >
      {user.name}
    </Text>
  </TouchableOpacity>
));

const GiftSheet = memo(
  ({ visible, onClose, stars, giftUsers, selectedGiftUser, onSelectUser, onSendGift }) => {
    const anim = useRef(new Animated.Value(400)).current;

    useEffect(() => {
      if (visible) {
        anim.setValue(400);
        Animated.timing(anim, {
          toValue: 0,
          duration: 220,
          easing: RNEasing.out(RNEasing.cubic),
          useNativeDriver: true,
        }).start();
      }
    }, [visible, anim]);

    const renderPage = useCallback(
      ({ item }) => <GiftPage page={item} onSend={onSendGift} />,
      [onSendGift]
    );
    const getItemLayout = useCallback(
      (_, index) => ({ length: GIFT_PAGE_W, offset: GIFT_PAGE_W * index, index }),
      []
    );

    return (
      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        hardwareAccelerated
        onRequestClose={onClose}
      >
        <View style={styles.giftOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

          <Animated.View style={[styles.giftSheet, { transform: [{ translateY: anim }] }]}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 15,
              }}
            >
              <Text style={styles.giftTitle}>🎁 Send Gifts</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 24 }}>⭐</Text>
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginLeft: 5 }}>
                  {stars}
                </Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 15, flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 10 }}
            >
              {giftUsers.map((user) => (
                <GiftUserChip
                  key={user.uid}
                  user={user}
                  selected={selectedGiftUser === user.uid}
                  onSelect={onSelectUser}
                />
              ))}
            </ScrollView>

            <FlatList
              data={GIFT_PAGES}
              keyExtractor={(p) => p.key}
              renderItem={renderPage}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              getItemLayout={getItemLayout}
              initialNumToRender={1}
              maxToRenderPerBatch={1}
              windowSize={3}
              removeClippedSubviews
              decelerationRate="fast"
              bounces={false}
              overScrollMode="never"
              scrollEventThrottle={16}
            />
          </Animated.View>
        </View>
      </Modal>
    );
  },
  (a, b) =>
    a.visible === b.visible &&
    a.stars === b.stars &&
    a.selectedGiftUser === b.selectedGiftUser &&
    a.onClose === b.onClose &&
    a.onSendGift === b.onSendGift &&
    a.giftUsers.map((u) => u.uid + '|' + u.img + '|' + u.name).join(',') ===
      b.giftUsers.map((u) => u.uid + '|' + u.img + '|' + u.name).join(',')
);

export default function LiveRoom() {
const insets = useSafeAreaInsets();

const {
  startLive,
  stopLive,
  currentLive,
} = useLive();


const glow=useSharedValue(1);

useEffect(()=>{

glow.value=withRepeat(

withTiming(
1.15,
{
duration:1800,
easing:Easing.inOut(
Easing.ease
)
}
),

-1,
true

);

},[]);

const frameAnimation=
useAnimatedStyle(()=>{

return{

transform:[
{
scale:glow.value
}
],

opacity:glow.value

};

});


  const params = useLocalSearchParams();
const from = params?.from;

  const resumeAudio = params?.resumeAudio;
  const router = useRouter();
  const roomId = params?.id ? String(params.id) : null;

  const [roomData, setRoomData] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState('listener');
  // PERF/BUG FIX: the room's onSnapshot listener (set up once, deps below)
  // used to read `currentUserRole` straight from this closure. Since that
  // effect never re-runs when the role changes, it always saw the value
  // from the render it was created in — so the "host removed me from the
  // seat, demote back to Audience + leave/rejoin channel" branch could
  // never fire (it always compared against a stale "listener"). A ref
  // always reflects the latest value without re-subscribing the listener.
  const currentUserRoleRef = useRef('listener');
  useEffect(() => { currentUserRoleRef.current = currentUserRole; }, [currentUserRole]);
  const [loading, setLoading] = useState(true);
  const [chatMessage, setChatMessage] = useState('');
  const [controlModalVisible, setControlModalVisible] = useState(false);
const [raiseHandLoading, setRaiseHandLoading] = useState(false);
const [requestModalVisible, setRequestModalVisible] = useState(false);

const [giftModalVisible, setGiftModalVisible] = useState(false);

const closeGiftSheet = useCallback(() => setGiftModalVisible(false), []);
const handleSendGiftRef = useRef(null);
const onSendGiftStable = useCallback((item) => {
  if (handleSendGiftRef.current) handleSendGiftRef.current(item);
}, []);


const [speakerModalVisible, setSpeakerModalVisible] = useState(false);

const [selectedSeatKey, setSelectedSeatKey] = useState(null);

const [shareModalVisible, setShareModalVisible] = useState(false);

const [selectedSpeaker, setSelectedSpeaker] = useState(null);

const [selfSeatModalVisible, setSelfSeatModalVisible] = useState(false);

const [selfMuted, setSelfMuted] = useState(false);

const [profileVisible, setProfileVisible] = useState(false);


const [hostLevel,setHostLevel]=useState(1);

const [hostVerifiedColor, setHostVerifiedColor] = useState("white");

const [hostVerified,setHostVerified]=useState(false);


const [friendShareVisible, setFriendShareVisible] = useState(false);

const [friends, setFriends] = useState([]);

const [selectedFriends, setSelectedFriends] = useState([]);



const [profileUser, setProfileUser] = useState(null);

// Live-room profile preview (tap on a speaker/host avatar): lightweight
// follow state + stats, fetched once on open (no realtime listener) so it
// never adds ongoing load to an already-busy room screen.
const [previewFollowersCount, setPreviewFollowersCount] = useState(0);
const [previewFollowingCount, setPreviewFollowingCount] = useState(0);
const [previewLikesCount, setPreviewLikesCount] = useState(0);
const [previewIsFollowing, setPreviewIsFollowing] = useState(false);
const [previewIsFollowBack, setPreviewIsFollowBack] = useState(false);
const [previewHasLiked, setPreviewHasLiked] = useState(false);
const [previewStatsLoading, setPreviewStatsLoading] = useState(false);
const [previewFollowBusy, setPreviewFollowBusy] = useState(false);
const [previewLikeBusy, setPreviewLikeBusy] = useState(false);
const previewRequestIdRef = useRef(0);
const [previewLevel, setPreviewLevel] = useState(null);

const [activeGift, setActiveGift] = useState(null);

// bumps on every gift so the overlay remounts and replays even when the
// same gift is sent twice in a row
const [giftPlayKey, setGiftPlayKey] = useState(0);

// key (senderId_timestamp) of the last liveGift we've already handled. Seeded
// from the FIRST room snapshot so a gift sent BEFORE we joined never replays.
// (Key equality, not a timestamp comparison, so phones with different clocks
// can't cause real gifts to be skipped.)
const lastSeenGiftKeyRef = useRef("");
const giftBaselineSetRef = useRef(false);

// Start a gift animation instantly (used for own gifts AND remote gifts).
const playGift = useCallback((animation, duration) => {
  if (!animation) return;
  setActiveGift(animation);
  setGiftPlayKey(k => k + 1);
  if (giftTimeoutRef.current) clearTimeout(giftTimeoutRef.current);
  giftTimeoutRef.current = setTimeout(() => {
    setActiveGift(null);
  }, duration || 5000);
}, []);

const handleGiftFinish = useCallback(() => {
  if (giftTimeoutRef.current) clearTimeout(giftTimeoutRef.current);
  setActiveGift(null);
}, []);

const lastGiftRef = useRef(null);

const liveContextSigRef = useRef("");

const giftTimeoutRef = useRef(null);

const [giftCombo, setGiftCombo] = useState(null);

const comboTimeoutRef = useRef(null);

// ===== JOIN BANNER ("Nawed joined") =====
const [joinBanner, setJoinBanner] = useState(null);
const joinHideTimeoutRef = useRef(null);
const chatsReadyRef = useRef(false);
// ids of "joined" messages that already existed BEFORE I entered -> never shown to me
const oldJoinIdsRef = useRef(new Set());

const showJoinBanner = (data) => {
  // _k: har naye join par animation restart ho (JoinEntry isi key se reset hota hai)
  setJoinBanner({ ...data, _k: Date.now() + Math.random() });
};
const handleJoinDone = useCallback(() => setJoinBanner(null), []);


const [selectedGiftUser, setSelectedGiftUser] = useState(null);

const [stars, setStars] = useState(0);



const [myStars,setMyStars] = useState(0);



const [keyboardHeight, setKeyboardHeight] = useState(0);

const [roomStartTime, setRoomStartTime] = useState(null);

  const isJoinedRef = useRef(false);
const agoraInitPromiseRef = useRef(null);
const agoraJoinStartedRef = useRef(false);

const agoraEngineRef = useRef(null);

// ===== LIVE LIFECYCLE (host end / host app killed) =====
// Host ka heartbeat sirf safety-net hai. Android background/doze me JS timers
// ruk jaate hain, isliye viewers ko tab tak kick nahi karte jab tak heartbeat
// 10 min se purana na ho. Host "End live" dabaye to room doc delete hota hai
// aur sab turant bahar ho jaate hain (snapshot -> handleRoomEnded).
const HOST_HEARTBEAT_TIMEOUT_MS = 10 * 60 * 1000;
const cameFromAllLive = from === "all-live" || from === "alllive";

const exitingRef = useRef(false);          // I am leaving on my own (cleanAndExit running)
const roomEndedRef = useRef(false);        // host ended / disappeared
const isFocusedRef = useRef(true);
const lastHeartbeatRef = useRef(null);     // last hostHeartbeat value we saw
const lastHeartbeatSeenAtRef = useRef(0);  // LOCAL time we saw it change (no clock-skew issues)
const lastRoomSigRef = useRef(null);       // room doc signature WITHOUT heartbeat

const releaseAgora = () => {
  const e = agoraEngineRef.current;
  if (!e) return;
  agoraEngineRef.current = null;
  try { e.leaveChannel(); } catch (_) {}
  try { e.release(); } catch (_) {}
};

const navigateAfterEnd = () => {
  if (cameFromAllLive) router.replace("/all-live");
  else router.replace("/");
};

// Host ended the live (or host's app died). Stop audio + mini-live instantly.
// Only navigate if this screen is in front; otherwise navigate when user returns.
const handleRoomEnded = () => {
  if (exitingRef.current || roomEndedRef.current) return;
  roomEndedRef.current = true;
  releaseAgora();
  try { stopLive(); } catch (_) {}
  if (isFocusedRef.current) navigateAfterEnd();
};

useFocusEffect(
  useCallback(() => {
    isFocusedRef.current = true;
    if (roomEndedRef.current && !exitingRef.current) navigateAfterEnd();
    return () => { isFocusedRef.current = false; };
  }, [])
);

const [joined,setJoined]=useState(false);

const [remoteUsers,setRemoteUsers]=useState([]);

const [mutedUsers,setMutedUsers]=useState([]);

const [activeSpeakers, setActiveSpeakers] = useState({});

const [myAgoraUid, setMyAgoraUid] = useState(null);
// FIX: this was `useState`, but voiceDiagnostic is never read anywhere in
// the JSX below — it's purely internal diagnostics. As state, every update
// (which happens ~2x/second while Agora is connected, via
// onAudioVolumeIndication) forced the ENTIRE room screen to re-render.
// A ref keeps the exact same debug info available (voiceDiagnosticRef.current)
// with zero re-render cost.
const voiceDiagnosticRef = useRef({ agora: "Starting...", mic: false, remote: false, remoteCount: 0 });

const currentUid = auth?.currentUser?.uid;

// SCALE FIX: chat + audience no longer live inside the room doc.
// They are separate Firestore subcollections so a chat message or a
// viewer joining/leaving does NOT re-broadcast the entire room state
// (seats, host info, etc.) to every connected client.
const [chatMessages, setChatMessages] = useState([]);
const [audienceMap, setAudienceMap] = useState({});




const pulseAnim = useRef(new Animated.Value(1)).current;

// ===== PREMIUM: sheets / hearts / emoji (hooks yahin rehne chahiye, early return se pehle) =====
const [viewersVisible, setViewersVisible] = useState(false);
const [giftersVisible, setGiftersVisible] = useState(false);
const [menuVisible, setMenuVisible] = useState(false);
const [emojiOpen, setEmojiOpen] = useState(false);
const heartsRef = useRef(null);
const pendingHeartsRef = useRef(0);
const heartFlushRef = useRef(null);
const prevOthersHeartsRef = useRef(null);
const heartsMountedAtRef = useRef(Date.now());
const seatPressRef = useRef(null);
const stableSeatPress = useCallback((k, s) => {
  if (seatPressRef.current) seatPressRef.current(k, s);
}, []);

// Apna mic state seat se sync (bottom mic button ke liye)
const iAmMuted = !!Object.values(roomData?.seatsData || {}).find(
  (s) => s && s.userId === currentUid
)?.isMuted;
useEffect(() => { setSelfMuted(iAmMuted); }, [iAmMuted]);

// Hearts: tap par turant local animation; server par har 4s me ek hi chhota write
// (apne audience doc me). Doc exist na kare to updateDoc chup-chaap fail hota hai.
const flushHearts = useCallback(() => {
  heartFlushRef.current = null;
  const n = pendingHeartsRef.current;
  pendingHeartsRef.current = 0;
  if (!n || !db || !roomId || !currentUid) return;
  updateDoc(doc(db, 'rooms', roomId, 'audience', currentUid), { hearts: increment(n) }).catch(() => {});
}, [roomId, currentUid]);

const sendHeart = useCallback(() => {
  if (heartsRef.current) heartsRef.current.burst(1);
  pendingHeartsRef.current += 1;
  if (!heartFlushRef.current) heartFlushRef.current = setTimeout(flushHearts, 4000);
}, [flushHearts]);

useEffect(() => () => {
  if (heartFlushRef.current) { clearTimeout(heartFlushRef.current); flushHearts(); }
}, [flushHearts]);

// Dusron ke hearts: audience listener pehle se chal raha hai, koi naya listener nahi.
useEffect(() => {
  let total = 0;
  for (const uid in audienceMap) {
    if (uid !== currentUid) total += audienceMap[uid]?.hearts || 0;
  }
  const prev = prevOthersHeartsRef.current;
  prevOthersHeartsRef.current = total;
  if (prev === null || Date.now() - heartsMountedAtRef.current < 2500) return;
  const delta = total - prev;
  if (delta > 0 && heartsRef.current) heartsRef.current.burst(Math.min(delta, 6));
}, [audienceMap, currentUid]);

const kickUser = useCallback(async (user) => {
  if (!db || !roomId || !user || !user.uid) return;
  try {
    const updates = { ['kicked.' + user.uid]: Date.now() };
    // Agar kicked user kisi seat par tha to seat khaali karo (uska mic band)
    Object.entries(roomData?.seatsData || {}).forEach(([key, seat]) => {
      if (seat?.userId === user.uid && key !== 'seat_1') {
        updates['seatsData.' + key] = {
          userId: null, userName: 'Open', userImg: STABLE_AVATAR, isMuted: false,
        };
      }
    });
    await updateDoc(doc(db, 'rooms', roomId), updates);
    await deleteDoc(doc(db, 'rooms', roomId, 'audience', user.uid));
  } catch (e) { log(e); }
}, [roomId, roomData?.seatsData]);

const toggleRoomLock = useCallback(async () => {
  if (!db || !roomId) return;
  try { await updateDoc(doc(db, 'rooms', roomId), { roomLocked: !roomData?.roomLocked }); }
  catch (e) { log(e); }
}, [roomId, roomData?.roomLocked]);


const giftGlow = useRef(new Animated.Value(0.6)).current;

const giftTranslateX = useRef(new Animated.Value(-80)).current;

const giftScale = useRef(new Animated.Value(1)).current;

const giftShake = useRef(new Animated.Value(0)).current;

const giftOpacity = useRef(
  new Animated.Value(0)
).current;

const chatScrollRef = useRef(null);


useEffect(() => {

  if (!chatMessages?.length) return;

  requestAnimationFrame(() => {
    chatScrollRef.current?.scrollToEnd({
      animated: false,
    });
  });

}, [chatMessages?.length]);



const [currentName, setCurrentName] = useState("User");
const [currentAvatar, setCurrentAvatar] = useState(STABLE_AVATAR);
const [currentRealName, setCurrentRealName] = useState("User");

useEffect(() => {

if(!db || !currentUid) return;

const walletRef = doc(
db,
"wallets",
currentUid
);

const unsub = onSnapshot(
walletRef,
(snap)=>{

if(snap.exists()){

const v = snap.data()?.stars || 0;
setStars(v);
setMyStars(v);

}

}
);

return ()=>unsub();

},[currentUid]);


useEffect(() => {

if (
resumeAudio &&
agoraEngineRef.current
){

agoraEngineRef.current.muteAllRemoteAudioStreams(false);

}

},[resumeAudio]);


useEffect(() => {
  if (!auth?.currentUser) {
    router.replace('/login');
  }
}, []);

useEffect(() => {

const loadUser = async () => {

if (!db || !currentUid) return;

try {

const userRef = doc(db, "users", currentUid);

const walletRef = doc(db,"wallets",currentUid);

const [snap, walletSnap] = await Promise.all([
  getDoc(userRef),
  getDoc(walletRef),
]);



if (snap.exists()) {

const data = snap.data();

 setHostVerified(data.verified || false);
setHostVerifiedColor(
  data.verifiedColor || "white"
);


setCurrentName(
  data.username ||
  data.name ||
  auth?.currentUser?.displayName ||
  "User"
);

const realName =
  data.name ||
  auth?.currentUser?.displayName ||
  "User";

setCurrentRealName(realName);

setCurrentAvatar(
data.profileImg ||
data.photoURL ||
auth?.currentUser?.photoURL ||
STABLE_AVATAR
);


if (walletSnap.exists()) {

  setHostLevel(
    walletSnap.data().level || 1
  );

}

log("Avatar =", data.profileImg);
log("Username =", data.username);
log("Real Name =", data.name);



}

} catch (e) {
log(e);
}

};

loadUser();

}, []);






useEffect(() => {

  const show = Keyboard.addListener(
    "keyboardDidShow",
    (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    }
  );

  const hide = Keyboard.addListener(
    "keyboardDidHide",
    () => {
      setKeyboardHeight(0);
    }
  );

  return () => {
    show.remove();
    hide.remove();
  };

}, []);










const friendsLoadedRef = useRef(false);

// PERF: friends are only needed by the "invite friends" sheet, so load them
// the first time that sheet opens (not on every room entry), and fetch all
// user + wallet docs in parallel instead of 2 sequential reads per friend.
useEffect(() => {

  if (!db || !currentUid || !friendShareVisible || friendsLoadedRef.current) return;

  friendsLoadedRef.current = true;

  const loadFriends = async () => {

    try {

      const q = query(
        collection(db, "follows"),
        where("followerId", "==", currentUid)
      );

      const followSnap = await getDocs(q);

      const results = await Promise.all(
        followSnap.docs.map(async (followDoc) => {

          const followingId = followDoc.data().followingId;

          const [userSnap, walletSnap] = await Promise.all([
            getDoc(doc(db, "users", followingId)),
            getDoc(doc(db, "wallets", followingId)),
          ]);

          if (!userSnap.exists()) return null;

          const u = userSnap.data();

          return {
            id: userSnap.id,
            ...u,
            verified: u?.verified || false,
            verifiedColor: u?.verifiedColor || "white",
            level: walletSnap.exists() ? walletSnap.data()?.level || 1 : 1,
          };

        })
      );

      setFriends(results.filter(Boolean));

    } catch (e) {
      friendsLoadedRef.current = false;
      log("Load friends error:", e);
    }

  };

  loadFriends();

}, [currentUid, friendShareVisible]);




// ---------- Profile preview (dp tap popup) follow/likes logic ----------
// Mirrors the exact same "follows" collection + doc-id convention used on
// the full userProfile screen, so following someone here and following
// them from their profile page always agree.
const fetchProfilePreview = async (targetUserId) => {

  if (!db || !targetUserId || targetUserId === currentUid) {
    setPreviewFollowersCount(0);
    setPreviewFollowingCount(0);
    setPreviewLikesCount(0);
    setPreviewIsFollowing(false);
    setPreviewIsFollowBack(false);
    setPreviewHasLiked(false);
    return;
  }

  // Guards against a stale response landing after the user has already
  // opened a different person's preview (fast taps in a busy room).
  const requestId = ++previewRequestIdRef.current;

  setPreviewStatsLoading(true);

  try {

    const followersQuery = query(
      collection(db, "follows"),
      where("followingId", "==", targetUserId)
    );

    const followingQuery = query(
      collection(db, "follows"),
      where("followerId", "==", targetUserId)
    );

    const videosQuery = query(
      collection(db, "all_videos"),
      where("userId", "==", targetUserId)
    );

    const followRef = currentUid
      ? doc(db, "follows", `${currentUid}_${targetUserId}`)
      : null;

    const backRef = currentUid
      ? doc(db, "follows", `${targetUserId}_${currentUid}`)
      : null;

    const likeRef = currentUid
      ? doc(db, "profileLikes", `${currentUid}_${targetUserId}`)
      : null;

    const [
      followersSnap,
      followingSnap,
      videosSnap,
      followSnap,
      backSnap,
      likeSnap,
    ] = await Promise.all([
      getCountFromServer(followersQuery),
      getCountFromServer(followingQuery),
      getDocs(videosQuery),
      followRef ? getDoc(followRef) : Promise.resolve(null),
      backRef ? getDoc(backRef) : Promise.resolve(null),
      likeRef ? getDoc(likeRef) : Promise.resolve(null),
    ]);

    if (requestId !== previewRequestIdRef.current) return; // stale, ignore

    let likesCount = 0;
    videosSnap.forEach((v) => {
      likesCount += Number(v.data()?.likes || 0);
    });

    setPreviewFollowersCount(followersSnap.data().count);
    setPreviewFollowingCount(followingSnap.data().count);
    setPreviewLikesCount(likesCount);
    setPreviewIsFollowing(followSnap ? followSnap.exists() : false);
    setPreviewIsFollowBack(backSnap ? backSnap.exists() : false);
    setPreviewHasLiked(likeSnap ? likeSnap.exists() : false);

  } catch (error) {
    if (__DEV__) log("PROFILE PREVIEW FETCH ERROR =", error);
  } finally {
    if (requestId === previewRequestIdRef.current) {
      setPreviewStatsLoading(false);
    }
  }

};

const handlePreviewFollow = async (targetSpeaker) => {

  const targetUserId = targetSpeaker?.userId;

  if (!db || !currentUid || !targetUserId || previewFollowBusy) return;

  setPreviewFollowBusy(true);

  const followId = `${currentUid}_${targetUserId}`;
  const followRef = doc(db, "follows", followId);

  // Optimistic UI: flip the button instantly, reconcile with Firestore
  // in the background so tapping never feels laggy in a live room.
  const wasFollowing = previewIsFollowing;
  setPreviewIsFollowing(!wasFollowing);
  setPreviewFollowersCount((c) =>
    Math.max(0, c + (wasFollowing ? -1 : 1))
  );

  try {

    if (wasFollowing) {

      await deleteDoc(followRef);

    } else {

      await setDoc(followRef, {
        followerId: currentUid,
        followingId: targetUserId,
      });

      const currentUserSnap = await getDoc(
        doc(db, "users", currentUid)
      );
      const currentUserData = currentUserSnap.data();

      await addDoc(
        collection(db, "users", targetUserId, "notifications"),
        {
          type: "follow",
          senderId: currentUid,
          senderName: currentUserData?.username || currentName || "User",
          senderPhoto:
            currentUserData?.profileImg || currentAvatar || "",
          createdAt: serverTimestamp(),
        }
      );

    }

  } catch (error) {

    // Roll back the optimistic update if the write failed.
    setPreviewIsFollowing(wasFollowing);
    setPreviewFollowersCount((c) =>
      Math.max(0, c + (wasFollowing ? 1 : -1))
    );

    if (__DEV__) log("PREVIEW FOLLOW ERROR =", error);

  } finally {
    setPreviewFollowBusy(false);
  }

};

const handlePreviewLike = async (targetSpeaker) => {

  const targetUserId = targetSpeaker?.userId;

  if (!db || !currentUid || !targetUserId || previewLikeBusy) return;

  setPreviewLikeBusy(true);

  const likeId = `${currentUid}_${targetUserId}`;
  const likeRef = doc(db, "profileLikes", likeId);

  const wasLiked = previewHasLiked;
  setPreviewHasLiked(!wasLiked); // optimistic, same pattern as follow

  try {

    if (wasLiked) {
      await deleteDoc(likeRef);
    } else {
      await setDoc(likeRef, {
        likerId: currentUid,
        likedUserId: targetUserId,
        createdAt: serverTimestamp(),
      });
    }

  } catch (error) {

    setPreviewHasLiked(wasLiked); // roll back on failure

    if (__DEV__) log("PREVIEW LIKE ERROR =", error);

  } finally {
    setPreviewLikeBusy(false);
  }

};

useEffect(() => {

  if ((profileVisible || speakerModalVisible) && selectedSpeaker?.userId) {
    fetchProfilePreview(selectedSpeaker.userId);
  }

}, [profileVisible, speakerModalVisible, selectedSpeaker?.userId]);

// Always show the profile frame for the user's REAL current level
// (wallet doc), not just whatever level was cached on the seat.
useEffect(() => {

  if (!(profileVisible || speakerModalVisible) || !selectedSpeaker?.userId || !db) return;

  let cancelled = false;
  setPreviewLevel(null);

  getDoc(doc(db, "wallets", selectedSpeaker.userId))
    .then((snap) => {
      if (!cancelled && snap.exists()) {
        setPreviewLevel(snap.data()?.level || 1);
      }
    })
    .catch(() => {});

  return () => { cancelled = true; };

}, [profileVisible, speakerModalVisible, selectedSpeaker?.userId]);

const profileLevel = previewLevel ?? selectedSpeaker?.level ?? 1;




// (myStars is now fed by the single wallet listener above)




const pulseLoopRef = useRef(null);

useEffect(() => {

const speakingNow =
Object.keys(activeSpeakers).length > 0;

if (speakingNow) {

if (!pulseLoopRef.current) {

pulseLoopRef.current = Animated.loop(

Animated.sequence([

Animated.timing(pulseAnim,{
toValue:1.3,
duration:400,
useNativeDriver:true
}),

Animated.timing(pulseAnim,{
toValue:1,
duration:400,
useNativeDriver:true
})

])

);

pulseLoopRef.current.start();

}

}
else{

if (pulseLoopRef.current) {
pulseLoopRef.current.stop();
pulseLoopRef.current = null;
}

pulseAnim.stopAnimation();

pulseAnim.setValue(1);

}

},[activeSpeakers]);


  // --- BackHandler Subscription Fix ---
 // always points at the latest cleanAndExit (assigned after its definition)
 const cleanAndExitRef = useRef(null);
 useEffect(() => {

  const backAction = () => {

    // Sirf host ko popup
    if (currentUserRole === "host") {

      setControlModalVisible(true);
      return true;

    }

    // baki sab direct exit
    cleanAndExitRef.current && cleanAndExitRef.current();

    return true;
  };

  const subscription =
    BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

  return () => subscription.remove();

}, [currentUserRole]);





// ---------- HOST HEARTBEAT ----------
// Host writes a tiny "I'm alive" stamp every 20s. If the host's app is killed
// / removed from recents, the stamp stops and everyone (list + room) treats the
// live as ended. updateDoc on a deleted room fails silently (never re-creates).
useEffect(() => {
  if (!db || !roomId || currentUserRole !== "host") return;
  const roomRef = doc(db, "rooms", roomId);
  const beat = () => { updateDoc(roomRef, { hostHeartbeat: serverTimestamp() }).catch(() => {}); };
  beat();
  const timer = setInterval(beat, 20000);
  const sub = AppState.addEventListener("change", (st) => { if (st === "active") beat(); });
  return () => { clearInterval(timer); sub.remove(); };
}, [roomId, currentUserRole]);

// ---------- LIVE VIEWER COUNT -> all-live ----------
// Sirf HOST likhta hai (ek hi writer => race / drift nahi). Room ke andar
// jitne log (host ko chhod kar) hain utna hi `viewerCount` all-live me dikhta
// hai: join par badhta hai, leave par ghatta hai. 1.5s debounce taaki bahut
// log ek saath aayein to ek hi write ho.
const lastWrittenViewerCountRef = useRef(-1);
useEffect(() => {
  if (!db || !roomId || currentUserRole !== "host") return;

  let n = 0;
  for (const uid in audienceMap) {
    const u = audienceMap[uid];
    if (u && u.uid && u.uid !== roomData?.hostId && u.uid !== currentUid) n++;
  }
  if (n === lastWrittenViewerCountRef.current) return;

  const t = setTimeout(() => {
    lastWrittenViewerCountRef.current = n;
    updateDoc(doc(db, "rooms", roomId), { viewerCount: n }).catch(() => {});
  }, 1500);
  return () => clearTimeout(t);
}, [audienceMap, roomData?.hostId, roomId, currentUserRole, currentUid]);

// ---------- VIEWER: detect host app killed ----------
useEffect(() => {
  if (!db || !roomId || currentUserRole === "host") return;
  const roomRef = doc(db, "rooms", roomId);

  const timer = setInterval(async () => {
    if (!lastHeartbeatSeenAtRef.current) return;                  // old room without heartbeat
    if (Date.now() - lastHeartbeatSeenAtRef.current < HOST_HEARTBEAT_TIMEOUT_MS) return;
    try {
      const snap = await getDoc(roomRef);
      if (snap.metadata?.fromCache) return;                       // offline: don't guess
      if (!snap.exists()) { handleRoomEnded(); return; }
      const hb = snap.data()?.hostHeartbeat;
      const hbKey = hb?.toMillis ? hb.toMillis() : (hb ?? null);
      if (hbKey !== lastHeartbeatRef.current) {                   // host is alive after all
        lastHeartbeatRef.current = hbKey;
        lastHeartbeatSeenAtRef.current = Date.now();
        return;
      }
      // Host really gone: end for this viewer.
      handleRoomEnded();
    } catch (_) {}
    }, 30000);

  // our own timers pause in background -> give a fresh grace period on return
  const sub = AppState.addEventListener("change", (st) => {
    if (st === "active" && lastHeartbeatSeenAtRef.current) {
      lastHeartbeatSeenAtRef.current = Date.now();
    }
  });

  return () => { clearInterval(timer); sub.remove(); };
}, [roomId, currentUserRole]);


useEffect(() => {

  if (!requestModalVisible) return;

  const backAction = () => {

    setRequestModalVisible(false);

    return true;
  };

  const subscription = BackHandler.addEventListener(
    "hardwareBackPress",
    backAction
  );

  return () => subscription.remove();

}, [requestModalVisible]);


  useEffect(() => {

if (
 !db ||
 !roomId ||
 !currentUid ||
 currentName === "User" ||
 currentRealName === "User" ||
 !currentAvatar
){
 return;
}

const roomRef = doc(db,'rooms',roomId);

const joinRoom = async () => {

if (!auth?.currentUser) return;

      if (isJoinedRef.current) return;
      isJoinedRef.current = true;
      try {
        // Run all 3 reads in parallel instead of one-after-another —
        // cuts join latency roughly to a third of what it was.
        const [roomSnap, userSnap, walletSnap] = await Promise.all([
          getDoc(roomRef),
          getDoc(doc(db, "users", currentUid)),
          getDoc(doc(db, "wallets", currentUid)),
        ]);

const userData = userSnap.exists()
  ? userSnap.data()
  : {};

const walletData = walletSnap.exists()
  ? walletSnap.data()
  : {};

const currentLevel = walletData.level || 1;


        if (!roomSnap.exists()) {
          router.replace('/'); // Path updated to root
          return;
        }

const data = roomSnap.data();

if (
  data?.roomLocked &&
  data?.hostId !== currentUid
) {
  alert("Room Locked");
  router.back();
  return;
}

if (
  data?.kicked?.[currentUid] &&
  data?.hostId !== currentUid
) {
  releaseAgora();
  try { stopLive(); } catch (_) {}
  alert("Host ne aapko is room se hata diya hai");
  router.back();
  return;
}

        const updates = {};

// SCALE FIX: presence now goes to its own subcollection doc
// (rooms/{roomId}/audience/{uid}) instead of a map field on the room
// document, so this write no longer broadcasts to every other viewer.
const audiencePayload = {
  uid: currentUid,
  name: currentRealName,      // Real Name
  username: currentName,      // Username
  img: currentAvatar || STABLE_AVATAR,
  level: currentLevel,
  verified: userData.verified || false,
  verifiedColor:
    userData.verifiedColor || "#ffffff",
  joinedAt: Date.now(),
  online: true
};



if (data?.hostId === currentUid) {

 updates['seatsData.seat_1'] = {
 userId: currentUid,
 userName: currentName,
 realName: currentRealName,
 userImg: currentAvatar || STABLE_AVATAR,
level: hostLevel,

verified: userData.verified || false,

verifiedColor:
userData.verifiedColor || "white",

 isMuted:false,
 roleTag:'HOST'
};

}


log("Joining Room...");
log("UID =", currentUid);
log("Name =", currentName);
log("Avatar =", currentAvatar);

// Only post a fresh "X joined" chat message the FIRST time this user
// shows up in this room's audience list. Without this check, every
// screen refocus/reconnect (e.g. app backgrounded then reopened)
// would spam another "joined" message at the bottom of the chat.
const existingPresenceSnap = await getDoc(
  doc(db, 'rooms', roomId, 'audience', currentUid)
);
const isFirstJoinThisSession = !existingPresenceSnap.exists();

// Write seat/host updates (if any) to the room doc and presence to the
// audience subcollection, in parallel — the join system-message only
// goes out if this is genuinely a new join.
const writeJobs = [
  setDoc(doc(db, 'rooms', roomId, 'audience', currentUid), audiencePayload),
];

// host ke liye "joined" message nahi aayega
if (isFirstJoinThisSession && data?.hostId !== currentUid) {
  writeJobs.push(
    addDoc(collection(db, 'rooms', roomId, 'chats'), {
      type: "join",
      senderName: currentRealName,
      username: currentName,
      userImg: currentAvatar || STABLE_AVATAR,
      verified: userData.verified || false,
      verifiedColor: userData.verifiedColor || "white",
      level: hostLevel,
      createdAt: Date.now(),
    })
  );
}

if (Object.keys(updates).length > 0) {
  writeJobs.push(updateDoc(roomRef, updates));
}

await Promise.all(writeJobs);

log("Audience Added =", audiencePayload);




      } catch (e) { log(e); }
    };
    
    joinRoom();
  

    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();

        // Host heartbeat: remember WHEN (local time) it last changed.
        const hb = data?.hostHeartbeat;
        const hbKey = hb?.toMillis ? hb.toMillis() : (hb ?? null);
        if (hbKey !== null && hbKey !== lastHeartbeatRef.current) {
          lastHeartbeatRef.current = hbKey;
          lastHeartbeatSeenAtRef.current = Date.now();
        }

        // SPEED: heartbeat arrives every 20s. If nothing else changed, do NOT
        // re-render the whole room screen.
        let roomSig = null;
        try {
          const { hostHeartbeat, viewerCount, ...restOfRoom } = data;
          roomSig = JSON.stringify(restOfRoom);
        } catch (_) {}
        if (roomSig && roomSig === lastRoomSigRef.current) return;
        lastRoomSigRef.current = roomSig;



        // First snapshot: remember whatever gift is already there so it
        // doesn't get replayed for someone who just joined.
        if (!giftBaselineSetRef.current) {
          giftBaselineSetRef.current = true;
          lastSeenGiftKeyRef.current = data?.liveGift
            ? `${data.liveGift.senderId}_${data.liveGift.timestamp}`
            : "";
        }

        if (currentUid && data?.hostId !== currentUid && data?.kicked?.[currentUid]) {
          releaseAgora();
          try { stopLive(); } catch (_) {}
          alert("Host ne aapko is room se hata diya hai");
          router.back();
          return;
        }

        setRoomData(data);
        setLoading(false);

const snapshotHostId = data?.hostId || data?.seatsData?.seat_1?.userId || null;
const snapshotHostName =
  data?.hostName ||
  data?.seatsData?.seat_1?.userName ||
  "Host";
const snapshotHostImage =
  data?.hostImg ||
  data?.seatsData?.seat_1?.userImg ||
  STABLE_AVATAR;
const snapshotRole =
  snapshotHostId === currentUid
    ? "host"
    : "listener";

// PERF: only push to LiveContext when something it actually shows changed.
// Gifts / seatStars / chat-side updates hit this listener constantly and
// used to re-render every LiveContext consumer each time.
let liveSig = "";
try {
  liveSig = JSON.stringify([
    snapshotHostId,
    snapshotHostName,
    snapshotHostImage,
    snapshotRole,
    data?.roomName || data?.title || data?.name || "",
    data?.seatsData || null,
    data?.createdAt?.seconds ?? data?.createdAt ?? null,
  ]);
} catch (_) { liveSig = String(Date.now()); }

if (liveSig !== liveContextSigRef.current) {
  liveContextSigRef.current = liveSig;

  startLive({
    roomId,
    roomName: data?.roomName || data?.title || data?.name || "Live Room",
    hostName: snapshotHostName,
    hostImage: snapshotHostImage,
    hostId: snapshotHostId,
    userRole: snapshotRole,
    startTime: data?.createdAt || null,
    roomData: data,
  });
}




if (data.createdAt) {

let startTime = null;

if (typeof data.createdAt === "number") {
  startTime = data.createdAt;
}
else if (data.createdAt?.toMillis) {
  startTime = data.createdAt.toMillis();
}
else if (data.createdAt?.seconds) {
  startTime = data.createdAt.seconds * 1000;
}

if (startTime) {
  setRoomStartTime(startTime);
}

}



        const seats = data.seatsData || {};


// Current user ki seat dhundo
let mySeat = null;

Object.entries(seats).forEach(([key, seat]) => {
  if (seat?.userId === currentUid) {
    mySeat = seat;
  }
});


        let onPod = false;
Object.entries(seats).forEach(([key,s])=>{
if(
key!=="seat_1" &&
s?.userId===currentUid
){
onPod=true;
}
});
     

if(
mySeat &&
agoraEngineRef.current &&
currentUserRoleRef.current==="listener" &&
   mySeat?.roleTag !== "HOST"
){

setCurrentUserRole("speaker");

agoraEngineRef.current.setClientRole(
ClientRoleType.ClientRoleBroadcaster
);

agoraEngineRef.current.enableLocalAudio(true);

agoraEngineRef.current.muteLocalAudioStream(false);

}



        setCurrentUserRole(seats.seat_1?.userId === currentUid ? 'host' : (onPod ? 'speaker' : 'listener'));

if (!agoraEngineRef.current) {

let role = "listener";

if (seats.seat_1?.userId === currentUid) {
role = "host";
}
else if (onPod) {
role = "speaker";
}

setTimeout(() => {
initAgora(role);
},100);

}


// Agar host ne speaker ko seat se remove kiya:
// FIX: pehle yahan leaveChannel() + initAgora("listener") hota tha, par engine ref
// null nahi tha isliye initAgora turant return ho jata tha -> user channel se bahar
// reh jata tha aur kisi ki voice nahi aati thi. Ab channel me hi rehte hain, sirf
// mic MUTE + role Audience -> doosre sab ki voice turant aati rehti hai.
if (
  !onPod &&
  currentUserRoleRef.current === "speaker" &&
  agoraEngineRef.current
) {
  setCurrentUserRole("listener");
  currentUserRoleRef.current = "listener";
  try { agoraEngineRef.current.muteLocalAudioStream(true); } catch (_) {}
  try { agoraEngineRef.current.enableLocalAudio(false); } catch (_) {}
  try { agoraEngineRef.current.setClientRole(ClientRoleType.ClientRoleAudience); } catch (_) {}
  try { agoraEngineRef.current.muteAllRemoteAudioStreams(false); } catch (_) {}
  try { agoraEngineRef.current.setEnableSpeakerphone(true); } catch (_) {}
}

// Agar current user speaker hai aur host ne mute kiya hai
if (
  mySeat &&
  mySeat.userId === currentUid &&
  agoraEngineRef.current
) {

  if (mySeat.isMuted) {

    agoraEngineRef.current.muteLocalAudioStream(true);

  } else {

    agoraEngineRef.current.muteLocalAudioStream(false);

  }

}



      } else {
        // Room doc gone = host ended the live.
        handleRoomEnded();
      }
    });

    return () => unsubscribe();

  }, [
  roomId,
  currentUid,
  currentName,
  currentRealName,
  currentAvatar,
  hostLevel,
]);


// SCALE FIX: dedicated chat listener.
// Only the last 50 messages are synced, and Firestore only pushes the
// changed message(s) on each update instead of resending the whole room
// document to every viewer (this was the main cause of lag at 200-300 users).
useEffect(() => {

  if (!db || !roomId) return;

  const chatsQuery = query(
    collection(db, 'rooms', roomId, 'chats'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  chatsReadyRef.current = false;
  oldJoinIdsRef.current = new Set();

  const unsubChats = onSnapshot(chatsQuery, (snap) => {
    let msgs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .reverse();

    // First load = old history. Remember every old "joined" message so it is
    // hidden; only people who join AFTER I entered will show "X joined".
    // (Id based, so different phone clocks can't break it.)
    if (!chatsReadyRef.current) {
      msgs.forEach(m => { if (m.type === "join") oldJoinIdsRef.current.add(m.id); });
    }
    msgs = msgs.filter(m => !(m.type === "join" && oldJoinIdsRef.current.has(m.id)));

    setChatMessages(msgs);

    // Pehli baar (purani history load) pe banner nahi dikhana —
    // sirf uske baad aane wale NAYE "join" par.
    if (chatsReadyRef.current) {
      snap.docChanges().forEach((ch) => {
        if (ch.type !== "added") return;
        const d = ch.doc.data();
        if (d?.type === "join" && Date.now() - (d.createdAt || 0) < 15000) {
          showJoinBanner(d);
        }
      });
    }
    chatsReadyRef.current = true;
  }, (e) => log("Chat listener error:", e));

  return () => {
    unsubChats();
    if (joinHideTimeoutRef.current) clearTimeout(joinHideTimeoutRef.current);
  };

}, [roomId]);


// SCALE FIX: dedicated audience/presence listener.
// Each viewer owns exactly one small doc (created on join, deleted on
// leave), so joins/leaves no longer rewrite a giant map field that used
// to live on the room document and fan out to everyone.
useEffect(() => {

  if (!db || !roomId) return;

  const audienceQuery = query(
    collection(db, 'rooms', roomId, 'audience'),
    orderBy('joinedAt', 'desc')
  );

  // PERF: when many people join/leave at once this fires in bursts and each
  // one re-rendered the whole room. First load is instant, after that
  // updates are coalesced to at most one render per 600ms.
  let firstLoad = true;
  let latestMap = {};
  let flushTimer = null;

  const unsubAudience = onSnapshot(audienceQuery, (snap) => {
    const map = {};
    snap.forEach(d => { map[d.id] = { uid: d.id, ...d.data() }; });
    latestMap = map;

    if (firstLoad) {
      firstLoad = false;
      setAudienceMap(map);
      return;
    }

    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        setAudienceMap(latestMap);
      }, 600);
    }
  }, (e) => log("Audience listener error:", e));

  return () => {
    unsubAudience();
    if (flushTimer) clearTimeout(flushTimer);
  };

}, [roomId]);




useEffect(() => {

  const gift = roomData?.liveGift;
  if (!gift) return;

  const giftKey = `${gift.senderId}_${gift.timestamp}`;

  // Already handled (or it's the gift that existed before we joined).
  if (giftKey === lastSeenGiftKeyRef.current) return;
  lastSeenGiftKeyRef.current = giftKey;

  // My own gift is already on screen (instant local display in the send
  // handler). Replaying it from the Firestore echo made the banner + animation
  // restart a moment later — that was the visible "double / late gift" glitch.
  if (gift.senderId === currentUid) return;

  const now = Date.now();

  setGiftCombo({
    senderName: gift.senderName,
    senderImg: gift.senderImg,
    receiverName: gift.receiverName,
    giftId: gift.giftId,
    giftName: gift.giftName,
    count: gift.comboCount || 1
  });

  lastGiftRef.current = {
    senderId: gift.senderId,
    giftId: gift.giftId,
    time: now
  };

  if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);

  comboTimeoutRef.current = setTimeout(() => {
    setGiftCombo(null);
    lastGiftRef.current = null;
    global.giftComboCount = 0;
  }, 2200);

  const giftData = gifts.find(g => String(g.id) === String(gift.giftId));

  if (!giftData || !giftData.animation) return;

  playGift(giftData.animation, giftData.duration);

}, [roomData?.liveGift?.timestamp]);







useEffect(() => {
  if (!giftCombo) return;

  giftTranslateX.setValue(-80);
  giftScale.setValue(0.8);
  giftGlow.setValue(0.3);
  giftShake.setValue(-1);
giftOpacity.setValue(0);


  Animated.parallel([
    Animated.spring(giftTranslateX, {
  toValue: 0,
  speed: 12,
  bounciness: 6,
  useNativeDriver: true,
}),

Animated.spring(giftScale, {
  toValue: 1,
  speed: 12,
  bounciness: 6,
  useNativeDriver: true,
}),

Animated.timing(giftOpacity,{
  toValue:1,
  duration:250,
  useNativeDriver:true,
}),

    // giftShake only ever drives a `rotate` transform (see the interpolate
    // below), which the native driver fully supports — running it on the
    // JS thread (false) was needless and made the shake stutter under load.
    Animated.sequence([
      Animated.timing(giftShake, {
        toValue: 1,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(giftShake, {
        toValue: -1,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(giftShake, {
        toValue: 0,
        duration: 60,
        useNativeDriver: true,
      }),
    ]),
  ]).start();
}, [giftCombo]);





// (room timer moved into <LiveTimer/> so it doesn't re-render the whole screen every second)


  // SCALE + CLEANUP FIX: chats/audience are subcollections now, and
  // Firestore does NOT auto-delete subcollection docs when the parent
  // room doc is deleted. Without this, closing a live and starting a
  // new one under the same roomId (hosts reuse their uid as roomId)
  // would leave old chat history and stale viewers sitting there,
  // which is exactly the "purana chat dikhता hai" bug.
  const clearRoomSubcollection = async (subName) => {
    try {
      const snap = await getDocs(collection(db, 'rooms', roomId, subName));
      if (snap.empty) return;
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    } catch (e) {
      log(`Clear ${subName} error:`, e);
    }
  };

  // --- CLEAN & EXIT: Direct Fix for Navigation ---
  const cleanAndExit = async () => {
    exitingRef.current = true;   // stops handleRoomEnded from double-navigating
    setControlModalVisible(false);
    try { stopLive(); } catch (_) {}

    if (agoraEngineRef.current) {
      // FIX: this used to be `await agoraEngineRef.current.leaveChannel()`
      // before navigating, which meant tapping "exit" visibly paused for
      // however long that network round-trip took. leaveChannel()/release()
      // don't need to block the UI — fire them and move on immediately.
      const engineToRelease = agoraEngineRef.current;
      agoraEngineRef.current = null;
      // FIX: leaveChannel() is synchronous in this react-native-agora
      // version — it returns a plain number, not a Promise — so calling
      // `.catch()` on it directly throws "leaveChannel().catch is not a
      // function". Wrap in try/catch, and only chain .catch() if the
      // result actually is a Promise (keeps this safe across SDK versions).
      try {
        const leaveResult = engineToRelease.leaveChannel();
        if (leaveResult && typeof leaveResult.catch === "function") {
          leaveResult.catch(() => {});
        }
      } catch (_) {}
      try { engineToRelease.release(); } catch (_) {}
    }

    // Pehle navigate karein taaki user ko wait na karna pade
   if (cameFromAllLive) {

  router.replace("/all-live");

} else {

  router.back();

}

    try {
      if (db && roomId) {
        const roomRef = doc(db, 'rooms', roomId);




if (currentUserRole === "host") {

  // Sirf host hi live band kare — room khatam hone par uske
  // chats aur audience subcollections bhi saaf karo, warna agli
  // baar live open karne par purana chat/audience dikhega.
  // SPEED: delete the room doc FIRST -> it vanishes from every "All Live"
  // list immediately. Chat/audience cleanup runs in the background.
  await deleteDoc(roomRef);
  clearRoomSubcollection('chats');
  clearRoomSubcollection('audience');

} else {

  // SCALE FIX: presence removal is now a single delete on the
  // viewer's own subcollection doc — no more broadcasting a full
  // room-doc rewrite to every other person in the room just because
  // one listener left. (Previously this ran as two separate,
  // partially-redundant updateDoc calls on the same room document.)
  const jobs = [
    deleteDoc(doc(db, 'rooms', roomId, 'audience', currentUid)),
  ];

  const seatUpdates = {};
  if (roomData?.seatsData) {
    Object.keys(roomData.seatsData).forEach(key => {
      if (
        key !== "seat_1" &&
        roomData.seatsData[key]?.userId === currentUid
      ) {
        seatUpdates[`seatsData.${key}`] = {
          userId: null,
          userName: "Open",
          userImg: STABLE_AVATAR,
          isMuted: false
        };
      }
    });
  }

  if (Object.keys(seatUpdates).length > 0) {
    jobs.push(updateDoc(roomRef, seatUpdates));
  }

  await Promise.all(jobs);

}

      }
    } catch (e) { 
      log("Exit Process Error:", e);
    }
  };


cleanAndExitRef.current = cleanAndExit;

const sendSeatRequest = async (seatKey) => {

try {

const roomRef = doc(db,"rooms",roomId);

await updateDoc(roomRef,{

[`speakerRequests.${currentUid}`]:{

uid:currentUid,

name:currentName,

realName:currentRealName,

img:currentAvatar,

verified: hostVerified,
verifiedColor:
hostVerifiedColor,

level: hostLevel,

seatKey:seatKey,

status:"pending",

requestedAt:Date.now()

}

});

alert("Request Sent");

}catch(e){

log(e);

}

};




  const handleSeatJoin = async (seatKey) => {
  try {

    if (currentUserRole !== 'listener') {
      return;
    }

    const roomRef = doc(db, 'rooms', roomId);

 



await agoraEngineRef.current.setClientRole(
ClientRoleType.ClientRoleBroadcaster
);

await agoraEngineRef.current.enableLocalAudio(true);
await agoraEngineRef.current.muteLocalAudioStream(false);
await agoraEngineRef.current.setEnableSpeakerphone(true);

setCurrentUserRole("speaker");


  } catch (error) {
    log(error);
  }
};




const handleRaiseHand = async () => {
  try {

    setRaiseHandLoading(true);

    const roomRef = doc(db, 'rooms', roomId);

   await updateDoc(roomRef, {
  [`speakerRequests.${currentUid}`]: {
    uid: currentUid,
    name: currentName,
    realName: currentRealName,
    img: currentAvatar,
    seatKey: null,
    status: "pending",
    requestedAt: Date.now()
  }
});

    alert('Request Sent To Host');

  } catch (e) {
    log(e);
  }

  setRaiseHandLoading(false);
};



const initAgora = async (userRole) => {
  if (!roomId || !currentUid) return;
  if (agoraEngineRef.current || agoraInitPromiseRef.current || agoraJoinStartedRef.current) return;

  agoraJoinStartedRef.current = true;

  const run = async () => {
    let engine = null;
    voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, agora: "Getting token..." };
    try {
      if (Platform.OS === "android") {
        const permissions = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.CAMERA,
        ]);
        if (permissions[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error("Microphone permission denied");
        }
      }

      const firebaseUser = auth?.currentUser;
      if (!firebaseUser) throw new Error("Firebase user not available");
            // no forced refresh: getIdToken() already refreshes when expired and saves a network round-trip
      const firebaseIdToken = await firebaseUser.getIdToken();
      if (!firebaseIdToken) throw new Error("Firebase ID token missing");

      // Token fetch: 20s timeout + 3 tries (Render free server cold-start me
      // pehli request fail/slow ho sakti hai -> join atak jata tha).
      // Same helper token renew ke liye bhi use hota hai (1 ghante baad audio
      // na kate).
      const fetchAgoraToken = async (uidForToken, firstIdToken) => {
        let lastError = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000);
          let retryable = true;
          try {
            const idToken = firstIdToken && attempt === 0
              ? firstIdToken
              : await auth.currentUser.getIdToken();
            const res = await fetch(
              `https://topking-backend.onrender.com/token?channel=${encodeURIComponent(roomId)}&uid=${uidForToken}`,
              { headers: { Authorization: `Bearer ${idToken}`, Accept: "application/json" }, signal: controller.signal }
            );
            const data = await res.json();
            log("TOKEN HTTP STATUS =", res.status);
            if (res.ok && data?.success && data?.token) return data;
            lastError = new Error(data?.error || `Token request failed (${res.status})`);
            // 4xx (429 ko chhodkar) retry se theek nahi hoga
            if (res.status >= 400 && res.status < 500 && res.status !== 429) retryable = false;
          } catch (e) {
            lastError = e;
          } finally {
            clearTimeout(timeoutId);
          }
          if (!retryable) break;
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
        throw lastError || new Error("Token request failed");
      };

      const numericUid = uidToNum(currentUid);
      const role = userRole === "host" || userRole === "speaker"
        ? ClientRoleType.ClientRoleBroadcaster
        : ClientRoleType.ClientRoleAudience;

      log("AGORA INIT ROLE =", userRole, "UID =", numericUid);
      log("AGORA AUTH USER =", firebaseUser.uid);

            const tokenData = await fetchAgoraToken(numericUid, firebaseIdToken);

      const token = tokenData.token;
      const backendUid = Number(tokenData.uid) || numericUid;
      log("AGORA TOKEN OK = true, UID =", backendUid);
      voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, agora: "Token OK / Joining..." };
      setMyAgoraUid(backendUid);

      engine = createAgoraRtcEngine();
      engine.initialize({ appId: "4e23c17b272f4a1c920c214be58486f4" });
      // ===== MUSIC-FRIENDLY AUDIO =====
      // true  -> doosre app (Saavn/VLC/YT Music...) ka song live me bhi chalta rahe aur
      //          speaker se mic me jaakar sab ko sunayi de.
      // false -> purani voice-chat setting (echo cancel ON, par song nahi jayega).
      const MUSIC_FRIENDLY_AUDIO = true;

      if (MUSIC_FRIENDLY_AUDIO) {
        // GameStreaming scenario = media volume mode -> doosre app ka music interrupt nahi hota
        await engine.setAudioProfile(
          AudioProfileType.AudioProfileMusicHighQuality,
          AudioScenarioType.AudioScenarioGameStreaming
        );
        // Echo-cancel / noise-suppress / auto-gain song ko "shor" samajh ke kaat dete hain
        await engine.setParameters(JSON.stringify({
          "che.audio.ans.enable": false,
          "che.audio.agc.enable": false,
          "che.audio.aec.enable": false
        }));
      } else {
        await engine.setAudioProfile(
          AudioProfileType.AudioProfileSpeechStandard,
          AudioScenarioType.AudioScenarioChatroom
        );
        await engine.setParameters(JSON.stringify({
          "che.audio.ans.enable": true,
          "che.audio.agc.enable": true,
          "che.audio.aec.enable": true
        }));
      }

      engine.registerEventHandler({
        onJoinChannelSuccess: (connection, uid) => {
          log("JOIN SUCCESS", uid, "ROLE =", userRole);
          setJoined(true);
          voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, agora: "Connected", mic: role === ClientRoleType.ClientRoleBroadcaster };
          isJoinedRef.current = true;
        },
        onUserJoined: (connection, uid) => {
          log("REMOTE USER JOINED =", uid);
          setRemoteUsers(prev => { const next = prev.includes(uid) ? prev : [...prev, uid]; voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, remote: true, remoteCount: next.length }; return next; });
        },
        onUserOffline: (connection, uid) => {
          log("REMOTE USER LEFT =", uid);
          setRemoteUsers(prev => { const next = prev.filter(id => id !== uid); voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, remote: next.length > 0, remoteCount: next.length }; return next; });
        },
        onAudioVolumeIndication: (connection, speakers) => {
          const map = {};
          let remoteVoice = false;
          (speakers || []).forEach(item => { if (item.volume > 10) { const isLocal = Number(item.uid) === 0 || Number(item.uid) === Number(backendUid); map[isLocal ? backendUid : item.uid] = true; if (!isLocal) remoteVoice = true; } });
          if (remoteVoice) voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, remote: true };
          // FIX: only push a new activeSpeakers object when the actual set of
          // speaking uids changed. Agora fires this callback ~2x/second the
          // entire time the call is connected, so without this guard the
          // whole room screen (5000+ lines of JSX) was re-rendering twice a
          // second even when nobody's speaking status changed — the single
          // biggest cause of the "not smooth" feeling during a live.
          setActiveSpeakers(prev => {
            const prevKeys = Object.keys(prev).sort().join(',');
            const nextKeys = Object.keys(map).sort().join(',');
            return prevKeys === nextKeys ? prev : map;
          });
        },
                // Token 1 ghante me expire hota hai -> expire se pehle chupchap renew.
        onTokenPrivilegeWillExpire: async () => {
          try {
            const fresh = await fetchAgoraToken(numericUid);
            if (engine && fresh?.token) engine.renewToken(fresh.token);
          } catch (e) { log("Token renew failed:", e?.message || e); }
        },
        onRequestToken: async () => {
          try {
            const fresh = await fetchAgoraToken(numericUid);
            if (engine && fresh?.token) engine.renewToken(fresh.token);
          } catch (e) { log("Token re-request failed:", e?.message || e); }
        },
        onError: err => { log("Agora Error:", err); voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, agora: `Error ${err}` }; },
      });

      await engine.enableAudio();
      await engine.setEnableSpeakerphone(true);
      await engine.setClientRole(role);
      engine.enableAudioVolumeIndication(500, 3, true);

      if (role === ClientRoleType.ClientRoleBroadcaster) {
        await engine.enableLocalAudio(true);
        await engine.muteLocalAudioStream(false);
      } else {
        await engine.enableLocalAudio(false);
        await engine.muteLocalAudioStream(true);
      }

      voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, mic: role === ClientRoleType.ClientRoleBroadcaster };

      await engine.joinChannel(token, roomId, backendUid, {
        channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
        clientRoleType: role,
      });

      agoraEngineRef.current = engine;
      log("AGORA JOINED ONCE =", backendUid);
    } catch (error) {
      log("AGORA INIT ERROR =", error?.message || error);
      voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, agora: `Failed: ${error?.message || error}`, mic: false };
      try { if (engine) engine.release(); } catch (_) {}
      agoraEngineRef.current = null;
      isJoinedRef.current = false;
      setJoined(false);
      throw error;
    } finally {
      agoraJoinStartedRef.current = false;
      agoraInitPromiseRef.current = null;
    }
  };

  agoraInitPromiseRef.current = run();
  return agoraInitPromiseRef.current;
};


  const handleSendChat = async () => {
    if (!chatMessage.trim()) return;
    const messageText = chatMessage.trim();
    Keyboard.dismiss();
    setChatMessage('');
    try {
      // SCALE FIX: append-only write (one small new doc) instead of
      // reading + rewriting the entire chat array on every message.
      // This also removes the race condition where two people sending
      // at the same moment could overwrite each other's message.
      await addDoc(collection(db, 'rooms', roomId, 'chats'), {
        senderName: currentRealName,
        username: currentName,
        message: messageText,
        userImg: currentAvatar || STABLE_AVATAR,
        verified: hostVerified,
        verifiedColor: hostVerifiedColor || "white",
        level: hostLevel,
        createdAt: Date.now(),
      });
    } catch (e) { log(e); }
  };


const sendQuickChat = async (text) => {
  if (!db || !roomId || !text) return;
  try {
    await addDoc(collection(db, 'rooms', roomId, 'chats'), {
      senderName: currentRealName,
      username: currentName,
      message: text,
      userImg: currentAvatar || STABLE_AVATAR,
      verified: hostVerified,
      verifiedColor: hostVerifiedColor || "white",
      level: hostLevel,
      createdAt: Date.now(),
    });
  } catch (e) { log(e); }
};

const handleShare = async () => {
  try {

    const shareLink = `https://topking.app/live/${roomId}`;

    await Share.share({
      message: `🎙 Join my Live Room\n${shareLink}`,
    });

setShareModalVisible(false);

  } catch (e) {
    log(e);
  }
};




const toggleFriend=(id)=>{

if(selectedFriends.includes(id)){

setSelectedFriends(

selectedFriends.filter(x=>x!==id)

);

}else{

setSelectedFriends([

...selectedFriends,

id

]);

}

};



const sendInvite = async () => {
  try {

    for (const uid of selectedFriends) {

      const chatId =
        currentUid < uid
          ? `${currentUid}_${uid}`
          : `${uid}_${currentUid}`;

      // Chat message
      await addDoc(
        collection(
          db,
          "chats",
          chatId,
          "messages"
        ),
        {
          type: "liveInvite",

          senderId: currentUid,
          receiverId: uid,

          roomId: roomId,

          roomLink:
            `https://topking.app/live/${roomId}`,

          text:
            `${currentName} invited you to join live`,

          createdAt: serverTimestamp(),
        }
      );

await setDoc(
  doc(
    db,
    "userChats",
    uid,
    "friends",
    currentUid
  ),
  {
    userId: currentUid,

    username: currentName,

    lastMessage: "🎙 Live Invite",

    hasNewMessage: true,

    unreadCount: increment(1),

    updatedAt: serverTimestamp(),
  },
  { merge: true }
);


await setDoc(
  doc(
    db,
    "userChats",
    currentUid,
    "friends",
    uid
  ),
  {
    userId: uid,

    lastMessage: "🎙 Live Invite",

    updatedAt: serverTimestamp(),
  },
  { merge: true }
);



      log("LIVE INVITE SAVED =", uid);

      // Notification
      await setDoc(
        doc(
          db,
          "notifications",
          Date.now().toString() + uid
        ),
        {
          to: uid,
          senderId: currentUid,
          roomId: roomId,
          type: "liveInvite",
          createdAt: Date.now(),
        }
      );

    }

    alert("Invite Sent");

    setSelectedFriends([]);
    setFriendShareVisible(false);

  } catch (e) {

    log(
      "INVITE ERROR =",
      e
    );

  }
};






const approveRequest = async (user)=>{



try{

const roomRef = doc(db,"rooms",roomId);

let targetSeat = user.seatKey;

if (!targetSeat) {

  for (let i = 2; i <= 8; i++) {

    const key = `seat_${i}`;

    if (!roomData?.seatsData?.[key]?.userId) {

      targetSeat = key;

      break;

    }

  }

}


if (!targetSeat) {

  alert("No Empty Seat Available");

  return;

}


await updateDoc(roomRef,{


[`seatsData.${targetSeat}`]: {
  userId: user.uid,
  userName: user.name,
  realName: user.realName,
  userImg: user.img,
  verified: user.verified || false,
  verifiedColor:
user.verifiedColor || "white",
  level: user.level || 1,
  isMuted: false,
  roleTag: "SPEAKER"
},

[`speakerRequests.${user.uid}`]:null

});

}catch(e){

log(e);

}

};



const removeSpeaker = async(seatKey)=>{

try{

const roomRef = doc(db,"rooms",roomId);

await updateDoc(roomRef,{

[`seatsData.${seatKey}`]:{

userId:null,

userName:"Open",

userImg:STABLE_AVATAR,

isMuted:false

}

});

}catch(e){

log(e);

}

};



const muteSpeaker = async () => {

  try {

    const roomRef = doc(db, "rooms", roomId);

    await updateDoc(roomRef,{
  [`seatsData.${selectedSeatKey}.isMuted`]:
    !selectedSpeaker.isMuted,

  [`seatsData.${selectedSeatKey}.mutedByHost`]:
    !selectedSpeaker.isMuted
});

    setSpeakerModalVisible(false);

  } catch (e) {
    log(e);
  }

};



const muteSelf = async () => {

  try {



let mySeatData = null;

Object.entries(
  roomData.seatsData || {}
).forEach(([key,seat])=>{

  if(seat?.userId===currentUid){
    mySeatData = seat;
  }

});

if(mySeatData?.mutedByHost){

  alert(
    "Host has muted you. Only host can unmute."
  );

  return;
}


    const newValue = !selfMuted;

    setSelfMuted(newValue);

    if (agoraEngineRef.current) {

      await agoraEngineRef.current.muteLocalAudioStream(newValue);

    }

    if (roomData && currentUserRole !== "listener") {

      let mySeat = null;

      Object.entries(roomData.seatsData || {}).forEach(([key, seat]) => {

        if (seat?.userId === currentUid) {

          mySeat = key;

        }

      });

      if (mySeat) {

      await updateDoc(
  doc(db,"rooms",roomId),
  {
    [`seatsData.${mySeat}.isMuted`]:newValue,

    // khud mute/unmute kiya
    [`seatsData.${mySeat}.mutedByHost`]:false
  }
);

      }

    }

  } catch (e) {

    log(e);

  }

};


const leaveOwnSeat = async () => {

  try {

    let mySeat = null;

    Object.entries(roomData.seatsData || {}).forEach(([key, seat]) => {

      if (seat?.userId === currentUid) {

        mySeat = key;

      }

    });

    if (!mySeat || mySeat === "seat_1") return;

    await updateDoc(
      doc(db, "rooms", roomId),
      {
        [`seatsData.${mySeat}`]: {
          userId: null,
          userName: "Open",
          userImg: STABLE_AVATAR,
          isMuted: false
        }
      }
    );

    if (agoraEngineRef.current) {

      await agoraEngineRef.current.setClientRole(
        ClientRoleType.ClientRoleAudience
      );

      await agoraEngineRef.current.enableLocalAudio(false);

      await agoraEngineRef.current.muteLocalAudioStream(true);

    }

    setCurrentUserRole("listener");

    setSelfSeatModalVisible(false);

  } catch (e) {

    log(e);

  }

};






// ============================================================
// SEND GIFT
// Order matters for speed:
//   1) close the gift sheet + show animation/banner IMMEDIATELY
//      (the Modal used to stay open until ~10 network calls finished,
//       and it sits ON TOP of the animation -> gift looked "late")
//   2) do all Firestore / backend work in the background, in parallel
// ============================================================
const handleSendGift = (item) => {

  if (!selectedGiftUser || typeof selectedGiftUser !== "string") {
    alert("Please select user");
    return;
  }

  if (stars < item.price) {
    alert("Not enough stars");
    return;
  }

  const receiverId = selectedGiftUser;

  // hard guard: never gift yourself, and only users that are in the list
  if (
    receiverId === currentUid ||
    !giftUsers.some(u => u.uid === receiverId)
  ) {
    alert("Please select another user");
    return;
  }

  // 1) close the sheet right now
  setGiftModalVisible(false);

  // 2) instant local animation + banner
  if (item.animation) {
    playGift(item.animation, item.duration);
  }

  const isComboContinue =
    lastGiftRef.current &&
    lastGiftRef.current.senderId === currentUid &&
    lastGiftRef.current.giftId === item.id &&
    (Date.now() - lastGiftRef.current.time) < 3000;

  if (!global.giftComboCount || !isComboContinue) {
    global.giftComboCount = 1;
  } else {
    global.giftComboCount++;
  }

  const comboCount = global.giftComboCount;

  lastGiftRef.current = {
    senderId: currentUid,
    giftId: item.id,
    time: Date.now()
  };

  if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);

  const _receiver = giftUsers.find(u => u.uid === receiverId);
  const _receiverName =
    _receiver?.name ||
    audienceMap?.[receiverId]?.name ||
    audienceMap?.[receiverId]?.username ||
    "user";
  const _senderDisplay =
    (currentRealName && currentRealName !== "User") ? currentRealName : currentName;

  setGiftCombo({
    senderName: _senderDisplay,
    senderImg: currentAvatar || STABLE_AVATAR,
    receiverName: _receiverName,
    giftId: item.id,
    giftName: item.name,
    count: comboCount
  });

  comboTimeoutRef.current = setTimeout(() => {
    setGiftCombo(null);
    lastGiftRef.current = null;
    global.giftComboCount = 0;
  }, 2200);

  // Own gift timestamp: mark as seen so the Firestore echo is ignored.
  const giftTimestamp = Date.now();
  lastSeenGiftKeyRef.current = `${currentUid}_${giftTimestamp}`;

  // 3) everything else in the background (never awaited by the UI)
  sendGiftInBackground({
    item,
    receiverId,
    receiverName: _receiverName,
    senderDisplay: _senderDisplay,
    comboCount,
    giftTimestamp,
  });

};

const sendGiftInBackground = async ({
  item,
  receiverId,
  receiverName,
  senderDisplay,
  comboCount,
  giftTimestamp,
}) => {

  if (!db || !roomId || !currentUid) return;

  const price = Number(item.price || 0);
  const roomRef = doc(db, "rooms", roomId);
  const receiverWalletRef = doc(db, "wallets", receiverId);
  const receiverUserRef = doc(db, "users", receiverId);

  const jobs = [

    // sender wallet
    updateDoc(doc(db, "wallets", currentUid), { stars: increment(-price) }),

    // seatStars + liveGift in ONE write -> every viewer gets ONE snapshot
    // (used to be 2 separate updateDoc calls = 2 snapshots per gift)
    updateDoc(roomRef, {
      [`seatStars.${receiverId}`]: increment(price),
      liveGift: {
        giftId: item.id,
        giftName: item.name,
        senderId: currentUid,
        senderName: senderDisplay,
        senderImg: currentAvatar || STABLE_AVATAR,
        receiverId,
        receiverName,
        timestamp: giftTimestamp,
        comboCount,
      },
    }),

    // receiver wallet: earnings + receivedStars in one merge-write
    // (no read-then-write, creates the wallet if it doesn't exist)
    setDoc(
      receiverWalletRef,
      {
        earnings: increment(price),
        receivedStars: increment(price),
      },
      { merge: true }
    ),

    // receiver's top-gifters: atomic increment on just this sender's entry
    // instead of reading 2 user docs + rewriting the whole topGifters map
    updateDoc(receiverUserRef, {
      [`topGifters.${currentUid}.uid`]: currentUid,
      [`topGifters.${currentUid}.username`]: currentName || "",
      [`topGifters.${currentUid}.name`]: currentRealName || currentName || "User",
      [`topGifters.${currentUid}.profileImg`]: currentAvatar || "",
      [`topGifters.${currentUid}.stars`]: increment(price),
    }),

  ];

  // chat line only on the first tap of a combo (avoid spam)
  if (comboCount === 1) {
    jobs.push(
      addDoc(collection(db, "rooms", roomId, "chats"), {
        type: "gift",
        senderName: senderDisplay,
        username: currentName,
        userImg: currentAvatar || STABLE_AVATAR,
        level: hostLevel,
        verified: hostVerified,
        verifiedColor: hostVerifiedColor || "white",
        receiverName,
        giftId: item.id,
        giftName: item.name,
        createdAt: Date.now(),
      })
    );
  }

  // one failing write must not cancel the others
  const results = await Promise.allSettled(jobs);
  results.forEach((r, idx) => {
    if (r.status === "rejected" && __DEV__) {
      log("GIFT WRITE FAILED #" + idx, r.reason);
    }
  });

  // agency stars: fire-and-forget. The Render backend can take 30s+ on a
  // cold start, so this must never sit in the UI path.
  fetch("https://topking-backend.onrender.com/update-agency-stars", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ receiverUid: receiverId, stars: price }),
  })
    .then(r => r.json())
    .then(res => { if (__DEV__) log("AGENCY UPDATE RESPONSE =", res); })
    .catch(e => { if (__DEV__) log("Agency Update Error =", e); });

};

  if (loading) return <View style={styles.loader}><Text style={{color:'#fff'}}>Entering Live Room...</Text></View>;

  // SCALE FIX: sourced from the audience subcollection listener now.
  // A doc only exists here while that viewer is actually present, so
  // there's no separate "online" flag to check anymore — presence IS
  // document existence.
  const audienceArray = Object.values(audienceMap).filter(
    user =>
      user &&
      user.uid &&
      user.uid !== roomData?.hostId
  );

const topUsers = audienceArray.slice(0,3);

const totalViewers = audienceArray.length;

const heartTotal = Object.values(audienceMap).reduce(
  (a, u) => a + ((u && u.hearts) || 0), 0
);

const topSeatUsers = Object.values(
  roomData?.seatsData || {}
).filter(
  item => item?.userId
);


handleSendGiftRef.current = handleSendGift;

// GIFT POPUP: sirf wahi users jo seat (site) pe baithe hain.
// Upar audience/listener list wale users popup me nahi aayenge.
const giftUsers = [];
const _giftSeen = new Set();

Object.values(roomData?.seatsData || {}).forEach((seat) => {

  if (!seat || !seat.userId) return;

  // nobody can gift themselves (host included)
  if (seat.userId === currentUid) return;

  // same user 2 seats pe ho to sirf ek baar (duplicate key fix)
  if (_giftSeen.has(seat.userId)) return;
  _giftSeen.add(seat.userId);

  giftUsers.push({
    uid: seat.userId,
    name: seat.userName,
    img: seat.userImg
  });

});



const requestsArray =
roomData?.speakerRequests
? Object.values(roomData.speakerRequests).filter(Boolean)
: [];




const handleSeatPress = (key) => {
  const seat = roomData?.seatsData?.[key] || {};

  if (seat.userId && seat.userId === currentUid) {
    setSelectedSeatKey(key);
    setSelectedSpeaker(seat);
    setSelfMuted(seat.isMuted || false);
    setSelfSeatModalVisible(true);
    return;
  }

  if (!seat.userId && currentUserRole === "listener") {
    sendSeatRequest(key);
    return;
  }

  if (currentUserRole === "host" && seat.userId && key !== "seat_1") {
    setSelectedSeatKey(key);
    setSelectedSpeaker(seat);
    setSpeakerModalVisible(true);
  } else if (seat.userId && currentUserRole !== "host") {
    setSelectedSpeaker(seat);
    setProfileVisible(true);
  }
};
seatPressRef.current = handleSeatPress;

return (
  <View style={styles.mainContainer}>

    <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
    <LinearGradient pointerEvents="none" colors={T.bgGradient} style={StyleSheet.absoluteFill} />

    {/* ================= TOP HEADER ================= */}
    <SafeAreaView style={styles.topHeader}>
      <View style={styles.hostBadge}>



        <View
style={styles.hostAvatarContainer}
>

<Image
source={{
uri:
roomData?.seatsData?.seat_1?.userImg
}}
style={styles.topHostImg}
/>

{
roomData?.seatsData?.seat_1?.level>=10 && (

<LevelFrame level={roomData?.seatsData?.seat_1?.level} style={styles.hostLevelFrame} />

)
}

</View>

        <View>




<View
  style={{
    flexDirection:"row",
    alignItems:"center",
    marginLeft:10,
  }}
>

  <Text style={styles.roomNameText}>
    {roomData?.seatsData?.seat_1?.userName || "Live Room"}
  </Text>

  {roomData?.seatsData?.seat_1?.verified && (
  <View style={styles.verifiedBadge}>
    <MaterialCommunityIcons
    name="check-decagram"
    size={17}
    color={
roomData?.seatsData?.seat_1?.verifiedColor
=== "yellow"
? "#FFD700"
: "#ffffff"
}
  />
  </View>
)}

  <View
    style={[
      styles.levelBadge,
      {
        backgroundColor:getLevelTheme(
          roomData?.seatsData?.seat_1?.level || 1
        ).bg,

        borderColor:getLevelTheme(
          roomData?.seatsData?.seat_1?.level || 1
        ).border,
      }
    ]}
  >

    <MaterialCommunityIcons
      name="diamond-stone"
      size={10}
      color={
        getLevelTheme(
          roomData?.seatsData?.seat_1?.level || 1
        ).icon
      }
    />

    <Text
      style={{
        color:getLevelTheme(
          roomData?.seatsData?.seat_1?.level || 1
        ).text,
        fontSize:9,
        fontWeight:"bold",
        marginLeft:2,
      }}
    >
      LV {roomData?.seatsData?.seat_1?.level || 1}
    </Text>

  </View>

</View>

          

          <View style={styles.viewRow}>
            <MaterialCommunityIcons name="waveform" size={14} color="#f1c40f" />
            <Text style={styles.onlineText}>
  {totalViewers} views
</Text>

            <View style={styles.liveTag}>
<LiveTimer startTime={roomStartTime} />
</View>




          </View>
        </View>
      </View>


<TouchableOpacity activeOpacity={0.8} onPress={() => setViewersVisible(true)} style={styles.viewerContainer}>

{topUsers.map((user,index)=>(

<View
    key={user.uid}
    style={{
        marginLeft:index===0 ? 0 : -10
    }}
>

<Image
    source={{
        uri:user.img || STABLE_AVATAR
    }}
    style={styles.viewerAvatar}
/>

{
(user.level || 0) >= 10 && (

<LevelFrame level={user.level}
    style={{
        position:"absolute",
        width:50,
        height:50,
        top:-8,
        left:-8,
        zIndex:10
    }}
/>

)
}

</View>

))}

<View style={styles.viewerCount}>

<Text style={styles.viewerCountText}>
{totalViewers}
</Text>

</View>

</TouchableOpacity>



    </SafeAreaView>

    {/* ================= QUICK TOOLBAR ================= */}
    <View style={styles.toolbar}>
      <View style={styles.chip}>
        <Ionicons name="heart" size={13} color={T.pink} />
        <Text style={styles.chipTxt}>{fmtCount(heartTotal)}</Text>
      </View>
      <TouchableOpacity style={styles.chip} onPress={() => setGiftersVisible(true)}>
        <MaterialCommunityIcons name="trophy" size={13} color={T.gold} />
        <Text style={styles.chipTxt}>Top</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.chip} onPress={() => setFriendShareVisible(true)}>
        <Ionicons name="share-social" size={13} color="#fff" />
        <Text style={styles.chipTxt}>Share</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.chip, { paddingHorizontal: 9 }]} onPress={() => setMenuVisible(true)}>
        <Ionicons name="ellipsis-horizontal" size={16} color="#fff" />
      </TouchableOpacity>
    </View>

    {/* ================= MAIN CONTENT ================= */}
 <View style={{flex:1}}>

      {/* SEATS */}
      <View style={styles.micGrid}>
        {SEAT_KEYS.map((key, i) => {
          const seat = roomData?.seatsData?.[key] || EMPTY_SEAT;
          let speaking = false;
          if (seat.userId) {
            speaking = !!activeSpeakers[uidToNum(seat.userId)];
          }
          return (
            <SeatItem
              key={key}
              seatKey={key}
              index={i + 1}
              seat={seat}
              stars={(seat.userId && roomData?.seatStars?.[seat.userId]) || 0}
              isSpeaking={speaking}
              onPress={stableSeatPress}
            />
          );
        })}
      </View>

      {!!roomData?.description && (
        <View style={styles.pinned}>
          <Ionicons name="megaphone" size={13} color={T.gold} />
          <Text numberOfLines={4} ellipsizeMode="tail" style={styles.pinnedTxt}>{roomData.description}</Text>
        </View>
      )}

      {/* CHAT */}
<FlatList
    ref={chatScrollRef}
    data={chatMessages}
    style={styles.chatArea}
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={{
        paddingBottom:120
    }}
    showsVerticalScrollIndicator={false}
    initialNumToRender={10}
    maxToRenderPerBatch={6}
    windowSize={5}
    removeClippedSubviews={false}
    updateCellsBatchingPeriod={40}
    keyExtractor={chatKeyExtractor}
   



    renderItem={renderChatItem}
/>







    </View>



<GiftOverlay
  activeGift={activeGift}
  playKey={giftPlayKey}
  onFinish={handleGiftFinish}
/>

{/* ================= GIFT BANNER (always visible, independent of animation) ================= */}
{
giftCombo && (
  <Animated.View
    pointerEvents="none"
    style={{
      position:"absolute",
      top: height*0.25,
      left:10,
      zIndex:99998,
      elevation:99998,
      flexDirection:"row",
      alignItems:"center",
      opacity: giftOpacity,
      transform:[
        { translateX: giftTranslateX },
        { scale: giftScale }
      ]
    }}
  >
    {/* Pill: avatar + name + "send @receiver" */}
    <View
      style={{
        flexDirection:"row",
        alignItems:"center",
        paddingLeft:6,
        paddingRight:14,
        paddingVertical:6,
        borderRadius:30,
        backgroundColor:"rgba(0,0,0,0.55)",
        borderWidth:1.5,
        borderColor:"rgba(255,105,180,0.8)",
        maxWidth: width*0.62
      }}
    >
      <Animated.Image
        source={{ uri: giftCombo.senderImg || audienceMap?.[lastGiftRef.current?.senderId]?.img || STABLE_AVATAR }}
        style={{
          width:44,
          height:44,
          borderRadius:22,
          marginRight:8,
          backgroundColor:"#2a2b38",
          transform:[{
            rotate: giftShake.interpolate({
              inputRange:[-1,1],
              outputRange:["-8deg","8deg"]
            })
          }]
        }}
      />
      <View style={{ flexShrink:1 }}>
        <Text numberOfLines={1} style={{ color:"#fff", fontWeight:"bold", fontSize:14 }}>
          {giftCombo.senderName}
        </Text>
        <Text numberOfLines={1} style={{ color:"#fff", fontSize:13, marginTop:1 }}>
          send{" "}
          <Text style={{ color:"#FFE600", fontWeight:"bold" }}>
            @{giftCombo.receiverName || "user"}
          </Text>
        </Text>
      </View>
    </View>

    {/* Gift PNG */}
    {(() => {
      const gd = gifts.find(g => String(g.id) === String(giftCombo.giftId));
      return gd?.icon ? (
        <Image
          source={gd.icon}
          style={{ width:58, height:58, resizeMode:"contain", marginLeft:6 }}
        />
      ) : null;
    })()}

    {/* x1 / x2 ... */}
    <Text
      style={{
        color:"#FF69B4",
        fontSize:34,
        fontWeight:"900",
        fontStyle:"italic",
        marginLeft:4,
        textShadowColor:"rgba(0,0,0,0.6)",
        textShadowOffset:{ width:1, height:1 },
        textShadowRadius:3
      }}
    >
      x{giftCombo.count || 1}
    </Text>
  </Animated.View>
)
}

{/* ================= JOIN ENTRY ANIMATION ================= */}
{joinBanner && (
  <JoinEntry
    data={joinBanner}
    variant={JOIN_ANIM_VARIANT}
    onDone={handleJoinDone}
  />
)}

    <FloatingHearts ref={heartsRef} />

    {emojiOpen && (
      <View
        style={[
          styles.emojiBar,
          { bottom: keyboardHeight + 76 + (Platform.OS === "android" ? insets.bottom + 8 : insets.bottom) },
        ]}
      >
        <EmojiStrip onPick={sendQuickChat} />
      </View>
    )}

    {/* ================= BOTTOM BAR ================= */}
 <KeyboardAvoidingView
  behavior={Platform.OS === "ios" ? "padding" : undefined}
  keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
  style={[
    styles.bottomNav,
    {
      bottom: keyboardHeight,
      paddingBottom:
        Platform.OS === "android"
          ? insets.bottom + 8
          : insets.bottom
    }
  ]}
>

      <View style={styles.inputBox}>
        <TextInput
          style={styles.inputStyle}
          placeholder="Chat"
          placeholderTextColor="#666"
          value={chatMessage}
          onChangeText={setChatMessage}
          onSubmitEditing={handleSendChat}
        />
        <TouchableOpacity onPress={() => setEmojiOpen(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name={emojiOpen ? "happy" : "happy-outline"} size={22} color={T.sub} />
        </TouchableOpacity>
      </View>


{currentUserRole !== 'listener' && (
  <TouchableOpacity style={styles.actionCircle} onPress={muteSelf} activeOpacity={0.7}>
    <Ionicons name={iAmMuted ? "mic-off" : "mic"} size={22} color={iAmMuted ? T.live : "#fff"} />
  </TouchableOpacity>
)}

<TouchableOpacity
  style={[styles.actionCircle, { backgroundColor: 'rgba(255,77,141,0.18)' }]}
  onPress={sendHeart}
  activeOpacity={0.7}
>
  <Ionicons name="heart" size={24} color={T.pink} />
</TouchableOpacity>


      {currentUserRole === 'listener' && (
        <TouchableOpacity style={styles.raiseHandBtn} onPress={handleRaiseHand}>
          <Text style={styles.raiseHandText}>✋</Text>
        </TouchableOpacity>
      )}

      {currentUserRole === 'host' && (


       <TouchableOpacity
  style={styles.actionCircle}
  onPress={() => setRequestModalVisible(true)}
>

  <Ionicons
    name="people-outline"
    size={24}
    color="#fff"
  />

  {requestsArray.length > 0 && (

    <View style={styles.requestBadge}>

      <Text style={styles.requestBadgeText}>
        {requestsArray.length}
      </Text>

    </View>

  )}

</TouchableOpacity> 

        
      )}

     
     <TouchableOpacity
  style={styles.giftCircle}
  onPress={() => {
    if (!giftUsers.some(u => u.uid === selectedGiftUser)) {
      setSelectedGiftUser(null);
    }
    setGiftModalVisible(true);
  }}
>
  
<LottieView
  source={require("../assets/animations/giftButton.json")}
  autoPlay
  loop
  style={{
    width: 50,
    height: 50,
  }}
/>

</TouchableOpacity>

    </KeyboardAvoidingView>

    {/* ================= EXIT MODAL ================= */}
    <Modal transparent visible={controlModalVisible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.exitBox}>
          <Text style={styles.exitTitle}>Exit Room?</Text>
          <Text style={styles.exitSub}>
           Do you really want to go to the home screen?
          </Text>

          <View style={styles.btnRow}>
            <TouchableOpacity
  style={styles.noBtn}
  onPress={() => setControlModalVisible(false)}
>
  <Text style={styles.btnText}>No</Text>
</TouchableOpacity>

<TouchableOpacity
  style={styles.yesBtn}
  onPress={cleanAndExit}
>
  <Text style={styles.btnText}>Yes</Text>
</TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* ================= SPEAKER REQUEST MODAL ================= */}
    <Modal
visible={requestModalVisible}
transparent
animationType="slide"
onRequestClose={() => setRequestModalVisible(false)}
>


      <View style={styles.bottomSheetOverlay}>
        <View style={styles.requestSheet}>

          <Text style={{color:'#fff', fontSize:20, fontWeight:'bold', marginBottom:20}}>
            🔊 Speaker Requests
          </Text>

          <ScrollView>

            {requestsArray.map((user,index)=>(
              <View key={index} style={{
                backgroundColor:'#2B2D42',
                padding:12,
                borderRadius:12,
                marginBottom:10,
                flexDirection:'row',
                justifyContent:'space-between',
                alignItems:'center'
              }}>


               <View>

<Text style={{color:'#fff'}}>
{user.name}
</Text>

<Text style={{
color:'#888',
fontSize:12
}}>
Requested Seat :
{
user?.seatKey
? user.seatKey.replace("_"," ")
: "No Seat"
}
</Text>

</View>

                <TouchableOpacity onPress={() => approveRequest(user)}>
                  <Text style={{color:'#00ff88', fontWeight:'bold'}}>Approve</Text>
                </TouchableOpacity>
              </View>
            ))}

            <Text style={{
              color:'#fff',
              fontSize:18,
              fontWeight:'bold',
              marginTop:20,
              marginBottom:10
            }}>
              Current Speakers
            </Text>

            {Object.entries(roomData?.seatsData || {})
              .filter(([key,seat]) => seat?.userId && key !== 'seat_1')
              .map(([key,seat]) => (
                <View key={key} style={{
                  backgroundColor:'#2B2D42',
                  padding:12,
                  borderRadius:12,
                  marginBottom:10,
                  flexDirection:'row',
                  justifyContent:'space-between',
                  alignItems:'center'
                }}>
                  <Text style={{color:'#fff'}}>{seat.userName}</Text>

                  <TouchableOpacity onPress={() => removeSpeaker(key)}>
                    <Text style={{color:'red', fontWeight:'bold'}}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}

          </ScrollView>

          <TouchableOpacity onPress={() => setRequestModalVisible(false)}>
            <Text style={{color:'#fff', marginTop:20}}>Close</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>




<GiftSheet
  visible={giftModalVisible}
  onClose={closeGiftSheet}
  stars={stars}
  giftUsers={giftUsers}
  selectedGiftUser={selectedGiftUser}
  onSelectUser={setSelectedGiftUser}
  onSendGift={onSendGiftStable}
/>




<Modal
visible={speakerModalVisible}
transparent
animationType="slide"
onRequestClose={() => setSpeakerModalVisible(false)}
>

<View style={{
flex:1,
justifyContent:'flex-end',
backgroundColor:'rgba(0,0,0,0.5)'
}}>

<View style={{
backgroundColor:'#000',
height:height*0.55,
borderTopLeftRadius:30,
borderTopRightRadius:30,
alignItems:'center',
paddingBottom: insets.bottom + 20,
}}>

<View style={{
flexDirection:'row',
justifyContent:'space-between',
width:'100%',
paddingHorizontal:30,
marginTop:20
}}>

<TouchableOpacity
onPress={()=>{
removeSpeaker(selectedSeatKey);
setSpeakerModalVisible(false);
}}
>

<Text style={{
color:'red',
fontSize:20,
fontWeight:'bold'
}}>
❌ Remove
</Text>

</TouchableOpacity>


<TouchableOpacity
onPress={muteSpeaker}
>

<Text style={{
color:'#fff',
fontSize:20,
fontWeight:'bold'
}}>
{selectedSpeaker?.isMuted ? "🔇 Unmute" : "🔊 Mute"}
</Text>

</TouchableOpacity>

</View>


<TouchableOpacity
onPress={() => {

setSpeakerModalVisible(false);

if (agoraEngineRef.current) {

agoraEngineRef.current.muteAllRemoteAudioStreams(true);

}

router.push({
  pathname: "/userProfile",
  params: {
    userId: selectedSpeaker?.userId,
    roomId: roomId
  }
});

}}
>

<View>

<Image
source={{
uri:selectedSpeaker?.userImg
}}
style={{
width:100,
height:100,
borderRadius:50
}}
/>
<ProfileFrame level={profileLevel} avatarSize={100} frameSize={120} />

</View>

</TouchableOpacity>



<View
  style={{
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
  }}
>

  <Text
    style={{
      color: "#fff",
      fontSize: 24,
      fontWeight: "bold",
    }}
  >
    @{selectedSpeaker?.userName}
  </Text>

  {/* Verified Tick */}
 
{selectedSpeaker?.verified && (
  <MaterialCommunityIcons
    name="check-decagram"
    size={18}
    color={
selectedSpeaker?.verifiedColor
=== "yellow"
? "#FFD700"
: "#ffffff"
}
  />
)}

  

  {/* Level */}
  <View
    style={[
      styles.levelBadge,
      {
        marginLeft: 8,
        backgroundColor: getLevelTheme(
          selectedSpeaker?.level || 1
        ).bg,
        borderColor: getLevelTheme(
          selectedSpeaker?.level || 1
        ).border,
      },
    ]}
  >
    <MaterialCommunityIcons
      name="diamond-stone"
      size={10}
      color={
        getLevelTheme(
          selectedSpeaker?.level || 1
        ).icon
      }
    />

    <Text
      style={{
        color: getLevelTheme(
          selectedSpeaker?.level || 1
        ).text,
        fontSize: 9,
        fontWeight: "bold",
        marginLeft: 2,
      }}
    >
      LV {selectedSpeaker?.level || 1}
    </Text>
  </View>

</View>

{/* Followers / Following / Likes — host can see this too, same as viewer popup */}
<View
  style={{
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 16,
    width: "100%",
  }}
>
  <View style={{ alignItems: "center", paddingHorizontal: 18 }}>
    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "bold" }}>
      {previewStatsLoading ? "—" : previewFollowersCount}
    </Text>
    <Text style={{ color: "#888", fontSize: 12, marginTop: 2 }}>
      Followers
    </Text>
  </View>

  <View style={{ width: 1, backgroundColor: "#222" }} />

  <View style={{ alignItems: "center", paddingHorizontal: 18 }}>
    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "bold" }}>
      {previewStatsLoading ? "—" : previewFollowingCount}
    </Text>
    <Text style={{ color: "#888", fontSize: 12, marginTop: 2 }}>
      Following
    </Text>
  </View>

  <View style={{ width: 1, backgroundColor: "#222" }} />

  <View style={{ alignItems: "center", paddingHorizontal: 18 }}>
    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "bold" }}>
      {previewStatsLoading ? "—" : previewLikesCount}
    </Text>
    <Text style={{ color: "#888", fontSize: 12, marginTop: 2 }}>
      Likes
    </Text>
  </View>
</View>

{/* Follow / Like — host can follow/like a speaker right from this same panel */}
{selectedSpeaker?.userId && selectedSpeaker.userId !== currentUid && (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      marginTop: 18,
      width: "88%",
    }}
  >
    <TouchableOpacity
      disabled={previewFollowBusy}
      onPress={() => handlePreviewFollow(selectedSpeaker)}
      style={{
        flex: 1,
        backgroundColor: previewIsFollowing ? "#1C1E2E" : "#f71084",
        borderWidth: previewIsFollowing ? 1 : 0,
        borderColor: "#3a3d52",
        paddingVertical: 12,
        borderRadius: 22,
        alignItems: "center",
        marginRight: 10,
        opacity: previewFollowBusy ? 0.6 : 1,
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>
        {previewIsFollowing
          ? "Following"
          : previewIsFollowBack
          ? "Follow Back"
          : "Follow"}
      </Text>
    </TouchableOpacity>

    <TouchableOpacity
      disabled={previewLikeBusy}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#1C1E2E",
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 22,
        opacity: previewLikeBusy ? 0.6 : 1,
      }}
      onPress={() => handlePreviewLike(selectedSpeaker)}
    >
      <Ionicons
        name={previewHasLiked ? "heart" : "heart-outline"}
        size={16}
        color="#ff1493"
      />
      <Text
        style={{
          color: "#fff",
          fontWeight: "bold",
          fontSize: 14,
          marginLeft: 6,
        }}
      >
        {previewHasLiked ? "Liked" : "Like"}
      </Text>
    </TouchableOpacity>
  </View>
)}

</View>

</View>

</Modal>



<Modal
visible={profileVisible}
transparent
animationType="slide"
onRequestClose={() => setProfileVisible(false)}
>

<View
style={{
flex:1,
justifyContent:"flex-end",
backgroundColor:"rgba(0,0,0,0.5)"
}}
>

<View
style={{
backgroundColor:"#000",
height:height*0.42,
borderTopLeftRadius:30,
borderTopRightRadius:30,
alignItems:"center",
paddingTop:5,
paddingBottom: insets.bottom + 15,
}}
>

<TouchableOpacity
onPress={() => {

setProfileVisible(false);

if (agoraEngineRef.current) {
agoraEngineRef.current.muteAllRemoteAudioStreams(true);
}

router.push({
pathname:"/userProfile",
params:{
userId:selectedSpeaker?.userId,
roomId:roomId
}
});

}}
>

<View>

<Image
source={{
uri:selectedSpeaker?.userImg
}}
style={{
width:100,
height:100,
borderRadius:50
}}
/>


<ProfileFrame level={profileLevel} avatarSize={100} frameSize={120} />

</View>

</TouchableOpacity>


<View
  style={{
    flexDirection: "row",
    alignItems: "center",
    marginTop: 15,
    justifyContent: "center",
  }}
>
  <Text
    style={{
      color: "#fff",
      fontSize: 22,
      fontWeight: "bold",
    }}
  >
    @{selectedSpeaker?.userName}
  </Text>

  {/* Verified Tick */}
  
    
     <View style={styles.verifiedBadge}>
  
<MaterialCommunityIcons
    name="check-decagram"
    size={18}
    color={
selectedSpeaker?.verifiedColor
=== "yellow"
? "#FFD700"
: "#ffffff"
}
  />

  </View>
  

  {/* Level Badge */}
  <View
    style={[
      styles.levelBadge,
      {
        marginLeft: 8,
        backgroundColor: getLevelTheme(
          selectedSpeaker?.level || 1
        ).bg,
        borderColor: getLevelTheme(
          selectedSpeaker?.level || 1
        ).border,
      },
    ]}
  >
    <MaterialCommunityIcons
      name="diamond-stone"
      size={10}
      color={
        getLevelTheme(
          selectedSpeaker?.level || 1
        ).icon
      }
    />

    <Text
      style={{
        color: getLevelTheme(
          selectedSpeaker?.level || 1
        ).text,
        fontSize: 9,
        fontWeight: "bold",
        marginLeft: 2,
      }}
    >
      LV {selectedSpeaker?.level || 1}
    </Text>
  </View>
</View>

{/* Followers / Following / Likes — same numbers as the full profile */}
<View
  style={{
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 18,
    width: "100%",
  }}
>
  <TouchableOpacity
    style={{ alignItems: "center", paddingHorizontal: 18 }}
    onPress={() => {
      setProfileVisible(false);
      router.push({
        pathname: "/userProfile",
        params: { userId: selectedSpeaker?.userId, roomId: roomId },
      });
    }}
  >
    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "bold" }}>
      {previewStatsLoading ? "—" : previewFollowersCount}
    </Text>
    <Text style={{ color: "#888", fontSize: 12, marginTop: 2 }}>
      Followers
    </Text>
  </TouchableOpacity>

  <View style={{ width: 1, backgroundColor: "#222" }} />

  <TouchableOpacity
    style={{ alignItems: "center", paddingHorizontal: 18 }}
    onPress={() => {
      setProfileVisible(false);
      router.push({
        pathname: "/userProfile",
        params: { userId: selectedSpeaker?.userId, roomId: roomId },
      });
    }}
  >
    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "bold" }}>
      {previewStatsLoading ? "—" : previewFollowingCount}
    </Text>
    <Text style={{ color: "#888", fontSize: 12, marginTop: 2 }}>
      Following
    </Text>
  </TouchableOpacity>

  <View style={{ width: 1, backgroundColor: "#222" }} />

  <View style={{ alignItems: "center", paddingHorizontal: 18 }}>
    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "bold" }}>
      {previewStatsLoading ? "—" : previewLikesCount}
    </Text>
    <Text style={{ color: "#888", fontSize: 12, marginTop: 2 }}>
      Likes
    </Text>
  </View>
</View>

{/* Follow / Following / Like — act on this person right from the room */}
{selectedSpeaker?.userId && selectedSpeaker.userId !== currentUid && (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      marginTop: 20,
      width: "88%",
    }}
  >
    <TouchableOpacity
      disabled={previewFollowBusy}
      onPress={() => handlePreviewFollow(selectedSpeaker)}
      style={{
        flex: 1,
        backgroundColor: previewIsFollowing ? "#1C1E2E" : "#f71084",
        borderWidth: previewIsFollowing ? 1 : 0,
        borderColor: "#3a3d52",
        paddingVertical: 12,
        borderRadius: 22,
        alignItems: "center",
        marginRight: 10,
        opacity: previewFollowBusy ? 0.6 : 1,
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>
        {previewIsFollowing
          ? "Following"
          : previewIsFollowBack
          ? "Follow Back"
          : "Follow"}
      </Text>
    </TouchableOpacity>

    <TouchableOpacity
      disabled={previewLikeBusy}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#1C1E2E",
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 22,
        opacity: previewLikeBusy ? 0.6 : 1,
      }}
      onPress={() => handlePreviewLike(selectedSpeaker)}
    >
      <Ionicons
        name={previewHasLiked ? "heart" : "heart-outline"}
        size={16}
        color="#ff1493"
      />
      <Text
        style={{
          color: "#fff",
          fontWeight: "bold",
          fontSize: 14,
          marginLeft: 6,
        }}
      >
        {previewHasLiked ? "Liked" : "Like"}
      </Text>
    </TouchableOpacity>
  </View>
)}

</View>

</View>

</Modal>










<Modal
visible={selfSeatModalVisible}
transparent
animationType="slide"
onRequestClose={() => setSelfSeatModalVisible(false)}
>

<View
style={{
flex:1,
justifyContent:"flex-end",
backgroundColor:"rgba(0,0,0,0.5)"
}}
>

<View
style={{
backgroundColor:"#111",
borderTopLeftRadius:25,
borderTopRightRadius:25,
padding:25
}}
>

{/* Profile */}

<View
style={{
alignItems:"center",
marginBottom:25
}}
>

<View>

<Image
source={{
uri:selectedSpeaker?.userImg || STABLE_AVATAR
}}
style={{
width:90,
height:90,
borderRadius:45,
marginBottom:12
}}
/>

<ProfileFrame level={profileLevel} avatarSize={90} frameSize={120} />

</View>

<Text
style={{
color:"#fff",
fontSize:22,
fontWeight:"bold"
}}
>
{selectedSpeaker?.realName || selectedSpeaker?.userName}
</Text>

<Text
style={{
color:"#888",
fontSize:15,
marginTop:3
}}
>
@{selectedSpeaker?.userName}
</Text>

<Text
style={{
color:"#eeff00",
fontSize:15,
marginTop:8,
fontWeight:"bold"
}}
>
 {currentUserRole === "host" ? "👤 Host" : "👤 Speaker"}
</Text>

</View>

{/* Mute */}

<TouchableOpacity
onPress={muteSelf}
style={{
paddingVertical:18,
borderTopWidth:0.5,
borderColor:"#333"
}}
>

<Text
style={{
color:"#fff",
fontSize:18
}}
>
{selfMuted ? "🔇 Unmute" : "🔉 Mute"}
</Text>

</TouchableOpacity>

{/* Leave Seat */}

{
currentUserRole==="speaker" && (

<TouchableOpacity
onPress={leaveOwnSeat}
style={{
paddingVertical:18,
borderTopWidth:0.5,
borderColor:"#333"
}}
>

<Text
style={{
color:"red",
fontSize:18
}}
>
🚪 Leave Seat
</Text>

</TouchableOpacity>

)
}

{/* Close */}

<TouchableOpacity
onPress={() => setSelfSeatModalVisible(false)}
style={{
paddingVertical:18,
borderTopWidth:0.5,
borderColor:"#333"
}}
>



</TouchableOpacity>

</View>

</View>

</Modal>









<Modal
visible={friendShareVisible}
transparent
animationType="slide"
onRequestClose={() =>
setFriendShareVisible(false)
}
>

<View
style={{
flex:1,
justifyContent:"flex-end",
backgroundColor:"rgba(0,0,0,0.5)"
}}
>

<View
style={styles.friendSheet}
>

<Text
style={styles.friendTitle}
>

Friend Share

</Text>

<ScrollView>

{

friends.map(item=>(

<TouchableOpacity

key={item.id}

style={styles.friendRow}

onPress={()=>

toggleFriend(item.id)

}

>


<View>

<Image
source={{
uri:
item.profileImg||
STABLE_AVATAR
}}
style={styles.friendImg}
/>

{
item.level>=10 && (

<LevelFrame level={item.level} animated={false}
style={{
position:"absolute",
width:90,
height:90,
top:-17,
left:-17
}}
/>

)
}

</View>


<View style={{ flex:1, marginLeft:15 }}>

  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
    }}
  >

    <Text style={styles.friendName}>
      @{item.username}
    </Text>

    {/* Verified Tick - Sirf Verified User ko */}
    {item.verified && (
      <View style={styles.verifiedBadge}>
        
 <MaterialCommunityIcons
      name="check-decagram"
      size={17}
      color={
        item.verifiedColor === "yellow"
          ? "#FFD700"
          : "#ffffff"
      }
  />


      </View>
    )}

    {/* Level Badge */}
    <View
      style={[
        styles.levelBadge,
        {
          marginLeft: 8,
          backgroundColor: getLevelTheme(item.level || 1).bg,
          borderColor: getLevelTheme(item.level || 1).border,
        },
      ]}
    >
      <MaterialCommunityIcons
        name="diamond-stone"
        size={10}
        color={getLevelTheme(item.level || 1).icon}
      />

      <Text
        style={{
          color: getLevelTheme(item.level || 1).text,
          fontSize: 9,
          fontWeight: "bold",
          marginLeft: 2,
        }}
      >
        LV {item.level || 1}
      </Text>

    </View>

  </View>

</View>


<View

style={[

styles.radio,

selectedFriends.includes(item.id)

&&

styles.radioSelected

]}

/>

</TouchableOpacity>

))

}

</ScrollView>

<TouchableOpacity

style={styles.shareBtn}

onPress={handleShare}

>

<Text style={styles.shareText}>

Share on WhatsApp & More

</Text>

</TouchableOpacity>

<TouchableOpacity

style={styles.sendBtn}

onPress={sendInvite}

>

<Text style={styles.sendText}>

Send Invite

</Text>

</TouchableOpacity>

</View>

</View>

</Modal>




    <ViewersSheet
      visible={viewersVisible}
      onClose={() => setViewersVisible(false)}
      users={audienceArray}
      isHost={currentUserRole === 'host'}
      onKick={kickUser}
    />
    <GiftersSheet
      visible={giftersVisible}
      onClose={() => setGiftersVisible(false)}
      gifters={roomData?.topGifters}
    />
    <RoomMenuSheet
      visible={menuVisible}
      onClose={() => setMenuVisible(false)}
      isHost={currentUserRole === 'host'}
      locked={!!roomData?.roomLocked}
      onToggleLock={toggleRoomLock}
      onShare={() => setFriendShareVisible(true)}
      onExit={() => setControlModalVisible(true)}
    />

  </View>
);
  
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#0B0A1A' },

  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 14, marginTop: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', marginLeft: 8,
    paddingHorizontal: 11, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)',
  },
  chipTxt: { color: '#fff', fontSize: 12, fontWeight: '700', marginLeft: 5 },
  pinned: {
    flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'flex-start',
    marginHorizontal: 14, marginTop: 2, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 14, backgroundColor: 'rgba(245,196,81,0.10)', maxWidth: '94%',
  },
  pinnedTxt: { color: '#F5C451', fontSize: 13, lineHeight: 18, marginLeft: 7, flexShrink: 1 },
  emojiBar: {
    position: 'absolute', left: 12, right: 12, borderRadius: 22, zIndex: 50,
    backgroundColor: 'rgba(20,16,48,0.96)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)',
  },
  loader: { flex: 1, backgroundColor: '#0A0B14', justifyContent: 'center', alignItems: 'center' },

  topHeader:{
  flexDirection:"row",
  justifyContent:"space-between",
  alignItems:"center",

  paddingHorizontal:15,
  paddingTop:15,

  marginTop:35
},

  hostBadge: { flexDirection: 'row', alignItems: 'center' },
  topHostImg: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#f1c40f' },
  roomNameText: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginLeft: 10 },
  viewRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 10, marginTop: 2 },
  onlineText: { color: '#bdc3c7', fontSize: 11, marginLeft: 4 },
  liveTag: { backgroundColor: '#FF3B5C', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, marginLeft: 8 },
  liveTagText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  audienceAvatars: { flexDirection: 'row', alignItems: 'center' },
  miniRound: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: '#0A0B14' },
  moreCount: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1C1E2E', justifyContent: 'center', alignItems: 'center', marginLeft: -12, borderWidth: 1.5, borderColor: '#0A0B14' },
  moreText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  micGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingTop: 6, marginTop: 4 },

  seatItem: { width:width*0.20, alignItems: 'center', marginBottom: 15 },
  avatarBox: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', backgroundColor: '#151728' },
  hostBorder: { borderWidth: 2.5, borderColor: '#f1c40f' },

  speakerBorder: { borderWidth: 1.5, borderColor: '#8e44ad' },
  emptyBorder: { borderWidth: 1.5, borderColor: '#2c3e50', borderStyle: 'dashed' },
  avatarMain: { width: '100%', height: '100%', borderRadius: 34 },
  hostTag: { position: 'absolute', top: -5, backgroundColor: '#f1c40f', borderRadius: 6, paddingHorizontal: 6 },
  tagLabel: { fontSize: 8, fontWeight: 'bold', color: '#000' },
  micIconOverlay: { position: 'absolute', bottom: 2, right: 2, backgroundColor: '#f1c40f', borderRadius: 10, padding: 3 },
  seatNameTxt: { color: '#95a5a6', fontSize: 10, marginTop: 8 },
  sysMessage: { backgroundColor: 'rgba(241, 196, 15, 0.08)', borderLeftWidth: 3, borderLeftColor: '#f1c40f', margin: 15, padding: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  sysText: { color: '#f1c40f', fontSize: 11, flex: 1, marginHorizontal: 10 },

chatArea:{

    position:"absolute",

    left:0,

    right:0,

    bottom:100,

    maxHeight:height*0.45,

    paddingHorizontal:10

},  

  chatRow: { flexDirection: 'row', marginBottom: 15, alignItems: 'flex-start' },
  chatAva: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a2b38' },
  chatContent: { flex: 1, marginLeft: 10 },
  chatHeaderInline: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  chatUser: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  bubble: { backgroundColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderTopLeftRadius: 4, alignSelf: 'flex-start' },
  chatMsg: { color: '#eee', fontSize: 13 },
  bottomNav: {
  position: 'absolute',
  bottom: 0, left: 0, right: 0, flexDirection: 'row', padding: 15, backgroundColor: 'rgba(11,10,26,0.94)', alignItems: 'center', borderTopWidth: 0.5, borderColor: 'rgba(255,255,255,0.10)' },
  inputBox: { flex: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 22, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginRight: 10 },
  inputStyle: { color: '#fff', fontSize: 14, flex: 1 },
  actionCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.09)', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  exitBox: { width: '80%', backgroundColor: '#1C1E2E', padding: 25, borderRadius: 20, alignItems: 'center' },
  exitTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  exitSub: { color: '#7f8c8d', textAlign: 'center', marginTop: 10 },
  btnRow: { flexDirection: 'row', marginTop: 25 },
  noBtn: { backgroundColor: '#34495e', paddingVertical: 10, paddingHorizontal: 25, borderRadius: 10, marginRight: 15 },
  yesBtn: { backgroundColor: '#e74c3c', paddingVertical: 10, paddingHorizontal: 25, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: 'bold' },


  raiseHandBtn: {
  backgroundColor: '#f1c40f',
  paddingHorizontal: 15,
  paddingVertical: 10,
  borderRadius: 20,
  marginRight: 10
},

raiseHandText: {
  color: '#000',
  fontWeight: 'bold'
},

bottomSheetOverlay:{
 flex:1,
 justifyContent:'flex-end',
 backgroundColor:'rgba(0,0,0,0.5)'
},

requestSheet:{
backgroundColor:'#1C1E2E',

maxHeight:height*0.70,
minHeight:height*0.50,

borderTopLeftRadius:25,
borderTopRightRadius:25,

padding:20
},

giftCircle:{
width:44,
height:44,
borderRadius:22,
  backgroundColor: "transparent",
justifyContent:'center',
alignItems:'center',
marginLeft:8
},


giftOverlay:{
flex:1,
justifyContent:'flex-end',
backgroundColor:'rgba(0,0,0,0.4)'
},

giftSheet:{
backgroundColor:'#111827',

maxHeight:height*0.70,
minHeight:height*0.50,

borderTopLeftRadius:30,
borderTopRightRadius:30,

paddingTop:25,
paddingHorizontal:20,
paddingBottom:35
},

giftTitle:{
color:'#fff',
fontSize:22,
fontWeight:'bold',
marginBottom:20
},

giftGrid:{
flexDirection:'row',
flexWrap:'wrap',
justifyContent:'space-between',
paddingHorizontal:0
},

giftCard:{
width:'30%',
backgroundColor:'#1C1E2E',
borderRadius:10,
padding:5,
marginBottom:20,
alignItems:'center'
},

giftEmoji:{
fontSize:24
},

giftName:{
color:'#fff',
fontSize:10,
marginTop:0
},

giftCoin:{
color:'#999',
fontSize:13,
marginTop:5
},

audienceContainer:{
marginTop:20,
paddingHorizontal:15
},

audienceTitle:{
color:'#fff',
fontSize:16,
fontWeight:'bold',
marginBottom:15
},

userBox:{
alignItems:'center',
marginRight:15
},

userImg:{
width:60,
height:60,
borderRadius:30,
borderWidth:2,
borderColor:'#ff1493'
},

userName:{
color:'#fff',
fontSize:12,
marginTop:5,
width:70,
textAlign:'center'
},

speakingBorder:{
borderWidth:4,
borderColor:"#00ff88",

shadowColor:"#00ff88",
shadowOffset:{
width:0,
height:0
},
shadowOpacity:1,
shadowRadius:20,

elevation:20
},


voicePulse:{
position:'absolute',

width:90,
height:90,
borderRadius:45,

backgroundColor:'rgba(0,255,136,0.25)',

borderWidth:3,
borderColor:'#00ff88'
},


bigGift:{
width:400,
height:400,
resizeMode:'contain'
},

giftEffectContainer:{
position:"absolute",
top:0,
left:0,
right:0,
bottom:0,
justifyContent:"center",
alignItems:"center",
zIndex:9999,
pointerEvents:"none"
},

requestBadge:{
  position:"absolute",
  top:-5,
  right:-5,

  backgroundColor:"#ff0000",

  minWidth:20,
  height:20,

  borderRadius:10,

  justifyContent:"center",
  alignItems:"center",

  paddingHorizontal:4,

  borderWidth:2,
  borderColor:"#0A0B14"
},

requestBadgeText:{
  color:"#fff",
  fontSize:10,
  fontWeight:"bold"
},

shareCircle: {
  width: 44,
  height: 44,
  borderRadius: 22,
  backgroundColor: "#636b89",
  justifyContent: "center",
  alignItems: "center",
  marginLeft: 5,
marginRight: 12,

},


friendSheet:{
backgroundColor:"#000",
height:height*0.60,
borderTopLeftRadius:30,
borderTopRightRadius:30,
padding:20
},

friendTitle:{
color:"#fff",
fontSize:28,
fontWeight:"bold",
marginBottom:20
},

friendRow:{
flexDirection:"row",
alignItems:"center",
marginBottom:20
},

friendImg:{
width:55,
height:55,
borderRadius:28
},

friendName:{
color:"#fff",
fontSize:16,
fontWeight:"700",
},

radio:{
width:25,
height:25,
borderRadius:13,
borderWidth:2,
borderColor:"#fff"
},

radioSelected:{
backgroundColor:"#00ff88",
borderColor:"#00ff88"
},

shareBtn:{
backgroundColor:"#25D366",
padding:15,
borderRadius:15,
marginTop:10,
bottom:25,
},

shareText:{
color:"#fff",
fontWeight:"bold",
textAlign:"center"
},

sendBtn:{
backgroundColor:"#f71084",
padding:15,
borderRadius:10,
marginTop:15,
bottom:30,
},

sendText:{
color:"#fff",
fontWeight:"bold",
textAlign:"center"
},


viewerContainer:{
    flexDirection:"row",
    alignItems:"center",
},

viewerAvatar:{
    width:34,
    height:34,
    borderRadius:17,

    borderWidth:2,
    borderColor:"#fff",

    backgroundColor:"#333",
},

viewerCount:{
    width:36,
    height:36,

    borderRadius:18,

    backgroundColor:"rgba(255,255,255,0.25)",

    justifyContent:"center",
    alignItems:"center",

    marginLeft:-10,
},

viewerCountText:{
    color:"#fff",
    fontWeight:"bold",
    fontSize:12,
},

verifiedBadge:{
  marginLeft:6,
  justifyContent:"center",
  alignItems:"center",
},

levelBadge:{
  marginLeft:6,
  flexDirection:"row",
  alignItems:"center",
  borderWidth:1,
  paddingHorizontal:8,
  paddingVertical:3,
  borderRadius:20,
},

chatVerifiedIcon: {
  marginLeft: 4,
  alignSelf: "center",
},



hostAvatarContainer:{
position:"relative",
justifyContent:"center",
alignItems:"center"
},

hostLevelFrame:{
position:"absolute",
width:70,
height:70,
resizeMode:"contain"
},

seatFrame:{
position:"absolute",
width:85,
height:85,
top:-8,
left:-8,
resizeMode:"contain"
},

chatFrame:{
position:"absolute",
width:55,
height:55,
resizeMode:"contain"
},


});         