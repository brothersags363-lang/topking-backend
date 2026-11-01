import React, { memo, useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import FastImage from '../FastImage';
import { DEFAULT_AVATAR } from './theme';

type Props = {
  item: any;
  onOpenHome: (videoId: string) => void;
  onOpenProfile: (senderId: string) => void;
  onOpenVideo: (videoId: string) => void;
};

const ACTION: Record<string, string> = {
  comment: 'commented on your video',
  like: 'liked your video',
  follow: 'started following you',
};

const NotificationRow = memo(function NotificationRow({
  item,
  onOpenHome,
  onOpenProfile,
  onOpenVideo,
}: Props) {
  const openHome = useCallback(() => {
    if (item.videoId) onOpenHome(item.videoId);
  }, [item.videoId, onOpenHome]);
  const openProfile = useCallback(() => onOpenProfile(item.senderId), [item.senderId, onOpenProfile]);
  const openVideo = useCallback(() => onOpenVideo(item.videoId), [item.videoId, onOpenVideo]);

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={openHome} style={s.row}>
      <TouchableOpacity onPress={openProfile}>
        <FastImage uri={item.senderPhoto || DEFAULT_AVATAR} style={s.avatar} />
      </TouchableOpacity>

      <View style={s.body}>
        <Text style={s.name}>{item.senderName}</Text>

        {item.videoThumbnail ? (
          <TouchableOpacity onPress={openVideo}>
            <FastImage uri={item.videoThumbnail} style={s.thumb} />
          </TouchableOpacity>
        ) : null}

        <Text style={s.action}>{ACTION[item.type] || ''}</Text>

        {item.text ? <Text style={s.text}>Comment: {item.text}</Text> : null}
        {item.videoCaption ? <Text style={s.caption}>Video: {item.videoCaption}</Text> : null}
      </View>
    </TouchableOpacity>
  );
});

export default NotificationRow;

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: '#222',
  },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#111' },
  body: { marginLeft: 10, flex: 1 },
  name: { color: '#fff', fontWeight: 'bold' },
  thumb: { width: 55, height: 75, borderRadius: 8 },
  action: { color: '#aaa' },
  text: { color: '#fff', marginTop: 4 },
  caption: { color: '#FFD700', marginTop: 3 },
});
