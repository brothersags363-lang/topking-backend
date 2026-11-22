import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { db } from "./firebaseConfig";
import useIsAdmin from "./useIsAdmin";

const LIMIT = 1000; // sabse naye 1000 record

const fmtDate = (ms) =>
  ms
    ? new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "-";
const fmtTime = (ms) =>
  ms
    ? new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
    : "";
const num = (n) => Number(n || 0).toLocaleString("en-IN");

export default function StarGrants() {
  const isAdmin = useIsAdmin();
  const [rows, setRows] = useState(null);
  const [adminNames, setAdminNames] = useState({});
  const [tab, setTab] = useState("history"); // history | users
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, "starGrants"), orderBy("createdAt", "desc"), limit(LIMIT));
    return onSnapshot(
      q,
      (snap) => {
        setErr("");
        setRows(
          snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              ...x,
              ms: x.createdAt?.toMillis ? x.createdAt.toMillis() : 0,
            };
          })
        );
      },
      (e) => {
        console.log("starGrants error", e?.code, e?.message);
        setErr(
          e?.code === "permission-denied"
            ? "Permission nahi mili. Firestore Rules me admin ko starGrants read ki permission do."
            : "Record load nahi hua, dobara try karo"
        );
        setRows([]);
      }
    );
  }, [isAdmin]);

  // admin ke naam (adminId -> username)
  useEffect(() => {
    if (!rows) return;
    const need = Array.from(new Set(rows.map((r) => r.adminId).filter(Boolean))).filter(
      (id) => !(id in adminNames)
    );
    if (!need.length) return;
    let alive = true;
    (async () => {
      const out = {};
      for (const id of need) {
        try {
          const s = await getDoc(doc(db, "users", id));
          out[id] = (s.exists() && s.data().username) || id.slice(0, 6);
        } catch {
          out[id] = id.slice(0, 6);
        }
      }
      if (alive) setAdminNames((p) => ({ ...p, ...out }));
    })();
    return () => {
      alive = false;
    };
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const s = search.trim().toLowerCase().replace(/^@/, "");
    if (!s) return rows;
    return rows.filter(
      (r) =>
        (r.username || "").toLowerCase().includes(s) ||
        (adminNames[r.adminId] || "").toLowerCase().includes(s)
    );
  }, [rows, search, adminNames]);

  const totals = useMemo(
    () => ({
      times: filtered.length,
      stars: filtered.reduce((a, r) => a + Number(r.stars || 0), 0),
      amount: filtered.reduce((a, r) => a + Number(r.amount || 0), 0),
    }),
    [filtered]
  );

  // user wise: kisko kitni baar, kul kitne stars
  const byUser = useMemo(() => {
    const m = new Map();
    filtered.forEach((r) => {
      const k = r.userId || r.username;
      const cur = m.get(k) || { key: k, username: r.username || "No name", times: 0, stars: 0, amount: 0, last: 0 };
      cur.times += 1;
      cur.stars += Number(r.stars || 0);
      cur.amount += Number(r.amount || 0);
      if (r.ms > cur.last) cur.last = r.ms;
      m.set(k, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.stars - a.stars);
  }, [filtered]);

  if (!isAdmin) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "red", fontSize: 22 }}>
          {isAdmin === null ? "Checking..." : "Access Denied"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Star History</Text>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color="#aaa" />
        <TextInput
          style={styles.searchInput}
          placeholder="User ya admin ka naam..."
          placeholderTextColor="#777"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={20} color="#888" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.sumRow}>
        <View style={styles.sumBox}>
          <Text style={styles.sumVal}>{num(totals.times)}</Text>
          <Text style={styles.sumLbl}>Baar diya</Text>
        </View>
        <View style={styles.sumBox}>
          <Text style={styles.sumVal}>⭐ {num(totals.stars)}</Text>
          <Text style={styles.sumLbl}>Total Stars</Text>
        </View>
        <View style={styles.sumBox}>
          <Text style={styles.sumVal}>₹{num(totals.amount)}</Text>
          <Text style={styles.sumLbl}>Total Rupiya</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {[
          ["history", "Sab History"],
          ["users", "User wise"],
        ].map(([k, label]) => (
          <TouchableOpacity
            key={k}
            style={[styles.tab, tab === k && styles.tabOn]}
            onPress={() => setTab(k)}
          >
            <Text style={[styles.tabTxt, tab === k && { color: "#000" }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {rows === null ? (
        <ActivityIndicator color="#FFD700" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          data={tab === "history" ? filtered : byUser}
          keyExtractor={(i) => i.id || String(i.key)}
          ListEmptyComponent={
            <Text style={styles.empty}>{err || "Abhi tak koi record nahi"}</Text>
          }
          renderItem={({ item }) =>
            tab === "history" ? (
              <View style={styles.card}>
                <View style={styles.line}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.username || "No name"}
                  </Text>
                  <Text style={styles.stars}>+{num(item.stars)} ⭐</Text>
                </View>
                <Text style={styles.sub}>
                  📅 {fmtDate(item.ms)}   🕐 {fmtTime(item.ms)}
                </Text>
                <Text style={styles.sub}>
                  👤 Admin: {adminNames[item.adminId] || "..."}
                  {item.amount ? `   💰 ₹${num(item.amount)}` : ""}
                  {item.level !== undefined && item.level !== null ? `   Lv ${item.level}` : ""}
                </Text>
                {!!item.note && <Text style={styles.sub}>📝 {item.note}</Text>}
              </View>
            ) : (
              <TouchableOpacity
                style={styles.card}
                onPress={() => {
                  setSearch(item.username);
                  setTab("history");
                }}
              >
                <View style={styles.line}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.username}
                  </Text>
                  <Text style={styles.stars}>⭐ {num(item.stars)}</Text>
                </View>
                <Text style={styles.sub}>
                  {item.times} baar mile{item.amount ? `   ₹${num(item.amount)}` : ""}
                </Text>
                <Text style={styles.sub}>
                  Aakhri baar: {fmtDate(item.last)} {fmtTime(item.last)}
                </Text>
              </TouchableOpacity>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 15, paddingTop: 40 },
  title: { color: "#FFD700", fontSize: 26, fontWeight: "bold", textAlign: "center", marginBottom: 15 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: "#fff", paddingVertical: 12, marginLeft: 8, fontSize: 16 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  sumBox: {
    width: "32%",
    backgroundColor: "#111",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  sumVal: { color: "#FFD700", fontSize: 16, fontWeight: "bold" },
  sumLbl: { color: "#aaa", fontSize: 11, marginTop: 2 },
  tabs: { flexDirection: "row", marginBottom: 12 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    marginHorizontal: 3,
  },
  tabOn: { backgroundColor: "#FFD700" },
  tabTxt: { color: "#ddd", fontWeight: "bold" },
  card: { backgroundColor: "#111", borderRadius: 12, padding: 12, marginBottom: 8 },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "700", marginRight: 8 },
  stars: { color: "#FFD700", fontSize: 16, fontWeight: "bold" },
  sub: { color: "#aaa", marginTop: 4, fontSize: 13 },
  empty: { color: "#888", textAlign: "center", marginTop: 40, paddingHorizontal: 20 },
});
