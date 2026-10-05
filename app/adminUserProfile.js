import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebaseConfig";
import useIsAdmin from "./useIsAdmin";
import { callApi } from "./api";

const PLACEHOLDER = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

export default function AdminUserProfile() {
  const { userId } = useLocalSearchParams();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const [user, setUser] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId || !isAdmin) return;
    return onSnapshot(doc(db, "users", String(userId)), (snap) => {
      setUser(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });
  }, [userId, isAdmin]);

  useEffect(() => {
    if (!userId || !isAdmin) return;
    const q = query(collection(db, "all_videos"), where("userId", "==", String(userId)));
    return onSnapshot(q, (snap) =>
      setVideos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, [userId, isAdmin]);

  const run = async (path, body, okMsg, after) => {
    if (busy) return;
    setBusy(true);
    try {
      await callApi(path, body);
      if (okMsg) Alert.alert("Done", okMsg);
      if (after) after();
    } catch (e) {
      Alert.alert("Error", e.message || "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleBan = () => {
    const ban = !user.banned;
    Alert.alert(
      ban ? "Ban user?" : "Unban user?",
      ban
        ? "User login band ho jayega aur wo app use nahi kar payega."
        : "User dobara login kar sakega.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: ban ? "Ban" : "Unban",
          style: ban ? "destructive" : "default",
          onPress: () =>
            run(ban ? "/admin/ban-user" : "/admin/unban-user", { uid: user.id }),
        },
      ]
    );
  };

  const deleteUser = () =>
    Alert.alert(
      "Delete ID?",
      "User ka login, profile, saare videos aur stories hamesha ke liye delete honge. Ye wapas nahi hoga.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            run("/admin/delete-user", { uid: user.id }, "User delete ho gaya", () =>
              router.back()
            ),
        },
      ]
    );

  const deleteVideo = (v) =>
    Alert.alert("Delete video?", "Ye video hamesha ke liye delete ho jayega.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => run("/admin/delete-video", { videoId: v.id }),
      },
    ]);

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "red", fontSize: 22 }}>
          {isAdmin === null ? "Checking..." : "Access Denied"}
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "#888" }}>User not found</Text>
      </View>
    );
  }

  const fields = [
    ["Username", user.username],
    ["Email", user.email],
    ["Phone", user.phone],
    ["User ID", user.id],
    ["Reports", user.reportCount || 0],
    ["Banned", user.banned ? "Yes" : "No"],
    ["Videos", videos.length],
  ];

  return (
    <ScrollView style={styles.container}>
      <Image source={{ uri: user.profileImg || PLACEHOLDER }} style={styles.avatar} />
      <Text style={styles.name}>{user.username || "No name"}</Text>

      {fields.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{String(value ?? "-")}</Text>
        </View>
      ))}

      <TouchableOpacity
        disabled={busy}
        style={[styles.actionBtn, { backgroundColor: user.banned ? "#27ae60" : "#f39c12" }]}
        onPress={toggleBan}
      >
        <Text style={styles.actionText}>{user.banned ? "Unban User" : "Ban User"}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        disabled={busy}
        style={[styles.actionBtn, { backgroundColor: "#e74c3c" }]}
        onPress={deleteUser}
      >
        <Text style={styles.actionText}>Delete ID</Text>
      </TouchableOpacity>

      <Text style={styles.section}>Videos ({videos.length})</Text>

      {videos.length === 0 && <Text style={styles.empty}>No videos</Text>}

      {videos.map((v) => (
        <View key={v.id} style={styles.videoCard}>
          <Image
            source={{ uri: v.thumbnail || v.profile || PLACEHOLDER }}
            style={styles.thumb}
          />
          <Text style={styles.caption} numberOfLines={2}>
            {v.caption || "(no caption)"}
          </Text>
          <TouchableOpacity
            disabled={busy}
            style={styles.delBtn}
            onPress={() => deleteVideo(v)}
          >
            <Text style={styles.delText}>Delete</Text>
          </TouchableOpacity>
        </View>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 20 },
  center: { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" },
  avatar: { width: 120, height: 120, borderRadius: 60, alignSelf: "center", marginBottom: 12, backgroundColor: "#333" },
  name: { color: "#fff", fontSize: 24, fontWeight: "bold", textAlign: "center", marginBottom: 20 },
  row: { backgroundColor: "#111", padding: 14, borderRadius: 12, marginBottom: 8 },
  label: { color: "#888", fontSize: 12, marginBottom: 4 },
  value: { color: "#fff", fontSize: 16 },
  actionBtn: { padding: 15, borderRadius: 15, alignItems: "center", marginTop: 12 },
  actionText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  section: { color: "#fff", fontSize: 20, fontWeight: "bold", marginTop: 28, marginBottom: 10 },
  empty: { color: "#888", textAlign: "center", marginVertical: 20 },
  videoCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#111", padding: 10, borderRadius: 12, marginBottom: 8 },
  thumb: { width: 56, height: 80, borderRadius: 8, backgroundColor: "#333", marginRight: 12 },
  caption: { flex: 1, color: "#fff", fontSize: 14 },
  delBtn: { backgroundColor: "#e74c3c", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginLeft: 8 },
  delText: { color: "#fff", fontWeight: "bold" },
});
