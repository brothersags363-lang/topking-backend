import { notifyNewFollower } from "../utils/pushNotify";
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  memo,
} from "react";

import {
  View,
  Text,
  StyleSheet,
  Image,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Modal,
  Alert,
  Share,
  RefreshControl,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { scopedBackHandler } from "../utils/scopedBack";

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import { Image as ExpoImage } from "expo-image";

import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { useRouter } from "../utils/safeRouter";

import { db, auth } from "./firebaseConfig";
import { profileLink } from "../utils/shareLinks";
import { formatCount, levelThemeFor } from "../utils/profileHelpers";
import UserTick, { isFaceVerified } from "../components/UserTick";

import {
  doc,
  getDoc,
  collection,
  onSnapshot,
  query,
  where,
  limit,
  getDocs,
  setDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  getCountFromServer,
  documentId,
} from "firebase/firestore";

import TopKingLogo from "../assets/images/topking-logo.png";

import AppBottomNav from "../components/AppBottomNav";
import FamilyCell from "../components/FamilyCell";
import { AvatarFrame } from "../components/FramedAvatar";
import { useLiveHost, openLiveRoom } from "../components/liveHosts";

/* ------------------------------------------------------------------ */
/* Constants & pure helpers (outside the component => created once)    */
/* ------------------------------------------------------------------ */

const { width } = Dimensions.get("window");
const ITEM_SIZE = width / 3;

const AVATAR_FALLBACK = "https://avatar.iran.liara.run/public/65";
const THUMB_FALLBACK =
  "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";


// Batched "get many docs by id": 30 ids per query instead of 1 read round-trip
// per doc. Falls back to individual getDoc() if rules don't allow list queries.
const chunk = (arr, n = 30) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const fetchDocsByIds = async (colName, ids) => {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map();

  await Promise.all(
    chunk(unique).map(async (part) => {
      try {
        const snap = await getDocs(
          query(collection(db, colName), where(documentId(), "in", part))
        );
        snap.forEach((d) => map.set(d.id, d));
      } catch (e) {
        const snaps = await Promise.all(
          part.map((id) => getDoc(doc(db, colName, id)).catch(() => null))
        );
        snaps.forEach((d) => d && d.exists() && map.set(d.id, d));
      }
    })
  );

  return map;
};

// Bio: fixed size (max 4 lines), purane lambe bio bhi kat kar dikhenge
const BIO_MAX_LINES = 4;

const cleanBio = (text) => {
  const t = (text || "").replace(/\r/g, "").trim();
  if (!t || t === "bio.........") return "";
  // 4 se zyada lines hon to baaki hata do
  return t.split("\n").slice(0, BIO_MAX_LINES).join("\n");
};


// Instagram jaisa bio: 3 line dikhti hai, lambi ho to "more" dabane par khulti hai
const BIO_COLLAPSED_LINES = 3;
const BioText = memo(function BioText({ text, style, moreStyle }) {
  const [expanded, setExpanded] = useState(false);
  const longBio =
    text.split("\n").length > BIO_COLLAPSED_LINES || text.length > 110;

  return (
    <Text
      style={style}
      numberOfLines={expanded || !longBio ? undefined : BIO_COLLAPSED_LINES}
      ellipsizeMode="tail"
      onPress={longBio ? () => setExpanded((v) => !v) : undefined}
    >
      {text}
      {longBio && (
        <Text style={moreStyle}>{expanded ? "  less" : "  more"}</Text>
      )}
    </Text>
  );
});

const THEMES = {
  t50: { bg: "#7B1FFF", border: "#FFD700", text: "#fff", icon: "#FFD700" },
  t40: { bg: "#00BFFF", border: "#9EF8FF", text: "#fff", icon: "#fff" },
  t30: { bg: "#FF0066", border: "#FFB6C1", text: "#fff", icon: "#fff" },
  t20: { bg: "#FFC107", border: "#FFE082", text: "#000", icon: "#fff" },
  t10: { bg: "#BDBDBD", border: "#fff", text: "#fff", icon: "#fff" },
  t0: { bg: "#222", border: "#555", text: "#FFD700", icon: "#00E5FF" },
};

// Angels: kitne top gifters dikhane hain (rank 1,2,3...) - yahan se number badlo
const ANGEL_SHOW = 3;
const ANGEL_RANK_COLORS = {
  1: { bg: '#FFD700', text: '#000' },
  2: { bg: '#C0C0C0', text: '#000' },
  3: { bg: '#CD7F32', text: '#fff' },
};
const getAngelRankColors = (rank) =>
  ANGEL_RANK_COLORS[rank] || { bg: '#444', text: '#fff' };

const getLevelTheme = (level) => {
  if (level >= 50) return THEMES.t50;
  if (level >= 40) return THEMES.t40;
  if (level >= 30) return THEMES.t30;
  if (level >= 20) return THEMES.t20;
  if (level >= 10) return THEMES.t10;
  return THEMES.t0;
};

const tickColor = (color) => (color === "yellow" ? "#FFD700" : "#f9fdff");

const isPinnedVideo = (v) => !!(v.pinned || v.isPinned);

// Pinned sabse pehle, baaki newest first
const sortNewest = (arr) =>
  arr.sort((a, b) => {
    const pa = isPinnedVideo(a) ? 1 : 0;
    const pb = isPinnedVideo(b) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });

const videoKeyExtractor = (item, index) => item.id || String(index);

// topGifters can be an array or an object map; normalise + sort by stars
const normalizeGifters = (raw) => {
  let gifters = [];

  if (Array.isArray(raw)) {
    gifters = raw;
  } else if (raw && typeof raw === "object") {
    gifters = Object.values(raw);
  }

  return gifters
    .filter((item) => item && (item.uid || item.userId || item.id))
    .map((item) => ({
      ...item,
      uid: item.uid || item.userId || item.id,
      name: item.name || item.username || "User",
      username: item.username || "",
      profileImg:
        item.profileImg ||
        item.photoURL ||
        item.photo ||
        item.profile ||
        item.avatar ||
        "",
      stars: Number(item.stars || 0),
    }))
    .sort((a, b) => b.stars - a.stars);
};

/* ------------------------------------------------------------------ */
/* Small memoized components                                           */
/* ------------------------------------------------------------------ */

// - memory-disk cache => same image loads instantly on repeat views
// - transition => smooth fade instead of a hard pop-in
const FastImage = memo(function FastImage({
  style,
  uri,
  fallback,
  contentFit = "cover",
}) {
  const src = uri || fallback;

  return (
    <ExpoImage
      source={src}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      transition={150}
      recyclingKey={src}
    />
  );
});

// One video thumbnail. memo => scrolling / tab changes don't re-render
// every card, only the ones whose data actually changed.
const VideoItem = memo(function VideoItem({ item, onPress }) {
  return (
    <TouchableOpacity
      style={styles.videoCard}
      activeOpacity={0.85}
      onPress={() => onPress(item)}
    >
      <FastImage
        uri={item.thumbnail}
        fallback={THUMB_FALLBACK}
        style={styles.video}
      />

      {isPinnedVideo(item) && (
        <View style={styles.pinnedBadge}>
          <Text style={styles.pinnedText}>Pinned</Text>
        </View>
      )}

      <View style={styles.videoOverlayViews}>
        <Ionicons name="play-outline" size={14} color="#fff" />
        <Text style={styles.viewCountText}>{formatCount(item.views || 0)}</Text>
      </View>
    </TouchableOpacity>
  );
});

// Live tile: videos grid ka sabse pehla item jab user live ho
const LiveTile = memo(function LiveTile({ live, fallbackImg, onPress }) {
  return (
    <TouchableOpacity
      style={styles.videoCard}
      activeOpacity={0.85}
      onPress={() => onPress(live)}
    >
      <FastImage
        uri={live.cover || fallbackImg}
        fallback={THUMB_FALLBACK}
        style={styles.video}
      />

      <View style={styles.liveTileBadge}>
        <Ionicons name="stats-chart" size={10} color="#000" />
        <Text style={styles.liveTileBadgeText}>LIVE</Text>
      </View>

      <View style={styles.videoTitleRow}>
        <View style={styles.userRow}>
          <Ionicons name="people" size={13} color="#fff" />
          <Text style={styles.videoItemTitle} numberOfLines={1}>
            {live.viewers}
          </Text>
        </View>
        <Ionicons
          name={live.type === "video" ? "videocam" : "mic"}
          size={14}
          color="#fff"
        />
      </View>
    </TouchableOpacity>
  );
});

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function UserProfile() {
  const router = useRouter();
  const { userId } = useLocalSearchParams();

  const [videos, setVideos] = useState([]);
  const [likedCount, setLikedCount] = useState(0);
  const [activeTab, setActiveTab] = useState("Videos");

  const [userData, setUserData] = useState(null);
  const [userLevel, setUserLevel] = useState(0);
  const [userRank, setUserRank] = useState(null);
  const [isVerified, setIsVerified] = useState(false);

  const [totalLikes, setTotalLikes] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  const [currentUserId, setCurrentUserId] = useState(
    auth.currentUser?.uid || ""
  );
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowBack, setIsFollowBack] = useState(false);

  const [menuVisible, setMenuVisible] = useState(false);


  const [topGifters, setTopGifters] = useState([]);
  const [hasStars, setHasStars] = useState(false);
  const [familyShown, setFamilyShown] = useState(false);

  const [isBlocked, setIsBlocked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // "already loaded once" flags => reopening the modal / Likes tab is instant
  const followBusyRef = useRef(false);
  const lastFocusFetchRef = useRef({ userId: null, t: 0 });

  // Always-current values for stable callbacks (no re-created handlers)
  const latest = useRef({});
  latest.current = { activeTab, videos, userData };

  // Kya ye user abhi live hai? (all-live jaisa hi data, real time)
  const liveRoom = useLiveHost(userId);
  const isOwnProfile = !!userId && userId === currentUserId;

  const openLive = useCallback(
    (live) => {
      if (isOwnProfile) return; // apni live ko viewer ban kar join na karein
      openLiveRoom(router, live);
    },
    [router, isOwnProfile]
  );

  // Reset cached lists when the profile being viewed changes
  useEffect(() => {

    setLikedCount(0);
  }, [userId]);

  /* ---------------- Live listeners ---------------- */

  // ONE live listener for the user doc: profile data + verified + top gifters.
  // (Before: a getDoc AND an onSnapshot on the same document.)
  useEffect(() => {
    if (!db || !userId) return;

    const unsubscribe = onSnapshot(
      doc(db, "users", userId),
      (snap) => {
        if (!snap.exists()) {
          setTopGifters([]);
          return;
        }

        const data = snap.data();
        const gifters = normalizeGifters(data.topGifters);

        setUserData(data);
        setIsVerified(data.verified === true);
        const top = gifters.slice(0, ANGEL_SHOW);
        setTopGifters(top);

        // Angels ki photo: topGifters me gift ke time ki purani/fallback photo
        // save hoti hai. Isliye har gifter ki LIVE profile photo users/{uid}
        // se laakar badal do (wahi photo jo unki profile me dikhti hai).
        fetchDocsByIds("users", top.map((g) => g.uid))
          .then((map) => {
            setTopGifters((prev) =>
              prev.map((g) => {
                const d = map.get(g.uid)?.data();
                const img = d?.profileImg || d?.photoURL;
                return img ? { ...g, profileImg: img } : g;
              })
            );
          })
          .catch(() => {});
      },
      () => {}
    );

    return unsubscribe;
  }, [userId]);

  // Follow status in both directions (these live listeners replace the
  // extra getDoc checkFollowStatus() calls that used to run on top of them)
  useEffect(() => {
    if (!currentUserId || !userId) return;

    const unsubFollow = onSnapshot(
      doc(db, "follows", `${currentUserId}_${userId}`),
      (snap) => setIsFollowing(snap.exists()),
      () => {}
    );

    const unsubBack = onSnapshot(
      doc(db, "follows", `${userId}_${currentUserId}`),
      (snap) => setIsFollowBack(snap.exists()),
      () => {}
    );

    return () => {
      unsubFollow();
      unsubBack();
    };
  }, [currentUserId, userId]);

  // Hardware back button
  useEffect(() => {
    const backHandler = scopedBackHandler('/userProfile', 
      "hardwareBackPress",
      () => {
        router.back();
        return true;
      }
    );

    return () => backHandler.remove();
  }, [router]);

  /* ---------------- Data loaders ---------------- */

  const loadUserRank = useCallback(async (myReceivedStars = 0) => {
    try {
      const countSnap = await getCountFromServer(
        query(
          collection(db, "wallets"),
          where("receivedStars", ">", myReceivedStars)
        )
      );

      setUserRank(countSnap.data().count + 1);
    } catch (e) {
      if (__DEV__) console.log(e);
    }
  }, []);

  // Block check + wallet (level/rank) all in ONE parallel round-trip.
  // (Before: block checks first, then user + wallet, one after the other.)
  const fetchProfileExtras = useCallback(async () => {
    if (!userId) return;

    try {
      const myId = auth.currentUser?.uid;

      const [blockMe, blockedByUser, walletSnap] = await Promise.all([
        myId ? getDoc(doc(db, "blockedUsers", `${myId}_${userId}`)) : null,
        myId ? getDoc(doc(db, "blockedUsers", `${userId}_${myId}`)) : null,
        getDoc(doc(db, "wallets", userId)),
      ]);

      if (blockMe?.exists() || blockedByUser?.exists()) {
        setIsBlocked(true);
        Alert.alert("Blocked", "This profile is unavailable.");
        router.back();
        return;
      }

      if (walletSnap.exists()) {
        const wallet = walletSnap.data();
        setUserLevel(wallet.level || 0);
        setHasStars((wallet.receivedStars || 0) > 0);
        loadUserRank(wallet.receivedStars || 0);
      } else {
        loadUserRank(0);
      }
    } catch (error) {
      if (__DEV__) console.log("PROFILE ERROR =", error);
    }
  }, [userId, router, loadUserRank]);

  const fetchVideos = useCallback(async () => {
    if (!userId) return;

    try {
      const snap = await getDocs(
        query(collection(db, "all_videos"), where("userId", "==", userId))
      );

      let likesCount = 0;

      const list = snap.docs.map((d) => {
        const data = d.data();
        likesCount += Number(data.likes || 0);
        return { id: d.id, ...data };
      });

      sortNewest(list); // newest video first

      setVideos(list);
      setTotalLikes(likesCount);
    } catch (error) {
      if (__DEV__) console.log("FETCH VIDEOS ERROR =", error);
    }
  }, [userId]);

  // Cheap count only (no document downloads) for the "Like (n)" tab label
  const fetchLikedCount = useCallback(async () => {
    if (!userId) return;

    try {
      const countSnap = await getCountFromServer(
        collection(db, "userLikes", userId, "likedVideos")
      );

      setLikedCount(countSnap.data().count);
    } catch (e) {
      if (__DEV__) console.log(e);
    }
  }, [userId]);

  const fetchFollowCounts = useCallback(async () => {
    if (!userId) return;

    const followersQ = query(
      collection(db, "follows"),
      where("followingId", "==", userId)
    );
    const followingQ = query(
      collection(db, "follows"),
      where("followerId", "==", userId)
    );

    // 1) Fast path: server-side count
    try {
      const [followersSnap, followingSnap] = await Promise.all([
        getCountFromServer(followersQ),
        getCountFromServer(followingQ),
      ]);
      setFollowersCount(followersSnap.data().count);
      setFollowingCount(followingSnap.data().count);
      return;
    } catch (error) {
      // NOTE: ab release build me bhi dikhega (pehle sirf __DEV__ me)
      console.log("FOLLOW COUNT (aggregate) ERROR =", error?.code, error?.message);
    }

    // 2) Fallback: documents gin lo (aggregate fail ho to bhi count dikhe)
    try {
      const [followersDocs, followingDocs] = await Promise.all([
        getDocs(query(followersQ, limit(5000))),
        getDocs(query(followingQ, limit(5000))),
      ]);
      setFollowersCount(followersDocs.size);
      setFollowingCount(followingDocs.size);
      return;
    } catch (error) {
      console.log("FOLLOW COUNT (getDocs) ERROR =", error?.code, error?.message);
    }

    // 3) Last fallback: users/{uid} ke counter fields
    const ud = latest.current?.userData;
    if (ud) {
      setFollowersCount(Math.max(0, Number(ud.followersCount) || 0));
      setFollowingCount(Math.max(0, Number(ud.followingCount) || 0));
    }
  }, [userId]);

  /* ---------------- Focus + refresh ---------------- */

  useFocusEffect(
    useCallback(() => {
      const uid = auth.currentUser?.uid;
      if (uid) setCurrentUserId(uid);
      // Skip full refetch when coming back within 30s (pull-to-refresh still works)
      const nowTs = Date.now();
      const last = lastFocusFetchRef.current;
      if (last.userId === userId && nowTs - last.t < 30000) return;
      lastFocusFetchRef.current = { userId, t: nowTs };

      fetchProfileExtras();
      fetchVideos();
      fetchFollowCounts();

      fetchLikedCount();
    }, [
      userId,
      fetchProfileExtras,
      fetchVideos,
      fetchFollowCounts,
      fetchLikedCount,
    ])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      const uid = auth.currentUser?.uid;
      if (uid) setCurrentUserId(uid);

      await Promise.all([
        fetchProfileExtras(),
        fetchVideos(),
        fetchFollowCounts(),
        fetchLikedCount(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [
    fetchProfileExtras,
    fetchVideos,
    fetchFollowCounts,
    fetchLikedCount,
  ]);

  /* ---------------- Actions ---------------- */

  const sendFollowNotification = useCallback(async () => {
    try {
      const meSnap = await getDoc(doc(db, "users", currentUserId));
      const me = meSnap.data();

      await addDoc(collection(db, "users", userId, "notifications"), {
        type: "follow",
        senderId: currentUserId,
        senderName: me?.username || "User",
        senderPhoto: me?.profileImg || "",
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      if (__DEV__) console.log(e);
    }
  }, [currentUserId, userId]);

  // Instant follow / unfollow: UI updates first, network runs after.
  // (Before: a getDoc + user doc read + notification all blocked the UI.)
  const handleFollow = useCallback(async () => {
    if (!currentUserId || !userId || followBusyRef.current) return;

    followBusyRef.current = true;

    const wasFollowing = isFollowing;
    const followRef = doc(db, "follows", `${currentUserId}_${userId}`);

    setIsFollowing(!wasFollowing);
    setFollowersCount((c) => Math.max(0, c + (wasFollowing ? -1 : 1)));

    try {
      if (wasFollowing) {
        await deleteDoc(followRef);
      } else {
        await setDoc(followRef, {
          followerId: currentUserId,
          followingId: userId,
        });

        sendFollowNotification(); // background, not awaited
        notifyNewFollower(userId); // push (app band ho tab bhi)
      }
    } catch (error) {
      // roll back the optimistic update
      setIsFollowing(wasFollowing);
      setFollowersCount((c) => Math.max(0, c + (wasFollowing ? 1 : -1)));
    } finally {
      followBusyRef.current = false;
    }
  }, [currentUserId, userId, isFollowing, sendFollowNotification]);

  const handleBlockUser = useCallback(() => {
    Alert.alert("Block User", "Do you want to block this user?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          try {
            const myId = auth.currentUser?.uid;

            if (!myId) {
              router.push("/login");
              return;
            }

            const blockedUser = latest.current.userData;

            await setDoc(doc(db, "blockedUsers", `${myId}_${userId}`), {
              blockerId: myId,
              blockedUserId: userId,
              username: blockedUser?.username || "",
              profileImg: blockedUser?.profileImg || "",
              createdAt: serverTimestamp(),
            });

            await Promise.all([
              deleteDoc(doc(db, "follows", `${myId}_${userId}`)),
              deleteDoc(doc(db, "follows", `${userId}_${myId}`)),
            ]);

            setMenuVisible(false);

            Alert.alert("Success", "User blocked successfully.");

            router.replace("/(tabs)");
          } catch (e) {
            if (__DEV__) console.log(e);
          }
        },
      },
    ]);
  }, [router, userId]);

  const handleShareProfile = useCallback(async () => {
    try {
      await Share.share({
        message:
          `Check out ${latest.current.userData?.username}'s profile on TopKing.\n\n` +
          profileLink(userId),
      });

      setMenuVisible(false);
    } catch (error) {}
  }, [userId]);

  const openChat = useCallback(async () => {
    const myId = auth.currentUser?.uid;

    if (!myId) {
      router.push("/login");
      return;
    }

    try {
      const [blockMe, blockedByUser] = await Promise.all([
        getDoc(doc(db, "blockedUsers", `${myId}_${userId}`)),
        getDoc(doc(db, "blockedUsers", `${userId}_${myId}`)),
      ]);

      if (blockMe.exists() || blockedByUser.exists()) {
        setIsBlocked(true);
        Alert.alert("Blocked", "This profile is unavailable.");
        router.back();
        return;
      }
    } catch (e) {
      if (__DEV__) console.log(e);
    }

    router.push({
      pathname: "/chat",
      params: {
        userId,
        username: latest.current.userData?.username,
        profileImg: latest.current.userData?.profileImg,
      },
    });
  }, [router, userId]);

  const openVideo = useCallback(
    (item) => {
      const { videos: v, userData: ud } = latest.current;

      const fullList = v;
      const fullIndex = fullList.findIndex((x) => x.id === item.id);
      // Send a window around the tapped video, not the entire list
      const winStart = Math.max(0, fullIndex - 10);
      const currentList = fullList.slice(winStart, winStart + 40);
      const localIndex = fullIndex - winStart;

      router.push({
        pathname: "/allvideo",
        params: {
          videoId: item.id,
          userId,
          from: "userProfile",
          videos: JSON.stringify(currentList),
          index: localIndex,
          videoUrl: item.videoUrl || item.video,
          username: ud?.username,
          caption: item.caption,
          likes: item.likes,
          commentsCount: item.commentsCount,
          shares: item.shares,
          views: item.views,
          profile: ud?.profileImg,
        },
      });
    },
    [router, userId]
  );

  // StarUp: us user ki sabse nayi video khulti hai (wahin star bhej sakte ho)
  const openStarUp = useCallback(() => {
    const list = latest.current.videos || [];
    if (!list.length) {
      Alert.alert("StarUp", "Is user ki abhi koi video nahi hai.");
      return;
    }
    const newest = list.reduce((a, b) =>
      (b.createdAt?.seconds || 0) > (a.createdAt?.seconds || 0) ? b : a
    );
    openVideo(newest);
  }, [openVideo]);

  // Video tab profile me hi rehta hai; "Like" dabane par alag Like page khulta hai
  const handleTabPress = useCallback(
    (tab) => {
      if (tab === "Likes") {
        router.push({
          pathname: "/likes",
          params: { userId, username: latest.current.userData?.username },
        });
        return;
      }
      setActiveTab("Videos");
    },
    [router, userId]
  );

  // Followers / Following ab alag page me khulte hain (profile.tsx jaisa) - modal nahi
  const openFollowPage = useCallback(
    (kind) => {
      router.push({
        pathname: kind === "followers" ? "/followers" : "/following",
        params: {
          userId,
          username: latest.current.userData?.username,
        },
      });
    },
    [router, userId]
  );

  /* ---------------- Render pieces ---------------- */

  const renderVideoItem = useCallback(
    ({ item }) =>
      item.isLiveTile ? (
        <LiveTile
          live={item.live}
          fallbackImg={latest.current.userData?.profileImg}
          onPress={openLive}
        />
      ) : (
        <VideoItem item={item} onPress={openVideo} />
      ),
    [openVideo, openLive]
  );

  const profileImg = userData?.profileImg;
  const username = userData?.username;
  const category = userData?.category;
  const bioText = userData?.bioText;
  const verifiedColor = userData?.verifiedColor;
  const faceVerified =
    userData?.faceStatus === "submitted" || userData?.faceStatus === "approved";

  // Header only re-renders when something it shows actually changes
  const listHeader = useMemo(() => {
    const levelTheme = levelThemeFor(userLevel || 1);
    const verifiedTickColor = tickColor(verifiedColor);

    const rankText =
      userRank == null
        ? "--"
        : userRank > 500
        ? "500+"
        : `No.${userRank}`;

    const followLabel = isFollowing
      ? "Following"
      : isFollowBack
      ? "Follow Back"
      : "Follow";

    const displayName = (userData?.name || "").trim();
    const showName =
      !!displayName &&
      displayName.toLowerCase() !== (username || "").toLowerCase();
    const bioClean = cleanBio(bioText);
    // Rank/Angels card tabhi dikhe jab user ko star mila ho ya Angels (gifters) hon
    const showStarCard = hasStars || topGifters.length > 0;
    const isMutual = isFollowing && isFollowBack;
    // StarUp: sirf jab star mila ho (showStarCard); apni profile par nahi, aur family me join ho to bhi nahi
    const showStarUp = showStarCard && !isOwnProfile && !familyShown;

    return (
      <View style={styles.profileHeader}>
        <View style={styles.mainInfoSection}>
          <TouchableOpacity
            activeOpacity={liveRoom ? 0.8 : 1}
            disabled={!liveRoom}
            onPress={() => openLive(liveRoom)}
          >
            <FastImage
              uri={profileImg}
              fallback={AVATAR_FALLBACK}
              style={[styles.profileImage, liveRoom && styles.profileImageLive]}
            />
            {/* FRAME: is user ka frame (level / agency / admin / uski apni choice) */}
            <AvatarFrame uid={userId} level={userLevel} size={80} ratio={1.3} animated />
            {liveRoom && (
              <View style={styles.liveTagProfile} pointerEvents="none">
                <Text style={styles.liveTagProfileText}>LIVE</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.infoRight}>
            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.statBox}
                activeOpacity={0.7}
                onPress={() => openFollowPage("followers")}
              >
                <Text style={styles.statNumber}>{formatCount(followersCount)}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.statBox}
                activeOpacity={0.7}
                onPress={() => openFollowPage("following")}
              >
                <Text style={styles.statNumber}>{formatCount(followingCount)}</Text>
                <Text style={styles.statLabel}>Following</Text>
              </TouchableOpacity>

              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{formatCount(totalLikes)}</Text>
                <Text style={styles.statLabel}>Likes</Text>
              </View>
            </View>
          </View>
        </View>

        {(showName || !!bioClean) && (
          <View style={styles.identityBlock}>
            {showName && (
              <Text style={styles.displayName} numberOfLines={1}>
                {displayName}
              </Text>
            )}
            {!!bioClean && (
              <View style={styles.bioSection}>
                <BioText text={bioClean} style={styles.bioText} moreStyle={styles.bioMore} />
              </View>
            )}
          </View>
        )}

        {/* Follow / Message buttons (TopKing logo button waisa hi) */}
        {!isBlocked && (
          <View style={styles.buttonRow}>
            {isMutual ? (
              <TouchableOpacity style={styles.messageBtn} activeOpacity={0.8} onPress={openChat}>
                <Text style={styles.messageText}>Message</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.followBtn, isFollowing && styles.followingBtn]}
                activeOpacity={0.85}
                onPress={handleFollow}
              >
                {!isFollowing && <Ionicons name="add" size={20} color="#000" />}
                <Text style={[styles.followText, isFollowing && styles.followingText]}>
                  {followLabel}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.instaBtn}>
              <Image source={TopKingLogo} style={styles.logoImg} />
            </TouchableOpacity>
          </View>
        )}

        {/* Rank | Angels | StarUp  (Rank+Angels+StarUp sirf jab star mila ho / Angels hon) | Family alag card */}
        <View style={styles.cardsRow}>
          {showStarCard && (
            <View style={[styles.premiumCard, styles.starCardInner]}>
              {showStarCard && (
                <View style={styles.premiumItem}>
                  <MaterialCommunityIcons name="star-four-points" size={22} color="#FFD700" />
                  <Text style={styles.premiumTitle}>{rankText}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#9a9a9a" />
                </View>
              )}

              {topGifters.length > 0 && (
                <>
                  <View style={styles.premiumDivider} />
                  <View style={styles.premiumItem}>
                    <View style={styles.memberRow}>
                      {topGifters.slice(0, ANGEL_SHOW).map((item, index) => (
                        <View
                          key={item.uid || `gifter-${index}`}
                          style={[
                            styles.angelWrap,
                            { marginLeft: index === 0 ? 0 : -8, zIndex: ANGEL_SHOW - index },
                          ]}
                        >
                          <FastImage
                            uri={item.profileImg}
                            fallback={AVATAR_FALLBACK}
                            style={styles.angelImg}
                          />
                        </View>
                      ))}
                    </View>
                    <Text style={styles.premiumTitle}>Angels</Text>
                    <Ionicons name="chevron-forward" size={14} color="#9a9a9a" />
                  </View>
                </>
              )}

              <View style={{ flex: 1 }} />

              {/* StarUp: wahi star-logo + "StarUp" jo index.tsx (feed) me dikhta hai */}
              {showStarUp && (
                <TouchableOpacity
                  style={styles.starPill}
                  activeOpacity={0.8}
                  onPress={openStarUp}
                >
                  <Image
                    source={require("../assets/star-logo.png")}
                    style={styles.starPillImg}
                  />
                  <Text style={styles.starPillText}>StarUp</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* FamilyCell khud decide karta hai: family hai to dikhta hai, warna kuch nahi (card bhi nahi) */}
          <View style={familyShown ? [styles.premiumCard, styles.familyCard] : null}>
            <View onLayout={(e) => setFamilyShown(e.nativeEvent.layout.height > 0)}>
              <FamilyCell userId={userId} data={userData} fallback={null} />
            </View>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={styles.tab}
            activeOpacity={0.8}
            onPress={() => handleTabPress("Videos")}
          >
            <Text style={activeTab === "Videos" ? styles.activeTabText : styles.tabText}>
              Videos {videos.length}
            </Text>
            <View
              style={[
                styles.tabUnderline,
                activeTab !== "Videos" && { backgroundColor: "transparent" },
              ]}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tab}
            activeOpacity={0.8}
            onPress={() => handleTabPress("Likes")}
          >
            <Text style={styles.tabText}>Likes</Text>
            <View style={[styles.tabUnderline, { backgroundColor: "transparent" }]} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [
    profileImg,
    liveRoom,
    openLive,
    username,
    userData,
    bioText,
    verifiedColor,
    isVerified,
    faceVerified,
    userLevel,
    userRank,
    followersCount,
    followingCount,
    totalLikes,
    isBlocked,
    isFollowing,
    isFollowBack,
    topGifters,
    hasStars,
    familyShown,
    activeTab,
    videos.length,
    likedCount,
    handleFollow,
    openChat,
    openFollowPage,
    handleTabPress,
    openStarUp,
    isOwnProfile,
  ]);

  // Videos tab me live tile sabse pehle; `videos` state untouched rehta hai
  // (openVideo ka index/list calculation isse kharab na ho).
  const gridData = useMemo(() => {
    if (!liveRoom) return videos;
    return [
      { id: "__live__", isLiveTile: true, live: liveRoom },
      ...videos,
    ];
  }, [videos, liveRoom]);

  const topLevelTheme = levelThemeFor(userLevel || 1);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={26} color="#ffffff" />
          </TouchableOpacity>

          <Text style={styles.topUsername} numberOfLines={1} ellipsizeMode="tail">
            {username}
          </Text>

          <View style={styles.topTick}>
            <UserTick verified={isVerified} verifiedColor={verifiedColor} faceVerified={faceVerified} size={18} style={{ marginLeft: 0 }} />
          </View>

          <View
            style={[
              styles.levelPill,
              {
                backgroundColor: topLevelTheme.bg,
                borderColor: topLevelTheme.border,
                marginLeft: 6,
                flexShrink: 0,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="diamond-stone"
              size={10}
              color={topLevelTheme.icon}
            />
            <Text style={[styles.levelPillText, { color: topLevelTheme.text }]}>
              LV {userLevel || 1}
            </Text>
          </View>
        </View>

        {/* 3-line menu icon (share icon ki jagah) */}
        <TouchableOpacity
          onPress={() => setMenuVisible(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="menu" size={26} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={gridData}
        keyExtractor={videoKeyExtractor}
        renderItem={renderVideoItem}
        numColumns={3}
        ListHeaderComponent={listHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#FFD700"]}
            tintColor="#FFD700"
          />
        }
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        initialNumToRender={12}
        maxToRenderPerBatch={9}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        contentContainerStyle={styles.listContent}
      />

      {/* Three-dot menu */}
      <Modal
        transparent
        visible={menuVisible}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={styles.modalBg}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setMenuVisible(false)}
          />

          <View style={styles.menuBox}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleShareProfile}
            >
              <Text style={styles.menuText}>Share Profile</Text>
            </TouchableOpacity>

            {isFollowing && isFollowBack && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  handleFollow();
                }}
              >
                <Text style={styles.menuText}>Unfollow</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                openChat(); // block check, then chat.tsx decides: friend chat or message request
              }}
            >
              <Text style={styles.menuText}>Message</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleBlockUser}>
              <Text style={[styles.menuText, styles.redText]}>Block</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);

                router.push({
                  pathname: "/report",
                  params: { reportedUserId: userId },
                });
              }}
            >
              <Text style={[styles.menuText, styles.redText]}>Report</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setMenuVisible(false)}
            >
              <Text style={styles.menuText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bottom Navigation */}
      <AppBottomNav />
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  profileHeader: {
    paddingHorizontal: 16,
    paddingTop: 5,
  },

  mainInfoSection: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },

  infoRight: {
    flex: 1,
    marginLeft: 14,
  },

  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  identityBlock: {
    marginTop: 10,
  },

  displayName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },

  bioSection: {
    marginTop: 4,
  },

  followingBtn: {
    backgroundColor: "#2a2a2a",
  },

  followingText: {
    color: "#fff",
  },

  cardsRow: {
    flexDirection: "row",
    gap: 10,
  },

  familyCard: {
    paddingHorizontal: 10,
  },

  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },

  tabUnderline: {
    width: 22,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#FFD700",
    marginTop: 6,
  },

  pinnedBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },

  pinnedText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },

  listContent: {
    paddingBottom: 150,
    paddingHorizontal: 1,
  },

  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 15,
    marginTop: 35,
    marginBottom: 8,
  },

  userRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  smallAvatar: {
    width: 25,
    height: 25,
    borderRadius: 25,
  },

  topUsername: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 8,
    flexShrink: 1,
    maxWidth: width * 0.45,
  },

  // top bar ka left part: menu icon ke liye jagah chhodta hai, naam lamba ho to "..." se kat jata hai
  topLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
  },

  topTick: {
    marginLeft: 5,
    flexShrink: 0,
  },

  profileRow: {
    flexDirection: "row",
    paddingHorizontal: 18,
  },

  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 30, // profile.tsx jaisa rounded-square (gol nahi)
    backgroundColor: "#222",
  },

  // Face-verified user ka logo: photo ke side (neeche-right) me chipka hua
  faceBadge: {
    position: "absolute",
    right: -0,
    bottom: 28,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#3a3a40",
    borderWidth: 2,
    borderColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },

  profileImageLive: {
    borderWidth: 3,
    borderColor: "#FFD700",
  },

  liveTagProfile: {
    zIndex: 30,          // frame (zIndex 5) ke UPAR dikhe
    elevation: 30,       // Android me bhi upar
    position: "absolute",
    bottom: 25,
    alignSelf: "center",
    backgroundColor: "#FF2D55",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: "#fff",
  },

  liveTagProfileText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  liveTileBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFD700",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },

  liveTileBadgeText: {
    color: "#000",
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 4,
  },

  rightSection: {
    flex: 1,
    marginLeft: 15,
    justifyContent: "center",
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },

  profileName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    flexShrink: 1,
  },

  profileTick: {
    marginLeft: 5,
  },

  levelPill: {
    marginLeft: 4,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  levelPillText: {
    fontWeight: "bold",
    marginLeft: 3,
    fontSize: 9,
  },

  category: {
    color: "#FFD700",
    fontSize: 13,
    marginTop: 5,
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginTop: 6,
  },

  statBox: {
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
    minWidth: 64,
  },

  statNumber: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
  },

  statLabel: {
    color: "#8a8a8a",
    fontSize: 13,
    marginTop: 2,
  },

  bioBox: {
    paddingHorizontal: 20,
    marginTop: 0,
  },

  bioTitle: {
    color: "#999",
    fontSize: 14,
  },

  bioText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 19,
  },

  bioMore: {
    color: "#8e8e8e",
    fontWeight: "600",
  },

  buttonRow: {
    flexDirection: "row",
    marginTop: 16,
    gap: 10,
  },

  followBtn: {
    flex: 1,
    backgroundColor: "#FFD700",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },

  followText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "700",
  },

  messageBtn: {
    flex: 1,
    backgroundColor: "#2a2a2a",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  messageText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  instaBtn: {
    backgroundColor: "#2a2a2a",
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },

  logoImg: {
    width: 40,
    height: 40,
    resizeMode: "contain",
  },

  tabContainer: {
    flexDirection: "row",
    marginTop: 18,
  },

  activeTab: {
    flex: 1,
    alignItems: "center",
    paddingBottom: 10,
  },

  activeTabText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },

  tabText: {
    color: "#8a8a8a",
    fontWeight: "bold",
    fontSize: 16,
  },

  likedSpinner: {
    marginTop: 30,
  },

  videoCard: {
    width: ITEM_SIZE - 6,
    height: (ITEM_SIZE - 6) * 1.45,
    margin: 3,
    borderRadius: 8,
    backgroundColor: "#111",
    overflow: "hidden",
  },

  video: {
    width: "100%",
    height: "100%",
  },

  videoOverlayViews: {
    position: "absolute",
    bottom: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
  },

  viewCountText: {
    color: "#fff",
    fontSize: 12,
    marginLeft: 3,
    fontWeight: "bold",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },

  videoTitleRow: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  videoItemTitle: {
    color: "#fff",
    marginLeft: 4,
    width: 60,
    fontSize: 12,
  },

  /* three-dot menu */
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
  },

  menuBox: {
    width: 180,
    backgroundColor: "#111",
    borderRadius: 15,
    marginTop: 80,
    marginRight: 15,
    paddingVertical: 10,
  },

  menuItem: {
    padding: 18,
  },

  menuText: {
    color: "#fff",
    fontSize: 16,
  },

  redText: {
    color: "red",
  },

  /* level badge (followers list) */
  levelBadge: {
    marginLeft: 5,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  levelBadgeText: {
    fontSize: 9,
    fontWeight: "bold",
    marginLeft: 3,
  },

  /* rank / angels / share card */
  premiumCard: {
    marginTop: 14,
    backgroundColor: "#2a2a2a",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 14,
  },

  premiumItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  premiumSmallText: {
    color: "#8a8a8a",
    fontSize: 11,
  },

  premiumTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },

  premiumDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#3a3a3a",
  },

  starCardInner: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    gap: 8,
    paddingHorizontal: 10,
  },

  starPill: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3d3200",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },

  starPillImg: {
    width: 18,
    height: 18,
    resizeMode: "contain",
  },

  starPillText: {
    color: "#FFD700",
    fontSize: 13,
    fontWeight: "bold",
    marginLeft: 4,
  },

  rankTextWrap: {
    marginLeft: 8,
  },

  rankChevron: {
    marginLeft: 8,
  },

  angelsChevron: {
    marginLeft: "auto",
  },

  shareButton: {
    backgroundColor: "#3d3200",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 10,
  },

  shareText: {
    color: "#FFD700",
    fontWeight: "bold",
    marginLeft: 6,
  },

  memberRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  memberImg: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#181818",
  },

  angelWrap: {
    width: 22,
    height: 22,
  },

  angelImg: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#2a2a2a",
  },

  angelBadge: {
    position: "absolute",
    right: -5,
    bottom: -5,
    minWidth: 14,
    height: 14,
    paddingHorizontal: 2,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#181818",
    justifyContent: "center",
    alignItems: "center",
  },

  angelBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    lineHeight: 11,
  },

  gifterCount: {
    color: "#FFD700",
    fontSize: 15,
    fontWeight: "bold",
    marginLeft: 10,
  },

  /* followers / following modal */
  followModal: {
    flex: 1,
    backgroundColor: "#000",
  },

  closeBtn: {
    padding: 15,
  },

  closeText: {
    color: "#FFD700",
    fontSize: 18,
  },

  followTabs: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 15,
  },

  followTabBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
  },

  followTabBtnGap: {
    marginRight: 10,
  },

  followTabOn: {
    backgroundColor: "#FFD700",
  },

  followTabOff: {
    backgroundColor: "#222",
  },

  followTabTextOn: {
    color: "#000",
  },

  followTabTextOff: {
    color: "#fff",
  },

  followLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },

  followLoadingText: {
    color: "#aaa",
    marginTop: 12,
    fontSize: 14,
  },

  followRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
  },

  followUserTap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  followAvatarWrap: {
    width: 50,
    height: 50,
  },

  followAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },

  followNameWrap: {
    marginLeft: 16,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
  },

  followName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },

  followTick: {
    marginLeft: 2,
  },

  rowBtn: {
    width: 95,
    height: 36,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },

  rowBtnYellow: {
    backgroundColor: "#FFD700",
  },

  rowBtnDark: {
    backgroundColor: "#222",
  },

  rowBtnTextDark: {
    color: "#000",
    fontWeight: "bold",
  },

  rowBtnTextLight: {
    color: "#fff",
    fontWeight: "bold",
  },
});