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
    Alert,
Modal,
Pressable,
 Linking,
 ActivityIndicator,
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { VideoView, useVideoPlayer } from "expo-video";
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

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
  updateDoc,
} from "firebase/firestore";


// ==========================================
// CHAT MESSAGE WITH CLICKABLE LINKS
// ==========================================
const ChatMessageText = ({
  text,
  style,
  onLinkPress,
}) => {

  // http://, https:// aur www. links detect karega
  const parts = String(text || "").split(
    /(https?:\/\/[^\s]+|www\.[^\s]+)/gi
  );

  return (
    <Text style={style}>

      {parts.map((part, index) => {

        const isLink =
          /^(https?:\/\/|www\.)/i.test(part);

        if (!isLink) {
          return (
            <Text key={index}>
              {part}
            </Text>
          );
        }

        return (
          <Text
            key={index}
            onPress={() => onLinkPress(part)}
            style={{
              color: "#4DA6FF",
              textDecorationLine: "underline",
            }}
          >
            {part}
          </Text>
        );

      })}

    </Text>
  );
};

// ==========================================
// TIME / DATE HELPERS
// ==========================================
const formatMessageTime = (createdAt) => {
  if (!createdAt?.toDate) return "";
  const d = createdAt.toDate();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
};

const formatDateLabel = (createdAt) => {
  if (!createdAt?.toDate) return "";
  const d = createdAt.toDate();
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a, b) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();

  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";

  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

// Full-screen video player used by the media viewer (mounted only while open)
const ViewerVideo = ({ url }) => {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width: "100%", height: "80%" }}
      contentFit="contain"
      nativeControls
      allowsFullscreen
    />
  );
};

const MAX_MEDIA_MB = 50;

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

const [menuVisible, setMenuVisible] = useState(false);

const [selectedMessage, setSelectedMessage] =
  useState(null);

const [editModal, setEditModal] =
  useState(false);

const [editText, setEditText] =
  useState("");

const [userLevel, setUserLevel] = useState(1);
const flatListRef = useRef(null);
const [verified, setVerified] = useState(false);
const [verifiedColor, setVerifiedColor] = useState("white");
const [showPreview, setShowPreview] = useState(false);
const [keyboardHeight, setKeyboardHeight] = useState(0);
const [headerMenuVisible, setHeaderMenuVisible] = useState(false);
const [isBlocked, setIsBlocked] = useState(false);
const [blockedByOther, setBlockedByOther] = useState(false);
const [loadingMessages, setLoadingMessages] = useState(true);
const [sending, setSending] = useState(false);
// gallery uploads in progress (shown at the bottom of the chat with a % loader)
const [uploads, setUploads] = useState([]);
// full-screen photo/video viewer: { type: "image" | "video", url }
const [viewer, setViewer] = useState(null);


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


// ================================
// OPEN ANY LINK FROM CHAT
// ================================
const openChatLink = async (url) => {
  try {
    let cleanUrl = String(url).trim();

    // Agar http/https nahi hai to https add karo
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = `https://${cleanUrl}`;
    }

    const supported = await Linking.canOpenURL(cleanUrl);

    if (supported) {
      await Linking.openURL(cleanUrl);
    } else {
      Alert.alert(
        "Unable to open link",
        "This link cannot be opened on your device."
      );
    }
  } catch (error) {
    console.log("OPEN LINK ERROR =", error);

    Alert.alert(
      "Unable to open link",
      "Something went wrong while opening this link."
    );
  }
};


  // NOTE: hooks (useEffect below) must always run in the same order on
  // every render, so we no longer "return" before they are declared.
  // Missing user/userId is handled with a guarded render further down,
  // after every hook has been called.
  const currentUser = auth.currentUser;
  const currentUid = currentUser?.uid || "";

  const chatId =
    currentUid && userId
      ? currentUid < userId
        ? `${currentUid}_${userId}`
        : `${userId}_${currentUid}`
      : "";




useEffect(() => {

  if (!currentUid || !userId) return;

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

  const userData = userSnap.data();

  setVerified(
    userData.verified === true
  );

  setVerifiedColor(
    userData.verifiedColor || "white"
  );

}

const blockSnap = await getDoc(
  doc(
    db,
    "blockedUsers",
    currentUid,
    "users",
    userId
  )
);

setIsBlocked(blockSnap.exists());

const blockedByOtherSnap = await getDoc(
  doc(
    db,
    "blockedUsers",
    userId,
    "users",
    currentUid
  )
);

setBlockedByOther(
  blockedByOtherSnap.exists()
);



  };

  loadUser();

}, [userId]);


useEffect(() => {

  if (!chatId || !currentUid) return;

  let deletedAt = null;
  let unsubscribeDeleted = () => {};

  // Watch the "deletedAt" marker separately (once), instead of doing a
  // getDoc on every single incoming message snapshot - that was causing
  // extra network round-trips and laggy/flickery message updates.
  unsubscribeDeleted = onSnapshot(
    doc(db, "deletedChats", currentUid, "users", userId),
    (snap) => {
      deletedAt = snap.exists() ? snap.data().deletedAt : null;
    }
  );

  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt", "desc")
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {

    let list = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    if (deletedAt) {
      list = list.filter((msg) => {
        if (!msg.createdAt) return false;
        return msg.createdAt.toMillis() > deletedAt.toMillis();
      });
    }

    setMessages(list);
    setLoadingMessages(false);

    // Mark incoming messages from the other user as read (real "seen"
    // behaviour), so blue-tick status can be shown on our own messages.
    const unreadIds = snapshot.docs
      .filter((d) => {
        const data = d.data();
        return data.senderId === userId && data.read !== true;
      })
      .map((d) => d.id);

    unreadIds.forEach((id) => {
      updateDoc(
        doc(db, "chats", chatId, "messages", id),
        { read: true }
      ).catch(() => {});
    });

  });

  return () => {
    unsubscribe();
    unsubscribeDeleted();
  };

}, [chatId, currentUid, userId]);




useEffect(() => {

  if (!currentUid || !userId) return;

  const clearNewMessage = async () => {

    await setDoc(
      doc(
        db,
        "userChats",
        currentUid,
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

}, [currentUid, userId]);


// ================================
// TYPING INDICATOR (real WhatsApp-style "typing...")
// ================================
const [otherTyping, setOtherTyping] = useState(false);
const typingTimeoutRef = useRef(null);

useEffect(() => {

  if (!chatId || !userId) return;

  const unsubscribeTyping = onSnapshot(
    doc(db, "chats", chatId, "typing", userId),
    (snap) => {
      if (snap.exists()) {
        setOtherTyping(snap.data().isTyping === true);
      } else {
        setOtherTyping(false);
      }
    }
  );

  return unsubscribeTyping;

}, [chatId, userId]);

const handleTyping = (text) => {

  setMessage(text);

  if (!chatId || !currentUid) return;

  setDoc(
    doc(db, "chats", chatId, "typing", currentUid),
    { isTyping: text.length > 0, updatedAt: serverTimestamp() },
    { merge: true }
  ).catch(() => {});

  if (typingTimeoutRef.current) {
    clearTimeout(typingTimeoutRef.current);
  }

  typingTimeoutRef.current = setTimeout(() => {
    setDoc(
      doc(db, "chats", chatId, "typing", currentUid),
      { isTyping: false },
      { merge: true }
    ).catch(() => {});
  }, 2000);

};






useEffect(() => {

  const showListener = Keyboard.addListener(
    "keyboardDidShow",
    (e) => {

      setKeyboardHeight(e.endCoordinates.height);
      setShowPreview(true);

    }
  );

  const hideListener = Keyboard.addListener(
    "keyboardDidHide",
    () => {

      setShowPreview(false);
      setKeyboardHeight(0);

    }
  );

  return () => {

    showListener.remove();
    hideListener.remove();

  };

}, []);




  const sendMessage = async () => {

if (isBlocked) {

  Alert.alert(
    "Blocked",
    "Please unblock this user first."
  );

  return;

}

if (blockedByOther) {

  Alert.alert(
    "Blocked",
    "This user has blocked you."
  );

  return;

}


    if (!message.trim() || sending) return;

    const outgoingText = message.trim();
    setMessage("");
    setSending(true);

    // Stop the typing indicator immediately once we send
    setDoc(
      doc(db, "chats", chatId, "typing", currentUid),
      { isTyping: false },
      { merge: true }
    ).catch(() => {});

    try {
      const myDoc = await getDoc(
        doc(db, "users", currentUser.uid)
      );

      const myData = myDoc.data();

      await addDoc(
        collection(db, "chats", chatId, "messages"),
        {
          text: outgoingText,
          senderId: currentUser.uid,
          receiverId: userId,
          read: false,
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
    lastMessage: outgoingText,
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
    lastMessage: outgoingText,

hasNewMessage: true,
   unreadCount: increment(1),

    updatedAt: serverTimestamp(),

    
  },
  { merge: true }
);


      // Best-effort push notification - failure here shouldn't block the
      // message from having been sent already.
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
  senderUid: currentUser.uid,
  senderName:
    myData?.username ||
    currentUser.displayName ||
    "User",
  message: outgoingText,
}),
    }
  );

} catch (e) {
  console.log(e);
}

setShowPreview(false);
Keyboard.dismiss();

    } catch (err) {
      console.log("SEND ERROR =", err);
      // Message failed - restore the text so the user doesn't lose it
      setMessage(outgoingText);
      Alert.alert("Message not sent", "Please check your connection and try again.");
    } finally {
      setSending(false);
      // Jump to the newest message (list is inverted, so index 0 = bottom)
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      });
    }
  };




// ================================
// POPUP HELPERS - tapping anywhere outside closes the popup
// ================================
const closeMenu = () => {
  setMenuVisible(false);
  setSelectedMessage(null);
};

const closeEdit = () => {
  Keyboard.dismiss();
  setEditModal(false);
  setSelectedMessage(null);
};

const deleteMessage = async () => {

  const target = selectedMessage;

  // close instantly (feels fast), delete in background
  closeMenu();

  if (!target?.id) return;

  try {

    await deleteDoc(
      doc(db, "chats", chatId, "messages", target.id)
    );

    // best-effort: also remove the uploaded photo/video file
    if (target.type === "media") {
      [target.mediaUrl, target.thumbnail].forEach((u) => {
        if (!u) return;
        deleteObject(storageRef(getStorage(), u)).catch(() => {});
      });
    }

  } catch (e) {
    console.log(e);
  }

};


const updateMessage = async () => {

  const target = selectedMessage;
  const newText = editText.trim();

  closeEdit();

  if (!target?.id || !newText) return;
  if (newText === (target.text || "")) return;   // nothing changed

  try {

    await updateDoc(
      doc(db, "chats", chatId, "messages", target.id),
      {
        text: newText,
        edited: true,
      }
    );

  } catch (e) {
    console.log(e);
  }

};


// ================================
// SEND PHOTO / VIDEO FROM GALLERY
// ================================
const uploadFile = (uri, path, contentType, onProgress) =>
  new Promise(async (resolve, reject) => {
    try {
      const blob = await (await fetch(uri)).blob();
      const task = uploadBytesResumable(
        storageRef(getStorage(), path),
        blob,
        { contentType }
      );
      task.on(
        "state_changed",
        (snap) => {
          if (onProgress && snap.totalBytes) {
            onProgress(snap.bytesTransferred / snap.totalBytes);
          }
        },
        reject,
        async () => {
          try {
            resolve(await getDownloadURL(task.snapshot.ref));
          } catch (e) {
            reject(e);
          }
        }
      );
    } catch (e) {
      reject(e);
    }
  });

const sendOneMedia = async (asset) => {

  const isVideo = asset.type === "video";
  const localId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  setUploads((prev) => [
    { id: localId, asset, isVideo, progress: 0, failed: false },
    ...prev,
  ]);

  const setProgress = (p) =>
    setUploads((prev) =>
      prev.map((u) => (u.id === localId ? { ...u, progress: p } : u))
    );

  try {

    const extFromUri = (asset.uri.split(".").pop() || "").split("?")[0].toLowerCase();
    const ext = extFromUri && extFromUri.length <= 5 ? extFromUri : isVideo ? "mp4" : "jpg";
    const contentType =
      asset.mimeType || (isVideo ? `video/${ext}` : `image/${ext === "jpg" ? "jpeg" : ext}`);
    const base = `chatMedia/${chatId}/${currentUid}_${localId}`;

    // small thumbnail for videos (uploaded in parallel-ish, tiny file)
    let thumbUrl = "";
    if (isVideo) {
      try {
        const t = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 500 });
        thumbUrl = await uploadFile(t.uri, `${base}_thumb.jpg`, "image/jpeg");
      } catch (e) {
        console.log("THUMB ERROR =", e);
      }
    }

    const mediaUrl = await uploadFile(
      asset.uri,
      `${base}.${ext}`,
      contentType,
      setProgress
    );

    await addDoc(
      collection(db, "chats", chatId, "messages"),
      {
        type: "media",
        mediaType: isVideo ? "video" : "image",
        mediaUrl,
        thumbnail: thumbUrl,
        width: asset.width || 0,
        height: asset.height || 0,
        senderId: currentUid,
        receiverId: userId,
        read: false,
        createdAt: serverTimestamp(),
      }
    );

    // chat list preview + push notification (same as text messages)
    const label = isVideo ? "🎥 Video" : "📷 Photo";
    const myData = (await getDoc(doc(db, "users", currentUid))).data();

    await Promise.all([
      setDoc(
        doc(db, "userChats", currentUid, "friends", userId),
        {
          userId,
          username,
          profileImg,
          lastMessage: label,
          updatedAt: serverTimestamp(),
          unreadCount: 0,
        },
        { merge: true }
      ),
      setDoc(
        doc(db, "userChats", userId, "friends", currentUid),
        {
          userId: currentUid,
          username: myData?.username || currentUser?.displayName || "User",
          profileImg: myData?.profileImg || currentUser?.photoURL || "",
          lastMessage: label,
          hasNewMessage: true,
          unreadCount: increment(1),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
    ]);

    fetch("https://topking-backend.onrender.com/send-message-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiverUid: userId,
        senderUid: currentUid,
        senderName: myData?.username || currentUser?.displayName || "User",
        message: label,
      }),
    }).catch(() => {});

    setUploads((prev) => prev.filter((u) => u.id !== localId));

  } catch (err) {
    console.log("MEDIA SEND ERROR =", err);
    setUploads((prev) =>
      prev.map((u) => (u.id === localId ? { ...u, failed: true } : u))
    );
  }
};

const pickAndSendMedia = async () => {

  if (isBlocked) {
    Alert.alert("Blocked", "Please unblock this user first.");
    return;
  }

  if (blockedByOther) {
    Alert.alert("Blocked", "This user has blocked you.");
    return;
  }

  try {

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;

    result.assets.forEach((asset) => {

      if (asset.fileSize && asset.fileSize > MAX_MEDIA_MB * 1024 * 1024) {
        Alert.alert(
          "File too large",
          `Please choose a file smaller than ${MAX_MEDIA_MB} MB.`
        );
        return;
      }

      sendOneMedia(asset);

    });

  } catch (e) {
    console.log("PICK MEDIA ERROR =", e);
    Alert.alert("Error", "Could not open gallery.");
  }

};

// pending uploads shown at the bottom of the (inverted) list
const renderUploads = () =>
  uploads.length === 0 ? null : (
    <View>
      {uploads.map((u) => (
        <View key={u.id} style={[styles.row, styles.myRow]}>
          <TouchableOpacity
            activeOpacity={u.failed ? 0.7 : 1}
            onPress={() => {
              if (!u.failed) return;
              setUploads((prev) => prev.filter((x) => x.id !== u.id));
              sendOneMedia(u.asset);      // retry
            }}
            style={styles.mediaBubble}
          >
            <Image source={{ uri: u.asset.uri }} style={styles.mediaImg} />
            <View style={styles.mediaUploadOverlay}>
              {u.failed ? (
                <>
                  <Ionicons name="refresh" size={30} color="#fff" />
                  <Text style={styles.mediaUploadText}>Tap to retry</Text>
                </>
              ) : (
                <>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.mediaUploadText}>
                    {Math.round(u.progress * 100)}%
                  </Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );




const blockUser = async () => {
  try {

    Alert.alert(
      "Block User",
      `Do you want to block ${username}?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {

            await setDoc(
              doc(
                db,
                "blockedUsers",
                currentUid,
                "users",
                userId
              ),
              {
                userId: userId,
                username: username,
                profileImg: profileImg,
                blockedAt: serverTimestamp(),
              }
            );

            setHeaderMenuVisible(false);
setIsBlocked(true);
            Alert.alert(
              "Success",
              "User Blocked Successfully"
            );

          },
        },
      ]
    );

  } catch (e) {
    console.log(e);
  }
};



const unblockUser = async () => {

  try {

    await deleteDoc(
      doc(
        db,
        "blockedUsers",
        currentUid,
        "users",
        userId
      )
    );

    setIsBlocked(false);

    setHeaderMenuVisible(false);

    Alert.alert(
      "Success",
      "User Unblocked"
    );

  } catch (e) {

    console.log(e);

  }

};




 const renderItem = ({ item, index }) => {

  const mine =
    item?.senderId === currentUser.uid;

  // messages are ordered newest -> oldest; the "next" array entry is
  // actually the older neighbour because the list is rendered inverted.
  const olderNeighbour = messages[index + 1];

  const showDateSeparator =
    !!item.createdAt &&
    (!olderNeighbour?.createdAt ||
      formatDateLabel(olderNeighbour.createdAt) !==
        formatDateLabel(item.createdAt));

  const DateSeparator = showDateSeparator ? (
    <View style={styles.dateSeparatorWrap}>
      <Text style={styles.dateSeparatorText}>
        {formatDateLabel(item.createdAt)}
      </Text>
    </View>
  ) : null;


if (item.type === "liveInvite") {

  return (
    <>
    {DateSeparator}
    <View
      style={[
        styles.row,
        mine
          ? styles.myRow
          : styles.otherRow,
      ]}
    >

      <TouchableOpacity

delayLongPress={400}

  onLongPress={() => {

    if (item.senderId !== currentUser.uid)
      return;

    setSelectedMessage(item);

    setMenuVisible(true);

  }}

        style={{
          backgroundColor:"#1e1e1e",
          padding:15,
          borderRadius:15,
          width:220,
        }}

        onPress={() => {

          router.push({
            pathname:"/LiveRoom",
            params:{
              id:item.roomId
            }
          });

        }}
      >

        <Text
          style={{
            color:"#fff",
            fontWeight:"bold",
            fontSize:16,
          }}
        >
          🎙 Live Invite
        </Text>

        <Text
          style={{
            color:"#ccc",
            marginTop:5,
          }}
        >
          Join Live Room
        </Text>

      </TouchableOpacity>

    </View>
    </>
  );
}




if (item.type === "media") {

  const isVideoMsg = item.mediaType === "video";

  return (
    <>
    {DateSeparator}
    <View
      style={[
        styles.row,
        mine ? styles.myRow : styles.otherRow,
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

      <TouchableOpacity
        activeOpacity={0.9}
        delayLongPress={400}
        style={styles.mediaBubble}
        onPress={() =>
          setViewer({
            type: isVideoMsg ? "video" : "image",
            url: item.mediaUrl,
          })
        }
        onLongPress={() => {
          if (!mine) return;
          setSelectedMessage(item);
          setMenuVisible(true);
        }}
      >

        <Image
          source={{
            uri: isVideoMsg ? item.thumbnail || undefined : item.mediaUrl,
          }}
          style={styles.mediaImg}
        />

        {isVideoMsg && (
          <Ionicons
            name="play-circle"
            size={50}
            color="#fff"
            style={styles.mediaPlayIcon}
          />
        )}

        <View style={styles.mediaMeta}>
          <Text style={styles.mediaTime}>
            {formatMessageTime(item.createdAt)}
          </Text>
          {mine && (
            <Ionicons
              name={item.read ? "checkmark-done" : "checkmark"}
              size={14}
              color={item.read ? "#4DA6FF" : "#fff"}
              style={{ marginLeft: 4 }}
            />
          )}
        </View>

      </TouchableOpacity>

    </View>
    </>
  );
}


  return (
    <>
    {DateSeparator}
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





<TouchableOpacity

  delayLongPress={400}

 onLongPress={() => {

  if (item.senderId !== currentUser.uid)
    return;

  setSelectedMessage(item);

  if (item.type === "video") {
    setEditText("");
  } else if (item.type === "liveInvite") {
    setEditText("");
  } else {
    setEditText(item.text || "");
  }

  setMenuVisible(true);

}}

  style={[
    styles.messageBox,



    item.type !== "video" &&
      (mine
        ? styles.myMessage
        : styles.otherMessage),

    item.type === "video" && {
      backgroundColor: "transparent",
      padding: 0,
    },
  ]}
>
    

  {item.type === "video" ? (

    <TouchableOpacity


delayLongPress={400}

 onLongPress={() => {

   if (item.senderId !== currentUser.uid)
     return;

   setSelectedMessage(item);

   setMenuVisible(true);

 }}

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
    from: "chat",
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

  <ChatMessageText
    text={String(item?.text || "")}
    style={styles.messageText}
    onLinkPress={openChatLink}
  />

)}

{item.type !== "video" && (

<View
  style={{
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    marginTop: 3,
  }}
>

  {item.edited && (
    <Text
      style={{
        color: "#cfcfcf",
        fontSize: 10,
        marginRight: 5,
      }}
    >
      edited
    </Text>
  )}

  <Text
    style={{
      color: "#dcdcdc",
      fontSize: 10,
    }}
  >
    {formatMessageTime(item.createdAt)}
  </Text>

  {mine && (
    <Ionicons
      name={item.read ? "checkmark-done" : "checkmark"}
      size={14}
      color={item.read ? "#4DA6FF" : "#dcdcdc"}
      style={{ marginLeft: 4 }}
    />
  )}

</View>

)}


</TouchableOpacity>


</View>
    </>
  );
};

  // These checks run after every hook above has already been called on
  // every render, so they no longer break the Rules of Hooks (previously
  // they sat above the useEffects, which caused React to sometimes see a
  // different number of hooks between renders and crash/misbehave).
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
    marginLeft: 10,
  }}
>

<View
  style={{
    flexDirection: "row",
    alignItems: "center",
  }}
>

  <Text style={styles.username}>
    {String(username)}
  </Text>

 
{verified && (

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
    size={18}
    color={
      verifiedColor === "yellow"
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

{otherTyping && (
  <Text style={styles.typingText}>typing...</Text>
)}

</View>
<View style={{ marginLeft: "auto" }}>

  <TouchableOpacity
    onPress={() => setHeaderMenuVisible(true)}
  >
    <Ionicons
      name="ellipsis-vertical"
      size={25}
      color="#fff"
    />
  </TouchableOpacity>

</View>
        
      </View>

    <FlatList
  ref={flatListRef}

  data={messages}
inverted
  renderItem={renderItem}

  keyExtractor={(item) =>
    String(item.id)
  }

  contentContainerStyle={[
    { padding: 15, paddingBottom: 20 },
    messages.length === 0 && { flex: 1 },
  ]}

  ListEmptyComponent={
    loadingMessages ? null : (
      <View style={styles.emptyChatWrap}>
        <Text style={styles.emptyChatText}>
          No messages yet. Say hi 👋
        </Text>
      </View>
    )
  }

  showsVerticalScrollIndicator={false}

  // tap on the chat area closes the keyboard; scrolling does too
  keyboardShouldPersistTaps="handled"
  onScrollBeginDrag={Keyboard.dismiss}

  // (inverted list) header = very bottom => pending uploads
  ListHeaderComponent={renderUploads}
/>


{showPreview && (

<View
style={[
styles.previewBox,
{
bottom: keyboardHeight,
},
]}
>

<Text
style={styles.previewText}
>

{message || "Type message..."}

</Text>

</View>

)}



      <View style={styles.bottomBar}>

        <TouchableOpacity
          disabled={isBlocked || blockedByOther}
          style={[
            styles.attachBtn,
            { opacity: isBlocked || blockedByOther ? 0.5 : 1 },
          ]}
          onPress={pickAndSendMedia}
        >
          <Ionicons name="images" size={26} color="#fff" />
        </TouchableOpacity>

       <TextInput
  value={message}
  onChangeText={handleTyping}

  placeholder={
  isBlocked
    ? "Unblock user to send message"
    : blockedByOther
    ? "You can't send messages to this user"
    : `Message.. ${username}`
}

  placeholderTextColor="#ccc"
  editable={!(isBlocked || blockedByOther)}
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
  disabled={isBlocked || blockedByOther}

  style={[
    styles.sendBtn,
    {
      opacity:
        isBlocked || blockedByOther
          ? 0.5
          : 1,
    },
  ]}

  onPress={sendMessage}
>


          <Ionicons
            name="send"
            size={28}
            color="#fff"
          />
        </TouchableOpacity>
      </View>



{/* ============ MESSAGE MENU (tap anywhere outside = close) ============ */}
<Modal
  visible={menuVisible}
  transparent
  animationType="fade"
  statusBarTranslucent
  onRequestClose={closeMenu}
>

  <Pressable style={styles.modalOverlay} onPress={closeMenu}>

    {/* inner Pressable swallows taps so touching the box doesn't close it */}
    <Pressable style={styles.menuBox} onPress={() => {}}>

      {selectedMessage?.type !== "video" &&
       selectedMessage?.type !== "liveInvite" &&
       selectedMessage?.type !== "media" && (

        <TouchableOpacity
          onPress={() => {
            setMenuVisible(false);
            setEditModal(true);
          }}
        >
          <Text style={styles.menuEditText}>Edit Message</Text>
        </TouchableOpacity>

      )}

      <TouchableOpacity onPress={deleteMessage}>
        <Text style={styles.menuDeleteText}>Delete</Text>
      </TouchableOpacity>

    </Pressable>

  </Pressable>

</Modal>



{/* ============ EDIT MESSAGE (tap anywhere outside = close) ============ */}
<Modal
  visible={editModal}
  transparent
  animationType="fade"
  statusBarTranslucent
  onRequestClose={closeEdit}
>

  <Pressable style={styles.modalOverlay} onPress={closeEdit}>

    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ width: "100%", alignItems: "center" }}
    >

      <Pressable style={styles.editBox} onPress={() => {}}>

        <TextInput
          value={editText}
          onChangeText={setEditText}
          autoFocus
          multiline
          style={styles.editInput}
        />

        <TouchableOpacity
          onPress={updateMessage}
          style={styles.editSaveBtn}
        >
          <Text style={styles.editSaveText}>Save</Text>
        </TouchableOpacity>

      </Pressable>

    </KeyboardAvoidingView>

  </Pressable>

</Modal>



{/* ============ PHOTO / VIDEO VIEWER ============ */}
<Modal
  visible={!!viewer}
  transparent
  animationType="fade"
  statusBarTranslucent
  onRequestClose={() => setViewer(null)}
>

  <Pressable
    style={styles.viewerOverlay}
    onPress={() => setViewer(null)}
  >

    {viewer?.type === "image" && (
      <Image
        source={{ uri: viewer.url }}
        style={{ width: "100%", height: "85%" }}
        resizeMode="contain"
      />
    )}

    {viewer?.type === "video" && <ViewerVideo url={viewer.url} />}

    <TouchableOpacity
      style={styles.viewerClose}
      onPress={() => setViewer(null)}
    >
      <Ionicons name="close" size={32} color="#fff" />
    </TouchableOpacity>

  </Pressable>

</Modal>




<Modal
  visible={headerMenuVisible}
  transparent
  animationType="fade"
>

  <Pressable
    style={{
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
    }}
    onPress={() => setHeaderMenuVisible(false)}
  >

    <View
      style={{
        position: "absolute",
        top: 70,
        right: 15,
        width: 180,
        backgroundColor: "#111",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >

      <TouchableOpacity
       onPress={
 isBlocked
   ? unblockUser
   : blockUser
}

        style={{
          padding: 16,
        }}
      >

        <Text
  style={{
    color:isBlocked ? "#00E676" : "red",
    fontSize:16,
    fontWeight:"bold",
  }}
>

{isBlocked
 ? "✅ Unblock User"
 : "🚫 Block User"}

</Text>

      </TouchableOpacity>

    </View>

  </Pressable>

</Modal>


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
    fontSize: 17,
    marginLeft: 0,
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
  width:130,
  height:190,
  borderRadius:15,
},

playIcon:{
  position:'absolute',
  top:'37%',
  left:'33%',
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

previewBox:{

position:"absolute",

left:0,

right:0,

padding:15,

backgroundColor:"#222",

borderTopWidth:1,

borderTopColor:"#444",

marginBottom: 45,

},

previewText:{

color:"#fff",

fontSize:16,

},

dateSeparatorWrap: {
  alignSelf: "center",
  backgroundColor: "#1f1f1f",
  paddingHorizontal: 12,
  paddingVertical: 4,
  borderRadius: 12,
  marginVertical: 10,
},

dateSeparatorText: {
  color: "#ccc",
  fontSize: 12,
  fontWeight: "600",
},

typingText: {
  color: "#9be29b",
  fontSize: 12,
  marginTop: 2,
},

scrollToBottomBtn: {
  position: "absolute",
  right: 15,
  bottom: 90,
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: "#2a2a2a",
  justifyContent: "center",
  alignItems: "center",
  borderWidth: 1,
  borderColor: "#444",
},

emptyChatWrap: {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  transform: [{ scaleY: -1 }],
},

emptyChatText: {
  color: "#777",
  fontSize: 14,
},

attachBtn: {
  width: 45,
  height: 45,
  borderRadius: 25,
  backgroundColor: "#2a2a2a",
  justifyContent: "center",
  alignItems: "center",
  marginRight: 10,
},

mediaBubble: {
  width: 210,
  height: 250,
  borderRadius: 15,
  overflow: "hidden",
  backgroundColor: "#1a1a1a",
  marginVertical: 5,
},

mediaImg: {
  width: "100%",
  height: "100%",
},

mediaPlayIcon: {
  position: "absolute",
  top: "40%",
  alignSelf: "center",
  left: "38%",
},

mediaMeta: {
  position: "absolute",
  right: 8,
  bottom: 6,
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "rgba(0,0,0,0.45)",
  paddingHorizontal: 6,
  paddingVertical: 2,
  borderRadius: 10,
},

mediaTime: {
  color: "#fff",
  fontSize: 10,
},

mediaUploadOverlay: {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: "rgba(0,0,0,0.55)",
  justifyContent: "center",
  alignItems: "center",
},

mediaUploadText: {
  color: "#fff",
  marginTop: 6,
  fontWeight: "600",
},

modalOverlay: {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  backgroundColor: "rgba(0,0,0,0.6)",
},

menuBox: {
  width: 250,
  backgroundColor: "#111",
  borderRadius: 15,
  padding: 15,
},

menuEditText: {
  color: "#fff",
  fontSize: 18,
  padding: 15,
},

menuDeleteText: {
  color: "red",
  fontSize: 18,
  padding: 15,
},

editBox: {
  width: "90%",
  backgroundColor: "#111",
  borderRadius: 15,
  padding: 20,
},

editInput: {
  color: "#fff",
  borderWidth: 1,
  borderColor: "#333",
  borderRadius: 10,
  padding: 12,
  maxHeight: 160,
},

editSaveBtn: {
  backgroundColor: "#00C853",
  padding: 15,
  borderRadius: 10,
  marginTop: 15,
},

editSaveText: {
  color: "#fff",
  textAlign: "center",
  fontWeight: "bold",
},

viewerOverlay: {
  flex: 1,
  backgroundColor: "rgba(0,0,0,0.95)",
  justifyContent: "center",
  alignItems: "center",
},

viewerClose: {
  position: "absolute",
  top: 50,
  right: 20,
  padding: 6,
},




});             