import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";

import { auth, db } from "./firebaseConfig";

const BACKEND = "https://topking-backend.onrender.com";
const FILTERS = ["Pending", "Approved", "Rejected", "All"];

const statusColor = (s) =>
  s === "Approved" ? "#00ff66" : s === "Rejected" ? "#ff3b30" : "#FFD700";

async function callAdmin(path, body) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BACKEND}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch (_) {}
  if (!data) {
    throw new Error(
      res.status === 404
        ? "Server par recharge endpoint deploy nahi hai (404)"
        : `Server error (${res.status})`
    );
  }
  if (!res.ok || !data.success) throw new Error(data.error || "Failed");
  return data;
}

export default function RechargeRequests() {
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [filter, setFilter] = useState("Pending");
  const [items, setItems] = useState([]);
  const [starsInput, setStarsInput] = useState({}); // { [id]: "120" }
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, "rechargeRequests"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => {
        setDenied(true);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const approve = (item) => {
    const stars = Number(starsInput[item.id]);

    if (!stars || stars < 1) {
      Alert.alert("Stars daalo", "Pehle kitne Stars dene hain wo likho");
      return;
    }

    Alert.alert(
      "Confirm",
      `₹${item.amount} ka payment aa gaya?\n\n${item.name || item.username} ko ${stars} Stars milenge.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          onPress: async () => {
            setBusyId(item.id);
            try {
              await callAdmin("/admin/approve-recharge", { id: item.id, stars });
              Alert.alert("Done", `${stars} Stars wallet me add ho gaye`);
            } catch (e) {
              Alert.alert("Error", e.message);
            }
            setBusyId(null);
          },
        },
      ]
    );
  };

  const reject = (item) => {
    Alert.alert("Reject?", "Payment nahi aaya ya UTR galat hai?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: async () => {
          setBusyId(item.id);
          try {
            await callAdmin("/admin/reject-recharge", { id: item.id });
          } catch (e) {
            Alert.alert("Error", e.message);
          }
          setBusyId(null);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  if (denied) {
    return (
      <View style={styles.loader}>
        <Text style={{ color: "#fff" }}>Admin access only</Text>
      </View>
    );
  }

  const shown = items.filter(
    (i) => filter === "All" || (i.status || "Pending") === filter
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recharge Requests</Text>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && { color: "#000" }]}>
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={shown}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const status = item.status || "Pending";
          const pending = status === "Pending";
          const when = item.createdAt?.toDate
            ? item.createdAt.toDate().toLocaleString()
            : "";

          return (
            <View style={styles.card}>
              <View style={styles.topRow}>
                {!!item.profileImg && (
                  <Image source={{ uri: item.profileImg }} style={styles.avatar} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name || item.username}</Text>
                  {!!item.username && (
                    <Text style={styles.sub}>@{item.username}</Text>
                  )}
                </View>
                <Text style={[styles.status, { color: statusColor(status) }]}>
                  {status}
                </Text>
              </View>

              <Text style={styles.amount}>₹ {item.amount} recharge kiya</Text>
              <Text selectable style={styles.utr}>UTR: {item.utr}</Text>
              <Text style={styles.sub}>{when}</Text>

              {pending ? (
                <>
                  <TextInput
                    placeholder="Kitne Stars dene hain? (jaise 120)"
                    placeholderTextColor="#777"
                    keyboardType="numeric"
                    style={styles.input}
                    value={starsInput[item.id] || ""}
                    onChangeText={(t) =>
                      setStarsInput((p) => ({
                        ...p,
                        [item.id]: t.replace(/[^0-9]/g, ""),
                      }))
                    }
                  />

                  <View style={styles.btnRow}>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      disabled={busyId === item.id}
                      onPress={() => reject(item)}
                    >
                      <Text style={{ color: "#fff", fontWeight: "bold" }}>
                        Reject
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.submitBtn}
                      disabled={busyId === item.id}
                      onPress={() => approve(item)}
                    >
                      {busyId === item.id ? (
                        <ActivityIndicator color="#000" />
                      ) : (
                        <Text style={{ color: "#000", fontWeight: "bold" }}>
                          Submit
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : status === "Approved" ? (
                <Text style={styles.given}>⭐ {item.starsGiven} Stars diye</Text>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={() => (
          <Text style={{ color: "#777", textAlign: "center", marginTop: 100 }}>
            Koi {filter === "All" ? "" : filter} request nahi
          </Text>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 15 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" },
  title: { fontSize: 26, fontWeight: "bold", color: "#FFD700", marginBottom: 15, textAlign: "center" },
  filterRow: { flexDirection: "row", justifyContent: "center", marginBottom: 15 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "#151515", marginHorizontal: 4 },
  chipActive: { backgroundColor: "#FFD700" },
  chipText: { color: "#aaa", fontWeight: "bold", fontSize: 13 },
  card: { backgroundColor: "#111", padding: 16, borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: "#222" },
  topRow: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
  name: { color: "#fff", fontSize: 17, fontWeight: "bold" },
  sub: { color: "#888", fontSize: 12, marginTop: 2 },
  status: { fontWeight: "bold", fontSize: 14 },
  amount: { color: "#FFD700", fontSize: 20, fontWeight: "bold", marginTop: 12 },
  utr: { color: "#ddd", marginTop: 6, fontSize: 14 },
  input: { backgroundColor: "#1d1d1d", color: "#fff", borderRadius: 10, paddingHorizontal: 15, height: 48, marginTop: 14 },
  btnRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  rejectBtn: { backgroundColor: "#e74c3c", paddingVertical: 12, paddingHorizontal: 30, borderRadius: 10, alignItems: "center" },
  submitBtn: { backgroundColor: "#FFD700", paddingVertical: 12, paddingHorizontal: 40, borderRadius: 10, alignItems: "center", minWidth: 120 },
  given: { color: "#00ff66", marginTop: 10, fontWeight: "bold" },
});
