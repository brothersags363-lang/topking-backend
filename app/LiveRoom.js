import LevelBadge from '../components/LevelBadge';
import { reportVoiceAbuse } from "../utils/voiceReport";
import OfficialLiveTools from "../components/live/OfficialLiveTools";
import { blockIfProfane } from "../utils/guardText";
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
import { scopedBackHandler } from "../utils/scopedBack";


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

import { useLocalSearchParams, useFocusEffect, Stack } from 'expo-router';
import { useRouter } from '../utils/safeRouter';
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
  getAggregateFromServer,
  sum,
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
import GiftSheet from "../components/live/GiftSheet";
import { isGifReaction, gifSource } from '../assets/emojiGifs';
import { Image as ExpoImage } from 'expo-image';
import FastImage from '../components/FastImage';
import LevelFrame from '../components/LevelFrame';
import { getAdminFrameKey } from '../components/adminFrames';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import JoinEntry, { JoinSlot } from '../components/live/JoinEntry';
import { useJoinDelay } from '../components/live/useJoinDelay';
import { ViewersSheet, GiftersSheet, RoomMenuSheet, EmojiStrip } from '../components/live/RoomSheets';
import { T } from '../components/live/liveTheme';
import { useRoomMusic, MusicFab, MusicSheet } from '../components/live/RoomMusic';
import TeenPattiGame from '../components/live/TeenPattiGame';
import GreedyGame from '../components/live/GreedyGame';


import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { callApi } from '../utils/api';
import { chargeLiveGift } from '../utils/liveGiftApi';
import { getAgoraToken } from '../utils/agoraToken';
import { useLiveBanGuard } from '../utils/liveBan';
import { userHasUsername } from '../utils/usernameGate';
import { useBlockedIds } from '../utils/useBlockedIds';
import UserTick from '../components/UserTick';
import useLiveSwipe from '../utils/useLiveSwipe';
import ProfileSheet, { SheetChip } from '../components/live/ProfileSheet';

// ===== split modules (components/liveroom/) =====
import { ChatTextInput, chatKeyExtractor, chatUserPressRef, renderChatItem } from '../components/liveroom/ChatParts';
import { GiftLayer } from '../components/liveroom/GiftLayer';
import { HostPanelSheet } from '../components/liveroom/HostPanel';
import { ProfileAvatar } from '../components/liveroom/ProfileParts';
import { GiftButtonLottie, LiveTimer, TimeBackground } from '../components/liveroom/RoomWidgets';
import { SpeakingSeat, speakingStore } from '../components/liveroom/SeatParts';
import { GuardedFrame, SafeModal } from '../components/liveroom/SharedUI';
import { BOTTOM_BAR_H, EMPTY_SEAT, FRAME_HOST38, JOIN_ANIM_VARIANT, SEAT_CELL_W, SEAT_CELL_W4, SEAT_KEYS, SEAT_OPTIONS, STABLE_AVATAR, WELCOME_TEXT, height, log, width } from '../components/liveroom/constants';
import { cleanVerified, fmtCount, getLevelTheme, isVerified, normTickColor, runWhenIdle, uidToNum } from '../components/liveroom/helpers';
import { styles } from '../components/liveroom/styles';

// import LottieView from "lottie-react-native";
// Phone ki system font-size setting se layout na bigde
if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.allowFontScaling = false;
if (TextInput.defaultProps == null) TextInput.defaultProps = {};
TextInput.defaultProps.allowFontScaling = false;
// Bottom bar ki fixed unchai (input/buttons) - har phone par same
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
// SMOOTH: har tap par sheet re-render nahi; ek frame me ek hi baar (latest value pendingSpendRef se)
const pendingPushRef = useRef(null);
const setPendingSpend = useCallback((v) => {
  if (pendingPushRef.current) return;
  pendingPushRef.current = requestAnimationFrame(() => {
    pendingPushRef.current = null;
    if (giftSheetRef.current) giftSheetRef.current.setPending(pendingSpendRef.current);
  });
}, []);
const onSendGiftStable = useCallback((item) => {
  if (handleSendGiftRef.current) return handleSendGiftRef.current(item);
  return false;
}, []);
const goRecharge = useCallback(() => {
  if (giftSheetRef.current) giftSheetRef.current.close();
  setTimeout(() => { try { router.push('/wallet'); } catch (e) {} }, 180);
}, [router]);


const [speakerModalVisible, setSpeakerModalVisible] = useState(false);

const [selectedSeatKey, setSelectedSeatKey] = useState(null);

const [shareModalVisible, setShareModalVisible] = useState(false);

const [selectedSpeaker, setSelectedSpeaker] = useState(null);

const [selfSeatModalVisible, setSelfSeatModalVisible] = useState(false);

const [selfMuted, setSelfMuted] = useState(false);
const selfMutedRef = useRef(false);   // volume callback ke liye (state purani na pade)
// AUTO SEAT-DROP: seat par baithe user ki awaaz 20 min tak na aaye to seat se utar do
const lastVoiceAtRef = useRef(Date.now());   // local user ki aakhri asli awaaz ka time
const voiceSeatKeyRef = useRef(null);        // abhi kis seat par baitha hai (seat badli -> timer reset)
const leaveOwnSeatRef = useRef(null);        // leaveOwnSeat ka latest version (interval me purana closure na chale)

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
const [chatTopY, setChatTopY] = useState(null);
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
const starsRef = useRef(0);   // SMOOTH: balance check ke liye turant wali value (state ka wait nahi)
const [walletInfo, setWalletInfo] = useState({ level: 1, totalSpent: 0, nextLevelSpent: null, levelStartSpent: 0 });



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
const agoraKickRef = useRef(false);   // initAgora ek hi baar schedule ho

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
const roomCoreSigRef = useRef(null);       // signature WITHOUT gift fields (gift-only change = throttled render)
const roomPendingRef = useRef(null);
const roomThrottleRef = useRef(null);
useEffect(() => () => { if (roomThrottleRef.current) clearTimeout(roomThrottleRef.current); }, []);

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

// BACK FIX: history na ho (mini-live / notification / deep link / replace se khula) to
// router.back() kuch nahi karta tha aur user room me atak jata tha. Ab hamesha bahar nikalta hai.
const navigateBack = () => {
  try {
    if (cameFromAllLive) router.replace("/all-live");
    else if (router.canGoBack && router.canGoBack()) router.back();
    else router.replace("/");
  } catch (_) {
    try { router.replace("/"); } catch (__) {}
  }
};
// BackHandler effect [] deps wala hai, isliye latest loading ref se padhta hai
const loadingRef = useRef(true);
loadingRef.current = loading;
// Loading screen ka Back button normal entry me nahi dikhta; sirf tab jab room 8 sec se
// zyada load na ho (net slow / atak gaya). Hardware back pehle din se kaam karta hai.
const [showLoadBack, setShowLoadBack] = useState(false);
// 6 sec tak naam load na ho to bhi room join hone do (fallback naam se) - warna loading par atak jata tha
const [nameGateOpen, setNameGateOpen] = useState(false);
useEffect(() => {
  if (!loading) { setShowLoadBack(false); return; }
  const t = setTimeout(() => setShowLoadBack(true), 8000);
  const g = setTimeout(() => setNameGateOpen(true), 6000);
  return () => { clearTimeout(t); clearTimeout(g); };
}, [loading]);

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
const audienceMap = React.useMemo(() => { const o = {}; for (const k in rawAudienceMap) { if (!blockedIds.has(k)) o[k] = rawAudienceMap[k]; } return o; }, [rawAudienceMap, blockedIds]);
// LIVE PROFILE: kisi ne naam/photo badli to purane chat messages me bhi turant nayi dikhe
// (audience doc hi source of truth). Jo message badla nahi uska object same rehta hai -> row re-render nahi.
const chatMessages = React.useMemo(() => {
  const out = [];
  for (const m of rawChatMessages) {
    if (!m) continue;
    if (m.senderId && blockedIds.has(m.senderId)) continue;
    const a = m.senderId ? audienceMap[m.senderId] : null;
    if (a && ((a.img && a.img !== m.userImg) || (a.name && a.name !== m.senderName) || (a.username && a.username !== m.username))) {
      out.push({
        ...m,
        ...(a.img ? { userImg: a.img } : null),
        ...(a.name ? { senderName: a.name } : null),
        ...(a.username ? { username: a.username } : null),
      });
    } else {
      out.push(m);
    }
  }
  return out;
}, [rawChatMessages, blockedIds, audienceMap]);

const audiencePayloadRef = useRef(null);   // meri audience doc (heartbeat ke liye)
const audSeenRef = useRef({});             // uid -> { v: lastSeen, at: LOCAL time jab value badli }




// ===== PREMIUM: sheets / hearts / emoji (hooks yahin rehne chahiye, early return se pehle) =====
const [viewersVisible, setViewersVisible] = useState(false);
const [giftersVisible, setGiftersVisible] = useState(false);
const [menuVisible, setMenuVisible] = useState(false);
const [moreVisible, setMoreVisible] = useState(false); // 3-line menu
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
// uid -> { e: '😂', k: uniqueKey }.  Seat par `seat.reaction` ke naam se seat ko jata hai.
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
    navigateBack();
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
      // LIVE PROFILE: seat par naam/photo hamesha audience doc ki taza value se
      if (aud && ((aud.img && aud.img !== out[k].userImg) || (aud.username && aud.username !== out[k].userName) || (aud.name && aud.name !== out[k].realName))) {
        out[k] = {
          ...out[k],
          ...(aud.img ? { userImg: aud.img } : null),
          ...(aud.username ? { userName: aud.username } : null),
          ...(aud.name ? { realName: aud.name } : null),
        };
      }
    } else {
      out[k] = st;
    }
  }
  return out;
}, [roomData?.seatsData, audienceMap, currentUid, hostLevel, seatReactions, blockedIds]);

// Like/heart tap feature hata diya gaya hai.

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
// ↕ Swipe up/down = dusre live me jao (sirf listener)
const liveSwipe = useLiveSwipe({ db, roomId, router, blockedRef, enabled: currentUserRole === 'listener' });
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
  Alert.alert('Report', `@${u?.userName || 'user'} ko kis wajah se report karna hai?`, [
    { text: 'Voice me gali de raha hai', onPress: () => reportVoiceAbuse(roomId, uid) },
    { text: 'Doosri wajah', onPress: () => router.push({ pathname: '/report', params: { reportedUserId: uid } }) },
    { text: 'Cancel', style: 'cancel' },
  ]);
}, [currentUid, router, roomId]);

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

// SMOOTH FIX: gift spam me wallet har flush par 2 baar badalta hai (local + server) -> poori room screen
// 2 baar re-render hoti thi. Ab pehli baar turant, uske baad 300ms me ek hi render.
let _wData = null;
let _wTimer = null;
let _wFirst = true;
const pushWallet = () => {
  _wTimer = null;
  const _w = _wData;
  if (!_w) return;
  const v = _w.stars || 0;
  setStars(v);
  setMyStars(v);
  setWalletInfo((p) => (p.level === (_w.level || 1) && p.totalSpent === (_w.totalSpent || 0) && p.nextLevelSpent === (_w.nextLevelSpent ?? null))
    ? p
    : { level: _w.level || 1, totalSpent: _w.totalSpent || 0, nextLevelSpent: _w.nextLevelSpent ?? null, levelStartSpent: _w.levelStartSpent || 0 });
};
const scheduleWalletPush = () => {
  if (_wFirst) { _wFirst = false; pushWallet(); return; }
  if (!_wTimer) _wTimer = setTimeout(pushWallet, 300);
};

const unsub = onSnapshot(
walletRef,
(snap)=>{

if(snap.exists()){

_wData = snap.data() || {};
starsRef.current = _wData.stars || 0;
scheduleWalletPush();
// wallet server/local se update ho gaya -> in-flight spend ab v me included hai
inflightSpendRef.current = 0;
setPendingSpend(pendingSpendRef.current);

}

}
);

return ()=>{ unsub(); if (_wTimer) clearTimeout(_wTimer); };

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

let loadAttempt = 0;
let loadTimer = null;
let loadDead = false;
const loadUser = async () => {

if (loadDead) return;
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
// net/server slow tha -> naam load nahi hua to room "Entering..." par atak jata tha.
// Ab 4 baar dobara try (1.5s, 3s, 4.5s, 6s)
if (!loadDead && loadAttempt < 4) {
  loadAttempt += 1;
  loadTimer = setTimeout(loadUser, 1500 * loadAttempt);
}
}

};

loadUser();

return () => { loadDead = true; if (loadTimer) clearTimeout(loadTimer); };

}, []);

// ===== LIVE PROFILE SYNC =====
// Naam / photo kahin se bhi badle (edit profile) -> room me apni state, audience doc aur seat
// turant update. Baaki sab log audience listener se 1 snapshot me nayi photo/naam dekhte hain.
const seatsDataRef = useRef({});
seatsDataRef.current = roomData?.seatsData || {};
useEffect(() => {
  if (!db || !currentUid) return;
  const unsub = onSnapshot(doc(db, "users", currentUid), (snap) => {
    if (!snap.exists() || exitingRef.current) return;
    const d = snap.data();
    const uname = d.username || d.name || auth?.currentUser?.displayName || "User";
    const rname = d.name || auth?.currentUser?.displayName || "User";
    const img = d.profileImg || d.photoURL || auth?.currentUser?.photoURL || STABLE_AVATAR;

    setCurrentName((p) => (p === uname ? p : uname));
    setCurrentRealName((p) => (p === rname ? p : rname));
    setCurrentAvatar((p) => (p === img ? p : img));

    const cur = audiencePayloadRef.current;
    if (!cur || !isJoinedRef.current) return;   // abhi join nahi hua: joinRoom taza data hi likhega
    if (cur.name === rname && cur.username === uname && cur.img === img) return;

    audiencePayloadRef.current = { ...cur, name: rname, username: uname, img };
    updateDoc(doc(db, "rooms", roomId, "audience", currentUid), { name: rname, username: uname, img }).catch(() => {});

    const seats = seatsDataRef.current;
    const key = Object.keys(seats).find((k) => seats[k]?.userId === currentUid);
    if (key) {
      updateDoc(doc(db, "rooms", roomId), {
        ["seatsData." + key + ".userName"]: uname,
        ["seatsData." + key + ".realName"]: rname,
        ["seatsData." + key + ".userImg"]: img,
      }).catch(() => {});
    }
  }, (e) => log("Profile listener error:", e));
  return () => unsub();
}, [currentUid, roomId]);






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

      // PERF: likes total ab server par sum hota hai (user ke saare videos download nahi hote).
      // Agar firebase version purana ho to purane tareeke par fallback.
      const sumLikesFallback = async () => {
        const vs = await getDocs(videosQuery);
        let t = 0;
        vs.forEach((v) => { t += Number(v.data()?.likes || 0); });
        return t;
      };
      const likesJob = (typeof getAggregateFromServer === "function" && typeof sum === "function")
        ? getAggregateFromServer(videosQuery, { totalLikes: sum("likes") })
            .then((r) => Number(r.data().totalLikes || 0))
            .catch(sumLikesFallback)
        : sumLikesFallback();

      const [followersSnap, followingSnap, likesCount] = await Promise.all([
        getCountFromServer(followersQuery),
        getCountFromServer(followingQuery),
        likesJob,
      ]);
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

    // BACK FIX: room load ho raha ho (exit popup render nahi hota) to seedha bahar
    if (loadingRef.current) {
      navigateBack();
      return true;
    }
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
    scopedBackHandler('/LiveRoom', 
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
  const timer = setInterval(beat, 60000);
  const sub = AppState.addEventListener("change", (st) => { if (st === "active") beat(); });
  return () => { clearInterval(timer); sub.remove(); };
}, [roomId, currentUserRole]);

// ---------- LIVE REWARD PING ----------
// Host ka live time SERVER gintta hai (2h reward). App sirf "main live hu"
// bolta hai; minutes / viewers server khud nikalta hai, yahan se fake nahi hota.
// Private live ya room lock ho to 2h target me time count NAHI hoga.
// (Final check server bhi karta hai; yahan sirf ping band rakhte hain.)
const rewardBlockedRef = useRef(false);
useEffect(() => {
  rewardBlockedRef.current = !!(roomData?.isPrivate || roomData?.roomLocked);
}, [roomData?.isPrivate, roomData?.roomLocked]);

useEffect(() => {
  if (!roomId || currentUserRole !== "host") return;
  let stopped = false;
  const ping = () => {
    if (stopped || AppState.currentState !== "active") return;
    if (rewardBlockedRef.current) return; // private / locked => count band
    /* live reward sirf videolive me */
  };
  ping();
  const timer = setInterval(ping, 30000);
  return () => { stopped = true; clearInterval(timer); };
}, [roomId, currentUserRole]);

// ---------- LIVE VIEWER COUNT -> all-live ----------
// Sirf HOST likhta hai (ek hi writer => race / drift nahi). Room ke andar
// jitne log (host ko chhod kar) hain utna hi `viewerCount` all-live me dikhta
// hai: join par badhta hai, leave par ghatta hai.
// READS/WRITES SAVER: ye write poori room doc badalta hai, aur room doc har viewer ko
// jaati hai (N viewers = N reads). Isliye ab THROTTLE: pehla badlav 1.5s me, uske baad
// kitne bhi join/leave ho, 15s me sirf ek write (latest count ke saath).
const lastWrittenViewerCountRef = useRef(-1);
const viewerCountTimerRef = useRef(null);
const viewerCountLatestRef = useRef(0);
const viewerCountWriteAtRef = useRef(0);
const VIEWER_COUNT_MIN_GAP_MS = 15000;
useEffect(() => {
  if (!db || !roomId || currentUserRole !== "host") return;

  let n = 0;
  for (const uid in audienceMap) {
    const u = audienceMap[uid];
    if (u && u.uid && u.uid !== roomData?.hostId && u.uid !== currentUid) n++;
  }
  viewerCountLatestRef.current = n;
  if (n === lastWrittenViewerCountRef.current) return;
  if (viewerCountTimerRef.current) return;   // write pehle se line me hai; wo latest count likhega

  const sinceLast = Date.now() - viewerCountWriteAtRef.current;
  const delay = sinceLast >= VIEWER_COUNT_MIN_GAP_MS ? 1500 : (VIEWER_COUNT_MIN_GAP_MS - sinceLast);
  viewerCountTimerRef.current = setTimeout(() => {
    viewerCountTimerRef.current = null;
    const v = viewerCountLatestRef.current;
    if (v === lastWrittenViewerCountRef.current) return;
    lastWrittenViewerCountRef.current = v;
    viewerCountWriteAtRef.current = Date.now();
    updateDoc(doc(db, "rooms", roomId), { viewerCount: v }).catch(() => {});
  }, delay);
}, [audienceMap, roomData?.hostId, roomId, currentUserRole, currentUid]);
useEffect(() => () => {
  if (viewerCountTimerRef.current) { clearTimeout(viewerCountTimerRef.current); viewerCountTimerRef.current = null; }
}, []);

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

  const subscription = scopedBackHandler('/LiveRoom', 
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
 ((currentName === "User" || currentRealName === "User") && !nameGateOpen) ||
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
  navigateBack();
  return;
}

// USERNAME GATE: username ke bina (host ke alawa) room me entry nahi
if (data?.hostId !== currentUid && roomId !== currentUid && !userHasUsername(userData)) {
  alert("Live me aane ke liye pehle Edit Profile me apna username set karo.");
  navigateBack();
  return;
}

if (
  data?.kicked?.[currentUid] &&
  data?.hostId !== currentUid
) {
  releaseAgora();
  try { stopLive(); } catch (_) {}
  alert("Host ne aapko is room se hata diya hai");
  navigateBack();
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
      level: currentLevel,
      createdAt: Date.now(),
    })
  );
  // JOIN ENTRY: apni entry turant dikhao (Firestore echo ka wait nahi; wo echo neeche skip hota hai)
  showJoinBanner({
    senderId: currentUid,
    type: "join",
    senderName: currentRealName,
    username: currentName,
    userImg: currentAvatar || STABLE_AVATAR,
    verified: isVerified(userData.verified),
    verifiedColor: normTickColor(userData.verifiedColor),
    level: currentLevel,
  });
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
      // EXIT SMOOTH: bahar nikalte waqt (apna seat/audience delete hone par bhi snapshot aata hai)
      // poori screen re-render + startLive() dobara na chale.
      if (exitingRef.current) return;
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
        if (roomSig && roomSig === lastRoomSigRef.current && !loadingRef.current) return;
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
          navigateBack();
          return;
        }

        // DEBUG (seat ke neeche stars): seatStars ke keys aur seat ke userId yahan match hone chahiye.
        // Problem solve hone ke baad ye 3 line hata dena.
        // (HEAT FIX) SEATSTARS_DEBUG console.log hata diya - har snapshot par 2 JSON.stringify chalte the

        // SMOOTH FIX: gift (seatStars/topGifters/liveGift) ke badlav 400ms me ek baar render; baaki turant
        {
          let core = null;
          try {
            const { liveGift: _a, seatStars: _b, topGifters: _c, ...coreRest } = data;
            core = JSON.stringify(coreRest);
          } catch (_) {}
          if (!core || core !== roomCoreSigRef.current) {
            roomCoreSigRef.current = core;
            roomPendingRef.current = null;
            if (roomThrottleRef.current) { clearTimeout(roomThrottleRef.current); roomThrottleRef.current = null; }
            setRoomData(data);
          } else {
            roomPendingRef.current = data;
            if (!roomThrottleRef.current) {
              roomThrottleRef.current = setTimeout(() => {
                roomThrottleRef.current = null;
                const d = roomPendingRef.current;
                roomPendingRef.current = null;
                if (d) setRoomData(d);
              }, 400);
            }
          }
        }
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

// ENTER SMOOTH: Agora engine banana (native, JS thread block karta hai) screen draw + navigation
// animation khatam hone ke BAAD. Pehle 100ms me chalta tha -> room khulte hi lag.
if (!agoraKickRef.current) {
  agoraKickRef.current = true;
  runWhenIdle(() => {
    setTimeout(() => {
      agoraKickRef.current = false;
      if (exitingRef.current || roomEndedRef.current || agoraEngineRef.current) return;
      Promise.resolve(initAgora(role)).catch(() => {
        scheduleAgoraReconnectRef.current && scheduleAgoraReconnectRef.current();
      });
    }, 50);
  }, 1200);
}

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
    }, (e) => {
      log("Room listener error:", e);
      // listener fail (permission/net) -> loading par hamesha na atke, Back button turant dikhao
      try { setShowLoadBack(true); } catch (_) {}
    });

    return () => { unsubscribe(); if (joinRetryTimer) clearTimeout(joinRetryTimer); };

  }, [
  roomId,
  currentUid,
  currentName,
  currentRealName,
  currentAvatar,
  hostLevel,
  nameGateOpen,
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
    if (exitingRef.current) return;   // EXIT SMOOTH
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
        // apni entry upar local dikh chuki; doosron ki entry: phone ki clock alag ho tab bhi dikhe
        if (d?.type === "join" && d.senderId !== currentUid && Date.now() - (d.createdAt || 0) < 120000) {
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
    orderBy('joinedAt', 'desc'),
    limit(200)
  );

  // PERF: when many people join/leave at once this fires in bursts and each
  // one re-rendered the whole room. First load is instant, after that
  // updates are coalesced to at most one render per 600ms.
  let firstLoad = true;
  let latestMap = {};
  let flushTimer = null;
  let lastSig = null;
  let lastCoreSig = null;

  const unsubAudience = onSnapshot(audienceQuery, (snap) => {
    if (exitingRef.current) return;   // EXIT SMOOTH
    const map = {};
    const nowLocal = Date.now();
    const seen = audSeenRef.current;
    let sig = '';
    let coreSig = '';
    snap.forEach(d => {
      const dd = d.data();
      map[d.id] = cleanVerified({ uid: d.id, ...dd });
      coreSig += d.id + ':' + (isVerified(dd.verified) ? 1 : 0) + ':' + (dd.verifiedColor === 'yellow' ? 'y' : 'w') + ':' + (dd.level || 0) + '|';
      sig += d.id + ':' + (isVerified(dd.verified) ? 1 : 0) + ':' + (dd.verifiedColor === 'yellow' ? 'y' : 'w') + ':' + (dd.level || 0) + ':' + (dd.img || '') + ':' + (dd.name || '') + ':' + (dd.username || '') + '|';
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

    const profileOnly = lastCoreSig !== null && coreSig === lastCoreSig;
    lastCoreSig = coreSig;

    if (firstLoad || profileOnly) {
      // pehli load ya sirf naam/photo badli -> TURANT (koi wait nahi)
      firstLoad = false;
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      setAudienceMap(map);
      return;
    }

    // join/leave/hearts ki bheed: 400ms me ek hi render (pehle 1500ms tha -> late dikhta tha)
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        setAudienceMap(latestMap);
      }, 400);
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
      senderId: gift.senderId,
      level: gift.senderLevel,
      receiverName: gift.receiverName,
      giftId: gift.giftId,
      giftName: gift.giftName,
      count: gift.comboCount || 1
    }, onComboEnd);
  }

  const giftData = gifts.find(g => String(g.id) === String(gift.giftId));

  if (!giftData || !giftData.animation) return;

  if (giftLayerRef.current) giftLayerRef.current.playDeferred(giftData.animation, giftData.duration, 1600, {
    senderName: gift.senderName,
    senderImg: gift.senderImg,
    receiverName: gift.receiverName,
    giftName: gift.giftName || giftData.name,
  });

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
    if (exitingRef.current) return;   // double-tap par dobara na chale
    exitingRef.current = true;
    setControlModalVisible(false);

    // 1) Awaaz/mic TURANT band (ye sasta hai) - baaki bhaari teardown baad me.
    const engineToRelease = agoraEngineRef.current;
    agoraEngineRef.current = null;
    if (engineToRelease) {
      try { engineToRelease.muteAllRemoteAudioStreams(true); } catch (_) {}
      try { engineToRelease.muteLocalAudioStream(true); } catch (_) {}
    }
    try { stopLive(); } catch (_) {}

    // 2) PEHLE navigate: user ko bilkul wait na karna pade.
    navigateBack();

    // 3) leaveChannel()/release() native hain aur JS/UI thread rok dete the (exit atakta tha).
    //    Ab screen ka transition shuru hone ke BAAD chalte hain.
    runWhenIdle(() => {
      speakingStore.reset();
      if (engineToRelease) {
        try {
          const leaveResult = engineToRelease.leaveChannel();
          if (leaveResult && typeof leaveResult.catch === "function") leaveResult.catch(() => {});
        } catch (_) {}
        try { engineToRelease.release(); } catch (_) {}
      }
    }, 450);

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
    jobs.push(updateDoc(roomRef, seatUpdates).catch((e) => { log("Seat cleanup skipped:", e && e.code); }));
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
// Har 15 min me meri audience doc par chhota lastSeen write (merge => hearts/chat par asar nahi).
// Doc host ne galti se hata di ho (jaise app background tha) to ye use wapas bana deta hai.
// READS SAVER: ye write audience listener ke zariye room ke HAR viewer ko jata hai
// (N viewers x har heartbeat = N^2 reads). Pehle 5 min tha, ab 15 min; host sweep ka
// STALE_MS (neeche) isse bada rakha hai taaki zinda user galti se na hate.
const VIEWER_BEAT_MS = 15 * 60 * 1000;
useEffect(() => {
  if (!db || !roomId || !currentUid) return;
  let lastBeatAt = 0;
  const beat = () => {
    if (exitingRef.current || roomEndedRef.current || !audiencePayloadRef.current) return;
    if (roomDataRef.current?.kicked?.[currentUid]) return;
    if (roomDataRef.current?.hostId === currentUid) return;
    // app baar-baar foreground hone par bhi 3 min se pehle dobara write nahi
    if (Date.now() - lastBeatAt < 3 * 60 * 1000) return;
    lastBeatAt = Date.now();
    setDoc(
      doc(db, 'rooms', roomId, 'audience', currentUid),
      { ...audiencePayloadRef.current, lastSeen: Date.now() },
      { merge: true }
    ).catch(() => {});
  };
  const timer = setInterval(beat, VIEWER_BEAT_MS);
  const sub = AppState.addEventListener('change', (st) => { if (st === 'active') beat(); });
  return () => { clearInterval(timer); sub.remove(); };
}, [roomId, currentUid]);

// ---- HOST SWEEP: 40 min tak heartbeat na aaye to user + uski seat hata do ----
// Time host ke LOCAL clock se naapa jata hai (phones ki clock alag ho to bhi galat nahi hoga).
// STALE_MS = 2.5 x VIEWER_BEAT_MS (15 min) -> ek-do heartbeat miss hone par bhi zinda user safe.
useEffect(() => {
  if (!db || !roomId || currentUserRole !== 'host') return;
  const STALE_MS = 40 * 60 * 1000;
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
  try { await e.setAINSMode(true, AudioAinsMode?.AinsModeBalanced ?? 0); } catch (_) {}
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
  try { e.setAINSMode(false, AudioAinsMode?.AinsModeBalanced ?? 0); } catch (_) {}
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
      const fetchAgoraToken = async (uidForToken, _firstIdToken, force = false) => {
        // shared helper (utils/agoraToken.js): cache + prefetch + parallel retry + 60s budget
        const r = await getAgoraToken(roomId, uidForToken, { force });
        if (r.token) return { success: true, token: r.token, uid: r.uid };
        throw new Error((r.error && r.error.message) || "Token request failed");
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
      // HEAT FIX: AI noise suppression (AINS) bhaari CPU kaam hai aur sirf MIC wale (host/speaker) ke
      // kaam ka hai. Sunne wale (audience) ke liye pehle bhi chalta tha = bekaar garmi.
      // Ab sirf broadcaster ke liye ON; seat par baithte (startSpeaking) ON, utarte (stopSpeaking) OFF.
      const applyNoiseBlock = async () => {
        if (role !== ClientRoleType.ClientRoleBroadcaster) return;
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
              if (isLocal) lastVoiceAtRef.current = Date.now();
              if (!isLocal) remoteVoice = true;
            }
          });
          if (remoteVoice) voiceDiagnosticRef.current = { ...voiceDiagnosticRef.current, remote: true };
          speakingStore.update(map);
        },
                // Token 1 ghante me expire hota hai -> expire se pehle chupchap renew.
        onTokenPrivilegeWillExpire: async () => {
          try {
            const fresh = await fetchAgoraToken(numericUid, null, true); // renew => taaza token
            if (engine && fresh?.token) engine.renewToken(fresh.token);
          } catch (e) { log("Token renew failed:", e?.message || e); }
        },
        onRequestToken: async () => {
          try {
            const fresh = await fetchAgoraToken(numericUid, null, true); // renew => taaza token
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
      engine.enableAudioVolumeIndication(500, 3, false);

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
    if (blockIfProfane(messageText)) return;
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
    const shareLink = `https://topking-short.vercel.app/live/${roomId}`;
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
      roomLink: `https://topking-short.vercel.app/live/${roomId}`,
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
leaveOwnSeatRef.current = leaveOwnSeat;

// ============================================================
// AUTO SEAT-DROP (20 min no voice)
// Seat par baithe (host seat_1 / HOST roleTag chhodkar) user ki awaaz 20 minute tak na aaye
// to usse seat se utaar dete hain. Timer: seat par baithte hi shuru, har baar bolne par reset.
// Date.now() se check hota hai, isliye app background me gayi ho tab bhi wapas aate hi chal jata hai.
// ============================================================
const VOICE_IDLE_LIMIT_MS = 20 * 60 * 1000;
useEffect(() => {
  if (!roomId || !currentUid) return undefined;
  const iv = setInterval(() => {
    if (exitingRef.current || roomEndedRef.current) return;
    const seats = roomDataRef.current?.seatsData || {};
    let mine = null;
    let mineSeat = null;
    for (const k in seats) {
      if (seats[k]?.userId === currentUid) { mine = k; mineSeat = seats[k]; }
    }
    // seat par nahi / host hai -> timer band
    if (!mine || mine === "seat_1" || mineSeat?.roleTag === "HOST") {
      voiceSeatKeyRef.current = null;
      return;
    }
    // nayi seat par baitha -> timer fresh shuru
    if (voiceSeatKeyRef.current !== mine) {
      voiceSeatKeyRef.current = mine;
      lastVoiceAtRef.current = Date.now();
      return;
    }
    if (Date.now() - lastVoiceAtRef.current >= VOICE_IDLE_LIMIT_MS) {
      voiceSeatKeyRef.current = null;
      lastVoiceAtRef.current = Date.now();
      showToast("⏱ 20 minute se awaaz nahi aayi, aap seat se utar gaye");
      try { leaveOwnSeatRef.current && leaveOwnSeatRef.current(); } catch (_) {}
    }
  }, 15000);
  return () => clearInterval(iv);
}, [roomId, currentUid, showToast]);






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
    return false;
  }

  const isAll = selectedGiftUser === "ALL";

  // ALL = seat pe baithe sab users (khud ko chhod kar); warna ek user
  const targetIds = isAll
    ? giftUsers.map(u => u.uid)
    : [selectedGiftUser];

  if (targetIds.length === 0) {
    alert("Please select another user");
    return false;
  }

  // har receiver ko poora gift -> kharcha = price x receivers
  const price = Number(item.price || 0) * targetIds.length;

  // balance = wallet - (abhi tak write na hue taps) - (write ho chuke par snapshot pending)
  const available = starsRef.current - pendingSpendRef.current - inflightSpendRef.current;
  if (available < price) {
    alert("Not enough stars");
    return false;
  }

  const receiverId = isAll ? "ALL" : selectedGiftUser;
  const targetKey = targetIds.slice().sort().join(",");

  // hard guard: never gift yourself, and only users that are in the list
  if (
    !isAll &&
    (receiverId === currentUid || !giftUsers.some(u => u.uid === receiverId))
  ) {
    alert("Please select another user");
    return false;
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
      senderId: currentUid,
      level: hostLevel,
      receiverName: _receiverName,
      giftId: item.id,
      giftName: item.name,
      count: comboCount
    }, onComboEnd);

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

  return true;
};

// SMOOTH: tap handler ke andar Firestore kaam nahi; agle tick me
const deferGift = (args) => { setTimeout(() => { sendGiftInBackground(args); }, 0); };

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

  deferGift({
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
      senderLevel: hostLevel,
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

  // FIX: PEHLE room write (liveGift + seatStars + topGifters). Agar ye fail ho (rules / net)
  // to na stars kategi, na doosron ko kuch dikhega -> user ko batao aur wallet se paisa mat kaato.
  // Pehle ye fail hota tha to chup-chap sender ke stars kat jate the aur receiver ko kuch nahi dikhta tha.
  // seatStars + liveGift in ONE write -> every viewer gets ONE snapshot
  // ALL me bhi ek hi liveGift => animation/banner sab ko SIRF EK baar
  // PAISA SERVER PAR: stars server transaction me kat-te hain (phone wallet nahi chhoota).
  // Fail ho to na animation dusron ko jayega, na stars katenge.
  try {
    await chargeLiveGift({ roomId, giftId: item.id, taps, receiverIds: ids });
  } catch (e) {
    console.warn("GIFT CHARGE FAILED:", e?.code, e?.status, e?.message);
    inflightSpendRef.current = Math.max(0, inflightSpendRef.current - total);
    showToast(e?.code === "NO_STARS" ? "Not enough stars" : "⚠️ Gift nahi gaya (server), dobara try karo");
    return;
  }

  try {
    await updateDoc(roomRef, roomUpdate);
  } catch (e) {
    __DEV__ && console.log("GIFT ROOM WRITE FAILED:", e?.code, e?.message);
    console.warn("GIFT ROOM WRITE FAILED:", e?.code, e?.message);
    inflightSpendRef.current = Math.max(0, inflightSpendRef.current - total);
    showToast("⚠️ Gift nahi gaya (room), dobara try karo");
    return;
  }

  // SMOOTH FIX: pehle 5-20 Firestore writes ek hi JS frame me chalte the (har write ka local snapshot
  // bhi turant fire hota hai) -> UI hang. Ab har write thodi der baad, frame-frame me.
  const later = (fn, ms) => new Promise((resolve, reject) => {
    setTimeout(() => { try { Promise.resolve(fn()).then(resolve, reject); } catch (e) { reject(e); } }, ms);
  });

  const jobs = []; // wallet / receiver / topGifters ab server /live/gift me ho chuke

  // chat line only once per combo (avoid spam)
  if (chat) {
    jobs.push(
      later(() => addDoc(collection(db, "rooms", roomId, "chats"), {
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
      }), 20)
    );
  }

  // one failing write must not cancel the others
  const results = await Promise.allSettled(jobs);
  results.forEach((r, idx) => {
    // FIX: ab release build me bhi error dikhega (pehle sirf __DEV__ me). #0 = sender wallet,
    // uske baad har receiver ke liye 2 writes: wallets/{id}, users/{id}, phir chat line.
    if (r.status === "rejected") {
      __DEV__ && console.log("GIFT WRITE FAILED #" + idx, r.reason?.code, r.reason?.message);
    }
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

  if (loading) return (
    <View style={styles.loader}>
      <Text style={{color:'#fff'}}>Entering Live Room...</Text>
      {showLoadBack && (
        <TouchableOpacity
          onPress={navigateBack}
          activeOpacity={0.8}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ marginTop: 28, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.18)' }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Back</Text>
        </TouchableOpacity>
      )}
    </View>
  );

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
// 3-line menu band karke doosra popup kholo (Android Modal overlap na ho)
const moreGo = (fn) => { setMoreVisible(false); setTimeout(fn, 260); };

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
          {(roomData?.seatsData?.seat_1?.level >= 30 || !!roomData?.seatsData?.seat_1?.userId) && (
            <GuardedFrame
              level={roomData?.seatsData?.seat_1?.level}
              uid={roomData?.seatsData?.seat_1?.userId}
              animated={false}
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
            <View key={user.uid} style={{ marginLeft: index === 0 ? 0 : 5 }}>
              <ExpoImage cachePolicy="memory-disk" transition={0}
                source={{ uri: user.img || STABLE_AVATAR }}
                style={styles.viewerAvatar}
              />
              {(user.level >= 30 || !!user.uid) && (
                <GuardedFrame level={user.level} uid={user.uid} animated={false} pointerEvents="none"
                  style={{ position: 'absolute', width: 42, height: 42, top: -5, left: -5 }} />
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

    {/* ================= MONTHLY HOST (TopKing style, left) ================= */}
    <View style={styles.monthlyRow}>
      <View style={[styles.monthlyChip, { marginLeft: 0 }]}>
        <Ionicons name="stats-chart" size={11} color="#f1c40f" style={{ flexShrink: 0 }} />
        <Text allowFontScaling={false} style={styles.monthlyTxt} numberOfLines={1}>Monthly Host</Text>
      </View>

    </View>

    {/* ================= MAIN CONTENT ================= */}
 <View {...liveSwipe.panHandlers} style={{
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

      {/* JOIN PILL (Lv<35): seats ke theek niche, jahan pehle pinned welcome tha. Height 0 => chat hilti nahi */}
      {joinBanner && (
        <View pointerEvents="none" style={{ height: 0, zIndex: 50, elevation: 50 }}>
          <View style={{ position: 'absolute', top: 4, left: 0, right: 0 }}>
            <JoinSlot key={joinBanner._k} data={{ ...joinBanner, level: Number(joinBanner.level) || 1 }} onDone={handleJoinDone} />
          </View>
        </View>
      )}

      {/* CHAT */}
<FlatList
    ref={chatScrollRef}
    data={chatListData}
    inverted
    style={styles.chatArea}
    onLayout={() => {
      // Lv<35 join pill ko chat ke theek upar rakhne ke liye chat ka screen par top nikalo
      try {
        const n = chatScrollRef.current && chatScrollRef.current.getNativeScrollRef && chatScrollRef.current.getNativeScrollRef();
        n && n.measureInWindow && n.measureInWindow((x, y) => { if (y > 0) setChatTopY(Math.round(y)); });
      } catch (e) {}
    }}
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={{
        paddingTop: 6,
        paddingBottom: 4,
    }}
    showsVerticalScrollIndicator={false}
    initialNumToRender={14}
    maxToRenderPerBatch={8}
    windowSize={7}
    removeClippedSubviews={false}
    updateCellsBatchingPeriod={40}
    overScrollMode="never"
    keyExtractor={chatKeyExtractor}
   



    renderItem={renderChatItem}
    ListFooterComponent={
      <View style={styles.welcomeBox}>
        <Text allowFontScaling={false} style={styles.welcomeTxt}>{WELCOME_TEXT}</Text>
      </View>
    }
/>







    </View>



<GiftLayer ref={giftLayerRef} comboBottom={Math.round(height * 0.45)} />

{/* ================= JOIN ENTRY ANIMATION ================= */}
{joinBanner && (
  <JoinEntry
    data={joinBanner}
    variant={JOIN_ANIM_VARIANT}
    onDone={handleJoinDone}
    hideLow
  />
)}

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
<MusicSheet
  visible={musicSheetVisible}
  onClose={() => setMusicSheetVisible(false)}
  onReopen={() => setMusicSheetVisible(true)}
  music={music}
  micMuted={iAmMuted}
  onToggleMic={muteSelf}
/>


      {!keyboardOpen && (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push("/event")}
        style={{ position: "absolute", right: 9, bottom: bottomBarTotal + 6, width: 56, alignItems: "center", zIndex: 50, elevation: 50 }}
      >
        <Image
          source={require("../assets/images/topking-logo.webp")}
          style={{ width: 44, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: "#FFD700", backgroundColor: "#fff" }}
          resizeMode="cover"
        />
        <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800", textAlign: "center", marginTop: 2, textShadowColor: "rgba(0,0,0,0.9)", textShadowRadius: 3 }} numberOfLines={1}>
          TopKing Event
        </Text>
      </TouchableOpacity>
      )}

 <ReAnimated.View
  style={[
    styles.bottomNav,
    bottomNavKbStyle,
  ]}
>

      <View style={[styles.inputBox, keyboardOpen ? { marginRight: 0 } : styles.inputBoxIdle]}>
        <Ionicons name="chatbubble-outline" size={20} color="#fff" style={{ marginRight: 7 }} />
        <ChatTextInput onSend={stableSendChat} locked={chatLocked && !canManage} onFocus={onChatFocus} onBlur={onChatBlur} />
        {keyboardOpen && (
          <TouchableOpacity onPress={() => setEmojiOpen(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={emojiOpen ? "happy" : "happy-outline"} size={22} color={T.sub} />
          </TouchableOpacity>
        )}
      </View>

      {/* TopKing order: Chat -> Share -> Accept request -> 3 line -> Gift */}
      {!keyboardOpen && true && (
        <TouchableOpacity style={styles.tikiIcon} onPress={() => setFriendShareVisible(true)} activeOpacity={0.7}>
          <Ionicons name="arrow-redo-outline" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      {canManage && !keyboardOpen && (
        <TouchableOpacity style={styles.tikiIcon} onPress={() => setRequestModalVisible(true)} activeOpacity={0.7}>
          <Ionicons name="link" size={24} color="#f5c518" style={{ transform: [{ rotate: '-45deg' }] }} />
          {requestsArray.length > 0 && (
            <View style={styles.requestBadge}>
              <Text style={styles.requestBadgeText}>{requestsArray.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {currentUserRole === 'listener' && !keyboardOpen && (
        <TouchableOpacity style={[styles.raiseHandBtn, { marginRight: 0, marginLeft: 8 }, myReqSent && { opacity: 0.55 }]} onPress={handleRaiseHand}>
          <Text style={styles.raiseHandText}>{myReqSent ? '⏳' : '✋'}</Text>
        </TouchableOpacity>
      )}

      {!keyboardOpen && (
        <TouchableOpacity style={styles.tikiIcon} onPress={() => { Keyboard.dismiss(); setEmojiOpen(false); setMoreVisible(true); }} activeOpacity={0.7}>
          <Ionicons name="menu" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* 3-line ke baad: Mute (seat/host wale ke liye) + Like */}
      {!keyboardOpen && currentUserRole !== 'listener' && (
        <TouchableOpacity style={[styles.tikiIcon, { marginLeft: 6 }]} onPress={muteSelf} activeOpacity={0.7}>
          <Ionicons name={iAmMuted ? "mic-off" : "mic"} size={21} color={iAmMuted ? T.live : "#fff"} />
        </TouchableOpacity>
      )}
      {!keyboardOpen && <View style={{ flex: 1 }} />}

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
  
<GiftButtonLottie />

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
  hostId={roomData?.hostId}
  fallbackAvatar={STABLE_AVATAR}
  onRecharge={goRecharge}
  totalSpent={walletInfo.totalSpent}
  walletLevel={walletInfo.level > 1 ? walletInfo.level : undefined}
/>




<ProfileSheet
  db={db}
  ModalComponent={SafeModal}
  visible={speakerModalVisible || profileVisible}
  onClose={() => { setSpeakerModalVisible(false); setProfileVisible(false); }}
  user={{
    uid: selectedSpeaker?.userId,
    name: selectedSpeaker?.userName,
    img: selectedSpeaker?.userImg,
    level: profileLevel,
    verified: !!(isVerified(selectedSpeaker?.verified)),
    verifiedColor: selectedSpeaker?.verifiedColor,
  }}
  levelTheme={getLevelTheme(profileLevel)}
  avatar={<ProfileAvatar uri={selectedSpeaker?.userImg} uid={selectedSpeaker?.userId} level={profileLevel} size={100} />}
  stats={{ followers: previewFollowersCount, following: previewFollowingCount, likes: previewLikesCount, loading: previewStatsLoading }}
  isMe={!selectedSpeaker?.userId || selectedSpeaker.userId === currentUid}
  following={previewIsFollowing}
  followBack={previewIsFollowBack}
  followBusy={previewFollowBusy}
  onFollow={() => handlePreviewFollow(selectedSpeaker)}
  onProfile={() => {
    setSpeakerModalVisible(false);
    setProfileVisible(false);
    if (agoraEngineRef.current) {
      agoraEngineRef.current.muteAllRemoteAudioStreams(true);
    }
    router.push({ pathname: "/userProfile", params: { userId: selectedSpeaker?.userId, roomId: roomId } });
  }}
>
  {speakerModalVisible && (
    <>
      <SheetChip label="❌ Remove" color="#DC2626" onPress={() => { removeSpeaker(selectedSeatKey); setSpeakerModalVisible(false); }} />
      <SheetChip label={selectedSpeaker?.isMuted ? "🔇 Unmute" : "🔊 Mute"} color="#374151" onPress={muteSpeaker} />
    </>
  )}
  {canManage && !!selectedSpeaker?.userId && selectedSpeaker.userId !== currentUid && selectedSpeaker.userId !== roomData?.hostId && (
    <SheetChip
      label={roomData?.admins?.[selectedSpeaker.userId] ? "🛡 Remove Admin" : "🛡 Make Admin"}
      color={roomData?.admins?.[selectedSpeaker.userId] ? "#ff5a5a" : "#f1c40f"}
      textColor={roomData?.admins?.[selectedSpeaker.userId] ? "#ff5a5a" : "#f1c40f"}
      outline
      onPress={() => toggleAdmin(selectedSpeaker.userId, selectedSpeaker.userName)}
    />
  )}
  {!!selectedSpeaker?.userId && selectedSpeaker.userId !== currentUid && (
    <>
      <SheetChip label={previewHasLiked ? "Liked" : "Like"} icon={previewHasLiked ? "heart" : "heart-outline"} color="#ff1493" textColor="#fff" outline disabled={previewLikeBusy} onPress={() => handlePreviewLike(selectedSpeaker)} />
      <SheetChip label="Report" icon="flag" color="#ff5a5a" textColor="#ff5a5a" outline onPress={() => handleReportFromRoom(selectedSpeaker)} />
      <SheetChip label="Block" icon="ban" color="#777" textColor="#fff" outline onPress={() => handleBlockFromRoom(selectedSpeaker)} />
    </>
  )}
</ProfileSheet>

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
(item.level >= 30 || !!item.id) && (

<GuardedFrame level={item.level} uid={item.id} animated={false}
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
    <LevelBadge level={item.level || 1} size={10} style={{ marginLeft: 8 }} />

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

    {/* Official / Admin: live ke andar hi search + ID/device ban + live band */}
    <OfficialLiveTools roomId={roomId} hostId={roomData?.hostId} />

    {/* ================= 3-LINE MENU (saare options yahan) ================= */}
    <SafeModal
      visible={moreVisible}
      transparent
      animationType="slide"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={() => setMoreVisible(false)}
    >
      <View style={styles.bottomSheetOverlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setMoreVisible(false)} />
        <View style={[styles.moreSheet, { paddingBottom: navGap + 14 }]}>
          <View style={styles.moreHandle} />
          <View style={styles.moreGrid}>
            {canManage && (
              <TouchableOpacity style={styles.moreTile} activeOpacity={0.7} onPress={() => moreGo(() => setHostPanelVisible(true))}>
                <View style={styles.moreIcon}><Ionicons name={chatLocked ? "lock-closed" : "construct"} size={22} color={chatLocked ? "#f1c40f" : "#fff"} /></View>
                <Text allowFontScaling={false} style={styles.moreTxt} numberOfLines={1}>{isHost ? 'Host' : 'Admin'}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.moreTile} activeOpacity={0.7} onPress={() => moreGo(() => setGiftersVisible(true))}>
              <View style={styles.moreIcon}><MaterialCommunityIcons name="trophy" size={22} color={T.gold} /></View>
              <Text allowFontScaling={false} style={styles.moreTxt} numberOfLines={1}>Top</Text>
            </TouchableOpacity>

            {currentUserRole !== 'listener' && (
              <TouchableOpacity style={styles.moreTile} activeOpacity={0.7} onPress={muteSelf}>
                <View style={styles.moreIcon}><Ionicons name={iAmMuted ? "mic-off" : "mic"} size={22} color={iAmMuted ? T.live : "#fff"} /></View>
                <Text allowFontScaling={false} style={styles.moreTxt} numberOfLines={1}>{iAmMuted ? 'Unmute' : 'Mute'}</Text>
              </TouchableOpacity>
            )}

            {currentUserRole !== 'listener' && (
              <TouchableOpacity style={styles.moreTile} activeOpacity={0.7} onPress={() => moreGo(() => setMusicSheetVisible(true))}>
                <View style={styles.moreIcon}><Ionicons name="musical-notes" size={22} color={music.playing ? "#2ee6a6" : "#fff"} /></View>
                <Text allowFontScaling={false} style={styles.moreTxt} numberOfLines={1}>Music</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.moreTile} activeOpacity={0.7} onPress={() => moreGo(() => setGameOpen('teen'))}>
              <View style={styles.moreIcon}><Text allowFontScaling={false} style={{ fontSize: 22 }}>🎴</Text></View>
              <Text allowFontScaling={false} style={styles.moreTxt} numberOfLines={1}>Teen Patti</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.moreTile} activeOpacity={0.7} onPress={() => moreGo(() => setGameOpen('greedy'))}>
              <View style={styles.moreIcon}><Text allowFontScaling={false} style={{ fontSize: 22 }}>🐰</Text></View>
              <Text allowFontScaling={false} style={styles.moreTxt} numberOfLines={1}>Greedy</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.moreTile} activeOpacity={0.7} onPress={() => moreGo(() => setMenuVisible(true))}>
              <View style={styles.moreIcon}><Ionicons name="ellipsis-horizontal" size={22} color="#fff" /></View>
              <Text allowFontScaling={false} style={styles.moreTxt} numberOfLines={1}>More</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeModal>

  </View>
);
  
}
