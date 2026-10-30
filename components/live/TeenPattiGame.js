import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { callSettle, syncNow, syncServerClock, friendlyError } from './liveGameServer';

const { width, height } = Dimensions.get('window');

// ===== SETTINGS (yahin se badlo) =====
// Cycle = BET + DEAL + RESULT = 34s (functions/index.js: ROUND_SECONDS.teenPatti = 34 aur BET_MS.teenPatti = 26000 se SAME)
const BET_MS = 26000;     // betting ka time
const DEAL_MS = 2000;     // bet band -> server cards baant raha hai (isi time me settlement jaata hai)
const RESULT_MS = 6000;   // result dikhne ka time
const CYCLE = BET_MS + DEAL_MS + RESULT_MS;
const PAYOUT_MULT = 2.9;  // jeetne par bet x 2.9
const CHIPS = [100, 1000, 10000];
const MAX_BET_PER_ROUND = 10000;
const PANEL_H = Math.round(height * 0.5);   // aadhi screen
const SLOTS = ['A', 'B', 'C'];
const SLOT_COLORS = { A: '#e0245e', B: '#1fa463', C: '#6a3de8' };

const fmt = (n = 0) =>
  n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k' : String(n);

// ===== CARDS =====
// Cards server shuffle karta hai (settleLiveGame). Client sirf dikhata hai.
const SUITS = ['♠', '♥', '♣', '♦'];
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const rankLabel = (r) => RANK_LABEL[r] || String(r);

const phaseOf = (t) => (t < BET_MS ? 'bet' : t < BET_MS + DEAL_MS ? 'deal' : 'reveal');

// ===== UI PIECES =====
const CARD_W = Math.min(46, (width - 60) / 3 / 2.2);
const CARD_H = Math.round(CARD_W * 1.4);

const PlayingCard = memo(({ card, faceUp, offset }) => {
  const red = card && (card.s === 1 || card.s === 3);
  return (
    <View style={[st.card, { marginLeft: offset ? -CARD_W * 0.45 : 0 }, faceUp ? st.cardFace : st.cardBack]}>
      {faceUp && card ? (
        <>
          <Text style={[st.cardRank, { color: red ? '#d3202f' : '#111' }]}>{rankLabel(card.r)}</Text>
          <Text style={[st.cardSuit, { color: red ? '#d3202f' : '#111' }]}>{SUITS[card.s]}</Text>
        </>
      ) : (
        <View style={st.cardBackInner} />
      )}
    </View>
  );
});

const Hand = memo(({ cards, faceUp, timer, name, win, dim }) => {
  const pop = useRef(new Animated.Value(faceUp ? 0.6 : 1)).current;
  useEffect(() => {
    if (faceUp) {
      pop.setValue(0.6);
      Animated.spring(pop, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
    } else {
      pop.setValue(1);
    }
  }, [faceUp, pop]);
  return (
    <View style={[st.handWrap, win && st.handWin, dim && st.handDim]}>
      <Animated.View style={{ flexDirection: 'row', transform: [{ scale: pop }] }}>
        {(cards || [null, null, null]).map((c, i) => (
          <PlayingCard key={i} card={c} faceUp={faceUp} offset={i > 0} />
        ))}
      </Animated.View>
      {timer != null ? (
        <View style={st.timerDot}><Text style={st.timerTxt}>{timer}</Text></View>
      ) : null}
      {faceUp && name ? <Text style={st.handName}>{name}</Text> : null}
    </View>
  );
});

// ===== YELLOW GLOW: jis slot par bet lagi hai wahan halka-halka chamakta hai =====
const BetGlow = memo(() => {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(p, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(p, { toValue: 0, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [p]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[st.betGlow, { opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }]}
    />
  );
});

// ===== MAIN GAME PANEL =====
// Props: db, uid, roomId, stars (wallet live), bottom, onClose
// Round ab SERVER-synced clock se chalta hai: room ke sabhi players ka round, timer aur result same.
const TeenPattiGame = ({ db, uid, roomId, stars = 0, bottom = 0, onClose }) => {
  const [round, setRound] = useState(() => Math.floor(syncNow() / CYCLE));
  const [phase, setPhase] = useState(() => phaseOf(syncNow() % CYCLE)); // bet | deal | reveal
  const [timeLeft, setTimeLeft] = useState(Math.ceil(BET_MS / 1000));
  const [bets, setBets] = useState({ A: 0, B: 0, C: 0 });
  const [chip, setChip] = useState(CHIPS[0]);
  const [outcome, setOutcome] = useState(null);   // { round, winner, win, spent }  (server se)
  const [failed, setFailed] = useState(false);
  const [msg, setMsg] = useState('');
  const [walletBalance, setWalletBalance] = useState(Number(stars) || 0);
  const [lockedBalance, setLockedBalance] = useState(null); // deal ke time kata hua balance (jeet abhi chhupi)
  const [showRules, setShowRules] = useState(false);
  const [dbg, setDbg] = useState(''); // TEMP: debug line (kaam theek hone ke baad hata dena)

  const mounted = useRef(true);
  const betsRef = useRef(bets);
  betsRef.current = bets;
  const chipRef = useRef(chip);
  chipRef.current = chip;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const roundRef = useRef(round);
  roundRef.current = round;
  const balRef = useRef(Number(stars) || 0);
  const lockStarsRef = useRef(null); // wallet (live) ka balance jab bet lock hui
  const requested = useRef(new Set());

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { syncServerClock(); }, []);

  useEffect(() => {
    if (Number.isFinite(Number(stars))) { balRef.current = Number(stars); setWalletBalance(Number(stars)); }
  }, [stars]);

  const totalBet = bets.A + bets.B + bets.C;

  // ---- ek clock interval (250ms); same value par setState re-render nahi karta ----
  useEffect(() => {
    const id = setInterval(() => {
      const n = syncNow();
      const t = n % CYCLE;
      setRound(Math.floor(n / CYCLE));
      setPhase(phaseOf(t));
      setTimeLeft(Math.max(0, Math.ceil((BET_MS - t) / 1000)));
    }, 250);
    return () => clearInterval(id);
  }, []);

  // naya round -> reset
  useEffect(() => {
    setBets({ A: 0, B: 0, C: 0 });
    setOutcome(null);
    setFailed(false);
    setLockedBalance(null);
    lockStarsRef.current = null;
    setMsg('');
  }, [round]);

  // ---- SETTLEMENT: bet band hote hi server ko bhejo (cards + winner + Stars sab server me) ----
  // Panel band ho jaye tab bhi call chalti rehti hai, isliye Stars hamesha sahi kat'te/jodte hain.
  useEffect(() => {
    if (phase === 'bet') return;
    if (!uid || !roomId) { setDbg('NO uid/room'); return; }
    const roundId = `teen-${round}`;
    if (requested.current.has(roundId)) return;
    requested.current.add(roundId);

    const placed = { ...betsRef.current };
    const spent = placed.A + placed.B + placed.C;
    lockStarsRef.current = balRef.current;
    if (spent > 0) setLockedBalance(Math.max(0, balRef.current - spent));

    const t0 = Date.now();
    setDbg('sent');
    callSettle({ game: 'teenPatti', roomId: String(roomId), roundId, bets: placed })
      .then((data) => {
        if (mounted.current) setDbg('ok ' + (Date.now() - t0) + 'ms' + (roundRef.current !== round ? ' LATE' : ''));
        const r = data.round;
        if (!r || !r.hands || !r.ev || !SLOTS.includes(r.winner)) throw new Error('Invalid game result');
        if (!mounted.current || roundRef.current !== round) return;
        // NOTE: balance wallet state me NAHI likhte -> asli source live wallet (wallets/<uid>.stars) hai.
        setOutcome({
          round: r,
          winner: r.winner,
          win: Number(data.payout) || 0,
          spent,
          balance: Number.isFinite(Number(data.balance)) ? Number(data.balance) : null,
        });
      })
      .catch((e) => {
        if (!mounted.current) return;
        setDbg('err ' + (e && e.code) + ' ' + (Date.now() - t0) + 'ms');
        requested.current.delete(roundId);
        setLockedBalance(null);
        setFailed(true);
        setMsg(friendlyError(e));
      });
  }, [phase, round, uid, roomId]);

  const placeBet = useCallback((slot) => {
    if (phaseRef.current !== 'bet') return;
    if (syncNow() % CYCLE > BET_MS - 400) return;
    const cur = betsRef.current;
    const total = cur.A + cur.B + cur.C;
    const c = chipRef.current;
    if (total + c > MAX_BET_PER_ROUND) { setMsg('Ek round ki maximum bet 10,000 Stars hai ⭐'); return; }
    if (balRef.current - total < c) { setMsg('Stars kam hain ⭐'); return; }
    setMsg('');
    setBets((b) => ({ ...b, [slot]: b[slot] + c }));
  }, []);

  // REFRESH button: bet ke time me lagi hui chips hata deta hai
  const clearBets = () => {
    if (phase === 'bet') { setBets({ A: 0, B: 0, C: 0 }); setMsg(''); }
  };

  const revealed = phase !== 'bet' && !!outcome;
  const net = outcome ? outcome.win - outcome.spent : 0;
  // balance: bet me (balance - lagi bet), deal me kata hua balance, reveal ke baad asli balance
  // liveBalance: hamesha wallet (live) se. Wallet snapshot late ho to server ka final balance (dono kabhi ladte nahi).
  const liveBalance =
    outcome && outcome.spent > 0 && outcome.balance != null && walletBalance === lockStarsRef.current
      ? outcome.balance
      : walletBalance;
  useEffect(() => { balRef.current = liveBalance; }, [liveBalance]);

  const available = Math.max(
    0,
    phase === 'bet' ? liveBalance - totalBet
      : phase === 'deal' && !outcome && lockedBalance != null ? lockedBalance
      : phase === 'reveal' && !outcome && lockedBalance != null ? lockedBalance
      : liveBalance
  );

  return (
    <View style={[st.panel, { bottom }]}>
      <LinearGradient
        pointerEvents="none"
        colors={['#bfeff0', '#8fd8d8', '#63bfc0']}
        style={StyleSheet.absoluteFill}
      />
      <View style={st.border} pointerEvents="none" />

      {/* header */}
      <View style={st.header}>
        <View style={st.titlePill}><Text style={st.titleTxt}>Teen Patti</Text></View>
        <View style={st.starPill}>
          <Text style={{ fontSize: 15 }}>⭐</Text>
          <Text style={st.starTxt}>{available}</Text>
          {revealed && outcome.spent > 0 ? (
            <Text style={[st.deltaTxt, { color: net >= 0 ? '#0a9a45' : '#d9232d' }]}>
              {net >= 0 ? '+' : '-'}{Math.abs(net)}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity style={st.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close-circle" size={30} color="#e0452d" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={st.rulesTab} onPress={() => setShowRules((v) => !v)}>
        <Text style={st.rulesTxt}>Rules</Text>
      </TouchableOpacity>

      {/* 3 hands */}
      <View style={st.row}>
        {SLOTS.map((k, i) => (
          <Hand
            key={k}
            cards={revealed ? outcome.round.hands[k] : null}
            faceUp={revealed}
            timer={i === 1 && phase === 'bet' ? timeLeft : null}
            name={revealed ? outcome.round.ev[k].name : ''}
            win={revealed && outcome.winner === k}
            dim={revealed && outcome.winner !== k}
          />
        ))}
      </View>

      {/* chairs + bet boxes */}
      <View style={st.row}>
        {SLOTS.map((k) => {
          const isWin = revealed && outcome.winner === k;
          return (
            <TouchableOpacity key={k} activeOpacity={0.85} style={st.col} onPress={() => placeBet(k)}>
              {phase === 'bet' && bets[k] > 0 ? <BetGlow /> : null}
              <MaterialCommunityIcons name="sofa-single" size={58} color={SLOT_COLORS[k]} />
              <View style={[st.box, isWin && st.boxWin]}>
                <View style={st.boxHead}><Text style={st.boxHeadTxt}>{k}</Text></View>
                <Text style={st.potTxt}>Pot: {fmt(bets[k])}</Text>
                <Text style={st.youTxt}>You : {fmt(bets[k])}</Text>
              </View>
              {isWin ? <Text style={st.winBadge}>🏆 WIN</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* result / message */}
      <View style={st.msgRow}>
        {failed ? (
          <Text style={[st.msgTxt, { color: '#c0282d' }]}>{msg || 'Result nahi mila. Stars change nahi hue.'}</Text>
        ) : phase === 'deal' && !outcome ? (
          <Text style={st.msgTxt}>Cards baant rahe hain… 🃏</Text>
        ) : phase === 'reveal' && !outcome ? (
          <Text style={st.msgTxt}>Result aa raha hai…</Text>
        ) : revealed ? (
          outcome.spent === 0 ? (
            <Text style={st.msgTxt}>🏆 Winner: {outcome.winner} — {outcome.round.ev[outcome.winner].name}</Text>
          ) : net > 0 ? (
            <Text style={[st.msgTxt, { color: '#0a7a37' }]}>🎉 {outcome.winner} jeeta ({outcome.round.ev[outcome.winner].name}) +{fmt(net)} ⭐</Text>
          ) : net === 0 ? (
            <Text style={st.msgTxt}>Bet wapas mili ⭐</Text>
          ) : (
            <Text style={[st.msgTxt, { color: '#c0282d' }]}>😢 {outcome.winner} jeeta ({outcome.round.ev[outcome.winner].name}) -{fmt(-net)} ⭐</Text>
          )
        ) : msg ? (
          <Text style={[st.msgTxt, { color: '#c0282d' }]}>{msg}</Text>
        ) : (
          <Text style={st.hintTxt}>Chair par tap karke A / B / C chuno 👆</Text>
        )}
      </View>

      {!!dbg && <Text style={{ position: 'absolute', left: 14, bottom: 56, fontSize: 9, color: '#12304a', opacity: 0.8 }}>dbg: {phase} {dbg}</Text>}

      {/* bottom: chips */}
      <View style={st.footer}>
        <View style={{ flex: 1 }} />
        {CHIPS.map((c) => (
          <TouchableOpacity key={c} onPress={() => setChip(c)} activeOpacity={0.8}
            style={[st.chip, chip === c && st.chipSel]}>
            <Text style={st.chipTxt}>{fmt(c)}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={clearBets} style={st.clearBtn}>
          <Ionicons name="refresh" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {showRules && (
        <TouchableOpacity activeOpacity={1} style={st.rulesBox} onPress={() => setShowRules(false)}>
          <Text style={st.rulesHead}>📜 Rules</Text>
          <Text style={st.rulesLine}>1. {BET_MS / 1000}s me A, B ya C par chip lagao.</Text>
          <Text style={st.rulesLine}>2. Jis hand ke paas sabse bada hand ho wo jeetega.</Text>
          <Text style={st.rulesLine}>3. Trail &gt; Pure Seq &gt; Sequence &gt; Color &gt; Pair &gt; High Card</Text>
          <Text style={st.rulesLine}>4. Jeetne par bet x {PAYOUT_MULT} milta hai. Maximum round bet 10,000 Stars.</Text>
          <Text style={[st.rulesLine, { marginTop: 6, opacity: 0.7 }]}>(band karne ke liye tap karo)</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default memo(TeenPattiGame);
export const TEEN_PATTI_HEIGHT = PANEL_H;

const st = StyleSheet.create({
  panel: {
    position: 'absolute', left: 0, right: 0, height: PANEL_H, zIndex: 900, elevation: 900,
    overflow: 'hidden', borderTopLeftRadius: 6, borderTopRightRadius: 6, paddingHorizontal: 14,
  },
  border: {
    ...StyleSheet.absoluteFillObject, borderWidth: 4, borderColor: '#2bb6a3', borderRadius: 6, opacity: 0.8,
  },
  header: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  titlePill: {
    paddingHorizontal: 22, paddingVertical: 3, borderRadius: 14, backgroundColor: '#3ec6ee',
    borderWidth: 1, borderColor: '#d7f6ff',
  },
  titleTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  closeBtn: { position: 'absolute', right: 0, top: 4 },
  rulesTab: {
    position: 'absolute', left: 0, top: PANEL_H * 0.36, backgroundColor: '#e8a93a',
    paddingVertical: 8, paddingHorizontal: 3, borderTopRightRadius: 8, borderBottomRightRadius: 8, zIndex: 5,
  },
  rulesTxt: { color: '#fff', fontWeight: '800', fontSize: 11, transform: [{ rotate: '-90deg' }], width: 34, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  col: { flex: 1, alignItems: 'center' },
  betGlow: {
    position: 'absolute', top: -2, bottom: -2, left: 1, right: 1, borderRadius: 12,
    borderWidth: 3, borderColor: '#ffe600', backgroundColor: 'rgba(255,230,0,0.2)',
    shadowColor: '#ffe600', shadowOpacity: 1, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
  },
  handWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, marginHorizontal: 3,
    borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)', backgroundColor: 'rgba(255,255,255,0.15)',
  },
  handWin: { borderColor: '#ffd21f', borderWidth: 3, backgroundColor: 'rgba(255,225,80,0.3)' },
  handName: { fontSize: 12, fontWeight: '900', color: '#12304a', marginTop: 4 },
  handDim: { opacity: 0.55 },
  card: {
    width: CARD_W, height: CARD_H, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#b9c3e8',
  },
  cardBack: { backgroundColor: '#6b73c9' },
  cardBackInner: { width: '78%', height: '82%', borderRadius: 3, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
  cardFace: { backgroundColor: '#fff' },
  cardRank: { fontSize: 15, fontWeight: '900', lineHeight: 17 },
  cardSuit: { fontSize: 17, lineHeight: 19 },
  timerDot: {
    position: 'absolute', top: '32%', width: 32, height: 32, borderRadius: 16, backgroundColor: '#4fb7bd',
    borderWidth: 2, borderColor: '#d9f7f7', alignItems: 'center', justifyContent: 'center',
  },
  timerTxt: { color: '#fff', fontWeight: '900', fontSize: 14 },
  box: {
    width: '92%', backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden', alignItems: 'center',
    borderWidth: 2, borderColor: 'transparent', marginTop: 4,
  },
  boxWin: { borderColor: '#ffd21f' },
  boxHead: { width: '100%', backgroundColor: '#000', alignItems: 'center', paddingVertical: 5 },
  boxHeadTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  potTxt: { color: '#000', fontWeight: '800', fontSize: 12, marginTop: 4 },
  youTxt: { color: '#e0152b', fontWeight: '800', fontSize: 12, marginBottom: 5 },
  winBadge: { position: 'absolute', top: 0, fontWeight: '900', fontSize: 12, color: '#b36b00' },
  msgRow: { height: 26, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  msgTxt: { fontWeight: '900', fontSize: 14, color: '#12304a' },
  hintTxt: { fontWeight: '700', fontSize: 11, color: 'rgba(18,48,74,0.7)' },
  footer: {
    position: 'absolute', left: 12, right: 12, bottom: 10, height: 44, flexDirection: 'row', alignItems: 'center',
  },
  balance: { flexDirection: 'row', alignItems: 'center' },
  balanceTxt: { color: '#12304a', fontWeight: '800', fontSize: 14, marginLeft: 4 },
  starPill: {
    position: 'absolute', left: 0, top: 6, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(20,10,40,0.78)', borderRadius: 16, paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(245,196,81,0.6)',
  },
  starTxt: { color: '#F5C451', fontSize: 14, fontWeight: 'bold', marginLeft: 4 },
  deltaTxt: { fontSize: 12, fontWeight: '900', marginLeft: 6, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 5 },
  chip: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#f4c542', borderWidth: 2, borderColor: '#fff3b0',
    alignItems: 'center', justifyContent: 'center', marginLeft: 6,
  },
  chipSel: { borderColor: '#e0152b', transform: [{ scale: 1.15 }] },
  chipTxt: { fontSize: 10, fontWeight: '900', color: '#5a3b00' },
  clearBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#e0452d', alignItems: 'center',
    justifyContent: 'center', marginLeft: 8,
  },
  rulesBox: {
    position: 'absolute', left: 30, right: 30, top: PANEL_H * 0.2, backgroundColor: 'rgba(10,30,40,0.94)',
    borderRadius: 14, padding: 14, zIndex: 20,
  },
  rulesHead: { color: '#ffd21f', fontWeight: '900', fontSize: 15, marginBottom: 6 },
  rulesLine: { color: '#fff', fontSize: 12, marginTop: 3 },
});
