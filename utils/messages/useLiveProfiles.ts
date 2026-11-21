import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

export type LiveProfile = { name?: string; username?: string; profileImg?: string };

// COST FIX: pehle har uid ke users/{uid} par LIVE listener tha. users doc par stars/level/lastSeen
// jaise write aate rehte hain => har write har phone ko 1 read. Messages list me 50-100 uid
// hote hain => hazaron reads. Ab: ek uid ek baar getDoc, 10 min tak cache (DP/naam itni baar nahi badalte).
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { p: LiveProfile; at: number }>();
const inflight = new Set<string>();

async function loadOne(id: string): Promise<LiveProfile | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return null; // taaza hai, dobara nahi
  if (inflight.has(id)) return null;
  inflight.add(id);
  try {
    const snap = await getDoc(doc(getFirestore(), 'users', id));
    if (!snap.exists()) return null;
    const d: any = snap.data();
    const p: LiveProfile = {
      name: d.name || undefined,
      username: d.username || undefined,
      profileImg: d.profileImg || d.photoURL || undefined,
    };
    cache.set(id, { p, at: Date.now() });
    return p;
  } catch {
    return null;
  } finally {
    inflight.delete(id);
  }
}

const same = (a?: LiveProfile, b?: LiveProfile) =>
  !!a && !!b && a.name === b.name && a.username === b.username && a.profileImg === b.profileImg;

export function useLiveProfiles(ids: string[]) {
  const [profiles, setProfiles] = useState<Record<string, LiveProfile>>(() => {
    const init: Record<string, LiveProfile> = {};
    cache.forEach((v, k) => { init[k] = v.p; });
    return init;
  });

  const key = useMemo(
    () => Array.from(new Set(ids.filter(Boolean))).sort().join('|'),
    [ids]
  );

  useEffect(() => {
    const wanted = key ? key.split('|') : [];
    let alive = true;
    // 6-6 ke batch me taaki ek saath bahut getDoc na chalein
    (async () => {
      for (let i = 0; i < wanted.length && alive; i += 6) {
        const part = wanted.slice(i, i + 6);
        const res = await Promise.all(part.map(loadOne));
        if (!alive) return;
        const upd: Record<string, LiveProfile> = {};
        res.forEach((p, j) => { if (p) upd[part[j]] = p; });
        if (Object.keys(upd).length) {
          setProfiles((prev) => {
            let changed = false;
            const next = { ...prev };
            Object.keys(upd).forEach((id) => {
              if (!same(prev[id], upd[id])) { next[id] = upd[id]; changed = true; }
            });
            return changed ? next : prev;
          });
        }
      }
    })();
    return () => { alive = false; };
  }, [key]);

  return profiles;
}
