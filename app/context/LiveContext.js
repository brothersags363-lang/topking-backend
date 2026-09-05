import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  doc,
  updateDoc,
  deleteField,
  deleteDoc,
} from "firebase/firestore";

import { useRouter } from "expo-router";


// =====================================================
// FIREBASE
// =====================================================

let db = null;
let auth = null;

try {
  const firebaseModule = require("../app/firebaseConfig");

  db = firebaseModule.db;
  auth = firebaseModule.auth;

} catch (e) {

  try {

    const firebaseModule = require("../app/firebaseConfig");

    db = firebaseModule.db;
    auth = firebaseModule.auth;

  } catch (err) {

    console.log(
      "LiveContext: Firebase config not found",
      err
    );

  }

}


// =====================================================
// CONTEXT
// =====================================================

const LiveContext = createContext(null);


// =====================================================
// PROVIDER
// =====================================================

export function LiveProvider({ children }) {

  const router = useRouter();


  // ===================================================
  // GLOBAL LIVE DATA
  // ===================================================

  const [activeLive, setActiveLive] = useState(null);

  const [isMiniPlayerVisible, setIsMiniPlayerVisible] =
    useState(false);

  const [isLiveMuted, setIsLiveMuted] =
    useState(false);

  const [liveDuration, setLiveDuration] =
    useState("00:00:00");


  // ===================================================
  // AGORA ENGINE
  // ===================================================

  const agoraEngineRef = useRef(null);

  const agoraUidRef = useRef(null);

  const isAgoraJoinedRef = useRef(false);


  // ===================================================
  // TIMER
  // ===================================================

  const timerRef = useRef(null);


  // ===================================================
  // REGISTER AGORA ENGINE
  // ===================================================

  const registerAgoraEngine = (
    engine,
    agoraUid = null
  ) => {

    if (!engine) {
      console.log(
        "LiveContext: Agora engine missing"
      );

      return;
    }


    agoraEngineRef.current = engine;

    if (agoraUid !== null) {
      agoraUidRef.current = agoraUid;
    }


    isAgoraJoinedRef.current = true;


    console.log(
      "LiveContext: Agora engine registered"
    );

  };


  // ===================================================
  // UNREGISTER AGORA ENGINE
  // ===================================================

  const unregisterAgoraEngine = () => {

    agoraEngineRef.current = null;

    agoraUidRef.current = null;

    isAgoraJoinedRef.current = false;

  };


  // ===================================================
  // START LIVE
  // ===================================================

  const startLive = ({
    roomId,
    roomData = null,
    roomName = "Live Room",
    hostName = "User",
    hostImage = null,
    hostId = null,
    userRole = "listener",
    startTime = null,
    seatKey = null,
    agoraEngine = null,
    agoraUid = null,
  }) => {
    if (!roomId) return;

    const currentUid = auth?.currentUser?.uid || null;
    const incomingRoomId = String(roomId);
    const incomingHostId = hostId || roomData?.hostId || null;
    const resolvedRole =
      incomingHostId && currentUid && incomingHostId === currentUid
        ? "host"
        : (userRole || "listener");

    const existing = activeLiveRef.current;

    // Same room: NEVER restart the live or generate a new startTime.
    // Only merge newer room/host/role information.
    if (existing?.roomId && String(existing.roomId) === incomingRoomId) {
      const merged = {
        ...existing,
        roomName: roomName || existing.roomName,
        hostName: hostName || roomData?.hostName || existing.hostName,
        hostImage: hostImage || roomData?.hostImg || existing.hostImage || null,
        hostId: incomingHostId || existing.hostId || null,
        userId: currentUid || existing.userId || null,
        userRole: resolvedRole === "host" ? "host" : (existing.userRole === "host" ? "host" : resolvedRole),
        seatKey: seatKey || existing.seatKey || null,
        roomData: roomData || existing.roomData || null,
        startTime: existing.startTime,
        type: roomData?.type || existing.type || "audio",
      };

      activeLiveRef.current = merged;
      setActiveLive(prev => {
        if (!prev) return merged;
        const same =
          prev.roomId === merged.roomId &&
          prev.startTime === merged.startTime &&
          prev.hostId === merged.hostId &&
          prev.userRole === merged.userRole &&
          prev.roomData === merged.roomData;
        return same ? prev : merged;
      });

      if (agoraEngine) registerAgoraEngine(agoraEngine, agoraUid);
      return;
    }

    const finalStartTime =
      startTime || roomData?.createdAt || Date.now();

    const liveInfo = {
      roomId: incomingRoomId,
      roomName: roomName || roomData?.title || "Live Room",
      hostName: hostName || roomData?.hostName || roomData?.host || "User",
      hostImage: hostImage || roomData?.hostImg || roomData?.profileImg || null,
      hostId: incomingHostId,
      userId: currentUid,
      userRole: resolvedRole,
      seatKey: seatKey || null,
      roomData: roomData || null,
      startTime: finalStartTime,
      type: roomData?.type || "audio",
    };

    activeLiveRef.current = liveInfo;
    setActiveLive(liveInfo);
    setIsMiniPlayerVisible(false);
    setIsLiveMuted(false);

    if (agoraEngine) registerAgoraEngine(agoraEngine, agoraUid);

    console.log("LiveContext: Live started", liveInfo);
  };

  // ===================================================
  // UPDATE LIVE DATA
  // ===================================================

  const updateLiveInfo = (data = {}) => {

    setActiveLive(prev => {

      if (!prev) {
        return prev;
      }

      return {
        ...prev,
        ...data,
      };

    });

  };


  // ===================================================
  // REGISTER ENGINE AFTER startLive
  // ===================================================

  const setAgoraEngine = (
    engine,
    agoraUid = null
  ) => {

    registerAgoraEngine(
      engine,
      agoraUid
    );

  };


  // ===================================================
  // MINIMIZE LIVE
  // ===================================================

  const minimizeLive = () => {

    if (!activeLive) {

      console.log(
        "LiveContext: No active live"
      );

      return;

    }


    setIsMiniPlayerVisible(true);


    console.log(
      "LiveContext: Live minimized"
    );

  };


  // ===================================================
  // OPEN FULL LIVE
  // ===================================================

  const openLive = () => {

    if (!activeLive?.roomId) {

      console.log(
        "LiveContext: No room to open"
      );

      return;

    }


    setIsMiniPlayerVisible(false);


    router.push({

      pathname: "/LiveRoom",

      params: {

        id:
          String(activeLive.roomId),

        from:
          "mini-live",

      },

    });

  };


  // ===================================================
  // CLEAN FIREBASE USER FROM ROOM
  // ===================================================

  const removeUserFromRoom = async () => {

    if (!db) {

      console.log(
        "LiveContext: Firebase DB missing"
      );

      return;

    }


    if (!activeLive?.roomId) {
      return;
    }


    const currentUid =
      auth?.currentUser?.uid;


    if (!currentUid) {
      return;
    }


    try {

      const roomRef =
        doc(
          db,
          "rooms",
          String(activeLive.roomId)
        );


      const updates = {};


      // Remove audience
      updates[
        `audienceList.${currentUid}`
      ] = deleteField();


      // Remove own speaker seat
      const seats =
        activeLive?.roomData?.seatsData || {};


      Object.entries(seats).forEach(
        ([key, seat]) => {

          if (
            key !== "seat_1" &&
            seat?.userId === currentUid
          ) {

            updates[
              `seatsData.${key}`
            ] = {

              userId: null,

              userName: "Open",

              realName: "",

              userImg: "",

              isMuted: false,

            };

          }

        }
      );


      await updateDoc(
        roomRef,
        updates
      );


      console.log(
        "LiveContext: Firebase room cleanup complete"
      );


    } catch (error) {

      console.log(
        "LiveContext: Firebase cleanup error",
        error
      );

    }

  };


  // ===================================================
  // STOP AGORA
  // ===================================================

  const stopAgora = async () => {

    const engine =
      agoraEngineRef.current;


    if (!engine) {

      isAgoraJoinedRef.current = false;

      return;

    }


    try {

      console.log(
        "LiveContext: Leaving Agora..."
      );


      await engine.leaveChannel();


    } catch (error) {

      console.log(
        "LiveContext: Agora leave error",
        error
      );

    }


    try {

      engine.release();


    } catch (error) {

      console.log(
        "LiveContext: Agora release error",
        error
      );

    }


    agoraEngineRef.current = null;

    agoraUidRef.current = null;

    isAgoraJoinedRef.current = false;


    console.log(
      "LiveContext: Agora stopped"
    );

  };


  // ===================================================
  // CLOSE / EXIT MINI LIVE
  // ===================================================

  const closeLive = async () => {

    if (!activeLive) {
      return;
    }


    console.log(
      "LiveContext: Closing live"
    );


    setIsMiniPlayerVisible(false);


    // Firebase cleanup
    await removeUserFromRoom();


    // Agora cleanup
    await stopAgora();


    // Stop timer
    if (timerRef.current) {

      clearInterval(
        timerRef.current
      );

      timerRef.current = null;

    }


    // Clear state
    activeLiveRef.current = null;
    setActiveLive(null);

    setLiveDuration("00:00:00");

    setIsLiveMuted(false);


    console.log(
      "LiveContext: Live closed"
    );

  };


  // ===================================================
  // END LIVE ROOM
  // ONLY HOST SHOULD USE THIS
  // ===================================================

  const endLive = async () => {

    if (!activeLive?.roomId) {
      return;
    }


    const roomId =
      String(activeLive.roomId);


    console.log(
      "LiveContext: Ending live room",
      roomId
    );


    try {

      // First stop mini player
      setIsMiniPlayerVisible(false);


      // Stop Agora
      await stopAgora();


      // Delete Firebase room
      if (db) {

        await deleteDoc(
          doc(
            db,
            "rooms",
            roomId
          )
        );

      }


    } catch (error) {

      console.log(
        "LiveContext: End live error",
        error
      );

    }


    // Stop timer
    if (timerRef.current) {

      clearInterval(
        timerRef.current
      );

      timerRef.current = null;

    }


    activeLiveRef.current = null;
    setActiveLive(null);

    setLiveDuration("00:00:00");

    setIsLiveMuted(false);


    console.log(
      "LiveContext: Live ended"
    );

  };


  // ===================================================
  // MUTE / UNMUTE MINI LIVE AUDIO
  // ===================================================

  const toggleLiveMute = async () => {

    const engine =
      agoraEngineRef.current;


    if (!engine) {

      console.log(
        "LiveContext: Agora engine unavailable"
      );

      return;

    }


    try {

      const newMute =
        !isLiveMuted;


      await engine.muteAllRemoteAudioStreams(
        newMute
      );


      setIsLiveMuted(
        newMute
      );


      console.log(
        "LiveContext: Audio muted =",
        newMute
      );


    } catch (error) {

      console.log(
        "LiveContext: Mute error",
        error
      );

    }

  };


  // ===================================================
  // SWITCH TO ANOTHER LIVE
  // ===================================================

  const switchLive = async ({
    roomId,
    roomData = null,
    roomName = "Live Room",
    hostName = "User",
    hostImage = null,
    hostId = null,
    userRole = "listener",
    startTime = null,
  }) => {

    if (!roomId) {
      return;
    }


    // Existing live close
    await closeLive();


    // New live
    startLive({

      roomId,

      roomData,

      roomName,

      hostName,

      hostImage,

      hostId,

      userRole,

      startTime,

    });


    // Open new room
    setTimeout(() => {

      router.push({

        pathname: "/LiveRoom",

        params: {

          id:
            String(roomId),

          from:
            "all-live",

        },

      });

    }, 100);

  };


  // ===================================================
  // TIMER
  // ===================================================

  useEffect(() => {

    if (!activeLive?.startTime) {

      setLiveDuration(
        "00:00:00"
      );

      return;

    }


    const getStartTime = () => {

      const value =
        activeLive.startTime;


      if (
        typeof value === "number"
      ) {

        return value;

      }


      if (
        value?.toMillis
      ) {

        return value.toMillis();

      }


      if (
        value?.seconds
      ) {

        return (
          value.seconds * 1000
        );

      }


      const parsed =
        new Date(value).getTime();


      return (
        Number.isFinite(parsed)
          ? parsed
          : Date.now()
      );

    };


    const updateTimer = () => {

      const start =
        getStartTime();


      const difference =
        Math.max(
          0,
          Date.now() - start
        );


      const hours =
        Math.floor(
          difference / 3600000
        );


      const minutes =
        Math.floor(
          (difference % 3600000) /
          60000
        );


      const seconds =
        Math.floor(
          (difference % 60000) /
          1000
        );


      setLiveDuration(

        `${String(hours).padStart(2, "0")}:` +
        `${String(minutes).padStart(2, "0")}:` +
        `${String(seconds).padStart(2, "0")}`

      );

    };


    updateTimer();


    timerRef.current =
      setInterval(
        updateTimer,
        1000
      );


    return () => {

      if (timerRef.current) {

        clearInterval(
          timerRef.current
        );

        timerRef.current = null;

      }

    };

  }, [
    activeLive?.startTime
  ]);


  // ===================================================
  // CONTEXT VALUE
  // ===================================================

  const value = {

    // Live state
    activeLive,

    isMiniPlayerVisible,

    liveDuration,

    isLiveMuted,


    // Agora
    agoraEngineRef,

    agoraUidRef,

    isAgoraJoinedRef,


    // Live control
    startLive,

    updateLiveInfo,

    minimizeLive,

    openLive,

    closeLive,

    endLive,

    switchLive,


    // Agora control
    registerAgoraEngine,

    setAgoraEngine,

    unregisterAgoraEngine,

    stopAgora,

    toggleLiveMute,

  };


  return (

    <LiveContext.Provider
      value={value}
    >

      {children}

    </LiveContext.Provider>

  );

}


// =====================================================
// HOOK
// =====================================================

export function useLive() {

  const context =
    useContext(
      LiveContext
    );


  if (!context) {

    throw new Error(
      "useLive must be used inside LiveProvider"
    );

  }


  return context;

}


export default LiveContext;