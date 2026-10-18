import React, { memo, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';

// ============================================================
// SeatEmoji: seat ke avatar ke upar 3 second ke liye emoji reaction.
// Emoji ke hisaab se alag animation:
//   hasne wala  -> hilta/uchhalta hai (laugh)
//   sorry/rona  -> dheere jhoomta + neeche jhukta hai (sad)
//   pyaar       -> dil ki tarah dhak-dhak (love)
//   gussa       -> side-to-side kaanpta hai (angry)
//   baaki       -> halka bounce
// Sab kuch native driver par chalta hai -> room lag nahi karta.
//
// USE (SeatItem ke avatar wale View ke andar, jo position:'relative' ho):
//   <SeatEmoji reaction={seat.reaction} />
// `reaction` = { e: '😂', k: uniqueKey }  (LiveRoom seat object me bhejta hai)
// ============================================================

const LAUGH = ['😂', '🤣', '😆', '😄', '😁', '😹', '😀', '😃'];
const SAD = ['😢', '😭', '🥺', '😔', '😞', '🙏', '😥', '😿', '😪', '🥹'];
const LOVE = ['😍', '🥰', '❤️', '😘', '💖', '💕', '😻', '💗', '😚'];
const ANGRY = ['😡', '😠', '🤬', '👿'];

const kindOf = (e) => {
  if (LAUGH.includes(e)) return 'laugh';
  if (SAD.includes(e)) return 'sad';
  if (LOVE.includes(e)) return 'love';
  if (ANGRY.includes(e)) return 'angry';
  return 'default';
};

const SHOW_MS = 3000;

const SeatEmoji = memo(({ reaction, size = 40 }) => {
  const pop = useRef(new Animated.Value(0)).current;    // pop-in / fade-out
  const loop = useRef(new Animated.Value(0)).current;   // emoji-type animation (0..1 repeat)
  const key = reaction?.k;
  const e = reaction?.e;

  useEffect(() => {
    if (!key) return;
    const kind = kindOf(e);
    pop.setValue(0);
    loop.setValue(0);

    const periodByKind = { laugh: 260, sad: 900, love: 520, angry: 120, default: 700 };
    const loopAnim = Animated.loop(
      Animated.timing(loop, {
        toValue: 1,
        duration: periodByKind[kind],
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const main = Animated.sequence([
      Animated.spring(pop, { toValue: 1, speed: 18, bounciness: 12, useNativeDriver: true }),
      Animated.delay(SHOW_MS - 420 - 250),
      Animated.timing(pop, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]);

    loopAnim.start();
    main.start();
    return () => {
      loopAnim.stop();
      main.stop();
    };
  }, [key, e, pop, loop]);

  if (!key) return null;

  const kind = kindOf(e);

  const scaleIn = pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  let transform;

  if (kind === 'laugh') {
    // hasna: tez left-right tilt + upar-neeche uchhal
    const rotate = loop.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: ['0deg', '-14deg', '0deg', '14deg', '0deg'] });
    const ty = loop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -5, 0] });
    transform = [{ scale: scaleIn }, { translateY: ty }, { rotate }];
  } else if (kind === 'sad') {
    // sorry/rona: dheere jhoomna + halka neeche jhukna
    const rotate = loop.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-7deg', '7deg', '-7deg'] });
    const ty = loop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 4, 0] });
    transform = [{ scale: scaleIn }, { translateY: ty }, { rotate }];
  } else if (kind === 'love') {
    // dhak-dhak
    const s = loop.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: [1, 1.22, 1, 1] });
    transform = [{ scale: Animated.multiply(scaleIn, s) }];
  } else if (kind === 'angry') {
    const tx = loop.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -4, 0, 4, 0] });
    transform = [{ scale: scaleIn }, { translateX: tx }];
  } else {
    const ty = loop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -4, 0] });
    transform = [{ scale: scaleIn }, { translateY: ty }];
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { opacity: pop, transform }]}
    >
      <Text style={{ fontSize: size, lineHeight: size + 6 }}>{e}</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    elevation: 30,
  },
});

export default SeatEmoji;
