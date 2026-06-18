import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';

import { useRouter } from 'expo-router';
import { auth, db } from './firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';

export default function EditScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');

  const saveProfile = async () => {
    try {
      const user = auth.currentUser;

      if (!user) {
        Alert.alert('Login Required');
        return;
      }

      await setDoc(
        doc(db, 'users', user.uid),
        {
          name,
          username: name.toLowerCase().replace(/\s/g, ''),
          bioText: bio,
          email: user.email,
          uid: user.uid,
        },
        { merge: true }
      );

      Alert.alert('Success', 'Profile Saved');

      router.replace('/(tabs)/profile');
    } catch (error) {
      console.log(error);
      Alert.alert('Error', 'Profile save failed');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Edit Profile</Text>

      <TextInput
        style={styles.input}
        placeholder="Name"
        value={name}
        onChangeText={setName}
      />

      <TextInput
        style={styles.input}
        placeholder="Bio"
        value={bio}
        onChangeText={setBio}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={saveProfile}
      >
        <Text style={styles.buttonText}>
          SAVE PROFILE
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
  },

  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 15,
    marginBottom: 15,
    borderRadius: 10,
  },

  button: {
    backgroundColor: '#FFD700',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },

  buttonText: {
    fontWeight: 'bold',
    fontSize: 16,
  },
});