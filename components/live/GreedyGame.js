// components/live/GreedyGame.js
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
const MAX_BET_PER_ROUND = 10000;

const SALAD_MULT = 1.5; // Mix group (🍌🍍🍇🍊) - server key 'salad'
const PIZZA_MULT = 2.3; // Red group (🍎🍓🍒🍉) - server key 'pizza'

// Sirf fal. id 0-3 = laal fal (Red group), id 4-7 = baaki fal (Mix group). mult 0 wale khane par bet nahi lagti (khali khana).
// Ring order: upar se clockwise. (mult/weight server me bhi same hain: functions/index.js)
const ITEMS = [
  { id: 0, emoji: '🍎', mult: 12 },
  { id: 1, emoji: '🍓', mult: 8 },
  { id: 2, emoji: '🍒', mult: 5 },
  { id: 3, emoji: '🍉', mult: 28 },
  { id: 4, emoji: '🍌', mult: 3 },
  { id: 5, emoji: '🍍', mult: 12 },
  { id: 6, emoji: '🍇', mult: 8 },
  { id: 7, emoji: '🍊', mult: 35 },
];

const CHIPS = [
  { v: 50, label: '50', color: '#3ddc97' },
  { v: 100, label: '100', color: '#ffd23f' },
  { v: 500, label: '500', color: '#ff6b9d' },
  { v: 1000, label: '1K', color: '#4fc3f7' },
  { v: 10000, label: '10K', color: '#b388ff' },
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

// ---- memoized pieces: sirf badle hue cells re-render hote hain (lag ka main fix) ----
const Cell = memo(({ item, cell, x, y, active, win, mine, onPress }) => (
  <TouchableOpacity
    activeOpacity={item.mult > 0 ? 0.8 : 1}
    disabled={item.mult <= 0}
    onPress={() => onPress(item.id)}
    style={[st.cell, { width: cell, height: cell, borderRadius: cell / 2, left: x, top: y }, item.mult <= 0 && st.cellEmpty, active && st.cellActive, win && st.cellWin]}
  >
    <Text allowFontScaling={false} style={{ fontSize: cell * 0.42 }}>{item.emoji}</Text>
    <Text allowFontScaling={false} style={st.mine}>{mine ? fmt(mine) : ' '}</Text>
    {item.mult > 0 ? (
      <View style={[st.multPill, item.mult >= 12 && st.multHot]}>
        <Text allowFontScaling={false} style={st.multTxt}>×{item.mult}</Text>
      </View>
    ) : null}
  </TouchableOpacity>
));

const Side = memo(({ k, label, emoji, mult, bet, style, onPress }) => (
  <TouchableOpacity activeOpacity={0.8} onPress={() => onPress(k)} style={[st.side, style]}>
    <Text allowFontScaling={false} style={{ fontSize: 22 }}>{emoji}</Text>
    <Text allowFontScaling={false} style={st.sideTxt}>{label} ×{mult}</Text>
    {!!bet && <Text allowFontScaling={false} style={st.sideBet}>{fmt(bet)}</Text>}
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
  const centerSize = S * 0.3;
  const pos = useMemo(
    () => ITEMS.map((it) => {
      const a = (it.id * Math.PI) / 4;
      return { x: c + r * Math.sin(a) - cell / 2, y: c - r * Math.cos(a) - cell / 2 };
    }),
    [c, r, cell]
  );

  const settledWinner = outcome ? outcome.winner : null;
  const centerText =
    phase === 'bet' ? 'Bet ' + secLeft + 's'
      : phase === 'spin' ? 'Spinning'
      : settledWinner == null ? (status === 'failed' ? 'No result' : 'Checking')
      : ITEMS[settledWinner].mult > 0 ? '×' + ITEMS[settledWinner].mult : 'No win';

  // balance: bet me (balance - lagi bet), spin me kata hua balance (jeet chhupi), result me asli balance
  // liveBalance: hamesha wallet (live) se. Agar wallet snapshot abhi tak nahi aaya (bet lock ke baad wahi purana
  // balance dikh raha) to server ka diya hua final balance use hota hai. Dono ek saath kabhi nahi ladte.
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

  return (
    <View style={[st.panel, { height: panelH, bottom }]} pointerEvents="box-none">
      <View style={st.head}>
        <View>
          <Text allowFontScaling={false} style={st.title}>Greedy</Text>
          <Text allowFontScaling={false} style={st.sub}>Round {round % 100000}</Text>
          <Text allowFontScaling={false} style={st.sub}>● {playing} playing</Text>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity style={st.hBtn} onPress={() => setMuted((m) => !m)}>
            <Text allowFontScaling={false} style={{ fontSize: 16 }}>{muted ? '🔇' : '🔊'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={st.hBtn}
            onPress={() =>
              Alert.alert(
                'Greedy rules',
                'Chip chuno, phir fal par tap karke bet lagao.\nWheel ruke to jis fal par ruke uska multiplier milega.\nRed = 🍎🍓🍒🍉 me se koi jeete (×2.3), Mix = 🍌🍍🍇🍊 me se koi jeete (×1.5).'
              )
            }
          >
            <Text allowFontScaling={false} style={st.hTxt}>?</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.hBtn} onPress={onClose}>
            <Text allowFontScaling={false} style={st.hTxt}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ width: S, height: S, alignSelf: 'center' }}>
        <View
          style={[st.center, { width: centerSize, height: centerSize, borderRadius: centerSize / 2, left: c - centerSize / 2, top: c - centerSize / 2 }]}
        >
          <Text allowFontScaling={false} style={{ fontSize: centerSize * 0.4 }}>🐰</Text>
          <View style={st.centerPill}>
            <Text allowFontScaling={false} style={st.centerTxt}>{centerText}</Text>
          </View>
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
        <Side k="salad" label="Mix" emoji="🍊" mult={SALAD_MULT} bet={bets.salad} style={{ left: 0, bottom: 0 }} onPress={place} />
        <Side k="pizza" label="Red" emoji="🍎" mult={PIZZA_MULT} bet={bets.pizza} style={{ right: 0, bottom: 0 }} onPress={place} />
      </View>

      {!!toast && (
        <View style={st.toast} pointerEvents="none">
          <Text allowFontScaling={false} style={st.toastTxt}>{toast}</Text>
        </View>
      )}

      <View style={st.bar}>
        <View style={st.bal}>
          <Text allowFontScaling={false} style={st.balMain}>⭐ {fmt(shownBalance)}</Text>
          <Text allowFontScaling={false} style={st.balSub}>Won today {fmt(wonToday)}</Text>
        </View>
        <View style={st.chips}>
          {CHIPS.map((ch) => (
            <TouchableOpacity
              key={ch.v}
              activeOpacity={0.8}
              onPress={() => setChip(ch.v)}
              style={[st.chip, { borderColor: ch.color }, chip === ch.v && st.chipOn]}
            >
              <Text allowFontScaling={false} style={st.chipTxt}>{ch.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={st.hist}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={[st.histDot, i === 0 && history.length > 0 && st.histNew]}>
            <Text allowFontScaling={false} style={{ fontSize: 15 }}>{history[i] != null ? ITEMS[history[i]].emoji : ''}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  panel: {
    position: 'absolute', left: 0, right: 0, backgroundColor: '#2a1a8a',
    borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 10, paddingTop: 10,
    zIndex: 80, elevation: 30,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', height: 56 },
  title: { color: '#ffd23f', fontSize: 20, fontWeight: '900' },
  sub: { color: '#c9c3ff', fontSize: 10, fontWeight: '700' },
  hBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  hTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
  center: {
    position: 'absolute', backgroundColor: '#ff3d71', alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#ff8fab',
  },
  centerPill: { backgroundColor: '#ffd23f', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 },
  centerTxt: { color: '#3b2a00', fontSize: 11, fontWeight: '900' },
  cell: {
    position: 'absolute', backgroundColor: '#fff8e7', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  cellEmpty: { opacity: 0.75 },
  cellActive: { backgroundColor: '#ffe082', borderColor: '#ff3d71' },
  cellWin: { backgroundColor: '#ffd23f', borderColor: '#fff', borderWidth: 3 },
  mine: { color: '#5b3fd9', fontSize: 10, fontWeight: '900', height: 12 },
  multPill: {
    position: 'absolute', bottom: -8, backgroundColor: '#ffffff', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 1, borderWidth: 1, borderColor: '#ddd',
  },
  multHot: { backgroundColor: '#ff3d71', borderColor: '#ff3d71' },
  multTxt: { color: '#222', fontSize: 11, fontWeight: '900' },
  side: {
    position: 'absolute', width: 66, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  sideTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
  sideBet: { color: '#ffd23f', fontSize: 10, fontWeight: '900' },
  toast: {
    position: 'absolute', alignSelf: 'center', top: 60, backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14,
  },
  toastTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  bar: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  bal: { backgroundColor: '#fff8e7', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, minWidth: 96 },
  balMain: { color: '#3b2a00', fontSize: 15, fontWeight: '900' },
  balSub: { color: '#8a6d1a', fontSize: 9, fontWeight: '700' },
  chips: {
    flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 16, marginLeft: 8, paddingVertical: 6,
  },
  chip: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', borderWidth: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  chipOn: { transform: [{ scale: 1.18 }], borderWidth: 5 },
  chipTxt: { color: '#222', fontSize: 11, fontWeight: '900' },
  hist: { flexDirection: 'row', justifyContent: 'center', marginTop: 6 },
  histDot: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center', marginHorizontal: 3,
  },
  histNew: { borderWidth: 2, borderColor: '#ff3d71' },
});
