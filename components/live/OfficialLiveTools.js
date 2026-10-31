// components/live/OfficialLiveTools.js
// Live room ke ANDAR hi Official / Admin ke liye moderation panel.
//
//   🛡 floating button (sirf Official / Admin ko dikhta hai)  ->  panel khulta hai:
//     • "Is live ka host" card  + "Is live ko band karo" button
//     • Search (username ya uid)  ->  user card
//     • User card actions:  ID ban/unban · DEVICE ban/unban · Live ban / Entry ban (days) · User ki live band
//
// Asli permission check SERVER par hota hai (/official/* routes, requireOfficialOrAdmin).
// Ye component sirf UI hai - non-official ko button dikhta hi nahi.
//
// Use (kisi bhi live screen me, root <View> ke andar sabse neeche):
//   <OfficialLiveTools roomId={roomId} hostId={roomData?.hostId} />
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { auth } from "../../app/firebaseConfig";
import useIsOfficial from "../../app/useIsOfficial";
import useIsAdmin from "../../app/useIsAdmin";
import { callApi } from "../../utils/api";

const AVATAR = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
const DAYS = [1, 3, 7, 15, 30];

// ---------- chhote UI parts ----------
function Chip({ label, onPress, color = "#2a2a2a", textColor = "#fff", disabled, busy }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.8}
      style={{
        backgroundColor: color,
        paddingHorizontal: 11,
        paddingVertical: 8,
        borderRadius: 10,
        marginRight: 6,
        marginBottom: 6,
        opacity: disabled ? 0.35 : 1,
        minWidth: 44,
        alignItems: "center",
      }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <Text style={{ color: textColor, fontSize: 12.5, fontWeight: "700" }}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

function Badge({ text, color }) {
  return (
    <View style={{ backgroundColor: color, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginRight: 5 }}>
      <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{text}</Text>
    </View>
  );
}

function RestrictRow({ title, onPick, busy }) {
  return (
    <View style={{ marginTop: 6 }}>
      <Text style={{ color: "#aaa", fontSize: 11.5, marginBottom: 4 }}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {DAYS.map((d) => (
          <Chip key={d} label={`${d}d`} onPress={() => onPick(d)} busy={busy} color="#3a2a1a" />
        ))}
        <Chip label="Hatao" onPress={() => onPick(0)} busy={busy} color="#1d3a28" />
      </View>
    </View>
  );
}

// ---------- ek user ka card ----------
function UserCard({ u, myUid, currentRoomId, onChanged, onEndedCurrent }) {
  const [busy, setBusy] = useState("");
  const [showRestrict, setShowRestrict] = useState(false);

  const isSelf = u.uid === myUid;
  const isStaff = u.isOfficial === true;
  const locked = isSelf || isStaff;
  const name = u.username ? "@" + u.username : u.name || "user";

  const run = useCallback(
    async (key, path, body, okMsg) => {
      if (busy) return;
      setBusy(key);
      try {
        const res = await callApi(path, body);
        if (key === "end" && res && res.ended && currentRoomId && u.liveRoomId === currentRoomId) {
          onEndedCurrent && onEndedCurrent();
        }
        onChanged && onChanged(u.uid);
        if (okMsg) Alert.alert("Done ✅", okMsg);
      } catch (e) {
        Alert.alert("Nahi hua", (e && e.message) || "Request failed");
      } finally {
        setBusy("");
      }
    },
    [busy, u.uid, u.liveRoomId, currentRoomId, onChanged, onEndedCurrent]
  );

  const confirm = (title, msg, destructive, onYes) =>
    Alert.alert(title, msg, [
      { text: "Cancel", style: "cancel" },
      { text: "Haan", style: destructive ? "destructive" : "default", onPress: onYes },
    ]);

  const toggleIdBan = () => {
    const ban = !u.banned;
    confirm(
      ban ? "ID ban karein?" : "ID unban karein?",
      `${name} ${ban ? "ka account band ho jayega (login nahi kar payega)." : "wapas chalu ho jayega."}`,
      ban,
      () =>
        run("id", ban ? "/official/ban-user" : "/official/unban-user", { uid: u.uid }, ban ? "ID ban ho gayi" : "ID unban ho gayi")
    );
  };

  const toggleDeviceBan = () => {
    const ban = !u.deviceBanned;
    confirm(
      ban ? "DEVICE ban karein?" : "DEVICE unban karein?",
      ban
        ? `${name} ka phone band ho jayega. Us phone par jo bhi account login hue (naye bhi) sab band ho jayenge.`
        : `${name} ka device aur us par ke accounts wapas chalu ho jayenge.`,
      ban,
      () =>
        run(
          "dev",
          ban ? "/official/ban-device" : "/official/unban-device",
          { uid: u.uid, reason: "Official: live moderation" },
          ban ? "Device ban ho gaya" : "Device unban ho gaya"
        )
    );
  };

  const endLive = () =>
    confirm(
      "Live band karein? 🔴",
      `${name} ki live sabke liye turant band ho jayegi.`,
      true,
      () => run("end", "/official/end-live", { roomId: u.liveRoomId, uid: u.uid }, "Live band ho gayi")
    );

  const restrict = (field, days) => {
    const label = field === "liveDays" ? "Live chalane par" : "Live dekhne par";
    confirm(
      days === 0 ? "Pabandi hatayein?" : "Pabandi lagayein?",
      days === 0 ? `${name} par se ${label} ki pabandi hat jayegi.` : `${name} ko ${days} din tak ${label} pabandi lagegi.`,
      days !== 0,
      () => run("res", "/official/live-restrict", { uid: u.uid, [field]: days }, days === 0 ? "Pabandi hat gayi" : `${days} din ki pabandi lag gayi`)
    );
  };

  return (
    <View style={{ backgroundColor: "#171717", borderRadius: 14, padding: 12, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Image
          source={{ uri: u.profileImg || AVATAR }}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#333" }}
        />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }} numberOfLines={1}>
            {name}
          </Text>
          <Text style={{ color: "#888", fontSize: 11 }} numberOfLines={1}>
            Lv {u.level || 1} · {u.uid}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
            {!!u.liveRoomId && <Badge text="LIVE" color="#e11d48" />}
            {u.banned && <Badge text="ID BANNED" color="#7f1d1d" />}
            {u.deviceBanned && <Badge text="DEVICE BANNED" color="#7f1d1d" />}
            {!!u.liveBanUntil && <Badge text="LIVE BAN" color="#92400e" />}
            {!!u.entryBanUntil && <Badge text="ENTRY BAN" color="#92400e" />}
            {isStaff && <Badge text="OFFICIAL" color="#1d4ed8" />}
          </View>
        </View>
      </View>

      {locked ? (
        <Text style={{ color: "#777", fontSize: 12, marginTop: 10 }}>
          {isSelf ? "Ye aap khud ho." : "Official / Admin par action nahi ho sakta."}
        </Text>
      ) : (
        <View style={{ marginTop: 10 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <Chip
              label={u.banned ? "✅ ID Unban" : "🚫 ID Ban"}
              onPress={toggleIdBan}
              busy={busy === "id"}
              color={u.banned ? "#166534" : "#991b1b"}
            />
            <Chip
              label={u.deviceBanned ? "✅ Device Unban" : "📵 Device Ban"}
              onPress={toggleDeviceBan}
              busy={busy === "dev"}
              disabled={!u.deviceKnown && !u.deviceBanned}
              color={u.deviceBanned ? "#166534" : "#7c2d12"}
            />
            {!!u.liveRoomId && <Chip label="🔴 Live band" onPress={endLive} busy={busy === "end"} color="#be123c" />}
            <Chip label={showRestrict ? "▲ Pabandi" : "⏱ Pabandi"} onPress={() => setShowRestrict((v) => !v)} />
          </View>
          {!u.deviceKnown && !u.deviceBanned && (
            <Text style={{ color: "#777", fontSize: 11, marginTop: 2 }}>
              Device ban tab hoga jab user ne updated app ek baar khol li ho.
            </Text>
          )}
          {showRestrict && (
            <View>
              <RestrictRow title="Live CHALANE par pabandi" onPick={(d) => restrict("liveDays", d)} busy={busy === "res"} />
              <RestrictRow title="Live DEKHNE (entry) par pabandi" onPick={(d) => restrict("entryDays", d)} busy={busy === "res"} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ---------- main component ----------
export default function OfficialLiveTools({ roomId, hostId, onLiveEnded }) {
  const isOfficial = useIsOfficial();
  const isAdmin = useIsAdmin();
  const allowed = isOfficial === true || isAdmin === true;

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [hostUser, setHostUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [endingRoom, setEndingRoom] = useState(false);
  const seqRef = useRef(0);
  const myUid = auth && auth.currentUser ? auth.currentUser.uid : "";

  const search = useCallback(async (text) => {
    const term = String(text || "").trim();
    const seq = ++seqRef.current;
    if (!term) {
      setUsers([]);
      setSearchErr("");
      setLoading(false);
      return [];
    }
    setLoading(true);
    try {
      const res = await callApi("/official/live-search", { q: term });
      if (seq !== seqRef.current) return [];
      setUsers(res.users || []);
      setSearchErr(res.users && res.users.length ? "" : "Koi user nahi mila");
      return res.users || [];
    } catch (e) {
      if (seq === seqRef.current) setSearchErr((e && e.message) || "Search fail");
      return [];
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  // typing ke 400ms baad search
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => search(q), 400);
    return () => clearTimeout(t);
  }, [q, open, search]);

  const loadHost = useCallback(async () => {
    if (!hostId) return setHostUser(null);
    try {
      const res = await callApi("/official/live-search", { q: hostId });
      setHostUser((res.users || []).find((x) => x.uid === hostId) || null);
    } catch (_) {
      setHostUser(null);
    }
  }, [hostId]);

  useEffect(() => {
    if (open) loadHost();
  }, [open, loadHost]);

  // ek action ke baad us user ka card taaza karo
  const refreshOne = useCallback(
    async (uid) => {
      try {
        const res = await callApi("/official/live-search", { q: uid });
        const fresh = (res.users || []).find((x) => x.uid === uid);
        if (!fresh) return;
        setUsers((list) => list.map((x) => (x.uid === uid ? fresh : x)));
        setHostUser((h) => (h && h.uid === uid ? fresh : h));
      } catch (_) {}
    },
    []
  );

  const endThisLive = () =>
    Alert.alert("Is live ko band karein? 🔴", "Host + sab viewers turant bahar ho jayenge.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Live band karo",
        style: "destructive",
        onPress: async () => {
          if (endingRoom) return;
          setEndingRoom(true);
          try {
            await callApi("/official/end-live", { roomId });
            setOpen(false);
            onLiveEnded && onLiveEnded();
          } catch (e) {
            Alert.alert("Nahi hua", (e && e.message) || "Request failed");
          } finally {
            setEndingRoom(false);
          }
        },
      },
    ]);

  if (!allowed) return null;

  const hostIsMe = hostId && hostId === myUid;

  return (
    <>
      {/* floating shield button - sirf Official / Admin ko */}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        style={{
          position: "absolute",
          left: 6,
          top: "36%",
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: "rgba(190,18,60,0.88)",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          elevation: 30,
        }}
      >
        <Ionicons name="shield-checkmark" size={21} color="#fff" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setOpen(false)} />
          <View
            style={{
              backgroundColor: "#0e0e0e",
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              padding: 14,
              paddingBottom: Platform.OS === "android" ? 46 : 28,
              maxHeight: "86%",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <Ionicons name="shield-checkmark" size={20} color="#fb7185" />
              <Text style={{ color: "#fff", fontSize: 17, fontWeight: "800", marginLeft: 8, flex: 1 }}>
                Official Tools
              </Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color="#aaa" />
              </TouchableOpacity>
            </View>

            {/* search */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#1c1c1c",
                borderRadius: 12,
                paddingHorizontal: 10,
                marginBottom: 10,
              }}
            >
              <Ionicons name="search" size={18} color="#888" />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Username ya user ID search karo"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, color: "#fff", paddingVertical: 11, paddingHorizontal: 8, fontSize: 14 }}
              />
              {loading ? <ActivityIndicator size="small" color="#fb7185" /> : null}
            </View>

            <FlatList
              data={q.trim() ? users : []}
              keyExtractor={(x) => x.uid}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                !q.trim() ? (
                  <View>
                    <Text style={{ color: "#fb7185", fontSize: 12, fontWeight: "800", marginBottom: 6 }}>
                      IS LIVE KA HOST
                    </Text>
                    {hostUser ? (
                      <UserCard
                        u={hostUser}
                        myUid={myUid}
                        currentRoomId={roomId}
                        onChanged={refreshOne}
                        onEndedCurrent={() => {
                          setOpen(false);
                          onLiveEnded && onLiveEnded();
                        }}
                      />
                    ) : (
                      <Text style={{ color: "#666", marginBottom: 10 }}>Host load ho raha hai…</Text>
                    )}
                    {!hostIsMe && (
                      <TouchableOpacity
                        onPress={endThisLive}
                        disabled={endingRoom}
                        activeOpacity={0.85}
                        style={{
                          backgroundColor: "#be123c",
                          borderRadius: 12,
                          paddingVertical: 13,
                          alignItems: "center",
                          marginBottom: 6,
                          opacity: endingRoom ? 0.6 : 1,
                        }}
                      >
                        {endingRoom ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>🔴 Is live ko abhi band karo</Text>
                        )}
                      </TouchableOpacity>
                    )}
                    <Text style={{ color: "#666", fontSize: 12, marginTop: 6 }}>
                      Kisi aur ko ban karna ho to upar search karo.
                    </Text>
                  </View>
                ) : null
              }
              ListEmptyComponent={
                q.trim() && !loading ? (
                  <Text style={{ color: "#777", textAlign: "center", marginTop: 18 }}>{searchErr || ""}</Text>
                ) : null
              }
              renderItem={({ item }) => (
                <UserCard
                  u={item}
                  myUid={myUid}
                  currentRoomId={roomId}
                  onChanged={refreshOne}
                  onEndedCurrent={() => {
                    setOpen(false);
                    onLiveEnded && onLiveEnded();
                  }}
                />
              )}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
