import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAuth as getNativeAuth,
  signInWithPhoneNumber,
} from '@react-native-firebase/auth';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from '../utils/safeRouter';
import {
  GoogleAuthProvider,
  PhoneAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import useBackStep from '../utils/useBackStep';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import TopKingLogo from '../assets/images/topking-logo.png';
import { checkDeviceBanned, registerDevice } from '../utils/api';
import { auth, db, getFCMToken } from './firebaseConfig';

const YELLOW = '#FFEB00';

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
const createUniqueUsername = async (seed: string) => {
  let base = (seed || 'user')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  if (!base) base = 'user';
  base = base.slice(0, 18);

  let finalUsername = base;
  let count = 1;
  while (true) {
    const snap = await getDocs(
      query(collection(db, 'users'), where('username', '==', finalUsername), limit(1))
    );
    if (snap.empty) break;
    finalUsername = `${base}${count}`;
    count++;
  }
  return finalUsername;
};

// Login ke baad: naya user (ya jisne profile setup nahi kiya) -> setupProfile, baaki -> profile
const routeAfterLogin = async (router: any, uid: string) => {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    // Naya user: username khud dalna zaroori hai -> jab tak na dale profile nahi khulegi
    if (snap.exists() && snap.data()?.usernameSet === false) {
      router.replace({ pathname: '/editProfile', params: { force: '1' } });
      return;
    }
    if (snap.exists() && snap.data()?.profileSetupDone === false) {
      router.replace('/setupProfile');
      return;
    }
  } catch (e) {}
  router.replace('/profile');
};

const friendlyAuthError = (code?: string, fallback?: string) => {
  switch (code) {
    case 'auth/invalid-email':
      return 'Email sahi nahi hai.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Email ya password galat hai.';
    case 'auth/email-already-in-use':
      return 'Ye email pehle se use me hai. Login karo, ya agar Google se banaya tha to Google se login karo.';
    case 'auth/weak-password':
      return 'Password kam se kam 6 characters ka rakho.';
    case 'auth/too-many-requests':
      return 'Bahut zyada try ho gaye. Thodi der baad dobara try karo.';
    case 'auth/network-request-failed':
      return 'Internet check karo.';
    case 'auth/invalid-verification-code':
    case 'auth/code-expired':
      return 'OTP galat ya expire ho gaya hai.';
    case 'auth/invalid-phone-number':
      return 'Phone number sahi nahi hai.';
    case 'auth/user-disabled':
      return 'Your account has been banned by admin.';
    default:
      return fallback || 'Kuch galat ho gaya. Dobara try karo.';
  }
};

export default function LoginScreen() {
  const router = useRouter();
  const busy = useRef(false); // sign-in chal raha ho to auto-redirect mat karo

  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [loading, setLoading] = useState(false);

  // phone
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const confirmation = useRef<any>(null);

  // email
  const [emailSignup, setEmailSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Mobile back: pehle login ke andar ek step peeche (OTP -> phone, email -> phone), phir screen se peeche
  useBackStep('/', () => {
    if (otpSent) {
      setOtpSent(false);
      setOtp('');
      return true;
    }
    if (mode === 'email') {
      setMode('phone');
      return true;
    }
    return false;
  });

  useEffect(() => {
    GoogleSignin.configure({
      webClientId:
        '153552238196-0u22oecct9lgv1h2kk33ipin4n6bb435.apps.googleusercontent.com',
      offlineAccess: true,
    });
  }, []);

  // Pehle se login ho to seedha aage
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !busy.current) {
        routeAfterLogin(router, user.uid);
      }
    });
    return unsubscribe;
  }, []);

  // OTP resend timer
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // ---------------------------------------------------------------
  // Har login ke baad common kaam
  // ---------------------------------------------------------------
  const finishLogin = async (user: any, usernameSeed: string) => {
    const uid = user.uid;

    // device register + ban check (server naya account bhi band kar deta hai)
    const reg = await registerDevice();
    if (!reg.ok) {
      await signOut(auth).catch(() => {});
      await GoogleSignin.signOut().catch(() => {});
      if (reg.banned) {
        Alert.alert('Device Banned', 'This device has been banned. You cannot log in.');
      } else {
        Alert.alert('Update Required', 'Please update the app to continue.');
      }
      return;
    }

    await AsyncStorage.setItem('userId', uid);

    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      const username = await createUniqueUsername(usernameSeed);
      await setDoc(
        userRef,
        {
          name: user.displayName || '',
          username,
          profileImg: user.photoURL || '',
          bioText: 'bio.........',
          category: 'Video Creator',
          gender: 'Male',
          profileSetupDone: false, // naya user -> pehle name + photo setup
          usernameSet: false, // naya user -> username khud add karna zaroori (Edit Profile)
        },
        { merge: true }
      );
    }

    const fcmToken = await getFCMToken();
    if (fcmToken) {
      await setDoc(doc(db, 'users', uid), { fcmToken }, { merge: true });
    }

    await routeAfterLogin(router, uid);
  };

  const guardBanned = async () => {
    if (await checkDeviceBanned()) {
      Alert.alert('Device Banned', 'This device has been banned. You cannot log in.');
      return true;
    }
    return false;
  };

  // ---------------------------------------------------------------
  // PHONE
  // ---------------------------------------------------------------
  const sendOtp = async () => {
    if (loading) return;
    if (phone.length !== 10) {
      return Alert.alert('Phone Number', 'Sahi 10 digit ka number daalo.');
    }
    setLoading(true);
    busy.current = true;
    try {
      if (await guardBanned()) return;
      const conf = await signInWithPhoneNumber(getNativeAuth(), `+91${phone}`);
      confirmation.current = conf;
      setOtp('');
      setOtpSent(true);
      setResendIn(30);
    } catch (e: any) {
      Alert.alert('OTP Error', friendlyAuthError(e?.code, e?.message));
    } finally {
      setLoading(false);
      busy.current = false;
    }
  };

  const verifyOtp = async () => {
    if (loading) return;
    if (otp.length !== 6 || !confirmation.current?.verificationId) {
      return Alert.alert('OTP', '6 digit ka OTP daalo.');
    }
    setLoading(true);
    busy.current = true;
    try {
      // native se bheja OTP, app ke JS auth me login (poori app JS auth use karti hai)
      const cred = PhoneAuthProvider.credential(confirmation.current.verificationId, otp);
      const result = await signInWithCredential(auth, cred);
      await finishLogin(result.user, `user${phone.slice(-4)}`);
    } catch (e: any) {
      Alert.alert('Login Error', friendlyAuthError(e?.code, e?.message));
    } finally {
      setLoading(false);
      busy.current = false;
    }
  };

  // ---------------------------------------------------------------
  // EMAIL
  // ---------------------------------------------------------------
  const emailSubmit = async () => {
    if (loading) return;
    const em = email.trim().toLowerCase();
    if (!em || !password) {
      return Alert.alert('Email Login', 'Email aur password dono daalo.');
    }
    setLoading(true);
    busy.current = true;
    try {
      if (await guardBanned()) return;
      const result = emailSignup
        ? await createUserWithEmailAndPassword(auth, em, password)
        : await signInWithEmailAndPassword(auth, em, password);
      await finishLogin(result.user, em.split('@')[0]);
    } catch (e: any) {
      Alert.alert(
        emailSignup ? 'Sign Up Error' : 'Login Error',
        friendlyAuthError(e?.code, e?.message)
      );
    } finally {
      setLoading(false);
      busy.current = false;
    }
  };

  const forgotPassword = async () => {
    const em = email.trim().toLowerCase();
    if (!em) return Alert.alert('Forgot Password', 'Pehle apna email daalo.');
    try {
      await sendPasswordResetEmail(auth, em);
      Alert.alert('Email Bhej Diya', 'Password reset ka link aapke email par bhej diya hai.');
    } catch (e: any) {
      Alert.alert('Error', friendlyAuthError(e?.code, e?.message));
    }
  };

  // ---------------------------------------------------------------
  // GOOGLE
  // ---------------------------------------------------------------
  const googleSignIn = async () => {
    if (loading) return;
    setLoading(true);
    busy.current = true;
    try {
      if (await guardBanned()) return;
      await GoogleSignin.hasPlayServices();
      const userInfo: any = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken || userInfo.idToken;
      if (!idToken) {
        Alert.alert('ID Token not found');
        return;
      }
      const result = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
      await finishLogin(result.user, result.user.displayName || 'user');
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        Alert.alert('Login Cancelled');
      } else if (error.code === statusCodes.IN_PROGRESS) {
        Alert.alert('Login In Progress');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Google Play Services Not Available');
      } else if (error?.code === 'auth/user-disabled') {
        Alert.alert('Account Banned', 'Your account has been banned by admin.');
      } else {
        Alert.alert('Error', error?.message || 'Google Sign In Failed');
      }
    } finally {
      setLoading(false);
      busy.current = false;
    }
  };

  const facebookSignIn = () => {
    Alert.alert('Facebook', 'Facebook login jald aayega.');
  };

  // ---------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------
  const renderPhone = () => (
    <>
      <Text style={styles.heading}>Log In to Enter Your Profile</Text>

      {!otpSent ? (
        <>
          <View style={styles.inputRow}>
            <Text style={styles.code}>+91</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, '').slice(0, 10))}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="1234567890"
              placeholderTextColor="#777"
            />
            {phone.length > 0 && (
              <TouchableOpacity onPress={() => setPhone('')} hitSlop={10}>
                <Ionicons name="close-circle" size={20} color="#888" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.mainBtn}
            activeOpacity={0.85}
            onPress={sendOtp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.mainBtnText}>sign Up/Log in with phone</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.sub}>OTP bheja gaya: +91 {phone}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { textAlign: 'center', letterSpacing: 8, fontSize: 22 }]}
              value={otp}
              onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="------"
              placeholderTextColor="#555"
              autoFocus
            />
          </View>

          <TouchableOpacity
            style={styles.mainBtn}
            activeOpacity={0.85}
            onPress={verifyOtp}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.mainBtnText}>Verify & Continue</Text>}
          </TouchableOpacity>

          <View style={styles.linkRow}>
            <TouchableOpacity
              onPress={() => {
                setOtpSent(false);
                setOtp('');
              }}
            >
              <Text style={styles.link}>Number badlo</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={sendOtp} disabled={resendIn > 0 || loading}>
              <Text style={[styles.link, resendIn > 0 && { opacity: 0.4 }]}>
                {resendIn > 0 ? `Resend OTP (${resendIn}s)` : 'Resend OTP'}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <TouchableOpacity style={styles.switchBtn} onPress={() => setMode('email')}>
        <Ionicons name="mail-outline" size={18} color={YELLOW} />
        <Text style={styles.switchText}>Email se login karo</Text>
      </TouchableOpacity>
    </>
  );

  const renderEmail = () => (
    <>
      <Text style={styles.heading}>{emailSignup ? 'Create Your Account' : 'Log In with Email'}</Text>

      <View style={styles.inputRow}>
        <Ionicons name="mail-outline" size={20} color="#888" style={{ marginRight: 10 }} />
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Email"
          placeholderTextColor="#777"
        />
      </View>

      <View style={[styles.inputRow, { marginTop: 12 }]}>
        <Ionicons name="lock-closed-outline" size={20} color="#888" style={{ marginRight: 10 }} />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPass}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Password"
          placeholderTextColor="#777"
        />
        <TouchableOpacity onPress={() => setShowPass((s) => !s)} hitSlop={10}>
          <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color="#888" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.mainBtn}
        activeOpacity={0.85}
        onPress={emailSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.mainBtnText}>{emailSignup ? 'Sign Up' : 'Log In'}</Text>
        )}
      </TouchableOpacity>

      <View style={styles.linkRow}>
        <TouchableOpacity onPress={() => setEmailSignup((s) => !s)}>
          <Text style={styles.link}>{emailSignup ? 'Already account hai? Log In' : 'Naya account banao'}</Text>
        </TouchableOpacity>
        {!emailSignup && (
          <TouchableOpacity onPress={forgotPassword}>
            <Text style={styles.link}>Forgot password?</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.switchBtn} onPress={() => setMode('phone')}>
        <Ionicons name="call-outline" size={18} color={YELLOW} />
        <Text style={styles.switchText}>Phone se login karo</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <LinearGradient colors={['#2d2d2d', '#1b1b1b']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2d2d2d" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoCircle}>
            <Image source={TopKingLogo} style={styles.logo} resizeMode="contain" />
          </View>

          <View style={styles.form}>{mode === 'phone' ? renderPhone() : renderEmail()}</View>

          <View style={styles.bottom}>
            <View style={styles.socialRow}>
              <TouchableOpacity style={styles.googleCircle} activeOpacity={0.8} onPress={googleSignIn}>
                <Ionicons name="logo-google" size={24} color="#DB4437" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.fbCircle} activeOpacity={0.8} onPress={facebookSignIn}>
                <Ionicons name="logo-facebook" size={30} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.terms}>
              By using this app, you agree to <Text style={styles.termsBold}>Terms of Use</Text> and{' '}
              <Text style={styles.termsBold}>Privacy Policy</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 40 : 70,
    paddingBottom: 30,
  },
  logoCircle: {
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 150, height: 150 },
  form: { width: '100%', marginTop: 40 },
  heading: { color: '#fff', fontSize: 20, fontWeight: '500', marginBottom: 18 },
  sub: { color: '#bbb', fontSize: 14, marginBottom: 14 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 62,
  },
  code: { color: '#fff', fontSize: 20, marginRight: 14 },
  input: { flex: 1, color: '#fff', fontSize: 20, paddingVertical: 0 },
  mainBtn: {
    backgroundColor: YELLOW,
    borderRadius: 12,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  mainBtnText: { color: '#111', fontSize: 19, fontWeight: '800' },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  link: { color: '#ccc', fontSize: 14, fontWeight: '600' },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 26,
  },
  switchText: { color: YELLOW, fontSize: 15, fontWeight: '700' },
  bottom: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', width: '100%', paddingTop: 40 },
  socialRow: { flexDirection: 'row', gap: 36, marginBottom: 22 },
  googleCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fbCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1877F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  terms: { color: '#aaa', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  termsBold: { color: '#fff', fontWeight: '700' },
});
