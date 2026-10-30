// MultiGuestRoom.js  -> route: /MultiGuestRoom   (params: id)
// VIDEO multi-guest room: host + 8 guests, sab video par baat kar sakte hain.
// VideoLive.tsx ke saare features yahan bhi hain:
//  • Real Agora video/audio (seat par baithte hi camera + mic publish)
//  • Gift box (stars wallet, animation, combo banner, gift chat line, top gifters, agency stars)
//  • Chat + join line + join banner, emoji, bad-word filter, anti-spam
//  • Share, Sound mute, Like hearts, Beauty filters, Flip camera
//  • Guest: apna mic mute / camera off (face na dikhe) / seat chhodo
//  • Host / Mod: kisi guest ko mute, seat se hatana, live se kick, moderator banana
//  • Viewers list, Top gifters, profile card + follow, report, host setup (title / pin / chat lock)
//  • Host exit par live summary
import React, {
  forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import {
  ActivityIndicator, Alert, Animated, AppState, BackHandler, Dimensions, Easing, FlatList, Image,
  Keyboard, KeyboardAvoidingView, Modal, PermissionsAndroid, Platform, SafeAreaView, ScrollView,
  Share, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import LottieView from 'lottie-react-native';
import { WebView } from 'react-native-webview';
import {
  addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, increment, limit, onSnapshot,
  orderBy, query, runTransaction, setDoc, updateDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import {
  createAgoraRtcEngine, ChannelProfileType, ClientRoleType, RtcTextureView,
} from 'react-native-agora';

import { notifyNewFollower } from '../utils/pushNotify';
import { callApi } from '../utils/api';
import { useLiveBanGuard } from '../utils/liveBan';
import { useBlockedIds } from '../utils/useBlockedIds';
import { gifts } from '../assets/giftsData';
import { giftHtml } from '../assets/giftWeb';
import LevelFrame, { getSpecialKey } from '../components/LevelFrame';
import JoinEntry from '../components/live/JoinEntry';
import UserTick from '../components/UserTick';

let db = null;
let auth = null;
try {
  const fb = require('./firebaseConfig');
  db = fb.db;
  auth = fb.auth;
} catch (e) {
  try {
    const fb2 = require('../firebaseConfig');
    db = fb2.db;
    auth = fb2.auth;
  } catch (err) {
    console.log('Firebase config not found (MultiGuestRoom).');
  }
}

const { width, height } = Dimensions.get('window');
const TILE_W = width / 3;
const TILE_H = Math.round(TILE_W * 1.02);
const DEFAULT_AVATAR = 'https://avatar.iran.liara.run/public/65';
const YELLOW = '#fff200';
const SEAT_KEYS = Array.from({ length: 9 }, (_, i) => `seat_${i + 1}`);
const EMPTY_SEAT = {
  userId: null, userName: null, userImg: null, isMuted: false, isCamOff: false, hostMuted: false,
  agoraUid: null, roleTag: null, score: 0, gifters: {}, verified: false, level: 1, at: 0,
};

const AGORA_APP_ID = 'f75d0020d44345edb12bbf6847ef3d38';
const TOKEN_ENDPOINT = 'https://topking-backend.onrender.com/token';
const HEARTBEAT_INTERVAL = 8000;
const SEAT_JOIN_GRACE_MS = 25000; // host: seat par baitha banda channel me nahi aaya to seat khali
const WEEKLY_TARGET_MIN = 30;
const JOIN_ANIM_VARIANT = 'auto';
const RECHARGE_ROUTE = '/recharge';
const GIFT_QTY = [1, 10, 66, 99];
const QUICK_EMOJIS = ['😂', '😍', '🔥', '👏', '🥰', '😮', '🎉', '💯'];
const BAD_WORDS = ['fuck', 'bitch', 'sex', 'porn', 'madarchod', 'bhosdi', 'chutiya', 'randi', 'gaand', 'lund'];
const REPORT_REASONS = ['Nudity / sexual content', 'Abuse / harassment', 'Spam / scam', 'Underage user', 'Other'];
const WELCOME_TEXT =
  'Welcome to TopKing Live, where you can interact with hosts and other viewers in real time. '
  + 'Please abide by our community guidelines to help us maintain a good community environment';

// Har tile chhoti hai -> chhota stream (sab ke liye data bachat)
const SEAT_VIDEO_PROFILE = {
  dimensions: { width: 360, height: 480 },
  frameRate: 15,
  bitrate: 450,
  minBitrate: 150,
  orientationMode: 2,
  degradationPreference: 1,
};

const FILTERS = [
  { id: 'off', label: 'Original', icon: '🚫', beauty: null, color: null },
  { id: 'natural', label: 'Natural', icon: '🌿', beauty: { lighteningContrastLevel: 1, lighteningLevel: 0.4, smoothnessLevel: 0.4, rednessLevel: 0.2, sharpnessLevel: 0.2 }, color: null },
  { id: 'smooth', label: 'Smooth', icon: '✨', beauty: { lighteningContrastLevel: 1, lighteningLevel: 0.3, smoothnessLevel: 0.85, rednessLevel: 0.15, sharpnessLevel: 0.1 }, color: null },
  { id: 'bright', label: 'Bright', icon: '☀️', beauty: { lighteningContrastLevel: 2, lighteningLevel: 0.75, smoothnessLevel: 0.35, rednessLevel: 0.1, sharpnessLevel: 0.2 }, color: { strengthLevel: 0.4, skinProtectLevel: 1 } },
  { id: 'rosy', label: 'Rosy', icon: '🌸', beauty: { lighteningContrastLevel: 1, lighteningLevel: 0.45, smoothnessLevel: 0.5, rednessLevel: 0.75, sharpnessLevel: 0.1 }, color: null },
  { id: 'vivid', label: 'Vivid', icon: '🎨', beauty: null, color: { strengthLevel: 0.85, skinProtectLevel: 0.8 } },
];

// ---- helpers ----
const fmt = (n = 0) => {
  n = Number(n) || 0;
  return n >= 1000000 ? (n / 1000000).toFixed(1).replace('.0', '') + 'M'
    : n >= 100000 ? Math.round(n / 1000) + 'K' : String(n);
};
const isVerified = (v) => v === true || v === 'true';
const normTickColor = (c) => (c === 'yellow' ? 'yellow' : 'white');
const cleanVerified = (o) => {
  if (!o) return o;
  const ok = isVerified(o.verified);
  const out = { ...o, verified: ok };
  if (ok) out.verifiedColor = o.verifiedColor === 'yellow' ? 'yellow' : 'white';
  else delete out.verifiedColor;
  return out;
};
const cleanText = (t) => {
  let out = t;
  BAD_WORDS.forEach((w) => { out = out.replace(new RegExp(w, 'gi'), '*'.repeat(w.length)); });
  return out;
};
const fmtDur = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
const getLevelTheme = (level = 1) => {
  if (level >= 50) return { bg: '#7B1FFF', border: '#FFD700', text: '#fff', icon: '#FFD700' };
  if (level >= 40) return { bg: '#00BFFF', border: '#9EF8FF', text: '#fff', icon: '#fff' };
  if (level >= 30) return { bg: '#FF0066', border: '#FFB6C1', text: '#fff', icon: '#fff' };
  if (level >= 20) return { bg: '#FFC107', border: '#FFE082', text: '#000', icon: '#fff' };
  if (level >= 10) return { bg: '#BDBDBD', border: '#fff', text: '#fff', icon: '#fff' };
  return { bg: '#222', border: '#555', text: '#FFD700', icon: '#00E5FF' };
};
const topGifterImgs = (g) =>
  Object.values(g || {})
    .filter((x) => x && Number(x.stars) > 0)
    .sort((a, b) => Number(b.stars) - Number(a.stars))
    .slice(0, 3)
    .map((x) => x.img);
const uidToAgora = (uid) => {
  if (!uid) return 1;
  let h = 7;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) % 1000000007;
  return (h % 900000000) + 1000;
};

// ---------- Agora token (VideoLive jaisa: retry + warm up) ----------
const TOKEN_TIMEOUT_MS = 25000;
const TOKEN_RETRIES = 3;
const warmUpBackend = () => {
  fetch(TOKEN_ENDPOINT.replace(/\/token$/, '/'), { method: 'GET' }).catch(() => {});
};
const fetchAgoraTokenOnce = async (channel, uid) => {
  const firebaseUser = auth?.currentUser;
  if (!firebaseUser) return { token: null, uid };
  const idToken = await firebaseUser.getIdToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${TOKEN_ENDPOINT}?channel=${encodeURIComponent(channel)}&uid=${uid}`,
      { headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json' }, signal: controller.signal }
    );
    const tokenData = await response.json();
    if (response.ok && tokenData?.success && tokenData?.token) {
      return { token: tokenData.token, uid: Number(tokenData.uid) || uid };
    }
    throw new Error('token response not ok');
  } finally {
    clearTimeout(timeoutId);
  }
};
const fetchAgoraToken = async (channel, uid, isCancelled = () => false, onRetry) => {
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
  return { token: null, uid };
};

// ------------------------------------------------------------------
// AGORA ENGINE HOOK
//  - sab log channel me audience ki tarah aate hain (sab ka video/audio subscribe)
//  - seat par baithte hi broadcaster ban kar camera + mic publish
// ------------------------------------------------------------------
const useAgoraRoom = ({ roomId, myUid, publishing, micOn, camOn, soundMuted, onPublishError }) => {
  const engineRef = useRef(null);
  const baseUid = useMemo(() => uidToAgora(myUid), [myUid]);
  const [activeUid, setActiveUid] = useState(null);
  const myAgoraUid = activeUid || baseUid;
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Connecting...');
  const [retryKey, setRetryKey] = useState(0);
  const [remoteVideoOn, setRemoteVideoOn] = useState({});
  const [speaking, setSpeaking] = useState(() => new Set());
  const [netQuality, setNetQuality] = useState(0);
  const remoteUsersRef = useRef([]);
  const publishingRef = useRef(false);
  const speakSigRef = useRef('');
  const errRef = useRef(onPublishError);
  errRef.current = onPublishError;

  useEffect(() => {
    if (!roomId || !myUid) return undefined;
    let mounted = true;
    let engine = null;
    let mainLive = false;
    let rejoinCount = 0;
    let joinTimer = null;
    let numericUid = baseUid;

    const isCancelled = () => !mounted;
    const setSt = (v) => { if (mounted) setStatus(v); };
    const clearJoinTimer = () => { if (joinTimer) { clearTimeout(joinTimer); joinTimer = null; } };

    const getTokenAndJoin = async () => {
      if (!mounted || !engine) return;
      setSt('Connecting...');
      const res = await fetchAgoraToken(roomId, numericUid, isCancelled, () => setSt('Waking up server...'));
      if (!mounted || !engine) return;
      numericUid = res.uid || numericUid;
      if (mounted) setActiveUid(numericUid);
      clearJoinTimer();
      joinTimer = setTimeout(() => {
        if (!mounted) return;
        setStatus((cur) => (/^(Connecting|Reconnecting|Waking)/.test(cur) ? 'Failed: Could not reach the live server' : cur));
      }, 20000);
      const ret = engine.joinChannel(res.token || '', roomId, numericUid, {
        channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
        clientRoleType: ClientRoleType.ClientRoleAudience,
        publishCameraTrack: false,
        publishMicrophoneTrack: false,
        autoSubscribeAudio: true,
        autoSubscribeVideo: true,
      });
      if (typeof ret === 'number' && ret < 0) console.log('AGORA joinChannel returned', ret);
    };

    const renewToken = async () => {
      const res = await fetchAgoraToken(roomId, numericUid, isCancelled);
      if (res.token && mounted && engine) {
        try { engine.renewToken(res.token); } catch (e) { console.log('RENEW TOKEN ERROR:', e); }
      }
    };

    const rejoin = () => {
      if (!mounted || !engine || rejoinCount >= 2) return false;
      rejoinCount++;
      setSt('Reconnecting...');
      try { engine.leaveChannel(); } catch (_) {}
      getTokenAndJoin();
      return true;
    };

    (async () => {
      try {
        warmUpBackend();
        engine = createAgoraRtcEngine();
        engine.initialize({ appId: AGORA_APP_ID, channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting });
        engineRef.current = engine;

        engine.registerEventHandler({
          onJoinChannelSuccess: (connection) => {
            if (connection?.channelId && connection.channelId !== roomId) return;
            mainLive = true;
            clearJoinTimer();
            setSt('Live');
          },
          onUserJoined: (_c, uid) => {
            if (!mounted) return;
            if (!remoteUsersRef.current.includes(uid)) remoteUsersRef.current = [...remoteUsersRef.current, uid];
          },
          onRemoteVideoStateChanged: (_c, uid, state) => {
            if (!mounted) return;
            if (state === 1 || state === 2) setRemoteVideoOn((p) => (p[uid] ? p : { ...p, [uid]: true }));
            else if (state === 0 || state === 4) setRemoteVideoOn((p) => (p[uid] === false ? p : { ...p, [uid]: false }));
          },
          onUserOffline: (_c, uid) => {
            if (!mounted) return;
            remoteUsersRef.current = remoteUsersRef.current.filter((x) => x !== uid);
            setRemoteVideoOn((p) => {
              if (!(uid in p)) return p;
              const n = { ...p };
              delete n[uid];
              return n;
            });
          },
          onAudioVolumeIndication: (_c, speakers) => {
            if (!mounted) return;
            const ids = (speakers || [])
              .filter((s) => Number(s.volume) > 25)
              .map((s) => (s.uid === 0 ? numericUid : s.uid))
              .sort();
            const sig = ids.join(',');
            if (sig === speakSigRef.current) return;
            speakSigRef.current = sig;
            setSpeaking(new Set(ids));
          },
          onConnectionStateChanged: (_c, _state, reason) => {
            if (!mounted) return;
            if (reason === 8 || reason === 9) { if (mainLive) renewToken(); else rejoin(); }
          },
          onTokenPrivilegeWillExpire: () => renewToken(),
          onRequestToken: () => renewToken(),
          onError: (err, msg) => {
            console.log('Agora Error:', err, msg);
            if (!mounted) return;
            if (err === 109 || err === 110) {
              if (mainLive) { renewToken(); return; }
              if (rejoin()) return;
            }
            clearJoinTimer();
            setSt(`Failed: Agora error ${err}`);
          },
          onNetworkQuality: (_c, remoteUid, tx, rx) => {
            if (!mounted || remoteUid !== 0) return;
            const q = Math.max(Number(tx) || 0, Number(rx) || 0);
            if (q > 0) setNetQuality(q);
          },
        });

        await engine.enableVideo();
        await engine.enableAudio();
        if (!mounted) return;
        try { engine.setRemoteSubscribeFallbackOption(1); } catch (_) {}
        try { engine.enableDualStreamMode(true); } catch (_) {}
        try { engine.setVideoEncoderConfiguration(SEAT_VIDEO_PROFILE); } catch (_) {}
        try { engine.enableAudioVolumeIndication(400, 3, true); } catch (_) {}
        await engine.setClientRole(ClientRoleType.ClientRoleAudience);
        if (!mounted) return;
        await getTokenAndJoin();
        if (mounted) setReady(true);
      } catch (e) {
        console.log('MULTI ROOM AGORA INIT ERROR:', e?.message || e);
        setSt(`Failed: ${e?.message || e}`);
      }
    })();

    return () => {
      mounted = false;
      clearJoinTimer();
      const eng = engineRef.current || engine;
      if (eng) {
        try { eng.stopPreview(); } catch (_) {}
        try { eng.leaveChannel(); } catch (_) {}
        try { eng.release(); } catch (_) {}
      }
      engineRef.current = null;
      publishingRef.current = false;
      remoteUsersRef.current = [];
      setReady(false);
      setRemoteVideoOn({});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myUid, retryKey]);

  // seat par baitha -> publish; utra -> audience; mic/camera switches yahin lagte hain
  useEffect(() => {
    const engine = engineRef.current;
    if (!ready || !engine) return;
    let cancelled = false;
    (async () => {
      try {
        if (publishing) {
          if (!publishingRef.current) {
            if (Platform.OS === 'android') {
              const perms = [PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
              const granted = await PermissionsAndroid.requestMultiple(perms);
              if (cancelled) return;
              if (
                granted[PermissionsAndroid.PERMISSIONS.CAMERA] !== PermissionsAndroid.RESULTS.GRANTED ||
                granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] !== PermissionsAndroid.RESULTS.GRANTED
              ) {
                publishingRef.current = false;
                throw new Error('Camera / mic permission denied');
              }
            }
            engine.enableAudio();
            engine.enableLocalVideo(true);
            try { engine.setVideoEncoderConfiguration(SEAT_VIDEO_PROFILE); } catch (_) {}
            engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
            engine.updateChannelMediaOptions({
              clientRoleType: ClientRoleType.ClientRoleBroadcaster,
              publishCameraTrack: true,
              publishMicrophoneTrack: true,
              autoSubscribeAudio: true,
              autoSubscribeVideo: true,
            });
            engine.startPreview();
            publishingRef.current = true;
          }
          engine.muteLocalAudioStream(!micOn);
          try {
            engine.enableLocalVideo(!!camOn);
            if (camOn) engine.startPreview();
          } catch (_) {}
          engine.muteLocalVideoStream(!camOn);
        } else if (publishingRef.current) {
          publishingRef.current = false;
          try { engine.stopPreview(); } catch (_) {}
          try {
            engine.updateChannelMediaOptions({
              clientRoleType: ClientRoleType.ClientRoleAudience,
              publishCameraTrack: false,
              publishMicrophoneTrack: false,
            });
          } catch (_) {}
          try { engine.setClientRole(ClientRoleType.ClientRoleAudience); } catch (_) {}
        }
      } catch (e) {
        console.log('PUBLISH ERROR:', e?.message || e);
        errRef.current && errRef.current(e?.message || 'Camera / mic could not start.');
      }
    })();
    return () => { cancelled = true; };
  }, [ready, publishing, micOn, camOn]);

  // room ki awaaz mute (sirf apne phone par)
  useEffect(() => {
    const engine = engineRef.current;
    if (!ready || !engine) return;
    try { engine.muteAllRemoteAudioStreams(!!soundMuted); } catch (_) {}
  }, [ready, soundMuted]);

  const flip = useCallback(() => {
    try { engineRef.current?.switchCamera(); } catch (e) { console.log('FLIP ERROR:', e); }
  }, []);

  const applyBeauty = useCallback((f) => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      if (f.beauty) engine.setBeautyEffectOptions(true, f.beauty);
      else engine.setBeautyEffectOptions(false, { lighteningContrastLevel: 1, lighteningLevel: 0, smoothnessLevel: 0, rednessLevel: 0, sharpnessLevel: 0 });
    } catch (e) { console.log('BEAUTY ERROR:', e); }
    try {
      if (engine.setColorEnhanceOptions) {
        if (f.color) engine.setColorEnhanceOptions(true, f.color);
        else engine.setColorEnhanceOptions(false, { strengthLevel: 0, skinProtectLevel: 1 });
      }
    } catch (e) { console.log('COLOR ENHANCE ERROR:', e); }
  }, []);

  const retry = useCallback(() => { setStatus('Connecting...'); setRetryKey((k) => k + 1); }, []);

  return { ready, status, retry, remoteVideoOn, speaking, netQuality, myAgoraUid, flip, applyBeauty, remoteUsersRef };
};

// ------------------------------------------------------------------
// SMALL COMPONENTS
// ------------------------------------------------------------------
const WeeklyMinutesPill = memo(({ startTime }) => {
  const [mins, setMins] = useState(0);
  useEffect(() => {
    if (!startTime) return undefined;
    const tick = () => setMins(Math.max(0, Math.floor((Date.now() - startTime) / 60000)));
    tick();
    const i = setInterval(tick, 15000);
    return () => clearInterval(i);
  }, [startTime]);
  const shown = Math.min(mins, WEEKLY_TARGET_MIN);
  return (
    <View style={styles.minPill}>
      <View style={[styles.minFill, { width: `${(shown / WEEKLY_TARGET_MIN) * 100}%` }]} />
      <Text style={styles.minTxt}>{shown}/{WEEKLY_TARGET_MIN} min</Text>
    </View>
  );
});

const GiftOverlay = memo(({ activeGift, playKey, onFinish }) => {
  const webSource = useMemo(
    () => (typeof activeGift === 'string' && activeGift.startsWith('web:')
      ? { html: giftHtml(activeGift.slice(4)), baseUrl: 'https://localhost' } : null),
    [activeGift]
  );
  if (!activeGift) return null;
  return (
    <View pointerEvents="none" style={styles.giftAnimWrap}>
      {webSource ? (
        <WebView
          key={playKey}
          source={webSource}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled={false}
          cacheEnabled
          overScrollMode="never"
          style={{ width, height: width * 1.3, backgroundColor: 'transparent' }}
          containerStyle={{ backgroundColor: 'transparent' }}
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
          hardwareAccelerationAndroid
          renderMode="HARDWARE"
          cacheComposition
          resizeMode="contain"
          onAnimationFinish={(cancelled) => { if (!cancelled) onFinish && onFinish(); }}
          style={{ width: 350, height: 350, backgroundColor: 'transparent' }}
        />
      )}
    </View>
  );
});

const HEART_COLORS = ['#FF3D71', '#FF6B9D', '#FFB300', '#00E5FF', '#B388FF', '#69F0AE'];
const FloatingHeart = memo(({ id, x, emoji, color, onDone }) => {
  const prog = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(prog, { toValue: 1, duration: 2200 + Math.random() * 600, useNativeDriver: true }).start(() => onDone(id));
  }, []);
  return (
    <Animated.Text
      pointerEvents="none"
      style={{
        position: 'absolute', bottom: 0, right: x, fontSize: 26, color,
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

const HeartsLayer = memo(forwardRef(({ bottom }, ref) => {
  const [hearts, setHearts] = useState([]);
  const idRef = useRef(0);
  const remove = useCallback((id) => setHearts((prev) => prev.filter((h) => h.id !== id)), []);
  useImperativeHandle(ref, () => ({
    spawn: (n) => {
      const faces = ['❤️', '💖', '💗', '💜', '🧡', '😍'];
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
  }), []);
  return (
    <View pointerEvents="none" style={[styles.heartsLayer, { bottom }]}>
      {hearts.map((h) => <FloatingHeart key={h.id} id={h.id} x={h.x} emoji={h.emoji} color={h.color} onDone={remove} />)}
    </View>
  );
}));

const ChatItem = memo(({ chat, onUser }) => {
  const theme = getLevelTheme(chat.level || 1);
  const openUser = () =>
    onUser && chat.senderId && onUser({
      uid: chat.senderId, name: chat.senderName, username: chat.username, img: chat.userImg,
      level: chat.level, verified: chat.verified, verifiedColor: chat.verifiedColor,
    });
  const tick = (size) => <UserTick uid={chat.senderId || chat.uid} verified={!!(chat.verified)} verifiedColor={chat?.verifiedColor} size={size} />;

  if (chat.type === 'join') {
    return (
      <View style={styles.sysRow}>
        <TouchableOpacity activeOpacity={0.8} onPress={openUser}>
          <Image source={{ uri: chat.userImg || DEFAULT_AVATAR }} style={styles.sysAva} />
          {(chat.level >= 10 || chat.special || !!chat.senderId) && (
            <LevelFrame level={chat.level} special={chat.special} uid={chat.senderId} animated style={styles.sysFrame} />
          )}
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginLeft: 6 }}>
          <Text style={styles.sysText}>{chat.senderName}</Text>
          {tick(15)}
          <View style={[styles.levelBadge, { marginLeft: 5, backgroundColor: theme.bg, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="diamond-stone" size={8} color={theme.icon} />
            <Text style={[styles.levelText, { color: theme.text }]}>LV {chat.level || 1}</Text>
          </View>
          <Text style={[styles.sysText, { marginLeft: 5 }]}>joined</Text>
        </View>
      </View>
    );
  }

  if (chat.type === 'gift') {
    const gd = gifts.find((g) => String(g.id) === String(chat.giftId));
    return (
      <View style={[styles.sysRow, { flexWrap: 'wrap' }]}>
        <TouchableOpacity activeOpacity={0.8} onPress={openUser}>
          <Image source={{ uri: chat.userImg || DEFAULT_AVATAR }} style={styles.sysAva} />
        </TouchableOpacity>
        <Text style={[styles.sysText, { marginLeft: 6 }]}>{chat.senderName}</Text>
        {tick(15)}
        <Text style={[styles.sysText, { marginLeft: 5 }]}>sent</Text>
        {gd?.icon ? (
          <Image source={gd.icon} style={{ width: 24, height: 24, resizeMode: 'contain', marginHorizontal: 4 }} />
        ) : (
          <Text style={{ color: '#00FFFF', fontWeight: 'bold', marginHorizontal: 4 }}>{chat.giftName}</Text>
        )}
        {chat.qty > 1 && <Text style={{ color: '#FFE600', fontWeight: 'bold', marginRight: 4 }}>x{chat.qty}</Text>}
        <Text style={styles.sysText}>to </Text>
        <Text style={{ color: '#FFE600', fontSize: 13, fontWeight: 'bold' }}>@{chat.receiverName}</Text>
      </View>
    );
  }

  return (
    <View style={styles.chatRow}>
      <TouchableOpacity activeOpacity={0.8} onPress={openUser} style={{ width: 38, height: 38, justifyContent: 'center', alignItems: 'center' }}>
        <Image source={{ uri: chat.userImg || DEFAULT_AVATAR }} style={styles.chatAva} />
        {(chat.level >= 10 || chat.special || !!chat.senderId) && (
          <LevelFrame level={chat.level} special={chat.special} uid={chat.senderId} animated style={styles.chatFrame} />
        )}
      </TouchableOpacity>
      <View style={styles.chatContent}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
          <Text style={styles.chatUser}>{chat.senderName}</Text>
          {tick(14)}
          <View style={[styles.levelBadge, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="diamond-stone" size={9} color={theme.icon} />
            <Text style={[styles.levelText, { color: theme.text }]}>LV {chat.level || 1}</Text>
            {chat.role === 'host' && <View style={[styles.roleTag, { backgroundColor: '#F71084' }]}><Text style={styles.roleTagTxt}>HOST</Text></View>}
            {chat.role === 'mod' && <View style={[styles.roleTag, { backgroundColor: '#2D9CFF' }]}><Text style={styles.roleTagTxt}>MOD</Text></View>}
          </View>
        </View>
        <View style={styles.bubble}><Text style={styles.chatMsg}>{chat.message}</Text></View>
      </View>
    </View>
  );
}, (prev, next) => prev.chat.id === next.chat.id && prev.onUser === next.onUser);

const chatKeyExtractor = (item, index) => item.id || String(index);

// ---- gift sheet pieces ----
const GIFTS_PER_PAGE = 8;
const GIFT_PAGE_W = width - 24;
const GIFT_PAGES = (() => {
  const pages = [];
  for (let i = 0; i < gifts.length; i += GIFTS_PER_PAGE) pages.push({ key: 'p' + i, items: gifts.slice(i, i + GIFTS_PER_PAGE) });
  return pages;
})();
const GiftCard = memo(({ item, qty, onSend }) => (
  <TouchableOpacity style={styles.giftCard} activeOpacity={0.7} onPress={() => onSend(item)}>
    <Image source={item.icon} style={{ width: 42, height: 42 }} resizeMode="contain" fadeDuration={0} />
    <Text style={styles.giftName} numberOfLines={1}>{item.name}</Text>
    <Text style={styles.giftCoin}>{Number(item.price || 0) * qty}</Text>
  </TouchableOpacity>
));
const GiftPage = memo(({ page, qty, onSend }) => (
  <View style={{ width: GIFT_PAGE_W, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
    {page.items.map((item) => <GiftCard key={item.id} item={item} qty={qty} onSend={onSend} />)}
  </View>
));

// ------------------------------------------------------------------
// TILE
// ------------------------------------------------------------------
const Tile = memo(function Tile({ index, seat, score, extraGifters, mine, speaking, showVideo, canvasUid, onPress }) {
  const taken = !!seat?.userId;
  const isHostTile = index === 0;
  const micOff = !!(seat?.isMuted || seat?.hostMuted);
  const gifters = index === 0 ? (extraGifters || []) : topGifterImgs(seat?.gifters);

  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.tile} onPress={onPress}>
      {taken && !showVideo ? (
        <>
          <Image source={{ uri: seat.userImg || DEFAULT_AVATAR }} style={styles.tileBlur} blurRadius={18} />
          <View style={styles.tileDim} />
        </>
      ) : null}

      {showVideo ? (
        <RtcTextureView style={StyleSheet.absoluteFill} canvas={{ uid: canvasUid }} />
      ) : taken ? (
        <View style={[styles.avatarWrap, speaking && styles.avatarSpeaking]}>
          <Image source={{ uri: seat.userImg || DEFAULT_AVATAR }} style={styles.avatarImg} />
        </View>
      ) : (
        <View style={styles.emptyWrap}>
          <Ionicons name="add" size={26} color="rgba(255,255,255,0.35)" />
        </View>
      )}

      {taken && speaking && showVideo ? <View style={styles.speakBorder} pointerEvents="none" /> : null}
      {mine ? <View style={styles.mineBorder} pointerEvents="none" /> : null}

      {isHostTile ? (
        <View style={styles.hostTag}><Text style={styles.hostTagText}>Host</Text></View>
      ) : (
        <Text style={styles.seatNo}>{index}</Text>
      )}

      {taken && micOff ? (
        <View style={[styles.micBadge, seat.hostMuted && { backgroundColor: '#ff4d6d' }]}>
          <Ionicons name="mic-off" size={11} color={seat.hostMuted ? '#fff' : '#000'} />
        </View>
      ) : null}
      {taken && seat.isCamOff ? (
        <View style={[styles.micBadge, { right: micOff ? 28 : 5, backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <Ionicons name="videocam-off" size={11} color="#fff" />
        </View>
      ) : null}

      {taken ? (
        <>
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']} style={styles.nameShade} pointerEvents="none" />
          <View style={styles.bottomInfo} pointerEvents="none">
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.nameText, { flexShrink: 1 }]} numberOfLines={1}>{seat.userName || 'User'}</Text>
                <UserTick uid={seat.userId || seat.uid} verified={!!(isVerified(seat.verified))} verifiedColor={seat.verifiedColor} size={11} />
              </View>
              <View style={styles.scoreRow}>
                <View style={styles.coinDot} />
                <Text style={styles.scoreText}>{fmt(score || 0)}</Text>
              </View>
            </View>
            <View style={styles.gifterRow}>
              {gifters.map((g, i) => (
                <Image key={i} source={{ uri: g || DEFAULT_AVATAR }} style={[styles.gifterImg, { marginLeft: i ? -6 : 0 }]} />
              ))}
            </View>
          </View>
        </>
      ) : null}
    </TouchableOpacity>
  );
});

const MenuItem = ({ icon, label, onPress, active, danger }) => (
  <TouchableOpacity style={styles.menuItem} activeOpacity={0.8} onPress={onPress}>
    <View style={[styles.menuIcon, active && styles.menuIconOn]}>{icon}</View>
    <Text style={[styles.menuLbl, danger && { color: '#ff4d6d' }]} numberOfLines={1}>{label}</Text>
  </TouchableOpacity>
);

// ------------------------------------------------------------------
// SCREEN
// ------------------------------------------------------------------
export default function MultiGuestRoom() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 0) + (Platform.OS === 'android' ? 10 : 8);
  const params = useLocalSearchParams();
  const roomId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const me = auth?.currentUser || null;
  const myUid = me?.uid || null;

  // ---------- room ----------
  const [room, setRoom] = useState(null);
  const roomRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const leftRef = useRef(false);
  const lastRoomSigRef = useRef('');
  const giftBaselineSetRef = useRef(false);
  const lastSeenGiftKeyRef = useRef('');

  // ---------- my profile ----------
  const [currentName, setCurrentName] = useState(me?.displayName || 'User');
  const [currentRealName, setCurrentRealName] = useState(me?.displayName || 'User');
  const [currentAvatar, setCurrentAvatar] = useState(me?.photoURL || DEFAULT_AVATAR);
  const [myLevel, setMyLevel] = useState(1);
  const [myVerified, setMyVerified] = useState(false);
  const [myVerifiedColor, setMyVerifiedColor] = useState('white');
  const [mySpecial, setMySpecial] = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const [stars, setStars] = useState(0);

  // ---------- chat / audience ----------
  const { blocked: blockedIds, ref: blockedRef } = useBlockedIds();
  const [rawChats, setRawChats] = useState([]);
  const [rawAudience, setRawAudience] = useState([]);
  const chats = useMemo(() => rawChats.filter((m) => !(m && m.senderId && blockedIds.has(m.senderId))), [rawChats, blockedIds]);
  const audienceArray = useMemo(() => rawAudience.filter((u) => u && u.uid && !blockedIds.has(u.uid)), [rawAudience, blockedIds]);
  const [text, setText] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const chatsReadyRef = useRef(false);
  const lastChatAtRef = useRef(0);
  const [joinBanner, setJoinBanner] = useState(null);

  // ---------- ui ----------
  const [menuOpen, setMenuOpen] = useState(false);
  const [exitVisible, setExitVisible] = useState(false);
  const [seatMenuKey, setSeatMenuKey] = useState(null);
  const [viewerListVisible, setViewerListVisible] = useState(false);
  const [rankVisible, setRankVisible] = useState(false);
  const [profileCard, setProfileCard] = useState(null);
  const [profileFollowing, setProfileFollowing] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [pinDraft, setPinDraft] = useState('');
  const [lockDraft, setLockDraft] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [filterId, setFilterId] = useState('off');
  const [soundMuted, setSoundMuted] = useState(false);
  const [summary, setSummary] = useState(null);
  const [busySeat, setBusySeat] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const peakViewersRef = useRef(0);
  const kickedHandledRef = useRef(false);
  const prevSeatKeyRef = useRef(null);

  // ---------- seat requests ----------
  const [seatRequests, setSeatRequests] = useState([]);
  const [requestsVisible, setRequestsVisible] = useState(false);
  const [myReqPending, setMyReqPending] = useState(false);
  const myReqPendingRef = useRef(false);
  const reqSendingRef = useRef(false);
  const takeSeatRef = useRef(null);

  // ---------- hearts ----------
  const heartsRef = useRef(null);
  const pendingLikesRef = useRef(0);
  const likeTimerRef = useRef(null);
  const lastLikesSeenRef = useRef(null);

  // ---------- gifts ----------
  const [giftModalVisible, setGiftModalVisible] = useState(false);
  const [selectedGiftUser, setSelectedGiftUser] = useState(null);
  const [giftQty, setGiftQty] = useState(1);
  const [giftPageIdx, setGiftPageIdx] = useState(0);
  const [activeGift, setActiveGift] = useState(null);
  const [giftPlayKey, setGiftPlayKey] = useState(0);
  const [giftCombo, setGiftCombo] = useState(null);
  const lastGiftRef = useRef(null);
  const giftTimeoutRef = useRef(null);
  const comboTimeoutRef = useRef(null);
  const comboCountRef = useRef(0);
  const giftModalAnim = useRef(new Animated.Value(400)).current;
  const giftTranslateX = useRef(new Animated.Value(-80)).current;
  const giftScale = useRef(new Animated.Value(1)).current;
  const giftShake = useRef(new Animated.Value(0)).current;
  const giftOpacity = useRef(new Animated.Value(0)).current;

  // ---------- derived ----------
  const seats = room?.seatsData || {};
  const hostId = room?.hostId || null;
  const isHost = !!myUid && hostId === myUid;
  useLiveBanGuard(isHost);

  const mods = room?.mods || {};
  const mutedUsers = room?.mutedUsers || {};
  const isMod = isHost || !!(myUid && mods[myUid]);
  const amMuted = !!(myUid && mutedUsers[myUid]);
  const chatLocked = !!room?.chatLocked;
  const roomTitle = room?.title || '';
  const pinnedText = room?.pinned?.text || '';

  const mySeatKey = useMemo(
    () => SEAT_KEYS.find((k) => seats[k]?.userId && seats[k].userId === myUid) || null,
    [seats, myUid]
  );
  const mySeat = mySeatKey ? seats[mySeatKey] : null;
  const myMicOn = !!mySeat && !mySeat.isMuted && !mySeat.hostMuted;
  const myCamOn = !!mySeat && !mySeat.isCamOff;

  const rankedGifters = Object.values(room?.roomGifters || {})
    .filter((g) => g && g.uid && Number(g.stars) > 0)
    .sort((a, b) => Number(b.stars) - Number(a.stars));
  const topViewers = useMemo(
    () => [...audienceArray].sort((a, b) => Number(b.level || 1) - Number(a.level || 1)).slice(0, 3),
    [audienceArray]
  );
  const viewerCount = audienceArray.filter((u) => u.uid !== hostId).length;
  if (viewerCount > peakViewersRef.current) peakViewersRef.current = viewerCount;

  const roomStartTime = useMemo(() => {
    const c = room?.createdAt;
    if (c?.toMillis) return c.toMillis();
    if (c?.seconds) return c.seconds * 1000;
    if (typeof c === 'number') return c;
    return null;
  }, [room?.createdAt]);
  const startFallbackRef = useRef(Date.now());

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // ---------- agora ----------
  const publishErrRef = useRef(null);
  const agora = useAgoraRoom({
    roomId, myUid,
    publishing: !!mySeat,
    micOn: myMicOn,
    camOn: myCamOn,
    soundMuted,
    onPublishError: (msg) => publishErrRef.current && publishErrRef.current(msg),
  });

  const goBack = useCallback(() => {
    try { if (router.canGoBack()) router.back(); else router.replace('/'); }
    catch (e) { router.replace('/'); }
  }, [router]);

  // ---------- wallet ----------
  useEffect(() => {
    if (!db || !myUid) return undefined;
    const unsub = onSnapshot(doc(db, 'wallets', myUid), (snap) => {
      if (snap.exists()) setStars(snap.data()?.stars || 0);
    });
    return () => unsub();
  }, [myUid]);

  // ---------- my profile ----------
  useEffect(() => {
    if (!db || !myUid) { setProfileReady(true); return undefined; }
    let alive = true;
    (async () => {
      try {
        const [snap, walletSnap] = await Promise.all([getDoc(doc(db, 'users', myUid)), getDoc(doc(db, 'wallets', myUid))]);
        if (!alive) return;
        if (snap.exists()) {
          const d = snap.data();
          setCurrentName(d.username || d.name || me?.displayName || 'User');
          setCurrentRealName(d.name || me?.displayName || 'User');
          setCurrentAvatar(d.profileImg || d.photoURL || me?.photoURL || DEFAULT_AVATAR);
          setMyVerified(isVerified(d.verified));
          setMyVerifiedColor(normTickColor(d.verifiedColor));
          setMySpecial(getSpecialKey(d));
        }
        if (walletSnap.exists()) setMyLevel(walletSnap.data()?.level || 1);
      } catch (e) { console.log('MY PROFILE LOAD ERROR:', e); }
      if (alive) setProfileReady(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUid]);

  // ---------- room doc ----------
  useEffect(() => {
    if (!db || !roomId) { setLoading(false); return undefined; }
    const unsub = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
      if (!snap.exists()) {
        roomRef.current = null;
        lastRoomSigRef.current = '';
        setLoading(false);
        if (leftRef.current) return; // hum khud nikle / host summary dekh raha hai
        setRoom(null);
        leftRef.current = true;
        Alert.alert('Live ended', 'Host ne room band kar diya.');
        goBack();
        return;
      }
      const data = snap.data();
      if (!giftBaselineSetRef.current) {
        giftBaselineSetRef.current = true;
        lastSeenGiftKeyRef.current = data?.liveGift ? `${data.liveGift.senderId}_${data.liveGift.timestamp}` : '';
      }
      roomRef.current = data;

      const likesNow = Number(data.likes || 0);
      if (lastLikesSeenRef.current === null) lastLikesSeenRef.current = likesNow;
      else {
        const delta = likesNow - lastLikesSeenRef.current;
        lastLikesSeenRef.current = likesNow;
        if (delta > 0) heartsRef.current?.spawn(Math.min(delta, 4));
      }

      // heartbeat / likes / viewerCount badalne par poori screen re-render na ho
      const { lastHeartbeat: _h, hostHeartbeat: _h2, likes: _l, viewerCount: _v, ...rest } = data;
      let sig = '';
      try { sig = JSON.stringify(rest); } catch (_) {}
      if (sig && sig === lastRoomSigRef.current) { setLoading(false); return; }
      lastRoomSigRef.current = sig;

      setRoom(data);
      setLoading(false);
      if (data.status === 'ended' && !leftRef.current) {
        leftRef.current = true;
        Alert.alert('Live ended', 'Host ne room band kar diya.');
        goBack();
      }
    }, () => setLoading(false));
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // BLOCK: host se block-relation ho to room me rehne mat do
  useEffect(() => {
    if (hostId && hostId !== myUid && blockedIds.has(hostId) && !leftRef.current) {
      leftRef.current = true;
      try { Alert.alert('Live', 'Ye live aapke liye available nahi hai'); } catch (_) {}
      goBack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId, blockedIds]);

  // host ki seat_1 hamesha bhari honi chahiye (video publish ke liye)
  useEffect(() => {
    if (!db || !roomId || !isHost || !room) return;
    if (seats.seat_1?.userId === myUid && Number(seats.seat_1?.agoraUid) === agora.myAgoraUid) return;
    updateDoc(doc(db, 'rooms', roomId), {
      'seatsData.seat_1': {
        ...(seats.seat_1 || {}), ...(seats.seat_1?.userId === myUid ? {} : EMPTY_SEAT),
        userId: myUid, userName: currentRealName, userImg: currentAvatar,
        agoraUid: agora.myAgoraUid, roleTag: 'HOST', verified: myVerified,
        verifiedColor: normTickColor(myVerifiedColor), level: myLevel, at: Date.now(),
      },
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, !!room, profileReady, agora.myAgoraUid, seats.seat_1?.userId, seats.seat_1?.agoraUid]);

  // ---------- host heartbeat + reward ping ----------
  useEffect(() => {
    if (!db || !roomId || !isHost) return undefined;
    const ref = doc(db, 'rooms', roomId);
    const beat = () => updateDoc(ref, { lastHeartbeat: serverTimestamp(), hostHeartbeat: Date.now() }).catch(() => {});
    beat();
    const t = setInterval(beat, HEARTBEAT_INTERVAL);
    const ping = () => {
      if (AppState.currentState !== 'active') return;
      callApi('/reward/live-ping', { roomId }).catch(() => {});
    };
    ping();
    const t2 = setInterval(ping, 30000);
    return () => { clearInterval(t); clearInterval(t2); };
  }, [roomId, isHost]);

  // ---------- audience presence + join line ----------
  useEffect(() => {
    if (!db || !roomId || !myUid || !profileReady || !hostId || hostId === myUid) return undefined;
    const audRef = doc(db, 'rooms', roomId, 'audience', myUid);
    (async () => {
      try {
        const existing = await getDoc(audRef);
        const first = !existing.exists();
        const jobs = [setDoc(audRef, {
          uid: myUid, userId: myUid, name: currentRealName, username: currentName,
          img: currentAvatar || DEFAULT_AVATAR, level: myLevel, special: mySpecial,
          verified: myVerified, verifiedColor: normTickColor(myVerifiedColor), joinedAt: Date.now(), online: true,
        })];
        if (first) {
          jobs.push(addDoc(collection(db, 'rooms', roomId, 'chats'), {
            type: 'join', senderId: myUid, senderName: currentRealName, username: currentName,
            userImg: currentAvatar || DEFAULT_AVATAR, special: mySpecial, verified: myVerified,
            verifiedColor: normTickColor(myVerifiedColor), level: myLevel, createdAt: Date.now(),
          }));
        }
        await Promise.all(jobs);
      } catch (e) { console.log('JOIN ERROR:', e); }
    })();
    return () => { deleteDoc(audRef).catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myUid, profileReady, hostId]);

  // ---------- audience list (+ host writes viewerCount) ----------
  useEffect(() => {
    if (!db || !roomId) return undefined;
    let first = true;
    let latest = [];
    let timer = null;
    const unsub = onSnapshot(collection(db, 'rooms', roomId, 'audience'), (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ uid: d.id, ...d.data() }));
      latest = list;
      if (first) { first = false; setRawAudience(list); return; }
      if (!timer) timer = setTimeout(() => { timer = null; setRawAudience(latest); }, 600);
    }, () => {});
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, [roomId]);

  useEffect(() => {
    if (!db || !roomId || !isHost) return undefined;
    const t = setTimeout(() => updateDoc(doc(db, 'rooms', roomId), { viewerCount }).catch(() => {}), 3000);
    return () => clearTimeout(t);
  }, [viewerCount, roomId, isHost]);

  // ---------- chat listener + join banner ----------
  const showJoinBanner = (data) => {
    if (data?.senderId && blockedRef.current.has(data.senderId)) return;
    setJoinBanner({ ...cleanVerified(data), _k: Date.now() + Math.random() });
  };
  const handleJoinDone = useCallback(() => setJoinBanner(null), []);

  useEffect(() => {
    if (!db || !roomId) return undefined;
    const q = query(collection(db, 'rooms', roomId, 'chats'), orderBy('createdAt', 'desc'), limit(50));
    chatsReadyRef.current = false;
    const unsub = onSnapshot(q, (snap) => {
      setRawChats(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (chatsReadyRef.current) {
        snap.docChanges().forEach((ch) => {
          if (ch.type !== 'added') return;
          const d = ch.doc.data();
          if (d?.type === 'join' && Date.now() - (d.createdAt || 0) < 15000) showJoinBanner(d);
        });
      }
      chatsReadyRef.current = true;
    }, (e) => console.log('Chat listener error:', e));
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ---------- remote gift animation ----------
  const playGift = useCallback((animation, duration) => {
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

  useEffect(() => {
    const gift = room?.liveGift;
    if (!gift) return;
    const key = `${gift.senderId}_${gift.timestamp}`;
    if (key === lastSeenGiftKeyRef.current) return;
    lastSeenGiftKeyRef.current = key;
    if (gift.senderId === myUid) return;
    if (blockedRef.current.has(gift.senderId)) return;

    setGiftCombo({
      senderName: gift.senderName, senderImg: gift.senderImg, receiverName: gift.receiverName,
      giftId: gift.giftId, giftName: gift.giftName, count: gift.comboCount || 1,
    });
    lastGiftRef.current = { senderId: gift.senderId, giftId: gift.giftId, time: Date.now() };
    if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);
    comboTimeoutRef.current = setTimeout(() => {
      setGiftCombo(null); lastGiftRef.current = null; comboCountRef.current = 0;
    }, 2200);

    const gd = gifts.find((g) => String(g.id) === String(gift.giftId));
    if (gd && gd.animation) playGift(gd.animation, gd.duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.liveGift?.timestamp]);

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

  useEffect(() => {
    if (!giftModalVisible) return;
    giftModalAnim.setValue(400);
    setGiftPageIdx(0);
    Animated.timing(giftModalAnim, { toValue: 0, duration: 230, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [giftModalVisible]);

  // ---------- keyboard ----------
  useEffect(() => {
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => { setChatOpen(false); setEmojiOpen(false); }
    );
    return () => hideSub.remove();
  }, []);

  // ---------- screen on ----------
  const keepAwakeOn = useCallback(() => {
    activateKeepAwakeAsync('multi-room').catch(() => {
      setTimeout(() => { activateKeepAwakeAsync('multi-room').catch(() => {}); }, 1500);
    });
  }, []);
  useFocusEffect(useCallback(() => {
    keepAwakeOn();
    const t = setInterval(keepAwakeOn, 15000);
    return () => { clearInterval(t); try { deactivateKeepAwake('multi-room'); } catch (_) {} };
  }, [keepAwakeOn]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') keepAwakeOn(); });
    return () => sub.remove();
  }, [keepAwakeOn]);

  // ============================================================
  // SEATS
  // ============================================================
  const freeMySeat = useCallback(async () => {
    if (!db || !roomId || !myUid) return;
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'rooms', roomId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const data = snap.data().seatsData || {};
        const key = SEAT_KEYS.find((k) => data[k]?.userId === myUid);
        if (!key || key === 'seat_1') return;
        tx.update(ref, { [`seatsData.${key}`]: { ...data[key], ...EMPTY_SEAT } });
      });
    } catch (e) { console.log('freeMySeat', e); }
  }, [roomId, myUid]);

  const freeSeatRef = useRef(null);
  freeSeatRef.current = freeMySeat;
  useEffect(() => () => { freeSeatRef.current && freeSeatRef.current(); }, []);

  publishErrRef.current = (msg) => {
    Alert.alert('Could not join', msg || 'Camera / mic could not start.');
    freeMySeat();
  };

  // seat se hata diye gaye (host ne remove kiya)
  useEffect(() => {
    if (prevSeatKeyRef.current && !mySeatKey && !leftRef.current && !kickedHandledRef.current) {
      showToast('You are no longer on the seat');
    }
    prevSeatKeyRef.current = mySeatKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mySeatKey]);

  // ---------- SEAT REQUESTS: user request bheje, host/mod accept kare tabhi seat ----------
  // host / mod: aane wali requests sunte hain
  useEffect(() => {
    if (!db || !roomId || !isMod) { setSeatRequests([]); return undefined; }
    let first = true;
    const unsub = onSnapshot(collection(db, 'rooms', roomId, 'seatRequests'), (snap) => {
      const list = [];
      snap.forEach((d) => {
        const x = d.data();
        if (x?.status !== 'accepted' && !blockedRef.current.has(d.id)) list.push({ uid: d.id, ...x });
      });
      list.sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
      setSeatRequests(list);
      if (!first) {
        snap.docChanges().forEach((ch) => {
          if (ch.type === 'added' && ch.doc.data()?.status !== 'accepted') {
            showToast(`${ch.doc.data()?.name || 'Koi'} ne seat request bheji 🙋`);
          }
        });
      }
      first = false;
    }, () => {});
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isMod]);

  // user: apni request ka status sunta hai (accept -> seat le leta hai)
  useEffect(() => {
    if (!db || !roomId || !myUid || isHost) return undefined;
    const ref = doc(db, 'rooms', roomId, 'seatRequests', myUid);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        if (myReqPendingRef.current && !leftRef.current) showToast('Host ne request reject kar di ❌');
        myReqPendingRef.current = false;
        setMyReqPending(false);
        return;
      }
      const d = snap.data();
      if (d?.status === 'accepted' && d.seatKey) {
        myReqPendingRef.current = false;
        setMyReqPending(false);
        deleteDoc(ref).catch(() => {});
        showToast('Request accept ho gayi 🎉');
        takeSeatRef.current && takeSeatRef.current(d.seatKey);
        return;
      }
      myReqPendingRef.current = true;
      setMyReqPending(true);
    }, () => {});
    return () => {
      unsub();
      myReqPendingRef.current = false;
      deleteDoc(ref).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myUid, isHost]);

  const requestSeat = async () => {
    if (!db || !myUid || isHost || !profileReady) return;
    if (mySeatKey) return;
    if (myReqPending || reqSendingRef.current) { showToast('Request pehle hi bhej di hai ⏳'); return; }
    if (!SEAT_KEYS.some((k, i) => i > 0 && !seats[k]?.userId)) {
      Alert.alert('Room full', 'Saari seats bhar gayi hain.');
      return;
    }
    reqSendingRef.current = true;
    try {
      await setDoc(doc(db, 'rooms', roomId, 'seatRequests', myUid), {
        uid: myUid, name: currentRealName, username: currentName, img: currentAvatar || DEFAULT_AVATAR,
        level: myLevel, verified: myVerified, verifiedColor: normTickColor(myVerifiedColor),
        status: 'pending', at: Date.now(),
      });
      myReqPendingRef.current = true;
      setMyReqPending(true);
      showToast('Request bhej di ✅ Host accept karega tab seat milegi');
    } catch (e) {
      Alert.alert('Request', 'Request nahi ja saki, dobara try karo.');
    }
    reqSendingRef.current = false;
  };

  const cancelSeatRequest = () => {
    if (!db || !myUid) return;
    myReqPendingRef.current = false;
    setMyReqPending(false);
    deleteDoc(doc(db, 'rooms', roomId, 'seatRequests', myUid)).catch(() => {});
    showToast('Request cancel kar di');
  };

  const acceptRequest = async (req) => {
    if (!db || !isMod) return;
    const sd = roomRef.current?.seatsData || {};
    const free = SEAT_KEYS.find((k, i) => i > 0 && !sd[k]?.userId);
    if (!free) { Alert.alert('Room full', 'Saari seats bhar gayi hain.'); return; }
    try {
      await updateDoc(doc(db, 'rooms', roomId, 'seatRequests', req.uid), { status: 'accepted', seatKey: free });
    } catch (e) { console.log('ACCEPT ERROR:', e); }
  };

  const rejectRequest = (req) => {
    if (!db || !isMod) return;
    deleteDoc(doc(db, 'rooms', roomId, 'seatRequests', req.uid)).catch(() => {});
  };

  const takeSeat = async (key) => {
    if (!db || !myUid || busySeat) return;
    setBusySeat(true);
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'rooms', roomId);
        const snap = await tx.get(ref);
        const data = snap.data()?.seatsData || {};
        if (data[key]?.userId) throw new Error('taken');
        const prev = SEAT_KEYS.find((k) => data[k]?.userId === myUid);
        const updates = {};
        if (prev && prev !== 'seat_1') updates[`seatsData.${prev}`] = { ...data[prev], ...EMPTY_SEAT };
        updates[`seatsData.${key}`] = {
          ...(data[key] || {}), ...EMPTY_SEAT,
          userId: myUid, userName: currentRealName, userImg: currentAvatar, roleTag: 'GUEST',
          agoraUid: agora.myAgoraUid, verified: myVerified, verifiedColor: normTickColor(myVerifiedColor),
          level: myLevel, at: Date.now(),
        };
        tx.update(ref, updates);
      });
    } catch (e) {
      Alert.alert('Seat', 'Ye seat abhi kisi ne le li, doosri try karo.');
    }
    setBusySeat(false);
  };

  takeSeatRef.current = takeSeat;

  const patchMySeat = (patch) => {
    if (!mySeatKey || !db) return;
    const upd = {};
    Object.keys(patch).forEach((k) => { upd[`seatsData.${mySeatKey}.${k}`] = patch[k]; });
    updateDoc(doc(db, 'rooms', roomId), upd).catch(() => {});
  };

  const toggleMyMic = () => {
    if (!mySeat) return;
    if (mySeat.hostMuted) { showToast('Host ne aapka mic band kiya hai'); return; }
    patchMySeat({ isMuted: !mySeat.isMuted });
  };
  const toggleMyCam = () => { if (mySeat) patchMySeat({ isCamOff: !mySeat.isCamOff }); };

  // ab seedha seat nahi milti -> request jaati hai
  const joinFirstFree = () => { requestSeat(); };

  // host / mod controls
  const canManageSeat = (key) => isMod && key !== 'seat_1' && !!seats[key]?.userId && seats[key].userId !== myUid;
  const hostMuteSeat = (key) => {
    const s = seats[key];
    if (!s || !db) return;
    updateDoc(doc(db, 'rooms', roomId), { [`seatsData.${key}.hostMuted`]: !s.hostMuted }).catch(() => {});
  };
  const removeFromSeat = (key) => {
    const s = seats[key];
    if (!s || !db) return;
    updateDoc(doc(db, 'rooms', roomId), { [`seatsData.${key}`]: { ...s, ...EMPTY_SEAT } }).catch(() => {});
  };

  // host: seat par baitha banda channel me aaya hi nahi / crash ho gaya -> seat khali
  useEffect(() => {
    if (!isHost || !db || !roomId) return undefined;
    const t = setInterval(() => {
      if (!agora.ready) return;
      const sd = roomRef.current?.seatsData || {};
      SEAT_KEYS.forEach((k) => {
        if (k === 'seat_1') return;
        const s = sd[k];
        if (!s?.userId) return;
        if (Date.now() - Number(s.at || 0) < SEAT_JOIN_GRACE_MS) return;
        const aid = Number(s.agoraUid || 0);
        if (aid && !agora.remoteUsersRef.current.includes(aid)) {
          updateDoc(doc(db, 'rooms', roomId), { [`seatsData.${k}`]: { ...s, ...EMPTY_SEAT } }).catch(() => {});
        }
      });
    }, 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, roomId, agora.ready]);

  // ============================================================
  // EXIT
  // ============================================================
  const clearSub = async (name) => {
    try {
      const snap = await getDocs(collection(db, 'rooms', roomId, name));
      if (snap.empty) return;
      const all = snap.docs;
      for (let i = 0; i < all.length; i += 400) {
        const batch = writeBatch(db);
        all.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (e) { console.log(`Clear ${name} error:`, e); }
  };

  const doLeaveNow = () => {
    setSummary(null);
    goBack();
    if (isHost && db && roomId) { clearSub('chats'); clearSub('audience'); }
  };

  const confirmExit = async () => {
    setExitVisible(false);
    leftRef.current = true;
    if (isHost && db && roomId) {
      const rd = roomRef.current || room || {};
      const gifters = Object.values(rd.roomGifters || {})
        .filter((g) => g && Number(g.stars) > 0)
        .sort((a, b) => Number(b.stars) - Number(a.stars))
        .slice(0, 3);
      setSummary({
        durationMs: Date.now() - (roomStartTime || startFallbackRef.current),
        peak: Math.max(peakViewersRef.current, viewerCount),
        likes: Number(rd.likes || 0),
        stars: Number(rd.seatStars?.[hostId] || rd.coins || 0),
        followers: Number(rd.newFollowers || 0),
        gifters,
      });
      try { await deleteDoc(doc(db, 'rooms', roomId)); } catch (e) {}
      return;
    }
    await freeMySeat();
    goBack();
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (chatOpen) { setChatOpen(false); Keyboard.dismiss(); return true; }
      setExitVisible(true);
      return true;
    });
    return () => sub.remove();
  }, [chatOpen]);

  // ============================================================
  // CHAT / SHARE / LIKES
  // ============================================================
  const openChat = () => {
    if (amMuted && !isMod) { Alert.alert('Muted', 'The host has muted you in this live.'); return; }
    if (chatLocked && !isMod) { Alert.alert('Chat is off', 'The host has turned chat off for viewers.'); return; }
    setChatOpen(true);
  };

  const sendChat = async () => {
    const t = text.trim();
    if (!t || !db || !myUid || !roomId) return;
    if (amMuted && !isMod) { Alert.alert('Muted', 'The host has muted you in this live.'); return; }
    if (chatLocked && !isMod) { Alert.alert('Chat is off', 'The host has turned chat off for viewers.'); return; }
    const now = Date.now();
    if (now - lastChatAtRef.current < 1200) return;
    lastChatAtRef.current = now;
    const messageText = cleanText(t).slice(0, 200);
    Keyboard.dismiss();
    setEmojiOpen(false);
    setText('');
    try {
      await addDoc(collection(db, 'rooms', roomId, 'chats'), {
        senderName: currentRealName, username: currentName, message: messageText, senderId: myUid,
        role: isHost ? 'host' : mods[myUid] ? 'mod' : 'user', userImg: currentAvatar || DEFAULT_AVATAR,
        special: mySpecial, verified: myVerified, verifiedColor: normTickColor(myVerifiedColor),
        level: myLevel, createdAt: Date.now(),
      });
    } catch (e) {}
  };

  const shareRoom = async () => {
    try {
      await Share.share({ message: `🎥 Join ${room?.hostName || 'Host'}'s Live now!\nhttps://topking.app/live/${roomId}` });
    } catch (e) {}
  };

  const flushLikes = () => {
    likeTimerRef.current = null;
    const n = pendingLikesRef.current;
    pendingLikesRef.current = 0;
    if (!n || !db || !roomId) return;
    lastLikesSeenRef.current = (lastLikesSeenRef.current || 0) + n;
    updateDoc(doc(db, 'rooms', roomId), { likes: increment(n) }).catch(() => {});
  };
  const sendLike = () => {
    heartsRef.current?.spawn(1);
    pendingLikesRef.current += 1;
    if (!likeTimerRef.current) likeTimerRef.current = setTimeout(flushLikes, 1500);
  };
  useEffect(() => () => { if (likeTimerRef.current) { clearTimeout(likeTimerRef.current); flushLikes(); } }, []);

  // ============================================================
  // FOLLOW / PROFILE / MODERATION / REPORT / SETTINGS
  // ============================================================
  const setFollow = async (targetId, follow) => {
    if (!db || !myUid || !targetId || targetId === myUid) return false;
    const a = doc(db, 'users', targetId, 'followers', myUid);
    const b = doc(db, 'users', myUid, 'following', targetId);
    try {
      if (follow) {
        await Promise.all([
          setDoc(a, { uid: myUid, name: currentRealName, img: currentAvatar || DEFAULT_AVATAR, at: Date.now() }),
          setDoc(b, { uid: targetId, at: Date.now() }),
        ]);
        updateDoc(doc(db, 'users', targetId), { followersCount: increment(1) }).catch(() => {});
        updateDoc(doc(db, 'users', myUid), { followingCount: increment(1) }).catch(() => {});
        notifyNewFollower(targetId);
        if (targetId === hostId && roomId) updateDoc(doc(db, 'rooms', roomId), { newFollowers: increment(1) }).catch(() => {});
      } else {
        await Promise.all([deleteDoc(a), deleteDoc(b)]);
        updateDoc(doc(db, 'users', targetId), { followersCount: increment(-1) }).catch(() => {});
        updateDoc(doc(db, 'users', myUid), { followingCount: increment(-1) }).catch(() => {});
      }
      return true;
    } catch (e) { console.log('FOLLOW ERROR:', e); return false; }
  };

  useEffect(() => {
    if (!db || !hostId || !myUid || hostId === myUid) return undefined;
    let alive = true;
    getDoc(doc(db, 'users', hostId, 'followers', myUid)).then((sn) => alive && setIsFollowing(sn.exists())).catch(() => {});
    return () => { alive = false; };
  }, [hostId, myUid]);

  const toggleFollowHost = async () => {
    if (followBusy || !hostId) return;
    setFollowBusy(true);
    const next = !isFollowing;
    setIsFollowing(next);
    const ok = await setFollow(hostId, next);
    if (!ok) setIsFollowing(!next);
    setFollowBusy(false);
  };

  useEffect(() => {
    setProfileFollowing(false);
    if (!db || !profileCard?.uid || !myUid || profileCard.uid === myUid) return undefined;
    let alive = true;
    getDoc(doc(db, 'users', profileCard.uid, 'followers', myUid)).then((sn) => alive && setProfileFollowing(sn.exists())).catch(() => {});
    return () => { alive = false; };
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

  const openProfile = useCallback((u) => setProfileCard(u), []);
  const openHostCard = () => {
    if (!hostId) return;
    setProfileCard({ uid: hostId, name: room?.hostName, img: room?.hostImg, level: seats.seat_1?.level || 1, verified: seats.seat_1?.verified, verifiedColor: seats.seat_1?.verifiedColor });
  };
  const renderChat = useCallback(({ item }) => <ChatItem chat={item} onUser={openProfile} />, [openProfile]);

  // kicked by host / mod
  useEffect(() => {
    if (isHost || !myUid || kickedHandledRef.current) return;
    if (room?.kicked?.[myUid]) {
      kickedHandledRef.current = true;
      leftRef.current = true;
      freeMySeat();
      Alert.alert('Removed', 'You were removed from this live.');
      goBack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.kicked, myUid]);

  const canModerate = (t) => isMod && !!t?.uid && t.uid !== myUid && t.uid !== hostId && (isHost || !mods[t.uid]);

  const muteUserChat = async (t, mute) => {
    if (!db || !roomId) return;
    try { await updateDoc(doc(db, 'rooms', roomId), { [`mutedUsers.${t.uid}`]: mute ? true : deleteField() }); }
    catch (e) { console.log('MUTE ERROR:', e); }
    setProfileCard(null);
  };

  const kickUser = (t) => {
    Alert.alert('Remove user', `Remove ${t.name || 'this user'} from the live? They can't rejoin this live.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          if (!db || !roomId) return;
          try {
            const sd = roomRef.current?.seatsData || {};
            const key = SEAT_KEYS.find((k) => sd[k]?.userId === t.uid);
            await updateDoc(doc(db, 'rooms', roomId), { [`kicked.${t.uid}`]: true });
            if (key && key !== 'seat_1') {
              updateDoc(doc(db, 'rooms', roomId), { [`seatsData.${key}`]: { ...sd[key], ...EMPTY_SEAT } }).catch(() => {});
            }
            deleteDoc(doc(db, 'rooms', roomId, 'audience', t.uid)).catch(() => {});
          } catch (e) { console.log('KICK ERROR:', e); }
          setProfileCard(null);
          setSeatMenuKey(null);
        },
      },
    ]);
  };

  const toggleMod = async (t) => {
    if (!isHost || !db || !roomId) return;
    try { await updateDoc(doc(db, 'rooms', roomId), { [`mods.${t.uid}`]: mods[t.uid] ? deleteField() : true }); }
    catch (e) { console.log('MOD ERROR:', e); }
    setProfileCard(null);
    setSeatMenuKey(null);
  };

  const toggleChatLock = async () => {
    if (!isMod || !db || !roomId) return;
    try { await updateDoc(doc(db, 'rooms', roomId), { chatLocked: !chatLocked }); } catch (e) {}
  };

  const deleteAllChats = () => {
    if (!isMod || !db || !roomId) return;
    Alert.alert('Delete all chats', 'Remove every message from this live chat for everyone?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: async () => { await clearSub('chats'); setRawChats([]); } },
    ]);
  };

  const submitReport = async (reason) => {
    const t = reportTarget;
    setReportTarget(null);
    if (!t || !db) return;
    try {
      await addDoc(collection(db, 'reports'), {
        roomId, hostId: hostId || null, reporterId: myUid, targetId: t.uid, targetName: t.name || '', reason, createdAt: Date.now(),
      });
      Alert.alert('Thanks', 'Your report was sent. Our team will review it.');
    } catch (e) { Alert.alert('Report', 'Could not send the report. Try again.'); }
  };

  const openSettings = () => {
    setTitleDraft(roomTitle);
    setPinDraft(pinnedText);
    setLockDraft(chatLocked);
    setSettingsVisible(true);
  };
  const saveSettings = async () => {
    if (!db || !roomId) return;
    try {
      await updateDoc(doc(db, 'rooms', roomId), {
        title: titleDraft.trim().slice(0, 60),
        chatLocked: lockDraft,
        pinned: pinDraft.trim() ? { text: pinDraft.trim().slice(0, 140), by: currentName, at: Date.now() } : deleteField(),
      });
    } catch (e) { console.log('SETTINGS ERROR:', e); }
    setSettingsVisible(false);
  };

  // ============================================================
  // GIFTING
  // ============================================================
  const goRecharge = () => {
    setGiftModalVisible(false);
    try { router.push(RECHARGE_ROUTE); }
    catch (e) { Alert.alert('Recharge', 'Recharge screen is not linked yet (set RECHARGE_ROUTE).'); }
  };

  // gift sirf seat par baithe logon ko (host + guests), apne ko nahi
  const giftUsers = SEAT_KEYS
    .filter((k) => seats[k]?.userId && seats[k].userId !== myUid)
    .map((k) => ({ uid: seats[k].userId, name: seats[k].userName || 'User', img: seats[k].userImg, seatKey: k }));

  const openGiftModal = (preselectUid) => {
    if (!giftUsers.length) { Alert.alert('Gift', 'Abhi kisi seat par koi nahi hai jise gift bhej sako.'); return; }
    const want = typeof preselectUid === 'string' && giftUsers.some((u) => u.uid === preselectUid) ? preselectUid : null;
    if (want) setSelectedGiftUser(want);
    else if (!giftUsers.some((u) => u.uid === selectedGiftUser)) {
      setSelectedGiftUser((giftUsers.find((u) => u.uid === hostId) || giftUsers[0]).uid);
    }
    setGiftQty(1);
    setGiftModalVisible(true);
  };

  const handleSendGift = (item) => {
    if (!selectedGiftUser || typeof selectedGiftUser !== 'string') { Alert.alert('Gift', 'Please select a user'); return; }
    const qty = giftQty;
    if (stars < Number(item.price || 0) * qty) {
      Alert.alert('Gift', 'Not enough stars', [{ text: 'Cancel', style: 'cancel' }, { text: 'Recharge', onPress: goRecharge }]);
      return;
    }
    const receiverId = selectedGiftUser;
    if (receiverId === myUid || !giftUsers.some((u) => u.uid === receiverId)) {
      Alert.alert('Gift', 'Please select another user');
      return;
    }
    setGiftModalVisible(false);
    if (item.animation) playGift(item.animation, item.duration);

    const isComboContinue = lastGiftRef.current && lastGiftRef.current.senderId === myUid
      && lastGiftRef.current.giftId === item.id && Date.now() - lastGiftRef.current.time < 3000;
    if (!comboCountRef.current || !isComboContinue) comboCountRef.current = 1;
    else comboCountRef.current++;
    if (qty > 1) comboCountRef.current += qty - 1;
    const comboCount = comboCountRef.current;
    lastGiftRef.current = { senderId: myUid, giftId: item.id, time: Date.now() };
    if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);

    const receiver = giftUsers.find((u) => u.uid === receiverId);
    const receiverName = receiver?.name || 'user';
    const senderDisplay = currentRealName && currentRealName !== 'User' ? currentRealName : currentName;

    setGiftCombo({
      senderName: senderDisplay, senderImg: currentAvatar || DEFAULT_AVATAR, receiverName,
      giftId: item.id, giftName: item.name, count: comboCount,
    });
    comboTimeoutRef.current = setTimeout(() => {
      setGiftCombo(null); lastGiftRef.current = null; comboCountRef.current = 0;
    }, 2200);

    const giftTimestamp = Date.now();
    lastSeenGiftKeyRef.current = `${myUid}_${giftTimestamp}`;
    sendGiftInBackground({ item, receiverId, receiverName, senderDisplay, comboCount, giftTimestamp, qty });
  };
  const handleSendGiftRef = useRef(null);
  handleSendGiftRef.current = handleSendGift;
  const stableSendGift = useCallback((item) => handleSendGiftRef.current && handleSendGiftRef.current(item), []);

  const sendGiftInBackground = async ({ item, receiverId, receiverName, senderDisplay, comboCount, giftTimestamp, qty = 1 }) => {
    if (!db || !roomId || !myUid) return;
    const price = Number(item.price || 0) * qty;
    const sd = roomRef.current?.seatsData || {};
    const rKey = SEAT_KEYS.find((k) => sd[k]?.userId === receiverId);

    const roomUpdate = {
      [`seatStars.${receiverId}`]: increment(price),
      [`roomGifters.${myUid}.uid`]: myUid,
      [`roomGifters.${myUid}.name`]: senderDisplay,
      [`roomGifters.${myUid}.img`]: currentAvatar || DEFAULT_AVATAR,
      [`roomGifters.${myUid}.level`]: myLevel,
      [`roomGifters.${myUid}.verified`]: myVerified,
      [`roomGifters.${myUid}.stars`]: increment(price),
      liveGift: {
        giftId: item.id, giftName: item.name, senderId: myUid, senderName: senderDisplay,
        senderImg: currentAvatar || DEFAULT_AVATAR, receiverId, receiverName, timestamp: giftTimestamp, comboCount,
      },
    };
    if (rKey && rKey !== 'seat_1') {
      // guest tile par top-3 gifter avatars (seat_1 par rules non-host ko write nahi dete)
      roomUpdate[`seatsData.${rKey}.gifters.${myUid}.uid`] = myUid;
      roomUpdate[`seatsData.${rKey}.gifters.${myUid}.img`] = currentAvatar || DEFAULT_AVATAR;
      roomUpdate[`seatsData.${rKey}.gifters.${myUid}.stars`] = increment(price);
    }

    const jobs = [
      updateDoc(doc(db, 'wallets', myUid), { stars: increment(-price), totalSpent: increment(price) }),
      updateDoc(doc(db, 'rooms', roomId), roomUpdate),
      setDoc(doc(db, 'wallets', receiverId), { earnings: increment(price), receivedStars: increment(price) }, { merge: true }),
      updateDoc(doc(db, 'users', receiverId), {
        [`topGifters.${myUid}.uid`]: myUid,
        [`topGifters.${myUid}.username`]: currentName || '',
        [`topGifters.${myUid}.name`]: currentRealName || currentName || 'User',
        [`topGifters.${myUid}.profileImg`]: currentAvatar || '',
        [`topGifters.${myUid}.stars`]: increment(price),
      }),
    ];
    if (comboCount <= qty) {
      jobs.push(addDoc(collection(db, 'rooms', roomId, 'chats'), {
        type: 'gift', senderId: myUid, qty, senderName: senderDisplay, username: currentName,
        userImg: currentAvatar || DEFAULT_AVATAR, level: myLevel, special: mySpecial, verified: myVerified,
        verifiedColor: normTickColor(myVerifiedColor), receiverName, giftId: item.id, giftName: item.name, createdAt: Date.now(),
      }));
    }
    const results = await Promise.allSettled(jobs);
    results.forEach((r, idx) => { if (r.status === 'rejected' && __DEV__) console.log('GIFT WRITE FAILED #' + idx, r.reason); });

    fetch('https://topking-backend.onrender.com/update-agency-stars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiverUid: receiverId, stars: price }),
    }).catch(() => {});
  };

  // ============================================================
  // TILE PRESS
  // ============================================================
  const onTilePress = (key) => {
    const s = seats[key];
    if (!s?.userId) {
      if (mySeatKey === 'seat_1' || isHost || mySeatKey) return;
      requestSeat();
      return;
    }
    if (s.userId === myUid) { setMenuOpen(true); return; }
    if (canManageSeat(key)) { setSeatMenuKey(key); return; }
    setProfileCard({
      uid: s.userId, name: s.userName, img: s.userImg, level: s.level, verified: s.verified, verifiedColor: s.verifiedColor,
    });
  };

  // ============================================================
  // RENDER
  // ============================================================
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={YELLOW} />
      </View>
    );
  }
  if (!room && !summary) return <View style={styles.container} />;

  const hostSeat = seats.seat_1 || {};
  const agoraFailed = /^Failed/.test(agora.status);
  const seatMenuSeat = seatMenuKey ? seats[seatMenuKey] : null;

  const menuItems = [
    ...(mySeatKey ? [
      {
        key: 'mic', label: mySeat?.hostMuted ? 'Muted by host' : mySeat?.isMuted ? 'Unmute' : 'Mute',
        active: !myMicOn, onPress: toggleMyMic,
        icon: <Ionicons name={myMicOn ? 'mic' : 'mic-off'} size={24} color="#fff" />,
      },
      {
        key: 'cam', label: mySeat?.isCamOff ? 'Camera on' : 'Camera off', active: !!mySeat?.isCamOff, onPress: toggleMyCam,
        icon: <Ionicons name={mySeat?.isCamOff ? 'videocam-off' : 'videocam'} size={24} color="#fff" />,
      },
      { key: 'flip', label: 'Flip', onPress: agora.flip, icon: <Ionicons name="camera-reverse-outline" size={24} color="#fff" /> },
      {
        key: 'beauty', label: 'Beauty', active: filterId !== 'off', onPress: () => setFilterVisible(true),
        icon: <MaterialCommunityIcons name="face-woman-shimmer-outline" size={24} color="#fff" />,
      },
      ...(!isHost ? [{
        key: 'leaveSeat', label: 'Leave seat', onPress: freeMySeat,
        icon: <MaterialCommunityIcons name="phone-hangup" size={24} color="#fff" />,
      }] : []),
    ] : [{
      key: 'take', label: myReqPending ? 'Cancel request' : 'Request seat', active: myReqPending,
      onPress: myReqPending ? cancelSeatRequest : joinFirstFree,
      icon: <MaterialCommunityIcons name="link-variant" size={24} color="#FFC107" />,
    }]),
    {
      key: 'sound', label: soundMuted ? 'Sound off' : 'Sound', active: soundMuted, onPress: () => setSoundMuted((v) => !v),
      icon: <Ionicons name={soundMuted ? 'volume-mute' : 'volume-high'} size={24} color="#fff" />,
    },
    ...(isMod ? [{
      key: 'requests', label: seatRequests.length ? `Requests (${seatRequests.length})` : 'Requests',
      active: seatRequests.length > 0, onPress: () => setRequestsVisible(true),
      icon: <Ionicons name="hand-left-outline" size={24} color="#fff" />,
    }] : []),
    { key: 'like', label: 'Like', onPress: sendLike, icon: <Text style={{ fontSize: 22 }}>❤️</Text> },
    { key: 'gifters', label: 'Top gifters', onPress: () => setRankVisible(true), icon: <Ionicons name="trophy-outline" size={24} color="#fff" /> },
    { key: 'viewers', label: 'Viewers', onPress: () => setViewerListVisible(true), icon: <Ionicons name="people-outline" size={24} color="#fff" /> },
    ...(isHost ? [{
      key: 'setup', label: 'Setup', active: !!pinnedText || chatLocked, onPress: openSettings,
      icon: <Ionicons name="settings-outline" size={24} color="#fff" />,
    }] : [{
      key: 'report', label: 'Report', onPress: () => hostId && setReportTarget({ uid: hostId, name: room?.hostName }),
      icon: <Ionicons name="flag-outline" size={24} color="#fff" />,
    }]),
  ];

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <LinearGradient colors={['#1a0b2e', '#2a0f3d', '#4a1747', '#6b2438']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* ===== top bar ===== */}
          <View style={styles.topBar}>
            <View style={styles.hostPill}>
              <TouchableOpacity activeOpacity={0.85} onPress={openHostCard}>
                <Image source={{ uri: room?.hostImg || DEFAULT_AVATAR }} style={styles.hostPillImg} />
              </TouchableOpacity>
              <View style={{ marginLeft: 7, maxWidth: width * 0.28 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.hostPillName} numberOfLines={1}>{room?.hostName || 'Host'}</Text>
                  <UserTick uid={hostSeat.userId || hostSeat.uid} verified={!!(isVerified(hostSeat.verified))} verifiedColor={hostSeat.verifiedColor} size={13} />
                </View>
                <View style={styles.coinRow}>
                  <View style={styles.coinDotSm} />
                  <Text style={styles.coinText}>{fmt(room?.seatStars?.[hostId] || 0)}</Text>
                </View>
              </View>
              {!isHost && !!hostId && !isFollowing && (
                <TouchableOpacity onPress={toggleFollowHost} disabled={followBusy} style={styles.followPlus}>
                  <Ionicons name="add" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity style={styles.viewerStrip} activeOpacity={0.8} onPress={() => setViewerListVisible(true)}>
              {topViewers.map((v) => (
                <Image key={v.uid} source={{ uri: v.img || DEFAULT_AVATAR }} style={styles.viewerImg} />
              ))}
            </TouchableOpacity>

            <View style={styles.countPill}><Text style={styles.countText}>{viewerCount}</Text></View>
            <TouchableOpacity onPress={() => setExitVisible(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* ===== weekly host + family card ===== */}
          <View style={styles.subRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.weeklyChip}>
                <Ionicons name="stats-chart" size={13} color={YELLOW} />
                <Text style={styles.weeklyText}>Weekly Host</Text>
              </View>
              {isHost && <WeeklyMinutesPill startTime={roomStartTime || startFallbackRef.current} />}
              {agora.netQuality > 0 && (
                <Ionicons name="cellular" size={13} style={{ marginLeft: 8 }}
                  color={agora.netQuality >= 4 ? '#FF5252' : agora.netQuality === 3 ? '#FFC107' : '#69F0AE'} />
              )}
            </View>
            {room?.family?.name ? (
              <LinearGradient colors={['#ff7a59', '#ff4d6d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.familyCard}>
                <Text style={styles.familyName} numberOfLines={1}>{room.family.name}</Text>
                <Text style={styles.familySub}>No.{room.family.rank || '-'}  +{room.family.points || 0}</Text>
              </LinearGradient>
            ) : null}
          </View>

          {/* ===== title / pinned / status ===== */}
          {(!!roomTitle || !!pinnedText || agora.netQuality >= 4 || agoraFailed) && (
            <View style={styles.infoRow}>
              {!!roomTitle && <View style={styles.titlePill}><Text numberOfLines={1} style={styles.titleTxt}>{roomTitle}</Text></View>}
              {!!pinnedText && (
                <View style={styles.pinPill}>
                  <Text style={{ fontSize: 11 }}>📌</Text>
                  <Text numberOfLines={1} style={styles.pinTxt}>{pinnedText}</Text>
                </View>
              )}
              {agoraFailed ? (
                <TouchableOpacity style={styles.netPill} onPress={agora.retry}>
                  <Text style={styles.netTxt}>⚠ Connection failed · Retry</Text>
                </TouchableOpacity>
              ) : agora.netQuality >= 4 ? (
                <View style={styles.netPill}><Text style={styles.netTxt}>⚠ Weak connection</Text></View>
              ) : null}
            </View>
          )}

          {/* ===== 3x3 video grid ===== */}
          <View style={styles.grid}>
            {SEAT_KEYS.map((k, i) => {
              const s = seats[k] || {};
              const mine = !!s.userId && s.userId === myUid;
              const aid = Number(s.agoraUid || 0);
              const showVideo = !!s.userId && !s.isCamOff && (mine ? agora.ready : !!aid && agora.remoteVideoOn[aid] === true);
              return (
                <Tile
                  key={k}
                  index={i}
                  seat={s}
                  score={Number(room?.seatStars?.[s.userId] || 0)}
                  extraGifters={rankedGifters.slice(0, 3).map((g) => g.img)}
                  mine={mine}
                  speaking={!!aid && agora.speaking.has(aid) && !(s.isMuted || s.hostMuted)}
                  showVideo={showVideo}
                  canvasUid={mine ? 0 : aid}
                  onPress={() => onTilePress(k)}
                />
              );
            })}
          </View>

          {/* ===== chat ===== */}
          <FlatList
            style={styles.chatList}
            data={chats}
            inverted
            keyExtractor={chatKeyExtractor}
            renderItem={renderChat}
            maxToRenderPerBatch={8}
            updateCellsBatchingPeriod={50}
            initialNumToRender={12}
            windowSize={7}
            removeClippedSubviews={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={<View style={styles.welcomeBox}><Text style={styles.welcomeTxt}>{WELCOME_TEXT}</Text></View>}
          />

          {/* ===== emoji strip ===== */}
          {emojiOpen && chatOpen && (
            <View style={styles.emojiStrip}>
              {QUICK_EMOJIS.map((e) => (
                <TouchableOpacity key={e} onPress={() => setText((m) => (m + e).slice(0, 200))}>
                  <Text style={{ fontSize: 24, marginHorizontal: 6 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ===== bottom bar ===== */}
          {chatOpen ? (
            <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
              <View style={styles.inputWrap}>
                <TextInput
                  autoFocus
                  style={styles.input}
                  placeholder="Say hi..."
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  value={text}
                  onChangeText={setText}
                  onSubmitEditing={sendChat}
                  returnKeyType="send"
                  maxLength={200}
                />
                <TouchableOpacity onPress={() => setEmojiOpen((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: 20 }}>😊</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[styles.circleBtn, { backgroundColor: YELLOW }]} onPress={sendChat}>
                <Ionicons name="send" size={18} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.circleBtn} onPress={() => { setChatOpen(false); Keyboard.dismiss(); }}>
                <Ionicons name="chevron-down" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
              <TouchableOpacity style={styles.chatPill} activeOpacity={0.85} onPress={openChat}>
                <Ionicons name="chatbubble-outline" size={18} color="#fff" />
                <Text style={styles.chatPillText}>Chat</Text>
              </TouchableOpacity>

              <View style={{ flex: 1 }} />

              <TouchableOpacity style={styles.plainBtn} onPress={shareRoom}>
                <Ionicons name="arrow-redo-outline" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.plainBtn} onPress={() => (isMod && seatRequests.length ? setRequestsVisible(true) : setMenuOpen(true))}>
                <Ionicons name="menu" size={26} color="#fff" />
                {isMod && seatRequests.length > 0 && (
                  <View style={{ position: 'absolute', top: 2, right: 0, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#ff4d6d', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{seatRequests.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.plainBtn} onPress={sendLike}>
                <Text style={{ fontSize: 22 }}>❤️</Text>
              </TouchableOpacity>

              {/* yellow button: seat nahi hai -> baith jao, seat par hai -> mic on/off */}
              <TouchableOpacity
                style={[styles.circleBtn, { backgroundColor: YELLOW, marginLeft: 4 }]}
                onPress={() => (mySeatKey ? toggleMyMic() : joinFirstFree())}
              >
                <Ionicons name={mySeatKey ? (myMicOn ? 'mic' : 'mic-off') : 'link'} size={20} color="#000" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.giftCircle} onPress={() => openGiftModal()}>
                <LottieView
                  source={require('../assets/animations/giftButton.json')}
                  autoPlay
                  loop
                  renderMode="HARDWARE"
                  hardwareAccelerationAndroid
                  cacheComposition
                  style={{ width: 46, height: 46 }}
                />
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      <HeartsLayer ref={heartsRef} bottom={bottomPad + 52} />
      <GiftOverlay activeGift={activeGift} playKey={giftPlayKey} onFinish={handleGiftFinish} />

      {giftCombo && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', top: height * 0.55, left: 10, zIndex: 99998, elevation: 99998,
            flexDirection: 'row', alignItems: 'center', opacity: giftOpacity,
            transform: [{ translateX: giftTranslateX }, { scale: giftScale }],
          }}
        >
          <View style={styles.comboPill}>
            <Animated.Image
              source={{ uri: giftCombo.senderImg || DEFAULT_AVATAR }}
              style={{
                width: 44, height: 44, borderRadius: 22, marginRight: 8, backgroundColor: '#2a2b38',
                transform: [{ rotate: giftShake.interpolate({ inputRange: [-1, 1], outputRange: ['-8deg', '8deg'] }) }],
              }}
            />
            <View style={{ flexShrink: 1 }}>
              <Text numberOfLines={1} style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{giftCombo.senderName}</Text>
              <Text numberOfLines={1} style={{ color: '#fff', fontSize: 13, marginTop: 1 }}>
                send <Text style={{ color: '#FFE600', fontWeight: 'bold' }}>@{giftCombo.receiverName || 'user'}</Text>
              </Text>
            </View>
          </View>
          {(() => {
            const gd = gifts.find((g) => String(g.id) === String(giftCombo.giftId));
            return gd?.icon ? <Image source={gd.icon} style={{ width: 58, height: 58, resizeMode: 'contain', marginLeft: 6 }} /> : null;
          })()}
          <Text style={styles.comboX}>x{giftCombo.count || 1}</Text>
        </Animated.View>
      )}

      {joinBanner && <JoinEntry key={joinBanner._k} data={joinBanner} variant={JOIN_ANIM_VARIANT} onDone={handleJoinDone} />}

      {!!toast && (
        <View pointerEvents="none" style={[styles.toastWrap, { bottom: bottomPad + 56 }]}>
          <View style={styles.toastPill}>
            <View style={styles.toastIcon}><Ionicons name="checkmark" size={14} color="#111" /></View>
            <Text style={styles.toastTxt}>{toast}</Text>
          </View>
        </View>
      )}

      {/* ===== exit confirm ===== */}
      <Modal transparent visible={exitVisible} animationType="fade" onRequestClose={() => setExitVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.exitBox}>
            <Text style={styles.exitTitle}>{isHost ? 'End Live?' : 'Leave Live?'}</Text>
            <Text style={styles.exitSub}>
              {isHost ? 'Your live stream will end for everyone watching.' : 'You can rejoin anytime while the host is still live.'}
            </Text>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.noBtn} onPress={() => setExitVisible(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.yesBtn} onPress={confirmExit}>
                <Text style={styles.btnText}>{isHost ? 'End Live' : 'Leave'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== menu (hamburger) ===== */}
      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={[styles.sheet, { paddingBottom: bottomPad + 6 }]} onStartShouldSetResponder={() => true}>
            <View style={styles.menuGrid}>
              {menuItems.map((it) => (
                <MenuItem
                  key={it.key}
                  icon={it.icon}
                  label={it.label}
                  active={it.active}
                  onPress={() => { setMenuOpen(false); setTimeout(() => it.onPress && it.onPress(), 250); }}
                />
              ))}
              <MenuItem
                icon={<Ionicons name={isHost ? 'power' : 'log-out-outline'} size={24} color="#ff4d6d" />}
                label={isHost ? 'End live' : 'Leave room'}
                danger
                onPress={() => { setMenuOpen(false); setTimeout(() => setExitVisible(true), 250); }}
              />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== seat controls (host / mod) ===== */}
      <Modal visible={!!seatMenuKey} transparent animationType="slide" onRequestClose={() => setSeatMenuKey(null)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setSeatMenuKey(null)}>
          <View style={[styles.sheet, { paddingBottom: bottomPad + 6 }]} onStartShouldSetResponder={() => true}>
            {seatMenuSeat?.userId ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingHorizontal: 6 }}>
                  <Image source={{ uri: seatMenuSeat.userImg || DEFAULT_AVATAR }} style={styles.pkRowAva} />
                  <Text style={[styles.sheetTitle, { marginLeft: 12, flex: 1 }]} numberOfLines={1}>{seatMenuSeat.userName || 'Guest'}</Text>
                </View>
                <TouchableOpacity style={styles.actionRow} onPress={() => {
                  const s = seatMenuSeat;
                  setSeatMenuKey(null);
                  setProfileCard({ uid: s.userId, name: s.userName, img: s.userImg, level: s.level, verified: s.verified, verifiedColor: s.verifiedColor });
                }}>
                  <Ionicons name="person-circle-outline" size={22} color="#fff" />
                  <Text style={styles.actionTxt}>View profile</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionRow} onPress={() => { openGiftModal(seatMenuSeat.userId); setSeatMenuKey(null); }}>
                  <Ionicons name="gift-outline" size={22} color="#fff" />
                  <Text style={styles.actionTxt}>Send gift</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionRow} onPress={() => { hostMuteSeat(seatMenuKey); setSeatMenuKey(null); }}>
                  <Ionicons name={seatMenuSeat.hostMuted ? 'mic' : 'mic-off'} size={22} color="#fff" />
                  <Text style={styles.actionTxt}>{seatMenuSeat.hostMuted ? 'Unmute mic' : 'Mute mic'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionRow} onPress={() => { removeFromSeat(seatMenuKey); setSeatMenuKey(null); }}>
                  <Ionicons name="arrow-down-circle-outline" size={22} color="#fff" />
                  <Text style={styles.actionTxt}>Remove from seat</Text>
                </TouchableOpacity>
                {isHost && (
                  <TouchableOpacity style={styles.actionRow} onPress={() => toggleMod({ uid: seatMenuSeat.userId })}>
                    <Ionicons name="shield-checkmark-outline" size={22} color="#fff" />
                    <Text style={styles.actionTxt}>{mods[seatMenuSeat.userId] ? 'Remove moderator' : 'Make moderator'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.actionRow} onPress={() => kickUser({ uid: seatMenuSeat.userId, name: seatMenuSeat.userName })}>
                  <Ionicons name="ban-outline" size={22} color="#ff4d6d" />
                  <Text style={[styles.actionTxt, { color: '#ff4d6d' }]}>Kick from live</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== seat requests (host / mod) ===== */}
      <Modal transparent visible={requestsVisible} animationType="slide" onRequestClose={() => setRequestsVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setRequestsVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { height: height * 0.5 }]}>
            <Text style={styles.sheetTitle}>🙋 Seat Requests ({seatRequests.length})</Text>
            <Text style={styles.sheetSub}>Accept karoge to user video par aa jayega.</Text>
            {seatRequests.length === 0 ? (
              <Text style={styles.emptyTxt}>Abhi koi request nahi hai.</Text>
            ) : (
              <FlatList
                data={seatRequests}
                keyExtractor={(i) => i.uid}
                renderItem={({ item }) => {
                  const th = getLevelTheme(item.level || 1);
                  return (
                    <View style={styles.pkRow}>
                      <Image source={{ uri: item.img || DEFAULT_AVATAR }} style={styles.pkRowAva} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.pkRowName} numberOfLines={1}>{item.name || item.username || 'User'}</Text>
                          <View style={[styles.levelBadge, { backgroundColor: th.bg, borderColor: th.border }]}>
                            <MaterialCommunityIcons name="diamond-stone" size={9} color={th.icon} />
                            <Text style={[styles.levelText, { color: th.text }]}>LV {item.level || 1}</Text>
                          </View>
                        </View>
                      </View>
                      <TouchableOpacity style={[styles.kickBtn, { backgroundColor: '#374151', marginRight: 8 }]} onPress={() => rejectRequest(item)}>
                        <Ionicons name="close" size={16} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.kickBtn, { backgroundColor: '#22C55E' }]} onPress={() => acceptRequest(item)}>
                        <Text style={styles.kickBtnTxt}>Accept ✅</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ===== gift sheet ===== */}
      <Modal visible={giftModalVisible} transparent animationType="fade" statusBarTranslucent hardwareAccelerated onRequestClose={() => setGiftModalVisible(false)}>
        <View style={styles.giftOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setGiftModalVisible(false)} />
          <Animated.View
            style={[styles.giftSheet, {
              paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 28 : 14) + 10,
              transform: [{ translateY: giftModalAnim }],
            }]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.giftTitle}>🎁 Send Gifts</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 16 }}>⭐</Text>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: 'bold', marginLeft: 4 }}>{stars}</Text>
                <TouchableOpacity style={styles.rechargeBtn} onPress={goRecharge}>
                  <Text style={styles.rechargeTxt}>+ Recharge</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6, flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: 6, paddingVertical: 4 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {giftUsers.map((user) => (
                <TouchableOpacity key={user.uid} onPress={() => setSelectedGiftUser(user.uid)} style={{ alignItems: 'center', marginRight: 10 }}>
                  <Image
                    source={{ uri: user.img || DEFAULT_AVATAR }}
                    style={{
                      width: 44, height: 44, borderRadius: 22,
                      borderWidth: selectedGiftUser === user.uid ? 3 : 1,
                      borderColor: selectedGiftUser === user.uid ? '#ff1493' : '#555',
                    }}
                  />
                  <Text style={{ color: '#fff', fontSize: 9, width: 52, textAlign: 'center', marginTop: 2 }} numberOfLines={1}>
                    {user.uid === hostId ? 'Host' : user.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={[styles.qtyRow, { marginBottom: 6 }]}>
              <Text style={styles.qtyLbl}>Qty</Text>
              {GIFT_QTY.map((q) => (
                <TouchableOpacity key={q} onPress={() => setGiftQty(q)} style={[styles.qtyChip, giftQty === q && styles.qtyChipOn]}>
                  <Text style={[styles.qtyChipTxt, giftQty === q && { color: '#fff' }]}>x{q}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <FlatList
              data={GIFT_PAGES}
              keyExtractor={(p) => p.key}
              renderItem={({ item }) => <GiftPage page={item} qty={giftQty} onSend={stableSendGift} />}
              extraData={giftQty}
              horizontal
              snapToInterval={GIFT_PAGE_W}
              snapToAlignment="start"
              disableIntervalMomentum
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              getItemLayout={(_, index) => ({ length: GIFT_PAGE_W, offset: GIFT_PAGE_W * index, index })}
              initialNumToRender={2}
              maxToRenderPerBatch={2}
              windowSize={5}
              removeClippedSubviews={false}
              bounces={Platform.OS === 'ios'}
              overScrollMode="never"
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              onMomentumScrollEnd={(e) => {
                const idx = Math.max(0, Math.min(GIFT_PAGES.length - 1, Math.round(e.nativeEvent.contentOffset.x / GIFT_PAGE_W)));
                setGiftPageIdx((prev) => (prev === idx ? prev : idx));
              }}
            />
            {GIFT_PAGES.length > 1 && (
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 2 }}>
                {GIFT_PAGES.map((p, i) => (
                  <View key={p.key} style={{
                    width: i === giftPageIdx ? 14 : 6, height: 6, borderRadius: 3, marginHorizontal: 3,
                    backgroundColor: i === giftPageIdx ? '#ff1493' : 'rgba(255,255,255,0.3)',
                  }} />
                ))}
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>

      {/* ===== viewers ===== */}
      <Modal transparent visible={viewerListVisible} animationType="slide" onRequestClose={() => setViewerListVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setViewerListVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { height: height * 0.6 }]}>
            <Text style={styles.sheetTitle}>👥 Viewers ({viewerCount})</Text>
            <Text style={styles.sheetSub}>Tap a person to see their profile.</Text>
            {isMod && (
              <View style={styles.modBar}>
                <TouchableOpacity style={[styles.modBarBtn, chatLocked && { backgroundColor: '#F71084' }]} onPress={toggleChatLock}>
                  <Ionicons name={chatLocked ? 'lock-closed' : 'lock-open-outline'} size={15} color="#fff" />
                  <Text style={styles.modBarTxt}>{chatLocked ? 'Chat locked' : 'Lock chat'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modBarBtn, { backgroundColor: '#DC2626' }]} onPress={deleteAllChats}>
                  <Ionicons name="trash-outline" size={15} color="#fff" />
                  <Text style={styles.modBarTxt}>Delete all chats</Text>
                </TouchableOpacity>
              </View>
            )}
            {audienceArray.filter((u) => u.uid !== hostId).length === 0 ? (
              <Text style={styles.emptyTxt}>No viewers yet. Share the live to get people in!</Text>
            ) : (
              <FlatList
                data={[...audienceArray].filter((u) => u.uid !== hostId).sort((a, b) => Number(b.level || 1) - Number(a.level || 1))}
                keyExtractor={(i) => i.uid}
                renderItem={({ item }) => {
                  const th = getLevelTheme(item.level || 1);
                  return (
                    <TouchableOpacity
                      style={styles.pkRow}
                      onPress={() => {
                        setViewerListVisible(false);
                        setProfileCard({
                          uid: item.uid, name: item.name || item.username, username: item.username, img: item.img,
                          level: item.level, verified: item.verified, verifiedColor: item.verifiedColor,
                        });
                      }}
                    >
                      <Image source={{ uri: item.img || DEFAULT_AVATAR }} style={styles.pkRowAva} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.pkRowName} numberOfLines={1}>{item.name || item.username || 'User'}</Text>
                          <UserTick uid={item.uid || item.userId || item.senderId || item.id} verified={!!(!!item.verified)} verifiedColor={item.verifiedColor} size={14} />
                          <View style={[styles.levelBadge, { backgroundColor: th.bg, borderColor: th.border }]}>
                            <MaterialCommunityIcons name="diamond-stone" size={9} color={th.icon} />
                            <Text style={[styles.levelText, { color: th.text }]}>LV {item.level || 1}</Text>
                          </View>
                        </View>
                        {(mods[item.uid] || mutedUsers[item.uid]) && (
                          <Text style={styles.pkRowSub}>
                            {mods[item.uid] ? 'Moderator' : ''}{mods[item.uid] && mutedUsers[item.uid] ? ' · ' : ''}{mutedUsers[item.uid] ? 'Muted' : ''}
                          </Text>
                        )}
                      </View>
                      {canModerate(item) ? (
                        <TouchableOpacity style={styles.kickBtn} onPress={() => kickUser({ uid: item.uid, name: item.name || item.username })}>
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

      {/* ===== top gifters ===== */}
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
                keyExtractor={(i) => i.uid}
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    style={styles.pkRow}
                    onPress={() => {
                      setRankVisible(false);
                      setProfileCard({ uid: item.uid, name: item.name, img: item.img, level: item.level, verified: item.verified });
                    }}
                  >
                    <Text style={[styles.rankNum, index < 3 && { color: ['#FFD700', '#C0C0C0', '#CD7F32'][index] }]}>{index + 1}</Text>
                    <Image source={{ uri: item.img || DEFAULT_AVATAR }} style={styles.pkRowAva} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.pkRowName} numberOfLines={1}>{item.name || 'User'}</Text>
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

      {/* ===== profile card ===== */}
      <Modal transparent visible={!!profileCard} animationType="fade" onRequestClose={() => setProfileCard(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setProfileCard(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.pcBox}>
            {profileCard && (
              <>
                <View style={{ width: 96, height: 96, justifyContent: 'center', alignItems: 'center' }}>
                  <Image source={{ uri: profileCard.img || DEFAULT_AVATAR }} style={styles.pcAva} />
                  {(Number(profileCard.level) >= 10 || !!profileCard.uid) && (
                    <LevelFrame level={Number(profileCard.level)} uid={profileCard.uid} animated style={{ position: 'absolute', width: 110, height: 110 }} />
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                  <Text style={styles.pcName} numberOfLines={1}>{profileCard.name || profileCard.username || 'User'}</Text>
                  <UserTick uid={profileCard.uid || profileCard.userId || profileCard.senderId || profileCard.id} verified={!!(!!profileCard.verified)} verifiedColor={profileCard.verifiedColor} size={17} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                  {(() => {
                    const th = getLevelTheme(Number(profileCard.level) || 1);
                    return (
                      <View style={[styles.levelBadge, { backgroundColor: th.bg, borderColor: th.border, marginLeft: 0 }]}>
                        <MaterialCommunityIcons name="diamond-stone" size={10} color={th.icon} />
                        <Text style={[styles.levelText, { color: th.text }]}>LV {profileCard.level || 1}</Text>
                      </View>
                    );
                  })()}
                  {profileCard.uid === hostId && <View style={[styles.roleTag, { backgroundColor: '#F71084', marginLeft: 6 }]}><Text style={styles.roleTagTxt}>HOST</Text></View>}
                  {!!mods[profileCard.uid] && <View style={[styles.roleTag, { backgroundColor: '#2D9CFF', marginLeft: 6 }]}><Text style={styles.roleTagTxt}>MOD</Text></View>}
                  {!!mutedUsers[profileCard.uid] && <View style={[styles.roleTag, { backgroundColor: '#6b7280', marginLeft: 6 }]}><Text style={styles.roleTagTxt}>MUTED</Text></View>}
                </View>

                {profileCard.uid !== myUid && (
                  <View style={styles.pcBtns}>
                    <TouchableOpacity
                      style={[styles.pcBtn, profileFollowing ? { backgroundColor: '#374151' } : { backgroundColor: '#F71084' }]}
                      onPress={toggleProfileFollow}
                    >
                      <Text style={styles.pcBtnTxt}>{profileFollowing ? 'Following' : '+ Follow'}</Text>
                    </TouchableOpacity>

                    {giftUsers.some((u) => u.uid === profileCard.uid) && (
                      <TouchableOpacity
                        style={[styles.pcBtn, { backgroundColor: '#F59E0B' }]}
                        onPress={() => { const u = profileCard.uid; setProfileCard(null); openGiftModal(u); }}
                      >
                        <Text style={styles.pcBtnTxt}>🎁 Send Gift</Text>
                      </TouchableOpacity>
                    )}

                    {canModerate(profileCard) && (
                      <>
                        <TouchableOpacity style={[styles.pcBtn, { backgroundColor: '#374151' }]} onPress={() => muteUserChat(profileCard, !mutedUsers[profileCard.uid])}>
                          <Text style={styles.pcBtnTxt}>{mutedUsers[profileCard.uid] ? '🔊 Unmute chat' : '🔇 Mute chat'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.pcBtn, { backgroundColor: '#DC2626' }]} onPress={() => kickUser(profileCard)}>
                          <Text style={styles.pcBtnTxt}>🚫 Remove from live</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {isHost && profileCard.uid !== hostId && (
                      <TouchableOpacity style={[styles.pcBtn, { backgroundColor: '#2D9CFF' }]} onPress={() => toggleMod(profileCard)}>
                        <Text style={styles.pcBtnTxt}>{mods[profileCard.uid] ? 'Remove moderator' : '🛡 Make moderator'}</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.pcBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#4b5563' }]}
                      onPress={() => { setReportTarget(profileCard); setProfileCard(null); }}
                    >
                      <Text style={[styles.pcBtnTxt, { color: '#f87171' }]}>⚑ Report</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ===== report ===== */}
      <Modal transparent visible={!!reportTarget} animationType="slide" onRequestClose={() => setReportTarget(null)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setReportTarget(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <Text style={styles.sheetTitle}>Report {reportTarget?.name || 'user'}</Text>
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

      {/* ===== host setup ===== */}
      <Modal transparent visible={settingsVisible} animationType="slide" onRequestClose={() => setSettingsVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setSettingsVisible(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.sheet}>
              <Text style={styles.sheetTitle}>Live Setup</Text>
              <Text style={styles.fieldLbl}>Live title</Text>
              <TextInput style={styles.fieldInput} value={titleDraft} onChangeText={setTitleDraft}
                placeholder="e.g. Singing tonight 🎤" placeholderTextColor="#6b7280" maxLength={60} />
              <Text style={styles.fieldLbl}>Pinned message (shown to everyone)</Text>
              <TextInput style={[styles.fieldInput, { height: 70, textAlignVertical: 'top' }]} value={pinDraft} onChangeText={setPinDraft}
                placeholder="Welcome! Follow & send gifts 💖" placeholderTextColor="#6b7280" multiline maxLength={140} />
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLblDark}>Turn off chat for viewers</Text>
                  <Text style={styles.pkRowSub}>You and moderators can still chat.</Text>
                </View>
                <Switch value={lockDraft} onValueChange={setLockDraft} trackColor={{ true: '#F71084', false: '#374151' }} />
              </View>
              <TouchableOpacity style={[styles.modBarBtn, { backgroundColor: '#DC2626', marginTop: 16, justifyContent: 'center', paddingVertical: 11 }]} onPress={deleteAllChats}>
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

      {/* ===== beauty filters ===== */}
      <Modal transparent visible={filterVisible} animationType="slide" onRequestClose={() => setFilterVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setFilterVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <Text style={styles.sheetTitle}>Beauty & Filters</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6 }}>
              {FILTERS.map((f) => (
                <TouchableOpacity key={f.id} style={styles.filterItem} onPress={() => { agora.applyBeauty(f); setFilterId(f.id); }}>
                  <View style={[styles.filterCircle, filterId === f.id && styles.filterCircleActive]}>
                    <Text style={{ fontSize: 24 }}>{f.icon}</Text>
                  </View>
                  <Text style={[styles.filterLabel, filterId === f.id && { color: '#F71084' }]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ===== host: live ended summary ===== */}
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
                  { k: 'Total Viewers', v: String(summary?.peak || 0) },
                  { k: 'Stars earned', v: String(summary?.stars || 0) },
                  { k: 'New Fans', v: String(summary?.followers || 0) },
                  { k: 'LIVE Time', v: fmtDur(summary?.durationMs || 0) },
                ].map((c) => (
                  <View key={c.k} style={styles.endCell}>
                    <Text style={styles.endVal}>{c.v}</Text>
                    <Text style={styles.endLbl}>{c.k}</Text>
                  </View>
                ))}
              </View>
            </View>
            {!!summary?.gifters?.length && (
              <View style={styles.endCard}>
                <Text style={styles.endCardTitle}>Top gifters</Text>
                {summary.gifters.map((g, i) => (
                  <View key={g.uid} style={styles.sumGifter}>
                    <Text style={{ color: ['#FFD700', '#C0C0C0', '#CD7F32'][i], fontWeight: '800', width: 20 }}>{i + 1}</Text>
                    <Image source={{ uri: g.img || DEFAULT_AVATAR }} style={{ width: 34, height: 34, borderRadius: 17 }} />
                    <Text style={styles.sumGifterName} numberOfLines={1}>{g.name}</Text>
                    <Text style={styles.rankStars}>⭐ {g.stars}</Text>
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity style={styles.endCentre} onPress={doLeaveNow} activeOpacity={0.85}>
              <View style={{ flex: 1 }}>
                <Text style={styles.endCentreTitle}>Done</Text>
                <Text style={styles.endCentreSub}>Back to home</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#111" />
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a0b2e' },

  // top
  topBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 8, paddingBottom: 6,
  },
  hostPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 22, padding: 3, paddingRight: 10, flexShrink: 1 },
  hostPillImg: { width: 34, height: 34, borderRadius: 17 },
  hostPillName: { color: '#fff', fontSize: 12, fontWeight: '800' },
  followPlus: { marginLeft: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: '#F71084', justifyContent: 'center', alignItems: 'center' },
  coinRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  coinDotSm: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#ffc107', marginRight: 4 },
  coinText: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '700' },
  viewerStrip: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', marginRight: 6 },
  viewerImg: { width: 28, height: 28, borderRadius: 14, marginLeft: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  countPill: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 7, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  countText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // weekly + family
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, minHeight: 34, marginBottom: 6 },
  weeklyChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  weeklyText: { color: '#fff', fontSize: 12, fontWeight: '700', marginLeft: 5 },
  minPill: { marginLeft: 8, minWidth: 90, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.35)', overflow: 'hidden', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  minFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,200,0,0.55)' },
  minTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  familyCard: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5, maxWidth: width * 0.4 },
  familyName: { color: '#fff', fontSize: 12, fontWeight: '800' },
  familySub: { color: '#fff', fontSize: 10, fontWeight: '700', marginTop: 1 },

  // info
  infoRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: 12, marginBottom: 6 },
  titlePill: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, marginRight: 6, marginBottom: 2, maxWidth: width * 0.45 },
  titleTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  pinPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,193,7,0.22)', borderColor: 'rgba(255,193,7,0.7)', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6, marginBottom: 2, maxWidth: width * 0.5 },
  pinTxt: { color: '#FFE9A6', fontSize: 11, fontWeight: '600', marginLeft: 5, flexShrink: 1 },
  netPill: { backgroundColor: 'rgba(220,38,38,0.85)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 2 },
  netTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: 'rgba(0,0,0,0.25)' },
  tile: {
    width: TILE_W, height: TILE_H, overflow: 'hidden', justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(20,8,32,0.55)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  tileBlur: { ...StyleSheet.absoluteFillObject },
  tileDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  avatarWrap: { width: TILE_W * 0.42, height: TILE_W * 0.42, borderRadius: TILE_W * 0.21, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', overflow: 'hidden' },
  avatarSpeaking: { borderColor: '#3cff7a', borderWidth: 3 },
  avatarImg: { width: '100%', height: '100%' },
  emptyWrap: { justifyContent: 'center', alignItems: 'center' },
  speakBorder: { ...StyleSheet.absoluteFillObject, borderWidth: 2, borderColor: '#3cff7a' },
  mineBorder: { ...StyleSheet.absoluteFillObject, borderWidth: 2, borderColor: YELLOW },
  hostTag: { position: 'absolute', top: 0, left: 0, backgroundColor: '#ff7a1a', paddingHorizontal: 7, paddingVertical: 2, borderBottomRightRadius: 8 },
  hostTagText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  seatNo: { position: 'absolute', top: 4, left: 6, color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700' },
  micBadge: { position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: YELLOW, justifyContent: 'center', alignItems: 'center' },
  nameShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 46 },
  bottomInfo: { position: 'absolute', left: 6, right: 6, bottom: 4, flexDirection: 'row', alignItems: 'flex-end' },
  nameText: { color: '#fff', fontSize: 11, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  coinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ffc107', marginRight: 4 },
  scoreText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  gifterRow: { flexDirection: 'row', alignItems: 'center' },
  gifterImg: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: '#fff' },

  // chat
  chatList: { flex: 1, paddingHorizontal: 12, marginTop: 8 },
  chatRow: { flexDirection: 'row', marginBottom: 10, alignItems: 'flex-start' },
  chatAva: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#2a2b38' },
  chatFrame: { position: 'absolute', width: 42, height: 42, resizeMode: 'contain' },
  chatContent: { flex: 1, marginLeft: 8 },
  chatUser: { color: '#fff', fontWeight: 'bold', fontSize: 11 },
  bubble: { backgroundColor: 'rgba(0,0,0,0.45)', padding: 8, borderRadius: 10, alignSelf: 'flex-start', marginTop: 3 },
  chatMsg: { color: '#fff', fontSize: 12 },
  sysRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, marginBottom: 4 },
  sysAva: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#2a2b38' },
  sysFrame: { position: 'absolute', width: 30, height: 30, top: -4, left: -4 },
  sysText: { color: '#e0e0e0', fontSize: 13, fontWeight: '600' },
  welcomeBox: { backgroundColor: 'rgba(110,90,125,0.62)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, alignSelf: 'flex-start', maxWidth: '92%' },
  welcomeTxt: { color: '#fff', fontSize: 13, fontWeight: '500' },
  levelBadge: { marginLeft: 6, flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  levelText: { fontSize: 8, fontWeight: 'bold', marginLeft: 2 },
  roleTag: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 5 },
  roleTagTxt: { color: '#fff', fontSize: 8, fontWeight: '800' },
  emojiStrip: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginHorizontal: 12, backgroundColor: 'rgba(17,24,39,0.92)', borderRadius: 22, paddingVertical: 6 },
  heartsLayer: { position: 'absolute', right: 0, width: 90, height: 280 },

  // bottom
  bottomBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 70 },
  chatPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20, paddingHorizontal: 14, height: 38 },
  chatPillText: { color: '#fff', fontSize: 14, fontWeight: '600', marginLeft: 6 },
  plainBtn: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },
  circleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  giftCircle: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginLeft: 4 },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, marginRight: 8 },
  input: { flex: 1, color: '#fff', fontSize: 14 },

  // sheets
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 18, paddingHorizontal: 16, paddingBottom: 30 },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  sheetSub: { color: '#9aa0b4', fontSize: 12, marginTop: 4, marginBottom: 12 },
  emptyTxt: { color: '#9aa0b4', textAlign: 'center', marginTop: 40, fontSize: 13 },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 6 },
  menuItem: { width: '25%', alignItems: 'center', marginBottom: 18 },
  menuIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#1C1E2E', justifyContent: 'center', alignItems: 'center' },
  menuIconOn: { backgroundColor: '#F71084' },
  menuLbl: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 6, maxWidth: 76, textAlign: 'center' },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 8 },
  actionTxt: { color: '#fff', fontSize: 15, fontWeight: '700', marginLeft: 14 },

  pkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  pkRowAva: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#2a2b38' },
  pkRowName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  pkRowSub: { color: '#9aa0b4', fontSize: 11, marginTop: 2 },
  modBar: { flexDirection: 'row', marginTop: 4, marginBottom: 6 },
  modBarBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8 },
  modBarTxt: { color: '#fff', fontSize: 12, fontWeight: '700', marginLeft: 6 },
  kickBtn: { backgroundColor: '#DC2626', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  kickBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  rankNum: { color: '#9aa0b4', width: 26, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  rankStars: { color: '#FFE600', fontWeight: '800', fontSize: 13 },

  // gifts
  giftAnimWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 99999, elevation: 99999 },
  giftOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  giftSheet: { backgroundColor: '#111827', maxHeight: height * 0.52, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, paddingHorizontal: 12, paddingBottom: 14 },
  giftTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  giftCard: { width: '22.5%', marginRight: '2%', backgroundColor: '#1C1E2E', borderRadius: 10, padding: 5, marginBottom: 10, alignItems: 'center' },
  giftName: { color: '#fff', fontSize: 10 },
  giftCoin: { color: '#999', fontSize: 12, marginTop: 2 },
  rechargeBtn: { marginLeft: 10, backgroundColor: '#22C55E', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  rechargeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  qtyLbl: { color: '#9aa0b4', fontSize: 12, marginRight: 10, fontWeight: '600' },
  qtyChip: { borderWidth: 1, borderColor: '#4b5563', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4, marginRight: 8 },
  qtyChipOn: { backgroundColor: '#F71084', borderColor: '#F71084' },
  qtyChipTxt: { color: '#cbd5e1', fontSize: 12, fontWeight: '700' },
  comboPill: { flexDirection: 'row', alignItems: 'center', paddingLeft: 6, paddingRight: 14, paddingVertical: 6, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1.5, borderColor: 'rgba(255,105,180,0.8)', maxWidth: width * 0.62 },
  comboX: { color: '#FF69B4', fontSize: 34, fontWeight: '900', fontStyle: 'italic', marginLeft: 4, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },

  // exit / profile / report / settings
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  exitBox: { width: '80%', backgroundColor: '#1C1E2E', padding: 25, borderRadius: 20, alignItems: 'center' },
  exitTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  exitSub: { color: '#9aa0b4', textAlign: 'center', marginTop: 10, fontSize: 12 },
  btnRow: { flexDirection: 'row', marginTop: 22 },
  noBtn: { backgroundColor: '#34495e', paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10, marginRight: 15 },
  yesBtn: { backgroundColor: '#e74c3c', paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  pcBox: { width: '82%', backgroundColor: '#1C1E2E', borderRadius: 22, padding: 22, alignItems: 'center' },
  pcAva: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: '#fff', backgroundColor: '#2a2b38' },
  pcName: { color: '#fff', fontSize: 18, fontWeight: '800', maxWidth: 200 },
  pcBtns: { width: '100%', marginTop: 16 },
  pcBtn: { borderRadius: 14, paddingVertical: 11, alignItems: 'center', marginBottom: 8 },
  pcBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#374151' },
  reasonTxt: { color: '#fff', fontSize: 14, fontWeight: '600' },
  fieldLbl: { color: '#9aa0b4', fontSize: 12, marginTop: 14, marginBottom: 6, fontWeight: '600' },
  fieldLblDark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  fieldInput: { backgroundColor: '#1C1E2E', color: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  saveBtn: { backgroundColor: '#F71084', borderRadius: 16, paddingVertical: 13, alignItems: 'center', marginTop: 20 },
  saveBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  filterItem: { alignItems: 'center', marginRight: 16, marginTop: 14 },
  filterCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#1C1E2E', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  filterCircleActive: { borderColor: '#F71084' },
  filterLabel: { color: '#fff', fontSize: 11, marginTop: 6, fontWeight: '600' },

  // toast
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 60, elevation: 60 },
  toastPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(30,28,36,0.95)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, maxWidth: width * 0.92 },
  toastIcon: { width: 22, height: 22, borderRadius: 6, backgroundColor: '#FFD600', justifyContent: 'center', alignItems: 'center' },
  toastTxt: { color: '#fff', fontSize: 13, marginLeft: 10, flexShrink: 1 },

  // summary
  endBg: { flex: 1, backgroundColor: '#2A0E3D' },
  endHeader: { marginTop: 44, height: 46, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  endHeaderTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  endCard: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 16, marginBottom: 14 },
  endCardTitle: { color: '#D9C9E6', fontSize: 13, fontWeight: '600', marginBottom: 14 },
  endGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  endCell: { width: '50%', alignItems: 'center', marginBottom: 16 },
  endVal: { color: '#fff', fontSize: 18, fontWeight: '800' },
  endLbl: { color: '#BBA8CC', fontSize: 11, marginTop: 4 },
  sumGifter: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1E2E', borderRadius: 14, padding: 10, marginBottom: 8 },
  sumGifterName: { color: '#fff', flex: 1, marginLeft: 10, fontWeight: '700', fontSize: 13 },
  endCentre: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFE600', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, marginTop: 4 },
  endCentreTitle: { color: '#111', fontSize: 14, fontWeight: '800' },
  endCentreSub: { color: '#333', fontSize: 11, marginTop: 2 },
});
