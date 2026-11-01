// users/{uid}/notifications (follow / like / comment) + derived rows
import {
  collection,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageRow, NOTIF_ROWS, timeAgo, toMillis } from '../../components/messages/data';

export function useNotifications(uid: string | undefined) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const ref = useRef<any[]>([]);

  useEffect(() => {
    if (!uid) {
      ref.current = [];
      setNotifications([]);
      return;
    }
    const q = query(
      collection(getFirestore(), 'users', uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        ref.current = list;
        setNotifications(list);
      },
      (err) => console.log('Notifications error:', err)
    );
  }, [uid]);

  // ek hi pass me: latest + unread count har type ka (pehle 3-4 baar filter hota tha)
  const { notifRows, unreadByType } = useMemo(() => {
    const latest: Record<string, any> = {};
    const unread: Record<string, number> = {};
    for (const n of notifications) {
      if (!latest[n.type]) latest[n.type] = n; // desc sorted -> pehla = latest
      if (!n.isRead) unread[n.type] = (unread[n.type] || 0) + 1;
    }
    const rows: MessageRow[] = NOTIF_ROWS.map((cfg) => {
      const l = latest[cfg.notifType];
      return {
        id: cfg.id,
        type: cfg.rowType,
        title: cfg.title,
        subtitle: l ? `${l.senderName || 'Someone'} ${cfg.action}` : cfg.empty,
        time: l ? timeAgo(toMillis(l.createdAt)) : undefined,
        unread: unread[cfg.notifType] || 0,
        route: '',
      };
    });
    return { notifRows: rows, unreadByType: unread };
  }, [notifications]);

  // N updateDoc ki jagah ek batch write
  const markTypeRead = useCallback(
    async (type: string) => {
      if (!uid) return;
      const unread = ref.current.filter((n) => n.type === type && !n.isRead);
      if (!unread.length) return;
      const db = getFirestore();
      const batch = writeBatch(db);
      unread.forEach((n) => batch.update(doc(db, 'users', uid, 'notifications', n.id), { isRead: true }));
      await batch.commit();
    },
    [uid]
  );

  return { notifications, notifRows, unreadByType, markTypeRead };
}
