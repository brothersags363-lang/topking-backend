import React, { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { gifts } from '../../assets/giftsData';
import { GuardedFrame } from './SharedUI';
import { STABLE_AVATAR, height } from './constants';
import CarGiftRide, { isRideGift, rideTopBelowPopup } from '../live/CarGiftRide';

// ============================================================
// GIFT (NO ANIMATION): gift bhejne ke baad Tiki jaisa chhota PNG row left side me dikhta hai
// [avatar + naam + "Sent"] [gift PNG] x3 . Full-screen animation / Lottie / WebView sab hata diya.
// Koi Animated nahi -> app hang nahi hoti. Har naye tap par sirf count (x1, x2, x3...) badalta hai.
// ============================================================
// SMOOTH FIX: har tap par poori row (avatar + 54px level frame webp + naam) dobara render hoti thi.
// Ab avatar/frame/naam alag memo (sirf tab badle jab sender badle) aur sirf "xN" count badalta hai.
export const ComboHead = memo(({ senderImg, senderId, level, senderName }) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 0,
      paddingRight: 34,
      paddingVertical: 4,
      borderRadius: 24,
      backgroundColor: "rgba(0,0,0,0.35)",
    }}
  >
    <View style={{ width: 32, height: 32, marginLeft: 12 }}>
      <Image
        source={{ uri: senderImg || STABLE_AVATAR }}
        style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", backgroundColor: "#2a2b38" }}
      />
      {(Number(level) >= 30 || !!senderId) && (
        <GuardedFrame level={level} uid={senderId} animated={false} photo={32}
          style={{ position: "absolute", width: 54, height: 54, top: -11, left: -11, zIndex: 10 }} />
      )}
    </View>
    <View style={{ marginLeft: 6, flexShrink: 1 }}>
      <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "700", fontSize: 12, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>{senderName}</Text>
      <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.92)", fontSize: 10, marginTop: 0, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>Sent</Text>
    </View>
  </View>
), (p, n) => p.senderImg === n.senderImg && p.senderId === n.senderId && p.level === n.level && p.senderName === n.senderName);

export const ComboCount = memo(({ count }) => (
  <Text
    style={{
      color: "#fff", fontSize: 24, fontWeight: "900", fontStyle: "italic", marginLeft: 6,
      textShadowColor: "rgba(0,0,0,0.55)", textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 3,
    }}
  >
    x{count}
  </Text>
));

export const ComboRow = memo(({ data }) => {
  const gd = useMemo(() => gifts.find((g) => String(g.id) === String(data.giftId)), [data.giftId]);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
      <ComboHead senderImg={data.senderImg} senderId={data.senderId} level={data.level} senderName={data.senderName} />
      {gd?.icon ? (
        <Image source={gd.icon} style={{ width: 46, height: 46, resizeMode: "contain", marginLeft: -26 }} />
      ) : (
        <View style={{ width: 20 }} />
      )}
      <ComboCount count={data.count || 1} />
    </View>
  );
}, (p, n) =>
  p.data.giftId === n.data.giftId && p.data.count === n.data.count && p.data.senderId === n.data.senderId &&
  p.data.senderName === n.data.senderName && p.data.senderImg === n.data.senderImg && p.data.level === n.data.level
);

export const GiftLayer = memo(forwardRef(function GiftLayer({ comboTop, comboBottom, rideTop }, ref) {
  const [combos, setCombos] = useState([]); // max 2 row, har sender ki apni row
  const timersRef = useRef({});
  const rideRef = useRef(null); // car gift -> chalti firti gaadi

  useImperativeHandle(ref, () => ({
    // animation band: play / playDeferred ab kuch nahi karte (purane call sites safe rehte hain)
    play() {},
    playDeferred() {},
    showCombo(data, onEnd, ms = 2200) {
      if (isRideGift(data && data.giftId) && rideRef.current) rideRef.current.push(data); // Sports Car gift
      const key = String((data && data.senderName) || "user") + "_" + String((data && data.giftId) || "g"); // har gift ki apni row
      const entry = { key, data };
      setCombos((prev) => {
        const i = prev.findIndex((c) => c.key === key);
        if (i >= 0) { const n = prev.slice(); n[i] = entry; return n; }
        return [...prev, entry].slice(-3); // nayi row niche judti hai, max 3
      });
      if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
      timersRef.current[key] = setTimeout(() => {
        delete timersRef.current[key];
        setCombos((prev) => prev.filter((c) => c.key !== key));
        if (onEnd && Object.keys(timersRef.current).length === 0) onEnd(); // sab rows khatam hone par combo reset
      }, ms);
    },
  }), []);

  useEffect(() => () => {
    Object.values(timersRef.current).forEach((t) => clearTimeout(t));
  }, []);

  return (
    <>
    <CarGiftRide ref={rideRef} top={rideTop != null ? rideTop : rideTopBelowPopup(comboTop, comboBottom)} />
    {combos.length ? (
    <View
      pointerEvents="none"
      style={[{ position: "absolute", left: 10, zIndex: 99998, elevation: 99998 }, comboBottom != null ? { bottom: comboBottom } : { top: comboTop != null ? comboTop : height * 0.25 }]}
    >
      {combos.map((c) => <ComboRow key={c.key} data={c.data} />)}
    </View>
    ) : null}
    </>
  );
}));
