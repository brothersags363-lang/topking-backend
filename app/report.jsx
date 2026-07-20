
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert
} from "react-native";

import { useLocalSearchParams, useRouter } from "expo-router";

import {
  addDoc,
  collection,
  serverTimestamp,
  updateDoc,
  increment,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";

import { getAuth } from "firebase/auth";

import { db } from "./firebaseConfig";

export default function ReportScreen() {

  const router = useRouter();

  const auth = getAuth();

 const {
videoId,
reportedUserId
} = useLocalSearchParams();

  const reportVideo = async (reason) => {

    


        const user = auth.currentUser;

if (!user) {
  Alert.alert("Login Required");
  return;
}

const reportId =
`${videoId || reportedUserId}_${user.uid}`;

const reportRef =
doc(
db,
"reports",
reportId
);

const reportSnap = await getDoc(reportRef);

if (reportSnap.exists()) {

  Alert.alert(
    "Already Reported",
    "You already reported this video."
  );

  return;
}



try {

      const user = auth.currentUser;

 
      await setDoc(
reportRef,
{
videoId: videoId || "",

reportedUserId:
reportedUserId || "",

reportedBy:user.uid,

reason,

reviewRequired:true,

createdAt:serverTimestamp()
}
);

   
if (videoId) {

const videoRef = doc(
db,
"all_videos",
videoId
);

const videoSnap = await getDoc(videoRef);

if (videoSnap.exists()) {

const oldCount =
videoSnap.data().reportCount || 0;

const newCount = oldCount + 1;

await updateDoc(
videoRef,
{
reportCount: increment(1),
reviewRequired: newCount >= 10
}
);

}

}


if (reportedUserId) {

const userRef = doc(
db,
"users",
reportedUserId
);

const userSnap = await getDoc(userRef);

if (userSnap.exists()) {

const oldCount =
userSnap.data().reportCount || 0;

const newCount = oldCount + 1;

await updateDoc(
userRef,
{
reportCount: increment(1),

reviewRequired:
newCount >= 10
}
);

}

}




      Alert.alert(
        "Success",
        "Report Submitted Successfully"
      );

      router.back();

    } catch (error) {

      console.log(error);

      Alert.alert(
        "Error",
        "Something went wrong"
      );

    }

  };

  return (

    <View style={styles.container}>

      <Text style={styles.title}>
        Report Video
      </Text>


      <TouchableOpacity
        style={styles.btn}
        onPress={() => reportVideo("Spam")}
      >
        <Text style={styles.text}>
          Spam
        </Text>
      </TouchableOpacity>


      <TouchableOpacity
        style={styles.btn}
        onPress={() => reportVideo("Copyright")}
      >
        <Text style={styles.text}>
          Copyright
        </Text>
      </TouchableOpacity>


      <TouchableOpacity
        style={styles.btn}
        onPress={() => reportVideo("Violence")}
      >
        <Text style={styles.text}>
          Violence
        </Text>
      </TouchableOpacity>


      <TouchableOpacity
        style={styles.btn}
        onPress={() => reportVideo("Adult Content")}
      >
        <Text style={styles.text}>
          Adult Content
        </Text>
      </TouchableOpacity>


      <TouchableOpacity
        style={styles.btn}
        onPress={() => reportVideo("Harassment")}
      >
        <Text style={styles.text}>
          Harassment
        </Text>
      </TouchableOpacity>


      <TouchableOpacity
        style={styles.btn}
        onPress={() => reportVideo("Fake Content")}
      >
        <Text style={styles.text}>
          Fake Content
        </Text>
      </TouchableOpacity>

    </View>

  );

}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 20,
    justifyContent: "center"
  },

  title: {
    color: "#fff",
    fontSize: 25,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 30
  },

  btn: {
    backgroundColor: "#222",
    padding: 18,
    borderRadius: 15,
    marginBottom: 15
  },

  text: {
    color: "#fff",
    fontSize: 18,
    textAlign: "center"
  }

});

