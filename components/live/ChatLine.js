// components/live/ChatLine.js
// SAARE LIVE ROOMS ka naam + chat ek jaisa (Tiki jaisa):
//
//   [Level ya SVIP badge]  naam  ✓  : message
//   [Level ya SVIP badge]  naam  ✓  has joined
//   [Level ya SVIP badge]  naam  ✓  sent 1 🌹 to the host
//
// - Level 50+ ho to level ki jagah SVIP badge (50-59 SVIP1, 60-64 SVIP2, 65 SVIP3)
// - Level na ho (0 / khali) to sirf: naam ✓
// - Tick (verified) hamesha naam ke BAAD
//
// Use:
//   <LiveChatItem chat={chat} onUser={(u) => ...} onMenu={(chat) => ...} />   (chat row: join / gift / message)
//   <UserLabel level={lv} name={name} uid={uid} verified={v} verifiedColor={c} />   (list / banner me naam)
//   <LevelPrefix level={lv} />                                                 (sirf badge)
import React, { memo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { LevelPrefix, UserLabel } from './UserLabel';
import UserTick from '../UserTick';
import { svipForLevel, svipOf } from '../../utils/svip';
import { gifts } from '../../assets/giftsData';
import { useJoinDelay } from './useJoinDelay';

const isTrue = (v) => v === true || v === 'true';
const lvOf = (level) => Math.max(0, Math.floor(Number(level) || 0));

// LevelPrefix / UserLabel alag file me (UserLabel.js) - JoinEntry bhi wahi use karta hai.
// Yahan import karne se circular import (ChatLine -> useJoinDelay -> JoinEntry -> ChatLine) nahi banta.
export { LevelPrefix, UserLabel };

// inline (Text ke andar) badge - message isi line me aage wrap hota hai
const InlineBadge = ({ level }) => {
  if (lvOf(level) < 1) return null;
  return (
    <Text>
      <View style={st.inlineBadgeBox}>
        <LevelPrefix level={level} size={8} svipHeight={17} />
      </View>
      {'  '}
    </Text>
  );
};

const InlineTick = ({ chat }) => (
  <View style={st.inlineTickBox}>
    <UserTick
      uid={chat.senderId || chat.uid}
      verified={isTrue(chat.verified)}
      verifiedColor={chat.verifiedColor}
      size={14}
      style={{ marginLeft: 3 }}
    />
  </View>
);

const RoleTag = ({ role }) => {
  if (role !== 'host' && role !== 'mod') return null;
  return (
    <Text>
      <View style={[st.roleTag, { backgroundColor: role === 'host' ? '#F71084' : '#2D9CFF' }]}>
        <Text style={st.roleTagTxt}>{role === 'host' ? 'HOST' : 'MOD'}</Text>
      </View>
      {' '}
    </Text>
  );
};

// SVIP user ka message bubble halka rangeen (Tiki jaisa)
const bubbleTint = (level) => {
  const n = svipForLevel(level);
  if (!n) return null;
  const c = svipOf(n).chip[0];
  return { backgroundColor: c + '73', borderWidth: 1, borderColor: c + 'CC' };
};

// ---------- ek chat row: join / gift / message ----------
// onUser(chat)  -> naam par tap (profile)
// onMenu(chat)  -> message par tap / long press (reply / delete) - optional
export const LiveChatItem = memo(function LiveChatItem({ chat, onUser, onMenu }) {
  const joinWait = useJoinDelay(chat);
  const openUser = () => onUser && onUser(chat);
  const openMenu = onMenu ? () => onMenu(chat) : undefined;

  if (chat.type === 'join') {
    if (joinWait) return null;
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={openUser} style={st.bubble}>
        <Text style={st.line}>
          <InlineBadge level={chat.level} />
          <Text style={st.name}>{chat.senderName || 'User'}</Text>
          <InlineTick chat={chat} />
          <Text style={st.sys}> has joined</Text>
        </Text>
      </TouchableOpacity>
    );
  }

  if (chat.type === 'gift') {
    const gd = gifts.find((g) => String(g.id) === String(chat.giftId));
    const qty = Number(chat.qty) || 1;
    const combo = Number(chat.comboCount) || 0;
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={openUser} style={[st.bubble, bubbleTint(chat.level)]}>
        <Text style={st.line}>
          <InlineBadge level={chat.level} />
          <Text style={st.name}>{chat.senderName || 'User'}</Text>
          <InlineTick chat={chat} />
          <Text style={st.sys}> sent {qty} </Text>
          {gd?.icon ? (
            <View style={st.inlineGiftBox}>
              <Image source={gd.icon} style={st.giftIcon} />
            </View>
          ) : (
            <Text style={st.giftName}>{chat.giftName}</Text>
          )}
          <Text style={st.sys}> to {chat.receiverName ? chat.receiverName : 'the host'}</Text>
          {combo > 1 ? <Text style={st.combo}>  x{combo}</Text> : null}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={openMenu || openUser}
      onLongPress={openMenu}
      delayLongPress={250}
      style={[st.bubble, bubbleTint(chat.level)]}
    >
      {!!chat.replyTo && (
        <View style={st.reply}>
          <Text numberOfLines={1} style={st.replyTxt}>
            {'↩ '}{chat.replyTo.name}: {chat.replyTo.text}
          </Text>
        </View>
      )}
      <Text style={st.line}>
        <RoleTag role={chat.role} />
        <InlineBadge level={chat.level} />
        <Text style={st.name} onPress={openUser}>{chat.senderName || 'User'}</Text>
        <InlineTick chat={chat} />
        <Text style={st.name}>: </Text>
        <Text style={st.msg}>{chat.message}</Text>
      </Text>
    </TouchableOpacity>
  );
}, (prev, next) => prev.chat.id === next.chat.id && prev.onUser === next.onUser && prev.onMenu === next.onMenu);

const st = StyleSheet.create({
  bubble: {
    alignSelf: 'flex-start',
    maxWidth: '96%',
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginVertical: 2,
  },
  line: { fontSize: 14, lineHeight: 21, color: '#fff' },
  name: { color: '#D2CFDC', fontSize: 14, fontWeight: '600' },
  sys: { color: '#fff', fontSize: 14 },
  msg: { color: '#fff', fontSize: 14 },
  giftName: { color: '#00FFFF', fontWeight: '700', fontSize: 14 },
  combo: { color: '#FFD84A', fontWeight: '900', fontSize: 14 },
  labelName: { color: '#fff', fontSize: 14, fontWeight: '700' },

  inlineBadgeBox: { height: 18, justifyContent: 'center', transform: [{ translateY: 3 }] },
  inlineTickBox: { height: 16, justifyContent: 'center', transform: [{ translateY: 3 }] },
  inlineGiftBox: { width: 20, height: 18, transform: [{ translateY: 3 }] },
  giftIcon: { width: 20, height: 20, resizeMode: 'contain' },

  roleTag: { borderRadius: 4, paddingHorizontal: 4, height: 15, justifyContent: 'center', transform: [{ translateY: 2 }] },
  roleTagTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },

  reply: { borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.5)', paddingLeft: 6, marginBottom: 3 },
  replyTxt: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
});

export default LiveChatItem;
