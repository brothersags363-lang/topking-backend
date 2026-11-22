// app/levelPrivileges.js
// "My Privileges" page: apna level, progress bar, aur har level par milne wale privileges.
// Profile me level badge dabane par yahi page khulta hai (LevelBadge tappable).
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, Alert, SafeAreaView, Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { FRAME_IMAGES } from '../components/LevelFrame';
import { Stack } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import { useRouter } from '../utils/safeRouter';
import { getLevelProgress } from '../utils/levelProgress';
import LevelBadge, { LevelGem } from '../components/LevelBadge';
import { levelThemeFor, PRIVILEGE_TIERS, PRIVILEGE_LABEL } from '../utils/levelTheme';

const BG = '#14121A';
const CARD = '#211F29';
const YELLOW = '#F2D32B';
const GREEN = '#2FD6B0';
const COLLAPSED_TIERS = 3; // "Fold" me itne tiers dikhte hain

// ---------- right side ke chhote visuals ----------
// Avatar pendant: level ka asli frame (animated) dikhta hai. Frame na ho to simple ring.
const PendantIcon = ({ color, frame }) => {
  const src = frame ? FRAME_IMAGES.ANIM[frame] || FRAME_IMAGES.STATIC[frame] : null;
  if (src) {
    return (
      <View style={s.frameBox}>
        <ExpoImage source={src} contentFit="contain" autoplay cachePolicy="memory-disk" style={s.frameImg} />
      </View>
    );
  }
  return (
    <View style={[s.pendant, { borderColor: color }]}>
      <View style={[s.pendantDot, { backgroundColor: color }]} />
    </View>
  );
};

// Entry banner: gradient frame ke rang jaisa
const EntryBanner = ({ name, colors, edge }) => (
  <LinearGradient
    colors={colors || ['#3A2A6B', '#7B4BD6']}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 0 }}
    style={[s.banner, edge ? { borderWidth: 1, borderColor: edge } : null]}
  >
    <View style={s.bannerAvatar}>
      <Ionicons name="person" size={9} color="#fff" />
    </View>
    <Text style={s.bannerTxt} numberOfLines={1}>{name} has joined</Text>
  </LinearGradient>
);

const FamilyIcon = () => (
  <View style={s.family}>
    <MaterialCommunityIcons name="trophy" size={20} color="#E8E4EE" />
  </View>
);

const SvipChip = ({ label }) => (
  <LinearGradient colors={['#C4380F', '#F7A02C']} style={s.svip}>
    <MaterialCommunityIcons name="crown" size={13} color="#FFE9A8" />
    <Text style={s.svipTxt}>{label.replace(' ', '')}</Text>
  </LinearGradient>
);

// ---------- ek privilege row ----------
const Row = ({ type, tier, username }) => {
  const theme = levelThemeFor(tier.level);

  if (type === 'svip') {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        style={s.row}
        onPress={() => Alert.alert(tier.svip || 'SVIP', `Level ${tier.level} par ${tier.svip || 'SVIP'} unlock hota hai.`)}
      >
        <Text style={[s.rowTxt, { color: YELLOW }]}>Available to unlock {tier.svip} {'>'}</Text>
        <SvipChip label={tier.svip || 'SVIP 1'} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={[s.row, type === 'pendant' && tier.frame ? { minHeight: 76 } : null]}>
      <Text style={s.rowTxt}>{PRIVILEGE_LABEL[type]}</Text>
      {type === 'badge' && <LevelBadge level={tier.level} size={11} />}
      {type === 'pendant' && <PendantIcon color={theme.gem} frame={tier.frame} />}
      {type === 'banner' && <EntryBanner name={username} colors={tier.banner} edge={tier.bannerEdge} />}
      {type === 'family' && <FamilyIcon />}
    </View>
  );
};

export default function LevelPrivileges() {
  const router = useRouter();
  const uid = auth.currentUser?.uid;

  const [wallet, setWallet] = useState({ totalSpent: 0, level: 0 });
  const [username, setUsername] = useState('user');
  const [unfold, setUnfold] = useState(true);

  useEffect(() => {
    if (!uid) return undefined;
    const offW = onSnapshot(doc(db, 'wallets', uid), (snap) => {
      const d = snap.exists() ? snap.data() : {};
      setWallet({ totalSpent: Number(d.totalSpent) || 0, level: Number(d.level) || 0 });
    }, () => {});
    const offU = onSnapshot(doc(db, 'users', uid), (snap) => {
      const d = snap.exists() ? snap.data() : {};
      setUsername(d.username || auth.currentUser?.email?.split('@')[0] || 'user');
    }, () => {});
    return () => { offW(); offU(); };
  }, [uid]);

  const info = useMemo(
    () => getLevelProgress(wallet.totalSpent, wallet.level),
    [wallet.totalSpent, wallet.level]
  );

  const tiers = unfold ? PRIVILEGE_TIERS : PRIVILEGE_TIERS.slice(0, COLLAPSED_TIERS);

  const goBack = () => { try { router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'); } catch (e) {} };
  const goUpgrade = () => { try { router.push('/wallet'); } catch (e) {} };
  const showHelp = () =>
    Alert.alert('Level kaise badhta hai?', 'Gifts / stars kharch karne par aapka level badhta hai. Level badhne par naye privileges unlock hote hain.');

  return (
    <SafeAreaView style={s.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={showHelp} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="help-circle-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* level card */}
        <View style={s.levelCard}>
          <Text style={s.uname} numberOfLines={1}>{username}</Text>
          <Text style={s.lvTxt}>Lv.{info.level}</Text>

          <View style={s.gemWrap} pointerEvents="none">
            <LevelGem level={info.level} size={92} />
          </View>

          <View style={s.cardBottom}>
            <Text style={s.starsTxt}>
              {info.isMax ? 'Max level reached' : `+ ${info.starsToUpgrade} stars to reach Lv. ${info.nextLevel}`}
            </Text>
            {!info.isMax && (
              <TouchableOpacity onPress={goUpgrade} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.upgradeTxt}>Upgrade {'>'}</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.round(info.progress * 100)}%` }]} />
          </View>
        </View>

        {/* privileges */}
        <View style={s.privHead}>
          <Text style={s.privTitle}>My Privileges</Text>
          <TouchableOpacity onPress={() => setUnfold((v) => !v)} style={s.unfoldBtn}>
            <Text style={s.unfoldTxt}>{unfold ? 'Fold' : 'Unfold'}</Text>
            <Ionicons name={unfold ? 'chevron-up' : 'chevron-down'} size={14} color="#9A98A3" />
          </TouchableOpacity>
        </View>

        <View style={s.timeline}>
          {tiers.map((tier, idx) => {
            const unlocked = info.level >= tier.level;
            const isLast = idx === tiers.length - 1;
            return (
              <View key={tier.level} style={s.tierBlock}>
                {/* dotted line */}
                {!isLast && <View style={s.dotLine} />}

                <View style={s.tierHead}>
                  {unlocked ? (
                    <View style={s.checkDot}>
                      <Ionicons name="checkmark" size={13} color="#0E2B26" />
                    </View>
                  ) : (
                    <Ionicons name="lock-closed" size={15} color="#6E6C78" style={{ width: 20, textAlign: 'center' }} />
                  )}
                  <Text style={[s.tierLabel, unlocked && { color: '#fff' }]}>LV.{tier.level}</Text>
                </View>

                <View style={s.rows}>
                  {tier.items.map((type) => (
                    <Row key={type} type={type} tier={tier} username={username} />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, height: 48 },

  levelCard: {
    marginHorizontal: 16, marginTop: 8, padding: 16, borderRadius: 14,
    backgroundColor: '#2A2733', overflow: 'visible',
  },
  uname: { color: YELLOW, fontSize: 18, fontWeight: '800', maxWidth: '60%' },
  lvTxt: { color: YELLOW, fontSize: 12, fontWeight: '700', marginTop: 6 },
  gemWrap: { position: 'absolute', right: 14, top: -26 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 26 },
  starsTxt: { color: '#8D8B98', fontSize: 12 },
  upgradeTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  track: { height: 4, borderRadius: 2, backgroundColor: '#3E3B49', marginTop: 8, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: '#FFF1B8' },

  privHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginTop: 24, marginBottom: 12 },
  privTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  unfoldBtn: { flexDirection: 'row', alignItems: 'center' },
  unfoldTxt: { color: '#9A98A3', fontSize: 12, marginRight: 2 },

  timeline: { paddingHorizontal: 16 },
  tierBlock: { paddingLeft: 0, marginBottom: 6 },
  dotLine: {
    position: 'absolute', left: 9, top: 26, bottom: -6, width: 0,
    borderLeftWidth: 1, borderLeftColor: '#4A4753', borderStyle: 'dashed',
  },
  tierHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginTop: 6 },
  checkDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  tierLabel: { color: '#8D8B98', fontSize: 14, fontWeight: '800', marginLeft: 10 },
  rows: { marginLeft: 30 },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: CARD, borderRadius: 10, paddingHorizontal: 14, minHeight: 52, marginBottom: 8,
  },
  rowTxt: { color: '#EDEBF2', fontSize: 13, flexShrink: 1, paddingRight: 10 },

  pendant: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'flex-start' },
  frameBox: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  frameImg: { width: 64, height: 64 },
  pendantDot: { width: 6, height: 6, borderRadius: 3, marginTop: -4 },
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 5, height: 22, maxWidth: 150 },
  bannerAvatar: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#1C1A22', alignItems: 'center', justifyContent: 'center' },
  bannerTxt: { color: '#fff', fontSize: 9, fontWeight: '700', marginLeft: 5, flexShrink: 1 },
  family: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#4A433F', alignItems: 'center', justifyContent: 'center' },
  svip: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 8, height: 24 },
  svipTxt: { color: '#fff', fontSize: 11, fontWeight: '800', marginLeft: 3, fontStyle: 'italic' },
});
