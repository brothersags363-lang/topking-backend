// app/svip.js
// SVIP page: upar 1..5 stepper, beech me SVIP card (swipe / tap se badlo), niche "Privileges obtained".
// "My Privileges" page me "Available to unlock SVIP n >" dabane par khulta hai: /svip?n=2
// Saara data utils/svip.js me hai.
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import { useRouter } from '../utils/safeRouter';
import { getLevelProgress } from '../utils/levelProgress';
import { SVIP_TIERS, svipPrivileges } from '../utils/svip';
import { SvipBadge, SvipPendant } from '../components/SvipBadge';

const BG = '#121014';
const ROW = '#232129';

// ---------- stepper ka ek node (tircha square + number) ----------
const StepNode = memo(({ n, active, reached, onPress }) => {
  const size = active ? 24 : 18;
  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={st.nodeHit}>
      <View
        style={[
          st.node,
          { width: size, height: size, borderRadius: size * 0.28 },
          active ? st.nodeActive : reached ? st.nodeReached : st.nodeIdle,
        ]}
      >
        <Text style={[st.nodeTxt, active && st.nodeTxtActive, { fontSize: active ? 12 : 10 }]}>{n}</Text>
      </View>
    </TouchableOpacity>
  );
});

// ---------- privileges list ki ek row ----------
const PrivRow = memo(({ item, tier }) => (
  <View style={st.row}>
    <View style={{ flex: 1, paddingRight: 10 }}>
      <Text style={st.rowTitle}>{item.title}</Text>
      {item.sub ? <Text style={st.rowSub}>{item.sub}</Text> : null}
    </View>
    {item.type === 'badge' && <SvipBadge n={tier.n} height={22} />}
    {item.type === 'pendant' && <SvipPendant n={tier.n} size={50} />}
    {item.type === 'icon' && (
      <View style={st.iconCircle}>
        <MaterialCommunityIcons name={item.icon} size={20} color="#F2EEF7" />
      </View>
    )}
  </View>
));

export default function SvipScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams();
  const uid = auth.currentUser?.uid;

  const startIdx = Math.max(0, Math.min(SVIP_TIERS.length - 1, (Number(params.n) || 1) - 1));
  const [idx, setIdx] = useState(startIdx);
  const [wallet, setWallet] = useState({ totalSpent: 0, level: 0 });
  const [photo, setPhoto] = useState(null);
  const pager = useRef(null);

  useEffect(() => {
    if (!uid) return undefined;
    const offW = onSnapshot(doc(db, 'wallets', uid), (snap) => {
      const d = snap.exists() ? snap.data() : {};
      setWallet({ totalSpent: Number(d.totalSpent) || 0, level: Number(d.level) || 0 });
    }, () => {});
    const offU = onSnapshot(doc(db, 'users', uid), (snap) => {
      const d = snap.exists() ? snap.data() : {};
      setPhoto(d.profileImg || d.photoURL || auth.currentUser?.photoURL || null);
    }, () => {});
    return () => { offW(); offU(); };
  }, [uid]);

  // Android par contentOffset kaam nahi karta -> khulte hi sahi SVIP card par le jao
  useEffect(() => {
    if (!startIdx) return undefined;
    const t = setTimeout(() => { try { pager.current?.scrollTo({ x: startIdx * width, animated: false }); } catch (e) {} }, 0);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const level = useMemo(() => getLevelProgress(wallet.totalSpent, wallet.level).level, [wallet.totalSpent, wallet.level]);
  const tier = SVIP_TIERS[idx];
  const privileges = useMemo(() => svipPrivileges(tier), [tier]);

  const cardW = width - 32;
  const goTo = (i) => {
    setIdx(i);
    try { pager.current?.scrollTo({ x: i * width, animated: true }); } catch (e) {}
  };
  const goBack = () => { try { router.canGoBack() ? router.back() : router.replace('/levelPrivileges'); } catch (e) {} };

  return (
    <View style={st.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* upar ka rang SVIP ke hisaab se */}
      <LinearGradient
        colors={tier.header}
        locations={[0, 0.55, 1]}
        style={[st.topGlow, { height: 330 + insets.top }]}
        pointerEvents="none"
      />

      <View style={[st.topBar, { marginTop: insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0) }]}>
        <TouchableOpacity onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* stepper 1 ---- 2 ---- 3 ---- 4 ---- 5 */}
        <View style={st.stepper}>
          {SVIP_TIERS.map((t, i) => (
            <React.Fragment key={t.n}>
              {i > 0 && <View style={[st.stepLine, level >= t.level && st.stepLineOn]} />}
              <StepNode n={t.n} active={i === idx} reached={level >= t.level} onPress={() => goTo(i)} />
            </React.Fragment>
          ))}
        </View>

        {/* SVIP cards (swipe) */}
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: startIdx * width, y: 0 }}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            if (i !== idx && i >= 0 && i < SVIP_TIERS.length) setIdx(i);
          }}
        >
          {SVIP_TIERS.map((t) => {
            const unlocked = level >= t.level;
            return (
              <View key={t.n} style={{ width, paddingHorizontal: 16 }}>
                <LinearGradient
                  colors={t.card}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[st.card, { width: cardW }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[st.cardTitle, { color: t.title }]}>SVIP{t.n}</Text>
                    <Text style={[st.cardSub, { color: t.sub }]}>Level≥{t.level} can unlock the identity</Text>
                    <View style={[st.statusPill, { borderColor: t.title }]}>
                      {unlocked ? (
                        <Ionicons name="checkmark-circle" size={12} color={t.title} />
                      ) : (
                        <Ionicons name="lock-closed" size={11} color={t.title} />
                      )}
                      <Text style={[st.statusTxt, { color: t.title }]}>
                        {unlocked ? 'Unlocked' : `Lv.${level} / ${t.level}`}
                      </Text>
                    </View>
                  </View>
                  {/* emblem: SVIP frame me apni DP (aisa dikhega) */}
                  <SvipPendant n={t.n} size={108} uri={photo} />
                </LinearGradient>
              </View>
            );
          })}
        </ScrollView>

        <Text style={st.sectionTitle}>Privileges obtained</Text>
        <View style={{ paddingHorizontal: 16 }}>
          {privileges.map((p) => (
            <PrivRow key={p.key} item={p} tier={tier} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  topGlow: { position: 'absolute', left: 0, right: 0, top: 0 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 48 },

  stepper: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, marginTop: 6, marginBottom: 18 },
  stepLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.22)', marginHorizontal: 4 },
  stepLineOn: { backgroundColor: 'rgba(255,255,255,0.7)' },
  nodeHit: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  node: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  nodeActive: { backgroundColor: '#F4EEE8', borderColor: '#fff' },
  nodeReached: { backgroundColor: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.7)' },
  nodeIdle: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.35)' },
  nodeTxt: { color: 'rgba(255,255,255,0.85)', fontWeight: '800' },
  nodeTxtActive: { color: '#3A2A22' },

  card: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingLeft: 18, paddingRight: 8,
    height: 132, overflow: 'hidden',
  },
  cardTitle: { fontSize: 30, fontWeight: '900', fontStyle: 'italic', letterSpacing: 0.5 },
  cardSub: { fontSize: 12.5, fontWeight: '600', marginTop: 4 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 12,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, height: 20,
  },
  statusTxt: { fontSize: 11, fontWeight: '700', marginLeft: 4 },

  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginHorizontal: 16, marginTop: 24, marginBottom: 12 },

  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: ROW, borderRadius: 10,
    paddingHorizontal: 14, minHeight: 64, marginBottom: 9,
  },
  rowTitle: { color: '#F2F0F6', fontSize: 14.5, fontWeight: '600' },
  rowSub: { color: '#8D8A96', fontSize: 12, marginTop: 3 },
  iconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#4A4650', alignItems: 'center', justifyContent: 'center' },
});
