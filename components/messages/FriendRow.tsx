import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import FastImage from '../FastImage';
import { AvatarFrame } from '../FramedAvatar';
import UserTick from '../UserTick';
import { getLevelTheme, timeAgo, toMillis } from './data';
import { rs } from './styles';
import { DEFAULT_AVATAR } from './theme';

type Props = { item: any; onOpen: (item: any) => void };

const FriendRow = memo(function FriendRow({ item, onOpen }: Props) {
  const theme = getLevelTheme(item.level);
  const last =
    item.lastMessage === '🎙 Live Invite'
      ? '🎙 Sent you a live invite'
      : item.lastMessage === '🎥 Video'
      ? '🎥 Sent a video'
      : item.lastMessage || '';
  const t = timeAgo(toMillis(item.updatedAt));
  const uid = item.userId || item.id;

  return (
    <TouchableOpacity style={rs.row} activeOpacity={0.7} onPress={() => onOpen(item)}>
      <View style={s.avatarWrap}>
        <FastImage uri={item.profileImg || DEFAULT_AVATAR} style={s.avatar} />
        <AvatarFrame uid={uid} level={item.level} size={50} animated={false} />
      </View>

      <View style={rs.rowBody}>
        <View style={rs.titleLine}>
          <Text style={rs.title} numberOfLines={1}>
            {item.username}
          </Text>
          <UserTick
            uid={uid}
            verified={item.verified}
            verifiedColor={item.verifiedColor}
            faceVerified={item.faceVerified}
            size={15}
          />
          <View style={[s.levelBadge, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="diamond-stone" size={10} color={theme.icon} />
            <Text style={[s.levelText, { color: theme.text }]}>LV {item.level || 1}</Text>
          </View>
        </View>

        <View style={rs.subLine}>
          <Text style={rs.subtitle} numberOfLines={1}>
            {last}
          </Text>
          {!!t && <Text style={rs.time}>{t}</Text>}
        </View>
      </View>

      <View style={rs.badgeSlot}>
        {item.unreadCount > 0 && (
          <View style={rs.rowBadge}>
            <Text style={rs.badgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

export default FriendRow;

const s = StyleSheet.create({
  avatarWrap: { width: 50, height: 50, marginRight: 4 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#111' },
  levelBadge: {
    marginLeft: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 20,
  },
  levelText: { fontSize: 9, fontWeight: 'bold', marginLeft: 2 },
});
