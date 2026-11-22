import React, { memo, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { getBgKey } from './helpers';
import { styles } from './styles';

// HEAT FIX: gift button ka Lottie (192KB json) pehle 24x7 loop me chalta tha (live room me hamesha).
// Ab ek baar chalta hai, 6 sec rukta hai, phir dobara -> animation dikhta hai par CPU/GPU free rehta hai.
export const GiftButtonLottie = memo(function GiftButtonLottie() {
  // animation hata diya: static gift icon
  return (
    <Image
      source={require("../../assets/giftLogo.webp")}
      style={{ width: 34, height: 34 }}
      resizeMode="contain"
    />
  );
});

export const LiveTimer = memo(({ startTime }) => {
  const [label, setLabel] = useState("00:00:00");

  useEffect(() => {
    if (!startTime) return;

    const tick = () => {
      const diff = Math.max(0, Date.now() - startTime);
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setLabel(
        `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      );
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <Text style={styles.liveTagText}>● LIVE {label}</Text>;
});
// ===== TIME-BASED ROOM BACKGROUND =====
// Subah / Dopahar / Sham / Raat - phone ke time ke hisaab se apne aap badalta hai.
// 5am-12pm morning | 12pm-5pm afternoon | 5pm-8pm evening | 8pm-5am night
export const LIVE_BGS = {
  morning:   { src: require('../../assets/live_bg/morning.jpg'),   dim: 0.05 },
  afternoon: { src: require('../../assets/live_bg/afternoon.jpg'), dim: 0.05 },
  evening:   { src: require('../../assets/live_bg/evening.jpg'),   dim: 0.05 },
  night:     { src: require('../../assets/live_bg/night.jpg'),     dim: 0.0 },
};
export const TimeBackground = React.memo(function TimeBackground() {
  const [key, setKey] = React.useState(getBgKey);
  React.useEffect(() => {
    const t = setInterval(() => {
      const k = getBgKey();
      setKey((prev) => (prev === k ? prev : k)); // same slot = no re-render
    }, 60000);
    return () => clearInterval(t);
  }, []);
  const bg = LIVE_BGS[key];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <ExpoImage
        source={bg.src}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={700}
        cachePolicy="memory-disk"
      />
      {bg.dim > 0 && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${bg.dim})` }]} />
      )}
    </View>
  );
});
