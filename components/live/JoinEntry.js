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
import LevelFrame, { getTier } from '../LevelFrame';
import { bannerFor } from '../../utils/levelTheme';
import { useFrameInfo } from '../adminFrames';
import UserTick from '../UserTick';

const { width, height } = Dimensions.get('window');
const FALLBACK_AVATAR = 'https://avatar.iran.liara.run/public/65';
const TOP = height * 0.45;

// ============================================================
// JOIN ENTRY (live room me jab koi aata hai)
//   Level 30 se kam : chhoti plain pill ("naam has joined"), koi frame / animation nahi
//   Level 30 - 39   : Gold Dragon rang ka banner (lv30 frame)
//   Level 40 - 49   : Purple Crown rang ka banner (lv40 frame)
//   Level 50+       : SVIP rang ka banner (lv50 frame)
// Banner ka rang aur frame dono level se hi aate hain (LevelFrame.js).
// ============================================================

// ---- timing knobs: yahin se speed badlo ----
const ENTER_MS = 800; // right -> left glide
const EXIT_MS = 450; // gayab hone ka time
const EXIT_DRIFT = -34; // gayab hote waqt left taraf kitna sarke
const EASE_IN = Easing.bezier(0.16, 1, 0.3, 1); // silk ease-out (bina bounce)
const EASE_OUT = Easing.bezier(0.4, 0, 0.9, 0.6);

// ---------- shared pieces ----------
const Verified = ({ data, size = 16 }) => (
  <UserTick
    uid={data.senderId || data.uid}
    verified={data.verified === true || data.verified === 'true'}
    verifiedColor={data.verifiedColor}
    size={size}
    style={{ marginLeft: 3 }}
  />
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

// ============================================================
// PLAIN JOIN PILL (Lv 30 se niche) - Tiki jaisi saaf pill, koi animation / frame nahi
// 3.5 sec dikhti hai, phir gayab (us ke baad chat me niche wali "joined" line dikhti hai)
// ============================================================
export const PLAIN_JOIN_MS = 3500;

export const PlainJoinPill = ({ data, onDone }) => {
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    op.setValue(0);
    const a = Animated.timing(op, { toValue: 1, duration: 180, useNativeDriver: true });
    a.start();
    const t = setTimeout(() => {
      Animated.timing(op, { toValue: 0, duration: 250, useNativeDriver: true }).start(
        ({ finished }) => finished && onDone && onDone()
      );
    }, PLAIN_JOIN_MS);
    return () => {
      clearTimeout(t);
      a.stop();
      op.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data._k]);

  return (
    <Animated.View style={[styles.plainPill, { opacity: op }]}>
      <Text numberOfLines={1} style={styles.plainTxt}>{data.senderName}</Text>
      <Verified data={data} size={14} />
      <View style={styles.plainLv}>
        <Text style={styles.plainLvTxt}>LV {data.level}</Text>
      </View>
      <Text style={styles.plainTxt}> has joined</Text>
    </Animated.View>
  );
};

// ============================================================
// FRAME BANNER (Lv 30+) - koi bhari animation nahi.
// Wahi saaf banner jo "My Privileges" page me dikhta hai: avatar + "naam has joined".
// Rang user ke FRAME se milta hai (30 gold / 40 purple / 50 orange).
// Halka fade-in, PLAIN_JOIN_MS tak ruka, phir fade-out.
// ============================================================
export const FrameBanner = ({ data, onDone, tier }) => {
  const enter = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current; // chamak bar
  const spark = useRef(new Animated.Value(0)).current; // sitare
  const [w, setW] = useState(260);
  const B = bannerFor(tier);
  useEffect(() => {
    enter.setValue(0);
    exit.setValue(0);
    shine.setValue(0);
    spark.setValue(0);
    // 1) RIGHT se aata hai -> LEFT par ruk jata hai (silk glide)
    const a = Animated.timing(enter, { toValue: 1, duration: ENTER_MS, easing: EASE_IN, useNativeDriver: true });
    a.start();
    // 2) left par pahunchte hi chamak + sitare (loop jab tak ruka hai)
    const sh = Animated.loop(
      Animated.sequence([
        Animated.timing(shine, { toValue: 1, duration: 900, delay: ENTER_MS - 100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shine, { toValue: 0, duration: 0, delay: 500, useNativeDriver: true }),
      ])
    );
    const sp = Animated.loop(
      Animated.sequence([
        Animated.timing(spark, { toValue: 1, duration: 1100, delay: ENTER_MS - 250, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(spark, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    sh.start();
    sp.start();
    // 3) PLAIN_JOIN_MS tak ruka, phir halka left drift + fade
    const t = setTimeout(() => {
      Animated.timing(exit, { toValue: 1, duration: EXIT_MS, easing: EASE_OUT, useNativeDriver: true }).start(
        ({ finished }) => finished && onDone && onDone()
      );
    }, PLAIN_JOIN_MS);
    return () => {
      clearTimeout(t);
      a.stop();
      sh.stop();
      sp.stop();
      exit.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data._k]);

  const translateX = Animated.add(
    enter.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }),
    exit.interpolate({ inputRange: [0, 1], outputRange: [0, EXIT_DRIFT] })
  );
  const opacity = Animated.multiply(
    enter.interpolate({ inputRange: [0, 0.2], outputRange: [0, 1], extrapolate: 'clamp' }),
    exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
  );

  const lv = Number(data.level) || 1;
  // chamakte sitare (pill ke upar/neeche, alag-alag delay)
  const sparkItems = [
    { x: 14, y: -2, dx: -4, dy: -12, d: 0.0, s: 1.2, size: 12 },
    { x: w * 0.35, y: 0, dx: 0, dy: -14, d: 0.25, s: 1, size: 10 },
    { x: w * 0.6, y: 44, dx: 4, dy: 12, d: 0.4, s: 1.1, size: 11 },
    { x: w - 24, y: 2, dx: 6, dy: -12, d: 0.15, s: 1.3, size: 13 },
    { x: w * 0.82, y: 46, dx: 0, dy: 14, d: 0.5, s: 1, size: 10 },
  ];

  // right end par rang dheere dheere gayab (transparent): last rang ka alpha 0 version
  const toClear = (c) => {
    const m = /^#([0-9a-f]{6})$/i.exec(String(c || ''));
    if (!m) return 'rgba(0,0,0,0)';
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0)`;
  };
  const baseCols = Array.isArray(B.colors) && B.colors.length ? B.colors : ['#FFC83D', '#7a5200'];
  const lastCol = baseCols[baseCols.length - 1];
  const fadeColors = [baseCols[0], lastCol, toClear(lastCol)];
  const PILL_H = 46; // pill ki motai
  const AV = 58; // avatar frame ka size
  const OUT = 16; // avatar pill ke aage kitna bahar nikla rahe
  return (
    <Animated.View style={{ opacity, transform: [{ translateX }], alignSelf: 'flex-start', marginLeft: 10 }}>
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={{ maxWidth: width - 20, height: AV, justifyContent: 'center' }}
      >
        {/* rang wali pill: sirf naam wale hisse par, avatar ke peeche se shuru */}
        <View
          style={{
            marginLeft: AV - OUT,
            height: PILL_H,
            minWidth: width * 0.78,
            borderTopLeftRadius: PILL_H / 2,
            borderBottomLeftRadius: PILL_H / 2,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            overflow: 'hidden',
          }}
        >
          <LinearGradient
            colors={fadeColors}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: OUT + 8,
              paddingRight: 70,
            }}
          >
            <View style={{ flexShrink: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text numberOfLines={1} style={{ color: '#fff', fontSize: 15, fontWeight: '800', flexShrink: 1 }}>
                  {data.senderName}
                </Text>
                <Verified data={data} size={16} />
                {/* LEVEL chip */}
                <View
                  style={{
                    marginLeft: 6,
                    paddingHorizontal: 7,
                    paddingVertical: 1,
                    borderRadius: 9,
                    backgroundColor: 'rgba(0,0,0,0.35)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.6)',
                  }}
                >
                  <Text style={{ color: '#FFE08A', fontSize: 11, fontWeight: '900' }}>LV {lv}</Text>
                </View>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '600', marginTop: 1 }}>
                has joined
              </Text>
            </View>
          </LinearGradient>
          <ShineBar progress={shine} w={w} />
        </View>
        {/* avatar + FRAME: pill ke aage, bina rang ke */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: AV,
            height: AV,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Image
            source={{ uri: data.userImg || FALLBACK_AVATAR }}
            style={{ width: AV - 14, height: AV - 14, borderRadius: (AV - 14) / 2, backgroundColor: '#1C1A22' }}
          />
          <LevelFrame
            level={lv}
            uid={data.senderId || data.uid}
            lookup={false}
            animated={false}
            style={{ position: 'absolute', width: AV, height: AV, resizeMode: 'contain' }}
          />
        </View>
        {/* chamakte sitare */}
        <Burst progress={spark} items={sparkItems} icon="star-four-points" color="#FFF1B0" />
      </View>
    </Animated.View>
  );
};

// ROOM KE ANDAR WALI JAGAH (seats ke niche, jahan kaali "naam has joined" pill aati hai):
//   Lv 30 se niche -> wahi normal kaali pill
//   Lv 30+         -> frame ke rang ka banner, right se left slide
export const JoinSlot = ({ data, onDone }) => {
  const uid = data ? data.senderId : undefined;
  const info = useFrameInfo(uid);
  const key = data ? data._k : undefined;
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    setWaited(false);
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, [key]);
  const ready = !uid || info.loaded || waited;
  const lvl = Math.max(Number(data ? data.level : 0) || 1, Number(info.level) || 0);
  const low = lvl < 30;
  const hidden = !!(data && !low && ready && info.entryOff);
  useEffect(() => {
    if (hidden && onDone) onDone();
  }, [hidden, key]);

  if (!data) return null;
  if (low) return <PlainJoinPill key={key} data={{ ...data, level: lvl }} onDone={onDone} />;
  if (!ready || hidden) return null;
  return <FrameBanner key={key} data={data} onDone={onDone} tier={getTier(lvl) || 30} />;
};

// ============================================================
// PUBLIC COMPONENT
// ============================================================
// pillBottom: (optional) Lv<30 ki plain pill ko screen ke neeche se itni unchai par rakho (chat ke theek upar)
const JoinEntry = ({ data, variant = 'auto', onDone, pillBottom, pillTop, hideLow }) => {
  // User ki Settings wali pasand (entry hatani / doosri entry chuni) yahan lagti hai.
  const uid = data ? data.senderId : undefined;
  const info = useFrameInfo(uid);
  const key = data ? data._k : undefined;

  // User doc aane tak thoda ruko (warna entry shuru hoke beech me gayab ho sakti hai).
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    setWaited(false);
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, [key]);
  const ready = !uid || info.loaded || waited;
  const hidden = !!(data && ready && info.entryOff);

  // entry band hai -> banner turant saaf (warna agli entry atak jati hai)
  useEffect(() => {
    if (hidden && onDone) onDone();
  }, [hidden, key]);

  const lvl = Math.max(Number(data ? data.level : 0) || 1, Number(info.level) || 0);
  // Lv 30 se niche: koi entry animation nahi (chat me sirf plain "joined" line, tick + level ke saath)
  const belowMin = !!data && ready && lvl < 30;

  if (!data || !ready || hidden) return null;
  // hideLow: room khud JoinSlot (chat ke paas) dikha raha hai -> yahan kuch nahi
  if (hideLow) return null;

  // Lv 30 se niche: sirf chhoti plain pill ("naam has joined") 3.5 sec ke liye, phir chat me niche
  // hideLow: room khud chat ke andar (neeche) pill dikha raha hai -> yahan kuch nahi
  if (belowMin && hideLow) return null;
  if (belowMin) {
    return (
      <View
        pointerEvents="none"
        style={
          pillTop != null
            ? [styles.layer, { top: pillTop }]
            : pillBottom != null
            ? [styles.layer, { top: undefined, bottom: pillBottom }]
            : styles.layer
        }
      >
        <PlainJoinPill key={key} data={{ ...data, level: lvl }} onDone={onDone} />
      </View>
    );
  }

  // Purani animated entries hata di gayi. Frame ke rang ka tier nikalo -> banner wahi rang.
  const tier = getTier(lvl) || 30;

  return (
    <View
      pointerEvents="none"
      style={
        pillTop != null
          ? [styles.layer, { top: pillTop }]
          : pillBottom != null
          ? [styles.layer, { top: undefined, bottom: pillBottom }]
          : styles.layer
      }
    >
      <FrameBanner key={key} data={data} onDone={onDone} tier={tier} />
    </View>
  );
};

export default memo(JoinEntry);

const styles = StyleSheet.create({
  plainPill: {
    alignSelf: 'flex-start',
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: width - 40,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  plainTxt: { color: '#d0d0d0', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  plainLv: {
    marginLeft: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#555',
  },
  plainLvTxt: { color: '#FFD700', fontSize: 8, fontWeight: 'bold' },
  layer: {
    position: 'absolute',
    top: TOP,
    left: 0,
    right: 0,
    zIndex: 99997,
    elevation: 99997,
  },
  shineBar: { position: 'absolute', top: 0, bottom: 0, width: 46 },
});
