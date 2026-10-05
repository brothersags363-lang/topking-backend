// ============================================================================
// chat.tsx  -  1-to-1 chat screen
//
// Needs one new package:   npx expo install expo-clipboard
//
// Firestore rules must allow BOTH users to update these fields on a message:
//   read, reactions, deletedFor
// and the sender to update: text, edited, deletedForEveryone, mediaUrl,
//   thumbnail, replyTo
// ============================================================================
import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
  memo,
  forwardRef,
  useImperativeHandle,
} from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Keyboard,
  Alert,
  Modal,
  Pressable,
  Linking,
  ActivityIndicator,
  Animated,
  PanResponder,
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import * as Clipboard from "expo-clipboard";
import { VideoView, useVideoPlayer } from "expo-video";
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { auth, db } from "./firebaseConfig";

import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  setDoc,
  doc,
  getDoc,
  increment,
  deleteDoc,
  updateDoc,
  deleteField,
  arrayUnion,
  getDocs,
  runTransaction,
  writeBatch,
} from "firebase/firestore";

// ==========================================
// CONSTANTS
// ==========================================
const MAX_MEDIA_MB = 50;
const PAGE_SIZE = 40; // messages loaded at a time (older ones load on scroll up)
const SWIPE_TRIGGER = 60; // px to swipe right to reply
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const DEFAULT_AVATAR =
  "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

// ==========================================
// CHAT MESSAGE WITH CLICKABLE LINKS
// ==========================================
const ChatMessageText = ({ text, style, onLinkPress }: any) => {
  // http://, https:// aur www. links detect karega
  const parts = String(text || "").split(
    /(https?:\/\/[^\s]+|www\.[^\s]+)/gi
  );

  return (
    <Text style={style}>
      {parts.map((part, index) => {
        const isLink = /^(https?:\/\/|www\.)/i.test(part);

        if (!isLink) {
          return <Text key={index}>{part}</Text>;
        }

        return (
          <Text
            key={index}
            onPress={() => onLinkPress(part)}
            style={{
              color: "#4DA6FF",
              textDecorationLine: "underline",
            }}
          >
            {part}
          </Text>
        );
      })}
    </Text>
  );
};

// ==========================================
// TIME / DATE HELPERS
// ==========================================
const formatMessageTime = (createdAt: any) => {
  if (!createdAt?.toDate) return "";
  const d = createdAt.toDate();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
};

const formatDateLabel = (createdAt: any) => {
  if (!createdAt?.toDate) return "";
  const d = createdAt.toDate();
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();

  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";

  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatLastSeen = (ts: any) => {
  if (!ts?.toDate) return "";
  const label = formatDateLabel(ts);
  const time = formatMessageTime(ts);
  if (label === "Today") return `last seen today at ${time}`;
  if (label === "Yesterday") return `last seen yesterday at ${time}`;
  return `last seen ${label}`;
};

// one-line preview of any message (reply quote, reply bar, chat list)
const getMessagePreview = (m: any) => {
  if (!m) return "";
  if (m.deletedForEveryone) return "🚫 This message was deleted";
  if (m.type === "media") {
    return m.mediaType === "video" ? "🎥 Video" : "📷 Photo";
  }
  if (m.type === "video") return "🎬 Video";
  if (m.type === "liveInvite") return "🎙 Live Invite";
  return String(m.text || "");
};

const isTextMessage = (m: any) => !!m && (!m.type || m.type === "text");

// ================================
// LEVEL BADGE THEME
// ================================
const getLevelTheme = (level = 1) => {
  if (level >= 50) {
    return { bg: "#7B1FFF", border: "#FFD700", text: "#fff", icon: "#FFD700" };
  }
  if (level >= 40) {
    return { bg: "#00BFFF", border: "#9EF8FF", text: "#fff", icon: "#fff" };
  }
  if (level >= 30) {
    return { bg: "#FF0066", border: "#FFB6C1", text: "#fff", icon: "#fff" };
  }
  if (level >= 20) {
    return { bg: "#FFC107", border: "#FFE082", text: "#000", icon: "#fff" };
  }
  if (level >= 10) {
    return { bg: "#BDBDBD", border: "#fff", text: "#fff", icon: "#fff" };
  }
  return { bg: "#222", border: "#555", text: "#FFD700", icon: "#00E5FF" };
};

// ================================
// OPEN ANY LINK FROM CHAT
// ================================
const openChatLink = async (url: string) => {
  try {
    let cleanUrl = String(url).trim();

    // Agar http/https nahi hai to https add karo
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = `https://${cleanUrl}`;
    }

    const supported = await Linking.canOpenURL(cleanUrl);

    if (supported) {
      await Linking.openURL(cleanUrl);
    } else {
      Alert.alert(
        "Unable to open link",
        "This link cannot be opened on your device."
      );
    }
  } catch (error) {
    console.log("OPEN LINK ERROR =", error);
    Alert.alert(
      "Unable to open link",
      "Something went wrong while opening this link."
    );
  }
};

// Full-screen video player used by the media viewer (mounted only while open)
const ViewerVideo = ({ url }: any) => {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width: "100%", height: "80%" }}
      contentFit="contain"
      nativeControls
      allowsFullscreen
    />
  );
};

// ==========================================
// SWIPE RIGHT TO REPLY (like WhatsApp)
// ==========================================
const SwipeToReply = ({ children, onReply, enabled = true }: any) => {
  const translateX = useRef(new Animated.Value(0)).current;

  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const reset = () =>
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 6,
    }).start();

  const panResponder = useRef(
    PanResponder.create({
      // only grab clearly horizontal swipes to the right,
      // so normal vertical scrolling is never blocked
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        enabledRef.current &&
        g.dx > 12 &&
        Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderMove: (_e, g) => {
        translateX.setValue(Math.max(0, Math.min(g.dx, 80)));
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dx >= SWIPE_TRIGGER) onReplyRef.current?.();
        reset();
      },
      onPanResponderTerminate: () => reset(),
    })
  ).current;

  const iconOpacity = translateX.interpolate({
    inputRange: [0, SWIPE_TRIGGER],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  return (
    <View {...panResponder.panHandlers}>
      <Animated.View
        pointerEvents="none"
        style={[styles.swipeIcon, { opacity: iconOpacity }]}
      >
        <Ionicons name="arrow-undo" size={20} color="#fff" />
      </Animated.View>

      <Animated.View style={{ transform: [{ translateX }] }}>
        {children}
      </Animated.View>
    </View>
  );
};

// quoted message shown inside a reply bubble
const ReplyQuote = ({ reply, mine, myUid, otherName, onPress }: any) => (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={onPress}
    style={[
      styles.replyQuote,
      mine ? styles.replyQuoteMine : styles.replyQuoteOther,
    ]}
  >
    <Text style={styles.replyQuoteName} numberOfLines={1}>
      {reply?.senderId === myUid ? "You" : otherName}
    </Text>
    <Text style={styles.replyQuoteText} numberOfLines={2}>
      {getMessagePreview(reply)}
    </Text>
  </TouchableOpacity>
);

// emoji reactions pill under a bubble
const ReactionsPill = ({ reactions, mine, onPress }: any) => {
  const list = Object.values(reactions || {}).filter(Boolean) as string[];
  if (!list.length) return null;

  const unique = Array.from(new Set(list));

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.reactionPill,
        mine
          ? { alignSelf: "flex-end", marginRight: 8 }
          : { alignSelf: "flex-start", marginLeft: 8 },
      ]}
    >
      <Text style={styles.reactionPillEmoji}>{unique.join("")}</Text>
      {list.length > 1 && (
        <Text style={styles.reactionPillCount}>{list.length}</Text>
      )}
    </Pressable>
  );
};

const MenuRow = ({ icon, label, onPress, danger }: any) => (
  <TouchableOpacity style={styles.menuRow} onPress={onPress}>
    <Ionicons name={icon} size={20} color={danger ? "#ff5252" : "#fff"} />
    <Text style={[styles.menuRowText, danger && { color: "#ff5252" }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

// ==========================================
// SMALL SPEED HELPERS
// ==========================================
// cheap "which day is it" key (much faster than toLocaleDateString)
const dayKey = (ts: any) => {
  if (!ts?.toDate) return 0;
  const d = ts.toDate();
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
};

// true when nothing that is DRAWN has changed => the row is not re-rendered
const sameMessage = (a: any, b: any) =>
  a === b ||
  (!!a &&
    !!b &&
    a.id === b.id &&
    a.text === b.text &&
    a.read === b.read &&
    a.edited === b.edited &&
    a.pending === b.pending &&
    a.deletedForEveryone === b.deletedForEveryone &&
    a.mediaUrl === b.mediaUrl &&
    a.thumbnail === b.thumbnail &&
    (a.createdAt?.toMillis?.() ?? 0) === (b.createdAt?.toMillis?.() ?? 0) &&
    (a.replyTo?.id ?? null) === (b.replyTo?.id ?? null) &&
    JSON.stringify(a.reactions || null) === JSON.stringify(b.reactions || null));

// popup that appears with a soft scale + fade (premium feel)
const PopIn = ({ children, style }: any) => {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(v, {
      toValue: 1,
      useNativeDriver: true,
      speed: 22,
      bounciness: 5,
    }).start();
  }, [v]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

// ==========================================
// INPUT BAR - owns the text state, so typing never re-renders the chat list
// ==========================================
const ChatInput = memo(
  forwardRef(function ChatInput(
    { disabled, placeholder, onSend, onTextChange, onAttach }: any,
    ref: any
  ) {
    const [text, setText] = useState("");
    const inputRef = useRef<any>(null);
    const canSend = !disabled && text.trim().length > 0;

    // Bottom gap (for the nav bar) only when the keyboard is CLOSED.
    // When the keyboard opens the gap shrinks smoothly so the box sits
    // right on top of the keyboard.
    const CLOSED_GAP = 35;
    const OPEN_GAP = 0; // want a tiny space above the keyboard? use 6-8
    const bottomGap = useRef(new Animated.Value(CLOSED_GAP)).current;

    useEffect(() => {
      const isIOS = Platform.OS === "ios";
      const animateTo = (toValue: number, e?: any) => {
        bottomGap.stopAnimation();
        Animated.timing(bottomGap, {
          toValue,
          duration: isIOS ? e?.duration || 220 : 120,
          useNativeDriver: false, // margin cannot use the native driver
        }).start();
      };
      const show = Keyboard.addListener(
        isIOS ? "keyboardWillShow" : "keyboardDidShow",
        (e) => animateTo(OPEN_GAP, e)
      );
      const hide = Keyboard.addListener(
        isIOS ? "keyboardWillHide" : "keyboardDidHide",
        (e) => animateTo(CLOSED_GAP, e)
      );
      return () => {
        show.remove();
        hide.remove();
      };
    }, [bottomGap]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => inputRef.current?.focus(),
        // message failed to send => give the text back (never lose it)
        restore: (t: string) => setText((prev) => prev || t),
      }),
      []
    );

    const handleChange = useCallback(
      (t: string) => {
        setText(t);
        onTextChange(t);
      },
      [onTextChange]
    );

    const send = useCallback(() => {
      const t = text.trim();
      if (!t || disabled) return;
      // instant clear (real apps never wait for the network)
      if (onSend(t) !== false) setText("");
    }, [text, disabled, onSend]);

    return (
      <Animated.View style={[styles.bottomBar, { marginBottom: bottomGap }]}>
        <TouchableOpacity
          disabled={disabled}
          style={[styles.attachBtn, { opacity: disabled ? 0.5 : 1 }]}
          onPress={onAttach}
        >
          <Ionicons name="add" size={30} color="#fff" />
        </TouchableOpacity>

        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor="#ccc"
          editable={!disabled}
          style={styles.input}
          // Enter = new line (like WhatsApp); sending is done by the button
          multiline
        />

        <TouchableOpacity
          disabled={!canSend}
          style={[styles.sendBtn, { opacity: canSend ? 1 : 0.5 }]}
          onPress={send}
        >
          <Ionicons name="send" size={26} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    );
  })
);

// ==========================================
// ONE MESSAGE ROW (memo: only re-renders when ITS message changes)
// ==========================================
const MessageRow = memo(
  function MessageRow({
    item,
    showDateSeparator,
    highlighted,
    currentUid,
    username,
    profileImg,
    handlers,
  }: any) {
    const mine = item?.senderId === currentUid;
    const isDeleted = item.deletedForEveryone === true;
    const hasReactions =
      !!item.reactions && Object.values(item.reactions).some(Boolean);

    const onLongPress = () => handlers.openMenu(item);

    // ---------- the bubble itself ----------
    let content: any = null;

    if (isDeleted) {
      content = (
        <TouchableOpacity
          activeOpacity={0.9}
          delayLongPress={350}
          onLongPress={onLongPress}
          style={[
            styles.messageBox,
            mine ? styles.myMessage : styles.otherMessage,
            styles.deletedBubble,
          ]}
        >
          <Ionicons name="ban" size={14} color="#cfcfcf" />
          <Text style={styles.deletedText}>
            {mine ? "You deleted this message" : "This message was deleted"}
          </Text>
        </TouchableOpacity>
      );
    } else if (item.type === "liveInvite") {
      content = (
        <TouchableOpacity
          delayLongPress={350}
          onLongPress={onLongPress}
          style={[styles.liveInviteBox, highlighted && styles.highlight]}
          onPress={() => handlers.openLive(item.roomId)}
        >
          <Text style={styles.liveInviteTitle}>🎙 Live Invite</Text>
          <Text style={styles.liveInviteSub}>Join Live Room</Text>
        </TouchableOpacity>
      );
    } else if (item.type === "media") {
      const isVideoMsg = item.mediaType === "video";

      content = (
        <TouchableOpacity
          activeOpacity={0.9}
          delayLongPress={350}
          style={[styles.mediaBubble, highlighted && styles.highlight]}
          onPress={() =>
            handlers.openViewer({
              type: isVideoMsg ? "video" : "image",
              url: item.mediaUrl,
            })
          }
          onLongPress={onLongPress}
        >
          <Image
            source={{
              uri: isVideoMsg ? item.thumbnail || undefined : item.mediaUrl,
            }}
            style={styles.mediaImg}
            // decode at bubble size, not full photo size => smooth scrolling
            resizeMethod="resize"
          />

          {isVideoMsg && (
            <Ionicons
              name="play-circle"
              size={50}
              color="#fff"
              style={styles.mediaPlayIcon}
            />
          )}

          <View style={styles.mediaMeta}>
            <Text style={styles.mediaTime}>
              {formatMessageTime(item.createdAt)}
            </Text>
            {mine && (
              <Ionicons
                name={
                  item.pending
                    ? "time-outline"
                    : item.read
                    ? "checkmark-done"
                    : "checkmark"
                }
                size={14}
                color={item.read ? "#4DA6FF" : "#fff"}
                style={{ marginLeft: 4 }}
              />
            )}
          </View>
        </TouchableOpacity>
      );
    } else if (item.type === "video") {
      content = (
        <TouchableOpacity
          delayLongPress={350}
          onLongPress={onLongPress}
          style={highlighted && styles.highlight}
          onPress={() => handlers.openSharedVideo(item)}
        >
          <Image
            source={{ uri: item.thumbnail }}
            style={styles.videoThumbnail}
            resizeMethod="resize"
          />
          <Ionicons
            name="play-circle"
            size={50}
            color="#fff"
            style={styles.playIcon}
          />
        </TouchableOpacity>
      );
    } else {
      // plain text message
      content = (
        <TouchableOpacity
          activeOpacity={0.9}
          delayLongPress={350}
          onLongPress={onLongPress}
          style={[
            styles.messageBox,
            mine ? styles.myMessage : styles.otherMessage,
            highlighted && styles.highlight,
          ]}
        >
          {!!item.replyTo && (
            <ReplyQuote
              reply={item.replyTo}
              mine={mine}
              myUid={currentUid}
              otherName={username}
              onPress={() => handlers.scrollTo(item.replyTo.id)}
            />
          )}

          <ChatMessageText
            text={String(item?.text || "")}
            style={styles.messageText}
            onLinkPress={openChatLink}
          />

          <View style={styles.metaRow}>
            {item.edited && <Text style={styles.editedText}>edited</Text>}

            <Text style={styles.timeText}>
              {formatMessageTime(item.createdAt)}
            </Text>

            {mine && (
              <Ionicons
                name={
                  item.pending
                    ? "time-outline"
                    : item.read
                    ? "checkmark-done"
                    : "checkmark"
                }
                size={14}
                color={item.read ? "#4DA6FF" : "#dcdcdc"}
                style={{ marginLeft: 4 }}
              />
            )}
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <>
        {showDateSeparator && (
          <View style={styles.dateSeparatorWrap}>
            <Text style={styles.dateSeparatorText}>
              {formatDateLabel(item.createdAt)}
            </Text>
          </View>
        )}

        <SwipeToReply enabled={!isDeleted} onReply={() => handlers.reply(item)}>
          <View
            style={[
              styles.row,
              mine ? styles.myRow : styles.otherRow,
              hasReactions && { marginBottom: 12 },
            ]}
          >
            {!mine && (
              <Image
                source={{ uri: profileImg || DEFAULT_AVATAR }}
                style={styles.chatAvatar}
                resizeMethod="resize"
              />
            )}

            <View
              style={[
                styles.bubbleColumn,
                { alignItems: mine ? "flex-end" : "flex-start" },
              ]}
            >
              {content}

              {!isDeleted && (
                <ReactionsPill
                  reactions={item.reactions}
                  mine={mine}
                  onPress={() => handlers.openMenu(item)}
                />
              )}
            </View>
          </View>
        </SwipeToReply>
      </>
    );
  },
  (prev: any, next: any) =>
    sameMessage(prev.item, next.item) &&
    prev.showDateSeparator === next.showDateSeparator &&
    prev.highlighted === next.highlighted &&
    prev.currentUid === next.currentUid &&
    prev.username === next.username &&
    prev.profileImg === next.profileImg &&
    prev.handlers === next.handlers
);

const messageKey = (item: any) => String(item.id);

// ==========================================
// SCREEN
// ==========================================
export default function ChatScreen() {
  const router = useRouter();

  const params = useLocalSearchParams();

  const userId = Array.isArray(params.userId)
    ? params.userId[0]
    : params.userId || "";

  const username = Array.isArray(params.username)
    ? params.username[0]
    : params.username || "User";

  const profileImg = Array.isArray(params.profileImg)
    ? params.profileImg[0]
    : params.profileImg || "";

  // ---------- state ----------
  const [rawMessages, setRawMessages] = useState<any[]>([]);
  const [msgLimit, setMsgLimit] = useState(PAGE_SIZE);
  const [deletedAt, setDeletedAt] = useState<any>(null);

  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [editModal, setEditModal] = useState(false);
  const [editText, setEditText] = useState("");

  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [attachVisible, setAttachVisible] = useState(false);

  const [searchMode, setSearchMode] = useState(false);
  const [searchText, setSearchText] = useState("");

  const [userLevel, setUserLevel] = useState(1);
  const [verified, setVerified] = useState(false);
  const [verifiedColor, setVerifiedColor] = useState("white");
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherLastSeen, setOtherLastSeen] = useState<any>(null);
  const [otherTyping, setOtherTyping] = useState(false);

  const [headerMenuVisible, setHeaderMenuVisible] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedByOther, setBlockedByOther] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(true);

  // gallery uploads in progress (shown at the bottom of the chat with a % loader)
  const [uploads, setUploads] = useState<any[]>([]);
  // full-screen photo/video viewer: { type: "image" | "video", url }
  const [viewer, setViewer] = useState<any>(null);

  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [highlightId, setHighlightId] = useState<any>(null);
  const [toast, setToast] = useState("");

  // ---------- refs ----------
  const flatListRef = useRef<any>(null);
  const inputRef = useRef<any>(null);
  const typingTimeoutRef = useRef<any>(null);
  const isTypingRef = useRef(false);
  const myDataRef = useRef<any>(null);
  const atBottomRef = useRef(true);
  const topIdRef = useRef<any>(null);
  const toastTimerRef = useRef<any>(null);
  const messagesRef = useRef<any[]>([]);
  const prevMsgMapRef = useRef<Map<string, any>>(new Map());
  const loadingMoreRef = useRef(false);
  const readRequestedRef = useRef<Set<string>>(new Set());
  // always points at the newest functions => child components get STABLE callbacks
  const H = useRef<any>({});

  // NOTE: every hook below must run on every render, so the "not logged in"
  // early returns are placed AFTER all hooks.
  const currentUser = auth.currentUser;
  const currentUid = currentUser?.uid || "";

  const chatId =
    currentUid && userId
      ? currentUid < userId
        ? `${currentUid}_${userId}`
        : `${userId}_${currentUid}`
      : "";

  // ================================
  // MESSAGE REQUEST STATE  (document: chats/{chatId})
  //   status "pending"  = request sent, receiver has not accepted yet
  //   status "accepted" = normal chat (Friends tab)
  //   status "declined" = receiver declined
  //   no document       = old chat / never chatted => handled on first send
  // ================================
  const [chatMeta, setChatMeta] = useState<any>(undefined); // undefined = loading
  const [accepting, setAccepting] = useState(false);
  const deniedAtRef = useRef(0);
  const metaStatus = chatMeta?.status;
  const iAmRequester = chatMeta?.requesterId === currentUid;
  const iAmReceiverPending = metaStatus === "pending" && !iAmRequester;
  const iAmRequesterPending = metaStatus === "pending" && iAmRequester;
  const isDeclined = metaStatus === "declined";
  const requesterLocked = iAmRequesterPending && chatMeta?.firstMessageSent === true;
  // which chat-list folder holds this chat for ME / for THE OTHER PERSON
  const myColRef = useRef("friends");
  const theirColRef = useRef("friends");
  myColRef.current = iAmReceiverPending ? "requests" : "friends";
  theirColRef.current = iAmRequesterPending ? "requests" : "friends";

  // ================================
  // LOAD OTHER USER INFO (wallet level + my own profile, once)
  // ================================
  useEffect(() => {
    if (!currentUid || !userId) return;

    const loadUser = async () => {
      try {
        const walletSnap = await getDoc(doc(db, "wallets", userId));
        if (walletSnap.exists()) {
          setUserLevel(walletSnap.data().level || 1);
        }
      } catch (e) {
        console.log("WALLET LOAD ERROR =", e);
      }

      try {
        const mySnap = await getDoc(doc(db, "users", currentUid));
        myDataRef.current = mySnap.data() || null;
      } catch (e) {
        console.log("MY USER LOAD ERROR =", e);
      }
    };

    loadUser();
  }, [currentUid, userId]);

  // other user: verified badge + online / last seen (live)
  useEffect(() => {
    if (!userId) return;

    return onSnapshot(
      doc(db, "users", userId),
      (snap) => {
        if (!snap.exists()) return;
        const d: any = snap.data();
        setVerified(d.verified === true);
        setVerifiedColor(d.verifiedColor || "white");
        setOtherOnline(d.online === true);
        setOtherLastSeen(d.lastSeen || null);
      },
      () => {}
    );
  }, [userId]);

  // request status (live)
  useEffect(() => {
    if (!chatId) return;
    setChatMeta(undefined);
    return onSnapshot(
      doc(db, "chats", chatId),
      (snap) => setChatMeta(snap.exists() ? snap.data() : null),
      () => setChatMeta(null)
    );
  }, [chatId]);

  // block status (live, both directions)
  useEffect(() => {
    if (!currentUid || !userId) return;

    const u1 = onSnapshot(
      doc(db, "blockedUsers", currentUid, "users", userId),
      (s) => setIsBlocked(s.exists()),
      () => {}
    );
    const u2 = onSnapshot(
      doc(db, "blockedUsers", userId, "users", currentUid),
      (s) => setBlockedByOther(s.exists()),
      () => {}
    );

    return () => {
      u1();
      u2();
    };
  }, [currentUid, userId]);

  // "clear chat" marker - messages older than this are hidden for me
  useEffect(() => {
    if (!currentUid || !userId) return;

    return onSnapshot(
      doc(db, "deletedChats", currentUid, "users", userId),
      (snap) => {
        const data: any = snap.exists()
          ? snap.data({ serverTimestamps: "estimate" })
          : null;
        setDeletedAt(data?.deletedAt || null);
      },
      () => {}
    );
  }, [currentUid, userId]);

  // ================================
  // MESSAGES (live, paginated - only the latest `msgLimit` are loaded)
  // ================================
  useEffect(() => {
    if (!chatId || !currentUid) return;

    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "desc"),
      limit(msgLimit)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Re-use the old object for every message that did not change, so the
      // memoized rows skip re-rendering (a new message = 1 row, not 40).
      const prevById = prevMsgMapRef.current;
      const nextById = new Map<string, any>();

      const list = snapshot.docs.map((d) => {
        const fresh: any = {
          id: d.id,
          // "estimate" => a message that is still sending already has a time
          ...d.data({ serverTimestamps: "estimate" }),
          pending: d.metadata.hasPendingWrites,
        };
        const old = prevById.get(d.id);
        const item = old && sameMessage(old, fresh) ? old : fresh;
        nextById.set(d.id, item);
        return item;
      });

      prevMsgMapRef.current = nextById;
      setRawMessages(list);
      setLoadingMessages(false);
      loadingMoreRef.current = false;

      // Mark incoming messages as read (blue ticks on the sender's side)
      let markedAny = false;
      snapshot.docs.forEach((d) => {
        if (d.metadata.hasPendingWrites) return;
        const data: any = d.data();
        if (
          data.senderId === userId &&
          data.read !== true &&
          !readRequestedRef.current.has(d.id)
        ) {
          readRequestedRef.current.add(d.id);
          markedAny = true;
          updateDoc(doc(db, "chats", chatId, "messages", d.id), {
            read: true,
          }).catch(() => readRequestedRef.current.delete(d.id));
        }
      });

      // I am looking at the chat right now => it must not show as "unread"
      // in the chat list (the sender increments unreadCount on every message)
      if (markedAny) {
        updateDoc(
          doc(db, "userChats", currentUid, myColRef.current, userId),
          { hasNewMessage: false, unreadCount: 0 }
        ).catch(() => {});
      }
    });

    return unsubscribe;
  }, [chatId, currentUid, userId, msgLimit]);

  // what is actually shown (clear-chat, delete-for-me and search applied)
  const messages = useMemo(() => {
    let list = rawMessages;

    if (deletedAt?.toMillis) {
      const ms = deletedAt.toMillis();
      list = list.filter(
        (m) => m.createdAt?.toMillis && m.createdAt.toMillis() > ms
      );
    }

    list = list.filter(
      (m) => !(Array.isArray(m.deletedFor) && m.deletedFor.includes(currentUid))
    );

    const q = searchText.trim().toLowerCase();
    if (searchMode && q) {
      list = list.filter(
        (m) =>
          !m.deletedForEveryone &&
          isTextMessage(m) &&
          String(m.text || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [rawMessages, deletedAt, currentUid, searchMode, searchText]);

  // latest list for renderItem (read through a ref => renderItem stays stable)
  messagesRef.current = messages;

  // are there older messages left to load?
  const hasMore = useMemo(() => {
    if (rawMessages.length < msgLimit) return false;
    if (deletedAt?.toMillis) {
      const oldest = rawMessages[rawMessages.length - 1];
      if (
        oldest?.createdAt?.toMillis &&
        oldest.createdAt.toMillis() <= deletedAt.toMillis()
      ) {
        return false;
      }
    }
    return true;
  }, [rawMessages, msgLimit, deletedAt]);

  // new incoming message while scrolled up => badge on the scroll-down button
  useEffect(() => {
    const top = messages[0];
    if (!top) return;

    if (
      topIdRef.current &&
      topIdRef.current !== top.id &&
      top.senderId !== currentUid &&
      !atBottomRef.current &&
      !searchMode
    ) {
      setNewCount((c) => c + 1);
    }

    topIdRef.current = top.id;
  }, [messages, currentUid, searchMode]);

  // opening the chat clears the unread badge in the chat list
  useEffect(() => {
    if (!currentUid || !userId) return;

    if (chatMeta === undefined) return; // wait until we know the folder
    updateDoc(
      doc(db, "userChats", currentUid, myColRef.current, userId),
      { hasNewMessage: false, unreadCount: 0 }
    ).catch(() => {});
  }, [currentUid, userId, chatMeta === undefined, metaStatus, chatMeta?.requesterId]);

  // ================================
  // TYPING INDICATOR
  // ================================
  useEffect(() => {
    if (!chatId || !userId) return;

    return onSnapshot(
      doc(db, "chats", chatId, "typing", userId),
      (snap) => {
        setOtherTyping(snap.exists() && snap.data().isTyping === true);
      },
      () => {}
    );
  }, [chatId, userId]);

  const stopTyping = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (!chatId || !currentUid) return;
    if (!isTypingRef.current) return;

    isTypingRef.current = false;
    setDoc(
      doc(db, "chats", chatId, "typing", currentUid),
      { isTyping: false },
      { merge: true }
    ).catch(() => {});
  };

  const handleTyping = (text: string) => {
    if (!chatId || !currentUid) return;

    if (text.length === 0) {
      stopTyping();
      return;
    }

    // only write when we START typing (not on every keystroke)
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      setDoc(
        doc(db, "chats", chatId, "typing", currentUid),
        { isTyping: true, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(() => {});
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTyping, 2000);
  };

  // leaving the screen => stop typing + clear timers
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (chatId && currentUid) {
        setDoc(
          doc(db, "chats", chatId, "typing", currentUid),
          { isTyping: false },
          { merge: true }
        ).catch(() => {});
      }
    };
  }, [chatId, currentUid]);


  // ================================
  // SMALL HELPERS
  // ================================
  const showToast = (t: string) => {
    setToast(t);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 1600);
  };

  const getMyData = async () => {
    if (myDataRef.current) return myDataRef.current;
    try {
      const snap = await getDoc(doc(db, "users", currentUid));
      myDataRef.current = snap.data() || null;
    } catch (e) {
      console.log(e);
    }
    return myDataRef.current;
  };

  // ---------- MESSAGE REQUEST HELPERS ----------
  const explainDenied = (reason?: string) => {
    // several media files can be denied at once => show the alert only once
    const now = Date.now();
    if (now - deniedAtRef.current < 1500) return;
    deniedAtRef.current = now;
    if (reason === "mustAccept") {
      Alert.alert("Accept request first", `Accept ${username}'s message request to reply.`);
    } else if (reason === "declined") {
      Alert.alert("Request declined", "This message request was declined.");
    } else {
      Alert.alert(
        "Request sent",
        `You can send more messages after ${username} accepts your request.`
      );
    }
  };

  // quick check from live state (no network) - true = sending NOT allowed
  const requestGuard = () => {
    if (iAmReceiverPending) { explainDenied("mustAccept"); return true; }
    if (isDeclined) { explainDenied("declined"); return true; }
    if (requesterLocked) { explainDenied("waiting"); return true; }
    return false;
  };

  // Server-side-safe check + claim. Runs in ONE transaction, so double taps /
  // two devices can never get a second message through while pending.
  //  - mutual follow, or an old chat that already has messages => accepted
  //  - otherwise => pending request, and the single allowed message is claimed
  const claimSendAccess = async (): Promise<{ ok: boolean; reason?: string; first?: boolean }> => {
    const metaRef = doc(db, "chats", chatId);

    let autoAccept = false;
    const pre = await getDoc(metaRef);
    if (!pre.exists()) {
      const [a, b, old] = await Promise.all([
        getDoc(doc(db, "follows", `${currentUid}_${userId}`)),
        getDoc(doc(db, "follows", `${userId}_${currentUid}`)),
        getDocs(query(collection(db, "chats", chatId, "messages"), limit(1))),
      ]);
      autoAccept = (a.exists() && b.exists()) || !old.empty;
    }

    return runTransaction(db, async (tx) => {
      const snap = await tx.get(metaRef);
      const m: any = snap.exists() ? snap.data() : null;
      const base = { participants: [currentUid, userId] };

      if (m?.status === "accepted") return { ok: true };
      if (m?.status === "declined") return { ok: false, reason: "declined" };
      if (m?.status === "pending") {
        if (m.requesterId !== currentUid) return { ok: false, reason: "mustAccept" };
        if (m.firstMessageSent) return { ok: false, reason: "waiting" };
        tx.update(metaRef, { firstMessageSent: true });
        return { ok: true, first: true };
      }
      if (autoAccept) {
        tx.set(metaRef, { ...base, status: "accepted", createdAt: serverTimestamp() });
        return { ok: true };
      }
      tx.set(metaRef, {
        ...base,
        status: "pending",
        requesterId: currentUid,
        receiverId: userId,
        firstMessageSent: true,
        createdAt: serverTimestamp(),
      });
      return { ok: true, first: true };
    }) as any;
  };

  // sending failed after the single request message was claimed => give it back
  const releaseFirstClaim = () =>
    updateDoc(doc(db, "chats", chatId), { firstMessageSent: false }).catch(() => {});

  const acceptRequest = async () => {
    if (accepting || !currentUid || !userId) return;
    setAccepting(true);
    try {
      const reqRef = doc(db, "userChats", currentUid, "requests", userId);
      const reqSnap = await getDoc(reqRef);
      const r: any = reqSnap.exists() ? reqSnap.data() : {};

      const batch = writeBatch(db);
      batch.update(doc(db, "chats", chatId), {
        status: "accepted",
        acceptedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, "userChats", currentUid, "friends", userId),
        {
          userId,
          username: r.username || username,
          profileImg: r.profileImg || profileImg,
          lastMessage: r.lastMessage || "",
          updatedAt: serverTimestamp(),
          unreadCount: 0,
          hasNewMessage: false,
        },
        { merge: true }
      );
      batch.delete(reqRef);
      await batch.commit(); // all 3 changes together => chat moves Requests -> Friends
    } catch (e) {
      console.log("ACCEPT ERROR =", e);
      Alert.alert("Error", "Could not accept the request. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  const declineRequest = () => {
    Alert.alert("Decline request?", `${username} will not be able to message you.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: async () => {
          try {
            const batch = writeBatch(db);
            batch.update(doc(db, "chats", chatId), {
              status: "declined",
              declinedAt: serverTimestamp(),
            });
            batch.delete(doc(db, "userChats", currentUid, "requests", userId));
            await batch.commit();
            router.back();
          } catch (e) {
            console.log("DECLINE ERROR =", e);
            Alert.alert("Error", "Could not decline. Please try again.");
          }
        },
      },
    ]);
  };

  // returns true (and tells the user) if sending is not allowed
  const guardBlocked = () => {
    if (isBlocked) {
      Alert.alert("Blocked", "Please unblock this user first.");
      return true;
    }
    if (blockedByOther) {
      Alert.alert("Blocked", "This user has blocked you.");
      return true;
    }
    return false;
  };

  // keep the chat-list preview in sync after edit / delete of the last message
  const syncLastMessage = (text: string) => {
    if (!currentUid || !userId) return;
    setDoc(
      doc(db, "userChats", currentUid, myColRef.current, userId),
      { lastMessage: text },
      { merge: true }
    ).catch(() => {});
    setDoc(
      doc(db, "userChats", userId, theirColRef.current, currentUid),
      { lastMessage: text },
      { merge: true }
    ).catch(() => {});
  };

  const scrollToBottom = () => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    setNewCount(0);
  };

  // ================================
  // SEND TEXT MESSAGE
  // ================================
  const sendMessage = (text: string) => {
    if (guardBlocked() || requestGuard()) return false;

    const outgoingText = String(text || "").trim();
    if (!outgoingText) return false;

    const reply = replyingTo;

    // UI first - the input is already cleared by <ChatInput/>
    setReplyingTo(null);
    stopTyping();
    requestAnimationFrame(() =>
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true })
    );

    let firstClaimed = false;
    (async () => {
      try {
        // accepted chat = fast path (no network check). Otherwise claim access.
        const claim =
          chatMeta?.status === "accepted"
            ? { ok: true, first: false, reason: "" }
            : await claimSendAccess();
        if (!claim.ok) {
          explainDenied(claim.reason);
          inputRef.current?.restore(outgoingText);
          setReplyingTo((prev: any) => prev || reply);
          return;
        }
        firstClaimed = !!claim.first;
        const theirColNow = claim.first ? "requests" : "friends";

        const payload: any = {
          text: outgoingText,
          senderId: currentUid,
          receiverId: userId,
          read: false,
          createdAt: serverTimestamp(),
        };
        if (reply) payload.replyTo = reply;

        // All writes start at the SAME time (they used to wait for each other)
        const msgWrite = addDoc(collection(db, "chats", chatId, "messages"), payload);

        const myListWrite = setDoc(
          doc(db, "userChats", currentUid, "friends", userId),
          {
            userId,
            username,
            profileImg,
            lastMessage: outgoingText,
            updatedAt: serverTimestamp(),
            unreadCount: 0,
          },
          { merge: true }
        );

        const theirListWrite = (async () => {
          const myData = await getMyData();
          await setDoc(
            doc(db, "userChats", userId, theirColNow, currentUid),
            {
              userId: currentUid,
              username: myData?.username || currentUser?.displayName || "User",
              profileImg: myData?.profileImg || currentUser?.photoURL || "",
              lastMessage: outgoingText,
              hasNewMessage: true,
              unreadCount: increment(1),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          return myData;
        })();

        const [, , myData] = await Promise.all([
          msgWrite,
          myListWrite,
          theirListWrite,
        ]);

        // Best-effort push notification - failure here shouldn't matter
        fetch("https://topking-backend.onrender.com/send-message-notification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receiverUid: userId,
            senderUid: currentUid,
            senderName: myData?.username || currentUser?.displayName || "User",
            message: outgoingText,
          }),
        }).catch((e) => console.log(e));
      } catch (err) {
        console.log("SEND ERROR =", err);
        if (firstClaimed) releaseFirstClaim();
        // Message failed - give the text back so the user doesn't lose it
        inputRef.current?.restore(outgoingText);
        setReplyingTo((prev: any) => prev || reply);
        Alert.alert(
          "Message not sent",
          "Please check your connection and try again."
        );
      }
    })();

    return true;
  };

  // ================================
  // MESSAGE POPUP (long press) - tap anywhere outside = close
  // ================================
  const openMessageMenu = (item: any) => {
    Keyboard.dismiss();
    setSelectedMessage(item);
    setMenuVisible(true);
  };

  const closeMenu = () => {
    setMenuVisible(false);
    setSelectedMessage(null);
  };

  const closeEdit = () => {
    Keyboard.dismiss();
    setEditModal(false);
    setSelectedMessage(null);
    setEditText("");
  };

  // ---------- reply ----------
  const startReply = (msg: any) => {
    if (!msg || msg.deletedForEveryone) return;

    setReplyingTo({
      id: msg.id,
      senderId: msg.senderId,
      text: String(msg.text || "").slice(0, 200),
      type: msg.type || "text",
      mediaType: msg.mediaType || null,
    });

    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const replyFromMenu = () => {
    const target = selectedMessage;
    closeMenu();
    startReply(target);
  };

  // ---------- copy ----------
  const copyMessage = async () => {
    const text = selectedMessage?.text;
    closeMenu();
    if (!text) return;
    try {
      await Clipboard.setStringAsync(String(text));
      showToast("Copied");
    } catch (e) {
      console.log(e);
    }
  };

  // ---------- react ----------
  const reactToMessage = (emoji: string) => {
    const target = selectedMessage;
    closeMenu();
    if (!target?.id || !chatId) return;

    const mineNow = target.reactions?.[currentUid];

    updateDoc(doc(db, "chats", chatId, "messages", target.id), {
      // tapping the same emoji again removes the reaction
      [`reactions.${currentUid}`]: mineNow === emoji ? deleteField() : emoji,
    }).catch((e) => console.log("REACT ERROR =", e));
  };

  // ---------- edit ----------
  const openEdit = () => {
    if (!selectedMessage) return;
    setEditText(selectedMessage.text || "");
    setMenuVisible(false); // keep selectedMessage for the edit modal
    setEditModal(true);
  };

  const updateMessage = async () => {
    const target = selectedMessage;
    const newText = editText.trim();

    closeEdit();

    if (!target?.id || !newText) return;
    if (newText === (target.text || "")) return; // nothing changed

    try {
      await updateDoc(doc(db, "chats", chatId, "messages", target.id), {
        text: newText,
        edited: true,
      });

      if (rawMessages[0]?.id === target.id) syncLastMessage(newText);
    } catch (e) {
      console.log(e);
    }
  };

  // ---------- delete ----------
  const deleteForMe = async (target: any) => {
    try {
      await updateDoc(doc(db, "chats", chatId, "messages", target.id), {
        deletedFor: arrayUnion(currentUid),
      });
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "Could not delete this message.");
    }
  };

  const deleteForEveryone = async (target: any) => {
    try {
      await updateDoc(doc(db, "chats", chatId, "messages", target.id), {
        deletedForEveryone: true,
        text: "",
        mediaUrl: "",
        thumbnail: "",
        replyTo: deleteField(),
        reactions: deleteField(),
        edited: deleteField(),
      });

      // best-effort: also remove the uploaded photo/video file
      if (target.type === "media") {
        [target.mediaUrl, target.thumbnail].forEach((u) => {
          if (!u) return;
          deleteObject(storageRef(getStorage(), u)).catch(() => {});
        });
      }

      if (rawMessages[0]?.id === target.id) {
        syncLastMessage("🚫 This message was deleted");
      }
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "Could not delete this message.");
    }
  };

  const askDelete = () => {
    const target = selectedMessage;
    closeMenu(); // popup closes first, then the choice dialog appears

    if (!target?.id) return;

    const mine = target.senderId === currentUid;

    const buttons: any[] = [
      { text: "Delete for me", onPress: () => deleteForMe(target) },
    ];

    if (mine && !target.deletedForEveryone) {
      buttons.push({
        text: "Delete for everyone",
        style: "destructive",
        onPress: () => deleteForEveryone(target),
      });
    }

    buttons.push({ text: "Cancel", style: "cancel" });

    Alert.alert("Delete message?", undefined, buttons);
  };

  // ================================
  // SEND PHOTO / VIDEO (gallery or camera)
  // ================================
  const uploadFile = (
    uri: string,
    path: string,
    contentType: string,
    onProgress?: (p: number) => void
  ) =>
    new Promise<string>(async (resolve, reject) => {
      try {
        const blob = await (await fetch(uri)).blob();
        const task = uploadBytesResumable(storageRef(getStorage(), path), blob, {
          contentType,
        });
        task.on(
          "state_changed",
          (snap) => {
            if (onProgress && snap.totalBytes) {
              onProgress(snap.bytesTransferred / snap.totalBytes);
            }
          },
          reject,
          async () => {
            try {
              resolve(await getDownloadURL(task.snapshot.ref));
            } catch (e) {
              reject(e);
            }
          }
        );
      } catch (e) {
        reject(e);
      }
    });

  const sendOneMedia = async (asset: any) => {
    const isVideo = asset.type === "video";
    const localId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    setUploads((prev) => [
      { id: localId, asset, isVideo, progress: 0, failed: false },
      ...prev,
    ]);

    let lastShown = 0;
    const setProgress = (p: number) => {
      // progress ticks arrive very fast - only redraw when the % moved by 2
      if (p < 1 && p - lastShown < 0.02) return;
      lastShown = p;
      setUploads((prev) =>
        prev.map((u) => (u.id === localId ? { ...u, progress: p } : u))
      );
    };

    let firstClaimed = false;
    try {
      const claim =
        chatMeta?.status === "accepted"
          ? { ok: true, first: false, reason: "" }
          : await claimSendAccess();
      if (!claim.ok) {
        setUploads((prev) => prev.filter((u) => u.id !== localId));
        explainDenied(claim.reason);
        return;
      }
      firstClaimed = !!claim.first;
      const theirColNow = claim.first ? "requests" : "friends";

      const extFromUri = (asset.uri.split(".").pop() || "")
        .split("?")[0]
        .toLowerCase();
      const ext =
        extFromUri && extFromUri.length <= 5
          ? extFromUri
          : isVideo
          ? "mp4"
          : "jpg";
      const contentType =
        asset.mimeType ||
        (isVideo ? `video/${ext}` : `image/${ext === "jpg" ? "jpeg" : ext}`);
      const base = `chatMedia/${chatId}/${currentUid}_${localId}`;

      // video thumbnail and the file itself upload at the SAME time
      const thumbPromise: Promise<string> = isVideo
        ? (async () => {
            try {
              const t = await VideoThumbnails.getThumbnailAsync(asset.uri, {
                time: 500,
              });
              return await uploadFile(t.uri, `${base}_thumb.jpg`, "image/jpeg");
            } catch (e) {
              console.log("THUMB ERROR =", e);
              return "";
            }
          })()
        : Promise.resolve("");

      const [thumbUrl, mediaUrl] = await Promise.all([
        thumbPromise,
        uploadFile(asset.uri, `${base}.${ext}`, contentType, setProgress),
      ]);

      await addDoc(collection(db, "chats", chatId, "messages"), {
        type: "media",
        mediaType: isVideo ? "video" : "image",
        mediaUrl,
        thumbnail: thumbUrl,
        width: asset.width || 0,
        height: asset.height || 0,
        senderId: currentUid,
        receiverId: userId,
        read: false,
        createdAt: serverTimestamp(),
      });

      // chat list preview + push notification (same as text messages)
      const label = isVideo ? "🎥 Video" : "📷 Photo";
      const myData = await getMyData();

      await Promise.all([
        setDoc(
          doc(db, "userChats", currentUid, "friends", userId),
          {
            userId,
            username,
            profileImg,
            lastMessage: label,
            updatedAt: serverTimestamp(),
            unreadCount: 0,
          },
          { merge: true }
        ),
        setDoc(
          doc(db, "userChats", userId, theirColNow, currentUid),
          {
            userId: currentUid,
            username: myData?.username || currentUser?.displayName || "User",
            profileImg: myData?.profileImg || currentUser?.photoURL || "",
            lastMessage: label,
            hasNewMessage: true,
            unreadCount: increment(1),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ),
      ]);

      fetch("https://topking-backend.onrender.com/send-message-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverUid: userId,
          senderUid: currentUid,
          senderName: myData?.username || currentUser?.displayName || "User",
          message: label,
        }),
      }).catch(() => {});

      setUploads((prev) => prev.filter((u) => u.id !== localId));
    } catch (err) {
      console.log("MEDIA SEND ERROR =", err);
      if (firstClaimed) releaseFirstClaim();
      setUploads((prev) =>
        prev.map((u) => (u.id === localId ? { ...u, failed: true } : u))
      );
    }
  };

  const pickAndSendMedia = async () => {
    setAttachVisible(false);
    if (guardBlocked() || requestGuard()) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: true,
        selectionLimit: 5,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      result.assets.forEach((asset) => {
        if (asset.fileSize && asset.fileSize > MAX_MEDIA_MB * 1024 * 1024) {
          Alert.alert(
            "File too large",
            `Please choose a file smaller than ${MAX_MEDIA_MB} MB.`
          );
          return;
        }
        sendOneMedia(asset);
      });
    } catch (e) {
      console.log("PICK MEDIA ERROR =", e);
      Alert.alert("Error", "Could not open gallery.");
    }
  };

  const takeAndSendMedia = async () => {
    setAttachVisible(false);
    if (guardBlocked() || requestGuard()) return;

    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow camera access in your phone settings."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.8,
        videoMaxDuration: 60,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_MEDIA_MB * 1024 * 1024) {
        Alert.alert(
          "File too large",
          `Please choose a file smaller than ${MAX_MEDIA_MB} MB.`
        );
        return;
      }
      sendOneMedia(asset);
    } catch (e) {
      console.log("CAMERA ERROR =", e);
      Alert.alert("Error", "Could not open camera.");
    }
  };

  // pending uploads shown at the bottom of the (inverted) list
  const renderUploads = () =>
    uploads.length === 0 ? null : (
      <View>
        {uploads.map((u) => (
          <View key={u.id} style={[styles.row, styles.myRow]}>
            <TouchableOpacity
              activeOpacity={u.failed ? 0.7 : 1}
              onPress={() => {
                if (!u.failed) return;
                setUploads((prev) => prev.filter((x) => x.id !== u.id));
                sendOneMedia(u.asset); // retry
              }}
              style={styles.mediaBubble}
            >
              <Image source={{ uri: u.asset.uri }} style={styles.mediaImg} />
              <View style={styles.mediaUploadOverlay}>
                {u.failed ? (
                  <>
                    <Ionicons name="refresh" size={30} color="#fff" />
                    <Text style={styles.mediaUploadText}>Tap to retry</Text>
                  </>
                ) : (
                  <>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.mediaUploadText}>
                      {Math.round(u.progress * 100)}%
                    </Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );

  // ================================
  // BLOCK / UNBLOCK / CLEAR CHAT / SEARCH
  // ================================
  const blockUser = () => {
    setHeaderMenuVisible(false);

    Alert.alert("Block User", `Do you want to block ${username}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          try {
            await setDoc(
              doc(db, "blockedUsers", currentUid, "users", userId),
              {
                userId,
                username,
                profileImg,
                blockedAt: serverTimestamp(),
              }
            );
            setIsBlocked(true);
            showToast("User blocked");
          } catch (e) {
            console.log(e);
            Alert.alert("Error", "Could not block this user.");
          }
        },
      },
    ]);
  };

  const unblockUser = async () => {
    setHeaderMenuVisible(false);

    try {
      await deleteDoc(doc(db, "blockedUsers", currentUid, "users", userId));
      setIsBlocked(false);
      showToast("User unblocked");
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "Could not unblock this user.");
    }
  };

  const clearChat = () => {
    setHeaderMenuVisible(false);

    Alert.alert(
      "Clear chat?",
      "All messages will be removed from your side. The other person will still see them.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await setDoc(
                doc(db, "deletedChats", currentUid, "users", userId),
                { deletedAt: serverTimestamp() },
                { merge: true }
              );
              setDoc(
                doc(db, "userChats", currentUid, myColRef.current, userId),
                { lastMessage: "" },
                { merge: true }
              ).catch(() => {});
              showToast("Chat cleared");
            } catch (e) {
              console.log(e);
              Alert.alert("Error", "Could not clear the chat.");
            }
          },
        },
      ]
    );
  };

  const openSearch = () => {
    setHeaderMenuVisible(false);
    setSearchText("");
    setSearchMode(true);
  };

  const closeSearch = () => {
    Keyboard.dismiss();
    setSearchMode(false);
    setSearchText("");
  };

  // ================================
  // SCROLL HELPERS
  // ================================
  const handleScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const away = y > 250; // inverted list: offset 0 = newest message

    atBottomRef.current = !away;
    setShowScrollBtn((prev) => (prev === away ? prev : away));
    if (!away) setNewCount(0);
  };

  const scrollToMessage = (id: string) => {
    const idx = messages.findIndex((m) => m.id === id);

    if (idx < 0) {
      Alert.alert(
        "Message not found",
        "This message is too old or was deleted."
      );
      return;
    }

    flatListRef.current?.scrollToIndex({
      index: idx,
      animated: true,
      viewPosition: 0.5,
    });

    setHighlightId(id);
    setTimeout(() => setHighlightId(null), 1500);
  };

  // ================================
  // RENDER ONE MESSAGE
  // Rows are memoized + handlers are stable, so typing, keyboard, toasts and
  // popups never re-render the whole list (this was the main lag source).
  // ================================
  H.current = {
    openMessageMenu,
    startReply,
    scrollToMessage,
    setViewer,
    sendMessage,
    handleTyping,
    router,
    userId,
    openAttach: () => {
      Keyboard.dismiss();
      setAttachVisible(true);
    },
  };

  const stableSend = useCallback((t: string) => H.current.sendMessage(t), []);
  const stableTyping = useCallback((t: string) => H.current.handleTyping(t), []);
  const stableAttach = useCallback(() => H.current.openAttach(), []);

  const rowHandlers = useMemo(
    () => ({
      openMenu: (it: any) => H.current.openMessageMenu(it),
      reply: (it: any) => H.current.startReply(it),
      scrollTo: (id: string) => H.current.scrollToMessage(id),
      openViewer: (v: any) => H.current.setViewer(v),
      openLive: (roomId: any) =>
        H.current.router.push({ pathname: "/LiveRoom", params: { id: roomId } }),
      openSharedVideo: (item: any) => {
        const videoArray = [
          {
            id: item.videoId,
            videoUrl: item.videoUrl || item.video,
            video: item.video,
            thumbnail: item.thumbnail,
            profile: item.profile,
            username: item.username,
            caption: item.caption,
            userId: item.userId,
            likes: item.likes || 0,
            commentsCount: item.commentsCount || 0,
            shares: item.shares || 0,
            views: item.views || 0,
          },
        ];

        H.current.router.push({
          pathname: "/allvideo",
          params: {
            videos: JSON.stringify(videoArray),
            index: 0,
            userId: H.current.userId,
            from: "chat",
          },
        });
      },
    }),
    []
  );

  const renderItem = useCallback(
    ({ item, index }: any) => {
      // messages are ordered newest -> oldest; the "next" array entry is
      // actually the older neighbour because the list is rendered inverted.
      const older = messagesRef.current[index + 1];

      const showDateSeparator =
        !!item.createdAt &&
        (!older?.createdAt || dayKey(older.createdAt) !== dayKey(item.createdAt));

      return (
        <MessageRow
          item={item}
          showDateSeparator={showDateSeparator}
          highlighted={highlightId === item.id}
          currentUid={currentUid}
          username={String(username)}
          profileImg={profileImg}
          handlers={rowHandlers}
        />
      );
    },
    [highlightId, currentUid, username, profileImg, rowHandlers]
  );

  // load older messages when the user scrolls up (only ONE page per trigger)
  const handleEndReached = useCallback(() => {
    if (!hasMore || searchMode || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setMsgLimit((l) => l + PAGE_SIZE);
  }, [hasMore, searchMode]);

  const isEmptyList = messages.length === 0;
  const listContentStyle = useMemo(
    () => [{ padding: 15, paddingBottom: 20 }, isEmptyList && { flex: 1 }],
    [isEmptyList]
  );

  // ---- keyboard handling (replaces KeyboardAvoidingView) ----
  // KeyboardAvoidingView leaves extra empty space after the keyboard closes
  // on Android. Here we measure how much the keyboard REALLY covers the
  // screen bottom and add exactly that much padding (works with or without
  // Android window-resize), and drop it to 0 when the keyboard closes.
  const screenRef = useRef<View>(null);
  const kbPad = useRef(new Animated.Value(0)).current;

  // Screen height tracking: if Android shrinks the window for the keyboard
  // (adjustResize) we know how much it already shrank, so we never
  // double-pad and never under-pad.
  const baseH = useRef(0); // tallest height seen = height with keyboard closed
  const curH = useRef(0); // current height
  const onScreenLayout = useCallback((e: any) => {
    const h = e.nativeEvent.layout.height;
    curH.current = h;
    if (h > baseH.current) baseH.current = h;
  }, []);

  // extra px above the keyboard (increase if the box is still hidden a bit)
  const KB_EXTRA = 45;

  useEffect(() => {
    const isIOS = Platform.OS === "ios";
    let timer: any;
    const animateTo = (toValue: number, duration: number) => {
      kbPad.stopAnimation();
      Animated.timing(kbPad, {
        toValue,
        duration,
        useNativeDriver: false,
      }).start();
    };
    const show = Keyboard.addListener(
      isIOS ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        const run = () => {
          screenRef.current?.measureInWindow((_x, y, _w, h) => {
            // method 1: position based
            const byPosition = Math.max(0, y + h - e.endCoordinates.screenY);
            // method 2: keyboard height minus what the window already shrank
            const shrunk = Math.max(0, baseH.current - curH.current);
            const byHeight = Math.max(0, e.endCoordinates.height - shrunk);
            // take the larger one so the input box is never hidden
            const overlap = Math.max(byPosition, byHeight) + KB_EXTRA;
            animateTo(overlap, isIOS ? e.duration || 220 : 120);
          });
        };
        clearTimeout(timer);
        // Android: let the window finish resizing before measuring
        if (isIOS) run();
        else timer = setTimeout(run, 120);
      }
    );
    const hide = Keyboard.addListener(
      isIOS ? "keyboardWillHide" : "keyboardDidHide",
      (e) => {
        clearTimeout(timer);
        animateTo(0, isIOS ? e.duration || 220 : 120);
      }
    );
    return () => {
      clearTimeout(timer);
      show.remove();
      hide.remove();
    };
  }, [kbPad]);

  // These checks run after every hook above has already been called on
  // every render, so they don't break the Rules of Hooks.
  if (!currentUser) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.whiteText}>User not logged in</Text>
      </SafeAreaView>
    );
  }

  if (!userId) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.whiteText}>userId not found</Text>
      </SafeAreaView>
    );
  }

  // ---------- derived values for the popup ----------
  const sel = selectedMessage;
  const selMine = sel?.senderId === currentUid;
  const selDeleted = sel?.deletedForEveryone === true;
  const canReact = !!sel && !selDeleted;
  const canReply = !!sel && !selDeleted;
  const canCopy = !!sel && !selDeleted && isTextMessage(sel) && !!sel.text;
  const canEdit = selMine && canCopy;
  const myReaction = sel?.reactions?.[currentUid];

  // header sub-line (typing / online / last seen) - hidden if they blocked me
  const statusLine = blockedByOther
    ? ""
    : otherTyping
    ? "typing..."
    : otherOnline
    ? "online"
    : formatLastSeen(otherLastSeen);

  const inputDisabled =
    isBlocked || blockedByOther || iAmReceiverPending || isDeclined || requesterLocked;

  return (
    <Animated.View
      ref={screenRef as any}
      collapsable={false}
      onLayout={onScreenLayout}
      style={[styles.container, { paddingBottom: kbPad }]}
    >
      {/* ============ HEADER ============ */}
      <View style={styles.header}>
        {searchMode ? (
          <View style={styles.searchHeader}>
            <TouchableOpacity onPress={closeSearch}>
              <Ionicons name="arrow-back" size={26} color="#fff" />
            </TouchableOpacity>

            <TextInput
              autoFocus
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search messages..."
              placeholderTextColor="#888"
              style={styles.searchInput}
            />

            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText("")}>
                <Ionicons name="close-circle" size={22} color="#aaa" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={28} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "./userProfile",
                  params: { userId: userId },
                })
              }
            >
              <Image
                source={{ uri: profileImg || DEFAULT_AVATAR }}
                style={styles.avatar}
              />
            </TouchableOpacity>

            <View style={{ marginLeft: 10, flexShrink: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={styles.username} numberOfLines={1}>
                  {String(username)}
                </Text>

                {verified && (
                  <View style={styles.verifiedWrap}>
                    <MaterialCommunityIcons
                      name="check-decagram"
                      size={18}
                      color={verifiedColor === "yellow" ? "#FFD700" : "#ffffff"}
                    />
                  </View>
                )}

                <View
                  style={[
                    styles.levelBadge,
                    {
                      backgroundColor: getLevelTheme(userLevel).bg,
                      borderColor: getLevelTheme(userLevel).border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="diamond-stone"
                    size={12}
                    color={getLevelTheme(userLevel).icon}
                  />
                  <Text
                    style={{
                      color: getLevelTheme(userLevel).text,
                      marginLeft: 3,
                      fontSize: 11,
                      fontWeight: "bold",
                    }}
                  >
                    LV {userLevel}
                  </Text>
                </View>
              </View>

              {!!statusLine && (
                <Text
                  style={
                    otherTyping || otherOnline
                      ? styles.typingText
                      : styles.lastSeenText
                  }
                >
                  {statusLine}
                </Text>
              )}
            </View>

            <View style={{ marginLeft: "auto" }}>
              <TouchableOpacity onPress={() => setHeaderMenuVisible(true)}>
                <Ionicons name="ellipsis-vertical" size={25} color="#fff" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* ============ MESSAGES ============ */}
      <FlatList
        ref={flatListRef}
        data={messages}
        inverted
        renderItem={renderItem}
        extraData={highlightId}
        keyExtractor={messageKey}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={9}
        contentContainerStyle={listContentStyle}
        ListEmptyComponent={
          loadingMessages ? null : (
            <View style={styles.emptyChatWrap}>
              <Text style={styles.emptyChatText}>
                {searchMode && searchText.trim()
                  ? "No messages found"
                  : "No messages yet. Say hi 👋"}
              </Text>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
        // tap on the chat area closes the keyboard; scrolling does too
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        // load older messages when the user scrolls up
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        onScrollToIndexFailed={(info) => {
          flatListRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: true,
          });
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index: info.index,
              animated: true,
              viewPosition: 0.5,
            });
          }, 300);
        }}
        // (inverted list) header = very bottom => pending uploads
        ListHeaderComponent={renderUploads()}
        // (inverted list) footer = very top => older messages loader
        ListFooterComponent={
          hasMore && !searchMode ? (
            <ActivityIndicator
              color="#888"
              style={{ marginVertical: 14 }}
            />
          ) : null
        }
      />

      {/* scroll-to-newest button with new message counter */}
      {showScrollBtn && (
        <TouchableOpacity
          style={styles.scrollToBottomBtn}
          onPress={scrollToBottom}
        >
          <Ionicons name="chevron-down" size={22} color="#fff" />
          {newCount > 0 && (
            <View style={styles.newCountBadge}>
              <Text style={styles.newCountText}>
                {newCount > 99 ? "99+" : newCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* ============ REPLY BAR ============ */}
      {!!replyingTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyBarLine} />
          <View style={{ flex: 1 }}>
            <Text style={styles.replyBarName} numberOfLines={1}>
              {replyingTo.senderId === currentUid ? "You" : String(username)}
            </Text>
            <Text style={styles.replyBarText} numberOfLines={1}>
              {getMessagePreview(replyingTo)}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)}>
            <Ionicons name="close" size={22} color="#aaa" />
          </TouchableOpacity>
        </View>
      )}

      {/* ============ MESSAGE REQUEST BAR ============ */}
      {(iAmReceiverPending || (isDeclined && !iAmRequester)) && (
        <View style={styles.requestBar}>
          <Text style={styles.requestBarText}>
            {isDeclined
              ? `You declined ${username}'s request.`
              : `${username} wants to message you. Accept to reply.`}
          </Text>
          <View style={styles.requestBtnRow}>
            {!isDeclined && (
              <TouchableOpacity
                style={[styles.requestBtn, styles.requestDecline]}
                onPress={declineRequest}
              >
                <Text style={styles.requestBtnText}>Decline</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.requestBtn, styles.requestAccept]}
              onPress={acceptRequest}
              disabled={accepting}
            >
              <Text style={styles.requestBtnText}>{accepting ? "..." : "Accept"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {requesterLocked && (
        <View style={styles.requestBar}>
          <Text style={styles.requestBarText}>
            Request sent. You can send more messages after {String(username)} accepts.
          </Text>
        </View>
      )}

      {/* ============ INPUT BAR ============ */}
      <ChatInput
        ref={inputRef}
        disabled={inputDisabled}
        placeholder={
          iAmReceiverPending
            ? "Accept the request to reply"
            : isDeclined
            ? "Request declined"
            : requesterLocked
            ? "Waiting for them to accept"
            : isBlocked
            ? "Unblock user to send message"
            : blockedByOther
            ? "You can't send messages to this user"
            : `Message.. ${username}`
        }
        onSend={stableSend}
        onTextChange={stableTyping}
        onAttach={stableAttach}
      />

      {/* small "Copied" / "Chat cleared" message */}
      {!!toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {/* ============ MESSAGE POPUP (tap outside / back button = close) ============ */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeMenu}
      >
        <View style={styles.modalOverlay}>
          {/* full-screen backdrop: any tap outside the popup closes it */}
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />

          <PopIn style={styles.menuWrap}>
            {canReact && (
              <View style={styles.reactionBar}>
                {REACTION_EMOJIS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    onPress={() => reactToMessage(e)}
                    style={[
                      styles.reactionBtn,
                      myReaction === e && styles.reactionBtnActive,
                    ]}
                  >
                    <Text style={styles.reactionBtnText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.menuBox}>
              {canReply && (
                <MenuRow
                  icon="arrow-undo-outline"
                  label="Reply"
                  onPress={replyFromMenu}
                />
              )}

              {canCopy && (
                <MenuRow
                  icon="copy-outline"
                  label="Copy"
                  onPress={copyMessage}
                />
              )}

              {canEdit && (
                <MenuRow
                  icon="create-outline"
                  label="Edit"
                  onPress={openEdit}
                />
              )}

              <MenuRow
                icon="trash-outline"
                label="Delete"
                onPress={askDelete}
                danger
              />
            </View>
          </PopIn>
        </View>
      </Modal>

      {/* ============ EDIT MESSAGE (tap outside / back button = close) ============ */}
      <Modal
        visible={editModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeEdit}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeEdit} />

          <KeyboardAvoidingView
            behavior="padding"
            style={styles.editWrap}
            pointerEvents="box-none"
          >
            <PopIn style={styles.editBox}>
              <Text style={styles.editTitle}>Edit message</Text>

              <TextInput
                value={editText}
                onChangeText={setEditText}
                autoFocus
                multiline
                style={styles.editInput}
              />

              <View style={styles.editBtnRow}>
                <TouchableOpacity
                  onPress={closeEdit}
                  style={styles.editCancelBtn}
                >
                  <Text style={styles.editCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={
                    !editText.trim() ||
                    editText.trim() === (selectedMessage?.text || "")
                  }
                  onPress={updateMessage}
                  style={[
                    styles.editSaveBtn,
                    (!editText.trim() ||
                      editText.trim() === (selectedMessage?.text || "")) && {
                      opacity: 0.5,
                    },
                  ]}
                >
                  <Text style={styles.editSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </PopIn>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ============ ATTACH SHEET (Gallery / Camera) ============ */}
      <Modal
        visible={attachVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setAttachVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setAttachVisible(false)}
          />

          <View style={styles.sheet}>
            <TouchableOpacity
              style={styles.sheetItem}
              onPress={pickAndSendMedia}
            >
              <View style={[styles.sheetIcon, { backgroundColor: "#7B1FFF" }]}>
                <Ionicons name="images" size={26} color="#fff" />
              </View>
              <Text style={styles.sheetLabel}>Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetItem}
              onPress={takeAndSendMedia}
            >
              <View style={[styles.sheetIcon, { backgroundColor: "#FF0066" }]}>
                <Ionicons name="camera" size={26} color="#fff" />
              </View>
              <Text style={styles.sheetLabel}>Camera</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ============ PHOTO / VIDEO VIEWER ============ */}
      <Modal
        visible={!!viewer}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewer(null)}
      >
        <Pressable
          style={styles.viewerOverlay}
          onPress={() => setViewer(null)}
        >
          {viewer?.type === "image" && (
            <Image
              source={{ uri: viewer.url }}
              style={{ width: "100%", height: "85%" }}
              resizeMode="contain"
            />
          )}

          {viewer?.type === "video" && <ViewerVideo url={viewer.url} />}

          <TouchableOpacity
            style={styles.viewerClose}
            onPress={() => setViewer(null)}
          >
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>

      {/* ============ HEADER MENU (tap outside / back button = close) ============ */}
      <Modal
        visible={headerMenuVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setHeaderMenuVisible(false)}
      >
        <View style={styles.headerMenuOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setHeaderMenuVisible(false)}
          />

          <PopIn style={styles.headerMenuBox}>
            <MenuRow
              icon="search-outline"
              label="Search"
              onPress={openSearch}
            />

            <MenuRow
              icon="trash-outline"
              label="Clear chat"
              onPress={clearChat}
            />

            {isBlocked ? (
              <TouchableOpacity style={styles.menuRow} onPress={unblockUser}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color="#00E676"
                />
                <Text style={[styles.menuRowText, { color: "#00E676" }]}>
                  Unblock User
                </Text>
              </TouchableOpacity>
            ) : (
              <MenuRow
                icon="ban"
                label="Block User"
                onPress={blockUser}
                danger
              />
            )}
          </PopIn>
        </View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  center: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },

  whiteText: {
    color: "#fff",
  },

  // ---------- header ----------
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },

  avatar: {
    width: 45,
    height: 45,
    borderRadius: 25,
    marginLeft: 10,
  },

  username: {
    color: "#fff",
    fontSize: 17,
    marginLeft: 0,
    fontWeight: "bold",
    flexShrink: 1,
  },

  verifiedWrap: {
    marginLeft: 5,
    width: 18,
    height: 18,
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

  typingText: {
    color: "#9be29b",
    fontSize: 12,
    marginTop: 2,
  },

  lastSeenText: {
    color: "#888",
    fontSize: 12,
    marginTop: 2,
  },

  searchHeader: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    marginHorizontal: 12,
    paddingVertical: 6,
  },

  // ---------- message rows / bubbles ----------
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginVertical: 4,
  },

  myRow: {
    justifyContent: "flex-end",
  },

  otherRow: {
    justifyContent: "flex-start",
  },

  chatAvatar: {
    width: 35,
    height: 35,
    borderRadius: 18,
    marginRight: 8,
  },

  bubbleColumn: {
    maxWidth: "75%",
  },

  messageBox: {
    maxWidth: "100%",
    padding: 10,
    borderRadius: 15,
    marginVertical: 5,
  },

  myMessage: {
    backgroundColor: "#009688",
    alignSelf: "flex-end",
  },

  otherMessage: {
    backgroundColor: "#333",
    alignSelf: "flex-start",
  },

  messageText: {
    color: "#fff",
    fontSize: 16,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    marginTop: 3,
  },

  editedText: {
    color: "#cfcfcf",
    fontSize: 10,
    marginRight: 5,
  },

  timeText: {
    color: "#dcdcdc",
    fontSize: 10,
  },

  highlight: {
    borderWidth: 2,
    borderColor: "#FFD700",
  },

  deletedBubble: {
    flexDirection: "row",
    alignItems: "center",
    opacity: 0.8,
  },

  deletedText: {
    color: "#cfcfcf",
    fontSize: 14,
    fontStyle: "italic",
    marginLeft: 6,
  },

  liveInviteBox: {
    backgroundColor: "#1e1e1e",
    padding: 15,
    borderRadius: 15,
    width: 220,
  },

  liveInviteTitle: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },

  liveInviteSub: {
    color: "#ccc",
    marginTop: 5,
  },

  videoThumbnail: {
    width: 130,
    height: 190,
    borderRadius: 15,
  },

  playIcon: {
    position: "absolute",
    top: "37%",
    left: "33%",
  },

  swipeIcon: {
    position: "absolute",
    left: 6,
    top: "50%",
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2a2a2a",
    justifyContent: "center",
    alignItems: "center",
  },

  // ---------- reply ----------
  replyQuote: {
    borderLeftWidth: 4,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 6,
  },

  replyQuoteMine: {
    backgroundColor: "rgba(0,0,0,0.2)",
    borderLeftColor: "#9EF8FF",
  },

  replyQuoteOther: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderLeftColor: "#00BFA5",
  },

  replyQuoteName: {
    color: "#9EF8FF",
    fontSize: 12,
    fontWeight: "bold",
  },

  replyQuoteText: {
    color: "#e6e6e6",
    fontSize: 13,
    marginTop: 1,
  },

  requestBar: {
    backgroundColor: "#111",
    borderTopWidth: 0.5,
    borderTopColor: "#222",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  requestBarText: { color: "#ccc", fontSize: 14, textAlign: "center" },
  requestBtnRow: { flexDirection: "row", justifyContent: "center", marginTop: 10 },
  requestBtn: {
    paddingHorizontal: 28,
    paddingVertical: 9,
    borderRadius: 20,
    marginHorizontal: 6,
  },
  requestAccept: { backgroundColor: "#00C853" },
  requestDecline: { backgroundColor: "#333" },
  requestBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#222",
  },

  replyBarLine: {
    width: 4,
    alignSelf: "stretch",
    backgroundColor: "#00BFA5",
    borderRadius: 2,
    marginRight: 10,
  },

  replyBarName: {
    color: "#00E5CC",
    fontSize: 13,
    fontWeight: "bold",
  },

  replyBarText: {
    color: "#bbb",
    fontSize: 13,
    marginTop: 1,
  },

  // ---------- reactions ----------
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#222",
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginTop: -8,
  },

  reactionPillEmoji: {
    fontSize: 13,
  },

  reactionPillCount: {
    color: "#ccc",
    fontSize: 11,
    marginLeft: 3,
  },

  // ---------- input bar ----------
  bottomBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: "#222",
  },

  input: {
    flex: 1,
    backgroundColor: "#4f4c4c",
    color: "#fff",
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingTop: Platform.OS === "ios" ? 12 : 10,
    paddingBottom: Platform.OS === "ios" ? 12 : 10,
    minHeight: 45,
    maxHeight: 120,
    fontSize: 16,
  },

  sendBtn: {
    width: 45,
    height: 45,
    borderRadius: 30,
    backgroundColor: "#d6e40d",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },

  attachBtn: {
    width: 45,
    height: 45,
    borderRadius: 25,
    backgroundColor: "#2a2a2a",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  previewBox: {
    position: "absolute",
    left: 0,
    right: 0,
    padding: 15,
    backgroundColor: "#222",
    borderTopWidth: 1,
    borderTopColor: "#444",
    marginBottom: 45,
  },

  previewText: {
    color: "#fff",
    fontSize: 16,
  },

  // ---------- list extras ----------
  dateSeparatorWrap: {
    alignSelf: "center",
    backgroundColor: "#1f1f1f",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginVertical: 10,
  },

  dateSeparatorText: {
    color: "#ccc",
    fontSize: 12,
    fontWeight: "600",
  },

  scrollToBottomBtn: {
    position: "absolute",
    right: 15,
    bottom: 110,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#2a2a2a",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#444",
  },

  newCountBadge: {
    position: "absolute",
    top: -8,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#00C853",
    justifyContent: "center",
    alignItems: "center",
  },

  newCountText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "bold",
  },

  emptyChatWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    transform: [{ scaleY: -1 }],
  },

  emptyChatText: {
    color: "#777",
    fontSize: 14,
  },

  toast: {
    position: "absolute",
    bottom: 120,
    alignSelf: "center",
    backgroundColor: "rgba(40,40,40,0.95)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },

  toastText: {
    color: "#fff",
    fontSize: 14,
  },

  // ---------- media ----------
  mediaBubble: {
    width: 210,
    height: 250,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
    marginVertical: 5,
  },

  mediaImg: {
    width: "100%",
    height: "100%",
  },

  mediaPlayIcon: {
    position: "absolute",
    top: "40%",
    alignSelf: "center",
    left: "38%",
  },

  mediaMeta: {
    position: "absolute",
    right: 8,
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },

  mediaTime: {
    color: "#fff",
    fontSize: 10,
  },

  mediaUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },

  mediaUploadText: {
    color: "#fff",
    marginTop: 6,
    fontWeight: "600",
  },

  // ---------- popups ----------
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },

  menuWrap: {
    width: 270,
  },

  reactionBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#111",
    borderRadius: 30,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 10,
  },

  reactionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },

  reactionBtnActive: {
    backgroundColor: "#333",
  },

  reactionBtnText: {
    fontSize: 24,
  },

  menuBox: {
    backgroundColor: "#111",
    borderRadius: 15,
    paddingVertical: 6,
    overflow: "hidden",
  },

  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
  },

  menuRowText: {
    color: "#fff",
    fontSize: 17,
    marginLeft: 14,
  },

  editWrap: {
    width: "100%",
    alignItems: "center",
  },

  editBox: {
    width: "90%",
    backgroundColor: "#111",
    borderRadius: 15,
    padding: 20,
  },

  editTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
    marginBottom: 12,
  },

  editInput: {
    color: "#fff",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 10,
    padding: 12,
    maxHeight: 160,
  },

  editBtnRow: {
    flexDirection: "row",
    marginTop: 15,
  },

  editCancelBtn: {
    flex: 1,
    backgroundColor: "#2a2a2a",
    padding: 15,
    borderRadius: 10,
    marginRight: 10,
  },

  editCancelText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
  },

  editSaveBtn: {
    flex: 1,
    backgroundColor: "#00C853",
    padding: 15,
    borderRadius: 10,
  },

  editSaveText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
  },

  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },

  sheet: {
    flexDirection: "row",
    backgroundColor: "#111",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 22,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },

  sheetItem: {
    alignItems: "center",
    marginRight: 34,
  },

  sheetIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: "center",
    alignItems: "center",
  },

  sheetLabel: {
    color: "#fff",
    marginTop: 8,
    fontSize: 13,
  },

  headerMenuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },

  headerMenuBox: {
    position: "absolute",
    top: 70,
    right: 15,
    width: 200,
    backgroundColor: "#111",
    borderRadius: 12,
    paddingVertical: 4,
    overflow: "hidden",
  },

  viewerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },

  viewerClose: {
    position: "absolute",
    top: 50,
    right: 20,
    padding: 6,
  },
});
