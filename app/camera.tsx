import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  PanResponder,
  Animated,
  Easing,
} from 'react-native';
import { scopedBackHandler } from '../utils/scopedBack';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as ImagePicker from 'expo-image-picker';
import { Audio } from '../utils/audio';

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from 'expo-camera';

import { useLocalSearchParams } from 'expo-router';
import { useRouter } from '../utils/safeRouter';
import { useIsFocused } from '@react-navigation/native';

import { getDoc, doc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

import { db } from './firebaseConfig';
import { callApi } from '../utils/api';
import FilterOverlay from '../components/FilterOverlay';
import BeautySheet from '../components/camera/BeautySheet';
import TimeSheet from '../components/camera/TimeSheet';
import StickerSheet from '../components/camera/StickerSheet';
import StickerOverlay from '../components/camera/StickerOverlay';
import { countDrafts } from '../utils/reelDrafts';
import Svg, { Circle } from 'react-native-svg';

const FILTER_LIB = require('../constants/filterLibrary');
const VIDEO_FX = require('../constants/videoFx');

// ==================================================
// THEME
// ==================================================

const YELLOW = '#FFD60A';

// Swipe left/right on the camera = next / previous filter (category order,
// same as the Filter sheet).
const SWIPE_FILTERS: { id: string; label: string; cat: string }[] = [
  { id: 'none', label: 'Original', cat: '' },
  ...FILTER_LIB.CATEGORIES.flatMap((c: string) =>
    FILTER_LIB.byCategory(c).map((f: any) => ({ id: f.id, label: f.label, cat: c }))
  ),
];

// Kitne pixel ki pinch se poora zoom (0 -> 1) ho.
const PINCH_RANGE = 450;
const SWIPE_MIN = 60;

const getDistance = (touches: any[]) => {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
};


// ==================================================
// CAMERA: pinch zoom + 1-finger swipe (filters) + tap
// --------------------------------------------------
// Zoom state sirf is chhote component me hai, isliye pinch karte waqt
// poora page re-render nahi hota (smooth). Har frame me max 1 update.
// ==================================================

const ZoomableCamera = React.memo(
  React.forwardRef<any, any>(
    ({ facing, enableTorch, indicatorBottom, onCameraReady, onMountError, onSwipe, onTap }, ref) => {

      const [zoom, setZoom] = useState(0);
      const [showIndicator, setShowIndicator] = useState(false);

      const zoomRef = useRef(0);
      const startZoomRef = useRef(0);
      const startDistRef = useRef(0);
      const pinchedRef = useRef(false);
      const rafRef = useRef<number | null>(null);
      const hideTimerRef = useRef<any>(null);
      const cbRef = useRef({ onSwipe, onTap });
      cbRef.current = { onSwipe, onTap };

      useEffect(() => {
        zoomRef.current = 0;
        setZoom(0);
      }, [facing]);

      useEffect(() => () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      }, []);

      const scheduleUpdate = () => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setZoom(zoomRef.current);
        });
      };

      const endGesture = (g: any) => {
        const wasPinch = pinchedRef.current;
        startDistRef.current = 0;
        pinchedRef.current = false;

        if (wasPinch) {
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
          hideTimerRef.current = setTimeout(() => setShowIndicator(false), 900);
          return;
        }

        // 1 ungli: swipe = filter badlo, tap = sheets band
        if (Math.abs(g.dx) > SWIPE_MIN && Math.abs(g.dx) > Math.abs(g.dy) * 1.5) {
          cbRef.current.onSwipe && cbRef.current.onSwipe(g.dx < 0 ? 1 : -1);
        } else if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) {
          cbRef.current.onTap && cbRef.current.onTap();
        }
      };

      const panResponder = useRef(
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderTerminationRequest: () => false,

          onPanResponderMove: (evt) => {
            const touches = evt.nativeEvent.touches;
            if (touches.length < 2) {
              startDistRef.current = 0;
              return;
            }
            pinchedRef.current = true;
            const distance = getDistance(touches);

            if (!startDistRef.current) {
              startDistRef.current = distance;
              startZoomRef.current = zoomRef.current;
              if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
              setShowIndicator(true);
              return;
            }

            const next = Math.min(1, Math.max(0,
              startZoomRef.current + (distance - startDistRef.current) / PINCH_RANGE));

            if (Math.abs(next - zoomRef.current) > 0.002) {
              zoomRef.current = next;
              scheduleUpdate();
            }
          },

          onPanResponderRelease: (_, g) => endGesture(g),
          onPanResponderTerminate: (_, g) => endGesture(g),
        })
      ).current;

      return (
        <>
          <CameraView
            style={StyleSheet.absoluteFill}
            ref={ref}
            mode="video"
            facing={facing}
            zoom={zoom}
            enableTorch={enableTorch}
            onCameraReady={onCameraReady}
            onMountError={onMountError}
          />

          <View style={[StyleSheet.absoluteFill, { zIndex: 1 }]} {...panResponder.panHandlers} />

          {showIndicator && (
            <View style={[ui.zoomIndicator, { bottom: indicatorBottom }]} pointerEvents="none">
              <Ionicons name="search" size={16} color="#fff" />
              <View style={ui.zoomTrack}>
                <View style={[ui.zoomFill, { width: `${Math.round(zoom * 100)}%` }]} />
              </View>
              <Text style={ui.zoomPct}>{Math.round(zoom * 100)}%</Text>
            </View>
          )}
        </>
      );
    }
  )
);


// ==================================================
// SMALL MEMO PIECES (re-render nahi hote jab tak props same)
// ==================================================

// Countdown 3 / 2 / 1 (native driver = smooth)
const CountdownOverlay = React.memo(({ value }: { value: number }) => {
  const scale = useRef(new Animated.Value(1.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scale.setValue(1.6);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [value, scale, opacity]);

  return (
    <View style={ui.countWrap} pointerEvents="none">
      <Animated.Text style={[ui.countText, { opacity, transform: [{ scale }] }]}>
        {value}
      </Animated.Text>
    </View>
  );
});

// "Barbie / Portrait" filter name in the middle (screenshot), fades out
const FilterToast = React.memo(({ label, cat, tick }: { label: string; cat: string; tick: number }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!tick) return;
    opacity.stopAnimation();
    opacity.setValue(1);
    Animated.timing(opacity, {
      toValue: 0, duration: 600, delay: 900, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
  }, [tick, opacity]);
  return (
    <Animated.View style={[ui.toast, { opacity }]} pointerEvents="none">
      <View style={ui.toastRow}>
        <Text style={ui.toastArrow}>{'<<'}</Text>
        <Text style={ui.toastTitle}>{label}</Text>
        <Text style={ui.toastArrow}>{'>>'}</Text>
      </View>
      {!!cat && <Text style={ui.toastSub}>{cat}</Text>}
    </Animated.View>
  );
});

// Record button with progress ring + time label (screenshot jaisa).
// Ring: kitna record hua (rakhe gaye segments) / max. Apna chhota state,
// isliye har tick par poora camera page re-render NAHI hota.
const RING = 86;
const RING_R = 40;
const RING_C = 2 * Math.PI * RING_R;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RecordButton = React.memo(
  ({ mode, keptMs, since, totalMs, speed, onPress, disabled, countdown, marks }: {
    mode: 'idle' | 'recording' | 'paused'; keptMs: number; since: number; totalMs: number;
    speed: number; onPress: () => void; disabled: boolean; countdown: boolean; marks: number[];
  }) => {
    const p = useRef(new Animated.Value(0)).current;
    const [label, setLabel] = useState(keptMs);

    useEffect(() => {
      const base = Math.min(1, keptMs / totalMs);
      p.stopAnimation();
      p.setValue(base);
      setLabel(keptMs);
      if (mode !== 'recording') return;
      const left = Math.max(0, totalMs - keptMs);
      Animated.timing(p, { toValue: 1, duration: left, easing: Easing.linear, useNativeDriver: false }).start();
      const id = setInterval(() => setLabel(keptMs + (Date.now() - since)), 100);
      return () => clearInterval(id);
    }, [mode, keptMs, since, totalMs, p]);

    const active = mode !== 'idle';
    return (
      <View style={{ alignItems: 'center' }}>
        {active && <Text style={ui.ringLabel}>{(label / 1000 / speed).toFixed(1)}s</Text>}
        <TouchableOpacity onPress={onPress} activeOpacity={0.85} disabled={disabled}>
          <View style={ui.ringWrap}>
            {active && (
              <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
                <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke="rgba(255,255,255,0.35)" strokeWidth={5} fill="none" />
                <AnimatedCircle
                  cx={RING / 2}
                  cy={RING / 2}
                  r={RING_R}
                  stroke={YELLOW}
                  strokeWidth={5}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${RING_C} ${RING_C}`}
                  strokeDashoffset={p.interpolate({ inputRange: [0, 1], outputRange: [RING_C, 0] })}
                  transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
                />
                {/* segment marks */}
                {marks.map((m, i) => {
                  const ang = (m * 2 * Math.PI) - Math.PI / 2;
                  return (
                    <Circle
                      key={i}
                      cx={RING / 2 + RING_R * Math.cos(ang)}
                      cy={RING / 2 + RING_R * Math.sin(ang)}
                      r={2.5}
                      fill="#fff"
                    />
                  );
                })}
              </Svg>
            )}
            <View
              style={[
                ui.recInner,
                !active && !countdown && ui.recInnerIdle,
                mode === 'recording' && ui.recInnerRec,
                mode === 'paused' && ui.recInnerPaused,
                countdown && ui.recInnerRec,
              ]}
            />
          </View>
        </TouchableOpacity>
      </View>
    );
  }
);

// Right column button (Switch / Time / Speed / Beauty / Flash)
const SideBtn = React.memo(
  ({ icon, label, onPress, active, disabled, badge }: any) => (
    <TouchableOpacity
      style={[ui.sideBtn, disabled && { opacity: 0.4 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      hitSlop={6}
    >
      <View>
        {icon}
        {!!badge && (
          <View style={ui.sideBadge}>
            <Text style={ui.sideBadgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={[ui.sideTxt, active && { color: YELLOW }]}>{label}</Text>
    </TouchableOpacity>
  )
);

// Speed pills 0.3x .. 3x
const SpeedBar = React.memo(({ value, onChange, bottom, locked }: any) => (
  <View style={[ui.speedBar, { bottom }, locked && { opacity: 0.6 }]}>
    {VIDEO_FX.SPEEDS.map((s: any) => {
      const on = s.value === value;
      return (
        <TouchableOpacity
          key={s.label}
          onPress={() => onChange(s.value)}
          activeOpacity={0.8}
          style={[ui.speedPill, on && ui.speedPillOn]}
        >
          <Text style={[ui.speedText, on && ui.speedTextOn]}>{s.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
));



// Live/Audio permission cache (app chalne tak yaad rahega)
let liveAccessCache: { uid: string; allowed: boolean } | null = null;

export default function CameraPage() {

  const router = useRouter();

  const params = useLocalSearchParams();
  const first = (v: any) => (Array.isArray(v) ? v[0] : v);

  // Song kahin se bhi aaye (musicDetails ya MusicSelect), sab params
  // yahan ek jagah normalize hote hain, taaki musicId / artist / image
  // camera -> EditView -> post tak kabhi na khoye.
  const audioUrl = first(params.audioUrl);
  const musicName = first(params.musicName) || first(params.musicTitle);
  const musicId = first(params.musicId) || '';
  const profile = first(params.musicImage) || first(params.profile);
  const username = first(params.musicArtist) || first(params.username);
  // Select Music ki kainchi (scissors) se gaana yahan se shuru hoga (seconds)
  const musicStart = Math.max(0, Number(first(params.musicStart)) || 0);


  // --------------------------------------------------
  // STATES
  // --------------------------------------------------

  const [canGoLive, setCanGoLive] = useState(() => {
    const uid = getAuth().currentUser?.uid;
    return liveAccessCache && liveAccessCache.uid === uid
      ? liveAccessCache.allowed
      : false;
  });

  // Segment recording: idle -> recording -> paused -> recording ... -> ✓
  const [recMode, setRecMode] = useState<'idle' | 'recording' | 'paused'>('idle');
  const isRecording = recMode === 'recording';
  const [segUi, setSegUi] = useState({ keptMs: 0, since: 0, marks: [] as number[], count: 0 });
  const [sticker, setSticker] = useState('none');
  const [facing, setFacing] = useState<'back' | 'front'>('front');
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Which bottom sheet is open: null | 'beauty' | 'time' | 'stickers'
  const [sheet, setSheet] = useState<null | 'beauty' | 'time' | 'stickers'>(null);

  // Filter + strength (0-100) + beauty sliders
  const [filterId, setFilterId] = useState('none');
  const [intensity, setIntensity] = useState(70);
  const [beauty, setBeauty] = useState<Record<string, number>>(() => VIDEO_FX.defaultBeauty());
  const [compare, setCompare] = useState(false);
  const [toastTick, setToastTick] = useState(0);

  // Speed (0.3x .. 3x)
  const [speed, setSpeed] = useState(1);
  const [showSpeed, setShowSpeed] = useState(false);

  // Time sheet: max duration (15/30/60) + auto pause point
  const [maxDuration, setMaxDuration] = useState(15);
  const [stopAt, setStopAt] = useState(15);

  // Self timer (Off / 3s / 5s / 10s)
  const [timerDelay, setTimerDelay] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  const [draftCount, setDraftCount] = useState(0);


  // --------------------------------------------------
  // REFS (latest values for async recording code)
  // --------------------------------------------------

  const cameraRef = useRef<any>(null);
  const recordingRef = useRef(false);
  const mountedRef = useRef(true);
  const musicSoundRef = useRef<any>(null);
  const autoStopRef = useRef<any>(null);
  const countdownTimeoutRef = useRef<any>(null);
  const startRecordingRef = useRef<() => void>(() => {});

  const fxRef = useRef({ filterId, intensity, beauty, speed, stopAt, maxDuration, sticker });
  fxRef.current = { filterId, intensity, beauty, speed, stopAt, maxDuration, sticker };

  // Segments in RAW file time: { a, b, deleted }
  const segmentsRef = useRef<{ a: number; b: number; deleted: boolean }[]>([]);
  const fileCursorRef = useRef(0);       // seconds already in the file
  const segStartWallRef = useRef(0);     // Date.now() when current segment began
  const canPauseRef = useRef(false);     // toggleRecordingAsync available?
  const discardRef = useRef(false);
  const finishRef = useRef<() => void>(() => {});

  const buildFxString = useCallback((withSpeed: boolean, keep?: number[][]) => {
    const f = fxRef.current;
    return VIDEO_FX.stringifyFx({
      speed: withSpeed ? f.speed : 1,
      intensity: f.filterId === 'none' ? 100 : f.intensity,
      beauty: f.beauty,
      musicStart,
      sticker: f.sticker,
      keep: keep || [],
    });
  }, [musicStart]);

  // Preview overlay input (memo: object same rahe to overlay re-render nahi)
  const previewFx = useMemo(() => ({ intensity, beauty }), [intensity, beauty]);

  const swipeIndex = SWIPE_FILTERS.findIndex((f) => f.id === filterId);
  const currentFilter = SWIPE_FILTERS[Math.max(0, swipeIndex)];


  // --------------------------------------------------
  // COUNTDOWN
  // --------------------------------------------------

  const cancelCountdown = useCallback(() => {
    if (countdownTimeoutRef.current) {
      clearTimeout(countdownTimeoutRef.current);
      countdownTimeoutRef.current = null;
    }
    setCountdown(null);
  }, []);

  const beginCountdown = useCallback((from: number) => {
    let remaining = from;
    setCountdown(remaining);

    const tick = () => {
      remaining -= 1;
      if (!mountedRef.current) return;
      if (remaining <= 0) {
        countdownTimeoutRef.current = null;
        setCountdown(null);
        startRecordingRef.current();
        return;
      }
      setCountdown(remaining);
      countdownTimeoutRef.current = setTimeout(tick, 1000);
    };

    countdownTimeoutRef.current = setTimeout(tick, 1000);
  }, []);


  // --------------------------------------------------
  // PERMISSIONS
  // --------------------------------------------------

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();


  // --------------------------------------------------
  // CLEANUP
  // --------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recordingRef.current = false;
      if (countdownTimeoutRef.current) clearTimeout(countdownTimeoutRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
    };
  }, []);


  // --------------------------------------------------
  // HARDWARE BACK: sheet -> countdown -> screen
  // --------------------------------------------------

  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;

  useEffect(() => {
    const backAction = () => {
      if (recordingRef.current) {
        // paused session: back = discard poochho; recording: kuch nahi
        if (!segStartWallRef.current) discardRef2.current();
        return true;
      }
      if (sheetRef.current) {
        setSheet(null);
        return true;
      }
      if (countdownTimeoutRef.current) {
        cancelCountdown();
        return true;
      }
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
      return true;
    };
    const subscription = scopedBackHandler('/camera', 'hardwareBackPress', backAction);
    return () => subscription.remove();
  }, [router, cancelCountdown]);


  // --------------------------------------------------
  // CHECK LIVE HOST PERMISSION
  // --------------------------------------------------

  useEffect(() => {

    let isMounted = true;

    const auth = getAuth();

    const checkHostPermission = async (uid: string) => {

      try {

        const userSnap = await getDoc(doc(db, 'users', uid));

        const data = userSnap.exists() ? userSnap.data() : null;

        // Live sirf inko: verified (admin tick YA chehra verify) + agency me add (member / owner).
        // Verify ke bina live NAHI. Agency se nikalne par live apne aap band.
        const isVerifiedUser =
          !!data &&
          (data.verified === true ||
            data.faceVerified === true ||
            data.faceStatus === 'submitted' ||
            data.faceStatus === 'approved');
        const inAgency =
          !!data &&
          ((typeof data.agencyId === 'string' && data.agencyId.length > 0) ||
            data.agencyApproved === true);
        // ADMIN OVERRIDE (adminLiveAccess screen): admin ne "granted" diya to
        // verify / agency / device rule ke bina Live; "revoked" diya to Live nahi.
        const adminGranted = !!data && data.liveAccess === 'granted';
        const adminRevoked = !!data && data.liveAccess === 'revoked';

        const allowed = adminRevoked
          ? false
          : adminGranted
            ? true
            : isVerifiedUser && inAgency;

        // Cache save: agli baar camera turant sahi bar dikhayega
        liveAccessCache = { uid, allowed };

        if (isMounted) {
          setCanGoLive(allowed);
        }

        // Ek mobile par ek hi verified ID: background me server se check (button rukta nahi).
        // Admin ne jise Live diya hai uspar ye device rule lagu nahi hota.
        if (allowed && !adminGranted) {
          callApi('/device/verified-check', {}).catch((e: any) => {
            if (e && e.code === 'DEVICE_ALREADY_VERIFIED') {
              liveAccessCache = { uid, allowed: false };
              if (isMounted) setCanGoLive(false);
            }
          });
        }

      } catch (error) {
        // Network fail ho to purani cached value hi rehne do
        if (isMounted && !liveAccessCache) {
          setCanGoLive(false);
        }
      }

    };

    // User already ready hai to turant check
    if (auth.currentUser) {
      checkHostPermission(auth.currentUser.uid);

      return () => {
        isMounted = false;
      };
    }

    // Warna auth ready hone ka wait karo (pehle yahin atak jata tha)
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        checkHostPermission(user.uid);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };

  }, []);


  // --------------------------------------------------
  // CAMERA + MICROPHONE PERMISSION (no MediaLibrary)
  // --------------------------------------------------

  useEffect(() => {
    Promise.all([requestCameraPermission(), requestMicrophonePermission()]).catch((error) =>
      console.warn('Camera/Microphone Permission Error:', error)
    );
  }, [requestCameraPermission, requestMicrophonePermission]);


  // --------------------------------------------------
  // CAMERA READY / ERROR / SWITCH
  // --------------------------------------------------

  const handleCameraReady = useCallback(() => {
    if (mountedRef.current) setIsCameraReady(true);
    // Pause / resume (segments) support: Android + iOS 18+
    try {
      const f = cameraRef.current?.getSupportedFeatures?.();
      canPauseRef.current = !!(f && f.toggleRecordingAsyncAvailable) ||
        typeof cameraRef.current?.toggleRecordingAsync === 'function';
    } catch (_) {
      canPauseRef.current = false;
    }
  }, []);

  const handleCameraMountError = useCallback((error: any) => {
    console.error('Camera Mount Error:', error);
    if (mountedRef.current) {
      setIsCameraReady(false);
      Alert.alert('Camera Error', 'Camera start nahi ho saki. Please camera permission check karein.');
    }
  }, []);

  const toggleCameraFacing = useCallback(() => {
    if (recordingRef.current) return;
    setIsCameraReady(false);
    setFacing((c) => (c === 'back' ? 'front' : 'back'));
  }, []);


  // --------------------------------------------------
  // FILTER: swipe / pick
  // --------------------------------------------------

  const pickFilter = useCallback((id: string) => {
    setFilterId(id);
    setToastTick((t) => t + 1);
  }, []);

  const onSwipe = useCallback((dir: number) => {
    if (recordingRef.current) return;
    setFilterId((cur) => {
      const i = SWIPE_FILTERS.findIndex((f) => f.id === cur);
      const n = SWIPE_FILTERS.length;
      return SWIPE_FILTERS[(Math.max(0, i) + dir + n) % n].id;
    });
    setToastTick((t) => t + 1);
  }, []);

  const onTapCamera = useCallback(() => {
    if (sheetRef.current) setSheet(null);
  }, []);

  const setBeautyValue = useCallback((id: string, v: number) => {
    setBeauty((b) => (b[id] === v ? b : { ...b, [id]: v }));
  }, []);

  const resetBeauty = useCallback(() => {
    const zero: Record<string, number> = {};
    VIDEO_FX.BEAUTY_LIVE_IDS.forEach((id: string) => { zero[id] = 0; });
    setBeauty(zero);
  }, []);

  const onDuration = useCallback((d: number) => {
    setMaxDuration(d);
    setStopAt(d);
  }, []);


  // --------------------------------------------------
  // DRAFTS count (camera khulte / wapas aate hi)
  // --------------------------------------------------

  const isCameraFocused = useIsFocused();
  useEffect(() => {
    if (!isCameraFocused) return;
    countDrafts().then((n) => mountedRef.current && setDraftCount(n)).catch(() => {});
  }, [isCameraFocused]);


  // --------------------------------------------------
  // PICK VIDEO FROM GALLERY
  // --------------------------------------------------

  const musicParams = useMemo(() => ({
    audioUrl,
    musicName,
    musicImage: profile,
    musicArtist: username,
    musicId,
  }), [audioUrl, musicName, profile, username, musicId]);

  const pickVideo = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: true,
        quality: 1,
        selectionLimit: 1,
      });
      if (result.canceled) return;

      const selectedVideo = result.assets?.[0]?.uri;
      if (!selectedVideo) {
        Alert.alert('Video', 'Video select nahi hua.');
        return;
      }
      setThumbnail(selectedVideo);

      router.push({
        pathname: '/EditView',
        params: {
          videoUri: selectedVideo,
          ...musicParams,
          videoEffect: fxRef.current.filterId,
          // Gallery video par speed nahi lagti (wo camera record ke liye hai)
          videoFx: buildFxString(false),
        },
      });
    } catch (error) {
      console.error('Gallery Error:', error);
      Alert.alert('Error', 'Gallery se video select nahi ho saka.');
    }
  }, [router, musicParams, buildFxString]);


  // --------------------------------------------------
  // SELECTED MUSIC: preload once for smooth recording
  // --------------------------------------------------
  // Camera focus se bahar jaate hi (EditView/MusicSelect khulte hi) gaane ka
  // player release ho jata hai (OutOfMemory se bachav). Wapas aate hi reload.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isCameraFocused) return;
      if (!audioUrl || typeof audioUrl !== 'string') return;
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: false, isLooping: false, progressUpdateIntervalMillis: 250 }
        );
        if (cancelled) { await sound.unloadAsync(); return; }
        musicSoundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (status?.isLoaded && status.didJustFinish && recordingRef.current) {
            finishRef.current();
          }
        });
      } catch (e) { console.log('Music preload error:', e); }
    };
    load();
    return () => {
      cancelled = true;
      const sound = musicSoundRef.current;
      musicSoundRef.current = null;
      if (sound) sound.unloadAsync().catch(() => {});
    };
  }, [audioUrl, isCameraFocused]);


  // --------------------------------------------------
  // SEGMENT RECORDING
  // --------------------------------------------------
  // Tap = record, tap again = pause (segment), tap = continue...
  // ⌫ = last segment delete, ✓ = finish -> EditView.
  // Pause/resume ek hi file me hota hai (toggleRecordingAsync), deleted
  // segments server par `keep` ranges se kat jaate hain.
  // Speed: 2x par gaana 0.5x chalta hai, server video 2x karta hai -> sync.

  const keptSec = () =>
    segmentsRef.current.filter((g) => !g.deleted).reduce((t, g) => t + (g.b - g.a), 0);

  const publishSegs = useCallback((running: boolean) => {
    const maxRaw = Math.max(1, fxRef.current.stopAt * fxRef.current.speed);
    let acc = 0;
    const marks: number[] = [];
    segmentsRef.current.filter((g) => !g.deleted).forEach((g) => {
      acc += g.b - g.a;
      marks.push(Math.min(1, acc / maxRaw));
    });
    setSegUi({
      keptMs: keptSec() * 1000,
      since: running ? segStartWallRef.current : 0,
      marks,
      count: marks.length,
    });
  }, []);

  const clearAutoStop = () => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  };

  // Max (Time sheet ka pause point) tak pahunche to pause / finish
  const armAutoStop = useCallback(() => {
    clearAutoStop();
    const { stopAt: outSec, speed: sp, maxDuration: maxD } = fxRef.current;
    const left = Math.max(0.05, outSec * sp - keptSec());
    autoStopRef.current = setTimeout(() => {
      if (!recordingRef.current) return;
      if (outSec < maxD && canPauseRef.current) pauseRef.current();
      else finishRef.current();
    }, left * 1000);
  }, []);

  const playMusicAtKept = useCallback(async () => {
    const sound = musicSoundRef.current;
    if (!sound) return;
    const sp = fxRef.current.speed;
    try {
      await sound.pauseAsync();
      await sound.setRateAsync(VIDEO_FX.musicRateFor(sp));
      // gaana wahin se jahan tak rakha hua video pahuncha hai
      await sound.setPositionAsync((musicStart + keptSec() / sp) * 1000);
    } catch (_) {}
    sound.playAsync().catch(() => {});
  }, [musicStart]);

  const resetSession = () => {
    clearAutoStop();
    recordingRef.current = false;
    segmentsRef.current = [];
    fileCursorRef.current = 0;
    segStartWallRef.current = 0;
    if (mountedRef.current) {
      setRecMode('idle');
      setSegUi({ keptMs: 0, since: 0, marks: [], count: 0 });
    }
    if (musicSoundRef.current) {
      musicSoundRef.current.pauseAsync().catch(() => {});
      musicSoundRef.current.setRateAsync(1).catch(() => {});
    }
  };

  // Close the running segment (wall clock -> file time)
  const closeSegment = () => {
    if (!segStartWallRef.current) return;
    const len = Math.max(0, (Date.now() - segStartWallRef.current) / 1000);
    const a = fileCursorRef.current;
    fileCursorRef.current = a + len;
    if (len > 0.05) segmentsRef.current.push({ a, b: fileCursorRef.current, deleted: false });
    segStartWallRef.current = 0;
  };

  const startRecording = useCallback(async () => {
    if (!cameraRef.current || recordingRef.current) return;

    if (!cameraPermission?.granted || !microphonePermission?.granted) {
      Alert.alert('Permission', 'Camera aur Microphone allow karein.');
      return;
    }
    if (!isCameraReady) {
      Alert.alert('Wait', 'Camera ready ho raha hai, thoda rukiye.');
      return;
    }

    const { speed: recSpeed, stopAt: outSec } = fxRef.current;
    const rawMaxSec = Math.max(1, outSec * recSpeed);

    try {
      recordingRef.current = true;
      discardRef.current = false;
      segmentsRef.current = [];
      fileCursorRef.current = 0;
      setSheet(null);

      const videoPromise = cameraRef.current.recordAsync({
        quality: '720p',
        // segments me deleted hisse bhi file me rehte hain, isliye
        // pause support ho to limit hum khud lagate hain
        maxDuration: canPauseRef.current ? 300 : Math.ceil(rawMaxSec),
      });

      segStartWallRef.current = Date.now();
      setRecMode('recording');
      publishSegs(true);
      armAutoStop();
      playMusicAtKept();

      const video = await videoPromise;

      // ---- recording khatam (✓ / limit / gaana khatam) ----
      clearAutoStop();
      closeSegment();
      const segs = segmentsRef.current;
      const fileTotal = fileCursorRef.current;
      const anyDeleted = segs.some((g) => g.deleted);
      const kept = segs.filter((g) => !g.deleted).map((g) => [g.a, g.b]);
      const discard = discardRef.current;
      resetSession();

      if (discard || !video?.uri || !mountedRef.current) return;
      if (anyDeleted && !kept.length) return;

      router.push({
        pathname: '/EditView',
        params: {
          videoUri: video.uri,
          ...musicParams,
          videoEffect: fxRef.current.filterId,
          videoFx: buildFxString(true, anyDeleted ? kept : []),
          // RAW file duration. Server keep ranges + speed se final banata hai.
          videoDuration: String(Math.max(0.05, fileTotal).toFixed(3)),
        },
      });
    } catch (error) {
      console.error('Recording Error:', error);
      resetSession();
      if (mountedRef.current) Alert.alert('Recording Error', 'Video recording start nahi ho saki.');
    }
  }, [
    cameraPermission?.granted,
    microphonePermission?.granted,
    isCameraReady,
    router,
    musicParams,
    buildFxString,
    publishSegs,
    armAutoStop,
    playMusicAtKept,
  ]);

  const pauseRecording = useCallback(async () => {
    if (!recordingRef.current || !segStartWallRef.current) return;
    clearAutoStop();
    closeSegment();
    if (musicSoundRef.current) musicSoundRef.current.pauseAsync().catch(() => {});
    setRecMode('paused');
    publishSegs(false);
    try {
      await cameraRef.current.toggleRecordingAsync();
    } catch (e) {
      console.log('pause failed, finishing:', e);
      finishRef.current();
    }
  }, [publishSegs]);
  const pauseRef = useRef<() => void>(() => {});
  pauseRef.current = pauseRecording;

  const resumeRecording = useCallback(async () => {
    if (!recordingRef.current || segStartWallRef.current) return;
    const { stopAt: outSec, speed: sp } = fxRef.current;
    if (keptSec() >= outSec * sp - 0.1) {
      Alert.alert('Time', 'Max time pura ho gaya. ✓ dabaiye ya ⌫ se aakhri hissa hataiye.');
      return;
    }
    try {
      await cameraRef.current.toggleRecordingAsync();
    } catch (e) {
      console.log('resume failed:', e);
      return;
    }
    segStartWallRef.current = Date.now();
    setRecMode('recording');
    publishSegs(true);
    armAutoStop();
    playMusicAtKept();
  }, [publishSegs, armAutoStop, playMusicAtKept]);

  // ✓ : recording band -> recordAsync resolve -> EditView
  const finishRecording = useCallback(async () => {
    if (!cameraRef.current || !recordingRef.current) return;
    clearAutoStop();
    if (musicSoundRef.current) musicSoundRef.current.pauseAsync().catch(() => {});
    try {
      await cameraRef.current.stopRecording();
    } catch (error) {
      console.error('Stop Recording Error:', error);
      resetSession();
    }
  }, []);
  finishRef.current = finishRecording;

  // ⌫ : aakhri segment hatao
  const deleteLastSegment = useCallback(() => {
    const segs = segmentsRef.current;
    for (let i = segs.length - 1; i >= 0; i--) {
      if (!segs[i].deleted) {
        segs[i].deleted = true;
        break;
      }
    }
    publishSegs(false);
  }, [publishSegs]);

  // X / back while paused: poori recording hata do
  const discardRecording = useCallback(() => {
    Alert.alert('Recording hataye?', 'Abhi tak ki recording delete ho jayegi.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          discardRef.current = true;
          finishRecording();
        },
      },
    ]);
  }, [finishRecording]);
  const discardRef2 = useRef(discardRecording);
  discardRef2.current = discardRecording;


  // --------------------------------------------------
  // RECORD BUTTON
  // --------------------------------------------------

  startRecordingRef.current = startRecording;

  const handleRecord = useCallback(async () => {
    if (countdownTimeoutRef.current) {
      cancelCountdown();
      return;
    }
    if (recordingRef.current) {
      if (segStartWallRef.current) {
        // recording chal rahi -> pause (ya pause support nahi to finish)
        if (canPauseRef.current) await pauseRecording();
        else await finishRecording();
      } else {
        await resumeRecording();
      }
      return;
    }
    setSheet(null);

    const ready = cameraPermission?.granted && microphonePermission?.granted && isCameraReady;
    if (timerDelay > 0 && ready) {
      beginCountdown(timerDelay);
      return;
    }
    await startRecording();
  }, [
    startRecording, pauseRecording, resumeRecording, finishRecording, cancelCountdown, beginCountdown,
    timerDelay, isCameraReady, cameraPermission?.granted, microphonePermission?.granted,
  ]);

  // Opening the camera never auto-records: user taps the button.


  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  const insets = useSafeAreaInsets();

  const handleClose = useCallback(() => {
    if (countdownTimeoutRef.current) {
      cancelCountdown();
      return;
    }
    if (recordingRef.current) {
      discardRecording();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router, cancelCountdown, discardRecording]);

  const openMusic = useCallback(() => {
    router.push({ pathname: '/MusicSelect', params: { returnTo: '/camera' } });
  }, [router]);

  const toggleSheet = useCallback((name: 'beauty' | 'time' | 'stickers') => {
    setSheet((s) => (s === name ? null : name));
  }, []);

  const busy = isRecording || countdown !== null;
  const paused = recMode === 'paused';
  const inSession = recMode !== 'idle';   // file khuli hai (recording / paused)
  const sheetOpen = sheet !== null && !busy && !inSession;

  const modeBarH = canGoLive ? 44 : 0;
  const controlsBottom = insets.bottom + 18 + modeBarH;
  const speedBottom = controlsBottom + 96;
  const recTotalMs = Math.max(1, stopAt * speed) * 1000;

  return (
    <View style={styles.container}>

      {/* CAMERA (pinch = zoom, swipe = filter, tap = sheet band) */}
      <ZoomableCamera
        ref={cameraRef}
        facing={facing}
        enableTorch={torchOn && facing === 'back'}
        indicatorBottom={speedBottom + 50}
        onCameraReady={handleCameraReady}
        onMountError={handleCameraMountError}
        onSwipe={onSwipe}
        onTap={onTapCamera}
      />

      {/* FILTER + BEAUTY PREVIEW (final look server par render hota hai) */}
      {!compare && <FilterOverlay filterId={filterId} fx={previewFx} />}

      {/* "Barbie / Portrait" */}
      <FilterToast label={currentFilter.label} cat={currentFilter.cat} tick={toastTick} />

      {countdown !== null && <CountdownOverlay value={countdown} />}

      {/* STICKER (light / frame) preview */}
      {sticker !== 'none' && <StickerOverlay id={sticker} />}


      {/* TOP BAR : X + Select Music */}
      {!isRecording && (
        <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
          <TouchableOpacity style={styles.closeBtn} activeOpacity={0.8} onPress={handleClose} hitSlop={8}>
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.topMusicBtn} activeOpacity={0.8} disabled={busy || inSession} onPress={openMusic}>
            <Ionicons name="musical-notes-outline" size={16} color="#fff" />
            <Text style={styles.topMusic} numberOfLines={1}>
              {musicName ? String(musicName) : 'Select Music'}
            </Text>
          </TouchableOpacity>

          <View style={styles.closeBtn} />
        </View>
      )}


      {/* RIGHT COLUMN: Switch / Time / Speed / Beauty / Flash */}
      {!isRecording && (
        <View style={[styles.sideIcons, { top: insets.top + 8 }]}>
          <SideBtn
            icon={<MaterialCommunityIcons name="camera-flip-outline" size={27} color="#fff" />}
            label="Switch"
            onPress={toggleCameraFacing}
            disabled={busy || inSession}
          />
          <SideBtn
            icon={<Ionicons name="timer-outline" size={27} color={sheet === 'time' || timerDelay > 0 ? YELLOW : '#fff'} />}
            label={timerDelay > 0 ? `${timerDelay}s` : 'Time'}
            active={sheet === 'time' || timerDelay > 0}
            onPress={() => toggleSheet('time')}
            disabled={busy || inSession}
          />
          <SideBtn
            icon={<Ionicons name="speedometer-outline" size={27} color={showSpeed ? YELLOW : '#fff'} />}
            label="Speed"
            badge={showSpeed ? 'ON' : 'OFF'}
            active={showSpeed}
            onPress={() => setShowSpeed((v) => !v)}
            disabled={busy}
          />
          <SideBtn
            icon={<MaterialCommunityIcons name="magic-staff" size={27} color={sheet === 'beauty' ? YELLOW : '#fff'} />}
            label="Beauty"
            active={sheet === 'beauty' || filterId !== 'none'}
            onPress={() => toggleSheet('beauty')}
            disabled={busy || inSession}
          />
          {facing === 'back' && (
            <SideBtn
              icon={<Ionicons name={torchOn ? 'flash' : 'flash-outline'} size={26} color={torchOn ? YELLOW : '#fff'} />}
              label="Flash"
              active={torchOn}
              onPress={() => setTorchOn((v) => !v)}
            />
          )}
        </View>
      )}


      {/* SPEED PILLS (0.3x .. 3x) */}
      {showSpeed && !busy && !sheetOpen && (
        <SpeedBar
          value={speed}
          // segments ke beech speed nahi badalti (gaana sync rehna chahiye)
          onChange={inSession ? () => {} : setSpeed}
          bottom={speedBottom}
          locked={inSession}
        />
      )}


      {/* BOTTOM: Stickers | Record | Upload */}
      {!sheetOpen && (
        <View style={[styles.bottomControls, { bottom: controlsBottom }]}>
          <View style={styles.sideZone}>
            {!busy && (
              <TouchableOpacity
                style={styles.smallBtn}
                onPress={() => toggleSheet('stickers')}
                activeOpacity={0.8}
                disabled={inSession}
              >
                <Text style={styles.stickerEmoji}>😊</Text>
                <Text style={[styles.smallLbl, sticker !== 'none' && { color: YELLOW }]}>Stickers</Text>
              </TouchableOpacity>
            )}
          </View>

          <RecordButton
            mode={recMode}
            keptMs={segUi.keptMs}
            since={segUi.since}
            marks={segUi.marks}
            totalMs={recTotalMs}
            speed={speed}
            countdown={countdown !== null}
            onPress={handleRecord}
            disabled={!isCameraReady && !inSession}
          />

          <View style={styles.sideZone}>
            {paused ? (
              <View style={styles.segActions}>
                {segUi.count > 0 && (
                  <TouchableOpacity onPress={deleteLastSegment} activeOpacity={0.8} style={styles.delSegBtn} hitSlop={8}>
                    <Ionicons name="backspace-outline" size={22} color="#fff" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={finishRecording}
                  activeOpacity={0.8}
                  style={[styles.doneBtn, segUi.count === 0 && { opacity: 0.4 }]}
                  disabled={segUi.count === 0}
                >
                  <Ionicons name="checkmark" size={24} color={YELLOW} />
                </TouchableOpacity>
              </View>
            ) : isRecording ? null : !busy ? (
              <View style={{ alignItems: 'center' }}>
                {draftCount > 0 && (
                  <TouchableOpacity onPress={() => router.push('/drafts')} style={styles.draftPill} activeOpacity={0.8}>
                    <Text style={styles.draftPillText}>Drafts {draftCount}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={pickVideo} activeOpacity={0.8} style={styles.smallBtn}>
                  <View style={styles.uploadBox}>
                    {thumbnail ? (
                      <Image source={{ uri: thumbnail }} style={styles.uploadImg} />
                    ) : (
                      <Ionicons name="image" size={20} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.smallLbl}>Upload</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      )}


      {/* MODE BAR: Video | LIVE | Audio */}
      {canGoLive && !busy && !sheetOpen && !inSession && (
        <View style={[styles.modeBar, { bottom: insets.bottom + 10 }]}>
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.mTxt, { color: '#fff' }]}>Video</Text>
            <View style={styles.modeDot} />
          </View>
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/livevideostart')}>
            <Text style={styles.mTxt}>LIVE</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/LiveStart')}>
            <Text style={styles.mTxt}>Audio</Text>
          </TouchableOpacity>
        </View>
      )}


      {/* SHEETS */}
      {sheetOpen && sheet === 'beauty' && (
        <BeautySheet
          bottomInset={insets.bottom}
          filterId={filterId}
          onFilter={pickFilter}
          intensity={intensity}
          onIntensity={setIntensity}
          beauty={beauty}
          onBeauty={setBeautyValue}
          onResetBeauty={resetBeauty}
          onCompare={setCompare}
        />
      )}

      {sheetOpen && sheet === 'time' && (
        <TimeSheet
          bottomInset={insets.bottom}
          duration={maxDuration}
          onDuration={onDuration}
          countdown={timerDelay}
          onCountdown={setTimerDelay}
          stopAt={stopAt}
          onStopAt={setStopAt}
          seed={String(audioUrl || musicName || 'topking')}
          onStart={handleRecord}
        />
      )}

      {sheetOpen && sheet === 'stickers' && (
        <StickerSheet value={sticker} onChange={setSticker} bottomInset={insets.bottom} />
      )}
    </View>
  );
}

// ==================================================
// STYLES
// ==================================================

const textShadow = {
  textShadowColor: 'rgba(0,0,0,0.6)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
};

const ui = StyleSheet.create({
  zoomIndicator: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, zIndex: 15, gap: 8,
  },
  zoomTrack: { width: 120, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  zoomFill: { height: 4, backgroundColor: '#fff' },
  zoomPct: { color: '#fff', fontSize: 12, fontWeight: 'bold', minWidth: 34, textAlign: 'right' },

  countWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 25 },
  countText: {
    fontSize: 150, fontWeight: '800', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 12,
  },

  toast: { position: 'absolute', top: '30%', left: 0, right: 0, alignItems: 'center', zIndex: 12 },
  toastRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toastArrow: { color: 'rgba(255,255,255,0.7)', fontSize: 12, ...textShadow },
  toastTitle: { color: '#fff', fontSize: 22, fontWeight: '500', ...textShadow },
  toastSub: { color: 'rgba(255,255,255,0.75)', fontSize: 14, marginTop: 2, ...textShadow },

  progressTrack: {
    position: 'absolute', left: 8, right: 8, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', zIndex: 30,
  },
  progressFill: { height: 4, backgroundColor: YELLOW },
  recBadge: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, zIndex: 30,
  },
  redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff3b30', marginRight: 6 },
  recText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  sideBtn: { alignItems: 'center', width: 56, marginBottom: 16 },
  sideTxt: { fontSize: 11, fontWeight: '600', color: '#fff', marginTop: 3, ...textShadow },
  sideBadge: {
    position: 'absolute', right: -9, bottom: -2, backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4, paddingHorizontal: 2,
  },
  sideBadgeText: { color: '#fff', fontSize: 7, fontWeight: '800' },

  ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringLabel: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 8, ...textShadow },
  recInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: YELLOW },
  recInnerIdle: { borderWidth: 4, borderColor: '#fff', width: 80, height: 80, borderRadius: 40 },
  recInnerRec: { width: 30, height: 30, borderRadius: 7, backgroundColor: '#ff3b30' },
  recInnerPaused: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },

  speedBar: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 18, padding: 3, zIndex: 10,
  },
  speedPill: { minWidth: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  speedPillOn: { backgroundColor: '#fff' },
  speedText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  speedTextOn: { color: '#000', fontWeight: '800' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  topBar: {
    position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 12, zIndex: 10,
  },
  closeBtn: { width: 64, height: 44, justifyContent: 'center' },
  topMusicBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '50%',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18,
  },
  topMusic: { fontSize: 15, fontWeight: '600', color: '#fff', flexShrink: 1, ...textShadow },

  sideIcons: { position: 'absolute', right: 10, zIndex: 11, alignItems: 'center' },

  bottomControls: {
    position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 36, zIndex: 10,
  },
  sideZone: { width: 76, alignItems: 'center' },
  smallBtn: { alignItems: 'center' },
  smallLbl: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 4, ...textShadow },
  stickerEmoji: { fontSize: 30 },

  recOuter: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  recInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: YELLOW },
  recInnerActive: { width: 30, height: 30, borderRadius: 7, backgroundColor: '#ff3b30' },

  uploadBox: {
    width: 34, height: 34, borderRadius: 6, borderWidth: 1.5, borderColor: '#fff', overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#7b5cff',
  },
  uploadImg: { width: '100%', height: '100%' },
  draftPill: {
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6,
  },
  draftPillText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  doneBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  segActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  delSegBtn: {
    width: 36, height: 28, borderRadius: 6, borderWidth: 1.5, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)',
  },

  modeBar: {
    position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center',
    alignItems: 'flex-start', gap: 34, zIndex: 10,
  },
  mTxt: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.6)', ...textShadow },
  modeDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff', marginTop: 4 },

  stickerPanel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 340, zIndex: 40,
    backgroundColor: 'rgba(20,20,20,0.96)', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16,
  },
  stickerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  stickerTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  stkGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  stkItem: { fontSize: 42, margin: 10 },
});
