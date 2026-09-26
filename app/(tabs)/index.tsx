// ==========================
// IMPORTS
// ==========================
import React, { memo,  useRef, useState, useEffect, useCallback } from 'react';

import { InteractionManager } from "react-native";

import { 
  View,
  Text,
  TouchableOpacity,
  Pressable,  
  StyleSheet,
  Dimensions,
  FlatList,
  Platform,
  Image,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Share,
  Alert,
  TextInput,
  BackHandler,
    Keyboard, 
      Animated,
} from 'react-native';





import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  increment,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  limit,
  addDoc,
  getDocs,
  startAfter,
  where,
  documentId,
} from 'firebase/firestore';



import { VideoView, useVideoPlayer } from 'expo-video';
import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { useRouter, usePathname, useFocusEffect } from 'expo-router';

// ==========================
// FIREBASE
// ==========================
import { db } from '../firebaseConfig';

import { getAuth, onAuthStateChanged } from 'firebase/auth';



const { height, width } = Dimensions.get('screen');

const auth = getAuth(); 



const FeedVideo = memo(
function FeedVideo({ uri, active }) {

  const player = useVideoPlayer(uri, (player) => {
    player.loop = true;

    player.bufferOptions={
preferredForwardBufferDuration:5
};
  });

 
useEffect(()=>{

let mounted=true;

const start=async()=>{

if(!mounted)return;

if(active){

await player.play();

}else{

await player.pause();

}

};

start();

return()=>{

mounted=false;

};

},[active]);


  return (
    <VideoView
      style={styles.video}
      player={player}
      nativeControls={false}
      allowsFullscreen={false}
      allowsPictureInPicture={false}
      contentFit="cover"
    />
  );
},

(prevProps, nextProps) => {
  return (
    prevProps.uri === nextProps.uri &&
    prevProps.active === nextProps.active
  );
}

);


// ======================================================
// VideoItem — memoized single feed row
// ======================================================
// FIX (biggest perf change): pehle ye poora JSX seedha renderItem
// ke andar tha, aur renderItem ek useCallback tha jiski dependency
// list me activeVideo/currentIndex/pausedVideoId/localLikes/
// followingUsers/starAnimationVideoId the -- yani scroll ke har
// step par, ya kahin bhi like/follow hone par, renderItem ki
// identity badal jaati thi. Isse FlatList currently-mounted SAARE
// cells ko re-render kar deta tha, sirf jo actually change hua wo
// nahi.
//
// Ab actual row JSX ek alag React.memo() component me hai. renderItem
// ab sirf is item ke liye zaroori props compute karke <VideoItem/>
// return karta hai. React.memo apne aap shallow-compare karke sirf
// UN cells ko re-render karega jinke props sach me badle hain --
// baaki sab as-is rahenge. Isse scroll aur like/follow tap dono
// kaafi zyada smooth feel honge.
const VideoItem = memo(function VideoItem({
  item,
  index,
  shouldRenderVideo,
  isVideoActive,
  showHeart,
  showStar,
  isLiked,
  isFollowing,
  rotateAnim,
  textAnim,
  starScale,
  starOpacity,
  starRotate,
  starJump,
  starTilt,
  onItemPress,
  onLike,
  onFollow,
  onOpenComments,
  onOpenShare,
  onOpenStar,
  onOpenProfile,
  onOpenMusic,
}) {
  return (
    <TouchableOpacity
      activeOpacity={1}
      style={{ width, height: height, backgroundColor: '#000' }}
      onPress={() => onItemPress(item.id)}
    >

      {shouldRenderVideo ? (
        <FeedVideo
          uri={item.videoUrl || item.video}
          active={isVideoActive}
        />
      ) : (
        <View
          style={{
            width,
            height,
            backgroundColor: "#000"
          }}
        />
      )}

      {showHeart && (
        <View style={styles.heartPopup}>
          <Ionicons
            name="heart"
            size={140}
            color="#ff004f"
          />
        </View>
      )}

      {showStar && (
        <View
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
          pointerEvents="none"
        >
          <Animated.Image
            source={require("../../assets/star-logo.png")}
            style={{
              width: 170,
              height: 170,
              opacity: starOpacity,
              transform: [
                { translateY: starJump },
                { scale: starScale },
                {
                  rotateZ: starRotate.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0deg", "720deg"]
                  })
                },
                {
                  rotateY: starTilt.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: ["0deg", "180deg", "360deg"]
                  })
                },
                {
                  rotateX: starTilt.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: ["0deg", "25deg", "0deg"]
                  })
                }
              ],
              shadowColor: "#FFD700",
              shadowOpacity: 1,
              shadowRadius: 35,
              elevation: 35,
              resizeMode: "contain",
            }}
          />
        </View>
      )}

      <View style={styles.overlay} />
      <View style={styles.bottomLeft}>

        <View style={styles.userRow}>
          <Text style={styles.userName}>
            {item.username || "@user"}
          </Text>

          {item.verified && (
            <View style={styles.badge}>
              <MaterialCommunityIcons
                name="check-decagram"
                size={17}
                color={
                  item?.verifiedColor === "yellow"
                    ? "#FFD700"
                    : "#ffffff"
                }
              />
              <Ionicons
                name="checkmark"
                size={10}
                color="#131212"
                style={styles.badgeTick}
              />
            </View>
          )}
        </View>

        <Text style={styles.caption} numberOfLines={1} ellipsizeMode="tail">{item.caption}</Text>

        <TouchableOpacity
          style={styles.musicRow}
          activeOpacity={0.8}
          onPress={() => onOpenMusic(item)}
        >
          <Animated.View
            style={[
              styles.musicDiscOuter,
              {
                transform: [
                  {
                    rotate: rotateAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "360deg"],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.vinylDisc}>
              <Image
                source={{
                  uri:
                    item.profile ||
                    "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
                }}
                style={styles.musicCenterImage}
              />
              <View style={styles.musicDot} />
            </View>
          </Animated.View>

          <View style={styles.musicTextContainer}>
            <Animated.Text
              style={[
                styles.musicText,
                {
                  transform: [
                    { translateX: textAnim }
                  ]
                }
              ]}
              numberOfLines={1}
            >
              🎵 Music • {item.username} • Original Audio
            </Animated.Text>
          </View>
        </TouchableOpacity>

      </View>

      <View style={styles.rightIcons}>

        <View style={[styles.iconBox, { marginBottom: 18 }]}>
          <TouchableOpacity onPress={() => onOpenProfile(item.userId)}>
            <Image
              source={{
                uri:
                  item.profile ||
                  "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
              }}
              style={styles.profileImage}
            />
          </TouchableOpacity>

          {auth.currentUser?.uid !== item.userId && !isFollowing && (
            <TouchableOpacity
              style={styles.plusIconSmall}
              onPress={() => onFollow(item.userId)}
            >
              <Ionicons
                name="add"
                size={12}
                color="#000"
              />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.iconBox} onPress={() => onLike(item.id)}>
          <Ionicons name="heart" size={40} color={isLiked ? "red" : "white"} />
          <Text style={styles.iconText}>
            {item.likes || 0}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBox}
          onPress={() => onOpenComments(item)}
        >
          <Ionicons name="chatbubble" size={35} color="#ffffff" />
          <Text style={styles.iconText}>{item.commentsCount || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBox}
          onPress={() => onOpenShare(item)}
        >
          <Ionicons name="arrow-redo" size={38} color="#ffffff" />
          <Text style={styles.iconText}>{item.shares || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBox}
          onPress={() => onOpenStar(item.id)}
        >
          <Image
            source={require('../../assets/star-logo.png')}
            style={styles.starImage}
          />
          <Text style={styles.starUpText}>StarUp</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});


export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
const [showSharePopup, setShowSharePopup] = useState(false);
const [selectedShareVideo, setSelectedShareVideo] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeVideo, setActiveVideo] = useState(0);
  const [currentIndex,setCurrentIndex]=useState(0);
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
    currentIndex + 2
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

  likeFollowWindowRef.current = windowKey;


  const loadNearbyLikesAndFollowing = async () => {

    try {

      // ==================================================
      // 1. LIKES
      // ==================================================

      const videoIds = nearbyVideos
        .map(video => video.id)
        .filter(Boolean);

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

          const updated = {
            ...prev
          };

          videoIds.forEach(videoId => {

            // Slow network ke dauran optimistic like ko overwrite mat karo.
            if (!pendingLikeRef.current[videoId]) {
              updated[videoId] = nearbyLikes[videoId] === true;
            }

          });

          return updated;

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
                userId !== user.uid
            )
        )
      ];


      if (userIds.length > 0) {

        const followingQuery = query(
          collection(
            db,
            "users",
            user.uid,
            "following"
          ),
          where(
            documentId(),
            "in",
            userIds
          )
        );

        const followingSnapshot =
          await getDocs(
            followingQuery
          );

        const nearbyFollowing = {};

        followingSnapshot.forEach(
          (followDoc) => {

            nearbyFollowing[followDoc.id] = true;

          }
        );


        setFollowingUsers(prev => {

          const updated = {
            ...prev
          };

          userIds.forEach(userId => {

            updated[userId] =
              nearbyFollowing[userId] === true;

          });

          return updated;

        });

      }

    } catch (error) {

      console.log(
        "Nearby Like/Following Error:",
        error
      );

    }

  };


  loadNearbyLikesAndFollowing();


}, [
  currentIndex,
  videos
]);



  const [heartVideoId, setHeartVideoId] = useState(null);
const lastTap = useRef(null);
const tapTimeout = useRef(null);
const likeQueueRef = useRef({});
const pendingLikeRef = useRef({});
const viewTimeout = useRef(null);
const heartTimeout = useRef(null);

useEffect(() => {
  return () => {
    if (tapTimeout.current) clearTimeout(tapTimeout.current);
    if (viewTimeout.current) clearTimeout(viewTimeout.current);
    if (heartTimeout.current) clearTimeout(heartTimeout.current);
  };
}, []);


  const [showComments, setShowComments] = useState(false);
const commentAnim = useRef(new Animated.Value(height)).current;

const keyboardHeight = useRef(new Animated.Value(0)).current;

const [selectedVideoId, setSelectedVideoId] = useState(null);
const [commentText, setCommentText] = useState('');
const [comments, setComments] = useState([]);
const [commentsLoading, setCommentsLoading] = useState(false);
const replyUnsubscribers = useRef([]);
const [replyingTo, setReplyingTo] = useState(null);

const [replies, setReplies] = useState({});

const [replyText, setReplyText] = useState("");

const [expandedReplies, setExpandedReplies] = useState({});

const [replyCounts, setReplyCounts] = useState({});

const [currentUserData, setCurrentUserData] = useState({
  
  name: 'User',
  photo: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
});
  
const [selectedVideoData, setSelectedVideoData] = useState(null);

const [showStarPopup, setShowStarPopup] = useState(false);
const [selectedStar, setSelectedStar] = useState(null);

const [myStars, setMyStars] = useState(0);

const [starAnimationVideoId, setStarAnimationVideoId] = useState(null);

const starScale = useRef(new Animated.Value(0)).current;

const starRotate = useRef(new Animated.Value(0)).current;

const starOpacity = useRef(new Animated.Value(0)).current;

const starJump = useRef(new Animated.Value(0)).current;

const starTilt = useRef(new Animated.Value(0)).current;

const [blockedUsers, setBlockedUsers] = useState([]);

const [followingUsers, setFollowingUsers] = useState({});

const rotateAnim = useRef(new Animated.Value(0)).current;

const textAnim = useRef(new Animated.Value(0)).current;


useEffect(() => {

    const user = auth.currentUser;

    if (!user) return;

    const loadBlockedUsers = async () => {

        const snapshot = await getDocs(
            collection(db, "users", user.uid, "blockedUsers")
        );

        const ids = snapshot.docs.map(doc => doc.id);

        setBlockedUsers(ids);

    };

    loadBlockedUsers();

}, []);





useEffect(() => {

  Animated.loop(

    Animated.timing(
      rotateAnim,
      {
        toValue: 1,
        duration: 2200,
        useNativeDriver: true,
      }
    )

  ).start();

}, []);

useEffect(() => {

  Animated.loop(

    Animated.sequence([

      Animated.timing(textAnim,{
        toValue:-180,
        duration:5000,
        useNativeDriver:true,
      }),

      Animated.timing(textAnim,{
        toValue:0,
        duration:0,
        useNativeDriver:true,
      }),

    ])

  ).start();

},[]);


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

// FETCH FIRST 3 VIDEOS
// ==========================
useEffect(() => {

  let cancelled = false;

  const loadFirstVideos = async () => {

    try {

      const q = query(
        collection(db, "all_videos"),
        orderBy("createdAt", "desc"),
        orderBy("__name__", "desc"),
        limit(6)
      );

      const snapshot = await getDocs(q);

      if (cancelled) return;

      const loadedVideos = [];

      snapshot.forEach((docItem) => {

        const data = docItem.data();

        if (
          data.status !== "blocked" &&
          data.hidden !== true &&
          !blockedUsers.includes(data.userId)
        ) {

          loadedVideos.push({
            id: docItem.id,
            ...data,
            verified: data.verified || false,
            verifiedColor: data.verifiedColor || "",
          });

        }

      });

      if (snapshot.docs.length > 0) {

        lastVideoDocRef.current =
          snapshot.docs[snapshot.docs.length - 1];

      }

      setHasMoreVideos(snapshot.docs.length === 6);

      // User variety:
      // same user ke videos ko lagatar aane se roko.
      const mixedVideos = arrangeFeedVideos(loadedVideos);

      setVideos(mixedVideos);

    } catch (error) {

      console.log("Firebase Video Error:", error);

    } finally {

      if (!cancelled) {
        setLoading(false);
      }

    }

  };

  loadFirstVideos();

  return () => {
    cancelled = true;
  };

}, [blockedUsers]);

// Pull-to-refresh: same feed, fresh order + user variety.
const refreshVideos = useCallback(async () => {
  if (refreshing) return;
  setRefreshing(true);

  try {

    const q = query(
      collection(db, "all_videos"),
      orderBy("createdAt", "desc"),
      orderBy("__name__", "desc"),
      limit(6)
    );

    const snapshot = await getDocs(q);
    const refreshedVideos = [];

    snapshot.forEach((docItem) => {

      const data = docItem.data();

      if (
        data.status !== "blocked" &&
        data.hidden !== true &&
        !blockedUsers.includes(data.userId)
      ) {

        refreshedVideos.push({
          id: docItem.id,
          ...data,
          verified: data.verified || false,
          verifiedColor: data.verifiedColor || "",
        });

      }

    });

    const mixedVideos = arrangeFeedVideos(refreshedVideos);

    lastVideoDocRef.current = snapshot.docs.length
      ? snapshot.docs[snapshot.docs.length - 1]
      : null;

    setHasMoreVideos(snapshot.docs.length === 6);
    setCurrentIndex(0);
    setActiveVideo(0);
    setPausedVideoId(null);
    setVideos(mixedVideos);

  } catch (error) {

    console.log("Refresh Videos Error:", error);

  } finally {

    setRefreshing(false);

  }

}, [blockedUsers, refreshing]);



// ==========================
// LOAD NEXT 5 VIDEOS
// ==========================
const loadMoreVideos = useCallback(async () => {

  if (loadingMoreRef.current) {
    return;
  }

  if (!hasMoreVideos) {
    return;
  }

  if (!lastVideoDocRef.current) {
    return;
  }

  loadingMoreRef.current = true;

  try {

    const nextQuery = query(
      collection(db, "all_videos"),
      orderBy("createdAt", "desc"),
      orderBy("__name__", "desc"),
      startAfter(lastVideoDocRef.current),
      limit(5)
    );

    const snapshot = await getDocs(nextQuery);

    if (snapshot.empty) {

      setHasMoreVideos(false);

      return;
    }

    const newVideos = [];

    snapshot.forEach((docItem) => {

      const data = docItem.data();

      if (
        data.status !== "blocked" &&
        data.hidden !== true &&
        !blockedUsers.includes(data.userId)
      ) {

        newVideos.push({
          id: docItem.id,
          ...data,
          verified: data.verified || false,
          verifiedColor: data.verifiedColor || "",
        });

      }

    });

    lastVideoDocRef.current =
      snapshot.docs[snapshot.docs.length - 1];

    if (snapshot.docs.length < 5) {
      setHasMoreVideos(false);
    }

    if (newVideos.length > 0) {

      setVideos(prevVideos => {

        const existingIds = new Set(
          prevVideos.map(video => video.id)
        );

        const uniqueNewVideos = newVideos.filter(
          video => !existingIds.has(video.id)
        );

        // IMPORTANT:
        // Previous feed ke last 3 users ko bhi cooldown me rakho.
        // Isliye page boundary par bhi same user turant repeat nahi hoga.
        const mixedNewVideos = arrangeFeedVideos(
          uniqueNewVideos,
          prevVideos
        );

        return [
          ...prevVideos,
          ...mixedNewVideos
        ];

      });

    }

  } catch (error) {

    console.log(
      "Load More Videos Error:",
      error
    );

  } finally {

    loadingMoreRef.current = false;

  }

}, [hasMoreVideos, blockedUsers]);






  useEffect(() => {
  const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data();

          setCurrentUserData({
            name: data.username || data.name || 'User',
            photo:
              data.profileImg ||
              'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
               verified: data.verified || false,
               verifiedColor: data.verifiedColor || "",
          });
        }
      } catch (error) {
        console.log(error);
      }
    }
  });

  return () => unsubscribeAuth();
}, []);



useEffect(() => {
  let unsubscribeWallet = null;

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!user) {
      setMyStars(0);
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
        } else {
          setMyStars(0);
        }
      })
      .catch((error) => {
        console.log("Wallet Stars Load Error:", error);
      });

    if (unsubscribeWallet) {
      unsubscribeWallet();
    }

    unsubscribeWallet = onSnapshot(
      walletRef,
      (snap) => {
        if (snap.exists()) {
          setMyStars(snap.data().stars || 0);
        } else {
          setMyStars(0);
        }
      },
      (error) => {
        console.log("Wallet Stars Realtime Error:", error);
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

  const show = Keyboard.addListener(
    "keyboardDidShow",
    (e) => {

      Animated.timing(keyboardHeight,{
        toValue:e.endCoordinates.height,
        duration:250,
        useNativeDriver:false,
      }).start();

    }
  );

  const hide = Keyboard.addListener(
    "keyboardDidHide",
    ()=>{

      Animated.timing(keyboardHeight,{
        toValue:0,
        duration:250,
        useNativeDriver:false,
      }).start();

    }
  );

  return ()=>{
    show.remove();
    hide.remove();
  };

},[]);




useEffect(() => {

    if (showComments) {

        Animated.spring(commentAnim,{
            toValue:0,
            useNativeDriver:true,
            speed:15,
            bounciness:4
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
      setIsFocused(true);
  return () => {
  setIsFocused(false);
};
    }, [activeVideo])
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
      setShowComments(false);
      return true;
    }

    return false;
  };

  const backHandler = BackHandler.addEventListener(
    'hardwareBackPress',
    backAction
  );

  return () => backHandler.remove();
}, [showComments, showStarPopup, showSharePopup]);




useEffect(() => {

if (!selectedVideoId) return;


setComments([]);
setReplies({});
setCommentsLoading(true);


// purane reply listeners band karo
replyUnsubscribers.current.forEach(unsub => unsub());
replyUnsubscribers.current = [];


const q = query(
  collection(
    db,
    "all_videos",
    selectedVideoId,
    "comments"
  ),
  orderBy("createdAt","desc")
);



const unsubscribe = onSnapshot(
q,
(snapshot)=>{


const data = snapshot.docs.map(doc=>({
id:doc.id,
...doc.data()
}));


setComments(data);

// FIX: purane reply listeners yahan bhi band karo, sirf effect
// ke start par nahi. Warna har naya comment aane/update hone par
// har comment ke liye ek naya duplicate listener jama hota rehta
// hai (listener + memory leak, jo time ke saath app ko slow
// karta hai).
replyUnsubscribers.current.forEach(unsub => unsub());
replyUnsubscribers.current = [];

data.forEach((comment)=>{


const replyQuery = query(

collection(
db,
"all_videos",
selectedVideoId,
"comments",
comment.id,
"replies"
),

orderBy(
"createdAt",
"asc"
)

);



const replyUnsub = onSnapshot(
replyQuery,
(replySnap)=>{


setReplies(prev=>({

...prev,

[comment.id]:

replySnap.docs.map(doc=>({
id:doc.id,
...doc.data()
}))

}));


});


replyUnsubscribers.current.push(replyUnsub);



});



setCommentsLoading(false);


},

(error)=>{

console.log("Comment Load Error",error);

setCommentsLoading(false);

}

);



return ()=>{


unsubscribe();


replyUnsubscribers.current.forEach(
unsub=>unsub()
);


replyUnsubscribers.current=[];


};



},[selectedVideoId]);

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

  setLocalLikes(prev => ({
    ...prev,
    [videoId]: nextLiked,
  }));

  setVideos(prev =>
    prev.map(video =>
      video.id === videoId
        ? {
            ...video,
            likes: Math.max(
              0,
              (video.likes || 0) + (nextLiked ? 1 : -1)
            ),
          }
        : video
    )
  );

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
                senderName: currentUserData.name,
                senderPhoto: currentUserData.photo,
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
      console.log("Like Firebase Error:", e);
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
  if (!user || user.uid === targetUserId) return;

  const followingRef = doc(db, "users", user.uid, "following", targetUserId);
  const followerRef = doc(db, "users", targetUserId, "followers", user.uid);
  const myUserRef = doc(db, "users", user.uid);
  const targetUserRef = doc(db, "users", targetUserId);
  const isFollowing = !!followingUsers[targetUserId];

  try {
    if (isFollowing) {
      await deleteDoc(followingRef);
      await deleteDoc(followerRef);
      await updateDoc(myUserRef, { following: increment(-1) });
      await updateDoc(targetUserRef, { followers: increment(-1) });
      setFollowingUsers(prev => ({ ...prev, [targetUserId]: false }));
    } else {
      await setDoc(followingRef, { createdAt: serverTimestamp() });
      await setDoc(followerRef, { createdAt: serverTimestamp() });
      await updateDoc(myUserRef, { following: increment(1) });
      await updateDoc(targetUserRef, { followers: increment(1) });
      setFollowingUsers(prev => ({ ...prev, [targetUserId]: true }));
    }
  } catch (e) {
    console.log("Follow Error:", e);
  }
};


const handleDoubleTapLike = (videoId) => {

  // Heart animation
  setHeartVideoId(videoId);

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

const handleDoubleTapLikeRef = useRef(handleDoubleTapLike);
handleDoubleTapLikeRef.current = handleDoubleTapLike;
const onDoubleTapLike = useCallback((videoId) => handleDoubleTapLikeRef.current(videoId), []);

// Single tap = play/pause, double tap = like. lastTap/tapTimeout
// refs hain (already stable), aur setPausedVideoId React ka setState
// hai (hamesha stable), isliye ye callback bhi hamesha stable rehta hai.
const onItemPress = useCallback((videoId) => {
  const now = Date.now();

  if (lastTap.current && (now - lastTap.current) < 300) {
    if (tapTimeout.current) {
      clearTimeout(tapTimeout.current);
      tapTimeout.current = null;
    }
    lastTap.current = null;
    onDoubleTapLike(videoId);
    return;
  }

  lastTap.current = now;

  tapTimeout.current = setTimeout(() => {
    tapTimeout.current = null;
    lastTap.current = null;
    setPausedVideoId(prev => (prev === videoId ? null : videoId));
  }, 300);
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
const onOpenComments = useCallback((item) => {
  setComments([]);
  setReplies({});
  setExpandedReplies({});
  setReplyingTo(null);
  setCommentsLoading(true);
  setSelectedVideoId(item.id);
  setSelectedVideoData({
    username: item.username,
    profile: item.profile,
    caption: item.caption,
    userId: item.userId,
    verified: item.verified || false,
    verifiedColor: item.verifiedColor || "",
  });
  setShowComments(true);
}, []);

const onOpenShare = useCallback((item) => {
  setSelectedShareVideo(item);
  setShowSharePopup(true);
}, []);

const onOpenStar = useCallback((videoId) => {
  setSelectedVideoId(videoId);
  setShowStarPopup(true);
}, []);





const playStarAnimation = () => {

  starScale.setValue(0.2);
  starOpacity.setValue(0);
  starRotate.setValue(0);
  starJump.setValue(40);
  starTilt.setValue(0);

  Animated.parallel([

    Animated.spring(starScale,{
      toValue:1.3,
      friction:3,
      tension:120,
      useNativeDriver:true,
    }),

    Animated.timing(starOpacity,{
      toValue:1,
      duration:150,
      useNativeDriver:true,
    }),

    Animated.timing(starRotate,{
      toValue:1,
      duration:1200,
      useNativeDriver:true,
    }),

    Animated.timing(starTilt,{
      toValue:1,
      duration:1200,
      useNativeDriver:true,
    }),

    Animated.spring(starJump,{
      toValue:-50,
      friction:4,
      useNativeDriver:true,
    })

  ]).start(()=>{

    Animated.sequence([

      Animated.spring(starScale,{
        toValue:1.6,
        friction:3,
        useNativeDriver:true,
      }),

      Animated.delay(700),

      Animated.parallel([

        Animated.timing(starOpacity,{
          toValue:0,
          duration:500,
          useNativeDriver:true,
        }),

        Animated.timing(starScale,{
          toValue:2,
          duration:500,
          useNativeDriver:true,
        })

      ])

    ]).start(()=>{

      setStarAnimationVideoId(null);

    });

  });

};




  const handleShare = async (videoUrl, videoId) => {



    try {
      const result = await Share.share({ 
        message: `Check out this amazing video on Star App! ${videoUrl || ''}`,
      });
      if (result.action === Share.sharedAction) {
        setVideos(prev => prev.map(video =>
          video.id === videoId
            ? { ...video, shares: (video.shares || 0) + 1 }
            : video
        ));
        await updateDoc(doc(db, 'all_videos', videoId), { shares: increment(1), engagementScore: increment(10) });
      }
    } catch (e) { console.log("Share Error", e); }
  };

  const trackView = async (videoId) => {
    try {
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

            console.log(error);

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

            console.log("Reply delete error",e);

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

console.log("Selected Video:", selectedVideoId);
console.log("Comment:", commentText);

  const user = auth.currentUser;

  if (!user) {
    Alert.alert('Login Required');
    return;
  }

  if (!commentText.trim()) {
    return;
  }

const text = commentText.trim();

// Turant UI clear karo
setCommentText("");
Keyboard.dismiss();

  // Comment count turant screen par badhe.
  setVideos(prev => prev.map(video =>
    video.id === selectedVideoId
      ? { ...video, commentsCount: (video.commentsCount || 0) + 1 }
      : video
  ));

  try {
    await addDoc(
      collection(
        db,
        'all_videos',
        selectedVideoId,
        'comments'
      ),
      {
        text: text,
        username: currentUserData.name,
profilePic: currentUserData.photo,
        userId: user.uid,
         verified: currentUserData?.verified || false,
         verifiedColor:
  currentUserData?.verifiedColor || "",
        createdAt: serverTimestamp(),
      }
    );

    await updateDoc(
      doc(db, 'all_videos', selectedVideoId),
      {
        commentsCount: increment(1),
        engagementScore: increment(3),
      }
    );


const videoSnap = await getDoc(
  doc(db, "all_videos", selectedVideoId)
);

if (videoSnap.exists()) {

  const videoData = videoSnap.data();

  if (videoData.userId !== user.uid) {

    await addDoc(
  collection(
    db,
    "users",
    videoData.userId,
    "notifications"
  ),
  {
    type: "comment",
isRead: false,
    senderId: user.uid,
    senderName: currentUserData.name,
    senderPhoto: currentUserData.photo,

    videoId: selectedVideoId, // IMPORTANT

    text: text,

    videoCaption: videoData.caption || "",

    videoThumbnail:
      videoData.thumbnail ||
      videoData.videoThumbnail ||
      "",

    createdAt: serverTimestamp(),
  }
);

  }

}




    
  } catch (error) {
    setVideos(prev => prev.map(video =>
      video.id === selectedVideoId
        ? { ...video, commentsCount: Math.max(0, (video.commentsCount || 1) - 1) }
        : video
    ));
    console.log('Comment Error:', error);
  }
};





const postReply = async () => {

  const user = auth.currentUser;

  if (!user) return;

  if (!commentText.trim()) return;

  const text = commentText.trim();

  setCommentText("");

  Keyboard.dismiss();

  try {

    await addDoc(

      collection(
        db,
        "all_videos",
        selectedVideoId,
        "comments",
        replyingTo.id,
        "replies"
      ),

      {
        text: text,
        username: currentUserData.name,
        profilePic: currentUserData.photo,
        userId: user.uid,
        verified: currentUserData.verified || false,
        verifiedColor:
          currentUserData.verifiedColor || "",
        createdAt: serverTimestamp(),
      }

    );

await updateDoc(
  doc(db, "all_videos", selectedVideoId),
  {
    commentsCount: increment(1),
    engagementScore: increment(1),
  }
);

    setReplyingTo(null);

  } catch (error) {

    console.log("Reply Error:", error);

  }

};




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

  if (viewableItems && viewableItems.length > 0) {

    const index = viewableItems[0].index;

    InteractionManager.runAfterInteractions(() => {

      setCurrentIndex(index);
      setActiveVideo(index);
      setPausedVideoId(null);

    });

    if (viewableItems[0].item) {

      if (viewTimeout.current) {
        clearTimeout(viewTimeout.current);
      }

      viewTimeout.current = setTimeout(() => {

        trackView(
          viewableItems[0].item.id
        );

      }, 2000);

    }

  }

}).current;

// ==========================
// PRELOAD NEXT 5 VIDEOS
// ==========================
useEffect(() => {

  if (videos.length === 0) {
    return;
  }

  // Last 3 videos se pehle next 5 videos background me load
  if (
    currentIndex >= videos.length - 3 &&
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


 const viewConfigRef = useRef({
  itemVisiblePercentThreshold: 80,
});

  const getIconColor = (path) => pathname === path ? '#3498db' : '#ffffff';



const renderItem = useCallback(({ item, index }) => {
  // FIX: yahan sirf is ek item ke liye zaroori booleans/values
  // compute ho rahe hain, aur heavy JSX ab memoized <VideoItem/>
  // ke andar hai. Isse sirf wahi row re-render hoti hai jiska
  // data sach me badla, poori list nahi.
  const isVideoActive = isFocused && activeVideo === index && pausedVideoId !== item.id;
  const shouldRenderVideo = index >= currentIndex - 1 && index <= currentIndex + 2;

  return (
    <VideoItem
      item={item}
      index={index}
      shouldRenderVideo={shouldRenderVideo}
      isVideoActive={isVideoActive}
      showHeart={heartVideoId === item.id}
      showStar={starAnimationVideoId === item.id}
      isLiked={!!localLikes[item.id]}
      isFollowing={!!followingUsers[item.userId]}
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
  activeVideo,
  currentIndex,
  isFocused,
  pausedVideoId,
  heartVideoId,
  starAnimationVideoId,
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
    <View style={styles.fullScreenOverlay}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      




     <FlatList
     ref={scrollRef}
        data={videos}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        pagingEnabled
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        scrollEventThrottle={16}
disableIntervalMomentum={true}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewConfigRef.current}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshVideos}
            tintColor="#f1c40f"
            colors={["#f1c40f"]}
          />
        }

        removeClippedSubviews={true}
        windowSize={5}
initialNumToRender={2}
maxToRenderPerBatch={2}
updateCellsBatchingPeriod={30}
maintainVisibleContentPosition={{
minIndexForVisible:0
}}

scrollEventThrottle={8}
    
disableVirtualization={false}






        getItemLayout={(data, index) => (
          { length: height, offset: height * index, index }
        )}
      />



      {/* TOP TABS CONTAINER - LINKED WITH all-live SCREEN */}
      <View style={styles.topTabsContainer}>
          <TouchableOpacity onPress={() => router.push('/all-live')}>
            <Text style={styles.tabText}>🎥 Live</Text>
          </TouchableOpacity>
          
          <View style={styles.separator} />
          
          <TouchableOpacity>
            <Text style={[styles.tabText, { fontWeight: 'bold' }]}>For You</Text>
            <View style={styles.activeUnderline} />
          </TouchableOpacity>
      </View>

  

{showStarPopup && (

<View
  style={{
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 9999,
  }}
>

  <Pressable
    style={StyleSheet.absoluteFill}
    onPress={() => setShowStarPopup(false)}
  />

  <View style={styles.starPopup}>

    <View style={styles.myStarBox}>

      <Image
        source={require('../../assets/star-logo.png')}
        style={styles.myStarImage}
      />

      <Text style={styles.myStarText}>
        {myStars}
      </Text>

    </View>

    <View style={styles.starRow}>

      <TouchableOpacity
        style={[
          styles.starCard,
          selectedStar === 1 && styles.activeStar
        ]}
        onPress={() => setSelectedStar(1)}
      >
        <Image
          source={require('../../assets/star-logo.png')}
          style={styles.popupStarImage}
        />

        <Text style={styles.starValue}>x1</Text>

      </TouchableOpacity>


      <TouchableOpacity
        style={[
          styles.starCard,
          selectedStar === 3 && styles.activeStar
        ]}
        onPress={() => setSelectedStar(3)}
      >
        <Image
          source={require('../../assets/star-logo.png')}
          style={styles.popupStarImage}
        />

        <Text style={styles.starValue}>x3</Text>

      </TouchableOpacity>


      <TouchableOpacity
        style={[
          styles.starCard,
          selectedStar === 10 && styles.activeStar
        ]}
        onPress={() => setSelectedStar(10)}
      >
        <Image
          source={require('../../assets/star-logo.png')}
          style={styles.popupStarImage}
        />

        <Text style={styles.starValue}>x10</Text>

      </TouchableOpacity>

    </View>

  

<TouchableOpacity
style={styles.starSubmitBtn}
onPress={async()=>{

const user=auth.currentUser;

if(!user) return;

if(!selectedStar){
Alert.alert("Select Star");
return;
}

if(myStars<selectedStar){
Alert.alert("Not enough Stars");
return;
}

try{


setShowStarPopup(false);

setStarAnimationVideoId(selectedVideoId);

setSelectedStar(null);

playStarAnimation();


const senderWallet=doc(
db,
"wallets",
user.uid
);

await updateDoc(senderWallet,{
stars:increment(-selectedStar)
});

const videoRef=doc(
db,
"all_videos",
selectedVideoId
);

const videoSnap=await getDoc(videoRef);

if(videoSnap.exists()){

const videoData=videoSnap.data();

const receiverWallet=doc(
db,
"wallets",
videoData.userId
);

await setDoc(
  receiverWallet,
  {
    receivedStars: increment(selectedStar)
  },
  { merge: true }
);



try {

  await fetch(
    "https://YOUR_RENDER_URL/update-agency-stars",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receiverUid: selectedGiftUser,
        stars: item.price,
      }),
    }
  );

} catch (e) {
  console.log("Agency Update Error", e);
}


await updateDoc(videoRef,{
stars:increment(selectedStar)
});

}

setMyStars(prev => prev - selectedStar);

}catch(e){

console.log(e);

}

}}
>




      <Text style={styles.starSubmitText}>
        StarUp
      </Text>
    </TouchableOpacity>

  </View>

</View>

)}



{showSharePopup && (

<View style={styles.sharePopupContainer}>

 <Pressable
  style={StyleSheet.absoluteFill}
  onPress={() => setShowSharePopup(false)}
/>

  <View style={styles.sharePopup}>

    <View style={styles.actionRow}>

      {/* Report */}
      <TouchableOpacity
  style={styles.reportBtn}
  onPress={() => {

    setShowSharePopup(false);

    router.push({
      pathname: "/report",
      params: {
        videoId: selectedShareVideo?.id
      }
    });

  }}
>


        <Text style={styles.reportText}>
          Report Video
        </Text>
      </TouchableOpacity>


      {/* Save */}
      <TouchableOpacity
        style={styles.saveBtn}
        onPress={() => {

          setShowSharePopup(false);

          // Save Video Logic

        }}
      >
        <Text style={styles.saveText}>
          Video Save
        </Text>
      </TouchableOpacity>

    </View>


    {/* Share */}
<View style={styles.shareRow}>

  {/* Share Video Button */}
  <TouchableOpacity
    style={styles.shareBtn}
    onPress={() => {

      setShowSharePopup(false);

      handleShare(
        selectedShareVideo.videoUrl,
        selectedShareVideo.id
      );

    }}
  >
    <Text style={styles.shareText}>
      Share Video
    </Text>
  </TouchableOpacity>


  {/* TopKing Logo */}
  <TouchableOpacity
    style={styles.logoBtn}
    onPress={() => {

      setShowSharePopup(false);

    router.push({
  pathname: "../ShareVideo",
  params: {
    videoId: selectedShareVideo?.id,

    videoUrl:
      selectedShareVideo?.videoUrl ||
      selectedShareVideo?.video,

    thumbnail:
      selectedShareVideo?.thumbnail,
  },
});

    }}
  >

    <Image
      source={require('../../assets/logo.png')}
      style={styles.shareLogo}
    />

  </TouchableOpacity>

</View>

  </View>

</View>

)}



{showComments && (

<View
  style={{
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 9999,
  }}
>

  {/* Background press */}
  <Pressable
    style={StyleSheet.absoluteFill}

   onPress={() => {

Animated.timing(commentAnim,{
toValue:height,
duration:200,
useNativeDriver:true
}).start(()=>{

setShowComments(false);

setSelectedVideoId(null);

setComments([]);

setReplies({});

setCommentsLoading(false);

});

}}
  />

  {/* Bottom Sheet */}
  <Animated.View
style={[
styles.commentsSheet,
{
transform:[
{
translateY:commentAnim
}
]
}
]}
>

    {selectedVideoData && (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 15,
          marginBottom: 15,
          borderBottomWidth: 0.5,
          borderBottomColor: '#333',
          paddingBottom: 12,
        }}
      >

        <Image
          source={{
            uri:
              selectedVideoData.profile ||
              'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
          }}
          style={{
            width: 45,
            height: 45,
            borderRadius: 22,
          }}
        />

        <View
          style={{
            marginLeft: 10,
            flex: 1,
          }}
        >

          

<View
  style={{
    flexDirection: "row",
    alignItems: "center",
  }}
>
  <Text
    style={{
      color: "#fff",
      fontWeight: "bold",
      fontSize: 15,
    }}
  >
    @{selectedVideoData.username}
  </Text>




{selectedVideoData?.verified && (
<View
  style={{
    marginLeft: 5,
    width: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  }}
>
  <MaterialCommunityIcons
  name="check-decagram"
  size={17}
  color={
  selectedVideoData?.verifiedColor === "yellow"
    ? "#FFD700"
    : "#ffffff"
}
/>

  

</View>

)}

   
</View>


          <Text
            style={{
              color: '#ccc',
              marginTop: 3,
            }}
            numberOfLines={2}
          >
            {selectedVideoData.caption}
          </Text>

        </View>

      </View>
    )}



{
commentsLoading ? (

<View
style={{
flex:1,
justifyContent:"center",
alignItems:"center",
marginTop:20,
}}
>

<ActivityIndicator
size="large"
color="#FFD700"
/>

</View>

) : (



    <FlatList
      data={comments}
      removeClippedSubviews={false}

initialNumToRender={10}

maxToRenderPerBatch={8}

windowSize={8}

keyboardDismissMode="interactive"

keyboardShouldPersistTaps="handled"
      keyExtractor={(item) => item.id}
  style={{ flex: 1, marginTop: 20 }}
  contentContainerStyle={{
    paddingBottom: 80, // input box ke liye space
  }}



  showsVerticalScrollIndicator={false}
  keyboardShouldPersistTaps="handled"

      renderItem={({ item }) => (

     <View
  style={{
    flexDirection: 'row',
    paddingHorizontal: 15,
    marginBottom: 15,
    alignItems: 'flex-start',
  }}
>

          <TouchableOpacity
  onPress={() => {
    setShowComments(false);

    router.push({
      pathname: "/userProfile",
      params: {
        userId: item.userId,
      },
    });
  }}
>
  <Image
    source={{ uri: item.profilePic }}
    style={{
      width: 40,
      height: 40,
      borderRadius: 20,
    }}
  />
</TouchableOpacity>

          <View
            style={{
              marginLeft: 10,
              flex: 1,
            }}
          >

           
<View
  style={{
    flexDirection: "row",
    alignItems: "center",
  }}
>
  <Text
    style={{
      color: "#fff",
      fontWeight: "bold",
    }}
  >
    {item.username}
  </Text>


{item.verified && (
<View
  style={{
    marginLeft: 5,
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  }}
>


 <MaterialCommunityIcons
  name="check-decagram"
  size={17}
  color={
    item?.verifiedColor === "yellow"
      ? "#FFD700"
      : "#ffffff"
  }
/>

  
</View>
)}


</View>


            <Text style={{ color: '#fff' }}>
              {item.text}
            </Text>

            <Text
              style={{
                color: '#999',
                fontSize: 11,
                marginTop: 3,
              }}
            >
              {getTimeAgo(item.createdAt)}
            </Text>

<View
  style={{
    flexDirection: "row",
    marginTop: 8,
  }}
>

  <TouchableOpacity
    onPress={() => {

  setReplyingTo({
    id: item.id,
    username: item.username,
  });

  setReplyText("");

  setTimeout(() => {
    commentInputRef.current?.focus();
  }, 100);

}}
  >

    <Text
      style={{
        color: "#999",
        fontSize: 13,
        fontWeight: "600",
      }}
    >
      Reply
    </Text>

  </TouchableOpacity>

</View>



{
  replies[item.id]?.length > 0 && (

    <TouchableOpacity
      onPress={() => {

        setExpandedReplies(prev => ({
          ...prev,
          [item.id]: !prev[item.id],
        }));

      }}

      style={{
        marginTop: 8,
        marginLeft: 15,
      }}
    >

      <Text
        style={{
          color: "#999",
          fontSize: 13,
          fontWeight: "600",
        }}
      >

        {
          expandedReplies[item.id]
            ? "Hide replies"
            : `View ${replies[item.id].length} ${
                replies[item.id].length === 1
                  ? "reply"
                  : "replies"
              }`
        }

      </Text>

    </TouchableOpacity>

  )
}



{
  replies[item.id]?.length > 0 &&
expandedReplies[item.id] && (

    <View
      style={{
        marginTop: 10,
        marginLeft: 15,
        borderLeftWidth: 1,
        borderLeftColor: "#333",
        paddingLeft: 12,
      }}
    >

      {replies[item.id].map((reply) => (

        <View
          key={reply.id}
          style={{
            flexDirection: "row",
            marginBottom: 12,
            alignItems: "flex-start",
          }}
        >

          <Image
            source={{ uri: reply.profilePic }}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
            }}
          />

          <View
            style={{
              marginLeft: 8,
              flex: 1,
            }}
          >

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
              }}
            >

              <Text
                style={{
                  color: "#fff",
                  fontWeight: "bold",
                  fontSize: 13,
                }}
              >
                {reply.username}
              </Text>

              {reply.verified && (

                <MaterialCommunityIcons
                  name="check-decagram"
                  size={15}
                  color={
                    reply.verifiedColor === "yellow"
                      ? "#FFD700"
                      : "#ffffff"
                  }
                  style={{ marginLeft: 5 }}
                />

              )}

            </View>

            <Text
              style={{
                color: "#fff",
                marginTop: 2,
              }}
            >
              {reply.text}
            </Text>

            <Text
              style={{
                color: "#888",
                fontSize: 11,
                marginTop: 3,
              }}
            >
              {getTimeAgo(reply.createdAt)}
            </Text>


          </View>

{
auth.currentUser?.uid === reply.userId && (

<TouchableOpacity

onPress={()=>deleteReply(
item.id,
reply.id
)}

style={{
  paddingLeft:10,
  paddingTop:5,
}}

>

<Ionicons
  name="ellipsis-vertical"
  size={20}
  color="#fff"
/>

</TouchableOpacity>

)
}


        </View>

      ))}

    </View>

  )
}


          </View>


{auth.currentUser?.uid === item.userId && (

    <TouchableOpacity
      onPress={() =>
        deleteComment(item.id)
      }
      style={{
        paddingLeft: 10,
        paddingTop: 5,
      }}
    >
      <Ionicons
        name="ellipsis-vertical"
        size={20}
        color="#fff"
      />
    </TouchableOpacity>

  )}


        </View>

      )}
    />

)}

    <Animated.View
style={[
styles.commentInputContainer,
{

transform:[
{
translateY:Animated.multiply(keyboardHeight,-1)
}
]


}
]}
>






      <Image
        source={{ uri: currentUserData.photo }}
        style={styles.commentProfile}
      />

    <TextInput
    ref={commentInputRef}
  value={commentText}
  onChangeText={setCommentText}
  placeholder={
  replyingTo
    ? `Reply to @${replyingTo.username}`
    : `Comment as ${currentUserData.name}...`
}
  placeholderTextColor="#999"
  style={styles.commentInput}

  // Keyboard ke send button ko enable karega
  returnKeyType="send"

  // Keyboard khula rahega
  blurOnSubmit={false}

  // Keyboard ka send button dabane par
  onSubmitEditing={() => {
    if (commentText.trim()) {
      postComment();
    }
  }}
/>

      <TouchableOpacity onPress={postComment}>
        <Ionicons
          name="send"
          size={24}
          color="#FFD700"
        />
      </TouchableOpacity>

</Animated.View>


    </Animated.View>

  

</View>




)}


      <View style={styles.bottomSection}>
        <View style={styles.bottomNavContainer}>
          <View style={styles.bottomNav}>
            
            {/* HOME */}
            <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/')}>
              <Ionicons name="home-outline" size={26} color={getIconColor('/')} />
            </TouchableOpacity>

            {/* SEARCH */}
            <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/explore')}>
              <Ionicons name="search" size={26} color={getIconColor('/explore')} />
            </TouchableOpacity>

            {/* CENTER PLUS BUTTON */}
            <View style={styles.navItem}>
              <TouchableOpacity style={styles.plusBtn} onPress={() => router.push('/camera')}>
                <Text style={styles.plusText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* MESSAGES TAB (Synced Icon Style) */}
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
        <View style={styles.bottomFill} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingBox: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  fullScreenOverlay: { flex: 1, backgroundColor: '#000' },
  video: {
  width: '100%',
  height: '90%',
},
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.1)' },

  bottomLeft:  {
  position: 'absolute',

  left: 12,

  bottom: 110,      // niche se kitna upar

  width: width * 0.7,

  zIndex: 999,
},


  userName: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 2 },
  caption: { color: '#ffffff', fontSize: 14, marginTop: 5, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 1 },




musicRow:{
flexDirection:"row",
alignItems:"center",
marginTop:10,
},

musicDiscOuter:{
marginRight:10,
},

vinylDisc:{
width:37,
height:37,
borderRadius:19,
backgroundColor:"#111",
justifyContent:"center",
alignItems:"center",

borderWidth:2,
borderColor:"#444",

shadowColor:"#000",
shadowOpacity:0.6,
shadowRadius:8,
shadowOffset:{
width:0,
height:4,
},

elevation:8,
},

musicCenterImage:{
width:26,
height:26,
borderRadius:13,
},

musicDot:{
position:"absolute",
width:2,
height:2,
borderRadius:3,
backgroundColor:"#fff",
},


  rightIcons:  {
  position: 'absolute',

  right: -10,

  bottom: 120,   // video ke niche se kitna upar

  alignItems: 'center',

  zIndex: 999,
},


  iconBox: { marginBottom: 8, alignItems: 'center' },
  iconText: { color: '#ffffff', fontWeight: 'bold', marginTop: 4, fontSize: 12 },
  profileImage: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: '#ffffff' },

 plusIconSmall:{

position:'absolute',

bottom:-6,

alignSelf:'center',

backgroundColor:'#FFD700',

width:20,

height:20,

borderRadius:8,

justifyContent:'center',

alignItems:'center',

zIndex:9999,

},

  starImage: { width: 90, height: 90, resizeMode: 'contain' },
  starUpText: { color: '#FFD700', fontSize: 12, fontWeight: 'bold', marginTop: -25, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 2 },
  topTabsContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 30, width: width, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  tabText: { color: '#ffffff', fontSize: 18, marginHorizontal: 15, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  activeUnderline: { width: 30, height: 3, backgroundColor: '#ffffff', alignSelf: 'center', marginTop: 2, borderRadius: 2 },
  separator: { width: 1, height: 15, backgroundColor: 'rgba(255,255,255,0.4)' },
  
  // Custom Styles matched with standard messages layout structure
  bottomSection: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#000', borderTopWidth: 0.5, borderTopColor: '#222' },
  bottomNavContainer: { width: '100%', height: 60, justifyContent: 'center', marginBottom: Platform.OS === 'ios' ? 10 : 20 },
  bottomNav: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plusBtn: { backgroundColor: '#f1c40f', width: 48, height: 35, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  plusText: { fontSize: 28, fontWeight: 'bold', color: '#000', marginTop: -4 },
  bottomFill: { backgroundColor: '#000', width: '100%', height: Platform.OS === 'ios' ? 35 : 15 },

commentsSheet:{

width:'100%',

height:height*0.70,

backgroundColor:'#000',

borderTopLeftRadius:25,

borderTopRightRadius:25,
overflow:'hidden',
},
commentInputContainer: {
  position: 'absolute',
  bottom: 45,
  left: 10,
  right: 10,
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#111',
  borderRadius: 30,
  paddingHorizontal: 10,
  paddingVertical: 8,
},

commentProfile: {
  width: 35,
  height: 35,
  borderRadius: 18,
  marginRight: 10,
},

commentInput: {
  flex: 1,
  color: '#fff',
  fontSize: 15,
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
  transform: [{ scale: 1.2 }],
},

starPopupContainer: {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: height,
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

popupTitle: {
  color: '#fff',
  fontSize: 18,
  fontWeight: 'bold',
  textAlign: 'center',
  marginBottom: 20,
},

starOption: {
  backgroundColor: '#222',
  padding: 15,
  borderRadius: 12,
  marginBottom: 10,
},

starText: {
  color: '#FFD700',
  textAlign: 'center',
  fontWeight: 'bold',
  fontSize: 18,
},

starSubmitBtn: {
  backgroundColor: '#FFD700',
  paddingVertical: 14,
  borderRadius: 30,
  marginTop: 30,
  alignSelf: 'center',
  width: 180,
},

starSubmitText: {
  color: '#000',
  fontWeight: 'bold',
  textAlign: 'center',
},

starRow: {
  flexDirection: 'row',
  justifyContent: 'space-around',
  marginTop: -23,
},

starCard: {
  width: 90,
  height: 100,
  backgroundColor: '#222',
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

starNumber: {
  fontSize: 30,
},

starValue: {
  color: '#FFD700',
  fontWeight: 'bold',
  fontSize: 15,
  marginTop: -20,   // upar layega
},

popupStarImage: {
  width: 90,
  height: 90,
  resizeMode: 'contain',
 marginTop: -15, 

},

myStarBox: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 20,
   top: -10,
  left: 0,
},

myStarImage: {
  width: 45,
  height: 45,
  resizeMode: 'contain',
},

myStarText: {
  color: '#FFD700',
  fontSize: 24,
  fontWeight: 'bold',
  marginLeft: -5,
},

sharePopupContainer: {
position: 'absolute',
left: 0,
right: 0,
bottom: 40,
height: height,
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



shareBtn:{
  backgroundColor:'#FFD700',

  width:230,          // button ki lambai
  height:45,          // button ki unchai

  borderRadius:20,

  justifyContent:'center',
  alignItems:'center',

  marginLeft:5,      // left-right move
  marginRight:0,

  marginTop:0,        // upar-niche move
  marginBottom:0,
},

shareText: {
color: '#000',
fontWeight: 'bold',
fontSize: 18,
textAlign: 'center',
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

shareRow:{
  flexDirection:'row',
  alignItems:'center',
  justifyContent:'space-between',
  marginTop:10,
},

logoBtn:{
  width:60,
  height:60,
  borderRadius:45,      // gola banayega
  overflow:'hidden',    // image ko circle ke andar rakhega
  justifyContent:'center',
  alignItems:'center',
  backgroundColor:'#000',
},

shareLogo:{
  width:100,
  height:100,
  borderRadius:25,     // image ko gol karega
  resizeMode:'cover',  // poora circle fill karega
},


userRow: {
  flexDirection: "row",
  alignItems: "center",
},

badge: {
  marginLeft: 5,
  width: 18,
  height: 18,
  justifyContent: "center",
  alignItems: "center",
  position: "relative",
},

badgeTick: {
  position: "absolute",
  top: 4.6,
  left: 4.2,
},

musicTextContainer:{
flex:1,
overflow:"hidden",
},

musicText:{
color:"#fff",
fontSize:13,
fontWeight:"600",
width:400,
},


});   