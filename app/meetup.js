// app/meetup.js — Meetup page (explore ke "Meetup" button se khulta hai)
// Naye logon se milo: users ki 2-column grid, search box, pull-to-refresh.
// Kisi par tap => uska profile (/userProfile) khulta hai.
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db, auth } from './firebaseConfig';
import { useRouter } from '../utils/safeRouter';
import { useBlockedIds } from '../utils/useBlockedIds';
import Image from '../components/FastImage';

const { width } = Dimensions.get('window');
const PAD = 14;
const GAP = 12;
const CARD_W = Math.floor((width - PAD * 2 - GAP) / 2);
const DEFAULT_AVATAR = 'https://avatar.iran.liara.run/public/65';
const PAGE = 40;

// module level cache => dobara kholne par turant dikhta hai
let meetupCache = { ts: 0, users: [] };
const CACHE_TTL = 60 * 1000;

const UserTile = memo(function UserTile({ item, onPress }) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => onPress(item.id)}>
      <Image source={{ uri: item.profileImg || DEFAULT_AVATAR }} style={styles.avatar} />
      <Text style={styles.username} numberOfLines={1}>
        @{item.username || item.name || 'user'}
      </Text>
      {!!item.name && item.username ? (
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
      ) : null}
      <View style={styles.meetBtn}>
        <Ionicons name="people" size={13} color="#000" />
        <Text style={styles.meetBtnText}>Meet</Text>
      </View>
    </TouchableOpacity>
  );
});

export default function MeetupScreen() {
  const router = useRouter();
  const { blocked } = useBlockedIds();

  const [users, setUsers] = useState(meetupCache.users);
  const [loading, setLoading] = useState(!meetupCache.users.length);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const aliveRef = useRef(true);

  const load = useCallback(async (force = false) => {
    if (!force && meetupCache.users.length && Date.now() - meetupCache.ts < CACHE_TTL) {
      setLoading(false);
      return;
    }
    try {
      const snap = await getDocs(query(collection(db, 'users'), limit(PAGE)));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => u.username || u.name);
      meetupCache = { ts: Date.now(), users: list };
      if (aliveRef.current) setUsers(list);
    } catch (e) {
      console.log('Meetup load error:', e);
    } finally {
      if (aliveRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    load(false);
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const goBack = useCallback(() => {
    try {
      if (router.canGoBack()) router.back();
      else router.replace('/explore');
    } catch (e) {
      router.replace('/explore');
    }
  }, [router]);

  const openUser = useCallback(
    (id) => router.push({ pathname: '/userProfile', params: { userId: id } }),
    [router]
  );

  const data = useMemo(() => {
    const myUid = auth.currentUser?.uid;
    const term = search.trim().replace(/^[@#]+/, '').toLowerCase();
    return users.filter((u) => {
      if (u.id === myUid) return false; // khud ko mat dikhao
      if (blocked && blocked.has(u.id)) return false;
      if (!term) return true;
      return (
        String(u.username || '').toLowerCase().includes(term) ||
        String(u.name || '').toLowerCase().includes(term)
      );
    });
  }, [users, blocked, search]);

  const renderItem = useCallback(
    ({ item }) => <UserTile item={item} onPress={openUser} />,
    [openUser]
  );
  const keyExtractor = useCallback((u) => u.id, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Meetup</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color="rgba(255,255,255,0.55)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search people"
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FFD700"
            colors={['#FFD700']}
          />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color="#FFD700" style={{ marginTop: 60 }} />
          ) : (
            <Text style={styles.empty}>Abhi koi nahi mila</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: PAD, paddingVertical: 12 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', marginLeft: 10 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1d',
    borderRadius: 14,
    marginHorizontal: PAD,
    marginBottom: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, marginLeft: 8 },
  content: { paddingHorizontal: PAD, paddingBottom: 40 },
  column: { justifyContent: 'space-between', marginBottom: GAP },
  card: {
    width: CARD_W,
    backgroundColor: '#11121a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  avatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: '#f1c40f', backgroundColor: '#222' },
  username: { color: '#fff', fontWeight: '800', fontSize: 13, marginTop: 10, maxWidth: '100%' },
  name: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2, maxWidth: '100%' },
  meetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD700',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 12,
  },
  meetBtnText: { color: '#000', fontWeight: '800', fontSize: 12, marginLeft: 5 },
  empty: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 60 },
});
