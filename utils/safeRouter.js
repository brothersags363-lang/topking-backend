// utils/safeRouter.js
// DOUBLE-TAP GUARD: screen dheere khule aur user dobara tap kare to wahi screen
// 3-4 baar push ho jati thi -> phir back 4-6 baar dabana padta tha.
// Ye hook expo-router ke useRouter jaisa hi hai, bas ek hi jagah (same target) par
// LOCK_MS ke andar dobara push/replace/navigate ko ignore kar deta hai.
// Baaki sab (back, canGoBack, setParams, dismiss...) bina badlav ke chalte hain.
import { useMemo } from 'react';
import { useRouter as useExpoRouter } from 'expo-router';

const LOCK_MS = 1200;
let lastKey = null;
let lastAt = 0;

function keyOf(target) {
  try {
    return typeof target === 'string' ? target : JSON.stringify(target);
  } catch (e) {
    return String(target);
  }
}

function allowed(target) {
  const now = Date.now();
  const key = keyOf(target);
  if (key === lastKey && now - lastAt < LOCK_MS) return false;
  lastKey = key;
  lastAt = now;
  return true;
}

export function useRouter() {
  const router = useExpoRouter();
  return useMemo(() => {
    const safe = Object.create(router); // baaki methods prototype se mil jate hain
    ['push', 'replace', 'navigate'].forEach((m) => {
      const orig = router[m];
      if (typeof orig !== 'function') return;
      safe[m] = (...args) => (allowed(args[0]) ? orig.apply(router, args) : undefined);
    });
    return safe;
  }, [router]);
}

export default useRouter;
