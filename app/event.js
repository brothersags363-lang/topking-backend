import React, { useCallback, useEffect, useRef, useMemo, useState, memo } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  RefreshControl,
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
import { scopedBackHandler } from "../utils/scopedBack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "../utils/safeRouter";
import FastImage from "../components/FastImage";
import { callApi } from "../utils/api";

/* =====================================================
   EVENT SETTINGS  (yahin se badlo)
   ===================================================== */

// Event 10 November se 10 December tak (month 10 = November, 11 = December)
// NOTE: server.js me EVENT_START_MS / EVENT_END_MS bhi yahi dates hain - dono saath badalna.
const EVENT_START = new Date(2026, 10, 10, 0, 0, 0);
const EVENT_END = new Date(2026, 11, 10, 23, 59, 59);

// Auto refresh (millisecond). Server 60 sec cache karta hai, isliye isse kam mat karo.
const REFRESH_MS = 60000;

const SCREEN_W = Dimensions.get("window").width;

const GOLD = "#FFD700";
const NAVY = "#0b1437";
const NAVY2 = "#17235f";

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
    return { label: `Starts in ${days} ${days === 1 ? "day" : "days"}`, color: "#FFB020" };
  }
  if (now > EVENT_END.getTime()) return { label: "Event ended", color: "#999" };
  const days = Math.ceil((EVENT_END.getTime() - now) / 86400000);
  return { label: `LIVE • ${days} ${days === 1 ? "day" : "days"} left`, color: "#12b886" };
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

const Avatar = memo(function Avatar({ name = "User", uri, size = 44 }) {
  const [failed, setFailed] = useState(false);
  const base = { width: size, height: size, borderRadius: size / 2 };

  if (uri && !failed) {
    return (
      <FastImage
        source={{ uri }}
        style={[base, { backgroundColor: "#1b2557" }]}
        onError={() => setFailed(true)}
      />
    );
  }

  const nm = String(name || "User");
  const hue = (nm.length * 47) % 360;
  const initials = nm
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
      style={[base, { alignItems: "center", justifyContent: "center" }]}
    >
      <Text style={{ color: "#fff", fontWeight: "900", fontSize: size * 0.36 }}>{initials}</Text>
    </LinearGradient>
  );
});

// Podium card: Top 1/2/3 ek line me - asli naam, DP, videos aur total views
const PodiumCard = memo(function PodiumCard({ rank, user, stars, tickLabel, tickColor, first, delay }) {
  const name = user ? String(user.name || "User") : "—";
  const short = name.length > 11 ? name.slice(0, 10) + "…" : name;
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

        {first ? <Ionicons name="trophy" size={22} color={GOLD} style={{ marginBottom: 4 }} /> : null}

        <View style={[styles.podBadge, first && { backgroundColor: GOLD }]}>
          <Text style={[styles.podBadgeText, first && { color: NAVY }]}>TOP {rank}</Text>
        </View>

        <View style={first ? styles.avatarRing : null}>
          {user ? (
            <Avatar name={name} uri={user.dp} size={first ? 62 : 50} />
          ) : (
            <View style={[styles.emptyDp, { width: first ? 62 : 50, height: first ? 62 : 50, borderRadius: first ? 31 : 25 }]}>
              <Ionicons name="person" size={first ? 28 : 22} color="#4a5599" />
            </View>
          )}
        </View>

        <Text style={[styles.podName, first && { fontSize: 13 }]} numberOfLines={1}>
          {short}
        </Text>

        {user ? (
          <>
            <Text style={[styles.podViewsBig, first && { color: GOLD }]}>{fmt(user.views)}</Text>
            <Text style={styles.podViews}>total views · {fmt(user.videos)} {user.videos === 1 ? "video" : "videos"}</Text>
          </>
        ) : (
          <Text style={styles.podViews}>empty</Text>
        )}

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

const BoardRow = memo(function BoardRow({ user, index, max }) {
  const top = index < 3;
  const pct = max > 0 ? Math.max(3, Math.round((user.views / max) * 100)) : 3;
  return (
    <View style={[styles.row, top && styles.rowTop]}>
      <Text style={[styles.rk, top && { color: GOLD }]}>{index + 1}</Text>
      <Avatar name={user.name} uri={user.dp} size={42} />
      <View style={{ flex: 1, marginHorizontal: 12 }}>
        <Text style={styles.rowName} numberOfLines={1}>
          {user.name}
        </Text>
        <Text style={styles.rowSub}>{fmt(user.videos)} {user.videos === 1 ? "video" : "videos"} in this event</Text>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: top ? GOLD : "#5865c9" }]} />
        </View>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.rowViews}>{fmt(user.views)}</Text>
        <Text style={styles.rowViewsLbl}>total views</Text>
      </View>
    </View>
  );
});

const StatBox = memo(function StatBox({ icon, value, label }) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon} size={18} color={GOLD} />
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
});

const AgencyTile = memo(function AgencyTile({ agency, n, ticks, first, delay }) {
  const pct = agency ? Math.min(100, Math.round((agency.stars / (agency.target || 1)) * 100)) : 0;
  return (
    <FadeUp delay={delay}>
      <View style={[styles.tile, first && { backgroundColor: GOLD }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={styles.tileNum}>{n}</Text>
          {agency ? (
            agency.logo ? (
              <FastImage source={{ uri: agency.logo }} style={styles.agLogo} />
            ) : (
              <View style={[styles.agLogo, styles.agLogoEmpty]}>
                <Ionicons name="business" size={22} color={NAVY} />
              </View>
            )
          ) : null}
          <View style={{ flex: 1, marginLeft: agency ? 10 : 0 }}>
            <Text style={styles.tileTitle}>AGENCY TOP {n}</Text>
            {agency ? (
              <Text style={styles.agName} numberOfLines={1}>
                {agency.name}
              </Text>
            ) : (
              <Text style={styles.agSub}>No agency yet</Text>
            )}
          </View>
        </View>

        {agency ? (
          <View style={{ marginTop: 14 }}>
            <View style={styles.agNumRow}>
              <Ionicons name="star" size={22} color={NAVY} style={{ marginBottom: 3, marginRight: 4 }} />
              <Text style={styles.agViews}>{fmt(agency.stars)}</Text>
              <Text style={styles.agTarget}> / {fmt(agency.target)} target</Text>
            </View>
            <View style={styles.agBar}>
              <View style={[styles.agBarFill, { width: `${Math.max(pct, 2)}%` }]} />
            </View>
            <Text style={styles.agSub}>
              {pct}% complete · {fmt(agency.members)} {agency.members === 1 ? "member" : "members"} · {fmt(agency.views)} views
            </Text>
          </View>
        ) : null}

        <View style={styles.plate}>
          {Array.from({ length: ticks }).map((_, i) => (
            <Ionicons key={i} name="checkmark-circle" size={26} color="#fff" style={{ marginRight: 4 }} />
          ))}
          <Text style={styles.plateText}>{ticks} White Tik</Text>
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
  const started = Date.now() >= EVENT_START.getTime();
  const pulse = usePulse(0.35, 1, 800);
  const glow = usePulse(0.5, 1, 1400);

  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (silent) => {
    try {
      const r = await callApi("/event/leaderboard");
      setBoard(r);
      setError("");
    } catch (e) {
      if (!silent) console.log("Event load error:", e && e.message);
        setError("Could not load event data. Please check your connection and try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const t = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(false);
  }, [load]);

  useEffect(() => {
    const sub = scopedBackHandler('/event', "hardwareBackPress", () => {
      router.back();
      return true;
    });
    return () => sub.remove();
  }, [router]);

  const users = board?.users || [];
  const top10 = useMemo(() => users.slice(0, 10), [users]);
  const agencies = board?.agencies || [];
  const max = top10.length ? top10[0].views || 1 : 1;
  const me = board?.me;

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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} colors={[GOLD]} />}
      >
        {/* HERO */}
        <LinearGradient
          colors={[NAVY, "#101c52", NAVY2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Sparkle top={26} left={SCREEN_W * 0.78} size={18} delay={0} />
          <Sparkle top={150} left={SCREEN_W * 0.62} size={14} delay={1400} />

          <FadeUp delay={0}>
            <View style={styles.trophyWrap}>
              <Animated.View style={[styles.trophyGlow, { opacity: glow, transform: [{ scale: glow }] }]} />
              <Ionicons name="trophy" size={46} color={GOLD} />
            </View>
          </FadeUp>

          <FadeUp delay={80}>
            <Text style={styles.heroTag}>TOPKING · THE BIGGEST 1-MONTH CONTEST</Text>
            <Text style={styles.heroH1}>TopKing</Text>
            <Text style={[styles.heroH1, { color: GOLD }]}>Event</Text>
          </FadeUp>

          <FadeUp delay={160}>
            <Text style={styles.heroP}>
              <Text style={{ color: "#fff", fontWeight: "800" }}>All TopKing users</Text> can join this event. Get the
              most views and win Stars and a Tik.
            </Text>
          </FadeUp>

          <FadeUp delay={240}>
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
            {["Everyone can participate", "1 month", "Top 3 win"].map((t) => (
              <View key={t} style={styles.pill}>
                <Text style={styles.pillText}>{t}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* HOW TO WIN */}
        <View style={styles.sec}>
          <View style={styles.how}>
            <Text style={styles.howBig}>1 MONTH</Text>
            <Text style={styles.howH}>How to win?</Text>
            <Text style={styles.howP}>
              All videos you post between {fmtDate(EVENT_START)} and {fmtDate(EVENT_END)} are counted, and their{" "}
              <Text style={{ color: "#fff", fontWeight: "800" }}>combined total views</Text> become your score.
              The creators with the highest total views win Top 1, Top 2 and Top 3.
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={GOLD} />
          </View>
        ) : error && !board ? (
          <View style={styles.center}>
            <Ionicons name="cloud-offline" size={34} color="#8a93b5" />
            <Text style={styles.errText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} activeOpacity={0.8} onPress={() => { setLoading(true); load(false); }}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* TOTAL STATS */}
            <View style={styles.sec}>
              <View style={styles.statRow}>
                <StatBox icon="people" value={fmt(board?.totalCreators || 0)} label="Creators" />
                <StatBox icon="videocam" value={fmt(board?.totalVideos || 0)} label="Videos" />
                <StatBox icon="eye" value={fmt(board?.totalViews || 0)} label="Total Views" />
              </View>

              {/* MERI RANK */}
              {started ? (
                <View style={styles.meCard}>
                  {me ? (
                    <>
                      <Text style={styles.meRank}>#{me.rank}</Text>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.meTitle}>Your rank</Text>
                        <Text style={styles.meSub}>
                          {fmt(me.videos)} {me.videos === 1 ? "video" : "videos"} · {fmt(me.views)} total views
                        </Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <Ionicons name="videocam" size={26} color={GOLD} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.meTitle}>You are not in the race yet</Text>
                        <Text style={styles.meSub}>Post a video during the event and your views will add up.</Text>
                      </View>
                    </>
                  )}
                </View>
              ) : null}
            </View>

            {/* CREATOR PRIZES */}
            <View style={styles.sec}>
              <Text style={styles.label}>CREATOR PRIZES</Text>
              <Text style={styles.h2}>Top 3 win Stars and a Tik</Text>

              {/* Top 1, 2, 3 - ek hi line me (2 | 1 | 3 podium) */}
              <View style={styles.podRow}>
                <PodiumCard
                  rank={2}
                  user={users[1]}
                  stars={10000}
                  delay={120}
                  tickLabel="White Tik"
                  tickColor={{ bg: NAVY, icon: "#fff", text: "#fff" }}
                />
                <PodiumCard
                  rank={1}
                  user={users[0]}
                  stars={15000}
                  first
                  delay={60}
                  tickLabel="Garevi Tik"
                  tickColor={{ bg: "rgba(18,184,134,0.25)", icon: "#12b886", text: "#6ff0c4" }}
                />
                <PodiumCard
                  rank={3}
                  user={users[2]}
                  stars={5000}
                  delay={180}
                  tickLabel="White Tik"
                  tickColor={{ bg: NAVY, icon: "#fff", text: "#fff" }}
                />
              </View>
            </View>

            {/* LIVE RANKING */}
            <View style={styles.sec}>
              <Text style={styles.label}>LIVE RANKING</Text>
              <Text style={styles.h2}>Top 10 standings</Text>
              <Text style={styles.sub}>
                Each creator's score is the combined views of all videos posted during this event. Updates automatically every minute.
              </Text>

              {top10.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="hourglass" size={28} color="#8a93b5" />
                  <Text style={styles.emptyText}>
                    {started
                      ? "Nobody has posted an event video yet. Post the first one and take the No.1 spot!"
                      : `The event starts on ${fmtDate(EVENT_START)}. Once it begins, names, photos and total views will appear here.`}
                  </Text>
                </View>
              ) : (
                top10.map((u, i) => <BoardRow key={u.uid} user={u} index={i} max={max} />)
              )}
            </View>

            {/* AGENCY */}
            <View style={[styles.sec, styles.agency]}>
              <Text style={[styles.label, { color: GOLD }]}>AGENCY PRIZES</Text>
              <Text style={styles.h2}>Top 3 agencies win White Tik</Text>
              <Text style={[styles.sub, { color: "#b7bfe4" }]}>
                An agency's score is the total Stars received by all its members (for example, 5 members who received 10 + 50 + 60 + 70 + 2 = 192 Stars). The top agency gets a double White Tik.
              </Text>
              <AgencyTile n={1} ticks={2} first delay={60} agency={agencies[0]} />
              <AgencyTile n={2} ticks={1} delay={120} agency={agencies[1]} />
              <AgencyTile n={3} ticks={1} delay={180} agency={agencies[2]} />
            </View>
          </>
        )}

        {/* FOOTER */}
        <View style={styles.cta}>
          <Ionicons name="ribbon" size={34} color={GOLD} />
          <Text style={styles.ctaH}>The crown is waiting for you</Text>
          <Text style={styles.ctaP}>Start posting videos today, grow your views and join the race to become TopKing.</Text>
          <Text style={styles.ctaP}>Contact us if you have any questions.</Text>
          <Text style={styles.ctaBy}>TopKing Team</Text>
        </View>
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

  podViewsBig: { color: "#fff", fontWeight: "900", fontSize: 14, marginTop: 4 },
  emptyDp: { backgroundColor: "#1b2557", alignItems: "center", justifyContent: "center" },

  center: { alignItems: "center", justifyContent: "center", paddingVertical: 60, paddingHorizontal: 30 },
  errText: { color: "#8a93b5", fontSize: 14, marginTop: 10, textAlign: "center" },
  retryBtn: { marginTop: 14, backgroundColor: GOLD, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: NAVY, fontWeight: "900", fontSize: 14 },

  statRow: { flexDirection: "row", marginHorizontal: -4 },
  statBox: {
    flex: 1,
    marginHorizontal: 4,
    alignItems: "center",
    backgroundColor: "#0e1640",
    borderWidth: 1,
    borderColor: "#27337a",
    borderRadius: 14,
    paddingVertical: 12,
  },
  statVal: { color: "#fff", fontWeight: "900", fontSize: 17, marginTop: 4 },
  statLbl: { color: "#8a93b5", fontWeight: "700", fontSize: 11, marginTop: 2 },

  meCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    backgroundColor: "#131d52",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.55)",
    borderRadius: 16,
    padding: 14,
  },
  meRank: { color: GOLD, fontWeight: "900", fontSize: 30 },
  meTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  meSub: { color: "#9aa4cf", fontSize: 12.5, marginTop: 2 },

  rowSub: { color: "#8a93b5", fontSize: 11, marginTop: 2 },
  rowViewsLbl: { color: "#8a93b5", fontSize: 10, fontWeight: "700", marginTop: 2 },

  emptyBox: {
    alignItems: "center",
    backgroundColor: "#0e1640",
    borderWidth: 1,
    borderColor: "#202b6b",
    borderRadius: 14,
    padding: 24,
  },
  emptyText: { color: "#9aa4cf", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10 },

  agLogo: { width: 46, height: 46, borderRadius: 12, backgroundColor: "#e9ecf8" },
  agLogoEmpty: { alignItems: "center", justifyContent: "center" },
  agName: { color: NAVY, fontWeight: "900", fontSize: 17, marginTop: 2 },
  agSub: { color: "#4a5380", fontSize: 12, fontWeight: "700", marginTop: 6 },
  agNumRow: { flexDirection: "row", alignItems: "flex-end" },
  agViews: { color: NAVY, fontWeight: "900", fontSize: 24 },
  agTarget: { color: "#4a5380", fontWeight: "800", fontSize: 13, marginBottom: 3 },
  agBar: { height: 8, borderRadius: 4, backgroundColor: "rgba(11,20,55,0.18)", marginTop: 8, overflow: "hidden" },
  agBarFill: { height: "100%", borderRadius: 4, backgroundColor: "#12b886" },
});
