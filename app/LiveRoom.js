  import React, { useEffect, useState, useRef, useCallback, useMemo, memo, forwardRef, useImperativeHandle } from 'react';

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
  InteractionManager,
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
  Alert,
} from "react-native";


import { notifyNewFollower } from "../utils/pushNotify";
import ReAnimated,{
  useSharedValue,
  useAnimatedStyle,
  useAnimatedKeyboard,
  interpolate,
  Extrapolation,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
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
  writeBatch,
  runTransaction,
} from 'firebase/firestore';

import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  AudioProfileType,
  AudioScenarioType,
  AudioAinsMode,
  AudienceLatencyLevelType,
} from "react-native-agora";

import { gifts } from "../assets/giftsData";
import { isGifReaction, gifSource } from '../assets/emojiGifs';
import { Image as ExpoImage } from 'expo-image';
import LevelFrame, { getSpecialKey } from '../components/LevelFrame';
import { useAdminFrame } from '../components/adminFrames';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import SeatItem from '../components/live/SeatItem';
import JoinEntry from '../components/live/JoinEntry';
import FloatingHearts from '../components/live/FloatingHearts';
import { ViewersSheet, GiftersSheet, RoomMenuSheet, EmojiStrip } from '../components/live/RoomSheets';
import { T } from '../components/live/liveTheme';
import { useRoomMusic, MusicFab, MusicSheet } from '../components/live/RoomMusic';
import TeenPattiGame from '../components/live/TeenPattiGame';
import GreedyGame from '../components/live/GreedyGame';

import LottieView from "lottie-react-native";
import { WebView } from "react-native-webview";
import { giftHtml } from "../assets/giftWeb";

import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { callApi } from '../utils/api';
import { useLiveBanGuard } from '../utils/liveBan';
import { useBlockedIds } from '../utils/useBlockedIds';
import UserTick from '../components/UserTick';

// import LottieView from "lottie-react-native";
// import { gifts } from "../assets/giftsData";

const { width, height } = Dimensions.get('window');
// ===== HAR MOBILE PE SAME LOOK =====
// Design 360dp width par bana hai. Sab size sirf WIDTH se scale hote hain (height se nahi),
// isliye lambi/chhoti screen par seats/header/bottom bar ka size same rehta hai.
// Bachi hui height chat ko milti hai (flex), isliye upar-niche shift nahi hota.
const BASE_W = 360;
// Phones ki width sirf 360-412dp hoti hai -> CONSTANT scale = har phone par bilkul same size.
// Aur chhota/bada karna ho to sirf ye number badlo (0.88 = pehle se ~12% chhota).
const UI_SCALE = 0.88;
const sc = (n) => Math.round(n * UI_SCALE);
// Phone ki system font-size setting se layout na bigde
if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.allowFontScaling = false;
if (TextInput.defaultProps == null) TextInput.defaultProps = {};
TextInput.defaultProps.allowFontScaling = false;
// Bottom bar ki fixed unchai (input/buttons) - har phone par same
const BOTTOM_BAR_H = 60;
// Join animation: 'auto' (level se) | 'slide' | 'lv10' | 'lv20' | 'lv30' | 'lv40' | 'lv50'
const JOIN_ANIM_VARIANT = 'auto';
const log = __DEV__ ? console.log.bind(console) : () => {};
const STABLE_AVATAR = 'https://avatar.iran.liara.run/public/65';
const SEAT_KEYS = Array.from({ length: 12 }, (_, i) => `seat_${i + 1}`);
const SEAT_OPTIONS = [9, 12]; // host 9 se 12 seat kar sakta hai (9 = 3-3-3, 12 = 4-4-4-4)
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
// Tick sirf unhe jinke profile me verified === true ho. Baaki sab ke liye
// verified=false aur verifiedColor hata do (taaki koi component default tick na dikhaye).
const cleanVerified = (o) => {
  if (!o) return o;
  const ok = o.verified === true || o.verified === 'true';
  const out = { ...o, verified: ok };
  if (ok) out.verifiedColor = o.verifiedColor === 'yellow' ? 'yellow' : 'white';
  else delete out.verifiedColor;
  return out;
};
// Single source of truth: tick tabhi jab verified === true (ya 'true'); color sirf yellow/white
const isVerified = (v) => v === true || v === 'true';
const normTickColor = (c) => (c === 'yellow' ? 'yellow' : 'white');
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


// PERF: har chat row me ye 3-4 baar call hota tha aur har baar naya object banta tha.
// Ab 6 fixed objects hain -> koi allocation nahi, rows turant render.
const LEVEL_THEMES = {
  50: { bg: "#7B1FFF", border: "#FFD700", text: "#fff", icon: "#FFD700" },
  40: { bg: "#00BFFF", border: "#9EF8FF", text: "#fff", icon: "#fff" },
  30: { bg: "#FF0066", border: "#FFB6C1", text: "#fff", icon: "#fff" },
  20: { bg: "#FFC107", border: "#FFE082", text: "#000", icon: "#fff" },
  10: { bg: "#BDBDBD", border: "#fff", text: "#fff", icon: "#fff" },
  1:  { bg: "#222", border: "#555", text: "#FFD700", icon: "#00E5FF" },
};
const getLevelTheme = (level = 1) => {
  if (level >= 50) return LEVEL_THEMES[50];
  if (level >= 40) return LEVEL_THEMES[40];
  if (level >= 30) return LEVEL_THEMES[30];
  if (level >= 20) return LEVEL_THEMES[20];
  if (level >= 10) return LEVEL_THEMES[10];
  return LEVEL_THEMES[1];
};




// FRAME FIX: frame SIRF unhe dikhe jinke paas sach me frame hai (admin/special frame ya level >= 10).
// Pehle `level>=10 || !!uid` ki wajah se bina level wale users ko bhi frame dikhta tha.
// Ab har jagah (seat, chat, list, gift chip, header, popup) ye ek hi check chalta hai.
const GuardedFrame = (props) => {
  const adminKey = useAdminFrame(props.uid);
  const lv = Number(props.level) || 1;
  if (!adminKey && !props.special && lv < 10) return null;
  return <LevelFrame {...props} />;
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

const SPEAK_HOLD_MS = 550;
// PERF: chat ki har row me 22-36px frame animate hota tha (40-80 rows = bahut load).
// false = chat me frame static (smooth). Seat/profile ke frames animated hi rehte hain.
// Pehle jaisa chahiye to true kar do.
const CHAT_FRAME_ANIM = false;
// Seat ka size yahin se badlo: photo, seat aur frame sab isi se chalte hain
// Chhoti screen (kam height) wale phones par seats apne-aap thodi chhoti ho jati hain taaki chat dikhe
const SEAT_SCALE = UI_SCALE;
const SEAT_SIZE = Math.round(60 * SEAT_SCALE);
const SEAT_RADIUS = Math.round(21 * SEAT_SCALE);
// 3 seats per row HAMESHA: integer width => decimal rounding se 2-column wrap nahi hoga
const SEAT_CELL_W = Math.floor(Math.min(width, 480) / 3);
// 12 seat hone par 4 per row
const SEAT_CELL_W4 = Math.floor(Math.min(width, 480) / 4);
// false = seat me gol level-ring nahi dikhegi, photo seat ki rounded-square shape me poori fit hogi
// true  = pehle jaisi ring wapas aa jayegi
const SHOW_SEAT_FRAME = true;
// frame ka size = seat x scale (photo frame ke andar fit rahe). Frame bada/chhota karna ho to ye badlo
// NOTE: frame art ka andar ka khaali gola frame ke size ka sirf ~40-55% hota hai, isliye
// photo dikhane ke liye frame ko photo se kaafi bada rakhna padta hai (1.7x). Chhota dikhe to ise badhao.
const SEAT_FRAME_SCALE = 1.7;
const SEAT_FRAME_SIZE = Math.round(SEAT_SIZE * SEAT_FRAME_SCALE);
const SEAT_FRAME_OFFSET = -(SEAT_FRAME_SIZE - SEAT_SIZE) / 2;

// ===== EK HI FRAME FORMULA (seat, chat, listener list, gift chip, host pill, popup sab jagah) =====
// Frame ka size = photo x FRAME_SCALE, aur photo ke THEEK BEECH me (top/left = -(frame-photo)/2).
// Frame bada/chhota karna ho to sirf SEAT_FRAME_SCALE badlo, sab jagah ek saath badlega.
// Seat frame ka style EK baar bana kar rakha: bolne (speaking) par seat re-render hota hai,
// naya style object banta to frame bhi re-render hota. Ab frame bina chhede chalta rehta hai.
const SEAT_FRAME_STYLE = { position: 'absolute', width: SEAT_FRAME_SIZE, height: SEAT_FRAME_SIZE, top: SEAT_FRAME_OFFSET, left: SEAT_FRAME_OFFSET, zIndex: 10 };
const FRAME_SCALE = SEAT_FRAME_SCALE;
const frameBox = (photoSize, container = photoSize) => {
  const size = Math.round(photoSize * FRAME_SCALE);
  const off = (container - size) / 2;
  return { position: 'absolute', width: size, height: size, top: off, left: off, zIndex: 10 };
};
const FRAME_CHAT22 = frameBox(22);
const FRAME_CHAT36 = frameBox(36, 42);
const FRAME_LIST40 = frameBox(40);
const FRAME_GIFT44 = frameBox(44);
const FRAME_HOST38 = frameBox(38);

// ===== NAVIGATION BAR GAP: har bottom popup is gap se upar rahega =====
// Kuch mobiles me Modal ke andar insets.bottom 0 aata hai (3-button nav bar) -> popup bar ke neeche chhup jata tha.
// Isliye Android par kam se kam 28px (aur gesture-bar wale phone par insets.bottom) hamesha chhodte hain.
const navBarGap = (insetsBottom = 0) => {
  if (Platform.OS !== 'android') return Math.max(insetsBottom, 14);
  // insets mil gaye (gesture bar / edge-to-edge) -> wahi + thoda extra.
  // insets 0 aaye (3-button bar, Modal me insets nahi milte) -> bar ki asli unchai ~48dp chhodo.
  return insetsBottom > 0 ? insetsBottom + 14 : 52;
};

// ===== SafeModal: LIVEROOM KA HAR POPUP IS SE KHULTA HAI =====
// Modal Android par alag window hota hai -> navigation bar ke neeche chala jata tha aur insets 0 aate the.
// Yaha Modal ke andar apna SafeAreaProvider + neeche navigation-bar jitni jagah chhodi gayi hai,
// isliye sheet / dialog sab nigetiv bar ke UPAR dikhte hain. Neeche ki patti bhi halki dim hoti hai.
const ModalSafeBody = ({ children }) => {
  const insets = useSafeAreaInsets();
  const gap = navBarGap(insets.bottom);
  return (
    <View style={{ flex: 1, paddingBottom: gap }}>
      {children}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: gap, backgroundColor: 'rgba(0,0,0,0.5)' }} />
    </View>
  );
};
const SafeModal = ({ children, ...props }) => (
  <Modal {...props}>
    <SafeAreaProvider>
      <ModalSafeBody>{children}</ModalSafeBody>
    </SafeAreaProvider>
  </Modal>
);

const speakingStore = {
  map: {},
  last: {},
  subs: new Set(),
  timer: null,
  emit() {
    this.subs.forEach((f) => f());
  },
  update(active) {
    const now = Date.now();
    let changed = false;
    for (const uid in active) {
      this.last[uid] = now;
      if (!this.map[uid]) {
        this.map = { ...this.map, [uid]: true };
        changed = true;
      }
    }
    if (this.sweep(now)) changed = true;
    if (changed) this.emit();
    if (Object.keys(this.map).length && !this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.sweep(Date.now())) this.emit();
        if (Object.keys(this.map).length) this.update({});
      }, SPEAK_HOLD_MS);
    }
  },
  sweep(now) {
    let next = null;
    for (const uid in this.map) {
      if (now - (this.last[uid] || 0) > SPEAK_HOLD_MS) {
        if (!next) next = { ...this.map };
        delete next[uid];
        delete this.last[uid];
      }
    }
    if (next) {
      this.map = next;
      return true;
    }
    return false;
  },
  // Mute hote hi us user ka glow turant band (hold time ka wait nahi)
  clear(uid) {
    if (!uid) return;
    let hit = false;
    if (this.map[uid]) {
      const next = { ...this.map };
      delete next[uid];
      this.map = next;
      hit = true;
    }
    if (this.last[uid]) delete this.last[uid];
    if (hit) this.emit();
  },
  reset() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.map = {};
    this.last = {};
    this.emit();
  },
};

// Bolne par seat ke charo taraf glow. Frame (zIndex 10) ke UPAR aur bahar dikhta hai.
// Rang/size yahin se badlo. Frame gol nahi hai to GLOW_RADIUS chhota karo (jaise SEAT_RADIUS + 8).
const GLOW_COLOR = '#2EE6A6';
// Glow photo se kitna bahar tak jaye. Chhota chahiye to 24 ghatao (jaise 16), bada chahiye to badhao.
const GLOW_EXTRA = 24;
const GLOW_SIZE = SEAT_SIZE + GLOW_EXTRA;
const GLOW_RADIUS = GLOW_SIZE / 2;
const GLOW_OFFSET = -(GLOW_SIZE - SEAT_SIZE) / 2;
const SpeakGlow = memo(() => {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), -1, false);
    return () => { p.value = 0; };
  }, [p]);
  const pulse = useAnimatedStyle(() => ({
    opacity: 0.85 * (1 - p.value),
    transform: [{ scale: 1 + p.value * 0.3 }],
  }));
  return (
    <>
      <View pointerEvents="none" style={styles.speakGlowSolid} />
      <ReAnimated.View pointerEvents="none" renderToHardwareTextureAndroid style={[styles.speakGlowPulse, pulse]} />
    </>
  );
});

// PERF: room doc har update par naye seat objects banata hai -> pehle 9 seats + frames
// har baar re-render hote the. Ab sirf tab jab seat ki value sach me badli ho.
const seatEqual = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (let i = 0; i < ka.length; i++) {
    const k = ka[i];
    const x = a[k], y = b[k];
    if (x === y) continue;
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      try { if (JSON.stringify(x) === JSON.stringify(y)) continue; } catch (_) {}
    }
    return false;
  }
  return true;
};

// Screenshot-style seat: rounded translucent square, "+" when empty, NO.x label.
const SeatCell = memo(({ seatKey, index, seat, stars, isSpeaking, onPress, cellW = SEAT_CELL_W }) => {
  const isHostSeat = index === 1;
  // MUTE FIX: mute user par kabhi glow nahi
  const glowOn = !!isSpeaking && !seat.isMuted;
  const occupied = !!seat.userId;
  // Host ka frame laga hai ya nahi (admin/special frame ya level>=10). Frame ho tabhi "Host" label dikhega
  const hostAdminKey = useAdminFrame(isHostSeat && occupied ? seat.userId : undefined);
  const hostHasFrame = isHostSeat && occupied && !!(hostAdminKey || seat.special || seat.level >= 10);
  const emoji = typeof seat.reaction === 'string' ? seat.reaction : seat.reaction?.e;
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[styles.seatCell, { width: cellW }, emoji ? { zIndex: 50, elevation: 50 } : null]}
      onPress={() => onPress && onPress(seatKey, seat)}
    >
      <View style={[styles.seatSquare, occupied ? styles.seatSquareOccupied : (glowOn && styles.seatSquareSpeaking)]}>
        {occupied ? (
          <>
            <ExpoImage source={{ uri: seat.userImg || STABLE_AVATAR }} style={styles.seatAvatarImg} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={seat.userId} />
            {glowOn ? <SpeakGlow /> : null}
            {SHOW_SEAT_FRAME && (seat.level >= 10 || !!seat.userId) && (
              <GuardedFrame
                level={seat.level}
                special={seat.special}
                uid={seat.userId}
                animated
                pointerEvents="none"
                style={SEAT_FRAME_STYLE}
              />
            )}
            {seat.isMuted ? (
              <View style={styles.seatMuteBadge}>
                <Ionicons name="mic-off" size={10} color="#fff" />
              </View>
            ) : null}
            {emoji && !isGifReaction(emoji) ? <Text style={styles.seatEmoji}>{emoji}</Text> : null}
          </>
        ) : (
          <Ionicons name="add" size={26} color="rgba(255,255,255,0.9)" />
        )}
        {hostHasFrame ? (
          <View pointerEvents="none" style={styles.seatHostPill}>
            <Text style={styles.seatHostPillTxt}>Host</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.seatLabelPill}>
        <Text numberOfLines={1} allowFontScaling={false} style={[styles.seatLabel, { maxWidth: cellW - 30 }]}>
          {occupied ? (seat.userName || 'User') : `NO.${index - 1}`}
        </Text>
      </View>
      {occupied ? (
        <View style={styles.seatCoinRow}>
          <Ionicons name="star" size={11} color="#f5c518" />
          <Text allowFontScaling={false} style={styles.seatCoinTxt}>{fmtCount(stars || 0)}</Text>
        </View>
      ) : null}
      {emoji && isGifReaction(emoji) ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: SEAT_FRAME_OFFSET, left: (cellW - SEAT_FRAME_SIZE) / 2, width: SEAT_FRAME_SIZE, height: SEAT_FRAME_SIZE, zIndex: 999, elevation: 999 }}
        >
          <ExpoImage source={gifSource(emoji)} contentFit="contain" autoplay style={{ width: '100%', height: '100%' }} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}, (p, n) =>
  p.seatKey === n.seatKey && p.index === n.index && p.stars === n.stars && p.cellW === n.cellW &&
  p.isSpeaking === n.isSpeaking && p.onPress === n.onPress && seatEqual(p.seat, n.seat)
);

const SpeakingSeat = memo(({ seatKey, index, seat, stars, onPress, cellW }) => {
  const uid = seat.userId ? uidToNum(seat.userId) : 0;
  const muted = !!seat.isMuted;
  const [speaking, setSpeaking] = useState(!!(uid && !muted && speakingStore.map[uid]));

  useEffect(() => {
    // muted => speaking hamesha false (store me purani entry ho tab bhi)
    const check = () => setSpeaking(!!(uid && !muted && speakingStore.map[uid]));
    check();
    if (muted) speakingStore.clear(uid);
    speakingStore.subs.add(check);
    return () => {
      speakingStore.subs.delete(check);
    };
  }, [uid, muted]);

  return (
    <SeatCell
      seatKey={seatKey}
      index={index}
      seat={seat}
      stars={stars}
      isSpeaking={speaking}
      onPress={onPress}
      cellW={cellW}
    />
  );
}, (p, n) =>
  p.seatKey === n.seatKey && p.index === n.index && p.stars === n.stars && p.cellW === n.cellW &&
  p.onPress === n.onPress && seatEqual(p.seat, n.seat)
);

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

// ============================================================
// GiftLayer (PERF): full-screen gift animation + "X send @Y x3" banner.
// ALL gift state (activeGift, playKey, combo, banner animations, timers)
// lives INSIDE this component. LiveRoom only calls ref.current.play(...) /
// ref.current.showCombo(...), so a gift never re-renders the 6000-line room
// screen (that re-render is what made gifts stutter / vanish when 8 users
// were talking).
//
// Gift ab SIRF giftsData.js ki `duration` pe hatta hai:
//  - Lottie speed = 1 (pehle 2 tha)
//  - onAnimationFinish se hide NAHI hota (pehle jaldi khatam hoke turant
//    gayab ho jata tha)
// ============================================================
const GiftLayer = memo(forwardRef(function GiftLayer(_props, ref) {
  const [activeGift, setActiveGift] = useState(null);
  const [playKey, setPlayKey] = useState(0);
  const [combo, setCombo] = useState(null);

  const giftTimerRef = useRef(null);
  const comboTimerRef = useRef(null);
  const deferTimerRef = useRef(null);

  const tx = useRef(new Animated.Value(-80)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const doPlay = (animation, duration) => {
    if (!animation) return;
    setActiveGift(animation);
    setPlayKey((k) => k + 1);
    if (giftTimerRef.current) clearTimeout(giftTimerRef.current);
    giftTimerRef.current = setTimeout(() => {
      giftTimerRef.current = null;
      setActiveGift(null);
    }, duration || 5000);
  };

  useImperativeHandle(ref, () => ({
    play: doPlay,
    // Real-live behaviour: jab tak gift tap hote rahein / aate rahein,
    // full-screen animation nahi chalti (sirf combo banner x1, x2, x3...).
    // Tap ruke (delay ms koi naya gift nahi) -> SIRF last gift ki animation chalti hai.
    playDeferred(animation, duration, delay = 600) {
      if (!animation) return;
      if (deferTimerRef.current) clearTimeout(deferTimerRef.current);
      deferTimerRef.current = setTimeout(() => {
        deferTimerRef.current = null;
        doPlay(animation, duration);
      }, delay);
    },
    showCombo(data, onEnd, ms = 2200) {
      setCombo(data);
      if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
      comboTimerRef.current = setTimeout(() => {
        comboTimerRef.current = null;
        setCombo(null);
        if (onEnd) onEnd();
      }, ms);
    },
  }), []);

  useEffect(() => () => {
    if (giftTimerRef.current) clearTimeout(giftTimerRef.current);
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    if (deferTimerRef.current) clearTimeout(deferTimerRef.current);
  }, []);

  // PRELOAD: 3D gifts WebView me three.js CDN se aata hai. Pehli gift animation par wo
  // download hone me atakti thi. Room khulne ke kuch sec baad ek chhota hidden WebView
  // three.js ko cache me daal deta hai (phir band) -> gift animation turant chalti hai.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setWarm(true), 3500);
    const t2 = setTimeout(() => setWarm(false), 12000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // banner pop-in animation (all native driver)
  const comboShownRef = useRef(false);
  useEffect(() => {
    if (!combo) { comboShownRef.current = false; return; }
    if (comboShownRef.current) {
      // banner pehle se dikh raha hai (rapid tap x2, x3...) -> slide-in dobara nahi, bas chhota pop
      scale.setValue(1.12);
      Animated.spring(scale, { toValue: 1, speed: 30, bounciness: 8, useNativeDriver: true }).start();
      return;
    }
    comboShownRef.current = true;
    tx.setValue(-80);
    scale.setValue(0.8);
    shake.setValue(-1);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(tx, { toValue: 0, speed: 12, bounciness: 6, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, speed: 12, bounciness: 6, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]),
    ]).start();
  }, [combo]);

  const webSource = React.useMemo(
    () =>
      typeof activeGift === "string" && activeGift.startsWith("web:")
        ? { html: giftHtml(activeGift.slice(4)), baseUrl: "https://localhost" }
        : null,
    [activeGift]
  );

  const comboGift = combo
    ? gifts.find((g) => String(g.id) === String(combo.giftId))
    : null;

  return (
    <>
      {warm && !activeGift ? (
        <View pointerEvents="none" style={{ position: "absolute", width: 1, height: 1, opacity: 0, top: 0, left: 0 }}>
          <WebView
            source={{ html: '<html><body><script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script></body></html>', baseUrl: "https://localhost" }}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled={false}
            cacheEnabled
            style={{ width: 1, height: 1, backgroundColor: "transparent" }}
            pointerEvents="none"
          />
        </View>
      ) : null}
      {activeGift ? (
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
              speed={1}
              hardwareAccelerationAndroid={true}
              renderMode="HARDWARE"
              cacheComposition={true}
              resizeMode="contain"
              style={{ width: 350, height: 350, backgroundColor: "transparent" }}
            />
          )}
        </View>
      ) : null}

      {combo ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: height * 0.25,
            left: 10,
            zIndex: 99998,
            elevation: 99998,
            flexDirection: "row",
            alignItems: "center",
            opacity,
            transform: [{ translateX: tx }, { scale }],
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: 6,
              paddingRight: 14,
              paddingVertical: 6,
              borderRadius: 30,
              backgroundColor: "rgba(0,0,0,0.55)",
              borderWidth: 1.5,
              borderColor: "rgba(255,105,180,0.8)",
              maxWidth: width * 0.62,
            }}
          >
            <Animated.Image
              source={{ uri: combo.senderImg || STABLE_AVATAR }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                marginRight: 8,
                backgroundColor: "#2a2b38",
                transform: [
                  {
                    rotate: shake.interpolate({
                      inputRange: [-1, 1],
                      outputRange: ["-8deg", "8deg"],
                    }),
                  },
                ],
              }}
            />
            <View style={{ flexShrink: 1 }}>
              <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>
                {combo.senderName}
              </Text>
              <Text numberOfLines={1} style={{ color: "#fff", fontSize: 13, marginTop: 1 }}>
                send{" "}
                <Text style={{ color: "#FFE600", fontWeight: "bold" }}>
                  @{combo.receiverName || "user"}
                </Text>
              </Text>
            </View>
          </View>

          {comboGift?.icon ? (
            <Image
              source={comboGift.icon}
              style={{ width: 58, height: 58, resizeMode: "contain", marginLeft: 6 }}
            />
          ) : null}

          <Text
            style={{
              color: "#FF69B4",
              fontSize: 34,
              fontWeight: "900",
              fontStyle: "italic",
              marginLeft: 4,
              textShadowColor: "rgba(0,0,0,0.6)",
              textShadowOffset: { width: 1, height: 1 },
              textShadowRadius: 3,
            }}
          >
            x{combo.count || 1}
          </Text>
        </Animated.View>
      ) : null}
    </>
  );
}));

// One chat row. Previously this was a ~340-line inline renderItem, so every
// re-render of LiveRoom re-rendered every visible row. As a memo component it
// only re-renders when that specific message object changes.
// Tap on a chat user (avatar / name) -> same profile popup as seat tap.
// Module-level ref => ChatItem stays memoized, no extra re-renders.
const chatUserPressRef = { current: null };
const pressChatUser = (chat) => { if (chatUserPressRef.current) chatUserPressRef.current(chat); };

const ChatItem = memo(({ chat }) => {

        if (chat.type === "join") {

            return (
                <TouchableOpacity activeOpacity={0.7} onPress={() => pressChatUser(chat)}
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                    }}
                >

                    <View>

                        <ExpoImage cachePolicy="memory-disk" transition={0}
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
                            (chat.level>=10 || !!chat.senderId) && (

                                <GuardedFrame level={chat.level} uid={chat.senderId} animated={CHAT_FRAME_ANIM}
                                    style={FRAME_CHAT22}
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

                        <UserTick uid={chat.senderId || chat.uid} verified={!!(isVerified(chat.verified))} verifiedColor={chat?.verifiedColor} size={17} />

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

                </TouchableOpacity>
            );
        }

        if (chat.type === "gift") {
            const gd = gifts.find(g => String(g.id) === String(chat.giftId));
            return (
                <TouchableOpacity activeOpacity={0.7} onPress={() => pressChatUser(chat)}
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                    }}
                >
                    <View>
                        <ExpoImage cachePolicy="memory-disk" transition={0}
                            source={{ uri: chat.userImg || STABLE_AVATAR }}
                            style={{ width:22, height:22, borderRadius:11, backgroundColor:'#2a2b38' }}
                        />
                        {(chat.level >= 10 || !!chat.senderId) && (
                            <GuardedFrame level={chat.level} uid={chat.senderId} animated={CHAT_FRAME_ANIM}
                                style={FRAME_CHAT22} />
                        )}
                    </View>
                    <Text style={{ color:"#d0d0d0", fontSize:13, fontWeight:"600", marginLeft:6 }}>
                        {chat.senderName}
                    </Text>
                    <UserTick uid={chat.senderId || chat.uid} verified={!!(isVerified(chat.verified))} verifiedColor={chat?.verifiedColor} size={17} />
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
                    {chat.comboCount > 1 && (
                        <Text style={{ color:"#FF69B4", fontSize:13, fontWeight:"900", marginLeft:5 }}>
                            x{chat.comboCount}
                        </Text>
                    )}
                </TouchableOpacity>
            );
        }

        return (

            <View style={styles.chatRow}>

                <TouchableOpacity activeOpacity={0.7} onPress={() => pressChatUser(chat)}
                    style={{
                        width:42,
                        height:42,
                        justifyContent:"center",
                        alignItems:"center"
                    }}
                >

                    <ExpoImage cachePolicy="memory-disk" transition={0}
                        source={{
                            uri:chat.userImg || STABLE_AVATAR
                        }}
                        style={styles.chatAva}
                    />

                    {
                        (chat.level>=10 || !!chat.senderId) && (

                            <GuardedFrame level={chat.level} uid={chat.senderId} animated={CHAT_FRAME_ANIM}
                                style={FRAME_CHAT36}
                            />

                        )
                    }

                </TouchableOpacity>

                <View style={styles.chatContent}>

                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            flexWrap: "wrap",
                        }}
                    >

                        <Text style={styles.chatUser} onPress={() => pressChatUser(chat)}>
                            {chat.senderName}
                        </Text>

                        <UserTick uid={chat.senderId || chat.uid} verified={!!(isVerified(chat.verified))} verifiedColor={chat?.verifiedColor} size={15} />

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
                            color:"#e3e3f0",
                            fontSize:11,
                            marginTop:2,
                            textShadowColor:'rgba(0,0,0,0.9)',
                            textShadowOffset:{width:0,height:1},
                            textShadowRadius:3,
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
}, (prev, next) => prev.chat.id === next.chat.id);
// SPEED FIX: chat snapshot har baar naye objects banata hai, isliye pehle har
// message row dobara render hoti thi. Message kabhi edit nahi hota -> sirf id
// compare karo, purani rows bilkul re-render nahi hongi.

const renderChatItem = ({ item }) => <ChatItem chat={item} />;
const chatKeyExtractor = (item, index) => item.id || String(index);

// SPEED FIX (chat lag): typed text ab is chhote component ke andar rehta hai.
// Pehle `chatMessage` poori LiveRoom screen ka state tha, isliye har akshar
// likhne par 6000 line ki screen dobara render hoti thi -> keyboard lagta tha.
const ChatTextInput = memo(({ onSend, locked = false, onFocus, onBlur }) => {
  const [text, setText] = useState('');
  const textRef = useRef('');

  const onChange = useCallback((t) => {
    textRef.current = t;
    setText(t);
  }, []);

  // textRef se hamesha latest text jata hai (stale closure nahi)
  const submit = useCallback(() => {
    const t = textRef.current.trim();
    if (!t || locked) return;
    textRef.current = '';
    setText('');
    onSend(t);
  }, [onSend, locked]);

  return (
    <>
      <TextInput
        style={[styles.inputStyle, locked && { opacity: 0.6 }]}
        placeholder={locked ? "🔒 Chat locked by host" : "Chat"}
        placeholderTextColor="rgba(255,255,255,0.85)"
        value={locked ? '' : text}
        onChangeText={onChange}
        onSubmitEditing={submit}
        onFocus={onFocus}
        onBlur={onBlur}
        editable={!locked}
        maxLength={200}
        returnKeyType="send"
        blurOnSubmit={false}   // keyboard band nahi hota -> lagatar chat smooth
        autoCorrect={false}
        autoComplete="off"
        underlineColorAndroid="transparent"
      />
      {text.trim().length > 0 && !locked ? (
        <TouchableOpacity
          onPress={submit}
          activeOpacity={0.6}
          delayPressIn={0}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          style={{ marginRight: 8 }}
        >
          <Ionicons name="send" size={20} color="#f71084" />
        </TouchableOpacity>
      ) : null}
    </>
  );
});

// ============================================================
// HOST PANEL: chat lock / clear all chat + audience list with
// "Invite to seat" and "Kick". Memo + FlatList => room ko re-render nahi karta.
// ============================================================
const HostRow = memo(({ user, invited, onInvite, onKick, onUserPress }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
    <TouchableOpacity activeOpacity={0.7} onPress={() => onUserPress && onUserPress(user)} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
    <View style={{ marginLeft: 8 }}>
      <ExpoImage cachePolicy="memory-disk" transition={0}
        source={{ uri: user.img || STABLE_AVATAR }}
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#2a2b38' }}
      />
      {(user.level >= 10 || !!user.uid) && (
        <GuardedFrame level={user.level} uid={user.uid} pointerEvents="none"
          style={FRAME_LIST40} />
      )}
    </View>
    <View style={{ flex: 1, marginLeft: 14 }}>
      <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
        {user.name || user.username || 'User'}
      </Text>
      <Text numberOfLines={1} style={{ color: '#888', fontSize: 11 }}>
        @{user.username || 'user'}  •  LV {user.level || 1}
      </Text>
    </View>
    </TouchableOpacity>
    <TouchableOpacity
      disabled={invited}
      onPress={() => onInvite(user)}
      style={{
        backgroundColor: invited ? '#2B2D42' : '#00c27a',
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, marginRight: 8,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
        {invited ? '⏳ Invited' : '🎙 Invite'}
      </Text>
    </TouchableOpacity>
    <TouchableOpacity
      onPress={() => onKick(user)}
      style={{ backgroundColor: '#e74c3c', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 }}
    >
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>🚫 Kick</Text>
    </TouchableOpacity>
  </View>
));

const HostPanelSheet = memo(
  ({ visible, onClose, users, invites, chatLocked, onToggleChatLock, onClearChat, onInvite, onKick, seatCount, onChangeSeats, onUserPress }) => {
    const navGap = 10;
    const renderRow = useCallback(
      ({ item }) => (
        <HostRow
          user={item}
          invited={!!invites[item.uid]}
          onInvite={onInvite}
          onKick={onKick}
          onUserPress={onUserPress}
        />
      ),
      [invites, onInvite, onKick, onUserPress]
    );
    return (
      <SafeModal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View
            style={{
              backgroundColor: '#14122B',
              maxHeight: height * 0.75,
              minHeight: height * 0.45,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              padding: 18,
              paddingBottom: navGap,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 14 }}>
              🛠 Host Tools
            </Text>

            <View style={{ flexDirection: 'row', marginBottom: 14 }}>
              <TouchableOpacity
                onPress={onToggleChatLock}
                style={{
                  flex: 1, marginRight: 8, paddingVertical: 12, borderRadius: 14,
                  alignItems: 'center',
                  backgroundColor: chatLocked ? '#f1c40f' : 'rgba(255,255,255,0.10)',
                }}
              >
                <Text style={{ color: chatLocked ? '#000' : '#fff', fontWeight: 'bold', fontSize: 13 }}>
                  {chatLocked ? '🔓 Unlock Chat' : '🔒 Lock Chat'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClearChat}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center',
                  backgroundColor: 'rgba(231,76,60,0.25)',
                }}
              >
                <Text style={{ color: '#ff6b5e', fontWeight: 'bold', fontSize: 13 }}>
                  🗑 Delete All Chat
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', marginBottom: 14 }}>
              {seatCount === 12 ? (
                <TouchableOpacity
                  onPress={() => onChangeSeats && onChangeSeats(9)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.10)' }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>➖ 3 Seat Kam (9 • 3-3-3)</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => onChangeSeats && onChangeSeats(12)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: '#00c27a' }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>➕ 3 Seat Add (12 • 4-4-4-4)</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={{ color: '#bbb', fontSize: 13, marginBottom: 6 }}>
              👥 Listeners ({users.length})
            </Text>

            <FlatList
              data={users}
              keyExtractor={(u) => u.uid}
              renderItem={renderRow}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={5}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={{ color: '#777', textAlign: 'center', marginTop: 24 }}>
                  Abhi koi listener nahi hai 😴
                </Text>
              }
            />
          </View>
        </View>
      </SafeModal>
    );
  }
);

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
      <ExpoImage cachePolicy="memory-disk" transition={0}
        source={{ uri: uri || STABLE_AVATAR }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          zIndex: 1,
        }}
      />

      {level >= 10 && (
        <GuardedFrame level={level}
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
//  - level >= 10 : uses the existing <GuardedFrame> (lv10/20/30/40/50 art)
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

const ProfileFrame = memo(({ level = 1, avatarSize = 100, frameSize, uid, containerSize, animated = true }) => {
  const adminKey = useAdminFrame(uid);
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const outer = frameSize || Math.round(avatarSize * FRAME_SCALE);
  const offset = ((containerSize || avatarSize) - outer) / 2;

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

  if (adminKey || lv >= 10) {
    return (
      <View pointerEvents="none" style={wrapStyle}>
        <GuardedFrame
          key={`lf-${lv}-${adminKey || ''}`}
          level={lv}
          special={adminKey}
          animated={animated}
          style={{ width: outer, height: outer, resizeMode: "contain" }}
        />
      </View>
    );
  }

  // FIX: frame sirf unhi ko dikhe jinhe mila hai (admin frame ya level >= 10).
  // Pehle low-level (1-9) sab users ko pulsing ring dikhta tha -> ab kuch nahi dikhega.
  return null;
});


// ProfileAvatar: popup ki photo + frame EK saath. Wrapper fixed size, photo aur frame
// dono flex se THEEK BEECH -> upar/niche khisakta nahi. Frame animation popup slide
// khatam hone ke baad chalu hota hai -> popup smooth khulta hai.
const ProfileAvatar = memo(({ uri, uid, level, size = 100, style }) => {
  const outer = Math.round(size * FRAME_SCALE);
  const reserve = Math.round((outer - size) / 4);   // frame ka aadha extra hissa layout me, baaki transparent bahar
  const box = size + reserve * 2;
  const [animReady, setAnimReady] = useState(false);
  useEffect(() => {
    const h = InteractionManager.runAfterInteractions(() => setAnimReady(true));
    return () => h.cancel();
  }, []);
  return (
    <View style={[{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }, style]}>
      <ExpoImage cachePolicy="memory-disk" transition={0}
        source={{ uri: uri || STABLE_AVATAR }}

        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
      <ProfileFrame uid={uid} level={level} avatarSize={size} frameSize={outer} containerSize={box} animated={animReady} />
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
const GIFT_GOLD = '#F5C451';   // premium gold accent
const GIFTS_PER_PAGE = 8;   // 4 columns x 2 rows (pehle 3x2 bade cards)
const GIFT_PAGE_W = width - 24;
const SHEET_OFFSET = 420;
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
    activeOpacity={0.6}
    delayPressIn={0}
    onPress={() => onSend(item)}
  >
    <Image
      source={item.icon}
      style={{ width: 42, height: 42 }}
      resizeMode="contain"
      fadeDuration={0}
    />
    <Text style={styles.giftName} numberOfLines={1}>{item.name}</Text>
    <Text style={styles.giftCoin}>{item.price}</Text>
  </TouchableOpacity>
));

const GiftPage = memo(({ page, onSend }) => (
  <View
    style={{
      width: GIFT_PAGE_W,
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-start',
      paddingHorizontal: 0,
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
    style={{ alignItems: 'center', marginRight: 10 }}
  >
    <View>
      <ExpoImage cachePolicy="memory-disk" transition={0}
        source={{ uri: user.img || STABLE_AVATAR }}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          borderWidth: selected ? 3 : 1,
          borderColor: selected ? GIFT_GOLD : 'rgba(255,255,255,0.25)',
        }}
      />
      {(user.level >= 10 || !!user.uid) && (
        <GuardedFrame level={user.level} uid={user.uid} pointerEvents="none"
          style={FRAME_GIFT44} />
      )}
    </View>
    <Text
      style={{ color: '#fff', fontSize: 9, width: 52, textAlign: 'center', marginTop: 2 }}
      numberOfLines={1}
    >
      {user.name}
    </Text>
  </TouchableOpacity>
));

// "All" chip: seat pe baithe sab users ek saath select
const GiftAllChip = memo(({ selected, onPress }) => (
  <TouchableOpacity onPress={onPress} style={{ alignItems: 'center', marginRight: 10 }}>
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? GIFT_GOLD : 'rgba(255,255,255,0.08)',
        borderWidth: selected ? 3 : 1,
        borderColor: selected ? '#FFE08A' : 'rgba(255,255,255,0.25)',
      }}
    >
      <Text style={{ color: selected ? '#2b1055' : '#fff', fontWeight: 'bold', fontSize: 12 }}>ALL</Text>
    </View>
    <Text style={{ color: '#fff', fontSize: 9, width: 52, textAlign: 'center', marginTop: 2 }}>
      All
    </Text>
  </TouchableOpacity>
));

// Pending (abhi write na hue) gift kharcha: chhota store + chhota component.
const giftPendingStore = {
  v: 0,
  subs: new Set(),
  set(n) {
    giftPendingStore.v = n;
    giftPendingStore.subs.forEach((f) => f(n));
  },
};
const GiftBalance = memo(({ stars }) => {
  const [pending, setPending] = useState(giftPendingStore.v);
  useEffect(() => {
    setPending(giftPendingStore.v);
    giftPendingStore.subs.add(setPending);
    return () => { giftPendingStore.subs.delete(setPending); };
  }, []);
  return (
    <Text style={{ color: GIFT_GOLD, fontSize: 15, fontWeight: 'bold', marginLeft: 4 }}>
      {Math.max(0, stars - pending)}
    </Text>
  );
});

// SMOOTH OPEN: sheet ka open/close state ab is component ke ANDAR hai (ref.open()/ref.close()).
// Pehle `giftModalVisible` poori LiveRoom screen ka state tha -> gift button dabate hi
// 6000 line ki screen re-render hoti thi aur popup atak kar khulta tha. Ab sirf ye
// chhota sheet render hota hai. Band hone par bhi neeche slide + backdrop fade hota hai.
const GiftSheet = memo(
  forwardRef(({ stars, giftUsers, selectedGiftUser, onSelectUser, onSendGift }, ref) => {
    const insets = useSafeAreaInsets();
    // Phone ke navigation bar (neeche wali bar) ke UPAR dikhane ke liye bottom gap
    const bottomGap = 10;
    const [visible, setVisible] = useState(false);
    const anim = useRef(new Animated.Value(400)).current;
    const fade = useRef(new Animated.Value(0)).current;
    const closingRef = useRef(false);
    const [pageIdx, setPageIdx] = useState(0);
    // pending spend ab <GiftBalance/> ke andar -> har gift tap par sirf wo ek chhota number
    // re-render hota hai (pehle poori sheet: chips + pages + dots sab dobara render hote the)
    const setPending = giftPendingStore.set;
    const openStartedRef = useRef(false);

    // Swipe khatam hone par hi page dot update (per-frame setState nahi -> smooth)
    const onPageEnd = useCallback((e) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.max(0, Math.min(GIFT_PAGES.length - 1, Math.round(x / GIFT_PAGE_W)));
      setPageIdx((prev) => (prev === idx ? prev : idx));
    }, []);

    const open = useCallback(() => {
      closingRef.current = false;
      anim.setValue(SHEET_OFFSET);
      fade.setValue(0);
      setPageIdx(0);
      setVisible(true);
    }, [anim, fade]);

    const onClose = useCallback(() => {
      if (closingRef.current) return;
      closingRef.current = true;
      Animated.parallel([
        Animated.timing(anim, { toValue: SHEET_OFFSET, duration: 140, easing: RNEasing.in(RNEasing.quad), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start(() => {
        closingRef.current = false;
        setVisible(false);
      });
    }, [anim, fade]);

    useImperativeHandle(ref, () => ({ open, close: onClose, setPending }), [open, onClose]);

    // SMOOTH OPEN: animation tab shuru hota hai jab Modal window sach me screen par aa jaye (onShow).
    // Pehle effect me chalta tha -> window ready hone se pehle chal kar shuruat ke frames kat jate the
    // aur popup "jhatke" se khulta tha. Fallback timer: onShow na aaye to bhi khul jaye.
    const startOpenAnim = useCallback(() => {
      if (openStartedRef.current) return;
      openStartedRef.current = true;
      Animated.parallel([
        Animated.spring(anim, { toValue: 0, damping: 24, stiffness: 300, mass: 0.7, overshootClamping: true, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }, [anim, fade]);

    useEffect(() => {
      if (!visible) { openStartedRef.current = false; return; }
      openStartedRef.current = false;
      const t = setTimeout(startOpenAnim, 220);
      return () => clearTimeout(t);
    }, [visible, startOpenAnim]);

    const renderPage = useCallback(
      ({ item }) => <GiftPage page={item} onSend={onSendGift} />,
      [onSendGift]
    );
    const getItemLayout = useCallback(
      (_, index) => ({ length: GIFT_PAGE_W, offset: GIFT_PAGE_W * index, index }),
      []
    );

    return (
      <SafeModal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        hardwareAccelerated
        onShow={startOpenAnim}
        onRequestClose={onClose}
      >
        <View style={[styles.giftOverlay, { backgroundColor: 'transparent' }]}>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,0,15,0.55)', opacity: fade }]}
          />
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

          <Animated.View
            renderToHardwareTextureAndroid
            style={[styles.giftSheet, { paddingBottom: bottomGap, transform: [{ translateY: anim }] }]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={['#2b1055', '#1a0b38', '#0d0618']}
              locations={[0, 0.5, 1]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.giftGoldLine} pointerEvents="none" />
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <Text style={styles.giftTitle}>🎁 Send Gifts</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 16 }}>⭐</Text>
                <GiftBalance stars={stars} />
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 6, flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: 6, paddingVertical: 4 }}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              decelerationRate="normal"
            >
              {giftUsers.length > 1 && (
                <GiftAllChip
                  selected={selectedGiftUser === 'ALL'}
                  onPress={() => onSelectUser(selectedGiftUser === 'ALL' ? null : 'ALL')}
                />
              )}
              {giftUsers.map((user) => (
                <GiftUserChip
                  key={user.uid}
                  user={user}
                  selected={selectedGiftUser === user.uid || selectedGiftUser === 'ALL'}
                  onSelect={onSelectUser}
                />
              ))}
            </ScrollView>

            <FlatList
              data={GIFT_PAGES}
              keyExtractor={(p) => p.key}
              renderItem={renderPage}
              horizontal
              // pagingEnabled hata ke snapToInterval: ek swipe = ek page, smooth snap
              snapToInterval={GIFT_PAGE_W}
              snapToAlignment="start"
              disableIntervalMomentum
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              getItemLayout={getItemLayout}
              // aas-paas ke pages pehle se render -> swipe pe blank/flicker nahi
              initialNumToRender={2}
              maxToRenderPerBatch={2}
              updateCellsBatchingPeriod={16}
              windowSize={5}
              // Android pe ye gift icons ko gayab kar deta tha
              removeClippedSubviews={false}
              bounces={Platform.OS === 'ios'}
              overScrollMode="never"
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              onMomentumScrollEnd={onPageEnd}
            />

            {GIFT_PAGES.length > 1 && (
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 2 }}>
                {GIFT_PAGES.map((p, i) => (
                  <View
                    key={p.key}
                    style={{
                      width: i === pageIdx ? 14 : 6,
                      height: 6,
                      borderRadius: 3,
                      marginHorizontal: 3,
                      backgroundColor: i === pageIdx ? GIFT_GOLD : 'rgba(255,255,255,0.25)',
                    }}
                  />
                ))}
              </View>
            )}
          </Animated.View>
        </View>
      </SafeModal>
    );
  }),
  (a, b) =>
    a.stars === b.stars &&
    a.selectedGiftUser === b.selectedGiftUser &&
    a.onSelectUser === b.onSelectUser &&
    a.onSendGift === b.onSendGift &&
    (a.giftUsers === b.giftUsers ||
      a.giftUsers.map((u) => u.uid + '|' + u.img + '|' + u.name).join(',') ===
        b.giftUsers.map((u) => u.uid + '|' + u.img + '|' + u.name).join(','))
);

// ===== TIME-BASED ROOM BACKGROUND =====
// Subah / Dopahar / Sham / Raat - phone ke time ke hisaab se apne aap badalta hai.
// 5am-12pm morning | 12pm-5pm afternoon | 5pm-8pm evening | 8pm-5am night
const LIVE_BGS = {
  morning:   { src: require('../assets/live_bg/morning.jpg'),   dim: 0.05 },
  afternoon: { src: require('../assets/live_bg/afternoon.jpg'), dim: 0.05 },
  evening:   { src: require('../assets/live_bg/evening.jpg'),   dim: 0.05 },
  night:     { src: require('../assets/live_bg/night.jpg'),     dim: 0.0 },
};
const getBgKey = () => {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 20) return 'evening';
  return 'night';
};
const TimeBackground = React.memo(function TimeBackground() {
  const [key, setKey] = React.useState(getBgKey);
  React.useEffect(() => {
    const t = setInterval(() => {
      const k = getBgKey();
      setKey((prev) => (prev === k ? prev : k)); // same slot = no re-render
    }, 60000);
    return () => clearInterval(t);
  }, []);
  const bg = LIVE_BGS[key];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <ExpoImage
        source={bg.src}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={700}
        cachePolicy="memory-disk"
      />
      {bg.dim > 0 && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${bg.dim})` }]} />
      )}
    </View>
  );
});

export default function LiveRoom() {
const insets = useSafeAreaInsets();
const navGap = 0;

const {
  startLive,
  stopLive,
  currentLive,
} = useLive();


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
  const [controlModalVisible, setControlModalVisible] = useState(false);
const [raiseHandLoading, setRaiseHandLoading] = useState(false);
const [requestModalVisible, setRequestModalVisible] = useState(false);

// Gift sheet khud apna open/close handle karta hai (ref) -> room re-render nahi hota
const giftSheetRef = useRef(null);
const handleSendGiftRef = useRef(null);
// ----- rapid gifting (10-20 taps back-to-back) -----
// taps ek batch me jama hote hain aur ~1s me ek hi baar Firestore me jaate hain.
const giftBatchRef = useRef(null);
const giftFlushTimerRef = useRef(null);
const flushGiftBatchRef = useRef(null);
const pendingSpendRef = useRef(0);   // taps jo abhi write nahi hue
const inflightSpendRef = useRef(0);  // write ho gaye, wallet snapshot abhi nahi aaya
// pendingSpend ab sheet ke andar hai (ref.setPending) -> har gift tap pe poori room re-render nahi hoti
const setPendingSpend = useCallback((v) => { if (giftSheetRef.current) giftSheetRef.current.setPending(v); }, []);
const onSendGiftStable = useCallback((item) => {
  if (handleSendGiftRef.current) handleSendGiftRef.current(item);
}, []);


const [speakerModalVisible, setSpeakerModalVisible] = useState(false);

const [selectedSeatKey, setSelectedSeatKey] = useState(null);

const [shareModalVisible, setShareModalVisible] = useState(false);

const [selectedSpeaker, setSelectedSpeaker] = useState(null);

const [selfSeatModalVisible, setSelfSeatModalVisible] = useState(false);

const [selfMuted, setSelfMuted] = useState(false);
const selfMutedRef = useRef(false);   // volume callback ke liye (state purani na pade)

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

// Gift animation + combo banner state lives inside <GiftLayer/>.
// LiveRoom only talks to it through this ref -> gifts never re-render the room.
const giftLayerRef = useRef(null);

// key (senderId_timestamp) of the last liveGift we've already handled. Seeded
// from the FIRST room snapshot so a gift sent BEFORE we joined never replays.
const lastSeenGiftKeyRef = useRef("");
const giftBaselineSetRef = useRef(false);

// combo window khatam hone par combo reset
const onComboEnd = useCallback(() => {
  lastGiftRef.current = null;
  global.giftComboCount = 0;
}, []);

const lastGiftRef = useRef(null);

const liveContextSigRef = useRef("");

// ===== JOIN BANNER ("Nawed joined") =====
const [joinBanner, setJoinBanner] = useState(null);
const joinHideTimeoutRef = useRef(null);
const chatsReadyRef = useRef(false);
// ids of "joined" messages that already existed BEFORE I entered -> never shown to me
const oldJoinIdsRef = useRef(new Set());
// Room me aate waqt jo messages pehle se the, unki ids (ye sab hide rahenge)
const oldMsgIdsRef = useRef(new Set());

const showJoinBanner = (data) => {
  if (data?.senderId && blockedRef.current.has(data.senderId)) return;
  // _k: har naye join par animation restart ho (JoinEntry isi key se reset hota hai)
  setJoinBanner({ ...cleanVerified(data), _k: Date.now() + Math.random() });
};
const handleJoinDone = useCallback(() => setJoinBanner(null), []);


const [selectedGiftUser, setSelectedGiftUser] = useState(null);

const [stars, setStars] = useState(0);



const [myStars,setMyStars] = useState(0);



const [keyboardHeight, setKeyboardHeight] = useState(0);
// SMOOTH KEYBOARD: focus hote hi buttons hide (keyboard ka wait nahi), height UI-thread se animate hoti hai
const [inputFocused, setInputFocused] = useState(false);
const onChatFocus = useCallback(() => setInputFocused(true), []);
const onChatBlur = useCallback(() => setInputFocused(false), []);
const animKb = useAnimatedKeyboard();

// Keyboard ke saath frame-by-frame chalne wali style (JS re-render nahi, isliye smooth + fast)
const closedPad = Math.max(insets.bottom, 10) + 6;
const bottomNavKbStyle = useAnimatedStyle(() => ({
  marginBottom: animKb.height.value,
  paddingBottom: interpolate(animKb.height.value, [0, 80], [closedPad, 6], Extrapolation.CLAMP),
}), [closedPad]);
const emojiKbStyle = useAnimatedStyle(() => ({
  transform: [{ translateY: -animKb.height.value }],
}));
const keyboardOpen = keyboardHeight > 0 || inputFocused; // keyboard khula ho to mic/gift/heart buttons chhupa do

const [roomStartTime, setRoomStartTime] = useState(null);

  const isJoinedRef = useRef(false);
const agoraInitPromiseRef = useRef(null);
const agoraJoinStartedRef = useRef(false);

const agoraEngineRef = useRef(null);

// ===== AGORA MINUTES SAVER =====
// Agora har user ke channel me rehne ke har minute ka bill/free-quota kaatta hai
// (background, screen idle, kuch bhi ho). Isliye LISTENER ko in cases me channel se
// hata dete hain aur wapas aate hi (app open / screen touch) auto-rejoin:
//  - app background me VOICE_BG_LEAVE_MS se zyada raha
//  - VOICE_IDLE_LEAVE_MS tak screen touch nahi hui (phone rakh ke bhool gaye)
// Speaker / host ko kabhi nahi hatate. Idle band karna ho to VOICE_IDLE_LEAVE_MS = 0.
const VOICE_BG_LEAVE_MS = 45 * 1000;
const VOICE_IDLE_LEAVE_MS = 30 * 60 * 1000;
const voiceSleepRef = useRef(false);
const lastTouchRef = useRef(Date.now());

// ===== ROOM MUSIC (Agora audio mixing) =====
const music = useRoomMusic(agoraEngineRef);
const [musicSheetVisible, setMusicSheetVisible] = useState(false);
// seat chhodte hi (listener ban gaye) song band - listener publish nahi kar sakta
useEffect(() => {
  if (currentUserRole === 'listener') { if (music.current) music.stop(); }
  else music.fetchSongs(); // song list pehle se cache me aa jaye -> sheet instant khule
}, [currentUserRole]); // eslint-disable-line react-hooks/exhaustive-deps

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
  speakingStore.reset();
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

// Official ne ban lagaya to turant bahar (host = live ban, baaki = entry ban)
useLiveBanGuard(currentUserRole === 'host', handleRoomEnded);

const [joined,setJoined]=useState(false);

const remoteUsersRef = useRef([]);

const [mutedUsers,setMutedUsers]=useState([]);

const [myAgoraUid, setMyAgoraUid] = useState(null);
const voiceDiagnosticRef = useRef({ agora: "Starting...", mic: false, remote: false, remoteCount: 0 });

const currentUid = auth?.currentUser?.uid;
// (yahan upar isliye: neeche ke useCallback deps me ye pehle use hote hain, baad me declare karne par undefined milta tha)
const [currentName, setCurrentName] = useState("User");
const [currentAvatar, setCurrentAvatar] = useState(STABLE_AVATAR);
const [currentRealName, setCurrentRealName] = useState("User");

// SCALE FIX: chat + audience no longer live inside the room doc.
// They are separate Firestore subcollections so a chat message or a
// viewer joining/leaving does NOT re-broadcast the entire room state
// (seats, host info, etc.) to every connected client.
const { blocked: blockedIds, ref: blockedRef } = useBlockedIds();
const [rawChatMessages, setChatMessages] = useState([]);
const [rawAudienceMap, setAudienceMap] = useState({});
// BLOCK: blocked (dono taraf) users ke msgs / viewers hide
const chatMessages = React.useMemo(() => rawChatMessages.filter(m => !(m && m.senderId && blockedIds.has(m.senderId))), [rawChatMessages, blockedIds]);
const audienceMap = React.useMemo(() => { const o = {}; for (const k in rawAudienceMap) { if (!blockedIds.has(k)) o[k] = rawAudienceMap[k]; } return o; }, [rawAudienceMap, blockedIds]);

const audiencePayloadRef = useRef(null);   // meri audience doc (heartbeat ke liye)
const audSeenRef = useRef({});             // uid -> { v: lastSeen, at: LOCAL time jab value badli }




// ===== PREMIUM: sheets / hearts / emoji (hooks yahin rehne chahiye, early return se pehle) =====
const [viewersVisible, setViewersVisible] = useState(false);
const [giftersVisible, setGiftersVisible] = useState(false);
const [menuVisible, setMenuVisible] = useState(false);
// ===== TEEN PATTI GAME (aadhi screen, nav bar ke upar) =====
// gameOpen: false | 'teen' | 'greedy'
const [gameOpen, setGameOpen] = useState(false);
const [gamePickerOpen, setGamePickerOpen] = useState(false);
const gameOpenRef = useRef(false);
gameOpenRef.current = gameOpen;
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
useEffect(() => {
  setSelfMuted(iAmMuted);
  selfMutedRef.current = iAmMuted;
  if (iAmMuted) speakingStore.clear(uidToNum(currentUid));
}, [iAmMuted]);

// FRAME FIX: seat par baithe user ka level kabhi seat doc me 1/missing reh jata
// tha (raise-hand request me level nahi jata tha) -> listener me frame dikhta tha,
// seat par nahi. Ab seat ka level = max(seat level, audience(wallet) level, mera level).
// ===== SEAT EMOJI REACTION (3 sec, seat par dikhta hai) =====
// uid -> { e: '😂', k: uniqueKey }.  Seat par `seat.reaction` ke naam se SeatItem ko jata hai.
const [seatReactions, setSeatReactions] = useState({});
const seatEmojiTimersRef = useRef({});
const seatEmojiSeenRef = useRef({});        // uid -> last handled reaction stamp
const seatEmojiBaselineRef = useRef(false); // pehle snapshot ke purane emoji replay na ho
const lastEmojiSentAtRef = useRef(0);

const showSeatReaction = useCallback((uid, e) => {
  if (!uid || !e) return;
  const timers = seatEmojiTimersRef.current;
  if (timers[uid]) clearTimeout(timers[uid]);
  setSeatReactions((prev) => ({ ...prev, [uid]: { e, k: Date.now() + Math.random() } }));
  timers[uid] = setTimeout(() => {
    delete timers[uid];
    setSeatReactions((prev) => {
      if (!prev[uid]) return prev;
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  }, 3000);
}, []);

useEffect(() => () => {
  const t = seatEmojiTimersRef.current;
  for (const u in t) clearTimeout(t[u]);
}, []);


// BLOCK: host se block-relation ho to room me rehne hi mat do
useEffect(() => {
  const hid = roomData?.hostId;
  if (hid && hid !== currentUid && blockedIds.has(hid)) {
    try { alert("Ye live aapke liye available nahi hai"); } catch (_) {}
    router.back();
  }
}, [roomData?.hostId, blockedIds]);

const resolvedSeats = useMemo(() => {
  const src = roomData?.seatsData || {};
  const out = {};
  for (const k in src) {
    const st = src[k];
    if (st && st.userId && st.userId !== currentUid && st.userId !== roomData?.hostId && blockedIds.has(st.userId)) {
      out[k] = EMPTY_SEAT; // BLOCK: blocked user ki seat khali dikhe
      continue;
    }
    if (st && st.userId) {
      const aud = audienceMap[st.userId];
      const lvl = Math.max(
        Number(st.level) || 1,
        Number(aud?.level) || 1,
        st.userId === currentUid ? (Number(hostLevel) || 1) : 1
      );
      const reaction = seatReactions[st.userId];
      out[k] = (lvl !== st.level || reaction)
        ? { ...st, level: lvl, ...(reaction ? { reaction } : null) }
        : st;
      if (!out[k].special && aud?.special) out[k] = { ...out[k], special: aud.special };
    } else {
      out[k] = st;
    }
  }
  return out;
}, [roomData?.seatsData, audienceMap, currentUid, hostLevel, seatReactions, blockedIds]);

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
  // ADMIN = host jaisi power: host ko koi kick nahi kar sakta, baaki sabko host/admin kick kar sakte hain
  if (user.uid === roomData?.hostId) return;
  if (user.uid === currentUid) return;
  try {
    const updates = {
      ['admins.' + user.uid]: deleteField(),
      ['kicked.' + user.uid]: Date.now(),
      ['speakerRequests.' + user.uid]: deleteField(),
      ['seatInvites.' + user.uid]: deleteField(),
    };
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
}, [roomId, roomData?.seatsData, roomData?.hostId, roomData?.admins, currentUid]);

const toggleRoomLock = useCallback(async () => {
  if (!db || !roomId) return;
  try { await updateDoc(doc(db, 'rooms', roomId), { roomLocked: !roomData?.roomLocked }); }
  catch (e) { log(e); }
}, [roomId, roomData?.roomLocked]);


const chatScrollRef = useRef(null);

// SPEED: chat list ab INVERTED hai (newest neeche, list khud bottom se start
// hoti hai) -> har message par scrollToEnd/requestAnimationFrame ki zarurat nahi,
// scroll jerk/lag khatam. Reverse sirf tab hota hai jab messages badlein.
const chatListData = useMemo(() => chatMessages.slice().reverse(), [chatMessages]);

// Dusron ke emoji: room doc ke `seatEmojis.<uid>` me naya stamp aate hi us seat par 3 sec dikhao.
// Time compare phone ki clock se nahi, "naya stamp aaya ya nahi" se hota hai (clock skew safe).
useEffect(() => {
  if (!roomData) return;
  const map = roomData.seatEmojis || {};
  const seen = seatEmojiSeenRef.current;
  if (!seatEmojiBaselineRef.current) {
    seatEmojiBaselineRef.current = true;          // join se pehle ke emoji replay nahi honge
    for (const uid in map) seen[uid] = `${map[uid]?.t}_${map[uid]?.n}`;
    return;
  }
  for (const uid in map) {
    const v = map[uid];
    if (!v || !v.e) continue;
    const stamp = `${v.t}_${v.n}`;
    if (seen[uid] === stamp) continue;
    seen[uid] = stamp;
    if (uid === currentUid) continue;             // apna emoji pehle hi local dikh chuka
    showSeatReaction(uid, v.e);
  }
}, [roomData?.seatEmojis, currentUid, showSeatReaction]);

const onPickEmojiRef = useRef(null);
const stableEmojiPick = useCallback((e) => { if (onPickEmojiRef.current) onPickEmojiRef.current(e); }, []);

// ===== HOST TOOLS: chat lock / clear chat / invite to seat / kick =====
const isHost = currentUserRole === 'host';
// ===== ADMIN: host jise admin banaye use host jaisi (moderation) power =====
// room doc me `admins: { [uid]: true }`. Admin = seat/mute/remove, kick, chat lock,
// clear chat, room lock, requests approve, listener ko seat par bulana, lock chat me bolna.
// Admin ko host jaisi POORI power: dusre admin banana/hatana, live end karna, seat par seedha baithna.
// Sirf host-account ka: host seat (seat_1), host heartbeat / live reward (host ki kamai).
const isAdmin = !isHost && !!(currentUid && roomData?.admins?.[currentUid]);
const canManage = isHost || isAdmin;

const toggleAdmin = useCallback(async (uid, name) => {
  if (!db || !roomId || !uid || !canManage || uid === currentUid || uid === roomData?.hostId) return;
  const makeIt = !roomData?.admins?.[uid];
  try {
    await updateDoc(doc(db, 'rooms', roomId), { ['admins.' + uid]: makeIt ? true : deleteField() });
    showToast(makeIt ? `🛡 ${name || 'User'} ab Admin hai` : `${name || 'User'} ab Admin nahi hai`);
  } catch (e) { log(e); }
}, [roomId, canManage, currentUid, roomData?.admins, roomData?.hostId]);

// jise admin banaya/hataya use turant pata chale (pehli load par toast nahi)
const prevAdminRef = useRef(null);
useEffect(() => {
  if (!roomData) return;
  if (prevAdminRef.current === null) { prevAdminRef.current = isAdmin; return; }
  if (prevAdminRef.current !== isAdmin) {
    prevAdminRef.current = isAdmin;
    showToast(isAdmin ? '🛡 Host ne aapko Admin bana diya' : 'Aap ab Admin nahi ho');
  }
}, [isAdmin, !!roomData]); // eslint-disable-line react-hooks/exhaustive-deps

// host 9 ya 12 seat rakh sakta hai (room doc ke `seatCount` se). 9 = 3-3-3, 12 = 4-4-4-4
const seatCount = roomData?.seatCount === 12 ? 12 : 9;
const seatCols = seatCount === 12 ? 4 : 3;
const seatCellW = seatCols === 4 ? SEAT_CELL_W4 : SEAT_CELL_W;

const changeSeatCount = useCallback(async (n) => {
  if (!db || !roomId || !canManage || !SEAT_OPTIONS.includes(n)) return;
  const updates = { seatCount: n };
  const seats = roomData?.seatsData || {};
  // seat kam karne par hatne wali seats ke users neeche (listener) utar jaate hain
  SEAT_KEYS.forEach((key, i) => {
    if (i >= n && key !== 'seat_1' && seats[key]?.userId) {
      updates['seatsData.' + key] = {
        userId: null, userName: 'Open', userImg: STABLE_AVATAR, isMuted: false,
      };
    }
  });
  try { await updateDoc(doc(db, 'rooms', roomId), updates); } catch (e) { log(e); }
}, [roomId, canManage, roomData?.seatsData]);
const chatLocked = !!roomData?.chatLocked;
const [hostPanelVisible, setHostPanelVisible] = useState(false);
const [inviteBusy, setInviteBusy] = useState(false);
const requestSendingRef = useRef(false);   // seat request double-tap guard

// ===== INSTANT FEEDBACK: toast + optimistic UI state =====
const [toastMsg, setToastMsg] = useState(null);
const toastAnim = useRef(new Animated.Value(0)).current;
const toastTimerRef = useRef(null);
const showToast = useCallback((msg) => {
  setToastMsg(msg);
  toastAnim.stopAnimation();
  toastAnim.setValue(0);
  Animated.timing(toastAnim, { toValue: 1, duration: 140, useNativeDriver: true }).start();
  if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  toastTimerRef.current = setTimeout(() => {
    Animated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true })
      .start(() => setToastMsg(null));
  }, 2200);
}, [toastAnim]);
useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

// ===== REPORT / BLOCK from live room profile popup =====
const blockBusyRef = useRef(false);
const handleReportFromRoom = useCallback((u) => {
  const uid = u?.userId;
  if (!uid || uid === currentUid) return;
  setProfileVisible(false);
  setSpeakerModalVisible(false);
  router.push({ pathname: '/report', params: { reportedUserId: uid } });
}, [currentUid, router]);

const handleBlockFromRoom = useCallback((u) => {
  const uid = u?.userId;
  if (!uid || uid === currentUid) return;
  Alert.alert('Block User', `Block @${u?.userName || 'user'}? Wo aapko aur aap use live me nahi dikhoge.`, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Block',
      style: 'destructive',
      onPress: async () => {
        if (blockBusyRef.current) return;
        blockBusyRef.current = true;
        setProfileVisible(false);
        setSpeakerModalVisible(false);
        try {
          await setDoc(doc(db, 'blockedUsers', `${currentUid}_${uid}`), {
            blockerId: currentUid,
            blockedUserId: uid,
            username: u?.userName || '',
            profileImg: u?.userImg || '',
            createdAt: serverTimestamp(),
          });
          // follow relation dono taraf se hata do (userProfile.js jaisa)
          deleteDoc(doc(db, 'follows', `${currentUid}_${uid}`)).catch(() => {});
          deleteDoc(doc(db, 'follows', `${uid}_${currentUid}`)).catch(() => {});
          showToast('User blocked');
        } catch (e) {
          showToast('Block failed, try again');
        } finally {
          blockBusyRef.current = false;
        }
      },
    },
  ]);
}, [currentUid, showToast]);

const renderReportBlock = (user) => {
  if (!user?.userId || user.userId === currentUid) return null;
  return (
    <View style={{ position: 'absolute', top: 18, right: 16, zIndex: 20 }}>
      <TouchableOpacity
        activeOpacity={0.8}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        onPress={() => handleReportFromRoom(user)}
        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(255,90,90,0.12)', borderWidth: 1, borderColor: 'rgba(255,90,90,0.5)' }}
      >
        <Ionicons name="flag" size={13} color="#ff5a5a" />
        <Text allowFontScaling={false} style={{ color: '#ff5a5a', fontWeight: 'bold', fontSize: 12, marginLeft: 5 }}>Report</Text>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.8}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        onPress={() => handleBlockFromRoom(user)}
        style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}
      >
        <Ionicons name="ban" size={13} color="#fff" />
        <Text allowFontScaling={false} style={{ color: '#fff', fontWeight: 'bold', fontSize: 12, marginLeft: 5 }}>Block</Text>
      </TouchableOpacity>
    </View>
  );
};

const [hiddenReqUids, setHiddenReqUids] = useState({}); // host: approve/reject par row turant hide
const [myReqSent, setMyReqSent] = useState(false);       // listener: request turant "sent" dikhe
const myReqSentRef = useRef(false);
const myReqSeenRef = useRef(false);
const myReqSentAtRef = useRef(0);
const [sentFriendIds, setSentFriendIds] = useState({});  // friend share: "✓ Sent" badge
const [shareDone, setShareDone] = useState(false);       // system share: "✓ Shared"

// host: jab request doc se sach me hat jaye tabhi local "hidden" flag hatao (flash/duplicate nahi)
useEffect(() => {
  setHiddenReqUids((prev) => {
    const keys = Object.keys(prev);
    if (!keys.length) return prev;
    const reqs = roomData?.speakerRequests || {};
    const next = {};
    let changed = false;
    keys.forEach((k) => { if (reqs[k]) next[k] = true; else changed = true; });
    return changed ? next : prev;
  });
}, [roomData?.speakerRequests]);

// listener: meri request host ne approve/reject kar di (doc se hat gayi) -> dobara bhej sakte hain
useEffect(() => {
  const present = !!roomData?.speakerRequests?.[currentUid];
  if (present) { myReqSeenRef.current = true; return; }
  if (myReqSentRef.current && myReqSeenRef.current) {
    myReqSentRef.current = false;
    myReqSeenRef.current = false;
    setMyReqSent(false);
  }
}, [roomData?.speakerRequests, currentUid]);
const lastChatAtRef = useRef(0);           // chat spam guard
const SEAT_REQUEST_TTL_MS = 2 * 60 * 1000; // purani/atki request ko "pending" nahi maante
const SEAT_INVITE_TTL_MS = 60 * 1000;      // invite 60s me expire

const toggleChatLock = useCallback(async () => {
  if (!db || !roomId) return;
  try { await updateDoc(doc(db, 'rooms', roomId), { chatLocked: !roomData?.chatLocked }); }
  catch (e) { log(e); }
}, [roomId, roomData?.chatLocked]);

// Saare comments ek saath delete (400-400 ke batch me, fast + safe)
const clearAllChat = useCallback(() => {
  if (!db || !roomId) return;
  Alert.alert(
    'Delete all chat? 🗑',
    'Room ke saare comments hamesha ke liye hat jayenge.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const snap = await getDocs(collection(db, 'rooms', roomId, 'chats'));
            if (snap.empty) return;
            for (let i = 0; i < snap.docs.length; i += 400) {
              const batch = writeBatch(db);
              snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
              await batch.commit();
            }
          } catch (e) { log('Clear chat error:', e); }
        },
      },
    ]
  );
}, [roomId]);

const confirmKick = useCallback((user) => {
  Alert.alert(
    'Kick user? 🚫',
    `${user?.name || user?.username || 'User'} ko room se hata diya jayega.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Kick', style: 'destructive', onPress: () => kickUser(user) },
    ]
  );
}, [kickUser]);

// Host listener ko seat par bulaye (ek user ko ek hi baar, 60s tak dobara nahi)
const inviteToSeat = useCallback(async (user) => {
  if (!db || !roomId || !user?.uid || inviteBusy) return;
  const existing = roomData?.seatInvites?.[user.uid];
  if (existing && Date.now() - (existing.invitedAt || 0) < SEAT_INVITE_TTL_MS) return;

  let freeSeat = null;
  for (let i = 2; i <= seatCount; i++) {
    const key = `seat_${i}`;
    if (!roomData?.seatsData?.[key]?.userId) { freeSeat = key; break; }
  }
  if (!freeSeat) { alert('Koi seat khaali nahi hai'); return; }

  setInviteBusy(true);
  try {
    await updateDoc(doc(db, 'rooms', roomId), {
      ['seatInvites.' + user.uid]: {
        uid: user.uid,
        seatKey: freeSeat,
        hostName: currentRealName || currentName,
        invitedAt: Date.now(),
      },
    });
  } catch (e) { log(e); }
  setInviteBusy(false);
}, [roomId, roomData?.seatInvites, roomData?.seatsData, inviteBusy, currentRealName, currentName, seatCount]);

// Host panel ke liye: sirf wahi listeners jo seat par nahi hain
const hostPanelUsers = useMemo(() => {
  if (!canManage) return [];
  const onSeat = new Set(
    Object.values(roomData?.seatsData || {}).map((s) => s?.userId).filter(Boolean)
  );
  return Object.values(audienceMap).filter(
    (u) => u && u.uid && u.uid !== currentUid && u.uid !== roomData?.hostId && !onSeat.has(u.uid)
  );
}, [canManage, audienceMap, roomData?.seatsData, roomData?.hostId, currentUid]);

const activeInvites = useMemo(() => {
  const out = {};
  const inv = roomData?.seatInvites || {};
  const now = Date.now();
  for (const uid in inv) {
    if (inv[uid] && now - (inv[uid].invitedAt || 0) < SEAT_INVITE_TTL_MS) out[uid] = true;
  }
  return out;
}, [roomData?.seatInvites]);

// Listener side: mujhe host ne bulaya?
const myInvite = roomData?.seatInvites?.[currentUid];
const myInviteValid =
  !!myInvite &&
  currentUserRole === 'listener' &&
  Date.now() - (myInvite.invitedAt || 0) < SEAT_INVITE_TTL_MS;

const declineInvite = useCallback(async () => {
  if (!db || !roomId || !currentUid) return;
  try { await updateDoc(doc(db, 'rooms', roomId), { ['seatInvites.' + currentUid]: deleteField() }); }
  catch (e) { log(e); }
}, [roomId, currentUid]);

const acceptInvite = useCallback(async () => {
  if (!db || !roomId || !currentUid || inviteBusy) return;
  setInviteBusy(true);
  try {
    const seats = roomData?.seatsData || {};
    let target = myInvite?.seatKey;
    if (!target || seats[target]?.userId) {
      target = null;
      for (let i = 2; i <= seatCount; i++) {
        if (!seats[`seat_${i}`]?.userId) { target = `seat_${i}`; break; }
      }
    }
    if (!target) {
      alert('Seat bhar chuki hai 😕');
      await declineInvite();
    } else {
      await updateDoc(doc(db, 'rooms', roomId), {
        ['seatsData.' + target]: {
          userId: currentUid,
          userName: currentName,
          realName: currentRealName,
          userImg: currentAvatar || STABLE_AVATAR,
          verified: hostVerified === true,
          verifiedColor: hostVerifiedColor || 'white',
          level: hostLevel,
          isMuted: false,
          roleTag: 'SPEAKER',
        },
        ['seatInvites.' + currentUid]: deleteField(),
        ['speakerRequests.' + currentUid]: deleteField(),
      });
    }
  } catch (e) { log(e); }
  setInviteBusy(false);
}, [roomId, currentUid, inviteBusy, roomData?.seatsData, myInvite?.seatKey, currentName, currentRealName, currentAvatar, hostVerified, hostVerifiedColor, hostLevel, declineInvite, seatCount]);

// ADMIN: seat par seedha baith jao (host ki approval ki zarurat nahi). seatKey null -> pehli khaali seat.
// Seat likhte hi snapshot logic role ko 'speaker' bana deta hai (acceptInvite jaisa flow).
const adminTakeSeat = async (seatKey) => {
  if (!db || !roomId || !currentUid || !isAdmin) return;
  try {
    const roomRef = doc(db, 'rooms', roomId);
    const res = await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) return 'noroom';
      const seats = snap.data()?.seatsData || {};
      if (Object.values(seats).some((x) => x?.userId === currentUid)) return 'already';
      let target = seatKey && !seats[seatKey]?.userId ? seatKey : null;
      if (!target) {
        for (let i = 2; i <= seatCount; i++) {
          if (!seats[`seat_${i}`]?.userId) { target = `seat_${i}`; break; }
        }
      }
      if (!target) return 'full';
      tx.update(roomRef, {
        ['seatsData.' + target]: {
          userId: currentUid,
          userName: currentName,
          realName: currentRealName,
          userImg: currentAvatar || STABLE_AVATAR,
          verified: hostVerified === true,
          verifiedColor: hostVerifiedColor || 'white',
          level: hostLevel,
          isMuted: false,
          roleTag: 'ADMIN',
        },
        ['speakerRequests.' + currentUid]: deleteField(),
        ['seatInvites.' + currentUid]: deleteField(),
      });
      return 'ok';
    });
    if (res === 'full') alert('Koi seat khaali nahi hai');
  } catch (e) { log(e); }
};

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
// wallet server/local se update ho gaya -> in-flight spend ab v me included hai
inflightSpendRef.current = 0;
setPendingSpend(pendingSpendRef.current);

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

// FIX: user profile kholte waqt remote audio mute hota hai, par wapas aane par
// sirf `resumeAudio` param se unmute hota tha (back dabane par wo param aata hi
// nahi) -> awaaz band rehti thi. Ab room screen jab bhi dobara focus me aaye
// (profile/koi bhi screen se back), audio khud unmute + speaker on hoga.
useFocusEffect(
  useCallback(() => {
    const resume = () => {
      const e = agoraEngineRef.current;
      if (!e) return;
      try { e.muteAllRemoteAudioStreams(false); } catch (_) {}
      try { e.setEnableSpeakerphone(true); } catch (_) {}
    };
    resume();
    const t1 = setTimeout(resume, 300);   // navigation animation ke baad dobara pakka
    const t2 = setTimeout(resume, 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [])
);


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

 setHostVerified(isVerified(data.verified));
setHostVerifiedColor(
  normTickColor(data.verifiedColor)
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
    Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
    (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    }
  );

  const hide = Keyboard.addListener(
    Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
    () => {
      setKeyboardHeight(0);
      setInputFocused(false);
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
            verified: isVerified(u?.verified),
            verifiedColor: normTickColor(u?.verifiedColor),
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
// SPEED: follow / follow-back / like state sirf 3 chhote doc-reads hain -> pehle wahi aate hain (button turant sahi dikhe).
// Followers/Following count + likes ka total (jo bhaari query hai) alag se baad me aata hai, aur cache hota hai
// taaki dobara same user kholne par sab kuch ek dum se dikhe.
const previewLevelCacheRef = useRef({});   // uid -> level
const previewCacheRef = useRef({});   // uid -> { followers, following, likes, isFollowing, isFollowBack, hasLiked, at }
const PREVIEW_CACHE_MS = 60 * 1000;

const fetchProfilePreview = async (targetUserId) => {

  if (!db || !targetUserId || targetUserId === currentUid) {
    setPreviewFollowersCount(0);
    setPreviewFollowingCount(0);
    setPreviewLikesCount(0);
    setPreviewIsFollowing(false);
    setPreviewIsFollowBack(false);
    setPreviewHasLiked(false);
    setPreviewStatsLoading(false);
    return;
  }

  // Guards against a stale response landing after the user has already
  // opened a different person's preview (fast taps in a busy room).
  const requestId = ++previewRequestIdRef.current;

  // cache hai -> turant dikhao (fir bhi background me taaza kar lenge)
  const cached = previewCacheRef.current[targetUserId];
  if (cached) {
    setPreviewFollowersCount(cached.followers);
    setPreviewFollowingCount(cached.following);
    setPreviewLikesCount(cached.likes);
    setPreviewIsFollowing(cached.isFollowing);
    setPreviewIsFollowBack(cached.isFollowBack);
    setPreviewHasLiked(cached.hasLiked);
    setPreviewStatsLoading(false);
    if (Date.now() - cached.at < PREVIEW_CACHE_MS) return;
  } else {
    setPreviewIsFollowing(false);
    setPreviewIsFollowBack(false);
    setPreviewHasLiked(false);
    setPreviewStatsLoading(true);
  }

  const patchCache = (patch) => {
    previewCacheRef.current[targetUserId] = {
      followers: 0, following: 0, likes: 0, isFollowing: false, isFollowBack: false, hasLiked: false,
      ...(previewCacheRef.current[targetUserId] || {}),
      ...patch,
      at: Date.now(),
    };
  };

  // ---- FAST: follow / back / like (3 tiny reads, parallel) ----
  const fastJob = (async () => {
    try {
      const followRef = currentUid ? doc(db, "follows", `${currentUid}_${targetUserId}`) : null;
      const backRef = currentUid ? doc(db, "follows", `${targetUserId}_${currentUid}`) : null;
      const likeRef = currentUid ? doc(db, "profileLikes", `${currentUid}_${targetUserId}`) : null;
      const [followSnap, backSnap, likeSnap] = await Promise.all([
        followRef ? getDoc(followRef) : Promise.resolve(null),
        backRef ? getDoc(backRef) : Promise.resolve(null),
        likeRef ? getDoc(likeRef) : Promise.resolve(null),
      ]);
      const isFollowing = followSnap ? followSnap.exists() : false;
      const isFollowBack = backSnap ? backSnap.exists() : false;
      const hasLiked = likeSnap ? likeSnap.exists() : false;
      patchCache({ isFollowing, isFollowBack, hasLiked });
      if (requestId !== previewRequestIdRef.current) return;
      setPreviewIsFollowing(isFollowing);
      setPreviewIsFollowBack(isFollowBack);
      setPreviewHasLiked(hasLiked);
    } catch (error) {
      if (__DEV__) log("PROFILE PREVIEW FAST ERROR =", error);
    }
  })();

  // ---- SLOW: counts + likes total (alag chalta hai, button ko nahi rokta) ----
  const slowJob = (async () => {
    try {
      const followersQuery = query(collection(db, "follows"), where("followingId", "==", targetUserId));
      const followingQuery = query(collection(db, "follows"), where("followerId", "==", targetUserId));
      const videosQuery = query(collection(db, "all_videos"), where("userId", "==", targetUserId));

      const [followersSnap, followingSnap, videosSnap] = await Promise.all([
        getCountFromServer(followersQuery),
        getCountFromServer(followingQuery),
        getDocs(videosQuery),
      ]);

      let likesCount = 0;
      videosSnap.forEach((v) => { likesCount += Number(v.data()?.likes || 0); });
      const followers = followersSnap.data().count;
      const following = followingSnap.data().count;
      patchCache({ followers, following, likes: likesCount });

      if (requestId !== previewRequestIdRef.current) return; // stale, ignore
      setPreviewFollowersCount(followers);
      setPreviewFollowingCount(following);
      setPreviewLikesCount(likesCount);
    } catch (error) {
      if (__DEV__) log("PROFILE PREVIEW STATS ERROR =", error);
    } finally {
      if (requestId === previewRequestIdRef.current) setPreviewStatsLoading(false);
    }
  })();

  await Promise.all([fastJob, slowJob]);

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

      // notification wagairah background me -> button turant dobara dabne layak ho jata hai
      notifyNewFollower(targetUserId);
      (async () => {
        try {
          const currentUserSnap = await getDoc(doc(db, "users", currentUid));
          const currentUserData = currentUserSnap.data();
          await addDoc(
            collection(db, "users", targetUserId, "notifications"),
            {
              type: "follow",
              senderId: currentUid,
              senderName: currentUserData?.username || currentName || "User",
              senderPhoto: currentUserData?.profileImg || currentAvatar || "",
              createdAt: serverTimestamp(),
            }
          );
        } catch (_) {}
      })();

    }

    // cache bhi sahi rakho
    const c = previewCacheRef.current[targetUserId];
    if (c) {
      c.isFollowing = !wasFollowing;
      c.followers = Math.max(0, c.followers + (wasFollowing ? -1 : 1));
      c.at = Date.now();
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
    if (previewCacheRef.current[targetUserId]) previewCacheRef.current[targetUserId].hasLiked = !wasLiked;

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
  const uidForLevel = selectedSpeaker.userId;
  // cache me ho to turant wahi dikhao (frame flicker / delay nahi)
  setPreviewLevel(previewLevelCacheRef.current[uidForLevel] ?? null);

  getDoc(doc(db, "wallets", uidForLevel))
    .then((snap) => {
      if (snap.exists()) {
        const lv = snap.data()?.level || 1;
        previewLevelCacheRef.current[uidForLevel] = lv;
        if (!cancelled) setPreviewLevel(lv);
      }
    })
    .catch(() => {});

  return () => { cancelled = true; };

}, [profileVisible, speakerModalVisible, selectedSpeaker?.userId]);

const profileLevel = previewLevel ?? selectedSpeaker?.level ?? 1;




// (myStars is now fed by the single wallet listener above)







  // --- BackHandler Subscription Fix ---
 // always points at the latest cleanAndExit (assigned after its definition)
 const cleanAndExitRef = useRef(null);
 useEffect(() => {

  const backAction = () => {

    // Game khula ho to back pehle game band kare
    if (gameOpenRef.current) {
      setGameOpen(false);
      return true;
    }
    // Ab har user (host + audience + speaker) ko Yes/No popup milega
    setControlModalVisible(true);
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

// ---------- LIVE REWARD PING ----------
// Host ka live time SERVER gintta hai (2h reward). App sirf "main live hu"
// bolta hai; minutes / viewers server khud nikalta hai, yahan se fake nahi hota.
useEffect(() => {
  if (!roomId || currentUserRole !== "host") return;
  let stopped = false;
  const ping = () => {
    if (stopped || AppState.currentState !== "active") return;
    callApi("/reward/live-ping", { roomId }).catch(() => {});
  };
  ping();
  const timer = setInterval(ping, 30000);
  return () => { stopped = true; clearInterval(timer); };
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

if (exitingRef.current) return;   // user join ke beech hi bahar nikal gaya

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
  special: getSpecialKey(userData),
  verified: isVerified(userData.verified),
  verifiedColor:
    normTickColor(userData.verifiedColor),
  joinedAt: Date.now(),
  lastSeen: Date.now(),
  online: true
};
audiencePayloadRef.current = audiencePayload;



if (data?.hostId === currentUid) {

 updates['seatsData.seat_1'] = {
 userId: currentUid,
 userName: currentName,
 realName: currentRealName,
 userImg: currentAvatar || STABLE_AVATAR,
level: hostLevel,
special: getSpecialKey(userData),

verified: isVerified(userData.verified),

verifiedColor:
normTickColor(userData.verifiedColor),

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
        senderId: currentUid,
      type: "join",
      senderName: currentRealName,
      username: currentName,
      userImg: currentAvatar || STABLE_AVATAR,
      verified: isVerified(userData.verified),
      verifiedColor: normTickColor(userData.verifiedColor),
      level: hostLevel,
      createdAt: Date.now(),
    })
  );
}

if (Object.keys(updates).length > 0) {
  writeJobs.push(updateDoc(roomRef, updates));
}

if (exitingRef.current) return;
await Promise.all(writeJobs);

log("Audience Added =", audiencePayload);




      } catch (e) {
        log(e);
        // net ki wajah se fail hua -> flag reset karke 3s baad dobara (max 5 baar)
        isJoinedRef.current = false;
        if (!exitingRef.current && joinRetries < 5) {
          joinRetries += 1;
          joinRetryTimer = setTimeout(joinRoom, 3000);
        }
      }
    };
    
    let joinRetries = 0;
    let joinRetryTimer = null;
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

currentUserRoleRef.current = "speaker";   // turant (effect ka wait nahi) -> double call nahi
setCurrentUserRole("speaker");

startSpeaking(agoraEngineRef.current, !!mySeat.isMuted).catch((err) => log("startSpeaking failed", err?.message || err));

}



        setCurrentUserRole(seats.seat_1?.userId === currentUid ? 'host' : (onPod ? 'speaker' : 'listener'));

if (!agoraEngineRef.current && !exitingRef.current && !roomEndedRef.current) {

let role = "listener";

if (seats.seat_1?.userId === currentUid) {
role = "host";
}
else if (onPod) {
role = "speaker";
}

setTimeout(() => {
  Promise.resolve(initAgora(role)).catch(() => {
    scheduleAgoraReconnectRef.current && scheduleAgoraReconnectRef.current();
  });
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
  stopSpeaking(agoraEngineRef.current);
}

// Agar current user speaker hai aur host ne mute kiya hai
if (
  mySeat &&
  mySeat.userId === currentUid &&
  agoraEngineRef.current
) {

  // sirf tab jab seat ka mute value sach me badla ho (gift/chat jaise unrelated updates par
  // mic ko dobara touch nahi karte -> user ne abhi mute/unmute dabaya ho to wapas nahi palatta)
  const seatMuteNow = !!mySeat.isMuted;
  if (lastSeatMuteAppliedRef.current !== seatMuteNow) {
    lastSeatMuteAppliedRef.current = seatMuteNow;
    try { agoraEngineRef.current.muteLocalAudioStream(seatMuteNow); } catch (_) {}
  }

} else if (!mySeat) {
  lastSeatMuteAppliedRef.current = null;   // seat chhodi -> agli baar fresh apply ho
}



      } else {
        // Room doc gone = host ended the live.
        handleRoomEnded();
      }
    }, (e) => log("Room listener error:", e));

    return () => { unsubscribe(); if (joinRetryTimer) clearTimeout(joinRetryTimer); };

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
    limit(40)
  );

  chatsReadyRef.current = false;
  oldJoinIdsRef.current = new Set();
  oldMsgIdsRef.current = new Set();

  // SMOOTH: busy chat me ek saath kai snapshot aate hain aur har ek poori room
  // screen ko re-render karta tha. Ab pehli baar turant, uske baad 120ms me
  // jitne bhi messages aaye ek hi render me (aur same list ho to render hi nahi).
  let chatFirst = true;
  let chatFlushTimer = null;
  let chatLatest = [];
  let chatLastSig = '';
  const chatMap = new Map();
  let chatOrder = [];

  const unsubChats = onSnapshot(chatsQuery, { includeMetadataChanges: false }, (snap) => {
    // ORDER FIX: pehle createdAt (har phone ki apni clock, Date.now()) se sort hota tha,
    // isliye jis phone ki clock peeche ho uska message purane messages ke UPAR chala jata tha.
    // Ab pehli baar history createdAt se, uske baad jo bhi naya message aaye wo hamesha
    // list ke END (screen par sabse NEECHE) me judta hai.
    const msOf = (v) => (typeof v === 'number' ? v : (v?.toMillis ? v.toMillis() : (v?.seconds ? v.seconds * 1000 : Number.MAX_SAFE_INTEGER)));
    if (!chatsReadyRef.current) {
      chatMap.clear();
      chatOrder = snap.docs.map(d => d.id).reverse();
      snap.docs.forEach(d => chatMap.set(d.id, { id: d.id, ...d.data() }));
    } else {
      const added = [];
      snap.docChanges().forEach((ch) => {
        const id = ch.doc.id;
        if (ch.type === 'removed') {
          chatMap.delete(id);
          chatOrder = chatOrder.filter(x => x !== id);
        } else {
          const data = { id, ...ch.doc.data() };
          chatMap.set(id, data);
          if (ch.type === 'added' && !chatOrder.includes(id)) added.push(data);
        }
      });
      added.sort((a, b) => msOf(a.createdAt) - msOf(b.createdAt));
      added.forEach(m => chatOrder.push(m.id));
      if (chatOrder.length > 60) {
        chatOrder.slice(0, chatOrder.length - 80).forEach(id => chatMap.delete(id));
        chatOrder = chatOrder.slice(-60);
      }
    }
    let msgs = chatOrder.map(id => chatMap.get(id)).filter(Boolean);

    // First load = PURANI history. Uski har message id yaad rakho aur hide karo,
    // taaki naya aane wala user sirf apne aane ke BAAD ke messages dekhe.
    // (Id based hai, isliye alag-alag phone ki clock se koi gadbad nahi.)
    if (!chatsReadyRef.current) {
      msgs.forEach(m => { oldMsgIdsRef.current.add(m.id); });
    }
    msgs = msgs.filter(m => !oldMsgIdsRef.current.has(m.id));

    chatLatest = msgs;
    const chatSig = msgs.map(m => m.id).join(',');
    if (chatSig !== chatLastSig) {
      chatLastSig = chatSig;
      // apna naya message turant dikhao (latency compensation se local write turant aata hai)
      const mineNew = msgs.length > 0 && msgs[msgs.length - 1].senderId === currentUid;
      if (chatFirst || mineNew) {
        chatFirst = false;
        if (chatFlushTimer) { clearTimeout(chatFlushTimer); chatFlushTimer = null; }
        setChatMessages(msgs);
      } else if (!chatFlushTimer) {
        chatFlushTimer = setTimeout(() => {
          chatFlushTimer = null;
          setChatMessages(chatLatest);
        }, 80);
      }
    }

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
    if (chatFlushTimer) clearTimeout(chatFlushTimer);
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
  let lastSig = null;

  const unsubAudience = onSnapshot(audienceQuery, (snap) => {
    const map = {};
    const nowLocal = Date.now();
    const seen = audSeenRef.current;
    let sig = '';
    snap.forEach(d => {
      const dd = d.data();
      map[d.id] = cleanVerified({ uid: d.id, ...dd });
      sig += d.id + ':' + (isVerified(dd.verified) ? 1 : 0) + ':' + (dd.verifiedColor === 'yellow' ? 'y' : 'w') + ':' + (dd.hearts || 0) + ':' + (dd.level || 0) + ':' + (dd.img || '') + ':' + (dd.name || '') + '|';
      // heartbeat (lastSeen) sirf nayi app versions likhte hain; purane users ko kabhi stale nahi maante
      if (dd.lastSeen != null) {
        if (!seen[d.id] || seen[d.id].v !== dd.lastSeen) seen[d.id] = { v: dd.lastSeen, at: nowLocal };
      } else if (seen[d.id]) {
        delete seen[d.id];
      }
    });
    for (const u in seen) { if (!map[u]) delete seen[u]; }
    latestMap = map;

    // SMOOTH: sirf lastSeen badla ho to poori room screen dobara render mat karo
    if (sig === lastSig) return;
    lastSig = sig;

    if (firstLoad) {
      firstLoad = false;
      setAudienceMap(map);
      return;
    }

    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        setAudienceMap(latestMap);
      }, 1500);
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
  if (blockedRef.current.has(gift.senderId)) return; // BLOCK

  lastGiftRef.current = {
    senderId: gift.senderId,
    giftId: gift.giftId,
    time: Date.now()
  };

  if (giftLayerRef.current) {
    giftLayerRef.current.showCombo({
      senderName: gift.senderName,
      senderImg: gift.senderImg,
      receiverName: gift.receiverName,
      giftId: gift.giftId,
      giftName: gift.giftName,
      count: gift.comboCount || 1
    }, onComboEnd);
  }

  const giftData = gifts.find(g => String(g.id) === String(gift.giftId));

  if (!giftData || !giftData.animation) return;

  if (giftLayerRef.current) giftLayerRef.current.playDeferred(giftData.animation, giftData.duration, 1600);

}, [roomData?.liveGift?.timestamp]);













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
  // endForAll === true -> room sabke liye band (host ya admin). Warna sirf mera exit.
  const cleanAndExit = async (endForAll) => {
    const closeForEveryone = endForAll === true;
    exitingRef.current = true;
    speakingStore.reset();
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




if (currentUserRole === "host" || (closeForEveryone && isAdmin)) {

  // Host ya ADMIN live band kar sakta hai — room khatam hone par uske
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

  // room chhodte hi meri pending request / invite bhi hata do (host ki list saaf rahe)
  const seatUpdates = {
    ['speakerRequests.' + currentUid]: deleteField(),
    ['seatInvites.' + currentUid]: deleteField(),
  };
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

// ---- AGORA AUTO RECONNECT (connection FAILED hone par) ----
const initAgoraRef = useRef(null);
const scheduleAgoraReconnectRef = useRef(null);
const reconnectTimerRef = useRef(null);
const agoraRetryCountRef = useRef(0);
scheduleAgoraReconnectRef.current = () => {
  if (reconnectTimerRef.current) return;
  // backoff: 2s, 4s, 6s ... max 15s (net na ho to phone par load nahi padta)
  const delay = Math.min(2000 * (agoraRetryCountRef.current + 1), 15000);
  reconnectTimerRef.current = setTimeout(() => {
    reconnectTimerRef.current = null;
    if (exitingRef.current || roomEndedRef.current) return;
    agoraRetryCountRef.current += 1;
    releaseAgora();
    agoraInitPromiseRef.current = null;
    agoraJoinStartedRef.current = false;
    Promise.resolve(initAgoraRef.current && initAgoraRef.current(currentUserRoleRef.current))
      .catch(() => { scheduleAgoraReconnectRef.current && scheduleAgoraReconnectRef.current(); });
  }, delay);
};
useEffect(() => () => { if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current); }, []);

// ---- AGORA MINUTES SAVER: sleep / wake ----
const sleepVoice = () => {
  if (exitingRef.current || roomEndedRef.current) return;
  if (currentUserRoleRef.current !== "listener") return;   // speaker/host kabhi nahi
  if (!agoraEngineRef.current) return;
  voiceSleepRef.current = true;
  releaseAgora();
  isJoinedRef.current = false;
  setJoined(false);
};
const wakeVoice = () => {
  lastTouchRef.current = Date.now();
  if (!voiceSleepRef.current) return;
  voiceSleepRef.current = false;
  if (exitingRef.current || roomEndedRef.current) return;
  agoraRetryCountRef.current = 0;
  scheduleAgoraReconnectRef.current && scheduleAgoraReconnectRef.current();
};
const sleepVoiceRef = useRef(null);
const wakeVoiceRef = useRef(null);
sleepVoiceRef.current = sleepVoice;
wakeVoiceRef.current = wakeVoice;

useEffect(() => {
  let bgTimer = null;
  const sub = AppState.addEventListener("change", (st) => {
    if (st === "active") {
      if (bgTimer) { clearTimeout(bgTimer); bgTimer = null; }
      wakeVoiceRef.current && wakeVoiceRef.current();
      return;
    }
    if (bgTimer) return;
    bgTimer = setTimeout(() => {
      bgTimer = null;
      if (AppState.currentState !== "active") sleepVoiceRef.current && sleepVoiceRef.current();
    }, VOICE_BG_LEAVE_MS);
  });
  // screen touch na hone par (phone rakh diya) listener ko channel se hatao
  const idleTimer = VOICE_IDLE_LEAVE_MS > 0 ? setInterval(() => {
    if (AppState.currentState !== "active") return;
    if (Date.now() - lastTouchRef.current > VOICE_IDLE_LEAVE_MS) {
      sleepVoiceRef.current && sleepVoiceRef.current();
    }
  }, 60000) : null;
  return () => {
    sub.remove();
    if (bgTimer) clearTimeout(bgTimer);
    if (idleTimer) clearInterval(idleTimer);
  };
}, []);

// ---- SCREEN BLACK / LOCK FIX: live me screen band na ho ----
// Pehle sirf ek baar mount par activate hota tha -> modal/background/focus change
// ke baad Android screen band kar deta tha. Ab: screen focus par activate,
// app foreground aane par dobara activate, aur retry (pehli call fail ho to).
// FIX v2: sirf ek retry kaafi nahi tha (Android me activity ready na ho to activate
// chup-chaap fail ho jata tha aur ~10-30s baad screen band). Ab: har 15s me
// dobara activate (safe - same tag), jab tak ye screen khuli hai.
const keepAwakeOn = useCallback(() => {
  activateKeepAwakeAsync('live-room').catch(() => {
    setTimeout(() => { activateKeepAwakeAsync('live-room').catch(() => {}); }, 1500);
  });
}, []);
useFocusEffect(
  useCallback(() => {
    keepAwakeOn();
    const t = setInterval(keepAwakeOn, 15000);
    return () => { clearInterval(t); try { deactivateKeepAwake('live-room'); } catch (_) {} };
  }, [keepAwakeOn])
);
useEffect(() => {
  keepAwakeOn();
  const sub = AppState.addEventListener('change', (st) => { if (st === 'active') keepAwakeOn(); });
  return () => {
    sub.remove();
    try { deactivateKeepAwake('live-room'); } catch (_) {}
  };
}, [keepAwakeOn]);

// App background se wapas aate hi speaker/remote audio dobara pakka karo
useEffect(() => {
  const sub = AppState.addEventListener('change', (st) => {
    if (st !== 'active') return;
    const e = agoraEngineRef.current;
    if (!e) {
      // net gaya tha / join fail hua tha -> wapas aate hi dobara try
      if (!exitingRef.current && !roomEndedRef.current && !agoraJoinStartedRef.current) {
        agoraRetryCountRef.current = 0;
        scheduleAgoraReconnectRef.current && scheduleAgoraReconnectRef.current();
      }
      return;
    }
    try { e.setEnableSpeakerphone(true); } catch (_) {}
    try { e.muteAllRemoteAudioStreams(false); } catch (_) {}
  });
  return () => sub.remove();
}, []);

// ---- BACK/GESTURE SAFETY NET ----
// Agar screen cleanAndExit ke bina band ho (swipe-back, header back, navigation
// reset) to bhi: voice channel chhodo + audience se hato + seat khaali karo.
const roomDataRef = useRef(null);
roomDataRef.current = roomData;
useEffect(() => () => {
  if (exitingRef.current) return;       // cleanAndExit pehle hi kar chuka
  exitingRef.current = true;
  try { stopLive(); } catch (_) {}
  releaseAgora();
  const uid = auth?.currentUser?.uid;
  if (!db || !roomId || !uid) return;
  if (roomEndedRef.current) return;     // room pehle hi khatam
  if (currentUserRoleRef.current === 'host') {
    // host bina "End live" ke screen se nikla (gesture/navigation) -> live band karo.
    // (dev Fast Refresh me live na toote isliye sirf release build me)
    if (!__DEV__) {
      deleteDoc(doc(db, 'rooms', roomId)).catch(() => {});
      clearRoomSubcollection('chats');
      clearRoomSubcollection('audience');
    }
    return;
  }
  deleteDoc(doc(db, 'rooms', roomId, 'audience', uid)).catch(() => {});
  const seats = roomDataRef.current?.seatsData || {};
  const seatUpdates = {};
  Object.keys(seats).forEach((key) => {
    if (key !== 'seat_1' && seats[key]?.userId === uid) {
      seatUpdates['seatsData.' + key] = { userId: null, userName: 'Open', userImg: STABLE_AVATAR, isMuted: false };
    }
  });
  if (Object.keys(seatUpdates).length) updateDoc(doc(db, 'rooms', roomId), seatUpdates).catch(() => {});
}, []);

// ---- VIEWER HEARTBEAT (app kill hone par ghost user na bache) ----
// Har 90s me meri audience doc par chhota lastSeen write (merge => hearts/chat par asar nahi).
// Doc host ne galti se hata di ho (jaise app background tha) to ye use wapas bana deta hai.
useEffect(() => {
  if (!db || !roomId || !currentUid) return;
  const beat = () => {
    if (exitingRef.current || roomEndedRef.current || !audiencePayloadRef.current) return;
    if (roomDataRef.current?.kicked?.[currentUid]) return;
    if (roomDataRef.current?.hostId === currentUid) return;
    setDoc(
      doc(db, 'rooms', roomId, 'audience', currentUid),
      { ...audiencePayloadRef.current, lastSeen: Date.now() },
      { merge: true }
    ).catch(() => {});
  };
  const timer = setInterval(beat, 90000);
  const sub = AppState.addEventListener('change', (st) => { if (st === 'active') beat(); });
  return () => { clearInterval(timer); sub.remove(); };
}, [roomId, currentUid]);

// ---- HOST SWEEP: 5 min tak heartbeat na aaye to user + uski seat hata do ----
// Time host ke LOCAL clock se naapa jata hai (phones ki clock alag ho to bhi galat nahi hoga).
useEffect(() => {
  if (!db || !roomId || currentUserRole !== 'host') return;
  const STALE_MS = 5 * 60 * 1000;
  const sweep = async () => {
    const now = Date.now();
    const seen = audSeenRef.current;
    const stale = [];
    for (const uid in seen) {
      if (uid !== currentUid && now - seen[uid].at > STALE_MS) stale.push(uid);
    }
    if (!stale.length) return;
    const seats = roomDataRef.current?.seatsData || {};
    const seatUpdates = {};
    Object.keys(seats).forEach((key) => {
      if (key !== 'seat_1' && stale.includes(seats[key]?.userId)) {
        seatUpdates['seatsData.' + key] = { userId: null, userName: 'Open', userImg: STABLE_AVATAR, isMuted: false };
      }
    });
    try {
      const jobs = stale.map((uid) => deleteDoc(doc(db, 'rooms', roomId, 'audience', uid)));
      const reqs = roomDataRef.current?.speakerRequests || {};
      stale.forEach((uid) => {
        if (reqs[uid]) seatUpdates['speakerRequests.' + uid] = deleteField();
        if (roomDataRef.current?.seatInvites?.[uid]) seatUpdates['seatInvites.' + uid] = deleteField();
      });
      if (Object.keys(seatUpdates).length) jobs.push(updateDoc(doc(db, 'rooms', roomId), seatUpdates));
      await Promise.all(jobs);
    } catch (_) {}
    stale.forEach((uid) => { delete seen[uid]; });
  };
  const timer = setInterval(sweep, 60000);
  // host ke timers background me ruk jate hain -> wapas aane par sabko fresh grace do
  const sub = AppState.addEventListener('change', (st) => {
    if (st !== 'active') return;
    const n = Date.now();
    for (const u in audSeenRef.current) audSeenRef.current[u].at = n;
  });
  return () => { clearInterval(timer); sub.remove(); };
}, [roomId, currentUserRole, currentUid]);

// Request already pending (host ne abhi tak approve/reject nahi ki)?
// approve/reject par speakerRequests.<uid> hat jata hai -> tab dobara bhej sakte hain.
const hasPendingSeatRequest = () => {
  const r = roomData?.speakerRequests?.[currentUid];
  // doc me request hai: sirf tab pending jab 2 min se purani na ho (purani ho to dobara bhej sakte hain)
  if (r) return Date.now() - (r.requestedAt || 0) < SEAT_REQUEST_TTL_MS;
  // doc me abhi nahi dikhi: write abhi nikla hai (snapshot aana baaki) -> thodi der pending maano
  return myReqSentRef.current && !myReqSeenRef.current && Date.now() - myReqSentAtRef.current < 15000;
};

// INSTANT: pehle UI/ref lock + toast, phir write background me (await ka wait nahi).
// Double request ka reason: guard sirf network khatam hone ke baad hat'ta tha / alert block karta tha.
const submitSeatRequest = (seatKey, okText) => {
  if (!db || !roomId || !currentUid) return;
  if (requestSendingRef.current || hasPendingSeatRequest()) {
    showToast("⏳ Request pehle hi bhej di hai");
    return;
  }
  requestSendingRef.current = true;
  myReqSentRef.current = true;
  myReqSeenRef.current = false;
  const sentAt = Date.now();
  myReqSentAtRef.current = sentAt;
  setMyReqSent(true);
  showToast(okText);

  updateDoc(doc(db, "rooms", roomId), {
    [`speakerRequests.${currentUid}`]: {
      uid: currentUid,
      name: currentName,
      realName: currentRealName,
      img: currentAvatar,
      verified: hostVerified === true,
      verifiedColor: hostVerifiedColor,
      level: hostLevel,
      seatKey: seatKey || null,
      status: "pending",
      requestedAt: Date.now(),
    },
  })
    .catch((e) => {
      log(e);
      myReqSentRef.current = false;
      myReqSeenRef.current = false;
      setMyReqSent(false);
      showToast("❌ Request nahi gayi, dobara try karo");
    })
    .finally(() => { requestSendingRef.current = false; });

  // safety: 2 min tak host ne kuch nahi kiya (ya doc me dikhi hi nahi) -> lock khol do,
  // taaki user dobara request bhej sake (sirf wahi timer jo isi request ka ho)
  setTimeout(() => {
    if (myReqSentRef.current && myReqSentAtRef.current === sentAt) {
      myReqSentRef.current = false;
      myReqSeenRef.current = false;
      setMyReqSent(false);
    }
  }, SEAT_REQUEST_TTL_MS);
};

const sendSeatRequest = (seatKey) => submitSeatRequest(seatKey, "Request Sent ✅");

  const handleSeatJoin = async (seatKey) => {
  try {

    if (currentUserRole !== 'listener') {
      return;
    }

    const roomRef = doc(db, 'rooms', roomId);

 



currentUserRoleRef.current = "speaker";
await startSpeaking(agoraEngineRef.current, false);

setCurrentUserRole("speaker");


  } catch (error) {
    log(error);
  }
};




const handleRaiseHand = () => {
  if (isAdmin) { adminTakeSeat(null); return; }   // admin ko host ki approval nahi chahiye
  submitSeatRequest(null, "Request Sent To Host ✅");
};



// ===== VOICE FIX: listener <-> speaker role switch =====
// Listener "Audience" + publishMicrophoneTrack:false ke saath join hota hai. Sirf
// setClientRole/muteLocalAudioStream se mic PUBLISH nahi hota -> seat par baithne ke
// baad bhi dusre user ki awaz nahi sunti thi. updateChannelMediaOptions se publish ON hota hai.
const startSpeaking = async (e, muted = false) => {
  if (!e) return;
  await e.setClientRole(ClientRoleType.ClientRoleBroadcaster);
  await e.enableLocalAudio(true);
  try {
    e.updateChannelMediaOptions({
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
      publishMicrophoneTrack: true,
      autoSubscribeAudio: true,
    });
  } catch (_) {}
  await e.muteLocalAudioStream(!!muted);
  try { e.muteAllRemoteAudioStreams(false); } catch (_) {}
  try { await e.setEnableSpeakerphone(true); } catch (_) {}
  voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, mic: true };
};

const stopSpeaking = (e) => {
  if (!e) return;
  try { e.muteLocalAudioStream(true); } catch (_) {}
  try { e.enableLocalAudio(false); } catch (_) {}
  try {
    e.updateChannelMediaOptions({
      clientRoleType: ClientRoleType.ClientRoleAudience,
      publishMicrophoneTrack: false,
      autoSubscribeAudio: true,
    });
  } catch (_) {}
  try { e.setClientRole(ClientRoleType.ClientRoleAudience); } catch (_) {}
  try { e.muteAllRemoteAudioStreams(false); } catch (_) {}
  try { e.setEnableSpeakerphone(true); } catch (_) {}
  voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, mic: false };
};

const initAgora = async (userRole) => {
  if (!roomId || !currentUid) return;
  if (exitingRef.current || roomEndedRef.current) return;
  if (agoraEngineRef.current || agoraInitPromiseRef.current || agoraJoinStartedRef.current) return;

  // voice sleep me sirf listener ko join se roko; seat mil gayi (speaker/host) to jaag jao
  if (voiceSleepRef.current) {
    if (userRole === "listener") return;
    voiceSleepRef.current = false;
  }

  agoraJoinStartedRef.current = true;

  const run = async () => {
    let engine = null;
    voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, agora: "Getting token..." };
    try {
      if (Platform.OS === "android") {
        const permissions = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
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
        for (let attempt = 0; attempt < 4; attempt++) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);
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
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
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
      engine.initialize({ appId: "f75d0020d44345edb12bbf6847ef3d38" });
      // ===== MUSIC-FRIENDLY AUDIO =====
      // true  -> doosre app (Saavn/VLC/YT Music...) ka song live me bhi chalta rahe aur
      //          speaker se mic me jaakar sab ko sunayi de.
      // false -> purani voice-chat setting (echo cancel ON, par song nahi jayega).
      // FIX: music mode (GameStreaming/media volume) me echo cancel kaam nahi karta ->
      // 2 speakers baat karein to "ke ke ke" echo loop banta tha. Voice-chat mode me AEC pakka chalta hai.
      // Doosre app ka song bhi live me bhejna ho to isse true karo (par echo wapas aa sakta hai).
      const MUSIC_FRIENDLY_AUDIO = false;

      if (MUSIC_FRIENDLY_AUDIO) {
        // GameStreaming scenario = media volume mode -> doosre app ka music interrupt nahi hota
        await engine.setAudioProfile(
          AudioProfileType.AudioProfileMusicHighQuality,
          AudioScenarioType.AudioScenarioGameStreaming
        );
        // Echo-cancel / noise-suppress / auto-gain song ko "shor" samajh ke kaat dete hain
        // FIX: AEC (echo cancel) ON rehna chahiye -> room ki awaz speaker se mic me wapas
        // jaakar feedback/shor banti thi. ANS/AGC OFF -> doosre app ka song nahi katta,
        // aur AGC band hone se bolne ke beech ka hiss bhi nahi badhta.
        await engine.setParameters(JSON.stringify({
          "che.audio.ans.enable": false,
          "che.audio.agc.enable": false,
          "che.audio.aec.enable": true
        }));
      } else {
        await engine.setAudioProfile(
          AudioProfileType.AudioProfileMusicStandard,
          AudioScenarioType.AudioScenarioChatroom
        );
        await engine.setParameters(JSON.stringify({
          "che.audio.ans.enable": true,
          "che.audio.agc.enable": true,
          "che.audio.aec.enable": true
        }));
      }

      try {
        await engine.setParameters(JSON.stringify({
          "che.audio.max_mixed_participants": 14
        }));
      } catch (_) {}

      // ===== BACKGROUND VOICE / NOISE BLOCK =====
      // AI noise suppression: bolne wale ki awaz rakhta hai, peeche ki awaz
      // (TV, log, gaadi, pankha, hiss) kaat deta hai. Purane SDK me na ho to skip.
      const applyNoiseBlock = async () => {
        try {
          await engine.setAINSMode(true, AudioAinsMode?.AinsModeBalanced ?? 0);
        } catch (_) {}
      };
      await applyNoiseBlock();

      engine.registerEventHandler({
        onJoinChannelSuccess: (connection, uid) => {
          log("JOIN SUCCESS", uid, "ROLE =", userRole);
          setJoined(true);
          agoraRetryCountRef.current = 0;
          voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, agora: "Connected", mic: role === ClientRoleType.ClientRoleBroadcaster };
          isJoinedRef.current = true;
        },
        onUserJoined: (connection, uid) => {
          log("REMOTE USER JOINED =", uid);
          const next = remoteUsersRef.current.includes(uid) ? remoteUsersRef.current : [...remoteUsersRef.current, uid];
          remoteUsersRef.current = next;
          voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, remote: true, remoteCount: next.length };
        },
        onUserOffline: (connection, uid) => {
          log("REMOTE USER LEFT =", uid);
          const next = remoteUsersRef.current.filter(id => id !== uid);
          remoteUsersRef.current = next;
          voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, remote: next.length > 0, remoteCount: next.length };
        },
        onAudioVolumeIndication: (connection, speakers) => {
          const map = {};
          let remoteVoice = false;
          // MUTE FIX: mic mute hone par bhi Agora local/remote volume bhej sakta hai
          // (capture chalu rehta hai / network delay). Seat par mute wale ko glow list me nahi lete.
          const mutedNums = new Set();
          const seatsNow = roomDataRef.current?.seatsData;
          if (seatsNow) {
            for (const k in seatsNow) {
              const st = seatsNow[k];
              if (st?.userId && st.isMuted) mutedNums.add(uidToNum(st.userId));
            }
          }
          (speakers || []).forEach(item => {
            if (item.volume > 15) {
              const isLocal = Number(item.uid) === 0 || Number(item.uid) === Number(backendUid);
              const key = isLocal ? backendUid : item.uid;
              if (isLocal ? (selfMutedRef.current || mutedNums.has(Number(backendUid))) : mutedNums.has(Number(item.uid))) return;
              map[key] = true;
              if (!isLocal) remoteVoice = true;
            }
          });
          if (remoteVoice) voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, remote: true };
          speakingStore.update(map);
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
        // NETWORK FIX: net atakne/jaane par voice khud wapas judey
        // state: 1 Disconnected, 2 Connecting, 3 Connected, 4 Reconnecting, 5 Failed
        onConnectionStateChanged: (connection, state, reason) => {
          log("AGORA CONN STATE =", state, reason);
          if (state === 3) { try { engine.setEnableSpeakerphone(true); } catch (_) {} }
          if (state === 5) scheduleAgoraReconnectRef.current && scheduleAgoraReconnectRef.current();
        },
        onRejoinChannelSuccess: () => {
          try { engine.setEnableSpeakerphone(true); } catch (_) {}
          try { engine.muteAllRemoteAudioStreams(false); } catch (_) {}
        },
        onError: err => { log("Agora Error:", err); voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, agora: `Error ${err}` }; },
      });

      await engine.enableAudio();
      await engine.setEnableSpeakerphone(true);
      await engine.setClientRole(role);
      engine.enableAudioVolumeIndication(400, 3, false);

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
        audienceLatencyLevel: AudienceLatencyLevelType?.AudienceLatencyLevelUltraLowLatency,
        autoSubscribeAudio: true,
        publishMicrophoneTrack: role === ClientRoleType.ClientRoleBroadcaster,
      });

      await applyNoiseBlock();
      agoraEngineRef.current = engine;
      log("AGORA JOINED ONCE =", backendUid);
      // RACE FIX: join hote-hote seat mil gayi (ya chhin gayi) ho to role/mic abhi sync karo
      try {
        const nowRole = currentUserRoleRef.current;
        const wantsMic = nowRole === "host" || nowRole === "speaker";
        if (role === ClientRoleType.ClientRoleAudience && wantsMic) {
          const st = Object.values(roomDataRef.current?.seatsData || {}).find((x) => x?.userId === currentUid);
          await startSpeaking(engine, !!st?.isMuted);
        } else if (role === ClientRoleType.ClientRoleBroadcaster && !wantsMic) {
          stopSpeaking(engine);
        }
      } catch (err) { log("post-join role sync failed", err?.message || err); }
      // join hote-hote user bahar nikal gaya ho to channel turant chhod do
      if (exitingRef.current || roomEndedRef.current) { releaseAgora(); }
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
initAgoraRef.current = initAgora;


  const handleSendChat = async (text) => {
    const messageText = (text || '').trim().slice(0, 200);
    if (!messageText) return;
    // Host ne chat lock kiya ho to sirf host likh sakta hai
    if (roomData?.chatLocked && !canManage) {
      alert('Host ne chat lock kar di hai 🔒');
      return;
    }
    // spam guard: 0.5s se tez nahi (keyboard ab band nahi hota, isliye smooth)
    const nowTs = Date.now();
    if (nowTs - lastChatAtRef.current < 250) return;
    lastChatAtRef.current = nowTs;
    try {
      // SCALE FIX: append-only write (one small new doc) instead of
      // reading + rewriting the entire chat array on every message.
      // This also removes the race condition where two people sending
      // at the same moment could overwrite each other's message.
      await addDoc(collection(db, 'rooms', roomId, 'chats'), {
        senderId: currentUid,
        senderName: currentRealName,
        username: currentName,
        message: messageText,
        userImg: currentAvatar || STABLE_AVATAR,
        verified: hostVerified === true,
        verifiedColor: hostVerifiedColor || "white",
        level: hostLevel,
        createdAt: Date.now(),
      });
    } catch (e) { log(e); }
  };


const handleSendChatRef = useRef(null);
handleSendChatRef.current = handleSendChat;
const stableSendChat = useCallback((t) => { handleSendChatRef.current && handleSendChatRef.current(t); }, []);

const sendQuickChat = async (text) => {
  if (!db || !roomId || !text) return;
  if (roomData?.chatLocked && !canManage) return;
  try {
    await addDoc(collection(db, 'rooms', roomId, 'chats'), {
        senderId: currentUid,
      senderName: currentRealName,
      username: currentName,
      message: text,
      userImg: currentAvatar || STABLE_AVATAR,
      verified: hostVerified === true,
      verifiedColor: hostVerifiedColor || "white",
      level: hostLevel,
      createdAt: Date.now(),
    });
  } catch (e) { log(e); }
};

// Emoji pick:
//  - seat par ho (host/speaker) -> emoji APNI seat par 3 sec animate hota hai, sabko dikhta hai
//  - listener ho -> pehle ki tarah chat me jata hai
const onPickEmoji = (e) => {
  if (!e) return;
  const onSeat = Object.values(roomData?.seatsData || {}).some((s) => s && s.userId === currentUid);
  if (!onSeat) { if (isGifReaction(e)) return; sendQuickChat(e); return; }
  if (!db || !roomId || !currentUid) return;

  const now = Date.now();
  if (now - lastEmojiSentAtRef.current < 700) return;   // spam guard
  lastEmojiSentAtRef.current = now;

  const t = now;
  const n = Math.floor(Math.random() * 1000000);
  seatEmojiSeenRef.current[currentUid] = `${t}_${n}`;   // apna echo ignore
  showSeatReaction(currentUid, e);                      // turant (network ka wait nahi)
  updateDoc(doc(db, 'rooms', roomId), { ['seatEmojis.' + currentUid]: { e, t, n } }).catch(() => {});
};
onPickEmojiRef.current = onPickEmoji;

const handleShare = async () => {
  try {
    const shareLink = `https://topking.app/live/${roomId}`;
    const res = await Share.share({
      message: `🎙 Join my Live Room\n${shareLink}`,
    });
    if (res?.action === Share.dismissedAction) return;   // user ne cancel kiya -> "shared" mat dikhao
    setShareDone(true);
    showToast("✅ Link share ho gaya");
    setTimeout(() => setShareDone(false), 2500);
  } catch (e) {
    log(e);
    showToast("❌ Share nahi hua");
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



// ek friend ko invite: 4 writes ek saath (pehle ek-ek karke await hote the -> slow)
const sendOneInvite = (uid) => {
  const chatId = currentUid < uid ? `${currentUid}_${uid}` : `${uid}_${currentUid}`;
  return Promise.all([
    addDoc(collection(db, "chats", chatId, "messages"), {
      type: "liveInvite",
      senderId: currentUid,
      receiverId: uid,
      roomId: roomId,
      roomLink: `https://topking.app/live/${roomId}`,
      text: `${currentName} invited you to join live`,
      createdAt: serverTimestamp(),
    }),
    setDoc(doc(db, "userChats", uid, "friends", currentUid), {
      userId: currentUid,
      username: currentName,
      lastMessage: "🎙 Live Invite",
      hasNewMessage: true,
      unreadCount: increment(1),
      updatedAt: serverTimestamp(),
    }, { merge: true }),
    setDoc(doc(db, "userChats", currentUid, "friends", uid), {
      userId: uid,
      lastMessage: "🎙 Live Invite",
      updatedAt: serverTimestamp(),
    }, { merge: true }),
    setDoc(doc(db, "notifications", Date.now().toString() + uid), {
      to: uid,
      senderId: currentUid,
      roomId: roomId,
      type: "liveInvite",
      createdAt: Date.now(),
    }),
  ]);
};

// INSTANT: tap par turant "✓ Sent" + toast; writes background me parallel chalte hain.
const sendInvite = () => {
  const targets = selectedFriends.filter((uid) => !sentFriendIds[uid]);
  if (!targets.length) {
    showToast(selectedFriends.length ? "Ye friends ko invite pehle hi ja chuka hai ✓" : "Pehle friend select karo");
    return;
  }
  setSentFriendIds((prev) => { const n = { ...prev }; targets.forEach((u) => { n[u] = true; }); return n; });
  setSelectedFriends([]);
  showToast(`✅ Invite ${targets.length} friend ko bhej diya`);

  Promise.all(
    targets.map((uid) =>
      sendOneInvite(uid).then(() => true).catch((e) => {
        log("INVITE ERROR =", e);
        setSentFriendIds((prev) => { const n = { ...prev }; delete n[uid]; return n; });
        return false;
      })
    )
  ).then((res) => {
    const failed = res.filter((ok) => !ok).length;
    if (failed) showToast(`❌ ${failed} invite nahi gaye, dobara try karo`);
  });
};



// ===== SEAT APPROVE FIX =====
// Pehle: purane roomData se seat check hota tha aur updateDoc seat ko seedha
// overwrite kar deta tha -> 4-5 request ek saath approve karne par ek hat jata tha.
// Ab: (1) approvals line (queue) me ek-ek karke chalte hain, (2) Firestore transaction
// se TAAZA seat dekhte hain: seat khali ho to hi baithate hain, bhari ho to kisi ko
// hataate nahi.
const lastSeatMuteAppliedRef = useRef(null);
const approveQueueRef = useRef(Promise.resolve());
const approvingUidsRef = useRef(new Set());
const justApprovedSeatsRef = useRef(new Set());   // abhi-abhi diye gaye seat (snapshot aane se pehle double-assign na ho)
const reqLevelCacheRef = useRef({});   // uid -> wallet level (request aate hi prefetch)
const seenReqUidsRef = useRef(null);   // naye request par host ko turant toast

const approveRequest = (user) => {
  if (!user?.uid) return Promise.resolve();
  // double tap / ek hi user ki request dobara -> ignore
  if (approvingUidsRef.current.has(user.uid)) return Promise.resolve();
  approvingUidsRef.current.add(user.uid);
  // INSTANT: row turant list se hat jaye (snapshot aane tak wait nahi)
  setHiddenReqUids((h) => ({ ...h, [user.uid]: true }));
  showToast(`✅ ${user.name || "User"} approve ho gaya`);

  const job = approveQueueRef.current.then(async () => {
    try {
      const roomRef = doc(db, "rooms", roomId);

      // SPEED: transaction (server round-trip, 2 hops) hata diya. Ab taaza local room data + local "abhi diya gaya"
      // seat set se seat chunte hain aur ek hi updateDoc likhte hain -> host ko turant seat dikhti hai,
      // user ko bhi sirf ek hop me. Seat sirf dotted-path se likhi jati hai, isliye baaki seats nahi chhedti.
      const data = roomDataRef.current || {};
      const seats = data.seatsData || {};
      const maxSeats = data.seatCount === 12 ? 12 : 9;
      const justTaken = justApprovedSeatsRef.current;

      // request ab bhi maujood hai? (user ne cancel ya host ne reject kar diya ho to skip)
      if (!data.speakerRequests?.[user.uid]) return;

      // user pehle se kisi seat par baitha hai -> bas request hata do
      if (Object.values(seats).some((s) => s?.userId === user.uid)) {
        updateDoc(roomRef, { [`speakerRequests.${user.uid}`]: deleteField() }).catch(() => {});
        return;
      }

      const isFree = (k) => !seats?.[k]?.userId && !justTaken.has(k);
      let targetSeat = user.seatKey;

      if (targetSeat) {
        if (!isFree(targetSeat)) {
          setHiddenReqUids((h) => { const n = { ...h }; delete n[user.uid]; return n; });
          alert(`${(targetSeat || "").replace("_", " ")} pe pehle se koi baitha hai ❌ (use hataya nahi). Reject karo ya wo seat khali hone ka wait karo.`);
          return;
        }
      } else {
        for (let i = 2; i <= maxSeats; i++) {
          const k = `seat_${i}`;
          if (isFree(k)) { targetSeat = k; break; }
        }
        if (!targetSeat) {
          setHiddenReqUids((h) => { const n = { ...h }; delete n[user.uid]; return n; });
          alert("No Empty Seat Available");
          return;
        }
      }

      // level: jo turant pata hai wahi lo (wallet ka wait nahi); cache me nahi ho to baad me seat par update
      const approvedLevel = Math.max(
        Number(user.level) || 1,
        Number(audienceMap[user.uid]?.level) || 1,
        Number(reqLevelCacheRef.current[user.uid]) || 1
      );

      justTaken.add(targetSeat);
      const seatToRelease = targetSeat;
      setTimeout(() => { justTaken.delete(seatToRelease); }, 8000);

      updateDoc(roomRef, {
        [`seatsData.${targetSeat}`]: {
          userId: user.uid,
          userName: user.name,
          realName: user.realName,
          userImg: user.img,
          verified: isVerified(user.verified),
          verifiedColor: normTickColor(user.verifiedColor),
          level: approvedLevel,
          isMuted: false,
          roleTag: "SPEAKER",
        },
        [`speakerRequests.${user.uid}`]: deleteField(),
      }).catch((e) => {
        log("approveRequest write error", e);
        justTaken.delete(seatToRelease);
        setHiddenReqUids((h) => { const n = { ...h }; delete n[user.uid]; return n; });
        showToast("❌ Approve nahi hua, dobara try karo");
      });

      // asli wallet level cache me nahi tha -> background me seat ka level theek kar do
      if (reqLevelCacheRef.current[user.uid] == null) {
        getDoc(doc(db, "wallets", user.uid)).then((w) => {
          if (!w.exists()) return;
          const lv = Number(w.data()?.level) || 1;
          reqLevelCacheRef.current[user.uid] = lv;
          const cur = roomDataRef.current?.seatsData?.[seatToRelease];
          if (lv > approvedLevel && cur?.userId === user.uid) {
            updateDoc(roomRef, { [`seatsData.${seatToRelease}.level`]: lv }).catch(() => {});
          }
        }).catch(() => {});
      }
    } catch (e) {
      log("approveRequest error", e);
      setHiddenReqUids((h) => { const n = { ...h }; delete n[user.uid]; return n; });
      showToast("❌ Approve nahi hua, dobara try karo");
    } finally {
      approvingUidsRef.current.delete(user.uid);
    }
  });

  approveQueueRef.current = job.catch(() => {});
  return job;
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
    selfMutedRef.current = newValue;
    if (newValue) speakingStore.clear(uidToNum(currentUid));

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

  const isAll = selectedGiftUser === "ALL";

  // ALL = seat pe baithe sab users (khud ko chhod kar); warna ek user
  const targetIds = isAll
    ? giftUsers.map(u => u.uid)
    : [selectedGiftUser];

  if (targetIds.length === 0) {
    alert("Please select another user");
    return;
  }

  // har receiver ko poora gift -> kharcha = price x receivers
  const price = Number(item.price || 0) * targetIds.length;

  // balance = wallet - (abhi tak write na hue taps) - (write ho chuke par snapshot pending)
  const available = stars - pendingSpendRef.current - inflightSpendRef.current;
  if (available < price) {
    alert("Not enough stars");
    return;
  }

  const receiverId = isAll ? "ALL" : selectedGiftUser;
  const targetKey = targetIds.slice().sort().join(",");

  // hard guard: never gift yourself, and only users that are in the list
  if (
    !isAll &&
    (receiverId === currentUid || !giftUsers.some(u => u.uid === receiverId))
  ) {
    alert("Please select another user");
    return;
  }

  // NOTE: sheet ab band nahi hoti -> user lagatar 10-20 gift tap kar sakta hai.

  // gift ya receiver badal gaya -> pehle purana batch bhej do
  const open = giftBatchRef.current;
  if (open && (open.item.id !== item.id || open.receiverId !== receiverId || open.targetKey !== targetKey)) {
    flushGiftBatch();
  }

  const isComboContinue =
    lastGiftRef.current &&
    lastGiftRef.current.senderId === currentUid &&
    lastGiftRef.current.giftId === item.id &&
    lastGiftRef.current.receiverId === receiverId &&
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
    receiverId,
    time: Date.now()
  };

  const _receiver = giftUsers.find(u => u.uid === receiverId);
  const _receiverName = isAll
    ? "All"
    : (
      _receiver?.name ||
      audienceMap?.[receiverId]?.name ||
      audienceMap?.[receiverId]?.username ||
      "user"
    );
  const _senderDisplay =
    (currentRealName && currentRealName !== "User") ? currentRealName : currentName;

  // 1) instant: combo banner x1, x2, x3 ... (har tap par)
  if (giftLayerRef.current) {
    giftLayerRef.current.showCombo({
      senderName: _senderDisplay,
      senderImg: currentAvatar || STABLE_AVATAR,
      receiverName: _receiverName,
      giftId: item.id,
      giftName: item.name,
      count: comboCount
    }, onComboEnd);

    // 2) full-screen animation: tap ruke tab SIRF last gift ki chalegi
    if (item.animation) {
      giftLayerRef.current.playDeferred(item.animation, item.duration, 600);
    }
  }

  // 3) local balance turant kam dikhe
  pendingSpendRef.current += price;
  setPendingSpend(pendingSpendRef.current);

  // 4) tap ko batch me jodo (Firestore write baad me, ek saath)
  if (!giftBatchRef.current) {
    giftBatchRef.current = {
      item,
      receiverId,
      receiverIds: targetIds,
      targetKey,
      receiverName: _receiverName,
      senderDisplay: _senderDisplay,
      taps: 0,
      comboCount: 0,
      chat: false,
    };
  }
  const batch = giftBatchRef.current;
  batch.taps += 1;
  batch.comboCount = comboCount;
  if (comboCount === 1) batch.chat = true; // chat line sirf combo ke pehle batch me

  // lagatar tap ho to bhi har ~1s me ek write (dusron ko x count badhta dikhe)
  if (!giftFlushTimerRef.current) {
    giftFlushTimerRef.current = setTimeout(() => {
      if (flushGiftBatchRef.current) flushGiftBatchRef.current();
    }, 1000);
  }

};

const flushGiftBatch = () => {

  if (giftFlushTimerRef.current) {
    clearTimeout(giftFlushTimerRef.current);
    giftFlushTimerRef.current = null;
  }

  const batch = giftBatchRef.current;
  if (!batch) return;
  giftBatchRef.current = null;

  const total = Number(batch.item.price || 0) * batch.taps * (batch.receiverIds?.length || 1);
  pendingSpendRef.current = Math.max(0, pendingSpendRef.current - total);
  inflightSpendRef.current += total;

  // Own gift timestamp: mark as seen so the Firestore echo is ignored.
  const giftTimestamp = Date.now();
  lastSeenGiftKeyRef.current = `${currentUid}_${giftTimestamp}`;

  sendGiftInBackground({
    item: batch.item,
    receiverId: batch.receiverId,
    receiverIds: batch.receiverIds,
    receiverName: batch.receiverName,
    senderDisplay: batch.senderDisplay,
    comboCount: batch.comboCount,
    taps: batch.taps,
    chat: batch.chat,
    giftTimestamp,
  });

};
flushGiftBatchRef.current = flushGiftBatch;

// room chhodte waqt bacha hua batch bhi bhej do (stars kat chuke hain)
useEffect(() => () => {
  if (flushGiftBatchRef.current) flushGiftBatchRef.current();
}, []);

const sendGiftInBackground = async ({
  item,
  receiverId,
  receiverIds,
  receiverName,
  senderDisplay,
  comboCount,
  taps = 1,
  chat = false,
  giftTimestamp,
}) => {

  if (!db || !roomId || !currentUid) return;

  // taps = is batch me kitne gift tap hue -> total price ek hi write me
  // ids = receivers (ALL me sab seat users). Har receiver ko poora `unit` milta hai.
  const ids = (receiverIds && receiverIds.length) ? receiverIds : [receiverId];
  const unit = Number(item.price || 0) * taps;
  const total = unit * ids.length;
  const roomRef = doc(db, "rooms", roomId);

  // seatStars: har receiver ke star badhein — ek hi room write me
  const roomUpdate = {
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
  };
  ids.forEach((id) => {
    roomUpdate[`seatStars.${id}`] = increment(unit);
  });
  // TOP GIFTERS: GiftersSheet room doc ka `topGifters` padhta hai -> gift ke saath usi ek write me
  // is room me bheje gaye total stars bhi jod do (pehle ye sirf users/{id} me jata tha, isliye list khali rehti thi)
  roomUpdate[`topGifters.${currentUid}.uid`] = currentUid;
  roomUpdate[`topGifters.${currentUid}.username`] = currentName || "";
  roomUpdate[`topGifters.${currentUid}.name`] = currentRealName || currentName || "User";
  roomUpdate[`topGifters.${currentUid}.profileImg`] = currentAvatar || "";
  roomUpdate[`topGifters.${currentUid}.stars`] = increment(total);

  const jobs = [

    // sender wallet (total kharcha)
    updateDoc(doc(db, "wallets", currentUid), { stars: increment(-total), totalSpent: increment(total) }),

    // seatStars + liveGift in ONE write -> every viewer gets ONE snapshot
    // ALL me bhi ek hi liveGift => animation/banner sab ko SIRF EK baar
    updateDoc(roomRef, roomUpdate),

  ];

  ids.forEach((id) => {
    jobs.push(
      // receiver wallet: earnings + receivedStars
      setDoc(
        doc(db, "wallets", id),
        {
          earnings: increment(unit),
          receivedStars: increment(unit),
        },
        { merge: true }
      ),
      // receiver's top-gifters
      updateDoc(doc(db, "users", id), {
        [`topGifters.${currentUid}.uid`]: currentUid,
        [`topGifters.${currentUid}.username`]: currentName || "",
        [`topGifters.${currentUid}.name`]: currentRealName || currentName || "User",
        [`topGifters.${currentUid}.profileImg`]: currentAvatar || "",
        [`topGifters.${currentUid}.stars`]: increment(unit),
      })
    );
  });

  // chat line only once per combo (avoid spam)
  if (chat) {
    jobs.push(
      addDoc(collection(db, "rooms", roomId, "chats"), {
        senderId: currentUid,
        type: "gift",
        senderName: senderDisplay,
        username: currentName,
        userImg: currentAvatar || STABLE_AVATAR,
        level: hostLevel,
        verified: hostVerified === true,
        verifiedColor: hostVerifiedColor || "white",
        receiverName,
        giftId: item.id,
        giftName: item.name,
        comboCount,
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
  ids.forEach((id) => {
    fetch("https://topking-backend.onrender.com/update-agency-stars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiverUid: id, stars: unit }),
    })
      .then(r => r.json())
      .then(res => { if (__DEV__) log("AGENCY UPDATE RESPONSE =", res); })
      .catch(e => { if (__DEV__) log("Agency Update Error =", e); });
  });

};

// HOST/ADMIN: nayi request aate hi turant pata chale (toast) + us user ka wallet level pehle se
// le lo, taaki Approve dabate hi seat mil jaye.
useEffect(() => {
  if (!canManage) { seenReqUidsRef.current = null; return; }
  const reqs = roomData?.speakerRequests || {};
  const uids = Object.keys(reqs).filter((u) => reqs[u] && reqs[u].uid);
  const prev = seenReqUidsRef.current;
  const next = new Set(uids);
  if (prev) {
    uids.forEach((u) => {
      if (!prev.has(u) && Date.now() - (reqs[u].requestedAt || 0) < 15000) {
        showToast(`✋ ${reqs[u].name || 'User'} ne seat request bheji`);
      }
    });
  }
  seenReqUidsRef.current = next;
  uids.forEach((u) => {
    if (reqLevelCacheRef.current[u] != null || !db) return;
    reqLevelCacheRef.current[u] = 0;   // in-flight marker (dobara fetch na ho)
    getDoc(doc(db, 'wallets', u))
      .then((w) => { reqLevelCacheRef.current[u] = w && w.exists() ? (Number(w.data()?.level) || 1) : 1; })
      .catch(() => { delete reqLevelCacheRef.current[u]; });
  });
  // jo request hat gayi unka cache saaf
  Object.keys(reqLevelCacheRef.current).forEach((u) => { if (!next.has(u)) delete reqLevelCacheRef.current[u]; });
}, [roomData?.speakerRequests, canManage]); // eslint-disable-line react-hooks/exhaustive-deps

// ===== SPEED: ye saari derived lists ab sirf tab banti hain jab data sach me badle =====
// Pehle har render (gift/emoji/seat update) par naye array/object bante the -> memo components
// (ViewersSheet, GiftSheet) bina wajah re-render hote the. Hooks early-return se PEHLE hain (rules of hooks).
const audienceArray = useMemo(() => Object.values(audienceMap).filter(
  (user) => user && user.uid && user.uid !== roomData?.hostId
), [audienceMap, roomData?.hostId]);
const topUsers = useMemo(() => audienceArray.slice(0, 3), [audienceArray]);
const totalViewers = audienceArray.length;
const heartTotal = useMemo(() => Object.values(audienceMap).reduce(
  (a, u) => a + ((u && u.hearts) || 0), 0
), [audienceMap]);
// GIFT POPUP: sirf wahi users jo seat pe baithe hain (khud ko chhod kar, duplicate nahi)
const giftUsers = useMemo(() => {
  const out = [];
  const seen = new Set();
  Object.values(roomData?.seatsData || {}).forEach((seat) => {
    if (!seat || !seat.userId) return;
    if (seat.userId === currentUid) return;
    if (seen.has(seat.userId)) return;
    seen.add(seat.userId);
    out.push({ uid: seat.userId, name: seat.userName, img: seat.userImg });
  });
  return out;
}, [roomData?.seatsData, currentUid]);
const requestsArray = useMemo(() => (
  roomData?.speakerRequests
    ? Object.values(roomData.speakerRequests)
        .filter((r) => r && r.uid && !hiddenReqUids[r.uid])
        .sort((x, y) => (x.requestedAt || 0) - (y.requestedAt || 0))
    : []
), [roomData?.speakerRequests, hiddenReqUids]);

  if (loading) return <View style={styles.loader}><Text style={{color:'#fff'}}>Entering Live Room...</Text></View>;

const topSeatUsers = Object.values(roomData?.seatsData || {}).filter((item) => item?.userId);

handleSendGiftRef.current = handleSendGift;

const toastEl = toastMsg ? (
  <Animated.View
    pointerEvents="none"
    style={[
      styles.toastBox,
      {
        opacity: toastAnim,
        transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      },
    ]}
  >
    <Text style={styles.toastText}>{toastMsg}</Text>
  </Animated.View>
) : null;






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
    if (isAdmin) { adminTakeSeat(key); return; }   // admin = host jaisa: bina request ke seat
    sendSeatRequest(key);
    return;
  }

  // host aur admin dono kisi bhi speaker par (remove/mute/make-admin) chala sakte hain
  const canActOnSeat = canManage;
  if (canManage && canActOnSeat && seat.userId && key !== "seat_1") {
    setSelectedSeatKey(key);
    setSelectedSpeaker(seat);
    setSpeakerModalVisible(true);
  } else if (seat.userId && !isHost) {
    setSelectedSpeaker(seat);
    setProfileVisible(true);
  }
};
seatPressRef.current = handleSeatPress;

// Listener list + chat user tap -> same profile popup (follow / like / open profile)
// as a seat tap. Uses the already-loaded seat-style object, so it opens instantly.
const openUserPopup = (u) => {
  const uid = u?.userId || u?.senderId || u?.uid;
  if (!uid) return;
  Keyboard.dismiss();
  setSelectedSpeaker({
    userId: uid,
    userImg: u.userImg || u.img || "",
    userName: u.userName || u.username || u.senderName || u.name || "user",
    verified: u.verified,
    verifiedColor: u.verifiedColor,
    level: u.level || 1,
  });
  // sheets band karo taaki popup upar saaf khule
  const sheetOpen = viewersVisible || hostPanelVisible;
  if (viewersVisible) setViewersVisible(false);
  if (hostPanelVisible) setHostPanelVisible(false);
  if (sheetOpen && Platform.OS === "ios") {
    setTimeout(() => setProfileVisible(true), 350);
  } else {
    setProfileVisible(true);
  }
};
chatUserPressRef.current = openUserPopup;

// ===== FIXED LAYOUT NUMBERS (har phone par same formula) =====
// top: status bar / notch ki asli unchai + 8
const topInset = insets.top > 0 ? insets.top : (Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0);
// bottom: gesture/nav bar ki asli unchai (kam se kam 10) - keyboard khula ho to sirf 6
const bottomGap = keyboardOpen ? 6 : Math.max(insets.bottom, 10) + 6;
const bottomBarTotal = BOTTOM_BAR_H + bottomGap;

return (
  <View
    style={styles.mainContainer}
    onTouchStartCapture={() => {
      // sirf timestamp (no re-render); sote hue voice ko jagao
      lastTouchRef.current = Date.now();
      if (voiceSleepRef.current) wakeVoiceRef.current && wakeVoiceRef.current();
    }}
  >

    {/* host ka swipe-back band: live sirf "End live" se band hoga */}
    <Stack.Screen options={{ gestureEnabled: false }} />

    <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
    <TimeBackground />

    {/* ================= TOP HEADER ================= */}
    <View style={[styles.topHeader, { paddingTop: topInset + 8 }]}>
      {/* left: host pill */}
      <View style={styles.hostPillWrap}>
        <View style={styles.hostAvatarContainer}>
          <ExpoImage cachePolicy="memory-disk" transition={0}
            source={{ uri: roomData?.seatsData?.seat_1?.userImg || STABLE_AVATAR }}
            style={styles.topHostImg}
          />
          {(roomData?.seatsData?.seat_1?.level >= 10 || !!roomData?.seatsData?.seat_1?.userId) && (
            <GuardedFrame
              level={roomData?.seatsData?.seat_1?.level}
              uid={roomData?.seatsData?.seat_1?.userId}
              style={FRAME_HOST38}
            />
          )}
        </View>

        <View style={{ marginLeft: 8, maxWidth: width * 0.26 }}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.roomNameText}>
            {roomData?.seatsData?.seat_1?.userName || "Live Room"}
          </Text>
          <View style={styles.coinRow}>
            <Ionicons name="star" size={12} color="#f5c518" />
            <Text allowFontScaling={false} style={styles.coinTxt}>
              {fmtCount((roomData?.seatsData?.seat_1?.userId && roomData?.seatStars?.[roomData.seatsData.seat_1.userId]) || 0)}
            </Text>
          </View>
          {!!roomStartTime && <LiveTimer startTime={roomStartTime} />}
        </View>

        {!isHost && (
          <TouchableOpacity
            style={styles.plusBtn}
            activeOpacity={0.8}
            onPress={() => {
              setSelectedSpeaker(roomData?.seatsData?.seat_1 || {});
              setProfileVisible(true);
            }}
          >
            <Ionicons name="add" size={18} color="#000" />
          </TouchableOpacity>
        )}
      </View>

      {/* right: viewers + count + close */}
      <View style={styles.headerRight}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => setViewersVisible(true)} style={styles.viewerContainer}>
          {topUsers.map((user, index) => (
            <View key={user.uid} style={{ marginLeft: index === 0 ? 0 : 8 }}>
              <ExpoImage cachePolicy="memory-disk" transition={0}
                source={{ uri: user.img || STABLE_AVATAR }}
                style={styles.viewerAvatar}
              />
              {(user.level >= 10 || !!user.uid) && (
                <GuardedFrame level={user.level} uid={user.uid} animated pointerEvents="none"
                  style={{ position: 'absolute', width: 40, height: 40, top: -5, left: -5 }} />
              )}
            </View>
          ))}
          <View style={styles.viewerCount}>
            <Text allowFontScaling={false} style={styles.viewerCountText}>{totalViewers}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => setControlModalVisible(true)}
        >
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>

    {/* ================= QUICK TOOLBAR ================= */}
    <View style={styles.toolbar}>
      <View style={styles.monthlyChip}>
        <Ionicons name="stats-chart" size={11} color="#f1c40f" style={{ flexShrink: 0 }} />
        <Text allowFontScaling={false} style={styles.monthlyTxt} numberOfLines={1}>Monthly Host</Text>
      </View>
      {canManage && (
        <TouchableOpacity
          style={[styles.chip, chatLocked && { backgroundColor: 'rgba(241,196,15,0.25)' }]}
          onPress={() => setHostPanelVisible(true)}
        >
          <Ionicons name={chatLocked ? "lock-closed" : "construct"} size={12} color={chatLocked ? "#f1c40f" : "#fff"} />
          <Text allowFontScaling={false} style={styles.chipTxt} numberOfLines={1}>{isHost ? 'Host' : 'Admin'}</Text>
        </TouchableOpacity>
      )}
      <View style={styles.chip}>
        <Ionicons name="heart" size={12} color={T.pink} />
        <Text allowFontScaling={false} style={styles.chipTxt} numberOfLines={1}>{fmtCount(heartTotal)}</Text>
      </View>
      <TouchableOpacity style={styles.chip} onPress={() => setGiftersVisible(true)}>
        <MaterialCommunityIcons name="trophy" size={12} color={T.gold} />
        <Text allowFontScaling={false} style={styles.chipTxt} numberOfLines={1}>Top</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.chip} onPress={() => setFriendShareVisible(true)}>
        <Ionicons name="share-social" size={12} color="#fff" />
        <Text allowFontScaling={false} style={styles.chipTxt} numberOfLines={1}>Share</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.chip, { paddingHorizontal: 8, flexShrink: 0 }]} onPress={() => setMenuVisible(true)}>
        <Ionicons name="ellipsis-horizontal" size={16} color="#fff" />
      </TouchableOpacity>
    </View>

    {/* ================= MAIN CONTENT ================= */}
 <View style={{
      flex: 1,
      overflow: 'hidden',
      minHeight: 0,
    }}>

      {/* SEATS */}
      <View style={[styles.micGrid, { width: seatCellW * seatCols }]}>
        {SEAT_KEYS.slice(0, seatCount).map((key, i) => {
          const seat = resolvedSeats[key] || EMPTY_SEAT;
          return (
            <SpeakingSeat
              key={key}
              seatKey={key}
              index={i + 1}
              seat={seat}
              stars={(seat.userId && roomData?.seatStars?.[seat.userId]) || 0}
              cellW={seatCellW}
              onPress={stableSeatPress}
            />
          );
        })}
      </View>

      {!!roomData?.description && (
        <View style={styles.pinned}>
          <Ionicons name="megaphone" size={13} color={T.gold} />
          <Text numberOfLines={2} ellipsizeMode="tail" style={styles.pinnedTxt}>{roomData.description}</Text>
        </View>
      )}

      {/* CHAT */}
<FlatList
    ref={chatScrollRef}
    data={chatListData}
    inverted
    style={styles.chatArea}
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={{
        paddingTop: 6,
        paddingBottom: 4,
    }}
    showsVerticalScrollIndicator={false}
    initialNumToRender={10}
    maxToRenderPerBatch={6}
    windowSize={5}
    removeClippedSubviews={false}
    updateCellsBatchingPeriod={50}
    overScrollMode="never"
    keyExtractor={chatKeyExtractor}
   



    renderItem={renderChatItem}
/>







    </View>



<GiftLayer ref={giftLayerRef} />

{/* ================= JOIN ENTRY ANIMATION ================= */}
{joinBanner && (
  <JoinEntry
    data={joinBanner}
    variant={JOIN_ANIM_VARIANT}
    onDone={handleJoinDone}
  />
)}

    <FloatingHearts ref={heartsRef} />

    {/* ===== TEEN PATTI: neeche aadha screen, navigation bar ke upar; upar seats dikhti rahengi ===== */}
    {gameOpen === 'teen' && (
      <TeenPattiGame
        db={db}
        uid={currentUid}
        roomId={roomId}
        stars={stars}
        bottom={Math.max(insets.bottom, 10)}
        onClose={() => setGameOpen(false)}
      />
    )}
    {gameOpen === 'greedy' && (
      <GreedyGame
        db={db}
        uid={currentUid}
        roomId={roomId}
        stars={stars}
        bottom={Math.max(insets.bottom, 10)}
        onClose={() => setGameOpen(false)}
      />
    )}

    {emojiOpen && (
      <ReAnimated.View
        style={[
          styles.emojiBar,
          { bottom: bottomBarTotal + 8 },
          emojiKbStyle,
        ]}
      >
        <EmojiStrip onPick={stableEmojiPick} />
      </ReAnimated.View>
    )}

    {/* ================= BOTTOM BAR ================= */}
{/* ===== GAME LOGO (song button ke UPAR) - sabko dikhta hai ===== */}
{!keyboardOpen && !gameOpen && (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={() => { Keyboard.dismiss(); setEmojiOpen(false); setGamePickerOpen((v) => !v); }}
    style={{
      position: 'absolute',
      right: 12,
      bottom: keyboardHeight + bottomBarTotal + 24 + 62,
      width: 48,
      height: 48,
      borderRadius: 24,
      zIndex: 60,
      elevation: 12,
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
    }}
  >
    <LinearGradient
      colors={['#ffd54a', '#ff8a00']}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={{
        flex: 1, borderRadius: 24, borderWidth: 2, borderColor: '#fff3b0',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Text allowFontScaling={false} style={{ fontSize: 22 }}>🎴</Text>
    </LinearGradient>
    <View
      style={{
        position: 'absolute', bottom: -4, alignSelf: 'center', backgroundColor: '#e0152b',
        paddingHorizontal: 6, borderRadius: 8, borderWidth: 1, borderColor: '#fff',
      }}
    >
      <Text allowFontScaling={false} style={{ color: '#fff', fontSize: 8, fontWeight: '900' }}>GAME</Text>
    </View>
  </TouchableOpacity>
)}

{/* ===== GAME PICKER (logo ke upar) ===== */}
{gamePickerOpen && !keyboardOpen && !gameOpen && (
  <View
    style={{
      position: 'absolute',
      right: 12,
      bottom: keyboardHeight + bottomBarTotal + 24 + 62 + 56,
      zIndex: 61,
      elevation: 13,
      backgroundColor: 'rgba(20,10,60,0.95)',
      borderRadius: 16,
      padding: 8,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    }}
  >
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => { setGamePickerOpen(false); setGameOpen('teen'); }}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10 }}
    >
      <Text allowFontScaling={false} style={{ fontSize: 22, marginRight: 8 }}>🎴</Text>
      <Text allowFontScaling={false} style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Teen Patti</Text>
    </TouchableOpacity>
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => { setGamePickerOpen(false); setGameOpen('greedy'); }}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10 }}
    >
      <Text allowFontScaling={false} style={{ fontSize: 22, marginRight: 8 }}>🐰</Text>
      <Text allowFontScaling={false} style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Greedy</Text>
    </TouchableOpacity>
  </View>
)}

{/* ===== SONG BUTTON (gift button ke upar) - sirf host/speaker ===== */}
{currentUserRole !== 'listener' && !keyboardOpen && !gameOpen && (
  <MusicFab
    playing={music.playing}
    onPress={() => setMusicSheetVisible(true)}
    style={{
      right: 12,
      bottom: keyboardHeight + bottomBarTotal + 24,
    }}
  />
)}
<MusicSheet
  visible={musicSheetVisible}
  onClose={() => setMusicSheetVisible(false)}
  onReopen={() => setMusicSheetVisible(true)}
  music={music}
  micMuted={iAmMuted}
  onToggleMic={muteSelf}
/>

 <ReAnimated.View
  style={[
    styles.bottomNav,
    bottomNavKbStyle,
  ]}
>

      <View style={[styles.inputBox, keyboardOpen && { marginRight: 0 }]}>
        <ChatTextInput onSend={stableSendChat} locked={chatLocked && !canManage} onFocus={onChatFocus} onBlur={onChatBlur} />
        <TouchableOpacity onPress={() => setEmojiOpen(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name={emojiOpen ? "happy" : "happy-outline"} size={22} color={T.sub} />
        </TouchableOpacity>
      </View>


{currentUserRole !== 'listener' && !keyboardOpen && (
  <TouchableOpacity style={styles.actionCircle} onPress={muteSelf} activeOpacity={0.7}>
    <Ionicons name={iAmMuted ? "mic-off" : "mic"} size={22} color={iAmMuted ? T.live : "#fff"} />
  </TouchableOpacity>
)}

{!keyboardOpen && (
<TouchableOpacity
  style={[styles.actionCircle, { backgroundColor: 'rgba(255,77,141,0.18)' }]}
  onPress={sendHeart}
  activeOpacity={0.7}
>
  <Ionicons name="heart" size={24} color={T.pink} />
</TouchableOpacity>
)}


      {currentUserRole === 'listener' && !keyboardOpen && (
        <TouchableOpacity style={[styles.raiseHandBtn, myReqSent && { opacity: 0.55 }]} onPress={handleRaiseHand}>
          <Text style={styles.raiseHandText}>{myReqSent ? '⏳' : '✋'}</Text>
        </TouchableOpacity>
      )}

      {canManage && !keyboardOpen && (


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

     
{!keyboardOpen && (
     <TouchableOpacity
  style={styles.giftCircle}
  onPress={() => {
    if (selectedGiftUser && selectedGiftUser !== "ALL" && !giftUsers.some(u => u.uid === selectedGiftUser)) {
      setSelectedGiftUser(null);
    }
    if (giftSheetRef.current) giftSheetRef.current.open();
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
)}

    </ReAnimated.View>

    {/* ================= EXIT MODAL ================= */}
    <SafeModal
      transparent
      visible={controlModalVisible}
      animationType="fade"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={() => setControlModalVisible(false)}
    >
      {/* side (bahar) tap karne par popup band */}
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={() => setControlModalVisible(false)}
      >
        <TouchableOpacity activeOpacity={1} style={styles.exitBox}>
          <Text style={styles.exitTitle}>Exit Room?</Text>
          <Text style={styles.exitSub}>
           {currentUserRole === "host"
             ? "Aapki live band ho jayegi. Kya aap sach me bahar nikalna chahte hain?"
             : "Kya aap sach me is live se bahar nikalna chahte hain?"}
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
  onPress={() => cleanAndExit(false)}
>
  <Text style={styles.btnText}>Yes</Text>
</TouchableOpacity>
          </View>

          {isAdmin && (
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.yesBtn, { marginTop: 14, backgroundColor: '#c0392b', alignSelf: 'stretch', alignItems: 'center' }]}
              onPress={() => {
                Alert.alert(
                  'Live band karni hai? 🔴',
                  'Ye live sabke liye band ho jayegi (host ke liye bhi).',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'End Live', style: 'destructive', onPress: () => cleanAndExit(true) },
                  ]
                );
              }}
            >
              <Text style={styles.btnText}>🛑 End Live (sabke liye)</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </SafeModal>

    {/* ================= SPEAKER REQUEST MODAL ================= */}
    <SafeModal
visible={requestModalVisible}
transparent
animationType="slide"
statusBarTranslucent
hardwareAccelerated
onRequestClose={() => setRequestModalVisible(false)}
>


      <View style={styles.bottomSheetOverlay}>
        <TouchableOpacity style={{flex:1}} activeOpacity={1} onPress={() => setRequestModalVisible(false)} />
        <View style={[styles.requestSheet, { paddingBottom: navGap + 10 }]}>

          <Text style={{color:'#fff', fontSize:20, fontWeight:'bold', marginBottom:20}}>
            🔊 Speaker Requests
          </Text>

          <ScrollView>

            {requestsArray.map((user)=>(
              <View key={user.uid} style={{
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

                <View style={{flexDirection:'row', alignItems:'center'}}>
                  <TouchableOpacity
                    style={{marginRight:16}}
                    onPress={() => {
                      if (db && roomId && user?.uid) {
                        setHiddenReqUids((h) => ({ ...h, [user.uid]: true }));   // turant hatao
                        showToast("Request reject ki ❌");
                        updateDoc(doc(db,"rooms",roomId),{ [`speakerRequests.${user.uid}`]: deleteField() })
                          .catch(()=>{
                            setHiddenReqUids((h) => { const n = { ...h }; delete n[user.uid]; return n; });
                          });
                      }
                    }}
                  >
                    <Text style={{color:'#ff6b5e', fontWeight:'bold'}}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => approveRequest(user)}>
                    <Text style={{color:'#00ff88', fontWeight:'bold'}}>Approve</Text>
                  </TouchableOpacity>
                </View>
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
        {toastEl}
      </View>
    </SafeModal>




{!requestModalVisible && !friendShareVisible && toastEl}

<GiftSheet
  ref={giftSheetRef}
  stars={stars}
  giftUsers={giftUsers}
  selectedGiftUser={selectedGiftUser}
  onSelectUser={setSelectedGiftUser}
  onSendGift={onSendGiftStable}
/>




<SafeModal
visible={speakerModalVisible}
transparent
animationType="slide"
statusBarTranslucent
hardwareAccelerated
onRequestClose={() => setSpeakerModalVisible(false)}
>

<View style={{
flex:1,
justifyContent:'flex-end',
backgroundColor:'rgba(0,0,0,0.5)'
}}>

<TouchableOpacity style={{flex:1}} activeOpacity={1} onPress={() => setSpeakerModalVisible(false)} />

<View style={{
backgroundColor:'#000',
height:height*0.55,
borderTopLeftRadius:30,
borderTopRightRadius:30,
alignItems:'center',
paddingBottom: navGap + 10,
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

{!!selectedSpeaker?.userId && selectedSpeaker.userId !== currentUid && (
  <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 12 }}>
    <TouchableOpacity activeOpacity={0.8} onPress={() => handleReportFromRoom(selectedSpeaker)}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, marginRight: 10, backgroundColor: 'rgba(255,90,90,0.12)', borderWidth: 1, borderColor: 'rgba(255,90,90,0.5)' }}>
      <Ionicons name="flag" size={13} color="#ff5a5a" />
      <Text allowFontScaling={false} style={{ color: '#ff5a5a', fontWeight: 'bold', fontSize: 12, marginLeft: 5 }}>Report</Text>
    </TouchableOpacity>
    <TouchableOpacity activeOpacity={0.8} onPress={() => handleBlockFromRoom(selectedSpeaker)}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
      <Ionicons name="ban" size={13} color="#fff" />
      <Text allowFontScaling={false} style={{ color: '#fff', fontWeight: 'bold', fontSize: 12, marginLeft: 5 }}>Block</Text>
    </TouchableOpacity>
  </View>
)}


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

<ProfileAvatar uri={selectedSpeaker?.userImg} uid={selectedSpeaker?.userId} level={profileLevel} size={100} />

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
 
<UserTick uid={selectedSpeaker?.uid || selectedSpeaker?.userId || selectedSpeaker?.senderId || selectedSpeaker?.id} verified={!!(isVerified(selectedSpeaker?.verified))} verifiedColor={selectedSpeaker?.verifiedColor} size={18} />

  

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

{canManage && !!selectedSpeaker?.userId && selectedSpeaker.userId !== currentUid && selectedSpeaker.userId !== roomData?.hostId && (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={() => toggleAdmin(selectedSpeaker.userId, selectedSpeaker.userName)}
    style={{
      marginTop: 10,
      paddingVertical: 6,
      paddingHorizontal: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: roomData?.admins?.[selectedSpeaker.userId] ? '#ff5a5a' : '#f1c40f',
      backgroundColor: roomData?.admins?.[selectedSpeaker.userId] ? 'rgba(255,90,90,0.12)' : 'rgba(241,196,15,0.12)',
    }}
  >
    <Text allowFontScaling={false} style={{ color: roomData?.admins?.[selectedSpeaker.userId] ? '#ff5a5a' : '#f1c40f', fontWeight: 'bold', fontSize: 13 }}>
      {roomData?.admins?.[selectedSpeaker.userId] ? '🛡 Remove Admin' : '🛡 Make Admin'}
    </Text>
  </TouchableOpacity>
)}

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

</SafeModal>



<SafeModal
visible={profileVisible}
transparent
animationType="slide"
statusBarTranslucent
hardwareAccelerated
onRequestClose={() => setProfileVisible(false)}
>

<View
style={{
flex:1,
justifyContent:"flex-end",
backgroundColor:"rgba(0,0,0,0.5)"
}}
>

<TouchableOpacity style={{flex:1}} activeOpacity={1} onPress={() => setProfileVisible(false)} />

<View
style={{
backgroundColor:"#000",
height:height*0.42,
borderTopLeftRadius:30,
borderTopRightRadius:30,
alignItems:"center",
paddingTop:5,
paddingBottom: navGap + 10,
}}
>

{renderReportBlock(selectedSpeaker)}

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

<ProfileAvatar uri={selectedSpeaker?.userImg} uid={selectedSpeaker?.userId} level={profileLevel} size={100} style={{ marginTop: 10 }} />

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

  {/* Verified Tick - sirf verified user ko */}
  <UserTick uid={selectedSpeaker?.uid || selectedSpeaker?.userId || selectedSpeaker?.senderId || selectedSpeaker?.id} verified={!!(isVerified(selectedSpeaker?.verified))} verifiedColor={selectedSpeaker?.verifiedColor} size={18} />

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

{canManage && !!selectedSpeaker?.userId && selectedSpeaker.userId !== currentUid && selectedSpeaker.userId !== roomData?.hostId && (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={() => toggleAdmin(selectedSpeaker.userId, selectedSpeaker.userName)}
    style={{
      marginTop: 10,
      paddingVertical: 6,
      paddingHorizontal: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: roomData?.admins?.[selectedSpeaker.userId] ? '#ff5a5a' : '#f1c40f',
      backgroundColor: roomData?.admins?.[selectedSpeaker.userId] ? 'rgba(255,90,90,0.12)' : 'rgba(241,196,15,0.12)',
    }}
  >
    <Text allowFontScaling={false} style={{ color: roomData?.admins?.[selectedSpeaker.userId] ? '#ff5a5a' : '#f1c40f', fontWeight: 'bold', fontSize: 13 }}>
      {roomData?.admins?.[selectedSpeaker.userId] ? '🛡 Remove Admin' : '🛡 Make Admin'}
    </Text>
  </TouchableOpacity>
)}

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

</SafeModal>










<SafeModal
visible={selfSeatModalVisible}
transparent
animationType="slide"
statusBarTranslucent
hardwareAccelerated
onRequestClose={() => setSelfSeatModalVisible(false)}
>

<View
style={{
flex:1,
justifyContent:"flex-end",
backgroundColor:"rgba(0,0,0,0.5)"
}}
>

<TouchableOpacity style={{flex:1}} activeOpacity={1} onPress={() => setSelfSeatModalVisible(false)} />

<View
style={{
backgroundColor:"#111",
borderTopLeftRadius:25,
borderTopRightRadius:25,
padding:25,
paddingBottom: navGap + 15
}}
>

{/* Profile */}

<View
style={{
alignItems:"center",
marginBottom:25
}}
>

<ProfileAvatar uri={selectedSpeaker?.userImg || STABLE_AVATAR} uid={selectedSpeaker?.userId} level={profileLevel} size={90} style={{ marginBottom: 12 }} />

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
 {currentUserRole === "host" ? "👤 Host" : isAdmin ? "🛡 Admin" : "👤 Speaker"}
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

</SafeModal>









<SafeModal
visible={friendShareVisible}
transparent
animationType="slide"
statusBarTranslucent
hardwareAccelerated
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

<TouchableOpacity style={{flex:1}} activeOpacity={1} onPress={() => setFriendShareVisible(false)} />

<View
style={[styles.friendSheet, { paddingBottom: navGap + 10 }]}
>

<Text
style={styles.friendTitle}
>

Friend Share

</Text>

<FlatList
data={friends}
extraData={{ selectedFriends, sentFriendIds }}
keyExtractor={(f)=>f.id}
initialNumToRender={8}
maxToRenderPerBatch={8}
windowSize={5}
showsVerticalScrollIndicator={false}
renderItem={({item})=>(

<TouchableOpacity

style={styles.friendRow}

onPress={()=>{

if (sentFriendIds[item.id]) return;

toggleFriend(item.id);

}}

>


<View>

<ExpoImage cachePolicy="memory-disk" transition={0}
source={{
uri:
item.profileImg||
STABLE_AVATAR
}}
style={styles.friendImg}
/>

{
(item.level>=10 || !!item.id) && (

<GuardedFrame level={item.level} uid={item.id} animated
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
    <UserTick uid={item.uid || item.userId || item.senderId || item.id} verified={!!(isVerified(item.verified))} verifiedColor={item.verifiedColor} size={17} />

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


{sentFriendIds[item.id] ? (

<View style={styles.sentBadge}>
<Text style={styles.sentBadgeText}>✓ Sent</Text>
</View>

) : (

<View

style={[

styles.radio,

selectedFriends.includes(item.id)

&&

styles.radioSelected

]}

/>

)}

</TouchableOpacity>

)}
/>

<TouchableOpacity

style={[styles.shareBtn, shareDone && { backgroundColor:"#128C4A" }]}

onPress={handleShare}

>

<Text style={styles.shareText}>

{shareDone ? "✓ Shared" : "Share on WhatsApp & More"}

</Text>

</TouchableOpacity>

<TouchableOpacity

style={styles.sendBtn}

onPress={sendInvite}

>

<Text style={styles.sendText}>

{selectedFriends.length ? `Send Invite (${selectedFriends.length})` : "Send Invite"}

</Text>

</TouchableOpacity>

</View>

{toastEl}

</View>

</SafeModal>




    {canManage && (
      <HostPanelSheet
        visible={hostPanelVisible}
        onUserPress={openUserPopup}
        onClose={() => setHostPanelVisible(false)}
        users={hostPanelUsers}
        invites={activeInvites}
        chatLocked={chatLocked}
        onToggleChatLock={toggleChatLock}
        onClearChat={clearAllChat}
        onInvite={inviteToSeat}
        onKick={confirmKick}
        seatCount={seatCount}
        onChangeSeats={changeSeatCount}
      />
    )}

    {/* Host ne seat par bulaya -> listener ko popup */}
    <SafeModal
      visible={myInviteValid}
      transparent
      animationType="fade"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={declineInvite}
    >
      <View style={styles.overlay}>
        <View style={styles.exitBox}>
          <Text style={styles.exitTitle}>🎙 Seat Invite</Text>
          <Text style={styles.exitSub}>
            {(myInvite?.hostName || 'Host')} ne aapko seat par bulaya hai. Join karoge?
          </Text>
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.noBtn} onPress={declineInvite} disabled={inviteBusy}>
              <Text style={styles.btnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.yesBtn, { backgroundColor: '#00c27a', opacity: inviteBusy ? 0.6 : 1 }]}
              onPress={acceptInvite}
              disabled={inviteBusy}
            >
              <Text style={styles.btnText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeModal>

    <ViewersSheet
      visible={viewersVisible}
      onClose={() => setViewersVisible(false)}
      users={audienceArray}
      onUserPress={openUserPopup}
      isHost={canManage}
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
      isHost={canManage}
      locked={!!roomData?.roomLocked}
      onToggleLock={toggleRoomLock}
      onShare={() => setFriendShareVisible(true)}
      onExit={() => setControlModalVisible(true)}
    />

  </View>
);
  
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#14465f' },

  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 8, marginTop: 6 },
  monthlyChip: {
    flexDirection: 'row', alignItems: 'center', marginLeft: 4,
    paddingHorizontal: 7, height: 26, borderRadius: 13, flexShrink: 1,
    backgroundColor: 'rgba(241,196,15,0.14)', borderWidth: 0.5, borderColor: 'rgba(241,196,15,0.35)',
  },
  monthlyTxt: { color: '#fff', fontSize: 10, fontWeight: '700', marginLeft: 3, flexShrink: 1 },
  chip: {
    flexDirection: 'row', alignItems: 'center', marginLeft: 4,
    paddingHorizontal: 8, height: 26, borderRadius: 13, flexShrink: 1,
    backgroundColor: 'rgba(0,0,0,0.42)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)',
  },
  chipTxt: { color: '#fff', fontSize: 11, fontWeight: '700', marginLeft: 3, flexShrink: 1 },
  pinned: {
    flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'flex-start',
    marginHorizontal: 14, marginTop: 2, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.5)', maxWidth: '94%',
  },
  pinnedTxt: { color: '#fff', fontSize: 13, lineHeight: 18, marginLeft: 7, flexShrink: 1 },
  emojiBar: {
    position: 'absolute', left: 12, right: 12, borderRadius: 22, zIndex: 50,
    backgroundColor: 'rgba(20,16,48,0.96)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)',
  },
  loader: { flex: 1, backgroundColor: '#0A0B14', justifyContent: 'center', alignItems: 'center' },

  topHeader:{
    flexDirection:"row",
    justifyContent:"space-between",
    alignItems:"center",
    paddingHorizontal:12,
    paddingTop:10,
  },
  hostPillWrap: {
    flexDirection:'row', alignItems:'center',
    backgroundColor:'rgba(0,0,0,0.5)', borderRadius:26, flexShrink:1,
    paddingLeft:4, paddingRight:6, paddingVertical:4,
  },
  topHostImg: { width: 38, height: 38, borderRadius: 19 },
  roomNameText: { color: '#fff', fontSize: 13, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  coinRow: { flexDirection:'row', alignItems:'center', marginTop:1 },
  coinDot: { width:11, height:11, borderRadius:6, backgroundColor:'#f5c518', borderWidth:1, borderColor:'#c99a00' },
  coinTxt: { color:'#fff', fontSize:11, marginLeft:4, fontWeight:'700', textShadowColor:'rgba(0,0,0,0.9)', textShadowOffset:{width:0,height:1}, textShadowRadius:2 },
  plusBtn: { width:30, height:30, borderRadius:15, backgroundColor:'#fff200', justifyContent:'center', alignItems:'center', marginLeft:8 },
  headerRight: { flexDirection:'row', alignItems:'center', flexShrink:0, marginLeft:6 },
  closeBtn: { marginLeft:10 },
  hostBadge: { flexDirection: 'row', alignItems: 'center' },
  viewRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 10, marginTop: 2 },
  onlineText: { color: '#fff', fontSize: 11, marginLeft: 4, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  liveTag: { backgroundColor: '#FF3B5C', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, marginLeft: 8 },
  liveTagText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  audienceAvatars: { flexDirection: 'row', alignItems: 'center' },
  miniRound: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: '#0A0B14' },
  moreCount: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1C1E2E', justifyContent: 'center', alignItems: 'center', marginLeft: -12, borderWidth: 1.5, borderColor: '#0A0B14' },
  moreText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  micGrid: { flexDirection: 'row', flexWrap: 'wrap', width: SEAT_CELL_W * 3, alignSelf: 'center', paddingTop: 14, marginTop: 4 },
  seatCell: { width: SEAT_CELL_W, alignItems: 'center', marginBottom: 8 },
  seatSquare: {
    width: SEAT_SIZE, height: SEAT_SIZE, borderRadius: SEAT_RADIUS, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  seatSquareSpeaking: { borderColor: '#fff200', borderWidth: 2 },
  seatSquareOccupied: { borderWidth: 0, backgroundColor: 'transparent' },
  // profile photo = seat ka exact size aur exact shape
  seatAvatarImg: { width: SEAT_SIZE, height: SEAT_SIZE, borderRadius: SEAT_RADIUS, backgroundColor: '#2a2b38' },
  speakGlowSolid: {
    position: 'absolute', top: GLOW_OFFSET, left: GLOW_OFFSET, width: GLOW_SIZE, height: GLOW_SIZE,
    borderRadius: GLOW_RADIUS, borderWidth: 3, borderColor: GLOW_COLOR, zIndex: 15, elevation: 15,
    shadowColor: GLOW_COLOR, shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  speakGlowPulse: {
    position: 'absolute', top: GLOW_OFFSET, left: GLOW_OFFSET, width: GLOW_SIZE, height: GLOW_SIZE,
    borderRadius: GLOW_RADIUS, backgroundColor: 'rgba(46,230,166,0.35)', zIndex: 14, elevation: 14,
  },
  seatSpeakRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: SEAT_RADIUS, borderWidth: 2, borderColor: '#fff200' },
  // zIndex/elevation frame (zIndex 10) se zyada -> mute logo frame ke UPAR dikhega
  seatMuteBadge: { position: 'absolute', right: 2, bottom: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: '#e74c3c', justifyContent: 'center', alignItems: 'center', zIndex: 20, elevation: 20 },
  seatEmoji: { position: 'absolute', top: -6, right: -6, fontSize: 22 },
  seatHostPill: { position: 'absolute', bottom: SEAT_FRAME_OFFSET - 4, zIndex: 30, elevation: 30, backgroundColor: '#2f7bf5', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 1 },
  seatHostPillTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
  seatLabelPill: { marginTop: -SEAT_FRAME_OFFSET + 3, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 1.5, maxWidth: SEAT_CELL_W - 8 },
  seatLabel: { color: '#fff', fontSize: 10, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  seatCoinRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 9, paddingHorizontal: 6, paddingVertical: 1 },
  seatCoinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#f5c518' },
  seatCoinTxt: { color: '#fff', fontSize: 9, marginLeft: 4, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },

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

chatArea: {
    // seats + pinned notice ke neeche, bottom bar ke upar - bachi hui poori jagah (har mobile par same)
    flex: 1,
    minHeight: 0,
    marginTop: 6,
    paddingHorizontal: 10,
  },  

  chatRow: { flexDirection: 'row', marginBottom: 15, alignItems: 'flex-start' },
  chatAva: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a2b38' },
  chatContent: { flex: 1, marginLeft: 10 },
  chatHeaderInline: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  chatUser: { color: '#fff', fontWeight: 'bold', fontSize: 13, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  bubble: { backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, alignSelf: 'flex-start' },
  chatMsg: { color: '#fff', fontSize: 13, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  bottomNav: {
  // in-flow (absolute nahi): content ke neeche hamesha fixed jagah, har phone par same
  flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingTop: 10,
  minHeight: BOTTOM_BAR_H, backgroundColor: 'transparent' },
  inputBox: { flex: 1, height: 40, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 22, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginRight: 10 },
  inputStyle: { color: '#fff', fontSize: 14, flex: 1 },
  actionCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
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
backgroundColor:'#12071f',
overflow:'hidden',
borderTopWidth:1,
borderLeftWidth:StyleSheet.hairlineWidth,
borderRightWidth:StyleSheet.hairlineWidth,
borderColor:'rgba(245,196,81,0.35)',

maxHeight:height*0.52,

borderTopLeftRadius:22,
borderTopRightRadius:22,

paddingTop:16,
paddingHorizontal:12,
paddingBottom:14
},

giftGoldLine:{
position:'absolute',
top:0,
left:'25%',
right:'25%',
height:2,
borderRadius:2,
backgroundColor:'rgba(245,196,81,0.9)'
},

giftTitle:{
color:'#FFE9A8',
fontSize:17,
fontWeight:'bold',
marginBottom:0
},

giftGrid:{
flexDirection:'row',
flexWrap:'wrap',
justifyContent:'space-between',
paddingHorizontal:0
},

giftCard:{
width:'22.5%',
marginRight:'2%',
backgroundColor:'rgba(255,255,255,0.07)',
borderWidth:StyleSheet.hairlineWidth,
borderColor:'rgba(245,196,81,0.28)',
borderRadius:12,
padding:5,
marginBottom:10,
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
color:'#F5C451',
fontWeight:'700',
fontSize:12,
marginTop:2
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

toastBox:{
position:"absolute",
alignSelf:"center",
bottom:120,
backgroundColor:"rgba(20,22,34,0.96)",
paddingVertical:10,
paddingHorizontal:18,
borderRadius:22,
borderWidth:1,
borderColor:"rgba(0,255,136,0.45)",
zIndex:9999,
elevation:30,
},

toastText:{
color:"#fff",
fontWeight:"700",
fontSize:13,
},

sentBadge:{
backgroundColor:"rgba(0,255,136,0.15)",
borderColor:"#00ff88",
borderWidth:1,
paddingHorizontal:10,
paddingVertical:4,
borderRadius:12,
},

sentBadgeText:{
color:"#00ff88",
fontWeight:"bold",
fontSize:12,
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
    width:30,
    height:30,
    borderRadius:15,
    backgroundColor:"rgba(255,255,255,0.25)",
},

viewerCount:{
    minWidth:36,
    height:26,
    paddingHorizontal:8,
    borderRadius:13,
    backgroundColor:"rgba(0,0,0,0.35)",
    justifyContent:"center",
    alignItems:"center",
    marginLeft:6,
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