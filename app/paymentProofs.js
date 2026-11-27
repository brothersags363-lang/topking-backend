import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  Dimensions,
} from "react-native";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";

import { auth, db } from "./firebaseConfig";
import { useRouter } from "../utils/safeRouter";

const W = Dimensions.get("window").width;

const fmtDate = (ts) => {
  const ms = ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// User ka screen: admin ne jo payments bheji unki list + details + screenshot.
// Notification dabane par ?id=... aata hai -> seedha wahi payment khulti hai.
export default function PaymentProofs() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const openId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(openId || null);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, "users", uid, "paymentProofs"), orderBy("createdAt", "desc"), limit(100));
    return onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, []);

  useEffect(() => {
    if (openId) setActiveId(openId);
  }, [openId]);

  const active = useMemo(() => items.find((x) => x.id === activeId) || null, [items, activeId]);

  // detail khulte hi "seen" (unread badge hat jaye)
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !active || active.seen === true) return;
    updateDoc(doc(db, "users", uid, "paymentProofs", active.id), { seen: true }).catch(() => {});
  }, [active?.id, active?.seen]);

  const Row = ({ item }) => (
    <TouchableOpacity style={s.card} activeOpacity={0.8} onPress={() => setActiveId(item.id)}>
      <View style={s.iconBox}>
        <Ionicons name="wallet" size={22} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.amount}>₹{Number(item.amount || 0).toLocaleString("en-IN")}</Text>
        <Text style={s.meta} numberOfLines={1}>
          {item.method || "UPI"} • {fmtDate(item.createdAt)}
        </Text>
      </View>
      {item.seen !== true && <View style={s.dot} />}
      <Ionicons name="chevron-forward" size={18} color="#777" />
    </TouchableOpacity>
  );

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Payments</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#16C784" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <Row item={item} />}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={s.empty}>Abhi koi payment nahi aayi</Text>}
        />
      )}

      {/* DETAILS */}
      <Modal visible={!!active} transparent animationType="slide" onRequestClose={() => setActiveId(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>Payment Details</Text>
              <TouchableOpacity onPress={() => setActiveId(null)}>
                <Ionicons name="close" size={26} color="#fff" />
              </TouchableOpacity>
            </View>

            {active && (
              <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
                <View style={s.okBox}>
                  <Ionicons name="checkmark-circle" size={44} color="#16C784" />
                  <Text style={s.bigAmount}>₹{Number(active.amount || 0).toLocaleString("en-IN")}</Text>
                  <Text style={{ color: "#16C784", fontWeight: "bold" }}>Payment bhej di gayi</Text>
                </View>

                <View style={s.detailBox}>
                  <Line k="Tareeka" v={active.method || "UPI"} />
                  {!!active.utr && <Line k="UTR / ID" v={active.utr} />}
                  <Line k="Date" v={fmtDate(active.createdAt)} />
                  {!!active.note && <Line k="Message" v={active.note} />}
                </View>

                {!!active.imageUrl && (
                  <>
                    <Text style={s.shotLabel}>Payment Screenshot</Text>
                    <TouchableOpacity activeOpacity={0.9} onPress={() => setZoom(true)}>
                      <Image source={{ uri: active.imageUrl }} style={s.shot} resizeMode="contain" />
                    </TouchableOpacity>
                    <Text style={s.tapHint}>Bada dekhne ke liye tap karo</Text>
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>

        {/* poora screen screenshot */}
        <Modal visible={zoom} transparent animationType="fade" onRequestClose={() => setZoom(false)}>
          <TouchableOpacity style={s.zoomWrap} activeOpacity={1} onPress={() => setZoom(false)}>
            {!!active?.imageUrl && <Image source={{ uri: active.imageUrl }} style={{ width: W, height: "100%" }} resizeMode="contain" />}
            <View style={s.zoomClose}>
              <Ionicons name="close" size={28} color="#fff" />
            </View>
          </TouchableOpacity>
        </Modal>
      </Modal>
    </View>
  );
}

function Line({ k, v }) {
  return (
    <View style={s.line}>
      <Text style={s.k}>{k}</Text>
      <Text style={s.v}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#08080a" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 44, paddingHorizontal: 8, paddingBottom: 8 },
  title: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  empty: { color: "#888", textAlign: "center", marginTop: 60 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#15151a", borderRadius: 14, padding: 12, marginBottom: 10, gap: 12 },
  iconBox: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#16C784", justifyContent: "center", alignItems: "center" },
  amount: { color: "#fff", fontSize: 17, fontWeight: "bold" },
  meta: { color: "#888", fontSize: 12, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#F0155F" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#101014", borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "92%", paddingHorizontal: 16, paddingTop: 14 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sheetTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  okBox: { alignItems: "center", paddingVertical: 14 },
  bigAmount: { color: "#fff", fontSize: 34, fontWeight: "bold", marginTop: 6 },
  detailBox: { backgroundColor: "#15151a", borderRadius: 14, padding: 12 },
  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, gap: 16 },
  k: { color: "#888" },
  v: { color: "#fff", fontWeight: "600", flexShrink: 1, textAlign: "right" },
  shotLabel: { color: "#FFD700", fontWeight: "bold", marginTop: 16, marginBottom: 8 },
  shot: { width: "100%", height: 380, borderRadius: 12, backgroundColor: "#000" },
  tapHint: { color: "#666", fontSize: 11, textAlign: "center", marginTop: 6 },
  zoomWrap: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  zoomClose: { position: "absolute", top: 44, right: 16 },
});
