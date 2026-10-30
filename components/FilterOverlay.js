// Draws an APPROXIMATE preview of a filter on top of a camera / video view.
// The real result is rendered by the server (ffmpeg) when the video is
// uploaded, so this is only a quick look while editing.
import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const { get, toOverlay } = require("../constants/filterLibrary");

const FilterOverlay = ({ filterId }) => {
  const f = filterId && filterId !== "none" ? get(filterId) : null;
  const o = React.useMemo(() => (f ? toOverlay(f) : null), [f]);
  if (!o) return null;

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
