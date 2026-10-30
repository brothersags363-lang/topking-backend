'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { randomInt, createHash } = require('node:crypto');

initializeApp();
const db = getFirestore();
const REGION = 'us-central1'; // user India me hai -> 'asia-south1' (Mumbai) se kam latency milegi; client me bhi same region set karna
const MAX_BET = 10000;
const ROUND_SECONDS = { greedy: 25, teenPatti: 34 }; // teenPatti = BET 26 + DEAL 2 + RESULT 6 (client TeenPattiGame.js se SAME)
const ROUND_PREFIX = { greedy: 'greedy', teenPatti: 'teen' };
const BET_MS = { greedy: 15000, teenPatti: 26000 }; // client ke BET_MS se SAME. Isse pehle result kisi ko nahi milta
const EARLY_GRACE_MS = 400; // client clock ki chhoti galti ke liye
const ROUND_TOLERANCE = 1; // client clock thoda aage/peeche ho ya network slow ho to bhi round accept ho
const PAYOUT_MULT = 2.9;
// Wheel (ring order, upar se clockwise). Client GreedyGame.js ke ITEMS se SAME mult rakhna.
// Weights fixed aur sabke liye same (bet dekhkar result nahi badalta). NOTE: 8 ke 8 khane paying hain => house edge sirf ~0.5%.
const ITEMS = [
  { mult: 12, weight: 0.0812, type: 'meat' },
  { mult: 8, weight: 0.1218, type: 'meat' },
  { mult: 5, weight: 0.1949, type: 'meat' },
  { mult: 28, weight: 0.0348, type: 'meat' },
  { mult: 3, weight: 0.3316, type: 'veg' },
  { mult: 12, weight: 0.0829, type: 'veg' },
  { mult: 8, weight: 0.1243, type: 'veg' },
  { mult: 35, weight: 0.0285, type: 'veg' },
];
const SALAD_MULT = 1.5;
const PIZZA_MULT = 2.3;
const SUITS = ['♠', '♥', '♣', '♦'];
const HAND_NAME = { 6: 'Trail', 5: 'Pure Seq', 4: 'Sequence', 3: 'Color', 2: 'Pair', 1: 'High Card' };

function validateBets(game, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpsError('invalid-argument', 'Invalid bets.');
  // Greedy: sirf wahi khane jinka mult > 0 (khali khane par bet nahi lagti) + salad(=Mix) / pizza(=Red) groups
  const allowed = game === 'greedy'
    ? new Set([...ITEMS.map((it, i) => (it.mult > 0 ? String(i) : null)).filter(Boolean), 'salad', 'pizza'])
    : new Set(['A','B','C']);
  const bets = {};
  let total = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.has(key) || !Number.isSafeInteger(value) || value < 0) throw new HttpsError('invalid-argument', 'Invalid bet value.');
    if (value > 0) bets[key] = value;
    total += value;
  }
  if (!Number.isSafeInteger(total) || total > MAX_BET) throw new HttpsError('failed-precondition', `Maximum bet per round is ${MAX_BET} Stars.`);
  return { bets, total };
}

function greedyResult(bets) {
  const r = randomInt(0, 1000000) / 1000000;
  let sum = 0, winner = ITEMS.length - 1;
  for (let i = 0; i < ITEMS.length; i++) { sum += ITEMS[i].weight; if (r < sum) { winner = i; break; } }
  const item = ITEMS[winner];
  let payout = (bets[String(winner)] || 0) * item.mult;
  if (item.type === 'veg') payout += (bets.salad || 0) * SALAD_MULT;
  else payout += (bets.pizza || 0) * PIZZA_MULT;
  return { winner, payout: Math.floor(payout), round: null };
}

function payoutFor(game, bets, winner) {
  if (game === 'teenPatti') return Math.round((bets[winner] || 0) * PAYOUT_MULT);
  const item = ITEMS[winner];
  let payout = (bets[String(winner)] || 0) * item.mult;
  if (item.type === 'veg') payout += (bets.salad || 0) * SALAD_MULT;
  else payout += (bets.pizza || 0) * PIZZA_MULT;
  return Math.floor(payout);
}

function shuffledDeck() {
  const deck = [];
  for (let suit = 0; suit < 4; suit++) for (let rank = 2; rank <= 14; rank++) deck.push({ r: rank, s: suit });
  for (let i = deck.length - 1; i > 0; i--) { const j = randomInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}
function evalHand(cards) {
  const rs = cards.map(c => c.r).sort((a,b) => b-a);
  const trail = rs[0] === rs[1] && rs[1] === rs[2];
  const color = cards[0].s === cards[1].s && cards[1].s === cards[2].s;
  let seqHigh = 0;
  if (rs[0] === 14 && rs[1] === 3 && rs[2] === 2) seqHigh = 15;
  else if (rs[0]-1 === rs[1] && rs[1]-1 === rs[2]) seqHigh = rs[0];
  let cat = 1, tie = rs[0]*10000 + rs[1]*100 + rs[2];
  if (trail) { cat = 6; tie = rs[0]; }
  else if (seqHigh && color) { cat = 5; tie = seqHigh; }
  else if (seqHigh) { cat = 4; tie = seqHigh; }
  else if (color) cat = 3;
  else if (rs[0] === rs[1] || rs[1] === rs[2]) {
    cat = 2; const pair = rs[0] === rs[1] ? rs[0] : rs[1]; const kick = rs[0] === rs[1] ? rs[2] : rs[0]; tie = pair*100 + kick;
  }
  return { score: cat*1000000 + tie, name: HAND_NAME[cat] };
}
function teenPattiResult(bets) {
  let hands, ev, winner;
  for (let tries = 0; tries < 100; tries++) {
    const deck = shuffledDeck();
    hands = { A: deck.slice(0,3), B: deck.slice(3,6), C: deck.slice(6,9) };
    ev = { A: evalHand(hands.A), B: evalHand(hands.B), C: evalHand(hands.C) };
    const sorted = ['A','B','C'].sort((a,b) => ev[b].score - ev[a].score);
    if (ev[sorted[0]].score !== ev[sorted[1]].score) { winner = sorted[0]; break; }
  }
  if (!winner) throw new HttpsError('internal', 'Could not deal a valid round. Try again.');
  const payout = Math.round((bets[winner] || 0) * PAYOUT_MULT);
  // Return cards only after the betting window has closed.
  return { winner, payout, round: { hands, ev, winner } };
}


function generateRound(game) {
  if (game === 'greedy') {
    const g = greedyResult({});
    return { winner: g.winner, round: null };
  }
  const t = teenPattiResult({});
  return { winner: t.winner, round: t.round };
}

// Shared room-round ko transaction ke BAHAR create karte hain.
// Pehle sab players ek hi document par transaction karte the -> lock contention + retries = lag.
async function getOrCreateRound(ref, game, roomId, roundId) {
  let snap = await ref.get();
  if (snap.exists) return snap.data();
  const made = generateRound(game);
  try {
    await ref.create({ game, roomId, roundId, winner: made.winner, round: made.round, createdAt: FieldValue.serverTimestamp() });
    return made;
  } catch (e) {
    // kisi aur player ne pehle bana diya (gRPC ALREADY_EXISTS = 6)
    if (e && (e.code === 6 || e.code === 'already-exists')) {
      snap = await ref.get();
      if (snap.exists) return snap.data();
    }
    throw e;
  }
}

exports.getServerTime = onCall({ region: REGION, maxInstances: 20 }, async () => ({ now: Date.now() }));

exports.settleLiveGame = onCall({ region: REGION, enforceAppCheck: false, maxInstances: 20, timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in before playing.');
  const uid = request.auth.uid;
  const { game, roundId, roomId } = request.data || {};
  if (!['greedy', 'teenPatti'].includes(game)) throw new HttpsError('invalid-argument', 'Unknown game.');
  if (typeof roundId !== 'string' || !/^[A-Za-z0-9_-]{8,160}$/.test(roundId)) throw new HttpsError('invalid-argument', 'Invalid round ID.');

  // Round ID = "<prefix>-<bucket>". Sirf current bucket +-1 accept (slow network / chhota clock difference).
  const prefix = ROUND_PREFIX[game];
  const m = new RegExp(`^${prefix}-(\\d{1,12})$`).exec(roundId);
  if (!m) throw new HttpsError('invalid-argument', 'Invalid round ID.');
  const cycleMs = ROUND_SECONDS[game] * 1000;
  const now = Date.now();
  const currentBucket = Math.floor(now / cycleMs);
  const bucket = Number(m[1]);
  // Sirf current ya pichla round. Aane wale (future) round ka result kabhi nahi milta -> koi pehle se jaan nahi sakta.
  if (bucket > currentBucket || currentBucket - bucket > ROUND_TOLERANCE) {
    throw new HttpsError('failed-precondition', 'This round has expired. Wait for the current round to finish.');
  }
  // Bet band hone se pehle result generate/return NAHI hota (modified app se pehle se jhaank nahi sakte).
  if (now < bucket * cycleMs + BET_MS[game] - EARLY_GRACE_MS) {
    throw new HttpsError('aborted', 'Betting is still open. Retry shortly.');
  }

  if (typeof roomId !== 'string' || !roomId.trim() || roomId.length > 256) throw new HttpsError('invalid-argument', 'Live room ID is required.');
  const { bets, total } = validateBets(game, request.data.bets);

  const roomRoundKey = createHash('sha256').update(`${game}|${roomId}|${roundId}`).digest('hex');
  const shared = await getOrCreateRound(db.doc(`gameRounds/${roomRoundKey}`), game, roomId, roundId);

  const settlementKey = createHash('sha256').update(`${uid}|${game}|${roomId}|${roundId}`).digest('hex');
  const settlementRef = db.doc(`gameSettlements/${settlementKey}`);

  // Bet nahi lagayi -> wallet touch nahi hota. Lekin "0 bet" bhi LOCK hoti hai: result dekhne ke baad
  // wahi account dobara bet lagakar jeet nahi sakta (pehle call = final bets).
  if (total === 0) {
    const prior0 = await settlementRef.get();
    if (prior0.exists) {
      const saved = prior0.data();
      return { winner: saved.winner, payout: saved.payout, round: saved.round || null, balance: saved.balanceAfter ?? null, stake: saved.stake, replayed: true, serverNow: Date.now() };
    }
    try {
      await settlementRef.create({ game, uid, roomId, roundId, bets: {}, stake: 0, winner: shared.winner, payout: 0, round: shared.round || null, balanceAfter: null, createdAt: FieldValue.serverTimestamp() });
    } catch (e) { if (!(e && (e.code === 6 || e.code === 'already-exists'))) throw e; }
    return { winner: shared.winner, payout: 0, round: shared.round || null, balance: null, replayed: false, serverNow: Date.now() };
  }

  const walletRef = db.doc(`wallets/${uid}`);

  return db.runTransaction(async (tx) => {
    const [prior, walletSnap] = await Promise.all([tx.get(settlementRef), tx.get(walletRef)]);
    if (prior.exists) {
      const saved = prior.data();
      return { winner: saved.winner, payout: saved.payout, round: saved.round || null, balance: saved.balanceAfter, stake: saved.stake, replayed: true, serverNow: Date.now() };
    }
    if (!walletSnap.exists) throw new HttpsError('failed-precondition', 'Wallet not found.');
    const balance = walletSnap.get('stars');
    if (!Number.isSafeInteger(balance) || balance < 0) throw new HttpsError('failed-precondition', 'Wallet balance is invalid.');
    if (balance < total) throw new HttpsError('failed-precondition', 'Not enough Stars for this bet.');
    const payout = payoutFor(game, bets, shared.winner);
    const balanceAfter = balance - total + payout;
    tx.update(walletRef, { stars: balanceAfter, totalSpent: FieldValue.increment(total) });
    tx.create(settlementRef, {
      game, uid, roomId, roundId, bets, stake: total,
      winner: shared.winner, payout, round: shared.round || null,
      balanceAfter, createdAt: FieldValue.serverTimestamp(),
    });
    return { winner: shared.winner, payout, round: shared.round || null, balance: balanceAfter, stake: total, replayed: false, serverNow: Date.now() };
  });
});

// ---------------- LEVEL = KHARCHE (spent) SE ----------------
// Recharge / admin add-stars / balance se level NAHI badhta. Sirf totalSpent (gift + game me kharch hue stars).
// Ye trigger wallet me kisi bhi write ke baad level ko sahi value par laa deta hai (koi aur code galat level
// likh bhi de to yahi theek kar deta hai). Admin ne manual level diya ho (manualLevel) to usse neeche nahi jayega.
const LEVEL_TABLE = [
  [499000, 50], [440000, 49], [385000, 48], [310000, 47], [299000, 46],
  [260000, 45], [210000, 44], [189000, 43], [155000, 42], [125000, 41],
  [110000, 40], [101000, 39], [99000, 38], [89000, 37], [78000, 36],
  [67000, 35], [51000, 34], [43000, 33], [31000, 32], [26000, 31],
  [23000, 30], [19000, 29], [17000, 28], [14000, 27], [12300, 26],
  [10500, 25], // <- purani table me 25 ka slot missing tha (level 25 kabhi nahi milta tha). Value apni marzi se badal sakte ho
  [9000, 24], [8200, 23], [7200, 22], [6100, 21], [5050, 20],
  [4000, 19], [3500, 18], [2800, 17], [2400, 16], [1900, 15],
  [1600, 14], [1300, 13], [1150, 12], [1000, 11], [870, 10],
  [670, 9], [540, 8], [360, 7], [280, 6], [200, 5], [160, 4],
  [100, 3], [60, 2], [10, 1],
];
function spentToLevel(spent) {
  for (const [min, lvl] of LEVEL_TABLE) if (spent >= min) return lvl;
  return 0;
}

exports.syncWalletLevel = onDocumentWritten(
  { document: 'wallets/{uid}', region: REGION, maxInstances: 20 }, // region = apne Firestore database ki location jaisa rakho
  async (event) => {
    const after = event.data && event.data.after;
    if (!after || !after.exists) return;
    const d = after.data() || {};
    const spent = Number.isFinite(d.totalSpent) && d.totalSpent > 0 ? Math.floor(d.totalSpent) : 0;
    const manual = Number.isFinite(d.manualLevel) ? Math.min(50, Math.max(0, Math.floor(d.manualLevel))) : 0;
    const want = Math.max(spentToLevel(spent), manual);
    if (d.level === want) return; // same hai -> dobara write nahi (loop nahi banega)
    await after.ref.update({ level: want });
  }
);
