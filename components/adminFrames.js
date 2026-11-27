import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../app/firebaseConfig';
import { callApi } from '../utils/api';

// ---- ADMIN FRAMES (admin ke diye special frames) ----
// Admin Panel > "Special Frames" se kisi bhi user ko diye ja sakte hain.
// users/{uid}.adminFrame = key  (server /admin/set-user-frame se set hota hai)
// Ye frame level frame ko override karta hai aur HAR JAGAH dikhta hai
// (feed, comments, chat, profile, live room seat/chat/popup).
// Nayi frame jodni ho: webp assets/admin_frames/ me daalo, yahan ek line add karo,
// aur backend server.js me ADMIN_FRAME_KEYS me key add karo.
// ANIMATED FRAMES HATA DIYE: img aur still dono static WEBP (smooth, halka). Naya frame bhi sirf static webp daalo.
export const ADMIN_FRAMES = {
  // fit = DP ke liye andar ka hole (image se naapa hua) -> DP har jagah frame ke beech me sahi size me
  gold_heart:   { label: 'Official Gold Heart',   img: require('../assets/admin_frames/still/gold_heart.webp'),   still: require('../assets/admin_frames/still/gold_heart.webp'),   fit: { cx: 0.498, cy: 0.470, d: 0.46 } },
  bd_helmet:    { label: 'BD Purple Helmet',      img: require('../assets/admin_frames/still/bd_helmet.webp'),    still: require('../assets/admin_frames/still/bd_helmet.webp'),    fit: { cx: 0.498, cy: 0.470, d: 0.48 } },
  agency_ref:   { label: 'Agency Reference',      img: require('../assets/admin_frames/still/agency_ref.webp'),   still: require('../assets/admin_frames/still/agency_ref.webp'),   fit: { cx: 0.500, cy: 0.470, d: 0.50 } },
  agency_wings: { label: 'Official Agency Wings', img: require('../assets/admin_frames/still/agency_wings.webp'), still: require('../assets/admin_frames/still/agency_wings.webp'), fit: { cx: 0.490, cy: 0.460, d: 0.44 } },
  tk_team:      { label: 'TK Team',               img: require('../assets/admin_frames/still/tk_team.webp'),      still: require('../assets/admin_frames/still/tk_team.webp'),      fit: { cx: 0.490, cy: 0.480, d: 0.42 } },
};
const ADMIN_ONLY = { ...ADMIN_FRAMES }; // copy: angel frames baad me ADMIN_FRAMES me judte hain, isme nahi
export const ADMIN_FRAME_KEYS = Object.keys(ADMIN_ONLY); // Admin Panel me sirf yehi diye ja sakte hain

// ---- ANGEL FRAMES (Fresh / Senior Angel) ----
// Admin nahi deta: user ko apne aap milta hai (Fresh = ID verified, Senior = white tick).
// Frames & Entries se user chunta hai -> users/{uid}.frameChoice = "ang:<key>".
// fit = andar ke gol hole ka center (cx, cy) aur size (d), poori image ka fraction. Image ka hole canvas ke center par
// nahi hai, isliye LevelFrame / preview isse photo ke bilkul beech me fit karte hain.
// Server (set-frame-prefs + frame map) eligibility check karta hai. Render ADMIN_FRAMES se hi hota hai,
// isliye feed / chat / comments / profile / live room sab jagah wahi frame dikhta hai.
export const ANGEL_FRAMES = {
  fresh_angel:  { label: 'Fresh Angel',  img: require('../assets/pendants/fresh_angel.webp'),  still: require('../assets/pendants/still/fresh_angel.webp'), fit: { cx: 0.549, cy: 0.516, d: 0.668 }, overlap: 1.03 },
  senior_angel: { label: 'Senior Angel', img: require('../assets/pendants/senior_angel.webp'), still: require('../assets/pendants/still/senior_angel.webp'), fit: { cx: 0.526, cy: 0.501, d: 0.587 }, overlap: 1.03 },
};
export const ANGEL_FRAME_KEYS = Object.keys(ANGEL_FRAMES);
Object.assign(ADMIN_FRAMES, ANGEL_FRAMES); // sirf render / spec ke liye (ADMIN_FRAME_KEYS upar fix hai)

// ---- FRAME MAP: { uid: spec } ----
// spec = admin frame key | 'lv30' | 'lv40' | 'lv50' (user ne khud chuna) | 'off' (user ne frame band kiya)
// Map me na ho => AUTO (level se frame: 30-39 lv30, 40-49 lv40, 50+ lv50).
// Sirf unhi users ki chhoti list jinki frame default nahi hai. Server se EK hi call (/frames/admin-map),
// har user ke liye alag Firestore read NAHI. Phone me save rehti hai (AsyncStorage) -> app khulte hi frame turant.
const MAP_KEY = 'adminFrameMap:v3'; // v3: purani galat (bade level wali) saved map chhod do
const MAP_TTL_MS = 10 * 60 * 1000;
const LEVEL_SPEC_RE = /^lv(30|40|50)$/;
let adminMap = {};
let myPrefs = { adminFrame: null, adminFrames: [], frameChoice: null, frameOff: false };
let mapLoaded = false;      // true => map ko sach maano (disk ya server se aa chuki)
let mapFetchedAt = 0;
let mapFetching = null;
let mapDiskPromise = null;
const mapListeners = new Set();

function notifyMap() { mapListeners.forEach((fn) => { try { fn(); } catch (_) {} }); }

const isValidSpec = (v) => typeof v === 'string' && (!!ADMIN_FRAMES[v] || v === 'off' || LEVEL_SPEC_RE.test(v));

// Admin ne user ko jitne frames diye (list + purana single adminFrame), sirf jo app me maujood hain
export function ownedAdminFrames(p) {
  const out = [];
  const add = (k) => { if (k && ADMIN_ONLY[k] && out.indexOf(k) === -1) out.push(k); };
  if (p && Array.isArray(p.adminFrames)) p.adminFrames.forEach(add);
  if (p) add(p.adminFrame);
  return out;
}

function cleanPrefs(p) {
  const owned = ownedAdminFrames(p);
  return {
    adminFrame: p && p.adminFrame && ADMIN_ONLY[p.adminFrame] ? p.adminFrame : owned.length ? owned[owned.length - 1] : null,
    adminFrames: owned,
    frameChoice: (p && p.frameChoice) || null,
    frameOff: !!(p && p.frameOff === true),
  };
}

function persistMap() {
  AsyncStorage.setItem(MAP_KEY, JSON.stringify({ map: adminMap, mine: myPrefs })).catch(() => {});
}

function loadMapDisk() {
  if (mapDiskPromise) return mapDiskPromise;
  mapDiskPromise = AsyncStorage.getItem(MAP_KEY)
    .then((raw) => {
      if (!raw || mapFetchedAt) return;      // server ka taaza jawab pehle aa gaya to disk ignore
      const obj = JSON.parse(raw);
      if (obj && obj.map && typeof obj.map === 'object') {
        adminMap = obj.map;
        if (obj.mine) myPrefs = cleanPrefs({ ...myPrefs, ...obj.mine });
        mapLoaded = true;
        notifyMap();
      }
    })
    .catch(() => {});
  return mapDiskPromise;
}

// Server se taaza map lao. force=true => TTL ka wait nahi (admin ne abhi frame badla ho to)
export function refreshAdminFrameMap(force = false) {
  if (mapFetching) return mapFetching;
  if (!force && mapFetchedAt && Date.now() - mapFetchedAt < MAP_TTL_MS) return Promise.resolve();
  mapFetching = callApi('/frames/admin-map', {})
    .then((res) => {
      const m = res && res.map && typeof res.map === 'object' ? res.map : {};
      const clean = {};
      Object.keys(m).forEach((uid) => { if (isValidSpec(m[uid])) clean[uid] = m[uid]; });
      adminMap = clean;
      if (res && res.mine) {
        myPrefs = cleanPrefs(res.mine);
      }
      mapLoaded = true;
      mapFetchedAt = Date.now();
      notifyMap();
      persistMap();
    })
    .catch(() => { /* net/login nahi -> purani saved map chalti rahegi */ })
    .finally(() => { mapFetching = null; });
  return mapFetching;
}

// Kisi user ki frame turant badlo (apne phone me, sab screens ko khabar). spec: key | 'lvNN' | 'off' | null (=auto)
// Admin ne frame diya/hataya ya user ne apna frame chuna -> server ke jawab ke baad call karo.
export function setAdminFrameLocal(uid, spec) {
  if (!uid) return;
  const next = { ...adminMap };
  if (isValidSpec(spec)) next[uid] = spec; else delete next[uid];
  adminMap = next;
  mapLoaded = true;
  notifyMap();
  persistMap();
}

// prefs (server ka jawab: adminFrame, frameChoice, frameOff) -> spec. Server ke frameSpecOf jaisa hi.
export function specFromPrefs(p) {
  if (!p) return null;
  if (p.frameOff) return 'off';
  const c = p.frameChoice;
  if (c) {
    if (String(c).indexOf('adm:') === 0) {
      const k = String(c).slice(4);
      if (ownedAdminFrames(p).indexOf(k) !== -1) return k;
    } else if (String(c).indexOf('ang:') === 0) {
      const k = String(c).slice(4);
      if (ANGEL_FRAMES[k]) return k; // server pehle hi eligibility check kar chuka hota hai
    } else if (LEVEL_SPEC_RE.test(c)) {
      return c;
    }
  }
  const owned = ownedAdminFrames(p);
  return p.adminFrame && ADMIN_ONLY[p.adminFrame] ? p.adminFrame : owned.length ? owned[owned.length - 1] : null;
}

// Apni frame prefs (Frames & Entries screen ke liye): { adminFrame, frameChoice, frameOff }
export function getMyFramePrefs() { return myPrefs; }
export function setMyFramePrefsLocal(p) {
  myPrefs = cleanPrefs(p);
  persistMap();
}

// uid -> spec ya null (null = AUTO, level se). fallbackKey: chat/seat data me aaya hua admin 'special'
// (map aane se pehle kaam aata hai).
export function getFrameSpec(uid, fallbackKey) {
  if (uid && typeof uid === 'string') {
    const k = adminMap[uid];
    if (k && isValidSpec(k)) return k;
    if (mapLoaded) return null;              // map load ho chuki aur uid usme nahi => auto
  }
  return fallbackKey && ADMIN_FRAMES[fallbackKey] ? fallbackKey : null;
}

// uid -> admin frame key (ya null). Purane callers ke liye.
export function getAdminFrameKey(uid, fallbackKey) {
  const sp = getFrameSpec(uid, fallbackKey);
  return sp && ADMIN_FRAMES[sp] ? sp : null;
}

// Is user ka frame abhi dikh raha hai? (Live seat par "Host" label ke liye)
export function hasVisibleFrame(uid, level) {
  const sp = getFrameSpec(uid);
  if (sp === 'off') return false;
  if (sp) return true;
  return Number(level) >= 30;
}

// Hook: frame spec. Re-render tab hota hai jab map load/badle.
export function useFrameSpec(uid, fallbackKey) {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    mapListeners.add(fn);
    loadMapDisk().then(() => refreshAdminFrameMap(false));
    return () => { mapListeners.delete(fn); };
  }, []);
  return getFrameSpec(uid, fallbackKey);
}

// Hook: sirf admin frame key (purane callers ke liye)
export function useAdminFrame(uid, fallbackKey) {
  const sp = useFrameSpec(uid, fallbackKey);
  return sp && ADMIN_FRAMES[sp] ? sp : null;
}

// ---- uid -> frame info lookup (memory cache, har user ka 1 hi read) ----
// Ek hi read me user ka level aur entry ki pasand (entryOff / entryChoice) aa jati hai.
// Frame level se lagta hai (LevelFrame.js): 30-39 -> lv30, 40-49 -> lv40, 50+ -> lv50. Level = wallets/{uid}.level
const TTL_MS = 5 * 60 * 1000;
const cache = new Map();      // uid -> { info, t }
const inflight = new Map();   // uid -> Promise
const listeners = new Map();  // uid -> Set<fn>

const EMPTY_INFO = Object.freeze({
  loaded: false,   // true tab hota hai jab user doc padh liya gaya
  level: null,
  entryOff: false,
  entryChoice: null,
});

const LOADED_EMPTY = Object.freeze({ ...EMPTY_INFO, loaded: true });

// data = users doc, wallet = wallets doc. ASLI level wallets/{uid}.level hai (functions/syncWalletLevel
// wahi update karta hai). users/{uid}.level purana / khali rehta hai -> usse frame galat lagta tha.
function toInfo(data, wallet) {
  if (!data && !wallet) return LOADED_EMPTY;
  const wl = wallet && wallet.level !== undefined && wallet.level !== null ? Number(wallet.level) : NaN;
  const level = Number.isFinite(wl) ? wl : data ? Number(data.level) || null : null;
  data = data || {};
  return {
    loaded: true,
    level: level || null,
    entryOff: data.entryOff === true,
    entryChoice: data.entryChoice || null,
  };
}

function notify(uid, info) {
  const set = listeners.get(uid);
  if (set) set.forEach((fn) => fn(info));
}

// FIX (frame kabhi dikhta kabhi nahi): pehle har seat/chat row alag getDoc chalata tha.
// Live room me 20-50 user ek saath aate hain -> sab reads ek saath, slow net par timeout,
// aur 3 retry ke baad frame hamesha ke liye "nahi hai" reh jata tha.
// Ab: (1) ek saath max MAX_PARALLEL reads (queue), (2) retry zyada + lamba backoff,
// (3) frame info phone me save (AsyncStorage) -> app dobara khulte hi frame turant,
// (4) fail hone par purani saved info dikhti rehti hai, khali nahi hoti.
const MAX_RETRY = 6;
const MAX_PARALLEL = 4;
const STORE_KEY = 'frameInfoCache:v3'; // v3: level ab wallet se (purana galat level wala cache chhod do)
const STORE_MAX = 300;

const queue = [];
let running = 0;

function pump() {
  while (running < MAX_PARALLEL && queue.length) {
    const job = queue.shift();
    running += 1;
    job().finally(() => { running -= 1; pump(); });
  }
}

// ---- disk cache (best effort, kabhi crash nahi karega) ----
let diskLoaded = false;
let diskLoading = null;
let saveTimer = null;

function loadDisk() {
  if (diskLoaded) return Promise.resolve();
  if (diskLoading) return diskLoading;
  diskLoading = AsyncStorage.getItem(STORE_KEY)
    .then((raw) => {
      if (!raw) return;
      const obj = JSON.parse(raw);
      Object.keys(obj || {}).forEach((uid) => {
        if (!cache.has(uid) && obj[uid]) {
          // t: 0 => purana maana jayega, background me refresh hoga, par tab tak dikhega
          cache.set(uid, { info: { ...EMPTY_INFO, ...obj[uid], loaded: true }, t: 0 });
          notify(uid, cache.get(uid).info);
        }
      });
    })
    .catch(() => {})
    .finally(() => { diskLoaded = true; });
  return diskLoading;
}

function saveDiskSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const entries = Array.from(cache.entries())
        .filter(([, v]) => v && v.info && v.info.loaded)
        .sort((a, b) => b[1].t - a[1].t)
        .slice(0, STORE_MAX);
      const obj = {};
      entries.forEach(([uid, v]) => { obj[uid] = v.info; });
      AsyncStorage.setItem(STORE_KEY, JSON.stringify(obj)).catch(() => {});
    } catch (_) {}
  }, 2500);
}

function fetchInfo(uid, attempt = 0) {
  if (inflight.has(uid)) return inflight.get(uid);
  const p = new Promise((resolve) => {
    queue.push(() =>
      Promise.all([
        getDoc(doc(db, 'users', uid)),
        // wallet na padh sake (rules / net) to users doc se kaam chalao, frame gayab mat karo
        getDoc(doc(db, 'wallets', uid)).catch(() => null),
      ])
        .then(([snap, wSnap]) => {
          const w = wSnap && wSnap.exists() ? wSnap.data() : null;
          const info = snap.exists() || w ? toInfo(snap.exists() ? snap.data() : null, w) : LOADED_EMPTY;
          cache.set(uid, { info, t: Date.now() });
          notify(uid, info);
          saveDiskSoon();
          resolve(info);
        })
        .catch(() => {
          // fail hone par "frame nahi hai" cache NAHI karte; backoff ke saath dobara try.
          if (attempt < MAX_RETRY) {
            setTimeout(() => {
              inflight.delete(uid);
              if (listeners.has(uid)) fetchInfo(uid, attempt + 1);
            }, Math.min(1500 * 2 ** attempt, 20000));
          }
          resolve(undefined);
        })
    );
    pump();
  }).finally(() => {
    // retry wala case upar khud inflight saaf karta hai; normal case me yahan.
    if (inflight.get(uid) === p) inflight.delete(uid);
  });
  inflight.set(uid, p);
  return p;
}

// Cache turant saaf karne ke liye
export function clearFrameInfoCache(uid) {
  if (uid) cache.delete(uid); else cache.clear();
}

// Settings screen kholte hi taaza info lao (cache ka 5 min wait nahi)
export function refreshFrameInfo(uid) {
  if (!uid) return Promise.resolve(undefined);
  cache.delete(uid);
  return fetchInfo(uid);
}

// Settings me user ne frame/entry badla -> cache turant update + sab screens ko khabar
// (server ka jawab aane ke baad call karo, taaki sab jagah ek saath badal jaye)
export function patchFrameInfo(uid, patch) {
  if (!uid) return;
  const c = cache.get(uid);
  const info = { ...(c ? c.info : EMPTY_INFO), loaded: true, ...patch };
  cache.set(uid, { info, t: Date.now() });
  notify(uid, info);
}

// uid do -> us user ki poori frame info (ya EMPTY_INFO jab tak load ho raha ho)
export function useFrameInfo(uid) {
  const [info, setInfo] = useState(() => {
    const c = uid ? cache.get(uid) : null;
    return c ? c.info : EMPTY_INFO;
  });

  useEffect(() => {
    if (!uid || typeof uid !== 'string') { setInfo(EMPTY_INFO); return undefined; }
    let dead = false;
    const c0 = cache.get(uid);
    // cache na ho to purane user ka frame mat rakho (seat par user badalne par galat frame dikhta tha)
    setInfo(c0 ? c0.info : EMPTY_INFO);

    let set = listeners.get(uid);
    if (!set) { set = new Set(); listeners.set(uid, set); }
    set.add(setInfo);

    // pehle phone me saved info (turant frame), phir zarurat ho to server se taaza
    loadDisk().then(() => {
      if (dead) return;
      const c = cache.get(uid);
      if (c) setInfo(c.info);
      if (!c || Date.now() - c.t > TTL_MS) fetchInfo(uid);
    });

    return () => { dead = true; set.delete(setInfo); if (!set.size) listeners.delete(uid); };
  }, [uid]);

  return info;
}
