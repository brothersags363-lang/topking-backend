import React, { useEffect, useRef, useState, memo } from 'react';
import {
  View,
  Text,
  Image,
  Animated,
  Easing,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import LevelFrame from '../LevelFrame';

const { width, height } = Dimensions.get('window');
const FALLBACK_AVATAR = 'https://avatar.iran.liara.run/public/65';
const TOP = height * 0.45;

// ============================================================
// JOIN ENTRY - har level tier ka alag premium entry animation
//
// MOTION (sab tiers me same):
//   1) RIGHT se aata hai  -> smooth glide (no bounce, silk ease-out)
//   2) LEFT par ruk jata hai -> shine / sparkle / pulse isi pause me chalta hai
//   3) phir halka sa left drift + fade + chhota hota hua GAYAB
//
//   Lv 1-9   : slide   (glass pill)
//   Lv 10    : lv10    Silver Glide   (chandi ki pill, chamak)
//   Lv 20    : lv20    Gold Burst     (gold pill + sitaron ka dhamaka)
//   Lv 30    : lv30    Pink Hearts    (dil udte hain)
//   Lv 40    : lv40    Diamond Flip   (neela ribbon, avatar flip, heere)
//   Lv 50    : lv50    LEGEND         (screen hilti hai, taj, angaare, ghoomti ring)
// ============================================================

// ---- timing knobs: yahin se speed badlo ----
const ENTER_MS = 800; // right -> left glide
const EXIT_MS = 450; // gayab hone ka time
const EXIT_DRIFT = -34; // gayab hote waqt left taraf kitna sarke
const EASE_IN = Easing.bezier(0.16, 1, 0.3, 1); // silk ease-out (premium, bina bounce)
const EASE_OUT = Easing.bezier(0.4, 0, 0.9, 0.6);

export const pickVariant = (variant, level = 1) => {
  if (variant && variant !== 'auto') return variant;
  if (level >= 50) return 'lv50';
  if (level >= 40) return 'lv40';
  if (level >= 30) return 'lv30';
  if (level >= 20) return 'lv20';
  if (level >= 10) return 'lv10';
  return 'slide';
};

// ---------- lifecycle: enter -> hold (left par) -> exit -> onDone ----------
// holdMs = mount se lekar exit shuru hone tak ka total time (enter shamil)
function useLifecycle(k, onDone, runEnter, holdMs = 2800) {
  const enter = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    enter.setValue(0);
    exit.setValue(0);
    const a = runEnter(enter);
    a.start();
    const t = setTimeout(() => {
      Animated.timing(exit, {
        toValue: 1,
        duration: EXIT_MS,
        easing: EASE_OUT,
        useNativeDriver: true,
      }).start(({ finished }) => finished && onDone && onDone());
    }, holdMs);
    return () => {
      clearTimeout(t);
      a.stop();
      exit.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  return { enter, exit };
}

// right se left glide + gayab hone ka common motion
const glide = (enter, exit) => ({
  translateX: Animated.add(
    enter.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }),
    exit.interpolate({ inputRange: [0, 1], outputRange: [0, EXIT_DRIFT] })
  ),
  opacity: Animated.multiply(
    enter.interpolate({ inputRange: [0, 0.2], outputRange: [0, 1], extrapolate: 'clamp' }),
    exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
  ),
  scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] }),
});

// ---------- shared pieces ----------
const Verified = ({ data, size = 16 }) =>
  data.verified ? (
    <MaterialCommunityIcons
      name="check-decagram"
      size={size}
      color={data.verifiedColor === 'yellow' ? '#FFD700' : '#4FC3F7'}
      style={{ marginLeft: 3 }}
    />
  ) : null;

const Who = ({ data, size = 16, subtitle = 'joined' }) => (
  <>
    <View style={styles.avatarWrap}>
      <Image
        source={{ uri: data.userImg || FALLBACK_AVATAR }}
        style={styles.avatar}
      />
      {data.level >= 10 && (
        <LevelFrame level={data.level} animated={false} style={styles.frame} />
      )}
    </View>
    <Text numberOfLines={1} style={[styles.name, { fontSize: size }]}>
      {data.senderName}
    </Text>
    <Verified data={data} />
    <Text style={[styles.joined, { fontSize: size }]}>{subtitle}</Text>
  </>
);

const ShineBar = ({ progress, w }) => (
  <Animated.View
    pointerEvents="none"
    style={[
      styles.shineBar,
      {
        transform: [
          {
            translateX: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [-70, w + 20],
            }),
          },
          { skewX: '-20deg' },
        ],
      },
    ]}
  >
    <LinearGradient
      colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.8)', 'rgba(255,255,255,0)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ flex: 1 }}
    />
  </Animated.View>
);

// Particles: sitare / dil / heere / angaare. progress 0 -> 1.
// item = { x, y, dx, dy, d(delay 0..0.6), s(scale), size, dot }
const Burst = ({ progress, items, icon, color }) => (
  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {items.map((it, i) => {
      const d = it.d || 0;
      const d2 = Math.min(d + 0.2, 0.95);
      return (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: it.x,
            top: it.y,
            opacity: progress.interpolate({
              inputRange: [0, d, d2, 1],
              outputRange: [0, 0, 1, 0],
            }),
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, d, 1],
                  outputRange: [0, 0, it.dx || 0],
                }),
              },
              {
                translateY: progress.interpolate({
                  inputRange: [0, d, 1],
                  outputRange: [0, 0, it.dy || 0],
                }),
              },
              {
                scale: progress.interpolate({
                  inputRange: [0, d, d2, 1],
                  outputRange: [0.2, 0.2, it.s || 1, 0.5],
                }),
              },
            ],
          }}
        >
          {it.dot ? (
            <View
              style={{
                width: it.size,
                height: it.size,
                borderRadius: it.size / 2,
                backgroundColor: it.color || color,
              }}
            />
          ) : (
            <MaterialCommunityIcons
              name={icon}
              size={it.size || 14}
              color={it.color || color}
            />
          )}
        </Animated.View>
      );
    })}
  </View>
);

// deterministic pseudo-random (har render par same)
const rnd = (i, m = 1) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * m;
};

const radial = (n, dist, x, y) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x, y, dx: Math.cos(a) * dist, dy: Math.sin(a) * dist, d: 0.05, s: 1.15, size: 14 };
  });

// ============================================================
// SLIDE (Lv 1-9) - glass pill
// ============================================================
const SlideEntry = ({ data, onDone }) => {
  const shine = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(240);

  const { enter, exit } = useLifecycle(
    data._k,
    onDone,
    (v) => {
      shine.setValue(0);
      return Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: ENTER_MS,
          easing: EASE_IN,
          useNativeDriver: true,
        }),
        Animated.timing(shine, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]);
    },
    2700
  );

  const { translateX, opacity, scale } = glide(enter, exit);

  return (
    <Animated.View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        styles.clipPill,
        { left: 10, borderColor: 'rgba(255,255,255,0.55)', opacity, transform: [{ translateX }, { scale }] },
      ]}
    >
      <LinearGradient
        colors={['rgba(14,14,24,0.9)', 'rgba(60,60,88,0.82)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.pillInner}
      >
        <Who data={data} />
      </LinearGradient>
      <ShineBar progress={shine} w={w} />
    </Animated.View>
  );
};

// ============================================================
// LV10 - SILVER GLIDE
// ============================================================
const SilverEntry = ({ data, onDone }) => {
  const shine = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(260);

  const { enter, exit } = useLifecycle(
    data._k,
    onDone,
    (v) => {
      shine.setValue(0);
      return Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: ENTER_MS,
          easing: EASE_IN,
          useNativeDriver: true,
        }),
        Animated.timing(shine, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]);
    },
    2900
  );

  const { translateX, opacity, scale } = glide(enter, exit);

  return (
    <Animated.View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        styles.clipPill,
        { left: 10, borderColor: '#fff', opacity, transform: [{ translateX }, { scale }] },
      ]}
    >
      <LinearGradient
        colors={['#4a4e57', '#aab1bd', '#4a4e57']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.pillInner}
      >
        <Who data={data} />
      </LinearGradient>
      <ShineBar progress={shine} w={w} />
    </Animated.View>
  );
};

// ============================================================
// LV20 - GOLD BURST
// ============================================================
const GoldEntry = ({ data, onDone }) => {
  const shine = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(260);

  const { enter, exit } = useLifecycle(
    data._k,
    onDone,
    (v) => {
      shine.setValue(0);
      burst.setValue(0);
      return Animated.parallel([
        Animated.timing(v, {
          toValue: 1,
          duration: ENTER_MS,
          easing: EASE_IN,
          useNativeDriver: true,
        }),
        // pill left par pahunchte hi sitaron ka dhamaka
        Animated.timing(burst, {
          toValue: 1,
          duration: 1000,
          delay: ENTER_MS - 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(shine, {
          toValue: 1,
          duration: 800,
          delay: ENTER_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]);
    },
    3100
  );

  const { translateX, opacity, scale } = glide(enter, exit);

  const items = useRef([
    ...radial(8, 52, 27, 27),
    { x: w * 0.6, y: 10, dx: 0, dy: -34, d: 0.3, s: 1.1, size: 12 },
    { x: w * 0.8, y: 40, dx: 10, dy: 26, d: 0.4, s: 1, size: 12 },
  ]).current;

  return (
    <Animated.View
      style={{ position: 'absolute', top: 0, left: 10, opacity, transform: [{ translateX }, { scale }] }}
    >
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={[styles.clipPill, { position: 'relative', left: 0, borderColor: '#FFE08A', ...styles.goldGlow }]}
      >
        <LinearGradient
          colors={['#7a5200', '#FFC83D', '#7a5200']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.pillInner}
        >
          <Who data={data} />
        </LinearGradient>
        <ShineBar progress={shine} w={w} />
      </View>
      <Burst progress={burst} items={items} icon="star-four-points" color="#FFE066" />
    </Animated.View>
  );
};

// ============================================================
// LV30 - PINK HEARTS
// ============================================================
const HEARTS = Array.from({ length: 9 }, (_, i) => ({
  x: 30 + rnd(i + 1, 240),
  y: 8,
  dx: rnd(i + 20, 30) - 15,
  dy: -(60 + rnd(i + 40, 60)),
  d: rnd(i + 60, 0.45),
  s: 0.9 + rnd(i + 80, 0.6),
  size: 14 + Math.round(rnd(i + 5, 8)),
}));

const PinkEntry = ({ data, onDone }) => {
  const burst = useRef(new Animated.Value(0)).current;
  const beat = useRef(new Animated.Value(1)).current;
  const shine = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(260);

  const { enter, exit } = useLifecycle(
    data._k,
    onDone,
    (v) => {
      burst.setValue(0);
      beat.setValue(1);
      shine.setValue(0);
      const pulse = Animated.sequence([
        Animated.timing(beat, { toValue: 1.28, duration: 170, useNativeDriver: true }),
        Animated.timing(beat, { toValue: 1, duration: 170, useNativeDriver: true }),
      ]);
      return Animated.parallel([
        Animated.timing(v, {
          toValue: 1,
          duration: ENTER_MS,
          easing: EASE_IN,
          useNativeDriver: true,
        }),
        Animated.timing(burst, {
          toValue: 1,
          duration: 1800,
          delay: ENTER_MS - 250,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shine, {
          toValue: 1,
          duration: 800,
          delay: ENTER_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([Animated.delay(ENTER_MS - 100), pulse, pulse, pulse]),
      ]);
    },
    3200
  );

  const { translateX, opacity, scale } = glide(enter, exit);

  return (
    <Animated.View
      style={{ position: 'absolute', top: 0, left: 10, opacity, transform: [{ translateX }, { scale }] }}
    >
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={styles.pinkClip}
      >
        <LinearGradient
          colors={['#d4004f', '#ff6fb1', '#d4004f']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.pinkBar}
        >
          <Animated.View style={[styles.avatarWrap, { transform: [{ scale: beat }] }]}>
            <Image source={{ uri: data.userImg || FALLBACK_AVATAR }} style={styles.avatar} />
            {data.level >= 10 && (
              <LevelFrame level={data.level} animated={false} style={styles.frame} />
            )}
          </Animated.View>
          <Text numberOfLines={1} style={[styles.name, { fontSize: 17, flexShrink: 1 }]}>
            {data.senderName}
          </Text>
          <Verified data={data} />
          <Text style={[styles.joined, { fontSize: 17 }]}>joined</Text>
          <MaterialCommunityIcons name="heart" size={20} color="#fff" style={{ marginLeft: 6 }} />
        </LinearGradient>
        <ShineBar progress={shine} w={w} />
      </View>
      <Burst progress={burst} items={HEARTS} icon="heart" color="#ffb3d4" />
    </Animated.View>
  );
};

// ============================================================
// LV40 - DIAMOND FLIP
// ============================================================
const DIAMONDS = [
  { x: width * 0.1, y: 4, d: 0.0, s: 1.2, size: 14 },
  { x: width * 0.28, y: 56, d: 0.15, s: 1, size: 12 },
  { x: width * 0.46, y: 2, d: 0.3, s: 1.3, size: 16 },
  { x: width * 0.64, y: 58, d: 0.45, s: 1, size: 12 },
  { x: width * 0.8, y: 6, d: 0.2, s: 1.2, size: 14 },
  { x: width * 0.92, y: 52, d: 0.5, s: 1, size: 12 },
];

const DiamondEntry = ({ data, onDone }) => {
  const twinkle = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current; // avatar flip + text, ribbon pahunchne par

  const { enter, exit } = useLifecycle(
    data._k,
    onDone,
    (v) => {
      twinkle.setValue(0);
      reveal.setValue(0);
      return Animated.parallel([
        Animated.timing(v, {
          toValue: 1,
          duration: ENTER_MS + 150,
          easing: EASE_IN,
          useNativeDriver: true,
        }),
        Animated.timing(reveal, {
          toValue: 1,
          duration: 750,
          delay: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(twinkle, {
          toValue: 1,
          duration: 1800,
          delay: ENTER_MS - 100,
          useNativeDriver: true,
        }),
      ]);
    },
    3400
  );

  const g = glide(enter, exit);
  const flip = reveal.interpolate({ inputRange: [0.1, 0.7], outputRange: ['-180deg', '0deg'], extrapolate: 'clamp' });
  const avatarScale = reveal.interpolate({ inputRange: [0, 0.5, 0.8], outputRange: [0, 1.2, 1], extrapolate: 'clamp' });
  const textOpacity = reveal.interpolate({ inputRange: [0.4, 0.9], outputRange: [0, 1], extrapolate: 'clamp' });
  const textX = reveal.interpolate({ inputRange: [0.4, 0.9], outputRange: [-30, 0], extrapolate: 'clamp' });
  const scaleY = exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] });

  return (
    <Animated.View
      style={[styles.ribbonWrap, { opacity: g.opacity, transform: [{ translateX: g.translateX }, { scaleY }] }]}
    >
      <LinearGradient
        colors={[
          'rgba(0,191,255,0)',
          'rgba(0,140,230,0.95)',
          'rgba(158,248,255,0.95)',
          'rgba(0,140,230,0.95)',
          'rgba(0,191,255,0)',
        ]}
        locations={[0, 0.2, 0.5, 0.8, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ width, height: 78 }}
      />

      <Burst progress={twinkle} items={DIAMONDS} icon="diamond-stone" color="#fff" />

      <View style={styles.ribbonContent} pointerEvents="none">
        <Animated.View
          style={{ transform: [{ perspective: 600 }, { scale: avatarScale }, { rotateY: flip }] }}
        >
          <View style={[styles.ring, { borderColor: '#9EF8FF' }]}>
            <Image source={{ uri: data.userImg || FALLBACK_AVATAR }} style={styles.fill} />
          </View>
        </Animated.View>

        <Animated.View
          style={{ marginLeft: 12, opacity: textOpacity, transform: [{ translateX: textX }], maxWidth: width * 0.6 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text numberOfLines={1} style={styles.rName}>{data.senderName}</Text>
            <Verified data={data} size={17} />
            <View style={styles.lvChip}>
              <Text style={styles.lvChipText}>LV {data.level}</Text>
            </View>
          </View>
          <Text style={styles.rSub}>has entered the room</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
};

// ============================================================
// LV50 - LEGEND
// ============================================================
const EMBERS = Array.from({ length: 16 }, (_, i) => ({
  x: rnd(i + 3, width - 20) + 10,
  y: 78 + rnd(i + 7, 14),
  dx: rnd(i + 11, 40) - 20,
  dy: -(70 + rnd(i + 13, 90)),
  d: rnd(i + 17, 0.5),
  s: 1,
  size: 3 + Math.round(rnd(i + 19, 4)),
  dot: true,
  color: i % 3 === 0 ? '#FFD700' : i % 3 === 1 ? '#FF9A3D' : '#FF5A36',
}));

const LegendEntry = ({ data, onDone }) => {
  const burst = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    spin.setValue(0);
    const l = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true })
    );
    l.start();
    return () => l.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data._k]);

  const { enter, exit } = useLifecycle(
    data._k,
    onDone,
    (v) => {
      burst.setValue(0);
      shake.setValue(0);
      flash.setValue(0);
      reveal.setValue(0);
      const land = ENTER_MS; // ribbon left par pahunchne ka waqt
      const j = (to, d = 55) => Animated.timing(shake, { toValue: to, duration: d, useNativeDriver: true });
      return Animated.parallel([
        Animated.timing(v, {
          toValue: 1,
          duration: land + 200,
          easing: EASE_IN,
          useNativeDriver: true,
        }),
        Animated.timing(reveal, {
          toValue: 1,
          duration: 850,
          delay: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(burst, {
          toValue: 1,
          duration: 2400,
          delay: land - 150,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        // landing par gold flash + halka shake
        Animated.sequence([
          Animated.delay(land - 150),
          Animated.timing(flash, { toValue: 1, duration: 90, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0, duration: 450, useNativeDriver: true }),
        ]),
        Animated.sequence([Animated.delay(land - 100), j(1), j(-1), j(1), j(-1), j(0)]),
      ]);
    },
    4500
  );

  const g = glide(enter, exit);
  const avatarScale = reveal.interpolate({ inputRange: [0, 0.45, 0.65], outputRange: [0, 1.25, 1], extrapolate: 'clamp' });
  const crownY = reveal.interpolate({ inputRange: [0.3, 0.6, 0.75], outputRange: [-60, 6, 0], extrapolate: 'clamp' });
  const crownOp = reveal.interpolate({ inputRange: [0.3, 0.4], outputRange: [0, 1], extrapolate: 'clamp' });
  const textOpacity = reveal.interpolate({ inputRange: [0.5, 0.9], outputRange: [0, 1], extrapolate: 'clamp' });
  const textX = reveal.interpolate({ inputRange: [0.5, 0.9], outputRange: [30, 0], extrapolate: 'clamp' });
  const dim = Animated.multiply(
    enter.interpolate({ inputRange: [0, 0.4], outputRange: [0, 0.45], extrapolate: 'clamp' }),
    exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
  );
  const shakeX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-7, 7] });
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scaleY = exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0.75] });

  return (
    <>
      {/* screen dim + gold flash */}
      <Animated.View pointerEvents="none" style={[styles.screen, { backgroundColor: '#000', opacity: dim }]} />
      <Animated.View pointerEvents="none" style={[styles.screen, { backgroundColor: '#FFD34D', opacity: Animated.multiply(flash, 0.4) }]} />

      <Animated.View
        style={[
          styles.legendWrap,
          {
            opacity: g.opacity,
            transform: [{ translateX: Animated.add(g.translateX, shakeX) }, { scaleY }],
          },
        ]}
      >
        <View style={{ width }}>
          <LinearGradient
            colors={[
              'rgba(70,20,150,0)',
              'rgba(90,25,190,0.96)',
              'rgba(255,190,50,0.97)',
              'rgba(90,25,190,0.96)',
              'rgba(70,20,150,0)',
            ]}
            locations={[0, 0.18, 0.5, 0.82, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ height: 100 }}
          />
          <View style={styles.goldLineTop} />
          <View style={styles.goldLineBottom} />
        </View>

        <Burst progress={burst} items={EMBERS} icon="circle" color="#FFB347" />

        <View style={styles.legendContent} pointerEvents="none">
          <Animated.View style={{ transform: [{ scale: avatarScale }] }}>
            <Animated.View style={[styles.spinRing, { transform: [{ rotate: spinDeg }] }]} />
            <View style={[styles.ring, { width: 72, height: 72, borderRadius: 36, borderColor: '#FFD700' }]}>
              <Image source={{ uri: data.userImg || FALLBACK_AVATAR }} style={styles.fill} />
            </View>
            <Animated.View
              style={{ position: 'absolute', top: -26, alignSelf: 'center', opacity: crownOp, transform: [{ translateY: crownY }] }}
            >
              <MaterialCommunityIcons name="crown" size={32} color="#FFD700" />
            </Animated.View>
          </Animated.View>

          <Animated.View
            style={{ marginLeft: 16, opacity: textOpacity, transform: [{ translateX: textX }], maxWidth: width * 0.58 }}
          >
            <Text style={styles.legendTag}>LEGEND</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text numberOfLines={1} style={[styles.rName, { fontSize: 21 }]}>{data.senderName}</Text>
              <Verified data={data} size={18} />
            </View>
            <Text style={styles.rSub}>has entered the room</Text>
          </Animated.View>
        </View>
      </Animated.View>
    </>
  );
};

// ============================================================
// PUBLIC COMPONENT
// ============================================================
const JoinEntry = ({ data, variant = 'auto', onDone }) => {
  if (!data) return null;
  const v = pickVariant(variant, data.level || 1);
  const k = data._k;

  return (
    <View pointerEvents="none" style={styles.layer}>
      {v === 'lv10' ? (
        <SilverEntry key={k} data={data} onDone={onDone} />
      ) : v === 'lv20' ? (
        <GoldEntry key={k} data={data} onDone={onDone} />
      ) : v === 'lv30' ? (
        <PinkEntry key={k} data={data} onDone={onDone} />
      ) : v === 'lv40' ? (
        <DiamondEntry key={k} data={data} onDone={onDone} />
      ) : v === 'lv50' ? (
        <LegendEntry key={k} data={data} onDone={onDone} />
      ) : (
        <SlideEntry key={k} data={data} onDone={onDone} />
      )}
    </View>
  );
};

export default memo(JoinEntry);

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: TOP,
    left: 0,
    right: 0,
    zIndex: 99997,
    elevation: 99997,
  },
  screen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -TOP,
    height,
  },
  fill: { width: '100%', height: '100%' },

  avatarWrap: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#2a2b38' },
  frame: { position: 'absolute', width: 50, height: 50, resizeMode: 'contain' },
  name: { color: '#fff', fontWeight: 'bold', marginLeft: 8, flexShrink: 1 },
  joined: { color: '#fff', fontWeight: 'bold', marginLeft: 6 },

  clipPill: {
    position: 'absolute',
    top: 0,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1.5,
    maxWidth: width * 0.82,
  },
  pillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 5,
    paddingRight: 18,
    paddingVertical: 5,
  },
  goldGlow: {
    shadowColor: '#FFC83D',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  shineBar: { position: 'absolute', top: 0, bottom: 0, width: 46 },

  pinkClip: {
    alignSelf: 'flex-start',
    borderRadius: 34,
    overflow: 'hidden',
    maxWidth: width * 0.9,
  },
  pinkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 18,
    paddingVertical: 6,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },

  ribbonWrap: { position: 'absolute', top: -10, left: 0, right: 0, height: 78, justifyContent: 'center' },
  ribbonContent: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ring: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3,
    overflow: 'hidden',
    backgroundColor: '#222',
  },
  rName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
    flexShrink: 1,
  },
  rSub: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '600', marginTop: 1 },
  lvChip: {
    marginLeft: 8,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  lvChipText: { color: '#fff', fontSize: 11, fontWeight: '900' },

  legendWrap: { position: 'absolute', top: -22, left: 0, right: 0, height: 100, justifyContent: 'center' },
  legendContent: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  goldLineTop: { position: 'absolute', top: 0, left: width * 0.1, right: width * 0.1, height: 2, backgroundColor: 'rgba(255,215,0,0.9)' },
  goldLineBottom: { position: 'absolute', bottom: 0, left: width * 0.1, right: width * 0.1, height: 2, backgroundColor: 'rgba(255,215,0,0.9)' },
  spinRing: {
    position: 'absolute',
    left: -7,
    top: -7,
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#FFE08A',
  },
  legendTag: {
    color: '#FFE08A',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
  },
});
