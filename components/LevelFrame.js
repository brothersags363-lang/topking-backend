import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { ADMIN_FRAMES, useFrameInfo } from './adminFrames';

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
// Agency / BD ka frame ab apne aap NAHI lagta (pehle agencyId / isBD hone par sabko mil jata tha).
// Sirf: level se (lv10+), admin ka diya adminFrame, ya admin ka set kiya special (crown / vip1).
const SPECIAL_TIER = { crown: 40, vip1: 50 };

export const getTier = (level = 1) => {
  const lv = Number(level) || 0;
  return lv >= 50 ? 50 : lv >= 45 ? 45 : lv >= 40 ? 40 : lv >= 35 ? 35
    : lv >= 30 ? 30 : lv >= 20 ? 20 : lv >= 10 ? 10 : 0;
};

// user doc se special frame (admin frame / crown / vip1). Kuch nahi to null (level frame chalega).
export const getSpecialKey = (u) => {
  if (!u) return null;
  // Admin ne jo frame diya hai wo sabse upar (level/agency/BD frame ko override karta hai)
  if (u.adminFrame && ADMIN_FRAMES[u.adminFrame]) return u.adminFrame;
  if (u.special && SPECIAL_TIER[u.special]) return u.special;
  return null;
};

// Final tier: level tier aur special tier me se jo bada ho.
export const resolveTier = (level = 1, special) => {
  const levelTier = getTier(level);
  const specialTier = special && SPECIAL_TIER[special] ? SPECIAL_TIER[special] : 0;
  return Math.max(levelTier, specialTier);
};

// ------------------------------------------------------------
// SETTINGS ke liye: frame list + naam (preview ke liye STATIC/ANIM bhi)
// ------------------------------------------------------------
export const FRAME_TIERS = [10, 20, 30, 35, 40, 45, 50];
export const FRAME_TIER_LABEL = {
  10: 'Classic',
  20: 'Agency Gold',
  30: 'VIP',
  35: 'TopKing',
  40: 'Purple Crown',
  45: 'Red Gold Wings',
  50: 'VIP 1',
};
export const FRAME_IMAGES = { STATIC, ANIM };

// Is user ke paas kaun-kaun se level frames hain (sabse bada tier tak, sab chhote bhi)
export const getMaxTier = (info, levelProp) => {
  const lv = Math.max(Number(info && info.level) || 0, Number(levelProp) || 0);
  const sp = getSpecialKey({ ...(info || {}), adminFrame: null });
  return resolveTier(lv, sp);
};
export const getOwnedTiers = (info, levelProp) => {
  const max = getMaxTier(info, levelProp);
  return FRAME_TIERS.filter((t) => t <= max);
};

// Choice string: 'lv30' (level frame)  ya  'adm:gold_heart' (admin ka diya frame)
// Hamesha return: { kind: 'admin', key } | { kind: 'tier', tier } | null (kuch nahi dikhana)
export const computeFrame = (info, levelProp, specialProp) => {
  const inf = info || {};
  if (inf.frameOff) return null;

  const maxTier = getMaxTier(inf, levelProp);
  const choice = inf.frameChoice;

  // User ne apni marzi se kuch chuna hai (aur wo uske paas hai) -> wahi
  if (choice) {
    if (choice.indexOf('adm:') === 0) {
      const k = choice.slice(4);
      if (inf.adminFrame === k && ADMIN_FRAMES[k]) return { kind: 'admin', key: k };
    } else if (/^lv\d+$/.test(choice)) {
      const t = Number(choice.slice(2));
      if (STATIC[t] && t <= maxTier) return { kind: 'tier', tier: t };
    }
    // choice ab valid nahi (frame hat gaya) -> neeche auto
  }

  // AUTO: admin frame sabse upar, nahi to level/agency/BD ka sabse bada tier
  // User ka record load ho chuka ho to wahi sach hai (admin ne frame hata diya to purane chat/seat ka frame bhi hat jaye)
  const adminKey = inf.loaded
    ? inf.adminFrame
    : (inf.adminFrame || (specialProp && ADMIN_FRAMES[specialProp] ? specialProp : null));
  if (adminKey && ADMIN_FRAMES[adminKey]) return { kind: 'admin', key: adminKey };

  // specialProp me purane docs ka 'agency' / 'bd' aa sakta hai - SPECIAL_TIER me wo hai hi nahi, isliye ignore
  const sp = specialProp && !ADMIN_FRAMES[specialProp] && SPECIAL_TIER[specialProp]
    ? specialProp
    : getSpecialKey({ ...inf, adminFrame: null });
  const tier = resolveTier(Math.max(Number(inf.level) || 0, Number(levelProp) || 0), sp);
  return tier ? { kind: 'tier', tier } : null;
};

const LevelFrame = ({ level = 1, size, style, animated = true, special: specialProp, uid }) => {
  // uid diya ho to us user ki frame info (admin frame + level + user ki choice) khud le lo.
  // Isse index / messages / profile / userProfile / live room - sab jagah sirf uid dena kaafi hai.
  const info = useFrameInfo(uid);
  const res = computeFrame(info, level, specialProp);
  if (!res) return null;

  const flat = StyleSheet.flatten(style) || {};
  const S = size || flat.width || 50;
  const box = [style, { width: S, height: flat.height || S }];

  if (res.kind === 'admin') {
    return (
      <View pointerEvents="none" style={box}>
        <ExpoImage
          key={`afr-${res.key}-${animated ? 'a' : 's'}`}
          source={ADMIN_FRAMES[res.key].img}
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
        // key: tier badalne par image naye sire se load ho (purana frame cache me na atke)
        key={`frame-${res.tier}-${animated ? 'a' : 's'}`}
        source={animated ? ANIM[res.tier] : STATIC[res.tier]}
        contentFit="contain"
        autoplay={animated}
        cachePolicy="memory-disk"
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
};

export default memo(LevelFrame);
