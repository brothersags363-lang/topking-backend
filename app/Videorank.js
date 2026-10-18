import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Dimensions,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth, db } from "./firebaseConfig";

const { width } = Dimensions.get("window");

const GOLD = "#FFD700";
const GREEN = "#2ED573";
const RED = "#FF4757";
const BG = "#050505";
const CARD = "#111114";
const BORDER = "#222228";

const MONTHS_BACK = 6;
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const monthKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const monthRange = (key) => {
  const [y, m] = key.split("-").map(Number);
  return {
    start: new Date(y, m - 1, 1).getTime(),
    end: new Date(y, m, 1).getTime(),
  };
};

const buildMonths = () => {
  const now = new Date();
  const list = [];
  for (let i = 0; i < MONTHS_BACK; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    list.push({
      key: monthKey(d),
      short: MONTH_NAMES[d.getMonth()],
      full: `${MONTH_FULL[d.getMonth()]} ${d.getFullYear()}`,
    });
  }
  return list; // index 0 = current month
};

const toMillis = (v) => {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const p = Date.parse(v);
    return Number.isNaN(p) ? 0 : p;
  }
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return 0;
};

const compact = (n) => {
  const num = Number(n) || 0;
  const abs = Math.abs(num);
  if (abs >= 1e9) return `${(num / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
  if (abs >= 1e6) return `${(num / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1e4) return `${(num / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return String(num);
};

const signed = (n) => {
  const num = Number(n) || 0;
  if (num === 0) return "0";
  return `${num > 0 ? "+" : "-"}${compact(Math.abs(num))}`;
};

/* ------------------------------------------------------------------ */
/*  Small UI pieces                                                    */
/* ------------------------------------------------------------------ */

function DeltaPill({ value, big }) {
  const up = value > 0;
  const down = value < 0;
  const color = up ? GREEN : down ? RED : "#8e8e93";
  return (
    <View
      style={[
        styles.pill,
        big && styles.pillBig,
        { backgroundColor: color + "22", borderColor: color + "55" },
      ]}
    >
      <Ionicons
        name={up ? "trending-up" : down ? "trending-down" : "remove"}
        size={big ? 15 : 12}
        color={color}
      />
      <Text style={[styles.pillText, big && { fontSize: 14 }, { color }]}>
        {signed(value)}
      </Text>
    </View>
  );
}

function StatCard({ icon, label, total, gain, loss, net, tint, delay }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 450,
      delay,
      useNativeDriver: true,
    }).start();
  }, [total, gain, loss, delay, anim]);

  return (
    <Animated.View
      style={[
        styles.statCard,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [18, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.statTop}>
        <View style={[styles.statIcon, { backgroundColor: tint + "22" }]}>
          <Ionicons name={icon} size={18} color={tint} />
        </View>
        <DeltaPill value={net} />
      </View>

      <Text style={styles.statTotal}>{compact(total)}</Text>
      <Text style={styles.statLabel}>{label}</Text>

      <View style={styles.statDivider} />

      <View style={styles.gainLossRow}>
        <View style={styles.gainLossCol}>
          <Text style={[styles.gainLossNum, { color: GREEN }]}>
            +{compact(gain)}
          </Text>
          <Text style={styles.gainLossTag}>Gained</Text>
        </View>
        <View style={styles.gainLossSep} />
        <View style={styles.gainLossCol}>
          <Text style={[styles.gainLossNum, { color: RED }]}>
            -{compact(loss)}
          </Text>
          <Text style={styles.gainLossTag}>Lost</Text>
        </View>
      </View>
    </Animated.View>
  );
}

function Bar({ height, label, value, active, onPress }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: height,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [height, anim]);

  const positive = value >= 0;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={styles.barCol}
    >
      <Text style={[styles.barValue, active && { color: "#fff" }]}>
        {signed(value)}
      </Text>
      <View style={styles.barTrack}>
        <Animated.View
          style={[
            styles.barFill,
            {
              height: anim,
              backgroundColor: positive ? GREEN : RED,
              opacity: active ? 1 : 0.45,
            },
          ]}
        />
      </View>
      <Text style={[styles.barLabel, active && { color: GOLD }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

const METRICS = [
  { key: "views", label: "Views", icon: "eye", tint: "#4DA8FF" },
  { key: "likes", label: "Likes", icon: "heart", tint: "#FF5C8A" },
  { key: "followers", label: "Followers", icon: "people", tint: GOLD },
  { key: "following", label: "Following", icon: "person-add", tint: "#B57BFF" },
];

export default function VideoRank() {
  const router = useRouter();
  const months = useMemo(buildMonths, []);

  // Back: hamesha pichhli screen (profile) pe jao.
  // Profile tab ka apna hardware-back handler "/" (index) pe bhejta hai,
  // isliye yaha apna handler lagana zaroori hai (language.js jaisa).
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/profile");
    }
  }, [router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [goBack]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(0); // index in months
  const [chartMetric, setChartMetric] = useState("views");

  // raw data
  const [current, setCurrent] = useState(null); // live totals
  const [snaps, setSnaps] = useState({}); // { 'YYYY-MM': doc }
  const [followTimes, setFollowTimes] = useState({ followers: [], following: [] });
  const [videoList, setVideoList] = useState([]);

  const load = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setError("Please login first.");
      setLoading(false);
      return;
    }

    try {
      setError("");

      const [vSnap, fersSnap, fingSnap, statsSnap] = await Promise.all([
        getDocs(query(collection(db, "all_videos"), where("userId", "==", uid))),
        getDocs(query(collection(db, "follows"), where("followingId", "==", uid))),
        getDocs(query(collection(db, "follows"), where("followerId", "==", uid))),
        getDocs(collection(db, "users", uid, "videoRank")).catch(() => null),
      ]);

      // ---- live totals ------------------------------------------------
      let totalViews = 0;
      let totalLikes = 0;
      const perVideoViews = {};
      const perVideoLikes = {};
      const vids = [];

      vSnap.docs.forEach((d) => {
        const data = d.data();
        const v = Number(data.views || 0);
        const l = Number(data.likes || 0);
        totalViews += v;
        totalLikes += l;
        perVideoViews[d.id] = v;
        perVideoLikes[d.id] = l;
        vids.push({
          id: d.id,
          thumbnail: data.thumbnail || data.thumbUrl || "",
          caption: data.caption || data.title || data.description || "",
          views: v,
          likes: l,
        });
      });

      const followersTimes = fersSnap.docs.map((d) => toMillis(d.data().createdAt));
      const followingTimes = fingSnap.docs.map((d) => toMillis(d.data().createdAt));

      const live = {
        views: totalViews,
        likes: totalLikes,
        followers: fersSnap.size,
        following: fingSnap.size,
        videoViews: perVideoViews,
        videoLikes: perVideoLikes,
      };

      // ---- snapshots --------------------------------------------------
      const existing = {};
      statsSnap?.docs.forEach((d) => {
        existing[d.id] = d.data();
      });

      const nowKey = monthKey(new Date());
      const { start: mStart, end: mEnd } = monthRange(nowKey);
      const inMonth = (t) => t >= mStart && t < mEnd;

      const fersGainedNow = followersTimes.filter(inMonth).length;
      const fingGainedNow = followingTimes.filter(inMonth).length;

      // Is month ka baseline pehli baar bana rahe hain?
      // Previous month ka 'end' hi is month ka 'start' hai (agar hai).
      const prevKey = months[1]?.key;
      const prevEnd = prevKey ? existing[prevKey] : null;

      let docNow = existing[nowKey];
      if (!docNow) {
        docNow = {
          month: nowKey,
          startViews: prevEnd?.endViews ?? live.views,
          startLikes: prevEnd?.endLikes ?? live.likes,
          // follow docs me createdAt hota hai, isliye baseline exact nikal sakte hain
          startFollowers: prevEnd?.endFollowers ?? Math.max(0, live.followers - fersGainedNow),
          startFollowing: prevEnd?.endFollowing ?? Math.max(0, live.following - fingGainedNow),
          startVideoViews: prevEnd?.endVideoViews ?? perVideoViews,
          startVideoLikes: prevEnd?.endVideoLikes ?? perVideoLikes,
        };
      }

      const merged = {
        ...docNow,
        endViews: live.views,
        endLikes: live.likes,
        endFollowers: live.followers,
        endFollowing: live.following,
        endVideoViews: perVideoViews,
        endVideoLikes: perVideoLikes,
      };

      existing[nowKey] = merged;

      // save in background (fail ho jaye to bhi screen chalti rahe)
      setDoc(
        doc(db, "users", uid, "videoRank", nowKey),
        { ...merged, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(() => {});

      setCurrent(live);
      setSnaps(existing);
      setFollowTimes({ followers: followersTimes, following: followingTimes });
      setVideoList(vids);
    } catch (e) {
      if (__DEV__) console.log("VideoRank load error", e);
      setError("Data load nahi ho paaya. Internet check karke dobara try karo.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [months]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  /* ---------------- per-month numbers ---------------- */

  const statsFor = useCallback(
    (key) => {
      const snap = snaps[key];
      const { start, end } = monthRange(key);
      const inMonth = (t) => t >= start && t < end;

      const fersGained = followTimes.followers.filter(inMonth).length;
      const fingGained = followTimes.following.filter(inMonth).length;

      if (!snap) {
        return {
          hasData: false,
          views: { total: 0, gain: 0, loss: 0, net: 0 },
          likes: { total: 0, gain: 0, loss: 0, net: 0 },
          followers: { total: 0, gain: fersGained, loss: 0, net: fersGained },
          following: { total: 0, gain: fingGained, loss: 0, net: fingGained },
        };
      }

      const mk = (startV, endV, gainedExact) => {
        const net = (endV ?? 0) - (startV ?? 0);
        let gain;
        let loss;
        if (typeof gainedExact === "number") {
          // follows: gain exact (createdAt se), loss = gain - net
          gain = Math.max(gainedExact, net, 0);
          loss = Math.max(gain - net, 0);
        } else {
          gain = Math.max(net, 0);
          loss = Math.max(-net, 0);
        }
        return { total: endV ?? 0, gain, loss, net };
      };

      return {
        hasData: true,
        views: mk(snap.startViews, snap.endViews),
        likes: mk(snap.startLikes, snap.endLikes),
        followers: mk(snap.startFollowers, snap.endFollowers, fersGained),
        following: mk(snap.startFollowing, snap.endFollowing, fingGained),
      };
    },
    [snaps, followTimes]
  );

  const sel = months[selected];
  const stats = useMemo(() => statsFor(sel.key), [statsFor, sel.key]);

  // chart data (oldest -> newest)
  const chartData = useMemo(() => {
    const arr = [...months].reverse().map((m) => {
      const s = statsFor(m.key);
      return { ...m, value: s[chartMetric].net, hasData: s.hasData };
    });
    const maxAbs = Math.max(1, ...arr.map((a) => Math.abs(a.value)));
    return arr.map((a) => ({
      ...a,
      height: a.value === 0 ? 4 : Math.max(8, (Math.abs(a.value) / maxAbs) * 110),
    }));
  }, [months, statsFor, chartMetric]);

  // top videos this month (per-video delta)
  const topVideos = useMemo(() => {
    const snap = snaps[sel.key];
    if (!snap) return [];
    return videoList
      .map((v) => {
        const sv = snap.startVideoViews?.[v.id];
        const sl = snap.startVideoLikes?.[v.id];
        const ev = snap.endVideoViews?.[v.id] ?? v.views;
        const el = snap.endVideoLikes?.[v.id] ?? v.likes;
        return {
          ...v,
          dViews: ev - (sv ?? ev),
          dLikes: el - (sl ?? el),
        };
      })
      .filter((v) => v.dViews !== 0 || v.dLikes !== 0)
      .sort((a, b) => b.dViews - a.dViews)
      .slice(0, 5);
  }, [snaps, sel.key, videoList]);

  // growth score (just for the hero badge)
  const growthScore = stats.views.net + stats.likes.net * 3 + stats.followers.net * 10;
  const trendUp = growthScore >= 0;

  /* ---------------- render ---------------- */

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={goBack}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={{ alignItems: "center" }}>
          <Text style={styles.headerTitle}>Video Rank</Text>
          <Text style={styles.headerSub}>Monthly Insights</Text>
        </View>

        <View style={styles.crownWrap}>
          <Ionicons name="trophy" size={18} color={GOLD} />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={GOLD} />
          <Text style={styles.loadingText}>Stats ban rahe hain…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={46} color="#555" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              setLoading(true);
              load();
            }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={GOLD}
              colors={[GOLD]}
            />
          }
        >
          {/* Month selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.monthRow}
          >
            {months.map((m, i) => {
              const active = i === selected;
              return (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => setSelected(i)}
                  activeOpacity={0.8}
                  style={[styles.monthChip, active && styles.monthChipActive]}
                >
                  <Text
                    style={[styles.monthText, active && styles.monthTextActive]}
                  >
                    {i === 0 ? "This Month" : m.short}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Hero */}
          <LinearGradient
            colors={["#2a2205", "#17130a", "#0c0c0e"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroGlow} />
            <Text style={styles.heroMonth}>{sel.full}</Text>

            <View style={styles.heroRow}>
              <View>
                <Text style={styles.heroLabel}>Total Views</Text>
                <Text style={styles.heroNumber}>
                  {compact(current?.views || 0)}
                </Text>
              </View>
              <DeltaPill value={stats.views.net} big />
            </View>

            <View style={styles.heroFoot}>
              <View style={styles.heroTag}>
                <Ionicons
                  name={trendUp ? "rocket" : "alert-circle"}
                  size={14}
                  color={trendUp ? GOLD : RED}
                />
                <Text style={[styles.heroTagText, { color: trendUp ? GOLD : RED }]}>
                  {trendUp ? "Growing this month" : "Slowing down"}
                </Text>
              </View>
              <Text style={styles.heroVideos}>
                {videoList.length} videos
              </Text>
            </View>
          </LinearGradient>

          {!stats.hasData && (
            <View style={styles.notice}>
              <Ionicons name="information-circle" size={18} color={GOLD} />
              <Text style={styles.noticeText}>
                Is mahine ka data record nahi hai. App kholte rahoge to har
                mahine ka growth yaha save hota rahega.
              </Text>
            </View>
          )}

          {/* 4 stat cards */}
          <View style={styles.grid}>
            {METRICS.map((m, i) => (
              <StatCard
                key={m.key}
                icon={m.icon}
                label={m.label}
                tint={m.tint}
                total={stats[m.key].total || current?.[m.key] || 0}
                gain={stats[m.key].gain}
                loss={stats[m.key].loss}
                net={stats[m.key].net}
                delay={i * 80}
              />
            ))}
          </View>

          {/* Chart */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Monthly Trend</Text>
              <Text style={styles.sectionSub}>Net change</Text>
            </View>

            <View style={styles.tabs}>
              {METRICS.map((m) => {
                const active = chartMetric === m.key;
                return (
                  <TouchableOpacity
                    key={m.key}
                    onPress={() => setChartMetric(m.key)}
                    style={[styles.tab, active && styles.tabActive]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.chartBox}>
              {chartData.map((c) => (
                <Bar
                  key={c.key}
                  height={c.height}
                  label={c.short}
                  value={c.value}
                  active={c.key === sel.key}
                  onPress={() =>
                    setSelected(months.findIndex((m) => m.key === c.key))
                  }
                />
              ))}
            </View>
          </View>

          {/* Top videos */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Top Videos</Text>
              <Text style={styles.sectionSub}>{sel.short} growth</Text>
            </View>

            {topVideos.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="videocam-outline" size={30} color="#555" />
                <Text style={styles.emptyText}>
                  Is mahine koi video growth nahi mili.
                </Text>
              </View>
            ) : (
              topVideos.map((v, idx) => (
                <View key={v.id} style={styles.videoRow}>
                  <Text style={styles.rankNo}>{idx + 1}</Text>

                  {v.thumbnail ? (
                    <Image source={{ uri: v.thumbnail }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Ionicons name="play" size={18} color="#666" />
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.videoCaption}>
                      {v.caption || "Untitled video"}
                    </Text>
                    <Text style={styles.videoTotals}>
                      {compact(v.views)} views · {compact(v.likes)} likes
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <DeltaPill value={v.dViews} />
                    <Text
                      style={[
                        styles.videoLikeDelta,
                        { color: v.dLikes < 0 ? RED : "#FF5C8A" },
                      ]}
                    >
                      ♥ {signed(v.dLikes)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <Text style={styles.footNote}>
            Pull down karke refresh karo. Gained = is mahine me badha, Lost = is
            mahine me ghata.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const CARD_W = (width - 16 * 2 - 12) / 2;
const BAR_W = (width - 32 - 32) / MONTHS_BACK;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 6 : 0,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 19, fontWeight: "800", letterSpacing: 0.3 },
  headerSub: { color: "#7d7d85", fontSize: 11, marginTop: 1, fontWeight: "600" },
  crownWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GOLD + "1A",
    borderWidth: 1,
    borderColor: GOLD + "55",
    alignItems: "center",
    justifyContent: "center",
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  loadingText: { color: "#8a8a92", marginTop: 12, fontSize: 13 },
  errorText: { color: "#aaa", textAlign: "center", marginTop: 12, fontSize: 14, lineHeight: 20 },
  retryBtn: {
    marginTop: 16,
    backgroundColor: GOLD,
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: 22,
  },
  retryText: { color: "#000", fontWeight: "800" },

  monthRow: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  monthChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  monthChipActive: { backgroundColor: GOLD, borderColor: GOLD },
  monthText: { color: "#9a9aa3", fontWeight: "700", fontSize: 13 },
  monthTextActive: { color: "#000" },

  hero: {
    marginHorizontal: 16,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: GOLD + "40",
    overflow: "hidden",
  },
  heroGlow: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: GOLD + "22",
  },
  heroMonth: { color: GOLD, fontWeight: "800", fontSize: 13, letterSpacing: 1, textTransform: "uppercase" },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 14,
  },
  heroLabel: { color: "#a9a9b0", fontSize: 12, fontWeight: "600" },
  heroNumber: { color: "#fff", fontSize: 44, fontWeight: "900", marginTop: 2, letterSpacing: -1 },
  heroFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
  },
  heroTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff10",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  heroTagText: { fontSize: 12, fontWeight: "700" },
  heroVideos: { color: "#8a8a92", fontSize: 12, fontWeight: "600" },

  notice: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: GOLD + "12",
    borderWidth: 1,
    borderColor: GOLD + "30",
  },
  noticeText: { flex: 1, color: "#d8c46a", fontSize: 12, lineHeight: 17 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  statCard: {
    width: CARD_W,
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  statTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statTotal: { color: "#fff", fontSize: 28, fontWeight: "900", marginTop: 12, letterSpacing: -0.5 },
  statLabel: { color: "#8a8a92", fontSize: 12, fontWeight: "600", marginTop: 1 },
  statDivider: { height: 1, backgroundColor: BORDER, marginVertical: 12 },
  gainLossRow: { flexDirection: "row", alignItems: "center" },
  gainLossCol: { flex: 1, alignItems: "center" },
  gainLossSep: { width: 1, height: 26, backgroundColor: BORDER },
  gainLossNum: { fontSize: 15, fontWeight: "800" },
  gainLossTag: { color: "#6f6f77", fontSize: 10, fontWeight: "600", marginTop: 2 },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  pillBig: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
  pillText: { fontSize: 11, fontWeight: "800" },

  section: {
    marginTop: 24,
    marginHorizontal: 16,
    backgroundColor: CARD,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 12,
  },
  sectionTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  sectionSub: { color: "#7d7d85", fontSize: 12, fontWeight: "600" },

  tabs: {
    flexDirection: "row",
    backgroundColor: "#0a0a0c",
    borderRadius: 14,
    padding: 3,
    marginBottom: 16,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 11 },
  tabActive: { backgroundColor: GOLD },
  tabText: { color: "#8a8a92", fontSize: 12, fontWeight: "700" },
  tabTextActive: { color: "#000" },

  chartBox: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 190,
  },
  barCol: { width: BAR_W, alignItems: "center", justifyContent: "flex-end" },
  barValue: { color: "#7d7d85", fontSize: 10, fontWeight: "800", marginBottom: 6 },
  barTrack: { height: 112, justifyContent: "flex-end" },
  barFill: { width: 22, borderRadius: 8 },
  barLabel: { color: "#6f6f77", fontSize: 11, fontWeight: "700", marginTop: 8 },

  videoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  rankNo: { color: GOLD, width: 16, fontWeight: "900", fontSize: 15 },
  thumb: { width: 46, height: 60, borderRadius: 10, backgroundColor: "#1c1c20" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  videoCaption: { color: "#fff", fontWeight: "700", fontSize: 14 },
  videoTotals: { color: "#7d7d85", fontSize: 11, marginTop: 3 },
  videoLikeDelta: { fontSize: 11, fontWeight: "800" },

  emptyBox: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyText: { color: "#6f6f77", fontSize: 13 },

  footNote: {
    color: "#5d5d65",
    fontSize: 11,
    textAlign: "center",
    marginTop: 20,
    paddingHorizontal: 30,
    lineHeight: 16,
  },
});
