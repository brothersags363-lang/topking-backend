import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { doc, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { auth, db } from "./firebaseConfig";
import { Y, REVIEW_HOURS, canCreateFamily } from "../utils/familyUtils";

const Section = ({ title, lines }) => (
  <View style={{ marginBottom: 22 }}>
    <Text style={s.h}>{title}</Text>
    {lines.map((l, i) => <Text key={i} style={s.p}>• {l}</Text>)}
  </View>
);

export default function FamilyRules() {
  const router = useRouter();
  const insets = useSafeAreaInsets(); // navigation bar ke upar rakhne ke liye
  const [busy, setBusy] = useState(false);

  const start = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return Alert.alert("Login", "Pehle login karo");
    setBusy(true);
    try {
      const u = (await getDoc(doc(db, "users", uid))).data() || {};
      if (!canCreateFamily(u)) return Alert.alert("Eligible nahi", "Family sirf verified creators bana sakte hain.");
      if (u.familyId) return Alert.alert("Pehle se family me ho", "Nayi family banane ke liye pehle apni family chhodo.");
      // ye check fail ho (jaise rules na ho) to bhi form khulne do; submit par dobara check hota hai
      let pending = false;
      try {
        const mine = await getDocs(query(collection(db, "families"), where("leaderId", "==", uid)));
        pending = mine.docs.some((d) => d.data().status === "pending");
      } catch (e) { console.log("family check:", e?.code || e?.message); }
      if (pending)
        return Alert.alert("Request pending", `Aapki family ka review chal raha hai (${REVIEW_HOURS} ghante).`);
      router.push("/buildFamily");
    } catch (e) {
      Alert.alert("Error", (e?.code || e?.message || "Dobara try karo") + "");
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.container} edges={["top", "left", "right"]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Rules</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 120 + insets.bottom }}>
        <Section title="Family Guild Leader kyun banein?" lines={["Exclusive privileges", "Zyada rewards", "Apni khud ki team banao"]} />
        <Section title="Kaun ban sakta hai?" lines={["Sirf verified creators (guild leader eligibility)"]} />
        <Section title="Family banane ka process" lines={[
          "Family ka logo, naam, slogan aur contact (WhatsApp/email) bharo",
          `Request admin ke paas jayegi — review me ${REVIEW_HOURS} ghante lag sakte hain`,
          "Approve hote hi family ranking me dikhne lagegi aur log join kar sakenge",
          "Reject hone par reason dikhega, aap nayi request bhej sakte ho",
        ]} />
        <Section title="Ranking" lines={[
          "Family Points = Team stars received + Meetup points + Mission points",
          "Top 50 families ko tiered rewards milenge",
        ]} />
        <Section title="Dhyan rakho" lines={["Fake/copy naam ya galat logo allow nahi hai", "Ek user ek hi family me reh sakta hai"]} />
      </ScrollView>
      <View style={[s.footer, { paddingBottom: 14 + insets.bottom }]}>
        <TouchableOpacity style={s.cta} onPress={start} disabled={busy}>
          {busy ? <ActivityIndicator color="#000" /> : <Text style={s.ctaText}>Build your family now</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f0f" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 6 },
  title: { color: "#fff", fontSize: 18, fontWeight: "800", marginLeft: 6 },
  h: { color: Y, fontSize: 17, fontWeight: "800", marginBottom: 8 },
  p: { color: "#ccc", fontSize: 14, lineHeight: 22 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 14, backgroundColor: "rgba(15,15,15,0.97)" },
  cta: { backgroundColor: Y, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  ctaText: { color: "#000", fontSize: 16, fontWeight: "800" },
});
