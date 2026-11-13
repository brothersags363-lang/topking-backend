import AppBottomNav from '../../components/AppBottomNav';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, usePathname } from 'expo-router';
import { useRouter } from '../../utils/safeRouter';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  FlatList,
  InteractionManager,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { scopedBackHandler } from '../../utils/scopedBack';
import { callApi } from '../../utils/api';
import TopKingLogo from '../../assets/images/topking-logo.png';
import FamilyCell from '../../components/FamilyCell';
import FastImage from '../../components/FastImage';
import UserTick from '../../components/UserTick';
import { profileLink } from '../../utils/shareLinks';
import {
  AVATAR_FALLBACK,
  cleanBio,
  fetchDocsByIds,
  formatCount,
  levelThemeFor,
  toMillis,
} from '../../utils/profileHelpers';
import { auth, db } from '../firebaseConfig';

const { width } = Dimensions.get('window');
const ITEM_SIZE = width / 3;

// Angels: kitne top gifters dikhane hain
const ANGEL_SHOW = 3;
const ANGEL_RANK_COLORS = {
  1: { bg: '#FFD700', text: '#000' },
  2: { bg: '#C0C0C0', text: '#000' },
  3: { bg: '#CD7F32', text: '#fff' },
};
const getAngelRankColors = (rank) => ANGEL_RANK_COLORS[rank] || { bg: '#444', text: '#fff' };

const videoKey = (item) => item.id;

const getCreatedTime = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const p = Date.parse(value);
    return Number.isNaN(p) ? 0 : p;
  }
  return toMillis(value);
};

// Sirf tab state badlo jab value sach me badli ho => faltu re-render nahi hota
const mergeProfile = (prev, next) => {
  for (const k in next) {
    if (prev[k] !== next[k]) return { ...prev, ...next };
  }
  return prev;
};

// Bio: 3 line dikhti hai, lambi ho to "more" dabane par khulti hai
const BIO_COLLAPSED_LINES = 3;
const BioText = memo(function BioText({ text, style, moreStyle }) {
  const [expanded, setExpanded] = useState(false);
  const longBio = text.split('\n').length > BIO_COLLAPSED_LINES || text.length > 110;

  return (
    <Text
      style={style}
      numberOfLines={expanded || !longBio ? undefined : BIO_COLLAPSED_LINES}
      ellipsizeMode="tail"
      onPress={longBio ? () => setExpanded((v) => !v) : undefined}
    >
      {text}
      {longBio && <Text style={moreStyle}>{expanded ? '  less' : '  more'}</Text>}
    </Text>
  );
});

// "+" button ke upar hint kitna upar rahe (bottom nav ki height ke hisaab se adjust karo)
const HINT_BOTTOM = 70;

// Jab ek bhi video na ho: "Tap to create your first video" bubble
// Native driver => animation JS thread par load nahi daalta, 60fps smooth
const CreateVideoHint = memo(function CreateVideoHint() {
  const appear = useRef(new Animated.Value(0)).current; // fade + pop-in
  const bounce = useRef(new Animated.Value(0)).current; // upar-neeche halka hilna

  useEffect(() => {
    Animated.spring(appear, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: -6, duration: 700, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      appear.stopAnimation();
    };
  }, [appear, bounce]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.hintWrap,
        {
          opacity: appear,
          transform: [
            { translateY: bounce },
            { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
          ],
        },
      ]}
    >
      <View style={styles.hintIconBadge}>
        <Ionicons name="videocam" size={26} color="#000" />
      </View>
      <View style={styles.hintBubble}>
        <Text style={styles.hintText}>Tap to create your first video</Text>
      </View>
      <View style={styles.hintArrow} />
    </Animated.View>
  );
});

// One grid cell. memo => only changed cells re-render
const VideoItem = memo(function VideoItem({ item, onPress }) {
  return (
    <TouchableOpacity style={styles.videoCard} activeOpacity={0.85} onPress={() => onPress(item)}>
      <FastImage uri={item.thumbnail} fallback={AVATAR_FALLBACK} style={styles.video} />

      {!!(item.pinned || item.isPinned) && (
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
  const params = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [videos, setVideos] = useState([]);
  const [videosLoaded, setVideosLoaded] = useState(false); // load hone se pehle hint na flash kare
  const [likedCount, setLikedCount] = useState(0);
  const [likedMeCount, setLikedMeCount] = useState(0);
  const [userRank, setUserRank] = useState(null);
  const [activeTab, setActiveTab] = useState('Videos');
  const [menuVisible, setMenuVisible] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasAgency, setHasAgency] = useState(false);
  const [topGifters, setTopGifters] = useState([]);
  const [giftUserCount, setGiftUserCount] = useState(0);
  const [hasStars, setHasStars] = useState(false);
  const [familyShown, setFamilyShown] = useState(false);

  const firstFocusRef = useRef(true);
  const lastRefreshRef = useRef(0);
  const giftSigRef = useRef('');
  const navLockRef = useRef(false);
  const routerRef = useRef(router);
  routerRef.current = router;

  // Double-tap / jaldi-jaldi click par ek hi page khulega (stack nahi banega)
  // Lock 600ms me ya screen focus par khud khul jata hai => kabhi atakta nahi
  const push = useCallback((to) => {
    if (navLockRef.current) return;
    navLockRef.current = true;
    setTimeout(() => { navLockRef.current = false; }, 600);
    routerRef.current.push(to);
  }, []);

  const [profileData, setProfileData] = useState({
    name: 'User',
    username: 'user',
    usernameChangedAt: 0,
    bioText: '',
    category: 'Video Creator',
    followers: '0',
    following: '0',
    likes: '0',
    profileImg: AVATAR_FALLBACK,
  });

  // ================== DATA LOADERS ==================

  // Fast path: header ke liye sirf zaroori fields (user doc + wallet saath me)
  const fetchCoreProfile = async (uid, prefetchedUserSnap) => {
    try {
      const [docSnap, walletSnap] = await Promise.all([
        prefetchedUserSnap ? Promise.resolve(prefetchedUserSnap) : getDoc(doc(db, 'users', uid)),
        getDoc(doc(db, 'wallets', uid)),
      ]);

      const wallet = walletSnap.exists() ? walletSnap.data() : {};
      const userLevel = wallet.level || 1;
      const receivedStars = wallet.receivedStars || 0;
      setHasStars(receivedStars > 0);

      if (!docSnap.exists()) return null;
      const data = docSnap.data();

      setHasAgency(data.agencyApproved === true);

      setProfileData((prev) =>
        mergeProfile(prev, {
          name: data.name || 'Top King ',
          username: data.username || auth.currentUser?.email?.split('@')[0] || 'user',
          usernameChangedAt: toMillis(data.usernameChangedAt),
          bioText: cleanBio(data.bioText),
          category: data.category || 'Video Creator',
          profileImg: data.profileImg || AVATAR_FALLBACK,
          verified: data.verified || false,
          faceVerified: data.faceStatus === 'submitted' || data.faceStatus === 'approved',
          level: userLevel,
          verifiedColor: data.verifiedColor || 'white',
        })
      );

      return { userData: data, receivedStars };
    } catch (e) {
      if (__DEV__) console.log('Error fetching core profile: ', e);
      return null;
    }
  };

  // Followers/following ki puri list download karne ki jagah sirf COUNT (bahut halka)
  const fetchProfileStats = async (uid, totalLikes) => {
    try {
      const [f, g, l] = await Promise.all([
        getCountFromServer(query(collection(db, 'follows'), where('followingId', '==', uid))),
        getCountFromServer(query(collection(db, 'follows'), where('followerId', '==', uid))),
        getCountFromServer(collection(db, 'userLikes', uid, 'likedVideos')).catch(() => null),
      ]);
      if (l) setLikedCount(l.data().count);

      setProfileData((prev) =>
        mergeProfile(prev, {
          followers: String(f.data().count),
          following: String(g.data().count),
          ...(totalLikes != null ? { likes: String(totalLikes) } : {}),
        })
      );
    } catch (e) {
      if (__DEV__) console.log('Error fetching profile stats: ', e);
    }
  };

  const loadVideos = async (uid) => {
    try {
      const snap = await getDocs(query(collection(db, 'all_videos'), where('userId', '==', uid)));

      let totalLikes = 0;
      let totalViews = 0;

      const list = snap.docs.map((d) => {
        const data = d.data();
        totalLikes += Number(data.likes || 0);
        totalViews += Number(data.views || 0);
        return { id: d.id, ...data };
      });

      list.sort((a, b) => getCreatedTime(b.createdAt) - getCreatedTime(a.createdAt));
      setVideos(list);
      setVideosLoaded(true);

      return { videos: list, totalLikes, totalViews };
    } catch (e) {
      if (__DEV__) console.log(e);
      return { videos: [], totalLikes: 0, totalViews: 0 };
    }
  };

  const loadUserRank = async (uid, myReceivedStars = 0) => {
    try {
      const countSnap = await getCountFromServer(
        query(collection(db, 'wallets'), where('receivedStars', '>', myReceivedStars))
      );
      setUserRank(countSnap.data().count + 1);
    } catch (e) {
      if (__DEV__) console.log(e);
    }
  };

  const checkAdmin = async (uid) => {
    try {
      const s = await getDoc(doc(db, 'admins', uid));
      setIsAdmin(s.exists());
    } catch (e) {}
  };

  // Grey V: 5 videos x 3000+ views. Tick server khud lagata hai (client ab DB me seedha nahi likhta)
  const greyClaimTried = useRef(false);
  const maybeYellowBadge = (uid, core, videos) => {
    const ud = core?.userData;
    if (greyClaimTried.current || !ud) return;
    if (ud.verifiedColor === 'yellow' || ud.verifiedColor === 'blue') return;
    let n = 0;
    for (const v of videos || []) if (Number(v?.views || 0) >= 3000) n += 1;
    if (n < 5) return;
    greyClaimTried.current = true; // ek session me ek hi baar try
    callApi('/creator/claim-grey', {}).catch(() => {});
  };

  // ================== INIT (auth + profile + top gifters, ek hi listener) ==================
  useEffect(() => {
    let unsubGifters = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubGifters) {
        unsubGifters();
        unsubGifters = null;
      }

      if (!user) {
        setTopGifters([]);
        setGiftUserCount(0);
        setLoading(false);
        router.replace('/login');
        return;
      }

      // Top gifters realtime
      unsubGifters = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          if (!snap.exists()) {
            setTopGifters([]);
            setGiftUserCount(0);
            return;
          }
          const gifters = Object.values(snap.data().topGifters || {})
            .filter(Boolean)
            .map((g) => ({ ...g, stars: Number(g.stars || 0) }))
            .sort((a, b) => b.stars - a.stars);

          const top = gifters.slice(0, ANGEL_SHOW);
          const sig = gifters.length + '|' + top.map((g) => `${g.uid || g.userId}:${g.stars}`).join(',');
          if (sig === giftSigRef.current) return; // kuch nahi badla -> na re-render, na extra reads
          giftSigRef.current = sig;
          setTopGifters(top);
          setGiftUserCount(gifters.length);

          // Angels ki photo: gifter ki LIVE profile photo users/{uid} se lo
          Promise.all(
            top.map((g) =>
              (g.uid || g.userId) ? getDoc(doc(db, 'users', g.uid || g.userId)).catch(() => null) : null
            )
          )
            .then((snaps) => {
              setTopGifters((prev) =>
                prev.map((g, i) => {
                  const d = snaps[i] && snaps[i].exists() ? snaps[i].data() : null;
                  const img = d?.profileImg || d?.photoURL;
                  return img ? { ...g, profileImg: img, photo: img } : g;
                })
              );
            })
            .catch(() => {});
        },
        () => {}
      );

      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
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
            profileImg: user.photoURL || AVATAR_FALLBACK,
            usernameSet: false,
          };
          await setDoc(doc(db, 'users', user.uid), newUserData);
          setLoading(false);
          router.replace({ pathname: '/editProfile', params: { force: '1' } });
          return;
        } else if (userSnap.data()?.usernameSet === false) {
          // Username add nahi kiya -> profile mat kholo, Edit Profile par bhejo
          setLoading(false);
          router.replace({ pathname: '/editProfile', params: { force: '1' } });
          return;
        } else {
          videosPromise = loadVideos(user.uid); // header ke saath parallel
          core = await fetchCoreProfile(user.uid, userSnap);
        }

        setLoading(false); // header ready - videos ka wait nahi

        const videoData = await (videosPromise || loadVideos(user.uid));
        setLikedMeCount(videoData.totalLikes);
        maybeYellowBadge(user.uid, core, videoData.videos);

        // Baaki sab background me
        Promise.allSettled([
          fetchProfileStats(user.uid, videoData.totalLikes),
          checkAdmin(user.uid),
          loadUserRank(user.uid, core?.receivedStars || 0),
        ]);
      } catch (e) {
        if (__DEV__) console.log('PROFILE INITIAL LOAD ERROR =', e);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubGifters) unsubGifters();
    };
  }, []);

  // Edit / Followers page se wapas aane par sirf halka refresh (naam, photo, counts)
  useFocusEffect(
    useCallback(() => {
      navLockRef.current = false; // wapas aane par taps hamesha chalu

      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        lastRefreshRef.current = Date.now();
        return () => setMenuVisible(false);
      }

      // Har wapsi par nahi, sirf 20 sec baad refresh + UI free hone ke baad
      const uid = auth.currentUser?.uid;
      let task = null;
      if (uid && Date.now() - lastRefreshRef.current > 20000) {
        lastRefreshRef.current = Date.now();
        task = InteractionManager.runAfterInteractions(() => {
          fetchCoreProfile(uid);
          fetchProfileStats(uid);
        });
      }
      return () => {
        task?.cancel?.();
        setMenuVisible(false); // page se nikalte hi menu band
      };
    }, [])
  );

  // Hardware back: sirf jab ye screen focus me ho (nahi to dusre pages ka back bhi pakad leta)
  useFocusEffect(
    useCallback(() => {
      const sub = scopedBackHandler('/profile', 'hardwareBackPress', () => {
        if (menuVisible) {
          setMenuVisible(false);
          return true;
        }
        router.replace('/');
        return true;
      });
      return () => sub.remove();
    }, [menuVisible])
  );

  // Creator Verification se aaya ho (?edit=1) to Edit Profile page seedha khol do
  useEffect(() => {
    if (!loading && params?.edit === '1') {
      router.setParams({ edit: '' });
      router.push('/editProfile');
    }
  }, [loading, params?.edit]);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const [core, videoData] = await Promise.all([fetchCoreProfile(uid), loadVideos(uid)]);
      setLikedMeCount(videoData.totalLikes);
      maybeYellowBadge(uid, core, videoData.videos);

      await Promise.all([
        fetchProfileStats(uid, videoData.totalLikes),
        checkAdmin(uid),
        loadUserRank(uid, core?.receivedStars || 0),
      ]);
    } catch (e) {
      if (__DEV__) console.log('REFRESH ERROR =', e);
    } finally {
      setRefreshing(false);
    }
  };

  // ================== ACTIONS ==================
  const handleShareProfile = async () => {
    try {
      await Share.share({
        message: `Check out my profile on TopKing 👑\n\n@${profileData.username || 'user'}\n\n${profileData.bioText || ''}\n\n${
          auth.currentUser?.uid ? profileLink(auth.currentUser.uid) : ''
        }\n\nJoin me on TopKing!`,
      });
    } catch (e) {}
  };

  const go = (path) => {
    setMenuVisible(false);
    push(path);
  };

  const handleCleanStorage = () => {
    setMenuVisible(false);
    Alert.alert('Clean Storage', 'Cached images clear ho jayengi. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clean',
        onPress: async () => {
          try {
            await ExpoImage.clearDiskCache();
            await ExpoImage.clearMemoryCache();
            Alert.alert('Done', 'Storage clean ho gaya.');
          } catch (e) {
            Alert.alert('Error', 'Storage clean nahi ho saka.');
          }
        },
      },
    ]);
  };

  // Video tab profile me hi rehta hai; "Like" dabane par alag Like page khulta hai
  const onTabChange = useCallback(
    (tab) => {
      if (tab === 'Likes') {
        push({
          pathname: '/likes',
          params: { userId: auth.currentUser?.uid, username: profileData.username },
        });
        return;
      }
      setActiveTab('Videos');
    },
    [push, profileData.username]
  );

  // JSON pehle se ready (videos badalne par ek baar) => tap par UI nahi atakta
  const videosJson = useMemo(() => JSON.stringify(videos), [videos]);

  const onVideoPress = useCallback(
    (item) => {
      const index = videos.findIndex((v) => v.id === item.id);
      push({
        pathname: '/videoedite',
        params: { videos: videosJson, index, userId: auth.currentUser?.uid },
      });
    },
    [videos, videosJson, push]
  );

  const renderVideoItem = useCallback(
    ({ item }) => <VideoItem item={item} onPress={onVideoPress} />,
    [onVideoPress]
  );

  const getIconColor = (path) => (pathname === path ? '#f1c40f' : '#ffffff');

  // ================== HEADER (memoized: scroll / tab change par dobara nahi banta) ==================
  const header = useMemo(() => {
    const levelTheme = levelThemeFor(profileData.level || 1);
    const bioClean = cleanBio(profileData.bioText);
    const showName =
      !!profileData.name?.trim() &&
      profileData.name.trim().toLowerCase() !== (profileData.username || '').toLowerCase();
    const myUid = auth.currentUser?.uid;
    // Star card tabhi dikhe jab user ko kabhi star mila ho ya Angels (gifters) hon
    const showStarCard = hasStars || topGifters.length > 0;

    const openList = (pathname) =>
      push({ pathname, params: { username: profileData.username } });

    return (
      <View style={styles.profileHeader}>
        <View style={styles.mainInfoSection}>
          <View style={styles.avatarContainer}>
            <FastImage uri={profileData.profileImg} fallback={AVATAR_FALLBACK} style={styles.avatar} />
          </View>

          <View style={styles.infoRight}>
            <View style={styles.usernameRow}>
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.profileName}>
                {profileData.username || 'user'}
              </Text>
              <UserTick
                verified={profileData.verified}
                verifiedColor={profileData.verifiedColor}
                faceVerified={profileData.faceVerified}
                size={16}
                style={{ marginLeft: 5 }}
              />
              <View style={[styles.levelBadge, { backgroundColor: levelTheme.bg, borderColor: levelTheme.border }]}>
                <MaterialCommunityIcons name="diamond-stone" size={10} color={levelTheme.icon} />
                <Text style={[styles.levelBadgeText, { color: levelTheme.text }]}>LV {profileData.level || 1}</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <TouchableOpacity style={styles.statBox} activeOpacity={0.7} onPress={() => openList('/followers')}>
                <Text style={styles.statNum}>{formatCount(profileData.followers)}</Text>
                <Text style={styles.statLab}>Followers</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.statBox} activeOpacity={0.7} onPress={() => openList('/following')}>
                <Text style={styles.statNum}>{formatCount(profileData.following)}</Text>
                <Text style={styles.statLab}>Following</Text>
              </TouchableOpacity>

              <View style={styles.statBox}>
                <Text style={styles.statNum}>{formatCount(likedMeCount)}</Text>
                <Text style={styles.statLab}>Likes</Text>
              </View>
            </View>
          </View>
        </View>

        {(showName || !!bioClean) && (
          <View style={styles.identityBlock}>
            {showName && (
              <Text style={styles.displayName} numberOfLines={1}>{profileData.name}</Text>
            )}
            {!!bioClean && (
              <View style={styles.bioSection}>
                <BioText text={bioClean} style={styles.bioText} moreStyle={styles.bioMore} />
              </View>
            )}
          </View>
        )}

        {/* Edit Profile (TopKing logo button waisa hi rakha hai) */}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.editBtn} activeOpacity={0.8} onPress={() => push('/editProfile')}>
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.instaBtn} onPress={() => push('/Agency-Request')}>
            <Image source={TopKingLogo} style={{ width: 40, height: 40, resizeMode: 'contain' }} />
          </TouchableOpacity>
        </View>

        {/* Rank + Angels (sirf jab star mila ho) | Family alag card (sirf jab family me ho) */}
        <View style={styles.cardsRow}>
          {showStarCard && (
            <View style={[styles.premiumCard, { flex: 1 }]}>
              <TouchableOpacity style={styles.premiumItem} activeOpacity={0.8}>
                <MaterialCommunityIcons name="star-four-points" size={22} color="#FFD700" />
                <View>
                  <Text style={styles.premiumSmallText}>Rank</Text>
                  <Text style={styles.premiumTitle}>
                    {userRank == null ? '--' : userRank > 500 ? '500+' : `No.${userRank}`}
                  </Text>
                </View>
              </TouchableOpacity>

              {topGifters.length > 0 && (
                <TouchableOpacity style={styles.premiumItem} activeOpacity={0.8} onPress={() => push('../TopGifters')}>
                  <View>
                    <Text style={styles.premiumSmallText}>Angels</Text>
                    <View style={styles.memberRow}>
                      {topGifters.slice(0, ANGEL_SHOW).map((item, index) => {
                        const imageUri =
                          item.photo || item.profileImg || item.profile || item.photoURL || item.avatar || AVATAR_FALLBACK;

                        return (
                          <View
                            key={item.uid || item.userId || `gifter-${index}`}
                            style={[styles.angelWrap, { marginLeft: index === 0 ? 0 : -8, zIndex: ANGEL_SHOW - index }]}
                          >
                            <FastImage uri={imageUri} style={styles.angelImg} />
                          </View>
                        );
                      })}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#9a9a9a" />
                </TouchableOpacity>
              )}

            </View>
          )}

          {/* FamilyCell khud decide karta hai: family hai to dikhta hai, warna kuch nahi (card bhi nahi) */}
          <View style={familyShown ? [styles.premiumCard, styles.familyCard] : null}>
            <View onLayout={(e) => setFamilyShown(e.nativeEvent.layout.height > 0)}>
              <FamilyCell userId={myUid} fallback={null} />
            </View>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity style={styles.tab} activeOpacity={0.8} onPress={() => onTabChange('Videos')}>
            <Text style={activeTab === 'Videos' ? styles.activeTabText : styles.tabText}>
              Videos {videos.length}
            </Text>
            <View style={[styles.tabUnderline, activeTab !== 'Videos' && { backgroundColor: 'transparent' }]} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.tab} activeOpacity={0.8} onPress={() => onTabChange('Likes')}>
            <Text style={activeTab === 'Likes' ? styles.activeTabText : styles.tabText}>
              Likes {likedCount}
            </Text>
            <View style={[styles.tabUnderline, activeTab !== 'Likes' && { backgroundColor: 'transparent' }]} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [profileData, likedMeCount, userRank, topGifters, giftUserCount, hasStars, familyShown, activeTab, videos.length, likedCount, push, onTabChange]);

  if (loading) {
    return (
      <View style={styles.loaderBox}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />

      {/* Top Navigation Bar */}
      <View style={styles.topActionNavigation}>
        <TouchableOpacity style={styles.starBox} activeOpacity={0.7} onPress={() => push('/claim')}>
          <Ionicons name="star" size={22} color="#FFD700" />
          <Text style={styles.starValue}>Claim</Text>
        </TouchableOpacity>

        <View style={styles.headerRightActions}>
          <TouchableOpacity onPress={() => push('/wallet')} activeOpacity={0.7} style={{ marginRight: 15 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="wallet-outline" size={28} color="#FFD700" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setMenuVisible((v) => !v)} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="menu" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Side Menu */}
      {menuVisible && (
        <>
          <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)} />

          <View style={styles.menuDropdown}>
            <ScrollView style={styles.menuScroll} showsVerticalScrollIndicator={false}>
              <MenuRow icon="share-social-outline" label="Share Profile" onPress={() => { setMenuVisible(false); handleShareProfile(); }} />
              <MenuRow icon="wallet-outline" label="Wallet" onPress={() => go('/wallet')} />
              <MenuRow icon="trash-bin-outline" label="Clean Storage" onPress={handleCleanStorage} />
              <MenuRow icon="videocam-outline" label="Quality" onPress={() => go('../hdvideo')} />
              <MenuRow icon="shield-checkmark-outline" label="Creator Verification" onPress={() => go('../creator')} />
              <MenuRow icon="document-text-outline" label="Community Guidelines" onPress={() => go('../guidelines')} />
              <MenuRow icon="language-outline" label="Language" onPress={() => go('../language')} />
              <MenuRow icon="help-circle-outline" label="Feedback" onPress={() => go('../Feedback')} />
              <MenuRow icon="people-circle-outline" label="Family" iconColor="#FFE500" onPress={() => go('../family')} />
              {hasAgency && <MenuRow icon="business-outline" label="Agency" iconColor="#FFD700" onPress={() => go('../agency')} />}
              {isAdmin && <MenuRow icon="shield-checkmark" label="Admin Panel" iconColor="#FFD700" onPress={() => go('../adminPanel')} />}
            </ScrollView>

            <View style={styles.menuBottom}>
              <MenuRow icon="settings-outline" label="Settings" onPress={() => go('/settings')} />
            </View>
          </View>
        </>
      )}

      {/* Videos grid */}
      <FlatList
        data={videos}
        keyExtractor={videoKey}
        renderItem={renderVideoItem}
        numColumns={3}
        style={styles.videoList}
        contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 1 }}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        initialNumToRender={12}
        maxToRenderPerBatch={6}
        windowSize={7}
        updateCellsBatchingPeriod={80}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#FFD700']} tintColor="#FFD700" />
        }
        ListHeaderComponent={header}
      />

      {/* Koi video nahi => "Tap to create your first video" hint */}
      {videosLoaded && videos.length === 0 && !refreshing && <CreateVideoHint />}

      {/* Bottom Navigation: components/AppBottomNav.tsx */}
      <AppBottomNav />
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
    zIndex: 10,
  },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  profileHeader: { paddingHorizontal: 16, paddingTop: 5 },
  mainInfoSection: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  avatarContainer: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 30, backgroundColor: '#222' },
  identityBlock: { marginTop: 10 },
  usernameRow: { flexDirection: 'row', alignItems: 'center' },
  profileName: { fontSize: 18, fontWeight: 'bold', color: '#fff', flexShrink: 1 },
  profileHandle: { color: '#9a9a9a', fontSize: 13, marginTop: 2 },
  categoryText: { color: '#FFD700', fontSize: 12, marginTop: 3, fontWeight: '500' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginTop: 6 },
  statBox: { alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4, minWidth: 64 },
  statNum: { fontSize: 17, fontWeight: 'bold', color: '#fff' },
  statLab: { fontSize: 13, color: '#8a8a8a', marginTop: 2 },
  bioSection: { marginTop: 4 },
  bioText: { fontSize: 14, lineHeight: 19, color: '#fff' },
  bioMore: { color: '#8e8e8e', fontWeight: '600' },
  buttonRow: { flexDirection: 'row', marginTop: 16, gap: 10 },
  editBtn: { flex: 1, backgroundColor: '#2a2a2a', paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  editBtnText: { fontWeight: '700', color: '#fff', fontSize: 15 },
  instaBtn: { backgroundColor: '#2a2a2a', paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },

  tabContainer: { flexDirection: 'row', marginTop: 18 },
  activeTab: { flex: 1, alignItems: 'center', paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: '#FFD700' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  activeTabText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  tabText: { color: '#8a8a8a', fontWeight: 'bold', fontSize: 16 },

  videoList: { flex: 1, marginTop: 4 },
  videoCard: { width: ITEM_SIZE - 2, height: (ITEM_SIZE - 2) * 1.42, margin: 1, backgroundColor: '#111', overflow: 'hidden' },
  video: { width: '100%', height: '100%' },
  videoOverlayViews: { position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center' },
  viewCountText: { color: '#fff', fontSize: 12, marginLeft: 3, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  videoTitleRow: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.1)' },
  videoItemTitle: { color: '#fff', fontSize: 11, marginLeft: 4, fontWeight: '500', width: width / 3 - 45 },

  bottomSection: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#000', paddingTop: 0, zIndex: 99 },
  bottomNavContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', width: '100%', height: 56 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plusBtn: { backgroundColor: '#FFD400', width: 48, height: 34, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  plusText: { fontSize: 28, fontWeight: 'bold', color: '#000', marginTop: -4 },

  menuOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent', zIndex: 9998 },
  menuDropdown: { position: 'absolute', top: 0, bottom: 25, right: 0, width: '78%', backgroundColor: '#121212', paddingTop: Platform.OS === 'ios' ? 60 : 55, paddingBottom: Platform.OS === 'ios' ? 30 : 20, zIndex: 9999, elevation: 20, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12 },
  menuScroll: { flex: 1 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20, minHeight: 58 },
  menuItemText: { flex: 1, color: '#fff', fontSize: 16, marginLeft: 16, fontWeight: '500' },
  menuBottom: { borderTopWidth: 0.5, borderTopColor: '#262626' },

  starBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1b1b1b', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 25, borderWidth: 1, borderColor: '#333' },
  starValue: { color: '#fff', fontSize: 15, fontWeight: '700', marginLeft: 6 },

  levelBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20, marginLeft: 4, borderWidth: 1 },
  levelBadgeText: { marginLeft: 3, fontSize: 9, fontWeight: 'bold' },

  premiumCard: { marginTop: 14, backgroundColor: '#2a2a2a', borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, gap: 14 },
  premiumItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  premiumSmallText: { color: '#8a8a8a', fontSize: 11 },
  premiumTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  premiumDivider: { width: 1, height: 34, backgroundColor: '#333' },
  shareButton: { backgroundColor: '#D4C700', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, flexDirection: 'row', alignItems: 'center' },
  shareText: { color: '#1a1a1a', fontWeight: 'bold', fontSize: 13, marginLeft: 5 },
  memberRow: { flexDirection: 'row', alignItems: 'center' },
  angelWrap: { width: 22, height: 22 },
  angelImg: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#2a2a2a' },
  infoRight: { flex: 1, marginLeft: 14 },
  displayName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cardsRow: { flexDirection: 'row', gap: 10 },
  familyCard: { paddingHorizontal: 10 },
  tabUnderline: { width: 22, height: 3, borderRadius: 2, backgroundColor: '#FFD700', marginTop: 6 },
  pinnedBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  pinnedText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  angelBadge: { position: 'absolute', right: -5, bottom: -5, minWidth: 14, height: 14, paddingHorizontal: 2, borderRadius: 7, borderWidth: 1.5, borderColor: '#181818', justifyContent: 'center', alignItems: 'center' },
  angelBadgeText: { fontSize: 9, fontWeight: '900', lineHeight: 11 },

  // Create-video hint
  hintWrap: { position: 'absolute', alignSelf: 'center', bottom: HINT_BOTTOM, alignItems: 'center', zIndex: 50 },
  hintIconBadge: { width: 46, height: 38, borderRadius: 12, backgroundColor: '#FFD400', justifyContent: 'center', alignItems: 'center', marginBottom: -14, zIndex: 2, transform: [{ rotate: '-8deg' }] },
  hintBubble: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, maxWidth: 190 },
  hintText: { color: '#333', fontSize: 13, fontWeight: '500', textAlign: 'center' },
  hintArrow: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#fff' },
});
