import React, {
  useState,
  useEffect
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  Dimensions,
  
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";

import { db } from "./firebaseConfig";

import { getAuth } from "firebase/auth";


const { width } = Dimensions.get('window');

const auth = getAuth();

export default function Story() {

  const router = useRouter();
  

const [myStory, setMyStory] = useState([]);
const [friendStories, setFriendStories] = useState([]);

 useEffect(() => {

  const loadStories = async () => {

    const user = auth.currentUser;

    if (!user) return;

    // apni story
    const myQuery = query(
      collection(db, "stories"),
      where("userId", "==", user.uid)
    );

    const mySnap = await getDocs(myQuery);

    const myData = [];

    mySnap.forEach(doc => {
      myData.push({
        id: doc.id,
        ...doc.data()
      });
    });

    setMyStory(myData);

    // friends
   const followSnap = await getDocs(
  query(
    collection(db, "follows"),
    where(
      "followerId",
      "==",
      user.uid
    )
  )
);

const friendIds = [];

followSnap.forEach((doc) => {

  friendIds.push(
    doc.data().followingId
  );

});

    const allStories = [];

for (const friendId of friendIds) {


let profileImg = "";
let userName = "";

const userQuery = query(
  collection(db, "users"),
  where("uid", "==", friendId)
);

const userDocs =
  await getDocs(userQuery);

if (!userDocs.empty) {

  const userData =
    userDocs.docs[0].data();

  profileImg =
    userData.profileImg;

  userName =
    userData.username;

  console.log(
    "Photo:",
    profileImg
  );

  console.log(
    "Username:",
    userName
  );
}






      const q = query(
        collection(db, "stories"),
        where("userId", "==", friendId)
      );

      const snap = await getDocs(q);

     snap.forEach(doc => {

  allStories.push({

    id: doc.id,

    ...doc.data(),

    profileImg: profileImg,

    userName: userName,
  });

});


    }

    setFriendStories(allStories);
  };

  loadStories();

}, []);


  return (
    <SafeAreaView style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>

        <TouchableOpacity>
          <Ionicons
            name="menu"
            size={30}
            color="#000"
          />
        </TouchableOpacity>

        <Text style={styles.logo}>
          TopKing
        </Text>

        <TouchableOpacity>
          <Ionicons
            name="notifications"
            size={28}
            color="#000"
          />
        </TouchableOpacity>

      </View>

      {/* SEARCH */}
      <View style={styles.searchBox}>

        <Ionicons
          name="search"
          size={22}
          color="#777"
        />

        <TextInput
          placeholder="Search"
          placeholderTextColor="#777"
          style={styles.input}
        />

      </View>

      {/* TITLE */}
      <Text style={styles.heading}>
        Friends
      </Text>

      {/* STORIES */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.storyRow}
      >

      

{/* MY STORY */}

<TouchableOpacity
  style={styles.storyCircle}
  onPress={() => router.push('/uploadStory')}
>

  <Image
    source={{
      uri:
        myStory[0]?.profileImg ||
        'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
    }}
    style={styles.storyImage}
  />

  <View style={styles.plus}>
    <Ionicons
      name="add"
      size={18}
      color="#fff"
    />
  </View>

</TouchableOpacity>


{/* FRIEND STORIES */}

{friendStories.map((item) => (

  <TouchableOpacity
    key={item.id}
    style={styles.storyCircle}
    onPress={() =>
      router.push({
        pathname: '/watchStory',
        params: {
          storyId: item.id,
        },
      })
    }
  >

   
   <Image
  source={{
    uri:
      item.profileImg ||
      'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
  }}
  style={styles.storyImage}
/>

<Text
  style={{
    fontSize: 11,
    textAlign: 'center',
    marginTop: 3,
    color: '#000',
  }}
>
  {item.userName}
</Text>

  </TouchableOpacity>

))}



      </ScrollView>

      {/* MAIN STORY CARD */}
      <View style={styles.card}>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            console.log('Story Open');
          }}
        >

          <Image
            source={require('../assets/logo.png')}
            style={styles.bigLogo}
          />

        </TouchableOpacity>

      </View>

      <Text style={styles.bottomText}>
        TAP TO WATCH
      </Text>

      <Text style={styles.bottomText}>
        YOUR STORIES FILE
      </Text>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#FFD700',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 25,
  },

  logo: {
    fontSize: 25,
    fontWeight: 'bold',
    color: '#000',
    fontStyle: 'italic',
  },

  searchBox: {
    flexDirection: 'row',
    backgroundColor: '#eee',
    marginHorizontal: 15,
    marginTop: 20,
    borderRadius: 15,
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 45,
  },

  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 18,
  },

  heading: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginLeft: 18,
    marginTop: 20,
  },

  storyRow: {
    marginTop: 15,
    paddingLeft: 10,
  },

  storyCircle: {
    marginRight: 12,
  },

  storyImage: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    borderColor: '#fff',
  },

  plus: {
    position: 'absolute',
    right: 5,
    bottom: 215,
    backgroundColor: '#2196F3',
    width: 25,
    height: 25,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },

  card: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  bigLogo: {
    width: width * 0.8,
    height: width * 0.8,
    resizeMode: 'contain',
  },

  bottomText: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 5,
  },

});