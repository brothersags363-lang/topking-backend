import React, { useState, useEffect } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  StatusBar,
    ScrollView,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { db, auth } from "./firebaseConfig";

import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";

export default function FeedbackScreen() {

  const router = useRouter();

  const [subject, setSubject] = useState("");

  const [feedback, setFeedback] = useState("");

  const [loading, setLoading] = useState(false);

const [myFeedbacks, setMyFeedbacks] = useState([]);


useEffect(() => {

  const user = auth.currentUser;

  if (!user) return;

  const q = query(
    collection(db, "feedbacks"),
    where("uid", "==", user.uid)
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {

      let arr = [];

      snapshot.forEach((docItem) => {

        arr.push({
          id: docItem.id,
          ...docItem.data(),
        });

      });

      arr.sort((a, b) => {

        const aTime =
          a.createdAt?.seconds || 0;

        const bTime =
          b.createdAt?.seconds || 0;

        return bTime - aTime;

      });

      setMyFeedbacks(arr);

    }
  );

  return () => unsubscribe();

}, []);



  const sendFeedback = async () => {

    if (!subject.trim()) {

      Alert.alert(
        "Error",
        "Please enter subject."
      );

      return;
    }

    if (!feedback.trim()) {

      Alert.alert(
        "Error",
        "Please enter feedback."
      );

      return;
    }

    try {

      setLoading(true);

      const user = auth.currentUser;

      await addDoc(
        collection(db, "feedbacks"),
        {
          uid: user?.uid || "",

          email: user?.email || "",

          subject: subject.trim(),

          feedback: feedback.trim(),

          status: "Pending",

          reply: "",

          createdAt: serverTimestamp(),
        }
      );

      setSubject("");

      setFeedback("");

      Alert.alert(
        "Success",
        "Feedback sent successfully."
      );

    } catch (error) {

      console.log(error);

      Alert.alert(
        "Error",
        "Feedback send failed."
      );

    } finally {

      setLoading(false);

    }

  };

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
          Feedback
        </Text>

        <View style={{ width: 28 }} />

      </View>

      
<ScrollView
  style={styles.content}
  showsVerticalScrollIndicator={false}
>


        <Text style={styles.label}>
          Subject
        </Text>

        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="Feedback Subject"
          placeholderTextColor="#666"
          style={styles.input}
        />

        <Text style={styles.label}>
          Your Feedback
        </Text>

        <TextInput
          value={feedback}
          onChangeText={setFeedback}
          placeholder="Write your feedback..."
          placeholderTextColor="#666"
          multiline
          textAlignVertical="top"
          style={styles.textArea}
        />

        <TouchableOpacity
          style={styles.button}
          onPress={sendFeedback}
          disabled={loading}
        >

          {loading ? (

            <ActivityIndicator color="#000" />

          ) : (

            <Text style={styles.buttonText}>
              Send Feedback
            </Text>

          )}

        </TouchableOpacity>


<Text
  style={{
    color: "#FFD700",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 35,
    marginBottom: 15,
  }}
>
  My Feedback
</Text>

{myFeedbacks.map((item) => (

  <View
    key={item.id}
    style={{
      backgroundColor: "#111",
      borderRadius: 15,
      padding: 15,
      marginBottom: 15,
      borderWidth: 1,
      borderColor: "#333",
    }}
  >

    <Text
      style={{
        color: "#FFD700",
        fontWeight: "bold",
        fontSize: 16,
      }}
    >
      {item.subject}
    </Text>

    <Text
      style={{
        color: "#fff",
        marginTop: 8,
        fontSize: 15,
      }}
    >
      {item.feedback}
    </Text>

    <Text
      style={{
        marginTop: 10,
        color:
          item.status === "Pending"
            ? "#ff4444"
            : "#00ff66",
        fontWeight: "bold",
      }}
    >
      Status : {item.status}
    </Text>

    {item.reply !== "" && (

      <View
        style={{
          marginTop: 12,
          backgroundColor: "#1c1c1c",
          padding: 10,
          borderRadius: 10,
        }}
      >

        <Text
          style={{
            color: "#FFD700",
            fontWeight: "bold",
            marginBottom: 5,
          }}
        >
          Admin Reply
        </Text>

        <Text
          style={{
            color: "#fff",
          }}
        >
          {item.reply}
        </Text>

      </View>

    )}

  </View>

))}


      </ScrollView>

    </SafeAreaView>

  );

}


const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  header: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },

  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },

  content: {
    padding: 20,
  },

  label: {
    color: "#FFD700",
    fontSize: 15,
    marginBottom: 8,
    marginTop: 15,
    fontWeight: "bold",
  },

  input: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 12,
    color: "#fff",
    paddingHorizontal: 15,
    height: 55,
    fontSize: 16,
  },

  textArea: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 12,
    color: "#fff",
    padding: 15,
    height: 180,
    fontSize: 16,
  },

  button: {
    backgroundColor: "#FFD700",
    height: 55,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 35,
  },

  buttonText: {
    color: "#000",
    fontWeight: "bold",
    fontSize: 17,
  },

});
