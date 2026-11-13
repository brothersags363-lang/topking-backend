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

// Auto rule (camera.tsx jaisa hi): verified + agency me add
const isVerified = (u) =>
  u.verified === true ||
  u.faceVerified === true ||
  u.faceStatus === "submitted" ||
  u.faceStatus === "approved";
const inAgency = (u) =>
  (typeof u.agencyId === "string" && u.agencyId.length > 0) || u.agencyApproved === true;

// Is user ki final Live state: { on, label, color }
const liveState = (u) => {
  if (u.liveAccess === "granted") return { on: true, label: "LIVE: ON (Admin ne diya)", color: "#2ecc71" };
  if (u.liveAccess === "revoked") return { on: false, label: "LIVE: OFF (Admin ne roka)", color: "#e74c3c" };
  const on = isVerified(u) && inAgency(u);
  return {
    on,
    label: on ? "LIVE: ON (Auto)" : "LIVE: OFF (Auto)",
    color: on ? "#2ecc71" : "#888",
  };
};

export default function AdminLiveAccess() {
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

  // mode: "grant" | "revoke" | "clear"
  const apply = (user, mode) => {
    const name = user.username || "user";
    const msg =
      mode === "grant"
        ? `${name} ko Live dena hai?\n(Verify / agency / mobile rule ke bina bhi Live kar payega)`
        : mode === "revoke"
        ? `${name} se Live chheen lena hai?\n(Verified + agency hone par bhi Live nahi kar payega)`
        : `${name} ko wapas Auto rule par daalna hai?\n(Verified + agency wala normal rule)`;

    Alert.alert("Live Access", msg, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        onPress: async () => {
          if (busyId) return;
          setBusyId(user.id);
          try {
            const res = await callApi("/admin/set-live-access", { uid: user.id, mode });
            const next = res && res.liveAccess ? res.liveAccess : undefined;
            setResults((list) =>
              list.map((u) => (u.id === user.id ? { ...u, liveAccess: next } : u))
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
      <Text style={styles.title}>Live Access</Text>

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
            const st = liveState(item);
            const busy = busyId === item.id;
            const mode = item.liveAccess; // "granted" | "revoked" | undefined
            return (
              <View style={styles.card}>
                <View style={styles.top}>
                  <Image source={{ uri: item.profileImg || PLACEHOLDER }} style={styles.avatar} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.username || "No name"}
                    </Text>
                    <Text style={[styles.state, { color: st.color }]}>{st.label}</Text>
                    <Text style={styles.meta}>
                      Verified: {isVerified(item) ? "Haan" : "Nahi"}  |  Agency:{" "}
                      {inAgency(item) ? "Haan" : "Nahi"}
                    </Text>
                  </View>
                </View>

                <View style={styles.btnRow}>
                  <TouchableOpacity
                    disabled={busy || mode === "granted"}
                    style={[styles.btn, { backgroundColor: "#12301f" }, mode === "granted" && styles.btnActive]}
                    onPress={() => apply(item, "grant")}
                  >
                    <Ionicons name="radio" size={16} color="#2ecc71" />
                    <Text style={[styles.btnText, { color: "#2ecc71" }]}>Give Live</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={busy || mode === "revoked"}
                    style={[styles.btn, { backgroundColor: "#3a1a1a" }, mode === "revoked" && styles.btnActive]}
                    onPress={() => apply(item, "revoke")}
                  >
                    <Ionicons name="close-circle" size={16} color="#ff6b6b" />
                    <Text style={[styles.btnText, { color: "#ff6b6b" }]}>Remove Live</Text>
                  </TouchableOpacity>

                  {!!mode && (
                    <TouchableOpacity
                      disabled={busy}
                      style={styles.btn}
                      onPress={() => apply(item, "clear")}
                    >
                      <Text style={styles.btnText}>Auto</Text>
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
  name: { color: "#fff", fontSize: 16, fontWeight: "600" },
  state: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  meta: { color: "#888", fontSize: 11, marginTop: 2 },
  btnRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 12 },
  btn: { flexDirection: "row", alignItems: "center", backgroundColor: "#1d1d1d", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginRight: 8, marginBottom: 4, borderWidth: 1, borderColor: "#2a2a2a" },
  btnActive: { opacity: 0.45 },
  btnText: { color: "#fff", fontWeight: "600", marginLeft: 6 },
  empty: { color: "#888", textAlign: "center", marginTop: 40 },
});
