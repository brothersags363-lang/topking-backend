// Live PREVIEW of a camera "sticker" (light / frame effect). The final
// video gets the same effect from the server (constants/videoFx.js ->
// stickerFilter). Animations run on the native driver = smooth.
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const { STICKERS } = require("../../constants/videoFx");
const { height: SH } = Dimensions.get("window");

function MovingLight({ colors }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  const cols = colors.length > 1 ? colors : [colors[0], colors[0]];
  return (
    <Animated.View
      style={[
        styles.light,
        {
          transform: [
            { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-SH * 0.25, SH * 0.25] }) },
            { rotate: a.interpolate({ inputRange: [0, 1], outputRange: ["-12deg", "12deg"] }) },
          ],
        },
      ]}
    >
      <LinearGradient colors={cols} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

function StickerOverlay({ id }) {
  const st = useMemo(() => STICKERS.find((x) => x.id === id), [id]);
  if (!st) return null;

  let body = null;
  if (id === "cinema") {
    body = (
      <>
        <View style={[styles.bar, { top: 0 }]} />
        <View style={[styles.bar, { bottom: 0 }]} />
      </>
    );
  } else if (id === "polaroid") {
    body = <View style={styles.polaroid} />;
  } else if (id === "pinkframe") {
    body = <View style={styles.pinkFrame} />;
  } else if (id === "vhs") {
    body = (
      <View style={[StyleSheet.absoluteFill, { opacity: 0.25 }]}>
        {Array.from({ length: 90 }).map((_, i) => (
          <View key={i} style={styles.scan} />
        ))}
      </View>
    );
  } else {
    body = (
      <View style={[StyleSheet.absoluteFill, { opacity: 0.32, overflow: "hidden" }]}>
        <MovingLight colors={st.colors} />
      </View>
    );
  }
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 2 }]}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  light: { position: "absolute", left: "-30%", right: "-30%", top: "-25%", bottom: "-25%" },
  bar: { position: "absolute", left: 0, right: 0, height: "11%", backgroundColor: "#000" },
  polaroid: {
    ...StyleSheet.absoluteFillObject,
    borderColor: "#fff",
    borderLeftWidth: 26,
    borderRightWidth: 26,
    borderTopWidth: 60,
    borderBottomWidth: 150,
  },
  pinkFrame: { ...StyleSheet.absoluteFillObject, borderWidth: 14, borderColor: "rgba(255,79,163,0.75)" },
  scan: { height: 2, marginBottom: SH / 90 - 2, backgroundColor: "#000" },
});

export default React.memo(StickerOverlay);
