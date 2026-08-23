import React, { useEffect, useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from "react-native";

import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  increment,
} from "firebase/firestore";

import { auth, db } from "./firebaseConfig";

export default function AgencyRequest() {

  const [requests, setRequests] = useState([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {

    const q = query(
      collection(db, "agencyHostRequests"),
      where("userId", "==", auth.currentUser.uid),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {

      let arr = [];

      snapshot.forEach((doc) => {

        arr.push({
          id: doc.id,
          ...doc.data(),
        });

      });

      setRequests(arr);

      setLoading(false);

    });

    return () => unsubscribe();

  }, []);


const joinAgency = async (item) => {

  try {

    // User Update
    await updateDoc(
      doc(db, "users", auth.currentUser.uid),
      {
        agencyId: item.agencyId,
        agencyName: item.agencyName,
        agencyHost: true,
      }
    );

    // Agency Members +1
    await updateDoc(
      doc(db, "agencies", item.agencyId),
      {
        totalMembers: increment(1),
      }
    );

    // Request Accepted
    await updateDoc(
      doc(db, "agencyHostRequests", item.id),
      {
        status: "accepted",
      }
    );

    Alert.alert(
      "Success",
      "You joined the agency."
    );

  } catch (e) {

    Alert.alert("Error", e.message);

  }

};



const rejectAgency = async (item) => {

  try {

    await updateDoc(
      doc(db, "agencyHostRequests", item.id),
      {
        status: "rejected",
      }
    );

    Alert.alert(
      "Rejected",
      "Agency request rejected."
    );

  } catch (e) {

    Alert.alert("Error", e.message);

  }

};



  if (loading) {

    return (

      <View style={styles.center}>

        <ActivityIndicator
          size="large"
          color="#FFD700"
        />

      </View>

    );

  }

  if (requests.length === 0) {

    return (

      <View style={styles.center}>

        <Text
          style={{
            color: "white",
            fontSize: 18,
            fontWeight: "bold",
          }}
        >
          No Agency Requests
        </Text>

      </View>

    );

  }

  return (

    <SafeAreaView style={styles.container}>

      <Text style={styles.heading}>
        Agency Join Requests
      </Text>

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (

          <View style={styles.card}>

            <Image
    source={{
        uri:
        item.agencyLogo ||
        "https://cdn-icons-png.flaticon.com/512/149/149071.png"
    }}
    style={styles.logo}
/>

            <View style={{ flex: 1 }}>

              <Text style={styles.agencyName}>
                {item.agencyName}
              </Text>

              <Text style={styles.owner}>
                Owner : {item.ownerName || "Agency Owner"}
              </Text>

              <Text style={styles.status}>
                Status : Pending
              </Text>

            </View>

            
<View
  style={{
    marginTop:15,
    flexDirection:"row",
  }}
>

<TouchableOpacity

style={styles.joinBtn}

onPress={() => joinAgency(item)}

>

<Text style={styles.joinText}>

Join

</Text>

</TouchableOpacity>

<TouchableOpacity

style={styles.rejectBtn}

onPress={() => rejectAgency(item)}

>

<Text style={styles.rejectText}>

Reject

</Text>

</TouchableOpacity>

</View>



          </View>

        )}
      />

    </SafeAreaView>

  );

}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#111",
    padding: 15,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111",
  },

  heading: {
    color: "#FFD700",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },

  card: {
    backgroundColor: "#1e1e1e",
    borderRadius: 15,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },

  logo: {
    width: 65,
    height: 65,
    borderRadius: 35,
    marginRight: 15,
  },

  agencyName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },

  owner: {
    color: "#bbb",
    marginTop: 4,
  },

  status: {
    color: "#FFD700",
    marginTop: 5,
    fontWeight: "bold",
  },

joinBtn:{

backgroundColor:"#00C853",

paddingVertical:10,

paddingHorizontal:25,

borderRadius:10,

marginRight:10,

},

joinText:{

color:"#fff",

fontWeight:"bold",

},

rejectBtn:{

backgroundColor:"#E53935",

paddingVertical:10,

paddingHorizontal:20,

borderRadius:10,

},

rejectText:{

color:"#fff",

fontWeight:"bold",

},


});