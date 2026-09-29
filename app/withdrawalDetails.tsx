import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

import { db } from "./firebaseConfig";

const functions = getFunctions(getApp(), "asia-south1");
const adminUpdateWithdrawal = httpsCallable(functions, "adminUpdateWithdrawal");

const statusColor = (s: string) =>
  s === "Success" ? "#00ff66" : s === "Failed" ? "#ff3b30" : "#FFD700";

function Row({ label, value }: { label: string; value: any }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </>
  );
}

export default function WithdrawalDetails() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "withdrawals", id as string));
        if (snap.exists()) setData({ id: snap.id, ...snap.data() });
      } catch (e) {
        console.log(e);
      }
      setLoading(false);
    })();
  }, [id]);

  const update = (status: "Success" | "Failed") => {
    if (busy) return;

    Alert.alert(
      "Confirm",
      status === "Success"
        ? `₹${data.amount} ${data.method === "BANK" ? "bank account" : "UPI"} me bhej diya? Payment Success karna hai?`
        : "Payment Failed karna hai? User ke stars wapas ho jayenge.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes",
          onPress: async () => {
            setBusy(true);
            try {
              await adminUpdateWithdrawal({ withdrawId: data.id, status });
              Alert.alert("Done", `Withdrawal ${status}`);
              router.back();
            } catch (e: any) {
              Alert.alert("Error", e?.message || "Try again");
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.loader}>
        <Text style={{ color: "#fff" }}>Data Not Found</Text>
      </View>
    );
  }

  const status = data.status || "Pending";
  const pending = status === "Pending";

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.title}>Withdrawal Details</Text>

      {data.flags?.length > 0 && (
        <View style={styles.flagBox}>
          {data.flags.includes("PAYOUT_SHARED_WITH_OTHER_USER") && (
            <Text style={styles.flagText}>
              ⚠️ Same payout account has been used by another user. Check before paying.
            </Text>
          )}
          {data.flags.includes("FEW_GIFTERS") && (
            <Text style={styles.flagText}>
              ⚠️ Stars came from very few different users (possible self-gifting). Check before paying.
            </Text>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Row label="User Name" value={data.name || data.username} />
        <Row label="Agency" value={data.agencyName || "No Agency"} />
        <Row label="Method" value={data.method === "BANK" ? "Bank Account" : "UPI"} />
        <Row label="Account Holder" value={data.accountName} />
        <Row label="Mobile" value={data.mobile} />

        {data.method === "BANK" ? (
          <>
            <Row label="Account Number" value={data.payout?.accountNumber} />
            <Row label="IFSC" value={data.payout?.ifsc} />
          </>
        ) : (
          <Row label="UPI ID" value={data.payout?.upiId} />
        )}

        <Row label="Amount to Pay" value={`₹ ${data.amount}`} />
        <Row label="Withdrawal TK" value={`${data.tk} TK`} />
        <Row label="Gift Stars (already held)" value={`⭐ ${data.giftStars}`} />

        <Text style={styles.label}>Status</Text>
        <Text style={{ color: statusColor(status), fontSize: 18, fontWeight: "bold", marginTop: 5 }}>
          {status}
        </Text>
      </View>

      {pending && (
        <>
          <TouchableOpacity
            style={[styles.successBtn, busy && { opacity: 0.5 }]}
            disabled={busy}
            onPress={() => update("Success")}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Payment Success</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.failedBtn, busy && { opacity: 0.5 }]}
            disabled={busy}
            onPress={() => update("Failed")}
          >
            <Text style={styles.btnText}>Payment Failed</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 20 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" },
  title: { fontSize: 28, fontWeight: "bold", color: "#FFD700", textAlign: "center", marginBottom: 25 },

  flagBox: {
    backgroundColor: "#2a1c00",
    borderColor: "#ff9500",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 15,
  },
  flagText: { color: "#ff9500", fontSize: 14 },

  card: {
    backgroundColor: "#111",
    borderRadius: 15,
    padding: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: "#222",
  },
  label: { color: "#777", fontSize: 14, marginTop: 15 },
  value: { color: "#fff", fontSize: 20, fontWeight: "bold", marginTop: 5 },

  successBtn: { backgroundColor: "#00aa44", padding: 18, borderRadius: 15, marginBottom: 15 },
  failedBtn: { backgroundColor: "#ff3b30", padding: 18, borderRadius: 15 },
  btnText: { color: "#fff", fontSize: 18, fontWeight: "bold", textAlign: "center" },
});
