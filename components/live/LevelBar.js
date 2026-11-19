// components/live/LevelBar.js
// Gifting popup ke upar wala level bar:
//   [ ▲ 5 ]  ━━━━━━────────  Upgrade >
//            +200 stars to upgrade Lv.6
//
// Props:
//   totalSpent   : wallets/{uid}.totalSpent
//   walletLevel  : wallets/{uid}.level (optional, admin manualLevel ke liye)
//   pendingStore : (optional) { v, subs } - jo stars abhi kharch ho rahe hain (gift spam)
//                  taaki bar balance ki tarah turant aage badhe
//   onUpgrade    : "Upgrade >" dabane par
//   entryDelay   : popup khulne ke baad bar kitni der baad bharna shuru kare (ms)
//   style        : container style override

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getLevelProgress } from '../../utils/levelProgress';

const YELLOW = '#F2D32B';
const GREY = '#8D8D92';

const withCommas = (n) => String(Math.max(0, Math.round(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const LevelBar = memo(function LevelBar({
  totalSpent = 0, walletLevel, pendingStore, onUpgrade, entryDelay = 250, style,
}) {
  const [pending, setPending] = useState(pendingStore ? pendingStore.v : 0);

  useEffect(() => {
    if (!pendingStore) return undefined;
    setPending(pendingStore.v);
    pendingStore.subs.add(setPending);
    return () => { pendingStore.subs.delete(setPending); };
  }, [pendingStore]);

  const info = useMemo(
    () => getLevelProgress((Number(totalSpent) || 0) + (Number(pending) || 0), walletLevel),
    [totalSpent, pending, walletLevel]
  );

  // Bar 0 se shuru hoke smooth bharta hai (popup khulte hi "fill-in" effect)
  const fill = useRef(new Animated.Value(0)).current;
  const prevLevel = useRef(info.level);
  const firstRun = useRef(true);

  useEffect(() => {
    const first = firstRun.current;
    firstRun.current = false;
    const delay = first ? entryDelay : 0;

    if (!first && info.level > prevLevel.current) {
      // LEVEL UP: bar pura bhar jaye, phir naye level ke progress tak
      Animated.sequence([
        Animated.timing(fill, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(fill, { toValue: 0, duration: 0, useNativeDriver: false }),
        Animated.timing(fill, { toValue: info.progress, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start();
    } else {
      Animated.timing(fill, {
        toValue: info.progress,
        duration: first ? 600 : 320,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,   // width animate hoti hai; chhota view hai, cheap
      }).start();
    }
    prevLevel.current = info.level;
  }, [info.level, info.progress, fill, entryDelay]);

  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[s.row, style]}>
      <View style={s.pill}>
        <Ionicons name="triangle" size={11} color="#4DA6FF" />
        <Text style={s.pillNum}>{info.level}</Text>
      </View>

      <View style={s.mid}>
        <View style={s.track}>
          <Animated.View style={[s.fill, { width }]} />
        </View>
        <Text style={s.sub} numberOfLines={1}>
          {info.isMax
            ? 'Max level reached'
            : `+${withCommas(info.starsToUpgrade)} stars to upgrade Lv.${info.nextLevel}`}
        </Text>
      </View>

      {!info.isMax && onUpgrade ? (
        <TouchableOpacity onPress={onUpgrade} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.upgradeBtn}>Upgrade {'>'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

export default LevelBar;

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#12303f',
    paddingHorizontal: 8, height: 22, borderRadius: 11,
  },
  pillNum: { color: '#fff', fontSize: 11, fontWeight: '600', marginLeft: 6 },
  mid: { flex: 1, marginHorizontal: 12 },
  track: { height: 4, borderRadius: 2, backgroundColor: '#3a3a3e', overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: YELLOW },
  sub: { color: GREY, fontSize: 9, marginTop: 3 },
  upgradeBtn: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
