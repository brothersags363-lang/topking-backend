import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { collection, onSnapshot } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { db } from "./firebaseConfig";
import useIsAdmin from "./useIsAdmin";

const PLACEHOLDER = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

export default function ProfileDetails() {
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    // Saare users (app ke andar jitne bhi hain)
    return onSnapshot(collection(db, "users"), (snap) =>
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = s
      ? users.filter((u) => (u.username || "").toLowerCase().includes(s))
      : users;
    return [...list].sort((a, b) =>
      (a.username || "").localeCompare(b.username || "")
    );
  }, [users, search]);

  if (!isAdmin) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "red", fontSize: 22 }}>
          {isAdmin === null ? "Checking..." : "Access Denied"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Upar search bar */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color="#aaa" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search user name..."
          placeholderTextColor="#777"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={20} color="#aaa" />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.count}>Total users: {filtered.length}</Text>

      {/* Niche line by line users */}
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        ListEmptyComponent={<Text style={styles.empty}>No user found</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() =>
              router.push({ pathname: "/adminUserProfile", params: { userId: item.id } })
            }
          >
            <Image source={{ uri: item.profileImg || PLACEHOLDER }} style={styles.avatar} />
            <Text style={styles.name} numberOfLines={1}>
              {item.username || "No name"}
            </Text>
            {item.banned && <Text style={styles.banned}>BANNED</Text>}
            <Ionicons name="chevron-forward" size={20} color="#777" />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 15 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: "#fff", paddingVertical: 12, marginLeft: 8, fontSize: 16 },
  count: { color: "#888", marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: "#333" },
  name: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "600" },
  banned: { color: "red", fontWeight: "bold", marginRight: 8, fontSize: 12 },
  empty: { color: "#888", textAlign: "center", marginTop: 40 },
});
