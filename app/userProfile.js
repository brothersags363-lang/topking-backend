     
import {
  View,
  Text,
  StyleSheet,
  Image,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Modal,
  Alert,
   Share,
   RefreshControl,
} from "react-native";


import {
  Ionicons,
  MaterialCommunityIcons
} from "@expo/vector-icons";

import React, { useEffect, useState } from "react";

import {
  useLocalSearchParams,
  useFocusEffect,
  useNavigation
} from "expo-router";

import { db } from "./firebaseConfig";

import { auth } from "./firebaseConfig";

import {
  doc,
  getDoc,
  collection,
  onSnapshot,
  query,
  where,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

import { useRouter } from "expo-router";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { BackHandler } from "react-native";

import TopKingLogo from "../assets/images/topking-logo.png";

import BottomNav from "../components/BottomNav";

const { width } = Dimensions.get("window");
const ITEM_WIDTH = width / 3 - 9;

export default function UserProfile() {
 

const [videos, setVideos] = useState([]);

const [likedVideos, setLikedVideos] = useState([]);

const [activeTab, setActiveTab] = useState("Videos");

const [userData, setUserData] = useState(null);

const [userLevel, setUserLevel] = useState(0);

const [isVerified, setIsVerified] = useState(false);

const [loading, setLoading] = useState(true);



const [totalLikes, setTotalLikes] = useState(0);

const [followersCount, setFollowersCount] = useState(0);
const [followingCount, setFollowingCount] = useState(0);

const [currentUserId, setCurrentUserId] = useState("");
const [isFollowing, setIsFollowing] = useState(false);

const [isFollowBack, setIsFollowBack] = useState(false);

const [menuVisible, setMenuVisible] = useState(false);

const [followersModalVisible, setFollowersModalVisible] =
useState(false);

const [activeFollowTab, setActiveFollowTab] =
useState("followers");

const [followersList, setFollowersList] =
useState([]);

const [followingList, setFollowingList] =
useState([]);

const [friendMenuVisible, setFriendMenuVisible] = useState(false);

const [followType, setFollowType] = useState("");

const [topGifters,setTopGifters] = useState([]);
const [giftUserCount,setGiftUserCount] = useState(0);

const [isBlocked, setIsBlocked] = useState(false);
const [refreshing, setRefreshing] = useState(false);

const { userId } = useLocalSearchParams();
console.log("USER PROFILE PARAM =", userId);


useEffect(() => {

  if (!db || !userId) return;

  const unsub = onSnapshot(
    doc(db, "users", userId),
    (snap) => {

      if (!snap.exists()) return;

      const data = snap.data();

      const gifters = Object.values(
        data.topGifters || {}
      );

      gifters.sort((a, b) => b.stars - a.stars);

      setTopGifters(gifters.slice(0, 3));

      setGiftUserCount(gifters.length);

    }
  );

  return () => unsub();

}, [userId]);


useEffect(() => {
  console.log("OPEN PROFILE ID =", userId);
}, [userId]);

const router = useRouter();
const verifiedTickColor =
  userData?.verifiedColor === "yellow"
    ? "#FFD700"
    : "#f9fdff";


const getLevelColor = (level) => {
  if (level >= 31) return "#FFD700";
  if (level >= 26) return "#FFD700";
  if (level >= 21) return "#FFD700";
  if (level >= 16) return "#FFD700";
  if (level >= 11) return "#00C853";
  if (level >= 6) return "#00B0FF";
  return "#BDBDBD";
};


const getLevelDiamond = (level) => {
  if (level >= 1 && level < 9) return 1;
  if (level >= 10 && level < 19) return 2;
  if (level >= 20 && level < 29) return 3;
  if (level >= 30 && level < 39) return 4;
  return 0;
};

const getLevelTheme = (level) => {

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
const levelTheme = getLevelTheme(userLevel || 1);

const navigation = useNavigation();

useFocusEffect(
  React.useCallback(() => {

    const backAction = () => {

      if (navigation.canGoBack()) {

        navigation.goBack();

      } else {

       router.replace("/(tabs)");

      }

      return true;
    };

    const subscription =
      BackHandler.addEventListener(
        "hardwareBackPress",
        backAction
      );

    return () =>
      subscription.remove();

  }, [])
);



console.log("PARAM USER ID =", userId);


useFocusEffect(
  React.useCallback(() => {

    console.log("PROFILE REFRESH");

    const loadProfile = async () => {

      getCurrentUser();

      await Promise.all([
        fetchUser(),
        fetchVideos(),
        loadLikedVideos(),
      ]);

      checkFollowStatus();

    };

    loadProfile();

    return () => {};

  }, [userId])
);



useEffect(() => {

  if (!userId) return;

  const followersQuery = query(
    collection(db, "follows"),
    where("followingId", "==", userId)
  );

  const unsubscribeFollowers =
    onSnapshot(followersQuery, (snapshot) => {

      setFollowersCount(snapshot.size);

    });


  const followingQuery = query(
    collection(db, "follows"),
    where("followerId", "==", userId)
  );

  const unsubscribeFollowing =
    onSnapshot(followingQuery, (snapshot) => {

      setFollowingCount(snapshot.size);

    });



  return () => {

    unsubscribeFollowers();

    unsubscribeFollowing();

  };

}, [userId]);



useEffect(() => {

  if (currentUserId) {
    checkFollowStatus();
  }

}, [currentUserId]);



useEffect(() => {

  if (!currentUserId || !userId) return;

  const followRef = doc(
    db,
    "follows",
    `${currentUserId}_${userId}`
  );

  const unsubscribe = onSnapshot(
    followRef,
    (snapshot) => {

      setIsFollowing(snapshot.exists());

    }
  );

  return () => unsubscribe();

}, [currentUserId, userId]);

useEffect(() => {

  if (!currentUserId || !userId) return;

  const backRef = doc(
    db,
    "follows",
    `${userId}_${currentUserId}`
  );

  const unsubscribe = onSnapshot(
    backRef,
    (snapshot) => {

      setIsFollowBack(snapshot.exists());

    }
  );

  return () => unsubscribe();

}, [currentUserId, userId]);



const getCurrentUser = () => {

  const uid = auth.currentUser?.uid;

  console.log(
    "AUTH USER =",
    uid
  );

  if (uid) {
    setCurrentUserId(uid);
  }
};


const fetchVideos = async () => {
  try {
    const q = query(
      collection(db, "all_videos"),
      where("userId", "==", userId)
    );

    const querySnapshot = await getDocs(q);

    const videoList = [];
    let likesCount = 0;

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();

      videoList.push({
        id: docSnap.id,
        ...data,
      });

      likesCount += Number(data.likes || 0);
    });

    // 🔥 New video sabse upar
    videoList.sort((a, b) => {

      const timeA =
        a.createdAt?.seconds
          ? a.createdAt.seconds
          : 0;

      const timeB =
        b.createdAt?.seconds
          ? b.createdAt.seconds
          : 0;

      return timeB - timeA;

    });

    setVideos(videoList);
    setTotalLikes(likesCount);

  } catch (error) {
    console.log("VIDEO ERROR =", error);
  }
};


const loadLikedVideos = async () => {
  try {

    const likedSnapshot = await getDocs(
      collection(
        db,
        "userLikes",
        userId,
        "likedVideos"
      )
    );

    let arr = [];

    for (const like of likedSnapshot.docs) {

      const videoSnap = await getDoc(
        doc(db, "all_videos", like.id)
      );

      if (videoSnap.exists()) {

        arr.push({
          id: videoSnap.id,
          ...videoSnap.data(),
        });

      }

    }

    // Newest First
    arr.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });

    setLikedVideos(arr);

  } catch (error) {
    console.log("LOAD LIKED VIDEOS ERROR =", error);
  }
};

const fetchFollowCounts = async () => {
  try {

    // Followers
    const followersQuery = query(
      collection(db, "follows"),
      where("followingId", "==", userId)
    );

    const followersSnap = await getDocs(followersQuery);

    setFollowersCount(followersSnap.size);

    // Following
    const followingQuery = query(
      collection(db, "follows"),
      where("followerId", "==", userId)
    );

    const followingSnap = await getDocs(followingQuery);

    setFollowingCount(followingSnap.size);

    console.log(
      "FOLLOWERS:",
      followersSnap.size,
      "FOLLOWING:",
      followingSnap.size
    );

  } catch (error) {
    console.log(error);
  }
};




const checkFollowStatus = async () => {
  try {

    if (!currentUserId || !userId) return;

    // Main user follows profile user ?
    const followRef = doc(
      db,
      "follows",
      `${currentUserId}_${userId}`
    );

    const followSnap =
      await getDoc(followRef);

    setIsFollowing(
      followSnap.exists()
    );

    // Profile user follows me ?
    const backRef = doc(
      db,
      "follows",
      `${userId}_${currentUserId}`
    );

    const backSnap =
      await getDoc(backRef);

    setIsFollowBack(
      backSnap.exists()
    );

  } catch (error) {

    console.log(error);

  }
};


const loadFollowers = async () => {

  try {

    const q = query(
      collection(db, "follows"),
      where("followingId", "==", userId)
    );

    const snap = await getDocs(q);

    let arr = [];

    for (const item of snap.docs) {

      const followerId =
      item.data().followerId;

      const userSnap =
      await getDoc(
        doc(db, "users", followerId)
      );

      if (userSnap.exists()) {


const myId = auth.currentUser?.uid;

const iFollowSnap = await getDoc(
  doc(db, "follows", `${myId}_${followerId}`)
);

const followsMeSnap = await getDoc(
  doc(db, "follows", `${followerId}_${myId}`)
);


      const walletSnap = await getDoc(doc(db, "wallets", followerId));

const verifiedSnap = await getDoc(
doc(db,"verifiedUsers",followerId)
);

arr.push({
id:followerId,

iFollow: iFollowSnap.exists(),
followsMe: followsMeSnap.exists(),

level:walletSnap.exists()
? walletSnap.data().level || 1
:1,

verified: verifiedSnap.exists(),

verifiedColor:
userSnap.data().verifiedColor || "",

...userSnap.data(),
});

      }

    }

    setFollowersList(arr);

  } catch (error) {

    console.log(error);

  }

};


const loadFollowing = async () => {

  try {

    const q = query(
      collection(db, "follows"),
      where("followerId", "==", userId)
    );

    const snap = await getDocs(q);

    let arr = [];

    for (const item of snap.docs) {

      const followingId =
      item.data().followingId;

      const userSnap =
      await getDoc(
        doc(db, "users", followingId)
      );

      if (userSnap.exists()) {


const myId = auth.currentUser?.uid;

const iFollowSnap = await getDoc(
  doc(db, "follows", `${myId}_${followingId}`)
);

const followsMeSnap = await getDoc(
  doc(db, "follows", `${followingId}_${myId}`)
);


       const walletSnap = await getDoc(doc(db, "wallets", followingId));

const verifiedSnap = await getDoc(
doc(db,"verifiedUsers",followingId)
);

arr.push({
id:followingId,

iFollow: iFollowSnap.exists(),
followsMe: followsMeSnap.exists(),

level:walletSnap.exists()
? walletSnap.data().level || 1
:1,

verified: verifiedSnap.exists(),

verifiedColor:
userSnap.data().verifiedColor || "",

...userSnap.data(),
});

      }

    }

    setFollowingList(arr);

  } catch (error) {

    console.log(error);

  }

};



useEffect(()=>{

if(followersModalVisible){

loadFollowers();
loadFollowing();

}

},[
followersModalVisible,
isFollowing
]);



const handleFollowBack = async (userData) => {

try{

const myId = auth.currentUser.uid;

const followId =
`${myId}_${userData.id}`;

await setDoc(
doc(db,"follows",followId),
{
followerId:myId,
followingId:userData.id
}
);

await loadFollowing();

}
catch(error){
console.log(error);
}

};




const handleFollow = async () => {

 console.log("====== FOLLOW BUTTON PRESSED ======");

  console.log("LOGIN USER =", currentUserId);

  console.log("PROFILE USER =", userId);

console.log("==========");
console.log("LOGIN USER =", currentUserId);
console.log("OPEN PROFILE =", userId);
console.log("SAME USER ?", currentUserId === userId);
console.log("FOLLOW DOC ID =", `${currentUserId}_${userId}`);
console.log("==========");


  try {

    if (!currentUserId || !userId) return;

    const followId = `${currentUserId}_${userId}`;

    const followRef = doc(db, "follows", followId);

    const followSnap = await getDoc(followRef);

    if (followSnap.exists()) {

      await deleteDoc(followRef);

      setIsFollowing(false);

      console.log("UNFOLLOWED");

    } else {

      await setDoc(followRef, {
        followerId: currentUserId,
        followingId: userId,
      });



const currentUserRef =
  doc(db, "users", currentUserId);

const currentUserSnap =
  await getDoc(currentUserRef);

const currentUserData =
  currentUserSnap.data();

await addDoc(
  collection(
    db,
    "users",
    userId,
    "notifications"
  ),
  {
    type: "follow",

    senderId: currentUserId,

    senderName:
      currentUserData?.username || "User",

    senderPhoto:
      currentUserData?.profileImg || "",

    createdAt:
      serverTimestamp(),
  }
);



      setIsFollowing(true);
   

      console.log("FOLLOWED");
    }

  } catch (error) {
    console.log(error);
  }
};



const handleBlockUser = async () => {



  Alert.alert(
    "Block User",
    "Do you want to block this user?",
    [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Block",
        style: "destructive",

        onPress: async () => {

          try {

            const myId = auth.currentUser?.uid;

if (!myId) {
  router.push("/login");
  return;
}


const userSnap = await getDoc(
  doc(db, "users", userId)
);

const blockedUser = userSnap.data();


          await setDoc(
  doc(db, "blockedUsers", `${myId}_${userId}`),
  {
    blockerId: myId,

    blockedUserId: userId,

    username: blockedUser.username,

    profileImg: blockedUser.profileImg,

    createdAt: serverTimestamp(),
  }
);

            // remove follow
            await deleteDoc(
              doc(db, "follows", `${myId}_${userId}`)
            );

            await deleteDoc(
              doc(db, "follows", `${userId}_${myId}`)
            );

            setMenuVisible(false);

            Alert.alert(
              "Success",
              "User blocked successfully."
            );

            router.replace("/(tabs)");

          } catch (e) {

            console.log(e);

          }

        },

      },

    ]
  );

};



const reportUser = async () => {

try {

await addDoc(
collection(db, "all_videos"),
{
userId: userId,

caption: userData?.username || "Reported User",

thumbnail:
userData?.profileImg ||

"https://cdn-icons-png.flaticon.com/512/3135/3135715.png",

reportCount: 1,

reviewRequired: true,

hidden: false,
}
);

alert("Reported Successfully");

setMenuVisible(false);

} catch (error) {

console.log(error);

}

};





const handleShareProfile = async () => {
  try {
    await Share.share({
      message:
        `Check out ${userData?.username}'s profile on TopKing.\n\n` +
        `https://topking.app/profile/${userId}`,
    });

    setMenuVisible(false);

  } catch (error) {
    console.log(error);
  }
};



  const openChat = async () => {



const myId = auth.currentUser?.uid;

if (!myId) {
  router.push("/login");
  return;
}

if (myId) {

  const blockMe = await getDoc(
    doc(db, "blockedUsers", `${myId}_${userId}`)
  );

  const blockedByUser = await getDoc(
    doc(db, "blockedUsers", `${userId}_${myId}`)
  );

  if (blockMe.exists() || blockedByUser.exists()) {

    setIsBlocked(true);

    Alert.alert(
      "Blocked",
      "This profile is unavailable."
    );

    router.back();
    return;
  }

}
  

  router.push({
    pathname: "/chat",
    params: {
      userId: userId,
      username: userData?.username,
      profileImg: userData?.profileImg,
    },
  });

};




const fetchUser = async () => {
setLoading(true);

  try {
    if (!userId) return;


const myId = auth.currentUser?.uid;

const blockMe = await getDoc(
  doc(db, "blockedUsers", `${myId}_${userId}`)
);

const blockedByUser = await getDoc(
  doc(db, "blockedUsers", `${userId}_${myId}`)
);

if (blockMe.exists() || blockedByUser.exists()) {

  setIsBlocked(true);

  Alert.alert(
    "Blocked",
    "This profile is unavailable."
  );

  router.back();

  return;
}




    const userRef = doc(db, "users", userId);

console.log("FETCHING USER =", userId);


    const userSnap = await getDoc(userRef);


  if (userSnap.exists()) {

  setUserData(userSnap.data());


      console.log("USER DATA =", userSnap.data());



const walletSnap = await getDoc(doc(db, "wallets", userId));

if (walletSnap.exists()) {
  setUserLevel(walletSnap.data().level || 0);
}

setIsVerified(userSnap.data().verified === true);


    } 
    
    
    else {
      console.log("User not found");
    }
  } catch (error) {
    console.log("PROFILE ERROR =", error);



   setLoading(false);



  }
};


const onRefresh = async () => {

  try {

    setRefreshing(true);

    getCurrentUser();

    await Promise.all([
      fetchUser(),
      fetchVideos(),
      loadLikedVideos(),
      fetchFollowCounts(),
    ]);

    await checkFollowStatus();

  } catch (error) {

    console.log("REFRESH ERROR =", error);

  } finally {

    setRefreshing(false);

  }

};




console.log("USER UID =", userId);





  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.topBar}>
        <View style={styles.userRow}>
          <Image
  source={{
    uri:
     userData?.profileImg ||
      "https://avatar.iran.liara.run/public/65",
  }}
  style={styles.smallAvatar}
/>
    

<View
  style={{
    flexDirection: "row",
    alignItems: "center",
  }}
>
  <Text style={styles.topUsername}>
    @{userData?.username}
  </Text>

  {isVerified && (
<View
style={{
marginLeft:5
}}
>

<MaterialCommunityIcons
name="check-decagram"
size={18}
color={verifiedTickColor}
/>



</View>
)}


</View>


        </View>

      <TouchableOpacity
onPress={() => setMenuVisible(true)}
>
  <Ionicons
    name="ellipsis-vertical"
    size={23}
    color="#ffffff"
  />
</TouchableOpacity>
      </View>

      <FlatList
  data={activeTab === "Videos" ? videos : likedVideos}

refreshControl={
  <RefreshControl
    refreshing={refreshing}
    onRefresh={onRefresh}
    colors={["#FFD700"]}
    tintColor="#FFD700"
  />
}

        keyExtractor={(item, index) => index.toString()}
        numColumns={3}
        showsVerticalScrollIndicator={false}

contentContainerStyle={{
    paddingBottom: 150,
  }}

        ListHeaderComponent={
          <>
            {/* Profile Section */}
            <View style={styles.profileRow}>

<Image
  source={{
    uri:
      userData?.profileImg ||
      "https://avatar.iran.liara.run/public/65",
  }}
  style={styles.profileImage}
/>

              <View style={styles.rightSection}>
   
<View
  style={{
    flexDirection: "row",
    alignItems: "center",
  }}
>





<View
  style={{
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  }}
>

  <Text
    style={{
      color: "#fff",
      fontSize: 17,
      fontWeight: "bold",
      flexShrink: 1,
    }}
    numberOfLines={1}
    ellipsizeMode="tail"
  >
    @{userData?.username}
  </Text>

  {isVerified && (
   <MaterialCommunityIcons
  name="check-decagram"
  size={18}
  color={verifiedTickColor}
  style={{
    marginLeft: 3,
  }}
/>
  )}

  <View
    style={{
      marginLeft: 4,
      backgroundColor: levelTheme.bg,
      borderColor: levelTheme.border,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 15,
      flexDirection: "row",
      alignItems: "center",
    }}
  >
    <MaterialCommunityIcons
      name="diamond-stone"
      size={11}
      color={levelTheme.icon}
    />

    <Text
      style={{
        color: levelTheme.text,
        fontWeight: "bold",
        marginLeft: 2,
        fontSize: 10,
      }}
    >
      LV {userLevel}
    </Text>
  </View>

</View>





</View>


    <Text style={styles.category}>
  {userData?.category || "User"}
</Text>

<View style={styles.statsRow}>


                <TouchableOpacity
  style={styles.statBox}
 onPress={async () => {

setActiveFollowTab("followers");

await loadFollowers();

setFollowersModalVisible(true);

}}
>
  <Text style={styles.statNumber}>
    {followersCount}
  </Text>

  <Text style={styles.statLabel}>
    Followers
  </Text>
</TouchableOpacity>

                
<TouchableOpacity
  style={styles.statBox}
 onPress={async () => {

setActiveFollowTab("following");

await loadFollowing();

setFollowersModalVisible(true);

}}

>
  <Text style={styles.statNumber}>
    {followingCount}
  </Text>

  <Text style={styles.statLabel}>
    Following
  </Text>
</TouchableOpacity>


                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>
  {totalLikes}
</Text>
             <Text style={styles.statLabel}>Likes</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Bio */}
            <View style={styles.bioBox}>
              <Text style={styles.bioTitle}>Bio</Text>
     <Text style={styles.bioText}>
  {userData?.bioText ? userData?.bioText : "No Bio"}
</Text>
            </View>



  {/* Both Follow Each Other */}
{!isBlocked && (

<View style={styles.buttonRow}>

{/* Friends */}
{isFollowing && isFollowBack ? (

<>
<TouchableOpacity
style={styles.messageBtn}
onPress={openChat}
>
<Text style={styles.messageText}>
Message
</Text>
</TouchableOpacity>
</>

)

/* Main follows user but user doesn't follow back */
: isFollowing ? (

<TouchableOpacity
style={styles.followBtn}
onPress={handleFollow}
>
<Text style={styles.followText}>
Following
</Text>
</TouchableOpacity>

/* User follows me but I don't follow him */
) : isFollowBack ? (

<TouchableOpacity
style={styles.followBtn}
onPress={handleFollow}
>
<Text style={styles.followText}>
Follow Back
</Text>
</TouchableOpacity>

) : (

<TouchableOpacity
style={styles.followBtn}
onPress={handleFollow}
>
<Text style={styles.followText}>
Follow
</Text>
</TouchableOpacity>

)}

<TouchableOpacity style={styles.instaBtn}>
  <Image
    source={TopKingLogo}
    style={{
      width: 40,
      height: 40,
      resizeMode: "contain",
    }}
  />
</TouchableOpacity>

</View>

)}





{/* Badges / Rank Block */}
<View style={styles.premiumCard}>

  {/* Rank */}
  <TouchableOpacity
    style={styles.premiumItem}
    activeOpacity={0.8}
  >
    <MaterialCommunityIcons
      name="star-four-points"
      size={20}
      color="#FFD700"
    />

    <View style={{ marginLeft: 8 }}>
      <Text style={styles.premiumSmallText}>
        Rank
      </Text>

      <Text style={styles.premiumTitle}>
        No.1
      </Text>
    </View>

    <Ionicons
      name="chevron-forward"
      size={18}
      color="#777"
      style={{ marginLeft: 8 }}
    />
  </TouchableOpacity>

  <View style={styles.premiumDivider} />

  {/* Angels */}
  <TouchableOpacity
    style={styles.premiumItem}
    activeOpacity={0.8}
  >
    <View>

      <Text style={styles.premiumTitle}>
        Angels
      </Text>

      <View style={styles.memberRow}>

    <View style={styles.memberRow}>

  {topGifters.map((item, index) => (

    <Image
      key={item.uid}
      source={{ uri: item.photo }}
      style={[
        styles.memberImg,
        {
          marginLeft: index === 0 ? 0 : -12,
          zIndex: 3 - index,
        },
      ]}
    />

  ))}

  <Text
    style={{
      color: "#FFD700",
      fontSize: 15,
      fontWeight: "bold",
      marginLeft: 10,
    }}
  >
    {giftUserCount}
  </Text>

</View>

      </View>

    </View>

    <Ionicons
      name="chevron-forward"
      size={18}
      color="#777"
      style={{ marginLeft: "auto" }}
    />
  </TouchableOpacity>

  <View style={styles.premiumDivider} />

  {/* Share */}
  <TouchableOpacity
    style={styles.shareButton}
    activeOpacity={0.8}
    onPress={handleShareProfile}
  >
    <Ionicons
      name="share-social"
      size={18}
      color="#FFD700"
    />

    <Text style={styles.shareText}>
      Share
    </Text>
  </TouchableOpacity>

</View>



            {/* Tabs */}
 <View style={styles.tabContainer}>

<TouchableOpacity
style={
activeTab==="Videos"
? styles.activeTab
: styles.tab
}
onPress={() => setActiveTab("Videos")}
>

<Text
style={
activeTab==="Videos"
? styles.activeTabText
: styles.tabText
}
>
Video ({videos.length})
</Text>

</TouchableOpacity>


<TouchableOpacity
style={
activeTab==="Likes"
? styles.activeTab
: styles.tab
}
onPress={() => setActiveTab("Likes")}
>

<Text
style={
activeTab==="Likes"
? styles.activeTabText
: styles.tabText
}
>
Like ({likedVideos.length})
</Text>

</TouchableOpacity>

</View>

          </>
        }




renderItem={({ item, index }) => {

const currentList =
  activeTab === "Videos"
    ? videos
    : likedVideos;

return (


  <TouchableOpacity
    style={styles.videoCard}

onPress={() => {


router.navigate({
  pathname: "/allvideo",
  params: {
    videoId: item.id,
    userId: userId,

    from: "userProfile",


    videos: JSON.stringify(currentList),

index: currentList.findIndex(
  (v) => v.id === item.id
),

    videoUrl: item.videoUrl || item.video,
    username: userData?.username,
    caption: item.caption,
    likes: item.likes,
    commentsCount: item.commentsCount,
    shares: item.shares,
    views: item.views,
    profile: userData?.profileImg,
  },
});


}}

  >


<Image
  source={{ uri: item.thumbnail }}
  style={styles.video}
  fadeDuration={0}
/>

<View style={styles.videoOverlayViews}>
  <Ionicons name="eye-outline" size={12} color="#fff" />
  <Text style={styles.viewCountText}>
    {item.views || 0}
  </Text>
</View>

<View style={styles.videoTitleRow}>
  <View
    style={{
      flexDirection: "row",
      alignItems: "center"
    }}
  >
    <MaterialCommunityIcons
      name="play"
      size={16}
      color="#FFD700"
    />

    <Text
      style={styles.videoItemTitle}
      numberOfLines={1}
    >
      {item.title || "video"}
    </Text>
  </View>

  <MaterialCommunityIcons
    name="dots-vertical"
    size={16}
    color="#fff"
  />
</View>

  </TouchableOpacity>
)}}
/>

   


      <Modal
transparent
visible={menuVisible}
animationType="fade"
>

<View style={styles.modalBg}>

  <TouchableOpacity
style={StyleSheet.absoluteFill}
activeOpacity={1}
onPress={() => setMenuVisible(false)}
/>

<View style={styles.menuBox}>

<TouchableOpacity
style={styles.menuItem}
onPress={handleShareProfile}
>
<Text style={styles.menuText}>
Share Profile
</Text>
</TouchableOpacity>


{isFollowing && isFollowBack && (

<TouchableOpacity
style={styles.menuItem}
onPress={()=>{
setMenuVisible(false);
handleFollow();
}}
>
<Text style={styles.menuText}>
Unfollow
</Text>
</TouchableOpacity>

)}




<TouchableOpacity
  style={styles.menuItem}
  onPress={() => {

    setMenuVisible(false);

    router.push({
      pathname: "/chat",
      params: {
        userId: userId,
        username: userData?.username,
        profileImg: userData?.profileImg,
      },
    });

  }}
>
  <Text style={styles.menuText}>
    Message
  </Text>
</TouchableOpacity>



<TouchableOpacity
  style={styles.menuItem}
  onPress={handleBlockUser}
>
  <Text style={[styles.menuText,{color:"red"}]}>
    Block
  </Text>
</TouchableOpacity>


<TouchableOpacity
style={styles.menuItem}
onPress={()=>{
setMenuVisible(false);

router.push({
pathname:"/report",
params:{
reportedUserId:userId
}
});

}}
>

<Text style={[styles.menuText,{color:"red"}]}>
Report
</Text>
</TouchableOpacity>


<TouchableOpacity
style={styles.menuItem}
onPress={()=>setMenuVisible(false)}
>
<Text style={styles.menuText}>
Close
</Text>
</TouchableOpacity>

</View>

</View>

</Modal>






<Modal
visible={followersModalVisible}
animationType="slide"
onRequestClose={()=>{
setFollowersModalVisible(false);
}}
>

<SafeAreaView
style={{
flex:1,
backgroundColor:"#000"
}}
>

<TouchableOpacity
onPress={()=>
setFollowersModalVisible(false)
}
style={{padding:15}}
>
<Text
style={{
color:"#FFD700",
fontSize:18
}}
>
Close
</Text>
</TouchableOpacity>


<View
style={{
flexDirection:"row",
justifyContent:"center",
marginBottom:15
}}
>

<TouchableOpacity
onPress={()=>
setActiveFollowTab("followers")
}
style={{
backgroundColor:
activeFollowTab==="followers"
?"#FFD700":"#222",
paddingHorizontal:20,
paddingVertical:10,
borderRadius:25,
marginRight:10
}}
>

<Text
style={{
color:
activeFollowTab==="followers"
?"#000":"#fff"
}}
>
Followers
</Text>

</TouchableOpacity>


<TouchableOpacity
onPress={async()=>{

setActiveFollowTab("following");

await loadFollowing();

}}
style={{
backgroundColor:
activeFollowTab==="following"
?"#FFD700":"#222",
paddingHorizontal:20,
paddingVertical:10,
borderRadius:25
}}
>

<Text
style={{
color:
activeFollowTab==="following"
?"#000":"#fff"
}}
>
Following
</Text>

</TouchableOpacity>

</View>



<FlatList
data={
activeFollowTab==="followers"
? followersList
: followingList
}
keyExtractor={(item)=>item.id}


renderItem={({item})=>{

const alreadyFollowing =
followingList.some(
u => u.id === item.id
);

const currentList =
  activeTab === "Videos"
    ? videos
    : likedVideos;


return(

<View
style={{
flexDirection:"row",
alignItems:"center",
padding:15,
}}
>

<TouchableOpacity
style={{
flexDirection:"row",
alignItems:"center",
flex:1,
}}
onPress={() => {

setFollowersModalVisible(false);

router.push({
pathname:"/userProfile",
params:{
userId:item.id,
},
});

}}
>

<TouchableOpacity
  onPress={() => {
    setFollowersModalVisible(false);

    router.push({
      pathname: "/userProfile",
      params: {
        userId: item.id,
      },
    });
  }}
>
  <Image
    source={{ uri: item.profileImg }}
    style={{
      width: 50,
      height: 50,
      borderRadius: 25,
    }}
  />
</TouchableOpacity>


<View
  style={{
    marginLeft: 10,
    flex: 1, // important
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
  }}
>

  


<TouchableOpacity
  onPress={() => {
    setFollowersModalVisible(false);

    router.push({
      pathname: "/userProfile",
      params: {
        userId: item.id,
      },
    });
  }}
>
  <Text
    style={{
      color: "#fff",
      fontSize: 14,
      fontWeight: "bold",
    }}
    numberOfLines={1}
  >
    {item.username}
  </Text>
</TouchableOpacity>



  {/* Verified */}
{item.verified && (
<View
style={{
marginLeft:2
}}
>

<MaterialCommunityIcons
name="check-decagram"
size={14}
color={
item.verifiedColor === "yellow"
? "#FFD700"
: "#f9fdff"
}
/>



</View>

)}

  {/* Premium Level */}
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
      size={9}
      color={getLevelTheme(item.level).icon}
    />

    <Text
      style={{
        color: getLevelTheme(item.level).text,
        fontSize: 9,
        fontWeight: "bold",
        marginLeft: 3,
      }}
    >
      LV {item.level}
    </Text>

</View>

</View>

  </TouchableOpacity>









{item.iFollow && item.followsMe ? (

<TouchableOpacity
style={{
backgroundColor:"#222",
width:95,
height:36,
borderRadius:20,
justifyContent:"center",
alignItems:"center"
}}
onPress={() =>
router.push({
pathname:"/chat",
params:{
userId:item.id,
username:item.username,
profileImg:item.profileImg
}
})
}
>

<Text
style={{
color:"#fff",
fontWeight:"bold"
}}
>
Message
</Text>

</TouchableOpacity>

) : item.followsMe ? (

<TouchableOpacity
style={{
backgroundColor:"#FFD700",
width:95,
height:36,
borderRadius:20,
justifyContent:"center",
alignItems:"center"
}}
onPress={()=>handleFollowBack(item)}
>

<Text
style={{
color:"#000",
fontWeight:"bold"
}}
>
Follow Back
</Text>

</TouchableOpacity>

) : item.iFollow ? (

<TouchableOpacity
style={{
backgroundColor:"#222",
width:95,
height:36,
borderRadius:20,
justifyContent:"center",
alignItems:"center"
}}
>

<Text
style={{
color:"#fff",
fontWeight:"bold"
}}
>
Following
</Text>

</TouchableOpacity>

) : (

<TouchableOpacity
style={{
backgroundColor:"#FFD700",
width:95,
height:36,
borderRadius:20,
justifyContent:"center",
alignItems:"center"
}}
onPress={()=>handleFollowBack(item)}
>

<Text
style={{
color:"#000",
fontWeight:"bold"
}}
>
Follow
</Text>

</TouchableOpacity>

)}


</View>

);

}}

/>

</SafeAreaView>

</Modal>


      {/* Bottom Navigation */}
 <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 15,
    marginTop: 35,
    marginBottom: 40,
  },

  userRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  smallAvatar: {
    width: 30,
    height: 30,
    borderRadius: 25,
  },

  topUsername: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
    marginLeft: 10,
  },

  profileRow: {
    flexDirection: "row",
    paddingHorizontal: 18,
  },

  profileImage: {
    width: 85,
    height: 85,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "#FFD700",
  },

  rightSection: {
    flex: 1,
    marginLeft: 15,
    justifyContent: "center",
  },

  username: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
  },

  category: {
    color: "#FFD700",
    fontSize: 13,
    marginTop: 5,
  },

statsRow: {
  flexDirection: "row",
  justifyContent: "flex-start",
  alignItems: "center",
  marginTop: 20,
},

statBox: {
  alignItems: "center",
  marginRight: 30, // gap adjust kar sakte ho
},

  statNumber: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
  },

  statLabel: {
    color: "#777",
    fontSize: 13.5,
    marginTop: 5,
  },

  bioBox: {
    paddingHorizontal: 20,
    marginTop: 12,
  },

  bioTitle: {
    color: "#999",
    fontSize: 15,
  },

  bioText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
    marginTop: 5,
  },

  buttonRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginTop: 25,
  },

followBtn: {
  flex: 1,
  height: 45,
  borderRadius: 12,
  justifyContent: "center",
  alignItems: "center",
  backgroundColor: "#FFD700",

  borderWidth: 1,
  borderColor: "#E6C200",
},

  followText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "700",
  },

messageBtn: {
  flex: 1,
  height: 45,
  borderRadius: 12,
  justifyContent: "center",
  alignItems: "center",

  backgroundColor: "#2c2929",

  borderWidth: 2,
  borderColor: "#FFD700",
},

messageText: {
  color: "#fff",
  fontSize: 16,
  fontWeight: "700",
},


  instaBtn: {
    width: 100,
    marginLeft: 15,
    backgroundColor: "#111",
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },

  tabContainer: {
    flexDirection: "row",
    
    marginHorizontal: 20,
    marginTop: 15,
    borderRadius: 0,
    paddingVertical: 12,
    justifyContent: "space-around",
  },

  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: "#FFD700",
  },

  activeTabText: {
  color: "#fff",
  fontSize: 16,
  fontWeight: "bold",
},

tabText: {
  color: "#ecc815",
  fontSize: 16,
},


videoCard: {
  width: ITEM_WIDTH,
  height: 170,
  backgroundColor: "#0b0b0b",
  borderRadius: 5,
  margin: 4,
  overflow: "hidden",
},

viewsBox: {
  position: "absolute",
  top: 145,
  left: 8,

  flexDirection: "row",
  alignItems: "center",

  backgroundColor: "rgba(0,0,0,0.7)",

  paddingHorizontal: 5,
  paddingVertical: 2,

  borderRadius: 8,

  borderWidth: 1,
  borderColor: "#FFD700",
},

  viewsText: {
    color: "#fff",
    marginLeft: 4,
  },

  videoBottom: {
    position: "absolute",
    bottom: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },

modalBg:{
flex:1,
backgroundColor:"rgba(0,0,0,0.5)",
justifyContent:"flex-start",
alignItems:"flex-end",
},

menuBox:{
width:180,
backgroundColor:"#111",
borderRadius:15,
marginTop:80,
marginRight:15,
paddingVertical:10,
},

menuItem:{
padding:18,
},

menuText:{
color:"#fff",
fontSize:16,
},



  videoTitle: {
    color: "#fff",
    fontSize: 12,
    width: 70,
  },



friendBox: {
  width: 250,
  backgroundColor: "#111",
  borderRadius: 20,
  paddingVertical: 15,
  marginTop: 150,
  marginRight: 20,
},

friendTitle: {
  color: "#FFD700",
  fontSize: 20,
  fontWeight: "bold",
  textAlign: "center",
  marginBottom: 10,
},


video: {
  width: "100%",
  height: "100%",
},

videoOverlayViews: {
  position: "absolute",
  top: 8,
  left: 8,
  flexDirection: "row",
  alignItems: "center",
},

viewCountText: {
  color: "#fff",
  marginLeft: 4,
  fontSize: 12,
},

videoTitleRow: {
  position: "absolute",
  bottom: 8,
  left: 8,
  right: 8,
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
},

videoItemTitle: {
  color: "#fff",
  marginLeft: 4,
  width: 60,
  fontSize: 12,
},

levelBadge: {
  marginLeft: 5,
  borderWidth: 1,
  paddingHorizontal: 5,
  paddingVertical: 2,
  borderRadius: 12,
  flexDirection: "row",
  alignItems: "center",
},


premiumCard:{
    marginTop:20,
    marginHorizontal:18,
    backgroundColor:"#181818",
    borderRadius:12,
    flexDirection:"row",
    alignItems:"center",
    paddingVertical:5,

    borderWidth:1,
    borderColor:"#2c2c2c",

    shadowColor:"#FFD700",
    shadowOpacity:0.30,
    shadowRadius:12,
    shadowOffset:{
        width:0,
        height:4,
    },

    elevation:10,
},

premiumItem:{
    flex:1,
    flexDirection:"row",
    alignItems:"center",
    justifyContent:"center",
},

premiumSmallText:{
    color:"#888",
    fontSize:11,
},

premiumTitle:{
    color:"#fff",
    fontSize:15,
    fontWeight:"700",
},

premiumDivider:{
    width:1,
    height:34,
    backgroundColor:"#333",
},

shareButton:{
    backgroundColor:"#3d3200",
    paddingHorizontal:16,
    paddingVertical:9,
    borderRadius:12,
    flexDirection:"row",
    alignItems:"center",
    marginHorizontal:10,
},

shareText:{
    color:"#FFD700",
    fontWeight:"bold",
    marginLeft:6,
},


memberRow:{
    flexDirection:"row",
    marginTop:6,
},

memberImg:{
    width:24,
    height:24,
    borderRadius:12,
    borderWidth:2,
    borderColor:"#181818",
},


  });        