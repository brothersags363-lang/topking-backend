import React, { useEffect, useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  BackHandler,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import {
  Ionicons,
  MaterialIcons,
} from "@expo/vector-icons";

import {
  doc,
  onSnapshot,
  updateDoc,
  increment,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useRouter } from "expo-router";
import { db, auth } from "./firebaseConfig";
import { callApi } from "../utils/api";

export default function Reward() {
const router = useRouter();

  


const [loading, setLoading] = useState(true);

const [liveMinutes, setLiveMinutes] = useState(0);

const [viewers, setViewers] = useState(0);

const [dailyGifts, setDailyGifts] = useState(0);

const [liveRewardClaimed, setLiveRewardClaimed] = useState(false);

const [giftRewardClaimed, setGiftRewardClaimed] = useState(false);

const [lastLiveClaimDate, setLastLiveClaimDate] = useState("");

const [lastGiftClaimDate, setLastGiftClaimDate] = useState("");

const [claiming, setClaiming] = useState(false);


// Mobile hardware back button
useEffect(() => {

  const handleBackPress = () => {
    router.back();
    return true;
  };

  const subscription = BackHandler.addEventListener(
    "hardwareBackPress",
    handleBackPress
  );

  return () => {
    subscription.remove();
  };

}, [router]);

const liveCompleted = liveMinutes >= 120;

const viewerCompleted = viewers >= 5;

const giftCompleted = dailyGifts >= 6500;

const todayDate = () => {

const now = new Date();

return now.toLocaleDateString(
"en-CA",
{
timeZone:"Asia/Kolkata"
}
);

};



// Daily reset ab server karta hai (gift bhejte waqt). Client kuch nahi likhta.
const checkDailyReset = async()=>{};


// 2 hour + 5 unique viewers reward (final check server karta hai)

const canClaimLiveReward =
liveCompleted &&
viewerCompleted &&
!liveRewardClaimed;


// 6500 gift reward

const canClaimGiftReward =
giftCompleted &&
!giftRewardClaimed;



useEffect(() => {

checkDailyReset();

// gifts ka aaj ka hisaab server se sync (read-only jaisa, client kuch nahi likhta)
callApi("/reward/status",{}).catch(()=>{});

const uid = auth.currentUser?.uid;

if(!uid){

return;

}

const unsubscribe = onSnapshot(

doc(db,"liveRewards",uid),

(snapshot)=>{

if(snapshot.exists()){

const data = snapshot.data();

setLiveMinutes(
data.liveMinutes || 0
);

setViewers(
data.viewers || 0
);

setDailyGifts(
data.dailyGifts || 0
);

setLiveRewardClaimed(
data.liveRewardClaimed || false
);


setGiftRewardClaimed(
data.giftRewardClaimed || false
);

setLastLiveClaimDate(
data.lastLiveClaimDate || ""
);


setLastGiftClaimDate(
data.lastGiftClaimDate || ""
);

}

setLoading(false);

}

);

return unsubscribe;

},[]);



const claimLiveReward = async()=>{

try{

const today = todayDate();

if(lastLiveClaimDate === today){

Alert.alert(
"Already Claimed",
"Live Reward can be claimed only once a day"
);

return;

}

if(claiming) return;

setClaiming(true);

const res = await callApi("/reward/claim",{ type:"live" });

Alert.alert(
"Congratulations 🎉",
`${res.stars} Stars Added Successfully`
);

}catch(error){

console.log(error);

Alert.alert("Reward", error.message || "Could not claim reward");

}finally{

setClaiming(false);

}

};




const claimGiftReward = async()=>{

try{

const today = todayDate();

if(lastGiftClaimDate === today){

Alert.alert(
"Already Claimed",
"Gift Reward can be claimed only once a day"
);

return;

}

if(claiming) return;

setClaiming(true);

const res = await callApi("/reward/claim",{ type:"gift" });

Alert.alert(
"Congratulations 🎉",
`${res.stars} Stars Added`
);

}catch(error){

console.log(error);

Alert.alert("Reward", error.message || "Could not claim reward");

}finally{

setClaiming(false);

}

};





if (loading) {

  return (

    <SafeAreaView
      style={{
        flex:1,
        backgroundColor:"#000",
        justifyContent:"center",
        alignItems:"center"
      }}
    >

      <ActivityIndicator
        size="large"
        color="#FF7A00"
      />

      <Text
        style={{
          color:"#fff",
          marginTop:20,
          fontSize:16
        }}
      >
        Loading Rewards...
      </Text>

    </SafeAreaView>

  );

}

return (

<SafeAreaView style={styles.container}>

<ScrollView
showsVerticalScrollIndicator={false}
contentContainerStyle={styles.scroll}
>

<Text style={styles.title}>
 LIVE REWARDS
</Text>


{/* LIVE */}

<View style={styles.card}>

<View style={styles.row}>

<Ionicons
name="videocam"
size={28}
color="#FF7A00"
/>

<Text style={styles.cardTitle}>
Live 2 Hours
</Text>

</View>

<View style={styles.progressBg}>

<View
style={[
styles.progressFill,
{
width:`${Math.min(
(liveMinutes/120)*100,
100
)}%`
}
]}
/>

</View>

<Text style={styles.progressText}>

{Math.min(liveMinutes,120)} / 120 Minutes

</Text>

<Text style={styles.status}>

{
liveCompleted
?
"✅ Completed"
:
`${Math.max(0,120-liveMinutes)} Minutes Left`
}

</Text>

</View>


{/* VIEWERS */}

<View style={styles.card}>

<View style={styles.row}>

<Ionicons
name="people"
size={28}
color="#00D2FF"
/>

<Text style={styles.cardTitle}>
5 Unique Viewers
</Text>

</View>

<View style={styles.progressBg}>

<View
style={[
styles.progressFill,
{
width:`${Math.min(
(viewers/5)*100,
100
)}%`
}
]}
/>

</View>

<Text style={styles.progressText}>

{Math.min(viewers,5)} / 5 Viewers

</Text>

<Text style={styles.status}>

{
viewerCompleted
?
"✅ Completed"
:
`${Math.max(0,5-viewers)} More Needed`
}

</Text>

</View>


{/* GIFTS */}

<View style={styles.card}>

<View style={styles.row}>

<MaterialIcons
name="card-giftcard"
size={28}
color="#FFD700"
/>

<Text style={styles.cardTitle}>
Daily Gifts
</Text>

</View>

<View style={styles.progressBg}>

<View
style={[
styles.progressFill,
{
width:`${Math.min(
(dailyGifts/6500)*100,
100
)}%`
}
]}
/>

</View>

<Text style={styles.progressText}>

{Math.min(dailyGifts,6500)} / 6500 Stars

</Text>

<Text style={styles.status}>

{
giftCompleted
?
"✅ Completed"
:
`${Math.max(0,6500-dailyGifts)} Stars Left`
}

</Text>

</View>


{/* REWARD */}

<LinearGradient

colors={["#FF7A00","#FF4500"]}

style={styles.rewardCard}

>

<Text style={styles.rewardTitle}>
🎁 Live Reward
</Text>


<Text style={styles.rewardSmall}>
Complete 2 Hours Live + 5 Unique Viewers
</Text>


<Text style={styles.rewardValue}>
⭐ 300 Stars
</Text>


<View style={styles.line}/>


<Text style={styles.rewardTitle}>
🎁 Gift Reward
</Text>


<Text style={styles.rewardSmall}>
Complete 6500 Gifts in 1 Day
</Text>


<Text style={styles.rewardValue}>
⭐ 180 Stars
</Text>


</LinearGradient>



<TouchableOpacity

disabled={!canClaimLiveReward || claiming}

onPress={claimLiveReward}

style={[

styles.claimBtn,

!canClaimLiveReward &&
{
backgroundColor:"#444"
}

]}

>

<Text style={styles.claimText}>

{

liveRewardClaimed

?

"Live + Viewer Reward Claimed ✅"

:

"Claim 2H + 5 Viewers Reward (300 Stars)"

}

</Text>


</TouchableOpacity>



<TouchableOpacity

disabled={!canClaimGiftReward || claiming}

onPress={claimGiftReward}

style={[

styles.claimBtn,

!canClaimGiftReward &&
{
backgroundColor:"#444"
}

]}

>

<Text style={styles.claimText}>

{

giftRewardClaimed

?

"Gift Reward Claimed ✅"

:

"Claim 6500 Gift Reward (180 Stars)"

}

</Text>


</TouchableOpacity>





</ScrollView>

</SafeAreaView>

);

}

const styles = StyleSheet.create({

  container:{
    flex:1,
    backgroundColor:"#0F0F0F",
  },

  scroll:{
    padding:25,
    paddingBottom:50,
  },

  title:{
    color:"#fff",
    fontSize:22,
    fontWeight:"bold",
    marginBottom:25,
    textAlign:"center",
  },

  card:{
    backgroundColor:"#1B1B1B",
    borderRadius:16,
    padding:16,
    marginBottom:20,
  },

  row:{
    flexDirection:"row",
    alignItems:"center",
    marginBottom:15,
  },

  cardTitle:{
    color:"#fff",
    fontSize:18,
    fontWeight:"700",
    marginLeft:12,
  },

  progressBg:{
    width:"100%",
    height:12,
    backgroundColor:"#333",
    borderRadius:20,
    overflow:"hidden",
  },

  progressFill:{
    height:12,
    backgroundColor:"#FF7A00",
    borderRadius:20,
  },

  progressText:{
    color:"#fff",
    marginTop:12,
    fontSize:15,
    fontWeight:"600",
  },

  status:{
    color:"#FFB347",
    marginTop:6,
    fontSize:14,
  },

rewardCard:{
    borderRadius:15,
    padding:15,
    alignItems:"center",
    marginTop:10,
},

  rewardTitle:{
    color:"#fff",
    fontSize:20,
    fontWeight:"bold",
  },

rewardValue:{
    color:"#fff",
    fontSize:24,
    fontWeight:"900",
    marginTop:6,
},

rewardSmall:{
  color:"#fff",
  fontSize:14,
  textAlign:"center",
  marginTop:8,
},


line:{
  width:"100%",
  height:1,
  backgroundColor:"#ffffff55",
  marginVertical:15,
},

  claimBtn:{
    backgroundColor:"#FF7A00",
    marginTop:20,
    paddingVertical:16,
    borderRadius:30,
    alignItems:"center",
  },

 claimText:{
  color:"#fff",
  fontWeight:"700",
  fontSize:15,
  textAlign:"center",
  paddingHorizontal:10,
},

});





