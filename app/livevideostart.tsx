import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import * as ImagePicker from "expo-image-picker";

import { CameraView, useCameraPermissions } from "expo-camera";

import { useRouter } from "expo-router";

import { getAuth } from "firebase/auth";

import {
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";

import { db } from "./firebaseConfig";


export default function VideoLiveStart() {

  const router = useRouter();

  const auth = getAuth();

  const [title, setTitle] = useState("");

const [coverImage, setCoverImage] = useState(null);

const [userData, setUserData] = useState({
  userId: "",
  username: "",
  profile: "",
});



const [permission, requestPermission] =
  useCameraPermissions();




React.useEffect(() => {

  const fetchUser =
    async () => {

      const user =
        auth.currentUser;

      if (!user)
        return;

      const snap =
        await getDoc(

          doc(
            db,
            "users",
            user.uid
          )

        );

      if (
        snap.exists()
      ) {

        const data =
          snap.data();

        setUserData({

          userId:
            user.uid,

          username:
            data.username,

          profile:
            data.profileImg,

        });

      }
    };

  fetchUser();

}, []);


if (!permission) {
  return <View />;
}




const pickCover = async () => {

  const result =
    await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [9,16],
      quality: 1,
    });

  if (!result.canceled) {
    setCoverImage(result.assets[0].uri);
  }
};


const startLive =
async () => {

const liveData = {

liveId:
Date.now()
.toString(),

userId:
userData.userId,

username:
userData.username,

profile:
userData.profile,

title:
title,

coverImage:
coverImage,

viewers:0,

likes:0,

gifts:0,

createdAt:
Date.now(),

isLive:true,

isHost:true,
};

await setDoc(

doc(
db,
"live_rooms",
liveData.liveId
),

liveData

);

router.push({

pathname:
"/videolive",

params:{

liveData:
JSON.stringify(
liveData
),

},

});

};



if (!permission.granted) {
  return (
    <View
      style={{
        flex:1,
        backgroundColor:"#000",
        justifyContent:"center",
        alignItems:"center"
      }}
    >
      <TouchableOpacity
        onPress={requestPermission}
        style={{
          backgroundColor:"#FFD600",
          padding:15,
          borderRadius:10
        }}
      >
        <Text>
          Allow Camera
        </Text>
      </TouchableOpacity>
    </View>
  );
}


  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Close Button */}
      <TouchableOpacity style={styles.closeBtn}>
        <Ionicons name="close" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Camera Preview */}
<View style={styles.previewContainer}>


<View
style={styles.preview}
/>

        {/* Blur Overlay */}
        <View style={styles.overlay} />

        {/* Top Card */}
        <View style={styles.topSection}>
         

         <TouchableOpacity
  style={styles.coverBox}
  onPress={pickCover}
>

  {coverImage ? (

    <Image
      source={{ uri: coverImage }}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 12,
      }}
    />

  ) : (

    <Ionicons
      name="image"
      size={30}
      color="#fff"
    />

  )}

</TouchableOpacity>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Enter live title..."
            placeholderTextColor="#bbb"
            style={styles.input}
          />
        </View>

        {/* Bottom Controls */}
        <View style={styles.bottomSection}>
          <View style={styles.optionRow}>
            <TouchableOpacity style={styles.option}>
              <Ionicons name="people" size={22} color="#fff" />
              <Text style={styles.optionText}>Audience</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.option}>
              <Ionicons name="shield-checkmark" size={22} color="#fff" />
              <Text style={styles.optionText}>Safety</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.option}>
              <Ionicons name="settings" size={22} color="#fff" />
              <Text style={styles.optionText}>Settings</Text>
            </TouchableOpacity>
          </View>

          {/* Go Live Button */}
          
     {/* Go Live Button */}
<TouchableOpacity
style={styles.liveBtn}
onPress={startLive}
>
  <Text style={styles.liveText}>
    GO LIVE
  </Text>
</TouchableOpacity>

        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  closeBtn: {
    position: "absolute",
    top: 50,
    left: 20,
    zIndex: 100,
  },

  previewContainer: {
    flex: 1,
  },

 preview:{
flex:1,
},

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },

 topSection: {
  position: "absolute",
  top: 80,
  left: 20,
  right: 20,

  flexDirection: "row",
  alignItems: "center",

  zIndex: 100,
},

  coverBox: {
    width: 70,
    height: 90,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  input: {
    flex: 1,
    marginLeft: 15,
    color: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#777",
    fontSize: 16,
    paddingBottom: 10,
  },

  bottomSection: {
    position: "absolute",
    bottom: 60,
    width: "100%",
    paddingHorizontal: 20,
  },

  optionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 25,
  },

  option: {
    alignItems: "center",
  },

  optionText: {
    color: "#fff",
    marginTop: 5,
    fontSize: 12,
  },

  liveBtn: {
    backgroundColor: "#FFD600",
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: "center",
    elevation: 8,
  },

  liveText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#000",
  },
});