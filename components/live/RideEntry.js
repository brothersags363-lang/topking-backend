import React, { useEffect, useRef, memo } from 'react';
import { View, Text, Image, Animated, Easing, Dimensions, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import LevelFrame from '../LevelFrame';
import UserTick from '../UserTick';
import { bannerFor } from '../../utils/levelTheme';
import { LevelPrefix } from './UserLabel';

// ============================================================
// RIDE (chalti firti gaadi) - live room me koi SPORTS CAR gift bheje to (CarGiftRide.js se chalta hai):
//   1) gaadi screen ke RIGHT se chalti hui aati hai (engine ki halki thartharahat + dhool + speed lines)
//   2) beech me BRAKE lagakar rukti hai (aage jhukti hai, headlight chamakti hai)
//   3) gaadi ke upar naam ka banner khulta hai (avatar + frame + naam + "X ko Sports Car bheji")
//   4) gaadi LEFT se tez nikal jati hai, banner upar udkar gayab
// Sab animation sirf transform / opacity par + useNativeDriver => live room me bhi smooth.
//
// SAWARI BADALNI HO: apni WEBP (gaadi ka muh LEFT taraf, transparent background) assets/entries/ me daalo
// aur neeche RIDES me us tier ki image badlo (assets/entries/dragon.webp jaisa path).
// ============================================================
const RIDES = {
  30: require('../../assets/gifts/car.webp'),
  40: require('../../assets/gifts/car.webp'),
  50: require('../../assets/gifts/car.webp'),
};
const RIDE_LABEL = { 30: 'Gold Ride', 40: 'Purple Ride', 50: 'SVIP Ride', 60: 'SVIP 2 Ride', 65: 'SVIP 3 Ride' };

const { width, height } = Dimensions.get('window');
const FALLBACK_AVATAR = 'https://avatar.iran.liara.run/public/65';

// ---- timing knobs: yahin se speed badlo ----
const DRIVE_IN_MS = 950; // right se beech tak
const HOLD_MS = 2300; // beech me ruki rahe
const DRIVE_OUT_MS = 650; // left se bahar
export const RIDE_TOTAL_MS = DRIVE_IN_MS + HOLD_MS + DRIVE_OUT_MS;

const CAR = Math.min(width * 0.58, 250); // gaadi ka size
const STOP_X = (width - CAR) / 2; // beech me kahan ruke
const LAYER_H = CAR + 30; // banner + gaadi
export const RIDE_LAYER_H = LAYER_H;

const hexA = (c, a) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(c || ''));
  if (!m) return `rgba(255,255,255,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// gaadi ke peeche hawa ki lakeerein
const SPEED_LINES = [
  { y: 0.32, w: 70, d: 0 },
  { y: 0.45, w: 110, d: 0.15 },
  { y: 0.58, w: 85, d: 0.3 },
  { y: 0.7, w: 120, d: 0.1 },
];
// pichhle pahiye se udti dhool
const DUST = [
  { dx: 26, dy: -10, s: 1.4, d: 0 },
  { dx: 40, dy: -4, s: 1.8, d: 0.12 },
  { dx: 18, dy: -16, s: 1.2, d: 0.25 },
  { dx: 52, dy: -12, s: 2.1, d: 0.35 },
];
// banner ke aas paas sitare
const STARS = [
  { x: -8, y: -6, dx: -8, dy: -14, d: 0, size: 13 },
  { x: 0.3, y: -10, dx: 0, dy: -16, d: 0.2, size: 10 },
  { x: 0.7, y: 44, dx: 6, dy: 12, d: 0.35, size: 11 },
  { x: 1, y: -4, dx: 10, dy: -12, d: 0.1, size: 14 },
  { x: 0.5, y: 48, dx: 0, dy: 14, d: 0.5, size: 9 },
];

// mode: 'gift' (car gift) | 'entry' (join entry). source: gaadi ki image (na do to tier wali RIDES).
// subText: banner ki niche wali line (na do to "Gold Ride se aaye").
// top: screen par kahan se shuru ho (live room me seats ke theek niche). Na do to screen ka 36%.
// standSource: rukne par ye image (jaise khada ghoda), chalte waqt `source` (daudta ghoda animated webp).
// stop: 'brake' (gaadi aage jhukti) | 'rear' (ghoda aage ke pair utha kar rukta). lights: headlight chamak.
// icon: banner ki niche wali line ka icon.
// fly: udne wali sawari (pankh wala ghoda): upar se tirchha utarti, dheere upar-neeche tairti, jaate waqt upar udti.
//   stop='land' => zameen par utarne ka halka jhatka. dustColor: pairon se udti chingari/dhool ka rang.
const RideEntry = ({ data, tier = 30, onDone, mode = 'entry', source, subText, top, standSource, stop = 'brake', lights = true, icon = 'car-sports', fly = false, dustColor }) => {
  const isRear = stop === 'rear';
  const isLand = stop === 'land';
  const isGift = mode === 'gift';
  const B = bannerFor(tier);
  const glow = B.edge || '#FFE08A';

  const drive = useRef(new Animated.Value(0)).current; // 0 = bahar right, 1 = beech, 2 = bahar left
  const bob = useRef(new Animated.Value(0)).current; // engine thartharahat
  const brake = useRef(new Animated.Value(0)).current; // 0..1..0 brake par aage jhukna
  const card = useRef(new Animated.Value(0)).current; // banner khulna
  const shine = useRef(new Animated.Value(0)).current; // banner par chamak
  const spark = useRef(new Animated.Value(0)).current; // sitare
  const dust = useRef(new Animated.Value(0)).current; // dhool loop

  useEffect(() => {
    [drive, bob, brake, card, shine, spark, dust].forEach((v) => v.setValue(0));

    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: fly ? 420 : 110, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: fly ? 420 : 110, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    const dustLoop = Animated.loop(
      Animated.timing(dust, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );
    const shineLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shine, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(450),
        Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    const sparkLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(spark, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(spark, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    bobLoop.start();
    dustLoop.start();

    const main = Animated.sequence([
      // 1) right se aana (brake lagte hue dheema)
      Animated.timing(drive, { toValue: 1, duration: DRIVE_IN_MS, easing: Easing.bezier(0.12, 0.8, 0.25, 1), useNativeDriver: true }),
      // 2) brake jhatka + banner khule
      Animated.parallel([
        Animated.sequence([
          Animated.timing(brake, { toValue: 1, duration: isRear ? 320 : 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          isRear ? Animated.delay(260) : Animated.delay(0),
          Animated.spring(brake, { toValue: 0, friction: isRear ? 5 : 4, tension: isRear ? 60 : 120, useNativeDriver: true }),
        ]),
        Animated.spring(card, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
      ]),
      Animated.delay(Math.max(0, HOLD_MS - 700)),
      // 3) left se tez nikalna
      Animated.timing(drive, { toValue: 2, duration: DRIVE_OUT_MS, easing: Easing.bezier(0.55, 0, 0.85, 0.35), useNativeDriver: true }),
    ]);

    const t1 = setTimeout(() => { shineLoop.start(); sparkLoop.start(); }, DRIVE_IN_MS);
    main.start(({ finished }) => finished && onDone && onDone());

    return () => {
      clearTimeout(t1);
      main.stop();
      bobLoop.stop();
      dustLoop.stop();
      shineLoop.stop();
      sparkLoop.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data && data._k]);

  // ---- derived animations ----
  const carX = drive.interpolate({ inputRange: [0, 1, 2], outputRange: [width + 20, STOP_X, -CAR - 60] });
  const carY = Animated.add(
    bob.interpolate({ inputRange: [0, 1], outputRange: [0, fly ? -9 : -2.5] }),
    // fly: upar se tirchha utarna, jaate waqt upar udna
    drive.interpolate({ inputRange: [0, 1, 2], outputRange: fly ? [-70, 0, -90] : [0, 0, 0] })
  );
  // brake: aage (left) jhukna; nikalte waqt peeche (right) uthna
  const carRot = Animated.add(
    brake.interpolate({ inputRange: [0, 1], outputRange: [0, isRear ? 16 : isLand ? 0 : -5] }), // rear: aage ke pair upar
    drive.interpolate({ inputRange: [0, 1, 1.15, 2], outputRange: [0, 0, 4, 2], extrapolate: 'clamp' })
  ).interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] });
  // chalte waqt lakeerein + dhool, rukne par gayab
  const moving = drive.interpolate({ inputRange: [0, 0.75, 1, 1.05, 2], outputRange: [1, 1, 0, 1, 1], extrapolate: 'clamp' });
  const lightFlash = brake.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  const rearLift = brake.interpolate({ inputRange: [0, 1], outputRange: [0, isRear ? -14 : isLand ? 10 : 0] }); // land: neeche dabna
  // chalte waqt daudti image, rukne par khadi image (dono ek saath load, sirf opacity badalti hai => jhatka nahi)
  const runOp = standSource ? drive.interpolate({ inputRange: [0, 0.96, 1, 1.02, 2], outputRange: [1, 1, 0, 1, 1], extrapolate: 'clamp' }) : 1;
  const standOp = standSource ? drive.interpolate({ inputRange: [0, 0.96, 1, 1.02, 2], outputRange: [0, 0, 1, 0, 0], extrapolate: 'clamp' }) : 0;

  const cardOp = Animated.multiply(
    card.interpolate({ inputRange: [0, 0.4], outputRange: [0, 1], extrapolate: 'clamp' }),
    drive.interpolate({ inputRange: [1, 1.35], outputRange: [1, 0], extrapolate: 'clamp' })
  );
  const cardScale = card.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const cardY = drive.interpolate({ inputRange: [1, 1.35], outputRange: [0, -26], extrapolate: 'clamp' });

  const lv = Number(data && data.level) || 1;
  const uid = data ? data.senderId || data.uid : undefined;
  const cardW = Math.min(width - 40, 290);
  const AV = 50;

  return (
    <View pointerEvents="none" style={top != null ? [styles.layer, { top }] : styles.layer}>
      {/* ===== NAAM KA BANNER (gaadi ke upar) ===== */}
      <Animated.View
        style={[
          styles.cardWrap,
          { width: cardW, left: (width - cardW) / 2, opacity: cardOp, transform: [{ translateY: cardY }, { scale: cardScale }] },
        ]}
      >
        <View style={[styles.card, { borderColor: glow, shadowColor: glow }]}>
          <LinearGradient
            colors={[B.colors[0], B.colors[1], B.colors[0]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardFill}
          >
            <View style={{ width: AV, height: AV, alignItems: 'center', justifyContent: 'center' }}>
              <Image
                source={{ uri: (data && data.userImg) || FALLBACK_AVATAR }}
                style={{ width: AV - 12, height: AV - 12, borderRadius: (AV - 12) / 2, backgroundColor: '#1C1A22' }}
              />
              <LevelFrame
                level={lv}
                uid={uid}
                lookup={isGift} // gift me level galat aa sakta hai -> asli level (wallet) se frame
                photo={AV - 12}
                style={{ position: 'absolute', width: AV, height: AV }}
              />
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
                <MaterialCommunityIcons name={icon} size={13} color={glow} />
                <Text numberOfLines={1} style={[styles.sub, { color: glow, flexShrink: 1 }]}> {subText || `${RIDE_LABEL[tier] || 'Ride'} se aaye`}</Text>
              </View>
            </View>
          </LinearGradient>
          {/* chamak */}
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
        {/* sitare */}
        {STARS.map((s, i) => {
          const d2 = Math.min(s.d + 0.25, 0.95);
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                left: s.x < 0 ? s.x : s.x * cardW - 8,
                top: s.y,
                opacity: spark.interpolate({ inputRange: [0, s.d, d2, 1], outputRange: [0, 0, 1, 0] }),
                transform: [
                  { translateX: spark.interpolate({ inputRange: [0, s.d, 1], outputRange: [0, 0, s.dx] }) },
                  { translateY: spark.interpolate({ inputRange: [0, s.d, 1], outputRange: [0, 0, s.dy] }) },
                  { scale: spark.interpolate({ inputRange: [0, s.d, d2, 1], outputRange: [0.2, 0.2, 1.2, 0.4] }) },
                ],
              }}
            >
              <MaterialCommunityIcons name="star-four-points" size={s.size} color="#FFF1B0" />
            </Animated.View>
          );
        })}
      </Animated.View>

      {/* ===== GAADI ===== */}
      {/* fly (lamba pankhon wala ghoda): banner ke neeche, taaki sir / pankh na dhake */}
      <Animated.View style={[styles.carWrap, fly && { top: 66 }, { transform: [{ translateX: carX }] }]}>
        {/* zameen par rang ki roshni + parchhai */}
        <View style={[styles.shadow, { backgroundColor: 'rgba(0,0,0,0.45)' }, fly && { top: CAR * 0.93 }]} />
        <View style={[styles.underGlow, { backgroundColor: hexA(fly ? '#FF9A2E' : glow, 0.35), shadowColor: fly ? '#FF9A2E' : glow }, fly && { top: CAR * 0.89 }]} />

        {/* hawa ki lakeerein (gaadi ke peeche = right) */}
        {SPEED_LINES.map((l, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: CAR * 0.82,
              top: CAR * l.y,
              width: l.w,
              height: 2,
              borderRadius: 1,
              opacity: moving,
              transform: [{ translateX: dust.interpolate({ inputRange: [0, 1], outputRange: [l.d * 30, 30 + l.d * 30] }) }],
            }}
          >
            <LinearGradient
              colors={[hexA(glow, 0.9), 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1, borderRadius: 1 }}
            />
          </Animated.View>
        ))}

        {/* dhool (pichhla pahiya) */}
        {DUST.map((p, i) => {
          const d2 = Math.min(p.d + 0.2, 0.9);
          return (
            <Animated.View
              key={'d' + i}
              style={{
                position: 'absolute',
                left: fly ? CAR * 0.5 : CAR * 0.74,
                top: fly ? CAR * 0.86 : CAR * 0.7,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: dustColor || 'rgba(230,220,200,0.55)',
                opacity: Animated.multiply(moving, dust.interpolate({ inputRange: [0, p.d, d2, 1], outputRange: [0, 0, 0.9, 0] })),
                transform: [
                  { translateX: dust.interpolate({ inputRange: [0, p.d, 1], outputRange: [0, 0, p.dx] }) },
                  { translateY: dust.interpolate({ inputRange: [0, p.d, 1], outputRange: [0, 0, p.dy] }) },
                  { scale: dust.interpolate({ inputRange: [0, p.d, 1], outputRange: [0.4, 0.4, p.s] }) },
                ],
              }}
            />
          );
        })}

        {/* gaadi + thartharahat + brake jhukav */}
        <Animated.View style={{ width: CAR, height: CAR, transform: [{ translateY: Animated.add(carY, rearLift) }, { rotate: carRot }] }}>
          <Animated.View style={{ position: 'absolute', width: CAR, height: CAR, opacity: runOp }}>
            <ExpoImage
              source={source || RIDES[tier] || RIDES[30]}
              style={{ width: CAR, height: CAR }}
              contentFit="contain"
              autoplay
              cachePolicy="memory-disk"
              transition={0}
            />
          </Animated.View>
          {standSource ? (
            <Animated.View style={{ position: 'absolute', width: CAR, height: CAR, opacity: standOp }}>
              <ExpoImage source={standSource} style={{ width: CAR, height: CAR }} contentFit="contain" cachePolicy="memory-disk" transition={0} />
            </Animated.View>
          ) : null}
          {/* headlight chamak (brake par tez) */}
          {lights && [[0.1, 0.47], [0.56, 0.5]].map(([x, y], i) => (
            <Animated.View
              key={'h' + i}
              style={[
                styles.headlight,
                { left: CAR * x - 14, top: CAR * y - 14, backgroundColor: hexA('#BFE4FF', 0.55), shadowColor: '#BFE4FF', opacity: lightFlash },
              ]}
            />
          ))}
        </Animated.View>
      </Animated.View>
    </View>
  );
};

export default memo(RideEntry);

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: height * 0.36,
    left: 0,
    right: 0,
    height: LAYER_H,
    zIndex: 99997,
    elevation: 99997,
  },
  cardWrap: { position: 'absolute', top: 0 },
  card: {
    borderRadius: 30,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  cardFill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingLeft: 6, paddingRight: 12 },
  name: { color: '#fff', fontSize: 15, fontWeight: '800', flexShrink: 1 },
  sub: { fontSize: 11.5, fontWeight: '700' },
  lvChip: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
  },
  lvTxt: { color: '#FFE08A', fontSize: 10.5, fontWeight: '900' },
  shine: { position: 'absolute', top: 0, bottom: 0, width: 44 },
  carWrap: { position: 'absolute', top: 22, left: 0, width: CAR, height: CAR }, // gaadi ki image ka upar wala hissa khali hai, isliye banner ke paas
  shadow: {
    position: 'absolute',
    left: CAR * 0.08,
    right: CAR * 0.08,
    top: CAR * 0.74,
    height: CAR * 0.08,
    borderRadius: CAR,
    transform: [{ scaleY: 0.6 }],
  },
  underGlow: {
    position: 'absolute',
    left: CAR * 0.04,
    right: CAR * 0.04,
    top: CAR * 0.7,
    height: CAR * 0.12,
    borderRadius: CAR,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  headlight: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});
