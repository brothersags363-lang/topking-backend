import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useFrameInfo, useFrameSpec, ADMIN_FRAMES } from './adminFrames';

// ============================================================
// LEVEL FRAME - poore app me EK hi rule:
//   1) User ne frame band kiya ('off')            -> koi frame nahi
//   2) User ne apna frame chuna (lv30/lv40/lv50 ya admin ka diya) -> wahi
//   3) Kuch chuna nahi (AUTO): admin ne frame diya ho to wo, warna level se:
//        Level 30 - 39 -> lv30 (Gold Dragon), 40 - 49 -> lv40 (Purple Crown), 50+ -> lv50 (SVIP)
//        Level 30 se kam -> koi frame nahi
// Admin ka diya frame user ke "Mere Frames" me bhi aata hai, wahan se wo badal sakta hai.
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

// uid do -> frame apne aap (server ki chhoti map se, koi extra Firestore read nahi).
// special: chat/seat data me aaya admin frame key (map aane tak ka fallback) - optional.
// lookup (default true): AUTO me level prop 30 se kam ho aur uid diya ho to user ka asli level
// (cached, ek hi baar read) dekh leta hai - feed / list jaisi jagah jahan level stale ho sakta hai.
// Live room jaisi tez screens me lookup={false} do: level se turant frame, koi Firestore read nahi
// (user ki choice / admin frame phir bhi dikhega, kyunki wo map se aata hai).
// animated=false (lists): halka static frame, animated=true (profile/popup): chalta hua frame.
const LevelFrame = ({ level = 0, size, style, animated = true, uid, special, lookup = true }) => {
  const lv = Number(level) || 0;
  const spec = useFrameSpec(uid, special);
  const info = useFrameInfo(lookup && !spec && lv < MIN_FRAME_LEVEL ? uid : undefined);

  if (spec === 'off') return null;
  const adminKey = spec && ADMIN_FRAMES[spec] ? spec : null;
  const chosenTier = spec && /^lv(30|40|50)$/.test(spec) ? Number(spec.slice(2)) : 0;
  const tier = adminKey ? 0 : chosenTier || getTier(Math.max(lv, Number(info.level) || 0));
  if (!adminKey && !tier) return null;

  const flat = StyleSheet.flatten(style) || {};
  const S = size || flat.width || 50;
  const box = [style, { width: S, height: flat.height || S }];

  if (adminKey) {
    const def = ADMIN_FRAMES[adminKey];
    return (
      <View pointerEvents="none" style={box}>
        <ExpoImage
          key={`afr-${adminKey}-${animated ? 'a' : 's'}`}
          source={animated ? def.img : def.still || def.img}
          contentFit="contain"
          autoplay={animated}
          cachePolicy="memory-disk"
          transition={0}
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
        transition={0}
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
};

export default memo(LevelFrame);
