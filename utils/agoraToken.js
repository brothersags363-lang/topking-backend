// utils/agoraToken.js
// =====================================================================
// AGORA TOKEN - tez + bharosemand (live room join ka sabse bada hissa)
//
// PEHLE: har screen ka apna fetch tha. Ek request, 15-25 sec ka timeout, sirf 3 koshish.
//        Server so raha ho ya phone ka purana connection mara hua ho to 25 sec ruk kar hi
//        dobara koshish hoti thi => "Waking up server..." 30-40 sec.
// AB:
//   1) CACHE: token 1 ghante chalta hai. Same room dobara / PK / rejoin => turant (0 ms).
//   2) PREFETCH: live list aate hi top rooms ka token pehle se le lete hain (recentRooms.js).
//      User card dabata hai to token already tayyar hota hai => join me server ka wait nahi.
//   3) HEDGE: pehli request 3.5 sec me na aaye to doosri parallel chalti hai (pehli band nahi hoti).
//      Mara hua connection ya dheemi request 25 sec nahi rok pati.
//   4) RETRY BUDGET: ginti nahi, samay (60 sec) ka hisaab. Server jaag raha ho to jaagte hi mil jata hai.
//   5) Ban (403) / login (401) jaise jawab par bekar retry nahi, saaf error wapas.
//
// Public API:
//   getAgoraToken(channel, uid, { isCancelled, onSlow, force }) -> { token, uid, error? }   (kabhi throw nahi)
//   prefetchAgoraToken(channel)                                  -> fire-and-forget
//   clearAgoraTokenCache()                                       -> logout par
// =====================================================================
import { API_BASE } from './api';

const TTL_MS = 40 * 60 * 1000;        // server token 60 min ka banata hai; 40 min baad naya
const MAX_CACHE = 24;
const ATTEMPT_TIMEOUT_MS = 20000;     // ek request ko max itna
const HEDGE_AFTER_MS = 3500;          // itne me na aaye to parallel doosri
const BUDGET_MS = 60000;              // kul koshish ka samay
const MAX_LAUNCHES = 10;
const MAX_PARALLEL = 2;

const cache = new Map();              // key -> { token, uid, at }
const inflight = new Map();           // key -> Promise (same channel ki do request ek ho jati hain)

const getAuth = () => {
  try {
    return require('../app/firebaseConfig').auth;
  } catch (_) {
    return null;
  }
};

const keyOf = (fbUid, channel) => `${fbUid}|${channel}`;

function trimCache() {
  if (cache.size <= MAX_CACHE) return;
  const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  for (let i = 0; i < oldest.length - MAX_CACHE; i++) cache.delete(oldest[i][0]);
}

// Ek HTTP request. Fail par Error: err.fatal = true => dobara koshish mat karo.
async function requestOnce(channel, uid, idToken, signal) {
  let res;
  try {
    res = await fetch(`${API_BASE}/token?channel=${encodeURIComponent(channel)}&uid=${uid}`, {
      headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json' },
      signal,
    });
  } catch (e) {
    const err = new Error(e && e.name === 'AbortError' ? 'timeout' : 'network');
    err.retry = true;
    throw err;
  }

  let data = null;
  try {
    data = await res.json(); // Render jagte waqt HTML page deta hai => yahan fail => retry
  } catch (_) {
    const err = new Error('bad-response-' + res.status);
    err.status = res.status;
    err.retry = true;
    throw err;
  }

  if (res.ok && data && data.success && data.token) {
    return { token: String(data.token), uid: Number(data.uid) || uid };
  }

  const err = new Error((data && data.error) || 'token-' + res.status);
  err.status = res.status;
  err.code = data && data.code;
  err.until = data && data.until;
  // 400/401/403/404 => dobara bhejne se kuch nahi badlega. 429 / 5xx => retry.
  err.retry = !(res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408);
  throw err;
}

// Hedged + budgeted fetch. Resolve: {token, uid}. Reject: Error (last error).
function fetchWithHedge(channel, uid, fbUser, { isCancelled, onSlow, budgetMs = BUDGET_MS }) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const controllers = new Set();
    const timers = new Set();
    let done = false;
    let launched = 0;
    let active = 0;
    let lastErr = null;
    let slowFired = false;
    let hedgeTimer = null;
    let cancelPoll = null;

    const later = (fn, ms) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
      return t;
    };

    const finish = (fn, val) => {
      if (done) return;
      done = true;
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      if (cancelPoll) clearInterval(cancelPoll);
      controllers.forEach((c) => {
        try { c.abort(); } catch (_) {}
      });
      controllers.clear();
      fn(val);
    };

    const outOfBudget = () => Date.now() - started >= budgetMs || launched >= MAX_LAUNCHES;

    const launch = async () => {
      if (done || (isCancelled && isCancelled())) return;
      launched += 1;
      active += 1;

      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      if (ctrl) controllers.add(ctrl);
      const killer = later(() => { try { ctrl && ctrl.abort(); } catch (_) {} }, ATTEMPT_TIMEOUT_MS);

      try {
        // getIdToken: cached hai, expire ho to khud naya le leta hai (extra round trip nahi)
        const idToken = await fbUser.getIdToken();
        const out = await requestOnce(channel, uid, idToken, ctrl ? ctrl.signal : undefined);
        finish(resolve, out);
      } catch (e) {
        lastErr = e;
        if (done) return;
        if (e && e.retry === false) return finish(reject, e); // ban / login / bad request
        active -= 1;
        if (ctrl) controllers.delete(ctrl);
        clearTimeout(killer);
        timers.delete(killer);
        if (outOfBudget()) {
          if (active <= 0) finish(reject, lastErr);
          return;
        }
        // 429 par thoda zyada ruko, baaki par jaldi dobara
        const wait = e && e.status === 429 ? 2500 : Math.min(800 * launched, 2500);
        later(launch, wait);
        return;
      }
    };

    // pehli request
    launch();

    // hedge: dheemi ho to ek parallel; "slow" UI ko bhi bata do
    hedgeTimer = later(() => {
      if (done) return;
      if (!slowFired) {
        slowFired = true;
        try { onSlow && onSlow(); } catch (_) {}
      }
      if (active < MAX_PARALLEL && !outOfBudget()) launch();
    }, HEDGE_AFTER_MS);

    // screen band ho gayi => chupchap ruk jao
    if (isCancelled) {
      cancelPoll = setInterval(() => {
        if (isCancelled() && !done) {
          const e = new Error('cancelled');
          e.cancelled = true;
          finish(reject, e);
        }
      }, 500);
    }
  });
}

export async function getAgoraToken(channel, uid, opts = {}) {
  const { isCancelled, onSlow, force = false } = opts;
  const auth = getAuth();
  const fbUser = auth && auth.currentUser;
  if (!fbUser || !channel) return { token: null, uid };

  const key = keyOf(fbUser.uid, channel);

  if (!force) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return { token: hit.token, uid: hit.uid, cached: true };
  } else {
    cache.delete(key);
  }

  // Prefetch pehle se chal raha ho to usi ka intezaar (dusri request nahi)
  let p = !force ? inflight.get(key) : null;
  if (!p) {
    p = fetchWithHedge(channel, uid, fbUser, { isCancelled, onSlow });
    inflight.set(key, p);
    const clear = () => { if (inflight.get(key) === p) inflight.delete(key); };
    p.then(clear, clear);
  } else if (onSlow) {
    // shared request: slow hone par bhi UI ko batao
    setTimeout(() => { if (inflight.get(key) === p) { try { onSlow(); } catch (_) {} } }, HEDGE_AFTER_MS);
  }

  try {
    const out = await p;
    cache.set(key, { token: out.token, uid: out.uid, at: Date.now() });
    trimCache();
    return { token: out.token, uid: out.uid };
  } catch (e) {
    if (e && e.cancelled) return { token: null, uid, cancelled: true };
    return {
      token: null,
      uid,
      error: { status: e && e.status, code: e && e.code, message: (e && e.message) || 'token-failed', until: e && e.until },
    };
  }
}

// Live list se top rooms ka token pehle hi le lo. Kabhi error nahi dega, UI nahi chhedta.
export function prefetchAgoraToken(channel) {
  try {
    const auth = getAuth();
    const fbUser = auth && auth.currentUser;
    if (!fbUser || !channel || typeof channel !== 'string') return;
    const key = keyOf(fbUser.uid, channel);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS - 5 * 60 * 1000) return; // abhi taaza hai
    if (inflight.has(key)) return;
    // uid server khud tay karta hai (query uid sirf purane format ke liye)
    getAgoraToken(channel, 0, {}).catch(() => {});
  } catch (_) {}
}

export function clearAgoraTokenCache() {
  cache.clear();
  inflight.clear();
}
