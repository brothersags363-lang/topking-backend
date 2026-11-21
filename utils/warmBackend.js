// utils/warmBackend.js
// Render free plan 15 min bina traffic ke server ko sula deta hai; phir pehla request 20-40 sec leta hai
// ("Waking up server..." isi ki wajah se video live me aata tha).
// Fix: app khulte hi server ko jagao, aur app khula rahe to har 4 min halka /health ping karo.
// (Poora ilaaj: Render paid always-on plan, ya UptimeRobot se /health ko har 5 min ping.)
import { AppState } from 'react-native';
import { API_BASE } from './api';

const KEEP_MS = 4 * 60 * 1000;
let lastOk = 0;
let inflight = null;
let timer = null;
let sub = null;

export function warmBackend(force = false) {
  if (inflight) return inflight;
  if (!force && Date.now() - lastOk < 60 * 1000) return Promise.resolve(true);
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const to = ctrl ? setTimeout(() => ctrl.abort(), 45000) : null;
  inflight = fetch(API_BASE + '/health', { method: 'GET', signal: ctrl ? ctrl.signal : undefined })
    .then((r) => { if (r.ok) lastOk = Date.now(); return r.ok; })
    .catch(() => false)
    .finally(() => { if (to) clearTimeout(to); inflight = null; });
  return inflight;
}

// Ek hi baar chalao (root layout se). Return: cleanup.
export function startKeepWarm() {
  if (timer) return () => {};
  warmBackend(true);
  timer = setInterval(() => {
    if (AppState.currentState === 'active') warmBackend(true);
  }, KEEP_MS);
  sub = AppState.addEventListener('change', (st) => {
    if (st === 'active') warmBackend(false); // wapas aane par: 1 min se purana ho to hi ping
  });
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
    try { sub && sub.remove(); } catch (_) {}
    sub = null;
  };
}
