// Camera "Time" sheet (screenshot): Duration 15s/30s/60s, Countdown
// Off/3s/5s/10s, "Recording will pause in X s" with a draggable marker on
// a waveform, and a yellow "Start shooting" button.
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const YELLOW = "#FFD60A";
const DURATIONS = [15, 30, 60];
const COUNTDOWNS = [0, 3, 5, 10];
const BARS = 64;

// Stable pseudo-waveform (same shape every time for the same seed)
function makeBars(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const out = [];
  for (let i = 0; i < BARS; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const r = (h % 1000) / 1000;
    out.push(0.2 + 0.8 * Math.abs(Math.sin(i * 0.55 + r * 2)) * (0.5 + r * 0.5));
  }
  return out;
}

const Chip = memo(function Chip({ label, on, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
});

function TimeSheet({ duration, onDuration, countdown, onCountdown, stopAt, onStopAt, seed = "x", onStart, bottomInset = 0 }) {
  const bars = useMemo(() => makeBars(String(seed)), [seed]);
  const [w, setW] = useState(0);
  const wRef = useRef(0);
  const x = useRef(new Animated.Value(0)).current;
  const startX = useRef(0);
  const [label, setLabel] = useState(stopAt);
  const cb = useRef(onStopAt);
  cb.current = onStopAt;
  const durRef = useRef(duration);
  durRef.current = duration;

  useEffect(() => {
    setLabel(stopAt);
    if (wRef.current) x.setValue((stopAt / duration) * wRef.current);
  }, [stopAt, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          startX.current = e.nativeEvent.locationX;
          set(startX.current, false);
        },
        onPanResponderMove: (_, g) => set(startX.current + g.dx, false),
        onPanResponderRelease: (_, g) => set(startX.current + g.dx, true),
      }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  function set(px, commit) {
    const W = wRef.current;
    if (!W) return;
    const d = durRef.current;
    const clamped = Math.max(W / d, Math.min(W, px)); // minimum 1 second
    x.setValue(clamped);
    const sec = Math.round((clamped / W) * d * 10) / 10;
    setLabel(sec);
    if (commit && cb.current) cb.current(sec);
  }

  const filled = w ? Math.round((label / duration) * BARS) : BARS;

  return (
    <View style={[styles.sheet, { paddingBottom: 14 + bottomInset }]}>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Duration</Text>
        <View style={styles.chips}>
          {DURATIONS.map((d) => (
            <Chip key={d} label={`${d}s`} on={duration === d} onPress={() => onDuration(d)} />
          ))}
          <View style={styles.chipGhost} />
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Countdown</Text>
        <View style={styles.chips}>
          {COUNTDOWNS.map((c) => (
            <Chip key={c} label={c === 0 ? "Off" : `${c}s`} on={countdown === c} onPress={() => onCountdown(c)} />
          ))}
        </View>
      </View>

      <Text style={styles.pauseText}>Recording will pause in {Number(label).toFixed(1)}s</Text>

      <View
        style={styles.wave}
        onLayout={(e) => {
          const W = e.nativeEvent.layout.width;
          wRef.current = W;
          setW(W);
          x.setValue((stopAt / duration) * W);
        }}
        {...pan.panHandlers}
      >
        <View style={styles.barsRow} pointerEvents="none">
          {bars.map((h, i) => (
            <View
              key={i}
              style={[styles.bar, { height: 6 + h * 30, backgroundColor: i < filled ? YELLOW : "rgba(255,255,255,0.35)" }]}
            />
          ))}
        </View>
        <Animated.View pointerEvents="none" style={[styles.marker, { transform: [{ translateX: x }] }]}>
          <Text style={styles.markerText}>{Number(label).toFixed(1)}s</Text>
          <View style={styles.markerLine} />
        </Animated.View>
      </View>

      <TouchableOpacity style={styles.startBtn} onPress={onStart} activeOpacity={0.85}>
        <Text style={styles.startText}>Start shooting</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 40,
    backgroundColor: "rgba(20,20,20,0.96)", borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingHorizontal: 14, paddingTop: 16,
  },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  rowLabel: { color: "#fff", fontSize: 13, width: 86 },
  chips: { flex: 1, flexDirection: "row", justifyContent: "space-between" },
  chip: {
    minWidth: 50, height: 28, paddingHorizontal: 10, borderRadius: 14, alignItems: "center",
    justifyContent: "center", borderWidth: 1, borderColor: "transparent",
  },
  chipGhost: { minWidth: 50 },
  chipOn: { borderColor: YELLOW },
  chipText: { color: "#9a9a9a", fontSize: 13, fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  pauseText: { color: "#fff", fontSize: 13, marginBottom: 6 },
  wave: { height: 64, justifyContent: "flex-end", marginBottom: 14 },
  barsRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 44,
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 4, paddingHorizontal: 2,
  },
  bar: { width: 2, borderRadius: 1 },
  marker: { position: "absolute", left: -20, top: 0, width: 40, alignItems: "center" },
  markerText: { color: "#fff", fontSize: 10, marginBottom: 2 },
  markerLine: { width: 3, height: 48, borderRadius: 2, backgroundColor: "#fff" },
  startBtn: { height: 46, borderRadius: 6, backgroundColor: YELLOW, alignItems: "center", justifyContent: "center" },
  startText: { color: "#000", fontSize: 15, fontWeight: "700" },
});

export default memo(TimeSheet);
