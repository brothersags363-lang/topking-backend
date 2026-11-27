// @ts-nocheck
import React, { useEffect, useRef, memo } from 'react';
import { View, Text, StyleSheet, Image, Platform, Animated, Easing, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { STABLE_AVATAR, PK_TIPS, width } from './constants';
import { styles } from './styles';

// 3 round "seats" at the bottom of each panel (Tiki): sofa when empty, else the top-3 gifters.
// #1 gets a crown + MVP ribbon, #2 / #3 a small number. Left panel is mirrored so #1 always sits next to the centre.
export const SEAT_COL = ["#FFD700", "#C0C0C0", "#CD7F32"];
export const SEAT_BADGE = ["#F59E0B", "#8A96AB", "#B8693A"];
export const PkSeats = memo(({ gifters, mirror }: any) => {
  const top: any[] = Object.values(gifters || {})
    .filter((g: any) => g && g.uid && Number(g.stars) > 0)
    .sort((a: any, b: any) => Number(b.stars) - Number(a.stars))
    .slice(0, 3);
  const order = mirror ? [2, 1, 0] : [0, 1, 2];
  return (
    <View pointerEvents="none" style={styles.pkSeatRow}>
      {order.map((i) => {
        const g = top[i];
        return (
          <View key={i} style={styles.pkSeatWrap}>
            {g ? (
              <Image
                source={{ uri: g.img || STABLE_AVATAR }}
                style={[styles.pkSeat, { borderColor: SEAT_COL[i], borderWidth: 2 }]}
              />
            ) : (
              <View style={[styles.pkSeat, styles.pkSeatEmpty]}>
                <MaterialCommunityIcons name="sofa" size={14} color="rgba(214,170,90,0.95)" />
              </View>
            )}
            {!!g && i === 0 && <Text style={styles.pkSeatCrown}>👑</Text>}
            {!!g && (
              <View style={[styles.pkSeatNum, { backgroundColor: SEAT_BADGE[i] }]}>
                <Text style={styles.pkSeatNumTxt}>{i === 0 ? "MVP" : i + 1}</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
});

// Panel shown while a video is not there yet: blurred avatar (no flat black) + spinner.
export const PkWaiting = memo(({ img, loading }: any) => (
  <View style={styles.pkWaiting}>
    <ExpoImage
      source={{ uri: img || STABLE_AVATAR }}
      style={StyleSheet.absoluteFill}
      blurRadius={Platform.OS === "android" ? 10 : 24}
      cachePolicy="memory-disk"
      transition={0}
    />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(28,20,70,0.55)" }]} />
    <ExpoImage source={{ uri: img || STABLE_AVATAR }} style={styles.pkWaitAvatar} cachePolicy="memory-disk" transition={0} />
    {!!loading && (
      <>
        <ActivityIndicator size="small" color="#fff" style={{ marginTop: 10 }} />
        <Text style={styles.pkWaitTxt}>Connecting...</Text>
      </>
    )}
  </View>
));

// Scrolling tip under the PK panels (Tiki). Pure native-driver translate = cheap.
export const PkTicker = memo(({ top }: { top: number }) => {
  const x = useRef(new Animated.Value(0)).current;
  const boxW = Math.round(width * 0.6);
  const textW = Math.round(PK_TIPS.length * 6.4);
  useEffect(() => {
    x.setValue(boxW);
    const loop = Animated.loop(
      Animated.timing(x, { toValue: -textW, duration: (textW + boxW) * 30, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View pointerEvents="none" style={[styles.pkTicker, { top, width: boxW, left: Math.round((width - boxW) / 2) }]}>
      <Animated.Text numberOfLines={1} style={[styles.pkTickerTxt, { width: textW, transform: [{ translateX: x }] }]}>
        {PK_TIPS}
      </Animated.Text>
    </View>
  );
});

