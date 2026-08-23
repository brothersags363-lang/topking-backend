import React from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Platform,
} from "react-native";

import {
  MaterialCommunityIcons,
  Ionicons,
} from "@expo/vector-icons";

import { useLive } from "../context/LiveContext";


const DEFAULT_AVATAR =
  "https://avatar.iran.liara.run/public/65";


export default function LiveMiniPlayer() {

  const {

    activeLive,

    isMiniPlayerVisible,

    liveDuration,

    isLiveMuted,

    openLive,

    closeLive,

    toggleLiveMute,

  } = useLive();


  // ===================================================
  // DON'T SHOW
  // ===================================================

  if (
    !activeLive ||
    !isMiniPlayerVisible
  ) {

    return null;

  }


  const avatar =
    activeLive.hostImage ||
    DEFAULT_AVATAR;


  const roomName =
    activeLive.roomName ||
    "Live Room";


  const hostName =
    activeLive.hostName ||
    "User";


  // ===================================================
  // UI
  // ===================================================

  return (

    <View
      pointerEvents="box-none"
      style={styles.overlay}
    >

      <View style={styles.container}>


        {/* =========================================
            LIVE AVATAR
        ========================================= */}

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={openLive}
          style={styles.avatarButton}
        >

          <View style={styles.avatarRing}>

            <Image
              source={{
                uri: avatar,
              }}
              style={styles.avatar}
            />

          </View>


          {/* LIVE DOT */}

          <View style={styles.liveDot}>

            <View
              style={styles.liveDotInner}
            />

          </View>


        </TouchableOpacity>



        {/* =========================================
            INFORMATION
        ========================================= */}

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={openLive}
          style={styles.infoArea}
        >

          <View
            style={styles.liveRow}
          >

            <View
              style={styles.liveBadge}
            >

              <View
                style={styles.smallLiveDot}
              />

              <Text
                style={styles.liveText}
              >
                LIVE
              </Text>

            </View>


            <Text
              numberOfLines={1}
              style={styles.duration}
            >
              {liveDuration}
            </Text>

          </View>


          <Text
            numberOfLines={1}
            style={styles.roomName}
          >
            {roomName}
          </Text>


          <Text
            numberOfLines={1}
            style={styles.hostName}
          >
            @{hostName}
          </Text>

        </TouchableOpacity>



        {/* =========================================
            AUDIO BUTTON
        ========================================= */}

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={toggleLiveMute}
          style={styles.actionButton}
        >

          <Ionicons
            name={
              isLiveMuted
                ? "volume-mute"
                : "volume-high"
            }
            size={20}
            color="#ffffff"
          />

        </TouchableOpacity>



        {/* =========================================
            CLOSE BUTTON
        ========================================= */}

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={closeLive}
          style={styles.closeButton}
        >

          <Ionicons
            name="close"
            size={20}
            color="#ffffff"
          />

        </TouchableOpacity>

      </View>

    </View>

  );

}


// =====================================================
// STYLES
// =====================================================

const styles = StyleSheet.create({

  overlay: {

    position: "absolute",

    left: 0,

    right: 0,

    bottom: 72,

    zIndex: 999999,

    elevation: 999999,

    alignItems: "center",

  },


  container: {

    width: "94%",

    minHeight: 68,

    backgroundColor: "#151515",

    borderRadius: 18,

    borderWidth: 1,

    borderColor:
      "rgba(255,255,255,0.12)",

    flexDirection: "row",

    alignItems: "center",

    paddingHorizontal: 8,

    paddingVertical: 7,

    shadowColor: "#000",

    shadowOffset: {
      width: 0,
      height: 5,
    },

    shadowOpacity: 0.35,

    shadowRadius: 8,

    ...Platform.select({

      android: {
        elevation: 15,
      },

      ios: {},

    }),

  },


  avatarButton: {

    width: 52,

    height: 52,

    justifyContent: "center",

    alignItems: "center",

    marginRight: 8,

  },


  avatarRing: {

    width: 48,

    height: 48,

    borderRadius: 24,

    borderWidth: 2,

    borderColor: "#ff3040",

    justifyContent: "center",

    alignItems: "center",

  },


  avatar: {

    width: 42,

    height: 42,

    borderRadius: 21,

    backgroundColor: "#222",

  },


  liveDot: {

    position: "absolute",

    right: -1,

    bottom: 0,

    width: 18,

    height: 18,

    borderRadius: 9,

    backgroundColor: "#ff3040",

    borderWidth: 2,

    borderColor: "#151515",

    justifyContent: "center",

    alignItems: "center",

  },


  liveDotInner: {

    width: 6,

    height: 6,

    borderRadius: 3,

    backgroundColor: "#ffffff",

  },


  infoArea: {

    flex: 1,

    justifyContent: "center",

    paddingHorizontal: 3,

    minWidth: 0,

  },


  liveRow: {

    flexDirection: "row",

    alignItems: "center",

    marginBottom: 2,

  },


  liveBadge: {

    flexDirection: "row",

    alignItems: "center",

    backgroundColor:
      "rgba(255,48,64,0.14)",

    paddingHorizontal: 6,

    paddingVertical: 2,

    borderRadius: 6,

  },


  smallLiveDot: {

    width: 5,

    height: 5,

    borderRadius: 3,

    backgroundColor: "#ff3040",

    marginRight: 4,

  },


  liveText: {

    color: "#ff5260",

    fontSize: 9,

    fontWeight: "900",

  },


  duration: {

    color: "#999999",

    fontSize: 9,

    marginLeft: 6,

  },


  roomName: {

    color: "#ffffff",

    fontSize: 13,

    fontWeight: "700",

  },


  hostName: {

    color: "#888888",

    fontSize: 10,

    marginTop: 1,

  },


  actionButton: {

    width: 38,

    height: 38,

    borderRadius: 19,

    backgroundColor:
      "rgba(255,255,255,0.08)",

    justifyContent: "center",

    alignItems: "center",

    marginHorizontal: 3,

  },


  closeButton: {

    width: 38,

    height: 38,

    borderRadius: 19,

    backgroundColor:
      "rgba(255,255,255,0.08)",

    justifyContent: "center",

    alignItems: "center",

    marginLeft: 2,

  },

});