import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

import messaging from '@react-native-firebase/messaging';


import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId:
    '153552238196-0u22oecct9lgv1h2kk33ipin4n6bb435.apps.googleusercontent.com',
});

const firebaseConfig = {
  apiKey: "AIzaSyCChzgSkXAZvWWAJveduMQp0GmbM1fUEJ4",
  authDomain: "kingofftop-2af35.firebaseapp.com",
  projectId: "kingofftop-2af35",
  storageBucket: "kingofftop-2af35.firebasestorage.app",
  messagingSenderId: "153552238196",
  appId: "1:153552238196:web:e77b6153ad2f04cc5dc321"
};

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

let auth;

try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);

export const getFCMToken = async () => {
  try {
    await messaging().requestPermission();

    const token = await messaging().getToken();

    console.log("FCM TOKEN =", token);

    return token;
  } catch (e) {
    console.log(e);
    return null;
  }
};






export default app;