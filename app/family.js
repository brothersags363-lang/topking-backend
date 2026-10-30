import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image, TextInput, ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { collection, query, where, onSnapshot, doc } from "firebase/firestore";
import { auth, db } from "./firebaseConfig";
import {
  Y, DEFAULT_AVATAR, toMs, remainingText, fmtPoints, syncMyFamily,
} from "../utils/familyUtils";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const RANK_COLORS = { 1: "#FFE500", 2: "#C9CCE8", 3: "#B7A6E8" };

export default function Family() {
  const router = useRouter();
  const insets = useSafeAreaInsets(); // navigation bar ke upar rakhne ke liye
  const uid = auth.currentUser?.uid;
  const [families, setFamilies] = useState([]);
  const [mine, setMine] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [, setTick] = useState(0);

  useEffect(() => { if (uid) syncMyFamily(uid).catch(() => {}); }, [uid]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "families"), where("status", "==", "approved")),
      (s) => { setFamilies(s.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!uid) return;
    const u1 = onSnapshot(query(collection(db, "families"), where("leaderId", "==", uid)),
      (s) => setMine(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    const u2 = onSnapshot(doc(db, "users", uid), (s) => setMe(s.data() || {}), () => {});
    return () => { u1(); u2(); };
  }, [uid]);

  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 60000); return () => clearInterval(t); }, []);

  const ranked = useMemo(
    () => [...families].sort((a, b) => (b.points || 0) - (a.points || 0)).map((f, i) => ({ ...f, rank: i + 1 })),
    [families]
  );
  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return t ? ranked.filter((f) => (f.nameLower || "").includes(t)) : ranked;
  }, [ranked, search]);

  const latest = [...mine].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))[0];
  const hasFamily = !!me?.familyId || (latest && ["pending", "approved"].includes(latest.status));

  const MyCard = () => {
    if (me?.familyId && latest?.status !== "pending") {
      return (
        <TouchableOpacity style={s.myCard} onPress={() => router.push({ pathname: "/familyDetail", params: { id: me.familyId } })}>
          <Image source={{ uri: me.familyLogo || DEFAULT_AVATAR }} style={s.myLogo} />
          <View style={{ flex: 1 }}>
            <Text style={s.myLabel}>MY FAMILY · {me.familyRole === "leader" ? "Leader" : "Member"}</Text>
            <Text style={s.myName} numberOfLines={1}>{me.familyName}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#000" />
        </TouchableOpacity>
      );
    }
    if (latest?.status === "pending") {
      return (
        <TouchableOpacity style={[s.myCard, { backgroundColor: "#2a2a2a" }]} onPress={() => router.push({ pathname: "/familyDetail", params: { id: latest.id } })}>
          <Image source={{ uri: latest.logo || DEFAULT_AVATAR }} style={s.myLogo} />
          <View style={{ flex: 1 }}>
            <Text style={[s.myLabel, { color: Y }]}>⏳ UNDER REVIEW (72 ghante)</Text>
            <Text style={[s.myName, { color: "#fff" }]} numberOfLines={1}>{latest.name}</Text>
            <Text style={{ color: "#aaa", fontSize: 12 }}>{remainingText(toMs(latest.reviewDeadline))}</Text>
          </View>
        </TouchableOpacity>
      );
    }
    if (latest?.status === "rejected") {
      return (
        <View style={[s.myCard, { backgroundColor: "#3a1515", flexDirection: "column", alignItems: "flex-start" }]}>
          <Text style={{ color: "#ff6b6b", fontWeight: "700" }}>❌ "{latest.name}" reject hui</Text>
          {!!latest.rejectReason && <Text style={{ color: "#ddd", marginTop: 4 }}>Reason: {latest.rejectReason}</Text>}
          <Text style={{ color: "#aaa", marginTop: 4, fontSize: 12 }}>Aap nayi family bana sakte ho.</Text>
        </View>
      );
    }
    return null;
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={s.row} activeOpacity={0.8} onPress={() => router.push({ pathname: "/familyDetail", params: { id: item.id } })}>
      <Text style={[s.rank, { color: RANK_COLORS[item.rank] || "#fff" }]}>{item.rank}</Text>
      <Image source={{ uri: item.logo || DEFAULT_AVATAR }} style={s.logo} />
      <View style={{ flex: 1 }}>
        <Text style={s.name} numberOfLines={1}>{item.name}</Text>
        <Text style={s.slogan} numberOfLines={1}>{item.slogan}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={s.pts}>🔥 {fmtPoints(item.points)}</Text>
        <Text style={s.mem}><Ionicons name="people" size={11} /> {item.memberCount || 1}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.container} edges={["top", "left", "right"]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Tiki Family</Text>
        <TouchableOpacity onPress={() => router.push("/familyRules")} style={{ padding: 6 }}>
          <Text style={{ color: "#aaa" }}>Rules ›</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={Y} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
          ListHeaderComponent={
            <View>
              <MyCard />
              <View style={s.searchBox}>
                <Ionicons name="search" size={16} color="#888" />
                <TextInput value={search} onChangeText={setSearch} placeholder="Family search karo" placeholderTextColor="#777" style={s.searchInput} />
              </View>
              <Text style={s.month}>This Month: {MONTHS[new Date().getMonth()]}</Text>
            </View>
          }
          ListEmptyComponent={<Text style={s.empty}>{search ? "Koi family nahi mili" : "Abhi koi family nahi hai. Pehli family aap banao!"}</Text>}
        />
      )}

      {!hasFamily && (
        <View style={[s.footer, { paddingBottom: 14 + insets.bottom }]}>
          <TouchableOpacity style={s.cta} onPress={() => router.push("/familyRules")}>
            <Text style={s.ctaText}>Build Your Family</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f0f" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 6 },
  title: { color: "#fff", fontSize: 18, fontWeight: "800" },
  myCard: { margin: 12, padding: 12, borderRadius: 14, backgroundColor: Y, flexDirection: "row", alignItems: "center" },
  myLogo: { width: 46, height: 46, borderRadius: 10, marginRight: 10, backgroundColor: "#333" },
  myLabel: { color: "#000", fontSize: 11, fontWeight: "800" },
  myName: { color: "#000", fontSize: 17, fontWeight: "800" },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e1e1e", marginHorizontal: 12, borderRadius: 10, paddingHorizontal: 10 },
  searchInput: { flex: 1, color: "#fff", paddingVertical: 8, marginLeft: 6 },
  month: { color: "#aaa", marginHorizontal: 14, marginTop: 14, marginBottom: 6, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#262626" },
  rank: { width: 30, fontSize: 18, fontWeight: "800" },
  logo: { width: 48, height: 48, borderRadius: 12, marginRight: 10, backgroundColor: "#222" },
  name: { color: "#fff", fontSize: 15, fontWeight: "700" },
  slogan: { color: "#888", fontSize: 12, marginTop: 2 },
  pts: { color: "#fff", fontWeight: "700", fontSize: 13 },
  mem: { color: "#888", fontSize: 12, marginTop: 2 },
  empty: { color: "#777", textAlign: "center", marginTop: 50, paddingHorizontal: 30 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 14, backgroundColor: "rgba(15,15,15,0.95)" },
  cta: { backgroundColor: Y, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  ctaText: { color: "#000", fontSize: 16, fontWeight: "800" },
});
