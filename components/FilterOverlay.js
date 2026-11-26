// Draws an APPROXIMATE preview of a filter on top of a camera / video view.
// The real result is rendered by the server (ffmpeg) when the video is
// uploaded, so this is only a quick look while editing.
import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const { get, toOverlay } = require("../constants/filterLibrary");
const { composeFilter } = require("../constants/videoFx");

// fx (optional): { intensity, beauty } from the camera Beauty sheet. When
// given, the preview uses the same filter+intensity+beauty mix the server
// renders, so preview and final video match.
const FilterOverlay = ({ filterId, fx }) => {
  const fxKey = fx ? JSON.stringify({ i: fx.intensity, b: fx.beauty }) : "";
  const f = React.useMemo(
    () => (fx ? composeFilter(filterId, fx) : filterId && filterId !== "none" ? get(filterId) : null),
    [filterId, fxKey] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const o = React.useMemo(() => (f ? toOverlay(f) : null), [f]);
  if (!o) return null;
  // Skin softening can't blur a live camera here, so it shows as a soft
  // bright haze; the real smoothing is rendered on the final video.
  const soft = f && f.smooth ? Math.min(0.12, f.smooth * 0.1) : 0;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {o.desaturate > 0 && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "#808080", opacity: o.desaturate, mixBlendMode: "saturation" },
          ]}
        />
      )}
      {o.tint && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: o.tint.color, opacity: o.tint.opacity, mixBlendMode: "soft-light" },
          ]}
        />
      )}
      {o.lift > 0 && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#fff", opacity: o.lift }]} />
      )}
      {o.glow > 0 && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "#fff", opacity: o.glow, mixBlendMode: "soft-light" },
          ]}
        />
      )}
      {soft > 0 && (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: "#ffe9dc", opacity: soft, mixBlendMode: "screen" }]}
        />
      )}
      {o.dim > 0 && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: o.dim }]} />
      )}
      {o.flag > 0 && (
        <View style={[StyleSheet.absoluteFill, { opacity: o.flag }]}>
          <View style={{ flex: 1, backgroundColor: "#D6112A" }} />
          <View style={{ flex: 1, backgroundColor: "#F4F4F4" }} />
        </View>
      )}
      {o.vignette > 0 && (
        <>
          <LinearGradient
            colors={[`rgba(0,0,0,${o.vignette * 0.8})`, "transparent"]}
            style={{ position: "absolute", top: 0, left: 0, right: 0, height: "30%" }}
          />
          <LinearGradient
            colors={["transparent", `rgba(0,0,0,${o.vignette * 0.8})`]}
            style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "30%" }}
          />
        </>
      )}
    </View>
  );
};

export default React.memo(FilterOverlay);
