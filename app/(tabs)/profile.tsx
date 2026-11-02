import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
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
  BackHandler,
  Dimensions,
  FlatList,
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
import TopKingLogo from '../../assets/images/topking-logo.png';
import FamilyCell from '../../components/FamilyCell';
import FastImage from '../../components/FastImage';
import { AvatarFrame } from '../../components/FramedAvatar';
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
const ITEM_SIZE = (width - 30) / 3;

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
  const [likedCount, setLikedCount] = useState(0);
  const [likedMeCount, setLikedMeCount] = useState(0);
  const [userRank, setUserRank] = useState(null);
  const [activeTab, setActiveTab] = useState('Videos');
  const [menuVisible, setMenuVisible] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasAgency, setHasAgency] = useState(false);
  const [topGifters, setTopGifters] = useState([]);
  const [giftUserCount, setGiftUserCount] = useState(0);

  const firstFocusRef = useRef(true);

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

      if (!docSnap.exists()) return null;
      const data = docSnap.data();

      setHasAgency(data.agencyApproved === true);

      setProfileData((prev) => ({
        ...prev,
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
      }));

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

      setProfileData((prev) => ({
        ...prev,
        followers: String(f.data().count),
        following: String(g.data().count),
        ...(totalLikes != null ? { likes: String(totalLikes) } : {}),
      }));
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

  const maybeYellowBadge = (uid, core, totalViews) => {
    if (core?.userData?.verified && core?.userData?.verifiedColor !== 'yellow' && totalViews >= 4500) {
      setDoc(doc(db, 'users', uid), { verifiedColor: 'yellow' }, { merge: true }).catch(() => {});
    }
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
          };
          await setDoc(doc(db, 'users', user.uid), newUserData);
          setProfileData((prev) => ({ ...prev, ...newUserData }));
        } else {
          videosPromise = loadVideos(user.uid); // header ke saath parallel
          core = await fetchCoreProfile(user.uid, userSnap);
        }

        setLoading(false); // header ready - videos ka wait nahi

        const videoData = await (videosPromise || loadVideos(user.uid));
        setLikedMeCount(videoData.totalLikes);
        maybeYellowBadge(user.uid, core, videoData.totalViews);

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
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      fetchCoreProfile(uid);
      fetchProfileStats(uid);
    }, [])
  );

  // Hardware back: sirf jab ye screen focus me ho (nahi to dusre pages ka back bhi pakad leta)
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
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
      maybeYellowBadge(uid, core, videoData.totalViews);

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
    router.push(path);
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
        router.push({
          pathname: '/likes',
          params: { userId: auth.currentUser?.uid, username: profileData.username },
        });
        return;
      }
      setActiveTab('Videos');
    },
    [router, profileData.username]
  );

  const onVideoPress = useCallback(
    (item) => {
      const current = videos;
      const index = current.findIndex((v) => v.id === item.id);

      router.push({
        pathname: '/videoedite',
        params: {
          videos: JSON.stringify(current),
          index,
          userId: auth.currentUser?.uid,
        },
      });
    },
    [videos, router]
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

    const openList = (pathname) =>
      router.push({ pathname, params: { username: profileData.username } });

    return (
      <View style={styles.profileHeader}>
        <View style={styles.mainInfoSection}>
          <View style={styles.avatarContainer}>
            <FastImage uri={profileData.profileImg} fallback={AVATAR_FALLBACK} style={styles.avatar} />
            <View pointerEvents="none" style={{ position: 'absolute', top: -2, left: -2 }}>
              <AvatarFrame uid={myUid} size={90} ratio={1.3} animated />
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

        <View style={styles.identityBlock}>
          <View style={styles.usernameRow}>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.profileName}>
              {showName ? profileData.name : `@${profileData.username || 'user'}`}
            </Text>

            <UserTick
              verified={profileData.verified}
              verifiedColor={profileData.verifiedColor}
              faceVerified={profileData.faceVerified}
              size={18}
              style={{ marginLeft: 5 }}
            />

            <View style={[styles.levelBadge, { backgroundColor: levelTheme.bg, borderColor: levelTheme.border }]}>
              <MaterialCommunityIcons name="diamond-stone" size={10} color={levelTheme.icon} />
              <Text style={[styles.levelBadgeText, { color: levelTheme.text }]}>LV {profileData.level || 1}</Text>
            </View>
          </View>

          {showName && (
            <Text style={styles.profileHandle} numberOfLines={1}>@{profileData.username || 'user'}</Text>
          )}

          <Text style={styles.categoryText}>{profileData.category}</Text>

          {!!bioClean && (
            <View style={styles.bioSection}>
              <BioText text={bioClean} style={styles.bioText} moreStyle={styles.bioMore} />
            </View>
          )}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/editProfile')}>
            <MaterialCommunityIcons name="pencil" size={16} color="#000" style={{ marginRight: 6 }} />
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.instaBtn} onPress={() => router.push('/Agency-Request')}>
            <Image source={TopKingLogo} style={{ width: 40, height: 40, resizeMode: 'contain' }} />
          </TouchableOpacity>
        </View>

        {/* Rank / Angels / Family */}
        <View style={styles.premiumCard}>
          <TouchableOpacity style={styles.premiumItem} activeOpacity={0.8}>
            <MaterialCommunityIcons name="star-four-points" size={20} color="#FFD700" />
            <View style={{ marginLeft: 8 }}>
              <Text style={styles.premiumSmallText}>Rank</Text>
              <Text style={styles.premiumTitle}>
                {userRank == null ? '--' : userRank > 500 ? '500+' : `No.${userRank}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#777" style={{ marginLeft: 8 }} />
          </TouchableOpacity>

          <View style={styles.premiumDivider} />

          <TouchableOpacity style={styles.premiumItem} activeOpacity={0.8} onPress={() => router.push('../TopGifters')}>
            <View style={{ flex: 1 }}>
              <Text style={styles.premiumTitle}>Angels</Text>

              <View style={styles.memberRow}>
                {topGifters.map((item, index) => {
                  const imageUri =
                    item.photo || item.profileImg || item.profile || item.photoURL || item.avatar || AVATAR_FALLBACK;
                  const rank = index + 1;
                  const rc = getAngelRankColors(rank);

                  return (
                    <View
                      key={item.uid || item.userId || `gifter-${index}`}
                      style={[styles.angelWrap, { marginLeft: index === 0 ? 0 : 10 }]}
                    >
                      <FastImage uri={imageUri} style={styles.angelImg} />
                      <View style={[styles.angelBadge, { backgroundColor: rc.bg }]}>
                        <Text style={[styles.angelBadgeText, { color: rc.text }]}>{rank}</Text>
                      </View>
                    </View>
                  );
                })}

                {giftUserCount > 0 && (
                  <Text style={{ color: '#FFD700', fontSize: 15, fontWeight: 'bold', marginLeft: 10 }}>
                    {giftUserCount}
                  </Text>
                )}
              </View>
            </View>

            <Ionicons name="chevron-forward" size={18} color="#777" style={{ marginLeft: 10 }} />
          </TouchableOpacity>

          <View style={styles.premiumDivider} />

          <FamilyCell
            userId={myUid}
            fallback={
              <TouchableOpacity style={styles.shareButton} activeOpacity={0.8}>
                <Ionicons name="share-social" size={18} color="#FFD700" />
                <Text style={styles.shareText}>Share</Text>
              </TouchableOpacity>
            }
          />
        </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={activeTab === 'Videos' ? styles.activeTab : styles.tab}
            onPress={() => onTabChange('Videos')}
          >
            <Text style={activeTab === 'Videos' ? styles.activeTabText : styles.tabText}>
              Video ({videos.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tab}
            onPress={() => onTabChange('Likes')}
          >
            <Text style={styles.tabText}>
              Like ({likedCount})
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [profileData, likedMeCount, userRank, topGifters, giftUserCount, activeTab, videos.length, likedCount, router, onTabChange]);

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
        <TouchableOpacity style={styles.starBox} activeOpacity={0.7} onPress={() => router.push('/claim')}>
          <Ionicons name="star" size={22} color="#FFD700" />
          <Text style={styles.starValue}>Claim</Text>
        </TouchableOpacity>

        <View style={styles.headerRightActions}>
          <TouchableOpacity onPress={() => router.push('/wallet')} activeOpacity={0.7} style={{ marginRight: 15 }}>
            <Ionicons name="wallet-outline" size={28} color="#FFD700" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setMenuVisible((v) => !v)} activeOpacity={0.7}>
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
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        initialNumToRender={9}
        maxToRenderPerBatch={9}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#FFD700']} tintColor="#FFD700" />
        }
        ListHeaderComponent={header}
      />

      {/* Bottom Navigation */}
      <View style={styles.bottomSection}>
        <View style={styles.bottomNavContainer}>
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/')}>
            <Ionicons name={pathname === '/' ? 'home' : 'home-outline'} size={25} color={getIconColor('/')} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/explore')}>
            <Ionicons name={pathname === '/explore' ? 'search' : 'search-outline'} size={25} color={getIconColor('/explore')} />
          </TouchableOpacity>

          <View style={styles.navItem}>
            <TouchableOpacity style={styles.plusBtn} onPress={() => router.push('/camera')}>
              <Text style={styles.plusText}>+</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/messages')}>
            <Ionicons name={pathname === '/messages' ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} size={25} color={getIconColor('/messages')} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navItem}
            onPress={() => {
              if (!auth.currentUser) {
                router.push('/login');
                return;
              }
              router.replace('/profile');
            }}
          >
            <Ionicons name="person-outline" size={26} color={getIconColor('/profile')} />
          </TouchableOpacity>
        </View>
      </View>
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
  avatarContainer: { width: 90, height: 90, borderRadius: 50, borderWidth: 2, borderColor: '#FFD700', justifyContent: 'center', alignItems: 'center', shadowColor: '#FFD700', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 8, elevation: 5 },
  avatar: { width: 88, height: 88, borderRadius: 45, backgroundColor: '#222' },
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

  tabContainer: { flexDirection: 'row', marginTop: 20, borderBottomWidth: 1, borderBottomColor: '#222' },
  activeTab: { flex: 1, alignItems: 'center', paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: '#FFD700' },
  tab: { flex: 1, alignItems: 'center', paddingBottom: 10 },
  activeTabText: { color: '#FFD700', fontWeight: 'bold', fontSize: 16 },
  tabText: { color: '#888', fontSize: 16 },

  videoList: { flex: 1, marginTop: 10 },
  videoCard: { width: ITEM_SIZE, height: ITEM_SIZE * 1.5, margin: 5, backgroundColor: '#111', borderRadius: 5, overflow: 'hidden' },
  video: { width: '100%', height: '100%' },
  videoOverlayViews: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  viewCountText: { color: '#fff', fontSize: 10, marginLeft: 4, fontWeight: 'bold' },
  videoTitleRow: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.1)' },
  videoItemTitle: { color: '#fff', fontSize: 11, marginLeft: 4, fontWeight: '500', width: width / 3 - 45 },

  bottomSection: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#000', borderTopWidth: 0.5, borderTopColor: '#1c1c1c', paddingBottom: Platform.OS === 'ios' ? 25 : 10, paddingTop: 8, zIndex: 99 },
  bottomNavContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', width: '100%', height: 115 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plusBtn: { backgroundColor: '#FFD700', width: 48, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  plusText: { fontSize: 24, fontWeight: 'bold', color: '#000', marginTop: -3 },

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

  premiumCard: { marginTop: 20, backgroundColor: '#181818', borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderWidth: 1, borderColor: '#2c2c2c', shadowColor: '#FFD700', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 10 },
  premiumItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  premiumSmallText: { color: '#888', fontSize: 11 },
  premiumTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  premiumDivider: { width: 1, height: 34, backgroundColor: '#333' },
  shareButton: { backgroundColor: '#3d3200', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12, flexDirection: 'row', alignItems: 'center', marginHorizontal: 10 },
  shareText: { color: '#FFD700', fontWeight: 'bold', marginLeft: 6 },
  memberRow: { flexDirection: 'row', marginTop: 6 },
  angelWrap: { width: 28, height: 28 },
  angelImg: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#181818' },
  angelBadge: { position: 'absolute', right: -5, bottom: -5, minWidth: 14, height: 14, paddingHorizontal: 2, borderRadius: 7, borderWidth: 1.5, borderColor: '#181818', justifyContent: 'center', alignItems: 'center' },
  angelBadgeText: { fontSize: 9, fontWeight: '900', lineHeight: 11 },
});
