import useBackStep from '../utils/useBackStep';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRouter } from '../utils/safeRouter';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import FastImage from '../components/FastImage';
import { uploadDpToR2 } from '../utils/api';
import {
  BIO_MAX_CHARS,
  BIO_MAX_LINES,
  NAME_MAX,
  USERNAME_COOLDOWN_DAYS,
  USERNAME_MAX,
  birthdayToDisplay,
  cleanBio,
  clampBio,
  formatBirthdayInput,
  getUsernameLock,
  parseBirthday,
  sanitizeName,
  sanitizeUsername,
  toMillis,
  validateName,
  validateUsername,
} from '../utils/profileHelpers';
import { auth, db } from './firebaseConfig';

const CATEGORIES = [
  'Video Creator', 'Gaming', 'Comedy', 'Education', 'Technology', 'Business', 'Fashion',
  'Beauty', 'Fitness', 'Food', 'Travel', 'Music', 'Dance', 'Photography', 'Sports',
  'News', 'Motivation', 'Lifestyle', 'Entertainment', 'Influencer',
];
const GENDERS = ['Male', 'Female', 'Other'];

// all_videos / comments / replies me jo username + dp save hai use naya karo (background)
const syncMyIdentity = async (uid, username, photo) => {
  const commit = async (docs, data) => {
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, data));
      await batch.commit();
    }
  };

  try {
    const s = await getDocs(query(collection(db, 'all_videos'), where('userId', '==', uid)));
    await commit(s.docs, { username, profile: photo });
  } catch (e) {
    if (__DEV__) console.log('SYNC VIDEOS ERROR =', e);
  }
  try {
    const s = await getDocs(query(collectionGroup(db, 'comments'), where('userId', '==', uid)));
    await commit(s.docs, { username, profilePic: photo });
  } catch (e) {
    if (__DEV__) console.log('SYNC COMMENTS ERROR =', e);
  }
  try {
    const s = await getDocs(query(collectionGroup(db, 'replies'), where('userId', '==', uid)));
    await commit(s.docs, { username, profilePic: photo });
  } catch (e) {
    if (__DEV__) console.log('SYNC REPLIES ERROR =', e);
  }
};

const Chip = ({ label, active, onPress }) => (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={onPress}
    style={[styles.chip, active && styles.chipOn]}
  >
    <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
  </TouchableOpacity>
);

export default function EditProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  // Naya user: username add kiye bina bahar nahi nikal sakta (back / close band)
  const [mustSetUsername, setMustSetUsername] = useState(params?.force === '1');
  const mustSetRef = useRef(mustSetUsername);
  mustSetRef.current = mustSetUsername;
  useBackStep('/profile', () => mustSetRef.current);

  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const [orig, setOrig] = useState({ username: '', usernameChangedAt: 0 });
  const [email, setEmail] = useState('');
  const [photo, setPhoto] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [birthday, setBirthday] = useState('');
  const [category, setCategory] = useState('Video Creator');
  const [gender, setGender] = useState('Male');

  // Sirf ek baar user doc padhta hai
  useEffect(() => {
    let cancelled = false;
    const user = auth.currentUser;
    if (!user) {
      router.back();
      return;
    }
    setEmail(user.email || '');

    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (cancelled) return;
        const d = snap.exists() ? snap.data() : {};
        const uname = d.username || user.email?.split('@')[0] || 'user';
        const forced = d.usernameSet === false;
        if (forced) setMustSetUsername(true);
        setOrig({ username: uname, usernameChangedAt: forced ? 0 : toMillis(d.usernameChangedAt) });
        setUsername(forced ? '' : uname); // forced: khali field, user khud likhe
        setName(sanitizeName(d.name || ''));
        setBio(cleanBio(d.bioText));
        setBirthday(birthdayToDisplay(d.birthday));
        setCategory(d.category || 'Video Creator');
        setGender(d.gender || 'Male');
        setPhoto(d.profileImg || '');
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const lock = useMemo(() => getUsernameLock(orig.usernameChangedAt), [orig.usernameChangedAt]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  };

  const handleSave = async () => {
    if (saving) return;
    const user = auth.currentUser;
    if (!user) return;

    // ---- 1. Validate pehle ----
    if (mustSetUsername && !username.trim()) {
      return Alert.alert('Username zaroori hai', 'Profile kholne ke liye pehle apna username add karo.');
    }
    const cleanUsername =
      !mustSetUsername && username === orig.username ? username : sanitizeUsername(username);

    const cleanName = sanitizeName(name).trim();
    const nameError = validateName(cleanName);
    if (nameError) return Alert.alert('Name Error', nameError);

    const bday = parseBirthday(birthday);
    if (bday.error) return Alert.alert('Birthday Error', bday.error);

    const usernameError =
      !mustSetUsername && username === orig.username ? null : validateUsername(cleanUsername);
    if (usernameError) return Alert.alert('Username Error', usernameError);

    setSaving(true);
    try {
      // forced (pehli baar) me hamesha check + save; baad me sirf badalne par
      const usernameChanged = mustSetUsername || cleanUsername !== orig.username;

      // 14 din ka lock: server se taza value padh ke check (pehli baar ke liye lock nahi)
      if (usernameChanged && !mustSetUsername) {
        const fresh = await getDoc(doc(db, 'users', user.uid));
        const l = getUsernameLock(fresh.exists() ? fresh.data().usernameChangedAt : orig.usernameChangedAt);
        if (l.locked) {
          Alert.alert(
            'Username abhi nahi badal sakte',
            `Username sirf ${USERNAME_COOLDOWN_DAYS} din me ek baar badal sakte ho. ${l.daysLeft} din baad dobara try karo.`
          );
          setUsername(orig.username);
          return;
        }
      }

      // ---- 2. Image upload + username-unique check saath me ----
      const [imageUrl, usernameTaken] = await Promise.all([
        photo && photo.startsWith('file://') ? uploadDpToR2(photo) : Promise.resolve(photo),
        usernameChanged
          ? getDocs(query(collection(db, 'users'), where('username', '==', cleanUsername), limit(2))).then(
              (snap) => snap.docs.some((d) => d.id !== user.uid)
            )
          : Promise.resolve(false),
      ]);

      if (usernameTaken) {
        Alert.alert('Username Already Taken', 'Ye username kisi aur user ne use kiya hua hai.');
        return;
      }

      // ---- 3. Sirf edit hue fields likho ----
      await setDoc(
        doc(db, 'users', user.uid),
        {
          name: cleanName,
          username: cleanUsername,
          birthday: bday.iso,
          bioText: clampBio(bio).trim(),
          category,
          gender,
          profileImg: imageUrl,
          ...(usernameChanged && !mustSetUsername ? { usernameChangedAt: Date.now() } : {}),
          ...(mustSetUsername ? { usernameSet: true, profileSetupDone: true } : {}),
        },
        { merge: true }
      );

      // Naam / dp badla hai to videos + comments me bhi (background, wait nahi)
      syncMyIdentity(user.uid, cleanUsername, imageUrl);

      if (mustSetUsername) {
        setMustSetUsername(false);
        router.replace('/profile'); // username set -> ab profile khulegi
      } else {
        router.back(); // profile screen focus par apne aap refresh ho jaati hai
      }
    } catch (error) {
      console.log('Profile save error:', error);
      Alert.alert('Error', (error && error.userMessage) || 'Profile save nahi ho saki.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar backgroundColor="#111" barStyle="light-content" />

      <View style={styles.header}>
        {mustSetUsername ? (
          <View style={{ width: 28 }} />
        ) : (
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving || !ready} hitSlop={12}>
          {saving ? (
            <ActivityIndicator size="small" color="#FFD700" />
          ) : (
            <Text style={[styles.headerSave, !ready && { opacity: 0.4 }]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {!ready ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFD700" />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={{ paddingHorizontal: 20 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity activeOpacity={0.8} onPress={pickImage} style={{ alignSelf: 'center', marginTop: 16 }}>
              <FastImage uri={photo} style={styles.avatar} />
            </TouchableOpacity>
            <TouchableOpacity onPress={pickImage}>
              <Text style={styles.blueLink}>Change Profile Photo</Text>
            </TouchableOpacity>

            {/* Username */}
            <View style={styles.inputBox}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={[styles.textInput, lock.locked && { opacity: 0.5 }]}
                editable={!lock.locked}
                value={username}
                onChangeText={(t) => setUsername(sanitizeUsername(t))}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={USERNAME_MAX}
                placeholder="simple name, jaise: rahul ya rahul.k"
                placeholderTextColor="#555"
              />
              <Text style={styles.helper}>
                {mustSetUsername
                  ? 'Profile kholne ke liye apna username add karo (3 se ' + USERNAME_MAX + ' characters), phir Save dabao.'
                  : lock.locked
                  ? `Username ${lock.daysLeft} din baad badal sakte ho (${USERNAME_COOLDOWN_DAYS} din me sirf ek baar)`
                  : `Letters, numbers, . aur _ use kar sakte ho (3 se ${USERNAME_MAX} characters). Ek baar badalne ke baad ${USERNAME_COOLDOWN_DAYS} din tak dobara nahi badlega.`}
              </Text>
            </View>

            {/* Name */}
            <View style={styles.inputBox}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={(t) => setName(sanitizeName(t))}
                maxLength={NAME_MAX}
                autoCorrect={false}
                placeholder="Apna naam"
                placeholderTextColor="#555"
              />
              <Text style={styles.helper}>
                {name.length}/{NAME_MAX} • sirf letters, numbers aur . _ -
              </Text>
            </View>

            {/* Bio */}
            <View style={styles.inputBox}>
              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.textInput, { height: 90, textAlignVertical: 'top' }]}
                value={bio}
                onChangeText={(t) => setBio(clampBio(t))}
                multiline
                maxLength={BIO_MAX_CHARS}
                placeholder="Apne baare me likho..."
                placeholderTextColor="#555"
              />
              <Text style={styles.helper}>
                {bio.length}/{BIO_MAX_CHARS} • max {BIO_MAX_LINES} lines
              </Text>
            </View>

            {/* Birthday */}
            <View style={styles.inputBox}>
              <Text style={styles.label}>Birthday</Text>
              <TextInput
                style={styles.textInput}
                value={birthday}
                onChangeText={(t) => setBirthday(formatBirthdayInput(t))}
                keyboardType="number-pad"
                maxLength={10}
                placeholder="DD/MM/YYYY"
                placeholderTextColor="#555"
              />
            </View>

            {/* Gender (chips - popup nahi, isliye smooth) */}
            <View style={styles.inputBox}>
              <Text style={styles.label}>Gender</Text>
              <View style={styles.chipWrap}>
                {GENDERS.map((g) => (
                  <Chip key={g} label={g} active={gender === g} onPress={() => setGender(g)} />
                ))}
              </View>
            </View>

            {/* Category */}
            <View style={styles.inputBox}>
              <Text style={styles.label}>Category</Text>
              <View style={styles.chipWrap}>
                {CATEGORIES.map((c) => (
                  <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
                ))}
              </View>
            </View>

            {/* Email (read-only) */}
            <View style={[styles.inputBox, { borderTopWidth: 0.5, borderTopColor: '#222', paddingTop: 15 }]}>
              <Text style={styles.label}>Linked Account Email</Text>
              <View style={styles.emailBox}>
                <Ionicons name="mail-outline" size={16} color="#555" style={{ marginRight: 8 }} />
                <Text style={styles.emailText}>{email}</Text>
              </View>
              <Text style={styles.helper}>Security reasons ki wajah se Email change nahi ho sakta.</Text>
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
              {saving ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>

            <View style={{ height: 50 }} />
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
  headerSave: { color: '#FFD700', fontSize: 16, fontWeight: 'bold' },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#222' },
  blueLink: { color: '#0095f6', textAlign: 'center', fontWeight: 'bold', marginVertical: 10 },
  inputBox: { marginBottom: 18 },
  label: { fontSize: 12, color: '#888', marginBottom: 5, fontWeight: '500' },
  textInput: { borderBottomWidth: 1, borderColor: '#222', paddingVertical: 5, fontSize: 16, color: '#fff' },
  helper: { fontSize: 11, color: '#555', marginTop: 5, fontStyle: 'italic' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#1c1c1c', borderWidth: 1, borderColor: '#2a2a2a' },
  chipOn: { backgroundColor: '#FFD700', borderColor: '#FFD700' },
  chipText: { color: '#ccc', fontSize: 13, fontWeight: '500' },
  chipTextOn: { color: '#000', fontWeight: 'bold' },
  emailBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#252525', marginTop: 5 },
  emailText: { fontSize: 15, color: '#666', fontWeight: '500' },
  saveBtn: { backgroundColor: '#FFD700', borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 25 },
  saveBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
});
