// components/GridParts.js
// Follow + Discover pages ke shared tile / live bubble.
// Sirf thumbnail image dikhate hain (koi video player nahi) -> bahut halka.
import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

export const AVATAR_FALLBACK = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
export const GRID_GAP = 6;
export const GRID_PAD = 8;

export const tsMs = (t) => {
  if (!t) return 0;
  if (typeof t === 'number') return t;
  if (t.toMillis) return t.toMillis();
  if (t.seconds) return t.seconds * 1000;
  return 0;
};

export const timeAgo = (t) => {
  const v = tsMs(t);
  if (!v) return '';
  const m = Math.floor((Date.now() - v) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} mins ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hrs ago`;
  return `${Math.floor(h / 24)} days ago`;
};

export const GridTile = memo(function GridTile({ item, w, h, meta, onPress }) {
  // har render par naya function nahi banta
  const press = useCallback(() => onPress(item), [onPress, item]);
  const ago = useMemo(() => (meta ? timeAgo(item.createdAt) : ''), [meta, item.createdAt]);
  const sizeStyle = useMemo(() => ({ width: w, height: h }), [w, h]);

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={press} style={[styles.tile, sizeStyle]}>
      {item.thumbnail ? (
        <ExpoImage
          source={item.thumbnail}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={item.id}
          transition={0}
        />
      ) : null}
      {meta ? (
        <View style={styles.meta}>
          <ExpoImage
            source={item.profile || AVATAR_FALLBACK}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={`p_${item.id}`}
            transition={0}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{item.username || 'user'}</Text>
            <Text style={styles.time} numberOfLines={1}>{ago}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.caption} numberOfLines={1}>{item.username || ''}</Text>
      )}
    </TouchableOpacity>
  );
});

export const LiveBubble = memo(function LiveBubble({ st, onPress }) {
  const isLive = st.type === 'video';
  const press = useCallback(() => onPress(st), [onPress, st]);
  return (
    <TouchableOpacity style={styles.bubble} activeOpacity={0.8} onPress={press}>
      <View style={[styles.ring, !isLive && styles.ringChat]}>
        <ExpoImage
          source={st.img}
          style={styles.liveImg}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
        <View style={[styles.badge, isLive ? styles.badgeLive : styles.badgeChat]}>
          <Text style={styles.badgeText}>{isLive ? 'LIVE' : 'CHAT'}</Text>
        </View>
      </View>
      <Text style={styles.liveName} numberOfLines={1}>{st.host}</Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  tile: { borderRadius: 10, overflow: 'hidden', backgroundColor: '#1a1a1a', marginBottom: GRID_GAP },
  meta: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: 'rgba(0,0,0,0.35)' },
  avatar: { width: 26, height: 26, borderRadius: 13, marginRight: 6, backgroundColor: '#333' },
  name: { color: '#fff', fontSize: 12, fontWeight: '700' },
  time: { color: 'rgba(255,255,255,0.75)', fontSize: 10 },
  caption: { position: 'absolute', left: 8, bottom: 6, right: 8, color: '#fff', fontSize: 11, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  bubble: { alignItems: 'center', marginRight: 12, width: 70 },
  ring: { width: 64, height: 64, borderRadius: 32, borderWidth: 2.5, borderColor: '#FFEB00', justifyContent: 'center', alignItems: 'center' },
  ringChat: { borderColor: '#ff8a00' },
  liveImg: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#333' },
  badge: { position: 'absolute', bottom: -6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  badgeLive: { backgroundColor: '#FFEB00' },
  badgeChat: { backgroundColor: '#ff8a00' },
  badgeText: { color: '#000', fontSize: 9, fontWeight: '800' },
  liveName: { color: '#fff', fontSize: 11, marginTop: 8 },
});
