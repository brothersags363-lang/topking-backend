// @ts-nocheck
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

import { withDeferredMount } from '../components/DeferredScreen';
import { createLiveSocket } from '../utils/liveSocket';
import { reportVoiceAbuse } from '../utils/voiceReport';
import OfficialLiveTools from '../components/live/OfficialLiveTools';
import LiveSwipeShell from '../components/live/LiveSwipeShell';
import { blockIfProfane } from '../utils/guardText';
import { notifyNewFollower } from '../utils/pushNotify';
import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, StatusBar, FlatList, Keyboard, Animated, Easing, PermissionsAndroid, ActivityIndicator, Share, AppState, Alert, Switch, TouchableWithoutFeedback, InteractionManager } from 'react-native';
import { scopedBackHandler } from '../utils/scopedBack';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useRouter } from '../utils/safeRouter';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as ScreenCapture from 'expo-screen-capture';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gifts } from '../assets/giftsData';
import { callApi } from '../utils/api';
import { chargeLiveGift } from '../utils/liveGiftApi';
import { useLiveBanGuard } from '../utils/liveBan';
import { checkUsername } from '../utils/usernameGate';
import { useBlockedIds } from '../utils/useBlockedIds';
import JoinEntry from '../components/live/JoinEntry';
import { markJoinPending } from '../components/live/useJoinDelay';
import { useRoomMusic, MusicSheet } from '../components/live/RoomMusic';
import { doc, getDoc, getDocs, onSnapshot, setDoc, updateDoc, addDoc, deleteDoc, deleteField, increment, collection, query, where, orderBy, limit, writeBatch, runTransaction, serverTimestamp } from 'firebase/firestore';
import { createAgoraRtcEngine, ChannelProfileType, ClientRoleType, RtcSurfaceView } from 'react-native-agora';
import useLiveSwipe from '../utils/useLiveSwipe';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { AGORA_APP_ID, STABLE_AVATAR, isVerified, normTickColor, cleanVerified, JOIN_ANIM_VARIANT, HEARTBEAT_INTERVAL, PK_DURATION_SEC, PK_RESULT_SHOW_MS, PK_INVITE_TTL, PK_UID_OFFSET, PK_FRIEND_MODE, PK_FRIEND_LIMIT, VIDEO_PROFILE, VIDEO_PROFILE_LOW, MAX_GUESTS, GUEST_REQUEST_TTL, GUEST_JOIN_GRACE_MS, GUEST_TILE_W, pkPanelHFixed, PK_BAR_H, MATCH_TIMEOUT_SEC, WELCOME_TEXT, uidToNum, fmtK, FILTERS, RECHARGE_ROUTE, GIFT_WRITE_GAP, width, height } from '../components/videolive/constants';
import { QUICK_EMOJIS, cleanText, VOICE_ABUSE_REASON, getLevelTheme, warmUpBackend, fetchAgoraToken } from '../components/videolive/helpers';
import { GiftLayer, giftPendingStore, ChatBoxInput } from '../components/videolive/LiveWidgets';
import { ComboButton, HeartsLayer, ChatItem, chatKeyExtractor } from '../components/videolive/ComboHearts';
import { PkTimerPill } from '../components/videolive/PkWidgets';
import { styles } from '../components/videolive/styles';
import { db, auth } from '../components/videolive/vlFirebase';
import { registerTick } from '../components/videolive/tickScheduler';
import { BackgroundStage, PkPills, GuestTiles, TopHeader, BottomControls } from '../components/videolive/LiveOverlays';
import { ExitModal, GiftModal, ViewerListModal, RankModal, ProfileCardModal, ChatMenuModal, ReportModal, SettingsModal, SummaryModal, GuestsMenuModals, FilterModal } from '../components/videolive/LiveModals';
import { PkSheetModal, PkMatchingModal, PkInviteModal } from '../components/videolive/PkModals';

function VideoLive() {
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
      .then(() => __DEV__ && console.log("SECURE: screen capture BLOCKED for viewer"))
      .catch((e) => __DEV__ && console.log("SECURE: block FAILED", e?.message || e));
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
  const chatInputRef = useRef<any>(null); // SMOOTH FIX: typed text ab ChatBoxInput ke andar (poori screen re-render nahi)

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
  const [myTotalSpent, setMyTotalSpent] = useState(0);   // gift popup level bar
  const [myWalletLevel, setMyWalletLevel] = useState(0);

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
  const lastGiftWriteAtRef = useRef(0); // last gift write ka time (fast send + unique timestamp)
  const remoteGiftHandlerRef = useRef<any>(null); // dusron ka gift turant dikhane ke liye
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
  // ===== ROOM MUSIC (LiveRoom.js jaisa hi - Agora audio mixing) =====
  const music = useRoomMusic(agoraEngineRef);
  const [musicSheetVisible, setMusicSheetVisible] = useState(false);
  useEffect(() => {
    // sirf host song chala sakta hai (host hi mic publish karta hai); list pehle se cache -> sheet instant khule
    if (isHost) music.fetchSongs();
    else if (music.current) music.stop();
  }, [isHost]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // REALTIME (socket): likes + viewer count Firestore room doc se nahi, socket se jate hain (utils/liveSocket.js).
  // Socket na lage to neeche sab purane Firestore raste par chalta rehta hai.
  const liveSocketRef = useRef<any>(null);
  const socketUpRef = useRef(false);
  const seenActiveRef = useRef(false);
  const endedExitRef = useRef(false);
  const sockLikeTimerRef = useRef<any>(null);
  const pendingSockLikesRef = useRef(0);
  const [socketUp, setSocketUp] = useState(false);
  const [socketViewers, setSocketViewers] = useState<number | null>(null);
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
  const [giftSelId, setGiftSelId] = useState<any>(null); // selected gift in sheet (Tiki style)
  const [giftQty, setGiftQty] = useState(1); // 1 / 9 / 99 / 199 / 999
  const [emojiOpen, setEmojiOpen] = useState(false);
  const lastChatAtRef = useRef(0);
  const peakViewersRef = useRef(0);
  const kickedHandledRef = useRef(false);
  const [reportTarget, setReportTarget] = useState<any>(null);
  // ---------- comment reply / delete + Manage (mute / kick) ----------
  const [chatMenu, setChatMenu] = useState<any>(null); // long-press / tap on a comment
  const [replyTo, setReplyTo] = useState<any>(null); // { id, uid, name, text }
  const [manageOpen, setManageOpen] = useState(false); // profile card -> Manage sheet
  const [kickDlg, setKickDlg] = useState(false); // "Do you want to kick out this viewer?"
  const [kickBlock, setKickBlock] = useState(false); // "Add to Blocked List"
  const kickBaselineRef = useRef<any>(undefined);

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
  // socket chal raha ho to server ki sahi ginti (200 ki limit nahi, purane presence docs nahi); warna audience list
  // FIX: socket ki ginti tab kam aati thi jab kuch viewers ka socket judta nahi (host ko 1 dikhta tha, 8-10 the).
  // Ab socket aur audience list dono me se jo BADI ho wahi dikhegi -> kam nahi dikhega.
  const viewerCount = socketUp && socketViewers !== null
    ? Math.max(socketViewers, audienceArray.length)
    : isHost
    ? audienceArray.length
    : Math.max(audienceArray.length, Number(roomData?.viewerCount || 0));
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
  // Header: always up to 4 people. Gifters first (most stars in front), then the other viewers by level.
  const headerFive: any[] = React.useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    rankedGifters.forEach((g: any) => {
      // gifter sirf tab dikhe jab abhi room me ho (audience me); gift karke chala gaya to hat jaye,
      // wapas aaye to apne stars ke hisaab se fir aage dikhne lage
      if (out.length < 4 && g?.uid && !!audienceMap[g.uid] && !blockedIds.has(g.uid) && !seen.has(g.uid)) {
        seen.add(g.uid);
        out.push({ ...g, isGifter: true });
      }
    });
    audienceSorted.forEach((u: any) => {
      if (out.length < 4 && u?.uid && !seen.has(u.uid)) {
        seen.add(u.uid);
        out.push({ ...u, isGifter: false });
      }
    });
    return out;
  }, [rankedGifters, audienceSorted, audienceMap, blockedIds]);

  // ---------- guard: no room id at all ----------
  useEffect(() => {
    if (!roomId) __DEV__ && console.log("VideoLive opened without a room id.");
  }, [roomId]);

  // ---------- MY wallet (stars) ----------
  useEffect(() => {
    if (!db || !currentUid) return;
    const unsub = onSnapshot(doc(db, "wallets", currentUid), (snap) => {
      if (snap.exists()) {
        setStars(snap.data()?.stars || 0);
        setMyTotalSpent(snap.data()?.totalSpent || 0);
        setMyWalletLevel(snap.data()?.level || 0);
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
        } else {
          setCurrentName(auth?.currentUser?.displayName || "User");
          setCurrentRealName(auth?.currentUser?.displayName || "User");
          setCurrentAvatar(auth?.currentUser?.photoURL || STABLE_AVATAR);
        }
        if (walletSnap.exists()) setMyLevel(walletSnap.data()?.level || 1);
      } catch (e) {
        __DEV__ && console.log("MY PROFILE LOAD ERROR:", e);
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

    // SMOOTH FIX: gift aane par sirf seatStars/topGifters/liveGift badalte hain -> poori screen har baar
    // re-render hoti thi. Ab aisi badlav 700ms me ek baar; seat/PK/guest jaisi asli badlav turant.
    let coreSig = "";
    let pendingRoom: any = null;
    let throttleTimer: any = null;

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

      // FAST: gift turant dikhao - React state / re-render ka wait nahi (baaki sab neeche pehle jaisa)
      if (giftBaselineSetRef.current && data?.liveGift) remoteGiftHandlerRef.current?.(data.liveGift);

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
        // socket chal raha ho to hearts socket se aate hain (server ka 15s-batch delta dobara na dikhao)
        if (likeDelta > 0 && !socketUpRef.current) heartsRef.current?.spawn(Math.min(likeDelta, 4));
      }

      // lastHeartbeat / likes / viewerCount change all the time but nothing on screen shows them
      const { lastHeartbeat: _hb, likes: _lk, viewerCount: _vc, ...restOfRoom } = data as any;
      let sig = "";
      try {
        sig = JSON.stringify(restOfRoom);
      } catch (_) {}
      if (sig && sig === lastRoomSigRef.current) return;
      lastRoomSigRef.current = sig;

      let core = "";
      try {
        const { liveGift: _g1, seatStars: _g2, topGifters: _g3, pk: _pk, ...coreRest } = restOfRoom;
        // SMOOTH PK: PK me har gift par pk.score badalta hai (aur loser face ~4x/sec) -> pehle har baar poori
        // screen turant re-render hoti thi. Ab score/face badlav throttle hote hain; status/pkId jaisi asli badlav turant.
        core = JSON.stringify(coreRest) + "|" + JSON.stringify(_pk ? { ..._pk, score: 0, face: null } : null);
      } catch (_) {}
      if (!core || core !== coreSig) {
        coreSig = core;
        pendingRoom = null;
        if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
        setRoomData(data);
      } else {
        pendingRoom = data;
        if (!throttleTimer) {
          throttleTimer = setTimeout(() => {
            throttleTimer = null;
            if (pendingRoom) { const d = pendingRoom; pendingRoom = null; setRoomData(d); }
          }, (data as any)?.pk?.status === "active" ? 350 : 700); // PK me score bar thoda tez (350ms)
        }
      }

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
      // FIX: phone ke purane (cache) snapshot me status "ended" hota hai to viewer "Connecting to live..." par hi
      // bahar fek diya jata tha. Ab sirf server ka taaza snapshot ya "active dekha phir ended hua" par hi bahar.
      if (data.status === "active") seenActiveRef.current = true;
      if (!isHost && data.status === "ended") {
        const fresh = !snap.metadata.fromCache;
        if (fresh || seenActiveRef.current) {
          if (!endedExitRef.current) { endedExitRef.current = true; router.back(); }
        }
      }
    });

    return () => { unsub(); if (throttleTimer) clearTimeout(throttleTimer); };
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
        __DEV__ && console.log("HOST PROFILE LOAD ERROR:", e);
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
        await setDoc(roomRef, { status: "active", hostVideoOff: false, lastHeartbeat: serverTimestamp() }, { merge: true });
      } catch (e) {
        __DEV__ && console.log("ROOM ACTIVATE ERROR:", e);
      }
    })();

    heartbeatRef.current = registerTick("heartbeat", HEARTBEAT_INTERVAL, () => {
      updateDoc(roomRef, { lastHeartbeat: serverTimestamp() }).catch(() => {});
    });

    // Live reward: host ka time server gintta hai (30s ping)
    const rewardPing = () => {
      if (AppState.currentState !== "active") return;
      callApi("/reward/live-ping", { roomId, source: "videolive" }).catch(() => {});
    };
    rewardPing();
    rewardPingRef.current = registerTick("rewardPing", 30000, rewardPing);

    return () => {
      heartbeatRef.current?.();
      rewardPingRef.current?.();
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
    let chatCacheLocal = new Map<string, any>();
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
        // NAYI join line: chat me dikhane se pehle upar pill ka time (3.5s) de do
        if (chatsReadyRef.current) {
          snap.docChanges().forEach((ch) => {
            if (ch.type === "added" && (ch.doc.data() as any)?.type === "join") markJoinPending(ch.doc.id);
          });
        }
        // PERF: sirf badle / naye messages ke naye objects; baaki purane object reuse
        // (taaki memo(ChatItem) baaki rows ko dobara render na kare)
        const changedIds = new Set<string>();
        snap.docChanges().forEach((ch) => {
          if (ch.type !== "removed") changedIds.add(ch.doc.id);
        });
        const nextCache = new Map<string, any>();
        const msgs = snap.docs
          .map((d) => {
            const prev = chatCacheLocal.get(d.id);
            const obj = prev && !changedIds.has(d.id) ? prev : { id: d.id, ...d.data() };
            nextCache.set(d.id, obj);
            return obj;
          })
          .reverse();
        chatCacheLocal = nextCache;
        chatPending = msgs;
        const sinceFlush = Date.now() - chatLastFlush;
        // SPEED: apna bheja hua / delete kiya hua comment turant dikhe (300ms wait nahi)
        const instant = snap.docChanges().some((ch) => ch.type === "removed" || ch.doc.metadata.hasPendingWrites);
        if (chatLastFlush === 0 || sinceFlush >= 120 || instant) flushChats();
        else if (!chatTimer) chatTimer = setTimeout(flushChats, 120 - sinceFlush);

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
      (e) => __DEV__ && console.log("Chat listener error:", e)
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
      orderBy("joinedAt", "desc"),
      // COST FIX: har viewer join par 200 reads lagte the (aur har join/leave sabko). Viewer ko 50 kaafi;
      // sahi count socket / room.viewerCount se aata hai. Host ko poori (200) list.
      limit(isHost ? 200 : 50)
    );

    // First load is instant, then updates are coalesced (max 1 render / 600ms).
    let firstLoad = true;
    let latestMap: any = {};
    let flushTimer: any = null;

    const unsubAudience = onSnapshot(
      audienceQuery,
      (snap) => {
        // PERF: badle hue users ke hi naye objects; baaki reuse
        const changedAud = new Set<string>();
        snap.docChanges().forEach((ch) => {
          if (ch.type !== "removed") changedAud.add(ch.doc.id);
        });
        const map: any = {};
        snap.forEach((d) => {
          const prev = latestMap[d.id];
          map[d.id] = prev && !changedAud.has(d.id) ? prev : { uid: d.id, ...d.data() };
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
      (e) => __DEV__ && console.log("Audience listener error:", e)
    );

    return () => {
      unsubAudience();
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [roomId, isHost]);

  // ---------- host: publish viewer count (PK list shows it) ----------
  useEffect(() => {
    if (!db || !roomId || !isHost) return;
    const t = setTimeout(() => {
      // socket chal raha ho to server 15s me ek baar likhta hai (har badlav par nahi => reads bachte hain)
      if (liveSocketRef.current?.isConnected?.()) return;
      updateDoc(doc(db, "rooms", roomId), { viewerCount }).catch(() => {});
    }, 15000); // COST FIX: 4s -> 15s (har write sabhi viewers ka read hota hai)
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
        // USERNAME GATE: username ke bina viewer entry nahi
        if (!(await checkUsername())) {
          Alert.alert("Username zaruri hai", "Live me aane ke liye pehle Edit Profile me apna username set karo.");
          try { (router as any).canGoBack?.() ? router.back() : router.replace("/"); } catch (_) {}
          return;
        }
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
              verified: myVerified,
              verifiedColor: normTickColor(myVerifiedColor),
              level: myLevel,
              createdAt: Date.now(),
            })
          );
        }
        await Promise.all(jobs);
      } catch (e) {
        __DEV__ && console.log("JOIN ERROR:", e);
      }
    })();

    // Leaving the screen = presence doc removed (viewer count drops).
    return () => {
      deleteDoc(audRef).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, currentUid, profileReady, isHost]);

  // ---------- remote gift (liveGift) → combo banner + animation (LiveRoom jaisa) ----------
  const handleRemoteGift = (gift: any) => {
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
          senderId: gift.senderId,
          level: gift.senderLevel,
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
  };
  remoteGiftHandlerRef.current = handleRemoteGift;
  // fallback (agar snapshot se miss ho gaya to yahan se; same key dobara nahi chalegi)
  useEffect(() => {
    remoteGiftHandlerRef.current?.(roomData?.liveGift);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.liveGift?.timestamp]);

  // gift sheet: band hone ke baad sheet neeche reset (agli baar flash nahi hoga)
  useEffect(() => {
    if (!giftModalVisible) giftModalAnim.setValue(420);
  }, [giftModalVisible]);
  const closeGiftModal = useCallback(() => {
    Animated.timing(giftModalAnim, { toValue: 420, duration: 170, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() =>
      setGiftModalVisible(false)
    );
  }, []);

  // gift sheet slide-up
  useEffect(() => {
    if (giftModalVisible) {
      giftModalAnim.setValue(420);
      setGiftPageIdx(0);
      setGiftSelId((prev: any) => prev ?? (gifts[0] ? gifts[0].id : null));
      setGiftQty(1);
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
        setReplyTo(null);
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
      const t = registerTick("keepAwake", 15000, keepAwakeOn);
      return () => {
        t();
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
  const [chatH, setChatH] = useState(0);
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
    let oppCore = "";
    let oppPendingOd: any = null;
    let oppTimer: any = null;
    const unsub = onSnapshot(
      doc(db, "rooms", oppRoomId),
      { includeMetadataChanges: true },
      (s) => {
        // A snapshot served from the local cache can be OLD (opponent room
        // without the new pk yet). Using it made the PK end instantly.
        if (s.metadata.fromCache) return;
        const full: any = s.exists() ? s.data() : null;
        // SMOOTH FIX: opponent room me likes / viewerCount / seatStars / roomGifters / liveGift / chat
        // fields bahut baar badalte hain, par PK screen ko sirf status + pk (score, pkId, face, gifters)
        // chahiye. Pehle har badlav par poori screen re-render hoti thi -> PK me lag. Ab sirf kaam ke fields.
        const od: any = full ? { status: full.status, pk: full.pk || null } : null;
        let osig = "null";
        try {
          if (od) osig = JSON.stringify(od);
        } catch (_) {}
        if (osig !== lastOppSigRef.current) {
          lastOppSigRef.current = osig;
          // SMOOTH PK: sirf score/face badla to 300ms me ek hi baar render; status/pkId badle to turant
          let core = "null";
          try {
            if (od) core = JSON.stringify({ status: od.status, pk: od.pk ? { ...od.pk, score: 0, face: null } : null });
          } catch (_) {}
          if (core !== oppCore) {
            oppCore = core;
            oppPendingOd = null;
            if (oppTimer) { clearTimeout(oppTimer); oppTimer = null; }
            setOppRoom(od);
          } else {
            oppPendingOd = od;
            if (!oppTimer) {
              oppTimer = setTimeout(() => {
                oppTimer = null;
                if (oppPendingOd) { const d = oppPendingOd; oppPendingOd = null; setOppRoom(d); }
              }, 300);
            }
          }
        }
        setOppLoaded(true);
      }
    );
    return () => {
      unsub();
      if (oppTimer) clearTimeout(oppTimer);
    };
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
      __DEV__ && console.log("PK END ERROR:", e);
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

  // rooms snapshot -> PK candidate list (online = free, busy = "In PK" / "Voice room")
  const buildPkCandidates = (snap: any) => {
    const now = Date.now();
    const list: any[] = [];
    snap.forEach((d) => {
      if (d.id === roomId) return;
      const x: any = d.data();
      if (!x?.hostId || x.hostId === currentUid) return;
      if (blockedRef.current.has(x.hostId)) return; // BLOCK: PK list me blocked host nahi
      const hb = x.lastHeartbeat?.toMillis?.() || 0;
      // FIX: host heartbeat ab 60s par likhta hai (HEARTBEAT_INTERVAL), to 45s ka filter har minute me
      // ~15s ke liye live host ko list se gayab kar deta tha. 2.5 x heartbeat = 150s.
      if (!hb || now - hb > 150000) return; // not really live anymore
      // voice rooms can't PK / already in a PK or has a pending invite
      const busy = x.seatsData ? "Voice room" : x.pk || x.pkInvite ? "In PK" : "";
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

  // active hosts I could battle (used by the PK sheet and Random Match)
  // SPEED/READS: ye saare active rooms padhta hai. 4 sec ke andar dobara bulaya to wahi list (force=true par taaza).
  const pkCandCacheRef = useRef<{ at: number; list: any[] } | null>(null);
  const fetchPkCandidates = async (includeBusy = false, force = false) => {
    if (!db) return [];
    const cached = pkCandCacheRef.current;
    // READS SAVER: random match har 3s poochta hai; list 10s tak same rakho (pehle 4s)
    if (!force && cached && Date.now() - cached.at < 10000) {
      return includeBusy ? cached.list : cached.list.filter((c: any) => !c.busy);
    }
    const snap = await getDocs(query(collection(db, "rooms"), where("status", "==", "active")));
    const list = buildPkCandidates(snap);
    pkCandCacheRef.current = { at: Date.now(), list };
    return includeBusy ? list : list.filter((c: any) => !c.busy);
  };

  const loadFollowing = async () => {
    if (!db || !currentUid) return;
    try {
      const fs = await getDocs(query(collection(db, "users", currentUid, "following"), limit(300)));
      const set = new Set<string>();
      fs.forEach((d) => set.add(d.id));
      setFollowingIds(set);
    } catch (e) {
      __DEV__ && console.log("FOLLOWING LOAD ERROR:", e);
    }
  };

  // my friends for the PK sheet (profiles cached for the session)
  // friendIdSet holds EVERY friend uid, so a friend who is live is always shown
  // (live rows come from the rooms query, they don't need a profile read).
  const friendsLoadedAtRef = useRef(0);
  const loadFriends = async (force = false) => {
    if (!db || !currentUid) return;
    // SPEED/COST: friends list 5 min tak cache (sheet baar baar kholne par dobara reads nahi)
    if (!force && friendsLoadedAtRef.current && Date.now() - friendsLoadedAtRef.current < 300000) return;
    try {
      const needFollowers = PK_FRIEND_MODE === "mutual" || PK_FRIEND_MODE === "either";
      // SPEED: following + followers ek saath (pehle ek ke baad ek)
      const [fSnap, rSnap] = await Promise.all([
        getDocs(query(collection(db, "users", currentUid, "following"), limit(300))),
        needFollowers ? getDocs(query(collection(db, "users", currentUid, "followers"), limit(300))) : Promise.resolve(null as any),
      ]);
      const following = new Set<string>();
      fSnap.forEach((d: any) => following.add(d.id));
      setFollowingIds(following);

      let ids: string[] = Array.from(following);
      if (rSnap) {
        const followers = new Set<string>();
        rSnap.forEach((d: any) => followers.add(d.id));
        ids =
          PK_FRIEND_MODE === "mutual"
            ? ids.filter((id) => followers.has(id))
            : Array.from(new Set<string>([...ids, ...Array.from(followers)]));
      }
      ids = ids.filter((id) => id !== currentUid && !blockedRef.current.has(id));
      setFriendIdSet(new Set(ids));
      friendsLoadedAtRef.current = Date.now();

      const top = ids.slice(0, PK_FRIEND_LIMIT);
      // SPEED: jinke profile pehle se cache me hain wo turant dikhao, baaki baad me
      const cachedNow = top.filter((uid) => friendProfilesRef.current[uid]).map((uid) => friendProfilesRef.current[uid]);
      if (cachedNow.length) setFriendsList(cachedNow);

      const missing = top.filter((uid) => !friendProfilesRef.current[uid]);
      if (missing.length) {
        await Promise.all(
          missing.map(async (uid) => {
            let prof: any = { uid, name: "User", img: STABLE_AVATAR };
            try {
              const sn = await getDoc(doc(db, "users", uid));
              if (sn.exists()) {
                const u: any = sn.data();
                prof = { uid, name: u.username || u.name || "User", img: u.profileImg || u.photoURL || STABLE_AVATAR };
              }
            } catch (e) {}
            friendProfilesRef.current[uid] = prof;
          })
        );
      }
      setFriendsList(top.map((uid) => friendProfilesRef.current[uid]).filter(Boolean));
    } catch (e) {
      friendsLoadedAtRef.current = 0;
      __DEV__ && console.log("FRIENDS LOAD ERROR:", e);
    }
  };

  const openPkList = () => {
    if (!db) return;
    // SPEED: sheet TURANT khulti hai; list cache se foran dikhti hai, fresh data live listener se aata hai
    setPkListVisible(true);
    const cached = pkCandCacheRef.current;
    if (cached?.list?.length) {
      setPkCandidates(cached.list);
      setPkLoading(false);
    } else {
      setPkLoading(true);
    }
    loadFriends();
    warmUpBackend(); // wake the token server now so the opponent video loads fast
  };

  // Room pehle smooth khule (camera + live start) — uske BAAD hi friends + live list chupke se load hoti hai,
  // taaki PK icon dabate hi sab data turant dikhe. Room khulte waqt koi extra kaam nahi.
  useEffect(() => {
    if (!isHost || !db || !roomId || !currentUid || !agoraReady || !localReady) return;
    let stop = false;
    let t2: any = null;
    const t1 = setTimeout(() => {
      InteractionManager.runAfterInteractions(() => {
        if (stop) return;
        loadFriends();
        // list alag se thodi der baad, dono ek saath na chalein (jank nahi)
        t2 = setTimeout(() => {
          if (!stop) fetchPkCandidates(true, false).catch(() => {});
        }, 1500);
      });
    }, 5000);
    return () => {
      stop = true;
      clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, roomId, currentUid, agoraReady, localReady]);

  // PK sheet open → list cache se turant; cache 20s se purani ho to ek baar refresh, phir har 30s.
  // COST FIX: live listener har room ka har badlav (likes/gifts/heartbeat) padhta tha = bahut reads.
  // Polling sasta hai; invite bhejte waqt wo host ek baar aur check hota hai (sendPkInvite), isliye galat invite nahi jata.
  useEffect(() => {
    if (!pkListVisible || !isHost || !db) return;
    let stop = false;
    let lastSig = "";
    const refresh = async () => {
      if (AppState.currentState !== "active") return;
      try {
        const l = await fetchPkCandidates(true, true);
        if (stop) return;
        const sig = l.map((c: any) => `${c.id}:${c.busy}:${c.viewers}`).join("|");
        if (sig !== lastSig) {
          lastSig = sig;
          setPkCandidates(l);
        }
      } catch (e) {}
      if (!stop) setPkLoading(false);
    };
    const cached = pkCandCacheRef.current;
    if (!cached || Date.now() - cached.at > 20000) refresh();
    else setPkLoading(false);
    const i = setInterval(refresh, 30000);
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
        __DEV__ && console.log("MATCH ERROR:", e);
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
      // Invite se pehle dekho ki wo host abhi free hai (kisi PK me ya taaza invite pending to nahi).
      // Pehle seedha likh dete the = chalte PK / dusre ka invite overwrite ho sakta tha.
      // Check fail ho (network) to purane tareeke se aage badho.
      try {
        const ts = await getDoc(doc(db, "rooms", target.id));
        const tdata: any = ts.exists() ? ts.data() : null;
        const inviteLive = !!tdata?.pkInvite && Date.now() - (tdata.pkInvite.at || 0) < PK_INVITE_TTL;
        if (!tdata || tdata.status !== "active" || tdata.pk || inviteLive) {
          pkCandCacheRef.current = null; // list purani ho gayi
          showToast("That host is busy right now.");
          setPkBusy(false);
          return;
        }
      } catch (_) {}
      // SPEED: dono rooms ek hi batch me (pehle 2 alag awaits -> invite der se pahunchta tha)
      const inviteBatch = writeBatch(db);
      inviteBatch.update(doc(db, "rooms", roomId), {
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
      inviteBatch.update(doc(db, "rooms", target.id), {
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
      await inviteBatch.commit();
      setPkListVisible(false);
    } catch (e) {
      __DEV__ && console.log("PK INVITE ERROR:", e);
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
      __DEV__ && console.log("PK CANCEL ERROR:", e);
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
      const dur = PK_DURATION_SEC; // hamesha 3 min (purane app ka 5 min invite bhi 3 min hi chalega)
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
      __DEV__ && console.log("PK ACCEPT ERROR:", e);
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
      __DEV__ && console.log("PK DECLINE ERROR:", e);
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
          audienceLatencyLevel: 1, // SMOOTH: low-latency buffer (ultra-low me PK video atakti hai)
        } as any);
        joinedConn = conn;
        setPkConn(conn);
        if (soundMutedRef.current) {
          try {
            engine.muteAllRemoteAudioStreamsEx(true, conn);
          } catch (_) {}
        }
      } catch (e) {
        __DEV__ && console.log("PK JOIN OPPONENT CHANNEL ERROR:", e);
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
    let forceFresh = false; // token reject hua => cache wala token dobara mat use karo
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
      if (prefetchedToken && !forceFresh) {
        res = await prefetchedToken; // usually already finished while the engine started
        prefetchedToken = null;
      } else {
        prefetchedToken = null;
        res = await fetchAgoraToken(roomId, numericUid, isCancelled, () => setStatus("Waking up server..."), forceFresh);
        forceFresh = false;
      }
      if (!mounted || !engine) return;

      // Ban / login problem: khali token se join karke 110 error mat lo, wajah dikhao
      if (!res.token && res.error && (res.error.status === 403 || res.error.status === 401)) {
        clearJoinTimer();
        setStatus(`Failed: ${res.error.message || "Live access denied"}`);
        return;
      }

      numericUid = res.uid || numericUid;
      myAgoraUidRef.current = numericUid;

      if (!res.token) {
        __DEV__ && console.log("AGORA: no token from backend, trying to join without one");
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
        // SMOOTH FIX: low-latency (jitter buffer) - YouTube jaisa smooth, delay sirf 1-2 sec zyada
        ...(isHost ? {} : { audienceLatencyLevel: 1 }), // SMOOTH: 2 (ultra-low) me buffer ~0 tha -> atakta tha. 1 = thoda buffer, video smooth
      } as any);
      if (typeof ret === "number" && ret < 0) __DEV__ && console.log("AGORA joinChannel returned", ret);
    };

    // token close to expiry / expired while live → get a fresh one and renew
    const renewMainToken = async () => {
      const res = await fetchAgoraToken(roomId, numericUid, isCancelled, undefined, true); // renew => hamesha taaza token
      if (res.token && mounted && engine) {
        try {
          engine.renewToken(res.token);
        } catch (e) {
          __DEV__ && console.log("RENEW TOKEN ERROR:", e);
        }
      }
    };

    // token was rejected while joining → leave, get a new token, join again
    const rejoin = () => {
      if (!mounted || !engine || rejoinCount >= 2) return false;
      rejoinCount++;
      forceFresh = true;
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
          numericUid = uidToNum(currentUid || "guest") || 1;
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
            __DEV__ && console.log("VIDEO LIVE: joined channel", roomId, "as", isHost ? "host" : "viewer");
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
              // SMOOTH: panel aadha hai -> opponent ki chhoti (low) stream; 2 HD decode ek saath nahi
              try { (engine as any)?.setRemoteVideoStreamTypeEx?.(uid, 1, connection); } catch (_) {}
              setOppRemoteUid(uid);
              return;
            }
            setRemoteUsers((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
          },
          onRemoteVideoStateChanged: (connection: any, uid: number, state: number) => {
            if (!mounted) return;
            if (connection?.channelId && connection.channelId !== roomId) {
              // 1 = starting, 2 = decoding → opponent video is really there
              if (state === 1 || state === 2) {
                try { (engine as any)?.setRemoteVideoStreamTypeEx?.(uid, 1, connection); } catch (_) {}
                setOppRemoteUid(uid);
              }
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
            __DEV__ && console.log("Agora Error:", err, msg);
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
            // SMOOTH: Agora har ~2s me 1..6 bhejta hai; raw value par poori screen re-render hoti thi.
            // Ab sirf bucket (good=1 / ok=3 / bad=4) badalne par state badalti hai.
            if (q > 0) setNetQuality(q >= 4 ? 4 : q === 3 ? 3 : 1);
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
            __DEV__ && console.log("VIDEO CONFIG ERROR:", e);
          }
          try {
            // viewers on a weak network automatically get a small stream
            // SMOOTH FIX: low stream ko saaf (288x512 @15fps) rakho, default 160x120 bahut blur hoti hai
            const e2: any = engine;
            if (typeof e2.setDualStreamMode === "function") {
              e2.setDualStreamMode(1, { dimensions: { width: 288, height: 512 }, kBitrate: 280, framerate: 15 });
            } else {
              engine.enableDualStreamMode(true);
            }
          } catch (_) {
            try { engine.enableDualStreamMode(true); } catch (__) {}
          }

          engine.startPreview();
          try {
            // 0 = chalu ho gaya. Kisi device par na chale to ban nahi lagayenge (galat ban se bachne ke liye)
            faceCheckOnRef.current = Number((engine as any).enableFaceDetection(true)) === 0;
            lastFaceAtRef.current = Date.now();
            __DEV__ && console.log("FACE DETECTION:", faceCheckOnRef.current ? "ON" : "NOT SUPPORTED");
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
        __DEV__ && console.log("VIDEO LIVE AGORA INIT ERROR:", error?.message || error);
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
          __DEV__ && console.log("AGORA CLEANUP ERROR:", e);
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
  const pkProfileOnRef = useRef(false);
  const lastProfileSwitchRef = useRef(0);
  useEffect(() => {
    if (!isHost || !agoraReady) return;
    const t = registerTick("autoProfile", 5000, () => {
      const engine = agoraEngineRef.current;
      const q = netQualityRef.current;
      if (!engine || !q) return;
      if (Date.now() - lastProfileSwitchRef.current < 20000) return;
      if (pkProfileOnRef.current) return; // PK me PK profile chal rahi hai
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
        __DEV__ && console.log("AUTO PROFILE ERROR:", e);
      }
    });
    return () => t();
  }, [isHost, agoraReady]);

  // SMOOTH PK: PK me viewers ko aadha panel dikhta hai + host 2 video decode karta hai ->
  // host ki encode halki (360x640 @20fps) = kam garam, kam atakna. PK khatam -> wapas normal.
  useEffect(() => {
    if (!isHost || !agoraReady) return;
    const engine: any = agoraEngineRef.current;
    if (!engine) return;
    try {
      if (showPk) {
        pkProfileOnRef.current = true;
        engine.setVideoEncoderConfiguration({
          dimensions: { width: 360, height: 640 },
          frameRate: 20,
          bitrate: 700,
          minBitrate: 250,
          orientationMode: 2,
          degradationPreference: 1,
        });
      } else if (pkProfileOnRef.current) {
        pkProfileOnRef.current = false;
        engine.setVideoEncoderConfiguration(lowProfileRef.current ? VIDEO_PROFILE_LOW : VIDEO_PROFILE);
      }
    } catch (_) {}
  }, [isHost, agoraReady, showPk]);

  // HEAT FIX: face detection har frame par chalta tha (CPU). Ab har 30s me sirf 6s ON.
  // PK me haarne ke baad face-tracking chahiye -> tab lagatar ON.
  useEffect(() => {
    if (!isHost || !agoraReady) return;
    const setFace = (on: boolean) => {
      try { (agoraEngineRef.current as any)?.enableFaceDetection(on); } catch (_) {}
    };
    if (pkEnded) { setFace(true); return; }
    let offTimer: any = null;
    const cycle = () => {
      if (!faceCheckOnRef.current) return;
      setFace(true);
      offTimer = setTimeout(() => setFace(false), 6000);
    };
    const iv = registerTick("faceCycle", 30000, cycle);
    offTimer = setTimeout(() => setFace(false), 6000); // pehle 6s ke baad band
    return () => { iv(); if (offTimer) clearTimeout(offTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, agoraReady, pkEnded]);

  const toggleMic = () => {
    const engine = agoraEngineRef.current;
    if (!engine || !isHost) return;
    const next = !micMuted;
    try {
      engine.muteLocalAudioStream(next);
    } catch (e) {
      __DEV__ && console.log("MIC TOGGLE ERROR:", e);
    }
    setMicMuted(next);
    if (db && roomId) updateDoc(doc(db, "rooms", roomId), { hostMicMuted: next }).catch(() => {});
  };

  // "Video push / play" → pause & resume the camera stream
  const toggleVideo = () => {
    // TIKI JAISA: host live ke beech video band / pause nahi kar sakta (menu se option hata diya).
    return;
    const engine = agoraEngineRef.current;
    if (!engine || !isHost) return;
    const next = !videoOff;
    try {
      engine.enableLocalVideo(!next);
      engine.muteLocalVideoStream(next);
    } catch (e) {
      __DEV__ && console.log("VIDEO TOGGLE ERROR:", e);
    }
    setVideoOff(next);
    if (db && roomId) updateDoc(doc(db, "rooms", roomId), { hostVideoOff: next }).catch(() => {});
  };

  const flipCamera = () => {
    try {
      agoraEngineRef.current?.switchCamera();
      camFrontRef.current = !camFrontRef.current;
    } catch (e) {
      __DEV__ && console.log("FLIP CAMERA ERROR:", e);
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
      __DEV__ && console.log("BEAUTY ERROR:", e);
    }
    try {
      if (engine.setColorEnhanceOptions) {
        if (f.color) engine.setColorEnhanceOptions(true, f.color);
        else engine.setColorEnhanceOptions(false, { strengthLevel: 0, skinProtectLevel: 1 });
      }
    } catch (e) {
      __DEV__ && console.log("COLOR ENHANCE ERROR:", e);
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
      __DEV__ && console.log("OPP MUTE ERROR:", e);
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
      __DEV__ && console.log("SOUND TOGGLE ERROR:", e);
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
      __DEV__ && console.log(`Clear ${subName} error:`, e);
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
    const iv = registerTick("noFaceBan", 10000, () => {
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
    });
    return () => iv();
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
      heartbeatRef.current?.();
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
      __DEV__ && console.log(e);
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
      __DEV__ && console.log("REQUEST ERROR:", e?.code, e?.message || e);
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
      __DEV__ && console.log("LEAVE SEAT ERROR:", e);
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
          __DEV__ && console.log("GUEST PUBLISH ERROR:", e?.message || e);
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
      __DEV__ && console.log("ACCEPT GUEST ERROR:", e?.code, e?.message || e);
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
    const t = registerTick("guestGhosts", 6000, () => {
      const guests = roomDataRef.current?.guests || {};
      Object.values(guests).forEach((g: any) => {
        if (!g?.uid) return;
        if (Date.now() - Number(g.at || 0) < GUEST_JOIN_GRACE_MS) return;
        const aid = Number(g.agoraUid || 0);
        if (aid && !remoteUsersRef.current.includes(aid)) {
          updateDoc(doc(db, "rooms", roomId), { [`guests.${g.uid}`]: deleteField() }).catch(() => {});
        }
      });
    });
    return () => t();
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
    // host + viewer: dono ko pehle profile POPUP khulta hai.
    // Mute / Remove sirf popup ke "Manage" button ke andar (host ko) milta hai.
    openProfile({
      uid: g.uid,
      name: g.name,
      img: g.img,
      level: Number(g.level || 1),
      verified: g.verified,
      verifiedColor: g.verifiedColor,
      isGuestCard: true,
    });
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
    const chatMessage: string = chatInputRef.current?.getText?.() || "";
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
    if (nowMs - lastChatAtRef.current < 600) return; // anti-spam (Tiki jaisa fast)
    lastChatAtRef.current = nowMs;
    if (blockIfProfane(chatMessage)) return;
    const messageText = cleanText(chatMessage.trim()).slice(0, 200);
    const replySnap = replyTo;
    setReplyTo(null);
    Keyboard.dismiss();
    setEmojiOpen(false);
    chatInputRef.current?.clear?.();
    try {
      // setDoc(doc(collection)) = id pehle se pata (delete / reply ke liye) + local snapshot instant
      await setDoc(doc(collection(db, "rooms", roomId, "chats")), {
        senderName: currentRealName,
        username: currentName,
        message: messageText,
        senderId: currentUid,
        ...(replySnap
          ? { replyTo: { id: replySnap.id || "", uid: replySnap.uid || "", name: replySnap.name || "User", text: String(replySnap.text || "").slice(0, 80) } }
          : null),
        role: isHost ? "host" : mods[currentUid as string] ? "mod" : "user",
        userImg: currentAvatar || STABLE_AVATAR,
        verified: myVerified,
        verifiedColor: normTickColor(myVerifiedColor),
        level: myLevel,
        createdAt: Date.now(),
      });
    } catch (e) {
      __DEV__ && console.log("CHAT SEND ERROR:", e);
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
      __DEV__ && console.log("FOLLOW ERROR:", e);
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

  const openChatMenu = useCallback((c: any) => setChatMenu(c), []);
  const renderChat = useCallback(
    ({ item }: any) => <ChatItem chat={item} onUser={openProfile} onMenu={openChatMenu} />,
    [openProfile, openChatMenu]
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
    // SOCKET: 300ms ka batch seedha doosre phones tak; Firestore likhna nahi
    if (liveSocketRef.current?.isConnected?.()) {
      pendingSockLikesRef.current += 1;
      if (!sockLikeTimerRef.current) {
        sockLikeTimerRef.current = setTimeout(() => {
          sockLikeTimerRef.current = null;
          const n = pendingSockLikesRef.current;
          pendingSockLikesRef.current = 0;
          if (n > 0 && !liveSocketRef.current?.sendLike?.(n)) {
            // socket beech me gira => purane Firestore raste se bhejo
            pendingLikesRef.current += n;
            if (!likeTimerRef.current) likeTimerRef.current = setTimeout(flushLikes, 2500);
          }
        }, 300);
      }
      return;
    }
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

  // ↕ Swipe up/down = dusre live me jao (sirf normal viewer)
  const liveSwipe = useLiveSwipe({
    db, roomId, router, blockedRef, mode: 'video',
    enabled: !isHost && !amGuest,
    onBeforeSwitch: () => {
      try { flushGiftBatchRef.current?.(); } catch (_) {}
    },
  });

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

  // ----- REALTIME socket: likes (hearts) + viewer count -----
  useEffect(() => {
    if (!roomId) return;
    const rt = createLiveSocket({
      roomId,
      isHost,
      onLike: (n: number) => heartsRef.current?.spawn(Math.min(n, 4)),
      onViewers: (n: number) => setSocketViewers((p) => (p === n ? p : n)),
      onStatus: (up: boolean) => {
        socketUpRef.current = up;
        setSocketUp(up);
      },
    });
    liveSocketRef.current = rt;
    return () => {
      if (sockLikeTimerRef.current) {
        clearTimeout(sockLikeTimerRef.current);
        sockLikeTimerRef.current = null;
      }
      const n = pendingSockLikesRef.current;
      pendingSockLikesRef.current = 0;
      if (n > 0) rt.sendLike(n); // bache hue likes na khoyen
      rt.close();
      if (liveSocketRef.current === rt) liveSocketRef.current = null;
      socketUpRef.current = false;
    };
  }, [roomId, isHost]);

  // ----- kicked by host / moderator -----
  // Pehle se purani (block nahi) kick entry ho to dobara aane par rok nahi; nayi kick ya blocked = bahar.
  useEffect(() => {
    if (isHost || !currentUid || !roomData || kickedHandledRef.current) return;
    const k: any = roomData?.kicked?.[currentUid];
    const sig = k ? (k === true ? "legacy" : String(k.id || k.at || "x")) : "";
    const blocked = !!k && (k === true || !!k.blocked);
    if (kickBaselineRef.current === undefined) {
      kickBaselineRef.current = sig;
      if (!blocked) return;
    }
    if (!k) return;
    if (blocked || sig !== kickBaselineRef.current) {
      kickedHandledRef.current = true;
      Alert.alert("Removed", "You were removed from this live.");
      router.back();
    }
  }, [roomData?.kicked, currentUid, !!roomData]);

  // host ki Blocked List me ho to live me aa hi nahi sakta
  useEffect(() => {
    if (isHost || !db || !hostId || !currentUid) return;
    let alive = true;
    getDoc(doc(db, "users", hostId, "liveBlocked", currentUid))
      .then((sn) => {
        if (alive && sn.exists() && !kickedHandledRef.current) {
          kickedHandledRef.current = true;
          Alert.alert("Blocked", "Host ne aapko is live se block kiya hai.");
          router.back();
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [hostId, currentUid, isHost]);

  // profile card band hote hi Manage / Kick popup bhi band
  useEffect(() => {
    if (!profileCard) {
      setManageOpen(false);
      setKickDlg(false);
    }
  }, [profileCard]);

  // ----- moderation -----
  const canModerate = (t: any) =>
    isMod && !!t?.uid && t.uid !== currentUid && t.uid !== hostId && (isHost || !mods[t.uid]);

  const muteUser = async (t: any, mute: boolean) => {
    if (!db || !roomId) return;
    try {
      await updateDoc(doc(db, "rooms", roomId), { [`mutedUsers.${t.uid}`]: mute ? true : deleteField() });
    } catch (e) {
      __DEV__ && console.log("MUTE ERROR:", e);
    }
    setProfileCard(null);
  };

  // Kick Out (Tiki jaisa): "Add to Blocked List" ho to dobara kabhi nahi aa sakta,
  // warna sirf abhi nikalta hai (wapas aa sakta hai).
  const kickUser = async (t: any, block = false) => {
    if (!db || !roomId || !t?.uid) return;
    try {
      await updateDoc(doc(db, "rooms", roomId), {
        [`kicked.${t.uid}`]: { id: `${Date.now()}_${Math.floor(Math.random() * 1e6)}`, at: Date.now(), blocked: !!block },
      });
      deleteDoc(doc(db, "rooms", roomId, "audience", t.uid)).catch(() => {});
      if (block && hostId) {
        setDoc(doc(db, "users", hostId, "liveBlocked", t.uid), { uid: t.uid, name: t.name || "", at: Date.now() }).catch(() => {});
      }
    } catch (e) {
      __DEV__ && console.log("KICK ERROR:", e);
      showToast("Kick nahi hua, dobara try karo");
    }
    setKickDlg(false);
    setProfileCard(null);
  };

  // viewer list se Kick -> wahi Tiki wala confirm dialog
  const askKick = (t: any) => {
    setViewerListVisible(false);
    setProfileCard(t);
    setKickBlock(false);
    setTimeout(() => setKickDlg(true), 350);
  };

  const toggleMod = async (t: any) => {
    if (!isHost || !db || !roomId) return;
    try {
      await updateDoc(doc(db, "rooms", roomId), { [`mods.${t.uid}`]: mods[t.uid] ? deleteField() : true });
    } catch (e) {
      __DEV__ && console.log("MOD ERROR:", e);
    }
    setProfileCard(null);
  };

  // ----- chat lock (quick toggle) + delete all chats (host / moderators) -----
  const toggleChatLock = async () => {
    if (!isMod || !db || !roomId) return;
    try {
      await updateDoc(doc(db, "rooms", roomId as string), { chatLocked: !chatLocked });
    } catch (e) {
      __DEV__ && console.log("CHAT LOCK ERROR:", e);
    }
  };

  // ----- comment: delete (user = sirf apna, host / mod = koi bhi) + reply -----
  const canDeleteChat = (c: any) => !!c && !c.type && !!c.id && (isMod || (!!currentUid && c.senderId === currentUid));
  const deleteChatMsg = async (c: any) => {
    setChatMenu(null);
    if (!db || !roomId || !canDeleteChat(c)) return;
    setChatMessages((prev: any[]) => prev.filter((m: any) => m.id !== c.id)); // turant gayab
    try {
      await deleteDoc(doc(db, "rooms", roomId, "chats", c.id));
    } catch (e) {
      __DEV__ && console.log("DELETE CHAT ERROR:", e);
      setChatMessages((prev: any[]) =>
        prev.some((m: any) => m.id === c.id) ? prev : [...prev, c].sort((x: any, y: any) => Number(x.createdAt || 0) - Number(y.createdAt || 0))
      );
      showToast("Comment delete nahi hua");
    }
  };
  const startReply = (c: any) => {
    setChatMenu(null);
    if (!c || c.type) return;
    if (amMuted && !isMod) {
      Alert.alert("Muted", "The host has muted you in this live.");
      return;
    }
    if (chatLocked && !isMod) {
      Alert.alert("Chat is off", "The host has turned chat off for viewers.");
      return;
    }
    setReplyTo({
      id: c.id,
      uid: c.senderId || c.uid || "",
      name: c.senderName || c.username || "User",
      text: String(c.message || "").slice(0, 80),
    });
    setTimeout(() => setChatOpen(true), 120);
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
      __DEV__ && console.log("SETTINGS ERROR:", e);
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
  const handleSendGift = (item: any, qtyArg: number = 1) => {
    let qty = Math.max(1, Math.floor(Number(qtyArg) || 1));
    const wantedQty = qty;
    const receiverId = giftUsers[0]?.uid;
    if (!receiverId || typeof receiverId !== "string") {
      Alert.alert("Gift", "Please select a user");
      return false;
    }

    const unitPrice = Number(item.price || 0);

    // balance = wallet - (abhi tak write na hue taps) - (write ho chuke par snapshot pending)
    const available = stars - pendingSpendRef.current - inflightSpendRef.current;
    if (unitPrice > 0) qty = Math.min(qty, Math.floor(available / unitPrice)); // jitne afford ho utne hi
    if (qty < 1) {
      Alert.alert("Gift", "Not enough stars");
      return false;
    }
    const price = unitPrice * qty;

    // never gift yourself, and only users that are in the list
    if (receiverId === currentUid || !giftUsers.some((u) => u.uid === receiverId)) {
      Alert.alert("Gift", "Please select another user");
      return false;
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

    const startedCombo = !giftComboCountRef.current || !isComboContinue;
    if (startedCombo) giftComboCountRef.current = qty;
    else giftComboCountRef.current += qty;

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
          senderId: currentUid,
          level: myLevel,
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
    batch.taps += qty;
    batch.comboCount = comboCount;
    if (startedCombo) batch.chat = true; // chat line sirf combo ke pehle batch me

    // FAST: pehla tap TURANT Firestore me jata hai (pehle 1s rukta tha -> dusri taraf late dikhta tha).
    // Lagatar tap ho to max har 500ms me ek write (x count smooth badhta dikhe).
    const sinceWrite = Date.now() - lastGiftWriteAtRef.current;
    if (sinceWrite >= GIFT_WRITE_GAP) {
      flushGiftBatchRef.current?.();
    } else if (!giftFlushTimerRef.current) {
      giftFlushTimerRef.current = setTimeout(() => {
        flushGiftBatchRef.current?.();
      }, GIFT_WRITE_GAP - sinceWrite);
    }
    if (qty < wantedQty) Alert.alert("Gift", "Not enough stars");
    return true;
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
    const giftTimestamp = Math.max(Date.now(), lastGiftWriteAtRef.current + 1);
    lastGiftWriteAtRef.current = giftTimestamp;
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
  const stableSelectGift = useCallback((item: any) => setGiftSelId(item.id), []);
  // Send button: selected gift ko giftQty baar bhejo (stars kam pade to wahin ruk jata hai)
  const comboRef = useRef<any>(null);
  const comboItemRef = useRef<any>(null);
  // Combo button tap: wahi gift, wahi qty dobara (true = gaya, false = stars kam / user nahi)
  const comboTap = () => {
    const c = comboItemRef.current;
    if (!c) return false;
    return handleSendGiftRef.current?.(c.item, c.qty) === true;
  };
  const sendSelectedGift = () => {
    const item = gifts.find((g: any) => String(g.id) === String(giftSelId)) || gifts[0];
    if (!item) return;
    // SMOOTH: pehle 999 baar loop chalta tha (UI hang). Ab ek hi call me poori qty.
    const ok = handleSendGiftRef.current?.(item, giftQty);
    if (ok) {
      // Tiki jaisa: sheet band + Combo button (3s countdown, 10 tak tap)
      comboItemRef.current = { item, qty: giftQty };
      closeGiftModal();
      comboRef.current?.start();
    }
  };

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
        senderLevel: myLevel,
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
      // PK ka PEHLA gift HAR SIDE ke liye (dono side ko ek-ek baar) -> us side ke PK score me 2x.
      // Upar/wallet/stars me asli price hi jati hai. Authority room (chhota roomId) par transaction se
      // flag claim hota hai (side = receiverId), taaki ek side ko ek hi baar mile, dusri side ko alag.
      let pkScoreAdd = price;
      try {
        const isPkSide = receiverId === roomDataRef.current?.hostId || receiverId === curPk.opponentHostId;
        if (curPk.pkId && taps >= 1 && isPkSide && receiverId) {
          const authId = curPk.opponentRoomId && curPk.opponentRoomId < roomId ? curPk.opponentRoomId : roomId;
          const authRef = doc(db, "rooms", authId);
          const got = await runTransaction(db, async (tx: any) => {
            const snap = await tx.get(authRef);
            const apk = snap.exists() ? snap.data()?.pk : null;
            if (!apk || apk.status !== "active") return false;
            if (apk.firstBonus && apk.firstBonus[receiverId] === curPk.pkId) return false; // is side ko mil chuka
            tx.update(authRef, { [`pk.firstBonus.${receiverId}`]: curPk.pkId });
            return true;
          });
          if (got) pkScoreAdd = price + Number(item.price || 0); // sirf is side ke pehle gift ka extra (1x), baaki taps normal
        }
      } catch (e: any) {
        __DEV__ && console.log("PK FIRST GIFT BONUS SKIP:", e?.code, e?.message);
      }
      if (receiverId === roomDataRef.current?.hostId) {
        roomUpdate["pk.score"] = increment(pkScoreAdd);
        Object.assign(roomUpdate, supporter);
      } else if (receiverId === curPk.opponentHostId && curPk.opponentRoomId) {
        pkJobs.push(
          updateDoc(doc(db, "rooms", curPk.opponentRoomId), { "pk.score": increment(pkScoreAdd), ...supporter })
        );
      }
    }

    // PAISA SERVER PAR: stars server transaction me kat-te hain (phone wallet nahi chhoota).
    try {
      await chargeLiveGift({ roomId, giftId: item.id, taps, receiverIds: [receiverId] });
    } catch (e: any) {
      console.warn("GIFT CHARGE FAILED:", e?.code, e?.status, e?.message);
      inflightSpendRef.current = Math.max(0, inflightSpendRef.current - price);
      giftPendingStore.set(pendingSpendRef.current);
      showToast(e?.code === "NO_STARS" ? "Not enough stars" : "⚠️ Gift nahi gaya (server), dobara try karo");
      return;
    }

    // PEHLE room write (liveGift + seatStars). Fail ho to na stars kategi, na doosron ko kuch dikhega
    // -> user ko batao aur wallet se paisa mat kaato (LiveRoom jaisa).
    try {
      await updateDoc(roomRef, roomUpdate);
    } catch (e: any) {
      __DEV__ && console.log("GIFT ROOM WRITE FAILED:", e?.code, e?.message);
    console.warn("GIFT ROOM WRITE FAILED:", e?.code, e?.message);
      inflightSpendRef.current = Math.max(0, inflightSpendRef.current - price);
      giftPendingStore.set(pendingSpendRef.current);
      showToast("⚠️ Gift nahi gaya (room), dobara try karo");
      return;
    }

    const jobs: Promise<any>[] = [
      // wallet / receiver / topGifters ab server /live/gift me ho chuke
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
      if (r.status === "rejected") __DEV__ && console.log("GIFT WRITE FAILED #" + idx, (r as any).reason?.code, (r as any).reason?.message);
    });
  };

  // ============================================================
  // RENDER
  // ============================================================

  const levelTheme = getLevelTheme(hostLevel);

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
          key: "mic",
          label: micMuted ? "Unmute" : "Mute",
          active: micMuted,
          icon: <Ionicons name={micMuted ? "mic-off" : "mic"} size={24} color="#fff" />,
          onPress: toggleMic,
        },
        {
          key: "music",
          label: "Music",
          active: !!music.playing,
          icon: <Ionicons name="musical-notes" size={24} color={music.playing ? "#2ee6a6" : "#fff"} />,
          onPress: () => setMusicSheetVisible(true),
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

  // SMOOTH: PK list ke rows (map + sort) pehle HAR render par ban rahe the, sheet band ho tab bhi.
  // Ab sirf jab sheet khuli ho aur data badle tab (useMemo).
  const pkRows = React.useMemo(() => {
    if (!pkListVisible) return { friendRows: [] as any[], friendsLive: 0, recommended: [] as any[] };
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
    const friendRows = [...liveFriendRows, ...offlineFriendRows].sort((x: any, y: any) => friendRank(x) - friendRank(y));
    const friendsLive = friendRows.filter((r: any) => !r.offline && !r.busy).length;
    const recommended = pkCandidates
      .filter((c: any) => !c.busy && !friendIdSet.has(c.hostId))
      .slice()
      .sort((a: any, b: any) => b.viewers - a.viewers);
    return { friendRows, friendsLive, recommended };
  }, [pkListVisible, pkCandidates, friendsList, friendIdSet]);
  const pkFriendRows = pkRows.friendRows;
  const pkFriendsLive = pkRows.friendsLive;
  const pkRecommended = pkRows.recommended;

  const renderPkRow = (item: any) => {
    const off = !!item.offline;
    const busy = !!item.busy;
    const canInvite = !off && !busy;
    return (
      <View key={item.id} style={[styles.pkListRow, (off || busy) && { opacity: off ? 0.55 : 0.85 }]}>
        <View>
          <ExpoImage source={{ uri: item.img }} style={styles.pkListAva} cachePolicy="memory-disk" transition={0} />
          {!off && !busy && <View style={styles.pkLiveDot} />}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.pkListName} numberOfLines={1}>
            {item.name}
          </Text>
          {off ? (
            <Text style={[styles.pkListStat, { marginLeft: 0, marginTop: 3 }]}>Offline</Text>
          ) : busy ? (
            <Text style={[styles.pkListStat, { marginLeft: 0, marginTop: 3, color: "#FF8A4C" }]}>
              {item.busy === "In PK" ? "Playing PK" : item.busy}
            </Text>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
              <Text style={[styles.pkListStat, { marginLeft: 0, marginRight: 10, color: "#2ee6a6", fontWeight: "700" }]}>Online</Text>
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
            {off ? "Offline" : busy ? (item.busy === "In PK" ? "Off" : item.busy) : "Invite"}
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
        <ExpoImage source={{ uri: hostImg }} style={styles.pausedAvatar} cachePolicy="memory-disk" transition={0} />
      ) : (
        <View style={styles.pkBadge}>
          <Text style={styles.pkBadgeTxt}>PK</Text>
        </View>
      )}
      <Text style={styles.pausedText}>{label}</Text>
    </View>
  );

  return (
    <LiveSwipeShell swipe={liveSwipe}>
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <BackgroundStage camFrontRef={camFrontRef} hostImg={hostImg} hostRemoteUid={hostRemoteUid} hostVideoOff={hostVideoOff} isHost={isHost} mainVideoArea={mainVideoArea} myResult={myResult} oppRemoteUid={oppRemoteUid} oppResult={oppResult} oppRoom={oppRoom} pausedOverlay={pausedOverlay} pk={pk} pkActive={pkActive} pkBarAnim={pkBarAnim} pkBarTop={pkBarTop} pkConn={pkConn} pkEnded={pkEnded} pkPanelH={pkPanelH} pkPanelTop={pkPanelTop} pkPanelW={pkPanelW} pkSideAnim={pkSideAnim} showLocalVideo={showLocalVideo} showPk={showPk} showRemoteVideo={showRemoteVideo} shownMy={shownMy} shownOpp={shownOpp} videoOff={videoOff} />

      {/* tap anywhere on the video = send a heart */}
      <View style={StyleSheet.absoluteFill} {...liveSwipe.panHandlers}>
        <TouchableWithoutFeedback onPress={onScreenTap}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      </View>

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

      <PkPills currentUid={currentUid} followGuest={followGuest} hostId={hostId} hostImg={hostImg} hostName={hostName} iFollowId={iFollowId} isFriendId={isFriendId} oppMuted={oppMuted} oppRemoteUid={oppRemoteUid} pk={pk} pkActive={pkActive} pkPanelH={pkPanelH} pkPanelTop={pkPanelTop} pkPanelW={pkPanelW} showPk={showPk} toggleOppMute={toggleOppMute} />

      {/* soft top/bottom scrims so the white text stays readable */}
      {!showPk && (
        <>
          <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0.5)", "rgba(0,0,0,0)"]} style={styles.topScrim} />
          <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]} style={styles.bottomScrim} />
        </>
      )}

      <GuestTiles currentUid={currentUid} followGuest={followGuest} followingIds={followingIds} guestCamOn={guestCamOn} guestFollowed={guestFollowed} guestList={guestList} guestMicOn={guestMicOn} guestPublishingRef={guestPublishingRef} hostId={hostId} hostMutedMe={hostMutedMe} insets={insets} isFollowing={isFollowing} isHost={isHost} myVerified={myVerified} myVerifiedColor={myVerifiedColor} onGuestTilePress={onGuestTilePress} remoteVideoOn={remoteVideoOn} showPk={showPk} />

      <TopHeader currentUid={currentUid} followBusy={followBusy} headerFive={headerFive} hostId={hostId} hostImg={hostImg} hostLevel={hostLevel} hostMicMuted={hostMicMuted} hostName={hostName} hostStars={hostStars} hostVerified={hostVerified} hostVerifiedColor={hostVerifiedColor} isFollowing={isFollowing} isHost={isHost} netQuality={netQuality} openHostCard={openHostCard} roomStartTime={roomStartTime} safeTop={safeTop} setExitModalVisible={setExitModalVisible} setProfileCard={setProfileCard} setViewerListVisible={setViewerListVisible} showPk={showPk} toggleFollowHost={toggleFollowHost} viewerCount={viewerCount} />

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
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={40}
        ListFooterComponent={
          <View style={styles.welcomeBox}>
            <Text style={styles.welcomeTxt}>{WELCOME_TEXT}</Text>
          </View>
        }
        style={chatListStyle}
        onLayout={(e) => setChatH(Math.round(e.nativeEvent.layout.height))}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        windowSize={5}
        removeClippedSubviews={false}
      />

      {/* ================= FLOATING HEARTS ================= */}
      <HeartsLayer ref={heartsRef} bottom={96 + keyboardHeight} />

      {/* ================= GIFT COMBO BUTTON (Tiki jaisa) ================= */}
      <ComboButton
        ref={comboRef}
        bottom={(Platform.OS === "android" ? insets.bottom + 8 : insets.bottom) + 8 + keyboardHeight}
        onTap={comboTap}
      />

      <BottomControls filterId={filterId} setFilterModalVisible={setFilterModalVisible} amGuest={amGuest} chatInputRef={chatInputRef} chatOpen={chatOpen} handleSendChat={handleSendChat} handleShare={handleShare} insets={insets} isHost={isHost} keyboardHeight={keyboardHeight} matchMini={matchMini} matchStartRef={matchStartRef} matching={matching} myReqPending={myReqPending} onPkButton={onPkButton} openChat={openChat} openGiftModal={openGiftModal} pendingRequests={pendingRequests} pkActive={pkActive} sendGuestRequest={sendGuestRequest} setEmojiOpen={setEmojiOpen} setGuestSheetVisible={setGuestSheetVisible} setMatchMini={setMatchMini} setMenuVisible={setMenuVisible} showInvite={showInvite} showPk={showPk} />


      {!chatOpen && keyboardHeight === 0 && (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push("/event" as any)}
        style={{ position: "absolute", right: 7, bottom: (Platform.OS === "android" ? insets.bottom + 8 : insets.bottom) + 62, width: 56, alignItems: "center", zIndex: 50, elevation: 50 }}
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

      {!!replyTo && chatOpen && (
        <View
          style={[
            styles.replyBar,
            { bottom: keyboardHeight + 58 + (Platform.OS === "android" ? insets.bottom + 8 : insets.bottom) + (emojiOpen ? 52 : 0) },
          ]}
        >
          <Ionicons name="arrow-undo" size={14} color="#F71084" />
          <Text numberOfLines={1} style={styles.replyBarTxt}>
            Replying to <Text style={{ fontWeight: "800" }}>{replyTo.name}</Text>: {replyTo.text}
          </Text>
          <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => setReplyTo(null)}>
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {emojiOpen && chatOpen && (
        <View
          style={[
            styles.emojiStrip,
            { bottom: keyboardHeight + 60 + (Platform.OS === "android" ? insets.bottom + 8 : insets.bottom) },
          ]}
        >
          {QUICK_EMOJIS.map((e) => (
            <TouchableOpacity key={e} onPress={() => chatInputRef.current?.append?.(e)}>
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
        comboTop={pkPanelTop + pkPanelH + 4} // PK ho ya na ho, hamesha PK panel ke niche se
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
          pillBottom={96 + keyboardHeight + chatH + 6}
        />
      )}

      <ExitModal confirmExit={confirmExit} exitModalVisible={exitModalVisible} isHost={isHost} setExitModalVisible={setExitModalVisible} />

      <GiftModal closeGiftModal={closeGiftModal} giftModalAnim={giftModalAnim} giftModalVisible={giftModalVisible} giftPageIdx={giftPageIdx} giftQty={giftQty} giftSelId={giftSelId} goRecharge={goRecharge} insets={insets} myTotalSpent={myTotalSpent} myWalletLevel={myWalletLevel} sendSelectedGift={sendSelectedGift} setGiftPageIdx={setGiftPageIdx} setGiftQty={setGiftQty} stableSelectGift={stableSelectGift} stars={stars} />

      <ViewerListModal askKick={askKick} audienceArray={audienceArray} audienceSorted={audienceSorted} canModerate={canModerate} chatLocked={chatLocked} deleteAllChats={deleteAllChats} hostId={hostId} hostImg={hostImg} hostName={hostName} isMod={isMod} mods={mods} mutedUsers={mutedUsers} openHostCard={openHostCard} setProfileCard={setProfileCard} setViewerListVisible={setViewerListVisible} toggleChatLock={toggleChatLock} viewerCount={viewerCount} viewerListVisible={viewerListVisible} />

      <RankModal rankVisible={rankVisible} rankedGifters={rankedGifters} setProfileCard={setProfileCard} setRankVisible={setRankVisible} stars={stars} />

      <ProfileCardModal canModerate={canModerate} currentUid={currentUid} goUserProfile={goUserProfile} hostId={hostId} insets={insets} isHost={isHost} kickBlock={kickBlock} kickDlg={kickDlg} kickUser={kickUser} manageOpen={manageOpen} mods={mods} muteGuest={muteGuest} muteUser={muteUser} mutedUsers={mutedUsers} openGiftModal={openGiftModal} params={params} pcInfo={pcInfo} profileCard={profileCard} profileFollowing={profileFollowing} removeGuest={removeGuest} roomData={roomData} router={router} setKickBlock={setKickBlock} setKickDlg={setKickDlg} setManageOpen={setManageOpen} setProfileCard={setProfileCard} setReportTarget={setReportTarget} toggleMod={toggleMod} toggleProfileFollow={toggleProfileFollow} />

      <ChatMenuModal canDeleteChat={canDeleteChat} chatMenu={chatMenu} currentUid={currentUid} deleteChatMsg={deleteChatMsg} insets={insets} openProfile={openProfile} setChatMenu={setChatMenu} setReportTarget={setReportTarget} startReply={startReply} />

      <ReportModal reportTarget={reportTarget} setReportTarget={setReportTarget} submitReport={submitReport} />

      <SettingsModal deleteAllChats={deleteAllChats} lockDraft={lockDraft} pinDraft={pinDraft} saveSettings={saveSettings} setLockDraft={setLockDraft} setPinDraft={setPinDraft} setSettingsVisible={setSettingsVisible} setTitleDraft={setTitleDraft} settingsVisible={settingsVisible} titleDraft={titleDraft} />

      <SummaryModal doLeaveNow={doLeaveNow} fmtDur={fmtDur} stars={stars} summary={summary} />

      <GuestsMenuModals acceptGuest={acceptGuest} guestList={guestList} guestSheetVisible={guestSheetVisible} menuItems={menuItems} menuVisible={menuVisible} onGuestTilePress={onGuestTilePress} pendingRequests={pendingRequests} rejectGuest={rejectGuest} setGuestSheetVisible={setGuestSheetVisible} setMenuVisible={setMenuVisible} />

      {/* ================= MUSIC SHEET (host) ================= */}
      {isHost && (
        <MusicSheet
          visible={musicSheetVisible}
          onClose={() => setMusicSheetVisible(false)}
          onReopen={() => setMusicSheetVisible(true)}
          music={music}
          micMuted={micMuted}
          onToggleMic={toggleMic}
        />
      )}

      <FilterModal applyFilter={applyFilter} filterId={filterId} filterModalVisible={filterModalVisible} insets={insets} setFilterModalVisible={setFilterModalVisible} />

      <PkSheetModal friendsList={friendsList} pkCandidates={pkCandidates} pkDuration={pkDuration} pkFriendRows={pkFriendRows} pkFriendsLive={pkFriendsLive} pkListVisible={pkListVisible} pkLoading={pkLoading} pkRecommended={pkRecommended} pkSettingsOpen={pkSettingsOpen} renderPkRow={renderPkRow} setPkDuration={setPkDuration} setPkListVisible={setPkListVisible} setPkSettingsOpen={setPkSettingsOpen} startRandomMatch={startRandomMatch} />

      <PkMatchingModal cancelMatching={cancelMatching} hostImg={hostImg} isHost={isHost} matchMini={matchMini} matchStartRef={matchStartRef} matching={matching} setMatchMini={setMatchMini} />

      <PkInviteModal acceptPkInvite={acceptPkInvite} declinePkInvite={declinePkInvite} pkBusy={pkBusy} pkInvite={pkInvite} showInvite={showInvite} />
      {/* Official / Admin: live ke andar hi search + ID/device ban + live band */}
      <OfficialLiveTools roomId={roomId} hostId={hostId} />

    </View>
    </LiveSwipeShell>
  );
}

// SPEED: tap karte hi page khulta dikhe, bhaari hissa 2 frame baad (components/DeferredScreen.tsx)
export default withDeferredMount(VideoLive);
