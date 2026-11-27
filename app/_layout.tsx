// SPEED: release build me console.log band (sabse pehle, taaki baaki imports ke logs bhi band hon)
import '../utils/silenceLogs';
import { Stack, usePathname, useGlobalSearchParams } from 'expo-router';
import { useRouter } from '../utils/safeRouter';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Linking, Platform, View, Text, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

import { Image as ExpoImage } from 'expo-image';
import { AVATAR_FALLBACK } from '../utils/profileHelpers';
import LiveMiniPlayer from '../components/LiveMiniPlayer';
import ScreenDepthGate from '../components/ScreenDepthGate';
import { LiveProvider } from '../context/LiveContext';
import { API_BASE, registerDevice } from '../utils/api';
import { onDeviceBanned } from '../utils/deviceId';
import { startKeepWarm } from '../utils/warmBackend';
import { setCurrentPath } from '../utils/scopedBack';
// @ts-ignore (JS file)
import { GUEST_ALLOWED } from '../utils/requireLogin';
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


// Sirf ye chhota component route badalne par re-render hota hai (UI kuch nahi dikhata).
function RouteTracker({ currentRef, pathRef }: { currentRef: any; pathRef: any }) {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const u = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const idp = Array.isArray(params.id) ? params.id[0] : params.id;

  useEffect(() => {
    currentRef.current = { pathname, userId: u || '', id: idp || '' };
    pathRef.current = pathname;
    setCurrentPath(pathname); // scoped back handlers ko batao ki abhi kaunsi screen upar hai
  }, [pathname, u, idp]);

  return null;
}


// AUTH GATE: bina login sirf For You feed (aur login page). Kisi bhi aur page par
// (button, notification, share link, kuch bhi) bina login pahunche to login page.
function AuthGate() {
  const pathname = usePathname();
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [hasUser, setHasUser] = useState(!!auth.currentUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setHasUser(!!u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!authReady || hasUser) return;
    const p = pathname || '/';
    if (GUEST_ALLOWED.includes(p)) return;
    try { router.replace('/login' as any); } catch (e) {}
  }, [authReady, hasUser, pathname]);

  return null;
}


export default function RootLayout() {
  // SPEED: jinki photo nahi unki default photo (flaticon) app khulte hi ek baar phone me.
  // Pehle har list / comment / chat me pehli baar net se aati thi (slow net par khaali gola).
  useEffect(() => {
    try { ExpoImage.prefetch([AVATAR_FALLBACK], 'memory-disk').catch(() => {}); } catch (e) {}
  }, []);


  const router = useRouter();

  // Abhi kaunsi chat khuli hai - usi ka banner nahi dikhana.
  // SPEED: usePathname/useGlobalSearchParams yaha NAHI hain (har navigation par poora
  // root + LiveProvider re-render hota tha). Unhe chhota RouteTracker component sambhalta hai.
  const currentRef = useRef({ pathname: '', userId: '', id: '' });

  // Render server ko app khulte hi jagao + khula rahe to jagaye rakho ("Waking up server" 30-40 sec wali deri)
  useEffect(() => startKeepWarm(), []);


  useEffect(() => {
    NavigationBar.setButtonStyleAsync('light');
  }, []);


  // APP KHULTE HI notification permission maango (Android 13+ / iOS).
  // - Pehli baar: system ka "Allow notifications?" dialog aata hai.
  // - Agar user ne pehle "Don't allow" kar diya (dobara system dialog nahi aata):
  //   ek chhota "Turn on" popup -> seedha Settings kholta hai (din me sirf 1 baar).
  // permReady: jab tak ye dialog khula hai tab tak FCM token wala code ruka rahe (double dialog na aaye)
  const permReady = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let cancelled = false;

    permReady.current = (async () => {
      try {
        let perm = await Notifications.getPermissionsAsync();
        if (cancelled || perm.granted) return;

        if (perm.canAskAgain) {
          await Notifications.requestPermissionsAsync();
          return;
        }

        // canAskAgain = false -> sirf Settings se on ho sakta hai
        const KEY = 'notifSettingsPromptAt';
        const last = Number((await AsyncStorage.getItem(KEY)) || 0);
        if (Date.now() - last < 24 * 60 * 60 * 1000) return; // din me ek baar
        await AsyncStorage.setItem(KEY, String(Date.now()));
        if (cancelled) return;

        Alert.alert(
          'Turn on notifications',
          'Messages, live aur payment ke alerts paane ke liye notifications ON karo.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } },
          ]
        );
      } catch (e) {}
    })();

    return () => { cancelled = true; };
  }, []);


  // SAFETY NET: kisi bhi screen par back dabane se app band na ho.
  // History hai to normal back (return false), history nahi hai to Home par jao.
  // Screen ka apna handler (wallet jaisa) pehle chalta hai; ye sabse last me.
  const pathRef = useRef('');
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      try {
        if (router.canGoBack()) return false;
        const p = pathRef.current || '/';
        if (p === '/' || p === '/index') return false; // Home par hi ho to app band hone do
        router.replace('/' as any);
        return true;
      } catch (e) {
        return false;
      }
    });
    return () => sub.remove();
  }, [router]);


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
        } else if (
          (data.type === 'video_like' || data.type === 'comment' || data.type === 'video_share') &&
          data.videoId
        ) {
          // like / comment / bheja hua video -> wahi video kholo
          router.push({ pathname: '/openVideo', params: { id: String(data.videoId) } } as any);
        } else if (data.type === 'live_share' && data.roomId) {
          // dost ne live room share kiya -> live kholo
          router.push({ pathname: '/openLive', params: { id: String(data.roomId) } } as any);
        } else if (data.type === 'follow' && data.senderUid) {
          router.push({ pathname: '/userProfile', params: { userId: String(data.senderUid) } } as any);
        } else if (data.type === 'payment') {
          // admin ne payment bheji -> payment details + screenshot
          router.push({ pathname: '/paymentProofs', params: { id: String(data.proofId || '') } } as any);
        } else if (data.type === 'announcement') {
          // admin ki ghoshna
          router.push({ pathname: '/announcements', params: { id: String(data.announcementId || '') } } as any);
        }
      } catch (e) {}
    }, 400);
  };


  useEffect(() => {

    const messaging = getMessaging(getApp());

    // 1) App khula hai: banner dikhao (agar usi ki chat khuli nahi hai)
    const unsubForeground = onMessage(messaging, async (remoteMessage: any) => {

      const data = remoteMessage?.data || {};
      if (!['chat', 'live', 'video_like', 'follow', 'comment', 'video_share', 'live_share', 'payment', 'announcement'].includes(data.type)) return;

      const cur = currentRef.current;
      // jis chat/live me pehle se ho uska banner nahi
      if (data.type === 'chat' && cur.pathname === '/chat' && cur.userId === data.senderUid) return;
      if ((data.type === 'live' || data.type === 'live_share') && cur.id && cur.id === data.roomId) return;

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
              ? ({ channelId: data.type === 'chat' || data.type === 'video_share' ? 'messages' : data.type === 'live' || data.type === 'live_share' ? 'live' : 'activity' } as any)
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
        await permReady.current; // permission dialog khatam hone do, phir token lo
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
          // SPEED: Instagram (Android) jaisi tez right-se-slide animation
          animation: 'slide_from_right',
          animationDuration: 220,
          // SPEED: neeche wali (chhupi) screens re-render nahi hoti (jaise feed / profile jab
          // aap chat ya live me ho). Listener / audio chalte rehte hain, sirf screen ka
          // dobara banna wapas aane tak ruk jaata hai. Tabs me ye pehle se tha.
          freezeOnBlur: true,
        }}
        // Sirf upar ki 3 screens mounted; neeche wali unload (live/editor protected)
        screenLayout={({ route, children }: any) => (
          <ScreenDepthGate route={route}>{children}</ScreenDepthGate>
        )}
      />

      <RouteTracker currentRef={currentRef} pathRef={pathRef} />

      <AuthGate />

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
