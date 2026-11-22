import { blockIfProfane } from '../../utils/guardText';
import { checkVideoAction, getVideoLocks } from '../../utils/videoLocks';
import { notifyNewFollower, notifyVideoLike } from '../../utils/pushNotify';
import PERF from '../../utils/devicePerf';
import { fixCdn } from '../../utils/videoSource';
import warmAhead from '../../utils/warmAhead';
import React, { memo, useRef, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, FlatList, Platform, StatusBar, ActivityIndicator, RefreshControl, Share, Alert, BackHandler, Keyboard, Animated, Easing, AppState, PanResponder, PixelRatio, unstable_batchedUpdates } from 'react-native';
import { scopedBackHandler } from '../../utils/scopedBack';
import StarToastView from '../../utils/StarToastView';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, increment, getDoc, setDoc, deleteDoc, serverTimestamp, limit, addDoc, getDocs, startAfter, where, documentId, writeBatch } from 'firebase/firestore';
import { Image as ExpoImage } from 'expo-image';
import { usePathname, useFocusEffect } from 'expo-router';
import { useRouter } from '../../utils/safeRouter';
import { getRecentRooms } from '../../utils/recentRooms';
import { db } from '../firebaseConfig';
import { loadDiscover, loadFollow } from '../../utils/homeData';
import useSwipeTabs from '../../utils/useSwipeTabs';
import { onAuthStateChanged } from 'firebase/auth';
import { isFaceVerified } from '../../components/UserTick';
import { runAfterIdle, auth, AVATAR_FALLBACK, feedKeyExtractor, height } from '../../components/home/feedShared';
import { waitForAuthUser, loadSeenMap, saveSeenMap, loadLastTop, saveLastTop, shouldCountView, videoPositions, persistResume, loadResume, MY_PROFILE_CACHE_KEY, buildMyProfile, readCachedProfile, saveCachedProfile, loadMyProfile, setFeedCache } from '../../components/home/feedStorage';
import { MAX_FETCH_ROUNDS, getOldestTs, fetchRandomPage, scoreVideo, isRecentlySeen, rankFeed } from '../../components/home/feedRanking';
import { silenceOthers, feedFocused, setFeedFocused, playActiveNow } from '../../components/home/playerRegistry';
import { TabGrid } from '../../components/home/TabGrid';
import { FeedTopBar } from '../../components/home/FeedTopBar';
import { UploadStatusBadge } from '../../components/home/UploadStatusBadge';
import { VideoItem } from '../../components/home/VideoItem';
import { COMMENT_PAGE_SIZE, CommentRow } from '../../components/home/CommentRow';
import { BottomBar } from '../../components/home/BottomBar';
import { styles } from '../../components/home/feedStyles';
import { StarPopup } from '../../components/home/StarPopup';
import { SharePopup } from '../../components/home/SharePopup';
import { CommentsSheet } from '../../components/home/CommentsSheet';
import { useShare } from '../../components/home/useShare';

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [videos, setVideos] = useState([]);
  const { showSharePopup, setShowSharePopup, selectedShareVideo, setSelectedShareVideo, SHARE_APPS, onSharePick, copyVideoLink } = useShare({ setVideos, router });
  // TOP BAR tab: 'foryou' (default) | 'follow' | 'discover' (discover alag screen kholta hai)
  const [feedTab, setFeedTab] = useState('foryou');
  const feedTabRef = useRef('foryou');
  const showGridRef = useRef(false);
  const [showGrid, setShowGrid] = useState(false); // Follow / Discover grid screen
  const [gridLoading, setGridLoading] = useState(false);
  const [followList, setFollowList] = useState([]);
  const [discoverList, setDiscoverList] = useState([]);
  const [liveList, setLiveList] = useState([]);
  const forYouSnapRef = useRef(null);
  const gridTimeRef = useRef({ follow: 0, discover: 0 });
  const [loading, setLoading] = useState(true);
  // VIDEO CHIPKAO: app ke bottom nav (bottomSection) ki asli height naapte hain.
  // Video list = poori screen - nav ki height, yaani video nav ke theek upar
  // tak aata hai, aur do videos ke beech koi black patti nahi bachti.
  // Nav bar ko chhua nahi gaya -- sirf uski height padhi jaati hai.
  const [fullH, setFullH] = useState(height);
  const [navH, setNavH] = useState(Platform.OS === 'ios' ? 115 : 105);
  // DRIFT FIX: listH ko exact device-pixel par round karo, warna snap har video par
  // fractional px chhodta hai aur 10-15 video baad icons/caption niche khisak jate hain.
  const listH = Math.max(1, PixelRatio.roundToNearestPixel(Math.round(fullH - navH)));
  const listHRef = useRef(listH);
  listHRef.current = listH;
  const onRootLayout = useCallback((e) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0) setFullH((p) => (p === h ? p : h));
  }, []);
  const onNavLayout = useCallback((e) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0) setNavH((p) => (p === h ? p : h));
  }, []);
  const getItemLayoutFn = useCallback(
    (_data, index) => ({ length: listH, offset: listH * index, index }),
    [listH]
  );
  // Exact snap points (snapToInterval Android par drift karta tha)
  const snapOffsets = useMemo(
    () => Array.from({ length: videos.length }, (_, i) => i * listH),
    [videos.length, listH]
  );
  // listH badle (keyboard / nav onLayout / comment sheet) to list ko current video par wapas lock karo
  const prevListHRef = useRef(listH);
  useEffect(() => {
    if (prevListHRef.current === listH) return;
    prevListHRef.current = listH;
    const idx = Math.max(0, lastViewableIndexRef.current >= 0 ? lastViewableIndexRef.current : 0);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToOffset?.({ offset: idx * listH, animated: false });
    });
  }, [listH]);
  // Scroll ruke tab agar thoda bhi offset hat gaya ho to exact video ke upar wapas set karo
  const onMomentumEnd = useCallback((e) => {
    const y = e.nativeEvent.contentOffset.y;
    const h = listHRef.current;
    const idx = Math.round(y / h);
    if (Math.abs(y - idx * h) > 0.5) {
      scrollRef.current?.scrollToOffset?.({ offset: idx * h, animated: false });
    }
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [activeVideo, setActiveVideo] = useState(0);
  const [currentIndex,setCurrentIndex]=useState(0);
  // SMOOTH SCROLL: naye video players (native decoder) swipe ke BEECH me nahi,
  // swipe rukne ke baad mount hote hain -> scroll animation me jhatka nahi.
  const [mountIndex, setMountIndex] = useState(0);
  const mountTimeoutRef = useRef(null);
  const mountInteractionRef = useRef<any>(null);
  const [pausedVideoId, setPausedVideoId] = useState(null);

const [loadingMoreVideos, setLoadingMoreVideos] = useState(false);
const [hasMoreVideos, setHasMoreVideos] = useState(true);

const lastVideoDocRef = useRef(null);
const loadingMoreRef = useRef(false);


const scrollRef=useRef(null);
const commentInputRef = useRef(null);
  const [isFocused, setIsFocused] = useState(true);
  const [localLikes, setLocalLikes] = useState({}); 



// ======================================================
// SMART LIKE + FOLLOW LOADER
// Sirf current video ke aas-paas ke videos check honge
// ======================================================

const likeFollowWindowRef = useRef("");
const checkedLikesRef = useRef(new Set());
const checkedFollowRef = useRef(new Set());

useEffect(() => {

  const user = auth.currentUser;

  if (!user || videos.length === 0) {
    return;
  }

  // -----------------------------------------
  // Current video ke aas-paas ke 5 videos
  // currentIndex - 2 se currentIndex + 2
  // -----------------------------------------

  const startIndex = Math.max(0, currentIndex - 2);

  const endIndex = Math.min(
    videos.length - 1,
    currentIndex + 3
  );

  const nearbyVideos = videos.slice(
    startIndex,
    endIndex + 1
  );

  if (nearbyVideos.length === 0) {
    return;
  }

  // Same window ko baar-baar load mat karo
  const windowKey = nearbyVideos
    .map(video => video.id)
    .join("|");

  if (likeFollowWindowRef.current === windowKey) {
    return;
  }

  const loadNearbyLikesAndFollowing = async () => {

    try {

      // ==================================================
      // 1. LIKES
      // ==================================================

      // SPEED: sirf wahi ids jo pehle check nahi hue (window me 4/5 purane hote hain)
      const videoIds = nearbyVideos
        .map(video => video.id)
        .filter(id => id && !checkedLikesRef.current.has(id));
      videoIds.forEach(id => checkedLikesRef.current.add(id));

      if (videoIds.length > 0) {

        const likesQuery = query(
          collection(
            db,
            "userLikes",
            user.uid,
            "likedVideos"
          ),
          where(
            documentId(),
            "in",
            videoIds
          )
        );

        const likesSnapshot = await getDocs(
          likesQuery
        );

        const nearbyLikes = {};

        likesSnapshot.forEach((likeDoc) => {

          nearbyLikes[likeDoc.id] = true;

        });

        // Purane likes ko rakho
        // aur nearby videos ka data update karo
        setLocalLikes(prev => {

          let changed = false;
          const updated = {
            ...prev
          };

          videoIds.forEach(videoId => {

            // Slow network ke dauran optimistic like ko overwrite mat karo.
            if (!pendingLikeRef.current[videoId]) {
              const next = nearbyLikes[videoId] === true;
              if (!!prev[videoId] !== next) changed = true;
              updated[videoId] = next;
            }

          });

          // SPEED: kuch nahi badla -> purana object lauta do,
          // poori screen ka faltu re-render nahi hoga (swipe ke turant baad).
          return changed ? updated : prev;

        });

      }


      // ==================================================
      // 2. FOLLOWING
      // ==================================================

      const userIds = [
        ...new Set(
          nearbyVideos
            .map(video => video.userId)
            .filter(
              userId =>
                userId &&
                userId !== user.uid &&
                !checkedFollowRef.current.has(userId)
            )
        )
      ];
      userIds.forEach(u => checkedFollowRef.current.add(u));


      if (userIds.length > 0) {

        // FIX: follow data profile.tsx wali top-level "follows" collection
        // me hai (doc id = myUid_targetUid). Pehle yahan users/{uid}/following
        // padha ja raha tha, jo profile ke count se match hi nahi karta tha.
        const followDocIds = userIds.map(id => `${user.uid}_${id}`);

        const followingQuery = query(
          collection(db, "follows"),
          where(
            documentId(),
            "in",
            followDocIds
          )
        );

        const followingSnapshot =
          await getDocs(
            followingQuery
          );

        const nearbyFollowing = {};

        followingSnapshot.forEach(
          (followDoc) => {

            const targetId =
              followDoc.data()?.followingId ||
              followDoc.id.slice(user.uid.length + 1);

            if (targetId) nearbyFollowing[targetId] = true;

          }
        );


        setFollowingUsers(prev => {

          let changed = false;
          const updated = {
            ...prev
          };

          userIds.forEach(userId => {

            // Follow tap abhi server tak ja raha ho to optimistic state mat todo
            if (pendingFollowRef.current[userId]) return;

            const next = nearbyFollowing[userId] === true;
            // strict compare: undefined -> false bhi 'badlav' hai (button tabhi dikhe jab pakka pata ho)
            if (prev[userId] !== next) changed = true;
            updated[userId] = next;

          });

          return changed ? updated : prev;

        });

      }

    } catch (error) {

      // retry ho sake isliye checked se hata do
      nearbyVideos.forEach(v => {
        checkedLikesRef.current.delete(v.id);
        checkedFollowRef.current.delete(v.userId);
      });
      __DEV__ && console.log(
        "Nearby Like/Following Error:",
        error
      );

    }

  };


  // SPEED: fast swipe karte waqt har video par Firestore query nahi chalegi.
  // Swipe ruke (350ms) tab hi like/follow check hoga. Pehli baar turant.
  const delay = likeFollowWindowRef.current === "" ? 0 : 200;
  const timer = setTimeout(() => {
    likeFollowWindowRef.current = windowKey;
    loadNearbyLikesAndFollowing();
  }, delay);

  return () => clearTimeout(timer);

}, [
  currentIndex,
  videos
]);



  const [heartVideoId, setHeartVideoId] = useState(null);
  const [heartTick, setHeartTick] = useState(0); // har double-tap par animation dobara chale
const lastTap = useRef(null);
const tapTimeout = useRef(null);
const likeQueueRef = useRef({});
const pendingLikeRef = useRef({});
const pendingFollowRef = useRef({});
const viewTimeout = useRef(null);
const heartTimeout = useRef(null);

useEffect(() => {
  return () => {
    if (tapTimeout.current) clearTimeout(tapTimeout.current);
    if (mountTimeoutRef.current) clearTimeout(mountTimeoutRef.current);
    mountInteractionRef.current?.cancel?.();
    if (viewTimeout.current) clearTimeout(viewTimeout.current);
    if (heartTimeout.current) clearTimeout(heartTimeout.current);
  };
}, []);


  const [showComments, setShowComments] = useState(false);
const commentAnim = useRef(new Animated.Value(height)).current;

const keyboardHeight = useRef(new Animated.Value(0)).current;
// Sheet ke saath backdrop bhi fade ho (pehle ekdam se dark ho jata tha)
const commentBackdrop = commentAnim.interpolate({
  inputRange: [0, height],
  outputRange: [0.5, 0],
  extrapolate: 'clamp',
});
const commentListRef = useRef(null);

const [selectedVideoId, setSelectedVideoId] = useState(null);
const commentTextRef = useRef('');
const onCommentChange = useCallback((t) => { commentTextRef.current = t; }, []);
const clearCommentInput = () => {
  commentTextRef.current = '';
  commentInputRef.current?.clear?.();
};
const [comments, setComments] = useState([]);
const [commentsLoading, setCommentsLoading] = useState(false);
const replyUnsubscribers = useRef(new Map());
const [replyingTo, setReplyingTo] = useState(null);

const [replies, setReplies] = useState({});

const [replyText, setReplyText] = useState("");

const [expandedReplies, setExpandedReplies] = useState({});

const [replyCounts, setReplyCounts] = useState({});

const [commentLimit, setCommentLimit] = useState(COMMENT_PAGE_SIZE);

const deleteCommentRef = useRef(null);
const deleteReplyRef = useRef(null);
const onDeleteComment = useCallback((id) => deleteCommentRef.current?.(id), []);
const onDeleteReply = useCallback((cid, rid) => deleteReplyRef.current?.(cid, rid), []);

const onToggleReplies = useCallback((id) => {
  setExpandedReplies((prev) => ({ ...prev, [id]: !prev[id] }));
}, []);

const onCommentReply = useCallback((c) => {
  setReplyingTo({ id: c.id, username: c.username });
  setReplyText("");
  setTimeout(() => commentInputRef.current?.focus(), 100);
}, []);

const onCommentProfile = useCallback((userId) => {
  setShowComments(false);
  setSelectedVideoId(null);
  router.push({ pathname: "/userProfile", params: { userId } });
}, [router]);

// Scroll karte-karte aur comments load (pagination)
const loadMoreComments = useCallback(() => {
  setCommentLimit((l) => (comments.length >= l ? l + COMMENT_PAGE_SIZE : l));
}, [comments.length]);

// Smooth band hone ka ek hi raasta (backdrop + Android back dono yahi use karte hain)
const closingCommentsRef = useRef(false);
const closeComments = useCallback(() => {
  if (closingCommentsRef.current) return;
  closingCommentsRef.current = true;
  Keyboard.dismiss();
  Animated.timing(commentAnim, {
    toValue: height,
    duration: 200,
    useNativeDriver: true,
  }).start(() => {
    closingCommentsRef.current = false;
    setShowComments(false);
    setSelectedVideoId(null);
    setComments([]);
    setReplies({});
    setReplyingTo(null);
    setCommentsLoading(false);
  });
}, [commentAnim]);

// Handle pakad ke neeche kheencho -> sheet band (finger ke saath chalti hai)
const commentPan = useMemo(
  () =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) commentAnim.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 120 || g.vy > 0.8) {
          closeComments();
        } else {
          Animated.spring(commentAnim, {
            toValue: 0,
            bounciness: 0,
            speed: 18,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(commentAnim, {
          toValue: 0,
          bounciness: 0,
          speed: 18,
          useNativeDriver: true,
        }).start();
      },
    }),
  [commentAnim, closeComments]
);

const [currentUserData, setCurrentUserData] = useState({
  // name shuru me KHALI: "User" default se galat naam se comment jata tha
  name: '',
  photo: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
  verified: false,
  verifiedColor: '',
  faceVerified: false,
});

// Latest loaded profile (uid ke saath) -- comment/like bhejte waqt yahi use hota hai
const currentUserRef = useRef<any>(null);

const applyMyProfile = (p) => {
  currentUserRef.current = p;
  setCurrentUserData({
    name: p.name,
    photo: p.photo,
    verified: p.verified || false,
    verifiedColor: p.verifiedColor || '',
    faceVerified: isFaceVerified(p),
  });
};

// Hamesha ek sahi profile deta hai (load na hui ho to pehle load karta hai)
const getMyProfileNow = async (user) => {
  const cur = currentUserRef.current;
  if (cur && cur.uid === user.uid && cur.name) return cur;
  const fresh = await loadMyProfile(true);
  if (fresh) {
    applyMyProfile(fresh);
    return fresh;
  }
  return null; // galat naam se comment nahi jayega
};
  
const [selectedVideoData, setSelectedVideoData] = useState(null);

const [showStarPopup, setShowStarPopup] = useState(false);
const [selectedStar, setSelectedStar] = useState(null);

const [myStars, setMyStars] = useState(0);
const [myTotalSpent, setMyTotalSpent] = useState(0);   // StarUp popup level bar
const [myWalletLevel, setMyWalletLevel] = useState(0);
const starSending = useRef(false);

const [starAnimationVideoId, setStarAnimationVideoId] = useState(null);
const [starAnimationCount, setStarAnimationCount] = useState(0);

const starScale = useRef(new Animated.Value(0)).current;

const starRotate = useRef(new Animated.Value(0)).current;

const starOpacity = useRef(new Animated.Value(0)).current;

const starJump = useRef(new Animated.Value(0)).current;

const starTilt = useRef(new Animated.Value(0)).current;

const [blockedUsers, setBlockedUsers] = useState([]);

const [followingUsers, setFollowingUsers] = useState({});

const rotateAnim = useRef(new Animated.Value(0)).current;

const textAnim = useRef(new Animated.Value(0)).current;


// (blocked users ab FIRST LOAD ke saath parallel load hote hain)





// HEAT FIX: disc ghoomna sirf tab jab Home screen focus me ho (Live room/dusri screen upar ho to band).
useEffect(() => {
  if (!isFocused) return;
  rotateAnim.setValue(0);
  const spinLoop = Animated.loop(
    Animated.timing(
      rotateAnim,
      {
        toValue: 1,
        duration: 2200,
        useNativeDriver: true,
        isInteraction: false,
      }
    )
  );
  spinLoop.start();
  return () => spinLoop.stop();
}, [isFocused]);

// HEAT FIX: marquee text bhi sirf focus me chale.
useEffect(() => {
  if (!isFocused) return;
  textAnim.setValue(0);
  const marqueeLoop = Animated.loop(
    Animated.sequence([
      Animated.timing(textAnim,{
        toValue:-180,
        duration:5000,
        useNativeDriver:true,
        isInteraction:false,
      }),
      Animated.timing(textAnim,{
        toValue:0,
        duration:0,
        useNativeDriver:true,
        isInteraction:false,
      }),
    ])
  );
  marqueeLoop.start();
  return () => marqueeLoop.stop();
},[isFocused]);


  // AUDIO SETUP



// ======================================================
// FEED MIXER
// Ek hi user ke videos ko lagatar aane se rokta hai.
// Example: A -> B -> C -> A
// Minimum 3 different-user positions ka GAP rakha jayega.
// Agar feed me sirf 1 user ke videos hain, to naturally
// same user repeat ho sakta hai.
// ======================================================
const FEED_USER_GAP = 3;

const arrangeFeedVideos = (inputVideos, previousVideos = []) => {
  if (!inputVideos || inputVideos.length <= 1) {
    return inputVideos || [];
  }

  // Har user ke videos ko alag queue me rakho.
  const groups = new Map();

  inputVideos.forEach((video) => {
    const userKey = video.userId || `video_${video.id}`;

    if (!groups.has(userKey)) {
      groups.set(userKey, []);
    }

    groups.get(userKey).push(video);
  });

  // Har user's videos ko thoda randomize karo, taki
  // same user ka hamesha same sequence na aaye.
  groups.forEach((queue) => {
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
  });

  const result = [];

  // Existing feed ke last 3 users ko bhi cooldown me rakho,
  // taki load-more ke boundary par same user repeat na ho.
  const recentUsers = previousVideos
    .slice(-FEED_USER_GAP)
    .map((video) => video.userId || `video_${video.id}`);

  while (groups.size > 0) {
    // Pehle un users ko choose karo jo recent 3 videos me nahi aaye.
    let availableUsers = [...groups.keys()].filter(
      (userKey) => !recentUsers.includes(userKey)
    );

    // Agar enough different users available nahi hain,
    // to remaining users me se choose karo. Isse feed rukega nahi.
    if (availableUsers.length === 0) {
      availableUsers = [...groups.keys()];
    }

    // Available users ko random order me rakho.
    for (let i = availableUsers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableUsers[i], availableUsers[j]] = [
        availableUsers[j],
        availableUsers[i],
      ];
    }

    // Jis user ke paas sabse zyada videos bache hain,
    // usko preference do, lekin recent-user restriction ke andar.
    const selectedUser = availableUsers.reduce((best, userKey) => {
      if (!best) return userKey;

      const bestCount = groups.get(best)?.length || 0;
      const currentCount = groups.get(userKey)?.length || 0;

      return currentCount > bestCount ? userKey : best;
    }, null);

    const queue = groups.get(selectedUser);
    const nextVideo = queue.shift();

    if (nextVideo) {
      result.push(nextVideo);

      recentUsers.push(selectedUser);
      if (recentUsers.length > FEED_USER_GAP) {
        recentUsers.shift();
      }
    }

    if (queue.length === 0) {
      groups.delete(selectedUser);
    }
  }

  return result;
};

// ======================================================
// SMART FEED v2  (score-based ranking, "har baar naya top video")
// ------------------------------------------------------
// Har video ko ek SCORE milta hai (module ke upar scoreVideo dekho):
//   + naya video  -> bonus (48h me sabse zyada, phir dheere dheere kam)
//   + unseen      -> bada bonus
//   + popular     -> chhota bonus (engagementScore)
//   - seen        -> penalty. Jitna RECENT dekha utna zyada neeche,
//                    time ke saath dheere dheere wapas upar aata hai
//   + random jitter -> same score wale videos ka order har baar alag
//
// Result:
//   * Jo video abhi dekha wo agli baar top par nahi aata
//   * Pichli baar ka top video agli baar top par KABHI nahi (lastTopId)
//   * Naye + unseen videos pehle, phir purane unseen, phir seen
//     (sabse purana dekha hua pehle) -> feed kabhi boring/khaali nahi
//   * Ek hi user ke videos lagatar nahi (3 ka gap)
//   * App background se 3 min baad wapas aaye to feed khud refresh
//   * Firestore reads sirf zaroorat ke hisaab se (lazy pages of 30)
// ======================================================
const PAGE_SIZE = 30;              // ek Firestore query me docs
const FIRST_SHOW = 10;             // pehli baar kitne video dikhane
const NEXT_BATCH_WANT = 10;        // load-more me kitne
const SEEN_DWELL_MS = 1000;        // itni der dekha = "seen"
const RESUME_REFRESH_MS = 30 * 60 * 1000; // itni der (30 min) background me raha to hi naya feed, warna wahi video resume

const blockedRef = useRef([]);
const seenRef = useRef({});
const lastTopIdRef = useRef(null);
const poolRef = useRef([]);             // candidates jo abhi tak dikhaye nahi
const fetchedIdsRef = useRef(new Set());
const exhaustedRef = useRef(false);
const fillChainRef = useRef(Promise.resolve());
const sessionRef = useRef(0);           // refresh par purane fetch cancel
const fetchRoundRef = useRef(0);        // kaunsa fetch round (fresh / random mix)
const videosRef = useRef([]);
const currentIndexRef = useRef(0);
const seenTimeout = useRef(null);
const seenSaveTimeout = useRef(null);
const refreshRef = useRef(null);
const lastViewableIndexRef = useRef(-1);
const lastViewableIdRef = useRef(null);
const initialIndexRef = useRef(0);

videosRef.current = videos;
currentIndexRef.current = currentIndex;

const markSeen = (videoId) => {
  if (!videoId) return;
  const now = Date.now();
  const prev = seenRef.current[videoId];
  // 30 min ke andar baar-baar scroll karne par count na badhe
  const n = prev && now - prev.t < 30 * 60 * 1000 ? prev.n : (prev?.n || 0) + 1;
  seenRef.current[videoId] = { t: now, n };
  if (seenSaveTimeout.current) clearTimeout(seenSaveTimeout.current);
  seenSaveTimeout.current = setTimeout(() => {
    saveSeenMap(seenRef.current);
  }, 400);
};

useEffect(() => {
  return () => {
    if (seenTimeout.current) clearTimeout(seenTimeout.current);
    if (seenSaveTimeout.current) clearTimeout(seenSaveTimeout.current);
    saveSeenMap(seenRef.current);
    persistResume();
  };
}, []);

// Feed + current index yaad rakho (screen badal kar wapas aane par wahi video)
useEffect(() => {
  if (videos.length === 0) return;
  if (feedTabRef.current !== 'foryou') return; // grid se khuli list resume me save nahi hogi
  setFeedCache({ videos, index: currentIndex, savedAt: Date.now() });
}, [videos, currentIndex]);

const toVideo = (docItem) => {
  const data = docItem.data();
  return {
    id: docItem.id,
    ...data,
    verified: data.verified || false,
    verifiedColor: data.verifiedColor || "",
    faceVerified: isFaceVerified(data),
  };
};

const isAllowedVideo = (data) =>
  data.status !== "blocked" &&
  data.hidden !== true &&
  !blockedRef.current.includes(data.userId);

const fetchVideoPage = (cursor) =>
  getDocs(
    cursor
      ? query(
          collection(db, "all_videos"),
          orderBy("createdAt", "desc"),
          orderBy("__name__", "desc"),
          startAfter(cursor),
          limit(PAGE_SIZE)
        )
      : query(
          collection(db, "all_videos"),
          orderBy("createdAt", "desc"),
          orderBy("__name__", "desc"),
          limit(PAGE_SIZE)
        )
  );

const resetFeedState = () => {
  sessionRef.current += 1;
  poolRef.current = [];
  fetchedIdsRef.current = new Set();
  exhaustedRef.current = false;
  lastVideoDocRef.current = null;
  loadingMoreRef.current = false;
  fillChainRef.current = Promise.resolve();
  fetchRoundRef.current = 0;
  return sessionRef.current;
};

// Ek page ke docs pool me daalo (duplicate / blocked / hidden skip)
const ingestSnap = (snap) => {
  if (!snap || snap.empty) {
    exhaustedRef.current = true;
    return 0;
  }
  lastVideoDocRef.current = snap.docs[snap.docs.length - 1];
  let added = 0;
  snap.forEach((docItem) => {
    if (fetchedIdsRef.current.has(docItem.id)) return;
    fetchedIdsRef.current.add(docItem.id);
    if (!isAllowedVideo(docItem.data())) return;
    poolRef.current.push(toVideo(docItem));
    added++;
  });
  if (snap.docs.length < PAGE_SIZE) exhaustedRef.current = true;
  return added;
};

// Random page ke docs (cursor / exhausted ko touch nahi karta)
const ingestRandom = (snap) => {
  if (!snap || snap.empty) return 0;
  let added = 0;
  snap.forEach((docItem) => {
    if (fetchedIdsRef.current.has(docItem.id)) return;
    fetchedIdsRef.current.add(docItem.id);
    if (!isAllowedVideo(docItem.data())) return;
    poolRef.current.push(toVideo(docItem));
    added++;
  });
  return added;
};

const countUnseen = () =>
  poolRef.current.reduce((n, v) => (seenRef.current[v.id] ? n : n + 1), 0);

// Pool me kam se kam `minUnseen` unseen video hone tak pages padho.
// Chain se serialize hota hai -> do jagah se ek saath same page nahi aata.
const ensurePool = (minUnseen, session) => {
  const run = async () => {
    let guard = 0;
    let dry = 0; // lagatar kitne round me naya kuch nahi mila
    while (
      session === sessionRef.current &&
      countUnseen() < minUnseen &&
      guard < MAX_FETCH_ROUNDS &&
      dry < 2
    ) {
      guard++;
      const round = fetchRoundRef.current++;
      let added = 0;

      // Naye videos (cursor) round 0 me, phir har 3rd round me.
      // Baaki rounds me random purane videos (discovery).
      if (round === 0 || (!exhaustedRef.current && round % 3 === 0)) {
        if (exhaustedRef.current) break;
        const snap = await fetchVideoPage(lastVideoDocRef.current);
        if (session !== sessionRef.current) return;
        added = ingestSnap(snap);
      } else {
        const oldest = await getOldestTs();
        if (session !== sessionRef.current) return;
        if (!oldest) {
          // random possible nahi -> seedha cursor se padho
          if (exhaustedRef.current) break;
          const snap = await fetchVideoPage(lastVideoDocRef.current);
          if (session !== sessionRef.current) return;
          added = ingestSnap(snap);
        } else {
          const [a, b] = await Promise.all([
            fetchRandomPage(oldest).catch(() => null),
            fetchRandomPage(oldest).catch(() => null),
          ]);
          if (session !== sessionRef.current) return;
          added = ingestRandom(a) + ingestRandom(b);
        }
      }

      dry = added === 0 ? dry + 1 : 0;
    }
  };
  fillChainRef.current = fillChainRef.current.then(run, run);
  return fillChainRef.current;
};

// Pool ko rank karo, top `n` nikalo (user-gap ke saath)
const pullFromPool = (n, previous) => {
  const lastTop = previous.length === 0 ? lastTopIdRef.current : null;
  let ranked = rankFeed(poolRef.current, seenRef.current, previous, lastTop, false, n);

  // Feed bilkul khali na rahe: agar koi naya/purana video hi nahi bacha
  // (sab 3 din ke andar dekhe hue), to sabse purana dekha hua dikhao.
  if (
    ranked.length === 0 &&
    previous.length === 0 &&
    exhaustedRef.current &&
    poolRef.current.length > 0
  ) {
    ranked = rankFeed(poolRef.current, seenRef.current, previous, null, true, n);
  }

  const picked = ranked.slice(0, n);
  const ids = new Set(picked.map((v) => v.id));
  poolRef.current = poolRef.current.filter((v) => !ids.has(v.id));
  return picked;
};

const syncHasMore = () => {
  const now = Date.now();
  const hasEligible = poolRef.current.some(
    (v) => !isRecentlySeen(seenRef.current, v.id, now)
  );
  setHasMoreVideos(hasEligible || !exhaustedRef.current);
};

// FIRST LOAD
useEffect(() => {
  let cancelled = false;

  const loadFirstVideos = async () => {
    try {
      // FIX: cold start par pehle login restore hone do, tabhi seen history
      // aur blocked users sahi key se load honge.
      // SPEED: feed ka first page login ka wait kiye bina turant shuru.
      // (pehle auth restore hone tak max 4s ruka rehta tha)
      const firstPagePromise = fetchVideoPage(null);
      firstPagePromise.catch(() => {}); // cancel hone par unhandled error na aaye

      const user = await waitForAuthUser();
      if (cancelled) return;

      // Sab ek saath -> sabse kam wait
      const [seenMap, blockedIds, lastTop, firstSnap, resume] = await Promise.all([
        loadSeenMap(),
        user
          ? Promise.all([
              getDocs(query(collection(db, "blockedUsers"), where("blockerId", "==", user.uid))),
              getDocs(query(collection(db, "blockedUsers"), where("blockedUserId", "==", user.uid))),
            ])
              .then(([a, b]) => [
                ...a.docs.map((d) => d.data().blockedUserId),
                ...b.docs.map((d) => d.data().blockerId),
              ].filter(Boolean))
              .catch(() => [])
          : Promise.resolve([]),
        loadLastTop(),
        firstPagePromise,
        loadResume(),
      ]);

      if (cancelled) return;

      seenRef.current = seenMap;
      lastTopIdRef.current = lastTop;
      blockedRef.current = blockedIds;
      setBlockedUsers(blockedIds);

      const session = resetFeedState();

      // RESUME: pichla feed + video wapas (jaha roka tha wahi se)
      let restoredList = null;
      let restoredIdx = 0;
      if (resume && resume.videos && resume.videos.length) {
        const curId = resume.videos[resume.index]?.id;
        const alive = resume.videos.filter(
          (v) =>
            v &&
            v.id &&
            v.status !== "blocked" &&
            v.hidden !== true &&
            !blockedIds.includes(v.userId)
        );
        if (alive.length) {
          const found = alive.findIndex((v) => v.id === curId);
          restoredList = alive;
          restoredIdx = found >= 0 ? found : 0;
          alive.forEach((v) => fetchedIdsRef.current.add(v.id));
        }
      }

      ingestSnap(firstSnap);

      if (restoredList) {
        initialIndexRef.current = restoredIdx;
        lastViewableIndexRef.current = restoredIdx;
        lastViewableIdRef.current = restoredList[restoredIdx].id;
        setCurrentIndex(restoredIdx);
        setActiveVideo(restoredIdx);
        setMountIndex(restoredIdx);
        setVideos(restoredList);
        syncHasMore();
        ensurePool(NEXT_BATCH_WANT * 2, session).catch(() => {});
        return;
      }

      // Sab 30 newest dekhe hue hon to aur pages padho jab tak unseen mile
      await ensurePool(FIRST_SHOW + 2, session);
      if (cancelled) return;

      const picked = pullFromPool(FIRST_SHOW, []);
      setVideos(picked);
      syncHasMore();

      if (picked[0]) {
        lastTopIdRef.current = picked[0].id;
        saveLastTop(picked[0].id);
      }

      // Background me agla batch taiyar rakho
      ensurePool(NEXT_BATCH_WANT * 2, session).catch(() => {});
    } catch (error) {
      __DEV__ && console.log("Firebase Video Error:", error);
    } finally {
      if (!cancelled) setLoading(false);
    }
  };

  loadFirstVideos();

  return () => {
    cancelled = true;
  };
}, []);

// PULL-TO-REFRESH (aur app wapas aane par auto-refresh)
const refreshVideos = useCallback(async () => {
  if (refreshing) return;
  if (feedTabRef.current !== 'foryou') return; // grid tabs ka refresh tab dobara tap se
  setRefreshing(true);

  try {
    // Jo video abhi screen par hai wo user ne dekha -> seen
    const cur = videosRef.current[currentIndexRef.current];
    if (cur) markSeen(cur.id);

    const session = resetFeedState();
    Object.keys(videoPositions).forEach((k) => delete videoPositions[k]);
    setHasMoreVideos(true);

    await ensurePool(FIRST_SHOW + 2, session);

    const picked = pullFromPool(FIRST_SHOW, []);

    lastViewableIndexRef.current = -1;
    lastViewableIdRef.current = null;
    setCurrentIndex(0);
    setActiveVideo(0);
    setMountIndex(0);
    setPausedVideoId(null);
    setVideos(picked);
    syncHasMore();
    scrollRef.current?.scrollToOffset?.({ offset: 0, animated: false });

    if (picked[0]) {
      lastTopIdRef.current = picked[0].id;
      saveLastTop(picked[0].id);
    }

    ensurePool(NEXT_BATCH_WANT * 2, session).catch(() => {});
  } catch (error) {
    __DEV__ && console.log("Refresh Videos Error:", error);
  } finally {
    setRefreshing(false);
  }
}, [refreshing]);

refreshRef.current = refreshVideos;

// App background -> seen turant save; 3+ min baad wapas aaye -> naya feed
useEffect(() => {
  let backgroundAt = 0;

  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      if (!backgroundAt) backgroundAt = Date.now();
      saveSeenMap(seenRef.current);
      persistResume();
      return;
    }

    if (state === 'active') {
      const away = backgroundAt ? Date.now() - backgroundAt : 0;
      backgroundAt = 0;
      if (away > RESUME_REFRESH_MS) {
        refreshRef.current?.();
      }
    }
  });

  return () => sub.remove();
}, []);

// LOAD MORE (background me, user ke last 4 video par pahunchne se pehle)
const loadMoreVideos = useCallback(async () => {
  if (feedTabRef.current !== 'foryou') return;
  if (loadingMoreRef.current) return;
  if (!hasMoreVideos) return;

  loadingMoreRef.current = true;

  try {
    const session = sessionRef.current;

    await ensurePool(NEXT_BATCH_WANT * 2, session);
    if (session !== sessionRef.current) return;

    const picked = pullFromPool(NEXT_BATCH_WANT, videosRef.current);

    if (picked.length > 0) {
      setVideos((prev) => {
        const ids = new Set(prev.map((v) => v.id));
        const fresh = picked.filter((v) => !ids.has(v.id));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    }

    syncHasMore();
  } catch (error) {
    __DEV__ && console.log("Load More Videos Error:", error);
  } finally {
    loadingMoreRef.current = false;
  }
}, [hasMoreVideos]);






useEffect(() => {
  let alive = true;
  let unsubDoc = null;

  // 1) Phone me saved naam turant (app khulte hi)
  readCachedProfile().then((c) => {
    if (alive && c && c.name && !currentUserRef.current) applyMyProfile(c);
  });

  // 2) Login restore hote hi users/{uid} ko LIVE sunte raho:
  //    profile me naam / dp badalte hi yahan bhi turant badal jata hai.
  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (unsubDoc) { unsubDoc(); unsubDoc = null; }

    if (!user) {
      currentUserRef.current = null;
      AsyncStorage.removeItem(MY_PROFILE_CACHE_KEY).catch(() => {});
      return;
    }

    unsubDoc = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (!alive) return;
        const profile = buildMyProfile(user, snap.exists() ? snap.data() : {});
        saveCachedProfile(profile);
        applyMyProfile(profile);
      },
      () => {
        loadMyProfile(true).then((p) => {
          if (alive && p) applyMyProfile(p);
        });
      }
    );
  });

  return () => {
    alive = false;
    if (unsubDoc) unsubDoc();
    unsubscribeAuth();
  };
}, []);

// Mere saare videos me naam + dp apne aap naya dikhe (feed me abhi load videos)
useEffect(() => {
  const uid = auth.currentUser?.uid;
  const name = currentUserData.name;
  const photo = currentUserData.photo;
  if (!uid || !name) return;

  setVideos((prev) => {
    let changed = false;
    const next = prev.map((v) => {
      if (v.userId === uid && (v.username !== name || v.profile !== photo)) {
        changed = true;
        return { ...v, username: name, profile: photo };
      }
      return v;
    });
    return changed ? next : prev;
  });
}, [currentUserData.name, currentUserData.photo, videos.length]);

useEffect(() => {
  let unsubscribeWallet = null;

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!user) {
      setMyStars(0);
      setMyTotalSpent(0);
      setMyWalletLevel(0);
      if (unsubscribeWallet) {
        unsubscribeWallet();
        unsubscribeWallet = null;
      }
      return;
    }

    const walletRef = doc(db, "wallets", user.uid);

    getDoc(walletRef)
      .then((snap) => {
        if (snap.exists()) {
          setMyStars(snap.data().stars || 0);
          setMyTotalSpent(snap.data().totalSpent || 0);
          setMyWalletLevel(snap.data().level || 0);
        } else {
          setMyStars(0);
        }
      })
      .catch((error) => {
        __DEV__ && console.log("Wallet Stars Load Error:", error);
      });

    if (unsubscribeWallet) {
      unsubscribeWallet();
    }

    unsubscribeWallet = onSnapshot(
      walletRef,
      (snap) => {
        if (snap.exists()) {
          setMyStars(snap.data().stars || 0);
          setMyTotalSpent(snap.data().totalSpent || 0);
          setMyWalletLevel(snap.data().level || 0);
        } else {
          setMyStars(0);
        }
      },
      (error) => {
        __DEV__ && console.log("Wallet Stars Realtime Error:", error);
      }
    );
  });

  return () => {
    unsubscribeAuth();
    if (unsubscribeWallet) {
      unsubscribeWallet();
    }
  };
}, []);


useEffect(() => {

  const isIOS = Platform.OS === 'ios';

  const show = Keyboard.addListener(
    isIOS ? "keyboardWillShow" : "keyboardDidShow",
    (e) => {
      Animated.timing(keyboardHeight,{
        toValue:e.endCoordinates.height,
        duration:isIOS ? (e.duration || 250) : 180,
        useNativeDriver:true,
      }).start();
    }
  );

  const hide = Keyboard.addListener(
    isIOS ? "keyboardWillHide" : "keyboardDidHide",
    (e)=>{
      Animated.timing(keyboardHeight,{
        toValue:0,
        duration:isIOS ? ((e && e.duration) || 250) : 180,
        useNativeDriver:true,
      }).start();
    }
  );

  return ()=>{
    show.remove();
    hide.remove();
  };

},[]);




useEffect(() => {
    if (!showComments) commentTextRef.current = '';

    if (showComments) {
        Animated.spring(commentAnim,{
            toValue:0,
            useNativeDriver:true,
            speed:16,
            bounciness:0
        }).start();

    } else {

        Animated.timing(commentAnim,{
            toValue:height,
            duration:250,
            useNativeDriver:true
        }).start();

    }

},[showComments]);



  // PAGE FOCUS LOGIC (Back aane par auto-resume karega)
  useFocusEffect(
    useCallback(() => {
      setFeedFocused(true);
      setIsFocused(true);
      return () => {
        setFeedFocused(false); // sab video turant pause + mute
        setIsFocused(false);
        persistResume();
      };
    }, [])
  );


useEffect(() => {
  const backAction = () => {

    // Star Popup open hai to pehle usko close karo
if (showSharePopup) {
  setShowSharePopup(false);
  return true;
}

    if (showStarPopup) {
      setShowStarPopup(false);
      return true;
    }

    // Comments open hain to unko close karo
    if (showComments) {
      closeComments();
      return true;
    }

    // Feed home screen hai: back dabane par app se bahar jao
    // (camera/edit/post jaisi purani screens wapas nahi khulengi)
    BackHandler.exitApp();
    return true;
  };

  const backHandler = scopedBackHandler('/', 
    'hardwareBackPress',
    backAction
  );

  return () => backHandler.remove();
}, [showComments, showStarPopup, showSharePopup]);




// ==========================================================
// COMMENTS LISTENER
// FIX (loading hi loading): pehle ye effect sirf [selectedVideoId]
// par chalta tha. Comment band karne ke baad (back / profile se) ID
// same rehti thi, to dubara kholne par effect chalta hi nahi tha aur
// `commentsLoading` hamesha true reh jaata tha.
// Ab effect `showComments` par bhi depend karta hai: khulte hi
// listener lagta he, band hote hi cleanup se band ho jaata he.
// (Star popup ab comments ka listener nahi chalata.)
// ==========================================================
useEffect(() => {
  if (!showComments || !selectedVideoId) return;

  const videoId = selectedVideoId;
  const replyMap = replyUnsubscribers.current;
  let cancelled = false;

  const q = query(
    collection(db, "all_videos", videoId, "comments"),
    orderBy("createdAt", "desc"),
    limit(commentLimit)
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      if (cancelled) return;

      const fresh = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Jo comment badla nahi uska purana object rakho -> memo row re-render nahi hoti
      setComments((prev) => {
        const old = new Map(prev.map((c) => [c.id, c]));
        return fresh.map((n) => {
          const o = old.get(n.id);
          return o &&
            o.text === n.text &&
            o.username === n.username &&
            o.profilePic === n.profilePic &&
            o.verified === n.verified &&
            o.verifiedColor === n.verifiedColor &&
            o.faceVerified === n.faceVerified &&
            o.createdAt?.seconds === n.createdAt?.seconds
            ? o
            : n;
        });
      });
      setCommentsLoading(false);

      // Reply listeners DIFF se: sirf naye comments ke liye lagao,
      // delete hue comments ke band karo (pehle har snapshot par sab dobara bante the)
      const liveIds = new Set(fresh.map((c) => c.id));
      const removed = [];
      replyMap.forEach((unsub, id) => {
        if (!liveIds.has(id)) {
          unsub();
          replyMap.delete(id);
          removed.push(id);
        }
      });
      if (removed.length) {
        setReplies((prev) => {
          const next = { ...prev };
          removed.forEach((id) => delete next[id]);
          return next;
        });
      }

      fresh.forEach((c) => {
        if (replyMap.has(c.id)) return;

        const replyQuery = query(
          collection(db, "all_videos", videoId, "comments", c.id, "replies"),
          orderBy("createdAt", "asc")
        );

        const replyUnsub = onSnapshot(
          replyQuery,
          (replySnap) => {
            if (cancelled) return;
            const list = replySnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setReplies((prev) => {
              if (list.length === 0 && !prev[c.id]) return prev; // faltu render nahi
              return { ...prev, [c.id]: list };
            });
          },
          () => {}
        );

        replyMap.set(c.id, replyUnsub);
      });
    },
    (error) => {
      __DEV__ && console.log("Comment Load Error", error);
      if (!cancelled) setCommentsLoading(false);
    }
  );

  return () => {
    cancelled = true;
    unsubscribe();
    replyMap.forEach((unsub) => unsub());
    replyMap.clear();
  };
}, [showComments, selectedVideoId, commentLimit]);

  // INTERACTIONS
  

      const handleLike = (videoId) => {
  const user = auth.currentUser;

  if (!user) {
    Alert.alert(
      "Login Required",
      "Please login to like this video."
    );
    return;
  }

  const userId = user.uid;
  const alreadyLiked = !!localLikes[videoId];
  const nextLiked = !alreadyLiked;

  // =====================================================
  // OPTIMISTIC UI:
  // Heart RED + count dono ek hi tap par turant change.
  // Slow network me bhi next tap latest local state use karega.
  // =====================================================
  pendingLikeRef.current[videoId] = true;

  // BATCH: like + count ek hi render me (pehle 2 baar poori screen re-render hoti thi)
  unstable_batchedUpdates(() => {
    setLocalLikes(prev => ({
      ...prev,
      [videoId]: nextLiked,
    }));

    setVideos(prev => {
      const i = prev.findIndex(v => v.id === videoId);
      if (i < 0) return prev;
      const next = prev.slice();
      next[i] = {
        ...prev[i],
        likes: Math.max(0, (prev[i].likes || 0) + (nextLiked ? 1 : -1)),
      };
      return next;
    });
  });

  // Same video ke Firebase operations ko order me chalao.
  const previousOperation =
    likeQueueRef.current[videoId] || Promise.resolve();

  const operation = previousOperation
    .catch(() => {})
    .then(async () => {
      const likeRef = doc(
        db,
        "all_videos",
        videoId,
        "likes",
        userId
      );

      const videoRef = doc(
        db,
        "all_videos",
        videoId
      );

      if (nextLiked) {
        // ===== LIKE =====
        await setDoc(likeRef, {
          userId: userId,
          createdAt: serverTimestamp()
        });

        await updateDoc(videoRef, {
          likes: increment(1),
          engagementScore: increment(5)
        });

        const videoSnap = await getDoc(videoRef);

        if (videoSnap.exists()) {
          const videoData = videoSnap.data();
          notifyVideoLike(videoId, videoData.likes); // milestone push

          const userLikeRef = doc(
            db,
            "userLikes",
            userId,
            "likedVideos",
            videoId
          );

          await setDoc(userLikeRef, {
            videoId: videoId,
            ownerId: videoData.userId,
            createdAt: serverTimestamp()
          });

          // Notification
          if (videoData.userId !== user.uid) {
            await addDoc(
              collection(
                db,
                "users",
                videoData.userId,
                "notifications"
              ),
              {
                type: "like",
                isRead: false,
                senderId: user.uid,
                senderName: (currentUserRef.current?.name || currentUserData.name || user.displayName || user.email?.split('@')[0] || 'User'),
                senderPhoto: (currentUserRef.current?.photo || currentUserData.photo),
                videoId: videoId,
                videoCaption: videoData.caption || "",
                videoThumbnail:
                  videoData.thumbnail ||
                  videoData.videoThumbnail ||
                  "",
                createdAt: serverTimestamp()
              }
            );
          }
        }

      } else {
        // ===== UNLIKE =====
        await deleteDoc(likeRef);

        await updateDoc(videoRef, {
          likes: increment(-1),
          engagementScore: increment(-5)
        });

        const userLikeRef = doc(
          db,
          "userLikes",
          userId,
          "likedVideos",
          videoId
        );

        await deleteDoc(userLikeRef);
      }
    })
    .catch((e) => {
      // UI ko rollback nahi karte:
      // user ko slow network me bhi latest tap state dikhti rahe.
      __DEV__ && console.log("Like Firebase Error:", e);
    })
    .finally(() => {
      if (likeQueueRef.current[videoId] === operation) {
        delete pendingLikeRef.current[videoId];
        delete likeQueueRef.current[videoId];
      }
    });

  likeQueueRef.current[videoId] = operation;
};

const handleFollow = async (targetUserId) => {
  const user = auth.currentUser;
  if (!user) {
    Alert.alert("Login Required", "Please login to follow.");
    return;
  }
  if (user.uid === targetUserId) return;

  const isFollowing = !!followingUsers[targetUserId];

  // Server me jaate waqt nearby-loader is state ko overwrite na kare
  pendingFollowRef.current[targetUserId] =
    (pendingFollowRef.current[targetUserId] || 0) + 1;

  // Optimistic: button turant badle
  setFollowingUsers(prev => ({ ...prev, [targetUserId]: !isFollowing }));

  try {
    // FIX: profile.tsx isi "follows" collection se Followers / Following
    // count nikalta hai (doc id = myUid_targetUid). Pehle yahan
    // users/{uid}/following + counter update hota tha, isliye profile ka
    // count kabhi nahi badhta tha (aur doosre user ke doc ka write rules
    // se fail hokar poora follow roll-back ho jata tha).
    const edgeRef = doc(db, "follows", `${user.uid}_${targetUserId}`);

    if (isFollowing) {
      await deleteDoc(edgeRef);
    } else {
      await setDoc(edgeRef, {
        followerId: user.uid,
        followingId: targetUserId,
        createdAt: Date.now(),
      });
      notifyNewFollower(targetUserId);
    }
  } catch (e) {
    // fail hua to wapas purani state
    setFollowingUsers(prev => ({ ...prev, [targetUserId]: isFollowing }));
    __DEV__ && console.log("Follow Error:", e);
    Alert.alert("Error", "Follow nahi ho paya, dobara try karo.");
  } finally {
    pendingFollowRef.current[targetUserId] =
      Math.max(0, (pendingFollowRef.current[targetUserId] || 1) - 1);
    if (!pendingFollowRef.current[targetUserId]) {
      delete pendingFollowRef.current[targetUserId];
    }
  }
};


const handleDoubleTapLike = (videoId) => {

  // Heart animation (tick badalne se popup dobara mount -> animation replay)
  unstable_batchedUpdates(() => {
    setHeartVideoId(videoId);
    setHeartTick((t) => t + 1);
  });

  if (heartTimeout.current) {
    clearTimeout(heartTimeout.current);
  }

  heartTimeout.current = setTimeout(() => {
    setHeartVideoId(null);
  }, 1000);

  // Agar pehle se like nahi hai tabhi like karo
  if (!localLikes[videoId]) {
    handleLike(videoId);
  }

};


// ======================================================
// STABLE CALLBACKS FOR THE MEMOIZED <VideoItem/>
// ======================================================
// handleLike / handleFollow / handleDoubleTapLike upar plain
// functions hain, isliye har render par inki identity badalti hai.
// Agar unhe directly VideoItem ko prop ki tarah diya jaye, to React.memo
// har render par "prop badla" samajh kar poori list ko re-render kar
// dega -- exactly wahi performance problem jo hum fix karna chahte hain.
//
// Fix: ref me hamesha latest function rakho, aur VideoItem ko ek
// useCallback(..., []) wrapper do jiski identity KABHI nahi badalti.
// Andar se wo hamesha ref.current (yaani latest version) hi call karta hai.
const handleLikeRef = useRef(handleLike);
handleLikeRef.current = handleLike;
const onLike = useCallback((videoId) => handleLikeRef.current(videoId), []);

const handleFollowRef = useRef(handleFollow);
handleFollowRef.current = handleFollow;
const onFollow = useCallback((userId) => handleFollowRef.current(userId), []);

// ==========================================================
// TOP BAR actions + Follow / Discover grid data
// (grid sirf tab load hota hai jab tab dabao; For You feed ko touch nahi)
// ==========================================================
const GRID_TTL_MS = 60 * 1000;
const tsMs = (t) => {
  if (!t) return 0;
  if (typeof t === 'number') return t;
  if (t.toMillis) return t.toMillis();
  if (t.seconds) return t.seconds * 1000;
  return 0;
};

const loadFollowGrid = useCallback(async (force) => {
  const user = auth.currentUser;
  if (!user) {
    setFollowList([]);
    setLiveList([]);
    return;
  }
  if (!force && Date.now() - gridTimeRef.current.follow < GRID_TTL_MS) return;
  gridTimeRef.current.follow = Date.now();
  setGridLoading(true);
  try {
    const fSnap = await getDocs(
      query(collection(db, "follows"), where("followerId", "==", user.uid), limit(60))
    );
    const ids = [];
    fSnap.forEach((d) => {
      const t = d.data()?.followingId || d.id.slice(user.uid.length + 1);
      if (t) ids.push(t);
    });
    if (ids.length === 0) {
      setFollowList([]);
      setLiveList([]);
      return;
    }
    const idSet = new Set(ids);

    // videos (10-10 ke chunk, bina orderBy -> naya index nahi chahiye) + live rooms ek saath
    const chunks = [];
    for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
    const [snaps, roomsSnap] = await Promise.all([
      Promise.all(
        chunks.map((c) =>
          getDocs(query(collection(db, "all_videos"), where("userId", "in", c), limit(20))).catch(() => null)
        )
      ),
      getRecentRooms(db).catch(() => null), // sirf pichhle 24 ghante ke rooms
    ]);

    const list = [];
    snaps.forEach((sn) => {
      if (!sn) return;
      sn.forEach((docItem) => {
        if (!isAllowedVideo(docItem.data())) return;
        list.push(toVideo(docItem));
      });
    });
    list.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
    setFollowList(list.slice(0, 40));

    // followed logon ke live rooms (video = LIVE, audio = CHAT)
    const lives = [];
    const now = Date.now();
    if (roomsSnap) {
      roomsSnap.forEach((d) => {
        const r = d.data();
        const st = String(r.status || '').toLowerCase().trim();
        if (st === 'ended' || st === 'inactive' || st === 'closed') return;
        if ((r.roomType || 'public') !== 'public') return;
        const hb = tsMs(r.hostHeartbeat) || tsMs(r.lastHeartbeat);
        if (hb && now - hb > 10 * 60 * 1000) return;
        const hostId = r.hostId || r.seatsData?.seat_1?.userId;
        if (!hostId || !idSet.has(hostId) || blockedRef.current.includes(hostId)) return;
        lives.push({
          id: d.id,
          hostId,
          host: r.hostName || r.host || 'User',
          img: r.hostImg || r.profileImg || AVATAR_FALLBACK,
          type: String(r.type || 'audio').toLowerCase(),
          layout: String(r.roomLayout || 'chat').toLowerCase(),
        });
      });
    }
    setLiveList(lives);
  } catch (e) {
    __DEV__ && console.log("Follow grid error:", e);
    gridTimeRef.current.follow = 0;
  } finally {
    setGridLoading(false);
  }
}, []);

const loadDiscoverGrid = useCallback(async (force) => {
  if (!force && Date.now() - gridTimeRef.current.discover < GRID_TTL_MS) return;
  gridTimeRef.current.discover = Date.now();
  setGridLoading(true);
  try {
    const snap = await fetchVideoPage(null);
    const list = [];
    snap.forEach((docItem) => {
      if (!isAllowedVideo(docItem.data())) return;
      list.push(toVideo(docItem));
    });
    // halka sa mix (Fisher-Yates) taaki har baar same order na dikhe
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    setDiscoverList(list);
  } catch (e) {
    __DEV__ && console.log("Discover grid error:", e);
    gridTimeRef.current.discover = 0;
  } finally {
    setGridLoading(false);
  }
}, []);

// For You ki list yaad rakho (grid se video kholne par feed list badalti hai)
const saveForYouSnap = () => {
  if (feedTabRef.current === 'foryou') {
    forYouSnapRef.current = {
      videos: videosRef.current,
      index: currentIndexRef.current,
    };
  }
};

const onTopLive = useCallback(() => {
  router.push('/all-live');
}, []);

const onTopDiscover = useCallback(() => {
  if (feedTabRef.current === 'discover' && showGridRef.current) {
    loadDiscoverGrid(true);
    return;
  }
  saveForYouSnap();
  feedTabRef.current = 'discover';
  showGridRef.current = true;
  setFeedTab('discover');
  setShowGrid(true);
  setPausedVideoId(null);
  loadDiscoverGrid(false);
}, [loadDiscoverGrid]);

const onTopFollow = useCallback(() => {
  if (feedTabRef.current === 'follow' && showGridRef.current) {
    loadFollowGrid(true);
    return;
  }
  saveForYouSnap();
  feedTabRef.current = 'follow';
  showGridRef.current = true;
  setFeedTab('follow');
  setShowGrid(true);
  setPausedVideoId(null);
  loadFollowGrid(false);
}, [loadFollowGrid]);

const onTopForYou = useCallback(() => {
  if (feedTabRef.current === 'foryou') {
    scrollRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    return;
  }
  const snap = forYouSnapRef.current;
  feedTabRef.current = 'foryou';
  showGridRef.current = false;
  setFeedTab('foryou');
  setShowGrid(false);
  if (snap && snap.videos && snap.videos.length) {
    const idx = Math.min(snap.index || 0, snap.videos.length - 1);
    lastViewableIndexRef.current = idx;
    lastViewableIdRef.current = snap.videos[idx]?.id;
    initialIndexRef.current = idx;
    setCurrentIndex(idx);
    setActiveVideo(idx);
    setMountIndex(idx);
    setVideos(snap.videos);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToOffset?.({ offset: idx * listHRef.current, animated: false });
    });
  } else {
    refreshRef.current?.();
  }
}, []);

// Left/Right swipe se tab badlo: Discover | Follow | For You
const swipeTabs = useSwipeTabs({
  onSwipeRight: () => {
    if (feedTabRef.current === 'foryou') onTopFollow();
    else if (feedTabRef.current === 'follow') onTopDiscover();
    else if (feedTabRef.current === 'discover') onTopLive();   // Discover ke baad All Live
  },
  onSwipeLeft: () => {
    if (feedTabRef.current === 'discover') onTopFollow();
    else if (feedTabRef.current === 'follow') onTopForYou();
  },
});

// Grid ka koi video tap kiya -> wahi list full-screen feed me, usi video se
const onGridOpen = useCallback((list, idx) => {
  if (!list || !list[idx]) return;
  showGridRef.current = false;
  setShowGrid(false);
  lastViewableIndexRef.current = -1;
  lastViewableIdRef.current = "";
  initialIndexRef.current = idx;
  setCurrentIndex(idx);
  setActiveVideo(idx);
  setMountIndex(idx);
  setPausedVideoId(null);
  setVideos(list);
  requestAnimationFrame(() => {
    scrollRef.current?.scrollToOffset?.({ offset: idx * listHRef.current, animated: false });
  });
}, []);

const onGridLiveOpen = useCallback((st) => {
  if (st.type === 'video') {
    router.push({ pathname: '/videolive', params: { id: st.id, role: 'viewer' } });
  } else if (st.layout === 'multiguest') {
    router.push({ pathname: '/MultiGuestRoom', params: { id: st.id } });
  } else {
    router.push({ pathname: '/LiveRoom', params: { id: st.id, from: 'alllive', layout: st.layout } });
  }
}, []);

const handleDoubleTapLikeRef = useRef(handleDoubleTapLike);
handleDoubleTapLikeRef.current = handleDoubleTapLike;
const onDoubleTapLike = useCallback((videoId) => handleDoubleTapLikeRef.current(videoId), []);

// Single tap = play/pause, double tap = like. lastTap/tapTimeout
// refs hain (already stable), aur setPausedVideoId React ka setState
// hai (hamesha stable), isliye ye callback bhi hamesha stable rehta hai.
const onItemPress = useCallback((videoId) => {
  const now = Date.now();

  if (lastTap.current && (now - lastTap.current) < 250) {
    if (tapTimeout.current) {
      clearTimeout(tapTimeout.current);
      tapTimeout.current = null;
    }
    lastTap.current = null;
    onDoubleTapLike(videoId);
    return;
  }

  lastTap.current = now;

  // INSTA: 300 -> 250ms, pause jaldi lage, double-tap window bhi theek rahe
  tapTimeout.current = setTimeout(() => {
    tapTimeout.current = null;
    lastTap.current = null;
    setPausedVideoId(prev => (prev === videoId ? null : videoId));
  }, 250);
}, [onDoubleTapLike]);

// router.push navigation ke liye bhi wahi ref-pattern, taaki
// expo-router ka router object badalne se bhi VideoItem re-render
// na ho.
const routerRef = useRef(router);
routerRef.current = router;

const onOpenProfile = useCallback((userId) => {
  routerRef.current.push({
    pathname: "/userProfile",
    params: { userId },
  });
}, []);

const onOpenMusic = useCallback((item) => {
  routerRef.current.push({
    pathname: "/musicDetails",
    params: {
      musicId: item.musicId || item.id,
      musicName: item.songName || "Original Audio",
      username: item.username,
      profile: item.profile,
      audioUrl: item.audioUrl || item.songUrl || item.musicUrl,
    },
  });
}, []);

// Ye sab sirf useState setters call karte hain, jo hamesha stable
// hote hain -- isliye empty dependency array safe hai.
const commentsOpeningRef = useRef(false);
const onOpenComments = useCallback((item) => {
  // SPEED: pehle checkVideoAction (network) ka intezaar hota tha, tab tak panel
  // nahi khulta tha aur user 3-4 baar click karta tha. Ab panel TURANT khulta hai,
  // lock check peeche chalta hai; lock ho to panel band + message.
  if (commentsOpeningRef.current) return; // double click ignore
  commentsOpeningRef.current = true;
  setTimeout(() => { commentsOpeningRef.current = false; }, 400);

  unstable_batchedUpdates(() => {
    setComments([]);
    setReplies({});
    setExpandedReplies({});
    setReplyingTo(null);
    setCommentLimit(COMMENT_PAGE_SIZE);
    setCommentsLoading(true);
    setSelectedVideoId(item.id);
    setSelectedVideoData({
      username: item.username,
      profile: item.profile,
      caption: item.caption,
      userId: item.userId,
      verified: item.verified || false,
      verifiedColor: item.verifiedColor || "",
      faceVerified: isFaceVerified(item),
    });
    setShowComments(true);
  });

  Promise.resolve(checkVideoAction(item.userId, "comments"))
    .then((chk) => {
      if (chk && !chk.ok) {
        setShowComments(false);
        Alert.alert("Comments Off", chk.message);
      }
    })
    .catch(() => {});
}, []);

const onOpenShare = useCallback((item) => {
  // SPEED: popup turant, lock check background me
  unstable_batchedUpdates(() => {
    setSelectedShareVideo(item);
    setShowSharePopup(true);
  });
  Promise.resolve(checkVideoAction(item.userId, "share"))
    .then((chk) => {
      if (chk && !chk.ok) {
        setShowSharePopup(false);
        Alert.alert("Share Off", chk.message);
      }
    })
    .catch(() => {});
}, []);

const onOpenStar = useCallback((videoId) => {
  setSelectedVideoId(videoId);
  setShowStarPopup(true);
}, []);





const playStarAnimation = () => {

  // Total ~3 second: chhota -> bara, beech me chamak, last me fade out
  // (starRotate yahan shine value ki tarah use hota hai)
  starScale.setValue(0.5);
  starOpacity.setValue(0);
  starRotate.setValue(0);

  const shinePulse = Animated.sequence([
    Animated.timing(starRotate,{ toValue:1, duration:300, useNativeDriver:true }),
    Animated.timing(starRotate,{ toValue:0, duration:300, useNativeDriver:true }),
  ]);

  Animated.sequence([

    Animated.parallel([
      // chhota se bara (2.6 sec)
      Animated.timing(starScale,{
        toValue:1.25,
        duration:2600,
        easing:Easing.out(Easing.cubic),
        useNativeDriver:true,
      }),

      Animated.timing(starOpacity,{
        toValue:1,
        duration:250,
        useNativeDriver:true,
      }),

      // chamak 4 baar
      Animated.sequence([
        shinePulse, shinePulse, shinePulse, shinePulse,
      ]),
    ]),

    // last me fade out (0.4 sec)
    Animated.parallel([
      Animated.timing(starOpacity,{
        toValue:0,
        duration:400,
        useNativeDriver:true,
      }),
      Animated.timing(starScale,{
        toValue:1.4,
        duration:400,
        useNativeDriver:true,
      }),
    ]),

  ]).start(()=>{
    setStarAnimationVideoId(null);
  });

};





  const trackView = async (videoId) => {
    try {
      // 30 min ke andar dobara dekhne par view nahi badhega; 30 min baad dekhte hi turant +1
      if (!(await shouldCountView(videoId))) return;
      // UI me bhi turant badhao
      setVideos(prev => prev.map(v =>
        v.id === videoId ? { ...v, views: (Number(v.views) || 0) + 1 } : v
      ));
      await updateDoc(doc(db, 'all_videos', videoId), { views: increment(1), engagementScore: increment(2) });
    } catch (error) {}
  };




const deleteComment = async (commentId) => {

  Alert.alert(
    "Delete Comment",
    "Do you want to delete this comment?",
    [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Delete",
        style: "destructive",

        onPress: async () => {

          try {

            const vid = selectedVideoId;
            setVideos((prev) => prev.map((video) =>
              video.id === vid
                ? { ...video, commentsCount: Math.max(0, (video.commentsCount || 1) - 1) }
                : video
            ));

            await deleteDoc(
              doc(
                db,
                "all_videos",
                selectedVideoId,
                "comments",
                commentId
              )
            );

            await updateDoc(
              doc(
                db,
                "all_videos",
                selectedVideoId
              ),
              {
                commentsCount: increment(-1),
              }
            );

          } catch (error) {

            __DEV__ && console.log(error);

            // fail hua -> feed ka count wapas
            setVideos((prev) => prev.map((video) =>
              video.id === selectedVideoId
                ? { ...video, commentsCount: (video.commentsCount || 0) + 1 }
                : video
            ));

            Alert.alert(
              "Error",
              "Comment delete failed"
            );
          }
        },
      },
    ]
  );
};



const deleteReply = async (commentId, replyId) => {

  Alert.alert(
    "Delete Reply",
    "Do you want to delete this reply?",
    [
      {
        text:"Cancel",
        style:"cancel",
      },

      {
        text:"Delete",
        style:"destructive",

        onPress: async()=>{

          try{


            const vid = selectedVideoId;
            setVideos((prev) => prev.map((video) =>
              video.id === vid
                ? { ...video, commentsCount: Math.max(0, (video.commentsCount || 1) - 1) }
                : video
            ));

            await deleteDoc(
              doc(
                db,
                "all_videos",
                selectedVideoId,
                "comments",
                commentId,
                "replies",
                replyId
              )
            );


            await updateDoc(
              doc(
                db,
                "all_videos",
                selectedVideoId
              ),
              {
                commentsCount: increment(-1),
              }
            );


          }catch(e){

            __DEV__ && console.log("Reply delete error",e);

          }

        }

      }

    ]
  );

};


const postComment = async () => {
  // Reply mode
  if (replyingTo) {
    await postReply();
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    Alert.alert('Login Required');
    return;
  }

  const text = commentTextRef.current.trim();

  if (blockIfProfane(text)) return;
  const videoId = selectedVideoId;
  if (!text || !videoId) return;

  // FIX: sahi naam/photo pakka karo (profile load na hui ho to yahin load hogi)
  const me = await getMyProfileNow(user);
  if (!me) {
    Alert.alert('Profile load nahi hui', 'Internet check karke dobara try karo.');
    return;
  }

  const videoMeta = videosRef.current.find((v) => v.id === videoId);

  // Turant UI clear + count badhao (optimistic)
  clearCommentInput();
  Keyboard.dismiss();
  commentListRef.current?.scrollToOffset?.({ offset: 0, animated: true });
  setVideos((prev) => prev.map((video) =>
    video.id === videoId
      ? { ...video, commentsCount: (video.commentsCount || 0) + 1 }
      : video
  ));

  try {
    // Comment + counter EK hi atomic batch me
    const batch = writeBatch(db);
    const commentRef = doc(collection(db, 'all_videos', videoId, 'comments'));

    batch.set(commentRef, {
      text,
      username: me.name,
      profilePic: me.photo,
      userId: user.uid,
      verified: me.verified || false,
      verifiedColor: me.verifiedColor || "",
      faceVerified: isFaceVerified(me),
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'all_videos', videoId), {
      commentsCount: increment(1),
      engagementScore: increment(3),
    });

    await batch.commit();
  } catch (error) {
    setVideos((prev) => prev.map((video) =>
      video.id === videoId
        ? { ...video, commentsCount: Math.max(0, (video.commentsCount || 1) - 1) }
        : video
    ));
    __DEV__ && console.log('Comment Error:', error);
    return;
  }

  // Notification BACKGROUND me (UI ko wait nahi karna padta)
  (async () => {
    try {
      let meta = videoMeta;
      if (!meta) {
        const snap = await getDoc(doc(db, 'all_videos', videoId));
        meta = snap.exists() ? snap.data() : null;
      }
      if (!meta || !meta.userId || meta.userId === user.uid) return;

      await addDoc(collection(db, 'users', meta.userId, 'notifications'), {
        type: 'comment',
        isRead: false,
        senderId: user.uid,
        senderName: me.name,
        senderPhoto: me.photo,
        videoId,
        text,
        videoCaption: meta.caption || '',
        videoThumbnail: meta.thumbnail || meta.videoThumbnail || '',
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      __DEV__ && console.log('Notification Error:', e);
    }
  })();
};


const postReply = async () => {
  const user = auth.currentUser;
  if (!user) return;

  const text = commentTextRef.current.trim();

  if (blockIfProfane(text)) return;
  const videoId = selectedVideoId;
  const parent = replyingTo;
  if (!text || !videoId || !parent) return;

  const me = await getMyProfileNow(user);
  if (!me) {
    Alert.alert('Profile load nahi hui', 'Internet check karke dobara try karo.');
    return;
  }

  // Turant UI: input clear, reply mode band, replies khul jaayein
  clearCommentInput();
  Keyboard.dismiss();
  setReplyingTo(null);
  setExpandedReplies((prev) => ({ ...prev, [parent.id]: true }));
  setVideos((prev) => prev.map((video) =>
    video.id === videoId
      ? { ...video, commentsCount: (video.commentsCount || 0) + 1 }
      : video
  ));

  try {
    const batch = writeBatch(db);
    const replyRef = doc(
      collection(db, 'all_videos', videoId, 'comments', parent.id, 'replies')
    );

    batch.set(replyRef, {
      text,
      username: me.name,
      profilePic: me.photo,
      userId: user.uid,
      verified: me.verified || false,
      verifiedColor: me.verifiedColor || "",
      faceVerified: isFaceVerified(me),
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'all_videos', videoId), {
      commentsCount: increment(1),
      engagementScore: increment(1),
    });

    await batch.commit();
  } catch (error) {
    setVideos((prev) => prev.map((video) =>
      video.id === videoId
        ? { ...video, commentsCount: Math.max(0, (video.commentsCount || 1) - 1) }
        : video
    ));
    __DEV__ && console.log("Reply Error:", error);
  }
};


// Memoized rows ke liye stable handlers (latest function ref se)
deleteCommentRef.current = deleteComment;
deleteReplyRef.current = deleteReply;

const currentUid = auth.currentUser?.uid;

const myName = currentUserData.name;
const myPhoto = currentUserData.photo;

const renderComment = useCallback(({ item: rawItem }) => {
  const mine = (o) =>
    currentUid && myName && o.userId === currentUid &&
    (o.username !== myName || o.profilePic !== myPhoto)
      ? { ...o, username: myName, profilePic: myPhoto }
      : o;
  const item = mine(rawItem);
  const rl = replies[rawItem.id];
  const replyList = rl ? rl.map(mine) : rl;
  return (
  <CommentRow
    item={item}
    replyList={replyList}
    expanded={!!expandedReplies[item.id]}
    currentUid={currentUid}
    onProfile={onCommentProfile}
    onReply={onCommentReply}
    onToggleReplies={onToggleReplies}
    onDeleteComment={onDeleteComment}
    onDeleteReply={onDeleteReply}
  />
  );
}, [replies, expandedReplies, currentUid, myName, myPhoto, onCommentProfile, onCommentReply,
    onToggleReplies, onDeleteComment, onDeleteReply]);





  const getTimeAgo = (timestamp) => {
  if (!timestamp?.seconds) return 'now';


  const now = Date.now();
  const commentTime = timestamp.seconds * 1000;

  const diff = Math.floor((now - commentTime) / 1000);

  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;

  return `${Math.floor(diff / 2592000)}mo`;
};

  // SCROLL DETECTION
  const onViewableItemsChanged = useRef(({ viewableItems }) => {

  if (!feedFocused) return; // dusre page par ho to kuch bhi play mat karo

  if (viewableItems && viewableItems.length > 0) {

    const index = viewableItems[0].index;

    // SPEED: same video dobara report ho to kuch mat karo
    // (faltu re-render + timers reset nahi honge)
    if (index === lastViewableIndexRef.current && viewableItems[0].item?.id === lastViewableIdRef.current) {
      return;
    }
    lastViewableIndexRef.current = index;
    lastViewableIdRef.current = viewableItems[0].item?.id;

    // AUDIO FIX: state/re-render se pehle hi baaki sab videos band + mute
    silenceOthers(viewableItems[0].item?.id);
    // INSTA: React ka intezaar nahi -> naya video turant play
    if (!showGridRef.current) playActiveNow(viewableItems[0].item?.id);
    scrollMutedRef.current = false;

    // requestIdleCallback hata diya: wo play shuru hone me delay
    // karta tha. Ab video turant chalta hai.
    // BATCH: 3 alag setState = 3 baar poora bhaari screen re-render (scroll me lag).
    // Ab ek hi baar.
    unstable_batchedUpdates(() => {
      setCurrentIndex(index);
      setActiveVideo(index);
      setPausedVideoId(null);
    });

    // Players ka window swipe settle hone ke baad badlo (heavy mount scroll me nahi)
    // SMOOTH: naye players (decoder) swipe animation khatam hone ke BAAD mount hon.
    // Pehle 60ms me mount hota tha -> scroll ke beech JS/native thread busy -> jhatka.
    if (mountTimeoutRef.current) clearTimeout(mountTimeoutRef.current);
    // SMOOTH: 80ms me snap animation abhi chal rahi hoti hai -> decoder start se jhatka.
    // 220ms: swipe settle hone ke baad hi naya player mount. (Agle 2 videos pehle se ready hain.)
    mountTimeoutRef.current = setTimeout(() => {
      setMountIndex(index);
    }, 250);

    const currentItem = viewableItems[0].item;

    // WARM-AHEAD: agle videos ka shuru peeche chupke se garam (player nahi banta)
    warmAhead(videosRef.current, index);

    // WARM: is video ke owner ka lock cache me pehle se -> comment/share check turant (0 wait)
    try {
      if (currentItem?.userId) getVideoLocks(currentItem.userId);
      const nextItem = videosRef.current?.[index + 1];
      if (nextItem?.userId) getVideoLocks(nextItem.userId);
    } catch (e) {}

    if (currentItem) {

      if (viewTimeout.current) {
        clearTimeout(viewTimeout.current);
      }

      viewTimeout.current = setTimeout(() => {
        trackView(currentItem.id);
      }, 2000);

      // SEEN: user ne ~3 sec dekha -> dubara feed me nahi aayega
      if (seenTimeout.current) {
        clearTimeout(seenTimeout.current);
      }

      seenTimeout.current = setTimeout(() => {
        markSeen(currentItem.id);
      }, SEEN_DWELL_MS);

    }

  }

}).current;

// WARM-UP: feed settle hone ke baad (4 sec) Discover + Follow ka data chupchap
// cache me daal do -> un tabs par jaate hi TURANT khulte hain (loader nahi).
// Interaction/idle ke baad chalta hai, isliye feed ki swipe par asar nahi.
useEffect(() => {
  let cancelled = false;
  let timer: any = null;
  const task = runAfterIdle(() => {
    timer = setTimeout(() => {
      if (cancelled) return;
      try { Promise.resolve(loadDiscover(false)).catch(() => {}); } catch (e) {}
      const u = auth.currentUser?.uid;
      if (u) {
        try { Promise.resolve(loadFollow(u, false)).catch(() => {}); } catch (e) {}
      }
    }, 4000);
  });
  return () => {
    cancelled = true;
    task.cancel();
    if (timer) clearTimeout(timer);
  };
}, []);

// Agle 10 videos ke thumbnails pehle se cache me -> swipe par black flash nahi
useEffect(() => {
  const urls = videos
    .slice(currentIndex + 1, currentIndex + 7)
    .map((v) => fixCdn(v.thumbnail))
    .filter((t) => typeof t === 'string' && t.length > 0);
  if (urls.length) {
    try { ExpoImage.prefetch(urls, 'memory-disk'); } catch (e) {}
  }
}, [currentIndex, videos]);

// ==========================
// PRELOAD NEXT 5 VIDEOS
// ==========================
useEffect(() => {

  if (videos.length === 0) {
    return;
  }

  // Last 4 videos se pehle agle videos background me load
  if (
    currentIndex >= videos.length - 6 &&
    hasMoreVideos &&
    !loadingMoreRef.current
  ) {

    loadMoreVideos();

  }

}, [
  currentIndex,
  videos.length,
  hasMoreVideos,
  loadMoreVideos
]);


const scrollMutedRef = useRef(false);

 const viewConfigRef = useRef({
  // 50%: video thoda pehle chalna shuru (60 me delay lagta tha)
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 0,
  waitForInteraction: false,
});




const feedRefreshControl = useMemo(
  () => (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={refreshVideos}
      tintColor="#f1c40f"
      colors={["#f1c40f"]}
    />
  ),
  [refreshing, refreshVideos]
);

const renderItem = useCallback(({ item, index }) => {
  // FIX: yahan sirf is ek item ke liye zaroori booleans/values
  // compute ho rahe hain, aur heavy JSX ab memoized <VideoItem/>
  // ke andar hai. Isse sirf wahi row re-render hoti hai jiska
  // data sach me badla, poori list nahi.
  const isVideoActive = isFocused && !showGrid && activeVideo === index && pausedVideoId !== item.id;
  // Pichla 1 + agle 3 videos ke player pehle se ready rakho:
  // scroll karte hi video turant chalega (na ruka, na black screen).
  // SMOOTH: players ka window (agle videos) sirf swipe SETTLE hone ke baad badalta hai
  // (mountIndex). Pehle agla player swipe animation ke BEECH me ban/toot-ta tha ->
  // frame drop (lag). Ab current video hamesha mount hai, aur uska agla video
  // pehle se mounted tha, isliye swipe par turant chalta hai.
  const perfCfg = PERF.cfg();
  const lead = Math.max(perfCfg.ahead, perfCfg.next ? 1 : 0);
  const shouldRenderVideo =
    isFocused &&
    !showGrid &&
    (index === currentIndex ||
      (index >= mountIndex && index <= mountIndex + lead));
  const nearVideo = index === currentIndex + 1;
  const isCurrent = activeVideo === index;

  return (
    <VideoItem
      itemHeight={listH}
      fullHeight={fullH}
      item={item}
      index={index}
      shouldRenderVideo={shouldRenderVideo}
      nearVideo={nearVideo}
      isVideoActive={isVideoActive}
      isCurrent={isCurrent}
      isPaused={pausedVideoId === item.id}
      showHeart={heartVideoId === item.id}
      heartTick={heartVideoId === item.id ? heartTick : 0}
      showStar={starAnimationVideoId === item.id}
      starCount={starAnimationVideoId === item.id ? starAnimationCount : 0}
      isLiked={!!localLikes[item.id]}
      followState={followingUsers[item.userId]}
      rotateAnim={rotateAnim}
      textAnim={textAnim}
      starScale={starScale}
      starOpacity={starOpacity}
      starRotate={starRotate}
      starJump={starJump}
      starTilt={starTilt}
      onItemPress={onItemPress}
      onLike={onLike}
      onFollow={onFollow}
      onOpenComments={onOpenComments}
      onOpenShare={onOpenShare}
      onOpenStar={onOpenStar}
      onOpenProfile={onOpenProfile}
      onOpenMusic={onOpenMusic}
    />
  );
},[
  listH,
  fullH,
  activeVideo,
  currentIndex,
  mountIndex,
  isFocused,
  showGrid,
  pausedVideoId,
  heartVideoId,
  heartTick,
  starAnimationVideoId,
  starAnimationCount,
  localLikes,
  followingUsers,
  onItemPress,
  onLike,
  onFollow,
  onOpenComments,
  onOpenShare,
  onOpenStar,
  onOpenProfile,
  onOpenMusic,
]);


  if (loading) return <View style={styles.loadingBox}><ActivityIndicator size="large" color="#f1c40f" /></View>;

  return (
    <View style={styles.fullScreenOverlay} onLayout={onRootLayout} {...swipeTabs}>
      {/* STATUS BAR BLACK: charging / time / date wali top patti black.
          translucent rakha taaki layout (top bar, icons) ki jagah na badle;
          upar ek black strip status bar ki height ki lagayi hai. */}
      <StatusBar translucent backgroundColor="#000000" barStyle="light-content" />
      <View style={styles.statusBarBlack} pointerEvents="none" />
      <StarToastView />

      {/* BACKGROUND REEL UPLOAD — top-left percent indicator.
          Standalone component below re-renders on its own; ye line
          poore feed ko touch nahi karti. */}
      <UploadStatusBadge />



     <FlatList
     ref={scrollRef}
        style={{ height: listH, flexGrow: 0 }}
        data={videos}
        renderItem={renderItem}
        keyExtractor={feedKeyExtractor}
        pagingEnabled={Platform.OS === 'ios'}
        snapToOffsets={snapOffsets}
        snapToAlignment="start"
        onMomentumScrollEnd={onMomentumEnd}
        decelerationRate="fast"
disableIntervalMomentum={true}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewConfigRef.current}
        refreshControl={feedRefreshControl}

        /* removeClippedSubviews video surface ko baar-baar detach/attach
           karta tha (black flash + atakna) -> band. */
        removeClippedSubviews={false}
        windowSize={Math.max(PERF.cfg().ahead, PERF.cfg().next ? 1 : 0) >= 2 ? 5 : 3} /* +2 ahead ke liye 5, warna 3 (decoder kam) */
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        updateCellsBatchingPeriod={50}
        scrollEventThrottle={16}
        bounces={false}
        overScrollMode="never"
        directionalLockEnabled






        getItemLayout={getItemLayoutFn}
        initialScrollIndex={initialIndexRef.current}
      />



      {/* TOP BAR: Live icon | Discover | Follow | For You (Tiki style) */}
      <FeedTopBar
        activeTab={feedTab}
        onLive={onTopLive}
        onDiscover={onTopDiscover}
        onFollow={onTopFollow}
        onForYou={onTopForYou}
      />

      {showGrid && (feedTab === 'follow' || feedTab === 'discover') && (
        <TabGrid
          mode={feedTab}
          data={feedTab === 'follow' ? followList : discoverList}
          live={feedTab === 'follow' ? liveList : null}
          loading={gridLoading}
          onOpen={onGridOpen}
          onLive={onGridLiveOpen}
        />
      )}

  

{showStarPopup && (
  <StarPopup myStars={myStars} myTotalSpent={myTotalSpent} myWalletLevel={myWalletLevel} playStarAnimation={playStarAnimation} router={router} selectedStar={selectedStar} selectedVideoId={selectedVideoId} setSelectedStar={setSelectedStar} setShowStarPopup={setShowStarPopup} setStarAnimationCount={setStarAnimationCount} setStarAnimationVideoId={setStarAnimationVideoId} starSending={starSending} />
)}



{showSharePopup && (
  <SharePopup SHARE_APPS={SHARE_APPS} copyVideoLink={copyVideoLink} onSharePick={onSharePick} router={router} selectedShareVideo={selectedShareVideo} setShowSharePopup={setShowSharePopup} />
)}



{showComments && (
  <CommentsSheet closeComments={closeComments} commentAnim={commentAnim} commentBackdrop={commentBackdrop} commentInputRef={commentInputRef} commentListRef={commentListRef} commentPan={commentPan} commentTextRef={commentTextRef} comments={comments} commentsLoading={commentsLoading} currentUserData={currentUserData} keyboardHeight={keyboardHeight} loadMoreComments={loadMoreComments} onCommentChange={onCommentChange} postComment={postComment} renderComment={renderComment} replyingTo={replyingTo} />
)}


      <BottomBar pathname={pathname} onLayout={onNavLayout} />
    </View>
  );
}

