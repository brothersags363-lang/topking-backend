// Horizontal filter picker (Original + all library filters).
// Used on the camera screen and the edit screen.
import React from "react";
import { ScrollView, TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const { FILTERS } = require("../constants/filterLibrary");

const ITEMS = [{ id: "none", label: "Original", icon: "ban-outline" }, ...FILTERS];

const FilterStrip = ({ value = "none", onChange, style }) => (
  <View style={[styles.wrap, style]}>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {ITEMS.map((f) => {
        const on = value === f.id;
        return (
          <TouchableOpacity
            key={f.id}
            activeOpacity={0.8}
            onPress={() => onChange && onChange(f.id)}
            style={styles.item}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={f.label}
          >
            <View style={[styles.circle, on && styles.circleOn]}>
              <Ionicons name={f.icon} size={22} color="#fff" />
            </View>
            <Text numberOfLines={1} style={[styles.label, on && styles.labelOn]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  wrap: { backgroundColor: "rgba(0,0,0,0.55)", paddingVertical: 10 },
  row: { paddingHorizontal: 12, gap: 12 },
  item: { width: 66, alignItems: "center" },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#2b2b2b",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  circleOn: { borderColor: "#FF2D55", backgroundColor: "#3a1a22" },
  label: { color: "#cfcfcf", fontSize: 11, marginTop: 5 },
  labelOn: { color: "#fff", fontWeight: "700" },
});

export default React.memo(FilterStrip);
