import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
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
import { uploadDpToR2 } from '../utils/api';
import { NAME_MAX, sanitizeName, validateName } from '../utils/profileHelpers';
import { auth, db } from './firebaseConfig';

const YELLOW = '#FFEB00';

// Pehli baar login ke baad: name + photo laga ke Save -> profile khulti hai
export default function SetupProfileScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState('');

  // Back dabane se setup skip na ho
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const user = auth.currentUser;
    if (!user) {
      router.replace('/login');
      return;
    }
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (cancelled) return;
        const d: any = snap.exists() ? snap.data() : {};
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

  const handleSave = async () => {
    if (saving) return;
    const user = auth.currentUser;
    if (!user) return;

    const cleanName = sanitizeName(name).trim();
    const nameError = validateName(cleanName);
    if (nameError) return Alert.alert('Name Error', nameError);

    setSaving(true);
    try {
      const imageUrl =
        photo && photo.startsWith('file://') ? await uploadDpToR2(photo) : photo;

      await setDoc(
        doc(db, 'users', user.uid),
        {
          name: cleanName,
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

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <StatusBar backgroundColor="#111" barStyle="light-content" />

      <View style={styles.header}>
        <View style={{ width: 50 }} />
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving || !ready} hitSlop={12} style={{ width: 50, alignItems: 'flex-end' }}>
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
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 36 }}
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
              <Text style={styles.photoLink}>Photo lagao</Text>
            </TouchableOpacity>

            <View style={{ marginTop: 28 }}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={(t) => setName(sanitizeName(t))}
                maxLength={NAME_MAX}
                autoCorrect={false}
                placeholder="Apna naam"
                placeholderTextColor="#555"
              />
              <Text style={styles.helper}>{name.length}/{NAME_MAX}</Text>
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveText}>Save</Text>}
            </TouchableOpacity>
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
  helper: { fontSize: 11, color: '#555', marginTop: 5 },
  saveBtn: { backgroundColor: YELLOW, borderRadius: 12, height: 56, alignItems: 'center', justifyContent: 'center', marginTop: 36 },
  saveText: { color: '#000', fontSize: 17, fontWeight: '800' },
});
