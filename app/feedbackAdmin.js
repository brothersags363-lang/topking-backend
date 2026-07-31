import React, { useEffect, useState } from "react";

import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  TextInput,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { useRouter } from "expo-router";

import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
} from "firebase/firestore";

import { db } from "./firebaseConfig";

export default function FeedbackAdmin() {

  const router = useRouter();

  const [feedbacks, setFeedbacks] = useState([]);

  const [loading, setLoading] = useState(true);

const [replyText, setReplyText] = useState({});

  useEffect(() => {

    const q = query(
      collection(db, "feedbacks"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {

      let arr = [];

      snapshot.forEach((docItem) => {

        arr.push({

          id: docItem.id,

          ...docItem.data(),

        });

      });

      setFeedbacks(arr);

      setLoading(false);

    });

    return () => unsubscribe();

  }, []);


const sendReply = async (feedbackId) => {

  const text = replyText[feedbackId];

  if (!text?.trim()) return;

  try {

    await updateDoc(
      doc(db, "feedbacks", feedbackId),
      {
        reply: text.trim(),
        status: "Replied",
      }
    );

    setReplyText((prev) => ({
      ...prev,
      [feedbackId]: "",
    }));

  } catch (error) {

    console.log(error);

  }

};



  if (loading) {

    return (

      <View style={styles.loader}>

        <ActivityIndicator
          size="large"
          color="#FFD700"
        />

      </View>

    );

  }

  return (

    <SafeAreaView style={styles.container}>

      <StatusBar
        backgroundColor="#000"
        barStyle="light-content"
      />

      <View style={styles.header}>

        <TouchableOpacity
          onPress={() => router.back()}
        >
          <Ionicons
            name="arrow-back"
            size={28}
            color="#FFD700"
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          User Feedback
        </Text>

        <View style={{width:28}} />

      </View>

      <FlatList

        data={feedbacks}

        keyExtractor={(item)=>item.id}

        contentContainerStyle={{
          padding:15,
        }}

        renderItem={({item})=>(

          <View style={styles.card}>

            <Text style={styles.email}>
              {item.email}
            </Text>

            <Text style={styles.subject}>
              {item.subject}
            </Text>

            <Text style={styles.feedback}>
              {item.feedback}
            </Text>

            <View style={styles.statusBox}>

              <Text style={styles.statusText}>

                Status :

              </Text>

              <Text
                style={{
                  color:
                    item.status==="Pending"
                    ? "#ff4444"
                    : "#00ff66",

                  fontWeight:"bold",
                }}
              >

                {item.status}

              </Text>

            </View>

<TextInput
  placeholder="Write Reply..."
  placeholderTextColor="#666"
  value={replyText[item.id] || ""}
  onChangeText={(text) =>
    setReplyText((prev) => ({
      ...prev,
      [item.id]: text,
    }))
  }
  style={styles.replyInput}
/>

<TouchableOpacity
  style={styles.replyBtn}
  onPress={() => sendReply(item.id)}
>

  <Text style={styles.replyBtnText}>
    Send Reply
  </Text>

</TouchableOpacity>


          </View>

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

  loader:{
    flex:1,
    backgroundColor:"#000",
    justifyContent:"center",
    alignItems:"center",
  },

  header:{
    height:60,
    flexDirection:"row",
    alignItems:"center",
    justifyContent:"space-between",
    paddingHorizontal:15,
    borderBottomWidth:1,
    borderBottomColor:"#222",
  },

  headerTitle:{
    color:"#fff",
    fontSize:20,
    fontWeight:"bold",
  },

  card:{
    backgroundColor:"#111",
    borderRadius:12,
    padding:15,
    marginBottom:15,
    borderWidth:1,
    borderColor:"#222",
  },

  email:{
    color:"#FFD700",
    fontSize:14,
    fontWeight:"bold",
  },

  subject:{
    color:"#fff",
    fontSize:17,
    fontWeight:"bold",
    marginTop:10,
  },

  feedback:{
    color:"#ccc",
    marginTop:10,
    fontSize:15,
    lineHeight:22,
  },

  statusBox:{
    flexDirection:"row",
    marginTop:15,
  },

  statusText:{
    color:"#fff",
    marginRight:8,
    fontWeight:"bold",
  },

replyInput:{

backgroundColor:"#222",

color:"#fff",

borderRadius:10,

paddingHorizontal:12,

height:45,

marginTop:15,

},

replyBtn:{

backgroundColor:"#FFD700",

height:45,

justifyContent:"center",

alignItems:"center",

borderRadius:10,

marginTop:12,

},

replyBtnText:{

color:"#000",

fontWeight:"bold",

fontSize:16,

},


});