import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../app/firebaseConfig";

const Y = "#FFE500";

// Profile par "Family: <naam>" chip. Tap karo to family page khulta hai.
// data = users doc (agar pehle se hai to extra read nahi hota), warna userId se khud padhta hai.
export default function FamilyChip({ userId, data }) {
  const router = useRouter();
  const [own, setOwn] = useState(null);

  useEffect(() => {
    if (data || !userId) return;
    return onSnapshot(doc(db, "users", userId), (s) => setOwn(s.data() || {}), () => {});
  }, [userId, data]);

  const u = data || own;
  if (!u || !u.familyId) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={s.chip}
      onPress={() => router.push({ pathname: "/familyDetail", params: { id: u.familyId } })}
    >
      {!!u.familyLogo && <Image source={{ uri: u.familyLogo }} style={s.logo} />}
      <View style={{ flexShrink: 1 }}>
        <Text style={s.label}>
          Family{u.familyRole === "leader" ? " · Leader" : ""}
        </Text>
        <Text style={s.name} numberOfLines={1}>{u.familyName}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={Y} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    backgroundColor: "rgba(255,229,0,0.08)", borderWidth: 1, borderColor: "rgba(255,229,0,0.45)",
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5, marginTop: 8, maxWidth: "90%",
  },
  logo: { width: 26, height: 26, borderRadius: 7, marginRight: 8, backgroundColor: "#222" },
  label: { color: "#aaa", fontSize: 10, fontWeight: "600" },
  name: { color: Y, fontSize: 13, fontWeight: "800" },
});
