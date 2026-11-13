// components/TopTabs.js
// Shared top bar: Live icon | Discover | Follow | For You
// Teeno pages (index / follow / discover) yahi use karte hain.
// Bahut halka: koi data/Firebase nahi, sirf navigation.
import React, { memo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from '../utils/safeRouter';

const ACCENT = '#FFEB00';

function TopTabs({ active }) {
  const router = useRouter();

  const goLive = useCallback(() => router.push('/all-live'), [router]);
  const goDiscover = useCallback(() => {
    if (active !== 'discover') router.replace('/discover');
  }, [router, active]);
  const goFollow = useCallback(() => {
    if (active !== 'follow') router.replace('/follow');
  }, [router, active]);
  const goForYou = useCallback(() => {
    if (active !== 'foryou') router.replace('/');
  }, [router, active]);

  return (
    <View style={styles.bar} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.liveBtn}
        onPress={goLive}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        activeOpacity={0.7}
      >
        <Ionicons name="radio-outline" size={26} color="#fff" />
      </TouchableOpacity>

      <View style={styles.row}>
        <Tab label="Discover" on={active === 'discover'} onPress={goDiscover} />
        <Tab label="Follow" on={active === 'follow'} onPress={goFollow} />
        <Tab label="For You" on={active === 'foryou'} onPress={goForYou} />
      </View>
    </View>
  );
}

const Tab = memo(function Tab({ label, on, onPress }) {
  return (
    <TouchableOpacity
      style={styles.tab}
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
      activeOpacity={0.7}
    >
      <Text style={[styles.text, on && styles.textOn]}>{label}</Text>
      {on ? <View style={styles.underline} /> : null}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  bar: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  liveBtn: { position: 'absolute', left: 16, top: 6, width: 30, height: 28, justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  tab: { marginHorizontal: 14, alignItems: 'center' },
  text: { color: 'rgba(255,255,255,0.7)', fontSize: 17, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  textOn: { color: '#fff' },
  underline: { width: 26, height: 3, backgroundColor: ACCENT, marginTop: 3, borderRadius: 2 },
});

export default memo(TopTabs);
