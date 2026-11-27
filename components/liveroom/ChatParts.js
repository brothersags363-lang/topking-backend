import LevelBadge from '../LevelBadge';
import { LiveChatItem } from '../live/ChatLine';
import React, { memo, useCallback, useRef, useState } from 'react';
import { Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { gifts } from '../../assets/giftsData';
import { Image as ExpoImage } from 'expo-image';
import { useJoinDelay } from '../live/useJoinDelay';
import UserTick from '../UserTick';
import { GuardedFrame } from './SharedUI';
import { CHAT_FRAME_ANIM, FRAME_CHAT22, FRAME_CHAT36, STABLE_AVATAR } from './constants';
import { isVerified } from './helpers';
import { styles } from './styles';

// One chat row. Previously this was a ~340-line inline renderItem, so every
// re-render of LiveRoom re-rendered every visible row. As a memo component it
// only re-renders when that specific message object changes.
// Tap on a chat user (avatar / name) -> same profile popup as seat tap.
// Module-level ref => ChatItem stays memoized, no extra re-renders.
export const chatUserPressRef = { current: null };
export const pressChatUser = (chat) => { if (chatUserPressRef.current) chatUserPressRef.current(chat); };

// Tiki jaisa: [Level/SVIP badge] naam ✓ : message  (join / gift / message) - sab live rooms me same
export const ChatItem = memo(({ chat }) => (
  <LiveChatItem chat={chat} onUser={pressChatUser} />
), (prev, next) => prev.chat.id === next.chat.id);
// SPEED FIX: chat snapshot har baar naye objects banata hai, isliye pehle har
// message row dobara render hoti thi. Message kabhi edit nahi hota -> sirf id
// compare karo, purani rows bilkul re-render nahi hongi.

export const renderChatItem = ({ item }) => <ChatItem chat={item} />;
export const chatKeyExtractor = (item, index) => item.id || String(index);

// SPEED FIX (chat lag): typed text ab is chhote component ke andar rehta hai.
// Pehle `chatMessage` poori LiveRoom screen ka state tha, isliye har akshar
// likhne par 6000 line ki screen dobara render hoti thi -> keyboard lagta tha.
export const ChatTextInput = memo(({ onSend, locked = false, onFocus, onBlur }) => {
  const [text, setText] = useState('');
  const textRef = useRef('');

  const onChange = useCallback((t) => {
    textRef.current = t;
    setText(t);
  }, []);

  // textRef se hamesha latest text jata hai (stale closure nahi)
  const submit = useCallback(() => {
    const t = textRef.current.trim();
    if (!t || locked) return;
    textRef.current = '';
    setText('');
    onSend(t);
  }, [onSend, locked]);

  return (
    <>
      <TextInput
        style={[styles.inputStyle, locked && { opacity: 0.6 }]}
        placeholder={locked ? "🔒 Chat locked by host" : "Chat"}
        placeholderTextColor="rgba(255,255,255,0.85)"
        value={locked ? '' : text}
        onChangeText={onChange}
        onSubmitEditing={submit}
        onFocus={onFocus}
        onBlur={onBlur}
        editable={!locked}
        maxLength={200}
        returnKeyType="send"
        blurOnSubmit={false}   // keyboard band nahi hota -> lagatar chat smooth
        autoCorrect={false}
        autoComplete="off"
        underlineColorAndroid="transparent"
      />
      {text.trim().length > 0 && !locked ? (
        <TouchableOpacity
          onPress={submit}
          activeOpacity={0.6}
          delayPressIn={0}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          style={{ marginRight: 8 }}
        >
          <Ionicons name="send" size={20} color="#f71084" />
        </TouchableOpacity>
      ) : null}
    </>
  );
});
