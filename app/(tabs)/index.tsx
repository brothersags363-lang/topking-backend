// ==========================
// IMPORTS
// ==========================
import React, { useRef, useState, useEffect, useCallback } from 'react';

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  FlatList,
  Image,
  StatusBar,
  ActivityIndicator,
  Share,
  Alert,
  TextInput,
  BackHandler,
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
  addDoc
} from 'firebase/firestore';

import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname, useFocusEffect } from 'expo-router';

// ==========================
// FIREBASE
// ==========================
import { db } from '../firebaseConfig';

import { getAuth, onAuthStateChanged } from 'firebase/auth';



const { width, height } = Dimensions.get('window');
const auth = getAuth(); 
function FeedVideo({ uri, active }) {

  console.log("VIDEO URI =", uri);

  const player = useVideoPlayer(uri, (player) => {
    player.loop = true;
  });

  

  useEffect(() => {
    if (active) {
      player.play();
    } else {
      player.pause();
    }
  }, [active, player]);

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
}


export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();

  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState(0);
  const [isFocused, setIsFocused] = useState(true);
  const [localLikes, setLocalLikes] = useState({}); 
  const [heartVideoId, setHeartVideoId] = useState(null);
const lastTap = useRef(null);

  const [showComments, setShowComments] = useState(false);
const [selectedVideoId, setSelectedVideoId] = useState(null);
const [commentText, setCommentText] = useState('');
const [comments, setComments] = useState([]);
const [currentUserData, setCurrentUserData] = useState({
  
  name: 'User',
  photo: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
});
  
const [selectedVideoData, setSelectedVideoData] = useState(null);

const [showStarPopup, setShowStarPopup] = useState(false);
const [selectedStar, setSelectedStar] = useState(null);


  // AUDIO SETUP


  // FETCH VIDEOS
  useEffect(() => {
    const q = query(
      collection(db, 'all_videos'), 
      orderBy('engagementScore', 'desc'), 
      orderBy('createdAt', 'desc'),
      limit(30) 
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedVideos = [];
      snapshot.forEach((docItem) => {
        loadedVideos.push({ id: docItem.id, ...docItem.data() });
      });
      setVideos(loadedVideos);
      setLoading(false);
    }, (error) => {
      console.log('Firebase Error:', error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);




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
          });
        }
      } catch (error) {
        console.log(error);
      }
    }
  });

  return () => unsubscribeAuth();
}, []);

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
}, [showComments, showStarPopup]);


  useEffect(() => {
  if (!selectedVideoId) return;

  const q = query(
    collection(db, 'all_videos', selectedVideoId, 'comments'),
    orderBy('createdAt', 'desc')
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    setComments(data);
  });

  return () => unsubscribe();
}, [selectedVideoId]);

  // INTERACTIONS
  const handleLike = async (videoId) => {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Login Required", "Please login to like this video.", [
        { text: "Cancel" },
        { text: "Login", onPress: () => router.push('/login') }
      ]);
      return;
    }
    const userId = user.uid;
    const likeRef = doc(db, 'all_videos', videoId, 'likes', userId);
    const videoRef = doc(db, 'all_videos', videoId);
    try {
      const docSnap = await getDoc(likeRef);
      if (docSnap.exists()) {
        await deleteDoc(likeRef);
        await updateDoc(videoRef, { likes: increment(-1), engagementScore: increment(-5) });
        setLocalLikes(prev => ({ ...prev, [videoId]: false }));
      } else {
        await setDoc(likeRef, { userId: userId, createdAt: serverTimestamp() });
        await updateDoc(videoRef, { likes: increment(1), engagementScore: increment(5) });
        setLocalLikes(prev => ({ ...prev, [videoId]: true }));
      }
    } catch (e) { console.log("Like Error", e); }
  };



const handleDoubleTapLike = async (videoId) => {

  await handleLike(videoId);

  setHeartVideoId(videoId);

  setTimeout(() => {
    setHeartVideoId(null);
  }, 800);

};



  const handleShare = async (videoUrl, videoId) => {



    try {
      const result = await Share.share({ 
        message: `Check out this amazing video on Star App! ${videoUrl || ''}`,
      });
      if (result.action === Share.sharedAction) {
        await updateDoc(doc(db, 'all_videos', videoId), { shares: increment(1), engagementScore: increment(10) });
      }
    } catch (e) { console.log("Share Error", e); }
  };

  const trackView = async (videoId) => {
    try {
      await updateDoc(doc(db, 'all_videos', videoId), { views: increment(1), engagementScore: increment(2) });
    } catch (error) {}
  };



const postComment = async () => {

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

  try {
    await addDoc(
      collection(
        db,
        'all_videos',
        selectedVideoId,
        'comments'
      ),
      {
        text: commentText,
        username: currentUserData.name,
profilePic: currentUserData.photo,
        userId: user.uid,
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

    setCommentText('');
  } catch (error) {
    console.log('Comment Error:', error);
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
      setActiveVideo(index);
      if (viewableItems[0].item) {
        trackView(viewableItems[0].item.id);
      }
    }
  }).current;

  const viewConfigRef = useRef({ 
    viewAreaCoveragePercentThreshold: 50, 
    minimumViewTime: 0 
  });

  const getIconColor = (path) => pathname === path ? '#3498db' : '#ffffff';

  const renderItem = ({ item, index }) => {
  return (
  <TouchableOpacity
    activeOpacity={1}
    style={{ width, height: height, backgroundColor: '#000' }}
    onPress={() => {

      const now = Date.now();

    if (lastTap.current && (now - lastTap.current) < 300) {

  handleDoubleTapLike(item.id);

}

      lastTap.current = now;

    }}
  >

 <FeedVideo
  uri={item.videoUrl || item.video}
  active={isFocused && activeVideo === index}
/>


{
  heartVideoId === item.id && (

    <View style={styles.heartPopup}>

      <Ionicons
        name="heart"
        size={140}
        color="rgba(255,255,255,0.9)"
      />

    </View>

  )
}




        <View style={styles.overlay} />

        <View style={styles.bottomLeft}>
          <Text style={styles.userName}>{item.username || '@user'}</Text>
          <Text style={styles.caption}>{item.caption}</Text>
          
          <View style={styles.musicRow}>
            <Ionicons name="musical-notes" size={18} color="#fff" />
            <Text style={styles.musicText} numberOfLines={1}>
              {item.songName || 'Original Audio - ' + (item.username || 'user')}
            </Text>
          </View>
        </View>

        <View style={styles.rightIcons}>
        
<TouchableOpacity
  style={styles.iconBox}
  onPress={() =>
    router.push({
      pathname: '/userProfile',
      params: {
        userId: item.userId,
      },
    })
  }
>
  <Image
    source={{
      uri:
        item.profile ||
        'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
    }}
    style={styles.profileImage}
  />
  <View style={styles.plusIconSmall}>
    <Ionicons name="add" size={12} color="#fff" />
  </View>
</TouchableOpacity>


          <TouchableOpacity style={styles.iconBox} onPress={() => handleLike(item.id)}>
            <Ionicons name="heart" size={40} color={localLikes[item.id] ? "red" : "white"} />
            <Text style={styles.iconText}>{item.likes || 0}</Text>
          </TouchableOpacity>

          

            <TouchableOpacity
  style={styles.iconBox}
  onPress={() => {
  setSelectedVideoId(item.id);

  setSelectedVideoData({
    username: item.username,
    profile: item.profile,
    caption: item.caption,
    userId: item.userId,
  });

  setShowComments(true);
}}
>       

            <Ionicons name="chatbubble" size={35} color="#ffffff" />
            <Text style={styles.iconText}>{item.commentsCount || 0}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBox} onPress={() => handleShare(item.videoUrl, item.id)}>
            <Ionicons name="arrow-redo" size={38} color="#FFD700" />
            <Text style={styles.iconText}>{item.shares || 0}</Text>
          </TouchableOpacity>

          <View style={styles.iconBox}>
            <Ionicons name="eye" size={30} color="#ffffff" />
            <Text style={styles.iconText}>{item.views || 0}</Text>
          </View>

          {/* STAR LOGIC WITH TEXT BELOW */}
          <TouchableOpacity
  style={styles.iconBox}
  onPress={() => {
    setSelectedVideoId(item.id);
    setShowStarPopup(true);
  }}
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
  };

  if (loading) return <View style={styles.loadingBox}><ActivityIndicator size="large" color="#f1c40f" /></View>;

  return (
    <View style={styles.fullScreenOverlay}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      
      <FlatList
        data={videos}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        pagingEnabled
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewConfigRef.current}
        windowSize={3} 
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        removeClippedSubviews={true}
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

  

      {/* INTEGRATED: UNIFIED BOTTOM NAVBAR FROM MESSAGES.JS */}

{
showStarPopup && (

<View style={styles.starPopupContainer}>

<View style={styles.starPopup}>

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


  onPress={() => {

    console.log(
      "Video:",
      selectedVideoId,
      "Stars:",
      selectedStar
    );

    setShowStarPopup(false);
  }}
>

<Text style={styles.starSubmitText}>
StarUp
</Text>

</TouchableOpacity>

</View>

</View>

)
}




{showComments && (
  <View style={styles.commentsSheet}>
    
   

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

    <View style={{ marginLeft: 10, flex: 1 }}>
      <Text
        style={{
          color: '#fff',
          fontWeight: 'bold',
          fontSize: 15,
        }}
      >
        @{selectedVideoData.username}
      </Text>

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

<FlatList
  data={comments}
  keyExtractor={(item) => item.id}
  style={{ marginTop: 20 }}
  renderItem={({ item }) => (
    <View
      style={{
        flexDirection: 'row',
        paddingHorizontal: 15,
        marginBottom: 15,
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



      <View
        style={{
          marginLeft: 10,
          flex: 1,
        }}
      >
        <Text
          style={{
            color: '#fff',
            fontWeight: 'bold',
          }}
        >
          {item.username}
        </Text>

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
      </View>
    </View>
  )}
/>


<View style={styles.commentInputContainer}>
 

<Image
  source={{ uri: currentUserData.photo }}
  style={styles.commentProfile}
/>


 <TextInput
  value={commentText}
  onChangeText={setCommentText}
 placeholder={`Comment as ${currentUserData.name}...`}
  placeholderTextColor="#999"
  style={styles.commentInput}
/>

 <TouchableOpacity onPress={postComment}>
  <Ionicons
    name="send"
    size={24}
    color="#FFD700"
  />
</TouchableOpacity>

</View>

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
  video: { width, height: height, position: 'absolute' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.1)' },
  bottomLeft: { position: 'absolute', left: 15, bottom: 35, width: width * 0.7 },
  userName: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 2 },
  caption: { color: '#ffffff', fontSize: 14, marginTop: 5, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 1 },
  musicRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  musicText: { color: '#fff', marginLeft: 8, fontSize: 13, maxWidth: width * 0.5 },
  rightIcons: { position: 'absolute', right: -10, bottom: 40, alignItems: 'center' },
  iconBox: { marginBottom: 8, alignItems: 'center' },
  iconText: { color: '#ffffff', fontWeight: 'bold', marginTop: 4, fontSize: 12 },
  profileImage: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: '#ffffff' },
  plusIconSmall: { position: 'absolute', bottom: -5, backgroundColor: '#e74c3c', borderRadius: 10, width: 18, height: 18, justifyContent: 'center', alignItems: 'center' },
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
  commentsSheet: {
  position: 'absolute',
  bottom: 0,
  width: '100%',
  height: height * 0.6,
  backgroundColor: '#000',
  borderTopLeftRadius: 25,
  borderTopRightRadius: 25,
  zIndex: 999,
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
  height: 260,

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
  marginTop: 10,
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



});