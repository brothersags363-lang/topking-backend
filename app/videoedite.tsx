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
  Alert,
  Share,
  TextInput
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';

import { db } from './firebaseConfig';

import {
  doc,
  deleteDoc,
  updateDoc,
  increment,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore';


import {
  useLocalSearchParams,
  useRouter,
  useFocusEffect,
} from "expo-router";

import { getAuth } from "firebase/auth";

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





 const [activeVideo, setActiveVideo] =
  useState(Number(index) || 0);

  const [screenFocused, setScreenFocused] =
  useState(true);

const [localLikes, setLocalLikes] =
  useState({});

const [showComments, setShowComments] =
  useState(false);

useEffect(() => {

  const backAction = () => {

    console.log("BACK");
    console.log(showComments);

    if (showComments) {

      setShowComments(false);

      return true;
    }

    return false;
  };

  const backHandler =
    BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

  return () =>
    backHandler.remove();

}, [showComments]);



const [selectedVideoId, setSelectedVideoId] =
  useState(null);

  const [selectedVideoData, setSelectedVideoData] =
  useState(null);

const [comments, setComments] =
  useState([]);

const [commentText, setCommentText] =
  useState('');

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



const deleteVideo = async (videoId) => {

  Alert.alert(
    "Delete Video",
    "Kya aap ye video delete karna chahte hain?",
    [
      {
        text: "Cancel",
        style: "cancel"
      },
      {
        text: "Delete",
        style: "destructive",

        onPress: async () => {

          try {

            await deleteDoc(
              doc(
                db,
                "all_videos",
                videoId
              )
            );

           Alert.alert(
  "Success",
  "Video Deleted"
);

router.push("/(tabs)/profile");

          } catch (error) {

            Alert.alert(
              "Error",
              "Delete Failed"
            );

          }

        }
      }
    ]
  );

};




const handleLike = async (videoId) => {

  const user = auth.currentUser;

  if (!user) {
    Alert.alert(
      "Login Required"
    );
    return;
  }

  const likeRef = doc(
    db,
    "all_videos",
    videoId,
    "likes",
    user.uid
  );

  const videoRef = doc(
    db,
    "all_videos",
    videoId
  );

  try {

    const snap =
      await getDoc(likeRef);

    if (snap.exists()) {

      await deleteDoc(likeRef);

      await updateDoc(
        videoRef,
        {
          likes: increment(-1)
        }
      );

      setLocalLikes(prev => ({
        ...prev,
        [videoId]: false
      }));

    } else {

      await setDoc(
        likeRef,
        {
          userId: user.uid,
          createdAt:
            serverTimestamp()
        }
      );

      await updateDoc(
        videoRef,
        {
          likes: increment(1)
        }
      );

      setLocalLikes(prev => ({
        ...prev,
        [videoId]: true
      }));

    }

  } catch (error) {

    console.log(error);

  }
};



const handleShare = async (
  videoUrl,
  videoId
) => {

  try {

    const result =
      await Share.share({
        message: videoUrl
      });

    if (
      result.action ===
      Share.sharedAction
    ) {

      await updateDoc(
        doc(
          db,
          "all_videos",
          videoId
        ),
        {
          shares: increment(1)
        }
      );

    }

  } catch (error) {

    console.log(error);

  }

};

const trackView = async (
  videoId
) => {

  try {

    await updateDoc(
      doc(
        db,
        "all_videos",
        videoId
      ),
      {
        views: increment(1)
      }
    );

  } catch (error) {}

};



useEffect(() => {

  const fetchUser = async () => {

    const user = auth.currentUser;

    if (!user) return;

    try {

      const userSnap = await getDoc(
        doc(
          db,
          "users",
          user.uid
        )
      );

      if (userSnap.exists()) {

        const data = userSnap.data();

        setCurrentUserData({
          username:
            data.username || '',
          profileImg:
            data.profileImg || '',
        });

      }

    } catch (error) {

      console.log(error);

    }

  };

  fetchUser();

}, []);


useEffect(() => {

  if (!selectedVideoId) return;

  const unsubscribe = onSnapshot(
    query(
      collection(
        db,
        'all_videos',
        selectedVideoId,
        'comments'
      ),
      orderBy('createdAt', 'desc')
    ),
    (snapshot) => {

      const data = snapshot.docs.map(
        doc => ({
          id: doc.id,
          ...doc.data()
        })
      );

      setComments(data);

    }
  );

  return () => unsubscribe();

}, [selectedVideoId]);



const onViewableItemsChanged =
  useRef(
    ({ viewableItems }) => {

      if (
        viewableItems.length > 0
      ) {

        setActiveVideo(
          viewableItems[0].index
        );

        trackView(
          viewableItems[0]
            .item.id
        );

      }

    }
  ).current;


const postComment = async () => {

  const user = auth.currentUser;

  if (!user) {
    Alert.alert(
      "Login Required"
    );
    return;
  }

  if (!commentText.trim()) {
    return;
  }

  try {

    await addDoc(
      collection(
        db,
        "all_videos",
        selectedVideoId,
        "comments"
      ),
      
{
  text: commentText,

  username:
    currentUserData.username,

  profilePic:
    currentUserData.profileImg,

  userId:
    user.uid,

  createdAt:
    serverTimestamp(),
}
      
    );

    await updateDoc(
      doc(
        db,
        "all_videos",
        selectedVideoId
      ),
      {
        commentsCount:
          increment(1)
      }
    );

    setCommentText('');

  } catch (error) {

    console.log(error);

  }
};


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

  <Image
    source={{
      uri:
        item.profile ||
        'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
    }}
    style={styles.profileImage}
  />

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
        ? "red"
        : "#fff"
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

    setSelectedVideoData({
      username: item.username,
      profile: item.profile,
      caption: item.caption,
      userId: item.userId,
    });

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
      item.videoUrl ||
      item.video,
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
  onPress={() => {

    Alert.alert(
      "Video Options",
      "Select Option",
      [
        {
          text: "Delete Video",
          style: "destructive",
          onPress: () =>
            deleteVideo(item.id),
        },

        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );

  }}
>
  <Ionicons
    name="ellipsis-vertical"
    size={30}
    color="#fff"
  />
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
onViewableItemsChanged={
  onViewableItemsChanged
}

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
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: 400,
    backgroundColor: '#111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 9999,
  }}
>



{selectedVideoData && (

<View
  style={{
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  }}
>

<Image
  source={{
    uri:
      selectedVideoData.profile ||
      'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
  }}
  style={{
    width: 45,
    height: 45,
    borderRadius: 22,
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
  renderItem={({ item }) => (

    <View
  style={{
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  }}
>


<Image
  source={{
    uri:
      item.profilePic ||
      'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
  }}
  style={{
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  }}
/>

<View style={{ flex: 1 }}>



 <Text
  style={{
    color: '#FFD700',
    fontWeight: 'bold'
  }}
>
        {item.username}
      </Text>

      <Text
        style={{
          color: '#fff'
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
    flexDirection: 'row',
    padding: 10,
    marginBottom: 38,
  }}
>

<TextInput
  value={commentText}
  onChangeText={setCommentText}
  placeholder="Add comment..."
  placeholderTextColor="#999"
  style={{
    flex: 1,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 20,
    paddingHorizontal: 15,
  }}
/>

<TouchableOpacity
  onPress={postComment}
>
  <Text
    style={{
      color: '#FFD700',
      padding: 15
    }}
  >
    Send
  </Text>
</TouchableOpacity>

</View>

</View>

)
}




<TouchableOpacity
  style={styles.backButton}
  onPress={() => {

    if (showComments) {

      setShowComments(false);

      return;
    }

    router.push('/profile');

  }}
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
  sideBar: { position: 'absolute', right: 7, bottom: 30, alignItems: 'center' },
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

});