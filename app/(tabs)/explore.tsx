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
  BackHandler
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
  const [profileImg, setProfileImg] = useState('');
  const [giftKings, setGiftKings] = useState([]);
const [topVideos, setTopVideos] = useState([]);
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
  }, [router]);

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

    const snap = await getDocs(
      collection(db,"all_videos")
    );

    const arr = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    arr.sort((a,b)=>(b.views||0)-(a.views||0));

    setTopVideos(arr);

  } catch(e){
    console.log(e);
  }

};



const loadGiftKing = async () => {
  try {

    const walletSnap = await getDocs(
      collection(db, "wallets")
    );

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
      .sort((a, b) => b.gifts - a.gifts)
      .slice(0, 10);

    setGiftKings(result);

  } catch (e) {
    console.log(e);
  }
};


  // Search Logic
  const handleSearch = async (text: string) => {
    setSearchQuery(text);
    if (text.trim().length > 0) {
      setLoading(true);
      try {
        const q = query(
          collection(db, "users"),
          where("username", ">=", text.toLowerCase()),
          where("username", "<=", text.toLowerCase() + '\uf8ff'),
          limit(10)
        );
        const querySnapshot = await getDocs(q);
       const users = await Promise.all(
  querySnapshot.docs.map(async (d) => {

    const data = d.data();

    const walletSnap = await getDoc(
      doc(db, "wallets", d.id)
    );

    return {
      id: d.id,
      ...data,
      level: walletSnap.exists()
        ? walletSnap.data().level || 1
        : 1,
    };
  })
);


console.log("SEARCH USERS =", users);

        setSearchResults(users);
      } catch (error) {
        console.error("Search Error:", error);
      } finally {
        setLoading(false);
      }
    } else {
      setSearchResults([]);
    }
  };

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
      placeholder="Search username..."
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




      {/* SEARCH RESULTS LIST */}
      {searchQuery.length > 0 ? (
  <FlatList
    data={searchResults}
    keyExtractor={(item: any) => item.id}
    style={{ backgroundColor: '#08080a' }}
    contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10 }}
    renderItem={({ item }: any) => (

<TouchableOpacity
  style={styles.userCard}
  onPress={() => {

    console.log("CLICK USER =", item);
    console.log("CLICK USER ID =", item.id);

  console.log(
    "SEARCH USER",
    item.username,
    item.id
  );

  console.log(
    "LOGGED USER",
    auth.currentUser?.uid
  );


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
      color="#f8fbff"
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
        <Text style={styles.emptyText}>
          No users found
        </Text>
      ) : null
    }
  />
) : (



        /* PREMIUM LOOK ORIGINAL EXPLORE CONTENT */
        <ScrollView
          style={{ backgroundColor: '#08080a' }}
          contentContainerStyle={{ paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
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
              { label: 'Meetup', icon: 'people-sharp', note: 'Join Events' },
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

            videoId:item.id,

            videos:JSON.stringify(topVideos),

            index:topVideos.findIndex(
              v=>v.id===item.id
            )

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
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#11121a',
    borderRadius: 16,
    marginBottom: 10,
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
    height: 180, 
    alignSelf: 'center',
    marginTop: 16,
    position: 'relative',
    backgroundColor: '#11121a',
    borderRadius: 24,
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
  activeDot: { width: 14, backgroundColor: '#ebd500', borderRadius: 3 },
  
  trophyRow: { paddingVertical: 18 },

  // TROPHY BOX PREMIUM PARAT
  trophyBox: { 
    alignItems: 'center', 
    width: (width - 48) / 2.2, 
    backgroundColor: '#11121a', 
    marginRight: 10, 
    padding: 14, 
    borderRadius: 24,       
    borderWidth: 1.5,       
    borderColor: 'rgba(241,196,15,0.15)' 
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
    width: 50, 
    height: 50, 
    borderRadius: 25, 
    backgroundColor: 'rgba(241,196,15,0.05)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 10,
    borderWidth: 1.5, 
    borderColor: 'rgba(241,196,15,0.25)' 
  },
  
  trophyBoxLabelText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  trophyBoxSubLabelText: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '600', marginTop: 2 },
  
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
width:120,
height:180,
marginRight:10,
borderRadius:10,
overflow:"hidden",
backgroundColor:"#111",
},

topVideoImage:{
width:"100%",
height:"100%",
},

viewBox:{
position:"absolute",
top:8,
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
  width: 150,
  backgroundColor: "#11121a",
  borderRadius: 18,
  borderWidth: 1,
  borderColor: "#FFD700",
  marginRight: 12,
  padding: 12,
  alignItems: "center",
},

rankCircle: {
  width: 28,
  height: 28,
  borderRadius: 14,
  backgroundColor: "#FFD700",
  justifyContent: "center",
  alignItems: "center",
  marginBottom: 8,
},

rankText: {
  color: "#000",
  fontWeight: "bold",
  fontSize: 14,
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
  fontSize: 14,
},

giftKingGift: {
  color: "#FFD700",
  marginTop: 8,
  fontWeight: "bold",
},

});     