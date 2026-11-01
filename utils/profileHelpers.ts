import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../app/firebaseConfig';

export const AVATAR_FALLBACK = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

// ---- Bio: Instagram jaisa FIXED size (max 4 lines, 150 chars) ----
export const BIO_MAX_LINES = 4;
export const BIO_MAX_CHARS = 150;

export const cleanBio = (text) => {
  const t = (text || '').trim();
  return t === 'bio.........' ? '' : t;
};

export const clampBio = (text) =>
  (text || '')
    .replace(/\r/g, '')
    .split('\n')
    .slice(0, BIO_MAX_LINES)
    .join('\n')
    .slice(0, BIO_MAX_CHARS);

// ---- Username ----
export const USERNAME_MAX = 24;
export const USERNAME_COOLDOWN_DAYS = 14;
const USERNAME_COOLDOWN_MS = USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export const toMillis = (v) => {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
};

export const getUsernameLock = (changedAt) => {
  const last = toMillis(changedAt);
  if (!last) return { locked: false, daysLeft: 0 };
  const remaining = last + USERNAME_COOLDOWN_MS - Date.now();
  if (remaining <= 0) return { locked: false, daysLeft: 0 };
  return { locked: true, daysLeft: Math.ceil(remaining / (24 * 60 * 60 * 1000)) };
};

export const NAME_MAX = 20;

export const sanitizeUsername = (text) =>
  (text || '')
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, USERNAME_MAX);

export const sanitizeName = (text) =>
  (text || '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{M}\p{N} ._'-]/gu, '')
    .replace(/(.)\1{3,}/gu, '$1$1$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/, '')
    .slice(0, NAME_MAX);

export const validateName = (n) => {
  const t = (n || '').trim();
  if (t.length < 2) return 'Name kam se kam 2 characters ka hona chahiye.';
  if (!/[\p{L}\p{N}]/u.test(t)) return 'Name me kam se kam ek letter ya number hona chahiye.';
  return null;
};

export const validateUsername = (u) => {
  if (u.length < 3) return 'Username kam se kam 3 characters ka hona chahiye.';
  if (u.startsWith('.') || u.endsWith('.')) return 'Username . se start ya end nahi ho sakta.';
  if (u.includes('..')) return 'Username me lagatar do . nahi ho sakte.';
  return null;
};

// ---- Birthday: DD/MM/YYYY type karo, Firestore me YYYY-MM-DD ----
export const birthdayToDisplay = (iso) => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(iso || '');
  return m ? `${m[3].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[1]}` : '';
};

export const formatBirthdayInput = (t) => {
  const d = (t || '').replace(/\D/g, '').slice(0, 8);
  let out = d.slice(0, 2);
  if (d.length > 2) out += '/' + d.slice(2, 4);
  if (d.length > 4) out += '/' + d.slice(4);
  return out;
};

export const parseBirthday = (disp) => {
  if (!disp) return { iso: '' };
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(disp);
  if (!m) return { error: 'Birthday DD/MM/YYYY format me daalo.' };
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    return { error: 'Ye date sahi nahi hai.' };
  }
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now < new Date(now.getFullYear(), mo - 1, d)) age--;
  if (age < 13) return { error: 'App use karne ke liye kam se kam 13 saal ki age honi chahiye.' };
  if (age > 100) return { error: 'Birthday sahi nahi lag raha.' };
  return { iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
};

// ---- Numbers ----
export const formatCount = (value) => {
  const n = Number(value || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(n);
};

// ---- Level badge colours ----
const LEVEL_THEMES = {
  t50: { bg: '#7B1FFF', border: '#FFD700', text: '#fff', icon: '#FFD700' },
  t40: { bg: '#00BFFF', border: '#9EF8FF', text: '#fff', icon: '#fff' },
  t30: { bg: '#FF0066', border: '#FFB6C1', text: '#fff', icon: '#fff' },
  t20: { bg: '#FFC107', border: '#FFE082', text: '#000', icon: '#fff' },
  t10: { bg: '#BDBDBD', border: '#fff', text: '#fff', icon: '#fff' },
  t0: { bg: '#222', border: '#555', text: '#FFD700', icon: '#00E5FF' },
};

export const levelThemeFor = (level) => {
  if (level >= 50) return LEVEL_THEMES.t50;
  if (level >= 40) return LEVEL_THEMES.t40;
  if (level >= 30) return LEVEL_THEMES.t30;
  if (level >= 20) return LEVEL_THEMES.t20;
  if (level >= 10) return LEVEL_THEMES.t10;
  return LEVEL_THEMES.t0;
};

// ---- Firestore: 30 ids per query (1 round-trip) instead of 1 read per doc ----
const chunkArr = (arr, n = 30) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

export const fetchDocsByIds = async (colName, ids) => {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map();

  await Promise.all(
    chunkArr(unique).map(async (part) => {
      try {
        const snap = await getDocs(
          query(collection(db, colName), where(documentId(), 'in', part))
        );
        snap.forEach((d) => map.set(d.id, d));
      } catch (e) {
        const snaps = await Promise.all(
          part.map((id) => getDoc(doc(db, colName, id)).catch(() => null))
        );
        snaps.forEach((d) => d && d.exists() && map.set(d.id, d));
      }
    })
  );

  return map;
};
