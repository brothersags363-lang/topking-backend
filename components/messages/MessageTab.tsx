// Message tab: Followers/Comments/Likes + static rows (header) aur friends chats (list)
import { useRouter } from '../../utils/safeRouter';
import React, { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import FriendRow from './FriendRow';
import { keyById, MessageRow } from './data';
import MessageItem from './MessageItem';

type Props = {
  rows: MessageRow[];
  friends: any[];
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpenRow: (item: MessageRow) => void;
};

const MessageTab = memo(function MessageTab({ rows, friends, loadingMore, onLoadMore, onOpenRow }: Props) {
  const router = useRouter();

  const openChat = useCallback(
    (item: any) =>
      router.push({
        pathname: '/chat',
        params: { userId: item.userId, username: item.username, profileImg: item.profileImg },
      } as any),
    [router]
  );

  const renderFriend = useCallback(
    ({ item }: { item: any }) => <FriendRow item={item} onOpen={openChat} />,
    [openChat]
  );

  const header = useMemo(
    () => (
      <View>
        {rows.map((r) => (
          <MessageItem key={r.id} item={r} onPress={onOpenRow} />
        ))}
      </View>
    ),
    [rows, onOpenRow]
  );

  const footer = loadingMore ? (
    <ActivityIndicator style={{ marginVertical: 16 }} color="#f1c40f" />
  ) : null;

  return (
    <FlatList
      data={friends}
      keyExtractor={keyById}
      renderItem={renderFriend}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.4}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.content}
      initialNumToRender={10}
      maxToRenderPerBatch={8}
      updateCellsBatchingPeriod={50}
      windowSize={7}
      removeClippedSubviews
    />
  );
});

export default MessageTab;

const s = StyleSheet.create({
  content: { paddingTop: 12, paddingBottom: 140 },
});
