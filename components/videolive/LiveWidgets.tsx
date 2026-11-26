// @ts-nocheck
import React, { useEffect, useRef, useState, memo, forwardRef, useImperativeHandle } from 'react';
import { View, Text, Image, TextInput, Animated, Easing } from 'react-native';
import { gifts } from '../../assets/giftsData';
import LevelFrame from '../../components/LevelFrame';
import { STABLE_AVATAR, WEEKLY_TARGET_MIN, GIFT_GOLD, width, height } from './constants';
import { fmtClock } from './helpers';
import { styles } from './styles';
import { timer } from './tickScheduler';
import CarGiftRide, { isRideGift } from '../live/CarGiftRide';

// Gift button animation (HEAT FIX): pehle loop me 24/7 chalta tha (30 min = lagatar GPU/CPU).
// Ab 1 baar chalta hai, phir 4 sec rukta hai -> duty cycle ~80% kam.
export const GiftButtonLottie = memo(() => (
  <Image
    source={require("../../assets/giftLogo.webp")}
    style={{ width: 32, height: 32 }}
    resizeMode="contain"
  />
));

// Live timer — only this tiny <Text> re-renders every second.
export const LiveTimer = memo(({ startTime }: { startTime: number | null }) => {
  const [label, setLabel] = useState("00:00:00");

  useEffect(() => {
    if (!startTime) return;
    const tick = () => {
      const diff = Math.max(0, Date.now() - startTime);
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setLabel(
        `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <Text style={styles.liveTagText}>LIVE {label}</Text>;
});

// Weekly-host minutes pill ("12/30 min") — own state, refreshes every 15s.
export const WeeklyMinutesPill = memo(({ startTime }: { startTime: number | null }) => {
  const [mins, setMins] = useState(0);
  useEffect(() => {
    if (!startTime) return;
    const tick = () => setMins(Math.max(0, Math.floor((Date.now() - startTime) / 60000)));
    tick();
    const i = setInterval(tick, 15000);
    return () => clearInterval(i);
  }, [startTime]);
  const shown = Math.min(mins, WEEKLY_TARGET_MIN);
  return (
    <View style={styles.minPill}>
      <View style={[styles.minFill, { width: `${(shown / WEEKLY_TARGET_MIN) * 100}%` }]} />
      <Text style={styles.minTxt}>
        {shown}/{WEEKLY_TARGET_MIN} min
      </Text>
    </View>
  );
});

// "00:01" counter for Random Match
export const MatchTimer = memo(({ startAt, style }: any) => {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = () => setSec(Math.max(0, Math.floor((Date.now() - startAt) / 1000)));
    t();
    const i = setInterval(t, 1000);
    return () => clearInterval(i);
  }, [startAt]);
  return <Text style={style}>{fmtClock(sec)}</Text>;
});

// Circular progress ring built from two clipped half-rings (no SVG needed).
export const ProgressRing = ({ pct, size = 78, stroke = 7, color = "#FFD700", track = "rgba(255,255,255,0.18)", children }: any) => {
  const p = Math.max(0, Math.min(100, pct));
  const deg = p * 3.6;
  const half = size / 2;
  const circle: any = { position: "absolute", width: size, height: size, borderRadius: half, borderWidth: stroke };
  return (
    <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
      <View style={[circle, { borderColor: track }]} />
      <View style={{ position: "absolute", left: half, top: 0, width: half, height: size, overflow: "hidden" }}>
        <View
          style={[
            circle,
            {
              left: -half,
              top: 0,
              borderColor: "transparent",
              borderTopColor: color,
              borderRightColor: color,
              transform: [{ rotate: `${Math.min(deg, 180) - 135}deg` }],
            },
          ]}
        />
      </View>
      <View style={{ position: "absolute", left: 0, top: 0, width: half, height: size, overflow: "hidden" }}>
        <View
          style={[
            circle,
            {
              left: 0,
              top: 0,
              borderColor: "transparent",
              borderBottomColor: color,
              borderLeftColor: color,
              transform: [{ rotate: `${Math.max(deg, 180) - 315}deg` }],
            },
          ]}
        />
      </View>
      {children}
    </View>
  );
};

// ============================================================
// GIFT (NO ANIMATION): gift bhejne ke baad Tiki jaisa chhota PNG row left side me dikhta hai
// [avatar + naam + "Sent"] [gift PNG] x3 . Full-screen animation / Lottie / WebView sab hata diya.
// Koi Animated nahi -> app hang nahi hoti. Har naye tap par sirf count (x1, x2, x3...) badalta hai.
// ============================================================
export const ComboRow = memo(({ data, leaving }: any) => {
  const gd = gifts.find((g: any) => String(g.id) === String(data.giftId));
  const enter = useRef(new Animated.Value(0)).current; // 0 -> 1 slide/fade in
  const pop = useRef(new Animated.Value(1)).current; // count bump
  const fade = useRef(new Animated.Value(1)).current; // fade out
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  useEffect(() => {
    pop.setValue(1.35);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 220, useNativeDriver: true }).start();
  }, [data.count]);
  useEffect(() => {
    Animated.timing(fade, { toValue: leaving ? 0 : 1, duration: leaving ? 260 : 80, useNativeDriver: true }).start();
  }, [leaving]);
  return (
    <Animated.View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 4,
        opacity: Animated.multiply(enter, fade),
        transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) }],
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 4,
          paddingRight: 34,
          paddingVertical: 4,
          borderRadius: 22,
          backgroundColor: "rgba(0,0,0,0.28)", // halka black piche (Tiki jaisa) - zyada dark chahiye to 0.28 badhao
        }}
      >
        <View style={{ width: 32, height: 32, marginLeft: 8 }}>
          <Image
            source={{ uri: data.senderImg || STABLE_AVATAR }}
            style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", backgroundColor: "#2a2b38" }}
          />
          {(!!data.senderId || Number(data.level) >= 10) && (
            <LevelFrame level={Number(data.level) || 1} uid={data.senderId} lookup={false} animated={false} photo={32}
              style={{ position: "absolute", width: 54, height: 54, top: -11, left: -11, zIndex: 10 }} />
          )}
        </View>
        <View style={{ marginLeft: 6, flexShrink: 1 }}>
          <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "700", fontSize: 12, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>{data.senderName}</Text>
          <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.92)", fontSize: 10, marginTop: 0, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>Sent</Text>
        </View>
      </View>
      {gd?.icon ? (
        <Image source={gd.icon} fadeDuration={0} style={{ width: 46, height: 46, resizeMode: "contain", marginLeft: -26 }} />
      ) : (
        <View style={{ width: 20 }} />
      )}
      <Animated.Text
        style={{
          transform: [{ scale: pop }],
          color: "#fff", fontSize: 24, fontWeight: "900", fontStyle: "italic", marginLeft: 6,
          textShadowColor: "rgba(0,0,0,0.55)", textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 3,
        }}
      >
        x{data.count || 1}
      </Animated.Text>
    </Animated.View>
  );
});

export const GiftLayer = memo(forwardRef(function GiftLayer({ comboTop, comboBottom, rideTop }: any, ref: any) {
  const [combos, setCombos] = useState<any[]>([]); // max 2 row, har sender ki apni row
  const timersRef = useRef<any>({});
  const rideRef = useRef<any>(null); // car gift -> chalti firti gaadi
  const leaveRef = useRef<any>({});

  useImperativeHandle(ref, () => ({
    // animation band: play / playDeferred ab kuch nahi karte (purane call sites safe rehte hain)
    play() {},
    playDeferred() {},
    showCombo(data: any, onEnd?: () => void, ms = 2200) {
      if (isRideGift(data && data.giftId) && rideRef.current) rideRef.current.push(data); // Sports Car gift
      const key = String((data && data.senderName) || "user") + "_" + String((data && data.giftId) || "g"); // har gift ki apni row
      const entry = { key, data };
      setCombos((prev: any[]) => {
        const i = prev.findIndex((c: any) => c.key === key);
        if (i >= 0) { const n = prev.slice(); n[i] = entry; return n; }
        return [...prev, entry].slice(-3); // nayi row niche judti hai, max 3
      });
      if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
      if (leaveRef.current[key]) clearTimeout(leaveRef.current[key]);
      leaveRef.current[key] = setTimeout(() => {
        setCombos((prev: any[]) => prev.map((c: any) => (c.key === key ? { ...c, leaving: true } : c)));
      }, Math.max(0, ms - 280));
      timersRef.current[key] = setTimeout(() => {
        delete timersRef.current[key];
        setCombos((prev: any[]) => prev.filter((c: any) => c.key !== key));
        if (onEnd && Object.keys(timersRef.current).length === 0) onEnd(); // sab rows khatam hone par combo reset
      }, ms);
    },
  }), []);

  useEffect(() => () => {
    Object.values(timersRef.current).forEach((t: any) => clearTimeout(t));
    Object.values(leaveRef.current).forEach((t: any) => clearTimeout(t));
  }, []);

  return (
    <>
    <CarGiftRide ref={rideRef} top={rideTop} />
    {combos.length ? (
    <View
      pointerEvents="none"
      style={[{ position: "absolute", left: 10, zIndex: 99998, elevation: 99998 }, comboBottom != null ? { bottom: comboBottom } : { top: comboTop != null ? comboTop : height * 0.25 }]}
    >
      {combos.map((c: any) => <ComboRow key={c.key} data={c.data} leaving={!!c.leaving} />)}
    </View>
    ) : null}
    </>
  );
}));

// Pending (abhi write na hue) gift kharcha: chhota store + chhota component (LiveRoom jaisa).
export const giftPendingStore: any = {
  v: 0,
  subs: new Set<any>(),
  set(n: number) {
    giftPendingStore.v = n;
    giftPendingStore.subs.forEach((f: any) => f(n));
  },
};
export const GiftBalance = memo(({ stars, style }: any) => {
  const [pending, setPending] = useState<number>(giftPendingStore.v);
  useEffect(() => {
    setPending(giftPendingStore.v);
    giftPendingStore.subs.add(setPending);
    return () => { giftPendingStore.subs.delete(setPending); };
  }, []);
  return (
    <Text style={style || { color: GIFT_GOLD, fontSize: 15, fontWeight: "bold", marginLeft: 4 }}>
      {Math.max(0, stars - pending)}
    </Text>
  );
});

// One floating heart (tap-to-like). Native-driver only → cheap.
export const HEART_COLORS = ["#FF3D71", "#FF6B9D", "#FFB300", "#00E5FF", "#B388FF", "#69F0AE"];
export const FloatingHeart = memo(({ id, x, emoji, color, onDone }: any) => {
  const prog = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(prog, { toValue: 1, duration: 2200 + Math.random() * 600, useNativeDriver: true }).start(() =>
      onDone(id)
    );
  }, []);
  return (
    <Animated.Text
      pointerEvents="none"
      style={{
        position: "absolute",
        bottom: 0,
        right: x,
        fontSize: 26,
        color,
        opacity: prog.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 0.9, 0] }),
        transform: [
          { translateY: prog.interpolate({ inputRange: [0, 1], outputRange: [0, -260] }) },
          { translateX: prog.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, x % 2 ? 22 : -22, x % 2 ? -12 : 12] }) },
          { scale: prog.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.4, 1.15, 0.9] }) },
        ],
      }}
    >
      {emoji}
    </Animated.Text>
  );
});

// SMOOTH FIX: chat ka text yahin rehta hai -> har akshar par sirf ye chhota TextInput render hota hai
export const ChatBoxInput = forwardRef(({ style, onSubmit, autoFocus }: any, ref: any) => {
  const [text, setText] = useState("");
  const textRef = useRef("");
  useImperativeHandle(ref, () => ({
    getText: () => textRef.current,
    clear: () => { textRef.current = ""; setText(""); },
    append: (e: string) => { const n = (textRef.current + e).slice(0, 200); textRef.current = n; setText(n); },
  }), []);
  return (
    <TextInput
      style={style}
      placeholder="Say something..."
      placeholderTextColor="#aaa"
      value={text}
      onChangeText={(t) => { textRef.current = t; setText(t); }}
      onSubmitEditing={() => onSubmit && onSubmit()}
      returnKeyType="send"
      maxLength={200}
      blurOnSubmit={false}
      autoFocus={autoFocus}
    />
  );
});

