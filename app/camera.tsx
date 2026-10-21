import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  BackHandler,
  PanResponder,
  Animated,
} from 'react-native';

import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import * as ImagePicker from 'expo-image-picker';
import { Audio } from '../utils/audio';

import { Ionicons } from '@expo/vector-icons';

import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from 'expo-camera';

import {
  useRouter,
  useLocalSearchParams,
} from 'expo-router';
import { useIsFocused } from '@react-navigation/native';

import {
  getDoc,
  doc,
} from 'firebase/firestore';

import {
  getAuth,
  onAuthStateChanged,
} from 'firebase/auth';

import { db } from './firebaseConfig';


// ==================================================
// PINCH ZOOM CAMERA
// --------------------------------------------------
// Do ungliyon se pinch karke zoom in / zoom out.
// Photo/video banane se pehle bhi chalta hai aur
// recording ke dauran bhi.
//
// SMOOTH kyu hai:
//  - Zoom state sirf is chhote component me hai, isliye
//    poora page re-render nahi hota.
//  - Har frame me sirf ek baar update (requestAnimationFrame).
// ==================================================

// Kitne pixel ki pinch se poora zoom (0 -> 1) ho.
// Chhota number = zoom tez, bada number = zoom dheere.
const PINCH_RANGE = 450;

// ==================================================
// TIKI THEME + LABELS
// --------------------------------------------------
// Labels English me hain. Hindi chahiye to bas yahan text badal do.
// ==================================================

const YELLOW = '#FFD60A';

const LABELS = {
  addMusic: 'Add Music',
  flip: 'Flip',
  timer: 'Timer',
  speed: 'Speed',
  beauty: 'Beauty',
  flash: 'Flash',
  sticker: 'Stickers',
};

// Zoom presets (expo-camera zoom 0 -> 1 hota hai, device ke hisaab
// se 1.0X = 0). 0.3X / 0.5X ultra-wide lens maangte hain, jo
// expo-camera ke zoom prop se possible nahi hai.
const ZOOM_PRESETS = [
  { label: '1.0X', value: 0 },
  { label: '2.0X', value: 0.12 },
  { label: '3.0X', value: 0.25 },
];

const getDistance = (touches: any[]) => {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
};

const ZoomableCamera = React.memo(
  React.forwardRef<any, any>(
    ({ facing, enableTorch, pillsBottom, onCameraReady, onMountError }, ref) => {

      const [zoom, setZoom] = useState(0);
      const [showIndicator, setShowIndicator] = useState(false);

      const zoomRef = useRef(0);
      const startZoomRef = useRef(0);
      const startDistRef = useRef(0);
      const rafRef = useRef<number | null>(null);
      const hideTimerRef = useRef<any>(null);


      // Camera switch hone par zoom reset
      useEffect(() => {
        zoomRef.current = 0;
        setZoom(0);
      }, [facing]);


      useEffect(() => {
        return () => {
          if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
          }
          if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
          }
        };
      }, []);


      const scheduleUpdate = () => {
        if (rafRef.current) {
          return;
        }
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setZoom(zoomRef.current);
        });
      };


      const endPinch = () => {
        startDistRef.current = 0;

        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
        }
        hideTimerRef.current = setTimeout(() => {
          setShowIndicator(false);
        }, 900);
      };


      const selectPreset = (value: number) => {
        zoomRef.current = value;
        setZoom(value);
      };

      const activePreset = ZOOM_PRESETS.findIndex(
        (p) => Math.abs(p.value - zoom) < 0.03
      );


      const panResponder = useRef(
        PanResponder.create({

          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderTerminationRequest: () => false,

          onPanResponderMove: (evt) => {

            const touches = evt.nativeEvent.touches;

            // Ek ungli = kuch nahi. Pinch ke liye 2 ungliyan chahiye.
            if (touches.length < 2) {
              startDistRef.current = 0;
              return;
            }

            const distance = getDistance(touches);

            // Pinch ki shuruaat
            if (!startDistRef.current) {
              startDistRef.current = distance;
              startZoomRef.current = zoomRef.current;

              if (hideTimerRef.current) {
                clearTimeout(hideTimerRef.current);
              }
              setShowIndicator(true);
              return;
            }

            const next = Math.min(
              1,
              Math.max(
                0,
                startZoomRef.current +
                  (distance - startDistRef.current) / PINCH_RANGE
              )
            );

            if (Math.abs(next - zoomRef.current) > 0.002) {
              zoomRef.current = next;
              scheduleUpdate();
            }
          },

          onPanResponderRelease: endPinch,
          onPanResponderTerminate: endPinch,

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

          {/* Pinch touch layer (controls iske upar hain) */}
          <View
            style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
            {...panResponder.panHandlers}
          />

          {/* Zoom indicator */}
          {showIndicator && (
            <View
              style={[zoomStyles.indicator, { bottom: pillsBottom + 56 }]}
              pointerEvents="none"
            >
              <Ionicons name="search" size={16} color="#fff" />
              <View style={zoomStyles.track}>
                <View
                  style={[
                    zoomStyles.fill,
                    { width: `${Math.round(zoom * 100)}%` },
                  ]}
                />
              </View>
              <Text style={zoomStyles.pct}>
                {Math.round(zoom * 100)}%
              </Text>
            </View>
          )}

          {/* Zoom presets (1.0X / 2.0X / 3.0X) */}
          <View
            style={[zoomStyles.pills, { bottom: pillsBottom }]}
          >
            {ZOOM_PRESETS.map((p, i) => (
              <TouchableOpacity
                key={p.label}
                activeOpacity={0.8}
                onPress={() => selectPreset(p.value)}
                style={[
                  zoomStyles.pill,
                  i === activePreset && zoomStyles.pillActive,
                ]}
              >
                <Text
                  style={[
                    zoomStyles.pillText,
                    i === activePreset && zoomStyles.pillTextActive,
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      );
    }
  )
);


// ==================================================
// COUNTDOWN OVERLAY (3 / 2 / 1)
// Native driver animation = bilkul smooth
// ==================================================

const CountdownOverlay = ({ value }: { value: number }) => {

  const scale = useRef(new Animated.Value(1.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scale.setValue(1.6);
    opacity.setValue(0);

    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [value, scale, opacity]);

  return (
    <View style={zoomStyles.countWrap} pointerEvents="none">
      <Animated.Text
        style={[
          zoomStyles.countText,
          { opacity, transform: [{ scale }] },
        ]}
      >
        {value}
      </Animated.Text>
    </View>
  );
};


const zoomStyles = StyleSheet.create({

  pills: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 22,
    padding: 4,
    zIndex: 10,
  },

  pill: {
    minWidth: 46,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pillActive: {
    backgroundColor: 'rgba(0,0,0,0.65)',
  },

  pillText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },

  pillTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },

  indicator: {
    position: 'absolute',
    bottom: 235,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 15,
    gap: 8,
  },

  track: {
    width: 120,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },

  fill: {
    height: 4,
    backgroundColor: '#fff',
  },

  pct: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    minWidth: 34,
    textAlign: 'right',
  },

  countWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 25,
  },

  countText: {
    fontSize: 150,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },

});


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


  // --------------------------------------------------
  // STATES
  // --------------------------------------------------

  const [canGoLive, setCanGoLive] = useState(() => {
    const uid = getAuth().currentUser?.uid;
    return liveAccessCache && liveAccessCache.uid === uid
      ? liveAccessCache.allowed
      : false;
  });

  const [showStickers, setShowStickers] =
    useState(false);

  const [isRecording, setIsRecording] =
    useState(false);

  const [facing, setFacing] =
    useState('back');

  const [seconds, setSeconds] =
    useState(0);

  const [thumbnail, setThumbnail] =
    useState(null);

  const [isCameraReady, setIsCameraReady] =
    useState(false);


  // --------------------------------------------------
  // REFS
  // --------------------------------------------------

  const timerRef = useRef(null);

  const cameraRef = useRef(null);

  const recordingRef = useRef(false);

  const mountedRef = useRef(true);
  const musicSoundRef = useRef(null);
  const autoRecordStartedRef = useRef(false);
  const recordingStartedAtRef = useRef(0);


  // --------------------------------------------------
  // SELF TIMER (Off / 3s / 5s / 10s)
  // --------------------------------------------------

  const TIMER_OPTIONS = [0, 3, 5, 10];

  const [timerDelay, setTimerDelay] = useState(0);

  const [showTimerOptions, setShowTimerOptions] =
    useState(false);

  // null = countdown chal nahi raha, warna 3, 2, 1...
  const [countdown, setCountdown] =
    useState<number | null>(null);

  const countdownTimeoutRef = useRef<any>(null);

  // startRecording ka latest version (stale closure se bachne ke liye)
  const startRecordingRef = useRef<() => void>(() => {});


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

      if (!mountedRef.current) {
        return;
      }

      if (remaining <= 0) {
        countdownTimeoutRef.current = null;
        setCountdown(null);

        // Countdown khatam -> camera chalu
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

  const [
    cameraPermission,
    requestCameraPermission,
  ] = useCameraPermissions();

  const [
    microphonePermission,
    requestMicrophonePermission,
  ] = useMicrophonePermissions();


  // --------------------------------------------------
  // STICKERS
  // --------------------------------------------------

  const stickers = [
    '🔥',
    '😂',
    '❤️',
    '✨',
    '👑',
    '💯',
    '😎',
    '💀',
    '🎉',
    '🎸',
    '🌈',
    '🍕',
    '👀',
    '💡',
    '🚀',
    '⭐',
  ];


  // --------------------------------------------------
  // COMPONENT CLEANUP
  // --------------------------------------------------

  useEffect(() => {

    mountedRef.current = true;

    return () => {

      mountedRef.current = false;

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      recordingRef.current = false;

      if (countdownTimeoutRef.current) {
        clearTimeout(countdownTimeoutRef.current);
        countdownTimeoutRef.current = null;
      }

    };

  }, []);


  // --------------------------------------------------
  // HARDWARE BACK BUTTON
  // --------------------------------------------------

  useEffect(() => {

    const backAction = () => {

      if (recordingRef.current) {
        return true;
      }

      // Countdown chal raha ho to pehle back se sirf countdown cancel ho
      if (countdownTimeoutRef.current) {
        cancelCountdown();
        return true;
      }

      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }

      return true;
    };


    const subscription =
      BackHandler.addEventListener(
        'hardwareBackPress',
        backAction
      );


    return () => {
      subscription.remove();
    };

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

        const allowed =
          !!data &&
          (Boolean(data.agencyId) ||
            data.agencyApproved === true ||
            data.verified === true);

        // Cache save: agli baar camera turant sahi bar dikhayega
        liveAccessCache = { uid, allowed };

        if (isMounted) {
          setCanGoLive(allowed);
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
  // CAMERA + MICROPHONE PERMISSION
  // NO MEDIALIBRARY PERMISSION
  // --------------------------------------------------

  useEffect(() => {

    let isMounted = true;


    const initializeCamera =
      async () => {

        try {

          /*
           * Camera aur microphone ko
           * parallel request karte hain.
           *
           * MediaLibrary permission intentionally
           * nahi li ja rahi.
           */

          await Promise.all([
            requestCameraPermission(),
            requestMicrophonePermission(),
          ]);


          if (isMounted) {
            console.log(
              'Camera + Microphone permission check complete'
            );
          }

        } catch (error) {

          console.warn(
            'Camera/Microphone Permission Error:',
            error
          );

        }

      };


    initializeCamera();


    return () => {
      isMounted = false;
    };

  }, [
    requestCameraPermission,
    requestMicrophonePermission,
  ]);


  // --------------------------------------------------
  // RECORDING TIMER
  // --------------------------------------------------

  useEffect(() => {

    if (isRecording) {

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }


      timerRef.current =
        setInterval(() => {

          setSeconds(
            (previous) =>
              previous + 1
          );

        }, 1000);

    } else {

      if (timerRef.current) {

        clearInterval(
          timerRef.current
        );

        timerRef.current = null;
      }

      setSeconds(0);
    }


    return () => {

      if (timerRef.current) {

        clearInterval(
          timerRef.current
        );

        timerRef.current = null;
      }

    };

  }, [isRecording]);


  // --------------------------------------------------
  // CAMERA READY
  // --------------------------------------------------

  const handleCameraReady =
    useCallback(() => {

      if (mountedRef.current) {

        setIsCameraReady(true);

        console.log(
          'Camera READY'
        );

      }

    }, []);


  // --------------------------------------------------
  // CAMERA ERROR
  // --------------------------------------------------

  const handleCameraMountError =
    useCallback((error) => {

      console.error(
        'Camera Mount Error:',
        error
      );

      if (mountedRef.current) {

        setIsCameraReady(false);

        Alert.alert(
          'Camera Error',
          'Camera start nahi ho saki. Please camera permission check karein.'
        );

      }

    }, []);


  // --------------------------------------------------
  // CAMERA SWITCH
  // --------------------------------------------------

  const toggleCameraFacing =
    useCallback(() => {

      if (recordingRef.current) {
        return;
      }


      setIsCameraReady(false);


      setFacing(
        (current) =>
          current === 'back'
            ? 'front'
            : 'back'
      );

    }, []);


  // --------------------------------------------------
  // PICK VIDEO FROM GALLERY
  // --------------------------------------------------

  const pickVideo =
    useCallback(async () => {

      try {

        const result =
          await ImagePicker.launchImageLibraryAsync({

            mediaTypes: ['videos'],

            allowsEditing: true,

            quality: 1,

            selectionLimit: 1,

          });


        if (result.canceled) {
          return;
        }


        const selectedVideo =
          result.assets?.[0]?.uri;


        if (!selectedVideo) {

          Alert.alert(
            'Video',
            'Video select nahi hua.'
          );

          return;
        }


        /*
         * Selected video ko thumbnail ke roop me
         * bhi show kar dete hain.
         *
         * Isse MediaLibrary permission ki zarurat
         * nahi padti.
         */

        setThumbnail(selectedVideo);


        router.push({

          pathname: '/EditView',

          params: {

            videoUri: selectedVideo,

            audioUrl,

            musicName,

            musicImage: profile,

            musicArtist: username,

            musicId,

          },

        });

      } catch (error) {

        console.error(
          'Gallery Error:',
          error
        );


        Alert.alert(
          'Error',
          'Gallery se video select nahi ho saka.'
        );

      }

    }, [
      router,
      audioUrl,
      musicName,
      profile,
      username,
    ]);


  // --------------------------------------------------
  // SELECTED MUSIC: preload once for smooth recording
  // --------------------------------------------------
  // Camera focus se bahar jaate hi (EditView/MusicSelect khulte hi) gaane ka
  // ExoPlayer release ho jata hai, taaki ek hi mp4 ke 3-4 player memory
  // (OutOfMemoryError) na bharein. Wapas aate hi dobara load ho jata hai.
  const isCameraFocused = useIsFocused();
  useEffect(() => {
    let cancelled = false;
    const loadSelectedMusic = async () => {
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
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status?.isLoaded && status.didJustFinish && recordingRef.current && cameraRef.current) {
            cameraRef.current.stopRecording().catch(() => {});
          }
        });
      } catch (e) { console.log('Music preload error:', e); }
    };
    loadSelectedMusic();
    return () => {
      cancelled = true;
      const sound = musicSoundRef.current;
      musicSoundRef.current = null;
      if (sound) sound.unloadAsync().catch(() => {});
    };
  }, [audioUrl, isCameraFocused]);

  // --------------------------------------------------
  // START RECORDING
  // --------------------------------------------------

  const startRecording =
    useCallback(async () => {

      if (!cameraRef.current) {

        console.warn(
          'Camera ref missing'
        );

        return;
      }


      if (recordingRef.current) {
        return;
      }


      if (
        !cameraPermission?.granted ||
        !microphonePermission?.granted
      ) {

        Alert.alert(
          'Permission',
          'Camera aur Microphone allow karein.'
        );

        return;
      }


      if (!isCameraReady) {

        Alert.alert(
          'Wait',
          'Camera ready ho raha hai, thoda rukiye.'
        );

        return;
      }


      try {

        recordingRef.current = true;
        recordingStartedAtRef.current = Date.now();
        setIsRecording(true);

        // Reset the selected song before starting the camera. Do not await
        // playback here: the camera and song must start together.
        if (musicSoundRef.current) {
          await musicSoundRef.current.stopAsync().catch(() => {});
          await musicSoundRef.current.setPositionAsync(0).catch(() => {});
        }

        console.log('VIDEO + MUSIC RECORDING START');

        const videoPromise = cameraRef.current.recordAsync({
          quality: '720p',
          maxDuration: 60,
        });

        if (musicSoundRef.current) {
          musicSoundRef.current.playAsync().catch((e) =>
            console.log('Music playback start error:', e)
          );
        }

        const video = await videoPromise;


        console.log(
          'VIDEO RECORDING RESULT:',
          video
        );


        const recordedDurationSeconds = Math.max(
          0.05,
          (Date.now() - (recordingStartedAtRef.current || Date.now())) / 1000
        );

        recordingRef.current = false;
        recordingStartedAtRef.current = 0;

        if (musicSoundRef.current) {
          musicSoundRef.current.pauseAsync().catch(() => {});
        }

        if (mountedRef.current) {
          setIsRecording(false);
        }


        if (
          video?.uri &&
          mountedRef.current
        ) {

          router.push({

            pathname: '/EditView',

            params: {

              videoUri: video.uri,

              audioUrl,

              musicName,

              musicImage: profile,

              musicArtist: username,

            musicId,

              // Exact duration of this camera take. EditView and /merge
              // use this so a 5s take can never receive the full 15s song.
              videoDuration: String(recordedDurationSeconds.toFixed(3)),

            },

          });

        }

      } catch (error) {

        console.error(
          'Recording Error:',
          error
        );


        recordingRef.current = false;


        if (mountedRef.current) {

          setIsRecording(false);

          Alert.alert(
            'Recording Error',
            'Video recording start nahi ho saki.'
          );

        }

      }

    }, [
      cameraPermission?.granted,
      microphonePermission?.granted,
      isCameraReady,
      router,
      audioUrl,
      musicName,
      profile,
      username,
    ]);


  // --------------------------------------------------
  // STOP RECORDING
  // --------------------------------------------------

  const stopRecording =
    useCallback(async () => {

      if (
        !cameraRef.current ||
        !recordingRef.current
      ) {
        return;
      }


      try {

        console.log(
          'VIDEO RECORDING STOP'
        );


        await cameraRef.current.stopRecording();

      } catch (error) {

        console.error(
          'Stop Recording Error:',
          error
        );


        recordingRef.current = false;


        if (mountedRef.current) {
          setIsRecording(false);
        }

      }

    }, []);


  // --------------------------------------------------
  // RECORD BUTTON
  // --------------------------------------------------

  // Latest startRecording hamesha ref me rakho (countdown ke liye)
  startRecordingRef.current = startRecording;

  const handleRecord =
    useCallback(async () => {

      // 1) Countdown chal raha hai -> cancel
      if (countdownTimeoutRef.current) {
        cancelCountdown();
        return;
      }

      // 2) Recording chal rahi hai -> stop
      if (recordingRef.current) {

        await stopRecording();

        return;
      }

      setShowTimerOptions(false);

      // 3) Timer laga hai -> countdown, phir recording
      const ready =
        cameraPermission?.granted &&
        microphonePermission?.granted &&
        isCameraReady;

      if (timerDelay > 0 && ready) {

        beginCountdown(timerDelay);

        return;
      }

      // 4) Timer nahi -> turant recording
      await startRecording();

    }, [
      startRecording,
      stopRecording,
      cancelCountdown,
      beginCountdown,
      timerDelay,
      isCameraReady,
      cameraPermission?.granted,
      microphonePermission?.granted,
    ]);


  // IMPORTANT: opening Camera must NOT start recording automatically.
  // The user explicitly taps the record button to begin.
  // The selected song starts together with the recording in startRecording().
  // When the user taps again, stopRecording() lets recordAsync resolve and
  // the recorded video is sent to EditView.

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  const insets = useSafeAreaInsets();

  const [torchOn, setTorchOn] = useState(false);

  const handleClose = useCallback(() => {

    if (countdownTimeoutRef.current) {
      cancelCountdown();
      return;
    }

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }

  }, [router, cancelCountdown]);

  const busy = isRecording || countdown !== null;

  // Bottom layout (Live/Video/Audio bar ho to controls thode upar)
  const controlsBottom = insets.bottom + (canGoLive ? 64 : 28);
  const pillsBottom = controlsBottom + 84 + 18;


  return (

    <SafeAreaView
      style={styles.container}
    >

      {/* CAMERA */}

      <ZoomableCamera
        ref={cameraRef}
        facing={facing}
        enableTorch={torchOn && facing === 'back'}
        pillsBottom={pillsBottom}
        onCameraReady={handleCameraReady}
        onMountError={handleCameraMountError}
      />


      {/* COUNTDOWN 3 / 2 / 1 */}

      {countdown !== null && (
        <CountdownOverlay value={countdown} />
      )}


      {/* TOP BAR : close + music */}

      <View
        style={[styles.topBar, { top: insets.top + 8 }]}
        pointerEvents="box-none"
      >

        <TouchableOpacity
          style={styles.closeBtn}
          activeOpacity={0.8}
          onPress={handleClose}
          disabled={isRecording}
        >
          <Ionicons name="close" size={30} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.topMusicBtn}
          activeOpacity={0.8}
          disabled={busy}
          onPress={() =>
            router.push({
              pathname: '/MusicSelect',
              params: { returnTo: '/camera' },
            })
          }
        >
          <Ionicons name="musical-notes" size={16} color="#fff" />
          <Text
            style={styles.topMusic}
            numberOfLines={1}
          >
            {musicName ? String(musicName) : LABELS.addMusic}
          </Text>
        </TouchableOpacity>

        {/* spacer: music pill ko center rakhne ke liye */}
        <View style={styles.closeBtn} />

      </View>


      {/* TIMER OPTIONS (Off / 3s / 5s / 10s) */}

      {showTimerOptions &&
        !isRecording &&
        countdown === null && (

        <View
          style={[styles.timerOptions, { top: insets.top + 64 }]}
        >

          {TIMER_OPTIONS.map((value) => (

            <TouchableOpacity
              key={value}
              activeOpacity={0.8}
              style={[
                styles.timerChip,
                timerDelay === value &&
                  styles.timerChipActive,
              ]}
              onPress={() => {
                setTimerDelay(value);
                setShowTimerOptions(false);
              }}
            >

              <Text
                style={[
                  styles.timerChipText,
                  timerDelay === value &&
                    styles.timerChipTextActive,
                ]}
              >
                {value === 0 ? 'Off' : `${value}s`}
              </Text>

            </TouchableOpacity>

          ))}

        </View>

      )}


      {/* RECORDING TIMER */}

      {isRecording && (

        <View
          style={[styles.timerBadge, { top: insets.top + 64 }]}
        >

          <View
            style={styles.redDot}
          />

          <Text
            style={styles.timerText}
          >
            {seconds}s
          </Text>

        </View>

      )}


      {/* SIDE ICONS */}

      <View
        style={[styles.sideIcons, { top: insets.top + 64 }]}
      >

        {/* SWITCH CAMERA */}

        <TouchableOpacity
          style={styles.icnGrp}
          onPress={toggleCameraFacing}
          disabled={busy}
          activeOpacity={0.8}
        >
          <Ionicons name="camera-reverse-outline" size={26} color="#fff" />
          <Text style={styles.fTxt}>{LABELS.flip}</Text>
        </TouchableOpacity>


        {/* TIMER */}

        <TouchableOpacity
          style={styles.icnGrp}
          activeOpacity={0.8}
          disabled={busy}
          onPress={() =>
            setShowTimerOptions((current) => !current)
          }
        >
          <Ionicons
            name="timer-outline"
            size={26}
            color={timerDelay > 0 ? YELLOW : '#fff'}
          />
          <Text
            style={[
              styles.fTxt,
              timerDelay > 0 && { color: YELLOW },
            ]}
          >
            {timerDelay > 0 ? `${timerDelay}s` : LABELS.timer}
          </Text>
        </TouchableOpacity>


        {/* SPEED */}

        <View style={styles.icnGrp}>
          <Ionicons name="speedometer-outline" size={26} color="#fff" />
          <Text style={styles.fTxt}>{LABELS.speed}</Text>
        </View>


        {/* BEAUTY */}

        <View style={styles.icnGrp}>
          <Ionicons name="sparkles-outline" size={26} color="#fff" />
          <Text style={styles.fTxt}>{LABELS.beauty}</Text>
        </View>


        {/* FLASH (back camera) */}

        <TouchableOpacity
          style={styles.icnGrp}
          activeOpacity={0.8}
          disabled={facing !== 'back'}
          onPress={() => setTorchOn((current) => !current)}
        >
          <Ionicons
            name={torchOn ? 'flash' : 'flash-outline'}
            size={26}
            color={torchOn ? YELLOW : '#fff'}
          />
          <Text
            style={[
              styles.fTxt,
              torchOn && { color: YELLOW },
            ]}
          >
            {LABELS.flash}
          </Text>
        </TouchableOpacity>

      </View>


      {/* BOTTOM CONTROLS */}

      <View
        style={[styles.bottomControls, { bottom: controlsBottom }]}
      >

        {/* STICKERS (left) */}

        <View style={styles.leftZone}>
          <TouchableOpacity
            style={styles.stickerBtn}
            onPress={() => setShowStickers(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.stickerEmoji}>😊</Text>
            <Text style={styles.stickerLbl}>{LABELS.sticker}</Text>
          </TouchableOpacity>
        </View>


        {/* RECORD BUTTON (center) */}

        <TouchableOpacity
          onPress={handleRecord}
          activeOpacity={0.8}
          disabled={!isCameraReady && !isRecording}
        >

          <View style={styles.mainRecOuter}>

            <View
              style={[
                styles.mainRecInner,
                busy && styles.mainRecInnerActive,
              ]}
            />

          </View>

        </TouchableOpacity>


        {/* UPLOAD + DONE (right) */}

        <View style={styles.rightZone}>

          {/* UPLOAD (gallery) */}

          <TouchableOpacity
            onPress={pickVideo}
            activeOpacity={0.8}
            disabled={isRecording}
            style={[styles.uploadBtn, isRecording && { opacity: 0.4 }]}
          >
            {thumbnail ? (
              <Image
                source={{ uri: thumbnail }}
                style={styles.uploadImg}
              />
            ) : (
              <Ionicons name="images-outline" size={20} color="#fff" />
            )}
          </TouchableOpacity>


          {/* DONE (recording rok kar edit par jao) */}

          <TouchableOpacity
            onPress={stopRecording}
            activeOpacity={0.8}
            disabled={!isRecording}
            style={[styles.doneBtn, !isRecording && { opacity: 0.45 }]}
          >
            <Ionicons name="checkmark" size={26} color="#000" />
          </TouchableOpacity>

        </View>

      </View>


      {/* MODE BAR */}

      {canGoLive && (

        <View
          style={[styles.modeBar, { bottom: insets.bottom + 16 }]}
        >

          {/* LIVE */}

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/livevideostart')}
          >
            <Text style={styles.mTxt}>Live</Text>
          </TouchableOpacity>


          {/* VIDEO */}

          <Text style={[styles.mTxt, { color: YELLOW }]}>
            Video
          </Text>


          {/* AUDIO */}

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/LiveStart')}
          >
            <Text style={styles.mTxt}>Audio</Text>
          </TouchableOpacity>

        </View>

      )}


      {/* STICKER PANEL */}

      {showStickers && (

        <View
          style={styles.stickerPanel}
        >

          <TouchableOpacity
            style={styles.closeStk}
            onPress={() => setShowStickers(false)}
          >
            <Text>✕</Text>
          </TouchableOpacity>


          <ScrollView
            contentContainerStyle={styles.stkGrid}
          >

            {stickers.map((sticker, index) => (

              <Text
                key={index}
                style={{
                  fontSize: 45,
                  margin: 10,
                }}
              >
                {sticker}
              </Text>

            ))}

          </ScrollView>

        </View>

      )}

    </SafeAreaView>

  );

}


// ==================================================
// STYLES
// ==================================================

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
  },


  // ---------- top bar ----------

  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    zIndex: 10,
  },

  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  topMusicBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '60%',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  topMusic: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    flexShrink: 1,
  },


  // ---------- recording badge ----------

  timerBadge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 30,
  },

  redDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'red',
    marginRight: 8,
  },

  timerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },


  // ---------- right side icons ----------

  sideIcons: {
    position: 'absolute',
    right: 14,
    gap: 18,
    zIndex: 10,
  },

  icnGrp: {
    alignItems: 'center',
    width: 52,
  },

  fTxt: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },


  // ---------- timer options ----------

  timerOptions: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    zIndex: 15,
  },

  timerChip: {
    minWidth: 54,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },

  timerChipActive: {
    backgroundColor: YELLOW,
  },

  timerChipText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },

  timerChipTextActive: {
    color: '#000',
  },


  // ---------- bottom controls ----------

  bottomControls: {
    position: 'absolute',
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 10,
  },

  leftZone: {
    width: 116,
    alignItems: 'flex-start',
    paddingLeft: 10,
  },

  rightZone: {
    width: 116,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },

  stickerBtn: {
    alignItems: 'center',
  },

  stickerEmoji: {
    fontSize: 34,
  },

  stickerLbl: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  mainRecOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },

  mainRecInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: YELLOW,
  },

  mainRecInnerActive: {
    width: 34,
    height: 34,
    borderRadius: 8,
  },

  uploadBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  uploadImg: {
    width: '100%',
    height: '100%',
  },

  doneBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },


  // ---------- mode bar ----------

  modeBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    zIndex: 10,
  },

  mTxt: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },


  // ---------- stickers ----------

  stickerPanel: {
    position: 'absolute',
    bottom: 0,
    height: 350,
    width: '100%',
    backgroundColor: '#eee',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    zIndex: 20,
  },

  stkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },

  closeStk: {
    alignSelf: 'flex-end',
    padding: 10,
  },

});
