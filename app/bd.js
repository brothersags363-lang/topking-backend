import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Image,
  Modal,
  Alert,
  BackHandler,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { callApi } from "../utils/api";

const PLACEHOLDER = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

// BD page: BD sirf apni banayi hui agencies dekh / bana / edit / block / delete kar sakta hai.
// Access server check karta hai (/bd/* routes) - BD nahi hai to "Access Denied".
export default function BDPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [agencies, setAgencies] = useState([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  // create / edit popup
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [agencyName, setAgencyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerUsername, setOwnerUsername] = useState("");
  const [logo, setLogo] = useState(""); // https url ya naya local file://

  // view popup
  const [viewing, setViewing] = useState(null);
  const [hosts, setHosts] = useState([]);
  const [hostsLoading, setHostsLoading] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (showForm) {
        setShowForm(false);
        return true;
      }
      if (viewing) {
        setViewing(null);
        return true;
      }
      router.back();
      return true;
    });
    return () => sub.remove();
  }, [router, showForm, viewing]);

  const load = useCallback(async () => {
    try {
      const res = await callApi("/bd/my-agencies", {});
      setAgencies(res.agencies || []);
      setDenied(false);
    } catch (e) {
      const msg = String(e?.message || "");
      if (/BD access|403|Forbidden/i.test(msg)) setDenied(true);
      else Alert.alert("Error", msg || "Agencies load nahi hui");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = agencies.filter((a) =>
    (a.agencyName || "").toLowerCase().includes(search.toLowerCase())
  );

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setLogo(result.assets[0].uri);
  };

  // Logo Cloudinary par upload (agency.js jaisa hi preset) -> https url
  const uploadLogoIfNeeded = async () => {
    if (!logo || !logo.startsWith("file://")) return logo;
    const formData = new FormData();
    formData.append("file", { uri: logo, type: "image/jpeg", name: "agency_logo.jpg" });
    formData.append("upload_preset", "topking_upload");
    const response = await fetch("https://api.cloudinary.com/v1_1/fzmrnrlz/image/upload", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok || !data.secure_url) throw new Error("Logo upload nahi ho paya");
    return data.secure_url;
  };

  const openCreate = () => {
    setEditing(null);
    setAgencyName("");
    setOwnerName("");
    setOwnerUsername("");
    setLogo("");
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setAgencyName(item.agencyName);
    setOwnerName(item.ownerName);
    setOwnerUsername(item.ownerUsername);
    setLogo(item.logo || "");
    setShowForm(true);
  };

  const save = async () => {
    if (busy) return;
    if (!agencyName.trim() || !ownerName.trim() || (!editing && !ownerUsername.trim())) {
      Alert.alert("Sab fields bharo");
      return;
    }
    setBusy(true);
    try {
      const logoUrl = await uploadLogoIfNeeded();
      if (editing) {
        await callApi("/bd/update-agency", {
          agencyId: editing.id,
          agencyName: agencyName.trim(),
          ownerName: ownerName.trim(),
          logo: logoUrl,
        });
        Alert.alert("Agency Updated");
      } else {
        await callApi("/bd/create-agency", {
          agencyName: agencyName.trim(),
          ownerName: ownerName.trim(),
          ownerUsername: ownerUsername.trim(),
          logo: logoUrl,
        });
        Alert.alert("Agency Created");
      }
      setShowForm(false);
      setEditing(null);
      load();
    } catch (e) {
      Alert.alert("Error", e.message || "Save nahi hua");
    } finally {
      setBusy(false);
    }
  };

  const toggleBlock = async (item) => {
    try {
      await callApi("/bd/block-agency", {
        agencyId: item.id,
        block: item.status !== "blocked",
      });
      load();
    } catch (e) {
      Alert.alert("Error", e.message || "Request failed");
    }
  };

  const remove = (item) =>
    Alert.alert(
      "Agency delete karni hai?",
      "Agency, uska owner access aur saare hosts agency se hat jayenge. Ye wapas nahi hoga.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await callApi("/bd/delete-agency", { agencyId: item.id });
              load();
            } catch (e) {
              Alert.alert("Error", e.message || "Delete nahi hui");
            }
          },
        },
      ]
    );

  const openView = async (item) => {
    setViewing(item);
    setHosts([]);
    setHostsLoading(true);
    try {
      const res = await callApi("/bd/agency-hosts", { agencyId: item.id });
      setHosts(res.hosts || []);
    } catch (e) {
      Alert.alert("Error", e.message || "Hosts load nahi hue");
    } finally {
      setHostsLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  if (denied) {
    return (
      <View style={styles.center}>
        <Text style={styles.denied}>Access Denied</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BD Panel</Text>

      <TextInput
        placeholder="Search Agency"
        placeholderTextColor="#777"
        value={search}
        onChangeText={setSearch}
        style={styles.search}
      />

      <TouchableOpacity style={styles.createBtn} onPress={openCreate}>
        <Text style={styles.createText}>+ Create Agency</Text>
      </TouchableOpacity>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        ListEmptyComponent={<Text style={styles.empty}>Abhi koi agency nahi hai</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Image source={{ uri: item.logo || PLACEHOLDER }} style={styles.logo} />

            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.agencyName}</Text>
              <Text style={styles.info}>Owner : {item.ownerName}</Text>
              <Text style={styles.info}>Members : {item.totalMembers}</Text>
              <Text style={styles.info}>Stars : {item.totalStars} ⭐</Text>
              <Text style={{ color: item.status === "blocked" ? "red" : "#00ff66", marginTop: 4 }}>
                {item.status === "blocked" ? "🔴 Blocked" : "🟢 Active"}
              </Text>
            </View>

            <View style={styles.actionBox}>
              <TouchableOpacity style={styles.viewBtn} onPress={() => openView(item)}>
                <Text style={styles.btnText}>View</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                <Text style={styles.btnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.blockBtn} onPress={() => toggleBlock(item)}>
                <Text style={styles.btnText}>{item.status === "blocked" ? "Unblock" : "Block"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => remove(item)}>
                <Text style={styles.btnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* CREATE / EDIT */}
      <Modal visible={showForm} transparent animationType="fade" onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalBg}>
          <View style={styles.popup}>
            <Text style={styles.popupTitle}>{editing ? "Edit Agency" : "Create Agency"}</Text>

            <TextInput
              placeholder="Agency Name"
              placeholderTextColor="#999"
              value={agencyName}
              onChangeText={setAgencyName}
              style={styles.input}
            />
            <TextInput
              placeholder="Owner Name"
              placeholderTextColor="#999"
              value={ownerName}
              onChangeText={setOwnerName}
              style={styles.input}
            />
            {!editing && (
              <TextInput
                placeholder="Owner Username"
                placeholderTextColor="#999"
                value={ownerUsername}
                onChangeText={setOwnerUsername}
                autoCapitalize="none"
                style={styles.input}
              />
            )}

            <TouchableOpacity style={styles.selectLogoBtn} onPress={pickLogo}>
              <Text style={styles.btnText}>Select Logo</Text>
            </TouchableOpacity>

            {logo !== "" && <Image source={{ uri: logo }} style={styles.logoPreview} />}

            <TouchableOpacity style={[styles.saveBtn, busy && { opacity: 0.6 }]} disabled={busy} onPress={save}>
              <Text style={styles.btnText}>
                {busy ? "Please wait..." : editing ? "Update Agency" : "Save Agency"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setShowForm(false);
                setEditing(null);
              }}
            >
              <Text style={styles.btnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* VIEW */}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.popup, { maxHeight: "85%" }]}>
            {viewing && (
              <>
                <Image source={{ uri: viewing.logo || PLACEHOLDER }} style={styles.logoPreview} />
                <Text style={[styles.popupTitle, { textAlign: "center" }]}>{viewing.agencyName}</Text>
                <Text style={styles.info}>Owner : {viewing.ownerName} (@{viewing.ownerUsername})</Text>
                <Text style={styles.info}>Members : {viewing.totalMembers}</Text>
                <Text style={styles.info}>Stars : {viewing.totalStars} ⭐</Text>

                <Text style={styles.hostsTitle}>Hosts</Text>
                {hostsLoading ? (
                  <ActivityIndicator color="#FFD700" />
                ) : hosts.length === 0 ? (
                  <Text style={styles.info}>Abhi koi host nahi hai</Text>
                ) : (
                  <FlatList
                    data={hosts}
                    keyExtractor={(h) => h.id}
                    renderItem={({ item }) => (
                      <View style={styles.hostRow}>
                        <Image source={{ uri: item.profileImg || PLACEHOLDER }} style={styles.hostImg} />
                        <Text style={styles.name}>{item.username}</Text>
                      </View>
                    )}
                  />
                )}
              </>
            )}

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setViewing(null)}>
              <Text style={styles.btnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", paddingTop: 50, paddingHorizontal: 15 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#111" },
  denied: { color: "red", fontSize: 22, fontWeight: "bold" },
  title: { color: "#fff", fontSize: 28, fontWeight: "bold", marginBottom: 20 },
  search: { backgroundColor: "#222", color: "#fff", padding: 12, borderRadius: 10, marginBottom: 15 },
  createBtn: { backgroundColor: "#FFD700", padding: 14, borderRadius: 10, alignItems: "center", marginBottom: 15 },
  createText: { fontWeight: "bold", fontSize: 17, color: "#000" },
  empty: { color: "#888", textAlign: "center", marginTop: 40 },
  card: {
    backgroundColor: "#1d1d1d",
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  logo: { width: 60, height: 60, borderRadius: 30, marginRight: 15, backgroundColor: "#333" },
  name: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  info: { color: "#ccc", marginTop: 2 },
  actionBox: { justifyContent: "space-between", height: 150 },
  viewBtn: { backgroundColor: "#0099ff", paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  editBtn: { backgroundColor: "#ff9800", paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, marginTop: 5 },
  blockBtn: { backgroundColor: "#ff4444", paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, marginTop: 5 },
  deleteBtn: { backgroundColor: "#990000", paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, marginTop: 5 },
  btnText: { color: "#fff", fontWeight: "bold" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  popup: { width: "90%", backgroundColor: "#222", borderRadius: 20, padding: 20 },
  popupTitle: { fontSize: 22, fontWeight: "bold", color: "#fff", marginBottom: 15 },
  input: { backgroundColor: "#333", color: "#fff", padding: 12, borderRadius: 10, marginBottom: 10 },
  selectLogoBtn: { backgroundColor: "#bd2d81", padding: 14, borderRadius: 10, alignItems: "center", marginVertical: 10 },
  logoPreview: { width: 100, height: 100, borderRadius: 50, alignSelf: "center", marginVertical: 10, backgroundColor: "#333" },
  saveBtn: { backgroundColor: "#00aa55", padding: 14, borderRadius: 10, alignItems: "center", marginTop: 10 },
  cancelBtn: { backgroundColor: "#ff3333", padding: 14, borderRadius: 10, alignItems: "center", marginTop: 10 },
  hostsTitle: { color: "#FFD700", fontSize: 18, fontWeight: "bold", marginTop: 16, marginBottom: 8 },
  hostRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  hostImg: { width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: "#333" },
});
