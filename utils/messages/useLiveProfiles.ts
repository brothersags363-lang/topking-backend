import { doc, getFirestore, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';

export type LiveProfile = { name?: string; username?: string; profileImg?: string };

// Diye gaye uids ke users/{uid} docs ko live sunta hai.
// Kisi ne dp ya name change kiya to yahan turant update aa jata hai.
export function useLiveProfiles(ids: string[]) {
  const [profiles, setProfiles] = useState<Record<string, LiveProfile>>({});
  const subs = useRef<Record<string, () => void>>({});

  const key = useMemo(
    () => Array.from(new Set(ids.filter(Boolean))).sort().join('|'),
    [ids]
  );

  useEffect(() => {
    const wanted = key ? key.split('|') : [];
    const db = getFirestore();

    // naye uids ke liye listener lagao
    wanted.forEach((id) => {
      if (subs.current[id]) return;
      subs.current[id] = onSnapshot(
        doc(db, 'users', id),
        (snap) => {
          if (!snap.exists()) return;
          const d: any = snap.data();
          const next: LiveProfile = {
            name: d.name || undefined,
            username: d.username || undefined,
            profileImg: d.profileImg || d.photoURL || undefined,
          };
          setProfiles((prev) => {
            const old = prev[id];
            if (
              old &&
              old.name === next.name &&
              old.username === next.username &&
              old.profileImg === next.profileImg
            )
              return prev; // kuch nahi badla, re-render mat karo
            return { ...prev, [id]: next };
          });
        },
        () => {}
      );
    });

    // jo uids ab list me nahi hain unke listener band karo
    Object.keys(subs.current).forEach((id) => {
      if (!wanted.includes(id)) {
        subs.current[id]();
        delete subs.current[id];
      }
    });
  }, [key]);

  // screen band hone par sab listener band
  useEffect(
    () => () => {
      Object.values(subs.current).forEach((u) => u());
      subs.current = {};
    },
    []
  );

  return profiles;
}
