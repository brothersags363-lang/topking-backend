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

import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import LottieView from "lottie-react-native";
import { WebView } from "react-native-webview";
import { gifts } from "../assets/giftsData";
import { giftHtml } from "../assets/giftWeb";
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
const PK_DURATION_SEC = 180; // 3 minutes
const PK_RESULT_SHOW_MS = 9000; // winner banner stays this long, then PK is cleared
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
  frameRate: 15,
  bitrate: 800,
  minBitrate: 250,
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
const PK_DURATIONS = [180, 300, 600];

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

// Weekly-host goal shown in the header pill + live-ended screen
const WEEKLY_TARGET_MIN = 30;
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

// Where the "Recharge / Buy stars" button sends the user. Change to your real route.
const RECHARGE_ROUTE = "/recharge";

// Gift quantity choices in the gift sheet
const GIFT_QTY = [1, 10, 66, 99];

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

const GiftCard = memo(({ item, qty, onSend }: any) => (
  <TouchableOpacity style={styles.giftCard} activeOpacity={0.7} onPress={() => onSend(item)}>
    <Image source={item.icon} style={{ width: 42, height: 42 }} resizeMode="contain" fadeDuration={0} />
    <Text style={styles.giftName} numberOfLines={1}>{item.name}</Text>
    <Text style={styles.giftCoin}>{Number(item.price || 0) * qty}</Text>
  </TouchableOpacity>
));

const GiftPage = memo(({ page, qty, onSend }: any) => (
  <View style={{ width: GIFT_PAGE_W, flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start" }}>
    {page.items.map((item: any) => (
      <GiftCard key={item.id} item={item} qty={qty} onSend={onSend} />
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

const REPORT_REASONS = ["Nudity / sexual content", "Abuse / harassment", "Spam / scam", "Underage user", "Other"];

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

// Full-screen gift animation (Lottie or WebView) — same as LiveRoom.js.
// `playKey` changes on every new gift so the same gift twice restarts.
const GiftOverlay = memo(({ activeGift, playKey, onFinish }: any) => {
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
          onAnimationFinish={(cancelled: boolean) => {
            if (!cancelled) onFinish && onFinish();
          }}
          style={{ width: 350, height: 350, backgroundColor: "transparent" }}
        />
      )}
    </View>
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

// One chat row: join / gift / normal message (same three types as LiveRoom.js).
const ChatItem = memo(({ chat, onUser }: any) => {
  const theme = getLevelTheme(chat.level || 1);
  const openUser = () =>
    onUser &&
    chat.senderId &&
    onUser({
      uid: chat.senderId,
      name: chat.senderName,
      username: chat.username,
      img: chat.userImg,
      level: chat.level,
      verified: chat.verified,
      verifiedColor: chat.verifiedColor,
    });

  if (chat.type === "join") {
    return (
      <View style={styles.sysRow}>
        <TouchableOpacity activeOpacity={0.8} onPress={openUser}>
          <Image source={{ uri: chat.userImg || STABLE_AVATAR }} style={styles.sysAva} />
          {(chat.level >= 10 || chat.special || !!chat.senderId) && (
            <LevelFrame level={chat.level} special={chat.special} uid={chat.senderId} animated={false} style={styles.sysFrame} />
          )}
        </TouchableOpacity>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginLeft: 6 }}>
          <Text style={styles.sysText}>{chat.senderName}</Text>
          {chat.verified && (
            <MaterialCommunityIcons
              name="check-decagram"
              size={15}
              color={chat?.verifiedColor === "yellow" ? "#FFD700" : "#ffffff"}
            />
          )}
          <View style={[styles.levelBadge, { marginLeft: 5, backgroundColor: theme.bg, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="diamond-stone" size={8} color={theme.icon} />
            <Text style={[styles.levelText, { color: theme.text, fontSize: 8 }]}>LV {chat.level || 1}</Text>
          </View>
          <Text style={[styles.sysText, { marginLeft: 5 }]}>joined</Text>
        </View>
      </View>
    );
  }

  if (chat.type === "gift") {
    const gd = gifts.find((g: any) => String(g.id) === String(chat.giftId));
    return (
      <View style={[styles.sysRow, { flexWrap: "wrap" }]}>
        <TouchableOpacity activeOpacity={0.8} onPress={openUser}>
          <Image source={{ uri: chat.userImg || STABLE_AVATAR }} style={styles.sysAva} />
        </TouchableOpacity>
        <Text style={[styles.sysText, { marginLeft: 6 }]}>{chat.senderName}</Text>
        {chat.verified && (
          <MaterialCommunityIcons
            name="check-decagram"
            size={15}
            color={chat?.verifiedColor === "yellow" ? "#FFD700" : "#ffffff"}
          />
        )}
        <Text style={[styles.sysText, { marginLeft: 5 }]}>sent</Text>
        {gd?.icon ? (
          <Image source={gd.icon} style={{ width: 24, height: 24, resizeMode: "contain", marginHorizontal: 4 }} />
        ) : (
          <Text style={{ color: "#00FFFF", fontWeight: "bold", marginHorizontal: 4 }}>{chat.giftName}</Text>
        )}
        {chat.qty > 1 && (
          <Text style={{ color: "#FFE600", fontWeight: "bold", marginRight: 4 }}>x{chat.qty}</Text>
        )}
        <Text style={styles.sysText}>to </Text>
        <Text style={{ color: "#FFE600", fontSize: 13, fontWeight: "bold" }}>@{chat.receiverName}</Text>
      </View>
    );
  }

  return (
    <View style={styles.chatRow}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={openUser}
        style={{ width: 38, height: 38, justifyContent: "center", alignItems: "center" }}
      >
        <Image source={{ uri: chat.userImg || STABLE_AVATAR }} style={styles.chatAva} />
        {(chat.level >= 10 || chat.special || !!chat.senderId) && (
          <LevelFrame level={chat.level} special={chat.special} uid={chat.senderId} animated={false} style={styles.chatFrame} />
        )}
      </TouchableOpacity>
      <View style={styles.chatContent}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
          <Text style={styles.chatUser}>{chat.senderName}</Text>
          {chat.verified && (
            <MaterialCommunityIcons
              name="check-decagram"
              size={14}
              style={{ marginLeft: 4 }}
              color={chat?.verifiedColor === "yellow" ? "#FFD700" : "#ffffff"}
            />
          )}
          <View style={[styles.levelBadge, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="diamond-stone" size={9} color={theme.icon} />
            <Text style={[styles.levelText, { color: theme.text, fontSize: 8 }]}>LV {chat.level || 1}</Text>
            {chat.role === "host" && (
              <View style={[styles.roleTag, { backgroundColor: "#F71084" }]}>
                <Text style={styles.roleTagTxt}>HOST</Text>
              </View>
            )}
            {chat.role === "mod" && (
              <View style={[styles.roleTag, { backgroundColor: "#2D9CFF" }]}>
                <Text style={styles.roleTagTxt}>MOD</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.bubble}>
          <Text style={styles.chatMsg}>{chat.message}</Text>
        </View>
      </View>
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

// ---------- PK winner banner ----------
// Shown after a PK ends: the host who received the most gifts (highest score).
// Native-driver animations only (scale / opacity / translate) → stays smooth.
const PkWinnerBanner = memo(({ result, winner, score }: any) => {
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const crownY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(crownY, { toValue: -6, duration: 500, useNativeDriver: true }),
        Animated.timing(crownY, { toValue: 0, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const isDraw = result === "draw";

  return (
    <View pointerEvents="none" style={styles.pkWinnerWrap}>
      <Animated.View style={[styles.pkWinnerCard, { opacity, transform: [{ scale }] }]}>
        {isDraw ? (
          <>
            <Text style={styles.pkWinnerDraw}>🤝 DRAW</Text>
            <Text style={styles.pkWinnerSub}>Both hosts got {score} stars</Text>
          </>
        ) : (
          <>
            <Animated.Text style={[styles.pkWinnerCrown, { transform: [{ translateY: crownY }] }]}>👑</Animated.Text>
            <Image source={{ uri: winner?.img || STABLE_AVATAR }} style={styles.pkWinnerAva} />
            <Text style={styles.pkWinnerTitle}>WINNER</Text>
            <Text numberOfLines={1} style={styles.pkWinnerName}>
              {winner?.name || "Host"}
            </Text>
            <Text style={styles.pkWinnerSub}>⭐ {score} stars received</Text>
          </>
        )}
      </Animated.View>
    </View>
  );
});


// ---------- PK countdown pill ----------
// Own state → only this tiny pill re-renders every tick (not the whole screen).
// Last 10 seconds: turns red and pulses, like every real PK.
const PkTimerPill = memo(({ endAt }: { endAt: number }) => {
  const calc = () => Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  const [left, setLeft] = useState(calc);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setLeft(calc());
    const i = setInterval(() => setLeft(calc()), 250);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endAt]);

  const urgent = left > 0 && left <= 10;
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
      <Text style={styles.pkTimerPk}>PK</Text>
      <Text style={styles.pkTimerTxt}>{fmtClock(left)}</Text>
    </Animated.View>
  );
});

// ---------- PK "VS" intro splash (first ~2.5s of a battle) ----------
const PkVsIntro = memo(({ leftName, leftImg, rightName, rightImg }: any) => {
  const [show, setShow] = useState(true);
  const lx = useRef(new Animated.Value(-width / 2)).current;
  const rx = useRef(new Animated.Value(width / 2)).current;
  const vs = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(lx, { toValue: 0, friction: 7, tension: 70, useNativeDriver: true }),
        Animated.spring(rx, { toValue: 0, friction: 7, tension: 70, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(250),
          Animated.spring(vs, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
        ]),
      ]),
      Animated.delay(1100),
      Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start(() => setShow(false));
  }, []);

  if (!show) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.pkIntroWrap, { opacity: fade }]}>
      <Animated.View style={[styles.pkIntroSide, { transform: [{ translateX: lx }] }]}>
        <Image source={{ uri: leftImg || STABLE_AVATAR }} style={[styles.pkIntroAva, { borderColor: "#1E90FF" }]} />
        <Text numberOfLines={1} style={styles.pkIntroName}>
          {leftName}
        </Text>
      </Animated.View>

      <Animated.View style={[styles.pkIntroVs, { transform: [{ scale: vs }] }]}>
        <Text style={styles.pkIntroVsTxt}>VS</Text>
      </Animated.View>

      <Animated.View style={[styles.pkIntroSide, { transform: [{ translateX: rx }] }]}>
        <Image source={{ uri: rightImg || STABLE_AVATAR }} style={[styles.pkIntroAva, { borderColor: "#FF2D95" }]} />
        <Text numberOfLines={1} style={styles.pkIntroName}>
          {rightName}
        </Text>
      </Animated.View>
    </Animated.View>
  );
});

// ---------- PK top-3 supporters of one side ----------
const PkSupporters = memo(({ gifters, side }: any) => {
  const top: any[] = Object.values(gifters || {})
    .filter((g: any) => g && g.uid && Number(g.stars) > 0)
    .sort((a: any, b: any) => Number(b.stars) - Number(a.stars))
    .slice(0, 3);
  if (top.length === 0) return null;
  return (
    <View pointerEvents="none" style={[styles.pkSupRow, side === "left" ? { left: 6 } : { right: 6 }]}>
      {top.map((g: any, i: number) => (
        <Image
          key={g.uid}
          source={{ uri: g.img || STABLE_AVATAR }}
          style={[styles.pkSupAva, { marginLeft: i === 0 ? 0 : -6, borderColor: ["#FFD700", "#C0C0C0", "#CD7F32"][i] }]}
        />
      ))}
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
  const [activeGift, setActiveGift] = useState<any>(null);
  const [giftPlayKey, setGiftPlayKey] = useState(0);
  const [giftCombo, setGiftCombo] = useState<any>(null);
  const [selectedGiftUser, setSelectedGiftUser] = useState<string | null>(null);
  const lastSeenGiftKeyRef = useRef("");
  const giftBaselineSetRef = useRef(false);
  const lastGiftRef = useRef<any>(null);
  const giftTimeoutRef = useRef<any>(null);
  const comboTimeoutRef = useRef<any>(null);
  const comboCountRef = useRef(0);

  const giftModalAnim = useRef(new Animated.Value(400)).current;
  const giftTranslateX = useRef(new Animated.Value(-80)).current;
  const giftScale = useRef(new Animated.Value(1)).current;
  const giftShake = useRef(new Animated.Value(0)).current;
  const giftOpacity = useRef(new Animated.Value(0)).current;

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

  const chatListRef = useRef<FlatList>(null);
  const heartbeatRef = useRef<any>(null);
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
  const [giftQty, setGiftQty] = useState(1);
  const [giftPageIdx, setGiftPageIdx] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const lastChatAtRef = useRef(0);
  const peakViewersRef = useRef(0);
  const kickedHandledRef = useRef(false);
  const [reportTarget, setReportTarget] = useState<any>(null);

  // ---------- guest seats ----------
  const [guestSheetVisible, setGuestSheetVisible] = useState(false); // host: requests / guests sheet
  const [guestMicOn, setGuestMicOn] = useState(true); // guest: my own mic switch
  const [guestCamOn, setGuestCamOn] = useState(true); // guest: my own camera switch
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
  const topViewers = React.useMemo(
    () => [...audienceArray].sort((a: any, b: any) => Number(b.level || 1) - Number(a.level || 1)).slice(0, 3),
    [audienceArray]
  );
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
  const rankedGifters: any[] = Object.values(roomData?.roomGifters || {})
    .filter((g: any) => g && g.uid && Number(g.stars) > 0)
    .sort((a: any, b: any) => Number(b.stars) - Number(a.stars));
  const top3Gifters = rankedGifters.slice(0, 3);

  // ---------- guard: no room id at all ----------
  useEffect(() => {
    if (!roomId) console.log("VideoLive opened without a room id.");
  }, [roomId]);

  // ---------- MY wallet (stars) ----------
  useEffect(() => {
    if (!db || !currentUid) return;
    const unsub = onSnapshot(doc(db, "wallets", currentUid), (snap) => {
      if (snap.exists()) setStars(snap.data()?.stars || 0);
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
      callApi("/reward/live-ping", { roomId }).catch(() => {});
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

    const chatsQuery = query(
      collection(db, "rooms", roomId, "chats"),
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
  }, [roomId]);

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

  // ---------- remote gift (liveGift) → play animation + combo banner ----------
  useEffect(() => {
    const gift = roomData?.liveGift;
    if (!gift) return;

    const giftKey = `${gift.senderId}_${gift.timestamp}`;
    if (giftKey === lastSeenGiftKeyRef.current) return;
    lastSeenGiftKeyRef.current = giftKey;

    // My own gift is already on screen (instant local display).
    if (gift.senderId === currentUid) return;
  if (blockedRef.current.has(gift.senderId)) return; // BLOCK

    setGiftCombo({
      senderName: gift.senderName,
      senderImg: gift.senderImg,
      receiverName: gift.receiverName,
      giftId: gift.giftId,
      giftName: gift.giftName,
      count: gift.comboCount || 1,
    });

    lastGiftRef.current = { senderId: gift.senderId, giftId: gift.giftId, time: Date.now() };

    if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);
    comboTimeoutRef.current = setTimeout(() => {
      setGiftCombo(null);
      lastGiftRef.current = null;
      comboCountRef.current = 0;
    }, 2200);

    const giftData = gifts.find((g: any) => String(g.id) === String(gift.giftId));
    if (!giftData || !giftData.animation) return;
    playGift(giftData.animation, giftData.duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.liveGift?.timestamp]);

  const playGift = useCallback((animation: any, duration?: number) => {
    if (!animation) return;
    setActiveGift(animation);
    setGiftPlayKey((k) => k + 1);
    if (giftTimeoutRef.current) clearTimeout(giftTimeoutRef.current);
    giftTimeoutRef.current = setTimeout(() => setActiveGift(null), duration || 5000);
  }, []);

  const handleGiftFinish = useCallback(() => {
    if (giftTimeoutRef.current) clearTimeout(giftTimeoutRef.current);
    setActiveGift(null);
  }, []);

  // combo banner slide-in
  useEffect(() => {
    if (!giftCombo) return;
    giftTranslateX.setValue(-80);
    giftScale.setValue(0.8);
    giftShake.setValue(-1);
    giftOpacity.setValue(0);

    Animated.parallel([
      Animated.spring(giftTranslateX, { toValue: 0, speed: 12, bounciness: 6, useNativeDriver: true }),
      Animated.spring(giftScale, { toValue: 1, speed: 12, bounciness: 6, useNativeDriver: true }),
      Animated.timing(giftOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(giftShake, { toValue: 1, duration: 60, useNativeDriver: true }),
        Animated.timing(giftShake, { toValue: -1, duration: 60, useNativeDriver: true }),
        Animated.timing(giftShake, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]),
    ]).start();
  }, [giftCombo]);

  // gift sheet slide-up
  useEffect(() => {
    if (giftModalVisible) {
      giftModalAnim.setValue(400);
      setGiftPageIdx(0);
      Animated.timing(giftModalAnim, { toValue: 0, duration: 230, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
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
    ],
    [keyboardHeight, showPk, guestList.length]
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

  // after the result was shown for 8s → clear PK from the room
  useEffect(() => {
    if (!isHost || !pkEnded || !db || !roomId) return;
    const t = setTimeout(() => {
      updateDoc(doc(db, "rooms", roomId), { pk: deleteField() }).catch(() => {});
    }, PK_RESULT_SHOW_MS);
    return () => clearTimeout(t);
  }, [isHost, pkEnded, pk?.pkId]);

  // score bar slides smoothly instead of jumping on every gift
  useEffect(() => {
    Animated.timing(pkBarAnim, { toValue: myPct, duration: 350, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPct]);

  useEffect(() => {
    setOppMuted(false);
  }, [pk?.pkId]);

  // incoming invite → wake the token server while the host is deciding
  useEffect(() => {
    if (showInvite) warmUpBackend();
  }, [showInvite]);

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
    const oppChannel = pkActive ? pk?.opponentRoomId : null;
    if (!agoraReady || !engine || !oppChannel) return;

    let cancelled = false;
    let joinedConn: any = null;

    (async () => {
      const wantedUid = (myAgoraUidRef.current || 1) + PK_UID_OFFSET;
      let t: any = await fetchAgoraToken(oppChannel, wantedUid, () => cancelled);
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
  }, [agoraReady, pkActive, pk?.pkId, pk?.opponentRoomId]);

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
      const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
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
      const shareLink = `https://topking.app/live/${roomId}`;
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
      setGuestCamOn(true);
      (async () => {
        try {
          if (Platform.OS === "android") {
            const perms = [PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
            const granted = await PermissionsAndroid.requestMultiple(perms);
            if (
              granted[PermissionsAndroid.PERMISSIONS.CAMERA] !== PermissionsAndroid.RESULTS.GRANTED ||
              granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] !== PermissionsAndroid.RESULTS.GRANTED
            ) {
              throw new Error("Camera / mic permission denied");
            }
          }
          engine.enableAudio();
          engine.enableLocalVideo(true);
          try {
            engine.setVideoEncoderConfiguration(GUEST_VIDEO_PROFILE);
          } catch (_) {}
          engine.muteLocalAudioStream(false);
          engine.muteLocalVideoStream(false);
          engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
          engine.updateChannelMediaOptions({
            clientRoleType: ClientRoleType.ClientRoleBroadcaster,
            publishCameraTrack: true,
            publishMicrophoneTrack: true,
            autoSubscribeAudio: true,
            autoSubscribeVideo: true,
          });
          engine.startPreview();
          showToast("You are on the call with the host 🎤");
        } catch (e: any) {
          console.log("GUEST PUBLISH ERROR:", e?.message || e);
          Alert.alert("Could not join", e?.message || "Camera / mic could not start.");
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
      agoraEngineRef.current?.muteLocalVideoStream(!guestCamOn);
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
          agoraUid: Number(req.agoraUid) || null,
          hostMuted: false,
          at: Date.now(),
        },
        [`guestReq.${req.uid}`]: deleteField(),
      });
    } catch (e) {
      console.log("ACCEPT GUEST ERROR:", e);
      showToast("Could not accept the request");
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

  const onGuestTilePress = (g: any) => {
    if (g.uid === currentUid) {
      setMenuVisible(true);
      return;
    }
    if (isHost) {
      Alert.alert(g.name || "Guest", "Guest controls", [
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

  const onScreenTap = () => {
    Keyboard.dismiss();
    setEmojiOpen(false);
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

  // Who can receive a gift here: the host, and — during a PK — the opponent host.
  const giftUsers: any[] = [];
  if (hostId && hostId !== currentUid) {
    giftUsers.push({ uid: hostId, name: hostName, img: hostImg });
  }
  if (pkActive && pk?.opponentHostId && pk.opponentHostId !== currentUid) {
    giftUsers.push({ uid: pk.opponentHostId, name: pk.opponentName, img: pk.opponentImg });
  }

  const openGiftModal = () => {
    if (!giftUsers.length) {
      Alert.alert("Gift", "There is nobody to send a gift to right now.");
      return;
    }
    if (!giftUsers.some((u) => u.uid === selectedGiftUser)) {
      setSelectedGiftUser(giftUsers[0].uid);
    }
    setGiftQty(1);
    setGiftModalVisible(true);
  };

  // 1) close sheet + show animation/banner IMMEDIATELY
  // 2) all Firestore / backend work happens in the background
  const handleSendGift = (item: any) => {
    if (!selectedGiftUser || typeof selectedGiftUser !== "string") {
      Alert.alert("Gift", "Please select a user");
      return;
    }
    const qty = giftQty;
    if (stars < Number(item.price || 0) * qty) {
      Alert.alert("Gift", "Not enough stars", [
        { text: "Cancel", style: "cancel" },
        { text: "Recharge", onPress: goRecharge },
      ]);
      return;
    }

    const receiverId = selectedGiftUser;

    // never gift yourself, and only users that are in the list
    if (receiverId === currentUid || !giftUsers.some((u) => u.uid === receiverId)) {
      Alert.alert("Gift", "Please select another user");
      return;
    }

    setGiftModalVisible(false);

    if (item.animation) playGift(item.animation, item.duration);

    const isComboContinue =
      lastGiftRef.current &&
      lastGiftRef.current.senderId === currentUid &&
      lastGiftRef.current.giftId === item.id &&
      Date.now() - lastGiftRef.current.time < 3000;

    if (!comboCountRef.current || !isComboContinue) comboCountRef.current = 1;
    else comboCountRef.current++;

    if (qty > 1) comboCountRef.current += qty - 1;
    const comboCount = comboCountRef.current;

    lastGiftRef.current = { senderId: currentUid, giftId: item.id, time: Date.now() };

    if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);

    const _receiver = giftUsers.find((u) => u.uid === receiverId);
    const _receiverName =
      _receiver?.name ||
      audienceMap?.[receiverId]?.name ||
      audienceMap?.[receiverId]?.username ||
      "user";
    const _senderDisplay =
      currentRealName && currentRealName !== "User" ? currentRealName : currentName;

    setGiftCombo({
      senderName: _senderDisplay,
      senderImg: currentAvatar || STABLE_AVATAR,
      receiverName: _receiverName,
      giftId: item.id,
      giftName: item.name,
      count: comboCount,
    });

    comboTimeoutRef.current = setTimeout(() => {
      setGiftCombo(null);
      lastGiftRef.current = null;
      comboCountRef.current = 0;
    }, 2200);

    // Own gift: mark as seen so the Firestore echo is ignored.
    const giftTimestamp = Date.now();
    lastSeenGiftKeyRef.current = `${currentUid}_${giftTimestamp}`;

    sendGiftInBackground({
      item,
      receiverId,
      receiverName: _receiverName,
      senderDisplay: _senderDisplay,
      comboCount,
      giftTimestamp,
      qty,
    });
  };

  const handleSendGiftRef = useRef<any>(null);
  handleSendGiftRef.current = handleSendGift;
  const stableSendGift = useCallback((item: any) => handleSendGiftRef.current?.(item), []);

  const sendGiftInBackground = async ({
    item,
    receiverId,
    receiverName,
    senderDisplay,
    comboCount,
    giftTimestamp,
    qty = 1,
  }: any) => {
    if (!db || !roomId || !currentUid) return;

    const price = Number(item.price || 0) * qty;
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

    const jobs: Promise<any>[] = [
      // sender wallet
      updateDoc(doc(db, "wallets", currentUid), { stars: increment(-price) }),

      updateDoc(roomRef, roomUpdate),

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

    // chat line only on the first tap of a combo (avoid spam)
    if (comboCount <= qty) {
      jobs.push(
        addDoc(collection(db, "rooms", roomId, "chats"), {
          type: "gift",
          senderId: currentUid,
          qty,
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
          createdAt: Date.now(),
        })
      );
    }

    // one failing write must not cancel the others
    const results = await Promise.allSettled(jobs);
    results.forEach((r, idx) => {
      if (r.status === "rejected" && __DEV__) console.log("GIFT WRITE FAILED #" + idx, r.reason);
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
  const pkPanelH = pkPanelW * 1.54;
  const pkBarTop = 130;
  const pkPanelTop = pkBarTop + 16;

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
                key: "gcam",
                label: guestCamOn ? "Camera off" : "Camera on",
                active: !guestCamOn,
                icon: <Ionicons name={guestCamOn ? "videocam" : "videocam-off"} size={24} color="#fff" />,
                onPress: () => setGuestCamOn((v) => !v),
              },
              {
                key: "gflip",
                label: "Flip",
                icon: <Ionicons name="camera-reverse-outline" size={24} color="#fff" />,
                onPress: flipCamera,
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
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1A1444" }]} />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: height * 0.5,
              backgroundColor: "rgba(8,6,28,0.55)",
            }}
          />

          {/* score bar */}
          <View style={[styles.pkBarWrap, { top: pkBarTop }]}>
            <View style={styles.pkBar}>
              <Animated.View
                style={{
                  ...StyleSheet.absoluteFillObject,
                  backgroundColor: "#1E90FF",
                  transform: [{ translateX: pkBarAnim.interpolate({ inputRange: [0, 100], outputRange: [-width, 0] }) }],
                }}
              />
            </View>
            {/* lightning marker rides the border between the two scores */}
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
                <Ionicons name="star" size={9} color="#1E90FF" />
              </View>
              <Text style={styles.pkScoreTxt}>{shownMy}</Text>
            </View>
            <View pointerEvents="none" style={[styles.pkScoreWrap, { right: 4 }]}>
              <Text style={styles.pkScoreTxt}>{shownOpp}</Text>
              <View style={styles.pkStarBox}>
                <Ionicons name="star" size={9} color="#FF2D95" />
              </View>
            </View>
          </View>

          {/* two video panels */}
          <View style={[styles.pkPanels, { top: pkPanelTop, height: pkPanelH }]}>
            {/* LEFT = this room's host */}
            <View
              style={[
                { width: pkPanelW, height: pkPanelH, backgroundColor: "#111" },
                pkEnded && myResult === "win" && styles.pkWinnerPanel,
              ]}
            >
              {showLocalVideo ? (
                <RtcSurfaceView style={{ flex: 1 }} canvas={{ uid: 0 }} />
              ) : showRemoteVideo ? (
                <RtcSurfaceView style={{ flex: 1 }} canvas={{ uid: hostRemoteUid as number }} />
              ) : (
                <View style={styles.pkWaiting}>
                  <View style={styles.pkBadge}>
                    <Text style={styles.pkBadgeTxt}>PK</Text>
                  </View>
                </View>
              )}
              {(isHost ? videoOff : hostVideoOff) && pausedOverlay("Video paused", StyleSheet.absoluteFill, false)}
              {pkEnded && myResult === "lose" && <View pointerEvents="none" style={styles.pkDim} />}
              <PkSupporters gifters={pk?.gifters} side="left" />
              {pkEnded && !!myResult && (
                <View style={[styles.pkResultBadge, myResult === "win" && { backgroundColor: "#FFB300" }]}>
                  <Text style={styles.pkResultBadgeTxt}>{resultText(myResult)}</Text>
                </View>
              )}
              <View style={styles.pkNamePill}>
                <Text numberOfLines={1} style={styles.pkNameTxt}>
                  {hostName}
                </Text>
              </View>
            </View>

            {/* RIGHT = opponent host (their channel) */}
            <View
              style={[
                { width: pkPanelW, height: pkPanelH, backgroundColor: "#111" },
                pkEnded && oppResult === "win" && styles.pkWinnerPanel,
              ]}
            >
              {oppRemoteUid && pkConn ? (
                <RtcSurfaceView style={{ flex: 1 }} canvas={{ uid: oppRemoteUid }} connection={pkConn} />
              ) : (
                <View style={styles.pkWaiting}>
                  <Image source={{ uri: pk?.opponentImg || STABLE_AVATAR }} style={styles.pkWaitAvatar} />
                  <ActivityIndicator size="small" color="#F71084" style={{ marginTop: 10 }} />
                  <Text style={styles.pkWaitTxt}>Connecting...</Text>
                </View>
              )}
              {pkEnded && oppResult === "lose" && <View pointerEvents="none" style={styles.pkDim} />}
              <PkSupporters gifters={oppRoom?.pk?.gifters} side="right" />
              {pkActive && !!oppRemoteUid && (
                <TouchableOpacity style={styles.pkMuteBtn} onPress={toggleOppMute} activeOpacity={0.8}>
                  <Ionicons name={oppMuted ? "volume-mute" : "volume-high"} size={14} color="#fff" />
                </TouchableOpacity>
              )}
              {pkEnded && !!myResult && (
                <View style={[styles.pkResultBadge, oppResult === "win" && { backgroundColor: "#FFB300" }]}>
                  <Text style={styles.pkResultBadgeTxt}>{resultText(oppResult)}</Text>
                </View>
              )}
              <View style={[styles.pkNamePill, { left: undefined, right: 6 }]}>
                <Text numberOfLines={1} style={styles.pkNameTxt}>
                  {pk?.opponentName || "Opponent"}
                </Text>
              </View>
            </View>

            {/* winner banner: the host who got the most gifts */}
            {pkEnded && !!myResult && (
              <PkWinnerBanner
                key={`banner_${pk?.pkId}`}
                result={myResult}
                winner={
                  myResult === "win"
                    ? { name: hostName, img: hostImg }
                    : { name: pk?.opponentName, img: pk?.opponentImg }
                }
                score={myResult === "lose" ? shownOpp : shownMy}
              />
            )}

            {/* countdown (own component → no whole-screen re-render) */}
            {pkActive && !!pk?.endAt && <PkTimerPill key={`timer_${pk?.pkId}`} endAt={pk.endAt} />}

            {/* "VS" splash only for the first seconds of a fresh battle */}
            {pkActive && Date.now() - (pk?.startAt || 0) < 4000 && (
              <PkVsIntro
                key={`intro_${pk?.pkId}`}
                leftName={hostName}
                leftImg={hostImg}
                rightName={pk?.opponentName || "Opponent"}
                rightImg={pk?.opponentImg}
              />
            )}
          </View>
        </>
      )}

      {/* tap anywhere on the video = send a heart */}
      <TouchableWithoutFeedback onPress={onScreenTap}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>

      {/* soft top/bottom scrims so the white text stays readable */}
      <View pointerEvents="none" style={styles.topScrim} />
      <View pointerEvents="none" style={styles.bottomScrim} />

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
      <View style={styles.topHeader} pointerEvents="box-none">
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
                {hostVerified && (
                  <MaterialCommunityIcons
                    name="check-decagram"
                    size={14}
                    style={{ marginLeft: 3 }}
                    color={hostVerifiedColor === "yellow" ? "#FFD700" : "#ffffff"}
                  />
                )}
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
            <TouchableOpacity style={styles.viewerStack} activeOpacity={0.8} onPress={() => setViewerListVisible(true)}>
              {topViewers.map((u: any, i: number) => (
                  <Image
                    key={u.uid}
                    source={{ uri: u.img || STABLE_AVATAR }}
                    style={[styles.viewerStackAva, { marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }]}
                  />
                ))}
              <Text style={styles.viewerStackCount}>{viewerCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setExitModalVisible(true)}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

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
        initialNumToRender={12}
        windowSize={7}
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
              <Ionicons name="chatbubble-outline" size={18} color="#fff" />
              <Text style={styles.chatPillTxt}>Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.circleBtn} onPress={handleShare}>
              <Ionicons name="arrow-redo" size={18} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.circleBtn} onPress={() => setMenuVisible(true)}>
              <Ionicons name="menu" size={20} color="#fff" />
            </TouchableOpacity>

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
                    style={[styles.pkBadgeBtn, pkActive && { backgroundColor: "#DC2626" }]}
                    onPress={onPkButton}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.pkBadgeBtnTxt}>{pkActive ? "END" : "PK"}</Text>
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
      <GiftOverlay activeGift={activeGift} playKey={giftPlayKey} onFinish={handleGiftFinish} />

      {giftCombo && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: height * 0.5,
            left: 10,
            zIndex: 99998,
            elevation: 99998,
            flexDirection: "row",
            alignItems: "center",
            opacity: giftOpacity,
            transform: [{ translateX: giftTranslateX }, { scale: giftScale }],
          }}
        >
          <View style={styles.comboPill}>
            <Animated.Image
              source={{
                uri: giftCombo.senderImg || audienceMap?.[lastGiftRef.current?.senderId]?.img || STABLE_AVATAR,
              }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                marginRight: 8,
                backgroundColor: "#2a2b38",
                transform: [
                  {
                    rotate: giftShake.interpolate({ inputRange: [-1, 1], outputRange: ["-8deg", "8deg"] }),
                  },
                ],
              }}
            />
            <View style={{ flexShrink: 1 }}>
              <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>
                {giftCombo.senderName}
              </Text>
              <Text numberOfLines={1} style={{ color: "#fff", fontSize: 13, marginTop: 1 }}>
                send{" "}
                <Text style={{ color: "#FFE600", fontWeight: "bold" }}>@{giftCombo.receiverName || "user"}</Text>
              </Text>
            </View>
          </View>

          {(() => {
            const gd = gifts.find((g: any) => String(g.id) === String(giftCombo.giftId));
            return gd?.icon ? (
              <Image source={gd.icon} style={{ width: 58, height: 58, resizeMode: "contain", marginLeft: 6 }} />
            ) : null;
          })()}

          <Text style={styles.comboX}>x{giftCombo.count || 1}</Text>
        </Animated.View>
      )}

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
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Text style={styles.giftTitle}>🎁 Send Gifts</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ fontSize: 16 }}>⭐</Text>
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "bold", marginLeft: 4 }}>{stars}</Text>
                <TouchableOpacity style={styles.rechargeBtn} onPress={goRecharge}>
                  <Text style={styles.rechargeTxt}>+ Recharge</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* who receives the gift */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 6, flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: 6, paddingVertical: 4 }}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {giftUsers.map((user) => (
                <TouchableOpacity
                  key={user.uid}
                  onPress={() => setSelectedGiftUser(user.uid)}
                  style={{ alignItems: "center", marginRight: 10 }}
                >
                  <Image
                    source={{ uri: user.img || STABLE_AVATAR }}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      borderWidth: selectedGiftUser === user.uid ? 3 : 1,
                      borderColor: selectedGiftUser === user.uid ? "#ff1493" : "#555",
                    }}
                  />
                  <Text
                    style={{ color: "#fff", fontSize: 9, width: 52, textAlign: "center", marginTop: 2 }}
                    numberOfLines={1}
                  >
                    {user.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* quantity */}
            <View style={[styles.qtyRow, { marginBottom: 6 }]}>
              <Text style={styles.qtyLbl}>Qty</Text>
              {GIFT_QTY.map((q) => (
                <TouchableOpacity
                  key={q}
                  onPress={() => setGiftQty(q)}
                  style={[styles.qtyChip, giftQty === q && styles.qtyChipOn]}
                >
                  <Text style={[styles.qtyChipTxt, giftQty === q && { color: "#fff" }]}>x{q}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* gift pages: 4 columns x 2 rows, snap paging */}
            <FlatList
              data={GIFT_PAGES}
              keyExtractor={(p: any) => p.key}
              renderItem={({ item }: any) => <GiftPage page={item} qty={giftQty} onSend={stableSendGift} />}
              extraData={giftQty}
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
                      backgroundColor: i === giftPageIdx ? "#ff1493" : "rgba(255,255,255,0.3)",
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
                data={[...audienceArray].sort((a: any, b: any) => Number(b.level || 1) - Number(a.level || 1))}
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
                          {!!item.verified && (
                            <MaterialCommunityIcons
                              name="check-decagram"
                              size={14}
                              style={{ marginLeft: 4 }}
                              color={item.verifiedColor === "yellow" ? "#FFD700" : "#ffffff"}
                            />
                          )}
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
                      });
                    }}
                  >
                    <Text style={[styles.rankNum, index < 3 && { color: ["#FFD700", "#C0C0C0", "#CD7F32"][index] }]}>
                      {index + 1}
                    </Text>
                    <Image source={{ uri: item.img || STABLE_AVATAR }} style={styles.pkRowAva} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.pkRowName} numberOfLines={1}>
                        {item.name || "User"}
                      </Text>
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

      {/* ================= USER PROFILE CARD ================= */}
      <Modal transparent visible={!!profileCard} animationType="fade" onRequestClose={() => setProfileCard(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setProfileCard(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.pcBox}>
            {profileCard && (
              <>
                <View style={{ width: 96, height: 96, justifyContent: "center", alignItems: "center" }}>
                  <Image source={{ uri: profileCard.img || STABLE_AVATAR }} style={styles.pcAva} />
                  {(Number(profileCard.level) >= 10 || !!profileCard.uid) && (
                    <LevelFrame
                      level={Number(profileCard.level)}
                      uid={profileCard.uid}
                      animated
                      style={{ position: "absolute", width: 110, height: 110 }}
                    />
                  )}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
                  <Text style={styles.pcName} numberOfLines={1}>
                    {profileCard.name || profileCard.username || "User"}
                  </Text>
                  {!!profileCard.verified && (
                    <MaterialCommunityIcons
                      name="check-decagram"
                      size={17}
                      style={{ marginLeft: 5 }}
                      color={profileCard.verifiedColor === "yellow" ? "#FFD700" : "#ffffff"}
                    />
                  )}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                  {(() => {
                    const th = getLevelTheme(Number(profileCard.level) || 1);
                    return (
                      <View style={[styles.levelBadge, { backgroundColor: th.bg, borderColor: th.border, marginLeft: 0 }]}>
                        <MaterialCommunityIcons name="diamond-stone" size={10} color={th.icon} />
                        <Text style={[styles.levelText, { color: th.text }]}>LV {profileCard.level || 1}</Text>
                      </View>
                    );
                  })()}
                  {profileCard.uid === hostId && (
                    <View style={[styles.roleTag, { backgroundColor: "#F71084", marginLeft: 6 }]}>
                      <Text style={styles.roleTagTxt}>HOST</Text>
                    </View>
                  )}
                  {!!mods[profileCard.uid] && (
                    <View style={[styles.roleTag, { backgroundColor: "#2D9CFF", marginLeft: 6 }]}>
                      <Text style={styles.roleTagTxt}>MOD</Text>
                    </View>
                  )}
                  {!!mutedUsers[profileCard.uid] && (
                    <View style={[styles.roleTag, { backgroundColor: "#6b7280", marginLeft: 6 }]}>
                      <Text style={styles.roleTagTxt}>MUTED</Text>
                    </View>
                  )}
                </View>

                {profileCard.uid !== currentUid && (
                  <View style={styles.pcBtns}>
                    <TouchableOpacity
                      style={[styles.pcBtn, profileFollowing ? { backgroundColor: "#374151" } : { backgroundColor: "#F71084" }]}
                      onPress={toggleProfileFollow}
                    >
                      <Text style={styles.pcBtnTxt}>{profileFollowing ? "Following" : "+ Follow"}</Text>
                    </TouchableOpacity>

                    {profileCard.isHostCard && !isHost && (
                      <TouchableOpacity
                        style={[styles.pcBtn, { backgroundColor: "#F59E0B" }]}
                        onPress={() => {
                          setProfileCard(null);
                          openGiftModal();
                        }}
                      >
                        <Text style={styles.pcBtnTxt}>🎁 Send Gift</Text>
                      </TouchableOpacity>
                    )}

                    {canModerate(profileCard) && (
                      <>
                        <TouchableOpacity
                          style={[styles.pcBtn, { backgroundColor: "#374151" }]}
                          onPress={() => muteUser(profileCard, !mutedUsers[profileCard.uid])}
                        >
                          <Text style={styles.pcBtnTxt}>
                            {mutedUsers[profileCard.uid] ? "🔊 Unmute chat" : "🔇 Mute chat"}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.pcBtn, { backgroundColor: "#DC2626" }]}
                          onPress={() => kickUser(profileCard)}
                        >
                          <Text style={styles.pcBtnTxt}>🚫 Remove from live</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {isHost && profileCard.uid !== hostId && (
                      <TouchableOpacity
                        style={[styles.pcBtn, { backgroundColor: "#2D9CFF" }]}
                        onPress={() => toggleMod(profileCard)}
                      >
                        <Text style={styles.pcBtnTxt}>
                          {mods[profileCard.uid] ? "Remove moderator" : "🛡 Make moderator"}
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.pcBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: "#4b5563" }]}
                      onPress={() => {
                        setReportTarget(profileCard);
                        setProfileCard(null);
                      }}
                    >
                      <Text style={[styles.pcBtnTxt, { color: "#f87171" }]}>⚑ Report</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
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
                    <Text style={styles.endProgTitle}>Broadcast {WEEKLY_TARGET_MIN} min in a live</Text>
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
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  loadingBg: { justifyContent: "center", alignItems: "center", backgroundColor: "#0A0B14" },
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
    height: 130,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  bottomScrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: "rgba(0,0,0,0.35)",
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
    right: 16,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(60,40,80,0.65)",
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
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1.5,
    borderColor: "rgba(255,105,180,0.8)",
    maxWidth: width * 0.62,
  },
  comboX: {
    color: "#FF69B4",
    fontSize: 34,
    fontWeight: "900",
    fontStyle: "italic",
    marginLeft: 4,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },

  /* PK STAGE */
  pkBarWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 16,
    justifyContent: "center",
  },
  pkBar: { flexDirection: "row", height: 16, overflow: "hidden", backgroundColor: "#FF2D95" },
  pkScoreWrap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  pkStarBox: {
    width: 13,
    height: 13,
    borderRadius: 3,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  pkSparkGlow: {
    width: 5,
    height: 16,
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
    fontSize: 12,
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
  pkWaiting: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0F1020" },
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
    top: 4,
    alignSelf: "center",
    left: width / 2 - 48,
    width: 96,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(20,16,50,0.78)",
    borderRadius: 14,
    paddingVertical: 4,
  },
  pkTimerPk: { color: "#2AA8FF", fontWeight: "900", fontStyle: "italic", fontSize: 15, marginRight: 6 },
  pkTimerTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
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
  pkWinnerWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  pkWinnerCard: {
    minWidth: width * 0.58,
    maxWidth: width * 0.8,
    alignItems: "center",
    backgroundColor: "rgba(10,11,20,0.88)",
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#FFD700",
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 14,
  },
  pkWinnerCrown: { fontSize: 34 },
  pkWinnerAva: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: "#FFD700" },
  pkWinnerTitle: {
    color: "#FFD700",
    fontSize: 24,
    fontWeight: "900",
    fontStyle: "italic",
    marginTop: 8,
    letterSpacing: 2,
  },
  pkWinnerName: { color: "#fff", fontSize: 15, fontWeight: "800", marginTop: 2, maxWidth: width * 0.6 },
  pkWinnerSub: { color: "#FFE082", fontSize: 12, fontWeight: "700", marginTop: 4 },
  pkWinnerDraw: { color: "#fff", fontSize: 28, fontWeight: "900", fontStyle: "italic", marginTop: 12 },
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
  giftOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  giftSheet: {
    backgroundColor: "#111827",
    maxHeight: height * 0.52,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  giftTitle: { color: "#fff", fontSize: 17, fontWeight: "bold" },
  giftCard: {
    width: "22.5%",
    marginRight: "2%",
    backgroundColor: "#1C1E2E",
    borderRadius: 10,
    padding: 5,
    marginBottom: 10,
    alignItems: "center",
  },
  giftName: { color: "#fff", fontSize: 10, marginTop: 0 },
  giftCoin: { color: "#999", fontSize: 12, marginTop: 2 },

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
  pkSupRow: { position: "absolute", bottom: 8, flexDirection: "row", alignItems: "center" },
  pkSupAva: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, backgroundColor: "#2a2b38" },
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
  pkWaitTxt: { color: "#9aa0b4", fontSize: 10, marginTop: 6, fontWeight: "600" },
  pkDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
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
  pkIntroWrap: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "rgba(10,11,20,0.78)",
  },
  pkIntroSide: { alignItems: "center", width: width * 0.32 },
  pkIntroAva: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, backgroundColor: "#2a2b38" },
  pkIntroName: { color: "#fff", fontSize: 12, fontWeight: "800", marginTop: 6, maxWidth: width * 0.3 },
  pkIntroVs: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F71084",
    borderWidth: 3,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  pkIntroVsTxt: { color: "#fff", fontWeight: "900", fontStyle: "italic", fontSize: 20 },

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
    backgroundColor: "rgba(110,90,125,0.62)",
    borderRadius: 12,
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
    backgroundColor: "rgba(80,40,110,0.55)",
    borderRadius: 24,
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
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: "rgba(60,40,80,0.65)",
  },
  chatPillTxt: { color: "#fff", fontSize: 13, fontWeight: "600", marginLeft: 6 },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#F71084",
    justifyContent: "center",
    alignItems: "center",
  },
  pkBadgeBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#8E44FF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
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
});
