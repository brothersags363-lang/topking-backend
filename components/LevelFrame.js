import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { ADMIN_FRAMES, useAdminFrame } from './adminFrames';

// Level frames:
//   assets/frames/lvXX.png            (static fallback)
//   assets/frames_animated/lvXX.webp  (animated, transparent)
// lv10 = purana frame (same), baaki sab naye animated frames:
//   20 Agency, 30 VIP, 35 TopKing, 40 Purple Crown, 45 Red Gold Wings, 50 VIP 1
const STATIC = {
  10: require('../assets/frames/lv10.png'),
  20: require('../assets/frames/lv20.png'),
  30: require('../assets/frames/lv30.png'),
  35: require('../assets/frames/lv35.png'),
  40: require('../assets/frames/lv40.png'),
  45: require('../assets/frames/lv45.png'),
  50: require('../assets/frames/lv50.png'),
};
const ANIM = {
  10: require('../assets/frames_animated/lv10.webp'),
  20: require('../assets/frames_animated/lv20.webp'),
  30: require('../assets/frames_animated/lv30.webp'),
  35: require('../assets/frames_animated/lv35.webp'),
  40: require('../assets/frames_animated/lv40.webp'),
  45: require('../assets/frames_animated/lv45.webp'),
  50: require('../assets/frames_animated/lv50.webp'),
};

// Optional special frames (level se alag).
// FIX: special frame ab level frame ko override nahi karta. Dono me se jo bada
// tier ho wahi dikhta hai. Isse agency/BD wale user ka level 30/40/50 ho to
// uska apna bada frame dikhega, hamesha lv20 nahi.
const SPECIAL_TIER = { agency: 20, bd: 45, crown: 40, vip1: 50 };

export const getTier = (level = 1) => {
  const lv = Number(level) || 0;
  return lv >= 50 ? 50 : lv >= 45 ? 45 : lv >= 40 ? 40 : lv >= 35 ? 35
    : lv >= 30 ? 30 : lv >= 20 ? 20 : lv >= 10 ? 10 : 0;
};

// user doc se special frame: BD > Agency. Kuch nahi to null (level frame chalega).
export const getSpecialKey = (u) => {
  if (!u) return null;
  // Admin ne jo frame diya hai wo sabse upar (level/agency/BD frame ko override karta hai)
  if (u.adminFrame && ADMIN_FRAMES[u.adminFrame]) return u.adminFrame;
  if (u.special && SPECIAL_TIER[u.special]) return u.special;
  if (u.isBD === true) return 'bd';
  if (u.agencyId) return 'agency';
  return null;
};

// Final tier: level tier aur special tier me se jo bada ho.
export const resolveTier = (level = 1, special) => {
  const levelTier = getTier(level);
  const specialTier = special && SPECIAL_TIER[special] ? SPECIAL_TIER[special] : 0;
  return Math.max(levelTier, specialTier);
};

const LevelFrame = ({ level = 1, size, style, animated = true, special: specialProp, uid }) => {
  // uid diya ho to us user ka admin frame khud dhoondh lo (live room/chat/profile card sab jagah)
  const adminKey = useAdminFrame(uid);
  const special = adminKey || specialProp;
  // Admin frame: level ki parwah kiye bina seedha ye frame dikhao
  if (special && ADMIN_FRAMES[special]) {
    const flatA = StyleSheet.flatten(style) || {};
    const SA = size || flatA.width || 50;
    return (
      <View pointerEvents="none" style={[style, { width: SA, height: flatA.height || SA }]}>
        <ExpoImage
          key={`afr-${special}-${animated ? 'a' : 's'}`}
          source={ADMIN_FRAMES[special].img}
          contentFit="contain"
          autoplay={animated}
          cachePolicy="memory-disk"
          style={{ width: '100%', height: '100%' }}
        />
      </View>
    );
  }
  const tier = resolveTier(level, special);
  if (!tier) return null;
  const flat = StyleSheet.flatten(style) || {};
  const S = size || flat.width || 50;
  return (
    <View pointerEvents="none" style={[style, { width: S, height: flat.height || S }]}>
      <ExpoImage
        // key: tier badalne par image naye sire se load ho (purana frame cache me na atke)
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
