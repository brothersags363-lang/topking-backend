 import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import TopKingLogo from "../../assets/images/topking-logo.png";
// FIREBASE CONFIG
import { auth, db } from '../firebaseConfig';



import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';

import { GoogleSignin } from '@react-native-google-signin/google-signin';


const { width } = Dimensions.get('window');
const ITEM_SIZE = (width - 30) / 3;



export default function ProfileScreen() {


  
  const router = useRouter();
  const pathname = usePathname();
  const isFocused = useIsFocused();
  const params = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [videos, setVideos] = useState([]);
const [likedVideos, setLikedVideos] = useState([]);
const [likedMeCount, setLikedMeCount] = useState(0);
const [followersModalVisible, setFollowersModalVisible] =
  useState(false);

  const [userProfileVisible, setUserProfileVisible] =
useState(false);

const [selectedUser, setSelectedUser] =
useState(null);

const [followersList, setFollowersList] =
  useState([]);



const [followingList, setFollowingList] =
  useState([]);


const [followingIds, setFollowingIds] = useState(new Set());

const [activeFollowTab, setActiveFollowTab] =
  useState("followers");

const [followersLoading, setFollowersLoading] = useState(false);
const [followingLoading, setFollowingLoading] = useState(false);

  

const [userRank, setUserRank] = useState(null);


  const [activeTab, setActiveTab] = useState('Videos');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [genderModalVisible, setGenderModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

const [joinedAgency, setJoinedAgency] = useState(false);

const [topGifters, setTopGifters] = useState([]);
const [giftUserCount, setGiftUserCount] = useState(0);
const [refreshing, setRefreshing] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [hasAgency, setHasAgency] = useState(false);
  const [playModalVisible, setPlayModalVisible] = useState(false);
const [commentMenuVisible, setCommentMenuVisible] =
useState(false);

const [selectedComment, setSelectedComment] =
useState(null);


  const player = useVideoPlayer(
  selectedVideo?.videoUrl || '',
  (player) => {
  player.loop = true;
    player.play();
  }
 ); 



useEffect(() => {
  if (!playModalVisible) {
    player.pause();
  }
 }, [playModalVisible]);
  
  // Current user email track karne ke liye state
  const [userEmail, setUserEmail] = useState('');

  // Main UI State
  const [profileData, setProfileData] = useState({
    
  name: 'User',
  username: 'user',
    bioText: 'bio.........',
    category: 'Video Creator',
    gender: 'Male', 
   followers: '0',
following: '0',
likes: '0',
    profileImg: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
  });

  
  // Edit form inputs ke liye individual states
  const [tempName, setTempName] = useState('');
  const [tempUsername, setTempUsername] = useState('');
  const [tempBioText, setTempBioText] = useState('');
  const [tempCategory, setTempCategory] = useState('');
  const [tempGender, setTempGender] = useState('');
  const [tempProfileImg, setTempProfileImg] = useState('');
  const videoCount = videos.length;
  const categories = [
  'Video Creator',
  'Gaming',
  'Comedy',
  'Education',
  'Technology',
  'Business',
  'Fashion',
  'Beauty',
  'Fitness',
  'Food',
  'Travel',
  'Music',
  'Dance',
  'Photography',
  'Sports',
  'News',
  'Motivation',
  'Lifestyle',
  'Entertainment',
  'Influencer',
];

  // Mobile Hardware Back Button Logic
  useEffect(() => {
    const handleBackButton = () => {
if (followersModalVisible) {
  setFollowersModalVisible(false);
  return true;
}


      if (playModalVisible) {
  player.pause();
  setSelectedVideo(null);
  setPlayModalVisible(false);
  return true;

      }

  if (genderModalVisible) {
  setGenderModalVisible(false);
  return true;
}

if (categoryModalVisible) {
  setCategoryModalVisible(false);
  return true;
}

      if (editModalVisible) {
        setEditModalVisible(false);
        return true;
      }
      if (menuVisible) {
        setMenuVisible(false);
        return true;
      }
      router.replace("/");
     
      return true;
    };

    const backHandlerSubscription = BackHandler.addEventListener('hardwareBackPress', handleBackButton);
    
    return () => {
      backHandlerSubscription.remove();
    };

}, [
  playModalVisible,
  editModalVisible,
  genderModalVisible,
  categoryModalVisible,
  menuVisible,
  followersModalVisible
]);

  // Authentication & Profile Setup
  
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      setLoading(false);
      router.replace('/login');
      return;
    }

    setUserEmail(user.email || '');

    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      let core = null;

      if (!userSnap.exists()) {
        const newUserData = {
          name: user.displayName || 'User',
          username: user.email?.split('@')[0].toLowerCase().trim() || 'user',
          bioText: 'bio.........',
          category: 'Video Creator',
          gender: 'Male',
          followers: '0',
          following: '0',
          likes: '0',
          uploadStatus: false,
          profileImg:
            user.photoURL ||
            'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        };

        await setDoc(userRef, newUserData);
        setProfileData((prev) => ({ ...prev, ...newUserData }));
      } else {
        // Fast path: just the fields the header needs (name/username/photo/
        // bio + level), fetched in parallel. This is what lets the profile
        // info show up before the video thumbnails, instead of after.
        core = await fetchCoreProfile(user.uid, userSnap);
      }

      // Header is ready — stop showing the spinner now, don't wait for
      // videos/stats/badges too.
      setLoading(false);

      // Video thumbnails load right after the header.
      const videoData = await loadVideos(user.uid);

      // These reuse data we already fetched above instead of re-querying
      // all_videos / users again.
      setJoinedAgency(!!core?.userData?.agencyId);
      setLikedMeCount(videoData.totalLikes);

      if (
        core?.userData?.verified &&
        core?.userData?.verifiedColor !== 'yellow' &&
        videoData.totalViews >= 4500
      ) {
        setDoc(
          doc(db, 'users', user.uid),
          { verifiedColor: 'yellow' },
          { merge: true }
        ).catch(() => {});
      }

      // Everything else (follower/following counts, liked videos, admin
      // check, rank) is non-essential for first paint and runs quietly in
      // the background.
      Promise.allSettled([
        fetchProfileStats(user.uid, videoData.totalLikes),
        loadLikedVideos(user.uid),
        checkAdmin(user.uid),
        loadUserRank(user.uid, core?.receivedStars || 0),
      ]).catch((error) => {
        if (__DEV__) console.log('BACKGROUND PROFILE LOAD ERROR =', error);
      });
    } catch (error) {
      if (__DEV__) console.log('PROFILE INITIAL LOAD ERROR =', error);
      setLoading(false);
    }
  });

  return () => unsubscribe();
}, []);

// ==========================================
// TOP GIFTERS REALTIME LISTENER
// ==========================================
useEffect(() => {

  let unsubscribeUser = null;

  const unsubscribeAuth = onAuthStateChanged(
    auth,
    (user) => {

      // Logout / user available nahi
      if (!user) {

        setTopGifters([]);
        setGiftUserCount(0);

        if (unsubscribeUser) {
          unsubscribeUser();
          unsubscribeUser = null;
        }

        return;
      }


      // Purana listener remove
      if (unsubscribeUser) {
        unsubscribeUser();
      }

      unsubscribeUser = onSnapshot(
        doc(db, "users", user.uid),
        (snap) => {

          if (!snap.exists()) {


            setTopGifters([]);
            setGiftUserCount(0);

            return;
          }

          const data = snap.data();


          const giftersObject =
            data.topGifters || {};

          const gifters =
            Object.values(giftersObject)
              .filter(Boolean)
              .map((item) => ({
                ...item,
                stars: Number(item.stars || 0),
              }))
              .sort(
                (a, b) => b.stars - a.stars
              );


          setTopGifters(
            gifters.slice(0, 3)
          );

          setGiftUserCount(
            gifters.length
          );

        },
        (error) => {


        }
      );

    }
  );

  return () => {

    unsubscribeAuth();

    if (unsubscribeUser) {
      unsubscribeUser();
    }

  };

}, []);



 


// ================= SHARE PROFILE =================
const handleShareProfile = async () => {
  try {
    const username = profileData.username || "user";

    await Share.share({
      message: `Check out my profile on TopKing 👑

@${username}

${profileData.bioText || ""}

Join me on TopKing!`,
    });

  } catch (error) {
  }
};

  // Logout Handler Function
  const handleLogout = async () => {
    setMenuVisible(false);
    Alert.alert("Logout", "Do you want to log out??", [
      { text: "no", style: "cancel" },
      { 
        text: "yes", 
        onPress: async () => { 


        try {

  // Firebase logout
  await signOut(auth);

  // Google logout
  try {

    await GoogleSignin.signOut();

  } catch (err) {


  }

  router.replace("/login");

} catch (e) {


  Alert.alert(
    "Error",
    "Logout nahi ho saka"
  );

}



        } 
      }
    ]);
  };







const checkVerifiedBadge = async (uid) => {
  try {

    // User already verified hai?
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return;

    const userData = userSnap.data();

    // Agar pehle se verified hai to kuch mat karo
    if (userData.verified === true) {
      return;
    }

    // User ke videos lao
    const q = query(
      collection(db, "all_videos"),
      where("userId", "==", uid)
    );

    const snap = await getDocs(q);

    let count = 0;

    snap.forEach((video) => {
      const views = Number(video.data().views || 0);

      if (views >= 300) {
        count++;
      }
    });


    // Agar 5 ya usse jyada videos hain
    if (count >= 5) {

      await setDoc(
        userRef,
        {
          verified: true,
        },
        { merge: true }
      );


    }

  } catch (error) {
  }
};




// NOTE: yellow-badge logic now runs inline in the init effect using
// core.userData.verified + videoData.totalViews (both already fetched),
// instead of re-querying the user doc and the whole all_videos collection
// again here.




  // Fast path — only what the header needs (name, username, photo, bio,
  // level). user doc + wallet doc are fetched together instead of one
  // after another, and this is awaited BEFORE videos load, so the profile
  // info appears first and thumbnails fill in after.
  const fetchCoreProfile = async (uid, prefetchedUserSnap) => {

    try {
      const [docSnap, walletSnap] = await Promise.all([
        prefetchedUserSnap
          ? Promise.resolve(prefetchedUserSnap)
          : getDoc(doc(db, "users", uid)),
        getDoc(doc(db, "wallets", uid)),
      ]);

      const userLevel = walletSnap.exists()
        ? (walletSnap.data().level || 1)
        : 1;

      const receivedStars = walletSnap.exists()
        ? (walletSnap.data().receivedStars || 0)
        : 0;

      if (!docSnap.exists()) return null;

      const data = docSnap.data();

      setHasAgency(data.agencyApproved === true);

      setProfileData((prev) => ({
        ...prev,
        name: data.name || 'Top King ',
        username:
          data.username ||
          auth.currentUser?.email?.split('@')[0] ||
          'user',
        bioText: data.bioText || 'bio.........',
        category: data.category || 'Video Creator',
        gender: data.gender || 'Male',
        profileImg: data.profileImg || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        verified: data.verified || false,
        level: userLevel,
        verifiedColor: data.verifiedColor || "white",
      }));

      return { userData: data, receivedStars };

    } catch (e) {
      if (__DEV__) console.log("Error fetching core profile: ", e);
      return null;
    }
  };

  // Slow path — follower/following counts. Runs after the header is
  // already visible and merges in once ready, instead of blocking
  // everything else.
  const fetchProfileStats = async (uid, totalLikes) => {

    try {
      const followersQuery = query(
        collection(db, "follows"),
        where("followingId", "==", uid)
      );

      const followingQuery = query(
        collection(db, "follows"),
        where("followerId", "==", uid)
      );

      const [followersSnap, followingSnap] = await Promise.all([
        getDocs(followersQuery),
        getDocs(followingQuery),
      ]);

      setProfileData((prev) => ({
        ...prev,
        followers: followersSnap.size.toString(),
        following: followingSnap.size.toString(),
        likes: totalLikes.toString(),
      }));

    } catch (e) {
      if (__DEV__) console.log("Error fetching profile stats: ", e);
    }
  };




  const loadVideos = async (uid) => {
  try {

    const q = query(
      collection(db, "all_videos"),
      where("userId", "==", uid)
    );

    const querySnapshot = await getDocs(q);

    // Newest First: createdAt ke har possible format ko safely compare karo
    const getCreatedTime = (value) => {
      if (!value) return 0;
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
      }
      if (typeof value?.toMillis === "function") return value.toMillis();
      if (typeof value?.seconds === "number") {
        return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
      }
      return 0;
    };

    // Single pass over the docs: builds the video list AND derives
    // totalLikes/totalViews here, so nothing else needs to re-query
    // all_videos for this user again (fetchProfileStats, the yellow-badge
    // check, and likedMeCount all reuse these numbers).
    let totalLikes = 0;
    let totalViews = 0;

    const tempVideos = querySnapshot.docs.map((docItem) => {
      const data = docItem.data();

      totalLikes += Number(data.likes || 0);
      totalViews += Number(data.views || 0);

      return { id: docItem.id, ...data };
    });

    tempVideos.sort((a, b) => {
      return getCreatedTime(b.createdAt) - getCreatedTime(a.createdAt);
    });

    setVideos(tempVideos);

    return { videos: tempVideos, totalLikes, totalViews };

  } catch (e) {
    if (__DEV__) console.log(e);
    return { videos: [], totalLikes: 0, totalViews: 0 };
  }
};



const onRefresh = async () => {

  try {

    setRefreshing(true);

    const uid = auth.currentUser?.uid;

    if (!uid) return;

    const core = await fetchCoreProfile(uid);
    const videoData = await loadVideos(uid);

    setJoinedAgency(!!core?.userData?.agencyId);
    setLikedMeCount(videoData.totalLikes);

    if (
      core?.userData?.verified &&
      core?.userData?.verifiedColor !== 'yellow' &&
      videoData.totalViews >= 4500
    ) {
      setDoc(
        doc(db, 'users', uid),
        { verifiedColor: 'yellow' },
        { merge: true }
      ).catch(() => {});
    }

    await Promise.all([
      fetchProfileStats(uid, videoData.totalLikes),
      loadLikedVideos(uid),
      checkAdmin(uid),
      loadUserRank(uid, core?.receivedStars || 0),
    ]);

  } catch (error) {

    if (__DEV__) console.log("REFRESH ERROR =", error);

  } finally {

    setRefreshing(false);

  }

};



// Rank via a count aggregation query — avoids downloading the whole
// wallets collection just to find one position in it.
const loadUserRank = async (uid, myReceivedStars = 0) => {

  try {

    const q = query(
      collection(db, "wallets"),
      where("receivedStars", ">", myReceivedStars)
    );

    const countSnap = await getCountFromServer(q);

    setUserRank(countSnap.data().count + 1);

  } catch (e) {

    if (__DEV__) console.log(e);

  }

};




const checkAdmin = async (uid) => {

  try {

    const adminSnap = await getDoc(
      doc(db,"admins",uid)
    );

    if (adminSnap.exists()) {

      setIsAdmin(true);

    } else {

      setIsAdmin(false);

    }

  } catch(error){


  }

};



// NOTE: agency-joined status now comes straight from fetchCoreProfile's
// read of the user doc (see setJoinedAgency(!!core?.userData?.agencyId)
// in the init effect) — no separate query needed here anymore.




const loadLikedVideos = async (uid) => {
  try {

    const likedSnapshot = await getDocs(
      collection(
        db,
        "userLikes",
        uid,
        "likedVideos"
      )
    );

    // Fetch every liked video in parallel instead of one-by-one
    const videoSnaps = await Promise.all(
      likedSnapshot.docs.map((like) =>
        getDoc(doc(db, "all_videos", like.id))
      )
    );

    const videosData = videoSnaps
      .filter((snap) => snap.exists())
      .map((snap) => ({
        id: snap.id,
        ...snap.data(),
      }));

    // Newest first
    videosData.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });

    setLikedVideos(videosData);

  } catch (error) {
    if (__DEV__) console.log(error);
  }
};




// NOTE: likedMeCount is now set directly from loadVideos()'s totalLikes
// (see setLikedMeCount(videoData.totalLikes) in the init effect) — it was
// re-querying the exact same all_videos collection a second time just to
// compute the same number.




  const handleDeleteVideo = async (videoId) => {
    Alert.alert("Delete Video", "Kya aap is video ko delete karna chahte hain?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "all_videos", videoId));
            setVideos(videos.filter(v => v.id !== videoId));
            setPlayModalVisible(false);
          } catch (e) {
            Alert.alert("Error", "Delete failed.");
          }
        }
      }
    ]);
  };

  const openEditModal = () => {
    // Current data ko inputs me feed karein taaki edit ho sake
    setTempName(profileData.name);
    setTempUsername(profileData.username);
    setTempBioText(profileData.bioText);
    setTempCategory(profileData.category);
    setTempGender(profileData.gender);
    setTempProfileImg(profileData.profileImg);
    setEditModalVisible(true);
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 1,
    });
    if (!result.canceled) {
      setTempProfileImg(result.assets[0].uri);
    }
  };





const openFollowers = async () => {
  try {

    const uid = auth.currentUser?.uid;

    if (!uid) return;

    setFollowersLoading(true);

    const q = query(
      collection(db, "follows"),
      where("followingId", "==", uid)
    );

    const snap = await getDocs(q);

    const arr = await Promise.all(

      snap.docs.map(async (item) => {

        const followerId =
          item.data().followerId;

        try {

          const userSnap = await getDoc(
            doc(db, "users", followerId)
          );

          if (!userSnap.exists()) {
            return null;
          }

          const userData = userSnap.data();

          /*
           * Level users document se hi lo.
           * Isse har follower ke liye wallet read nahi hoga.
           */
          const level =
            userData.level || 1;

          return {
            id: followerId,
            ...userData,
            verified:
              userData.verified || false,

            verifiedColor:
              userData.verifiedColor || "white",

            level,
          };

        } catch (error) {


          return null;
        }

      })

    );

    setFollowersList(
      arr.filter(Boolean)
    );

  } catch (error) {


  } finally {

    setFollowersLoading(false);

  }
};




const loadFollowing = async () => {
  try {

    const uid = auth.currentUser?.uid;

    if (!uid) return;

    setFollowingLoading(true);

    const q = query(
      collection(db, "follows"),
      where("followerId", "==", uid)
    );

    const snap = await getDocs(q);

    const arr = await Promise.all(

      snap.docs.map(async (item) => {

        const followingId =
          item.data().followingId;

        try {

          const userSnap = await getDoc(
            doc(db, "users", followingId)
          );

          if (!userSnap.exists()) {
            return null;
          }

          const userData =
            userSnap.data();

          const level =
            userData.level || 1;

          return {
            id: followingId,
            ...userData,

            verified:
              userData.verified || false,

            verifiedColor:
              userData.verifiedColor || "white",

            level,
          };

        } catch (error) {


          return null;
        }

      })

    );

    setFollowingList(
      arr.filter(Boolean)
    );

  } catch (error) {


  } finally {

    setFollowingLoading(false);

  }
};


const handleFollowUser = async (userData) => {
  try {
    const myId = auth.currentUser?.uid;
    if (!myId || !userData?.id || myId === userData.id) return;

    const followId = `${myId}_${userData.id}`;
    await setDoc(doc(db, "follows", followId), {
      followerId: myId,
      followingId: userData.id,
      createdAt: Date.now(),
    });

    await loadFollowing();
    Alert.alert("Success", "Follow ho gaya");
  } catch (error) {
    Alert.alert("Error", "Follow nahi ho saka");
  }
};


const handleFollowBack = async (userData) => {
  try {
    const myId = auth.currentUser.uid;

    const followId = `${myId}_${userData.id}`;

    await setDoc(
      doc(db, "follows", followId),
      {
        followerId: myId,
        followingId: userData.id,
        createdAt: Date.now(),
      }
    );

    await loadFollowing();

    Alert.alert(
      "Success",
      "Follow Back Done"
    );

  } catch (error) {
  }
};

  // PROFILE SAVE AND FORCE RE-RENDER FIXED LOGIC
const uploadProfileImage = async (imageUri) => {

  if (!imageUri.startsWith("file://")) {
    return imageUri;
  }

  const data = new FormData();

  data.append("file", {
    uri: imageUri,
    type: "image/jpeg",
    name: "profile.jpg",
  });

  data.append(
    "upload_preset",
   'topking_upload'
  );

  try {

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${'fzmrnrlz'}/image/upload`,
      {
        method: "POST",
        body: data,
      }
    );

    const result = await response.json();


    return result.secure_url;

  } catch (error) {


    Alert.alert(
      "Error",
      "Image upload failed"
    );

    return profileData.profileImg;
  }
};







  const handleSaveProfile = async () => {
    setSaving(true);
    



const imageUrl =
  await uploadProfileImage(tempProfileImg);


const cleanUsername = tempUsername
  .trim()
  .replace(/\s+/g, "_")
  .toLowerCase();

if (cleanUsername.length < 4) {

  Alert.alert(
    "Username Error",
    "Username minimum 4 letters ka hona chahiye."
  );

  setSaving(false);

  return;

}

if (!/^[a-z0-9_]+$/.test(cleanUsername)) {

  Alert.alert(
    "Username Error",
    "Sirf letters, numbers aur _ use kar sakte ho."
  );

  setSaving(false);

  return;

}





    const updatedData = {
      ...profileData, // purane followers/likes details hold rakhne ke liye
      name: tempName,
      username: cleanUsername,
      bioText: tempBioText,
      category: tempCategory,
      gender: tempGender,
     profileImg: imageUrl,
     level: profileData.level || 1,
    };

    try {
      const user = auth.currentUser;

      // Username unique check
const usernameQuery = query(
  collection(db, "users"),
  where("username", "==", cleanUsername)
);

const usernameSnapshot = await getDocs(usernameQuery);

let usernameTaken = false;

usernameSnapshot.forEach((docSnap) => {
  if (docSnap.id !== user.uid) {
    usernameTaken = true;
  }
});

if (usernameTaken) {
  Alert.alert(
    "Username Already Taken",
    "Ye username kisi aur user ne use kiya hua hai."
  );
  setSaving(false);
  return;
}
      
      // Agar Firebase active hai to remote db par overwrite karo
      if (user) {
        await setDoc(doc(db, "users", user.uid), updatedData, { merge: true });
      }
      
      // Screen ke data ko force fully update karein
      setProfileData(updatedData);
      setEditModalVisible(false);
      Alert.alert("Success", "Profile successfully update ho gayi hai!");
    } catch (error) {
      Alert.alert("Error", "Profile save nahi ho saki.");
    } finally { 
      setSaving(false); 
    }
  };

  const selectGender = (selectedGender) => {
    setTempGender(selectedGender);
    setGenderModalVisible(false);
  };
const selectCategory = (category) => {
  setTempCategory(category);
  setCategoryModalVisible(false);
};



const getLevelDiamond = (level) => {
  if (level >= 1 && level < 9) return 1;
  if (level >= 10 && level < 19) return 2;
  if (level >= 20 && level < 29) return 3;
  if (level >= 30 && level < 39) return 4;
  if (level >= 40 && level < 49) return 5;

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



  const getIconColor = (path) => (pathname === path ? '#f1c40f' : '#ffffff');

const levelTheme =
getLevelTheme(profileData.level || 1);

  if (loading) return <View style={styles.loaderBox}><ActivityIndicator size="large" color="#FFD700" /></View>;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />

      {/* Top Navigation Bar */}
  <View style={styles.topActionNavigation}>

  {/* Left Side */}
  <TouchableOpacity style={styles.starBox}>
    <Ionicons
      name="star"
      size={22}
      color="#FFD700"
    />

    <Text style={styles.starValue}>
      2500
    </Text>
  </TouchableOpacity>

  {/* Right Side */}
  <View style={styles.headerRightActions}>

    <TouchableOpacity
      onPress={() => router.push('/wallet')}
      activeOpacity={0.7}
      style={{marginRight:15}}
    >
      <Ionicons
        name="wallet-outline"
        size={28}
        color="#FFD700"
      />
    </TouchableOpacity>

    <TouchableOpacity
      onPress={() => setMenuVisible(!menuVisible)}
      activeOpacity={0.7}
    >
      <Ionicons
        name="menu"
        size={28}
        color="#fff"
      />
    </TouchableOpacity>

  </View>

</View>


      {/* Dropdown Menu Overlay */}


{menuVisible && (
  <>
    {/* Background */}
    <Pressable
      style={styles.menuOverlay}
      onPress={() => setMenuVisible(false)}
    />

    {/* Popup */}
    <View style={styles.menuDropdown}>

      <View style={styles.menuBox}>

        

        <TouchableOpacity
  style={styles.menuItem}
  onPress={() => {
    setMenuVisible(false);
    handleShareProfile();
  }}
>
  <Ionicons
    name="share-social-outline"
    size={22}
    color="#fff"
  />

  <Text style={styles.menuItemText}>
    Share Profile
  </Text>
</TouchableOpacity>


{hasAgency && (

<TouchableOpacity
  style={styles.menuItem}
  onPress={() => {
    setMenuVisible(false);
    router.push("../agency");
  }}
>

  <Ionicons
    name="business-outline"
    size={22}
    color="#FFD700"
  />

  <Text style={styles.menuItemText}>
    Agency
  </Text>

</TouchableOpacity>

)}





{joinedAgency && !hasAgency && (
  <TouchableOpacity
    style={styles.menuItem}
    onPress={() => {
      setMenuVisible(false);
      router.push("../useragency");
    }}
  >
    <Ionicons
      name="people-outline"
      size={22}
      color="#00E5FF"
    />

    <Text style={styles.menuItemText}>
      User Agency
    </Text>
  </TouchableOpacity>
)}




        <TouchableOpacity
  style={styles.menuItem}
  onPress={() => {
    setMenuVisible(false);
    router.push("../creator");
  }}
>
  <Ionicons
    name="person-circle-outline"
    size={22}
    color="#fff"
  />
  <Text style={styles.menuItemText}>
    Creator Verified
  </Text>
</TouchableOpacity>

        
<TouchableOpacity
  style={styles.menuItem}
  onPress={() => {
    setMenuVisible(false);
    router.push("../hdvideo");
  }}
>
  <Ionicons
    name="videocam-outline"
    size={22}
    color="#fff"
  />

  <Text style={styles.menuItemText}>
    Video Quality
  </Text>
</TouchableOpacity>



        <TouchableOpacity
  style={styles.menuItem}
  onPress={() => {
    setMenuVisible(false);
    router.push("../language");
  }}
>
  <Ionicons
    name="language-outline"
    size={22}
    color="#fff"
  />

  <Text style={styles.menuItemText}>
    Language
  </Text>
</TouchableOpacity>

       <TouchableOpacity
  style={styles.menuItem}
  onPress={() => {
    setMenuVisible(false);
    router.push("/block");
  }}
>
  <Ionicons
    name="ban-outline"
    size={22}
    color="#ff4444"
  />
  <Text style={styles.menuItemText}>
    Block
  </Text>
</TouchableOpacity>

        <TouchableOpacity
  style={[styles.menuItem, { borderBottomWidth: 0 }]}
  onPress={() => {
    setMenuVisible(false);
    router.push("../Feedback");
  }}
>
  <Ionicons
    name="chatbox-ellipses-outline"
    size={22}
    color="#fff"
  />
  <Text style={styles.menuItemText}>
    Feedback
  </Text>
</TouchableOpacity>

      </View>

      <View style={{height:12}} />

      <View style={styles.menuBox}>




<TouchableOpacity
  style={styles.menuItem}
  onPress={() => {
    setMenuVisible(false);
    router.push("../reward");
  }}
>
  <Ionicons
    name="gift-outline"
    size={22}
    color="#FFD700"
  />

  <Text style={styles.menuItemText}>
    Rewards
  </Text>
</TouchableOpacity>



        <TouchableOpacity
  style={styles.menuItem}
  onPress={() => {
    setMenuVisible(false);
    router.push("/settings");
  }}
>
  <Ionicons
    name="settings-outline"
    size={22}
    color="#fff"
  />

  <Text style={styles.menuItemText}>
    Settings
  </Text>
</TouchableOpacity>

        {isAdmin && (
          <TouchableOpacity
            style={styles.menuItem}
            onPress={()=>{
              setMenuVisible(false);
              router.push("../adminPanel");
            }}
          >
            <Ionicons
              name="shield-checkmark"
              size={22}
              color="#FFD700"
            />
            <Text style={styles.menuItemText}>
              Admin Panel
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.menuItem,{borderBottomWidth:0}]}
          onPress={handleLogout}
        >
          <Ionicons
            name="log-out-outline"
            size={22}
            color="#FF3B30"
          />
          <Text
            style={[
              styles.menuItemText,
              {color:"#FF3B30"}
            ]}
          >
            Logout
          </Text>
        </TouchableOpacity>

      </View>

    </View>
  </>
)}



      {/* Main Profile List Container */}
      <FlatList
     data={


    activeTab === "Videos"
      ? videos
      : likedVideos
  }

refreshControl={
  <RefreshControl
    refreshing={refreshing}
    onRefresh={onRefresh}
    colors={["#FFD700"]}
    tintColor="#FFD700"
  />
}


        keyExtractor={(item) => item.id}
        numColumns={3}
        style={styles.videoList}
        contentContainerStyle={{ paddingBottom: 140 }} 
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        updateCellsBatchingPeriod={50}
        ListHeaderComponent={
          <View style={styles.profileHeader}>

            {/* Profile Info Section */}
            <View style={styles.mainInfoSection}>
              <View style={styles.avatarContainer}>
                <Image source={{ uri: profileData.profileImg }} style={styles.avatar} />
              </View>
              
              <View style={styles.profileMetaContainer}>

                <View style={styles.usernameRow}>

  <Text
  numberOfLines={1}
  ellipsizeMode="tail"
  style={styles.profileUserName}
>
  @{profileData.username || "user"}
</Text>

  {/* Verified Badge */}

{profileData.verified && (
  <MaterialCommunityIcons
    name="check-decagram"
    size={22}
    color={
      profileData.verifiedColor === "yellow"
        ? "#FFD700"
        : "#ffffff"
    }
    style={{ marginLeft: 5 }}
  />
)}


<View
  style={[
    styles.levelBadge,
    {
      backgroundColor: levelTheme.bg,
      borderColor: levelTheme.border,
    },
  ]}
>
  <MaterialCommunityIcons
    name="diamond-stone"
    size={10}
    color={levelTheme.icon}
  />

  <Text
    style={[
      styles.levelBadgeText,
      {
        color: levelTheme.text,
      },
    ]}
  >
    LV {profileData.level}
  </Text>
</View>



</View>


               <Text style={styles.categoryText}>
  {profileData.category}
</Text>

                <View style={styles.statsRow}>


<TouchableOpacity
style={styles.statBox}
 

    onPress={async () => {

  setActiveFollowTab("followers");
  setFollowersModalVisible(true);

  await Promise.all([
    openFollowers(),
    loadFollowing(),
  ]);

}}


>


  <Text style={styles.statNum}>
    {profileData.followers}
  </Text>

  <Text style={styles.statLab}>
    Followers
  </Text>
</TouchableOpacity>




<TouchableOpacity
style={styles.statBox}
onPress={() => {

    // 1. Following tab
    setActiveFollowTab("following");

    // 2. Popup immediately
    setFollowersModalVisible(true);

    // 3. Data background mein load
    loadFollowing();

}}
>


  <Text style={styles.statNum}>
    {profileData.following}
  </Text>

  <Text style={styles.statLab}>
    Following
  </Text>
</TouchableOpacity>

                    


                <View style={styles.statBox}>

<Text style={styles.statNum}>
{likedMeCount}
</Text>

<Text style={styles.statLab}>
Likes
</Text>

</View>

                </View>
              </View>
            </View>

            {/* Bio Block */}
            <View style={styles.bioSection}>
              <Text style={styles.bioLabel}>Bio</Text>
              <Text style={styles.bioText}>{profileData.bioText || 'bio.........'}</Text>
            </View>

            {/* Action Row */}
          <View style={styles.buttonRow}>

  <TouchableOpacity
    style={styles.editBtn}
    onPress={openEditModal}
  >
    <MaterialCommunityIcons
      name="pencil"
      size={16}
      color="#000"
      style={{ marginRight: 6 }}
    />

    <Text style={styles.editBtnText}>
      Edit Profile
    </Text>

  </TouchableOpacity>

  <TouchableOpacity
    style={styles.instaBtn}
    onPress={() => router.push("/Agency-Request")}
  >

    <Image
      source={TopKingLogo}
      style={{
        width:40,
        height:40,
        resizeMode:"contain",
      }}
    />

  </TouchableOpacity>

</View>


            {/* Badges/Rank Block */}
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
  {userRank == null
    ? "--"
    : userRank > 500
    ? "500+"
    : `No.${userRank}`}
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




{/* ========================= */}
{/* Angels / Top Gifters */}
{/* ========================= */}
<TouchableOpacity
  style={styles.premiumItem}
  activeOpacity={0.8}
  onPress={() => {
    router.push("../TopGifters");
  }}
>


  {/* LEFT SIDE */}
  <View style={{ flex: 1 }}>

    {/* Title */}
    <Text style={styles.premiumTitle}>
      Angels
    </Text>


    {/* Top Gifter Photos */}
    <View style={styles.memberRow}>

  {topGifters.slice(0, 3).map((item, index) => {

    const imageUri =
      item.photo ||
      item.profileImg ||
      item.profile ||
      item.photoURL ||
      item.avatar ||
      "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

    return (
      <Image
        key={
          item.uid ||
          item.userId ||
          `gifter-${index}`
        }
        source={{
          uri: imageUri,
        }}
        style={[
          styles.memberImg,
          {
            marginLeft:
              index === 0 ? 0 : -12,

            zIndex:
              3 - index,
          },
        ]}
      />
    );

  })}


  {giftUserCount > 0 && (

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

  )}

</View>

  </View>


  {/* RIGHT ARROW */}
  <Ionicons
    name="chevron-forward"
    size={18}
    color="#777"
    style={{
      marginLeft: 10,
    }}
  />

</TouchableOpacity>
 




  <View style={styles.premiumDivider} />

  {/* Share */}
  <TouchableOpacity
    style={styles.shareButton}
    activeOpacity={0.8}
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

            {/* Content Tabs */}
            <View style={styles.tabContainer}>

<TouchableOpacity
style={activeTab==="Videos"
? styles.activeTab
: styles.tab}
onPress={()=>setActiveTab("Videos")}
>

<Text
style={activeTab==="Videos"
? styles.activeTabText
: styles.tabText}
>
Video ({videoCount})
</Text>

</TouchableOpacity>


<TouchableOpacity
style={activeTab==="Likes"
? styles.activeTab
: styles.tab}
onPress={()=>setActiveTab("Likes")}
>

<Text
style={activeTab==="Likes"
? styles.activeTabText
: styles.tabText}
>
Like ({likedVideos.length})
</Text>

</TouchableOpacity>

</View>


          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.videoCard}

onPress={() => {

  const currentVideos =
    activeTab === "Videos"
      ? videos
      : likedVideos;

  const currentIndex =
    currentVideos.findIndex(v => v.id === item.id);

  if (activeTab === "Videos") {

    router.push({
      pathname: "/videoedite",
      params: {
        videos: JSON.stringify(currentVideos),
        index: currentIndex,
        userId: auth.currentUser?.uid,
      },
    });

  } else {

    router.push({
      pathname: "/allvideo",
      params: {
        videos: JSON.stringify(currentVideos),
        index: currentIndex,
        userId: auth.currentUser?.uid,
      },
    });

  }

}}



          >
            {isFocused && (
              <View style={{ flex: 1 }}>

<Image
 source={{
 uri:item.thumbnail
 }}
 style={styles.video}
 fadeDuration={0}
/>
                
                <View style={styles.videoOverlayViews}>
                  <Ionicons name="eye-outline" size={12} color="#fff" />
                  <Text style={styles.viewCountText}>{item.views || '0'}</Text>
                </View>
                <View style={styles.videoTitleRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="play" size={16} color="#FFD700" />
                    <Text style={styles.videoItemTitle} numberOfLines={1}>{item.title || 'video'}</Text>
                  </View>
                  <MaterialCommunityIcons name="dots-vertical" size={16} color="#fff" />
                </View>
              </View>
            )}
          </TouchableOpacity>
        )}
      />

      {/* Global Tab Navigation Footer */}
      <View style={styles.bottomSection}>
        <View style={styles.bottomNavContainer}>
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/')}>
            <Ionicons name={pathname === '/' ? "home" : "home-outline"} size={25} color={getIconColor('/')} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/explore')}>
            <Ionicons name={pathname === '/explore' ? "search" : "search-outline"} size={25} color={getIconColor('/explore')} />
          </TouchableOpacity>

          <View style={styles.navItem}>
            <TouchableOpacity style={styles.plusBtn} onPress={() => router.push('/camera')}>
              <Text style={styles.plusText}>+</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/messages')}>
            <Ionicons name={pathname === '/messages' ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"} size={25} color={getIconColor('/messages')} />
          </TouchableOpacity>

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

    
     {/* REELS MODAL */}

<Modal
  visible={playModalVisible}
  animationType="fade"
  transparent={false}
  onRequestClose={() => {
    player.pause();
    setSelectedVideo(null);
    setPlayModalVisible(false);
  }}
>

  <View style={styles.reelsContainer}>
    <StatusBar hidden />

    {selectedVideo && (
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        allowsFullscreen
        allowsPictureInPicture
      />
    )}

    <LinearGradient
      colors={[
        'rgba(0,0,0,0.3)',
        'transparent',
        'rgba(0,0,0,0.6)',
      ]}
      style={StyleSheet.absoluteFill}
    />

    <View style={styles.reelsHeader}>
      <TouchableOpacity
  onPress={() => {
  try {
    player.pause();
  } catch (e) {}

  setPlayModalVisible(false);

  setTimeout(() => {
    setSelectedVideo(null);
  }, 100);
}}
>
  <Ionicons name="chevron-back" size={32} color="#fff" />
</TouchableOpacity>
      <Text style={styles.reelsHeaderTitle}>Reels</Text>

      <TouchableOpacity>
        <Ionicons name="camera-outline" size={28} color="#fff" />
      </TouchableOpacity>
    </View>

    <View style={styles.reelsSideActions}>
      <TouchableOpacity style={styles.reelsActionBtn}>
        <Ionicons name="heart-outline" size={36} color="#fff" />
        <Text style={styles.reelsActionText}>
          {selectedVideo?.likes || 0}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.reelsActionBtn}>
        <Ionicons name="chatbubble-outline" size={32} color="#fff" />
        <Text style={styles.reelsActionText}>
          {selectedVideo?.comments || 0}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.reelsActionBtn}>
        <Ionicons name="paper-plane-outline" size={32} color="#fff" />
        <Text style={styles.reelsActionText}>Share</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.reelsActionBtn}
        onPress={() => handleDeleteVideo(selectedVideo?.id)}
      >
        <MaterialCommunityIcons
          name="delete-outline"
          size={32}
          color="#FF3B30"
        />
        <Text style={[styles.reelsActionText, { color: '#FF3B30' }]}>
          Delete
        </Text>
      </TouchableOpacity>
    </View>

    <View style={styles.reelsUserInfo}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Image
          source={{ uri: profileData.profileImg }}
          style={styles.reelsSmallAvatar}
        />

        <Text style={styles.reelsUsername}>
          {profileData.username}
        </Text>

        <TouchableOpacity style={styles.reelsFollowBtn}>
          <Text style={styles.reelsFollowText}>Follow</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.reelsCaption} numberOfLines={2}>
        {selectedVideo?.caption || 'New post from user'}
      </Text>
    </View>
  </View>
</Modal>

      {/* EDIT PROFILE MODAL */}
     
<Modal
  animationType="slide"
  visible={editModalVisible}
  transparent={false}
  onRequestClose={() => setEditModalVisible(false)}
>

        <SafeAreaView style={{ flex: 1, backgroundColor: '#111' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditModalVisible(false)}><Ionicons name="close" size={28} color="#fff" /></TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>Edit Profile</Text>
            <View style={{ width: 28 }} /> 
          </View>
          
          <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
            {/* Profile Photo Display */}
            <Image source={{ uri: tempProfileImg }} style={styles.editAvatarLarge} />
            <TouchableOpacity onPress={pickImage}><Text style={styles.blueLink}>Change Profile Photo</Text></TouchableOpacity>
            
            {/* Name Input */}
            <View style={styles.inputBox}>
              <Text style={styles.label}>Name</Text>
              <TextInput style={styles.textInput} value={tempName} onChangeText={(text) => setTempName(text)} />
            </View>
            
            {/* Username Input */}
            <View style={styles.inputBox}>
              <Text style={styles.label}>Username</Text>
              <TextInput style={styles.textInput} value={tempUsername} onChangeText={(text) => setTempUsername(text)} autoCapitalize="none" />
            </View>
            
            {/* Bio Input */}
            <View style={styles.inputBox}>
              <Text style={styles.label}>Bio</Text>
              <TextInput style={[styles.textInput, { height: 60 }]} value={tempBioText} onChangeText={(text) => setTempBioText(text)} multiline />
            </View>

            {/* Category Input */}
            <View style={styles.inputBox}>
  <Text style={styles.label}>Category</Text>

  <TouchableOpacity
    style={styles.dropdownSelector}
    onPress={() => setCategoryModalVisible(true)}
  >
    <Text style={styles.dropdownSelectorText}>
      {tempCategory}
    </Text>

    <Ionicons
      name="chevron-down"
      size={18}
      color="#888"
    />
  </TouchableOpacity>
</View>

            {/* Gender Dropdown Selection Trigger */}
            <View style={styles.inputBox}>
              <Text style={styles.label}>Gender</Text>
              <TouchableOpacity style={styles.dropdownSelector} onPress={() => setGenderModalVisible(true)}>
                <Text style={styles.dropdownSelectorText}>{tempGender || 'Select Gender'}</Text>
                <Ionicons name="chevron-down" size={18} color="#888" />
              </TouchableOpacity>
            </View>

            {/* Login Email View Block (Read-only) */}
            <View style={[styles.inputBox, { marginTop: 10, borderTopWidth: 0.5, borderTopColor: '#222', paddingTop: 15 }]}>
              <Text style={styles.label}>Linked Account Email</Text>
              <View style={styles.disabledEmailBox}>
                <Ionicons name="mail-outline" size={16} color="#555" style={{ marginRight: 8 }} />
                <Text style={styles.disabledEmailText}>{userEmail}</Text>
              </View>
              <Text style={styles.helperText}>Security reasons ki wajah se Email change nahi ho sakta.</Text>
            </View>

            {/* Save Changes button at the bottom */}
            <TouchableOpacity 
              style={styles.saveChangesBtn} 
              onPress={handleSaveProfile} 
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.saveChangesBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
            
            <View style={{ height: 40 }} />
          </ScrollView>

        </SafeAreaView>

        {/* GENDER SELECTION SHEETS/MODAL */}
     
<Modal
  visible={genderModalVisible}
  transparent
  animationType="slide"
  onRequestClose={() => setGenderModalVisible(false)}
>

          <View style={styles.genderModalOverlay}>
            <View style={styles.genderContentContainer}>
              <Text style={styles.genderModalTitle}>Select Your Gender</Text>
              
              <TouchableOpacity style={styles.genderOptionRow} onPress={() => selectGender('Male')}>
                <Text style={styles.genderOptionText}>Male</Text>
                {tempGender === 'Male' && <Ionicons name="checkmark" size={20} color="#FFD700" />}
              </TouchableOpacity>

              <TouchableOpacity style={styles.genderOptionRow} onPress={() => selectGender('Female')}>
                <Text style={styles.genderOptionText}>Female</Text>
                {tempGender === 'Female' && <Ionicons name="checkmark" size={20} color="#FFD700" />}
              </TouchableOpacity>

              <TouchableOpacity style={styles.genderOptionRow} onPress={() => selectGender('Other')}>
                <Text style={styles.genderOptionText}>Other</Text>
                {tempGender === 'Other' && <Ionicons name="checkmark" size={20} color="#FFD700" />}
              </TouchableOpacity>

              <TouchableOpacity style={styles.genderCancelBtn} onPress={() => setGenderModalVisible(false)}>
                <Text style={styles.genderCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </Modal>

<Modal
  visible={categoryModalVisible}
  transparent
  animationType="slide"
  onRequestClose={() => setCategoryModalVisible(false)}
>

  <View style={styles.genderModalOverlay}>
    <View style={styles.genderContentContainer}>

      <Text style={styles.genderModalTitle}>
        Select Category
      </Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
      >
        {categories.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.genderOptionRow}
            onPress={() => selectCategory(item)}
          >
            <Text style={styles.genderOptionText}>
              {item}
            </Text>

            {tempCategory === item && (
              <Ionicons
                name="checkmark"
                size={20}
                color="#FFD700"
              />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={styles.genderCancelBtn}
        onPress={() =>
          setCategoryModalVisible(false)
        }
      >
        <Text style={styles.genderCancelBtnText}>
          Cancel
        </Text>
      </TouchableOpacity>

    </View>
  </View>
</Modal>




<Modal
  visible={followersModalVisible}
  animationType="slide"
  onRequestClose={() => {
    setFollowersModalVisible(false);
  }}
>
  <SafeAreaView
    style={{
      flex: 1,
      backgroundColor: "#000",
    }}
  >
    <TouchableOpacity
      onPress={() =>
        setFollowersModalVisible(false)
      }
      style={{
        padding: 15,
      }}
    >
      <Text
        style={{
          color: "#FFD700",
          fontSize: 18,
        }}
      >
        Close
      </Text>
    </TouchableOpacity>



<View
  style={{
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 15,
  }}
>

 <TouchableOpacity
  onPress={() => {

    setActiveFollowTab("followers");

    if (followersList.length === 0) {
      openFollowers();
    }

  }}

    style={{
      backgroundColor:
        activeFollowTab === "followers"
          ? "#FFD700"
          : "#222",

      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 25,
      marginRight: 10,
    }}
  >
    <Text
      style={{
        color:
          activeFollowTab === "followers"
            ? "#000"
            : "#fff",
        fontWeight: "bold",
      }}
    >
      Followers
    </Text>
  </TouchableOpacity>

  <TouchableOpacity
  onPress={() => {

    setActiveFollowTab("following");

    if (followingList.length === 0) {
      loadFollowing();
    }

  }}
    style={{
      backgroundColor:
        activeFollowTab === "following"
          ? "#FFD700"
          : "#222",

      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 25,
    }}
  >
    <Text
      style={{
        color:
          activeFollowTab === "following"
            ? "#000"
            : "#fff",
        fontWeight: "bold",
      }}
    >
      Following
    </Text>
  </TouchableOpacity>

</View>






{(
  activeFollowTab === "followers"
    ? followersLoading
    : followingLoading
) ? (

  <View
    style={{
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingTop: 60,
    }}
  >

    <ActivityIndicator
      size="large"
      color="#FFD700"
    />

    <Text
      style={{
        color: "#888",
        marginTop: 12,
        fontSize: 14,
      }}
    >
      Loading...
    </Text>

  </View>

) : (

  <FlatList
    data={
      activeFollowTab === "followers"
        ? followersList
        : followingList
    }

    initialNumToRender={9}
    maxToRenderPerBatch={6}
    windowSize={5}
    removeClippedSubviews={true}
    keyExtractor={(item) => item.id}

renderItem={({ item }) => {

  // Kya main is user ko follow karta hoon?
  const isFollowing = followingList.some(
    (u) => u.id === item.id
  );

  // Kya ye user mujhe follow karta hai?
  const followsMe = followersList.some(
    (u) => u.id === item.id
  );

  // Dono ek-dusre ko follow karte hain = Friend / Mutual
  const isFriend = isFollowing && followsMe;

  return (



<View
  style={{
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: "100%",
  }}
>

   <TouchableOpacity
  activeOpacity={0.8}
  onPress={() => {

    setFollowersModalVisible(false);

    router.push({
      pathname: "/userProfile",
      params: {
        userId: item.id,
      },
    });

  }}
  style={{
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  }}
>
      <Image
        source={{
          uri: item.profileImg,
        }}
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
        }}
      />
      

 

<View
  style={{
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
    flexShrink: 1,
    maxWidth: 150,
  }}
>


  <Text
  numberOfLines={1}
  ellipsizeMode="tail"
  style={{
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    maxWidth: 90,
  }}
>
  @{item.username}
</Text>

  {/* Verified Badge */}
  {item.verified && (
    <View
      style={{
        marginLeft: 5,
        width: 20,
        height: 20,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <MaterialCommunityIcons
  name="check-decagram"
  size={20}
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
      marginLeft: 4,
      transform: [{ scale: 0.85 }],
        backgroundColor: getLevelTheme(item.level || 1).bg,
        borderColor: getLevelTheme(item.level || 1).border,
      },
    ]}
  >
    <MaterialCommunityIcons
      name="diamond-stone"
      size={14}
      color={getLevelTheme(item.level || 1).icon}
    />

    <Text
      style={[
        styles.levelBadgeText,
        {
          color: getLevelTheme(item.level || 1).text,
        },
      ]}
    >
      LV {item.level || 1}
    </Text>
  </View>
</View>



    </TouchableOpacity>



  {isFriend ? (
    <TouchableOpacity
      style={{
        backgroundColor: "#222",
        width: 100,
        paddingVertical: 8,
        borderRadius: 20,
        alignItems: "center",
      }}
      onPress={() =>
        router.push({
          pathname: "/chat",
          params: {
            userId: item.id,
            username: item.username,
            profileImg: item.profileImg,
          },
        })
      }
    >
      <Text style={{ color: "#fff", fontWeight: "bold" }}>Message</Text>
    </TouchableOpacity>
  ) : followsMe ? (
    <TouchableOpacity
      style={{
        backgroundColor: "#FFD700",
        width: 100,
        paddingVertical: 8,
        borderRadius: 20,
        alignItems: "center",
      }}
      onPress={() => handleFollowBack(item)}
    >
      <Text style={{ color: "#000", fontWeight: "bold" }}>Follow Back</Text>
    </TouchableOpacity>
  ) : isFollowing ? (
    <TouchableOpacity
      disabled
      style={{
        backgroundColor: "#333",
        width: 100,
        paddingVertical: 8,
        borderRadius: 20,
        alignItems: "center",
        opacity: 0.85,
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "bold" }}>Following</Text>
    </TouchableOpacity>
  ) : (
    <TouchableOpacity
      style={{
        backgroundColor: "#FF5E00",
        width: 100,
        paddingVertical: 8,
        borderRadius: 20,
        alignItems: "center",
      }}
      onPress={() => handleFollowUser(item)}
    >
      <Text style={{ color: "#fff", fontWeight: "bold" }}>Follow</Text>
    </TouchableOpacity>
  )}

  </View>
);


}}
/>
)}


</SafeAreaView>
</Modal>



    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loaderBox: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  topActionNavigation: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingTop: Platform.OS === 'ios' ? 24 : 45, 
    paddingBottom: 12,
    backgroundColor: '#000', 
    height: Platform.OS === 'ios' ? 75 : 90,
    zIndex: 10
  },
  headerLeftPlaceholder: { flex: 1 },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  profileHeader: { paddingHorizontal: 16, paddingTop: 5 }, 
  mainInfoSection: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  avatarContainer: { width: 90, height: 90, borderRadius: 50, borderWidth: 2, borderColor: '#FFD700', justifyContent: 'center', alignItems: 'center', shadowColor: '#FFD700', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 8, elevation: 5 },
  avatar: { width: 88, height: 88, borderRadius: 45, backgroundColor: '#222' },
  profileMetaContainer: { flex: 1, marginLeft: 15 },
  usernameRow: {
  flexDirection: 'row',
  alignItems: 'center',
  flexWrap: 'nowrap',
  width: '100%',
},
  
profileUserName: {
  fontSize: 16,
  fontWeight: 'bold',
  color: '#fff',
  maxWidth: 100,
},

  categoryText: { color: '#FFD700', fontSize: 12, marginTop: 2, fontWeight: '500' },

statsRow: {
  flexDirection: "row",
  justifyContent: "flex-start",
  alignItems: "center",
  marginTop: 20,
},

statBox: {
  alignItems: "center",
  marginRight: 34, // gap adjust kar sakte ho
},

  statNum: { fontSize: 15, fontWeight: 'bold', color: '#fff' },
  statLab: { fontSize: 13.5, color: '#888', marginTop: 3 },
  bioSection: { marginTop: 15 },
  bioLabel: { color: '#888', fontSize: 13, fontWeight: '500' },
  bioText: { fontSize: 16, marginTop: 2, color: '#fff', fontWeight: 'bold' },
  buttonRow: { flexDirection: 'row', marginTop: 20, gap: 12 },
  editBtn: { flex: 1, backgroundColor: '#FFD700', paddingVertical: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }, 
  editBtnText: { fontWeight: 'bold', color: '#000', fontSize: 15 },
  instaBtn: { backgroundColor: '#141414', paddingHorizontal: 16, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#222' },
  highlightsContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 20, padding: 16, backgroundColor: '#111111', borderRadius: 16, borderWidth: 1, borderColor: '#1c1c1c' },
  highlightLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  starIconStyle: { transform: [{ rotate: '15deg' }] },
  rankLabel: { color: '#666', fontSize: 11, fontWeight: '500' },
  no1Text: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginTop: 2 },
  arrowLabel: { color: '#555', fontSize: 16, fontWeight: 'normal' },
  verticalDivider: { width: 1, height: 40, backgroundColor: '#222', marginHorizontal: 10 },
  highlightRight: { flex: 1.2, paddingLeft: 5 },
  levelLabel: { color: '#666', fontSize: 11, fontWeight: '500', marginBottom: 4 },
  circlesRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  circle: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: '#FFD700', justifyContent: 'center', alignItems: 'center', shadowColor: '#FFD700', shadowRadius: 3, elevation: 2 },
  crownPosition: { position: 'absolute', top: -11 },
  arrowIcon: { fontSize: 14, color: '#444', marginHorizontal: 2 },
   
 tabContainer:{
flexDirection:"row",
marginTop:20,
borderBottomWidth:1,
borderBottomColor:"#222"
},

activeTab:{
flex:1,
alignItems:"center",
paddingBottom:10,
borderBottomWidth:2,
borderBottomColor:"#FFD700"
},

tab:{
flex:1,
alignItems:"center",
paddingBottom:10
},

activeTabText:{
color:"#FFD700",
fontWeight:"bold",
fontSize:16
},

tabText:{
color:"#888",
fontSize:16
},
 
  tabTextActive: { color: '#FFD700', marginLeft: 6, fontWeight: 'bold', fontSize: 13 },
  tabText: { color: '#fff', marginLeft: 6, fontWeight: '500', fontSize: 13 },
  videoList: { flex: 1, marginTop: 10 }, 
  videoCard: { width: ITEM_SIZE, height: ITEM_SIZE * 1.5, margin: 5, backgroundColor: '#111', borderRadius: 5, overflow: 'hidden' },
  video: { width: '100%', height: '100%' },
  videoOverlayViews: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  viewCountText: { color: '#fff', fontSize: 10, marginLeft: 4, fontWeight: 'bold' },
  videoTitleRow: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.1)' },
  videoItemTitle: { color: '#fff', fontSize: 11, marginLeft: 4, fontWeight: '500', width: width / 3 - 45 },
  
  bottomSection: { 
    position: 'absolute', 
    bottom: 0, 
    width: '100%', 
    backgroundColor: '#000', 
    borderTopWidth: 0.5, 
    borderTopColor: '#1c1c1c',
    paddingBottom: Platform.OS === 'ios' ? 25 : 10,
    paddingTop: 8,
    zIndex: 99
  },
  bottomNavContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-around', 
    width: '100%', 
    height: 115 
  },
  navItem: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  plusBtn: { 
    backgroundColor: '#FFD700', 
    width: 48, 
    height: 32, 
    borderRadius: 8, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  plusText: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: '#000', 
    marginTop: -3 
  },
  
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 0.5, borderColor: '#222' },
  editAvatarLarge: { width: 90, height: 90, borderRadius: 45, alignSelf: 'center', marginTop: 10 },
  blueLink: { color: '#0095f6', textAlign: 'center', fontWeight: 'bold', marginVertical: 10 },
  inputBox: { marginBottom: 18 },
  label: { fontSize: 12, color: '#888', marginBottom: 5, fontWeight: '500' },
  textInput: { borderBottomWidth: 1, borderColor: '#222', paddingVertical: 5, fontSize: 16, color: '#fff' },
  
  saveChangesBtn: {
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 25,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3
  },
  saveChangesBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold'
  },



menuOverlay: {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "transparent",
  zIndex: 9998,
},


 menuDropdown: {
  position: "absolute",

  top: Platform.OS === "ios" ? 40 : 40,
  right: 5,

  width: 185,

  backgroundColor: "#000000",

  borderRadius: 14,

  overflow: "hidden",

  zIndex: 9999,
  elevation: 20,

  shadowColor: "#000000",
  shadowOpacity: 0.4,
  shadowRadius: 10,
},

menuItem: {
  flexDirection: "row",
  alignItems: "center",

  paddingVertical: 13,
  paddingHorizontal: 14,

  borderBottomWidth: 0.5,
  borderBottomColor: "#000000",

  minHeight: 60,
},

menuItemText: {
  color: "#fff",

  fontSize: 15,

  marginLeft: 18,

  fontWeight: "600",
},
  

  reelsContainer: { flex: 1, backgroundColor: '#000' },
  reelsHeader: { position: 'absolute', top: 40, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, zIndex: 10 },
  reelsHeaderTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  reelsSideActions: { position: 'absolute', right: 10, bottom: 100, alignItems: 'center', zIndex: 10 },
  reelsActionBtn: { alignItems: 'center', marginBottom: 20 },
  reelsActionText: { color: '#fff', fontSize: 12, fontWeight: 'bold', marginTop: 5 },
  reelsUserInfo: { position: 'absolute', bottom: 40, left: 15, right: 80, zIndex: 10 },
  reelsSmallAvatar: { width: 35, height: 35, borderRadius: 17.5, borderWidth: 1, borderColor: '#fff' },
  reelsUsername: { color: '#fff', fontWeight: 'bold', marginLeft: 10, fontSize: 15 },
  reelsFollowBtn: { borderWidth: 1, borderColor: '#fff', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 5, marginLeft: 10 },
  reelsFollowText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  reelsCaption: { color: '#fff', fontSize: 14, marginTop: 10, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 2 },

  dropdownSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#222',
    paddingVertical: 8,
  },
  dropdownSelectorText: {
    fontSize: 16,
    color: '#fff',
  },
  disabledEmailBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#252525',
    marginTop: 5,
  },
  disabledEmailText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  helperText: {
    fontSize: 11,
    color: '#555',
    marginTop: 5,
    fontStyle: 'italic',
  },

  genderModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
 genderContentContainer: {
  backgroundColor: '#161616',
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  padding: 20,
  paddingBottom: Platform.OS === 'ios' ? 40 : 25,

  height: '50%', // aadhi screen
},
  genderModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 15,
  },
  genderOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: '#252525',
  },
  genderOptionText: {
    fontSize: 16,
    color: '#fff',
  },
  genderCancelBtn: {
    marginTop: 15,
    backgroundColor: '#222',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  genderCancelBtnText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },


starBox: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#1b1b1b',
  paddingHorizontal: 15,
  paddingVertical: 5,
  borderRadius: 25,
  borderWidth: 1,
  borderColor: '#333',
},

starValue: {
  color: '#fff',
  fontSize: 15,
  fontWeight: '700',
  marginLeft: 6,
 
},


levelBadge: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",

  paddingHorizontal: 6,
  paddingVertical: 2,

  borderRadius: 20,

  marginLeft: 4,

  borderWidth: 1,
},

levelBadgeText: {
  marginLeft: 3,
  fontSize: 9,
  fontWeight: "bold",
},

premiumCard:{
    marginTop:20,
    marginHorizontal:0,
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