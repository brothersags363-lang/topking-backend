import { reportVoiceAbuse } from "../utils/voiceReport";
import OfficialLiveTools from "../components/live/OfficialLiveTools";
import { blockIfProfane } from "../utils/guardText";
// @ts-nocheck
// VideoLive.tsx
//
// One screen, two roles:
//  - role === "host"   → the broadcaster (own camera, tools, PK).
//  - role === "viewer" (default) → watches the HOST's camera.
//
// Features (same data model as LiveRoom.js where it applies):
//  • Gifting   → same flow as LiveRoom.js (wallet stars, liveGift animation,
//                combo banner, gift chat line, topGifters, agency stars).
//  • Join      → rooms/{id}/audience/{uid} presence + "X joined" chat line
//                + join banner. Viewer count comes from the audience list.
//  • Chat      → rooms/{id}/chats subcollection (join / gift / chat rows).
//  • PK battle → host invites another live host; split screen, live score
//                bar from gifts, countdown, win / lose / draw result.
//  • Filters   → Agora beauty + colour-enhance presets (viewers see it too).
//  • Mute      → host mic mute, viewer sound mute.
//  • Video     → host can pause / resume video, flip camera.
//  • Guests    → viewer taps the gold link button → host accepts → viewer joins the
//                video call and appears as a tile on the right side (up to MAX_GUESTS).
//                Host can mute / remove guests; guests can mute / hide camera / leave.
//
// Wired to the same `rooms` Firestore collection that all-live.js reads
// and livevideostart.tsx writes to.

import { notifyNewFollower } from "../utils/pushNotify";
import { fmtPoints } from "../utils/familyUtils";
import React, { useEffect, useRef, useState, useCallback, memo, forwardRef, useImperativeHandle } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  Modal,
  Platform,
  StatusBar,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Animated,
  Easing,
  PermissionsAndroid,
  Dimensions,
  ActivityIndicator,
  Share,
  ScrollView,
  AppState,
  Alert,
  Switch,
  TouchableWithoutFeedback,
} from "react-native";
import { scopedBackHandler } from "../utils/scopedBack";

import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { useRouter } from "../utils/safeRouter";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as ScreenCapture from "expo-screen-capture";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import LottieView from "lottie-react-native";
import { WebView } from "react-native-webview";
import { gifts } from "../assets/giftsData";
import { giftHtml } from "../assets/giftWeb";
import GiftImage, { isImgGift } from "../components/GiftImage";
import { callApi } from "../utils/api";
import { useLiveBanGuard } from "../utils/liveBan";
import { useBlockedIds } from '../utils/useBlockedIds';
import LevelFrame, { getSpecialKey } from "../components/LevelFrame";
import JoinEntry from "../components/live/JoinEntry";

import {
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  deleteField,
  increment,
  collection,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  RtcSurfaceView,
} from "react-native-agora";
import UserTick from '../components/UserTick';
import { LinearGradient } from "expo-linear-gradient";

// Firebase safety check (same pattern as LiveRoom.js / all-live.js)
let db: any = null;
let auth: any = null;
try {
  const firebaseModule = require("./firebaseConfig");
  db = firebaseModule.db;
  auth = firebaseModule.auth;
} catch (e) {
  console.log("Firebase config not found.");
}

const { width, height } = Dimensions.get("window");

const AGORA_APP_ID = "f75d0020d44345edb12bbf6847ef3d38";
const TOKEN_ENDPOINT = "https://topking-backend.onrender.com/token";
const STABLE_AVATAR = "https://avatar.iran.liara.run/public/65";
// ===== Same as LiveRoom.js: tick sirf jab verified === true; color sirf yellow/white =====
const isVerified = (v: any) => v === true || v === "true";
const normTickColor = (c: any) => (c === "yellow" ? "yellow" : "white");
const cleanVerified = (o: any) => {
  if (!o) return o;
  const ok = isVerified(o.verified);
  const out: any = { ...o, verified: ok };
  if (ok) out.verifiedColor = o.verifiedColor === "yellow" ? "yellow" : "white";
  else delete out.verifiedColor;
  return out;
};
// Join animation: 'auto' (level se) | 'slide' | 'lv10' | 'lv20' | 'lv30' | 'lv40' | 'lv50'
const JOIN_ANIM_VARIANT = "auto";

// Same 30s window all-live.js uses to decide a room is still "live".
const HEARTBEAT_INTERVAL = 8000;

// PK settings
const PK_DURATION_SEC = 300; // 5 minutes
const PK_RESULT_SHOW_MS = 6000; // PK ke baad 10 sec ruka rahe (loser punishment chalta hai), phir PK clear
const PK_INVITE_TTL = 30000; // invite expires after 30s
const PK_UID_OFFSET = 1000000; // uid used when we peek into the opponent's channel
// PK friend list:
//   "mutual"    = dono ek dusre ko follow kare
//   "following" = jise main follow karta hu
//   "either"    = jise main follow karta hu YA jo mujhe follow karta hai (default: koi live friend miss na ho)
const PK_FRIEND_MODE: "mutual" | "following" | "either" = "either";
const PK_FRIEND_LIMIT = 40; // PK sheet me max itne friends

// Host camera quality  (HEAT FIX)
// Pehle 720x1280 @ 24fps + 1500kbps tha: encoder + camera + modem teeno bahut
// garam hote the (30 min me phone tapta tha). 540x960 @ 15fps live apps ke liye
// kaafi sharp hai aur CPU / battery / data ~50% kam lagta hai.
// Phone thanda rahe aur aur smooth chahiye to frameRate 20 try karo.
const VIDEO_PROFILE = {
  dimensions: { width: 540, height: 960 },
  frameRate: 20, // SMOOTH FIX: 15 -> 20 fps (motion ~33% smoother, heat thodi hi badhti hai). Aur smooth chahiye to 24.
  bitrate: 950,
  minBitrate: 300,
  orientationMode: 2, // fixed portrait
  degradationPreference: 1, // weak network → resolution pehle girta hai, motion smooth rehta hai
};
// Weak network / phone bahut garam hone par host automatically isi profile par aa jata hai
const VIDEO_PROFILE_LOW = {
  dimensions: { width: 360, height: 640 },
  frameRate: 15,
  bitrate: 450,
  minBitrate: 150,
  orientationMode: 2,
  degradationPreference: 1,
};

// PK length choices the host can pick before inviting (seconds)
const PK_DURATIONS = [300]; // fixed 5 minutes

// ---- Guest seats: viewers who join the host's video call (tiles on the right) ----
const MAX_GUESTS = 3; // seats at the same time (tiles stack on the right side)
const GUEST_REQUEST_TTL = 5 * 60 * 1000; // old, never-answered requests are hidden
const GUEST_JOIN_GRACE_MS = 20000; // host removes a seated guest who never showed up in the channel
// Guests publish a SMALL stream (their tile is small) → light on data for everyone.
const GUEST_VIDEO_PROFILE = {
  dimensions: { width: 360, height: 640 },
  frameRate: 15,
  bitrate: 500,
  minBitrate: 150,
  orientationMode: 2,
  degradationPreference: 1,
};
const GUEST_TILE_W = Math.round(Math.min(width * 0.27, 116));
const GUEST_TILE_H = Math.round(GUEST_TILE_W * 1.3);
const pkPanelHFixed = Math.round(Math.min((width / 2) * 1.547, height * 0.36)); // PK panel height (Tiki ratio 1.547)
const PK_BAR_H = 16; // score bar height (Tiki)
const PK_TIPS =
  "Great performance and active interaction with the audience will help you win the PK battle!      •      Send gifts to support your host and win the PK!      •      ";

// Weekly-host goal shown in the header pill + live-ended screen
const WEEKLY_TARGET_MIN = 120; // 2 ghanta = 150 stars (24 ghante ke andar kul)
// Random Match gives up after this many seconds
const MATCH_TIMEOUT_SEC = 90;
const WELCOME_TEXT =
  "Welcome to TopKing Live, where you can interact with hosts and other viewers in real time. "
  + "Please abide by our community guidelines to help us maintain a good community environment";
const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}K` : String(n || 0));

// Filter presets. `beauty` → Agora setBeautyEffectOptions,
// `color` → Agora setColorEnhanceOptions. Both change the PUBLISHED stream,
// so viewers see the filter too.
const FILTERS = [
  { id: "off", label: "Original", icon: "🚫", beauty: null, color: null },
  {
    id: "natural",
    label: "Natural",
    icon: "🌿",
    beauty: { lighteningContrastLevel: 1, lighteningLevel: 0.4, smoothnessLevel: 0.4, rednessLevel: 0.2, sharpnessLevel: 0.2 },
    color: null,
  },
  {
    id: "smooth",
    label: "Smooth",
    icon: "✨",
    beauty: { lighteningContrastLevel: 1, lighteningLevel: 0.3, smoothnessLevel: 0.85, rednessLevel: 0.15, sharpnessLevel: 0.1 },
    color: null,
  },
  {
    id: "bright",
    label: "Bright",
    icon: "☀️",
    beauty: { lighteningContrastLevel: 2, lighteningLevel: 0.75, smoothnessLevel: 0.35, rednessLevel: 0.1, sharpnessLevel: 0.2 },
    color: { strengthLevel: 0.4, skinProtectLevel: 1 },
  },
  {
    id: "rosy",
    label: "Rosy",
    icon: "🌸",
    beauty: { lighteningContrastLevel: 1, lighteningLevel: 0.45, smoothnessLevel: 0.5, rednessLevel: 0.75, sharpnessLevel: 0.1 },
    color: null,
  },
  {
    id: "vivid",
    label: "Vivid",
    icon: "🎨",
    beauty: null,
    color: { strengthLevel: 0.85, skinProtectLevel: 0.8 },
  },
  {
    id: "sharp",
    label: "Sharp",
    icon: "🔍",
    beauty: { lighteningContrastLevel: 2, lighteningLevel: 0.2, smoothnessLevel: 0.1, rednessLevel: 0.1, sharpnessLevel: 0.9 },
    color: { strengthLevel: 0.3, skinProtectLevel: 1 },
  },
];

// Extra filters (Glossy, Sunset, Clarendon, Rosy, ...) from the shared library.
// Agora only supports beauty + colour-enhance, so these are mapped to the
// closest Agora options (see toAgora() in constants/filterLibrary.js).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { liveFilters } = require("../constants/filterLibrary");
// Skip ids already defined above (e.g. "rosy") so React keys stay unique.
liveFilters().forEach((lf: any) => {
  if (!FILTERS.some((f) => f.id === lf.id)) FILTERS.push(lf);
});

// Where the "Recharge / Buy stars" button sends the user. Change to your real route.
const RECHARGE_ROUTE = "/recharge";

// HEAT FIX (LiveRoom jaisa): gift WebView (canvas) me pixel ratio 1.5 par cap.
const GIFT_WEB_PRE_JS = "try{var __r=window.devicePixelRatio||1;Object.defineProperty(window,'devicePixelRatio',{get:function(){return Math.min(__r,1.5)}})}catch(e){}true;";
const GIFT_GOLD = "#F5C451";
// Normal (non-PK) mode me gift animation kitna UPAR ho (px). Zyada upar chahiye to number badhao.
const GIFT_NORMAL_UP = 120;

// ---- Compact gift sheet pieces (same look as LiveRoom.js) ----
const GIFTS_PER_PAGE = 8; // 4 columns x 2 rows
const GIFT_PAGE_W = width - 24;
const GIFT_PAGES: any[] = (() => {
  const pages: any[] = [];
  for (let i = 0; i < gifts.length; i += GIFTS_PER_PAGE) {
    pages.push({ key: "p" + i, items: gifts.slice(i, i + GIFTS_PER_PAGE) });
  }
  return pages;
})();

const GiftCard = memo(({ item, onSend }: any) => (
  <TouchableOpacity style={styles.giftCard} activeOpacity={0.6} delayPressIn={0} onPress={() => onSend(item)}>
    <Image source={item.icon} style={{ width: 42, height: 42 }} resizeMode="contain" fadeDuration={0} />
    <Text style={styles.giftName} numberOfLines={1}>{item.name}</Text>
    <Text style={styles.giftCoin}>{item.price}</Text>
  </TouchableOpacity>
));

const GiftPage = memo(({ page, onSend }: any) => (
  <View style={{ width: GIFT_PAGE_W, flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start" }}>
    {page.items.map((item: any) => (
      <GiftCard key={item.id} item={item} onSend={onSend} />
    ))}
  </View>
));

// Quick emoji row above the chat box
const QUICK_EMOJIS = ["😂", "😍", "🔥", "👏", "🥰", "😮", "🎉", "💯"];

// Simple client-side bad-word filter (add your own words; hindi/roman ok)
const BAD_WORDS = ["fuck", "bitch", "sex", "porn", "madarchod", "bhosdi", "chutiya", "randi", "gaand", "lund"];
const cleanText = (t: string) => {
  let out = t;
  BAD_WORDS.forEach((w) => {
    out = out.replace(new RegExp(w, "gi"), "*".repeat(w.length));
  });
  return out;
};

const VOICE_ABUSE_REASON = "Gali / abuse (voice)";
const REPORT_REASONS = ["Nudity / sexual content", VOICE_ABUSE_REASON, "Abuse / harassment", "Spam / scam", "Underage user", "Other"];

const getLevelTheme = (level = 1) => {
  if (level >= 50) return { bg: "#7B1FFF", border: "#FFD700", text: "#fff", icon: "#FFD700" };
  if (level >= 40) return { bg: "#00BFFF", border: "#9EF8FF", text: "#fff", icon: "#fff" };
  if (level >= 30) return { bg: "#FF0066", border: "#FFB6C1", text: "#fff", icon: "#fff" };
  if (level >= 20) return { bg: "#FFC107", border: "#FFE082", text: "#000", icon: "#fff" };
  if (level >= 10) return { bg: "#BDBDBD", border: "#fff", text: "#fff", icon: "#fff" };
  return { bg: "#222", border: "#555", text: "#FFD700", icon: "#00E5FF" };
};

// Same idea as LiveRoom.js's getLevelFrame — swap for your real frame
// assets, or ignore: the frame simply won't render if the require fails.
const getLevelFrame = (level = 1) => {
  try {
    if (level >= 50) return require("../assets/frames/lv50.png");
    if (level >= 40) return require("../assets/frames/lv40.png");
    if (level >= 30) return require("../assets/frames/lv30.png");
    if (level >= 20) return require("../assets/frames/lv20.png");
    if (level >= 10) return require("../assets/frames/lv10.png");
  } catch (e) {
    return null;
  }
  return null;
};

const fmtClock = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

// ---------- Agora token (same endpoint LiveRoom.js uses) ----------
// Why error 110 happened: Render's free tier sleeps. The first request after
// a sleep can take 20-50s, the old 8s timeout aborted it, we joined with an
// EMPTY token and Agora answered "110 = invalid token".
// Fix: warm the server up early, use a long timeout, retry a few times, and
// only join without a token as a last resort.
const TOKEN_TIMEOUT_MS = 25000;
const TOKEN_RETRIES = 3;

const warmUpBackend = () => {
  // any request wakes the server; result is ignored
  fetch(TOKEN_ENDPOINT.replace(/\/token$/, "/"), { method: "GET" }).catch(() => {});
};

const fetchAgoraTokenOnce = async (channel: string, uid: number) => {
  const firebaseUser = auth?.currentUser;
  if (!firebaseUser) return { token: null as string | null, uid };
  // cached ID token (no forced refresh = no extra round trip)
  const idToken = await firebaseUser.getIdToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${TOKEN_ENDPOINT}?channel=${encodeURIComponent(channel)}&uid=${uid}`,
      {
        headers: { Authorization: `Bearer ${idToken}`, Accept: "application/json" },
        signal: controller.signal,
      }
    );
    const tokenData = await response.json();
    if (response.ok && tokenData?.success && tokenData?.token) {
      return { token: tokenData.token as string, uid: Number(tokenData.uid) || uid };
    }
    throw new Error("token response not ok");
  } finally {
    clearTimeout(timeoutId);
  }
};

// Never throws. `isCancelled` stops the retry loop when the screen closes.
const fetchAgoraToken = async (
  channel: string,
  uid: number,
  isCancelled: () => boolean = () => false,
  onRetry?: (attempt: number) => void
) => {
  for (let attempt = 1; attempt <= TOKEN_RETRIES; attempt++) {
    if (isCancelled()) break;
    try {
      return await fetchAgoraTokenOnce(channel, uid);
    } catch (e) {
      console.log(`AGORA TOKEN FETCH FAILED (try ${attempt}/${TOKEN_RETRIES}):`, e);
      if (attempt < TOKEN_RETRIES) {
        onRetry && onRetry(attempt);
        await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
    }
  }
  return { token: null as string | null, uid };
};

// ============================================================
// Small memoized components that live OUTSIDE VideoLive so a
// re-render of the big screen doesn't restart them.
// ============================================================

// Gift button animation (HEAT FIX): pehle loop me 24/7 chalta tha (30 min = lagatar GPU/CPU).
// Ab 1 baar chalta hai, phir 4 sec rukta hai -> duty cycle ~80% kam.
const GiftButtonLottie = memo(() => {
  const ref = useRef<any>(null);
  const timer = useRef<any>(null);
  useEffect(() => {
    ref.current?.play();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  return (
    <LottieView
      ref={ref}
      source={require("../assets/animations/giftButton.json")}
      autoPlay={false}
      loop={false}
      renderMode="HARDWARE"
      hardwareAccelerationAndroid
      cacheComposition
      onAnimationFinish={() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => ref.current?.play(), 4000);
      }}
      style={{ width: 46, height: 46 }}
    />
  );
});

// Live timer — only this tiny <Text> re-renders every second.
const LiveTimer = memo(({ startTime }: { startTime: number | null }) => {
  const [label, setLabel] = useState("00:00:00");

  useEffect(() => {
    if (!startTime) return;
    const tick = () => {
      const diff = Math.max(0, Date.now() - startTime);
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setLabel(
        `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <Text style={styles.liveTagText}>LIVE {label}</Text>;
});

// Weekly-host minutes pill ("12/30 min") — own state, refreshes every 15s.
const WeeklyMinutesPill = memo(({ startTime }: { startTime: number | null }) => {
  const [mins, setMins] = useState(0);
  useEffect(() => {
    if (!startTime) return;
    const tick = () => setMins(Math.max(0, Math.floor((Date.now() - startTime) / 60000)));
    tick();
    const i = setInterval(tick, 15000);
    return () => clearInterval(i);
  }, [startTime]);
  const shown = Math.min(mins, WEEKLY_TARGET_MIN);
  return (
    <View style={styles.minPill}>
      <View style={[styles.minFill, { width: `${(shown / WEEKLY_TARGET_MIN) * 100}%` }]} />
      <Text style={styles.minTxt}>
        {shown}/{WEEKLY_TARGET_MIN} min
      </Text>
    </View>
  );
});

// "00:01" counter for Random Match
const MatchTimer = memo(({ startAt, style }: any) => {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = () => setSec(Math.max(0, Math.floor((Date.now() - startAt) / 1000)));
    t();
    const i = setInterval(t, 1000);
    return () => clearInterval(i);
  }, [startAt]);
  return <Text style={style}>{fmtClock(sec)}</Text>;
});

// Circular progress ring built from two clipped half-rings (no SVG needed).
const ProgressRing = ({ pct, size = 78, stroke = 7, color = "#FFD700", track = "rgba(255,255,255,0.18)", children }: any) => {
  const p = Math.max(0, Math.min(100, pct));
  const deg = p * 3.6;
  const half = size / 2;
  const circle: any = { position: "absolute", width: size, height: size, borderRadius: half, borderWidth: stroke };
  return (
    <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
      <View style={[circle, { borderColor: track }]} />
      <View style={{ position: "absolute", left: half, top: 0, width: half, height: size, overflow: "hidden" }}>
        <View
          style={[
            circle,
            {
              left: -half,
              top: 0,
              borderColor: "transparent",
              borderTopColor: color,
              borderRightColor: color,
              transform: [{ rotate: `${Math.min(deg, 180) - 135}deg` }],
            },
          ]}
        />
      </View>
      <View style={{ position: "absolute", left: 0, top: 0, width: half, height: size, overflow: "hidden" }}>
        <View
          style={[
            circle,
            {
              left: 0,
              top: 0,
              borderColor: "transparent",
              borderBottomColor: color,
              borderLeftColor: color,
              transform: [{ rotate: `${Math.max(deg, 180) - 315}deg` }],
            },
          ]}
        />
      </View>
      {children}
    </View>
  );
};

// ============================================================
// Tiki-style gift banner row: magenta pill (avatar + name + "Sent"), bada gift icon
// pill ke kinare par overlap, aur bada italic "x1". Har naye tap par x count pop karta hai.
// ============================================================
const ComboRow = memo(({ data }: any) => {
  const tx = useRef(new Animated.Value(-140)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const mounted = useRef(false);
  const gd = gifts.find((g: any) => String(g.id) === String(data.giftId));

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      Animated.spring(tx, { toValue: 0, speed: 12, bounciness: 7, useNativeDriver: true }).start();
      return;
    }
    pop.setValue(1.6);
    Animated.spring(pop, { toValue: 1, speed: 28, bounciness: 12, useNativeDriver: true }).start();
  }, [data.seq]);

  return (
    <Animated.View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
        transform: [{ translateX: tx }],
      }}
    >
      <LinearGradient
        colors={["#E83CA6", "#C2289F", "rgba(150,40,170,0.78)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          width: width * 0.58,
          height: 58,
          borderRadius: 29,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 4,
          paddingRight: 40,
        }}
      >
        <Image
          source={{ uri: data.senderImg || STABLE_AVATAR }}
          style={{
            width: 50,
            height: 50,
            borderRadius: 25,
            borderWidth: 2,
            borderColor: "rgba(255,255,255,0.9)",
            backgroundColor: "#2a2b38",
          }}
        />
        <View style={{ marginLeft: 8, flexShrink: 1 }}>
          <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
            {data.senderName}
          </Text>
          <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.92)", fontSize: 13, marginTop: 1 }}>
            Sent
          </Text>
        </View>
      </LinearGradient>

      {gd?.icon ? (
        <Image
          source={gd.icon}
          style={{ width: 64, height: 64, resizeMode: "contain", marginLeft: -44 }}
        />
      ) : (
        <View style={{ width: 20 }} />
      )}

      <Animated.Text
        style={{
          color: "#fff",
          fontSize: 38,
          fontWeight: "900",
          fontStyle: "italic",
          marginLeft: 8,
          textShadowColor: "rgba(0,0,0,0.55)",
          textShadowOffset: { width: 1, height: 2 },
          textShadowRadius: 3,
          transform: [{ scale: pop }],
        }}
      >
        x{data.count || 1}
      </Animated.Text>
    </Animated.View>
  );
});

// ============================================================
// GiftLayer (LiveRoom.js ka SAME): full-screen gift animation + "X send @Y x3" banner.
// Saari gift state (activeGift, combo, timers, banner animation) is component ke ANDAR hai,
// VideoLive sirf ref.current.play / playDeferred / showCombo bulata hai -> gift se poori
// screen re-render nahi hoti.
// ============================================================
const GiftLayer = memo(forwardRef(function GiftLayer({ comboTop, animTop, animSize }: any, ref: any) {
  const [activeGift, setActiveGift] = useState<any>(null);
  const [activeMeta, setActiveMeta] = useState<any>(null); // kisne bheja (animation ke upar dikhta hai)
  const [playKey, setPlayKey] = useState(0);
  // Tiki: max 2 banners ek saath (alag-alag senders), har sender ka apna x1, x2, x3...
  const [combos, setCombos] = useState<any[]>([]);
  const comboSeqRef = useRef(0);

  const giftTimerRef = useRef<any>(null);
  const comboTimersRef = useRef<any>({});
  const deferTimerRef = useRef<any>(null);

  // 3D (web:) gift: timer WebView load hone (onLoadEnd) par shuru hota hai
  const WEB_LOAD_GRACE = 9000;
  const durationRef = useRef(5000);

  const armHideTimer = (ms: number) => {
    if (giftTimerRef.current) clearTimeout(giftTimerRef.current);
    giftTimerRef.current = setTimeout(() => {
      giftTimerRef.current = null;
      setActiveGift(null);
      setActiveMeta(null);
    }, ms);
  };

  const doPlay = (animation: any, duration?: number, meta?: any) => {
    if (!animation) return;
    durationRef.current = duration || 5000;
    setActiveGift(animation);
    setActiveMeta(meta || null);
    setPlayKey((k) => k + 1);
    const isWeb = typeof animation === "string" && animation.startsWith("web:");
    armHideTimer(isWeb ? WEB_LOAD_GRACE + durationRef.current : durationRef.current);
  };

  const onWebGiftLoaded = () => {
    armHideTimer(durationRef.current);
  };

  useImperativeHandle(ref, () => ({
    play: doPlay,
    // Real-live behaviour: jab tak gift tap hote rahein, full-screen animation nahi chalti
    // (sirf combo banner x1, x2, x3...). Tap ruke -> SIRF last gift ki animation chalti hai.
    playDeferred(animation: any, duration?: number, delay = 600, meta?: any) {
      if (!animation) return;
      if (deferTimerRef.current) clearTimeout(deferTimerRef.current);
      deferTimerRef.current = setTimeout(() => {
        deferTimerRef.current = null;
        doPlay(animation, duration, meta);
      }, delay);
    },
    showCombo(data: any, onEnd?: () => void, ms = 2200) {
      const key = String(data?.senderName || "user");
      comboSeqRef.current += 1;
      const entry = { key, data: { ...data, seq: comboSeqRef.current } };
      setCombos((prev) => {
        const i = prev.findIndex((c) => c.key === key);
        if (i >= 0) {
          const n = prev.slice();
          n[i] = entry; // wahi jagah par update -> x count pop
          return n;
        }
        return [...prev, entry].slice(-2);
      });
      if (comboTimersRef.current[key]) clearTimeout(comboTimersRef.current[key]);
      comboTimersRef.current[key] = setTimeout(() => {
        delete comboTimersRef.current[key];
        setCombos((prev) => prev.filter((c) => c.key !== key));
        if (onEnd) onEnd();
      }, ms);
    },
  }), []);

  useEffect(() => () => {
    if (giftTimerRef.current) clearTimeout(giftTimerRef.current);
    Object.values(comboTimersRef.current).forEach((t: any) => clearTimeout(t));
    if (deferTimerRef.current) clearTimeout(deferTimerRef.current);
  }, []);

  const webSource = React.useMemo(
    () =>
      typeof activeGift === "string" && activeGift.startsWith("web:")
        ? { html: giftHtml(activeGift.slice(4)), baseUrl: "https://localhost" }
        : null,
    [activeGift]
  );

  return (
    <>
      {activeGift ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            // PK mode: chhota gift, banner ke NICHE (animTop). Normal mode: full-screen center.
            ...(animTop != null
              ? { top: animTop, left: 0, right: 0, height: animSize || 200 }
              : { top: -GIFT_NORMAL_UP, left: 0, right: 0, bottom: GIFT_NORMAL_UP }),
            justifyContent: "center",
            alignItems: "center",
            zIndex: 99999,
            elevation: 99999,
          }}
        >
          <View
            style={
              animTop != null
                ? {
                    width: 350,
                    height: 350,
                    justifyContent: "center",
                    alignItems: "center",
                    transform: [{ scale: (animSize || 200) / 350 }],
                  }
                : { justifyContent: "center", alignItems: "center" }
            }
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
              style={animTop != null ? { width: 350, height: 350, backgroundColor: "transparent" } : { width: width, height: width * 1.3, backgroundColor: "transparent" }}
              containerStyle={{ backgroundColor: "transparent" }}
              androidLayerType="hardware"
              scrollEnabled={false}
              pointerEvents="none"
              injectedJavaScriptBeforeContentLoaded={GIFT_WEB_PRE_JS}
              onLoadEnd={onWebGiftLoaded}
            />
          ) : isImgGift(activeGift) ? (
            <GiftImage key={playKey} name={activeGift.slice(4)} />
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
        </View>
      ) : null}

      {activeGift && activeMeta && activeMeta.senderName ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: height * 0.17,
            alignSelf: "center",
            left: 0,
            right: 0,
            alignItems: "center",
            zIndex: 100000,
            elevation: 100000,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 5,
              paddingLeft: 5,
              paddingRight: 14,
              borderRadius: 24,
              backgroundColor: "rgba(0,0,0,0.6)",
              borderWidth: 1,
              borderColor: "rgba(255,105,180,0.85)",
              maxWidth: width * 0.9,
            }}
          >
            <Image
              source={{ uri: activeMeta.senderImg || STABLE_AVATAR }}
              style={{ width: 30, height: 30, borderRadius: 15, marginRight: 8, backgroundColor: "#2a2b38" }}
            />
            <Text numberOfLines={1} style={{ color: "#fff", fontSize: 13, flexShrink: 1 }}>
              <Text style={{ fontWeight: "bold" }}>{activeMeta.senderName}</Text>
              {" "}sent{" "}
              {activeMeta.giftName ? <Text style={{ color: "#FFE600", fontWeight: "bold" }}>{activeMeta.giftName}</Text> : "a gift"}
              {activeMeta.receiverName ? <Text>{" "}to <Text style={{ color: "#FFE600", fontWeight: "bold" }}>@{activeMeta.receiverName}</Text></Text> : null}
            </Text>
          </View>
        </View>
      ) : null}

      {combos.length > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: comboTop != null ? comboTop : height * 0.25,
            left: 10,
            zIndex: 99998,
            elevation: 99998,
          }}
        >
          {combos.map((c: any) => (
            <ComboRow key={c.key} data={c.data} />
          ))}
        </View>
      ) : null}
    </>
  );
}));

// Pending (abhi write na hue) gift kharcha: chhota store + chhota component (LiveRoom jaisa).
const giftPendingStore: any = {
  v: 0,
  subs: new Set<any>(),
  set(n: number) {
    giftPendingStore.v = n;
    giftPendingStore.subs.forEach((f: any) => f(n));
  },
};
const GiftBalance = memo(({ stars }: any) => {
  const [pending, setPending] = useState<number>(giftPendingStore.v);
  useEffect(() => {
    setPending(giftPendingStore.v);
    giftPendingStore.subs.add(setPending);
    return () => { giftPendingStore.subs.delete(setPending); };
  }, []);
  return (
    <Text style={{ color: GIFT_GOLD, fontSize: 15, fontWeight: "bold", marginLeft: 4 }}>
      {Math.max(0, stars - pending)}
    </Text>
  );
});

// One floating heart (tap-to-like). Native-driver only → cheap.
const HEART_COLORS = ["#FF3D71", "#FF6B9D", "#FFB300", "#00E5FF", "#B388FF", "#69F0AE"];
const FloatingHeart = memo(({ id, x, emoji, color, onDone }: any) => {
  const prog = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(prog, { toValue: 1, duration: 2200 + Math.random() * 600, useNativeDriver: true }).start(() =>
      onDone(id)
    );
  }, []);
  return (
    <Animated.Text
      pointerEvents="none"
      style={{
        position: "absolute",
        bottom: 0,
        right: x,
        fontSize: 26,
        color,
        opacity: prog.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 0.9, 0] }),
        transform: [
          { translateY: prog.interpolate({ inputRange: [0, 1], outputRange: [0, -260] }) },
          { translateX: prog.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, x % 2 ? 22 : -22, x % 2 ? -12 : 12] }) },
          { scale: prog.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.4, 1.15, 0.9] }) },
        ],
      }}
    >
      {emoji}
    </Animated.Text>
  );
});

// All floating hearts live HERE (own state). Tapping the screen or receiving
// likes only re-renders this tiny layer, never the whole live screen.
const HeartsLayer = memo(
  forwardRef(({ bottom }: any, ref: any) => {
    const [hearts, setHearts] = useState<any[]>([]);
    const idRef = useRef(0);
    const remove = useCallback((id: number) => setHearts((prev) => prev.filter((h) => h.id !== id)), []);

    useImperativeHandle(
      ref,
      () => ({
        spawn: (n: number) => {
          const faces = ["❤️", "💖", "💗", "💜", "🧡", "😍"];
          setHearts((prev) => {
            if (prev.length >= 16) return prev;
            const next = prev.slice();
            for (let i = 0; i < n && next.length < 16; i++) {
              idRef.current += 1;
              next.push({
                id: idRef.current,
                x: Math.floor(Math.random() * 60) + 6,
                emoji: faces[Math.floor(Math.random() * faces.length)],
                color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
              });
            }
            return next;
          });
        },
      }),
      []
    );

    return (
      <View pointerEvents="none" style={[styles.heartsLayer, { bottom }]}>
        {hearts.map((h) => (
          <FloatingHeart key={h.id} id={h.id} x={h.x} emoji={h.emoji} color={h.color} onDone={remove} />
        ))}
      </View>
    );
  })
);

// One chat row: join / gift / normal message (same three types as LiveRoom.js) — Tiki pill style.
const ChatItem = memo(({ chat, onUser }: any) => {
  const theme = getLevelTheme(chat.level || 1);
  const openUser = () =>
    onUser &&
    (chat.senderId || chat.uid) &&
    onUser({
      uid: chat.senderId || chat.uid,
      name: chat.senderName,
      username: chat.username,
      img: chat.userImg,
      level: chat.level,
      verified: chat.verified,
      verifiedColor: chat.verifiedColor,
    });

  if (chat.type === "join") {
    return (
      <View style={styles.tkRow}>
        <TouchableOpacity activeOpacity={0.8} onPress={openUser} style={styles.tkPill}>
          <Text style={styles.tkTxt}>{chat.senderName}</Text>
          <UserTick uid={chat.senderId || chat.uid} verified={!!(chat.verified)} verifiedColor={chat?.verifiedColor} size={15} />
          <Text style={styles.tkTxt}> has joined</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (chat.type === "gift") {
    const gd = gifts.find((g: any) => String(g.id) === String(chat.giftId));
    return (
      <View style={styles.tkRow}>
        <TouchableOpacity activeOpacity={0.8} onPress={openUser} style={styles.tkPill}>
          <Ionicons name="megaphone" size={14} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.tkTxt}>{chat.senderName}</Text>
          <UserTick uid={chat.senderId || chat.uid} verified={!!(chat.verified)} verifiedColor={chat?.verifiedColor} size={15} />
          <Text style={styles.tkTxt}> sent {chat.qty || 1} </Text>
          {gd?.icon ? (
            <Image source={gd.icon} style={{ width: 22, height: 22, resizeMode: "contain" }} />
          ) : (
            <Text style={styles.tkGiftName}>{chat.giftName}</Text>
          )}
          <Text style={styles.tkTxt}> to {chat.receiverName ? chat.receiverName : "the host"}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.tkRow}>
      <TouchableOpacity activeOpacity={0.85} onPress={openUser} style={[styles.tkPill, { flexWrap: "nowrap", alignItems: "flex-start" }]}>
        <View style={{ flexShrink: 1 }}>
          {/* line 1: [HOST/MOD]  name  tick  level  (same order as LiveRoom) */}
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
            {chat.role === "host" && (
              <View style={[styles.roleTag, { backgroundColor: "#F71084", marginLeft: 0, marginRight: 5 }]}>
                <Text style={styles.roleTagTxt}>HOST</Text>
              </View>
            )}
            {chat.role === "mod" && (
              <View style={[styles.roleTag, { backgroundColor: "#2D9CFF", marginLeft: 0, marginRight: 5 }]}>
                <Text style={styles.roleTagTxt}>MOD</Text>
              </View>
            )}
            <Text style={styles.tkName}>{chat.senderName}</Text>
            <UserTick uid={chat.senderId || chat.uid} verified={!!(chat.verified)} verifiedColor={chat?.verifiedColor} size={14} />
            <View
              style={[
                styles.levelBadge,
                { marginLeft: 6, marginRight: 0, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: theme.bg, borderColor: theme.border },
              ]}
            >
              <MaterialCommunityIcons name="diamond-stone" size={8} color={theme.icon} />
              <Text style={[styles.levelText, { color: theme.text, fontSize: 8 }]}>LV {chat.level || 1}</Text>
            </View>
          </View>
          {/* line 2: message */}
          <Text style={styles.tkTxt}>{chat.message}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}, (prev: any, next: any) => prev.chat.id === next.chat.id && prev.onUser === next.onUser);
// SMOOTH: chat message kabhi edit nahi hota -> sirf id compare, purani rows re-render nahi.

const chatKeyExtractor = (item: any, index: number) => item.id || String(index);

// Round tool button (right side column)
const ToolBtn = ({ icon, label, onPress, active, badge }: any) => (
  <TouchableOpacity style={styles.toolWrap} onPress={onPress} activeOpacity={0.7}>
    <View style={[styles.toolBtn, active && styles.toolBtnActive]}>{icon}</View>
    <Text style={styles.toolLabel}>{label}</Text>
    {badge ? <View style={styles.toolBadge} /> : null}
  </TouchableOpacity>
);

// ---------- PK countdown pill ----------
// Own state → only this tiny pill re-renders every tick (not the whole screen).
// Last 10 seconds: turns red and pulses, like every real PK.
const PkTimerPill = memo(({ endAt, result }: { endAt: number; result?: boolean }) => {
  const calc = () => Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  const [left, setLeft] = useState(calc);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setLeft(calc());
    const i = setInterval(() => setLeft(calc()), 250);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endAt]);

  const urgent = !result && left > 0 && left <= 10;
  useEffect(() => {
    if (!urgent) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 320, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 320, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [urgent]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pkTimerPill, urgent && { backgroundColor: "rgba(220,38,38,0.95)" }, { transform: [{ scale: pulse }] }]}
    >
      {!result && (
        <Text style={styles.pkTimerPk}>
          <Text style={{ color: "#35C8FF" }}>P</Text>
          <Text style={{ color: "#FF3D9A" }}>K</Text>
        </Text>
      )}
      <Text style={styles.pkTimerTxt}>{fmtClock(left)}</Text>
    </Animated.View>
  );
});

// ---------- Tiki-style PK parts ----------
// Centre graphic: blue glove  ⚡  pink glove with a small "PK" plate (pulses softly).
const PkGlovesVs = memo(({ startAt }: { startAt?: number }) => {
  const beat = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current; // pop-in
  const fade = useRef(new Animated.Value(1)).current;
  const [show, setShow] = useState(true);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    Animated.spring(enter, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
    // visible ~3s from the PK start (late joiners only see the remainder), then fade away
    const left = Math.max(0, 3000 - (Date.now() - (startAt || Date.now())));
    const t = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => setShow(false));
    }, left);
    return () => {
      loop.stop();
      clearTimeout(t);
    };
  }, []);
  if (!show) return null;
  const sc = beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  const pop = enter.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  return (
    <Animated.View pointerEvents="none" style={[styles.pkVsStage, { opacity: fade, transform: [{ scale: Animated.multiply(sc, pop) }] }]}>
      <Ionicons name="flash" size={104} color="rgba(255,225,60,0.95)" style={styles.pkVsBolt} />
      <MaterialCommunityIcons
        name="boxing-glove"
        size={54}
        color="#2F8CFF"
        style={[styles.pkGlove, { left: 0, transform: [{ scaleX: -1 }] }]}
      />
      <MaterialCommunityIcons name="boxing-glove" size={54} color="#FF2D75" style={[styles.pkGlove, { right: 0 }]} />
      <View style={styles.pkVsPlate}>
        <Text style={styles.pkVsPlateTxt}>
          <Text style={{ color: "#2F8CFF" }}>P</Text>
          <Text style={{ color: "#FF2D75" }}>K</Text>
        </Text>
      </View>
    </Animated.View>
  );
});

// Big result on each panel after the PK ends (Tiki style): winner = crown + gold WIN + confetti, loser = LOSE.
const CONFETTI_COLORS = ["#FFD700", "#FF3D9A", "#35C8FF", "#7CFF6B", "#FF8A00", "#B388FF"];
const PkConfetti = memo(() => {
  const N = 14;
  const vals = useRef(Array.from({ length: N }, () => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = vals.map((v, i) => {
      const l = Animated.loop(
        Animated.sequence([
          Animated.delay((i % 7) * 260),
          Animated.timing(v, { toValue: 1, duration: 1800 + (i % 4) * 300, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
      l.start();
      return l;
    });
    return () => loops.forEach((l) => l.stop());
  }, []);
  const pw = width / 2;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {vals.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            top: -12,
            left: ((i * 37) % 100) / 100 * (pw - 8),
            width: 6,
            height: 10,
            borderRadius: 1.5,
            backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            opacity: v.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, pkPanelHFixed + 20] }) },
              { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${360 + i * 40}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
});

// Tiki trophy (copied from the real screenshots).
// WIN : blue-purple dotted ring, pink disc, gold cup with star, gold ribbon with swallow-tails + pink gems, gold sparkle.
// LOSE: everything pale silver-blue, same shape, small cloud on the top-right.
// DRAW: blue version.
const TrophyBadge = memo(({ kind, size = 84 }: { kind: "win" | "lose" | "draw"; size?: number }) => {
  const win = kind === "win";
  const draw = kind === "draw";
  const ring = win ? ["#6F6BFF", "#8B5CF6"] : draw ? ["#5EA8FF", "#9B7BFF"] : ["#C4CAE6", "#A3ABD0"];
  const disc = win ? ["#FF9DB0", "#EE5F7E"] : draw ? ["#9CC8FF", "#5E9BFF"] : ["#B3BAD9", "#9AA3C8"];
  const cup = win ? "#FFC928" : draw ? "#F2F7FF" : "#EEF1FA";
  const starCol = win ? "#FFE98A" : "#D5DBEF";
  const ribbon = win ? ["#FFDD55", "#F5A81C"] : draw ? ["#9FD0FF", "#4F8DFF"] : ["#D2DBF3", "#B3BFE3"];
  const tail = win ? "#E8920F" : draw ? "#3E78E6" : "#98A5CF";
  const label = win ? "WIN" : draw ? "DRAW" : "LOSE";
  const W = size * 1.3;
  const innerSz = size * 0.8;
  const rh = size * 0.27; // ribbon height
  const dots = Array.from({ length: 12 }, (_, i) => i);
  return (
    <View style={{ width: W, alignItems: "center" }}>
      {/* ring + disc + cup */}
      <LinearGradient
        colors={ring}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: size, height: size, borderRadius: size / 2, justifyContent: "center", alignItems: "center" }}
      >
        {dots.map((i) => {
          const ang = (i / dots.length) * Math.PI * 2;
          const r = size * 0.45;
          return (
            <View
              key={i}
              style={{
                position: "absolute",
                width: size * 0.035,
                height: size * 0.035,
                borderRadius: size,
                backgroundColor: "rgba(255,255,255,0.85)",
                left: size / 2 + r * Math.cos(ang) - size * 0.0175,
                top: size / 2 + r * Math.sin(ang) - size * 0.0175,
              }}
            />
          );
        })}
        <LinearGradient
          colors={disc}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={{ width: innerSz, height: innerSz, borderRadius: innerSz / 2, justifyContent: "center", alignItems: "center" }}
        >
          <Ionicons name="trophy" size={size * 0.56} color={cup} style={{ marginTop: -size * 0.06 }} />
          <Ionicons
            name="star"
            size={size * 0.15}
            color={starCol}
            style={{ position: "absolute", top: innerSz * 0.22 }}
          />
        </LinearGradient>
      </LinearGradient>

      {/* sparkle (win) / cloud (lose) */}
      {win && (
        <Ionicons name="star" size={size * 0.24} color="#FFD84D" style={{ position: "absolute", top: -size * 0.06, left: W * 0.08 }} />
      )}
      {!win && !draw && (
        <>
          <Ionicons name="cloud" size={size * 0.3} color="#F4F6FF" style={{ position: "absolute", top: size * 0.62, right: W * 0.02 }} />
          <Ionicons name="star" size={size * 0.12} color="#8E9BC9" style={{ position: "absolute", top: size * 0.02, left: W * 0.14 }} />
        </>
      )}

      {/* ribbon with swallow-tails */}
      <View style={{ marginTop: -size * 0.24, width: W, height: rh * 1.25, alignItems: "center" }}>
        <View style={{ position: "absolute", left: 0, top: rh * 0.25, width: W * 0.28, height: rh, backgroundColor: tail, borderRadius: 2 }} />
        <View style={{ position: "absolute", right: 0, top: rh * 0.25, width: W * 0.28, height: rh, backgroundColor: tail, borderRadius: 2 }} />
        {/* swallow-tail notches */}
        <View style={{ position: "absolute", left: -rh * 0.28, top: rh * 0.25 + rh * 0.22, width: rh * 0.56, height: rh * 0.56, backgroundColor: "#1B1545", transform: [{ rotate: "45deg" }] }} />
        <View style={{ position: "absolute", right: -rh * 0.28, top: rh * 0.25 + rh * 0.22, width: rh * 0.56, height: rh * 0.56, backgroundColor: "#1B1545", transform: [{ rotate: "45deg" }] }} />
        <LinearGradient
          colors={ribbon}
          style={{ width: W * 0.82, height: rh, borderRadius: 3, justifyContent: "center", alignItems: "center" }}
        >
          <Text
            style={{
              color: "#fff",
              fontSize: size * 0.21,
              fontWeight: "900",
              fontStyle: "italic",
              letterSpacing: 0.3,
              textShadowColor: win ? "rgba(160,80,0,0.55)" : "rgba(80,90,140,0.5)",
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 2,
            }}
          >
            {label}
          </Text>
        </LinearGradient>
        {win && (
          <>
            <View style={{ position: "absolute", left: W * 0.1, top: -rh * 0.1, width: size * 0.1, height: size * 0.1, borderRadius: size, backgroundColor: "#FF5C8A" }} />
            <View style={{ position: "absolute", right: W * 0.1, top: -rh * 0.1, width: size * 0.1, height: size * 0.1, borderRadius: size, backgroundColor: "#FF5C8A" }} />
          </>
        )}
      </View>
    </View>
  );
});

const resultKind = (r?: string): "win" | "lose" | "draw" => (r === "win" ? "win" : r === "draw" ? "draw" : "lose");

// Big trophy in the middle for the first ~3.5s after the PK ends (Tiki), then it shrinks away.
const PkCenterTrophy = memo(({ result, endedAt }: { result?: string; endedAt?: number }) => {
  const pop = useRef(new Animated.Value(0)).current;
  const [show, setShow] = useState(true);
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
    const left = Math.max(0, 3500 - (Date.now() - (Number(endedAt) || Date.now())));
    const t = setTimeout(() => {
      Animated.timing(pop, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setShow(false));
    }, left);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!show || !result) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pkCenterTrophy,
        { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] },
      ]}
    >
      <TrophyBadge kind={resultKind(result)} size={92} />
    </Animated.View>
  );
});

// Small WIN / LOSE trophy above the seats of each panel (appears after the big one is gone) + confetti for the winner.
const PkPanelResult = memo(({ result, endedAt }: { result?: string; endedAt?: number }) => {
  const pop = useRef(new Animated.Value(0)).current;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const left = Math.max(0, 3500 - (Date.now() - (Number(endedAt) || Date.now())));
    const t = setTimeout(() => {
      setReady(true);
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
    }, left);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!result) return null;
  const kind = resultKind(result);
  return (
    <View pointerEvents="none" style={styles.pkResultWrapNew}>
      {kind === "win" && !ready && <PkConfetti />}
      {ready && (
        <Animated.View
          style={[
            styles.pkPanelTrophy,
            { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] },
          ]}
        >
          <TrophyBadge kind={kind} size={48} />
        </Animated.View>
      )}
    </View>
  );
});

// ---------- Last 10 seconds: BIG centre countdown 10 9 8 ... 1 (Tiki) ----------
const PkFinalCountdown = memo(({ endAt }: { endAt: number }) => {
  const calc = () => Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  const [left, setLeft] = useState(calc);
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    setLeft(calc());
    const i = setInterval(() => setLeft(calc()), 250);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endAt]);
  const show = left > 0 && left <= 10;
  useEffect(() => {
    if (!show) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
  }, [left, show]);
  if (!show) return null;
  const hot = left <= 3;
  return (
    <View pointerEvents="none" style={styles.pkFinalWrap}>
      <Animated.Text
        style={[
          styles.pkFinalNum,
          hot && { color: "#FF3B3B" },
          {
            opacity: pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) }],
          },
        ]}
      >
        {left}
      </Animated.Text>
    </View>
  );
});

// ---------- LOSER punishment (shown on the losing panel for PK_RESULT_SHOW_MS) ----------
// BOMB drops on the face -> fuse burns -> BOOM (fireball, shock ring, sparks, flash) ->
// face turns black, burnt hair, eyes cry (tears), moustache + beard appear, mouth bawls. No emoji, all drawn with shapes.
// Face TRACKING: the losing host's Agora face detection (onFacePositionChanged) is sent through
// Firestore (rooms/{id}.pk.face, fractions 0..1) and the whole face group follows it smoothly.
// Face data na mile (device unsupported) → fixed jagah par dikhta hai.
const FACE_PAD = 1.35; // tracked face rect x yeh = kale chehre ka size (kaan/sir cover)
const FACE_SMOOTH_MS = 200; // movement smoothing
const FACE_FALLBACK_Y = 0.36; // face data na ho to panel height ka fraction
const FACE_FALLBACK_W = 0.5; // face data na ho to panel width ka fraction
const FACE_FLIP_X = false; // agar mooch/aansu left-right ULTE chalein to true karo

const Tear = ({ x, y, fall, delay }: { x: number; y: number; fall: number; delay: number }) => {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: x - 5,
        top: y,
        width: 10,
        height: 14,
        borderTopLeftRadius: 5,
        borderTopRightRadius: 5,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
        backgroundColor: "#5CC8FF",
        borderWidth: 1,
        borderColor: "#BFE9FF",
        opacity: t.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 0.9, 0] }),
        transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, fall] }) }],
      }}
    />
  );
};

// face = { cx, cy, w, h, ar } (fractions of the camera image, ar = image width / height)
// mirror = true when this panel is the host's OWN local preview on the front camera
const FW = 100; // design units of the face group (it is scaled to the real face)
const FH = 112;
const BOMB_BOOM_AT = 1100; // ms: bomb sits on the face, fuse burns, then BOOM

// Smoke puff that keeps rising from the burnt face after the blast
const Smoke = memo(({ x, size, start }: { x: number; size: number; start: number }) => {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const seq = Animated.sequence([
      Animated.delay(start),
      Animated.loop(
        Animated.sequence([
          Animated.timing(t, { toValue: 1, duration: 1900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ),
    ]);
    seq.start();
    return () => seq.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: x - size / 2,
        top: FH * 0.12,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "rgba(70,64,64,0.8)",
        opacity: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.85, 0] }),
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -FH * 0.95] }) },
          { translateX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 6, -4] }) },
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.7] }) },
        ],
      }}
    />
  );
});

// flying spark of the blast
const SPARKS = Array.from({ length: 12 }, (_, i) => ({
  ang: (i / 12) * Math.PI * 2 + (i % 2) * 0.16,
  dist: FW * (0.78 + (i % 3) * 0.24),
  size: 4 + (i % 3) * 1.6,
  color: ["#FFE066", "#FF9F1C", "#FFFFFF"][i % 3],
}));
const Spark = memo(({ boom, ang, dist, size, color }: any) => (
  <Animated.View
    style={{
      position: "absolute",
      left: FW / 2 - size / 2,
      top: FH / 2 - size,
      width: size,
      height: size * 2.2,
      borderRadius: size,
      backgroundColor: color,
      opacity: boom.interpolate({ inputRange: [0, 0.05, 0.7, 1], outputRange: [0, 1, 0.9, 0] }),
      transform: [
        { translateX: boom.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(ang) * dist] }) },
        { translateY: boom.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(ang) * dist] }) },
        { rotate: `${(ang * 180) / Math.PI + 90}deg` },
        { scaleY: boom.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.6, 0.5] }) },
      ],
    }}
  />
));

// burnt, standing-up hair spikes along the top of the face oval
const HAIR = [0.15, 0.27, 0.39, 0.5, 0.61, 0.73, 0.85];
const HairSpike = ({ u, i }: { u: number; i: number }) => {
  const t = (u - 0.5) / 0.5; // -1 .. 1
  const baseY = (FH / 2) * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
  const h = FH * (0.2 + (i % 3) * 0.06);
  const w = FW * 0.07;
  return (
    <View
      style={{
        position: "absolute",
        left: u * FW - w,
        top: baseY - h * 0.7,
        width: 0,
        height: 0,
        borderLeftWidth: w,
        borderRightWidth: w,
        borderBottomWidth: h,
        borderLeftColor: "transparent",
        borderRightColor: "transparent",
        borderBottomColor: "#141010",
        transform: [{ rotate: `${t * 38}deg` }],
      }}
    />
  );
};

const PkLoserPunish = memo(({ panelW, panelH, face, mirror }: { panelW: number; panelH: number; face?: any; mirror?: boolean }) => {
  const bombIn = useRef(new Animated.Value(0)).current; // bomb pops onto the face
  const fuse = useRef(new Animated.Value(0)).current; // 0..1 while the fuse burns (shake + swell + spark)
  const bombGone = useRef(new Animated.Value(0)).current;
  const boom = useRef(new Animated.Value(0)).current; // blast
  const flash = useRef(new Animated.Value(0)).current; // white screen flash
  const quake = useRef(new Animated.Value(0)).current; // face shakes after the blast
  const soot = useRef(new Animated.Value(0)).current; // face turns black
  const props = useRef(new Animated.Value(0)).current; // moustache / beard / mouth pop in
  const cry = useRef(new Animated.Value(0)).current; // mouth bawling loop
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const sc = useRef(new Animated.Value(1)).current;
  const firstPos = useRef(true);

  // timeline: bomb -> fuse burns -> BOOM -> face black -> moustache + beard + crying
  useEffect(() => {
    const timeline = Animated.parallel([
      Animated.spring(bombIn, { toValue: 1, friction: 5, tension: 110, useNativeDriver: true }),
      Animated.timing(fuse, { toValue: 1, duration: BOMB_BOOM_AT, easing: Easing.linear, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(BOMB_BOOM_AT),
        Animated.parallel([
          Animated.timing(bombGone, { toValue: 1, duration: 60, useNativeDriver: true }),
          Animated.timing(boom, { toValue: 1, duration: 850, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(quake, { toValue: 1, duration: 650, easing: Easing.linear, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(flash, { toValue: 1, duration: 70, useNativeDriver: true }),
            Animated.timing(flash, { toValue: 0, duration: 450, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(160),
            Animated.timing(soot, { toValue: 1, duration: 600, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(750),
            Animated.spring(props, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
          ]),
        ]),
      ]),
    ]);
    timeline.start();
    const bawl = Animated.loop(
      Animated.sequence([
        Animated.timing(cry, { toValue: 1, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(cry, { toValue: 0, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    bawl.start();
    return () => {
      timeline.stop();
      bawl.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // follow the face
  useEffect(() => {
    const baseX = panelW / 2;
    const baseY = panelH * FACE_FALLBACK_Y;
    let cxp = baseX;
    let cyp = baseY;
    let wpx = panelW * FACE_FALLBACK_W;
    const hasFace = !!(face && Number(face.ar) > 0 && Number(face.w) > 0);
    if (hasFace) {
      // the video fills the panel (crop): same maths as Agora's "hidden" render mode
      const ar = Number(face.ar);
      const k = Math.max(panelW / ar, panelH);
      const dw = ar * k;
      const dh = k;
      const ox = (panelW - dw) / 2;
      const oy = (panelH - dh) / 2;
      let fx = Number(face.cx);
      if (mirror !== FACE_FLIP_X) fx = 1 - fx; // front-cam local preview is mirrored
      cxp = ox + fx * dw;
      cyp = oy + Number(face.cy) * dh;
      wpx = Number(face.w) * dw * FACE_PAD;
    }
    const toX = cxp - baseX;
    const toY = cyp - baseY;
    const toS = Math.max(0.3, Math.min(4, wpx / FW));
    if (firstPos.current) {
      // snap (no sliding) to the first real face position; until it arrives sit at the fallback spot
      tx.setValue(toX);
      ty.setValue(toY);
      sc.setValue(toS);
      if (hasFace) firstPos.current = false;
      return;
    }
    Animated.parallel([
      Animated.timing(tx, { toValue: toX, duration: FACE_SMOOTH_MS, useNativeDriver: true }),
      Animated.timing(ty, { toValue: toY, duration: FACE_SMOOTH_MS, useNativeDriver: true }),
      Animated.timing(sc, { toValue: toS, duration: FACE_SMOOTH_MS, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face?.cx, face?.cy, face?.w, face?.ar, mirror, panelW, panelH]);

  // ---- layout of the face parts (design units) ----
  const eyeY = FH * 0.36;
  const eyeDX = FW * 0.2;
  const eyeW = FW * 0.22;
  const eyeH = eyeW * 0.78;
  const lx = FW / 2 - eyeDX;
  const rx = FW / 2 + eyeDX;
  const browY = eyeY - eyeH * 0.95;
  const mustY = FH * 0.6;
  const mustW = FW * 0.36;
  const mustH = FW * 0.12;
  const mouthW = FW * 0.3;
  const mouthH = FH * 0.17;
  const mouthY = FH * 0.74;
  const beardW = FW * 0.84;
  const beardH = FH * 0.52;
  const beardTop = FH * 0.64;
  const fall = FH * 0.95;
  const B = FW * 0.62; // bomb size

  const eye = (x: number) => (
    <>
      {/* water pooling under the eye */}
      <View
        style={{
          position: "absolute",
          left: x - eyeW * 0.55,
          top: eyeY + eyeH * 0.25,
          width: eyeW * 1.1,
          height: eyeH * 0.55,
          borderRadius: eyeW,
          backgroundColor: "rgba(120,205,255,0.5)",
        }}
      />
      <View
        style={{
          position: "absolute",
          left: x - eyeW / 2,
          top: eyeY - eyeH / 2,
          width: eyeW,
          height: eyeH,
          borderRadius: eyeW,
          backgroundColor: "#fff",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: eyeH * 0.62,
            height: eyeH * 0.62,
            borderRadius: eyeH,
            backgroundColor: "#0b0b0b",
            marginTop: eyeH * 0.1,
          }}
        >
          <View
            style={{
              position: "absolute",
              left: eyeH * 0.12,
              top: eyeH * 0.1,
              width: eyeH * 0.18,
              height: eyeH * 0.18,
              borderRadius: eyeH,
              backgroundColor: "#fff",
            }}
          />
        </View>
      </View>
    </>
  );

  const brow = (x: number, rot: string) => (
    <View
      style={{
        position: "absolute",
        left: x - eyeW * 0.6,
        top: browY,
        width: eyeW * 1.2,
        height: FH * 0.034,
        borderRadius: 3,
        backgroundColor: "#d8cfc8",
        transform: [{ rotate: rot }],
      }}
    />
  );

  const shakeX = quake.interpolate({
    inputRange: [0, 0.08, 0.16, 0.26, 0.38, 0.52, 0.7, 1],
    outputRange: [0, -9, 9, -7, 5, -3, 1, 0],
  });
  const bombRot = fuse.interpolate({
    inputRange: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
    outputRange: ["0deg", "-5deg", "5deg", "-5deg", "6deg", "-7deg", "7deg", "-9deg", "9deg", "-12deg", "12deg"],
  });
  const bombScale = Animated.multiply(
    bombIn.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }),
    fuse.interpolate({ inputRange: [0, 0.65, 1], outputRange: [1, 1, 1.28] })
  );
  const sparkFlick = fuse.interpolate({
    inputRange: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
    outputRange: [1, 1.7, 1, 1.8, 1.1, 1.9, 1, 1.8, 1.2, 2, 1.4],
  });
  const bodyD = B * 0.86;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      {/* panel gets a bit darker (smoke) */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: soot, backgroundColor: "rgba(0,0,0,0.2)" }]} />

      {/* everything below moves + scales with the tracked face */}
      <Animated.View
        style={{
          position: "absolute",
          left: panelW / 2 - FW / 2,
          top: panelH * FACE_FALLBACK_Y - FH / 2,
          width: FW,
          height: FH,
          transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
        }}
      >
        <Animated.View style={{ width: FW, height: FH, transform: [{ translateX: shakeX }] }}>
          {/* ---------- burnt hair ---------- */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: props }]}>
            {HAIR.map((u, i) => (
              <HairSpike key={i} u={u} i={i} />
            ))}
          </Animated.View>

          {/* ---------- black face (soft, 2 layers) ---------- */}
          <Animated.View
            style={{
              position: "absolute",
              left: -FW * 0.07,
              top: -FH * 0.07,
              width: FW * 1.14,
              height: FH * 1.14,
              borderRadius: FW,
              backgroundColor: "rgba(0,0,0,0.3)",
              opacity: soot,
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: FW,
              height: FH,
              borderRadius: FW,
              backgroundColor: "rgba(10,8,8,0.9)",
              opacity: soot,
            }}
          />

          {/* ---------- beard ---------- */}
          <Animated.View
            style={{
              position: "absolute",
              left: (FW - beardW) / 2,
              top: beardTop,
              width: beardW,
              height: beardH,
              borderTopLeftRadius: beardW * 0.22,
              borderTopRightRadius: beardW * 0.22,
              borderBottomLeftRadius: beardW * 0.5,
              borderBottomRightRadius: beardW * 0.5,
              backgroundColor: "#4A2A12",
              borderWidth: 1.5,
              borderColor: "#1a0d05",
              opacity: props,
              transform: [{ scale: props }],
              overflow: "hidden",
            }}
          >
            {[0.2, 0.36, 0.5, 0.64, 0.8].map((p, i) => (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: beardW * p,
                  top: beardH * 0.3,
                  width: 2,
                  height: beardH * 0.62,
                  borderRadius: 1,
                  backgroundColor: "rgba(160,100,50,0.55)",
                }}
              />
            ))}
          </Animated.View>

          {/* ---------- eyes + brows ---------- */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: soot }]}>
            {eye(lx)}
            {eye(rx)}
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: props }]}>
            {brow(lx, "-20deg")}
            {brow(rx, "20deg")}
          </Animated.View>

          {/* ---------- tears (streaks + falling drops) ---------- */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: props }]}>
            <View
              style={{
                position: "absolute",
                left: lx - 2.5,
                top: eyeY + eyeH * 0.5,
                width: 5,
                height: FH * 0.34,
                borderRadius: 3,
                backgroundColor: "rgba(120,205,255,0.35)",
              }}
            />
            <View
              style={{
                position: "absolute",
                left: rx - 2.5,
                top: eyeY + eyeH * 0.5,
                width: 5,
                height: FH * 0.34,
                borderRadius: 3,
                backgroundColor: "rgba(120,205,255,0.35)",
              }}
            />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: soot }]}>
            {[0, 1, 2].map((i) => (
              <React.Fragment key={i}>
                <Tear x={lx + (i - 1) * 3} y={eyeY + eyeH * 0.4} fall={fall} delay={i * 330} />
                <Tear x={rx + (i - 1) * 3} y={eyeY + eyeH * 0.4} fall={fall} delay={i * 330 + 140} />
              </React.Fragment>
            ))}
          </Animated.View>

          {/* ---------- bawling mouth ---------- */}
          <Animated.View
            style={{
              position: "absolute",
              left: FW / 2 - mouthW / 2,
              top: mouthY,
              width: mouthW,
              height: mouthH,
              borderRadius: mouthW,
              backgroundColor: "#6e0d1b",
              borderWidth: 1.5,
              borderColor: "#240407",
              overflow: "hidden",
              opacity: props,
              transform: [
                { scale: props },
                { scaleY: cry.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.2] }) },
              ],
            }}
          >
            <View
              style={{
                position: "absolute",
                left: mouthW * 0.2,
                bottom: -mouthH * 0.15,
                width: mouthW * 0.6,
                height: mouthH * 0.5,
                borderRadius: mouthW,
                backgroundColor: "#ee6a85",
              }}
            />
          </Animated.View>

          {/* ---------- moustache (2 curls) ---------- */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: props, transform: [{ scale: props }] }]}>
            <View
              style={{
                position: "absolute",
                left: FW / 2 - mustW,
                top: mustY,
                width: mustW,
                height: mustH,
                borderTopLeftRadius: mustH,
                borderBottomLeftRadius: mustH * 0.2,
                borderTopRightRadius: mustH * 0.4,
                borderBottomRightRadius: mustH,
                backgroundColor: "#6B3E1A",
                borderWidth: 1.5,
                borderColor: "#1a0d05",
                transform: [{ rotate: "-9deg" }],
              }}
            />
            <View
              style={{
                position: "absolute",
                left: FW / 2,
                top: mustY,
                width: mustW,
                height: mustH,
                borderTopRightRadius: mustH,
                borderBottomRightRadius: mustH * 0.2,
                borderTopLeftRadius: mustH * 0.4,
                borderBottomLeftRadius: mustH,
                backgroundColor: "#6B3E1A",
                borderWidth: 1.5,
                borderColor: "#1a0d05",
                transform: [{ rotate: "9deg" }],
              }}
            />
          </Animated.View>

          {/* ---------- smoke rising from the burnt face ---------- */}
          <Smoke x={FW * 0.3} size={26} start={BOMB_BOOM_AT + 250} />
          <Smoke x={FW * 0.5} size={34} start={BOMB_BOOM_AT + 700} />
          <Smoke x={FW * 0.7} size={26} start={BOMB_BOOM_AT + 1150} />

          {/* ---------- BOMB on the face ---------- */}
          <Animated.View
            style={{
              position: "absolute",
              left: FW / 2 - B / 2,
              top: FH * 0.5 - B / 2,
              width: B,
              height: B,
              opacity: Animated.multiply(bombIn, bombGone.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })),
              transform: [{ scale: bombScale }, { rotate: bombRot }],
            }}
          >
            {/* body */}
            <View
              style={{
                position: "absolute",
                left: (B - bodyD) / 2,
                top: B * 0.14,
                width: bodyD,
                height: bodyD,
                borderRadius: bodyD / 2,
                backgroundColor: "#17171d",
                borderWidth: 2,
                borderColor: "#4b4b57",
              }}
            />
            {/* shine */}
            <View
              style={{
                position: "absolute",
                left: B * 0.22,
                top: B * 0.3,
                width: B * 0.2,
                height: B * 0.1,
                borderRadius: B,
                backgroundColor: "rgba(255,255,255,0.4)",
                transform: [{ rotate: "-32deg" }],
              }}
            />
            {/* cap */}
            <View
              style={{
                position: "absolute",
                left: B / 2 - B * 0.14,
                top: B * 0.05,
                width: B * 0.28,
                height: B * 0.15,
                borderRadius: 3,
                backgroundColor: "#6b6b78",
                borderWidth: 1.5,
                borderColor: "#2b2b33",
              }}
            />
            {/* fuse */}
            <View
              style={{
                position: "absolute",
                left: B / 2 - 1.5,
                top: -B * 0.1,
                width: 3,
                height: B * 0.18,
                borderRadius: 2,
                backgroundColor: "#c8a15a",
                transform: [{ rotate: "20deg" }],
              }}
            />
            <View
              style={{
                position: "absolute",
                left: B / 2 + B * 0.05,
                top: -B * 0.22,
                width: 3,
                height: B * 0.14,
                borderRadius: 2,
                backgroundColor: "#c8a15a",
                transform: [{ rotate: "-28deg" }],
              }}
            />
            {/* burning spark */}
            <Animated.View
              style={{
                position: "absolute",
                left: B / 2 + B * 0.02,
                top: -B * 0.36,
                width: B * 0.22,
                height: B * 0.22,
                borderRadius: B,
                backgroundColor: "#FF7A00",
                justifyContent: "center",
                alignItems: "center",
                transform: [{ scale: sparkFlick }],
              }}
            >
              <View style={{ width: B * 0.11, height: B * 0.11, borderRadius: B, backgroundColor: "#FFF2A0" }} />
            </Animated.View>
          </Animated.View>

          {/* ---------- BLAST (fireball, shock ring, sparks) ---------- */}
          <Animated.View
            style={{
              position: "absolute",
              left: FW / 2 - FW * 0.85,
              top: FH / 2 - FW * 0.85,
              width: FW * 1.7,
              height: FW * 1.7,
              borderRadius: FW,
              backgroundColor: "#FF5A00",
              opacity: boom.interpolate({ inputRange: [0, 0.04, 0.5, 1], outputRange: [0, 1, 0.8, 0] }),
              transform: [{ scale: boom.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.1, 1, 1.25] }) }],
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              left: FW / 2 - FW * 0.6,
              top: FH / 2 - FW * 0.6,
              width: FW * 1.2,
              height: FW * 1.2,
              borderRadius: FW,
              backgroundColor: "#FF9F1C",
              opacity: boom.interpolate({ inputRange: [0, 0.04, 0.35, 0.8], outputRange: [0, 1, 0.9, 0] }),
              transform: [{ scale: boom.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.1, 0.9, 1.05] }) }],
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              left: FW / 2 - FW * 0.35,
              top: FH / 2 - FW * 0.35,
              width: FW * 0.7,
              height: FW * 0.7,
              borderRadius: FW,
              backgroundColor: "#FFF3A0",
              opacity: boom.interpolate({ inputRange: [0, 0.04, 0.25, 0.5], outputRange: [0, 1, 0.8, 0] }),
              transform: [{ scale: boom.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.1, 1, 0.6] }) }],
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              left: FW / 2 - FW * 0.55,
              top: FH / 2 - FW * 0.55,
              width: FW * 1.1,
              height: FW * 1.1,
              borderRadius: FW,
              borderWidth: 4,
              borderColor: "rgba(255,255,255,0.9)",
              opacity: boom.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 0.9, 0] }),
              transform: [{ scale: boom.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.8] }) }],
            }}
          />
          {SPARKS.map((s, i) => (
            <Spark key={i} boom={boom} ang={s.ang} dist={s.dist} size={s.size} color={s.color} />
          ))}
        </Animated.View>
      </Animated.View>

      {/* white flash on the whole panel at the moment of the blast */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: "#fff", opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }) }]}
      />
    </View>
  );
});

// 3 round "seats" at the bottom of each panel (Tiki): sofa when empty, else the top-3 gifters.
// #1 gets a crown + MVP ribbon, #2 / #3 a small number. Left panel is mirrored so #1 always sits next to the centre.
const SEAT_COL = ["#FFD700", "#C0C0C0", "#CD7F32"];
const SEAT_BADGE = ["#F59E0B", "#8A96AB", "#B8693A"];
const PkSeats = memo(({ gifters, mirror }: any) => {
  const top: any[] = Object.values(gifters || {})
    .filter((g: any) => g && g.uid && Number(g.stars) > 0)
    .sort((a: any, b: any) => Number(b.stars) - Number(a.stars))
    .slice(0, 3);
  const order = mirror ? [2, 1, 0] : [0, 1, 2];
  return (
    <View pointerEvents="none" style={styles.pkSeatRow}>
      {order.map((i) => {
        const g = top[i];
        return (
          <View key={i} style={styles.pkSeatWrap}>
            {g ? (
              <Image
                source={{ uri: g.img || STABLE_AVATAR }}
                style={[styles.pkSeat, { borderColor: SEAT_COL[i], borderWidth: 2 }]}
              />
            ) : (
              <View style={[styles.pkSeat, styles.pkSeatEmpty]}>
                <MaterialCommunityIcons name="sofa" size={14} color="rgba(214,170,90,0.95)" />
              </View>
            )}
            {!!g && i === 0 && <Text style={styles.pkSeatCrown}>👑</Text>}
            {!!g && (
              <View style={[styles.pkSeatNum, { backgroundColor: SEAT_BADGE[i] }]}>
                <Text style={styles.pkSeatNumTxt}>{i === 0 ? "MVP" : i + 1}</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
});

// Panel shown while a video is not there yet: blurred avatar (no flat black) + spinner.
const PkWaiting = memo(({ img, loading }: any) => (
  <View style={styles.pkWaiting}>
    <Image
      source={{ uri: img || STABLE_AVATAR }}
      style={StyleSheet.absoluteFill}
      blurRadius={Platform.OS === "android" ? 14 : 24}
    />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(28,20,70,0.55)" }]} />
    <Image source={{ uri: img || STABLE_AVATAR }} style={styles.pkWaitAvatar} />
    {!!loading && (
      <>
        <ActivityIndicator size="small" color="#fff" style={{ marginTop: 10 }} />
        <Text style={styles.pkWaitTxt}>Connecting...</Text>
      </>
    )}
  </View>
));

// Scrolling tip under the PK panels (Tiki). Pure native-driver translate = cheap.
const PkTicker = memo(({ top }: { top: number }) => {
  const x = useRef(new Animated.Value(0)).current;
  const boxW = Math.round(width * 0.6);
  const textW = Math.round(PK_TIPS.length * 6.4);
  useEffect(() => {
    x.setValue(boxW);
    const loop = Animated.loop(
      Animated.timing(x, { toValue: -textW, duration: (textW + boxW) * 30, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View pointerEvents="none" style={[styles.pkTicker, { top, width: boxW, left: Math.round((width - boxW) / 2) }]}>
      <Animated.Text numberOfLines={1} style={[styles.pkTickerTxt, { width: textW, transform: [{ translateX: x }] }]}>
        {PK_TIPS}
      </Animated.Text>
    </View>
  );
});

export default function VideoLive() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();

  const currentUid = auth?.currentUser?.uid || null;

  // roomId always comes from the list / from livevideostart.tsx.
  const roomId = params?.id ? String(params.id) : null;
  const isHost = String(params?.role || "viewer") === "host";
  // Official ne ban lagaya to turant bahar (host = live ban, viewer = entry ban)
  useLiveBanGuard(isHost);

  // ---------- Screenshot / screen-recording block (host ke alawa sab) ----------
  // Android: FLAG_SECURE (screenshot fail, recording me black screen).
  // iOS: screenshot / recording me content black.
  useEffect(() => {
    if (isHost) return;
    const TAG = "videolive-secure";
    ScreenCapture.preventScreenCaptureAsync(TAG)
      .then(() => console.log("SECURE: screen capture BLOCKED for viewer"))
      .catch((e) => console.log("SECURE: block FAILED", e?.message || e));
    return () => {
      ScreenCapture.allowScreenCaptureAsync(TAG).catch(() => {});
    };
  }, [isHost]);

  // ---------- room doc ----------
  const [roomData, setRoomData] = useState<any>(null);
  const roomDataRef = useRef<any>(null);
  const [hostLevel, setHostLevel] = useState(1);
  const [hostVerified, setHostVerified] = useState(false);
  const [hostVerifiedColor, setHostVerifiedColor] = useState("white");

  const [roomStartTime, setRoomStartTime] = useState<number | null>(null);
  const [chatMessage, setChatMessage] = useState("");

  const [exitModalVisible, setExitModalVisible] = useState(false);
  const [giftModalVisible, setGiftModalVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // ---------- MY profile (used for chat / join / gifts) ----------
  const [currentName, setCurrentName] = useState("User");
  const [currentRealName, setCurrentRealName] = useState("User");
  const [currentAvatar, setCurrentAvatar] = useState(STABLE_AVATAR);
  const [myLevel, setMyLevel] = useState(1);
  const [myVerified, setMyVerified] = useState(false);
  const [myVerifiedColor, setMyVerifiedColor] = useState("white");
  const [mySpecial, setMySpecial] = useState<any>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [stars, setStars] = useState(0);

  // ---------- chat + audience (subcollections, like LiveRoom.js) ----------
  const { blocked: blockedIds, ref: blockedRef } = useBlockedIds();
  const [rawChatMessages, setChatMessages] = useState<any[]>([]);
  const [rawAudienceMap, setAudienceMap] = useState<any>({});
  // BLOCK: blocked (dono taraf) users ke msgs / viewers hide
  const chatMessages = React.useMemo(() => rawChatMessages.filter((m: any) => !(m && m.senderId && blockedIds.has(m.senderId))), [rawChatMessages, blockedIds]);
  const audienceMap = React.useMemo(() => { const o: any = {}; for (const k in rawAudienceMap) { if (!blockedIds.has(k)) o[k] = rawAudienceMap[k]; } return o; }, [rawAudienceMap, blockedIds]);
  
  // BLOCK: host se block-relation ho to room me rehne hi mat do
  useEffect(() => {
    const hid = roomData?.hostId;
    if (hid && hid !== currentUid && blockedIds.has(hid)) {
      try { alert("Ye live aapke liye available nahi hai"); } catch (_) {}
      router.back();
    }
  }, [roomData?.hostId, blockedIds]);
  

  // ---------- gifting ----------
  // Gift animation + combo banner state <GiftLayer/> ke andar hai (LiveRoom jaisa) -> ref se bulate hain.
  const giftLayerRef = useRef<any>(null);
  const giftComboCountRef = useRef(0);
  const pendingSpendRef = useRef(0);   // taps jo abhi write nahi hue
  const inflightSpendRef = useRef(0);  // write ho gaye, wallet snapshot abhi nahi aaya
  const giftBatchRef = useRef<any>(null);
  const giftFlushTimerRef = useRef<any>(null);
  const flushGiftBatchRef = useRef<any>(null);
  const onComboEnd = useCallback(() => {
    lastGiftRef.current = null;
    giftComboCountRef.current = 0;
  }, []);
  const [selectedGiftUser, setSelectedGiftUser] = useState<string | null>(null);
  const lastSeenGiftKeyRef = useRef("");
  const giftBaselineSetRef = useRef(false);
  const lastGiftRef = useRef<any>(null);

  const giftModalAnim = useRef(new Animated.Value(400)).current;
  // PK side: viewer kis host ki side me hai ("me" = left, "opp" = right). Gift sirf isi side ke host ko jata hai.
  const [pkSide, setPkSide] = useState<"me" | "opp">("me");
  const pkSideAnim = useRef(new Animated.Value(0)).current; // 0 = left, 1 = right (native driver, smooth)
  const pkSideRef = useRef<"me" | "opp">("me");
  const [followedByIds, setFollowedByIds] = useState<Set<string>>(new Set()); // jo mujhe follow karte hain (PK hosts)

  // ---------- join banner ----------
  const [joinBanner, setJoinBanner] = useState<any>(null);
  const chatsReadyRef = useRef(false);

  // ---------- agora ----------
  const agoraEngineRef = useRef<any>(null);
  const myAgoraUidRef = useRef<number>(0);
  const [agoraReady, setAgoraReady] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState<number[]>([]); // main channel (host camera)
  const [oppRemoteUid, setOppRemoteUid] = useState<number | null>(null); // opponent channel (PK)
  const [pkConn, setPkConn] = useState<any>(null);
  const [agoraStatus, setAgoraStatus] = useState(isHost ? "Starting camera..." : "Connecting to live...");
  const [agoraRetry, setAgoraRetry] = useState(0); // bump = tear down + start Agora again
  const lastRoomSigRef = useRef(""); // used to ignore heartbeat-only room snapshots

  // ---------- tools (mute / video / filter) ----------
  const [micMuted, setMicMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const soundMutedRef = useRef(false);
  const [filterId, setFilterId] = useState("off");
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // ---------- PK ----------
  const [pkListVisible, setPkListVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<any>(null);
  const [pkSettingsOpen, setPkSettingsOpen] = useState(false);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [matching, setMatching] = useState(false);
  const [matchMini, setMatchMini] = useState(false);
  const matchTriedRef = useRef<Set<string>>(new Set());
  const matchStartRef = useRef(0);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const [pkCandidates, setPkCandidates] = useState<any[]>([]);
  const [pkLoading, setPkLoading] = useState(false);
  const [friendsList, setFriendsList] = useState<any[]>([]); // PK sheet: my OFFLINE-capable friend profiles (first PK_FRIEND_LIMIT)
  const [friendIdSet, setFriendIdSet] = useState<Set<string>>(new Set()); // ALL my friend uids (so a live friend is never dropped)
  const friendProfilesRef = useRef<Record<string, any>>({});
  const [pkBusy, setPkBusy] = useState(false);
  const [oppRoom, setOppRoom] = useState<any>(null);
  const [oppLoaded, setOppLoaded] = useState(false);
  const [pkDuration, setPkDuration] = useState(PK_DURATION_SEC); // length the host picks before inviting
  const [oppMuted, setOppMuted] = useState(false); // mute the opponent's sound only
  const [inviteHiddenId, setInviteHiddenId] = useState<string | null>(null);
  const myScoreRef = useRef(0);
  const oppScoreRef = useRef(0);
  const pkEndingRef = useRef<string | null>(null);
  const pkBarAnim = useRef(new Animated.Value(50)).current; // smooth score bar (0-100)
  const pkFallbackTimerRef = useRef<any>(null);
  const lastOppSigRef = useRef("");
  const oppTokenRef = useRef<any>(null); // prefetched token for the opponent channel

  const chatListRef = useRef<FlatList>(null);
  const heartbeatRef = useRef<any>(null);
  // ---------- NO-FACE / BLACK SCREEN AUTO BAN (host) ----------
  const lastFaceAtRef = useRef<number>(Date.now());   // aakhri baar kab face dikha
  const faceCheckOnRef = useRef(false);                // device par face detection chalu hua?
  const faceRectRef = useRef<any>(null);               // latest tracked face (0..1 fractions) -> loser punishment follows it
  const camFrontRef = useRef(true);                    // front camera? (local preview is mirrored on front cam)
  const faceWarnedRef = useRef(false);                 // 4 min par warning ek hi baar
  const faceBanFiredRef = useRef(false);               // ban ek hi baar lage
  const rewardPingRef = useRef<any>(null);

  // ---------- PREMIUM: follow / likes / viewers / moderation / summary ----------
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const heartsRef = useRef<any>(null);
  const pendingLikesRef = useRef(0);
  const likeTimerRef = useRef<any>(null);
  const lastLikesSeenRef = useRef<number | null>(null);
  const [viewerListVisible, setViewerListVisible] = useState(false);
  const [rankVisible, setRankVisible] = useState(false);
  const [profileCard, setProfileCard] = useState<any>(null);
  const [profileFollowing, setProfileFollowing] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [pinDraft, setPinDraft] = useState("");
  const [lockDraft, setLockDraft] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [netQuality, setNetQuality] = useState(0); // 0 unknown, 1-2 good, 3 ok, 4-6 bad
  const [giftPageIdx, setGiftPageIdx] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const lastChatAtRef = useRef(0);
  const peakViewersRef = useRef(0);
  const kickedHandledRef = useRef(false);
  const [reportTarget, setReportTarget] = useState<any>(null);

  // ---------- guest seats ----------
  const [guestSheetVisible, setGuestSheetVisible] = useState(false); // host: requests / guests sheet
  const [guestMicOn, setGuestMicOn] = useState(true); // guest: my own mic switch
  const [guestCamOn, setGuestCamOn] = useState(false); // guests are AUDIO ONLY // guest: my own camera switch
  const [remoteVideoOn, setRemoteVideoOn] = useState<Record<number, boolean>>({}); // uid → video is really decoding
  const [guestFollowed, setGuestFollowed] = useState<Set<string>>(new Set());
  const guestPublishingRef = useRef(false);
  const remoteUsersRef = useRef<number[]>([]);
  const hostName = roomData?.hostName || "Host";
  const hostImg = roomData?.hostImg || STABLE_AVATAR;
  const hostId = roomData?.hostId || (isHost ? currentUid : null);
  const hostStars = Number(roomData?.seatStars?.[hostId] || 0);
  const hostMicMuted = !!roomData?.hostMicMuted;
  const hostVideoOff = !!roomData?.hostVideoOff;

  // ---------- guest seats (derived) ----------
  // rooms/{id}.guests = { [uid]: { uid, name, img, agoraUid, hostMuted, at } }  (written by the host)
  const guestList: any[] = React.useMemo(
    () =>
      Object.values(roomData?.guests || {})
        .filter((g: any) => g && g.uid && !blockedIds.has(g.uid))
        .sort((a: any, b: any) => Number(a.at || 0) - Number(b.at || 0))
        .slice(0, MAX_GUESTS),
    [roomData?.guests, blockedIds]
  );
  const amGuest = !isHost && !!currentUid && !!roomData?.guests?.[currentUid];
  const myGuestEntry: any = amGuest ? roomData.guests[currentUid as string] : null;
  const hostMutedMe = !!myGuestEntry?.hostMuted;
  const guestAgoraIds = new Set<number>(guestList.map((g: any) => Number(g.agoraUid || 0)).filter(Boolean));
  // The HOST's camera uid. remoteUsers can now also hold guests, so remoteUsers[0] is no longer safe.
  const wantedHostUid = Number(roomData?.hostAgoraUid || 0);
  const hostRemoteUid: number | null = wantedHostUid
    ? remoteUsers.includes(wantedHostUid)
      ? wantedHostUid
      : null
    : remoteUsers.find((u) => !guestAgoraIds.has(u)) ?? null;
  remoteUsersRef.current = remoteUsers;
  // rooms/{id}.guestReq = { [uid]: { uid, name, username, img, level, agoraUid, at } }  (written by the viewer)
  // Same room doc that viewers already write likes / gifts to, so no extra Firestore rule is needed.
  const guestRequests: any[] = React.useMemo(
    () =>
      Object.values(roomData?.guestReq || {})
        .filter((r: any) => r && r.uid)
        .sort((a: any, b: any) => Number(a.at || 0) - Number(b.at || 0)),
    [roomData?.guestReq]
  );
  const myReqEntry: any = !isHost && currentUid ? roomData?.guestReq?.[currentUid] : null;
  const myReqPending = !!myReqEntry && !amGuest && Date.now() - Number(myReqEntry.at || 0) < GUEST_REQUEST_TTL;
  const pendingRequests = guestRequests.filter(
    (r: any) =>
      r &&
      r.uid &&
      !blockedIds.has(r.uid) &&
      !roomData?.guests?.[r.uid] &&
      Date.now() - Number(r.at || 0) < GUEST_REQUEST_TTL
  );

  // PK derived state
  const pk = roomData?.pk || null;
  const pkActive = pk?.status === "active";
  const pkEnded = pk?.status === "ended";
  const pkInvited = pk?.status === "invited";
  const showPk = pkActive || pkEnded;
  const myScore = Number(pk?.score || 0);
  const oppScore = Number(oppRoom?.pk?.score || 0);
  myScoreRef.current = pkEnded && pk?.finalMy != null ? Number(pk.finalMy) : myScore;
  oppScoreRef.current = pkEnded && pk?.finalOpp != null ? Number(pk.finalOpp) : oppScore;
  const shownMy = pkEnded && pk?.finalMy != null ? Number(pk.finalMy) : myScore;
  const shownOpp = pkEnded && pk?.finalOpp != null ? Number(pk.finalOpp) : oppScore;
  const pkTotal = shownMy + shownOpp;
  const myPct = pkTotal > 0 ? Math.max(6, Math.min(94, (shownMy / pkTotal) * 100)) : 50;

  const pkInvite = roomData?.pkInvite || null;
  const showInvite =
    isHost &&
    !!pkInvite &&
    !pk &&
    inviteHiddenId !== pkInvite.pkId &&
    Date.now() - (pkInvite.at || 0) < PK_INVITE_TTL;

  // audience (viewers) — everyone in the audience list except the host
  const audienceArray = React.useMemo(
    () => Object.values(audienceMap).filter((u: any) => u && u.uid && u.uid !== hostId),
    [audienceMap, hostId]
  );
  const audienceSorted = React.useMemo(
    () => [...audienceArray].sort((a: any, b: any) => Number(b.level || 1) - Number(a.level || 1)),
    [audienceArray]
  );
  const topViewers = React.useMemo(() => audienceSorted.slice(0, 3), [audienceSorted]);
  const viewerCount = audienceArray.length;
  if (viewerCount > peakViewersRef.current) peakViewersRef.current = viewerCount;

  // ---------- premium derived values ----------
  const mods = roomData?.mods || {};
  const mutedUsers = roomData?.mutedUsers || {};
  const isMod = isHost || !!(currentUid && mods[currentUid]);
  const amMuted = !!(currentUid && mutedUsers[currentUid]);
  const chatLocked = !!roomData?.chatLocked;
  const roomTitle: string = roomData?.title || "";
  const pinnedText: string = roomData?.pinned?.text || "";
  const roomLikes = Number(roomData?.likes || 0);
  const rankedGifters: any[] = React.useMemo(
    () =>
      Object.values(roomData?.roomGifters || {})
        .filter((g: any) => g && g.uid && Number(g.stars) > 0)
        .sort((a: any, b: any) => Number(b.stars) - Number(a.stars)),
    [roomData?.roomGifters]
  );
  const top3Gifters = React.useMemo(() => rankedGifters.slice(0, 3), [rankedGifters]);
  // Header: always up to 5 people. Gifters first (most stars in front), then the other viewers by level.
  const headerFive: any[] = React.useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    rankedGifters.forEach((g: any) => {
      // gifter sirf tab dikhe jab abhi room me ho (audience me); gift karke chala gaya to hat jaye,
      // wapas aaye to apne stars ke hisaab se fir aage dikhne lage
      if (out.length < 5 && g?.uid && !!audienceMap[g.uid] && !blockedIds.has(g.uid) && !seen.has(g.uid)) {
        seen.add(g.uid);
        out.push({ ...g, isGifter: true });
      }
    });
    audienceSorted.forEach((u: any) => {
      if (out.length < 5 && u?.uid && !seen.has(u.uid)) {
        seen.add(u.uid);
        out.push({ ...u, isGifter: false });
      }
    });
    return out;
  }, [rankedGifters, audienceSorted, audienceMap, blockedIds]);

  // ---------- guard: no room id at all ----------
  useEffect(() => {
    if (!roomId) console.log("VideoLive opened without a room id.");
  }, [roomId]);

  // ---------- MY wallet (stars) ----------
  useEffect(() => {
    if (!db || !currentUid) return;
    const unsub = onSnapshot(doc(db, "wallets", currentUid), (snap) => {
      if (snap.exists()) {
        setStars(snap.data()?.stars || 0);
        // wallet update ho gaya -> in-flight spend ab stars me included hai
        inflightSpendRef.current = 0;
        giftPendingStore.set(pendingSpendRef.current);
      }
    });
    return () => unsub();
  }, [currentUid]);

  // ---------- MY profile (name / avatar / level / verified) ----------
  useEffect(() => {
    if (!db || !currentUid) {
      setProfileReady(true);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const [snap, walletSnap] = await Promise.all([
          getDoc(doc(db, "users", currentUid)),
          getDoc(doc(db, "wallets", currentUid)),
        ]);
        if (!alive) return;
        if (snap.exists()) {
          const data = snap.data();
          setCurrentName(data.username || data.name || auth?.currentUser?.displayName || "User");
          setCurrentRealName(data.name || auth?.currentUser?.displayName || "User");
          setCurrentAvatar(
            data.profileImg || data.photoURL || auth?.currentUser?.photoURL || STABLE_AVATAR
          );
          setMyVerified(isVerified(data.verified));
          setMyVerifiedColor(normTickColor(data.verifiedColor));
          setMySpecial(getSpecialKey(data));
        } else {
          setCurrentName(auth?.currentUser?.displayName || "User");
          setCurrentRealName(auth?.currentUser?.displayName || "User");
          setCurrentAvatar(auth?.currentUser?.photoURL || STABLE_AVATAR);
        }
        if (walletSnap.exists()) setMyLevel(walletSnap.data()?.level || 1);
      } catch (e) {
        console.log("MY PROFILE LOAD ERROR:", e);
      }
      if (alive) setProfileReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [currentUid]);

  // ---------- listen to the room doc (rooms/{roomId}) ----------
  useEffect(() => {
    if (!db || !roomId) return;

    const roomRef = doc(db, "rooms", roomId);

    const unsub = onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) {
        roomDataRef.current = null;
        lastRoomSigRef.current = "";
        setRoomData(null);
        return;
      }
      const data = snap.data();

      // First snapshot: remember whatever gift is already there so it
      // doesn't get replayed for someone who just joined.
      if (!giftBaselineSetRef.current) {
        giftBaselineSetRef.current = true;
        lastSeenGiftKeyRef.current = data?.liveGift
          ? `${data.liveGift.senderId}_${data.liveGift.timestamp}`
          : "";
      }

      roomDataRef.current = data;

      // The host writes lastHeartbeat every 8s. That used to re-render this
      // whole screen (and every viewer's screen) each time. If nothing except
      // the heartbeat changed, don't touch state.
      // Likes never re-render the screen: hearts go straight into <HeartsLayer/>.
      const likesNow = Number((data as any).likes || 0);
      if (lastLikesSeenRef.current === null) {
        lastLikesSeenRef.current = likesNow;
      } else {
        const likeDelta = likesNow - lastLikesSeenRef.current;
        lastLikesSeenRef.current = likesNow;
        if (likeDelta > 0) heartsRef.current?.spawn(Math.min(likeDelta, 4));
      }

      // lastHeartbeat / likes / viewerCount change all the time but nothing on screen shows them
      const { lastHeartbeat: _hb, likes: _lk, viewerCount: _vc, ...restOfRoom } = data as any;
      let sig = "";
      try {
        sig = JSON.stringify(restOfRoom);
      } catch (_) {}
      if (sig && sig === lastRoomSigRef.current) return;
      lastRoomSigRef.current = sig;

      setRoomData(data);

      if (data.createdAt?.toMillis) {
        setRoomStartTime(data.createdAt.toMillis());
      } else if (data.createdAt?.seconds) {
        setRoomStartTime(data.createdAt.seconds * 1000);
      } else if (typeof data.createdAt === "number") {
        setRoomStartTime(data.createdAt);
      } else {
        setRoomStartTime((prev) => prev || Date.now());
      }

      // Room ended (host stopped it) → send the viewer back automatically.
      if (!isHost && data.status === "ended") {
        router.back();
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ---------- fetch the HOST's profile (level / verified) ----------
  useEffect(() => {
    const loadHostProfile = async () => {
      if (!db || !hostId) return;
      try {
        const [snap, walletSnap] = await Promise.all([
          getDoc(doc(db, "users", hostId)),
          getDoc(doc(db, "wallets", hostId)),
        ]);
        if (snap.exists()) {
          const data = snap.data();
          setHostVerified(isVerified(data?.verified));
          setHostVerifiedColor(normTickColor(data?.verifiedColor));
          setHostLevel(data?.level || 1);
        }
        if (walletSnap.exists() && walletSnap.data()?.level) {
          setHostLevel(walletSnap.data().level);
        }
      } catch (e) {
        console.log("HOST PROFILE LOAD ERROR:", e);
      }
    };
    loadHostProfile();
  }, [hostId]);

  // ---------- host: make sure the room is marked active + start heartbeat ----------
  useEffect(() => {
    if (!db || !roomId || !isHost) return;

    const roomRef = doc(db, "rooms", roomId);

    (async () => {
      try {
        await setDoc(roomRef, { status: "active", lastHeartbeat: serverTimestamp() }, { merge: true });
      } catch (e) {
        console.log("ROOM ACTIVATE ERROR:", e);
      }
    })();

    heartbeatRef.current = setInterval(() => {
      updateDoc(roomRef, { lastHeartbeat: serverTimestamp() }).catch(() => {});
    }, HEARTBEAT_INTERVAL);

    // Live reward: host ka time server gintta hai (30s ping)
    const rewardPing = () => {
      if (AppState.currentState !== "active") return;
      callApi("/reward/live-ping", { roomId, source: "videolive" }).catch(() => {});
    };
    rewardPing();
    rewardPingRef.current = setInterval(rewardPing, 30000);

    return () => {
      clearInterval(heartbeatRef.current);
      clearInterval(rewardPingRef.current);
      // Host leaving → live is really over, take it out of the list.
      updateDoc(roomRef, {
        status: "ended",
        endedAt: serverTimestamp(),
        pk: deleteField(),
        pkInvite: deleteField(),
        kicked: deleteField(),
        mutedUsers: deleteField(),
        mods: deleteField(),
        roomGifters: deleteField(),
        likes: deleteField(),
        newFollowers: deleteField(),
        pinned: deleteField(),
        chatLocked: deleteField(),
        guestReq: deleteField(),
      }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost]);

  // ---------- chat listener (last 50, subcollection) + join banner ----------
  useEffect(() => {
    if (!db || !roomId) return;

    // Viewer: sirf jab se room me aaya uske BAAD ke messages dikhein (purani chat nahi).
    // Host / moderator-host ko poori chat dikhti hai.
    const chatSince = isHost ? 0 : Date.now();
    const chatsQuery = isHost
      ? query(collection(db, "rooms", roomId, "chats"), orderBy("createdAt", "desc"), limit(50))
      : query(
          collection(db, "rooms", roomId, "chats"),
          where("createdAt", ">=", chatSince),
          orderBy("createdAt", "desc"),
          limit(50)
        );

    chatsReadyRef.current = false;

    // Coalesce bursts: max 1 re-render / 300ms (first one is instant)
    let chatPending: any[] | null = null;
    let chatLastFlush = 0;
    let chatTimer: any = null;
    const flushChats = () => {
      if (chatTimer) clearTimeout(chatTimer);
      chatTimer = null;
      chatLastFlush = Date.now();
      if (chatPending) setChatMessages(chatPending);
    };

    const unsubChats = onSnapshot(
      chatsQuery,
      (snap) => {
        const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
        chatPending = msgs;
        const sinceFlush = Date.now() - chatLastFlush;
        if (chatLastFlush === 0 || sinceFlush >= 300) flushChats();
        else if (!chatTimer) chatTimer = setTimeout(flushChats, 300 - sinceFlush);

        // Skip the banner for the initial history load — only NEW joins.
        if (chatsReadyRef.current) {
          snap.docChanges().forEach((ch) => {
            if (ch.type !== "added") return;
            const d: any = ch.doc.data();
            if (d?.type === "join" && Date.now() - (d.createdAt || 0) < 15000) {
              showJoinBanner(d);
            }
          });
        }
        chatsReadyRef.current = true;
      },
      (e) => console.log("Chat listener error:", e)
    );

    return () => {
      unsubChats();
      if (chatTimer) clearTimeout(chatTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost]);

  const showJoinBanner = (data: any) => {
    if (data?.senderId && blockedRef.current.has(data.senderId)) return;
    // _k: har naye join par JoinEntry animation restart (LiveRoom jaisa)
    setJoinBanner({ ...cleanVerified(data), _k: Date.now() + Math.random() });
  };
  const handleJoinDone = useCallback(() => setJoinBanner(null), []);

  // ---------- audience listener (presence) ----------
  useEffect(() => {
    if (!db || !roomId) return;

    const audienceQuery = query(
      collection(db, "rooms", roomId, "audience"),
      orderBy("joinedAt", "desc")
    );

    // First load is instant, then updates are coalesced (max 1 render / 600ms).
    let firstLoad = true;
    let latestMap: any = {};
    let flushTimer: any = null;

    const unsubAudience = onSnapshot(
      audienceQuery,
      (snap) => {
        const map: any = {};
        snap.forEach((d) => {
          map[d.id] = { uid: d.id, ...d.data() };
        });
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
      },
      (e) => console.log("Audience listener error:", e)
    );

    return () => {
      unsubAudience();
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [roomId]);

  // ---------- host: publish viewer count (PK list shows it) ----------
  useEffect(() => {
    if (!db || !roomId || !isHost) return;
    const t = setTimeout(() => {
      updateDoc(doc(db, "rooms", roomId), { viewerCount }).catch(() => {});
    }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerCount, roomId, isHost]);

  // ---------- JOIN SYSTEM (viewer) ----------
  // Presence doc + "X joined" chat line the first time this user shows up.
  useEffect(() => {
    if (!db || !roomId || !currentUid || !profileReady || isHost) return;

    const audRef = doc(db, "rooms", roomId, "audience", currentUid);

    (async () => {
      try {
        const existing = await getDoc(audRef);
        const isFirstJoin = !existing.exists();

        const jobs: Promise<any>[] = [
          setDoc(audRef, {
            uid: currentUid,
            name: currentRealName,
            username: currentName,
            img: currentAvatar || STABLE_AVATAR,
            level: myLevel,
            special: mySpecial,
            verified: myVerified,
            verifiedColor: normTickColor(myVerifiedColor),
            joinedAt: Date.now(),
            online: true,
          }),
        ];

        if (isFirstJoin) {
          jobs.push(
            addDoc(collection(db, "rooms", roomId, "chats"), {
              type: "join",
              senderId: currentUid,
              senderName: currentRealName,
              username: currentName,
              userImg: currentAvatar || STABLE_AVATAR,
              special: mySpecial,
              verified: myVerified,
              verifiedColor: normTickColor(myVerifiedColor),
              level: myLevel,
              createdAt: Date.now(),
            })
          );
        }
        await Promise.all(jobs);
      } catch (e) {
        console.log("JOIN ERROR:", e);
      }
    })();

    // Leaving the screen = presence doc removed (viewer count drops).
    return () => {
      deleteDoc(audRef).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, currentUid, profileReady, isHost]);

  // ---------- remote gift (liveGift) → combo banner + animation (LiveRoom jaisa) ----------
  useEffect(() => {
    const gift = roomData?.liveGift;
    if (!gift) return;

    const giftKey = `${gift.senderId}_${gift.timestamp}`;

    // Already handled (or it's the gift that existed before we joined).
    if (giftKey === lastSeenGiftKeyRef.current) return;
    lastSeenGiftKeyRef.current = giftKey;

    // My own gift is already on screen (instant local display in the send handler).
    if (gift.senderId === currentUid) return;
    if (blockedRef.current.has(gift.senderId)) return; // BLOCK

    lastGiftRef.current = { senderId: gift.senderId, giftId: gift.giftId, time: Date.now() };

    if (giftLayerRef.current) {
      giftLayerRef.current.showCombo(
        {
          senderName: gift.senderName,
          senderImg: gift.senderImg,
          receiverName: gift.receiverName,
          giftId: gift.giftId,
          giftName: gift.giftName,
          count: gift.comboCount || 1,
        },
        onComboEnd
      );
    }

    const giftData = gifts.find((g: any) => String(g.id) === String(gift.giftId));
    if (!giftData || !giftData.animation) return;

    if (giftLayerRef.current) {
      giftLayerRef.current.playDeferred(giftData.animation, giftData.duration, 1600, {
        senderName: gift.senderName,
        senderImg: gift.senderImg,
        receiverName: gift.receiverName,
        giftName: gift.giftName || giftData.name,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.liveGift?.timestamp]);

  // gift sheet slide-up
  useEffect(() => {
    if (giftModalVisible) {
      giftModalAnim.setValue(420);
      setGiftPageIdx(0);
      Animated.spring(giftModalAnim, { toValue: 0, damping: 24, stiffness: 300, mass: 0.7, overshootClamping: true, useNativeDriver: true }).start();
    }
  }, [giftModalVisible]);

  // ---------- keyboard offset for the bottom bar ----------
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setKeyboardHeight(0);
        setChatOpen(false);
        setEmojiOpen(false);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ---------- SCREEN-ON FIX ----------
  // Pehle yahan keep-awake tha hi nahi -> phone ka screen timeout (~10-30s)
  // live ke beech screen band kar deta tha. Ab screen khuli rehti hai,
  // har 15s me dobara activate (Android me pehli call fail ho sakti hai).
  const keepAwakeOn = useCallback(() => {
    activateKeepAwakeAsync("video-live").catch(() => {
      setTimeout(() => {
        activateKeepAwakeAsync("video-live").catch(() => {});
      }, 1500);
    });
  }, []);
  useFocusEffect(
    useCallback(() => {
      keepAwakeOn();
      const t = setInterval(keepAwakeOn, 15000);
      return () => {
        clearInterval(t);
        try {
          deactivateKeepAwake("video-live");
        } catch (_) {}
      };
    }, [keepAwakeOn])
  );
  useEffect(() => {
    keepAwakeOn();
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") keepAwakeOn();
    });
    return () => {
      sub.remove();
      try {
        deactivateKeepAwake("video-live");
      } catch (_) {}
    };
  }, [keepAwakeOn]);

  // SMOOTH: chat list ab inverted hai (newest neeche, khud bottom se start) ->
  // har message par scrollToEnd ki zarurat nahi, scroll jerk khatam.
  const chatListData = React.useMemo(() => chatMessages.slice().reverse(), [chatMessages]);
  const chatListStyle = React.useMemo(
    () => [
      styles.chatArea,
      { bottom: 96 + keyboardHeight },
      !showPk && guestList.length > 0 ? { right: GUEST_TILE_W + 16 } : null,
      showPk
        ? {
            maxHeight: Math.max(
              120,
              height -
                (Math.round(Math.max(Math.max(insets.top, 24) + 74, height * 0.128)) + PK_BAR_H + pkPanelHFixed + 38) -
                (96 + keyboardHeight)
            ),
          }
        : null,
    ],
    [keyboardHeight, showPk, guestList.length, insets.top]
  );

  // ============================================================
  // PK
  // ============================================================

  // opponent room listener (score + "did they leave")
  const oppRoomId = showPk ? pk?.opponentRoomId || null : null;
  useEffect(() => {
    setOppLoaded(false);
    lastOppSigRef.current = "";
    if (!db || !oppRoomId) {
      setOppRoom(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "rooms", oppRoomId),
      { includeMetadataChanges: true },
      (s) => {
        // A snapshot served from the local cache can be OLD (opponent room
        // without the new pk yet). Using it made the PK end instantly.
        if (s.metadata.fromCache) return;
        const od: any = s.exists() ? s.data() : null;
        let osig = "null";
        try {
          if (od) {
            const { lastHeartbeat: _h, ...orest } = od;
            osig = JSON.stringify(orest);
          }
        } catch (_) {}
        if (osig !== lastOppSigRef.current) {
          lastOppSigRef.current = osig;
          setOppRoom(od);
        }
        setOppLoaded(true);
      }
    );
    return () => unsub();
  }, [oppRoomId]);

  // End PK. Natural end → each host writes only its OWN room.
  // Early end (button) → also flips the opponent's room.
  // One host (the one whose room id sorts first) is the "authority" at the
  // natural end: it writes the SAME result + scores into BOTH rooms, so both
  // sides always show the same winner. The other host only steps in as a
  // fallback (force) if the authority never wrote (e.g. it left).
  const endPk = async (early = false, force = false) => {
    const cur = roomDataRef.current?.pk;
    if (!db || !roomId || !cur || cur.status !== "active") return;
    const isAuthority = !cur.opponentRoomId || roomId < cur.opponentRoomId;
    if (!early && !force && !isAuthority) return;
    if (pkEndingRef.current === cur.pkId) return;
    pkEndingRef.current = cur.pkId;

    const my = myScoreRef.current;
    const opp = oppScoreRef.current;
    const res = my > opp ? "win" : my < opp ? "lose" : "draw";
    const inv = res === "win" ? "lose" : res === "lose" ? "win" : "draw";
    const at = Date.now();

    try {
      await updateDoc(doc(db, "rooms", roomId), {
        "pk.status": "ended",
        "pk.result": res,
        "pk.finalMy": my,
        "pk.finalOpp": opp,
        "pk.endedAt": at,
      });
      if (cur.opponentRoomId && (early || isAuthority)) {
        updateDoc(doc(db, "rooms", cur.opponentRoomId), {
          "pk.status": "ended",
          "pk.result": inv,
          "pk.finalMy": opp,
          "pk.finalOpp": my,
          "pk.endedAt": at,
        }).catch(() => {});
      }
    } catch (e) {
      pkEndingRef.current = null;
      console.log("PK END ERROR:", e);
    }
  };

  // countdown (host also triggers the end when it hits 0)
  useEffect(() => {
    if (!pkActive || !pk?.endAt) return;
    const tick = () => {
      // the visible countdown lives in <PkTimerPill/>; this only decides the end
      const left = Math.max(0, Math.ceil((pk.endAt - Date.now()) / 1000));
      if (left <= 0 && isHost) {
        endPk(false); // only the authority host actually writes
        // the other host waits a moment, then ends it itself if nothing came
        if (!pkFallbackTimerRef.current) {
          pkFallbackTimerRef.current = setTimeout(() => endPk(false, true), 3500);
        }
      }
    };
    tick();
    const i = setInterval(tick, 500);
    return () => {
      clearInterval(i);
      if (pkFallbackTimerRef.current) {
        clearTimeout(pkFallbackTimerRef.current);
        pkFallbackTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkActive, pk?.endAt, pk?.pkId]);

  // opponent left / ended their live → end PK
  useEffect(() => {
    if (!isHost || !pkActive || !oppLoaded) return;
    const gone =
      !oppRoom ||
      oppRoom.status === "ended" ||
      !oppRoom.pk ||
      oppRoom.pk.pkId !== pk?.pkId;
    if (!gone) return;
    // Don't end on a single glitchy snapshot: the opponent must stay "gone"
    // for a few seconds, and never during the first seconds after PK start.
    const sinceStart = Date.now() - (pk?.startAt || 0);
    const wait = Math.max(4000, 10000 - sinceStart);
    const t = setTimeout(() => endPk(false, true), wait);
    return () => clearTimeout(t); // state changed back to normal → cancel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppRoom, oppLoaded, pkActive, pk?.pkId]);

  // PK result = LOSE → this host sends his tracked face position (~4x/sec) so everybody's
  // tears / moustache / black face stick to the real face.
  useEffect(() => {
    if (!isHost || !pkEnded || pk?.result !== "lose" || !db || !roomId) return;
    let last: any = null;
    const i = setInterval(() => {
      const f = faceRectRef.current;
      if (!f || Date.now() - f.at > 1500) return; // no fresh face → panel keeps last spot
      if (
        last &&
        Math.abs(f.cx - last.cx) < 0.008 &&
        Math.abs(f.cy - last.cy) < 0.008 &&
        Math.abs(f.w - last.w) < 0.01
      )
        return;
      last = f;
      updateDoc(doc(db, "rooms", roomId), {
        "pk.face": { cx: f.cx, cy: f.cy, w: f.w, h: f.h, ar: f.ar },
      }).catch(() => {});
    }, 250);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, pkEnded, pk?.result, pk?.pkId]);

  // after the result was shown for 8s → clear PK from the room
  useEffect(() => {
    if (!isHost || !pkEnded || !db || !roomId) return;
    const t = setTimeout(() => {
      updateDoc(doc(db, "rooms", roomId), { pk: deleteField() }).catch(() => {});
    }, PK_RESULT_SHOW_MS);
    return () => clearTimeout(t);
  }, [isHost, pkEnded, pk?.pkId]);

  // PK khatam hone ke baad 5 sec ke liye "Start PK" button (sirf host ko)
  const [showStartPk, setShowStartPk] = useState(false);
  useEffect(() => {
    if (!isHost || !pkEnded) {
      setShowStartPk(false);
      return;
    }
    const left = 5000 - (Date.now() - Number(pk?.endedAt || Date.now()));
    if (left <= 0) {
      setShowStartPk(false);
      return;
    }
    setShowStartPk(true);
    const t = setTimeout(() => setShowStartPk(false), left);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, pkEnded, pk?.pkId, pk?.endedAt]);

  // score bar slides smoothly instead of jumping on every gift
  useEffect(() => {
    Animated.timing(pkBarAnim, { toValue: myPct, duration: 350, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPct]);

  useEffect(() => {
    setOppMuted(false);
  }, [pk?.pkId]);

  // Fetch the opponent-channel token BEFORE the PK starts, so the right panel gets video at once
  // (before: token was fetched only after "accept" -> long dark "Connecting..." panel).
  const prefetchOppToken = (channel?: string | null) => {
    if (!channel || !agoraEngineRef.current) return;
    if (oppTokenRef.current?.channel === channel) return;
    const wantedUid = (myAgoraUidRef.current || 1) + PK_UID_OFFSET;
    oppTokenRef.current = { channel, promise: fetchAgoraToken(channel, wantedUid) };
  };

  // incoming invite → wake the token server while the host is deciding
  useEffect(() => {
    if (showInvite) {
      warmUpBackend();
      prefetchOppToken(pkInvite?.fromRoomId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInvite]);

  // inviter (and the inviter's viewers): PK is "invited" -> prefetch the opponent token now
  useEffect(() => {
    if (agoraReady && pkInvited && pk?.opponentRoomId) prefetchOppToken(pk.opponentRoomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agoraReady, pkInvited, pk?.opponentRoomId]);

  // inviter: cancel automatically if nobody answers
  useEffect(() => {
    if (!isHost || !pkInvited) return;
    const t = setTimeout(() => cancelPkInvite(), matching ? 15000 : PK_INVITE_TTL);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, pkInvited, pk?.pkId]);

  // receiver: hide the invite popup after its TTL
  useEffect(() => {
    if (!isHost || !pkInvite) return;
    const left = Math.max(0, PK_INVITE_TTL - (Date.now() - (pkInvite.at || 0)));
    const t = setTimeout(() => setInviteHiddenId(pkInvite.pkId), left);
    return () => clearTimeout(t);
  }, [isHost, pkInvite?.pkId]);

  // active hosts I could battle (used by the PK sheet and Random Match)
  const fetchPkCandidates = async (includeBusy = false) => {
    if (!db) return [];
    const snap = await getDocs(query(collection(db, "rooms"), where("status", "==", "active")));
    const now = Date.now();
    const list: any[] = [];
    snap.forEach((d) => {
      if (d.id === roomId) return;
      const x: any = d.data();
      if (!x?.hostId || x.hostId === currentUid) return;
      if (blockedRef.current.has(x.hostId)) return; // BLOCK: PK list me blocked host nahi
      const hb = x.lastHeartbeat?.toMillis?.() || 0;
      if (!hb || now - hb > 45000) return; // not really live anymore
      // voice rooms can't PK / already in a PK or has a pending invite
      const busy = x.seatsData ? "Voice room" : x.pk || x.pkInvite ? "In PK" : "";
      if (busy && !includeBusy) return;
      list.push({
        busy,
        id: d.id,
        hostId: x.hostId,
        name: x.hostName || "Host",
        img: x.hostImg || STABLE_AVATAR,
        title: x.title || x.roomName || "",
        viewers: Number(x.viewerCount || 0),
        stars: Number(x.seatStars?.[x.hostId] || 0),
      });
    });
    return list;
  };

  const loadFollowing = async () => {
    if (!db || !currentUid) return;
    try {
      const fs = await getDocs(query(collection(db, "users", currentUid, "following"), limit(300)));
      const set = new Set<string>();
      fs.forEach((d) => set.add(d.id));
      setFollowingIds(set);
    } catch (e) {
      console.log("FOLLOWING LOAD ERROR:", e);
    }
  };

  // my friends for the PK sheet (profiles cached for the session)
  // friendIdSet holds EVERY friend uid, so a friend who is live is always shown
  // (live rows come from the rooms query, they don't need a profile read).
  const loadFriends = async () => {
    if (!db || !currentUid) return;
    try {
      const fSnap = await getDocs(query(collection(db, "users", currentUid, "following"), limit(300)));
      const following = new Set<string>();
      fSnap.forEach((d) => following.add(d.id));
      setFollowingIds(following);

      let ids: string[] = Array.from(following);
      if (PK_FRIEND_MODE === "mutual" || PK_FRIEND_MODE === "either") {
        const rSnap = await getDocs(query(collection(db, "users", currentUid, "followers"), limit(300)));
        const followers = new Set<string>();
        rSnap.forEach((d) => followers.add(d.id));
        ids =
          PK_FRIEND_MODE === "mutual"
            ? ids.filter((id) => followers.has(id))
            : Array.from(new Set<string>([...ids, ...Array.from(followers)]));
      }
      ids = ids.filter((id) => id !== currentUid && !blockedRef.current.has(id));
      setFriendIdSet(new Set(ids));

      // profiles (for the OFFLINE rows) only for the first PK_FRIEND_LIMIT
      const list = await Promise.all(
        ids.slice(0, PK_FRIEND_LIMIT).map(async (uid) => {
          if (friendProfilesRef.current[uid]) return friendProfilesRef.current[uid];
          let prof: any = { uid, name: "User", img: STABLE_AVATAR };
          try {
            const sn = await getDoc(doc(db, "users", uid));
            if (sn.exists()) {
              const u: any = sn.data();
              prof = { uid, name: u.username || u.name || "User", img: u.profileImg || u.photoURL || STABLE_AVATAR };
            }
          } catch (e) {}
          friendProfilesRef.current[uid] = prof;
          return prof;
        })
      );
      setFriendsList(list);
    } catch (e) {
      console.log("FRIENDS LOAD ERROR:", e);
    }
  };

  const openPkList = async () => {
    if (!db) return;
    warmUpBackend(); // wake the token server now so the opponent video loads fast
    setPkListVisible(true);
    setPkLoading(true);
    loadFriends();
    try {
      setPkCandidates(await fetchPkCandidates(true));
    } catch (e) {
      console.log("PK LIST ERROR:", e);
    }
    setPkLoading(false);
  };

  // PK sheet open → refresh live list every 8s so a friend who just went live shows up
  useEffect(() => {
    if (!pkListVisible || !isHost) return;
    let stop = false;
    const i = setInterval(async () => {
      try {
        const l = await fetchPkCandidates(true);
        if (!stop) setPkCandidates(l);
      } catch (e) {}
    }, 5000);
    return () => {
      stop = true;
      clearInterval(i);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkListVisible, isHost]);

  // ----- Random Match: keeps picking a random live host and inviting until someone accepts -----
  const startRandomMatch = () => {
    if (pkBusy) return;
    warmUpBackend();
    matchTriedRef.current = new Set();
    matchStartRef.current = Date.now();
    setPkListVisible(false);
    setMatchMini(false);
    setMatching(true);
  };

  const cancelMatching = () => {
    setMatching(false);
    setMatchMini(false);
    if (roomDataRef.current?.pk?.status === "invited") cancelPkInvite();
  };

  useEffect(() => {
    if (!matching || !isHost) return;
    if (pkActive) {
      setMatching(false);
      setMatchMini(false);
      return;
    }
    let stop = false;
    let busy = false;
    const tryMatch = async () => {
      if (stop || busy) return;
      if (Date.now() - matchStartRef.current > MATCH_TIMEOUT_SEC * 1000) {
        setMatching(false);
        setMatchMini(false);
        cancelPkInvite();
        showToast("No host available right now. Try again later.");
        return;
      }
      // an invite is pending / a battle is starting → just wait
      if (roomDataRef.current?.pk || roomDataRef.current?.pkInvite) return;
      busy = true;
      try {
        let list = (await fetchPkCandidates()).filter((c: any) => !matchTriedRef.current.has(c.id));
        if (stop) return;
        if (!list.length) {
          matchTriedRef.current = new Set(); // everyone tried → allow retries
          return;
        }
        const pick = list[Math.floor(Math.random() * list.length)];
        matchTriedRef.current.add(pick.id);
        await sendPkInvite(pick);
      } catch (e) {
        console.log("MATCH ERROR:", e);
      } finally {
        busy = false;
      }
    };
    tryMatch();
    const i = setInterval(tryMatch, 3000);
    return () => {
      stop = true;
      clearInterval(i);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matching, pkActive]);

  const sendPkInvite = async (target: any) => {
    if (!db || !roomId || pkBusy) return;
    setPkBusy(true);
    const pkId = `${Date.now()}`;
    try {
      await updateDoc(doc(db, "rooms", roomId), {
        pk: {
          pkId,
          status: "invited",
          opponentRoomId: target.id,
          opponentHostId: target.hostId,
          opponentName: target.name,
          opponentImg: target.img,
          duration: pkDuration,
          score: 0,
        },
      });
      await updateDoc(doc(db, "rooms", target.id), {
        pkInvite: {
          pkId,
          fromRoomId: roomId,
          fromHostId: hostId,
          fromName: hostName,
          fromImg: hostImg,
          duration: pkDuration,
          at: Date.now(),
        },
      });
      setPkListVisible(false);
    } catch (e) {
      console.log("PK INVITE ERROR:", e);
      Alert.alert("PK", "Could not send the invite. Try again.");
      updateDoc(doc(db, "rooms", roomId), { pk: deleteField() }).catch(() => {});
    }
    setPkBusy(false);
  };

  const cancelPkInvite = async () => {
    const cur = roomDataRef.current?.pk;
    if (!db || !roomId || !cur || cur.status !== "invited") return;
    try {
      await updateDoc(doc(db, "rooms", roomId), { pk: deleteField() });
      if (cur.opponentRoomId) {
        const s = await getDoc(doc(db, "rooms", cur.opponentRoomId));
        if (s.exists() && s.data()?.pkInvite?.pkId === cur.pkId) {
          await updateDoc(doc(db, "rooms", cur.opponentRoomId), { pkInvite: deleteField() });
        }
      }
    } catch (e) {
      console.log("PK CANCEL ERROR:", e);
    }
  };

  const acceptPkInvite = async () => {
    const inv = roomDataRef.current?.pkInvite;
    if (!db || !roomId || !inv || pkBusy) return;
    setPkBusy(true);
    try {
      const inviterRef = doc(db, "rooms", inv.fromRoomId);
      const inviterSnap = await getDoc(inviterRef);
      if (!inviterSnap.exists() || inviterSnap.data()?.pk?.pkId !== inv.pkId) {
        await updateDoc(doc(db, "rooms", roomId), { pkInvite: deleteField() });
        Alert.alert("PK", "This invite is no longer available.");
        setPkBusy(false);
        return;
      }

      const startAt = Date.now();
      const dur = Number(inv.duration) || PK_DURATION_SEC;
      const endAt = startAt + dur * 1000;
      const batch = writeBatch(db);
      batch.update(doc(db, "rooms", roomId), {
        pk: {
          pkId: inv.pkId,
          status: "active",
          opponentRoomId: inv.fromRoomId,
          opponentHostId: inv.fromHostId,
          opponentName: inv.fromName,
          opponentImg: inv.fromImg,
          startAt,
          endAt,
          score: 0,
        },
        pkInvite: deleteField(),
      });
      batch.update(inviterRef, {
        pk: {
          pkId: inv.pkId,
          status: "active",
          opponentRoomId: roomId,
          opponentHostId: hostId,
          opponentName: hostName,
          opponentImg: hostImg,
          startAt,
          endAt,
          score: 0,
        },
      });
      await batch.commit();
    } catch (e) {
      console.log("PK ACCEPT ERROR:", e);
      Alert.alert("PK", "Could not start the PK.");
    }
    setPkBusy(false);
  };

  const declinePkInvite = async () => {
    const inv = roomDataRef.current?.pkInvite;
    if (!db || !roomId || !inv) return;
    try {
      await updateDoc(doc(db, "rooms", roomId), { pkInvite: deleteField() });
      const s = await getDoc(doc(db, "rooms", inv.fromRoomId));
      if (s.exists() && s.data()?.pk?.pkId === inv.pkId) {
        await updateDoc(doc(db, "rooms", inv.fromRoomId), { pk: deleteField() });
      }
    } catch (e) {
      console.log("PK DECLINE ERROR:", e);
    }
  };

  const onStartPkAgain = () => {
    setShowStartPk(false);
    // purana result turant hata do, phir naya PK ke liye friend list kholo
    if (db && roomId) updateDoc(doc(db, "rooms", roomId), { pk: deleteField() }).catch(() => {});
    openPkList();
  };

  const onPkButton = () => {
    if (pkActive) {
      Alert.alert("End PK?", "The battle will end now and the current score decides the winner.", [
        { text: "Cancel", style: "cancel" },
        { text: "End PK", style: "destructive", onPress: () => endPk(true) },
      ]);
    } else if (pkInvited) {
      cancelPkInvite();
    } else if (!pkEnded) {
      openPkList();
    }
  };

  // ---------- PK: peek into the opponent's Agora channel (host + viewers) ----------
  // Joins the opponent's channel as AUDIENCE (no publishing) so we can show
  // their video on the right half and hear them.
  useEffect(() => {
    const engine = agoraEngineRef.current;
    const oppChannel = showPk ? pk?.opponentRoomId : null;
    if (!agoraReady || !engine || !oppChannel) return;

    let cancelled = false;
    let joinedConn: any = null;

    (async () => {
      const wantedUid = (myAgoraUidRef.current || 1) + PK_UID_OFFSET;
      const pre = oppTokenRef.current;
      oppTokenRef.current = null;
      let t: any =
        pre && pre.channel === oppChannel
          ? await pre.promise
          : await fetchAgoraToken(oppChannel, wantedUid, () => cancelled);
      if (!cancelled && !t?.token) {
        // token server was slow / cold → one more try before joining
        await new Promise((r) => setTimeout(r, 1500));
        if (cancelled) return;
        t = await fetchAgoraToken(oppChannel, wantedUid, () => cancelled);
      }
      if (cancelled) return;
      const conn = { channelId: oppChannel, localUid: t.uid || wantedUid };
      try {
        engine.joinChannelEx(t.token || "", conn, {
          channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
          clientRoleType: ClientRoleType.ClientRoleAudience,
          autoSubscribeAudio: true,
          autoSubscribeVideo: true,
          publishCameraTrack: false,
          publishMicrophoneTrack: false,
        });
        joinedConn = conn;
        setPkConn(conn);
        if (soundMutedRef.current) {
          try {
            engine.muteAllRemoteAudioStreamsEx(true, conn);
          } catch (_) {}
        }
      } catch (e) {
        console.log("PK JOIN OPPONENT CHANNEL ERROR:", e);
      }
    })();

    return () => {
      cancelled = true;
      setPkConn(null);
      setOppRemoteUid(null);
      if (joinedConn) {
        try {
          engine.leaveChannelEx(joinedConn);
        } catch (_) {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agoraReady, showPk, pk?.pkId, pk?.opponentRoomId]);

  // ---------- Agora: host broadcasts video, viewer just watches ----------
  // Order matters for speed:
  //   1) engine + camera preview start IMMEDIATELY (host sees himself at once)
  //   2) the token is fetched in the background (Render cold start = slow)
  //   3) join the channel with a real token; renew / retry if Agora complains
  useEffect(() => {
    if (!roomId) return;
    let mounted = true;
    let engine: any = null;
    let joinTimeoutId: any = null;
    let mainLive = false;
    let rejoinCount = 0;
    let prefetchedToken: Promise<any> | null = null;
    let numericUid = Math.floor(Math.random() * 999999) + 1;

    const isCancelled = () => !mounted;
    const setStatus = (v: string) => {
      if (mounted) setAgoraStatus(v);
    };
    const clearJoinTimer = () => {
      if (joinTimeoutId) {
        clearTimeout(joinTimeoutId);
        joinTimeoutId = null;
      }
    };

    // fetch token (with retries) then join the main channel
    const getTokenAndJoin = async () => {
      if (!mounted || !engine) return;
      setStatus(isHost ? "Connecting..." : "Connecting to live...");

      let res: any;
      if (prefetchedToken) {
        res = await prefetchedToken; // usually already finished while the engine started
        prefetchedToken = null;
      } else {
        res = await fetchAgoraToken(roomId, numericUid, isCancelled, () => setStatus("Waking up server..."));
      }
      if (!mounted || !engine) return;

      numericUid = res.uid || numericUid;
      myAgoraUidRef.current = numericUid;

      if (!res.token) {
        console.log("AGORA: no token from backend, trying to join without one");
      }

      // Failsafe: never spin on "Connecting..." forever.
      clearJoinTimer();
      joinTimeoutId = setTimeout(() => {
        if (!mounted) return;
        setAgoraStatus((cur) =>
          cur === "Connecting..." || cur === "Connecting to live..." || cur === "Reconnecting..."
            ? "Failed: Could not reach the live server"
            : cur
        );
      }, 20000);

      const ret = engine.joinChannel(res.token || "", roomId, numericUid, {
        channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
        clientRoleType: isHost ? ClientRoleType.ClientRoleBroadcaster : ClientRoleType.ClientRoleAudience,
        publishCameraTrack: isHost,
        publishMicrophoneTrack: isHost,
        autoSubscribeAudio: true,
        autoSubscribeVideo: true,
      });
      if (typeof ret === "number" && ret < 0) console.log("AGORA joinChannel returned", ret);
    };

    // token close to expiry / expired while live → get a fresh one and renew
    const renewMainToken = async () => {
      const res = await fetchAgoraToken(roomId, numericUid, isCancelled);
      if (res.token && mounted && engine) {
        try {
          engine.renewToken(res.token);
        } catch (e) {
          console.log("RENEW TOKEN ERROR:", e);
        }
      }
    };

    // token was rejected while joining → leave, get a new token, join again
    const rejoin = () => {
      if (!mounted || !engine || rejoinCount >= 2) return false;
      rejoinCount++;
      setStatus("Reconnecting...");
      try {
        engine.leaveChannel();
      } catch (_) {}
      getTokenAndJoin();
      return true;
    };

    const initAgora = async () => {
      try {
        // wake the backend up NOW, while permissions / camera are starting
        warmUpBackend();

        // uid + token request start immediately and run IN PARALLEL with
        // permissions / engine init, so the join happens the moment the engine is ready
        if (auth?.currentUser) {
          numericUid =
            (currentUid || "guest").split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0) %
            1000000;
          if (!numericUid) numericUid = 1;
        }
        myAgoraUidRef.current = numericUid;
        prefetchedToken = fetchAgoraToken(roomId, numericUid, isCancelled, () => setStatus("Waking up server..."));

        // Give the PREVIOUS screen's camera a brief moment to fully release
        // the hardware (otherwise the live can freeze on a single frame).
        if (isHost) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          if (!mounted) return;
        }

        if (Platform.OS === "android" && isHost) {
          const perms = [PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
          const granted = await PermissionsAndroid.requestMultiple(perms);
          if (!mounted) return;
          if (granted[PermissionsAndroid.PERMISSIONS.CAMERA] !== PermissionsAndroid.RESULTS.GRANTED) {
            throw new Error("Camera permission denied");
          }
        }

        engine = createAgoraRtcEngine();
        engine.initialize({
          appId: AGORA_APP_ID,
          channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
        });
        agoraEngineRef.current = engine; // set early so cleanup + tools can always reach it

        engine.registerEventHandler({
          // Agora face detection: face dikhte hi time update. Black screen / camera band / face hata -> update nahi hota.
          onFacePositionChanged: (w: number, h: number, rects: any, _dist: any, numFaces: number) => {
            if (!isHost || !(Number(numFaces) > 0)) return;
            lastFaceAtRef.current = Date.now();
            // keep the biggest face as 0..1 fractions of the camera image (for the PK loser filter)
            try {
              const arr: any[] = Array.isArray(rects) ? rects : [];
              let best: any = null;
              for (const r of arr) {
                if (r && (!best || r.width * r.height > best.width * best.height)) best = r;
              }
              if (best && w > 0 && h > 0) {
                faceRectRef.current = {
                  cx: (best.x + best.width / 2) / w,
                  cy: (best.y + best.height / 2) / h,
                  w: best.width / w,
                  h: best.height / h,
                  ar: w / h,
                  at: Date.now(),
                };
              }
            } catch (_) {}
          },
          onJoinChannelSuccess: (connection: any) => {
            if (connection?.channelId && connection.channelId !== roomId) return; // PK channel
            console.log("VIDEO LIVE: joined channel", roomId, "as", isHost ? "host" : "viewer");
            mainLive = true;
            clearJoinTimer();
            setStatus("Live");
            // viewers use this to tell the HOST's video apart from guest videos
            if (isHost && db && roomId) {
              updateDoc(doc(db, "rooms", roomId), { hostAgoraUid: myAgoraUidRef.current || numericUid }).catch(() => {});
            }
          },
          onUserJoined: (connection: any, uid: number) => {
            if (!mounted) return;
            if (connection?.channelId && connection.channelId !== roomId) {
              // opponent host's camera (PK)
              setOppRemoteUid(uid);
              return;
            }
            setRemoteUsers((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
          },
          onRemoteVideoStateChanged: (connection: any, uid: number, state: number) => {
            if (!mounted) return;
            if (connection?.channelId && connection.channelId !== roomId) {
              // 1 = starting, 2 = decoding → opponent video is really there
              if (state === 1 || state === 2) setOppRemoteUid(uid);
              return;
            }
            // main channel: remember who's video is really showing (guest tiles use this)
            if (state === 1 || state === 2) setRemoteVideoOn((p) => (p[uid] ? p : { ...p, [uid]: true }));
            else if (state === 0) setRemoteVideoOn((p) => (p[uid] === false ? p : { ...p, [uid]: false }));
          },
          onUserOffline: (connection: any, uid: number) => {
            if (!mounted) return;
            if (connection?.channelId && connection.channelId !== roomId) {
              setOppRemoteUid((cur) => (cur === uid ? null : cur));
              return;
            }
            setRemoteUsers((prev) => prev.filter((id) => id !== uid));
            setRemoteVideoOn((p) => {
              if (!(uid in p)) return p;
              const n = { ...p };
              delete n[uid];
              return n;
            });
          },
          // 8 = invalid token, 9 = token expired (only for the main channel)
          onConnectionStateChanged: (connection: any, _state: number, reason: number) => {
            if (!mounted) return;
            if (connection?.channelId !== roomId) return;
            if (reason === 8 || reason === 9) {
              if (mainLive) renewMainToken();
              else rejoin();
            }
          },
          onTokenPrivilegeWillExpire: (connection: any) => {
            if (connection?.channelId && connection.channelId !== roomId) return;
            renewMainToken();
          },
          onRequestToken: (connection: any) => {
            if (connection?.channelId && connection.channelId !== roomId) return;
            renewMainToken();
          },
          onError: (err: number, msg: string) => {
            console.log("Agora Error:", err, msg);
            if (!mounted) return;
            // 109 = token expired, 110 = invalid token
            if (err === 109 || err === 110) {
              if (mainLive) {
                renewMainToken();
                return;
              }
              if (rejoin()) return;
            }
            clearJoinTimer();
            setStatus(`Failed: Agora error ${err}`);
          },
          // remoteUid 0 = my own connection. host → upload quality, viewer → download quality.
          onNetworkQuality: (connection: any, remoteUid: number, txQuality: number, rxQuality: number) => {
            if (!mounted) return;
            if (connection?.channelId && connection.channelId !== roomId) return;
            if (remoteUid !== 0) return;
            const q = Number(isHost ? txQuality : rxQuality) || 0;
            if (q > 0) setNetQuality(q);
          },
        });

        await engine.enableVideo();
        if (!mounted) return;

        if (!isHost) {
          try {
            // weak network → viewer automatically gets the small stream instead of freezing
            engine.setRemoteSubscribeFallbackOption(1);
          } catch (_) {}
        }

        if (isHost) {
          await engine.enableAudio();
          await engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
          if (!mounted) return;

          try {
            engine.setVideoEncoderConfiguration(VIDEO_PROFILE);
          } catch (e) {
            console.log("VIDEO CONFIG ERROR:", e);
          }
          try {
            // viewers on a weak network automatically get a small stream
            engine.enableDualStreamMode(true);
          } catch (_) {}

          engine.startPreview();
          try {
            // 0 = chalu ho gaya. Kisi device par na chale to ban nahi lagayenge (galat ban se bachne ke liye)
            faceCheckOnRef.current = Number((engine as any).enableFaceDetection(true)) === 0;
            lastFaceAtRef.current = Date.now();
            console.log("FACE DETECTION:", faceCheckOnRef.current ? "ON" : "NOT SUPPORTED");
          } catch (e) {
            faceCheckOnRef.current = false;
          }
          // Host sees his own camera right now — no need to wait for the token.
          if (mounted) setLocalReady(true);
        } else {
          await engine.setClientRole(ClientRoleType.ClientRoleAudience);
          if (!mounted) return;
        }

        await getTokenAndJoin();
        if (mounted) setAgoraReady(true);
      } catch (error: any) {
        console.log("VIDEO LIVE AGORA INIT ERROR:", error?.message || error);
        setStatus(`Failed: ${error?.message || error}`);
      }
    };

    initAgora();

    return () => {
      mounted = false;
      clearJoinTimer();
      const eng = agoraEngineRef.current || engine;
      if (eng) {
        try {
          if (isHost) eng.stopPreview();
          eng.leaveChannel();
          eng.release();
        } catch (e) {
          console.log("AGORA CLEANUP ERROR:", e);
        }
      }
      agoraEngineRef.current = null;
      guestPublishingRef.current = false;
      setAgoraReady(false);
      setLocalReady(false);
      setRemoteUsers([]);
      setRemoteVideoOn({});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost, agoraRetry]);

  // ============================================================
  // TOOLS: mic / video / flip / filter / sound
  // ============================================================

  // Host: network kharab ho to automatically halka stream (kam encode = kam heat, no freeze),
  // network theek ho to wapas normal. 20s se pehle dubara switch nahi hota (flapping nahi).
  const netQualityRef = useRef(0);
  netQualityRef.current = netQuality;
  const lowProfileRef = useRef(false);
  const lastProfileSwitchRef = useRef(0);
  useEffect(() => {
    if (!isHost || !agoraReady) return;
    const t = setInterval(() => {
      const engine = agoraEngineRef.current;
      const q = netQualityRef.current;
      if (!engine || !q) return;
      if (Date.now() - lastProfileSwitchRef.current < 20000) return;
      try {
        if (!lowProfileRef.current && q >= 4) {
          engine.setVideoEncoderConfiguration(VIDEO_PROFILE_LOW);
          lowProfileRef.current = true;
          lastProfileSwitchRef.current = Date.now();
        } else if (lowProfileRef.current && q <= 2) {
          engine.setVideoEncoderConfiguration(VIDEO_PROFILE);
          lowProfileRef.current = false;
          lastProfileSwitchRef.current = Date.now();
        }
      } catch (e) {
        console.log("AUTO PROFILE ERROR:", e);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [isHost, agoraReady]);

  const toggleMic = () => {
    const engine = agoraEngineRef.current;
    if (!engine || !isHost) return;
    const next = !micMuted;
    try {
      engine.muteLocalAudioStream(next);
    } catch (e) {
      console.log("MIC TOGGLE ERROR:", e);
    }
    setMicMuted(next);
    if (db && roomId) updateDoc(doc(db, "rooms", roomId), { hostMicMuted: next }).catch(() => {});
  };

  // "Video push / play" → pause & resume the camera stream
  const toggleVideo = () => {
    const engine = agoraEngineRef.current;
    if (!engine || !isHost) return;
    const next = !videoOff;
    try {
      engine.enableLocalVideo(!next);
      engine.muteLocalVideoStream(next);
    } catch (e) {
      console.log("VIDEO TOGGLE ERROR:", e);
    }
    setVideoOff(next);
    if (db && roomId) updateDoc(doc(db, "rooms", roomId), { hostVideoOff: next }).catch(() => {});
  };

  const flipCamera = () => {
    try {
      agoraEngineRef.current?.switchCamera();
      camFrontRef.current = !camFrontRef.current;
    } catch (e) {
      console.log("FLIP CAMERA ERROR:", e);
    }
  };

  const applyFilter = (f: any) => {
    const engine = agoraEngineRef.current;
    if (!engine || !isHost) return;
    try {
      if (f.beauty) {
        engine.setBeautyEffectOptions(true, f.beauty);
      } else {
        engine.setBeautyEffectOptions(false, {
          lighteningContrastLevel: 1,
          lighteningLevel: 0,
          smoothnessLevel: 0,
          rednessLevel: 0,
          sharpnessLevel: 0,
        });
      }
    } catch (e) {
      console.log("BEAUTY ERROR:", e);
    }
    try {
      if (engine.setColorEnhanceOptions) {
        if (f.color) engine.setColorEnhanceOptions(true, f.color);
        else engine.setColorEnhanceOptions(false, { strengthLevel: 0, skinProtectLevel: 1 });
      }
    } catch (e) {
      console.log("COLOR ENHANCE ERROR:", e);
    }
    setFilterId(f.id);
  };

  // mute / unmute only the OPPONENT's sound during PK
  const toggleOppMute = () => {
    const engine = agoraEngineRef.current;
    if (!engine || !pkConn) return;
    const next = !oppMuted;
    setOppMuted(next);
    try {
      engine.muteAllRemoteAudioStreamsEx(next || soundMutedRef.current, pkConn);
    } catch (e) {
      console.log("OPP MUTE ERROR:", e);
    }
  };

  // viewer: mute the live's sound on this phone only
  const toggleSound = () => {
    const engine = agoraEngineRef.current;
    const next = !soundMuted;
    setSoundMuted(next);
    soundMutedRef.current = next;
    if (!engine) return;
    try {
      engine.muteAllRemoteAudioStreams(next);
      if (pkConn) engine.muteAllRemoteAudioStreamsEx(next || oppMuted, pkConn);
    } catch (e) {
      console.log("SOUND TOGGLE ERROR:", e);
    }
  };

  // ============================================================
  // Exit / share / chat
  // ============================================================

  // hardware back → confirm before leaving / ending the live
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        setExitModalVisible(true);
        return true;
      };
      const sub = scopedBackHandler('/videolive', "hardwareBackPress", onBack);
      return () => sub.remove();
    }, [])
  );

  // Firestore doesn't delete subcollections with the parent → clear them
  // when the host ends the live, otherwise the next live under the same
  // roomId would show old chat / old viewers.
  const clearRoomSubcollection = async (subName: string) => {
    try {
      const snap = await getDocs(collection(db, "rooms", roomId as string, subName));
      if (snap.empty) return;
      const all = snap.docs;
      for (let i = 0; i < all.length; i += 400) {
        const batch = writeBatch(db);
        all.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (e) {
      console.log(`Clear ${subName} error:`, e);
    }
  };

  const fmtDur = (ms: number) => {
    const t = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sc = t % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sc).padStart(2, "0")}`;
  };

  // final leave (after the host has seen the summary, or a plain viewer leaving)
  const doLeaveNow = () => {
    setSummary(null);
    if (amGuest) leaveGuestSeat(); // free my seat before the screen closes
    router.back();
    if (isHost && db && roomId) {
      clearRoomSubcollection("chats");
      clearRoomSubcollection("audience");
    }
  };

  // Host: 5 min se zyada face nahi dikha / black screen -> live end + 30 min live band.
  // 4 min par ek warning. Timer Date.now() par chalta hai.
  useEffect(() => {
    if (!isHost || !roomId || !db) return;
    const NO_FACE_LIMIT_MS = 5 * 60 * 1000;
    const WARN_AT_MS = 4 * 60 * 1000;
    const iv = setInterval(() => {
      if (!faceCheckOnRef.current || faceBanFiredRef.current) return;
      const idle = Date.now() - lastFaceAtRef.current;
      if (idle < WARN_AT_MS) {
        faceWarnedRef.current = false;
        return;
      }
      if (idle < NO_FACE_LIMIT_MS) {
        if (!faceWarnedRef.current) {
          faceWarnedRef.current = true;
          showToast("⚠️ Face nahi dikh raha! 1 minute me live band ho jayegi");
        }
        return;
      }
      faceBanFiredRef.current = true;
      // 1) live end (viewers wapas bhej diye jayenge)
      updateDoc(doc(db, "rooms", roomId), {
        status: "ended",
        endedAt: serverTimestamp(),
        pk: deleteField(),
        pkInvite: deleteField(),
        guestReq: deleteField(),
      }).catch(() => {});
      // 2) 30 min ban. Server liveBans likhta hai -> useLiveBanGuard alert dikhakar bahar nikal deta hai
      callApi("/live/auto-video-ban", { roomId }).catch(() => {
        try { router.replace("/"); } catch (_) {}
      });
    }, 10000);
    return () => clearInterval(iv);
  }, [isHost, roomId]);

  const confirmExit = () => {
    setExitModalVisible(false);
    if (isHost && db && roomId) {
      // End the live NOW (viewers get sent back), then show the host a summary.
      const rd = roomDataRef.current || {};
      const gifters = Object.values(rd.roomGifters || {})
        .filter((g: any) => g && Number(g.stars) > 0)
        .sort((a: any, b: any) => Number(b.stars) - Number(a.stars))
        .slice(0, 3);
      clearInterval(heartbeatRef.current);
      setSummary({
        durationMs: Date.now() - (roomStartTime || Date.now()),
        peak: Math.max(peakViewersRef.current, viewerCount),
        likes: Number(rd.likes || 0),
        stars: Number(rd.seatStars?.[hostId as string] || 0),
        followers: Number(rd.newFollowers || 0),
        gifters,
      });
      updateDoc(doc(db, "rooms", roomId), {
        status: "ended",
        endedAt: serverTimestamp(),
        pk: deleteField(),
        pkInvite: deleteField(),
        guestReq: deleteField(),
      }).catch(() => {});
      return;
    }
    doLeaveNow();
  };

  const handleShare = async () => {
    try {
      const shareLink = `https://topking-short.vercel.app/live/${roomId}`;
      await Share.share({ message: `🎥 Join ${hostName}'s Live now!\n${shareLink}` });
    } catch (e) {
      console.log(e);
    }
  };

  const openChat = () => {
    if (amMuted && !isMod) {
      Alert.alert("Muted", "The host has muted you in this live.");
      return;
    }
    if (chatLocked && !isMod) {
      Alert.alert("Chat is off", "The host has turned chat off for viewers.");
      return;
    }
    setChatOpen(true);
  };

  // ============================================================
  // GUEST SEATS — viewer joins the host's video call (live-room style)
  //   viewer taps the gold link button → request → host accepts →
  //   viewer becomes a broadcaster and shows up as a tile on the right.
  //   rooms/{id}/requests/{uid}  = waiting request (written by the viewer)
  //   rooms/{id}.guests.{uid}    = seated guest   (written by the host)
  // ============================================================

  const withdrawGuestRequest = () => {
    if (!db || !roomId || !currentUid) return;
    updateDoc(doc(db, "rooms", roomId), { [`guestReq.${currentUid}`]: deleteField() }).catch(() => {});
  };

  const sendGuestRequest = async () => {
    if (!db || !roomId || !currentUid) {
      showToast("Please log in again to send a request");
      return;
    }
    if (amGuest) {
      setMenuVisible(true);
      return;
    }
    if (showPk) {
      showToast("Guest join is off while a PK is running");
      return;
    }
    if (guestList.length >= MAX_GUESTS) {
      showToast("All guest seats are full");
      return;
    }
    if (myReqPending) {
      Alert.alert("Join request", "Your request is waiting for the host.", [
        { text: "Keep waiting", style: "cancel" },
        {
          text: "Cancel request",
          style: "destructive",
          onPress: () => {
            reqCancelledByMeRef.current = true;
            withdrawGuestRequest();
          },
        },
      ]);
      return;
    }
    try {
      // dotted path = only MY entry changes, other viewers' requests are never overwritten
      await updateDoc(doc(db, "rooms", roomId), {
        [`guestReq.${currentUid}`]: {
          uid: currentUid,
          name: currentRealName || "User",
          username: currentName || "User",
          img: currentAvatar || STABLE_AVATAR,
          level: Number(myLevel) || 1,
          verified: myVerified,
          verifiedColor: normTickColor(myVerifiedColor),
          agoraUid: myAgoraUidRef.current || null,
          at: Date.now(),
        },
      });
      reqCancelledByMeRef.current = false;
      showToast("Request sent, please wait for confirmation");
    } catch (e: any) {
      console.log("REQUEST ERROR:", e?.code, e?.message || e);
      showToast(`Could not send the request${e?.code ? ` (${e.code})` : ""}`);
    }
  };

  // viewer: my request disappeared and I'm not seated = the host declined it
  const reqWasPendingRef = useRef(false);
  const reqCancelledByMeRef = useRef(false);
  useEffect(() => {
    if (isHost) return;
    if (myReqPending) {
      reqWasPendingRef.current = true;
      return;
    }
    if (!reqWasPendingRef.current) return;
    reqWasPendingRef.current = false;
    if (!amGuest && !reqCancelledByMeRef.current) showToast("The host did not accept your request");
    reqCancelledByMeRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, myReqPending, amGuest]);

  // viewer leaves the screen → my waiting request must not stay on the host's list
  useEffect(() => {
    if (isHost || !db || !roomId || !currentUid) return;
    return () => {
      updateDoc(doc(db, "rooms", roomId), { [`guestReq.${currentUid}`]: deleteField() }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, roomId, currentUid]);

  // ----- guest: start / stop publishing my camera + mic -----
  const stopGuestPublishing = () => {
    guestPublishingRef.current = false;
    const engine = agoraEngineRef.current;
    if (!engine) return;
    try {
      engine.stopPreview();
    } catch (_) {}
    try {
      engine.updateChannelMediaOptions({
        clientRoleType: ClientRoleType.ClientRoleAudience,
        publishCameraTrack: false,
        publishMicrophoneTrack: false,
      });
    } catch (_) {}
    try {
      engine.setClientRole(ClientRoleType.ClientRoleAudience);
    } catch (_) {}
  };

  // guest leaves the seat (button) or screen closes
  const leaveGuestSeat = async () => {
    if (!db || !roomId || !currentUid) return;
    stopGuestPublishing();
    try {
      await updateDoc(doc(db, "rooms", roomId), { [`guests.${currentUid}`]: deleteField() });
    } catch (e) {
      console.log("LEAVE SEAT ERROR:", e);
    }
  };

  useEffect(() => {
    const engine = agoraEngineRef.current;
    if (isHost || !engine || !agoraReady) return;

    if (amGuest && !guestPublishingRef.current) {
      guestPublishingRef.current = true;
      setGuestMicOn(true);
      setGuestCamOn(false);
      (async () => {
        try {
          if (Platform.OS === "android") {
            const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
              throw new Error("Mic permission denied");
            }
          }
          engine.enableAudio();
          // guest = AUDIO ONLY: camera never opens
          try { engine.enableLocalVideo(false); } catch (_) {}
          engine.muteLocalAudioStream(false);
          engine.muteLocalVideoStream(true);
          engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
          engine.updateChannelMediaOptions({
            clientRoleType: ClientRoleType.ClientRoleBroadcaster,
            publishCameraTrack: false,
            publishMicrophoneTrack: true,
            autoSubscribeAudio: true,
            autoSubscribeVideo: true,
          });
          showToast("You are on the call with the host 🎤");
        } catch (e: any) {
          console.log("GUEST PUBLISH ERROR:", e?.message || e);
          Alert.alert("Could not join", e?.message || "Mic could not start.");
          leaveGuestSeat();
        }
      })();
    } else if (!amGuest && guestPublishingRef.current) {
      // host removed me (or I left) → back to a normal viewer
      stopGuestPublishing();
      showToast("You left the call");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amGuest, agoraReady, isHost]);

  // guest: apply my mic switch + the host's "mute" together
  useEffect(() => {
    if (!amGuest) return;
    try {
      agoraEngineRef.current?.muteLocalAudioStream(hostMutedMe || !guestMicOn);
    } catch (_) {}
  }, [amGuest, hostMutedMe, guestMicOn]);

  // guest: camera switch
  useEffect(() => {
    if (!amGuest) return;
    try {
      agoraEngineRef.current?.muteLocalVideoStream(true); // audio only
    } catch (_) {}
  }, [amGuest, guestCamOn]);

  const toggleGuestMic = () => {
    if (hostMutedMe) {
      showToast("The host muted your mic");
      return;
    }
    setGuestMicOn((v) => !v);
  };

  // ----- host: tell me when a NEW viewer asks to join -----
  const seenReqRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isHost) return;
    pendingRequests.forEach((r: any) => {
      if (seenReqRef.current.has(r.uid)) return;
      seenReqRef.current.add(r.uid);
      showToast(`${r.username || r.name || "A viewer"} wants to join the call`);
    });
    // forget people who are no longer waiting so a second request toasts again
    const live = new Set(pendingRequests.map((r: any) => r.uid));
    seenReqRef.current.forEach((u) => {
      if (!live.has(u)) seenReqRef.current.delete(u);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, roomData?.guestReq]);

  // ----- host: accept / reject / remove / mute -----
  const acceptGuest = async (req: any) => {
    if (!db || !roomId || !req?.uid) return;
    if (showPk) {
      showToast("End the PK first, then accept guests");
      return;
    }
    if (guestList.length >= MAX_GUESTS) {
      showToast("All guest seats are full");
      return;
    }
    try {
      // ONE atomic write: seat the guest and drop the request together
      await updateDoc(doc(db, "rooms", roomId), {
        [`guests.${req.uid}`]: {
          uid: req.uid,
          name: req.username || req.name || "Guest",
          img: req.img || STABLE_AVATAR,
          level: Number(req.level || 1),
          verified: isVerified(req.verified),
          verifiedColor: normTickColor(req.verifiedColor),
          agoraUid: Number(req.agoraUid) || null,
          hostMuted: false,
          at: Date.now(),
        },
        [`guestReq.${req.uid}`]: deleteField(),
      });
    } catch (e: any) {
      console.log("ACCEPT GUEST ERROR:", e?.code, e?.message || e);
      showToast(`Could not accept the request${e?.code ? ` (${e.code})` : ""}`);
    }
  };

  const rejectGuest = (req: any) => {
    if (!db || !roomId || !req?.uid) return;
    updateDoc(doc(db, "rooms", roomId), { [`guestReq.${req.uid}`]: deleteField() }).catch(() => {});
  };

  const removeGuest = (uid: string) => {
    if (!db || !roomId || !uid) return;
    updateDoc(doc(db, "rooms", roomId), { [`guests.${uid}`]: deleteField() }).catch(() => {});
  };

  const muteGuest = (uid: string, muted: boolean) => {
    if (!db || !roomId || !uid) return;
    updateDoc(doc(db, "rooms", roomId), { [`guests.${uid}.hostMuted`]: muted }).catch(() => {});
  };

  // host: a guest who crashed / lost network never leaves by himself → free the seat
  useEffect(() => {
    if (!isHost || !db || !roomId) return;
    const t = setInterval(() => {
      const guests = roomDataRef.current?.guests || {};
      Object.values(guests).forEach((g: any) => {
        if (!g?.uid) return;
        if (Date.now() - Number(g.at || 0) < GUEST_JOIN_GRACE_MS) return;
        const aid = Number(g.agoraUid || 0);
        if (aid && !remoteUsersRef.current.includes(aid)) {
          updateDoc(doc(db, "rooms", roomId), { [`guests.${g.uid}`]: deleteField() }).catch(() => {});
        }
      });
    }, 6000);
    return () => clearInterval(t);
  }, [isHost, roomId]);

  // PK shuru hote hi call par baithe sabhi guests hata do (aur pending requests bhi saaf).
  // Har host sirf apna room likhta hai. Guest ki taraf amGuest false hote hi uska mic/cam apne aap band ho jata hai.
  useEffect(() => {
    if (!isHost || !db || !roomId || !pkActive) return;
    const hasGuests = Object.keys(roomData?.guests || {}).length > 0;
    const hasReqs = Object.keys(roomData?.guestReq || {}).length > 0;
    if (!hasGuests && !hasReqs) return;
    updateDoc(doc(db, "rooms", roomId), {
      ...(hasGuests ? { guests: deleteField() } : null),
      ...(hasReqs ? { guestReq: deleteField() } : null),
    }).catch(() => {});
  }, [isHost, roomId, pkActive, roomData?.guests, roomData?.guestReq]);

  // guest ko pata chale ki PK ki wajah se call se hata diya gaya
  const wasGuestRef = useRef(false);
  useEffect(() => {
    if (wasGuestRef.current && !amGuest && pkActive) {
      showToast("PK started - you were removed from the call");
    }
    wasGuestRef.current = amGuest;
  }, [amGuest, pkActive]);

  const onGuestTilePress = (g: any) => {
    if (g.uid === currentUid) {
      setMenuVisible(true);
      return;
    }
    if (isHost) {
      Alert.alert(g.name || "Guest", "Guest controls", [
        {
          text: "View profile",
          onPress: () => openProfile({ uid: g.uid, name: g.name, img: g.img, level: Number(g.level || 1), verified: g.verified, verifiedColor: g.verifiedColor }),
        },
        {
          text: g.hostMuted ? "Unmute guest" : "Mute guest",
          onPress: () => muteGuest(g.uid, !g.hostMuted),
        },
        { text: "Remove from call", style: "destructive", onPress: () => removeGuest(g.uid) },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }
    openProfile({ uid: g.uid, name: g.name, img: g.img, level: Number(g.level || 1) });
  };

  const followGuest = async (g: any) => {
    if (!g?.uid || g.uid === currentUid) return;
    const ok = await setFollow(g.uid, true);
    if (ok) {
      setGuestFollowed((prev) => new Set(prev).add(g.uid));
      setIsFollowing((cur) => (g.uid === hostId ? true : cur));
    } else {
      showToast("Could not follow right now");
    }
  };

  const handleSendChat = async () => {
    if (!chatMessage.trim() || !db || !roomId) return;
    if (amMuted && !isMod) {
      Alert.alert("Muted", "The host has muted you in this live.");
      return;
    }
    if (chatLocked && !isMod) {
      Alert.alert("Chat is off", "The host has turned chat off for viewers.");
      return;
    }
    const nowMs = Date.now();
    if (nowMs - lastChatAtRef.current < 1200) return; // anti-spam
    lastChatAtRef.current = nowMs;
    if (blockIfProfane(chatMessage)) return;
    const messageText = cleanText(chatMessage.trim()).slice(0, 200);
    Keyboard.dismiss();
    setEmojiOpen(false);
    setChatMessage("");
    try {
      await addDoc(collection(db, "rooms", roomId, "chats"), {
        senderName: currentRealName,
        username: currentName,
        message: messageText,
        senderId: currentUid,
        role: isHost ? "host" : mods[currentUid as string] ? "mod" : "user",
        userImg: currentAvatar || STABLE_AVATAR,
        special: mySpecial,
        verified: myVerified,
        verifiedColor: normTickColor(myVerifiedColor),
        level: myLevel,
        createdAt: Date.now(),
      });
    } catch (e) {
      console.log("CHAT SEND ERROR:", e);
    }
  };

  // ============================================================
  // PREMIUM: follow / hearts / moderation / settings / report
  // ============================================================

  const goRecharge = () => {
    setGiftModalVisible(false);
    try {
      router.push(RECHARGE_ROUTE as any);
    } catch (e) {
      Alert.alert("Recharge", "Recharge screen is not linked yet (set RECHARGE_ROUTE).");
    }
  };

  // ----- follow (users/{target}/followers/{me} + users/{me}/following/{target}) -----
  const setFollow = async (targetId: string, follow: boolean) => {
    if (!db || !currentUid || !targetId || targetId === currentUid) return false;
    const a = doc(db, "users", targetId, "followers", currentUid);
    const b = doc(db, "users", currentUid, "following", targetId);
    try {
      if (follow) {
        await Promise.all([
          setDoc(a, { uid: currentUid, name: currentRealName, img: currentAvatar || STABLE_AVATAR, at: Date.now() }),
          setDoc(b, { uid: targetId, at: Date.now() }),
        ]);
        updateDoc(doc(db, "users", targetId), { followersCount: increment(1) }).catch(() => {});
        updateDoc(doc(db, "users", currentUid), { followingCount: increment(1) }).catch(() => {});
        notifyNewFollower(targetId);
        if (targetId === hostId && roomId) {
          updateDoc(doc(db, "rooms", roomId), { newFollowers: increment(1) }).catch(() => {});
        }
      } else {
        await Promise.all([deleteDoc(a), deleteDoc(b)]);
        updateDoc(doc(db, "users", targetId), { followersCount: increment(-1) }).catch(() => {});
        updateDoc(doc(db, "users", currentUid), { followingCount: increment(-1) }).catch(() => {});
      }
      return true;
    } catch (e) {
      console.log("FOLLOW ERROR:", e);
      return false;
    }
  };

  useEffect(() => {
    if (!db || !hostId || !currentUid || hostId === currentUid) return;
    let alive = true;
    getDoc(doc(db, "users", hostId, "followers", currentUid))
      .then((sn) => alive && setIsFollowing(sn.exists()))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [hostId, currentUid]);

  const toggleFollowHost = async () => {
    if (followBusy || !hostId) return;
    setFollowBusy(true);
    const next = !isFollowing;
    setIsFollowing(next);
    const ok = await setFollow(hostId, next);
    if (!ok) setIsFollowing(!next);
    setFollowBusy(false);
  };

  // profile card: is the tapped user followed by me?
  useEffect(() => {
    setProfileFollowing(false);
    if (!db || !profileCard?.uid || !currentUid || profileCard.uid === currentUid) return;
    let alive = true;
    getDoc(doc(db, "users", profileCard.uid, "followers", currentUid))
      .then((sn) => alive && setProfileFollowing(sn.exists()))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [profileCard?.uid]);

  const toggleProfileFollow = async () => {
    const t = profileCard;
    if (!t) return;
    const next = !profileFollowing;
    setProfileFollowing(next);
    const ok = await setFollow(t.uid, next);
    if (!ok) setProfileFollowing(!next);
    else if (t.uid === hostId) setIsFollowing(next);
  };

  // ----- profile popup extras: followers / following / likes + FAMILY card -----
  const [pcInfo, setPcInfo] = useState<any>(null);
  useEffect(() => {
    setPcInfo(null);
    const uid = profileCard?.uid;
    if (!db || !uid) return;
    let alive = true;
    (async () => {
      try {
        const u: any = (await getDoc(doc(db, "users", uid))).data() || {};
        const info: any = {
          followers: Number(u.followersCount || 0),
          following: Number(u.followingCount || 0),
          likes: Number(u.likesCount || u.totalLikes || 0),
          familyId: u.familyId || "",
          familyName: u.familyName || "",
          familyLogo: u.familyLogo || "",
          familyPoints: 0,
          familyMembers: 0,
        };
        if (alive) setPcInfo(info);
        if (info.familyId) {
          const f: any = (await getDoc(doc(db, "families", info.familyId))).data();
          if (f && f.status === "approved" && alive) {
            setPcInfo({
              ...info,
              familyName: f.name || info.familyName,
              familyLogo: f.logo || info.familyLogo,
              familyPoints: Number(f.points || 0),
              familyMembers: Number(f.memberCount || 1),
            });
          } else if (alive && f && f.status !== "approved") {
            setPcInfo({ ...info, familyId: "" }); // family band/reject -> card mat dikhao
          }
        }
      } catch (e) {}
    })();
    return () => { alive = false; };
  }, [profileCard?.uid]);

  const goUserProfile = (u: any) => {
    if (!u?.uid) return;
    setProfileCard(null);
    router.push({ pathname: "/userProfile", params: { userId: u.uid, roomId } } as any);
  };

  const openProfile = useCallback((u: any) => setProfileCard(u), []);
  const openHostCard = () => {
    if (!hostId) return;
    setProfileCard({
      uid: hostId,
      name: hostName,
      img: hostImg,
      level: hostLevel,
      verified: hostVerified,
      verifiedColor: hostVerifiedColor,
      isHostCard: true,
    });
  };

  const renderChat = useCallback(
    ({ item }: any) => <ChatItem chat={item} onUser={openProfile} />,
    [openProfile]
  );

  // ----- hearts (tap the screen) -----
  const spawnHearts = useCallback((n: number) => {
    heartsRef.current?.spawn(n);
  }, []);

  const flushLikes = () => {
    likeTimerRef.current = null;
    const n = pendingLikesRef.current;
    pendingLikesRef.current = 0;
    if (!n || !db || !roomId) return;
    // pre-advance so my own echo doesn't spawn hearts a second time
    lastLikesSeenRef.current = (lastLikesSeenRef.current || 0) + n;
    updateDoc(doc(db, "rooms", roomId), { likes: increment(n) }).catch(() => {});
  };

  const sendLike = () => {
    spawnHearts(1);
    pendingLikesRef.current += 1;
    if (!likeTimerRef.current) likeTimerRef.current = setTimeout(flushLikes, 2500);
  };

  const goingOppRef = useRef(false);
  const goToOpponentRoom = () => {
    const targetId = pk?.opponentRoomId;
    if (isHost || !targetId || targetId === roomId || goingOppRef.current) return;
    goingOppRef.current = true;
    setTimeout(() => { goingOppRef.current = false; }, 2000);
    flushGiftBatchRef.current?.(); // bacha hua gift batch isi room ke host ko bhej do
    if (amGuest) leaveGuestSeat();
    try {
      router.replace({ pathname: "/videolive", params: { id: targetId, role: "viewer" } } as any);
    } catch (_) {
      goingOppRef.current = false;
    }
  };

  const onScreenTap = (e?: any) => {
    Keyboard.dismiss();
    setEmojiOpen(false);
    // PK me viewer doosri side ke panel par tap kare -> us host ke live room me chala jaye
    if (!isHost && pkActive && !!pk?.opponentHostId && e?.nativeEvent) {
      const { pageX, pageY } = e.nativeEvent;
      if (pageY >= pkPanelTop && pageY <= pkPanelTop + pkPanelH) {
        // Doosri side ke panel par tap -> us host ke live room me chale jao (wahin gift de sakte ho)
        if (pageX >= pkPanelW) {
          goToOpponentRoom();
          return;
        }
      }
    }
    sendLike();
  };


  useEffect(() => {
    return () => {
      if (likeTimerRef.current) {
        clearTimeout(likeTimerRef.current);
        flushLikes();
      }
    };
  }, []);

  // ----- kicked by host / moderator -----
  useEffect(() => {
    if (isHost || !currentUid || kickedHandledRef.current) return;
    if (roomData?.kicked?.[currentUid]) {
      kickedHandledRef.current = true;
      Alert.alert("Removed", "You were removed from this live.");
      router.back();
    }
  }, [roomData?.kicked, currentUid]);

  // ----- moderation -----
  const canModerate = (t: any) =>
    isMod && !!t?.uid && t.uid !== currentUid && t.uid !== hostId && (isHost || !mods[t.uid]);

  const muteUser = async (t: any, mute: boolean) => {
    if (!db || !roomId) return;
    try {
      await updateDoc(doc(db, "rooms", roomId), { [`mutedUsers.${t.uid}`]: mute ? true : deleteField() });
    } catch (e) {
      console.log("MUTE ERROR:", e);
    }
    setProfileCard(null);
  };

  const kickUser = (t: any) => {
    Alert.alert("Remove user", `Remove ${t.name || "this user"} from the live? They can't rejoin this live.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          if (!db || !roomId) return;
          try {
            await updateDoc(doc(db, "rooms", roomId), { [`kicked.${t.uid}`]: true });
            deleteDoc(doc(db, "rooms", roomId, "audience", t.uid)).catch(() => {});
          } catch (e) {
            console.log("KICK ERROR:", e);
          }
          setProfileCard(null);
        },
      },
    ]);
  };

  const toggleMod = async (t: any) => {
    if (!isHost || !db || !roomId) return;
    try {
      await updateDoc(doc(db, "rooms", roomId), { [`mods.${t.uid}`]: mods[t.uid] ? deleteField() : true });
    } catch (e) {
      console.log("MOD ERROR:", e);
    }
    setProfileCard(null);
  };

  // ----- chat lock (quick toggle) + delete all chats (host / moderators) -----
  const toggleChatLock = async () => {
    if (!isMod || !db || !roomId) return;
    try {
      await updateDoc(doc(db, "rooms", roomId as string), { chatLocked: !chatLocked });
    } catch (e) {
      console.log("CHAT LOCK ERROR:", e);
    }
  };

  const deleteAllChats = () => {
    if (!isMod || !db || !roomId) return;
    Alert.alert("Delete all chats", "Remove every message from this live chat for everyone?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete all",
        style: "destructive",
        onPress: async () => {
          await clearRoomSubcollection("chats");
          setChatMessages([]);
        },
      },
    ]);
  };

  const submitReport = async (reason: string) => {
    const t = reportTarget;
    setReportTarget(null);
    if (!t || !db) return;
    try {
      await addDoc(collection(db, "reports"), {
        roomId,
        hostId: hostId || null,
        reporterId: currentUid,
        targetId: t.uid,
        targetName: t.name || "",
        reason,
        createdAt: Date.now(),
      });
      if (reason === VOICE_ABUSE_REASON) {
        reportVoiceAbuse(roomId as string, t.uid);
        return;
      }
      Alert.alert("Thanks", "Your report was sent. Our team will review it.");
    } catch (e) {
      Alert.alert("Report", "Could not send the report. Try again.");
    }
  };

  // ----- host settings (title / pinned message / chat on-off) -----
  const openSettings = () => {
    setTitleDraft(roomTitle);
    setPinDraft(pinnedText);
    setLockDraft(chatLocked);
    setSettingsVisible(true);
  };

  const saveSettings = async () => {
    if (!db || !roomId) return;
    try {
      await updateDoc(doc(db, "rooms", roomId), {
        title: titleDraft.trim().slice(0, 60),
        chatLocked: lockDraft,
        pinned: pinDraft.trim()
          ? { text: pinDraft.trim().slice(0, 140), by: currentName, at: Date.now() }
          : deleteField(),
      });
    } catch (e) {
      console.log("SETTINGS ERROR:", e);
    }
    setSettingsVisible(false);
  };

  // ============================================================
  // GIFTING (same flow as LiveRoom.js)
  // ============================================================

  // ---------- PK side (Tiki style) ----------
  // Viewer apni side ke host ko hi gift de sakta hai. Doosri side par jana ho to
  // us panel par tap karo -> turant switch, koi await nahi. (Gift sheet me ab Switch button nahi hai,
  // taaki ek viewer dono hosts ko gift na bhej sake.)
  const switchPkSide = useCallback((to?: "me" | "opp") => {
    const next = to || (pkSideRef.current === "me" ? "opp" : "me");
    if (next === pkSideRef.current) return;
    pkSideRef.current = next;
    setPkSide(next);
    Animated.timing(pkSideAnim, {
      toValue: next === "me" ? 0 : 1,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  // PK khatam / naya PK -> wapas apni side par
  useEffect(() => {
    if (!showPk) {
      pkSideRef.current = "me";
      setPkSide("me");
      pkSideAnim.setValue(0);
    }
  }, [showPk, pk?.pkId]);

  // Friend = dono taraf follow. Sirf main follow karu to "Following".
  const iFollowId = (id: string) =>
    followingIds.has(id) || guestFollowed.has(id) || (id === hostId && isFollowing);
  const isFriendId = (id: string) => iFollowId(id) && followedByIds.has(id);

  // PK me dono hosts (aur viewers) ke liye: opponent / host ko follow kiya hai ya nahi (sirf ek getDoc)
  useEffect(() => {
    if (!db || !currentUid || !pk?.opponentHostId || !showPk) return;
    const ids = [pk.opponentHostId, hostId].filter((id: any) => id && id !== currentUid);
    let alive = true;
    ids.forEach((id: string) => {
      getDoc(doc(db, "users", currentUid, "following", id))
        .then((sn) => {
          if (alive && sn.exists()) setGuestFollowed((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
        })
        .catch(() => {});
      getDoc(doc(db, "users", currentUid, "followers", id))
        .then((sn) => {
          if (alive && sn.exists()) setFollowedByIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
        })
        .catch(() => {});
    });
    return () => {
      alive = false;
    };
  }, [pk?.opponentHostId, pk?.pkId, showPk, hostId, currentUid]);

  // Who can receive a gift here: ONLY the host of the side the viewer is on.
  // Gift hamesha is room ke host ko jata hai. Doosre host ko gift karna ho to uske PK panel par tap karke
  // uske live room me jao (goToOpponentRoom) - ek room se dono ko gift nahi ja sakta.
  const onOppSide = false;
  const giftUsers: any[] = [];
  if (onOppSide) {
    if (pk.opponentHostId !== currentUid) {
      giftUsers.push({ uid: pk.opponentHostId, name: pk.opponentName, img: pk.opponentImg });
    }
  } else if (hostId && hostId !== currentUid) {
    giftUsers.push({ uid: hostId, name: hostName, img: hostImg, verified: hostVerified, verifiedColor: hostVerifiedColor });
  }

  const openGiftModal = () => {
    if (!giftUsers.length) {
      Alert.alert("Gift", "There is nobody to send a gift to right now.");
      return;
    }
    setSelectedGiftUser(giftUsers[0].uid);
    setGiftModalVisible(true);
  };

  // ============================================================
  // SEND GIFT (LiveRoom.js jaisa):
  //  1) combo banner x1, x2, x3 turant (har tap par), full-screen animation tap ruke tab
  //  2) sheet band NAHI hoti -> lagatar 10-20 tap
  //  3) taps batch hote hain, ~1s me ek Firestore write
  // ============================================================
  const handleSendGift = (item: any) => {
    const receiverId = giftUsers[0]?.uid;
    if (!receiverId || typeof receiverId !== "string") {
      Alert.alert("Gift", "Please select a user");
      return;
    }

    const price = Number(item.price || 0);

    // balance = wallet - (abhi tak write na hue taps) - (write ho chuke par snapshot pending)
    const available = stars - pendingSpendRef.current - inflightSpendRef.current;
    if (available < price) {
      Alert.alert("Gift", "Not enough stars");
      return;
    }

    // never gift yourself, and only users that are in the list
    if (receiverId === currentUid || !giftUsers.some((u) => u.uid === receiverId)) {
      Alert.alert("Gift", "Please select another user");
      return;
    }

    // gift ya receiver badal gaya (PK me side switch) -> pehle purana batch bhej do
    const open = giftBatchRef.current;
    if (open && (open.item.id !== item.id || open.receiverId !== receiverId)) {
      flushGiftBatchRef.current?.();
    }

    const isComboContinue =
      lastGiftRef.current &&
      lastGiftRef.current.senderId === currentUid &&
      lastGiftRef.current.giftId === item.id &&
      lastGiftRef.current.receiverId === receiverId &&
      Date.now() - lastGiftRef.current.time < 3000;

    if (!giftComboCountRef.current || !isComboContinue) giftComboCountRef.current = 1;
    else giftComboCountRef.current++;

    const comboCount = giftComboCountRef.current;

    lastGiftRef.current = { senderId: currentUid, giftId: item.id, receiverId, time: Date.now() };

    const _receiver = giftUsers.find((u) => u.uid === receiverId);
    const _receiverName =
      _receiver?.name ||
      audienceMap?.[receiverId]?.name ||
      audienceMap?.[receiverId]?.username ||
      "user";
    const _senderDisplay =
      currentRealName && currentRealName !== "User" ? currentRealName : currentName;

    if (giftLayerRef.current) {
      // 1) instant: combo banner x1, x2, x3 ... (har tap par)
      giftLayerRef.current.showCombo(
        {
          senderName: _senderDisplay,
          senderImg: currentAvatar || STABLE_AVATAR,
          receiverName: _receiverName,
          giftId: item.id,
          giftName: item.name,
          count: comboCount,
        },
        onComboEnd
      );

      // 2) full-screen animation: tap ruke tab SIRF last gift ki chalegi
      if (item.animation) {
        giftLayerRef.current.playDeferred(item.animation, item.duration, 600, {
          senderName: _senderDisplay,
          senderImg: currentAvatar || STABLE_AVATAR,
          receiverName: _receiverName,
          giftName: item.name,
        });
      }
    }

    // 3) local balance turant kam dikhe
    pendingSpendRef.current += price;
    giftPendingStore.set(pendingSpendRef.current);

    // 4) tap ko batch me jodo (Firestore write baad me, ek saath)
    if (!giftBatchRef.current) {
      giftBatchRef.current = {
        item,
        receiverId,
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
        flushGiftBatchRef.current?.();
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

    const total = Number(batch.item.price || 0) * batch.taps;
    pendingSpendRef.current = Math.max(0, pendingSpendRef.current - total);
    inflightSpendRef.current += total;

    // Own gift timestamp: mark as seen so the Firestore echo is ignored.
    const giftTimestamp = Date.now();
    lastSeenGiftKeyRef.current = `${currentUid}_${giftTimestamp}`;

    sendGiftInBackground({
      item: batch.item,
      receiverId: batch.receiverId,
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
    flushGiftBatchRef.current?.();
  }, []);

  const handleSendGiftRef = useRef<any>(null);
  handleSendGiftRef.current = handleSendGift;
  const stableSendGift = useCallback((item: any) => handleSendGiftRef.current?.(item), []);

  const sendGiftInBackground = async ({
    item,
    receiverId,
    receiverName,
    senderDisplay,
    comboCount,
    taps = 1,
    chat = false,
    giftTimestamp,
  }: any) => {
    if (!db || !roomId || !currentUid) return;

    // taps = is batch me kitne gift tap hue -> total price ek hi write me
    const price = Number(item.price || 0) * taps;
    const roomRef = doc(db, "rooms", roomId);
    const receiverWalletRef = doc(db, "wallets", receiverId);
    const receiverUserRef = doc(db, "users", receiverId);

    // seatStars + liveGift (+ PK score) in ONE write → one snapshot per gift
    const roomUpdate: any = {
      [`seatStars.${receiverId}`]: increment(price),
      // per-live ranking (shown in the Top Gifters sheet)
      [`roomGifters.${currentUid}.uid`]: currentUid,
      [`roomGifters.${currentUid}.name`]: senderDisplay,
      [`roomGifters.${currentUid}.img`]: currentAvatar || STABLE_AVATAR,
      [`roomGifters.${currentUid}.level`]: myLevel,
      [`roomGifters.${currentUid}.verified`]: myVerified,
      [`roomGifters.${currentUid}.verifiedColor`]: normTickColor(myVerifiedColor),
      [`roomGifters.${currentUid}.stars`]: increment(price),
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

    const curPk = roomDataRef.current?.pk;
    const pkJobs: Promise<any>[] = [];
    if (curPk?.status === "active") {
      // who supports which side (top-3 avatars on every PK panel)
      const supporter = {
        [`pk.gifters.${currentUid}.uid`]: currentUid,
        [`pk.gifters.${currentUid}.name`]: senderDisplay,
        [`pk.gifters.${currentUid}.img`]: currentAvatar || STABLE_AVATAR,
        [`pk.gifters.${currentUid}.stars`]: increment(price),
      };
      if (receiverId === roomDataRef.current?.hostId) {
        roomUpdate["pk.score"] = increment(price);
        Object.assign(roomUpdate, supporter);
      } else if (receiverId === curPk.opponentHostId && curPk.opponentRoomId) {
        pkJobs.push(
          updateDoc(doc(db, "rooms", curPk.opponentRoomId), { "pk.score": increment(price), ...supporter })
        );
      }
    }

    // PEHLE room write (liveGift + seatStars). Fail ho to na stars kategi, na doosron ko kuch dikhega
    // -> user ko batao aur wallet se paisa mat kaato (LiveRoom jaisa).
    try {
      await updateDoc(roomRef, roomUpdate);
    } catch (e: any) {
      console.log("GIFT ROOM WRITE FAILED:", e?.code, e?.message);
      inflightSpendRef.current = Math.max(0, inflightSpendRef.current - price);
      giftPendingStore.set(pendingSpendRef.current);
      showToast("⚠️ Gift nahi gaya, dobara try karo");
      return;
    }

    const jobs: Promise<any>[] = [
      // sender wallet
      updateDoc(doc(db, "wallets", currentUid), { stars: increment(-price), totalSpent: increment(price) }),

      // receiver wallet: earnings + receivedStars
      setDoc(
        receiverWalletRef,
        { earnings: increment(price), receivedStars: increment(price) },
        { merge: true }
      ),

      // receiver's top-gifters
      updateDoc(receiverUserRef, {
        [`topGifters.${currentUid}.uid`]: currentUid,
        [`topGifters.${currentUid}.username`]: currentName || "",
        [`topGifters.${currentUid}.name`]: currentRealName || currentName || "User",
        [`topGifters.${currentUid}.profileImg`]: currentAvatar || "",
        [`topGifters.${currentUid}.stars`]: increment(price),
      }),

      ...pkJobs,
    ];

    // chat line only once per combo (avoid spam)
    if (chat) {
      jobs.push(
        addDoc(collection(db, "rooms", roomId, "chats"), {
          type: "gift",
          senderId: currentUid,
          qty: 1,
          senderName: senderDisplay,
          username: currentName,
          userImg: currentAvatar || STABLE_AVATAR,
          level: myLevel,
          special: mySpecial,
          verified: myVerified,
          verifiedColor: normTickColor(myVerifiedColor),
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
      if (r.status === "rejected") console.log("GIFT WRITE FAILED #" + idx, (r as any).reason?.code, (r as any).reason?.message);
    });

    // agency stars: fire-and-forget (Render cold start can take 30s+)
    fetch("https://topking-backend.onrender.com/update-agency-stars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiverUid: receiverId, stars: price }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (__DEV__) console.log("AGENCY UPDATE RESPONSE =", res);
      })
      .catch((e) => {
        if (__DEV__) console.log("Agency Update Error =", e);
      });
  };

  // ============================================================
  // RENDER
  // ============================================================

  const levelTheme = getLevelTheme(hostLevel);
  const levelFrame = getLevelFrame(hostLevel);

  const showLocalVideo = isHost && localReady;
  const showRemoteVideo = !isHost && hostRemoteUid != null;

  const pkPanelW = width / 2;
  const pkPanelH = pkPanelHFixed; // Tiki ratio 1.547
  const safeTop = Math.max(insets.top, 24);
  // Tiki: score bar starts ~13% from the top (below the header with a gap), panels sit right under it.
  const pkBarTop = Math.round(Math.max(safeTop + 74, height * 0.128));
  const pkPanelTop = pkBarTop + PK_BAR_H;

  const myResult = pk?.result; // "win" | "lose" | "draw" — from THIS room's point of view
  const oppResult = myResult === "win" ? "lose" : myResult === "lose" ? "win" : myResult;
  const resultText = (r?: string) => (r === "win" ? "WIN 🏆" : r === "lose" ? "LOSE" : r === "draw" ? "DRAW" : "");

  const filterLabel = FILTERS.find((f) => f.id === filterId)?.label || "Filter";

  const agoraFailed = /^(Failed|Error)/.test(agoraStatus);
  const retryAgora = () => {
    setAgoraStatus(isHost ? "Starting camera..." : "Connecting to live...");
    setAgoraRetry((k) => k + 1);
  };

  const menuItems: any[] = isHost
    ? [
        { key: "flip", label: "Flip", icon: <Ionicons name="camera-reverse-outline" size={24} color="#fff" />, onPress: flipCamera },
        {
          key: "beauty",
          label: "Beauty",
          active: filterId !== "off",
          icon: <MaterialCommunityIcons name="face-woman-shimmer-outline" size={24} color="#fff" />,
          onPress: () => setFilterModalVisible(true),
        },
        {
          key: "mic",
          label: micMuted ? "Unmute" : "Mute",
          active: micMuted,
          icon: <Ionicons name={micMuted ? "mic-off" : "mic"} size={24} color="#fff" />,
          onPress: toggleMic,
        },
        {
          key: "video",
          label: videoOff ? "Play" : "Pause",
          active: videoOff,
          icon: <Ionicons name={videoOff ? "play" : "pause"} size={24} color="#fff" />,
          onPress: toggleVideo,
        },
        {
          key: "setup",
          label: "Setup",
          active: !!pinnedText || chatLocked,
          icon: <Ionicons name="settings-outline" size={24} color="#fff" />,
          onPress: openSettings,
        },
        { key: "gifters", label: "Top gifters", icon: <Ionicons name="trophy-outline" size={24} color="#fff" />, onPress: () => setRankVisible(true) },
        { key: "viewers", label: "Viewers", icon: <Ionicons name="people-outline" size={24} color="#fff" />, onPress: () => setViewerListVisible(true) },
        {
          key: "guests",
          label: pendingRequests.length > 0 ? `Guests (${pendingRequests.length})` : "Guests",
          active: pendingRequests.length > 0,
          icon: <MaterialCommunityIcons name="link-variant" size={24} color="#fff" />,
          onPress: () => setGuestSheetVisible(true),
        },
      ]
    : [
        ...(amGuest
          ? [
              {
                key: "gmic",
                label: hostMutedMe ? "Muted by host" : guestMicOn ? "Mute" : "Unmute",
                active: hostMutedMe || !guestMicOn,
                icon: <Ionicons name={hostMutedMe || !guestMicOn ? "mic-off" : "mic"} size={24} color="#fff" />,
                onPress: toggleGuestMic,
              },
              {
                key: "gleave",
                label: "Leave call",
                icon: <MaterialCommunityIcons name="phone-hangup" size={24} color="#fff" />,
                onPress: leaveGuestSeat,
              },
            ]
          : []),
        {
          key: "sound",
          label: soundMuted ? "Sound off" : "Sound",
          active: soundMuted,
          icon: <Ionicons name={soundMuted ? "volume-mute" : "volume-high"} size={24} color="#fff" />,
          onPress: toggleSound,
        },
        { key: "like", label: "Like", icon: <Text style={{ fontSize: 22 }}>❤️</Text>, onPress: sendLike },
        { key: "gifters", label: "Top gifters", icon: <Ionicons name="trophy-outline" size={24} color="#fff" />, onPress: () => setRankVisible(true) },
        { key: "viewers", label: "Viewers", icon: <Ionicons name="people-outline" size={24} color="#fff" />, onPress: () => setViewerListVisible(true) },
        {
          key: "report",
          label: "Report",
          icon: <Ionicons name="flag-outline" size={24} color="#fff" />,
          onPress: () => hostId && setReportTarget({ uid: hostId, name: hostName }),
        },
      ];

  const liveByHost = new Map<string, any>(pkCandidates.map((c: any) => [c.hostId, c]));
  const friendRank = (r: any) => (r.offline ? 2 : r.busy ? 1 : 0);
  // 1) every friend who is live right now (even if not in the first PK_FRIEND_LIMIT profiles)
  const liveFriendRows = pkCandidates.filter((c: any) => friendIdSet.has(c.hostId));
  // 2) friends who are not live
  const offlineFriendRows = friendsList
    .filter((f: any) => !liveByHost.has(f.uid))
    .map((f: any) => ({
      id: `off_${f.uid}`,
      hostId: f.uid,
      name: f.name,
      img: f.img,
      offline: true,
      viewers: 0,
      stars: 0,
    }));
  const pkFriendRows = [...liveFriendRows, ...offlineFriendRows].sort((x: any, y: any) => friendRank(x) - friendRank(y));
  const pkFriendsLive = pkFriendRows.filter((r: any) => !r.offline && !r.busy).length;
  const pkRecommended = pkCandidates
    .filter((c: any) => !c.busy && !friendIdSet.has(c.hostId))
    .slice()
    .sort((a: any, b: any) => b.viewers - a.viewers);

  const renderPkRow = (item: any) => {
    const off = !!item.offline;
    const busy = !!item.busy;
    const canInvite = !off && !busy;
    return (
      <View key={item.id} style={[styles.pkListRow, (off || busy) && { opacity: off ? 0.55 : 0.85 }]}>
        <View>
          <Image source={{ uri: item.img }} style={styles.pkListAva} />
          {!off && !busy && <View style={styles.pkLiveDot} />}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.pkListName} numberOfLines={1}>
            {item.name}
          </Text>
          {off ? (
            <Text style={[styles.pkListStat, { marginLeft: 0, marginTop: 3 }]}>Offline</Text>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
              <Ionicons name="people" size={11} color="#9aa0b4" />
              <Text style={styles.pkListStat}>{fmtK(item.viewers)}</Text>
              <Ionicons name="star" size={11} color="#FFC107" style={{ marginLeft: 12 }} />
              <Text style={styles.pkListStat}>{fmtK(item.stars)}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={[styles.inviteYellow, !canInvite && styles.inviteGrey, pkBusy && { opacity: 0.5 }]}
          disabled={!canInvite || pkBusy}
          onPress={() => sendPkInvite(item)}
        >
          <Text
            numberOfLines={1}
            style={[styles.inviteYellowTxt, !canInvite && { color: "#9aa0b4", fontSize: 11 }]}
          >
            {off ? "Offline" : busy ? item.busy : "Invite"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const mainVideoArea = () => {
    if (showLocalVideo) return <RtcSurfaceView style={StyleSheet.absoluteFill} canvas={{ uid: 0 }} />;
    if (showRemoteVideo)
      return <RtcSurfaceView style={StyleSheet.absoluteFill} canvas={{ uid: hostRemoteUid as number }} />;
    return (
      <View style={[StyleSheet.absoluteFill, styles.loadingBg]}>
        {isHost || agoraStatus !== "Live" ? (
          <>
            {!agoraFailed && <ActivityIndicator size="large" color="#F71084" />}
            <Text style={styles.loadingText}>{agoraStatus}</Text>
            {agoraFailed && (
              <TouchableOpacity style={styles.retryBtn} onPress={retryAgora}>
                <Text style={styles.retryBtnTxt}>Retry</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            <Ionicons name="videocam-off-outline" size={40} color="#555" />
            <Text style={styles.loadingText}>Waiting for host's camera...</Text>
          </>
        )}
      </View>
    );
  };

  const pausedOverlay = (label: string, style?: any, showAvatar = true) => (
    <View pointerEvents="none" style={[styles.pausedOverlay, style]}>
      {showAvatar ? (
        <Image source={{ uri: hostImg }} style={styles.pausedAvatar} />
      ) : (
        <View style={styles.pkBadge}>
          <Text style={styles.pkBadgeTxt}>PK</Text>
        </View>
      )}
      <Text style={styles.pausedText}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ================= BACKGROUND VIDEO / PK STAGE ================= */}
      {!showPk ? (
        <>
          {mainVideoArea()}
          {isHost && videoOff && pausedOverlay("Your video is paused", StyleSheet.absoluteFill)}
          {!isHost && hostVideoOff && pausedOverlay("Host paused the video", StyleSheet.absoluteFill)}
        </>
      ) : (
        <>
          {/* Tiki background: navy -> purple gradient (no flat black) */}
          <LinearGradient
            colors={["#0F0D33", "#1A1450", "#2C2168", "#3B2B7D"]}
            locations={[0, 0.35, 0.7, 1]}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(40,110,255,0.38)", "rgba(40,110,255,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: "absolute", top: 0, left: 0, width: width * 0.7, height: 230 }}
          />
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(255,45,117,0.32)", "rgba(255,45,117,0)"]}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ position: "absolute", top: 0, right: 0, width: width * 0.7, height: 230 }}
          />

          {/* score bar: BLUE (me) | PINK (opponent) */}
          <View style={[styles.pkBarWrap, { top: pkBarTop }]}>
            <View style={styles.pkBar}>
              <Animated.View
                style={{
                  ...StyleSheet.absoluteFillObject,
                  backgroundColor: "#1E8CFF",
                  transform: [{ translateX: pkBarAnim.interpolate({ inputRange: [0, 100], outputRange: [-width, 0] }) }],
                }}
              />
            </View>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pkSpark,
                { left: 0, transform: [{ translateX: pkBarAnim.interpolate({ inputRange: [0, 100], outputRange: [0, width] }) }] },
              ]}
            >
              <View style={styles.pkSparkGlow} />
            </Animated.View>
            <View pointerEvents="none" style={[styles.pkScoreWrap, { left: 4 }]}>
              <View style={styles.pkStarBox}>
                <Ionicons name="star" size={11} color="#1E8CFF" />
              </View>
              <Text style={styles.pkScoreTxt}>{shownMy}</Text>
            </View>
            <View pointerEvents="none" style={[styles.pkScoreWrap, { right: 4 }]}>
              <Text style={styles.pkScoreTxt}>{shownOpp}</Text>
              <View style={styles.pkStarBox}>
                <Ionicons name="star" size={11} color="#FF2D75" />
              </View>
            </View>
          </View>

          {/* two video panels */}
          <View style={[styles.pkPanels, { top: pkPanelTop, height: pkPanelH }]}>
            {/* LEFT = this room's host */}
            <View style={{ width: pkPanelW, height: pkPanelH, backgroundColor: "#1B1545" }}>
              {showLocalVideo ? (
                <RtcSurfaceView style={{ flex: 1 }} canvas={{ uid: 0 }} />
              ) : showRemoteVideo ? (
                <RtcSurfaceView style={{ flex: 1 }} canvas={{ uid: hostRemoteUid as number }} />
              ) : (
                <PkWaiting img={hostImg} />
              )}
              {(isHost ? videoOff : hostVideoOff) && pausedOverlay("Video paused", StyleSheet.absoluteFill, false)}
                            {pkEnded && !!myResult && <PkPanelResult key={`res_me_${pk?.pkId}`} result={myResult} endedAt={pk?.endedAt} />}
              {pkEnded && myResult === "lose" && <PkLoserPunish key={`pun_me_${pk?.pkId}`} panelW={pkPanelW} panelH={pkPanelH} face={pk?.face} mirror={isHost && camFrontRef.current} />}
              <PkSeats gifters={pk?.gifters} mirror />
            </View>

            {/* RIGHT = opponent host (their channel) */}
            <View style={{ width: pkPanelW, height: pkPanelH, backgroundColor: "#1B1545" }}>
              {oppRemoteUid && pkConn ? (
                <RtcSurfaceView style={{ flex: 1 }} canvas={{ uid: oppRemoteUid }} connection={pkConn} />
              ) : (
                <PkWaiting img={pk?.opponentImg} loading={pkActive} />
              )}
              {pkEnded && !!myResult && <PkPanelResult key={`res_opp_${pk?.pkId}`} result={oppResult} endedAt={pk?.endedAt} />}
              {pkEnded && oppResult === "lose" && <PkLoserPunish key={`pun_opp_${pk?.pkId}`} panelW={pkPanelW} panelH={pkPanelH} face={oppRoom?.pk?.face} mirror={false} />}
              <PkSeats gifters={oppRoom?.pk?.gifters} />
            </View>

            {/* viewer ki side: glow border (native-driven, smooth) + hint doosri side par */}
            {!isHost && pkActive && !!pk?.opponentHostId && (
              <>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.pkSideGlow,
                    { left: 0, width: pkPanelW, height: pkPanelH, borderColor: "#1E8CFF", opacity: pkSideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
                  ]}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.pkSideGlow,
                    { left: pkPanelW, width: pkPanelW, height: pkPanelH, borderColor: "#FF2D75", opacity: pkSideAnim },
                  ]}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[styles.pkSideHint, { left: 0, width: pkPanelW, opacity: pkSideAnim }]}
                >
                  <Text style={styles.pkSideHintTxt}>Tap to join & support</Text>
                </Animated.View>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.pkSideHint,
                    { left: pkPanelW, width: pkPanelW, opacity: pkSideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
                  ]}
                >
                  <Text style={styles.pkSideHintTxt}>Tap to join & support</Text>
                </Animated.View>
              </>
            )}

            {/* gloves + lightning in the middle */}
            {pkActive && Date.now() - (pk?.startAt || 0) < 3500 && <PkGlovesVs key={`vs_${pk?.pkId}`} startAt={pk?.startAt} />}

            {/* big trophy in the middle right after the PK ends */}
            {pkEnded && !!myResult && <PkCenterTrophy key={`ct_${pk?.pkId}`} result={myResult} endedAt={pk?.endedAt} />}

            {/* countdown (own component → no whole-screen re-render) */}
            {pkActive && !!pk?.endAt && <PkTimerPill key={`timer_${pk?.pkId}`} endAt={pk.endAt} />}
            {/* last 10 seconds: big 10 9 8 ... 1 */}
            {pkActive && !!pk?.endAt && <PkFinalCountdown key={`fcd_${pk?.pkId}`} endAt={pk.endAt} />}
            {/* after the PK: "00:09" result countdown (Tiki) */}
            {pkEnded && !!pk?.endedAt && (
              <PkTimerPill key={`rtimer_${pk?.pkId}`} endAt={Number(pk.endedAt) + PK_RESULT_SHOW_MS} result />
            )}
          </View>

          {/* scrolling tip under the panels */}
          <PkTicker top={pkPanelTop + pkPanelH + 8} />
        </>
      )}

      {/* tap anywhere on the video = send a heart */}
      <TouchableWithoutFeedback onPress={onScreenTap}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>

      {/* PK ke baad 5 sec: yellow "Start PK" (Tiki) -> tap overlay ke UPAR */}
      {isHost && pkEnded && showStartPk && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onStartPkAgain}
          style={[styles.startPkBtn, { top: pkPanelTop + pkPanelH - 28, left: width / 2 - 113 }]}
        >
          <Text style={styles.startPkTxt}>Start PK</Text>
        </TouchableOpacity>
      )}

      {/* PK: name pills + follow / Friend + mute -> tap overlay ke UPAR (warna tap nahi pakadte) */}
      {showPk && (
        <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: pkPanelTop, height: pkPanelH, flexDirection: "row" }}>
          <View pointerEvents="box-none" style={{ width: pkPanelW, height: pkPanelH }}>
              {/* left host name + follow "+" / Friend (viewers + opponent host dekh sakte hain) */}
              {!!hostId && (
                <View style={[styles.pkOppPill, { right: undefined, left: 6, paddingLeft: 9, paddingRight: hostId === currentUid ? 9 : 3 }]}>
                  <Text numberOfLines={1} style={styles.pkOppName}>
                    {hostName}
                  </Text>
                  {hostId !== currentUid && (iFollowId(hostId) ? (
                    <View style={[styles.pkFriendTag, !isFriendId(hostId) && styles.pkFollowingTag]}>
                      <Ionicons name={isFriendId(hostId) ? "people" : "checkmark"} size={9} color="#fff" />
                      <Text style={styles.pkFriendTxt}>{isFriendId(hostId) ? "Friend" : "Following"}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.pkOppPlus}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => followGuest({ uid: hostId, name: hostName, img: hostImg })}
                    >
                      <Ionicons name="add" size={13} color="#111" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
          </View>
          <View pointerEvents="box-none" style={{ width: pkPanelW, height: pkPanelH }}>
                            {pkActive && !!oppRemoteUid && (
                <TouchableOpacity style={styles.pkMuteBtn} onPress={toggleOppMute} activeOpacity={0.8}>
                  <Ionicons name={oppMuted ? "volume-mute" : "volume-high"} size={14} color="#fff" />
                </TouchableOpacity>
              )}
              {/* opponent name + yellow follow "+" (top-right, like Tiki) */}
              <View style={styles.pkOppPill}>
                <Text numberOfLines={1} style={styles.pkOppName}>
                  {pk?.opponentName || "Opponent"}
                </Text>
                {!!pk?.opponentHostId && pk.opponentHostId !== currentUid && (
                  iFollowId(pk.opponentHostId) ? (
                    <View style={[styles.pkFriendTag, !isFriendId(pk.opponentHostId) && styles.pkFollowingTag]}>
                      <Ionicons name={isFriendId(pk.opponentHostId) ? "people" : "checkmark"} size={9} color="#fff" />
                      <Text style={styles.pkFriendTxt}>{isFriendId(pk.opponentHostId) ? "Friend" : "Following"}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.pkOppPlus}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => followGuest({ uid: pk.opponentHostId, name: pk.opponentName, img: pk.opponentImg })}
                    >
                      <Ionicons name="add" size={13} color="#111" />
                    </TouchableOpacity>
                  )
                )}
              </View>
          </View>
        </View>
      )}

      {/* soft top/bottom scrims so the white text stays readable */}
      {!showPk && (
        <>
          <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0.5)", "rgba(0,0,0,0)"]} style={styles.topScrim} />
          <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]} style={styles.bottomScrim} />
        </>
      )}

      {/* ================= GUEST TILES (viewers on the call with the host) ================= */}
      {!showPk && guestList.length > 0 && (
        <View pointerEvents="box-none" style={styles.guestColumn}>
          {guestList.map((g: any) => {
            const isMe = g.uid === currentUid;
            const aid = Number(g.agoraUid || 0);
            const videoOn = isMe ? guestCamOn && guestPublishingRef.current : !!aid && remoteVideoOn[aid] === true;
            const micOff = isMe ? hostMutedMe || !guestMicOn : !!g.hostMuted;
            const followed = followingIds.has(g.uid) || guestFollowed.has(g.uid) || (g.uid === hostId && isFollowing);
            return (
              <TouchableOpacity
                key={g.uid}
                activeOpacity={0.9}
                onPress={() => onGuestTilePress(g)}
                style={styles.guestTile}
              >
                {videoOn ? (
                  <RtcSurfaceView
                    style={StyleSheet.absoluteFill}
                    canvas={{ uid: isMe ? 0 : aid }}
                    zOrderMediaOverlay
                  />
                ) : (
                  <View style={styles.guestAvaWrap}>
                    <View style={styles.guestAvaRing}>
                      <Image source={{ uri: g.img || STABLE_AVATAR }} style={styles.guestAva} />
                    </View>
                  </View>
                )}
                {micOff && (
                  <View style={styles.guestMicOff}>
                    <Ionicons name="mic-off" size={11} color="#fff" />
                  </View>
                )}
                <View style={styles.guestNameRow}>
                  <Text numberOfLines={1} style={styles.guestNameTxt}>
                    {isMe ? "You" : g.name || "Guest"}
                  </Text>
                  <UserTick uid={g.uid} verified={isMe ? !!myVerified : !!g.verified} verifiedColor={isMe ? myVerifiedColor : g.verifiedColor} size={12} />
                  {!isMe && !isHost && !followed && (
                    <TouchableOpacity
                      style={styles.guestPlus}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => followGuest(g)}
                    >
                      <Ionicons name="add" size={14} color="#111" />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ================= TOP HEADER ================= */}
      <View style={[styles.topHeader, { top: safeTop + 12 }]} pointerEvents="box-none">
        <View style={styles.topRow}>
          <View style={styles.hostPill}>
            <TouchableOpacity activeOpacity={0.85} onPress={openHostCard} style={styles.hostAvatarContainer}>
              <Image source={{ uri: hostImg }} style={styles.hostAvatarImg} />
              {(hostLevel >= 10 || !!hostId) && (
                <LevelFrame level={hostLevel} uid={hostId} animated style={styles.hostLevelFrame} />
              )}
            </TouchableOpacity>

            <View style={{ marginLeft: 8, flexShrink: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.hostNameText} numberOfLines={1}>
                  {hostName}
                </Text>
                <UserTick uid={hostId} verified={!!hostVerified} verifiedColor={hostVerifiedColor} size={14} />
              </View>
              <Text style={styles.starsText}>⭐ {hostStars}</Text>
            </View>

            {!isHost && !!hostId && hostId !== currentUid && !isFollowing && (
              <TouchableOpacity onPress={toggleFollowHost} disabled={followBusy} style={styles.followPlus}>
                <Ionicons name="add" size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.rightGroup}>
            <View style={styles.topStack}>
              {headerFive.map((u: any, i: number) => (
                <TouchableOpacity
                  key={u.uid}
                  activeOpacity={0.8}
                  style={styles.topChip}
                  onPress={() =>
                    setProfileCard({
                      uid: u.uid,
                      name: u.name || u.username,
                      username: u.username,
                      img: u.img,
                      level: u.level,
                      verified: u.verified,
                      verifiedColor: u.verifiedColor,
                    })
                  }
                >
                  <Image
                    source={{ uri: u.img || STABLE_AVATAR }}
                    style={[styles.topChipAva, { borderColor: u.isGifter && i < 3 ? SEAT_COL[i] : "#fff" }]}
                  />
                  {u.isGifter && i < 3 && (
                    <>
                      {i === 0 && <Text style={styles.topChipCrown}>👑</Text>}
                      <View style={[styles.topChipTag, { backgroundColor: SEAT_BADGE[i] }]}>
                        <Text style={styles.topChipTagTxt}>TOP{i + 1}</Text>
                      </View>
                    </>
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity activeOpacity={0.8} style={styles.viewerCountCircle} onPress={() => setViewerListVisible(true)}>
                <Text style={styles.viewerStackCount}>{viewerCount}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setExitModalVisible(true)}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {!showPk && (
        <View style={styles.weeklyRow}>
          <View style={styles.weeklyTag}>
            <Ionicons name="stats-chart" size={12} color="#FFD700" />
            <Text style={styles.weeklyTxt}>Weekly Host</Text>
          </View>
          {isHost && <WeeklyMinutesPill startTime={roomStartTime} />}
          {hostMicMuted && <Ionicons name="mic-off" size={13} color="#fff" style={{ marginLeft: 8 }} />}
          {netQuality > 0 && (
            <Ionicons
              name="cellular"
              size={13}
              color={netQuality >= 4 ? "#FF5252" : netQuality === 3 ? "#FFC107" : "#69F0AE"}
              style={{ marginLeft: 8 }}
            />
          )}
        </View>
        )}
      </View>

      {/* title / pinned message / weak network */}
      {!showPk && (!!roomTitle || !!pinnedText || netQuality >= 4) && (
        <View pointerEvents="none" style={styles.infoWrap}>
          {!!roomTitle && (
            <View style={styles.titlePill}>
              <Text numberOfLines={1} style={styles.titleTxt}>
                {roomTitle}
              </Text>
            </View>
          )}
          {!!pinnedText && (
            <View style={styles.pinPill}>
              <Text style={{ fontSize: 12 }}>📌</Text>
              <Text numberOfLines={2} style={styles.pinTxt}>
                {pinnedText}
              </Text>
            </View>
          )}
          {netQuality >= 4 && (
            <View style={styles.netPill}>
              <Text style={styles.netTxt}>⚠ {isHost ? "Your network is weak" : "Weak connection"}</Text>
            </View>
          )}
        </View>
      )}

      {/* host: camera is on but the channel isn't live yet */}
      {isHost && localReady && agoraStatus !== "Live" && (
        <TouchableOpacity
          activeOpacity={agoraFailed ? 0.7 : 1}
          onPress={agoraFailed ? retryAgora : undefined}
          style={styles.statusPill}
        >
          {!agoraFailed && <ActivityIndicator size="small" color="#fff" />}
          <Text style={styles.statusPillTxt} numberOfLines={1}>
            {agoraFailed ? agoraStatus : `${agoraStatus} viewers can't see you yet`}
          </Text>
          {agoraFailed && <Text style={styles.pkWaitCancel}>Retry</Text>}
        </TouchableOpacity>
      )}

      {/* PK invite waiting pill (inviter) */}
      {isHost && pkInvited && !matching && (
        <View style={styles.pkWaitPill}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.pkWaitPillTxt}>Waiting for {pk?.opponentName || "host"}...</Text>
          <TouchableOpacity onPress={cancelPkInvite}>
            <Text style={styles.pkWaitCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ================= CHAT OVERLAY ================= */}
      <FlatList
        ref={chatListRef}
        data={chatListData}
        inverted
        keyExtractor={chatKeyExtractor}
        renderItem={renderChat}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        ListFooterComponent={
          <View style={styles.welcomeBox}>
            <Text style={styles.welcomeTxt}>{WELCOME_TEXT}</Text>
          </View>
        }
        style={chatListStyle}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        windowSize={5}
        removeClippedSubviews={false}
      />

      {/* ================= FLOATING HEARTS ================= */}
      <HeartsLayer ref={heartsRef} bottom={96 + keyboardHeight} />

      {/* ================= BOTTOM BAR ================= */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
        style={[
          styles.bottomNav,
          {
            bottom: keyboardHeight,
            paddingBottom: Platform.OS === "android" ? insets.bottom + 8 : insets.bottom,
          },
        ]}
      >
        {chatOpen ? (
          <>
            <View style={styles.inputBox}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TextInput
                  style={[styles.inputStyle, { flex: 1 }]}
                  placeholder="Say something..."
                  placeholderTextColor="#aaa"
                  value={chatMessage}
                  onChangeText={setChatMessage}
                  onSubmitEditing={handleSendChat}
                  returnKeyType="send"
                  maxLength={200}
                  autoFocus
                />
                <TouchableOpacity onPress={() => setEmojiOpen((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: 20 }}>😊</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={styles.sendBtn} onPress={handleSendChat}>
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.chatPill} onPress={openChat} activeOpacity={0.8}>
              <Ionicons name="chatbubble-outline" size={22} color="#fff" />
              <Text style={styles.chatPillTxt}>Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.circleBtn} onPress={handleShare}>
              <Ionicons name="arrow-redo" size={23} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.circleBtn} onPress={() => setMenuVisible(true)}>
              <Ionicons name="menu" size={26} color="#fff" />
            </TouchableOpacity>

            {!showPk && (
            <TouchableOpacity
              style={[styles.circleBtn, amGuest && styles.circleBtnOn]}
              onPress={isHost ? () => setGuestSheetVisible(true) : sendGuestRequest}
            >
              <MaterialCommunityIcons
                name={amGuest ? "phone-in-talk" : "link-variant"}
                size={20}
                color={amGuest ? "#fff" : myReqPending ? "#9aa0b4" : "#FFC107"}
              />
              {isHost && pendingRequests.length > 0 && (
                <View style={styles.guestBadge}>
                  <Text style={styles.guestBadgeTxt}>{Math.min(pendingRequests.length, 9)}</Text>
                </View>
              )}
            </TouchableOpacity>
            )}

            <View style={{ flex: 1 }} />

            {isHost ? (
              <>
                {pkActive && (
                  <TouchableOpacity style={styles.giftCircle} onPress={openGiftModal}>
                    <GiftButtonLottie />
                  </TouchableOpacity>
                )}
                {matching && matchMini ? (
                  <TouchableOpacity style={styles.matchMiniPill} onPress={() => setMatchMini(false)}>
                    <Text style={styles.matchMiniTxt}>Matching...</Text>
                    <MatchTimer startAt={matchStartRef.current} style={styles.matchMiniTime} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.pkBadgeBtn, pkActive && styles.pkEndBtn]}
                    onPress={onPkButton}
                    activeOpacity={0.8}
                  >
                    {pkActive ? (
                      <Text style={styles.pkBadgeBtnTxt}>END</Text>
                    ) : (
                      <Text style={styles.pkLogoBtnTxt}>
                        <Text style={{ color: "#35C8FF" }}>P</Text>
                        <Text style={{ color: "#FF3D9A" }}>K</Text>
                      </Text>
                    )}
                    {showInvite && <View style={styles.pkBadgeDot} />}
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <TouchableOpacity style={styles.giftCircle} onPress={openGiftModal}>
                <GiftButtonLottie />
              </TouchableOpacity>
            )}
          </>
        )}
      </KeyboardAvoidingView>

      {emojiOpen && chatOpen && (
        <View
          style={[
            styles.emojiStrip,
            { bottom: keyboardHeight + 60 + (Platform.OS === "android" ? insets.bottom + 8 : insets.bottom) },
          ]}
        >
          {QUICK_EMOJIS.map((e) => (
            <TouchableOpacity key={e} onPress={() => setChatMessage((m) => (m + e).slice(0, 200))}>
              <Text style={{ fontSize: 24, marginHorizontal: 6 }}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!!toast && (
        <View
          pointerEvents="none"
          style={[
            styles.toastWrap,
            { bottom: 64 + keyboardHeight + (Platform.OS === "android" ? insets.bottom + 8 : insets.bottom) },
          ]}
        >
          <View style={styles.toastPill}>
            <View style={styles.toastIcon}>
              <Ionicons name="checkmark" size={14} color="#111" />
            </View>
            <Text style={styles.toastTxt}>{toast}</Text>
          </View>
        </View>
      )}

      {/* ================= GIFT ANIMATION + BANNERS ================= */}
      <GiftLayer
        ref={giftLayerRef}
        comboTop={showPk ? pkPanelTop + pkPanelH + 4 : height * 0.18}
        // PK: gift animation upar (banners ke upar se overlap hoga, touch-through hai) + bada size
        animTop={showPk ? pkPanelTop + pkPanelH + 44 - 65 : undefined}
        animSize={showPk ? Math.min(width * 0.9, 360) : undefined}
      />

      {/* ================= JOIN ENTRY ANIMATION (LiveRoom jaisa: frame + tick) ================= */}
      {joinBanner && (
        <JoinEntry
          key={joinBanner._k}
          data={joinBanner}
          variant={JOIN_ANIM_VARIANT}
          onDone={handleJoinDone}
        />
      )}

      {/* ================= EXIT CONFIRM MODAL ================= */}
      <Modal transparent visible={exitModalVisible} animationType="fade" onRequestClose={() => setExitModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.exitBox}>
            <Text style={styles.exitTitle}>{isHost ? "End Live?" : "Leave Live?"}</Text>
            <Text style={styles.exitSub}>
              {isHost
                ? "Your live stream will end for everyone watching."
                : "You can rejoin anytime while the host is still live."}
            </Text>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.noBtn} onPress={() => setExitModalVisible(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.yesBtn} onPress={confirmExit}>
                <Text style={styles.btnText}>{isHost ? "End Live" : "Leave"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= GIFT MODAL (compact, same as LiveRoom) ================= */}
      <Modal
        visible={giftModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        hardwareAccelerated
        onRequestClose={() => setGiftModalVisible(false)}
      >
        <View style={styles.giftOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setGiftModalVisible(false)} />

          <Animated.View
            style={[
              styles.giftSheet,
              {
                paddingBottom: Math.max(insets.bottom, Platform.OS === "android" ? 28 : 14) + 10,
                transform: [{ translateY: giftModalAnim }],
              },
            ]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={["#2b1055", "#1a0b38", "#0d0618"]}
              locations={[0, 0.5, 1]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.giftGoldLine} pointerEvents="none" />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Text style={styles.giftTitle}>🎁 Send Gifts</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ fontSize: 16 }}>⭐</Text>
                <GiftBalance stars={stars} />
              </View>
            </View>

            {/* who receives the gift: sirf meri side ka host (PK me Switch se doosri side) */}
            <View style={styles.giftToRow}>
              <Text style={styles.giftToLbl}>To</Text>
              {giftUsers[0] && (
                <>
                  <Image
                    source={{ uri: giftUsers[0].img || STABLE_AVATAR }}
                    style={[styles.giftToAva, { borderColor: onOppSide ? "#FF2D75" : pkActive ? "#1E8CFF" : "#F5C451" }]}
                  />
                  <Text style={styles.giftToName} numberOfLines={1}>
                    {giftUsers[0].name}
                  </Text>
                  <UserTick uid={giftUsers[0].uid} verified={!!giftUsers[0].verified} verifiedColor={giftUsers[0].verifiedColor} size={13} />
                </>
              )}
              {pkActive && !!pk?.opponentHostId && (
                <Text style={styles.giftSideHint} numberOfLines={2}>
                  Gift goes to this host only. To gift the other host, tap their PK screen to enter their live room.
                </Text>
              )}
            </View>

            {/* gift pages: 4 columns x 2 rows, snap paging */}
            <FlatList
              data={GIFT_PAGES}
              keyExtractor={(p: any) => p.key}
              renderItem={({ item }: any) => <GiftPage page={item} onSend={stableSendGift} />}
              horizontal
              snapToInterval={GIFT_PAGE_W}
              snapToAlignment="start"
              disableIntervalMomentum
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              getItemLayout={(_: any, index: number) => ({ length: GIFT_PAGE_W, offset: GIFT_PAGE_W * index, index })}
              initialNumToRender={2}
              maxToRenderPerBatch={2}
              windowSize={5}
              removeClippedSubviews={false}
              bounces={Platform.OS === "ios"}
              overScrollMode="never"
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              onMomentumScrollEnd={(e: any) => {
                const idx = Math.max(
                  0,
                  Math.min(GIFT_PAGES.length - 1, Math.round(e.nativeEvent.contentOffset.x / GIFT_PAGE_W))
                );
                setGiftPageIdx((prev) => (prev === idx ? prev : idx));
              }}
            />

            {GIFT_PAGES.length > 1 && (
              <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", paddingTop: 2 }}>
                {GIFT_PAGES.map((p: any, i: number) => (
                  <View
                    key={p.key}
                    style={{
                      width: i === giftPageIdx ? 14 : 6,
                      height: 6,
                      borderRadius: 3,
                      marginHorizontal: 3,
                      backgroundColor: i === giftPageIdx ? "#F5C451" : "rgba(255,255,255,0.25)",
                    }}
                  />
                ))}
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>

      {/* ================= VIEWER LIST ================= */}
      <Modal transparent visible={viewerListVisible} animationType="slide" onRequestClose={() => setViewerListVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setViewerListVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { height: height * 0.6 }]}>
            <Text style={styles.sheetTitle}>👥 Viewers ({viewerCount})</Text>
            <Text style={styles.sheetSub}>Tap a person to see their profile.</Text>
            {isMod && (
              <View style={styles.modBar}>
                <TouchableOpacity
                  style={[styles.modBarBtn, chatLocked && { backgroundColor: "#F71084" }]}
                  onPress={toggleChatLock}
                >
                  <Ionicons name={chatLocked ? "lock-closed" : "lock-open-outline"} size={15} color="#fff" />
                  <Text style={styles.modBarTxt}>{chatLocked ? "Chat locked" : "Lock chat"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modBarBtn, { backgroundColor: "#DC2626" }]} onPress={deleteAllChats}>
                  <Ionicons name="trash-outline" size={15} color="#fff" />
                  <Text style={styles.modBarTxt}>Delete all chats</Text>
                </TouchableOpacity>
              </View>
            )}
            {hostId ? (
              <TouchableOpacity
                style={styles.pkRow}
                onPress={() => {
                  setViewerListVisible(false);
                  openHostCard();
                }}
              >
                <Image source={{ uri: hostImg }} style={styles.pkRowAva} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.pkRowName} numberOfLines={1}>
                    {hostName}
                  </Text>
                </View>
                <View style={[styles.roleTag, { backgroundColor: "#F71084" }]}>
                  <Text style={styles.roleTagTxt}>HOST</Text>
                </View>
              </TouchableOpacity>
            ) : null}
            {audienceArray.length === 0 ? (
              <Text style={styles.emptyTxt}>No viewers yet. Share the live to get people in!</Text>
            ) : (
              <FlatList
                data={audienceSorted}
                initialNumToRender={10}
                maxToRenderPerBatch={8}
                windowSize={5}
                removeClippedSubviews
                keyExtractor={(i: any) => i.uid}
                renderItem={({ item }: any) => {
                  const th = getLevelTheme(item.level || 1);
                  return (
                    <TouchableOpacity
                      style={styles.pkRow}
                      onPress={() => {
                        setViewerListVisible(false);
                        setProfileCard({
                          uid: item.uid,
                          name: item.name || item.username,
                          username: item.username,
                          img: item.img,
                          level: item.level,
                          verified: item.verified,
                          verifiedColor: item.verifiedColor,
                        });
                      }}
                    >
                      <Image source={{ uri: item.img || STABLE_AVATAR }} style={styles.pkRowAva} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={styles.pkRowName} numberOfLines={1}>
                            {item.name || item.username || "User"}
                          </Text>
                          <UserTick uid={item.uid || item.userId || item.senderId || item.id} verified={!!(!!item.verified)} verifiedColor={item.verifiedColor} size={14} />
                          <View style={[styles.levelBadge, { backgroundColor: th.bg, borderColor: th.border }]}>
                            <MaterialCommunityIcons name="diamond-stone" size={9} color={th.icon} />
                            <Text style={[styles.levelText, { color: th.text, fontSize: 8 }]}>LV {item.level || 1}</Text>
                          </View>
                        </View>
                        {(mods[item.uid] || mutedUsers[item.uid]) && (
                          <Text style={styles.pkRowSub}>
                            {mods[item.uid] ? "Moderator" : ""}
                            {mods[item.uid] && mutedUsers[item.uid] ? " · " : ""}
                            {mutedUsers[item.uid] ? "Muted" : ""}
                          </Text>
                        )}
                      </View>
                      {canModerate(item) ? (
                        <TouchableOpacity
                          style={styles.kickBtn}
                          onPress={() => kickUser({ uid: item.uid, name: item.name || item.username })}
                        >
                          <Text style={styles.kickBtnTxt}>Kick</Text>
                        </TouchableOpacity>
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color="#6b7280" />
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ================= TOP GIFTERS RANKING ================= */}
      <Modal transparent visible={rankVisible} animationType="slide" onRequestClose={() => setRankVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setRankVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { height: height * 0.55 }]}>
            <Text style={styles.sheetTitle}>🏆 Top Gifters</Text>
            <Text style={styles.sheetSub}>Ranked by stars sent in this live.</Text>
            {rankedGifters.length === 0 ? (
              <Text style={styles.emptyTxt}>No gifts yet. Be the first to send one! 🎁</Text>
            ) : (
              <FlatList
                data={rankedGifters}
                initialNumToRender={10}
                maxToRenderPerBatch={8}
                windowSize={5}
                removeClippedSubviews
                keyExtractor={(i: any) => i.uid}
                renderItem={({ item, index }: any) => (
                  <TouchableOpacity
                    style={styles.pkRow}
                    onPress={() => {
                      setRankVisible(false);
                      setProfileCard({
                        uid: item.uid,
                        name: item.name,
                        img: item.img,
                        level: item.level,
                        verified: item.verified,
                        verifiedColor: item.verifiedColor,
                      });
                    }}
                  >
                    <Text style={[styles.rankNum, index < 3 && { color: ["#FFD700", "#C0C0C0", "#CD7F32"][index] }]}>
                      {index + 1}
                    </Text>
                    <Image source={{ uri: item.img || STABLE_AVATAR }} style={styles.pkRowAva} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={styles.pkRowName} numberOfLines={1}>
                          {item.name || "User"}
                        </Text>
                        <UserTick uid={item.uid} verified={!!item.verified} verifiedColor={item.verifiedColor} size={14} />
                      </View>
                      <Text style={styles.pkRowSub}>LV {item.level || 1}</Text>
                    </View>
                    <Text style={styles.rankStars}>⭐ {item.stars}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ================= USER PROFILE CARD (bottom sheet) ================= */}
      <Modal transparent visible={!!profileCard} animationType="slide" statusBarTranslucent onRequestClose={() => setProfileCard(null)}>
        <View style={styles.pcOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setProfileCard(null)} />
          {profileCard && (
            <View style={[styles.pcSheet, { paddingBottom: 16 + insets.bottom }]}>
              <TouchableOpacity activeOpacity={0.85} style={styles.pcAvaWrap} onPress={() => goUserProfile(profileCard)}>
                <Image source={{ uri: profileCard.img || STABLE_AVATAR }} style={styles.pcAva} />
                {(Number(profileCard.level) >= 10 || !!profileCard.uid) && (
                  <LevelFrame level={Number(profileCard.level)} uid={profileCard.uid} animated style={{ position: "absolute", width: 110, height: 110 }} />
                )}
              </TouchableOpacity>

              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
                <Text style={styles.pcName} numberOfLines={1}>{profileCard.name || profileCard.username || "User"}</Text>
                <UserTick uid={profileCard.uid || profileCard.userId || profileCard.senderId || profileCard.id} verified={!!profileCard.verified} verifiedColor={profileCard.verifiedColor} size={17} />
                {profileCard.uid === hostId && (
                  <View style={[styles.roleTag, { backgroundColor: "#F71084", marginLeft: 6 }]}><Text style={styles.roleTagTxt}>HOST</Text></View>
                )}
                {!!mods[profileCard.uid] && (
                  <View style={[styles.roleTag, { backgroundColor: "#2D9CFF", marginLeft: 6 }]}><Text style={styles.roleTagTxt}>MOD</Text></View>
                )}
                {!!mutedUsers[profileCard.uid] && (
                  <View style={[styles.roleTag, { backgroundColor: "#6b7280", marginLeft: 6 }]}><Text style={styles.roleTagTxt}>MUTED</Text></View>
                )}
              </View>

              {/* Followers / Following / Likes */}
              <View style={styles.pcStats}>
                <View style={styles.pcStat}><Text style={styles.pcStatN}>{pcInfo ? pcInfo.followers : "—"}</Text><Text style={styles.pcStatL}>Followers</Text></View>
                <View style={styles.pcStat}><Text style={styles.pcStatN}>{pcInfo ? pcInfo.following : "—"}</Text><Text style={styles.pcStatL}>Following</Text></View>
                <View style={styles.pcStat}><Text style={styles.pcStatN}>{pcInfo ? pcInfo.likes : "—"}</Text><Text style={styles.pcStatL}>Likes</Text></View>
              </View>

              {/* Level card  +  FAMILY card (sirf jab user family me ho) */}
              <View style={styles.pcCards}>
                {(() => {
                  const lv = Number(profileCard.level) || 1;
                  const th = getLevelTheme(lv);
                  return (
                    <TouchableOpacity activeOpacity={0.8} style={styles.pcCard} onPress={() => goUserProfile(profileCard)}>
                      <View style={[styles.pcLvPill, { backgroundColor: th.bg, borderColor: th.border }]}>
                        <MaterialCommunityIcons name="diamond-stone" size={13} color={th.icon} />
                        <Text style={[styles.pcLvTxt, { color: th.text }]}>{lv}LV</Text>
                      </View>
                      <Text style={styles.pcLvMore}>Level &gt;</Text>
                    </TouchableOpacity>
                  );
                })()}

                {!!pcInfo?.familyId && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.pcCard, { marginLeft: 10 }]}
                    onPress={() => { const fid = pcInfo.familyId; setProfileCard(null); router.push({ pathname: "/familyDetail", params: { id: fid } } as any); }}
                  >
                    <Image source={{ uri: pcInfo.familyLogo || STABLE_AVATAR }} style={styles.pcFamLogo} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.pcFamName} numberOfLines={1}>{pcInfo.familyName}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        <Ionicons name="people" size={12} color="#aaa" />
                        <Text style={styles.pcFamSub}> {pcInfo.familyMembers || 1}</Text>
                        <Ionicons name="flame-outline" size={12} color="#aaa" style={{ marginLeft: 8 }} />
                        <Text style={styles.pcFamSub}> {fmtPoints(pcInfo.familyPoints)}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
              </View>

              {/* Profile + Follow */}
              <View style={styles.pcMainBtns}>
                <TouchableOpacity style={styles.pcProfileBtn} onPress={() => goUserProfile(profileCard)}>
                  <Text style={styles.pcProfileTxt}>Profile</Text>
                </TouchableOpacity>
                {profileCard.uid !== currentUid && (
                  <TouchableOpacity
                    style={[styles.pcFollowBtn, profileFollowing && { backgroundColor: "#3a3a3a" }]}
                    onPress={toggleProfileFollow}
                  >
                    <Text style={[styles.pcFollowTxt, profileFollowing && { color: "#fff" }]}>{profileFollowing ? "Following" : "Follow"}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Extra actions (gift / mod / mute / kick / report) */}
              {profileCard.uid !== currentUid && (
                <View style={styles.pcChips}>
                  {profileCard.isHostCard && !isHost && (
                    <TouchableOpacity style={[styles.pcChip, { backgroundColor: "#F59E0B" }]} onPress={() => { setProfileCard(null); openGiftModal(); }}>
                      <Text style={styles.pcChipTxt}>🎁 Send Gift</Text>
                    </TouchableOpacity>
                  )}
                  {canModerate(profileCard) && (
                    <>
                      <TouchableOpacity style={[styles.pcChip, { backgroundColor: "#374151" }]} onPress={() => muteUser(profileCard, !mutedUsers[profileCard.uid])}>
                        <Text style={styles.pcChipTxt}>{mutedUsers[profileCard.uid] ? "🔊 Unmute chat" : "🔇 Mute chat"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.pcChip, { backgroundColor: "#DC2626" }]} onPress={() => kickUser(profileCard)}>
                        <Text style={styles.pcChipTxt}>🚫 Remove</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {isHost && profileCard.uid !== hostId && (
                    <TouchableOpacity style={[styles.pcChip, { backgroundColor: "#2D9CFF" }]} onPress={() => toggleMod(profileCard)}>
                      <Text style={styles.pcChipTxt}>{mods[profileCard.uid] ? "Remove mod" : "🛡 Make mod"}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[styles.pcChip, { backgroundColor: "transparent", borderWidth: 1, borderColor: "#4b5563" }]} onPress={() => { setReportTarget(profileCard); setProfileCard(null); }}>
                    <Text style={[styles.pcChipTxt, { color: "#f87171" }]}>⚑ Report</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      </Modal>

      {/* ================= REPORT REASON ================= */}
      <Modal transparent visible={!!reportTarget} animationType="slide" onRequestClose={() => setReportTarget(null)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setReportTarget(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <Text style={styles.sheetTitle}>Report {reportTarget?.name || "user"}</Text>
            <Text style={styles.sheetSub}>Why are you reporting?</Text>
            {REPORT_REASONS.map((r) => (
              <TouchableOpacity key={r} style={styles.reasonRow} onPress={() => submitReport(r)}>
                <Text style={styles.reasonTxt}>{r}</Text>
                <Ionicons name="chevron-forward" size={16} color="#6b7280" />
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ================= HOST SETUP (title / pinned / chat) ================= */}
      <Modal transparent visible={settingsVisible} animationType="slide" onRequestClose={() => setSettingsVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setSettingsVisible(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.sheet}>
              <Text style={styles.sheetTitle}>Live Setup</Text>

              <Text style={styles.fieldLbl}>Live title</Text>
              <TextInput
                style={styles.fieldInput}
                value={titleDraft}
                onChangeText={setTitleDraft}
                placeholder="e.g. Singing tonight 🎤"
                placeholderTextColor="#6b7280"
                maxLength={60}
              />

              <Text style={styles.fieldLbl}>Pinned message (shown to everyone)</Text>
              <TextInput
                style={[styles.fieldInput, { height: 70, textAlignVertical: "top" }]}
                value={pinDraft}
                onChangeText={setPinDraft}
                placeholder="Welcome! Follow & send gifts 💖"
                placeholderTextColor="#6b7280"
                multiline
                maxLength={140}
              />

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLblDark}>Turn off chat for viewers</Text>
                  <Text style={styles.pkRowSub}>You and moderators can still chat.</Text>
                </View>
                <Switch value={lockDraft} onValueChange={setLockDraft} trackColor={{ true: "#F71084", false: "#374151" }} />
              </View>

              <TouchableOpacity
                style={[styles.modBarBtn, { backgroundColor: "#DC2626", marginTop: 16, justifyContent: "center", paddingVertical: 11 }]}
                onPress={deleteAllChats}
              >
                <Ionicons name="trash-outline" size={16} color="#fff" />
                <Text style={styles.modBarTxt}>Delete all chats</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveBtn} onPress={saveSettings}>
                <Text style={styles.saveBtnTxt}>Save</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ================= HOST: LIVE ENDED ================= */}
      <Modal transparent visible={!!summary} animationType="fade" onRequestClose={doLeaveNow}>
        <View style={styles.endBg}>
          <View style={styles.endHeader}>
            <TouchableOpacity onPress={doLeaveNow} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.endHeaderTxt}>LIVE has ended</Text>
            <View style={{ width: 26 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
            <View style={styles.endCard}>
              <Text style={styles.endCardTitle}>Live Data</Text>
              <View style={styles.endGrid}>
                {[
                  { k: "Total Viewers", v: String(summary?.peak || 0) },
                  { k: "Stars earned", v: String(summary?.stars || 0) },
                  { k: "New Fans", v: String(summary?.followers || 0) },
                  { k: "LIVE Time", v: fmtDur(summary?.durationMs || 0) },
                ].map((c) => (
                  <View key={c.k} style={styles.endCell}>
                    <Text style={styles.endVal}>{c.v}</Text>
                    <Text style={styles.endLbl}>{c.k}</Text>
                  </View>
                ))}
              </View>
            </View>

            {(() => {
              const mins = Math.floor((summary?.durationMs || 0) / 60000);
              const pct = Math.min(100, Math.round((mins / WEEKLY_TARGET_MIN) * 100));
              const left = Math.max(0, WEEKLY_TARGET_MIN - mins);
              return (
                <View style={[styles.endCard, { flexDirection: "row", alignItems: "center" }]}>
                  <ProgressRing pct={pct}>
                    <Text style={styles.endPct}>{pct}%</Text>
                  </ProgressRing>
                  <View style={{ marginLeft: 22, flex: 1 }}>
                    <Text style={styles.endProgTitle}>Broadcast 2 hours live = 150 stars</Text>
                    <Text style={styles.endProgSub}>
                      {left > 0 ? `${left} more min to complete` : "Goal completed!"}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {!!summary?.gifters?.length && (
              <View style={styles.endCard}>
                <Text style={styles.endCardTitle}>Top gifters</Text>
                {summary.gifters.map((g: any, i: number) => (
                  <View key={g.uid} style={styles.sumGifter}>
                    <Text style={{ color: ["#FFD700", "#C0C0C0", "#CD7F32"][i], fontWeight: "800", width: 20 }}>{i + 1}</Text>
                    <Image source={{ uri: g.img || STABLE_AVATAR }} style={{ width: 34, height: 34, borderRadius: 17 }} />
                    <Text style={styles.sumGifterName} numberOfLines={1}>
                      {g.name}
                    </Text>
                    <UserTick uid={g.uid} verified={!!g.verified} verifiedColor={g.verifiedColor} size={14} />
                    <Text style={styles.rankStars}>⭐ {g.stars}</Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.endCentre} onPress={doLeaveNow} activeOpacity={0.85}>
              <View style={styles.endCentreIcon}>
                <Ionicons name="mic" size={22} color="#111" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.endCentreTitle}>Done</Text>
                <Text style={styles.endCentreSub}>Back to home</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#111" />
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ================= TOOLS MENU (hamburger) ================= */}
      {/* ================= GUEST REQUESTS / GUESTS (host) ================= */}
      <Modal
        transparent
        visible={guestSheetVisible}
        animationType="slide"
        onRequestClose={() => setGuestSheetVisible(false)}
      >
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setGuestSheetVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { maxHeight: height * 0.7 }]}>
            <Text style={styles.sheetTitle}>Guest call</Text>
            <Text style={styles.sheetSub}>
              {guestList.length}/{MAX_GUESTS} seats used · viewers can tap the gold link button to ask to join
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.guestSecTitle}>On the call</Text>
              {guestList.length === 0 ? (
                <Text style={styles.guestEmpty}>No one is on the call yet</Text>
              ) : (
                guestList.map((g: any) => (
                  <View key={g.uid} style={styles.guestRow}>
                    <Image source={{ uri: g.img || STABLE_AVATAR }} style={styles.guestRowAva} />
                    <Text numberOfLines={1} style={styles.guestRowName}>
                      {g.name || "Guest"}
                    </Text>
                    <UserTick uid={g.uid} verified={!!g.verified} verifiedColor={g.verifiedColor} size={14} />
                    <TouchableOpacity
                      style={[styles.guestBtn, { backgroundColor: g.hostMuted ? "#F71084" : "#2a2b38" }]}
                      onPress={() => muteGuest(g.uid, !g.hostMuted)}
                    >
                      <Ionicons name={g.hostMuted ? "mic-off" : "mic"} size={16} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.guestBtn, { backgroundColor: "#DC2626", marginLeft: 8 }]}
                      onPress={() => removeGuest(g.uid)}
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              <Text style={[styles.guestSecTitle, { marginTop: 16 }]}>Requests ({pendingRequests.length})</Text>
              {pendingRequests.length === 0 ? (
                <Text style={styles.guestEmpty}>No waiting requests</Text>
              ) : (
                pendingRequests.map((r: any) => (
                  <View key={r.uid} style={styles.guestRow}>
                    <Image source={{ uri: r.img || STABLE_AVATAR }} style={styles.guestRowAva} />
                    <Text numberOfLines={1} style={styles.guestRowName}>
                      {r.username || r.name || "Viewer"}
                    </Text>
                    <UserTick uid={r.uid} verified={isVerified(r.verified)} verifiedColor={r.verifiedColor} size={14} />
                    <TouchableOpacity style={[styles.guestBtn, { backgroundColor: "#2a2b38" }]} onPress={() => rejectGuest(r)}>
                      <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.guestAccept, guestList.length >= MAX_GUESTS && { opacity: 0.4 }]}
                      disabled={guestList.length >= MAX_GUESTS}
                      onPress={() => acceptGuest(r)}
                    >
                      <Text style={styles.guestAcceptTxt}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal transparent visible={menuVisible} animationType="slide" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.menuGrid}>
              {menuItems.map((it: any) => (
                <TouchableOpacity
                  key={it.key}
                  style={styles.menuItem}
                  activeOpacity={0.8}
                  onPress={() => {
                    setMenuVisible(false);
                    setTimeout(() => it.onPress && it.onPress(), 280);
                  }}
                >
                  <View style={[styles.menuIcon, it.active && styles.menuIconOn]}>{it.icon}</View>
                  <Text style={styles.menuLbl} numberOfLines={1}>
                    {it.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ================= FILTER MODAL (host) ================= */}
      <Modal
        transparent
        visible={filterModalVisible}
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setFilterModalVisible(false)}>
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Platform.OS === "android" ? 28 : 14) + 20 }]}
          >
            <Text style={styles.sheetTitle}>Beauty & Filters</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6 }}>
              {FILTERS.map((f) => (
                <TouchableOpacity key={f.id} style={styles.filterItem} onPress={() => applyFilter(f)}>
                  <View style={[styles.filterCircle, filterId === f.id && styles.filterCircleActive]}>
                    <Text style={{ fontSize: 24 }}>{f.icon}</Text>
                  </View>
                  <Text style={[styles.filterLabel, filterId === f.id && { color: "#F71084" }]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ================= PK: SHEET (host) ================= */}
      <Modal transparent visible={pkListVisible} animationType="slide" onRequestClose={() => setPkListVisible(false)}>
        <TouchableOpacity style={styles.pkSheetOverlay} activeOpacity={1} onPress={() => setPkListVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.pkSheet}>
            <View style={styles.pkSheetHead}>
              <TouchableOpacity style={styles.pkHeadIcon} onPress={() => Alert.alert("PK history", "No PK battles yet.")}>
                <Ionicons name="time-outline" size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.pkLogo}>
                <Text style={{ color: "#29D3F5" }}>P</Text>
                <Text style={{ color: "#FF3FA4" }}>K</Text>
              </Text>
              <View style={{ flexDirection: "row" }}>
                <TouchableOpacity
                  style={styles.pkHeadIcon}
                  onPress={() =>
                    Alert.alert(
                      "PK Battle",
                      "Challenge another live host. The host who receives the most gifts when the timer ends wins. Random Match finds an online host for you automatically."
                    )
                  }
                >
                  <Ionicons name="help-circle-outline" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.pkHeadIcon} onPress={() => setPkSettingsOpen((v) => !v)}>
                  <Ionicons name="settings-outline" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {pkSettingsOpen && (
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                <Text style={styles.qtyLbl}>Battle length</Text>
                {PK_DURATIONS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setPkDuration(d)}
                    style={[styles.qtyChip, pkDuration === d && styles.qtyChipOn]}
                  >
                    <Text style={[styles.qtyChipTxt, pkDuration === d && { color: "#fff" }]}>{d / 60} min</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              <View style={styles.pkCardsRow}>
                <TouchableOpacity
                  style={[styles.pkCard, { backgroundColor: "#8E44FF", marginRight: 10 }]}
                  activeOpacity={0.85}
                  onPress={startRandomMatch}
                >
                  <View style={styles.pkCardIcon}>
                    <Ionicons name="shuffle" size={24} color="#fff" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.pkCardTitle}>Random Match</Text>
                    <Text style={styles.pkCardSub} numberOfLines={2}>
                      PK with other hosts online
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pkCard, { backgroundColor: "#FF8A4C" }]}
                  activeOpacity={0.85}
                  onPress={() => Alert.alert("Family PK", "Family PK is coming soon.")}
                >
                  <View style={styles.pkCardIcon}>
                    <Ionicons name="trophy" size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.pkCardTitle}>Family PK</Text>
                    <Text style={styles.pkCardSub} numberOfLines={2}>
                      Start a PK against other families
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {pkLoading && pkCandidates.length === 0 && friendsList.length === 0 ? (
                <ActivityIndicator color="#F71084" style={{ marginTop: 40 }} />
              ) : (
                <>
                  <Text style={styles.pkSectionTitle}>
                    Friends{pkFriendsLive > 0 ? `  ·  ${pkFriendsLive} live` : ""}
                  </Text>
                  {pkFriendRows.length === 0 ? (
                    <Text style={styles.pkEmptySmall}>
                      {PK_FRIEND_MODE === "mutual"
                        ? "No friends yet. Follow each other to see them here."
                        : "No friends yet. Follow someone to see them here."}
                    </Text>
                  ) : (
                    pkFriendRows.map((r: any) => renderPkRow(r))
                  )}
                  {pkRecommended.length > 0 && (
                    <>
                      <Text style={styles.pkSectionTitle}>Hosts Recommended</Text>
                      {pkRecommended.map((r: any) => renderPkRow(r))}
                    </>
                  )}
                  {pkRecommended.length === 0 && pkFriendsLive === 0 && !pkLoading && (
                    <Text style={styles.emptyTxt}>No other host is live right now.</Text>
                  )}
                </>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ================= PK: MATCHING (Random Match) ================= */}
      <Modal
        transparent
        visible={isHost && matching && !matchMini}
        animationType="slide"
        onRequestClose={() => setMatchMini(true)}
      >
        <View style={styles.matchOverlay} pointerEvents="box-none">
          <View style={styles.matchSheet}>
            <TouchableOpacity style={styles.matchChevron} onPress={() => setMatchMini(true)}>
              <Ionicons name="chevron-down" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.matchRow}>
              <View style={[styles.matchAvaRing, { borderColor: "#1E90FF" }]}>
                <Image source={{ uri: hostImg }} style={styles.matchAva} />
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={styles.matchTitle}>Matching...</Text>
                <MatchTimer startAt={matchStartRef.current} style={styles.matchTime} />
              </View>
              <View style={[styles.matchAvaRing, { borderColor: "#FF3FA4" }]}>
                <View style={[styles.matchAva, styles.matchUnknown]}>
                  <Ionicons name="person" size={34} color="#3a2030" />
                  <Text style={styles.matchQ}>?</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.matchCancel} onPress={cancelMatching}>
              <Text style={styles.matchCancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ================= PK: INCOMING INVITE (host) ================= */}
      <Modal transparent visible={!!showInvite} animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.exitBox}>
            <Image source={{ uri: pkInvite?.fromImg || STABLE_AVATAR }} style={styles.inviteAva} />
            <Text style={styles.exitTitle}>PK Invite</Text>
            <Text style={styles.exitSub}>{pkInvite?.fromName || "A host"} wants a {Math.round((Number(pkInvite?.duration) || PK_DURATION_SEC) / 60)} min PK battle with you.</Text>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.noBtn} onPress={declinePkInvite}>
                <Text style={styles.btnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.acceptBtn, pkBusy && { opacity: 0.5 }]} disabled={pkBusy} onPress={acceptPkInvite}>
                <Text style={styles.btnText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Official / Admin: live ke andar hi search + ID/device ban + live band */}
      <OfficialLiveTools roomId={roomId} hostId={hostId} />

    </View>
  );
}

// PERF: live chat ki har row me animated frame (40-80 rows) bahut load deta tha.
// false = chat me frame static (smooth). Seat/profile/host ke frames animated hi rehte hain.
const CHAT_FRAME_ANIM = false;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  loadingBg: { justifyContent: "center", alignItems: "center", backgroundColor: "#1B1545" },
  loadingText: { color: "#AAB6D4", marginTop: 10, fontSize: 12, fontWeight: "600" },

  pausedOverlay: {
    backgroundColor: "rgba(10,11,20,0.94)",
    justifyContent: "center",
    alignItems: "center",
  },
  pausedAvatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: "#fff" },
  pausedText: { color: "#fff", marginTop: 10, fontSize: 13, fontWeight: "700" },

  topScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  bottomScrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 240,
  },

  /* HEADER */
  topHeader: {
    position: "absolute",
    top: 38,
    left: 12,
    right: 12,
  },
  hostBadge: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  hostAvatarContainer: { position: "relative", justifyContent: "center", alignItems: "center" },
  hostAvatarImg: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: "#fff" },
  hostLevelFrame: { position: "absolute", width: 52, height: 52, resizeMode: "contain" },

  nameRow: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  hostNameText: { color: "#fff", fontSize: 13, fontWeight: "800", maxWidth: 96 },
  verifiedBadge: { marginLeft: 5, justifyContent: "center", alignItems: "center" },
  levelBadge: {
    marginLeft: 6,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  levelText: { fontSize: 9, fontWeight: "bold", marginLeft: 2 },

  viewRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  viewsText: { color: "#fff", fontSize: 11, fontWeight: "600", marginLeft: 4, marginRight: 8 },
  starsText: { color: "#FFE600", fontSize: 11, fontWeight: "700" },
  liveTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E63946",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff", marginRight: 4 },
  liveTagText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  viewerCount: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  viewerCountText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  viewerStack: {
    flexDirection: "row",
    alignItems: "center",
    height: 34,
    minWidth: 34,
    paddingHorizontal: 5,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  viewerStackAva: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: "#fff", backgroundColor: "#2a2b38" },
  viewerStackCount: { color: "#fff", fontWeight: "bold", fontSize: 12, marginLeft: 6, marginRight: 3 },
  modBar: { flexDirection: "row", marginTop: 4, marginBottom: 6 },
  modBarBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
  },
  modBarTxt: { color: "#fff", fontSize: 12, fontWeight: "700", marginLeft: 6 },
  kickBtn: { backgroundColor: "#DC2626", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  kickBtnTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },

  /* CHAT */
  chatArea: {
    position: "absolute",
    left: 0,
    right: Math.round(width * 0.2),
    maxHeight: height * 0.35,
    paddingHorizontal: 10,
  },
  chatRow: { flexDirection: "row", marginBottom: 10, alignItems: "flex-start" },
  chatAva: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#2a2b38" },
  chatFrame: { position: "absolute", width: 42, height: 42, resizeMode: "contain" },
  chatContent: { flex: 1, marginLeft: 8 },
  chatUser: { color: "#fff", fontWeight: "bold", fontSize: 11 },
  bubble: {
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: 8,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginTop: 3,
  },
  chatMsg: { color: "#fff", fontSize: 12 },

  sysRow: { flexDirection: "row", alignItems: "center", paddingVertical: 5, marginBottom: 4 },
  sysAva: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#2a2b38" },
  sysFrame: { position: "absolute", width: 30, height: 30, top: -4, left: -4 },
  sysText: { color: "#e0e0e0", fontSize: 13, fontWeight: "600" },

  /* RIGHT TOOLS */
  toolCol: { position: "absolute", right: 10, alignItems: "center" },
  toolWrap: { alignItems: "center", marginBottom: 10 },
  toolBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  toolBtnActive: { backgroundColor: "#F71084", borderColor: "#fff" },
  toolLabel: { color: "#fff", fontSize: 9, fontWeight: "700", marginTop: 3, maxWidth: 56, textAlign: "center" },
  toolBadge: {
    position: "absolute",
    top: 0,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF3D3D",
  },
  pkBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 13, fontStyle: "italic" },

  /* BOTTOM BAR */
  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  inputBox: {
    flex: 1,
    height: 42,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 21,
    justifyContent: "center",
    paddingHorizontal: 16,
    marginRight: 10,
  },
  inputStyle: { color: "#fff", fontSize: 14 },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  giftCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },

  /* GIFT BANNER */
  comboPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 6,
    borderRadius: 30,
    backgroundColor: "rgba(34,24,78,0.78)",
    borderWidth: 1.5,
    borderColor: "rgba(255,200,60,0.7)",
    maxWidth: width * 0.62,
  },
  comboX: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "900",
    fontStyle: "italic",
    marginLeft: 4,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },

  /* ---- Tiki-style PK ---- */
  pkResultWrapNew: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  pkCrown: { fontSize: 44 },
  pkBigResult: {
    fontSize: 40,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: 2,
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  pkBigWin: { color: "#FFE27A", textShadowColor: "rgba(160,70,0,0.95)" },
  pkBigLose: { color: "#C9D3E8", textShadowColor: "rgba(0,0,0,0.9)" },
  pkBigDraw: { color: "#fff", textShadowColor: "rgba(0,0,0,0.9)" },
  pkVsStage: { position: "absolute", left: width / 2 - 70, top: pkPanelHFixed * 0.5 - 40, width: 140, height: 80, justifyContent: "center", alignItems: "center" },
  pkVsBolt: { position: "absolute", transform: [{ rotate: "12deg" }], opacity: 0.9 },
  pkGlove: { position: "absolute", top: 12 },
  pkVsPlate: {
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.95)",
    transform: [{ skewX: "-10deg" }],
  },
  pkVsPlateTxt: { fontSize: 20, fontWeight: "900", fontStyle: "italic" },
  pkStarDot: { width: 7, height: 7, borderRadius: 2, borderWidth: 1.5, borderColor: "#1E7BFF" },
  pkSeatRow: { position: "absolute", left: 0, right: 0, bottom: 8, flexDirection: "row", justifyContent: "center", alignItems: "center" },
  pkSeatWrap: { width: 32, height: 32, marginHorizontal: 4, alignItems: "center", justifyContent: "center" },
  pkSeat: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(20,16,40,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  pkSeatEmpty: { borderWidth: 1.5, borderColor: "rgba(214,170,90,0.75)", backgroundColor: "rgba(30,22,40,0.7)" },
  pkSeatCrown: { position: "absolute", top: -11, left: -3, fontSize: 13, transform: [{ rotate: "-18deg" }] },
  pkSeatNum: {
    position: "absolute",
    bottom: -5,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 3,
    justifyContent: "center",
    alignItems: "center",
  },
  pkSeatNumTxt: { color: "#fff", fontSize: 8, fontWeight: "900" },
  pkCenterTrophy: { position: "absolute", left: width / 2 - 58, top: pkPanelHFixed * 0.5 - 78, width: 116, alignItems: "center" },
  pkPanelTrophy: { position: "absolute", bottom: 44, left: 0, right: 0, alignItems: "center" },
  pkTicker: {
    position: "absolute",
    height: 26,
    borderRadius: 13,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.13)",
  },
  pkTickerTxt: { position: "absolute", left: 0, top: 5, color: "rgba(255,255,255,0.92)", fontSize: 12, fontWeight: "500" },
  pkOppPill: {
    position: "absolute",
    top: 6,
    right: 6,
    maxWidth: "86%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 13,
    paddingLeft: 9,
    paddingRight: 3,
    height: 24,
  },
  pkFriendTag: { flexDirection: "row", alignItems: "center", backgroundColor: "#22C55E", borderRadius: 9, paddingHorizontal: 6, height: 18, marginRight: 1 },
  pkFollowingTag: { backgroundColor: "rgba(255,255,255,0.28)" },
  pkFriendTxt: { color: "#fff", fontSize: 9, fontWeight: "800", marginLeft: 3 },
  pkSideGlow: { position: "absolute", top: 0, borderWidth: 2.5 },
  pkSideHint: { position: "absolute", bottom: 8, alignItems: "center" },
  pkSideHintTxt: { color: "#fff", fontSize: 10, fontWeight: "700", backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: "hidden" },
  giftToRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingVertical: 4, marginBottom: 6 },
  giftToLbl: { color: "#aaa", fontSize: 12, fontWeight: "700", marginRight: 8 },
  giftToAva: { width: 34, height: 34, borderRadius: 17, borderWidth: 2.5 },
  giftToName: { color: "#fff", fontSize: 13, fontWeight: "700", marginLeft: 8, flexShrink: 1 },
  giftSideHint: { marginLeft: "auto", flex: 1, textAlign: "right", color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "600", paddingLeft: 10 },
  giftSwitchBtn: { marginLeft: "auto", flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  giftSwitchTxt: { color: "#fff", fontSize: 11, fontWeight: "700", marginLeft: 4 },
  pkOppName: { color: "#fff", fontSize: 11, fontWeight: "700", flexShrink: 1, paddingRight: 4 },
  pkOppPlus: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#FFE600", justifyContent: "center", alignItems: "center" },
  pkLogoBtnTxt: { fontSize: 26, fontWeight: "900", fontStyle: "italic", letterSpacing: 1 },
  pkEndBtn: { backgroundColor: "#DC2626", borderWidth: 1.5, borderColor: "#fff" },

  /* PK STAGE */
  pkBarWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    height: PK_BAR_H,
    justifyContent: "center",
  },
  pkBar: { flexDirection: "row", height: PK_BAR_H, overflow: "hidden", backgroundColor: "#FF2D75" },
  pkScoreWrap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  pkStarBox: {
    width: 15,
    height: 15,
    borderRadius: 4,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  pkSparkGlow: {
    width: 5,
    height: PK_BAR_H + 2,
    borderRadius: 3,
    backgroundColor: "#fff",
    shadowColor: "#fff",
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 6,
  },
  pkScoreTxt: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    marginHorizontal: 4,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  pkVsWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  pkVs: {
    color: "#fff",
    fontWeight: "900",
    fontStyle: "italic",
    fontSize: 15,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  pkPanels: { position: "absolute", left: 0, right: 0, flexDirection: "row" },
  pkWaiting: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#1B1545", overflow: "hidden" },
  pkWaitAvatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: "#fff" },
  pkNamePill: {
    position: "absolute",
    left: 6,
    top: 8,
    maxWidth: "56%",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pkNameTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
  pkTimerPill: {
    position: "absolute",
    top: 8,
    left: width / 2 - 36,
    width: 72,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15,12,40,0.62)",
    borderRadius: 12,
    paddingVertical: 3,
  },
  pkFinalWrap: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center", zIndex: 30, elevation: 30 },
  pkFinalNum: {
    color: "#fff",
    fontSize: 110,
    fontWeight: "900",
    fontStyle: "italic",
    textShadowColor: "rgba(247,16,132,0.9)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 12,
  },
  pkTimerPk: { fontWeight: "900", fontStyle: "italic", fontSize: 12, marginRight: 5 },
  pkTimerTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  pkResultWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  pkResultTxt: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
    fontStyle: "italic",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 4,
  },
  pkBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F71084",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  pkBadgeTxt: { color: "#fff", fontWeight: "900", fontSize: 24, fontStyle: "italic" },
  pkWinnerPanel: { borderWidth: 3, borderColor: "#FFD700" },
  pkWaitPill: {
    position: "absolute",
    top: 126,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryBtn: { marginTop: 14, backgroundColor: "#F71084", paddingVertical: 9, paddingHorizontal: 26, borderRadius: 18 },
  retryBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  statusPill: {
    position: "absolute",
    top: 126,
    alignSelf: "center",
    maxWidth: width * 0.9,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  statusPillTxt: { color: "#fff", fontSize: 12, fontWeight: "600", marginHorizontal: 8, flexShrink: 1 },
  pkWaitPillTxt: { color: "#fff", fontSize: 12, fontWeight: "600", marginHorizontal: 8 },
  pkWaitCancel: { color: "#FF6B81", fontSize: 12, fontWeight: "800" },

  /* EXIT / INVITE MODAL */
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center" },
  exitBox: { width: "80%", backgroundColor: "#1C1E2E", padding: 25, borderRadius: 20, alignItems: "center" },
  exitTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  exitSub: { color: "#9aa0b4", textAlign: "center", marginTop: 10, fontSize: 12 },
  btnRow: { flexDirection: "row", marginTop: 22 },
  noBtn: { backgroundColor: "#34495e", paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10, marginRight: 15 },
  yesBtn: { backgroundColor: "#e74c3c", paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10 },
  acceptBtn: { backgroundColor: "#22C55E", paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10 },
  btnText: { color: "#fff", fontWeight: "bold" },
  inviteAva: { width: 70, height: 70, borderRadius: 35, borderWidth: 2, borderColor: "#fff", marginBottom: 12 },

  /* GIFT MODAL */
  giftOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(5,0,15,0.55)" },
  giftSheet: {
    backgroundColor: "#12071f",
    overflow: "hidden",
    borderTopWidth: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(245,196,81,0.35)",
    maxHeight: height * 0.52,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 16,
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  giftGoldLine: {
    position: "absolute",
    top: 0,
    left: "25%",
    right: "25%",
    height: 2,
    borderRadius: 2,
    backgroundColor: "rgba(245,196,81,0.9)",
  },
  giftTitle: { color: "#FFE9A8", fontSize: 17, fontWeight: "bold", marginBottom: 0 },
  giftCard: {
    width: "22.5%",
    marginRight: "2%",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(245,196,81,0.28)",
    borderRadius: 12,
    padding: 5,
    marginBottom: 10,
    alignItems: "center",
  },
  giftName: { color: "#fff", fontSize: 10, marginTop: 0 },
  giftCoin: { color: "#F5C451", fontWeight: "700", fontSize: 12, marginTop: 2 },

  /* BOTTOM SHEETS (filter / PK list) */
  sheetOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: "#111827",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 34,
  },
  sheetTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  sheetSub: { color: "#9aa0b4", fontSize: 12, marginTop: 4, marginBottom: 12 },
  emptyTxt: { color: "#9aa0b4", textAlign: "center", marginTop: 40, fontSize: 13 },

  filterItem: { alignItems: "center", marginRight: 16, marginTop: 14 },
  filterCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1C1E2E",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  filterCircleActive: { borderColor: "#F71084" },
  filterLabel: { color: "#fff", fontSize: 11, marginTop: 6, fontWeight: "600" },

  pkRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  pkRowAva: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#2a2b38" },
  pkRowName: { color: "#fff", fontSize: 14, fontWeight: "700" },
  pkRowSub: { color: "#9aa0b4", fontSize: 11, marginTop: 2 },
  pkInviteBtn: { backgroundColor: "#F71084", paddingVertical: 8, paddingHorizontal: 18, borderRadius: 16 },
  pkInviteTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },

  /* ===== PK PRO ===== */
  pkSpark: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 24,
    marginLeft: -12,
    justifyContent: "center",
    alignItems: "center",
  },
  pkVsBadge: {
    position: "absolute",
    left: width / 2 - 17,
    top: "50%",
    marginTop: -17,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F71084",
    borderWidth: 2,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  pkVsBadgeTxt: { color: "#fff", fontWeight: "900", fontStyle: "italic", fontSize: 12 },
  pkMuteBtn: {
    position: "absolute",
    top: 34,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  pkWaitTxt: { color: "#E6E0FF", fontSize: 10, marginTop: 6, fontWeight: "600" },
  pkDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,8,30,0.2)" },
  pkResultBadge: {
    position: "absolute",
    top: 34,
    left: 6,
    backgroundColor: "rgba(80,80,90,0.9)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pkResultBadgeTxt: { color: "#fff", fontSize: 11, fontWeight: "900" },

  /* ===== PREMIUM ADDITIONS ===== */
  followPill: {
    marginLeft: 8,
    backgroundColor: "#F71084",
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  followPillOn: { backgroundColor: "rgba(255,255,255,0.25)" },
  followTxt: { color: "#fff", fontSize: 10, fontWeight: "800" },

  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 34,
    minWidth: 34,
    paddingHorizontal: 4,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
  },
  rankAva: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, backgroundColor: "#2a2b38" },

  infoWrap: { position: "absolute", top: 126, left: 12, right: 72 },
  titlePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
    maxWidth: "100%",
  },
  titleTxt: { color: "#fff", fontSize: 12, fontWeight: "700" },
  pinPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(255,193,7,0.22)",
    borderColor: "rgba(255,193,7,0.7)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 6,
    maxWidth: "100%",
  },
  pinTxt: { color: "#FFE9A6", fontSize: 12, fontWeight: "600", marginLeft: 6, flexShrink: 1 },
  netPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(220,38,38,0.85)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  netTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },

  heartsLayer: { position: "absolute", right: 0, width: 90, height: 280 },

  welcomeBox: {
    backgroundColor: "rgba(24,18,58,0.6)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    alignSelf: "flex-start",
    maxWidth: "92%",
  },
  welcomeTxt: { color: "#fff", fontSize: 13, fontWeight: "500" },

  roleTag: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 5 },
  roleTagTxt: { color: "#fff", fontSize: 8, fontWeight: "800" },

  emojiStrip: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    backgroundColor: "rgba(17,24,39,0.92)",
    borderRadius: 22,
    paddingVertical: 6,
    zIndex: 50,
    elevation: 50,
  },

  rechargeBtn: {
    marginLeft: 10,
    backgroundColor: "#22C55E",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rechargeTxt: { color: "#fff", fontSize: 11, fontWeight: "800" },
  qtyRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, paddingHorizontal: 6 },
  qtyLbl: { color: "#9aa0b4", fontSize: 12, marginRight: 10, fontWeight: "600" },
  qtyChip: {
    borderWidth: 1,
    borderColor: "#4b5563",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginRight: 8,
  },
  qtyChipOn: { backgroundColor: "#F71084", borderColor: "#F71084" },
  qtyChipTxt: { color: "#cbd5e1", fontSize: 12, fontWeight: "700" },

  rankNum: { color: "#9aa0b4", width: 26, fontSize: 16, fontWeight: "800", textAlign: "center" },
  rankStars: { color: "#FFE600", fontWeight: "800", fontSize: 13 },

  pcOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  pcSheet: { backgroundColor: "#141414", borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 16, paddingTop: 22, alignItems: "center" },
  pcAvaWrap: { width: 96, height: 96, justifyContent: "center", alignItems: "center" },
  pcStats: { flexDirection: "row", width: "100%", marginTop: 16 },
  pcStat: { flex: 1, alignItems: "center" },
  pcStatN: { color: "#fff", fontSize: 20, fontWeight: "800" },
  pcStatL: { color: "#cfcfcf", fontSize: 15, marginTop: 4 },
  pcCards: { flexDirection: "row", width: "100%", marginTop: 18 },
  pcCard: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#2b2b2b", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, minHeight: 56 },
  pcLvPill: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  pcLvTxt: { fontSize: 14, fontWeight: "800", marginLeft: 3 },
  pcLvMore: { color: "#fff", fontSize: 16, marginLeft: "auto" },
  pcFamLogo: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#222" },
  pcFamName: { color: "#fff", fontSize: 15, fontWeight: "800" },
  pcFamSub: { color: "#ddd", fontSize: 12, fontWeight: "700" },
  pcMainBtns: { flexDirection: "row", width: "100%", marginTop: 14 },
  pcProfileBtn: { flex: 1, backgroundColor: "#2b2b2b", borderRadius: 10, paddingVertical: 16, alignItems: "center" },
  pcProfileTxt: { color: "#fff", fontSize: 18, fontWeight: "800" },
  pcFollowBtn: { flex: 2, marginLeft: 10, backgroundColor: "#FFE62B", borderRadius: 10, paddingVertical: 16, alignItems: "center" },
  pcFollowTxt: { color: "#000", fontSize: 18, fontWeight: "800" },
  pcChips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", width: "100%", marginTop: 12 },
  pcChip: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, margin: 4 },
  pcChipTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  pcBox: {
    width: "82%",
    backgroundColor: "#1C1E2E",
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
  },
  pcAva: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: "#fff", backgroundColor: "#2a2b38" },
  pcName: { color: "#fff", fontSize: 18, fontWeight: "800", maxWidth: 200 },
  pcBtns: { width: "100%", marginTop: 16 },
  pcBtn: { borderRadius: 14, paddingVertical: 11, alignItems: "center", marginBottom: 8 },
  pcBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },

  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#374151",
  },
  reasonTxt: { color: "#fff", fontSize: 14, fontWeight: "600" },

  fieldLbl: { color: "#9aa0b4", fontSize: 12, marginTop: 14, marginBottom: 6, fontWeight: "600" },
  fieldLblDark: { color: "#fff", fontSize: 14, fontWeight: "700" },
  fieldInput: {
    backgroundColor: "#1C1E2E",
    color: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  switchRow: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  saveBtn: { backgroundColor: "#F71084", borderRadius: 16, paddingVertical: 13, alignItems: "center", marginTop: 20 },
  saveBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },

  summaryBg: { flex: 1, backgroundColor: "#0A0B14", alignItems: "center", paddingTop: 80 },
  sumTitle: { color: "#fff", fontSize: 26, fontWeight: "800" },
  sumSub: { color: "#9aa0b4", fontSize: 13, marginTop: 6, textAlign: "center" },
  sumGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginTop: 24, width: "92%" },
  sumCard: {
    width: "29%",
    backgroundColor: "#1C1E2E",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    margin: "1.8%",
  },
  sumVal: { color: "#fff", fontSize: 16, fontWeight: "800", marginTop: 6 },
  sumKey: { color: "#9aa0b4", fontSize: 10, marginTop: 3, fontWeight: "600" },
  sumGifter: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1C1E2E",
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
  },
  sumGifterName: { color: "#fff", flex: 1, marginLeft: 10, fontWeight: "700", fontSize: 13 },
  sumDone: {
    backgroundColor: "#F71084",
    borderRadius: 24,
    paddingVertical: 13,
    paddingHorizontal: 60,
    marginTop: 28,
  },
  /* ===== TIKI-STYLE LAYOUT ===== */
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hostPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(14,12,40,0.5)",
    borderRadius: 22,
    paddingLeft: 5,
    paddingRight: 8,
    paddingVertical: 4,
    maxWidth: width * 0.56,
    flexShrink: 1,
  },
  followPlus: {
    marginLeft: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F71084",
    justifyContent: "center",
    alignItems: "center",
  },
  rightGroup: { flexDirection: "row", alignItems: "center" },
  closeBtn: { width: 34, height: 34, justifyContent: "center", alignItems: "center", marginLeft: 2 },
  weeklyRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  weeklyTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(80,40,110,0.55)",
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  weeklyTxt: { color: "#fff", fontSize: 11, fontWeight: "700", marginLeft: 5 },
  minPill: {
    marginLeft: 8,
    minWidth: 96,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(80,40,110,0.55)",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  minFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(255,200,0,0.55)" },
  minTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },

  circleBtnOn: { backgroundColor: "#16A34A" },
  guestBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: "#FF3D3D",
    justifyContent: "center",
    alignItems: "center",
  },
  guestBadgeTxt: { color: "#fff", fontSize: 10, fontWeight: "800" },

  // guest tiles (right side, like a real live room)
  guestColumn: {
    position: "absolute",
    right: 6,
    top: 150,
    width: GUEST_TILE_W,
    zIndex: 20,
    elevation: 20,
  },
  guestTile: {
    width: GUEST_TILE_W,
    height: GUEST_TILE_H,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "rgba(20,16,32,0.72)",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  guestAvaWrap: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  guestAvaRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    borderColor: "#FFE600",
    padding: 2,
  },
  guestAva: { width: "100%", height: "100%", borderRadius: 24, backgroundColor: "#2a2b38" },
  guestMicOff: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(220,38,38,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  guestNameRow: {
    position: "absolute",
    left: 5,
    right: 5,
    bottom: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  guestNameTxt: {
    flexShrink: 1,
    color: "#fff",
    fontSize: 10.5,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  guestPlus: {
    marginLeft: 4,
    minWidth: 22,
    height: 17,
    borderRadius: 9,
    backgroundColor: "#FFE600",
    justifyContent: "center",
    alignItems: "center",
  },

  // host sheet
  guestSecTitle: { color: "#fff", fontSize: 14, fontWeight: "800", marginBottom: 8 },
  guestEmpty: { color: "#9aa0b4", fontSize: 12, paddingVertical: 8 },
  guestRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  guestRowAva: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#2a2b38" },
  guestRowName: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "700", marginLeft: 10, marginRight: 8 },
  guestBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  guestAccept: {
    marginLeft: 8,
    backgroundColor: "#FFE600",
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  guestAcceptTxt: { color: "#111", fontWeight: "800", fontSize: 13 },

  chatPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 8,
    backgroundColor: "transparent",
  },
  chatPillTxt: { color: "#fff", fontSize: 15, fontWeight: "600", marginLeft: 7 },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#F71084",
    justifyContent: "center",
    alignItems: "center",
  },
  pkBadgeBtn: {
    minWidth: 44,
    height: 38,
    borderRadius: 10,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  pkBadgeBtnTxt: { color: "#fff", fontWeight: "900", fontStyle: "italic", fontSize: 14 },
  pkBadgeDot: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF3D3D",
  },
  matchMiniPill: {
    backgroundColor: "rgba(40,30,60,0.8)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
  },
  matchMiniTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
  matchMiniTime: { color: "#cbd5e1", fontSize: 10 },

  toastWrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 60, elevation: 60 },
  toastPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30,28,36,0.95)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    maxWidth: width * 0.92,
  },
  toastIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "#FFD600",
    justifyContent: "center",
    alignItems: "center",
  },
  toastTxt: { color: "#fff", fontSize: 13, marginLeft: 10, flexShrink: 1 },

  menuGrid: { flexDirection: "row", flexWrap: "wrap", paddingBottom: 6 },
  menuItem: { width: "25%", alignItems: "center", marginBottom: 18 },
  menuIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#1C1E2E",
    justifyContent: "center",
    alignItems: "center",
  },
  menuIconOn: { backgroundColor: "#F71084" },
  menuLbl: { color: "#fff", fontSize: 11, fontWeight: "600", marginTop: 6, maxWidth: 70, textAlign: "center" },

  pkSheetOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "transparent" },
  pkSheet: {
    height: height * 0.74,
    backgroundColor: "#17171C",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 14,
    paddingHorizontal: 14,
  },
  pkSheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  pkHeadIcon: { width: 34, height: 34, justifyContent: "center", alignItems: "center" },
  pkLogo: { fontSize: 30, fontWeight: "900", fontStyle: "italic", letterSpacing: 1 },
  pkCardsRow: { flexDirection: "row", marginBottom: 20 },
  pkCard: { flex: 1, height: 78, borderRadius: 10, flexDirection: "row", alignItems: "center", paddingHorizontal: 10 },
  pkCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  pkCardTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  pkCardSub: { color: "rgba(255,255,255,0.85)", fontSize: 10, marginTop: 2 },
  pkSectionTitle: { color: "#fff", fontSize: 15, fontWeight: "800", marginTop: 6, marginBottom: 8 },
  pkListRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9 },
  pkListAva: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#2a2b38" },
  pkListName: { color: "#fff", fontSize: 14, fontWeight: "700" },
  pkListStat: { color: "#9aa0b4", fontSize: 11, marginLeft: 4 },
  inviteYellow: {
    backgroundColor: "#FFE600",
    borderRadius: 6,
    width: 70,
    paddingVertical: 8,
    alignItems: "center",
  },
  inviteYellowTxt: { color: "#111", fontWeight: "800", fontSize: 13 },
  inviteGrey: { backgroundColor: "#2a2b38" },
  pkLiveDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#22C55E",
    borderWidth: 2,
    borderColor: "#17171C",
  },
  pkEmptySmall: { color: "#9aa0b4", fontSize: 12, paddingVertical: 8 },

  matchOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "transparent" },
  matchSheet: {
    backgroundColor: "#17171C",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 30,
  },
  matchChevron: { alignSelf: "flex-end", padding: 4 },
  matchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 10 },
  matchAvaRing: { width: 74, height: 74, borderRadius: 37, borderWidth: 3, padding: 3 },
  matchAva: { width: "100%", height: "100%", borderRadius: 34, backgroundColor: "#2a2b38" },
  matchUnknown: { justifyContent: "center", alignItems: "center", backgroundColor: "#4a1d33" },
  matchQ: { position: "absolute", color: "#FF8FBF", fontSize: 18, fontWeight: "900" },
  matchTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  matchTime: { color: "#9aa0b4", fontSize: 12, marginTop: 4 },
  matchCancel: { backgroundColor: "#4A4A52", borderRadius: 8, paddingVertical: 12, alignItems: "center", marginTop: 14 },
  matchCancelTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },

  endBg: { flex: 1, backgroundColor: "#2A0E3D" },
  endHeader: {
    marginTop: 44,
    height: 46,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  endHeaderTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
  endCard: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  endCardTitle: { color: "#D9C9E6", fontSize: 13, fontWeight: "600", marginBottom: 14 },
  endGrid: { flexDirection: "row", flexWrap: "wrap" },
  endCell: { width: "50%", alignItems: "center", marginBottom: 16 },
  endVal: { color: "#fff", fontSize: 18, fontWeight: "800" },
  endLbl: { color: "#BBA8CC", fontSize: 11, marginTop: 4 },
  endPct: { position: "absolute", color: "#fff", fontSize: 15, fontWeight: "800" },
  endProgTitle: { color: "#fff", fontSize: 13, fontWeight: "700" },
  endProgSub: { color: "#FFE600", fontSize: 12, marginTop: 6 },
  endCentre: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFE600",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  endCentreIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  endCentreTitle: { color: "#111", fontSize: 14, fontWeight: "800" },
  endCentreSub: { color: "#333", fontSize: 11, marginTop: 2 },

  startPkBtn: {
    position: "absolute",
    width: 226,
    height: 58,
    borderRadius: 12,
    backgroundColor: "#FFD91A",
    borderWidth: 2,
    borderColor: "#E8B800",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 60,
    elevation: 60,
  },
  startPkTxt: { color: "#1A1A1A", fontSize: 22, fontWeight: "800" },

  /* ===== TIKI CHAT PILLS ===== */
  tkRow: { marginBottom: 6, alignItems: "flex-start" },
  tkPill: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    backgroundColor: "rgba(24,18,58,0.6)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tkTxt: { color: "#fff", fontSize: 14 },
  tkName: { color: "#D9D2F5", fontSize: 14, fontWeight: "600" },
  tkGiftName: { color: "#FFE600", fontSize: 14, fontWeight: "700" },

  /* ===== TIKI TOP-3 CHIPS (header) ===== */
  topStack: { flexDirection: "row", alignItems: "center" },
  topChip: { width: 27, height: 40, marginRight: 2, alignItems: "center" },
  topChipAva: { width: 25, height: 25, borderRadius: 13, borderWidth: 2, backgroundColor: "#2a2b38", marginTop: 4 },
  topChipCrown: { position: "absolute", top: -4, left: -3, fontSize: 13, transform: [{ rotate: "-20deg" }] },
  topChipTag: { position: "absolute", bottom: 0, paddingHorizontal: 4, height: 11, borderRadius: 6, justifyContent: "center" },
  topChipTagTxt: { color: "#fff", fontSize: 7, fontWeight: "900", fontStyle: "italic" },
  viewerCountCircle: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 5,
    backgroundColor: "rgba(14,12,40,0.55)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 2,
  },
});
