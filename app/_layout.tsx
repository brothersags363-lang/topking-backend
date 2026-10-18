import { Stack, useRouter, usePathname, useGlobalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  onMessage,
  onNotificationOpenedApp,
  getInitialNotification,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import * as NavigationBar from 'expo-navigation-bar';
import * as Notifications from 'expo-notifications';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

import LiveMiniPlayer from '../components/LiveMiniPlayer';
import { LiveProvider } from '../context/LiveContext';
import { API_BASE } from '../utils/api';
import { auth, db, getFCMToken } from './firebaseConfig';


// ---------------------------------------------------------------
// SPEED: release build me console.log band (JS thread free rahta hai)
// ---------------------------------------------------------------
if (!__DEV__) {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
}


// ---------------------------------------------------------------
// NOTIFICATIONS (module level - app band ho tab bhi register rehta hai)
// ---------------------------------------------------------------

// Android: "messages" channel = sound + popup (heads-up) wala notification
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  }).catch(() => {});
}

// App khula ho tab (foreground) local banner dikhane ke liye
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// App background/killed ho tab FCM message aaye to ye handler chalta hai.
// ("notification" wala message system khud tray me dikha deta hai)
try {
  setBackgroundMessageHandler(getMessaging(getApp()), async () => {});
} catch (e) {}


export default function RootLayout() {

  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();

  // Abhi kaunsi chat khuli hai - usi ka banner nahi dikhana
  const currentRef = useRef({ pathname: '', userId: '' });

  useEffect(() => {
    const u = Array.isArray(params.userId) ? params.userId[0] : params.userId;
    currentRef.current = { pathname, userId: u || '' };
  }, [pathname, params.userId]);


  useEffect(() => {
    NavigationBar.setButtonStyleAsync('light');
  }, []);


  // Notification dabane par Messages screen (messages.tsx) khule
  const openFromData = (data: any) => {
    if (!data || data.type !== 'chat') return;

    setTimeout(() => {
      router.replace('/messages');
    }, 400);
  };


  useEffect(() => {

    const messaging = getMessaging(getApp());

    // 1) App khula hai: banner dikhao (agar usi ki chat khuli nahi hai)
    const unsubForeground = onMessage(messaging, async (remoteMessage: any) => {

      const data = remoteMessage?.data || {};
      if (data.type !== 'chat') return;

      const cur = currentRef.current;
      if (cur.pathname === '/chat' && cur.userId === data.senderUid) return;

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: remoteMessage?.notification?.title || 'New message',
            body: remoteMessage?.notification?.body || '',
            data,
            sound: true,
          },
          trigger: Platform.OS === 'android' ? ({ channelId: 'messages' } as any) : null,
        });
      } catch (e) {}
    });

    // 2) App background me tha, notification dabaya
    const unsubOpened = onNotificationOpenedApp(messaging, (remoteMessage: any) => {
      openFromData(remoteMessage?.data);
    });

    // 3) App band (killed) thi, notification dabane se khuli
    getInitialNotification(messaging)
      .then((remoteMessage: any) => {
        if (remoteMessage) openFromData(remoteMessage.data);
      })
      .catch(() => {});

    // 4) Foreground wale local banner par tap
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromData(response?.notification?.request?.content?.data);
    });

    return () => {
      unsubForeground();
      unsubOpened();
      sub.remove();
    };

  }, []);


  // Login ke baad har baar fresh FCM token save (pehle sirf login screen par hota tha)
  useEffect(() => {

    const unsub = onAuthStateChanged(auth, async (user) => {

      if (!user) return;

      try {
        const token = await getFCMToken();
        if (token) {
          await setDoc(doc(db, 'users', user.uid), { fcmToken: token }, { merge: true });
        }
      } catch (e) {}

    });

    return unsub;

  }, []);


  // Render server so jata hai -> pehla message late jata hai. Isliye jagao.
  useEffect(() => {

    const wake = () => { fetch(API_BASE + '/health').catch(() => {}); };

    wake();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') wake();
    });

    return () => sub.remove();

  }, []);


  return (

    <LiveProvider>

      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />

      <LiveMiniPlayer />

    </LiveProvider>

  );

}
