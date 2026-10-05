import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { auth, db } from './firebaseConfig';
import { callApi } from './api';

// ==========================================
// REWARD SETTINGS  (yahin se change kar sakte ho)
// ==========================================
const REWARD_1_AD = 3; // 1 ad dekho  -> 3 star
const REWARD_2_ADS = 7; // 2 ads dekho -> 7 star

// Wallet doc me star balance kis field me save hota hai.
// Agar tumhare wallets/{uid} me alag naam hai (jaise "balance"), to yahan badal do.
const STAR_FIELD = 'stars';

// ==========================================
// ADS SYSTEM  (yahan apna ad SDK lagana)
// ==========================================
// Jab tak ads nahi lage hain, ADS_ENABLED = false rakho.
// false hone par claim NAHI hoga (button dabane par sirf message aayega).
// Ads lagane ke baad ise true kar dena aur neeche TODO block bhar dena.
const ADS_ENABLED = false;

// Ye function ad dikhata hai aur sirf tab `true` return karta hai
// jab user ne ad POORA dekh liya ho (reward earn hua ho).
async function showRewardedAd(): Promise<boolean> {
  if (!ADS_ENABLED) return false;

  // TODO: yahan apna real rewarded ad lagao. Example (AdMob,
  // react-native-google-mobile-ads):
  //
  // return new Promise((resolve) => {
  //   const ad = RewardedAd.createForAdRequest(AD_UNIT_ID);
  //   let earned = false;
  //   ad.addAdEventListener(RewardedAdEventType.LOADED, () => ad.show());
  //   ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; });
  //   ad.addAdEventListener(AdEventType.CLOSED, () => resolve(earned));
  //   ad.addAdEventListener(AdEventType.ERROR, () => resolve(false));
  //   ad.load();
  // });

  return false;
}

export default function ClaimScreen() {
  const router = useRouter();

  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState<null | 'one' | 'two'>(null);
  const [progress, setProgress] = useState(0); // 2-ad offer me kitne ads ho chuke

  // Live star balance
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const unsub = onSnapshot(
      doc(db, 'wallets', uid),
      (snap) => {
        setBalance(snap.exists() ? Number(snap.data()?.[STAR_FIELD] || 0) : 0);
      },
      () => setBalance(0)
    );

    return () => unsub();
  }, []);

  // Stars server dega (daily limit + gap server par lagi hai)
  const giveStars = async (amount: number) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      router.replace('/login');
      return false;
    }

    try {
      await callApi('/reward/ad', { ads: amount === REWARD_2_ADS ? 2 : 1 });
      return true;
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Star add nahi ho paye. Dobara try karo.');
      return false;
    }
  };

  // 1 ad -> 3 star
  const claimOneAd = async () => {
    if (busy) return;
    if (!ADS_ENABLED) {
      Alert.alert('Ads available nahi hain', 'Abhi ads available nahi hain. Thodi der baad try karo.');
      return;
    }
    setBusy('one');

    try {
      const watched = await showRewardedAd();

      if (!watched) {
        Alert.alert('Ad adhura raha', 'Reward ke liye ad poora dekhna hoga.');
        return;
      }

      const ok = await giveStars(REWARD_1_AD);
      if (ok) Alert.alert('Mubarak ho! 🎉', `${REWARD_1_AD} star mil gaye.`);
    } finally {
      setBusy(null);
    }
  };

  // 2 ads -> 7 star
  const claimTwoAds = async () => {
    if (busy) return;
    if (!ADS_ENABLED) {
      Alert.alert('Ads available nahi hain', 'Abhi ads available nahi hain. Thodi der baad try karo.');
      return;
    }
    setBusy('two');
    setProgress(0);

    try {
      const first = await showRewardedAd();
      if (!first) {
        Alert.alert('Ad adhura raha', 'Reward ke liye dono ads poore dekhne honge.');
        return;
      }
      setProgress(1);

      const second = await showRewardedAd();
      if (!second) {
        Alert.alert('Ad adhura raha', 'Reward ke liye dono ads poore dekhne honge.');
        return;
      }
      setProgress(2);

      const ok = await giveStars(REWARD_2_ADS);
      if (ok) Alert.alert('Mubarak ho! 🎉', `${REWARD_2_ADS} star mil gaye.`);
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={30} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Claim Stars</Text>

        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Balance */}
        <View style={styles.balanceCard}>
          <Ionicons name="star" size={46} color="#FFD700" />

          {balance == null ? (
            <ActivityIndicator color="#FFD700" style={{ marginTop: 10 }} />
          ) : (
            <Text style={styles.balanceNum}>{balance}</Text>
          )}

          <Text style={styles.balanceLabel}>Your Stars</Text>
        </View>

        {/* Offer 1: 1 ad */}
        <View style={styles.offerCard}>
          <View style={styles.offerTop}>
            <View style={styles.offerIcon}>
              <Ionicons name="play" size={22} color="#000" />
            </View>

            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.offerTitle}>Watch 1 Ad</Text>
              <Text style={styles.offerSub}>Ek ad dekho, turant star pao</Text>
            </View>

            <View style={styles.rewardPill}>
              <Ionicons name="star" size={14} color="#FFD700" />
              <Text style={styles.rewardPillText}>+{REWARD_1_AD}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.claimBtn, (busy || !ADS_ENABLED) && { opacity: 0.5 }]}
            onPress={claimOneAd}
            disabled={!!busy}
            activeOpacity={0.8}
          >
            {busy === 'one' ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.claimBtnText}>Watch Ad</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Offer 2: 2 ads */}
        <View style={[styles.offerCard, styles.offerCardBest]}>
          <View style={styles.bestBadge}>
            <Text style={styles.bestBadgeText}>Best Value</Text>
          </View>

          <View style={styles.offerTop}>
            <View style={styles.offerIcon}>
              <Ionicons name="play-forward" size={22} color="#000" />
            </View>

            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.offerTitle}>Watch 2 Ads</Text>
              <Text style={styles.offerSub}>
                {busy === 'two'
                  ? `Ad ${Math.min(progress + 1, 2)} / 2 chal raha hai...`
                  : 'Do ads dekho, zyada star pao'}
              </Text>
            </View>

            <View style={styles.rewardPill}>
              <Ionicons name="star" size={14} color="#FFD700" />
              <Text style={styles.rewardPillText}>+{REWARD_2_ADS}</Text>
            </View>
          </View>

          {/* Progress dots */}
          <View style={styles.dotsRow}>
            <View style={[styles.dot, progress >= 1 && styles.dotOn]} />
            <View style={[styles.dot, progress >= 2 && styles.dotOn]} />
          </View>

          <TouchableOpacity
            style={[styles.claimBtn, (busy || !ADS_ENABLED) && { opacity: 0.5 }]}
            onPress={claimTwoAds}
            disabled={!!busy}
            activeOpacity={0.8}
          >
            {busy === 'two' ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.claimBtnText}>Watch 2 Ads</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.note}>
          {ADS_ENABLED
            ? 'Star tabhi milenge jab ad poora dekha ho.'
            : 'Ads abhi available nahi hain. Jaldi hi shuru honge.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 24 : 45,
    paddingBottom: 12,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },

  content: { padding: 16, paddingBottom: 60 },

  balanceCard: {
    alignItems: 'center',
    paddingVertical: 28,
    backgroundColor: '#181818',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2c2c2c',
    marginBottom: 22,
    shadowColor: '#FFD700',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  balanceNum: { color: '#fff', fontSize: 40, fontWeight: 'bold', marginTop: 8 },
  balanceLabel: { color: '#888', fontSize: 14, marginTop: 2 },

  offerCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222',
    padding: 16,
    marginBottom: 16,
  },
  offerCardBest: { borderColor: '#FFD700' },
  bestBadge: {
    position: 'absolute',
    top: -11,
    right: 16,
    backgroundColor: '#FFD700',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  bestBadgeText: { color: '#000', fontSize: 11, fontWeight: 'bold' },

  offerTop: { flexDirection: 'row', alignItems: 'center' },
  offerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
  },
  offerTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  offerSub: { color: '#888', fontSize: 12.5, marginTop: 2 },

  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3d3200',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  rewardPillText: { color: '#FFD700', fontWeight: 'bold', marginLeft: 4, fontSize: 15 },

  dotsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  dot: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#2a2a2a' },
  dotOn: { backgroundColor: '#FFD700' },

  claimBtn: {
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  claimBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },

  note: { color: '#555', fontSize: 12, textAlign: 'center', marginTop: 6 },
});
