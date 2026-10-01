import React, { useEffect, useRef, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  FlatList,
  Image,
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

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from './firebaseConfig';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

const { height, width } = Dimensions.get('screen');

// Ek video item ki asli height. getItemLayout aur videoContainer dono yahi use karte hain.
const ITEM_HEIGHT = height - 77.2;

const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

const auth = getAuth();

/* ---------------- Verified badge ---------------- */

const VerifiedBadge = ({ color, size = 18 }) => (
  <View
    style={{
      marginLeft: 5,
      width: size,
      height: size,
      justifyContent: 'center',
      alignItems: 'center',
    }}
  >
    <MaterialCommunityIcons
      name="check-decagram"
      size={size}
      color={color === 'yellow' ? '#FFD700' : '#ffffff'}
    />
    <Ionicons
      name="checkmark"
      size={size * 0.55}
      color="#131212"
      style={{ position: 'absolute', top: size * 0.26, left: size * 0.23 }}
    />
  </View>
);

/* ---------------- Single video player ---------------- */

const VideoPlayerItem = React.memo(
  ({ uri, active }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [hasError, setHasError] = useState(false);

    const player = useVideoPlayer(uri, (p) => {
      p.loop = true;
      p.muted = true;
    });

    useEffect(() => {
      if (!player) return;

      if (active) {
        setHasError(false);
        setIsLoading(true);
        try {
          player.muted = false;
          player.play();
        } catch (error) {
          console.log('VIDEO PLAY ERROR =', error);
          setIsLoading(false);
          setHasError(true);
        }
      } else {
        setIsLoading(false);
        setHasError(false);
        // Player pehle release ho sakta hai (unmount / back), isliye safe.
        try {
          player.pause();
          player.muted = true;
        } catch (error) {
          console.log('VIDEO PAUSE ERROR =', error);
        }
      }
    }, [active, player]);

    useEffect(() => {
      if (!player) return;

      const statusSubscription = player.addListener(
        'statusChange',
        ({ status, error }) => {
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
        }
      );

      const playingSubscription = player.addListener(
        'playingChange',
        ({ isPlaying }) => {
          if (!active) {
            setIsLoading(false);
            return;
          }
          if (isPlaying) {
            setIsLoading(false);
            setHasError(false);
          }
        }
      );

      return () => {
        try { statusSubscription.remove(); } catch (e) {}
        try { playingSubscription.remove(); } catch (e) {}
      };
    }, [player, active]);

    return (
      <View style={{ width: '100%', height: '100%', backgroundColor: '#000' }}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="cover"
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
          showsTimecodes={false}
        />

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
  },
  (prev, next) => prev.uri === next.uri && prev.active === next.active
);

/* ---------------- Main screen ---------------- */

export default function App() {
  const router = useRouter();

  const { videos, index, userId } = useLocalSearchParams();
  const profileUserId = userId ? String(userId) : undefined;

  /* animated values */
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const textAnim = useRef(new Animated.Value(0)).current;
  const keyboardHeight = useRef(new Animated.Value(0)).current;

  const starScale = useRef(new Animated.Value(0)).current;
  const starRotate = useRef(new Animated.Value(0)).current;
  const starOpacity = useRef(new Animated.Value(0)).current;
  const starJump = useRef(new Animated.Value(0)).current;
  const starTilt = useRef(new Animated.Value(0)).current;

  /* state */
  const [allVideos, setAllVideos] = useState(() => {
    try {
      return videos ? JSON.parse(String(videos)) : [];
    } catch (e) {
      console.log('VIDEOS PARSE ERROR =', e);
      return [];
    }
  });

  const [activeVideo, setActiveVideo] = useState(Number(index) || 0);
  const [screenFocused, setScreenFocused] = useState(true);

  const [localLikes, setLocalLikes] = useState({});
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [myStars, setMyStars] = useState(0);
  const [starAnimationVideoId, setStarAnimationVideoId] = useState(null);

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

  const [showSharePopup, setShowSharePopup] = useState(false);
  const [selectedShareVideo, setSelectedShareVideo] = useState(null);

  const [currentUserData, setCurrentUserData] = useState({
    name: 'User',
    photo: DEFAULT_AVATAR,
    verified: false,
    verifiedColor: 'white',
  });

  /* refs */
  const flatListRef = useRef(null);
  const replyInputRef = useRef(null);
  const deletingRef = useRef(false);
  const isLeavingRef = useRef(false);
  const focusedRef = useRef(true);
  const loadedLikeIdsRef = useRef(new Set());

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;

  const onViewRef = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveVideo(viewableItems[0].index);
    }
  });

  const videoData = React.useMemo(
    () => allVideos.filter((item) => !blockedUsers.includes(item.userId)),
    [allVideos, blockedUsers]
  );

  const videoDataRef = useRef(videoData);
  videoDataRef.current = videoData;

  /* ============ BACK NAVIGATION (main fix) ============ */

  const goBack = React.useCallback(() => {
    // Double tap / double back guard
    if (isLeavingRef.current) return;
    isLeavingRef.current = true;

    Keyboard.dismiss();
    setShowComments(false);
    setShowSharePopup(false);

    // Sab videos turant pause + mute
    setScreenFocused(false);

    // Ek frame ruko taaki pause apply ho jaye, phir navigate
    requestAnimationFrame(() => {
      try {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace({
            pathname: '../Profile',
            params: profileUserId ? { userId: profileUserId } : {},
          });
        }
      } catch (e) {
        console.log('BACK ERROR =', e);
      }
    });

    // Agar kisi wajah se screen par hi reh gaye to sab wapas normal
    setTimeout(() => {
      isLeavingRef.current = false;
      if (focusedRef.current) {
        setScreenFocused(true);
      }
    }, 1000);
  }, [router, profileUserId]);

  // Hardware back button
  useEffect(() => {
    const backAction = () => {
      if (showSharePopup) {
        setShowSharePopup(false);
        return true;
      }
      if (showComments) {
        setShowComments(false);
        return true;
      }
      goBack();
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [showComments, showSharePopup, goBack]);

  // Focus aane par videos chalao, jaane par pause. activeVideo reset nahi hota.
  useFocusEffect(
    React.useCallback(() => {
      focusedRef.current = true;
      isLeavingRef.current = false;
      setScreenFocused(true);

      return () => {
        focusedRef.current = false;
        setScreenFocused(false);
      };
    }, [])
  );

  /* ============ Animations ============ */

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(textAnim, { toValue: -180, duration: 5000, useNativeDriver: true }),
        Animated.timing(textAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      Animated.timing(keyboardHeight, {
        toValue: e.endCoordinates.height,
        duration: 250,
        useNativeDriver: false,
      }).start();
    });

    const hide = Keyboard.addListener('keyboardDidHide', () => {
      Animated.timing(keyboardHeight, {
        toValue: 0,
        duration: 250,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const playStarAnimation = () => {
    starScale.setValue(0.2);
    starOpacity.setValue(0);
    starRotate.setValue(0);
    starJump.setValue(40);
    starTilt.setValue(0);

    Animated.parallel([
      Animated.spring(starScale, { toValue: 1.3, friction: 3, tension: 120, useNativeDriver: true }),
      Animated.timing(starOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(starRotate, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.timing(starTilt, { toValue: 1, duration: 1200, useNativeDriver: true }),
      Animated.spring(starJump, { toValue: -50, friction: 4, useNativeDriver: true }),
    ]).start(() => {
      Animated.sequence([
        Animated.spring(starScale, { toValue: 1.6, friction: 3, useNativeDriver: true }),
        Animated.delay(700),
        Animated.parallel([
          Animated.timing(starOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(starScale, { toValue: 2, duration: 500, useNativeDriver: true }),
        ]),
      ]).start(() => {
        setStarAnimationVideoId(null);
      });
    });
  };

  /* ============ Firebase: user / wallet / blocked / likes ============ */

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
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
          });
        }
      } catch (e) {
        console.log('USER LOAD ERROR =', e);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const unsubscribe = onSnapshot(
      doc(db, 'wallets', user.uid),
      (snap) => {
        if (snap.exists()) setMyStars(snap.data().stars || 0);
      },
      (e) => console.log('WALLET ERROR =', e)
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(collection(db, 'blockedUsers'), where('blockerId', '==', user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const arr = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data.blockedUserId) arr.push(data.blockedUserId);
        });
        setBlockedUsers(arr);
      },
      (e) => console.log('BLOCKED ERROR =', e)
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const newVideos = allVideos.filter((video) => !loadedLikeIdsRef.current.has(video.id));
    if (newVideos.length === 0) return;

    let cancelled = false;

    const loadLikes = async () => {
      const results = await Promise.all(
        newVideos.map(async (video) => {
          loadedLikeIdsRef.current.add(video.id);
          try {
            const snap = await getDoc(doc(db, 'all_videos', video.id, 'likes', user.uid));
            return [video.id, snap.exists()];
          } catch (e) {
            return [video.id, false];
          }
        })
      );

      if (cancelled) return;

      setLocalLikes((prev) => {
        const next = { ...prev };
        results.forEach(([id, liked]) => {
          next[id] = liked;
        });
        return next;
      });
    };

    loadLikes();
    return () => {
      cancelled = true;
    };
  }, [allVideos]);

  /* ============ Comments + replies listeners ============ */

  useEffect(() => {
    if (!selectedVideoId) return;

    const q = query(
      collection(db, 'all_videos', selectedVideoId, 'comments'),
      orderBy('createdAt', 'desc')
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
  }, [selectedVideoId]);

  useEffect(() => {
    if (!selectedVideoId) return;

    const unsubscribers = comments.map((comment) => {
      const q = query(
        collection(db, 'all_videos', selectedVideoId, 'comments', comment.id, 'replies'),
        orderBy('createdAt', 'asc')
      );

      return onSnapshot(
        q,
        (snap) => {
          const arr = [];
          snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
          setReplies((prev) => ({ ...prev, [comment.id]: arr }));
        },
        (e) => console.log('REPLIES ERROR =', e)
      );
    });

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [comments, selectedVideoId]);

  /* ============ Actions ============ */

  const handleLike = async (videoId) => {
    const user = auth.currentUser;
    if (!user) return;

    const liked = !!localLikes[videoId];
    const likeRef = doc(db, 'all_videos', videoId, 'likes', user.uid);
    const videoRef = doc(db, 'all_videos', videoId);

    setLocalLikes((prev) => ({ ...prev, [videoId]: !liked }));

    setAllVideos((prev) =>
      prev.map((item) =>
        item.id === videoId
          ? {
              ...item,
              likes: liked ? Math.max((item.likes || 0) - 1, 0) : (item.likes || 0) + 1,
            }
          : item
      )
    );

    try {
      if (liked) {
        await deleteDoc(likeRef);
        await updateDoc(videoRef, { likes: increment(-1) });
      } else {
        await setDoc(likeRef, { userId: user.uid, createdAt: serverTimestamp() });
        await updateDoc(videoRef, { likes: increment(1) });
      }
    } catch (e) {
      // Error aaye to UI rollback
      setLocalLikes((prev) => ({ ...prev, [videoId]: liked }));
      setAllVideos((prev) =>
        prev.map((item) =>
          item.id === videoId
            ? {
                ...item,
                likes: liked ? (item.likes || 0) + 1 : Math.max((item.likes || 0) - 1, 0),
              }
            : item
        )
      );
      console.log('LIKE ERROR =', e);
    }
  };

  const handleShare = async (videoUrl, videoId) => {
    if (!videoUrl) {
      Alert.alert('Share', 'Is video ka link nahi mila.');
      return;
    }

    try {
      const result = await Share.share(
        Platform.OS === 'ios'
          ? { url: videoUrl, message: videoUrl }
          : { message: videoUrl }
      );

      if (result.action === Share.sharedAction) {
        setAllVideos((prev) =>
          prev.map((v) => (v.id === videoId ? { ...v, shares: (v.shares || 0) + 1 } : v))
        );

        try {
          await updateDoc(doc(db, 'all_videos', videoId), { shares: increment(1) });
        } catch (e) {
          console.log('SHARE COUNT ERROR =', e);
        }
      }
    } catch (e) {
      console.log('SHARE ERROR =', e);
      Alert.alert('Share', 'Share nahi ho paya, dobara try karo.');
    }
  };

  const deleteVideo = (videoId, ownerId) => {
    const user = auth.currentUser;

    if (!user) {
      Alert.alert('Login Required');
      return;
    }

    if (ownerId && ownerId !== user.uid) {
      Alert.alert('Not allowed', 'Aap sirf apni video delete kar sakte ho.');
      return;
    }

    if (deletingRef.current) return;

    Alert.alert('Delete Video', 'Kya aap ye video delete karna chahte ho?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (deletingRef.current) return;
          deletingRef.current = true;

          try {
            await deleteDoc(doc(db, 'all_videos', videoId));

            const list = videoDataRef.current || [];
            const deletedIndex = list.findIndex((v) => v.id === videoId);
            const remaining = list.length - 1;

            setShowComments(false);
            setShowSharePopup(false);
            setSelectedShareVideo(null);

            if (remaining <= 0) {
              // Aakhri video thi -> safe back navigation
              goBack();
              return;
            }

            const nextIndex = Math.min(Math.max(deletedIndex, 0), remaining - 1);

            setActiveVideo(nextIndex);
            setAllVideos((prev) => prev.filter((v) => v.id !== videoId));

            setTimeout(() => {
              try {
                flatListRef.current?.scrollToIndex({ index: nextIndex, animated: false });
              } catch (e) {}
            }, 80);
          } catch (e) {
            console.log('DELETE VIDEO ERROR =', e);
            Alert.alert('Error', 'Video delete nahi ho paya.');
          } finally {
            deletingRef.current = false;
          }
        },
      },
    ]);
  };

  const closeComments = () => {
    Keyboard.dismiss();
    setShowComments(false);
    setReplyCommentId(null);
    setReplyText('');
  };

  const postComment = async () => {
    const user = auth.currentUser;

    if (!user) {
      Alert.alert('Login Required');
      return;
    }

    if (!commentText.trim() || !selectedVideoId) return;

    const text = commentText.trim();

    setCommentText('');
    Keyboard.dismiss();

    try {
      await addDoc(collection(db, 'all_videos', selectedVideoId, 'comments'), {
        text,
        username: currentUserData.name,
        profilePic: currentUserData.photo,
        userId: user.uid,
        verified: currentUserData.verified || false,
        verifiedColor: currentUserData.verifiedColor || 'white',
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'all_videos', selectedVideoId), {
        commentsCount: increment(1),
      });
    } catch (e) {
      console.log('POST COMMENT ERROR =', e);
      setCommentText(text);
      Alert.alert('Error', 'Comment post nahi ho paya.');
    }
  };

  const postReply = async () => {
    const user = auth.currentUser;

    if (!user || !replyText.trim() || !selectedVideoId || !replyCommentId) return;

    const text = replyText.trim();

    setReplyText('');
    setReplyCommentId(null);
    Keyboard.dismiss();
    replyInputRef.current?.blur();

    try {
      await addDoc(
        collection(db, 'all_videos', selectedVideoId, 'comments', replyCommentId, 'replies'),
        {
          text,
          username: currentUserData.name,
          profilePic: currentUserData.photo,
          userId: user.uid,
          verified: currentUserData.verified || false,
          verifiedColor: currentUserData.verifiedColor || 'white',
          createdAt: serverTimestamp(),
        }
      );
    } catch (e) {
      console.log('POST REPLY ERROR =', e);
      Alert.alert('Error', 'Reply post nahi ho paya.');
    }
  };

  const deleteComment = (commentId) => {
    Alert.alert('Delete Comment', 'Do you want to delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'all_videos', selectedVideoId, 'comments', commentId));
            setComments((prev) => prev.filter((item) => item.id !== commentId));
            await updateDoc(doc(db, 'all_videos', selectedVideoId), {
              commentsCount: increment(-1),
            });
          } catch (e) {
            console.log('DELETE COMMENT ERROR =', e);
          }
        },
      },
    ]);
  };

  const deleteReply = async (videoId, commentId, replyId) => {
    try {
      await deleteDoc(
        doc(db, 'all_videos', videoId, 'comments', commentId, 'replies', replyId)
      );

      setReplies((prev) => ({
        ...prev,
        [commentId]: (prev[commentId] || []).filter((item) => item.id !== replyId),
      }));
    } catch (e) {
      console.log('DELETE REPLY ERROR =', e);
    }
  };

  /* ============ Render a single video page ============ */

  const renderVideo = React.useCallback(
    ({ item, index: itemIndex }) => (
      <View style={styles.videoContainer}>
        <VideoPlayerItem
          key={item.id}
          uri={item.videoUrl || item.video}
          active={screenFocused && itemIndex === activeVideo}
        />

        {starAnimationVideoId === item.id && (
          <View style={styles.starOverlay} pointerEvents="none">
            <Animated.Image
              source={require('../assets/star-logo.png')}
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
                      outputRange: ['0deg', '720deg'],
                    }),
                  },
                  {
                    rotateY: starTilt.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: ['0deg', '180deg', '360deg'],
                    }),
                  },
                  {
                    rotateX: starTilt.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: ['0deg', '25deg', '0deg'],
                    }),
                  },
                ],
                shadowColor: '#FFD700',
                shadowOpacity: 1,
                shadowRadius: 35,
                elevation: 35,
                resizeMode: 'contain',
              }}
            />
          </View>
        )}

        {/* Side bar */}
        <View style={styles.sideBar}>
          <TouchableOpacity
            onPress={() =>
              router.push({ pathname: '../Profile', params: { userId: item.userId } })
            }
          >
            <Image
              source={{ uri: item.profile || DEFAULT_AVATAR }}
              style={styles.profileImage}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBox} onPress={() => handleLike(item.id)}>
            <Ionicons
              name="heart"
              size={38}
              color={localLikes[item.id] ? 'red' : '#fff'}
            />
            <Text style={styles.iconText}>{item.likes || 0}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBox}
            onPress={() => {
              setComments([]);
              setCommentsLoading(true);
              setReplyCommentId(null);
              setReplyText('');
              setSelectedVideoId(item.id);
              setSelectedVideoData(item);
              setShowComments(true);
            }}
          >
            <Ionicons name="chatbubble" size={35} color="#fff" />
            <Text style={styles.iconText}>{item.commentsCount || 0}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBox}
            onPress={() => {
              setSelectedShareVideo(item);
              setShowSharePopup(true);
            }}
          >
            <Ionicons name="arrow-redo" size={35} color="#FFD700" />
            <Text style={styles.iconText}>{item.shares || 0}</Text>
          </TouchableOpacity>

          {auth.currentUser?.uid === item.userId && (
            <TouchableOpacity
              style={styles.iconBox}
              onPress={() => deleteVideo(item.id, item.userId)}
            >
              <Ionicons name="trash-outline" size={35} color="#FF4D4D" />
              <Text style={styles.iconText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Bottom info */}
        <View style={styles.bottomInfo}>
          <View style={styles.userRow}>
            <Text style={styles.userName}>{item.username || '@user'}</Text>
            {item.verified && <VerifiedBadge color={item.verifiedColor} size={18} />}
          </View>

          <Text style={styles.caption}>{item.caption}</Text>

          <TouchableOpacity
            style={styles.musicRow}
            activeOpacity={0.8}
            onPress={() => {
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
            }}
          >
            <Animated.View
              style={[
                styles.musicDiscOuter,
                {
                  transform: [
                    {
                      rotate: rotateAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '360deg'],
                      }),
                    },
                  ],
                },
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
                style={[styles.musicText, { transform: [{ translateX: textAnim }] }]}
              >
                🎵 Music • {item.username} • Original Audio
              </Animated.Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    ),
    [activeVideo, screenFocused, localLikes, starAnimationVideoId, goBack]
  );

  /* ============ UI ============ */

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Top black header */}
      <View style={styles.header} />

      {/* Video list */}
      <FlatList
        ref={flatListRef}
        data={videoData}
        renderItem={renderVideo}
        extraData={{ activeVideo, screenFocused, starAnimationVideoId, localLikes }}
        keyExtractor={(item) => String(item.id)}
        pagingEnabled
        getItemLayout={(data, i) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * i,
          index: i,
        })}
        initialScrollIndex={
          Number(index) > 0 && Number(index) < (videoData?.length || 0)
            ? Number(index)
            : 0
        }
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            flatListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: false,
            });
          }, 100);
        }}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewRef.current}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews={true}
        updateCellsBatchingPeriod={16}
        decelerationRate="fast"
        snapToAlignment="start"
        disableIntervalMomentum={true}
        scrollEventThrottle={8}
      />

      {/* Comments sheet */}
      {showComments && (
        <View style={styles.commentsSheet}>
          {selectedVideoData && (
            <View style={styles.commentsHeader}>
              <Image
                source={{ uri: selectedVideoData.profile || DEFAULT_AVATAR }}
                style={{ width: 45, height: 45, borderRadius: 22 }}
              />

              <View style={{ marginLeft: 10, flex: 1 }}>
                <View style={styles.userRow}>
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>
                    @{selectedVideoData.username}
                  </Text>
                  {selectedVideoData?.verified && (
                    <VerifiedBadge color={selectedVideoData.verifiedColor} size={16} />
                  )}
                </View>

                <Text style={{ color: '#ccc', marginTop: 3 }} numberOfLines={2}>
                  {selectedVideoData.caption}
                </Text>
              </View>

              <TouchableOpacity
                onPress={closeComments}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={26} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {commentsLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#FFD700" />
            </View>
          ) : (
            <FlatList
              data={comments}
              style={{ marginTop: 10, flex: 1 }}
              contentContainerStyle={{ paddingBottom: 90 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={false}
              keyExtractor={(item) => item.id}
              keyboardDismissMode="interactive"
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <TouchableOpacity
                    onPress={() => {
                      closeComments();
                      router.push({
                        pathname: '../Profile',
                        params: { userId: item.userId },
                      });
                    }}
                  >
                    <Image
                      source={{ uri: item.profilePic || DEFAULT_AVATAR }}
                      style={{ width: 40, height: 40, borderRadius: 20 }}
                    />
                  </TouchableOpacity>

                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <View style={styles.userRow}>
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                        {item.username}
                      </Text>
                      {item.verified && (
                        <VerifiedBadge color={item.verifiedColor} size={16} />
                      )}
                    </View>

                    <Text style={{ color: '#fff' }}>{item.text}</Text>

                    <View style={{ flexDirection: 'row', marginTop: 5 }}>
                      <TouchableOpacity
                        onPress={() =>
                          setShowReplies((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                        }
                      >
                        <Text style={styles.commentMeta}>
                          {showReplies[item.id]
                            ? 'Hide'
                            : `View ${replies[item.id]?.length || 0} Replies`}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{ marginLeft: 18 }}
                        onPress={() => {
                          setReplyCommentId((prev) => (prev === item.id ? null : item.id));
                          setShowReplies((prev) => ({ ...prev, [item.id]: true }));
                          setTimeout(() => replyInputRef.current?.focus(), 100);
                        }}
                      >
                        <Text style={styles.commentMeta}>
                          {replyCommentId === item.id ? 'Cancel reply' : 'Reply'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {showReplies[item.id] &&
                      replies[item.id]?.map((reply) => (
                        <View key={reply.id} style={styles.replyRow}>
                          <Image
                            source={{ uri: reply.profilePic || DEFAULT_AVATAR }}
                            style={{ width: 30, height: 30, borderRadius: 15 }}
                          />

                          <View style={{ marginLeft: 8, flex: 1 }}>
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>
                              {reply.username}
                            </Text>
                            <Text style={{ color: '#ddd' }}>{reply.text}</Text>
                          </View>

                          {auth.currentUser?.uid === reply.userId && (
                            <TouchableOpacity
                              style={{ padding: 5 }}
                              onPress={() =>
                                Alert.alert('Delete Reply', 'Do you want to delete this reply?', [
                                  { text: 'Cancel', style: 'cancel' },
                                  {
                                    text: 'Delete',
                                    style: 'destructive',
                                    onPress: () =>
                                      deleteReply(selectedVideoId, item.id, reply.id),
                                  },
                                ])
                              }
                            >
                              <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                  </View>

                  {auth.currentUser?.uid === item.userId && (
                    <TouchableOpacity
                      onPress={() => deleteComment(item.id)}
                      style={{ paddingLeft: 10, paddingTop: 5 }}
                    >
                      <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            />
          )}

          {/* Comment / reply input */}
          <Animated.View
            style={[
              styles.commentInputBar,
              { transform: [{ translateY: Animated.multiply(keyboardHeight, -1) }] },
            ]}
          >
            <Image
              source={{ uri: currentUserData.photo }}
              style={{ width: 35, height: 35, borderRadius: 18, marginRight: 10 }}
            />

            <TextInput
              ref={replyInputRef}
              value={replyCommentId ? replyText : commentText}
              onChangeText={replyCommentId ? setReplyText : setCommentText}
              placeholder={replyCommentId ? 'Write reply...' : 'Comment...'}
              placeholderTextColor="#999"
              style={{ flex: 1, color: '#fff' }}
            />

            <TouchableOpacity onPress={() => (replyCommentId ? postReply() : postComment())}>
              <Ionicons name="send" size={24} color="#FFD700" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* Share popup */}
      {showSharePopup && (
        <View style={styles.sharePopupContainer}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowSharePopup(false)}
          />

          <View style={styles.sharePopup}>
            <View style={styles.actionRow}>
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

            <View style={styles.shareRow}>
              <TouchableOpacity
                style={styles.shareBtn}
                onPress={() => {
                  setShowSharePopup(false);
                  handleShare(
                    selectedShareVideo?.videoUrl || selectedShareVideo?.video,
                    selectedShareVideo?.id
                  );
                }}
              >
                <Text style={styles.shareText}>Share Video</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.logoBtn}
                onPress={() => {
                  setShowSharePopup(false);
                  router.push({
                    pathname: '../ShareVideo',
                    params: {
                      videoId: selectedShareVideo?.id,
                      videoUrl: selectedShareVideo?.videoUrl || selectedShareVideo?.video,
                      thumbnail: selectedShareVideo?.thumbnail,
                    },
                  });
                }}
              >
                <Image source={require('../assets/logo.png')} style={styles.shareLogo} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Back button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={goBack}
        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
      >
        <Ionicons name="arrow-back" size={30} color="#fff" />
      </TouchableOpacity>

      {/* Bottom comment box */}
      <View style={styles.commentBox}>
        <View style={styles.yellowCircle} />
        <Text style={styles.commentText}>Add comment...</Text>
      </View>
    </View>
  );
}

/* ---------------- Styles ---------------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },

  header: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingTop: 10,
  },

  videoContainer: { height: ITEM_HEIGHT, width: width },

  video: { width: '100%', height: '93%' },

  sideBar: {
    position: 'absolute',
    right: 7,
    bottom: 65,
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
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#fff',
    marginBottom: 15,
  },

  iconBox: { alignItems: 'center', marginBottom: 10 },

  iconText: { color: '#fff', fontWeight: 'bold', marginTop: 3 },

  videoLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 9999,
  },

  videoError: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    zIndex: 9999,
  },

  loadingText: { color: '#fff', fontSize: 14, marginTop: 12, fontWeight: '500' },

  starOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
    elevation: 99999,
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

  /* comments */

  commentsSheet: {
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

  commentRow: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  commentMeta: { color: '#c3c2be', fontSize: 13 },

  replyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
    marginLeft: 20,
  },

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

  /* share popup */

  sharePopupContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 25,
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

  reportText: { color: '#fff', fontWeight: 'bold', textAlign: 'center', fontSize: 14 },

  saveText: { color: '#fff', fontWeight: 'bold', textAlign: 'center', fontSize: 14 },

  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },

  shareBtn: {
    backgroundColor: '#fffef6',
    width: 230,
    height: 45,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 5,
  },

  shareText: { color: '#000', fontWeight: 'bold', fontSize: 18, textAlign: 'center' },

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

  /* bottom info */

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