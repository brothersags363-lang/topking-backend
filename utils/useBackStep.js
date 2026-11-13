// utils/useBackStep.js
// Mobile back button dabane par app band NAHI hogi - wallet.tsx jaisa ek step peeche jayegi.
// - pehle `extra` (optional) chalta hai: true return kare to wahi handle (jaise OTP step se wapas)
// - history hai to router.back(); history nahi hai (screen seedha khuli) to fallback par replace
// - sirf focused screen ka handler active rehta hai
import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useRouter } from './safeRouter';
import { useIsFocused } from '@react-navigation/native';

export default function useBackStep(fallback = '/', extra) {
  const router = useRouter();
  const focused = useIsFocused();
  const extraRef = useRef(extra);
  extraRef.current = extra;

  useEffect(() => {
    if (!focused) return undefined;

    const onBack = () => {
      try {
        if (extraRef.current && extraRef.current() === true) return true;
      } catch (e) {}
      try {
        if (router.canGoBack()) router.back();
        else router.replace(fallback);
      } catch (e) {
        try { router.replace(fallback); } catch (e2) {}
      }
      return true; // app band nahi hogi
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [focused, router, fallback]);
}
