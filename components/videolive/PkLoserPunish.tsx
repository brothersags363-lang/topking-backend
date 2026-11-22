// @ts-nocheck
import React, { useEffect, useRef, memo } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { PK_RESULT_SHOW_MS, width, height } from './constants';

// ---------- LOSER punishment (shown on the losing panel for PK_RESULT_SHOW_MS) ----------
// BOMB drops on the face -> fuse burns -> BOOM (fireball, shock ring, sparks, flash) ->
// face turns black, burnt hair, eyes cry (tears), moustache + beard appear, mouth bawls. No emoji, all drawn with shapes.
// Face TRACKING: the losing host's Agora face detection (onFacePositionChanged) is sent through
// Firestore (rooms/{id}.pk.face, fractions 0..1) and the whole face group follows it smoothly.
// Face data na mile (device unsupported) → fixed jagah par dikhta hai.
export const FACE_PAD = 1.35; // tracked face rect x yeh = kale chehre ka size (kaan/sir cover)
export const FACE_SMOOTH_MS = 200; // movement smoothing
export const FACE_FALLBACK_Y = 0.36; // face data na ho to panel height ka fraction
export const FACE_FALLBACK_W = 0.5; // face data na ho to panel width ka fraction
export const FACE_FLIP_X = false; // agar mooch/aansu left-right ULTE chalein to true karo

export const Tear = ({ x, y, fall, delay }: { x: number; y: number; fall: number; delay: number }) => {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: x - 5,
        top: y,
        width: 10,
        height: 14,
        borderTopLeftRadius: 5,
        borderTopRightRadius: 5,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
        backgroundColor: "#5CC8FF",
        borderWidth: 1,
        borderColor: "#BFE9FF",
        opacity: t.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 0.9, 0] }),
        transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, fall] }) }],
      }}
    />
  );
};

// face = { cx, cy, w, h, ar } (fractions of the camera image, ar = image width / height)
// mirror = true when this panel is the host's OWN local preview on the front camera
export const FW = 100; // design units of the face group (it is scaled to the real face)
export const FH = 112;
export const BOMB_BOOM_AT = 1100; // ms: bomb sits on the face, fuse burns, then BOOM

// Smoke puff that keeps rising from the burnt face after the blast
export const Smoke = memo(({ x, size, start }: { x: number; size: number; start: number }) => {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const seq = Animated.sequence([
      Animated.delay(start),
      Animated.loop(
        Animated.sequence([
          Animated.timing(t, { toValue: 1, duration: 1900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ),
    ]);
    seq.start();
    return () => seq.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: x - size / 2,
        top: FH * 0.12,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "rgba(70,64,64,0.8)",
        opacity: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.85, 0] }),
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -FH * 0.95] }) },
          { translateX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 6, -4] }) },
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.7] }) },
        ],
      }}
    />
  );
});

// flying spark of the blast
export const SPARKS = Array.from({ length: 12 }, (_, i) => ({
  ang: (i / 12) * Math.PI * 2 + (i % 2) * 0.16,
  dist: FW * (0.78 + (i % 3) * 0.24),
  size: 4 + (i % 3) * 1.6,
  color: ["#FFE066", "#FF9F1C", "#FFFFFF"][i % 3],
}));
export const Spark = memo(({ boom, ang, dist, size, color }: any) => (
  <Animated.View
    style={{
      position: "absolute",
      left: FW / 2 - size / 2,
      top: FH / 2 - size,
      width: size,
      height: size * 2.2,
      borderRadius: size,
      backgroundColor: color,
      opacity: boom.interpolate({ inputRange: [0, 0.05, 0.7, 1], outputRange: [0, 1, 0.9, 0] }),
      transform: [
        { translateX: boom.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(ang) * dist] }) },
        { translateY: boom.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(ang) * dist] }) },
        { rotate: `${(ang * 180) / Math.PI + 90}deg` },
        { scaleY: boom.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.6, 0.5] }) },
      ],
    }}
  />
));

// burnt, standing-up hair spikes along the top of the face oval
export const HAIR = [0.15, 0.27, 0.39, 0.5, 0.61, 0.73, 0.85];
export const HairSpike = ({ u, i }: { u: number; i: number }) => {
  const t = (u - 0.5) / 0.5; // -1 .. 1
  const baseY = (FH / 2) * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
  const h = FH * (0.2 + (i % 3) * 0.06);
  const w = FW * 0.07;
  return (
    <View
      style={{
        position: "absolute",
        left: u * FW - w,
        top: baseY - h * 0.7,
        width: 0,
        height: 0,
        borderLeftWidth: w,
        borderRightWidth: w,
        borderBottomWidth: h,
        borderLeftColor: "transparent",
        borderRightColor: "transparent",
        borderBottomColor: "#141010",
        transform: [{ rotate: `${t * 38}deg` }],
      }}
    />
  );
};

export const PkLoserPunish = memo(({ panelW, panelH, face, mirror }: { panelW: number; panelH: number; face?: any; mirror?: boolean }) => {
  const bombIn = useRef(new Animated.Value(0)).current; // bomb pops onto the face
  const fuse = useRef(new Animated.Value(0)).current; // 0..1 while the fuse burns (shake + swell + spark)
  const bombGone = useRef(new Animated.Value(0)).current;
  const boom = useRef(new Animated.Value(0)).current; // blast
  const flash = useRef(new Animated.Value(0)).current; // white screen flash
  const quake = useRef(new Animated.Value(0)).current; // face shakes after the blast
  const soot = useRef(new Animated.Value(0)).current; // face turns black
  const props = useRef(new Animated.Value(0)).current; // moustache / beard / mouth pop in
  const cry = useRef(new Animated.Value(0)).current; // mouth bawling loop
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const sc = useRef(new Animated.Value(1)).current;
  const firstPos = useRef(true);

  // timeline: bomb -> fuse burns -> BOOM -> face black -> moustache + beard + crying
  useEffect(() => {
    const timeline = Animated.parallel([
      Animated.spring(bombIn, { toValue: 1, friction: 5, tension: 110, useNativeDriver: true }),
      Animated.timing(fuse, { toValue: 1, duration: BOMB_BOOM_AT, easing: Easing.linear, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(BOMB_BOOM_AT),
        Animated.parallel([
          Animated.timing(bombGone, { toValue: 1, duration: 60, useNativeDriver: true }),
          Animated.timing(boom, { toValue: 1, duration: 850, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(quake, { toValue: 1, duration: 650, easing: Easing.linear, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(flash, { toValue: 1, duration: 70, useNativeDriver: true }),
            Animated.timing(flash, { toValue: 0, duration: 450, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(160),
            Animated.timing(soot, { toValue: 1, duration: 600, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(750),
            Animated.spring(props, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
          ]),
        ]),
      ]),
    ]);
    timeline.start();
    const bawl = Animated.loop(
      Animated.sequence([
        Animated.timing(cry, { toValue: 1, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(cry, { toValue: 0, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    bawl.start();
    return () => {
      timeline.stop();
      bawl.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // follow the face
  useEffect(() => {
    const baseX = panelW / 2;
    const baseY = panelH * FACE_FALLBACK_Y;
    let cxp = baseX;
    let cyp = baseY;
    let wpx = panelW * FACE_FALLBACK_W;
    const hasFace = !!(face && Number(face.ar) > 0 && Number(face.w) > 0);
    if (hasFace) {
      // the video fills the panel (crop): same maths as Agora's "hidden" render mode
      const ar = Number(face.ar);
      const k = Math.max(panelW / ar, panelH);
      const dw = ar * k;
      const dh = k;
      const ox = (panelW - dw) / 2;
      const oy = (panelH - dh) / 2;
      let fx = Number(face.cx);
      if (mirror !== FACE_FLIP_X) fx = 1 - fx; // front-cam local preview is mirrored
      cxp = ox + fx * dw;
      cyp = oy + Number(face.cy) * dh;
      wpx = Number(face.w) * dw * FACE_PAD;
    }
    const toX = cxp - baseX;
    const toY = cyp - baseY;
    const toS = Math.max(0.3, Math.min(4, wpx / FW));
    if (firstPos.current) {
      // snap (no sliding) to the first real face position; until it arrives sit at the fallback spot
      tx.setValue(toX);
      ty.setValue(toY);
      sc.setValue(toS);
      if (hasFace) firstPos.current = false;
      return;
    }
    Animated.parallel([
      Animated.timing(tx, { toValue: toX, duration: FACE_SMOOTH_MS, useNativeDriver: true }),
      Animated.timing(ty, { toValue: toY, duration: FACE_SMOOTH_MS, useNativeDriver: true }),
      Animated.timing(sc, { toValue: toS, duration: FACE_SMOOTH_MS, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face?.cx, face?.cy, face?.w, face?.ar, mirror, panelW, panelH]);

  // ---- layout of the face parts (design units) ----
  const eyeY = FH * 0.36;
  const eyeDX = FW * 0.2;
  const eyeW = FW * 0.22;
  const eyeH = eyeW * 0.78;
  const lx = FW / 2 - eyeDX;
  const rx = FW / 2 + eyeDX;
  const browY = eyeY - eyeH * 0.95;
  const mustY = FH * 0.6;
  const mustW = FW * 0.36;
  const mustH = FW * 0.12;
  const mouthW = FW * 0.3;
  const mouthH = FH * 0.17;
  const mouthY = FH * 0.74;
  const beardW = FW * 0.84;
  const beardH = FH * 0.52;
  const beardTop = FH * 0.64;
  const fall = FH * 0.95;
  const B = FW * 0.62; // bomb size

  const eye = (x: number) => (
    <>
      {/* water pooling under the eye */}
      <View
        style={{
          position: "absolute",
          left: x - eyeW * 0.55,
          top: eyeY + eyeH * 0.25,
          width: eyeW * 1.1,
          height: eyeH * 0.55,
          borderRadius: eyeW,
          backgroundColor: "rgba(120,205,255,0.5)",
        }}
      />
      <View
        style={{
          position: "absolute",
          left: x - eyeW / 2,
          top: eyeY - eyeH / 2,
          width: eyeW,
          height: eyeH,
          borderRadius: eyeW,
          backgroundColor: "#fff",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: eyeH * 0.62,
            height: eyeH * 0.62,
            borderRadius: eyeH,
            backgroundColor: "#0b0b0b",
            marginTop: eyeH * 0.1,
          }}
        >
          <View
            style={{
              position: "absolute",
              left: eyeH * 0.12,
              top: eyeH * 0.1,
              width: eyeH * 0.18,
              height: eyeH * 0.18,
              borderRadius: eyeH,
              backgroundColor: "#fff",
            }}
          />
        </View>
      </View>
    </>
  );

  const brow = (x: number, rot: string) => (
    <View
      style={{
        position: "absolute",
        left: x - eyeW * 0.6,
        top: browY,
        width: eyeW * 1.2,
        height: FH * 0.034,
        borderRadius: 3,
        backgroundColor: "#d8cfc8",
        transform: [{ rotate: rot }],
      }}
    />
  );

  const shakeX = quake.interpolate({
    inputRange: [0, 0.08, 0.16, 0.26, 0.38, 0.52, 0.7, 1],
    outputRange: [0, -9, 9, -7, 5, -3, 1, 0],
  });
  const bombRot = fuse.interpolate({
    inputRange: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
    outputRange: ["0deg", "-5deg", "5deg", "-5deg", "6deg", "-7deg", "7deg", "-9deg", "9deg", "-12deg", "12deg"],
  });
  const bombScale = Animated.multiply(
    bombIn.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }),
    fuse.interpolate({ inputRange: [0, 0.65, 1], outputRange: [1, 1, 1.28] })
  );
  const sparkFlick = fuse.interpolate({
    inputRange: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
    outputRange: [1, 1.7, 1, 1.8, 1.1, 1.9, 1, 1.8, 1.2, 2, 1.4],
  });
  const bodyD = B * 0.86;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      {/* panel gets a bit darker (smoke) */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: soot, backgroundColor: "rgba(0,0,0,0.2)" }]} />

      {/* everything below moves + scales with the tracked face */}
      <Animated.View
        style={{
          position: "absolute",
          left: panelW / 2 - FW / 2,
          top: panelH * FACE_FALLBACK_Y - FH / 2,
          width: FW,
          height: FH,
          transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
        }}
      >
        <Animated.View style={{ width: FW, height: FH, transform: [{ translateX: shakeX }] }}>
          {/* ---------- burnt hair ---------- */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: props }]}>
            {HAIR.map((u, i) => (
              <HairSpike key={i} u={u} i={i} />
            ))}
          </Animated.View>

          {/* ---------- black face (soft, 2 layers) ---------- */}
          <Animated.View
            style={{
              position: "absolute",
              left: -FW * 0.07,
              top: -FH * 0.07,
              width: FW * 1.14,
              height: FH * 1.14,
              borderRadius: FW,
              backgroundColor: "rgba(0,0,0,0.3)",
              opacity: soot,
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: FW,
              height: FH,
              borderRadius: FW,
              backgroundColor: "rgba(10,8,8,0.9)",
              opacity: soot,
            }}
          />

          {/* ---------- beard ---------- */}
          <Animated.View
            style={{
              position: "absolute",
              left: (FW - beardW) / 2,
              top: beardTop,
              width: beardW,
              height: beardH,
              borderTopLeftRadius: beardW * 0.22,
              borderTopRightRadius: beardW * 0.22,
              borderBottomLeftRadius: beardW * 0.5,
              borderBottomRightRadius: beardW * 0.5,
              backgroundColor: "#4A2A12",
              borderWidth: 1.5,
              borderColor: "#1a0d05",
              opacity: props,
              transform: [{ scale: props }],
              overflow: "hidden",
            }}
          >
            {[0.2, 0.36, 0.5, 0.64, 0.8].map((p, i) => (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: beardW * p,
                  top: beardH * 0.3,
                  width: 2,
                  height: beardH * 0.62,
                  borderRadius: 1,
                  backgroundColor: "rgba(160,100,50,0.55)",
                }}
              />
            ))}
          </Animated.View>

          {/* ---------- eyes + brows ---------- */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: soot }]}>
            {eye(lx)}
            {eye(rx)}
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: props }]}>
            {brow(lx, "-20deg")}
            {brow(rx, "20deg")}
          </Animated.View>

          {/* ---------- tears (streaks + falling drops) ---------- */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: props }]}>
            <View
              style={{
                position: "absolute",
                left: lx - 2.5,
                top: eyeY + eyeH * 0.5,
                width: 5,
                height: FH * 0.34,
                borderRadius: 3,
                backgroundColor: "rgba(120,205,255,0.35)",
              }}
            />
            <View
              style={{
                position: "absolute",
                left: rx - 2.5,
                top: eyeY + eyeH * 0.5,
                width: 5,
                height: FH * 0.34,
                borderRadius: 3,
                backgroundColor: "rgba(120,205,255,0.35)",
              }}
            />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: soot }]}>
            {[0, 1, 2].map((i) => (
              <React.Fragment key={i}>
                <Tear x={lx + (i - 1) * 3} y={eyeY + eyeH * 0.4} fall={fall} delay={i * 330} />
                <Tear x={rx + (i - 1) * 3} y={eyeY + eyeH * 0.4} fall={fall} delay={i * 330 + 140} />
              </React.Fragment>
            ))}
          </Animated.View>

          {/* ---------- bawling mouth ---------- */}
          <Animated.View
            style={{
              position: "absolute",
              left: FW / 2 - mouthW / 2,
              top: mouthY,
              width: mouthW,
              height: mouthH,
              borderRadius: mouthW,
              backgroundColor: "#6e0d1b",
              borderWidth: 1.5,
              borderColor: "#240407",
              overflow: "hidden",
              opacity: props,
              transform: [
                { scale: props },
                { scaleY: cry.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.2] }) },
              ],
            }}
          >
            <View
              style={{
                position: "absolute",
                left: mouthW * 0.2,
                bottom: -mouthH * 0.15,
                width: mouthW * 0.6,
                height: mouthH * 0.5,
                borderRadius: mouthW,
                backgroundColor: "#ee6a85",
              }}
            />
          </Animated.View>

          {/* ---------- moustache (2 curls) ---------- */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: props, transform: [{ scale: props }] }]}>
            <View
              style={{
                position: "absolute",
                left: FW / 2 - mustW,
                top: mustY,
                width: mustW,
                height: mustH,
                borderTopLeftRadius: mustH,
                borderBottomLeftRadius: mustH * 0.2,
                borderTopRightRadius: mustH * 0.4,
                borderBottomRightRadius: mustH,
                backgroundColor: "#6B3E1A",
                borderWidth: 1.5,
                borderColor: "#1a0d05",
                transform: [{ rotate: "-9deg" }],
              }}
            />
            <View
              style={{
                position: "absolute",
                left: FW / 2,
                top: mustY,
                width: mustW,
                height: mustH,
                borderTopRightRadius: mustH,
                borderBottomRightRadius: mustH * 0.2,
                borderTopLeftRadius: mustH * 0.4,
                borderBottomLeftRadius: mustH,
                backgroundColor: "#6B3E1A",
                borderWidth: 1.5,
                borderColor: "#1a0d05",
                transform: [{ rotate: "9deg" }],
              }}
            />
          </Animated.View>

          {/* ---------- smoke rising from the burnt face ---------- */}
          <Smoke x={FW * 0.3} size={26} start={BOMB_BOOM_AT + 250} />
          <Smoke x={FW * 0.5} size={34} start={BOMB_BOOM_AT + 700} />
          <Smoke x={FW * 0.7} size={26} start={BOMB_BOOM_AT + 1150} />

          {/* ---------- BOMB on the face ---------- */}
          <Animated.View
            style={{
              position: "absolute",
              left: FW / 2 - B / 2,
              top: FH * 0.5 - B / 2,
              width: B,
              height: B,
              opacity: Animated.multiply(bombIn, bombGone.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })),
              transform: [{ scale: bombScale }, { rotate: bombRot }],
            }}
          >
            {/* body */}
            <View
              style={{
                position: "absolute",
                left: (B - bodyD) / 2,
                top: B * 0.14,
                width: bodyD,
                height: bodyD,
                borderRadius: bodyD / 2,
                backgroundColor: "#17171d",
                borderWidth: 2,
                borderColor: "#4b4b57",
              }}
            />
            {/* shine */}
            <View
              style={{
                position: "absolute",
                left: B * 0.22,
                top: B * 0.3,
                width: B * 0.2,
                height: B * 0.1,
                borderRadius: B,
                backgroundColor: "rgba(255,255,255,0.4)",
                transform: [{ rotate: "-32deg" }],
              }}
            />
            {/* cap */}
            <View
              style={{
                position: "absolute",
                left: B / 2 - B * 0.14,
                top: B * 0.05,
                width: B * 0.28,
                height: B * 0.15,
                borderRadius: 3,
                backgroundColor: "#6b6b78",
                borderWidth: 1.5,
                borderColor: "#2b2b33",
              }}
            />
            {/* fuse */}
            <View
              style={{
                position: "absolute",
                left: B / 2 - 1.5,
                top: -B * 0.1,
                width: 3,
                height: B * 0.18,
                borderRadius: 2,
                backgroundColor: "#c8a15a",
                transform: [{ rotate: "20deg" }],
              }}
            />
            <View
              style={{
                position: "absolute",
                left: B / 2 + B * 0.05,
                top: -B * 0.22,
                width: 3,
                height: B * 0.14,
                borderRadius: 2,
                backgroundColor: "#c8a15a",
                transform: [{ rotate: "-28deg" }],
              }}
            />
            {/* burning spark */}
            <Animated.View
              style={{
                position: "absolute",
                left: B / 2 + B * 0.02,
                top: -B * 0.36,
                width: B * 0.22,
                height: B * 0.22,
                borderRadius: B,
                backgroundColor: "#FF7A00",
                justifyContent: "center",
                alignItems: "center",
                transform: [{ scale: sparkFlick }],
              }}
            >
              <View style={{ width: B * 0.11, height: B * 0.11, borderRadius: B, backgroundColor: "#FFF2A0" }} />
            </Animated.View>
          </Animated.View>

          {/* ---------- BLAST (fireball, shock ring, sparks) ---------- */}
          <Animated.View
            style={{
              position: "absolute",
              left: FW / 2 - FW * 0.85,
              top: FH / 2 - FW * 0.85,
              width: FW * 1.7,
              height: FW * 1.7,
              borderRadius: FW,
              backgroundColor: "#FF5A00",
              opacity: boom.interpolate({ inputRange: [0, 0.04, 0.5, 1], outputRange: [0, 1, 0.8, 0] }),
              transform: [{ scale: boom.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.1, 1, 1.25] }) }],
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              left: FW / 2 - FW * 0.6,
              top: FH / 2 - FW * 0.6,
              width: FW * 1.2,
              height: FW * 1.2,
              borderRadius: FW,
              backgroundColor: "#FF9F1C",
              opacity: boom.interpolate({ inputRange: [0, 0.04, 0.35, 0.8], outputRange: [0, 1, 0.9, 0] }),
              transform: [{ scale: boom.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.1, 0.9, 1.05] }) }],
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              left: FW / 2 - FW * 0.35,
              top: FH / 2 - FW * 0.35,
              width: FW * 0.7,
              height: FW * 0.7,
              borderRadius: FW,
              backgroundColor: "#FFF3A0",
              opacity: boom.interpolate({ inputRange: [0, 0.04, 0.25, 0.5], outputRange: [0, 1, 0.8, 0] }),
              transform: [{ scale: boom.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.1, 1, 0.6] }) }],
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              left: FW / 2 - FW * 0.55,
              top: FH / 2 - FW * 0.55,
              width: FW * 1.1,
              height: FW * 1.1,
              borderRadius: FW,
              borderWidth: 4,
              borderColor: "rgba(255,255,255,0.9)",
              opacity: boom.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 0.9, 0] }),
              transform: [{ scale: boom.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.8] }) }],
            }}
          />
          {SPARKS.map((s, i) => (
            <Spark key={i} boom={boom} ang={s.ang} dist={s.dist} size={s.size} color={s.color} />
          ))}
        </Animated.View>
      </Animated.View>

      {/* white flash on the whole panel at the moment of the blast */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: "#fff", opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }) }]}
      />
    </View>
  );
});

