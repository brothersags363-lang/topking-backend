import React, { useState, useEffect } from 'react';

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Dimensions,
  Platform,
  StatusBar,
  Image,
  BackHandler,
  Modal,        // ADD
} from 'react-native';


import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { useRouter, usePathname } from 'expo-router';



// FIREBASE AUTH & FIRESTORE DEPENDENCIES
import { getAuth, onAuthStateChanged } from 'firebase/auth';

import {
  getFirestore,
  doc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  deleteDoc,
  setDoc,
  addDoc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';


const { width } = Dimensions.get('window');

// Clean professional fallback avatar (Jab database me photo register na ho tabhi dikhega)
const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

export default function Messages() {
  const router = useRouter();
  const pathname = usePathname();
  const auth = getAuth();
  const db = getFirestore(); 

  // States
  const [activeTab, setActiveTab] = useState('Friends');
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfilePhoto, setUserProfilePhoto] = useState(DEFAULT_AVATAR); 
  const [authChecked, setAuthChecked] = useState(false);
const [notifications, setNotifications] = useState([]);

const [friends, setFriends] = useState([]);

const [menuVisible, setMenuVisible] = useState(false);

const [selectedFriend, setSelectedFriend] = useState(null);

const [hiddenFriends, setHiddenFriends] = useState([]);

const [selectedType, setSelectedType] = useState('comment');

const [modalVisible, setModalVisible] = useState(false);

useEffect(() => {

  if (!currentUser) return;

  const setMessagesScreen = async () => {

    await setDoc(
      doc(db, "users", currentUser.uid),
      {
        activeScreen: "messages",
      },
      { merge: true }
    );

    console.log("ACTIVE = MESSAGES");

  };

  setMessagesScreen();

  return () => {

    setDoc(
      doc(db, "users", currentUser.uid),
      {
        activeScreen: null,
      },
      { merge: true }
    );

  };

}, [currentUser]);


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



  // MOBILE HARDWARE BACK BUTTON LISTENERS + AUTH + FIRESTORE SYNC
  useEffect(() => {
    let unsubscribeFirestore = () => {};

    // Naya Safe Hardware Back Button Handling
    const handleHardwareBack = () => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
      return true; // Event handled successfully
    };

    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleHardwareBack
    );

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);

        // First fallback: Check Firebase Auth direct photo URL
        if (user.photoURL) {
          setUserProfilePhoto(user.photoURL);
        }

        // Second fallback: Realtime listener user data table se full image fetch ke liye
        const userDocRef = doc(db, 'users', user.uid);
        unsubscribeFirestore = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();
            
            // FIX: profileImg key ko top priority di h kyuki profile.js isi key me save karta hai
            const photo = userData.profileImg || userData.profilePic || userData.photoURL || userData.image;
            
            if (photo && photo.trim() !== '') {
              setUserProfilePhoto(photo);
            }
          }
        }, (error) => {
          console.log("Firestore image fetch error:", error);
        });

      } else {
        setCurrentUser(null);
        setUserProfilePhoto(DEFAULT_AVATAR);
      }
      setAuthChecked(true);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeFirestore();
      backSubscription.remove(); // Crash se bachne ke liye safe clean-up method
    };
  }, []);



useEffect(() => {
  if (!currentUser) return;

  const q = query(
    collection(
      db,
      'users',
      currentUser.uid,
      'notifications'
    ),
    orderBy('createdAt', 'desc')
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    console.log("Notifications:", data);

    console.log(JSON.stringify(data, null, 2));

console.log("Current UID:", currentUser.uid);
console.log("Notifications:", data);
console.log(
  "FIRST NOTIFICATION =",
  JSON.stringify(data[0], null, 2)
);

    setNotifications(data);
  });

  return () => unsubscribe();
}, [currentUser]);





useEffect(() => {
  if (!currentUser) return;

  const q = query(
    collection(
      db,
      "userChats",
      currentUser.uid,
      "friends"
    ),
    orderBy("updatedAt", "desc")
  );

  const unsubscribe = onSnapshot(
    q,
    async (snapshot) => {

      const list = await Promise.all(

        snapshot.docs.map(async (d) => {

          const data = d.data();



 let level = 1;
let verified = false;
let verifiedColor = "white";


try {

  const walletSnap = await getDoc(
    doc(db, "wallets", data.userId)
  );

  if (walletSnap.exists()) {
    level = walletSnap.data().level || 1;
  }

  const userSnap = await getDoc(
  doc(db, "users", data.userId)
);

if (userSnap.exists()) {

  verified =
    userSnap.data().verified === true;

  verifiedColor =
    userSnap.data().verifiedColor ||
    "white";

}

} catch (e) {
  console.log(e);
}

return {
  id: d.id,
  ...data,
  level,
  verified,
  verifiedColor,
};



        })

      );

      setFriends(list);

    }
  );

  return unsubscribe;

}, [currentUser]);



useEffect(() => {

  if (!currentUser) return;

  const q = query(
    collection(
      db,
      "userChats",
      currentUser.uid,
      "hiddenFriends"
    ),
    orderBy("updatedAt", "desc")
  );

  const unsubscribe = onSnapshot(
    q,
    async (snapshot) => {

      const list = await Promise.all(

        snapshot.docs.map(async (d) => {

          const data = d.data();



 let level = 1;
let verified = false;

try {

  const walletSnap = await getDoc(
    doc(db, "wallets", data.userId)
  );

  if (walletSnap.exists()) {
    level = walletSnap.data().level || 1;
  }

  const userSnap = await getDoc(
    doc(db, "users", data.userId)
  );

  if (userSnap.exists()) {
    verified = userSnap.data().verified === true;
  }

} catch (e) {
  console.log(e);
}

return {
  id: d.id,
  ...data,
  level,
  verified,
};



        })

      );

      setHiddenFriends(list);

    }
  );

  return unsubscribe;

}, [currentUser]);




useEffect(() => {
  console.log(
    "FRIENDS DATA =",
    JSON.stringify(friends, null, 2)
  );
}, [friends]);

  const getIconColor = (path) => (pathname === path ? '#3498db' : '#fff');

  // Top Horizontal Badges


  // Tabs layout
  const tabs = ['Friends', 'Except', 'Hid.Sms'];

const filteredNotifications = notifications.filter(
  item => item.type === selectedType
);




const unreadFollowers = notifications.filter(
  item => item.type === "follow" && !item.isRead
).length;

const unreadLikes = notifications.filter(
  item => item.type === "like" && !item.isRead
).length;

const unreadComments = notifications.filter(
  item => item.type === "comment" && !item.isRead
).length;


const topBadges = [

{
  id: 'follow',
  title: 'Follower',
  icon: 'person',
  color: '#3498db',
  count: unreadFollowers,
},
{
  id: 'like',
  title: 'Like',
  icon: 'heart',
  color: '#ff2d55',
  count: unreadLikes,
},
{
  id: 'comment',
  title: 'Comments',
  icon: 'chatbubble',
  color: '#00ccbb',
  count: unreadComments,
},
];


const deleteChat = async (friend) => {

  try {

    // Save delete timestamp
    await setDoc(
      doc(
        db,
        "deletedChats",
        currentUser.uid,
        "users",
        friend.userId
      ),
      {
        deletedAt: serverTimestamp(),
      }
    );

    // Remove from friend list
    await deleteDoc(
      doc(
        db,
        "userChats",
        currentUser.uid,
        "friends",
        friend.id
      )
    );

    setMenuVisible(false);

  } catch (error) {

    console.log(error);

  }

};





const deleteHiddenChat = async (friend) => {

  try {

    if (!friend) return;

    await deleteDoc(
      doc(
        db,
        "userChats",
        currentUser.uid,
        "hiddenFriends",
        friend.id
      )
    );

    setMenuVisible(false);

    console.log("Hidden Chat Deleted");

  } catch (error) {

    console.log(error);

  }

};

const hideChat = async (friend) => {

  try {

    await setDoc(
      doc(
        db,
        "userChats",
        currentUser.uid,
        "hiddenFriends",
        friend.id
      ),
      friend
    );

    await deleteDoc(
      doc(
        db,
        "userChats",
        currentUser.uid,
        "friends",
        friend.id
      )
    );

    setMenuVisible(false);

  } catch (error) {

    console.log(error);

  }

};



const getModalTitle = () => {


  if (selectedType === 'follow') return 'Followers';
  if (selectedType === 'like') return 'Likes';
  if (selectedType === 'comment') return 'Comments';

  return 'Notifications';
};


  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />

      {/* HEADER WITH ONLY TITLE & PROFILE LOGO (BACK BTN REMOVED) */}
      <View style={styles.header}>
        {/* Left Side Empty Space Balance maintain karne ke liye */}
        <View style={styles.headerLeftPlaceholder} />
        
        <Text style={styles.headerTitle}>Activity</Text>
        
        {/* PROFILE LOGO */}
        <TouchableOpacity 
          onPress={() => router.push('/profile')} 
          style={styles.profileLogoContainer}
          activeOpacity={0.7}
        >
          <Image 
            key={userProfilePhoto} // Image component force re-render parameter
            source={{ uri: userProfilePhoto }} 
            style={styles.headerProfileLogo} 
            resizeMode="cover"
          />
        </TouchableOpacity>
      </View>

      {/* CONDITIONAL RENDERING */}
      {currentUser ? (
        <>
          {/* HORIZONTAL TOP BADGES */}
          <View style={styles.badgeWrapper}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.badgeScroll}
            >
              
{topBadges.map((badge) => (
  <TouchableOpacity
    key={badge.id}
    activeOpacity={0.8}

onPress={async () => {

  setSelectedType(badge.id);

  setModalVisible(true);

 const unreadDocs = notifications.filter(
  item =>
    item.type === badge.id &&
    !item.isRead
);

await Promise.all(
  unreadDocs.map(item =>
    updateDoc(
      doc(
        db,
        "users",
        currentUser.uid,
        "notifications",
        item.id
      ),
      {
        isRead: true,
      }
    )
  )
);

}}

    style={[
      styles.badgeCard,
      selectedType === badge.id && {
        borderColor: '#f1c40f',
        borderWidth: 2,
      }
    ]}
  >


{badge.count > 0 && (
  <View style={styles.countBadge}>
    <Text style={styles.countText}>
      {badge.count > 99 ? "99+" : badge.count}
    </Text>
  </View>
)}


                  <View style={styles.badgeIconBox}>
                    <Ionicons name={badge.icon} size={20} color={badge.color} />
                  </View>
                  <Text style={styles.badgeText}>{badge.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* TABS INDICATOR BAR */}
          <View style={styles.tabsContainer}>
            {tabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity 
                  key={tab} 
                  style={styles.tabItemButton}
                  onPress={() => setActiveTab(tab)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabLabelText, isActive && styles.activeTabLabel]}>
                    {tab}
                  </Text>
                  {isActive && <View style={styles.activeLineIndicator} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* MAIN CONTENT AREA */}

<ScrollView
  showsVerticalScrollIndicator={false}
  contentContainerStyle={styles.listContent}
>

{activeTab === "Friends" && (

  friends.map((item) => (

    <TouchableOpacity
      key={item.id}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#222",
      }}

      onPress={() =>
        router.push({
          pathname: "/chat",
          params: {
            userId: item.userId,
            username: item.username,
            profileImg: item.profileImg,
          },
        })
      }
    >

      <Image
        source={{
          uri:
            item.profileImg ||
            DEFAULT_AVATAR,
        }}
        style={{
          width: 55,
          height: 55,
          borderRadius: 28,
        }}
      />

      <View
        style={{
          flex: 1,
          marginLeft: 12,
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
      fontSize: 16,
      fontWeight: "bold",
    }}
  >
    {item.username}
  </Text>

  {/* Verified */}
 {item.verified && (
  <View
    style={{
      marginLeft: 5,
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

  </View>
)}

  {/* Premium */}
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
      size={12}
      color={getLevelTheme(item.level).icon}
    />

    <Text
      style={{
        color: getLevelTheme(item.level).text,
        fontSize: 11,
        fontWeight: "bold",
        marginLeft: 3,
      }}
    >
      LV {item.level || 1}
    </Text>
  </View>

</View>

        <Text
  numberOfLines={1}
  style={{
    color:"#aaa",
    marginTop:3,
  }}
>
  {item.lastMessage === "🎙 Live Invite"
    ? "🎙 Sent you a live invite"
    : item.lastMessage === "🎥 Video"
    ? "🎥 Sent a video"
    : item.lastMessage}
</Text>

{item.hasNewMessage && (

<View
  style={{
    backgroundColor:"#00C853",
    paddingHorizontal:10,
    paddingVertical:3,
    borderRadius:20,
    marginTop:5,
    alignSelf:"flex-start",
  }}
>
  <Text
    style={{
      color:"#fff",
      fontWeight:"bold",
      fontSize:12,
    }}
  >
    NEW
  </Text>
</View>

)}


{item.unreadCount > 0 && (
  <View
    style={{
      backgroundColor: "#00c853",
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      justifyContent: "center",
      alignItems: "center",
      marginTop: 5,
      alignSelf: "flex-start",
      paddingHorizontal: 6,
    }}
  >
    <Text
      style={{
        color: "#fff",
        fontWeight: "bold",
      }}
    >
      {item.unreadCount}
    </Text>
  </View>
)}


      </View>


<TouchableOpacity
  onPress={() => {

    setSelectedFriend(item);

    setMenuVisible(true);

  }}
>

  <Ionicons
    name="ellipsis-vertical"
    size={22}
    color="#fff"
  />

</TouchableOpacity>


    </TouchableOpacity>

  ))

)}




{activeTab === "Hid.Sms" && (

  hiddenFriends.map((item) => (

    <TouchableOpacity
      key={item.id}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#222",
      }}
    >
      <Image
        source={{
          uri: item.profileImg || DEFAULT_AVATAR,
        }}
        style={{
          width: 55,
          height: 55,
          borderRadius: 28,
        }}
      />

      <View
  style={{
    flex: 1,
    marginLeft: 12,
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
      fontSize: 16,
      fontWeight: "bold",
    }}
  >
    {item.username}
  </Text>

  {/* Verified */}
{item.verified && (
  <View
    style={{
      marginLeft: 5,
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
      }}
    />

  </View>
)}

  {/* Premium */}
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
      size={12}
      color={getLevelTheme(item.level).icon}
    />

    <Text
      style={{
        color: getLevelTheme(item.level).text,
        fontSize: 11,
        fontWeight: "bold",
        marginLeft: 3,
      }}
    >
      LV {item.level || 1}
    </Text>
  </View>

</View>

</View>

<TouchableOpacity
  onPress={() => {

    setSelectedFriend(item);

    setMenuVisible(true);

  }}
>
  <Ionicons
    name="ellipsis-vertical"
    size={22}
    color="#fff"
  />
</TouchableOpacity>


    </TouchableOpacity>

  ))

)}




</ScrollView>


        </>
      ) : (
        /* UN-AUTHENTICATED LOGIN PROMPT SCREEN */
        <View style={styles.loginRequiredContainer}>
          <View style={styles.lockIconCircle}>
            <Ionicons name="lock-closed-outline" size={46} color="#ff2d55" />
          </View>
          <Text style={styles.loginMainTitle}>Login Required</Text>
          <Text style={styles.loginSubTitle}>
            Please log in to your account to view activity updates, sync messages and access exclusive chat sections.
          </Text>
          
          <TouchableOpacity 
            style={styles.loginActionBtn}
            activeOpacity={0.8}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.loginActionText}>Log In to Continue</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* BOTTOM NAVBAR */}
      <View style={styles.bottomSection}>
        <View style={styles.bottomNav}>
          
          {/* HOME */}
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/')}>
            <Ionicons name="home-outline" size={26} color={getIconColor('/')} />
          </TouchableOpacity>

          {/* SEARCH */}
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/explore')}>
            <Ionicons name="search" size={26} color={getIconColor('/explore')} />
          </TouchableOpacity>

          {/* PLUS */}
          <TouchableOpacity style={styles.navItem} onPress={() => router.push('/camera')}>
            <View style={styles.plusBtn}>
              <Text style={styles.plusText}>+</Text>
            </View>
          </TouchableOpacity>

          {/* MESSAGE */}
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



<Modal
  visible={modalVisible}
  animationType="slide"
  transparent={true}
  onRequestClose={() => setModalVisible(false)}
>
  <View
    style={{
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
    }}
  >
    <View
      style={{
        width: '92%',
        height: '75%',
        backgroundColor: '#111',
        borderRadius: 20,
        overflow: 'hidden',
      }}
    >

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 15,
          borderBottomWidth: 1,
          borderBottomColor: '#222',
        }}
      >
        <Text
          style={{
            color: '#fff',
            fontSize: 20,
            fontWeight: 'bold',
          }}
        >
          {getModalTitle()}
        </Text>

        <TouchableOpacity
          onPress={() => setModalVisible(false)}
        >
          <Ionicons
            name="close"
            size={28}
            color="#fff"
          />
        </TouchableOpacity>
      </View>

      {/* Notifications */}
      <ScrollView>

        {filteredNotifications.length === 0 ? (

          <View
            style={{
              marginTop: 100,
              alignItems: 'center',
            }}
          >
            <Ionicons
              name="notifications-outline"
              size={60}
              color="#555"
            />

            <Text
              style={{
                color: '#aaa',
                marginTop: 10,
              }}
            >
              No Notifications
            </Text>
          </View>

        ) : (

filteredNotifications.map(item => (

<TouchableOpacity
  key={item.id}

  onPress={() => {

    if (item.videoId) {

      setModalVisible(false);

      router.push({
        pathname: '/',
        params: {
          videoId: item.videoId
        }
      });

    }

  }}

  style={{
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: '#222',
  }}
>

             <TouchableOpacity
  onPress={() => {

    setModalVisible(false);

    router.push({
      pathname: "/userProfile",
      params: {
        userId: item.senderId,
      },
    });

  }}
>
  <Image
    source={{
      uri:
        item.senderPhoto ||
        DEFAULT_AVATAR,
    }}
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
                  flex: 1,
                }}
              >

                <Text
                  style={{
                    color: '#fff',
                    fontWeight: 'bold',
                  }}
                >
                  {item.senderName}
                </Text>


<View>




{item.videoThumbnail ? (

<TouchableOpacity
  onPress={async () => {

console.log(
  "FULL ITEM =",
  JSON.stringify(item, null, 2)
);

    console.log("VIDEO ID =", item.videoId);

    if (!item.videoId) {
      console.log("No videoId found");
      return;
    }

    try {

      const videoSnap = await getDoc(
        doc(db, "all_videos", item.videoId)
      );

      console.log(
        "Video Exists =",
        videoSnap.exists()
      );

console.log(
  "Firestore Video ID =",
  videoSnap.id
);

      if (!videoSnap.exists()) {
        return;
      }

      const videoData = {
        id: videoSnap.id,
        ...videoSnap.data(),
      };

      console.log(
        "Video Data =",
        videoData
      );

      setModalVisible(false);

      setTimeout(() => {

console.log(
  "OPENING ALLVIDEO",
  JSON.stringify([videoData], null, 2)
);

        router.push({
          pathname: "/videoedite",
          params: {
            videos: JSON.stringify([videoData]),
            index: "0",
            userId: auth.currentUser?.uid || "",
          },
        });

      }, 300);

    } catch (error) {

      console.log(
        "OPEN VIDEO ERROR =",
        error
      );

    }

  }}
>
  <Image
    source={{
      uri: item.videoThumbnail,
    }}
    style={{
      width: 55,
      height: 75,
      borderRadius: 8,
    }}
  />
</TouchableOpacity>

) : null}








  <Text
    style={{
      color: '#aaa',
    }}
  >
    {item.type === 'comment'
      ? 'commented on your video'
      : item.type === 'like'
      ? 'liked your video'
      : item.type === 'follow'
      ? 'started following you'
      : ''}
  </Text>

  {item.text ? (
    <Text
      style={{
        color: '#fff',
        marginTop: 4,
      }}
    >
      Comment:
      {' '}
      {item.text}
    </Text>
  ) : null}

  {item.videoCaption ? (
    <Text
      style={{
        color: '#FFD700',
        marginTop: 3,
      }}
    >
      Video:
      {' '}
      {item.videoCaption}
    </Text>
  ) : null}

</View>

                

         </View>

</TouchableOpacity>



          ))

        )}

      </ScrollView>

    </View>
  </View>
</Modal>



<Modal
  visible={menuVisible}
  transparent
  animationType="fade"
>

  <TouchableOpacity
    style={{
      flex:1,
      backgroundColor:"rgba(0,0,0,0.6)",
      justifyContent:"center",
      alignItems:"center",
    }}
    activeOpacity={1}
    onPress={() => setMenuVisible(false)}
  >

    <View
      style={{
        width:250,
        backgroundColor:"#111",
        borderRadius:15,
        padding:15,
      }}
    >


     <TouchableOpacity
  onPress={() => {

    if (activeTab === "Hid.Sms") {

      deleteHiddenChat(
        selectedFriend
      );

    } else {

      deleteChat(
        selectedFriend
      );

    }

  }}
>


        <Text
          style={{
            color:"red",
            fontSize:18,
            paddingVertical:15,
          }}
        >
          Delete Chat
        </Text>

      </TouchableOpacity>



{activeTab !== "Hid.Sms" && (
  <>
    <View
      style={{
        height:1,
        backgroundColor:"#333",
      }}
    />

    <TouchableOpacity
      onPress={() =>
        hideChat(
          selectedFriend
        )
      }
    >
      <Text
        style={{
          color:"#fff",
          fontSize:18,
          paddingVertical:15,
        }}
      >
        Hide SMS
      </Text>
    </TouchableOpacity>
  </>
)}
     



        

    </View>

  </TouchableOpacity>

</Modal>



    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' }, // Pure Black Background
  
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 35 : 30, 
    paddingBottom: 15,
    backgroundColor: '#000',
    borderBottomWidth: 0.5,
    borderBottomColor: '#222' // Dark subtle border
  },
  headerLeftPlaceholder: {
    width: 60,
  },
  headerTitle: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: '#fff', // White Text
    textAlign: 'center', 
    flex: 1,
  },
  
  profileLogoContainer: {
    width: 60,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerProfileLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#444',
    backgroundColor: '#111',
  },
  
  badgeWrapper: { 
    marginTop: 7, 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: '#222' 
  },
  badgeScroll: { paddingHorizontal: 16, alignItems: 'center' },
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111', // Dark badge card
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 25,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  badgeIconBox: { marginRight: 6, justifyContent: 'center', alignItems: 'center' },
  badgeText: { fontSize: 15, fontWeight: 'bold', color: '#fff' }, // White badge text

  tabsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    height: 50,
  },
  tabItemButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  tabLabelText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#555', // Inactive Tab Text Grey
  },
  activeTabLabel: {
    color: '#fff', // Active Tab Text White
  },
  activeLineIndicator: {
    position: 'absolute',
    bottom: 0,
    width: '75%',
    height: 3,
    backgroundColor: '#b8943a',
    borderRadius: 2,
  },

  listContent: { paddingHorizontal: 18, paddingTop: 40, paddingBottom: 130 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyMainText: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginTop: 15 },
  emptySubText: { fontSize: 14, color: '#aaa', marginTop: 5, textAlign: 'center' },

  loginRequiredContainer: {
    flex: 0.72,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  lockIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#1a0d10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#3a1a20'
  },
  loginMainTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  loginSubTitle: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  loginActionBtn: {
    backgroundColor: '#3498db',
    paddingHorizontal: 44,
    paddingVertical: 14,
    borderRadius: 25,
    elevation: 2,
    shadowColor: '#3498db',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  loginActionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  bottomSection: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#000',
    paddingBottom: Platform.OS === 'ios' ? 40 : 25,
    paddingTop: 5,
    borderTopWidth: 0.5,
    borderTopColor: '#222'
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 90,
  },
  navItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  plusBtn: {
    width: 48,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f1c40f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusText: { fontSize: 28, fontWeight: 'bold', color: '#000', marginTop: -4 },

countBadge: {
  position: 'absolute',
  top: -10,
  right: -5,
  backgroundColor: '#ff00aa',
  minWidth: 28,
  height: 28,
  borderRadius: 14,
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 100,
},

countText: {
  color: '#fff',
  fontSize: 15,
  fontWeight: 'bold',
},

verifiedBadge: {
  marginLeft: 6,
  justifyContent: "center",
  alignItems: "center",
},

verifiedTick: {
  position: "absolute",
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