// Small shared pieces for the Edit screen editors.
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Polyline, Circle } from "react-native-svg";
import MotionPreview from "../MotionPreview";

const { rawToOut } = require("../../constants/videoFx");

// contentFit="contain" rect of a video inside a box
export function fitContain(cw, ch, vw, vh) {
  if (!cw || !ch) return { x: 0, y: 0, w: cw || 0, h: ch || 0 };
  const va = vw && vh ? vw / vh : 9 / 16;
  const ca = cw / ch;
  if (va > ca) {
    const h = cw / va;
    return { x: 0, y: (ch - h) / 2, w: cw, h };
  }
  const w = ch * va;
  return { x: (cw - w) / 2, y: 0, w, h: ch };
}

// Current OUTPUT time (seconds) of a player, updated ~10x / sec.
export function useOutTime(player, fx) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!player) return undefined;
    let sub = null;
    try {
      sub = player.addListener("timeUpdate", (e) => {
        const raw = Number(e?.currentTime ?? 0);
        setT(rawToOut(raw, fx.keep, fx.speed));
      });
    } catch (_) {}
    return () => {
      try { sub && sub.remove(); } catch (_) {}
    };
  }, [player, fx.keep, fx.speed]);
  return t;
}

// Which motion effect is visible right now: a timed range wins over the
// whole-video effect.
export function activeMotion(fx, outT) {
  const r = (fx.ranges || []).find((x) => outT >= x.s && outT <= x.e);
  return r ? r.m : fx.motion || "none";
}

// MotionPreview that follows timed effects automatically
export function TimedMotion({ player, fx, extraMotion, children }) {
  const t = useOutTime(player, fx);
  const m = extraMotion || activeMotion(fx, t);
  return <MotionPreview motion={m}>{children}</MotionPreview>;
}

// Graffiti strokes drawn over the video's content rect (normalized 0..1)
export function GraffitiLayer({ strokes, rect, live }) {
  const all = useMemo(() => (live ? [...strokes, live] : strokes), [strokes, live]);
  if (!rect || !rect.w || !all.length) return null;
  return (
    <View pointerEvents="none" style={[styles.abs, { left: rect.x, top: rect.y, width: rect.w, height: rect.h }]}>
      <Svg width={rect.w} height={rect.h}>
        {all.map((st, i) => {
          const sw = Math.max(1, st.w * rect.h);
          if (st.p.length === 1) {
            return <Circle key={i} cx={st.p[0][0] * rect.w} cy={st.p[0][1] * rect.h} r={sw / 2} fill={st.c} />;
          }
          return (
            <Polyline
              key={i}
              points={st.p.map(([x, y]) => `${x * rect.w},${y * rect.h}`).join(" ")}
              stroke={st.c}
              strokeWidth={sw}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ abs: { position: "absolute" } });
