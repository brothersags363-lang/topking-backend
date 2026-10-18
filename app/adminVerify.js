import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Keyboard,
} from "react-native";
import { collection, query, where, limit, getDocs } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { db } from "./firebaseConfig";
import useIsAdmin from "./useIsAdmin";
import { callApi } from "../utils/api";

const PLACEHOLDER = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
const COLORS = { white: "#ffffff", yellow: "#FFD700" };

export default function AdminVerify() {
  const isAdmin = useIsAdmin();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const runSearch = async () => {
    const t = search.trim().replace(/^@/, "");
    if (!t) return;
    Keyboard.dismiss();
    setSearching(true);
    setSearched(false);
    try {
      const found = new Map();
      for (const v of Array.from(new Set([t, t.toLowerCase()]))) {
        const q = query(
          collection(db, "users"),
          where("username", ">=", v),
          where("username", "<=", v + "\uf8ff"),
          limit(15)
        );
        const snap = await getDocs(q);
        snap.docs.forEach((d) => found.set(d.id, { id: d.id, ...d.data() }));
      }
      setResults(Array.from(found.values()));
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "Search nahi ho paya, dobara try karo");
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  const apply = (user, verified, color) => {
    const msg = verified
      ? `${user.username} ko ${color.toUpperCase()} tick dena hai?`
      : `${user.username} ka tick hata dena hai?`;
    Alert.alert("Verified", msg, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        onPress: async () => {
          if (busyId) return;
          setBusyId(user.id);
          try {
            await callApi("/admin/set-verified", { uid: user.id, verified, color });
            setResults((list) =>
              list.map((u) =>
                u.id === user.id
                  ? { ...u, verified, verifiedColor: verified ? color : undefined }
                  : u
              )
            );
          } catch (e) {
            Alert.alert("Error", e.message || "Request failed");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

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
      <Text style={styles.title}>Verified Tick</Text>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color="#aaa" />
        <TextInput
          style={styles.searchInput}
          placeholder="User ka username likho..."
          placeholderTextColor="#777"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={runSearch}
        />
        <TouchableOpacity onPress={runSearch}>
          <Text style={{ color: "#FFD700", fontWeight: "bold" }}>Search</Text>
        </TouchableOpacity>
      </View>

      {searching ? (
        <ActivityIndicator color="#FFD700" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            searched ? <Text style={styles.empty}>Koi user nahi mila</Text> : null
          }
          renderItem={({ item }) => {
            const cur = item.verified ? item.verifiedColor || "white" : null;
            const busy = busyId === item.id;
            return (
              <View style={styles.card}>
                <View style={styles.top}>
                  <Image source={{ uri: item.profileImg || PLACEHOLDER }} style={styles.avatar} />
                  <Text style={styles.name} numberOfLines={1}>
                    {item.username || "No name"}
                  </Text>
                  {cur && (
                    <Ionicons name="checkmark-circle" size={22} color={COLORS[cur] || "#fff"} />
                  )}
                </View>

                <View style={styles.btnRow}>
                  {Object.keys(COLORS).map((k) => (
                    <TouchableOpacity
                      key={k}
                      disabled={busy}
                      style={[styles.btn, cur === k && { borderColor: COLORS[k], borderWidth: 2 }]}
                      onPress={() => apply(item, true, k)}
                    >
                      <Ionicons name="checkmark-circle" size={20} color={COLORS[k]} />
                      <Text style={styles.btnText}>{k === "white" ? "White" : "Yellow"}</Text>
                    </TouchableOpacity>
                  ))}
                  {cur && (
                    <TouchableOpacity
                      disabled={busy}
                      style={[styles.btn, { backgroundColor: "#3a1a1a" }]}
                      onPress={() => apply(item, false, "white")}
                    >
                      <Text style={[styles.btnText, { color: "#ff6b6b" }]}>Remove</Text>
                    </TouchableOpacity>
                  )}
                  {busy && <ActivityIndicator color="#FFD700" style={{ marginLeft: 8 }} />}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 15, paddingTop: 40 },
  title: { color: "#FFD700", fontSize: 26, fontWeight: "bold", textAlign: "center", marginBottom: 15 },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a1a", borderRadius: 12, paddingHorizontal: 12, marginBottom: 12 },
  searchInput: { flex: 1, color: "#fff", paddingVertical: 12, marginLeft: 8, fontSize: 16 },
  card: { backgroundColor: "#111", borderRadius: 14, padding: 12, marginBottom: 10 },
  top: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: "#333" },
  name: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "600" },
  btnRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  btn: { flexDirection: "row", alignItems: "center", backgroundColor: "#1d1d1d", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, borderWidth: 1, borderColor: "#2a2a2a" },
  btnText: { color: "#fff", fontWeight: "600", marginLeft: 6 },
  empty: { color: "#888", textAlign: "center", marginTop: 40 },
});
