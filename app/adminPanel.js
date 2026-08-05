import React, { useEffect, useState } from "react";

import {
View,
Text,
FlatList,
TouchableOpacity,
StyleSheet,
Image,
BackHandler,
} from "react-native";

import { useRouter } from "expo-router";

import {
collection,
query,
where,
onSnapshot,
doc,
updateDoc,
deleteDoc,
getDoc,
} from "firebase/firestore";

import { getAuth } from "firebase/auth";

import { db } from "./firebaseConfig";

import { Ionicons } from "@expo/vector-icons";

export default function AdminPanel() {

const router = useRouter();

const [showAgency, setShowAgency] = useState(false);


const [videos, setVideos] = useState([]);

const [users, setUsers] = useState([]);

const [isAdmin, setIsAdmin] = useState(false);

const auth = getAuth();


useEffect(() => {

const checkAdmin = async () => {

const user = auth.currentUser;

if (!user) return;

const adminSnap = await getDoc(
doc(db,"admins",user.uid)
);

if (
adminSnap.exists() &&
adminSnap.data().role === "admin"
) {

setIsAdmin(true);

}

};

checkAdmin();

}, []);




useEffect(() => {

const backAction = () => {

router.back();

return true;

};

const backHandler =
BackHandler.addEventListener(
"hardwareBackPress",
backAction
);

return () => backHandler.remove();

}, []);



useEffect(() => {

const q = query(
collection(db, "all_videos"),
where("reviewRequired", "==", true)
);

const unsubscribe = onSnapshot(q, (snapshot) => {

let arr = [];

snapshot.forEach((docItem) => {

arr.push({
id: docItem.id,
...docItem.data()
});

});

setVideos(arr);

});

return () => unsubscribe();

}, []);




useEffect(() => {

const q = query(
collection(db,"users"),
where("reviewRequired","==",true)
);

const unsubscribe =
onSnapshot(q,(snapshot)=>{

let arr=[];

snapshot.forEach((docItem)=>{

arr.push({
id:docItem.id,
...docItem.data()
});

});

setUsers(arr);

});

return ()=>unsubscribe();

},[]);


// Approve Video
const approveVideo = async (videoId) => {

await updateDoc(
doc(db, "all_videos", videoId),
{
reviewRequired: false,
reportCount: 0
}
);

};

// Hide Video
const hideVideo = async (videoId) => {

await updateDoc(
doc(db, "all_videos", videoId),
{
hidden: true,
reviewRequired: false,
reportCount: 0
}
);

};

// Reset Reports
const resetReports = async (videoId) => {

await updateDoc(
doc(db, "all_videos", videoId),

{
reviewRequired:false,
reportCount:0,
hidden:false
}

);

};

const deleteVideo = async (videoId) => {

await deleteDoc(
doc(db, "all_videos", videoId)
);

};



if (!isAdmin) {

return (

<View
style={{
flex:1,
backgroundColor:"#000",
justifyContent:"center",
alignItems:"center"
}}
>

<Text
style={{
color:"red",
fontSize:22
}}
>

Access Denied

</Text>

</View>

);

}




const banUser = async (userId)=>{

await updateDoc(
doc(db,"users",userId),
{
banned:true
}
);

};

const unbanUser = async (userId)=>{

await updateDoc(
doc(db,"users",userId),
{
banned:false,
reviewRequired:false,
reportCount:0
}
);

};




return (

<View style={styles.container}>

<Text style={styles.title}>
Admin Panel
</Text>
     

<TouchableOpacity
    style={styles.agencyBtn}
    onPress={() => router.push("/agencyPanel")}
>

    <Text style={styles.agencyBtnText}>
        Agency Panel
    </Text>

</TouchableOpacity>


<TouchableOpacity
    style={styles.withdrawBtn}
    onPress={() => router.push("/agencyRewards")}
>

    <Ionicons
        name="trophy"
        size={22}
        color="#fff"
    />

    <Text style={styles.withdrawText}>
        Agency Rewards
    </Text>

</TouchableOpacity>

<TouchableOpacity
    style={styles.withdrawBtn}
    onPress={() => router.push("/withdrawals")}
>

    <Ionicons
        name="wallet"
        size={22}
        color="#fff"
    />

    <Text style={styles.withdrawText}>
        Withdrawal Requests
    </Text>

</TouchableOpacity>



<TouchableOpacity
    style={styles.feedbackBtn}
    onPress={() => router.push("/feedbackAdmin")}
>

    <Ionicons
        name="chatbox-ellipses"
        size={22}
        color="#fff"
    />

    <Text style={styles.feedbackText}>
        User Feedback
    </Text>

</TouchableOpacity>



<FlatList
data={videos}
keyExtractor={(item) => item.id}
renderItem={({ item }) => (

<View style={styles.card}>

<Image
source={{
uri:
item.thumbnail ||
"https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
}}
style={styles.image}
/>

<Text style={styles.caption}>
{item.caption}
</Text>

<Text style={styles.reportText}>
Reports : {item.reportCount || 0}
</Text>

<TouchableOpacity
style={styles.greenBtn}
onPress={() => approveVideo(item.id)}

>

<Text style={styles.btnText}>
Approve
</Text>
</TouchableOpacity>

<TouchableOpacity
style={styles.redBtn}
onPress={() => hideVideo(item.id)}

>

<Text style={styles.btnText}>
Hide Video
</Text>
</TouchableOpacity>

<TouchableOpacity
style={styles.blueBtn}
onPress={() => resetReports(item.id)}

>

<Text style={styles.btnText}>
Reset Reports
</Text>
</TouchableOpacity>

<TouchableOpacity
style={styles.deleteBtn}
onPress={() => deleteVideo(item.id)}

>

<Text style={styles.btnText}>
Delete Video
</Text>
</TouchableOpacity>

</View>

)}
/>

<Text style={styles.title}>
Reported Users
</Text>

<FlatList
data={users}
keyExtractor={(item) => item.id}
renderItem={({ item }) => (

<View style={styles.card}>

<Image
source={{
uri:
item.profileImg ||
"https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
}}
style={styles.image}
/>

<Text style={styles.caption}>
{item.username}
</Text>

<Text style={styles.reportText}>
Reports : {item.reportCount || 0}
</Text>

<TouchableOpacity
style={styles.redBtn}
onPress={() => banUser(item.id)}

>

<Text style={styles.btnText}>
Ban User
</Text>
</TouchableOpacity>

<TouchableOpacity
style={styles.greenBtn}
onPress={() => unbanUser(item.id)}

>

<Text style={styles.btnText}>
Unban User
</Text>
</TouchableOpacity>

</View>

)}
/>

</View>




);
}

const styles = StyleSheet.create({

container:{
flex:1,
backgroundColor:"#000",
padding:15
},

title:{
color:"#fff",
fontSize:25,
fontWeight:"bold",
textAlign:"center",
marginBottom:20
},

card:{
backgroundColor:"#111",
padding:15,
borderRadius:15,
marginBottom:20
},

image:{
width:"100%",
height:200,
borderRadius:15,
marginBottom:10
},

caption:{
color:"#fff",
fontSize:16,
marginBottom:10
},

reportText:{
color:"red",
fontSize:16,
marginBottom:15
},

greenBtn:{
backgroundColor:"green",
padding:15,
borderRadius:12,
marginBottom:10
},

redBtn:{
backgroundColor:"red",
padding:15,
borderRadius:12,
marginBottom:10
},

blueBtn:{
backgroundColor:"#3498db",
padding:15,
borderRadius:12
},

deleteBtn:{
backgroundColor:"#ff004f",
padding:15,
borderRadius:12,
marginTop:10,
marginBottom:10
},


btnText:{
color:"#fff",
fontWeight:"bold",
textAlign:"center"
},

withdrawBtn:{

backgroundColor:"#FFD700",

padding:15,

borderRadius:15,

flexDirection:"row",

justifyContent:"center",

alignItems:"center",

marginBottom:20

},

withdrawText:{

color:"#000",

fontSize:18,

fontWeight:"bold",

marginLeft:10

},

agencyBtn:{

backgroundColor:"#00BFFF",

padding:15,

borderRadius:15,

justifyContent:"center",

alignItems:"center",

marginBottom:20

},

agencyBtnText:{

color:"#fff",

fontSize:18,

fontWeight:"bold"

},


feedbackBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFD700",
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
},

feedbackText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 10,
},



});
