import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Dimensions,
} from "react-native";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";

import { db } from "./firebaseConfig";
import { useRouter } from "../utils/safeRouter";
import { markAnnouncementsSeen } from "../utils/messages/useAdminInbox";

const W = Dimensions.get("window").width;

const fmt = (ms) =>
  ms
    ? new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

// Sabhi users ke liye: admin ki ghoshnayein (text + optional photo).
// Notification dabane par ?id=... aata hai -> wo ghoshna upar highlight hoti hai.
export default function Announcements() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const openId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [zoomUrl, setZoomUrl] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    markAnnouncementsSeen(); // khulte hi unread badge 0
    const q = query(collection(db, "announcements"), orderBy("createdAtMs", "desc"), limit(50));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
        markAnnouncementsSeen();
      },
      () => setLoading(false)
    );
    return () => {
      markAnnouncementsSeen();
      unsub();
    };
  }, []);

  // notification se aaye to wahi ghoshna upar
  const data = openId ? [...items.filter((i) => i.id === openId), ...items.filter((i) => i.id !== openId)] : items;

  const renderItem = ({ item }) => {
    const hot = item.id === openId;
    return (
      <View style={[s.card, hot && s.cardHot]}>
        <View style={s.cardHead}>
          <View style={s.iconBox}>
            <Ionicons name="megaphone" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cTitle} numberOfLines={2}>{item.title || "Ghoshna"}</Text>
            <Text style={s.cTime}>{fmt(Number(item.createdAtMs) || 0)}</Text>
          </View>
        </View>

        {!!item.text && <Text style={s.text}>{item.text}</Text>}

        {!!item.imageUrl && (
          <TouchableOpacity activeOpacity={0.9} onPress={() => setZoomUrl(item.imageUrl)}>
            <Image source={{ uri: item.imageUrl }} style={s.img} resizeMode="cover" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Announcements</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#8B5CF6" />
      ) : (
        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={s.empty}>Abhi koi ghoshna nahi</Text>}
        />
      )}

      <Modal visible={!!zoomUrl} transparent animationType="fade" onRequestClose={() => setZoomUrl(null)}>
        <TouchableOpacity style={s.zoomWrap} activeOpacity={1} onPress={() => setZoomUrl(null)}>
          {!!zoomUrl && <Image source={{ uri: zoomUrl }} style={{ width: W, height: "100%" }} resizeMode="contain" />}
          <View style={s.zoomClose}>
            <Ionicons name="close" size={28} color="#fff" />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#08080a" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 44, paddingHorizontal: 8, paddingBottom: 8 },
  title: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  empty: { color: "#888", textAlign: "center", marginTop: 60 },
  card: { backgroundColor: "#15151a", borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "transparent" },
  cardHot: { borderColor: "#8B5CF6" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  iconBox: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#8B5CF6", justifyContent: "center", alignItems: "center" },
  cTitle: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  cTime: { color: "#888", fontSize: 11, marginTop: 2 },
  text: { color: "#e6e6ea", fontSize: 14, lineHeight: 21 },
  img: { width: "100%", height: 220, borderRadius: 12, marginTop: 12, backgroundColor: "#000" },
  zoomWrap: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  zoomClose: { position: "absolute", top: 44, right: 16 },
});
