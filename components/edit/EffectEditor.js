// Full-screen EFFECT editor (screenshot): X / ✓, video, play + timeline
// with coloured effect ranges, Dynamic / Beautiful / Split Screen tabs,
// Erase + effect circles, Undo.
//   Press & HOLD an effect = applied only while you hold (timed range).
//   Short TAP = applied to the whole video.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { VideoView } from "expo-video";
import MotionPreview from "../MotionPreview";
import FilterOverlay from "../FilterOverlay";
import { useOutTime, activeMotion } from "./editHelpers";

const { EFFECTS, EFFECT_TABS, rawToOut } = require("../../constants/videoFx");

const YELLOW = "#FFD60A";
const COLORS = ["#ff2d55", "#00e5ff", "#ffd60a", "#7c4dff", "#00e676", "#ff9100", "#ff4fa3", "#40c4ff"];
const colorOf = (id) => COLORS[Math.max(0, EFFECTS.findIndex((e) => e.id === id)) % COLORS.length];

export default function EffectEditor({ visible, player, fx, filterId, onSave, onClose }) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(fx);
  const [tab, setTab] = useState(EFFECT_TABS[0]);
  const [playing, setPlaying] = useState(false);
  const [holding, setHolding] = useState(null); // { m, s }
  const [barW, setBarW] = useState(0);
  const pressAt = useRef(0);

  useEffect(() => {
    if (visible) {
      setDraft(fx);
      setHolding(null);
      try { player.pause(); player.currentTime = 0; } catch (_) {}
      setPlaying(false);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = useOutTime(visible ? player : null, draft);
  const rawDur = Number(player?.duration || 0);
  const dur = Math.max(0.1, rawToOut(rawDur, draft.keep, draft.speed));

  const motionNow = holding ? holding.m : activeMotion(draft, t);

  const togglePlay = useCallback(() => {
    try {
      if (player.playing) { player.pause(); setPlaying(false); }
      else { player.play(); setPlaying(true); }
    } catch (_) {}
  }, [player]);

  const onPressIn = useCallback((id) => {
    pressAt.current = Date.now();
    if (id === "none") return;
    setHolding({ m: id, s: t });
    try { player.play(); setPlaying(true); } catch (_) {}
  }, [player, t]);

  const onPressOut = useCallback((id) => {
    const held = Date.now() - pressAt.current;
    if (id === "none") {
      setDraft((d) => ({ ...d, motion: "none", ranges: [] }));
      return;
    }
    const h = holding;
    setHolding(null);
    if (held < 350 || !h) {
      // TAP -> poori video par
      setDraft((d) => ({ ...d, motion: id }));
      return;
    }
    try { player.pause(); setPlaying(false); } catch (_) {}
    const e = Math.max(h.s + 0.1, t);
    setDraft((d) => ({ ...d, ranges: [...(d.ranges || []), { m: id, s: +h.s.toFixed(2), e: +e.toFixed(2) }].slice(-12) }));
  }, [holding, t, player]);

  const undo = useCallback(() => {
    setDraft((d) => {
      if (d.ranges && d.ranges.length) return { ...d, ranges: d.ranges.slice(0, -1) };
      return { ...d, motion: "none" };
    });
  }, []);

  const items = useMemo(
    () => [{ id: "none", label: "Erase", icon: "close-circle-outline" }].concat(EFFECTS.filter((e) => e.tab === tab)),
    [tab]
  );

  const close = (save) => {
    try { player.pause(); } catch (_) {}
    if (save) onSave(draft);
    else onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => close(false)} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.top}>
          <TouchableOpacity onPress={() => close(false)} hitSlop={10}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => close(true)} hitSlop={10}>
            <Ionicons name="checkmark" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.videoBox}>
          {visible && (
            <MotionPreview motion={motionNow}>
              <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
            </MotionPreview>
          )}
          <FilterOverlay filterId={filterId} fx={draft} />
        </View>

        {/* play + timeline */}
        <View style={styles.timeRow}>
          <TouchableOpacity onPress={togglePlay} hitSlop={10} style={{ width: 30 }}>
            <Ionicons name={playing ? "pause" : "play"} size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.timeline} onLayout={(e) => setBarW(e.nativeEvent.layout.width)}>
            {draft.motion && draft.motion !== "none" && (
              <View style={[styles.range, { left: 0, width: barW, backgroundColor: colorOf(draft.motion), opacity: 0.35 }]} />
            )}
            {(draft.ranges || []).map((r, i) => (
              <View
                key={i}
                style={[styles.range, { left: (r.s / dur) * barW, width: Math.max(2, ((r.e - r.s) / dur) * barW), backgroundColor: colorOf(r.m) }]}
              />
            ))}
            {holding && (
              <View
                style={[styles.range, { left: (holding.s / dur) * barW, width: Math.max(2, ((t - holding.s) / dur) * barW), backgroundColor: colorOf(holding.m) }]}
              />
            )}
            <View style={[styles.cursor, { left: Math.min(barW - 2, (t / dur) * barW) }]} />
          </View>
          <Text style={styles.durText}>{dur.toFixed(1)}s</Text>
        </View>

        <View style={styles.tabsRow}>
          {EFFECT_TABS.map((x) => (
            <TouchableOpacity key={x} onPress={() => setTab(x)} style={styles.tabBtn}>
              <Text style={[styles.tabText, tab === x && styles.tabOn]}>{x}</Text>
              {tab === x && <View style={styles.tabLine} />}
            </TouchableOpacity>
          ))}
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={undo} style={styles.undo} hitSlop={8}>
            <Ionicons name="arrow-undo-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.items}>
          {items.map((e) => {
            const on = e.id === "none" ? false : draft.motion === e.id || (holding && holding.m === e.id);
            return (
              <Pressable
                key={e.id}
                style={styles.item}
                onPressIn={() => onPressIn(e.id)}
                onPressOut={() => onPressOut(e.id)}
              >
                <View style={[styles.circle, on && { borderColor: YELLOW }, e.id !== "none" && { backgroundColor: colorOf(e.id) + "55" }]}>
                  <Ionicons name={e.icon} size={24} color="#fff" />
                </View>
                <Text style={[styles.label, on && { color: YELLOW }]} numberOfLines={1}>{e.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={styles.hint}>Dabaye rakho = utne hisse par effect · Tap = poori video</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  top: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, height: 40, alignItems: "center" },
  videoBox: { flex: 1, marginHorizontal: 40, marginVertical: 8, overflow: "hidden" },
  timeRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, height: 40 },
  timeline: { flex: 1, height: 26, backgroundColor: "#2a2a2a", borderRadius: 3, overflow: "hidden", marginHorizontal: 8 },
  range: { position: "absolute", top: 0, bottom: 0 },
  cursor: { position: "absolute", top: -2, bottom: -2, width: 2, backgroundColor: "#fff" },
  durText: { color: "#fff", fontSize: 11, width: 38, textAlign: "right" },
  tabsRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, marginTop: 6 },
  tabBtn: { paddingHorizontal: 8, paddingVertical: 8, alignItems: "center" },
  tabText: { color: "#8a8a8a", fontSize: 13, fontWeight: "600" },
  tabOn: { color: "#fff", fontWeight: "800" },
  tabLine: { width: 12, height: 2, borderRadius: 1, backgroundColor: "#fff", marginTop: 3 },
  undo: { width: 34, height: 26, borderRadius: 13, backgroundColor: "#2a2a2a", alignItems: "center", justifyContent: "center" },
  items: { paddingHorizontal: 10, paddingTop: 10, gap: 12 },
  item: { width: 60, alignItems: "center" },
  circle: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: "#2b2b2b", alignItems: "center",
    justifyContent: "center", borderWidth: 2, borderColor: "transparent",
  },
  label: { color: "#cfcfcf", fontSize: 11, marginTop: 5 },
  hint: { color: "#777", fontSize: 11, textAlign: "center", marginTop: 8 },
});
