import React, {
  useState,
  useEffect,
  useRef,
} from "react";

import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  Dimensions,
    Animated,
      Alert,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useLocalSearchParams } from "expo-router";

import { Audio } from "expo-av";
import { useIsFocused } from "@react-navigation/native";

import { db } from "./firebaseConfig";

import {
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";

const { width } = Dimensions.get("window");

export default function MusicSelect() {

  const router = useRouter();

const params = useLocalSearchParams();

useEffect(() => {
  console.log("All Params =>", params);
}, []);

const videoUri = params.videoUri;

  const [search, setSearch] = useState("");

  const [activeTab, setActiveTab] = useState("Trending");

const [selectedMusic, setSelectedMusic] = useState(null);

const [sound, setSound] = useState(null);
const isFocused = useIsFocused();

useEffect(() => {
  return () => {
    const stopSound = async () => {
      if (sound) {
        try {
          await sound.stopAsync();
          await sound.unloadAsync();
        } catch (e) {
          console.log(e);
        }
      }
    };

    stopSound();
  };
}, [sound]);

const [isPlaying, setIsPlaying] = useState(false);
const [position, setPosition] = useState(0);

const [duration, setDuration] = useState(0);

const rotateAnim = useRef(
  new Animated.Value(0)
).current;

useEffect(() => {

  if (selectedMusic) {

    Animated.loop(

      Animated.timing(
        rotateAnim,
        {
          toValue: 1,
          duration: 5000,
          useNativeDriver: true,
        }
      )

    ).start();

  }

}, [selectedMusic]);



useEffect(() => {

  Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  });

}, []);

useEffect(() => {
  if (!isFocused && sound) {
    sound.stopAsync().catch(() => {});
    sound.unloadAsync().catch(() => {});
  }
}, [isFocused, sound]);



useEffect(() => {

  loadSongs();

}, []);


 const [musicList, setMusicList] = useState([]);






const loadSongs = async () => {

  try {

    const q = query(
      collection(db, "songs"),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);

    const list = [];

    snapshot.forEach((doc) => {

      list.push({

        id: doc.id,

        ...doc.data(),

      });

    });

    setMusicList(list);

    console.log("Songs =", list);

  } catch (e) {

    console.log("Load Songs Error =", e);

  }

};


const playMusic = async (item) => {

 console.log("SELECTED SONG =", item);

  console.log("AUDIO URL =", item.audioUrl);
  console.log("Video URL =", item.videoUrl);

if (!item.audioUrl) {

  Alert.alert(
    "Audio Missing",
    "Music file not found"
  );

  return;
}





  try {

    if (sound) {

      await sound.stopAsync();

      await sound.unloadAsync();

    }

const { sound: newSound } =
await Audio.Sound.createAsync(
  {
    uri: item.audioUrl,
  },
  {
    shouldPlay: true,
    isLooping: true,
    volume: 1.0,
  }
);

    setSound(newSound);

    setSelectedMusic(item);

    setIsPlaying(true);

   

newSound.setOnPlaybackStatusUpdate((status)=>{

if(!status.isLoaded)return;

setPosition(status.positionMillis);

setDuration(status.durationMillis || 0);

setIsPlaying(status.isPlaying);

});


await newSound.playAsync();
const status = await newSound.getStatusAsync();

console.log("STATUS =", status);

  } catch (e) {

    console.log(e);

  }

};



const formatTime = (millis) => {

  const totalSeconds = Math.floor(millis / 1000);

  const minutes = Math.floor(totalSeconds / 60);

  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

};


const toggleMusic = async () => {

  if (!sound) return;

  const status = await sound.getStatusAsync();

  if (status.isPlaying) {

    await sound.pauseAsync();

    setIsPlaying(false);

  } else {

    await sound.playAsync();

    setIsPlaying(true);

  }

};


  return (

    <SafeAreaView style={styles.container}>

      {/* HEADER */}

      <View style={styles.header}>

        <TouchableOpacity
          

onPress={async () => {
  if (sound) {
    try {
      await sound.stopAsync();
      await sound.unloadAsync();
    } catch (e) {}
  }

  router.back();
}}

        >
          <Ionicons
            name="arrow-back"
            size={26}
            color="#fff"
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          Select Music
        </Text>

        <TouchableOpacity>

          <Ionicons
            name="search"
            size={24}
            color="#fff"
          />

        </TouchableOpacity>

      </View>

      {/* SEARCH */}

      <View style={styles.searchBox}>

        <Ionicons
          name="search"
          size={20}
          color="#888"
        />

        <TextInput
          placeholder="Search music..."
          placeholderTextColor="#666"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />

      </View>

      {/* CATEGORY */}

      <View style={styles.tabRow}>

        <TouchableOpacity
          onPress={() => setActiveTab("Trending")}
        >

          <Text
            style={[
              styles.tabText,
              activeTab == "Trending" &&
                styles.activeTab,
            ]}
          >
            Trending
          </Text>

        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab("Recommended")}
        >

          <Text
            style={[
              styles.tabText,
              activeTab == "Recommended" &&
                styles.activeTab,
            ]}
          >
            Recommended
          </Text>

        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab("New")}
        >

          <Text
            style={[
              styles.tabText,
              activeTab == "New" &&
                styles.activeTab,
            ]}
          >
            New
          </Text>

        </TouchableOpacity>

      </View>




{
selectedMusic && (

<View style={styles.nowPlayingCard}>


<Animated.Image
source={{
uri:selectedMusic.image,
}}
style={[
styles.nowPlayingImage,
{
transform:[
{
rotate:
rotateAnim.interpolate({

inputRange:[0,1],

outputRange:[
"0deg",
"360deg",
],

}),
},
],
},
]}
/>

<View style={{flex:1}}>

<Text style={styles.nowPlayingLabel}>
🎵 Now Playing
</Text>

<Text style={styles.nowPlayingTitle}>
{selectedMusic.title}
</Text>

<Text style={styles.nowPlayingArtist}>
{selectedMusic.artist}
</Text>

<View style={styles.progressBar}>

<View
  style={[
    styles.progressFill,
    {
      width:
        duration > 0
          ? `${(position / duration) * 100}%`
          : "0%",
    },
  ]}
/>

</View>

<Text style={styles.timeText}>
  {formatTime(position)} / {formatTime(duration)}
</Text>

</View>

<TouchableOpacity
  style={styles.pauseBtn}
  onPress={toggleMusic}
>
<Ionicons
  name={isPlaying ? "pause" : "play"}
  size={24}
  color="#fff"
/>


</TouchableOpacity>

</View>

)
}

<View style={styles.sectionHeader}>

  <Text style={styles.sectionTitle}>
    🔥 Trending Music
  </Text>

  <TouchableOpacity>

    <Text style={styles.seeAll}>
      See All
    </Text>

  </TouchableOpacity>

</View>



      <FlatList
  data={musicList}
  keyExtractor={(item) => item.id}
  showsVerticalScrollIndicator={false}
  contentContainerStyle={{
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 120,
  }}
  renderItem={({ item }) => (

<TouchableOpacity
  style={styles.musicCard}
  activeOpacity={0.65}
onPress={() => playMusic(item)}

  
>

    <View style={styles.imageContainer}>

  <Image
    source={{ uri: item.image }}
    style={styles.musicImage}
  />

  <View style={styles.imagePlay}>

    <Ionicons
      name="play"
      size={16}
      color="#fff"
    />

  </View>

</View>

      <View style={styles.musicInfo}>

        <Text style={styles.musicTitle}>
          {item.title}
        </Text>

        <Text style={styles.artist}>
          {item.artist}
        </Text>


<View style={styles.infoRow}>

  <Ionicons
    name="musical-notes"
    size={13}
    color="#FF3B5C"
  />

  <Text style={styles.originalText}>
    Original Sound
  </Text>

  <View style={styles.dot} />

  <Text style={styles.duration}>
    0:30
  </Text>

</View>


        <Text style={styles.uses}>
          {item.uses}
        </Text>

      </View>

      <TouchableOpacity style={styles.playBtn}>

  <Ionicons
    name="play"
    size={16}
    color="#fff"
  />

  

</TouchableOpacity>

    </TouchableOpacity>

  )}
/>







{
selectedMusic && (

<View style={styles.bottomBar}>

<TouchableOpacity
style={styles.useSoundBtn}


onPress={async () => {
console.log("Sending Audio =", selectedMusic.audioUrl);
  // Preview audio stop karo
  if (sound) {
    await sound.stopAsync();
    await sound.unloadAsync();
    setSound(null);
  }

  router.push({
    pathname: "/EditView",
  
params:{

videoUri,

musicId:selectedMusic.id,

musicTitle:selectedMusic.title,

musicArtist:selectedMusic.artist,

musicImage:selectedMusic.image,
audioUrl: selectedMusic.audioUrl,
}

  });

}}

>

<Text style={styles.useSoundText}>

Use this sound
</Text>

</TouchableOpacity>

</View>

)
}






    </SafeAreaView>

  );

}

const styles = StyleSheet.create({

container:{
flex:1,
backgroundColor:"#000",
},

header:{
flexDirection:"row",
justifyContent:"space-between",
alignItems:"center",
paddingHorizontal:15,
paddingVertical:15,
},

headerTitle:{
color:"#fff",
fontSize:22,
fontWeight:"bold",
},

searchBox:{
marginHorizontal:15,
marginTop:10,
height:48,
backgroundColor:"#151515",
borderRadius:15,
paddingHorizontal:15,
flexDirection:"row",
alignItems:"center",
},

searchInput:{
flex:1,
color:"#fff",
marginLeft:10,
fontSize:16,
},

tabRow:{
flexDirection:"row",
justifyContent:"space-around",
marginTop:20,
borderBottomWidth:0.5,
borderBottomColor:"#222",
paddingBottom:12,
},

tabText:{
color:"#777",
fontSize:16,
fontWeight:"600",
},

activeTab:{
color:"#fff",
fontSize:18,
},


musicCard:{
flexDirection:"row",
alignItems:"center",
backgroundColor:"#111",
padding:12,
borderRadius:16,
marginBottom:12,
},

musicImage:{
width:65,
height:65,
borderRadius:14,
},

musicInfo:{
flex:1,
marginLeft:15,
},

musicTitle:{
color:"#fff",
fontSize:17,
fontWeight:"bold",
},

artist:{
color:"#999",
marginTop:3,
fontSize:14,
},

uses:{
color:"#FFD700",
marginTop:5,
fontSize:13,
},

playBtn:{
width:45,
height:45,
borderRadius:30,
backgroundColor:"#FF3B5C",
justifyContent:"center",
alignItems:"center",
},

sectionHeader:{
flexDirection:"row",
justifyContent:"space-between",
alignItems:"center",
paddingHorizontal:18,
marginTop:18,
marginBottom:12,
},

sectionTitle:{
color:"#fff",
fontSize:20,
fontWeight:"bold",
},

seeAll:{
color:"#FF3B5C",
fontSize:15,
fontWeight:"700",
},


infoRow:{
flexDirection:"row",
alignItems:"center",
marginTop:4,
},

originalText:{
color:"#bbb",
fontSize:12,
marginLeft:4,
},

dot:{
width:4,
height:4,
borderRadius:2,
backgroundColor:"#666",
marginHorizontal:6,
},

duration:{
color:"#888",
fontSize:12,
},

imageContainer:{
position:"relative",
},

imagePlay:{
position:"absolute",
right:4,
bottom:4,
width:24,
height:24,
borderRadius:12,
backgroundColor:"rgba(0,0,0,0.7)",
justifyContent:"center",
alignItems:"center",
},

previewText:{
color:"#fff",
fontSize:11,
fontWeight:"700",
marginTop:2,
},

nowPlayingCard:{
backgroundColor:"#161616",
marginHorizontal:15,
marginTop:18,
padding:18,
borderRadius:18,
flexDirection:"row",
alignItems:"center",
},

nowPlayingLabel:{
color:"#FF3B5C",
fontWeight:"700",
fontSize:13,
},

nowPlayingTitle:{
color:"#fff",
fontSize:18,
fontWeight:"bold",
marginTop:5,
},

nowPlayingArtist:{
color:"#999",
marginTop:3,
},

progressBar:{
height:4,
backgroundColor:"#333",
borderRadius:4,
marginTop:12,
overflow:"hidden",
},

progressFill:{
width:"45%",
height:4,
backgroundColor:"#FF3B5C",
},

timeText:{
color:"#777",
marginTop:6,
fontSize:12,
},

pauseBtn:{
width:52,
height:52,
borderRadius:26,
backgroundColor:"#FF3B5C",
justifyContent:"center",
alignItems:"center",
marginLeft:15,
},

nowPlayingImage:{
width:70,
height:70,
borderRadius:16,
marginRight:15,
},

bottomBar:{
position:"absolute",
bottom:49,
left:20,
right:20,
},

useSoundBtn:{
backgroundColor:"#FF3B5C",
height:50,
borderRadius:28,
justifyContent:"center",
alignItems:"center",
},

useSoundText:{
color:"#fff",
fontSize:18,
fontWeight:"bold",
},





});