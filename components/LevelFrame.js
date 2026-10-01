import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

// Files:  assets/frames/lvXX.png           (static, used in chat lists)
//         assets/frames_animated/lvXX.webp (pre-rendered animated, alpha)
const STATIC = {
  10: require('../assets/frames/lv10.png'),
  20: require('../assets/frames/lv20.png'),
  30: require('../assets/frames/lv30.png'),
  40: require('../assets/frames/lv40.png'),
  50: require('../assets/frames/lv50.png'),
};
const ANIM = {
  10: require('../assets/frames_animated/lv10.webp'),
  20: require('../assets/frames_animated/lv20.webp'),
  30: require('../assets/frames_animated/lv30.webp'),
  40: require('../assets/frames_animated/lv40.webp'),
  50: require('../assets/frames_animated/lv50.webp'),
};

export const getTier = (level = 1) =>
  level >= 50 ? 50 : level >= 40 ? 40 : level >= 30 ? 30 : level >= 20 ? 20 : level >= 10 ? 10 : 0;

const LevelFrame = ({ level = 1, size, style, animated = true }) => {
  const tier = getTier(level);
  if (!tier) return null;
  const flat = StyleSheet.flatten(style) || {};
  const S = size || flat.width || 50;
  return (
    <View pointerEvents="none" style={[style, { width: S, height: flat.height || S }]}>
      <ExpoImage
        source={animated ? ANIM[tier] : STATIC[tier]}
        contentFit="contain"
        autoplay={animated}
        cachePolicy="memory-disk"
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
};

export default memo(LevelFrame);
