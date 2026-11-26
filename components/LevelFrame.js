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
// ANIMATED FRAMES HATA DIYE: ab har jagah sirf halka static WEBP (smooth scroll, kam RAM, koi flicker nahi).
// ANIM purane callers ke liye STATIC ka hi naam hai.
const ANIM = STATIC;

const FIT_AVATAR_RATIO = 1.33; // sirf fallback: jab photo size pata na ho tab frame box / avatar size

// Angel pendant ko DP ke bilkul barabar fit karne ke liye asli DP (photo) size chahiye.
// Har jagah frame box alag ratio ka hota hai (seat 1.7x, chat 1.7x, profile 1.3x ...), isliye
// 1.33 maan lena galat tha -> seat par angel DP se bahut bada dikhta tha.
// Style object wali jagah (seat / chat / list) framePhoto(style, photoSize) se size yaad rakhte hain,
// baaki jagah <LevelFrame photo={84} .../> prop se do.
const PHOTO_OF = new WeakMap();
export const framePhoto = (style, photo) => {
  if (style && typeof style === 'object') PHOTO_OF.set(style, photo);
  return style;
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
// animated prop ab ignore hota hai: har jagah static WEBP frame.
const LevelFrame = ({ level = 0, size, style, animated = false, uid, special, lookup = true, photo }) => {
  const propLv = Number(level) || 0;
  const spec = useFrameSpec(uid, special);
  // FIX: user ka ASLI level wallets/{uid}.level me hai (users doc ka level kabhi update nahi hota tha,
  // isliye 33 level wale ka frame gayab / lock, aur 30 wale ko purane level ka 50 frame dikhta tha).
  // uid ho to hamesha asli level lao (cached, 1 read / 5 min). lookup={false} wali jagah (live room)
  // prop level turant use hota hai, asli level aate hi theek ho jata hai.
  const info = useFrameInfo(uid && (lookup || propLv < MIN_FRAME_LEVEL || !!spec) ? uid : undefined);
  void animated; // animated frames band - prop sirf purane callers ke liye

  if (spec === 'off') return null;
  const realLv = info.loaded && info.level != null ? Number(info.level) || 0 : null;
  // asli level pata ho to wahi sach; warna prop level (live room me wallet se aata hai)
  const lv = realLv != null ? realLv : propLv;
  const levelTier = getTier(lv);

  const adminKey = spec && ADMIN_FRAMES[spec] ? spec : null;
  let chosenTier = spec && /^lv(30|40|50)$/.test(spec) ? Number(spec.slice(2)) : 0;
  // user ne jo level frame chuna tha wo uske ASLI level se bada nahi ho sakta (level gira to frame bhi)
  if (chosenTier && realLv != null && chosenTier > levelTier) chosenTier = levelTier;
  const tier = adminKey ? 0 : chosenTier || levelTier;
  if (!adminKey && !tier) return null;

  const flat = StyleSheet.flatten(style) || {};
  const S = size || flat.width || 50;
  const box = [style, { width: S, height: flat.height || S }];

  if (adminKey) {
    const def = ADMIN_FRAMES[adminKey];
    const src = def.still || def.img;
    // FIT: pendant ka hole image ke center me nahi hota -> hole ko photo ke bilkul beech me laao.
    // Photo = box / FIT_AVATAR_RATIO maana gaya (FramedAvatar 1.35, profile 1.3). Hole thoda chhota => ring photo ke kinare par baithti hai.
    if (def.fit) {
      const P = Number(photo) || (style && typeof style === 'object' && PHOTO_OF.get(style)) || S / FIT_AVATAR_RATIO;
      const side = (P / def.fit.d) * 1.03;
      return (
        <View pointerEvents="none" style={box}>
          <ExpoImage
            key={`afr-${adminKey}`}
            source={src}
            contentFit="fill"
            autoplay={false}
            cachePolicy="memory-disk"
            transition={0}
            style={{ position: 'absolute', width: side, height: side, left: S / 2 - def.fit.cx * side, top: S / 2 - def.fit.cy * side }}
          />
        </View>
      );
    }
    return (
      <View pointerEvents="none" style={box}>
        <ExpoImage
          key={`afr-${adminKey}`}
          source={src}
          contentFit="contain"
          autoplay={false}
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
        // key: tier badalne par image naye sire se load ho (purana frame atka na rahe)
        key={`frame-${tier}`}
        source={STATIC[tier]}
        contentFit="contain"
        autoplay={false}
        cachePolicy="memory-disk"
        transition={0}
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
};

export default memo(LevelFrame);
