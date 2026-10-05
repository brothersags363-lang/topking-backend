import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  ActivityIndicator,
  Animated,
  Alert,
  ScrollView,
  StatusBar,
  BackHandler,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';

// ---------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------
const STORY_SERVER_URL = 'https://topking-backend.onrender.com';
const STORY_LIFETIME = 24 * 60 * 60 * 1000;
const STORY_DURATION = 5000;

const COLORS = ['#ffffff', '#000000', '#ff3b5c', '#ffcc00', '#34c759', '#0a84ff', '#bf5af2', '#ff9f0a'];
const LIGHT_COLORS = ['#ffffff', '#ffcc00', '#34c759'];

const FILTERS = [
  { id: 'none', label: 'Normal', color: 'transparent' },
  { id: 'warm', label: 'Warm', color: 'rgba(255,140,0,0.20)' },
  { id: 'cool', label: 'Cool', color: 'rgba(0,120,255,0.20)' },
  { id: 'rose', label: 'Rose', color: 'rgba(255,0,110,0.18)' },
  { id: 'mint', label: 'Mint', color: 'rgba(0,220,170,0.18)' },
  { id: 'dusk', label: 'Dusk', color: 'rgba(90,40,160,0.28)' },
  { id: 'fade', label: 'Fade', color: 'rgba(255,255,255,0.22)' },
  { id: 'noir', label: 'Noir', color: 'rgba(0,0,0,0.38)' },
];

const EMOJIS = [
  '😀','😂','🤣','😊','😍','🥰','😘','😎','🤩','🥳','😇','😉',
  '😜','🤪','😏','😌','😴','🤔','🙄','😬','😢','😭','😡','🤯',
  '😱','🥺','😤','🤗','🤭','🫶','👍','👎','👏','🙌','🙏','💪',
  '✌️','🤞','👌','🤟','👋','🫡','❤️','🧡','💛','💚','💙','💜',
  '🖤','🤍','💔','💖','💯','🔥','✨','⭐','🌟','💥','🎉','🎊',
  '🎁','🎂','🍕','🍔','🍟','🍿','☕','🍺','🍻','🥂','⚽','🏏',
  '🎮','🎧','🎵','📸','🌹','🌸','🌈','☀️','🌙','⚡','❄️','🌊',
  '🚀','✈️','🚗','🏍️','👑','💎','🏆','💰','📍','🕌','🕉️','🇮🇳',
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------------------------------------------------------------
// VIDEO (editor preview, muted loop)
// ---------------------------------------------------------------
function EditorVideo({ uri, fit }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFillObject}
      contentFit={fit}
      nativeControls={false}
    />
  );
}

// ---------------------------------------------------------------
// ITEM CONTENT (text / emoji) - same look as story viewer
// ---------------------------------------------------------------
function ItemContent({ item, k }) {
  if (item.type === 'emoji') {
    return <Text style={{ fontSize: 64 * k }}>{item.text}</Text>;
  }
  const light = LIGHT_COLORS.includes(item.color);
  if (item.bg) {
    return (
      <View
        style={{
          backgroundColor: item.color,
          paddingHorizontal: 12 * k,
          paddingVertical: 6 * k,
          borderRadius: 10 * k,
        }}
      >
        <Text style={{ fontSize: 28 * k, fontWeight: '800', textAlign: 'center', color: light ? '#000' : '#fff' }}>
          {item.text}
        </Text>
      </View>
    );
  }
  return (
    <Text
      style={{
        fontSize: 30 * k,
        fontWeight: '800',
        textAlign: 'center',
        color: item.color,
        textShadowColor: 'rgba(0,0,0,0.55)',
        textShadowRadius: 6,
        textShadowOffset: { width: 0, height: 1 },
      }}
    >
      {item.text}
    </Text>
  );
}

// ---------------------------------------------------------------
// DRAGGABLE / PINCH / ROTATE OVERLAY
// ---------------------------------------------------------------
function Overlay({ item, boxW, boxH, onChange, onTap, onDragStart, onDragMove, onDragEnd }) {
  const latest = useRef({ item, boxW, boxH, onChange, onTap, onDragStart, onDragMove, onDragEnd });
  latest.current = { item, boxW, boxH, onChange, onTap, onDragStart, onDragMove, onDragEnd };

  const k = boxW / 360;
  const w = boxW * 0.92;
  const h = boxW * 0.8;

  // While a finger is down, only these 4 numbers change - the screen is NOT
  // re-rendered on every touch move any more (that was the lag). The final
  // position is saved once, when the finger is lifted.
  const tx = useRef(new Animated.Value(item.x * boxW - w / 2)).current;
  const ty = useRef(new Animated.Value(item.y * boxH - h / 2)).current;
  const sc = useRef(new Animated.Value(item.scale)).current;
  const rot = useRef(new Animated.Value(item.rotation)).current;
  const touching = useRef(false);

  // keep in sync if the item is changed from outside (not while dragging)
  useEffect(() => {
    if (touching.current) return;
    tx.setValue(item.x * boxW - w / 2);
    ty.setValue(item.y * boxH - h / 2);
    sc.setValue(item.scale);
    rot.setValue(item.rotation);
  }, [item.x, item.y, item.scale, item.rotation, boxW, boxH]);

  const g = useRef({
    n: 0, lx: 0, ly: 0, ld: 0, la: 0, moved: 0, t0: 0,
    cur: { x: item.x, y: item.y, scale: item.scale, rotation: item.rotation },
  }).current;

  const finish = () => {
    const L = latest.current;
    const quick = Date.now() - g.t0 < 300;
    const tapped = g.moved < 8 && quick;
    g.n = 0;
    touching.current = false;
    L.onChange(L.item.id, { x: g.cur.x, y: g.cur.y, scale: g.cur.scale, rotation: g.cur.rotation });
    L.onDragEnd(L.item.id, tapped);
    if (tapped) L.onTap(L.item);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const L = latest.current;
        g.cur = { x: L.item.x, y: L.item.y, scale: L.item.scale, rotation: L.item.rotation };
        g.n = 0;
        g.ld = 0;
        g.moved = 0;
        g.t0 = Date.now();
        touching.current = true;
        L.onDragStart(L.item.id);
      },
      onPanResponderMove: (e) => {
        const L = latest.current;
        const t = e.nativeEvent.touches;
        const n = t.length;
        const cur = g.cur;
        const bw = L.boxW;
        const bh = L.boxH;
        const ww = bw * 0.92;
        const hh = bw * 0.8;

        if (n >= 2) {
          const dx = t[1].pageX - t[0].pageX;
          const dy = t[1].pageY - t[0].pageY;
          const d = Math.sqrt(dx * dx + dy * dy);
          const a = Math.atan2(dy, dx);
          if (g.n === 2 && g.ld > 0) {
            let da = a - g.la;
            if (da > Math.PI) da -= 2 * Math.PI;
            if (da < -Math.PI) da += 2 * Math.PI;
            cur.scale = clamp(cur.scale * (d / g.ld), 0.4, 6);
            cur.rotation = cur.rotation + da;
            sc.setValue(cur.scale);
            rot.setValue(cur.rotation);
          }
          g.ld = d;
          g.la = a;
          g.n = 2;
          g.moved = 99;
        } else if (n === 1) {
          const x = t[0].pageX;
          const y = t[0].pageY;
          if (g.n === 1) {
            const ddx = x - g.lx;
            const ddy = y - g.ly;
            g.moved += Math.abs(ddx) + Math.abs(ddy);
            cur.x = clamp(cur.x + ddx / bw, 0, 1);
            cur.y = clamp(cur.y + ddy / bh, 0, 1);
            tx.setValue(cur.x * bw - ww / 2);
            ty.setValue(cur.y * bh - hh / 2);
            L.onDragMove(cur.y);
          }
          g.lx = x;
          g.ly = y;
          g.n = 1;
        }
      },
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
    })
  ).current;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: w,
        height: h,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [
          { translateX: tx },
          { translateY: ty },
          { rotate: rot.interpolate({ inputRange: [0, 1], outputRange: ['0rad', '1rad'] }) },
          { scale: sc },
        ],
      }}
    >
      <View {...pan.panHandlers} style={{ maxWidth: w, padding: 10 }}>
        <ItemContent item={item} k={k} />
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------
// SCREEN
// ---------------------------------------------------------------
export default function StoryEditor() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const win = useWindowDimensions();

  const uri = String(params.uri || '');
  const isVideo = params.type === 'video';
  const videoMs = Number(params.duration || 0);
  const userPhoto = String(params.userPhoto || '');
  const username = String(params.username || 'User');

  // 9:16 canvas, always fits on screen
  const boxW = Math.min(win.width, (win.height * 9) / 16);
  const boxH = (boxW * 16) / 9;
  const boxLeft = (win.width - boxW) / 2;
  const boxTop = (win.height - boxH) / 2;

  const [items, setItems] = useState([]);
  const [filterId, setFilterId] = useState('none');
  const [fit, setFit] = useState('cover');
  const [panel, setPanel] = useState('none'); // none | emoji | filter
  const [draft, setDraft] = useState(null); // text editor { id, text, color, bg }
  const [dragging, setDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const [uploading, setUploading] = useState(false);

  const overTrashRef = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const filter = FILTERS.find((f) => f.id === filterId) || FILTERS[0];

  // ---- item helpers ----
  const patchItem = (id, patch) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const addItem = (data) =>
    setItems((prev) => [...prev, { id: uid(), x: 0.5, y: 0.42, scale: 1, rotation: 0, ...data }]);

  const onDragStart = () => {
    setDragging(true);
    setPanel('none');
  };
  const onDragMove = (y) => {
    const over = y > 0.86;
    if (over !== overTrashRef.current) {
      overTrashRef.current = over;
      setOverTrash(over);
    }
  };
  const onDragEnd = (id) => {
    if (overTrashRef.current) {
      setItems((prev) => prev.filter((it) => it.id !== id));
    }
    overTrashRef.current = false;
    setOverTrash(false);
    setDragging(false);
  };
  const onTapItem = (item) => {
    if (item.type === 'text') {
      setDraft({ id: item.id, text: item.text, color: item.color, bg: !!item.bg });
    }
  };

  // ---- text editor ----
  const openTextEditor = () => {
    setPanel('none');
    setDraft({ id: null, text: '', color: '#ffffff', bg: false });
  };
  const closeTextEditor = () => {
    if (!draft) return;
    const text = draft.text.trim();
    if (draft.id) {
      if (text) patchItem(draft.id, { text, color: draft.color, bg: draft.bg });
      else setItems((prev) => prev.filter((it) => it.id !== draft.id));
    } else if (text) {
      addItem({ type: 'text', text, color: draft.color, bg: draft.bg });
    }
    setDraft(null);
  };

  // ---- back / discard ----
  const askDiscard = () => {
    if (uploading) return true;
    if (items.length === 0 && filterId === 'none') {
      router.back();
      return true;
    }
    Alert.alert('Discard story?', 'Aapke changes hat jayenge.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
    return true;
  };

  // subscribe ONCE; the latest state is read through a ref
  const backRef = useRef<any>({});
  backRef.current = { draft, panel, closeTextEditor, askDiscard };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const B = backRef.current;
      if (B.draft) {
        B.closeTextEditor();
        return true;
      }
      if (B.panel !== 'none') {
        setPanel('none');
        return true;
      }
      return B.askDiscard();
    });
    return () => sub.remove();
  }, []);

  // ---- post ----
  const postStory = async () => {
    if (uploading) return;
    const user = getAuth().currentUser;
    if (!user) {
      Alert.alert('Login required', 'Please login again.');
      return;
    }

    try {
      setUploading(true);
      setPanel('none');

      const token = await user.getIdToken();
      const lower = uri.toLowerCase();
      let mime = 'image/jpeg';
      if (isVideo) mime = lower.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
      else if (lower.endsWith('.png')) mime = 'image/png';
      else if (lower.endsWith('.webp')) mime = 'image/webp';

      const up = await FileSystem.uploadAsync(`${STORY_SERVER_URL}/upload-story`, uri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'media',
        mimeType: mime,
        headers: { Authorization: `Bearer ${token}` },
      });

      let data = null;
      try { data = JSON.parse(up.body); } catch (e) {}
      if (!data || up.status < 200 || up.status >= 300 || !data.success) {
        console.log('Story server status =', up.status, '| reply =', String(up.body).slice(0, 200));
        throw new Error((data && data.error) || 'Upload failed (status ' + up.status + ')');
      }

      const r4 = (n) => Math.round(n * 10000) / 10000;
      const overlays = itemsRef.current.map((it) => ({
        type: it.type,
        text: it.text,
        color: it.color || '#ffffff',
        bg: !!it.bg,
        x: r4(it.x),
        y: r4(it.y),
        scale: r4(it.scale),
        rotation: r4(it.rotation),
      }));

      await addDoc(collection(getFirestore(), 'stories'), {
        userId: user.uid,
        username: username || user.displayName || 'User',
        userPhoto,
        mediaUrl: data.mediaUrl,
        mediaType: isVideo ? 'video' : 'image',
        duration: isVideo ? clamp(Math.round(videoMs || STORY_DURATION), 1000, 30000) : STORY_DURATION,
        storagePath: data.key,
        overlays,
        filter: filterId,
        fit,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + STORY_LIFETIME),
      });

      router.back();
    } catch (e) {
      console.log('Story upload error:', e);
      setUploading(false);
      Alert.alert('Story upload failed', 'Please check your internet and try again.');
    }
  };

  const topPad = Platform.OS === 'android' ? 38 : 54;
  const hideUi = dragging || !!draft;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* CANVAS (9:16) */}
      <View
        style={{
          position: 'absolute',
          left: boxLeft,
          top: boxTop,
          width: boxW,
          height: boxH,
          overflow: 'hidden',
          backgroundColor: '#000',
          borderRadius: 14,
        }}
      >
        {isVideo ? (
          <EditorVideo uri={uri} fit={fit} />
        ) : (
          <Image source={{ uri }} style={StyleSheet.absoluteFillObject} resizeMode={fit as any} resizeMethod="resize" />
        )}

        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: filter.color }]} />

        {items.map((it) => (
          <Overlay
            key={it.id}
            item={it}
            boxW={boxW}
            boxH={boxH}
            onChange={patchItem}
            onTap={onTapItem}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
          />
        ))}
      </View>

      {/* TOP BAR */}
      {!hideUi && (
        <View style={[styles.topBar, { paddingTop: topPad }]} pointerEvents="box-none">
          <TouchableOpacity style={styles.roundBtn} onPress={askDiscard}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity style={[styles.roundBtn, { marginLeft: 10 }]} onPress={() => setFit(fit === 'cover' ? 'contain' : 'cover')}>
              <Ionicons name={fit === 'cover' ? 'contract-outline' : 'expand-outline'} size={21} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roundBtn, { marginLeft: 10 }, panel === 'filter' && styles.roundBtnOn]}
              onPress={() => setPanel(panel === 'filter' ? 'none' : 'filter')}
            >
              <Ionicons name="color-filter-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roundBtn, { marginLeft: 10 }, panel === 'emoji' && styles.roundBtnOn]}
              onPress={() => setPanel(panel === 'emoji' ? 'none' : 'emoji')}
            >
              <Ionicons name="happy-outline" size={23} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.roundBtn, { marginLeft: 10 }]} onPress={openTextEditor}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Aa</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* BOTTOM: filter chips + share */}
      {!hideUi && (
        <View style={styles.bottomWrap} pointerEvents="box-none">
          {panel === 'filter' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14 }} style={{ marginBottom: 14 }}>
              {FILTERS.map((f) => (
                <TouchableOpacity key={f.id} onPress={() => setFilterId(f.id)} style={styles.chipWrap}>
                  <View style={[styles.chip, filterId === f.id && styles.chipOn]}>
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#8a8a8a' }]} />
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: f.color }]} />
                  </View>
                  <Text style={[styles.chipLabel, filterId === f.id && { color: '#fff', fontWeight: '700' }]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={styles.shareRow}>
            <TouchableOpacity style={styles.sharePill} onPress={postStory} activeOpacity={0.85} disabled={uploading}>
              {userPhoto ? <Image source={{ uri: userPhoto }} style={styles.shareAvatar} /> : <View style={styles.shareAvatar} />}
              <Text style={styles.shareText}>Your story</Text>
              <View style={styles.shareArrow}>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* TRASH */}
      {dragging && (
        <View style={styles.trashWrap} pointerEvents="none">
          <View style={[styles.trash, overTrash && styles.trashOn]}>
            <Ionicons name="trash-outline" size={overTrash ? 30 : 24} color="#fff" />
          </View>
        </View>
      )}

      {/* EMOJI SHEET */}
      {panel === 'emoji' && !hideUi && (
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setPanel('none')} />
          <View style={[styles.sheet, { height: win.height * 0.46 }]}>
            <View style={styles.sheetHandle} />
            <ScrollView contentContainerStyle={styles.emojiGrid} showsVerticalScrollIndicator={false}>
              {EMOJIS.map((e) => (
                <TouchableOpacity
                  key={e}
                  style={{ width: '12.5%', alignItems: 'center', paddingVertical: 8 }}
                  onPress={() => {
                    addItem({ type: 'emoji', text: e });
                    setPanel('none');
                  }}
                >
                  <Text style={{ fontSize: 30 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* TEXT EDITOR */}
      {draft && (
        <View style={styles.textLayer}>
          <View style={[styles.textTop, { paddingTop: topPad }]}>
            <TouchableOpacity
              style={styles.roundBtn}
              onPress={() => setDraft({ ...draft, bg: !draft.bg })}
            >
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>{draft.bg ? 'A' : 'A'}</Text>
              {draft.bg && <View style={styles.bgDot} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={closeTextEditor} style={{ padding: 8 }}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={{ alignItems: 'center', paddingHorizontal: 24, marginTop: 30 }}>
            <View
              style={[
                { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, maxWidth: '100%' },
                draft.bg && { backgroundColor: draft.color },
              ]}
            >
              <TextInput
                autoFocus
                multiline
                value={draft.text}
                onChangeText={(t) => setDraft({ ...draft, text: t })}
                placeholder="Type something..."
                placeholderTextColor="rgba(255,255,255,0.45)"
                maxLength={120}
                style={{
                  minWidth: 120,
                  fontSize: 30,
                  fontWeight: '800',
                  textAlign: 'center',
                  color: draft.bg ? (LIGHT_COLORS.includes(draft.color) ? '#000' : '#fff') : draft.color,
                }}
              />
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center' }} style={{ marginTop: 28, flexGrow: 0 }}>
            {COLORS.map((c) => (
              <TouchableOpacity key={c} onPress={() => setDraft({ ...draft, color: c })} style={{ padding: 6 }}>
                <View style={[styles.colorDot, { backgroundColor: c }, draft.color === c && styles.colorDotOn]} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* UPLOADING */}
      {uploading && (
        <View style={styles.uploading}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: '#fff', marginTop: 12, fontWeight: '600' }}>Posting your story...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  topBar: {
    position: 'absolute', top: 25, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14,
  },
  roundBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center',
  },
  roundBtnOn: { backgroundColor: 'rgba(255,255,255,0.28)' },

  bottomWrap: { position: 'absolute', left: 0, right: 0, bottom: 30, paddingBottom: Platform.OS === 'android' ? 22 : 34 },
  shareRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 14 },
  sharePill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 28,
    paddingLeft: 8, paddingRight: 8, paddingVertical: 8,
  },
  shareAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#ddd' },
  shareText: { color: '#000', fontWeight: '700', fontSize: 15, marginHorizontal: 10 },
  shareArrow: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#0a84ff',
    justifyContent: 'center', alignItems: 'center',
  },

  chipWrap: { alignItems: 'center', marginRight: 12 },
  chip: {
    width: 58, height: 58, borderRadius: 29, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
  },
  chipOn: { borderColor: '#fff' },
  chipLabel: { color: '#bbb', fontSize: 11, marginTop: 5 },

  trashWrap: { position: 'absolute', left: 0, right: 0, bottom: 34, alignItems: 'center' },
  trash: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  trashOn: { backgroundColor: '#ff3a30d9', width: 66, height: 66, borderRadius: 33 },

  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: '#1c1c1e', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 8, paddingBottom: 20,
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#555', marginVertical: 10 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap' },

  textLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.78)' },
  textTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14,
  },
  bgDot: { position: 'absolute', bottom: 7, width: 14, height: 3, borderRadius: 2, backgroundColor: '#fff' },
  colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
  colorDotOn: { borderColor: '#fff', transform: [{ scale: 1.18 }] },

  uploading: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center', alignItems: 'center',
  },
});
