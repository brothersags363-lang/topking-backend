import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { MessageRow, RowType } from './data';
import { rs } from './styles';
import { VERIFIED } from './theme';

// Creator Assistant: ghar ke andar smile
const SmileHouse = () => (
  <View style={s.houseWrap}>
    <Ionicons name="home" size={34} color="#fff" />
    <View style={s.smileEyes}>
      <View style={s.smileDot} />
      <View style={s.smileDot} />
    </View>
    <View style={s.smileArc} />
  </View>
);

const ICONS: Record<RowType, { bg: string; render: () => React.ReactNode }> = {
  followers: { bg: '#22D3C5', render: () => <Ionicons name="person" size={26} color="#fff" /> },
  comments: { bg: '#2F8CF5', render: () => <Ionicons name="chatbubble-ellipses" size={27} color="#fff" /> },
  likes: { bg: '#F2146E', render: () => <Ionicons name="heart" size={28} color="#fff" /> },
  assistant: { bg: '#F7A823', render: () => <SmileHouse /> },
  official: { bg: '#FFE600', render: () => <Ionicons name="play" size={24} color="#000" /> },
  system: { bg: '#2B2B2D', render: () => <Ionicons name="volume-medium" size={26} color="#fff" /> },
};

type Props = { item: MessageRow; onPress: (item: MessageRow) => void };

const MessageItem = memo(function MessageItem({ item, onPress }: Props) {
  const icon = ICONS[item.type];

  return (
    <TouchableOpacity style={rs.row} activeOpacity={0.7} onPress={() => onPress(item)}>
      <View style={[s.iconBox, { backgroundColor: icon.bg }]}>{icon.render()}</View>

      <View style={rs.rowBody}>
        <View style={rs.titleLine}>
          <Text style={rs.title} numberOfLines={1}>
            {item.title}
          </Text>
          {item.verified && (
            <MaterialCommunityIcons name="check-decagram" size={15} color={VERIFIED} style={rs.tick} />
          )}
        </View>

        <View style={rs.subLine}>
          <Text style={rs.subtitle} numberOfLines={1}>
            {item.subtitle}
          </Text>
          {!!item.time && <Text style={rs.time}>{item.time}</Text>}
        </View>
      </View>

      <View style={rs.badgeSlot}>
        {item.unread > 0 && (
          <View style={rs.rowBadge}>
            <Text style={rs.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

export default MessageItem;

const s = StyleSheet.create({
  iconBox: { width: 50, height: 50, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  houseWrap: { width: 34, height: 34, justifyContent: 'center', alignItems: 'center' },
  smileEyes: { position: 'absolute', top: 17, flexDirection: 'row', gap: 7 },
  smileDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#F7A823' },
  smileArc: {
    position: 'absolute',
    top: 22,
    width: 11,
    height: 6,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: '#F7A823',
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
});
