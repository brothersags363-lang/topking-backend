import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";

import { db } from "./firebaseConfig";

const FILTERS = ["All", "Pending", "Success", "Failed"];

const statusColor = (s: string) =>
  s === "Success" ? "#00ff66" : s === "Failed" ? "#ff3b30" : "#FFD700";

export default function Withdrawals() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [filter, setFilter] = useState("Pending");
  const [withdrawals, setWithdrawals] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, "withdrawals"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setWithdrawals(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => {
        // Firestore rules only allow admins to read this collection
        setDenied(true);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

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

  const shown = withdrawals.filter(
    (w) => filter === "All" || (w.status || "Pending") === filter
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Withdrawal Requests</Text>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && { color: "#000" }]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={shown}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              router.push({ pathname: "/withdrawalDetails", params: { id: item.id } })
            }
          >
            <View style={styles.topRow}>
              <Text style={styles.name}>{item.name || item.username}</Text>
              <Text style={styles.badge}>{item.method === "BANK" ? "Bank" : "UPI"}</Text>
            </View>

            <Text style={styles.amount}>₹ {item.amount}</Text>
            <Text style={styles.upi}>{item.payoutMasked}</Text>

            {item.flags?.length > 0 && (
              <Text style={styles.flag}>⚠️ Needs check: payout account used by another user</Text>
            )}

            <View style={styles.bottomRow}>
              <Text style={[styles.status, { color: statusColor(item.status || "Pending") }]}>
                {item.status || "Pending"}
              </Text>
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={() => (
          <View style={{ marginTop: 120, alignItems: "center" }}>
            <Ionicons name="wallet-outline" size={70} color="#444" />
            <Text style={{ color: "#777", fontSize: 18, marginTop: 15 }}>
              No {filter === "All" ? "" : filter} Withdrawal Request
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 15 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" },
  title: { fontSize: 28, fontWeight: "bold", color: "#FFD700", marginBottom: 15, textAlign: "center" },

  filterRow: { flexDirection: "row", justifyContent: "center", marginBottom: 15 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#151515",
    marginHorizontal: 4,
  },
  chipActive: { backgroundColor: "#FFD700" },
  chipText: { color: "#aaa", fontWeight: "bold", fontSize: 13 },

  card: {
    backgroundColor: "#111",
    padding: 18,
    borderRadius: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#222",
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { color: "#fff", fontSize: 18, fontWeight: "bold", flex: 1 },
  badge: { color: "#FFD700", fontWeight: "bold", fontSize: 12 },
  amount: { color: "#FFD700", fontSize: 22, fontWeight: "bold", marginTop: 8 },
  upi: { color: "#aaa", marginTop: 8, fontSize: 15 },
  flag: { color: "#ff9500", marginTop: 8, fontSize: 13 },
  bottomRow: {
    marginTop: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  status: { fontSize: 16, fontWeight: "bold" },
});
