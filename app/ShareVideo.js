import React, {
  useState,
  useEffect,
} from 'react';

import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Alert,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  setDoc, 
} from 'firebase/firestore';

import { db } from './firebaseConfig';

import {
  getAuth
} from 'firebase/auth';

import {
  useLocalSearchParams,
  useRouter,
} from 'expo-router';

const { width } = Dimensions.get('window');

const auth = getAuth();

export default function ShareVideo() {

  const router = useRouter();

const {
  type,
  roomId,

  videoId,
  videoUrl,
  thumbnail

} = useLocalSearchParams();

  const [friends, setFriends] =
    useState([]);

  const [search, setSearch] =
    useState('');

  const [selectedUsers,
    setSelectedUsers] =
    useState([]);

  useEffect(() => {

    loadFriends();

  }, []);



 const loadFriends = async () => {

  const user = auth.currentUser;

  if (!user) return;

  try {

    // Main kin ko follow karta hu
    const followingQuery = query(
      collection(db, "follows"),
      where(
        "followerId",
        "==",
        user.uid
      )
    );

    const followingSnap =
      await getDocs(
        followingQuery
      );

    const followingIds =
      followingSnap.docs.map(
        doc =>
          doc.data()
            .followingId
      );



    // Kaun mujhe follow karta hai
    const followerQuery = query(
      collection(db, "follows"),
      where(
        "followingId",
        "==",
        user.uid
      )
    );

    const followerSnap =
      await getDocs(
        followerQuery
      );

    const followerIds =
      followerSnap.docs.map(
        doc =>
          doc.data()
            .followerId
      );



    // Mutual follow
    const friendIds =
      followingIds.filter(
        id =>
          followerIds.includes(
            id
          )
      );



    let friendUsers = [];

    for (let uid of friendIds) {

      const userSnap =
        await getDoc(
          doc(
            db,
            "users",
            uid
          )
        );

      if (
        userSnap.exists()
      ) {

        friendUsers.push({
          id: uid,
          friendId: uid,
          username:
            userSnap.data()
              .username,
          profile:
            userSnap.data()
              .profileImg,
        });

      }

    }

    console.log(
      "FRIENDS =",
      friendUsers
    );

    setFriends(
      friendUsers
    );

  } catch (error) {

    console.log(
      "FRIEND ERROR:",
      error
    );

  }
};




  const selectUser =
    (uid) => {

      if (
        selectedUsers.includes(uid)
      ) {

        setSelectedUsers(
          selectedUsers.filter(
            x => x !== uid
          )
        );

      } else {

        setSelectedUsers([
          ...selectedUsers,
          uid
        ]);
      }
    };

  const sendVideo =
    async () => {

console.log("VIDEO ID =", videoId);
console.log("VIDEO URL =", videoUrl);
console.log("THUMB =", thumbnail);


      const me =
        auth.currentUser;

      if (!me) return;


const senderSnap = await getDoc(
  doc(db, "users", me.uid)
);

const videoSnap = await getDoc(
  doc(db, "all_videos", videoId)
);

const videoData =
  videoSnap.exists()
    ? videoSnap.data()
    : {};


const senderData = senderSnap.exists()
  ? senderSnap.data()
  : {};


      try {



      for (let uid of selectedUsers) {

  // ADD HERE
  const receiverSnap = await getDoc(
    doc(db, "users", uid)
  );

  const receiverData =
    receiverSnap.exists()
      ? receiverSnap.data()
      : {};

  const chatId =
    [me.uid, uid]
      .sort()
      .join("_");


// original video ka data lao
const videoSnap = await getDoc(
  doc(db, "all_videos", videoId)
);

const videoData =
  videoSnap.exists()
    ? videoSnap.data()
    : {};






if (type === "live") {

  await addDoc(
    collection(
      db,
      "chats",
      chatId,
      "messages"
    ),
    {
      type: "live",

      roomId: roomId,

      senderId: me.uid,

      receiverId: uid,

      createdAt: serverTimestamp(),
    }
  );

} else {

  await addDoc(
    collection(
      db,
      "chats",
      chatId,
      "messages"
    ),
    {
      type: "video",

      videoId,
      videoUrl,
      thumbnail,

      senderId: me.uid,
      receiverId: uid,

      userId:
        videoData.userId || "",

      username:
        videoData.username || "",

      profile:
        videoData.profile || "",

      caption:
        videoData.caption || "",

      likes:
        videoData.likes || 0,

      commentsCount:
        videoData.commentsCount || 0,

      shares:
        videoData.shares || 0,

      views:
        videoData.views || 0,

      createdAt:
        serverTimestamp(),
    }
  );

}


   

await setDoc(
  doc(
    db,
    "userChats",
    uid,
    "friends",
    me.uid
  ),
  {
    userId: me.uid,

    username:
      senderData?.username || "",

    profileImg:
      senderData?.profileImg || "",

    lastMessage: "🎥 Video",

    updatedAt:
      serverTimestamp(),
  },
  { merge: true }
);



await setDoc(
  doc(
    db,
    "userChats",
    me.uid,
    "friends",
    uid
  ),
  {
    userId: uid,

    username:
      receiverData?.username || "",

    profileImg:
      receiverData?.profileImg || "",

    lastMessage: "🎥 Video",

    updatedAt:
      serverTimestamp(),
  },
  { merge: true }
);



        }

        Alert.alert(
          "Success",
          "Video Sent"
        );

        router.back();

      } catch (e) {

        console.log(e);

      }
    };

  const filtered =
    friends.filter(
      item =>
        item.username
          ?.toLowerCase()
          .includes(
            search
            .toLowerCase()
          )
    );

  const renderItem =
    ({ item }) => (

      <TouchableOpacity
        style={styles.row}
        onPress={() =>
          selectUser(
            item.friendId
          )
        }
      >

        <Image
          source={{
            uri:
              item.profile ||
              'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
          }}
          style={
            styles.profile
          }
        />

        <Text
          style={
            styles.name
          }
        >
          @{item.username}
        </Text>

        <View
          style={[
            styles.circle,

            selectedUsers
              .includes(
                item.friendId
              )
              &&
              styles.selected
          ]}
        >

          {
            selectedUsers
            .includes(
              item.friendId
            ) && (

              <Ionicons
                name="checkmark"
                size={18}
                color="#fff"
              />

            )
          }

        </View>

      </TouchableOpacity>
    );

  return (

    <View
      style={
        styles.container
      }
    >

      {/* Search */}

      <View
        style={
          styles.searchBox
        }
      >

        <Ionicons
          name="search"
          size={30}
          color="#000"
        />

        <TextInput
          value={search}
          onChangeText={
            setSearch
          }
          placeholder="Search"
          style={
            styles.input
          }
        />

      </View>

      {/* Friend List */}

      <FlatList
        data={filtered}
        renderItem={
          renderItem
        }
        keyExtractor={
          item =>
            item.id
        }
      />

      {/* Send */}

      {
        selectedUsers
          .length > 0 && (

          <TouchableOpacity
            style={
              styles.sendBtn
            }
            onPress={
              sendVideo
            }
          >

            <Text
              style={{
                color:
                  '#000',
                fontWeight:
                  'bold',
              }}
            >
              Send (
              {
                selectedUsers
                  .length
              }
              )
            </Text>

          </TouchableOpacity>

        )
      }

    </View>
  );
}

const styles =
  StyleSheet.create({

container:{
flex:1,
backgroundColor:'#000',
paddingTop:60,
},

searchBox:{
flexDirection:'row',
alignItems:'center',
backgroundColor:'#fff',
marginHorizontal:20,
paddingHorizontal:10,
borderRadius:5,
height:50,
},

input:{
flex:1,
fontSize:18,
marginLeft:10,
},

row:{
flexDirection:'row',
alignItems:'center',
padding:25,
},

profile:{
width:50,
height:50,
borderRadius:25,
},

name:{
color:'#fff',
fontSize:15,
fontWeight:'600',
marginLeft:12,
flex:1,
},

circle:{
width:26,
height:26,
borderRadius:13,
borderWidth:2,
borderColor:'#fff',
justifyContent:'center',
alignItems:'center',
},

selected:{
backgroundColor:'#FFD700',
borderColor:'#FFD700',
},

sendBtn:{
position:'absolute',
bottom:50,
left:20,
right:20,
height:50,
backgroundColor:'#FFD700',
justifyContent:'center',
alignItems:'center',
borderRadius:30,
},

});