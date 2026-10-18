import React, { memo, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import LevelFrame from '../LevelFrame';
import SeatEmoji from './SeatEmoji';
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
            <MaterialCommunityIcons
              name={isHost ? 'microphone' : 'sofa'}
              size={22}
              color={T.gold}
            />
          )}
        </View>

        {active && (seat.level >= 10 || seat.special || !!seat.userId) && (
          <LevelFrame
            level={seat.level}
            special={seat.special}
            uid={seat.userId}
            style={{ position: 'absolute', width: 72, height: 72, zIndex: 10 }}
          />
        )}

        {active && <SeatEmoji reaction={seat.reaction} />}

        {isHost && active && (
          <View style={styles.hostTag}>
            <Ionicons name="ribbon" size={8} color="#1a1200" />
            <Text style={styles.hostTxt}>HOST</Text>
          </View>
        )}

        {muted && (
          <View style={styles.muteBadge}>
            <Ionicons name="mic-off" size={9} color="#fff" />
          </View>
        )}
      </View>

      <Text numberOfLines={1} style={styles.name}>
        {active ? seat.userName : (isHost ? 'Host' : `No.${index}`)}
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
  a.seat?.isMuted === b.seat?.isMuted &&
  a.seat?.reaction?.k === b.seat?.reaction?.k;

export default memo(SeatItem, same);

const styles = StyleSheet.create({
  item: { width: '20%', alignItems: 'center', marginBottom: 8 },
  box: { width: 52, height: 52, justifyContent: 'center', alignItems: 'center' },
  avatarBox: {
    width: 46, height: 46, borderRadius: 23, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  img: { width: '100%', height: '100%' },
  host: { borderWidth: 2, borderColor: T.gold },
  speaker: { borderWidth: 1.5, borderColor: T.violet },
  empty: { borderWidth: 1.5, borderColor: T.gold, backgroundColor: 'rgba(245,196,81,0.08)' },
  speaking: { borderColor: T.green, borderWidth: 2 },
  ring: {
    position: 'absolute', width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(46,230,166,0.35)',
  },
  num: { position: 'absolute', bottom: 3, fontSize: 8, color: 'rgba(255,255,255,0.3)', fontWeight: '700' },
  hostTag: {
    position: 'absolute', top: -6, flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.gold, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, zIndex: 12,
  },
  hostTxt: { fontSize: 8, fontWeight: '800', color: '#1a1200', marginLeft: 2 },
  muteBadge: {
    position: 'absolute', bottom: 0, right: 0, width: 15, height: 15, borderRadius: 8,
    backgroundColor: 'rgba(255,59,92,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 12,
  },
  name: { color: '#fff', fontSize: 10, fontWeight: '600', marginTop: 3, maxWidth: 60 },
  starPill: {
    flexDirection: 'row', alignItems: 'center', marginTop: 2,
    backgroundColor: 'rgba(245,196,81,0.14)', borderRadius: 9, paddingHorizontal: 5, paddingVertical: 1,
  },
  starTxt: { color: T.gold, fontSize: 9, fontWeight: '700', marginLeft: 3 },
});
