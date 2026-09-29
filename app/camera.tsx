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

import { SafeAreaView } from 'react-native-safe-area-context';

import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';

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

import {
  getDoc,
  doc,
} from 'firebase/firestore';

import {
  getAuth,
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

const getDistance = (touches: any[]) => {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
};

const ZoomableCamera = React.memo(
  React.forwardRef<any, any>(
    ({ facing, onCameraReady, onMountError }, ref) => {

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
            <View style={zoomStyles.indicator} pointerEvents="none">
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


export default function CameraPage() {

  const router = useRouter();

  const params = useLocalSearchParams();
  const {
    audioUrl,
    musicName,
    profile,
    username,
  } = params;


  // --------------------------------------------------
  // STATES
  // --------------------------------------------------

  const [canGoLive, setCanGoLive] = useState(false);

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


    const checkHostPermission =
      async () => {

        try {

          const auth = getAuth();

          const user = auth.currentUser;


          if (!user || !isMounted) {
            return;
          }


          const userSnap =
            await getDoc(
              doc(
                db,
                'users',
                user.uid
              )
            );


          if (
            !userSnap.exists() ||
            !isMounted
          ) {

            setCanGoLive(false);

            return;
          }


          const data =
            userSnap.data();


          console.log(
            'User Data =>',
            data
          );

          console.log(
            'agencyId =',
            data.agencyId
          );

          console.log(
            'agencyApproved =',
            data.agencyApproved
          );

          console.log(
            'waitTick =',
            data.waitTick
          );

          console.log(
            'verified =',
            data.verified
          );


          const allowed =
            Boolean(data.agencyId) ||
            data.agencyApproved === true ||
            data.verified === true;


          if (isMounted) {
            setCanGoLive(allowed);
          }

        } catch (error) {

          console.log(
            'Host permission error:',
            error
          );

          if (isMounted) {
            setCanGoLive(false);
          }

        }

      };


    checkHostPermission();


    return () => {
      isMounted = false;
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
  useEffect(() => {
    let cancelled = false;
    const loadSelectedMusic = async () => {
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
  }, [audioUrl]);

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

  return (

    <SafeAreaView
      style={styles.container}
    >

      {/* CAMERA */}

      <ZoomableCamera
        ref={cameraRef}
        facing={facing}
        onCameraReady={handleCameraReady}
        onMountError={handleCameraMountError}
      />


      {/* COUNTDOWN 3 / 2 / 1 */}

      {countdown !== null && (
        <CountdownOverlay value={countdown} />
      )}


      {/* TIMER OPTIONS (Off / 3s / 5s / 10s) */}

      {showTimerOptions &&
        !isRecording &&
        countdown === null && (

        <View style={styles.timerOptions}>

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
          style={styles.timerBadge}
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


      {/* MUSIC */}

      <Text
        style={styles.topMusic}
      >
        🎵 Select Music
      </Text>


      {/* SIDE ICONS */}

      <View
        style={styles.sideIcons}
      >

        {/* SWITCH CAMERA */}

        <TouchableOpacity
          style={styles.icnGrp}
          onPress={
            toggleCameraFacing
          }
          disabled={
            isRecording ||
            countdown !== null
          }
          activeOpacity={0.8}
        >

          <Ionicons
            name="camera-reverse-outline"
            size={30}
            color="#fff"
          />

          <Text
            style={styles.fTxt}
          >
            Switch
          </Text>

        </TouchableOpacity>


        {/* TIMER */}

        <TouchableOpacity
          style={styles.icnGrp}
          activeOpacity={0.8}
          disabled={
            isRecording ||
            countdown !== null
          }
          onPress={() =>
            setShowTimerOptions(
              (current) => !current
            )
          }
        >

          <Ionicons
            name="timer-outline"
            size={30}
            color={
              timerDelay > 0
                ? '#ffd400'
                : '#fff'
            }
          />

          <Text
            style={[
              styles.fTxt,
              timerDelay > 0 && {
                color: '#ffd400',
              },
            ]}
          >
            {timerDelay > 0
              ? `${timerDelay}s`
              : 'Timer'}
          </Text>

        </TouchableOpacity>


        {/* SPEED */}

        <View
          style={styles.icnGrp}
        >

          <Ionicons
            name="speedometer-outline"
            size={30}
            color="#fff"
          />

          <Text
            style={styles.fTxt}
          >
            Speed
          </Text>

        </View>


        {/* BEAUTY */}

        <View
          style={styles.icnGrp}
        >

          <Ionicons
            name="sparkles-outline"
            size={30}
            color="#fff"
          />

          <Text
            style={styles.fTxt}
          >
            Beauty
          </Text>

        </View>

      </View>


      {/* BOTTOM CONTROLS */}

      <View
        style={styles.bottomControls}
      >

        {/* STICKERS */}

        <TouchableOpacity
          style={styles.sideBtn}
          onPress={() =>
            setShowStickers(true)
          }
          activeOpacity={0.8}
        >

          <View
            style={[
              styles.boxFrame,
              {
                borderColor: 'red',
              },
            ]}
          />

          <Text
            style={styles.stickerLbl}
          >
            Stickers
          </Text>

        </TouchableOpacity>


        {/* RECORD BUTTON */}

        <TouchableOpacity
          onPress={handleRecord}
          activeOpacity={0.8}
          disabled={
            !isCameraReady &&
            !isRecording
          }
        >

          <View
            style={[
              styles.mainRecOuter,

              (isRecording ||
                countdown !== null) && {
                borderColor: 'red',
              },

            ]}
          >

            <View
              style={[
                styles.mainRecInner,

                (isRecording ||
                  countdown !== null) && {
                  borderRadius: 10,
                },

              ]}
            />

          </View>

        </TouchableOpacity>


        {/* UPLOAD */}

        <TouchableOpacity
          style={styles.sideBtn}
          onPress={pickVideo}
          activeOpacity={0.8}
          disabled={isRecording}
        >

          <View
            style={[
              styles.boxFrame,
              {
                borderColor: '#fff',
                overflow: 'hidden',
              },
            ]}
          >

            {thumbnail ? (

              <Image
                source={{
                  uri: thumbnail,
                }}
                style={{
                  width: '100%',
                  height: '100%',
                }}
              />

            ) : (

              <View
                style={{
                  backgroundColor: '#eee',
                  flex: 1,
                }}
              />

            )}

          </View>


          <Text
            style={styles.uploadLbl}
          >
            Upload
          </Text>

        </TouchableOpacity>

      </View>


      {/* MODE BAR */}

      {canGoLive && (

        <View
          style={styles.modeBar}
        >

          {/* LIVE */}

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() =>
              router.push(
                '/livevideostart'
              )
            }
          >

            <Text
              style={styles.mTxt}
            >
              Live
            </Text>

          </TouchableOpacity>


          {/* VIDEO */}

          <Text
            style={[
              styles.mTxt,
              {
                color: '#0056D2',
              },
            ]}
          >
            Video
          </Text>


          {/* AUDIO */}

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() =>
              router.push(
                '/LiveStart'
              )
            }
          >

            <Text
              style={styles.mTxt}
            >
              Audio
            </Text>

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
            onPress={() =>
              setShowStickers(false)
            }
          >

            <Text>
              ✕
            </Text>

          </TouchableOpacity>


          <ScrollView
            contentContainerStyle={
              styles.stkGrid
            }
          >

            {stickers.map(
              (sticker, index) => (

                <Text
                  key={index}
                  style={{
                    fontSize: 45,
                    margin: 10,
                  }}
                >
                  {sticker}
                </Text>

              )
            )}

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


  timerBadge: {
    position: 'absolute',
    top: 50,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor:
      'rgba(0,0,0,0.6)',
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


  topMusic: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    zIndex: 10,
  },


  sideIcons: {
    position: 'absolute',
    right: 20,
    top: 140,
    gap: 20,
    zIndex: 10,
  },


  icnGrp: {
    alignItems: 'center',
  },


  timerOptions: {
    position: 'absolute',
    top: 100,
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
    backgroundColor: '#ffd400',
  },


  timerChipText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },


  timerChipTextActive: {
    color: '#000',
  },


  fTxt: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },


  bottomControls: {
    position: 'absolute',
    bottom: 110,
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    zIndex: 10,
  },


  boxFrame: {
    width: 65,
    height: 65,
    borderWidth: 2,
    borderRadius: 18,
    backgroundColor:
      'rgba(255,255,255,0.15)',
  },


  mainRecOuter: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor:
      'rgba(255,255,255,0.15)',
  },


  mainRecInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ee1e44',
  },


  modeBar: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    zIndex: 10,
  },


  mTxt: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },


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


  uploadLbl: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
    position: 'relative',
    left: 12,
  },


  stickerLbl: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
    position: 'relative',
    right: -7,
  },

});