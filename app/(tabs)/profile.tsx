 import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  Modal,
  ActivityIndicator,
  FlatList,
  StatusBar,
  Alert,
  TextInput,
  ScrollView,
  Platform,
  BackHandler
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useRouter, usePathname, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useIsFocused } from '@react-navigation/native';

// FIREBASE CONFIG
import { db, auth, storage } from '../firebaseConfig';

import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_PRESET
} from "../config/cloudinary";

import { collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';

import { GoogleSignin } from '@react-native-google-signin/google-signin';


import {
  ref,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";


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
const [followersModalVisible, setFollowersModalVisible] =
  useState(false);

const [followersList, setFollowersList] =
  useState([]);



const [followingList, setFollowingList] =
  useState([]);

const [activeFollowTab, setActiveFollowTab] =
  useState("followers");

  




  const [activeTab, setActiveTab] = useState('Videos');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [genderModalVisible, setGenderModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [playModalVisible, setPlayModalVisible] = useState(false);

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
      
      Alert.alert("Exit App", "Kya aap app band karna chahte hain?", [
        { text: "Nahi", style: "cancel" },
        { text: "Haan", onPress: () => BackHandler.exitApp() }
      ]);
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

    // Login nahi hai
    if (!user) {
      setLoading(false);
      router.replace('/login');
      return;
    }

    // Login hai
    setUserEmail(user.email || '');

    try {

      const userRef = doc(db, 'users', user.uid);

      const docSnap = await getDoc(userRef);

      // Agar Firestore me user nahi hai to naya banao
      if (!docSnap.exists()) {

        const username =
          user.email?.split('@')[0].toLowerCase().trim() || 'user';

        const newUserData = {
          name: user.displayName || 'User',
          username: username,
          bioText: 'bio.........',
          category: 'Video Creator',
          gender: 'Male',
          followers: '0',
          following: '0',
          likes: '0',

          profileImg:
            user.photoURL ||
            'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        };

        await setDoc(userRef, newUserData);

        setProfileData(newUserData);

      } else {

        // Firestore se load karo
        setProfileData(docSnap.data());

      }

      await fetchUserData(user.uid);

      await loadVideos(user.uid);

    } catch (e) {

      console.log(e);

    } finally {

      setLoading(false);

    }

  });

  return () => unsubscribe();

}, []);

 // dynamically parameter update handling fix kiya

  // Logout Handler Function
  const handleLogout = async () => {
    setMenuVisible(false);
    Alert.alert("Logout", "Kya aap logout karna chahte hain?", [
      { text: "Nahi", style: "cancel" },
      { 
        text: "Haan", 
        onPress: async () => { 
          try { 

             await GoogleSignin.revokeAccess();

await GoogleSignin.signOut();

await signOut(auth);

router.replace('/login');

          } catch (e) { 
            Alert.alert("Error", "Logout nahi ho saka. Kripya dobara koshish karein.");
          } 
        } 
      }
    ]);
  };

  const fetchUserData = async (uid) => {



    try {
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();

// Followers Count
const followersQuery = query(
  collection(db, "follows"),
  where("followingId", "==", uid)
);


const followersSnap = await getDocs(followersQuery);
const followersCount = followersSnap.size;


// Following Count
const followingQuery = query(
  collection(db, "follows"),
  where("followerId", "==", uid)
);



const followingSnap = await getDocs(followingQuery);
const followingCount = followingSnap.size;


// Likes Count
const videosQuery = query(
  collection(db, "all_videos"),
  where("userId", "==", uid)
);

const videosSnap = await getDocs(videosQuery);

let totalLikes = 0;

videosSnap.forEach((videoDoc) => {
  totalLikes += Number(videoDoc.data().likes || 0);
});



        setProfileData({


          name: data.name || 'AGS BROTHERS',

          username:
  data.username ||
  auth.currentUser?.email?.split('@')[0] ||
  'user',


          bioText: data.bioText || 'bio.........',
          category: data.category || 'Video Creator',
          gender: data.gender || 'Male',
          followers: followersCount.toString(),
following: followingCount.toString(),
likes: totalLikes.toString(),
          profileImg: data.profileImg || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        });
      }
    } catch (e) { 
      console.log("Error fetching user data: ", e);
    } finally { 
      setLoading(false); 
    }
  };

  const loadVideos = async (uid) => {
    try {
      const q = query(collection(db, 'all_videos'), where('userId', '==', uid));
      const querySnapshot = await getDocs(q);
      const tempVideos = querySnapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
      setVideos(tempVideos);
    } catch (e) {
      console.log("Error fetching user media posts: ", e);
    }
  };

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

    const q = query(
      collection(db, "follows"), // followers nahi, follows
      where("followingId", "==", uid)
    );

    const snap = await getDocs(q);

    let arr = [];

    for (const item of snap.docs) {
      const followerId = item.data().followerId;

      const userSnap = await getDoc(
        doc(db, "users", followerId)
      );

      if (userSnap.exists()) {
        arr.push({
          id: followerId,
          ...userSnap.data(),
        });
      }
    }

    console.log("Followers Found:", arr);

    setFollowersList(arr);
    await loadFollowing();
    setFollowersModalVisible(true);

  } catch (error) {
    console.log("Followers Error:", error);
  }
};
  


const loadFollowing = async () => {
  try {

    const uid = auth.currentUser?.uid;

    const q = query(
      collection(db, "follows"),
      where("followerId", "==", uid)
    );

    const snap = await getDocs(q);

    let arr = [];

    for (const item of snap.docs) {

      const followingId =
        item.data().followingId;

      const userSnap = await getDoc(
        doc(db, "users", followingId)
      );

      if (userSnap.exists()) {
        arr.push({
          id: followingId,
          ...userSnap.data(),
        });
      }
    }

    setFollowingList(arr);

  } catch (error) {
    console.log(error);
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
    console.log(error);
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
    CLOUDINARY_UPLOAD_PRESET
  );

  try {

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: "POST",
        body: data,
      }
    );

    const result = await response.json();

    console.log(result);

    return result.secure_url;

  } catch (error) {

    console.log(error);

    Alert.alert(
      "Error",
      "Image upload failed"
    );

    return profileData.profileImg;
  }
};







  const handleSaveProfile = async () => {
    setSaving(true);
    

console.log("tempProfileImg =", tempProfileImg);


const imageUrl =
  await uploadProfileImage(tempProfileImg);


    const updatedData = {
      ...profileData, // purane followers/likes details hold rakhne ke liye
      name: tempName,
      username: tempUsername.toLowerCase().trim(),
      bioText: tempBioText,
      category: tempCategory,
      gender: tempGender,
     profileImg: imageUrl
    };

    try {
      const user = auth.currentUser;

      // Username unique check
const usernameQuery = query(
  collection(db, "users"),
  where("username", "==", tempUsername.toLowerCase())
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
      console.log("Error saving profile data: ", error);
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


  const getIconColor = (path) => (pathname === path ? '#f1c40f' : '#ffffff');

  if (loading) return <View style={styles.loaderBox}><ActivityIndicator size="large" color="#FFD700" /></View>;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />

      {/* Top Navigation Bar */}
      <View style={styles.topActionNavigation}>
        <View style={styles.headerLeftPlaceholder} />
        <View style={styles.headerRightActions}>

      <TouchableOpacity
  onPress={() => router.push('/wallet')}
  activeOpacity={0.7}
>
  <Ionicons name="wallet-outline" size={28} color="#FFD700" />
</TouchableOpacity>

          <TouchableOpacity onPress={() => setMenuVisible(!menuVisible)} activeOpacity={0.7}>
            <Ionicons name="menu" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>


      {/* Dropdown Menu Overlay */}
      {menuVisible && (
        <View style={styles.menuDropdown}>
          <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); openEditModal(); }}>
            <Ionicons name="settings-outline" size={18} color="#fff" />
            <Text style={styles.menuItemText}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color="#FF3B30" />
            <Text style={[styles.menuItemText, { color: '#FF3B30' }]}>Logout</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Profile List Container */}
      <FlatList
        data={videos}
        keyExtractor={(item) => item.id}
        numColumns={3}
        style={styles.videoList}
        contentContainerStyle={{ paddingBottom: 140 }} 
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.profileHeader}>

            {/* Profile Info Section */}
            <View style={styles.mainInfoSection}>
              <View style={styles.avatarContainer}>
                <Image source={{ uri: profileData.profileImg }} style={styles.avatar} />
              </View>
              
              <View style={styles.profileMetaContainer}>
                <View style={styles.usernameRow}>
                  <Text style={styles.profileUserName}>@{profileData.username || 'user'}</Text>
                  <MaterialCommunityIcons name="decagram" size={18} color="#FFD700" style={{ marginLeft: 5 }} />
                </View>
               <Text style={styles.categoryText}>
  {profileData.category}
</Text>

                <View style={styles.statsRow}>


<TouchableOpacity
  style={styles.statBox}
  onPress={openFollowers}
>
  <Text style={styles.statNum}>
    {profileData.followers}
  </Text>

  <Text style={styles.statLab}>
    Followers
  </Text>
</TouchableOpacity>




                    <View style={styles.statBox}><Text style={styles.statNum}>{profileData.following}</Text><Text style={styles.statLab}>Following</Text></View>
                  <View style={styles.statBox}><Text style={styles.statNum}>{profileData.likes}</Text><Text style={styles.statLab}>Likes</Text></View>
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
              <TouchableOpacity style={styles.editBtn} onPress={openEditModal}>
                <MaterialCommunityIcons name="pencil" size={16} color="#000" style={{ marginRight: 6 }} />
                <Text style={styles.editBtnText}>Edit Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.instaBtn}>
                <Ionicons name="logo-instagram" size={22} color="#FFD700" />
              </TouchableOpacity>
            </View>

            {/* Badges/Rank Block */}
            <View style={styles.highlightsContainer}>
              <View style={styles.highlightLeft}>
                <MaterialCommunityIcons name="star-outline" size={32} color="#FFD700" style={styles.starIconStyle} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.rankLabel}>Your Rank</Text>
                  <Text style={styles.no1Text}>No.1 <Text style={styles.arrowLabel}>{'>'}</Text></Text>
                </View>
              </View>
              <View style={styles.verticalDivider} />
              <View style={styles.highlightRight}>
                <Text style={styles.levelLabel}>Level</Text>
                <View style={styles.circlesRow}>
                  <View style={styles.circle}>
                    <MaterialCommunityIcons name="crown" size={16} color="#FFD700" style={styles.crownPosition} />
                  </View>
                  <View style={styles.circle} />
                  <View style={styles.circle} />
                  <Text style={styles.arrowIcon}>{'>'}</Text>
                  <MaterialCommunityIcons name="star" size={22} color="#FFD700" />
                </View>
              </View>
            </View>

            {/* Content Tabs */}
            <View style={styles.tabBar}>
              <TouchableOpacity style={activeTab === 'Videos' ? styles.tabItemActive : styles.tabItem} onPress={() => setActiveTab('Videos')}>
                <MaterialCommunityIcons name="play-box" size={20} color={activeTab === 'Videos' ? "#FFD700" : "#fff"} />
                <Text style={activeTab === 'Videos' ? styles.tabTextActive : styles.tabText}>Videos</Text>
              </TouchableOpacity>
              <TouchableOpacity style={activeTab === 'Likes' ? styles.tabItemActive : styles.tabItem} onPress={() => setActiveTab('Likes')}>
                <Ionicons name="heart" size={18} color={activeTab === 'Likes' ? "#FFD700" : "#FF3B30"} />
                <Text style={activeTab === 'Likes' ? styles.tabTextActive : styles.tabText}>Likes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={activeTab === 'Saved' ? styles.tabItemActive : styles.tabItem} onPress={() => setActiveTab('Saved')}>
                <Ionicons name="bookmark" size={18} color={activeTab === 'Saved' ? "#FFD700" : "#3498db"} />
                <Text style={activeTab === 'Saved' ? styles.tabTextActive : styles.tabText}>Saved</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.videoCard}
  onPress={() =>
  router.push({
    pathname: "/videoedite",
    params: {
      videos: JSON.stringify(videos),
      index: videos.findIndex(v => v.id === item.id),
      userId: auth.currentUser?.uid,
       
    },
  })
}

          >
            {isFocused && (
              <View style={{ flex: 1 }}>
<Image
  source={{
    uri:
      item.thumbnail ||
      'https://via.placeholder.com/300x500.png?text=Video'
  }}
  style={styles.video}
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
    onPress={() =>
      setActiveFollowTab("followers")
    }
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
    onPress={() =>
      setActiveFollowTab("following")
    }
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



<FlatList
data={
activeFollowTab === "followers"
? followersList
: followingList
}
keyExtractor={(item) => item.id}
renderItem={({ item }) => {
const isFollowing = followingList.some(
(u) => u.id === item.id
);


return (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 15,
    }}
  >
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Image
        source={{
          uri: item.profileImg,
        }}
        style={{
          width: 50,
          height: 50,
          borderRadius: 25,
        }}
      />

      <Text
        style={{
          color: "#fff",
          marginLeft: 10,
          fontSize: 16,
        }}
      >
        {item.username}
      </Text>
    </View>

    {isFollowing ? (
      <TouchableOpacity
        style={{
          backgroundColor: "#222",
          paddingHorizontal: 15,
          paddingVertical: 8,
          borderRadius: 20,
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
        <Text
          style={{
            color: "#fff",
            fontWeight: "bold",
          }}
        >
          Message
        </Text>
      </TouchableOpacity>
    ) : (
      <TouchableOpacity
        style={{
          backgroundColor: "#FFD700",
          paddingHorizontal: 15,
          paddingVertical: 8,
          borderRadius: 20,
        }}
        onPress={() => handleFollowBack(item)}
      >
        <Text
          style={{
            color: "#000",
            fontWeight: "bold",
          }}
        >
          Follow Back
        </Text>
      </TouchableOpacity>
    )}
  </View>
);


}}
/>



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
  profileMetaContainer: { flex: 1, marginLeft: 20 },
  usernameRow: { flexDirection: 'row', alignItems: 'center' },
  profileUserName: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  categoryText: { color: '#FFD700', fontSize: 12, marginTop: 2, fontWeight: '500' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 13, paddingRight: 5 },
  statBox: { alignItems: 'center' },
  statNum: { fontSize: 15, fontWeight: 'bold', color: '#fff' },
  statLab: { fontSize: 12, color: '#888', marginTop: 3 },
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
  tabBar: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 25, backgroundColor: '#0a0a0a', paddingVertical: 10, borderRadius: 25, borderWidth: 1, borderColor: '#111' },
  tabItemActive: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c1c1c', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20 },
  tabItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 16 },
  tabTextActive: { color: '#FFD700', marginLeft: 6, fontWeight: 'bold', fontSize: 13 },
  tabText: { color: '#fff', marginLeft: 6, fontWeight: '500', fontSize: 13 },
  videoList: { flex: 1, marginTop: 10 }, 
  videoCard: { width: ITEM_SIZE, height: ITEM_SIZE * 1.4, margin: 5, backgroundColor: '#111', borderRadius: 12, overflow: 'hidden' },
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

  menuDropdown: { 
    position: 'absolute', 
    top: Platform.OS === 'ios' ? 80 : 90, 
    right: 15, 
    backgroundColor: '#161616', 
    borderRadius: 12, 
    elevation: 12, 
    zIndex: 9999, 
    width: 160, 
    borderWidth: 1, 
    borderColor: '#262626',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 0.5, borderBottomColor: '#262626' },
  menuItemText: { marginLeft: 12, fontSize: 15, fontWeight: '600', color: '#fff' },
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
});