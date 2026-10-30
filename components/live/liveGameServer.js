// components/live/liveGameServer.js
// Greedy + Teen Patti dono ye helper use karte hain:
//  1) server clock sync  -> room ke sabhi players ka round/timer same chalta hai (phone ki ghadi galat ho tab bhi)
//  2) callSettle         -> settleLiveGame ko safe retry ke saath bulata hai (server idempotent hai, double payout nahi)
import { getFunctions, httpsCallable } from 'firebase/functions';

// Cloud Function ka region. functions/index.js ke REGION se SAME rakho.
export const FUNCTIONS_REGION = 'us-central1';

let fns = null;
const callables = {};
const callable = (name) => {
  if (!fns) fns = getFunctions(undefined, FUNCTIONS_REGION);
  if (!callables[name]) callables[name] = httpsCallable(fns, name);
  return callables[name];
};

// ---- server clock ----
let offsetMs = 0;
export const syncNow = () => Date.now() + offsetMs;

const noteServerTime = (serverNow, sentAt, recvAt) => {
  if (!Number.isFinite(serverNow)) return;
  const est = serverNow - (sentAt + recvAt) / 2; // network delay ka aadha hissa hata ke
  // chhote hilne se timer na kude; sirf tab badlo jab 300ms se zyada farak ho
  if (Math.abs(est - offsetMs) > 300) offsetMs = est;
};

export async function syncServerClock() {
  try {
    const sent = Date.now();
    const res = await callable('getServerTime')({});
    noteServerTime(res?.data?.now, sent, Date.now());
  } catch (_) { /* optional: fail ho to bhi game chalega */ }
}

// ---- settlement ----
const RETRYABLE = /unavailable|deadline-exceeded|internal|unknown|aborted|network/i;

export async function callSettle(payload, tries = 3) {
  const fn = callable('settleLiveGame');
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const sent = Date.now();
    try {
      const res = await fn(payload);
      const data = res?.data || {};
      noteServerTime(data.serverNow, sent, Date.now());
      return data;
    } catch (e) {
      lastErr = e;
      console.log('[settleLiveGame] error:', e?.code, e?.message);
      if (!RETRYABLE.test(`${e?.code || ''} ${e?.message || ''}`)) break;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

export function friendlyError(e) {
  const code = String(e?.code || '');
  const msg = String(e?.message || '');
  if (/not-found/.test(code)) return 'Game server deploy nahi hua (settleLiveGame nahi mila). firebase deploy --only functions chalao. [' + code + ']';
  if (/unauthenticated/.test(code)) return 'Login expire ho gaya. App dobara kholo. [' + code + ']';
  if (/expired/i.test(msg)) return 'Round khatam ho gaya. Agle round me bet lagao.';
  if (/Not enough/i.test(msg)) return 'Stars kam hain.';
  if (/Wallet not found/i.test(msg)) return 'Wallet document nahi mila (wallets/<uid>). [' + code + ']';
  if (/unavailable|deadline|network/i.test(`${code} ${msg}`)) return 'Internet slow hai ya server tak nahi pahunch raha. Stars change nahi hue. [' + code + ']';
  return (msg || 'Round settle nahi hua. Stars change nahi hue.') + (code ? ' [' + code + ']' : '');
}
