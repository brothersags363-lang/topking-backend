import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from '../utils/safeRouter';

import { db } from './firebaseConfig';
import {
  collection,
  query,
  getDocs,
  limit,
  orderBy,
  doc,
  getDoc,
  runTransaction,
} from 'firebase/firestore';
import UserTick, { isFaceVerified } from '../components/UserTick';
import Image from '../components/FastImage';
import { useBlockedIds } from '../utils/useBlockedIds';

/* ------------------------------------------------------------------ */
/*  TopKing Star - View All (is mahine ke top stars + unki rank)        */
/*  Logic explore.tsx ke TopKing Star jaisa hi hai:                     */
/*  is mahine ke stars = abhi ka receivedStars - mahine ki starting     */
/*  baseline (star_baseline/<mahina>)                                   */
/* ------------------------------------------------------------------ */

const DEFAULT_AVATAR = 'https://avatar.iran.liara.run/public/65';
const BASE_SIZE = 50; // explore.tsx jaisa hi snapshot size
const LIST_SIZE = 100; // kitne wallets compare karne hain
const FIELD = 'receivedStars';
const IST_OFFSET = 5.5 * 60 * 60 * 1000;

const getMonthKey = (ts = Date.now()) => {
  const d = new Date(ts + IST_OFFSET);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const getDaysLeftInMonth = () => {
  const d = new Date(Date.now() + IST_OFFSET);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return last - d.getUTCDate() + 1;
};

const fmtStars = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
};

// Baseline: pehle se bana ho to padho, warna explore.tsx jaisa transaction se banao
const getBaseline = async (monthKey: string) => {
  const ref = doc(db, 'star_baseline', monthKey);
  let base: Record<string, number> | null = null;

  const snap = await getDoc(ref);
  if (snap.exists()) {
    base = snap.data().base || {};
  } else {
    const top = await getDocs(
      query(collection(db, 'wallets'), orderBy(FIELD, 'desc'), limit(BASE_SIZE))
    );
    const fresh: Record<string, number> = {};
    top.docs.forEach((d) => {
      fresh[d.id] = d.data()[FIELD] || 0;
    });
    base = await runTransaction(db, async (tx) => {
      const again = await tx.get(ref);
      if (again.exists()) return again.data().base || {};
      tx.set(ref, { base: fresh, createdAt: Date.now() });
      return fresh;
    });
  }
  const b = base || {};
  const vals = Object.values(b) as number[];
  const floor = vals.length >= BASE_SIZE ? Math.min(...vals) : 0;
  return { base: b, floor };
};

const loadTopStars = async () => {
  const monthKey = getMonthKey();
  const [{ base, floor }, snap] = await Promise.all([
    getBaseline(monthKey),
    getDocs(query(collection(db, 'wallets'), orderBy(FIELD, 'desc'), limit(LIST_SIZE))),
  ]);

  const ranked = snap.docs
    .map((d) => ({
      id: d.id,
      stars: Math.max(0, ((d.data() as any)[FIELD] || 0) - (base[d.id] ?? floor)),
    }))
    .filter((x) => x.stars > 0)
    .sort((a, b) => b.stars - a.stars);

  const rows = await Promise.all(
    ranked.map(async (r) => {
      try {
        const s = await getDoc(doc(db, 'users', r.id));
        if (!s.exists()) return null;
        const d: any = s.data();
        return {
          id: r.id,
          stars: r.stars,
          name: d.username || d.name || 'user',
          img: d.profileImg || '',
          verified: !!d.verified,
          verifiedColor: d.verifiedColor,
          faceVerified: isFaceVerified(d),
        };
      } catch (e) {
        return null;
      }
    })
  );
  return rows.filter(Boolean) as any[];
};

/* ------------------------------------------------------------------ */

const RANK_COLORS = ['#FFD700', '#E3E8EE', '#E39A55'];

const Row = memo(function Row({
  item,
  index,
  onPress,
}: {
  item: any;
  index: number;
  onPress: (id: string) => void;
}) {
  const top = index < 3;
  const color = top ? RANK_COLORS[index] : 'rgba(255,255,255,0.5)';
  return (
    <TouchableOpacity
      style={[s.row, top && { borderColor: color + '55' }]}
      activeOpacity={0.7}
      onPress={() => onPress(item.id)}
    >
      <View style={s.rankCol}>
        {top && <MaterialCommunityIcons name="crown" size={14} color={color} />}
        <Text style={[s.rankNum, { color }]}>{index + 1}</Text>
      </View>

      <Image
        source={{ uri: item.img || DEFAULT_AVATAR }}
        style={[s.avatar, top && { borderColor: color, borderWidth: 2 }]}
      />

      <View style={s.nameWrap}>
        <Text style={s.name} numberOfLines={1}>
          {item.name}
        </Text>
        <UserTick
          uid={item.id}
          verified={item.verified}
          verifiedColor={item.verifiedColor}
          faceVerified={item.faceVerified}
          size={14}
          whiteColor="#f8fbff"
        />
      </View>

      <View style={s.starsWrap}>
        <MaterialCommunityIcons name="star" size={16} color="#FFC107" />
        <Text style={s.stars}>{fmtStars(item.stars)}</Text>
      </View>
    </TouchableOpacity>
  );
});

export default function TopKingStarPage() {
  const router = useRouter();
  const { blocked: blockedIds } = useBlockedIds();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await loadTopStars());
    } catch (e) {
      console.log(e);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const data = useMemo(() => rows.filter((r) => !blockedIds.has(r.id)), [rows, blockedIds]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const openUser = useCallback(
    (id: string) => router.push({ pathname: '/userProfile', params: { userId: id } } as any),
    [router]
  );

  const renderItem = useCallback(
    ({ item, index }: any) => <Row item={item} index={index} onPress={openUser} />,
    [openUser]
  );

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>TopKing Star</Text>
        <Text style={s.sub}>This Month · {getDaysLeftInMonth()}d left</Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#f1c40f" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          windowSize={7}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f1c40f" />
          }
          ListEmptyComponent={<Text style={s.empty}>Is mahine abhi koi nahi</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#08080a',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '800', marginLeft: 12, flex: 1 },
  sub: { color: '#f1c40f', fontSize: 12, fontWeight: '700' },
  content: { padding: 14, paddingBottom: 60 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161619',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  rankCol: { width: 30, alignItems: 'center', justifyContent: 'center' },
  rankNum: { fontWeight: '900', fontSize: 18, fontStyle: 'italic' },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginHorizontal: 10,
    backgroundColor: '#222',
  },
  nameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  name: { color: '#fff', fontWeight: '800', fontSize: 15, flexShrink: 1 },
  starsWrap: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  stars: { color: '#fff', fontWeight: '700', fontSize: 14, marginLeft: 4 },
  empty: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 40,
  },
});
