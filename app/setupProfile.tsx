import { Ionicons } from '@expo/vector-icons';
import { getAuth as getNativeAuth, signInWithPhoneNumber } from '@react-native-firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { useRouter } from '../utils/safeRouter';
import { EmailAuthProvider, PhoneAuthProvider, linkWithCredential } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { scopedBackHandler } from '../utils/scopedBack';
import { uploadDpToR2 } from '../utils/api';
import { NAME_MAX, sanitizeName, validateName } from '../utils/profileHelpers';
import { auth, db } from './firebaseConfig';

const YELLOW = '#FFEB00';

const linkError = (code?: string, fallback?: string) => {
  switch (code) {
    case 'auth/email-already-in-use':
    case 'auth/credential-already-in-use':
      return 'Ye email/number pehle se kisi aur account se juda hai.';
    case 'auth/provider-already-linked':
      return 'Ye pehle se juda hua hai.';
    case 'auth/invalid-email':
      return 'Email sahi nahi hai.';
    case 'auth/weak-password':
      return 'Password kam se kam 6 characters ka rakho.';
    case 'auth/invalid-verification-code':
    case 'auth/code-expired':
      return 'OTP galat ya expire ho gaya hai.';
    case 'auth/invalid-phone-number':
      return 'Phone number sahi nahi hai.';
    case 'auth/requires-recent-login':
      return 'Dobara login karke try karo.';
    default:
      return fallback || 'Kuch galat ho gaya. Dobara try karo.';
  }
};

// Login ke baad pehli baar: name + photo (dono optional, Skip kar sakte ho) -> profile.
// Yahin email / phone jodne se dono me se kisi se bhi login karo, SAME profile khulegi.
export default function SetupProfileScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState('');
  const [username, setUsername] = useState('');

  // account linking
  const [hasEmail, setHasEmail] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [linking, setLinking] = useState(false);
  const verificationId = useRef<string | null>(null);

  // Back dabane se setup band na ho (Skip button hai)
  useEffect(() => {
    const sub = scopedBackHandler('/setupProfile', 'hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const user = auth.currentUser;
    if (!user) {
      router.replace('/login');
      return;
    }
    setHasEmail(!!user.email);
    setHasPhone(!!user.phoneNumber);

    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (cancelled) return;
        const d: any = snap.exists() ? snap.data() : {};
        setUsername(d.username || '');
        setName(sanitizeName(d.name || user.displayName || ''));
        setPhoto(d.profileImg || user.photoURL || '');
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  };

  // ---------- Skip: kuch bhi mat badlo, bas setup done mark karo ----------
  const handleSkip = async () => {
    if (saving) return;
    const user = auth.currentUser;
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        { profileSetupDone: true, ...(name.trim() ? {} : { name: username }) },
        { merge: true }
      );
      router.replace('/profile');
    } catch (error: any) {
      Alert.alert('Error', error?.userMessage || 'Skip nahi ho saka. Dobara try karo.');
    } finally {
      setSaving(false);
    }
  };

  // ---------- Save: name / photo jo bhi diya ----------
  const handleSave = async () => {
    if (saving) return;
    const user = auth.currentUser;
    if (!user) return;

    const cleanName = sanitizeName(name).trim();
    // name khali ho to chalega (optional); likha ho to valid hona chahiye
    if (cleanName) {
      const nameError = validateName(cleanName);
      if (nameError) return Alert.alert('Name Error', nameError);
    }

    setSaving(true);
    try {
      const imageUrl =
        photo && photo.startsWith('file://') ? await uploadDpToR2(photo) : photo;

      await setDoc(
        doc(db, 'users', user.uid),
        {
          name: cleanName || username,
          profileImg: imageUrl || '',
          profileSetupDone: true,
        },
        { merge: true }
      );

      router.replace('/profile');
    } catch (error: any) {
      Alert.alert('Error', error?.userMessage || 'Profile save nahi ho saki.');
    } finally {
      setSaving(false);
    }
  };

  // ---------- Email jodo (phone se bane account me) ----------
  const linkEmail = async () => {
    const user = auth.currentUser;
    const em = email.trim().toLowerCase();
    if (!user) return;
    if (!em || password.length < 6) {
      return Alert.alert('Email', 'Sahi email aur kam se kam 6 character ka password daalo.');
    }
    setLinking(true);
    try {
      await linkWithCredential(user, EmailAuthProvider.credential(em, password));
      await setDoc(doc(db, 'users', user.uid), { email: em }, { merge: true });
      setHasEmail(true);
      setEmail('');
      setPassword('');
      Alert.alert('Done', 'Email jud gaya. Ab is email se bhi login karoge to yahi profile khulegi.');
    } catch (e: any) {
      Alert.alert('Email Error', linkError(e?.code, e?.message));
    } finally {
      setLinking(false);
    }
  };

  // ---------- Phone jodo (email / google se bane account me) ----------
  const sendLinkOtp = async () => {
    if (phone.length !== 10) {
      return Alert.alert('Phone Number', 'Sahi 10 digit ka number daalo.');
    }
    setLinking(true);
    try {
      const conf = await signInWithPhoneNumber(getNativeAuth(), `+91${phone}`);
      verificationId.current = conf.verificationId;
      setOtp('');
      setOtpSent(true);
    } catch (e: any) {
      Alert.alert('OTP Error', linkError(e?.code, e?.message));
    } finally {
      setLinking(false);
    }
  };

  const verifyLinkOtp = async () => {
    const user = auth.currentUser;
    if (!user) return;
    if (otp.length !== 6 || !verificationId.current) {
      return Alert.alert('OTP', '6 digit ka OTP daalo.');
    }
    setLinking(true);
    try {
      const cred = PhoneAuthProvider.credential(verificationId.current, otp);
      await linkWithCredential(user, cred);
      await setDoc(doc(db, 'users', user.uid), { phone: `+91${phone}` }, { merge: true });
      setHasPhone(true);
      setOtpSent(false);
      setPhone('');
      setOtp('');
      Alert.alert('Done', 'Number jud gaya. Ab is number se bhi login karoge to yahi profile khulegi.');
    } catch (e: any) {
      Alert.alert('OTP Error', linkError(e?.code, e?.message));
    } finally {
      setLinking(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <StatusBar backgroundColor="#111" barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={handleSkip} disabled={saving || !ready} hitSlop={12} style={{ width: 60 }}>
          <Text style={[styles.skip, (saving || !ready) && { opacity: 0.4 }]}>Skip</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving || !ready} hitSlop={12} style={{ width: 60, alignItems: 'flex-end' }}>
          {saving ? (
            <ActivityIndicator size="small" color={YELLOW} />
          ) : (
            <Text style={[styles.headerSave, !ready && { opacity: 0.4 }]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {!ready ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={YELLOW} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 36, paddingBottom: 50 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity activeOpacity={0.85} onPress={pickImage} style={styles.avatarWrap}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarEmpty]}>
                  <Ionicons name="person" size={54} color="#555" />
                </View>
              )}
              <View style={styles.camBadge}>
                <Ionicons name="camera" size={18} color="#000" />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={pickImage}>
              <Text style={styles.photoLink}>{photo ? 'Photo badlo' : 'Photo lagao'}</Text>
            </TouchableOpacity>

            <View style={{ marginTop: 28 }}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={(t) => setName(sanitizeName(t))}
                maxLength={NAME_MAX}
                autoCorrect={false}
                placeholder="Apna naam (optional)"
                placeholderTextColor="#555"
              />
              <Text style={styles.helper}>{name.length}/{NAME_MAX}</Text>
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveText}>Save</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSkip} disabled={saving} style={{ marginTop: 16 }}>
              <Text style={styles.skipLink}>Abhi nahi, baad me</Text>
            </TouchableOpacity>

            {/* ---------- Account link: email + phone dono se same profile ---------- */}
            {(!hasEmail || !hasPhone) && (
              <View style={styles.linkBox}>
                <Text style={styles.linkTitle}>Dono se login karo (optional)</Text>
                <Text style={styles.helper}>
                  Email ya number jodo, phir kisi se bhi login karne par yahi profile khulegi.
                </Text>

                {!hasEmail && (
                  <View style={{ marginTop: 14 }}>
                    <TextInput
                      style={styles.smallInput}
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="Email"
                      placeholderTextColor="#555"
                    />
                    <TextInput
                      style={[styles.smallInput, { marginTop: 10 }]}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      placeholder="Password (min 6)"
                      placeholderTextColor="#555"
                    />
                    <TouchableOpacity style={styles.linkBtn} onPress={linkEmail} disabled={linking}>
                      {linking ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.linkBtnText}>Email jodo</Text>}
                    </TouchableOpacity>
                  </View>
                )}

                {!hasPhone && (
                  <View style={{ marginTop: 18 }}>
                    {!otpSent ? (
                      <>
                        <TextInput
                          style={styles.smallInput}
                          value={phone}
                          onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, '').slice(0, 10))}
                          keyboardType="number-pad"
                          maxLength={10}
                          placeholder="Phone number (+91)"
                          placeholderTextColor="#555"
                        />
                        <TouchableOpacity style={styles.linkBtn} onPress={sendLinkOtp} disabled={linking}>
                          {linking ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.linkBtnText}>OTP bhejo</Text>}
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TextInput
                          style={[styles.smallInput, { textAlign: 'center', letterSpacing: 6 }]}
                          value={otp}
                          onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, '').slice(0, 6))}
                          keyboardType="number-pad"
                          maxLength={6}
                          placeholder="------"
                          placeholderTextColor="#555"
                        />
                        <TouchableOpacity style={styles.linkBtn} onPress={verifyLinkOtp} disabled={linking}>
                          {linking ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.linkBtnText}>Verify & Jodo</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { setOtpSent(false); setOtp(''); }} style={{ marginTop: 10 }}>
                          <Text style={styles.skipLink}>Number badlo</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 10,
    paddingBottom: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 0.5,
    borderColor: '#222',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  headerSave: { color: YELLOW, fontSize: 16, fontWeight: 'bold' },
  skip: { color: '#aaa', fontSize: 16, fontWeight: '600' },
  avatarWrap: { alignSelf: 'center' },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#222' },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  camBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#111',
  },
  photoLink: { color: '#0095f6', textAlign: 'center', fontWeight: 'bold', marginTop: 12 },
  label: { fontSize: 12, color: '#888', marginBottom: 5, fontWeight: '500' },
  input: { borderBottomWidth: 1, borderColor: '#333', paddingVertical: 6, fontSize: 18, color: '#fff' },
  helper: { fontSize: 11, color: '#666', marginTop: 5 },
  saveBtn: { backgroundColor: YELLOW, borderRadius: 12, height: 56, alignItems: 'center', justifyContent: 'center', marginTop: 36 },
  saveText: { color: '#000', fontSize: 17, fontWeight: '800' },
  skipLink: { color: '#aaa', textAlign: 'center', fontSize: 14, fontWeight: '600' },
  linkBox: { marginTop: 40, paddingTop: 22, borderTopWidth: 0.5, borderTopColor: '#222' },
  linkTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  smallInput: { borderWidth: 1, borderColor: '#333', borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 15, color: '#fff' },
  linkBtn: { backgroundColor: YELLOW, borderRadius: 10, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  linkBtnText: { color: '#000', fontSize: 14, fontWeight: '800' },
});
