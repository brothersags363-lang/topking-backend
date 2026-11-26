// GRAFFITI: finger se video par likho / draw karo. Strokes are stored
// normalized (0..1) to the video picture, so the server (ASS vector
// drawing via libass) puts them exactly where you drew them.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, PanResponder, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { VideoView } from "expo-video";
import { fitContain, GraffitiLayer } from "./editHelpers";

const YELLOW = "#FFD60A";
const COLORS = ["#ffffff", "#000000", "#ff2d55", "#ffd60a", "#00e676", "#00b0ff", "#7c4dff", "#ff4fa3"];
const SIZES = [0.006, 0.012, 0.022];

export default function GraffitiEditor({ visible, player, videoSize, strokes, onSave, onClose }) {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState(strokes || []);
  const [live, setLive] = useState(null);
  const [color, setColor] = useState("#ff2d55");
  const [size, setSize] = useState(SIZES[1]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const rect = useMemo(() => fitContain(box.w, box.h, videoSize?.width, videoSize?.height), [box, videoSize]);
  const rectRef = useRef(rect);
  rectRef.current = rect;
  const penRef = useRef({ color, size });
  penRef.current = { color, size };
  const liveRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setList(strokes || []);
      try { player.pause(); } catch (_) {}
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const norm = (e) => {
    const r = rectRef.current;
    const x = (e.nativeEvent.locationX - r.x) / (r.w || 1);
    const y = (e.nativeEvent.locationY - r.y) / (r.h || 1);
    return [Math.max(0, Math.min(1, +x.toFixed(4))), Math.max(0, Math.min(1, +y.toFixed(4)))];
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          liveRef.current = { c: penRef.current.color, w: penRef.current.size, p: [norm(e)] };
          setLive({ ...liveRef.current });
        },
        onPanResponderMove: (e) => {
          const st = liveRef.current;
          if (!st) return;
          const q = norm(e);
          const last = st.p[st.p.length - 1];
          // chhote moves skip (kam points = smooth + chhota data)
          if (Math.abs(q[0] - last[0]) + Math.abs(q[1] - last[1]) < 0.004) return;
          if (st.p.length >= 400) return;
          st.p.push(q);
          if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(() => {
              rafRef.current = null;
              if (liveRef.current) setLive({ ...liveRef.current, p: [...liveRef.current.p] });
            });
          }
        },
        onPanResponderRelease: () => {
          const st = liveRef.current;
          liveRef.current = null;
          setLive(null);
          if (st) setList((l) => [...l, st].slice(-60));
        },
      }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.top}>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Graffiti</Text>
          <TouchableOpacity onPress={() => onSave(list)} hitSlop={10}>
            <Ionicons name="checkmark" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        <View
          style={styles.canvas}
          onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          {...pan.panHandlers}
        >
          {visible && (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
            </View>
          )}
          <GraffitiLayer strokes={list} live={live} rect={rect} />
        </View>

        <View style={styles.tools}>
          <TouchableOpacity onPress={() => setList((l) => l.slice(0, -1))} style={styles.toolBtn} hitSlop={6}>
            <Ionicons name="arrow-undo-outline" size={22} color="#fff" />
          </TouchableOpacity>
          {SIZES.map((sz) => (
            <TouchableOpacity key={sz} onPress={() => setSize(sz)} style={styles.toolBtn}>
              <View
                style={{
                  width: 6 + sz * 600, height: 6 + sz * 600, borderRadius: 20,
                  backgroundColor: size === sz ? YELLOW : "#fff",
                }}
              />
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setList([])} style={styles.toolBtn} hitSlop={6}>
            <Ionicons name="trash-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.colors}>
          {COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => setColor(c)}
              style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}
            />
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, height: 40 },
  title: { color: "#fff", fontSize: 16, fontWeight: "700" },
  canvas: { flex: 1, marginVertical: 8 },
  tools: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", height: 44 },
  toolBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  colors: { flexDirection: "row", justifyContent: "center", gap: 12, marginTop: 6 },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "#555" },
  swatchOn: { borderColor: YELLOW, transform: [{ scale: 1.15 }] },
});
