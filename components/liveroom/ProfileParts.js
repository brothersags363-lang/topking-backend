import React, { memo, useEffect, useState } from 'react';
import { InteractionManager, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { GuardedFrame } from './SharedUI';
import { FRAME_SCALE, STABLE_AVATAR } from './constants';

// ============================================================
// ProfileFrame: animated level frame for profile popups.
//  - level >= 30 : <GuardedFrame> (lv30 / lv40 / lv50 art)
//  - level 1..9  : smooth pulsing + glowing ring, a different colour per
//                  level, so EVERY user has a frame in their profile.
// All animation runs on the native driver, so it stays smooth even in a
// busy live room. pointerEvents="none" so taps still reach the avatar.
// ============================================================
export const LOW_LEVEL_RING_COLORS = [
  "#9AA0A6", // lv1
  "#4CAF50", // lv2
  "#26C6DA", // lv3
  "#42A5F5", // lv4
  "#7E57C2", // lv5
  "#AB47BC", // lv6
  "#EC407A", // lv7
  "#FF7043", // lv8
  "#FFB300", // lv9
];

export const ProfileFrame = memo(({ level = 1, avatarSize = 100, frameSize, uid, containerSize, animated = true }) => {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const outer = frameSize || Math.round(avatarSize * FRAME_SCALE);
  const offset = ((containerSize || avatarSize) - outer) / 2;

  const wrapStyle = {
    position: "absolute",
    width: outer,
    height: outer,
    top: offset,
    left: offset,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  };

  if (lv >= 30 || uid) {
    return (
      <View pointerEvents="none" style={wrapStyle}>
        <GuardedFrame
          key={`lf-${lv}`}
          level={lv}
          uid={uid}
          animated={animated}
          style={{ width: outer, height: outer, resizeMode: "contain" }}
        />
      </View>
    );
  }

  // FIX: frame sirf unhi ko dikhe jinhe mila hai (level >= 30).
  // Pehle low-level (1-9) sab users ko pulsing ring dikhta tha -> ab kuch nahi dikhega.
  return null;
});


// ProfileAvatar: popup ki photo + frame EK saath. Wrapper fixed size, photo aur frame
// dono flex se THEEK BEECH -> upar/niche khisakta nahi. Frame animation popup slide
// khatam hone ke baad chalu hota hai -> popup smooth khulta hai.
export const ProfileAvatar = memo(({ uri, uid, level, size = 100, style }) => {
  const outer = Math.round(size * FRAME_SCALE);
  const reserve = Math.round((outer - size) / 4);   // frame ka aadha extra hissa layout me, baaki transparent bahar
  const box = size + reserve * 2;
  const [animReady, setAnimReady] = useState(false);
  useEffect(() => {
    const h = InteractionManager.runAfterInteractions(() => setAnimReady(true));
    return () => h.cancel();
  }, []);
  return (
    <View style={[{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }, style]}>
      <ExpoImage cachePolicy="memory-disk" transition={0}
        source={{ uri: uri || STABLE_AVATAR }}

        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
      <ProfileFrame uid={uid} level={level} avatarSize={size} frameSize={outer} containerSize={box} animated={animReady} />
    </View>
  );
});
