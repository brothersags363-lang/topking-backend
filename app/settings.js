import React, { useEffect } from "react";

import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  BackHandler,
  Linking,
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

      <View style={styles.content}>

        {/* =====================================================
            SETTINGS SECTION
        ===================================================== */}

        <View style={styles.section}>

          <Text style={styles.sectionTitle}>
            TopKing
          </Text>


          {/* =================================================
              AGENCY REQUEST
          ================================================= */}

          <TouchableOpacity
            style={styles.settingRow}
            activeOpacity={0.6}
            onPress={openAgencyRequest}
          >

            {/* LEFT ICON */}

            <View style={styles.iconContainer}>

              <Ionicons
                name="business-outline"
                size={25}
                color="#fff"
              />

            </View>


            {/* TITLE */}

            <Text style={styles.settingTitle}>
              Agency Request
            </Text>


            {/* RIGHT ARROW */}

            <Ionicons
              name="chevron-forward"
              size={24}
              color="#888"
              style={styles.arrow}
            />

          </TouchableOpacity>

        </View>


        {/* =====================================================
            COMING SOON
        ===================================================== */}

        <View style={styles.comingSoonContainer}>

          <Ionicons
            name="settings-outline"
            size={60}
            color="#FFD700"
          />

          <Text style={styles.comingSoon}>
            Coming Soon
          </Text>

          <Text style={styles.description}>
            More settings features are coming soon.
          </Text>

        </View>

      </View>

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