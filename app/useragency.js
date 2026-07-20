import React, { useEffect, useState } from "react";


import {
View,
Text,
StyleSheet,
TouchableOpacity,
Image,
TextInput,
Alert,
ScrollView,
Modal,
FlatList,
ActivityIndicator,
} from "react-native";

import { auth, db } from "./firebaseConfig";

import {
doc,
getDoc,
updateDoc,
collection,
query,
where,
getDocs,
increment,
} from "firebase/firestore";



import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";


export default function Agency(){

const [agency,setAgency]=useState(null);

const [hosts,setHosts]=useState([]);

const [loading, setLoading] = useState(true);


const getLevelTheme = (level) => {

  if(level>=50){
    return{
      bg:"#7B1FFF",
      border:"#FFD700",
      text:"#fff",
      icon:"#FFD700"
    };
  }

  if(level>=40){
    return{
      bg:"#00BFFF",
      border:"#9EF8FF",
      text:"#fff",
      icon:"#fff"
    };
  }

  if(level>=30){
    return{
      bg:"#FF0066",
      border:"#FFB6C1",
      text:"#fff",
      icon:"#fff"
    };
  }

  if(level>=20){
    return{
      bg:"#FFC107",
      border:"#FFE082",
      text:"#000",
      icon:"#fff"
    };
  }

  if(level>=10){
    return{
      bg:"#BDBDBD",
      border:"#fff",
      text:"#fff",
      icon:"#fff"
    };
  }

  return{
    bg:"#222",
    border:"#555",
    text:"#FFD700",
    icon:"#00E5FF"
  };

};



useEffect(()=>{

loadAgency();

},[]);










const loadAgency = async () => {

  try {

setLoading(true);

    const uid = auth.currentUser.uid;

    // User document
    const userSnap = await getDoc(
      doc(db, "users", uid)
    );

    if (!userSnap.exists()) {
      return;
    }

    const userData = userSnap.data();

    // User kisi agency me join nahi hai
    if (!userData.agencyId) {
      return;
    }

    // Agency document
    const agencySnap = await getDoc(
      doc(db, "agencies", userData.agencyId)
    );

    if (!agencySnap.exists()) {
      return;
    }


console.log("Agency Data:", agencySnap.data());


setAgency({
  id: agencySnap.id,
  ...agencySnap.data(),
});

setLoading(false); // UI turant open hogi

loadHosts(userData.agencyId);

// Background me calculate hoga
calculateAgencyStars(userData.agencyId);


  } 
catch (e) {

  console.log(e);

  setLoading(false);

}


};



const loadHosts = async (agencyId) => {

const q = query(
collection(db,"users"),
where("agencyId","==",agencyId),
where("agencyHost","==",true)
);

const snap = await getDocs(q);





const arr = await Promise.all(

  snap.docs.map(async (docItem) => {

    const walletSnap = await getDoc(
      doc(db, "wallets", docItem.id)
    );

    return {
      id: docItem.id,
      ...docItem.data(),
      level: walletSnap.exists()
        ? walletSnap.data().level || 1
        : 1,
    };

  })

);

setHosts(arr);

};




const calculateAgencyStars = async (agencyId) => {

  try {

    const q = query(
      collection(db, "users"),
      where("agencyId", "==", agencyId)
    );

    const snap = await getDocs(q);

    let totalStars = 0;

    for (const userDoc of snap.docs) {

      const walletSnap = await getDoc(
        doc(db, "wallets", userDoc.id)
      );

      if (walletSnap.exists()) {

        totalStars +=
          walletSnap.data().receivedStars || 0;

      }

    }


await updateDoc(
  doc(db, "agencies", agencyId),
  {
    totalStars,
  }
);

    setAgency(prev => ({
      ...prev,
      totalStars,
    }));

await calculateAgencyRanking(agencyId);

  } catch (e) {

    console.log(e);

  }

};



const calculateAgencyRanking = async (agencyId) => {

  try {

    const snap = await getDocs(
      collection(db, "agencies")
    );

    let agencies = [];

    snap.forEach((docItem) => {

      agencies.push({
        id: docItem.id,
        ...docItem.data(),
      });

    });

    // Stars ke hisab se sort
    agencies.sort((a, b) => {

      return (b.totalStars || 0) - (a.totalStars || 0);

    });

    // Apni agency ka index
    const rank =
      agencies.findIndex(
        item => item.id === agencyId
      ) + 1;

    setAgency(prev => ({
      ...prev,
      ranking: rank,
    }));

  } catch (e) {

    console.log(e);

  }

};


const updateAgencyName=async()=>{

if(newAgencyName===""){

Alert.alert("Enter Agency Name");

return;

}

await updateDoc(

doc(db,"agencies",agency.id),

{

agencyName:newAgencyName

}

);

setAgency({

...agency,

agencyName:newAgencyName

});

Alert.alert("Agency Updated");

};


if (!agency) {
  return null;
}


if (loading) {

  return (

    <View
      style={{
        flex: 1,
        backgroundColor: "#000",
        justifyContent: "center",
        alignItems: "center",
      }}
    >

      <ActivityIndicator
        size="large"
        color="#FFD700"
      />

    </View>

  );

}






const addHost = async () => {

  try {

    if (hostUsername.trim() === "") {
      Alert.alert("Enter Host Username");
      return;
    }

    // Username se user dhundo
    const userQuery = query(
      collection(db, "users"),
      where("username", "==", hostUsername.trim())
    );

    const userSnap = await getDocs(userQuery);

    if (userSnap.empty) {
      Alert.alert("User Not Found");
      return;
    }

    const userDoc = userSnap.docs[0];

    // Agar user pehle se kisi agency me hai
    if (userDoc.data().agencyId) {
      Alert.alert("This user is already in an agency");
      return;
    }

    // User update
    await updateDoc(userDoc.ref, {
      agencyId: agency.id,
      agencyName: agency.agencyName,
      agencyHost: true,
    });

    // Agency member +1
    await updateDoc(
      doc(db, "agencies", agency.id),
      {
        totalMembers: increment(1),
      }
    );

    // Screen refresh
    loadAgency();

loadHosts(agency.id);

    setHostUsername("");

    setHostVisible(false);

    Alert.alert("Success", "Host Added Successfully");

  } catch (error) {

    console.log(error);

    Alert.alert("Error", error.message);

  }

};



console.log("Agency Logo:", agency?.logo);


return(

<View style={{flex:1}}>

<ScrollView style={styles.container}>

<Image
source={{uri:agency.logo}}
style={styles.logo}
/>

<Text style={styles.name}>
{agency.agencyName}
</Text>

<View style={styles.statsRow}>

<View style={styles.statBox}>
<Text style={styles.statNumber}>
#{agency.ranking || 0}
</Text>

<Text style={styles.statTitle}>
Ranking
</Text>
</View>

<View style={styles.statBox}>
<Text style={styles.statNumber}>
{agency.totalMembers || 0}
</Text>

<Text style={styles.statTitle}>
Members
</Text>
</View>

<View style={styles.statBox}>
<Text style={styles.statNumber}>
⭐ {agency.totalStars || 0}
</Text>

<Text style={styles.statTitle}>
Stars
</Text>
</View>

</View>







<Text
style={{
color:"#FFD700",
fontSize:20,
fontWeight:"bold",
marginTop:30,
marginBottom:15,
}}
>

Agency Hosts

</Text>

<FlatList

data={hosts}

scrollEnabled={false}

keyExtractor={(item)=>item.id}

renderItem={({item})=>(



<View style={styles.hostCard}>

<Image
source={{
uri:
item.profileImg ||
"https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
}}
style={styles.hostImage}
/>

<View
style={{
flex:1,
marginLeft:15,
justifyContent:"center",
}}
>

<View
  style={{
    flexDirection: "row",
    alignItems: "center",
  }}
>

  <Text style={styles.hostName}>
    {item.username}
  </Text>

  {item.verified && (

    <View
      style={{
        marginLeft: 5,
        width: 18,
        height: 18,
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
      }}
    >

      <MaterialCommunityIcons
        name="check-decagram"
        size={18}
        color="#ffffff"
      />

      <Ionicons
        name="checkmark"
        size={10}
        color="#131212"
        style={{
          position: "absolute",
          top: 4.5,
          left: 4.2,
        }}
      />

    </View>

  )}




<View
  style={{
    marginLeft:8,
    backgroundColor:getLevelTheme(item.level).bg,
    borderColor:getLevelTheme(item.level).border,
    borderWidth:1,
    borderRadius:18,
    paddingHorizontal:10,
    paddingVertical:4,
    flexDirection:"row",
    alignItems:"center",
  }}
>

  <MaterialCommunityIcons
    name="diamond-stone"
    size={13}
    color={getLevelTheme(item.level).icon}
  />

  <Text
    style={{
      color:getLevelTheme(item.level).text,
      fontWeight:"bold",
      marginLeft:4,
      fontSize:12,
    }}
  >
    LV {item.level}
  </Text>

</View>





</View>

</View>



</View>




)}

/>



</ScrollView>

{/* Edit Popup */}


{/* Add Host Popup */}


</View>

);


}

const styles=StyleSheet.create({

container:{
flex:1,
backgroundColor:"#111",
padding:20,
},

center:{
flex:1,
justifyContent:"center",
alignItems:"center",
backgroundColor:"#111"
},

text:{
color:"#fff",
fontSize:22
},

logo:{
width:120,
height:120,
borderRadius:60,
alignSelf:"center",
marginBottom:20
},

name:{
color:"#fff",
fontSize:26,
fontWeight:"bold",
textAlign:"center"
},

info:{
color:"#ccc",
marginTop:10,
fontSize:17
},

input:{
backgroundColor:"#222",
color:"#fff",
padding:15,
borderRadius:12,
marginTop:25
},

btn:{
backgroundColor:"#FFD700",
padding:15,
borderRadius:12,
marginTop:15
},

btnText:{
color:"#000",
fontWeight:"bold",
textAlign:"center"
},

statsRow:{
flexDirection:"row",
justifyContent:"space-between",
marginTop:25,
marginBottom:25,
},

statBox:{
flex:1,
alignItems:"center",
backgroundColor:"#1b1b1b",
paddingVertical:5,
borderRadius:4,
marginHorizontal:1,
},

statNumber:{
fontSize:15,
fontWeight:"bold",
color:"#FFD700",
},

statTitle:{
marginTop:0,
fontSize:14,
color:"#fff",
},

buttonRow:{
flexDirection:"row",
justifyContent:"space-between",
marginTop:25,
},

actionBtn:{
flex:1,
backgroundColor:"#FFD700",
padding:14,
borderRadius:10,
marginHorizontal:5,
},



popupTitle:{
fontSize:20,
fontWeight:"bold",
color:"#FFD700",
textAlign:"center",
marginBottom:10,
},

modalBg:{
flex:1,
backgroundColor:"rgba(0,0,0,0.7)",
justifyContent:"center",
alignItems:"center",
},

popup:{
width:"90%",
backgroundColor:"#1b1b1b",
padding:25,
borderRadius:20,
maxHeight:"85%",
},

hostCard:{

flexDirection:"row",

alignItems:"center",

backgroundColor:"#222",

padding:10,

marginBottom:8,

borderRadius:10,

},

hostImage:{

width:40,

height:40,

borderRadius:20,

},

hostName:{

color:"#fff",

fontSize:18,

fontWeight:"bold",

},

removeBtn:{
backgroundColor:"#ff3b30",
paddingHorizontal:15,
paddingVertical:8,
borderRadius:8,
},

removeText:{
color:"#fff",
fontWeight:"bold",
fontSize:15,
},


});