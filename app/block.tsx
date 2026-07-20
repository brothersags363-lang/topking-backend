import React, { useEffect, useState } from "react";

import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Alert,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { useRouter } from "expo-router";

import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";

import { auth, db } from "./firebaseConfig";

export default function BlockScreen() {

  const router = useRouter();

  const [users,setUsers]=useState([]);

  useEffect(()=>{
    loadBlockedUsers();
  },[]);

  const loadBlockedUsers=async()=>{

    const uid=auth.currentUser.uid;

    const q=query(
      collection(db,"blockedUsers"),
      where("blockerId","==",uid)
    );

    const snap=await getDocs(q);

    let arr=[];

    snap.forEach(docSnap=>{

      arr.push({
        id:docSnap.id,
        ...docSnap.data()
      });

    });

    setUsers(arr);

  };

  const unblockUser=(item)=>{

    Alert.alert(
      "Unblock",
      "Do you want to unblock this user?",
      [
        {
          text:"Cancel"
        },
        {
          text:"Yes",
          onPress:async()=>{

           await deleteDoc(
  doc(db,"blockedUsers",item.id)
);

            loadBlockedUsers();

          }
        }
      ]
    );

  };

  return(

    <SafeAreaView
      style={{
        flex:1,
        backgroundColor:"#000"
      }}
    >

      <View
        style={{
          flexDirection:"row",
          alignItems:"center",
          padding:15,
        }}
      >

        <TouchableOpacity
          onPress={()=>router.back()}
        >
          <Ionicons
            name="arrow-back"
            size={28}
            color="#fff"
          />
        </TouchableOpacity>

        <Text
          style={{
            color:"#fff",
            fontSize:22,
            marginLeft:15,
            fontWeight:"bold"
          }}
        >
          Blocked Users
        </Text>

      </View>

      <FlatList

        data={users}

        keyExtractor={(item)=>item.id}

        ListEmptyComponent={()=>

          <View
            style={{
              alignItems:"center",
              marginTop:100
            }}
          >
            <Text
              style={{
                color:"#888",
                fontSize:18
              }}
            >
              No Blocked Users
            </Text>
          </View>

        }

        renderItem={({item})=>(

          <View
            style={{
              flexDirection:"row",
              justifyContent:"space-between",
              alignItems:"center",
              padding:15,
            }}
          >

            <View
              style={{
                flexDirection:"row",
                alignItems:"center"
              }}
            >

              <Image
                source={{
                  uri:item.profileImg
                }}
                style={{
                  width:55,
                  height:55,
                  borderRadius:30
                }}
              />

              <Text
                style={{
                  color:"#fff",
                  marginLeft:12,
                  fontSize:16
                }}
              >
                @{item.username}
              </Text>

            </View>

            <TouchableOpacity

              onPress={()=>
                unblockUser(item)
              }

              style={{
                backgroundColor:"#FFD700",
                paddingHorizontal:18,
                paddingVertical:8,
                borderRadius:20
              }}
            >

              <Text
                style={{
                  color:"#000",
                  fontWeight:"bold"
                }}
              >
                Unblock
              </Text>

            </TouchableOpacity>

          </View>

        )}

      />

    </SafeAreaView>

  );

}