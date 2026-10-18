import React, { useEffect, useState } from "react";
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
  Keyboard,
} from "react-native";
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";

import { auth, db } from "./firebaseConfig";
import useIsAdmin from "./useIsAdmin";

// Stars -> Level (backend/server.js wali table ke same)
function starsToLevel(stars) {
  const t = [
    [499000, 50], [440000, 49], [385000, 48], [310000, 47], [299000, 46],
    [260000, 45], [210000, 44], [189000, 43], [155000, 42], [125000, 41],
    [110000, 40], [101000, 39], [99000, 38], [89000, 37], [78000, 36],
    [67000, 35], [51000, 34], [43000, 33], [31000, 32], [26000, 31],
    [23000, 30], [19000, 29], [17000, 28], [14000, 27], [12300, 26],
    [9000, 24], [8200, 23], [7200, 22], [6100, 21], [5050, 20],
    [4000, 19], [3500, 18], [2800, 17], [2400, 16], [1900, 15],
    [1600, 14], [1300, 13], [1150, 12], [1000, 11], [870, 10],
    [670, 9], [540, 8], [360, 7], [280, 6], [200, 5], [160, 4],
    [100, 3], [60, 2], [10, 1],
  ];
  for (const [min, lvl] of t) if (stars >= min) return lvl;
  return 0;
}

// Seedha Firestore se Stars add (admin ko rules me permission hai).
// Server / Render par depend nahi, isliye turant ho jata hai.
// level: admin ne manual level likha ho to wahi lagega, warna stars se auto.
async function grantStars({ uid, username, stars, amount, level: manualLevel }) {
  const adminId = auth.currentUser?.uid;
  if (!adminId) throw new Error("Login nahi hai, dobara login karo");

  const walletRef = doc(db, "wallets", uid);

  return runTransaction(db, async (tx) => {
    const wSnap = await tx.get(walletRef);
    const oldStars = wSnap.exists() ? Number(wSnap.data().stars || 0) : 0;
    const total = oldStars + stars;
    const level =
      manualLevel === null || manualLevel === undefined
        ? starsToLevel(total)
        : manualLevel;

    if (wSnap.exists()) {
      tx.update(walletRef, { stars: total, level });
    } else {
      tx.set(walletRef, { stars: total, level, earnings: 0, receivedStars: 0 });
    }

    // user ki wallet History me dikhega
    tx.set(doc(collection(db, "wallets", uid, "purchaseHistory")), {
      stars,
      amount,
      paymentId: "ADMIN",
      status: "Completed",
      createdAt: serverTimestamp(),
    });

    // admin ka record (kisne, kisko, kitna diya)
    tx.set(doc(collection(db, "starGrants")), {
      userId: uid,
      username: username || "",
      stars,
      amount,
      level,
      note: "",
      adminId,
      createdAt: serverTimestamp(),
    });

    return { oldStars, total, level, oldLevel: wSnap.exists() ? Number(wSnap.data().level || 0) : 0 };
  });
}

const PLACEHOLDER = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

export default function AddStars() {
  const isAdmin = useIsAdmin();

  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [selected, setSelected] = useState(null);
  const [currentStars, setCurrentStars] = useState(null);
  const [currentLevel, setCurrentLevel] = useState(null);
  const [rupees, setRupees] = useState("");
  const [stars, setStars] = useState("");
  const [levelInput, setLevelInput] = useState("");
  const [busy, setBusy] = useState(false);

  // search: username ke shuru ke akshar (chhote/bade dono try hote hain)
  const runSearch = async () => {
    const t = search.trim().replace(/^@/, "");
    if (!t) return;

    Keyboard.dismiss();
    setSearching(true);
    setSearched(false);

    try {
      const variants = Array.from(new Set([t, t.toLowerCase()]));
      const found = new Map();

      for (const v of variants) {
        const q = query(
          collection(db, "users"),
          where("username", ">=", v),
          where("username", "<=", v + "\uf8ff"),
          limit(15)
        );
        const snap = await getDocs(q);
        snap.docs.forEach((d) => found.set(d.id, { id: d.id, ...d.data() }));
      }

      setResults(Array.from(found.values()));
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "Search nahi ho paya, dobara try karo");
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  // chuna hua user ka abhi ka Star balance
  useEffect(() => {
    if (!selected) return;
    setCurrentStars(null);
    setCurrentLevel(null);
    return onSnapshot(
      doc(db, "wallets", selected.id),
      (snap) => {
        setCurrentStars(snap.exists() ? Number(snap.data().stars || 0) : 0);
        setCurrentLevel(snap.exists() ? Number(snap.data().level || 0) : 0);
      },
      () => {
        setCurrentStars(0);
        setCurrentLevel(0);
      }
    );
  }, [selected]);

  const pick = (u) => {
    setSelected(u);
    setRupees("");
    setStars("");
    setLevelInput("");
  };

  const submit = () => {
    const s = Math.floor(Number(stars));
    const r = Number(rupees) || 0;

    if (!selected) return;

    if (!s || s < 1) {
      Alert.alert("Stars daalo", "Kitne Stars dene hain wo likho");
      return;
    }

    // Level optional hai: khali chhodo to stars ke hisaab se auto lagega
    let lvl = null;
    if (levelInput !== "") {
      lvl = Math.floor(Number(levelInput));
      if (!Number.isFinite(lvl) || lvl < 0 || lvl > 50) {
        Alert.alert("Level galat hai", "Level 0 se 50 ke beech me likho");
        return;
      }
    }

    Alert.alert(
      "Confirm",
      `${selected.username} ko ${s} Stars dene hain?${r ? `\n(₹${r} mile)` : ""}${
        lvl !== null ? `\nLevel: ${lvl}` : "\nLevel: auto (stars ke hisaab se)"
      }`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          onPress: async () => {
            if (busy) return;
            setBusy(true);
            try {
              const res = await grantStars({
                uid: selected.id,
                username: selected.username,
                stars: s,
                amount: r,
                level: lvl,
              });
              Alert.alert(
                "Done ✅",
                `${selected.username} ke wallet me ${s} Stars add ho gaye.\nAb total: ${res.total}\nLevel: ${res.level}`
              );
              setRupees("");
              setStars("");
              setLevelInput("");
            } catch (e) {
              console.log("ADD STARS ERROR", e?.code, e?.message);
              Alert.alert(
                "Error",
                e?.code === "permission-denied"
                  ? "Permission nahi mili. Firestore Rules (v3.4) publish karo aur check karo ki admins/{aapka uid} me role: \"admin\" hai."
                  : e?.message || "Stars add nahi hue, dobara try karo"
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

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
      <Text style={styles.title}>Add Stars</Text>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color="#aaa" />
        <TextInput
          style={styles.searchInput}
          placeholder="User ka username likho..."
          placeholderTextColor="#777"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={runSearch}
        />
        <TouchableOpacity onPress={runSearch}>
          <Text style={{ color: "#FFD700", fontWeight: "bold" }}>Search</Text>
        </TouchableOpacity>
      </View>

      {selected && (
        <View style={styles.selectedCard}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Image
              source={{ uri: selected.profileImg || PLACEHOLDER }}
              style={styles.avatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{selected.username}</Text>
              <Text style={styles.sub}>
                Abhi Stars:{" "}
                {currentStars === null ? "..." : `⭐ ${currentStars}`}
                {"   "}Level:{" "}
                {currentLevel === null ? "..." : currentLevel}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Ionicons name="close-circle" size={24} color="#888" />
            </TouchableOpacity>
          </View>

          <TextInput
            placeholder="Kitne rupiya mile (jaise 15)"
            placeholderTextColor="#777"
            keyboardType="numeric"
            style={styles.input}
            value={rupees}
            onChangeText={(t) => setRupees(t.replace(/[^0-9.]/g, ""))}
          />

          <TextInput
            placeholder="Kitne Stars dene hain (jaise 120)"
            placeholderTextColor="#777"
            keyboardType="numeric"
            style={styles.input}
            value={stars}
            onChangeText={(t) => setStars(t.replace(/[^0-9]/g, ""))}
          />

          <TextInput
            placeholder="Level (0-50) — khali = auto"
            placeholderTextColor="#777"
            keyboardType="numeric"
            maxLength={2}
            style={styles.input}
            value={levelInput}
            onChangeText={(t) => setLevelInput(t.replace(/[^0-9]/g, ""))}
          />

          <TouchableOpacity
            style={[styles.submitBtn, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={submit}
          >
            {busy ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.submitText}>Submit</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {searching ? (
        <ActivityIndicator color="#FFD700" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            searched ? <Text style={styles.empty}>Koi user nahi mila</Text> : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, selected?.id === item.id && styles.rowActive]}
              onPress={() => pick(item)}
            >
              <Image
                source={{ uri: item.profileImg || PLACEHOLDER }}
                style={styles.avatar}
              />
              <Text style={styles.name} numberOfLines={1}>
                {item.username || "No name"}
              </Text>
              {item.banned && <Text style={styles.banned}>BANNED</Text>}
            </TouchableOpacity>
          )}
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
  selectedCard: {
    backgroundColor: "#111",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  input: {
    backgroundColor: "#1d1d1d",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 15,
    height: 48,
    marginTop: 12,
  },
  submitBtn: {
    backgroundColor: "#FFD700",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 14,
  },
  submitText: { color: "#000", fontWeight: "bold", fontSize: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  rowActive: { borderWidth: 1, borderColor: "#FFD700" },
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: "#333" },
  name: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "600" },
  sub: { color: "#aaa", marginTop: 3 },
  banned: { color: "red", fontWeight: "bold", fontSize: 12 },
  empty: { color: "#888", textAlign: "center", marginTop: 40 },
});
