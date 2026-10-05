import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,  
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Dimensions,
  Platform,
  FlatList,
  Image,
  ActivityIndicator,
  BackHandler,
  RefreshControl,
  Animated,
  Easing,
  Keyboard,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import {
  Ionicons,
  MaterialCommunityIcons,
} from '@expo/vector-icons';

// FIREBASE IMPORT
import { db } from '../firebaseConfig';
import { auth } from '../firebaseConfig';

import ReAnimated from "react-native-reanimated";


import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
  doc,
  getDoc
} from 'firebase/firestore';



const { width } = Dimensions.get('window');


const getLevelTheme = (level = 1) => {

  if (level >= 50) {
    return {
      bg: "#7B1FFF",
      border: "#FFD700",
      text: "#fff",
      icon: "#FFD700",
    };
  }

  if (level >= 40) {
    return {
      bg: "#00BFFF",
      border: "#9EF8FF",
      text: "#fff",
      icon: "#fff",
    };
  }

  if (level >= 30) {
    return {
      bg: "#FF0066",
      border: "#FFB6C1",
      text: "#fff",
      icon: "#fff",
    };
  }

  if (level >= 20) {
    return {
      bg: "#FFC107",
      border: "#FFE082",
      text: "#000",
      icon: "#fff",
    };
  }

  if (level >= 10) {
    return {
      bg: "#BDBDBD",
      border: "#fff",
      text: "#fff",
      icon: "#fff",
    };
  }

  return {
    bg: "#222",
    border: "#555",
    text: "#FFD700",
    icon: "#00E5FF",
  };
};


const getLevelFrame = (level = 1) => {
  if (level >= 50) {
    return require("../../assets/frames/lv50.png");
  }

  if (level >= 40) {
    return require("../../assets/frames/lv40.png");
  }

  if (level >= 30) {
    return require("../../assets/frames/lv30.png");
  }

  if (level >= 20) {
    return require("../../assets/frames/lv20.png");
  }

  if (level >= 10) {
    return require("../../assets/frames/lv10.png");
  }

  return null;
};

// FIXED: CORRECT PROJECT ROOT PATH FOR ASSETS
const TRENDING_BANNERS_DATA = [
  require('../../assets/images/banner1.jpeg'),
  require('../../assets/images/banner2.jpeg'),
  require('../../assets/images/banner3.jpeg'),
];

export default function ExplorePage() {
  
  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // SEARCH TABS: Accounts | Videos
  const [activeTab, setActiveTab] = useState<'accounts' | 'videos'>('accounts');
  const [videoResults, setVideoResults] = useState<any[]>([]);
  const tabAnim = useRef(new Animated.Value(0)).current; // 0 = accounts, 1 = videos
  const resultsFade = useRef(new Animated.Value(0)).current;
  const recentVideosCache = useRef<any[] | null>(null);
  const searchReqId = useRef(0);
  const [tabBarWidth, setTabBarWidth] = useState(width - 32);
  const [profileImg, setProfileImg] = useState('');
  const [giftKings, setGiftKings] = useState([]);
const [topVideos, setTopVideos] = useState([]);
const [refreshing, setRefreshing] = useState(false);
  // SLIDER STATES & REFS
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const bannerScrollRef = useRef(null);
  const bannerWidthOffset = width - 32;
 

  // FIXED: SECURE MOBILE HARDWARE BACK BUTTON LOGIC


const getCurrentUserProfile = async () => {
  try {

    const user = auth.currentUser;

    if (!user) return;

    const userRef = doc(db, "users", user.uid);

    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      setProfileImg(
        userSnap.data().profileImg || ''
      );
    }

  } catch (error) {
    console.log(error);
  }
};


useEffect(() => {
  getCurrentUserProfile();
}, []);

useEffect(() => {
  loadTopVideos();
}, []);

useEffect(()=>{

loadGiftKing();

},[]);


  useEffect(() => {
    const handleBackButton = () => {
      // Search me kuch likha hai to pehle back par sirf search box clear ho
      if (searchQuery.length > 0) {
        clearSearch();
        return true;
      }

      try {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/'); 
        }
      } catch (error) {
        console.log("Navigation Error: ", error);
        router.replace('/'); 
      }
      return true;
    };

    const backHandlerSubscription = BackHandler.addEventListener(
      'hardwareBackPress', 
      handleBackButton
    );

    return () => {
      backHandlerSubscription.remove();
    };
  }, [router, searchQuery]);

  // AUTOMATED AUTO-SCROLL SLIDER LOGIC
  useEffect(() => {
    if (searchQuery.length > 0) return;
    const bannerTimer = setInterval(() => {
      let nextBannerIndex = activeBannerIndex + 1;
     if (nextBannerIndex >= TRENDING_BANNERS_DATA.length) {
      nextBannerIndex = 0;
      }
    bannerScrollRef.current?.scrollTo({

        x: nextBannerIndex * bannerWidthOffset,
        animated: true,
      });
      setActiveBannerIndex(nextBannerIndex);
    }, 3000);

    return () => clearInterval(bannerTimer);
  }, [activeBannerIndex, searchQuery]);

  const handleBannerScrollEnd = (e: any) => {
    const horizontalShift = e.nativeEvent.contentOffset.x;
    const computedIndex = Math.round(horizontalShift / bannerWidthOffset);
    setActiveBannerIndex(computedIndex);
  };




const loadTopVideos = async () => {

  try {

    // Was: getDocs(collection(db,"all_videos")) - this downloaded
    // EVERY video in the whole app just to sort client-side and show
    // a horizontal strip of the top ones. That's the main reason this
    // screen felt slow to open. Doing the ordering + limit in the
    // query itself means Firestore only ever sends back the videos we
    // actually show.
    const q = query(
      collection(db, "all_videos"),
      orderBy("views", "desc"),
      limit(20)
    );

    const snap = await getDocs(q);

    const arr = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    setTopVideos(arr);

  } catch(e){
    console.log(e);
  }

};



const loadGiftKing = async () => {
  try {

    // Was: getDocs(collection(db, "wallets")) then a "users" read for
    // EVERY single wallet in the app, only to keep the top 10 at the
    // end. That's an extra Firestore read per user in the whole app,
    // every time this screen opens. Ordering + limiting in the query
    // means only the 10 wallets we actually show get the extra
    // "users" lookup.
    const q = query(
      collection(db, "wallets"),
      orderBy("receivedStars", "desc"),
      limit(10)
    );

    const walletSnap = await getDocs(q);

    const users = await Promise.all(

      walletSnap.docs.map(async (walletDoc) => {

        const wallet = walletDoc.data();

        const userSnap = await getDoc(
          doc(db, "users", walletDoc.id)
        );

        if (!userSnap.exists()) return null;

        return {
          id: walletDoc.id,
          gifts: wallet.receivedStars || 0,
          level: wallet.level || 1,
          ...userSnap.data(),
        };

      })

    );

    const result = users
      .filter(Boolean)
      .sort((a, b) => b.gifts - a.gifts);

    setGiftKings(result);

  } catch (e) {
    console.log(e);
  }
};


const onRefresh = async () => {
  try {
    setRefreshing(true);
    recentVideosCache.current = null;

    await Promise.all([
      loadTopVideos(),
      loadGiftKing(),
      getCurrentUserProfile(),
    ]);

    console.log("REFRESH DONE");
  } catch (e) {
    console.log(e);
  } finally {
    setRefreshing(false);
  }
};


  // Search Logic - debounced so typing doesn't fire a Firestore query
  // on every single keystroke (that was the main reason search felt
  // laggy while typing).
  const searchDebounceRef = useRef(null);

  // "@love" / "#love" / " Love " -> "love"
  const cleanTerm = (t: string) => t.trim().replace(/^[@#]+/, '').toLowerCase();

  // ACCOUNTS: username (lowercase) + display name prefix match
  const searchAccounts = async (text: string) => {
    const term = cleanTerm(text);
    if (!term) return [];
    const cap = term.charAt(0).toUpperCase() + term.slice(1);

    const mk = (field: string, value: string) =>
      getDocs(
        query(
          collection(db, "users"),
          where(field, ">=", value),
          where(field, "<=", value + '\uf8ff'),
          limit(15)
        )
      ).catch(() => null);

    const snaps = await Promise.all([
      mk("username", term),
      mk("name", term),
      mk("name", cap),
    ]);

    const map = new Map<string, any>();
    snaps.forEach((snap) => {
      snap?.docs.forEach((d) => {
        if (!map.has(d.id)) map.set(d.id, { id: d.id, ...d.data() });
      });
    });

    const users = await Promise.all(
      Array.from(map.values())
        .slice(0, 20)
        .map(async (u) => {
          let level = 1;
          try {
            const walletSnap = await getDoc(doc(db, "wallets", u.id));
            if (walletSnap.exists()) level = walletSnap.data().level || 1;
          } catch (e) {}
          return { ...u, level };
        })
    );

    // exact / starts-with username pehle
    users.sort((a: any, b: any) => {
      const au = String(a.username || '').toLowerCase();
      const bu = String(b.username || '').toLowerCase();
      const ae = au === term ? 0 : au.startsWith(term) ? 1 : 2;
      const be = bu === term ? 0 : bu.startsWith(term) ? 1 : 2;
      return ae - be;
    });

    return users;
  };

  // VIDEOS: hashtag match (#love) + caption / username / song contains "love"
  // Firestore me "contains" search nahi hota, isliye latest 200 videos ek baar
  // cache karke wahi filter karte hain (typing par dobara read nahi hota).
  const searchVideos = async (text: string) => {
    const term = cleanTerm(text);
    if (!term) return [];

    const tagQuery = getDocs(
      query(
        collection(db, "all_videos"),
        where("hashtags", "array-contains", "#" + term),
        limit(40)
      )
    ).catch(() => null);

    if (!recentVideosCache.current) {
      try {
        const snap = await getDocs(
          query(collection(db, "all_videos"), orderBy("createdAt", "desc"), limit(200))
        );
        recentVideosCache.current = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.log("Video cache error:", e);
        recentVideosCache.current = [];
      }
    }

    const tagSnap = await tagQuery;
    const myUid = auth.currentUser?.uid;
    const map = new Map<string, any>();

    tagSnap?.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));

    recentVideosCache.current.forEach((v: any) => {
      const hay = [
        v.caption,
        Array.isArray(v.hashtags) ? v.hashtags.join(' ') : '',
        v.username,
        v.userName,
        v.songName,
        v.musicName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (hay.includes(term)) map.set(v.id, v);
    });

    return Array.from(map.values())
      .filter((v: any) => v.privacy !== 'private' || v.userId === myUid)
      .sort((a: any, b: any) => (b.views || 0) - (a.views || 0));
  };

  const runSearch = async (text: string) => {
    const reqId = ++searchReqId.current;
    try {
      const [users, vids] = await Promise.all([
        searchAccounts(text),
        searchVideos(text),
      ]);
      if (reqId !== searchReqId.current) return; // purana result ignore
      setSearchResults(users);
      setVideoResults(vids);
    } catch (error) {
      console.error("Search Error:", error);
    } finally {
      if (reqId === searchReqId.current) setLoading(false);
    }
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (text.trim().length === 0) {
      searchReqId.current++;
      setLoading(false);
      setSearchResults([]);
      setVideoResults([]);
      return;
    }

    setLoading(true);

    searchDebounceRef.current = setTimeout(() => {
      runSearch(text);
    }, 350);
  };

  // Search box + results saaf karo (mobile back button se bhi yahi chalta hai)
  const clearSearch = () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchReqId.current++;
    Keyboard.dismiss();
    setSearchQuery('');
    setLoading(false);
    setSearchResults([]);
    setVideoResults([]);
    setActiveTab('accounts');
    tabAnim.setValue(0);
  };

  // Tab change: indicator + pages smooth slide
  const switchTab = (tab: 'accounts' | 'videos') => {
    setActiveTab(tab);
    Animated.timing(tabAnim, {
      toValue: tab === 'accounts' ? 0 : 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  // Search result area pehli baar aaye to halka fade-in
  useEffect(() => {
    Animated.timing(resultsFade, {
      toValue: searchQuery.length > 0 ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [searchQuery.length > 0]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  // Dynamic Navigation Icon Color Handler matching messages.js style
  const getIconColor = (path: string) => {
    return pathname === path ? '#3498db' : '#fff';
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* SEARCH HEADER */}
     <View style={styles.header}>

  {/* Profile Image Left Side */}

  <TouchableOpacity
    style={styles.profileButton}
    onPress={() => router.push('/profile')}
  >
    <Image
      source={{
        uri:
          profileImg ||
          'https://avatar.iran.liara.run/public/65',
      }}
      style={styles.profileHeaderImage}
    />
  </TouchableOpacity>

  {/* Search Box */}

  <View style={styles.searchBarWrapper}>
    <Ionicons
      name="search-outline"
      size={18}
      color="rgba(255,255,255,0.4)"
      style={styles.searchIconFrame}
    />

    <TextInput
      style={styles.searchInput}
      placeholder="Search accounts or videos..."
      placeholderTextColor="rgba(255,255,255,0.3)"
      value={searchQuery}
      onChangeText={handleSearch}
      autoCapitalize="none"
    />

    {loading && (
      <ActivityIndicator
        size="small"
        color="#f1c40f"
        style={{ marginRight: 10 }}
      />
    )}
  </View>

</View>




      {/* SEARCH RESULTS: Accounts | Videos tabs */}
      {searchQuery.length > 0 ? (
        <Animated.View style={{ flex: 1, backgroundColor: '#08080a', opacity: resultsFade }}>

          {/* TAB BAR */}
          <View
            style={styles.tabBar}
            onLayout={(e) => setTabBarWidth(e.nativeEvent.layout.width)}
          >
            <TouchableOpacity style={styles.tabBtn} activeOpacity={0.7} onPress={() => switchTab('accounts')}>
              <Ionicons
                name="person-outline"
                size={15}
                color={activeTab === 'accounts' ? '#FFD700' : 'rgba(255,255,255,0.45)'}
              />
              <Text style={[styles.tabText, activeTab === 'accounts' && styles.tabTextActive]}>
                Accounts{searchResults.length > 0 ? ` (${searchResults.length})` : ''}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.tabBtn} activeOpacity={0.7} onPress={() => switchTab('videos')}>
              <Ionicons
                name="play-circle-outline"
                size={16}
                color={activeTab === 'videos' ? '#FFD700' : 'rgba(255,255,255,0.45)'}
              />
              <Text style={[styles.tabText, activeTab === 'videos' && styles.tabTextActive]}>
                Videos{videoResults.length > 0 ? ` (${videoResults.length})` : ''}
              </Text>
            </TouchableOpacity>

            {/* sliding underline */}
            <Animated.View
              style={[
                styles.tabIndicator,
                {
                  width: tabBarWidth / 2,
                  transform: [
                    {
                      translateX: tabAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, tabBarWidth / 2],
                      }),
                    },
                  ],
                },
              ]}
            />
          </View>

          {/* PAGES (slide left/right) */}
          <View style={{ flex: 1, overflow: 'hidden' }}>
            <Animated.View
              style={{
                flex: 1,
                flexDirection: 'row',
                width: tabBarWidth * 2,
                transform: [
                  {
                    translateX: tabAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -tabBarWidth],
                    }),
                  },
                ],
              }}
            >
              {/* ACCOUNTS PAGE */}
              <View style={{ width: tabBarWidth }}>
                <FlatList
                  data={searchResults}
                  keyExtractor={(item: any) => item.id}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingTop: 10, paddingBottom: 120 }}
                  renderItem={({ item }: any) => (


<TouchableOpacity
  style={styles.userCard}
  onPress={() => {

    router.push({
      pathname: '/userProfile',
      params: {
        userId: item.id,
      },
    });
  }}
>




        <Image
          source={{
            uri:
              item.profileImg ||
              'https://avatar.iran.liara.run/public/65',
          }}
          style={styles.userAvatar}
        />

       <View style={styles.userTextInfo}>

<View
  style={{
    flexDirection: "row",
    alignItems: "center",
  }}
>

<Text style={styles.userName}>
  @{item.username}
</Text>

{item.verified && (
  <View style={styles.verifiedBadge}>
    <MaterialCommunityIcons
      name="check-decagram"
      size={16}
      color={
        item.verifiedColor === "yellow"
          ? "#FFD700"
          : "#f8fbff"
      }
    />
  </View>
)}

<View
  style={[
    styles.levelBadge,
    {
      backgroundColor: getLevelTheme(item.level).bg,
      borderColor: getLevelTheme(item.level).border,
    },
  ]}
>

<MaterialCommunityIcons
  name="diamond-stone"
  size={12}
  color={getLevelTheme(item.level).icon}
/>

<Text
  style={{
    color: getLevelTheme(item.level).text,
    fontSize: 11,
    fontWeight: "bold",
    marginLeft: 3,
  }}
>
  LV {item.level || 1}
</Text>

</View>

</View>

<Text style={styles.userSub}>
  {item.name || "User"}
</Text>

</View>

        <Ionicons
          name="chevron-forward"
          size={16}
          color="rgba(255,255,255,0.2)"
        />
      </TouchableOpacity>
                  )}
                  ListEmptyComponent={() =>
                    !loading ? (
                      <Text style={styles.emptyText}>No accounts found</Text>
                    ) : null
                  }
                />
              </View>

              {/* VIDEOS PAGE */}
              <View style={{ width: tabBarWidth }}>
                <FlatList
                  data={videoResults}
                  keyExtractor={(item: any) => item.id}
                  numColumns={3}
                  keyboardShouldPersistTaps="handled"
                  columnWrapperStyle={{ gap: 6 }}
                  contentContainerStyle={{ paddingTop: 10, paddingBottom: 120, gap: 6 }}
                  renderItem={({ item, index }: any) => (
                    <TouchableOpacity
                      style={styles.searchVideoCard}
                      activeOpacity={0.85}
                      onPress={() =>
                        router.push({
                          pathname: "/allvideo",
                          params: {
                            videoId: item.id,
                            videos: JSON.stringify(videoResults),
                            index: index,
                            from: "explore",
                          },
                        })
                      }
                    >
                      <Image
                        source={{ uri: item.thumbnail }}
                        style={styles.searchVideoImage}
                      />
                      <View style={styles.searchVideoShade} />
                      <View style={styles.searchVideoMeta}>
                        <Ionicons name="eye" size={11} color="#fff" />
                        <Text style={styles.searchVideoViews}>{item.views || 0}</Text>
                      </View>
                      {!!item.caption && (
                        <Text style={styles.searchVideoCaption} numberOfLines={1}>
                          {item.caption}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={() =>
                    !loading ? (
                      <Text style={styles.emptyText}>No videos found</Text>
                    ) : null
                  }
                />
              </View>
            </Animated.View>
          </View>
        </Animated.View>
) : (



        /* PREMIUM LOOK ORIGINAL EXPLORE CONTENT */
        <ScrollView
          style={{ backgroundColor: '#08080a' }}
          contentContainerStyle={{ paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={true}
           refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor="#FFD700"
      colors={["#FFD700"]}
    />
  }
        >
          {/* THEMATIC AUDIO MIC BANNER BOX INTEGRATED WITH SLIDING LOGIC */}
          <View style={styles.pinkSliderBannerContainer}>
            <ScrollView
              ref={bannerScrollRef}
              horizontal
              pagingEnabled
              snapToInterval={bannerWidthOffset}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleBannerScrollEnd}
              style={{ width: '100%', height: '100%' }}
            >
              {TRENDING_BANNERS_DATA.map((bannerSource, index) => (
                <View key={index} style={styles.pinkSliderBanner}>
                  <Image 
                    source={bannerSource}
                    style={styles.bannerImageMainElement}
                    resizeMode="cover"
                  />
                </View>
              ))}
            </ScrollView>

            {/* DYNAMIC SYNC DOT INDICATORS BAR */}
            <View style={styles.sliderDotIndicatorRow}>
              {TRENDING_BANNERS_DATA.map((_, dotIndex) => (
                <View 
                  key={dotIndex} 
                  style={[
                    styles.sliderDotMesh, 
                    activeBannerIndex === dotIndex && styles.activeDot
                  ]} 
                />
              ))}
            </View>
          </View>

          {/* DYNAMIC SCROLLABLE PLATFORM ACCESS TOKENS ROW */}
          <ScrollView horizontal style={styles.trophyRow} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
            {[
              { label: 'Live', icon: 'mic-sharp', note: 'Go Live Now' },
              { label: 'Family Ranking', icon: 'trophy-sharp', note: 'Top Families' },
              { label: 'Agency', icon: 'people-sharp', note: 'Agency Ranking' },
              { label: 'Creator', icon: 'ribbon-sharp', note: 'For Creators' }
            ].map((t, i) => (

              <TouchableOpacity
  key={i}
  style={styles.trophyBox}
  activeOpacity={0.8}
  onPress={() => {

  if (t.label === "Live") {

    router.push("/all-live");

  }

  if (t.label === "Creator") {

    router.push("../top-followers");

  }


 if (t.label === "Agency") {

    router.push("../AgencyTop");

  }

}}
>

                <View style={styles.trophyIconContainer}>
               <Ionicons name={t.icon as any} size={22} color="#f1c40f" />
                </View>
                <Text style={styles.trophyBoxLabelText}>{t.label}</Text>
                <Text style={styles.trophyBoxSubLabelText}>{t.note}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* BRAND HEAD SECTIONS TRACKING */}

<View style={styles.sectionHead}>
  <View style={styles.sectionHeadingWrapper}>

    <Ionicons
      name="heart"
      size={18}
      color="#FFD700"
    />

    <Text style={styles.sectionTitle}>
      Top Video
    </Text>

  </View>

  <Text style={styles.viewsText}>
    {topVideos.length} Videos
  </Text>

</View>

<FlatList
  horizontal
  data={topVideos}
  keyExtractor={(item)=>item.id}
  showsHorizontalScrollIndicator={false}
  contentContainerStyle={{
    paddingHorizontal:12
  }}

  renderItem={({item})=>(

    <TouchableOpacity
      style={styles.topVideoCard}

      onPress={()=>

        router.push({

          pathname:"/allvideo",

params:{
  videoId: item.id,
  videos: JSON.stringify(topVideos),
  index: topVideos.findIndex(
    v => v.id === item.id
  ),
  from: "explore"
}


        })

      }

    >

      <Image
        source={{uri:item.thumbnail}}
        style={styles.topVideoImage}
      />

      <View style={styles.viewBox}>
        <Ionicons
          name="eye"
          size={12}
          color="#fff"
        />

        <Text style={styles.viewText}>
          {item.views||0}
        </Text>
      </View>

    </TouchableOpacity>

  )}
/>




          <View style={styles.sectionHead}>
            <View style={styles.sectionHeadingWrapper}>
              <Ionicons name="heart-sharp" size={16} color="#f1c40f" style={{ marginRight: 6 }} />
              

  <Text style={styles.sectionTitle}>
      Star Up Earning
    </Text>

  </View>



            
            <Text style={styles.viewsText}> Top 10 <Ionicons name="chevron-forward" size={13} color="#f1c40f" /></Text>
          </View>

          {/* DUAL STREAMERS POWER STATS ROW */}
         
<FlatList
  horizontal
  data={giftKings}
  keyExtractor={(item) => item.id}
  showsHorizontalScrollIndicator={false}
  contentContainerStyle={{ paddingHorizontal: 15 }}
  renderItem={({ item, index }) => (

    <TouchableOpacity
      style={styles.giftKingCard}
      onPress={() =>
        router.push({
          pathname: "/userProfile",
          params: {
            userId: item.id,
          },
        })
      }
    >

      {/* Rank */}

      <View style={styles.rankCircle}>
        <Text style={styles.rankText}>
          {index + 1}
        </Text>
      </View>

      {/* Profile */}

     <View
  style={{
    width: 90,
    height: 90,
    justifyContent: "center",
    alignItems: "center",
  }}
>
  <Image
    source={{
      uri:
        item.profileImg ||
        "https://avatar.iran.liara.run/public/65",
    }}
    style={styles.giftKingImage}
  />

  {getLevelFrame(item.level) && (
    <Image
      source={getLevelFrame(item.level)}
      style={{
        position: "absolute",
        width: 110,
        height: 110,
        top: -15,
      }}
      resizeMode="contain"
    />
  )}
</View>

      {/* Username */}

      <Text
        style={styles.giftKingName}
        numberOfLines={1}
      >
        @{item.username}
      </Text>

      {/* Level */}

      <View
        style={[
          styles.levelBadge,
          {
            backgroundColor: getLevelTheme(item.level).bg,
            borderColor: getLevelTheme(item.level).border,
          },
        ]}
      >
        <MaterialCommunityIcons
          name="diamond-stone"
          size={11}
          color={getLevelTheme(item.level).icon}
        />

        <Text
          style={{
            color: getLevelTheme(item.level).text,
            marginLeft: 3,
            fontSize: 10,
            fontWeight: "bold",
          }}
        >
          LV {item.level}
        </Text>
      </View>

      {/* Gifts */}

      <Text style={styles.giftKingGift}>
        🎁 {item.gifts}
      </Text>

    </TouchableOpacity>

  )}
/>


        </ScrollView>
      )}

      {/* RESTORED & ALIGNED BOTTOM NAVBAR FROM MESSAGES.JS */}
      <View style={styles.bottomSection}>
        <View style={styles.bottomNav}>
          
          {/* HOME */}
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/')}>
            <Ionicons name="home-outline" size={26} color={getIconColor('/')} />
          </TouchableOpacity>

          {/* SEARCH (ACTIVE ON THIS PAGE) */}
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/explore')}>
            <Ionicons name="search" size={26} color="#3498db" />
          </TouchableOpacity>

          {/* PLUS */}
          <TouchableOpacity style={styles.navItem} onPress={() => router.push('/camera')}>
            <View style={styles.plusBtn}>
              <Text style={styles.plusText}>+</Text>
            </View>
          </TouchableOpacity>

          {/* MESSAGE */}
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/messages')}>
            <Ionicons name="chatbubble-ellipses-outline" size={26} color={getIconColor('/messages')} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08080a' },
  header: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#08080a',
    marginTop: Platform.OS === 'ios' ? 45 : 30,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)'
  },
  
  // CHANGED: SEARCH BOX WRAPPER ME GOLDEN MESH PARAT (BORDER OVERLAY) CHADHA DIYA HAI
  searchBarWrapper: {
    flex: 1,
    height: 44,
    backgroundColor: '#11121a',
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderWidth: 1.5,                      // Thicker premium parat
    borderColor: 'rgba(241,196,15,0.25)'  // Perfectly matches the trophyBox theme color
  },
  
  searchIconFrame: { marginRight: 8 },
  searchInput: {
    flex: 1,
    height: '100%',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600'
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#08080a',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabText: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#FFD700' },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#FFD700',
  },
  searchVideoCard: {
    flex: 1 / 3,
    aspectRatio: 0.62,
    maxWidth: '33%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  searchVideoImage: { width: '100%', height: '100%' },
  searchVideoShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 46,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  searchVideoMeta: {
    position: 'absolute',
    left: 6,
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  searchVideoViews: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  searchVideoCaption: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 5,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#11121a',
    borderRadius: 16,
    marginBottom: 10,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.02)'
  },
  userAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 14, backgroundColor: '#1a1b24' },
  userTextInfo: { flex: 1 },
  userName: { color: '#ffffff', fontSize: 14, fontWeight: '700', letterSpacing: 0.1 },
  userSub: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2, fontWeight: '500' },
  emptyText: { color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 30, fontSize: 13, fontWeight: '500' },
  
  // SLIDER CONTAINMENT
  pinkSliderBannerContainer: {
    width: width - 32,
    height: 160, 
    alignSelf: 'center',
    marginTop: 16,
    position: 'relative',
    backgroundColor: '#11121a',
    borderRadius: 12,
    overflow: 'hidden'
  },
  pinkSliderBanner: { 
    width: width - 32, 
    height: '100%', 
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden', 
  },
  bannerImageMainElement: {
    width: '100%',
    height: '100%',
    alignSelf: 'center'
  },
  sliderDotIndicatorRow: { flexDirection: 'row', alignItems: 'center', position: 'absolute', bottom: 12, alignSelf: 'center', zIndex: 10, backgroundColor: 'rgba(0, 0, 0, 0.5)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }, 
  sliderDotMesh: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)', marginHorizontal: 4 },
  activeDot: { width: 12, backgroundColor: '#ebd500', borderRadius: 3 },
  
  trophyRow: { paddingVertical: 10 },

  // TROPHY BOX PREMIUM PARAT
  trophyBox: { 
    alignItems: 'center', 
    width: (width - 90) / 2.5, 
    height: 100,
    backgroundColor: '#11121a', 
    marginRight: 7, 
    padding: 14.5, 
    borderRadius: 20,       
    borderWidth: 1.3,
borderColor: "#FFD700",
  },

profileButton: {
  marginRight: 10,
},

profileHeaderImage: {
  width: 42,
  height: 42,
  borderRadius: 21,
  borderWidth: 2,
  borderColor: '#f1c40f',
},

  
  trophyIconContainer: { 
    width: 34, 
    height: 34, 
    borderRadius: 17, 
    backgroundColor: 'rgba(241,196,15,0.05)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 6,
    borderWidth: 2, 
    borderColor: 'rgba(255, 230, 0, 0.25)' 
  },
  
  trophyBoxLabelText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  trophyBoxSubLabelText: { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '600', marginTop: 2 },
  
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 4 },
  sectionHeadingWrapper: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { color: '#ffffff', fontWeight: '900', fontSize: 15, letterSpacing: 0.2 },
  viewsText: { color: '#f1c40f', fontSize: 12, fontWeight: '700', flexDirection: 'row', alignItems: 'center' },
  
  rankRow: { flexDirection: 'row', paddingHorizontal: 12, marginTop: 12 },
  rankCard: { flex: 1, backgroundColor: '#11121a', marginHorizontal: 4, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)' },
  rankTitle: { color: '#f1c40f', fontWeight: '800', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.04)', paddingBottom: 6, marginBottom: 10 },
  rankCardRowLine: { flexDirection: 'row', alignItems: 'center' },
  rankNumberBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(241,200,15,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  rankNumberText: { color: '#f1c40f', fontSize: 10, fontWeight: '900' },
  rankUserText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', flex: 1 },
  
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#000',
    paddingBottom: Platform.OS === 'ios' ? 40 : 25,
    paddingTop: 5,
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


verifiedBadge: {
  marginLeft: 6,
  justifyContent: "center",
  alignItems: "center",
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

topVideoCard:{
width:115,
height:165,
marginRight:10,
borderRadius:8,
overflow:"hidden",
backgroundColor:"#111",
},

topVideoImage:{
width:"100%",
height:"100%",
},

viewBox:{
position:"absolute",
top:138,
left:8,
flexDirection:"row",
alignItems:"center",
},

viewText:{
color:"#fff",
marginLeft:4,
fontWeight:"bold",
},




giftKingCard: {
  width: 140,
  backgroundColor: "#11121a",
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "#FFD700",
  marginRight: 12,
  padding: 12,
  alignItems: "center",
},

rankCircle: {
  width: 20,
  height: 20,
  borderRadius: 12,
  backgroundColor: "#FFD700",
  justifyContent: "center",
  alignItems: "center",
  marginBottom: 8,
},

rankText: {
  color: "#000",
  fontWeight: "bold",
  fontSize: 12,
},

giftKingImage: {
  width: 65,
  height: 65,
  borderRadius: 33,
  marginBottom: 8,
},

giftKingName: {
  color: "#fff",
  fontWeight: "bold",
  fontSize: 12,
},

giftKingGift: {
  color: "#FFD700",
  marginTop: 8,
  fontWeight: "bold",
},

});     
