import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebaseConfig";
import useIsAdmin from "./useIsAdmin";

const PLACEHOLDER = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

export default function ReportsAdmin() {
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const [tab, setTab] = useState("videos"); // "videos" | "users"
  const [videos, setVideos] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const q = query(
      collection(db, "all_videos"),
      where("reviewRequired", "==", true)
    );
    return onSnapshot(q, (snap) =>
      setVideos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "users"),
      where("reviewRequired", "==", true)
    );
    return onSnapshot(q, (snap) =>
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, []);

  const videoRef = (id) => doc(db, "all_videos", id);
  const userRef = (id) => doc(db, "users", id);

  const approveVideo = (id) =>
    updateDoc(videoRef(id), { reviewRequired: false, reportCount: 0 });
  const hideVideo = (id) =>
    updateDoc(videoRef(id), { hidden: true, reviewRequired: false, reportCount: 0 });
  const resetReports = (id) =>
    updateDoc(videoRef(id), { reviewRequired: false, reportCount: 0, hidden: false });
  const deleteVideo = (id) => deleteDoc(videoRef(id));
  const banUser = (id) => updateDoc(userRef(id), { banned: true });
  const unbanUser = (id) =>
    updateDoc(userRef(id), { banned: false, reviewRequired: false, reportCount: 0 });

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "red", fontSize: 22 }}>
          {isAdmin === null ? "Checking..." : "Access Denied"}
        </Text>
      </View>
    );
  }

  const Btn = ({ style, label, onPress }) => (
    <TouchableOpacity style={[styles.btn, style]} onPress={onPress}>
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reports</Text>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === "videos" && styles.tabActive]}
          onPress={() => setTab("videos")}
        >
          <Text style={styles.tabText}>Videos ({videos.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "users" && styles.tabActive]}
          onPress={() => setTab("users")}
        >
          <Text style={styles.tabText}>Users ({users.length})</Text>
        </TouchableOpacity>
      </View>

      {tab === "videos" ? (
        <FlatList
          data={videos}
          keyExtractor={(i) => i.id}
          ListEmptyComponent={<Text style={styles.empty}>No reported videos</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Image source={{ uri: item.thumbnail || PLACEHOLDER }} style={styles.image} />
              <Text style={styles.caption}>{item.caption}</Text>
              <Text style={styles.reportText}>Reports : {item.reportCount || 0}</Text>
              <Btn style={{ backgroundColor: "green" }} label="Approve" onPress={() => approveVideo(item.id)} />
              <Btn style={{ backgroundColor: "red" }} label="Hide Video" onPress={() => hideVideo(item.id)} />
              <Btn style={{ backgroundColor: "#3498db" }} label="Reset Reports" onPress={() => resetReports(item.id)} />
              <Btn style={{ backgroundColor: "#ff004f" }} label="Delete Video" onPress={() => deleteVideo(item.id)} />
            </View>
          )}
        />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(i) => i.id}
          ListEmptyComponent={<Text style={styles.empty}>No reported users</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Image source={{ uri: item.profileImg || PLACEHOLDER }} style={styles.image} />
              <Text style={styles.caption}>{item.username}</Text>
              <Text style={styles.reportText}>Reports : {item.reportCount || 0}</Text>
              <Btn
                style={{ backgroundColor: "#8e44ad" }}
                label="View Profile"
                onPress={() =>
                  router.push({ pathname: "/adminUserProfile", params: { userId: item.id } })
                }
              />
              <Btn style={{ backgroundColor: "red" }} label="Ban User" onPress={() => banUser(item.id)} />
              <Btn style={{ backgroundColor: "green" }} label="Unban User" onPress={() => unbanUser(item.id)} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 15 },
  center: { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" },
  title: { color: "#fff", fontSize: 25, fontWeight: "bold", textAlign: "center", marginBottom: 15 },
  tabs: { flexDirection: "row", marginBottom: 15 },
  tab: { flex: 1, padding: 12, backgroundColor: "#222", alignItems: "center", borderRadius: 10, marginHorizontal: 4 },
  tabActive: { backgroundColor: "#e74c3c" },
  tabText: { color: "#fff", fontWeight: "bold" },
  card: { backgroundColor: "#111", padding: 15, borderRadius: 15, marginBottom: 20 },
  image: { width: "100%", height: 200, borderRadius: 15, marginBottom: 10 },
  caption: { color: "#fff", fontSize: 16, marginBottom: 10 },
  reportText: { color: "red", fontSize: 16, marginBottom: 15 },
  btn: { padding: 15, borderRadius: 12, marginBottom: 10 },
  btnText: { color: "#fff", fontWeight: "bold", textAlign: "center" },
  empty: { color: "#888", textAlign: "center", marginTop: 40 },
});
