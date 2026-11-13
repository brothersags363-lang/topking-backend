// app/(tabs)/discover.js — Discover page (masonry grid, alag-alag height)
// FlatList + chunks: sirf screen ke aas-paas ke tiles render hote hain.
// Cache se turant khulta hai, peeche se refresh.
// Back: jahan se aaye wahin wapas (useTabBack).
import React, { useCallback, useMemo, useRef, useState, memo } from 'react';
import {
  View, Text, FlatList, StyleSheet, Platform, StatusBar,
  RefreshControl, ActivityIndicator, InteractionManager, Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useRouter } from '../../utils/safeRouter';
import { useBlockedIds } from '../../utils/useBlockedIds';
import useTabBack from '../../utils/useTabBack';
import useSwipeTabs from '../../utils/useSwipeTabs';
import { loadDiscover, discoverCache } from '../../utils/homeData';
import AppBottomNav from '../../components/AppBottomNav';
import TopTabs from '../../components/TopTabs';
import { GridTile, GRID_PAD, GRID_GAP } from '../../components/GridParts';

const { width } = Dimensions.get('window');
const COL_W = (width - GRID_PAD * 2 - GRID_GAP) / 2;

// Har chunk = 6 tiles (2 column x 3). Dono column ke ratio ka jod barabar hai
// -> neeche khaali gap nahi, masonry jaisa dikhta hai.
const PATTERNS = [
  { a: [1.5, 1.0, 1.25], b: [1.0, 1.5, 1.25] },
  { a: [1.65, 1.1, 1.4], b: [1.1, 1.65, 1.4] },
];

const Chunk = memo(function Chunk({ chunk, onPress }) {
  return (
    <View style={styles.cols}>
      <View style={{ width: COL_W }}>
        {chunk.a.map(({ it, h }) => (
          <GridTile key={it.id} item={it} w={COL_W} h={h} meta={false} onPress={onPress} />
        ))}
      </View>
      <View style={{ width: COL_W }}>
        {chunk.b.map(({ it, h }) => (
          <GridTile key={it.id} item={it} w={COL_W} h={h} meta={false} onPress={onPress} />
        ))}
      </View>
    </View>
  );
});

export default function DiscoverScreen() {
  const router = useRouter();
  const { blocked } = useBlockedIds();

  useTabBack();

  // Swipe: left -> Follow, right -> All Live
  const swipe = useSwipeTabs({
    onSwipeLeft: () => router.replace('/follow'),
    onSwipeRight: () => router.push('/all-live'),
  });

  const [videos, setVideos] = useState(discoverCache.videos);
  const [loading, setLoading] = useState(!discoverCache.at);
  const [refreshing, setRefreshing] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async (force) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const list = await loadDiscover(force);
      setVideos((prev) => (prev === list ? prev : list));
    } catch (e) {
      // network fail: purana data dikhta rahe
    } finally {
      busyRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Focus par: pehle screen dikhe, phir data (cache purana ho tabhi fetch)
  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => load(false));
      return () => task.cancel();
    }, [load])
  );

  const onRefresh = useCallback(() => { setRefreshing(true); load(true); }, [load]);

  const openVideo = useCallback((item) => {
    router.replace({ pathname: '/', params: { vid: item.id, t: String(Date.now()) } });
  }, [router]);

  // 6-6 ke chunk (blocked users hata kar)
  const chunks = useMemo(() => {
    const list = blocked && blocked.size ? videos.filter((v) => !blocked.has(v.userId)) : videos;
    const out = [];
    for (let i = 0; i < list.length; i += 6) {
      const p = PATTERNS[(i / 6) % PATTERNS.length];
      const a = [];
      const b = [];
      for (let k = 0; k < 3; k++) {
        const ia = list[i + k * 2];
        const ib = list[i + k * 2 + 1];
        if (ia) a.push({ it: ia, h: COL_W * p.a[k] });
        if (ib) b.push({ it: ib, h: COL_W * p.b[k] });
      }
      if (a.length || b.length) out.push({ key: `c${i}_${(a[0] || b[0]).it.id}`, a, b });
    }
    return out;
  }, [videos, blocked]);

  const renderChunk = useCallback(
    ({ item }) => <Chunk chunk={item} onPress={openVideo} />,
    [openVideo]
  );
  const keyExtractor = useCallback((c) => c.key, []);

  const empty = useMemo(
    () =>
      loading ? (
        <ActivityIndicator size="large" color="#FFEB00" style={{ marginTop: 60 }} />
      ) : (
        <Text style={styles.empty}>Abhi koi video nahi mila</Text>
      ),
    [loading]
  );

  const refreshControl = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFEB00" colors={['#FFEB00']} />,
    [refreshing, onRefresh]
  );

  return (
    <View style={styles.root} {...swipe}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <View style={styles.header}><TopTabs active="discover" /></View>

      <FlatList
        data={chunks}
        keyExtractor={keyExtractor}
        renderItem={renderChunk}
        contentContainerStyle={styles.content}
        ListEmptyComponent={empty}
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        overScrollMode="never"
      />

      <AppBottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  // For You ke top bar jaisi position -> tab badalne par bar hilta nahi
  header: { paddingTop: Platform.OS === 'ios' ? 50 : 30, paddingBottom: 6, backgroundColor: '#000' },
  content: { paddingHorizontal: GRID_PAD, paddingTop: 4, paddingBottom: 100 },
  cols: { flexDirection: 'row', justifyContent: 'space-between' },
  empty: { color: 'rgba(255,255,255,0.8)', fontSize: 15, textAlign: 'center', marginTop: 120 },
});
