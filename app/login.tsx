import React, { useEffect } from 'react';
import {
View,
Text,
TouchableOpacity,
StyleSheet,
Alert,
Image,
} from 'react-native';

import { useRouter } from 'expo-router';

import {
GoogleSignin,
statusCodes,
} from '@react-native-google-signin/google-signin';

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
GoogleAuthProvider,
signInWithCredential,
onAuthStateChanged,
} from 'firebase/auth';

import { auth, db, getFCMToken } from './firebaseConfig';

import {
  collection,
  query,
  where,
  getDocs,
   doc,
   getDoc,
   setDoc,
} from "firebase/firestore";

import TopKingLogo from '../assets/images/topking-logo.png';
export default function LoginScreen() {
const router = useRouter();

useEffect(() => {
GoogleSignin.configure({
webClientId:
'153552238196-0u22oecct9lgv1h2kk33ipin4n6bb435.apps.googleusercontent.com',
offlineAccess: true,
});
}, []);


useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user) {
      router.replace('/profile');
    }
  });

  return unsubscribe;
}, []);


const signIn = async () => {
try {
await GoogleSignin.hasPlayServices();


  

  const userInfo = await GoogleSignin.signIn();

  const idToken =
    userInfo.data?.idToken ||
    userInfo.idToken;

  if (!idToken) {
    Alert.alert('ID Token not found');
    return;
  }

  const googleCredential =
    GoogleAuthProvider.credential(idToken);

  const userCredential =
  await signInWithCredential(
    auth,
    googleCredential
  );

const uid = userCredential.user.uid;

const createUniqueUsername = async (name) => {

  let username = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")        // aman king -> aman_king
    .replace(/[^a-z0-9_]/g, ""); // special characters hata do

  if (!username) {
    username = "user";
  }

  let finalUsername = username;
  let count = 1;

  while (true) {

    const q = query(
      collection(db, "users"),
      where("username", "==", finalUsername)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      break;
    }

    finalUsername = `${username}${count}`;
    count++;

  }

  return finalUsername;

};


console.log(
  "SAVING USER ID =",
  uid
);

await AsyncStorage.setItem(
  "userId",
  uid
);

const userRef = doc(db, "users", uid);

const userSnap = await getDoc(userRef);

if (!userSnap.exists()) {

  const username =
    await createUniqueUsername(
      userCredential.user.displayName || "user"
    );

  await setDoc(userRef, {
    name: userCredential.user.displayName || "User",
    username: username,
    profileImg: userCredential.user.photoURL || "",
    bioText: "bio.........",
    category: "Video Creator",
    gender: "Male",
  }, {
    merge: true,
  });

}


const fcmToken = await getFCMToken();

console.log("FCM =", fcmToken);

if (fcmToken) {

  await setDoc(
    doc(db, "users", uid),
    {
      fcmToken: fcmToken,
    },
    {
      merge: true,
    }
  );

}



Alert.alert(
  'Success',
  'Login Successful'
);

router.replace('/profile');

} catch (error: any) {
  console.log(error);

  if (
    error.code ===
    statusCodes.SIGN_IN_CANCELLED
  ) {
    Alert.alert('Login Cancelled');
  } else if (
    error.code ===
    statusCodes.IN_PROGRESS
  ) {
    Alert.alert('Login In Progress');
  } else if (
    error.code ===
    statusCodes.PLAY_SERVICES_NOT_AVAILABLE
  ) {
    Alert.alert(
      'Google Play Services Not Available'
    );
  } else {
    Alert.alert(
      'Error',
      error?.message || 'Google Sign In Failed'
    );
  }
}


};

return ( <View style={styles.container}>

<Text style={styles.appName}>
  TOP KING
</Text>

<Image
  source={TopKingLogo}
  style={styles.logo}
/>

<Text style={styles.welcome}>
  Welcome Back
</Text>


  <Text style={styles.title}>
    Login with Google
  </Text>

  <TouchableOpacity
    style={styles.googleBtn}
    onPress={signIn}
  >
   
<Image
  source={TopKingLogo}
  style={styles.buttonLogo}
/>

<Text style={styles.googleText}>
  Continue with Google
</Text>

  </TouchableOpacity>
</View>


);
}

const styles = StyleSheet.create({
container: {
flex: 1,
backgroundColor: '#000',
justifyContent: 'center',
alignItems: 'center',
paddingHorizontal: 20,
},

logo: {
width: 100,
height: 100,
marginBottom: 25,
},

title: {
color: '#fff',
fontSize: 30,
fontWeight: 'bold',
marginBottom: 40,
},

googleBtn: {
width: '100%',
backgroundColor: '#fff',
paddingVertical: 16,
borderRadius: 15,
flexDirection: 'row',
justifyContent: 'center',
alignItems: 'center',
},

googleIcon: {
width: 24,
height: 24,
marginRight: 10,
},

googleText: {
color: '#000',
fontSize: 18,
fontWeight: 'bold',
},




crown: {
  fontSize: 50,
},

appName: {
  color: '#FFD700',
  fontSize: 35,
  fontWeight: '900',
  letterSpacing: 3,
  marginBottom: 45,
},

tagline: {
  color: '#888',
  marginTop: 5,
  marginBottom: 30,
},


welcome: {
  color: '#FFF',
  fontSize: 25,
  fontWeight: 'bold',
  marginTop: 15,
},

subtitle: {
  color: '#888',
  marginTop: 10,
  marginBottom: 40,
},

googleBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#1E1E1E',
  paddingVertical: 15,
  paddingHorizontal: 25,
  borderRadius: 30,
},

buttonLogo: {
  width: 35,
  height: 35,
},

googleText: {
  color: '#FFF',
  fontSize: 16,
  fontWeight: '700',
  marginLeft: 12,
},

footer: {
  position: 'absolute',
  bottom: 40,
  color: '#666',
},



});