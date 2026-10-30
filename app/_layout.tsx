import { Stack, useRouter, usePathname, useGlobalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert, AppState, Platform, View, Text, TouchableOpacity } from 'react-native';

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
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

import LiveMiniPlayer from '../components/LiveMiniPlayer';
import { LiveProvider } from '../context/LiveContext';
import { API_BASE, registerDevice } from '../utils/api';
import { onDeviceBanned } from '../utils/deviceId';
import { auth, db, getFCMToken } from './firebaseConfig';


// ---------------------------------------------------------------
// SPEED: release build me console.log band (JS thread free rahta hai)
// ---------------------------------------------------------------
if (!__DEV__) {
  // Non-fatal JS errors poori app crash na karein (Play Console: ExceptionsManager JavaScriptException).
  try {
    const EU = (global as any).ErrorUtils;
    const prev = EU && EU.getGlobalHandler && EU.getGlobalHandler();
    if (EU && prev) {
      EU.setGlobalHandler((err: any, isFatal?: boolean) => {
        if (isFatal) prev(err, isFatal);
      });
    }
  } catch (e) {}
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
}


// ---------------------------------------------------------------
// NOTIFICATIONS (module level - app band ho tab bhi register rehta hai)
// ---------------------------------------------------------------

// Android: "messages" channel = sound + popup (heads-up) wala notification
if (Platform.OS === 'android') {
  const makeChannel = (id: string, name: string) =>
    Notifications.setNotificationChannelAsync(id, {
      name,
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    }).catch(() => {});

  makeChannel('messages', 'Messages'); // chat
  makeChannel('live', 'Live');         // followed user live aaya
  makeChannel('activity', 'Activity'); // likes milestone, new follower
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
  const currentRef = useRef({ pathname: '', userId: '', id: '' });

  useEffect(() => {
    const u = Array.isArray(params.userId) ? params.userId[0] : params.userId;
    const idp = Array.isArray(params.id) ? params.id[0] : params.id;
    currentRef.current = { pathname, userId: u || '', id: idp || '' };
  }, [pathname, params.userId]);


  useEffect(() => {
    NavigationBar.setButtonStyleAsync('light');
  }, []);


  // Notification dabane par Messages screen (messages.tsx) khule
  const openFromData = (data: any) => {
    if (!data || !data.type) return;

    setTimeout(() => {
      try {
        if (data.type === 'chat') {
          router.replace('/messages');
        } else if (data.type === 'live' && data.roomId) {
          // live room kholo (openLive.js khud check karta hai ki live chal rahi hai ya nahi)
          router.push({ pathname: '/openLive', params: { id: String(data.roomId) } } as any);
        } else if (data.type === 'video_like' && data.videoId) {
          router.push({ pathname: '/openVideo', params: { id: String(data.videoId) } } as any);
        } else if (data.type === 'follow' && data.senderUid) {
          router.push({ pathname: '/userProfile', params: { userId: String(data.senderUid) } } as any);
        }
      } catch (e) {}
    }, 400);
  };


  useEffect(() => {

    const messaging = getMessaging(getApp());

    // 1) App khula hai: banner dikhao (agar usi ki chat khuli nahi hai)
    const unsubForeground = onMessage(messaging, async (remoteMessage: any) => {

      const data = remoteMessage?.data || {};
      if (!['chat', 'live', 'video_like', 'follow'].includes(data.type)) return;

      const cur = currentRef.current;
      // jis chat/live me pehle se ho uska banner nahi
      if (data.type === 'chat' && cur.pathname === '/chat' && cur.userId === data.senderUid) return;
      if (data.type === 'live' && cur.id && cur.id === data.roomId) return;

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: remoteMessage?.notification?.title || (data.type === 'chat' ? 'New message' : 'TopKing'),
            body: remoteMessage?.notification?.body || '',
            data,
            sound: true,
          },
          trigger:
            Platform.OS === 'android'
              ? ({ channelId: data.type === 'chat' ? 'messages' : data.type === 'live' ? 'live' : 'activity' } as any)
              : null,
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


  // Device ban: koi bhi API "DEVICE_BANNED" de to turant logout + login screen
  useEffect(() => {
    let shown = false;
    const off = onDeviceBanned(() => {
      signOut(auth).catch(() => {});
      if (!shown) {
        shown = true;
        Alert.alert('Device Banned', 'This device has been banned.', [
          { text: 'OK', onPress: () => { shown = false; } },
        ]);
      }
      try { router.replace('/login' as any); } catch (e) {}
    });
    return off;
  }, []);


  // Login ke baad har baar fresh FCM token save (pehle sirf login screen par hota tha)
  useEffect(() => {

    const unsub = onAuthStateChanged(auth, async (user) => {

      if (!user) return;

      // Har app launch par device ko user se jodo (banned ho to api.js khud DEVICE_BANNED event deta hai)
      registerDevice().catch(() => {});

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


// Kisi screen ke render me error aaye to poori app band nahi hogi,
// sirf ye screen dikhegi aur "Try again" se wapas chalegi.
export function ErrorBoundary({ retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Something went wrong</Text>
      <Text style={{ color: '#aaa', fontSize: 14, textAlign: 'center', marginBottom: 20 }}>Please try again.</Text>
      <TouchableOpacity
        onPress={() => retry()}
        style={{ backgroundColor: '#f1c40f', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 }}
      >
        <Text style={{ color: '#000', fontWeight: '700' }}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}
