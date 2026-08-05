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
  TextInput,
    Keyboard,
    Animated,
    ActivityIndicator,
      Easing,
} from 'react-native';

import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";

import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  increment,
  getDoc,
  getDocs,
  where,
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

const { height, width } = Dimensions.get('screen');



const auth = getAuth();




const VideoPlayerItem = React.memo(({ uri, active }) => {

  const player = useVideoPlayer(uri, (player) => {
    player.loop = true;
  });

  
useEffect(() => {

    if (!player) return;

    if (active) {

        player.muted = false;
        player.play();

    } else {

        player.pause();
        player.currentTime = 0;
        player.muted = true;

    }

}, [active, player]);


  return (

 <VideoView
player={player}
style={styles.video}
contentFit="cover"
nativeControls={false}
allowsFullscreen={false}
allowsPictureInPicture={false}
showsTimecodes={false}
/>

  );

}, (prev, next) => {
    return (
        prev.uri === next.uri &&
        prev.active === next.active
    );
});


export default function App() {

const router = useRouter();

const rotateAnim = useRef(
  new Animated.Value(0)
).current;

const textAnim = useRef(
  new Animated.Value(0)
).current;


const {
  videos,
  index,
  userId,
  from,
} = useLocalSearchParams();

const profileUserId = userId;


const [allVideos, setAllVideos] = useState(
  videos ? JSON.parse(videos) : []
);



const flatListRef = useRef(null);

const viewabilityConfig = {
    itemVisiblePercentThreshold: 70,
};

const onViewRef = useRef(({ viewableItems }) => {

  if (viewableItems.length > 0) {

    setActiveVideo(viewableItems[0].index);

  }

});



useEffect(() => {




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


useEffect(() => {

Animated.loop(

Animated.timing(

rotateAnim,

{
toValue:1,
duration:2200,
easing:Easing.linear,
useNativeDriver:true,
}

)

).start();

},[]);


useEffect(() => {

Animated.loop(

Animated.sequence([

Animated.timing(
textAnim,
{
toValue:-180,
duration:5000,
useNativeDriver:true,
}
),

Animated.timing(
textAnim,
{
toValue:0,
duration:0,
useNativeDriver:true,
}
),

])

).start();

},[]);

useEffect(() => {

  const show = Keyboard.addListener(
    "keyboardDidShow",
    (e) => {

      Animated.timing(keyboardHeight,{
        toValue:e.endCoordinates.height,
        duration:250,
        useNativeDriver:false,
      }).start();

    }
  );

  const hide = Keyboard.addListener(
    "keyboardDidHide",
    ()=>{

      Animated.timing(keyboardHeight,{
        toValue:0,
        duration:250,
        useNativeDriver:false,
      }).start();

    }
  );

  return ()=>{
    show.remove();
    hide.remove();
  };

},[]);

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

              verified: data.verified || false,

               verifiedColor:
    data.verifiedColor || "white",
          });
        }

      }
    );

  return () =>
    unsubscribeAuth();

}, []);



const handleLike = async (videoId) => {

  const user = auth.currentUser;

  if (!user) return;

  const liked = localLikes[videoId];

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

  // UI turant update
  setLocalLikes(prev => ({
    ...prev,
    [videoId]: !liked
  }));

  setAllVideos(prev =>
    prev.map(item =>
      item.id === videoId
        ? {
            ...item,
            likes: liked
              ? Math.max((item.likes || 0) - 1, 0)
              : (item.likes || 0) + 1,
          }
        : item
    )
  );

  try {

    if (liked) {

      await deleteDoc(likeRef);

      await updateDoc(videoRef, {
        likes: increment(-1),
      });

    } else {

      await setDoc(likeRef, {
        userId: user.uid,
        createdAt: serverTimestamp(),
      });

      await updateDoc(videoRef, {
        likes: increment(1),
      });

    }

  } catch (e) {

    // Error aaye to UI rollback
    setLocalLikes(prev => ({
      ...prev,
      [videoId]: liked
    }));

    setAllVideos(prev =>
      prev.map(item =>
        item.id === videoId
          ? {
              ...item,
              likes: liked
                ? (item.likes || 0) + 1
                : Math.max((item.likes || 0) - 1, 0),
            }
          : item
      )
    );

    console.log(e);

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


const text = commentText.trim();

setCommentText("");
Keyboard.dismiss();


    await addDoc(
      collection(
        db,
        'all_videos',
        selectedVideoId,
        'comments'
      ),
      {
        text: text,

        username:
          currentUserData.name,

        profilePic:
          currentUserData.photo,

        userId:
          user.uid,

verified: currentUserData.verified || false,

verifiedColor:
      currentUserData.verifiedColor || "white",

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




};







const postReply = async () => {

 const user = auth.currentUser;

 if(!user) return;

 if(!replyText.trim()) return;


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

    username:
    currentUserData.name,

    profilePic:
    currentUserData.photo,

    userId:user.uid,

    verified:
    currentUserData.verified || false,

    verifiedColor:
    currentUserData.verifiedColor || "white",

    createdAt:
    serverTimestamp()

   }
 );


 setReplyText("");

setReplyCommentId(null);

Keyboard.dismiss();
replyInputRef.current?.blur();

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

setComments(prev =>
 prev.filter(
  item=>item.id !== commentId
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

          } catch (e) {
            console.log(e);
          }

        },
      },
    ]
  );

};


const deleteReply = async (
  videoId,
  commentId,
  replyId
) => {

  try {

    await deleteDoc(
      doc(
        db,
        "all_videos",
        videoId,
        "comments",
        commentId,
        "replies",
        replyId
      )
    );


    setReplies(prev => ({

      ...prev,

      [commentId]:
      prev[commentId]?.filter(
        item => item.id !== replyId
      )

    }));


    console.log("Reply Deleted");


  } catch(e){

    console.log(
      "Delete Reply Error",
      e
    );

  }

};


 const [activeVideo, setActiveVideo] =
  useState(Number(index) || 0);

  const [screenFocused, setScreenFocused] =
  useState(true);

const [localLikes, setLocalLikes] = useState({});

const [showComments, setShowComments] =
  useState(false);

const keyboardHeight = useRef(new Animated.Value(0)).current;

const [selectedVideoId, setSelectedVideoId] =
  useState(null);

const [commentText, setCommentText] =
  useState('');

const [comments, setComments] =
  useState([]);

const [commentsLoading, setCommentsLoading] = useState(false);

const [replyCommentId, setReplyCommentId] = useState(null);

const [replyText, setReplyText] = useState("");

const [replies, setReplies] = useState({});

const [showReplies, setShowReplies] = useState({});

const replyInputRef = useRef(null);

const [showStarPopup, setShowStarPopup] =
  useState(false);

const [selectedStar, setSelectedStar] =
  useState(null);

const [showSharePopup, setShowSharePopup] =
  useState(false);

const [selectedShareVideo, setSelectedShareVideo] =
  useState(null);


  const [myStars, setMyStars] =
  useState(0);

const [starAnimationVideoId, setStarAnimationVideoId] = useState(null);

const starScale = useRef(new Animated.Value(0)).current;

const starRotate = useRef(new Animated.Value(0)).current;

const starOpacity = useRef(new Animated.Value(0)).current;

const starJump = useRef(new Animated.Value(0)).current;

const starTilt = useRef(new Animated.Value(0)).current;

const [blockedUsers, setBlockedUsers] = useState([]);

const videoData = allVideos.filter(
  item => !blockedUsers.includes(item.userId)
);


useEffect(() => {

  const user = auth.currentUser;

  if (!user) return;

  const loadLikes = async () => {

    let liked = {};

    for (const video of allVideos) {

      const snap = await getDoc(
        doc(
          db,
          "all_videos",
          video.id,
          "likes",
          user.uid
        )
      );

      liked[video.id] = snap.exists();

    }

    setLocalLikes(liked);

  };

  loadLikes();

}, [allVideos]);



useEffect(() => {

  const user = auth.currentUser;

  if (!user) return;

  const walletRef = doc(db, "wallets", user.uid);

  // Pehle ek baar direct read
  getDoc(walletRef).then((snap) => {
    if (snap.exists()) {
      setMyStars(snap.data().stars || 0);
    }
  });

  // Fir realtime update
  const unsubscribe = onSnapshot(walletRef, (snap) => {
    if (snap.exists()) {
      setMyStars(snap.data().stars || 0);
    }
  });

  return () => unsubscribe();

}, []);




useEffect(() => {

  const user = auth.currentUser;

  if (!user) return;

  const q = query(
    collection(db, "blockedUsers")
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {

    let arr = [];

    snapshot.forEach(doc => {

      const data = doc.data();

      if (data.blockerId === user.uid) {

        arr.push(data.blockedUserId);

      }

    });

    setBlockedUsers(arr);

  });

  return () => unsubscribe();

}, []);



useEffect(() => {

  const backAction = () => {


if (showSharePopup) {
  setShowSharePopup(false);
  return true;
}

    if (showStarPopup) {
      setShowStarPopup(false);
      return true;
    }

    if (showComments) {
      setShowComments(false);
      return true;
    }

    router.replace({
      pathname: "/userProfile",
      params: {
        userId: profileUserId,
      },
    });

    return true;
  };

  const backHandler =
    BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

  return () => backHandler.remove();

}, [showComments, showStarPopup, showSharePopup]);



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

          setCommentsLoading(false);
      }
    );

  return () =>
    unsubscribe();

}, [selectedVideoId]);



useEffect(()=>{

if(!selectedVideoId) return;


comments.forEach((comment)=>{


const q = query(

collection(
db,
"all_videos",
selectedVideoId,
"comments",
comment.id,
"replies"
),

orderBy(
"createdAt",
"asc"
)

);



const unsub = onSnapshot(q,(snap)=>{


let arr=[];


snap.forEach((doc)=>{

arr.push({

id:doc.id,

...doc.data()

});


});


setReplies(prev=>({

...prev,

[comment.id]:arr


}));


});


return ()=>unsub();


});


},[comments,selectedVideoId]);



const [currentUserData, setCurrentUserData] =



  useState({
    name: 'User',
    photo:
      'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
  });




const playStarAnimation = () => {

  starScale.setValue(0.2);
  starOpacity.setValue(0);
  starRotate.setValue(0);
  starJump.setValue(40);
  starTilt.setValue(0);

  Animated.parallel([

    Animated.spring(starScale,{
      toValue:1.3,
      friction:3,
      tension:120,
      useNativeDriver:true,
    }),

    Animated.timing(starOpacity,{
      toValue:1,
      duration:150,
      useNativeDriver:true,
    }),

    Animated.timing(starRotate,{
      toValue:1,
      duration:1200,
      easing:Easing.out(Easing.exp),
      useNativeDriver:true,
    }),

    Animated.timing(starTilt,{
      toValue:1,
      duration:1200,
      useNativeDriver:true,
    }),

    Animated.spring(starJump,{
      toValue:-50,
      friction:4,
      useNativeDriver:true,
    })

  ]).start(()=>{

      Animated.sequence([

        Animated.spring(starScale,{
          toValue:1.6,
          friction:3,
          useNativeDriver:true,
        }),

        Animated.delay(700),

        Animated.parallel([

          Animated.timing(starOpacity,{
            toValue:0,
            duration:500,
            useNativeDriver:true,
          }),

          Animated.timing(starScale,{
            toValue:2,
            duration:500,
            useNativeDriver:true,
          })

        ])

      ]).start(()=>{

          setStarAnimationVideoId(null);

      });

  });

};


  const renderVideo = React.useCallback(({ item, index }) => (

    <View style={styles.videoContainer}>
<VideoPlayerItem

  key={item.id}
  uri={item.videoUrl || item.video}
  active={
    screenFocused &&
    index === activeVideo
  }
/>
 


{
  starAnimationVideoId === item.id && (

    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,

        justifyContent: "center",
        alignItems: "center",

        zIndex: 99999,
        elevation: 99999,
      }}
      pointerEvents="none"
    >

      <Animated.Image

source={require("../../assets/star-logo.png")}

style={{

width:170,

height:170,

opacity:starOpacity,

transform:[

{
translateY:starJump
},

{
scale:starScale
},

{
rotateZ:starRotate.interpolate({
inputRange:[0,1],
outputRange:["0deg","720deg"]
})
},

{
rotateY:starTilt.interpolate({
inputRange:[0,0.5,1],
outputRange:["0deg","180deg","360deg"]
})
},

{
rotateX:starTilt.interpolate({
inputRange:[0,0.5,1],
outputRange:["0deg","25deg","0deg"]
})
}

],

shadowColor:"#FFD700",

shadowOpacity:1,

shadowRadius:35,

elevation:35,

resizeMode:"contain",

}}

 />

    </View>

  )
}


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
console.log("COMMENT OPEN", item.id);
    // Purane comments hata do
    setComments([]);

    // Loader dikhao
    setCommentsLoading(true);

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
onPress={() => {

  setSelectedShareVideo(item);

  setShowSharePopup(true);

}}
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

<View style={styles.userRow}>
  <Text style={styles.userName}>
    {item.username || "@user"}
  </Text>

  {item.verified && (
    <View style={styles.badge}>
     <MaterialCommunityIcons
  name="check-decagram"
  size={18}
  color={
    selectedVideoData?.verifiedColor === "yellow"
      ? "#FFD700"
      : "#ffffff"
  }
/>

      <Ionicons
        name="checkmark"
        size={10}
        color="#131212"
        style={styles.badgeTick}
      />
    </View>
  )}
</View>

  <Text style={styles.caption}>
    {item.caption}
  </Text>


<TouchableOpacity
  style={styles.musicRow}
  activeOpacity={0.8}
  onPress={() => {

    console.log("AllVideo Audio =", item.audioUrl);
    console.log("Song Url =", item.songUrl);
    console.log("Music Url =", item.musicUrl);
    console.log("Music Id =", item.musicId);

    router.push({
      pathname: "/musicDetails",
      params: {
        musicId: item.musicId || item.id,
        musicName: item.songName || "Original Audio",
        username: item.username,
        profile: item.profile,
        audioUrl: item.audioUrl || item.songUrl || item.musicUrl,
      },
    });

  }}
>


<Animated.View

style={[

styles.musicDiscOuter,

{

transform:[

{

rotate:

rotateAnim.interpolate({

inputRange:[0,1],

outputRange:[
"0deg",
"360deg"
]

})

}

]

}

]}

>

<View style={styles.vinylDisc}>

<Image

source={{

uri:

item.profile ||

"https://cdn-icons-png.flaticon.com/512/3135/3135715.png"

}}

style={styles.musicCenterImage}

/>

<View style={styles.musicDot}/>

</View>

</Animated.View>

<View style={styles.musicTextContainer}>

<Animated.Text

numberOfLines={1}

style={[

styles.musicText,

{

transform:[

{

translateX:textAnim

}

]

}

]}

>

🎵 Music • {item.username} • Original Audio

</Animated.Text>

</View>

</TouchableOpacity>





</View>
    </View>


),[
activeVideo,
screenFocused,
localLikes,
comments,
starAnimationVideoId
]);


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
        extraData={{
  activeVideo,
  starAnimationVideoId,
}}
 keyExtractor={(item, i) =>
  item.id + i
}
        pagingEnabled

getItemLayout={(data, index) => ({
  length: height - 81.2,
  offset: (height - 81.2) * index,
  index,
})}

       
viewabilityConfig={viewabilityConfig}
onViewableItemsChanged={onViewRef.current}

initialNumToRender={2}
maxToRenderPerBatch={2}
windowSize={3}
removeClippedSubviews={true}
updateCellsBatchingPeriod={16}
decelerationRate="fast"
snapToAlignment="start"
disableIntervalMomentum={true}
scrollEventThrottle={8}
      />







{
showComments && (

<View
style={{
position:'absolute',
bottom:32,
left:0,
right:0,
height:height*0.6,
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
      fontSize: 15,
    }}
  >
    @{selectedVideoData.username}
  </Text>



 {selectedVideoData?.verified && (
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
  size={16}
  color={
    selectedVideoData?.verifiedColor === "yellow"
      ? "#FFD700"
      : "#ffffff"
  }
/>

    <Ionicons
      name="checkmark"
      size={10}
      color="#131212"
      style={{
        position: "absolute",
        top: 4.6,
        left: 4.2,
      }}
    />
  </View>
)}

</View>

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




{
commentsLoading ? (

<View
style={{
flex:1,
justifyContent:"center",
alignItems:"center"
}}
>

<ActivityIndicator
size="large"
color="#FFD700"
/>

</View>

) : (




<FlatList
data={comments}

style={{
marginTop:10,
flex:1,
}}

contentContainerStyle={{
paddingBottom:90,
}}

keyboardShouldPersistTaps="handled"

showsVerticalScrollIndicator={false}
removeClippedSubviews={false}
keyExtractor={(item)=>item.id}
keyboardDismissMode="interactive"
renderItem={({item})=>(

<View
style={{
flexDirection:'row',
padding:12,
alignItems:'flex-start',
justifyContent:'space-between',
}}
>

<TouchableOpacity
  onPress={() => {
    setShowComments(false);

    router.push({
      pathname: "/userProfile",
      params: {
        userId: item.userId,
      },
    });
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
</TouchableOpacity>

<View
style={{
marginLeft:10,
flex:1,
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
    {item.username}
  </Text>


{item.verified && (
  <View
    style={{
      marginLeft: 5,
      width: 16,
      height: 16,
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
    }}
  >
    <MaterialCommunityIcons
  name="check-decagram"
  size={16}
  color={
    item.verifiedColor === "yellow"
      ? "#FFD700"
      : "#ffffff"
  }
/>

    <Ionicons
      name="checkmark"
      size={9}
      color="#131212"
      style={{
        position: "absolute",
        top: 4,
        left: 3.8,
      }}
    />
  </View>
)}

</View>

<Text
style={{
color:'#fff'
}}
>
{item.text}
</Text>



<TouchableOpacity
onPress={()=>{

setShowReplies(prev => ({
  ...prev,
  [item.id]: !prev[item.id]
}));

}}
>

<Text

style={{

color:"#c3c2be",

fontSize:13,

marginTop:5

}}

>

{
showReplies[item.id]
?
"Hides"
:
`View ${replies[item.id]?.length || 0} Replies`
}

</Text>

</TouchableOpacity>



<Text

style={{

color:"#c3c2be",

fontSize:13,

marginTop:5

}}

>

Reply

</Text>






{
showReplies[item.id] &&
replies[item.id]?.map((reply)=>(

<View
key={reply.id}


style={{

flexDirection:"row",

marginTop:10,

marginLeft:35

}}

>


<Image

source={{

uri:reply.profilePic

}}

style={{

width:30,

height:30,

borderRadius:15

}}

/>



<View

style={{

marginLeft:8

}}

>


<Text

style={{

color:"#fff",

fontWeight:"bold",

fontSize:13

}}

>

{reply.username}

</Text>



<Text

style={{

color:"#ddd"

}}

>

{reply.text}

</Text>


{
auth.currentUser?.uid === reply.userId && (

<TouchableOpacity
style={{
position:"absolute",
right:-190,
top:5,
padding:5,
}}
onPress={()=>{

Alert.alert(
"Delete Reply",
"Do you want to delete this reply?",
[
{
text:"Cancel",
style:"cancel"
},
{
text:"Delete",
style:"destructive",
onPress:()=>deleteReply(
selectedVideoId,
item.id,
reply.id
)
}
]
)

}}
>

<Ionicons
name="ellipsis-vertical"
size={20}
color="#fff"
/>

</TouchableOpacity>

)
}


</View>


</View>


))
}


</View>



{
auth.currentUser?.uid === item.userId && (

<TouchableOpacity
onPress={() => deleteComment(item.id)}
style={{
paddingLeft:10,
paddingTop:5,
}}
>

<Ionicons
name="ellipsis-vertical"
size={20}
color="#fff"
/>

</TouchableOpacity>

)
}



</View>

)}
/>

)
}



<Animated.View
style={{
position:"absolute",

left:10,
right:10,

bottom:15,

transform:[
{
translateY:
Animated.multiply(
keyboardHeight,
-1
)
}
],

flexDirection:'row',

alignItems:'center',

backgroundColor:'#111',

paddingHorizontal:12,

paddingVertical:8,

borderRadius:30,

zIndex:99999,

elevation:99999,

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

ref={replyInputRef}

value={
replyCommentId
?
replyText
:
commentText
}


onChangeText={

replyCommentId

?

setReplyText

:

setCommentText

}


placeholder={

replyCommentId

?

"Write reply..."

:

"Comment..."

}


placeholderTextColor="#999"


style={{

flex:1,

color:'#fff'

}}

/>

<TouchableOpacity

onPress={()=>{


if(replyCommentId){

postReply();

}

else{

postComment();

}


}}

>

<Ionicons
name="send"
size={24}
color="#FFD700"
/>

</TouchableOpacity>


</Animated.View>

</View>



)
}




{
showSharePopup && (

<View style={styles.sharePopupContainer}>

<TouchableOpacity
style={StyleSheet.absoluteFill}
activeOpacity={1}
onPress={() => setShowSharePopup(false)}
/>

<View style={styles.sharePopup}>

<View style={styles.actionRow}>

{/* REPORT */}

<TouchableOpacity
style={styles.reportBtn}
onPress={() => {

setShowSharePopup(false);

router.push({
pathname: "/report",
params: {
videoId: selectedShareVideo?.id
}
});

}}
>

<Text style={styles.reportText}>
Report Video
</Text>

</TouchableOpacity>


{/* SAVE */}

<TouchableOpacity
style={styles.saveBtn}
onPress={() => {

setShowSharePopup(false);

// Save Logic

}}
>

<Text style={styles.saveText}>
Video Save
</Text>

</TouchableOpacity>

</View>


{/* SHARE */}

<View style={styles.shareRow}>

  {/* Share Video */}
  <TouchableOpacity
    style={styles.shareBtn}
    onPress={() => {

      setShowSharePopup(false);

      handleShare(
        selectedShareVideo.videoUrl,
        selectedShareVideo.id
      );

    }}
  >
    <Text style={styles.shareText}>
      Share Video
    </Text>
  </TouchableOpacity>


  {/* TopKing Logo */}
  <TouchableOpacity
    style={styles.logoBtn}
    onPress={() => {

      setShowSharePopup(false);

      router.push({
        pathname: "../ShareVideo",
        params: {
          videoId: selectedShareVideo?.id,

          videoUrl:
            selectedShareVideo?.videoUrl ||
            selectedShareVideo?.video,

          thumbnail:
            selectedShareVideo?.thumbnail,
        },
      });

    }}
  >

    <Image
      source={require('../../assets/logo.png')}
      style={styles.shareLogo}
    />

  </TouchableOpacity>
</View>

</View>

</View>

)
}





{
showStarPopup && (

<View style={styles.starPopupContainer}>

<View style={styles.starPopup}>


{/* MY STARS */}
<View style={styles.myStarBox}>

<Image
source={require('../../assets/star-logo.png')}
style={styles.myStarImage}
/>

<Text style={styles.myStarText}>
{myStars}
</Text>

</View>


{/* STAR CARDS */}
<View style={styles.starRow}>

<TouchableOpacity
style={[
styles.starCard,
selectedStar===1 && styles.activeStar
]}
onPress={()=>setSelectedStar(1)}
>

<Image
source={require('../../assets/star-logo.png')}
style={styles.popupStarImage}
/>

<Text style={styles.starValue}>
x1
</Text>

</TouchableOpacity>



<TouchableOpacity
style={[
styles.starCard,
selectedStar===3 && styles.activeStar
]}
onPress={()=>setSelectedStar(3)}
>

<Image
source={require('../../assets/star-logo.png')}
style={styles.popupStarImage}
/>

<Text style={styles.starValue}>
x3
</Text>

</TouchableOpacity>



<TouchableOpacity
style={[
styles.starCard,
selectedStar===10 && styles.activeStar
]}
onPress={()=>setSelectedStar(10)}
>

<Image
source={require('../../assets/star-logo.png')}
style={styles.popupStarImage}
/>

<Text style={styles.starValue}>
x10
</Text>

</TouchableOpacity>

</View>




<TouchableOpacity
  style={styles.starSubmitBtn}
  onPress={async()=>{

const user = auth.currentUser;

if(!user) return;

if(!selectedStar){
  Alert.alert("Select Star");
  return;
}

if(myStars < selectedStar){
  Alert.alert("Not enough Stars");
  return;
}

try{

  setShowStarPopup(false);

setStarAnimationVideoId(selectedVideoId);

  playStarAnimation();

  


  const senderWallet = doc(
    db,
    "wallets",
    user.uid
  );

  await updateDoc(senderWallet,{
    stars: increment(-selectedStar)
  });

  const videoRef = doc(
    db,
    "all_videos",
    selectedVideoId
  );

  const videoSnap = await getDoc(videoRef);

  if(videoSnap.exists()){

    const videoData = videoSnap.data();

    const receiverWallet = doc(
      db,
      "wallets",
      videoData.userId
    );

    await setDoc(
      receiverWallet,
      {
        receivedStars: increment(selectedStar)
      },
      { merge:true }
    );


try {

  await fetch(
    "https://YOUR_RENDER_URL/update-agency-stars",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receiverUid: selectedGiftUser,
        stars: item.price,
      }),
    }
  );

} catch (e) {
  console.log("Agency Update Error", e);
}



    await updateDoc(videoRef,{
      stars: increment(selectedStar)
    });

  }

  setMyStars(prev=>prev-selectedStar);

}catch(e){

  console.log(e);

}

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






<TouchableOpacity
style={styles.backButton}
onPress={() => {

  router.replace({
    pathname: "/userProfile",
    params: {
      userId: profileUserId,
    },
  });

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
  header: { height: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', paddingTop: 10 },
  headerText: { color: 'white', fontWeight: 'bold' },
  videoContainer: { height: height - 77.2, width: width }, // Header & Comment height minus

  video: { width: '100%', height: '93%' },


sideBar: {
  position: 'absolute',

  right: -5,

  bottom: 65,   // video ke niche se kitna upar

  alignItems: 'center',

  zIndex: 999,
},

  sideText: { color: 'white', fontSize: 24, marginBottom: 15 },
  
bottomInfo: {
  position: 'absolute',

  left: 12,

  bottom: 65,      // niche se kitna upar

  width: width * 0.7,

  zIndex: 999,
},

  userName: {
  color: "#fff",
  fontSize: 18,
  fontWeight: "bold",
  textShadowColor: "rgba(0,0,0,0.6)",
  textShadowOffset: {
    width: 1,
    height: 1,
  },
  textShadowRadius: 3,
},

  caption: { color: 'white' },

commentBox: {
  height: 95.2,
  backgroundColor: '#111',
  justifyContent: 'center',
  paddingLeft: 20,
},

  commentText: { color: '#888',    marginBottom: 45,  paddingLeft: 20,    },
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
  marginBottom: 4,
},

iconText: {
  color: '#fff',
  fontWeight: 'bold',
  marginTop: 3,
},

musicRow: {
  flexDirection: 'row',
  alignItems: 'center',
  marginTop: 15,
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
  top: 50,
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




starPopupContainer:{
position:'absolute',
left:0,
right:0,
bottom:0,
height:height,
backgroundColor:'rgba(0,0,0,0.4)',
justifyContent:'flex-end',
zIndex:9999,
},

starPopup:{
width:'100%',
height:290,
backgroundColor:'#111',

borderTopLeftRadius:25,
borderTopRightRadius:25,

paddingTop:20,
paddingHorizontal:20,
},


myStarBox:{
flexDirection:'row',
alignItems:'center',
top:-10,
left:0,
marginBottom:20,
},

myStarImage:{
width:45,
height:45,
resizeMode:'contain',
},

myStarText:{
color:'#FFD700',
fontSize:24,
fontWeight:'bold',
marginLeft:-5,
},


starRow:{
flexDirection:'row',
justifyContent:'space-around',
marginTop:-23,
},

starCard:{
width:90,
height:100,
backgroundColor:'#222',
borderRadius:20,

justifyContent:'center',
alignItems:'center',
},

activeStar:{
borderWidth:3,
borderColor:'#FFD700',

shadowColor:'#FFD700',
shadowOpacity:1,
shadowRadius:15,
elevation:15,
},


popupStarImage:{
width:90,
height:90,
resizeMode:'contain',
marginTop:-15,
},

starValue:{
color:'#FFD700',
fontWeight:'bold',
fontSize:15,
marginTop:-20,
},


starSubmitBtn:{
backgroundColor:'#FFD700',
paddingVertical:14,
borderRadius:30,
marginTop:30,
alignSelf:'center',
width:180,
},

starSubmitText:{
color:'#000',
fontWeight:'bold',
textAlign:'center',
},


sharePopupContainer:{
position:'absolute',
left:0,
right:0,
bottom:25,
height:height,
backgroundColor:'rgba(0,0,0,0.5)',
justifyContent:'flex-end',
zIndex:9999,
},

sharePopup:{
backgroundColor:'#111',
borderTopLeftRadius:20,
borderTopRightRadius:20,
padding:30,
},

actionRow:{
flexDirection:'row',
justifyContent:'space-between',
marginBottom:15,
},

reportBtn:{
backgroundColor:'#ff3333',
width:'48%',
paddingVertical:10,
borderRadius:12,
},

saveBtn:{
backgroundColor:'#3498db',
width:'48%',
paddingVertical:10,
borderRadius:12,
},

reportText:{
color:'#fff',
fontWeight:'bold',
textAlign:'center',
fontSize:14,
},

saveText:{
color:'#fff',
fontWeight:'bold',
textAlign:'center',
fontSize:14,
},

shareBtn:{
  backgroundColor:'#FFD700',

  width:230,
  height:45,

  borderRadius:20,

  justifyContent:'center',
  alignItems:'center',

  marginLeft:5,
  marginRight:0,

  marginTop:0,
  marginBottom:0,
},

shareRow:{
  flexDirection:'row',
  alignItems:'center',
  justifyContent:'space-between',
  marginTop:10,
},

logoBtn:{
  width:60,
  height:60,
  borderRadius:45,
  overflow:'hidden',
  justifyContent:'center',
  alignItems:'center',
  backgroundColor:'#000',
},

shareLogo:{
  width:100,
  height:100,
  borderRadius:25,
  resizeMode:'cover',
},

shareText:{
color:'#000',
fontWeight:'bold',
fontSize:18,
textAlign:'center',
},

userRow: {
  flexDirection: "row",
  alignItems: "center",
},

badge: {
  marginLeft: 5,
  width: 18,
  height: 18,
  justifyContent: "center",
  alignItems: "center",
  position: "relative",
},

badgeTick: {
  position: "absolute",
  top: 4.6,
  left: 4.2,
},

musicRow:{
flexDirection:"row",
alignItems:"center",
marginTop:10,
},

musicDiscOuter:{
marginRight:10,
},

vinylDisc:{
width:42,
height:42,
borderRadius:21,
backgroundColor:"#000",
justifyContent:"center",
alignItems:"center",
},

musicCenterImage:{
width:22,
height:22,
borderRadius:11,
},

musicDot:{
position:"absolute",
width:6,
height:6,
borderRadius:3,
backgroundColor:"#fff",
},

musicTextContainer:{
width:180,
overflow:"hidden",
},

musicText:{
color:"#fff",
fontSize:13,
},

});          