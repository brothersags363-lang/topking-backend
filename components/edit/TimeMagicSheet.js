// TIME MAGIC: Repeat (1 sec 3 baar) / Slow-mo (1 sec dheema) at a point.
// Final video me server lagata hai (2nd ffmpeg pass).
import React, { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import FxSlider from "../camera/FxSlider";

const YELLOW = "#FFD60A";
const OPTIONS = [
  { id: "none", label: "None", icon: "ban-outline" },
  { id: "repeat", label: "Repeat", icon: "repeat-outline" },
  { id: "slow", label: "Slow-mo", icon: "hourglass-outline" },
];

export default function TimeMagicSheet({ visible, magic, duration, onSave, onClose, bottomInset = 0 }) {
  const [type, setType] = useState(magic ? magic.type : "none");
  const [at, setAt] = useState(magic ? magic.at : 0);
  const maxAt = Math.max(0, Math.floor((duration - 1) * 10));

  useEffect(() => {
    if (visible) {
      setType(magic ? magic.type : "none");
      setAt(magic ? magic.at : Math.max(0, (duration - 1) / 2));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheet, { paddingBottom: bottomInset + 18 }]}>
          <Text style={styles.title}>Time Magic</Text>
          <View style={styles.row}>
            {OPTIONS.map((o) => (
              <TouchableOpacity key={o.id} style={styles.opt} onPress={() => setType(o.id)} activeOpacity={0.8}>
                <View style={[styles.circle, type === o.id && styles.circleOn]}>
                  <Ionicons name={o.icon} size={24} color="#fff" />
                </View>
                <Text style={[styles.label, type === o.id && { color: YELLOW }]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {type !== "none" && duration > 1.2 && (
            <>
              <Text style={styles.sub}>Kahan par: {at.toFixed(1)}s – {(at + 1).toFixed(1)}s</Text>
              <FxSlider min={0} max={Math.max(1, maxAt)} value={Math.round(at * 10)} color={YELLOW} onChange={(v) => setAt(v / 10)} />
            </>
          )}
          {type !== "none" && duration <= 1.2 && <Text style={styles.sub}>Video bahut chhoti hai.</Text>}
          <TouchableOpacity
            style={styles.done}
            onPress={() => onSave(type === "none" ? null : { type, at: +at.toFixed(2) })}
          >
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#1e1e1e", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 18 },
  title: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 14 },
  row: { flexDirection: "row", justifyContent: "space-around", marginBottom: 10 },
  opt: { alignItems: "center", width: 80 },
  circle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: "#2b2b2b", alignItems: "center",
    justifyContent: "center", borderWidth: 2, borderColor: "transparent",
  },
  circleOn: { borderColor: YELLOW },
  label: { color: "#ddd", fontSize: 12, marginTop: 6 },
  sub: { color: "#aaa", fontSize: 13, marginTop: 6 },
  done: { height: 44, borderRadius: 6, backgroundColor: YELLOW, alignItems: "center", justifyContent: "center", marginTop: 16 },
  doneText: { color: "#000", fontSize: 15, fontWeight: "700" },
});
