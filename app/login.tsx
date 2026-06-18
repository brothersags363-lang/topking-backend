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

import { auth } from './firebaseConfig';

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

console.log(
  "SAVING USER ID =",
  uid
);

await AsyncStorage.setItem(
  "userId",
  uid
);

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
<Image
source={{
uri: 'https://cdn-icons-png.flaticon.com/512/300/300221.png',
}}
style={styles.logo}
/>


  <Text style={styles.title}>
    Login with Google
  </Text>

  <TouchableOpacity
    style={styles.googleBtn}
    onPress={signIn}
  >
    <Image
      source={{
        uri: 'https://cdn-icons-png.flaticon.com/512/281/281764.png',
      }}
      style={styles.googleIcon}
    />

    <Text style={styles.googleText}>
      Sign in with Google
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
});