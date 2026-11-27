import { useEffect, useMemo, useRef, useCallback } from 'react';
import { PanResponder, Animated, Easing, Dimensions } from 'react-native';
import { listenRecentRooms } from './recentRooms';

const HEARTBEAT_TIMEOUT = 10 * 60 * 1000;
const STALE_MS = 45 * 1000;      // itni purani list ho to background me refresh
const SWITCH_LOCK_MS = 700;      // double swipe guard (pehle 1200: swipe atakta tha)
const SWIPE_DIST = 45;   // index feed jaisa halka swipe
const SWIPE_VEL = 0.35;

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
    // preview (swipe ke beech agle room ka niche/upar ka hissa dikhane ke liye)
    title: d.title || d.roomName || 'Live',
    host: d.hostName || d.host || 'User',
    img: d.cover || d.roomCover || d.hostImg || d.profileImg || d.photoURL || null,
    avatar: d.hostImg || d.profileImg || d.photoURL || null,
  };
};

// mode: 'video' -> sirf video live ke beech swipe | 'audio' -> sirf audio (chat + multiguest) live ke beech
// Video aur audio kabhi mix nahi hote.
const groupOf = (r) => (r.type === 'video' ? 'video' : 'audio');

export default function useLiveSwipe({ db, roomId, router, enabled, blockedRef, onBeforeSwitch, mode }) {
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
    const t = setTimeout(load, 1200); // list jaldi ready -> pehla swipe turant chale
    return () => clearTimeout(t);
  }, [enabled, roomId, load]);

  // dir ke hisaab se agla/pichla SAME-TYPE room dhundo (video<->video, audio<->audio)
  const findTarget = useCallback((dir) => {
    const blocked = blockedRef?.current;
    const full = mode ? listRef.current.filter((r) => groupOf(r) === mode || r.id === roomId) : listRef.current;
    const idx = full.findIndex((r) => r.id === roomId);
    const n = full.length;
    if (!n) return null;
    for (let step = 1; step <= n; step++) {
      const i = idx === -1
        ? (dir > 0 ? step - 1 : n - step)
        : ((idx + dir * step) % n + n) % n;
      const r = full[i];
      if (r && r.id !== roomId && !(r.hostId && blocked && blocked.has(r.hostId))) return r;
    }
    return null;
  }, [roomId, blockedRef, mode]);

  const open = useCallback((target) => {
    const now = Date.now();
    lockRef.current = now;
    try { beforeRef.current && beforeRef.current(target); } catch (_) {}
    if (target.type === 'video') {
      router.replace({ pathname: '/videolive', params: { id: target.id, role: 'viewer', k: String(now) } });
    } else if (target.layout === 'multiguest') {
      router.replace({ pathname: '/MultiGuestRoom', params: { id: target.id, k: String(now) } });
    } else {
      router.replace({ pathname: '/LiveRoom', params: { id: target.id, from: 'alllive', layout: target.layout, k: String(now) } });
    }
  }, [router]);

  // Button / direct use: bina drag ke seedha switch
  const go = useCallback((dir) => {
    if (!enabledRef.current) return;
    const now = Date.now();
    if (now - lockRef.current < SWITCH_LOCK_MS) return;
    if (now - loadedAtRef.current > STALE_MS) load();
    const target = findTarget(dir);
    if (target) open(target);
  }, [load, findTarget, open]);

  // ---------- Finger ke saath chalne wala swipe (index jaisa) ----------
  const translateY = useRef(new Animated.Value(0)).current;
  const previewListenerRef = useRef(null);
  const targetsRef = useRef({ next: null, prev: null });
  const animatingRef = useRef(false);
  const startedRef = useRef(false);
  const H = Dimensions.get('window').height;

  const setPreview = (v) => { try { previewListenerRef.current && previewListenerRef.current(v); } catch (_) {} };

  // room badle (naya screen) to position reset
  useEffect(() => {
    translateY.setValue(0);
    animatingRef.current = false;
    targetsRef.current = { next: null, prev: null };
    setPreview({ next: null, prev: null });
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  const goRef = useRef(go);
  goRef.current = go;
  const findTargetRef = useRef(findTarget);
  findTargetRef.current = findTarget;
  const openRef = useRef(open);
  openRef.current = open;

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) =>
      enabledRef.current && !animatingRef.current && Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.6,
    onPanResponderGrant: () => {
      startedRef.current = true;
      const now = Date.now();
      if (now - loadedAtRef.current > STALE_MS) load();
      const next = findTargetRef.current(1);
      const prev = findTargetRef.current(-1);
      targetsRef.current = { next, prev };
      setPreview({ next, prev });
    },
    onPanResponderMove: (_e, g) => {
      if (!startedRef.current) return;
      const { next, prev } = targetsRef.current;
      let dy = g.dy - Math.sign(g.dy) * 12;       // dead-zone ka jhatka hatao
      if (dy < 0 && !next) dy *= 0.25;            // agla room nahi -> halka rubber-band
      if (dy > 0 && !prev) dy *= 0.25;
      translateY.setValue(dy);
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_e, g) => {
      startedRef.current = false;
      const { next, prev } = targetsRef.current;
      const goNext = g.dy < -SWIPE_DIST || g.vy < -SWIPE_VEL;
      const goPrev = g.dy > SWIPE_DIST || g.vy > SWIPE_VEL;
      const target = goNext ? next : goPrev ? prev : null;
      const now = Date.now();
      if (target && now - lockRef.current >= SWITCH_LOCK_MS) {
        animatingRef.current = true;
        Animated.timing(translateY, {
          toValue: goNext ? -H : H,
          duration: 170,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          openRef.current(target);
          // navigation na ho paya to wapas apni jagah
          setTimeout(() => {
            if (animatingRef.current) {
              animatingRef.current = false;
              translateY.setValue(0);
              setPreview({ next: null, prev: null });
            }
          }, 2500);
        });
      } else {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 })
          .start(() => setPreview({ next: null, prev: null }));
      }
    },
    onPanResponderTerminate: () => {
      startedRef.current = false;
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const registerPreview = useCallback((fn) => { previewListenerRef.current = fn; }, []);
  return { panHandlers: panResponder.panHandlers, go, translateY, registerPreview, screenH: H };
}
