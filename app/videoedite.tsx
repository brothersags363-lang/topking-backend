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
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
   Animated,
} from 'react-native';

import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import {
  VideoView,
  useVideoPlayer,
  createVideoPlayer,
} from 'expo-video';

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



const { height, width } = Dimensions.get('screen');

const auth = getAuth();

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


const VideoPlayerItem = React.memo(({
  uri,
  active
}) => {

  const player = useVideoPlayer(uri, (player) => {

    player.loop = true;

    player.bufferOptions = {
    preferredForwardBufferDuration: 10
  };

  });


  useEffect(() => {

  if (active) {

    player.muted = false;

    player.currentTime = 0;

    player.play();

  } else {

    player.pause();

    player.muted = true;

  }

}, [active]);

  return (

    <VideoView
player={player}
style={styles.video}
contentFit="cover"
nativeControls={false}
allowsFullscreen={false}
allowsPictureInPicture={false}
    />

  );

});

export default function App() {



const router = useRouter();

const { videos, index, userId } =
  useLocalSearchParams();

const videoData = videos
  ? JSON.parse(videos)
  : [];


const flatListRef = useRef(null);
const preloadRef = useRef(null);
const inputRef = useRef(null);
const viewabilityConfig = useRef({
  itemVisiblePercentThreshold: 80,
});



useEffect(() => {

  console.log("VIDEOS =", videoData);

  if (
    flatListRef.current &&
    Number(index) >= 0
  ) {

    setActiveVideo(Number(index));

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



useFocusEffect(
  React.useCallback(() => {

    const onBackPress = () => {

      if (showComments) {
        setShowComments(false);
        return true;
      }

      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)/profile");
      }

      return true;
    };

    const subscription =
      BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );

    return () => subscription.remove();

  }, [showComments])
);





const [selectedVideoId, setSelectedVideoId] =
  useState(null);

  const [selectedVideoData, setSelectedVideoData] =
  useState(null);

const [comments, setComments] =
  useState([]);

const [commentText, setCommentText] =
  useState('');

// ===========================
// REPLY STATES
// ===========================

const [replyCommentId, setReplyCommentId] =
  useState(null);

const [replyText, setReplyText] =
  useState("");

const [replies, setReplies] =
  useState({});

const keyboardHeight =
  useRef(
    new Animated.Value(0)
  ).current;

const [showReplies, setShowReplies] =
  useState({});

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




useEffect(() => {

  const show = Keyboard.addListener(
    "keyboardDidShow",
    (e) => {

      Animated.timing(
        keyboardHeight,
        {
          toValue:
            e.endCoordinates.height,
          duration: 250,
          useNativeDriver: false,
        }
      ).start();

    }
  );

  const hide = Keyboard.addListener(
    "keyboardDidHide",
    () => {

      Animated.timing(
        keyboardHeight,
        {
          toValue: 0,
          duration: 250,
          useNativeDriver: false,
        }
      ).start();

    }
  );

  return () => {

    show.remove();

    hide.remove();

  };

}, []);




useEffect(() => {

  if (!selectedVideoId) return;

  const unsubscribers = [];

  comments.forEach((comment) => {

    const q = query(

      collection(
        db,
        "all_videos",
        selectedVideoId,
        "comments",
        comment.id,
        "replies"
      ),

      orderBy("createdAt", "asc")

    );

    const unsubscribe = onSnapshot(

      q,

      (snapshot) => {

        const arr = [];

        snapshot.forEach((doc) => {

          arr.push({

            id: doc.id,

            ...doc.data(),

          });

        });

        setReplies((prev) => ({

          ...prev,

          [comment.id]: arr,

        }));

      }

    );

    unsubscribers.push(unsubscribe);

  });

  return () => {

    unsubscribers.forEach((unsubscribe) => {

      unsubscribe();

    });

  };

}, [comments, selectedVideoId]);


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

const nextIndex =
  viewableItems[0].index + 1;

if (videoData[nextIndex]) {

  preloadRef.current?.release();

  preloadRef.current =
    createVideoPlayer(
      videoData[nextIndex].videoUrl ||
      videoData[nextIndex].video
    );

}


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
    Keyboard.dismiss();

  } catch (error) {

    console.log(error);

  }
};



// ===========================
// POST REPLY
// ===========================

const postReply = async () => {

  const user = auth.currentUser;

  if (!user) {
    Alert.alert("Login Required");
    return;
  }

  if (!replyText.trim()) {
    return;
  }

  try {

    await addDoc(

      collection(
        db,
        "all_videos",
        selectedVideoId,
        "comments",
        replyCommentId,
        "replies"
      ),

      {

        text: replyText.trim(),

        username: currentUserData.username,

        profilePic: currentUserData.profileImg,

        userId: user.uid,

        createdAt: serverTimestamp(),

      }

    );

    setReplyText("");

    setReplyCommentId(null);

    Keyboard.dismiss();

  } catch (error) {

    console.log(error);

  }

};



const deleteComment = async (commentId) => {

  Alert.alert(
    "Delete Comment",
    "Do you want to delete this comment?",
    [
      {
        text: "Cancel",
        style: "cancel",
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
                selectedVideoId,
                "comments",
                commentId
              )
            );

            await updateDoc(
              doc(
                db,
                "all_videos",
                selectedVideoId
              ),
              {
                commentsCount: increment(-1),
              }
            );

          } catch (error) {

            console.log(error);

            Alert.alert(
              "Error",
              "Comment delete failed"
            );
          }
        },
      },
    ]
  );
};



  const renderVideo = ({ item, index }) => (

    <View style={styles.videoContainer}>



 <VideoPlayerItem
  key={item.id}
  uri={item.videoUrl || item.video}
  active={
    screenFocused &&
    index === activeVideo
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

  setTimeout(() => {

    inputRef.current?.focus();

  }, 300);

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

  


<View
  style={{
    flexDirection: "row",
    alignItems: "center",
  }}
>

<Text style={styles.username}>
  @{item.username}
</Text>

{item.verified === true && (

<View
  style={{
    marginLeft: 5,
    width: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  }}
>

<MaterialCommunityIcons
  name="check-decagram"
  size={18}
  color="#fff"
/>

<Ionicons
  name="checkmark"
  size={10}
  color="#000"
  style={{
    position: "absolute",
    top: 4.6,
    left: 4.2,
  }}
/>

</View>

)}




</View>


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
 
</View>

      {/* Scrollable Video List */}
      <FlatList
       ref={flatListRef}
        data={videoData}
        renderItem={renderVideo}
onViewableItemsChanged={
  onViewableItemsChanged
}

viewabilityConfig={viewabilityConfig.current}

snapToInterval={height - 81.2}

decelerationRate="fast"

disableIntervalMomentum={true}

 keyExtractor={(item, i) =>
  item.id + i
}
        pagingEnabled


extraData={activeVideo}

snapToAlignment="start"

showsVerticalScrollIndicator={false}



        windowSize={3}

initialNumToRender={3}

maxToRenderPerBatch={3}

updateCellsBatchingPeriod={50}

removeClippedSubviews={true}

getItemLayout={(data, index) => ({
  length: height - 81.2,
  offset: (height - 81.2) * index,
  index,
})}

      
      />



{
showComments && (

<View
  style={{
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: height * 0.65,
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



<View
  style={{
    flexDirection: "row",
    alignItems: "center",
  }}
>


<Text
  style={{
    color: "#fff",
    fontWeight: "bold",
  }}
>
  @{selectedVideoData.username}
</Text>

{selectedVideoData?.verified === true && (

<View
  style={{
    marginLeft: 5,
    width: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  }}
>

<MaterialCommunityIcons
  name="check-decagram"
  size={18}
  color="#fff"
/>

<Ionicons
  name="checkmark"
  size={10}
  color="#000"
  style={{
    position: "absolute",
    top: 4.5,
    left: 4.2,
  }}
/>

</View>

)}


<View
  style={[
    styles.levelBadge,
    {
      backgroundColor: getLevelTheme(selectedVideoData.level).bg,
      borderColor: getLevelTheme(selectedVideoData.level).border,
    },
  ]}
>

<MaterialCommunityIcons
  name="diamond-stone"
  size={11}
  color={getLevelTheme(selectedVideoData.level).icon}
/>

<Text
  style={{
    color: getLevelTheme(selectedVideoData.level).text,
    fontWeight: "bold",
    fontSize: 10,
    marginLeft: 3,
  }}
>
  LV {selectedVideoData.level || 1}
</Text>

</View>

</View>



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

  style={{
    flex: 1,
  }}
  contentContainerStyle={{
    paddingBottom: 100,
  }}
  showsVerticalScrollIndicator={false}
  keyboardShouldPersistTaps="handled"

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



 <View
  style={{
    flexDirection: "row",
    alignItems: "center",
  }}
>


<Text
  style={{
    color:"#FFD700",
    fontWeight:"bold",
  }}
>
  {item.username}
</Text>

{item.verified === true && (

<View
  style={{
    marginLeft:5,
    width:16,
    height:16,
    justifyContent:"center",
    alignItems:"center",
    position:"relative",
  }}
>

<MaterialCommunityIcons
  name="check-decagram"
  size={16}
  color="#fff"
/>

<Ionicons
  name="checkmark"
  size={9}
  color="#000"
  style={{
    position:"absolute",
    top:4,
    left:3.8,
  }}
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
  size={11}
  color={getLevelTheme(item.level).icon}
/>

<Text
  style={{
    color: getLevelTheme(item.level).text,
    fontWeight: "bold",
    fontSize: 10,
    marginLeft: 3,
  }}
>
  LV {item.level || 1}
</Text>

</View>

</View>




      <Text
        style={{
          color: '#fff'
        }}
      >
        {item.text}
      </Text>

<TouchableOpacity
  onPress={() => {

  setReplyCommentId(item.id);

  setReplyText("");

  setTimeout(() => {
    inputRef.current?.focus();
  }, 100);

}}
>

  <Text
    style={{
      color: "#999",
      fontSize: 13,
      marginTop: 6,
      fontWeight: "600",
    }}
  >
    Reply
  </Text>

</TouchableOpacity>

{
  replies[item.id]?.length > 0 && (

    <TouchableOpacity
      onPress={() => {

        setShowReplies(prev => ({

          ...prev,

          [item.id]: !prev[item.id],

        }));

      }}
    >

      <Text
        style={{
          color: "#999",
          fontSize: 13,
          marginTop: 6,
          fontWeight: "600",
        }}
      >

        {
          showReplies[item.id]

            ? "Hide replies"

            : `View ${replies[item.id].length} replies`

        }

      </Text>

    </TouchableOpacity>

  )
}


{
  showReplies[item.id] &&

  replies[item.id]?.map((reply) => (

    <View
      key={reply.id}
      style={{
        flexDirection: "row",
        marginTop: 12,
        marginLeft: 35,
      }}
    >

      <Image
        source={{
          uri:
            reply.profilePic ||
            "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
        }}
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
        }}
      />

      <View
        style={{
          marginLeft: 8,
          flex: 1,
        }}
      >

        <Text
          style={{
            color: "#FFD700",
            fontWeight: "bold",
            fontSize: 13,
          }}
        >
          {reply.username}
        </Text>

        <Text
          style={{
            color: "#fff",
            marginTop: 2,
          }}
        >
          {reply.text}
        </Text>

      </View>



<TouchableOpacity
  onPress={() => {

    Alert.alert(
      "Delete Reply",
      "Do you want to delete this reply?",
      [
        {
          text: "Cancel",
          style: "cancel",
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
                  selectedVideoId,
                  "comments",
                  item.id,
                  "replies",
                  reply.id
                )
              );

            } catch (e) {

              console.log(e);

            }

          },
        },
      ]
    );

  }}
>

<Ionicons
  name="ellipsis-vertical"
  size={20}
  color="#fff"
/>

</TouchableOpacity>



    </View>

  ))
}


      </View>

  <TouchableOpacity
    onPress={() =>
      deleteComment(item.id)
    }
    style={{
      padding: 8,
    }}
  >
    <Ionicons
      name="ellipsis-vertical"
      size={22}
      color="#fff"
    />
  </TouchableOpacity>


    </View>



  )}
/>


<Animated.View
style={{

position:"absolute",

left:10,
right:10,

bottom:35,

transform:[
{
translateY:
Animated.multiply(
keyboardHeight,
-1
)
}
],

flexDirection:"row",

alignItems:"center",

backgroundColor:"#111",

paddingHorizontal:12,

paddingVertical:8,

borderRadius:30,

zIndex:99999,

elevation:99999,

}}
>


<TextInput

ref={inputRef}

  value={
    replyCommentId
      ? replyText
      : commentText
  }

  onChangeText={
    replyCommentId
      ? setReplyText
      : setCommentText
  }

  placeholder={
    replyCommentId
      ? "Write a reply..."
      : "Add comment..."
  }

  placeholderTextColor="#999"

  returnKeyType="send"

  blurOnSubmit={true}

  onSubmitEditing={() => {

    if (replyCommentId) {

      postReply();

    } else {

      postComment();

    }

    Keyboard.dismiss();

  }}

  style={{
    flex: 1,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 20,
    paddingHorizontal: 15,
  }}
/>


<TouchableOpacity
  onPress={() => {

    if (replyCommentId) {

      postReply();

    } else {

      postComment();

    }

  }}
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
</Animated.View>
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

    router.back();

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
  header: { height: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', paddingTop: 20 },
  headerText: { color: 'white', fontWeight: 'bold' },
  videoContainer: { height: height - 80, width: width }, // Header & Comment height minus


  video: { width: '100%', height: '92.5%' },

sideBar: {
  position: 'absolute',

  right: 10,

  bottom: 80,   // video ke niche se kitna upar

  alignItems: 'center',

  zIndex: 999,

},

  sideText: { color: 'white', fontSize: 24, marginBottom: 10 },

bottomInfo: {
  position: 'absolute',

  left: 12,

  bottom: 70,      // niche se kitna upar

  width: width * 0.7,

  zIndex: 999,
},

  username: { color: 'white', fontWeight: 'bold' },
  caption: { color: 'white' },

commentBox: {
  height: 90,
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
  marginBottom: 13,
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

levelBadge: {
  marginLeft: 6,
  flexDirection: "row",
  alignItems: "center",
  borderWidth: 1,
  paddingHorizontal: 8,
  paddingVertical: 3,
  borderRadius: 20,
},


});