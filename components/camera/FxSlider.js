// Smooth horizontal slider (no extra native package needed).
// - Knob moves on the UI thread via Animated (no re-render per pixel).
// - onChange is called at most once per frame, onEnd once on release.
// - Supports bipolar ranges (e.g. -100..100) with the fill starting at 0.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, Text, View } from "react-native";

const KNOB = 18;

function FxSlider({ min = 0, max = 100, value = 0, onChange, onEnd, color = "#fff", style }) {
  const [width, setWidth] = useState(0);
  const [label, setLabel] = useState(Math.round(value));
  const x = useRef(new Animated.Value(0)).current;
  const widthRef = useRef(0);
  const startRef = useRef(0);
  const curRef = useRef(value);
  const rafRef = useRef(null);
  const cbRef = useRef({ onChange, onEnd });
  cbRef.current = { onChange, onEnd };

  const toX = (v, w) => ((v - min) / (max - min)) * w;
  const toV = (px, w) => Math.round(min + (Math.max(0, Math.min(w, px)) / (w || 1)) * (max - min));

  // External value change (e.g. switching beauty item / Reset All)
  useEffect(() => {
    curRef.current = value;
    setLabel(Math.round(value));
    if (widthRef.current) x.setValue(toX(value, widthRef.current));
  }, [value, min, max]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          // tap anywhere on the track jumps there
          const px = e.nativeEvent.locationX - KNOB / 2;
          startRef.current = Math.max(0, Math.min(widthRef.current, px));
          move(startRef.current);
        },
        onPanResponderMove: (_, g) => move(startRef.current + g.dx),
        onPanResponderRelease: () => cbRef.current.onEnd && cbRef.current.onEnd(curRef.current),
        onPanResponderTerminate: () => cbRef.current.onEnd && cbRef.current.onEnd(curRef.current),
      }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  function move(px) {
    const w = widthRef.current;
    if (!w) return;
    const clamped = Math.max(0, Math.min(w, px));
    x.setValue(clamped);
    const v = toV(clamped, w);
    if (v === curRef.current) return;
    curRef.current = v;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setLabel(curRef.current);
      cbRef.current.onChange && cbRef.current.onChange(curRef.current);
    });
  }

  useEffect(() => () => rafRef.current && cancelAnimationFrame(rafRef.current), []);

  const zeroX = width ? toX(Math.max(min, Math.min(max, 0)), width) : 0;
  const bipolar = min < 0;

  return (
    <View style={[styles.wrap, style]}>
      <View
        style={styles.touch}
        onLayout={(e) => {
          const w = Math.max(1, e.nativeEvent.layout.width - KNOB);
          widthRef.current = w;
          setWidth(w);
          x.setValue(toX(curRef.current, w));
        }}
        {...pan.panHandlers}
      >
        <View style={styles.track} />
        {width > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.fill,
              { backgroundColor: color, left: KNOB / 2 + (bipolar ? zeroX : 0), width: 1 },
              {
                transform: [
                  { translateX: Animated.multiply(Animated.subtract(x, bipolar ? zeroX : 0), 0.5) },
                  { scaleX: Animated.add(Animated.subtract(x, bipolar ? zeroX : 0), 0.001) },
                ],
              },
            ]}
          />
        )}
        <Animated.View pointerEvents="none" style={[styles.knobWrap, { transform: [{ translateX: x }] }]}>
          <Text style={styles.value}>{label}</Text>
          <View style={styles.knob} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 46, justifyContent: "flex-end" },
  touch: { height: 46, justifyContent: "center" },
  track: {
    position: "absolute", left: KNOB / 2, right: KNOB / 2, top: 30, height: 2,
    borderRadius: 1, backgroundColor: "rgba(255,255,255,0.35)",
  },
  fill: { position: "absolute", top: 30, height: 2 },
  knobWrap: { position: "absolute", left: KNOB / 2 - 25, top: 0, width: 50, alignItems: "center" },
  value: {
    color: "#fff", fontSize: 13, fontWeight: "600", width: 50, textAlign: "center", marginBottom: 2,
    textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 },
  },
  knob: {
    width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: "#fff",
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 3, elevation: 3,
  },
});

export default React.memo(FxSlider);
