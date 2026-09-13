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
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import * as ImagePicker from 'expo-image-picker';

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


export default function CameraPage() {

  const router = useRouter();

  const {
    audioUrl,
    musicName,
    profile,
    username,
  } = useLocalSearchParams();


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

  }, [router]);


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

        setIsRecording(true);


        console.log(
          'VIDEO RECORDING START'
        );


        const video =
          await cameraRef.current.recordAsync({

            quality: '720p',

            maxDuration: 60,

          });


        console.log(
          'VIDEO RECORDING RESULT:',
          video
        );


        recordingRef.current = false;


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

  const handleRecord =
    useCallback(async () => {

      if (recordingRef.current) {

        await stopRecording();

      } else {

        await startRecording();

      }

    }, [
      startRecording,
      stopRecording,
    ]);


  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (

    <SafeAreaView
      style={styles.container}
    >

      {/* CAMERA */}

      <CameraView

        style={StyleSheet.absoluteFill}

        ref={cameraRef}

        mode="video"

        facing={facing}

        onCameraReady={
          handleCameraReady
        }

        onMountError={
          handleCameraMountError
        }

      />


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
          disabled={isRecording}
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

        <View
          style={styles.icnGrp}
        >

          <Ionicons
            name="timer-outline"
            size={30}
            color="#fff"
          />

          <Text
            style={styles.fTxt}
          >
            Timer
          </Text>

        </View>


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

              isRecording && {
                borderColor: 'red',
              },

            ]}
          >

            <View
              style={[
                styles.mainRecInner,

                isRecording && {
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