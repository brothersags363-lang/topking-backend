import useBackStep from '../utils/useBackStep';
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
} from "react-native";
import { useRouter } from "../utils/safeRouter";
import { collection, doc, getDoc, getDocs, query, limit, orderBy, startAt, endAt } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { db } from "./firebaseConfig";
import useIsAdmin from "./useIsAdmin";

const PLACEHOLDER = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
const PER_QUERY_LIMIT = 20; // har query se max itne user
const MAX_RESULTS = 40; // screen par max itne
const DEBOUNCE_MS = 400;

const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

// SERVER-SIDE search: screen khulte hi koi user load nahi hota. Jab admin type kare tab
// sirf match hone wale users aate hain (kitne bhi users ho - 10 crore bhi - search chalega).
// 1) exact ID (Firestore uid)  2) username prefix  3) name prefix  (lower / Capital / jaisa type kiya)
async function searchUsers(text) {
  const raw = text.trim();
  if (!raw) return [];
  const out = new Map();

  const jobs = [];

  // exact ID (uid) - sabse pehle, ek hi doc read
  if (!raw.includes("/") && raw.length >= 3) {
    jobs.push(
      getDoc(doc(db, "users", raw))
        .then((d) => {
          if (d.exists()) out.set(d.id, { id: d.id, ...d.data(), _exact: true });
        })
        .catch(() => {})
    );
  }

  // prefix search: dusre case me bhi mile (username "Rahul" ho aur admin "rahul" type kare)
  const variants = Array.from(new Set([raw, raw.toLowerCase(), cap(raw.toLowerCase())]));
  const prefixQuery = (field, v) =>
    getDocs(query(collection(db, "users"), orderBy(field), startAt(v), endAt(v + "\uf8ff"), limit(PER_QUERY_LIMIT)))
      .then((snap) => snap.docs.forEach((d) => { if (!out.has(d.id)) out.set(d.id, { id: d.id, ...d.data() }); }))
      .catch(() => {});

  variants.forEach((v) => {
    jobs.push(prefixQuery("username", v));
    jobs.push(prefixQuery("name", v));
  });

  await Promise.all(jobs);

  const list = Array.from(out.values());
  list.sort((a, b) => {
    if (a._exact && !b._exact) return -1;
    if (b._exact && !a._exact) return 1;
    return (a.username || "").localeCompare(b.username || "");
  });
  return list.slice(0, MAX_RESULTS);
}

export default function ProfileDetails() {
  const router = useRouter();
  useBackStep('/profile');
  const isAdmin = useIsAdmin();
  const [results, setResults] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    if (isAdmin !== true) return undefined; // COST: non-admin search nahi kar sakta
    const text = search.trim();
    if (!text) {
      reqRef.current += 1;
      setResults([]);
      setSearched(false);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const my = ++reqRef.current;
    const t = setTimeout(async () => {
      try {
        const list = await searchUsers(text);
        if (reqRef.current !== my) return; // naya type ho gaya -> purana result ignore
        setResults(list);
      } catch (_) {
        if (reqRef.current === my) setResults([]);
      }
      if (reqRef.current === my) {
        setSearched(true);
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search, isAdmin]);

  const renderItem = useCallback(
    ({ item }) => (
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push({ pathname: "/adminUserProfile", params: { userId: item.id } })}
      >
        <Image source={{ uri: item.profileImg || PLACEHOLDER }} style={styles.avatar} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {item.username || item.name || "No name"}
          </Text>
          <Text style={styles.uid} numberOfLines={1}>{item.id}</Text>
        </View>
        {item.banned && <Text style={styles.banned}>BANNED</Text>}
        <Ionicons name="chevron-forward" size={20} color="#777" />
      </TouchableOpacity>
    ),
    [router]
  );

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
      {/* Upar search bar */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color="#aaa" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search username ya user ID..."
          placeholderTextColor="#777"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={20} color="#aaa" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#aaa" style={{ marginVertical: 12 }} />
      ) : searched ? (
        <Text style={styles.count}>Found: {results.length}</Text>
      ) : null}

      <FlatList
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        data={results}
        keyExtractor={(i) => i.id}
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.empty}>
              {searched ? "No user found" : "Username ya user ID type karke search karo"}
            </Text>
          )
        }
        renderItem={renderItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 15 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: "#fff", paddingVertical: 12, marginLeft: 8, fontSize: 16 },
  count: { color: "#888", marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: "#333" },
  name: { color: "#fff", fontSize: 16, fontWeight: "600" },
  uid: { color: "#777", fontSize: 11, marginTop: 2 },
  banned: { color: "red", fontWeight: "bold", marginRight: 8, fontSize: 12 },
  empty: { color: "#888", textAlign: "center", marginTop: 40 },
});
