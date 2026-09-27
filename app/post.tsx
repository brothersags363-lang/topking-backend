import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Alert,
  ActivityIndicator,
  StatusBar,
  Image,
} from 'react-native';

import { Ionicons, Feather, MaterialIcons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';



import { BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { useNavigation } from "@react-navigation/native";

// FIREBASE
import { db, auth } from './firebaseConfig'; // 'auth' import kiya

// BACKGROUND UPLOAD (upload screen se hatne ke baad bhi chalta rehta hai)
// Ye files ab app/ folder ke BAHAR services/upload/ me hain, isliye
// '@/...' alias (tsconfig.json me set) se import kar rahe hain.
import { startReelUpload } from '@/services/upload/reelUploadService';
import { useUploadState } from '@/services/upload/uploadManager';

// Share button dabate hi is route par navigate karke feed dikha dete hain.
// Apne project ke actual reels/home route se match kar lena agar alag ho.
const REELS_HOME_ROUTE = '/';

import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  increment,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';

export default function PostPage() {

  

  const router = useRouter();

const navigation = useNavigation();



  const params = useLocalSearchParams();

const audioUrl =
  Array.isArray(params.audioUrl)
    ? params.audioUrl[0]
    : params.audioUrl;

const musicName =
  Array.isArray(params.musicName)
    ? params.musicName[0]
    : params.musicName;

const musicArtist =
  Array.isArray(params.musicArtist)
    ? params.musicArtist[0]
    : params.musicArtist;

const musicImage =
  Array.isArray(params.musicImage)
    ? params.musicImage[0]
    : params.musicImage;

// Preserve the selected sound identity in the published reel.  This lets
// later viewers open the same sound rather than a duplicate "original" one.
const musicId =
  Array.isArray(params.musicId)
    ? params.musicId[0]
    : params.musicId || "";

const videoEffect =
  Array.isArray(params.videoEffect)
    ? params.videoEffect[0]
    : params.videoEffect || "none";



const subtitleText =
  Array.isArray(params.subtitleText)
    ? params.subtitleText[0]
    : params.subtitleText || "";

const subtitleColor =
  Array.isArray(params.subtitleColor)
    ? params.subtitleColor[0]
    : params.subtitleColor || "#FFFFFF";

const subtitleSize =
  Array.isArray(params.subtitleSize)
    ? params.subtitleSize[0]
    : params.subtitleSize || "28";

const subtitleX =
  Array.isArray(params.subtitleX)
    ? params.subtitleX[0]
    : params.subtitleX || "0";

const subtitleY =
  Array.isArray(params.subtitleY)
    ? params.subtitleY[0]
    : params.subtitleY || "0";

const subtitleXRatio =
  Array.isArray(params.subtitleXRatio)
    ? params.subtitleXRatio[0]
    : params.subtitleXRatio || "0";

const subtitleYRatio =
  Array.isArray(params.subtitleYRatio)
    ? params.subtitleYRatio[0]
    : params.subtitleYRatio || "0";

const subtitleSizeRatio =
  Array.isArray(params.subtitleSizeRatio)
    ? params.subtitleSizeRatio[0]
    : params.subtitleSizeRatio || "0.03";

const voiceUri =
  Array.isArray(params.voiceUri)
    ? params.voiceUri[0]
    : params.voiceUri || "";

const voiceDuration =
  Array.isArray(params.voiceDuration)
    ? params.voiceDuration[0]
    : params.voiceDuration || "0";

const videoDuration =
  Array.isArray(params.videoDuration)
    ? params.videoDuration[0]
    : params.videoDuration || "0";





useFocusEffect(
  useCallback(() => {
    const backAction = () => {

      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        router.replace("/profile");
      }

      return true;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => subscription.remove();

  }, [])
);


  

  const videoUri = Array.isArray(params?.videoUri)
    ? params.videoUri[0]
    : params?.videoUri;

const player = useVideoPlayer(videoUri ?? "", (player) => {
  player.loop = true;
  player.muted = true;
  player.play();
});


useEffect(() => {
  return () => {
    try {
      player.pause();
    } catch (e) {
      console.log("Player already released");
    }
  };
}, []);
  // STATES
  const [caption, setCaption] = useState('');
  const [hashtagModal, setHashtagModal] = useState(false);
  const [hashtagQuery, setHashtagQuery] = useState('');
  const [hashtags, setHashtags] = useState([]);
  const uploadState = useUploadState(); // { uploading, progress, error, justCompleted }
  const [visibility, setVisibility] = useState('public');

  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [userData, setUserData] = useState(null); // User info store karne ke liye

  const languages = ['English', 'Hindi', 'Bhojpuri', 'Urdu', 'Punjabi', 'Bengali', 'Marathi', 'Gujarati'];

  // FETCH LOGGED IN USER DATA
  useEffect(() => {
    const getUserInfo = async () => {
      const user = auth.currentUser;
      if (user) {
        try {
          const docRef = doc(db, "users", user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUserData(docSnap.data());
          }
        } catch (error) {
          console.log("User data error:", error);
        }
      }
    };
    getUserInfo();
  }, []);

  


  

  

  // HANDLE POST
  const extractHashtags = (text = "") => {
    const found = text.match(/#[\\p{L}\\p{N}_]+/gu) || [];
    return [...new Set(found.map((tag) => tag.slice(1).toLowerCase()))];
  };

  const usedHashtags = extractHashtags(caption);

  const openHashtags = async () => {
    setHashtagModal(true);
    try {
      const snap = await getDocs(query(collection(db, "hashtags"), orderBy("uses", "desc"), limit(50)));
      setHashtags(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.log("Hashtag list:", e); }
  };

  const selectHashtag = (tag) => {
    const clean = String(tag || "").replace(/^#/, "");
    if (!clean) return;
    const separator = caption.trim().length ? " " : "";
    setCaption((prev) => `${prev}${separator}#${clean} `);
    setHashtagModal(false);
  };

  // HANDLE POST
  //
  // Ab ye function upload ko background service (reelUploadService.js)
  // ko de deta hai aur us par AWAIT nahi karta — isliye Share dabate
  // hi hum turant reels feed par navigate kar sakte hain, aur upload
  // apne aap chalta rehta hai. Progress `uploadManager` store me jaake
  // update hota hai, jise index.tsx (feed) top-left corner me dikhata
  // hai, aur 100% hone par video Firestore me save ho chuka hota hai
  // (feed apne onSnapshot listener se usko khud dikha dega).
  const handlePostNow = async () => {
    // Ek time me sirf ek hi upload chale.
    if (uploadState.uploading) {
      return;
    }

    const user = auth.currentUser;

    if (!user) {
      Alert.alert('Error', 'Pehle login karein');
      return;
    }
    if (!videoUri) {
      Alert.alert('Error', 'Video select karo');
      return;
    }

    try {
      const token = await auth.currentUser.getIdToken();

      // Background upload shuru karo — yahan jaan-boojh kar `await`
      // nahi kiya, taaki neeche wali line turant chal jaye.
      startReelUpload({
        user,
        token,
        videoUri,
        caption,
        usedHashtags,
        musicId,
        audioUrl,
        musicName,
        musicArtist,
        musicImage,
        videoEffect,
        subtitleText,
        subtitleColor,
        subtitleX,
        subtitleY,
        subtitleXRatio,
        subtitleYRatio,
        subtitleSizeRatio,
        voiceUri,
        voiceDuration,
        videoDuration,
        visibility,
        selectedLanguage,
        userData,
      });

      // Turant reels/feed screen par bhej do — user wahin reels dekh
      // sakta hai jab tak upload chalta rehta hai.
      router.replace(REELS_HOME_ROUTE);
    } catch (error) {
      console.log("Post start error:", error);
      Alert.alert('Error', error.message || 'Kuch galat ho gaya, dobara try karein.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        
        {/* HEADER AREA */}
        <View style={styles.header}>
<TouchableOpacity
  style={styles.iconBtn}
  
onPress={() => {

   if (navigation.canGoBack()) {
      navigation.goBack();
   } else {
      router.replace("/profile");
   }

}}

>



            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>New Reel</Text>

          <TouchableOpacity style={styles.shareBtn} onPress={handlePostNow} disabled={uploadState.uploading}>
            {uploadState.uploading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.shareText}>Share</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
          
          {/* CONTENT CARD */}
          <View style={styles.previewCard}>
            <View style={styles.topRow}>
              <View style={styles.videoWrapper}>
              <VideoView
  player={player}
  style={styles.video}
  contentFit="contain"
  nativeControls={false}
/>
              </View>

              <View style={styles.rightContent}>
                <View style={styles.userRow}>
                  <Image
                    source={{ uri: userData?.profileImg || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' }}
                    style={styles.profile}
                  />
                  <View>
                    <Text style={styles.name}>{userData?.bioTitle || 'User'}</Text>
                    <Text style={styles.username}>{userData?.username ? `@${userData.username}` : '@user'}</Text>
                  </View>
                </View>

                <TextInput
                  placeholder="Write a caption..."
                  placeholderTextColor="#777"
                  multiline
                  value={caption}
                  onChangeText={setCaption}
                  style={styles.captionInput}
                />



<View style={styles.hashContainer}>
  <TouchableOpacity
    style={styles.hashBtn}
    onPress={openHashtags}
  >
    <Ionicons
      name="pricetag"
      size={18}
      color="#FF5E00"
    />
    <Text style={styles.hashText}>
      Hashtag 
    </Text>
  </TouchableOpacity>
</View>



              </View>
            </View>
          </View>

          <Modal
            visible={hashtagModal}
            transparent
            animationType="slide"
            onRequestClose={() => setHashtagModal(false)}
          >
            <View style={styles.hashModalBackdrop}>
              <View style={styles.hashModal}>
                <View style={styles.hashModalHeader}>
                  <Text style={styles.hashModalTitle}>Hashtags</Text>
                  <TouchableOpacity onPress={() => setHashtagModal(false)}>
                    <Ionicons name="close" size={26} color="#fff" />
                  </TouchableOpacity>
                </View>
                <TextInput
                  value={hashtagQuery}
                  onChangeText={setHashtagQuery}
                  placeholder="Search hashtag..."
                  placeholderTextColor="#888"
                  style={styles.hashSearch}
                  autoCapitalize="none"
                />
                <FlatList
                  data={hashtags.filter((h) =>
                    !hashtagQuery.trim() ||
                    String(h.name || "").toLowerCase().includes(hashtagQuery.toLowerCase())
                  )}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.hashRow} onPress={() => selectHashtag(item.name)}>
                      <Text style={styles.hashName}>{item.name}</Text>
                      <Text style={styles.hashUses}>{Number(item.uses || 0)} uses</Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={<Text style={styles.emptyHash}>No hashtags yet.</Text>}
                />
              </View>
            </View>
          </Modal>

          {/* UPLOAD PROGRESS (is screen se turant navigate ho jaate hain,
              isliye ye normally sirf ek split-second ke liye dikhega) */}
          {uploadState.uploading && (
            <View style={styles.progressContainer}>
              <View style={styles.progressTop}>
                <Text style={styles.progressTitle}>Uploading Reel...</Text>
                <Text style={styles.progressPercent}>{uploadState.progress}%</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${uploadState.progress}%` }]} />
              </View>
            </View>
          )}

          {/* REEL SETTINGS */}
          <View style={styles.settingsCard}>
            <Text style={styles.settingTitle}>Reel Settings</Text>

            <TouchableOpacity style={styles.settingItem} onPress={() => setIsModalVisible(true)}>
              <View style={styles.settingLeft}>
                <MaterialIcons name="language" size={22} color="#FF5E00" />
                <Text style={styles.settingText}>Audio Language</Text>
              </View>
              <View style={styles.settingRight}>
                <Text style={styles.settingValue}>{selectedLanguage}</Text>
                <Ionicons name="chevron-forward" size={18} color="#777" />
              </View>
            </TouchableOpacity>

            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <Feather name="eye" size={20} color="#00B2FF" />
                <Text style={styles.settingText}>Visibility</Text>
              </View>
              <View style={styles.toggleGroup}>
                <TouchableOpacity
                  style={[styles.toggleBtn, visibility === 'public' && styles.activeBtn]}
                  onPress={() => setVisibility('public')}
                >
                  <Text style={[styles.toggleText, visibility === 'public' && { color: '#fff' }]}>Public</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, visibility === 'private' && styles.activeBtn]}
                  onPress={() => setVisibility('private')}
                >
                  <Text style={[styles.toggleText, visibility === 'private' && { color: '#fff' }]}>Private</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* MODAL */}
        <Modal visible={isModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Choose Language</Text>
                <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              <FlatList
                data={languages}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.langItem}
                    onPress={() => {
                      setSelectedLanguage(item);
                      setIsModalVisible(false);
                    }}
                  >
                    <Text style={[styles.langText, selectedLanguage === item && { color: '#FF5E00' }]}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  header: { height: 100, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 15 },
  iconBtn: { width: 42, height: 42, borderRadius: 50, backgroundColor: '#1F1F1F', justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
  headerTitle: { color: '#fff', fontSize: 19, fontWeight: '700', marginBottom: 12 },
  shareBtn: { backgroundColor: '#FF5E00', paddingHorizontal: 20, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 25 },
  shareText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  scrollBody: { padding: 16, paddingBottom: 50 },
  previewCard: { backgroundColor: '#181818', borderRadius: 22, padding: 14, marginBottom: 20 },
  topRow: { flexDirection: 'row' },
  videoWrapper: { width: 110, height: 160, borderRadius: 15, overflow: 'hidden', backgroundColor: '#000' },
  video: { width: '100%', height: '100%' },
  rightContent: { flex: 1, marginLeft: 14 },
  profile: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
  userRow: { flexDirection: 'row', alignItems: 'center' },
  name: { color: '#fff', fontSize: 14, fontWeight: '700' },
  username: { color: '#777', fontSize: 12 },
  captionInput: { color: '#fff', fontSize: 15, marginTop: 12, minHeight: 100, textAlignVertical: 'top' },
  progressContainer: { backgroundColor: '#181818', borderRadius: 15, padding: 15, marginBottom: 20 },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressTitle: { color: '#fff', fontWeight: '600' },
  progressPercent: { color: '#FF5E00', fontWeight: 'bold' },
  progressBarBg: { height: 6, backgroundColor: '#333', borderRadius: 10 },
  progressBarFill: { height: '100%', backgroundColor: '#FF5E00', borderRadius: 10 },
  settingsCard: { backgroundColor: '#181818', borderRadius: 20, padding: 16 },
  settingTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 15 },
  settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  settingLeft: { flexDirection: 'row', alignItems: 'center' },
  settingText: { color: '#fff', marginLeft: 12, fontSize: 14 },
  settingRight: { flexDirection: 'row', alignItems: 'center' },
  settingValue: { color: '#999', marginRight: 5, fontSize: 13 },
  toggleGroup: { flexDirection: 'row', backgroundColor: '#262626', borderRadius: 10, padding: 3 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  activeBtn: { backgroundColor: '#FF5E00' },
  toggleText: { color: '#999', fontSize: 12, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#181818', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, maxHeight: '50%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  langItem: { paddingVertical: 15, borderBottomWidth: 0.5, borderBottomColor: '#333' },
  langText: { color: '#fff', fontSize: 16 },

hashContainer: {
  marginTop: 12,
},

hashBtn: {
  flexDirection: "row",
  alignItems: "center",
  alignSelf: "flex-start",
  backgroundColor: "#252525",
  paddingHorizontal: 14,
  paddingVertical: 8,
  borderRadius: 20,
},

hashText: {
  color: "#fff",
  marginLeft: 8,
  fontWeight: "600",
},

hashModalBackdrop: {
  flex: 1,
  backgroundColor: 'rgba(0,0,0,0.65)',
  justifyContent: 'flex-end',
},

hashModal: {
  backgroundColor: '#181818',
  borderTopLeftRadius: 25,
  borderTopRightRadius: 25,
  padding: 20,
  height: '50%',
},

hashModalHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 15,
},

hashModalTitle: {
  color: '#fff',
  fontSize: 18,
  fontWeight: '700',
},

hashSearch: {
  backgroundColor: '#252525',
  color: '#fff',
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  marginBottom: 12,
},

hashRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingVertical: 14,
  borderBottomWidth: 0.5,
  borderBottomColor: '#333',
},

hashName: {
  color: '#fff',
  fontSize: 15,
  fontWeight: '600',
},

hashUses: {
  color: '#888',
  fontSize: 12,
},

emptyHash: {
  color: '#777',
  textAlign: 'center',
  paddingVertical: 20,
},



});
