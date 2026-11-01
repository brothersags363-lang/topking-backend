// utils/useTabBack.js
// Follow / Discover me hardware back dabane par HAMESHA For You (/) khulega.
// - useIsFocused + useEffect: tab frozen ho tab bhi focus milte hi handler lagta hai
// - navigate('/') pehle; agar screen phir bhi nahi badli to replace('/') fallback
// - sirf focused screen ka handler active rehta hai
import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';

export default function useTabBack() {
  const router = useRouter();
  const navigation = useNavigation();
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const lastRef = useRef(0);

  useEffect(() => {
    if (!focused) return undefined;

    const onBack = () => {
      // double-tap guard
      const now = Date.now();
      if (now - lastRef.current < 350) return true;
      lastRef.current = now;

      console.log('[TabBack] back pressed -> For You');
      try {
        router.navigate('/');
      } catch (e) {
        try { router.replace('/'); } catch (e2) {}
      }
      // navigate se screen nahi badli to replace se zabardasti For You
      setTimeout(() => {
        if (focusedRef.current) {
          try { router.replace('/'); } catch (e) {}
        }
      }, 150);
      return true; // app band nahi hoga
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);

    // header / gesture se back (beforeRemove) bhi For You par bheje
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (e?.data?.action?.type === 'GO_BACK' || e?.data?.action?.type === 'POP') {
        e.preventDefault();
        onBack();
      }
    });

    return () => {
      sub.remove();
      unsub && unsub();
    };
  }, [focused, router, navigation]);
}
