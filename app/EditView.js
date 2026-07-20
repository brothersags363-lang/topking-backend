import React, { useState, useEffect } from 'react';
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
} from 'react-native';

import { VideoView, useVideoPlayer } from 'expo-video';


import {
  useRouter,
  useLocalSearchParams,
} from 'expo-router';

import { musicData } from '../assets/musicData';

import { useIsFocused } from '@react-navigation/native';

import { BackHandler } from 'react-native';

import {
  Ionicons,
  Feather,
} from '@expo/vector-icons';
import { Audio } from "expo-av";



import { LinearGradient } from 'expo-linear-gradient';



const { width, height } = Dimensions.get('window');

export default function EditView() {

  const router = useRouter();

  const params = useLocalSearchParams();

  useEffect(() => {
  console.log("EditView Params =", params);
}, []);

  const videoUri = params.videoUri;

const musicTitle = params.musicName;
const musicArtist = params.musicArtist;
const musicImage = params.musicImage;
const musicId = params.musicId;
const audioUrl = params.audioUrl;
console.log("EditView audioUrl =", audioUrl);



  const isFocused = useIsFocused();


  const [showMusic, setShowMusic] = useState(false);

  const [sound, setSound] = useState(null);

useEffect(() => {
  return () => {
    if (sound) {
      sound.stopAsync().catch(() => {});
      sound.unloadAsync().catch(() => {});
    }
  };
}, [sound]);


useEffect(() => {

  if (!audioUrl) return;

  let newSound;

  const loadMusic = async () => {

    try {

      console.log("Playing Audio =", audioUrl);

      const { sound } =
        await Audio.Sound.createAsync(
          {
            uri: audioUrl,
          },
          {
            shouldPlay: false,
            isLooping: true,
          }
        );

      newSound = sound;

      setSound(sound);

    } catch (e) {

      console.log("Audio Error =", e);

    }

  };

  loadMusic();

  return () => {

    if (newSound) {
      newSound.unloadAsync();
    }

  };

}, [audioUrl]);

  // ==========================
  // VIDEO PLAYER
  // ==========================
  const player = useVideoPlayer(
    videoUri,
    (player) => {

      player.loop = true;
       player.muted = !!musicTitle;

      if (isFocused) {
        player.play();
      } else {
        player.pause();
      }
    }
  );





  // ==========================
  // AUDIO SETUP
  // ==========================
  

  // ==========================
  // VIDEO PLAY/PAUSE
  // ==========================
  useEffect(() => {

  const syncPlayer = async () => {

    if (isFocused) {

      player.play();

      if (sound) {
        await sound.playAsync();
      }

    } else {

      player.pause();

      if (sound) {
        await sound.pauseAsync();
      }

    }

  };

  syncPlayer();

}, [isFocused, sound]);






  // ==========================
  // STOP MUSIC ON UNFOCUS
  // ==========================
 

  // ==========================
  // CLEANUP MUSIC
  // ==========================


  // ==========================
  // PLAY SELECTED MUSIC
  // ==========================
  async function playSelectedMusic(musicUrl) {

    try {

      if (sound) {
        await sound.unloadAsync();
      }

      const { sound: newSound } =
        await Audio.Sound.createAsync(musicUrl);
await newSound.setIsLoopingAsync(true);
      setSound(newSound);

      await newSound.playAsync();

      setShowMusic(false);

      Alert.alert(
        'Music Added',
        'Music added successfully!'
      );

    } catch (e) {

      Alert.alert(
        'Error',
        'Music failed to load!'
      );
    }
  }

  // ==========================
  // BOTTOM MENU
  // ==========================
  const bottomMenu = [
   
{
  icon: "music",
  label: "Music",

  action: () =>

    router.push({

      pathname: "/MusicSelect",

      params: {

        videoUri,

      },

    }),

},


    {
      icon: 'scissors',
      label: 'Edit',
    },
    {
      icon: 'type',
      label: 'Subtitle',
    },
    {
      icon: 'layers',
      label: 'Effect',
    },
    {
      icon: 'mic',
      label: 'Record',
    },
  ];

  return (
    <View style={styles.container}>

      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      {/* VIDEO BACKGROUND */}

<View style={styles.videoContainer}>

  {videoUri ? (

    <VideoView
      player={player}
      style={styles.fullVideo}
      contentFit="cover"
      nativeControls={false}
    />

  ) : (

    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>
        Select Video
      </Text>
    </View>

  )}

  {musicTitle && (

    <View style={styles.musicBar}>

      <Text style={styles.musicIcon}>
        🎵
      </Text>

      <View style={{ flex: 1 }}>

        <Text style={styles.musicTitle}>
          {musicTitle}
        </Text>

        <Text style={styles.musicArtist}>
          {musicArtist}
        </Text>

      </View>

    </View>

  )}

</View>




    

      {/* TOP BLACK BAR */}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0.95)',
          'rgba(0,0,0,0.6)',
          'transparent',
        ]}
        style={styles.topBlackBar}
      />

      {/* HEADER */}
      <View style={styles.header}>

        {/* BACK BUTTON */}
<TouchableOpacity
  style={styles.iconBtn}





onPress={async () => {

  if (sound) {
    await sound.stopAsync();
    await sound.unloadAsync();
  }

  router.back();
}}

>

          <Ionicons
            name="chevron-back"
            size={30}
            color="#fff"
          />
        </TouchableOpacity>

        {/* NEXT BUTTON */}
        <TouchableOpacity
          style={styles.nextBtn}
          onPress={() => {

          if (sound) {
  sound.stopAsync();
}

console.log("Sending audioUrl =", audioUrl);

router.push({
  pathname: "/post",
  params: {
    videoUri,
    audioUrl,
    musicName: musicTitle,
    musicArtist,
    musicImage,
  },
});


          }}
        >
          <Text style={styles.nextTxt}>
            Next
          </Text>
        </TouchableOpacity>
      </View>

      {/* BOTTOM BLACK BAR */}
      <LinearGradient
        colors={[
          'transparent',
          'rgba(0,0,0,0.6)',
          'rgba(0,0,0,0.95)',
        ]}
        style={styles.bottomBlackBar}
      />

      {/* BOTTOM MENU */}
      <View style={styles.bottomMenuWrapper}>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 10,
          }}
        >

          {bottomMenu.map((item, index) => (

            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={
                item.action
                  ? item.action
                  : () => {}
              }
            >

              <View style={styles.iconCircle}>

                <Feather
                  name={item.icon}
                  size={24}
                  color="#fff"
                />

              </View>

              <Text style={styles.menuLabel}>
                {item.label}
              </Text>

            </TouchableOpacity>

          ))}
        </ScrollView>
      </View>








    </View>
  );
}

// ==========================
// STYLES
// ==========================
const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  videoContainer: {
    ...StyleSheet.absoluteFillObject,
  },

  fullVideo: {
    width: width,
    height: height,
  },

  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  placeholderText: {
    color: '#fff',
    fontSize: 16,
  },

  // ==========================
  // TOP BLACK AREA
  // ==========================
  topBlackBar: {
    position: 'absolute',
    top: 0,
    width: width,
    height: 140,
    zIndex: 2,
  },

  // ==========================
  // BOTTOM BLACK AREA
  // ==========================
  bottomBlackBar: {
    position: 'absolute',
    bottom: 0,
    width: width,
    height: 180,
    zIndex: 2,
  },

  // ==========================
  // HEADER
  // ==========================
  header: {
    position: 'absolute',
    top: 45,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    zIndex: 10,
  },

  backBtn: {
    width: 50,
    height: 50,
    justifyContent: 'center',
  },

  nextBtn: {
    backgroundColor: '#FF5E00',
    paddingHorizontal: 25,
    paddingVertical: 9,
    borderRadius: 25,
    marginTop: 20,
  },

  nextTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // ==========================
  // BOTTOM MENU
  // ==========================
  bottomMenuWrapper: {
    position: 'absolute',
    bottom: 35,
    width: width,
    zIndex: 10,
  },

  menuItem: {
    alignItems: 'center',
    marginHorizontal: 15,
  },

  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 6,
  },

  menuLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },

  // ==========================
  // MODAL
  // ==========================
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },

  musicSheet: {
    height: height * 0.6,
    backgroundColor: '#121212',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
  },

  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },

  sheetTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },

  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: '#222',
  },

  songIconBox: {
    width: 45,
    height: 45,
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },

  songName: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },

  songCat: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },


musicBar: {
  position: "absolute",
  top: -100,
  left: 15,
  right: 15,

  zIndex: 999,

  flexDirection: "row",
  alignItems: "center",

  backgroundColor: "rgba(0,0,0,0.6)",

  padding: 12,
  borderRadius: 12,
},

musicIcon: {
  fontSize: 22,
  marginRight: 10,
},

musicTitle: {
  color: "#fff",
  fontSize: 16,
  fontWeight: "bold",
},

musicArtist: {
  color: "#ccc",
  fontSize: 13,
},



});