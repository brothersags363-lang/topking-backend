// components/live/RoomMusic.js
// Live room ka song system (Agora Audio Mixing).
//
//   engine.startAudioMixing(path, loopback=false, cycle=1)
//   loopback=false => song bajane wale ko bhi sunayi deta hai AUR channel me sabko bhi.
//
// Sirf Host / Speaker (broadcaster) hi baja sakte hain (unka hi audio publish hota hai).
//
// SMOOTH / FAST design:
//  - Progress (position) ka state LiveRoom me NAHI hai -> song bajte waqt room re-render nahi hota.
//    Position sirf tab poll hota hai jab song sheet khula ho.
//  - Song khatam hone ka pata Agora event se chalta hai (polling nahi).
//  - Song list ek baar fetch hoti hai aur app me cache rehti hai (dobara kholne par instant).
//  - Koi extra native package nahi (slider apna hai) -> naya build / dependency ki zarurat nahi.
//  - Double-tap / fast song change safe (busy lock).

import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  PanResponder,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Asset } from "expo-asset";
import * as DocumentPicker from "expo-document-picker";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "../../app/firebaseConfig";
import { musicData } from "../../assets/musicData";

const { height } = Dimensions.get("window");

// Agora AudioMixingStateType
const MIX_STOPPED = 713;
const MIX_FAILED = 714;

// ---------------------------------------------------------------
// Song list (cache) : Firestore "songs" + local assets/music
// ---------------------------------------------------------------
let SONG_CACHE = null;
let SONG_PROMISE = null;
const LOCAL_PATH_CACHE = new Map();
const PICKED = []; // phone/gallery se chune hue songs (is session me dobara bajane ke liye)

function loadSongsOnce() {
  if (SONG_CACHE) return Promise.resolve(SONG_CACHE);
  if (SONG_PROMISE) return SONG_PROMISE;

  SONG_PROMISE = (async () => {
    const out = [];
    let firestoreOk = true;
    try {
      const q = query(collection(db, "songs"), orderBy("createdAt", "desc"), limit(60));
      const snap = await getDocs(q);
      snap.forEach((d) => {
        const data = d.data();
        if (data?.audioUrl) {
          out.push({
            id: "fs_" + d.id,
            title: data.title || "Song",
            artist: data.artist || data.category || "",
            uri: data.audioUrl,
          });
        }
      });
    } catch (e) {
      firestoreOk = false;
      console.log("RoomMusic: songs load error", e?.message || e);
    }

    musicData.forEach((m) => {
      out.push({ id: "local_" + m.id, title: m.title, artist: m.category || "", localModule: m.url });
    });

    // Firestore fail hua to cache nahi karte -> agli baar dobara try hoga
    if (firestoreOk) SONG_CACHE = out;
    SONG_PROMISE = null;
    return out;
  })();

  return SONG_PROMISE;
}

// require() asset ko Agora ke liye file path me badalna (ek baar, phir cache)
async function resolveUri(song) {
  if (song.uri) {
    let u = song.uri;
    if (u.startsWith("file://")) {
      u = u.replace("file://", "");
      try { u = decodeURIComponent(u); } catch (_) {} // space/%20 wale naam ke liye
    }
    return u;
  }
  if (LOCAL_PATH_CACHE.has(song.id)) return LOCAL_PATH_CACHE.get(song.id);
  const asset = Asset.fromModule(song.localModule);
  if (!asset.localUri) await asset.downloadAsync();
  let p = asset.localUri || asset.uri;
  if (p && p.startsWith("file://")) p = p.replace("file://", "");
  LOCAL_PATH_CACHE.set(song.id, p);
  return p;
}

// ---------------------------------------------------------------
// HOOK -> LiveRoom me: const music = useRoomMusic(agoraEngineRef);
// ---------------------------------------------------------------
export function useRoomMusic(engineRef) {
  const [appSongs, setSongs] = useState(SONG_CACHE || []);
  const [picked, setPicked] = useState(PICKED.slice());
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [current, setCurrent] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [volume, setVolumeState] = useState(60);
  const [error, setError] = useState("");

  const playingRef = useRef(false);
  const busyRef = useRef(false);
  const volumeRef = useRef(60);
  const ignoreStopUntil = useRef(0);
  const handlerRef = useRef(null);
  const handlerEngineRef = useRef(null);
  const errTimer = useRef(null);

  const flashError = useCallback((msg) => {
    setError(msg);
    if (errTimer.current) clearTimeout(errTimer.current);
    errTimer.current = setTimeout(() => setError(""), 3500);
  }, []);

  const resetState = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    setCurrent(null);
  }, []);

  // Agora event: song khatam / fail
  const ensureHandler = useCallback(
    (engine) => {
      if (handlerEngineRef.current === engine) return;
      try {
        if (handlerEngineRef.current && handlerRef.current) {
          handlerEngineRef.current.unregisterEventHandler(handlerRef.current);
        }
      } catch (_) {}
      const h = {
        onAudioMixingStateChanged: (state) => {
          if (state === MIX_FAILED) {
            resetState();
            flashError("Ye song nahi chal paaya, doosra try karo");
          } else if (state === MIX_STOPPED && playingRef.current && Date.now() > ignoreStopUntil.current) {
            resetState(); // song poora bajkar khatam
          }
        },
      };
      try { engine.registerEventHandler(h); } catch (_) {}
      handlerRef.current = h;
      handlerEngineRef.current = engine;
    },
    [resetState, flashError]
  );

  const fetchSongs = useCallback(async () => {
    if (SONG_CACHE) { setSongs(SONG_CACHE); return; }
    setLoadingSongs(true);
    try { setSongs(await loadSongsOnce()); } finally { setLoadingSongs(false); }
  }, []);

  const play = useCallback(
    async (song) => {
      const e = engineRef.current;
      if (!e) { flashError("Room abhi connect ho raha hai, thodi der baad try karo"); return; }
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError("");
      try {
        ensureHandler(e);
        ignoreStopUntil.current = Date.now() + 1500; // purane song ka "stopped" event ignore
        try { await e.stopAudioMixing(); } catch (_) {}
        const path = await resolveUri(song);
        const res = await e.startAudioMixing(path, false, 1);
        if (typeof res === "number" && res < 0) throw new Error("code " + res);
        try { await e.adjustAudioMixingVolume(volumeRef.current); } catch (_) {}
        playingRef.current = true;
        setCurrent(song);
        setPlaying(true);
      } catch (err) {
        console.log("RoomMusic play error:", err?.message || err);
        resetState();
        flashError("Song play nahi ho paaya");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [engineRef, ensureHandler, resetState, flashError]
  );

  // ===== PHONE / GALLERY se song chunna =====
  const pickFromPhone = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["audio/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets || !res.assets.length) return;
      const a = res.assets[0];
      const song = {
        id: "dev_" + Date.now(),
        title: (a.name || "Song").replace(/\.[^/.]+$/, ""),
        artist: "Phone",
        uri: a.uri,
      };
      PICKED.unshift(song);
      if (PICKED.length > 30) PICKED.pop();
      setPicked(PICKED.slice());
      await play(song);
    } catch (err) {
      console.log("RoomMusic pick error:", err?.message || err);
      flashError("Song select nahi ho paaya");
    }
  }, [play, flashError]);

  const songs = useMemo(() => [...picked, ...appSongs], [picked, appSongs]);

  const pause = useCallback(async () => {
    try { await engineRef.current?.pauseAudioMixing(); } catch (_) {}
    setPlaying(false);
    playingRef.current = false;
  }, [engineRef]);

  const resume = useCallback(async () => {
    try { await engineRef.current?.resumeAudioMixing(); } catch (_) {}
    playingRef.current = true;
    setPlaying(true);
  }, [engineRef]);

  const stop = useCallback(async () => {
    playingRef.current = false; // event ko ignore karne ke liye pehle
    try { await engineRef.current?.stopAudioMixing(); } catch (_) {}
    setPlaying(false);
    setCurrent(null);
  }, [engineRef]);

  const setVolume = useCallback(
    async (v) => {
      const val = Math.max(0, Math.min(100, Math.round(v)));
      volumeRef.current = val;
      setVolumeState(val);
      try { await engineRef.current?.adjustAudioMixingVolume(val); } catch (_) {}
    },
    [engineRef]
  );

  const seek = useCallback(
    async (ms) => {
      try { await engineRef.current?.setAudioMixingPosition(Math.round(ms)); } catch (_) {}
    },
    [engineRef]
  );

  // Sheet isse position/duration poll karti hai (LiveRoom state me nahi jata)
  const getProgress = useCallback(async () => {
    const e = engineRef.current;
    if (!e) return { pos: 0, dur: 0 };
    let pos = 0, dur = 0;
    try { pos = await e.getAudioMixingCurrentPosition(); } catch (_) {}
    try { dur = await e.getAudioMixingDuration(); } catch (_) {}
    return { pos: pos > 0 ? pos : 0, dur: dur > 0 ? dur : 0 };
  }, [engineRef]);

  // room se nikalte hi song band + handler hatao
  useEffect(
    () => () => {
      if (errTimer.current) clearTimeout(errTimer.current);
      try { engineRef.current?.stopAudioMixing(); } catch (_) {}
      try {
        if (handlerEngineRef.current && handlerRef.current) {
          handlerEngineRef.current.unregisterEventHandler(handlerRef.current);
        }
      } catch (_) {}
    },
    [engineRef]
  );

  return {
    songs, loadingSongs, fetchSongs,
    current, playing, busy, volume, error,
    play, pause, resume, stop, setVolume, seek, getProgress, pickFromPhone,
  };
}

// ---------------------------------------------------------------
// Gift button ke upar floating music button
// ---------------------------------------------------------------
export const MusicFab = memo(function MusicFab({ onPress, playing, style }) {
  return (
    <TouchableOpacity style={[s.fab, playing && s.fabOn, style]} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name={playing ? "musical-notes" : "musical-note-outline"} size={22} color="#fff" />
    </TouchableOpacity>
  );
});

const fmt = (ms) => {
  const t = Math.floor((ms || 0) / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

// ---------------------------------------------------------------
// Chhota slider (koi package nahi chahiye)
// ---------------------------------------------------------------
const Bar = memo(function Bar({ value, max, onCommit, disabled }) {
  const [drag, setDrag] = useState(null);
  const wRef = useRef(1);
  const startX = useRef(0);
  const maxRef = useRef(max);
  const commitRef = useRef(onCommit);
  const disabledRef = useRef(disabled);
  maxRef.current = max;
  commitRef.current = onCommit;
  disabledRef.current = disabled;

  const ratio = (x) => Math.min(1, Math.max(0, x / (wRef.current || 1)));

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        startX.current = e.nativeEvent.locationX;
        setDrag(ratio(startX.current));
      },
      onPanResponderMove: (_, g) => setDrag(ratio(startX.current + g.dx)),
      onPanResponderRelease: (_, g) => {
        const r = ratio(startX.current + g.dx);
        setDrag(null);
        if (commitRef.current) commitRef.current(r * maxRef.current);
      },
      onPanResponderTerminate: () => setDrag(null),
    })
  ).current;

  const r = drag != null ? drag : max > 0 ? Math.min(1, value / max) : 0;

  return (
    <View
      style={s.barHit}
      onLayout={(e) => { wRef.current = e.nativeEvent.layout.width; }}
      {...pan.panHandlers}
    >
      <View style={s.barTrack} pointerEvents="none">
        <View style={[s.barFill, { width: `${r * 100}%` }]} />
      </View>
      <View pointerEvents="none" style={[s.barThumb, { left: `${r * 100}%` }]} />
    </View>
  );
});

// ---------------------------------------------------------------
// Song select sheet
// ---------------------------------------------------------------
export const MusicSheet = memo(function MusicSheet({ visible, onClose, onReopen, music, micMuted, onToggleMic }) {
  const [search, setSearch] = useState("");

  // Picker system screen hai -> pehle sheet band, phir picker, phir sheet wapas (iOS me Modal ke upar picker nahi khulta)
  const handlePick = () => {
    onClose();
    setTimeout(async () => {
      await music.pickFromPhone();
      if (onReopen) onReopen();
    }, 350);
  };
  const [prog, setProg] = useState({ pos: 0, dur: 0 });

  useEffect(() => {
    if (visible) music.fetchSongs();
  }, [visible]); // eslint-disable-line

  // position sirf tab poll hoti hai jab sheet khula ho aur song chal raha ho
  useEffect(() => {
    if (!visible || !music.current) { setProg({ pos: 0, dur: 0 }); return; }
    let alive = true;
    const tick = async () => {
      const p = await music.getProgress();
      if (alive) setProg((old) => (old.pos === p.pos && old.dur === p.dur ? old : p));
    };
    tick();
    if (!music.playing) return () => { alive = false; };
    const id = setInterval(tick, 500);
    return () => { alive = false; clearInterval(id); };
  }, [visible, music.playing, music.current?.id]); // eslint-disable-line

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return music.songs;
    return music.songs.filter((x) => (x.title + " " + (x.artist || "")).toLowerCase().includes(q));
  }, [music.songs, search]);

  const renderItem = useCallback(
    ({ item }) => {
      const active = music.current?.id === item.id;
      return (
        <TouchableOpacity
          style={[s.row, active && s.rowActive]}
          onPress={() => (active ? (music.playing ? music.pause() : music.resume()) : music.play(item))}
          disabled={music.busy}
          activeOpacity={0.7}
        >
          <View style={s.rowIcon}>
            <Ionicons name={active && music.playing ? "pause" : "play"} size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle} numberOfLines={1}>{item.title}</Text>
            {!!item.artist && <Text style={s.rowSub} numberOfLines={1}>{item.artist}</Text>}
          </View>
          {active && <Ionicons name="volume-high" size={18} color="#ff4d8d" />}
        </TouchableOpacity>
      );
    },
    [music.current, music.playing, music.busy] // eslint-disable-line
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <View style={s.sheet} onStartShouldSetResponder={() => true}>
          <View style={s.header}>
            <Text style={s.title}>Room Music</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <Text style={s.hint}>Jo song aap bajayenge wo aapko aur room ke sabhi users ko sunayi dega.</Text>

          {micMuted && (
            <TouchableOpacity style={s.warn} onPress={onToggleMic} activeOpacity={0.8}>
              <Ionicons name="mic-off" size={16} color="#fbbf24" />
              <Text style={s.warnText}>Aapka mic mute hai - mute me room ko song sunayi nahi dega. Mic ON karne ke liye tap karo.</Text>
            </TouchableOpacity>
          )}

          {!!music.error && (
            <View style={s.err}>
              <Text style={s.errText}>{music.error}</Text>
            </View>
          )}

          <TouchableOpacity style={s.pickBtn} onPress={handlePick} activeOpacity={0.8} disabled={music.busy}>
            <Ionicons name="folder-open" size={20} color="#fff" />
            <Text style={s.pickText}>Phone / Gallery se song chuno</Text>
          </TouchableOpacity>

          <View style={s.searchBox}>
            <Ionicons name="search" size={16} color="#9ca3af" />
            <TextInput
              style={s.searchInput}
              placeholder="Song search karo"
              placeholderTextColor="#9ca3af"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {music.loadingSongs ? (
            <ActivityIndicator color="#ff4d8d" style={{ marginTop: 30 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(i) => i.id}
              renderItem={renderItem}
              extraData={music.current?.id + ":" + music.playing + ":" + music.busy}
              style={{ flexGrow: 0, maxHeight: height * 0.36 }}
              initialNumToRender={10}
              windowSize={5}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={s.empty}>Koi song nahi mila</Text>}
            />
          )}

          {music.current && (
            <View style={s.player}>
              <Text style={s.nowTitle} numberOfLines={1}>{music.current.title}</Text>

              <View style={s.seekRow}>
                <Text style={s.time}>{fmt(prog.pos)}</Text>
                <Bar value={prog.pos} max={prog.dur} disabled={!prog.dur} onCommit={(ms) => { setProg((p) => ({ ...p, pos: ms })); music.seek(ms); }} />
                <Text style={s.time}>{fmt(prog.dur)}</Text>
              </View>

              <View style={s.ctrlRow}>
                <TouchableOpacity onPress={music.playing ? music.pause : music.resume} style={s.ctrlBtn}>
                  <Ionicons name={music.playing ? "pause" : "play"} size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={music.stop} style={[s.ctrlBtn, { backgroundColor: "#e74c3c" }]}>
                  <Ionicons name="stop" size={22} color="#fff" />
                </TouchableOpacity>
                <Ionicons name="volume-low" size={18} color="#9ca3af" style={{ marginLeft: 10 }} />
                <Bar value={music.volume} max={100} onCommit={music.setVolume} />
                <Ionicons name="volume-high" size={18} color="#9ca3af" />
              </View>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
});

const s = StyleSheet.create({
  fab: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 50,
  },
  fabOn: { backgroundColor: "#ff4d8d", borderColor: "#ff4d8d" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#111827",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    paddingBottom: 28,
    maxHeight: height * 0.85,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  hint: { color: "#9ca3af", fontSize: 12, marginTop: 4, marginBottom: 10 },
  warn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(251,191,36,0.12)",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  warnText: { color: "#fbbf24", fontSize: 12, marginLeft: 8, flex: 1 },
  err: { backgroundColor: "rgba(231,76,60,0.15)", borderRadius: 10, padding: 10, marginBottom: 8 },
  errText: { color: "#f87171", fontSize: 12 },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ff4d8d",
    borderRadius: 12,
    height: 44,
    marginBottom: 10,
  },
  pickText: { color: "#fff", fontWeight: "bold", fontSize: 14, marginLeft: 8 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 8,
  },
  searchInput: { flex: 1, color: "#fff", marginLeft: 8, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 6, borderRadius: 12 },
  rowActive: { backgroundColor: "rgba(255,77,141,0.12)" },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rowTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  rowSub: { color: "#9ca3af", fontSize: 12, marginTop: 2 },
  empty: { color: "#9ca3af", textAlign: "center", marginTop: 24 },
  player: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
  nowTitle: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  seekRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  time: { color: "#9ca3af", fontSize: 11, width: 36, textAlign: "center" },
  ctrlRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  ctrlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ff4d8d",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  // slider
  barHit: { flex: 1, height: 32, justifyContent: "center", marginHorizontal: 6 },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" },
  barFill: { height: 4, backgroundColor: "#ff4d8d" },
  barThumb: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    backgroundColor: "#ff4d8d",
  },
});
