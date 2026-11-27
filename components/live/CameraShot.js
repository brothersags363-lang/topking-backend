import React, { useEffect, useRef, memo } from 'react';
import { View, Text, Image, Animated, Easing, Dimensions, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// ============================================================
// CAMERA GIFT - live room me koi CAMERA gift bheje to:
//   1) camera neeche se uchhal kar beech me aata hai
//   2) 3 baar CLICK: har click par POORI SCREEN par white flash + camera jhatka
//   3) har click par ek photo (polaroid) camera se nikal kar upar lag jati hai (3 photo pankhe jaisi)
//   4) sab dheere se gayab
// Sirf transform / opacity animation + useNativeDriver => live room me bhi smooth.
// (CarGiftRide.js se chalta hai: popup ke neeche, ek ke baad ek)
// ============================================================
const { width, height } = Dimensions.get('window');
const FALLBACK_AVATAR = 'https://avatar.iran.liara.run/public/65';
const CAMERA_IMG = require('../../assets/gifts/camera.webp');

// ---- timing knobs: yahin se speed badlo ----
const ENTER_MS = 650; // camera aane ka time
const CLICK_GAP_MS = 850; // do click ke beech
const FIRST_CLICK_MS = 900; // pehla click kab
const EXIT_AT_MS = FIRST_CLICK_MS + CLICK_GAP_MS * 2 + 1100; // aakhri photo dikhne ke baad gayab
const EXIT_MS = 400;
export const CAMERA_TOTAL_MS = EXIT_AT_MS + EXIT_MS; // ~4.2 sec
const FLASH_PEAK = 0.8; // poori screen ka flash kitna tez (0..1)

const CAM = Math.min(width * 0.3, 125); // camera ka size
const PH_W = Math.min(width * 0.22, 86); // photo (polaroid) ki chaudai
const PH_H = PH_W * 1.2;
const PHOTO_ROW_H = PH_H + 16;
const LAYER_H = PHOTO_ROW_H + CAM + 34;
export const CAMERA_LAYER_H = LAYER_H;

// 3 photo kahan rukengi (beech se x), kitni tedhi
const SLOTS = [
  { x: -PH_W * 1.08, r: -12, y: 10 },
  { x: 0, r: 3, y: 0 },
  { x: PH_W * 1.08, r: 13, y: 10 },
];
// har photo par alag rang ki halki chamak (photo jaisa ehsaas)
const TINTS = [
  ['rgba(255,170,90,0.35)', 'rgba(255,90,140,0.15)'],
  ['rgba(120,190,255,0.35)', 'rgba(170,110,255,0.15)'],
  ['rgba(255,220,90,0.35)', 'rgba(90,220,170,0.15)'],
];

const CameraShot = ({ data, onDone, top }) => {
  const enter = useRef(new Animated.Value(0)).current; // camera aana
  const exit = useRef(new Animated.Value(0)).current; // sab gayab
  const flash = useRef(new Animated.Value(0)).current; // poori screen flash
  const kick = useRef(new Animated.Value(0)).current; // click par camera jhatka
  const shots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current; // har photo 0 -> 1

  useEffect(() => {
    [enter, exit, flash, kick, ...shots].forEach((v) => v.setValue(0));
    const anims = [];
    const run = (a, cb) => { anims.push(a); a.start(cb); };

    run(Animated.spring(enter, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }));

    const timers = [0, 1, 2].map((i) =>
      setTimeout(() => {
        // flash: jhatke se tez, dheere se kam
        run(
          Animated.sequence([
            Animated.timing(flash, { toValue: FLASH_PEAK, duration: 60, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(flash, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ])
        );
        // camera shutter jhatka
        run(
          Animated.sequence([
            Animated.timing(kick, { toValue: 1, duration: 70, useNativeDriver: true }),
            Animated.spring(kick, { toValue: 0, friction: 4, tension: 160, useNativeDriver: true }),
          ])
        );
        // photo nikal kar apni jagah
        run(Animated.spring(shots[i], { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }));
      }, FIRST_CLICK_MS + i * CLICK_GAP_MS)
    );

    const tExit = setTimeout(() => {
      run(
        Animated.timing(exit, { toValue: 1, duration: EXIT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ({ finished }) => finished && onDone && onDone()
      );
    }, EXIT_AT_MS);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(tExit);
      anims.forEach((a) => a.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data && data._k]);

  const fadeOut = exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const camScale = Animated.multiply(
    enter.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    kick.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] })
  );
  const camY = enter.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });
  const camRot = Animated.add(
    enter.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }),
    kick.interpolate({ inputRange: [0, 1], outputRange: [0, -4] })
  ).interpolate({ inputRange: [-30, 30], outputRange: ['-30deg', '30deg'] });
  const camOp = Animated.multiply(enter.interpolate({ inputRange: [0, 0.3], outputRange: [0, 1], extrapolate: 'clamp' }), fadeOut);
  // lens par chamak (click par)
  const glint = kick.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const img = (data && data.senderImg) || FALLBACK_AVATAR;
  const to = data && data.receiverName && data.receiverName !== 'All' ? data.receiverName : null;
  const caption = to ? `${to} ki 3 photo khichi` : '3 photo khichi';
  const L = top != null ? top : height * 0.36;
  const camTopInLayer = PHOTO_ROW_H;
  const cx = width / 2;

  return (
    <>
      {/* ===== POORI SCREEN FLASH ===== */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { opacity: flash }]} />

      <View pointerEvents="none" style={[styles.layer, { top: L }]}>
        {/* ===== 3 PHOTO (polaroid) ===== */}
        {SLOTS.map((s, i) => {
          const v = shots[i];
          // camera ke lens se nikal kar (neeche beech) apni jagah (upar) tak
          const tx = v.interpolate({ inputRange: [0, 1], outputRange: [0, s.x] });
          const ty = v.interpolate({ inputRange: [0, 1], outputRange: [camTopInLayer + CAM * 0.5 - PH_H / 2 - s.y, 0] });
          const sc = v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.15, 0.4, 1] });
          const rot = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${s.r}deg`] });
          const op = Animated.multiply(v.interpolate({ inputRange: [0, 0.08], outputRange: [0, 1], extrapolate: 'clamp' }), fadeOut);
          // photo "develop" hoti hai: pehle safed, phir tasveer dikhti hai
          const develop = v.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 0.85, 0], extrapolate: 'clamp' });
          return (
            <Animated.View
              key={i}
              style={[
                styles.photo,
                {
                  left: cx - PH_W / 2,
                  top: s.y,
                  opacity: op,
                  transform: [{ translateX: tx }, { translateY: ty }, { rotate: rot }, { scale: sc }],
                },
              ]}
            >
              <View style={styles.photoInner}>
                <ExpoImage source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                <LinearGradient colors={TINTS[i]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: develop }]} />
              </View>
              <Text style={styles.photoNum}>{i + 1}/3</Text>
            </Animated.View>
          );
        })}

        {/* ===== CAMERA ===== */}
        <Animated.View
          style={{
            position: 'absolute',
            left: cx - CAM / 2,
            top: camTopInLayer,
            width: CAM,
            height: CAM,
            opacity: camOp,
            transform: [{ translateY: camY }, { rotate: camRot }, { scale: camScale }],
          }}
        >
          <ExpoImage source={CAMERA_IMG} style={{ width: CAM, height: CAM }} contentFit="contain" cachePolicy="memory-disk" transition={0} />
          {/* lens chamak */}
          <Animated.View style={[styles.glint, { left: CAM * 0.5 - 22, top: CAM * 0.52 - 22, opacity: glint }]}>
            <MaterialCommunityIcons name="star-four-points" size={44} color="#fff" />
          </Animated.View>
        </Animated.View>

        {/* ===== NEECHE CHHOTA CAPTION ===== */}
        <Animated.View style={[styles.capWrap, { top: camTopInLayer + CAM + 2, opacity: camOp }]}>
          <View style={styles.cap}>
            <Image source={{ uri: img }} style={styles.capAv} />
            <Text numberOfLines={1} style={styles.capName}>{data && data.senderName}</Text>
            <MaterialCommunityIcons name="camera" size={13} color="#FFE08A" style={{ marginLeft: 5 }} />
            <Text numberOfLines={1} style={styles.capTxt}> {caption}</Text>
          </View>
        </Animated.View>
      </View>
    </>
  );
};

export default memo(CameraShot);

const styles = StyleSheet.create({
  flash: { backgroundColor: '#fff', zIndex: 99999, elevation: 99999 },
  layer: { position: 'absolute', left: 0, right: 0, height: LAYER_H, zIndex: 99997, elevation: 99997 },
  photo: {
    position: 'absolute',
    width: PH_W,
    height: PH_H,
    backgroundColor: '#fff',
    borderRadius: 4,
    padding: 5,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  photoInner: { flex: 1, overflow: 'hidden', backgroundColor: '#222' },
  photoNum: { position: 'absolute', bottom: 2, alignSelf: 'center', fontSize: 10, fontWeight: '800', color: '#444' },
  glint: { position: 'absolute', width: 44, height: 44 },
  capWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  cap: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: width - 40,
    paddingLeft: 3,
    paddingRight: 12,
    paddingVertical: 3,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,224,138,0.7)',
  },
  capAv: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#333' },
  capName: { color: '#fff', fontSize: 12, fontWeight: '800', marginLeft: 5, flexShrink: 1 },
  capTxt: { color: '#FFE08A', fontSize: 12, fontWeight: '700', flexShrink: 1 },
});
