import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import messaging from '@react-native-firebase/messaging';

export default function RootLayout() {

  useEffect(() => {
    NavigationBar.setBackgroundColorAsync('#000000');
    NavigationBar.setButtonStyleAsync('light');
  }, []);

  useEffect(() => {

    const unsubscribe =
      messaging().onMessage(
        async remoteMessage => {

          console.log("FCM MESSAGE =", remoteMessage);

          Alert.alert(
            remoteMessage?.notification?.title || "Notification",
            remoteMessage?.notification?.body || ""
          );

        }
      );

    return unsubscribe;

  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}