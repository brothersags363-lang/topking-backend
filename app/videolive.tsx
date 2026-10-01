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
//
// Wired to the same `rooms` Firestore collection that all-live.js reads
// and livevideostart.tsx writes to.

import React, { useEffect, useRef, useState, useCallback, memo } from "react";
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
  PermissionsAndroid,
  Dimensions,
  ActivityIndicator,
  Share,
  ScrollView,
  Alert,
  Switch,
  TouchableWithoutFeedback,
} from "react-native";

import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import LottieView from "lottie-react-native";
import { WebView } from "react-native-webview";
import { gifts } from "../assets/giftsData";
import { giftHtml } from "../assets/giftWeb";

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

const AGORA_APP_ID = "4e23c17b272f4a1c920c214be58486f4";
const TOKEN_ENDPOINT = "https://topking-backend.onrender.com/token";
const STABLE_AVATAR = "https://avatar.iran.liara.run/public/65";

// Same 30s window all-live.js uses to decide a room is still "live".
const HEARTBEAT_INTERVAL = 8000;

// PK settings
const PK_DURATION_SEC = 180; // 3 minutes
const PK_RESULT_SHOW_MS = 9000; // winner banner stays this long, then PK is cleared
const PK_INVITE_TTL = 30000; // invite expires after 30s
const PK_UID_OFFSET = 1000000; // uid used when we peek into the opponent's channel

// Host camera quality. 540x960 @ 15fps ~ smooth on normal 4G and light on the
// phone's CPU. Raise width/height/bitrate here if you want sharper video.
// 720x1280 @ 24fps is the standard "real live app" quality: sharp but still
// light. Viewers on a weak network automatically fall back to a small stream
// (dual-stream + subscribe fallback below), so nobody sees a frozen picture.
const VIDEO_PROFILE = {
  dimensions: { width: 720, height: 1280 },
  frameRate: 24,
  bitrate: 1500,
  minBitrate: 400,
  orientationMode: 2, // fixed portrait → the picture never rotates / stretches
};

// PK length choices the host can pick before inviting (seconds)
const PK_DURATIONS = [180, 300, 600];

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
          {chat.level >= 10 && getLevelFrame(chat.level) && (
            <Image source={getLevelFrame(chat.level)} style={styles.sysFrame} />
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
        {chat.level >= 10 && getLevelFrame(chat.level) && (
          <Image source={getLevelFrame(chat.level)} style={styles.chatFrame} />
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
});

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
      <Text style={styles.pkTimerTxt}>
        {urgent ? "🔥 " : "⏱ "}
        {fmtClock(left)}
      </Text>
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
        <Image source={{ uri: leftImg || STABLE_AVATAR }} style={[styles.pkIntroAva, { borderColor: "#FF3D71" }]} />
        <Text numberOfLines={1} style={styles.pkIntroName}>
          {leftName}
        </Text>
      </Animated.View>

      <Animated.View style={[styles.pkIntroVs, { transform: [{ scale: vs }] }]}>
        <Text style={styles.pkIntroVsTxt}>VS</Text>
      </Animated.View>

      <Animated.View style={[styles.pkIntroSide, { transform: [{ translateX: rx }] }]}>
        <Image source={{ uri: rightImg || STABLE_AVATAR }} style={[styles.pkIntroAva, { borderColor: "#2D9CFF" }]} />
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
          style={[styles.pkSupAva, { marginLeft: i === 0 ? 0 : -8, borderColor: ["#FFD700", "#C0C0C0", "#CD7F32"][i] }]}
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
  const [profileReady, setProfileReady] = useState(false);
  const [stars, setStars] = useState(0);

  // ---------- chat + audience (subcollections, like LiveRoom.js) ----------
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [audienceMap, setAudienceMap] = useState<any>({});

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
  const joinAnim = useRef(new Animated.Value(-width)).current;
  const joinHideTimeoutRef = useRef<any>(null);
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
  const [pkCandidates, setPkCandidates] = useState<any[]>([]);
  const [pkLoading, setPkLoading] = useState(false);
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

  const chatListRef = useRef<FlatList>(null);
  const heartbeatRef = useRef<any>(null);

  // ---------- PREMIUM: follow / likes / viewers / moderation / summary ----------
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [hearts, setHearts] = useState<any[]>([]);
  const heartIdRef = useRef(0);
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
  const [emojiOpen, setEmojiOpen] = useState(false);
  const lastChatAtRef = useRef(0);
  const peakViewersRef = useRef(0);
  const kickedHandledRef = useRef(false);
  const [reportTarget, setReportTarget] = useState<any>(null);

  // pulsing red LIVE dot
  const dotPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, { toValue: 0.3, duration: 650, useNativeDriver: true }),
        Animated.timing(dotPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const hostName = roomData?.hostName || "Host";
  const hostImg = roomData?.hostImg || STABLE_AVATAR;
  const hostId = roomData?.hostId || (isHost ? currentUid : null);
  const hostStars = Number(roomData?.seatStars?.[hostId] || 0);
  const hostMicMuted = !!roomData?.hostMicMuted;
  const hostVideoOff = !!roomData?.hostVideoOff;

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
  const audienceArray = Object.values(audienceMap).filter(
    (u: any) => u && u.uid && u.uid !== hostId
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
          setMyVerified(!!data.verified);
          setMyVerifiedColor(data.verifiedColor || "white");
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
      const { lastHeartbeat: _hb, ...restOfRoom } = data as any;
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
          setHostVerified(!!data?.verified);
          setHostVerifiedColor(data?.verifiedColor || "white");
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

    return () => {
      clearInterval(heartbeatRef.current);
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

    const unsubChats = onSnapshot(
      chatsQuery,
      (snap) => {
        const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
        setChatMessages(msgs);

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
      if (joinHideTimeoutRef.current) clearTimeout(joinHideTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const showJoinBanner = (data: any) => {
    if (joinHideTimeoutRef.current) clearTimeout(joinHideTimeoutRef.current);
    setJoinBanner(data);
    joinAnim.stopAnimation();
    joinAnim.setValue(-width);
    Animated.spring(joinAnim, { toValue: 0, speed: 14, bounciness: 6, useNativeDriver: true }).start();
    joinHideTimeoutRef.current = setTimeout(() => {
      Animated.timing(joinAnim, { toValue: -width, duration: 300, useNativeDriver: true }).start(() =>
        setJoinBanner(null)
      );
    }, Number(data?.level) >= 30 ? 4500 : 2800);
  };

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
            verified: myVerified,
            verifiedColor: myVerifiedColor || "#ffffff",
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
              verified: myVerified,
              verifiedColor: myVerifiedColor || "white",
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
      Animated.spring(giftModalAnim, { toValue: 0, speed: 18, bounciness: 4, useNativeDriver: true }).start();
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
      () => setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ---------- auto-scroll chat ----------
  useEffect(() => {
    if (!chatMessages.length) return;
    requestAnimationFrame(() => chatListRef.current?.scrollToEnd({ animated: true }));
  }, [chatMessages.length]);

  // ============================================================
  // PK
  // ============================================================

  // opponent room listener (score + "did they leave")
  const oppRoomId = showPk ? pk?.opponentRoomId || null : null;
  useEffect(() => {
    setOppLoaded(false);
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
        setOppRoom(s.exists() ? s.data() : null);
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
    Animated.timing(pkBarAnim, { toValue: myPct, duration: 350, useNativeDriver: false }).start();
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
    const t = setTimeout(() => cancelPkInvite(), PK_INVITE_TTL);
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

  // list of other live hosts I can invite
  const openPkList = async () => {
    if (!db) return;
    warmUpBackend(); // wake the token server now so the opponent video loads fast
    setPkListVisible(true);
    setPkLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "rooms"), where("status", "==", "active")));
      const now = Date.now();
      const list: any[] = [];
      snap.forEach((d) => {
        if (d.id === roomId) return;
        const x: any = d.data();
        if (!x?.hostId || x.hostId === currentUid) return;
        if (x.seatsData) return; // voice rooms can't PK
        if (x.pk || x.pkInvite) return; // already busy
        const hb = x.lastHeartbeat?.toMillis?.() || 0;
        if (!hb || now - hb > 45000) return; // not really live anymore
        list.push({
          id: d.id,
          hostId: x.hostId,
          name: x.hostName || "Host",
          img: x.hostImg || STABLE_AVATAR,
          title: x.title || x.roomName || "",
        });
      });
      setPkCandidates(list);
    } catch (e) {
      console.log("PK LIST ERROR:", e);
    }
    setPkLoading(false);
  };

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

      const res = await fetchAgoraToken(roomId, numericUid, isCancelled, () =>
        setStatus("Waking up server...")
      );
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

        if (auth?.currentUser) {
          numericUid =
            (currentUid || "guest").split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0) %
            1000000;
          if (!numericUid) numericUid = 1;
        }
        myAgoraUidRef.current = numericUid;

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
            }
          },
          onUserOffline: (connection: any, uid: number) => {
            if (!mounted) return;
            if (connection?.channelId && connection.channelId !== roomId) {
              setOppRemoteUid((cur) => (cur === uid ? null : cur));
              return;
            }
            setRemoteUsers((prev) => prev.filter((id) => id !== uid));
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
      setAgoraReady(false);
      setLocalReady(false);
      setRemoteUsers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost, agoraRetry]);

  // ============================================================
  // TOOLS: mic / video / flip / filter / sound
  // ============================================================

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
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
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
        verified: myVerified,
        verifiedColor: myVerifiedColor || "white",
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
    const faces = ["❤️", "💖", "💗", "💜", "🧡", "😍"];
    setHearts((prev) => {
      const next = [...prev];
      for (let i = 0; i < n; i++) {
        if (next.length >= 24) break;
        heartIdRef.current += 1;
        next.push({
          id: heartIdRef.current,
          x: Math.floor(Math.random() * 60) + 6,
          emoji: faces[Math.floor(Math.random() * faces.length)],
          color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
        });
      }
      return next;
    });
  }, []);
  const removeHeart = useCallback((id: number) => setHearts((prev) => prev.filter((h) => h.id !== id)), []);

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
    if (!likeTimerRef.current) likeTimerRef.current = setTimeout(flushLikes, 1500);
  };

  const onScreenTap = () => {
    Keyboard.dismiss();
    setEmojiOpen(false);
    sendLike();
  };

  // other people's likes → a few hearts on my screen
  useEffect(() => {
    const n = Number(roomData?.likes || 0);
    if (lastLikesSeenRef.current === null) {
      lastLikesSeenRef.current = n;
      return;
    }
    const delta = n - lastLikesSeenRef.current;
    lastLikesSeenRef.current = n;
    if (delta > 0) spawnHearts(Math.min(delta, 4));
  }, [roomData?.likes]);

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
          verified: myVerified,
          verifiedColor: myVerifiedColor || "white",
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
  const showRemoteVideo = !isHost && remoteUsers.length > 0;

  const pkPanelW = width / 2;
  const pkPanelH = pkPanelW * 1.3;
  const pkBarTop = 112;
  const pkPanelTop = pkBarTop + 30;

  const myResult = pk?.result; // "win" | "lose" | "draw" — from THIS room's point of view
  const oppResult = myResult === "win" ? "lose" : myResult === "lose" ? "win" : myResult;
  const resultText = (r?: string) => (r === "win" ? "WIN 🏆" : r === "lose" ? "LOSE" : r === "draw" ? "DRAW" : "");

  const filterLabel = FILTERS.find((f) => f.id === filterId)?.label || "Filter";

  const agoraFailed = /^(Failed|Error)/.test(agoraStatus);
  const retryAgora = () => {
    setAgoraStatus(isHost ? "Starting camera..." : "Connecting to live...");
    setAgoraRetry((k) => k + 1);
  };

  const mainVideoArea = () => {
    if (showLocalVideo) return <RtcSurfaceView style={StyleSheet.absoluteFill} canvas={{ uid: 0 }} />;
    if (showRemoteVideo)
      return <RtcSurfaceView style={StyleSheet.absoluteFill} canvas={{ uid: remoteUsers[0] }} />;
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
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0A0B14" }]} />

          {/* score bar */}
          <View style={[styles.pkBarWrap, { top: pkBarTop }]}>
            <View style={styles.pkBar}>
              <Animated.View
                style={{
                  width: pkBarAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
                  backgroundColor: "#FF3D71",
                }}
              />
              <View style={{ flex: 1, backgroundColor: "#2D9CFF" }} />
            </View>
            {/* lightning marker rides the border between the two scores */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pkSpark,
                { left: pkBarAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) },
              ]}
            >
              <Text style={{ fontSize: 16 }}>⚡</Text>
            </Animated.View>
            <Text style={[styles.pkScoreTxt, { left: 10 }]}>⭐ {shownMy}</Text>
            <Text style={[styles.pkScoreTxt, { right: 10 }]}>{shownOpp} ⭐</Text>
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
                <RtcSurfaceView style={{ flex: 1 }} canvas={{ uid: remoteUsers[0] }} />
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

            {/* VS badge on the seam between the two videos */}
            <View pointerEvents="none" style={styles.pkVsBadge}>
              <Text style={styles.pkVsBadgeTxt}>VS</Text>
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

      {/* ================= TOP HEADER ================= */}
      <SafeAreaView edges={[]} style={styles.topHeader}>
        <View style={styles.hostBadge}>
          <TouchableOpacity activeOpacity={0.85} onPress={openHostCard} style={styles.hostAvatarContainer}>
            <Image source={{ uri: hostImg }} style={styles.hostAvatarImg} />
            {hostLevel >= 10 && levelFrame && <Image source={levelFrame} style={styles.hostLevelFrame} />}
          </TouchableOpacity>

          <View style={{ marginLeft: 10 }}>
            <View style={styles.nameRow}>
              <Text style={styles.hostNameText} numberOfLines={1}>
                {hostName}
              </Text>

              {hostVerified && (
                <View style={styles.verifiedBadge}>
                  <MaterialCommunityIcons
                    name="check-decagram"
                    size={16}
                    color={hostVerifiedColor === "yellow" ? "#FFD700" : "#ffffff"}
                  />
                </View>
              )}

              <View
                style={[styles.levelBadge, { backgroundColor: levelTheme.bg, borderColor: levelTheme.border }]}
              >
                <MaterialCommunityIcons name="diamond-stone" size={10} color={levelTheme.icon} />
                <Text style={[styles.levelText, { color: levelTheme.text }]}>LV {hostLevel}</Text>
              </View>
            </View>

            <View style={styles.viewRow}>
              <Ionicons name="videocam" size={13} color="#fff" />
              <Text style={styles.viewsText}>{viewerCount} views</Text>

              <View style={styles.liveTag}>
                <Animated.View style={[styles.liveDot, { opacity: dotPulse }]} />
                <LiveTimer startTime={roomStartTime} />
              </View>

              {hostMicMuted && (
                <Ionicons name="mic-off" size={13} color="#fff" style={{ marginLeft: 8 }} />
              )}
              {netQuality > 0 && (
                <Ionicons
                  name="cellular"
                  size={13}
                  color={netQuality >= 4 ? "#FF5252" : netQuality === 3 ? "#FFC107" : "#69F0AE"}
                  style={{ marginLeft: 8 }}
                />
              )}
            </View>

            <View style={[styles.viewRow, { marginTop: 3 }]}>
              <Text style={styles.starsText}>⭐ {hostStars}</Text>
              <Text style={[styles.starsText, { color: "#FF6B9D", marginLeft: 8 }]}>❤ {roomLikes}</Text>
              {!isHost && !!hostId && hostId !== currentUid && (
                <TouchableOpacity
                  onPress={toggleFollowHost}
                  disabled={followBusy}
                  style={[styles.followPill, isFollowing && styles.followPillOn]}
                >
                  <Text style={styles.followTxt}>{isFollowing ? "Following" : "+ Follow"}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity style={styles.rankRow} activeOpacity={0.8} onPress={() => setRankVisible(true)}>
            {top3Gifters.length === 0 ? (
              <Text style={{ fontSize: 16 }}>🏆</Text>
            ) : (
              top3Gifters.map((g: any, i: number) => (
                <Image
                  key={g.uid}
                  source={{ uri: g.img || STABLE_AVATAR }}
                  style={[
                    styles.rankAva,
                    { marginLeft: i === 0 ? 0 : -9, borderColor: ["#FFD700", "#C0C0C0", "#CD7F32"][i] },
                  ]}
                />
              ))
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.viewerCount, { marginLeft: 6 }]} onPress={() => setViewerListVisible(true)}>
            <Text style={styles.viewerCountText}>{viewerCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.viewerCount, { marginLeft: 6 }]} onPress={() => setExitModalVisible(true)}>
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

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
      {isHost && pkInvited && (
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
        data={chatMessages}
        keyExtractor={chatKeyExtractor}
        renderItem={renderChat}
        ListHeaderComponent={
          <View style={styles.welcomeBox}>
            <Text style={styles.welcomeTxt}>
              📢 Welcome to the live! Be kind and respectful. Abuse, nudity, spam and scams are not allowed.
            </Text>
          </View>
        }
        style={[styles.chatArea, { bottom: 96 + keyboardHeight }]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews={Platform.OS === "android"}
      />

      {/* ================= FLOATING HEARTS ================= */}
      <View pointerEvents="none" style={[styles.heartsLayer, { bottom: 96 + keyboardHeight }]}>
        {hearts.map((h) => (
          <FloatingHeart key={h.id} id={h.id} x={h.x} emoji={h.emoji} color={h.color} onDone={removeHeart} />
        ))}
      </View>

      {/* ================= RIGHT TOOL COLUMN ================= */}
      <View style={[styles.toolCol, { bottom: 104 + keyboardHeight }]}>
        {isHost ? (
          <>
            <ToolBtn
              label="Flip"
              onPress={flipCamera}
              icon={<Ionicons name="camera-reverse-outline" size={22} color="#fff" />}
            />
            <ToolBtn
              label={filterLabel}
              active={filterId !== "off"}
              onPress={() => setFilterModalVisible(true)}
              icon={<MaterialCommunityIcons name="face-woman-shimmer-outline" size={22} color="#fff" />}
            />
            <ToolBtn
              label={micMuted ? "Unmute" : "Mute"}
              active={micMuted}
              onPress={toggleMic}
              icon={<Ionicons name={micMuted ? "mic-off" : "mic"} size={22} color="#fff" />}
            />
            <ToolBtn
              label={videoOff ? "Play" : "Pause"}
              active={videoOff}
              onPress={toggleVideo}
              icon={<Ionicons name={videoOff ? "play" : "pause"} size={22} color="#fff" />}
            />
            <ToolBtn
              label={pkActive ? "End PK" : pkInvited ? "Cancel" : "PK"}
              active={pkActive || pkInvited}
              badge={showInvite}
              onPress={onPkButton}
              icon={<Text style={styles.pkBtnTxt}>PK</Text>}
            />
            <ToolBtn
              label="Setup"
              active={!!pinnedText || chatLocked}
              onPress={openSettings}
              icon={<Ionicons name="settings-outline" size={22} color="#fff" />}
            />
          </>
        ) : (
          <>
            <ToolBtn label="Like" onPress={sendLike} icon={<Text style={{ fontSize: 22 }}>❤️</Text>} />
            <ToolBtn
              label={soundMuted ? "Sound off" : "Sound"}
              active={soundMuted}
              onPress={toggleSound}
              icon={<Ionicons name={soundMuted ? "volume-mute" : "volume-high"} size={22} color="#fff" />}
            />
          </>
        )}
      </View>

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
        <View style={styles.inputBox}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TextInput
              style={[styles.inputStyle, { flex: 1 }]}
              placeholder={
                amMuted && !isMod ? "You are muted" : chatLocked && !isMod ? "Chat is off" : "Say something..."
              }
              placeholderTextColor="#aaa"
              value={chatMessage}
              onChangeText={setChatMessage}
              onSubmitEditing={handleSendChat}
              returnKeyType="send"
              maxLength={200}
              editable={isMod || (!amMuted && !chatLocked)}
            />
            <TouchableOpacity onPress={() => setEmojiOpen((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 20 }}>😊</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.circleBtn} onPress={handleShare}>
          <Ionicons name="share-social" size={20} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.circleBtn} onPress={() => setViewerListVisible(true)}>
          <Ionicons name="people-outline" size={22} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.giftCircle} onPress={openGiftModal}>
          <LottieView
            source={require("../assets/animations/giftButton.json")}
            autoPlay
            loop
            style={{ width: 46, height: 46 }}
          />
        </TouchableOpacity>
      </KeyboardAvoidingView>

      {emojiOpen && (
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

      {joinBanner && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: height * 0.44,
            left: 10,
            zIndex: 99997,
            elevation: 99997,
            flexDirection: "row",
            alignItems: "center",
            paddingLeft: 5,
            paddingRight: 18,
            paddingVertical: 5,
            borderRadius: 30,
            backgroundColor: joinBanner.level >= 30 ? "rgba(70,10,140,0.9)" : "rgba(0,0,0,0.6)",
            borderWidth: joinBanner.level >= 30 ? 3 : 2,
            borderColor: joinBanner.level >= 30 ? getLevelTheme(joinBanner.level).border : "rgba(255,255,255,0.85)",
            maxWidth: width * 0.8,
            transform: [{ translateX: joinAnim }],
          }}
        >
          <View style={{ width: 44, height: 44, justifyContent: "center", alignItems: "center" }}>
            <Image
              source={{ uri: joinBanner.userImg || STABLE_AVATAR }}
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#2a2b38" }}
            />
            {joinBanner.level >= 10 && getLevelFrame(joinBanner.level) && (
              <Image
                source={getLevelFrame(joinBanner.level)}
                style={{ position: "absolute", width: 50, height: 50, resizeMode: "contain" }}
              />
            )}
          </View>
          <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "bold", fontSize: 16, marginLeft: 8, flexShrink: 1 }}>
            {joinBanner.senderName}
          </Text>
          {joinBanner.verified && (
            <MaterialCommunityIcons
              name="check-decagram"
              size={16}
              color={joinBanner.verifiedColor === "yellow" ? "#FFD700" : "#4FC3F7"}
              style={{ marginLeft: 3 }}
            />
          )}
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16, marginLeft: 6 }}>
            {joinBanner.level >= 30 ? "✨ entered the live" : "joined"}
          </Text>
        </Animated.View>
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

      {/* ================= GIFT MODAL ================= */}
      <Modal
        visible={giftModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGiftModalVisible(false)}
      >
        <View style={styles.giftOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setGiftModalVisible(false)} />

          <Animated.View style={[styles.giftSheet, { transform: [{ translateY: giftModalAnim }] }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
              <Text style={styles.giftTitle}>🎁 Send Gifts</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ fontSize: 24 }}>⭐</Text>
                <Text style={{ color: "#fff", fontSize: 20, fontWeight: "bold", marginLeft: 5 }}>{stars}</Text>
                <TouchableOpacity style={styles.rechargeBtn} onPress={goRecharge}>
                  <Text style={styles.rechargeTxt}>+ Recharge</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* who receives the gift */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 15 }}
              contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 10 }}
            >
              {giftUsers.map((user) => (
                <TouchableOpacity
                  key={user.uid}
                  onPress={() => setSelectedGiftUser(user.uid)}
                  style={{ alignItems: "center", marginRight: 12 }}
                >
                  <Image
                    source={{ uri: user.img || STABLE_AVATAR }}
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 25,
                      borderWidth: selectedGiftUser === user.uid ? 3 : 1,
                      borderColor: selectedGiftUser === user.uid ? "#ff1493" : "#555",
                    }}
                  />
                  <Text
                    style={{ color: "#fff", fontSize: 10, width: 65, textAlign: "center", marginTop: 4 }}
                    numberOfLines={1}
                  >
                    {user.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* quantity */}
            <View style={styles.qtyRow}>
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

            {/* gift pages (6 per page) */}
            <View style={styles.giftGrid}>
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
                {Array.from({ length: Math.ceil(gifts.length / 6) }).map((_, pageIndex) => (
                  <View
                    key={pageIndex}
                    style={{
                      width: width - 40,
                      flexDirection: "row",
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                      paddingHorizontal: 5,
                    }}
                  >
                    {gifts.slice(pageIndex * 6, pageIndex * 6 + 6).map((item: any) => (
                      <TouchableOpacity key={item.id} style={styles.giftCard} onPress={() => handleSendGift(item)}>
                        <Image source={item.icon} style={{ width: 45, height: 45, resizeMode: "contain" }} />
                        <Text style={styles.giftName}>{item.name}</Text>
                        <Text style={styles.giftCoin}>{Number(item.price || 0) * giftQty}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* ================= VIEWER LIST ================= */}
      <Modal transparent visible={viewerListVisible} animationType="slide" onRequestClose={() => setViewerListVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setViewerListVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { height: height * 0.6 }]}>
            <Text style={styles.sheetTitle}>👥 Viewers ({viewerCount})</Text>
            <Text style={styles.sheetSub}>Tap a person to see their profile.</Text>
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
                      <Ionicons name="chevron-forward" size={18} color="#6b7280" />
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
                  {Number(profileCard.level) >= 10 && getLevelFrame(Number(profileCard.level)) && (
                    <Image
                      source={getLevelFrame(Number(profileCard.level))}
                      style={{ position: "absolute", width: 110, height: 110, resizeMode: "contain" }}
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

              <TouchableOpacity style={styles.saveBtn} onPress={saveSettings}>
                <Text style={styles.saveBtnTxt}>Save</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ================= HOST: LIVE SUMMARY ================= */}
      <Modal transparent visible={!!summary} animationType="fade" onRequestClose={doLeaveNow}>
        <View style={styles.summaryBg}>
          <Text style={styles.sumTitle}>Live Ended</Text>
          <Text style={styles.sumSub}>Here is how your live went</Text>

          <View style={styles.sumGrid}>
            {[
              { k: "Duration", v: fmtDur(summary?.durationMs || 0), i: "⏱" },
              { k: "Peak viewers", v: String(summary?.peak || 0), i: "👥" },
              { k: "Stars earned", v: String(summary?.stars || 0), i: "⭐" },
              { k: "Likes", v: String(summary?.likes || 0), i: "❤️" },
              { k: "New followers", v: String(summary?.followers || 0), i: "➕" },
            ].map((c) => (
              <View key={c.k} style={styles.sumCard}>
                <Text style={{ fontSize: 22 }}>{c.i}</Text>
                <Text style={styles.sumVal}>{c.v}</Text>
                <Text style={styles.sumKey}>{c.k}</Text>
              </View>
            ))}
          </View>

          {!!summary?.gifters?.length && (
            <View style={{ width: "88%", marginTop: 18 }}>
              <Text style={[styles.sumSub, { textAlign: "left", marginBottom: 8 }]}>Top gifters</Text>
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

          <TouchableOpacity style={styles.sumDone} onPress={doLeaveNow}>
            <Text style={styles.saveBtnTxt}>Done</Text>
          </TouchableOpacity>
        </View>
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

      {/* ================= PK: CHOOSE OPPONENT (host) ================= */}
      <Modal
        transparent
        visible={pkListVisible}
        animationType="slide"
        onRequestClose={() => setPkListVisible(false)}
      >
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setPkListVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { minHeight: height * 0.4 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.sheetTitle}>PK Battle</Text>
              <TouchableOpacity onPress={openPkList}>
                <Ionicons name="refresh" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetSub}>Pick the battle length, then challenge a live host.</Text>
            <View style={{ flexDirection: "row", marginBottom: 6 }}>
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

            {pkLoading ? (
              <ActivityIndicator color="#F71084" style={{ marginTop: 30 }} />
            ) : pkCandidates.length === 0 ? (
              <Text style={styles.emptyTxt}>No other host is live right now.</Text>
            ) : (
              <FlatList
                data={pkCandidates}
                keyExtractor={(i) => i.id}
                renderItem={({ item }) => (
                  <View style={styles.pkRow}>
                    <Image source={{ uri: item.img }} style={styles.pkRowAva} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.pkRowName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {!!item.title && (
                        <Text style={styles.pkRowSub} numberOfLines={1}>
                          {item.title}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={[styles.pkInviteBtn, pkBusy && { opacity: 0.5 }]}
                      disabled={pkBusy}
                      onPress={() => sendPkInvite(item)}
                    >
                      <Text style={styles.pkInviteTxt}>Invite</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
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
    top: 30,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  hostBadge: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  hostAvatarContainer: { position: "relative", justifyContent: "center", alignItems: "center" },
  hostAvatarImg: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: "#fff" },
  hostLevelFrame: { position: "absolute", width: 64, height: 64, resizeMode: "contain" },

  nameRow: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  hostNameText: { color: "#fff", fontSize: 15, fontWeight: "800", maxWidth: 130 },
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

  /* CHAT */
  chatArea: {
    position: "absolute",
    left: 0,
    right: 64,
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
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
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
    height: 28,
    justifyContent: "center",
  },
  pkBar: { flexDirection: "row", height: 28, overflow: "hidden" },
  pkScoreTxt: {
    position: "absolute",
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
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
    bottom: 6,
    maxWidth: "80%",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pkNameTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
  pkTimerPill: {
    position: "absolute",
    top: 6,
    alignSelf: "center",
    left: width / 2 - 34,
    width: 68,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    paddingVertical: 3,
  },
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
    top: 112,
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
    top: 100,
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
    maxHeight: height * 0.7,
    minHeight: height * 0.5,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 25,
    paddingHorizontal: 20,
    paddingBottom: 35,
  },
  giftTitle: { color: "#fff", fontSize: 22, fontWeight: "bold" },
  giftGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  giftCard: {
    width: "30%",
    backgroundColor: "#1C1E2E",
    borderRadius: 10,
    padding: 5,
    marginBottom: 20,
    alignItems: "center",
  },
  giftName: { color: "#fff", fontSize: 10, marginTop: 0 },
  giftCoin: { color: "#999", fontSize: 13, marginTop: 5 },

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
  pkSupRow: { position: "absolute", top: 6, flexDirection: "row", alignItems: "center" },
  pkSupAva: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, backgroundColor: "#2a2b38" },
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
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
    alignSelf: "flex-start",
    maxWidth: "92%",
  },
  welcomeTxt: { color: "#FFD27A", fontSize: 11, fontWeight: "600" },

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
});
