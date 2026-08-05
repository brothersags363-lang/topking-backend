// ==========================
// IMPORTS
// ==========================
import React, { memo,  useRef, useState, useEffect, useCallback } from 'react';

import { InteractionManager } from "react-native";

import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Dimensions,
  FlatList,
  Platform,
  Image,
  StatusBar,
  ActivityIndicator,
  Share,
  Alert,
  TextInput,
  BackHandler,
    Keyboard, 
      Animated,
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
  addDoc,
  getDocs,
} from 'firebase/firestore';



import { VideoView, useVideoPlayer } from 'expo-video';
import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { useRouter, usePathname, useFocusEffect } from 'expo-router';

// ==========================
// FIREBASE
// ==========================
import { db } from '../firebaseConfig';

import { getAuth, onAuthStateChanged } from 'firebase/auth';



const { height, width } = Dimensions.get('screen');

const auth = getAuth(); 



const FeedVideo = memo(
function FeedVideo({ uri, active }) {

  const player = useVideoPlayer(uri, (player) => {
    player.loop = true;

    player.bufferOptions={
preferredForwardBufferDuration:5
};
  });

 
useEffect(()=>{

let mounted=true;

const start=async()=>{

if(!mounted)return;

if(active){

await player.play();

}else{

await player.pause();

}

};

start();

return()=>{

mounted=false;

};

},[active]);


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
},

(prevProps, nextProps) => {
  return (
    prevProps.uri === nextProps.uri &&
    prevProps.active === nextProps.active
  );
}

);


export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
const [showSharePopup, setShowSharePopup] = useState(false);
const [selectedShareVideo, setSelectedShareVideo] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState(0);
  const [currentIndex,setCurrentIndex]=useState(0);

const scrollRef=useRef(null);
const commentInputRef = useRef(null);
  const [isFocused, setIsFocused] = useState(true);
  const [localLikes, setLocalLikes] = useState({}); 


useEffect(() => {

  const loadLikes = async () => {

    const user = auth.currentUser;

    if (!user || videos.length === 0) return;

    let likesData = {};

    for (const video of videos) {

      const likeRef = doc(
        db,
        "all_videos",
        video.id,
        "likes",
        user.uid
      );

      const likeSnap = await getDoc(likeRef);

      if (likeSnap.exists()) {

        likesData[video.id] = true;

      }

    }

    setLocalLikes(likesData);

  };

  loadLikes();

}, [videos]);


useEffect(() => {

  const user = auth.currentUser;

  if (!user || videos.length === 0) return;

  const loadFollowing = async () => {

    let data = {};

    for (const video of videos) {

      const followRef = doc(
        db,
        "users",
        user.uid,
        "following",
        video.userId
      );

      const snap = await getDoc(followRef);

      if (snap.exists()) {
        data[video.userId] = true;
      }

    }

    setFollowingUsers(data);

  };

  loadFollowing();

}, [videos]);




  const [heartVideoId, setHeartVideoId] = useState(null);
const lastTap = useRef(null);
const viewTimeout = useRef(null);
const heartTimeout = useRef(null);


  const [showComments, setShowComments] = useState(false);
const commentAnim = useRef(new Animated.Value(height)).current;

const keyboardHeight = useRef(new Animated.Value(0)).current;

const [selectedVideoId, setSelectedVideoId] = useState(null);
const [commentText, setCommentText] = useState('');
const [comments, setComments] = useState([]);
const [commentsLoading, setCommentsLoading] = useState(false);
const replyUnsubscribers = useRef([]);
const [replyingTo, setReplyingTo] = useState(null);

const [replies, setReplies] = useState({});

const [replyText, setReplyText] = useState("");

const [expandedReplies, setExpandedReplies] = useState({});

const [replyCounts, setReplyCounts] = useState({});

const [currentUserData, setCurrentUserData] = useState({
  
  name: 'User',
  photo: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
});
  
const [selectedVideoData, setSelectedVideoData] = useState(null);

const [showStarPopup, setShowStarPopup] = useState(false);
const [selectedStar, setSelectedStar] = useState(null);

const [myStars, setMyStars] = useState(0);

const [starAnimationVideoId, setStarAnimationVideoId] = useState(null);

const starScale = useRef(new Animated.Value(0)).current;

const starRotate = useRef(new Animated.Value(0)).current;

const starOpacity = useRef(new Animated.Value(0)).current;

const starJump = useRef(new Animated.Value(0)).current;

const starTilt = useRef(new Animated.Value(0)).current;

const [blockedUsers, setBlockedUsers] = useState([]);

const [followingUsers, setFollowingUsers] = useState({});

const rotateAnim = useRef(new Animated.Value(0)).current;

const textAnim = useRef(new Animated.Value(0)).current;


useEffect(() => {

    const user = auth.currentUser;

    if (!user) return;

    const loadBlockedUsers = async () => {

        const snapshot = await getDocs(
            collection(db, "users", user.uid, "blockedUsers")
        );

        const ids = snapshot.docs.map(doc => doc.id);

        setBlockedUsers(ids);

    };

    loadBlockedUsers();

}, []);





useEffect(() => {

  Animated.loop(

    Animated.timing(
      rotateAnim,
      {
        toValue: 1,
        duration: 2200,
        useNativeDriver: true,
      }
    )

  ).start();

}, []);

useEffect(() => {

  Animated.loop(

    Animated.sequence([

      Animated.timing(textAnim,{
        toValue:-180,
        duration:5000,
        useNativeDriver:true,
      }),

      Animated.timing(textAnim,{
        toValue:0,
        duration:0,
        useNativeDriver:true,
      }),

    ])

  ).start();

},[]);


  // AUDIO SETUP


  // FETCH VIDEOS
  useEffect(() => {
    const q = query(
      collection(db, 'all_videos'), 
      orderBy('createdAt', 'desc'),
      limit(100) 
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedVideos = [];

   
snapshot.forEach((docItem) => {

  const data = docItem.data();


if (
    data.status !== "blocked" &&
    data.hidden !== true &&
    !blockedUsers.includes(data.userId)
) {

    loadedVideos.push({
  id: docItem.id,
  ...data,
  verified: data.verified || false,
  verifiedColor: data.verifiedColor || "",
});

}




});


      setVideos(loadedVideos);
      setLoading(false);
    }, (error) => {
      console.log('Firebase Error:', error);
      setLoading(false);
    });
    return () => unsubscribe();


  }, [blockedUsers]);




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
               verified: data.verified || false,
               verifiedColor: data.verifiedColor || "",
          });
        }
      } catch (error) {
        console.log(error);
      }
    }
  });

  return () => unsubscribeAuth();
}, []);



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




useEffect(() => {

    if (showComments) {

        Animated.spring(commentAnim,{
            toValue:0,
            useNativeDriver:true,
            speed:15,
            bounciness:4
        }).start();

    } else {

        Animated.timing(commentAnim,{
            toValue:height,
            duration:250,
            useNativeDriver:true
        }).start();

    }

},[showComments]);



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
if (showSharePopup) {
  setShowSharePopup(false);
  return true;
}

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
}, [showComments, showStarPopup, showSharePopup]);




useEffect(() => {

if (!selectedVideoId) return;


setComments([]);
setReplies({});
setCommentsLoading(true);


// purane reply listeners band karo
replyUnsubscribers.current.forEach(unsub => unsub());
replyUnsubscribers.current = [];


const q = query(
  collection(
    db,
    "all_videos",
    selectedVideoId,
    "comments"
  ),
  orderBy("createdAt","desc")
);



const unsubscribe = onSnapshot(
q,
(snapshot)=>{


const data = snapshot.docs.map(doc=>({
id:doc.id,
...doc.data()
}));


setComments(data);



data.forEach((comment)=>{


const replyQuery = query(

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



const replyUnsub = onSnapshot(
replyQuery,
(replySnap)=>{


setReplies(prev=>({

...prev,

[comment.id]:

replySnap.docs.map(doc=>({
id:doc.id,
...doc.data()
}))

}));


});


replyUnsubscribers.current.push(replyUnsub);



});



setCommentsLoading(false);


},

(error)=>{

console.log("Comment Load Error",error);

setCommentsLoading(false);

}

);



return ()=>{


unsubscribe();


replyUnsubscribers.current.forEach(
unsub=>unsub()
);


replyUnsubscribers.current=[];


};



},[selectedVideoId]);

  // INTERACTIONS
  

      const handleLike = async (videoId) => {
  const user = auth.currentUser;

  if (!user) {
    Alert.alert(
      "Login Required",
      "Please login to like this video."
    );
    return;
  }

  const userId = user.uid;

  const likeRef = doc(
    db,
    "all_videos",
    videoId,
    "likes",
    userId
  );

  const videoRef = doc(
    db,
    "all_videos",
    videoId
  );

const alreadyLiked = localLikes[videoId];

  try {




// UI ko turant update karo
setLocalLikes(prev => ({
  ...prev,
  [videoId]: !alreadyLiked,
}));

// Likes count bhi turant change karo
setVideos(prev =>
  prev.map(video =>
    video.id === videoId
      ? {
          ...video,
          likes:
            (video.likes || 0) +
            (alreadyLiked ? -1 : 1),
        }
      : video
  )
);


    // ===== UNLIKE =====
    if (alreadyLiked) {

     await deleteDoc(likeRef);

await updateDoc(videoRef,{
    likes:increment(-1),
    engagementScore:increment(-5)
});

const userLikeRef = doc(
    db,
    "userLikes",
    userId,
    "likedVideos",
    videoId
);

await deleteDoc(userLikeRef); 


    }

    // ===== LIKE =====
    else {

      await setDoc(likeRef, {
        userId: userId,
        createdAt: serverTimestamp()
      });

      await updateDoc(videoRef, {
        likes: increment(1),
        engagementScore: increment(5)
      });

    

      // Notification
      

const videoSnap = await getDoc(videoRef);

if(videoSnap.exists()){

    const videoData = videoSnap.data();





    const userLikeRef = doc(
        db,
        "userLikes",
        userId,
        "likedVideos",
        videoId
    );

    await setDoc(userLikeRef,{
        videoId:videoId,
        ownerId:videoData.userId,
        createdAt:serverTimestamp()
    });

}




      if (videoSnap.exists()) {

        const videoData = videoSnap.data();

        if (videoData.userId !== user.uid) {

        await addDoc(
  collection(db, "users", videoData.userId, "notifications"),
  {
    type: "like",
    isRead: false,
    senderId: user.uid,
    senderName: currentUserData.name,
    senderPhoto: currentUserData.photo,

    videoId: videoId, // IMPORTANT

    videoCaption: videoData.caption || "",
    videoThumbnail:
      videoData.thumbnail ||
      videoData.videoThumbnail ||
      "",

    createdAt: serverTimestamp()
  }
);

        }

      }

    }

  }

 catch (e) {

  // Agar Firebase fail ho jaye to UI wapas previous state me aa jaye
  setLocalLikes(prev => ({
    ...prev,
    [videoId]: alreadyLiked,
  }));

  setVideos(prev =>
    prev.map(video =>
      video.id === videoId
        ? {
            ...video,
            likes:
              (video.likes || 0) +
              (alreadyLiked ? 1 : -1),
          }
        : video
    )
  );

  console.log("Like Error:", e);
}

};




const handleFollow = async (targetUserId) => {

  const user = auth.currentUser;

  if (!user) return;

  if (user.uid === targetUserId) return;

  const followingRef = doc(
    db,
    "users",
    user.uid,
    "following",
    targetUserId
  );

  const followerRef = doc(
    db,
    "users",
    targetUserId,
    "followers",
    user.uid
  );

  try {

    if (followingUsers[targetUserId]) {

      await deleteDoc(followingRef);

      await deleteDoc(followerRef);

      setFollowingUsers(prev => ({
        ...prev,
        [targetUserId]: false
      }));

    } else {

      await setDoc(followingRef,{
        createdAt:serverTimestamp()
      });

      await setDoc(followerRef,{
        createdAt:serverTimestamp()
      });

      setFollowingUsers(prev => ({
        ...prev,
        [targetUserId]: true
      }));

    }

  } catch(e){
    console.log(e);
  }

};



const handleDoubleTapLike = (videoId) => {

  // Heart animation
  setHeartVideoId(videoId);

  if (heartTimeout.current) {
    clearTimeout(heartTimeout.current);
  }

  heartTimeout.current = setTimeout(() => {
    setHeartVideoId(null);
  }, 800);

  // Agar pehle se like nahi hai tabhi like karo
  if (!localLikes[videoId]) {
    handleLike(videoId);
  }

};





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



const deleteReply = async (commentId, replyId) => {

  Alert.alert(
    "Delete Reply",
    "Do you want to delete this reply?",
    [
      {
        text:"Cancel",
        style:"cancel",
      },

      {
        text:"Delete",
        style:"destructive",

        onPress: async()=>{

          try{


            await deleteDoc(
              doc(
                db,
                "all_videos",
                selectedVideoId,
                "comments",
                commentId,
                "replies",
                replyId
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


          }catch(e){

            console.log("Reply delete error",e);

          }

        }

      }

    ]
  );

};


const postComment = async () => {

// Reply mode
if (replyingTo) {
  await postReply();
  return;
}

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

const text = commentText.trim();

// Turant UI clear karo
setCommentText("");
Keyboard.dismiss();

  try {
    await addDoc(
      collection(
        db,
        'all_videos',
        selectedVideoId,
        'comments'
      ),
      {
        text: text,
        username: currentUserData.name,
profilePic: currentUserData.photo,
        userId: user.uid,
         verified: currentUserData?.verified || false,
         verifiedColor:
  currentUserData?.verifiedColor || "",
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


const videoSnap = await getDoc(
  doc(db, "all_videos", selectedVideoId)
);

if (videoSnap.exists()) {

  const videoData = videoSnap.data();

  if (videoData.userId !== user.uid) {

    await addDoc(
  collection(
    db,
    "users",
    videoData.userId,
    "notifications"
  ),
  {
    type: "comment",
isRead: false,
    senderId: user.uid,
    senderName: currentUserData.name,
    senderPhoto: currentUserData.photo,

    videoId: selectedVideoId, // IMPORTANT

    text: text,

    videoCaption: videoData.caption || "",

    videoThumbnail:
      videoData.thumbnail ||
      videoData.videoThumbnail ||
      "",

    createdAt: serverTimestamp(),
  }
);

  }

}




    
  } catch (error) {
    console.log('Comment Error:', error);
  }
};





const postReply = async () => {

  const user = auth.currentUser;

  if (!user) return;

  if (!commentText.trim()) return;

  const text = commentText.trim();

  setCommentText("");

  Keyboard.dismiss();

  try {

    await addDoc(

      collection(
        db,
        "all_videos",
        selectedVideoId,
        "comments",
        replyingTo.id,
        "replies"
      ),

      {
        text: text,
        username: currentUserData.name,
        profilePic: currentUserData.photo,
        userId: user.uid,
        verified: currentUserData.verified || false,
        verifiedColor:
          currentUserData.verifiedColor || "",
        createdAt: serverTimestamp(),
      }

    );

await updateDoc(
  doc(db, "all_videos", selectedVideoId),
  {
    commentsCount: increment(1),
    engagementScore: increment(1),
  }
);

    setReplyingTo(null);

  } catch (error) {

    console.log("Reply Error:", error);

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
      InteractionManager.runAfterInteractions(() => {

setCurrentIndex(index);

setActiveVideo(index);

});
      if (viewableItems[0].item) {

   if (viewTimeout.current) {
  clearTimeout(viewTimeout.current);
}

viewTimeout.current = setTimeout(() => {

  trackView(viewableItems[0].item.id);

}, 2000);

      }
    }
  }).current;

 const viewConfigRef = useRef({
  itemVisiblePercentThreshold: 80,
});

  const getIconColor = (path) => pathname === path ? '#3498db' : '#ffffff';



const renderItem = useCallback(({ item, index }) => {



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

{
Math.abs(currentIndex - index) <= 2 ? (

<FeedVideo
  uri={item.videoUrl || item.video}
  active={isFocused && activeVideo === index}
/>

) : (

<View
style={{
width,
height,
backgroundColor:"#000"
}}
/>

)
}


{
  heartVideoId === item.id && (

    <View style={styles.heartPopup}>

     <Ionicons
  name="heart"
  size={140}
  color="#ff004f"
/>

    </View>

  )
}





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









        <View style={styles.overlay} />

        <View style={styles.bottomLeft}>
          
 
 <View style={styles.userRow}>

  <Text style={styles.userName}>
    {item.username || "@user"}
  </Text>

  {item.verified && (
    <View style={styles.badge}>
    
<MaterialCommunityIcons
  name="check-decagram"
  size={17}
  color={
    item?.verifiedColor === "yellow"
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



          <Text style={styles.caption}>{item.caption}</Text>
          


   
<TouchableOpacity
  style={styles.musicRow}
  activeOpacity={0.8}
  onPress={() =>
    router.push({
      pathname: "/musicDetails",
      params: {
        musicId: item.musicId || item.id,
        musicName: item.songName || "Original Audio",
        username: item.username,
        profile: item.profile,
          audioUrl: item.audioUrl || item.songUrl || item.musicUrl,
      },
    })
  }
>


  <Animated.View
    style={[
      styles.musicDiscOuter,
      {
        transform: [
          {
            rotate: rotateAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ["0deg", "360deg"],
            }),
          },
        ],
      },
    ]}
  >

    {/* Black Disc */}
    <View style={styles.vinylDisc}>

      {/* Center Profile */}
      <Image
        source={{
          uri:
            item.profile ||
            "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
        }}
        style={styles.musicCenterImage}
      />

      {/* Center Dot */}
      <View style={styles.musicDot} />

    </View>

  </Animated.View>

 <View
style={styles.musicTextContainer}
>

<Animated.Text

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

numberOfLines={1}

>

🎵 Music • {item.username} • Original Audio 

</Animated.Text>

</View>


</TouchableOpacity>



        </View>

        <View style={styles.rightIcons}>
        


<View style={[styles.iconBox,{marginBottom:18}]}>

  {/* Profile */}
  <TouchableOpacity
    onPress={() =>
      router.push({
        pathname: "/userProfile",
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
          "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
      }}
      style={styles.profileImage}
    />

  </TouchableOpacity>

  {/* Plus Button */}
  {
    auth.currentUser?.uid !== item.userId &&
    !followingUsers[item.userId] && (

      <TouchableOpacity
        style={styles.plusIconSmall}
        onPress={() => handleFollow(item.userId)}
      >

        <Ionicons
          name="add"
          size={12}
          color="#000"
        />

      </TouchableOpacity>

    )
  }

</View>


          <TouchableOpacity style={styles.iconBox} onPress={() => handleLike(item.id)}>
            <Ionicons name="heart" size={40} color={localLikes[item.id] ? "red" : "white"} />

<Text style={styles.iconText}>
  {item.likes || 0}
</Text>

          </TouchableOpacity>

   

<TouchableOpacity
  style={styles.iconBox}

  onPress={() => {

    // पुराने comments साफ
    setComments([]);

    // पुराने replies साफ
    setReplies({});

    // पुराने expanded replies साफ
    setExpandedReplies({});

    // reply mode बंद
    setReplyingTo(null);

    // loading चालू
    setCommentsLoading(true);


    // नया video select
    setSelectedVideoId(item.id);


    // comment header data
    setSelectedVideoData({

      username: item.username,

      profile: item.profile,

      caption: item.caption,

      userId: item.userId,

      verified: item.verified || false,

      verifiedColor: item.verifiedColor || "",

    });


    // comment popup open
    setShowComments(true);


  }}
>


            <Ionicons name="chatbubble" size={35} color="#ffffff" />
            <Text style={styles.iconText}>{item.commentsCount || 0}</Text>
          </TouchableOpacity>

          <TouchableOpacity
  style={styles.iconBox}
  onPress={() => {
    setSelectedShareVideo(item);
    setShowSharePopup(true);
  }}
>
            <Ionicons name="arrow-redo" size={38} color="#ffffff" />
            <Text style={styles.iconText}>{item.shares || 0}</Text>
          </TouchableOpacity>

         

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
 
},[
activeVideo,
currentIndex,
isFocused,
localLikes,
followingUsers,
starAnimationVideoId
]);

  if (loading) return <View style={styles.loadingBox}><ActivityIndicator size="large" color="#f1c40f" /></View>;

  return (
    <View style={styles.fullScreenOverlay}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      




     <FlatList
     ref={scrollRef}
        data={videos}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        pagingEnabled
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        scrollEventThrottle={16}
disableIntervalMomentum={true}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewConfigRef.current}

        windowSize={5}
initialNumToRender={2}
maxToRenderPerBatch={2}
updateCellsBatchingPeriod={30}
maintainVisibleContentPosition={{
minIndexForVisible:0
}}

scrollEventThrottle={8}

disableVirtualization={false}

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

  

{showStarPopup && (

<View
  style={{
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 9999,
  }}
>

  <Pressable
    style={StyleSheet.absoluteFill}
    onPress={() => setShowStarPopup(false)}
  />

  <View style={styles.starPopup}>

    <View style={styles.myStarBox}>

      <Image
        source={require('../../assets/star-logo.png')}
        style={styles.myStarImage}
      />

      <Text style={styles.myStarText}>
        {myStars}
      </Text>

    </View>

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
onPress={async()=>{

const user=auth.currentUser;

if(!user) return;

if(!selectedStar){
Alert.alert("Select Star");
return;
}

if(myStars<selectedStar){
Alert.alert("Not enough Stars");
return;
}

try{


setShowStarPopup(false);

setStarAnimationVideoId(selectedVideoId);

setSelectedStar(null);

playStarAnimation();


const senderWallet=doc(
db,
"wallets",
user.uid
);

await updateDoc(senderWallet,{
stars:increment(-selectedStar)
});

const videoRef=doc(
db,
"all_videos",
selectedVideoId
);

const videoSnap=await getDoc(videoRef);

if(videoSnap.exists()){

const videoData=videoSnap.data();

const receiverWallet=doc(
db,
"wallets",
videoData.userId
);

await setDoc(
  receiverWallet,
  {
    receivedStars: increment(selectedStar)
  },
  { merge: true }
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
stars:increment(selectedStar)
});

}

setMyStars(prev => prev - selectedStar);

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

)}



{showSharePopup && (

<View style={styles.sharePopupContainer}>

 <Pressable
  style={StyleSheet.absoluteFill}
  onPress={() => setShowSharePopup(false)}
/>

  <View style={styles.sharePopup}>

    <View style={styles.actionRow}>

      {/* Report */}
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


      {/* Save */}
      <TouchableOpacity
        style={styles.saveBtn}
        onPress={() => {

          setShowSharePopup(false);

          // Save Video Logic

        }}
      >
        <Text style={styles.saveText}>
          Video Save
        </Text>
      </TouchableOpacity>

    </View>


    {/* Share */}
<View style={styles.shareRow}>

  {/* Share Video Button */}
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

)}



{showComments && (

<View
  style={{
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 9999,
  }}
>

  {/* Background press */}
  <Pressable
    style={StyleSheet.absoluteFill}

   onPress={() => {

Animated.timing(commentAnim,{
toValue:height,
duration:200,
useNativeDriver:true
}).start(()=>{

setShowComments(false);

setSelectedVideoId(null);

setComments([]);

setReplies({});

setCommentsLoading(false);

});

}}
  />

  {/* Bottom Sheet */}
  <Animated.View
style={[
styles.commentsSheet,
{
transform:[
{
translateY:commentAnim
}
]
}
]}
>

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
  size={17}
  color={
  selectedVideoData?.verifiedColor === "yellow"
    ? "#FFD700"
    : "#ffffff"
}
/>

  

</View>

)}

   
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



{
commentsLoading ? (

<View
style={{
flex:1,
justifyContent:"center",
alignItems:"center",
marginTop:20,
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
      removeClippedSubviews={false}

initialNumToRender={10}

maxToRenderPerBatch={8}

windowSize={8}

keyboardDismissMode="interactive"

keyboardShouldPersistTaps="handled"
      keyExtractor={(item) => item.id}
  style={{ flex: 1, marginTop: 20 }}
  contentContainerStyle={{
    paddingBottom: 80, // input box ke liye space
  }}



  showsVerticalScrollIndicator={false}
  keyboardShouldPersistTaps="handled"

      renderItem={({ item }) => (

     <View
  style={{
    flexDirection: 'row',
    paddingHorizontal: 15,
    marginBottom: 15,
    alignItems: 'flex-start',
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
  size={17}
  color={
    item?.verifiedColor === "yellow"
      ? "#FFD700"
      : "#ffffff"
  }
/>

  
</View>
)}


</View>


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

<View
  style={{
    flexDirection: "row",
    marginTop: 8,
  }}
>

  <TouchableOpacity
    onPress={() => {

  setReplyingTo({
    id: item.id,
    username: item.username,
  });

  setReplyText("");

  setTimeout(() => {
    commentInputRef.current?.focus();
  }, 100);

}}
  >

    <Text
      style={{
        color: "#999",
        fontSize: 13,
        fontWeight: "600",
      }}
    >
      Reply
    </Text>

  </TouchableOpacity>

</View>



{
  replies[item.id]?.length > 0 && (

    <TouchableOpacity
      onPress={() => {

        setExpandedReplies(prev => ({
          ...prev,
          [item.id]: !prev[item.id],
        }));

      }}

      style={{
        marginTop: 8,
        marginLeft: 15,
      }}
    >

      <Text
        style={{
          color: "#999",
          fontSize: 13,
          fontWeight: "600",
        }}
      >

        {
          expandedReplies[item.id]
            ? "Hide replies"
            : `View ${replies[item.id].length} ${
                replies[item.id].length === 1
                  ? "reply"
                  : "replies"
              }`
        }

      </Text>

    </TouchableOpacity>

  )
}



{
  replies[item.id]?.length > 0 &&
expandedReplies[item.id] && (

    <View
      style={{
        marginTop: 10,
        marginLeft: 15,
        borderLeftWidth: 1,
        borderLeftColor: "#333",
        paddingLeft: 12,
      }}
    >

      {replies[item.id].map((reply) => (

        <View
          key={reply.id}
          style={{
            flexDirection: "row",
            marginBottom: 12,
            alignItems: "flex-start",
          }}
        >

          <Image
            source={{ uri: reply.profilePic }}
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
                  fontSize: 13,
                }}
              >
                {reply.username}
              </Text>

              {reply.verified && (

                <MaterialCommunityIcons
                  name="check-decagram"
                  size={15}
                  color={
                    reply.verifiedColor === "yellow"
                      ? "#FFD700"
                      : "#ffffff"
                  }
                  style={{ marginLeft: 5 }}
                />

              )}

            </View>

            <Text
              style={{
                color: "#fff",
                marginTop: 2,
              }}
            >
              {reply.text}
            </Text>

            <Text
              style={{
                color: "#888",
                fontSize: 11,
                marginTop: 3,
              }}
            >
              {getTimeAgo(reply.createdAt)}
            </Text>


          </View>

{
auth.currentUser?.uid === reply.userId && (

<TouchableOpacity

onPress={()=>deleteReply(
item.id,
reply.id
)}

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

      ))}

    </View>

  )
}


          </View>


{auth.currentUser?.uid === item.userId && (

    <TouchableOpacity
      onPress={() =>
        deleteComment(item.id)
      }
      style={{
        paddingLeft: 10,
        paddingTop: 5,
      }}
    >
      <Ionicons
        name="ellipsis-vertical"
        size={20}
        color="#fff"
      />
    </TouchableOpacity>

  )}


        </View>

      )}
    />

)}

    <Animated.View
style={[
styles.commentInputContainer,
{

transform:[
{
translateY:Animated.multiply(keyboardHeight,-1)
}
]


}
]}
>






      <Image
        source={{ uri: currentUserData.photo }}
        style={styles.commentProfile}
      />

    <TextInput
    ref={commentInputRef}
  value={commentText}
  onChangeText={setCommentText}
  placeholder={
  replyingTo
    ? `Reply to @${replyingTo.username}`
    : `Comment as ${currentUserData.name}...`
}
  placeholderTextColor="#999"
  style={styles.commentInput}

  // Keyboard ke send button ko enable karega
  returnKeyType="send"

  // Keyboard khula rahega
  blurOnSubmit={false}

  // Keyboard ka send button dabane par
  onSubmitEditing={() => {
    if (commentText.trim()) {
      postComment();
    }
  }}
/>

      <TouchableOpacity onPress={postComment}>
        <Ionicons
          name="send"
          size={24}
          color="#FFD700"
        />
      </TouchableOpacity>

</Animated.View>


    </Animated.View>

  

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
  video: {
  width: '100%',
  height: '90%',
},
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.1)' },

  bottomLeft:  {
  position: 'absolute',

  left: 12,

  bottom: 110,      // niche se kitna upar

  width: width * 0.7,

  zIndex: 999,
},


  userName: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 2 },
  caption: { color: '#ffffff', fontSize: 14, marginTop: 5, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 1 },




musicRow:{
flexDirection:"row",
alignItems:"center",
marginTop:10,
},

musicDiscOuter:{
marginRight:10,
},

vinylDisc:{
width:37,
height:37,
borderRadius:19,
backgroundColor:"#111",
justifyContent:"center",
alignItems:"center",

borderWidth:2,
borderColor:"#444",

shadowColor:"#000",
shadowOpacity:0.6,
shadowRadius:8,
shadowOffset:{
width:0,
height:4,
},

elevation:8,
},

musicCenterImage:{
width:26,
height:26,
borderRadius:13,
},

musicDot:{
position:"absolute",
width:2,
height:2,
borderRadius:3,
backgroundColor:"#fff",
},


  rightIcons:  {
  position: 'absolute',

  right: -10,

  bottom: 120,   // video ke niche se kitna upar

  alignItems: 'center',

  zIndex: 999,
},


  iconBox: { marginBottom: 8, alignItems: 'center' },
  iconText: { color: '#ffffff', fontWeight: 'bold', marginTop: 4, fontSize: 12 },
  profileImage: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: '#ffffff' },

 plusIconSmall:{

position:'absolute',

bottom:-6,

alignSelf:'center',

backgroundColor:'#FFD700',

width:20,

height:20,

borderRadius:8,

justifyContent:'center',

alignItems:'center',

zIndex:9999,

},

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

commentsSheet:{

width:'100%',

height:height*0.70,

backgroundColor:'#000',

borderTopLeftRadius:25,

borderTopRightRadius:25,
overflow:'hidden',
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
  transform: [{ scale: 1.2 }],
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
  height: 290,

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
  marginTop: -23,
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

myStarBox: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 20,
   top: -10,
  left: 0,
},

myStarImage: {
  width: 45,
  height: 45,
  resizeMode: 'contain',
},

myStarText: {
  color: '#FFD700',
  fontSize: 24,
  fontWeight: 'bold',
  marginLeft: -5,
},

sharePopupContainer: {
position: 'absolute',
left: 0,
right: 0,
bottom: 40,
height: height,
backgroundColor: 'rgba(0,0,0,0.5)',
justifyContent: 'flex-end',
zIndex: 9999,
},

sharePopup: {
backgroundColor: '#111',
borderTopLeftRadius: 20,
borderTopRightRadius: 20,
padding: 30,
},



shareBtn:{
  backgroundColor:'#FFD700',

  width:230,          // button ki lambai
  height:45,          // button ki unchai

  borderRadius:20,

  justifyContent:'center',
  alignItems:'center',

  marginLeft:5,      // left-right move
  marginRight:0,

  marginTop:0,        // upar-niche move
  marginBottom:0,
},

shareText: {
color: '#000',
fontWeight: 'bold',
fontSize: 18,
textAlign: 'center',
},


actionRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  marginBottom: 15,
},

reportBtn: {
  backgroundColor: '#ff3333',
  width: '48%',
  paddingVertical: 10,
  borderRadius: 12,
},

saveBtn: {
  backgroundColor: '#3498db',
  width: '48%',
  paddingVertical: 10,
  borderRadius: 12,
},

reportText: {
  color: '#fff',
  fontWeight: 'bold',
  textAlign: 'center',
  fontSize: 14,
},

saveText: {
  color: '#fff',
  fontWeight: 'bold',
  textAlign: 'center',
  fontSize: 14,
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
  borderRadius:45,      // gola banayega
  overflow:'hidden',    // image ko circle ke andar rakhega
  justifyContent:'center',
  alignItems:'center',
  backgroundColor:'#000',
},

shareLogo:{
  width:100,
  height:100,
  borderRadius:25,     // image ko gol karega
  resizeMode:'cover',  // poora circle fill karega
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

musicTextContainer:{
flex:1,
overflow:"hidden",
},

musicText:{
color:"#fff",
fontSize:13,
fontWeight:"600",
width:400,
},


});   