import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  BackHandler,
} from "react-native";
import { useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebaseConfig";
import { callApi } from "../utils/api";
import useIsAdmin from "./useIsAdmin";
import { formatBanUntil, banDaysLeft } from "../utils/liveBan";

const PLACEHOLDER = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
const DAY_OPTIONS = [1, 3, 7, 15, 30];

// null = checking, true / false
function useIsOfficial() {
  const [isOfficial, setIsOfficial] = useState(null);
  useEffect(() => {
    let active = true;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      if (!user) {
        setIsOfficial(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (active) setIsOfficial(snap.exists() && snap.data().isOfficial === true);
      } catch (_) {
        if (active) setIsOfficial(false);
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);
  return isOfficial;
}

// Official panel: BD add, agency do, ID ban, live entry ban, live start ban.
// Asli permission server check karta hai. Ye screen sirf UI hai.
export default function OfficialPanel() {
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const isOfficial = useIsOfficial();

  const [tab, setTab] = useState("users"); // users | bans
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [bans, setBans] = useState([]);
  const [bansLoading, setBansLoading] = useState(false);

  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [agencyMode, setAgencyMode] = useState(false);
  const [agencyName, setAgencyName] = useState("");
  const [ownerName, setOwnerName] = useState("");

  const lastQueryRef = useRef("");

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selected) {
        setSelected(null);
        setAgencyMode(false);
        return true;
      }
      router.back();
      return true;
    });
    return () => sub.remove();
  }, [router, selected]);

  const runSearch = useCallback(async (text) => {
    const q = String(text || "").trim().replace(/^@/, "");
    if (!q) return [];
    lastQueryRef.current = q;
    const res = await callApi("/official/search-users", { q });
    return res.users || [];
  }, []);

  const doSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      setUsers(await runSearch(query));
      setSearched(true);
    } catch (e) {
      Alert.alert("Error", e.message || "Search nahi hua");
    } finally {
      setSearching(false);
    }
  };

  const loadBans = useCallback(async () => {
    setBansLoading(true);
    try {
      const res = await callApi("/official/list-live-bans", {});
      setBans(res.bans || []);
    } catch (e) {
      Alert.alert("Error", e.message || "Ban list load nahi hui");
    } finally {
      setBansLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "bans" && (isAdmin === true || isOfficial === true)) loadBans();
  }, [tab, isAdmin, isOfficial, loadBans]);

  // action ke baad selected user ko taza karo
  const refreshSelected = async (uid, username) => {
    try {
      const list = await runSearch(username);
      const fresh = list.find((u) => u.uid === uid);
      if (fresh) {
        setSelected(fresh);
        setUsers((prev) => prev.map((u) => (u.uid === uid ? fresh : u)));
      }
    } catch (_) {}
  };

  const act = async (path, body, okMsg) => {
    if (busy || !selected) return;
    setBusy(true);
    try {
      await callApi(path, body);
      if (okMsg) Alert.alert("Done", okMsg);
      await refreshSelected(selected.uid, selected.username);
      if (tab === "bans") loadBans();
    } catch (e) {
      Alert.alert("Error", e.message || "Action nahi hua");
    } finally {
      setBusy(false);
    }
  };

  const confirm = (title, msg, onYes) =>
    Alert.alert(title, msg, [
      { text: "Cancel", style: "cancel" },
      { text: "Haan", style: "destructive", onPress: onYes },
    ]);

  const makeBD = () =>
    confirm("BD banao?", `${selected.username} ko BD banana hai?`, () =>
      act("/official/add-bd", { uid: selected.uid }, "BD add ho gaya.")
    );

  const toggleBan = () => {
    if (selected.banned) {
      act("/official/unban-user", { uid: selected.uid }, "ID unban ho gayi.");
    } else {
      confirm("ID ban karni hai?", `${selected.username} ki ID band ho jayegi aur wo logout ho jayega.`, () =>
        act("/official/ban-user", { uid: selected.uid }, "ID ban ho gayi.")
      );
    }
  };

  const setRestrict = (kind, days) => {
    const key = kind === "entry" ? "entryDays" : "liveDays";
    const label = kind === "entry" ? "Live room entry" : "Live chalana";
    if (days === 0) {
      act("/official/live-restrict", { uid: selected.uid, [key]: 0 }, `${label} ka ban hata diya.`);
      return;
    }
    confirm(
      `${label} band karna hai?`,
      `${selected.username} ka ${label.toLowerCase()} ${days} din ke liye band hoga.`,
      () =>
        act("/official/live-restrict", { uid: selected.uid, [key]: days }, `${label} ${days} din ke liye band.`)
    );
  };

  const openAgencyForm = () => {
    setAgencyName("");
    setOwnerName(selected.name || selected.username || "");
    setAgencyMode(true);
  };

  const giveAgency = async () => {
    const n = agencyName.trim();
    if (!n) {
      Alert.alert("Agency ka naam daalo");
      return;
    }
    await act(
      "/official/create-agency",
      { uid: selected.uid, agencyName: n, ownerName: ownerName.trim() },
      "Agency de di gayi."
    );
    setAgencyMode(false);
  };

  const closeModal = () => {
    setSelected(null);
    setAgencyMode(false);
  };

  if (isAdmin === null || isOfficial === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#FFD700" />
      </View>
    );
  }
  if (!isAdmin && !isOfficial) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "red", fontSize: 20 }}>Access Denied</Text>
      </View>
    );
  }

  const DayChips = ({ kind, active }) => (
    <View style={styles.chipRow}>
      {DAY_OPTIONS.map((d) => (
        <TouchableOpacity
          key={d}
          disabled={busy}
          style={[styles.chip, busy && { opacity: 0.5 }]}
          onPress={() => setRestrict(kind, d)}
        >
          <Text style={styles.chipText}>{d} din</Text>
        </TouchableOpacity>
      ))}
      {active > 0 && (
        <TouchableOpacity
          disabled={busy}
          style={[styles.chip, styles.chipLift, busy && { opacity: 0.5 }]}
          onPress={() => setRestrict(kind, 0)}
        >
          <Text style={styles.chipText}>Hatao</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Official Panel</Text>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === "users" && styles.tabOn]}
          onPress={() => setTab("users")}
        >
          <Text style={[styles.tabText, tab === "users" && styles.tabTextOn]}>Users</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "bans" && styles.tabOn]}
          onPress={() => setTab("bans")}
        >
          <Text style={[styles.tabText, tab === "bans" && styles.tabTextOn]}>Live Bans</Text>
        </TouchableOpacity>
      </View>

      {tab === "users" ? (
        <>
          <View style={styles.searchRow}>
            <TextInput
              placeholder="Username search karo"
              placeholderTextColor="#777"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={doSearch}
              returnKeyType="search"
              autoCapitalize="none"
              style={styles.input}
            />
            <TouchableOpacity style={styles.searchBtn} onPress={doSearch}>
              <Text style={styles.searchText}>Search</Text>
            </TouchableOpacity>
          </View>

          {searching ? (
            <ActivityIndicator color="#FFD700" style={{ marginTop: 30 }} />
          ) : (
            <FlatList
              data={users}
              keyExtractor={(i) => i.uid}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.empty}>{searched ? "Koi user nahi mila" : "Username likh kar search karo"}</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
                  <Image source={{ uri: item.profileImg || PLACEHOLDER }} style={styles.avatar} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.username}
                    </Text>
                    <Text style={styles.info} numberOfLines={1}>
                      Lv {item.level}
                      {item.isBD ? " • BD" : ""}
                      {item.agencyName ? ` • ${item.agencyName}` : ""}
                    </Text>
                  </View>
                  {item.banned && <Text style={styles.flagRed}>BANNED</Text>}
                  {(item.entryBanUntil > 0 || item.liveBanUntil > 0) && <Text style={styles.flagOrange}>LIVE BAN</Text>}
                </TouchableOpacity>
              )}
            />
          )}
        </>
      ) : bansLoading ? (
        <ActivityIndicator color="#FFD700" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={bans}
          keyExtractor={(i) => i.uid}
          ListEmptyComponent={<Text style={styles.empty}>Abhi koi live ban nahi hai</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={async () => {
                try {
                  const list = await runSearch(item.username);
                  const u = list.find((x) => x.uid === item.uid);
                  if (u) setSelected(u);
                } catch (e) {
                  Alert.alert("Error", e.message || "User load nahi hua");
                }
              }}
            >
              <Image source={{ uri: item.profileImg || PLACEHOLDER }} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.username}
                </Text>
                {item.entryBanUntil > 0 && (
                  <Text style={styles.info}>Entry band: {banDaysLeft(item.entryBanUntil)} din baaki</Text>
                )}
                {item.liveBanUntil > 0 && (
                  <Text style={styles.info}>Live band: {banDaysLeft(item.liveBanUntil)} din baaki</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalBg}>
          <View style={styles.popup}>
            {selected && (
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={styles.userHead}>
                  <Image source={{ uri: selected.profileImg || PLACEHOLDER }} style={styles.avatarBig} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.popupName} numberOfLines={1}>
                      {selected.username}
                    </Text>
                    <Text style={styles.info}>
                      Lv {selected.level}
                      {selected.isBD ? " • BD" : ""}
                      {selected.agencyName ? ` • ${selected.agencyName}` : ""}
                    </Text>
                    {selected.banned && <Text style={styles.flagRed}>ID BANNED</Text>}
                  </View>
                </View>

                {busy && <ActivityIndicator color="#FFD700" style={{ marginBottom: 8 }} />}

                {agencyMode ? (
                  <View>
                    <Text style={styles.section}>Agency do</Text>
                    <TextInput
                      placeholder="Agency ka naam"
                      placeholderTextColor="#888"
                      value={agencyName}
                      onChangeText={setAgencyName}
                      style={styles.formInput}
                    />
                    <TextInput
                      placeholder="Owner ka naam"
                      placeholderTextColor="#888"
                      value={ownerName}
                      onChangeText={setOwnerName}
                      style={styles.formInput}
                    />
                    <View style={styles.btnRow}>
                      <TouchableOpacity style={[styles.btn, styles.btnGreen]} disabled={busy} onPress={giveAgency}>
                        <Text style={styles.btnText}>Agency do</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.btn, styles.btnGrey]} onPress={() => setAgencyMode(false)}>
                        <Text style={styles.btnText}>Back</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={styles.btnRow}>
                      {!selected.isBD && (
                        <TouchableOpacity style={[styles.btn, styles.btnOrange]} disabled={busy} onPress={makeBD}>
                          <Text style={styles.btnText}>BD banao</Text>
                        </TouchableOpacity>
                      )}
                      {!selected.agencyName && (
                        <TouchableOpacity style={[styles.btn, styles.btnBlue]} disabled={busy} onPress={openAgencyForm}>
                          <Text style={styles.btnText}>Agency do</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.btn, selected.banned ? styles.btnGreen : styles.btnRed]}
                        disabled={busy}
                        onPress={toggleBan}
                      >
                        <Text style={styles.btnText}>{selected.banned ? "ID Unban" : "ID Ban"}</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.section}>
                      Live room entry band
                      {selected.entryBanUntil > 0 ? `  (${formatBanUntil(selected.entryBanUntil)} tak)` : ""}
                    </Text>
                    <DayChips kind="entry" active={selected.entryBanUntil} />

                    <Text style={styles.section}>
                      Live chalana band
                      {selected.liveBanUntil > 0 ? `  (${formatBanUntil(selected.liveBanUntil)} tak)` : ""}
                    </Text>
                    <DayChips kind="live" active={selected.liveBanUntil} />
                  </>
                )}

                <TouchableOpacity style={[styles.btn, styles.btnGrey, { marginTop: 14 }]} onPress={closeModal}>
                  <Text style={styles.btnText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", paddingTop: 50, paddingHorizontal: 14 },
  center: { flex: 1, backgroundColor: "#111", justifyContent: "center", alignItems: "center" },
  title: { color: "#fff", fontSize: 22, fontWeight: "bold", marginBottom: 12 },
  tabs: { flexDirection: "row", marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 8, alignItems: "center", backgroundColor: "#222", marginRight: 6, borderRadius: 8 },
  tabOn: { backgroundColor: "#FFD700" },
  tabText: { color: "#ccc", fontWeight: "bold", fontSize: 13 },
  tabTextOn: { color: "#000" },
  searchRow: { flexDirection: "row", marginBottom: 12 },
  input: {
    flex: 1,
    backgroundColor: "#222",
    color: "#fff",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
    fontSize: 14,
  },
  searchBtn: { backgroundColor: "#FFD700", paddingHorizontal: 14, borderRadius: 8, justifyContent: "center" },
  searchText: { color: "#000", fontWeight: "bold", fontSize: 13 },
  empty: { color: "#888", textAlign: "center", marginTop: 40 },
  card: {
    backgroundColor: "#1d1d1d",
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: { width: 38, height: 38, borderRadius: 19, marginRight: 10, backgroundColor: "#333" },
  name: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  info: { color: "#aaa", fontSize: 12, marginTop: 1 },
  flagRed: { color: "#ff5252", fontSize: 11, fontWeight: "bold", marginLeft: 6 },
  flagOrange: { color: "#ffa726", fontSize: 11, fontWeight: "bold", marginLeft: 6 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", alignItems: "center" },
  popup: { width: "92%", maxHeight: "85%", backgroundColor: "#222", borderRadius: 16, padding: 14 },
  userHead: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  avatarBig: { width: 48, height: 48, borderRadius: 24, marginRight: 12, backgroundColor: "#333" },
  popupName: { color: "#fff", fontSize: 17, fontWeight: "bold" },
  section: { color: "#ddd", fontSize: 13, fontWeight: "bold", marginTop: 12, marginBottom: 6 },
  btnRow: { flexDirection: "row", flexWrap: "wrap" },
  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginRight: 6, marginBottom: 6, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  btnOrange: { backgroundColor: "#e67e22" },
  btnBlue: { backgroundColor: "#2980b9" },
  btnRed: { backgroundColor: "#c0392b" },
  btnGreen: { backgroundColor: "#00aa55" },
  btnGrey: { backgroundColor: "#555" },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { backgroundColor: "#8e44ad", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, marginRight: 6, marginBottom: 6 },
  chipLift: { backgroundColor: "#00aa55" },
  chipText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  formInput: {
    backgroundColor: "#333",
    color: "#fff",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    fontSize: 14,
  },
});
