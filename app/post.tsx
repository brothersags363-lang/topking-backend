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
import { Video, ResizeMode } from 'expo-av';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';

import { BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';


// FIREBASE
import { db, auth } from './firebaseConfig'; // 'auth' import kiya

import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';

export default function PostPage() {

  
const UPLOAD_PRESET = 'topking_upload';

  const router = useRouter();
useFocusEffect(
  useCallback(() => {
    const onBackPress = () => {
      router.push({
        pathname: '/EditView',
        params: { videoUri }
      });

      return true;
    };

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );

    return () => subscription.remove();
  }, [videoUri])
);




  const params = useLocalSearchParams();
  const videoRef = useRef(null);

  const videoUri = Array.isArray(params?.videoUri)
    ? params.videoUri[0]
    : params?.videoUri;


  // STATES
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
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

  // AUDIO & VIDEO CLEANUP
  

  // HANDLE POST
  const handlePostNow = async () => {
    const user = auth.currentUser;
const CLOUD_NAME = 'dlal6yjxr';

    if (!user) {
      Alert.alert('Error', 'Pehle login karein');
      return;
    }
    if (!videoUri) {
      Alert.alert('Error', 'Video select karo');
      return;
    }
    if (!caption.trim()) {
      Alert.alert('Caption Required', 'Caption likho');
      return;
    }

    

    try {
      setUploading(true);
      setProgress(0);

      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'android' ? videoUri : videoUri.replace('file://', ''),
        type: 'video/mp4',
        name: 'reel.mp4',
      });
    formData.append('upload_preset', UPLOAD_PRESET);

     const response = await axios.post(
  `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`,
  formData,
  {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      const percent = Math.round((event.loaded * 100) / event.total);
      setProgress(percent);
    },
  }
);

      const uploadedVideo = response?.data?.secure_url;

      console.log("VIDEO URL =", uploadedVideo);

const thumbnailUrl = uploadedVideo
  .replace('/video/upload/', '/video/upload/so_1,f_jpg/');

console.log("THUMB URL =", thumbnailUrl);

      if (uploadedVideo) {
        // AB DATA DYNAMIC HAI
   const videoData = {
  videoUrl: uploadedVideo,
  caption: caption,
  language: selectedLanguage,
  privacy: visibility,

  userId: user.uid,
  userName: userData?.name || 'New User',
  username: userData?.username
    ? `@${userData.username}`
    : '@user',

  profile:
    userData?.profileImg ||
    'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',

  createdAt: serverTimestamp(),

  likes: 0,
  commentsCount: 0,
  shares: 0,
  views: 0,

  engagementScore: 0, // ADD THIS

  thumbnail: thumbnailUrl,
};

  await addDoc(collection(db, 'all_videos'), videoData);

setUploading(false);

Alert.alert('Success ✅', 'Reel Successfully Posted', [
  {
    text: 'OK',
    onPress: () => {
      console.log('Going to profile');
      router.push('/profile');
    },
  },
]);


      }
    } 
    catch (error) {
  console.log(
    'UPLOAD ERROR =',
    error?.response?.data
  );

  console.log(
    'FULL ERROR =',
    error
  );

  setUploading(false);

  Alert.alert(
    'Upload Error',
    JSON.stringify(
      error?.response?.data || error.message
    )
  );
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
  onPress={() =>
    router.push({
      pathname: '/EditView',
      params: { videoUri }
    })
  }
>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>New Reel</Text>

          <TouchableOpacity style={styles.shareBtn} onPress={handlePostNow} disabled={uploading}>
            {uploading ? (
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
                <Video
                  ref={videoRef}
                  source={{ uri: videoUri }}
                  style={styles.video}
                  resizeMode={ResizeMode.COVER}
                  shouldPlay={true}
                  isMuted={true}
                  isLooping
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
              </View>
            </View>
          </View>

          {/* UPLOAD PROGRESS */}
          {uploading && (
            <View style={styles.progressContainer}>
              <View style={styles.progressTop}>
                <Text style={styles.progressTitle}>Uploading Reel...</Text>
                <Text style={styles.progressPercent}>{progress}%</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
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
  langText: { color: '#fff', fontSize: 16 }
});