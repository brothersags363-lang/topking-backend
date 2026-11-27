import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PENDANTS, getPendant, isUserVerified, isWhiteTick } from '../components/pendants';
import { useRouter } from '../utils/safeRouter';
import { auth, db } from './firebaseConfig';
import { callApi } from '../utils/api';
import {
  ANGEL_FRAMES,
  getMyFramePrefs,
  refreshAdminFrameMap,
  setAdminFrameLocal,
  setMyFramePrefsLocal,
  specFromPrefs,
} from '../components/adminFrames';

const AV = 96; // preview avatar size
const YELLOW = '#FFE11A';

// Avatar + uske upar pendant (frame bahar ki taraf failta hai)
const AvatarWithPendant = ({ img, size, uri, fit }: { img?: any; size: number; uri?: string; fit?: { cx: number; cy: number; d: number } }) => {
  // hole ko photo ke bilkul beech me rakho (image ka hole canvas center par nahi hota)
  const f = fit || { cx: 0.5, cy: 0.5, d: 0.667 };
  const side = (size / f.d) * 1.03;
  return (
    <View style={{ width: size, height: size }}>
      <ExpoImage
        source={uri ? { uri } : undefined}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#2a2a2a' }}
        contentFit="cover"
      />
      {img ? (
        <ExpoImage
          source={img}
          pointerEvents="none"
          contentFit="fill"
          style={{ position: 'absolute', width: side, height: side, left: size / 2 - f.cx * side, top: size / 2 - f.cy * side }}
        />
      ) : null}
    </View>
  );
};

export default function AvatarPendantScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>({});
  const [photo, setPhoto] = useState('');
  const [selected, setSelected] = useState<string>(PENDANTS[0].key);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) {
      router.back();
      return;
    }
    Promise.all([getDoc(doc(db, 'users', u.uid)), refreshAdminFrameMap(true)])
      .then(([snap]) => {
        const d: any = snap.exists() ? snap.data() : {};
        setUser(d);
        setPhoto(d.profileImg || '');
        // ab pendant bhi frame system se chalta hai: frameChoice = "ang:<key>"
        const fc: string = (getMyFramePrefs() as any).frameChoice || '';
        const p = getPendant(fc.indexOf('ang:') === 0 ? fc.slice(4) : null);
        const ok = p && p.unlocked(d) ? p.key : null;
        setSaved(ok);
        setSelected(ok || PENDANTS[0].key);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const current = getPendant(selected);
  const open = !!current && current.unlocked(user);
  const verified = isUserVerified(user);
  const whiteTick = isWhiteTick(user);

  const apply = async (key: string | null) => {
    const u = auth.currentUser;
    if (!u || saving) return;
    setSaving(true);
    try {
      // Server eligibility check karta hai; jawab ke baad poore app me turant badal do
      const res: any = await callApi('/user/set-frame-prefs', { frameChoice: key ? 'ang:' + key : null });
      const prefs = (res && res.prefs) || {};
      setMyFramePrefsLocal(prefs);
      setAdminFrameLocal(u.uid, specFromPrefs(prefs));
      setSaved(key);
    } catch {
      Alert.alert('Error', 'Save nahi ho paya, dobara try karo.');
    } finally {
      setSaving(false);
    }
  };

  let btnText = (current as any)?.lockText || 'Locked';
  let btnDisabled = true;
  let onBtn: () => void = () => {};
  if (open) {
    btnDisabled = false;
    if (saved === selected) {
      btnText = 'Remove Pendant';
      onBtn = () => apply(null);
    } else {
      btnText = 'Use Now';
      onBtn = () => apply(selected);
    }
  }

  return (
    <View style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar backgroundColor="#1a1700" barStyle="light-content" />
      <LinearGradient
        colors={['#3a3300', '#14120a', '#0d0d0d']}
        locations={[0, 0.35, 0.6]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Avatar pendant</Text>
        </View>

        {!ready ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={YELLOW} />
          </View>
        ) : (
          <>
            <View style={s.previewWrap}>
              <View style={{ height: AV * 1.5, justifyContent: 'center' }}>
                <AvatarWithPendant img={current?.img} size={AV} uri={photo} fit={(ANGEL_FRAMES as any)[selected]?.fit} />
              </View>
              <Text style={s.trying}>{open && saved === selected ? 'Using' : 'Trying'}: {current?.label}</Text>
              <Text style={s.valid}>{open ? 'Unlocked for you' : 'Valid for 7 days'}</Text>
            </View>

            <View style={s.sheet}>
              <Text style={s.section}>Choose avatar pendant</Text>
              <ScrollView
                contentContainerStyle={s.grid}
                showsVerticalScrollIndicator={false}
              >
                {PENDANTS.map((p) => {
                  const unlocked = p.unlocked(user);
                  const on = selected === p.key;
                  return (
                    <TouchableOpacity
                      key={p.key}
                      activeOpacity={0.85}
                      onPress={() => setSelected(p.key)}
                      style={[s.tile, on && s.tileOn]}
                    >
                      {on && (
                        <View style={s.check}>
                          <Ionicons name="checkmark" size={14} color="#000" />
                        </View>
                      )}
                      <View style={s.tileImgBox}>
                        <ExpoImage
                          source={p.img}
                          contentFit="contain"
                          style={[s.tileImg, !unlocked && { opacity: 0.55 }]}
                        />
                        {!unlocked && (
                          <View style={s.lockBadge}>
                            <Ionicons name="lock-closed" size={13} color="#fff" />
                          </View>
                        )}
                      </View>
                      <Text style={s.tileName}>{p.label}</Text>
                      <Text style={[s.tileState, unlocked && { color: '#4ade80' }]}>
                        {unlocked ? (saved === p.key ? 'In use' : 'Obtained') : "Haven't Obtained"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <View style={{ height: 120, width: '100%' }} />
              </ScrollView>
            </View>

            <View style={s.bottom}>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={btnDisabled || saving}
                onPress={onBtn}
                style={[s.btn, btnDisabled && { opacity: 0.55 }]}
              >
                {saving ? <ActivityIndicator color="#000" /> : <Text style={s.btnText}>{btnText}</Text>}
              </TouchableOpacity>
              <Text style={s.note}>
                {whiteTick
                  ? 'Fresh Angel aur Senior Angel unlocked - baaki pendants jaldi aayenge'
                  : verified
                  ? 'Fresh Angel unlocked - Senior Angel white tick milne par khulega'
                  : 'Account verify karo, Fresh Angel pendant khul jayega'}
              </Text>
            </View>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginLeft: 22 },
  previewWrap: { alignItems: 'center', paddingTop: 14, paddingBottom: 22 },
  trying: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 16 },
  valid: { color: '#8a8a8a', fontSize: 13, marginTop: 6 },
  sheet: { flex: 1, backgroundColor: '#161616', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 18 },
  section: { color: '#fff', fontSize: 17, fontWeight: '700', marginHorizontal: 18, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16 },
  tile: { width: '48.5%', backgroundColor: '#222224', borderRadius: 14, paddingTop: 16, paddingBottom: 14, alignItems: 'center', marginBottom: 12, borderWidth: 1.5, borderColor: 'transparent' },
  tileOn: { borderColor: YELLOW },
  check: { position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  tileImgBox: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center' },
  tileImg: { width: 112, height: 112 },
  lockBadge: { position: 'absolute', right: 4, bottom: 6, backgroundColor: 'rgba(0,0,0,0.75)', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tileName: { color: '#fff', fontSize: 15, marginTop: 10 },
  tileState: { color: '#7a7a7a', fontSize: 13, marginTop: 4 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#161616', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 22 },
  btn: { height: 52, borderRadius: 10, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#000', fontSize: 17, fontWeight: '700' },
  note: { color: '#777', fontSize: 12, textAlign: 'center', marginTop: 10 },
});
