import React, {
  useEffect,
  useState,
} from "react";

import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Image,
  FlatList,
  Dimensions,
  Animated,
   BackHandler,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

import { db } from "./firebaseConfig";

import { useRouter, useLocalSearchParams } from "expo-router";

const { width } = Dimensions.get("window");

export default function MusicDetails() {

  const router = useRouter();

const {
musicName,
username,
profile,
audioUrl,
} = useLocalSearchParams();

console.log("audioUrl =", audioUrl);


const [sound,setSound]=useState(null);

const [playing,setPlaying]=useState(false);

const [videos, setVideos] = useState([]);

const stopMusic = async () => {

  try {

    if (sound) {

      await sound.stopAsync();

      await sound.unloadAsync();

      setSound(null);

      setPlaying(false);

    }

  } catch (e) {

    console.log(e);

  }

};

useEffect(()=>{

let music;

const loadMusic=async()=>{

try{

const { sound }=
await Audio.Sound.createAsync(

{
uri:audioUrl,
},

{
shouldPlay:true,
isLooping:true,
}

);

music=sound;

setSound(sound);

setPlaying(true);

}catch(e){

console.log(e);

}

};

if(audioUrl){

loadMusic();

}

return () => {

  if (music) {

    music.stopAsync().catch(() => {});

    music.unloadAsync().catch(() => {});

  }

};

},[]);





useEffect(() => {

  const backHandler = BackHandler.addEventListener(

    "hardwareBackPress",

    () => {

      stopMusic();

      router.back();

      return true;

    }

  );

  return () => backHandler.remove();

}, [sound]);




useEffect(() => {

  const loadVideos = async () => {

    try {

      const q = query(

        collection(db, "all_videos"),

        where("audioUrl", "==", audioUrl)

      );

      const snap = await getDocs(q);

      const list = [];

      snap.forEach((doc) => {

        list.push({

          id: doc.id,

          ...doc.data(),

        });

      });

      setVideos(list);

    } catch (e) {

      console.log(e);

    }

  };

  if (audioUrl) {

    loadVideos();

  }

}, [audioUrl]);






  return (

    <SafeAreaView style={styles.container}>

      <View style={styles.header}>

        <TouchableOpacity
  onPress={async () => {

    await stopMusic();

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
          Original Music
        </Text>

        <View style={{ width: 26 }} />

      </View>

      



<TouchableOpacity
  style={styles.discContainer}
  onPress={async () => {

    if (!sound) return;

    if (playing) {
      await sound.pauseAsync();
      setPlaying(false);
    } else {
      await sound.playAsync();
      setPlaying(true);
    }

  }}
>

  <Image
    source={{
      uri:
        profile ||
        "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
    }}
    style={styles.disc}
  />

  <View style={styles.playButton}>

    <Ionicons
      name={playing ? "pause" : "play"}
      size={28}
      color="#fff"
    />

  </View>

</TouchableOpacity>





      <Text style={styles.musicTitle}>
        🎵 {musicName}
      </Text>

      <Text style={styles.userName}>
        {username}
      </Text>

     <Text style={styles.totalVideos}>
  {videos.length} Videos
</Text>

      

      <TouchableOpacity

style={styles.useBtn}



onPress={async () => {

  // Music stop
  if (sound) {
    await sound.stopAsync();
    await sound.unloadAsync();
    setPlaying(false);
  }

  router.push({
    pathname: "/camera",
    params: {
      audioUrl,
      musicName,
      profile,
      username,
    },
  });

}}

>


        <Text style={styles.useText}>
          Use this Music
        </Text>
      </TouchableOpacity>

 

<FlatList
  data={videos}
  keyExtractor={(item) => item.id}
  numColumns={3}
  renderItem={({ item }) => (

    <TouchableOpacity
      style={styles.videoCard}

onPress={() => {

  const selectedIndex = videos.findIndex(
    (v) => v.id === item.id
  );


router.push({
  pathname: "/allvideo",
  params: {
    videos: JSON.stringify(videos),
    index: selectedIndex,
    userId: item.userId,

    from: "userProfile",
  },
});


}}

    >

      <Image

        source={{

          uri: item.thumbnail,

        }}

        style={{

          width: "100%",

          height: "100%",

          borderRadius: 12,

        }}

      />


<View style={styles.viewBox}>

  <Ionicons
    name="eye"
    size={14}
    color="#fff"
  />

  <Text style={styles.viewText}>
    {item.views || 0}
  </Text>

</View>


    </TouchableOpacity>

  )}
/>



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
padding:22,
},

headerTitle:{
color:"#fff",
fontSize:17,
fontWeight:"bold",
},

disc:{
width:110,
height:110,
borderRadius:55,
alignSelf:"center",
marginTop:-5,
borderWidth:3,
borderColor:"#FFD700",
},

musicTitle:{
color:"#fff",
fontSize:20,
fontWeight:"bold",
textAlign:"center",
marginTop:20,
},

userName:{
color:"#999",
fontSize:15,
textAlign:"center",
marginTop:6,
},

totalVideos:{
color:"#FFD700",
fontWeight:"bold",
textAlign:"center",
marginTop:10,
},

useBtn:{
marginHorizontal:25,
marginVertical:25,
backgroundColor:"#FFD700",
height:50,
borderRadius:30,
justifyContent:"center",
alignItems:"center",
},

useText:{
fontWeight:"bold",
fontSize:17,
color:"#000",
},

videoCard:{
width:(width-40)/3,
height:170,
backgroundColor:"#111",
margin:5,
borderRadius:12,
justifyContent:"center",
alignItems:"center",
},

discContainer: {
  alignSelf: "center",
  marginTop: 20,
},

playButton: {
  position: "absolute",
  top: "50%",
  left: "50%",
  marginLeft: -25,
  marginTop: -25,
  width: 50,
  height: 50,
  borderRadius: 25,
  backgroundColor: "rgba(0,0,0,0.55)",
  justifyContent: "center",
  alignItems: "center",
},

viewBox: {
  position: "absolute",
  top: 8,
  left: 8,
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "rgba(0,0,0,0.6)",
  paddingHorizontal: 6,
  paddingVertical: 3,
  borderRadius: 20,
},

viewText: {
  color: "#fff",
  fontSize: 12,
  marginLeft: 4,
  fontWeight: "600",
},


});