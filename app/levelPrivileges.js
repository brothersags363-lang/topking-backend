// app/levelPrivileges.js
// "My Privileges" page: apna level, progress bar, aur har level par milne wale privileges.
// Profile me level badge dabane par yahi page khulta hai (LevelBadge tappable).
// SVIP row dabane par /svip page (SVIP 1..5 ki details) khulta hai.
import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, Alert, Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import { FRAME_IMAGES, FramePreview } from '../components/LevelFrame';
import { useRouter } from '../utils/safeRouter';
import { getLevelProgress } from '../utils/levelProgress';
import LevelBadge, { LevelGem } from '../components/LevelBadge';
import { SvipBadge } from '../components/SvipBadge';
import { PRIVILEGE_TIERS, PRIVILEGE_LABEL } from '../utils/levelTheme';

const BG = '#1C1B23';
const CARD = '#2A2933';
const YELLOW = '#F5D33A';
const GREEN = '#36D1C4';
const MUTED = '#8E8C99';
const FALLBACK_AVATAR = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
const COLLAPSED_TIERS = 2; // "Fold" me itne tiers dikhte hain (apna + agla)

// ---------- right side ke visuals ----------
// Avatar pendant: us level ka asli frame (screenshot jaisa khaali frame)
const PendantIcon = memo(({ frame }) => {
  const src = frame ? FRAME_IMAGES.STATIC[frame] : null;
  if (!src) return null;
  return <FramePreview source={src} size={50} />;
});

// Entry banner: user ki DP + "naam has joined" (live room ki entry jaisa)
const EntryBanner = memo(({ name, photo, colors, edge }) => (
  <View style={s.bannerWrap}>
    <LinearGradient
      colors={colors || ['#3A2A6B', '#7B4BD6']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[s.banner, { borderColor: edge || 'rgba(255,255,255,0.35)' }]}
    >
      <Text style={s.bannerTxt} numberOfLines={1}>{name} has joined</Text>
    </LinearGradient>
    <View style={[s.bannerAvatarRing, { borderColor: edge || '#fff' }]}>
      <ExpoImage
        source={{ uri: photo || FALLBACK_AVATAR }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
        style={s.bannerAvatar}
      />
    </View>
  </View>
));

const FamilyIcon = () => (
  <View style={s.family}>
    <MaterialCommunityIcons name="trophy-variant" size={19} color="#F1EEF6" />
  </View>
);

// ---------- ek privilege row ----------
const Row = memo(({ type, tier, username, photo, onSvip }) => {
  if (type === 'svip') {
    return (
      <TouchableOpacity activeOpacity={0.8} style={s.row} onPress={() => onSvip(tier.svip)}>
        <Text style={[s.rowTxt, { color: YELLOW }]}>Available to unlock SVIP {tier.svip} {'>'}</Text>
        <SvipBadge n={tier.svip} height={24} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={[s.row, type === 'pendant' && { minHeight: 60 }]}>
      <Text style={s.rowTxt}>{PRIVILEGE_LABEL[type]}</Text>
      {type === 'badge' && <LevelBadge level={tier.level} size={11} />}
      {type === 'pendant' && <PendantIcon frame={tier.frame} />}
      {type === 'banner' && <EntryBanner name={username} photo={photo} colors={tier.banner} edge={tier.bannerEdge} />}
      {type === 'family' && <FamilyIcon />}
    </View>
  );
});

// dashed line (Android par single-side dashed border theek nahi banti -> ye trick)
const DashLine = () => (
  <View style={s.dashClip}>
    <View style={s.dashInner} />
  </View>
);

export default function LevelPrivileges() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const uid = auth.currentUser?.uid;

  const [wallet, setWallet] = useState({ totalSpent: 0, level: 0 });
  const [profile, setProfile] = useState({ username: 'user', photo: null });
  const [unfold, setUnfold] = useState(false);

  useEffect(() => {
    if (!uid) return undefined;
    const offW = onSnapshot(doc(db, 'wallets', uid), (snap) => {
      const d = snap.exists() ? snap.data() : {};
      setWallet({ totalSpent: Number(d.totalSpent) || 0, level: Number(d.level) || 0 });
    }, () => {});
    const offU = onSnapshot(doc(db, 'users', uid), (snap) => {
      const d = snap.exists() ? snap.data() : {};
      setProfile({
        username: d.username || auth.currentUser?.email?.split('@')[0] || 'user',
        photo: d.profileImg || d.photoURL || auth.currentUser?.photoURL || null,
      });
    }, () => {});
    return () => { offW(); offU(); };
  }, [uid]);

  const info = useMemo(
    () => getLevelProgress(wallet.totalSpent, wallet.level),
    [wallet.totalSpent, wallet.level]
  );

  // Fold: sirf aakhri khula tier + agla band tier (screenshot jaisa). Unfold: sab.
  const tiers = useMemo(() => {
    if (unfold) return PRIVILEGE_TIERS;
    let i = -1;
    PRIVILEGE_TIERS.forEach((t, idx) => { if (info.level >= t.level) i = idx; });
    const from = Math.max(0, i);
    return PRIVILEGE_TIERS.slice(from, from + COLLAPSED_TIERS);
  }, [unfold, info.level]);

  const goBack = () => { try { router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'); } catch (e) {} };
  const goUpgrade = () => { try { router.push('/wallet'); } catch (e) {} };
  const openSvip = (n) => { try { router.push({ pathname: '/svip', params: { n: String(n || 1) } }); } catch (e) {} };
  const showHelp = () =>
    Alert.alert('Level kaise badhta hai?', 'Gifts / stars kharch karne par aapka level badhta hai. Level badhne par naye privileges unlock hote hain.');

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* upar ka purple glow (screenshot jaisa) */}
      <LinearGradient
        colors={['#4B3F8C', '#2E2852', BG]}
        locations={[0, 0.55, 1]}
        style={[s.topGlow, { height: 300 + insets.top }]}
        pointerEvents="none"
      />

      {/* top bar */}
      <View style={[s.topBar, { marginTop: insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0) }]}>
        <TouchableOpacity onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={showHelp} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="help-circle-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* level card */}
        <View style={s.levelCard}>
          <Text style={s.uname} numberOfLines={1}>{profile.username}</Text>
          <Text style={s.lvTxt}>Lv.{info.level}</Text>

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
            <LinearGradient
              colors={['#FFFFFF', '#FFE58A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[s.fill, { width: `${Math.max(2, Math.round(info.progress * 100))}%` }]}
            />
          </View>
        </View>

        {/* bada gem card ke upar-right (card ke bahar nikla hua) */}
        <View style={s.gemWrap} pointerEvents="none">
          <View style={s.gemGlow} />
          <LevelGem level={Math.max(1, info.level)} size={96} />
        </View>

        {/* privileges */}
        <View style={s.privHead}>
          <Text style={s.privTitle}>My Privileges</Text>
          <TouchableOpacity onPress={() => setUnfold((v) => !v)} style={s.unfoldBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.unfoldTxt}>{unfold ? 'Fold' : 'Unfold'}</Text>
            <Ionicons name={unfold ? 'chevron-up' : 'chevron-down'} size={14} color={MUTED} />
          </TouchableOpacity>
        </View>

        <View style={s.timeline}>
          {tiers.map((tier, idx) => {
            const unlocked = info.level >= tier.level;
            const isLast = idx === tiers.length - 1;
            return (
              <View key={tier.level} style={s.tierBlock}>
                <View style={s.rail}>
                  {unlocked ? (
                    <View style={s.checkDot}>
                      <Ionicons name="checkmark" size={12} color="#0D2A27" />
                    </View>
                  ) : (
                    <View style={s.lockDot}>
                      <Ionicons name="lock-closed" size={13} color="#6E6C78" />
                    </View>
                  )}
                  {!isLast && <DashLine />}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[s.tierLabel, unlocked && { color: '#fff' }]}>LV.{tier.level}</Text>
                  {tier.items.map((type) => (
                    <Row
                      key={type}
                      type={type}
                      tier={tier}
                      username={profile.username}
                      photo={profile.photo}
                      onSvip={openSvip}
                    />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  topGlow: { position: 'absolute', left: 0, right: 0, top: 0 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, height: 48 },

  levelCard: {
    marginHorizontal: 16, marginTop: 34, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, borderRadius: 14,
    backgroundColor: 'rgba(40,36,62,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  uname: { color: '#fff', fontSize: 19, fontWeight: '800', maxWidth: '62%' },
  lvTxt: { color: YELLOW, fontSize: 13, fontWeight: '700', marginTop: 4 },
  gemWrap: { position: 'absolute', right: 26, top: 6, width: 110, height: 110, alignItems: 'center', justifyContent: 'center' },
  gemGlow: { position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(160,170,255,0.18)' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 26 },
  starsTxt: { color: MUTED, fontSize: 12 },
  upgradeTxt: { color: YELLOW, fontSize: 13, fontWeight: '700' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', marginTop: 8, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },

  privHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginTop: 22, marginBottom: 10 },
  privTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  unfoldBtn: { flexDirection: 'row', alignItems: 'center' },
  unfoldTxt: { color: MUTED, fontSize: 13, marginRight: 2 },

  timeline: { paddingHorizontal: 14 },
  tierBlock: { flexDirection: 'row' },
  rail: { width: 22, alignItems: 'center', marginRight: 8, paddingTop: 2 },
  checkDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  lockDot: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  dashClip: { flex: 1, width: 1, overflow: 'hidden', marginTop: 4 },
  dashInner: { flex: 1, width: 3, borderWidth: 1, borderColor: '#4E4B5A', borderStyle: 'dashed', marginBottom: -2 },

  tierLabel: { color: '#D8D6DF', fontSize: 14, fontWeight: '800', marginBottom: 10, marginTop: 1 },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: CARD, borderRadius: 10, paddingHorizontal: 14, minHeight: 54, marginBottom: 9,
  },
  rowTxt: { color: '#EDEBF2', fontSize: 13.5, flexShrink: 1, paddingRight: 10 },

  bannerWrap: { flexDirection: 'row', alignItems: 'center', maxWidth: 160 },
  banner: {
    height: 20, borderRadius: 10, borderWidth: 1, justifyContent: 'center',
    paddingLeft: 16, paddingRight: 8, marginLeft: 11, flexShrink: 1,
  },
  bannerTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  bannerAvatarRing: {
    position: 'absolute', left: 0, width: 24, height: 24, borderRadius: 12, borderWidth: 1.5,
    backgroundColor: '#1C1A22', overflow: 'hidden',
  },
  bannerAvatar: { width: '100%', height: '100%' },

  family: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#55504F', alignItems: 'center', justifyContent: 'center' },
});
