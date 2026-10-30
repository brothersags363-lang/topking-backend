import React, { useEffect, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator, Linking,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  doc, collection, query, where, onSnapshot, getDoc, getDocs, setDoc, deleteDoc, updateDoc,
  writeBatch, increment, serverTimestamp, deleteField,
} from "firebase/firestore";
import { auth, db } from "./firebaseConfig";
import { useLiveHost } from "../components/liveHosts";
import {
  Y, MAX_MEMBERS, DEFAULT_AVATAR, toMs, remainingText, fmtPoints,
} from "../utils/familyUtils";
import UserTick from "../components/UserTick";

// Users doc me photo ka field `profileImg` hai (photoURL nahi) - isliye har member ka
// live user doc padhte hain taaki photo / naam / tick hamesha sahi dikhe.
function useUserLite(uid, fallback) {
  const [u, setU] = useState(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "users", uid), (s) => setU(s.exists() ? s.data() : null), () => {});
  }, [uid]);
  return {
    photo: (u && (u.profileImg || u.photoURL)) || fallback?.photoURL || fallback?.profileImg || DEFAULT_AVATAR,
    username: (u && u.username) || fallback?.username || "",
    name: (u && u.name) || fallback?.name || "",
    verified: u ? !!u.verified : !!fallback?.verified,
  };
}

// Join request ki row (leader ke liye)
function RequestRow({ r, onAccept, onReject }) {
  const info = useUserLite(r.userId, r);
  return (
    <View style={s.mRow}>
      <Image source={{ uri: info.photo }} style={[s.av, { marginRight: 12 }]} />
      <Text style={[s.mName, { flex: 1 }]} numberOfLines={1}>@{info.username || info.name}</Text>
      <TouchableOpacity style={s.accBtn} onPress={() => onAccept(r)}><Text style={s.accT}>Accept</Text></TouchableOpacity>
      <TouchableOpacity style={s.rejBtn} onPress={() => onReject(r)}><Text style={s.rejT}>Reject</Text></TouchableOpacity>
    </View>
  );
}

const ORANGE = "#ff8a1f";
const PURPLE = "#7b5cff";

// Ek member ki row: avatar (CHAT / PK / LIVE ring), naam + tick, points, Follow button
function MemberRow({ item, myUid, onOpen, onKick, canKick }) {
  const live = useLiveHost(item.uid);
  const info = useUserLite(item.uid, item);
  const [following, setFollowing] = useState(false);
  const isMe = myUid === item.uid;

  useEffect(() => {
    if (!myUid || isMe) return;
    return onSnapshot(doc(db, "follows", `${myUid}_${item.uid}`), (s) => setFollowing(s.exists()), () => {});
  }, [myUid, item.uid, isMe]);

  const toggleFollow = async () => {
    if (!myUid || isMe) return;
    const ref = doc(db, "follows", `${myUid}_${item.uid}`);
    try {
      if (following) await deleteDoc(ref);
      else await setDoc(ref, { followerId: myUid, followingId: item.uid });
    } catch (e) {}
  };

  // status: PK > LIVE (video) > CHAT (audio room)
  let tag = null;
  if (live) {
    if (live.pk || live.isPK) tag = { t: "PK", c: PURPLE, ring: PURPLE };
    else if (live.type === "audio") tag = { t: "CHAT", c: ORANGE, ring: ORANGE };
    else tag = { t: "LIVE", c: Y, ring: Y };
  }

  return (
    <TouchableOpacity style={s.mRow} activeOpacity={0.8} onPress={() => onOpen(item)}>
      <View style={s.avWrap}>
        <View style={[s.avRing, tag && { borderColor: tag.ring, borderWidth: 2.5 }]}>
          <Image source={{ uri: info.photo }} style={s.av} />
        </View>
        {tag && (
          <View style={[s.tag, { backgroundColor: tag.c }]}>
            <Text style={[s.tagT, tag.c === Y && { color: "#000" }]}>{tag.t}</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={s.mName} numberOfLines={1}>{info.username || info.name}</Text>
          <UserTick uid={item.uid} verified={!!info.verified} size={15} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
          <Text style={s.mPts}>🔥 {item.points || 0}</Text>
          <Ionicons name="caret-down" size={10} color="#888" style={{ marginLeft: 3 }} />
        </View>
      </View>
      {canKick && item.role !== "leader" && (
        <TouchableOpacity onPress={() => onKick(item)} style={{ padding: 6, marginRight: 4 }}>
          <Ionicons name="close-circle-outline" size={22} color="#e74c3c" />
        </TouchableOpacity>
      )}
      {!isMe && (
        <TouchableOpacity
          style={[s.followBtn, following && s.followBtnOn]}
          onPress={toggleFollow}
          activeOpacity={0.8}
        >
          <Text style={[s.followT, following && { color: "#ccc" }]}>{following ? "Following" : "Follow"}</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// Family ka rank (points ke hisaab se approved families me)
function useFamilyRank(fid, enabled) {
  const [rank, setRank] = useState(null);
  useEffect(() => {
    if (!fid || !enabled) return;
    let alive = true;
    getDocs(query(collection(db, "families"), where("status", "==", "approved")))
      .then((snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, points: d.data().points || 0 }))
          .sort((a, b) => b.points - a.points);
        const i = list.findIndex((f) => f.id === fid);
        if (alive) setRank(i >= 0 ? i + 1 : null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [fid, enabled]);
  return rank;
}

export default function FamilyDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets(); // navigation bar ke upar rakhne ke liye
  const { id } = useLocalSearchParams();
  const fid = Array.isArray(id) ? id[0] : id;
  const uid = auth.currentUser?.uid;

  const [fam, setFam] = useState(undefined); // undefined = loading, null = not found
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [me, setMe] = useState({});
  const [myReq, setMyReq] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!fid) return;
    const u1 = onSnapshot(doc(db, "families", fid), (s) => setFam(s.exists() ? { id: s.id, ...s.data() } : null), () => setFam(null));
    const u2 = onSnapshot(collection(db, "families", fid, "members"),
      (s) => setMembers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    return () => { u1(); u2(); };
  }, [fid]);

  useEffect(() => {
    if (!uid || !fid) return;
    const u1 = onSnapshot(doc(db, "users", uid), (s) => setMe(s.data() || {}), () => {});
    const u2 = onSnapshot(doc(db, "familyRequests", `${fid}_${uid}`), (s) => setMyReq(s.exists() ? s.data() : null), () => {});
    return () => { u1(); u2(); };
  }, [uid, fid]);

  const isLeader = fam && fam.leaderId === uid;
  const isMember = !!me.familyId && me.familyId === fid;
  const rank = useFamilyRank(fid, fam?.status === "approved");

  // leader ke liye pending join requests
  useEffect(() => {
    if (!isLeader || fam?.status !== "approved") return;
    return onSnapshot(
      query(collection(db, "familyRequests"), where("familyId", "==", fid), where("status", "==", "pending")),
      (s) => setRequests(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}
    );
  }, [isLeader, fam?.status, fid]);

  const apply = async () => {
    if (me.familyId) return Alert.alert("Pehle se family me ho", "Ek user ek hi family me reh sakta hai.");
    if ((fam.memberCount || 0) >= MAX_MEMBERS) return Alert.alert("Family full", "Is family me jagah nahi hai.");
    setBusy(true);
    try {
      await setDoc(doc(db, "familyRequests", `${fid}_${uid}`), {
        familyId: fid, familyName: fam.name, leaderId: fam.leaderId, userId: uid,
        username: me.username || "", name: me.name || "", photoURL: me.profileImg || me.photoURL || "", verified: !!me.verified,
        status: "pending", createdAt: serverTimestamp(),
      });
    } catch (e) { Alert.alert("Error", e.message); } finally { setBusy(false); }
  };

  const cancelApply = async () => { try { await deleteDoc(doc(db, "familyRequests", `${fid}_${uid}`)); } catch (e) {} };

  const accept = async (r) => {
    if ((fam.memberCount || 0) >= MAX_MEMBERS) return Alert.alert("Family full");
    try {
      const b = writeBatch(db);
      b.set(doc(db, "families", fid, "members", r.userId), {
        uid: r.userId, role: "member", username: r.username, name: r.name,
        photoURL: r.photoURL, verified: !!r.verified, points: 0, joinedAt: serverTimestamp(),
      });
      b.update(doc(db, "familyRequests", r.id), { status: "accepted" });
      b.update(doc(db, "families", fid), { memberCount: increment(1) });
      await b.commit();
    } catch (e) { Alert.alert("Error", e.message); }
  };

  const reject = async (r) => { try { await updateDoc(doc(db, "familyRequests", r.id), { status: "rejected" }); } catch (e) {} };

  const kick = (m) => Alert.alert("Remove member?", `@${m.username || m.name} ko family se hataye?`, [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: async () => {
      try {
        const b = writeBatch(db);
        b.delete(doc(db, "families", fid, "members", m.uid));
        b.update(doc(db, "families", fid), { memberCount: increment(-1) });
        b.update(doc(db, "familyRequests", `${fid}_${m.uid}`), { status: "removed" });
        await b.commit();
      } catch (e) { Alert.alert("Error", e.message); }
    } },
  ]);

  const leave = () => Alert.alert("Family chhodni hai?", "Aap is family se bahar ho jaoge.", [
    { text: "Cancel", style: "cancel" },
    { text: "Leave", style: "destructive", onPress: async () => {
      try {
        const b = writeBatch(db);
        b.delete(doc(db, "families", fid, "members", uid));
        b.update(doc(db, "families", fid), { memberCount: increment(-1) });
        b.update(doc(db, "users", uid), {
          familyId: deleteField(), familyName: deleteField(), familyLogo: deleteField(), familyRole: deleteField(),
        });
        b.update(doc(db, "familyRequests", `${fid}_${uid}`), { status: "left" });
        await b.commit();
      } catch (e) { Alert.alert("Error", e.message); }
    } },
  ]);

  if (fam === undefined) return <View style={s.center}><ActivityIndicator color={Y} /></View>;
  if (fam === null) return <View style={s.center}><Text style={{ color: "#aaa" }}>Family nahi mili</Text></View>;

  const leader = members.find((m) => m.role === "leader");
  const others = members
    .filter((m) => m.role !== "leader")
    .sort((a, b) => (b.points || 0) - (a.points || 0));
  const showMembers = fam.status === "approved";
  const openUser = (m) => router.push({ pathname: "/userProfile", params: { userId: m.uid } });

  const Banners = () => (
    <View>
      {fam.status === "pending" && (
        <View style={s.banner}>
          <Ionicons name="time-outline" size={20} color={Y} />
          <Text style={s.bannerT}>Review chal raha hai (72 ghante) · {remainingText(toMs(fam.reviewDeadline))}</Text>
        </View>
      )}
      {fam.status === "rejected" && (
        <View style={[s.banner, { backgroundColor: "#3a1515" }]}>
          <Text style={[s.bannerT, { color: "#ff8a8a" }]}>Request reject hui. {fam.rejectReason ? `Reason: ${fam.rejectReason}` : ""}</Text>
        </View>
      )}
      {fam.status === "disabled" && (
        <View style={[s.banner, { backgroundColor: "#3a1515" }]}>
          <Text style={[s.bannerT, { color: "#ff8a8a" }]}>Ye family admin ne band kar di hai.</Text>
        </View>
      )}
      {isLeader && requests.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={s.sec}>Join Requests ({requests.length})</Text>
          {requests.map((r) => (
            <RequestRow key={r.id} r={r} onAccept={accept} onReject={reject} />
          ))}
        </View>
      )}
    </View>
  );

  let action = null;
  if (fam.status === "approved") {
    if (isMember && !isLeader) action = <TouchableOpacity style={[s.cta, s.ctaGhost]} onPress={leave}><Text style={[s.ctaT, { color: "#ff6b6b" }]}>Leave Family</Text></TouchableOpacity>;
    else if (!isMember && !isLeader) {
      if (myReq?.status === "pending")
        action = <TouchableOpacity style={[s.cta, s.ctaGhost]} onPress={cancelApply}><Text style={[s.ctaT, { color: "#fff" }]}>Request Sent · Cancel</Text></TouchableOpacity>;
      else if (me.familyId) action = null;
      else action = <TouchableOpacity style={s.cta} onPress={apply} disabled={busy}>{busy ? <ActivityIndicator color="#000" /> : <Text style={s.ctaT}>Apply to join</Text>}</TouchableOpacity>;
    }
  }

  return (
    <View style={s.container}>
      {/* ===== Upar ka blurred header: logo, naam, (members/100), slogan, rank, points ===== */}
      <View style={s.headBg}>
        <Image source={{ uri: fam.logo || DEFAULT_AVATAR }} style={s.headBlur} blurRadius={40} />
        <View style={s.headDim} />
        <SafeAreaView edges={["top", "left", "right"]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-down" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={s.headRow}>
            <Image source={{ uri: fam.logo || DEFAULT_AVATAR }} style={s.heroLogo} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.fName} numberOfLines={1}>{fam.name}</Text>
              <Text style={s.fCount}>({fam.memberCount || 1}/{MAX_MEMBERS})</Text>
              {!!fam.slogan && <Text style={s.fSlogan} numberOfLines={3}>{fam.slogan}</Text>}
              {!!fam.contact && (isLeader || isMember) && <Text style={s.fSlogan} numberOfLines={1}>{fam.contact}</Text>}
            </View>
          </View>

          <View style={s.rankRow}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="stats-chart" size={16} color="#fff" />
              <Text style={s.rankT}>{rank ? ` No.${rank}` : " --"}</Text>
              <Ionicons name="chevron-forward" size={16} color="#ddd" />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={s.ptsT}>🔥 {fmtPoints(fam.points)} Points</Text>
              <Ionicons name="caret-down" size={11} color="#ddd" style={{ marginLeft: 3 }} />
            </View>
          </View>
        </SafeAreaView>
      </View>

      {/* ===== Neeche dark sheet: Leader + Members ===== */}
      <View style={s.sheet}>
        <FlatList
          data={showMembers ? others : []}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <MemberRow item={item} myUid={uid} onOpen={openUser} onKick={kick} canKick={isLeader} />
          )}
          ListHeaderComponent={
            <View>
              <Banners />
              {showMembers && !!leader && (
                <View>
                  <Text style={s.sec}>Leader</Text>
                  <MemberRow item={leader} myUid={uid} onOpen={openUser} onKick={kick} canKick={false} />
                </View>
              )}
              {showMembers && others.length > 0 && <Text style={s.sec}>Members</Text>}
            </View>
          }
          contentContainerStyle={{ paddingTop: 14, paddingBottom: 110 + insets.bottom }}
        />
        {action && <View style={[s.footer, { paddingBottom: 14 + insets.bottom }]}>{action}</View>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#6b6b6b" },
  center: { flex: 1, backgroundColor: "#0f0f0f", alignItems: "center", justifyContent: "center" },

  headBg: { backgroundColor: "#8a8a8a", paddingBottom: 26 },
  headBlur: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%", opacity: 0.55 },
  headDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(120,120,120,0.55)" },
  backBtn: { padding: 12, alignSelf: "flex-start" },
  headRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 18, marginTop: 4 },
  heroLogo: { width: 92, height: 92, borderRadius: 18, backgroundColor: "#fff" },
  fName: { color: "#fff", fontSize: 24, fontWeight: "800" },
  fCount: { color: "#eee", fontSize: 13, marginTop: 2 },
  fSlogan: { color: "#f2f2f2", fontSize: 13, marginTop: 6, lineHeight: 18 },
  rankRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginTop: 20 },
  rankT: { color: "#fff", fontSize: 16, fontWeight: "800" },
  ptsT: { color: "#fff", fontSize: 16, fontWeight: "800" },

  sheet: { flex: 1, backgroundColor: "#0c0c0c", borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -16, overflow: "hidden" },
  sec: { color: "#fff", fontSize: 17, fontWeight: "800", marginHorizontal: 18, marginTop: 8, marginBottom: 4 },

  mRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 10 },
  avWrap: { marginRight: 14 },
  avRing: { width: 60, height: 60, borderRadius: 30, borderWidth: 0, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  av: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#222" },
  tag: { position: "absolute", bottom: -2, alignSelf: "center", borderRadius: 9, paddingHorizontal: 6, paddingVertical: 1 },
  tagT: { color: "#fff", fontSize: 9, fontWeight: "900" },
  mName: { color: "#fff", fontWeight: "800", fontSize: 16, flexShrink: 1 },
  mPts: { color: "#bbb", fontSize: 13, fontWeight: "600" },
  followBtn: { backgroundColor: Y, borderRadius: 14, minWidth: 84, paddingHorizontal: 14, paddingVertical: 9, alignItems: "center" },
  followBtnOn: { backgroundColor: "#2a2a2a" },
  followT: { color: "#000", fontWeight: "800", fontSize: 14 },

  banner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#2a2500", marginHorizontal: 14, borderRadius: 12, padding: 12 },
  bannerT: { color: Y, flex: 1, fontSize: 13, fontWeight: "600" },
  accBtn: { backgroundColor: Y, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6 },
  accT: { color: "#000", fontWeight: "800", fontSize: 12 },
  rejBtn: { backgroundColor: "#2a2a2a", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  rejT: { color: "#fff", fontWeight: "700", fontSize: 12 },

  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, backgroundColor: "rgba(12,12,12,0.97)" },
  cta: { backgroundColor: Y, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  ctaGhost: { backgroundColor: "#262626" },
  ctaT: { color: "#000", fontSize: 17, fontWeight: "800" },
});
