import { fixCdn } from '../../utils/videoSource';
import { memo, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { AVATAR_FALLBACK, height, width } from './feedShared';
import { styles } from './feedStyles';

// ==========================================================
// TabGrid — Follow (live row + 2 column grid) / Discover (masonry)
// Alag memo component: For You feed se koi lena-dena nahi, isliye
// feed ki speed par asar nahi padta. Sirf thumbnail images dikhte hain
// (koi video player nahi) -> bahut halka.
// ==========================================================
export const GRID_GAP = 6;
export const GRID_PAD = 8;
export const GRID_TOP = Platform.OS === 'ios' ? 112 : 92;
export const GRID_BOTTOM = 96;
export const DISC_RATIOS = [1.0, 1.5, 1.25, 1.65, 1.1, 1.4];

export const timeAgo = (t) => {
  const ms = Date.now() - tsMsGlobal(t);
  if (!t || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} mins ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hrs ago`;
  return `${Math.floor(h / 24)} days ago`;
};
export const tsMsGlobal = (t) => {
  if (!t) return 0;
  if (typeof t === 'number') return t;
  if (t.toMillis) return t.toMillis();
  if (t.seconds) return t.seconds * 1000;
  return 0;
};

export const GridTile = memo(function GridTile({ item, idx, w, h, meta, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(idx)}
      style={{ width: w, height: h, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1a1a1a', marginBottom: GRID_GAP }}
    >
      {item.thumbnail ? (
        <ExpoImage
          source={fixCdn(item.thumbnail)}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={item.id}
          transition={0}
        />
      ) : null}
      {meta ? (
        <View style={styles.gridMeta}>
          <ExpoImage
            source={item.profile || AVATAR_FALLBACK}
            style={styles.gridAvatar}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.gridName} numberOfLines={1}>{item.username || 'user'}</Text>
            <Text style={styles.gridTime} numberOfLines={1}>{timeAgo(item.createdAt)}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.gridCaption} numberOfLines={1}>{item.username || ''}</Text>
      )}
    </TouchableOpacity>
  );
});

export const LiveBubble = memo(function LiveBubble({ st, onPress }) {
  const isLive = st.type === 'video';
  return (
    <TouchableOpacity style={styles.liveBubble} activeOpacity={0.8} onPress={() => onPress(st)}>
      <View style={[styles.liveRing, !isLive && { borderColor: '#ff8a00' }]}>
        <ExpoImage source={st.img} style={styles.liveImg} contentFit="cover" cachePolicy="memory-disk" />
        <View style={[styles.liveBadge, { backgroundColor: isLive ? '#FFEB00' : '#ff8a00' }]}>
          <Text style={styles.liveBadgeText}>{isLive ? 'LIVE' : 'CHAT'}</Text>
        </View>
      </View>
      <Text style={styles.liveName} numberOfLines={1}>{st.host}</Text>
    </TouchableOpacity>
  );
});

// SPEED: grid ke saare style / key / render function module-level -> har render par naye
// object/function nahi bante, isliye memo GridTile / FlatList bina wajah re-render nahi hote.
export const TILE_W = (width - GRID_PAD * 2 - GRID_GAP) / 2;
export const gridKey = (v) => String(v.id);
export const FOLLOW_COL_STYLE = { justifyContent: 'space-between', paddingHorizontal: GRID_PAD };
export const FOLLOW_LIST_STYLE = { paddingTop: GRID_TOP, paddingBottom: GRID_BOTTOM };
export const LIVE_ROW_STYLE = { paddingHorizontal: GRID_PAD, paddingBottom: 10 };
export const DISC_SCROLL_STYLE = { paddingTop: GRID_TOP, paddingBottom: GRID_BOTTOM, paddingHorizontal: GRID_PAD };
export const DISC_ROW_STYLE = { flexDirection: 'row', justifyContent: 'space-between' };
export const DISC_COL_STYLE = { width: TILE_W };
export const FOLLOW_TILE_H = TILE_W * 1.55;

export const TabGrid = memo(function TabGrid({ mode, data, live, loading, onOpen, onLive }) {
  const isFollow = mode === 'follow';
  // data ref me rakha -> `open` ka function har data update par naya nahi banta
  const dataRef = useRef(data);
  dataRef.current = data;
  const open = useCallback((idx) => onOpen(dataRef.current, idx), [onOpen]);

  const renderLive = useCallback(({ item }) => <LiveBubble st={item} onPress={onLive} />, [onLive]);
  const renderFollowItem = useCallback(
    ({ item, index }) => (
      <GridTile item={item} idx={index} w={TILE_W} h={FOLLOW_TILE_H} meta onPress={open} />
    ),
    [open]
  );

  const liveRow = useMemo(
    () =>
      live && live.length > 0 ? (
        <FlatList maxToRenderPerBatch={8}
          data={live}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={gridKey}
          renderItem={renderLive}
          contentContainerStyle={LIVE_ROW_STYLE}
          initialNumToRender={6}
          windowSize={3}
          overScrollMode="never"
        />
      ) : null,
    [live, renderLive]
  );
  const header = useMemo(() => <View>{liveRow}</View>, [liveRow]);

  // DISCOVER: 2 column masonry (alag-alag height). Max 30 tile = halka. useMemo -> sirf data badalne par banta hai.
  const cols = useMemo(() => {
    if (isFollow) return null;
    const c = [[], []];
    data.slice(0, 30).forEach((it, i) => {
      const ratio = DISC_RATIOS[i % DISC_RATIOS.length];
      c[i % 2].push({ it, i, h: TILE_W * ratio });
    });
    return c;
  }, [isFollow, data]);

  const empty = !loading && data.length === 0;
  const emptyView = empty ? (
    <Text style={styles.gridEmpty}>
      {isFollow ? 'Jin ko aap follow karte ho unke videos yahan dikhenge' : 'Abhi koi video nahi mila'}
    </Text>
  ) : loading && data.length === 0 ? (
    <ActivityIndicator size="large" color="#FFEB00" style={{ marginTop: 60 }} />
  ) : null;

  if (isFollow) {
    return (
      <View style={styles.gridRoot}>
        <FlatList
          data={data}
          numColumns={2}
          keyExtractor={gridKey}
          renderItem={renderFollowItem}
          columnWrapperStyle={FOLLOW_COL_STYLE}
          ListHeaderComponent={header}
          ListEmptyComponent={emptyView}
          contentContainerStyle={FOLLOW_LIST_STYLE}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={4}
          updateCellsBatchingPeriod={40}
          windowSize={5}
          overScrollMode="never"
          removeClippedSubviews
        />
      </View>
    );
  }

  return (
    <View style={styles.gridRoot}>
      <ScrollView
        contentContainerStyle={DISC_SCROLL_STYLE}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
      >
        {emptyView}
        <View style={DISC_ROW_STYLE}>
          {cols.map((col, ci) => (
            <View key={ci} style={DISC_COL_STYLE}>
              {col.map(({ it, i, h }) => (
                <GridTile key={it.id} item={it} idx={i} w={TILE_W} h={h} meta={false} onPress={open} />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
});

