import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

import useIsAdmin from "./useIsAdmin";
import { callApi } from "../utils/api";
import { uploadImage } from "../utils/uploadImage";

const PLACEHOLDER = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
const METHODS = ["UPI", "Bank", "PhonePe", "GPay", "Paytm"];

// Admin: user ko jo payment ki uska screenshot + details bhejo.
// User ko Messages me "Payments" row + push notification milta hai.
export default function AdminPayments() {
  const isAdmin = useIsAdmin();

  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState(null);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("UPI");
  const [utr, setUtr] = useState("");
  const [note, setNote] = useState("");
  const [shot, setShot] = useState(null); // local uri
  const [busy, setBusy] = useState(false);

  const runSearch = async () => {
    const t = search.trim().replace(/^@/, "");
    if (!t) return;
    Keyboard.dismiss();
    setSearching(true);
    setSearched(false);
    try {
      const r = await callApi("/admin/search-users", { q: t });
      setResults(Array.isArray(r.users) ? r.users : []);
    } catch (e) {
      Alert.alert("Error", e.message || "Search nahi ho paya");
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  const pickShot = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission", "Gallery ki permission do");
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (!r.canceled && r.assets && r.assets[0]) setShot(r.assets[0].uri);
    } catch (e) {
      Alert.alert("Error", "Photo nahi chuni ja saki");
    }
  };

  const reset = () => {
    setSelected(null);
    setSearch("");
    setResults([]);
    setSearched(false);
    setAmount("");
    setUtr("");
    setNote("");
    setShot(null);
    setMethod("UPI");
  };

  const submit = () => {
    if (busy) return;
    const amt = Number(amount);
    if (!selected) return Alert.alert("User", "Pehle user chuno");
    if (!amt || amt <= 0) return Alert.alert("Amount", "Sahi amount likho");
    if (!shot) return Alert.alert("Screenshot", "Payment ka screenshot lagao");

    Alert.alert(
      "Confirm",
      `${selected.name || selected.username} ko ₹${amt} ki payment ka screenshot bhejna hai?\n\nUser ko notification jayega.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          onPress: async () => {
            setBusy(true);
            try {
              const imageUrl = await uploadImage(shot, "payment");
              await callApi("/admin/send-payment-proof", {
                uid: selected.uid,
                amount: amt,
                method,
                utr: utr.trim(),
                note: note.trim(),
                imageUrl,
              });
              Alert.alert("Done ✅", "Payment details user ko bhej di gayi");
              reset();
            } catch (e) {
              Alert.alert("Error", e.message || "Nahi bhej paye");
            }
            setBusy(false);
          },
        },
      ]
    );
  };

  if (!isAdmin) {
    return (
      <View style={s.center}>
        <Text style={{ color: "red", fontSize: 20 }}>
          {isAdmin === null ? "Checking..." : "Access Denied"}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#000" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Payment Proof Bhejo</Text>
        <Text style={s.sub}>Jisko payment ki, uska screenshot yahan se submit karo</Text>

        {/* 1. USER */}
        <Text style={s.label}>1. User</Text>
        {selected ? (
          <View style={s.userCard}>
            <Image source={{ uri: selected.profileImg || PLACEHOLDER }} style={s.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={s.uName} numberOfLines={1}>{selected.name || selected.username}</Text>
              <Text style={s.uSub} numberOfLines={1}>@{selected.username}</Text>
            </View>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Ionicons name="close-circle" size={24} color="#ff3b30" />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={s.searchRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="Username likho"
                placeholderTextColor="#777"
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                onSubmitEditing={runSearch}
                returnKeyType="search"
              />
              <TouchableOpacity style={s.searchBtn} onPress={runSearch}>
                {searching ? <ActivityIndicator color="#000" /> : <Ionicons name="search" size={20} color="#000" />}
              </TouchableOpacity>
            </View>
            {searched && results.length === 0 && <Text style={s.empty}>Koi user nahi mila</Text>}
            {results.map((u) => (
              <TouchableOpacity key={u.uid} style={s.userCard} onPress={() => setSelected(u)}>
                <Image source={{ uri: u.profileImg || PLACEHOLDER }} style={s.avatar} />
                <View style={{ flex: 1 }}>
                  <Text style={s.uName} numberOfLines={1}>{u.name || u.username}</Text>
                  <Text style={s.uSub} numberOfLines={1}>@{u.username}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#888" />
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* 2. AMOUNT */}
        <Text style={s.label}>2. Amount (₹)</Text>
        <TextInput
          style={s.input}
          placeholder="Jaise 500"
          placeholderTextColor="#777"
          keyboardType="numeric"
          value={amount}
          onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
        />

        <Text style={s.label}>3. Kaise bheja</Text>
        <View style={s.chips}>
          {METHODS.map((m) => (
            <TouchableOpacity key={m} style={[s.chip, method === m && s.chipOn]} onPress={() => setMethod(m)}>
              <Text style={[s.chipText, method === m && { color: "#000" }]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={[s.input, { marginTop: 10 }]}
          placeholder="UTR / Transaction ID (optional)"
          placeholderTextColor="#777"
          value={utr}
          onChangeText={setUtr}
          autoCapitalize="characters"
        />
        <TextInput
          style={[s.input, { marginTop: 10, minHeight: 70, textAlignVertical: "top" }]}
          placeholder="Message / note (optional)"
          placeholderTextColor="#777"
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={300}
        />

        {/* 4. SCREENSHOT */}
        <Text style={s.label}>4. Payment Screenshot</Text>
        <TouchableOpacity style={s.shotBox} onPress={pickShot} activeOpacity={0.8}>
          {shot ? (
            <Image source={{ uri: shot }} style={s.shotImg} resizeMode="contain" />
          ) : (
            <View style={{ alignItems: "center" }}>
              <Ionicons name="image" size={38} color="#16C784" />
              <Text style={{ color: "#aaa", marginTop: 6 }}>Screenshot chuno</Text>
            </View>
          )}
        </TouchableOpacity>
        {shot && (
          <TouchableOpacity onPress={pickShot} style={{ alignSelf: "center", marginTop: 6 }}>
            <Text style={{ color: "#16C784", fontWeight: "bold" }}>Badlo</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[s.submit, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy} activeOpacity={0.85}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={s.submitText}>Submit & Notify User</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", paddingHorizontal: 14, paddingTop: 12 },
  center: { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: "bold", textAlign: "center" },
  sub: { color: "#888", fontSize: 12, textAlign: "center", marginTop: 4, marginBottom: 6 },
  label: { color: "#FFD700", fontWeight: "bold", marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: "#15151a",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#26262d",
  },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchBtn: { backgroundColor: "#FFD700", width: 44, height: 44, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  empty: { color: "#888", marginTop: 10, textAlign: "center" },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#15151a",
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    gap: 10,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#222" },
  uName: { color: "#fff", fontWeight: "bold" },
  uSub: { color: "#888", fontSize: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: "#15151a", borderWidth: 1, borderColor: "#26262d" },
  chipOn: { backgroundColor: "#16C784", borderColor: "#16C784" },
  chipText: { color: "#fff", fontWeight: "600" },
  shotBox: {
    height: 260,
    backgroundColor: "#15151a",
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#16C784",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  shotImg: { width: "100%", height: "100%" },
  submit: {
    marginTop: 22,
    backgroundColor: "#16C784",
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  submitText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
