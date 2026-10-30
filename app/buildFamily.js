import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator,
  ScrollView, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  addDoc, collection, doc, getDoc, getDocs, query, where, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { auth, db } from "./firebaseConfig";
import { Y, REVIEW_HOURS, canCreateFamily, uploadFamilyLogo } from "../utils/familyUtils";

export default function BuildFamily() {
  const router = useRouter();
  const insets = useSafeAreaInsets(); // navigation bar ke upar rakhne ke liye
  const [logo, setLogo] = useState("");
  const [logoB64, setLogoB64] = useState("");
  const [name, setName] = useState("");
  const [slogan, setSlogan] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const pickLogo = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true });
    if (!r.canceled) { setLogo(r.assets[0].uri); setLogoB64(r.assets[0].base64 || ""); }
  };

  const submit = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return Alert.alert("Login", "Pehle login karo");
    const n = name.trim(), sl = slogan.trim(), ct = contact.trim();
    if (!logo) return Alert.alert("Logo chahiye", "Family ka logo select karo");
    if (n.length < 3 || n.length > 24) return Alert.alert("Family Name", "Naam 3 se 24 akshar ka hona chahiye");
    if (!sl) return Alert.alert("Slogan", "Family ka slogan likho");
    if (!ct) return Alert.alert("Contact", "WhatsApp number ya email likho");

    setBusy(true);
    try {
      const u = (await getDoc(doc(db, "users", uid))).data() || {};
      if (!canCreateFamily(u)) throw new Error("Family sirf verified creators bana sakte hain.");
      if (u.familyId) throw new Error("Aap pehle se kisi family me ho.");

      const mine = await getDocs(query(collection(db, "families"), where("leaderId", "==", uid)));
      if (mine.docs.some((d) => ["pending", "approved"].includes(d.data().status)))
        throw new Error("Aapki ek family pehle se pending/active hai.");

      const lower = n.toLowerCase();
      const same = await getDocs(query(collection(db, "families"), where("nameLower", "==", lower)));
      if (same.docs.some((d) => d.data().status !== "rejected")) throw new Error("Ye family naam pehle se liya hua hai.");

      const logoUrl = await uploadFamilyLogo(logo, uid, logoB64);

      await addDoc(collection(db, "families"), {
        name: n, nameLower: lower, slogan: sl, contact: ct, logo: logoUrl,
        leaderId: uid, leaderName: u.name || "", leaderUsername: u.username || "", leaderPhoto: u.profileImg || u.photoURL || "",
        status: "pending",
        points: 0, memberCount: 1,
        createdAt: serverTimestamp(),
        reviewDeadline: Timestamp.fromMillis(Date.now() + REVIEW_HOURS * 3600 * 1000),
        rejectReason: "",
      });
      setDone(true);
    } catch (e) {
      Alert.alert("Family nahi ban payi", e.message || "Dobara try karo");
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.container} edges={["top", "left", "right"]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Build Family</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 120 + insets.bottom }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "center", marginBottom: 22 }}>
            <TouchableOpacity style={s.logoBox} onPress={pickLogo}>
              {logo ? <Image source={{ uri: logo }} style={s.logoImg} /> : <Ionicons name="camera-outline" size={38} color="#888" />}
            </TouchableOpacity>
            <Text style={s.label}>Family Logo<Text style={s.star}> *</Text></Text>
          </View>

          <Text style={s.label}>Family Name<Text style={s.star}> *</Text></Text>
          <TextInput style={s.input} value={name} onChangeText={setName} maxLength={24} placeholder="Please add your family name" placeholderTextColor="#666" />

          <Text style={s.label}>Family Slogan<Text style={s.star}> *</Text></Text>
          <TextInput style={[s.input, { height: 90, textAlignVertical: "top" }]} value={slogan} onChangeText={setSlogan} maxLength={80} multiline
            placeholder="Add a slogan that best represents your team's identity" placeholderTextColor="#666" />

          <Text style={s.label}>Contact information<Text style={s.star}> *</Text></Text>
          <TextInput style={s.input} value={contact} onChangeText={setContact} autoCapitalize="none" placeholder="Your whatsapp number or email" placeholderTextColor="#666" />

          <View style={s.note}>
            <Ionicons name="time-outline" size={18} color={Y} />
            <Text style={s.noteText}>Request submit hone ke baad admin review karega. Review me {REVIEW_HOURS} ghante lag sakte hain.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[s.footer, { paddingBottom: 14 + insets.bottom }]}>
        <TouchableOpacity style={[s.cta, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#000" /> : <Text style={s.ctaText}>Build Family</Text>}
        </TouchableOpacity>
      </View>

      <Modal visible={done} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Ionicons name="checkmark-circle" size={56} color={Y} />
            <Text style={s.mTitle}>Request Submit Ho Gayi!</Text>
            <Text style={s.mText}>Aapki family ka review {REVIEW_HOURS} ghante me hoga. Approve hote hi family ranking me dikhne lagegi aur log join kar payenge.</Text>
            <TouchableOpacity style={[s.cta, { alignSelf: "stretch" }]} onPress={() => { setDone(false); router.replace("/family"); }}>
              <Text style={s.ctaText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f0f" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 6 },
  title: { color: "#fff", fontSize: 18, fontWeight: "800", marginLeft: 6 },
  logoBox: { width: 96, height: 96, borderRadius: 18, backgroundColor: "#262626", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 8 },
  logoImg: { width: "100%", height: "100%" },
  label: { color: "#fff", fontWeight: "700", fontSize: 14, marginBottom: 8, marginTop: 6 },
  star: { color: "#e91e63" },
  input: { backgroundColor: "#1e1e1e", color: "#fff", borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 12 },
  note: { flexDirection: "row", gap: 8, backgroundColor: "#1a1a1a", borderRadius: 10, padding: 12, marginTop: 6 },
  noteText: { color: "#bbb", flex: 1, fontSize: 13, lineHeight: 19 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 14, backgroundColor: "rgba(15,15,15,0.97)" },
  cta: { backgroundColor: Y, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  ctaText: { color: "#000", fontSize: 16, fontWeight: "800" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", padding: 28 },
  modal: { backgroundColor: "#1a1a1a", borderRadius: 18, padding: 22, alignItems: "center" },
  mTitle: { color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 10 },
  mText: { color: "#bbb", textAlign: "center", marginVertical: 12, lineHeight: 20 },
});
