import React, { useEffect, useState } from "react";

import {
View,
Text,
StyleSheet,
FlatList,
TouchableOpacity,
ActivityIndicator,
} from "react-native";

import { useRouter } from "expo-router";

import {
collection,
query,
orderBy,
onSnapshot,
} from "firebase/firestore";

import { Ionicons } from "@expo/vector-icons";

import { db } from "./firebaseConfig";

export default function Withdrawals() {

const router = useRouter();

const [loading,setLoading]=useState(true);

const [withdrawals,setWithdrawals]=useState([]);

useEffect(()=>{

const q=query(

collection(db,"withdrawals"),

orderBy("createdAt","desc")

);

const unsubscribe=onSnapshot(q,(snapshot)=>{

let arr=[];

snapshot.forEach((doc)=>{

arr.push({

id:doc.id,

...doc.data()

});

});

setWithdrawals(arr);

setLoading(false);

});

return ()=>unsubscribe();

},[]);

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


return(

<View style={styles.container}>

<Text style={styles.title}>

Withdrawal Requests

</Text>

<FlatList

data={withdrawals}

keyExtractor={(item)=>item.id}

renderItem={({item})=>(

<TouchableOpacity

style={styles.card}

onPress={()=>{

router.push({

pathname:"/withdrawalDetails",

params:{

id:item.id

}

});

}}

>

<Text style={styles.name}>

{item.name}

</Text>

<Text style={styles.amount}>

₹ {item.amount}

</Text>

<Text style={styles.upi}>

{item.upiId}

</Text>

<View style={styles.bottomRow}>

<Text
style={[
styles.status,

{
color:
item.status==="Success"
? "#00ff66"
: item.status==="Failed"
? "#ff3b30"
: "#FFD700"
}

]}
>

{item.status || "Pending"}

</Text>

<Ionicons
name="chevron-forward"
size={22}
color="#fff"
/>

</View>

</TouchableOpacity>

)}

ListEmptyComponent={()=>(

<View
style={{
marginTop:120,
alignItems:"center"
}}
>

<Ionicons
name="wallet-outline"
size={70}
color="#444"
/>

<Text
style={{
color:"#777",
fontSize:18,
marginTop:15
}}
>

No Withdrawal Request

</Text>

</View>

)}

/>

</View>

);

}

const styles=StyleSheet.create({

container:{
flex:1,
backgroundColor:"#000",
padding:15
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
marginBottom:20,
textAlign:"center"
},

card:{
backgroundColor:"#111",
padding:18,
borderRadius:15,
marginBottom:15,
borderWidth:1,
borderColor:"#222"
},

name:{
color:"#fff",
fontSize:18,
fontWeight:"bold"
},

amount:{
color:"#FFD700",
fontSize:22,
fontWeight:"bold",
marginTop:8
},

upi:{
color:"#aaa",
marginTop:8,
fontSize:15
},

bottomRow:{
marginTop:15,
flexDirection:"row",
justifyContent:"space-between",
alignItems:"center"
},

status:{
fontSize:16,
fontWeight:"bold"
}

});