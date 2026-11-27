// Messages tab ki 2 extra rows: "Payments" (admin ne bheji payment) aur "Announcements" (admin ki ghoshna)
//   users/{uid}/paymentProofs   -> unread = seen !== true
//   announcements               -> unread = jo "last seen" ke baad aaye (phone me yaad rehta hai)
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageRow, timeAgo, toMillis } from '../../components/messages/data';

const SEEN_KEY = 'announcementsSeenAt';

export async function markAnnouncementsSeen() {
  try {
    await AsyncStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch (e) {}
}

export function useAdminInbox(uid: string | undefined) {
  const [proofs, setProofs] = useState<any[]>([]);
  const [anns, setAnns] = useState<any[]>([]);
  const [seenAt, setSeenAt] = useState(0);

  const reloadSeen = useCallback(async () => {
    try {
      setSeenAt(Number(await AsyncStorage.getItem(SEEN_KEY)) || 0);
    } catch (e) {}
  }, []);

  useEffect(() => {
    reloadSeen();
  }, [reloadSeen]);

  useEffect(() => {
    if (!uid) {
      setProofs([]);
      return;
    }
    const q = query(
      collection(getFirestore(), 'users', uid, 'paymentProofs'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    return onSnapshot(
      q,
      (snap) => setProofs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {}
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setAnns([]);
      return;
    }
    const q = query(collection(getFirestore(), 'announcements'), orderBy('createdAtMs', 'desc'), limit(30));
    return onSnapshot(
      q,
      (snap) => setAnns(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {}
    );
  }, [uid]);

  const adminRows: MessageRow[] = useMemo(() => {
    const rows: MessageRow[] = [];

    const p = proofs[0];
    rows.push({
      id: 'payments',
      type: 'payment',
      title: 'Payments',
      subtitle: p
        ? `₹${Number(p.amount || 0).toLocaleString('en-IN')} aapko bheja gaya`
        : 'Koi payment nahi aayi',
      time: p ? timeAgo(toMillis(p.createdAt)) : undefined,
      unread: proofs.filter((x) => x.seen !== true).length,
      verified: true,
      route: '/paymentProofs',
    });

    const a = anns[0];
    rows.push({
      id: 'announcements',
      type: 'announcement',
      title: 'Announcements',
      subtitle: a ? String(a.title || a.text || 'Nayi ghoshna').slice(0, 60) : 'Abhi koi ghoshna nahi',
      time: a ? timeAgo(Number(a.createdAtMs) || 0) : undefined,
      unread: anns.filter((x) => (Number(x.createdAtMs) || 0) > seenAt).length,
      verified: true,
      route: '/announcements',
    });

    return rows;
  }, [proofs, anns, seenAt]);

  return { adminRows, reloadSeen };
}
