import useBackStep from '../utils/useBackStep';
import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebaseConfig";
import { Y, DEFAULT_AVATAR } from "../utils/familyUtils";
import { uploadImage } from "../utils/uploadImage";

// Family leader apni family ka logo / slogan / contact badal sakta hai.
export default function EditFamily() {
  const router = useRouter();
  useBackStep('/family');
  const { fid } = useLocalSearchParams();
  const uid = auth.currentUser?.uid;

  const [fam, setFam] = useState(undefined);
  const [logo, setLogo] = useState("");
  const [slogan, setSlogan] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await getDoc(doc(db, "families", String(fid)));
        if (!s.exists()) return setFam(null);
        const d = { id: s.id, ...s.data() };
        setFam(d); setSlogan(d.slogan || ""); setContact(d.contact || "");
      } catch (e) { setFam(null); }
    })();
  }, [fid]);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permission", "Gallery ki permission do.");
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.5,
    });
    if (!r.canceled) { setLogo(r.assets[0].uri); }
  };

  const save = async () => {
    if (!fam || fam.leaderId !== uid) return Alert.alert("Error", "Sirf family leader edit kar sakta hai.");
    setBusy(true);
    try {
      let logoUrl = fam.logo || "";
      if (logo) logoUrl = await uploadImage(logo, "family");
      await updateDoc(doc(db, "families", fam.id), {
        logo: logoUrl, slogan: slogan.trim(), contact: contact.trim(), updatedAt: serverTimestamp(),
      });
      // leader ke users doc me bhi logo update (baaki members syncMyFamily se update honge)
      try { await updateDoc(doc(db, "users", uid), { familyLogo: logoUrl }); } catch (e) {}
      Alert.alert("Done", "Family update ho gayi.", [{ text: "OK", onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert("Error", e?.message || "Update nahi hua.");
    } finally { setBusy(false); }
  };

  if (fam === undefined) return <View style={s.center}><ActivityIndicator color={Y} /></View>;
  if (fam === null) return <View style={s.center}><Text style={{ color: "#aaa" }}>Family nahi mili</Text></View>;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.top}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color="#fff" /></TouchableOpacity>
        <Text style={s.title}>Edit Family</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <TouchableOpacity style={s.logoBox} onPress={pick}>
          <Image source={{ uri: logo || fam.logo || DEFAULT_AVATAR }} style={s.logoImg} />
          <View style={s.cam}><Ionicons name="camera" size={16} color="#000" /></View>
        </TouchableOpacity>
        <Text style={s.hint}>Logo badalne ke liye tap karo</Text>

        <Text style={s.label}>Slogan</Text>
        <TextInput style={s.input} value={slogan} onChangeText={setSlogan} maxLength={60} placeholderTextColor="#666" placeholder="Slogan" />
        <Text style={s.label}>Contact</Text>
        <TextInput style={s.input} value={contact} onChangeText={setContact} maxLength={60} placeholderTextColor="#666" placeholder="Contact" />

        <TouchableOpacity style={s.btn} onPress={save} disabled={busy}>
          {busy ? <ActivityIndicator color="#000" /> : <Text style={s.btnT}>Save</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  center: { flex: 1, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },
  logoBox: { alignSelf: "center", width: 110, height: 110, borderRadius: 22, overflow: "visible" },
  logoImg: { width: 110, height: 110, borderRadius: 22, backgroundColor: "#222" },
  cam: { position: "absolute", right: -6, bottom: -6, backgroundColor: Y, borderRadius: 14, padding: 6 },
  hint: { color: "#888", textAlign: "center", marginTop: 12, marginBottom: 10 },
  label: { color: "#ccc", marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: "#222", color: "#fff", borderRadius: 10, padding: 12 },
  btn: { backgroundColor: Y, borderRadius: 24, paddingVertical: 14, alignItems: "center", marginTop: 28 },
  btnT: { color: "#000", fontWeight: "800", fontSize: 16 },
});
