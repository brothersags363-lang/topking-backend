import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Alert,
  BackHandler,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import { scopedBackHandler } from "../utils/scopedBack";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "../utils/safeRouter";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "./firebaseConfig";
import { callApi } from "../utils/api";
import {
  useFrameInfo,
  patchFrameInfo,
  refreshFrameInfo,
  useFrameSpec,
  refreshAdminFrameMap,
  getMyFramePrefs,
  setMyFramePrefsLocal,
  setAdminFrameLocal,
  specFromPrefs,
  ADMIN_FRAMES,
} from "../components/adminFrames";
import {
  FRAME_TIERS,
  FRAME_TIER_LABEL,
  FRAME_IMAGES,
  getTier,
} from "../components/LevelFrame";

const PLACEHOLDER = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
const GOLD = "#FFD700";

// avatar + frame ka chhota preview (frame avatar ke upar)
function AvatarPreview({ uri, frameSource, size = 84 }) {
  return (
    <View style={{ width: size, height: size }}>
      <ExpoImage
        source={{ uri: uri || PLACEHOLDER }}
        style={{
          position: "absolute",
          top: size * 0.14,
          left: size * 0.14,
          width: size * 0.72,
          height: size * 0.72,
          borderRadius: size,
          backgroundColor: "#333",
        }}
        contentFit="cover"
      />
      {frameSource ? (
        <ExpoImage
          source={frameSource}
          contentFit="contain"
          autoplay
          style={{ position: "absolute", width: size, height: size }}
        />
      ) : null}
    </View>
  );
}

// ek chunne wala card (frame ya entry)
function PickCard({ children, label, sub, active, locked, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[st.card, active && st.cardActive, locked && st.cardLocked]}
    >
      <View style={[st.cardBody, locked && { opacity: 0.35 }]}>{children}</View>
      <Text style={st.cardLabel} numberOfLines={1}>
        {label}
      </Text>
      {sub ? (
        <Text style={[st.cardSub, active && { color: GOLD }]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
      {locked ? (
        <View style={st.lockBadge}>
          <Ionicons name="lock-closed" size={12} color="#fff" />
        </View>
      ) : null}
      {active ? (
        <View style={st.tickBadge}>
          <Ionicons name="checkmark" size={14} color="#000" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export default function FramesEntries() {
  const router = useRouter();
  const uid = auth.currentUser ? auth.currentUser.uid : null;
  const info = useFrameInfo(uid);
  // abhi kaun sa frame laga hai: 'off' | admin key | 'lv30/40/50' | null (auto)
  const spec = useFrameSpec(uid);
  const [mine, setMine] = useState(getMyFramePrefs());

  const [profileImg, setProfileImg] = useState("");
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sub = scopedBackHandler('/framesEntries', "hardwareBackPress", () => {
      router.back();
      return true;
    });
    return () => sub.remove();
  }, [router]);

  // screen khulte hi taaza data (level, admin frame, purani choice) lao
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!uid) {
        setBooting(false);
        return;
      }
      try {
        const [snap] = await Promise.all([
          getDoc(doc(db, "users", uid)),
          refreshFrameInfo(uid),
          refreshAdminFrameMap(true),
        ]);
        if (alive) setMine(getMyFramePrefs());
        if (alive && snap.exists()) setProfileImg(snap.data().profileImg || "");
      } catch (e) {}
      if (alive) setBooting(false);
    })();
    return () => {
      alive = false;
    };
  }, [uid]);

  const myLevel = Number(info.level) || 1;
  // level se milne wala frame (30-39 -> lv30, 40-49 -> lv40, 50+ -> lv50)
  const myTier = getTier(myLevel);
  const adminOwned = mine.adminFrame && ADMIN_FRAMES[mine.adminFrame] ? mine.adminFrame : null;

  // abhi jo frame dikh raha hai (AUTO me: admin ka frame, warna level wala)
  const current = spec === "off" ? "off"
    : spec && ADMIN_FRAMES[spec] ? spec
    : spec && /^lv(30|40|50)$/.test(spec) ? spec
    : adminOwned ? adminOwned
    : myTier ? "lv" + myTier : "off";

  const currentFrameSource = current === "off" ? null
    : ADMIN_FRAMES[current] ? ADMIN_FRAMES[current].img
    : FRAME_IMAGES.ANIM[Number(current.slice(2))];
  const currentLabel = current === "off"
    ? (adminOwned || myTier ? "Frame band hai" : "Abhi koi frame nahi mila")
    : ADMIN_FRAMES[current] ? ADMIN_FRAMES[current].label
    : FRAME_TIER_LABEL[Number(current.slice(2))];

  // entry on/off ya frame chunna: server ko bhejo, jawab aate hi poore app me turant badal do
  const save = useCallback(
    async (body) => {
      if (busy || !uid) return;
      setBusy(true);
      try {
        const res = await callApi("/user/set-frame-prefs", body);
        const prefs = res.prefs || {};
        patchFrameInfo(uid, prefs);
        if (Object.prototype.hasOwnProperty.call(body, "frameOff") || Object.prototype.hasOwnProperty.call(body, "frameChoice")) {
          setMyFramePrefsLocal(prefs);
          setMine(getMyFramePrefs());
          // feed, chat, comments, profile, live room - sab jagah turant naya frame
          setAdminFrameLocal(uid, specFromPrefs(prefs));
        }
      } catch (e) {
        Alert.alert("Error", (e && e.message) || "Save nahi hua, dobara try karo");
      } finally {
        setBusy(false);
      }
    },
    [busy, uid]
  );

  const pickFrame = (id) => {
    if (id === current) return;
    if (id === "off") return save({ frameOff: true });
    if (ADMIN_FRAMES[id]) return save({ frameChoice: "adm:" + id });
    return save({ frameChoice: id });
  };

  const lockedAlert = (what, need) =>
    Alert.alert("Abhi locked hai", `${what} Level ${need} par milta hai. Aapka level abhi ${myLevel} hai.`);

  if (!uid) {
    return (
      <SafeAreaView style={st.container}>
        <Text style={st.empty}>Pehle login karo</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.container}>
      {/* HEADER */}
      <View style={st.header}>
        <TouchableOpacity style={st.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Frames & Entries</Text>
        <View style={{ width: 40 }} />
      </View>

      {booting ? (
        <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {/* PREVIEW */}
          <View style={st.previewBox}>
            <AvatarPreview uri={profileImg} frameSource={currentFrameSource} size={120} />
            <Text style={st.previewText}>{currentLabel}</Text>
            <Text style={st.previewSub}>Level {myLevel}</Text>
          </View>

          {/* ================= FRAMES ================= */}
          <View style={st.sectionHead}>
            <Text style={st.sectionTitle}>MERE FRAMES</Text>
          </View>
          <Text style={st.hint}>
            Jo frame aapko mila hai (level se ya admin se) usse tap karke lagao. Jo lagaoge wahi feed, chat, profile aur live room me sabko dikhega.
          </Text>

          <View style={st.grid}>
            <PickCard
              label="Koi nahi"
              sub={current === "off" ? "Laga hua" : "Frame hatao"}
              active={current === "off"}
              onPress={() => pickFrame("off")}
            >
              <AvatarPreview uri={profileImg} frameSource={null} size={84} />
            </PickCard>

            {adminOwned ? (
              <PickCard
                key={adminOwned}
                label={ADMIN_FRAMES[adminOwned].label}
                sub="Admin ne diya"
                active={current === adminOwned}
                onPress={() => pickFrame(adminOwned)}
              >
                <AvatarPreview uri={profileImg} frameSource={ADMIN_FRAMES[adminOwned].still} size={84} />
              </PickCard>
            ) : null}

            {FRAME_TIERS.map((t) => {
              const owned = t <= myTier;
              return (
                <PickCard
                  key={t}
                  label={FRAME_TIER_LABEL[t]}
                  sub={owned ? `Lv ${t}` : `Lv ${t} par milega`}
                  active={current === "lv" + t}
                  locked={!owned}
                  onPress={() => (owned ? pickFrame("lv" + t) : lockedAlert(FRAME_TIER_LABEL[t] + " frame", t))}
                >
                  <AvatarPreview uri={profileImg} frameSource={FRAME_IMAGES.STATIC[t]} size={84} />
                </PickCard>
              );
            })}
          </View>

          {/* ================= ENTRY ================= */}
          <View style={[st.sectionHead, { marginTop: 26 }]}>
            <Text style={st.sectionTitle}>MERI ENTRY</Text>
            <View style={st.switchRow}>
              <Text style={st.switchLabel}>{info.entryOff ? "Band" : "Chalu"}</Text>
              <Switch
                value={!info.entryOff}
                disabled={busy}
                onValueChange={(on) => save({ entryOff: !on })}
                trackColor={{ false: "#333", true: "#a68b00" }}
                thumbColor={!info.entryOff ? GOLD : "#999"}
              />
            </View>
          </View>
          <Text style={st.hint}>
            Level 30 se entry banner dikhta hai (30-39 gold, 40-49 purple, 50+ orange). Band karne par aap bina entry ke chupchap aoge.
          </Text>

          {busy ? <ActivityIndicator color={GOLD} style={{ marginTop: 20 }} /> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const CARD_W = "31%";

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    height: 70,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  back: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  empty: { color: "#888", textAlign: "center", marginTop: 80 },

  previewBox: { alignItems: "center", paddingVertical: 22 },
  previewText: { color: "#fff", fontSize: 17, fontWeight: "700", marginTop: 8 },
  previewSub: { color: "#888", fontSize: 13, marginTop: 2 },

  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 4,
  },
  sectionTitle: { color: "#888", fontSize: 14, fontWeight: "700" },
  switchRow: { flexDirection: "row", alignItems: "center" },
  switchLabel: { color: "#aaa", fontSize: 13, marginRight: 6 },
  hint: { color: "#666", fontSize: 12, paddingHorizontal: 16, marginTop: 2, marginBottom: 10 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  card: {
    width: CARD_W,
    backgroundColor: "#171717",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "transparent",
  },
  cardActive: { borderColor: GOLD },
  cardLocked: { backgroundColor: "#111" },
  cardBody: { height: 90, justifyContent: "center", alignItems: "center", width: "100%" },
  cardLabel: { color: "#fff", fontSize: 12, fontWeight: "700", marginTop: 4 },
  cardSub: { color: "#777", fontSize: 10.5, marginTop: 1 },
  lockBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#444",
    borderRadius: 10,
    padding: 4,
  },
  tickBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: GOLD,
    borderRadius: 10,
    padding: 3,
  },
});
