import React, { useState, useEffect, useRef } from 'react';
import {
View,
Text,
StyleSheet,
SafeAreaView,
StatusBar,
ScrollView,
TouchableOpacity,
Dimensions,
Platform,
ActivityIndicator,
Image,
BackHandler
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';



import BottomNav from "../components/BottomNav";



let db;

try {
const firebaseModule = require('./firebaseConfig');
db = firebaseModule.db;
} catch (e) {
try {
const firebaseModuleFallback = require('../firebaseConfig');
db = firebaseModuleFallback.db;
} catch (err) {
console.log("Firebase config file not found.");
}
}

import {
collection,
onSnapshot,
doc,
updateDoc,
arrayUnion
} from 'firebase/firestore';

const { width } = Dimensions.get('window');

// FALLBACKS
const STABLE_DEFAULT_BANNER = 'https://picsum.photos/seed/livecover/200/200';
const STABLE_DEFAULT_AVATAR = 'https://avatar.iran.liara.run/public/65';

// BANNERS
const TRENDING_BANNERS_DATA = [
require('../assets/images/banner1.jpeg'),
require('../assets/images/banner2.jpeg'),
require('../assets/images/banner3.jpeg'),
];

export default function AllLive() {

const router = useRouter();

const [activeTab, setActiveTab] = useState('audio');
const [liveStreams, setLiveStreams] = useState([]);
const [loading, setLoading] = useState(true);

const [imageErrors, setImageErrors] = useState({});

const [activeBannerIndex, setActiveBannerIndex] = useState(0);

const bannerScrollRef = useRef(null);

const bannerWidthOffset = width - 32;

// BACK
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

// ADD VIEWER
const addViewerToRoom = async (roomId) => {


try {

  const authModule = require('firebase/auth');

  const auth = authModule.getAuth();

  const user = auth.currentUser;

  if (!user) return;

  const roomRef = doc(db, 'rooms', roomId);

  await updateDoc(roomRef, {

    joinedUsers: arrayUnion({
      uid: user.uid,
      name: user.displayName || 'User',
      photo: user.photoURL || STABLE_DEFAULT_AVATAR,
      joinedAt: new Date().toISOString()
    })

  });

} catch (error) {

  console.log('Viewer Add Error:', error);

}


};

// FETCH LIVE ROOMS
useEffect(() => {


let unsubscribe = () => {};

if (!db) {

  setLiveStreams([]);
  setLoading(false);

  return;
}

try {

  const roomsRef = collection(db, 'rooms');

  unsubscribe = onSnapshot(
    roomsRef,
    (snapshot) => {

      const streams = [];


      snapshot.forEach((docItem) => {

        if (docItem.exists()) {

          const rawData = docItem.data();

          const currentStatus = rawData.status
            ? String(rawData.status).toLowerCase().trim()
            : '';



let roomTime = 0;

if (rawData.createdAt) {

  if (typeof rawData.createdAt === "number") {

    roomTime = rawData.createdAt;

  } else if (rawData.createdAt.seconds) {

    roomTime = rawData.createdAt.seconds * 1000;

  } else {

    roomTime = new Date(rawData.createdAt).getTime();

  }

}



          if (
            currentStatus === 'ended' ||
            currentStatus === 'inactive' ||
            currentStatus === 'closed'
          ) {
            return;
          }

const sevenDays = 1 * 24 * 60 * 60 * 1000;

if (Date.now() - roomTime > sevenDays) {
    return;
}


          if (
            rawData.status !== undefined &&
            rawData.status !== null &&
            currentStatus !== 'active'
          ) {
            return;
          }

// Sirf Public Rooms dikhao
if ((rawData.roomType || "public") !== "public") {
  return;
}

      

          const dbCover =
            rawData.roomCover ||
            rawData.cover ||
            rawData.banner ||
            rawData.roomImg;

          const dbHostImg =
            rawData.hostImg ||
            rawData.profileImg;

          const validatedBanner =
            (
              dbCover &&
              typeof dbCover === 'string' &&
              dbCover.trim().length > 10
            )
              ? dbCover.trim()
              : (
                (
                  dbHostImg &&
                  typeof dbHostImg === 'string' &&
                  dbHostImg.trim().length > 10
                )
                  ? dbHostImg.trim()
                  : STABLE_DEFAULT_BANNER
              );

          const validatedHostImg =
            (
              dbHostImg &&
              typeof dbHostImg === 'string' &&
              dbHostImg.trim().length > 10
            )
              ? dbHostImg.trim()
              : STABLE_DEFAULT_AVATAR;

          streams.push({

            id: docItem.id,

            roomId: docItem.id,

            title: rawData.title || 'Live Broadcast',

            host: rawData.hostName || rawData.host || 'User',

            type: String(rawData.type || 'audio').toLowerCase(),

         users: rawData.joinedUsers
  ? rawData.joinedUsers.length
  : 0,   

            category: rawData.category || 'LIVE',

            roomCover: validatedBanner,

            hostImg: validatedHostImg,

            seats: rawData.seats || '6',

            createdAt: rawData.createdAt,

            joinedUsers: rawData.joinedUsers || [],

            hostId: rawData.hostId || ''
          });
        }
      });

      streams.sort((a, b) => {

        const timeA = a.createdAt
          ? (
              a.createdAt.seconds
                ? a.createdAt.seconds * 1000
                : new Date(a.createdAt).getTime()
            )
          : 0;

        const timeB = b.createdAt
          ? (
              b.createdAt.seconds
                ? b.createdAt.seconds * 1000
                : new Date(b.createdAt).getTime()
            )
          : 0;

        return timeB - timeA;
      });

      setLiveStreams(streams);

      setLoading(false);
    },

    (error) => {

      console.log('Firebase Sync Error:', error);

      setLiveStreams([]);

      setLoading(false);
    }
  );

} catch (err) {

  console.log('Firestore Connection Error:', err);

  setLiveStreams([]);

  setLoading(false);
}

return () => unsubscribe();


}, []);

// AUTO BANNER
useEffect(() => {


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


}, [activeBannerIndex]);

const handleBannerScrollEnd = (e) => {


const horizontalShift = e.nativeEvent.contentOffset.x;

const computedIndex = Math.round(
  horizontalShift / bannerWidthOffset
);

setActiveBannerIndex(computedIndex);


};

return (


<SafeAreaView style={styles.container}>

  <StatusBar
    backgroundColor="#08080a"
    barStyle="light-content"
    translucent={false}
  />

  {/* HEADER */}
  <View style={styles.headerBarContainer}>

    <View style={styles.logoWrapper}>
      <View>
        <Text style={styles.headerLogoText}>LIVES</Text>
        <Text style={styles.headerSubLogoText}>
          audio & video rooms
        </Text>
      </View>
    </View>

    <View style={styles.headerRightActions}>

      <TouchableOpacity
        style={styles.headerIconButton}
        activeOpacity={0.7}
      >
        <Ionicons
          name="search-outline"
          size={18}
          color="#ffffff"
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.headerIconButton}
        activeOpacity={0.7}
      >
        <Ionicons
          name="notifications-outline"
          size={18}
          color="#ffffff"
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.headerIconButton}
        activeOpacity={0.7}
      >
        <Ionicons
          name="options-outline"
          size={18}
          color="#ebd500"
        />
      </TouchableOpacity>

    </View>

  </View>

  <ScrollView
    contentContainerStyle={styles.scrollCanvasContainer}
    showsVerticalScrollIndicator={false}
  >

    {/* BANNER */}
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

          <View
            key={index}
            style={styles.pinkSliderBanner}
          >

            <Image
              source={bannerSource}
              style={styles.bannerImageMainElement}
              resizeMode="contain"
            />

          </View>

        ))}

      </ScrollView>

      {/* DOTS */}
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

    {/* TABS */}
    <View style={styles.yellowNavBarStrip}>

      <TouchableOpacity
        style={styles.navBarTabButton}
        activeOpacity={0.8}
        onPress={() => setActiveTab('audio')}
      >

        <Ionicons
          name="mic-outline"
          size={16}
          color={
            activeTab === 'audio'
              ? '#ebd500'
              : 'rgba(255,255,255,0.4)'
          }
          style={{ marginRight: 6 }}
        />

        <Text
          style={[
            styles.navBarTabText,
            activeTab === 'audio' &&
            styles.navBarTabTextActive
          ]}
        >
          Audio Live
        </Text>

        {
          activeTab === 'audio' &&
          <View style={styles.customActiveBar} />
        }

      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navBarTabButton}
        activeOpacity={0.8}
        onPress={() => setActiveTab('video')}
      >

        <Ionicons
          name="videocam-outline"
          size={16}
          color={
            activeTab === 'video'
              ? '#ebd500'
              : 'rgba(255,255,255,0.4)'
          }
          style={{ marginRight: 6 }}
        />

        <Text
          style={[
            styles.navBarTabText,
            activeTab === 'video' &&
            styles.navBarTabTextActive
          ]}
        >
          Video Live
        </Text>

        {
          activeTab === 'video' &&
          <View style={styles.customActiveBar} />
        }

      </TouchableOpacity>

    </View>

    {/* LIVE FEED */}
    <View style={styles.streamsFeedWrapper}>

      {
        loading
          ? (
            <View style={styles.loaderBox}>

              <ActivityIndicator
                size="small"
                color="#ebd500"
              />

              <Text style={styles.emptyFeedText}>
                Loading live rooms...
              </Text>

            </View>
          )
          : (
            (() => {

              const filteredStreams =
                liveStreams.filter(
                  stream =>
                    stream &&
                    stream.type === activeTab
                );

              if (filteredStreams.length === 0) {

                return (

                  <View style={styles.emptyBox}>

                    <Ionicons
                      name={
                        activeTab === 'audio'
                          ? "mic-off-outline"
                          : "videocam-off-outline"
                      }
                      size={46}
                      color="rgba(255,255,255,0.1)"
                    />

                    <Text style={styles.emptyFeedText}>
                      No active {activeTab} rooms live right now
                    </Text>

                  </View>
            

    );
             
     }


     return (
<View style={styles.gridContainer}>

{filteredStreams.map((stream) => (

<TouchableOpacity
key={stream.id}
style={styles.liveCard}
activeOpacity={0.9}
onPress={() => {

addViewerToRoom(stream.id);

router.push({
  pathname: '/LiveRoom',
  params: {
    id: stream.id,
    from: "alllive"
  }
});

}}
>

<Image
source={{ uri: stream.roomCover }}
style={styles.cardImage}
/>

<View style={styles.viewerBox}>
<Ionicons name="eye-outline" size={16} color="#999" />

<Text style={styles.viewerText}>
  {stream.users}
</Text>

</View>

<Ionicons
name="mic"
size={50}
color="#1200ff"
style={styles.micIcon}
/>

<View style={styles.bottomUser}>

<Image
source={{ uri: stream.hostImg }}
style={styles.profilePic}
/>

<Text style={styles.hostName}>
{stream.host}
</Text>

</View>

</TouchableOpacity>

))}

</View>
);



})()
)
}
       


    </View>

                 
         
  </ScrollView>



      {/* Bottom Navigation */}
 <BottomNav />




</SafeAreaView>


);
}

const styles = StyleSheet.create({

container: {
flex: 1,
backgroundColor: '#08080a'
},

headerBarContainer: {
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'space-between',
paddingHorizontal: 16,
height: Platform.OS === 'android' ? 85 : 75,
paddingTop: Platform.OS === 'android' ? 20 : 15,
backgroundColor: '#08080a',
borderBottomWidth: 1,
borderColor: 'rgba(255,255,255,0.04)'
},

logoWrapper: {
flexDirection: 'row',
alignItems: 'center'
},

headerLogoText: {
fontSize: 20,
fontWeight: '900',
color: '#ebd500',
letterSpacing: 1
},

headerSubLogoText: {
fontSize: 11,
fontWeight: '500',
color: 'rgba(255,255,255,0.4)',
marginTop: -2
},

headerRightActions: {
flexDirection: 'row',
alignItems: 'center'
},

headerIconButton: {
marginLeft: 8,
backgroundColor: 'rgba(255,255,255,0.03)',
width: 38,
height: 38,
borderRadius: 12,
justifyContent: 'center',
alignItems: 'center',
borderWidth: 1,
borderColor: 'rgba(255,255,255,0.03)'
},

scrollCanvasContainer: {
paddingBottom: 40
},

pinkSliderBannerContainer: {
width: width - 32,
height: (width - 32) * (884 / 1774),
alignSelf: 'center',
marginTop: 16,
position: 'relative',
backgroundColor: '#0d0e14',
borderRadius: 20,
overflow: 'hidden'
},

pinkSliderBanner: {
width: width - 32,
height: '100%',
justifyContent: 'center',
alignItems: 'center',
overflow: 'hidden'
},

bannerImageMainElement: {
width: '100%',
height: '100%',
alignSelf: 'center'
},

sliderDotIndicatorRow: {
flexDirection: 'row',
alignItems: 'center',
position: 'absolute',
bottom: 12,
alignSelf: 'center',
zIndex: 10,
backgroundColor: 'rgba(0, 0, 0, 0.5)',
paddingHorizontal: 10,
paddingVertical: 4,
borderRadius: 12
},

sliderDotMesh: {
width: 6,
height: 6,
borderRadius: 3,
backgroundColor: 'rgba(255,255,255,0.4)',
marginHorizontal: 4
},

activeDot: {
width: 14,
backgroundColor: '#ebd500',
borderRadius: 3
},

yellowNavBarStrip: {
width: width - 32,
height: 50,
backgroundColor: '#12131a',
marginTop: 22,
flexDirection: 'row',
alignItems: 'center',
paddingHorizontal: 6,
alignSelf: 'center',
borderRadius: 14,
borderWidth: 1,
borderColor: 'rgba(255,255,255,0.03)'
},

navBarTabButton: {
flex: 1,
height: 40,
justifyContent: 'center',
alignItems: 'center',
flexDirection: 'row',
position: 'relative'
},

navBarTabText: {
fontSize: 14,
fontWeight: '700',
color: 'rgba(255,255,255,0.4)'
},

navBarTabTextActive: {
color: '#ffffff',
fontWeight: '800'
},

customActiveBar: {
position: 'absolute',
bottom: -4,
width: '40%',
height: 3,
backgroundColor: '#ebd500',
borderRadius: 2
},

streamsFeedWrapper: {
width: '100%',
paddingHorizontal: 16,
marginTop: 20
},

streamFeedCard: {
width: '100%',
backgroundColor: '#11121a',
borderRadius: 18,
padding: 12,
flexDirection: 'row',
alignItems: 'center',
marginBottom: 14
},

cardInternalPinkBlock: {
width: 76,
height: 76,
backgroundColor: '#1a1b24',
borderRadius: 14,
overflow: 'hidden',
justifyContent: 'center',
alignItems: 'center',
position: 'relative'
},

bannerImageElement: {
width: '100%',
height: '100%'
},

cardSeatsIndicator: {
position: 'absolute',
bottom: 4,
backgroundColor: 'rgba(0,0,0,0.6)',
paddingHorizontal: 6,
paddingVertical: 2,
borderRadius: 6
},

cardSeatsTextLabel: {
color: 'rgba(255,255,255,0.8)',
fontSize: 8,
fontWeight: '700'
},

cardRightInfoDeck: {
flex: 1,
marginLeft: 14,
paddingRight: 4
},

cardRowTopMeta: {
flexDirection: 'row',
justifyContent: 'space-between',
alignItems: 'center',
marginBottom: 6
},

categoryPillText: {
fontSize: 9,
fontWeight: '800',
color: 'rgba(255,255,255,0.3)',
textTransform: 'uppercase',
letterSpacing: 0.5
},

cardStatsBadgeRow: {
flexDirection: 'row',
alignItems: 'center',
backgroundColor: 'rgba(235, 213, 0, 0.08)',
paddingVertical: 3,
paddingHorizontal: 8,
borderRadius: 8
},

cardStatsText: {
fontSize: 11,
color: '#ebd500',
fontWeight: '800'
},

cardStreamTitle: {
fontSize: 15,
fontWeight: '700',
color: '#ffffff',
marginBottom: 6,
letterSpacing: 0.2
},

hostProfileSubRow: {
flexDirection: 'row',
alignItems: 'center'
},



avatarLetterCircle: {
width: 20,
height: 20,
borderRadius: 10,
backgroundColor: 'rgba(255,255,255,0.05)',
justifyContent: 'center',
alignItems: 'center',
marginRight: 6
},

cardHostLabel: {
fontSize: 12,
color: 'rgba(255,255,255,0.4)',
fontWeight: '600'
},

entryActionNode: {
width: 28,
height: 28,
borderRadius: 14,
backgroundColor: 'rgba(255,255,255,0.02)',
justifyContent: 'center',
alignItems: 'center'
},

loaderBox: {
alignItems: 'center',
justifyContent: 'center',
paddingVertical: 50
},

emptyBox: {
alignItems: 'center',
justifyContent: 'center',
paddingVertical: 60
},

emptyFeedText: {
color: 'rgba(255,255,255,0.35)',
fontSize: 13,
marginTop: 12,
fontWeight: '600',
textAlign: 'center'
},

gridContainer:{
flexDirection:'row',
flexWrap:'wrap',
justifyContent:'space-between'
},

liveCard:{
width:'48%',
height:200,
backgroundColor:'#111',
borderRadius:12,
overflow:'hidden',
borderWidth:3,
borderColor:'#ffd400',
marginBottom:15
},

cardImage:{
width:'100%',
height:'100%'
},

viewerBox:{
position:'absolute',
top:10,
left:10,
backgroundColor:'#fff',
paddingHorizontal:4,
paddingVertical:0,
borderRadius:10,
flexDirection:'row',
alignItems:'center'
},

viewerText:{
color:'#999',
fontSize:15,
marginLeft:5
},

micIcon:{
position:'absolute',
right:10,
top:10
},

bottomUser:{
position:'absolute',
bottom:15,
left:10,
flexDirection:'row',
alignItems:'center'
},

profilePic:{
width:30,
height:30,
borderRadius:25,
borderWidth:2,
borderColor:'#fff'
},

hostName:{
color:'#fff',
fontSize:18,
fontWeight:'bold',
marginLeft:10
}



});          
