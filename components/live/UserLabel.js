// components/live/UserLabel.js
// Naam ke aage badge (Tiki jaisa) - live room ke lists, join banners, chat sab yahi use karte hain.
//   [SVIP badge (Lv 50+) ya Level badge (Lv 1+)]  naam  ✓
//   Level na ho -> sirf: naam ✓
// NOTE: is file me useJoinDelay / JoinEntry import MAT karna (circular import se crash hota hai).
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import LevelBadge from '../LevelBadge';
import { SvipBadge } from '../SvipBadge';
import UserTick from '../UserTick';
import { svipForLevel } from '../../utils/svip';

const isTrue = (v) => v === true || v === 'true';
const lvOf = (level) => Math.max(0, Math.floor(Number(level) || 0));

// ---------- sirf badge: SVIP (50+) / Level (1+) / kuch nahi ----------
export const LevelPrefix = memo(function LevelPrefix({ level, size = 8, svipHeight, style }) {
  const lv = lvOf(level);
  const n = svipForLevel(lv);
  if (n) return <SvipBadge n={n} height={svipHeight || Math.round(size * 2.2)} style={style} />;
  if (lv >= 1) return <LevelBadge level={lv} size={size} style={style} />;
  return null;
});

// ---------- naam ki line: [badge] naam ✓ (list / banner / popup) ----------
export const UserLabel = memo(function UserLabel({
  level, name, uid, verified, verifiedColor, nameStyle, size = 9, tickSize = 15, svipHeight, style, numberOfLines = 1,
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }, style]}>
      <LevelPrefix level={level} size={size} svipHeight={svipHeight} style={{ marginRight: 5 }} />
      <Text numberOfLines={numberOfLines} style={[ul.labelName, nameStyle, { flexShrink: 1 }]}>
        {name || 'User'}
      </Text>
      <UserTick uid={uid} verified={isTrue(verified)} verifiedColor={verifiedColor} size={tickSize} />
    </View>
  );
});

const ul = StyleSheet.create({
  labelName: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
