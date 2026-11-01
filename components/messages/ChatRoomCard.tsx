import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import FastImage from '../FastImage';
import type { Room } from './data';
import { ROOM_CARD_HEIGHT, ROOM_CARD_GAP } from './theme';

type Props = { room: Room; onPress: (room: Room) => void };

const ChatRoomCard = memo(function ChatRoomCard({ room, onPress }: Props) {
  return (
    <TouchableOpacity style={s.roomCard} activeOpacity={0.85} onPress={() => onPress(room)}>
      <View style={s.coverWrap}>
        <FastImage uri={room.cover} style={s.cover} />
        <View style={s.nameShade}>
          <Text style={s.hostName} numberOfLines={1}>
            {room.host}
          </Text>
        </View>
      </View>

      <View style={s.info}>
        <View style={s.titleRow}>
          <View style={s.typeIcon}>
            <Ionicons name={room.type === 'video' ? 'videocam' : 'mic'} size={10} color="#fff" />
          </View>
          <Text style={s.title} numberOfLines={1}>
            {room.title}
          </Text>
        </View>

        <View style={s.avatarsRow}>
          <FastImage uri={room.hostImg} style={s.hostAvatar} />
          <View style={s.guests}>
            {room.guests.map((u, i) => (
              <FastImage key={i} uri={u} style={s.guestAvatar} />
            ))}
          </View>
        </View>

        <View style={s.count}>
          <Ionicons name="stats-chart" size={10} color="#d8d8de" />
          <Text style={s.countText}>{room.users}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default ChatRoomCard;

const s = StyleSheet.create({
  roomCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1524',
    borderRadius: 16,
    padding: 8,
    marginBottom: ROOM_CARD_GAP,
    height: ROOM_CARD_HEIGHT,
  },
  coverWrap: { width: 84, height: 84, borderRadius: 12, overflow: 'hidden', backgroundColor: '#111' },
  cover: { width: '100%', height: '100%' },
  nameShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  hostName: { color: '#e6e6ea', fontSize: 10 },
  info: { flex: 1, marginLeft: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  typeIcon: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: '#2F8CF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  title: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
  avatarsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  hostAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#FFE600',
    backgroundColor: '#111',
  },
  guests: { flexDirection: 'row', marginLeft: 8, flex: 1, overflow: 'hidden' },
  guestAvatar: { width: 26, height: 26, borderRadius: 13, marginRight: 4, backgroundColor: '#111' },
  count: { position: 'absolute', right: 2, bottom: 0, flexDirection: 'row', alignItems: 'center' },
  countText: { color: '#d8d8de', fontSize: 11, fontWeight: '700', marginLeft: 3 },
});
