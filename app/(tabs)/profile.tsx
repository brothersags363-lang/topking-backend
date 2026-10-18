import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import TopKingLogo from "../../assets/images/topking-logo.png";
// FIREBASE CONFIG
import { auth, db } from '../firebaseConfig';
import { profileLink } from '../../utils/shareLinks';



import { onAuthStateChanged } from 'firebase/auth';
import { collection, collectionGroup, deleteDoc, doc, documentId, getCountFromServer, getDoc, getDocs, limit, onSnapshot, query, setDoc, where, writeBatch } from 'firebase/firestore';



const { width } = Dimensions.get('window');
const ITEM_SIZE = (width - 30) / 3;

const AVATAR_FALLBACK = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
const FOLLOW_LIST_LIMIT = 200;
const FOLLOW_ROW_HEIGHT = 66;

// ---- Bio: Instagram jaisa FIXED size (max 4 lines, 150 chars) ----
const BIO_MAX_LINES = 4;
const BIO_MAX_CHARS = 150;

const cleanBio = (text) => {
  const t = (text || '').trim();
  return t === 'bio.........' ? '' : t;   // purana placeholder hata do
};

const clampBio = (text) =>
  (text || '')
    .replace(/\r/g, '')
    .split('\n')
    .slice(0, BIO_MAX_LINES)
    .join('\n')
    .slice(0, BIO_MAX_CHARS);

// ---- Username: koi bhi simple naam (Instagram rules) ----
const sanitizeUsername = (text) =>
  (text || '')
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 30);

const validateUsername = (u) => {
  if (u.length < 3) return 'Username kam se kam 3 characters ka hona chahiye.';
  if (u.startsWith('.') || u.endsWith('.')) return 'Username . se start ya end nahi ho sakta.';
  if (u.includes('..')) return 'Username me lagatar do . nahi ho sakte.';
  return null;
};

const formatCount = (value) => {
  const n = Number(value || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(n);
};

const chunkArr = (arr, n = 30) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

// 30 ids per query (1 round-trip) instead of 1 read per user
const fetchDocsByIds = async (colName, ids) => {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map();

  await Promise.all(
    chunkArr(unique).map(async (part) => {
      try {
        const snap = await getDocs(
          query(collection(db, colName), where(documentId(), 'in', part))
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

const followKeyExtractor = (item) => item.id;
const followItemLayout = (_data, index) => ({
  length: FOLLOW_ROW_HEIGHT,
  offset: FOLLOW_ROW_HEIGHT * index,
  index,
});

const LEVEL_THEMES = {
  t50: { bg: '#7B1FFF', border: '#FFD700', text: '#fff', icon: '#FFD700' },
  t40: { bg: '#00BFFF', border: '#9EF8FF', text: '#fff', icon: '#fff' },
  t30: { bg: '#FF0066', border: '#FFB6C1', text: '#fff', icon: '#fff' },
  t20: { bg: '#FFC107', border: '#FFE082', text: '#000', icon: '#fff' },
  t10: { bg: '#BDBDBD', border: '#fff', text: '#fff', icon: '#fff' },
  t0:  { bg: '#222',    border: '#555',    text: '#FFD700', icon: '#00E5FF' },
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

const levelThemeFor = (level) => {
  if (level >= 50) return LEVEL_THEMES.t50;
  if (level >= 40) return LEVEL_THEMES.t40;
  if (level >= 30) return LEVEL_THEMES.t30;
  if (level >= 20) return LEVEL_THEMES.t20;
  if (level >= 10) return LEVEL_THEMES.t10;
  return LEVEL_THEMES.t0;
};


// Instagram jaisa bio: 3 line dikhti hai, lambi ho to "more" dabane par khulti hai
const BIO_COLLAPSED_LINES = 3;
const BioText = memo(function BioText({ text, style, moreStyle }) {
  const [expanded, setExpanded] = useState(false);
  const longBio =
    text.split('\n').length > BIO_COLLAPSED_LINES || text.length > 110;

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

// Cached image: memory + disk cache, soft fade (no hard pop-in)
const FastImage = memo(function FastImage({ style, uri, fallback, contentFit = 'cover' }) {
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

// One grid cell. memo => only changed cells re-render
const VideoItem = memo(function VideoItem({ item, onPress }) {
  return (
    <TouchableOpacity style={styles.videoCard} activeOpacity={0.85} onPress={() => onPress(item)}>
      <FastImage uri={item.thumbnail} fallback={AVATAR_FALLBACK} style={styles.video} />

      <View style={styles.videoOverlayViews}>
        <Ionicons name="eye-outline" size={12} color="#fff" />
        <Text style={styles.viewCountText}>{item.views || '0'}</Text>
      </View>

      <View style={styles.videoTitleRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <MaterialCommunityIcons name="play" size={16} color="#FFD700" />
          <Text style={styles.videoItemTitle} numberOfLines={1}>{item.title || 'video'}</Text>
        </View>
        <MaterialCommunityIcons name="dots-vertical" size={16} color="#fff" />
      </View>
    </TouchableOpacity>
  );
});

// One row in the followers / following popup
const FollowRow = memo(function FollowRow({
  item,
  iFollow,
  followsMe,
  onOpenProfile,
  onMessage,
  onToggle,
}) {
  const theme = levelThemeFor(item.level || 1);

  let button;
  if (iFollow && followsMe) {
    button = (
      <TouchableOpacity style={[styles.rowBtn, styles.rowBtnDark]} activeOpacity={0.8} onPress={() => onMessage(item)}>
        <Text style={styles.rowBtnTextLight}>Message</Text>
      </TouchableOpacity>
    );
  } else if (followsMe) {
    button = (
      <TouchableOpacity style={[styles.rowBtn, styles.rowBtnYellow]} activeOpacity={0.8} onPress={() => onToggle(item)}>
        <Text style={styles.rowBtnTextDark}>Follow Back</Text>
      </TouchableOpacity>
    );
  } else if (iFollow) {
    button = (
      <TouchableOpacity style={[styles.rowBtn, styles.rowBtnDark]} activeOpacity={0.8} onPress={() => onToggle(item)}>
        <Text style={styles.rowBtnTextLight}>Following</Text>
      </TouchableOpacity>
    );
  } else {
    button = (
      <TouchableOpacity style={[styles.rowBtn, styles.rowBtnYellow]} activeOpacity={0.8} onPress={() => onToggle(item)}>
        <Text style={styles.rowBtnTextDark}>Follow</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.followRow}>
      <TouchableOpacity
        style={styles.followUserTap}
        activeOpacity={0.8}
        onPress={() => onOpenProfile(item.id)}
      >
        <FastImage uri={item.profileImg} fallback={AVATAR_FALLBACK} style={styles.followAvatar} />

        <View style={styles.followNameCol}>
          <View style={styles.followNameLine}>
            <Text style={styles.followUsername} numberOfLines={1}>{item.username}</Text>

            {item.verified && (
              <MaterialCommunityIcons
                name="check-decagram"
                size={15}
                color={item.verifiedColor === 'yellow' ? '#FFD700' : '#ffffff'}
                style={{ marginLeft: 4 }}
              />
            )}

            <View style={[styles.levelBadge, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <MaterialCommunityIcons name="diamond-stone" size={9} color={theme.icon} />
              <Text style={[styles.levelBadgeText, { color: theme.text }]}>LV {item.level || 1}</Text>
            </View>
          </View>

          {!!item.name && (
            <Text style={styles.followRealName} numberOfLines={1}>{item.name}</Text>
          )}
        </View>
      </TouchableOpacity>

      {button}
    </View>
  );
});



// One row of the side menu
const MenuRow = memo(function MenuRow({ icon, label, onPress, iconColor = '#fff' }) {
  return (
    <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={onPress}>
      <Ionicons name={icon} size={24} color={iconColor} />
      <Text style={styles.menuItemText}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color="#8a8a8a" />
    </TouchableOpacity>
  );
});

export default function ProfileScreen() {


  
  const router = useRouter();
  const pathname = usePathname();
  const isFocused = useIsFocused();
  const params = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [videos, setVideos] = useState([]);
const [likedVideos, setLikedVideos] = useState([]);
const [likedMeCount, setLikedMeCount] = useState(0);
const [followersModalVisible, setFollowersModalVisible] =
  useState(false);

  const [userProfileVisible, setUserProfileVisible] =
useState(false);

const [selectedUser, setSelectedUser] =
useState(null);

const [followersList, setFollowersList] =
  useState([]);



const [followingList, setFollowingList] =
  useState([]);


const [followingIds, setFollowingIds] = useState(new Set());
const [followerIds, setFollowerIds] = useState(new Set());
const followingIdsRef = useRef(new Set());
const followLoadedRef = useRef(false);

const [activeFollowTab, setActiveFollowTab] =
  useState("followers");

const [followLoading, setFollowLoading] = useState(false);

  

const [userRank, setUserRank] = useState(null);


  const [activeTab, setActiveTab] = useState('Videos');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [genderModalVisible, setGenderModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

const [joinedAgency, setJoinedAgency] = useState(false);

const [topGifters, setTopGifters] = useState([]);
const [giftUserCount, setGiftUserCount] = useState(0);
const [refreshing, setRefreshing] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [hasAgency, setHasAgency] = useState(false);
  const [isBD, setIsBD] = useState(false);
  const [playModalVisible, setPlayModalVisible] = useState(false);
const [commentMenuVisible, setCommentMenuVisible] =
useState(false);

const [selectedComment, setSelectedComment] =
useState(null);


  const player = useVideoPlayer(
  selectedVideo?.videoUrl || '',
  (player) => {
  player.loop = true;
    player.play();
  }
 ); 



useEffect(() => {
  if (!playModalVisible) {
    player.pause();
  }
 }, [playModalVisible]);
  
  // Current user email track karne ke liye state
  const [userEmail, setUserEmail] = useState('');

  // Main UI State
  const [profileData, setProfileData] = useState({
    
  name: 'User',
  username: 'user',
    bioText: '',
    category: 'Video Creator',
    gender: 'Male', 
   followers: '0',
following: '0',
likes: '0',
    profileImg: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
  });

  
  // Edit form inputs ke liye individual states
  const [tempName, setTempName] = useState('');
  const [tempUsername, setTempUsername] = useState('');
  const [tempBioText, setTempBioText] = useState('');
  const [tempCategory, setTempCategory] = useState('');
  const [tempGender, setTempGender] = useState('');
  const [tempProfileImg, setTempProfileImg] = useState('');
  const videoCount = videos.length;
  const categories = [
  'Video Creator',
  'Gaming',
  'Comedy',
  'Education',
  'Technology',
  'Business',
  'Fashion',
  'Beauty',
  'Fitness',
  'Food',
  'Travel',
  'Music',
  'Dance',
  'Photography',
  'Sports',
  'News',
  'Motivation',
  'Lifestyle',
  'Entertainment',
  'Influencer',
];

  // Mobile Hardware Back Button Logic
  useEffect(() => {
    const handleBackButton = () => {
if (followersModalVisible) {
  setFollowersModalVisible(false);
  return true;
}


      if (playModalVisible) {
  player.pause();
  setSelectedVideo(null);
  setPlayModalVisible(false);
  return true;

      }

  if (genderModalVisible) {
  setGenderModalVisible(false);
  return true;
}

if (categoryModalVisible) {
  setCategoryModalVisible(false);
  return true;
}

      if (editModalVisible) {
        setEditModalVisible(false);
        return true;
      }
      if (menuVisible) {
        setMenuVisible(false);
        return true;
      }
      router.replace("/");
     
      return true;
    };

    const backHandlerSubscription = BackHandler.addEventListener('hardwareBackPress', handleBackButton);
    
    return () => {
      backHandlerSubscription.remove();
    };

}, [
  playModalVisible,
  editModalVisible,
  genderModalVisible,
  categoryModalVisible,
  menuVisible,
  followersModalVisible
]);

  // Authentication & Profile Setup
  
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      setLoading(false);
      router.replace('/login');
      return;
    }

    setUserEmail(user.email || '');

    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      let core = null;
      let videosPromise = null;

      if (!userSnap.exists()) {
        const newUserData = {
          name: user.displayName || 'User',
          username: user.email?.split('@')[0].toLowerCase().trim() || 'user',
          bioText: '',
          category: 'Video Creator',
          gender: 'Male',
          followers: '0',
          following: '0',
          likes: '0',
          uploadStatus: false,
          profileImg:
            user.photoURL ||
            'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        };

        await setDoc(userRef, newUserData);
        setProfileData((prev) => ({ ...prev, ...newUserData }));
      } else {
        // Fast path: just the fields the header needs (name/username/photo/
        // bio + level), fetched in parallel. This is what lets the profile
        // info show up before the video thumbnails, instead of after.
        videosPromise = loadVideos(user.uid); // parallel, header ke saath
        core = await fetchCoreProfile(user.uid, userSnap);
      }

      // Header is ready — stop showing the spinner now, don't wait for
      // videos/stats/badges too.
      setLoading(false);

      // Video thumbnails load right after the header.
      const videoData = await (videosPromise || loadVideos(user.uid));

      // These reuse data we already fetched above instead of re-querying
      // all_videos / users again.
      setJoinedAgency(!!core?.userData?.agencyId);
      setLikedMeCount(videoData.totalLikes);

      if (
        core?.userData?.verified &&
        core?.userData?.verifiedColor !== 'yellow' &&
        videoData.totalViews >= 4500
      ) {
        setDoc(
          doc(db, 'users', user.uid),
          { verifiedColor: 'yellow' },
          { merge: true }
        ).catch(() => {});
      }

      // Everything else (follower/following counts, liked videos, admin
      // check, rank) is non-essential for first paint and runs quietly in
      // the background.
      Promise.allSettled([
        fetchProfileStats(user.uid, videoData.totalLikes),
        loadLikedVideos(user.uid),
        checkAdmin(user.uid),
        loadUserRank(user.uid, core?.receivedStars || 0),
      ]).catch((error) => {
        if (__DEV__) console.log('BACKGROUND PROFILE LOAD ERROR =', error);
      });
    } catch (error) {
      if (__DEV__) console.log('PROFILE INITIAL LOAD ERROR =', error);
      setLoading(false);
    }
  });

  return () => unsubscribe();
}, []);

// ==========================================
// TOP GIFTERS REALTIME LISTENER
// ==========================================
useEffect(() => {

  let unsubscribeUser = null;

  const unsubscribeAuth = onAuthStateChanged(
    auth,
    (user) => {

      // Logout / user available nahi
      if (!user) {

        setTopGifters([]);
        setGiftUserCount(0);

        if (unsubscribeUser) {
          unsubscribeUser();
          unsubscribeUser = null;
        }

        return;
      }


      // Purana listener remove
      if (unsubscribeUser) {
        unsubscribeUser();
      }

      unsubscribeUser = onSnapshot(
        doc(db, "users", user.uid),
        (snap) => {

          if (!snap.exists()) {


            setTopGifters([]);
            setGiftUserCount(0);

            return;
          }

          const data = snap.data();


          const giftersObject =
            data.topGifters || {};

          const gifters =
            Object.values(giftersObject)
              .filter(Boolean)
              .map((item) => ({
                ...item,
                stars: Number(item.stars || 0),
              }))
              .sort(
                (a, b) => b.stars - a.stars
              );


          setTopGifters(
            gifters.slice(0, ANGEL_SHOW)
          );

          setGiftUserCount(
            gifters.length
          );

        },
        (error) => {


        }
      );

    }
  );

  return () => {

    unsubscribeAuth();

    if (unsubscribeUser) {
      unsubscribeUser();
    }

  };

}, []);



 


// ================= SHARE PROFILE =================
const handleShareProfile = async () => {
  try {
    const username = profileData.username || "user";

    await Share.share({
      message: `Check out my profile on TopKing 👑

@${username}

${profileData.bioText || ""}

${auth.currentUser?.uid ? profileLink(auth.currentUser.uid) : ""}

Join me on TopKing!`,
    });

  } catch (error) {
  }
};

  // Menu: close it, then open a screen
  const go = (path) => {
    setMenuVisible(false);
    router.push(path);
  };

  // Menu: Clean Storage (image cache)
  const handleCleanStorage = () => {
    setMenuVisible(false);
    Alert.alert("Clean Storage", "Cached images clear ho jayengi. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clean",
        onPress: async () => {
          try {
            await ExpoImage.clearDiskCache();
            await ExpoImage.clearMemoryCache();
            Alert.alert("Done", "Storage clean ho gaya.");
          } catch (e) {
            Alert.alert("Error", "Storage clean nahi ho saka.");
          }
        },
      },
    ]);
  };

const checkVerifiedBadge = async (uid) => {
  try {

    // User already verified hai?
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return;

    const userData = userSnap.data();

    // Agar pehle se verified hai to kuch mat karo
    if (userData.verified === true) {
      return;
    }

    // User ke videos lao
    const q = query(
      collection(db, "all_videos"),
      where("userId", "==", uid)
    );

    const snap = await getDocs(q);

    let count = 0;

    snap.forEach((video) => {
      const views = Number(video.data().views || 0);

      if (views >= 300) {
        count++;
      }
    });


    // Agar 5 ya usse jyada videos hain
    if (count >= 5) {

      await setDoc(
        userRef,
        {
          verified: true,
        },
        { merge: true }
      );


    }

  } catch (error) {
  }
};




// NOTE: yellow-badge logic now runs inline in the init effect using
// core.userData.verified + videoData.totalViews (both already fetched),
// instead of re-querying the user doc and the whole all_videos collection
// again here.




  // Fast path — only what the header needs (name, username, photo, bio,
  // level). user doc + wallet doc are fetched together instead of one
  // after another, and this is awaited BEFORE videos load, so the profile
  // info appears first and thumbnails fill in after.
  const fetchCoreProfile = async (uid, prefetchedUserSnap) => {

    try {
      const [docSnap, walletSnap] = await Promise.all([
        prefetchedUserSnap
          ? Promise.resolve(prefetchedUserSnap)
          : getDoc(doc(db, "users", uid)),
        getDoc(doc(db, "wallets", uid)),
      ]);

      const userLevel = walletSnap.exists()
        ? (walletSnap.data().level || 1)
        : 1;

      const receivedStars = walletSnap.exists()
        ? (walletSnap.data().receivedStars || 0)
        : 0;

      if (!docSnap.exists()) return null;

      const data = docSnap.data();

      setHasAgency(data.agencyApproved === true);
      setIsBD(data.isBD === true);

      setProfileData((prev) => ({
        ...prev,
        name: data.name || 'Top King ',
        username:
          data.username ||
          auth.currentUser?.email?.split('@')[0] ||
          'user',
        bioText: cleanBio(data.bioText),
        category: data.category || 'Video Creator',
        gender: data.gender || 'Male',
        profileImg: data.profileImg || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        verified: data.verified || false,
        faceVerified: data.faceStatus === 'submitted' || data.faceStatus === 'approved',
        level: userLevel,
        verifiedColor: data.verifiedColor || "white",
      }));

      return { userData: data, receivedStars };

    } catch (e) {
      if (__DEV__) console.log("Error fetching core profile: ", e);
      return null;
    }
  };

  // Slow path — follower/following counts. Runs after the header is
  // already visible and merges in once ready, instead of blocking
  // everything else.
  const fetchProfileStats = async (uid, totalLikes) => {

    try {
      const followersQuery = query(
        collection(db, "follows"),
        where("followingId", "==", uid)
      );

      const followingQuery = query(
        collection(db, "follows"),
        where("followerId", "==", uid)
      );

      const [followersSnap, followingSnap] = await Promise.all([
        getDocs(followersQuery),
        getDocs(followingQuery),
      ]);

      setProfileData((prev) => ({
        ...prev,
        followers: followersSnap.size.toString(),
        following: followingSnap.size.toString(),
        likes: totalLikes.toString(),
      }));

    } catch (e) {
      if (__DEV__) console.log("Error fetching profile stats: ", e);
    }
  };




  const loadVideos = async (uid) => {
  try {

    const q = query(
      collection(db, "all_videos"),
      where("userId", "==", uid)
    );

    const querySnapshot = await getDocs(q);

    // Newest First: createdAt ke har possible format ko safely compare karo
    const getCreatedTime = (value) => {
      if (!value) return 0;
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
      }
      if (typeof value?.toMillis === "function") return value.toMillis();
      if (typeof value?.seconds === "number") {
        return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
      }
      return 0;
    };

    // Single pass over the docs: builds the video list AND derives
    // totalLikes/totalViews here, so nothing else needs to re-query
    // all_videos for this user again (fetchProfileStats, the yellow-badge
    // check, and likedMeCount all reuse these numbers).
    let totalLikes = 0;
    let totalViews = 0;

    const tempVideos = querySnapshot.docs.map((docItem) => {
      const data = docItem.data();

      totalLikes += Number(data.likes || 0);
      totalViews += Number(data.views || 0);

      return { id: docItem.id, ...data };
    });

    tempVideos.sort((a, b) => {
      return getCreatedTime(b.createdAt) - getCreatedTime(a.createdAt);
    });

    setVideos(tempVideos);

    return { videos: tempVideos, totalLikes, totalViews };

  } catch (e) {
    if (__DEV__) console.log(e);
    return { videos: [], totalLikes: 0, totalViews: 0 };
  }
};



const onRefresh = async () => {

  try {

    setRefreshing(true);

    const uid = auth.currentUser?.uid;

    if (!uid) return;

    followLoadedRef.current = false;

    const [core, videoData] = await Promise.all([
      fetchCoreProfile(uid),
      loadVideos(uid),
    ]);

    setJoinedAgency(!!core?.userData?.agencyId);
    setLikedMeCount(videoData.totalLikes);

    if (
      core?.userData?.verified &&
      core?.userData?.verifiedColor !== 'yellow' &&
      videoData.totalViews >= 4500
    ) {
      setDoc(
        doc(db, 'users', uid),
        { verifiedColor: 'yellow' },
        { merge: true }
      ).catch(() => {});
    }

    await Promise.all([
      fetchProfileStats(uid, videoData.totalLikes),
      loadLikedVideos(uid),
      checkAdmin(uid),
      loadUserRank(uid, core?.receivedStars || 0),
    ]);

  } catch (error) {

    if (__DEV__) console.log("REFRESH ERROR =", error);

  } finally {

    setRefreshing(false);

  }

};



// Rank via a count aggregation query — avoids downloading the whole
// wallets collection just to find one position in it.
const loadUserRank = async (uid, myReceivedStars = 0) => {

  try {

    const q = query(
      collection(db, "wallets"),
      where("receivedStars", ">", myReceivedStars)
    );

    const countSnap = await getCountFromServer(q);

    setUserRank(countSnap.data().count + 1);

  } catch (e) {

    if (__DEV__) console.log(e);

  }

};




const checkAdmin = async (uid) => {

  try {

    const adminSnap = await getDoc(
      doc(db,"admins",uid)
    );

    if (adminSnap.exists()) {

      setIsAdmin(true);

    } else {

      setIsAdmin(false);

    }

  } catch(error){


  }

};



// NOTE: agency-joined status now comes straight from fetchCoreProfile's
// read of the user doc (see setJoinedAgency(!!core?.userData?.agencyId)
// in the init effect) — no separate query needed here anymore.




const loadLikedVideos = async (uid) => {
  try {

    const likedSnapshot = await getDocs(
      collection(
        db,
        "userLikes",
        uid,
        "likedVideos"
      )
    );

    // Fetch every liked video in parallel instead of one-by-one
    const videoSnaps = await Promise.all(
      likedSnapshot.docs.map((like) =>
        getDoc(doc(db, "all_videos", like.id))
      )
    );

    const videosData = videoSnaps
      .filter((snap) => snap.exists())
      .map((snap) => ({
        id: snap.id,
        ...snap.data(),
      }));

    // Newest first
    videosData.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });

    setLikedVideos(videosData);

  } catch (error) {
    if (__DEV__) console.log(error);
  }
};




// NOTE: likedMeCount is now set directly from loadVideos()'s totalLikes
// (see setLikedMeCount(videoData.totalLikes) in the init effect) — it was
// re-querying the exact same all_videos collection a second time just to
// compute the same number.




  const handleDeleteVideo = async (videoId) => {
    Alert.alert("Delete Video", "Kya aap is video ko delete karna chahte hain?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "all_videos", videoId));
            setVideos(videos.filter(v => v.id !== videoId));
            setPlayModalVisible(false);
          } catch (e) {
            Alert.alert("Error", "Delete failed.");
          }
        }
      }
    ]);
  };

  const openEditModal = () => {
    // Current data ko inputs me feed karein taaki edit ho sake
    setTempName(profileData.name);
    setTempUsername(profileData.username);
    setTempBioText(cleanBio(profileData.bioText));
    setTempCategory(profileData.category);
    setTempGender(profileData.gender);
    setTempProfileImg(profileData.profileImg);
    setEditModalVisible(true);
  };

  // Creator Verification se aaya ho (?edit=1) to Edit Profile popup seedha khol do
  useEffect(() => {
    if (!loading && params?.edit === '1') {
      openEditModal();
      router.setParams({ edit: '' });
    }
  }, [loading, params?.edit]);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 1,
    });
    if (!result.canceled) {
      setTempProfileImg(result.assets[0].uri);
    }
  };





// ==========================================================
// FOLLOW LISTS  (Instagram style)
//  - followers + following edges load IN PARALLEL
//  - user docs are fetched in batches of 30 (not 1 read per person)
//  - follow / unfollow is OPTIMISTIC: button changes instantly,
//    Firestore write happens in background, rolls back on error
//  - buttons:  follows me only  -> Follow Back
//              I follow only    -> Following (tap = unfollow)
//              both follow      -> Message
//              nobody           -> Follow
// ==========================================================
const loadFollowData = useCallback(async (force = false) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  if (followLoadedRef.current && !force) return;

  try {
    if (!followLoadedRef.current) setFollowLoading(true);

    const [followersSnap, followingSnap] = await Promise.all([
      getDocs(query(collection(db, 'follows'), where('followingId', '==', uid), limit(FOLLOW_LIST_LIMIT))),
      getDocs(query(collection(db, 'follows'), where('followerId', '==', uid), limit(FOLLOW_LIST_LIMIT))),
    ]);

    const followerIdArr = followersSnap.docs.map((d) => d.data().followerId);
    const followingIdArr = followingSnap.docs.map((d) => d.data().followingId);

    const userMap = await fetchDocsByIds('users', [...followerIdArr, ...followingIdArr]);

    const build = (ids) =>
      ids
        .map((id) => {
          const snap = userMap.get(id);
          if (!snap) return null;
          const d = snap.data();
          return {
            id,
            ...d,
            username: d.username || 'user',
            verified: d.verified || false,
            verifiedColor: d.verifiedColor || 'white',
            level: d.level || 1,
          };
        })
        .filter(Boolean);

    setFollowersList(build(followerIdArr));
    setFollowingList(build(followingIdArr));
    setFollowerIds(new Set(followerIdArr));
    setFollowingIds(new Set(followingIdArr));

    followLoadedRef.current = true;
  } catch (error) {
    if (__DEV__) console.log('FOLLOW LOAD ERROR =', error);
  } finally {
    setFollowLoading(false);
  }
}, []);

const openFollowModal = useCallback((tab) => {
  setActiveFollowTab(tab);
  setFollowersModalVisible(true); // popup turant khulta hai
  loadFollowData();               // data background me aata hai
}, [loadFollowData]);

const toggleFollow = useCallback(async (target) => {
  const myId = auth.currentUser?.uid;
  if (!myId || !target?.id || myId === target.id) return;

  const wasFollowing = followingIdsRef.current.has(target.id);
  const edgeRef = doc(db, 'follows', `${myId}_${target.id}`);

  const applyLocal = (nowFollowing) => {
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (nowFollowing) next.add(target.id);
      else next.delete(target.id);
      return next;
    });

    setProfileData((prev) => ({
      ...prev,
      following: String(
        Math.max(0, Number(prev.following || 0) + (nowFollowing ? 1 : -1))
      ),
    }));
  };

  // 1) UI turant badlo
  applyLocal(!wasFollowing);

  // 2) Firestore background me
  try {
    if (wasFollowing) {
      await deleteDoc(edgeRef);
    } else {
      await setDoc(edgeRef, {
        followerId: myId,
        followingId: target.id,
        createdAt: Date.now(),
      });
    }
  } catch (error) {
    // 3) fail hua to wapas purani state
    applyLocal(wasFollowing);
    Alert.alert('Error', 'Kuch gadbad hui, dobara try karo.');
  }
}, []);

const confirmToggleFollow = useCallback((target) => {
  if (followingIdsRef.current.has(target.id)) {
    Alert.alert(`Unfollow @${target.username}?`, '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unfollow', style: 'destructive', onPress: () => toggleFollow(target) },
    ]);
  } else {
    toggleFollow(target);
  }
}, [toggleFollow]);

const openFollowUserProfile = useCallback((userId) => {
  setFollowersModalVisible(false);
  router.push({ pathname: '/userProfile', params: { userId } });
}, [router]);

const openFollowChat = useCallback((item) => {
  setFollowersModalVisible(false);
  router.push({
    pathname: '/chat',
    params: {
      userId: item.id,
      username: item.username,
      profileImg: item.profileImg,
    },
  });
}, [router]);

const renderFollowRow = useCallback(({ item }) => (
  <FollowRow
    item={item}
    iFollow={followingIds.has(item.id)}
    followsMe={followerIds.has(item.id)}
    onOpenProfile={openFollowUserProfile}
    onMessage={openFollowChat}
    onToggle={confirmToggleFollow}
  />
), [followingIds, followerIds, openFollowUserProfile, openFollowChat, confirmToggleFollow]);

// ==========================================================
// VIDEO GRID  (memoized cell => scroll / tab change smooth)
// ==========================================================
const onVideoPress = useCallback((item) => {
  const currentVideos = activeTab === 'Videos' ? videos : likedVideos;
  const currentIndex = currentVideos.findIndex((v) => v.id === item.id);

  router.push({
    pathname: activeTab === 'Videos' ? '/videoedite' : '/allvideo',
    params: {
      videos: JSON.stringify(currentVideos),
      index: currentIndex,
      userId: auth.currentUser?.uid,
    },
  });
}, [activeTab, videos, likedVideos, router]);

const renderVideoItem = useCallback(
  ({ item }) => <VideoItem item={item} onPress={onVideoPress} />,
  [onVideoPress]
);

  // PROFILE SAVE AND FORCE RE-RENDER FIXED LOGIC
const uploadProfileImage = async (imageUri) => {

  if (!imageUri.startsWith("file://")) {
    return imageUri;
  }

  const data = new FormData();

  data.append("file", {
    uri: imageUri,
    type: "image/jpeg",
    name: "profile.jpg",
  });

  data.append(
    "upload_preset",
   'topking_upload'
  );

  try {

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${'fzmrnrlz'}/image/upload`,
      {
        method: "POST",
        body: data,
      }
    );

    const result = await response.json();


    return result.secure_url || profileData.profileImg;

  } catch (error) {


    Alert.alert(
      "Error",
      "Image upload failed"
    );

    return profileData.profileImg;
  }
};







  // all_videos / comments / replies me jo username + dp save hai use naya karo
  const syncMyIdentity = async (uid, username, photo) => {
    const commit = async (docs, buildData) => {
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, buildData));
        await batch.commit();
      }
    };

    // 1) Mere videos (feed / explore / profile sab yahi fields padhte hain)
    try {
      const vSnap = await getDocs(query(collection(db, 'all_videos'), where('userId', '==', uid)));
      await commit(vSnap.docs, { username, profile: photo });
    } catch (e) {
      if (__DEV__) console.log('SYNC VIDEOS ERROR =', e);
    }

    // 2) Mere comments + replies (collection-group; index na ho to ye skip ho jata hai,
    //    feed me phir bhi live naya naam dikhta hai)
    try {
      const cSnap = await getDocs(query(collectionGroup(db, 'comments'), where('userId', '==', uid)));
      await commit(cSnap.docs, { username, profilePic: photo });
    } catch (e) {
      if (__DEV__) console.log('SYNC COMMENTS ERROR =', e);
    }
    try {
      const rSnap = await getDocs(query(collectionGroup(db, 'replies'), where('userId', '==', uid)));
      await commit(rSnap.docs, { username, profilePic: photo });
    } catch (e) {
      if (__DEV__) console.log('SYNC REPLIES ERROR =', e);
    }
  };

  const handleSaveProfile = async () => {
    if (saving) return;

    const user = auth.currentUser;
    if (!user) return;

    // ---- 1. Validate FIRST (no point uploading an image if this fails) ----
    const cleanUsername = sanitizeUsername(tempUsername);

    const usernameError = validateUsername(cleanUsername);
    if (usernameError) {
      Alert.alert('Username Error', usernameError);
      return;
    }

    setSaving(true);

    try {
      // ---- 2. Image upload + username-unique check run IN PARALLEL ----
      const usernameChanged = cleanUsername !== profileData.username;

      const [imageUrl, usernameTaken] = await Promise.all([
        uploadProfileImage(tempProfileImg),
        usernameChanged
          ? getDocs(
              query(
                collection(db, 'users'),
                where('username', '==', cleanUsername),
                limit(2)
              )
            ).then((snap) => snap.docs.some((d) => d.id !== user.uid))
          : Promise.resolve(false),
      ]);

      if (usernameTaken) {
        Alert.alert(
          'Username Already Taken',
          'Ye username kisi aur user ne use kiya hua hai.'
        );
        return;
      }

      // ---- 3. Only write the fields that were edited ----
      // (old code spread the whole profileData, which re-wrote stale
      // followers / following / likes strings back into Firestore)
      const payload = {
        name: tempName.trim(),
        username: cleanUsername,
        bioText: clampBio(tempBioText).trim(),
        category: tempCategory,
        gender: tempGender,
        profileImg: imageUrl,
      };

      await setDoc(doc(db, 'users', user.uid), payload, { merge: true });

      setProfileData((prev) => ({ ...prev, ...payload }));
      setEditModalVisible(false);

      // Naam / dp badla hai to mere SAARE videos + comments me bhi naya dikhe
      // (background me, UI ko wait nahi karna padta)
      syncMyIdentity(user.uid, cleanUsername, imageUrl);
    } catch (error) {
      Alert.alert('Error', 'Profile save nahi ho saki.');
    } finally {
      setSaving(false);
    }
  };

  const selectGender = (selectedGender) => {
    setTempGender(selectedGender);
    setGenderModalVisible(false);
  };
const selectCategory = (category) => {
  setTempCategory(category);
  setCategoryModalVisible(false);
};



const getLevelDiamond = (level) => {
  if (level >= 1 && level < 9) return 1;
  if (level >= 10 && level < 19) return 2;
  if (level >= 20 && level < 29) return 3;
  if (level >= 30 && level < 39) return 4;
  if (level >= 40 && level < 49) return 5;

  return 0;
};


const getLevelTheme = (level) => {

  if(level>=50){
    return{
      bg:"#7B1FFF",
      border:"#FFD700",
      text:"#fff",
      icon:"#FFD700"
    };
  }

  if(level>=40){
    return{
      bg:"#00BFFF",
      border:"#9EF8FF",
      text:"#fff",
      icon:"#fff"
    };
  }

  if(level>=30){
    return{
      bg:"#FF0066",
      border:"#FFB6C1",
      text:"#fff",
      icon:"#fff"
    };
  }

  if(level>=20){
    return{
      bg:"#FFC107",
      border:"#FFE082",
      text:"#000",
      icon:"#fff"
    };
  }

  if(level>=10){
    return{
      bg:"#BDBDBD",
      border:"#fff",
      text:"#fff",
      icon:"#fff"
    };
  }

  return{
    bg:"#222",
    border:"#555",
    text:"#FFD700",
    icon:"#00E5FF"
  };

};



  const getIconColor = (path) => (pathname === path ? '#f1c40f' : '#ffffff');

const levelTheme =
getLevelTheme(profileData.level || 1);

  followingIdsRef.current = followingIds;

  const bioClean = cleanBio(profileData.bioText);
  const showName =
    !!profileData.name?.trim() &&
    profileData.name.trim().toLowerCase() !== (profileData.username || '').toLowerCase();

  if (loading) return <View style={styles.loaderBox}><ActivityIndicator size="large" color="#FFD700" /></View>;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />

      {/* Top Navigation Bar */}
  <View style={styles.topActionNavigation}>

  {/* Left Side */}
  <TouchableOpacity
    style={styles.starBox}
    activeOpacity={0.7}
    onPress={() => router.push('/claim')}
  >
    <Ionicons
      name="star"
      size={22}
      color="#FFD700"
    />

    <Text style={styles.starValue}>
      Claim
    </Text>
  </TouchableOpacity>

  {/* Right Side */}
  <View style={styles.headerRightActions}>

    <TouchableOpacity
      onPress={() => router.push('/wallet')}
      activeOpacity={0.7}
      style={{marginRight:15}}
    >
      <Ionicons
        name="wallet-outline"
        size={28}
        color="#FFD700"
      />
    </TouchableOpacity>

    <TouchableOpacity
      onPress={() => setMenuVisible(!menuVisible)}
      activeOpacity={0.7}
    >
      <Ionicons
        name="menu"
        size={28}
        color="#fff"
      />
    </TouchableOpacity>

  </View>

</View>


      {/* Side Menu (Tiki style) */}
{menuVisible && (
  <>
    <Pressable
      style={styles.menuOverlay}
      onPress={() => setMenuVisible(false)}
    />

    <View style={styles.menuDropdown}>

      <ScrollView
        style={styles.menuScroll}
        showsVerticalScrollIndicator={false}
      >
        <MenuRow
          icon="share-social-outline"
          label="Share Profile"
          onPress={() => { setMenuVisible(false); handleShareProfile(); }}
        />
        <MenuRow
          icon="wallet-outline"
          label="Wallet"
          onPress={() => go("/wallet")}
        />
        <MenuRow
          icon="trash-bin-outline"
          label="Clean Storage"
          onPress={handleCleanStorage}
        />
        <MenuRow
          icon="videocam-outline"
          label="Quality"
          onPress={() => go("../hdvideo")}
        />
        <MenuRow
          icon="shield-checkmark-outline"
          label="Creator Verification"
          onPress={() => go("../creator")}
        />
        <MenuRow
          icon="document-text-outline"
          label="Community Guidelines"
          onPress={() => go("../guidelines")}
        />
        <MenuRow
          icon="language-outline"
          label="Language"
          onPress={() => go("../language")}
        />
        <MenuRow
          icon="help-circle-outline"
          label="Feedback"
          onPress={() => go("../Feedback")}
        />

        {hasAgency && (
          <MenuRow
            icon="business-outline"
            label="Agency"
            iconColor="#FFD700"
            onPress={() => go("../agency")}
          />
        )}

        {isAdmin && (
          <MenuRow
            icon="shield-checkmark"
            label="Admin Panel"
            iconColor="#FFD700"
            onPress={() => go("../adminPanel")}
          />
        )}
      </ScrollView>

      <View style={styles.menuBottom}>
        <MenuRow
          icon="settings-outline"
          label="Settings"
          onPress={() => go("/settings")}
        />
      </View>

    </View>
  </>
)}



      {/* Main Profile List Container */}
      <FlatList
     data={


    activeTab === "Videos"
      ? videos
      : likedVideos
  }

refreshControl={
  <RefreshControl
    refreshing={refreshing}
    onRefresh={onRefresh}
    colors={["#FFD700"]}
    tintColor="#FFD700"
  />
}


        keyExtractor={(item) => item.id}
        numColumns={3}
        style={styles.videoList}
        contentContainerStyle={{ paddingBottom: 140 }} 
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        updateCellsBatchingPeriod={50}
        ListHeaderComponent={
          <View style={styles.profileHeader}>

            {/* Profile Info Section */}
            <View style={styles.mainInfoSection}>
              <View style={styles.avatarContainer}>
                <FastImage
                  uri={profileData.profileImg}
                  fallback={AVATAR_FALLBACK}
                  style={styles.avatar}
                />
                {profileData.faceVerified && (
                  <View style={styles.faceBadge} pointerEvents="none">
                    <Image source={TopKingLogo} style={styles.faceBadgeLogo} />
                  </View>
                )}
              </View>

              <View style={styles.statsRow}>
                <TouchableOpacity
                  style={styles.statBox}
                  activeOpacity={0.7}
                  onPress={() => openFollowModal('followers')}
                >
                  <Text style={styles.statNum}>{formatCount(profileData.followers)}</Text>
                  <Text style={styles.statLab}>Followers</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.statBox}
                  activeOpacity={0.7}
                  onPress={() => openFollowModal('following')}
                >
                  <Text style={styles.statNum}>{formatCount(profileData.following)}</Text>
                  <Text style={styles.statLab}>Following</Text>
                </TouchableOpacity>

                <View style={styles.statBox}>
                  <Text style={styles.statNum}>{formatCount(likedMeCount)}</Text>
                  <Text style={styles.statLab}>Likes</Text>
                </View>
              </View>
            </View>

            {/* Identity block: name, @username, category, bio (fixed lines) */}
            <View style={styles.identityBlock}>
              <View style={styles.usernameRow}>
                <Text numberOfLines={1} ellipsizeMode="tail" style={styles.profileName}>
                  {showName ? profileData.name : `@${profileData.username || 'user'}`}
                </Text>

                {profileData.verified && (
                  <MaterialCommunityIcons
                    name="check-decagram"
                    size={18}
                    color={profileData.verifiedColor === 'yellow' ? '#FFD700' : '#ffffff'}
                    style={{ marginLeft: 5 }}
                  />
                )}

                <View
                  style={[
                    styles.levelBadge,
                    { backgroundColor: levelTheme.bg, borderColor: levelTheme.border },
                  ]}
                >
                  <MaterialCommunityIcons name="diamond-stone" size={10} color={levelTheme.icon} />
                  <Text style={[styles.levelBadgeText, { color: levelTheme.text }]}>
                    LV {profileData.level || 1}
                  </Text>
                </View>
              </View>

              {showName && (
                <Text style={styles.profileHandle} numberOfLines={1}>
                  @{profileData.username || 'user'}
                </Text>
              )}

              <Text style={styles.categoryText}>{profileData.category}</Text>

              {!!bioClean && (
                <View style={styles.bioSection}>
                  <BioText
                    text={bioClean}
                    style={styles.bioText}
                    moreStyle={styles.bioMore}
                  />
                </View>
              )}
            </View>

            {/* Action Row */}
          <View style={styles.buttonRow}>

  <TouchableOpacity
    style={styles.editBtn}
    onPress={openEditModal}
  >
    <MaterialCommunityIcons
      name="pencil"
      size={16}
      color="#000"
      style={{ marginRight: 6 }}
    />

    <Text style={styles.editBtnText}>
      Edit Profile
    </Text>

  </TouchableOpacity>

  <TouchableOpacity
    style={styles.instaBtn}
    onPress={() => router.push("/Agency-Request")}
  >

    <Image
      source={TopKingLogo}
      style={{
        width:40,
        height:40,
        resizeMode:"contain",
      }}
    />

  </TouchableOpacity>

</View>


            {/* Badges/Rank Block */}
     <View style={styles.premiumCard}>

  {/* Rank */}
  <TouchableOpacity
    style={styles.premiumItem}
    activeOpacity={0.8}
  >
    <MaterialCommunityIcons
      name="star-four-points"
      size={20}
      color="#FFD700"
    />

    <View style={{ marginLeft: 8 }}>
      <Text style={styles.premiumSmallText}>
        Rank
      </Text>

     <Text style={styles.premiumTitle}>
  {userRank == null
    ? "--"
    : userRank > 500
    ? "500+"
    : `No.${userRank}`}
</Text>

    </View>

    <Ionicons
      name="chevron-forward"
      size={18}
      color="#777"
      style={{ marginLeft: 8 }}
    />
  </TouchableOpacity>

  <View style={styles.premiumDivider} />




{/* ========================= */}
{/* Angels / Top Gifters */}
{/* ========================= */}
<TouchableOpacity
  style={styles.premiumItem}
  activeOpacity={0.8}
  onPress={() => {
    router.push("../TopGifters");
  }}
>


  {/* LEFT SIDE */}
  <View style={{ flex: 1 }}>

    {/* Title */}
    <Text style={styles.premiumTitle}>
      Angels
    </Text>


    {/* Top Gifter Photos */}
    <View style={styles.memberRow}>

  {topGifters.slice(0, ANGEL_SHOW).map((item, index) => {

    const imageUri =
      item.photo ||
      item.profileImg ||
      item.profile ||
      item.photoURL ||
      item.avatar ||
      "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

    const rank = index + 1;
    const rc = getAngelRankColors(rank);

    return (
      <View
        key={item.uid || item.userId || `gifter-${index}`}
        style={[styles.angelWrap, { marginLeft: index === 0 ? 0 : 10 }]}
      >
        <Image source={{ uri: imageUri }} style={styles.angelImg} />
        <View style={[styles.angelBadge, { backgroundColor: rc.bg }]}>
          <Text style={[styles.angelBadgeText, { color: rc.text }]}>{rank}</Text>
        </View>
      </View>
    );

  })}


  {giftUserCount > 0 && (

    <Text
      style={{
        color: "#FFD700",
        fontSize: 15,
        fontWeight: "bold",
        marginLeft: 10,
      }}
    >
      {giftUserCount}
    </Text>

  )}

</View>

  </View>


  {/* RIGHT ARROW */}
  <Ionicons
    name="chevron-forward"
    size={18}
    color="#777"
    style={{
      marginLeft: 10,
    }}
  />

</TouchableOpacity>
 




  <View style={styles.premiumDivider} />

  {/* Share */}
  <TouchableOpacity
    style={styles.shareButton}
    activeOpacity={0.8}
  >
    <Ionicons
      name="share-social"
      size={18}
      color="#FFD700"
    />

    <Text style={styles.shareText}>
      Share
    </Text>
  </TouchableOpacity>

</View>

            {/* Content Tabs */}
            <View style={styles.tabContainer}>

<TouchableOpacity
style={activeTab==="Videos"
? styles.activeTab
: styles.tab}
onPress={()=>setActiveTab("Videos")}
>

<Text
style={activeTab==="Videos"
? styles.activeTabText
: styles.tabText}
>
Video ({videoCount})
</Text>

</TouchableOpacity>


<TouchableOpacity
style={activeTab==="Likes"
? styles.activeTab
: styles.tab}
onPress={()=>setActiveTab("Likes")}
>

<Text
style={activeTab==="Likes"
? styles.activeTabText
: styles.tabText}
>
Like ({likedVideos.length})
</Text>

</TouchableOpacity>

</View>


          </View>
        }
        renderItem={renderVideoItem}
      />

      {/* Global Tab Navigation Footer */}
      <View style={styles.bottomSection}>
        <View style={styles.bottomNavContainer}>
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/')}>
            <Ionicons name={pathname === '/' ? "home" : "home-outline"} size={25} color={getIconColor('/')} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/explore')}>
            <Ionicons name={pathname === '/explore' ? "search" : "search-outline"} size={25} color={getIconColor('/explore')} />
          </TouchableOpacity>

          <View style={styles.navItem}>
            <TouchableOpacity style={styles.plusBtn} onPress={() => router.push('/camera')}>
              <Text style={styles.plusText}>+</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/messages')}>
            <Ionicons name={pathname === '/messages' ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"} size={25} color={getIconColor('/messages')} />
          </TouchableOpacity>

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

    
     {/* REELS MODAL */}

<Modal
  visible={playModalVisible}
  animationType="fade"
  transparent={false}
  onRequestClose={() => {
    player.pause();
    setSelectedVideo(null);
    setPlayModalVisible(false);
  }}
>

  <View style={styles.reelsContainer}>
    <StatusBar hidden />

    {selectedVideo && (
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        allowsFullscreen
        allowsPictureInPicture
      />
    )}

    <LinearGradient
      colors={[
        'rgba(0,0,0,0.3)',
        'transparent',
        'rgba(0,0,0,0.6)',
      ]}
      style={StyleSheet.absoluteFill}
    />

    <View style={styles.reelsHeader}>
      <TouchableOpacity
  onPress={() => {
  try {
    player.pause();
  } catch (e) {}

  setPlayModalVisible(false);

  setTimeout(() => {
    setSelectedVideo(null);
  }, 100);
}}
>
  <Ionicons name="chevron-back" size={32} color="#fff" />
</TouchableOpacity>
      <Text style={styles.reelsHeaderTitle}>Reels</Text>

      <TouchableOpacity>
        <Ionicons name="camera-outline" size={28} color="#fff" />
      </TouchableOpacity>
    </View>

    <View style={styles.reelsSideActions}>
      <TouchableOpacity style={styles.reelsActionBtn}>
        <Ionicons name="heart-outline" size={36} color="#fff" />
        <Text style={styles.reelsActionText}>
          {selectedVideo?.likes || 0}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.reelsActionBtn}>
        <Ionicons name="chatbubble-outline" size={32} color="#fff" />
        <Text style={styles.reelsActionText}>
          {selectedVideo?.comments || 0}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.reelsActionBtn}>
        <Ionicons name="paper-plane-outline" size={32} color="#fff" />
        <Text style={styles.reelsActionText}>Share</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.reelsActionBtn}
        onPress={() => handleDeleteVideo(selectedVideo?.id)}
      >
        <MaterialCommunityIcons
          name="delete-outline"
          size={32}
          color="#FF3B30"
        />
        <Text style={[styles.reelsActionText, { color: '#FF3B30' }]}>
          Delete
        </Text>
      </TouchableOpacity>
    </View>

    <View style={styles.reelsUserInfo}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Image
          source={{ uri: profileData.profileImg }}
          style={styles.reelsSmallAvatar}
        />

        <Text style={styles.reelsUsername}>
          {profileData.username}
        </Text>

        <TouchableOpacity style={styles.reelsFollowBtn}>
          <Text style={styles.reelsFollowText}>Follow</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.reelsCaption} numberOfLines={2}>
        {selectedVideo?.caption || 'New post from user'}
      </Text>
    </View>
  </View>
</Modal>

      {/* EDIT PROFILE MODAL */}
     
<Modal
  animationType="slide"
  visible={editModalVisible}
  transparent={false}
  onRequestClose={() => setEditModalVisible(false)}
>

        <SafeAreaView style={{ flex: 1, backgroundColor: '#111' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditModalVisible(false)}><Ionicons name="close" size={28} color="#fff" /></TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>Edit Profile</Text>
            <View style={{ width: 28 }} /> 
          </View>
          
          <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
            {/* Profile Photo Display */}
            <Image source={{ uri: tempProfileImg }} style={styles.editAvatarLarge} />
            <TouchableOpacity onPress={pickImage}><Text style={styles.blueLink}>Change Profile Photo</Text></TouchableOpacity>
            
            {/* Name Input */}
            <View style={styles.inputBox}>
              <Text style={styles.label}>Name</Text>
              <TextInput style={styles.textInput} value={tempName} onChangeText={(text) => setTempName(text)} />
            </View>
            
            {/* Username Input */}
            <View style={styles.inputBox}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.textInput}
                value={tempUsername}
                onChangeText={(text) => setTempUsername(sanitizeUsername(text))}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
                placeholder="simple name, jaise: rahul ya rahul.k"
                placeholderTextColor="#555"
              />
              <Text style={styles.helperText}>
                Letters, numbers, . aur _ use kar sakte ho (kam se kam 3)
              </Text>
            </View>

            {/* Bio Input */}
            <View style={styles.inputBox}>
              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.textInput, { height: 90, textAlignVertical: 'top' }]}
                value={tempBioText}
                onChangeText={(text) => setTempBioText(clampBio(text))}
                multiline
                maxLength={BIO_MAX_CHARS}
                placeholder="Apne baare me likho..."
                placeholderTextColor="#555"
              />
              <Text style={styles.helperText}>
                {tempBioText.length}/{BIO_MAX_CHARS} • max {BIO_MAX_LINES} lines
              </Text>
            </View>

            {/* Category Input */}
            <View style={styles.inputBox}>
  <Text style={styles.label}>Category</Text>

  <TouchableOpacity
    style={styles.dropdownSelector}
    onPress={() => setCategoryModalVisible(true)}
  >
    <Text style={styles.dropdownSelectorText}>
      {tempCategory}
    </Text>

    <Ionicons
      name="chevron-down"
      size={18}
      color="#888"
    />
  </TouchableOpacity>
</View>

            {/* Gender Dropdown Selection Trigger */}
            <View style={styles.inputBox}>
              <Text style={styles.label}>Gender</Text>
              <TouchableOpacity style={styles.dropdownSelector} onPress={() => setGenderModalVisible(true)}>
                <Text style={styles.dropdownSelectorText}>{tempGender || 'Select Gender'}</Text>
                <Ionicons name="chevron-down" size={18} color="#888" />
              </TouchableOpacity>
            </View>

            {/* Login Email View Block (Read-only) */}
            <View style={[styles.inputBox, { marginTop: 10, borderTopWidth: 0.5, borderTopColor: '#222', paddingTop: 15 }]}>
              <Text style={styles.label}>Linked Account Email</Text>
              <View style={styles.disabledEmailBox}>
                <Ionicons name="mail-outline" size={16} color="#555" style={{ marginRight: 8 }} />
                <Text style={styles.disabledEmailText}>{userEmail}</Text>
              </View>
              <Text style={styles.helperText}>Security reasons ki wajah se Email change nahi ho sakta.</Text>
            </View>

            {/* Save Changes button at the bottom */}
            <TouchableOpacity 
              style={styles.saveChangesBtn} 
              onPress={handleSaveProfile} 
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.saveChangesBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
            
            <View style={{ height: 40 }} />
          </ScrollView>

        </SafeAreaView>

        {/* GENDER SELECTION SHEETS/MODAL */}
     
<Modal
  visible={genderModalVisible}
  transparent
  animationType="slide"
  onRequestClose={() => setGenderModalVisible(false)}
>

          <View style={styles.genderModalOverlay}>
            <View style={styles.genderContentContainer}>
              <Text style={styles.genderModalTitle}>Select Your Gender</Text>
              
              <TouchableOpacity style={styles.genderOptionRow} onPress={() => selectGender('Male')}>
                <Text style={styles.genderOptionText}>Male</Text>
                {tempGender === 'Male' && <Ionicons name="checkmark" size={20} color="#FFD700" />}
              </TouchableOpacity>

              <TouchableOpacity style={styles.genderOptionRow} onPress={() => selectGender('Female')}>
                <Text style={styles.genderOptionText}>Female</Text>
                {tempGender === 'Female' && <Ionicons name="checkmark" size={20} color="#FFD700" />}
              </TouchableOpacity>

              <TouchableOpacity style={styles.genderOptionRow} onPress={() => selectGender('Other')}>
                <Text style={styles.genderOptionText}>Other</Text>
                {tempGender === 'Other' && <Ionicons name="checkmark" size={20} color="#FFD700" />}
              </TouchableOpacity>

              <TouchableOpacity style={styles.genderCancelBtn} onPress={() => setGenderModalVisible(false)}>
                <Text style={styles.genderCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </Modal>

<Modal
  visible={categoryModalVisible}
  transparent
  animationType="slide"
  onRequestClose={() => setCategoryModalVisible(false)}
>

  <View style={styles.genderModalOverlay}>
    <View style={styles.genderContentContainer}>

      <Text style={styles.genderModalTitle}>
        Select Category
      </Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
      >
        {categories.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.genderOptionRow}
            onPress={() => selectCategory(item)}
          >
            <Text style={styles.genderOptionText}>
              {item}
            </Text>

            {tempCategory === item && (
              <Ionicons
                name="checkmark"
                size={20}
                color="#FFD700"
              />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={styles.genderCancelBtn}
        onPress={() =>
          setCategoryModalVisible(false)
        }
      >
        <Text style={styles.genderCancelBtnText}>
          Cancel
        </Text>
      </TouchableOpacity>

    </View>
  </View>
</Modal>




<Modal
  visible={followersModalVisible}
  animationType="slide"
  transparent
  statusBarTranslucent
  onRequestClose={() => setFollowersModalVisible(false)}
>
  <View style={styles.fmOverlay}>
    <Pressable
      style={styles.fmBackdrop}
      onPress={() => setFollowersModalVisible(false)}
    />

    <View style={styles.fmSheet}>
      <View style={styles.fmHandle} />

      <Text style={styles.fmTitle} numberOfLines={1}>
        @{profileData.username}
      </Text>

      <View style={styles.fmTabs}>
        <TouchableOpacity
          style={styles.fmTab}
          activeOpacity={0.8}
          onPress={() => setActiveFollowTab('followers')}
        >
          <Text style={[styles.fmTabText, activeFollowTab === 'followers' && styles.fmTabTextOn]}>
            {formatCount(profileData.followers)} Followers
          </Text>
          <View style={[styles.fmTabLine, activeFollowTab === 'followers' && styles.fmTabLineOn]} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.fmTab}
          activeOpacity={0.8}
          onPress={() => setActiveFollowTab('following')}
        >
          <Text style={[styles.fmTabText, activeFollowTab === 'following' && styles.fmTabTextOn]}>
            {formatCount(profileData.following)} Following
          </Text>
          <View style={[styles.fmTabLine, activeFollowTab === 'following' && styles.fmTabLineOn]} />
        </TouchableOpacity>
      </View>

      {followLoading ? (
        <View style={styles.fmLoading}>
          <ActivityIndicator size="large" color="#FFD700" />
        </View>
      ) : (
        <FlatList
          data={activeFollowTab === 'followers' ? followersList : followingList}
          keyExtractor={followKeyExtractor}
          renderItem={renderFollowRow}
          getItemLayout={followItemLayout}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 30 }}
          ListEmptyComponent={
            <Text style={styles.fmEmpty}>
              {activeFollowTab === 'followers'
                ? 'Abhi koi follower nahi hai'
                : 'Aapne abhi kisi ko follow nahi kiya'}
            </Text>
          }
        />
      )}
    </View>
  </View>
</Modal>



    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loaderBox: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  topActionNavigation: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingTop: Platform.OS === 'ios' ? 24 : 45, 
    paddingBottom: 12,
    backgroundColor: '#000', 
    height: Platform.OS === 'ios' ? 75 : 90,
    zIndex: 10
  },
  headerLeftPlaceholder: { flex: 1 },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  profileHeader: { paddingHorizontal: 16, paddingTop: 5 }, 
  mainInfoSection: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  avatarContainer: { width: 90, height: 90, borderRadius: 50, borderWidth: 2, borderColor: '#FFD700', justifyContent: 'center', alignItems: 'center', shadowColor: '#FFD700', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 8, elevation: 5 },
  avatar: { width: 88, height: 88, borderRadius: 45, backgroundColor: '#222' },
  // Face-verified user ka logo: photo ke side (neeche-right) me chipka hua
  faceBadge: { position: 'absolute', right: -8, bottom: -4, width: 30, height: 30, borderRadius: 15, backgroundColor: '#000', borderWidth: 2, borderColor: '#FFD700', justifyContent: 'center', alignItems: 'center' },
  faceBadgeLogo: { width: 20, height: 20, resizeMode: 'contain' },
  profileMetaContainer: { flex: 1, marginLeft: 15 },
  identityBlock: { marginTop: 12 },
  usernameRow: { flexDirection: 'row', alignItems: 'center' },
  profileName: { fontSize: 16, fontWeight: 'bold', color: '#fff', flexShrink: 1 },
  profileHandle: { color: '#9a9a9a', fontSize: 13, marginTop: 2 },
  categoryText: { color: '#FFD700', fontSize: 12, marginTop: 3, fontWeight: '500' },
  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginLeft: 10 },
  statBox: { alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4, minWidth: 64 },
  statNum: { fontSize: 17, fontWeight: 'bold', color: '#fff' },
  statLab: { fontSize: 12.5, color: '#888', marginTop: 2 },
  bioSection: { marginTop: 8 },
  bioText: { fontSize: 14, lineHeight: 19, color: '#fff', marginTop: 6 },
  bioMore: { color: '#8e8e8e', fontWeight: '600' },
  buttonRow: { flexDirection: 'row', marginTop: 20, gap: 12 },
  editBtn: { flex: 1, backgroundColor: '#FFD700', paddingVertical: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }, 
  editBtnText: { fontWeight: 'bold', color: '#000', fontSize: 15 },
  instaBtn: { backgroundColor: '#141414', paddingHorizontal: 16, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#222' },
  highlightsContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 20, padding: 16, backgroundColor: '#111111', borderRadius: 16, borderWidth: 1, borderColor: '#1c1c1c' },
  highlightLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  starIconStyle: { transform: [{ rotate: '15deg' }] },
  rankLabel: { color: '#666', fontSize: 11, fontWeight: '500' },
  no1Text: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginTop: 2 },
  arrowLabel: { color: '#555', fontSize: 16, fontWeight: 'normal' },
  verticalDivider: { width: 1, height: 40, backgroundColor: '#222', marginHorizontal: 10 },
  highlightRight: { flex: 1.2, paddingLeft: 5 },
  levelLabel: { color: '#666', fontSize: 11, fontWeight: '500', marginBottom: 4 },
  circlesRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  circle: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: '#FFD700', justifyContent: 'center', alignItems: 'center', shadowColor: '#FFD700', shadowRadius: 3, elevation: 2 },
  crownPosition: { position: 'absolute', top: -11 },
  arrowIcon: { fontSize: 14, color: '#444', marginHorizontal: 2 },
   
 tabContainer:{
flexDirection:"row",
marginTop:20,
borderBottomWidth:1,
borderBottomColor:"#222"
},

activeTab:{
flex:1,
alignItems:"center",
paddingBottom:10,
borderBottomWidth:2,
borderBottomColor:"#FFD700"
},

tab:{
flex:1,
alignItems:"center",
paddingBottom:10
},

activeTabText:{
color:"#FFD700",
fontWeight:"bold",
fontSize:16
},

tabText:{
color:"#888",
fontSize:16
},
 
  tabTextActive: { color: '#FFD700', marginLeft: 6, fontWeight: 'bold', fontSize: 13 },
  tabText: { color: '#fff', marginLeft: 6, fontWeight: '500', fontSize: 13 },
  videoList: { flex: 1, marginTop: 10 }, 
  videoCard: { width: ITEM_SIZE, height: ITEM_SIZE * 1.5, margin: 5, backgroundColor: '#111', borderRadius: 5, overflow: 'hidden' },
  video: { width: '100%', height: '100%' },
  videoOverlayViews: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  viewCountText: { color: '#fff', fontSize: 10, marginLeft: 4, fontWeight: 'bold' },
  videoTitleRow: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.1)' },
  videoItemTitle: { color: '#fff', fontSize: 11, marginLeft: 4, fontWeight: '500', width: width / 3 - 45 },
  
  bottomSection: { 
    position: 'absolute', 
    bottom: 0, 
    width: '100%', 
    backgroundColor: '#000', 
    borderTopWidth: 0.5, 
    borderTopColor: '#1c1c1c',
    paddingBottom: Platform.OS === 'ios' ? 25 : 10,
    paddingTop: 8,
    zIndex: 99
  },
  bottomNavContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-around', 
    width: '100%', 
    height: 115 
  },
  navItem: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  plusBtn: { 
    backgroundColor: '#FFD700', 
    width: 48, 
    height: 32, 
    borderRadius: 8, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  plusText: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: '#000', 
    marginTop: -3 
  },
  
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 0.5, borderColor: '#222' },
  editAvatarLarge: { width: 90, height: 90, borderRadius: 45, alignSelf: 'center', marginTop: 10 },
  blueLink: { color: '#0095f6', textAlign: 'center', fontWeight: 'bold', marginVertical: 10 },
  inputBox: { marginBottom: 18 },
  label: { fontSize: 12, color: '#888', marginBottom: 5, fontWeight: '500' },
  textInput: { borderBottomWidth: 1, borderColor: '#222', paddingVertical: 5, fontSize: 16, color: '#fff' },
  
  saveChangesBtn: {
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 25,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3
  },
  saveChangesBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold'
  },



menuOverlay: {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "transparent",
  zIndex: 9998,
},


menuDropdown: {
  position: "absolute",
  top: 0,
  bottom: 25,
  right: 0,
  width: "78%",
  backgroundColor: "#121212",
  paddingTop: Platform.OS === "ios" ? 60 : 55,
  paddingBottom: Platform.OS === "ios" ? 30 : 20,
  zIndex: 9999,
  elevation: 20,
  shadowColor: "#000",
  shadowOpacity: 0.5,
  shadowRadius: 12,
},

menuScroll: { flex: 1 },

menuItem: {
  flexDirection: "row",
  alignItems: "center",
  paddingVertical: 16,
  paddingHorizontal: 20,
  minHeight: 58,
},

menuItemText: {
  flex: 1,
  color: "#fff",
  fontSize: 16,
  marginLeft: 16,
  fontWeight: "500",
},

menuBottom: {
  borderTopWidth: 0.5,
  borderTopColor: "#262626",
},
  

  reelsContainer: { flex: 1, backgroundColor: '#000' },
  reelsHeader: { position: 'absolute', top: 40, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, zIndex: 10 },
  reelsHeaderTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  reelsSideActions: { position: 'absolute', right: 10, bottom: 100, alignItems: 'center', zIndex: 10 },
  reelsActionBtn: { alignItems: 'center', marginBottom: 20 },
  reelsActionText: { color: '#fff', fontSize: 12, fontWeight: 'bold', marginTop: 5 },
  reelsUserInfo: { position: 'absolute', bottom: 40, left: 15, right: 80, zIndex: 10 },
  reelsSmallAvatar: { width: 35, height: 35, borderRadius: 17.5, borderWidth: 1, borderColor: '#fff' },
  reelsUsername: { color: '#fff', fontWeight: 'bold', marginLeft: 10, fontSize: 15 },
  reelsFollowBtn: { borderWidth: 1, borderColor: '#fff', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 5, marginLeft: 10 },
  reelsFollowText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  reelsCaption: { color: '#fff', fontSize: 14, marginTop: 10, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 2 },

  dropdownSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#222',
    paddingVertical: 8,
  },
  dropdownSelectorText: {
    fontSize: 16,
    color: '#fff',
  },
  disabledEmailBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#252525',
    marginTop: 5,
  },
  disabledEmailText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  helperText: {
    fontSize: 11,
    color: '#555',
    marginTop: 5,
    fontStyle: 'italic',
  },

  genderModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
 genderContentContainer: {
  backgroundColor: '#161616',
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  padding: 20,
  paddingBottom: Platform.OS === 'ios' ? 40 : 25,

  height: '50%', // aadhi screen
},
  genderModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 15,
  },
  genderOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: '#252525',
  },
  genderOptionText: {
    fontSize: 16,
    color: '#fff',
  },
  genderCancelBtn: {
    marginTop: 15,
    backgroundColor: '#222',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  genderCancelBtnText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },


starBox: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#1b1b1b',
  paddingHorizontal: 15,
  paddingVertical: 5,
  borderRadius: 25,
  borderWidth: 1,
  borderColor: '#333',
},

starValue: {
  color: '#fff',
  fontSize: 15,
  fontWeight: '700',
  marginLeft: 6,
 
},


levelBadge: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",

  paddingHorizontal: 6,
  paddingVertical: 2,

  borderRadius: 20,

  marginLeft: 4,

  borderWidth: 1,
},

levelBadgeText: {
  marginLeft: 3,
  fontSize: 9,
  fontWeight: "bold",
},

premiumCard:{
    marginTop:20,
    marginHorizontal:0,
    backgroundColor:"#181818",
    borderRadius:12,
    flexDirection:"row",
    alignItems:"center",
    paddingVertical:5,

    borderWidth:1,
    borderColor:"#2c2c2c",

    shadowColor:"#FFD700",
    shadowOpacity:0.30,
    shadowRadius:12,
    shadowOffset:{
        width:0,
        height:4,
    },

    elevation:10,
},

premiumItem:{
    flex:1,
    flexDirection:"row",
    alignItems:"center",
    justifyContent:"center",
},

premiumSmallText:{
    color:"#888",
    fontSize:11,
},

premiumTitle:{
    color:"#fff",
    fontSize:15,
    fontWeight:"700",
},

premiumDivider:{
    width:1,
    height:34,
    backgroundColor:"#333",
},

shareButton:{
    backgroundColor:"#3d3200",
    paddingHorizontal:16,
    paddingVertical:9,
    borderRadius:12,
    flexDirection:"row",
    alignItems:"center",
    marginHorizontal:10,
},

shareText:{
    color:"#FFD700",
    fontWeight:"bold",
    marginLeft:6,
},


memberRow:{
    flexDirection:"row",
    marginTop:6,
},

memberImg:{
    width:24,
    height:24,
    borderRadius:12,
    borderWidth:2,
    borderColor:"#181818",
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

  // ---- followers / following popup ----
  fmOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  fmBackdrop: { ...StyleSheet.absoluteFillObject },
  fmSheet: {
    height: '82%',
    backgroundColor: '#121212',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  fmHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#444', marginTop: 8 },
  fmTitle: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 12, marginBottom: 8, paddingHorizontal: 50 },
  fmTabs: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#2a2a2a' },
  fmTab: { flex: 1, alignItems: 'center', paddingTop: 10 },
  fmTabText: { color: '#888', fontSize: 14, fontWeight: '600', paddingBottom: 10 },
  fmTabTextOn: { color: '#fff' },
  fmTabLine: { height: 2, alignSelf: 'stretch', backgroundColor: 'transparent' },
  fmTabLineOn: { backgroundColor: '#FFD700' },
  fmLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fmEmpty: { color: '#777', textAlign: 'center', marginTop: 60, fontSize: 14 },

  followRow: { flexDirection: 'row', alignItems: 'center', height: FOLLOW_ROW_HEIGHT, paddingHorizontal: 14 },
  followUserTap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  followAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#222' },
  followNameCol: { flex: 1, marginLeft: 10, marginRight: 8 },
  followNameLine: { flexDirection: 'row', alignItems: 'center' },
  followUsername: { color: '#fff', fontSize: 14, fontWeight: 'bold', flexShrink: 1 },
  followRealName: { color: '#8e8e8e', fontSize: 12.5, marginTop: 2 },
  rowBtn: { width: 98, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  rowBtnYellow: { backgroundColor: '#FFD700' },
  rowBtnDark: { backgroundColor: '#262626' },
  rowBtnTextDark: { color: '#000', fontWeight: 'bold', fontSize: 13 },
  rowBtnTextLight: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
});