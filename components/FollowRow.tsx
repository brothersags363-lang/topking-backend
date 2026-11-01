import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { levelThemeFor } from '../utils/profileHelpers';
import { AvatarFrame } from './FramedAvatar';
import FastImage from './FastImage';
import UserTick, { isFaceVerified } from './UserTick';

export const FOLLOW_ROW_HEIGHT = 66;

// item = { id, username, name, profileImg, level, iFollow, followsMe, isMe, ... }
// Sirf wahi row dobara draw hoti hai jiska item badla (memo).
const FollowRow = memo(function FollowRow({ item, onOpenProfile, onMessage, onToggle }) {
  const theme = levelThemeFor(item.level || 1);

  let button = null;
  if (!item.isMe) {
    if (item.iFollow && item.followsMe) {
      button = (
        <TouchableOpacity style={[styles.rowBtn, styles.rowBtnDark]} activeOpacity={0.8} onPress={() => onMessage(item)}>
          <Text style={styles.rowBtnTextLight}>Message</Text>
        </TouchableOpacity>
      );
    } else if (item.followsMe) {
      button = (
        <TouchableOpacity style={[styles.rowBtn, styles.rowBtnYellow]} activeOpacity={0.8} onPress={() => onToggle(item)}>
          <Text style={styles.rowBtnTextDark}>Follow Back</Text>
        </TouchableOpacity>
      );
    } else if (item.iFollow) {
      button = (
        <TouchableOpacity style={[styles.rowBtn, styles.rowBtnDark]} activeOpacity={0.8} onPress={() => onToggle(item)}>
          <Text style={styles.rowBtnTextLight}>Following</Text>
        </TouchableOpacity>
      );
    } else {
      button = (
        <TouchableOpacity style={[styles.rowBtn, styles.rowBtnYellow]} activeOpacity={0.8} onPress={() => onToggle(item)}>
          <Text style={styles.rowBtnTextDark}>Follow</Text>
        </TouchableOpacity>
      );
    }
  }

  return (
    <View style={styles.followRow}>
      <TouchableOpacity style={styles.followUserTap} activeOpacity={0.8} onPress={() => onOpenProfile(item.id)}>
        <View style={{ width: 46, height: 46 }}>
          <FastImage uri={item.profileImg} style={styles.followAvatar} />
          <AvatarFrame uid={item.id} level={item.level} size={46} animated={false} />
        </View>

        <View style={styles.followNameCol}>
          <View style={styles.followNameLine}>
            <Text style={styles.followUsername} numberOfLines={1}>{item.username}</Text>

            <UserTick
              uid={item.id}
              verified={item.verified}
              verifiedColor={item.verifiedColor}
              faceVerified={isFaceVerified(item)}
              size={15}
            />

            <View style={[styles.levelBadge, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <MaterialCommunityIcons name="diamond-stone" size={9} color={theme.icon} />
              <Text style={[styles.levelBadgeText, { color: theme.text }]}>LV {item.level || 1}</Text>
            </View>
          </View>

          {!!item.name && <Text style={styles.followRealName} numberOfLines={1}>{item.name}</Text>}
        </View>
      </TouchableOpacity>

      {button}
    </View>
  );
});

export default FollowRow;

const styles = StyleSheet.create({
  followRow: { flexDirection: 'row', alignItems: 'center', height: FOLLOW_ROW_HEIGHT, paddingHorizontal: 14 },
  followUserTap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  followAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#222' },
  followNameCol: { flex: 1, marginLeft: 16, marginRight: 8 },
  followNameLine: { flexDirection: 'row', alignItems: 'center' },
  followUsername: { color: '#fff', fontSize: 14, fontWeight: 'bold', flexShrink: 1 },
  followRealName: { color: '#8e8e8e', fontSize: 12.5, marginTop: 2 },
  levelBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20, marginLeft: 4, borderWidth: 1 },
  levelBadgeText: { marginLeft: 3, fontSize: 9, fontWeight: 'bold' },
  rowBtn: { width: 98, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  rowBtnYellow: { backgroundColor: '#FFD700' },
  rowBtnDark: { backgroundColor: '#262626' },
  rowBtnTextDark: { color: '#000', fontWeight: 'bold', fontSize: 13 },
  rowBtnTextLight: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
});
