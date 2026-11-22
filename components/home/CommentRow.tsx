import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import UserTick, { isFaceVerified } from '../UserTick';
import { AvatarFrame } from '../FramedAvatar';
import { CommentLike } from './CommentLike';
import { AVATAR_FALLBACK, height, width } from './feedShared';

// ==========================
// COMMENTS: module-level helpers + memoized row
// (parent ke bahar -> typing / snapshot par poori list re-render nahi hoti)
// ==========================
export const COMMENT_PAGE_SIZE = 25;

export const commentKeyExtractor = (item) => item.id;

export const commentTimeAgo = (timestamp) => {
  if (!timestamp?.seconds) return 'now';
  const diff = Math.floor((Date.now() - timestamp.seconds * 1000) / 1000);
  if (diff < 60) return `${Math.max(diff, 0)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  return `${Math.floor(diff / 2592000)}mo`;
};

export const cs = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: 15, marginBottom: 15, alignItems: 'flex-start' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  body: { marginLeft: 10, flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { color: '#fff', fontWeight: 'bold' },
  badge: { marginLeft: 5 },
  text: { color: '#fff' },
  time: { color: '#999', fontSize: 11, marginTop: 3 },
  actions: { flexDirection: 'row', marginTop: 8 },
  actionText: { color: '#999', fontSize: 13, fontWeight: '600' },
  toggle: { marginTop: 8, marginLeft: 15 },
  repliesBox: { marginTop: 10, marginLeft: 15, borderLeftWidth: 1, borderLeftColor: '#333', paddingLeft: 12 },
  replyRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-start' },
  replyAvatar: { width: 30, height: 30, borderRadius: 15 },
  replyBody: { marginLeft: 8, flex: 1 },
  replyName: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  replyText: { color: '#fff', marginTop: 2 },
  replyTime: { color: '#888', fontSize: 11, marginTop: 3 },
  menu: { paddingLeft: 10, paddingTop: 5 },
  empty: { color: '#888', textAlign: 'center', marginTop: 30 },
});

export const CommentsEmpty = (
  <Text style={cs.empty}>No comments yet. Be the first!</Text>
);

export const CommentRow = memo(function CommentRow({
  item,
  replyList,
  expanded,
  currentUid,
  videoId,
  onProfile,
  onReply,
  onToggleReplies,
  onDeleteComment,
  onDeleteReply,
}) {
  const replyCount = replyList ? replyList.length : 0;

  return (
    <View style={cs.row}>
      <TouchableOpacity onPress={() => onProfile(item.userId)}>
        <ExpoImage
          source={{ uri: item.profilePic || AVATAR_FALLBACK }}
          style={cs.avatar}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
        <AvatarFrame uid={item.userId} size={40} animated={false} />
      </TouchableOpacity>

      <View style={cs.body}>
        <View style={cs.nameRow}>
          <Text style={cs.name}>{item.username}</Text>
          <UserTick uid={item.userId} verified={item.verified} verifiedColor={item.verifiedColor} faceVerified={isFaceVerified(item)} size={17} />
        </View>

        <Text style={cs.text}>{item.text}</Text>
        <Text style={cs.time}>{commentTimeAgo(item.createdAt)}</Text>

        <View style={cs.actions}>
          <TouchableOpacity onPress={() => onReply(item)}>
            <Text style={cs.actionText}>Reply</Text>
          </TouchableOpacity>
        </View>

        {replyCount > 0 ? (
          <TouchableOpacity onPress={() => onToggleReplies(item.id)} style={cs.toggle}>
            <Text style={cs.actionText}>
              {expanded
                ? 'Hide replies'
                : `View ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
            </Text>
          </TouchableOpacity>
        ) : null}

        {replyCount > 0 && expanded ? (
          <View style={cs.repliesBox}>
            {replyList.map((reply) => (
              <View key={reply.id} style={cs.replyRow}>
                <View style={{ width: 30, height: 30 }}>
                  <ExpoImage
                    source={{ uri: reply.profilePic || AVATAR_FALLBACK }}
                    style={cs.replyAvatar}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={0}
                  />
                  <AvatarFrame uid={reply.userId} size={30} animated={false} />
                </View>

                <View style={cs.replyBody}>
                  <View style={cs.nameRow}>
                    <Text style={cs.replyName}>{reply.username}</Text>
                    <UserTick uid={reply.userId} verified={reply.verified} verifiedColor={reply.verifiedColor} faceVerified={isFaceVerified(reply)} size={15} />
                  </View>
                  <Text style={cs.replyText}>{reply.text}</Text>
                  <Text style={cs.replyTime}>{commentTimeAgo(reply.createdAt)}</Text>
                </View>

                {currentUid === reply.userId ? (
                  <TouchableOpacity
                    onPress={() => onDeleteReply(item.id, reply.id)}
                    style={cs.menu}
                  >
                    <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <CommentLike videoId={videoId} commentId={item.id} count={item.likesCount} />

      {currentUid === item.userId ? (
        <TouchableOpacity onPress={() => onDeleteComment(item.id)} style={cs.menu}>
          <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
});


