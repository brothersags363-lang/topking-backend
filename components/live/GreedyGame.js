// components/live/GreedyGame.js
// Greedy (food wheel) - UI screenshot jaisa (ferris wheel + bunny)
// Greedy (food wheel) - bottom half panel, upar seats dikhti rehti hain.
// Props: db, uid, roomId, stars, bottom, onClose
//
// Round time se chalte hain (25s): 15s bet -> 6s spin -> 4s result. Clock SERVER se sync hota hai.
// Winner + Stars hamesha server (settleLiveGame) decide karta hai. Bet band hote hi (spin start) settlement
// bhej diya jata hai, wheel server ke winner par hi rukta hai. Result aane tak wheel ghumta rehta hai.

import React, { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Alert } from 'react-native';
import { callSettle, syncNow, syncServerClock, friendlyError } from './liveGameServer';

const BET_MS = 15000;
const SPIN_MS = 6000;
const RESULT_MS = 4000;
const CYCLE = BET_MS + SPIN_MS + RESULT_MS;
const MAX_BET_PER_ROUND = 100000; // NOTE: server (settleLiveGame) me bhi 100K cap karna hoga (100K chip ke liye)

const SALAD_MULT = 1.2; // Veg group (🍅🥬🌽🥕) - server key 'salad'
const PIZZA_MULT = 2.3; // Meat group (🌭🍢🍗🐟) - server key 'pizza'

// Ring order: upar se clockwise (screenshot jaisa). id 0-3 = Pizza (meat), id 4-7 = Salad (veg).
// IMPORTANT: server (functions/index.js) me bhi yahi mult/order rakho: [10,15,25,45,5,5,5,5]
// cnt = khane ke neeche dikhne wala "players" number (sirf display)
const ITEMS = [
  { id: 0, emoji: '🌭', mult: 10, cnt: 200 },
  { id: 1, emoji: '🍢', mult: 15, cnt: 200 },
  { id: 2, emoji: '🍗', mult: 25, cnt: 200 },
  { id: 3, emoji: '🐟', mult: 45, cnt: 200, hot: true },
  { id: 4, emoji: '🥕', mult: 5, cnt: 100 },
  { id: 5, emoji: '🌽', mult: 5, cnt: 0 },
  { id: 6, emoji: '🥬', mult: 5, cnt: 100 },
  { id: 7, emoji: '🍅', mult: 5, cnt: 200 },
];

const CHIPS = [
  { v: 100, label: '100', color: '#2ee6b6' },
  { v: 1000, label: '1K', color: '#ffc928' },
  { v: 10000, label: '10K', color: '#ff5f8d' },
  { v: 100000, label: '100K', color: '#4fb8ff' },
];

const fmt = (n = 0) =>
  n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'K' : String(n);

const sumBets = (b) => Object.values(b).reduce((a, c) => a + c, 0);

// ---- wheel animation ----
// Pehle wheel constant speed se ghumta hai (server ka jawab aane tak), jawab aate hi smoothly
// decelerate hoke winner par ruk jata hai. Winner beech me badalta nahi, isliye jhatka nahi lagta.
const SPEED = 12 / 1000;   // cells per ms
const FREE_MS = 2000;      // itna time constant speed
const spinPosition = (elapsed, winner, knownAt) => {
  if (winner == null || knownAt == null) return elapsed * SPEED;
  const td = Math.max(FREE_MS, knownAt);
  if (elapsed <= td) return elapsed * SPEED;
  const dur = Math.max(600, Math.min(3000, SPIN_MS - 300 - td));
  const p0 = td * SPEED;
  let T = Math.ceil(p0 + 10);
  while (T % 8 !== winner) T++;
  const u = Math.min(1, (elapsed - td) / dur);
  return p0 + (T - p0) * (1 - Math.pow(1 - u, 3));
};

// ---- khane ke cartoon icons (sirf View se bane, koi extra library/image nahi chahiye) ----
const bx = (cx, cy, w, h, extra) => ({ position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, ...extra });

const Food = memo(({ id, size }) => {
  const u = size;
  const W = { width: u, height: u };
  switch (id) {
    case 7: // tomato
      return (
        <View style={W}>
          <View style={bx(u * 0.5, u * 0.55, u * 0.84, u * 0.76, { borderRadius: u * 0.4, backgroundColor: '#f2323a' })} />
          <View style={bx(u * 0.3, u * 0.42, u * 0.16, u * 0.1, { borderRadius: u, backgroundColor: '#ff8a8a', transform: [{ rotate: '-30deg' }] })} />
          <View style={bx(u * 0.36, u * 0.2, u * 0.26, u * 0.12, { borderRadius: u, backgroundColor: '#2fa84f', transform: [{ rotate: '-25deg' }] })} />
          <View style={bx(u * 0.64, u * 0.2, u * 0.26, u * 0.12, { borderRadius: u, backgroundColor: '#2fa84f', transform: [{ rotate: '25deg' }] })} />
          <View style={bx(u * 0.5, u * 0.17, u * 0.1, u * 0.14, { borderRadius: u, backgroundColor: '#1f7d3a' })} />
        </View>
      );
    case 6: // cabbage
      return (
        <View style={W}>
          <View style={bx(u * 0.5, u * 0.5, u * 0.88, u * 0.88, { borderRadius: u, backgroundColor: '#3fb958' })} />
          <View style={bx(u * 0.5, u * 0.5, u * 0.62, u * 0.62, { borderRadius: u, backgroundColor: '#8ddf8a' })} />
          <View style={bx(u * 0.5, u * 0.5, u * 0.05, u * 0.62, { borderRadius: u, backgroundColor: '#3fb958' })} />
          <View style={bx(u * 0.5, u * 0.5, u * 0.36, u * 0.05, { borderRadius: u, backgroundColor: '#3fb958', transform: [{ rotate: '40deg' }] })} />
          <View style={bx(u * 0.5, u * 0.5, u * 0.36, u * 0.05, { borderRadius: u, backgroundColor: '#3fb958', transform: [{ rotate: '-40deg' }] })} />
        </View>
      );
    case 5: // corn
      return (
        <View style={W}>
          <View style={bx(u * 0.3, u * 0.62, u * 0.2, u * 0.7, { borderRadius: u, backgroundColor: '#3fb958', transform: [{ rotate: '18deg' }] })} />
          <View style={bx(u * 0.7, u * 0.62, u * 0.2, u * 0.7, { borderRadius: u, backgroundColor: '#2fa84f', transform: [{ rotate: '-18deg' }] })} />
          <View style={bx(u * 0.5, u * 0.45, u * 0.42, u * 0.82, { borderRadius: u, backgroundColor: '#ffc928' })} />
          {[0.22, 0.38, 0.54, 0.7].map((y) => [0.4, 0.6].map((x) => (
            <View key={x + '-' + y} style={bx(u * x, u * y, u * 0.1, u * 0.1, { borderRadius: u, backgroundColor: '#ffe27a' })} />
          )))}
        </View>
      );
    case 4: // carrot
      return (
        <View style={W}>
          <View style={bx(u * 0.62, u * 0.2, u * 0.16, u * 0.3, { borderRadius: u, backgroundColor: '#3fb958', transform: [{ rotate: '25deg' }] })} />
          <View style={bx(u * 0.5, u * 0.16, u * 0.16, u * 0.3, { borderRadius: u, backgroundColor: '#2fa84f' })} />
          <View style={bx(u * 0.38, u * 0.2, u * 0.16, u * 0.3, { borderRadius: u, backgroundColor: '#3fb958', transform: [{ rotate: '-25deg' }] })} />
          <View style={bx(u * 0.5, u * 0.52, u * 0.5, u * 0.62, { borderRadius: u * 0.26, backgroundColor: '#ff8a1f' })} />
          <View style={bx(u * 0.5, u * 0.84, u * 0.2, u * 0.26, { borderRadius: u * 0.1, backgroundColor: '#ff8a1f' })} />
          <View style={bx(u * 0.42, u * 0.42, u * 0.16, u * 0.04, { borderRadius: u, backgroundColor: '#e86a00' })} />
          <View style={bx(u * 0.58, u * 0.56, u * 0.16, u * 0.04, { borderRadius: u, backgroundColor: '#e86a00' })} />
        </View>
      );
    case 0: // hotdog
      return (
        <View style={W}>
          <View style={{ position: 'absolute', width: u, height: u, transform: [{ rotate: '-18deg' }] }}>
            <View style={bx(u * 0.5, u * 0.58, u * 0.9, u * 0.36, { borderRadius: u * 0.18, backgroundColor: '#f0b25a' })} />
            <View style={bx(u * 0.5, u * 0.42, u * 1.0, u * 0.22, { borderRadius: u * 0.11, backgroundColor: '#d8432b' })} />
            {[0.22, 0.38, 0.54, 0.7, 0.86].map((x, i) => (
              <View key={x} style={bx(u * x, u * (i % 2 ? 0.4 : 0.44), u * 0.1, u * 0.06, { borderRadius: u, backgroundColor: '#ffd23f' })} />
            ))}
            <View style={bx(u * 0.5, u * 0.68, u * 0.84, u * 0.1, { borderRadius: u, backgroundColor: '#e39b3d' })} />
          </View>
        </View>
      );
    case 1: // skewer
      return (
        <View style={W}>
          <View style={{ position: 'absolute', width: u, height: u, transform: [{ rotate: '-40deg' }] }}>
            <View style={bx(u * 0.5, u * 0.5, u * 1.0, u * 0.06, { borderRadius: u, backgroundColor: '#b57a3a' })} />
            <View style={bx(u * 0.3, u * 0.5, u * 0.24, u * 0.3, { borderRadius: u * 0.08, backgroundColor: '#c8602b' })} />
            <View style={bx(u * 0.5, u * 0.5, u * 0.24, u * 0.3, { borderRadius: u * 0.08, backgroundColor: '#7ac14f' })} />
            <View style={bx(u * 0.7, u * 0.5, u * 0.24, u * 0.3, { borderRadius: u * 0.08, backgroundColor: '#c8602b' })} />
          </View>
        </View>
      );
    case 2: // drumstick
      return (
        <View style={W}>
          <View style={{ position: 'absolute', width: u, height: u, transform: [{ rotate: '-40deg' }] }}>
            <View style={bx(u * 0.22, u * 0.5, u * 0.34, u * 0.1, { borderRadius: u, backgroundColor: '#fff1d6' })} />
            <View style={bx(u * 0.1, u * 0.44, u * 0.12, u * 0.12, { borderRadius: u, backgroundColor: '#fff1d6' })} />
            <View style={bx(u * 0.1, u * 0.56, u * 0.12, u * 0.12, { borderRadius: u, backgroundColor: '#fff1d6' })} />
            <View style={bx(u * 0.6, u * 0.5, u * 0.62, u * 0.48, { borderRadius: u * 0.26, backgroundColor: '#d9772a' })} />
            <View style={bx(u * 0.66, u * 0.42, u * 0.28, u * 0.1, { borderRadius: u, backgroundColor: '#f0a25a' })} />
          </View>
        </View>
      );
    case 3: // fish
      return (
        <View style={W}>
          <View style={{ position: 'absolute', left: u * 0.02, top: u * 0.3, width: 0, height: 0, borderTopWidth: u * 0.2, borderBottomWidth: u * 0.2, borderLeftWidth: u * 0.0, borderRightWidth: u * 0.28, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: '#ff7a1f' }} />
          <View style={bx(u * 0.56, u * 0.5, u * 0.66, u * 0.46, { borderRadius: u * 0.3, backgroundColor: '#ff8a2b' })} />
          <View style={bx(u * 0.52, u * 0.3, u * 0.26, u * 0.14, { borderRadius: u, backgroundColor: '#ff6a1a', transform: [{ rotate: '-20deg' }] })} />
          <View style={bx(u * 0.52, u * 0.58, u * 0.34, u * 0.14, { borderRadius: u, backgroundColor: '#ffb066' })} />
          <View style={bx(u * 0.74, u * 0.44, u * 0.14, u * 0.14, { borderRadius: u, backgroundColor: '#fff' })} />
          <View style={bx(u * 0.76, u * 0.44, u * 0.07, u * 0.07, { borderRadius: u, backgroundColor: '#222' })} />
        </View>
      );
    case 'pizza':
      return (
        <View style={W}>
          <View style={bx(u * 0.5, u * 0.5, u * 0.9, u * 0.9, { borderRadius: u, backgroundColor: '#e8933a' })} />
          <View style={bx(u * 0.5, u * 0.5, u * 0.74, u * 0.74, { borderRadius: u, backgroundColor: '#ffc94d' })} />
          {[[0.4, 0.38], [0.62, 0.46], [0.46, 0.64], [0.66, 0.68], [0.3, 0.56]].map(([x, y]) => (
            <View key={x + '' + y} style={bx(u * x, u * y, u * 0.14, u * 0.14, { borderRadius: u, backgroundColor: '#e03a2f' })} />
          ))}
        </View>
      );
    case 'salad':
      return (
        <View style={W}>
          <View style={bx(u * 0.34, u * 0.42, u * 0.28, u * 0.28, { borderRadius: u, backgroundColor: '#3fb958' })} />
          <View style={bx(u * 0.64, u * 0.4, u * 0.3, u * 0.3, { borderRadius: u, backgroundColor: '#6fd06a' })} />
          <View style={bx(u * 0.5, u * 0.34, u * 0.2, u * 0.2, { borderRadius: u, backgroundColor: '#f2323a' })} />
          <View style={bx(u * 0.5, u * 0.62, u * 0.9, u * 0.36, { borderBottomLeftRadius: u * 0.45, borderBottomRightRadius: u * 0.45, borderTopLeftRadius: u * 0.04, borderTopRightRadius: u * 0.04, backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#cfd8e8' })} />
        </View>
      );
    default:
      return <View style={W} />;
  }
});

// ---- bunny (hub ke andar) ----
const Bunny = memo(({ size }) => {
  const u = size;
  return (
    <View style={{ width: u, height: u }}>
      <View style={bx(u * 0.34, u * 0.2, u * 0.2, u * 0.46, { borderRadius: u * 0.1, backgroundColor: '#fff' })} />
      <View style={bx(u * 0.34, u * 0.22, u * 0.09, u * 0.32, { borderRadius: u * 0.05, backgroundColor: '#ffb3c6' })} />
      <View style={bx(u * 0.66, u * 0.2, u * 0.2, u * 0.46, { borderRadius: u * 0.1, backgroundColor: '#fff' })} />
      <View style={bx(u * 0.66, u * 0.22, u * 0.09, u * 0.32, { borderRadius: u * 0.05, backgroundColor: '#ffb3c6' })} />
      <View style={bx(u * 0.5, u * 0.62, u * 0.82, u * 0.62, { borderRadius: u * 0.34, backgroundColor: '#fff' })} />
      <View style={bx(u * 0.33, u * 0.6, u * 0.07, u * 0.09, { borderRadius: u, backgroundColor: '#3a2a4a' })} />
      <View style={bx(u * 0.67, u * 0.6, u * 0.07, u * 0.09, { borderRadius: u, backgroundColor: '#3a2a4a' })} />
      <View style={bx(u * 0.24, u * 0.7, u * 0.13, u * 0.08, { borderRadius: u, backgroundColor: '#ffb3c6' })} />
      <View style={bx(u * 0.76, u * 0.7, u * 0.13, u * 0.08, { borderRadius: u, backgroundColor: '#ffb3c6' })} />
      <View style={bx(u * 0.5, u * 0.68, u * 0.08, u * 0.06, { borderRadius: u, backgroundColor: '#f2708f' })} />
    </View>
  );
});

// ---- background dots ----
const Dots = memo(({ w, h }) => {
  const out = [];
  for (let y = 10, j = 0; y < h; y += 26, j++) {
    for (let x = (j % 2 ? 24 : 11); x < w; x += 26) {
      out.push(<View key={x + '-' + y} style={{ position: 'absolute', left: x, top: y, width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.07)' }} />);
    }
  }
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: w, height: h }}>{out}</View>;
});

// ---- memoized pieces ----
const Cell = memo(({ item, cell, x, y, active, win, mine, onPress }) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={() => onPress(item.id)}
    style={[st.cell, { width: cell, height: cell, borderRadius: cell / 2, left: x, top: y }, item.hot && st.cellHot, active && st.cellActive, win && st.cellWin]}
  >
    <View style={{ marginTop: -cell * 0.06 }}><Food id={item.id} size={cell * 0.6} /></View>
    {mine ? (
      <Text allowFontScaling={false} style={st.mine}>{fmt(mine)}</Text>
    ) : item.cnt > 0 ? (
      <Text allowFontScaling={false} style={st.cnt}>👥 {item.cnt}</Text>
    ) : (
      <Text allowFontScaling={false} style={st.cnt}> </Text>
    )}
    <View style={[st.multPill, item.mult >= 25 && st.multHot]}>
      <Text allowFontScaling={false} style={st.multTxt}>×{item.mult}</Text>
    </View>
    {item.hot ? (
      <View style={st.hotWrap}>
        <Text allowFontScaling={false} style={{ fontSize: 20 }}>🔥</Text>
        <View style={st.hotPill}><Text allowFontScaling={false} style={st.hotTxt}>HOT</Text></View>
      </View>
    ) : null}
  </TouchableOpacity>
));

const Side = memo(({ k, label, bet, style, onPress }) => (
  <TouchableOpacity activeOpacity={0.8} onPress={() => onPress(k)} style={[st.side, style]}>
    <View style={st.sideCircle}>
      <Food id={k} size={40} />
      {!!bet && <Text allowFontScaling={false} style={st.sideBet}>{fmt(bet)}</Text>}
    </View>
    <Text allowFontScaling={false} style={st.sideTxt}>{label}</Text>
  </TouchableOpacity>
));

const phaseOf = (t) => (t < BET_MS ? 'bet' : t < BET_MS + SPIN_MS ? 'spin' : 'result');

export default function GreedyGame({ db, uid, roomId, stars = 0, bottom = 10, onClose }) {
  const { width, height } = useWindowDimensions();
  const [chip, setChip] = useState(100);
  const [bets, setBets] = useState({});
  const [wonToday, setWonToday] = useState(0);
  const [walletBalance, setWalletBalance] = useState(Number(stars) || 0);
  const [toast, setToast] = useState('');
  const [muted, setMuted] = useState(false);

  // clock state: sirf tab badalte hain jab value sach me badle -> kam re-render
  const [round, setRound] = useState(() => Math.floor(syncNow() / CYCLE));
  const [phase, setPhase] = useState(() => phaseOf(syncNow() % CYCLE));
  const [secLeft, setSecLeft] = useState(15);
  const [active, setActive] = useState(-1);

  const [outcome, setOutcome] = useState(null);          // { winner, payout } server se
  const [status, setStatus] = useState('idle');          // idle | pending | settled | failed
  const [lockedBalance, setLockedBalance] = useState(null); // spin ke time dikhane wala balance (bet kat chuka, jeet abhi chhupi)
  const [history, setHistory] = useState([]);            // pichle server winners

  const mounted = useRef(true);
  const betsRef = useRef({});
  const chipRef = useRef(100);
  const balRef = useRef(Number(stars) || 0);
  const lockStarsRef = useRef(null); // wallet (live) ka balance jab bet lock hui
  const phaseRef = useRef(phase);
  const roundRef = useRef(round);
  const requested = useRef(new Set());
  const winnerRef = useRef(null);
  const knownAtRef = useRef(null);
  const toastTimer = useRef(null);

  chipRef.current = chip;
  phaseRef.current = phase;
  roundRef.current = round;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; clearTimeout(toastTimer.current); }; }, []);
  useEffect(() => { syncServerClock(); }, []);

  useEffect(() => {
    if (Number.isFinite(Number(stars))) { balRef.current = Number(stars); setWalletBalance(Number(stars)); }
  }, [stars]);

  const showToast = useCallback((m, ms = 2200) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), ms);
  }, []);

  // ---- ek hi clock interval; setState same value par re-render nahi karta ----
  useEffect(() => {
    const id = setInterval(() => {
      const n = syncNow();
      const r = Math.floor(n / CYCLE);
      const t = n % CYCLE;
      const ph = phaseOf(t);
      setRound(r);
      setPhase(ph);
      setSecLeft(Math.max(0, Math.ceil((BET_MS - t) / 1000)));
      if (ph === 'spin') {
        const pos = spinPosition(t - BET_MS, winnerRef.current, knownAtRef.current);
        setActive(Math.floor(pos + 1e-6) % 8);
      } else if (ph === 'result') {
        setActive(winnerRef.current == null ? -1 : winnerRef.current);
      } else {
        setActive(-1);
      }
    }, 50);
    return () => clearInterval(id);
  }, []);

  // naya round -> sab reset
  useEffect(() => {
    betsRef.current = {};
    setBets({});
    setOutcome(null);
    setStatus('idle');
    setLockedBalance(null);
    winnerRef.current = null;
    knownAtRef.current = null;
    lockStarsRef.current = null;
  }, [round]);

  // ---- SETTLEMENT: bet band hote hi (spin start) server ko bhejo ----
  // Component band ho jaye tab bhi call chalti rehti hai (cancel nahi hoti), isliye Stars sahi kat'te hain.
  useEffect(() => {
    if (phase === 'bet' || !uid || !roomId) return;
    const id = `greedy-${round}`;
    if (requested.current.has(id)) return;
    requested.current.add(id);

    const placed = { ...betsRef.current };
    const total = sumBets(placed);
    const spinStart = Math.floor(syncNow() / CYCLE) * CYCLE + BET_MS;
    lockStarsRef.current = balRef.current;
    if (total > 0) setLockedBalance(Math.max(0, balRef.current - total));
    setStatus('pending');

    callSettle({ game: 'greedy', roomId: String(roomId), roundId: id, bets: placed })
      .then((data) => {
        if (!Number.isInteger(data.winner)) throw new Error('Server returned an incomplete settlement.');
        if (!mounted.current) return;
        if (roundRef.current !== round) return; // round badal chuka; balance listener sambhal lega
        knownAtRef.current = syncNow() - spinStart;
        winnerRef.current = data.winner;
        // NOTE: balance yahan se wallet state me NAHI likhte -> sirf live wallet (wallets/<uid>.stars) hi asli source hai.
        // Server ka balance sirf tab kaam aata hai jab live wallet abhi update na hua ho (neeche liveBalance).
        setOutcome({
          winner: data.winner,
          payout: Number(data.payout) || 0,
          stake: total,
          balance: Number.isFinite(Number(data.balance)) ? Number(data.balance) : null,
        });
        setHistory((h) => [data.winner, ...h].slice(0, 8));
        setStatus('settled');
      })
      .catch((e) => {
        if (!mounted.current) return;
        requested.current.delete(id);
        setLockedBalance(null);
        setStatus('failed');
        showToast(friendlyError(e), 7000);
      });
  }, [phase, round, uid, roomId, showToast]);

  // jeet ka message result phase me hi (spin me spoiler nahi)
  useEffect(() => {
    if (phase !== 'result' || !outcome) return;
    // jo message dikhe wahi balance me badlav hona chahiye -> NET (payout - bet)
    const net = outcome.payout - outcome.stake;
    if (outcome.stake <= 0) return;
    if (net > 0) { setWonToday((w) => w + net); showToast('You won +' + fmt(net) + ' ⭐'); }
    else if (net === 0) showToast('Bet wapas mili');
    else showToast('You lost -' + fmt(-net) + ' ⭐');
  }, [phase, outcome, showToast]);

  const place = useCallback((key) => {
    if (phaseRef.current !== 'bet') return;
    if (typeof key === 'number' && ITEMS[key] && ITEMS[key].mult <= 0) return;
    if (syncNow() % CYCLE > BET_MS - 500) return;
    const total = sumBets(betsRef.current);
    const c = chipRef.current;
    if (total + c > MAX_BET_PER_ROUND) { showToast('Max 10,000 Stars per round'); return; }
    if (balRef.current - total < c) { showToast('Not enough stars'); return; }
    betsRef.current = { ...betsRef.current, [key]: (betsRef.current[key] || 0) + c };
    setBets(betsRef.current);
  }, [showToast]);

  // ---- layout ----
  const panelH = Math.round(height * 0.62);
  const availH = panelH - 56 - 150;
  const S = Math.max(220, Math.min(width - 8, availH));
  const cell = S * 0.27;
  const r = (S - cell) / 2;
  const c = S / 2;
  const centerSize = S * 0.34;
  const pos = useMemo(
    () => ITEMS.map((it) => {
      const a = (it.id * Math.PI) / 4;
      return { x: c + r * Math.sin(a) - cell / 2, y: c - r * Math.cos(a) - cell / 2 };
    }),
    [c, r, cell]
  );

  const settledWinner = outcome ? outcome.winner : null;
  const badgeText =
    phase === 'bet' ? String(secLeft)
      : phase === 'spin' ? '···'
      : settledWinner == null ? (status === 'failed' ? '✕' : '···')
      : '×' + ITEMS[settledWinner].mult;

  const liveBalance =
    outcome && outcome.stake > 0 && outcome.balance != null && walletBalance === lockStarsRef.current
      ? outcome.balance
      : walletBalance;
  useEffect(() => { balRef.current = liveBalance; }, [liveBalance]);

  const shownBalance = Math.max(
    0,
    phase === 'bet' ? liveBalance - sumBets(bets)
      : phase === 'spin' && lockedBalance != null ? lockedBalance
      : liveBalance
  );

  const playing = 60 + (round % 37);
  const money = (n) => Number(n).toLocaleString('en-US');

  return (
    <View style={[st.panel, { height: panelH, bottom }]} pointerEvents="box-none">
      <Dots w={width} h={panelH} />
      <View style={st.head}>
        <View>
          <Text allowFontScaling={false} style={st.title}>Greedy</Text>
          <Text allowFontScaling={false} style={st.round}>Round {round % 100000}</Text>
          <Text allowFontScaling={false} style={st.sub}><Text style={{ color: '#2ee6b6' }}>● </Text>{playing} playing</Text>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity style={st.hBtn} onPress={() => setMuted((m) => !m)}>
            <Text allowFontScaling={false} style={{ fontSize: 15 }}>{muted ? '🔇' : '🔊'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={st.hBtn}
            onPress={() =>
              Alert.alert(
                'Greedy rules',
                'Chip chuno, phir khane par tap karke bet lagao.\nWheel ruke to jis khane par ruke uska multiplier milega.\nPizza = 🌭🍢🍗🐟 me se koi jeete (×2.3), Salad = 🍅🥬🌽🥕 me se koi jeete (×1.2).'
              )
            }
          >
            <Text allowFontScaling={false} style={st.hTxt}>?</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ width: S, height: S, alignSelf: 'center' }}>
        {/* yellow stand */}
        <View style={[st.leg, { left: c + S * 0.075 - 9, top: c + S * 0.1, height: S * 0.6, transform: [{ rotate: '-14deg' }] }]} />
        <View style={[st.leg, { left: c - S * 0.075 - 9, top: c + S * 0.1, height: S * 0.6, transform: [{ rotate: '14deg' }] }]} />
        {/* spokes */}
        {ITEMS.map((it) => (
          <View key={'sp' + it.id} pointerEvents="none" style={{ position: 'absolute', width: S, height: S, transform: [{ rotate: it.id * 45 + 'deg' }] }}>
            <View style={st.spoke} />
          </View>
        ))}
        {/* ring dots */}
        {ITEMS.map((it) => {
          const a = ((it.id + 0.5) * Math.PI) / 4;
          const d = cell * 0.2;
          return <View key={'rd' + it.id} pointerEvents="none" style={{ position: 'absolute', width: d, height: d, borderRadius: d / 2, backgroundColor: '#fff', borderWidth: 2, borderColor: '#ffc928', left: c + r * Math.sin(a) - d / 2, top: c - r * Math.cos(a) - d / 2 }} />;
        })}
        {/* hub */}
        <View style={[st.center, { width: centerSize, height: centerSize, borderRadius: centerSize / 2, left: c - centerSize / 2, top: c - centerSize / 2 }]}>
          <Bunny size={centerSize * 0.78} />
        </View>
        <View style={[st.badge, { left: c - 22, top: c + centerSize / 2 - 18 }]}>
          <Text allowFontScaling={false} style={st.badgeTxt}>{badgeText}</Text>
        </View>
        {ITEMS.map((item) => (
          <Cell
            key={item.id}
            item={item}
            cell={cell}
            x={pos[item.id].x}
            y={pos[item.id].y}
            active={active === item.id}
            win={phase === 'result' && settledWinner === item.id}
            mine={bets[item.id] || 0}
            onPress={place}
          />
        ))}
        <Side k="salad" label="Salad" bet={bets.salad} style={{ left: 0, bottom: 0 }} onPress={place} />
        <Side k="pizza" label="Pizza" bet={bets.pizza} style={{ right: 0, bottom: 0 }} onPress={place} />
      </View>

      {!!toast && (
        <View style={st.toast} pointerEvents="none">
          <Text allowFontScaling={false} style={st.toastTxt}>{toast}</Text>
        </View>
      )}

      <View style={st.barWrap}>
        <View style={st.bar}>
          <View style={st.bal}>
            <View style={st.balRow}>
              <View style={st.coin}><Text allowFontScaling={false} style={st.coinTxt}>D</Text></View>
              <Text allowFontScaling={false} style={st.balMain}>{money(shownBalance)}</Text>
            </View>
            <Text allowFontScaling={false} style={st.balSub}>Won today {fmt(wonToday)}</Text>
            <View style={st.plus}><Text allowFontScaling={false} style={st.plusTxt}>+</Text></View>
          </View>
          <View style={st.chips}>
            {CHIPS.map((ch) => (
              <TouchableOpacity
                key={ch.v}
                activeOpacity={0.8}
                onPress={() => setChip(ch.v)}
                style={[st.chip, { borderColor: ch.color }, chip === ch.v && st.chipOn]}
              >
                <View style={[st.chipInner, { borderColor: ch.color }]}>
                  <Text allowFontScaling={false} style={st.chipTxt}>{ch.label}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <View style={st.hist}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={[st.histDot, i === 0 && history.length > 0 && st.histNew]}>
            {history[i] != null ? <Food id={history[i]} size={22} /> : null}
            {i === 0 && history.length > 0 ? <View style={st.newTag}><Text allowFontScaling={false} style={st.newTxt}>new</Text></View> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  panel: {
    position: 'absolute', left: 0, right: 0, backgroundColor: '#3a1fb5',
    borderTopLeftRadius: 4, borderTopRightRadius: 4, paddingHorizontal: 0, paddingTop: 10,
    zIndex: 80, elevation: 30,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', height: 56, paddingHorizontal: 14 },
  title: { color: '#ffc928', fontSize: 24, fontWeight: '900' },
  round: { color: '#c9c3ff', fontSize: 11, fontWeight: '800' },
  sub: { color: '#c9c3ff', fontSize: 11, fontWeight: '700' },
  hBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,10,0.35)',
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  hTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
  leg: { position: 'absolute', width: 16, backgroundColor: '#ffc928', borderRadius: 6 },
  spoke: { position: 'absolute', left: '50%', marginLeft: -5, top: 0, height: '50%', width: 10, backgroundColor: '#ffc928' },
  center: {
    position: 'absolute', backgroundColor: '#f0476f', alignItems: 'center', justifyContent: 'center',
    borderWidth: 5, borderColor: '#ff7a9c',
  },
  bunnyFace: { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', width: 44, height: 30, borderRadius: 15, backgroundColor: '#ffc928',
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#3a1fb5',
  },
  badgeTxt: { color: '#3b2a00', fontSize: 15, fontWeight: '900' },
  cell: {
    position: 'absolute', backgroundColor: '#fff8e7', alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'transparent',
  },
  cellHot: { borderColor: '#ff3d71' },
  cellActive: { backgroundColor: '#ffe9a8', borderColor: '#ff3d71' },
  cellWin: { backgroundColor: '#ffd23f', borderColor: '#fff' },
  cnt: { color: '#5b3fd9', fontSize: 11, fontWeight: '800', height: 14 },
  mine: { color: '#e0245e', fontSize: 12, fontWeight: '900', height: 14 },
  multPill: {
    position: 'absolute', bottom: -9, backgroundColor: '#2b1d7a', borderRadius: 11,
    paddingHorizontal: 9, paddingVertical: 1,
  },
  multHot: { backgroundColor: '#ff3d5e' },
  multTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  hotWrap: { position: 'absolute', left: -14, bottom: 6, alignItems: 'center' },
  hotPill: { backgroundColor: '#ff3d5e', borderRadius: 6, paddingHorizontal: 5 },
  hotTxt: { color: '#fff', fontSize: 8, fontWeight: '900' },
  side: { position: 'absolute', alignItems: 'center' },
  sideCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff8e7',
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#ffe9a8',
  },
  sideTxt: { color: '#fff', fontSize: 12, fontWeight: '800', marginTop: 2 },
  sideBet: { position: 'absolute', bottom: -2, color: '#e0245e', fontSize: 10, fontWeight: '900' },
  toast: {
    position: 'absolute', alignSelf: 'center', top: 60, backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14,
  },
  toastTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  barWrap: { backgroundColor: '#2a1670', marginTop: 6, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  bar: { flexDirection: 'row', alignItems: 'center' },
  bal: { backgroundColor: '#fff8e7', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 10, minWidth: 118 },
  balRow: { flexDirection: 'row', alignItems: 'center' },
  coin: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#ffb300', alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  coinTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  balMain: { color: '#3b2a00', fontSize: 20, fontWeight: '900' },
  balSub: { color: '#8a6d1a', fontSize: 10, fontWeight: '700', marginTop: 2 },
  plus: { position: 'absolute', right: -6, top: -8, width: 22, height: 22, borderRadius: 11, backgroundColor: '#1db954', alignItems: 'center', justifyContent: 'center' },
  plusTxt: { color: '#fff', fontSize: 16, fontWeight: '900', marginTop: -2 },
  chips: {
    flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    backgroundColor: '#25166a', borderRadius: 16, marginLeft: 10, paddingVertical: 6,
  },
  chip: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', borderWidth: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  chipInner: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  chipOn: { transform: [{ scale: 1.2 }] },
  chipTxt: { color: '#222', fontSize: 11, fontWeight: '900' },
  hist: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 8, backgroundColor: '#2a1670' },
  histDot: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff3d6',
    alignItems: 'center', justifyContent: 'center', marginHorizontal: 3,
  },
  histNew: { backgroundColor: '#ffb300' },
  newTag: { position: 'absolute', bottom: -6, backgroundColor: '#ff3d5e', borderRadius: 6, paddingHorizontal: 4 },
  newTxt: { color: '#fff', fontSize: 8, fontWeight: '900' },
});
