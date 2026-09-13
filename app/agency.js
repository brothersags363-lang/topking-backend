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
 BackHandler,
} from "react-native";

import { auth, db } from "./firebaseConfig";

import { useRouter } from "expo-router";

import {
doc,
getDoc,
updateDoc,
collection,
query,
where,
getDocs,
increment,
setDoc,
serverTimestamp,
} from "firebase/firestore";

import * as ImagePicker from "expo-image-picker";

import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";


export default function Agency(){

  const router = useRouter();

  // =========================
  // MOBILE HARDWARE BACK
  // =========================

  useEffect(() => {

    const backAction = () => {

      router.back();

      return true;

    };


    const subscription =
      BackHandler.addEventListener(
        "hardwareBackPress",
        backAction
      );


    return () => {
      subscription.remove();
    };

  }, [router]);


  const [agency,setAgency]=useState(null);

const [hostUsername,setHostUsername]=useState("");

const [newAgencyName,setNewAgencyName]=useState("");

const [editVisible,setEditVisible]=useState(false);

const [hostVisible,setHostVisible]=useState(false);

const [newLogo,setNewLogo]=useState("");

const [hosts,setHosts]=useState([]);


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






const pickLogo=async()=>{

const result=await ImagePicker.launchImageLibraryAsync({

mediaTypes:["images"],

allowsEditing:true,

aspect:[1,1],

quality:0.8,

});

if(!result.canceled){

setNewLogo(result.assets[0].uri);

}

};



const loadAgency=async()=>{

const uid=auth.currentUser.uid;

const q=query(
collection(db,"agencies"),
where("ownerUserId","==",uid)
);

const snap=await getDocs(q);

if(snap.empty){

return;

}

const data=snap.docs[0];

const agencyData = data.data();

setAgency({
  id: data.id,
  ...agencyData,
  logo: agencyData.logo || agencyData.agencyLogo || "",
});

loadHosts(data.id);

calculateAgencyStars(data.id);

};



const loadHosts = async (agencyId) => {

const q = query(
collection(db,"users"),
where("agencyId","==",agencyId),
where("agencyHost","==",true)
);

const snap = await getDocs(q);

let arr=[];



for (const docItem of snap.docs) {

  const walletSnap = await getDoc(
    doc(db, "wallets", docItem.id)
  );

  arr.push({
    id: docItem.id,
    ...docItem.data(),
    level: walletSnap.exists()
      ? walletSnap.data().level || 1
      : 1,
verifiedColor:
    docItem.data().verifiedColor || "white",

  });

}


setHosts(arr);

};


const calculateAgencyStars = async (agencyId) => {

  try {

    const usersQuery = query(
      collection(db, "users"),
      where("agencyId", "==", agencyId)
    );

    const usersSnap = await getDocs(usersQuery);

    let totalStars = 0;

    for (const userDoc of usersSnap.docs) {

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
    monthlyStars: totalStars,
  }
);


const now = new Date();

const month =
`${now.getFullYear()}-${now.getMonth()+1}`;

if (totalStars >= 300000) {

  const notifyRef = doc(
    db,
    "agencyNotifications",
    agencyId + "_" + month
  );

  const notifySnap =
    await getDoc(notifyRef);

  if (!notifySnap.exists()) {

    await setDoc(
      notifyRef,
      {
        agencyId,
        agencyName: agency?.agencyName || "",
        ownerUserId: agency.ownerUserId,
        stars: totalStars,
        month,
        status: "pending",
        createdAt:
          serverTimestamp(),
      }
    );

  }

}


    setAgency(prev => ({
      ...prev,
      totalStars,
    }));

calculateAgencyRanking();

  } catch (e) {

    console.log(e);

  }

};




const calculateAgencyRanking = async () => {

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

    agencies.sort((a, b) => {

      return (b.totalStars || 0) - (a.totalStars || 0);

    });

    const index = agencies.findIndex(
      item => item.id === agency?.id
    );

    if (index !== -1) {

      setAgency(prev => ({
        ...prev,
        ranking: index + 1,
      }));

    }

  } catch (e) {

    console.log(e);

  }

};



const saveAgencyChanges = async () => {
  try {
    const name = newAgencyName.trim();

    if (!name) {
      Alert.alert("Agency Name", "Please enter your agency name.");
      return;
    }

    if (!agency?.id) {
      Alert.alert("Error", "Agency not found.");
      return;
    }

    let logoUrl = agency.logo || agency.agencyLogo || "";

    if (newLogo && newLogo.startsWith("file://")) {
      const formData = new FormData();

      formData.append("file", {
        uri: newLogo,
        type: "image/jpeg",
        name: "agency_logo.jpg",
      });

      formData.append("upload_preset", "topking_upload");

      const response = await fetch(
        "https://api.cloudinary.com/v1_1/fzmrnrlz/image/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok || !data.secure_url) {
        console.log("AGENCY LOGO UPLOAD ERROR =", data);
        Alert.alert("Upload Failed", "Agency photo upload nahi ho paya.");
        return;
      }

      logoUrl = data.secure_url;
    }

    await updateDoc(doc(db, "agencies", agency.id), {
      agencyName: name,
      logo: logoUrl,
      agencyLogo: logoUrl,
    });

    setAgency((prev) => ({
      ...prev,
      agencyName: name,
      logo: logoUrl,
      agencyLogo: logoUrl,
    }));

    setNewAgencyName("");
    setNewLogo("");
    setEditVisible(false);

    Alert.alert("Success", "Agency details successfully updated.");
  } catch (e) {
    console.log("AGENCY SAVE ERROR =", e);
    Alert.alert("Error", e?.message || "Agency update nahi ho saki.");
  }
};

const openEditAgency = () => {
  setNewAgencyName(agency?.agencyName || "");
  setNewLogo("");
  setEditVisible(true);
};

if(!agency){

return(

<View style={styles.center}>

<Text style={styles.text}>
No Agency Found
</Text>

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
const requestQuery = query(
  collection(db, "agencyHostRequests"),
  where("agencyId", "==", agency.id),
  where("userId", "==", userDoc.id),
  where("status", "==", "pending")
);

const requestSnap = await getDocs(requestQuery);

if (!requestSnap.empty) {
  Alert.alert("Request already sent.");
  return;
}


    // Agar user pehle se kisi agency me hai
    if (userDoc.data().agencyId) {
      Alert.alert("This user is already in an agency");
      return;
    }

    // User update
   
await setDoc(
  doc(collection(db, "agencyHostRequests")),
  {
    agencyId: agency.id,

    agencyName: agency?.agencyName || "",

    agencyLogo: agency.logo || "",

    ownerUserId: agency.ownerUserId,

    ownerName: agency.ownerName || "",

    userId: userDoc.id,

    username: userDoc.data().username,

    profileImg: userDoc.data().profileImg || "",

    status: "pending",

    createdAt: serverTimestamp(),
  }
);



Alert.alert(
  "Success",
  "Host Request Sent Successfully"
);

setHostUsername("");
setHostVisible(false);

return;



  } catch (error) {

    console.log(error);

    Alert.alert("Error", error.message);

  }

};


const removeHost = async (host) => {

  try {

    await updateDoc(
      doc(db,"users",host.id),
      {
        agencyId:"",
        agencyName:"",
        agencyHost:false,
      }
    );

    await updateDoc(
      doc(db,"agencies",agency.id),
      {
        totalMembers:increment(-1),
      }
    );

    loadAgency();
    loadHosts(agency.id);

    Alert.alert("Host Removed");

  } catch(e){

    Alert.alert("Error",e.message);

  }

};





return(

<View style={{flex:1}}>

<ScrollView style={styles.container}>

<Image
source={{
  uri:
    agency.logo ||
    agency.agencyLogo ||
    "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
}}
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
⭐ {agency.monthlyStars || 0}
</Text>

<Text style={styles.statTitle}>
Stars
</Text>
</View>

</View>

<View style={styles.buttonRow}>

<TouchableOpacity
style={styles.actionBtn}
onPress={openEditAgency}
>
<Text style={styles.btnText}>
Edit Agency
</Text>
</TouchableOpacity>

<TouchableOpacity
style={styles.actionBtn}
onPress={()=>setHostVisible(true)}
>
<Text style={styles.btnText}>
Add Host
</Text>
</TouchableOpacity>

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
      color={
        item.verifiedColor === "yellow"
          ? "#FFD700"
          : "#ffffff"
      }
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
    alignItems:"center"
  }}
>

<MaterialCommunityIcons
name="diamond-stone"
size={13}
color={getLevelTheme(item.level).icon}
/>

<Text
style={{
marginLeft:4,
fontWeight:"bold",
fontSize:12,
color:getLevelTheme(item.level).text
}}
>
LV {item.level}
</Text>

</View>

 

</View>

</View>

<TouchableOpacity
style={styles.removeBtn}
onPress={()=>removeHost(item)}
>

<Text style={styles.removeText}>
Remove
</Text>

</TouchableOpacity>

</View>




)}

/>



</ScrollView>

{/* Edit Popup */}

<Modal
visible={editVisible}
transparent={true}
animationType="fade"
onRequestClose={() => setEditVisible(false)}
>

<View style={styles.modalBg}>

<View style={styles.popup}>

<View style={styles.editHeader}>
  <View style={styles.editIconCircle}>
    <Ionicons name="business-outline" size={22} color="#FFD700" />
  </View>
  <View style={{ flex: 1 }}>
    <Text style={styles.popupTitle}>Edit Agency</Text>
    <Text style={styles.popupSubTitle}>Name ya photo change karein</Text>
  </View>
</View>

<Text style={styles.fieldLabel}>Agency Name</Text>

<TextInput
  placeholder="Enter Agency Name"
  placeholderTextColor="#777"
  value={newAgencyName}
  onChangeText={setNewAgencyName}
  style={styles.input}
/>

<Text style={styles.fieldLabel}>Agency Photo</Text>

<TouchableOpacity
  style={styles.photoPicker}
  onPress={pickLogo}
  activeOpacity={0.85}
>
  <Image
    source={{
      uri:
        newLogo ||
        agency.logo ||
        agency.agencyLogo ||
        "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
    }}
    style={styles.editLogoPreview}
  />

  <View style={styles.photoPickerTextBox}>
    <Text style={styles.photoPickerTitle}>
      {newLogo ? "New photo selected" : "Change Agency Photo"}
    </Text>
    <Text style={styles.photoPickerHint}>
      Photo select karne ke liye yahan tap karein
    </Text>
  </View>

  <Ionicons name="chevron-forward" size={20} color="#aaa" />
</TouchableOpacity>

<View style={styles.saveHint}>
  <Ionicons name="cloud-upload-outline" size={18} color="#FFD700" />
  <Text style={styles.saveHintText}>
    Save Changes dabane par photo Firebase me save hogi aur refresh/app reopen ke baad bhi rahegi.
  </Text>
</View>

<TouchableOpacity
  style={styles.saveChangesBtn}
  onPress={saveAgencyChanges}
  activeOpacity={0.85}
>
  <Ionicons name="checkmark-circle" size={20} color="#000" />
  <Text style={styles.saveChangesText}>Save Changes</Text>
</TouchableOpacity>

<TouchableOpacity
  style={styles.closeBtn}
  onPress={() => setEditVisible(false)}
  activeOpacity={0.8}
>
  <Text style={styles.closeBtnText}>Cancel</Text>
</TouchableOpacity>

</View>

</View>

</Modal>

{/* Add Host Popup */}

<Modal
visible={hostVisible}
transparent={true}
animationType="fade"
onRequestClose={() => setHostVisible(false)}
>

<View style={styles.modalBg}>

<View style={styles.popup}>

<Text style={styles.popupTitle}>
Add Host
</Text>

<TextInput
placeholder="Host Username"
value={hostUsername}
onChangeText={setHostUsername}
style={styles.input}
/>

<TouchableOpacity
style={styles.btn}
onPress={addHost}
>
<Text style={styles.btnText}>
Add Host
</Text>
</TouchableOpacity>

<TouchableOpacity
style={styles.btn}
onPress={() => setHostVisible(false)}
>
<Text style={styles.btnText}>
Close
</Text>
</TouchableOpacity>

</View>

</View>

</Modal>

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

editHeader:{
  flexDirection:"row",
  alignItems:"center",
  marginBottom:18,
},
editIconCircle:{
  width:44,
  height:44,
  borderRadius:22,
  backgroundColor:"#2a2400",
  borderWidth:1,
  borderColor:"#665500",
  alignItems:"center",
  justifyContent:"center",
  marginRight:12,
},
popupSubTitle:{
  color:"#aaa",
  fontSize:12,
  marginTop:3,
},
fieldLabel:{
  color:"#fff",
  fontSize:13,
  fontWeight:"700",
  marginTop:8,
  marginBottom:7,
},
photoPicker:{
  flexDirection:"row",
  alignItems:"center",
  backgroundColor:"#222",
  borderWidth:1,
  borderColor:"#333",
  borderRadius:14,
  padding:10,
  marginTop:2,
},
editLogoPreview:{
  width:58,
  height:58,
  borderRadius:29,
  backgroundColor:"#111",
},
photoPickerTextBox:{
  flex:1,
  marginLeft:12,
  marginRight:8,
},
photoPickerTitle:{
  color:"#fff",
  fontSize:14,
  fontWeight:"700",
},
photoPickerHint:{
  color:"#888",
  fontSize:11,
  marginTop:4,
  lineHeight:15,
},
saveHint:{
  flexDirection:"row",
  alignItems:"flex-start",
  backgroundColor:"#201e10",
  borderRadius:10,
  padding:10,
  marginTop:14,
},
saveHintText:{
  flex:1,
  color:"#c9c9c9",
  fontSize:11,
  lineHeight:16,
  marginLeft:8,
},
saveChangesBtn:{
  flexDirection:"row",
  alignItems:"center",
  justifyContent:"center",
  backgroundColor:"#FFD700",
  paddingVertical:13,
  borderRadius:12,
  marginTop:15,
},
saveChangesText:{
  color:"#000",
  fontWeight:"800",
  fontSize:15,
  marginLeft:7,
},
closeBtn:{
  alignItems:"center",
  justifyContent:"center",
  paddingVertical:11,
  marginTop:6,
},
closeBtnText:{
  color:"#aaa",
  fontSize:14,
  fontWeight:"600",
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