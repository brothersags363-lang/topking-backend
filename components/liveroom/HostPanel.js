import React, { memo, useCallback } from 'react';
import { UserLabel } from '../live/UserLabel';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { GuardedFrame, SafeModal } from './SharedUI';
import { FRAME_LIST40, STABLE_AVATAR, height } from './constants';

// ============================================================
// HOST PANEL: chat lock / clear all chat + audience list with
// "Invite to seat" and "Kick". Memo + FlatList => room ko re-render nahi karta.
// ============================================================
export const HostRow = memo(({ user, invited, onInvite, onKick, onUserPress }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
    <TouchableOpacity activeOpacity={0.7} onPress={() => onUserPress && onUserPress(user)} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
    <View style={{ marginLeft: 8 }}>
      <ExpoImage cachePolicy="memory-disk" transition={0}
        source={{ uri: user.img || STABLE_AVATAR }}
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#2a2b38' }}
      />
      {(user.level >= 30 || !!user.uid) && (
        <GuardedFrame level={user.level} uid={user.uid} pointerEvents="none"
          style={FRAME_LIST40} />
      )}
    </View>
    <View style={{ flex: 1, marginLeft: 14 }}>
      <UserLabel level={user.level} name={user.name || user.username || 'User'} uid={user.uid} verified={user.verified} verifiedColor={user.verifiedColor} nameStyle={{ color: '#fff', fontWeight: '700', fontSize: 14 }} />
      <Text numberOfLines={1} style={{ color: '#888', fontSize: 11 }}>
        @{user.username || 'user'}  •  LV {user.level || 1}
      </Text>
    </View>
    </TouchableOpacity>
    <TouchableOpacity
      disabled={invited}
      onPress={() => onInvite(user)}
      style={{
        backgroundColor: invited ? '#2B2D42' : '#00c27a',
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, marginRight: 8,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
        {invited ? '⏳ Invited' : '🎙 Invite'}
      </Text>
    </TouchableOpacity>
    <TouchableOpacity
      onPress={() => onKick(user)}
      style={{ backgroundColor: '#e74c3c', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 }}
    >
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>🚫 Kick</Text>
    </TouchableOpacity>
  </View>
));

export const HostPanelSheet = memo(
  ({ visible, onClose, users, invites, chatLocked, onToggleChatLock, onClearChat, onInvite, onKick, seatCount, onChangeSeats, onUserPress }) => {
    const navGap = 10;
    const renderRow = useCallback(
      ({ item }) => (
        <HostRow
          user={item}
          invited={!!invites[item.uid]}
          onInvite={onInvite}
          onKick={onKick}
          onUserPress={onUserPress}
        />
      ),
      [invites, onInvite, onKick, onUserPress]
    );
    return (
      <SafeModal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View
            style={{
              backgroundColor: '#14122B',
              maxHeight: height * 0.75,
              minHeight: height * 0.45,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              padding: 18,
              paddingBottom: navGap,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 14 }}>
              🛠 Host Tools
            </Text>

            <View style={{ flexDirection: 'row', marginBottom: 14 }}>
              <TouchableOpacity
                onPress={onToggleChatLock}
                style={{
                  flex: 1, marginRight: 8, paddingVertical: 12, borderRadius: 14,
                  alignItems: 'center',
                  backgroundColor: chatLocked ? '#f1c40f' : 'rgba(255,255,255,0.10)',
                }}
              >
                <Text style={{ color: chatLocked ? '#000' : '#fff', fontWeight: 'bold', fontSize: 13 }}>
                  {chatLocked ? '🔓 Unlock Chat' : '🔒 Lock Chat'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClearChat}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center',
                  backgroundColor: 'rgba(231,76,60,0.25)',
                }}
              >
                <Text style={{ color: '#ff6b5e', fontWeight: 'bold', fontSize: 13 }}>
                  🗑 Delete All Chat
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', marginBottom: 14 }}>
              {seatCount === 12 ? (
                <TouchableOpacity
                  onPress={() => onChangeSeats && onChangeSeats(9)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.10)' }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>➖ 3 Seat Kam (9 • 3-3-3)</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => onChangeSeats && onChangeSeats(12)}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: '#00c27a' }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>➕ 3 Seat Add (12 • 4-4-4-4)</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={{ color: '#bbb', fontSize: 13, marginBottom: 6 }}>
              👥 Listeners ({users.length})
            </Text>

            <FlatList
              data={users}
              keyExtractor={(u) => u.uid}
              renderItem={renderRow}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={5}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={{ color: '#777', textAlign: 'center', marginTop: 24 }}>
                  Abhi koi listener nahi hai 😴
                </Text>
              }
            />
          </View>
        </View>
      </SafeModal>
    );
  }
);
