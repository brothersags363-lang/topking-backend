import { notifyLiveStarted } from "../utils/pushNotify";
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Image,
  Alert,
  StatusBar,
  ScrollView,
  Dimensions,
  Platform,
  ActivityIndicator,
  BackHandler,
  Modal
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLiveBanGuard } from '../utils/liveBan';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

let db = null;
let auth = null;
let storage = null;
try {
  const firebaseModule = require('./firebaseConfig');
  db = firebaseModule.db;
  auth = firebaseModule.auth; 
  storage = firebaseModule.storage;
} catch (e) {
  console.log("Firebase architecture fallback inside LiveStart.");
}

import { doc, setDoc, getDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const { width } = Dimensions.get('window');
// Video (camera) live start screen ka route. Agar file ka naam alag ho to sirf yahan badlo.
const VIDEO_LIVE_ROUTE = '/livevideostart';
const DEFAULT_AVATAR = 'https://avatar.iran.liara.run/public/65';

// Fixed room notice (TopKing rules). Hosts cannot edit or replace it.
const ROOM_NOTICE =
  "Welcome to TopKing! Please keep this room safe and respectful. As per TopKing app rules, abusive language, bad talk or any inappropriate behavior is strictly prohibited. Anyone who breaks these rules will have their live shut down.";

// Room layouts. 'chat' = purana audio chat room (8 seats).
// 'multiguest' = screenshot jaisa grid room: host + 8 guests, sab baith ke baat kar sakte hain.
const ROOM_LAYOUTS = [
  {
    key: 'chat',
    title: 'Chat Room',
    desc: 'Normal audio room with seats',
    icon: 'chatbubbles-outline',
    seats: 8,
  },
  {
    key: 'multiguest',
    title: 'Multi-Guest Room',
    desc: 'Grid room: host + 8 guests, sab baith ke baat kar sakein',
    icon: 'grid-outline',
    seats: 9,
  },
];

export default function LiveStart() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useLiveBanGuard(true);

  const [roomPhoto, setRoomPhoto] = useState(null);
  const [roomTitle, setRoomTitle] = useState('');
  const [roomDescription, setRoomDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false); 
const [loadingButton, setLoadingButton] = useState(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [roomLayout, setRoomLayout] = useState('chat');
  const [showTypeModal, setShowTypeModal] = useState(false);
  const startingRef = useRef(false);   // double-tap guard (state async hota hai)

  // FIXED & ADDED: MOBILE HARDWARE BACK BUTTON LOGIC WITH MODERN CRASH PROTECTION
  useEffect(() => {
    const handleBackButton = () => {
      try {
        if (router.canGoBack()) {
          router.back(); // Jis screen se open kiya tha, wahi wapas pahuchega
        } else {
          router.replace('/'); // Safe fallback to root home screen
        }
      } catch (error) {
        console.log("Navigation Back Error: ", error);
        router.replace('/'); 
      }
      return true; // Smartphone default close action filter
    };

    const backHandlerSubscription = BackHandler.addEventListener(
      'hardwareBackPress', 
      handleBackButton
    );

    return () => {
      // Safe remove method subscription unmount
      backHandlerSubscription.remove();
    };
  }, [router]);

  const pickImage = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6, 
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setRoomPhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.log("Image picker error:", error);
    }
  };

  const uploadImageAsync = async (uri, roomId) => {
    if (!uri || !storage) return null;
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileRef = ref(storage, `roomCovers/${roomId}_banner.jpg`);
      await uploadBytes(fileRef, blob);
      return await getDownloadURL(fileRef);
    } catch (err) {
      return null;
    }
  };

  // Purane chat/audience docs ko 400-400 ke batch me delete karo (1-1 karke nahi).
  const clearOldSession = async (roomUniqueId) => {
    try {
      const [oldChatsSnap, oldAudienceSnap] = await Promise.all([
        getDocs(collection(db, 'rooms', roomUniqueId, 'chats')),
        getDocs(collection(db, 'rooms', roomUniqueId, 'audience')),
      ]);
      const refs = [...oldChatsSnap.docs, ...oldAudienceSnap.docs].map(d => d.ref);
      for (let i = 0; i < refs.length; i += 400) {
        const batch = writeBatch(db);
        refs.slice(i, i + 400).forEach(r => batch.delete(r));
        await batch.commit();
      }
    } catch (cleanupErr) {
      console.log("Old session cleanup skipped:", cleanupErr);
    }
  };

  const handleStartLive = async (roomType = "public") => {
    if (startingRef.current) return;
    if (!roomTitle.trim()) {
      Alert.alert("Required", "Please provide a catchy room title first.");
      return;
    }
    startingRef.current = true;
    setLoadingButton(roomType);

    setIsUploading(true);
    const finalTitle = roomTitle.trim();
    const finalDescription = ROOM_NOTICE;

    const currentUser = auth?.currentUser;
    const currentUid = currentUser?.uid || "guest_host_" + Math.floor(Math.random() * 10000);

    let hostName = currentUser?.displayName || "AGS User"; 
    let hostAvatar = currentUser?.photoURL || DEFAULT_AVATAR;

    try {
      const roomUniqueId = currentUid.includes("guest_host") ? 'room_' + Date.now() : currentUid;

      // Teeno kaam ek saath: user profile read, purana session saaf, cover upload.
      // (Pehle ye ek ke baad ek chalte the -> live start hone me der lagti thi.)
      const userTask = (async () => {
        if (db && currentUser?.uid) {
          const userSnapshot = await getDoc(doc(db, "users", currentUser.uid));
          if (userSnapshot.exists()) {
            const userData = userSnapshot.data();
            hostName = userData.name || userData.username || hostName;
            hostAvatar = userData.profileImg || userData.photoURL || hostAvatar;
          }
        }
      })();
      const cleanupTask = db ? clearOldSession(roomUniqueId) : Promise.resolve();
      const uploadTask = roomPhoto ? uploadImageAsync(roomPhoto, roomUniqueId) : Promise.resolve(null);

      const [, , cloudUrl] = await Promise.all([userTask, cleanupTask, uploadTask]);

      let finalCover = cloudUrl || hostAvatar;

      const isMultiGuest = roomLayout === 'multiguest';
      // Multi-guest: sirf 9 seats (host + 8 guests), sab khali -> koi bhi baith sakta hai.
      const totalSeats = isMultiGuest ? 9 : 14;
      const initialSeatsObject = {};
      for (let i = 1; i <= totalSeats; i++) {
        initialSeatsObject[`seat_${i}`] = {
          userId: i === 1 ? currentUid : null,
          userName: i === 1 ? hostName : null,
          userImg: i === 1 ? hostAvatar : null,
          isMuted: false,
          roleTag: i === 1 ? 'HOST' : isMultiGuest ? 'GUEST' : i === 2 ? 'CO-HOST' : 'SPEAKER'
        };
      }

      const newRoomPayload = {
        roomId: roomUniqueId,
        hostId: currentUid, 
        title: finalTitle,
        description: finalDescription,
        hostName: hostName,
        hostImg: hostAvatar, 
        status: 'active', 
        type: 'audio', 
        roomType: roomType,
        // NOTE: chat + viewer presence now live in subcollections
        // (rooms/{roomId}/chats, rooms/{roomId}/audience) instead of
        // fields on this document — keeps this doc small and cheap to
        // sync at 200-300 concurrent viewers. See LiveRoom.js.
        invitationIncoming: null, 
        seatCount: isMultiGuest ? 9 : 8,
        // Room layout: 'chat' | 'multiguest'. LiveRoom + all-live isi field se grid dikhate hain.
        roomLayout: roomLayout,
        // Multi-guest: koi bhi khali seat par baith ke bol sakta hai (host approval nahi).
        freeSeat: isMultiGuest,
        openMic: isMultiGuest,
        seatsData: initialSeatsObject, 
        roomCover: finalCover, 
        createdAt: Date.now()
        
      };

      if (db) {
        await setDoc(doc(db, 'rooms', roomUniqueId), newRoomPayload);
        notifyLiveStarted(roomUniqueId); // followers ko push
      }

      setIsUploading(false);
      startingRef.current = false;
      // Wapas aane par button par spinner atka na rahe
      setTimeout(() => setLoadingButton(null), 600);

if (roomLayout === "multiguest") {

  // Multi-guest room alag screen (MultiGuestRoom.js) me chalta hai
  router.push({
    pathname: "/MultiGuestRoom",
    params: { id: roomUniqueId },
  });

} else if (roomType === "private") {

  router.push({
    pathname: "/LivePrivate",
    params: {
      id: roomUniqueId,
      hostName: hostName,
      hostProfilePic: hostAvatar,
      layout: roomLayout,
    },
  });

} else {

  router.push({
    pathname: "/LiveRoom",
    params: {
      id: roomUniqueId,
      hostName: hostName,
      hostProfilePic: hostAvatar,
      layout: roomLayout,
    },
  });

}

    } catch (error) {
      setIsUploading(false);
      startingRef.current = false;
      setLoadingButton(null);
      Alert.alert("Error", "Could not create structural audio engine stream.");
    }
  };

  const busy = isUploading || loadingButton !== null;

  const openVideoCamera = () => {
    if (busy) return;
    try {
      router.push(VIDEO_LIVE_ROUTE);
    } catch (e) {
      Alert.alert('Video', 'Camera page open nahi ho paya.');
    }
  };

  const closeScreen = () => {
    try {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      router.replace('/');
    }
  };

  const startLabel = isPrivate
    ? 'START (Private Room)'
    : roomLayout === 'multiguest'
      ? 'START (Multi-Guest Room)'
      : 'START (chet Room)';

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Background: dark purple night gradient (screenshot jaisa) */}
      <LinearGradient
        colors={['#1a0b2e', '#2a0f3d', '#4a1747', '#6b2438']}
        locations={[0, 0.4, 0.75, 1]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={{ flex: 1 }}>
        {/* ===== TOP: close + Video/Audio tabs ===== */}
        <View style={styles.topRow}>
          <TouchableOpacity onPress={closeScreen} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>

          <View style={styles.modeTabs}>
            {/* Video tab: video live start screen par le jata hai.
                Agar aapka route naam alag ho to yahan badal dena. */}
            <TouchableOpacity onPress={openVideoCamera}>
              <Text style={styles.modeTabInactive}>Video</Text>
            </TouchableOpacity>
            <View style={{ alignItems: 'center', marginLeft: 26 }}>
              <Text style={styles.modeTabActive}>Audio</Text>
              <View style={styles.modeTabUnderline} />
            </View>
          </View>

          <View style={{ width: 30 }} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          {/* ===== Cover + Title ===== */}
          <View style={styles.coverTitleRow}>
            <TouchableOpacity style={styles.coverBox} onPress={pickImage} activeOpacity={0.85}>
              {roomPhoto ? (
                <Image source={{ uri: roomPhoto }} style={styles.coverImg} resizeMode="cover" />
              ) : null}
              <View style={styles.coverLabelBar}>
                <Text style={styles.coverLabelText}>Change cover</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.titleWrap}>
              <TextInput
                style={styles.titleInput}
                placeholder="Enter the title get more viewers"
                placeholderTextColor="rgba(255,255,255,0.85)"
                value={roomTitle}
                onChangeText={setRoomTitle}
                maxLength={60}
              />
              <View style={styles.titleUnderline} />
            </View>
          </View>

          {/* ===== Floating brush button (left) ===== */}
          <TouchableOpacity style={styles.brushBtn} activeOpacity={0.85} onPress={pickImage}>
            <Ionicons name="brush" size={18} color="#fff" />
          </TouchableOpacity>

        </ScrollView>

        {/* ===== Room Type / Privacy ===== */}
        <View style={styles.optionsRow}>
          <TouchableOpacity
            style={styles.optionItem}
            activeOpacity={0.8}
            onPress={() => setShowTypeModal(true)}
          >
            <Ionicons name={roomLayout === 'multiguest' ? 'grid' : 'grid-outline'} size={22} color={roomLayout === 'multiguest' ? YELLOW : '#fff'} />
            <Text style={styles.optionText}>{roomLayout === 'multiguest' ? 'Multi-Guest' : 'Room Type'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionItem, { marginLeft: 36 }]}
            activeOpacity={0.8}
            onPress={() => setIsPrivate((p) => !p)}
          >
            <Ionicons name={isPrivate ? 'lock-closed' : 'lock-open-outline'} size={22} color="#fff" />
            <Text style={styles.optionText}>Privacy</Text>
          </TouchableOpacity>
        </View>

        {/* ===== START button ===== */}
        <TouchableOpacity
          style={[styles.startBtn, !roomTitle.trim() && styles.startBtnDim]}
          activeOpacity={0.85}
          disabled={busy}
          onPress={() => handleStartLive(isPrivate ? 'private' : 'public')}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.startBtnText}>{startLabel}</Text>
          )}
        </TouchableOpacity>

        {/* ===== Bottom tabs: VIDEO / LIVE / CHAT ===== */}
        <View style={[styles.bottomTabs, { paddingBottom: Math.max(insets.bottom, 16) + 28 }]}>
          <TouchableOpacity onPress={openVideoCamera}>
            <Text style={styles.bottomTabInactive}>VIDEO</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginHorizontal: 34 }} onPress={openVideoCamera}>
            <Text style={styles.bottomTabInactive}>LIVE</Text>
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.bottomTabActive}>CHAT</Text>
            <View style={styles.bottomTabDot} />
          </View>
        </View>
      </SafeAreaView>

      {/* ===== Room Type picker ===== */}
      <Modal
        visible={showTypeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTypeModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowTypeModal(false)}
        >
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Room Type</Text>
            {ROOM_LAYOUTS.map((l) => {
              const active = roomLayout === l.key;
              return (
                <TouchableOpacity
                  key={l.key}
                  style={[styles.typeRow, active && styles.typeRowActive]}
                  activeOpacity={0.85}
                  onPress={() => {
                    setRoomLayout(l.key);
                    setShowTypeModal(false);
                  }}
                >
                  <View style={styles.typeIconWrap}>
                    <Ionicons name={l.icon} size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.typeTitle}>{l.title}</Text>
                    <Text style={styles.typeDesc}>{l.desc}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={22} color={YELLOW} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const YELLOW = '#fff200';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a0b2e' },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 8,
  },
  modeTabs: { flexDirection: 'row', alignItems: 'flex-start' },
  modeTabInactive: { color: 'rgba(255,255,255,0.65)', fontSize: 16, fontWeight: '600' },
  modeTabActive: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modeTabUnderline: { width: 26, height: 3, borderRadius: 2, backgroundColor: '#fff', marginTop: 5 },

  coverTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    marginTop: 22,
  },
  coverBox: {
    width: 68,
    height: 82,
    borderRadius: 8,
    backgroundColor: '#8a8a8a',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  coverImg: { ...StyleSheet.absoluteFillObject },
  coverLabelBar: { backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 3, alignItems: 'center' },
  coverLabelText: { color: '#fff', fontSize: 9, fontWeight: '600' },

  titleWrap: { flex: 1, marginLeft: 14, marginTop: 8 },
  titleInput: { color: '#fff', fontSize: 16, fontWeight: '700', paddingVertical: 6, paddingHorizontal: 0 },
  titleUnderline: { height: 1, backgroundColor: 'rgba(255,255,255,0.35)', marginTop: 4 },

  brushBtn: {
    position: 'absolute',
    left: 0,
    top: 200,
    width: 34,
    height: 34,
    borderTopRightRadius: 17,
    borderBottomRightRadius: 17,
    backgroundColor: '#f2832b',
    justifyContent: 'center',
    alignItems: 'center',
  },

  optionsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  optionItem: { alignItems: 'center' },
  optionText: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 5 },

  startBtn: {
    alignSelf: 'center',
    width: width - 80,
    height: 46,
    borderRadius: 23,
    backgroundColor: YELLOW,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startBtnDim: { opacity: 0.92 },
  startBtnText: { color: '#000', fontSize: 15, fontWeight: '800' },

  bottomTabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingTop: 18,
  },
  bottomTabInactive: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700' },
  bottomTabActive: { color: '#fff', fontSize: 14, fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#24102f',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    paddingBottom: 34,
  },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: '800', marginBottom: 14, textAlign: 'center' },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  typeRowActive: { borderColor: YELLOW },
  typeIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  typeDesc: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },
  bottomTabDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: YELLOW, marginTop: 4 },
});
