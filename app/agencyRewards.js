import React, { useEffect, useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";

import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "./firebaseConfig";

import { Ionicons } from "@expo/vector-icons";

export default function AgencyRewards() {

  const [loading, setLoading] = useState(true);

  const [agencies, setAgencies] = useState([]);

  useEffect(() => {

    const unsubscribe = onSnapshot(

      collection(db, "agencyMonthlyTarget"),

      (snapshot) => {

        let arr = [];

        snapshot.forEach((item) => {

          const data = item.data();

          let reward = 0;

          if ((data.totalStars || 0) >= 600000) {

            reward = 6500;

          }

          else if ((data.totalStars || 0) >= 300000) {

            reward = 3000;

          }

          arr.push({

            id: item.id,

            ...data,

            reward,

          });

        });

        arr.sort((a, b) => {

          return (b.totalStars || 0) - (a.totalStars || 0);

        });

        setAgencies(arr);

        setLoading(false);

      }

    );

    return () => unsubscribe();

  }, []);

const payReward = async (item) => {

  try {

    await updateDoc(

      doc(db, "agencyMonthlyTarget", item.id),

      {

        rewardStatus: "Paid",

        paidAt: serverTimestamp(),

      }

    );

    Alert.alert(

      "Success",

      "Reward Paid Successfully"

    );

  }

  catch (e) {

    console.log(e);

    Alert.alert("Error", e.message);

  }

};

if (loading) {

  return (

    <View
      style={styles.loader}
    >

      <ActivityIndicator
        size="large"
        color="#FFD700"
      />

    </View>

  );

}

return (

<View style={styles.container}>

<Text style={styles.title}>
Agency Rewards
</Text>

<FlatList

data={agencies}

keyExtractor={(item)=>item.id}

contentContainerStyle={{
paddingBottom:40
}}

renderItem={({item})=>{

return(

<View style={styles.card}>

<View
style={{
flexDirection:"row",
justifyContent:"space-between",
alignItems:"center"
}}
>

<View style={{flex:1}}>

<Text style={styles.agencyName}>
{item.agencyName}
</Text>

<Text style={styles.month}>
{item.month}
</Text>

</View>

<View
style={{
backgroundColor:"#FFD700",
paddingHorizontal:12,
paddingVertical:5,
borderRadius:20
}}
>

<Text
style={{
fontWeight:"bold",
color:"#000"
}}
>

#{agencies.findIndex(x=>x.id===item.id)+1}

</Text>

</View>

</View>

<View style={styles.line}/>

<Text style={styles.label}>
Monthly Stars
</Text>

<Text style={styles.value}>
⭐ {item.totalStars || 0}
</Text>

<Text style={styles.label}>
Reward
</Text>

<Text
style={{
fontSize:24,
fontWeight:"bold",
color:
item.reward>0
?"#00ff66"
:"#ff4444"
}}
>

{item.reward>0
?`₹${item.reward}`
:"Not Eligible"}

</Text>

<Text style={styles.label}>
Status
</Text>

<Text
style={{
fontSize:18,
fontWeight:"bold",
color:
item.rewardStatus==="Paid"
?"#00ff66"
:"#FFD700"
}}
>

{item.rewardStatus || "Pending"}

</Text>

{
item.reward>0 &&
item.rewardStatus!=="Paid"
&&(

<TouchableOpacity

style={styles.payBtn}

onPress={()=>payReward(item)}

>

<Ionicons
name="cash"
size={20}
color="#000"
/>

<Text style={styles.payText}>
Pay Reward
</Text>

</TouchableOpacity>

)

}

{

item.rewardStatus==="Paid"

&&

(

<View
style={styles.paidBox}
>

<Ionicons
name="checkmark-circle"
size={24}
color="#00ff66"
/>

<Text style={styles.paidText}>
Reward Paid
</Text>

</View>

)

}

</View>

);

}}

/>

</View>

);

}

const styles = StyleSheet.create({

container:{
flex:1,
backgroundColor:"#000",
padding:15,
},

loader:{
flex:1,
backgroundColor:"#000",
justifyContent:"center",
alignItems:"center",
},

title:{
fontSize:28,
fontWeight:"bold",
color:"#FFD700",
marginBottom:20,
marginTop:10,
textAlign:"center",
},

card:{
backgroundColor:"#111",
borderRadius:15,
padding:15,
marginBottom:18,
borderWidth:1,
borderColor:"#333",
},

agencyName:{
fontSize:22,
fontWeight:"bold",
color:"#fff",
},

month:{
fontSize:14,
color:"#999",
marginTop:3,
},

line:{
height:1,
backgroundColor:"#333",
marginVertical:15,
},

label:{
fontSize:14,
color:"#888",
marginTop:8,
},

value:{
fontSize:20,
fontWeight:"bold",
color:"#FFD700",
marginTop:3,
},

payBtn:{
marginTop:20,
backgroundColor:"#FFD700",
paddingVertical:12,
borderRadius:10,
flexDirection:"row",
justifyContent:"center",
alignItems:"center",
},

payText:{
marginLeft:8,
fontWeight:"bold",
fontSize:17,
color:"#000",
},

paidBox:{
marginTop:20,
flexDirection:"row",
justifyContent:"center",
alignItems:"center",
},

paidText:{
marginLeft:8,
fontSize:18,
fontWeight:"bold",
color:"#00ff66",
},

});