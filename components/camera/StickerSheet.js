// Camera "Stickers" panel (screenshot): ⊘ = none, title, 5-column grid.
// Tap = live preview on the camera; selected tile gets a yellow border.
import React, { memo, useCallback } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

const { STICKERS } = require("../../constants/videoFx");
const YELLOW = "#FFD60A";

const ICON = {
  cinema: "film-outline",
  polaroid: "image-outline",
  pinkframe: "heart",
  vhs: "videocam-outline",
};

const Tile = memo(function Tile({ item, on, onPress }) {
  return (
    <TouchableOpacity style={styles.cell} activeOpacity={0.8} onPress={() => onPress(item.id)}>
      <View style={[styles.tile, on && styles.tileOn]}>
        <LinearGradient
          colors={item.colors.length > 1 ? item.colors : [item.colors[0], item.colors[0]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons name={ICON[item.id] || "sparkles"} size={20} color="rgba(255,255,255,0.9)" />
      </View>
      <Text style={[styles.label, on && { color: YELLOW }]} numberOfLines={1}>{item.label}</Text>
    </TouchableOpacity>
  );
});

function StickerSheet({ value, onChange, bottomInset = 0 }) {
  const render = useCallback(
    ({ item }) => <Tile item={item} on={item.id === value} onPress={onChange} />,
    [value, onChange]
  );
  return (
    <View style={[styles.sheet, { paddingBottom: bottomInset + 12 }]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => onChange("none")} hitSlop={10} style={styles.none}>
          <Ionicons name="ban-outline" size={20} color={value === "none" ? YELLOW : "#ddd"} />
        </TouchableOpacity>
        <Text style={styles.title}>Stickers</Text>
        <View style={styles.none} />
      </View>
      <FlatList
        data={STICKERS}
        keyExtractor={(i) => i.id}
        numColumns={5}
        renderItem={render}
        extraData={value}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 40,
    backgroundColor: "rgba(20,20,20,0.92)", borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingHorizontal: 8, paddingTop: 10,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  none: { width: 40, height: 30, alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 15, fontWeight: "700" },
  cell: { flex: 1, alignItems: "center", marginBottom: 12 },
  tile: {
    width: 50, height: 50, borderRadius: 6, overflow: "hidden", alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "transparent",
  },
  tileOn: { borderColor: YELLOW },
  label: { color: "#cfcfcf", fontSize: 10, marginTop: 4 },
});

export default memo(StickerSheet);
