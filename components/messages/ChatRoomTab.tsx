// ChatRoom tab: Common / Family chips + live rooms list.
// Rooms ka Firestore listener sirf is tab ke mount rehne par chalta hai.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from '../../utils/safeRouter';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRooms } from '../../utils/messages/useRooms';
import { useBlockedIds } from '../../utils/useBlockedIds';
import ChatRoomCard from './ChatRoomCard';
import { keyById, Room } from './data';
import { ROOM_CARD_GAP, ROOM_CARD_HEIGHT } from './theme';

const FILTERS = ['common', 'family'] as const;
type Filter = (typeof FILTERS)[number];

const ITEM = ROOM_CARD_HEIGHT + ROOM_CARD_GAP;
const getItemLayout = (_: any, index: number) => ({ length: ITEM, offset: ITEM * index, index });

const Empty = (
  <View style={{ marginTop: 90, alignItems: 'center' }}>
    <Ionicons name="mic-off-outline" size={56} color="#555" />
    <Text style={{ color: '#8e8e93', marginTop: 10 }}>No live rooms right now</Text>
  </View>
);

const ChatRoomTab = memo(function ChatRoomTab() {
  const router = useRouter();
  const { rooms, loading } = useRooms();
  const { blocked: blockedIds } = useBlockedIds();
  const [filter, setFilter] = useState<Filter>('common');

  const visibleRooms = useMemo(
    () =>
      rooms.filter((r) => {
        if (r.hostId && blockedIds?.has?.(r.hostId)) return false;
        return filter === 'family' ? r.isFamily : !r.isFamily;
      }),
    [rooms, filter, blockedIds]
  );

  const openRoom = useCallback(
    (room: Room) => {
      if (room.type === 'video') {
        router.push({ pathname: '/videolive', params: { id: room.id, role: 'viewer' } } as any);
        return;
      }
      if (room.layout === 'multiguest') {
        router.push({ pathname: '/MultiGuestRoom', params: { id: room.id } } as any);
        return;
      }
      router.push({
        pathname: '/LiveRoom',
        params: { id: room.id, from: 'alllive', layout: room.layout },
      } as any);
    },
    [router]
  );

  const renderRoom = useCallback(
    ({ item }: { item: Room }) => <ChatRoomCard room={item} onPress={openRoom} />,
    [openRoom]
  );

  return (
    <>
      <View style={s.chipRow}>
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              activeOpacity={0.8}
              onPress={() => setFilter(f)}
              style={[s.chip, active && s.chipActive]}
            >
              <Text style={[s.chipText, active && s.chipTextActive]}>
                {f === 'common' ? 'Common' : 'Family'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color="#f1c40f" />
      ) : (
        <FlatList
          data={visibleRooms}
          keyExtractor={keyById}
          renderItem={renderRoom}
          getItemLayout={getItemLayout}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.roomList}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={50}
          windowSize={5}
          removeClippedSubviews
          ListEmptyComponent={Empty}
        />
      )}
    </>
  );
});

export default ChatRoomTab;

const s = StyleSheet.create({
  chipRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 18,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#232327',
    justifyContent: 'center',
    marginRight: 10,
  },
  chipActive: { backgroundColor: '#FFE600' },
  chipText: { color: '#a0a0a6', fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: '#000' },
  roomList: { paddingHorizontal: 12, paddingBottom: 140 },
});
