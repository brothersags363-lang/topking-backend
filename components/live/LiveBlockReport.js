// components/live/LiveBlockReport.js
// Live room ke andar kisi bhi user (host / viewer / speaker) ko
//   • Block   -> blockedUsers/{myId}_{uid}  (userProfile.js jaisa hi schema)
//   • Report  -> reports collection
// kar sakte ho. Block ke baad useBlockedIds() ki wajah se:
//   - us user ke chat / seat / viewer list me hide
//   - agar wo host hai to room khud band ho jata hai (back)
//   - all-live list me uski live dikhti hi nahi
import React, { useState } from "react";
import { Alert, Modal, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../../app/firebaseConfig";

export const LIVE_REPORT_REASONS = [
  "Nudity / sexual content",
  "Abuse / harassment",
  "Spam / scam",
  "Underage user",
  "Fake / stuck ID",
  "Other",
];

// Modal alag window hota hai -> insets 0 aa sakte hain (3-button nav bar). Isliye neeche nav bar jitni jagah hamesha chhodte hain.
const navBarGap = (b = 0) => {
  if (Platform.OS !== "android") return Math.max(b, 14);
  return b > 0 ? b + 14 : 52;
};

// Report reason sheet: nav bar ke UPAR, saf dikhe + chhoti screen par scroll ho.
function ReasonSheet({ t, onPick, onClose }) {
  const insets = useSafeAreaInsets();
  const gap = navBarGap(insets.bottom);
  return (
    <View style={{ flex: 1, paddingBottom: gap }}>
      <TouchableOpacity
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{ backgroundColor: "#111", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 18, maxHeight: "85%" }}
        >
          <Text style={{ color: "#fff", fontSize: 17, fontWeight: "bold", textAlign: "center" }}>
            Report {t.name ? "@" + t.name : "user"}
          </Text>
          <Text style={{ color: "#888", fontSize: 12, textAlign: "center", marginTop: 4, marginBottom: 10 }}>
            Why are you reporting?
          </Text>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {LIVE_REPORT_REASONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={{ paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "#222" }}
                onPress={() => onPick(r)}
              >
                <Text style={{ color: "#fff", fontSize: 15 }}>{r}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: gap, backgroundColor: "rgba(0,0,0,0.5)" }} />
    </View>
  );
}

const pick = (t) => ({
  uid: t?.uid || t?.userId || t?.senderId || t?.id || "",
  name: t?.name || t?.userName || t?.username || t?.senderName || "",
  img: t?.img || t?.userImg || t?.profileImg || "",
});

export async function blockUserFromLive(target) {
  const myId = auth?.currentUser?.uid;
  const t = pick(target);
  if (!myId || !t.uid || t.uid === myId) return false;
  await setDoc(doc(db, "blockedUsers", `${myId}_${t.uid}`), {
    blockerId: myId,
    blockedUserId: t.uid,
    username: t.name,
    profileImg: t.img,
    source: "live",
    createdAt: serverTimestamp(),
  });
  // follow relation hata do (best effort)
  try {
    await Promise.all([
      deleteDoc(doc(db, "follows", `${myId}_${t.uid}`)),
      deleteDoc(doc(db, "follows", `${t.uid}_${myId}`)),
    ]);
  } catch (_) {}
  return true;
}

export function confirmBlockFromLive(target, onDone) {
  const t = pick(target);
  Alert.alert(
    "Block user",
    `${t.name ? "@" + t.name : "Is user"} ko block karein? Uski live aur messages aapko nahi dikhenge.`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          try {
            const ok = await blockUserFromLive(target);
            if (ok) {
              Alert.alert("Blocked", "User block ho gaya.");
              onDone && onDone();
            }
          } catch (e) {
            Alert.alert("Block", "Block nahi ho paya. Dobara try karein.");
          }
        },
      },
    ]
  );
}

export async function reportUserFromLive({ target, reason, roomId, hostId }) {
  const myId = auth?.currentUser?.uid;
  const t = pick(target);
  if (!myId || !t.uid) return false;
  await addDoc(collection(db, "reports"), {
    roomId: roomId || null,
    hostId: hostId || null,
    reporterId: myId,
    targetId: t.uid,
    targetName: t.name,
    reason,
    source: "live",
    createdAt: Date.now(),
  });
  return true;
}

export default function LiveBlockReport({
  target,
  roomId,
  hostId,
  showReport = true,
  onDone,
  style,
}) {
  const [reasonOpen, setReasonOpen] = useState(false);
  const t = pick(target);
  const myId = auth?.currentUser?.uid;
  if (!t.uid || t.uid === myId) return null;

  const btn = {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 22,
    alignItems: "center",
    borderWidth: 1,
    marginHorizontal: 4,
  };

  const submit = async (reason) => {
    setReasonOpen(false);
    try {
      await reportUserFromLive({ target, reason, roomId, hostId });
      Alert.alert("Thanks", "Report bhej di gayi. Hamari team review karegi.");
      onDone && onDone();
    } catch (e) {
      Alert.alert("Report", "Report nahi gayi. Dobara try karein.");
    }
  };

  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", marginTop: 14, width: "88%", alignSelf: "center" },
        style,
      ]}
    >
      <TouchableOpacity
        style={[btn, { borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.12)" }]}
        onPress={() => confirmBlockFromLive(target, onDone)}
      >
        <Text style={{ color: "#f87171", fontWeight: "bold", fontSize: 13 }}>🚫 Block</Text>
      </TouchableOpacity>

      {showReport && (
        <TouchableOpacity
          style={[btn, { borderColor: "#4b5563" }]}
          onPress={() => setReasonOpen(true)}
        >
          <Text style={{ color: "#f87171", fontWeight: "bold", fontSize: 13 }}>⚑ Report</Text>
        </TouchableOpacity>
      )}

      <Modal transparent visible={reasonOpen} animationType="slide" statusBarTranslucent hardwareAccelerated onRequestClose={() => setReasonOpen(false)}>
        <SafeAreaProvider>
          <ReasonSheet t={t} onPick={submit} onClose={() => setReasonOpen(false)} />
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}
