import React, { useState, useEffect } from 'react';
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
  BackHandler
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

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

import { doc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const { width } = Dimensions.get('window');
const DEFAULT_AVATAR = 'https://avatar.iran.liara.run/public/65';

export default function LiveStart() {
  const router = useRouter();

  const [roomPhoto, setRoomPhoto] = useState(null);
  const [roomTitle, setRoomTitle] = useState('');
  const [roomDescription, setRoomDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false); 

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

  const handleStartLive = async () => {
    if (!roomTitle.trim()) {
      Alert.alert("Required", "Please provide a catchy room title first.");
      return;
    }

    setIsUploading(true);
    const finalTitle = roomTitle.trim();
    const finalDescription = roomDescription.trim();

    const currentUser = auth?.currentUser;
    const currentUid = currentUser?.uid || "guest_host_" + Math.floor(Math.random() * 10000);

    let hostName = currentUser?.displayName || "AGS User"; 
    let hostAvatar = currentUser?.photoURL || DEFAULT_AVATAR;

    try {
      if (db && currentUser?.uid) {
        const userDocRef = doc(db, "users", currentUser.uid);
        const userSnapshot = await getDoc(userDocRef);
        if (userSnapshot.exists()) {
          const userData = userSnapshot.data();
          hostName = userData.name || userData.username || hostName;
          hostAvatar = userData.profileImg || userData.photoURL || hostAvatar;
        }
      }

      const roomUniqueId = currentUid.includes("guest_host") ? 'room_' + Date.now() : currentUid; 

      let finalCover = hostAvatar;
      if (roomPhoto) {
        const cloudUrl = await uploadImageAsync(roomPhoto, roomUniqueId);
        if (cloudUrl) finalCover = cloudUrl;
      }

      const initialSeatsObject = {};
      for (let i = 1; i <= 10; i++) {
        initialSeatsObject[`seat_${i}`] = {
          userId: i === 1 ? currentUid : null,
          userName: i === 1 ? hostName : null,
          userImg: i === 1 ? hostAvatar : null,
          isMuted: false,
          roleTag: i === 1 ? 'HOST' : i === 2 ? 'CO-HOST' : 'SPEAKER'
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
        audienceList: {
          [currentUid]: { name: hostName, img: hostAvatar }
        }, 
        chats: [
          { id: "sys_init", senderName: "System", message: "Live Audio Chatroom setup successful.", isSystem: true }
        ], 
        invitationIncoming: null, 
        seatsCount: 10,
        seatsData: initialSeatsObject, 
        roomCover: finalCover, 
        createdAt: Date.now()
        
      };

      if (db) {
        await setDoc(doc(db, 'rooms', roomUniqueId), newRoomPayload);
      }

      setIsUploading(false);
      router.push({ 
        pathname: '/LiveRoom', 
        params: { id: roomUniqueId, hostName: hostName, hostProfilePic: hostAvatar } 
      });

    } catch (error) {
      setIsUploading(false);
      Alert.alert("Error", "Could not create structural audio engine stream.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#08080a" barStyle="light-content" translucent={false} />
      
      {/* HEADER BAR (FIXED: Back chevron icon button safely removed) */}
      <View style={styles.headerBarContainer}>
        <View style={{ width: 38 }} /> 
        <Text style={styles.headerTitleText}>Setup Audio Stream</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollCanvasContainer} showsVerticalScrollIndicator={false}>
        
        {/* ROOM BANNER IMAGE PICKER FRAME */}
        <View style={styles.avatarMasterFrame}>
          <Text style={styles.avatarHeadingLabel}>ROOM COVER BANNER</Text>
          <TouchableOpacity style={styles.avatarCircleTrigger} onPress={pickImage} activeOpacity={0.85}>
            {roomPhoto ? (
              <View style={styles.imagePresenterContainer}>
                <Image source={{ uri: roomPhoto }} style={styles.insertedImageContent} resizeMode="cover" />
                <View style={styles.imageEditBadge}>
                  <Ionicons name="pencil" size={12} color="#000000" />
                </View>
              </View>
            ) : (
              <View style={styles.avatarPlaceholderSubbed}>
                <View style={styles.iconCircleWrapper}>
                  <Ionicons name="cloud-upload-outline" size={28} color="#ebd500" />
                </View>
                <Text style={styles.avatarLabelText}>Upload High-Res Cover</Text>
                <Text style={styles.avatarSubLabelText}>Supports JPG, PNG square formats</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* INPUT DECK CARD */}
        <View style={styles.formInputCardDeck}>
          <View style={styles.individualFieldRow}>
            <View style={styles.labelIndicatorRow}>
              <View style={styles.yellowIndicatorDot} />
              <Text style={styles.formSectionLabel}>Stream Topic / Title</Text>
            </View>
            <View style={styles.glassmorphicTextContainer}>
              <TextInput
                style={styles.primaryTextInputElement}
                placeholder="What are we talking about tonight?"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={roomTitle}
                onChangeText={setRoomTitle}
                maxLength={60}
              />
            </View>
          </View>
        </View>

        {/* SUBMIT LAUNCH ACTION BUTTON */}
        <TouchableOpacity 
          style={[styles.primaryLaunchActionButton, !roomTitle.trim() && styles.buttonDisabledState]} 
          onPress={handleStartLive} 
          activeOpacity={0.85}
          disabled={isUploading}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color="#000000" />
          ) : (
            <View style={styles.buttonTextWrapper}>
              <Ionicons name="mic-sharp" size={18} color="#000000" style={{ marginRight: 8 }} />
              <Text style={styles.launchButtonLabelText}>Create Party Room</Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08080a' },
  headerBarContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    height: Platform.OS === 'android' ? 75 : 65, 
    paddingTop: Platform.OS === 'android' ? 10 : 0,
    backgroundColor: '#08080a',
    borderBottomWidth: 1, 
    borderColor: 'rgba(255,255,255,0.04)' 
  },
  headerTitleText: { fontSize: 16, fontWeight: '800', color: '#ffffff', letterSpacing: 0.3, textAlign: 'center', flex: 1 },
  scrollCanvasContainer: { alignItems: 'center', paddingVertical: 24, width: '100%' },
  avatarMasterFrame: { marginBottom: 28, width: width - 32, alignItems: 'center' },
  avatarHeadingLabel: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.3)', letterSpacing: 1, marginBottom: 12, alignSelf: 'flex-start', paddingLeft: 6 },
  avatarCircleTrigger: { 
    width: '100%', 
    height: 170, 
    borderRadius: 20, 
    backgroundColor: '#11121a', 
    borderWidth: 1.5, 
    borderColor: 'rgba(235,213,0,0.15)', 
    borderStyle: 'dashed',
    justifyContent: 'center', 
    alignItems: 'center', 
    overflow: 'hidden' 
  },
  imagePresenterContainer: { width: '100%', height: '100%', position: 'relative' },
  insertedImageContent: { width: '100%', height: '100%' },
  imageEditBadge: { position: 'absolute', right: 12, bottom: 12, backgroundColor: '#ebd500', width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 4 },
  avatarPlaceholderSubbed: { justifyContent: 'center', alignItems: 'center', padding: 20 },
  iconCircleWrapper: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(235,213,0,0.06)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarLabelText: { fontSize: 14, fontWeight: '800', color: '#ffffff', letterSpacing: 0.2 },
  avatarSubLabelText: { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.3)', marginTop: 4 },
  formInputCardDeck: { width: width - 32, backgroundColor: '#11121a', borderRadius: 20, padding: 16, marginBottom: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)' },
  individualFieldRow: { marginBottom: 4 },
  labelIndicatorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  yellowIndicatorDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#ebd500', marginRight: 8 },
  formSectionLabel: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 },
  glassmorphicTextContainer: { width: '100%', height: 50, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  primaryTextInputElement: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  primaryLaunchActionButton: { width: width - 32, height: 52, backgroundColor: '#ebd500', borderRadius: 16, justifyContent: 'center', alignItems: 'center', shadowColor: '#ebd500', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 3 },
  buttonDisabledState: { opacity: 0.9 },
  buttonTextWrapper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  launchButtonLabelText: { fontSize: 15, fontWeight: '900', color: '#000000', letterSpacing: 0.3 }
});