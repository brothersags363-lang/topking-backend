// components/SvipBadge.js
// SVIP ka chhota chip ("SVIP1" crest) aur SVIP pendant (frame) - privileges page + SVIP page dono me same.
//   <SvipBadge n={2} height={22} />
//   <SvipPendant n={2} size={56} uri={dp} />   (uri na do to khaali frame, screenshot jaisa)
//   <SvipTag level={lv} />                     (naam ke aage; Lv 50 se kam par kuch nahi)
import React, { memo } from 'react';
import { View, Text } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FRAME_IMAGES, FramePreview } from './LevelFrame';
import { svipOf, svipForLevel } from '../utils/svip';

// crest image ka aspect (width / height) - assets/svip/*_badge.webp
const BADGE_RATIO = 3.15;

export const SvipBadge = memo(function SvipBadge({ n = 1, height = 22, style }) {
  const t = svipOf(n);
  if (t.badge) {
    return (
      <ExpoImage
        source={t.badge}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={0}
        style={[{ height, width: Math.round(height * BADGE_RATIO) }, style]}
      />
    );
  }
  // art nahi hai (SVIP 5) -> code se bana chip
  return (
    <LinearGradient
      colors={t.chip}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[
        {
          flexDirection: 'row', alignItems: 'center', height, borderRadius: height / 2.4,
          paddingHorizontal: height * 0.35, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)',
        },
        style,
      ]}
    >
      <MaterialCommunityIcons name="shield-crown" size={height * 0.7} color="#FFF4D6" />
      <Text style={{ color: '#fff', fontSize: height * 0.55, fontWeight: '900', fontStyle: 'italic', marginLeft: 2 }}>
        Svip{t.n}
      </Text>
    </LinearGradient>
  );
});

export const SvipPendant = memo(function SvipPendant({ n = 1, size = 56, uri }) {
  const t = svipOf(n);
  const src = t.frame ? FRAME_IMAGES.STATIC[t.frame] : null;
  if (src) return <FramePreview uri={uri} source={src} size={size} />;
  // art nahi -> gradient ring
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <LinearGradient
        colors={t.chip}
        style={{ width: size * 0.74, height: size * 0.74, borderRadius: size, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{ width: size * 0.6, height: size * 0.6, borderRadius: size, backgroundColor: '#1C1B23', overflow: 'hidden' }}>
          {uri ? <ExpoImage source={{ uri }} contentFit="cover" style={{ width: '100%', height: '100%' }} /> : null}
        </View>
      </LinearGradient>
    </View>
  );
});

// Naam ke aage lagne wala SVIP tag (live room: join, chat, listeners / viewers list).
// Level 50 se kam -> kuch nahi. 50-59 SVIP1, 60-64 SVIP2, 65 SVIP3.
//   <SvipTag level={chat.level} />
export const SvipTag = memo(function SvipTag({ level, height = 16, style }) {
  const n = svipForLevel(level);
  if (!n) return null;
  return <SvipBadge n={n} height={height} style={[{ marginLeft: 4 }, style]} />;
});

export default SvipBadge;
