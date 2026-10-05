import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import * as Notifications from 'expo-notifications';

import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Dimensions,
  Platform,
  StatusBar,
  Image,
  BackHandler,
  Modal,
  Animated,
  Alert,
  TextInput,
  Keyboard,
  FlatList,
} from 'react-native';


import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { useRouter, usePathname } from 'expo-router';



// FIREBASE AUTH & FIRESTORE DEPENDENCIES
import { getAuth, onAuthStateChanged } from 'firebase/auth';

import {
  getFirestore,
  doc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  deleteDoc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  limit,
  startAfter,
  serverTimestamp,
  updateDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';

// STORY: photo upload + delete
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';


const { width } = Dimensions.get('window');

// Clean professional fallback avatar (Jab database me photo register na ho tabhi dikhega)
const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

// !!! Apne backend (server.js) ka URL yahan daalo - wahi jo video upload ke liye use karte ho
const STORY_SERVER_URL = 'https://topking-backend.onrender.com';

// Story filter tints (editor ke saath same)
const STORY_FILTER_TINTS = {
  none: 'transparent',
  warm: 'rgba(255,140,0,0.20)',
  cool: 'rgba(0,120,255,0.20)',
  rose: 'rgba(255,0,110,0.18)',
  mint: 'rgba(0,220,170,0.18)',
  dusk: 'rgba(90,40,160,0.28)',
  fade: 'rgba(255,255,255,0.22)',
  noir: 'rgba(0,0,0,0.38)',
};
const STORY_LIGHT_COLORS = ['#ffffff', '#ffcc00', '#34c759'];

// Story video player (pause/resume support)
function StoryVideo({ uri, paused, fit }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFillObject}
      contentFit={fit || 'cover'}
      nativeControls={false}
    />
  );
}

// Story par lage text / emoji (viewer me sirf dikhte hain)
function StoryOverlayStatic({ item, boxW, boxH }) {
  const k = boxW / 360;
  const w = boxW * 0.92;
  const h = boxW * 0.8;
  const light = STORY_LIGHT_COLORS.includes(item.color);

  let content;
  if (item.type === 'emoji') {
    content = <Text style={{ fontSize: 64 * k }}>{item.text}</Text>;
  } else if (item.bg) {
    content = (
      <View
        style={{
          backgroundColor: item.color,
          paddingHorizontal: 12 * k,
          paddingVertical: 6 * k,
          borderRadius: 10 * k,
        }}
      >
        <Text style={{ fontSize: 28 * k, fontWeight: '800', textAlign: 'center', color: light ? '#000' : '#fff' }}>
          {item.text}
        </Text>
      </View>
    );
  } else {
    content = (
      <Text
        style={{
          fontSize: 30 * k,
          fontWeight: '800',
          textAlign: 'center',
          color: item.color,
          textShadowColor: 'rgba(0,0,0,0.55)',
          textShadowRadius: 6,
          textShadowOffset: { width: 0, height: 1 },
        }}
      >
        {item.text}
      </Text>
    );
  }

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: item.x * boxW - w / 2,
        top: item.y * boxH - h / 2,
        width: w,
        height: h,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate: `${item.rotation || 0}rad` }, { scale: item.scale || 1 }],
      }}
    >
      <View style={{ maxWidth: w, padding: 10 }}>{content}</View>
    </View>
  );
}

// STORY settings
const STORY_DURATION = 5000;                 // har story 5 second chalti hai
const STORY_LIFETIME = 24 * 60 * 60 * 1000;  // 24 ghante baad expire

const toMillis = (ts) =>
  ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now();

const timeAgo = (ms) => {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
};

// ---------------------------------------------------------------
// SPEED HELPERS (module level = created once, not on every render)
// ---------------------------------------------------------------
const getLevelTheme = (level = 1) => {
  if (level >= 50) return { bg: '#7B1FFF', border: '#FFD700', text: '#fff', icon: '#FFD700' };
  if (level >= 40) return { bg: '#00BFFF', border: '#9EF8FF', text: '#fff', icon: '#fff' };
  if (level >= 30) return { bg: '#FF0066', border: '#FFB6C1', text: '#fff', icon: '#fff' };
  if (level >= 20) return { bg: '#FFC107', border: '#FFE082', text: '#000', icon: '#fff' };
  if (level >= 10) return { bg: '#BDBDBD', border: '#fff', text: '#fff', icon: '#fff' };
  return { bg: '#222', border: '#555', text: '#FFD700', icon: '#00E5FF' };
};

// level / verified info of other users. Cached so that every new message
// (which re-delivers the first page) does NOT trigger 2 reads per friend again.
const ENRICH_TTL = 5 * 60 * 1000;
const enrichCache = new Map();
const enrichInflight = new Set();
const EMPTY_LIST = [];

const keyExtractorById = (item) => String(item.id);

// one row of the chat list (memo = only re-renders when ITS data changes)
const FriendRow = memo(function FriendRow({ item, onOpen, onMenu, showPreview }) {
  const theme = getLevelTheme(item.level);
  const last =
    item.lastMessage === '🎙 Live Invite'
      ? '🎙 Sent you a live invite'
      : item.lastMessage === '🎥 Video'
      ? '🎥 Sent a video'
      : item.lastMessage;

  return (
    <TouchableOpacity
      style={styles.chatRow}
      activeOpacity={onOpen ? 0.7 : 1}
      onPress={onOpen ? () => onOpen(item) : undefined}
    >
      <Image
        source={{ uri: item.profileImg || DEFAULT_AVATAR }}
        style={styles.chatAvatar}
        resizeMethod="resize"
      />

      <View style={styles.chatInfo}>
        <View style={styles.chatNameRow}>
          <Text style={styles.chatName} numberOfLines={1}>
            {item.username}
          </Text>

          {item.verified && (
            <View style={styles.verifiedBadge}>
              <MaterialCommunityIcons
                name="check-decagram"
                size={16}
                color={item.verifiedColor === 'yellow' ? '#FFD700' : '#ffffff'}
              />
            </View>
          )}

          <View
            style={[
              styles.levelBadge,
              { backgroundColor: theme.bg, borderColor: theme.border },
            ]}
          >
            <MaterialCommunityIcons name="diamond-stone" size={12} color={theme.icon} />
            <Text style={[styles.levelText, { color: theme.text }]}>
              LV {item.level || 1}
            </Text>
          </View>
        </View>

        {showPreview && (
          <View style={styles.chatBottomRow}>
            <Text numberOfLines={1} style={styles.chatLast}>
              {last}
            </Text>

            {item.hasNewMessage && (
              <View style={styles.newPill}>
                <Text style={styles.newPillText}>NEW</Text>
              </View>
            )}

            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <TouchableOpacity
        onPress={() => onMenu(item)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

// one row of the notification popup
const NotificationRow = memo(function NotificationRow({
  item,
  onOpenHome,
  onOpenProfile,
  onOpenVideo,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => {
        if (item.videoId) onOpenHome(item.videoId);
      }}
      style={styles.notifRow}
    >
      <TouchableOpacity onPress={() => onOpenProfile(item.senderId)}>
        <Image
          source={{ uri: item.senderPhoto || DEFAULT_AVATAR }}
          style={styles.notifAvatar}
          resizeMethod="resize"
        />
      </TouchableOpacity>

      <View style={styles.notifBody}>
        <Text style={styles.notifName}>{item.senderName}</Text>

        {item.videoThumbnail ? (
          <TouchableOpacity onPress={() => onOpenVideo(item.videoId)}>
            <Image
              source={{ uri: item.videoThumbnail }}
              style={styles.notifThumb}
              resizeMethod="resize"
            />
          </TouchableOpacity>
        ) : null}

        <Text style={styles.notifAction}>
          {item.type === 'comment'
            ? 'commented on your video'
            : item.type === 'like'
            ? 'liked your video'
            : item.type === 'follow'
            ? 'started following you'
            : ''}
        </Text>

        {item.text ? <Text style={styles.notifText}>Comment: {item.text}</Text> : null}

        {item.videoCaption ? (
          <Text style={styles.notifCaption}>Video: {item.videoCaption}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

export default function Messages() {
  const router = useRouter();
  const pathname = usePathname();
  const auth = getAuth();
  const db = getFirestore();



 

  // States
  const [activeTab, setActiveTab] = useState('Friends');
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfilePhoto, setUserProfilePhoto] = useState(DEFAULT_AVATAR); 
  const [authChecked, setAuthChecked] = useState(false);
const [notifications, setNotifications] = useState([]);

const [friends, setFriends] = useState([]);
const [friendsLoadingMore, setFriendsLoadingMore] = useState(false);
const [friendsInitialLoading, setFriendsInitialLoading] = useState(true);
const [friendsHasMore, setFriendsHasMore] = useState(true);
const friendsCursorRef = React.useRef(null);
const friendsLoadingRef = React.useRef(false);
const friendsLoadedPagesRef = React.useRef(0);

const [menuVisible, setMenuVisible] = useState(false);

const [selectedFriend, setSelectedFriend] = useState(null);

const [hiddenFriends, setHiddenFriends] = useState([]);
const [requests, setRequests] = useState([]);
const [friendsUnread, setFriendsUnread] = useState(0);

const [selectedType, setSelectedType] = useState('comment');

const [modalVisible, setModalVisible] = useState(false);

// ===============================
// NOTIFICATION PERMISSION
// ===============================
useEffect(() => {
  if (!currentUser) return;

  const requestNotificationPermission = async () => {
    try {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();

      if (existingStatus === 'granted') {
        console.log("🔔 Notification permission already ON");
        return;
      }

      const { status } =
        await Notifications.requestPermissionsAsync();

      if (status === 'granted') {
        console.log("🔔 Notification permission GRANTED");
      } else {
        console.log("🔕 Notification permission DENIED");
      }
    } catch (error) {
      console.log(
        "Notification permission error:",
        error
      );
    }
  };

  requestNotificationPermission();
}, [currentUser]);


// ===============================
// STORIES
// ===============================
const [myStories, setMyStories] = useState([]);
const [friendStories, setFriendStories] = useState([]);
const [seenStories, setSeenStories] = useState({});
const [storyUploading, setStoryUploading] = useState(false);
const [viewer, setViewer] = useState(null); // { groupIndex, storyIndex }
const [viewerCount, setViewerCount] = useState(0);
const [storyPaused, setStoryPaused] = useState(false);
const [replyText, setReplyText] = useState('');
const [replySentMsg, setReplySentMsg] = useState('');
const [liked, setLiked] = useState(false);
const [likeCount, setLikeCount] = useState(0);
const [replies, setReplies] = useState([]);
const [showReplies, setShowReplies] = useState(false);
const [kbHeight, setKbHeight] = useState(0);
const [storyTick, setStoryTick] = useState(0);
const storyProgress = useRef(new Animated.Value(0)).current;
const storyGroupsRef = useRef([]);

// Expired stories ko list se hatane ke liye har minute refresh
useEffect(() => {
  const t = setInterval(() => setStoryTick((x) => x + 1), 60000);
  return () => clearInterval(t);
}, []);

// Meri apni stories
useEffect(() => {
  if (!currentUser) {
    setMyStories([]);
    return;
  }

  const q = query(
    collection(db, 'stories'),
    where('userId', '==', currentUser.uid)
  );

  return onSnapshot(
    q,
    (snap) => setMyStories(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => console.log('My stories error:', e)
  );
}, [currentUser]);

// Dosto (chat friends) ki stories - Firestore "in" query max 30 ids leti hai
const friendIdsKey = friends
  .map((f) => f.userId)
  .filter(Boolean)
  .sort()
  .slice(0, 30)
  .join(',');

useEffect(() => {
  if (!currentUser || !friendIdsKey) {
    setFriendStories([]);
    return;
  }

  const q = query(
    collection(db, 'stories'),
    where('userId', 'in', friendIdsKey.split(','))
  );

  return onSnapshot(
    q,
    (snap) =>
      setFriendStories(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => console.log('Friend stories error:', e)
  );
}, [currentUser, friendIdsKey]);

// Kaunsi stories dekh li gayi (ek hi doc, sasta)
useEffect(() => {
  if (!currentUser) {
    setSeenStories({});
    return;
  }

  return onSnapshot(
    doc(db, 'storyViews', currentUser.uid),
    (snap) => setSeenStories(snap.exists() ? snap.data().seen || {} : {}),
    () => {}
  );
}, [currentUser]);

const storyGroups = useMemo(() => {
  const now = Date.now();
  const alive = (st) =>
    st.expiresAt &&
    typeof st.expiresAt.toMillis === 'function' &&
    st.expiresAt.toMillis() > now;
  const sortAsc = (x, y) => toMillis(x.createdAt) - toMillis(y.createdAt);

  const mine = myStories.filter(alive).sort(sortAsc);

  const byUser = {};
  friendStories.filter(alive).forEach((st) => {
    (byUser[st.userId] = byUser[st.userId] || []).push(st);
  });

  const friendInfo = {};
  friends.forEach((f) => {
    friendInfo[f.userId] = f;
  });

  const friendGroups = Object.keys(byUser).map((uid) => {
    const items = byUser[uid].sort(sortAsc);
    const info = friendInfo[uid] || {};
    return {
      userId: uid,
      isOwn: false,
      username: info.username || items[0].username || 'User',
      photo: info.profileImg || items[0].userPhoto || DEFAULT_AVATAR,
      items,
      allSeen: items.every((st) => seenStories[st.id]),
      latest: toMillis(items[items.length - 1].createdAt),
    };
  });

  // Na dekhi hui stories pehle, phir nayi wali upar
  friendGroups.sort((x, y) =>
    x.allSeen !== y.allSeen ? (x.allSeen ? 1 : -1) : y.latest - x.latest
  );

  const ownGroup = mine.length
    ? {
        userId: currentUser ? currentUser.uid : '',
        isOwn: true,
        username: 'Your story',
        photo: userProfilePhoto,
        items: mine,
        allSeen: mine.every((st) => seenStories[st.id]),
        latest: toMillis(mine[mine.length - 1].createdAt),
      }
    : null;

  return {
    ownGroup,
    friendGroups,
    all: ownGroup ? [ownGroup, ...friendGroups] : friendGroups,
  };
}, [myStories, friendStories, seenStories, friends, userProfilePhoto, currentUser, storyTick]);

storyGroupsRef.current = storyGroups.all;

const currentGroup = viewer ? storyGroups.all[viewer.groupIndex] : null;
const currentStory = currentGroup ? currentGroup.items[viewer.storyIndex] : null;
const currentStoryId = currentStory ? currentStory.id : null;
const storyDur =
  currentStory && currentStory.mediaType === 'video' && currentStory.duration
    ? Math.min(Math.max(currentStory.duration, 1000), 30000)
    : STORY_DURATION;

// Next story ki image pehle se download kar lo (tap karte hi turant khule)
useEffect(() => {
  if (!viewer || !currentGroup) return;

  let next = currentGroup.items[viewer.storyIndex + 1];
  if (!next) {
    const g = storyGroupsRef.current[viewer.groupIndex + 1];
    next = g && g.items[0];
  }
  if (next && next.mediaType !== 'video' && next.mediaUrl) {
    Image.prefetch(next.mediaUrl).catch(() => {});
  }
}, [viewer ? viewer.groupIndex : -1, viewer ? viewer.storyIndex : -1, currentStoryId]);

// + dabate hi gallery khulti hai, phir story editor page
const addStory = async () => {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 0.8,
      videoMaxDuration: 30,
    });

    if (result.canceled || !result.assets || !result.assets[0] || !result.assets[0].uri) return;

    const a = result.assets[0];
    const isVideo = a.type === 'video';

    if (isVideo && a.duration && a.duration > 30500) {
      Alert.alert('Video too long', 'Story video maximum 30 seconds ki ho sakti hai.');
      return;
    }
    if (a.fileSize && a.fileSize > 58 * 1024 * 1024) {
      Alert.alert('File too large', 'Story file 58 MB se chhoti honi chahiye.');
      return;
    }

    router.push({
      pathname: '/story-editor',
      params: {
        uri: a.uri,
        type: isVideo ? 'video' : 'image',
        duration: String(a.duration || 0),
        userPhoto: userProfilePhoto || '',
        username: (currentUser && currentUser.displayName) || 'User',
      },
    });
  } catch (e) {
    console.log('Pick story media error:', e);
  }
};

const openStoryGroup = (groupIndex) => {
  setViewerCount(0);
  setViewer({ groupIndex, storyIndex: 0 });
};

const closeViewer = () => {
  storyProgress.stopAnimation();
  Keyboard.dismiss();
  setStoryPaused(false);
  setReplyText('');
  setShowReplies(false);
  setViewer(null);
};

const goNextStory = () => {
  const groups = storyGroupsRef.current;

  setViewer((prev) => {
    if (!prev) return prev;
    const g = groups[prev.groupIndex];

    if (g && prev.storyIndex < g.items.length - 1) {
      return { ...prev, storyIndex: prev.storyIndex + 1 };
    }
    if (prev.groupIndex < groups.length - 1) {
      return { groupIndex: prev.groupIndex + 1, storyIndex: 0 };
    }
    return null; // sab stories khatam
  });
};

const goPrevStory = () => {
  setViewer((prev) => {
    if (!prev) return prev;

    if (prev.storyIndex > 0) {
      return { ...prev, storyIndex: prev.storyIndex - 1 };
    }
    if (prev.groupIndex > 0) {
      return { groupIndex: prev.groupIndex - 1, storyIndex: 0 };
    }
    return prev;
  });
};

const deleteMyStory = (story) => {
  Alert.alert('Delete story?', 'This story will be removed for everyone.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: async () => {
        try {
          closeViewer();
          await deleteDoc(doc(db, 'stories', story.id));
          if (story.storagePath && currentUser) {
            try {
              const token = await currentUser.getIdToken();
              await fetch(`${STORY_SERVER_URL}/delete-story-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ key: story.storagePath }),
              });
            } catch (e) {}
          }
        } catch (e) {
          console.log('Delete story error:', e);
        }
      },
    },
  ]);
};

// Story badalte hi progress 0 se
useEffect(() => {
  storyProgress.setValue(0);
  setReplyText('');
  setShowReplies(false);
  setStoryPaused(false);
}, [viewer ? viewer.groupIndex : -1, viewer ? viewer.storyIndex : -1, currentStoryId]);

// Progress bar + auto next (typing / replies panel khula ho to pause)
useEffect(() => {
  if (!viewer || !currentStoryId || storyPaused) return;

  const start = (storyProgress as any).__getValue ? (storyProgress as any).__getValue() : 0;
  const anim = Animated.timing(storyProgress, {
    toValue: 1,
    duration: Math.max(200, storyDur * (1 - start)),
    useNativeDriver: false,
  });

  anim.start(({ finished }) => {
    if (finished) goNextStory();
  });

  return () => anim.stop();
}, [viewer ? viewer.groupIndex : -1, viewer ? viewer.storyIndex : -1, currentStoryId, storyPaused]);

// Keyboard height (Modal ke andar input ko upar uthane ke liye)
useEffect(() => {
  const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
  const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
  const a = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
  const b = Keyboard.addListener(hideEvt, () => setKbHeight(0));
  return () => { a.remove(); b.remove(); };
}, []);

// Like status (meri) + owner ke liye likes count aur replies list
useEffect(() => {
  setLiked(false);
  setLikeCount(0);
  setReplies([]);
  if (!viewer || !currentGroup || !currentStoryId || !currentUser) return;

  const unsubs = [];
  if (currentGroup.isOwn) {
    unsubs.push(onSnapshot(
      collection(db, 'stories', currentStoryId, 'likes'),
      (snap) => setLikeCount(snap.size),
      () => {}
    ));
    unsubs.push(onSnapshot(
      query(collection(db, 'stories', currentStoryId, 'replies'), orderBy('createdAt', 'desc'), limit(50)),
      (snap) => setReplies(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {}
    ));
  } else {
    unsubs.push(onSnapshot(
      doc(db, 'stories', currentStoryId, 'likes', currentUser.uid),
      (snap) => setLiked(snap.exists()),
      () => {}
    ));
  }
  return () => unsubs.forEach((u) => u());
}, [currentStoryId, currentGroup ? currentGroup.isOwn : false]);

const toggleStoryLike = async () => {
  if (!currentUser || !currentStoryId) return;
  const ref = doc(db, 'stories', currentStoryId, 'likes', currentUser.uid);
  try {
    if (liked) {
      setLiked(false);
      await deleteDoc(ref);
    } else {
      setLiked(true);
      await setDoc(ref, {
        username: currentUser.displayName || 'User',
        photo: userProfilePhoto,
        createdAt: serverTimestamp(),
      });
    }
  } catch (e) {
    console.log('Story like error:', e);
    setLiked((v) => !v);
  }
};

const sendStoryReply = async (text, type) => {
  const clean = (text || '').trim();
  if (!clean || !currentUser || !currentStoryId) return;
  try {
    await addDoc(collection(db, 'stories', currentStoryId, 'replies'), {
      fromUid: currentUser.uid,
      username: currentUser.displayName || 'User',
      photo: userProfilePhoto,
      text: clean.slice(0, 500),
      type: type || 'text',
      createdAt: serverTimestamp(),
    });
    setReplyText('');
    Keyboard.dismiss();
    setStoryPaused(false);
    setReplySentMsg(type === 'emoji' ? clean + ' sent' : 'Reply sent');
    setTimeout(() => setReplySentMsg(''), 1500);
  } catch (e) {
    console.log('Story reply error:', e);
    Alert.alert('Could not send', 'Please try again.');
  }
};

// Story dekhte hi "seen" mark karo (aur owner ko viewer ka record)
useEffect(() => {
  if (!viewer || !currentStory || !currentUser) return;
  if (seenStories[currentStory.id]) return;

  setDoc(
    doc(db, 'storyViews', currentUser.uid),
    { seen: { [currentStory.id]: true } },
    { merge: true }
  ).catch(() => {});

  if (currentGroup && !currentGroup.isOwn) {
    setDoc(doc(db, 'stories', currentStory.id, 'viewers', currentUser.uid), {
      viewedAt: serverTimestamp(),
      username: currentUser.displayName || '',
      photo: userProfilePhoto,
    }).catch(() => {});
  }
}, [currentStoryId]);

// Apni story par kitne logo ne dekha
useEffect(() => {
  if (!viewer || !currentGroup || !currentGroup.isOwn || !currentStoryId) {
    setViewerCount(0);
    return;
  }

  return onSnapshot(
    collection(db, 'stories', currentStoryId, 'viewers'),
    (snap) => setViewerCount(snap.size),
    () => {}
  );
}, [currentStoryId, currentGroup ? currentGroup.isOwn : false]);

useEffect(() => {

  if (!currentUser) return;

  const setMessagesScreen = async () => {

    await setDoc(
      doc(db, "users", currentUser.uid),
      {
        activeScreen: "messages",
      },
      { merge: true }
    );


  };

  setMessagesScreen();

  return () => {

    setDoc(
      doc(db, "users", currentUser.uid),
      {
        activeScreen: null,
      },
      { merge: true }
    );

  };

}, [currentUser]);





  // MOBILE HARDWARE BACK BUTTON LISTENERS + AUTH + FIRESTORE SYNC
  useEffect(() => {
    let unsubscribeFirestore = () => {};

    // Naya Safe Hardware Back Button Handling
    const handleHardwareBack = () => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
      return true; // Event handled successfully
    };

    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleHardwareBack
    );

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);

        // First fallback: Check Firebase Auth direct photo URL
        if (user.photoURL) {
          setUserProfilePhoto(user.photoURL);
        }

        // Second fallback: Realtime listener user data table se full image fetch ke liye
        const userDocRef = doc(db, 'users', user.uid);
        unsubscribeFirestore = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();
            
            // FIX: profileImg key ko top priority di h kyuki profile.js isi key me save karta hai
            const photo = userData.profileImg || userData.profilePic || userData.photoURL || userData.image;
            
            if (photo && photo.trim() !== '') {
              setUserProfilePhoto(photo);
            }
          }
        }, (error) => {
          console.log("Firestore image fetch error:", error);
        });

      } else {
        setCurrentUser(null);
        setUserProfilePhoto(DEFAULT_AVATAR);
      }
      setAuthChecked(true);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeFirestore();
      backSubscription.remove(); // Crash se bachne ke liye safe clean-up method
    };
  }, []);



useEffect(() => {
  if (!currentUser) return;

  const q = query(
    collection(
      db,
      'users',
      currentUser.uid,
      'notifications'
    ),
    orderBy('createdAt', 'desc'),
    limit(100)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    setNotifications(data);
  });

  return () => unsubscribe();
}, [currentUser]);





// Badge data (level / verified) comes from a small cache first, so rows paint
// with their badges instantly. Only users that are NOT cached (or are older
// than 5 minutes) cost 2 Firestore reads - and they are patched in quietly.
const withCachedBadges = (item) => {
  const c = enrichCache.get(item.userId);
  return c
    ? { ...item, level: c.level, verified: c.verified, verifiedColor: c.verifiedColor }
    : item;
};

const mergeFriendsIntoState = (list, append) => {
  const keepBadges = (item, existing) =>
    existing
      ? { ...item, level: existing.level, verified: existing.verified, verifiedColor: existing.verifiedColor }
      : item;

  if (append) {
    setFriends((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]));
      list.forEach((item) => byId.set(item.id, keepBadges(item, byId.get(item.id))));
      return Array.from(byId.values());
    });
    return;
  }

  // Realtime first-page updates must NOT delete already-loaded pages.
  setFriends((prev) => {
    const prevById = new Map(prev.map((item) => [item.id, item]));
    const merged = list.map((item) => keepBadges(item, prevById.get(item.id)));

    if (friendsLoadedPagesRef.current <= 1) return merged;

    const firstPageIds = new Set(list.map((item) => item.id));
    const olderLoaded = prev.filter((item) => !firstPageIds.has(item.id));
    return [...merged, ...olderLoaded];
  });
};

// Fetches level/verified for users that are not cached yet and patches
// each row into `setter` as soon as ITS data arrives.
const enrichInBackground = (docs, setter) => {
  const now = Date.now();

  docs.forEach(async (d) => {
    const uid = d.data().userId;
    if (!uid || enrichInflight.has(uid)) return;

    const cached = enrichCache.get(uid);
    if (cached && now - cached.at < ENRICH_TTL) return;

    enrichInflight.add(uid);
    try {
      const [walletSnap, userSnap] = await Promise.all([
        getDoc(doc(db, 'wallets', uid)),
        getDoc(doc(db, 'users', uid)),
      ]);

      const info = {
        level: walletSnap.exists() ? walletSnap.data().level || 1 : 1,
        verified: userSnap.exists() ? userSnap.data().verified === true : false,
        verifiedColor: userSnap.exists() ? userSnap.data().verifiedColor || 'white' : 'white',
        at: Date.now(),
      };
      enrichCache.set(uid, info);

      setter((prev) =>
        prev.map((item) =>
          item.userId === uid
            ? { ...item, level: info.level, verified: info.verified, verifiedColor: info.verifiedColor }
            : item
        )
      );
    } catch (e) {
      console.log('Friend profile enrich error:', e);
    } finally {
      enrichInflight.delete(uid);
    }
  });
};

const loadFriendDocs = async (docs, append = false) => {
  const list = docs.map((d) =>
    withCachedBadges({
      id: d.id,
      ...d.data(),
      level: 1,
      verified: false,
      verifiedColor: 'white',
    })
  );

  // Paint instantly with the base data...
  mergeFriendsIntoState(list, append);

  if (docs.length > 0 && (append || !friendsCursorRef.current)) {
    friendsCursorRef.current = docs[docs.length - 1];
  }

  setFriendsHasMore(docs.length >= 10);

  if (!append) {
    setFriendsInitialLoading(false);
  }

  // ...then quietly fill in badges that are not cached yet.
  enrichInBackground(docs, setFriends);
};

useEffect(() => {
  if (!currentUser) return;

  friendsCursorRef.current = null;
  friendsLoadedPagesRef.current = 0;
  friendsLoadingRef.current = false;
  setFriends([]);
  setFriendsHasMore(true);
  setFriendsInitialLoading(true);

  const q = query(
    collection(db, "userChats", currentUser.uid, "friends"),
    orderBy("updatedAt", "desc"),
    limit(10)
  );

  const unsubscribe = onSnapshot(
    q,
    async (snapshot) => {
      try {
        await loadFriendDocs(snapshot.docs, false);

        if (friendsLoadedPagesRef.current === 0) {
          friendsLoadedPagesRef.current = 1;
        }
      } catch (e) {
        console.log("Friends listener load error:", e);
        setFriendsInitialLoading(false);
      }
    },
    (error) => {
      console.log("Friends listener error:", error);
      setFriendsInitialLoading(false);
    }
  );

  return unsubscribe;
}, [currentUser]);

const loadMoreFriends = async () => {
  if (!currentUser || !friendsHasMore || friendsLoadingRef.current) return;

  friendsLoadingRef.current = true;
  setFriendsLoadingMore(true);

  try {
    const friendsRef = collection(db, "userChats", currentUser.uid, "friends");

    if (!friendsCursorRef.current) {
      return;
    }

    const q = query(
      friendsRef,
      orderBy("updatedAt", "desc"),
      startAfter(friendsCursorRef.current),
      limit(10)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      setFriendsHasMore(false);
      return;
    }

    await loadFriendDocs(snapshot.docs, true);
    friendsLoadedPagesRef.current += 1;

    if (snapshot.docs.length < 10) {
      setFriendsHasMore(false);
    }
  } catch (e) {
    console.log("Load more friends error:", e);
  } finally {
    friendsLoadingRef.current = false;
    setFriendsLoadingMore(false);
  }
};



useEffect(() => {
  if (!currentUser) return;

  const q = query(
    collection(db, 'userChats', currentUser.uid, 'hiddenFriends'),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      // Paint instantly (badges from cache when available)...
      setHiddenFriends(
        snapshot.docs.map((d) =>
          withCachedBadges({
            id: d.id,
            ...d.data(),
            level: 1,
            verified: false,
            verifiedColor: 'white',
          })
        )
      );

      // ...then fetch only the badges that are missing.
      enrichInBackground(snapshot.docs, setHiddenFriends);
    },
    (e) => console.log('Hidden friends error:', e)
  );
}, [currentUser]);




// Message requests (people who are not friends yet). Chat moves to Friends
// when accepted (chat.tsx). Newest request first.
useEffect(() => {
  if (!currentUser) {
    setRequests([]);
    return;
  }

  const q = query(
    collection(db, 'userChats', currentUser.uid, 'requests'),
    orderBy('updatedAt', 'desc'),
    limit(50)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      setRequests(
        snapshot.docs.map((d) =>
          withCachedBadges({
            id: d.id,
            ...d.data(),
            level: 1,
            verified: false,
            verifiedColor: 'white',
          })
        )
      );
      enrichInBackground(snapshot.docs, setRequests);
    },
    (e) => console.log('Requests error:', e)
  );
}, [currentUser]);

// Friends tab count = number of chats with unread messages (cheap query,
// does not depend on how many chat pages are loaded)
useEffect(() => {
  if (!currentUser) {
    setFriendsUnread(0);
    return;
  }

  const q = query(
    collection(db, 'userChats', currentUser.uid, 'friends'),
    where('unreadCount', '>', 0),
    limit(99)
  );

  return onSnapshot(q, (snap) => setFriendsUnread(snap.size), () => {});
}, [currentUser]);

const getIconColor = (path) => (pathname === path ? '#3498db' : '#fff');

  // Top Horizontal Badges


  // Tabs layout
  const tabs = ['Friends', 'Requests', 'Hid.Sms'];

const hiddenUnread = hiddenFriends.filter((f) => f.unreadCount > 0).length;
const requestsUnread = requests.filter((r) => r.unreadCount > 0).length;
const tabCounts = {
  Friends: friendsUnread,
  Requests: requestsUnread,
  'Hid.Sms': hiddenUnread,
};

const filteredNotifications = notifications.filter(
  item => item.type === selectedType
);




const unreadFollowers = notifications.filter(
  item => item.type === "follow" && !item.isRead
).length;

const unreadLikes = notifications.filter(
  item => item.type === "like" && !item.isRead
).length;

const unreadComments = notifications.filter(
  item => item.type === "comment" && !item.isRead
).length;


const topBadges = [

{
  id: 'follow',
  title: 'Follower',
  icon: 'person',
  color: '#3498db',
  count: unreadFollowers,
},
{
  id: 'like',
  title: 'Like',
  icon: 'heart',
  color: '#ff2d55',
  count: unreadLikes,
},
{
  id: 'comment',
  title: 'Comments',
  icon: 'chatbubble',
  color: '#00ccbb',
  count: unreadComments,
},
];


const totalUnread = unreadFollowers + unreadLikes + unreadComments;

const markTypeRead = async (type) => {
  if (!currentUser) return;

  const unreadDocs = notifications.filter(
    (item) => item.type === type && !item.isRead
  );

  await Promise.all(
    unreadDocs.map((item) =>
      updateDoc(
        doc(db, 'users', currentUser.uid, 'notifications', item.id),
        { isRead: true }
      )
    )
  );
};

// Upar wala bell icon - jisme Follower / Like / Comment hain
const openNotifications = () => {
  const firstUnread = topBadges.find((b) => b.count > 0);
  const type = firstUnread ? firstUnread.id : selectedType;

  setSelectedType(type);
  setModalVisible(true);
  markTypeRead(type).catch(() => {});
};

const switchNotifTab = (type) => {
  setSelectedType(type);
  markTypeRead(type).catch(() => {});
};

// stable callbacks => memoized rows do not re-render needlessly
const openChat = useCallback(
  (item) =>
    router.push({
      pathname: '/chat',
      params: {
        userId: item.userId,
        username: item.username,
        profileImg: item.profileImg,
      },
    }),
  [router]
);

const openFriendMenu = useCallback((item) => {
  setSelectedFriend(item);
  setMenuVisible(true);
}, []);

const closeFriendMenu = useCallback(() => setMenuVisible(false), []);

// decline a message request (row menu in the Requests tab)
const declineRequest = async (req) => {
  if (!req || !currentUser) return;

  setMenuVisible(false);
  setRequests((prev) => prev.filter((item) => item.id !== req.id));

  try {
    const uid = currentUser.uid;
    const chatId = uid < req.userId ? `${uid}_${req.userId}` : `${req.userId}_${uid}`;

    const batch = writeBatch(db);
    batch.update(doc(db, 'chats', chatId), {
      status: 'declined',
      declinedAt: serverTimestamp(),
    });
    batch.delete(doc(db, 'userChats', uid, 'requests', req.id));
    await batch.commit();
  } catch (error) {
    console.log('Decline request error:', error);
  }
};

const deleteChat = async (friend) => {
  if (!friend || !currentUser) return;

  if (activeTab === 'Requests') {
    declineRequest(friend);
    return;
  }

  // instant UI: close the menu and drop the row right away
  setMenuVisible(false);
  setFriends((prev) => prev.filter((item) => item.id !== friend.id));

  try {
    await setDoc(doc(db, 'deletedChats', currentUser.uid, 'users', friend.userId), {
      deletedAt: serverTimestamp(),
    });
    await deleteDoc(doc(db, 'userChats', currentUser.uid, 'friends', friend.id));
  } catch (error) {
    console.log(error);
    // failed => put the row back
    setFriends((prev) => (prev.some((i) => i.id === friend.id) ? prev : [friend, ...prev]));
  }
};

const deleteHiddenChat = async (friend) => {
  if (!friend || !currentUser) return;

  setMenuVisible(false);
  setHiddenFriends((prev) => prev.filter((item) => item.id !== friend.id));

  try {
    await deleteDoc(doc(db, 'userChats', currentUser.uid, 'hiddenFriends', friend.id));
  } catch (error) {
    console.log(error);
  }
};

const hideChat = async (friend) => {
  if (!friend || !currentUser) return;

  setMenuVisible(false);
  setFriends((prev) => prev.filter((item) => item.id !== friend.id));

  try {
    // do not save the temporary UI-only fields into Firestore
    const { id, level, verified, verifiedColor, ...saved } = friend;

    await setDoc(doc(db, 'userChats', currentUser.uid, 'hiddenFriends', friend.id), saved);
    await deleteDoc(doc(db, 'userChats', currentUser.uid, 'friends', friend.id));
  } catch (error) {
    console.log(error);
    setFriends((prev) => (prev.some((i) => i.id === friend.id) ? prev : [friend, ...prev]));
  }
};

// ---- chat list (virtualized) ----
const renderFriendRow = useCallback(
  ({ item }) => <FriendRow item={item} onOpen={openChat} onMenu={openFriendMenu} showPreview />,
  [openChat, openFriendMenu]
);
const renderHiddenRow = useCallback(
  ({ item }) => <FriendRow item={item} onMenu={openFriendMenu} />,
  [openFriendMenu]
);

const listData =
  activeTab === 'Friends'
    ? friendsInitialLoading
      ? EMPTY_LIST
      : friends
    : activeTab === 'Hid.Sms'
    ? hiddenFriends
    : activeTab === 'Requests'
    ? requests
    : EMPTY_LIST;

const listEmpty = useMemo(
  () =>
    activeTab === 'Friends' && friendsInitialLoading ? (
      <View style={{ paddingVertical: 28, alignItems: 'center' }}>
        <ActivityIndicator size="small" color="#aaa" />
        <Text style={{ color: '#aaa', fontSize: 14, marginTop: 8 }}>Loading chats...</Text>
      </View>
    ) : activeTab === 'Requests' ? (
      <View style={{ paddingVertical: 28, alignItems: 'center' }}>
        <Text style={{ color: '#aaa', fontSize: 14 }}>No message requests</Text>
      </View>
    ) : null,
  [activeTab, friendsInitialLoading]
);

const listFooter = useMemo(
  () =>
    activeTab === 'Friends' && friendsLoadingMore ? (
      <View style={{ paddingVertical: 18, alignItems: 'center' }}>
        <Text style={{ color: '#aaa', fontSize: 14 }}>Loading more chats...</Text>
      </View>
    ) : null,
  [activeTab, friendsLoadingMore]
);

// ---- notification popup actions ----
const notifOpenHome = useCallback(
  (videoId) => {
    setModalVisible(false);
    router.push({ pathname: '/', params: { videoId } });
  },
  [router]
);

const notifOpenProfile = useCallback(
  (senderId) => {
    setModalVisible(false);
    router.push({ pathname: '/userProfile', params: { userId: senderId } });
  },
  [router]
);

const notifOpenVideo = useCallback(
  async (videoId) => {
    if (!videoId) return;
    try {
      const videoSnap = await getDoc(doc(db, 'all_videos', videoId));
      if (!videoSnap.exists()) return;

      const videoData = { id: videoSnap.id, ...videoSnap.data() };
      setModalVisible(false);

      setTimeout(() => {
        router.push({
          pathname: '/videoedite',
          params: {
            videos: JSON.stringify([videoData]),
            index: '0',
            userId: auth.currentUser?.uid || '',
          },
        });
      }, 300);
    } catch (error) {
      console.log('OPEN VIDEO ERROR =', error);
    }
  },
  [router]
);

const renderNotifRow = useCallback(
  ({ item }) => (
    <NotificationRow
      item={item}
      onOpenHome={notifOpenHome}
      onOpenProfile={notifOpenProfile}
      onOpenVideo={notifOpenVideo}
    />
  ),
  [notifOpenHome, notifOpenProfile, notifOpenVideo]
);

const notifEmpty = (
  <View style={{ marginTop: 100, alignItems: 'center' }}>
    <Ionicons name="notifications-outline" size={60} color="#555" />
    <Text style={{ color: '#aaa', marginTop: 10 }}>No Notifications</Text>
  </View>
);



const getModalTitle = () => {


  if (selectedType === 'follow') return 'Followers';
  if (selectedType === 'like') return 'Likes';
  if (selectedType === 'comment') return 'Comments';

  return 'Notifications';
};


  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />

      {/* HEADER WITH ONLY TITLE & PROFILE LOGO (BACK BTN REMOVED) */}
      <View style={styles.header}>
        {/* Left Side Empty Space Balance maintain karne ke liye */}
        <TouchableOpacity
          onPress={openNotifications}
          style={styles.bellBtn}
          activeOpacity={0.7}
          disabled={!currentUser}
        >
          <Ionicons name="notifications-outline" size={27} color="#fff" />
          {totalUnread > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>
                {totalUnread > 99 ? '99+' : totalUnread}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>Activity</Text>
        
        {/* PROFILE LOGO */}
        <TouchableOpacity 
          onPress={() => router.push('/profile')} 
          style={styles.profileLogoContainer}
          activeOpacity={0.7}
        >
          <Image 
            key={userProfilePhoto} // Image component force re-render parameter
            source={{ uri: userProfilePhoto }} 
            style={styles.headerProfileLogo} 
            resizeMode="cover"
          />
        </TouchableOpacity>
      </View>

      {/* CONDITIONAL RENDERING */}
      {currentUser ? (
        <>
          {/* STORIES */}
          <View style={styles.badgeWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.badgeScroll}
            >
              {/* MY STORY */}
              <View style={styles.storyItem}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() =>
                    storyGroups.ownGroup ? openStoryGroup(0) : addStory()
                  }
                >
                  <View
                    style={[
                      styles.storyRing,
                      storyGroups.ownGroup
                        ? storyGroups.ownGroup.allSeen
                          ? styles.storyRingSeen
                          : styles.storyRingNew
                        : styles.storyRingEmpty,
                    ]}
                  >
                    <Image
                      source={{ uri: userProfilePhoto }}
                      style={styles.storyAvatar}
                    />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.storyPlus}
                  onPress={addStory}
                  activeOpacity={0.8}
                >
                  {storyUploading ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Ionicons name="add" size={16} color="#000" />
                  )}
                </TouchableOpacity>

                <Text numberOfLines={1} style={styles.storyName}>
                  Your story
                </Text>
              </View>

              {/* FRIENDS STORIES */}
              {storyGroups.friendGroups.map((g, i) => (
                <TouchableOpacity
                  key={g.userId}
                  style={styles.storyItem}
                  activeOpacity={0.8}
                  onPress={() =>
                    openStoryGroup(storyGroups.ownGroup ? i + 1 : i)
                  }
                >
                  <View
                    style={[
                      styles.storyRing,
                      g.allSeen ? styles.storyRingSeen : styles.storyRingNew,
                    ]}
                  >
                    <Image
                      source={{ uri: g.photo }}
                      style={styles.storyAvatar}
                    />
                  </View>
                  <Text numberOfLines={1} style={styles.storyName}>
                    {g.username}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* TABS INDICATOR BAR */}
          <View style={styles.tabsContainer}>
            {tabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity 
                  key={tab} 
                  style={styles.tabItemButton}
                  onPress={() => setActiveTab(tab)}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.tabLabelText, isActive && styles.activeTabLabel]}>
                      {tab}
                    </Text>
                    {tabCounts[tab] > 0 && (
                      <View style={styles.tabBadge}>
                        <Text style={styles.tabBadgeText}>
                          {tabCounts[tab] > 99 ? '99+' : tabCounts[tab]}
                        </Text>
                      </View>
                    )}
                  </View>
                  {isActive && <View style={styles.activeLineIndicator} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* MAIN CONTENT AREA */}

<FlatList
  data={listData}
  extraData={activeTab}
  keyExtractor={keyExtractorById}
  renderItem={activeTab === 'Hid.Sms' ? renderHiddenRow : renderFriendRow}
  showsVerticalScrollIndicator={false}
  contentContainerStyle={styles.listContent}
  onEndReached={activeTab === 'Friends' ? loadMoreFriends : undefined}
  onEndReachedThreshold={0.6}
  initialNumToRender={12}
  maxToRenderPerBatch={8}
  windowSize={7}
  removeClippedSubviews={Platform.OS === 'android'}
  ListEmptyComponent={listEmpty}
  ListFooterComponent={listFooter}
/>


        </>
      ) : (
        /* UN-AUTHENTICATED LOGIN PROMPT SCREEN */
        <View style={styles.loginRequiredContainer}>
          <View style={styles.lockIconCircle}>
            <Ionicons name="lock-closed-outline" size={46} color="#ff2d55" />
          </View>
          <Text style={styles.loginMainTitle}>Login Required</Text>
          <Text style={styles.loginSubTitle}>
            Please log in to your account to view activity updates, sync messages and access exclusive chat sections.
          </Text>
          
          <TouchableOpacity 
            style={styles.loginActionBtn}
            activeOpacity={0.8}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.loginActionText}>Log In to Continue</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* BOTTOM NAVBAR */}
      <View style={styles.bottomSection}>
        <View style={styles.bottomNav}>
          
          {/* HOME */}
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/')}>
            <Ionicons name="home-outline" size={26} color={getIconColor('/')} />
          </TouchableOpacity>

          {/* SEARCH */}
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/explore')}>
            <Ionicons name="search" size={26} color={getIconColor('/explore')} />
          </TouchableOpacity>

          {/* PLUS */}
          <TouchableOpacity style={styles.navItem} onPress={() => router.push('/camera')}>
            <View style={styles.plusBtn}>
              <Text style={styles.plusText}>+</Text>
            </View>
          </TouchableOpacity>

          {/* MESSAGE */}
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/messages')}>
            <Ionicons name="chatbubble-ellipses" size={26} color={getIconColor('/messages')} />
          </TouchableOpacity>

          {/* PROFILE */}
         <TouchableOpacity
           style={styles.navItem}
           onPress={() => {
             const user = auth.currentUser;
         
             if (!user) {
               router.push('/login');
               return;
             }
         
             router.replace('/profile');
           }}
         >
           <Ionicons
             name="person-outline"
             size={26}
             color={getIconColor('/profile')}
           />
         </TouchableOpacity>

        </View>
      </View>



<Modal
  visible={modalVisible}
  animationType="slide"
  transparent={true}
  onRequestClose={() => setModalVisible(false)}
>
  <View
    style={{
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
    }}
  >
    <View
      style={{
        width: '92%',
        height: '75%',
        backgroundColor: '#111',
        borderRadius: 20,
        overflow: 'hidden',
      }}
    >

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 15,
          borderBottomWidth: 1,
          borderBottomColor: '#222',
        }}
      >
        <Text
          style={{
            color: '#fff',
            fontSize: 20,
            fontWeight: 'bold',
          }}
        >
          {getModalTitle()}
        </Text>

        <TouchableOpacity
          onPress={() => setModalVisible(false)}
        >
          <Ionicons
            name="close"
            size={28}
            color="#fff"
          />
        </TouchableOpacity>
      </View>

      {/* Follower / Like / Comment tabs */}
      <View
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: '#222',
        }}
      >
        {topBadges.map((b) => (
          <TouchableOpacity
            key={b.id}
            onPress={() => switchNotifTab(b.id)}
            activeOpacity={0.8}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 12,
              borderBottomWidth: 2,
              borderBottomColor:
                selectedType === b.id ? '#f1c40f' : 'transparent',
            }}
          >
            <View>
              <Ionicons name={b.icon} size={22} color={b.color} />
              {b.count > 0 && (
                <View style={styles.tabCount}>
                  <Text style={styles.tabCountText}>
                    {b.count > 99 ? '99+' : b.count}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={{
                color: selectedType === b.id ? '#fff' : '#777',
                fontSize: 12,
                fontWeight: 'bold',
                marginTop: 3,
              }}
            >
              {b.title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Notifications */}
      <FlatList
        style={{ flex: 1 }}
        data={filteredNotifications}
        keyExtractor={keyExtractorById}
        renderItem={renderNotifRow}
        ListEmptyComponent={notifEmpty}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={7}
        showsVerticalScrollIndicator={false}
      />

    </View>
  </View>
</Modal>



<Modal
  visible={menuVisible}
  transparent
  animationType="fade"
  statusBarTranslucent
  onRequestClose={closeFriendMenu}
>

  <TouchableOpacity
    style={{
      flex:1,
      backgroundColor:"rgba(0,0,0,0.6)",
      justifyContent:"center",
      alignItems:"center",
    }}
    activeOpacity={1}
    onPress={() => setMenuVisible(false)}
  >

    <View
      style={{
        width:250,
        backgroundColor:"#111",
        borderRadius:15,
        padding:15,
      }}
    >


     <TouchableOpacity
  onPress={() => {

    if (activeTab === "Hid.Sms") {

      deleteHiddenChat(
        selectedFriend
      );

    } else {

      deleteChat(
        selectedFriend
      );

    }

  }}
>


        <Text
          style={{
            color:"red",
            fontSize:18,
            paddingVertical:15,
          }}
        >
          {activeTab === "Requests" ? "Decline Request" : "Delete Chat"}
        </Text>

      </TouchableOpacity>



{activeTab === "Friends" && (
  <>
    <View
      style={{
        height:1,
        backgroundColor:"#333",
      }}
    />

    <TouchableOpacity
      onPress={() =>
        hideChat(
          selectedFriend
        )
      }
    >
      <Text
        style={{
          color:"#fff",
          fontSize:18,
          paddingVertical:15,
        }}
      >
        Hide SMS
      </Text>
    </TouchableOpacity>
  </>
)}
     



        

    </View>

  </TouchableOpacity>

</Modal>




{/* STORY VIEWER */}
<Modal
  visible={!!viewer && !!currentStory}
  animationType="fade"
  onRequestClose={closeViewer}
  statusBarTranslucent
>
  <View style={styles.viewerContainer}>
    {currentStory && currentGroup && (
      <>
        {(() => {
          const win = Dimensions.get('window');
          const bw = Math.min(win.width, (win.height * 9) / 16);
          const bh = (bw * 16) / 9;
          const fit = currentStory.fit === 'contain' ? 'contain' : 'cover';
          return (
            <View
              style={{
                position: 'absolute',
                left: (win.width - bw) / 2,
                top: (win.height - bh) / 2,
                width: bw,
                height: bh,
                overflow: 'hidden',
                backgroundColor: '#000',
              }}
            >
              {currentStory.mediaType === 'video' ? (
                <StoryVideo
                  key={currentStory.id}
                  uri={currentStory.mediaUrl}
                  paused={storyPaused}
                  fit={fit}
                />
              ) : (
                <Image
                  source={{ uri: currentStory.mediaUrl }}
                  style={StyleSheet.absoluteFillObject}
                  resizeMode={fit}
                />
              )}

              <View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFillObject,
                  { backgroundColor: STORY_FILTER_TINTS[currentStory.filter || 'none'] || 'transparent' },
                ]}
              />

              {(currentStory.overlays || []).map((o, i) => (
                <StoryOverlayStatic key={i} item={o} boxW={bw} boxH={bh} />
              ))}
            </View>
          );
        })()}

        {/* Left tap = pichhli story, right tap = agli story */}
        <View style={styles.viewerTapRow}>
          <TouchableOpacity
            style={{ flex: 3 }}
            activeOpacity={1}
            onPress={goPrevStory}
          />
          <TouchableOpacity
            style={{ flex: 7 }}
            activeOpacity={1}
            onPress={goNextStory}
          />
        </View>

        <View style={styles.viewerTop} pointerEvents="box-none">
          <View style={styles.viewerBars}>
            {currentGroup.items.map((st, i) => (
              <View key={st.id} style={styles.viewerBarTrack}>
                {i < viewer.storyIndex ? (
                  <View style={[styles.viewerBarFill, { width: '100%' }]} />
                ) : i === viewer.storyIndex ? (
                  <Animated.View
                    style={[
                      styles.viewerBarFill,
                      {
                        width: storyProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        }),
                      },
                    ]}
                  />
                ) : null}
              </View>
            ))}
          </View>

          <View style={styles.viewerHeaderRow}>
            <Image
              source={{ uri: currentGroup.photo || DEFAULT_AVATAR }}
              style={styles.viewerAvatar}
            />

            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.viewerName} numberOfLines={1}>
                {currentGroup.username}
              </Text>
              <Text style={styles.viewerTime}>
                {timeAgo(toMillis(currentStory.createdAt))}
              </Text>
            </View>

            {currentGroup.isOwn && (
              <TouchableOpacity
                onPress={() => deleteMyStory(currentStory)}
                style={{ padding: 6 }}
              >
                <Ionicons name="trash-outline" size={24} color="#fff" />
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={closeViewer} style={{ padding: 6 }}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {replySentMsg ? (
          <View style={styles.viewerToast} pointerEvents="none">
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>{replySentMsg}</Text>
          </View>
        ) : null}

        {currentGroup.isOwn ? (
          <>
            {showReplies && (
              <View style={styles.viewerRepliesPanel}>
                <ScrollView>
                  {replies.length === 0 ? (
                    <Text style={{ color: '#aaa', textAlign: 'center', padding: 14 }}>No replies yet</Text>
                  ) : (
                    replies.map((r) => (
                      <View key={r.id} style={styles.viewerReplyRow}>
                        <Image source={{ uri: r.photo || DEFAULT_AVATAR }} style={styles.viewerReplyAvatar} />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={{ color: '#aaa', fontSize: 12 }}>{r.username}</Text>
                          <Text style={{ color: '#fff', fontSize: r.type === 'emoji' ? 26 : 15 }}>{r.text}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            )}
            <View style={styles.viewerBottom}>
              <Ionicons name="eye-outline" size={20} color="#fff" />
              <Text style={styles.viewerCountText}>{viewerCount}</Text>
              <Ionicons name="heart" size={20} color="#ff3b5c" style={{ marginLeft: 16 }} />
              <Text style={styles.viewerCountText}>{likeCount}</Text>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 16 }}
                onPress={() => {
                  const next = !showReplies;
                  setShowReplies(next);
                  setStoryPaused(next);
                }}
              >
                <Ionicons name="chatbubble-outline" size={20} color="#fff" />
                <Text style={styles.viewerCountText}>{replies.length}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={[styles.viewerReplyWrap, { bottom: kbHeight }]}>
            <View style={styles.viewerEmojiRow}>
              {['❤️', '😂', '😮', '😢', '🔥', '👏'].map((em) => (
                <TouchableOpacity key={em} onPress={() => sendStoryReply(em, 'emoji')} style={{ padding: 6 }}>
                  <Text style={{ fontSize: 28 }}>{em}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.viewerInputRow}>
              <TextInput
                style={styles.viewerInput}
                value={replyText}
                onChangeText={setReplyText}
                placeholder="Send message..."
                placeholderTextColor="#bbb"
                maxLength={500}
                onFocus={() => setStoryPaused(true)}
                onBlur={() => setStoryPaused(false)}
                onSubmitEditing={() => sendStoryReply(replyText, 'text')}
                returnKeyType="send"
              />
              {replyText.trim().length > 0 ? (
                <TouchableOpacity onPress={() => sendStoryReply(replyText, 'text')} style={{ padding: 8 }}>
                  <Ionicons name="send" size={26} color="#3498db" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={toggleStoryLike} style={{ padding: 8 }}>
                  <Ionicons name={liked ? 'heart' : 'heart-outline'} size={30} color={liked ? '#ff3b5c' : '#fff'} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </>
    )}
  </View>
</Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' }, // Pure Black Background
  
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 35 : 30, 
    paddingBottom: 15,
    backgroundColor: '#000',
    borderBottomWidth: 0.5,
    borderBottomColor: '#222' // Dark subtle border
  },
  headerLeftPlaceholder: {
    width: 60,
  },
  headerTitle: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: '#fff', // White Text
    textAlign: 'center', 
    flex: 1,
  },
  
  profileLogoContainer: {
    width: 60,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerProfileLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#444',
    backgroundColor: '#111',
  },
  
  badgeWrapper: { 
    marginTop: 7, 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: '#222' 
  },
  badgeScroll: { paddingHorizontal: 16, alignItems: 'center' },
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111', // Dark badge card
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 25,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  badgeIconBox: { marginRight: 6, justifyContent: 'center', alignItems: 'center' },
  badgeText: { fontSize: 15, fontWeight: 'bold', color: '#fff' }, // White badge text

  tabsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    height: 50,
  },
  tabItemButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  tabLabelText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#555', // Inactive Tab Text Grey
  },
  activeTabLabel: {
    color: '#fff', // Active Tab Text White
  },
  activeLineIndicator: {
    position: 'absolute',
    bottom: 0,
    width: '75%',
    height: 3,
    backgroundColor: '#b8943a',
    borderRadius: 2,
  },

  listContent: { paddingHorizontal: 18, paddingTop: 40, paddingBottom: 130 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyMainText: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginTop: 15 },
  emptySubText: { fontSize: 14, color: '#aaa', marginTop: 5, textAlign: 'center' },

  loginRequiredContainer: {
    flex: 0.72,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  lockIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#1a0d10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#3a1a20'
  },
  loginMainTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  loginSubTitle: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  loginActionBtn: {
    backgroundColor: '#3498db',
    paddingHorizontal: 44,
    paddingVertical: 14,
    borderRadius: 25,
    elevation: 2,
    shadowColor: '#3498db',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  loginActionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  bottomSection: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#000',
    paddingBottom: Platform.OS === 'ios' ? 40 : 25,
    paddingTop: 5,
    borderTopWidth: 0.5,
    borderTopColor: '#222'
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 90,
  },
  navItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  plusBtn: {
    width: 48,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f1c40f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusText: { fontSize: 28, fontWeight: 'bold', color: '#000', marginTop: -4 },

countBadge: {
  position: 'absolute',
  top: -0,
  right: -5,
  backgroundColor: '#ff00aa',
  minWidth: 20,
  height: 20,
  borderRadius: 14,
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 100,
},

countText: {
  color: '#fff',
  fontSize: 15,
  fontWeight: 'bold',
},

verifiedBadge: {
  marginLeft: 6,
  justifyContent: "center",
  alignItems: "center",
},

verifiedTick: {
  position: "absolute",
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







bellBtn: {
  width: 60,
  height: 40,
  justifyContent: 'center',
  alignItems: 'flex-start',
},
bellBadge: {
  position: 'absolute',
  top: 0,
  left: 16,
  backgroundColor: '#ff00aa',
  minWidth: 18,
  height: 18,
  borderRadius: 9,
  paddingHorizontal: 4,
  justifyContent: 'center',
  alignItems: 'center',
},
bellBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

tabCount: {
  position: 'absolute',
  top: -6,
  right: -14,
  backgroundColor: '#ff00aa',
  minWidth: 16,
  height: 16,
  borderRadius: 8,
  paddingHorizontal: 3,
  justifyContent: 'center',
  alignItems: 'center',
},
tabCountText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

storyItem: { width: 76, alignItems: 'center', marginRight: 6 },
storyRing: {
  width: 68,
  height: 68,
  borderRadius: 34,
  borderWidth: 3,
  justifyContent: 'center',
  alignItems: 'center',
},
storyRingNew: { borderColor: '#f1c40f' },
storyRingSeen: { borderColor: '#444' },
storyRingEmpty: { borderColor: '#222' },
storyAvatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#111' },
storyPlus: {
  position: 'absolute',
  top: 46,
  right: 4,
  width: 22,
  height: 22,
  borderRadius: 11,
  backgroundColor: '#f1c40f',
  borderWidth: 2,
  borderColor: '#000',
  justifyContent: 'center',
  alignItems: 'center',
},
storyName: { color: '#ddd', fontSize: 12, marginTop: 6, maxWidth: 70 },

viewerContainer: { flex: 1, backgroundColor: '#000' },
viewerImage: { ...StyleSheet.absoluteFillObject },
viewerTapRow: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
viewerTop: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  paddingTop: Platform.OS === 'android' ? 40 : 55,
  paddingHorizontal: 10,
},
viewerBars: { flexDirection: 'row', marginBottom: 10 },
viewerBarTrack: {
  flex: 1,
  height: 3,
  borderRadius: 2,
  backgroundColor: 'rgba(255,255,255,0.3)',
  marginHorizontal: 2,
  overflow: 'hidden',
},
viewerBarFill: { height: 3, backgroundColor: '#fff' },
viewerHeaderRow: { flexDirection: 'row', alignItems: 'center' },
viewerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#111' },
viewerName: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
viewerTime: { color: '#ccc', fontSize: 12 },
viewerBottom: {
  position: 'absolute',
  bottom: 40,
  left: 20,
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: 'rgba(0,0,0,0.5)',
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 16,
},
viewerCountText: { color: '#fff', fontWeight: 'bold', marginLeft: 6 },
viewerToast: {
  position: 'absolute', top: '45%', alignSelf: 'center',
  backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20,
},
viewerReplyWrap: { position: 'absolute', left: 0, right: 0, paddingBottom: 24, paddingHorizontal: 12 },
viewerEmojiRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
viewerInputRow: {
  flexDirection: 'row', alignItems: 'center',
  borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 26,
  paddingLeft: 16, paddingRight: 4, backgroundColor: 'rgba(0,0,0,0.35)',
},
viewerInput: { flex: 1, color: '#fff', fontSize: 15, height: 46 },
viewerRepliesPanel: {
  position: 'absolute', left: 12, right: 12, bottom: 90, maxHeight: 260,
  backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 14, padding: 8,
},
viewerReplyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
viewerReplyAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#111' },


// ---- tab count badges ----
tabBadge: {
  backgroundColor: '#ff00aa',
  minWidth: 18,
  height: 18,
  borderRadius: 9,
  paddingHorizontal: 5,
  marginLeft: 5,
  justifyContent: 'center',
  alignItems: 'center',
},
tabBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

// ---- chat list rows ----
chatRow: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingVertical: 12,
  borderBottomWidth: 1,
  borderBottomColor: '#222',
},
chatAvatar: { width: 55, height: 55, borderRadius: 28, backgroundColor: '#111' },
chatInfo: { flex: 1, marginLeft: 12 },
chatNameRow: { flexDirection: 'row', alignItems: 'center' },
chatName: { color: '#fff', fontSize: 16, fontWeight: 'bold', flexShrink: 1 },
chatBottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
chatLast: { color: '#aaa', flex: 1, flexShrink: 1 },
levelText: { fontSize: 11, fontWeight: 'bold', marginLeft: 3 },
newPill: {
  backgroundColor: '#00C853',
  paddingHorizontal: 8,
  paddingVertical: 2,
  borderRadius: 20,
  marginLeft: 8,
},
newPillText: { color: '#fff', fontWeight: 'bold', fontSize: 11 },
unreadBadge: {
  backgroundColor: '#00c853',
  minWidth: 22,
  height: 22,
  borderRadius: 11,
  justifyContent: 'center',
  alignItems: 'center',
  marginLeft: 6,
  paddingHorizontal: 6,
},
unreadText: { color: '#fff', fontWeight: 'bold' },

// ---- notification rows ----
notifRow: {
  flexDirection: 'row',
  alignItems: 'center',
  padding: 15,
  borderBottomWidth: 0.5,
  borderBottomColor: '#222',
},
notifAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#111' },
notifBody: { marginLeft: 10, flex: 1 },
notifName: { color: '#fff', fontWeight: 'bold' },
notifThumb: { width: 55, height: 75, borderRadius: 8 },
notifAction: { color: '#aaa' },
notifText: { color: '#fff', marginTop: 4 },
notifCaption: { color: '#FFD700', marginTop: 3 },

});
