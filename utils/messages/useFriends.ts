// userChats/{uid}/friends - realtime pehla page + scroll par agle pages
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
} from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isFaceVerified } from '../../components/UserTick';

const PAGE = 10;
const ENRICH_TTL = 5 * 60 * 1000;
const ENRICH_FLUSH_MS = 150;

type Badges = { level: number; verified: boolean; verifiedColor: string; faceVerified: boolean };

const enrichCache = new Map<string, Badges & { at: number }>();
const enrichInflight = new Set<string>();

const DEFAULT_BADGES: Badges = { level: 1, verified: false, verifiedColor: 'white', faceVerified: false };
const WATCH = ['userId', 'username', 'profileImg', 'lastMessage', 'unreadCount'];

const ms = (t: any) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);

// Agar item me kuch nahi badla to purana object hi wapas -> FriendRow re-render nahi hota
const sameItem = (a: any, b: any) =>
  WATCH.every((k) => a[k] === b[k]) && ms(a.updatedAt) === ms(b.updatedAt);

const pickBadges = (o: any): Badges => ({
  level: o.level,
  verified: o.verified,
  verifiedColor: o.verifiedColor,
  faceVerified: o.faceVerified,
});

export function useFriends(uid: string | undefined) {
  const [friends, setFriends] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const cursorRef = useRef<any>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const pagesRef = useRef(0);
  const pendingRef = useRef(new Map<string, Badges>());
  const timerRef = useRef<any>(null);

  hasMoreRef.current = hasMore;

  // badges ek saath apply (har user par alag setState nahi)
  const flushBadges = useCallback(() => {
    timerRef.current = null;
    const batch = pendingRef.current;
    if (!batch.size) return;
    pendingRef.current = new Map();
    setFriends((prev) =>
      prev.map((it) => (batch.has(it.userId) ? { ...it, ...batch.get(it.userId) } : it))
    );
  }, []);

  const enrich = useCallback(
    (docs: any[]) => {
      const db = getFirestore();
      const now = Date.now();
      docs.forEach(async (d) => {
        const fid = d.data().userId;
        if (!fid || enrichInflight.has(fid)) return;
        const cached = enrichCache.get(fid);
        if (cached && now - cached.at < ENRICH_TTL) return;

        enrichInflight.add(fid);
        try {
          const [walletSnap, userSnap] = await Promise.all([
            getDoc(doc(db, 'wallets', fid)),
            getDoc(doc(db, 'users', fid)),
          ]);
          const u: any = userSnap.exists() ? userSnap.data() : null;
          const info: Badges = {
            level: walletSnap.exists() ? (walletSnap.data() as any).level || 1 : 1,
            verified: u ? u.verified === true : false,
            verifiedColor: u ? u.verifiedColor || 'white' : 'white',
            faceVerified: u ? isFaceVerified(u) : false,
          };
          enrichCache.set(fid, { ...info, at: Date.now() });
          pendingRef.current.set(fid, info);
          if (!timerRef.current) timerRef.current = setTimeout(flushBadges, ENRICH_FLUSH_MS);
        } catch (e) {
          console.log('Friend enrich error:', e);
        } finally {
          enrichInflight.delete(fid);
        }
      });
    },
    [flushBadges]
  );

  const applyDocs = useCallback(
    (docs: any[], append: boolean) => {
      setFriends((prev) => {
        const prevById = new Map(prev.map((i) => [i.id, i]));
        const list = docs.map((d) => {
          const fresh: any = { id: d.id, ...d.data() };
          const old = prevById.get(d.id);
          if (old && sameItem(old, fresh)) return old;
          const cached = enrichCache.get(fresh.userId);
          const badges = old ? pickBadges(old) : cached ? pickBadges(cached) : DEFAULT_BADGES;
          return { ...fresh, ...badges };
        });

        if (append) {
          list.forEach((i) => prevById.set(i.id, i));
          return Array.from(prevById.values());
        }
        if (pagesRef.current <= 1) return list;
        const firstIds = new Set(list.map((i) => i.id));
        return [...list, ...prev.filter((i) => !firstIds.has(i.id))];
      });

      if (docs.length > 0 && (append || !cursorRef.current)) {
        cursorRef.current = docs[docs.length - 1];
      }
      if (append || pagesRef.current <= 1) setHasMore(docs.length >= PAGE);
      enrich(docs);
    },
    [enrich]
  );

  useEffect(() => {
    cursorRef.current = null;
    pagesRef.current = 0;
    loadingRef.current = false;
    pendingRef.current = new Map();
    setFriends([]);
    setHasMore(true);
    if (!uid) return;

    const q = query(
      collection(getFirestore(), 'userChats', uid, 'friends'),
      orderBy('updatedAt', 'desc'),
      limit(PAGE)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        applyDocs(snap.docs, false);
        if (pagesRef.current === 0) pagesRef.current = 1;
      },
      (err) => console.log('Friends listener error:', err)
    );
    return () => {
      unsub();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [uid, applyDocs]);

  const loadMore = useCallback(async () => {
    if (!uid || !hasMoreRef.current || loadingRef.current || !cursorRef.current) return;

    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const q = query(
        collection(getFirestore(), 'userChats', uid, 'friends'),
        orderBy('updatedAt', 'desc'),
        startAfter(cursorRef.current),
        limit(PAGE)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setHasMore(false);
        return;
      }
      applyDocs(snap.docs, true);
      pagesRef.current += 1;
      if (snap.docs.length < PAGE) setHasMore(false);
    } catch (e) {
      console.log('Load more friends error:', e);
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [uid, applyDocs]);

  return { friends, loadingMore, loadMore };
}
