import React, { useEffect, useState } from "react";

import {
View,
Text,
FlatList,
TouchableOpacity,
StyleSheet,
TextInput,
ActivityIndicator,
Image,
Modal,
BackHandler,
} from "react-native";

import { useRouter } from "expo-router";

import {
collection,
onSnapshot,
query,
orderBy,
doc,
getDoc,
addDoc,
updateDoc,
deleteDoc,
serverTimestamp,
 where,
 getDocs,
} from "firebase/firestore";

import { getAuth } from "firebase/auth";

import { db } from "./firebaseConfig";

import { Ionicons } from "@expo/vector-icons";

import * as ImagePicker from "expo-image-picker";


export default function AgencyPanel(){

const router = useRouter();

const auth = getAuth();

const [loading,setLoading]=useState(true);

const [isAdmin,setIsAdmin]=useState(false);

const [agencies,setAgencies]=useState([]);

const [search,setSearch]=useState("");


const [showCreate,setShowCreate]=useState(false);

const [editingAgency,setEditingAgency]=useState(null);

const [agencyName,setAgencyName]=useState("");

const [ownerName,setOwnerName]=useState("");

const [ownerUsername, setOwnerUsername] = useState("");

const [logo,setLogo]=useState("");

const pickLogo = async () => {

const result = await ImagePicker.launchImageLibraryAsync({

mediaTypes: ["images"],

allowsEditing: true,

aspect: [1,1],

quality: 0.8,

});

if (!result.canceled) {

setLogo(result.assets[0].uri);

}

};



useEffect(()=>{

const checkAdmin=async()=>{

const user=auth.currentUser;

if(!user) return;

const snap=await getDoc(
doc(db,"admins",user.uid)
);

if(
snap.exists() &&
snap.data().role==="admin"
){

setIsAdmin(true);

}

};

checkAdmin();

},[]);




useEffect(() => {

const backAction = () => {

if (showCreate) {

setShowCreate(false);

return true;

}

return false;

};

const backHandler = BackHandler.addEventListener(
"hardwareBackPress",
backAction
);

return () => backHandler.remove();

}, [showCreate]);




useEffect(()=>{

const q=query(
collection(db,"agencies"),
orderBy("agencyName")
);

const unsubscribe=onSnapshot(q,(snapshot)=>{

let arr=[];

snapshot.forEach((docItem)=>{

arr.push({

id:docItem.id,

...docItem.data()

});

});

setAgencies(arr);

setLoading(false);

});

return()=>unsubscribe();

},[]);

const filteredAgency=agencies.filter(item=>

(item.agencyName || "")
.toLowerCase()
.includes(search.toLowerCase())

);

if(!isAdmin){

return(

<View style={styles.center}>

<Text style={styles.denied}>
Access Denied
</Text>

</View>

);

}

if(loading){

return(

<View style={styles.center}>

<ActivityIndicator
size="large"
color="#FFD700"
/>

</View>

);

}

return(

<View style={styles.container}>

<Text style={styles.title}>
Agency Panel
</Text>

<TextInput

placeholder="Search Agency"

placeholderTextColor="#777"

value={search}

onChangeText={setSearch}

style={styles.search}

/>


<TouchableOpacity
style={styles.createBtn}
onPress={()=>{
setEditingAgency(null);

setAgencyName("");

setOwnerName("");

setOwnerUsername("");

setLogo("");

setShowCreate(true);
}}

>

<Text style={styles.createText}>
+ Create Agency
</Text>

</TouchableOpacity>


<Modal
  visible={showCreate}
  animationType="fade"
  transparent={true}
  onRequestClose={() => setShowCreate(false)}
>
  <View style={styles.modalBackground}>

    <View style={styles.popup}>

      <Text style={styles.popupTitle}>
        {editingAgency ? "Edit Agency" : "Create Agency"}
      </Text>

      <TextInput
        placeholder="Agency Name"
        placeholderTextColor="#999"
        value={agencyName}
        onChangeText={setAgencyName}
        style={styles.input}
      />

      <TextInput
        placeholder="Owner Name"
        placeholderTextColor="#999"
        value={ownerName}
        onChangeText={setOwnerName}
        style={styles.input}
      />

      {!editingAgency && (
        <TextInput
          placeholder="Owner Username"
          placeholderTextColor="#999"
          value={ownerUsername}
          onChangeText={setOwnerUsername}
          style={styles.input}
        />
      )}

      <TouchableOpacity
        style={styles.selectLogoBtn}
        onPress={pickLogo}
      >
        <Text style={styles.btnText}>
          Select Logo
        </Text>
      </TouchableOpacity>

      {logo !== "" && (
        <Image
          source={{ uri: logo }}
          style={styles.logoPreview}
        />
      )}

      <TouchableOpacity
        style={styles.saveBtn}
        onPress={async () => {

          try {

            if (editingAgency) {

              await updateDoc(
                doc(db, "agencies", editingAgency.id),
                {
                  agencyName,
                  ownerName,
                  logo,
                }
              );

              alert("Agency Updated");

            } else {

              const q = query(
                collection(db, "users"),
                where(
 "username",
 "==",
 ownerUsername.trim()
)
              );

              const snap = await getDocs(q);

              if (snap.empty) {
                alert("Owner Username Not Found");
                return;
              }

              const ownerUserId = snap.docs[0].id;

              const agencyRef = await addDoc(
                collection(db, "agencies"),
                {
                  agencyName,
                  ownerName,
                  ownerUsername,
                  ownerUserId,
                  logo,
                  totalMembers: 0,
                  totalStars: 0,
                  status: "active",
                  createdAt: serverTimestamp(),
                }
              );

            await updateDoc(
  doc(db, "users", ownerUserId),
  {
    agencyId: agencyRef.id,
    agencyName,
    isAgencyOwner: true,
    agencyApproved: true,
  }
);

              alert("Agency Created");
            }

            setAgencyName("");
            setOwnerName("");
            setOwnerUsername("");
            setLogo("");
            setEditingAgency(null);
            setShowCreate(false);

          } catch (e) {

            console.log(e);
            alert(e.message);

          }

        }}
      >
        <Text style={styles.btnText}>
          {editingAgency ? "Update Agency" : "Save Agency"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelBtn}
        onPress={() => {
          setShowCreate(false);
          setEditingAgency(null);
        }}
      >
        <Text style={styles.btnText}>
          Close
        </Text>
      </TouchableOpacity>

    </View>

  </View>
</Modal>



<FlatList

data={filteredAgency}

keyExtractor={(item)=>item.id}

renderItem={({item})=>(

<View style={styles.card}>

<Image

source={{

uri:item.logo ||

"https://cdn-icons-png.flaticon.com/512/3135/3135715.png"

}}

style={styles.logo}

/>

<View style={{flex:1}}>

<Text style={styles.name}>
{item.agencyName}
</Text>

<Text style={styles.info}>
Owner : {item.ownerName}
</Text>

<Text style={styles.info}>
Members : {item.totalMembers || 0}
</Text>

<Text style={styles.info}>
Stars : {item.totalStars || 0} ⭐
</Text>

<Text
style={{
color:
item.status==="blocked"
?"red"
:"#00ff66",
marginTop:4
}}
>

{item.status==="blocked"
?"🔴 Blocked"
:"🟢 Active"}

</Text>

</View>


<View style={styles.actionBox}>

<TouchableOpacity
style={styles.viewBtn}
onPress={()=>{
router.push({
pathname:"/agency",
params:{
agencyId:item.id
}
});
}}
>

<Text style={styles.btnText}>
View
</Text>

</TouchableOpacity>

<TouchableOpacity
style={styles.editBtn}


onPress={()=>{

setEditingAgency(item);

setAgencyName(item.agencyName);

setOwnerName(item.ownerName);

setOwnerUsername(item.ownerUsername);

setLogo(item.logo);

setShowCreate(true);

}}


>

<Text style={styles.btnText}>
Edit
</Text>

</TouchableOpacity>

<TouchableOpacity
style={styles.blockBtn}
onPress={async()=>{

await updateDoc(
doc(db,"agencies",item.id),
{
status:
item.status==="blocked"
?
"active"
:
"blocked"
}
);

}}
>

<Text style={styles.btnText}>
{item.status==="blocked" ? "Unblock" : "Block"}
</Text>

</TouchableOpacity>

<TouchableOpacity
style={styles.deleteBtn}
onPress={async()=>{

await deleteDoc(
doc(db,"agencies",item.id)
);

}}
>

<Text style={styles.btnText}>
Delete
</Text>

</TouchableOpacity>

</View>


</View>

)}

/>

</View>

);

}

const styles=StyleSheet.create({

container:{
flex:1,
backgroundColor:"#111",
paddingTop:50,
paddingHorizontal:15,
},

center:{
flex:1,
justifyContent:"center",
alignItems:"center",
backgroundColor:"#111",
},

denied:{
color:"red",
fontSize:22,
fontWeight:"bold",
},

title:{
color:"#fff",
fontSize:28,
fontWeight:"bold",
marginBottom:20,
},

search:{
backgroundColor:"#222",
color:"#fff",
padding:12,
borderRadius:10,
marginBottom:15,
},

createBtn:{
backgroundColor:"#FFD700",
padding:14,
borderRadius:10,
alignItems:"center",
marginBottom:15,
},

createText:{
fontWeight:"bold",
fontSize:17,
color:"#000",
},

card:{
backgroundColor:"#1d1d1d",
padding:15,
borderRadius:12,
marginBottom:12,
flexDirection:"row",
alignItems:"center",
},

logo:{
width:60,
height:60,
borderRadius:30,
marginRight:15,
},

name:{
color:"#fff",
fontSize:18,
fontWeight:"bold",
},

info:{
color:"#ccc",
marginTop:2,
},

viewBtn:{
backgroundColor:"#0099ff",
paddingHorizontal:15,
paddingVertical:8,
borderRadius:8,
},

btnText:{
color:"#fff",
fontWeight:"bold",
},

popupTitle:{
fontSize:22,
fontWeight:"bold",
color:"#fff",
marginBottom:15,
},

input:{
backgroundColor:"#333",
color:"#fff",
padding:12,
borderRadius:10,
marginBottom:10,
},

saveBtn:{
backgroundColor:"#00aa55",
padding:14,
borderRadius:10,
alignItems:"center",
marginTop:10,
},

cancelBtn:{
backgroundColor:"#ff3333",
padding:14,
borderRadius:10,
alignItems:"center",
marginTop:10,
},

actionBox:{
justifyContent:"space-between",
height:150,
},

editBtn:{
backgroundColor:"#ff9800",
paddingHorizontal:15,
paddingVertical:8,
borderRadius:8,
marginTop:5,
},

blockBtn:{
backgroundColor:"#ff4444",
paddingHorizontal:15,
paddingVertical:8,
borderRadius:8,
marginTop:5,
},

deleteBtn:{
backgroundColor:"#990000",
paddingHorizontal:15,
paddingVertical:8,
borderRadius:8,
marginTop:5,
},

logoPreview:{

width:100,

height:100,

borderRadius:50,

alignSelf:"center",

marginTop:15,

marginBottom:10,

},

selectLogoBtn:{
backgroundColor:"#bd2d81",
padding:14,
borderRadius:10,
alignItems:"center",
marginTop:10,
marginBottom:10,
},



modalBackground:{
flex:1,
backgroundColor:"rgba(0,0,0,0.6)",
justifyContent:"center",
alignItems:"center",
},

popup:{
width:"90%",
backgroundColor:"#222",
borderRadius:20,
padding:20,
}


});