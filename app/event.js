import React, { useEffect, useRef, useMemo, memo } from "react";
import {
  Animated,
  Easing,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  BackHandler,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

/* =====================================================
   EVENT SETTINGS  (yahin se badlo)
   ===================================================== */

// Event 5 November se 5 December tak (month 10 = November, 11 = December)
const EVENT_START = new Date(2026, 10, 5, 0, 0, 0);
const EVENT_END = new Date(2026, 11, 5, 23, 59, 59);

const SCREEN_W = Dimensions.get("window").width;

const GOLD = "#FFD700";
const NAVY = "#0b1437";
const NAVY2 = "#17235f";

// Namuna data - asli users aane par yahan se replace karo
const USERS = [
  { name: "Aman Official", views: 248310, move: 2 },
  { name: "Riya Singh", views: 231904, move: -1 },
  { name: "Rohit Vlogs", views: 219450, move: 1 },
  { name: "Neha Queen", views: 187220, move: -2 },
  { name: "Sahil Gamer", views: 164880, move: 0 },
  { name: "Pooja Dance", views: 152315, move: 3 },
  { name: "Vikas Music", views: 139760, move: -1 },
  { name: "Anjali Style", views: 121045, move: "new" },
  { name: "Raj Comedy", views: 108390, move: -2 },
  { name: "Sneha Art", views: 96420, move: 1 },
];

const fmt = (n) => Number(n).toLocaleString("en-IN");

const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const fmtDate = (d) => `${d.getDate()} ${monthNames[d.getMonth()]}`;

const getStatus = () => {
  const now = Date.now();
  if (now < EVENT_START.getTime()) {
    const days = Math.ceil((EVENT_START.getTime() - now) / 86400000);
    return { label: `${days} din baad shuru`, color: "#FFB020" };
  }
  if (now > EVENT_END.getTime()) return { label: "Event khatam", color: "#999" };
  const days = Math.ceil((EVENT_END.getTime() - now) / 86400000);
  return { label: `LIVE • ${days} din baaki`, color: "#12b886" };
};

/* =====================================================
   SHINE (chamak) - upar se neeche tak chamakti patti
   ===================================================== */

const Shine = memo(function Shine({ duration = 2600, delay = 0, width = 70, angle = "18deg" }) {
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(x, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(900),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [x, duration, delay]);

  const translateX = x.interpolate({
    inputRange: [0, 1],
    outputRange: [-width * 3, SCREEN_W + width],
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={{
          position: "absolute",
          top: -40,
          bottom: -40,
          width,
          transform: [{ translateX }, { rotate: angle }],
        }}
      >
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.38)", "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
});

/* =====================================================
   SPARKLE - chamakte taare
   ===================================================== */

const Sparkle = memo(function Sparkle({ top, left, size = 14, delay = 0 }) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(1200),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);

  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top,
        left,
        opacity: v,
        transform: [{ scale }, { rotate }],
      }}
    >
      <Ionicons name="sparkles" size={size} color={GOLD} />
    </Animated.View>
  );
});

/* =====================================================
   FADE-UP - section smooth upar aate hain
   ===================================================== */

const FadeUp = memo(function FadeUp({ delay = 0, children, style }) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 650,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, delay]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
});

/* =====================================================
   PULSE (LIVE dot / trophy glow)
   ===================================================== */

function usePulse(min = 0.6, max = 1, duration = 1100) {
  const v = useRef(new Animated.Value(min)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: max, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: min, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v, min, max, duration]);
  return v;
}

/* =====================================================
   SMALL PIECES
   ===================================================== */

const Avatar = memo(function Avatar({ name, size = 44 }) {
  const hue = (name.length * 47) % 360;
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <LinearGradient
      colors={[`hsl(${hue}, 70%, 52%)`, `hsl(${(hue + 45) % 360}, 70%, 38%)`]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "900", fontSize: size * 0.36 }}>{initials}</Text>
    </LinearGradient>
  );
});

const Tick = memo(function Tick({ color = "#fff", size = 22 }) {
  return <Ionicons name="checkmark-circle" size={size} color={color} />;
});

const PrizeCard = memo(function PrizeCard({ rank, user, stars, tickLabel, tickColor, first, delay }) {
  return (
    <FadeUp delay={delay}>
      <View style={[styles.prize, first && styles.prizeFirst]}>
        {first ? (
          <LinearGradient
            colors={["#1b2a7a", NAVY]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <Text style={[styles.prizeBgNum, first && { color: "rgba(255,215,0,0.18)" }]}>{rank}</Text>
        <Text style={[styles.prizeRank, first && { color: GOLD }]}>TOP {rank}</Text>

        <View style={styles.who}>
          <View style={first ? styles.avatarRing : null}>
            <Avatar name={user.name} size={first ? 70 : 60} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={[styles.whoName, first && { color: "#fff" }]} numberOfLines={1}>
              {user.name}
            </Text>
            <Text style={[styles.whoViews, first && { color: "#aab3dc" }]}>
              {fmt(user.views)} views
            </Text>
          </View>
        </View>

        <View style={[styles.reward, first && { borderTopColor: "rgba(255,255,255,0.22)" }]}>
          <View style={styles.amtRow}>
            <Ionicons name="star" size={first ? 34 : 28} color={GOLD} />
            <Text style={[styles.amt, first && { color: GOLD, fontSize: 44 }]}>{fmt(stars)}</Text>
            <Text style={[styles.amtSmall, first && { color: "#aab3dc" }]}>STARS</Text>
          </View>
          <View style={[styles.tickPill, { backgroundColor: tickColor.bg }]}>
            <Tick color={tickColor.icon} size={22} />
            <Text style={[styles.tickPillText, { color: tickColor.text }]}>{tickLabel}</Text>
          </View>
        </View>

        {first ? <Shine duration={2400} delay={400} width={60} /> : null}
      </View>
    </FadeUp>
  );
});

// Podium card: Top 1/2/3 ek line me, chhota aur clean
const PodiumCard = memo(function PodiumCard({ rank, user, stars, tickLabel, tickColor, first, delay }) {
  const short = user.name.length > 11 ? user.name.slice(0, 10) + "…" : user.name;
  return (
    <FadeUp delay={delay} style={styles.podWrap}>
      <View style={[styles.pod, first && styles.podFirst]}>
        {first ? (
          <LinearGradient
            colors={["#1b2a7a", NAVY]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        {first ? (
          <Ionicons name="trophy" size={22} color={GOLD} style={{ marginBottom: 4 }} />
        ) : null}

        <View style={[styles.podBadge, first && { backgroundColor: GOLD }]}>
          <Text style={[styles.podBadgeText, first && { color: NAVY }]}>TOP {rank}</Text>
        </View>

        <View style={first ? styles.avatarRing : null}>
          <Avatar name={user.name} size={first ? 62 : 50} />
        </View>

        <Text style={[styles.podName, first && { fontSize: 13 }]} numberOfLines={1}>
          {short}
        </Text>
        <Text style={styles.podViews}>{fmt(user.views)} views</Text>

        <View style={styles.podStars}>
          <Ionicons name="star" size={first ? 16 : 14} color={GOLD} />
          <Text style={[styles.podAmt, first && { color: GOLD, fontSize: 17 }]}>{fmt(stars)}</Text>
        </View>

        <View style={[styles.podTick, { backgroundColor: tickColor.bg }]}>
          <Ionicons name="checkmark-circle" size={14} color={tickColor.icon} />
          <Text style={[styles.podTickText, { color: tickColor.text }]} numberOfLines={1}>
            {tickLabel}
          </Text>
        </View>

        {first ? <Shine duration={2400} delay={400} width={40} /> : null}
      </View>
    </FadeUp>
  );
});

const Move = memo(function Move({ move }) {
  if (move === "new")
    return (
      <View style={styles.mvNew}>
        <Text style={styles.mvNewText}>NEW</Text>
      </View>
    );
  if (move > 0) return <Text style={[styles.mv, { color: "#0a9d6f" }]}>▲ {move}</Text>;
  if (move < 0) return <Text style={[styles.mv, { color: "#e5384a" }]}>▼ {Math.abs(move)}</Text>;
  return <Text style={[styles.mv, { color: "#8a93b5" }]}>— same</Text>;
});

const BoardRow = memo(function BoardRow({ user, index, max }) {
  const top = index < 3;
  const pct = Math.round((user.views / max) * 100);
  return (
    <View style={[styles.row, top && styles.rowTop]}>
      <Text style={[styles.rk, top && { color: GOLD }]}>{index + 1}</Text>
      <Avatar name={user.name} size={42} />
      <View style={{ flex: 1, marginHorizontal: 12 }}>
        <Text style={styles.rowName} numberOfLines={1}>
          {user.name}
        </Text>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: top ? GOLD : "#5865c9" }]} />
        </View>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.rowViews}>{fmt(user.views)}</Text>
        <Move move={user.move} />
      </View>
    </View>
  );
});

const AgencyTile = memo(function AgencyTile({ n, ticks, first, delay }) {
  return (
    <FadeUp delay={delay}>
      <View style={[styles.tile, first && { backgroundColor: GOLD }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={styles.tileNum}>{n}</Text>
          <Text style={styles.tileTitle}>AGENCY TOP {n}</Text>
        </View>
        <View style={styles.plate}>
          {Array.from({ length: ticks }).map((_, i) => (
            <Ionicons key={i} name="checkmark-circle" size={26} color="#fff" style={{ marginRight: 4 }} />
          ))}
          <Text style={styles.plateText}>
            {ticks} White Tik
          </Text>
        </View>
        {first ? <Shine duration={2600} delay={900} width={50} /> : null}
      </View>
    </FadeUp>
  );
});

/* =====================================================
   SCREEN
   ===================================================== */

export default function EventScreen() {
  const router = useRouter();
  const status = useMemo(getStatus, []);
  const pulse = usePulse(0.35, 1, 800);
  const glow = usePulse(0.5, 1, 1400);
  const max = USERS[0].views;

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      router.back();
      return true;
    });
    return () => sub.remove();
  }, [router]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      {/* top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.7} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>TopKing Event</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HERO */}
        <LinearGradient
          colors={[NAVY, "#101c52", NAVY2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Sparkle top={26} left={SCREEN_W * 0.78} size={18} delay={0} />
          <Sparkle top={90} left={SCREEN_W * 0.9} size={12} delay={700} />
          <Sparkle top={150} left={SCREEN_W * 0.62} size={14} delay={1400} />
          <Sparkle top={60} left={24} size={12} delay={1000} />
          <Sparkle top={200} left={SCREEN_W * 0.2} size={16} delay={300} />

          <FadeUp delay={0}>
            <View style={styles.trophyWrap}>
              <Animated.View style={[styles.trophyGlow, { opacity: glow, transform: [{ scale: glow }] }]} />
              <Ionicons name="trophy" size={46} color={GOLD} />
            </View>
          </FadeUp>

          <FadeUp delay={120}>
            <Text style={styles.heroTag}>TOPKING · EK MAHINE KA BADA MUKABLA</Text>
            <Text style={styles.heroH1}>TopKing</Text>
            <Text style={[styles.heroH1, { color: GOLD }]}>Event</Text>
          </FadeUp>

          <FadeUp delay={240}>
            <Text style={styles.heroP}>
              TopKing ke <Text style={{ color: "#fff", fontWeight: "800" }}>saare users</Text> is event me hissa le sakte
              hain. Sabse zyada views laao aur Stars aur Tik jeeto.
            </Text>
          </FadeUp>

          <FadeUp delay={360}>
            <View style={styles.dateCard}>
              <Ionicons name="calendar" size={20} color={NAVY} />
              <Text style={styles.dateText}>
                {fmtDate(EVENT_START)}  →  {fmtDate(EVENT_END)}
              </Text>
              <View style={styles.statusPill}>
                <Animated.View style={[styles.statusDot, { backgroundColor: status.color, opacity: pulse }]} />
                <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
              </View>
              <Shine duration={2200} delay={600} width={44} />
            </View>
          </FadeUp>

          <View style={styles.pills}>
            {["Sab users participate karein", "1 mahina", "Top 3 jeetenge"].map((t) => (
              <View key={t} style={styles.pill}>
                <Text style={styles.pillText}>{t}</Text>
              </View>
            ))}
          </View>

          <Shine duration={3200} delay={1200} width={90} />
        </LinearGradient>

        {/* HOW TO WIN */}
        <FadeUp delay={200} style={styles.sec}>
          <View style={styles.how}>
            <Text style={styles.howBig}>1 MAHINA</Text>
            <Text style={styles.howH}>Kaise jeetna hai?</Text>
            <Text style={styles.howP}>
              Is 1 mahine ke andar jiske videos par{" "}
              <Text style={{ color: "#fff", fontWeight: "800" }}>sabse zyada views</Text> aayenge, unme se Top 1, Top 2
              aur Top 3 select kiye jayenge.
            </Text>
          </View>
        </FadeUp>

        {/* CREATOR PRIZES */}
        <View style={styles.sec}>
          <Text style={styles.label}>CREATORS KE INAAM</Text>
          <Text style={styles.h2}>Top 3 ko Stars aur Tik</Text>

          {/* Top 1, 2, 3 - ek hi line me (2 | 1 | 3 podium) */}
          <View style={styles.podRow}>
            <PodiumCard
              rank={2}
              user={USERS[1]}
              stars={10000}
              delay={200}
              tickLabel="White Tik"
              tickColor={{ bg: NAVY, icon: "#fff", text: "#fff" }}
            />
            <PodiumCard
              rank={1}
              user={USERS[0]}
              stars={15000}
              first
              delay={100}
              tickLabel="Garevi Tik"
              tickColor={{ bg: "rgba(18,184,134,0.25)", icon: "#12b886", text: "#6ff0c4" }}
            />
            <PodiumCard
              rank={3}
              user={USERS[2]}
              stars={5000}
              delay={300}
              tickLabel="White Tik"
              tickColor={{ bg: NAVY, icon: "#fff", text: "#fff" }}
            />
          </View>
        </View>

        {/* LIVE RANKING */}
        <View style={styles.sec}>
          <Text style={styles.label}>LIVE RANKING</Text>
          <Text style={styles.h2}>Top 10 me kaun kis number par</Text>
          <Text style={styles.sub}>
            Kaun upar gaya, kaun neeche aaya, poore mahine app me dikhega. Har naam ke saath pichhle hafte ka badlav bhi.
          </Text>
          <View style={styles.sample}>
            <Text style={styles.sampleText}>NAMUNA DATA · asli photo, naam aur views app se judne par yahan aayenge</Text>
          </View>

          {USERS.map((u, i) => (
            <BoardRow key={u.name} user={u} index={i} max={max} />
          ))}
        </View>

        {/* AGENCY */}
        <View style={[styles.sec, styles.agency]}>
          <Text style={[styles.label, { color: GOLD }]}>AGENCY KE INAAM</Text>
          <Text style={styles.h2}>Agency Top 3 ko White Tik</Text>
          <Text style={[styles.sub, { color: "#b7bfe4" }]}>
            Agencies ka alag mukabla. Sabse upar wali agency ko double White Tik.
          </Text>
          <AgencyTile n={1} ticks={2} first delay={100} />
          <AgencyTile n={2} ticks={1} delay={200} />
          <AgencyTile n={3} ticks={1} delay={300} />
        </View>

        {/* FOOTER */}
        <FadeUp style={styles.cta}>
          <Ionicons name="ribbon" size={34} color={GOLD} />
          <Text style={styles.ctaH}>Taaj aapka intezaar kar raha hai</Text>
          <Text style={styles.ctaP}>Aaj se hi videos daalo, views badhao aur TopKing banne ki race me aa jao.</Text>
          <Text style={styles.ctaP}>Koi sawal ho to humse sampark karein.</Text>
          <Text style={styles.ctaBy}>TopKing Team</Text>
          <Shine duration={3000} delay={500} width={70} />
        </FadeUp>
      </ScrollView>
    </SafeAreaView>
  );
}

/* =====================================================
   STYLES
   ===================================================== */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#05091f" },

  topBar: {
    height: 56,
    marginTop: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    backgroundColor: NAVY,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  topTitle: { color: "#fff", fontSize: 18, fontWeight: "800", letterSpacing: 0.3 },

  hero: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 30, overflow: "hidden" },
  trophyWrap: { width: 80, height: 80, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  trophyGlow: {
    position: "absolute",
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "rgba(255,215,0,0.22)",
  },
  heroTag: { color: GOLD, fontWeight: "800", fontSize: 11, letterSpacing: 2, marginBottom: 8 },
  heroH1: { color: "#fff", fontSize: 62, fontWeight: "900", lineHeight: 64, textTransform: "uppercase" },
  heroP: { color: "#cdd3ee", fontSize: 15, lineHeight: 22, marginTop: 14 },

  dateCard: {
    marginTop: 20,
    backgroundColor: GOLD,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    overflow: "hidden",
  },
  dateText: { color: NAVY, fontWeight: "900", fontSize: 17, marginLeft: 8, flex: 1 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NAVY,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 11, fontWeight: "800" },

  pills: { flexDirection: "row", flexWrap: "wrap", marginTop: 16 },
  pill: {
    backgroundColor: "rgba(255,215,0,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.5)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8,
  },
  pillText: { color: GOLD, fontWeight: "800", fontSize: 12 },

  sec: { paddingHorizontal: 16, marginTop: 34 },
  label: { color: "#8a93b5", fontSize: 11, fontWeight: "800", letterSpacing: 2.4 },
  h2: { color: "#fff", fontSize: 28, fontWeight: "900", marginTop: 6, marginBottom: 14, textTransform: "uppercase", lineHeight: 32 },
  sub: { color: "#8a93b5", fontSize: 14, lineHeight: 20, marginBottom: 12 },

  how: {
    backgroundColor: "#0e1640",
    borderWidth: 1,
    borderColor: "#27337a",
    borderRadius: 20,
    padding: 22,
  },
  howBig: { color: GOLD, fontSize: 38, fontWeight: "900", marginBottom: 6 },
  howH: { color: "#fff", fontSize: 20, fontWeight: "800" },
  howP: { color: "#9aa4cf", fontSize: 15, lineHeight: 22, marginTop: 6 },

  prize: {
    backgroundColor: "#111a4a",
    borderWidth: 1,
    borderColor: "#27337a",
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    overflow: "hidden",
  },
  prizeFirst: {
    borderColor: GOLD,
    shadowColor: GOLD,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  prizeBgNum: {
    position: "absolute",
    right: 12,
    top: -14,
    fontSize: 130,
    fontWeight: "900",
    color: "rgba(255,255,255,0.05)",
  },
  prizeRank: { color: "#8a93b5", fontWeight: "800", fontSize: 12, letterSpacing: 2.2, marginBottom: 14 },
  who: { flexDirection: "row", alignItems: "center" },
  avatarRing: {
    padding: 3,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: GOLD,
  },
  whoName: { color: "#e8ecff", fontWeight: "800", fontSize: 18 },
  whoViews: { color: "#8a93b5", fontSize: 13, marginTop: 2 },
  reward: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    borderStyle: "dashed",
  },
  amtRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 12 },
  amt: { color: "#fff", fontSize: 38, fontWeight: "900", marginLeft: 8, lineHeight: 42 },
  amtSmall: { color: "#8a93b5", fontWeight: "800", fontSize: 12, letterSpacing: 2, marginLeft: 8, marginBottom: 6 },
  tickPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 7,
    paddingLeft: 9,
    paddingRight: 16,
    borderRadius: 999,
  },
  tickPillText: { fontWeight: "800", fontSize: 14, marginLeft: 7 },

  podRow: { flexDirection: "row", alignItems: "flex-end", marginHorizontal: -4 },
  podWrap: { flex: 1, marginHorizontal: 4 },
  pod: {
    alignItems: "center",
    backgroundColor: "#111a4a",
    borderWidth: 1,
    borderColor: "#27337a",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  podFirst: {
    paddingTop: 16,
    paddingBottom: 18,
    borderColor: GOLD,
    shadowColor: GOLD,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 12,
  },
  podBadge: {
    backgroundColor: "#27337a",
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 2,
    marginBottom: 9,
  },
  podBadgeText: { color: "#cdd3ee", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  podName: { color: "#fff", fontWeight: "800", fontSize: 12, marginTop: 9, maxWidth: "100%" },
  podViews: { color: "#8a93b5", fontSize: 10, marginTop: 2 },
  podStars: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  podAmt: { color: "#fff", fontWeight: "900", fontSize: 15, marginLeft: 4 },
  podTick: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingVertical: 4,
    paddingLeft: 5,
    paddingRight: 9,
    marginTop: 9,
  },
  podTickText: { fontWeight: "800", fontSize: 10.5, marginLeft: 3 },

  sample: {
    alignSelf: "flex-start",
    backgroundColor: "#fff3cf",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 14,
  },
  sampleText: { color: "#7a5a00", fontSize: 11, fontWeight: "700" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0e1640",
    borderWidth: 1,
    borderColor: "#202b6b",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  rowTop: { borderColor: "rgba(255,215,0,0.55)", backgroundColor: "#131d52" },
  rk: { width: 28, color: "#8a93b5", fontWeight: "900", fontSize: 20, textAlign: "center", marginRight: 8 },
  rowName: { color: "#fff", fontWeight: "800", fontSize: 14 },
  bar: { height: 6, borderRadius: 3, backgroundColor: "#1b2557", marginTop: 7, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  rowViews: { color: "#fff", fontWeight: "800", fontSize: 14 },
  mv: { fontSize: 11, fontWeight: "800", marginTop: 2 },
  mvNew: { backgroundColor: GOLD, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 1, marginTop: 3 },
  mvNewText: { color: NAVY, fontSize: 10, fontWeight: "900" },

  agency: {
    backgroundColor: NAVY2,
    marginTop: 40,
    paddingTop: 34,
    paddingBottom: 30,
  },
  tile: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    marginBottom: 12,
    overflow: "hidden",
  },
  tileNum: { color: NAVY, fontSize: 52, fontWeight: "900", marginRight: 12 },
  tileTitle: { color: NAVY, fontWeight: "900", fontSize: 13, letterSpacing: 2 },
  plate: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: NAVY,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  plateText: { color: "#fff", fontWeight: "800", fontSize: 14, marginLeft: 4 },

  cta: {
    marginTop: 0,
    backgroundColor: "#0f1850",
    paddingVertical: 36,
    paddingHorizontal: 20,
    overflow: "hidden",
  },
  ctaH: { color: GOLD, fontSize: 26, fontWeight: "900", marginTop: 10, textTransform: "uppercase", lineHeight: 30 },
  ctaP: { color: "#c3caea", fontSize: 14, lineHeight: 21, marginTop: 8 },
  ctaBy: { color: "#fff", fontWeight: "800", letterSpacing: 1, marginTop: 18 },
});
