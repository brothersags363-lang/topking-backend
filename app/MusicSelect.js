// =====================================================================
// SELECT MUSIC (screenshot jaisa)
// ---------------------------------------------------------------------
//  X  |  Select Music  |  Local Music
//  [ Search Music ]
//  Hot   Favorites   Recently
//  rows: cover (play) / title / artist / 00:30 / ☆ / ≡
//  row tap -> preview chalta hai + kainchi (song cut) + yellow
//  "Apply and start shooting" button
//
// SMOOTH: memo rows, fixed row height (getItemLayout), ek hi audio
// player (naya gaana = purana release), progress bar UI thread par.
// =====================================================================
import useBackStep from "../utils/useBackStep";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";

import { useRouter } from "../utils/safeRouter";
import { Audio } from "../utils/audio";
import { db, auth } from "./firebaseConfig";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import FxSlider from "../components/camera/FxSlider";
import { uploadLocalAudio } from "../services/upload/reelUploadService";

const YELLOW = "#FFD60A";
const ROW_H = 67;
const APPLY_H = 56;
const FAV_KEY = "music_favorites_v1";
const RECENT_KEY = "music_recent_v1";
const TABS = ["Hot", "Favorites", "Recently"];

const first = (v) => (Array.isArray(v) ? v[0] : v);

const fmt = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

// Song doc me duration kisi bhi naam se ho sakti hai
const songDuration = (item) => {
  const d = Number(item.duration ?? item.durationSec ?? item.length ?? 0);
  if (!d) return 0;
  return d > 1000 ? d / 1000 : d;
};

async function readIds(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

// ---------------------------------------------------------------------
// ROW
// ---------------------------------------------------------------------
const MusicRow = memo(function MusicRow({
  item, selected, playing, fav, knownDuration, onPress, onFav, onMore, onCut, onApply, applying,
}) {
  const dur = songDuration(item) || knownDuration || 0;
  return (
    <View>
      <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => onPress(item)}>
        <View style={styles.cover}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.coverEmpty]}>
              <Ionicons name="musical-notes" size={20} color="#777" />
            </View>
          )}
          <View style={styles.coverPlay}>
            <Ionicons name={selected && playing ? "pause" : "play"} size={18} color="#fff" />
          </View>
        </View>

        <View style={styles.info}>
          <Text style={[styles.title, selected && { color: YELLOW }]} numberOfLines={1}>
            {item.title || "Original Audio"}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>{item.artist || " "}</Text>
          <Text style={styles.dur}>{dur ? fmt(dur) : "--:--"}</Text>
        </View>

        {selected && (
          <TouchableOpacity onPress={onCut} hitSlop={8} style={styles.iconBtn}>
            <MaterialCommunityIcons name="content-cut" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        {!item.local && (
          <TouchableOpacity onPress={() => onFav(item.id)} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name={fav ? "star" : "star-outline"} size={21} color={fav ? YELLOW : "#bbb"} />
          </TouchableOpacity>
        )}
        {!item.local && (
          <TouchableOpacity onPress={() => onMore(item)} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="reorder-three-outline" size={24} color="#bbb" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {selected && (
        <TouchableOpacity style={styles.applyBtn} activeOpacity={0.85} onPress={onApply} disabled={applying}>
          {applying ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.applyText}>Apply and start shooting</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
});

// ---------------------------------------------------------------------
// SCREEN
// ---------------------------------------------------------------------
export default function MusicSelect() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const isFocused = useIsFocused();

  const videoUri = first(params.videoUri) || "";
  const returnTo = first(params.returnTo) || "";

  const [tab, setTab] = useState("Hot");
  const [search, setSearch] = useState("");
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [favIds, setFavIds] = useState([]);
  const [recentIds, setRecentIds] = useState([]);
  const [localSongs, setLocalSongs] = useState([]);

  const [selected, setSelected] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [durations, setDurations] = useState({}); // id -> seconds (jab tak doc me na ho)
  const [cutOpen, setCutOpen] = useState(false);
  const [startSec, setStartSec] = useState(0);
  const [applying, setApplying] = useState(false);

  const soundRef = useRef(null);
  const selectedRef = useRef(null);
  selectedRef.current = selected;

  // ---------------- player (sirf ek) ----------------
  const releaseSound = useCallback(async () => {
    const s = soundRef.current;
    soundRef.current = null;
    setPlaying(false);
    if (s) {
      try { await s.stopAsync(); } catch (_) {}
      try { await s.unloadAsync(); } catch (_) {}
    }
  }, []);

  useBackStep("/", () => {
    if (cutOpen) {
      setCutOpen(false);
      return true;
    }
    releaseSound();
    return false;
  });

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false }).catch(() => {});
    return () => { releaseSound(); };
  }, [releaseSound]);

  // Screen chhodte hi gaana band (camera / EditView me OOM se bachav)
  useEffect(() => {
    if (!isFocused) releaseSound();
  }, [isFocused, releaseSound]);

  // ---------------- data ----------------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "songs"), orderBy("createdAt", "desc"), limit(300)));
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        if (alive) setSongs(list.filter((x) => x.audioUrl));
      } catch (e) {
        console.log("Load Songs Error =", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    readIds(FAV_KEY).then((v) => alive && setFavIds(v));
    readIds(RECENT_KEY).then((v) => alive && setRecentIds(v));
    return () => { alive = false; };
  }, []);

  const byId = useMemo(() => {
    const m = new Map();
    songs.forEach((s) => m.set(s.id, s));
    return m;
  }, [songs]);

  const favSet = useMemo(() => new Set(favIds), [favIds]);

  const data = useMemo(() => {
    let list;
    if (tab === "Favorites") list = favIds.map((id) => byId.get(id)).filter(Boolean);
    else if (tab === "Recently") list = [...localSongs, ...recentIds.map((id) => byId.get(id)).filter(Boolean)];
    else list = [...songs].sort((a, b) => (Number(b.uses) || 0) - (Number(a.uses) || 0));

    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => `${s.title || ""} ${s.artist || ""}`.toLowerCase().includes(q));
    return list;
  }, [tab, songs, favIds, recentIds, byId, search, localSongs]);

  // ---------------- actions ----------------
  const playFrom = useCallback(async (item, fromSec = 0) => {
    await releaseSound();
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: item.audioUrl },
        { shouldPlay: false, isLooping: true, volume: 1, progressUpdateIntervalMillis: 500 }
      );
      if (selectedRef.current?.id !== item.id) {
        sound.unloadAsync().catch(() => {});
        return;
      }
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((st) => {
        if (!st.isLoaded) return;
        if (st.durationMillis > 0) {
          setDurations((d) => (d[item.id] ? d : { ...d, [item.id]: st.durationMillis / 1000 }));
        }
        setPlaying(!!st.isPlaying);
      });
      if (fromSec > 0) await sound.setPositionAsync(fromSec * 1000).catch(() => {});
      await sound.playAsync();
      setPlaying(true);
    } catch (e) {
      console.log("preview error", e);
    }
  }, [releaseSound]);

  const onRowPress = useCallback(async (item) => {
    Keyboard.dismiss();
    if (!item.audioUrl) {
      Alert.alert("Audio Missing", "Music file not found");
      return;
    }
    // same row = play / pause
    if (selectedRef.current?.id === item.id && soundRef.current) {
      const st = await soundRef.current.getStatusAsync();
      if (st.isPlaying) await soundRef.current.pauseAsync();
      else await soundRef.current.playAsync();
      setPlaying(!st.isPlaying);
      return;
    }
    setSelected(item);
    selectedRef.current = item;
    setStartSec(0);
    playFrom(item, 0);
  }, [playFrom]);

  const toggleFav = useCallback((id) => {
    setFavIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      AsyncStorage.setItem(FAV_KEY, JSON.stringify(next.slice(0, 200))).catch(() => {});
      return next;
    });
  }, []);

  const openDetails = useCallback((item) => {
    releaseSound();
    router.push({
      pathname: "/musicDetails",
      params: {
        musicId: item.id,
        audioUrl: item.audioUrl,
        musicName: item.title || "Original Music",
        username: item.artist || "",
        profile: item.image || "",
        musicArtist: item.artist || "",
        musicImage: item.image || "",
      },
    });
  }, [router, releaseSound]);

  const pickLocal = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      if (a.size && a.size > 20 * 1024 * 1024) {
        Alert.alert("Local Music", "20 MB se chhota gaana chuniye.");
        return;
      }
      const item = {
        id: `local-${Date.now()}`,
        local: true,
        title: (a.name || "My music").replace(/\.[^.]+$/, ""),
        artist: "Local Music",
        audioUrl: a.uri,
        mimeType: a.mimeType || "audio/mpeg",
      };
      setLocalSongs((l) => [item, ...l]);
      setTab("Recently");
      setSelected(item);
      selectedRef.current = item;
      setStartSec(0);
      playFrom(item, 0);
    } catch (e) {
      Alert.alert("Local Music", "Gaana select nahi ho saka.");
    }
  }, [playFrom]);

  const applyCut = useCallback((sec) => {
    setStartSec(sec);
    const item = selectedRef.current;
    if (item) playFrom(item, sec);
  }, [playFrom]);

  const apply = useCallback(async () => {
    const item = selectedRef.current;
    if (!item || applying) return;
    setApplying(true);
    try {
      let audioUrl = item.audioUrl;
      if (item.local) {
        const user = auth.currentUser;
        if (!user) throw new Error("Pehle login karein");
        const token = await user.getIdToken();
        audioUrl = await uploadLocalAudio(item.audioUrl, item.mimeType, token);
      } else {
        setRecentIds((prev) => {
          const next = [item.id, ...prev.filter((x) => x !== item.id)].slice(0, 30);
          AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        });
      }

      await releaseSound();

      const musicParams = {
        musicId: item.local ? "" : item.id,
        musicName: item.title || "Original Audio",
        musicTitle: item.title || "Original Audio",
        musicArtist: item.artist || "",
        musicImage: item.image || "",
        audioUrl,
        musicStart: String(startSec || 0),
      };

      // Camera se aaye (video abhi bani nahi) -> camera par wapas
      if (returnTo === "/camera" || !videoUri) {
        if (!videoUri && returnTo !== "/camera") {
          router.push({ pathname: "/camera", params: musicParams });
        } else {
          router.replace({ pathname: "/camera", params: musicParams });
        }
        return;
      }

      const editParams = { videoUri, videoDuration: first(params.videoDuration) || "", ...musicParams };
      // EditView se aaye ho to usi EditView par wapas (trim/text/voice safe)
      if (returnTo === "/EditView") router.navigate({ pathname: "/EditView", params: editParams });
      else router.push({ pathname: "/EditView", params: editParams });
    } catch (e) {
      Alert.alert("Music", e?.message || "Gaana lagaya nahi ja saka.");
    } finally {
      setApplying(false);
    }
  }, [applying, releaseSound, startSec, returnTo, videoUri, router, params.videoDuration]);

  const close = useCallback(() => {
    releaseSound();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router, releaseSound]);

  // ---------------- list ----------------
  const selectedId = selected?.id;
  const selectedIndex = useMemo(() => data.findIndex((d) => d.id === selectedId), [data, selectedId]);

  const renderItem = useCallback(
    ({ item }) => (
      <MusicRow
        item={item}
        selected={item.id === selectedId}
        playing={item.id === selectedId && playing}
        fav={favSet.has(item.id)}
        knownDuration={durations[item.id]}
        onPress={onRowPress}
        onFav={toggleFav}
        onMore={openDetails}
        onCut={() => setCutOpen(true)}
        onApply={apply}
        applying={applying}
      />
    ),
    [selectedId, playing, favSet, durations, onRowPress, toggleFav, openDetails, apply, applying]
  );

  const getItemLayout = useCallback(
    (_, index) => {
      const extra = selectedIndex >= 0 && index > selectedIndex ? APPLY_H : 0;
      const len = ROW_H + (index === selectedIndex ? APPLY_H : 0);
      return { length: len, offset: ROW_H * index + extra, index };
    },
    [selectedIndex]
  );

  const selDuration = selected ? songDuration(selected) || durations[selected.id] || 0 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={close} hitSlop={10} style={styles.headerSide}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Music</Text>
        <TouchableOpacity onPress={pickLocal} hitSlop={10} style={[styles.headerSide, { alignItems: "flex-end" }]}>
          <Text style={styles.localText}>Local Music</Text>
        </TouchableOpacity>
      </View>

      {/* SEARCH */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color="#999" />
        <TextInput
          placeholder="Search Music"
          placeholderTextColor="#888"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color="#888" />
          </TouchableOpacity>
        )}
      </View>

      {/* TABS */}
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={styles.tabBtn}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t}</Text>
            {tab === t && <View style={styles.tabLine} />}
          </TouchableOpacity>
        ))}
      </View>

      {loading && songs.length === 0 ? (
        <ActivityIndicator color={YELLOW} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          extraData={selectedIndex}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={9}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === "Favorites" ? "☆ dabakar gaane favorite karein" : tab === "Recently" ? "Abhi koi gaana use nahi hua" : "Koi gaana nahi mila"}
            </Text>
          }
        />
      )}

      {/* SONG CUT (kainchi): gaana kahan se shuru ho */}
      <Modal visible={cutOpen} transparent animationType="slide" onRequestClose={() => setCutOpen(false)}>
        <TouchableOpacity style={styles.cutBackdrop} activeOpacity={1} onPress={() => setCutOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.cutSheet, { paddingBottom: insets.bottom + 18 }]}>
            <Text style={styles.cutTitle}>Gaana kahan se shuru ho?</Text>
            <Text style={styles.cutSub}>
              Start: {fmt(startSec)} {selDuration ? `/ ${fmt(selDuration)}` : ""}
            </Text>
            <FxSlider
              min={0}
              max={Math.max(1, Math.floor((selDuration || 60) - 5))}
              value={startSec}
              color={YELLOW}
              onEnd={applyCut}
            />
            <TouchableOpacity style={styles.cutDone} onPress={() => setCutOpen(false)}>
              <Text style={styles.applyText}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#151515" },
  header: { height: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  headerSide: { width: 90 },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  localText: { color: YELLOW, fontSize: 13, fontWeight: "600" },
  searchBox: {
    flexDirection: "row", alignItems: "center", marginHorizontal: 14, marginTop: 4, height: 38,
    borderRadius: 19, backgroundColor: "#3a3a3a", paddingHorizontal: 12, gap: 8,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, paddingVertical: 0 },
  tabs: {
    flexDirection: "row", justifyContent: "center", gap: 12, marginTop: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#2c2c2c",
  },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 10, alignItems: "center" },
  tabText: { color: "#999", fontSize: 14 },
  tabTextOn: { color: "#fff", fontWeight: "700" },
  tabLine: { position: "absolute", bottom: 4, width: 12, height: 2, borderRadius: 1, backgroundColor: "#fff" },

  row: { height: ROW_H, flexDirection: "row", alignItems: "center", paddingHorizontal: 14 },
  cover: { width: 50, height: 50, borderRadius: 3, overflow: "hidden", backgroundColor: "#2a2a2a" },
  coverEmpty: { alignItems: "center", justifyContent: "center" },
  coverPlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
  info: { flex: 1, marginLeft: 8 },
  title: { color: "#fff", fontSize: 14, fontWeight: "500" },
  artist: { color: "#aaa", fontSize: 11, marginTop: 2 },
  dur: { color: "#aaa", fontSize: 11, marginTop: 3 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },

  applyBtn: {
    height: APPLY_H - 16, marginHorizontal: 10, marginVertical: 8, borderRadius: 4, backgroundColor: YELLOW,
    alignItems: "center", justifyContent: "center",
  },
  applyText: { color: "#000", fontSize: 14, fontWeight: "700" },
  empty: { color: "#777", textAlign: "center", marginTop: 50 },

  cutBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  cutSheet: { backgroundColor: "#1e1e1e", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 18 },
  cutTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cutSub: { color: "#aaa", fontSize: 13, marginTop: 4, marginBottom: 6 },
  cutDone: { height: 44, borderRadius: 6, backgroundColor: YELLOW, alignItems: "center", justifyContent: "center", marginTop: 16 },
});
