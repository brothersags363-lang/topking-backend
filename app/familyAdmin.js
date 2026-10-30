import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Alert, Modal, TextInput, ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, increment } from "firebase/firestore";
import { auth, db } from "./firebaseConfig";
import useIsAdmin from "./useIsAdmin";
import { Y, DEFAULT_AVATAR, toMs, remainingText, fmtPoints } from "../utils/familyUtils";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "closed", label: "Rejected/Disabled" },
];

export default function FamilyAdmin() {
  const router = useRouter();
  const insets = useSafeAreaInsets(); // navigation bar ke upar rakhne ke liye
  const isAdmin = useIsAdmin();
  const [all, setAll] = useState([]);
  const [tab, setTab] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { type: 'reject'|'points', f }
  const [text, setText] = useState("");
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(collection(db, "families"),
      (s) => { setAll(s.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false));
  }, [isAdmin]);

  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 60000); return () => clearInterval(t); }, []);

  const counts = useMemo(() => ({
    pending: all.filter((f) => f.status === "pending").length,
    approved: all.filter((f) => f.status === "approved").length,
    closed: all.filter((f) => ["rejected", "disabled"].includes(f.status)).length,
  }), [all]);

  const list = useMemo(() => {
    let l = all.filter((f) => tab === "closed" ? ["rejected", "disabled"].includes(f.status) : f.status === tab);
    l.sort((a, b) => tab === "pending" ? toMs(a.createdAt) - toMs(b.createdAt) : toMs(b.createdAt) - toMs(a.createdAt));
    return l;
  }, [all, tab]);

  const setStatus = async (f, status, extra = {}) => {
    try {
      await updateDoc(doc(db, "families", f.id), { status, reviewedAt: serverTimestamp(), reviewedBy: auth.currentUser?.uid, ...extra });
    } catch (e) { Alert.alert("Error", e.message); }
  };

  const confirmApprove = (f) => Alert.alert("Approve?", `"${f.name}" ko approve karein?`, [
    { text: "Cancel", style: "cancel" },
    { text: "Approve", onPress: () => setStatus(f, "approved", { rejectReason: "" }) },
  ]);

  const submitModal = async () => {
    if (!modal) return;
    if (modal.type === "reject") {
      await setStatus(modal.f, "rejected", { rejectReason: text.trim() || "Rules ke anusar nahi" });
    } else {
      const n = parseInt(text, 10);
      if (!n) return Alert.alert("Number daalo");
      try { await updateDoc(doc(db, "families", modal.f.id), { points: increment(n) }); } catch (e) { Alert.alert("Error", e.message); }
    }
    setModal(null); setText("");
  };

  if (!isAdmin) return <View style={s.center}><Text style={{ color: "red", fontSize: 18 }}>{isAdmin === null ? "Checking..." : "Access Denied"}</Text></View>;

  const renderItem = ({ item: f }) => (
    <View style={s.card}>
      <View style={{ flexDirection: "row" }}>
        <Image source={{ uri: f.logo || DEFAULT_AVATAR }} style={s.logo} />
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{f.name}</Text>
          <Text style={s.slogan}>{f.slogan}</Text>
        </View>
        {f.status === "pending" && (
          <View style={[s.timer, toMs(f.reviewDeadline) < Date.now() && { backgroundColor: "#5a1a1a" }]}>
            <Text style={s.timerT}>{remainingText(toMs(f.reviewDeadline))}</Text>
          </View>
        )}
      </View>

      <View style={s.info}>
        <Text style={s.infoT}>👤 Leader: @{f.leaderUsername || f.leaderName || f.leaderId}</Text>
        <Text style={s.infoT}>📞 {f.contact}</Text>
        <Text style={s.infoT}>🕒 {f.createdAt ? new Date(toMs(f.createdAt)).toLocaleString() : ""}</Text>
        {f.status === "approved" && <Text style={s.infoT}>🔥 {fmtPoints(f.points)} pts · 👥 {f.memberCount || 1}</Text>}
        {f.status === "rejected" && !!f.rejectReason && <Text style={[s.infoT, { color: "#ff8a8a" }]}>Reason: {f.rejectReason}</Text>}
      </View>

      <View style={s.btns}>
        {f.status === "pending" && (<>
          <TouchableOpacity style={[s.btn, { backgroundColor: Y }]} onPress={() => confirmApprove(f)}><Text style={s.btnT}>Approve</Text></TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: "#e74c3c" }]} onPress={() => { setText(""); setModal({ type: "reject", f }); }}><Text style={[s.btnT, { color: "#fff" }]}>Reject</Text></TouchableOpacity>
        </>)}
        {f.status === "approved" && (<>
          <TouchableOpacity style={[s.btn, { backgroundColor: "#2a2a2a" }]} onPress={() => { setText(""); setModal({ type: "points", f }); }}><Text style={[s.btnT, { color: "#fff" }]}>+ Points</Text></TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: "#e74c3c" }]} onPress={() => Alert.alert("Disable?", "Family band ho jayegi.", [{ text: "Cancel", style: "cancel" }, { text: "Disable", style: "destructive", onPress: () => setStatus(f, "disabled") }])}><Text style={[s.btnT, { color: "#fff" }]}>Disable</Text></TouchableOpacity>
        </>)}
        {["rejected", "disabled"].includes(f.status) && (
          <TouchableOpacity style={[s.btn, { backgroundColor: Y }]} onPress={() => confirmApprove(f)}><Text style={s.btnT}>Approve</Text></TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={["top", "left", "right"]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}><Ionicons name="chevron-back" size={24} color="#fff" /></TouchableOpacity>
        <Text style={s.title}>Family Requests</Text>
      </View>
      <View style={s.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[s.tab, tab === t.key && s.tabOn]} onPress={() => setTab(t.key)}>
            <Text style={[s.tabT, tab === t.key && { color: "#000" }]}>{t.label} ({counts[t.key]})</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator color={Y} style={{ marginTop: 40 }} /> : (
        <FlatList data={list} keyExtractor={(i) => i.id} renderItem={renderItem} contentContainerStyle={{ padding: 12, paddingBottom: 40 + insets.bottom }}
          ListEmptyComponent={<Text style={{ color: "#777", textAlign: "center", marginTop: 50 }}>Kuch nahi hai</Text>} />
      )}

      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.mTitle}>{modal?.type === "reject" ? "Reject reason" : "Family Points add karo"}</Text>
            <TextInput style={s.input} value={text} onChangeText={setText} autoFocus
              keyboardType={modal?.type === "points" ? "number-pad" : "default"}
              placeholder={modal?.type === "reject" ? "Reason likho (user ko dikhega)" : "Jaise 5000"} placeholderTextColor="#666" />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={[s.btn, { backgroundColor: "#2a2a2a", flex: 1 }]} onPress={() => setModal(null)}><Text style={[s.btnT, { color: "#fff" }]}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[s.btn, { backgroundColor: Y, flex: 1 }]} onPress={submitModal}><Text style={s.btnT}>OK</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 6 },
  title: { color: "#fff", fontSize: 18, fontWeight: "800", marginLeft: 6 },
  tabs: { flexDirection: "row", paddingHorizontal: 10, gap: 6 },
  tab: { flex: 1, backgroundColor: "#1e1e1e", borderRadius: 10, paddingVertical: 8, alignItems: "center" },
  tabOn: { backgroundColor: Y },
  tabT: { color: "#ccc", fontSize: 11, fontWeight: "700" },
  card: { backgroundColor: "#151515", borderRadius: 14, padding: 12, marginBottom: 12 },
  logo: { width: 56, height: 56, borderRadius: 12, marginRight: 10, backgroundColor: "#222" },
  name: { color: "#fff", fontSize: 16, fontWeight: "800" },
  slogan: { color: "#999", fontSize: 12, marginTop: 2 },
  timer: { backgroundColor: "#2a2500", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start" },
  timerT: { color: Y, fontSize: 11, fontWeight: "700" },
  info: { marginTop: 10, gap: 3 },
  infoT: { color: "#ccc", fontSize: 13 },
  btns: { flexDirection: "row", gap: 8, marginTop: 12 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  btnT: { color: "#000", fontWeight: "800" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", padding: 24 },
  modal: { backgroundColor: "#1a1a1a", borderRadius: 16, padding: 18 },
  mTitle: { color: "#fff", fontSize: 16, fontWeight: "800", marginBottom: 10 },
  input: { backgroundColor: "#262626", color: "#fff", borderRadius: 10, padding: 12 },
});
