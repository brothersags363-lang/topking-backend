import React, { useEffect, useState } from "react";
import { View, Text, Image, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebaseConfig";
import useIsAdmin from "./useIsAdmin";

const PLACEHOLDER = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

export default function AdminUserProfile() {
  const { userId } = useLocalSearchParams();
  const isAdmin = useIsAdmin();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    return onSnapshot(doc(db, "users", String(userId)), (snap) => {
      setUser(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });
  }, [userId]);

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

  // Yaha jo bhi fields tumhare users doc me hain, unko add/remove kar sakte ho
  const fields = [
    ["Username", user.username],
    ["Email", user.email],
    ["Phone", user.phone],
    ["User ID", user.id],
    ["Reports", user.reportCount || 0],
    ["Banned", user.banned ? "Yes" : "No"],
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
});
