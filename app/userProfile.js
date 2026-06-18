
import {
  View,
  Text,
  StyleSheet,
  Image,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import React, { useEffect, useState } from "react";
import {
  useLocalSearchParams,
  useFocusEffect
} from "expo-router";

import { db } from "./firebaseConfig";

import { auth } from "./firebaseConfig";

import {
  doc,
  getDoc,
  collection,
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


import BottomNav from "../components/BottomNav";

const { width } = Dimensions.get("window");
const ITEM_WIDTH = width / 3 - 6;

export default function UserProfile() {
 

const [videos, setVideos] = useState([]);

const [userData, setUserData] = useState(null);

const [totalLikes, setTotalLikes] = useState(0);

const [followersCount, setFollowersCount] = useState(0);
const [followingCount, setFollowingCount] = useState(0);

const [currentUserId, setCurrentUserId] = useState("");
const [isFollowing, setIsFollowing] = useState(false);

const [isFollowBack, setIsFollowBack] = useState(false);

const { userId } = useLocalSearchParams();
console.log("USER PROFILE PARAM =", userId);


useEffect(() => {
  console.log("OPEN PROFILE ID =", userId);
}, [userId]);

const router = useRouter();

console.log("PARAM USER ID =", userId);

useEffect(() => {
  getCurrentUser();
  fetchUser();
  fetchVideos();
  fetchFollowCounts();
}, [userId]);


useFocusEffect(
  React.useCallback(() => {

    console.log("PROFILE REFRESH");

    fetchUser();
    fetchVideos();
    fetchFollowCounts();

  }, [userId])
);




useEffect(() => {

  if (currentUserId) {
    checkFollowStatus();
  }

}, [currentUserId]);

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

    setVideos(videoList);
    setTotalLikes(likesCount);

    console.log("TOTAL LIKES =", likesCount);

  } catch (error) {
    console.log("VIDEO ERROR =", error);
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




const handleFollow = async () => {



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

      setFollowersCount(prev => prev - 1);

      setIsFollowing(false);

      await checkFollowStatus();

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



      setFollowersCount(prev => prev + 1);

      setIsFollowing(true);
      await checkFollowStatus();

      console.log("FOLLOWED");
    }

  } catch (error) {
    console.log(error);
  }
};



  const openChat = () => {

  router.push({
    pathname: "/chat",
    params: {
      userId: userId,
      username: userData.username,
      profileImg: userData.profileImg,
    },
  });

};




const fetchUser = async () => {




  try {
    if (!userId) return;

    const userRef = doc(db, "users", userId);

console.log("FETCHING USER =", userId);


    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      setUserData(userSnap.data());
      console.log("USER DATA =", userSnap.data());
    } else {
      console.log("User not found");
    }
  } catch (error) {
    console.log("PROFILE ERROR =", error);
  }
};


console.log("USER UID =", userId);

if (!userData) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#000",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text style={{ color: "#fff" }}>
        Loading...
      </Text>
    </View>
  );
}


  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.topBar}>
        <View style={styles.userRow}>
          <Image
  source={{
    uri:
      userData.profileImg ||
      "https://avatar.iran.liara.run/public/65",
  }}
  style={styles.smallAvatar}
/>
          <Text style={styles.topUsername}>
  @{userData.username}
</Text>
        </View>

        <TouchableOpacity>
          <Ionicons name="arrow-redo-outline" size={32} color="#FFD700" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={videos}
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
      userData.profileImg ||
      "https://avatar.iran.liara.run/public/65",
  }}
  style={styles.profileImage}
/>

              <View style={styles.rightSection}>
                <Text style={styles.username}>
  @{userData.username}
</Text>

    <Text style={styles.category}>
  {userData.category || "User"}
</Text>

                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
  <Text style={styles.statNumber}>
  {followersCount}
</Text>
                    <Text style={styles.statLabel}>Followers</Text>
                  </View>

                  <View style={styles.statBox}>
   <Text style={styles.statNumber}>
  {followingCount}
</Text>
                    <Text style={styles.statLabel}>Following</Text>
                  </View>

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
  {userData.bioText ? userData.bioText : "No Bio"}
</Text>
            </View>




            {/* Follow Button */}

      <View style={styles.buttonRow}>

  {/* Both Follow Each Other */}

  {isFollowing && isFollowBack ? (

   <TouchableOpacity
  style={styles.messageBtn}
  onPress={openChat}
>
  <Text style={styles.messageText}>
    Message
  </Text>
</TouchableOpacity>

  ) : (

    <TouchableOpacity
      style={styles.followBtn}
      onPress={handleFollow}
    >
      <Text style={styles.followText}>

        {isFollowing
          ? "Following"
          : isFollowBack
          ? "Follow Back"
          : "Follow"}

      </Text>
    </TouchableOpacity>

  )}

  <TouchableOpacity style={styles.instaBtn}>





    <Ionicons
      name="logo-instagram"
      size={30}
      color="#FFD700"
    />
  </TouchableOpacity>

</View>

            {/* Tabs */}
            <View style={styles.tabContainer}>
              <TouchableOpacity style={styles.activeTab}>
                <Text style={styles.activeTabText}>Video</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.tab}>
                <Text style={styles.tabText}>Like</Text>
              </TouchableOpacity>
            </View>
          </>
        }
renderItem={({ item, index }) => (
  <TouchableOpacity
    style={styles.videoCard}

onPress={() => {



 router.push({
  pathname: "/allvideo",
  params: {
    videoId: item.id,
    userId: userId,   // ADD THIS

  videos: JSON.stringify(videos),
index: videos.findIndex(
  (v) => v.id === item.id
),

    videoUrl: item.videoUrl || item.video,
    username: userData.username,
    caption: item.caption,
    likes: item.likes,
    commentsCount: item.commentsCount,
    shares: item.shares,
    views: item.views,
    profile: userData.profileImg,
  },
});

}}

  >
    <Image
      source={{ uri: item.thumbnail }}
      style={{
        width: "100%",
        height: "100%",
      }}
    />


<View style={styles.viewsBox}>
  <Ionicons
    name="eye"
    size={14}
    color="#FFD700"
  />

  <Text style={styles.viewsText}>
    {item.views || 0}
  </Text>
</View>


  </TouchableOpacity>
)}
/>

          

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
    fontSize: 20,
    fontWeight: "bold",
  },

  category: {
    color: "#FFD700",
    fontSize: 13,
    marginTop: 5,
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 15,
  },

  statBox: {
    alignItems: "center",
  },

  statNumber: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },

  statLabel: {
    color: "#777",
    fontSize: 12,
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
    backgroundColor: "#0a0a0a",
    marginHorizontal: 20,
    marginTop: 35,
    borderRadius: 30,
    paddingVertical: 12,
    justifyContent: "space-around",
  },

  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: "#FFD700",
  },

  activeTabText: {
    color: "#fff",
    fontSize: 22,
  },

  tab: {},

  tabText: {
    color: "#fff",
    fontSize: 22,
  },

 videoCard: {
  width: ITEM_WIDTH,
  height: 180,
  backgroundColor: "#0b0b0b",
  borderRadius: 16,
  margin: 3,
  overflow: "hidden",

  position: "relative",
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

  videoTitle: {
    color: "#fff",
    fontSize: 12,
    width: 70,
  },
  });