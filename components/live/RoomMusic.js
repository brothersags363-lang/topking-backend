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
//  - Double-tap / fast song change safe (busy lock, last request wins).
//  - PLAYLIST: ek baar me max 10 songs select -> Play -> 1..10 chalte hain,
//    aakhri ke baad wapas 1 se (repeat all). Next / Prev / seek / repeat mode.

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
import { AudioMixingStateType, AudioMixingReasonType } from "react-native-agora";
import * as DocumentPicker from "expo-document-picker";

const { height } = Dimensions.get("window");

// Agora AudioMixingStateType / Reason (enum na mile to number fallback)
const MIX_STOPPED = AudioMixingStateType?.AudioMixingStateStopped ?? 713;
const MIX_FAILED = AudioMixingStateType?.AudioMixingStateFailed ?? 714;
const RS_ALL_LOOPS = AudioMixingReasonType?.AudioMixingReasonAllLoopsCompleted ?? 723;
const MAX_SONGS = 10; // ek baar me max songs (playlist)

// ---------------------------------------------------------------
// Songs: sirf phone / gallery se chune hue (app ke andar ke songs hata diye)
// ---------------------------------------------------------------
const PICKED = []; // phone se chune hue songs (is session me dobara bajane ke liye)

// file:// path ko Agora ke liye plain path me badalna (space/%20 wale naam ke liye decode)
async function resolveUri(song) {
  let u = song.uri || "";
  if (u.startsWith("file://")) {
    u = u.replace("file://", "");
    try { u = decodeURIComponent(u); } catch (_) {}
  }
  return u;
}

// ---------------------------------------------------------------
// HOOK -> LiveRoom me: const music = useRoomMusic(agoraEngineRef);
// ---------------------------------------------------------------
export function useRoomMusic(engineRef) {
  const [picked, setPicked] = useState(PICKED.slice());
  const [current, setCurrent] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [volume, setVolumeState] = useState(60);
  const [error, setError] = useState("");
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [repeat, setRepeat] = useState("all"); // all | one | off

  const queueRef = useRef([]);
  const indexRef = useRef(0);
  const repeatRef = useRef("all");
  const failRef = useRef(0);
  const wantRef = useRef(null);
  const playAtRef = useRef(null);
  const advanceRef = useRef(null);

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
        onAudioMixingStateChanged: (state, reason) => {
          if (state === MIX_FAILED) {
            failRef.current += 1;
            if (failRef.current < Math.max(1, queueRef.current.length)) {
              setTimeout(() => advanceRef.current && advanceRef.current(true), 0); // kharab song skip
            } else {
              failRef.current = 0;
              resetState();
              flashError("Ye song nahi chal paaya, doosra try karo");
            }
          } else if (state === MIX_STOPPED && playingRef.current) {
            // sirf "poora bajkar khatam" par agla song (manual stop/next par nahi)
            const done = reason === RS_ALL_LOOPS ||
              (reason == null && Date.now() > ignoreStopUntil.current);
            if (done) setTimeout(() => advanceRef.current && advanceRef.current(false), 0);
          }
        },
      };
      try { engine.registerEventHandler(h); } catch (_) {}
      handlerRef.current = h;
      handlerEngineRef.current = engine;
    },
    [resetState, flashError]
  );

  // purane code ke liye (LiveRoom isse call karta hai) - ab koi loading nahi
  const fetchSongs = useCallback(() => {}, []);

  // Queue ka i-th song bajao (listOverride ho to wahi nayi queue ban jati hai)
  const playAt = useCallback(
    async (i, listOverride) => {
      const q = listOverride || queueRef.current;
      if (!q.length) return;
      const e = engineRef.current;
      if (!e) { flashError("Room abhi connect ho raha hai, thodi der baad try karo"); return; }
      if (busyRef.current) { wantRef.current = { i, list: listOverride || null }; return; } // last request jeetegi
      busyRef.current = true;
      setBusy(true);
      setError("");
      const idx = ((i % q.length) + q.length) % q.length;
      const song = q[idx];
      let failed = false;
      try {
        ensureHandler(e);
        if (listOverride) { queueRef.current = listOverride; setQueue(listOverride); }
        ignoreStopUntil.current = Date.now() + 1500; // purane song ka "stopped" event ignore
        try { await e.stopAudioMixing(); } catch (_) {}
        const path = await resolveUri(song);
        const res = await e.startAudioMixing(path, false, 1);
        if (typeof res === "number" && res < 0) throw new Error("code " + res);
        try { await e.adjustAudioMixingVolume(volumeRef.current); } catch (_) {}
        indexRef.current = idx;
        setIndex(idx);
        playingRef.current = true;
        failRef.current = 0;
        setCurrent(song);
        setPlaying(true);
      } catch (err) {
        console.log("RoomMusic play error:", err?.message || err);
        failed = true;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
      const want = wantRef.current;
      if (want) { wantRef.current = null; return playAtRef.current(want.i, want.list); }
      if (failed) {
        failRef.current += 1;
        if (failRef.current < q.length) return playAtRef.current(idx + 1); // is song ko chhod ke agla
        failRef.current = 0;
        resetState();
        flashError("Song play nahi ho paaya");
      }
    },
    [engineRef, ensureHandler, resetState, flashError]
  );
  playAtRef.current = playAt;

  // song khatam / skip hone par agla
  const advance = useCallback((skipping) => {
    const q = queueRef.current;
    if (!q.length) return;
    const i = indexRef.current;
    const mode = repeatRef.current;
    if (mode === "one" && !skipping) return playAtRef.current(i);
    if (mode === "off" && !skipping && i >= q.length - 1) {
      playingRef.current = false;
      setPlaying(false);
      return;
    }
    return playAtRef.current(i + 1); // aakhri ke baad 0 par wapas
  }, []);
  advanceRef.current = advance;

  const playList = useCallback((list) => {
    const q = (list || []).slice(0, MAX_SONGS);
    if (!q.length) return;
    failRef.current = 0;
    playAtRef.current(0, q);
  }, []);

  const play = useCallback((song) => playList([song]), [playList]);
  const next = useCallback(() => playAtRef.current(indexRef.current + 1), []);

  const cycleRepeat = useCallback(() => {
    const n = repeatRef.current === "all" ? "one" : repeatRef.current === "one" ? "off" : "all";
    repeatRef.current = n;
    setRepeat(n);
  }, []);

  // ===== PHONE / GALLERY se song chunna =====
  const pickFromPhone = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["audio/*"],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (res.canceled || !res.assets || !res.assets.length) return;
      const stamp = Date.now();
      const added = res.assets.slice(0, MAX_SONGS).map((a, n) => ({
        id: "dev_" + stamp + "_" + n,
        title: (a.name || "Song").replace(/\.[^/.]+$/, "").replace(/_+/g, " ").trim(),
        artist: "Phone",
        uri: a.uri,
      }));
      for (let n = added.length - 1; n >= 0; n--) PICKED.unshift(added[n]);
      while (PICKED.length > 40) PICKED.pop();
      setPicked(PICKED.slice());
      playList(added); // chune hue (max 10) seedha 1..N bajne lagte hain
    } catch (err) {
      console.log("RoomMusic pick error:", err?.message || err);
      flashError("Song select nahi ho paaya");
    }
  }, [playList, flashError]);

  const songs = picked;

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
    wantRef.current = null;
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

  // 3 sec se zyada chal chuka ho to usi song ko shuru se, warna pichla song
  const prev = useCallback(async () => {
    const p = await getProgress();
    if (p.pos > 3000) { seek(0); return; }
    playAtRef.current(indexRef.current - 1);
  }, [getProgress, seek]);

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
    songs, loadingSongs: false, fetchSongs,
    current, playing, busy, volume, error,
    queue, index, repeat,
    play, playList, playAt, next, prev, cycleRepeat,
    pause, resume, stop, setVolume, seek, getProgress, pickFromPhone,
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
// Song select sheet (multi-select 10 + playlist player)
// ---------------------------------------------------------------
const ROW_H = 56;
const getItemLayout = (_d, i) => ({ length: ROW_H, offset: ROW_H * i, index: i });

const SongRow = memo(function SongRow({ item, order, active, playing, busy, onToggle, onPlayOne }) {
  return (
    <TouchableOpacity
      style={[s.row, active && s.rowActive]}
      onPress={() => onToggle(item.id)}
      activeOpacity={0.7}
    >
      <View style={[s.chk, !!order && s.chkOn]}>
        {!!order && <Text style={s.chkTxt}>{order}</Text>}
      </View>
      <View style={{ flex: 1, marginHorizontal: 12 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{item.title}</Text>
        {!!item.artist && <Text style={s.rowSub} numberOfLines={1}>{item.artist}</Text>}
      </View>
      <TouchableOpacity
        onPress={() => onPlayOne(item)}
        disabled={busy}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={s.rowPlay}
      >
        <Ionicons name={active && playing ? "volume-high" : "play"} size={16} color={active ? "#ff4d8d" : "#fff"} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

const QueueRow = memo(function QueueRow({ item, i, active, playing, onPress }) {
  return (
    <TouchableOpacity style={[s.row, active && s.rowActive]} onPress={() => onPress(i)} activeOpacity={0.7}>
      <View style={s.qNum}>
        {active
          ? <Ionicons name={playing ? "volume-high" : "pause"} size={16} color="#ff4d8d" />
          : <Text style={s.qNumTxt}>{i + 1}</Text>}
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[s.rowTitle, active && { color: "#ff4d8d" }]} numberOfLines={1}>{item.title}</Text>
        {!!item.artist && <Text style={s.rowSub} numberOfLines={1}>{item.artist}</Text>}
      </View>
    </TouchableOpacity>
  );
});

export const MusicSheet = memo(function MusicSheet({ visible, onClose, onReopen, music, micMuted, onToggleMic }) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("songs"); // songs | queue
  const [sel, setSel] = useState([]);      // selected song ids (select karne ke order me)
  const [note, setNote] = useState("");

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

  const selMap = useMemo(() => {
    const m = {};
    sel.forEach((id, i) => { m[id] = i + 1; });
    return m;
  }, [sel]);

  const toggleSel = useCallback((id) => {
    setSel((cur) => {
      if (cur.includes(id)) { setNote(""); return cur.filter((x) => x !== id); }
      if (cur.length >= MAX_SONGS) { setNote("Ek baar me max " + MAX_SONGS + " songs"); return cur; }
      setNote("");
      return [...cur, id];
    });
  }, []);

  const selectAll = () => {
    if (sel.length) { setSel([]); setNote(""); return; }
    setSel(filtered.slice(0, MAX_SONGS).map((x) => x.id));
    if (filtered.length > MAX_SONGS) setNote("Pehle " + MAX_SONGS + " songs select hue (max " + MAX_SONGS + ")");
  };

  const playSelected = () => {
    if (!sel.length) return;
    const byId = {};
    music.songs.forEach((x) => { byId[x.id] = x; });
    music.playList(sel.map((id) => byId[id]).filter(Boolean));
    setSel([]);
    setNote("");
    setTab("queue");
  };

  const playOne = useCallback((song) => {
    if (music.current?.id === song.id && music.queue.length === 1) {
      music.playing ? music.pause() : music.resume();
    } else {
      music.playList([song]);
    }
  }, [music.current, music.queue, music.playing]); // eslint-disable-line

  const renderSong = useCallback(
    ({ item }) => (
      <SongRow
        item={item}
        order={selMap[item.id]}
        active={music.current?.id === item.id}
        playing={music.playing}
        busy={music.busy}
        onToggle={toggleSel}
        onPlayOne={playOne}
      />
    ),
    [selMap, music.current, music.playing, music.busy, toggleSel, playOne] // eslint-disable-line
  );

  const renderQueue = useCallback(
    ({ item, index }) => (
      <QueueRow item={item} i={index} active={!!music.current && index === music.index}
        playing={music.playing} onPress={music.playAt} />
    ),
    [music.current, music.index, music.playing, music.playAt] // eslint-disable-line
  );

  const hasQueue = music.queue.length > 0;
  const listMax = height * (music.current ? 0.27 : 0.4);

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

          <Text style={s.hint}>Jo songs aap bajayenge wo aapko aur room ke sabhi users ko sunayi denge.</Text>

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
            <Text style={s.pickText}>Phone / Gallery se songs chuno (10 tak)</Text>
          </TouchableOpacity>

          <View style={s.tabs}>
            <TouchableOpacity style={[s.tab, tab === "songs" && s.tabOn]} onPress={() => setTab("songs")}>
              <Text style={[s.tabTxt, tab === "songs" && s.tabTxtOn]}>Songs</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tab, tab === "queue" && s.tabOn]} onPress={() => setTab("queue")}>
              <Text style={[s.tabTxt, tab === "queue" && s.tabTxtOn]}>Playlist ({music.queue.length}/{MAX_SONGS})</Text>
            </TouchableOpacity>
          </View>

          {tab === "songs" ? (
            <>
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
                  renderItem={renderSong}
                  getItemLayout={getItemLayout}
                  extraData={selMap}
                  style={{ flexGrow: 0, maxHeight: listMax }}
                  initialNumToRender={10}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={<Text style={s.empty}>{music.songs.length ? "Koi song nahi mila" : "Upar button se phone ke songs chuno"}</Text>}
                />
              )}

              {!!note && <Text style={s.note}>{note}</Text>}
              <View style={s.selBar}>
                <TouchableOpacity style={s.selAll} onPress={selectAll} activeOpacity={0.7}>
                  <View style={[s.chk, sel.length > 0 && s.chkOn]}>
                    {sel.length > 0 && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <Text style={s.selAllTxt}>{sel.length ? "Clear (" + sel.length + "/" + MAX_SONGS + ")" : "Select " + MAX_SONGS}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.playSel, !sel.length && { opacity: 0.4 }]}
                  disabled={!sel.length || music.busy}
                  onPress={playSelected}
                  activeOpacity={0.8}
                >
                  <Ionicons name="play" size={16} color="#fff" />
                  <Text style={s.playSelTxt}>Play{sel.length ? " (" + sel.length + ")" : ""}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : hasQueue ? (
            <FlatList initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7}
              data={music.queue}
              keyExtractor={(x, i) => x.id + "_" + i}
              renderItem={renderQueue}
              getItemLayout={getItemLayout}
              extraData={music.index + ":" + music.playing + ":" + !!music.current}
              style={{ flexGrow: 0, maxHeight: listMax }}
            />
          ) : (
            <Text style={s.empty}>Phone se songs chuno, wo yahan playlist me aa jayenge</Text>
          )}

          {music.current && (
            <View style={s.player}>
              <Text style={s.nowTitle} numberOfLines={1}>{music.current.title}</Text>

              <View style={s.seekRow}>
                <Text style={s.time}>{fmt(prog.pos)}</Text>
                <Bar value={prog.pos} max={prog.dur} disabled={!prog.dur} onCommit={(ms) => { setProg((p) => ({ ...p, pos: ms })); music.seek(ms); }} />
                <Text style={s.time}>{fmt(prog.dur)}</Text>
              </View>

              <View style={s.ctrlRow2}>
                <TouchableOpacity onPress={music.cycleRepeat} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={s.iconBtn}>
                  <Ionicons name="repeat" size={22} color={music.repeat === "off" ? "#6b7280" : "#ff4d8d"} />
                  {music.repeat === "one" && <Text style={s.one}>1</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={music.prev} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={s.iconBtn}>
                  <Ionicons name="play-skip-back" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={music.playing ? music.pause : music.resume} style={s.bigBtn} activeOpacity={0.8}>
                  <Ionicons name={music.playing ? "pause" : "play"} size={26} color="#fff" style={{ marginLeft: music.playing ? 0 : 3 }} />
                </TouchableOpacity>
                <TouchableOpacity onPress={music.next} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={s.iconBtn}>
                  <Ionicons name="play-skip-forward" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={music.stop} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={s.iconBtn}>
                  <Ionicons name="stop-circle-outline" size={26} color="#e74c3c" />
                </TouchableOpacity>
              </View>

              <View style={s.ctrlRow}>
                <Ionicons name="volume-low" size={18} color="#9ca3af" />
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
  // playlist UI
  tabs: { flexDirection: "row", marginBottom: 6 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabOn: { borderBottomColor: "#ff4d8d" },
  tabTxt: { color: "#9ca3af", fontSize: 13, fontWeight: "700" },
  tabTxtOn: { color: "#fff" },
  chk: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: "#6b7280",
    justifyContent: "center", alignItems: "center",
  },
  chkOn: { backgroundColor: "#ff4d8d", borderColor: "#ff4d8d" },
  chkTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },
  rowPlay: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center", alignItems: "center",
  },
  qNum: { width: 24, alignItems: "center" },
  qNumTxt: { color: "#9ca3af", fontSize: 13, fontWeight: "700" },
  note: { color: "#fbbf24", fontSize: 12, textAlign: "center", paddingTop: 6 },
  selBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8 },
  selAll: { flexDirection: "row", alignItems: "center" },
  selAllTxt: { color: "#fff", fontSize: 13, fontWeight: "700", marginLeft: 10 },
  playSel: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#ff4d8d",
    paddingHorizontal: 22, paddingVertical: 10, borderRadius: 22,
  },
  playSelTxt: { color: "#fff", fontWeight: "800", fontSize: 14, marginLeft: 6 },
  ctrlRow2: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginTop: 6 },
  iconBtn: { padding: 6, justifyContent: "center", alignItems: "center" },
  one: { position: "absolute", color: "#ff4d8d", fontSize: 8, fontWeight: "900" },
  bigBtn: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#ff4d8d", justifyContent: "center", alignItems: "center" },
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
