import { notifyVideoLike } from "../../utils/pushNotify";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  FlatList,
  Keyboard,
  Platform,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Image from '../../components/FastImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Ionicons,
  MaterialCommunityIcons,
} from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '../firebaseConfig';
import { callApi } from '../../utils/api';
import { videoLink } from '../../utils/shareLinks';

import { getAuth, onAuthStateChanged } from 'firebase/auth';
import UserTick, { isFaceVerified } from '../../components/UserTick';

import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';

// ======================================================
// CONSTANTS (module level = ek baar bante hain, re-render me nahi)
// ======================================================
const { height, width } = Dimensions.get('screen');

// Ek hi jagah se item height: videoContainer, getItemLayout aur
// snapToInterval teeno same value use karte hain (pehle 77.2 vs 81.2
// ka mismatch tha, isse scroll/snap me jitter aata tha).
const ITEM_HEIGHT = height - 77.2;

const auth = getAuth();

// ======================================================
// LIVE NAAM + DP
// Video / comment / reply docs me username aur dp ki COPY save hoti hai,
// isliye profile edit ke baad purane docs me purana naam/dp reh jata tha.
// Yahan hum `users` collection se asli (latest) naam + dp laate hain
// (30 ids per query) aur screen par wahi dikhate hain.
// ======================================================
const fetchLiveUsers = async (ids) => {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const out = {};
  const parts = [];

  for (let i = 0; i < unique.length; i += 30) {
    parts.push(unique.slice(i, i + 30));
  }

  const put = (id, data) => {
    out[id] = { username: data.username, profile: data.profileImg };
  };

  await Promise.all(
    parts.map(async (part) => {
      try {
        const snap = await getDocs(
          query(collection(db, 'users'), where(documentId(), 'in', part))
        );
        snap.forEach((d) => put(d.id, d.data()));
      } catch (e) {
        const snaps = await Promise.all(
          part.map((id) => getDoc(doc(db, 'users', id)).catch(() => null))
        );
        snaps.forEach((d) => d && d.exists() && put(d.id, d.data()));
      }
    })
  );

  return out;
};

// Naam/dp same ho to wahi object wapas (memo re-render na ho)
const withLiveIdentity = (item, live, photoKey) => {
  const u = live[item.userId];
  if (!u) return item;

  const username = u.username || item.username;
  const photo = u.profile || item[photoKey];

  if (username === item.username && photo === item[photoKey]) return item;

  return { ...item, username, [photoKey]: photo };
};

const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

// Count ko short form me dikhao (index.tsx jaisa): 813 -> 813, 76000 -> 76K, 1200000 -> 1.2M
const formatCount = (n) => {
  const num = Number(n) || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(num >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(num >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(num);
};
const STAR_LOGO = require('../../assets/star-logo.png');
const APP_LOGO = require('../../assets/logo.png');

const STAR_OPTIONS = [1, 3, 10];

// Ek baar me kitne comments live load honge (zyada = slow).
const COMMENTS_LIMIT = 50;

const DOUBLE_TAP_MS = 260;

// Kitne aage ke videos ke thumbnails prefetch honge
const PREFETCH_AHEAD = 3;

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 70 };

const keyExtractor = (item) => item.id;

const getItemLayout = (_, i) => ({
  length: ITEM_HEIGHT,
  offset: ITEM_HEIGHT * i,
  index: i,
});

const createAnims = () => {
  const rotate = new Animated.Value(0);
  const starRotate = new Animated.Value(0);
  const starTilt = new Animated.Value(0);

  return {
    rotate,
    rotateDeg: rotate.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    }),
    text: new Animated.Value(0),

    starScale: new Animated.Value(0),
    starOpacity: new Animated.Value(0),
    starJump: new Animated.Value(0),
    starRotate,
    starTilt,
    starRotateZ: starRotate.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '720deg'],
    }),
    starRotateY: starTilt.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: ['0deg', '180deg', '360deg'],
    }),
    starRotateX: starTilt.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: ['0deg', '25deg', '0deg'],
    }),
  };
};

// ======================================================
// VERIFIED BADGE
// ======================================================
const VerifiedBadge = React.memo(
  ({ color, verified = true, face = false, uid, box = 18, icon = 18, tick = 10, top = 4.6, left = 4.2 }) =>
    !verified ? (
      <UserTick uid={uid} faceVerified={face || undefined} size={icon} />
    ) : (
    <View
      style={{
        marginLeft: 5,
        width: box,
        height: box,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      <MaterialCommunityIcons
        name="check-decagram"
        size={icon}
        color={color === 'yellow' ? '#FFD700' : '#ffffff'}
      />
      <Ionicons
        name="checkmark"
        size={tick}
        color="#131212"
        style={{ position: 'absolute', top, left }}
      />
    </View>
  )
);

// ======================================================
// VIDEO PLAYER
// - Native player SIRF active + next video ke liye banta hai
//   (baaki items me sirf poster image => scroll me hitch / memory nahi)
// - useCaching: true => video disk pe cache hota hai, loop / dobara play
//   pe network nahi lagta => rukna band
// - Thumbnail poster pehle frame tak dikhta hai => black flash nahi
// ======================================================
const PlayerView = React.memo(
  ({ uri, thumbnail, active, paused, focused }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [ready, setReady] = useState(false);

    // Same object => player dobara nahi banta
    const source = useMemo(() => ({ uri, useCaching: true }), [uri]);

    const player = useVideoPlayer(source, (p) => {
      p.loop = true;
      p.muted = true;

      try {
        p.bufferOptions = {
          preferredForwardBufferDuration: 10,
          maxBufferBytes: 16 * 1024 * 1024,
          minBufferForPlayback: 0.5,
          prioritizeTimeOverSizeThreshold: true,
        };
      } catch (error) {
        console.log('BUFFER OPTIONS ERROR =', error);
      }
    });

    // Active / paused / inactive control
    useEffect(() => {
      if (!player) return;

      try {
        if (active && focused && !paused) {
          setHasError(false);
          // Preloaded video already ready hai to loader dikhane ki zarurat nahi
          setIsLoading(player.status !== 'readyToPlay');
          player.muted = false;
          player.play();
        } else {
          setIsLoading(false);
          if (!active) setHasError(false);
          player.pause();
          // Tap-pause pe unmuted rehta hai; inactive / screen se bahar => mute
          if (!active || !focused) player.muted = true;
        }
      } catch (error) {
        console.log('VIDEO CONTROL ERROR =', error);
        if (active) {
          setIsLoading(false);
          setHasError(true);
        }
      }
    }, [active, focused, paused, player]);

    // Loading / playing status
    useEffect(() => {
      if (!player) return;

      const statusSub = player.addListener('statusChange', ({ status, error }) => {
        if (!active) {
          setIsLoading(false);
          return;
        }

        if (status === 'loading') {
          setIsLoading(true);
        } else if (status === 'readyToPlay') {
          setIsLoading(false);
          setHasError(false);
        } else if (status === 'error') {
          console.log('VIDEO ERROR =', error);
          setIsLoading(false);
          setHasError(true);
        }
      });

      const playingSub = player.addListener('playingChange', ({ isPlaying }) => {
        if (isPlaying) {
          setReady(true);
          if (active) {
            setIsLoading(false);
            setHasError(false);
          }
        }
      });

      return () => {
        statusSub.remove();
        playingSub.remove();
      };
    }, [player, active]);

    const onFirstFrameRender = useCallback(() => setReady(true), []);

    return (
      <View style={styles.playerWrap}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="cover"
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
          showsTimecodes={false}
          onFirstFrameRender={onFirstFrameRender}
        />

        {!ready && !!thumbnail && (
          <Image
            source={{ uri: thumbnail }}
            style={[styles.video, styles.poster]}
            resizeMode="cover"
          />
        )}

        {active && isLoading && !hasError && (
          <View style={styles.videoLoading} pointerEvents="none">
            <ActivityIndicator size="large" color="#FFD700" />
          </View>
        )}

        {active && hasError && (
          <View style={styles.videoError} pointerEvents="none">
            <Ionicons name="cloud-offline-outline" size={42} color="#fff" />
            <Text style={styles.loadingText}>Video load nahi ho pa raha</Text>
          </View>
        )}
      </View>
    );
  }
);

const VideoPlayerItem = React.memo(
  ({ uri, thumbnail, active, preload, paused, focused }) => {
    // Door ke items: koi native player nahi, sirf poster
    if (!active && !preload) {
      return (
        <View style={styles.playerWrap}>
          {!!thumbnail && (
            <Image
              source={{ uri: thumbnail }}
              style={[styles.video, styles.poster]}
              resizeMode="cover"
            />
          )}
        </View>
      );
    }

    return (
      <PlayerView
        uri={uri}
        thumbnail={thumbnail}
        active={active}
        paused={paused}
        focused={focused}
      />
    );
  }
);

// ======================================================
// STAR BURST ANIMATION
// ======================================================
const StarBurst = React.memo(({ anims, count }) => (
  <View style={styles.starBurst} pointerEvents="none">
    {/* Background transparent -- sirf star + uske upar count */}
    <Animated.View
      style={{
        width: 150,
        height: 150,
        justifyContent: 'center',
        alignItems: 'center',
        opacity: anims.starOpacity,
        transform: [{ scale: anims.starScale }],
      }}
    >
      <Animated.Image
        source={STAR_LOGO}
        style={{ width: 150, height: 150, resizeMode: 'contain' }}
      />

      {/* Chamak (shine): safed flash, starRotate yahan shine value hai */}
      <Animated.Image
        source={STAR_LOGO}
        style={{
          position: 'absolute',
          width: 150,
          height: 150,
          resizeMode: 'contain',
          tintColor: '#ffffff',
          opacity: anims.starRotate.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 0.65],
          }),
        }}
      />

      {/* Star ke upar count: 1 / 3 / 10 */}
      <Text
        style={{
          position: 'absolute',
          fontSize: 44,
          fontWeight: '900',
          color: '#ffffff',
          textShadowColor: 'rgba(0,0,0,0.55)',
          textShadowOffset: { width: 0, height: 2 },
          textShadowRadius: 6,
        }}
      >
        {count}
      </Text>
    </Animated.View>
  </View>
));

// ======================================================
// ONE VIDEO ITEM (memo => sirf wahi item re-render hota hai jo badla)
// ======================================================
const VideoItem = React.memo(
  ({ item, isActive, isNext, isPaused, isFocused, isLiked, showHeart, showStar, starCount, actions, anims }) => (
    <View style={styles.videoContainer}>
      <TouchableOpacity
        activeOpacity={1}
        style={StyleSheet.absoluteFill}
        onPress={() => actions.onPress(item.id)}
      >
        <VideoPlayerItem
          uri={item.videoUrl || item.video}
          thumbnail={item.thumbnail}
          active={isActive}
          preload={isNext}
          paused={isPaused}
          focused={isFocused}
        />
      </TouchableOpacity>

      {showHeart && (
        <View style={styles.heartPopup} pointerEvents="none">
          <Ionicons name="heart" size={140} color="#ff004f" />
        </View>
      )}

      {showStar && <StarBurst anims={anims} count={starCount} />}

      {/* Side buttons (index.tsx jaisa design + size) */}
      <View style={styles.sideBar}>
        <View style={[styles.iconBox, { marginBottom: 20 }]}>
          <TouchableOpacity onPress={() => actions.onProfile(item.userId)}>
            <Image
              source={{ uri: item.profile || DEFAULT_AVATAR }}
              style={styles.profileImage}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.iconBox} onPress={() => actions.onLike(item.id)}>
          <Ionicons
            name="heart"
            size={44}
            color={isLiked ? '#ff2d55' : '#ffffff'}
            style={styles.iconShadow}
          />
          <Text style={styles.iconText}>{formatCount(item.likes)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.iconBox} onPress={() => actions.onComments(item)}>
          <Ionicons
            name="chatbubble-ellipses"
            size={40}
            color="#ffffff"
            style={styles.iconShadow}
          />
          <Text style={styles.iconText}>{formatCount(item.commentsCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.iconBox} onPress={() => actions.onShare(item)}>
          <Ionicons
            name="arrow-redo"
            size={42}
            color="#ffffff"
            style={styles.iconShadow}
          />
          <Text style={styles.iconText}>{formatCount(item.shares)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.iconBox} onPress={() => actions.onStar(item.id)}>
          <Image source={STAR_LOGO} style={styles.starImage} />
          <Text style={styles.starText}>StarUp</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom info */}
      <View style={styles.bottomInfo}>
        <View style={styles.userRow}>
          <Text style={styles.userName}>{item.username || '@user'}</Text>
          <VerifiedBadge uid={item.userId} verified={!!item.verified} face={isFaceVerified(item)} color={item.verifiedColor} />
        </View>

        <Text style={styles.caption}>{item.caption}</Text>

        <TouchableOpacity
          style={styles.musicRow}
          activeOpacity={0.8}
          onPress={() => actions.onMusic(item)}
        >
          <Animated.View
            style={[
              styles.musicDiscOuter,
              { transform: [{ rotate: anims.rotateDeg }] },
            ]}
          >
            <View style={styles.vinylDisc}>
              <Image
                source={{ uri: item.profile || DEFAULT_AVATAR }}
                style={styles.musicCenterImage}
              />
              <View style={styles.musicDot} />
            </View>
          </Animated.View>

          <View style={styles.musicTextContainer}>
            <Animated.Text
              numberOfLines={1}
              style={[styles.musicText, { transform: [{ translateX: anims.text }] }]}
            >
              🎵 Music • {item.username} • Original Audio
            </Animated.Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  )
);

// ======================================================
// ONE COMMENT (memo)
// ======================================================
const CommentItem = React.memo(
  ({
    item,
    replies,
    expanded,
    isOwner,
    myUid,
    onProfile,
    onToggleReplies,
    onDeleteComment,
    onDeleteReply,
  }) => (
    <View style={styles.commentRow}>
      <TouchableOpacity onPress={() => onProfile(item.userId)}>
        <Image
          source={{ uri: item.profilePic || DEFAULT_AVATAR }}
          style={styles.commentAvatar}
        />
      </TouchableOpacity>

      <View style={styles.commentBody}>
        <View style={styles.rowCenter}>
          <Text style={styles.commentUser}>{item.username}</Text>
          <VerifiedBadge uid={item.userId} verified={!!item.verified} face={isFaceVerified(item)} color={item.verifiedColor}
              box={16}
              icon={16}
              tick={9}
              top={4}
              left={3.8}
            />
        </View>

        <Text style={styles.commentContent}>{item.text}</Text>

        <TouchableOpacity onPress={() => onToggleReplies(item.id)}>
          <Text style={styles.commentMeta}>
            {expanded
              ? 'Hides'
              : replies
              ? `View ${replies.length} Replies`
              : 'View Replies'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.commentMeta}>Reply</Text>

        {expanded &&
          replies?.map((reply) => (
            <View key={reply.id} style={styles.replyRow}>
              <Image
                source={{ uri: reply.profilePic || DEFAULT_AVATAR }}
                style={styles.replyAvatar}
              />

              <View style={styles.replyBody}>
                <Text style={styles.replyUser}>{reply.username}</Text>
                <Text style={styles.replyText}>{reply.text}</Text>

                {myUid === reply.userId && (
                  <TouchableOpacity
                    style={styles.replyMenu}
                    onPress={() =>
                      Alert.alert('Delete Reply', 'Do you want to delete this reply?', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => onDeleteReply(item.id, reply.id),
                        },
                      ])
                    }
                  >
                    <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
      </View>

      {isOwner && (
        <TouchableOpacity
          onPress={() => onDeleteComment(item.id)}
          style={styles.commentMenu}
        >
          <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  )
);

// ======================================================
// SCREEN
// ======================================================
export default function App() {
  const router = useRouter();

  const insets = useSafeAreaInsets();
  const statusBarH = insets.top || StatusBar.currentHeight || 0;

  const {
    videos,
    index,
    userId,
    from,
    username: chatUsername,
    profileImg: chatProfileImg,
  } = useLocalSearchParams();

  const profileUserId = userId;

  // ---------------- STATE ----------------
  const [allVideos, setAllVideos] = useState(() => {
    try {
      return videos ? JSON.parse(videos) : [];
    } catch (e) {
      return [];
    }
  });

  const startIndex = useRef(
    Math.max(Number(index) || 0, 0)
  ).current;

  const [uid, setUid] = useState(auth.currentUser?.uid ?? null);
  const [currentUserData, setCurrentUserData] = useState({
    name: 'User',
    photo: DEFAULT_AVATAR,
  });

  const [activeVideo, setActiveVideo] = useState(startIndex);
  const [screenFocused, setScreenFocused] = useState(true);
  const [pausedVideoId, setPausedVideoId] = useState(null);
  const [heartVideoId, setHeartVideoId] = useState(null);
  const [localLikes, setLocalLikes] = useState({});

  const [showComments, setShowComments] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [selectedVideoData, setSelectedVideoData] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [replyCommentId, setReplyCommentId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replies, setReplies] = useState({});
  const [showReplies, setShowReplies] = useState({});

  const [showStarPopup, setShowStarPopup] = useState(false);
  const [selectedStar, setSelectedStar] = useState(null);
  const [myStars, setMyStars] = useState(0);
  const [starAnimationVideoId, setStarAnimationVideoId] = useState(null);
  const [starAnimationCount, setStarAnimationCount] = useState(0);

  const [showSharePopup, setShowSharePopup] = useState(false);
  const [selectedShareVideo, setSelectedShareVideo] = useState(null);

  const [blockedUsers, setBlockedUsers] = useState([]);
  const [liveUsers, setLiveUsers] = useState({});

  // ---------------- REFS ----------------
  const [anims] = useState(createAnims);
  const keyboardHeight = useRef(new Animated.Value(0)).current;

  const flatListRef = useRef(null);
  const replyInputRef = useRef(null);
  const replyUnsubs = useRef({});

  const localLikesRef = useRef(localLikes);
  localLikesRef.current = localLikes;

  const likeFetching = useRef(new Set());
  const starSending = useRef(false);

  const lastTap = useRef(null);
  const tapTimeout = useRef(null);
  const heartTimeout = useRef(null);
  const isGoingBackRef = useRef(false);

  // Blocked users hata kar list (memo => har render pe naya array nahi)
  // + har video ka username/profile `users` se aaya latest naam/dp se badal diya jata hai
  const videoData = useMemo(() => {
    const base = blockedUsers.length
      ? allVideos.filter((item) => !blockedUsers.includes(item.userId))
      : allVideos;

    return base.map((item) => withLiveIdentity(item, liveUsers, 'profile'));
  }, [allVideos, blockedUsers, liveUsers]);

  // ---------------- LIST: ACTIVE VIDEO ----------------
  const onViewRef = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveVideo(viewableItems[0].index);
      // Naye video par aate hi pause hata do
      setPausedVideoId(null);
    }
  });

  // ---------------- ANIMATIONS (screen focus me hi chalen) ----------------
  useEffect(() => {
    if (!screenFocused) return;

    const spin = Animated.loop(
      Animated.timing(anims.rotate, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const marquee = Animated.loop(
      Animated.sequence([
        Animated.timing(anims.text, {
          toValue: -180,
          duration: 5000,
          useNativeDriver: true,
        }),
        Animated.timing(anims.text, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );

    spin.start();
    marquee.start();

    return () => {
      spin.stop();
      marquee.stop();
    };
  }, [screenFocused, anims]);

  // ---------------- KEYBOARD (native driver => smooth) ----------------
  useEffect(() => {
    const isIos = Platform.OS === 'ios';

    const show = Keyboard.addListener(
      isIos ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        Animated.timing(keyboardHeight, {
          toValue: e.endCoordinates.height,
          duration: isIos ? e.duration || 250 : 200,
          useNativeDriver: true,
        }).start();
      }
    );

    const hide = Keyboard.addListener(
      isIos ? 'keyboardWillHide' : 'keyboardDidHide',
      (e) => {
        Animated.timing(keyboardHeight, {
          toValue: 0,
          duration: isIos ? (e && e.duration) || 250 : 200,
          useNativeDriver: true,
        }).start();
      }
    );

    return () => {
      show.remove();
      hide.remove();
    };
  }, [keyboardHeight]);

  // ---------------- FOCUS ----------------
  // NOTE: yahan activeVideo reset nahi karte. Pehle profile se wapas aate hi
  // video original index pe jump kar deta tha, jabki list kisi aur video par hoti thi.
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, [])
  );

  // ---------------- AUTH + USER DATA ----------------
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setUid(user ? user.uid : null);

      if (!user) return;

      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));

        if (userSnap.exists()) {
          const data = userSnap.data();

          setCurrentUserData({
            name: data.username || 'User',
            photo: data.profileImg || DEFAULT_AVATAR,
            verified: data.verified || false,
            verifiedColor: data.verifiedColor || 'white',
            faceVerified: isFaceVerified(data),
          });
        }
      } catch (e) {
        console.log(e);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // ---------------- LIKES: sirf visible window ke videos ka status ----------------
  // Pehle har video ke liye ek-ek karke (sequential) read hota tha, aur har like
  // pe dobara. Ab sirf current ke aas-paas wale videos, parallel me, ek baar.
  useEffect(() => {
    if (!uid) return;

    const start = Math.max(activeVideo - 1, 0);

    const ids = videoData
      .slice(start, activeVideo + 4)
      .map((v) => v.id)
      .filter(
        (id) =>
          !(id in localLikesRef.current) && !likeFetching.current.has(id)
      );

    if (ids.length === 0) return;

    ids.forEach((id) => likeFetching.current.add(id));

    Promise.all(
      ids.map((id) =>
        getDoc(doc(db, 'all_videos', id, 'likes', uid))
          .then((snap) => [id, snap.exists()])
          .catch(() => null)
      )
    ).then((entries) => {
      ids.forEach((id) => likeFetching.current.delete(id));

      setLocalLikes((prev) => {
        const next = { ...prev };
        entries.forEach((entry) => {
          // optimistic value ko overwrite mat karo
          if (entry && !(entry[0] in prev)) next[entry[0]] = entry[1];
        });
        return next;
      });
    });
  }, [uid, activeVideo, videoData]);

  // ---------------- THUMBNAIL PREFETCH ----------------
  // Aane wale videos ke posters pehle se cache me => swipe pe poster instant.
  useEffect(() => {
    for (let i = activeVideo + 1; i <= activeVideo + PREFETCH_AHEAD; i++) {
      const thumb = videoData[i]?.thumbnail;
      if (thumb) Image.prefetch(thumb).catch(() => {});
    }
  }, [activeVideo, videoData]);

  // ---------------- WALLET (realtime; extra getDoc hata diya) ----------------
  useEffect(() => {
    if (!uid) return;

    const unsubscribe = onSnapshot(doc(db, 'wallets', uid), (snap) => {
      if (snap.exists()) setMyStars(snap.data().stars || 0);
    });

    return () => unsubscribe();
  }, [uid]);

  // ---------------- BLOCKED USERS ----------------
  useEffect(() => {
    if (!uid) return;

    const q = query(collection(db, 'blockedUsers'), where('blockerId', '==', uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBlockedUsers(snapshot.docs.map((d) => d.data().blockedUserId));
    });

    return () => unsubscribe();
  }, [uid]);

  // ---------------- COMMENTS (sirf jab sheet khuli ho) ----------------
  useEffect(() => {
    if (!showComments || !selectedVideoId) return;

    const q = query(
      collection(db, 'all_videos', selectedVideoId, 'comments'),
      orderBy('createdAt', 'desc'),
      limit(COMMENTS_LIMIT)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setComments(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCommentsLoading(false);
      },
      (e) => {
        console.log('COMMENTS ERROR =', e);
        setCommentsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedVideoId, showComments]);

  // ---------------- REPLIES ----------------
  // Pehle: cleanup galat jagah tha => listeners kabhi band nahi hote the (leak),
  // aur har comments update pe sab dobara lagte the.
  // Ab: har comment ka listener ek hi baar lagta hai, aur sheet band / video
  // badalne par sab proper unsubscribe hote hain.
  useEffect(() => {
    if (!showComments || !selectedVideoId) return;

    const map = replyUnsubs.current;

    // Sirf wahi comments jinke replies khule hain (ya reply likhne ke liye chune gaye)
    const wanted = new Set(
      comments
        .filter((c) => showReplies[c.id] || c.id === replyCommentId)
        .map((c) => c.id)
    );

    Object.keys(map).forEach((id) => {
      if (!wanted.has(id)) {
        map[id]();
        delete map[id];
      }
    });

    wanted.forEach((id) => {
      if (map[id]) return;

      const q = query(
        collection(db, 'all_videos', selectedVideoId, 'comments', id, 'replies'),
        orderBy('createdAt', 'asc')
      );

      map[id] = onSnapshot(
        q,
        (snap) => {
          const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setReplies((prev) => ({ ...prev, [id]: arr }));
        },
        (e) => console.log('REPLIES ERROR =', e)
      );
    });
  }, [comments, showReplies, replyCommentId, selectedVideoId, showComments]);

  useEffect(() => {
    return () => {
      Object.values(replyUnsubs.current).forEach((unsub) => unsub());
      replyUnsubs.current = {};
    };
  }, [selectedVideoId, showComments]);

  // ---------------- LIVE NAAM + DP: VIDEOS ----------------
  // Screen khulte hi aur har baar focus pe wapas aane par (jaise profile edit
  // karke lautne par) users se latest naam/dp dobara laate hain.
  const videoUserKey = useMemo(
    () => [...new Set(allVideos.map((v) => v.userId).filter(Boolean))].join(','),
    [allVideos]
  );

  useEffect(() => {
    if (!screenFocused || !videoUserKey) return;

    let cancelled = false;

    fetchLiveUsers(videoUserKey.split(','))
      .then((res) => {
        if (!cancelled) setLiveUsers((prev) => ({ ...prev, ...res }));
      })
      .catch((e) => console.log('LIVE USERS ERROR =', e));

    return () => {
      cancelled = true;
    };
  }, [videoUserKey, screenFocused]);

  // ---------------- LIVE NAAM + DP: COMMENTS / REPLIES ----------------
  const commentUserKey = useMemo(() => {
    const ids = new Set();
    comments.forEach((c) => c.userId && ids.add(c.userId));
    Object.values(replies).forEach((arr) =>
      (arr || []).forEach((r) => r.userId && ids.add(r.userId))
    );
    return [...ids].sort().join(',');
  }, [comments, replies]);

  useEffect(() => {
    if (!showComments || !commentUserKey) return;

    const missing = commentUserKey.split(',').filter((id) => !(id in liveUsers));
    if (missing.length === 0) return;

    let cancelled = false;

    fetchLiveUsers(missing)
      .then((res) => {
        if (!cancelled) setLiveUsers((prev) => ({ ...prev, ...res }));
      })
      .catch((e) => console.log('LIVE COMMENT USERS ERROR =', e));

    return () => {
      cancelled = true;
    };
  }, [commentUserKey, showComments, liveUsers]);

  const liveComments = useMemo(
    () => comments.map((c) => withLiveIdentity(c, liveUsers, 'profilePic')),
    [comments, liveUsers]
  );

  const liveReplies = useMemo(() => {
    const out = {};
    Object.keys(replies).forEach((k) => {
      out[k] = (replies[k] || []).map((r) =>
        withLiveIdentity(r, liveUsers, 'profilePic')
      );
    });
    return out;
  }, [replies, liveUsers]);

  // ---------------- TIMERS CLEANUP ----------------
  useEffect(() => {
    return () => {
      if (tapTimeout.current) clearTimeout(tapTimeout.current);
      if (heartTimeout.current) clearTimeout(heartTimeout.current);
    };
  }, []);

  // ======================================================
  // ACTIONS
  // ======================================================
  const handleLike = useCallback(async (videoId) => {
    const user = auth.currentUser;
    if (!user) return;

    const liked = !!localLikesRef.current[videoId];

    const likeRef = doc(db, 'all_videos', videoId, 'likes', user.uid);
    const videoRef = doc(db, 'all_videos', videoId);

    // UI turant update
    localLikesRef.current = { ...localLikesRef.current, [videoId]: !liked };
    setLocalLikes((prev) => ({ ...prev, [videoId]: !liked }));

    setAllVideos((prev) =>
      prev.map((item) =>
        item.id === videoId
          ? {
              ...item,
              likes: liked
                ? Math.max((item.likes || 0) - 1, 0)
                : (item.likes || 0) + 1,
            }
          : item
      )
    );

    try {
      if (liked) {
        await Promise.all([
          deleteDoc(likeRef),
          updateDoc(videoRef, { likes: increment(-1) }),
        ]);
      } else {
        await Promise.all([
          setDoc(likeRef, {
            userId: user.uid,
            createdAt: serverTimestamp(),
          }),
          updateDoc(videoRef, { likes: increment(1) }),
        ]);
        getDoc(videoRef)
          .then((sn) => sn.exists() && notifyVideoLike(videoId, sn.data().likes))
          .catch(() => {});
      }
    } catch (e) {
      // Error aaye to UI rollback
      localLikesRef.current = { ...localLikesRef.current, [videoId]: liked };
      setLocalLikes((prev) => ({ ...prev, [videoId]: liked }));

      setAllVideos((prev) =>
        prev.map((item) =>
          item.id === videoId
            ? {
                ...item,
                likes: liked
                  ? (item.likes || 0) + 1
                  : Math.max((item.likes || 0) - 1, 0),
              }
            : item
        )
      );

      console.log(e);
    }
  }, []);

  const handleShare = useCallback(async (videoUrl, videoId) => {
    try {
      const result = await Share.share({
        message: `Check out this video on TopKing 👑\n${videoLink(videoId)}`,
      });

      if (result.action === Share.sharedAction) {
        await updateDoc(doc(db, 'all_videos', videoId), {
          shares: increment(1),
        });
      }
    } catch (e) {
      console.log(e);
    }
  }, []);

  // 1 tap = pause/play, 2 tap = like (heart)
  const handleItemPress = useCallback(
    (videoId) => {
      const now = Date.now();

      // Double tap
      if (lastTap.current && now - lastTap.current < DOUBLE_TAP_MS) {
        if (tapTimeout.current) {
          clearTimeout(tapTimeout.current);
          tapTimeout.current = null;
        }

        lastTap.current = null;

        setHeartVideoId(videoId);

        if (heartTimeout.current) clearTimeout(heartTimeout.current);
        heartTimeout.current = setTimeout(() => setHeartVideoId(null), 1000);

        // Pehle se like nahi hai tabhi like karo
        if (!localLikesRef.current[videoId]) handleLike(videoId);

        return;
      }

      // Single tap (thoda wait taaki double tap pehchana ja sake)
      lastTap.current = now;

      tapTimeout.current = setTimeout(() => {
        tapTimeout.current = null;
        lastTap.current = null;

        setPausedVideoId((prev) => (prev === videoId ? null : videoId));
      }, DOUBLE_TAP_MS);
    },
    [handleLike]
  );

  const openProfile = useCallback(
    (targetUserId) => {
      router.push({
        pathname: '/userProfile',
        params: { userId: targetUserId },
      });
    },
    [router]
  );

  const openComments = useCallback((item) => {
    // Purana data hata do, loader dikhao
    setComments([]);
    setReplies({});
    setShowReplies({});
    setCommentsLoading(true);

    setSelectedVideoId(item.id);
    setSelectedVideoData(item);
    setShowComments(true);
  }, []);

  const openShare = useCallback((item) => {
    setSelectedShareVideo(item);
    setShowSharePopup(true);
  }, []);

  const openStar = useCallback((videoId) => {
    setSelectedVideoId(videoId);
    setShowStarPopup(true);
  }, []);

  const openMusic = useCallback(
    (item) => {
      router.push({
        pathname: '/musicDetails',
        params: {
          musicId: item.musicId || item.id,
          musicName: item.songName || 'Original Audio',
          username: item.username,
          profile: item.profile,
          audioUrl: item.audioUrl || item.songUrl || item.musicUrl,
        },
      });
    },
    [router]
  );

  // Sab handlers stable hain => actions object kabhi change nahi hota
  const actions = useMemo(
    () => ({
      onPress: handleItemPress,
      onLike: handleLike,
      onProfile: openProfile,
      onComments: openComments,
      onShare: openShare,
      onStar: openStar,
      onMusic: openMusic,
    }),
    [handleItemPress, handleLike, openProfile, openComments, openShare, openStar, openMusic]
  );

  const playStarAnimation = useCallback(() => {
    const { starScale, starOpacity, starRotate } = anims;

    // Total ~3 second: chhota -> bara, beech me chamak, last me fade out
    // (starRotate yahan shine value ki tarah use hota hai)
    starScale.setValue(0.5);
    starOpacity.setValue(0);
    starRotate.setValue(0);

    const shinePulse = Animated.sequence([
      Animated.timing(starRotate, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(starRotate, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]);

    Animated.sequence([
      Animated.parallel([
        // chhota se bara (2.6 sec)
        Animated.timing(starScale, {
          toValue: 1.25,
          duration: 2600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.timing(starOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),

        // chamak 4 baar
        Animated.sequence([shinePulse, shinePulse, shinePulse, shinePulse]),
      ]),

      // last me fade out (0.4 sec)
      Animated.parallel([
        Animated.timing(starOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(starScale, {
          toValue: 1.4,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setStarAnimationVideoId(null);
    });
  }, [anims]);

  const handleStarSubmit = async () => {
    const user = auth.currentUser;

    if (!user) return;

    if (!selectedStar) {
      Alert.alert('Select Star');
      return;
    }

    if (myStars < selectedStar) {
      Alert.alert('Not enough Stars');
      return;
    }

    // Double-tap se 2 baar star na jaye
    if (starSending.current) return;
    starSending.current = true;

    try {
      setShowStarPopup(false);

      setStarAnimationCount(selectedStar);

      setStarAnimationVideoId(selectedVideoId);

      playStarAnimation();

      await callApi('/gift/video-star', {
        videoId: selectedVideoId,
        stars: selectedStar,
      });

      // myStars wallet snapshot se khud update hota hai
      // (pehle yahan manual minus hota tha => double minus ho jata tha)
    } catch (e) {
      console.log(e);
      Alert.alert('Star', (e && e.message) || 'Could not send star');
    } finally {
      starSending.current = false;
    }
  };

  const postComment = async () => {
    const user = auth.currentUser;

    if (!user) {
      Alert.alert('Login Required');
      return;
    }

    if (!commentText.trim()) return;

    const text = commentText.trim();

    setCommentText('');
    Keyboard.dismiss();

    try {
      await Promise.all([
        addDoc(collection(db, 'all_videos', selectedVideoId, 'comments'), {
          text,
          username: currentUserData.name,
          profilePic: currentUserData.photo,
          userId: user.uid,
          verified: currentUserData.verified || false,
          verifiedColor: currentUserData.verifiedColor || 'white',
          faceVerified: isFaceVerified(currentUserData),
          createdAt: serverTimestamp(),
        }),
        updateDoc(doc(db, 'all_videos', selectedVideoId), {
          commentsCount: increment(1),
        }),
      ]);
    } catch (e) {
      console.log(e);
    }
  };

  const postReply = async () => {
    const user = auth.currentUser;

    if (!user) return;
    if (!replyText.trim()) return;

    const text = replyText.trim();
    const targetCommentId = replyCommentId;

    setReplyText('');
    setReplyCommentId(null);
    Keyboard.dismiss();
    replyInputRef.current?.blur();

    try {
      await addDoc(
        collection(
          db,
          'all_videos',
          selectedVideoId,
          'comments',
          targetCommentId,
          'replies'
        ),
        {
          text,
          username: currentUserData.name,
          profilePic: currentUserData.photo,
          userId: user.uid,
          verified: currentUserData.verified || false,
          verifiedColor: currentUserData.verifiedColor || 'white',
          faceVerified: isFaceVerified(currentUserData),
          createdAt: serverTimestamp(),
        }
      );
    } catch (e) {
      console.log(e);
    }
  };

  const deleteComment = useCallback(
    (commentId) => {
      Alert.alert('Delete Comment', 'Do you want to delete this comment?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(
                doc(db, 'all_videos', selectedVideoId, 'comments', commentId)
              );

              setComments((prev) => prev.filter((item) => item.id !== commentId));

              await updateDoc(doc(db, 'all_videos', selectedVideoId), {
                commentsCount: increment(-1),
              });
            } catch (e) {
              console.log(e);
            }
          },
        },
      ]);
    },
    [selectedVideoId]
  );

  const deleteReply = useCallback(
    async (commentId, replyId) => {
      try {
        await deleteDoc(
          doc(
            db,
            'all_videos',
            selectedVideoId,
            'comments',
            commentId,
            'replies',
            replyId
          )
        );

        setReplies((prev) => ({
          ...prev,
          [commentId]: prev[commentId]?.filter((item) => item.id !== replyId),
        }));
      } catch (e) {
        console.log('Delete Reply Error', e);
      }
    },
    [selectedVideoId]
  );

  const toggleReplies = useCallback((commentId) => {
    setShowReplies((prev) => ({ ...prev, [commentId]: !prev[commentId] }));
  }, []);

  const openCommentProfile = useCallback(
    (targetUserId) => {
      setShowComments(false);
      openProfile(targetUserId);
    },
    [openProfile]
  );

  // ======================================================
  // BACK (hardware + on-screen arrow same function)
  // ======================================================
  const targetForFrom = () => {
    if (from === 'userProfile') {
      return { pathname: '/userProfile', params: { userId: profileUserId } };
    }

    if (from === 'index') {
      return { pathname: '/index', params: { userId } };
    }

    if (from === 'messages') return '/messages';

    if (from === 'explore') return '/explore';

    if (from === 'chat') {
      return {
        pathname: '/chat',
        params: {
          userId,
          username: chatUsername,
          profileImg: chatProfileImg,
        },
      };
    }

    return null;
  };

  const goBack = () => {
    if (isGoingBackRef.current) return true;

    if (showSharePopup) {
      setShowSharePopup(false);
      return true;
    }

    if (showStarPopup) {
      setShowStarPopup(false);
      return true;
    }

    if (showComments) {
      setShowComments(false);
      return true;
    }

    isGoingBackRef.current = true;

    const target = targetForFrom();

    if (target) {
      // "explore" alag tab-navigator me hai, isliye navigate; baaki dismissTo
      if (from === 'explore') {
        router.navigate(target);
      } else {
        router.dismissTo(target);
      }

      isGoingBackRef.current = false;
      return true;
    }

    // Unknown "from" - plain stack pop
    if (router.canGoBack()) {
      router.back();
      setTimeout(() => {
        isGoingBackRef.current = false;
      }, 400);
      return true;
    }

    isGoingBackRef.current = false;
    return false;
  };

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', goBack);

    return () => backHandler.remove();
  }, [
    showComments,
    showStarPopup,
    showSharePopup,
    from,
    userId,
    chatUsername,
    chatProfileImg,
  ]);

  // ======================================================
  // RENDER HELPERS
  // ======================================================
  const renderVideo = useCallback(
    ({ item, index: i }) => (
      <VideoItem
        item={item}
        isActive={i === activeVideo}
        isNext={screenFocused && i === activeVideo + 1}
        isFocused={screenFocused}
        isPaused={pausedVideoId === item.id}
        isLiked={!!localLikes[item.id]}
        showHeart={heartVideoId === item.id}
        showStar={starAnimationVideoId === item.id}
        starCount={starAnimationCount}
        actions={actions}
        anims={anims}
      />
    ),
    [
      screenFocused,
      activeVideo,
      pausedVideoId,
      localLikes,
      heartVideoId,
      starAnimationVideoId,
      starAnimationCount,
      actions,
      anims,
    ]
  );

  const renderComment = useCallback(
    ({ item }) => (
      <CommentItem
        item={item}
        replies={liveReplies[item.id]}
        expanded={!!showReplies[item.id]}
        isOwner={uid === item.userId}
        myUid={uid}
        onProfile={openCommentProfile}
        onToggleReplies={toggleReplies}
        onDeleteComment={deleteComment}
        onDeleteReply={deleteReply}
      />
    ),
    [liveReplies, showReplies, uid, openCommentProfile, toggleReplies, deleteComment, deleteReply]
  );

  const inputValue = replyCommentId ? replyText : commentText;
  const onInputChange = replyCommentId ? setReplyText : setCommentText;

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* TOP BLACK STATUS BAR AREA */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: statusBarH,
          backgroundColor: '#000',
          zIndex: 2000,
          elevation: 30,
        }}
      />

      {/* Top Black Header */}
      <View style={styles.header} />

      {/* Video list */}
      <FlatList
        ref={flatListRef}
        data={videoData}
        renderItem={renderVideo}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        initialScrollIndex={startIndex}
        snapToInterval={ITEM_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        viewabilityConfig={VIEWABILITY_CONFIG}
        onViewableItemsChanged={onViewRef.current}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews={false}
        updateCellsBatchingPeriod={50}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      />

      {/* COMMENTS */}
      {showComments && (
        <View style={styles.commentsPanel}>
          {selectedVideoData && (
            <View style={styles.commentsHeader}>
              <Image
                source={{ uri: selectedVideoData.profile || DEFAULT_AVATAR }}
                style={styles.commentsHeaderAvatar}
              />

              <View style={styles.commentsHeaderBody}>
                <View style={styles.rowCenter}>
                  <Text style={styles.commentsHeaderUser}>
                    @{selectedVideoData.username}
                  </Text>

                  <VerifiedBadge uid={selectedVideoData.userId} verified={!!selectedVideoData.verified} face={isFaceVerified(selectedVideoData)} color={selectedVideoData.verifiedColor}
                      box={18}
                      icon={16}
                      tick={10}
                      top={4.6}
                      left={4.2}
                    />
                </View>

                <Text style={styles.commentsHeaderCaption} numberOfLines={2}>
                  {selectedVideoData.caption}
                </Text>
              </View>
            </View>
          )}

          {commentsLoading ? (
            <View style={styles.commentsLoadingBox}>
              <ActivityIndicator size="large" color="#FFD700" />
            </View>
          ) : (
            <FlatList
              data={liveComments}
              style={styles.commentsList}
              contentContainerStyle={styles.commentsListContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
              keyExtractor={keyExtractor}
              renderItem={renderComment}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={7}
              removeClippedSubviews={false}
            />
          )}

          <Animated.View
            style={[
              styles.commentInputBar,
              {
                transform: [
                  { translateY: Animated.multiply(keyboardHeight, -1) },
                ],
              },
            ]}
          >
            <Image
              source={{ uri: currentUserData.photo }}
              style={styles.commentInputAvatar}
            />

            <TextInput
              ref={replyInputRef}
              value={inputValue}
              onChangeText={onInputChange}
              placeholder={replyCommentId ? 'Write reply...' : 'Comment...'}
              placeholderTextColor="#999"
              style={styles.commentInputField}
            />

            <TouchableOpacity
              onPress={() => {
                if (replyCommentId) {
                  postReply();
                } else {
                  postComment();
                }
              }}
            >
              <Ionicons name="send" size={24} color="#FFD700" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* SHARE POPUP */}
      {showSharePopup && (
        <View style={styles.sharePopupContainer}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowSharePopup(false)}
          />

          <View style={styles.sharePopup}>
            <View style={styles.actionRow}>
              {/* REPORT */}
              <TouchableOpacity
                style={styles.reportBtn}
                onPress={() => {
                  setShowSharePopup(false);

                  router.push({
                    pathname: '/report',
                    params: { videoId: selectedShareVideo?.id },
                  });
                }}
              >
                <Text style={styles.reportText}>Report Video</Text>
              </TouchableOpacity>

              {/* SAVE */}
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => {
                  setShowSharePopup(false);
                  // Save Logic
                }}
              >
                <Text style={styles.saveText}>Video Save</Text>
              </TouchableOpacity>
            </View>

            {/* SHARE */}
            <View style={styles.shareRow}>
              <TouchableOpacity
                style={styles.shareBtn}
                onPress={() => {
                  setShowSharePopup(false);

                  handleShare(
                    selectedShareVideo?.videoUrl,
                    selectedShareVideo?.id
                  );
                }}
              >
                <Text style={styles.shareText}>Share Video</Text>
              </TouchableOpacity>

              {/* TopKing Logo */}
              <TouchableOpacity
                style={styles.logoBtn}
                onPress={() => {
                  setShowSharePopup(false);

                  router.push({
                    pathname: '../ShareVideo',
                    params: {
                      videoId: selectedShareVideo?.id,
                      videoUrl:
                        selectedShareVideo?.videoUrl ||
                        selectedShareVideo?.video,
                      thumbnail: selectedShareVideo?.thumbnail,
                    },
                  });
                }}
              >
                <Image source={APP_LOGO} style={styles.shareLogo} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* STAR POPUP */}
      {showStarPopup && (
        <View style={styles.starPopupContainer}>
          <View style={styles.starPopup}>
            {/* MY STARS */}
            <View style={styles.myStarBox}>
              <Image source={STAR_LOGO} style={styles.myStarImage} />
              <Text style={styles.myStarText}>{myStars}</Text>
            </View>

            {/* STAR CARDS */}
            <View style={styles.starRow}>
              {STAR_OPTIONS.map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.starCard, selectedStar === n && styles.activeStar]}
                  onPress={() => setSelectedStar(n)}
                >
                  <Image source={STAR_LOGO} style={styles.popupStarImage} />
                  <Text style={styles.starValue}>x{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.starSubmitBtn} onPress={handleStarSubmit}>
              <Text style={styles.starSubmitText}>StarUp</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => {
          const handled = goBack();

          // Absolute last resort so the user is never stuck on this screen.
          if (!handled) {
            router.replace('/');
          }
        }}
      >
        <Ionicons name="arrow-back" size={30} color="#fff" />
      </TouchableOpacity>

      {/* Bottom Comment Box */}
      <View style={styles.commentBox}>
        <View style={styles.yellowCircle} />
        <Text style={styles.commentText}>Add comment...</Text>
      </View>
    </View>
  );
}

// ======================================================
// STYLES (duplicate keys hata diye - jo last wale the wahi rakhe,
// isliye look bilkul same hai)
// ======================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  header: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingTop: 10,
  },
  videoContainer: { height: ITEM_HEIGHT, width },

  playerWrap: { width: '100%', height: '100%', backgroundColor: '#000' },
  video: { width: '100%', height: '93%' },
  poster: { position: 'absolute', top: 0, left: 0 },

  sideBar: {
    position: 'absolute',
    right: 3,
    bottom: 70,
    alignItems: 'center',
    zIndex: 999,
  },

  bottomInfo: {
    position: 'absolute',
    left: 12,
    bottom: 75,
    width: width * 0.7,
    zIndex: 999,
  },

  userName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },

  caption: { color: 'white' },

  commentBox: {
    height: 95.2,
    backgroundColor: '#111',
    justifyContent: 'center',
    paddingLeft: 20,
  },

  commentText: { color: '#888', marginBottom: 45, paddingLeft: 20 },

  profileImage: {
    width: 50,
    height: 50,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },

  iconBox: { marginBottom: 14, alignItems: 'center' },

  iconShadow: {
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  videoLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 9999,
  },

  videoError: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    zIndex: 9999,
  },

  loadingText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 12,
    fontWeight: '500',
  },

  iconText: {
    color: '#ffffff',
    fontWeight: '700',
    marginTop: 2,
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  starImage: { width: 65, height: 65, resizeMode: 'contain' },

  starText: {
    color: '#fffef7',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 0,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },

  backButton: { position: 'absolute', top: 50, left: 15, zIndex: 999 },

  yellowCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFD700',
    position: 'absolute',
    top: 15,
    left: 20,
  },

  heartPopup: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },

  starBurst: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
    elevation: 99999,
  },

  // ----- comments -----
  commentsPanel: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    height: height * 0.6,
    backgroundColor: '#000',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 999,
  },

  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },

  commentsHeaderAvatar: { width: 45, height: 45, borderRadius: 22 },
  commentsHeaderBody: { marginLeft: 10, flex: 1 },
  commentsHeaderUser: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  commentsHeaderCaption: { color: '#ccc', marginTop: 3 },

  commentsLoadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  commentsList: { marginTop: 10, flex: 1 },
  commentsListContent: { paddingBottom: 90 },

  commentRow: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  commentAvatar: { width: 40, height: 40, borderRadius: 20 },
  commentBody: { marginLeft: 10, flex: 1 },
  commentUser: { color: '#fff', fontWeight: 'bold' },
  commentContent: { color: '#fff' },
  commentMeta: { color: '#c3c2be', fontSize: 13, marginTop: 5 },
  commentMenu: { paddingLeft: 10, paddingTop: 5 },

  replyRow: { flexDirection: 'row', marginTop: 10, marginLeft: 35 },
  replyAvatar: { width: 30, height: 30, borderRadius: 15 },
  replyBody: { marginLeft: 8 },
  replyUser: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  replyText: { color: '#ddd' },
  replyMenu: { position: 'absolute', right: -190, top: 5, padding: 5 },

  rowCenter: { flexDirection: 'row', alignItems: 'center' },

  commentInputBar: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 30,
    zIndex: 99999,
    elevation: 99999,
  },

  commentInputAvatar: { width: 35, height: 35, borderRadius: 18, marginRight: 10 },
  commentInputField: { flex: 1, color: '#fff' },

  // ----- star popup -----
  starPopupContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    zIndex: 9999,
  },

  starPopup: {
    width: '100%',
    height: 290,
    backgroundColor: '#111',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingTop: 20,
    paddingHorizontal: 20,
  },

  myStarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    top: -10,
    left: 0,
    marginBottom: 20,
  },

  myStarImage: { width: 45, height: 45, resizeMode: 'contain' },

  myStarText: {
    color: '#FFD700',
    fontSize: 24,
    fontWeight: 'bold',
    marginLeft: -5,
  },

  starRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: -23,
  },

  starCard: {
  width: 90,
  height: 100,
  backgroundColor: 'transparent',
  borderRadius: 20,
  justifyContent: 'center',
  alignItems: 'center',
},

  activeStar: {
    borderWidth: 3,
    borderColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOpacity: 1,
    shadowRadius: 15,
    elevation: 15,
  },

  popupStarImage: {
    width: 90,
    height: 90,
    resizeMode: 'contain',
    marginTop: -15,
  },

  starValue: {
    color: '#131313',
    fontWeight: 'bold',
    fontSize: 15,
    marginTop: -45,
  },

  starSubmitBtn: {
    backgroundColor: '#FFD700',
    paddingVertical: 14,
    borderRadius: 30,
    marginTop: 30,
    alignSelf: 'center',
    width: 180,
  },

  starSubmitText: { color: '#000', fontWeight: 'bold', textAlign: 'center' },

  // ----- share popup -----
  sharePopupContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 25,
    height,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 9999,
  },

  sharePopup: {
    backgroundColor: '#111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 30,
  },

  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },

  reportBtn: {
    backgroundColor: '#ff3333',
    width: '48%',
    paddingVertical: 10,
    borderRadius: 12,
  },

  saveBtn: {
    backgroundColor: '#3498db',
    width: '48%',
    paddingVertical: 10,
    borderRadius: 12,
  },

  reportText: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 14,
  },

  saveText: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 14,
  },

  shareBtn: {
    backgroundColor: '#FFD700',
    width: 230,
    height: 45,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 5,
    marginRight: 0,
    marginTop: 0,
    marginBottom: 0,
  },

  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },

  logoBtn: {
    width: 60,
    height: 60,
    borderRadius: 45,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },

  shareLogo: { width: 100, height: 100, borderRadius: 25, resizeMode: 'cover' },

  shareText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 18,
    textAlign: 'center',
  },

  // ----- bottom info / music -----
  userRow: { flexDirection: 'row', alignItems: 'center' },

  musicRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },

  musicDiscOuter: { marginRight: 10 },

  vinylDisc: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },

  musicCenterImage: { width: 22, height: 22, borderRadius: 11 },

  musicDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },

  musicTextContainer: { width: 180, overflow: 'hidden' },

  musicText: { color: '#fff', fontSize: 13 },
});
