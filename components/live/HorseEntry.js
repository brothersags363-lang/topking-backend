import React, { useEffect, useRef, memo } from 'react';
import { View, Text, Image, Animated, Easing, Dimensions, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import LevelFrame from '../LevelFrame';
import UserTick from '../UserTick';
import { bannerFor } from '../../utils/levelTheme';
import { LevelPrefix } from './UserLabel';
import { playGiftSound, stopGiftSound } from './giftSound';

// ============================================================
// HORSE ENTRY - Lv 50+ user live room me aaye to AGNI GHODA (pankhon wala kaala unicorn):
//   1) door aasmaan se (upar-right, chhota) udta hua PAAS aata hai (bada hota hai), peeche parchhai ki lakeer
//   2) zameen par DHAMAK se utarta hai: screen hilti hai, aag ka gola failta hai, chingariyan udti hain
//   3) khada rehta hai: pankh fadfadate hain, pairon ki aag lehrati hai (animated WEBP), saans leta hai
//   4) upar naam ka banner, phir door aasmaan me (upar-left) udkar chhota hote hue gayab
// Ghoda: assets/entries/horse_fire.webp (animated: pankh + aag + poonchh)  |  Awaaz: assets/sounds/gift_horse.mp3
// Sirf transform / opacity + useNativeDriver => live room me smooth.
// ============================================================
const HORSE = require('../../assets/entries/horse_fire.webp');
const { width, height } = Dimensions.get('window');
const FALLBACK_AVATAR = 'https://avatar.iran.liara.run/public/65';

// ---- timing knobs ----
const FLY_IN_MS = 1000; // door se paas aana
const HOLD_MS = 2100; // zameen par khada
const FLY_OUT_MS = 700; // ud kar jana
export const HORSE_TOTAL_MS = FLY_IN_MS + HOLD_MS + FLY_OUT_MS;

const HS = Math.min(width * 0.42, 170); // ghode ka size (chhota rakha hai; bada chahiye to 0.42 / 170 badhao)
const BANNER_H = 60;
const LAYER_H = BANNER_H + HS + 10;
const FIRE = '#FF9A2E';

// zameen se udti chingariyan (pairon ke paas)
const EMBERS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI - Math.PI; // upar ki taraf pankha
  const sp = 26 + ((i * 37) % 34);
  return { dx: Math.cos(a) * sp * 1.4, dy: Math.sin(a) * sp - 20, s: 4 + (i % 4) * 1.5, d: (i % 5) * 0.06 };
});
const RISING = [
  { x: -26, d: 0 }, { x: -7, d: 0.3 }, { x: 15, d: 0.55 }, { x: 30, d: 0.15 }, { x: -38, d: 0.7 }, { x: 5, d: 0.85 },
];

const HorseEntry = ({ data, tier = 50, onDone, top }) => {
  const B = bannerFor(tier);
  const glow = B.edge || '#D9B8FF';

  const fly = useRef(new Animated.Value(0)).current; // 0 door -> 1 zameen par
  const impact = useRef(new Animated.Value(0)).current; // dhamak
  const card = useRef(new Animated.Value(0)).current; // banner
  const breath = useRef(new Animated.Value(0)).current; // saans
  const rise = useRef(new Animated.Value(0)).current; // chingari loop
  const shine = useRef(new Animated.Value(0)).current;
  const leave = useRef(new Animated.Value(0)).current; // ud kar jana

  useEffect(() => {
    [fly, impact, card, breath, rise, shine, leave].forEach((v) => v.setValue(0));
    playGiftSound('horse');

    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const riseLoop = Animated.loop(Animated.timing(rise, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }));
    const shineLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shine, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(500),
        Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );

    const main = Animated.sequence([
      Animated.timing(fly, { toValue: 1, duration: FLY_IN_MS, easing: Easing.bezier(0.2, 0.7, 0.3, 1), useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(impact, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(card, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
      ]),
      Animated.delay(Math.max(0, HOLD_MS - 650)),
      Animated.timing(leave, { toValue: 1, duration: FLY_OUT_MS, easing: Easing.bezier(0.5, 0, 0.85, 0.4), useNativeDriver: true }),
    ]);
    const t1 = setTimeout(() => { breathLoop.start(); riseLoop.start(); shineLoop.start(); }, FLY_IN_MS);
    main.start(({ finished }) => finished && onDone && onDone());

    return () => {
      clearTimeout(t1);
      main.stop(); breathLoop.stop(); riseLoop.stop(); shineLoop.stop();
      stopGiftSound('horse');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data && data._k]);

  // ---------- ghode ki chaal ----------
  const pos = (p) => ({
    x: p.interpolate({ inputRange: [0, 1], outputRange: [width * 0.42, 0] }),
    y: p.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] }),
    sc: p.interpolate({ inputRange: [0, 1], outputRange: [0.32, 1] }),
  });
  const P = pos(fly);
  const leaveX = leave.interpolate({ inputRange: [0, 1], outputRange: [0, -width * 0.6] });
  const leaveY = leave.interpolate({ inputRange: [0, 1], outputRange: [0, -170] });
  const leaveSc = leave.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] });
  const breathSc = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] });
  const breathY = breath.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const squash = impact.interpolate({ inputRange: [0, 0.12, 0.35, 1], outputRange: [1, 0.94, 1.01, 1] });
  const horseOp = Animated.multiply(
    fly.interpolate({ inputRange: [0, 0.18], outputRange: [0, 1], extrapolate: 'clamp' }),
    leave.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] })
  );
  const horseX = Animated.add(P.x, leaveX);
  const horseY = Animated.add(Animated.add(P.y, leaveY), breathY);
  const horseSc = Animated.multiply(Animated.multiply(P.sc, leaveSc), breathSc);

  // peeche parchhai ki lakeer (speed trail) - sirf udte waqt
  const trails = [0.1, 0.2].map((lag, i) => {
    const lp = fly.interpolate({ inputRange: [0, lag, 1], outputRange: [0, 0, 1 - lag] });
    const T = pos(lp);
    return {
      key: i,
      op: fly.interpolate({ inputRange: [0, 0.3, 0.9, 1], outputRange: [0, i ? 0.18 : 0.3, i ? 0.1 : 0.15, 0], extrapolate: 'clamp' }),
      x: T.x, y: T.y, sc: T.sc,
    };
  });

  // dhamak: screen jhatka + aag ka gola + chingariyan
  const shakeX = impact.interpolate({ inputRange: [0, 0.06, 0.14, 0.22, 0.3, 0.4, 1], outputRange: [0, -7, 6, -4, 3, -1, 0] });
  const ringSc = impact.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1.9] });
  const ringOp = impact.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 0.9, 0] });
  const groundOp = Animated.multiply(
    fly.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0.35, 1] }),
    leave.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' })
  );
  const groundSc = fly.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  // banner
  const cardOp = Animated.multiply(
    card.interpolate({ inputRange: [0, 0.4], outputRange: [0, 1], extrapolate: 'clamp' }),
    leave.interpolate({ inputRange: [0, 0.35], outputRange: [1, 0], extrapolate: 'clamp' })
  );
  const cardScale = card.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const cardY = leave.interpolate({ inputRange: [0, 0.35], outputRange: [0, -24], extrapolate: 'clamp' });

  const lv = Number(data && data.level) || 1;
  const uid = data ? data.senderId || data.uid : undefined;
  const cardW = Math.min(width - 40, 290);
  const AV = 50;
  const L = top != null ? top : height * 0.36;
  const feetY = BANNER_H + HS * 0.95; // layer me pairon ki unchai

  return (
    <Animated.View pointerEvents="none" style={[styles.layer, { top: Math.max(0, Math.min(L, height - LAYER_H - 8)), transform: [{ translateX: shakeX }] }]}>
      {/* ===== zameen: parchhai + aag ki roshni ===== */}
      <Animated.View style={[styles.ground, { top: feetY - 14, opacity: groundOp, transform: [{ scale: groundSc }] }]}>
        <View style={styles.groundShadow} />
        <View style={styles.groundFire} />
      </Animated.View>

      {/* ===== parchhai ki lakeer (trail) ===== */}
      {trails.map((t) => (
        <Animated.View
          key={'tr' + t.key}
          style={[styles.horseBox, { opacity: t.op, transform: [{ translateX: t.x }, { translateY: t.y }, { scale: t.sc }] }]}
        >
          <ExpoImage source={HORSE} style={styles.horseImg} contentFit="contain" autoplay={false} cachePolicy="memory-disk" transition={0} />
        </Animated.View>
      ))}

      {/* ===== GHODA (pankh + aag animated WEBP) ===== */}
      <Animated.View
        style={[
          styles.horseBox,
          { opacity: horseOp, transform: [{ translateX: horseX }, { translateY: horseY }, { scale: horseSc }, { scaleY: squash }] },
        ]}
      >
        <ExpoImage source={HORSE} style={styles.horseImg} contentFit="contain" autoplay cachePolicy="memory-disk" transition={0} />
      </Animated.View>

      {/* ===== dhamak ka aag ka gola ===== */}
      <Animated.View style={[styles.ring, { top: feetY - 20, opacity: ringOp, transform: [{ scale: ringSc }] }]} />

      {/* ===== dhamak ki chingariyan ===== */}
      {EMBERS.map((e, i) => {
        const d2 = Math.min(e.d + 0.15, 0.9);
        return (
          <Animated.View
            key={'e' + i}
            style={[
              styles.ember,
              {
                width: e.s, height: e.s, borderRadius: e.s / 2,
                left: width / 2 - e.s / 2, top: feetY - 6,
                opacity: impact.interpolate({ inputRange: [0, e.d, d2, 1], outputRange: [0, 0, 1, 0] }),
                transform: [
                  { translateX: impact.interpolate({ inputRange: [0, e.d, 1], outputRange: [0, 0, e.dx] }) },
                  { translateY: impact.interpolate({ inputRange: [0, e.d, 0.6, 1], outputRange: [0, 0, e.dy, e.dy + 18] }) },
                ],
              },
            ]}
          />
        );
      })}

      {/* ===== khade ghode ke pairon se upar uthti chingariyan (loop) ===== */}
      {RISING.map((r, i) => {
        const v = rise.interpolate({ inputRange: [0, 1], outputRange: [r.d, r.d + 1] });
        const ph = v.interpolate({ inputRange: [0, 1, 1.0001, 2], outputRange: [0, 1, 0, 1] });
        return (
          <Animated.View
            key={'r' + i}
            style={[
              styles.ember,
              {
                width: 4, height: 4, borderRadius: 2,
                left: width / 2 + r.x, top: feetY - 10,
                opacity: Animated.multiply(
                  ph.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 0.6, 0] }),
                  Animated.multiply(impact, leave.interpolate({ inputRange: [0, 0.3], outputRange: [1, 0], extrapolate: 'clamp' }))
                ),
                transform: [
                  { translateY: ph.interpolate({ inputRange: [0, 1], outputRange: [0, -48] }) },
                  { translateX: ph.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, i % 2 ? 6 : -6, 0] }) },
                ],
              },
            ]}
          />
        );
      })}

      {/* ===== NAAM KA BANNER ===== */}
      <Animated.View
        style={[styles.cardWrap, { width: cardW, left: (width - cardW) / 2, opacity: cardOp, transform: [{ translateY: cardY }, { scale: cardScale }] }]}
      >
        <View style={[styles.card, { borderColor: glow, shadowColor: glow }]}>
          <LinearGradient colors={[B.colors[0], B.colors[1], B.colors[0]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardFill}>
            <View style={{ width: AV, height: AV, alignItems: 'center', justifyContent: 'center' }}>
              <Image
                source={{ uri: (data && data.userImg) || FALLBACK_AVATAR }}
                style={{ width: AV - 12, height: AV - 12, borderRadius: (AV - 12) / 2, backgroundColor: '#1C1A22' }}
              />
              <LevelFrame level={lv} uid={uid} lookup={false} photo={AV - 12} style={{ position: 'absolute', width: AV, height: AV }} />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {/* Tiki jaisa: [SVIP / Level badge] naam ✓ */}
                <LevelPrefix level={lv} size={9} svipHeight={18} style={{ marginRight: 6 }} />
                <Text numberOfLines={1} style={styles.name}>{data && data.senderName}</Text>
                <UserTick
                  uid={uid}
                  verified={data && (data.verified === true || data.verified === 'true')}
                  verifiedColor={data && data.verifiedColor}
                  size={15}
                  style={{ marginLeft: 3 }}
                />

              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <MaterialCommunityIcons name="unicorn" size={13} color={FIRE} />
                <Text numberOfLines={1} style={[styles.sub, { color: '#FFD08A' }]}> Agni Ghode par aaye</Text>
              </View>
            </View>
          </LinearGradient>
          <Animated.View
            style={[
              styles.shine,
              { transform: [{ translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-60, cardW + 20] }) }, { skewX: '-20deg' }] },
            ]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </View>
      </Animated.View>
    </Animated.View>
  );
};

export default memo(HorseEntry);

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, height: LAYER_H, zIndex: 99997, elevation: 99997 },
  horseBox: { position: 'absolute', top: BANNER_H, left: (width - HS) / 2, width: HS, height: HS },
  horseImg: { width: HS, height: HS },
  ground: { position: 'absolute', left: (width - HS * 0.8) / 2, width: HS * 0.8, height: 28, alignItems: 'center', justifyContent: 'center' },
  groundShadow: { position: 'absolute', width: '100%', height: 18, borderRadius: 100, backgroundColor: 'rgba(0,0,0,0.5)' },
  groundFire: {
    position: 'absolute', width: '80%', height: 14, borderRadius: 100, backgroundColor: 'rgba(255,140,40,0.45)',
    shadowColor: FIRE, shadowOpacity: 1, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
  },
  ring: {
    position: 'absolute', left: (width - HS * 0.6) / 2, width: HS * 0.6, height: 40, borderRadius: 200,
    borderWidth: 5, borderColor: 'rgba(255,170,60,0.95)',
    shadowColor: FIRE, shadowOpacity: 1, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
  },
  ember: { position: 'absolute', backgroundColor: '#FFC24A', shadowColor: FIRE, shadowOpacity: 1, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
  cardWrap: { position: 'absolute', top: 0 },
  card: { borderRadius: 30, borderWidth: 1.5, overflow: 'hidden', shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  cardFill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingLeft: 6, paddingRight: 12 },
  name: { color: '#fff', fontSize: 15, fontWeight: '800', flexShrink: 1 },
  sub: { fontSize: 11.5, fontWeight: '700', flexShrink: 1 },
  lvChip: { marginLeft: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1 },
  lvTxt: { color: '#FFE08A', fontSize: 10.5, fontWeight: '900' },
  shine: { position: 'absolute', top: 0, bottom: 0, width: 44 },
});
