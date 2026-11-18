// =====================================================================
// videoCache.js — agle videos POORE phone me utaro (Instagram jaisa), player nahi banta
//
// Kyun: jab agla video phone ki file se chalta hai to scroll karte hi TURANT chalta hai,
// net ruk jaye tab bhi nahi atakta. Download me decoder nahi chalta -> phone garam nahi hota.
//
// Rules (safe):
//   - Ek baar me sirf EK download, pehle .part file, poora hone par hi .mp4 naam
//   - 15 MB se badi video skip (data / storage bachao)
//   - Sirf 12 files rakhta hai (purani apne aap delete)
//   - Kuch fail ho to ignore -> video net se chalti rahegi
// =====================================================================
import * as FileSystem from 'expo-file-system/legacy';

const DIR = (FileSystem.cacheDirectory || '') + 'feedvid/';
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 12;

const done = new Map(); // id -> file:// uri (poori download)
let pending = [];       // [{ id, uri }]
// Chalti download ko swipe par roka ja sake (active video ka net na khaye) -> cancellable
let activeDl = null;    // DownloadResumable
let activeCancel = null; // () => void   (race ko turant khatam karta hai)
let activeRatio = 0;    // 0..1 kitni utar chuki
let running = false;
let dirReady = false;
let sinceClean = 0;

const safe = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '_');

export const getLocalVideo = (id) => (id ? done.get(id) : undefined);

async function ensureDir() {
  if (dirReady || !DIR) return;
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
    dirReady = true;
  } catch (e) {}
}

async function clean() {
  try {
    const names = await FileSystem.readDirectoryAsync(DIR);
    const rows = [];
    for (const n of names) {
      const f = DIR + n;
      if (n.endsWith('.part')) { await FileSystem.deleteAsync(f, { idempotent: true }); continue; }
      const info = await FileSystem.getInfoAsync(f);
      rows.push({ f, id: n.replace(/\.mp4$/, ''), t: info.modificationTime || 0 });
    }
    rows.sort((a, b) => b.t - a.t);
    for (const r of rows.slice(MAX_FILES)) {
      await FileSystem.deleteAsync(r.f, { idempotent: true });
      for (const [k, v] of done) if (v === r.f) done.delete(k);
    }
  } catch (e) {}
}

async function sizeOf(uri) {
  try {
    const res = await fetch(uri, { method: 'HEAD' });
    const n = Number(res.headers.get('content-length'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (e) {
    return 0;
  }
}

async function downloadOne({ id, uri }) {
  const base = DIR + safe(id);
  const final = base + '.mp4';
  const info = await FileSystem.getInfoAsync(final);
  if (info.exists && info.size > 1024) { done.set(id, final); return; }

  const size = await sizeOf(uri);
  if (size > MAX_BYTES) return;

  const part = base + '.part';
  activeRatio = 0;
  const dl = FileSystem.createDownloadResumable(uri, part, {}, (p) => {
    if (p && p.totalBytesExpectedToWrite > 0) {
      activeRatio = p.totalBytesWritten / p.totalBytesExpectedToWrite;
    }
  });
  const cancelP = new Promise((resolve) => {
    activeCancel = () => resolve(null);
  });
  activeDl = dl;
  let r = null;
  try {
    // race: cancel hote hi pump() aage badh jaye (promise atak kar pump ko na roke)
    r = await Promise.race([dl.downloadAsync().catch(() => null), cancelP]);
  } finally {
    if (activeDl === dl) { activeDl = null; activeCancel = null; }
  }
  if (!r || r.status !== 200) {
    await FileSystem.deleteAsync(part, { idempotent: true });
    return;
  }
  await FileSystem.moveAsync({ from: part, to: final });
  done.set(id, final);
}

async function pump() {
  if (running) return;
  running = true;
  try {
    await ensureDir();
    if (!dirReady) return;
    while (pending.length) {
      const job = pending.shift();
      if (done.has(job.id)) continue;
      try {
        await downloadOne(job);
      } catch (e) {}
      if (++sinceClean >= 6) { sinceClean = 0; await clean(); }
    }
  } finally {
    running = false;
  }
}

// jobs = [{ id, uri }] — purani pending list badal jaati hai
export function downloadAhead(jobs) {
  try {
    pending = (jobs || []).filter((j) => j && j.id && j.uri && !done.has(j.id));
    if (pending.length) pump();
  } catch (e) {}
}

// Swipe / screen change par: pending list saaf + chalti download ROKO (agar 70% se kam utri ho).
// 70%+ utar chuki ho to poori hone do (thodi si bachi hai, wo bekar na jaye).
export const stopDownloadAhead = () => {
  pending = [];
  try {
    if (activeDl && activeRatio < 0.7) {
      const dl = activeDl;
      const cancel = activeCancel;
      activeDl = null;
      activeCancel = null;
      try { dl.pauseAsync().catch(() => {}); } catch (e) {}
      if (cancel) cancel();
    }
  } catch (e) {}
};
