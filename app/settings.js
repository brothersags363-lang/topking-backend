import React, { useEffect } from "react";

import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  BackHandler,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

export default function Settings() {

  const router = useRouter();

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


        {/* RIGHT EMPTY SPACE
            Header ko center mein rakhne ke liye */}

        <View style={styles.rightSpace} />

      </View>


      {/* =====================================================
          COMING SOON
      ===================================================== */}

      <View style={styles.centerContent}>

        <Ionicons
          name="settings-outline"
          size={70}
          color="#FFD700"
        />


        <Text style={styles.comingSoon}>
          Coming Soon
        </Text>


        <Text style={styles.description}>
          Settings feature is coming soon.
        </Text>

      </View>

    </SafeAreaView>
  );
}


// =====================================================
// STYLES
// =====================================================

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#000",
  },


  // =====================================================
  // HEADER
  // =====================================================

  header: {
    height: 60,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

    paddingHorizontal: 12,

    backgroundColor: "#000",

    borderBottomWidth: 1,

    borderBottomColor: "#222",
  },


  backButton: {
    width: 40,

    height: 40,

    justifyContent: "center",

    alignItems: "center",
  },


  headerTitle: {
    color: "#fff",

    fontSize: 20,

    fontWeight: "bold",

    textAlign: "center",
  },


  rightSpace: {
    width: 40,

    height: 40,
  },


  // =====================================================
  // CENTER CONTENT
  // =====================================================

  centerContent: {
    flex: 1,

    justifyContent: "center",

    alignItems: "center",

    paddingBottom: 60,
  },


  comingSoon: {
    color: "#FFD700",

    fontSize: 28,

    fontWeight: "bold",

    marginTop: 20,
  },


  description: {
    color: "#888",

    fontSize: 14,

    marginTop: 8,

    textAlign: "center",
  },

});