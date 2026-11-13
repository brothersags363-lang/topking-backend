// app/creator-verification.js
// Tiki jaisa "Creator Verification" page. Explore -> Creator Verification dabane par ye khulta hai.
// Ek hi page ke andar 2 view hain (alag screen nahi => turant, smooth):
//   1) Privileges  : Verified User -> White V -> Grey V -> Blue V timeline + "Creator Hub" bar
//   2) Creator Hub : levels par swipe, stats, Grey V viral target, Blue V locked
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, Image,
  ActivityIndicator, Animated, Dimensions, Easing, StatusBar,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useRouter } from "../utils/safeRouter";
import useBackStep from "../utils/useBackStep";
import { auth, db } from "./firebaseConfig";
import { callApi } from "../utils/api";

const GREY_V_IMG = require("../assets/images/grey-v-tick.png");
const { width: W } = Dimensions.get("window");

const YELLOW = "#FFE600";
const BG = "#0E0E0E";
const CARD = "#1C1C1E";
const VIRAL_PLAYS = 3000; // 1 viral video = 3000+ plays
const VIRAL_NEEDED = 5;
const WHITE_VIEWS = 300; // White V: 5 videos x 300+ views
const WHITE_NEEDED = 5;

// ---------- levels ----------
const LEVELS = [
  { key: "user", name: "Verified User", traffic: 1, benefits: 3, money: 1, color: "#C9CCD6",
    gradient: ["#6b6b70", "#4a4a4f"], desc: "Unlock level 1 traffic perks, 3 functional benefits, and 1 monetisation opportunities" },
  { key: "white", name: "White V", traffic: 2, benefits: 5, money: 2, color: "#FFFFFF",
    gradient: ["#7d7d82", "#55555a"], desc: "Unlock level 2 traffic perks, 5 functional benefits, and 2 monetisation opportunities" },
  { key: "grey", name: "Grey V", traffic: 3, benefits: 9, money: 2, color: "#A99BD6",
    gradient: ["#7a74a6", "#4d4a72"], desc: "Unlock level 3 traffic perks, 9 functional benefits, and 2 monetisation opportunities" },
  { key: "blue", name: "Blue V", traffic: 4, benefits: 13, money: 3, color: "#2FB8FF",
    gradient: ["#3FC4FF", "#1D7BE0"], desc: "Unlock level 4 traffic perks, 13 functional benefits, and 3 monetisation opportunities" },
];

const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 2).replace(/\.?0+$/, "") + "k" : String(n));

// ---------- small pieces ----------
const Badge = memo(function Badge({ k, size = 26, dim }) {
  const o = dim ? 0.55 : 1;
  if (k === "user")
    return <Ionicons name="person-circle-outline" size={size} color="#C9CCD6" style={{ opacity: o }} />;
  if (k === "grey")
    return <Image source={GREY_V_IMG} style={{ width: size, height: size, opacity: o }} resizeMode="contain" />;
  return (
    <MaterialCommunityIcons
      name="check-decagram" size={size} color={k === "blue" ? "#2FB8FF" : "#FFFFFF"} style={{ opacity: o }}
    />
  );
});

const Perks = memo(function Perks({ lv, style }) {
  return (
    <View style={[s.perkRow, style]}>
      <MaterialCommunityIcons name="fire" size={16} color="#fff" />
      <View style={s.bars}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[s.bar, i < lv.traffic && { backgroundColor: i > 2 ? "#FF5A1F" : "#FFB21E" }]} />
        ))}
      </View>
      <Text style={s.perkSep}>/</Text>
      <FontAwesome5 name="gem" size={12} color="#fff" />
      <Text style={s.perkTxt}> {lv.benefits} Benefits</Text>
      <Text style={s.perkSep}> / </Text>
      <View style={s.dollar}><Text style={s.dollarTxt}>$</Text></View>
      <Text style={s.perkTxt}> {lv.money} Monetisation</Text>
    </View>
  );
});

// ======================================================================
export default function CreatorVerification() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const uid = auth?.currentUser?.uid;

  const [view, setView] = useState("privileges"); // privileges | hub
  const [data, setData] = useState(null);
  const [vids, setVids] = useState({ plays: 0, likes: 0, viral: 0, top: [], white: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  // hub se back -> privileges, privileges se back -> peeche
  useBackStep("/(tabs)/explore", () => {
    if (viewRef.current === "hub") { setView("privileges"); return true; }
    return false;
  });

  useEffect(() => {
    if (!uid) { setData({}); return; }
    return onSnapshot(doc(db, "users", uid), (sn) => setData(sn.exists() ? sn.data() : {}), () => setData({}));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, "all_videos"), where("userId", "==", uid)),
      (sn) => {
        let plays = 0, likes = 0, viral = 0, white = 0;
        const all = [];
        sn.docs.forEach((d) => {
          const v = d.data();
          const p = Number(v.views || 0);
          plays += p; likes += Number(v.likes || 0);
          if (p >= VIRAL_PLAYS) viral += 1;
          if (p >= WHITE_VIEWS) white += 1;
          all.push({ id: d.id, views: p, thumb: v.thumbnail || v.thumb || null });
        });
        all.sort((a, b) => b.views - a.views); // sabse zyada view wale pehle
        setVids({ plays, likes, viral, white, top: all.slice(0, WHITE_NEEDED) });
      },
      () => {}
    );
  }, [uid]);

  // current level: -1 = none, 0 = Verified User, 1 = White, 2 = Grey, 3 = Blue
  const current = useMemo(() => {
    if (!data) return -1;
    if (data.verified) return data.verifiedColor === "blue" ? 3 : data.verifiedColor === "yellow" ? 2 : 1;
    const face = data.faceStatus === "submitted" || data.faceStatus === "approved";
    return face ? 0 : -1;
  }, [data]);

  // 5 videos x 300+ views + face done  ->  server White V de deta hai (auto, ek hi baar)
  const claimed = useRef(false);
  useEffect(() => {
    if (!data || current !== 0 || claimed.current) return;
    if (vids.white >= WHITE_NEEDED) {
      claimed.current = true;
      callApi("/creator/claim-white", {}).catch(() => { claimed.current = false; });
    }
  }, [data, current, vids.white]);

  // Grey V: 5 videos x 3000+ views (+ real photo & bio + quiz) -> server Grey V de deta hai (auto)
  const greyReady = useMemo(() => {
    if (!data) return false;
    const photoOk = !!data.profileImg && !String(data.profileImg).includes("3135715");
    return photoOk && !!String(data.bioText || "").trim() && data.quizPassed === true;
  }, [data]);
  const claimedGrey = useRef(false);
  useEffect(() => {
    if (!data || current < 0 || current >= 2 || claimedGrey.current) return;
    if (vids.viral >= VIRAL_NEEDED && greyReady) {
      claimedGrey.current = true;
      callApi("/creator/claim-grey", {}).catch(() => {});
    }
  }, [data, current, vids.viral, greyReady]);

  // ---- smooth cross-fade between the two views ----
  const fade = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [view, fade]);

  const openHub = useCallback(() => setView("hub"), []);
  const goBack = useCallback(() => {
    if (viewRef.current === "hub") setView("privileges");
    else { try { router.canGoBack() ? router.back() : router.replace("/(tabs)/explore"); } catch (e) {} }
  }, [router]);

  if (!data) {
    return (
      <View style={[s.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={YELLOW} size="large" />
      </View>
    );
  }

  const me = {
    name: data.username || data.name || "",
    img: data.profileImg || null,
    wallet: Number(data.coins ?? data.stars ?? 0) || 0,
    fans: Number(data.followersCount ?? 0) || 0,
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <Animated.View style={{ flex: 1, opacity: fade }}>
          {view === "privileges" ? (
            <Privileges current={current} onBack={goBack} router={router} />
          ) : (
            <Hub current={current} me={me} vids={vids} greyReady={greyReady} onBack={goBack} router={router} />
          )}
        </Animated.View>
      </SafeAreaView>

      {/* Creator Hub bar (sirf Privileges par, Tiki jaisa) */}
      {view === "privileges" && (
        <TouchableOpacity activeOpacity={0.85} onPress={openHub}
          style={[s.hubBar, { paddingBottom: 10 + insets.bottom }]}>
          {me.img ? <Image source={{ uri: me.img }} style={s.hubAv} /> : <View style={[s.hubAv, { backgroundColor: "#555" }]} />}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.hubTitle}>Creator Hub</Text>
            <Text style={s.hubSub}>Tap to enter creator hub</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#000" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ======================================================================
// VIEW 1 : Privileges
// ======================================================================
const Privileges = memo(function Privileges({ current, onBack, router }) {
  return (
    <View style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>
        <TouchableOpacity onPress={onBack} style={s.back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>

        <View style={s.head}>
          <View style={{ flex: 1 }}>
            <Text style={s.brand}>TOPKING</Text>
            <Text style={s.title}>Creator{"\n"}Verification</Text>
            <Text style={s.headSub}>Verification allows you to get privileges and more traffic</Text>
          </View>
          <MaterialCommunityIcons name="check-decagram-outline" size={118} color={YELLOW} />
        </View>

        <Text style={s.section}>Privileges</Text>

        <View style={s.timeline}>
          <View style={s.line} />
          {LEVELS.map((lv, i) => (
            <View key={lv.key} style={s.tRow}>
              <View style={s.tIcon}><Badge k={lv.key} size={30} dim={i > current} /></View>
              <View style={s.tCard}>
                <Text style={s.tName}>{lv.name}</Text>
                <Text style={s.tDesc}>{lv.desc}</Text>
                <Perks lv={lv} style={{ marginTop: 14 }} />
              </View>
            </View>
          ))}
        </View>

        <Text style={[s.section, { marginTop: 26 }]}>Conditions</Text>
        <TouchableOpacity activeOpacity={0.8} style={s.guide} onPress={() => router.push("/creator")}>
          <Ionicons name="document-text" size={20} color="#fff" />
          <Text style={s.guideTxt}>Creator Verification Guide</Text>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
});

// ======================================================================
// VIEW 2 : Creator Hub
// ======================================================================
const Hub = memo(function Hub({ current, me, vids, greyReady, onBack, router }) {
  const initial = Math.max(0, Math.min(current, 3));
  const [idx, setIdx] = useState(initial);
  const listRef = useRef(null);
  const scrollX = useRef(new Animated.Value(initial * W)).current;

  const goTo = useCallback((i) => {
    setIdx(i);
    listRef.current?.scrollToIndex({ index: i, animated: true });
  }, []);

  const onEnd = useCallback((e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / W);
    setIdx((p) => (p === i ? p : i));
  }, []);

  const renderPage = useCallback(({ item, index }) => (
    <View style={{ width: W }}>
      <Page lv={item} index={index} current={current} me={me} vids={vids} greyReady={greyReady} router={router} goTo={goTo} />
    </View>
  ), [current, me, vids, greyReady, router, goTo]);

  const lv = LEVELS[idx];
  const status = idx === current ? "Current Identity" : idx < current ? "Unlocked" : "Locked";

  return (
    <View style={{ flex: 1 }}>
      {/* top bar */}
      <View style={s.hubTop}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={s.hubTopTitle}>Creator Hub</Text>
        <TouchableOpacity onPress={() => router.push("/creator")}>
          <Ionicons name="book-outline" size={24} color="#ddd" />
        </TouchableOpacity>
      </View>

      {/* level selector (arc ki jagah simple row — swipe/tap dono) */}
      <View style={s.arc}>
        {LEVELS.map((l, i) => {
          const active = i === idx;
          const scale = scrollX.interpolate({
            inputRange: [(i - 1) * W, i * W, (i + 1) * W], outputRange: [0.8, 1.25, 0.8], extrapolate: "clamp",
          });
          return (
            <TouchableOpacity key={l.key} activeOpacity={0.8} onPress={() => goTo(i)} style={s.arcItem}>
              <Animated.View style={[s.arcDot, active && s.arcDotOn, { transform: [{ scale }] }]}>
                <Badge k={l.key} size={active ? 34 : 26} dim={i > current} />
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* identity card */}
      <LinearGradient colors={lv.gradient} style={s.idCard}>
        <View style={s.statusPill}>
          {status === "Locked" && <Ionicons name="lock-closed" size={12} color="#fff" style={{ marginRight: 4 }} />}
          <Text style={[s.statusTxt, status === "Current Identity" && { color: YELLOW }]}>{status}</Text>
        </View>
        <Text style={s.idName}>{lv.name}</Text>
        <Perks lv={lv} style={{ justifyContent: "center", marginTop: 12 }} />
      </LinearGradient>

      <Animated.FlatList
        ref={listRef}
        data={LEVELS}
        keyExtractor={(l) => l.key}
        renderItem={renderPage}
        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        initialScrollIndex={initial}
        getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
        onMomentumScrollEnd={onEnd}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        windowSize={3} initialNumToRender={2} removeClippedSubviews
        decelerationRate="fast"
      />
    </View>
  );
});

// ---------- one page per level ----------
const Page = memo(function Page({ lv, index, current, me, vids, greyReady, router, goTo }) {
  // White V: user ke top-5 videos (sabse zyada view) + 300 views ka progress
  if (lv.key === "white") {
    const done = vids.white >= WHITE_NEEDED;
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        <Text style={s.hint}>
          {index <= current
            ? "You are White V! Your top videos:"
            : done ? "Target complete! White V is being applied..." : "Get 300+ views on 5 videos to become White V!"}
        </Text>
        <View style={s.panel}>
          <View style={s.rowBetween}>
            <Text style={s.panelTitle}>Top {WHITE_NEEDED} videos</Text>
            <Text style={[s.count, { fontSize: 15, color: done ? YELLOW : "#8d8d92" }]}>
              {Math.min(vids.white, WHITE_NEEDED)}/{WHITE_NEEDED}
            </Text>
          </View>
          <Text style={[s.small, { marginTop: 4 }]}>Each video needs {WHITE_VIEWS}+ views</Text>
          {Array.from({ length: WHITE_NEEDED }).map((_, i) => (
            <VideoRow key={i} v={vids.top[i]} n={i + 1} router={router} />
          ))}
        </View>
        {index > current && current < 0 && (
          <TouchableOpacity activeOpacity={0.85} style={[s.yBtn, { marginTop: 16 }]} onPress={() => router.push("/creator")}>
            <Text style={s.yBtnT}>Verify face first</Text>
          </TouchableOpacity>
        )}
        {index > current && current >= 0 && (
          <TouchableOpacity activeOpacity={0.85} style={[s.yBtn, { marginTop: 16 }]} onPress={() => router.push("/camera")}>
            <Text style={s.yBtnT}>Shoot video now</Text>
          </TouchableOpacity>
        )}
        {index <= current && (
          <>
            <View style={[s.tiles, { marginTop: 14 }]}>
              <Tile icon={<MaterialCommunityIcons name="shield-check" size={30} color="#2EE6B6" />} big="Excellent" small="Status" />
              <Tile icon={<View style={s.coin}><Text style={s.coinT}>T</Text></View>} big={String(me.wallet)} small="Wallet"
                onPress={() => router.push("/wallet")} />
              <Tile icon={<MaterialCommunityIcons name="trophy" size={30} color="#FFB21E" />} big="Join ›" bigColor={YELLOW}
                small="Family" onPress={() => router.push("/family")} />
            </View>
            <View style={s.panel}>
              <Text style={s.panelTitle}>Data analysis</Text>
              <View style={s.stats}>
                <Stat n={fmt(vids.plays)} l="Plays" />
                <Stat n={String(vids.likes)} l="Likes" />
                <Stat n={String(me.fans)} l="New fans" />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    );
  }

  // Unlocked / current -> stats
  if (index <= current) {
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        <View style={s.tiles}>
          <Tile icon={<MaterialCommunityIcons name="shield-check" size={30} color="#2EE6B6" />} big="Excellent" small="Status" />
          <Tile icon={<View style={s.coin}><Text style={s.coinT}>T</Text></View>} big={String(me.wallet)} small="Wallet"
            onPress={() => router.push("/wallet")} />
          <Tile icon={<MaterialCommunityIcons name="trophy" size={30} color="#FFB21E" />} big="Join ›" bigColor={YELLOW}
            small="Family" onPress={() => router.push("/family")} />
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>Data analysis <Text style={s.panelHint}>(Latest 7 days)</Text></Text>
          <View style={s.stats}>
            <Stat n={fmt(vids.plays)} l="Plays" />
            <Stat n={String(vids.likes)} l="Likes" />
            <Stat n={String(me.fans)} l="New fans" />
          </View>
        </View>

        <TouchableOpacity activeOpacity={0.9} style={s.panel} onPress={() => router.push("/event")}>
          <Text style={s.panelTitle}>Challenge Activity Centre</Text>
          <LinearGradient colors={["#FFC25A", "#FF8A3D"]} style={s.banner}>
            <Text style={s.bannerT}>#TopKingRewind</Text>
            <Text style={s.bannerS}>UNITED BY CREATIVITY</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Blue V locked & Grey V abhi nahi mila
  if (lv.key === "blue") {
    return (
      <View style={s.lockedBox}>
        <Ionicons name="person-circle-outline" size={110} color="#555" />
        <Text style={s.lockedTxt}>Let's try to become a Grey V first!</Text>
        <TouchableOpacity activeOpacity={0.85} style={s.yBtn} onPress={() => goTo(2)}>
          <Text style={s.yBtnT}>Become Grey V</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Grey V locked -> 5 videos x 3000+ views target
  if (lv.key === "grey") {
    const got = Math.min(vids.viral, VIRAL_NEEDED);
    const done = vids.viral >= VIRAL_NEEDED;
    const hint = current < 0
      ? "Verify your face first, then reach 3000+ views on 5 videos to become Grey V!"
      : !done
        ? "Get 3000+ views on 5 videos and become a Grey V creator now!"
        : greyReady
          ? "Target complete! Grey V is being applied..."
          : "Target complete! Add a real photo & bio and pass the quiz to get Grey V.";
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        <Text style={s.hint}>{hint}</Text>
        <View style={s.panel}>
          <View style={s.rowBetween}>
            <Text style={s.small}>Updates live as your views grow</Text>
            <Text style={[s.count, { fontSize: 15, color: done ? YELLOW : "#8d8d92" }]}>{got}/{VIRAL_NEEDED}</Text>
          </View>
          <View style={s.viralRow}>
            <LinearGradient colors={["#FF5A6A", "#FF8A3D"]} style={s.viralIcon}>
              <MaterialCommunityIcons name="video-vintage" size={30} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.viralT}>Viral Video x {VIRAL_NEEDED}</Text>
              <Text style={s.small}>Viral Video: Play time ≥ {VIRAL_PLAYS}</Text>
              <View style={s.segs}>
                {Array.from({ length: VIRAL_NEEDED }).map((_, i) => (
                  <View key={i} style={[s.seg, i < got && { backgroundColor: YELLOW }]} />
                ))}
              </View>
            </View>
          </View>
          {Array.from({ length: VIRAL_NEEDED }).map((_, i) => (
            <VideoRow key={i} v={vids.top[i]} n={i + 1} need={VIRAL_PLAYS} router={router} />
          ))}
          {done && !greyReady && (
            <TouchableOpacity activeOpacity={0.85} style={[s.yBtn, { marginTop: 14 }]} onPress={() => router.push("/creator")}>
              <Text style={s.yBtnT}>Complete profile & quiz</Text>
            </TouchableOpacity>
          )}
          {!done && (
            <TouchableOpacity activeOpacity={0.85} style={[s.yBtn, { marginTop: 14 }]} onPress={() => router.push("/camera")}>
              <Text style={s.yBtnT}>Shoot video now</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={[s.small, { marginTop: 20, marginBottom: 6, fontSize: 15 }]}>How to make a video viral</Text>
        <Task icon="videocam-outline" t="Improve shooting skills" b="Learn" onPress={() => router.push("/guidelines")} />
        <Task icon="chatbubble-ellipses-outline" t="Reply to comments" b="Reply" onPress={() => router.push("/(tabs)/messages")} />
        <Task icon="share-social-outline" t="Share videos with others" b="Share" onPress={() => router.push("/(tabs)/")} />
      </ScrollView>
    );
  }

  // White V / Verified User locked (face verify baaki)
  return (
    <View style={s.lockedBox}>
      <Ionicons name="person-circle-outline" size={110} color="#555" />
      <Text style={s.lockedTxt}>Complete face verification to unlock {lv.name}</Text>
      <TouchableOpacity activeOpacity={0.85} style={s.yBtn} onPress={() => router.push("/creator")}>
        <Text style={s.yBtnT}>Verify now</Text>
      </TouchableOpacity>
    </View>
  );
});

const VideoRow = memo(function VideoRow({ v, n, need = WHITE_VIEWS, router }) {
  const views = v ? v.views : 0;
  const pct = Math.min(1, views / need);
  const ok = views >= need;
  return (
    <TouchableOpacity
      activeOpacity={v ? 0.8 : 1}
      onPress={v ? () => router.push({ pathname: "/openVideo", params: { id: v.id } }) : undefined}
      style={s.vRow}
    >
      <Text style={s.vNum}>{n}</Text>
      {v && v.thumb ? (
        <Image source={{ uri: v.thumb }} style={s.vThumb} />
      ) : (
        <View style={[s.vThumb, { alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="videocam-outline" size={22} color="#666" />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={s.rowBetween}>
          <Text style={s.vViews}>{v ? `${fmt(views)} views` : "No video yet"}</Text>
          {ok ? <Ionicons name="checkmark-circle" size={20} color={YELLOW} /> : <Text style={s.small}>{views}/{need}</Text>}
        </View>
        <View style={s.vBarBg}><View style={[s.vBar, { width: `${pct * 100}%` }, ok && { backgroundColor: YELLOW }]} /></View>
      </View>
    </TouchableOpacity>
  );
});

const Tile = memo(function Tile({ icon, big, bigColor, small, onPress }) {
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.8 : 1} onPress={onPress} style={s.tile}>
      {icon}
      <Text style={[s.tileBig, bigColor && { color: bigColor }]}>{big}</Text>
      <Text style={s.small}>{small}</Text>
    </TouchableOpacity>
  );
});
const Stat = memo(function Stat({ n, l }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={s.statN}>{n}</Text>
      <Text style={s.statL}>{l}</Text>
    </View>
  );
});
const Task = memo(function Task({ icon, t, b, onPress }) {
  return (
    <View style={s.task}>
      <Ionicons name={icon} size={22} color="#fff" />
      <Text style={s.taskT}>{t}</Text>
      <TouchableOpacity activeOpacity={0.85} style={s.taskBtn} onPress={onPress}>
        <Text style={s.taskBtnT}>{b}</Text>
      </TouchableOpacity>
    </View>
  );
});

// ---------- styles ----------
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  back: { padding: 16 },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18 },
  brand: { color: "#6b5d00", fontSize: 34, fontWeight: "900", letterSpacing: 3 },
  title: { color: YELLOW, fontSize: 30, fontWeight: "800", marginTop: 2, lineHeight: 36 },
  headSub: { color: "#8d8d92", fontSize: 14, marginTop: 10, lineHeight: 20, paddingRight: 10 },
  section: { color: "#fff", fontSize: 19, fontWeight: "700", marginTop: 30, marginBottom: 14, paddingHorizontal: 18 },

  timeline: { paddingLeft: 18, paddingRight: 18 },
  line: { position: "absolute", left: 18 + 18, top: 20, bottom: 40, width: 1, backgroundColor: "#3a3a3d" },
  tRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  tIcon: { width: 36, alignItems: "center", backgroundColor: BG, paddingVertical: 4, zIndex: 2 },
  tCard: { flex: 1, backgroundColor: CARD, borderRadius: 14, padding: 16, marginLeft: 14 },
  tName: { color: "#8d8d92", fontSize: 14, marginBottom: 6 },
  tDesc: { color: "#fff", fontSize: 16.5, fontWeight: "600", lineHeight: 24 },

  perkRow: { flexDirection: "row", alignItems: "center" },
  bars: { flexDirection: "row", marginLeft: 6, alignItems: "center" },
  bar: { width: 14, height: 5, backgroundColor: "#4a4a4d", marginRight: 2, borderRadius: 1 },
  perkSep: { color: "#8d8d92", marginHorizontal: 6, fontSize: 14 },
  perkTxt: { color: "#d0d0d4", fontSize: 13.5 },
  dollar: { width: 17, height: 17, borderRadius: 9, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  dollarTxt: { color: "#000", fontSize: 11, fontWeight: "900" },

  guide: { flexDirection: "row", alignItems: "center", backgroundColor: CARD, borderRadius: 12, marginHorizontal: 18, padding: 18 },
  guideTxt: { flex: 1, color: "#fff", fontSize: 17, fontWeight: "600", marginLeft: 14 },

  hubBar: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: YELLOW, flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: 10 },
  hubAv: { width: 48, height: 48, borderRadius: 24 },
  hubTitle: { color: "#000", fontSize: 19, fontWeight: "800" },
  hubSub: { color: "#333", fontSize: 13.5, marginTop: 2 },

  hubTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  hubTopTitle: { color: "#fff", fontSize: 19, fontWeight: "700" },
  arc: { flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end", height: 62, paddingHorizontal: 20 },
  arcItem: { alignItems: "center", justifyContent: "center", width: 64, height: 56 },
  arcDot: { alignItems: "center", justifyContent: "center" },
  arcDotOn: {},
  idCard: { marginHorizontal: 14, marginTop: 6, borderRadius: 14, paddingVertical: 22, paddingHorizontal: 14, alignItems: "center", marginBottom: 6 },
  statusPill: { position: "absolute", left: 0, top: -10, flexDirection: "row", alignItems: "center", backgroundColor: "#2a2a2c", paddingHorizontal: 12, paddingVertical: 6, borderTopLeftRadius: 14, borderBottomRightRadius: 14 },
  statusTxt: { color: "#fff", fontSize: 13 },
  idName: { color: "#fff", fontSize: 20, fontWeight: "700", marginTop: 10 },

  tiles: { flexDirection: "row", justifyContent: "space-between" },
  tile: { width: (W - 28 - 20) / 3, backgroundColor: CARD, borderRadius: 12, padding: 14, height: 118, justifyContent: "space-between" },
  tileBig: { color: "#fff", fontSize: 19, fontWeight: "800" },
  coin: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#F5A623", alignItems: "center", justifyContent: "center" },
  coinT: { color: "#fff", fontWeight: "900", fontSize: 16 },
  panel: { backgroundColor: CARD, borderRadius: 12, padding: 16, marginTop: 14 },
  panelTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  panelHint: { color: "#8d8d92", fontSize: 13, fontWeight: "400" },
  stats: { flexDirection: "row", marginTop: 16 },
  statN: { color: YELLOW, fontSize: 24, fontWeight: "800" },
  statL: { color: "#fff", fontSize: 14.5, marginTop: 6 },
  banner: { height: 150, borderRadius: 8, marginTop: 14, alignItems: "center", justifyContent: "center" },
  bannerT: { color: "#fff", fontSize: 30, fontWeight: "900", fontStyle: "italic" },
  bannerS: { color: "#fff", fontSize: 11, marginTop: 4, letterSpacing: 1 },

  hint: { color: "#d0d0d4", fontSize: 15.5, textAlign: "center", marginTop: 12, marginBottom: 8 },
  small: { color: "#8d8d92", fontSize: 13 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between" },
  viralRow: { flexDirection: "row", alignItems: "center", marginVertical: 20 },
  viralIcon: { width: 64, height: 64, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  viralT: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 2 },
  segs: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  seg: { flex: 1, height: 8, backgroundColor: "#3a3a3d", borderRadius: 4, marginRight: 3 },
  count: { color: "#8d8d92", fontSize: 13, marginLeft: 8 },
  yBtn: { backgroundColor: YELLOW, borderRadius: 8, paddingVertical: 15, alignItems: "center", alignSelf: "stretch" },
  yBtnT: { color: "#000", fontSize: 18, fontWeight: "800" },
  task: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  taskT: { flex: 1, color: "#fff", fontSize: 16.5, fontWeight: "600", marginLeft: 12 },
  taskBtn: { backgroundColor: YELLOW, borderRadius: 6, paddingVertical: 9, paddingHorizontal: 22, minWidth: 82, alignItems: "center" },
  taskBtnT: { color: "#000", fontSize: 15.5, fontWeight: "800" },

  vRow: { flexDirection: "row", alignItems: "center", marginTop: 14 },
  vNum: { color: "#8d8d92", fontSize: 15, width: 18, fontWeight: "700" },
  vThumb: { width: 54, height: 72, borderRadius: 8, backgroundColor: "#2a2a2c" },
  vViews: { color: "#fff", fontSize: 15.5, fontWeight: "700" },
  vBarBg: { height: 6, borderRadius: 3, backgroundColor: "#3a3a3d", marginTop: 10, overflow: "hidden" },
  vBar: { height: 6, borderRadius: 3, backgroundColor: "#FFB21E" },
  lockedBox: { alignItems: "center", paddingHorizontal: 34, paddingTop: 70 },
  lockedTxt: { color: "#9a9a9f", fontSize: 18, fontWeight: "600", textAlign: "center", marginTop: 22, marginBottom: 26 },
});
