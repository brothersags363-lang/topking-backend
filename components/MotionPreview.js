// Quick on-screen PREVIEW of the Dynamic / Beautiful / Split Screen effects
// (EditView). The real effect is rendered into the final video by the
// server (constants/videoFx.js -> ffmpeg). Everything here runs on the
// native driver (transform / opacity), so the preview stays smooth.
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

const loop = (anim, steps) =>
  Animated.loop(Animated.sequence(steps.map(([to, d, e]) =>
    Animated.timing(anim, { toValue: to, duration: d, easing: e || Easing.inOut(Easing.sin), useNativeDriver: true })
  )));

function MotionPreview({ motion = "none", children }) {
  const a = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    a.stopAnimation();
    a.setValue(0);
    let anim = null;
    switch (motion) {
      case "enlarge":
      case "soulout":
        anim = loop(a, [[1, 420], [0, 420]]);
        break;
      case "shake":
        anim = loop(a, [[1, 60, Easing.linear], [-1, 120, Easing.linear], [0, 60, Easing.linear]]);
        break;
      case "glitch":
        anim = loop(a, [[0, 900, Easing.linear], [1, 40, Easing.linear], [-1, 60, Easing.linear], [0, 40, Easing.linear]]);
        break;
      case "flash":
        anim = loop(a, [[0, 820, Easing.linear], [1, 30, Easing.linear], [0, 80, Easing.linear]]);
        break;
      case "hotwave":
      case "rainbow":
        anim = loop(a, [[1, 1600], [0, 1600]]);
        break;
      default:
        break;
    }
    if (anim) anim.start();
    return () => anim && anim.stop();
  }, [motion, a]);

  let transform = [];
  if (motion === "enlarge") transform = [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.2] }) }];
  if (motion === "soulout") transform = [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }];
  if (motion === "shake") transform = [
    { translateX: a.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) },
    { translateY: a.interpolate({ inputRange: [-1, 1], outputRange: [6, -6] }) },
  ];
  if (motion === "glitch") transform = [{ translateX: a.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] }) }];
  if (motion === "mirror") transform = [];

  const split = /^split|^mirror$/.test(motion);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform }]}>{children}</Animated.View>

      {motion === "flash" && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#fff", opacity: a }]} />
      )}
      {motion === "glitch" && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, {
            opacity: a.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.5, 0, 0.5] }),
            backgroundColor: "#ff00aa", mixBlendMode: "screen",
            transform: [{ translateX: a.interpolate({ inputRange: [-1, 1], outputRange: [12, -12] }) }],
          }]}
        />
      )}
      {(motion === "hotwave" || motion === "rainbow") && (
        <>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {
            backgroundColor: motion === "hotwave" ? "#ff5a00" : "#ff0080", opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }), mixBlendMode: "soft-light",
          }]} />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {
            backgroundColor: motion === "hotwave" ? "#00c8ff" : "#00ff88", opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }), mixBlendMode: "soft-light",
          }]} />
        </>
      )}
      {motion === "soulout" && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {
          backgroundColor: "#fff", opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] }),
        }]} />
      )}
      {motion === "dreamy" && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#ffe6f3", opacity: 0.22, mixBlendMode: "screen" }]} />
      )}
      {motion === "sparkle" && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#fff8d0", opacity: 0.15, mixBlendMode: "screen" }]} />
      )}
      {motion === "oldfilm" && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#a0782a", opacity: 0.35, mixBlendMode: "color" }]} />
      )}
      {split && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {motion === "split2" && <View style={styles.hLine} />}
          {motion === "split3" && (
            <>
              <View style={[styles.hLine, { top: "33.3%" }]} />
              <View style={[styles.hLine, { top: "66.6%" }]} />
            </>
          )}
          {motion === "split4" && (
            <>
              <View style={styles.hLine} />
              <View style={styles.vLine} />
            </>
          )}
          {motion === "mirror" && <View style={styles.vLine} />}
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Split screen final video me dikhega</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hLine: { position: "absolute", left: 0, right: 0, top: "50%", height: 1, backgroundColor: "rgba(255,255,255,0.7)" },
  vLine: { position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, backgroundColor: "rgba(255,255,255,0.7)" },
  badge: {
    position: "absolute", alignSelf: "center", top: "12%", backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
  },
  badgeText: { color: "#fff", fontSize: 11 },
});

export default React.memo(MotionPreview);
