  import React, { useEffect, useState, useRef } from 'react';

  import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Image,
  ScrollView,
  Dimensions,
  TextInput,
  Modal,
  Platform,
  StatusBar,
  BackHandler,
   FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Animated,
  PermissionsAndroid,
  Easing as RNEasing,
  Share,
} from "react-native";


import ReAnimated,{
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { useLocalSearchParams, useRouter, useFocusEffect,  } from 'expo-router';
import { useLive } from '../context/LiveContext';

import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';

import {
  doc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  updateDoc,
  deleteDoc,
  getDoc,
  increment,
  setDoc,
  deleteField,
  addDoc,
serverTimestamp,
} from 'firebase/firestore';

import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  AudioProfileType,
  AudioScenarioType,
} from "react-native-agora";

import { gifts } from "../assets/giftsData";

import LottieView from "lottie-react-native";

import { useSafeAreaInsets } from 'react-native-safe-area-context';

// import LottieView from "lottie-react-native";
// import { gifts } from "../assets/giftsData";

const { width, height } = Dimensions.get('window');
const STABLE_AVATAR = 'https://avatar.iran.liara.run/public/65';

// Firebase safety check
let db = null;
let auth = null;
try {
  const firebaseModule = require('./firebaseConfig');
  db = firebaseModule.db;
  auth = firebaseModule.auth;
} catch (e) {
  console.log("Firebase config not found.");
}


const getLevelTheme = (level = 1) => {

  if(level>=50){
    return{
      bg:"#7B1FFF",
      border:"#FFD700",
      text:"#fff",
      icon:"#FFD700"
    };
  }

  if(level>=40){
    return{
      bg:"#00BFFF",
      border:"#9EF8FF",
      text:"#fff",
      icon:"#fff"
    };
  }

  if(level>=30){
    return{
      bg:"#FF0066",
      border:"#FFB6C1",
      text:"#fff",
      icon:"#fff"
    };
  }

  if(level>=20){
    return{
      bg:"#FFC107",
      border:"#FFE082",
      text:"#000",
      icon:"#fff"
    };
  }

  if(level>=10){
    return{
      bg:"#BDBDBD",
      border:"#fff",
      text:"#fff",
      icon:"#fff"
    };
  }

  return{
    bg:"#222",
    border:"#555",
    text:"#FFD700",
    icon:"#00E5FF"
  };

};




const getLevelFrame=(level=1)=>{

if(level>=50){
return require("../assets/frames/lv50.png");
}

if(level>=40){
return require("../assets/frames/lv40.png");
}

if(level>=30){
return require("../assets/frames/lv30.png");
}

if(level>=20){
return require("../assets/frames/lv20.png");
}

if(level>=10){
return require("../assets/frames/lv10.png");
}

return null;

};



const AvatarWithFrame = ({ uri, level, size = 70 }) => {
  return (
    <View
      style={{
        width: size + 20,
        height: size + 20,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Image
        source={{ uri: uri || STABLE_AVATAR }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          zIndex: 1,
        }}
      />

      {level >= 10 && (
        <ReAnimated.Image
          source={getLevelFrame(level)}
          style={{
            position: "absolute",
            width: size + 20,
            height: size + 20,
            resizeMode: "contain",
            zIndex: 10,
          }}
        />
      )}
    </View>
  );
};


export default function LiveRoom() {
const insets = useSafeAreaInsets();

const {
  startLive,
  stopLive,
  currentLive,
} = useLive();


const glow=useSharedValue(1);

useEffect(()=>{

glow.value=withRepeat(

withTiming(
1.15,
{
duration:1800,
easing:Easing.inOut(
Easing.ease
)
}
),

-1,
true

);

},[]);

const frameAnimation=
useAnimatedStyle(()=>{

return{

transform:[
{
scale:glow.value
}
],

opacity:glow.value

};

});


  const params = useLocalSearchParams();
const from = params?.from;

  const resumeAudio = params?.resumeAudio;
  const router = useRouter();
  const roomId = params?.id ? String(params.id) : null;

  const [roomData, setRoomData] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState('listener'); 
  const [loading, setLoading] = useState(true);
  const [chatMessage, setChatMessage] = useState('');
  const [controlModalVisible, setControlModalVisible] = useState(false);
const [raiseHandLoading, setRaiseHandLoading] = useState(false);
const [requestModalVisible, setRequestModalVisible] = useState(false);

const [giftModalVisible, setGiftModalVisible] = useState(false);

const giftModalAnim = useRef(
new Animated.Value(400)
).current;


const [speakerModalVisible, setSpeakerModalVisible] = useState(false);

const [selectedSeatKey, setSelectedSeatKey] = useState(null);

const [shareModalVisible, setShareModalVisible] = useState(false);

const [selectedSpeaker, setSelectedSpeaker] = useState(null);

const [selfSeatModalVisible, setSelfSeatModalVisible] = useState(false);

const [selfMuted, setSelfMuted] = useState(false);

const [profileVisible, setProfileVisible] = useState(false);


const [hostLevel,setHostLevel]=useState(1);

const [hostVerifiedColor, setHostVerifiedColor] = useState("white");

const [hostVerified,setHostVerified]=useState(false);


const [friendShareVisible, setFriendShareVisible] = useState(false);

const [friends, setFriends] = useState([]);

const [selectedFriends, setSelectedFriends] = useState([]);



const [profileUser, setProfileUser] = useState(null);

const [activeGift, setActiveGift] = useState(null);

const lastGiftRef = useRef(null);

const giftTimeoutRef = useRef(null);

const [giftCombo, setGiftCombo] = useState(null);

const comboTimeoutRef = useRef(null);


const [selectedGiftUser, setSelectedGiftUser] = useState(null);

const [stars, setStars] = useState(0);



const [myStars,setMyStars] = useState(0);

const [roomTimer, setRoomTimer] = useState("00:00");


const [keyboardHeight, setKeyboardHeight] = useState(0);

const [roomStartTime, setRoomStartTime] = useState(null);

  const isJoinedRef = useRef(false);

const agoraEngineRef = useRef(null);

const [joined,setJoined]=useState(false);

const [remoteUsers,setRemoteUsers]=useState([]);

const [mutedUsers,setMutedUsers]=useState([]);

const [activeSpeakers, setActiveSpeakers] = useState({});

const [myAgoraUid, setMyAgoraUid] = useState(null);

const currentUid = auth?.currentUser?.uid;




const pulseAnim = useRef(new Animated.Value(1)).current;


const giftGlow = useRef(new Animated.Value(0.6)).current;

const giftTranslateX = useRef(new Animated.Value(-80)).current;

const giftScale = useRef(new Animated.Value(1)).current;

const giftShake = useRef(new Animated.Value(0)).current;

const giftOpacity = useRef(
  new Animated.Value(0)
).current;

const chatScrollRef = useRef(null);


useEffect(() => {

  if (!roomData?.chats?.length) return;

  requestAnimationFrame(() => {
    chatScrollRef.current?.scrollToEnd({
      animated: false,
    });
  });

}, [roomData?.chats?.length]);



const [currentName, setCurrentName] = useState("User");
const [currentAvatar, setCurrentAvatar] = useState(STABLE_AVATAR);
const [currentRealName, setCurrentRealName] = useState("User");

useEffect(() => {

if(!db || !currentUid) return;

const walletRef = doc(
db,
"wallets",
currentUid
);

const unsub = onSnapshot(
walletRef,
(snap)=>{

if(snap.exists()){

setStars(
snap.data()?.stars || 0
);

}

}
);

return ()=>unsub();

},[currentUid]);


useEffect(() => {

if (
resumeAudio &&
agoraEngineRef.current
){

agoraEngineRef.current.muteAllRemoteAudioStreams(false);

}

},[resumeAudio]);


useEffect(() => {
  if (!auth?.currentUser) {
    router.replace('/login');
  }
}, []);

useEffect(() => {

const loadUser = async () => {

if (!db || !currentUid) return;

try {

const userRef = doc(db, "users", currentUid);

const snap = await getDoc(userRef);

const walletRef = doc(db,"wallets",currentUid);

const walletSnap = await getDoc(walletRef);



if (snap.exists()) {

const data = snap.data();

 setHostVerified(data.verified || false);
setHostVerifiedColor(
  data.verifiedColor || "white"
);


setCurrentName(
  data.username ||
  data.name ||
  auth?.currentUser?.displayName ||
  "User"
);

const realName =
  data.name ||
  auth?.currentUser?.displayName ||
  "User";

setCurrentRealName(realName);

setCurrentAvatar(
data.profileImg ||
data.photoURL ||
auth?.currentUser?.photoURL ||
STABLE_AVATAR
);


if (walletSnap.exists()) {

  setHostLevel(
    walletSnap.data().level || 1
  );

}

console.log("Avatar =", data.profileImg);
console.log("Username =", data.username);
console.log("Real Name =", data.name);



}

} catch (e) {
console.log(e);
}

};

loadUser();

}, []);






useEffect(() => {

  const show = Keyboard.addListener(
    "keyboardDidShow",
    (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    }
  );

  const hide = Keyboard.addListener(
    "keyboardDidHide",
    () => {
      setKeyboardHeight(0);
    }
  );

  return () => {
    show.remove();
    hide.remove();
  };

}, []);





useEffect(()=>{

if(giftModalVisible){

giftModalAnim.setValue(400);

Animated.spring(
giftModalAnim,
{
toValue:0,
speed:18,
bounciness:4,
useNativeDriver:true,
}
).start();

}

},[giftModalVisible]);




useEffect(() => {

  if (!db || !currentUid) return;

  const loadFriends = async () => {

    const q = query(
      collection(db, "follows"),
      where("followerId", "==", currentUid)
    );

    const followSnap = await getDocs(q);

    let list = [];

    for (const followDoc of followSnap.docs) {

      const followingId = followDoc.data().followingId;

      const userSnap = await getDoc(
        doc(db, "users", followingId)
      );

      if (userSnap.exists()) {

    const walletSnap = await getDoc(
  doc(db, "wallets", followingId)
);

list.push({
  id: userSnap.id,
  ...userSnap.data(),

  verified:
    userSnap.data()?.verified || false,

verifiedColor:
  userSnap.data()?.verifiedColor || "white",

  level:
    walletSnap.exists()
      ? walletSnap.data()?.level || 1
      : 1,
});

      }

    }

    setFriends(list);

  };

  loadFriends();

}, [currentUid]);




useEffect(()=>{

if(!db || !currentUid) return;

const walletRef = doc(
db,
"wallets",
currentUid
);

const unsub = onSnapshot(
walletRef,
(snapshot)=>{

if(snapshot.exists()){

setMyStars(
snapshot.data()?.stars || 0
);

}

}
);

return ()=>unsub();

},[currentUid]);




useEffect(() => {

const speakingNow =
Object.keys(activeSpeakers).length > 0;

if (speakingNow) {

Animated.loop(

Animated.sequence([

Animated.timing(pulseAnim,{
toValue:1.3,
duration:400,
useNativeDriver:true
}),

Animated.timing(pulseAnim,{
toValue:1,
duration:400,
useNativeDriver:true
})

])

).start();

}
else{

pulseAnim.stopAnimation();

pulseAnim.setValue(1);

}

},[activeSpeakers]);


  // --- BackHandler Subscription Fix ---
 useEffect(() => {

  const backAction = () => {

    // Sirf host ko popup
    if (currentUserRole === "host") {

      setControlModalVisible(true);
      return true;

    }

    // baki sab direct exit
    cleanAndExit();

    return true;
  };

  const subscription =
    BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

  return () => subscription.remove();

}, [currentUserRole, roomData]);





useEffect(() => {

  if (!requestModalVisible) return;

  const backAction = () => {

    setRequestModalVisible(false);

    return true;
  };

  const subscription = BackHandler.addEventListener(
    "hardwareBackPress",
    backAction
  );

  return () => subscription.remove();

}, [requestModalVisible]);


  useEffect(() => {

if (
 !db ||
 !roomId ||
 !currentUid ||
 currentName === "User" ||
 currentRealName === "User" ||
 !currentAvatar
){
 return;
}

const roomRef = doc(db,'rooms',roomId);

const joinRoom = async () => {

if (!auth?.currentUser) return;

      if (isJoinedRef.current) return;
      isJoinedRef.current = true;
      try {
        const roomSnap = await getDoc(roomRef);

const userSnap = await getDoc(
  doc(db, "users", currentUid)
);

const userData = userSnap.exists()
  ? userSnap.data()
  : {};

const walletSnap = await getDoc(
  doc(db, "wallets", currentUid)
);

const walletData = walletSnap.exists()
  ? walletSnap.data()
  : {};

const currentLevel = walletData.level || 1;


        if (!roomSnap.exists()) {
          router.replace('/'); // Path updated to root
          return;
        }

const data = roomSnap.data();

if (
  data?.roomLocked &&
  data?.hostId !== currentUid
) {
  alert("Room Locked");
  router.back();
  return;
}

        const updates = {};
updates[`audienceList.${currentUid}`] = {
  uid: currentUid,

  name: currentRealName,      // Real Name
  username: currentName,      // Username
  img: currentAvatar,
  level: currentLevel,
verified: userData.verified || false,
verifiedColor:
  userData.verifiedColor || "#ffffff",
  joinedAt: Date.now(),
  online: true
};



if (data?.hostId === currentUid) {

 updates['seatsData.seat_1'] = {
 userId: currentUid,
 userName: currentName,
 realName: currentRealName,
 userImg: currentAvatar || STABLE_AVATAR,
level: hostLevel,

verified: userData.verified || false,

verifiedColor:
userData.verifiedColor || "white",

 isMuted:false,
 roleTag:'HOST'
};

}


   if (data?.hostId === currentUid)
  


console.log("Joining Room...");
console.log("UID =", currentUid);
console.log("Name =", currentName);
console.log("Avatar =", currentAvatar);
         
        await updateDoc(roomRef, updates);

        console.log("Audience Added =", updates);

const roomSnap2 = await getDoc(roomRef);

if(roomSnap2.exists()){

const roomData2 = roomSnap2.data();

const joinMsg = {
id: Date.now().toString(),
type: "join",
senderName: currentRealName,
username: currentName,
userImg: currentAvatar,
 verified: userData.verified || false,
 verifiedColor:
userData.verifiedColor || "white",
  level: hostLevel,
};

const updatedChats = [
...(roomData2.chats || []),
joinMsg
].slice(-50);

await updateDoc(roomRef,{
chats: updatedChats
});

}



      } catch (e) { console.log(e); }
    };
    
    joinRoom();
  

    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();



        setRoomData(data);
        setLoading(false);

startLive({
  roomId: roomId,
  roomName:
    data?.roomName ||
    data?.name ||
    "Live Room",

  hostName:
    data?.seatsData?.seat_1?.userName ||
    "Host",

  hostAvatar:
    data?.seatsData?.seat_1?.userImg ||
    STABLE_AVATAR,
});




if (data.createdAt) {

let startTime = null;

if (typeof data.createdAt === "number") {
  startTime = data.createdAt;
}
else if (data.createdAt?.toMillis) {
  startTime = data.createdAt.toMillis();
}
else if (data.createdAt?.seconds) {
  startTime = data.createdAt.seconds * 1000;
}

if (startTime) {
  setRoomStartTime(startTime);
}

}



        const seats = data.seatsData || {};


// Current user ki seat dhundo
let mySeat = null;

Object.entries(seats).forEach(([key, seat]) => {
  if (seat?.userId === currentUid) {
    mySeat = seat;
  }
});


        let onPod = false;
Object.entries(seats).forEach(([key,s])=>{
if(
key!=="seat_1" &&
s?.userId===currentUid
){
onPod=true;
}
});
     

if(
mySeat &&
agoraEngineRef.current &&
currentUserRole==="listener"
){

setCurrentUserRole("speaker");

agoraEngineRef.current.setClientRole(
ClientRoleType.ClientRoleBroadcaster
);

agoraEngineRef.current.enableLocalAudio(true);

agoraEngineRef.current.muteLocalAudioStream(false);

}



        setCurrentUserRole(seats.seat_1?.userId === currentUid ? 'host' : (onPod ? 'speaker' : 'listener'));

if (!agoraEngineRef.current) {

let role = "listener";

if (seats.seat_1?.userId === currentUid) {
role = "host";
}
else if (onPod) {
role = "speaker";
}

setTimeout(() => {
initAgora(role);
},500);

}


// Agar speaker seat se remove ho gaya hai
// Agar host ne speaker ko remove kar diya hai
if (
  !onPod &&
  currentUserRole === "speaker" &&
  agoraEngineRef.current
) {

  setCurrentUserRole("listener");

  agoraEngineRef.current.setClientRole(
    ClientRoleType.ClientRoleAudience
  );

  agoraEngineRef.current.enableLocalAudio(false);

  agoraEngineRef.current.muteLocalAudioStream(true);

 agoraEngineRef.current.leaveChannel();

setJoined(false);

setRemoteUsers([]);

setTimeout(() => {

  initAgora("listener");

},500);


}



// Agar current user speaker hai aur host ne mute kiya hai
if (
  mySeat &&
  mySeat.userId === currentUid &&
  agoraEngineRef.current
) {

  if (mySeat.isMuted) {

    agoraEngineRef.current.muteLocalAudioStream(true);

  } else {

    agoraEngineRef.current.muteLocalAudioStream(false);

  }

}



      } else {
        router.replace('/'); // Path updated to root
      }
    });

    return () => unsubscribe();

  }, [
  roomId,
  currentUid,
  currentName,
  currentRealName,
  currentAvatar,
  hostLevel,
]);




useEffect(() => {

if (!roomData?.liveGift) return;

const gift = roomData.liveGift;


const now = Date.now();

if (
    lastGiftRef.current &&
    lastGiftRef.current.senderId === gift.senderId &&
    lastGiftRef.current.giftId === gift.giftId &&
    now - lastGiftRef.current.time < 3000
) {

 setGiftCombo({
senderName: gift.senderName,
giftName: gift.giftName,
count: gift.comboCount || 1
});

} else {

   
  setGiftCombo({
senderName: gift.senderName,
giftName: gift.giftName,
count: gift.comboCount || 1
});


}

lastGiftRef.current = {
    senderId: gift.senderId,
    giftId: gift.giftId,
    time: now
};



// Purana timer band karo
if (comboTimeoutRef.current) {
  clearTimeout(comboTimeoutRef.current);
}

// Har gift ke baad banner kam se kam 3 sec dikhe
comboTimeoutRef.current = setTimeout(() => {
  setGiftCombo(null);
  lastGiftRef.current = null;
  global.giftComboCount = 0;
}, 2200);





console.log(
"Firebase Gift =",
gift
);

const giftData = gifts.find(
g =>
String(g.id) ===
String(gift.giftId)
);

console.log(
"Gift Data =",
giftData
);

if (!giftData) return;

if (!giftData.animation) return;



// Purana timer band karo
if (giftTimeoutRef.current) {

clearTimeout(
giftTimeoutRef.current
);

}



// Animation start
setActiveGift(
giftData.animation
);



// Duration ke baad band
giftTimeoutRef.current =
setTimeout(() => {

setActiveGift(null);

},
giftData.duration || 5000);

},
[
roomData?.liveGift?.timestamp
]);







useEffect(() => {
  if (!giftCombo) return;

  giftTranslateX.setValue(-80);
  giftScale.setValue(0.8);
  giftGlow.setValue(0.3);
  giftShake.setValue(-1);
giftOpacity.setValue(0);


  Animated.parallel([
    Animated.spring(giftTranslateX, {
  toValue: 0,
  speed: 12,
  bounciness: 6,
  useNativeDriver: true,
}),

Animated.spring(giftScale, {
  toValue: 1,
  speed: 12,
  bounciness: 6,
  useNativeDriver: true,
}),

Animated.timing(giftOpacity,{
  toValue:1,
  duration:250,
  useNativeDriver:true,
}),

    Animated.sequence([
      Animated.timing(giftShake, {
        toValue: 1,
        duration: 60,
        useNativeDriver: false,
      }),
      Animated.timing(giftShake, {
        toValue: -1,
        duration: 60,
        useNativeDriver: false,
      }),
      Animated.timing(giftShake, {
        toValue: 0,
        duration: 60,
        useNativeDriver: false,
      }),
    ]),
  ]).start();
}, [giftCombo]);





useEffect(() => {

if (!roomStartTime) return;

const interval = setInterval(() => {

const diff = Date.now() - roomStartTime;

const hrs = Math.floor(diff / 3600000);
const mins = Math.floor((diff % 3600000) / 60000);
const secs = Math.floor((diff % 60000) / 1000);

setRoomTimer(
`${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`
);

},1000);

return ()=>clearInterval(interval);

},[roomStartTime]);


  // --- CLEAN & EXIT: Direct Fix for Navigation ---
  const cleanAndExit = async () => {
    setControlModalVisible(false);

    if(agoraEngineRef.current){

await agoraEngineRef.current.leaveChannel();

agoraEngineRef.current.release();

agoraEngineRef.current = null;

}
    

const endLiveRoom = async () => {

  try {

    if (agoraEngineRef.current) {

      await agoraEngineRef.current.leaveChannel();

      agoraEngineRef.current.release();

      agoraEngineRef.current = null;
    }

    await deleteDoc(
      doc(db, "rooms", roomId)
    );

    router.back();

  } catch (e) {

    console.log(e);

  }

};

    // Pehle navigate karein taaki user ko wait na karna pade
   if (from === "all-live") {

  router.replace("/all-live");

} else {

  router.back();

}

    try {
      if (db && roomId) {
        const roomRef = doc(db, 'rooms', roomId);




if (currentUserRole === "host") {

  // Sirf host hi live band kare
  await deleteDoc(roomRef);

} else {

  const updates = {};

  updates[`audienceList.${currentUid}`] = null;
 

  if (roomData?.seatsData) {

    Object.keys(roomData.seatsData).forEach(key => {

      if (
        key !== "seat_1" &&
        roomData.seatsData[key]?.userId === currentUid
      ) {

        updates[`seatsData.${key}`] = {
          userId: null,
          userName: "Open",
          userImg: STABLE_AVATAR,
          isMuted: false
        };

      }

    });

  }

  await updateDoc(roomRef, updates);

}


       const updates = {};

updates[
`audienceList.${currentUid}`
] = deleteField();



// Agar speaker seat par tha to seat khali karo
if (roomData?.seatsData) {

  Object.keys(roomData.seatsData).forEach(key => {

    if (
      key !== "seat_1" &&
      roomData.seatsData[key]?.userId === currentUid
    ) {

      updates[`seatsData.${key}`] = {
        userId: null,
        userName: "Open",
        userImg: STABLE_AVATAR,
        isMuted: false
      };

    }

  });

}

await updateDoc(roomRef, updates);


      }
    } catch (e) { 
      console.log("Exit Process Error:", e);
    }
  };


const sendSeatRequest = async (seatKey) => {

try {

const roomRef = doc(db,"rooms",roomId);

await updateDoc(roomRef,{

[`speakerRequests.${currentUid}`]:{

uid:currentUid,

name:currentName,

realName:currentRealName,

img:currentAvatar,

verified: hostVerified,
verifiedColor:
hostVerifiedColor,

level: hostLevel,

seatKey:seatKey,

status:"pending",

requestedAt:Date.now()

}

});

alert("Request Sent");

}catch(e){

console.log(e);

}

};




  const handleSeatJoin = async (seatKey) => {
  try {

    if (currentUserRole !== 'listener') {
      return;
    }

    const roomRef = doc(db, 'rooms', roomId);

 



await agoraEngineRef.current.setClientRole(
ClientRoleType.ClientRoleBroadcaster
);

await agoraEngineRef.current.enableLocalAudio(true);
await agoraEngineRef.current.muteLocalAudioStream(false);
await agoraEngineRef.current.setEnableSpeakerphone(true);

setCurrentUserRole("speaker");


  } catch (error) {
    console.log(error);
  }
};




const handleRaiseHand = async () => {
  try {

    setRaiseHandLoading(true);

    const roomRef = doc(db, 'rooms', roomId);

   await updateDoc(roomRef, {
  [`speakerRequests.${currentUid}`]: {
    uid: currentUid,
    name: currentName,
    realName: currentRealName,
    img: currentAvatar,
    seatKey: null,
    status: "pending",
    requestedAt: Date.now()
  }
});

    alert('Request Sent To Host');

  } catch (e) {
    console.log(e);
  }

  setRaiseHandLoading(false);
};



const initAgora = async (userRole) => {

if (Platform.OS === "android") {

await PermissionsAndroid.requestMultiple([
PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
PermissionsAndroid.PERMISSIONS.CAMERA,
]);

}


const engine = createAgoraRtcEngine();

engine.initialize({
appId:'4e23c17b272f4a1c920c214be58486f4'
});


await engine.setAudioProfile(
  AudioProfileType.AudioProfileSpeechStandard,
  AudioScenarioType.AudioScenarioChatroom
);

await engine.setParameters(
  JSON.stringify({
    "che.audio.ans.enable": true,
    "che.audio.agc.enable": true,
    "che.audio.aec.enable": true
  })
);


engine.registerEventHandler({

onJoinChannelSuccess:(connection,uid)=>{

console.log("JOIN SUCCESS",uid);

setJoined(true);

},

onUserJoined:(connection,uid)=>{

console.log("REMOTE USER JOINED",uid);

console.log("Joined:",uid);

setRemoteUsers(prev=>{
if(prev.includes(uid)) return prev;
return [...prev,uid];
});

},


onUserOffline:(connection,uid)=>{
console.log("Left:",uid);

setRemoteUsers(prev=>
prev.filter(id=>id!==uid)
);

},

onRemoteAudioStateChanged:(connection,uid,state,reason)=>{

console.log(
"REMOTE AUDIO",
uid,
state,
reason
);

},


onAudioVolumeIndication: (
connection,
speakers,
speakerNumber,
totalVolume
) => {

let speakingMap = {};

speakers.forEach(item => {

if(item.volume > 10){

speakingMap[item.uid] = true;

}

});

setActiveSpeakers(speakingMap);

},


onLocalAudioStateChanged:(connection,state,error)=>{

console.log("LOCAL AUDIO =",state);

},

onConnectionStateChanged:(state,reason)=>{

console.log("CONNECTION =",state);

},


onError:(err)=>{
console.log("Agora Error:",err);
}

});



await engine.enableAudio();
await engine.enableLocalAudio(true);
await engine.setEnableSpeakerphone(true);

engine.enableAudioVolumeIndication(
200,
1,
true
);

await engine.setDefaultAudioRouteToSpeakerphone(true);



const role =
userRole === "listener"
?
ClientRoleType.ClientRoleAudience
:
ClientRoleType.ClientRoleBroadcaster;

const numericUid = currentUid
  ? currentUid.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  : Math.floor(Math.random() * 1000000);



const agoraUid = numericUid % 1000000;

setMyAgoraUid(agoraUid);





await engine.setClientRole(role);

if(role===ClientRoleType.ClientRoleAudience){

await engine.enableLocalAudio(false);
await engine.muteLocalAudioStream(true);

}else{

await engine.enableLocalAudio(true);
await engine.muteLocalAudioStream(false);

}

const response = await fetch(
`https://topking-backend.onrender.com/token?channel=${roomId}&uid=${agoraUid}`
);

const data = await response.json();



const token = data.token;
console.log("TOKEN =", token);
console.log("TOKEN RESPONSE =", data);


console.log("TOKEN =", token);
console.log("ROOM =", roomId);
console.log("UID =", agoraUid);


await engine.joinChannel(
token,
roomId,
agoraUid,
{
channelProfile:
ChannelProfileType.ChannelProfileLiveBroadcasting,

clientRoleType: role
}
);

await engine.setEnableSpeakerphone(true);

if(role===ClientRoleType.ClientRoleBroadcaster){

await engine.enableLocalAudio(true);

await engine.muteLocalAudioStream(false);

}


console.log("JOIN SUCCESS CALL");

console.log("JOIN CALLED");


agoraEngineRef.current=engine;

};


  const handleSendChat = async () => {
    if (!chatMessage.trim()) return;
    try {
      const roomRef = doc(db, 'rooms', roomId);

      const newChat = {
id: Date.now().toString(),

senderName: currentRealName,
username: currentName,

message: chatMessage,
userImg: currentAvatar,
  verified: hostVerified,
verifiedColor:
  hostVerifiedColor || "white",

  level: hostLevel,
};

      const updatedChats = [...(roomData.chats || []), newChat].slice(-30);
      Keyboard.dismiss();
      setChatMessage('');
      await updateDoc(roomRef, { chats: updatedChats });
    } catch (e) { console.log(e); }
  };


const handleShare = async () => {
  try {

    const shareLink = `https://topking.app/live/${roomId}`;

    await Share.share({
      message: `🎙 Join my Live Room\n${shareLink}`,
    });

setShareModalVisible(false);

  } catch (e) {
    console.log(e);
  }
};




const toggleFriend=(id)=>{

if(selectedFriends.includes(id)){

setSelectedFriends(

selectedFriends.filter(x=>x!==id)

);

}else{

setSelectedFriends([

...selectedFriends,

id

]);

}

};



const sendInvite = async () => {
  try {

    for (const uid of selectedFriends) {

      const chatId =
        currentUid < uid
          ? `${currentUid}_${uid}`
          : `${uid}_${currentUid}`;

      // Chat message
      await addDoc(
        collection(
          db,
          "chats",
          chatId,
          "messages"
        ),
        {
          type: "liveInvite",

          senderId: currentUid,
          receiverId: uid,

          roomId: roomId,

          roomLink:
            `https://topking.app/live/${roomId}`,

          text:
            `${currentName} invited you to join live`,

          createdAt: serverTimestamp(),
        }
      );

await setDoc(
  doc(
    db,
    "userChats",
    uid,
    "friends",
    currentUid
  ),
  {
    userId: currentUid,

    username: currentName,

    lastMessage: "🎙 Live Invite",

    hasNewMessage: true,

    unreadCount: increment(1),

    updatedAt: serverTimestamp(),
  },
  { merge: true }
);


await setDoc(
  doc(
    db,
    "userChats",
    currentUid,
    "friends",
    uid
  ),
  {
    userId: uid,

    lastMessage: "🎙 Live Invite",

    updatedAt: serverTimestamp(),
  },
  { merge: true }
);



      console.log("LIVE INVITE SAVED =", docRef.id);

      // Notification
      await setDoc(
        doc(
          db,
          "notifications",
          Date.now().toString() + uid
        ),
        {
          to: uid,
          senderId: currentUid,
          roomId: roomId,
          type: "liveInvite",
          createdAt: Date.now(),
        }
      );

    }

    alert("Invite Sent");

    setSelectedFriends([]);
    setFriendShareVisible(false);

  } catch (e) {

    console.log(
      "INVITE ERROR =",
      e
    );

  }
};






const approveRequest = async (user)=>{



try{

const roomRef = doc(db,"rooms",roomId);

let targetSeat = user.seatKey;

if (!targetSeat) {

  for (let i = 2; i <= 8; i++) {

    const key = `seat_${i}`;

    if (!roomData?.seatsData?.[key]?.userId) {

      targetSeat = key;

      break;

    }

  }

}


if (!targetSeat) {

  alert("No Empty Seat Available");

  return;

}



if (!targetSeat) {

  for (let i = 2; i <= 8; i++) {

    const key = `seat_${i}`;

    if (!roomData?.seatsData?.[key]?.userId) {

      targetSeat = key;

      break;

    }

  }

}


await updateDoc(roomRef,{


[`seatsData.${targetSeat}`]: {
  userId: user.uid,
  userName: user.name,
  realName: user.realName,
  userImg: user.img,
  verified: user.verified || false,
  verifiedColor:
user.verifiedColor || "white",
  level: user.level || 1,
  isMuted: false,
  roleTag: "SPEAKER"
},

[`speakerRequests.${user.uid}`]:null

});

}catch(e){

console.log(e);

}

};



const removeSpeaker = async(seatKey)=>{

try{

const roomRef = doc(db,"rooms",roomId);

await updateDoc(roomRef,{

[`seatsData.${seatKey}`]:{

userId:null,

userName:"Open",

userImg:STABLE_AVATAR,

isMuted:false

}

});

}catch(e){

console.log(e);

}

};



const muteSpeaker = async () => {

  try {

    const roomRef = doc(db, "rooms", roomId);

    await updateDoc(roomRef,{
  [`seatsData.${selectedSeatKey}.isMuted`]:
    !selectedSpeaker.isMuted,

  [`seatsData.${selectedSeatKey}.mutedByHost`]:
    !selectedSpeaker.isMuted
});

    setSpeakerModalVisible(false);

  } catch (e) {
    console.log(e);
  }

};



const muteSelf = async () => {

  try {



let mySeatData = null;

Object.entries(
  roomData.seatsData || {}
).forEach(([key,seat])=>{

  if(seat?.userId===currentUid){
    mySeatData = seat;
  }

});

if(mySeatData?.mutedByHost){

  alert(
    "Host has muted you. Only host can unmute."
  );

  return;
}


    const newValue = !selfMuted;

    setSelfMuted(newValue);

    if (agoraEngineRef.current) {

      await agoraEngineRef.current.muteLocalAudioStream(newValue);

    }

    if (roomData && currentUserRole !== "listener") {

      let mySeat = null;

      Object.entries(roomData.seatsData || {}).forEach(([key, seat]) => {

        if (seat?.userId === currentUid) {

          mySeat = key;

        }

      });

      if (mySeat) {

      await updateDoc(
  doc(db,"rooms",roomId),
  {
    [`seatsData.${mySeat}.isMuted`]:newValue,

    // khud mute/unmute kiya
    [`seatsData.${mySeat}.mutedByHost`]:false
  }
);

      }

    }

  } catch (e) {

    console.log(e);

  }

};


const leaveOwnSeat = async () => {

  try {

    let mySeat = null;

    Object.entries(roomData.seatsData || {}).forEach(([key, seat]) => {

      if (seat?.userId === currentUid) {

        mySeat = key;

      }

    });

    if (!mySeat || mySeat === "seat_1") return;

    await updateDoc(
      doc(db, "rooms", roomId),
      {
        [`seatsData.${mySeat}`]: {
          userId: null,
          userName: "Open",
          userImg: STABLE_AVATAR,
          isMuted: false
        }
      }
    );

    if (agoraEngineRef.current) {

      await agoraEngineRef.current.setClientRole(
        ClientRoleType.ClientRoleAudience
      );

      await agoraEngineRef.current.enableLocalAudio(false);

      await agoraEngineRef.current.muteLocalAudioStream(true);

    }

    setCurrentUserRole("listener");

    setSelfSeatModalVisible(false);

  } catch (e) {

    console.log(e);

  }

};





  if (loading) return <View style={styles.loader}><Text style={{color:'#fff'}}>Entering Live Room...</Text></View>;

  const audienceArray =
roomData?.audienceList
? Object.values(roomData.audienceList)
    .filter(
      user =>
        user &&
        user.uid &&
        user.uid !== roomData?.hostId
    )
: [];

const topUsers = audienceArray.slice(0,3);

const onlineUsers = audienceArray.filter(
  user =>
    user &&
    user.uid &&
    user.uid !== roomData?.hostId && // Host remove
    user.online === true
);

const totalViewers = onlineUsers.length;

const topSeatUsers = Object.values(
  roomData?.seatsData || {}
).filter(
  item => item?.userId
);


const giftUsers = [];

// Seats wale users
Object.values(roomData?.seatsData || {}).forEach((seat) => {

  if (!seat || !seat.userId) return;

  giftUsers.push({
    uid: seat.userId,
    name: seat.userName,
    img: seat.userImg
  });

});
// Audience wale users
audienceArray.forEach((user) => {

  if (!user || !user.uid) return;

  const alreadyExist = giftUsers.find(
    u => u && u.uid === user.uid
  );

  if (!alreadyExist) {
    giftUsers.push(user);
  }

});



const requestsArray =
roomData?.speakerRequests
? Object.values(roomData.speakerRequests).filter(Boolean)
: [];




return (
  <View style={styles.mainContainer}>

    <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

    {/* ================= TOP HEADER ================= */}
    <SafeAreaView style={styles.topHeader}>
      <View style={styles.hostBadge}>



        <View
style={styles.hostAvatarContainer}
>

<Image
source={{
uri:
roomData?.seatsData?.seat_1?.userImg
}}
style={styles.topHostImg}
/>

{
roomData?.seatsData?.seat_1?.level>=10 && (

<ReAnimated.Image

source={
getLevelFrame(
roomData?.seatsData?.seat_1?.level
)
}

style={[
styles.hostLevelFrame,
frameAnimation
]}
/>

)
}

</View>

        <View>




<View
  style={{
    flexDirection:"row",
    alignItems:"center",
    marginLeft:10,
  }}
>

  <Text style={styles.roomNameText}>
    {roomData?.seatsData?.seat_1?.userName || "Live Room"}
  </Text>

  {roomData?.seatsData?.seat_1?.verified && (
  <View style={styles.verifiedBadge}>
    <MaterialCommunityIcons
    name="check-decagram"
    size={17}
    color={
roomData?.seatsData?.seat_1?.verifiedColor
=== "yellow"
? "#FFD700"
: "#ffffff"
}
  />
  </View>
)}

  <View
    style={[
      styles.levelBadge,
      {
        backgroundColor:getLevelTheme(
          roomData?.seatsData?.seat_1?.level || 1
        ).bg,

        borderColor:getLevelTheme(
          roomData?.seatsData?.seat_1?.level || 1
        ).border,
      }
    ]}
  >

    <MaterialCommunityIcons
      name="diamond-stone"
      size={10}
      color={
        getLevelTheme(
          roomData?.seatsData?.seat_1?.level || 1
        ).icon
      }
    />

    <Text
      style={{
        color:getLevelTheme(
          roomData?.seatsData?.seat_1?.level || 1
        ).text,
        fontSize:9,
        fontWeight:"bold",
        marginLeft:2,
      }}
    >
      LV {roomData?.seatsData?.seat_1?.level || 1}
    </Text>

  </View>

</View>

          

          <View style={styles.viewRow}>
            <MaterialCommunityIcons name="waveform" size={14} color="#f1c40f" />
            <Text style={styles.onlineText}>
  {totalViewers} views
</Text>

            <View style={styles.liveTag}>
<Text style={styles.liveTagText}>
● LIVE {roomTimer}
</Text>
</View>




          </View>
        </View>
      </View>


<View style={styles.viewerContainer}>

{topUsers.map((user,index)=>(

<View
    key={user.uid}
    style={{
        marginLeft:index===0 ? 0 : -10
    }}
>

<Image
    source={{
        uri:user.img || STABLE_AVATAR
    }}
    style={styles.viewerAvatar}
/>

{
(user.level || 0) >= 10 && (

<ReAnimated.Image
    source={getLevelFrame(user.level)}
    style={{
        position:"absolute",
        width:50,
        height:50,
        top:-8,
        left:-8,
        zIndex:10
    }}
/>

)
}

</View>

))}

<View style={styles.viewerCount}>

<Text style={styles.viewerCountText}>
{totalViewers}
</Text>

</View>

</View>



    </SafeAreaView>

    {/* ================= MAIN CONTENT ================= */}
 <View style={{flex:1}}>

      {/* SEATS */}
      <View style={styles.micGrid}>
        {['seat_1','seat_2','seat_3','seat_4','seat_5','seat_6','seat_7','seat_8']
          .map((key) => {
            const seat = roomData?.seatsData?.[key] || {};
            const isActive = !!seat.userId;


            const seatStars =
roomData?.seatStars?.[seat.userId] || 0;

let isSpeaking = false;

if(seat.userId){

const uid =
seat.userId
.split("")
.reduce((a,c)=>a+c.charCodeAt(0),0)%1000000;

isSpeaking = activeSpeakers[uid];

}



            return (
              <TouchableOpacity
                key={key}
                style={styles.seatItem}


      onPress={() => {

if (
    seat.userId === currentUid
) {

    setSelectedSeatKey(key);

    setSelectedSpeaker(seat);

    setSelfMuted(seat.isMuted || false);

    setSelfSeatModalVisible(true);

    return;

}


if (
 !seat.userId &&
 currentUserRole === "listener"
){
 sendSeatRequest(key);
 return;
}


if(
 currentUserRole==="host" &&
 seat.userId &&
 key!=="seat_1"
){

setSelectedSeatKey(key);

setSelectedSpeaker(seat);
console.log("SELECTED SPEAKER =", seat);
setSpeakerModalVisible(true);

}




else if (
 seat.userId &&
 currentUserRole !== "host"
){

setSelectedSpeaker(seat);

setProfileVisible(true);

}



}}


              >
                <View
                
                style={[
styles.avatarBox,

isSpeaking
? styles.speakingBorder

: isActive
? (
key==="seat_1"
? styles.hostBorder
: styles.speakerBorder
)

: styles.emptyBorder

]}
                
                >


{
isSpeaking && (

<Animated.View
style={[
styles.voicePulse,
{
transform:[
{
scale:pulseAnim
}
]
}
]}
/>

)
}


                 {isActive ? (
    <>
        <Image
            source={{
                uri: seat.userImg || STABLE_AVATAR
            }}
            style={styles.avatarMain}
        />

        {seat.level >= 10 && (
            <ReAnimated.Image
                source={getLevelFrame(seat.level)}
                style={{
                    position: "absolute",
                    width: 90,
                    height: 90,
                    resizeMode: "contain",
                    zIndex: 10,
                }}
            />
        )}
    </>
) : (
    <Ionicons
        name="add"
        size={28}
        color="rgba(255,255,255,0.2)"
    />
)}

                  {key === 'seat_1' && (
                    <View style={styles.hostTag}>
                      <Text style={styles.tagLabel}>HOST</Text>
                    </View>
                  )}
                </View>

                
<Text
style={{
color:"#888",
fontSize:10,
marginTop:4
}}
>
@{seat.userName}
</Text>


{
seat.userId && (

<View
style={{
flexDirection:"row",
alignItems:"center",
marginTop:2
}}
>

<Text
style={{
fontSize:12
}}
>
⭐
</Text>

<Text
style={{
color:"#ffd700",
fontSize:11,
fontWeight:"bold",
marginLeft:3
}}
>
{seatStars}
</Text>

</View>

)
}



              </TouchableOpacity>
            );
          })}
      </View>









      {/* CHAT */}
<FlatList
    ref={chatScrollRef}
    data={roomData?.chats || []}
    style={styles.chatArea}
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={{
        paddingBottom:120
    }}
    showsVerticalScrollIndicator={false}
    initialNumToRender={10}
    maxToRenderPerBatch={20}
    windowSize={10}
   removeClippedSubviews={true}
   
updateCellsBatchingPeriod={50}
    keyExtractor={(item,index)=>
        item.id || index.toString()
    }
   



    renderItem={({item,index})=>{

        const chat = item;

        if (chat.type === "join") {

            return (
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                    }}
                >

                    <View>

                        <Image
                            source={{
                                uri:chat.userImg
                            }}
                            style={{
                                width:22,
                                height:22,
                                borderRadius:11
                            }}
                        />

                        {
                            chat.level>=10 && (

                                <ReAnimated.Image
                                    source={
                                        getLevelFrame(
                                            chat.level
                                        )
                                    }
                                    style={{
                                        position:"absolute",
                                        width:30,
                                        height:30,
                                        top:-4,
                                        left:-4
                                    }}
                                />

                            )
                        }

                    </View>

                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            flexWrap: "wrap",
                        }}
                    >

                        <Text
                            style={{
                                color: "#d0d0d0",
                                fontSize: 13,
                                fontWeight: "600",
                            }}
                        >
                            {chat.senderName}
                        </Text>

                        {chat.verified && (
  <MaterialCommunityIcons
  name="check-decagram"
  size={17}
  color={
    chat?.verifiedColor === "yellow"
      ? "#FFD700"
      : "#ffffff"
  }
/>
)}

                        <View
                            style={[
                                styles.levelBadge,
                                {
                                    marginLeft: 5,
                                    backgroundColor:
                                        getLevelTheme(
                                            chat.level || 1
                                        ).bg,

                                    borderColor:
                                        getLevelTheme(
                                            chat.level || 1
                                        ).border,
                                },
                            ]}
                        >

                            <MaterialCommunityIcons
                                name="diamond-stone"
                                size={8}
                                color={
                                    getLevelTheme(
                                        chat.level || 1
                                    ).icon
                                }
                            />

                            <Text
                                style={{
                                    color:
                                        getLevelTheme(
                                            chat.level || 1
                                        ).text,
                                    fontSize: 8,
                                    fontWeight: "bold",
                                    marginLeft: 2,
                                }}
                            >
                                LV {chat.level || 1}
                            </Text>

                        </View>

                        <Text
                            style={{
                                color: "#d0d0d0",
                                fontSize: 13,
                                fontWeight: "600",
                                marginLeft: 5,
                            }}
                        >
                            joined
                        </Text>

                    </View>

                </View>
            );
        }

        return (

            <View style={styles.chatRow}>

                <View
                    style={{
                        width:42,
                        height:42,
                        justifyContent:"center",
                        alignItems:"center"
                    }}
                >

                    <Image
                        source={{
                            uri:chat.userImg
                        }}
                        style={styles.chatAva}
                    />

                    {
                        chat.level>=10 && (

                            <ReAnimated.Image
                                source={
                                    getLevelFrame(
                                        chat.level
                                    )
                                }
                                style={[
                                    styles.chatFrame,
                                    frameAnimation
                                ]}
                            />

                        )
                    }

                </View>

                <View style={styles.chatContent}>

                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            flexWrap: "wrap",
                        }}
                    >

                        <Text style={styles.chatUser}>
                            {chat.senderName}
                        </Text>

                        {chat.verified && (
                            <View style={styles.verifiedBadge}>
                                
<MaterialCommunityIcons
  name="check-decagram"
  size={15}
  color={
    chat?.verifiedColor === "yellow"
      ? "#FFD700"
      : "#ffffff"
  }
/>



                            </View>
                        )}

                        <View
                            style={[
                                styles.levelBadge,
                                {
                                    marginLeft: 6,
                                    backgroundColor:
                                        getLevelTheme(
                                            chat.level || 1
                                        ).bg,

                                    borderColor:
                                        getLevelTheme(
                                            chat.level || 1
                                        ).border,
                                },
                            ]}
                        >

                            <MaterialCommunityIcons
                                name="diamond-stone"
                                size={9}
                                color={
                                    getLevelTheme(
                                        chat.level || 1
                                    ).icon
                                }
                            />

                            <Text
                                style={{
                                    color:
                                        getLevelTheme(
                                            chat.level || 1
                                        ).text,
                                    fontSize: 8,
                                    fontWeight: "bold",
                                    marginLeft: 2,
                                }}
                            >
                                LV {chat.level || 1}
                            </Text>

                        </View>

                    </View>

                    <Text
                        style={{
                            color:"#888",
                            fontSize:11,
                            marginTop:2,
                        }}
                    >
                        @{chat.username}
                    </Text>

                    <View style={styles.bubble}>
                        <Text style={styles.chatMsg}>
                            {chat.message}
                        </Text>
                    </View>

                </View>

            </View>
        );
    }}
/>







    </View>



{
activeGift && (

<View
style={{
position:"absolute",

top:0,
left:0,
right:0,
bottom:0,

justifyContent:"center",
alignItems:"center",

zIndex:99999,
elevation:99999,

pointerEvents:"none"
}}
>

<LottieView
source={activeGift}

autoPlay
loop={false}
speed={2}
hardwareAccelerationAndroid={true}

renderMode="HARDWARE"
cacheComposition={true}
resizeMode="contain"

style={{
width:350,
height:350,
 backgroundColor: "transparent",
}}
/>







{
giftCombo && (

  <Animated.View

style={{

position:"absolute",

top:550,

left:15,

flexDirection:"row",

alignItems:"center",

paddingHorizontal:14,

paddingVertical:10,

borderRadius:35,

borderWidth:2,

maxWidth:"88%",

backgroundColor:"rgba(255,20,147,0.95)",

borderColor:"#FFD700",

shadowOpacity:0.4,



elevation:20,

transform:[
{
translateX:giftTranslateX
},
{
scale:giftScale
}
]

}}
>



<Animated.Image
source={{
uri:
roomData?.audienceList?.[
lastGiftRef.current?.senderId
]?.img || STABLE_AVATAR
}}

style={{
width:42,
height:42,
borderRadius:21,
marginRight:10,

transform:[

{

rotate:giftShake.interpolate({

inputRange:[-1,1],

outputRange:["-8deg","8deg"]

})

}

]

}}
/>

<View
style={{
flex:1
}}
>

<Text
style={{
color:"#FFD700",
fontWeight:"bold",
fontSize:15
}}
numberOfLines={1}
>
{giftCombo.senderName}
</Text>

<Text
style={{
color:"#fff",
fontSize:14,
marginTop:2
}}
numberOfLines={1}
>

sent 🎁

<Text
style={{
fontWeight:"bold",
color:"#00FFFF"
}}
>

 {giftCombo.giftName}

</Text>

</Text>

</View>

{
giftCombo.count>1 && (

<View
style={{
backgroundColor:"#ffe710",

paddingHorizontal:10,

paddingVertical:5,

borderRadius:20,

marginLeft:8
}}
>

<Text
style={{
color:"#121111",
fontWeight:"bold",
fontSize:18
}}
>

x{giftCombo.count}

</Text>

</View>

)

}

</Animated.View>

)
}


</View>

)
}


    {/* ================= BOTTOM BAR ================= */}
 <KeyboardAvoidingView
  behavior={Platform.OS === "ios" ? "padding" : undefined}
  keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
  style={[
    styles.bottomNav,
    {
      bottom: keyboardHeight,
      paddingBottom:
        Platform.OS === "android"
          ? insets.bottom + 8
          : insets.bottom
    }
  ]}
>

      <View style={styles.inputBox}>
        <TextInput
          style={styles.inputStyle}
          placeholder="Chat"
          placeholderTextColor="#666"
          value={chatMessage}
          onChangeText={setChatMessage}
          onSubmitEditing={handleSendChat}
        />
      </View>


<TouchableOpacity
    style={styles.shareCircle}
   onPress={() => setFriendShareVisible(true)}
>
    <Ionicons
        name="share-social"
        size={22}
        color="#fff"
    />
</TouchableOpacity>


      {currentUserRole === 'listener' && (
        <TouchableOpacity style={styles.raiseHandBtn} onPress={handleRaiseHand}>
          <Text style={styles.raiseHandText}>✋</Text>
        </TouchableOpacity>
      )}

      {currentUserRole === 'host' && (


       <TouchableOpacity
  style={styles.actionCircle}
  onPress={() => setRequestModalVisible(true)}
>

  <Ionicons
    name="people-outline"
    size={24}
    color="#fff"
  />

  {requestsArray.length > 0 && (

    <View style={styles.requestBadge}>

      <Text style={styles.requestBadgeText}>
        {requestsArray.length}
      </Text>

    </View>

  )}

</TouchableOpacity> 

        
      )}

     
     <TouchableOpacity
  style={styles.giftCircle}
  onPress={() => setGiftModalVisible(true)}
>
  
<LottieView
  source={require("../assets/animations/giftButton.json")}
  autoPlay
  loop
  style={{
    width: 50,
    height: 50,
  }}
/>

</TouchableOpacity>

    </KeyboardAvoidingView>

    {/* ================= EXIT MODAL ================= */}
    <Modal transparent visible={controlModalVisible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.exitBox}>
          <Text style={styles.exitTitle}>Exit Room?</Text>
          <Text style={styles.exitSub}>
           Do you really want to go to the home screen?
          </Text>

          <View style={styles.btnRow}>
            <TouchableOpacity
  style={styles.noBtn}
  onPress={() => setControlModalVisible(false)}
>
  <Text style={styles.btnText}>No</Text>
</TouchableOpacity>

<TouchableOpacity
  style={styles.yesBtn}
  onPress={cleanAndExit}
>
  <Text style={styles.btnText}>Yes</Text>
</TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* ================= SPEAKER REQUEST MODAL ================= */}
    <Modal
visible={requestModalVisible}
transparent
animationType="slide"
onRequestClose={() => setRequestModalVisible(false)}
>


      <View style={styles.bottomSheetOverlay}>
        <View style={styles.requestSheet}>

          <Text style={{color:'#fff', fontSize:20, fontWeight:'bold', marginBottom:20}}>
            🎤 Speaker Requests
          </Text>

          <ScrollView>

            {requestsArray.map((user,index)=>(
              <View key={index} style={{
                backgroundColor:'#2B2D42',
                padding:12,
                borderRadius:12,
                marginBottom:10,
                flexDirection:'row',
                justifyContent:'space-between',
                alignItems:'center'
              }}>


               <View>

<Text style={{color:'#fff'}}>
{user.name}
</Text>

<Text style={{
color:'#888',
fontSize:12
}}>
Requested Seat :
{
user?.seatKey
? user.seatKey.replace("_"," ")
: "No Seat"
}
</Text>

</View>

                <TouchableOpacity onPress={() => approveRequest(user)}>
                  <Text style={{color:'#00ff88', fontWeight:'bold'}}>Approve</Text>
                </TouchableOpacity>
              </View>
            ))}

            <Text style={{
              color:'#fff',
              fontSize:18,
              fontWeight:'bold',
              marginTop:20,
              marginBottom:10
            }}>
              Current Speakers
            </Text>

            {Object.entries(roomData?.seatsData || {})
              .filter(([key,seat]) => seat?.userId && key !== 'seat_1')
              .map(([key,seat]) => (
                <View key={key} style={{
                  backgroundColor:'#2B2D42',
                  padding:12,
                  borderRadius:12,
                  marginBottom:10,
                  flexDirection:'row',
                  justifyContent:'space-between',
                  alignItems:'center'
                }}>
                  <Text style={{color:'#fff'}}>{seat.userName}</Text>

                  <TouchableOpacity onPress={() => removeSpeaker(key)}>
                    <Text style={{color:'red', fontWeight:'bold'}}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}

          </ScrollView>

          <TouchableOpacity onPress={() => setRequestModalVisible(false)}>
            <Text style={{color:'#fff', marginTop:20}}>Close</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>




<Modal
visible={giftModalVisible}
transparent
animationType="fade"
onRequestClose={() => setGiftModalVisible(false)}
>
<View style={styles.giftOverlay}>

<TouchableOpacity
style={{flex:1}}
activeOpacity={1}
onPress={() => setGiftModalVisible(false)}
/>



<Animated.View
style={[
styles.giftSheet,
{
transform:[
{
translateY:giftModalAnim
}
]
}
]}
>


<View
style={{
flexDirection:"row",
justifyContent:"space-between",
alignItems:"center",
marginBottom:15
}}
>

<Text style={styles.giftTitle}>
🎁 Send Gifts
</Text>

<View
style={{
flexDirection:"row",
alignItems:"center"
}}
>

<Text
style={{
fontSize:24
}}
>
⭐
</Text>

<Text
style={{
color:"#fff",
fontSize:20,
fontWeight:"bold",
marginLeft:5
}}
>
{stars}
</Text>

</View>

</View>




<ScrollView
horizontal
showsHorizontalScrollIndicator={false}
style={{ marginBottom: 15 }}
contentContainerStyle={{
paddingHorizontal:10,
paddingTop:10,
paddingBottom:10
}}
>

{giftUsers.map((user) => (

<TouchableOpacity
key={user.uid}

onPress={() => {

console.log(
"SELECTED USER =",
user.uid
);

setSelectedGiftUser(user.uid);

}}


style={{
alignItems:'center',
marginRight:12
}}
>


<Image
source={{
uri:user.img || STABLE_AVATAR
}}
style={{
width:50,
height:50,
borderRadius:25,

borderWidth:
selectedGiftUser === user.uid
? 3
: 1,

borderColor:
selectedGiftUser === user.uid
? '#ff1493'
: '#555'
}}
/>

<Text
style={{
color:'#fff',
fontSize:10,
width:65,
textAlign:'center',
marginTop:4
}}
numberOfLines={1}
>

{user.name}
</Text>

</TouchableOpacity>

))}

</ScrollView>

<View style={styles.giftGrid}>





<View style={styles.giftGrid}>

<ScrollView
horizontal
pagingEnabled
showsHorizontalScrollIndicator={false}
>

{
Array.from(
{
length: Math.ceil(gifts.length / 6)
}
).map((_, pageIndex) => (

<View
key={pageIndex}
style={{
width: width - 40,
flexDirection: "row",
flexWrap: "wrap",
justifyContent: "space-between",
paddingHorizontal: 5
}}
>

{
gifts
.slice(pageIndex * 6, pageIndex * 6 + 6)
.map(item => (





<TouchableOpacity
key={item.id}
style={styles.giftCard}



onPress={async () => {

if(
 !selectedGiftUser ||
 typeof selectedGiftUser !== "string"
){
 alert("Please select user");
 return;

}
console.log(
"RECEIVER UID =",
selectedGiftUser
);


if(stars < item.price){
alert("Not enough stars");
return;
}

try{

// INSTANT LOCAL ANIMATION
if (item.animation) {

  setActiveGift(item.animation);

  setTimeout(() => {
    setActiveGift(null);
  }, item.duration || 5000);

}



await updateDoc(
doc(db,"wallets",currentUid),
{
stars: increment(-item.price)
}
);

const roomRef = doc(db,"rooms",roomId);

await updateDoc(roomRef,{
[`seatStars.${selectedGiftUser}`]:
increment(item.price)
});



if (!global.giftComboCount) {
    global.giftComboCount = 1;
} else {
    global.giftComboCount++;
}


await updateDoc(roomRef,{
liveGift:{
giftId:item.id,
giftName:item.name,

senderId:currentUid,
senderName:currentName,

receiverId:selectedGiftUser,

timestamp:Date.now(),
comboCount: global.giftComboCount

}
});

// Receiver Wallet Earnings Update
console.log(
"RECEIVER WALLET UID =",
selectedGiftUser
);

console.log(
"CURRENT USER =",
currentUid
);



console.log(
  "========== GIFT DEBUG =========="
);

console.log(
  "CURRENT USER =",
  currentUid
);

console.log(
  "SELECTED GIFT USER =",
  selectedGiftUser
);

console.log(
  "GIFT PRICE =",
  item.price
);

console.log(
  "ROOM ID =",
  roomId
);

console.log("CURRENT USER =", currentUid);
console.log("SELECTED USER =", selectedGiftUser);
console.log("GIFT =", item);

const receiverWalletRef = doc(
  db,
  "wallets",
  selectedGiftUser
);


const receiverSnap = await getDoc(receiverWalletRef);



// ================================
// UPDATE RECEIVER TOP GIFTERS
// ================================
try {

  // Sender
  const senderId = currentUid;

  // Receiver
  const receiverId = selectedGiftUser;

  // Gift
  const gift = item;

  // Sender name
  const senderName = currentName;

  console.log("========== TOP GIFTER DEBUG ==========");
  console.log("SENDER ID =", senderId);
  console.log("RECEIVER ID =", receiverId);
  console.log("GIFT ID =", gift.id);
  console.log("GIFT NAME =", gift.name);
  console.log("GIFT PRICE =", gift.price);


  // Safety check
  if (!senderId) {
    console.log("❌ SENDER ID MISSING");
    return;
  }

  if (!receiverId) {
    console.log("❌ RECEIVER ID MISSING");
    return;
  }

  if (!gift?.price) {
    console.log("❌ GIFT PRICE MISSING");
    return;
  }


  // ================================
  // RECEIVER USER DOCUMENT
  // ================================

  const receiverUserRef = doc(
    db,
    "users",
    receiverId
  );

  const receiverUserSnap =
    await getDoc(receiverUserRef);


  if (!receiverUserSnap.exists()) {

    console.log(
      "❌ RECEIVER USER DOCUMENT NOT FOUND =",
      receiverId
    );

  } else {

    const receiverData =
      receiverUserSnap.data();


    // Existing top gifters
    const currentTopGifters =
      receiverData.topGifters || {};


    // Existing sender
    const oldGifter =
      currentTopGifters[senderId] || {};


    // Previous stars
    const oldStars =
      Number(oldGifter.stars || 0);


    // Current gift price
    const giftStars =
      Number(gift.price || 0);


    // New total
    const newGifterStars =
      oldStars + giftStars;


    // ================================
    // GET SENDER PROFILE
    // ================================

    const senderUserRef = doc(
      db,
      "users",
      senderId
    );

    const senderUserSnap =
      await getDoc(senderUserRef);


    const senderData =
      senderUserSnap.exists()
        ? senderUserSnap.data()
        : {};


    // ================================
    // UPDATE TOP GIFTER
    // ================================

    currentTopGifters[senderId] = {

      uid: senderId,

      username:
        senderData.username ||
        senderData.userName ||
        "",

      name:
        senderData.name ||
        senderData.username ||
        senderName ||
        "User",

      profileImg:
        senderData.profileImg ||
        senderData.photo ||
        senderData.photoURL ||
        senderData.profile ||
        "",

      stars: newGifterStars,

    };


    // ================================
    // SAVE
    // ================================

    await updateDoc(
      receiverUserRef,
      {
        topGifters:
          currentTopGifters,
      }
    );


    console.log(
      "🔥 TOP GIFTER UPDATED =",
      currentTopGifters[senderId]
    );

  }

} catch (error) {

  console.log(
    "❌ TOP GIFTER UPDATE ERROR =",
    error
  );

}


console.log(
  "RECEIVER WALLET EXISTS =",
  receiverSnap.exists()
);

if (receiverSnap.exists()) {

  console.log(
    "UPDATING WALLET"
  );

  await updateDoc(
    receiverWalletRef,
    {
      earnings:
      increment(item.price)
    }
  );

  console.log(
    "WALLET UPDATED"
  );

} else {

  console.log(
    "CREATING WALLET"
  );

  await setDoc(
    receiverWalletRef,
    {
      stars:0,
      earnings:item.price
    }
  );

  console.log(
    "WALLET CREATED"
  );

} 


await updateDoc(
receiverWalletRef,
{
receivedStars:
increment(item.price)
}
);


try {

  const response = await fetch(
    "https://topking-backend.onrender.com/update-agency-stars",
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

  const result = await response.json();

  console.log("AGENCY UPDATE RESPONSE =", result);

} catch (e) {

  console.log("Agency Update Error =", e);

}



}catch(e){
console.log(e);
}

setGiftModalVisible(false);



}}


>

<Image
source={item.icon}
style={{
width:45,
height:45,
resizeMode:"contain"
}}
/>

<Text style={styles.giftName}>
{item.name}
</Text>

<Text style={styles.giftCoin}>
{item.price}
</Text>

</TouchableOpacity>
))
}
</View>



))
}

</ScrollView>

</View>


</View>

</Animated.View>

</View>
</Modal>




<Modal
visible={speakerModalVisible}
transparent
animationType="slide"
onRequestClose={() => setSpeakerModalVisible(false)}
>

<View style={{
flex:1,
justifyContent:'flex-end',
backgroundColor:'rgba(0,0,0,0.5)'
}}>

<View style={{
backgroundColor:'#000',
height:height*0.40,
borderTopLeftRadius:30,
borderTopRightRadius:30,
alignItems:'center'
}}>

<View style={{
flexDirection:'row',
justifyContent:'space-between',
width:'100%',
paddingHorizontal:30,
marginTop:20
}}>

<TouchableOpacity
onPress={()=>{
removeSpeaker(selectedSeatKey);
setSpeakerModalVisible(false);
}}
>

<Text style={{
color:'red',
fontSize:20,
fontWeight:'bold'
}}>
❌ Remove
</Text>

</TouchableOpacity>


<TouchableOpacity
onPress={muteSpeaker}
>

<Text style={{
color:'#fff',
fontSize:20,
fontWeight:'bold'
}}>
{selectedSpeaker?.isMuted ? "🎤 Unmute" : "🔇 Mute"}
</Text>

</TouchableOpacity>

</View>


<TouchableOpacity
onPress={() => {

setSpeakerModalVisible(false);

if (agoraEngineRef.current) {

agoraEngineRef.current.muteAllRemoteAudioStreams(true);

}

router.push({
  pathname: "/userProfile",
  params: {
    userId: selectedSpeaker?.userId,
    roomId: roomId
  }
});

}}
>

<View>

<Image
source={{
uri:selectedSpeaker?.userImg
}}
style={{
width:100,
height:100,
borderRadius:50
}}
/>
{
  selectedSpeaker?.level >= 10 && (

    <ReAnimated.Image
      source={
        getLevelFrame(
          selectedSpeaker?.level
        )
      }
      style={{
        position:"absolute",
        width:120,
        height:120,
        top:-10,
        left:-10
      }}
    />

  )
}



{
selectedSpeaker?.level>=10 && (

<ReAnimated.Image
source={
getLevelFrame(
selectedSpeaker?.level
)
}
style={{
position:"absolute",
width:120,
height:120,
top:-10,
left:-10
}}
/>

)
}

</View>

</TouchableOpacity>



<View
  style={{
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
  }}
>

  <Text
    style={{
      color: "#fff",
      fontSize: 24,
      fontWeight: "bold",
    }}
  >
    @{selectedSpeaker?.userName}
  </Text>

  {/* Verified Tick */}
 
{selectedSpeaker?.verified && (
  <MaterialCommunityIcons
    name="check-decagram"
    size={18}
    color={
selectedSpeaker?.verifiedColor
=== "yellow"
? "#FFD700"
: "#ffffff"
}
  />
)}

  

  {/* Level */}
  <View
    style={[
      styles.levelBadge,
      {
        marginLeft: 8,
        backgroundColor: getLevelTheme(
          selectedSpeaker?.level || 1
        ).bg,
        borderColor: getLevelTheme(
          selectedSpeaker?.level || 1
        ).border,
      },
    ]}
  >
    <MaterialCommunityIcons
      name="diamond-stone"
      size={10}
      color={
        getLevelTheme(
          selectedSpeaker?.level || 1
        ).icon
      }
    />

    <Text
      style={{
        color: getLevelTheme(
          selectedSpeaker?.level || 1
        ).text,
        fontSize: 9,
        fontWeight: "bold",
        marginLeft: 2,
      }}
    >
      LV {selectedSpeaker?.level || 1}
    </Text>
  </View>

</View>

</View>

</View>

</Modal>



<Modal
visible={profileVisible}
transparent
animationType="slide"
onRequestClose={() => setProfileVisible(false)}
>

<View
style={{
flex:1,
justifyContent:"flex-end",
backgroundColor:"rgba(0,0,0,0.5)"
}}
>

<View
style={{
backgroundColor:"#000",
height:height*0.35,
borderTopLeftRadius:30,
borderTopRightRadius:30,
alignItems:"center"
}}
>

<TouchableOpacity
onPress={() => {

setProfileVisible(false);

if (agoraEngineRef.current) {
agoraEngineRef.current.muteAllRemoteAudioStreams(true);
}

router.push({
pathname:"/userProfile",
params:{
userId:selectedSpeaker?.userId,
roomId:roomId
}
});

}}
>

<View>

<Image
source={{
uri:selectedSpeaker?.userImg
}}
style={{
width:100,
height:100,
borderRadius:50
}}
/>


{
selectedSpeaker?.level>=10 && (

<ReAnimated.Image
source={
getLevelFrame(
selectedSpeaker?.level
)
}
style={{
position:"absolute",
width:120,
height:120,
top:-10,
left:-10
}}
/>

)
}



{
selectedSpeaker?.level>=10 && (

<ReAnimated.Image
source={
getLevelFrame(
selectedSpeaker?.level
)
}
style={{
position:"absolute",
width:120,
height:120,
top:-10,
left:-10
}}
/>

)
}

</View>

</TouchableOpacity>


<View
  style={{
    flexDirection: "row",
    alignItems: "center",
    marginTop: 15,
    justifyContent: "center",
  }}
>
  <Text
    style={{
      color: "#fff",
      fontSize: 22,
      fontWeight: "bold",
    }}
  >
    @{selectedSpeaker?.userName}
  </Text>

  {/* Verified Tick */}
  
    
     <View style={styles.verifiedBadge}>
  
<MaterialCommunityIcons
    name="check-decagram"
    size={18}
    color={
selectedSpeaker?.verifiedColor
=== "yellow"
? "#FFD700"
: "#ffffff"
}
  />

  </View>
  

  {/* Level Badge */}
  <View
    style={[
      styles.levelBadge,
      {
        marginLeft: 8,
        backgroundColor: getLevelTheme(
          selectedSpeaker?.level || 1
        ).bg,
        borderColor: getLevelTheme(
          selectedSpeaker?.level || 1
        ).border,
      },
    ]}
  >
    <MaterialCommunityIcons
      name="diamond-stone"
      size={10}
      color={
        getLevelTheme(
          selectedSpeaker?.level || 1
        ).icon
      }
    />

    <Text
      style={{
        color: getLevelTheme(
          selectedSpeaker?.level || 1
        ).text,
        fontSize: 9,
        fontWeight: "bold",
        marginLeft: 2,
      }}
    >
      LV {selectedSpeaker?.level || 1}
    </Text>
  </View>
</View>


</View>

</View>

</Modal>










<Modal
visible={selfSeatModalVisible}
transparent
animationType="slide"
onRequestClose={() => setSelfSeatModalVisible(false)}
>

<View
style={{
flex:1,
justifyContent:"flex-end",
backgroundColor:"rgba(0,0,0,0.5)"
}}
>

<View
style={{
backgroundColor:"#111",
borderTopLeftRadius:25,
borderTopRightRadius:25,
padding:25
}}
>

{/* Profile */}

<View
style={{
alignItems:"center",
marginBottom:25
}}
>

<View>

<Image
source={{
uri:selectedSpeaker?.userImg || STABLE_AVATAR
}}
style={{
width:90,
height:90,
borderRadius:45,
marginBottom:12
}}
/>

{
selectedSpeaker?.level>=10 && (

<ReAnimated.Image
source={
getLevelFrame(
selectedSpeaker?.level
)
}
style={{
position:"absolute",
width:120,
height:120,
top:-15,
left:-15
}}
/>

)
}

</View>

<Text
style={{
color:"#fff",
fontSize:22,
fontWeight:"bold"
}}
>
{selectedSpeaker?.realName || selectedSpeaker?.userName}
</Text>

<Text
style={{
color:"#888",
fontSize:15,
marginTop:3
}}
>
@{selectedSpeaker?.userName}
</Text>

<Text
style={{
color:"#eeff00",
fontSize:15,
marginTop:8,
fontWeight:"bold"
}}
>
{currentUserRole==="host" ? "👤 Host" : "👤 Speaker"}
</Text>

</View>

{/* Mute */}

<TouchableOpacity
onPress={muteSelf}
style={{
paddingVertical:18,
borderTopWidth:0.5,
borderColor:"#333"
}}
>

<Text
style={{
color:"#fff",
fontSize:18
}}
>
{selfMuted ? "🎤 Unmute" : "🔇 Mute"}
</Text>

</TouchableOpacity>

{/* Leave Seat */}

{
currentUserRole==="speaker" && (

<TouchableOpacity
onPress={leaveOwnSeat}
style={{
paddingVertical:18,
borderTopWidth:0.5,
borderColor:"#333"
}}
>

<Text
style={{
color:"red",
fontSize:18
}}
>
🚪 Leave Seat
</Text>

</TouchableOpacity>

)
}

{/* Close */}

<TouchableOpacity
onPress={() => setSelfSeatModalVisible(false)}
style={{
paddingVertical:18,
borderTopWidth:0.5,
borderColor:"#333"
}}
>



</TouchableOpacity>

</View>

</View>

</Modal>









<Modal
visible={friendShareVisible}
transparent
animationType="slide"
onRequestClose={() =>
setFriendShareVisible(false)
}
>

<View
style={{
flex:1,
justifyContent:"flex-end",
backgroundColor:"rgba(0,0,0,0.5)"
}}
>

<View
style={styles.friendSheet}
>

<Text
style={styles.friendTitle}
>

Friend Share

</Text>

<ScrollView>

{

friends.map(item=>(

<TouchableOpacity

key={item.id}

style={styles.friendRow}

onPress={()=>

toggleFriend(item.id)

}

>


<View>

<Image
source={{
uri:
item.profileImg||
STABLE_AVATAR
}}
style={styles.friendImg}
/>

{
item.level>=10 && (

<ReAnimated.Image
source={
getLevelFrame(
item.level
)
}
style={{
position:"absolute",
width:90,
height:90,
top:-17,
left:-17
}}
/>

)
}

</View>


<View style={{ flex:1, marginLeft:15 }}>

  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
    }}
  >

    <Text style={styles.friendName}>
      @{item.username}
    </Text>

    {/* Verified Tick - Sirf Verified User ko */}
    {item.verified && (
      <View style={styles.verifiedBadge}>
        
 <MaterialCommunityIcons
      name="check-decagram"
      size={17}
      color={
        item.verifiedColor === "yellow"
          ? "#FFD700"
          : "#ffffff"
      }
  />


      </View>
    )}

    {/* Level Badge */}
    <View
      style={[
        styles.levelBadge,
        {
          marginLeft: 8,
          backgroundColor: getLevelTheme(item.level || 1).bg,
          borderColor: getLevelTheme(item.level || 1).border,
        },
      ]}
    >
      <MaterialCommunityIcons
        name="diamond-stone"
        size={10}
        color={getLevelTheme(item.level || 1).icon}
      />

      <Text
        style={{
          color: getLevelTheme(item.level || 1).text,
          fontSize: 9,
          fontWeight: "bold",
          marginLeft: 2,
        }}
      >
        LV {item.level || 1}
      </Text>

    </View>

  </View>

</View>


<View

style={[

styles.radio,

selectedFriends.includes(item.id)

&&

styles.radioSelected

]}

/>

</TouchableOpacity>

))

}

</ScrollView>

<TouchableOpacity

style={styles.shareBtn}

onPress={handleShare}

>

<Text style={styles.shareText}>

Share on WhatsApp & More

</Text>

</TouchableOpacity>

<TouchableOpacity

style={styles.sendBtn}

onPress={sendInvite}

>

<Text style={styles.sendText}>

Send Invite

</Text>

</TouchableOpacity>

</View>

</View>

</Modal>



  </View>
);
  
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#0A0B14' },
  loader: { flex: 1, backgroundColor: '#0A0B14', justifyContent: 'center', alignItems: 'center' },

  topHeader:{
  flexDirection:"row",
  justifyContent:"space-between",
  alignItems:"center",

  paddingHorizontal:15,
  paddingTop:15,

  marginTop:35
},

  hostBadge: { flexDirection: 'row', alignItems: 'center' },
  topHostImg: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#f1c40f' },
  roomNameText: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginLeft: 10 },
  viewRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 10, marginTop: 2 },
  onlineText: { color: '#bdc3c7', fontSize: 11, marginLeft: 4 },
  liveTag: { backgroundColor: '#e74c3c', paddingHorizontal: 6, borderRadius: 4, marginLeft: 8 },
  liveTagText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  audienceAvatars: { flexDirection: 'row', alignItems: 'center' },
  miniRound: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: '#0A0B14' },
  moreCount: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1C1E2E', justifyContent: 'center', alignItems: 'center', marginLeft: -12, borderWidth: 1.5, borderColor: '#0A0B14' },
  moreText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  micGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', padding: 15, marginTop: 20 },

  seatItem: { width:width*0.20, alignItems: 'center', marginBottom: 15 },
  avatarBox: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', backgroundColor: '#151728' },
  hostBorder: { borderWidth: 2.5, borderColor: '#f1c40f' },

  speakerBorder: { borderWidth: 1.5, borderColor: '#8e44ad' },
  emptyBorder: { borderWidth: 1.5, borderColor: '#2c3e50', borderStyle: 'dashed' },
  avatarMain: { width: '100%', height: '100%', borderRadius: 34 },
  hostTag: { position: 'absolute', top: -5, backgroundColor: '#f1c40f', borderRadius: 6, paddingHorizontal: 6 },
  tagLabel: { fontSize: 8, fontWeight: 'bold', color: '#000' },
  micIconOverlay: { position: 'absolute', bottom: 2, right: 2, backgroundColor: '#f1c40f', borderRadius: 10, padding: 3 },
  seatNameTxt: { color: '#95a5a6', fontSize: 10, marginTop: 8 },
  sysMessage: { backgroundColor: 'rgba(241, 196, 15, 0.08)', borderLeftWidth: 3, borderLeftColor: '#f1c40f', margin: 15, padding: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  sysText: { color: '#f1c40f', fontSize: 11, flex: 1, marginHorizontal: 10 },

chatArea:{

    position:"absolute",

    left:0,

    right:0,

    bottom:100,

    maxHeight:height*0.45,

    paddingHorizontal:10

},  

  chatRow: { flexDirection: 'row', marginBottom: 15, alignItems: 'flex-start' },
  chatAva: { width: 36, height: 36, borderRadius: 18 },
  chatContent: { flex: 1, marginLeft: 10 },
  chatHeaderInline: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  chatUser: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  bubble: { backgroundColor: 'rgba(255,255,255,0.05)', padding: 10, borderRadius: 12, alignSelf: 'flex-start' },
  chatMsg: { color: '#eee', fontSize: 13 },
  bottomNav: {
  position: 'absolute',
  bottom: 0, left: 0, right: 0, flexDirection: 'row', padding: 15, backgroundColor: '#0A0B14', alignItems: 'center', borderTopWidth: 0.5, borderColor: '#1C1E2E' },
  inputBox: { flex: 1, height: 44, backgroundColor: '#1C1E2E', borderRadius: 22, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginRight: 10 },
  inputStyle: { color: '#fff', fontSize: 14, flex: 1 },
  actionCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1C1E2E', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  exitBox: { width: '80%', backgroundColor: '#1C1E2E', padding: 25, borderRadius: 20, alignItems: 'center' },
  exitTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  exitSub: { color: '#7f8c8d', textAlign: 'center', marginTop: 10 },
  btnRow: { flexDirection: 'row', marginTop: 25 },
  noBtn: { backgroundColor: '#34495e', paddingVertical: 10, paddingHorizontal: 25, borderRadius: 10, marginRight: 15 },
  yesBtn: { backgroundColor: '#e74c3c', paddingVertical: 10, paddingHorizontal: 25, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: 'bold' },


  raiseHandBtn: {
  backgroundColor: '#f1c40f',
  paddingHorizontal: 15,
  paddingVertical: 10,
  borderRadius: 20,
  marginRight: 10
},

raiseHandText: {
  color: '#000',
  fontWeight: 'bold'
},

bottomSheetOverlay:{
 flex:1,
 justifyContent:'flex-end',
 backgroundColor:'rgba(0,0,0,0.5)'
},

requestSheet:{
backgroundColor:'#1C1E2E',

maxHeight:height*0.70,
minHeight:height*0.50,

borderTopLeftRadius:25,
borderTopRightRadius:25,

padding:20
},

giftCircle:{
width:44,
height:44,
borderRadius:22,
  backgroundColor: "transparent",
justifyContent:'center',
alignItems:'center',
marginLeft:8
},


giftOverlay:{
flex:1,
justifyContent:'flex-end',
backgroundColor:'rgba(0,0,0,0.4)'
},

giftSheet:{
backgroundColor:'#111827',

maxHeight:height*0.70,
minHeight:height*0.50,

borderTopLeftRadius:30,
borderTopRightRadius:30,

paddingTop:25,
paddingHorizontal:20,
paddingBottom:35
},

giftTitle:{
color:'#fff',
fontSize:22,
fontWeight:'bold',
marginBottom:20
},

giftGrid:{
flexDirection:'row',
flexWrap:'wrap',
justifyContent:'space-between',
paddingHorizontal:0
},

giftCard:{
width:'30%',
backgroundColor:'#1C1E2E',
borderRadius:10,
padding:5,
marginBottom:20,
alignItems:'center'
},

giftEmoji:{
fontSize:24
},

giftName:{
color:'#fff',
fontSize:10,
marginTop:0
},

giftCoin:{
color:'#999',
fontSize:13,
marginTop:5
},

audienceContainer:{
marginTop:20,
paddingHorizontal:15
},

audienceTitle:{
color:'#fff',
fontSize:16,
fontWeight:'bold',
marginBottom:15
},

userBox:{
alignItems:'center',
marginRight:15
},

userImg:{
width:60,
height:60,
borderRadius:30,
borderWidth:2,
borderColor:'#ff1493'
},

userName:{
color:'#fff',
fontSize:12,
marginTop:5,
width:70,
textAlign:'center'
},

giftCoin:{
color:'#999',
fontSize:13,
marginTop:5
},

speakingBorder:{
borderWidth:4,
borderColor:"#00ff88",

shadowColor:"#00ff88",
shadowOffset:{
width:0,
height:0
},
shadowOpacity:1,
shadowRadius:20,

elevation:20
},


voicePulse:{
position:'absolute',

width:90,
height:90,
borderRadius:45,

backgroundColor:'rgba(0,255,136,0.25)',

borderWidth:3,
borderColor:'#00ff88'
},


bigGift:{
width:400,
height:400,
resizeMode:'contain'
},

giftEffectContainer:{
position:"absolute",
top:0,
left:0,
right:0,
bottom:0,
justifyContent:"center",
alignItems:"center",
zIndex:9999,
pointerEvents:"none"
},

requestBadge:{
  position:"absolute",
  top:-5,
  right:-5,

  backgroundColor:"#ff0000",

  minWidth:20,
  height:20,

  borderRadius:10,

  justifyContent:"center",
  alignItems:"center",

  paddingHorizontal:4,

  borderWidth:2,
  borderColor:"#0A0B14"
},

requestBadgeText:{
  color:"#fff",
  fontSize:10,
  fontWeight:"bold"
},

shareCircle: {
  width: 44,
  height: 44,
  borderRadius: 22,
  backgroundColor: "#636b89",
  justifyContent: "center",
  alignItems: "center",
  marginLeft: 5,
marginRight: 12,

},


friendSheet:{
backgroundColor:"#000",
height:height*0.60,
borderTopLeftRadius:30,
borderTopRightRadius:30,
padding:20
},

friendTitle:{
color:"#fff",
fontSize:28,
fontWeight:"bold",
marginBottom:20
},

friendRow:{
flexDirection:"row",
alignItems:"center",
marginBottom:20
},

friendImg:{
width:55,
height:55,
borderRadius:28
},

friendName:{
color:"#fff",
fontSize:16,
fontWeight:"700",
},

radio:{
width:25,
height:25,
borderRadius:13,
borderWidth:2,
borderColor:"#fff"
},

radioSelected:{
backgroundColor:"#00ff88",
borderColor:"#00ff88"
},

shareBtn:{
backgroundColor:"#25D366",
padding:15,
borderRadius:15,
marginTop:10,
bottom:25,
},

shareText:{
color:"#fff",
fontWeight:"bold",
textAlign:"center"
},

sendBtn:{
backgroundColor:"#f71084",
padding:15,
borderRadius:10,
marginTop:15,
bottom:30,
},

sendText:{
color:"#fff",
fontWeight:"bold",
textAlign:"center"
},


viewerContainer:{
    flexDirection:"row",
    alignItems:"center",
},

viewerAvatar:{
    width:34,
    height:34,
    borderRadius:17,

    borderWidth:2,
    borderColor:"#fff",

    backgroundColor:"#333",
},

viewerCount:{
    width:36,
    height:36,

    borderRadius:18,

    backgroundColor:"rgba(255,255,255,0.25)",

    justifyContent:"center",
    alignItems:"center",

    marginLeft:-10,
},

viewerCountText:{
    color:"#fff",
    fontWeight:"bold",
    fontSize:12,
},

verifiedBadge:{
  marginLeft:6,
  justifyContent:"center",
  alignItems:"center",
},

levelBadge:{
  marginLeft:6,
  flexDirection:"row",
  alignItems:"center",
  borderWidth:1,
  paddingHorizontal:8,
  paddingVertical:3,
  borderRadius:20,
},

chatVerifiedIcon: {
  marginLeft: 4,
  alignSelf: "center",
},



hostAvatarContainer:{
position:"relative",
justifyContent:"center",
alignItems:"center"
},

hostLevelFrame:{
position:"absolute",
width:70,
height:70,
resizeMode:"contain"
},

seatFrame:{
position:"absolute",
width:85,
height:85,
top:-8,
left:-8,
resizeMode:"contain"
},

chatFrame:{
position:"absolute",
width:50,
height:50,
resizeMode:"contain"
},

hostAvatarContainer:{
position:"relative",
justifyContent:"center",
alignItems:"center"
},

hostLevelFrame:{
position:"absolute",
width:70,
height:70,
resizeMode:"contain"
},

seatFrame:{
position:"absolute",
width:85,
height:85,
top:-8,
left:-8,
resizeMode:"contain"
},

chatFrame:{
position:"absolute",
width:55,
height:55,
resizeMode:"contain"
},


});         