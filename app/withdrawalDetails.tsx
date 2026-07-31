import React, { useEffect, useState } from "react";

import {
View,
Text,
StyleSheet,
TouchableOpacity,
ActivityIndicator,
Alert,
ScrollView,
} from "react-native";

import { useLocalSearchParams,useRouter } from "expo-router";

import {
doc,
getDoc,
updateDoc,
increment,
collection,
query,
where,
getDocs,
} from "firebase/firestore";

import { db } from "./firebaseConfig";

export default function WithdrawalDetails(){

const {id}=useLocalSearchParams();

const router=useRouter();

const [loading,setLoading]=useState(true);

const [data,setData]=useState<any>(null);

useEffect(()=>{

loadData();

},[]);

const loadData=async()=>{

try{

const snap=await getDoc(
doc(db,"withdrawals",id as string)
);

if(snap.exists()){

setData({

id:snap.id,

...snap.data()

});

}

}catch(e){

console.log(e);

}

setLoading(false);

};

if(loading){

return(

<View style={styles.loader}>

<ActivityIndicator
size="large"
color="#FFD700"
/>

</View>

);

}

if(!data){


return(

<View style={styles.loader}>

<Text style={{color:"#fff"}}>

Data Not Found

</Text>

</View>

);

}


return(

<ScrollView
style={styles.container}
contentContainerStyle={{
paddingBottom:40
}}
>

<Text style={styles.title}>

Withdrawal Details

</Text>

<View style={styles.card}>

<Text style={styles.label}>
User Name
</Text>

<Text style={styles.value}>
{data.name || data.username}
</Text>

<Text style={styles.label}>
Withdrawal TK
</Text>

<Text style={styles.value}>
{data.tk} TK
</Text>



<Text style={styles.label}>
TK
</Text>

<Text style={styles.value}>
{data.tk} TK
</Text>

<Text style={styles.label}>
Gift Stars
</Text>

<Text style={styles.value}>
⭐ {data.giftStars}
</Text>


<Text style={styles.label}>
UPI ID
</Text>

<Text style={styles.value}>
{data.upiId}
</Text>

<Text style={styles.label}>
Status
</Text>

<Text
style={{
color:
data.status=="Success"
?"#00ff66"
:data.status=="Failed"
?"red"
:"#FFD700",
fontSize:18,
fontWeight:"bold"
}}
>
{data.status || "Pending"}
</Text>

</View>


<TouchableOpacity
style={styles.successBtn}
onPress={async()=>{

Alert.alert(

"Confirm",

"Payment Success karna hai?",

[
{
text:"Cancel",
style:"cancel"
},
{
text:"Yes",
onPress:async()=>{



await updateDoc(
doc(db,"withdrawals",id as string),
{
status:"Success"

}

);


const historyQuery = query(
collection(
db,
"wallets",
data.userId,
"withdrawHistory"
),
where(
"withdrawId",
"==",
data.withdrawId
)
);

const historySnap =
await getDocs(historyQuery);

for (const item of historySnap.docs) {

await updateDoc(
item.ref,
{
status:"Success"
}
);

}


await updateDoc(

doc(db,"wallets",data.userId),

{

receivedStars: increment(-Number(data.giftStars))

}

);


Alert.alert(
"Done",
"Withdrawal Success"
);

router.back();



}
}
]

);

}}
>

<Text style={styles.btnText}>

Payment Success

</Text>

</TouchableOpacity>

<TouchableOpacity
style={styles.failedBtn}
onPress={async()=>{

Alert.alert(

"Confirm",

"Payment Failed karna hai?",

[
{
text:"Cancel",
style:"cancel"
},
{
text:"Yes",
onPress:async()=>{

await updateDoc(
doc(db,"withdrawals",id as string),
{
status:"Failed"
}
);


const historyQuery = query(
collection(
db,
"wallets",
data.userId,
"withdrawHistory"
),
where(
"withdrawId",
"==",
data.withdrawId
)
);

const historySnap =
await getDocs(historyQuery);

for (const item of historySnap.docs) {

await updateDoc(
item.ref,
{
status:"Failed"
}
);

}



Alert.alert(
"Done",
"Withdrawal Failed"
);

router.back();

}
}
]

);

}}
>

<Text style={styles.btnText}>

Payment Failed

</Text>

</TouchableOpacity>

</ScrollView>

);

}

const styles=StyleSheet.create({

container:{
flex:1,
backgroundColor:"#000",
padding:20
},

loader:{
flex:1,
justifyContent:"center",
alignItems:"center",
backgroundColor:"#000"
},

title:{
fontSize:28,
fontWeight:"bold",
color:"#FFD700",
textAlign:"center",
marginBottom:25
},

card:{
backgroundColor:"#111",
borderRadius:15,
padding:20,
marginBottom:30,
borderWidth:1,
borderColor:"#222"
},

label:{
color:"#777",
fontSize:14,
marginTop:15
},

value:{
color:"#fff",
fontSize:20,
fontWeight:"bold",
marginTop:5
},

successBtn:{
backgroundColor:"#00aa44",
padding:18,
borderRadius:15,
marginBottom:15
},

failedBtn:{
backgroundColor:"#ff3b30",
padding:18,
borderRadius:15
},

btnText:{
color:"#fff",
fontSize:18,
fontWeight:"bold",
textAlign:"center"
}

});