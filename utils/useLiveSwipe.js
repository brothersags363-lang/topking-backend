import { useEffect, useMemo, useRef, useCallback } from 'react';
import { PanResponder } from 'react-native';
import { listenRecentRooms } from './recentRooms';

const HEARTBEAT_TIMEOUT = 10 * 60 * 1000;
const STALE_MS = 45 * 1000;      // itni purani list ho to background me refresh
const SWITCH_LOCK_MS = 1200;     // double swipe guard
const SWIPE_DIST = 70;
const SWIPE_VEL = 0.6;

const ms = (v) => {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (v.toMillis) return v.toMillis();
  if (v.seconds) return v.seconds * 1000;
  const p = new Date(v).getTime();
  return isNaN(p) ? 0 : p;
};

const parse = (id, d, now) => {
  const st = String(d.status || '').toLowerCase().trim();
  if (st === 'ended' || st === 'inactive' || st === 'closed') return null;
  const hb = ms(d.hostHeartbeat) || ms(d.lastHeartbeat);
  if (hb && now - hb > HEARTBEAT_TIMEOUT) return null;
  if ((d.roomType || 'public') !== 'public') return null;
  const created = ms(d.createdAt);
  if (created && now - created > 24 * 60 * 60 * 1000) return null;
  const hostId = d.hostId || d.seatsData?.seat_1?.userId || null;
  return {
    id,
    hostId,
    type: String(d.type || 'audio').toLowerCase(),
    layout: String(d.roomLayout || 'chat').toLowerCase(),
    stars: hostId ? Math.max(0, Number(d.seatStars?.[hostId]) || 0) : 0,
    createdAt: created,
  };
};

export default function useLiveSwipe({ db, roomId, router, enabled, blockedRef, onBeforeSwitch }) {
  const listRef = useRef([]);
  const loadedAtRef = useRef(0);
  const loadingRef = useRef(false);
  const lockRef = useRef(0);
  const enabledRef = useRef(enabled);
  const beforeRef = useRef(onBeforeSwitch);
  enabledRef.current = enabled;
  beforeRef.current = onBeforeSwitch;

  // One-shot read: listener sirf pehla snapshot leke band (heartbeat ke reads nahi lagte)
  const load = useCallback(() => {
    if (!db || loadingRef.current) return;
    loadingRef.current = true;
    const map = new Map();
    const seen = {};
    let unsub = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try { unsub && unsub(); } catch (_) {}
      const arr = Array.from(map.values()).sort(
        (a, b) => (b.stars - a.stars) || (b.createdAt - a.createdAt)
      );
      listRef.current = arr;
      loadedAtRef.current = Date.now();
      loadingRef.current = false;
    };
    const timer = setTimeout(finish, 4000);
    try {
      unsub = listenRecentRooms(
        db,
        (snap, key) => {
          const now = Date.now();
          snap.docs.forEach((d) => {
            const s = parse(d.id, d.data(), now);
            if (s) map.set(d.id, s);
          });
          seen[key] = true;
          if (seen.num && seen.ts) { clearTimeout(timer); finish(); }
        },
        () => { clearTimeout(timer); finish(); }
      );
    } catch (_) { clearTimeout(timer); finish(); }
  }, [db]);

  useEffect(() => {
    if (!enabled) return undefined;
    const t = setTimeout(load, 2500); // room khulne ke baad, smooth entry ko na roke
    return () => clearTimeout(t);
  }, [enabled, roomId, load]);

  const go = useCallback((dir) => {
    if (!enabledRef.current) return;
    const now = Date.now();
    if (now - lockRef.current < SWITCH_LOCK_MS) return;

    if (now - loadedAtRef.current > STALE_MS) load();

    const blocked = blockedRef?.current;
    const full = listRef.current;
    const idx = full.findIndex((r) => r.id === roomId);
    const n = full.length;
    if (!n) return;

    let target = null;
    for (let step = 1; step <= n; step++) {
      const i = idx === -1
        ? (dir > 0 ? step - 1 : n - step)
        : ((idx + dir * step) % n + n) % n;
      const r = full[i];
      if (r && r.id !== roomId && !(r.hostId && blocked && blocked.has(r.hostId))) {
        target = r;
        break;
      }
    }
    if (!target) return;

    lockRef.current = now;
    try { beforeRef.current && beforeRef.current(target); } catch (_) {}

    if (target.type === 'video') {
      router.replace({ pathname: '/videolive', params: { id: target.id, role: 'viewer', k: String(now) } });
    } else if (target.layout === 'multiguest') {
      router.replace({ pathname: '/MultiGuestRoom', params: { id: target.id, k: String(now) } });
    } else {
      router.replace({ pathname: '/LiveRoom', params: { id: target.id, from: 'alllive', layout: target.layout, k: String(now) } });
    }
  }, [roomId, router, blockedRef, load]);

  const goRef = useRef(go);
  goRef.current = go;

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) =>
      enabledRef.current && Math.abs(g.dy) > 18 && Math.abs(g.dy) > Math.abs(g.dx) * 1.6,
    onPanResponderTerminationRequest: () => true,
    onPanResponderRelease: (_e, g) => {
      if (g.dy < -SWIPE_DIST || g.vy < -SWIPE_VEL) goRef.current(1);       // upar swipe -> next
      else if (g.dy > SWIPE_DIST || g.vy > SWIPE_VEL) goRef.current(-1);   // neeche swipe -> previous
    },
  }), []);

  return { panHandlers: panResponder.panHandlers, go };
}
