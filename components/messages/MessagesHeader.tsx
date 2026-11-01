import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BADGE, CHATROOM } from './theme';

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

type Props = {
  tab: 'chatroom' | 'message';
  totalUnread: number;
  onChangeTab: (tab: 'chatroom' | 'message') => void;
  onAdd: () => void;
};

const MessagesHeader = memo(function MessagesHeader({ tab, totalUnread, onChangeTab, onAdd }: Props) {
  return (
    <View style={s.header}>
      <TouchableOpacity activeOpacity={0.7} hitSlop={HIT} onPress={() => onChangeTab('chatroom')}>
        <Text style={tab === 'chatroom' ? s.headerTitle : s.chatRoom}>ChatRoom</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.titleWrap}
        activeOpacity={0.7}
        hitSlop={HIT}
        onPress={() => onChangeTab('message')}
      >
        <Text style={tab === 'message' ? s.headerTitle : s.chatRoom}>Message</Text>
        {totalUnread > 0 && (
          <View style={s.headerBadge}>
            <Text style={s.headerBadgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
          </View>
        )}
      </TouchableOpacity>

      {tab === 'message' && (
        <TouchableOpacity style={s.plusBtn} activeOpacity={0.7} hitSlop={HIT} onPress={onAdd}>
          <Ionicons name="add" size={34} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
});

export default MessagesHeader;

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
  },
  chatRoom: { color: CHATROOM, fontSize: 15, fontWeight: '700' },
  titleWrap: { marginLeft: 20 },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  headerBadge: {
    position: 'absolute',
    top: -5,
    right: -14,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 3,
    backgroundColor: BADGE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBadgeText: { color: '#fff', fontSize: 8, fontWeight: '800' },
  plusBtn: { marginLeft: 'auto', marginRight: 2 },
});
