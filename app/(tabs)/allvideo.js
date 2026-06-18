import React, {
  useState,
  useRef,
  useEffect,
} from 'react';

import {
  StyleSheet,
  View,
  Dimensions,
  Text,
  FlatList,
  StatusBar,
  Image,
  BackHandler,
  TouchableOpacity,
  Share,
  Alert,
  TextInput
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';

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
  addDoc
} from 'firebase/firestore';

import { db } from '../firebaseConfig';

import {
  getAuth,
  onAuthStateChanged
} from 'firebase/auth';

import {
  useLocalSearchParams,
  useRouter,
  useFocusEffect,
} from "expo-router";

const { height, width } = Dimensions.get('window');
const auth = getAuth();


export default function App() {

const router = useRouter();

const { videos, index, userId } =
  useLocalSearchParams();

const videoData = videos
  ? JSON.parse(videos)
  : [];


const flatListRef = useRef(null);

useEffect(() => {

console.log("VIDEOS =", videoData);


  if (
    flatListRef.current &&
    Number(index) >= 0
  ) {
    setTimeout(() => {
      flatListRef.current.scrollToIndex({
        index: Number(index),
        animated: false,
      });
    }, 300);
  }
}, []);






useFocusEffect(
  React.useCallback(() => {

    setScreenFocused(true);

    setActiveVideo(Number(index) || 0);

    return () => {
      setScreenFocused(false);
    };

  }, [])
);


useEffect(() => {

  const unsubscribeAuth =
    onAuthStateChanged(
      auth,
      async (user) => {

        if (!user) return;

        const userRef = doc(
          db,
          'users',
          user.uid
        );

        const userSnap =
          await getDoc(userRef);

        if (userSnap.exists()) {

          const data =
            userSnap.data();

          setCurrentUserData({
            name:
              data.username ||
              'User',

            photo:
              data.profileImg ||
              'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
          });
        }

      }
    );

  return () =>
    unsubscribeAuth();

}, []);



const handleLike = async (videoId) => {

  const user = auth.currentUser;

  if (!user) {
    Alert.alert('Login Required');
    return;
  }

  const likeRef = doc(
    db,
    'all_videos',
    videoId,
    'likes',
    user.uid
  );

  const videoRef = doc(
    db,
    'all_videos',
    videoId
  );

  const snap = await getDoc(likeRef);

  if (snap.exists()) {

    await deleteDoc(likeRef);

    await updateDoc(videoRef, {
      likes: increment(-1)
    });

    setLocalLikes(prev => ({
      ...prev,
      [videoId]: false
    }));

  } else {

    await setDoc(likeRef, {
      userId: user.uid,
      createdAt: serverTimestamp()
    });

    await updateDoc(videoRef, {
      likes: increment(1)
    });

    setLocalLikes(prev => ({
      ...prev,
      [videoId]: true
    }));

  }
};



const handleShare =
  async (
    videoUrl,
    videoId
  ) => {

    try {

      const result =
        await Share.share({
          message:
            videoUrl,
        });

      if (
        result.action ===
        Share.sharedAction
      ) {

        await updateDoc(
          doc(
            db,
            'all_videos',
            videoId
          ),
          {
            shares:
              increment(1),
          }
        );
      }

    } catch (e) {
      console.log(e);
    }

};



const postComment =
  async () => {

    const user =
      auth.currentUser;

    if (!user) {
      Alert.alert(
        'Login Required'
      );
      return;
    }

    if (
      !commentText.trim()
    )
      return;

    await addDoc(
      collection(
        db,
        'all_videos',
        selectedVideoId,
        'comments'
      ),
      {
        text:
          commentText,

        username:
          currentUserData.name,

        profilePic:
          currentUserData.photo,

        userId:
          user.uid,

        createdAt:
          serverTimestamp(),
      }
    );

    await updateDoc(
      doc(
        db,
        'all_videos',
        selectedVideoId
      ),
      {
        commentsCount:
          increment(1),
      }
    );

    setCommentText('');

};




 const [activeVideo, setActiveVideo] =
  useState(Number(index) || 0);

  const [screenFocused, setScreenFocused] =
  useState(true);

const [localLikes, setLocalLikes] = useState({});

const [showComments, setShowComments] =
  useState(false);

const [selectedVideoId, setSelectedVideoId] =
  useState(null);

const [commentText, setCommentText] =
  useState('');

const [comments, setComments] =
  useState([]);

const [showStarPopup, setShowStarPopup] =
  useState(false);

const [selectedStar, setSelectedStar] =
  useState(null);


  useEffect(() => {

  const backAction = () => {

    if (showStarPopup) {

      setShowStarPopup(false);
      return true;

    }

    if (showComments) {

      setShowComments(false);
      return true;

    }

    router.push({
      pathname: '/userProfile',
      params: {
        userId,
      },
    });

    return true;
  };

  const backHandler =
    BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

  return () =>
    backHandler.remove();

}, [showComments, showStarPopup]);




const [selectedVideoData, setSelectedVideoData] =
  useState(null);

useEffect(() => {

  if (!selectedVideoId) return;

  const q = query(
    collection(
      db,
      'all_videos',
      selectedVideoId,
      'comments'
    ),
    orderBy(
      'createdAt',
      'desc'
    )
  );

  const unsubscribe =
    onSnapshot(
      q,
      (snapshot) => {

        const data =
          snapshot.docs.map(
            doc => ({
              id: doc.id,
              ...doc.data(),
            })
          );

        setComments(data);
      }
    );

  return () =>
    unsubscribe();

}, [selectedVideoId]);



const [currentUserData, setCurrentUserData] =
  useState({
    name: 'User',
    photo:
      'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
  });

console.log(
  "ACTIVE VIDEO =",
  activeVideo
);

console.log(
  "CURRENT INDEX =",
  index
);


  const renderVideo = ({ item, index }) => (

    <View style={styles.videoContainer}>
     <Video
  key={item.id}
        source={{
  uri:
    item.videoUrl ||
    item.video,
}}
        style={styles.video}
        resizeMode="cover"
        isLooping
        shouldPlay={
  screenFocused &&
  index === activeVideo
}
isMuted={
  index !== activeVideo
}

      />
      {/* Side Overlay (Like/Comment buttons placeholders) */}
      <View style={styles.sideBar}>

  <TouchableOpacity
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

</TouchableOpacity>

 <TouchableOpacity
  style={styles.iconBox}
  onPress={() =>
    handleLike(item.id)
  }
>

  <Ionicons
    name="heart"
    size={38}
    color={
      localLikes[item.id]
        ? 'red'
        : '#fff'
    }
  />

  <Text style={styles.iconText}>
    {item.likes || 0}
  </Text>

</TouchableOpacity>


  <TouchableOpacity
  style={styles.iconBox}
  onPress={() => {

    setSelectedVideoId(item.id);

    setSelectedVideoData(item);

    setShowComments(true);

  }}
>

  <Ionicons
    name="chatbubble"
    size={35}
    color="#fff"
  />

  <Text style={styles.iconText}>
    {item.commentsCount || 0}
  </Text>

</TouchableOpacity>


  <TouchableOpacity
  style={styles.iconBox}
  onPress={() =>
    handleShare(
      item.videoUrl,
      item.id
    )
  }
>
    <Ionicons
      name="arrow-redo"
      size={35}
      color="#FFD700"
    />
    <Text style={styles.iconText}>
      {item.shares || 0}
    </Text>
  </TouchableOpacity>

  <View style={styles.iconBox}>
    <Ionicons
      name="eye"
      size={35}
      color="#fff"
    />
    <Text style={styles.iconText}>
      {item.views || 0}
    </Text>
  </View>

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

<Text style={styles.starText}>
StarUp
</Text>

</TouchableOpacity>

</View>
      {/* Bottom Info */}
      <View style={styles.bottomInfo}>

  <Text style={styles.username}>
    @{item.username}
  </Text>

  <Text style={styles.caption}>
    {item.caption}
  </Text>

  <View style={styles.musicRow}>
    <Ionicons
      name="musical-notes"
      size={16}
      color="#fff"
    />

    <Text style={styles.musicText}>
      Original Audio - @{item.username}
    </Text>
  </View>

</View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Top Black Header */}
    
<View style={styles.header}>
  <Text style={styles.headerText}>
    TopKing | Video
  </Text>
</View>

      {/* Scrollable Video List */}
      <FlatList
       ref={flatListRef}
        data={videoData}
        renderItem={renderVideo}
 keyExtractor={(item, i) =>
  item.id + i
}
        pagingEnabled

getItemLayout={(data, index) => ({
  length: height - 81.2,
  offset: (height - 81.2) * index,
  index,
})}

       
      onViewableItemsChanged={({ viewableItems }) => {

  if (
    viewableItems.length > 0
  ) {
    setActiveVideo(
      viewableItems[0].index
    );
  }

}}
      />







{
showComments && (

<View
style={{
position:'absolute',
bottom:0,
width:'100%',
height:'50%',
backgroundColor:'#000',
borderTopLeftRadius:20,
borderTopRightRadius:20,
zIndex:999
}}
>

{
selectedVideoData && (

<View
style={{
flexDirection:'row',
alignItems:'center',
paddingHorizontal:15,
paddingTop:15,
paddingBottom:12,
borderBottomWidth:0.5,
borderBottomColor:'#333'
}}
>

<Image
source={{
uri:
selectedVideoData.profile ||
'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
}}
style={{
width:45,
height:45,
borderRadius:22
}}
/>

<View
style={{
marginLeft:10,
flex:1
}}
>

<Text
style={{
color:'#fff',
fontWeight:'bold'
}}
>
@{selectedVideoData.username}
</Text>

<Text
style={{
color:'#ccc',
marginTop:3
}}
numberOfLines={2}
>
{selectedVideoData.caption}
</Text>

</View>

</View>

)
}

<FlatList
data={comments}
style={{
marginTop:10
}}
keyExtractor={(item)=>item.id}
renderItem={({item})=>(

<View
style={{
flexDirection:'row',
padding:12
}}
>

<Image
source={{
uri:item.profilePic
}}
style={{
width:40,
height:40,
borderRadius:20
}}
/>

<View
style={{
marginLeft:10
}}
>

<Text
style={{
color:'#fff',
fontWeight:'bold'
}}
>
{item.username}
</Text>

<Text
style={{
color:'#fff'
}}
>
{item.text}
</Text>

</View>

</View>

)}
/>

<View
style={{
position:'absolute',
bottom:45,
left:10,
right:10,

flexDirection:'row',
alignItems:'center',

backgroundColor:'#111',

paddingHorizontal:12,
paddingVertical:8,

borderRadius:30
}}
>

<Image
source={{
  uri: currentUserData.photo
}}
style={{
  width:35,
  height:35,
  borderRadius:18,
  marginRight:10
}}
/>


<TextInput
value={commentText}
onChangeText={setCommentText}
placeholder="Comment..."
placeholderTextColor="#999"
style={{
flex:1,
color:'#fff'
}}
/>

<TouchableOpacity
onPress={postComment}
>

<Ionicons
name="send"
size={24}
color="#FFD700"
/>

</TouchableOpacity>

</View>

</View>

)
}



{
showStarPopup && (

<View
style={{
position:'absolute',
left:0,
right:0,
bottom:0,
top:0,

backgroundColor:'rgba(0,0,0,0.4)',

justifyContent:'flex-end',

zIndex:9999
}}
>

<View
style={{
height:260,
backgroundColor:'#111',

borderTopLeftRadius:25,
borderTopRightRadius:25,

paddingTop:20,
paddingHorizontal:20
}}
>

<View
style={{
flexDirection:'row',
justifyContent:'space-around'
}}
>

<TouchableOpacity
style={[
{
width:90,
height:100,
backgroundColor:'#222',
borderRadius:20,

justifyContent:'center',
alignItems:'center'
},
selectedStar===1 && {
borderWidth:3,
borderColor:'#FFD700'
}
]}
onPress={()=>setSelectedStar(1)}
>

<Image
source={require('../../assets/star-logo.png')}
style={{
width:90,
height:90,
resizeMode:'contain'
}}
/>

<Text
style={{
color:'#FFD700',
fontWeight:'bold',
marginTop:-20
}}
>
x1
</Text>

</TouchableOpacity>

<TouchableOpacity
style={[
{
width:90,
height:100,
backgroundColor:'#222',
borderRadius:20,

justifyContent:'center',
alignItems:'center'
},
selectedStar===3 && {
borderWidth:3,
borderColor:'#FFD700'
}
]}
onPress={()=>setSelectedStar(3)}
>

<Image
source={require('../../assets/star-logo.png')}
style={{
width:90,
height:90,
resizeMode:'contain'
}}
/>

<Text
style={{
color:'#FFD700',
fontWeight:'bold',
marginTop:-20
}}
>
x3
</Text>

</TouchableOpacity>

<TouchableOpacity
style={[
{
width:90,
height:100,
backgroundColor:'#222',
borderRadius:20,

justifyContent:'center',
alignItems:'center'
},
selectedStar===10 && {
borderWidth:3,
borderColor:'#FFD700'
}
]}
onPress={()=>setSelectedStar(10)}
>

<Image
source={require('../../assets/star-logo.png')}
style={{
width:90,
height:90,
resizeMode:'contain'
}}
/>

<Text
style={{
color:'#FFD700',
fontWeight:'bold',
marginTop:-20
}}
>
x10
</Text>

</TouchableOpacity>

</View>

<TouchableOpacity
style={{
backgroundColor:'#FFD700',
paddingVertical:14,
borderRadius:30,

marginTop:30,

alignSelf:'center',
width:180
}}
onPress={()=>{

console.log(
"Video:",
selectedVideoId,
"Stars:",
selectedStar
);

setShowStarPopup(false);

}}
>

<Text
style={{
color:'#000',
fontWeight:'bold',
textAlign:'center'
}}
>
StarUp
</Text>

</TouchableOpacity>

</View>

</View>

)
}


<TouchableOpacity
  style={styles.backButton}
  onPress={() =>
  router.push({
    pathname: '/userProfile',
    params: {
      userId,
    },
  })
}
>
  <Ionicons
    name="arrow-back"
    size={30}
    color="#fff"
  />
</TouchableOpacity>


      {/* Bottom Comment Box */}
      <View style={styles.commentBox}>

  <View style={styles.yellowCircle} />

  <Text style={styles.commentText}>
    Add comment...
  </Text>

</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  header: { height: 60, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', paddingTop: 20 },
  headerText: { color: 'white', fontWeight: 'bold' },
  videoContainer: { height: height - 81.2, width: width }, // Header & Comment height minus
  video: { width: '100%', height: '100%' },
  sideBar: { position: 'absolute', right: -7, bottom: 25, alignItems: 'center' },
  sideText: { color: 'white', fontSize: 24, marginBottom: 15 },
  bottomInfo: { position: 'absolute', left: 10, bottom: 20 },
  username: { color: 'white', fontWeight: 'bold' },
  caption: { color: 'white' },

commentBox: {
  height: 104.2,
  backgroundColor: '#111',
  justifyContent: 'center',
  paddingLeft: 20,
},

  commentText: { color: '#888',    marginBottom: 40,  paddingLeft: 20,    },
profileImage: {
  width: 50,
  height: 50,
  borderRadius: 30,
  borderWidth: 2,
  borderColor: '#fff',
  marginBottom: 15,
},

iconBox: {
  alignItems: 'center',
  marginBottom: 12,
},

iconText: {
  color: '#fff',
  fontWeight: 'bold',
  marginTop: 3,
},

musicRow: {
  flexDirection: 'row',
  alignItems: 'center',
  marginTop: 10,
  backgroundColor: 'rgba(255,255,255,0.15)',
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 10,
  alignSelf: 'flex-start',
},

musicText: {
  color: '#fff',
  marginLeft: 8,
},

starImage: {
  width: 85,
  height: 85,
  resizeMode: 'contain',
},

starText: {
  color: '#FFD700',
  fontWeight: 'bold',
  marginTop: -15,
},

backButton: {
  position: 'absolute',
  top: 70,
  left: 15,
  zIndex: 999,
},

yellowCircle: {
  width: 12,
  height: 12,
  borderRadius: 6,
  backgroundColor: '#FFD700',
  position: 'absolute',
  top: 15,
  left: 20,
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
},

popupStarImage: {
  width: 90,
  height: 90,
  resizeMode: 'contain',
},

starValue: {
  color: '#FFD700',
  fontWeight: 'bold',
  marginTop: -20,
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


});