// app/(tabs)/follow.js — Follow page (live row + 2 column grid)
// Cache se TURANT khulta hai, peeche se chupchap refresh.
// Back: jahan se aaye wahin wapas (useTabBack).
import React, { useCallback, useMemo, useRef, useState, memo } from 'react';
import {
  View, Text, FlatList, StyleSheet, Platform, StatusBar,
  RefreshControl, ActivityIndicator, InteractionManager, Dimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { auth } from '../firebaseConfig';
import { useBlockedIds } from '../../utils/useBlockedIds';
import useTabBack from '../../utils/useTabBack';
import useSwipeTabs from '../../utils/useSwipeTabs';
import { loadFollow, followCache } from '../../utils/homeData';
import BottomNav from '../../components/BottomNav';
import TopTabs from '../../components/TopTabs';
import { GridTile, LiveBubble, GRID_GAP, GRID_PAD } from '../../components/GridParts';

const { width } = Dimensions.get('window');
const TILE_W = (width - GRID_PAD * 2 - GRID_GAP) / 2;
const TILE_H = TILE_W * 1.55;

// Live row alag memo component: videos badalne par ye dobara render nahi hota
const LiveRow = memo(function LiveRow({ lives, onPress }) {
  const renderLive = useCallback(({ item }) => <LiveBubble st={item} onPress={onPress} />, [onPress]);
  const keyLive = useCallback((l) => String(l.id), []);
  return (
    <FlatList
      data={lives}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={keyLive}
      renderItem={renderLive}
      contentContainerStyle={styles.liveRow}
      initialNumToRender={5}
      maxToRenderPerBatch={4}
      windowSize={3}
      removeClippedSubviews
      overScrollMode="never"
    />
  );
});

export default function FollowScreen() {
  const router = useRouter();
  const { blocked } = useBlockedIds();
  const uid = auth.currentUser?.uid || null;

  useTabBack();

  // Swipe: right -> Discover, left -> For You (home)
  const swipe = useSwipeTabs({
    onSwipeRight: () => router.replace('/discover'),
    onSwipeLeft: () => router.replace('/'),
  });

  const fresh = followCache.uid === uid;
  const [videos, setVideos] = useState(fresh ? followCache.videos : []);
  const [lives, setLives] = useState(fresh ? followCache.lives : []);
  const [loading, setLoading] = useState(!(fresh && followCache.at));
  const [refreshing, setRefreshing] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async (force) => {
    if (!uid) { setLoading(false); setRefreshing(false); return; }
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const res = await loadFollow(uid, force);
      setVideos((prev) => (prev === res.videos ? prev : res.videos));
      setLives((prev) => (prev === res.lives ? prev : res.lives));
    } catch (e) {
      // network fail: purana data dikhta rahe
    } finally {
      busyRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid]);

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

  const openLive = useCallback((st) => {
    if (st.type === 'video') router.push({ pathname: '/videolive', params: { id: st.id, role: 'viewer' } });
    else if (st.layout === 'multiguest') router.push({ pathname: '/MultiGuestRoom', params: { id: st.id } });
    else router.push({ pathname: '/LiveRoom', params: { id: st.id, from: 'alllive', layout: st.layout } });
  }, [router]);

  const shownVideos = useMemo(
    () => (blocked && blocked.size ? videos.filter((v) => !blocked.has(v.userId)) : videos),
    [videos, blocked]
  );
  const shownLives = useMemo(
    () => (blocked && blocked.size ? lives.filter((l) => !blocked.has(l.hostId)) : lives),
    [lives, blocked]
  );

  const renderItem = useCallback(
    ({ item }) => <GridTile item={item} w={TILE_W} h={TILE_H} meta onPress={openVideo} />,
    [openVideo]
  );
  const keyVideo = useCallback((v) => String(v.id), []);

  const header = useMemo(
    () => (shownLives.length ? <LiveRow lives={shownLives} onPress={openLive} /> : null),
    [shownLives, openLive]
  );

  const empty = useMemo(
    () =>
      loading ? (
        <ActivityIndicator size="large" color="#FFEB00" style={{ marginTop: 60 }} />
      ) : (
        <Text style={styles.empty}>
          {uid ? 'Jin ko aap follow karte ho unke videos yahan dikhenge' : 'Follow dekhne ke liye login karo'}
        </Text>
      ),
    [loading, uid]
  );

  const refreshControl = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFEB00" colors={['#FFEB00']} />,
    [refreshing, onRefresh]
  );

  return (
    <View style={styles.root} {...swipe}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <View style={styles.header}><TopTabs active="follow" /></View>

      <FlatList
        data={shownVideos}
        numColumns={2}
        keyExtractor={keyVideo}
        renderItem={renderItem}
        columnWrapperStyle={styles.col}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        overScrollMode="never"
      />

      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: { paddingTop: Platform.OS === 'ios' ? 50 : 30, paddingBottom: 6, backgroundColor: '#000' },
  content: { paddingBottom: 100 },
  liveRow: { paddingHorizontal: GRID_PAD, paddingBottom: 12 },
  col: { justifyContent: 'space-between', paddingHorizontal: GRID_PAD },
  empty: { color: 'rgba(255,255,255,0.8)', fontSize: 15, textAlign: 'center', marginTop: 120, paddingHorizontal: 40 },
});
