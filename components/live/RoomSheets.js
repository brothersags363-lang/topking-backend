import React, { memo, useMemo } from 'react';
import {
  View, Text, Image, Modal, FlatList, TouchableOpacity, Pressable, StyleSheet, ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import LevelFrame from '../LevelFrame';
import { T } from './liveTheme';

const AVATAR = 'https://avatar.iran.liara.run/public/65';

// ---------- common bottom sheet ----------
// `extraBottom` = sheet ke andar niche se kitna zyada gap chahiye (icons upar aayenge)
const Sheet = ({ visible, onClose, title, children, tall, extraBottom = 0 }) => (
  <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <Pressable style={s.backdrop} onPress={onClose} />
    <View style={[s.sheet, tall && { height: '68%' }, extraBottom > 0 && { paddingBottom: 26 + extraBottom }]}>
      <View style={s.handle} />
      <Text style={s.title}>{title}</Text>
      {children}
    </View>
  </Modal>
);

const Verified = ({ user }) =>
  user.verified ? (
    <MaterialCommunityIcons
      name="check-decagram"
      size={15}
      color={user.verifiedColor === 'yellow' ? '#FFD700' : '#4FC3F7'}
      style={{ marginLeft: 4 }}
    />
  ) : null;

// ---------- viewers ----------
const ViewerRow = memo(({ user, canKick, onKick }) => (
  <View style={s.row}>
    <View style={s.avaWrap}>
      <Image source={{ uri: user.img || user.userImg || AVATAR }} style={s.ava} />
      {(user.level || 0) >= 10 && (
        <LevelFrame level={user.level} animated={false}
          style={{ position: 'absolute', width: 52, height: 52, top: -6, left: -6 }} />
      )}
    </View>
    <View style={{ flex: 1, marginLeft: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text numberOfLines={1} style={s.name}>{user.name || user.userName || user.senderName || 'User'}</Text>
        <Verified user={user} />
      </View>
      <Text style={s.sub}>LV {user.level || 1}</Text>
    </View>
    {canKick && (
      <TouchableOpacity style={s.kickBtn} onPress={() => onKick(user)}>
        <Text style={s.kickTxt}>Remove</Text>
      </TouchableOpacity>
    )}
  </View>
));

export const ViewersSheet = ({ visible, onClose, users, isHost, onKick }) => (
  <Sheet visible={visible} onClose={onClose} title={`Viewers · ${users.length}`} tall>
    <FlatList
      data={users}
      keyExtractor={(u) => u.uid}
      initialNumToRender={10}
      windowSize={5}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={<Text style={s.empty}>Abhi koi viewer nahi hai</Text>}
      renderItem={({ item }) => <ViewerRow user={item} canKick={isHost} onKick={onKick} />}
    />
  </Sheet>
);

// ---------- top gifters ----------
const MEDAL = ['#F5C451', '#C9CED6', '#D08A4E'];

export const GiftersSheet = ({ visible, onClose, gifters }) => {
  const list = useMemo(
    () =>
      Object.values(gifters || {})
        .filter((g) => g && g.stars > 0)
        .sort((a, b) => b.stars - a.stars)
        .slice(0, 30),
    [gifters]
  );
  return (
    <Sheet visible={visible} onClose={onClose} title="Top gifters" tall>
      <FlatList
        data={list}
        keyExtractor={(g, i) => g.uid || String(i)}
        initialNumToRender={10}
        windowSize={5}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={s.empty}>Pehla gift bhejne wale bano top gifter</Text>}
        renderItem={({ item, index }) => (
          <View style={s.row}>
            <View style={s.rank}>
              {index < 3 ? (
                <MaterialCommunityIcons name="crown" size={20} color={MEDAL[index]} />
              ) : (
                <Text style={s.rankTxt}>{index + 1}</Text>
              )}
            </View>
            <Image source={{ uri: item.profileImg || AVATAR }} style={[s.ava, index < 3 && { borderWidth: 2, borderColor: MEDAL[index] }]} />
            <Text numberOfLines={1} style={[s.name, { flex: 1, marginLeft: 12 }]}>{item.name || item.username || 'User'}</Text>
            <Ionicons name="star" size={13} color={T.gold} />
            <Text style={s.stars}>{item.stars}</Text>
          </View>
        )}
      />
    </Sheet>
  );
};

// ---------- room menu ----------
const Item = ({ icon, label, onPress, danger, active }) => (
  <TouchableOpacity style={s.menuItem} onPress={onPress} activeOpacity={0.8}>
    <View style={[s.menuIcon, active && { backgroundColor: 'rgba(139,92,246,0.35)' }]}>
      <Ionicons name={icon} size={20} color={danger ? T.live : '#fff'} />
    </View>
    <Text style={[s.menuTxt, danger && { color: T.live }]}>{label}</Text>
  </TouchableOpacity>
);

// Lock room / Share / Leave menu ko upar karne ke liye. Zyada upar chahiye to number badhao.
const MENU_LIFT = 45;

export const RoomMenuSheet = ({ visible, onClose, isHost, locked, onToggleLock, onShare, onExit }) => (
  <Sheet visible={visible} onClose={onClose} title="Room" extraBottom={MENU_LIFT}>
    <View style={s.menuGrid}>
      <Item icon="share-social" label="Share" onPress={() => { onClose(); onShare(); }} />
      {isHost && (
        <Item
          icon={locked ? 'lock-closed' : 'lock-open'}
          label={locked ? 'Unlock room' : 'Lock room'}
          active={locked}
          onPress={() => { onToggleLock(); onClose(); }}
        />
      )}
      <Item icon="exit-outline" label="Leave" danger onPress={() => { onClose(); onExit(); }} />
    </View>
  </Sheet>
);

// ---------- quick emoji strip ----------
const EMOJIS = ['😂', '🔥', '👏', '😍', '🥳', '😮', '💯', '🙏'];
export const EmojiStrip = memo(({ onPick }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.emojiRow} keyboardShouldPersistTaps="handled">
    {EMOJIS.map((e) => (
      <TouchableOpacity key={e} style={s.emojiBtn} onPress={() => onPick(e)}>
        <Text style={{ fontSize: 22 }}>{e}</Text>
      </TouchableOpacity>
    ))}
  </ScrollView>
));

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#14112B', borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: 18, paddingBottom: 26, paddingTop: 10,
    borderTopWidth: 1, borderColor: T.line,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 14 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  avaWrap: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  ava: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2a2b38' },
  name: { color: '#fff', fontSize: 15, fontWeight: '700', maxWidth: 190 },
  sub: { color: T.sub, fontSize: 11, marginTop: 2 },
  empty: { color: T.sub, textAlign: 'center', marginTop: 40 },
  kickBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,59,92,0.16)' },
  kickTxt: { color: T.live, fontSize: 12, fontWeight: '700' },
  rank: { width: 30, alignItems: 'center' },
  rankTxt: { color: T.sub, fontWeight: '800', fontSize: 14 },
  stars: { color: T.gold, fontWeight: '800', marginLeft: 4, fontSize: 14 },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  menuItem: { width: '25%', alignItems: 'center', marginBottom: 12 },
  menuIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: T.glass, justifyContent: 'center', alignItems: 'center' },
  menuTxt: { color: '#fff', fontSize: 11, marginTop: 6, textAlign: 'center' },
  emojiRow: { paddingHorizontal: 12, paddingVertical: 6 },
  emojiBtn: { paddingHorizontal: 8, paddingVertical: 2 },
});
