import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { doc, getDoc, getDocs, collection, query, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "../app/firebaseConfig";
import { syncMyFamily } from "../utils/familyUtils";

// Profile ke premium card (Rank | Angels | ___) ka teesra khana.
// - User family me NAHI hai  -> `fallback` dikhata hai (Share button)
// - User family me HAI       -> logo + "Family" + family ka naam, tap par familyDetail khulta hai
//
// Family kaise dhundhta hai (users doc ke familyId par bharosa nahi, kyunki jab leader kisi ko
// add karta hai to uska users doc sirf wo khud update kar sakta hai):
//   1) users doc me familyId ho to wahi
//   2) warna familyRequests (accepted / joined) se
//   3) warna jo approved family ka leader ho
// Phir family ka naam / logo families doc se live aata hai.
async function findFamilyId(uid, userDoc) {
  if (userDoc?.familyId) return userDoc.familyId;

  try {
    const rq = await getDocs(query(collection(db, "familyRequests"), where("userId", "==", uid)));
    const hit = rq.docs.find((d) => ["accepted", "joined"].includes(d.data().status));
    if (hit) {
      const id = hit.data().familyId;
      const [f, m] = await Promise.all([
        getDoc(doc(db, "families", id)),
        getDoc(doc(db, "families", id, "members", uid)),
      ]);
      if (f.exists() && f.data().status === "approved" && m.exists()) return id;
    }
  } catch (e) {}

  try {
    const mine = await getDocs(query(collection(db, "families"), where("leaderId", "==", uid)));
    const ok = mine.docs.find((d) => d.data().status === "approved");
    if (ok) return ok.id;
  } catch (e) {}

  return null;
}

export default function FamilyCell({ userId, data, fallback = null }) {
  const router = useRouter();
  const [own, setOwn] = useState(undefined);   // users doc (jab data prop na ho)
  const [fid, setFid] = useState(null);
  const [fam, setFam] = useState(null);

  const uid = userId || data?.uid || data?.id;
  const isMe = !!uid && uid === auth.currentUser?.uid;

  useEffect(() => {
    if (data || !uid) return;
    return onSnapshot(doc(db, "users", uid), (s) => setOwn(s.data() || {}), () => setOwn({}));
  }, [data, uid]);

  const userDoc = data || own;
  const ready = userDoc !== undefined;

  // apni profile khuli ho to apna users doc family ke sath sync kar do
  useEffect(() => {
    if (isMe) syncMyFamily(uid).catch(() => {});
  }, [isMe, uid]);

  useEffect(() => {
    if (!uid || !ready) return;
    let alive = true;
    findFamilyId(uid, userDoc).then((id) => { if (alive) setFid(id); });
    return () => { alive = false; };
  }, [uid, ready, userDoc?.familyId]);

  useEffect(() => {
    if (!fid) { setFam(null); return; }
    return onSnapshot(doc(db, "families", fid),
      (s) => setFam(s.exists() && s.data().status === "approved" ? { id: s.id, ...s.data() } : null),
      () => setFam(null));
  }, [fid]);

  if (!fam) return fallback;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={s.cell}
      onPress={() => router.push({ pathname: "/familyDetail", params: { id: fam.id } })}
    >
      {!!fam.logo && <Image source={{ uri: fam.logo }} style={s.logo} />}
      <View style={{ flexShrink: 1 }}>
        <Text style={s.label}>Family</Text>
        <Text style={s.name} numberOfLines={1}>{fam.name}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  cell: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 4, marginHorizontal: 4, maxWidth: 130,
  },
  logo: { width: 34, height: 34, borderRadius: 8, marginRight: 8, backgroundColor: "#fff" },
  label: { color: "#888", fontSize: 11 },
  name: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
