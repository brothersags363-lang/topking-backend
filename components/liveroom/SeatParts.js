import React, { memo, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import ReAnimated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { gifSource, isGifReaction } from '../../assets/emojiGifs';
import { Image as ExpoImage } from 'expo-image';
import FastImage from '../FastImage';
import { getAdminFrameKey } from '../adminFrames';
import { GuardedFrame } from './SharedUI';
import { SEAT_CELL_W, SEAT_FRAME_ANIM_MODE, SEAT_FRAME_OFFSET, SEAT_FRAME_SIZE, SEAT_FRAME_STYLE, SHOW_SEAT_FRAME, SPEAK_HOLD_MS, STABLE_AVATAR } from './constants';
import { fmtCount, seatEqual, uidToNum, useSettled } from './helpers';
import { styles } from './styles';

export const speakingStore = {
  map: {},
  last: {},
  subs: new Set(),
  timer: null,
  emit() {
    this.subs.forEach((f) => f());
  },
  update(active) {
    const now = Date.now();
    let changed = false;
    for (const uid in active) {
      this.last[uid] = now;
      if (!this.map[uid]) {
        this.map = { ...this.map, [uid]: true };
        changed = true;
      }
    }
    if (this.sweep(now)) changed = true;
    if (changed) this.emit();
    if (Object.keys(this.map).length && !this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.sweep(Date.now())) this.emit();
        if (Object.keys(this.map).length) this.update({});
      }, SPEAK_HOLD_MS);
    }
  },
  sweep(now) {
    let next = null;
    for (const uid in this.map) {
      if (now - (this.last[uid] || 0) > SPEAK_HOLD_MS) {
        if (!next) next = { ...this.map };
        delete next[uid];
        delete this.last[uid];
      }
    }
    if (next) {
      this.map = next;
      return true;
    }
    return false;
  },
  // Mute hote hi us user ka glow turant band (hold time ka wait nahi)
  clear(uid) {
    if (!uid) return;
    let hit = false;
    if (this.map[uid]) {
      const next = { ...this.map };
      delete next[uid];
      this.map = next;
      hit = true;
    }
    if (this.last[uid]) delete this.last[uid];
    if (hit) this.emit();
  },
  reset() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.map = {};
    this.last = {};
    this.emit();
  },
};
export const SpeakGlow = memo(() => {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), -1, false);
    return () => { p.value = 0; };
  }, [p]);
  const pulse = useAnimatedStyle(() => ({
    opacity: 0.85 * (1 - p.value),
    transform: [{ scale: 1 + p.value * 0.3 }],
  }));
  return (
    <>
      <View pointerEvents="none" style={styles.speakGlowSolid} />
      <ReAnimated.View pointerEvents="none" renderToHardwareTextureAndroid style={[styles.speakGlowPulse, pulse]} />
    </>
  );
});
// Screenshot-style seat: rounded translucent square, "+" when empty, NO.x label.
export const SeatCell = memo(({ seatKey, index, seat, stars, isSpeaking, onPress, cellW = SEAT_CELL_W }) => {
  const isHostSeat = index === 1;
  // ENTER SMOOTH: frames room khulne ke baad ek-ek karke animate shuru karte hain
  const frameAnimOk = useSettled(300 + index * 140);
  // MUTE FIX: mute user par kabhi glow nahi
  const glowOn = !!isSpeaking && !seat.isMuted;
  const occupied = !!seat.userId;
  // Host ka frame laga hai ya nahi (level>=30). Frame ho tabhi "Host" label dikhega
  const hostHasFrame = isHostSeat && occupied && (seat.level >= 30 || !!getAdminFrameKey(seat.userId));
  const emoji = typeof seat.reaction === 'string' ? seat.reaction : seat.reaction?.e;
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[styles.seatCell, { width: cellW }, emoji ? { zIndex: 50, elevation: 50 } : null]}
      onPress={() => onPress && onPress(seatKey, seat)}
    >
      <View style={[styles.seatSquare, occupied ? styles.seatSquareOccupied : (glowOn && styles.seatSquareSpeaking)]}>
        {occupied ? (
          <>
            <FastImage uri={seat.userImg} fallback={STABLE_AVATAR} style={styles.seatAvatarImg} contentFit="cover" transition={0} />
            {glowOn ? <SpeakGlow /> : null}
            {SHOW_SEAT_FRAME && (seat.level >= 30 || !!seat.userId) && (
              <GuardedFrame
                level={seat.level}
                uid={seat.userId}
                animated={frameAnimOk && (SEAT_FRAME_ANIM_MODE === 'all' || (SEAT_FRAME_ANIM_MODE === 'host' && isHostSeat))}
                pointerEvents="none"
                style={SEAT_FRAME_STYLE}
              />
            )}
            {seat.isMuted ? (
              <View style={styles.seatMuteBadge}>
                <Ionicons name="mic-off" size={10} color="#fff" />
              </View>
            ) : null}
            {emoji && !isGifReaction(emoji) ? <Text style={styles.seatEmoji}>{emoji}</Text> : null}
          </>
        ) : (
          <Ionicons name="add" size={26} color="rgba(255,255,255,0.9)" />
        )}
        {hostHasFrame ? (
          <View pointerEvents="none" style={styles.seatHostPill}>
            <Text style={styles.seatHostPillTxt}>Host</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.seatLabelPill}>
        <Text numberOfLines={1} allowFontScaling={false} style={[styles.seatLabel, { maxWidth: cellW - 30 }]}>
          {occupied ? (seat.userName || 'User') : `NO.${index - 1}`}
        </Text>
      </View>
      {occupied ? (
        <View style={styles.seatCoinRow}>
          <Ionicons name="star" size={11} color="#f5c518" />
          <Text allowFontScaling={false} style={styles.seatCoinTxt}>{fmtCount(stars || 0)}</Text>
        </View>
      ) : null}
      {emoji && isGifReaction(emoji) ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: SEAT_FRAME_OFFSET, left: (cellW - SEAT_FRAME_SIZE) / 2, width: SEAT_FRAME_SIZE, height: SEAT_FRAME_SIZE, zIndex: 999, elevation: 999 }}
        >
          <ExpoImage source={gifSource(emoji)} contentFit="contain" autoplay style={{ width: '100%', height: '100%' }} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}, (p, n) =>
  p.seatKey === n.seatKey && p.index === n.index && p.stars === n.stars && p.cellW === n.cellW &&
  p.isSpeaking === n.isSpeaking && p.onPress === n.onPress && seatEqual(p.seat, n.seat)
);

export const SpeakingSeat = memo(({ seatKey, index, seat, stars, onPress, cellW }) => {
  const uid = seat.userId ? uidToNum(seat.userId) : 0;
  const muted = !!seat.isMuted;
  const [speaking, setSpeaking] = useState(!!(uid && !muted && speakingStore.map[uid]));

  useEffect(() => {
    // muted => speaking hamesha false (store me purani entry ho tab bhi)
    const check = () => setSpeaking(!!(uid && !muted && speakingStore.map[uid]));
    check();
    if (muted) speakingStore.clear(uid);
    speakingStore.subs.add(check);
    return () => {
      speakingStore.subs.delete(check);
    };
  }, [uid, muted]);

  return (
    <SeatCell
      seatKey={seatKey}
      index={index}
      seat={seat}
      stars={stars}
      isSpeaking={speaking}
      onPress={onPress}
      cellW={cellW}
    />
  );
}, (p, n) =>
  p.seatKey === n.seatKey && p.index === n.index && p.stars === n.stars && p.cellW === n.cellW &&
  p.onPress === n.onPress && seatEqual(p.seat, n.seat)
);
