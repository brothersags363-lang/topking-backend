import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
 StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  BackHandler,
  StatusBar,
  FlatList,
  TextInput,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import RazorpayCheckout from 'react-native-razorpay';


import { auth, db } from "./firebaseConfig";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  onSnapshot,
    addDoc,
  collection,
  serverTimestamp,
  query,
orderBy,
Timestamp,
} from "firebase/firestore";



export default function WalletScreen() {

  const router = useRouter();
  const [activeTab, setActiveTab] = useState('Star');

  const [withdrawAmount, setWithdrawAmount] = useState('');
const [upiId, setUpiId] = useState('');
const [withdrawHistory, setWithdrawHistory] = useState([]);

  const [stars, setStars] = useState(0);

const [receivedStars, setReceivedStars] = useState(0);

const [earnings, setEarnings] = useState(0);

const [level, setLevel] = useState(1);

const [showHistory, setShowHistory] = useState(false);
const [purchaseHistory, setPurchaseHistory] = useState([]);

const [withdrawModal, setWithdrawModal] = useState(false);

const [accountName, setAccountName] = useState("");
const [mobileNumber, setMobileNumber] = useState("");

 useEffect(() => {

const uid = auth.currentUser?.uid;

if(!uid) return;

const unsubscribe =
onSnapshot(
doc(db,"wallets",uid),

(snapshot)=>{

console.log(
"WALLET UPDATED",
snapshot.data()
);



if (snapshot.exists()) {

setStars(snapshot.data().stars || 0);

setReceivedStars(
  snapshot.data().receivedStars || 0
);

setEarnings(
  snapshot.data().earnings || 0
);

setLevel(
snapshot.data().level || 1
);


}



});

return ()=>unsubscribe();


  }, []);




useEffect(() => {

const uid = auth.currentUser?.uid;

if (!uid) return;

const q = query(
collection(
db,
"wallets",
uid,
"purchaseHistory"
),
orderBy("createdAt", "desc")
);


const unsubscribe = onSnapshot(
q,
(snapshot) => {

const data = snapshot.docs.map(doc => ({
id: doc.id,
...doc.data()
}));

setPurchaseHistory(data);

}
);

return () => unsubscribe();

}, []);



useEffect(() => {

const uid = auth.currentUser?.uid;

if (!uid) return;

const q = query(
collection(
db,
"wallets",
uid,
"withdrawHistory"
),
orderBy("createdAt","desc")
);

const unsubscribe = onSnapshot(
q,
(snapshot)=>{

const data = snapshot.docs.map(doc=>({
id:doc.id,
...doc.data()
}));

setWithdrawHistory(data);

}
);

return ()=>unsubscribe();

},[]);


const getLevel = (stars) => {
  if (stars >= 600000) return 50;
  if (stars >= 540000) return 49;
  if (stars >= 480000) return 48;
  if (stars >= 420000) return 47;
  if (stars >= 360000) return 46;
  if (stars >= 310000) return 45;
  if (stars >= 270000) return 44;
  if (stars >= 230000) return 43;
  if (stars >= 200000) return 42;
  if (stars >= 175000) return 41;
  if (stars >= 150000) return 40;
  if (stars >= 130000) return 39;
  if (stars >= 110000) return 38;
  if (stars >= 95000) return 37;
  if (stars >= 82000) return 36;
  if (stars >= 70000) return 35;
  if (stars >= 60000) return 34;
  if (stars >= 50000) return 33;
  if (stars >= 42000) return 32;
  if (stars >= 35000) return 31;
  if (stars >= 29000) return 30;
  if (stars >= 24000) return 29;
  if (stars >= 20000) return 28;
  if (stars >= 17000) return 27;
  if (stars >= 14500) return 26;
  if (stars >= 12500) return 25;
  if (stars >= 10500) return 24;
  if (stars >= 8800) return 23;
  if (stars >= 7400) return 22;
  if (stars >= 6200) return 21;
  if (stars >= 5200) return 20;
  if (stars >= 4400) return 19;
  if (stars >= 3700) return 18;
  if (stars >= 3100) return 17;
  if (stars >= 2600) return 16;
  if (stars >= 2200) return 15;
  if (stars >= 1850) return 14;
  if (stars >= 1550) return 13;
  if (stars >= 1300) return 12;
  if (stars >= 1100) return 11;
  if (stars >= 900) return 10;
  if (stars >= 750) return 9;
  if (stars >= 600) return 8; // 75 rupaye = 600 stars = Level 8
  if (stars >= 450) return 7;
  if (stars >= 350) return 6;
  if (stars >= 250) return 5; // 250 ka 2 level (approx)
  if (stars >= 180) return 4;
  if (stars >= 120) return 3; // 15 rupaye = 120 stars = Level 3
  if (stars >= 60) return 2;
  if (stars >= 10) return 1;  // 100 star = 1 level shuruwat mein
  return 0;
};

const getLevelColor = (level) => {

  if (level >= 25) return "#ff0000";   // Red

  if (level >= 20) return "#ff6600";   // Orange

  if (level >= 15) return "#FFD700";   // Gold

  if (level >= 10) return "#00ff66";   // Green

  return "#00BFFF";                    // Blue
};



const packages = [
  { stars: '120', price: '15' },      // 15 * 8 = 120
  { stars: '800', price: '100' },     // 100 * 8 = 800
  { stars: '4000', price: '500' },    // 500 * 8 = 4000
  { stars: '20000', price: '2500' },  // 2500 * 8 = 20000
  { stars: '40000', price: '5000' },  // 5000 * 8 = 40000
  { stars: '80000', price: '10000' }  // 10000 * 8 = 80000
];


const buyStars = async (stars, price) => {

  const options = {
    description: "Buy Stars",

    image:
  "https://razorpay.com/assets/images/razorpay-icon.png",

    currency: "INR",

    key: "rzp_test_T91JbTBgzZRuE2",

    amount: Number(price) * 100,

    name: "TopKing",

    prefill: {
      email: auth.currentUser?.email || "",
      contact: "",
    },

    theme: {
      color: "#FFD700",
    },



modal: {
  ondismiss: function () {
    alert("Payment Closed");
  },
},


  };

  try {


console.log("BUY BUTTON CLICKED");
console.log(options);

    const payment =
      await RazorpayCheckout.open(options);

console.log("PAYMENT SUCCESS");
console.log(payment);


console.log("PAYMENT SUCCESS", payment);


    const uid = auth.currentUser?.uid;

    if (!uid) return;

    const walletRef =
      doc(db, "wallets", uid);

    const walletSnap =
      await getDoc(walletRef);



 if (walletSnap.exists()) {

const oldStars =
walletSnap.data().stars || 0;

const totalStars =
oldStars + Number(stars);

const newLevel =
getLevel(totalStars);

await updateDoc(walletRef,{

stars: totalStars,

level: newLevel,

});


}


   else {

const totalStars =
Number(stars);

const newLevel =
getLevel(totalStars);

await setDoc(walletRef,{

stars: totalStars,

level: newLevel,

earnings:0,

receivedStars:0,

});

}

    await addDoc(
      collection(
        db,
        "wallets",
        uid,
        "purchaseHistory"
      ),
      {
        stars: Number(stars),
        amount: Number(price),
        paymentId:
          payment.razorpay_payment_id,
        status: "Completed",
        createdAt: serverTimestamp(),
      }
    );

    alert(
      `${stars} Stars Added Successfully`
    );

  } catch (error) {

    console.log(error);

    alert("Payment Cancelled");

  }
};


const withdrawNow = async () => {


const tk = Number(withdrawAmount);
const availableTK = receivedStars / 600;

if (!tk) {
  alert("Please Enter TK");
  return;
}

if (tk < 25) {
  alert("Minimum Withdrawal is 25 TK");
  return;
}

if (tk > availableTK) {
  alert(`You only have ${availableTK.toFixed(2)} TK`);
  return;
}






try {

const uid = auth.currentUser?.uid;

if(!uid) return;

await addDoc(

collection(
db,
"wallets",
uid,
"withdrawHistory"
),

{

userId: uid,

accountName,

mobileNumber,

amount: Number(withdrawAmount) * 40, // ₹
tk: Number(withdrawAmount),          // TK
giftStars: Number(withdrawAmount) * 600,

upiId,

status:"Pending",

createdAt:serverTimestamp()

}

);


await addDoc(

collection(db,"withdrawals"),

{

userId: uid,

accountName,

mobileNumber,

amount:Number(withdrawAmount),

tk:Number(withdrawAmount),

giftStars:Number(withdrawAmount)*600,

upiId,

status:"Pending",

createdAt:serverTimestamp()

}

);



alert("Withdrawal Request Submitted");
setWithdrawModal(false);

setAccountName("");

setMobileNumber("");


setWithdrawAmount("");
setUpiId("");

}
catch(error){

console.log(error);

}

};



  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons
            name="arrow-back"
            size={28}
            color="#fff"
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          Wallet
        </Text>

        <View style={{ width: 30 }} />
      </View>

      {/* Balance */}
      <View style={styles.balanceCard}>
        

       <Text style={styles.balanceText}>
  ⭐ {stars} Stars
</Text>

        <Text style={styles.balanceSub}>
          Available Balance
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>

        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'Star' && styles.activeTab,
          ]}
          onPress={() => setActiveTab('Star')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'Star' && styles.activeTabText,
            ]}
          >
            Star
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'Withdrawal' && styles.activeTab,
          ]}
          onPress={() => setActiveTab('Withdrawal')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'Withdrawal' && styles.activeTabText,
            ]}
          >
            Withdrawal
          </Text>
        </TouchableOpacity>

      </View>

      {/* Banner */}
     



{activeTab === 'Star' ? (

<View style={{ flex: 1 }}>

  <View
    style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginHorizontal: 20,
      marginTop: 25,
      marginBottom: 10
    }}
  >

    <Text style={styles.sectionTitle}>
      Recharge Packages
    </Text>

    <TouchableOpacity
      onPress={() => setShowHistory(true)}
    >
      <Text
        style={{
          color: "#FFD700",
          fontSize: 20,
          fontWeight: "bold"
        }}
      >
        History
      </Text>
    </TouchableOpacity>

  </View>

  <FlatList
    data={packages}
    keyExtractor={(item, index) => index.toString()}
    showsVerticalScrollIndicator={false}
    contentContainerStyle={{ paddingBottom: 40 }}
    renderItem={({ item }) => (

      <View style={styles.packageCard}>

        <View style={styles.leftSide}>


<View style={styles.starCircle}>
  <Text
    style={{
      fontSize: 22,
      color: getLevelColor(level),
    }}
  >
    ⭐
  </Text>


          </View>

          <View>

            <Text style={styles.starCount}>
              {item.stars} Stars
            </Text>

            <Text style={styles.bonusText}>
              Instant Recharge
            </Text>

          </View>

        </View>

        <TouchableOpacity
          style={styles.buyBtn}
          onPress={() =>
            buyStars(item.stars, item.price)
          }
        >
          <Text style={styles.buyText}>
            ₹{item.price}
          </Text>
        </TouchableOpacity>

      </View>

    )}
  />

</View>

) : (

<ScrollView
  showsVerticalScrollIndicator={false}
  contentContainerStyle={{ paddingBottom: 80 }}
>



  <View style={styles.withdrawMainCard}>

    <View style={styles.withdrawRow}>





<View>
    <Text
      style={{
        color:"#FFD700",
        fontSize:22,
        fontWeight:"bold"
      }}
    >
       ⭐ {receivedStars}
    </Text>

    <Text
      style={{
        color:"#aaa",
        fontSize:12
      }}
    >
      Gift Stars
    </Text>
</View>


<Text style={styles.tkText}>
TK≈ {(receivedStars / 600).toFixed(2)}
</Text>








    </View>

    <Text style={styles.availableText}>
      Available Balance
    </Text>


<TouchableOpacity
  style={styles.bigWithdrawBtn}
  onPress={() => {

    const tk = receivedStars / 600;

    if (tk < 25) {

      alert(
        `Minimum 25 TK required.\n\nYour Current TK : ${tk.toFixed(2)}`
      );

      return;
    }

    setWithdrawModal(true);

  }}
>



      <Text style={styles.bigWithdrawText}>
        Withdrawal
      </Text>
    </TouchableOpacity>

  </View>

  <View
    style={{
      marginHorizontal: 20,
      marginTop: 30
    }}
  >

    <Text
      style={{
        color: "#fff",
        fontSize: 15,
        fontWeight: "bold",
        marginBottom: 20
      }}
    >
      Withdrawal Guidelines
    </Text>


    <Text style={styles.guideText}>
      • 1 TK = Rs 40
    </Text>

    <Text style={styles.guideText}>
      • Minimum Withdrawal : 25 TK
    </Text>

    <Text style={styles.guideText}>
      • Withdraw once every 7 days.
    </Text>

    <Text style={styles.guideText}>
      • Payment processed in 5-7 days.
    </Text>

    <Text style={styles.guideText}>
      • Report issues via feedback.
    </Text>

  </View>

  <Text style={styles.sectionTitle}>
    Recent Withdrawals
  </Text>

  {withdrawHistory.map(item => (

    <View
      key={item.id}
      style={styles.historyCard}
    >

      <View>

        <Text style={styles.historyAmount}>
{item.tk} TK
</Text>

<Text
style={{
color:"#fff",
marginTop:5
}}
>
{item.accountName}
</Text>

<Text
style={{
color:"#888"
}}
>
{item.mobileNumber}
</Text>


        <Text style={styles.historyDate}>
          {item.upiId}
        </Text>

      </View>

      <Text
        style={
          item.status === "Completed"
            ? styles.completed
            : styles.pending
        }
      >
        {item.status}
      </Text>

    </View>

  ))}

</ScrollView>

)}


   


<Modal
visible={withdrawModal}
transparent
animationType="slide"
>

<View style={styles.modalBg}>

<View style={styles.modalBox}>

<Text style={styles.modalTitle}>
Withdrawal Details
</Text>

<TextInput
placeholder="Account Holder Name"
placeholderTextColor="#777"
style={styles.input}
value={accountName}
onChangeText={setAccountName}
/>

<TextInput
placeholder="Mobile Number"
placeholderTextColor="#777"
keyboardType="phone-pad"
style={styles.input}
value={mobileNumber}
onChangeText={setMobileNumber}
/>

<TextInput
placeholder="UPI ID"
placeholderTextColor="#777"
style={styles.input}
value={upiId}
onChangeText={setUpiId}
/>

<TextInput
placeholder="Enter TK (Minimum 25 TK)"
placeholderTextColor="#777"
keyboardType="numeric"
style={styles.input}
value={withdrawAmount}
onChangeText={setWithdrawAmount}
/>

<Text
style={{
  color:"#FFD700",
  marginBottom:15,
  marginLeft:5,
  fontSize:13
}}
>
1 TK = ₹40
</Text>

<View
style={{
flexDirection:"row",
justifyContent:"space-between",
marginTop:20
}}
>

<TouchableOpacity
style={styles.cancelBtn}
onPress={()=>setWithdrawModal(false)}
>

<Text style={{color:"#fff"}}>
Cancel
</Text>

</TouchableOpacity>

<TouchableOpacity
style={styles.submitBtn}
onPress={withdrawNow}
>

<Text
style={{
color:"#000",
fontWeight:"bold"
}}
>
Submit
</Text>

</TouchableOpacity>

</View>

</View>

</View>

</Modal>



    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  header: {
    marginTop: 28,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },

  balanceCard: {
    backgroundColor: '#111',
    marginHorizontal: 15,
    marginTop: 20,
    borderRadius: 20,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },

  balanceText: {
    color: '#fff',
    fontSize: 25,
    fontWeight: 'bold',
    marginTop: 10,
  },

  balanceSub: {
    color: '#888',
    marginTop: 5,
  },

  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 25,
    backgroundColor: '#111',
    borderRadius: 15,
    padding: 5,
  },

  tabButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },

  activeTab: {
    backgroundColor: '#FFD700',
  },

  tabText: {
    color: '#888',
    fontWeight: 'bold',
  },

  activeTabText: {
    color: '#000',
  },

  banner: {
    backgroundColor: '#151515',
    marginHorizontal: 20,
    marginTop: 25,
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },

  logoBox: {
    width: 75,
    height: 75,
    backgroundColor: '#FFD700',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },

  logoText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
  },

  bannerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },

  bannerSub: {
    color: '#FFD700',
    marginTop: 5,
  },

  agency: {
    color: '#fff',
    marginTop: 8,
  },

  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginHorizontal: 20,
    marginTop: 25,
    marginBottom: 15,
  },

  packageCard: {
    backgroundColor: '#111',
    marginHorizontal: 20,
    marginBottom: 15,
    borderRadius: 20,
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
  },

  leftSide: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  starCircle: {
    width: 50,
    height: 50,
    backgroundColor: '#1d1d1d',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },

  starCount: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },

  bonusText: {
    color: '#888',
    marginTop: 5,
  },

  buyBtn: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
  },

  buyText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },

withdrawCard:{
backgroundColor:"#111",
marginHorizontal:20,
marginTop:20,
borderRadius:20,
padding:20,
borderWidth:1,
borderColor:"#222",
alignItems:"center"
},

withdrawTitle:{
color:"#aaa",
fontSize:15
},

withdrawBalance:{
color:"#FFD700",
fontSize:35,
fontWeight:"bold",
marginTop:10
},

withdrawInfo:{
color:"#777",
marginTop:8
},

paymentCard:{
backgroundColor:"#111",
marginHorizontal:20,
marginTop:18,
borderRadius:20,
padding:18,
borderWidth:1,
borderColor:"#222"
},

cardTitle:{
color:"#fff",
fontSize:17,
fontWeight:"bold",
marginBottom:15
},

methodRow:{
flexDirection:"row",
alignItems:"center"
},

methodText:{
color:"#fff",
fontSize:16,
marginLeft:10
},

amountBox:{
backgroundColor:"#1a1a1a",
padding:15,
borderRadius:15
},

amountText:{
color:"#fff",
fontSize:18
},

withdrawBtn:{
backgroundColor:"#FFD700",
paddingVertical:15,
borderRadius:15,
marginTop:20,
alignItems:"center"
},

withdrawBtnText:{
color:"#000",
fontWeight:"bold",
fontSize:15
},

historyCard:{
backgroundColor:"#111",
marginHorizontal:20,
marginBottom:15,
borderRadius:20,
padding:18,
borderWidth:1,
borderColor:"#222",
flexDirection:"row",
justifyContent:"space-between",
alignItems:"center"
},

historyAmount:{
color:"#fff",
fontSize:18,
fontWeight:"bold"
},

historyDate:{
color:"#888",
marginTop:5
},

completed:{
color:"#00ff66",
fontWeight:"bold"
},

pending:{
color:"#FFD700",
fontWeight:"bold"
},

withdrawTopCard:{
backgroundColor:"#111",
marginHorizontal:20,
marginTop:20,
borderRadius:20,
padding:25,
alignItems:"center",
borderWidth:1,
borderColor:"#222"
},

walletStar:{
fontSize:38,
fontWeight:"bold",
color:"#fff"
},

walletSub:{
color:"#888",
marginTop:10,
fontSize:18
},

withdrawMainCard:{
backgroundColor:"#151515",
marginHorizontal:20,
marginTop:25,
padding:20,
borderRadius:20
},

withdrawRow:{
flexDirection:"row",
justifyContent:"space-between",
alignItems:"center",

},

coinText:{
fontSize:35,
fontWeight:"bold",
color:"#fff"
},

tkText:{
fontSize:25,
fontWeight:"bold",
color:"#fff"
},

availableText:{
color:"#999",
marginTop:10,
fontSize:15,
textAlign:"center"
},

bigWithdrawBtn:{
  backgroundColor:"#FFD700",
  marginTop:20,
  paddingVertical:12,
  paddingHorizontal:110,
  borderRadius:8,
  alignSelf:"center",   // Button content ke hisab se width lega
},

bigWithdrawText:{
  fontSize:12,
  fontWeight:"bold",
  color:"#000"
},

guideText:{
color:"#fff",
fontSize:15,
marginBottom:8,
fontWeight:"500"
},



modalBg:{
flex:1,
backgroundColor:"rgba(0,0,0,0.6)",
justifyContent:"center",
padding:20
},

modalBox:{
backgroundColor:"#111",
borderRadius:20,
padding:20
},

modalTitle:{
color:"#FFD700",
fontSize:20,
fontWeight:"bold",
marginBottom:20,
textAlign:"center"
},

input:{
backgroundColor:"#1d1d1d",
color:"#fff",
borderRadius:10,
paddingHorizontal:15,
height:50,
marginBottom:15
},

cancelBtn:{
backgroundColor:"#444",
paddingVertical:12,
paddingHorizontal:35,
borderRadius:10
},

submitBtn:{
backgroundColor:"#FFD700",
paddingVertical:12,
paddingHorizontal:35,
borderRadius:10
},




});        