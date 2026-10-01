import React, { forwardRef, useImperativeHandle, useRef, memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';

const COLORS = ['#FF4D8D', '#FF6B6B', '#F5C451', '#8B5CF6', '#FF8AD8', '#4DD0FF'];
const POOL = 12; // sirf 12 hearts hamesha mount rehte hain, koi naya view nahi banta

const Heart = memo(forwardRef(({ color }, ref) => {
  const p = useSharedValue(0);
  const x = useSharedValue(0);
  const amp = useSharedValue(18);

  useImperativeHandle(ref, () => ({
    fire() {
      x.value = (Math.random() - 0.5) * 50;
      amp.value = 10 + Math.random() * 22;
      p.value = 0;
      p.value = withTiming(1, { duration: 1900 + Math.random() * 700, easing: Easing.out(Easing.quad) });
    },
  }));

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.08, 0.75, 1], [0, 1, 0.9, 0]),
    transform: [
      { translateX: x.value + Math.sin(p.value * 9) * amp.value },
      { translateY: -p.value * 280 },
      { scale: interpolate(p.value, [0, 0.15, 1], [0.4, 1.15, 0.85]) },
    ],
  }));

  return (
    <Animated.View style={[styles.heart, style]}>
      <Ionicons name="heart" size={30} color={color} />
    </Animated.View>
  );
}));

const FloatingHearts = forwardRef((_, ref) => {
  const refs = useRef([]);
  const next = useRef(0);

  useImperativeHandle(ref, () => ({
    burst(n = 1) {
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          const h = refs.current[next.current % POOL];
          next.current += 1;
          h && h.fire();
        }, i * 110);
      }
    },
  }));

  return (
    <View pointerEvents="none" style={styles.wrap}>
      {Array.from({ length: POOL }).map((_, i) => (
        <Heart key={i} ref={(r) => (refs.current[i] = r)} color={COLORS[i % COLORS.length]} />
      ))}
    </View>
  );
});

export default memo(FloatingHearts);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 58, bottom: 92, width: 60, height: 40, zIndex: 9000 },
  heart: { position: 'absolute', bottom: 0, right: 10 },
});
