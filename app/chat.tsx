import React, { useEffect, useState } from "react";
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
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
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
    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setMessages(list);
    });

    return unsubscribe;
  }, [chatId]);

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
        }
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
          updatedAt: serverTimestamp(),
        }
      );

      setMessage("");
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
        <Text style={styles.messageText}>
          {String(item?.text || "")}
        </Text>
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

        <Image
          source={{
            uri:
              profileImg ||
              "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
          }}
          style={styles.avatar}
        />

        <Text style={styles.username}>
          {String(username)}
        </Text>
      </View>

      <FlatList
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item) =>
          String(item.id)
        }
        contentContainerStyle={{
          padding: 15,
        }}
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
});