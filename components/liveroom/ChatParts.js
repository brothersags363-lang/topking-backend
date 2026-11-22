import LevelBadge from '../LevelBadge';
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

export const ChatItem = memo(({ chat }) => {
  const joinWait = useJoinDelay(chat);

        if (chat.type === "join") {
  if (joinWait) return null;

            return (
                <TouchableOpacity activeOpacity={0.7} onPress={() => pressChatUser(chat)}
                    style={{
                        flexDirection: "row",
                        backgroundColor: "rgba(0,0,0,0.35)",
                        borderRadius: 16,
                        alignSelf: "flex-start",
                        marginVertical: 2,
                        alignItems: "center",
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                    }}
                >

                    <View>

                        <ExpoImage cachePolicy="memory-disk" transition={0}
                            source={{
                                uri:chat.userImg || STABLE_AVATAR
                            }}
                            style={{
                                width:22,
                                height:22,
                                borderRadius:11,
                                backgroundColor:'#2a2b38'
                            }}
                        />

                        {
                            (chat.level >= 30 || !!chat.senderId) && (

                                <GuardedFrame level={chat.level} uid={chat.senderId} animated={CHAT_FRAME_ANIM}
                                    style={FRAME_CHAT22}
                                />

                            )
                        }

                    </View>

                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            flexWrap: "wrap",
                        }}
                    >

                        <Text
                            style={{
                                color: "#d0d0d0",
                                fontSize: 13,
                                fontWeight: "600",
                            }}
                        >
                            {chat.senderName}
                        </Text>

                        <UserTick uid={chat.senderId || chat.uid} verified={!!(isVerified(chat.verified))} verifiedColor={chat?.verifiedColor} size={17} />

                        <LevelBadge level={chat.level || 1} size={8} style={{ marginLeft: 5 }} />

                        <Text
                            style={{
                                color: "#d0d0d0",
                                fontSize: 13,
                                fontWeight: "600",
                                marginLeft: 5,
                            }}
                        >
                            joined
                        </Text>

                    </View>

                </TouchableOpacity>
            );
        }

        if (chat.type === "gift") {
            const gd = gifts.find(g => String(g.id) === String(chat.giftId));
            return (
                <TouchableOpacity activeOpacity={0.7} onPress={() => pressChatUser(chat)}
                    style={{
                        flexDirection: "row",
                        backgroundColor: "rgba(0,0,0,0.35)",
                        borderRadius: 16,
                        alignSelf: "flex-start",
                        marginVertical: 2,
                        alignItems: "center",
                        flexWrap: "wrap",
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                    }}
                >
                    <View>
                        <ExpoImage cachePolicy="memory-disk" transition={0}
                            source={{ uri: chat.userImg || STABLE_AVATAR }}
                            style={{ width:22, height:22, borderRadius:11, backgroundColor:'#2a2b38' }}
                        />
                        {(chat.level >= 30 || !!chat.senderId) && (
                            <GuardedFrame level={chat.level} uid={chat.senderId} animated={CHAT_FRAME_ANIM}
                                style={FRAME_CHAT22} />
                        )}
                    </View>
                    <Text style={{ color:"#d0d0d0", fontSize:13, fontWeight:"600", marginLeft:6 }}>
                        {chat.senderName}
                    </Text>
                    <UserTick uid={chat.senderId || chat.uid} verified={!!(isVerified(chat.verified))} verifiedColor={chat?.verifiedColor} size={17} />
                    <Text style={{ color:"#d0d0d0", fontSize:13, marginLeft:5 }}>
                        sent
                    </Text>
                    {gd?.icon ? (
                        <Image
                            source={gd.icon}
                            style={{ width:24, height:24, resizeMode:"contain", marginHorizontal:4 }}
                        />
                    ) : (
                        <Text style={{ color:"#00FFFF", fontWeight:"bold", marginHorizontal:4 }}>
                            {chat.giftName}
                        </Text>
                    )}
                    <Text style={{ color:"#d0d0d0", fontSize:13 }}>to </Text>
                    <Text style={{ color:"#FFE600", fontSize:13, fontWeight:"bold" }}>
                        @{chat.receiverName}
                    </Text>
                    {chat.comboCount > 1 && (
                        <Text style={{ color:"#FF69B4", fontSize:13, fontWeight:"900", marginLeft:5 }}>
                            x{chat.comboCount}
                        </Text>
                    )}
                </TouchableOpacity>
            );
        }

        return (

            <View style={styles.chatRow}>

                <TouchableOpacity activeOpacity={0.7} onPress={() => pressChatUser(chat)}
                    style={{
                        width:42,
                        height:42,
                        justifyContent:"center",
                        alignItems:"center"
                    }}
                >

                    <ExpoImage cachePolicy="memory-disk" transition={0}
                        source={{
                            uri:chat.userImg || STABLE_AVATAR
                        }}
                        style={styles.chatAva}
                    />

                    {
                        (chat.level >= 30 || !!chat.senderId) && (

                            <GuardedFrame level={chat.level} uid={chat.senderId} animated={CHAT_FRAME_ANIM}
                                style={FRAME_CHAT36}
                            />

                        )
                    }

                </TouchableOpacity>

                <View style={styles.chatContent}>

                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            flexWrap: "wrap",
                        }}
                    >

                        <Text style={styles.chatUser} onPress={() => pressChatUser(chat)}>
                            {chat.senderName}
                        </Text>

                        <UserTick uid={chat.senderId || chat.uid} verified={!!(isVerified(chat.verified))} verifiedColor={chat?.verifiedColor} size={15} />

                        <LevelBadge level={chat.level || 1} size={9} style={{ marginLeft: 6 }} />

                    </View>

                    <Text
                        style={{
                            color:"#e3e3f0",
                            fontSize:11,
                            marginTop:2,
                            textShadowColor:'rgba(0,0,0,0.9)',
                            textShadowOffset:{width:0,height:1},
                            textShadowRadius:3,
                        }}
                    >
                        @{chat.username}
                    </Text>

                    <View style={styles.bubble}>
                        <Text style={styles.chatMsg}>
                            {chat.message}
                        </Text>
                    </View>

                </View>

            </View>
        );
}, (prev, next) => prev.chat.id === next.chat.id);
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
