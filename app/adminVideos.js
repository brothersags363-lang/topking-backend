import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { db } from "./firebaseConfig";
import useIsAdmin from "./useIsAdmin";
import { callApi } from "./api";

const PLACEHOLDER = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

export default function AdminVideos() {
  const isAdmin = useIsAdmin();
  const [videos, setVideos] = useState([]);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, "all_videos"), orderBy("createdAt", "desc"), limit(100));
    return onSnapshot(q, (snap) =>
      setVideos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return videos;
    return videos.filter(
      (v) =>
        (v.username || "").toLowerCase().includes(s) ||
        (v.userName || "").toLowerCase().includes(s) ||
        (v.caption || "").toLowerCase().includes(s)
    );
  }, [videos, search]);

  const remove = (v) =>
    Alert.alert("Delete video?", "Ye video hamesha ke liye delete ho jayega.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusyId(v.id);
          try {
            await callApi("/admin/delete-video", { videoId: v.id });
          } catch (e) {
            Alert.alert("Error", e.message || "Delete failed");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);

  if (!isAdmin) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={{ color: "red", fontSize: 22 }}>
          {isAdmin === null ? "Checking..." : "Access Denied"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color="#aaa" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search username / caption..."
          placeholderTextColor="#777"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      <Text style={styles.count}>Latest videos: {filtered.length}</Text>

      <FlatList
        data={filtered}
        keyExtractor={(v) => v.id}
        ListEmptyComponent={<Text style={styles.empty}>No videos</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Image
              source={{ uri: item.thumbnail || item.profile || PLACEHOLDER }}
              style={styles.thumb}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.user} numberOfLines={1}>
                {item.username || item.userName || item.userId}
              </Text>
              <Text style={styles.caption} numberOfLines={2}>
                {item.caption || "(no caption)"}
              </Text>
            </View>
            <TouchableOpacity
              disabled={busyId === item.id}
              style={styles.delBtn}
              onPress={() => remove(item)}
            >
              <Text style={styles.delText}>{busyId === item.id ? "..." : "Delete"}</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 15 },
  center: { justifyContent: "center", alignItems: "center" },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a1a", borderRadius: 12, paddingHorizontal: 12, marginBottom: 10 },
  searchInput: { flex: 1, color: "#fff", paddingVertical: 12, marginLeft: 8, fontSize: 16 },
  count: { color: "#888", marginBottom: 10 },
  empty: { color: "#888", textAlign: "center", marginTop: 40 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#111", padding: 10, borderRadius: 12, marginBottom: 8 },
  thumb: { width: 56, height: 80, borderRadius: 8, backgroundColor: "#333", marginRight: 12 },
  user: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  caption: { color: "#aaa", fontSize: 13, marginTop: 2 },
  delBtn: { backgroundColor: "#e74c3c", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginLeft: 8 },
  delText: { color: "#fff", fontWeight: "bold" },
});
