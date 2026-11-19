// components/LevelBadge.js
// Poore app me ek hi level badge (gem + number), "My Privileges" page jaisa.
// Har level (10/20/30/40/50/60) ka gem aur pill ka rang alag hai.
//
//   <LevelBadge level={12} />                       -> sirf dikhata hai (chat / live / list)
//   <LevelBadge level={12} tappable />              -> dabane par /levelPrivileges page khulta hai
//   <LevelBadge level={12} size={9} style={{ marginLeft: 5 }} />
//   <LevelGem level={13} size={90} />               -> bada gem (page ke card ke liye)
//
// size = gem ka size (8..14). Baaki sab (height, font) isse apne aap nikalte hain.
import React, { memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from '../utils/safeRouter';
import { levelThemeFor } from '../utils/levelTheme';

const sq = (side, color, deg, extra) => ({
  position: 'absolute',
  width: side,
  height: side,
  backgroundColor: color,
  borderRadius: Math.max(1, side * 0.14),
  transform: [{ rotate: `${deg}deg` }],
  ...(extra || {}),
});

// Gem: sirf Views se bana (SVG ki zarurat nahi)
export const Gem = memo(function Gem({ theme, size }) {
  const box = { width: size, height: size, alignItems: 'center', justifyContent: 'center' };

  if (theme.shape === 'cube') {
    return (
      <View style={box}>
        <MaterialCommunityIcons name="cube" size={size} color={theme.gem} />
      </View>
    );
  }
  if (theme.shape === 'box') {
    return (
      <View style={box}>
        <MaterialCommunityIcons name="package-variant" size={size} color={theme.gem} />
      </View>
    );
  }
  if (theme.shape === 'crystal') {
    const a = size * 0.62;
    return (
      <View style={box}>
        <View style={sq(a, theme.gem, 0)} />
        <View style={sq(a, theme.gem, 45)} />
        <View style={sq(a * 0.62, theme.gem2, 22.5, { borderRadius: a * 0.2 })} />
        <View style={sq(a * 0.22, 'rgba(255,255,255,0.75)', 45, { top: size * 0.2, left: size * 0.34 })} />
      </View>
    );
  }
  // diamond
  const d = size * 0.66;
  return (
    <View style={box}>
      <View style={sq(d, theme.gem, 45)} />
      <View style={sq(d * 0.5, theme.gem2, 45, { top: size * 0.2 })} />
    </View>
  );
});

export const LevelGem = memo(function LevelGem({ level = 1, size = 90 }) {
  return <Gem theme={levelThemeFor(level)} size={size} />;
});

const Pill = ({ level, size, style, theme }) => {
  const lv = Math.max(1, Number(level) || 1);
  const h = Math.round(size * 2.2);
  const gemBox = Math.round(h * 0.82);
  return (
    <LinearGradient
      colors={[theme.c1, theme.c2]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          height: h,
          borderRadius: h / 2,
          paddingLeft: 3,
          paddingRight: Math.round(size * 0.9),
          borderWidth: 1,
          borderColor: theme.edge,
        },
        style,
      ]}
    >
      <Gem theme={theme} size={gemBox} />
      <Text
        style={{
          color: '#fff',
          fontSize: size + 3,
          fontWeight: '900',
          fontStyle: 'italic',
          marginLeft: Math.round(size * 0.4),
          includeFontPadding: false,
        }}
      >
        {lv}
      </Text>
    </LinearGradient>
  );
};

const LevelBadge = memo(function LevelBadge({ level = 1, size = 10, style, tappable = false }) {
  const router = useRouter();
  const theme = levelThemeFor(level);

  if (!tappable) return <Pill level={level} size={size} style={style} theme={theme} />;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={() => router.push('/levelPrivileges')}
    >
      <Pill level={level} size={size} style={style} theme={theme} />
    </TouchableOpacity>
  );
});

export default LevelBadge;
