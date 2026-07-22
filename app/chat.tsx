import React, {
  useEffect,
  useState,
  useRef,
} from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
    Keyboard,
} from "react-native";

import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { auth, db } from "./firebaseConfig";

import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  setDoc,
  doc,
  getDoc,
  increment,
  deleteDoc,
} from "firebase/firestore";

export default function ChatScreen() {
  const router = useRouter();

  const params = useLocalSearchParams();

  const userId = Array.isArray(params.userId)
    ? params.userId[0]
    : params.userId || "";

  const username = Array.isArray(params.username)
    ? params.username[0]
    : params.username || "User";

  const profileImg = Array.isArray(params.profileImg)
    ? params.profileImg[0]
    : params.profileImg || "";

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
const [userLevel, setUserLevel] = useState(1);
const flatListRef = useRef(null);
const [verified, setVerified] = useState(false);


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


  const currentUser = auth.currentUser;

  if (!currentUser) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.whiteText}>User not logged in</Text>
      </SafeAreaView>
    );
  }

  if (!userId) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.whiteText}>userId not found</Text>
      </SafeAreaView>
    );
  }

  const currentUid = currentUser.uid;

  const chatId =
    currentUid < userId
      ? `${currentUid}_${userId}`
      : `${userId}_${currentUid}`;




useEffect(() => {

  const loadUser = async () => {

    // Wallet
    const walletSnap = await getDoc(
      doc(db, "wallets", userId)
    );

    if (walletSnap.exists()) {
      setUserLevel(
        walletSnap.data().level || 1
      );
    }

    // User
    const userSnap = await getDoc(
      doc(db, "users", userId)
    );

    if (userSnap.exists()) {
      setVerified(
        userSnap.data().verified === true
      );
    }

  };

  loadUser();

}, [userId]);


useEffect(() => {

  const q = query(
    collection(
      db,
      "chats",
      chatId,
      "messages"
    ),
    orderBy("createdAt", "asc")
  );

  const unsubscribe = onSnapshot(
    q,
    async (snapshot) => {

      let deletedAt = null;

      const deletedSnap = await getDoc(
        doc(
          db,
          "deletedChats",
          currentUser.uid,
          "users",
          userId
        )
      );

      if (deletedSnap.exists()) {
        deletedAt =
          deletedSnap.data().deletedAt;
      }

      let list = snapshot.docs.map(
        (d) => ({
          id: d.id,
          ...d.data(),
        })
      );

      if (deletedAt) {

        list = list.filter((msg) => {

          if (!msg.createdAt)
            return false;

          return (
            msg.createdAt.toMillis() >
            deletedAt.toMillis()
          );

        });

      }

      setMessages(list);

    }
  );

  return unsubscribe;

}, [chatId]);




useEffect(() => {

  const clearNewMessage = async () => {

    await setDoc(
      doc(
        db,
        "userChats",
        currentUser.uid,
        "friends",
        userId
      ),
      {
        hasNewMessage: false,
        unreadCount: 0,
      },
      {
        merge: true,
      }
    );

  };

  clearNewMessage();

}, []);



useEffect(() => {

  setTimeout(() => {

    flatListRef.current?.scrollToEnd({
      animated: true,
    });

  }, 100);

}, [messages]);



  const sendMessage = async () => {
    if (!message.trim()) return;

    try {
      const myDoc = await getDoc(
        doc(db, "users", currentUser.uid)
      );

      const myData = myDoc.data();

      await addDoc(
        collection(db, "chats", chatId, "messages"),
        {
          text: message,
          senderId: currentUser.uid,
          receiverId: userId,
          createdAt: serverTimestamp(),
        }
      );

   await setDoc(
  doc(
    db,
    "userChats",
    currentUser.uid,
    "friends",
    userId
  ),
  {
    userId,
    username,
    profileImg,
    lastMessage: message,
    updatedAt: serverTimestamp(),
    unreadCount: 0,
  },
  { merge: true }
);



    await setDoc(
  doc(
    db,
    "userChats",
    userId,
    "friends",
    currentUser.uid
  ),
  {
    userId: currentUser.uid,
    username:
      myData?.username ||
      currentUser.displayName ||
      "User",
    profileImg:
      myData?.profileImg ||
      currentUser.photoURL ||
      "",
    lastMessage: message,

hasNewMessage: true,
   unreadCount: increment(1),

    updatedAt: serverTimestamp(),

    
  },
  { merge: true }
);


      setMessage("");



      try {

  await fetch(
    "https://topking-backend.onrender.com/send-message-notification",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receiverUid: userId,
        senderName:
          myData?.username ||
          currentUser.displayName ||
          "User",
        message: message,
      }),
    }
  );

} catch (e) {
  console.log(e);
}
  


Keyboard.dismiss();

    } catch (err) {
      console.log("SEND ERROR =", err);
    }
  };

 const renderItem = ({ item }) => {
  const mine =
    item?.senderId === currentUser.uid;

  return (
    <View
      style={[
        styles.row,
        mine
          ? styles.myRow
          : styles.otherRow,
      ]}
    >
      {!mine && (


        <Image
          source={{
            uri:
              profileImg ||
              "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
          }}
          style={styles.chatAvatar}
        />



      )}


    <View
  style={[
    styles.messageBox,
    mine
      ? styles.myMessage
      : styles.otherMessage,
  ]}
>

  {item.type === "video" ? (

    <TouchableOpacity

     onPress={() => {

const videoArray = [{
  id: item.videoId,

  videoUrl:
    item.videoUrl || item.video,

  video:
    item.video,

  thumbnail:
    item.thumbnail,

  profile:
    item.profile,

  username:
    item.username,

  caption:
    item.caption,

  userId:
    item.userId,

  likes:
    item.likes || 0,

  commentsCount:
    item.commentsCount || 0,

  shares:
    item.shares || 0,

  views:
    item.views || 0,
}];

  router.push({
    pathname: "/allvideo",
    params: {
      videos: JSON.stringify(videoArray),
      index: 0,
      userId: userId,
    },
  });

}}

    >

      <Image
        source={{
          uri: item.thumbnail,
        }}
        style={styles.videoThumbnail}
      />

      <Ionicons
        name="play-circle"
        size={50}
        color="#fff"
        style={styles.playIcon}
      />

    </TouchableOpacity>

  ) : (

    <Text style={styles.messageText}>
      {String(item?.text || "")}
    </Text>

  )}

</View>

    </View>
  );
};

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === "ios"
          ? "padding"
          : undefined
      }
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
        >
          <Ionicons
            name="arrow-back"
            size={28}
            color="#fff"
          />
        </TouchableOpacity>

        
<TouchableOpacity
  onPress={() =>
    router.push({
      pathname: "./userProfile",
      params: {
        userId: userId,
      },
    })
  }
>
  <Image
    source={{
      uri:
        profileImg ||
        "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
    }}
    style={styles.avatar}
  />
</TouchableOpacity>


<View
  style={{
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 10,
  }}
>

  <Text style={styles.username}>
    {String(username)}
  </Text>

  {verified && (

<View
  style={{
    marginLeft: 5,
    justifyContent: "center",
    alignItems: "center",
  }}
>

  <MaterialCommunityIcons
    name="check-decagram"
    size={18}
    color="#ffffff"
  />

 

</View>

)}

  <View
    style={[
      styles.levelBadge,
      {
        backgroundColor:
          getLevelTheme(userLevel).bg,

        borderColor:
          getLevelTheme(userLevel).border,
      },
    ]}
  >
    <MaterialCommunityIcons
      name="diamond-stone"
      size={12}
      color={
        getLevelTheme(userLevel).icon
      }
    />

    <Text
      style={{
        color:
          getLevelTheme(userLevel).text,
        marginLeft: 3,
        fontSize: 11,
        fontWeight: "bold",
      }}
    >
      LV {userLevel}
    </Text>

  </View>

</View>

        
      </View>

    <FlatList
  ref={flatListRef}

  data={messages}

  renderItem={renderItem}

  keyExtractor={(item) =>
    String(item.id)
  }

  contentContainerStyle={{
    padding: 15,
    paddingBottom: 20,
  }}

  onContentSizeChange={() =>
    flatListRef.current?.scrollToEnd({
      animated: true,
    })
  }

  onLayout={() =>
    flatListRef.current?.scrollToEnd({
      animated: false,
    })
  }

  showsVerticalScrollIndicator={false}
/>

      <View style={styles.bottomBar}>
       <TextInput
  value={message}
  onChangeText={setMessage}
  placeholder={`Message.. ${String(
    username
  )}`}
  placeholderTextColor="#ccc"
  style={styles.input}

  // Keyboard me Send button dikhayega
  returnKeyType="send"

  // Keyboard band nahi hoga
  blurOnSubmit={false}

  // Keyboard ke Send button par
  onSubmitEditing={() => {
    if (message.trim()) {
      sendMessage();
    }
  }}
/>

        <TouchableOpacity
          style={styles.sendBtn}
          onPress={sendMessage}
        >
          <Ionicons
            name="send"
            size={28}
            color="#fff"
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  center: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },

  whiteText: {
    color: "#fff",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },

  avatar: {
    width: 45,
    height: 45,
    borderRadius: 25,
    marginLeft: 10,
  },

  username: {
    color: "#fff",
    fontSize: 20,
    marginLeft: 10,
    fontWeight: "bold",
  },


  row: {
  flexDirection: "row",
  alignItems: "flex-end",
  marginVertical: 4,
},

myRow: {
  justifyContent: "flex-end",
},

otherRow: {
  justifyContent: "flex-start",
},

chatAvatar: {
  width: 35,
  height: 35,
  borderRadius: 18,
  marginRight: 8,
},

  messageBox: {
    maxWidth: "75%",
    padding: 12,
    borderRadius: 15,
    marginVertical: 5,
  },

  myMessage: {
    backgroundColor: "#009688",
    alignSelf: "flex-end",
  },

  otherMessage: {
    backgroundColor: "#333",
    alignSelf: "flex-start",
  },

  messageText: {
    color: "#fff",
    fontSize: 16,
  },

bottomBar: {
  flexDirection: "row",
  alignItems: "center",
  padding: 15,
  marginBottom: 35,
  borderTopWidth: 1,
  borderTopColor: "#222",
},

  input: {
    flex: 1,
    backgroundColor: "#4f4c4c",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 15,
    height: 45,
  },

  sendBtn: {
    width: 45,
    height: 45,
    borderRadius: 30,
    backgroundColor: "#d6e40d",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },

videoThumbnail:{
  width:180,
  height:240,
  borderRadius:15,
},

playIcon:{
  position:'absolute',
  top:'40%',
  left:'40%',
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