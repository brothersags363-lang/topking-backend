import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import * as NavigationBar from 'expo-navigation-bar';
import messaging from '@react-native-firebase/messaging';

import { LiveProvider } from '../context/LiveContext';
import LiveMiniPlayer from '../components/LiveMiniPlayer';

export default function RootLayout() {

  useEffect(() => {

    NavigationBar.setBackgroundColorAsync('#000000');
    NavigationBar.setButtonStyleAsync('light');

  }, []);


  useEffect(() => {

    const unsubscribe = messaging().onMessage(
      async remoteMessage => {

        console.log(
          "FCM MESSAGE =",
          remoteMessage
        );

      }
    );

    return unsubscribe;

  }, []);


  return (

    <LiveProvider>

      <Stack
        screenOptions={{
          headerShown: false
        }}
      />

      <LiveMiniPlayer />

    </LiveProvider>

  );

}