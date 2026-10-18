import React, { useEffect, useState } from "react";

import {
  Alert,
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  BackHandler,
  Linking,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

// NOTE: settings.js app/ folder me hai to "./firebaseConfig" sahi hai,
// warna path apne folder ke hisaab se badlo.
import { auth, db } from "./firebaseConfig";

// Ek row (icon + title + arrow)
function Row({ icon, label, onPress, color = "#fff", iconColor }) {
  return (
    <TouchableOpacity
      style={styles.settingRow}
      activeOpacity={0.6}
      onPress={onPress}
    >
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={25} color={iconColor || color} />
      </View>

      <Text style={[styles.settingTitle, { color }]}>{label}</Text>

      <Ionicons
        name="chevron-forward"
        size={24}
        color="#888"
        style={styles.arrow}
      />
    </TouchableOpacity>
  );
}

export default function Settings() {

  const router = useRouter();

  const [isBD, setIsBD] = useState(false);
  const [hasAgency, setHasAgency] = useState(false);
  const [joinedAgency, setJoinedAgency] = useState(false);

  // User ka role (BD / agency) padho
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) return;
        const d = snap.data();
        setIsBD(d.isBD === true);
        setHasAgency(d.agencyApproved === true);
        setJoinedAgency(!!d.agencyId);
      } catch (e) {}
    });
    return () => unsub();
  }, []);

  // Logout
  const handleLogout = () => {
    Alert.alert("Logout", "Do you want to log out??", [
      { text: "no", style: "cancel" },
      {
        text: "yes",
        onPress: async () => {
          try {
            await signOut(auth);
            try {
              await GoogleSignin.signOut();
            } catch (err) {}
            router.replace("/login");
          } catch (e) {
            Alert.alert("Error", "Logout nahi ho saka");
          }
        },
      },
    ]);
  };

  // =====================================================
  // MOBILE HARDWARE BACK BUTTON
  // =====================================================

  useEffect(() => {

    const handleBackButton = () => {

      router.back();

      return true;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackButton
    );

    return () => {
      subscription.remove();
    };

  }, [router]);


  // =====================================================
  // OPEN AGENCY REQUEST FORM
  // =====================================================

  const openAgencyRequest = async () => {

    const agencyUrl =
      "https://topking-short.vercel.app/agency-request";

    try {

      await Linking.openURL(agencyUrl);

    } catch (error) {

      console.log(
        "Agency Request URL open error:",
        error
      );

    }
  };


  return (
    <SafeAreaView style={styles.container}>

      {/* =====================================================
          HEADER
      ===================================================== */}

      <View style={styles.header}>

        {/* BACK BUTTON */}

        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={() => router.back()}
        >

          <Ionicons
            name="arrow-back"
            size={26}
            color="#fff"
          />

        </TouchableOpacity>


        {/* TITLE */}

        <Text style={styles.headerTitle}>
          Settings
        </Text>


        {/* RIGHT EMPTY SPACE */}

        <View style={styles.rightSpace} />

      </View>


      {/* =====================================================
          SETTINGS CONTENT
      ===================================================== */}

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >

        <View style={styles.section}>

          <Text style={styles.sectionTitle}>
            TopKing
          </Text>

          <Row
            icon="stats-chart"
            iconColor="#FFD700"
            label="Video Rank"
            onPress={() => router.push("/Videorank")}
          />

          <Row
            icon="gift-outline"
            iconColor="#FFD700"
            label="Rewards"
            onPress={() => router.push("../reward")}
          />

          {isBD && (
            <Row
              icon="briefcase-outline"
              iconColor="#FF9800"
              label="BD"
              onPress={() => router.push("../bd")}
            />
          )}

          {joinedAgency && !hasAgency && (
            <Row
              icon="people-outline"
              iconColor="#00E5FF"
              label="User Agency"
              onPress={() => router.push("../useragency")}
            />
          )}

          <Row
            icon="business-outline"
            label="Agency Request"
            onPress={openAgencyRequest}
          />

          <Row
            icon="ban-outline"
            iconColor="#ff4444"
            label="Block"
            onPress={() => router.push("/block")}
          />

          <Row
            icon="log-out-outline"
            color="#FF3B30"
            label="Logout"
            onPress={handleLogout}
          />

        </View>

      </ScrollView>

    </SafeAreaView>
  );
}


// =====================================================
// STYLES
// =====================================================

const styles = StyleSheet.create({

  // =====================================================
  // MAIN CONTAINER
  // =====================================================

  container: {
    flex: 1,
    backgroundColor: "#000",
  },


  // =====================================================
  // HEADER
  // =====================================================

  header: {
    height: 80,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

    paddingHorizontal: 8,

    backgroundColor: "#000",

    borderBottomWidth: 1,

    borderBottomColor: "#222",
  },


  backButton: {
    width: 40,

    height: 20,
    justifyContent: "center",

    alignItems: "center",
  },


  headerTitle: {
    color: "#fff",

    fontSize: 20,
paddingTop: 22,
    fontWeight: "bold",

    textAlign: "center",
  },


  rightSpace: {
    width: 40,

    height: 40,
  },


  // =====================================================
  // CONTENT
  // =====================================================

  content: {
    flex: 1,

    backgroundColor: "#000",
  },


  // =====================================================
  // SETTINGS SECTION
  // =====================================================

  section: {
    marginTop: 18,

    backgroundColor: "#000",
  },


  sectionTitle: {
    color: "#888",

    fontSize: 14,

    fontWeight: "600",

    marginLeft: 20,

    marginBottom: 6,

    textTransform: "uppercase",
  },


  // =====================================================
  // SETTING ROW
  // =====================================================

  settingRow: {
    minHeight: 62,

    width: "100%",

    flexDirection: "row",

    alignItems: "center",

    paddingHorizontal: 20,

    backgroundColor: "#000",
  },


  // =====================================================
  // ICON
  // =====================================================

  iconContainer: {
    width: 40,

    height: 40,

    justifyContent: "center",

    alignItems: "center",

    marginRight: 16,
  },


  // =====================================================
  // SETTING TITLE
  // =====================================================

  settingTitle: {
    flex: 1,

    color: "#fff",

    fontSize: 17,

    fontWeight: "400",
  },


  // =====================================================
  // ARROW
  // =====================================================

  arrow: {
    marginLeft: 10,
  },


  // =====================================================
  // COMING SOON
  // =====================================================

  comingSoonContainer: {
    flex: 1,

    justifyContent: "center",

    alignItems: "center",

    paddingBottom: 80,
  },


  comingSoon: {
    color: "#FFD700",

    fontSize: 27,

    fontWeight: "bold",

    marginTop: 18,
  },


  description: {
    color: "#777",

    fontSize: 14,

    marginTop: 8,

    textAlign: "center",

    paddingHorizontal: 30,
  },

});