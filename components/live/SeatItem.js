import React, { memo, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import LevelFrame from '../LevelFrame';
import { T } from './liveTheme';

const AVATAR = 'https://avatar.iran.liara.run/public/65';

// Bolne par soft glow ring. UI thread par chalta hai, isliye JS render nahi badhta.
const SpeakingRing = memo(() => {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(p);
  }, [p]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.7 * (1 - p.value),
    transform: [{ scale: 1 + p.value * 0.35 }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.ring, style]} />;
});

function SeatItem({ seatKey, seat, stars, isSpeaking, index, onPress }) {
  const active = !!seat?.userId;
  const isHost = seatKey === 'seat_1';
  const muted = active && seat.isMuted;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={styles.item}
      onPress={() => onPress(seatKey, seat)}
    >
      <View style={styles.box}>
        {isSpeaking && <SpeakingRing />}

        <View
          style={[
            styles.avatarBox,
            isHost && active && styles.host,
            !isHost && active && styles.speaker,
            !active && styles.empty,
            isSpeaking && styles.speaking,
          ]}
        >
          {active ? (
            <Image source={{ uri: seat.userImg || AVATAR }} style={styles.img} />
          ) : (
            <>
              <Ionicons name="add" size={22} color="rgba(255,255,255,0.28)" />
              <Text style={styles.num}>{index}</Text>
            </>
          )}
        </View>

        {active && seat.level >= 10 && (
          <LevelFrame
            level={seat.level}
            style={{ position: 'absolute', width: 90, height: 90, zIndex: 10 }}
          />
        )}

        {isHost && active && (
          <View style={styles.hostTag}>
            <Ionicons name="ribbon" size={8} color="#1a1200" />
            <Text style={styles.hostTxt}>HOST</Text>
          </View>
        )}

        {muted && (
          <View style={styles.muteBadge}>
            <Ionicons name="mic-off" size={10} color="#fff" />
          </View>
        )}
      </View>

      <Text numberOfLines={1} style={styles.name}>
        {active ? seat.userName : 'Empty'}
      </Text>

      {active && (
        <View style={styles.starPill}>
          <Ionicons name="star" size={9} color={T.gold} />
          <Text style={styles.starTxt}>{stars}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// Seat tab hi dobara draw hoti hai jab uska apna data badle.
// (Room snapshot har baar naya object deta hai, default memo yahan kaam nahi karta.)
const same = (a, b) =>
  a.seatKey === b.seatKey &&
  a.stars === b.stars &&
  a.isSpeaking === b.isSpeaking &&
  a.index === b.index &&
  a.seat?.userId === b.seat?.userId &&
  a.seat?.userImg === b.seat?.userImg &&
  a.seat?.userName === b.seat?.userName &&
  a.seat?.level === b.seat?.level &&
  a.seat?.isMuted === b.seat?.isMuted;

export default memo(SeatItem, same);

const styles = StyleSheet.create({
  item: { width: '25%', alignItems: 'center', marginBottom: 14 },
  box: { width: 64, height: 64, justifyContent: 'center', alignItems: 'center' },
  avatarBox: {
    width: 58, height: 58, borderRadius: 29, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  img: { width: '100%', height: '100%' },
  host: { borderWidth: 2, borderColor: T.gold },
  speaker: { borderWidth: 1.5, borderColor: T.violet },
  empty: { borderWidth: 1, borderColor: T.line, borderStyle: 'dashed' },
  speaking: { borderColor: T.green, borderWidth: 2 },
  ring: {
    position: 'absolute', width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(46,230,166,0.35)',
  },
  num: { position: 'absolute', bottom: 4, fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: '700' },
  hostTag: {
    position: 'absolute', top: -6, flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.gold, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, zIndex: 12,
  },
  hostTxt: { fontSize: 8, fontWeight: '800', color: '#1a1200', marginLeft: 2 },
  muteBadge: {
    position: 'absolute', bottom: 2, right: 2, width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(255,59,92,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 12,
  },
  name: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 4, maxWidth: 72 },
  starPill: {
    flexDirection: 'row', alignItems: 'center', marginTop: 3,
    backgroundColor: 'rgba(245,196,81,0.14)', borderRadius: 9, paddingHorizontal: 6, paddingVertical: 1,
  },
  starTxt: { color: T.gold, fontSize: 10, fontWeight: '700', marginLeft: 3 },
});
