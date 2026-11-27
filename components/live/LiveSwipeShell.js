import React, { useEffect, useState } from 'react';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';

// Index feed jaisa swipe: finger ke saath current room upar/neeche khisakta hai
// aur uske peeche se agle (ya pichle) room ka hissa saath-saath aata hai.
// Preview sirf cover + host info hai (asli video/audio connection nahi),
// isliye Agora par koi extra load nahi padta.
// Preview ka state yahin hai -> room component re-render nahi hota.

const Card = ({ room, H }) => {
  if (!room) return null;
  const isVideo = room.type === 'video';
  const uri = room.img || room.avatar;
  return (
    <View style={{ width: '100%', height: H, backgroundColor: '#14091f', overflow: 'hidden' }}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={isVideo ? 6 : 28} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: '38%', alignItems: 'center', paddingHorizontal: 24 }}>
        {room.avatar ? (
          <Image source={{ uri: room.avatar }} style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: '#fff' }} />
        ) : null}
        <Text numberOfLines={1} style={{ color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 12 }}>{room.host}</Text>
        <Text numberOfLines={1} style={{ color: '#ddd', fontSize: 14, marginTop: 4 }}>{room.title}</Text>
        <View style={{ marginTop: 10, backgroundColor: '#ff2d55', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{isVideo ? 'LIVE' : 'AUDIO LIVE'}</Text>
        </View>
      </View>
    </View>
  );
};

export default function LiveSwipeShell({ swipe, children }) {
  const [pv, setPv] = useState({ next: null, prev: null });
  useEffect(() => {
    swipe.registerPreview(setPv);
    return () => swipe.registerPreview(null);
  }, [swipe.registerPreview]); // eslint-disable-line react-hooks/exhaustive-deps

  const H = swipe.screenH;
  const y = swipe.translateY;
  return (
    <View style={{ flex: 1, backgroundColor: '#000', overflow: 'hidden' }}>
      <Animated.View style={{ flex: 1, transform: [{ translateY: y }] }}>{children}</Animated.View>
      {pv.next ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: H, transform: [{ translateY: Animated.add(y, H) }] }}>
          <Card room={pv.next} H={H} />
        </Animated.View>
      ) : null}
      {pv.prev ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: H, transform: [{ translateY: Animated.add(y, -H) }] }}>
          <Card room={pv.prev} H={H} />
        </Animated.View>
      ) : null}
    </View>
  );
}
