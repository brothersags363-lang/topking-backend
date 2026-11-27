import React, { useEffect, useRef, memo } from 'react';
import { View, Text, Animated, Easing, Dimensions, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import UserTick from '../UserTick';
import { LevelPrefix } from './UserLabel';

// ============================================================
// FOX ENTRY - SVIP1 (Lv 50-59) user live room me aaye to SAFED LOMDI (Tiki jaisi):
//   1) RIGHT se chalti hui aati hai (halki uchhal-kood), neeche "Svip1 naam has joined" pill
//   2) BEECH me ruk jati hai: poonchh hilti hai, kaan fadakte hain, saans leti hai
//   3) LEFT side daud kar chamak ke saath gayab, pill bhi fade
// Lomdi 4 alag parts me hai (assets/entries/fox_*.webp, sab same canvas):
//   body, tail (poonchh), ear_big (aage wala kaan), ear_small (peeche wala kaan)
// Sirf transform / opacity + useNativeDriver => live room me smooth.
// ============================================================
const FOX_BODY = require('../../assets/entries/fox_body.webp');
const FOX_TAIL = require('../../assets/entries/fox_tail.webp');
const FOX_EAR_BIG = require('../../assets/entries/fox_ear_big.webp');
const FOX_EAR_SMALL = require('../../assets/entries/fox_ear_small.webp');

const { width, height } = Dimensions.get('window');

// ---- timing knobs: yahin se speed badlo ----
const WALK_IN_MS = 1300; // right se beech tak
const HOLD_MS = 3000; // beech me ruki (poonchh / kaan / ghoomna)
const RUN_OUT_MS = 950; // beech se left gayab
export const FOX_TOTAL_MS = WALK_IN_MS + HOLD_MS + RUN_OUT_MS;

// ---- size ----
const ART_W = 330; // fox_*.webp ka size
const ART_H = 444;
const FH = Math.min(height * 0.19, 150); // lomdi ki unchai (badi chahiye to 150 badhao)
const FW = (FH * ART_W) / ART_H;
const PILL_H = 34;
const LAYER_H = FH + PILL_H + 14;

// parts ke ghoomne ki keel (canvas ka %)
// NOTE: RN dashamlav wale % string ("65.5%") nahi padhta -> crash. Isliye pixel numbers [x, y, 0].
const pivot = (px, py) => [Math.round((FW * px) / 100), Math.round((FH * py) / 100), 0];
const TAIL_PIVOT = pivot(10.9, 65.5);
const EAR_BIG_PIVOT = pivot(77.3, 12.8);
const EAR_SMALL_PIVOT = pivot(60, 11.4);

// chalte waqt uchhal: progress ko zig-zag me badlo
const STEPS = 7;
const hopRange = (amp) => {
  const inR = [];
  const outR = [];
  for (let i = 0; i <= STEPS * 2; i++) {
    inR.push(i / (STEPS * 2));
    outR.push(i % 2 ? -amp : 0);
  }
  return { inputRange: inR, outputRange: outR };
};

// lomdi ke aas-paas chamakte sitare (ruki hai tab)
const TWINKLES = [
  { x: -FW * 0.55, y: FH * 0.12, s: 11, d: 0 },
  { x: FW * 0.5, y: FH * 0.05, s: 9, d: 0.35 },
  { x: FW * 0.62, y: FH * 0.55, s: 12, d: 0.6 },
  { x: -FW * 0.7, y: FH * 0.62, s: 8, d: 0.2 },
  { x: -FW * 0.1, y: -6, s: 10, d: 0.8 },
];
// gayab hote waqt peeche chhoot-ti chamak
const TRAIL = Array.from({ length: 9 }, (_, i) => ({
  y: FH * (0.25 + ((i * 37) % 60) / 100),
  dx: 30 + ((i * 53) % 70),
  dy: -12 + ((i * 29) % 24),
  s: 4 + (i % 3) * 2,
  d: (i % 5) * 0.08,
}));

const FoxEntry = ({ data, onDone, top }) => {
  const walkIn = useRef(new Animated.Value(0)).current; // 0 right bahar -> 1 beech
  const runOut = useRef(new Animated.Value(0)).current; // 0 beech -> 1 left bahar
  const tail = useRef(new Animated.Value(0)).current; // poonchh -1..1
  const earB = useRef(new Animated.Value(0)).current;
  const earS = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;
  const pill = useRef(new Animated.Value(0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    [walkIn, runOut, tail, earB, earS, breath, pill, twinkle, shine].forEach((v) => v.setValue(0));
    const nd = { useNativeDriver: true };
    const sin = Easing.inOut(Easing.sin);

    // poonchh: hamesha halki, ruki ho to tez (alag speed = zinda lagti hai)
    const tailLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(tail, { toValue: 1, duration: 280, easing: sin, ...nd }),
        Animated.timing(tail, { toValue: -1, duration: 320, easing: sin, ...nd }),
        Animated.timing(tail, { toValue: 0.6, duration: 260, easing: sin, ...nd }),
        Animated.timing(tail, { toValue: -0.8, duration: 300, easing: sin, ...nd }),
        Animated.timing(tail, { toValue: 0, duration: 240, easing: sin, ...nd }),
        Animated.delay(250),
      ])
    );
    // kaan fadakna: jhatke se, beech me ruk kar
    const twitch = (v, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 90, easing: Easing.out(Easing.quad), ...nd }),
          Animated.timing(v, { toValue: -0.5, duration: 110, ...nd }),
          Animated.timing(v, { toValue: 0.7, duration: 90, ...nd }),
          Animated.timing(v, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), ...nd }),
          Animated.delay(700),
        ])
      );
    const earLoopB = twitch(earB, 250);
    const earLoopS = twitch(earS, 520);
    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 850, easing: sin, ...nd }),
        Animated.timing(breath, { toValue: 0, duration: 850, easing: sin, ...nd }),
      ])
    );
    const twLoop = Animated.loop(Animated.timing(twinkle, { toValue: 1, duration: 1400, easing: Easing.linear, ...nd }));
    const shineLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shine, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), ...nd }),
        Animated.delay(600),
        Animated.timing(shine, { toValue: 0, duration: 0, ...nd }),
      ])
    );
    tailLoop.start();
    breathLoop.start();
    twLoop.start();
    shineLoop.start();

    const main = Animated.sequence([
      // 1) right se aana + pill
      Animated.parallel([
        Animated.timing(walkIn, { toValue: 1, duration: WALK_IN_MS, easing: Easing.bezier(0.25, 0.6, 0.35, 1), ...nd }),
        Animated.sequence([
          Animated.delay(WALK_IN_MS * 0.45),
          Animated.spring(pill, { toValue: 1, friction: 6, tension: 80, ...nd }),
        ]),
      ]),
      // 2) ruki: poonchh / kaan hilte hain (tasveer ghoomti NAHI)
      Animated.delay(HOLD_MS),
      // 3) left side daud kar gayab + pill fade
      Animated.parallel([
        Animated.timing(runOut, { toValue: 1, duration: RUN_OUT_MS, easing: Easing.bezier(0.5, 0, 0.9, 0.5), ...nd }),
        Animated.timing(pill, { toValue: 2, duration: RUN_OUT_MS * 0.8, easing: Easing.in(Easing.quad), ...nd }),
      ]),
    ]);
    const tEar = setTimeout(() => {
      earLoopB.start();
      earLoopS.start();
    }, WALK_IN_MS - 200);
    main.start(({ finished }) => finished && onDone && onDone());

    return () => {
      clearTimeout(tEar);
      [main, tailLoop, earLoopB, earLoopS, breathLoop, twLoop, shineLoop].forEach((a) => a.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data && data._k]);

  // ---------- lomdi ki chaal ----------
  const startX = width / 2 + FW; // right screen ke bahar
  const endX = -(width / 2 + FW); // left screen ke bahar
  const foxX = Animated.add(
    walkIn.interpolate({ inputRange: [0, 1], outputRange: [startX, 0] }),
    runOut.interpolate({ inputRange: [0, 1], outputRange: [0, endX] })
  );
  const hopIn = walkIn.interpolate(hopRange(6));
  const hopOut = runOut.interpolate(hopRange(9));
  const breathY = breath.interpolate({ inputRange: [0, 1], outputRange: [0, -1.5] });
  const foxY = Animated.add(Animated.add(hopIn, hopOut), breathY);
  const breathSc = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.015] });
  const foxOp = Animated.multiply(
    walkIn.interpolate({ inputRange: [0, 0.12], outputRange: [0, 1], extrapolate: 'clamp' }),
    runOut.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.95, 0], extrapolate: 'clamp' })
  );
  const runSc = runOut.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] });

  const tailRot = tail.interpolate({ inputRange: [-1, 1], outputRange: ['-4deg', '5deg'] });
  const earBRot = earB.interpolate({ inputRange: [-1, 1], outputRange: ['-9deg', '9deg'] });
  const earSRot = earS.interpolate({ inputRange: [-1, 1], outputRange: ['8deg', '-8deg'] });

  // zameen ki parchhai
  const shadowOp = Animated.multiply(foxOp, 0.55);
  const shadowSc = Animated.add(1, Animated.multiply(Animated.add(hopIn, hopOut), 0.025));

  // pill: 0 chhupi, 1 dikh rahi, 2 gayab
  const pillOp = pill.interpolate({ inputRange: [0, 0.3, 1, 1.6, 2], outputRange: [0, 1, 1, 0.4, 0], extrapolate: 'clamp' });
  const pillSc = pill.interpolate({ inputRange: [0, 1, 2], outputRange: [0.6, 1, 0.92], extrapolate: 'clamp' });
  const pillX = pill.interpolate({ inputRange: [0, 1, 2], outputRange: [40, 0, -30], extrapolate: 'clamp' });

  // sitare sirf ruki ho tab
  const holdOp = Animated.multiply(
    walkIn.interpolate({ inputRange: [0.85, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    runOut.interpolate({ inputRange: [0, 0.2], outputRange: [1, 0], extrapolate: 'clamp' })
  );

  const uid = data ? data.senderId || data.uid : undefined;
  const lv = Number(data && data.level) || 50;
  const L = top != null ? top : height * 0.36;
  const pillW = Math.min(width - 60, 270);

  return (
    <View pointerEvents="none" style={[styles.layer, { top: Math.max(0, Math.min(L, height - LAYER_H - 8)) }]}>
      {/* ===== parchhai ===== */}
      <Animated.View
        style={[styles.shadow, { opacity: shadowOp, transform: [{ translateX: foxX }, { scaleX: shadowSc }] }]}
      />

      {/* ===== gayab hote waqt chamak ki lakeer ===== */}
      {TRAIL.map((t, i) => {
        const d2 = Math.min(t.d + 0.35, 1);
        return (
          <Animated.View
            key={'t' + i}
            style={[
              styles.dot,
              {
                width: t.s, height: t.s, borderRadius: t.s / 2, top: t.y,
                opacity: runOut.interpolate({ inputRange: [0, t.d, t.d + 0.08, d2], outputRange: [0, 0, 1, 0], extrapolate: 'clamp' }),
                transform: [
                  { translateX: Animated.add(foxX, runOut.interpolate({ inputRange: [0, t.d, 1], outputRange: [0, 0, t.dx], extrapolate: 'clamp' })) },
                  { translateY: runOut.interpolate({ inputRange: [0, 1], outputRange: [0, t.dy] }) },
                ],
              },
            ]}
          />
        );
      })}

      {/* ===== LOMDI ===== */}
      <Animated.View
        style={[
          styles.foxBox,
          {
            opacity: foxOp,
            transform: [
              { translateX: foxX },
              { translateY: foxY },
              { scale: Animated.multiply(breathSc, runSc) },
            ],
          },
        ]}
      >
        {/* chehra RIGHT taraf (art left-facing hai, isliye ulta) */}
        <View style={[StyleSheet.absoluteFill, { transform: [{ scaleX: -1 }] }]}>
          <ExpoImage source={FOX_BODY} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" transition={0} />
          <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: TAIL_PIVOT, transform: [{ rotate: tailRot }] }]}>
            <ExpoImage source={FOX_TAIL} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" transition={0} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: EAR_SMALL_PIVOT, transform: [{ rotate: earSRot }] }]}>
            <ExpoImage source={FOX_EAR_SMALL} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" transition={0} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: EAR_BIG_PIVOT, transform: [{ rotate: earBRot }] }]}>
            <ExpoImage source={FOX_EAR_BIG} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" transition={0} />
          </Animated.View>
        </View>
      </Animated.View>

      {/* ===== chamakte sitare (ruki hai tab) ===== */}
      {TWINKLES.map((s, i) => {
        const v = twinkle.interpolate({ inputRange: [0, 1], outputRange: [s.d, s.d + 1] });
        const ph = v.interpolate({ inputRange: [0, 1, 1.0001, 2], outputRange: [0, 1, 0, 1] });
        return (
          <Animated.View
            key={'s' + i}
            style={{
              position: 'absolute',
              left: width / 2 + s.x - s.s / 2,
              top: s.y,
              opacity: Animated.multiply(holdOp, ph.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: [0, 1, 0.2, 0] })),
              transform: [{ scale: ph.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.2, 0.4] }) }],
            }}
          >
            <MaterialCommunityIcons name="star-four-points" size={s.s} color="#FFF6D0" />
          </Animated.View>
        );
      })}

      {/* ===== "Svip1 naam has joined" pill (Tiki jaisi) ===== */}
      <Animated.View
        style={[
          styles.pillWrap,
          { width: pillW, left: (width - pillW) / 2, opacity: pillOp, transform: [{ translateX: pillX }, { scale: pillSc }] },
        ]}
      >
        <LinearGradient
          colors={['rgba(58,36,92,0.92)', 'rgba(40,26,70,0.92)', 'rgba(58,36,92,0.92)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.pill}
        >
          <LevelPrefix level={lv} size={9} svipHeight={20} style={{ marginRight: 6 }} />
          <Text numberOfLines={1} style={styles.name}>
            {data && data.senderName}
          </Text>
          <UserTick
            uid={uid}
            verified={data && (data.verified === true || data.verified === 'true')}
            verifiedColor={data && data.verifiedColor}
            size={14}
            style={{ marginLeft: 3 }}
          />
          <Text style={styles.joined}> has joined</Text>
          <MaterialCommunityIcons name="star-four-points" size={10} color="#FFF1B0" style={{ marginLeft: 4 }} />
          <Animated.View
            style={[
              styles.shine,
              { transform: [{ translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-60, pillW + 20] }) }, { skewX: '-20deg' }] },
            ]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </LinearGradient>
      </Animated.View>
    </View>
  );
};

export default memo(FoxEntry);

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, height: LAYER_H, zIndex: 99997, elevation: 99997 },
  foxBox: { position: 'absolute', top: 0, left: (width - FW) / 2, width: FW, height: FH },
  shadow: {
    position: 'absolute',
    top: FH - 12,
    left: (width - FW * 0.85) / 2,
    width: FW * 0.85,
    height: 12,
    borderRadius: 100,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  dot: {
    position: 'absolute',
    left: width / 2,
    backgroundColor: '#FFF4C8',
    shadowColor: '#FFE38A',
    shadowOpacity: 1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  pillWrap: { position: 'absolute', top: FH + 4, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: PILL_H,
    borderRadius: PILL_H / 2,
    paddingHorizontal: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(214,180,255,0.45)',
    maxWidth: '100%',
  },
  name: { color: '#fff', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  joined: { color: '#fff', fontSize: 14, fontWeight: '600' },
  shine: { position: 'absolute', top: 0, bottom: 0, width: 40 },
});
