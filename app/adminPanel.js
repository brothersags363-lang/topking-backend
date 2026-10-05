import React, { useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  BackHandler,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import useIsAdmin from "./useIsAdmin";

export default function AdminPanel() {
  const router = useRouter();
  const isAdmin = useIsAdmin();

  // Mobile hardware back button
  useEffect(() => {
    const backAction = () => {
      router.back();
      return true;
    };
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );
    return () => backHandler.remove();
  }, [router]);

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "red", fontSize: 22 }}>
          {isAdmin === null ? "Checking..." : "Access Denied"}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Admin Panel</Text>

      <TouchableOpacity
        style={styles.agencyBtn}
        onPress={() => router.push("/agencyPanel")}
      >
        <Text style={styles.agencyBtnText}>Agency Panel</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.yellowBtn}
        onPress={() => router.push("/agencyRewards")}
      >
        <Ionicons name="trophy" size={22} color="#000" />
        <Text style={styles.yellowText}>Agency Rewards</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.yellowBtn}
        onPress={() => router.push("/withdrawals")}
      >
        <Ionicons name="wallet" size={22} color="#000" />
        <Text style={styles.yellowText}>Withdrawal Requests</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.yellowBtn}
        onPress={() => router.push("/feedbackAdmin")}
      >
        <Ionicons name="chatbox-ellipses" size={22} color="#000" />
        <Text style={styles.yellowText}>Feedback</Text>
      </TouchableOpacity>

      {/* NEW: Profile Details */}
      <TouchableOpacity
        style={styles.profileBtn}
        onPress={() => router.push("/profileDetails")}
      >
        <Ionicons name="people" size={22} color="#fff" />
        <Text style={styles.btnLabel}>Profile Details</Text>
      </TouchableOpacity>

      {/* NEW: Reports (separate report system) */}
      <TouchableOpacity
        style={styles.reportBtn}
        onPress={() => router.push("/reportsAdmin")}
      >
        <Ionicons name="flag" size={22} color="#fff" />
        <Text style={styles.btnLabel}>Reports</Text>
      </TouchableOpacity>
      {/* NEW: All Videos (admin kisi ka bhi video delete kar sakta hai) */}
      <TouchableOpacity
        style={styles.videoBtn}
        onPress={() => router.push("/adminVideos")}
      >
        <Ionicons name="videocam" size={22} color="#fff" />
        <Text style={styles.btnLabel}>All Videos</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const row = {
  padding: 15,
  borderRadius: 15,
  flexDirection: "row",
  justifyContent: "center",
  alignItems: "center",
  marginBottom: 20,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", padding: 15 },
  center: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    color: "#fff",
    fontSize: 25,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
  },
  agencyBtn: { ...row, backgroundColor: "#00BFFF" },
  agencyBtnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  yellowBtn: { ...row, backgroundColor: "#FFD700" },
  yellowText: { color: "#000", fontSize: 18, fontWeight: "bold", marginLeft: 10 },
  profileBtn: { ...row, backgroundColor: "#8e44ad" },
  reportBtn: { ...row, backgroundColor: "#e74c3c" },
  videoBtn: { ...row, backgroundColor: "#16a085" },
  btnLabel: { color: "#fff", fontSize: 18, fontWeight: "bold", marginLeft: 10 },
});
