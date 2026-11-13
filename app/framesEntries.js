import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  ADMIN_FRAMES,
  useFrameInfo,
  patchFrameInfo,
  refreshFrameInfo,
} from "../components/adminFrames";
import {
  FRAME_TIERS,
  FRAME_TIER_LABEL,
  FRAME_IMAGES,
  getMaxTier,
  computeFrame,
} from "../components/LevelFrame";
import { ENTRY_CATALOG } from "../components/live/entryCatalog";

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
        ]);
        if (alive && snap.exists()) setProfileImg(snap.data().profileImg || "");
      } catch (e) {}
      if (alive) setBooting(false);
    })();
    return () => {
      alive = false;
    };
  }, [uid]);

  const maxTier = useMemo(() => getMaxTier(info), [info]);
  const myLevel = Number(info.level) || 1;
  const current = computeFrame(info, info.level);

  const currentFrameSource = !current
    ? null
    : current.kind === "admin"
    ? ADMIN_FRAMES[current.key].img
    : FRAME_IMAGES.ANIM[current.tier];

  // server ko bhejo; jawab aate hi poore app me turant badal do
  const save = useCallback(
    async (body) => {
      if (busy || !uid) return;
      setBusy(true);
      try {
        const res = await callApi("/user/set-frame-prefs", body);
        patchFrameInfo(uid, res.prefs || {});
      } catch (e) {
        Alert.alert("Error", (e && e.message) || "Save nahi hua, dobara try karo");
      } finally {
        setBusy(false);
      }
    },
    [busy, uid]
  );

  const lockedAlert = (what, need) =>
    Alert.alert("Abhi locked hai", `${what} Level ${need} par milta hai. Aapka level abhi ${myLevel} hai.`);

  // choice 'lv30' / 'adm:key' / null(auto)
  const pickFrame = (choice) => save({ frameChoice: choice });
  const pickEntry = (key) => save({ entryChoice: key });

  const frameChoice = info.frameChoice;
  // choice tabhi "active" maani jaye jab wo sach me lag rahi ho; warna Auto
  const choiceValid = !!(
    frameChoice &&
    current &&
    frameChoice === (current.kind === "admin" ? "adm:" + current.key : "lv" + current.tier)
  );
  const frameAuto = !choiceValid;
  const entryChoice = info.entryChoice;

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
            <AvatarPreview
              uri={profileImg}
              frameSource={info.frameOff ? null : currentFrameSource}
              size={120}
            />
            <Text style={st.previewText}>
              {info.frameOff
                ? "Frame band hai"
                : current
                ? current.kind === "admin"
                  ? ADMIN_FRAMES[current.key].label
                  : FRAME_TIER_LABEL[current.tier]
                : "Abhi koi frame nahi mila"}
            </Text>
            <Text style={st.previewSub}>Level {myLevel}</Text>
          </View>

          {/* ================= FRAMES ================= */}
          <View style={st.sectionHead}>
            <Text style={st.sectionTitle}>MERE FRAMES</Text>
            <View style={st.switchRow}>
              <Text style={st.switchLabel}>{info.frameOff ? "Band" : "Chalu"}</Text>
              <Switch
                value={!info.frameOff}
                disabled={busy}
                onValueChange={(on) => save({ frameOff: !on })}
                trackColor={{ false: "#333", true: "#a68b00" }}
                thumbColor={!info.frameOff ? GOLD : "#999"}
              />
            </View>
          </View>
          <Text style={st.hint}>
            Jo frame aapko mila hai usse chuno. Band karne par aapka frame kisi bhi screen me nahi dikhega.
          </Text>

          <View style={[st.grid, info.frameOff && { opacity: 0.4 }]} pointerEvents={info.frameOff ? "none" : "auto"}>
            {/* AUTO */}
            <PickCard
              label="Auto"
              sub="Sabse bada"
              active={frameAuto && !info.frameOff}
              onPress={() => pickFrame(null)}
            >
              <View style={st.autoIcon}>
                <Ionicons name="sparkles" size={34} color={GOLD} />
              </View>
            </PickCard>

            {/* ADMIN DIYA HUA FRAME */}
            {info.adminFrame && ADMIN_FRAMES[info.adminFrame] ? (
              <PickCard
                label={ADMIN_FRAMES[info.adminFrame].label}
                sub="Special"
                active={frameChoice === "adm:" + info.adminFrame}
                onPress={() => pickFrame("adm:" + info.adminFrame)}
              >
                <AvatarPreview uri={profileImg} frameSource={ADMIN_FRAMES[info.adminFrame].img} size={84} />
              </PickCard>
            ) : null}

            {/* LEVEL FRAMES */}
            {FRAME_TIERS.map((t) => {
              const owned = t <= maxTier;
              return (
                <PickCard
                  key={t}
                  label={FRAME_TIER_LABEL[t]}
                  sub={owned ? `Lv ${t}` : `Lv ${t} par milega`}
                  active={owned && frameChoice === "lv" + t}
                  locked={!owned}
                  onPress={() => (owned ? pickFrame("lv" + t) : lockedAlert(FRAME_TIER_LABEL[t] + " frame", t))}
                >
                  <AvatarPreview uri={profileImg} frameSource={FRAME_IMAGES.STATIC[t]} size={84} />
                </PickCard>
              );
            })}
          </View>

          {/* ================= ENTRIES ================= */}
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
            Live room me aate waqt jo entry dikhti hai. Band karne par aap bina entry ke chupchap aoge.
          </Text>

          <View style={[st.grid, info.entryOff && { opacity: 0.4 }]} pointerEvents={info.entryOff ? "none" : "auto"}>
            <PickCard
              label="Auto"
              sub="Level ke hisaab se"
              active={!entryChoice && !info.entryOff}
              onPress={() => pickEntry(null)}
            >
              <View style={st.autoIcon}>
                <Ionicons name="sparkles" size={34} color={GOLD} />
              </View>
            </PickCard>

            {ENTRY_CATALOG.map((e) => {
              const owned = myLevel >= e.min;
              return (
                <PickCard
                  key={e.key}
                  label={e.label}
                  sub={owned ? (e.min ? `Lv ${e.min}` : "Sabke liye") : `Lv ${e.min} par milega`}
                  active={owned && entryChoice === e.key}
                  locked={!owned}
                  onPress={() => (owned ? pickEntry(e.key) : lockedAlert(e.label + " entry", e.min))}
                >
                  {e.img ? (
                    <ExpoImage source={e.img} contentFit="contain" style={st.entryImg} />
                  ) : (
                    <View style={st.autoIcon}>
                      <Ionicons name="arrow-back-circle" size={38} color="#bbb" />
                    </View>
                  )}
                </PickCard>
              );
            })}
          </View>

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
  autoIcon: { width: 84, height: 84, justifyContent: "center", alignItems: "center" },
  entryImg: { width: "100%", height: 64 },
});
