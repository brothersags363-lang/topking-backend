// @ts-nocheck
// VideoLive.tsx
//
// One screen, two roles:
//  - role === "host"   → the broadcaster. Shows their own camera (local
//    Agora video) and sends a heartbeat so the live stays visible in
//    all-live.js's "Video Live" tab.
//  - role === "viewer" (default) → anyone opening the live from the list.
//    Shows the HOST's real camera feed (remote Agora video), not their own.
//
// Wired to the same `rooms` Firestore collection that all-live.js reads
// and livevideostart.tsx writes to, so starting a live actually makes it
// show up for other people, and opening it actually shows the host's video.

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Image,
  TextInput,
  Modal,
  Platform,
  StatusBar,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Animated,
  PermissionsAndroid,
  Dimensions,
  ActivityIndicator,
  Share,
} from "react-native";

import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";

import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  RtcSurfaceView,
} from "react-native-agora";

// Firebase safety check (same pattern as LiveRoom.js / all-live.js)
let db: any = null;
let auth: any = null;
try {
  const firebaseModule = require("./firebaseConfig");
  db = firebaseModule.db;
  auth = firebaseModule.auth;
} catch (e) {
  console.log("Firebase config not found.");
}

// Optional gift button animation — falls back to an emoji if missing.
let GiftLottie: any = null;
try {
  GiftLottie = require("lottie-react-native").default;
} catch (e) {
  GiftLottie = null;
}

const { height } = Dimensions.get("window");

const AGORA_APP_ID = "4e23c17b272f4a1c920c214be58486f4";
const TOKEN_ENDPOINT = "https://topking-backend.onrender.com/token";
const STABLE_AVATAR = "https://avatar.iran.liara.run/public/65";

// Same 30s window all-live.js uses to decide a room is still "live".
const HEARTBEAT_INTERVAL = 8000;

const getLevelTheme = (level = 1) => {
  if (level >= 50) return { bg: "#7B1FFF", border: "#FFD700", text: "#fff", icon: "#FFD700" };
  if (level >= 40) return { bg: "#00BFFF", border: "#9EF8FF", text: "#fff", icon: "#fff" };
  if (level >= 30) return { bg: "#FF0066", border: "#FFB6C1", text: "#fff", icon: "#fff" };
  if (level >= 20) return { bg: "#FFC107", border: "#FFE082", text: "#000", icon: "#fff" };
  if (level >= 10) return { bg: "#BDBDBD", border: "#fff", text: "#fff", icon: "#fff" };
  return { bg: "#222", border: "#555", text: "#FFD700", icon: "#00E5FF" };
};

// Same idea as LiveRoom.js's getLevelFrame — swap for your real frame
// assets, or ignore: the frame simply won't render if the require fails.
const getLevelFrame = (level = 1) => {
  try {
    if (level >= 50) return require("../assets/frames/lv50.png");
    if (level >= 40) return require("../assets/frames/lv40.png");
    if (level >= 30) return require("../assets/frames/lv30.png");
    if (level >= 20) return require("../assets/frames/lv20.png");
    if (level >= 10) return require("../assets/frames/lv10.png");
  } catch (e) {
    return null;
  }
  return null;
};

const GIFT_OPTIONS = [
  { id: "rose", emoji: "🌹", name: "Rose", coins: 10 },
  { id: "heart", emoji: "💖", name: "Heart", coins: 50 },
  { id: "crown", emoji: "👑", name: "Crown", coins: 200 },
  { id: "car", emoji: "🚗", name: "Car", coins: 500 },
  { id: "ring", emoji: "💍", name: "Ring", coins: 1000 },
  { id: "rocket", emoji: "🚀", name: "Rocket", coins: 2000 },
];

export default function VideoLive() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();

  const currentUid = auth?.currentUser?.uid || null;

  // roomId always comes from the list / from livevideostart.tsx now.
  const roomId = params?.id ? String(params.id) : null;
  const isHost = String(params?.role || "viewer") === "host";

  // ---------- room doc (title / host info / viewer count / chat) ----------
  const [roomData, setRoomData] = useState<any>(null);
  const [hostLevel, setHostLevel] = useState(1);
  const [hostVerified, setHostVerified] = useState(false);
  const [hostVerifiedColor, setHostVerifiedColor] = useState("white");

  const [roomStartTime, setRoomStartTime] = useState<number | null>(null);
  const [roomTimer, setRoomTimer] = useState("00:00:00");
  const [chatMessage, setChatMessage] = useState("");

  const [exitModalVisible, setExitModalVisible] = useState(false);
  const [giftModalVisible, setGiftModalVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // ---------- agora ----------
  const agoraEngineRef = useRef<any>(null);
  const [localReady, setLocalReady] = useState(false); // host's own camera up
  const [remoteUsers, setRemoteUsers] = useState<number[]>([]); // viewer sees these
  const [agoraStatus, setAgoraStatus] = useState(isHost ? "Starting camera..." : "Connecting to live...");

  const chatListRef = useRef<FlatList>(null);
  const heartbeatRef = useRef<any>(null);

  // pulsing red LIVE dot
  const dotPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, { toValue: 0.3, duration: 650, useNativeDriver: true }),
        Animated.timing(dotPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const chats = roomData?.chats || [];
  const viewerCount = roomData?.joinedUsers ? roomData.joinedUsers.length : 0;
  const hostName = roomData?.hostName || "Host";
  const hostImg = roomData?.hostImg || STABLE_AVATAR;
  const hostId = roomData?.hostId || (isHost ? currentUid : null);

  // ---------- guard: no room id at all ----------
  useEffect(() => {
    if (!roomId) {
      console.log("VideoLive opened without a room id.");
    }
  }, [roomId]);

  // ---------- listen to the room doc (rooms/{roomId}) ----------
  useEffect(() => {
    if (!db || !roomId) return;

    const roomRef = doc(db, "rooms", roomId);

    const unsub = onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) {
        setRoomData(null);
        return;
      }
      const data = snap.data();
      setRoomData(data);

      if (data.createdAt?.toMillis) {
        setRoomStartTime(data.createdAt.toMillis());
      } else if (data.createdAt?.seconds) {
        setRoomStartTime(data.createdAt.seconds * 1000);
      } else if (!roomStartTime) {
        setRoomStartTime(Date.now());
      }

      // Room ended (host stopped it) → send the viewer back automatically.
      if (!isHost && data.status === "ended") {
        router.back();
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ---------- fetch the HOST's profile (level / verified) ----------
  useEffect(() => {
    const loadHostProfile = async () => {
      if (!db || !hostId) return;
      try {
        const snap = await getDoc(doc(db, "users", hostId));
        if (snap.exists()) {
          const data = snap.data();
          setHostLevel(data?.level || 1);
          setHostVerified(!!data?.verified);
          setHostVerifiedColor(data?.verifiedColor || "white");
        }
      } catch (e) {
        console.log("HOST PROFILE LOAD ERROR:", e);
      }
    };
    loadHostProfile();
  }, [hostId]);

  // ---------- host: make sure the room is marked active + start heartbeat ----------
  useEffect(() => {
    if (!db || !roomId || !isHost) return;

    const roomRef = doc(db, "rooms", roomId);

    (async () => {
      try {
        await setDoc(roomRef, { status: "active", lastHeartbeat: serverTimestamp() }, { merge: true });
      } catch (e) {
        console.log("ROOM ACTIVATE ERROR:", e);
      }
    })();

    heartbeatRef.current = setInterval(() => {
      updateDoc(roomRef, { lastHeartbeat: serverTimestamp() }).catch(() => {});
    }, HEARTBEAT_INTERVAL);

    return () => {
      clearInterval(heartbeatRef.current);
      // Host leaving → live is really over, take it out of the list.
      updateDoc(roomRef, { status: "ended", endedAt: serverTimestamp() }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost]);

  // ---------- live duration timer ----------
  useEffect(() => {
    if (!roomStartTime) return;
    const interval = setInterval(() => {
      const diff = Date.now() - roomStartTime;
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRoomTimer(
        `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [roomStartTime]);

  // ---------- keyboard offset for the bottom bar ----------
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ---------- auto-scroll chat ----------
  useEffect(() => {
    if (!chats.length) return;
    requestAnimationFrame(() => chatListRef.current?.scrollToEnd({ animated: true }));
  }, [chats.length]);

  // ---------- Agora: host broadcasts video, viewer just watches ----------
  useEffect(() => {
    if (!roomId) return;
    let mounted = true;

    const initAgora = async () => {
      try {
        // Give the PREVIOUS screen's camera (e.g. the record/camera
        // screen) a brief moment to fully release the hardware after
        // it unmounts. Without this, Agora can grab the camera for
        // one frame and then lose it to the still-tearing-down
        // previous screen, which freezes the live video on that
        // single frame (looks like a stuck photo).
        if (isHost) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          if (!mounted) return;
        }

        if (Platform.OS === "android") {
          const perms = isHost
            ? [PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]
            : [];
          if (perms.length) {
            const granted = await PermissionsAndroid.requestMultiple(perms);
            if (granted[PermissionsAndroid.PERMISSIONS.CAMERA] !== PermissionsAndroid.RESULTS.GRANTED) {
              throw new Error("Camera permission denied");
            }
          }
        }

        setAgoraStatus(isHost ? "Connecting..." : "Connecting to live...");

        // ---- get an Agora token from the backend (same pattern as LiveRoom.js) ----
        let token: string | null = null;
        let numericUid = Math.floor(Math.random() * 999999) + 1;

        try {
          const firebaseUser = auth?.currentUser;
          if (firebaseUser) {
            const idToken = await firebaseUser.getIdToken(true);
            numericUid =
              (currentUid || "guest").split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0) %
              1000000;

            // 8-second hard timeout: Render's free tier can take a long
            // time to wake up (or may be down). Without this, a slow/
            // unreachable backend leaves the screen stuck on
            // "Connecting..." forever instead of falling back.
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(
              `${TOKEN_ENDPOINT}?channel=${encodeURIComponent(roomId)}&uid=${numericUid}`,
              {
                headers: { Authorization: `Bearer ${idToken}`, Accept: "application/json" },
                signal: controller.signal,
              }
            );
            clearTimeout(timeoutId);
            const tokenData = await response.json();
            if (response.ok && tokenData?.success && tokenData?.token) {
              token = tokenData.token;
              numericUid = Number(tokenData.uid) || numericUid;
            }
          }
        } catch (tokenErr) {
          console.log("AGORA TOKEN FETCH FAILED, joining without token:", tokenErr);
        }

        const engine = createAgoraRtcEngine();
        engine.initialize({ appId: AGORA_APP_ID });

        // Failsafe: if we never hear back from Agora (join success OR
        // error) within 15s, stop spinning forever and show something
        // actionable instead of an endless "Connecting..." screen.
        const joinTimeoutId = setTimeout(() => {
          if (mounted) {
            setAgoraStatus((current) =>
              current === "Connecting..." || current === "Connecting to live..."
                ? "Failed: Could not reach the live server (check network / Agora setup)"
                : current
            );
          }
        }, 15000);

        engine.registerEventHandler({
          onJoinChannelSuccess: () => {
            console.log("VIDEO LIVE: joined channel", roomId, "as", isHost ? "host" : "viewer");
            clearTimeout(joinTimeoutId);
            if (mounted) setAgoraStatus("Live");
          },
          onUserJoined: (_connection: any, uid: number) => {
            // The viewer's screen fills with whichever remote user joins —
            // for this app that is the host's own camera.
            if (mounted) setRemoteUsers((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
          },
          onUserOffline: (_connection: any, uid: number) => {
            if (mounted) setRemoteUsers((prev) => prev.filter((id) => id !== uid));
          },
          onError: (err: any) => {
            console.log("Agora Error:", err);
            clearTimeout(joinTimeoutId);
            if (mounted) setAgoraStatus(`Error ${err}`);
          },
        });

        await engine.enableVideo();

        if (isHost) {
          await engine.enableAudio();
          engine.startPreview();

          // Show the host's own camera preview IMMEDIATELY — this
          // doesn't need the channel join to succeed. Previously this
          // only flipped to true after joinChannel() resolved, so if
          // the connection was slow (or the token/network was the
          // problem), the camera never appeared at all — just an
          // endless "Connecting..." screen with no preview.
          if (mounted) setLocalReady(true);

          await engine.setChannelProfile(ChannelProfileType.ChannelProfileLiveBroadcasting);
          await engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
          await engine.joinChannel(token || "", roomId, numericUid, {
            channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
            clientRoleType: ClientRoleType.ClientRoleBroadcaster,
          });
        } else {
          await engine.setChannelProfile(ChannelProfileType.ChannelProfileLiveBroadcasting);
          await engine.setClientRole(ClientRoleType.ClientRoleAudience);
          await engine.joinChannel(token || "", roomId, numericUid, {
            channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
            clientRoleType: ClientRoleType.ClientRoleAudience,
          });
        }

        agoraEngineRef.current = engine;
      } catch (error: any) {
        console.log("VIDEO LIVE AGORA INIT ERROR:", error?.message || error);
        if (mounted) setAgoraStatus(`Failed: ${error?.message || error}`);
      }
    };

    initAgora();

    return () => {
      mounted = false;
      const engine = agoraEngineRef.current;
      if (engine) {
        try {
          if (isHost) engine.stopPreview();
          engine.leaveChannel();
          engine.release();
        } catch (e) {
          console.log("AGORA CLEANUP ERROR:", e);
        }
        agoraEngineRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost]);

  // ---------- hardware back → confirm before leaving / ending the live ----------
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        setExitModalVisible(true);
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => sub.remove();
    }, [])
  );

  const confirmExit = () => {
    setExitModalVisible(false);
    router.back();
  };

  const handleShare = async () => {
    try {
      const shareLink = `https://topking.app/live/${roomId}`;
      await Share.share({ message: `🎥 Join ${hostName}'s Live now!\n${shareLink}` });
    } catch (e) {
      console.log(e);
    }
  };

  const handleSendChat = async () => {
    if (!chatMessage.trim() || !db || !roomId) return;
    const newChat = {
      id: `${Date.now()}`,
      name: isHost ? hostName : auth?.currentUser?.displayName || "User",
      avatar: isHost ? hostImg : auth?.currentUser?.photoURL || STABLE_AVATAR,
      message: chatMessage.trim(),
      ts: Date.now(),
    };
    setChatMessage("");
    try {
      await updateDoc(doc(db, "rooms", roomId), { chats: arrayUnion(newChat) });
    } catch (e) {
      console.log("CHAT SEND ERROR:", e);
    }
  };

  const sendGift = async (gift: any) => {
    setGiftModalVisible(false);
    if (!db || !roomId) return;
    try {
      await updateDoc(doc(db, "rooms", roomId), {
        chats: arrayUnion({
          id: `${Date.now()}`,
          name: auth?.currentUser?.displayName || "User",
          avatar: auth?.currentUser?.photoURL || STABLE_AVATAR,
          message: `sent ${gift.emoji} ${gift.name}!`,
          ts: Date.now(),
          isGift: true,
        }),
      });
    } catch (e) {
      console.log("GIFT SEND ERROR:", e);
    }
  };

  const levelTheme = getLevelTheme(hostLevel);
  const levelFrame = getLevelFrame(hostLevel);

  // What's actually shown as the "video": host's own local preview, or the
  // first remote stream a viewer has received (the host's camera).
  const showLocalVideo = isHost && localReady;
  const showRemoteVideo = !isHost && remoteUsers.length > 0;

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ================= BACKGROUND VIDEO ================= */}
      {showLocalVideo && (
        <RtcSurfaceView style={StyleSheet.absoluteFill} canvas={{ uid: 0 }} />
      )}

      {showRemoteVideo && (
        <RtcSurfaceView style={StyleSheet.absoluteFill} canvas={{ uid: remoteUsers[0] }} />
      )}

      {!showLocalVideo && !showRemoteVideo && (
        <View style={[StyleSheet.absoluteFill, styles.loadingBg]}>
          {isHost || agoraStatus !== "Live" ? (
            <>
              <ActivityIndicator size="large" color="#F71084" />
              <Text style={styles.loadingText}>{agoraStatus}</Text>
            </>
          ) : (
            <>
              <Ionicons name="videocam-off-outline" size={40} color="#555" />
              <Text style={styles.loadingText}>Waiting for host's camera...</Text>
            </>
          )}
        </View>
      )}

      {/* soft top/bottom scrims so the white text stays readable */}
      <View pointerEvents="none" style={styles.topScrim} />
      <View pointerEvents="none" style={styles.bottomScrim} />

      {/* ================= TOP HEADER ================= */}
      <SafeAreaView style={styles.topHeader}>
        <View style={styles.hostBadge}>
          <View style={styles.hostAvatarContainer}>
            <Image source={{ uri: hostImg }} style={styles.hostAvatarImg} />
            {hostLevel >= 10 && levelFrame && (
              <Image source={levelFrame} style={styles.hostLevelFrame} />
            )}
          </View>

          <View style={{ marginLeft: 10 }}>
            <View style={styles.nameRow}>
              <Text style={styles.hostNameText} numberOfLines={1}>
                {hostName}
              </Text>

              {hostVerified && (
                <View style={styles.verifiedBadge}>
                  <MaterialCommunityIcons
                    name="check-decagram"
                    size={16}
                    color={hostVerifiedColor === "yellow" ? "#FFD700" : "#ffffff"}
                  />
                </View>
              )}

              <View
                style={[
                  styles.levelBadge,
                  { backgroundColor: levelTheme.bg, borderColor: levelTheme.border },
                ]}
              >
                <MaterialCommunityIcons name="diamond-stone" size={10} color={levelTheme.icon} />
                <Text style={[styles.levelText, { color: levelTheme.text }]}>LV {hostLevel}</Text>
              </View>
            </View>

            <View style={styles.viewRow}>
              <Ionicons name="videocam" size={13} color="#fff" />
              <Text style={styles.viewsText}>{viewerCount} views</Text>

              <View style={styles.liveTag}>
                <Animated.View style={[styles.liveDot, { opacity: dotPulse }]} />
                <Text style={styles.liveTagText}>LIVE {roomTimer}</Text>
              </View>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.viewerCount} onPress={() => setExitModalVisible(true)}>
          <Text style={styles.viewerCountText}>{viewerCount}</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* ================= CHAT OVERLAY ================= */}
      <FlatList
        ref={chatListRef}
        data={chats.slice(-30)}
        keyExtractor={(item: any) => item.id}
        style={[styles.chatArea, { bottom: 96 + keyboardHeight }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }: any) => (
          <View style={styles.chatRow}>
            <Image source={{ uri: item.avatar || STABLE_AVATAR }} style={styles.chatAva} />
            <View style={styles.chatContent}>
              <Text style={styles.chatUser}>{item.name}</Text>
              <View style={[styles.bubble, item.isGift && styles.giftBubble]}>
                <Text style={styles.chatMsg}>{item.message}</Text>
              </View>
            </View>
          </View>
        )}
      />

      {/* ================= BOTTOM BAR ================= */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
        style={[
          styles.bottomNav,
          { paddingBottom: Platform.OS === "android" ? insets.bottom + 8 : insets.bottom },
        ]}
      >
        <View style={styles.inputBox}>
          <TextInput
            style={styles.inputStyle}
            placeholder="Chat"
            placeholderTextColor="#aaa"
            value={chatMessage}
            onChangeText={setChatMessage}
            onSubmitEditing={handleSendChat}
            returnKeyType="send"
          />
        </View>

        <TouchableOpacity style={styles.circleBtn} onPress={handleShare}>
          <Ionicons name="share-social" size={20} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.circleBtn} onPress={() => setExitModalVisible(true)}>
          <Ionicons name="people-outline" size={22} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.giftCircle} onPress={() => setGiftModalVisible(true)}>
          {GiftLottie ? (
            <GiftLottie
              source={require("../assets/animations/giftButton.json")}
              autoPlay
              loop
              style={{ width: 46, height: 46 }}
            />
          ) : (
            <Text style={{ fontSize: 22 }}>🎁</Text>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>

      {/* ================= EXIT CONFIRM MODAL ================= */}
      <Modal transparent visible={exitModalVisible} animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.exitBox}>
            <Text style={styles.exitTitle}>{isHost ? "End Live?" : "Leave Live?"}</Text>
            <Text style={styles.exitSub}>
              {isHost
                ? "Your live stream will end for everyone watching."
                : "You can rejoin anytime while the host is still live."}
            </Text>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.noBtn} onPress={() => setExitModalVisible(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.yesBtn} onPress={confirmExit}>
                <Text style={styles.btnText}>{isHost ? "End Live" : "Leave"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= GIFT MODAL ================= */}
      <Modal transparent visible={giftModalVisible} animationType="slide">
        <TouchableOpacity style={styles.giftOverlay} activeOpacity={1} onPress={() => setGiftModalVisible(false)}>
          <View style={styles.giftSheet}>
            <Text style={styles.giftTitle}>Send a Gift</Text>
            <View style={styles.giftGrid}>
              {GIFT_OPTIONS.map((gift) => (
                <TouchableOpacity key={gift.id} style={styles.giftCard} onPress={() => sendGift(gift)}>
                  <Text style={styles.giftEmoji}>{gift.emoji}</Text>
                  <Text style={styles.giftName}>{gift.name}</Text>
                  <Text style={styles.giftCoin}>{gift.coins} 💎</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  loadingBg: { justifyContent: "center", alignItems: "center", backgroundColor: "#0A0B14" },
  loadingText: { color: "#AAB6D4", marginTop: 10, fontSize: 12, fontWeight: "600" },

  topScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 130,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  bottomScrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  /* HEADER */
  topHeader: {
    position: "absolute",
    top: 30,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  hostBadge: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  hostAvatarContainer: { position: "relative", justifyContent: "center", alignItems: "center" },
  hostAvatarImg: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: "#fff" },
  hostLevelFrame: { position: "absolute", width: 64, height: 64, resizeMode: "contain" },

  nameRow: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  hostNameText: { color: "#fff", fontSize: 15, fontWeight: "800", maxWidth: 130 },
  verifiedBadge: { marginLeft: 5, justifyContent: "center", alignItems: "center" },
  levelBadge: {
    marginLeft: 6,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  levelText: { fontSize: 9, fontWeight: "bold", marginLeft: 2 },

  viewRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  viewsText: { color: "#fff", fontSize: 11, fontWeight: "600", marginLeft: 4, marginRight: 8 },
  liveTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E63946",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff", marginRight: 4 },
  liveTagText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  viewerCount: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  viewerCountText: { color: "#fff", fontWeight: "bold", fontSize: 13 },

  /* CHAT */
  chatArea: { position: "absolute", left: 0, right: 0, maxHeight: height * 0.35, paddingHorizontal: 10 },
  chatRow: { flexDirection: "row", marginBottom: 10, alignItems: "flex-start" },
  chatAva: { width: 30, height: 30, borderRadius: 15 },
  chatContent: { flex: 1, marginLeft: 8 },
  chatUser: { color: "#fff", fontWeight: "bold", fontSize: 11, marginBottom: 2 },
  bubble: { backgroundColor: "rgba(0,0,0,0.45)", padding: 8, borderRadius: 10, alignSelf: "flex-start" },
  giftBubble: { backgroundColor: "rgba(255,105,180,0.35)" },
  chatMsg: { color: "#fff", fontSize: 12 },

  /* BOTTOM BAR */
  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  inputBox: {
    flex: 1,
    height: 42,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 21,
    justifyContent: "center",
    paddingHorizontal: 16,
    marginRight: 10,
  },
  inputStyle: { color: "#fff", fontSize: 14 },
  circleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
  giftCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },

  /* EXIT MODAL */
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center" },
  exitBox: { width: "80%", backgroundColor: "#1C1E2E", padding: 25, borderRadius: 20, alignItems: "center" },
  exitTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  exitSub: { color: "#9aa0b4", textAlign: "center", marginTop: 10, fontSize: 12 },
  btnRow: { flexDirection: "row", marginTop: 22 },
  noBtn: { backgroundColor: "#34495e", paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10, marginRight: 15 },
  yesBtn: { backgroundColor: "#e74c3c", paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10 },
  btnText: { color: "#fff", fontWeight: "bold" },

  /* GIFT MODAL */
  giftOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  giftSheet: {
    backgroundColor: "#111827",
    minHeight: height * 0.4,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 22,
    paddingHorizontal: 18,
    paddingBottom: 30,
  },
  giftTitle: { color: "#fff", fontSize: 18, fontWeight: "bold", marginBottom: 18 },
  giftGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  giftCard: {
    width: "30%",
    backgroundColor: "#1C1E2E",
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 16,
    alignItems: "center",
  },
  giftEmoji: { fontSize: 26 },
  giftName: { color: "#fff", fontSize: 11, marginTop: 4 },
  giftCoin: { color: "#999", fontSize: 11, marginTop: 4 },
});
