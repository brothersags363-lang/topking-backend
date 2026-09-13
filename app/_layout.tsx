import { Stack } from 'expo-router';
import { useEffect } from 'react';

import messaging from '@react-native-firebase/messaging';
import * as NavigationBar from 'expo-navigation-bar';

import LiveMiniPlayer from '../components/LiveMiniPlayer';
import { LiveProvider } from '../context/LiveContext';

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