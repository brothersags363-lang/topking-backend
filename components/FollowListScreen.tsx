import useBackStep from '../utils/useBackStep';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRouter } from '../utils/safeRouter';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  startAfter,
  where,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../app/firebaseConfig';
import { notifyNewFollower } from '../utils/pushNotify';
import { fetchDocsByIds } from '../utils/profileHelpers';
import FollowRow, { FOLLOW_ROW_HEIGHT } from './FollowRow';

// Ek baar me sirf 20 log aate hain, neeche scroll karo to agle 20 (infinite scroll).
// Isliye page turant khulta hai - 200 log ek saath load nahi hote.
const PAGE_SIZE = 20;

const keyExtractor = (item) => item.id;
const getItemLayout = (_d, index) => ({
  length: FOLLOW_ROW_HEIGHT,
  offset: FOLLOW_ROW_HEIGHT * index,
  index,
});

/**
 * mode = 'followers' | 'following'
 * params (optional): userId (kisi aur ki list dekhni ho), username (title ke liye)
 */
export default function FollowListScreen({ mode }) {
  const router = useRouter();
  useBackStep('/profile');
  const params = useLocalSearchParams();

  const myId = auth.currentUser?.uid;
  const targetId = (params.userId as string) || myId;
  const username = params.username as string | undefined;
  const isMine = targetId === myId;

  const isFollowers = mode === 'followers';
  const queryField = isFollowers ? 'followingId' : 'followerId'; // jis par filter
  const otherField = isFollowers ? 'followerId' : 'followingId'; // list me jo dikhana hai

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const itemsRef = useRef([]);
  itemsRef.current = items;
  const cursorRef = useRef(null);
  const doneRef = useRef(false);
  const busyRef = useRef(false);

  const loadPage = useCallback(
    async (reset = false) => {
      if (!targetId || busyRef.current) return;
      if (doneRef.current && !reset) return;

      busyRef.current = true;
      if (reset) {
        cursorRef.current = null;
        doneRef.current = false;
      } else {
        setLoadingMore(true);
      }

      try {
        // NOTE: orderBy nahi lagaya taaki Firestore index na banana pade.
        // Newest-first chahiye to orderBy('createdAt','desc') add karo + index bana lo.
        const snap = await getDocs(
          query(
            collection(db, 'follows'),
            where(queryField, '==', targetId),
            ...(cursorRef.current ? [startAfter(cursorRef.current)] : []),
            limit(PAGE_SIZE)
          )
        );

        if (snap.docs.length < PAGE_SIZE) doneRef.current = true;
        if (snap.docs.length) cursorRef.current = snap.docs[snap.docs.length - 1];

        const ids = snap.docs.map((d) => d.data()[otherField]).filter(Boolean);

        // Meri apni list me ek taraf ka status pehle se pata hai -> extra query nahi
        const needMine = !(isMine && !isFollowers);
        const needTheirs = !(isMine && isFollowers);

        const [userMap, mine, theirs] = await Promise.all([
          fetchDocsByIds('users', ids),
          myId && needMine ? fetchDocsByIds('follows', ids.map((id) => `${myId}_${id}`)) : Promise.resolve(new Map()),
          myId && needTheirs ? fetchDocsByIds('follows', ids.map((id) => `${id}_${myId}`)) : Promise.resolve(new Map()),
        ]);

        const rows = [];
        for (const id of ids) {
          const u = userMap.get(id);
          if (!u) continue;
          const d = u.data();
          rows.push({
            id,
            ...d,
            username: d.username || 'user',
            verified: d.verified || false,
            verifiedColor: d.verifiedColor || 'white',
            level: d.level || 1,
            isMe: id === myId,
            iFollow: needMine ? mine.has(`${myId}_${id}`) : true,
            followsMe: needTheirs ? theirs.has(`${id}_${myId}`) : true,
          });
        }

        setItems((prev) => (reset ? rows : [...prev, ...rows]));
      } catch (e) {
        if (__DEV__) console.log('FOLLOW PAGE ERROR =', e);
      } finally {
        busyRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [targetId, myId, queryField, otherField, isMine, isFollowers]
  );

  useEffect(() => {
    loadPage(true);
  }, [loadPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPage(true);
    setRefreshing(false);
  }, [loadPage]);

  // ---- Follow / Unfollow (optimistic: button turant badalta hai) ----
  const toggleFollow = useCallback(
    async (target) => {
      if (!myId || target.id === myId) return;

      const cur = itemsRef.current.find((r) => r.id === target.id);
      const was = !!cur?.iFollow;
      const edgeRef = doc(db, 'follows', `${myId}_${target.id}`);

      const setFlag = (v) =>
        setItems((prev) => prev.map((r) => (r.id === target.id ? { ...r, iFollow: v } : r)));

      setFlag(!was);

      try {
        if (was) {
          await deleteDoc(edgeRef);
        } else {
          await setDoc(edgeRef, { followerId: myId, followingId: target.id, createdAt: Date.now() });
          notifyNewFollower(target.id);
        }
      } catch (e) {
        setFlag(was);
        Alert.alert('Error', 'Kuch gadbad hui, dobara try karo.');
      }
    },
    [myId]
  );

  const confirmToggle = useCallback(
    (target) => {
      if (target.iFollow) {
        Alert.alert(`Unfollow @${target.username}?`, '', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Unfollow', style: 'destructive', onPress: () => toggleFollow(target) },
        ]);
      } else {
        toggleFollow(target);
      }
    },
    [toggleFollow]
  );

  const openProfile = useCallback(
    (userId) => router.push({ pathname: '/userProfile', params: { userId } }),
    [router]
  );

  const openChat = useCallback(
    (item) =>
      router.push({
        pathname: '/chat',
        params: { userId: item.id, username: item.username, profileImg: item.profileImg },
      }),
    [router]
  );

  const renderItem = useCallback(
    ({ item }) => (
      <FollowRow item={item} onOpenProfile={openProfile} onMessage={openChat} onToggle={confirmToggle} />
    ),
    [openProfile, openChat, confirmToggle]
  );

  const title = isFollowers ? 'Followers' : 'Following';

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar backgroundColor="#000" barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.titleBox}>
          <Text style={styles.title}>{title}</Text>
          {!!username && <Text style={styles.subTitle} numberOfLines={1}>@{username}</Text>}
        </View>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFD700" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          onEndReached={() => loadPage(false)}
          onEndReachedThreshold={0.6}
          refreshing={refreshing}
          onRefresh={onRefresh}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 30 }}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color="#FFD700" /> : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {isFollowers
                ? 'Abhi koi follower nahi hai'
                : isMine
                ? 'Aapne abhi kisi ko follow nahi kiya'
                : 'Abhi kisi ko follow nahi kiya'}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 6,
    paddingBottom: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#222',
  },
  backBtn: { width: 40, alignItems: 'center' },
  titleBox: { flex: 1, alignItems: 'center' },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  subTitle: { color: '#888', fontSize: 12, marginTop: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { color: '#777', textAlign: 'center', marginTop: 60, fontSize: 14 },
});
