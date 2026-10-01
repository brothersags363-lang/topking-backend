// @ts-nocheck
// livevideostart.tsx
//
// "Go Live" setup screen. Creates the room in Firestore `rooms/{roomId}` and
// sends the host to /videolive (role = host).
//
// Fixed / added compared to the old version:
//  • Cover image is now UPLOADED to Firebase Storage. Before, the phone's local
//    file:// path was saved in Firestore, so every other user saw a broken cover.
//  • Double tap on GO LIVE can't create two rooms any more (loading state).
//  • Old "zombie" lives of the same host (app crashed / killed) are closed first.
//  • Camera preview is released BEFORE the live screen opens (no frozen camera).
//  • Audience / Safety / Settings buttons really work (they were empty).
//  • Flip camera button, bad-word clean title, safe-area aware layout.
//  • Profile fallbacks (name / photoURL) so "Host" and empty avatars don't appear.

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";

import { getAuth } from "firebase/auth";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

import { db } from "./firebaseConfig";

const BAD_WORDS = ["fuck", "bitch", "sex", "porn", "madarchod", "bhosdi", "chutiya", "randi", "gaand", "lund"];
const cleanText = (t: string) => {
  let out = t;
  BAD_WORDS.forEach((w) => {
    out = out.replace(new RegExp(w, "gi"), "*".repeat(w.length));
  });
  return out;
};

// cover upload must never block going live for long
const withTimeout = (p: Promise<any>, ms: number) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

export default function VideoLiveStart() {
  const router = useRouter();
  const auth = getAuth();

  const [title, setTitle] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [facing, setFacing] = useState<"front" | "back">("front");

  // safety / audience options (saved into the room)
  const [roomType, setRoomType] = useState<"public" | "followers">("public");
  const [commentsOn, setCommentsOn] = useState(true);

  const [userData, setUserData] = useState({
    userId: "",
    username: "",
    profile: "",
  });

  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    let alive = true;
    (async () => {
      const user = auth.currentUser;
      if (!user) return;
      // show something right away, then replace with the real profile
      setUserData({
        userId: user.uid,
        username: user.displayName || "",
        profile: user.photoURL || "",
      });
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!alive) return;
        if (snap.exists()) {
          const data: any = snap.data();
          setUserData({
            userId: user.uid,
            username: data.username || data.name || user.displayName || "",
            profile: data.profileImg || data.photoURL || user.photoURL || "",
          });
        }
      } catch (e) {
        console.log("LIVE START: profile load error", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const pickCover = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.6, // smaller upload, plenty for a cover
      });
      if (!result.canceled) setCoverImage(result.assets[0].uri);
    } catch (e) {
      Alert.alert("Cover", "Could not open the gallery.");
    }
  };

  // local file → public https url (so other users can see it)
  const uploadCover = async (uri: string, uid: string) => {
    try {
      const blob: any = await withTimeout(fetch(uri).then((r) => r.blob()), 12000);
      const r = storageRef(getStorage(), `liveCovers/${uid}_${Date.now()}.jpg`);
      await withTimeout(uploadBytes(r, blob), 20000);
      return (await withTimeout(getDownloadURL(r), 10000)) as string;
    } catch (e) {
      console.log("LIVE START: cover upload failed", e);
      return "";
    }
  };

  // close old active lives of this host (crash / killed app) so the list never shows two
  const closeOldLives = async (uid: string) => {
    try {
      const old = await getDocs(
        query(collection(db, "rooms"), where("hostId", "==", uid), where("status", "==", "active"))
      );
      await Promise.all(
        old.docs.map((d) =>
          updateDoc(d.ref, { status: "ended", endedAt: serverTimestamp() }).catch(() => {})
        )
      );
    } catch (e) {
      console.log("LIVE START: close old lives error", e);
    }
  };

  const startLive = useCallback(async () => {
    if (starting) return;
    const uid = userData.userId || auth.currentUser?.uid;
    if (!uid) {
      Alert.alert("Live", "Please login first.");
      return;
    }
    setStarting(true);

    try {
      await closeOldLives(uid);

      let coverUrl = "";
      if (coverImage) coverUrl = await uploadCover(coverImage, uid);

      const roomId = `video_${uid}_${Date.now()}`;

      const liveData = {
        hostId: uid,
        hostName: userData.username || "Host",
        hostImg: userData.profile || "",

        title: cleanText((title || "").trim()).slice(0, 60) || "Live Broadcast",
        roomCover: coverUrl || userData.profile || "",

        type: "video",
        roomType, // "public" | "followers"
        chatLocked: !commentsOn,

        status: "active",
        category: "LIVE",

        joinedUsers: [],
        viewers: 0,
        likes: 0,
        gifts: 0,

        createdAt: serverTimestamp(),
        lastHeartbeat: serverTimestamp(),
      };

      await setDoc(doc(db, "rooms", roomId), liveData);

      // release the camera BEFORE the live screen (Agora) takes it
      setCameraOn(false);
      await new Promise((r) => setTimeout(r, 200));

      router.replace({
        pathname: "/videolive",
        params: { id: roomId, role: "host" },
      });
    } catch (e) {
      console.log("LIVE START ERROR:", e);
      Alert.alert("Live", "Could not start the live. Check your internet and try again.");
      setCameraOn(true);
      setStarting(false);
    }
  }, [starting, userData, title, coverImage, roomType, commentsOn]);

  // ---------- bottom option buttons ----------
  const chooseAudience = () =>
    Alert.alert("Who can watch?", "", [
      { text: "Public (everyone)", onPress: () => setRoomType("public") },
      { text: "Followers only", onPress: () => setRoomType("followers") },
      { text: "Cancel", style: "cancel" },
    ]);

  const openSafety = () =>
    Alert.alert(
      "Safety",
      "Abusive words in chat are hidden automatically. Moderators and the host can mute or remove anyone during the live.",
      [
        {
          text: commentsOn ? "Turn comments OFF" : "Turn comments ON",
          onPress: () => setCommentsOn((v) => !v),
        },
        { text: "OK", style: "cancel" },
      ]
    );

  const openSettings = () =>
    Alert.alert("Live settings", "", [
      { text: "Switch camera", onPress: () => setFacing((f) => (f === "front" ? "back" : "front")) },
      { text: "Change cover", onPress: pickCover },
      { text: "Cancel", style: "cancel" },
    ]);

  // ---------- permission states ----------
  if (!permission) {
    return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permWrap}>
        <Ionicons name="videocam-outline" size={48} color="#FFD600" />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permSub}>Allow the camera to start your live video.</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permBtn}>
          <Text style={styles.permBtnTxt}>Allow Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: "#999" }}>Not now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar translucent barStyle="light-content" backgroundColor="transparent" />

      {/* Camera preview (full screen) */}
      {cameraOn ? (
        <CameraView style={StyleSheet.absoluteFill} facing={facing} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} />
      )}

      {/* soft dark layer so white text is readable */}
      <View pointerEvents="none" style={styles.overlay} />

      <SafeAreaView style={StyleSheet.absoluteFill} edges={["top", "bottom"]}>
        {/* top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.roundBtn} onPress={() => router.back()} disabled={starting}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.roundBtn}
            onPress={() => setFacing((f) => (f === "front" ? "back" : "front"))}
            disabled={starting}
          >
            <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* cover + title */}
        <View style={styles.topSection}>
          <TouchableOpacity style={styles.coverBox} onPress={pickCover} disabled={starting}>
            {coverImage ? (
              <Image source={{ uri: coverImage }} style={styles.coverImg} />
            ) : (
              <>
                <Ionicons name="image" size={26} color="#fff" />
                <Text style={styles.coverHint}>Cover</Text>
              </>
            )}
          </TouchableOpacity>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Enter live title..."
            placeholderTextColor="#bbb"
            style={styles.input}
            maxLength={60}
            editable={!starting}
          />
        </View>

        <View style={{ flex: 1 }} />

        {/* bottom controls */}
        <View style={styles.bottomSection}>
          <View style={styles.optionRow}>
            <TouchableOpacity style={styles.option} onPress={chooseAudience} disabled={starting}>
              <Ionicons name="people" size={22} color="#fff" />
              <Text style={styles.optionText}>{roomType === "public" ? "Public" : "Followers"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.option} onPress={openSafety} disabled={starting}>
              <Ionicons name="shield-checkmark" size={22} color="#fff" />
              <Text style={styles.optionText}>{commentsOn ? "Safety" : "Chat off"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.option} onPress={openSettings} disabled={starting}>
              <Ionicons name="settings" size={22} color="#fff" />
              <Text style={styles.optionText}>Settings</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.liveBtn, starting && { opacity: 0.7 }]}
            onPress={startLive}
            disabled={starting}
            activeOpacity={0.85}
          >
            {starting ? (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <ActivityIndicator color="#000" />
                <Text style={[styles.liveText, { marginLeft: 10 }]}>STARTING...</Text>
              </View>
            ) : (
              <Text style={styles.liveText}>GO LIVE</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },

  permWrap: { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center", padding: 30 },
  permTitle: { color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 14 },
  permSub: { color: "#999", fontSize: 13, marginTop: 6, textAlign: "center" },
  permBtn: { backgroundColor: "#FFD600", paddingVertical: 14, paddingHorizontal: 30, borderRadius: 12, marginTop: 22 },
  permBtnTxt: { color: "#000", fontWeight: "800", fontSize: 15 },

  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 8 : 0,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },

  topSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 16,
  },
  coverBox: {
    width: 70,
    height: 90,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  coverImg: { width: "100%", height: "100%" },
  coverHint: { color: "#fff", fontSize: 11, marginTop: 4, fontWeight: "600" },

  input: {
    flex: 1,
    marginLeft: 15,
    color: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#777",
    fontSize: 16,
    paddingBottom: 10,
  },

  bottomSection: {
    width: "100%",
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "android" ? 20 : 8,
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 22,
  },
  option: { alignItems: "center", minWidth: 70 },
  optionText: { color: "#fff", marginTop: 5, fontSize: 12 },

  liveBtn: {
    backgroundColor: "#FFD600",
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: "center",
    elevation: 8,
  },
  liveText: { fontSize: 20, fontWeight: "bold", color: "#000" },
});
