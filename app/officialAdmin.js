import React, { useCallback, useEffect, useState } from "react";
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
  BackHandler,
} from "react-native";
import { useRouter } from "expo-router";
import { callApi } from "../utils/api";
import useIsAdmin from "./useIsAdmin";

const PLACEHOLDER = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

// ADMIN ONLY: yahan se kisi bhi user ko Official banao / hatao
export default function OfficialAdmin() {
  const router = useRouter();
  const isAdmin = useIsAdmin();

  const [officials, setOfficials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      router.back();
      return true;
    });
    return () => sub.remove();
  }, [router]);

  const load = useCallback(async () => {
    try {
      const res = await callApi("/admin/list-officials", {});
      setOfficials(res.officials || []);
    } catch (e) {
      Alert.alert("Error", e.message || "Official list load nahi hui");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const addOfficial = async () => {
    const name = username.trim().replace(/^@/, "");
    if (!name) {
      Alert.alert("Username daalo");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await callApi("/admin/add-official", { username: name });
      setUsername("");
      Alert.alert("Done", "Official ban gaya. Usko Settings me Official option dikhega.");
      load();
    } catch (e) {
      Alert.alert("Error", e.message || "Official add nahi hua");
    } finally {
      setBusy(false);
    }
  };

  const removeOfficial = (item) =>
    Alert.alert("Official hatao?", `${item.username} ka Official access band ho jayega.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await callApi("/admin/remove-official", { uid: item.uid });
            load();
          } catch (e) {
            Alert.alert("Error", e.message || "Remove nahi hua");
          }
        },
      },
    ]);

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "red", fontSize: 20 }}>
          {isAdmin === null ? "Checking..." : "Access Denied"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Official</Text>
      <Text style={styles.hint}>
        Official BD add kar sakta hai, agency de sakta hai, ID ban kar sakta hai, aur live entry /
        live start band kar sakta hai.
      </Text>

      <View style={styles.addRow}>
        <TextInput
          placeholder="User ka username"
          placeholderTextColor="#777"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          style={styles.input}
        />
        <TouchableOpacity
          style={[styles.addBtn, busy && { opacity: 0.6 }]}
          disabled={busy}
          onPress={addOfficial}
        >
          <Text style={styles.addText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#FFD700" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={officials}
          keyExtractor={(i) => i.uid}
          ListEmptyComponent={<Text style={styles.empty}>Abhi koi Official nahi hai</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Image source={{ uri: item.profileImg || PLACEHOLDER }} style={styles.avatar} />
              <Text style={styles.name} numberOfLines={1}>
                {item.username}
              </Text>
              <TouchableOpacity style={styles.removeBtn} onPress={() => removeOfficial(item)}>
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", paddingTop: 50, paddingHorizontal: 14 },
  center: { flex: 1, backgroundColor: "#111", justifyContent: "center", alignItems: "center" },
  title: { color: "#fff", fontSize: 22, fontWeight: "bold", marginBottom: 6 },
  hint: { color: "#999", fontSize: 12, marginBottom: 14 },
  addRow: { flexDirection: "row", marginBottom: 14 },
  input: {
    flex: 1,
    backgroundColor: "#222",
    color: "#fff",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
    fontSize: 14,
  },
  addBtn: { backgroundColor: "#FFD700", paddingHorizontal: 14, borderRadius: 8, justifyContent: "center" },
  addText: { color: "#000", fontWeight: "bold", fontSize: 13 },
  empty: { color: "#888", textAlign: "center", marginTop: 40 },
  card: {
    backgroundColor: "#1d1d1d",
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: { width: 38, height: 38, borderRadius: 19, marginRight: 10, backgroundColor: "#333" },
  name: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "bold" },
  removeBtn: { backgroundColor: "#e74c3c", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  removeText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
});
