// Firestore `rooms` (all-live jaisa data). Sirf tab chalta hai jab screen focus me ho
// aur ChatRoom tab mount ho. Updates 1.5 sec me max ek baar aur sirf badlav par.
import { useNavigation } from 'expo-router';
import { collection, getFirestore, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Room } from '../../components/messages/data';

const HEARTBEAT_TIMEOUT = 10 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const FLUSH_GAP = 1500;
const ROOM_FALLBACK_COVER = 'https://picsum.photos/seed/livecover/400/400';
const ROOM_FALLBACK_AVATAR = 'https://avatar.iran.liara.run/public/65';

// tab badalne par spinner na dikhe isliye last list yaad rakhte hain
let roomsCache: Room[] | null = null;

const toMs = (value: any): number => {
  if (!value) return 0;
  try {
    if (typeof value === 'number') return value;
    if (typeof value === 'object' && value.seconds) return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return isNaN(parsed) ? 0 : parsed;
  } catch {
    return 0;
  }
};

const heartbeatMs = (raw: any) => toMs(raw.hostHeartbeat) || toMs(raw.lastHeartbeat);

const isRoomAlive = (raw: any) => {
  const st = raw.status ? String(raw.status).toLowerCase().trim() : '';
  if (st === 'ended' || st === 'inactive' || st === 'closed') return false;
  const hb = heartbeatMs(raw);
  if (!hb) return true;
  return Date.now() - hb <= HEARTBEAT_TIMEOUT;
};

const validUrl = (v: any) => (typeof v === 'string' && v.trim().length > 10 ? v.trim() : null);

const sigOf = (l: Room[]) =>
  l
    .map(
      (r) =>
        `${r.id}|${r.title}|${r.host}|${r.users}|${r.type}|${r.layout}|${r.cover}|${r.hostImg}|${r.guests.join(',')}|${r.isFamily ? 1 : 0}`
    )
    .join('~');

const parseRoom = (id: string, raw: any, now: number): Room | null => {
  if (!isRoomAlive(raw)) return null;

  const roomType = String(raw.roomType || 'public').toLowerCase();
  const isFamily = roomType === 'family' || !!raw.familyId || !!raw.isFamily;
  if (roomType !== 'public' && !isFamily) return null;

  const created = toMs(raw.createdAt);
  if (created && now - created > ONE_DAY) return null;

  const hostId = raw.hostId || raw.seatsData?.seat_1?.userId || null;
  const hostImg = validUrl(raw.hostImg) || validUrl(raw.profileImg);
  const cover =
    validUrl(raw.roomCover) ||
    validUrl(raw.cover) ||
    validUrl(raw.banner) ||
    validUrl(raw.roomImg) ||
    hostImg ||
    ROOM_FALLBACK_COVER;

  const guests = Object.keys(raw.seatsData || {})
    .sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]))
    .map((k) => raw.seatsData[k] || {})
    .filter((st: any) => st.userId && st.userId !== hostId && validUrl(st.userImg))
    .slice(0, 6) // card me sirf 6 dikhte hain
    .map((st: any) => validUrl(st.userImg) as string);

  return {
    id,
    hostId,
    title: raw.title || raw.roomName || 'Live Broadcast',
    host: raw.hostName || raw.host || 'User',
    type: String(raw.type || 'audio').toLowerCase(),
    layout: String(raw.roomLayout || 'chat').toLowerCase(),
    users: Math.max(0, Number(raw.viewerCount) || 0),
    cover,
    hostImg: hostImg || ROOM_FALLBACK_AVATAR,
    guests,
    isFamily,
    createdAt: created,
  };
};

export function useRooms() {
  const navigation = useNavigation();
  const [rooms, setRooms] = useState<Room[]>(roomsCache || []);
  const [loading, setLoading] = useState(!roomsCache);

  useEffect(() => {
    const db = getFirestore();
    let unsub: null | (() => void) = null;
    let lastSig: string | null = roomsCache ? sigOf(roomsCache) : null;
    let pending: Room[] | null = null;
    let timer: any = null;
    let lastFlushAt = 0;
    let first = true;

    const flush = () => {
      timer = null;
      const l = pending;
      pending = null;
      if (!l) return;
      lastFlushAt = Date.now();
      const sig = sigOf(l);
      if (sig === lastSig) return;
      lastSig = sig;
      roomsCache = l;
      setRooms(l);
    };

    const stop = () => {
      if (unsub) {
        unsub();
        unsub = null;
      }
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pending = null;
    };

    const start = () => {
      if (unsub) return;
      first = true;
      unsub = onSnapshot(
        collection(db, 'rooms'),
        (snapshot) => {
          const list: Room[] = [];
          const now = Date.now();
          snapshot.forEach((d) => {
            if (!d.exists()) return;
            const room = parseRoom(d.id, d.data(), now);
            if (room) list.push(room);
          });
          list.sort((a, b) => b.createdAt - a.createdAt);
          pending = list;
          setLoading(false);
          if (first) {
            first = false;
            flush(); // pehli baar turant
          } else if (!timer) {
            timer = setTimeout(flush, Math.max(0, FLUSH_GAP - (Date.now() - lastFlushAt)));
          }
        },
        (err) => {
          console.log('Rooms error:', err);
          roomsCache = [];
          setRooms([]);
          setLoading(false);
        }
      );
    };

    if (navigation.isFocused()) start();
    const offFocus = navigation.addListener('focus', start);
    const offBlur = navigation.addListener('blur', stop);
    return () => {
      offFocus();
      offBlur();
      stop();
    };
  }, [navigation]);

  return { rooms, loading };
}
