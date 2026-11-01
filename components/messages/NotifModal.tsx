// Followers / Likes / Comments popup
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useCallback, useMemo } from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { keyById } from './data';
import NotificationRow from './NotificationRow';
import { ms } from './styles';

const MODAL_TABS = [
  { id: 'follow', title: 'Follower', icon: 'person', color: '#3498db' },
  { id: 'like', title: 'Like', icon: 'heart', color: '#ff2d55' },
  { id: 'comment', title: 'Comments', icon: 'chatbubble', color: '#00ccbb' },
];

const TITLES: Record<string, string> = { follow: 'Followers', like: 'Likes', comment: 'Comments' };

const Empty = (
  <View style={{ marginTop: 100, alignItems: 'center' }}>
    <Ionicons name="notifications-outline" size={60} color="#555" />
    <Text style={{ color: '#aaa', marginTop: 10 }}>No Notifications</Text>
  </View>
);

type Props = {
  visible: boolean;
  selectedType: string;
  notifications: any[];
  unreadByType: Record<string, number>;
  onClose: () => void;
  onSelectType: (type: string) => void;
  onOpenHome: (videoId: string) => void;
  onOpenProfile: (senderId: string) => void;
  onOpenVideo: (videoId: string) => void;
};

const NotifModal = memo(function NotifModal({
  visible,
  selectedType,
  notifications,
  unreadByType,
  onClose,
  onSelectType,
  onOpenHome,
  onOpenProfile,
  onOpenVideo,
}: Props) {
  const data = useMemo(
    () => (visible ? notifications.filter((n) => n.type === selectedType) : []),
    [visible, notifications, selectedType]
  );

  const renderItem = useCallback(
    ({ item }: { item: any }) => (
      <NotificationRow
        item={item}
        onOpenHome={onOpenHome}
        onOpenProfile={onOpenProfile}
        onOpenVideo={onOpenVideo}
      />
    ),
    [onOpenHome, onOpenProfile, onOpenVideo]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={ms.modalBackdrop}>
        <View style={ms.modalCard}>
          <View style={ms.modalHeader}>
            <Text style={ms.modalTitle}>{TITLES[selectedType] || 'Comments'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={s.tabs}>
            {MODAL_TABS.map((t) => {
              const count = unreadByType[t.id] || 0;
              const active = selectedType === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  activeOpacity={0.8}
                  onPress={() => onSelectType(t.id)}
                  style={[s.tab, { borderBottomColor: active ? '#f1c40f' : 'transparent' }]}
                >
                  <View>
                    <Ionicons name={t.icon as any} size={22} color={t.color} />
                    {count > 0 && (
                      <View style={s.tabCount}>
                        <Text style={s.tabCountText}>{count > 99 ? '99+' : count}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.tabText, { color: active ? '#fff' : '#777' }]}>{t.title}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <FlatList
            style={{ flex: 1 }}
            data={data}
            keyExtractor={keyById}
            renderItem={renderItem}
            ListEmptyComponent={Empty}
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            windowSize={5}
            removeClippedSubviews
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
});

export default NotifModal;

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#222' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2 },
  tabText: { fontSize: 12, fontWeight: 'bold', marginTop: 3 },
  tabCount: {
    position: 'absolute',
    top: -6,
    right: -14,
    backgroundColor: '#ff00aa',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabCountText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
});
