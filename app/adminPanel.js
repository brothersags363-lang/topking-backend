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

// Saare buttons chhote, 2 column grid me. Route / rang pehle jaise hi hain.
const ITEMS = [
  { label: "Agency Panel", icon: "business", route: "/agencyPanel", bg: "#00BFFF", fg: "#fff" },
  { label: "BD Panel", icon: "briefcase", route: "/bdPanel", bg: "#e67e22", fg: "#fff" },
  { label: "Official", icon: "shield-checkmark", route: "/officialAdmin", bg: "#6c5ce7", fg: "#fff" },
  { label: "Special Frames", icon: "color-palette", route: "/adminFrames", bg: "#c0392b", fg: "#fff" },
  { label: "Agency Rewards", icon: "trophy", route: "/agencyRewards", bg: "#FFD700", fg: "#000" },
  { label: "Add Stars", icon: "star", route: "/addStars", bg: "#FFD700", fg: "#000" },
  { label: "Verified Tick", icon: "checkmark-circle", route: "/adminVerify", bg: "#2980b9", fg: "#fff" },
  { label: "Withdrawals", icon: "wallet", route: "/withdrawals", bg: "#FFD700", fg: "#000" },
  { label: "Feedback", icon: "chatbox-ellipses", route: "/feedbackAdmin", bg: "#FFD700", fg: "#000" },
  { label: "Profile Details", icon: "people", route: "/profileDetails", bg: "#8e44ad", fg: "#fff" },
  { label: "Reports", icon: "flag", route: "/reportsAdmin", bg: "#e74c3c", fg: "#fff" },
  { label: "All Videos", icon: "videocam", route: "/adminVideos", bg: "#16a085", fg: "#fff" },
];

export default function AdminPanel() {
  const router = useRouter();
  const isAdmin = useIsAdmin();

  // Mobile hardware back button
  useEffect(() => {
    const backAction = () => {
      router.back();
      return true;
    };
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, [router]);

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "red", fontSize: 20 }}>
          {isAdmin === null ? "Checking..." : "Access Denied"}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 30 }}>
      <Text style={styles.title}>Admin Panel</Text>

      <View style={styles.grid}>
        {ITEMS.map((it) => (
          <TouchableOpacity
            key={it.route}
            style={[styles.btn, { backgroundColor: it.bg }]}
            activeOpacity={0.8}
            onPress={() => router.push(it.route)}
          >
            <Ionicons name={it.icon} size={16} color={it.fg} />
            <Text style={[styles.label, { color: it.fg }]} numberOfLines={1}>
              {it.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", paddingHorizontal: 12, paddingTop: 10 },
  center: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 14,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  btn: {
    width: "48.5%",
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  label: { fontSize: 13, fontWeight: "bold", marginLeft: 6 },
});
