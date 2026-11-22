import { memo, useRef, useEffect } from 'react';
import { Text, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCount } from './feedShared';
import { styles } from './feedStyles';

// ======================================================
// SMOOTH LIKE: heart bounce + double-tap heart pop animation
// (native driver -> JS thread block hone par bhi smooth)
// ======================================================
export const LikeButton = memo(function LikeButton({ liked, count, videoId, onLike }) {
  const scale = useRef(new Animated.Value(1)).current;
  const prevLiked = useRef(liked);

  useEffect(() => {
    if (liked !== prevLiked.current) {
      scale.stopAnimation();
      scale.setValue(liked ? 0.6 : 0.85);
      Animated.spring(scale, {
        toValue: 1,
        friction: liked ? 3 : 5,
        tension: liked ? 180 : 200,
        useNativeDriver: true,
      }).start();
      prevLiked.current = liked;
    }
  }, [liked, scale]);

  return (
    <TouchableOpacity
      style={styles.iconBox}
      activeOpacity={0.8}
      onPress={() => onLike(videoId)}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name="heart"
          size={44}
          color={liked ? "#ff2d55" : "#ffffff"}
          style={styles.iconShadow}
        />
      </Animated.View>
      <Text style={styles.iconText}>{formatCount(count)}</Text>
    </TouchableOpacity>
  );
});

export const HeartPopup = memo(function HeartPopup() {
  const scale = useRef(new Animated.Value(0.3)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1.2,
        friction: 4,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.delay(480),
        Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]),
    ]).start();
  }, [scale, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.heartPopup, { opacity, transform: [{ scale }] }]}
    >
      <Ionicons name="heart" size={140} color="#ff004f" />
    </Animated.View>
  );
});

