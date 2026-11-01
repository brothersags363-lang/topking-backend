import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import LevelFrame from './LevelFrame';

// ============================================================
// FramedAvatar - avatar + uske upar user ka frame (apne aap).
//
// Kahin bhi avatar dikhana ho to bas ye lagao:
//   <FramedAvatar uid={user.uid} uri={user.profileImg} size={48} />
//
// - uid se user ka frame (admin frame / level / agency / BD) aur
//   user ki Settings wali choice (frame hatana / doosra frame chunna) apne aap aa jati hai.
// - Frame avatar ke BAHAR ki taraf failta hai, isliye layout nahi badalta.
// - Lists me animated=false rakho (smooth scroll), profile/popup me animated.
// ============================================================

const FRAME_RATIO = 1.35; // frame ka size = avatar size * FRAME_RATIO

// Sirf frame overlay chahiye (avatar pehle se bana hai) to ye use karo.
// Parent View avatar ke size ka ho (position: 'relative' by default).
export const AvatarFrame = memo(({ uid, level, special, size = 48, animated = false, ratio = FRAME_RATIO }) => {
  if (!uid && !(Number(level) >= 10) && !special) return null;
  const outer = Math.round(size * ratio);
  const off = -(outer - size) / 2;
  return (
    <View pointerEvents="none" style={[styles.frameWrap, { width: outer, height: outer, top: off, left: off }]}>
      <LevelFrame
        uid={uid}
        level={level}
        special={special}
        animated={animated}
        style={{ width: outer, height: outer }}
      />
    </View>
  );
});

const FramedAvatar = ({
  uid,
  uri,
  fallback,
  size = 48,
  level,
  special,
  animated = false,
  style,
  imageStyle,
  ratio,
  children,
}) => {
  return (
    <View style={[{ width: size, height: size, overflow: 'visible' }, style]}>
      <ExpoImage
        source={uri ? { uri } : fallback}
        style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#222' }, imageStyle]}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
      />
      <AvatarFrame uid={uid} level={level} special={special} size={size} animated={animated} ratio={ratio} />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  frameWrap: { position: 'absolute', zIndex: 5, alignItems: 'center', justifyContent: 'center' },
});

export default memo(FramedAvatar);
