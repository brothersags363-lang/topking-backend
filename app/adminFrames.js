import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  BackHandler,
  Modal,
} from "react-native";
import { scopedBackHandler } from "../utils/scopedBack";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "../utils/safeRouter";
import { callApi } from "../utils/api";
import useIsAdmin from "./useIsAdmin";
import { ADMIN_FRAMES, ADMIN_FRAME_KEYS, setAdminFrameLocal, refreshAdminFrameMap } from "../components/adminFrames";
import { FramePreview } from "../components/LevelFrame";

const PLACEHOLDER = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

// Avatar ke upar frame ka preview
const AvatarWithFrame = ({ uri, frame, size = 50 }) => (
  <View style={{ width: size, height: size, marginRight: 14 }}>
    <FramePreview
      uri={uri || PLACEHOLDER}
      source={frame && ADMIN_FRAMES[frame] ? ADMIN_FRAMES[frame].still || ADMIN_FRAMES[frame].img : null}
      size={size}
    />
  </View>
);

// ADMIN ONLY: username search karke kisi bhi user ko special frame do / hatao
export default function AdminFrames() {
  const router = useRouter();
  const isAdmin = useIsAdmin();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [framed, setFramed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState(null); // user jiske liye frame choose ho raha hai
  const [busy, setBusy] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const sub = scopedBackHandler('/adminFrames', "hardwareBackPress", () => {
      if (picked) {
        setPicked(null);
        return true;
      }
      router.back();
      return true;
    });
    return () => sub.remove();
  }, [router, picked]);

  const loadFramed = useCallback(async () => {
    try {
      const res = await callApi("/admin/list-framed-users", {});
      setFramed(res.users || []);
    } catch (e) {
      Alert.alert("Error", e.message || "List load nahi hui");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadFramed();
  }, [isAdmin, loadFramed]);

  // typing ke 400ms baad search (har akshar par server call nahi)
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const my = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const res = await callApi("/admin/search-users", { q });
        if (my === reqId.current) setResults(res.users || []);
      } catch (e) {
        if (my === reqId.current) setResults([]);
      } finally {
        if (my === reqId.current) setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  // body: { frame: key } = frame jodo (purane bane rahenge) | { remove: key } = ek frame hatao | { frame: null } = sab hatao
  const applyFrame = async (user, body) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await callApi("/admin/set-user-frame", { uid: user.uid, ...body });
      const list = Array.isArray(res.adminFrames) ? res.adminFrames : [];
      // frame turant sab jagah dikhe: apne phone ki map badlo + server se taaza map lao
      setAdminFrameLocal(user.uid, res.spec || null);
      refreshAdminFrameMap(true);
      const updated = { ...user, adminFrame: res.frame || null, adminFrames: list };
      const patch = (u) => (u.uid === user.uid ? updated : u);
      setResults((r) => r.map(patch));
      setPicked(list.length ? updated : null);   // popup khula rahe taaki aur frame bhi de sako
      loadFramed();
    } catch (e) {
      Alert.alert("Error", e.message || "Frame set nahi hua");
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "red", fontSize: 22 }}>
          {isAdmin === null ? "Checking..." : "Access Denied"}
        </Text>
      </View>
    );
  }

  const showingSearch = query.trim().length > 0;
  const data = showingSearch ? results : framed;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Special Frames</Text>

      <TextInput
        placeholder="Username search karo..."
        placeholderTextColor="#777"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />

      <Text style={styles.sub}>
        {showingSearch ? "Search results" : "Jin users ke paas abhi frame hai"}
      </Text>

      {(loading && !showingSearch) || searching ? (
        <ActivityIndicator size="large" color="#FFD700" style={{ marginTop: 30 }} />
      ) : (
        <FlatList initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7}
          data={data}
          keyExtractor={(i) => i.uid}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>
              {showingSearch ? "Koi user nahi mila" : "Abhi kisi ko frame nahi diya"}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => setPicked(item)}>
              <AvatarWithFrame uri={item.profileImg} frame={item.adminFrame} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>@{item.username}</Text>
                <Text style={styles.info}>
                  Lv {item.level} •{" "}
                  {(item.adminFrames || []).filter((k) => ADMIN_FRAMES[k]).length
                    ? (item.adminFrames || []).filter((k) => ADMIN_FRAMES[k]).map((k) => ADMIN_FRAMES[k].label).join(", ")
                    : "No special frame"}
                </Text>
              </View>
              <Text style={styles.chev}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Frame chunne wala popup */}
      <Modal visible={!!picked} transparent animationType="slide" onRequestClose={() => setPicked(null)}>
        <View style={styles.modalBg}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>@{picked?.username} ko frame do</Text>
            <Text style={styles.sheetHint}>Tap = frame de do (user ke paas jud jayega). Jo frame mil chuka hai us par tap = hatao.</Text>
            <FlatList initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7}
              data={ADMIN_FRAME_KEYS}
              numColumns={2}
              keyExtractor={(k) => k}
              columnWrapperStyle={{ justifyContent: "space-between" }}
              renderItem={({ item: k }) => {
                const active = (picked?.adminFrames || []).includes(k);
                return (
                  <TouchableOpacity
                    disabled={busy}
                    style={[styles.frameCard, active && styles.frameActive]}
                    onPress={() => applyFrame(picked, active ? { remove: k } : { frame: k })}
                  >
                    <AvatarWithFrame uri={picked?.profileImg} frame={k} size={96} />
                    <Text style={styles.frameLabel} numberOfLines={2}>
                      {ADMIN_FRAMES[k].label}
                    </Text>
                    <Text style={active ? styles.current : styles.give}>{active ? "Mil chuka - hatane ke liye tap" : "Dene ke liye tap"}</Text>
                  </TouchableOpacity>
                );
              }}
            />
            {(picked?.adminFrames || []).length ? (
              <TouchableOpacity
                disabled={busy}
                style={styles.removeBtn}
                onPress={() => applyFrame(picked, { frame: null })}
              >
                <Text style={styles.removeText}>Saare frames hatao</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setPicked(null)}>
              <Text style={styles.cancelText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", paddingTop: 50, paddingHorizontal: 15 },
  center: { flex: 1, backgroundColor: "#111", justifyContent: "center", alignItems: "center" },
  title: { color: "#fff", fontSize: 28, fontWeight: "bold", marginBottom: 16 },
  input: { backgroundColor: "#222", color: "#fff", padding: 12, borderRadius: 10, marginBottom: 12 },
  sub: { color: "#aaa", marginBottom: 8, fontSize: 13 },
  empty: { color: "#888", textAlign: "center", marginTop: 40 },
  card: {
    backgroundColor: "#1d1d1d",
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  name: { color: "#fff", fontSize: 17, fontWeight: "bold" },
  info: { color: "#ccc", marginTop: 2, fontSize: 13 },
  chev: { color: "#FFD700", fontSize: 28, marginLeft: 8 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#181818",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: "85%",
  },
  sheetTitle: { color: "#fff", fontSize: 18, fontWeight: "bold", marginBottom: 12, textAlign: "center" },
  frameCard: {
    width: "48%",
    backgroundColor: "#222",
    borderRadius: 14,
    alignItems: "center",
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  frameActive: { borderColor: "#FFD700" },
  frameLabel: { color: "#fff", fontSize: 13, fontWeight: "600", textAlign: "center", marginTop: 6 },
  current: { color: "#FFD700", fontSize: 11, marginTop: 2 },
  give: { color: "#777", fontSize: 11, marginTop: 2 },
  sheetHint: { color: "#888", fontSize: 12, textAlign: "center", marginBottom: 10 },
  removeBtn: { backgroundColor: "#e74c3c", padding: 13, borderRadius: 10, alignItems: "center", marginBottom: 8 },
  removeText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  cancelBtn: { padding: 12, alignItems: "center" },
  cancelText: { color: "#aaa", fontSize: 15 },
});
