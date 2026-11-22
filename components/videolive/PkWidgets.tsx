// @ts-nocheck
import React, { useEffect, useRef, useState, memo } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { pkPanelHFixed, width, height } from './constants';
import { fmtClock } from './helpers';
import { styles } from './styles';

// ---------- PK countdown pill ----------
// Own state → only this tiny pill re-renders every tick (not the whole screen).
// Last 10 seconds: turns red and pulses, like every real PK.
export const PkTimerPill = memo(({ endAt, result }: { endAt: number; result?: boolean }) => {
  const calc = () => Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  const [left, setLeft] = useState(calc);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setLeft(calc());
    const i = setInterval(() => setLeft(calc()), 250);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endAt]);

  const urgent = !result && left > 0 && left <= 10;
  useEffect(() => {
    if (!urgent) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 320, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 320, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [urgent]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pkTimerPill, urgent && { backgroundColor: "rgba(220,38,38,0.95)" }, { transform: [{ scale: pulse }] }]}
    >
      {!result && (
        <Text style={styles.pkTimerPk}>
          <Text style={{ color: "#35C8FF" }}>P</Text>
          <Text style={{ color: "#FF3D9A" }}>K</Text>
        </Text>
      )}
      <Text style={styles.pkTimerTxt}>{fmtClock(left)}</Text>
    </Animated.View>
  );
});

// ---------- Tiki-style PK parts ----------
// Centre graphic: blue glove  ⚡  pink glove with a small "PK" plate (pulses softly).
export const PkGlovesVs = memo(({ startAt }: { startAt?: number }) => {
  const beat = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current; // pop-in
  const fade = useRef(new Animated.Value(1)).current;
  const [show, setShow] = useState(true);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    Animated.spring(enter, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
    // visible ~3s from the PK start (late joiners only see the remainder), then fade away
    const left = Math.max(0, 3000 - (Date.now() - (startAt || Date.now())));
    const t = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => setShow(false));
    }, left);
    return () => {
      loop.stop();
      clearTimeout(t);
    };
  }, []);
  if (!show) return null;
  const sc = beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  const pop = enter.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  return (
    <Animated.View pointerEvents="none" style={[styles.pkVsStage, { opacity: fade, transform: [{ scale: Animated.multiply(sc, pop) }] }]}>
      <Ionicons name="flash" size={104} color="rgba(255,225,60,0.95)" style={styles.pkVsBolt} />
      <MaterialCommunityIcons
        name="boxing-glove"
        size={54}
        color="#2F8CFF"
        style={[styles.pkGlove, { left: 0, transform: [{ scaleX: -1 }] }]}
      />
      <MaterialCommunityIcons name="boxing-glove" size={54} color="#FF2D75" style={[styles.pkGlove, { right: 0 }]} />
      <View style={styles.pkVsPlate}>
        <Text style={styles.pkVsPlateTxt}>
          <Text style={{ color: "#2F8CFF" }}>P</Text>
          <Text style={{ color: "#FF2D75" }}>K</Text>
        </Text>
      </View>
    </Animated.View>
  );
});

// Big result on each panel after the PK ends (Tiki style): winner = crown + gold WIN + confetti, loser = LOSE.
export const CONFETTI_COLORS = ["#FFD700", "#FF3D9A", "#35C8FF", "#7CFF6B", "#FF8A00", "#B388FF"];
export const PkConfetti = memo(() => {
  const N = 14;
  const vals = useRef(Array.from({ length: N }, () => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = vals.map((v, i) => {
      const l = Animated.loop(
        Animated.sequence([
          Animated.delay((i % 7) * 260),
          Animated.timing(v, { toValue: 1, duration: 1800 + (i % 4) * 300, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
      l.start();
      return l;
    });
    return () => loops.forEach((l) => l.stop());
  }, []);
  const pw = width / 2;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {vals.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            top: -12,
            left: ((i * 37) % 100) / 100 * (pw - 8),
            width: 6,
            height: 10,
            borderRadius: 1.5,
            backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            opacity: v.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, pkPanelHFixed + 20] }) },
              { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${360 + i * 40}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
});

// Tiki trophy (copied from the real screenshots).
// WIN : blue-purple dotted ring, pink disc, gold cup with star, gold ribbon with swallow-tails + pink gems, gold sparkle.
// LOSE: everything pale silver-blue, same shape, small cloud on the top-right.
// DRAW: blue version.
export const TrophyBadge = memo(({ kind, size = 84 }: { kind: "win" | "lose" | "draw"; size?: number }) => {
  const win = kind === "win";
  const draw = kind === "draw";
  const ring = win ? ["#6F6BFF", "#8B5CF6"] : draw ? ["#5EA8FF", "#9B7BFF"] : ["#C4CAE6", "#A3ABD0"];
  const disc = win ? ["#FF9DB0", "#EE5F7E"] : draw ? ["#9CC8FF", "#5E9BFF"] : ["#B3BAD9", "#9AA3C8"];
  const cup = win ? "#FFC928" : draw ? "#F2F7FF" : "#EEF1FA";
  const starCol = win ? "#FFE98A" : "#D5DBEF";
  const ribbon = win ? ["#FFDD55", "#F5A81C"] : draw ? ["#9FD0FF", "#4F8DFF"] : ["#D2DBF3", "#B3BFE3"];
  const tail = win ? "#E8920F" : draw ? "#3E78E6" : "#98A5CF";
  const label = win ? "WIN" : draw ? "DRAW" : "LOSE";
  const W = size * 1.3;
  const innerSz = size * 0.8;
  const rh = size * 0.27; // ribbon height
  const dots = Array.from({ length: 12 }, (_, i) => i);
  return (
    <View style={{ width: W, alignItems: "center" }}>
      {/* ring + disc + cup */}
      <LinearGradient
        colors={ring}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: size, height: size, borderRadius: size / 2, justifyContent: "center", alignItems: "center" }}
      >
        {dots.map((i) => {
          const ang = (i / dots.length) * Math.PI * 2;
          const r = size * 0.45;
          return (
            <View
              key={i}
              style={{
                position: "absolute",
                width: size * 0.035,
                height: size * 0.035,
                borderRadius: size,
                backgroundColor: "rgba(255,255,255,0.85)",
                left: size / 2 + r * Math.cos(ang) - size * 0.0175,
                top: size / 2 + r * Math.sin(ang) - size * 0.0175,
              }}
            />
          );
        })}
        <LinearGradient
          colors={disc}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={{ width: innerSz, height: innerSz, borderRadius: innerSz / 2, justifyContent: "center", alignItems: "center" }}
        >
          <Ionicons name="trophy" size={size * 0.56} color={cup} style={{ marginTop: -size * 0.06 }} />
          <Ionicons
            name="star"
            size={size * 0.15}
            color={starCol}
            style={{ position: "absolute", top: innerSz * 0.22 }}
          />
        </LinearGradient>
      </LinearGradient>

      {/* sparkle (win) / cloud (lose) */}
      {win && (
        <Ionicons name="star" size={size * 0.24} color="#FFD84D" style={{ position: "absolute", top: -size * 0.06, left: W * 0.08 }} />
      )}
      {!win && !draw && (
        <>
          <Ionicons name="cloud" size={size * 0.3} color="#F4F6FF" style={{ position: "absolute", top: size * 0.62, right: W * 0.02 }} />
          <Ionicons name="star" size={size * 0.12} color="#8E9BC9" style={{ position: "absolute", top: size * 0.02, left: W * 0.14 }} />
        </>
      )}

      {/* ribbon with swallow-tails */}
      <View style={{ marginTop: -size * 0.24, width: W, height: rh * 1.25, alignItems: "center" }}>
        <View style={{ position: "absolute", left: 0, top: rh * 0.25, width: W * 0.28, height: rh, backgroundColor: tail, borderRadius: 2 }} />
        <View style={{ position: "absolute", right: 0, top: rh * 0.25, width: W * 0.28, height: rh, backgroundColor: tail, borderRadius: 2 }} />
        {/* swallow-tail notches */}
        <View style={{ position: "absolute", left: -rh * 0.28, top: rh * 0.25 + rh * 0.22, width: rh * 0.56, height: rh * 0.56, backgroundColor: "#1B1545", transform: [{ rotate: "45deg" }] }} />
        <View style={{ position: "absolute", right: -rh * 0.28, top: rh * 0.25 + rh * 0.22, width: rh * 0.56, height: rh * 0.56, backgroundColor: "#1B1545", transform: [{ rotate: "45deg" }] }} />
        <LinearGradient
          colors={ribbon}
          style={{ width: W * 0.82, height: rh, borderRadius: 3, justifyContent: "center", alignItems: "center" }}
        >
          <Text
            style={{
              color: "#fff",
              fontSize: size * 0.21,
              fontWeight: "900",
              fontStyle: "italic",
              letterSpacing: 0.3,
              textShadowColor: win ? "rgba(160,80,0,0.55)" : "rgba(80,90,140,0.5)",
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 2,
            }}
          >
            {label}
          </Text>
        </LinearGradient>
        {win && (
          <>
            <View style={{ position: "absolute", left: W * 0.1, top: -rh * 0.1, width: size * 0.1, height: size * 0.1, borderRadius: size, backgroundColor: "#FF5C8A" }} />
            <View style={{ position: "absolute", right: W * 0.1, top: -rh * 0.1, width: size * 0.1, height: size * 0.1, borderRadius: size, backgroundColor: "#FF5C8A" }} />
          </>
        )}
      </View>
    </View>
  );
});

export const resultKind = (r?: string): "win" | "lose" | "draw" => (r === "win" ? "win" : r === "draw" ? "draw" : "lose");

// Big trophy in the middle for the first ~3.5s after the PK ends (Tiki), then it shrinks away.
export const PkCenterTrophy = memo(({ result, endedAt }: { result?: string; endedAt?: number }) => {
  const pop = useRef(new Animated.Value(0)).current;
  const [show, setShow] = useState(true);
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
    const left = Math.max(0, 3500 - (Date.now() - (Number(endedAt) || Date.now())));
    const t = setTimeout(() => {
      Animated.timing(pop, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setShow(false));
    }, left);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!show || !result) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pkCenterTrophy,
        { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] },
      ]}
    >
      <TrophyBadge kind={resultKind(result)} size={92} />
    </Animated.View>
  );
});

// Small WIN / LOSE trophy above the seats of each panel (appears after the big one is gone) + confetti for the winner.
export const PkPanelResult = memo(({ result, endedAt }: { result?: string; endedAt?: number }) => {
  const pop = useRef(new Animated.Value(0)).current;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const left = Math.max(0, 3500 - (Date.now() - (Number(endedAt) || Date.now())));
    const t = setTimeout(() => {
      setReady(true);
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
    }, left);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!result) return null;
  const kind = resultKind(result);
  return (
    <View pointerEvents="none" style={styles.pkResultWrapNew}>
      {kind === "win" && !ready && <PkConfetti />}
      {ready && (
        <Animated.View
          style={[
            styles.pkPanelTrophy,
            { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] },
          ]}
        >
          <TrophyBadge kind={kind} size={48} />
        </Animated.View>
      )}
    </View>
  );
});

// ---------- Last 10 seconds: BIG centre countdown 10 9 8 ... 1 (Tiki) ----------
export const PkFinalCountdown = memo(({ endAt }: { endAt: number }) => {
  const calc = () => Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  const [left, setLeft] = useState(calc);
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    setLeft(calc());
    const i = setInterval(() => setLeft(calc()), 250);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endAt]);
  const show = left > 0 && left <= 10;
  useEffect(() => {
    if (!show) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
  }, [left, show]);
  if (!show) return null;
  const hot = left <= 3;
  return (
    <View pointerEvents="none" style={styles.pkFinalWrap}>
      <Animated.Text
        style={[
          styles.pkFinalNum,
          hot && { color: "#FF3B3B" },
          {
            opacity: pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) }],
          },
        ]}
      >
        {left}
      </Animated.Text>
    </View>
  );
});

