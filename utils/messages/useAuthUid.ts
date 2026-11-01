import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { useEffect, useState } from 'react';

// Sirf uid string rakhta hai (poora user object nahi) -> faltu re-render nahi
export function useAuthUid(): string | undefined {
  const [uid, setUid] = useState<string | undefined>(() => getAuth().currentUser?.uid);

  useEffect(() => onAuthStateChanged(getAuth(), (u) => setUid(u?.uid)), []);

  return uid;
}
