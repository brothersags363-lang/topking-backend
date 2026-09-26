import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";

import {
  View,  
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Modal,
  ScrollView,
  StatusBar,
  TextInput,
  Keyboard,
  Pressable,
  PanResponder,
} from "react-native";

import {
  VideoView,
  useVideoPlayer,
} from "expo-video";

import {
  useRouter,
  useLocalSearchParams,
} from "expo-router";

import {
  useIsFocused,
} from "@react-navigation/native";

import {
  Ionicons,
  Feather,
} from "@expo/vector-icons";

import { Audio } from "expo-av";

import { LinearGradient } from "expo-linear-gradient";

/*
 * =========================================================
 * VIDEO TRIM LIBRARY
 * =========================================================
 */

import {
  showEditor,
} from "react-native-video-trim";


const { width, height } =
  Dimensions.get("window");

const firstParam = (value) =>
  Array.isArray(value) ? value[0] : value;

const textParam = (value) => {
  const param = firstParam(value);
  return typeof param === "string" ? param : "";
};

const toDurationSeconds = (value) => {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0
    ? duration
    : 0;
};


export default function EditView() {

  const router = useRouter();

  const params =
    useLocalSearchParams();

  const isFocused =
    useIsFocused();


  // =====================================================
  // PARAMS
  // =====================================================

  const routeVideoUri =
    textParam(params.videoUri);

  const routeVideoDuration =
    toDurationSeconds(textParam(params.videoDuration));

  const routeMusic = {
    audioUrl: textParam(params.audioUrl),
    musicName:
      textParam(params.musicName) ||
      textParam(params.musicTitle),
    musicTitle:
      textParam(params.musicTitle) ||
      textParam(params.musicName),
    musicArtist: textParam(params.musicArtist),
    musicImage: textParam(params.musicImage),
    musicId: textParam(params.musicId),
  };

  const [videoUri, setVideoUri] =
    useState(routeVideoUri);

  const [videoDuration, setVideoDuration] =
    useState(routeVideoDuration);

  const videoUriRef =
    useRef(routeVideoUri);

  const videoDurationRef =
    useRef({
      uri: routeVideoUri,
      value: routeVideoDuration,
      isReady: routeVideoDuration > 0,
    });

  const lastRouteVideoUriRef =
    useRef(routeVideoUri);

  const updateVideoDuration =
    useCallback((uri, duration) => {
      const value = toDurationSeconds(duration);

      videoDurationRef.current = {
        uri,
        value,
        isReady: value > 0,
      };

      setVideoDuration(value);
    }, []);

  const updateVideoUri =
    useCallback((uri, duration = 0) => {
      const nextUri = textParam(uri);

      videoUriRef.current = nextUri;
      setVideoUri(nextUri);
      updateVideoDuration(nextUri, duration);
    }, [updateVideoDuration]);

  const [selectedMusic, setSelectedMusic] =
    useState(routeMusic);

  const routeMusicKey = [
    routeMusic.audioUrl,
    routeMusic.musicName,
    routeMusic.musicTitle,
    routeMusic.musicArtist,
    routeMusic.musicImage,
    routeMusic.musicId,
  ].join("\u0001");

  const lastRouteMusicKeyRef =
    useRef(routeMusicKey);

  const musicTitle =
    selectedMusic.musicName ||
    selectedMusic.musicTitle ||
    "";

  const musicArtist =
    selectedMusic.musicArtist || "";

  const musicImage =
    selectedMusic.musicImage || "";

  const musicId =
    selectedMusic.musicId || "";

  const audioUrl =
    selectedMusic.audioUrl || "";

  useEffect(() => {
    if (
      routeVideoUri &&
      routeVideoUri !== lastRouteVideoUriRef.current
    ) {
      lastRouteVideoUriRef.current = routeVideoUri;
      updateVideoUri(routeVideoUri, routeVideoDuration);
      return;
    }

    if (
      routeVideoUri &&
      videoUriRef.current === routeVideoUri &&
      routeVideoDuration > 0 &&
      !videoDurationRef.current.isReady
    ) {
      updateVideoDuration(routeVideoUri, routeVideoDuration);
    }
  }, [
    routeVideoUri,
    routeVideoDuration,
    updateVideoDuration,
    updateVideoUri,
  ]);

  useEffect(() => {
    const hasIncomingMusic = [
      routeMusic.audioUrl,
      routeMusic.musicName,
      routeMusic.musicTitle,
      routeMusic.musicArtist,
      routeMusic.musicImage,
      routeMusic.musicId,
    ].some(Boolean);

    if (
      !hasIncomingMusic ||
      routeMusicKey === lastRouteMusicKeyRef.current
    ) {
      return;
    }

    lastRouteMusicKeyRef.current = routeMusicKey;
    setSelectedMusic(routeMusic);
  }, [routeMusicKey]);


  // =====================================================
  // MUSIC
  // =====================================================

  const [showMusic, setShowMusic] =
    useState(false);

  const [sound, setSound] =
    useState(null);


  // =====================================================
  // SUBTITLE
  // =====================================================

  const [showSubtitle, setShowSubtitle] =
    useState(false);

  const [subtitleText, setSubtitleText] =
    useState("");

  const [subtitleColor, setSubtitleColor] =
    useState("#FFFFFF");

  const [subtitleSize, setSubtitleSize] =
    useState(28);

  const [subtitlePosition, setSubtitlePosition] =
    useState({
      x: width / 2 - 100,
      y: height / 2 - 30,
    });


  // =====================================================
  // RECORD / VOICE OVER
  // =====================================================

  const [recording, setRecording] =
    useState(null);

  const [isRecording, setIsRecording] =
    useState(false);

  const [voiceUri, setVoiceUri] =
    useState("");

  const [voiceDuration, setVoiceDuration] =
    useState(0);

  const [voicePlaying, setVoicePlaying] =
    useState(false);

  const [showRecordModal, setShowRecordModal] =
    useState(false);

  const voiceSoundRef =
    useRef(null);


  // =====================================================
  // VIDEO EDITING STATE
  // =====================================================

  const [isEditingVideo, setIsEditingVideo] =
    useState(false);

  // Native trim editor lifecycle.
  // Keeps the real edited output connected to the next screen.
  const trimEditorOpenRef = useRef(false);
  const trimSubscriptionsRef = useRef([]);

  // Real video effect selection. The selected effect is
  // rendered into the final uploaded video by the server.
  const [showEffectModal, setShowEffectModal] =
    useState(false);

  const [selectedEffect, setSelectedEffect] =
    useState("none");

  // =====================================================
  // SUBTITLE COLORS
  // =====================================================

  const subtitleColors = [

    "#FFFFFF",
    "#000000",
    "#FF0000",
    "#00FF00",
    "#00D9FF",
    "#FFFF00",
    "#FF00FF",
    "#FFA500",

  ];


  // =====================================================
  // SUBTITLE DRAG
  // =====================================================

  const subtitleStartPosition =
    useRef({
      x: 0,
      y: 0,
    });


  const subtitlePanResponder =
    useRef(

      PanResponder.create({

        onStartShouldSetPanResponder:
          () => true,

        onMoveShouldSetPanResponder:
          () => true,

        onPanResponderGrant: () => {

          subtitleStartPosition.current = {
            x: subtitlePosition.x,
            y: subtitlePosition.y,
          };

        },

        onPanResponderMove: (
          event,
          gestureState
        ) => {

          let newX =
            subtitleStartPosition.current.x +
            gestureState.dx;

          let newY =
            subtitleStartPosition.current.y +
            gestureState.dy;


          newX = Math.max(
            5,
            Math.min(
              width - 230,
              newX
            )
          );


          newY = Math.max(
            80,
            Math.min(
              height - 220,
              newY
            )
          );


          setSubtitlePosition({
            x: newX,
            y: newY,
          });

        },

      })

    ).current;


  // =====================================================
  // MUSIC CLEANUP
  // =====================================================

  useEffect(() => {

    return () => {

      if (sound) {

        sound
          .stopAsync()
          .catch(() => {});

        sound
          .unloadAsync()
          .catch(() => {});

      }

    };

  }, [sound]);


  // =====================================================
  // VOICE SOUND CLEANUP
  // =====================================================

  useEffect(() => {

    return () => {

      if (voiceSoundRef.current) {

        voiceSoundRef.current
          .stopAsync()
          .catch(() => {});

        voiceSoundRef.current
          .unloadAsync()
          .catch(() => {});

      }

    };

  }, []);


  // =====================================================
  // LOAD MUSIC
  // =====================================================

  useEffect(() => {

    if (!audioUrl) {
      return;
    }


    let newSound;


    const loadMusic = async () => {

      try {

        console.log(
          "Playing Audio =",
          audioUrl
        );


        const result =
          await Audio.Sound.createAsync(

            {
              uri: audioUrl,
            },

            {
              shouldPlay: false,
              isLooping: false,
            }

          );


        newSound =
          result.sound;


        setSound(
          result.sound
        );


      } catch (e) {

        console.log(
          "Audio Error =",
          e
        );

      }

    };


    loadMusic();


    return () => {

      if (newSound) {

        newSound
          .unloadAsync()
          .catch(() => {});

      }

    };

  }, [audioUrl]);


  // =====================================================
  // VIDEO PLAYER
  // =====================================================

  const player =
    useVideoPlayer(

      videoUri,

      (player) => {

        player.loop = false;

        player.muted =
          !!musicTitle;


        if (isFocused) {

          player.play();

        } else {

          player.pause();

        }

      }

    );


  // =====================================================
  // VIDEO + MUSIC SYNC
  // =====================================================

  useEffect(() => {
    const syncPlayer = async () => {
      try {
        if (isFocused) {
          player.currentTime = 0;
          player.play();

          if (sound && !isRecording) {
            await sound.stopAsync().catch(() => {});
            await sound.setPositionAsync(0);
            await sound.playAsync();
          }
        } else {
          player.pause();

          if (sound) {
            await sound.pauseAsync().catch(() => {});
          }
        }
      } catch (error) {
        console.log("Player Sync Error =", error);
      }
    };

    syncPlayer();
  }, [isFocused, sound, isRecording]);

  // Stop music exactly when the video reaches its own duration.
  // This prevents a longer source song from continuing after a short take.
  useEffect(() => {
    if (!sound || !player) return;

    let subscription;

    try {
      subscription = player.addListener("timeUpdate", async (event) => {
        const current = Number(event?.currentTime ?? player.currentTime ?? 0);
        const duration = Number(
          videoDuration || player.duration || 0
        );

        if (duration > 0 && current >= duration - 0.08) {
          await sound.pauseAsync().catch(() => {});
          await sound.setPositionAsync(0).catch(() => {});
        }
      });
    } catch (e) {
      console.log("Video/music duration sync unavailable:", e);
    }

    return () => {
      try {
        subscription?.remove?.();
      } catch (_) {}
    };
  }, [sound, player, videoDuration]);

  // =====================================================
  // VIDEO EDIT / TRIM
  // =====================================================
  // =====================================================

  const openVideoEditor = async () => {

    try {

      // -----------------------------------------------
      // Video check
      // -----------------------------------------------

      if (!videoUri) {

        Alert.alert(
          "No Video",
          "Pehle video select karein."
        );

        return;

      }


      // -----------------------------------------------
      // Recording stop
      // -----------------------------------------------

      if (isRecording) {

        await stopVoiceRecording();

      }


      // -----------------------------------------------
      // Music pause
      // -----------------------------------------------

      if (sound) {

        try {

          await sound.pauseAsync();

        } catch (e) {}

      }


      // -----------------------------------------------
      // Video pause
      // -----------------------------------------------

      try {

        player.pause();

      } catch (e) {}


      // -----------------------------------------------
      // Editing state
      // -----------------------------------------------

      trimEditorOpenRef.current = true;
      setIsEditingVideo(true);


      console.log(
        "Opening video editor:",
        videoUri
      );


      /*
       * -------------------------------------------------
       * OPEN NATIVE VIDEO EDITOR
       * -------------------------------------------------
       *
       * User yahan:
       *
       * - Start trim
       * - End trim
       * - Preview
       * - Precise trim
       * - Apply
       *
       * kar sakta hai.
       *
       */

      showEditor(

        videoUri,

        {

          /*
           * Frame accurate trimming
           */

          enablePreciseTrimming: true,


          /*
           * Cancel processing option
           */

          enableCancelTrimming: true,

          cancelTrimmingButtonText:
            "Cancel",


          /*
           * Processing text
           */

          trimmingText:
            "Processing video...",


          /*
           * Error handling
           */

          alertOnFailToLoad: true,

          alertOnFailTitle:
            "Video Error",

          alertOnFailMessage:
            "Video load nahi ho paya.",

          alertOnFailCloseText:
            "OK",

        }

      );


    } catch (error) {

      console.log(
        "VIDEO EDITOR ERROR =",
        error
      );


      trimEditorOpenRef.current = false;
      setIsEditingVideo(false);


      Alert.alert(
        "Edit Error",
        "Video editor open nahi ho paya."
      );

    }

  };


  // =====================================================
  // VIDEO EDITOR EVENT LISTENER
  // =====================================================

  useEffect(() => {
    let mounted = true;
    const subscriptions = [];

    const normalizeOutputUri = (value) => {
      if (!value || typeof value !== "string") {
        return "";
      }

      if (
        value.startsWith("file://") ||
        value.startsWith("content://") ||
        value.startsWith("http://") ||
        value.startsWith("https://")
      ) {
        return value;
      }

      return `file://${value}`;
    };

    const handleFinish = (event) => {
      if (!mounted) return;

      const editedUri = normalizeOutputUri(
        event?.outputPath ||
        event?.outputUri ||
        event?.path ||
        event?.uri
      );

      trimEditorOpenRef.current = false;
      setIsEditingVideo(false);

      if (editedUri) {
        setVideoUri(editedUri);
        console.log("VIDEO EDIT FINISHED =", editedUri);
      } else {
        console.log("VIDEO EDIT FINISHED WITHOUT OUTPUT", event);
      }
    };

    const handleCancel = () => {
      if (!mounted) return;

      trimEditorOpenRef.current = false;
      setIsEditingVideo(false);
      console.log("VIDEO EDIT CANCELLED");
    };

    const handleError = (event) => {
      if (!mounted) return;

      trimEditorOpenRef.current = false;
      setIsEditingVideo(false);

      console.log("VIDEO EDIT ERROR =", event);

      Alert.alert(
        "Edit Error",
        event?.message || "Video editing failed."
      );
    };

    // New Architecture API.
    try {
      const videoTrimModule = require("react-native-video-trim");
      const NativeVideoTrim =
        videoTrimModule?.NativeVideoTrim ||
        videoTrimModule?.default ||
        videoTrimModule;

      if (NativeVideoTrim?.onFinishTrimming) {
        const sub = NativeVideoTrim.onFinishTrimming(handleFinish);
        if (sub) subscriptions.push(sub);
      }

      if (NativeVideoTrim?.onCancelTrimming) {
        const sub = NativeVideoTrim.onCancelTrimming(handleCancel);
        if (sub) subscriptions.push(sub);
      }

      if (NativeVideoTrim?.onCancel) {
        const sub = NativeVideoTrim.onCancel(handleCancel);
        if (sub) subscriptions.push(sub);
      }

      if (NativeVideoTrim?.onError) {
        const sub = NativeVideoTrim.onError(handleError);
        if (sub) subscriptions.push(sub);
      }
    } catch (newArchError) {
      console.log(
        "VideoTrim New Architecture listener unavailable:",
        newArchError?.message || newArchError
      );
    }

    // Old Architecture fallback.
    try {
      const {
        NativeEventEmitter,
        NativeModules,
      } = require("react-native");

      const nativeModule = NativeModules?.VideoTrim;

      if (
        nativeModule &&
        typeof nativeModule.addListener === "function" &&
        typeof nativeModule.removeListeners === "function"
      ) {
        const emitter = new NativeEventEmitter(nativeModule);

        const sub = emitter.addListener(
          "VideoTrim",
          (event) => {
            const name = String(
              event?.name ||
              event?.event ||
              ""
            ).toLowerCase();

            if (
              name.includes("finish") ||
              name.includes("complete") ||
              event?.outputPath ||
              event?.outputUri ||
              event?.path
            ) {
              handleFinish(event);
            } else if (name.includes("cancel")) {
              handleCancel();
            } else if (name.includes("error")) {
              handleError(event);
            }
          }
        );

        subscriptions.push(sub);
      }
    } catch (oldArchError) {
      console.log(
        "VideoTrim legacy listener unavailable:",
        oldArchError?.message || oldArchError
      );
    }

    trimSubscriptionsRef.current = subscriptions;

    return () => {
      mounted = false;

      subscriptions.forEach((sub) => {
        try {
          if (typeof sub?.remove === "function") {
            sub.remove();
          } else if (typeof sub === "function") {
            sub();
          }
        } catch (_) {}
      });

      trimSubscriptionsRef.current = [];
    };
  }, []);

  // =====================================================
  // PLAY SELECTED MUSIC
  // =====================================================

  async function playSelectedMusic(
    musicUrl
  ) {

    try {

      if (sound) {

        await sound.unloadAsync();

      }


      const {
        sound: newSound
      } =
        await Audio.Sound.createAsync(
          musicUrl
        );


      await newSound
        .setIsLoopingAsync(true);


      setSound(
        newSound
      );


      await newSound.playAsync();


      setShowMusic(false);


      Alert.alert(
        "Music Added",
        "Music added successfully!"
      );


    } catch (e) {

      console.log(
        "Music Error =",
        e
      );


      Alert.alert(
        "Error",
        "Music failed to load!"
      );

    }

  }


  // =====================================================
  // START VOICE RECORDING
  // =====================================================

  const startVoiceRecording =
    async () => {

      try {

        console.log(
          "🎙️ Requesting microphone permission..."
        );


        const permission =
          await Audio.requestPermissionsAsync();


        if (!permission.granted) {

          Alert.alert(
            "Microphone Permission",
            "Voice record karne ke liye microphone permission allow karein."
          );

          return;

        }


        if (sound) {

          try {

            await sound.pauseAsync();

          } catch (e) {}

        }


        try {

          player.play();

        } catch (e) {}


        if (recording) {

          try {

            await recording
              .stopAndUnloadAsync();

          } catch (e) {}

        }


        await Audio.setAudioModeAsync({

          allowsRecordingIOS:
            true,

          playsInSilentModeIOS:
            true,

          staysActiveInBackground:
            false,

          shouldDuckAndroid:
            true,

          playThroughEarpieceAndroid:
            false,

        });


        const {
          recording: newRecording
        } =
          await Audio.Recording.createAsync(

            Audio
              .RecordingOptionsPresets
              .HIGH_QUALITY

          );


        setRecording(
          newRecording
        );


        setIsRecording(
          true
        );


        setVoiceUri("");

        setVoiceDuration(0);

        setShowRecordModal(
          true
        );


        console.log(
          "🎙️ Recording started"
        );


      } catch (error) {

        console.log(
          "Recording start error =",
          error
        );


        Alert.alert(
          "Recording Error",
          "Voice recording start nahi ho payi."
        );

      }

    };


  // =====================================================
  // STOP VOICE RECORDING
  // =====================================================

  const stopVoiceRecording =
    async () => {

      try {

        if (!recording) {
          return;
        }


        console.log(
          "🛑 Stopping recording..."
        );


        setIsRecording(
          false
        );


        await recording
          .stopAndUnloadAsync();


        const uri =
          recording.getURI();


        console.log(
          "🎙️ Voice URI =",
          uri
        );


        if (uri) {

          setVoiceUri(
            uri
          );


          const status =
            await recording
              .getStatusAsync()
              .catch(
                () => null
              );


          if (
            status &&
            status.durationMillis
          ) {

            setVoiceDuration(
              status.durationMillis
            );

          }

        }


        setRecording(
          null
        );


        await Audio.setAudioModeAsync({

          allowsRecordingIOS:
            false,

          playsInSilentModeIOS:
            true,

          staysActiveInBackground:
            false,

          shouldDuckAndroid:
            true,

          playThroughEarpieceAndroid:
            false,

        });


        Alert.alert(
          "Voice Added 🎙️",
          "Aapki voice recording save ho gayi."
        );


      } catch (error) {

        console.log(
          "Recording stop error =",
          error
        );


        setIsRecording(
          false
        );

        setRecording(
          null
        );

      }

    };


  // =====================================================
  // RECORD BUTTON
  // =====================================================

  const handleRecordPress =
    async () => {

      if (isRecording) {

        await stopVoiceRecording();

      } else {

        await startVoiceRecording();

      }

    };


  // =====================================================
  // PLAY RECORDED VOICE
  // =====================================================

  const playRecordedVoice =
    async () => {

      try {

        if (!voiceUri) {

          Alert.alert(
            "No Voice",
            "Pehle apni voice record karein."
          );

          return;

        }


        if (
          voiceSoundRef.current &&
          voicePlaying
        ) {

          await voiceSoundRef.current
            .pauseAsync();

          setVoicePlaying(
            false
          );

          return;

        }


        if (voiceSoundRef.current) {

          try {

            await voiceSoundRef.current
              .unloadAsync();

          } catch (e) {}

          voiceSoundRef.current =
            null;

        }


        const result =
          await Audio.Sound.createAsync(

            {
              uri: voiceUri,
            },

            {
              shouldPlay: true,
            },

            (status) => {

              if (
                status.isLoaded &&
                status.didJustFinish
              ) {

                setVoicePlaying(
                  false
                );

              }

            }

          );


        voiceSoundRef.current =
          result.sound;


        setVoicePlaying(
          true
        );


      } catch (error) {

        console.log(
          "Voice playback error =",
          error
        );


        setVoicePlaying(
          false
        );

      }

    };


  // =====================================================
  // DELETE VOICE
  // =====================================================

  const deleteVoiceRecording =
    async () => {

      try {

        if (isRecording) {

          await stopVoiceRecording();

        }


        if (
          voiceSoundRef.current
        ) {

          try {

            await voiceSoundRef.current
              .stopAsync();

            await voiceSoundRef.current
              .unloadAsync();

          } catch (e) {}


          voiceSoundRef.current =
            null;

        }


        setVoiceUri("");

        setVoiceDuration(0);

        setVoicePlaying(false);


        Alert.alert(
          "Deleted",
          "Voice recording delete ho gayi."
        );


      } catch (error) {

        console.log(
          "Delete voice error =",
          error
        );

      }

    };


  // =====================================================
  // OPEN SUBTITLE
  // =====================================================

  const openSubtitle =
    () => {

      setShowSubtitle(
        true
      );

    };


  // =====================================================
  // ADD TEXT
  // =====================================================

  const addSubtitle =
    () => {

      if (
        !subtitleText.trim()
      ) {

        Alert.alert(
          "Enter Text",
          "Please enter some text first."
        );

        return;

      }


      Keyboard.dismiss();


      setShowSubtitle(
        false
      );

    };


  // =====================================================
  // DELETE TEXT
  // =====================================================

  const deleteSubtitle =
    () => {

      setSubtitleText("");

      setShowSubtitle(
        false
      );

    };


  // =====================================================
  // TEXT SIZE
  // =====================================================

  const increaseTextSize =
    () => {

      setSubtitleSize(
        previous => {

          if (previous >= 60) {
            return 60;
          }

          return previous + 2;

        }
      );

    };


  const decreaseTextSize =
    () => {

      setSubtitleSize(
        previous => {

          if (previous <= 14) {
            return 14;
          }

          return previous - 2;

        }
      );

    };


  // =====================================================
  // BOTTOM MENU
  // =====================================================

  const bottomMenu = [

    {
      icon: "music",
      label: "Music",

      action: () => {

        router.push({

          pathname:
            "/MusicSelect",

          params: {
            videoUri,
          },

        });

      },

    },


    // ===================================================
    // EDIT BUTTON
    // ===================================================

    {
      icon: "scissors",

      label: "Edit",

      action:
        openVideoEditor,

    },


    {
      icon: "type",

      label: "Subtitle",

      action:
        openSubtitle,

    },


    {
      icon: "layers",

      label: "Effect",

      action: () =>
        setShowEffectModal(true),

    },


    {
      icon: "mic",

      label:
        isRecording
          ? "Stop"
          : "Record",

      action:
        handleRecordPress,

    },

  ];


  // =====================================================
  // NEXT
  // =====================================================

  const goToPost =
    async () => {

      try {

        if (trimEditorOpenRef.current || isEditingVideo) {
          Alert.alert(
            "Please wait",
            "Video editing abhi complete ho rahi hai."
          );
          return;
        }

        if (isRecording) {

          await stopVoiceRecording();

        }


        if (sound) {

          try {

            await sound.stopAsync();

          } catch (e) {}

        }


        console.log(
          "Sending videoUri =",
          videoUri
        );


        console.log(
          "Sending audioUrl =",
          audioUrl
        );


        console.log(
          "Sending voiceUri =",
          voiceUri
        );


        console.log(
          "Sending subtitle =",
          subtitleText
        );


        console.log(
          "Subtitle position =",
          subtitlePosition
        );


        router.push({

          pathname:
            "/post",

          params: {

            videoUri,

            audioUrl,

            videoDuration: String(
              videoDuration || player.duration || 0
            ),

            musicName:
              musicTitle,

            musicArtist,

            musicImage,

            videoEffect:
              selectedEffect || "none",


            voiceUri:
              voiceUri || "",


            subtitleText:
              subtitleText || "",


            subtitleColor:
              subtitleColor ||
              "#FFFFFF",


            subtitleSize:
              String(
                subtitleSize ||
                28
              ),


            subtitleX:
              String(
                subtitlePosition.x
              ),


            subtitleY:
              String(
                subtitlePosition.y
              ),

            subtitleXRatio:
              String(
                Math.max(
                  0,
                  Math.min(
                    1,
                    subtitlePosition.x / width
                  )
                )
              ),

            subtitleYRatio:
              String(
                Math.max(
                  0,
                  Math.min(
                    1,
                    subtitlePosition.y / height
                  )
                )
              ),

            subtitleSizeRatio:
              String(
                Math.max(
                  0.005,
                  Math.min(
                    0.20,
                    subtitleSize / height
                  )
                )
              ),

          },

        });


      } catch (error) {

        console.log(
          "Next error =",
          error
        );

      }

    };


  // =====================================================
  // RENDER
  // =====================================================

  return (

    <View
      style={styles.container}
    >

      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />


      {/* =================================================
          VIDEO
      ================================================= */}

      <View
        style={
          styles.videoContainer
        }
      >

        {videoUri ? (

          <VideoView
            player={player}
            style={
              styles.fullVideo
            }
            contentFit="contain"
            nativeControls={false}
          />

        ) : (

          <View
            style={
              styles.placeholder
            }
          >

            <Text
              style={
                styles.placeholderText
              }
            >
              Select Video
            </Text>

          </View>

        )}


        {/* MUSIC BAR */}

        {musicTitle && (

          <View
            style={
              styles.musicBar
            }
          >

            <Text
              style={
                styles.musicIcon
              }
            >
              🎵
            </Text>


            <View
              style={{
                flex: 1,
              }}
            >

              <Text
                style={
                  styles.musicTitle
                }
              >
                {musicTitle}
              </Text>


              <Text
                style={
                  styles.musicArtist
                }
              >
                {musicArtist}
              </Text>

            </View>

          </View>

        )}


        {/* =================================================
            SUBTITLE
        ================================================= */}

        {subtitleText.trim() !== "" && (

          <View

            {...subtitlePanResponder
              .panHandlers}

            style={[

              styles.subtitleDragBox,

              {
                left:
                  subtitlePosition.x,

                top:
                  subtitlePosition.y,
              },

            ]}

          >

            <Text

              style={[

                styles.subtitlePreview,

                {

                  color:
                    subtitleColor,

                  fontSize:
                    subtitleSize,

                  textShadowColor:
                    subtitleColor ===
                    "#000000"
                      ? "#FFFFFF"
                      : "#000000",

                },

              ]}

            >

              {subtitleText}

            </Text>

          </View>

        )}


        {/* =================================================
            VOICE RECORDING INDICATOR
        ================================================= */}

        {isRecording && (

          <View
            style={
              styles.recordingIndicator
            }
          >

            <View
              style={
                styles.recordingDot
              }
            />

            <Text
              style={
                styles.recordingText
              }
            >
              Recording Voice...
            </Text>

          </View>

        )}

      </View>


      {/* =================================================
          TOP GRADIENT
      ================================================= */}

      <LinearGradient

        colors={[
          "rgba(0,0,0,0.95)",
          "rgba(0,0,0,0.6)",
          "transparent",
        ]}

        style={
          styles.topBlackBar
        }

      />


      {/* =================================================
          HEADER
      ================================================= */}

      <View
        style={
          styles.header
        }
      >

        <TouchableOpacity

          style={
            styles.iconBtn
          }

          onPress={async () => {

            try {

              if (isRecording) {

                await stopVoiceRecording();

              }


              if (sound) {

                await sound.stopAsync();

                await sound.unloadAsync();

              }

            } catch (e) {}


            router.back();

          }}

        >

          <Ionicons

            name="chevron-back"

            size={30}

            color="#fff"

          />

        </TouchableOpacity>


        <TouchableOpacity

          style={[
            styles.nextBtn,
            isEditingVideo &&
              styles.nextBtnDisabled,
          ]}

          onPress={
            goToPost
          }

          disabled={isEditingVideo}

        >

          <Text
            style={
              styles.nextTxt
            }
          >
            Next
          </Text>

        </TouchableOpacity>

      </View>


      {/* =================================================
          BOTTOM GRADIENT
      ================================================= */}

      <LinearGradient

        colors={[
          "transparent",
          "rgba(0,0,0,0.6)",
          "rgba(0,0,0,0.95)",
        ]}

        style={
          styles.bottomBlackBar
        }

      />


      {/* =================================================
          BOTTOM MENU
      ================================================= */}

      <View
        style={
          styles.bottomMenuWrapper
        }
      >

        <ScrollView

          horizontal

          showsHorizontalScrollIndicator={
            false
          }

          contentContainerStyle={{
            paddingHorizontal: 10,
          }}

        >

          {bottomMenu.map(
            (item, index) => (

              <TouchableOpacity

                key={index}

                style={[

                  styles.menuItem,

                  item.label ===
                    "Stop" &&
                    styles.recordActive,

                ]}

                onPress={
                  item.action
                    ? item.action
                    : () => {}
                }

              >

                <View
                  style={
                    styles.iconCircle
                  }
                >

                  <Feather

                    name={
                      item.label ===
                      "Stop"
                        ? "square"
                        : item.icon
                    }

                    size={24}

                    color="#fff"

                  />

                </View>


                <Text
                  style={
                    styles.menuLabel
                  }
                >
                  {item.label}
                </Text>

              </TouchableOpacity>

            )
          )}

        </ScrollView>

      </View>


      {/* =================================================
          EFFECT MODAL
      ================================================= */}
      <Modal
        visible={showEffectModal}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setShowEffectModal(false)
        }
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() =>
            setShowEffectModal(false)
          }
        >
          <Pressable
            style={styles.effectModal}
            onPress={() => {}}
          >
            <View
              style={styles.effectModalHeader}
            >
              <View>
                <Text
                  style={styles.effectModalTitle}
                >
                  Video Effects
                </Text>

                <Text
                  style={styles.effectModalHint}
                >
                  Final video me effect apply hoga
                </Text>
              </View>

              <TouchableOpacity
                onPress={() =>
                  setShowEffectModal(false)
                }
              >
                <Ionicons
                  name="close"
                  size={28}
                  color="#fff"
                />
              </TouchableOpacity>
            </View>

            <View
              style={styles.effectGrid}
            >
              {[
                {
                  id: "none",
                  title: "Original",
                  icon: "videocam-outline",
                },
                {
                  id: "vivid",
                  title: "Vivid",
                  icon: "sunny-outline",
                },
                {
                  id: "soft",
                  title: "Soft",
                  icon: "cloud-outline",
                },
                {
                  id: "bw",
                  title: "B&W",
                  icon: "contrast-outline",
                },
              ].map((effect) => (
                <TouchableOpacity
                  key={effect.id}
                  style={[
                    styles.effectCard,
                    selectedEffect ===
                      effect.id &&
                      styles.effectCardSelected,
                  ]}
                  onPress={() => {
                    setSelectedEffect(
                      effect.id
                    );
                    setShowEffectModal(false);
                  }}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.effectIcon,
                      selectedEffect ===
                        effect.id &&
                        styles.effectIconSelected,
                    ]}
                  >
                    <Ionicons
                      name={effect.icon}
                      size={24}
                      color="#fff"
                    />
                  </View>

                  <Text
                    style={styles.effectTitle}
                  >
                    {effect.title}
                  </Text>

                  {selectedEffect ===
                    effect.id && (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="#FF2D55"
                      style={
                        styles.effectCheck
                      }
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>


      {/* =================================================
          SUBTITLE MODAL
      ================================================= */}

      <Modal

        visible={
          showSubtitle
        }

        transparent

        animationType="slide"

        onRequestClose={() => {

          Keyboard.dismiss();

          setShowSubtitle(
            false
          );

        }}

      >

        <Pressable

          style={
            styles.modalOverlay
          }

          onPress={() => {

            Keyboard.dismiss();

          }}

        >

          <Pressable

            style={
              styles.subtitleModal
            }

            onPress={() => {}}

          >

            <View
              style={
                styles.subtitleModalHeader
              }
            >

              <Text
                style={
                  styles.subtitleModalTitle
                }
              >
                Add Text
              </Text>


              <TouchableOpacity

                onPress={() => {

                  Keyboard.dismiss();

                  setShowSubtitle(
                    false
                  );

                }}

              >

                <Ionicons
                  name="close"
                  size={28}
                  color="#fff"
                />

              </TouchableOpacity>

            </View>


            <TextInput

              value={
                subtitleText
              }

              onChangeText={
                setSubtitleText
              }

              placeholder=
                "Type something..."

              placeholderTextColor=
                "#777"

              multiline

              autoFocus

              style={[

                styles.subtitleInput,

                {

                  color:
                    subtitleColor,

                  fontSize:
                    subtitleSize,

                },

              ]}

            />


            <View
              style={
                styles.controlRow
              }
            >

              <Text
                style={
                  styles.controlTitle
                }
              >
                Size
              </Text>


              <TouchableOpacity

                style={
                  styles.sizeButton
                }

                onPress={
                  decreaseTextSize
                }

              >

                <Text
                  style={
                    styles.sizeButtonText
                  }
                >
                  A−
                </Text>

              </TouchableOpacity>


              <Text
                style={
                  styles.sizeValue
                }
              >
                {subtitleSize}
              </Text>


              <TouchableOpacity

                style={
                  styles.sizeButton
                }

                onPress={
                  increaseTextSize
                }

              >

                <Text
                  style={
                    styles.sizeButtonText
                  }
                >
                  A+
                </Text>

              </TouchableOpacity>

            </View>


            <Text
              style={
                styles.controlTitle
              }
            >
              Text Color
            </Text>


            <ScrollView

              horizontal

              showsHorizontalScrollIndicator={
                false
              }

              style={
                styles.colorScroll
              }

            >

              {subtitleColors.map(
                (color) => (

                  <TouchableOpacity

                    key={color}

                    onPress={() =>
                      setSubtitleColor(
                        color
                      )
                    }

                    style={[

                      styles.colorCircle,

                      {
                        backgroundColor:
                          color,
                      },

                      subtitleColor ===
                        color &&
                        styles.selectedColor,

                    ]}

                  >

                    {subtitleColor ===
                      color && (

                      <Ionicons

                        name="checkmark"

                        size={20}

                        color={
                          color ===
                          "#FFFFFF"
                            ? "#000"
                            : "#fff"
                        }

                      />

                    )}

                  </TouchableOpacity>

                )
              )}

            </ScrollView>


            <View
              style={
                styles.subtitleButtons
              }
            >

              <TouchableOpacity

                style={
                  styles.deleteButton
                }

                onPress={
                  deleteSubtitle
                }

              >

                <Ionicons
                  name="trash-outline"
                  size={20}
                  color="#fff"
                />

                <Text
                  style={
                    styles.buttonText
                  }
                >
                  Delete
                </Text>

              </TouchableOpacity>


              <TouchableOpacity

                style={
                  styles.doneButton
                }

                onPress={
                  addSubtitle
                }

              >

                <Ionicons
                  name="checkmark"
                  size={22}
                  color="#fff"
                />

                <Text
                  style={
                    styles.buttonText
                  }
                >
                  Done
                </Text>

              </TouchableOpacity>

            </View>

          </Pressable>

        </Pressable>

      </Modal>


      {/* =================================================
          RECORD MODAL
      ================================================= */}

      <Modal

        visible={
          showRecordModal
        }

        transparent

        animationType="slide"

        onRequestClose={() => {

          if (isRecording) {

            stopVoiceRecording();

          }

          setShowRecordModal(
            false
          );

        }}

      >

        <View
          style={
            styles.recordModalOverlay
          }
        >

          <View
            style={
              styles.recordModal
            }
          >

            <View
              style={
                styles.recordModalHeader
              }
            >

              <Text
                style={
                  styles.recordModalTitle
                }
              >
                Voice Over 🎙️
              </Text>


              <TouchableOpacity

                onPress={() =>
                  setShowRecordModal(
                    false
                  )
                }

              >

                <Ionicons
                  name="close"
                  size={27}
                  color="#fff"
                />

              </TouchableOpacity>

            </View>


            {/* RECORDING STATUS */}

            {isRecording ? (

              <View
                style={
                  styles.recordStatusBox
                }
              >

                <View
                  style={
                    styles.bigRecordingDot
                  }
                />


                <Text
                  style={
                    styles.recordStatusText
                  }
                >
                  Recording...
                </Text>


                <Text
                  style={
                    styles.recordHint
                  }
                >
                  Apne video ke upar boliye
                </Text>

              </View>

            ) : (

              <View
                style={
                  styles.recordStatusBox
                }
              >

                <Ionicons
                  name="mic"
                  size={55}
                  color="#FF2D55"
                />


                <Text
                  style={
                    styles.recordStatusText
                  }
                >
                  Voice Over
                </Text>


                <Text
                  style={
                    styles.recordHint
                  }
                >
                  Video chalte hue apni voice record karein
                </Text>

              </View>

            )}


            {/* RECORD BUTTON */}

            <TouchableOpacity

              style={[

                styles.bigRecordButton,

                isRecording &&
                  styles.bigStopButton,

              ]}

              onPress={
                handleRecordPress
              }

            >

              <View

                style={[

                  styles.recordInner,

                  isRecording &&
                    styles.stopInner,

                ]}

              />

            </TouchableOpacity>


            <Text
              style={
                styles.recordButtonLabel
              }
            >

              {isRecording
                ? "Stop Recording"
                : "Start Recording"}

            </Text>


            {/* VOICE PREVIEW */}

            {voiceUri !== "" &&
              !isRecording && (

              <View
                style={
                  styles.voicePreviewBox
                }
              >

                <View
                  style={
                    styles.voicePreviewLeft
                  }
                >

                  <Ionicons
                    name="mic-circle"
                    size={38}
                    color="#FF2D55"
                  />


                  <View>

                    <Text
                      style={
                        styles.voicePreviewTitle
                      }
                    >
                      My Voice
                    </Text>


                    <Text
                      style={
                        styles.voicePreviewDuration
                      }
                    >
                      Voice recording ready
                    </Text>

                  </View>

                </View>


                <View
                  style={
                    styles.voicePreviewActions
                  }
                >

                  <TouchableOpacity

                    style={
                      styles.voiceActionButton
                    }

                    onPress={
                      playRecordedVoice
                    }

                  >

                    <Ionicons

                      name={
                        voicePlaying
                          ? "pause"
                          : "play"
                      }

                      size={20}

                      color="#fff"

                    />

                  </TouchableOpacity>


                  <TouchableOpacity

                    style={
                      styles.voiceDeleteButton
                    }

                    onPress={
                      deleteVoiceRecording
                    }

                  >

                    <Ionicons

                      name="trash-outline"

                      size={20}

                      color="#fff"

                    />

                  </TouchableOpacity>

                </View>

              </View>

            )}


            <TouchableOpacity

              style={
                styles.useVoiceButton
              }

              onPress={() => {

                if (!voiceUri) {

                  Alert.alert(
                    "Record Voice",
                    "Pehle voice record karein."
                  );

                  return;

                }


                setShowRecordModal(
                  false
                );


                Alert.alert(
                  "Voice Ready ✅",
                  "Aapki voice video ke saath post hogi."
                );

              }}

            >

              <Text
                style={
                  styles.useVoiceText
                }
              >
                Use This Voice
              </Text>

            </TouchableOpacity>

          </View>

        </View>

      </Modal>

    </View>

  );

}


// =====================================================
// STYLES
// =====================================================

const styles =
  StyleSheet.create({

    container: {
      flex: 1,
      backgroundColor: "#000",
    },


    videoContainer: {
      ...StyleSheet.absoluteFillObject,
    },


    fullVideo: {
      width: "100%",
      height: "100%",
    },


    placeholder: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#111",
    },


    placeholderText: {
      color: "#fff",
      fontSize: 18,
    },


    // =================================================
    // MUSIC
    // =================================================

    musicBar: {

      position: "absolute",

      top: 100,
      left: 15,
      right: 15,

      flexDirection: "row",

      alignItems: "center",

      padding: 10,

      borderRadius: 10,

      backgroundColor:
        "rgba(0,0,0,0.55)",

    },


    musicIcon: {
      fontSize: 25,
      marginRight: 10,
    },


    musicTitle: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "700",
    },


    musicArtist: {
      color: "#ddd",
      fontSize: 12,
      marginTop: 2,
    },


    // =================================================
    // SUBTITLE
    // =================================================

    subtitleDragBox: {

      position: "absolute",

      width: 220,

      minHeight: 50,

      justifyContent: "center",
      alignItems: "center",

      paddingHorizontal: 8,
      paddingVertical: 5,

      zIndex: 50,

    },


    subtitlePreview: {

      fontWeight: "800",

      textAlign: "center",

      textShadowOffset: {
        width: 1,
        height: 1,
      },

      textShadowRadius: 4,

    },


    // =================================================
    // RECORDING INDICATOR
    // =================================================

    recordingIndicator: {

      position: "absolute",

      top: 105,

      alignSelf: "center",

      flexDirection: "row",

      alignItems: "center",

      paddingHorizontal: 15,
      paddingVertical: 8,

      borderRadius: 20,

      backgroundColor:
        "rgba(255,0,0,0.80)",

      zIndex: 200,

    },


    recordingDot: {

      width: 10,
      height: 10,

      borderRadius: 5,

      backgroundColor: "#fff",

      marginRight: 8,

    },


    recordingText: {

      color: "#fff",

      fontSize: 14,

      fontWeight: "800",

    },


    // =================================================
    // TOP
    // =================================================

    topBlackBar: {

      position: "absolute",

      top: 0,
      left: 0,
      right: 0,

      height: 150,

    },


    // =================================================
    // HEADER
    // =================================================

    header: {

      position: "absolute",

      top: 45,

      left: 0,
      right: 0,

      flexDirection: "row",

      alignItems: "center",

      justifyContent:
        "space-between",

      paddingHorizontal: 15,

      zIndex: 100,

    },


    iconBtn: {

      width: 45,
      height: 45,

      borderRadius: 23,

      backgroundColor:
        "rgba(0,0,0,0.45)",

      justifyContent: "center",

      alignItems: "center",

    },


    nextBtn: {

      paddingHorizontal: 22,
      paddingVertical: 10,

      borderRadius: 22,

      backgroundColor: "#FF2D55",

    },


    nextBtnDisabled: {
      opacity: 0.55,
    },


    nextTxt: {

      color: "#fff",

      fontSize: 16,

      fontWeight: "800",

    },


    // =================================================
    // BOTTOM
    // =================================================

    bottomBlackBar: {

      position: "absolute",

      bottom: 0,

      left: 0,
      right: 0,

      height: 200,

    },


    bottomMenuWrapper: {

      position: "absolute",

      bottom: 35,

      left: 0,
      right: 0,

      zIndex: 100,

    },


    menuItem: {

      width: 75,

      alignItems: "center",

      marginHorizontal: 5,

    },


    iconCircle: {

      width: 52,
      height: 52,

      borderRadius: 26,

      backgroundColor:
        "rgba(0,0,0,0.60)",

      borderWidth: 1,

      borderColor:
        "rgba(255,255,255,0.25)",

      justifyContent: "center",

      alignItems: "center",

    },


    recordActive: {

      transform: [
        {
          scale: 1.08,
        },
      ],

    },


    menuLabel: {

      color: "#fff",

      fontSize: 12,

      marginTop: 6,

      fontWeight: "600",

    },


    // =================================================
    // SUBTITLE MODAL
    // =================================================

    modalOverlay: {

      flex: 1,

      backgroundColor:
        "rgba(0,0,0,0.70)",

      justifyContent: "flex-end",

    },


    effectModal: {
      backgroundColor: "#151515",
      borderTopLeftRadius: 25,
      borderTopRightRadius: 25,
      padding: 20,
      paddingBottom: 35,
    },

    effectModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 18,
    },

    effectModalTitle: {
      color: "#fff",
      fontSize: 21,
      fontWeight: "800",
    },

    effectModalHint: {
      color: "#999",
      fontSize: 12,
      marginTop: 4,
    },

    effectGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },

    effectCard: {
      width: "47%",
      minHeight: 100,
      borderRadius: 16,
      backgroundColor: "#242424",
      padding: 14,
      position: "relative",
    },

    effectCardSelected: {
      borderWidth: 1.5,
      borderColor: "#FF2D55",
      backgroundColor: "#2A171D",
    },

    effectIcon: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: "#333",
      justifyContent: "center",
      alignItems: "center",
    },

    effectIconSelected: {
      backgroundColor: "#FF2D55",
    },

    effectTitle: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "800",
      marginTop: 10,
    },

    effectCheck: {
      position: "absolute",
      top: 10,
      right: 10,
    },


    subtitleModal: {

      backgroundColor: "#151515",

      borderTopLeftRadius: 25,

      borderTopRightRadius: 25,

      padding: 20,

      paddingBottom: 55,

      minHeight: 360,

    },


    subtitleModalHeader: {

      flexDirection: "row",

      alignItems: "center",

      justifyContent:
        "space-between",

      marginBottom: 15,

    },


    subtitleModalTitle: {

      color: "#fff",

      fontSize: 21,

      fontWeight: "800",

    },


    subtitleInput: {

      minHeight: 90,

      maxHeight: 130,

      borderWidth: 1,

      borderColor: "#444",

      borderRadius: 14,

      paddingHorizontal: 15,

      paddingVertical: 12,

      textAlignVertical: "top",

      backgroundColor: "#0D0D0D",

    },


    controlRow: {

      flexDirection: "row",

      alignItems: "center",

      marginTop: 18,

      marginBottom: 15,

    },


    controlTitle: {

      color: "#fff",

      fontSize: 15,

      fontWeight: "700",

      marginBottom: 10,

    },


    sizeButton: {

      width: 45,
      height: 40,

      borderRadius: 10,

      backgroundColor: "#292929",

      justifyContent: "center",

      alignItems: "center",

      marginLeft: 10,

    },


    sizeButtonText: {

      color: "#fff",

      fontSize: 18,

      fontWeight: "800",

    },


    sizeValue: {

      color: "#fff",

      fontSize: 16,

      fontWeight: "700",

      marginLeft: 12,

    },


    colorScroll: {

      marginBottom: 20,

    },


    colorCircle: {

      width: 34,
      height: 34,

      borderRadius: 17,

      marginRight: 12,

      justifyContent: "center",

      alignItems: "center",

      borderWidth: 2,

      borderColor:
        "rgba(255,255,255,0.15)",

    },


    selectedColor: {

      borderColor: "#fff",

      borderWidth: 3,

    },


    subtitleButtons: {

      flexDirection: "row",

      gap: 12,

      marginTop: 5,

    },


    deleteButton: {

      flex: 1,

      height: 50,

      borderRadius: 14,

      backgroundColor: "#333",

      flexDirection: "row",

      justifyContent: "center",

      alignItems: "center",

      gap: 7,

    },


    doneButton: {

      flex: 1,

      height: 50,

      borderRadius: 14,

      backgroundColor: "#FF2D55",

      flexDirection: "row",

      justifyContent: "center",

      alignItems: "center",

      gap: 7,

    },


    buttonText: {

      color: "#fff",

      fontSize: 16,

      fontWeight: "800",

    },


    // =================================================
    // RECORD MODAL
    // =================================================

    recordModalOverlay: {

      flex: 1,

      backgroundColor:
        "rgba(0,0,0,0.75)",

      justifyContent: "flex-end",

    },


    recordModal: {

      backgroundColor: "#151515",

      borderTopLeftRadius: 28,

      borderTopRightRadius: 28,

      padding: 20,

      paddingBottom: 35,

      minHeight: 500,

    },


    recordModalHeader: {

      flexDirection: "row",

      justifyContent:
        "space-between",

      alignItems: "center",

      marginBottom: 15,

    },


    recordModalTitle: {

      color: "#fff",

      fontSize: 22,

      fontWeight: "900",

    },


    recordStatusBox: {

      alignItems: "center",

      paddingVertical: 15,

    },


    bigRecordingDot: {

      width: 55,
      height: 55,

      borderRadius: 28,

      backgroundColor: "#FF2D55",

      marginBottom: 10,

    },


    recordStatusText: {

      color: "#fff",

      fontSize: 20,

      fontWeight: "800",

      marginTop: 5,

    },


    recordHint: {

      color: "#aaa",

      fontSize: 13,

      marginTop: 5,

      textAlign: "center",

    },


    bigRecordButton: {

      width: 90,
      height: 90,

      borderRadius: 45,

      backgroundColor: "#FF2D55",

      alignSelf: "center",

      justifyContent: "center",

      alignItems: "center",

      marginTop: 8,

      borderWidth: 5,

      borderColor:
        "rgba(255,255,255,0.25)",

    },


    bigStopButton: {

      backgroundColor: "#444",

    },


    recordInner: {

      width: 35,
      height: 35,

      borderRadius: 18,

      backgroundColor: "#fff",

    },


    stopInner: {

      width: 28,
      height: 28,

      borderRadius: 5,

      backgroundColor: "#FF2D55",

    },


    recordButtonLabel: {

      color: "#fff",

      fontSize: 14,

      fontWeight: "700",

      textAlign: "center",

      marginTop: 10,

    },


    // =================================================
    // VOICE PREVIEW
    // =================================================

    voicePreviewBox: {

      marginTop: 18,

      padding: 12,

      borderRadius: 15,

      backgroundColor: "#242424",

      flexDirection: "row",

      alignItems: "center",

      justifyContent:
        "space-between",

    },


    voicePreviewLeft: {

      flexDirection: "row",

      alignItems: "center",

      flex: 1,

    },


    voicePreviewTitle: {

      color: "#fff",

      fontSize: 15,

      fontWeight: "800",

    },


    voicePreviewDuration: {

      color: "#aaa",

      fontSize: 12,

      marginTop: 3,

    },


    voicePreviewActions: {

      flexDirection: "row",

      alignItems: "center",

    },


    voiceActionButton: {

      width: 40,
      height: 40,

      borderRadius: 20,

      backgroundColor: "#FF2D55",

      justifyContent: "center",

      alignItems: "center",

      marginLeft: 8,

    },


    voiceDeleteButton: {

      width: 40,
      height: 40,

      borderRadius: 20,

      backgroundColor: "#444",

      justifyContent: "center",

      alignItems: "center",

      marginLeft: 8,

    },


    useVoiceButton: {

      height: 52,

      borderRadius: 15,

      backgroundColor: "#FF2D55",

      justifyContent: "center",

      alignItems: "center",

      marginTop: 20,

    },


    useVoiceText: {

      color: "#fff",

      fontSize: 16,

      fontWeight: "900",

    },

  });
