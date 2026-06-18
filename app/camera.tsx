import React, { useState, useRef, useEffect } from 'react';
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
import * as MediaLibrary from 'expo-media-library'; 
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera'; 
import { useRouter } from 'expo-router'; 

export default function CameraPage() {
  const router = useRouter(); 
  const [videoUri, setVideoUri] = useState(null);
  const [showStickers, setShowStickers] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [facing, setFacing] = useState('back');
  const [seconds, setSeconds] = useState(0);
  const [thumbnail, setThumbnail] = useState(null); 
  const [isCameraReady, setIsCameraReady] = useState(false); // Safety check state
  const timerRef = useRef(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const cameraRef = useRef(null);
  
  const stickers = ['🔥', '😂', '❤️', '✨', '👑', '💯', '😎', '💀', '🎉', '🎸', '🌈', '🍕', '👀', '💡', '🚀', '⭐'];


useEffect(() => {

  const backAction = () => {

    router.push('/(tabs)');

    return true;
  };

  const subscription = BackHandler.addEventListener(
    'hardwareBackPress',
    backAction
  );

  return () => subscription.remove();

}, []);



  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        await requestCameraPermission();
        await requestMicrophonePermission();
        const mediaStatus = await MediaLibrary.requestPermissionsAsync();

        if (mediaStatus.status === 'granted' && isMounted) {
          const assets = await MediaLibrary.getAssetsAsync({
            first: 1,
            mediaType: ['video'],
            sortBy: [['creationTime', false]]
          });
          if (assets.assets.length > 0) {
            setThumbnail(assets.assets[0].uri);
          }
        }
      } catch (error) {
        console.warn("Permission/Thumbnail Error:", error);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setSeconds(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  // FIX: Toggle facing with state reset to clear any black screen freeze
  const toggleCameraFacing = () => {
    if (isRecording) return;
    setIsCameraReady(false); 
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  const pickVideo = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: true,
        quality: 1,
      });
      if (!result.canceled) {
        // ✅ EditView page par bhej raha hai
        router.push({
          pathname: '/EditView',
          params: { videoUri: result.assets[0].uri }
        });
      }
    } catch (e) {
      console.error("Gallery Error:", e);
    }
  };

  const handleRecord = async () => {
    if (!cameraRef.current) return;

    if (isRecording) {
      try {
        setIsRecording(false); 
        await cameraRef.current.stopRecording(); 
      } catch (e) {
        console.error("Stop Error:", e);
      }
    } else {
      if (!microphonePermission?.granted || !cameraPermission?.granted) {
        Alert.alert("Permission", "Camera aur Microphone allow karein");
        return;
      }
      
      // Hardware check layer to prevent async crash
      if (!isCameraReady) {
        Alert.alert("Wait", "Camera ready ho raha hai, thoda rukiye.");
        return;
      }

      try {
        setIsRecording(true);
        cameraRef.current.recordAsync({
          quality: '720p',
          maxDuration: 60,
        }).then((video) => {
          if (video && video.uri) {
            router.push({
              pathname: '/EditView',
              params: { videoUri: video.uri }
            });
          }
        }).catch(err => {
          console.error("Async Record Error:", err);
          setIsRecording(false);
        });
        
      } catch (error) {
        console.error("Recording start error:", error);
        setIsRecording(false);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* FIX: key static rakha hai aur onCameraReady trigger lagaya hai taaki front switch hone par view black na ho */}
      <CameraView 
        key="main-app-camera" 
        style={StyleSheet.absoluteFill} 
        ref={cameraRef} 
        mode="video"
        facing={facing}
        onCameraReady={() => setIsCameraReady(true)}
      />
      
      {isRecording && (
        <View style={styles.timerBadge}>
          <View style={styles.redDot} />
          <Text style={styles.timerText}>{seconds}s</Text>
        </View>
      )}

      <Text style={styles.topMusic}>🎵 Select Music</Text>
      
      <View style={styles.sideIcons}>
        <TouchableOpacity
  style={styles.icnGrp}
  onPress={toggleCameraFacing}
>

  <Ionicons
    name="camera-reverse-outline"
    size={30}
    color="#fff"
  />

  <Text style={styles.fTxt}>
    Switch
  </Text>

</TouchableOpacity>

        <View style={styles.icnGrp}>

<Ionicons
  name="timer-outline"
  size={30}
  color="#fff"
/>

<Text style={styles.fTxt}>
  Timer
</Text>

</View>

        <View style={styles.icnGrp}>

<Ionicons
  name="speedometer-outline"
  size={30}
  color="#fff"
/>

<Text style={styles.fTxt}>
  Speed
</Text>

</View>

        <View style={styles.icnGrp}>

<Ionicons
  name="sparkles-outline"
  size={30}
  color="#fff"
/>

<Text style={styles.fTxt}>
  Beauty
</Text>

</View>

      </View>

      <View style={styles.bottomControls}>
        <TouchableOpacity style={styles.sideBtn} onPress={() => setShowStickers(true)}>
          <View style={[styles.boxFrame, {borderColor: 'red'}]} />
         <Text style={styles.stickerLbl}>Stickers</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleRecord}>
          <View style={[styles.mainRecOuter, isRecording && {borderColor: 'red'}]}>
            <View style={[styles.mainRecInner, isRecording && {borderRadius: 10}]} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.sideBtn} onPress={pickVideo}>
          <View style={[styles.boxFrame, {borderColor: '#fff', overflow: 'hidden'}]}>
            {thumbnail ? (
              <Image source={{ uri: thumbnail }} style={{width: '100%', height: '100%'}} />
            ) : (
              <View style={{backgroundColor: '#eee', flex: 1}} />
            )}
          </View>
          <Text style={styles.uploadLbl}>Upload</Text>
        </TouchableOpacity>
      </View>

      {/* MODEBAR: Audio text par click trigger link kar diya hai */}
      <View style={styles.modeBar}>
        <Text style={styles.mTxt}>Live</Text>
        <Text style={[styles.mTxt, {color: '#0056D2'}]}>Video</Text>
        <TouchableOpacity onPress={() => router.push('/LiveStart')} activeOpacity={0.7}>
          <Text style={styles.mTxt}>Audio</Text>
        </TouchableOpacity>
      </View>

      {showStickers && (
        <View style={styles.stickerPanel}>
          <TouchableOpacity style={styles.closeStk} onPress={() => setShowStickers(false)}><Text>✕</Text></TouchableOpacity>
          <ScrollView contentContainerStyle={styles.stkGrid}>
            {stickers.map((s, i) => <Text key={i} style={{fontSize: 45, margin: 10}}>{s}</Text>)}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center' },
  timerBadge: { position: 'absolute', top: 50, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, zIndex: 30 },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'red', marginRight: 8 },
  timerText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  topMusic: { marginTop: 10, fontSize: 20, fontWeight: 'bold', color: '#fff', zIndex: 10 },
  sideIcons: { position: 'absolute', right: 20, top: 140, gap: 20, zIndex: 10 },
  icnGrp: { alignItems: 'center' }, fIcn: { fontSize: 35 }, fTxt: { fontSize: 12, fontWeight: 'bold', color: '#fff' },
  
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
  backgroundColor: 'rgba(255,255,255,0.15)',
},

blueLbl: {
  color: '#fff',
  fontSize: 13,
  fontWeight: '600',
  marginTop: 3,
  textAlign: 'center',
  width: 70,
  marginLeft: -5,
},

mainRecOuter: {
  width: 92,
  height: 92,
  borderRadius: 46,
  borderWidth: 4,
  borderColor: '#fff',
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: 'rgba(255,255,255,0.15)',
},
  

  mainRecInner: {
  width: 72,
  height: 72,
  borderRadius: 36,
  backgroundColor: '#ee1e44',
},
  
  // Adjusted 15 units up from bottom for clean spacing interface
  modeBar: { position: 'absolute', bottom: 60, flexDirection: 'row', gap: 40, zIndex: 10,   left: 85,    },

  mTxt: { fontSize: 22, fontWeight: 'bold', color: '#fff' },

  stickerPanel: { position: 'absolute', bottom: 0, height: 350, width: '100%', backgroundColor: '#eee', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, zIndex: 20 },
  stkGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  closeStk: { alignSelf: 'flex-end', padding: 10 },



uploadLbl: {
  color: '#fff',
  fontSize: 13,
  fontWeight: '600',
  marginTop: 3,
  position: 'relative',
  left: 12,   // left
},

stickerLbl: {
  color: '#fff',
  fontSize: 13,
  fontWeight: '600',
  marginTop: 3,
  position: 'relative',
  right: -7,  // right
},


});     