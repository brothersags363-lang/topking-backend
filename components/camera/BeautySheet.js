// Camera "Beauty" bottom sheet: two tabs like the screenshot
//   Filter   -> Portrait / Scenery / Food / Style / Vibes + strength slider
//   Beautify -> Softening, Whitening, Clarity ... + Reset All
// Everything here is cheap to render: memoised rows, horizontal FlatLists
// with fixed item layout, slider moves on the UI thread.
import React, { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import FxSlider from "./FxSlider";
import FilterOverlay from "../FilterOverlay";

const { CATEGORIES, byCategory } = require("../../constants/filterLibrary");
const { BEAUTY } = require("../../constants/videoFx");

const YELLOW = "#FFD60A";
const THUMB = 52;
const ITEM_W = THUMB + 14;

// Small "face" swatch with the filter applied on top (no image assets).
const FilterThumb = memo(function FilterThumb({ item, selected, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={() => onPress(item.id)} style={styles.thumbItem}>
      <View style={[styles.thumb, selected && styles.thumbOn]}>
        {item.id === "none" ? (
          <View style={[StyleSheet.absoluteFill, styles.noneThumb]}>
            <Ionicons name="ban-outline" size={22} color="#fff" />
          </View>
        ) : (
          <>
            <LinearGradient
              colors={["#f6d2b8", "#c98f6c", "#5b3a2b"]}
              start={{ x: 0.3, y: 0 }}
              end={{ x: 0.7, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.thumbFace} />
            <FilterOverlay filterId={item.id} />
          </>
        )}
      </View>
      <Text numberOfLines={1} style={[styles.thumbLabel, selected && styles.thumbLabelOn]}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );
});

const BeautyItem = memo(function BeautyItem({ item, selected, value, onPress }) {
  const active = item.live && value > 0;
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={() => onPress(item)} style={styles.thumbItem}>
      <View style={[styles.beautyBox, selected && styles.thumbOn, !item.live && { opacity: 0.45 }]}>
        <Ionicons name={item.icon} size={24} color={active ? YELLOW : "#fff"} />
        {!item.live && (
          <View style={styles.soonBadge}>
            <Text style={styles.soonText}>Soon</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={[styles.thumbLabel, selected && styles.thumbLabelOn]}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );
});

const getItemLayout = (_, index) => ({ length: ITEM_W, offset: ITEM_W * index, index });

function BeautySheet({
  bottomInset = 0,
  filterId,
  onFilter,
  intensity,
  onIntensity,
  beauty,
  onBeauty,
  onResetBeauty,
  onCompare,
}) {
  const [tab, setTab] = useState("filter");
  const [cat, setCat] = useState(() => {
    const hit = CATEGORIES.find((c) => byCategory(c).some((f) => f.id === filterId));
    return hit || CATEGORIES[0];
  });
  const [beautyId, setBeautyId] = useState("soft");

  const filters = useMemo(() => [{ id: "none", label: "None" }, ...byCategory(cat)], [cat]);
  const selectedBeauty = BEAUTY.find((b) => b.id === beautyId) || BEAUTY[0];

  const renderFilter = useCallback(
    ({ item }) => <FilterThumb item={item} selected={item.id === filterId} onPress={onFilter} />,
    [filterId, onFilter]
  );

  const pickBeauty = useCallback((item) => {
    if (!item.live) return;
    setBeautyId(item.id);
  }, []);

  const renderBeauty = useCallback(
    ({ item }) => (
      <BeautyItem item={item} selected={item.id === beautyId} value={beauty[item.id] || 0} onPress={pickBeauty} />
    ),
    [beautyId, beauty, pickBeauty]
  );

  const showSlider = tab === "filter" ? filterId !== "none" : selectedBeauty.live;

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* slider + compare (sits on the camera, above the sheet) */}
      <View style={styles.sliderRow} pointerEvents="box-none">
        {showSlider ? (
          <FxSlider
            style={{ flex: 1 }}
            min={0}
            max={100}
            value={tab === "filter" ? intensity : beauty[beautyId] || 0}
            onChange={(v) => (tab === "filter" ? onIntensity(v) : onBeauty(beautyId, v))}
          />
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Pressable
          onPressIn={() => onCompare && onCompare(true)}
          onPressOut={() => onCompare && onCompare(false)}
          hitSlop={10}
          style={styles.compareBtn}
        >
          <Ionicons name="contrast-outline" size={22} color="#fff" />
        </Pressable>
      </View>

      <View style={[styles.sheet, { paddingBottom: bottomInset }]}>
        {tab === "filter" ? (
          <>
            <View style={styles.catRow}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity key={c} onPress={() => setCat(c)} hitSlop={6}>
                  <Text style={[styles.catText, cat === c && styles.catTextOn]}>{c}</Text>
                  {cat === c && <View style={styles.catLine} />}
                </TouchableOpacity>
              ))}
            </View>
            <FlatList
              key={cat}
              horizontal
              data={filters}
              keyExtractor={(i) => i.id}
              renderItem={renderFilter}
              getItemLayout={getItemLayout}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.listPad}
              initialNumToRender={7}
              windowSize={5}
            />
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.resetRow} onPress={onResetBeauty} hitSlop={6}>
              <Ionicons name="refresh" size={16} color="#ddd" />
              <Text style={styles.resetText}>Reset All</Text>
            </TouchableOpacity>
            <FlatList
              horizontal
              data={BEAUTY}
              keyExtractor={(i) => i.id}
              renderItem={renderBeauty}
              getItemLayout={getItemLayout}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.listPad}
              extraData={beauty}
            />
          </>
        )}

        <View style={styles.tabs}>
          <TouchableOpacity style={styles.tabBtn} onPress={() => setTab("filter")}>
            <Text style={[styles.tabText, tab === "filter" && styles.tabTextOn]}>Filter</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabBtn} onPress={() => setTab("beautify")}>
            <Text style={[styles.tabText, tab === "beautify" && styles.tabTextOn]}>Beautify</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 40 },
  sliderRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 18, marginBottom: 6 },
  compareBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", marginLeft: 10 },
  sheet: {
    backgroundColor: "rgba(20,20,20,0.96)",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
  },
  catRow: { flexDirection: "row", justifyContent: "center", gap: 22, marginBottom: 10 },
  catText: { color: "#9a9a9a", fontSize: 13, fontWeight: "500" },
  catTextOn: { color: "#fff", fontWeight: "700" },
  catLine: { alignSelf: "center", width: 14, height: 2, borderRadius: 1, backgroundColor: "#fff", marginTop: 3 },
  listPad: { paddingHorizontal: 10 },
  thumbItem: { width: ITEM_W, alignItems: "center" },
  thumb: {
    width: THUMB, height: THUMB, borderRadius: 6, overflow: "hidden",
    borderWidth: 2, borderColor: "transparent", backgroundColor: "#333",
  },
  thumbOn: { borderColor: YELLOW },
  noneThumb: { alignItems: "center", justifyContent: "center", backgroundColor: "#3a3a3a" },
  thumbFace: {
    position: "absolute", left: THUMB * 0.22, top: THUMB * 0.14, width: THUMB * 0.52, height: THUMB * 0.62,
    borderRadius: THUMB * 0.3, backgroundColor: "#f1c3a3",
  },
  thumbLabel: { color: "#cfcfcf", fontSize: 11, marginTop: 5 },
  thumbLabelOn: { color: YELLOW, fontWeight: "700" },
  beautyBox: {
    width: THUMB, height: THUMB, borderRadius: 6, borderWidth: 2, borderColor: "transparent",
    backgroundColor: "#2e2e2e", alignItems: "center", justifyContent: "center",
  },
  soonBadge: {
    position: "absolute", top: -1, right: -1, backgroundColor: "#555", borderRadius: 4,
    paddingHorizontal: 3, paddingVertical: 1,
  },
  soonText: { color: "#fff", fontSize: 8, fontWeight: "700" },
  resetRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 16, marginBottom: 10 },
  resetText: { color: "#ddd", fontSize: 12 },
  tabs: {
    flexDirection: "row", marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#333",
  },
  tabBtn: { flex: 1, height: 46, alignItems: "center", justifyContent: "center" },
  tabText: { color: "#8a8a8a", fontSize: 15, fontWeight: "600" },
  tabTextOn: { color: "#fff", fontWeight: "800" },
});

export default memo(BeautySheet);
