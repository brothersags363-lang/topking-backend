import React, {
  useState,
  useEffect,
  useRef,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  TextInput,
  PermissionsAndroid,
  Platform,
} from "react-native";

import { Ionicons } from '@expo/vector-icons';

import {
  doc,
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  setDoc,
} from "firebase/firestore";

import { db } from "./firebaseConfig";

import {
 ZEGO_APP_ID,
 ZEGO_APP_SIGN
} from "../backend/config/zegoConfig";

import { useLocalSearchParams } from "expo-router";

import GiftImage from '../assets/gift.png';


import ZegoExpressEngine, {
  ZegoScenario,
  ZegoTextureView,
  ZegoView,
} from "zego-express-engine-reactnative";



const { width, height } = Dimensions.get('window');



export default function VideoLive() {

const { liveData } =
  useLocalSearchParams();



const live =
  liveData
    ? JSON.parse(liveData)
    : {};

const roomID =
 live.liveId || "room001";


 const engineRef = useRef(null);

const localViewRef = useRef(null);

const streamID = "live_" + roomID;


const [roomData, setRoomData] =
  useState(live);

const [comments, setComments] =
  useState([]);

const [message, setMessage] =
  useState('');
const isHost =
  roomData.isHost === true;


const initZego = async () => {


if(engineRef.current){
 console.log("Engine already running");
 return;
}


console.log("IS HOST =", isHost);



  if (Platform.OS === "android") {

    await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
console.log("Camera permission done");
  }

  const engine =
    await ZegoExpressEngine.createEngine(
      ZEGO_APP_ID,
      ZEGO_APP_SIGN,
      false,
      ZegoScenario.Broadcast
    );

  engineRef.current = engine;
console.log("Zego Engine Created");


await new Promise(resolve =>
 setTimeout(resolve,1000)
);

await engine.loginRoom(
  roomID,
  {
    userID: "user_" + Date.now(),
    userName: roomData.username || "User",
  },
  {
    userUpdate: true,
  }
);



engine.setVideoConfig({
  dimensions:{
    width:720,
    height:1280
  },
  bitrate:1200,
  fps:15
});


if (isHost) {


  console.log("STARTING CAMERA");


  console.log("VIEW REF =", localViewRef.current);
 await engine.startPreview({
  view: localViewRef.current,
});


  console.log("PREVIEW STARTED");


  await engine.startPublishingStream(
    streamID
  );


  console.log("PUBLISH STARTED");


}

};



useEffect(() => {

  if (!live.liveId)
    return;

  const unsubscribe =
    onSnapshot(

      doc(
        db,
        "live_rooms",
        live.liveId
      ),

      (snap) => {

        if (snap.exists()) {

console.log("ROOM DATA =", snap.data());

          setRoomData(
            snap.data()
          );

        }

      }

    );

  return unsubscribe;

}, []);








const sendComment =
async () => {



  if (!message.trim())
    return;

  await addDoc(

    collection(
      db,
      "live_rooms",
      live.liveId,
      "comments"
    ),

    {
      username:
        roomData.username,

      profile:
        roomData.profile,

      message:
        message,

      createdAt:
        Date.now(),
    }

  );

  setMessage('');

};
















useEffect(() => {

  if (!live.liveId)
    return;

  const unsubscribe =
    onSnapshot(

      query(

        collection(
          db,
          "live_rooms",
          live.liveId,
          "comments"
        ),

        orderBy(
          "createdAt",
          "desc"
        )

      ),

      (snapshot) => {

        const data =
          snapshot.docs.map(
            doc => ({
              id: doc.id,
              ...doc.data(),
            })
          );

        setComments(data);

      }

    );

  return unsubscribe;

}, []);





useEffect(() => {


 if(!roomData.liveId)
   return;


 initZego();


 return ()=>{


  if(engineRef.current){


    engineRef.current.stopPreview();

    engineRef.current.stopPublishingStream();

    engineRef.current.logoutRoom(roomID);

    ZegoExpressEngine.destroyEngine();

    engineRef.current=null;


  }


 };


},[roomData.liveId]);




  return (


    <>
      <StatusBar
        backgroundColor="#000"
        barStyle="light-content"
        translucent={false}
      />

      <View style={styles.statusBarBg} />

      <View style={styles.container}>


<View
  style={{
    position: "absolute",
    top: 0,
    left: 0,
    width: width,
    height: height,
  }}
>


<ZegoTextureView

ref={localViewRef}

style={{
 width:"100%",
 height:"100%",
}}

/>


</View>



{/* ZEGO LIVE VIDEO */}




        {/* TOP BAR */}
        <View style={styles.topBar}>

          <View style={styles.profileBox}>
           <Image
  source={{
    uri:
  roomData.profile ||
      'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
  }}
  style={styles.profile}
/>

            <View>
          <Text style={styles.name}>
  {roomData.username || "User"}
</Text>

              <Text style={styles.coins}>
                🪙 15,692
              </Text>
            </View>

            <TouchableOpacity style={styles.followBtn}>
              <Text style={styles.followText}>
                Follow
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.rightTop}>
            <View style={styles.viewer}>
              <Text style={{ color: '#fff' }}>
                {roomData.viewers || 0}
              </Text>
            </View>

            <Ionicons
              name="close"
              size={28}
              color="#fff"
            />
          </View>

        </View>



<View
  style={{
    position: "absolute",
    left: 15,
    bottom: 250,
  }}
>
  <Text
    style={{
      color: "#fff",
      fontSize: 18,
      fontWeight: "bold",
    }}
  >
    {roomData.title}
  </Text>
</View>
        {/* COMMENTS */}
        <View style={styles.comments}>

          {

comments.map((item) => (

  <View
    key={item.id}
    style={styles.commentRow}
  >

    {/* Profile */}
    <Image
      source={{
        uri:
          item.profile ||
          "https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
      }}
      style={styles.commentProfile}
    />

    {/* Username + Message */}
    <View style={styles.commentBox}>

      <Text style={styles.commentUser}>
        {item.username}
      </Text>

      <Text style={styles.commentMsg}>
        {item.message}
      </Text>

    </View>

  </View>

))

}

          

        </View>

        {/* BOTTOM */}
    
{/* BOTTOM */}
<View style={styles.bottom}>



  {/* Chat Box */}
{/* Chat Box */}
<View style={styles.chatBox}>

 <TextInput
  value={message}
  onChangeText={setMessage}
  placeholder="Chat with others"
  placeholderTextColor="#999"
  style={styles.chatInput}
  returnKeyType="send"
  onSubmitEditing={sendComment}
  blurOnSubmit={false}
/>

</View>



  {/* Share */}



  <TouchableOpacity style={styles.circleBtn}>
    <Ionicons
      name="arrow-redo-outline"
      size={28}
      color="#fff"
    />
  </TouchableOpacity>

  {/* Menu */}
  <TouchableOpacity style={styles.circleBtn}>
    <Ionicons
      name="menu"
      size={28}
      color="#fff"
    />
  </TouchableOpacity>

  {/* Gift */}
{/* Gift */}
<TouchableOpacity style={styles.giftBtn}>

  <Image
    source={GiftImage}
    style={styles.giftImage}
  />

</TouchableOpacity>

</View>


      </View>
    </>
  );
}

const styles = StyleSheet.create({

  statusBarBg: {
    height: StatusBar.currentHeight || 0,
    backgroundColor: '#000',
  },

  container: {
    flex: 1,
    backgroundColor: '#000',
  },

 video: {
    position: 'absolute',
    width: width,
    height: height,
},

  topBar: {
    paddingHorizontal: 10,
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  profileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 25,
    padding: 5,
  },

  profile: {
    width: 45,
    height: 45,
    borderRadius: 25,
  },

  name: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 8,
  },

  coins: {
    color: '#FFD700',
    marginLeft: 8,
  },

  followBtn: {
    backgroundColor: '#FFD700',
    marginLeft: 10,
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 20,
  },

  followText: {
    fontWeight: 'bold',
  },

  rightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },

  viewer: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 20,
  },

comments:{
  position:'absolute',
  bottom:120,
  left:10,
  width:'75%',
  maxHeight:300,
},

  comment: {
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 10,
    borderRadius: 15,
    marginBottom: 8,
  },

commentRow:{
  flexDirection:'row',
  alignItems:'flex-start',
  marginBottom:10,
},

commentProfile:{
  width:35,
  height:35,
  borderRadius:18,
},

commentBox:{
  marginLeft:8,
  backgroundColor:'rgba(0, 0, 0, 0.4)',
  padding:8,
  borderRadius:15,
  maxWidth:'80%',
},

commentUser:{
  color:'#FFD700',
  fontWeight:'bold',
  fontSize:13,
},

commentMsg:{
  color:'#fff',
  marginTop:2,
  fontSize:14,
},


bottom: {
  position: 'absolute',
  bottom: 50,
  left: 10,
  right: 10,
  flexDirection: 'row',
  alignItems: 'center',
},

chatBox: {
  flex: 1,
  height: 45,
  backgroundColor: 'rgba(0,0,0,0.45)',
  borderRadius: 25,
  justifyContent: 'center',
  paddingHorizontal: 18,
  marginRight: 10,
},
chatInput: {
  color: "#fff",
  fontSize: 16,
},


chatText: {
  color: '#bbb',
  fontSize: 16,
},

circleBtn: {
  width: 48,
  height: 48,
  borderRadius: 24,
  backgroundColor: 'rgba(0,0,0,0.45)',
  justifyContent: 'center',
  alignItems: 'center',
  marginHorizontal: 4,
},

giftBtn: {
  width: 50,
  height: 50,
  borderRadius: 25,
  backgroundColor: 'rgba(0,0,0,0.45)',
  justifyContent: 'center',
  alignItems: 'center',
  marginLeft: 5,
},

giftImage: {
  width: 42,
  height: 42,
  resizeMode: 'contain',
},


giftText: {
  fontSize: 28,
},



});   