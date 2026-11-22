// @ts-nocheck
import LevelBadge from '../../components/LevelBadge';
import React, { useEffect, useRef, useState, useCallback, memo, forwardRef, useImperativeHandle } from 'react';
import { View, Text, TouchableOpacity, Image, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { gifts } from '../../assets/giftsData';
import { useJoinDelay } from '../../components/live/useJoinDelay';
import UserTick from '../../components/UserTick';
import { width, height } from './constants';
import { getLevelTheme } from './helpers';
import { HEART_COLORS, FloatingHeart } from './LiveWidgets';
import { styles } from './styles';

// ============================================================
// COMBO BUTTON (Tiki jaisa): gift bhejte hi sheet band + neeche peela "Combo" button.
// 3 sec ka countdown ring chalta hai; har tap par wahi gift dobara jata hai, count x1/10 ... x10/10
// aur countdown reset. Apna state hai -> tap par poori live screen re-render nahi hoti (smooth).
// Ring/bounce native-driver Animated hain (JS thread free).
// ============================================================
export const COMBO_MAX = 10;
export const COMBO_WINDOW_MS = 3000;
export const ComboButton = memo(
  forwardRef(({ bottom, onTap }: any, ref: any) => {
    const [count, setCount] = useState(0); // 0 = hidden
    const cntRef = useRef(0);
    const timerRef = useRef<any>(null);
    const ring = useRef(new Animated.Value(0)).current;
    const pop = useRef(new Animated.Value(1)).current;
    const onTapRef = useRef<any>(null);
    onTapRef.current = onTap;

    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const hide = useCallback(() => {
      clearTimer();
      ring.stopAnimation();
      cntRef.current = 0;
      setCount(0);
    }, [ring]);
    const arm = useCallback(() => {
      clearTimer();
      ring.setValue(0);
      Animated.timing(ring, { toValue: 1, duration: COMBO_WINDOW_MS, easing: Easing.linear, useNativeDriver: true }).start();
      // 3s se zara pehle band: gift banner ka combo window (3s) bhi isi ke saath khatam hota hai
      timerRef.current = setTimeout(hide, COMBO_WINDOW_MS - 50);
    }, [ring, hide]);

    useImperativeHandle(
      ref,
      () => ({
        start: () => {
          cntRef.current = 1;
          setCount(1);
          arm();
        },
        hide,
      }),
      [arm, hide]
    );
    useEffect(() => () => clearTimer(), []);

    const press = () => {
      if (cntRef.current < 1 || cntRef.current >= COMBO_MAX) return;
      const ok = onTapRef.current ? onTapRef.current() : false;
      if (!ok) {
        hide(); // stars khatam / user nahi
        return;
      }
      cntRef.current += 1;
      setCount(cntRef.current);
      pop.setValue(0.86);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }).start();
      if (cntRef.current >= COMBO_MAX) {
        // 10/10 poora -> thodi der dikha ke band
        clearTimer();
        ring.stopAnimation();
        timerRef.current = setTimeout(hide, 700);
      } else {
        arm();
      }
    };

    if (count < 1) return null;
    return (
      <View pointerEvents="box-none" style={[styles.comboWrap, { bottom }]}>
        <View style={styles.cbPill}>
          <Text style={styles.cbPillTxt}>x{count}/{COMBO_MAX}</Text>
        </View>
        <View style={styles.comboBox}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.comboRing,
              {
                opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.95, 0.15] }),
                transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1.4, 1] }) }],
              },
            ]}
          />
          <Animated.View style={{ transform: [{ scale: pop }] }}>
            <TouchableOpacity activeOpacity={0.85} delayPressIn={0} onPress={press} style={styles.comboBtn}>
              <Text style={styles.comboNum}>{count}</Text>
              <Text style={styles.comboLbl}>Combo</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    );
  })
);

// All floating hearts live HERE (own state). Tapping the screen or receiving
// likes only re-renders this tiny layer, never the whole live screen.
export const HeartsLayer = memo(
  forwardRef(({ bottom }: any, ref: any) => {
    const [hearts, setHearts] = useState<any[]>([]);
    const idRef = useRef(0);
    const remove = useCallback((id: number) => setHearts((prev) => prev.filter((h) => h.id !== id)), []);

    useImperativeHandle(
      ref,
      () => ({
        spawn: (n: number) => {
          const faces = ["❤️", "💖", "💗", "💜", "🧡", "😍"];
          setHearts((prev) => {
            if (prev.length >= 16) return prev;
            const next = prev.slice();
            for (let i = 0; i < n && next.length < 16; i++) {
              idRef.current += 1;
              next.push({
                id: idRef.current,
                x: Math.floor(Math.random() * 60) + 6,
                emoji: faces[Math.floor(Math.random() * faces.length)],
                color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
              });
            }
            return next;
          });
        },
      }),
      []
    );

    return (
      <View pointerEvents="none" style={[styles.heartsLayer, { bottom }]}>
        {hearts.map((h) => (
          <FloatingHeart key={h.id} id={h.id} x={h.x} emoji={h.emoji} color={h.color} onDone={remove} />
        ))}
      </View>
    );
  })
);

// One chat row: join / gift / normal message (same three types as LiveRoom.js) — Tiki pill style.
export const ChatItem = memo(({ chat, onUser, onMenu }: any) => {
  const joinWait = useJoinDelay(chat);
  const theme = getLevelTheme(chat.level || 1);
  const openUser = () =>
    onUser &&
    (chat.senderId || chat.uid) &&
    onUser({
      uid: chat.senderId || chat.uid,
      name: chat.senderName,
      username: chat.username,
      img: chat.userImg,
      level: chat.level,
      verified: chat.verified,
      verifiedColor: chat.verifiedColor,
    });

  const openMenu = () => onMenu && onMenu(chat);

  if (chat.type === "join") {
    if (joinWait) return null;
    return (
      <View style={styles.tkRow}>
        <TouchableOpacity activeOpacity={0.8} onPress={openUser} style={styles.tkPill}>
          <Text style={styles.tkTxt}>{chat.senderName}</Text>
          <UserTick uid={chat.senderId || chat.uid} verified={!!(chat.verified)} verifiedColor={chat?.verifiedColor} size={15} />
          <Text style={styles.tkTxt}> has joined</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (chat.type === "gift") {
    const gd = gifts.find((g: any) => String(g.id) === String(chat.giftId));
    return (
      <View style={styles.tkRow}>
        <TouchableOpacity activeOpacity={0.8} onPress={openUser} style={styles.tkPill}>
          <Ionicons name="megaphone" size={14} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.tkTxt}>{chat.senderName}</Text>
          <UserTick uid={chat.senderId || chat.uid} verified={!!(chat.verified)} verifiedColor={chat?.verifiedColor} size={15} />
          <Text style={styles.tkTxt}> sent {chat.qty || 1} </Text>
          {gd?.icon ? (
            <Image source={gd.icon} style={{ width: 22, height: 22, resizeMode: "contain" }} />
          ) : (
            <Text style={styles.tkGiftName}>{chat.giftName}</Text>
          )}
          <Text style={styles.tkTxt}> to {chat.receiverName ? chat.receiverName : "the host"}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.tkRow}>
      <TouchableOpacity activeOpacity={0.85} onPress={openMenu} onLongPress={openMenu} delayLongPress={250} style={[styles.tkPill, { flexWrap: "nowrap", alignItems: "flex-start" }]}>
        <View style={{ flexShrink: 1 }}>
          {/* line 1: [HOST/MOD]  name  tick  level  (name par tap = profile) */}
          <TouchableOpacity activeOpacity={0.8} onPress={openUser} onLongPress={openMenu} style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
            {chat.role === "host" && (
              <View style={[styles.roleTag, { backgroundColor: "#F71084", marginLeft: 0, marginRight: 5 }]}>
                <Text style={styles.roleTagTxt}>HOST</Text>
              </View>
            )}
            {chat.role === "mod" && (
              <View style={[styles.roleTag, { backgroundColor: "#2D9CFF", marginLeft: 0, marginRight: 5 }]}>
                <Text style={styles.roleTagTxt}>MOD</Text>
              </View>
            )}
            <Text style={styles.tkName}>{chat.senderName}</Text>
            <UserTick uid={chat.senderId || chat.uid} verified={!!(chat.verified)} verifiedColor={chat?.verifiedColor} size={14} />
            <LevelBadge level={chat.level || 1} size={8} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
          {/* reply quote (Tiki jaisa) */}
          {!!chat.replyTo && (
            <View style={styles.tkReply}>
              <Text numberOfLines={1} style={styles.tkReplyTxt}>
                {"\u21A9 "}{chat.replyTo.name}: {chat.replyTo.text}
              </Text>
            </View>
          )}
          {/* line 2: message (tap = Reply / Delete menu) */}
          <Text style={styles.tkTxt}>{chat.message}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}, (prev: any, next: any) => prev.chat.id === next.chat.id && prev.onUser === next.onUser && prev.onMenu === next.onMenu);
// SMOOTH: chat message kabhi edit nahi hota -> sirf id compare, purani rows re-render nahi.

export const chatKeyExtractor = (item: any, index: number) => item.id || String(index);

// Round tool button (right side column)
export const ToolBtn = ({ icon, label, onPress, active, badge }: any) => (
  <TouchableOpacity style={styles.toolWrap} onPress={onPress} activeOpacity={0.7}>
    <View style={[styles.toolBtn, active && styles.toolBtnActive]}>{icon}</View>
    <Text style={styles.toolLabel}>{label}</Text>
    {badge ? <View style={styles.toolBadge} /> : null}
  </TouchableOpacity>
);

