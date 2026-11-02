// Messages screen - ab sirf "jodne wala" page hai. Asli kaam in files me:
//   components/messages/*   -> UI (rows, tabs, popups)
//   utils/messages/*        -> Firestore hooks (friends, rooms, notifications)
import { useRouter } from 'expo-router';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import React, { useCallback, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BottomNav from '../../components/BottomNav';
import ChatRoomTab from '../../components/messages/ChatRoomTab';
import { INFO_CONTENT, MessageRow, NOTIF_ROWS, STATIC_ROWS } from '../../components/messages/data';
import InfoModal from '../../components/messages/InfoModal';
import MessagesHeader from '../../components/messages/MessagesHeader';
import MessageTab from '../../components/messages/MessageTab';
import NotifModal from '../../components/messages/NotifModal';
import { BG } from '../../components/messages/theme';
import useTabBack from '../../utils/useTabBack';
import { useAuthUid } from '../../utils/messages/useAuthUid';
import { useFriends } from '../../utils/messages/useFriends';
import { useLiveProfiles } from '../../utils/messages/useLiveProfiles';
import { useNotifications } from '../../utils/messages/useNotifications';

// ---- helpers: friend / notification se uid nikalna ----
const friendId = (f: any): string | undefined => f?.uid || f?.userId || f?.friendId || f?.id;
const senderId = (n: any): string | undefined => n?.senderId || n?.fromUid || n?.fromId;

export default function MessagesPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const uid = useAuthUid();

  // Mobile back (Message + ChatRoom dono tab): app band nahi hogi, For You (Home) khulega.
  // Popups (Notif/Info) apna back khud sambhalte hain.
  useTabBack();

  const [tab, setTab] = useState<'chatroom' | 'message'>('chatroom');
  const [staticRows, setStaticRows] = useState<MessageRow[]>(STATIC_ROWS);
  const [modalVisible, setModalVisible] = useState(false);
  const [infoId, setInfoId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState('follow');

  const { notifications, notifRows, unreadByType, markTypeRead } = useNotifications(uid);
  const { friends: rawFriends, loadingMore, loadMore } = useFriends(uid);

  // ---- LIVE dp + name (sabke liye) ----
  const notifList: any[] = useMemo(
    () => (Array.isArray(notifications) ? (notifications as any[]) : []),
    [notifications]
  );

  const allIds = useMemo(
    () =>
      [...rawFriends.map((f: any) => friendId(f)), ...notifList.map((n) => senderId(n))].filter(
        Boolean
      ) as string[],
    [rawFriends, notifList]
  );

  const live = useLiveProfiles(allIds);

  const applyLive = useCallback(
    (item: any, id?: string) => {
      const p = id ? live[id] : undefined;
      if (!p) return item;
      return {
        ...item,
        ...(p.name ? { name: p.name, displayName: p.name, senderName: p.name } : {}),
        ...(p.username ? { username: p.username } : {}),
        ...(p.profileImg
          ? {
              profileImg: p.profileImg,
              photo: p.profileImg,
              photoURL: p.profileImg,
              avatar: p.profileImg,
              profile: p.profileImg,
              senderPhoto: p.profileImg,
              senderImg: p.profileImg,
              senderProfileImg: p.profileImg,
            }
          : {}),
      };
    },
    [live]
  );

  const friends = useMemo(
    () => rawFriends.map((f: any) => applyLive(f, friendId(f))),
    [rawFriends, applyLive]
  );

  const liveNotifications = useMemo(
    () =>
      Array.isArray(notifications) ? notifList.map((n) => applyLive(n, senderId(n))) : notifications,
    [notifications, notifList, applyLive]
  );

  const rows = useMemo(() => [...notifRows, ...staticRows], [notifRows, staticRows]);

  const totalUnread = useMemo(
    () =>
      rows.reduce((sum, r) => sum + r.unread, 0) +
      friends.reduce((sum: number, f: any) => sum + (Number(f.unreadCount) > 0 ? Number(f.unreadCount) : 0), 0),
    [rows, friends]
  );

  // ---- popup open/close ----
  const openNotifType = useCallback(
    (type: string) => {
      setSelectedType(type);
      setModalVisible(true);
      markTypeRead(type).catch(() => {});
    },
    [markTypeRead]
  );

  const selectNotifType = useCallback(
    (type: string) => {
      setSelectedType(type);
      markTypeRead(type).catch(() => {});
    },
    [markTypeRead]
  );

  const closeNotif = useCallback(() => setModalVisible(false), []);
  const closeInfo = useCallback(() => setInfoId(null), []);

  const openRow = useCallback(
    (item: MessageRow) => {
      const cfg = NOTIF_ROWS.find((c) => c.id === item.id);
      if (cfg) {
        openNotifType(cfg.notifType);
        return;
      }
      setStaticRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, unread: 0 } : r)));
      if (INFO_CONTENT[item.id]) {
        setInfoId(item.id);
        return;
      }
      router.push(item.route as any);
    },
    [router, openNotifType]
  );

  // ---- popup ke andar ke actions ----
  const notifOpenHome = useCallback(
    (videoId: string) => {
      setModalVisible(false);
      router.push({ pathname: '/', params: { videoId } } as any);
    },
    [router]
  );

  const notifOpenProfile = useCallback(
    (sid: string) => {
      setModalVisible(false);
      router.push({ pathname: '/userProfile', params: { userId: sid } } as any);
    },
    [router]
  );

  const notifOpenVideo = useCallback(
    async (videoId: string) => {
      if (!videoId) return;
      try {
        const snap = await getDoc(doc(getFirestore(), 'all_videos', videoId));
        if (!snap.exists()) return;
        const videoData = { id: snap.id, ...snap.data() };
        setModalVisible(false);
        setTimeout(() => {
          router.push({
            pathname: '/videoedite',
            params: { videos: JSON.stringify([videoData]), index: '0', userId: uid || '' },
          } as any);
        }, 300);
      } catch (e) {
        console.log('OPEN VIDEO ERROR =', e);
      }
    },
    [router, uid]
  );

  // "+" dabane par camera khulega
  const addMessage = useCallback(() => router.push('/camera' as any), [router]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar backgroundColor={BG} barStyle="light-content" />

      <MessagesHeader tab={tab} totalUnread={totalUnread} onChangeTab={setTab} onAdd={addMessage} />

      {tab === 'chatroom' ? (
        <ChatRoomTab />
      ) : (
        <MessageTab
          rows={rows}
          friends={friends}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          onOpenRow={openRow}
        />
      )}

      <BottomNav />

      <InfoModal infoId={infoId} onClose={closeInfo} />

      <NotifModal
        visible={modalVisible}
        selectedType={selectedType}
        notifications={liveNotifications}
        unreadByType={unreadByType}
        onClose={closeNotif}
        onSelectType={selectNotifType}
        onOpenHome={notifOpenHome}
        onOpenProfile={notifOpenProfile}
        onOpenVideo={notifOpenVideo}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
});
