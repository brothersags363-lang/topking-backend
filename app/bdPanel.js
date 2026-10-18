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

// ADMIN ONLY: yahan se kisi user ko BD banao / hatao
export default function BDPanel() {
  const router = useRouter();
  const isAdmin = useIsAdmin();

  const [bds, setBds] = useState([]);
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
      const res = await callApi("/admin/list-bds", {});
      setBds(res.bds || []);
    } catch (e) {
      Alert.alert("Error", e.message || "BD list load nahi hui");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const addBD = async () => {
    const name = username.trim();
    if (!name) {
      Alert.alert("Username daalo");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await callApi("/admin/add-bd", { username: name });
      setUsername("");
      Alert.alert("Done", "BD add ho gaya. Ab usko profile menu me BD dikhega.");
      load();
    } catch (e) {
      Alert.alert("Error", e.message || "BD add nahi hua");
    } finally {
      setBusy(false);
    }
  };

  const removeBD = (item) =>
    Alert.alert(
      "BD hatao?",
      `${item.username} ka BD access band ho jayega. Uski banayi agencies chalti rahengi.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await callApi("/admin/remove-bd", { uid: item.uid });
              load();
            } catch (e) {
              Alert.alert("Error", e.message || "Remove nahi hua");
            }
          },
        },
      ]
    );

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "red", fontSize: 22 }}>
          {isAdmin === null ? "Checking..." : "Access Denied"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BD Panel</Text>

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
          onPress={addBD}
        >
          <Text style={styles.addText}>+ Add BD</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#FFD700" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={bds}
          keyExtractor={(i) => i.uid}
          ListEmptyComponent={<Text style={styles.empty}>Abhi koi BD nahi hai</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Image source={{ uri: item.profileImg || PLACEHOLDER }} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.username}</Text>
                <Text style={styles.info}>Agencies : {item.agencyCount}</Text>
              </View>
              <TouchableOpacity style={styles.removeBtn} onPress={() => removeBD(item)}>
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
  container: { flex: 1, backgroundColor: "#111", paddingTop: 50, paddingHorizontal: 15 },
  center: { flex: 1, backgroundColor: "#111", justifyContent: "center", alignItems: "center" },
  title: { color: "#fff", fontSize: 28, fontWeight: "bold", marginBottom: 20 },
  addRow: { flexDirection: "row", marginBottom: 20 },
  input: {
    flex: 1,
    backgroundColor: "#222",
    color: "#fff",
    padding: 12,
    borderRadius: 10,
    marginRight: 10,
  },
  addBtn: {
    backgroundColor: "#FFD700",
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: "center",
  },
  addText: { color: "#000", fontWeight: "bold" },
  empty: { color: "#888", textAlign: "center", marginTop: 40 },
  card: {
    backgroundColor: "#1d1d1d",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 14, backgroundColor: "#333" },
  name: { color: "#fff", fontSize: 17, fontWeight: "bold" },
  info: { color: "#ccc", marginTop: 2 },
  removeBtn: { backgroundColor: "#e74c3c", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  removeText: { color: "#fff", fontWeight: "bold" },
});
