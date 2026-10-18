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

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import { Image as ExpoImage } from "expo-image";

import {
  useLocalSearchParams,
  useFocusEffect,
  useRouter,
} from "expo-router";

import { db, auth } from "./firebaseConfig";
import { profileLink } from "../utils/shareLinks";

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

import BottomNav from "../components/BottomNav";
import { useLiveHost, openLiveRoom } from "../components/liveHosts";

/* ------------------------------------------------------------------ */
/* Constants & pure helpers (outside the component => created once)    */
/* ------------------------------------------------------------------ */

const { width } = Dimensions.get("window");
const ITEM_WIDTH = width / 3 - 9;

const AVATAR_FALLBACK = "https://avatar.iran.liara.run/public/65";
const THUMB_FALLBACK =
  "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

// Followers / following modal loads at most this many people at once
// (each person = 5 Firestore reads). Raise it if you need more.
const FOLLOW_LIST_LIMIT = 100;

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

const sortNewest = (arr) =>
  arr.sort(
    (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
  );

const videoKeyExtractor = (item, index) => item.id || String(index);
const followKeyExtractor = (item) => item.id;

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
    <TouchableOpacity style={styles.videoCard} onPress={() => onPress(item)}>
      <FastImage
        uri={item.thumbnail}
        fallback={THUMB_FALLBACK}
        style={styles.video}
      />

      <View style={styles.videoOverlayViews}>
        <Ionicons name="eye-outline" size={12} color="#fff" />
        <Text style={styles.viewCountText}>{item.views || 0}</Text>
      </View>

      <View style={styles.videoTitleRow}>
        <View style={styles.userRow}>
          <MaterialCommunityIcons name="play" size={16} color="#FFD700" />

          <Text style={styles.videoItemTitle} numberOfLines={1}>
            {item.title || "video"}
          </Text>
        </View>

        <MaterialCommunityIcons name="dots-vertical" size={16} color="#fff" />
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

// One row inside the followers / following modal
const FollowRow = memo(function FollowRow({
  item,
  onOpenProfile,
  onMessage,
  onFollowBack,
}) {
  const theme = getLevelTheme(item.level);

  let action;

  if (item.iFollow && item.followsMe) {
    action = (
      <TouchableOpacity
        style={[styles.rowBtn, styles.rowBtnDark]}
        onPress={() => onMessage(item)}
      >
        <Text style={styles.rowBtnTextLight}>Message</Text>
      </TouchableOpacity>
    );
  } else if (item.followsMe) {
    action = (
      <TouchableOpacity
        style={[styles.rowBtn, styles.rowBtnYellow]}
        onPress={() => onFollowBack(item)}
      >
        <Text style={styles.rowBtnTextDark}>Follow Back</Text>
      </TouchableOpacity>
    );
  } else if (item.iFollow) {
    action = (
      <TouchableOpacity style={[styles.rowBtn, styles.rowBtnDark]}>
        <Text style={styles.rowBtnTextLight}>Following</Text>
      </TouchableOpacity>
    );
  } else {
    action = (
      <TouchableOpacity
        style={[styles.rowBtn, styles.rowBtnYellow]}
        onPress={() => onFollowBack(item)}
      >
        <Text style={styles.rowBtnTextDark}>Follow</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.followRow}>
      <TouchableOpacity
        style={styles.followUserTap}
        onPress={() => onOpenProfile(item.id)}
      >
        <FastImage
          uri={item.profileImg}
          fallback={AVATAR_FALLBACK}
          style={styles.followAvatar}
        />

        <View style={styles.followNameWrap}>
          <Text style={styles.followName} numberOfLines={1}>
            {item.username}
          </Text>

          {item.verified && (
            <View style={styles.followTick}>
              <MaterialCommunityIcons
                name="check-decagram"
                size={14}
                color={tickColor(item.verifiedColor)}
              />
            </View>
          )}

          <View
            style={[
              styles.levelBadge,
              { backgroundColor: theme.bg, borderColor: theme.border },
            ]}
          >
            <MaterialCommunityIcons
              name="diamond-stone"
              size={9}
              color={theme.icon}
            />

            <Text style={[styles.levelBadgeText, { color: theme.text }]}>
              LV {item.level}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {action}
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function UserProfile() {
  const router = useRouter();
  const { userId } = useLocalSearchParams();

  const [videos, setVideos] = useState([]);
  const [likedVideos, setLikedVideos] = useState([]);
  const [likedCount, setLikedCount] = useState(0);
  const [likedLoading, setLikedLoading] = useState(false);
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

  const [followersModalVisible, setFollowersModalVisible] = useState(false);
  const [activeFollowTab, setActiveFollowTab] = useState("followers");
  const [followersList, setFollowersList] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [followingLoading, setFollowingLoading] = useState(false);

  const [topGifters, setTopGifters] = useState([]);
  const [giftUserCount, setGiftUserCount] = useState(0);

  const [isBlocked, setIsBlocked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // "already loaded once" flags => reopening the modal / Likes tab is instant
  const followersLoadedRef = useRef(false);
  const followingLoadedRef = useRef(false);
  const likedLoadedRef = useRef(false);
  const followBusyRef = useRef(false);
  const lastFocusFetchRef = useRef({ userId: null, t: 0 });

  // Always-current values for stable callbacks (no re-created handlers)
  const latest = useRef({});
  latest.current = { activeTab, videos, likedVideos, userData };

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
    followersLoadedRef.current = false;
    followingLoadedRef.current = false;
    likedLoadedRef.current = false;

    setFollowersList([]);
    setFollowingList([]);
    setLikedVideos([]);
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
          setGiftUserCount(0);
          return;
        }

        const data = snap.data();
        const gifters = normalizeGifters(data.topGifters);

        setUserData(data);
        setIsVerified(data.verified === true);
        setGiftUserCount(gifters.length);
        setTopGifters(gifters.slice(0, ANGEL_SHOW));
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
    const backHandler = BackHandler.addEventListener(
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

  // Full liked-videos list: only loaded when the Likes tab is opened
  const loadLikedVideos = useCallback(async () => {
    if (!userId) return;

    try {
      setLikedLoading(true);

      const likedSnap = await getDocs(
        collection(db, "userLikes", userId, "likedVideos")
      );

      const videoMap = await fetchDocsByIds(
        "all_videos",
        likedSnap.docs.map((like) => like.id)
      );

      const arr = [...videoMap.values()].map((s) => ({ id: s.id, ...s.data() }));

      sortNewest(arr);

      setLikedVideos(arr);
      setLikedCount(arr.length);
      likedLoadedRef.current = true;
    } catch (error) {
      if (__DEV__) console.log("LOAD LIKED VIDEOS ERROR =", error);
    } finally {
      setLikedLoading(false);
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

  // Single loader for both followers and following
  const loadFollowList = useCallback(
    async (kind) => {
      if (!userId) return;

      const isFollowers = kind === "followers";
      const loadedRef = isFollowers ? followersLoadedRef : followingLoadedRef;
      const setList = isFollowers ? setFollowersList : setFollowingList;
      const setListLoading = isFollowers
        ? setFollowersLoading
        : setFollowingLoading;

      try {
        // Spinner only the first time; after that show cached list instantly
        // and refresh silently in the background.
        if (!loadedRef.current) setListLoading(true);

        const snap = await getDocs(
          query(
            collection(db, "follows"),
            where(isFollowers ? "followingId" : "followerId", "==", userId),
            limit(FOLLOW_LIST_LIMIT)
          )
        );

        const myId = auth.currentUser?.uid;
        const otherKey = isFollowers ? "followerId" : "followingId";

        const otherIds = snap.docs.map((d) => d.data()[otherKey]);

        const [users, wallets, verified, iFollowMap, followsMeMap] =
          await Promise.all([
            fetchDocsByIds("users", otherIds),
            fetchDocsByIds("wallets", otherIds),
            fetchDocsByIds("verifiedUsers", otherIds),
            myId
              ? fetchDocsByIds("follows", otherIds.map((id) => `${myId}_${id}`))
              : new Map(),
            myId
              ? fetchDocsByIds("follows", otherIds.map((id) => `${id}_${myId}`))
              : new Map(),
          ]);

        const results = otherIds.map((otherId) => {
          const userSnap = users.get(otherId);
          if (!userSnap) return null;

          const user = userSnap.data();
          const walletSnap = wallets.get(otherId);

          return {
            id: otherId,
            ...user,
            iFollow: iFollowMap.has(`${myId}_${otherId}`),
            followsMe: followsMeMap.has(`${otherId}_${myId}`),
            level: walletSnap ? walletSnap.data().level || 1 : 1,
            verified: verified.has(otherId),
            verifiedColor: user.verifiedColor || "",
          };
        });

        setList(results.filter(Boolean));
        loadedRef.current = true;
      } catch (error) {
        console.log("LOAD FOLLOW LIST ERROR =", error?.code, error?.message);
      } finally {
        setListLoading(false);
      }
    },
    [userId]
  );

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

      if (likedLoadedRef.current) loadLikedVideos();
      else fetchLikedCount();
    }, [
      userId,
      fetchProfileExtras,
      fetchVideos,
      fetchFollowCounts,
      loadLikedVideos,
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
        likedLoadedRef.current ? loadLikedVideos() : fetchLikedCount(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [
    fetchProfileExtras,
    fetchVideos,
    fetchFollowCounts,
    loadLikedVideos,
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
      }
    } catch (error) {
      // roll back the optimistic update
      setIsFollowing(wasFollowing);
      setFollowersCount((c) => Math.max(0, c + (wasFollowing ? 1 : -1)));
    } finally {
      followBusyRef.current = false;
    }
  }, [currentUserId, userId, isFollowing, sendFollowNotification]);

  // "Follow / Follow Back" from inside the followers/following modal
  const handleFollowBack = useCallback(
    async (target) => {
      const myId = auth.currentUser?.uid;
      if (!myId) return;

      const mark = (value) => (list) =>
        list.map((u) => (u.id === target.id ? { ...u, iFollow: value } : u));

      const viewingMyself = myId === userId;

      setFollowersList(mark(true));
      setFollowingList(mark(true));

      if (viewingMyself) {
        setFollowingCount((c) => c + 1);
        followingLoadedRef.current = false; // my following list changed
      }

      try {
        await setDoc(doc(db, "follows", `${myId}_${target.id}`), {
          followerId: myId,
          followingId: target.id,
        });
      } catch (error) {
        setFollowersList(mark(false));
        setFollowingList(mark(false));

        if (viewingMyself) setFollowingCount((c) => Math.max(0, c - 1));
      }
    },
    [userId]
  );

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
      const { activeTab: tab, videos: v, likedVideos: lv, userData: ud } =
        latest.current;

      const fullList = tab === "Videos" ? v : lv;
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

  const handleTabPress = useCallback(
    (tab) => {
      setActiveTab(tab);

      if (tab === "Likes" && !likedLoadedRef.current) {
        loadLikedVideos();
      }
    },
    [loadLikedVideos]
  );

  const openFollowModal = useCallback(
    (tab) => {
      setActiveFollowTab(tab);
      setFollowersModalVisible(true); // modal opens immediately
      loadFollowList(tab); // data loads in background (cached list shows first)
    },
    [loadFollowList]
  );

  const switchFollowTab = useCallback(
    (tab) => {
      setActiveFollowTab(tab);

      const loadedRef =
        tab === "followers" ? followersLoadedRef : followingLoadedRef;

      if (!loadedRef.current) loadFollowList(tab);
    },
    [loadFollowList]
  );

  const closeFollowModal = useCallback(
    () => setFollowersModalVisible(false),
    []
  );

  const openFollowUserProfile = useCallback(
    (id) => {
      setFollowersModalVisible(false);
      router.push({ pathname: "/userProfile", params: { userId: id } });
    },
    [router]
  );

  const openFollowUserChat = useCallback(
    (item) => {
      setFollowersModalVisible(false);
      router.push({
        pathname: "/chat",
        params: {
          userId: item.id,
          username: item.username,
          profileImg: item.profileImg,
        },
      });
    },
    [router]
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

  const renderFollowItem = useCallback(
    ({ item }) => (
      <FollowRow
        item={item}
        onOpenProfile={openFollowUserProfile}
        onMessage={openFollowUserChat}
        onFollowBack={handleFollowBack}
      />
    ),
    [openFollowUserProfile, openFollowUserChat, handleFollowBack]
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
    const levelTheme = getLevelTheme(userLevel || 1);
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

    return (
      <>
        {/* Profile Section */}
        <View style={styles.profileRow}>
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
            {faceVerified && (
              <View style={styles.faceBadge} pointerEvents="none">
                <Image source={TopKingLogo} style={styles.faceBadgeLogo} />
              </View>
            )}
            {liveRoom && (
              <View style={styles.liveTagProfile} pointerEvents="none">
                <Text style={styles.liveTagProfileText}>LIVE</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.rightSection}>
            <View style={styles.nameRow}>
              <Text
                style={styles.profileName}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                @{username}
              </Text>

              {isVerified && (
                <MaterialCommunityIcons
                  name="check-decagram"
                  size={18}
                  color={verifiedTickColor}
                  style={styles.profileTick}
                />
              )}

              <View
                style={[
                  styles.levelPill,
                  {
                    backgroundColor: levelTheme.bg,
                    borderColor: levelTheme.border,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="diamond-stone"
                  size={11}
                  color={levelTheme.icon}
                />

                <Text
                  style={[styles.levelPillText, { color: levelTheme.text }]}
                >
                  LV {userLevel}
                </Text>
              </View>
            </View>

            <Text style={styles.category}>{category || "User"}</Text>

            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.statBox}
                onPress={() => openFollowModal("followers")}
              >
                <Text style={styles.statNumber}>{followersCount}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.statBox}
                onPress={() => openFollowModal("following")}
              >
                <Text style={styles.statNumber}>{followingCount}</Text>
                <Text style={styles.statLabel}>Following</Text>
              </TouchableOpacity>

              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{totalLikes}</Text>
                <Text style={styles.statLabel}>Likes</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Bio */}
        {!!cleanBio(bioText) && (
          <View style={styles.bioBox}>
            <BioText
              text={cleanBio(bioText)}
              style={styles.bioText}
              moreStyle={styles.bioMore}
            />
          </View>
        )}

        {/* Follow / Message buttons */}
        {!isBlocked && (
          <View style={styles.buttonRow}>
            {isFollowing && isFollowBack ? (
              <TouchableOpacity style={styles.messageBtn} onPress={openChat}>
                <Text style={styles.messageText}>Message</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.followBtn} onPress={handleFollow}>
                <Text style={styles.followText}>{followLabel}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.instaBtn}>
              <Image source={TopKingLogo} style={styles.logoImg} />
            </TouchableOpacity>
          </View>
        )}

        {/* Badges / Rank Block */}
        <View style={styles.premiumCard}>
          {/* Rank */}
          <TouchableOpacity style={styles.premiumItem} activeOpacity={0.8}>
            <MaterialCommunityIcons
              name="star-four-points"
              size={20}
              color="#FFD700"
            />

            <View style={styles.rankTextWrap}>
              <Text style={styles.premiumSmallText}>Rank</Text>
              <Text style={styles.premiumTitle}>{rankText}</Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={18}
              color="#777"
              style={styles.rankChevron}
            />
          </TouchableOpacity>

          <View style={styles.premiumDivider} />

          {/* Angels */}
          <TouchableOpacity style={styles.premiumItem} activeOpacity={0.8}>
            <View>
              <Text style={styles.premiumTitle}>Angels</Text>

              <View style={styles.memberRow}>
                <View style={styles.memberRow}>
                  {topGifters.map((item, index) => {
                    const rank = index + 1;
                    const rc = getAngelRankColors(rank);
                    return (
                      <View
                        key={item.uid || `gifter-${index}`}
                        style={[
                          styles.angelWrap,
                          { marginLeft: index === 0 ? 0 : 10 },
                        ]}
                      >
                        <FastImage
                          uri={item.profileImg}
                          fallback={AVATAR_FALLBACK}
                          style={styles.angelImg}
                        />
                        <View
                          style={[styles.angelBadge, { backgroundColor: rc.bg }]}
                        >
                          <Text
                            style={[styles.angelBadgeText, { color: rc.text }]}
                          >
                            {rank}
                          </Text>
                        </View>
                      </View>
                    );
                  })}

                  <Text style={styles.gifterCount}>{giftUserCount}</Text>
                </View>
              </View>
            </View>

            <Ionicons
              name="chevron-forward"
              size={18}
              color="#777"
              style={styles.angelsChevron}
            />
          </TouchableOpacity>

          <View style={styles.premiumDivider} />

          {/* Share */}
          <TouchableOpacity
            style={styles.shareButton}
            activeOpacity={0.8}
            onPress={handleShareProfile}
          >
            <Ionicons name="share-social" size={18} color="#FFD700" />
            <Text style={styles.shareText}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={activeTab === "Videos" ? styles.activeTab : null}
            onPress={() => handleTabPress("Videos")}
          >
            <Text
              style={
                activeTab === "Videos" ? styles.activeTabText : styles.tabText
              }
            >
              Video ({videos.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={activeTab === "Likes" ? styles.activeTab : null}
            onPress={() => handleTabPress("Likes")}
          >
            <Text
              style={
                activeTab === "Likes" ? styles.activeTabText : styles.tabText
              }
            >
              Like ({likedCount})
            </Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }, [
    profileImg,
    liveRoom,
    openLive,
    username,
    category,
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
    giftUserCount,
    activeTab,
    videos.length,
    likedCount,
    handleFollow,
    openChat,
    handleShareProfile,
    openFollowModal,
    handleTabPress,
  ]);

  // Videos tab me live tile sabse pehle; `videos` state untouched rehta hai
  // (openVideo ka index/list calculation isse kharab na ho).
  const gridData = useMemo(() => {
    if (activeTab !== "Videos") return likedVideos;
    if (!liveRoom) return videos;
    return [
      { id: "__live__", isLiveTile: true, live: liveRoom },
      ...videos,
    ];
  }, [activeTab, videos, likedVideos, liveRoom]);

  const listEmpty = useMemo(
    () =>
      activeTab === "Likes" && likedLoading ? (
        <ActivityIndicator
          size="large"
          color="#FFD700"
          style={styles.likedSpinner}
        />
      ) : null,
    [activeTab, likedLoading]
  );

  const followListLoading =
    activeFollowTab === "followers" ? followersLoading : followingLoading;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.topBar}>
        <View style={styles.userRow}>
          <FastImage
            uri={profileImg}
            fallback={AVATAR_FALLBACK}
            style={styles.smallAvatar}
          />

          <View style={styles.userRow}>
            <Text style={styles.topUsername}>@{username}</Text>

            {isVerified && (
              <View style={styles.topTick}>
                <MaterialCommunityIcons
                  name="check-decagram"
                  size={18}
                  color={tickColor(verifiedColor)}
                />
              </View>
            )}
          </View>
        </View>

        <TouchableOpacity onPress={() => setMenuVisible(true)}>
          <Ionicons name="ellipsis-vertical" size={23} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={gridData}
        keyExtractor={videoKeyExtractor}
        renderItem={renderVideoItem}
        numColumns={3}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#FFD700"]}
            tintColor="#FFD700"
          />
        }
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
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

      {/* Followers / Following modal */}
      <Modal
        visible={followersModalVisible}
        animationType="slide"
        onRequestClose={closeFollowModal}
      >
        <SafeAreaView style={styles.followModal}>
          <TouchableOpacity onPress={closeFollowModal} style={styles.closeBtn}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>

          <View style={styles.followTabs}>
            <TouchableOpacity
              onPress={() => switchFollowTab("followers")}
              style={[
                styles.followTabBtn,
                styles.followTabBtnGap,
                activeFollowTab === "followers"
                  ? styles.followTabOn
                  : styles.followTabOff,
              ]}
            >
              <Text
                style={
                  activeFollowTab === "followers"
                    ? styles.followTabTextOn
                    : styles.followTabTextOff
                }
              >
                Followers
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => switchFollowTab("following")}
              style={[
                styles.followTabBtn,
                activeFollowTab === "following"
                  ? styles.followTabOn
                  : styles.followTabOff,
              ]}
            >
              <Text
                style={
                  activeFollowTab === "following"
                    ? styles.followTabTextOn
                    : styles.followTabTextOff
                }
              >
                Following
              </Text>
            </TouchableOpacity>
          </View>

          {followListLoading ? (
            <View style={styles.followLoading}>
              <ActivityIndicator size="large" color="#FFD700" />

              <Text style={styles.followLoadingText}>
                {activeFollowTab === "followers"
                  ? "Loading followers..."
                  : "Loading following..."}
              </Text>
            </View>
          ) : (
            <FlatList
              data={
                activeFollowTab === "followers" ? followersList : followingList
              }
              keyExtractor={followKeyExtractor}
              renderItem={renderFollowItem}
              initialNumToRender={10}
              maxToRenderPerBatch={8}
              windowSize={7}
              removeClippedSubviews
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Bottom Navigation */}
      <BottomNav />
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

  listContent: {
    paddingBottom: 150,
  },

  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 15,
    marginTop: 35,
    marginBottom: 40,
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
    fontSize: 10,
    fontWeight: "bold",
    marginLeft: 10,
  },

  topTick: {
    marginLeft: 5,
  },

  profileRow: {
    flexDirection: "row",
    paddingHorizontal: 18,
  },

  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "#FFD700",
  },

  // Face-verified user ka logo: photo ke side (neeche-right) me chipka hua
  faceBadge: {
    position: "absolute",
    right: -0,
    bottom: 28,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#000",
    borderWidth: 2,
    borderColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
  },

  faceBadgeLogo: {
    width: 18,
    height: 18,
    resizeMode: "contain",
  },

  profileImageLive: {
    borderWidth: 3,
    borderColor: "#FFD700",
  },

  liveTagProfile: {
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
    fontSize: 17,
    fontWeight: "bold",
    flexShrink: 1,
  },

  profileTick: {
    marginLeft: 3,
  },

  levelPill: {
    marginLeft: 4,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
  },

  levelPillText: {
    fontWeight: "bold",
    marginLeft: 2,
    fontSize: 10,
  },

  category: {
    color: "#FFD700",
    fontSize: 13,
    marginTop: 5,
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    marginTop: 20,
  },

  statBox: {
    alignItems: "center",
    marginRight: 30,
  },

  statNumber: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
  },

  statLabel: {
    color: "#777",
    fontSize: 13.5,
    marginTop: 5,
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
    marginTop: 8,
  },

  bioMore: {
    color: "#8e8e8e",
    fontWeight: "600",
  },

  buttonRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginTop: 25,
  },

  followBtn: {
    flex: 1,
    height: 45,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFD700",
    borderWidth: 1,
    borderColor: "#E6C200",
  },

  followText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "700",
  },

  messageBtn: {
    flex: 1,
    height: 45,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#2c2929",
    borderWidth: 2,
    borderColor: "#FFD700",
  },

  messageText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  instaBtn: {
    width: 100,
    marginLeft: 15,
    backgroundColor: "#111",
    borderRadius: 18,
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
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 0,
    paddingVertical: 12,
    justifyContent: "space-around",
  },

  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: "#FFD700",
  },

  activeTabText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },

  tabText: {
    color: "#ecc815",
    fontSize: 16,
  },

  likedSpinner: {
    marginTop: 30,
  },

  videoCard: {
    width: ITEM_WIDTH,
    height: 170,
    backgroundColor: "#0b0b0b",
    borderRadius: 5,
    margin: 4,
    overflow: "hidden",
  },

  video: {
    width: "100%",
    height: "100%",
  },

  videoOverlayViews: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
  },

  viewCountText: {
    color: "#fff",
    marginLeft: 4,
    fontSize: 12,
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
    marginTop: 20,
    marginHorizontal: 18,
    backgroundColor: "#181818",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#2c2c2c",
    shadowColor: "#FFD700",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },

  premiumItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  premiumSmallText: {
    color: "#888",
    fontSize: 11,
  },

  premiumTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  premiumDivider: {
    width: 1,
    height: 34,
    backgroundColor: "#333",
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
    marginTop: 6,
  },

  memberImg: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#181818",
  },

  angelWrap: {
    width: 28,
    height: 28,
  },

  angelImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#181818",
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

  followAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },

  followNameWrap: {
    marginLeft: 10,
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