import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useFrameInfo, useAdminFrame, ADMIN_FRAMES } from './adminFrames';

// ============================================================
// LEVEL FRAME - poore app me EK hi rule (sirf level se):
//   Level 30 - 39  -> lv30 frame (Gold Dragon)
//   Level 40 - 49  -> lv40 frame (Purple Crown)
//   Level 50+      -> lv50 frame (SVIP 1 - 5)
//   Level 30 se kam -> koi frame nahi
// Admin ka diya frame (adminFrame) in sab se upar hai: jis user ko admin ne frame diya,
// uska wo frame har jagah dikhta hai (level kuch bhi ho). Baaki level 10/20/35/45 frames nahi hain.
// ============================================================

const STATIC = {
  30: require('../assets/frames/lv30.webp'),
  40: require('../assets/frames/lv40.webp'),
  50: require('../assets/frames/lv50.webp'),
};
const ANIM = {
  30: require('../assets/frames_animated/lv30.webp'),
  40: require('../assets/frames_animated/lv40.webp'),
  50: require('../assets/frames_animated/lv50.webp'),
};

export const MIN_FRAME_LEVEL = 30;
export const FRAME_TIERS = [30, 40, 50];
export const FRAME_TIER_LABEL = { 30: 'Gold Dragon', 40: 'Purple Crown', 50: 'SVIP' };
export const FRAME_IMAGES = { STATIC, ANIM };

// level -> tier (30 / 40 / 50) ya 0 (frame nahi)
export const getTier = (level = 0) => {
  const lv = Number(level) || 0;
  return lv >= 50 ? 50 : lv >= 40 ? 40 : lv >= 30 ? 30 : 0;
};

// uid do -> admin ka diya frame apne aap (server ki chhoti map se, koi extra Firestore read nahi).
// special: chat/seat data me aaya admin frame key (map aane tak ka fallback) - optional.
// lookup (default true): level prop 30 se kam ho aur uid diya ho to user ka asli level
// (cached, ek hi baar read) dekh leta hai - feed / list jaisi jagah jahan level stale ho sakta hai.
// Live room jaisi tez screens me lookup={false} do: level se turant frame, koi Firestore read nahi
// (admin frame phir bhi dikhega, kyunki wo map se aata hai).
const LevelFrame = ({ level = 0, size, style, animated = true, uid, special, lookup = true }) => {
  const lv = Number(level) || 0;
  const adminKey = useAdminFrame(uid, special);
  const info = useFrameInfo(lookup && !adminKey && lv < MIN_FRAME_LEVEL ? uid : undefined);
  const tier = getTier(Math.max(lv, Number(info.level) || 0));
  if (!adminKey && !tier) return null;

  const flat = StyleSheet.flatten(style) || {};
  const S = size || flat.width || 50;
  const box = [style, { width: S, height: flat.height || S }];

  if (adminKey) {
    return (
      <View pointerEvents="none" style={box}>
        <ExpoImage
          key={`afr-${adminKey}-${animated ? 'a' : 's'}`}
          source={ADMIN_FRAMES[adminKey].img}
          contentFit="contain"
          autoplay={animated}
          cachePolicy="memory-disk"
          style={{ width: '100%', height: '100%' }}
        />
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={box}>
      <ExpoImage
        // key: tier badalne par image naye sire se load ho
        key={`frame-${tier}-${animated ? 'a' : 's'}`}
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
