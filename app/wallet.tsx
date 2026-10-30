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
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';


import { auth, db } from "./firebaseConfig";


import {
  doc,
  getDoc,
  getDocs,
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
  runTransaction,
  where,
  limit,
} from "firebase/firestore";



export default function WalletScreen() {

  const router = useRouter();

  const [activeTab, setActiveTab] = useState('Star');


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
const [withdrawMethod, setWithdrawMethod] = useState("UPI"); // "UPI" | "BANK"
const [accountNumber, setAccountNumber] = useState("");
const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
const [ifsc, setIfsc] = useState("");
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
  if (stars >= 499000) return 50;
  if (stars >= 440000) return 49;
  if (stars >= 385000) return 48;
  if (stars >= 310000) return 47;
  if (stars >= 299000) return 46;
  if (stars >= 260000) return 45;
  if (stars >= 210000) return 44;
  if (stars >= 189000) return 43;
  if (stars >= 155000) return 42;
  if (stars >= 125000) return 41;
  if (stars >= 110000) return 40;
  if (stars >= 101000) return 39;
  if (stars >= 99000) return 38;
  if (stars >= 89000) return 37;
  if (stars >= 78000) return 36;
  if (stars >= 67000) return 35;
  if (stars >= 51000) return 34;
  if (stars >= 43000) return 33;
  if (stars >= 31000) return 32;
  if (stars >= 26000) return 31;
  if (stars >= 23000) return 30;
  if (stars >= 19000) return 29;
  if (stars >= 17000) return 28;
  if (stars >= 14000) return 27;
  if (stars >= 12300) return 26;
  if (stars >= 1150) return 25;
  if (stars >= 9000) return 24;
  if (stars >= 8200) return 23;
  if (stars >= 7200) return 22;
  if (stars >= 6100) return 21;
  if (stars >= 5050) return 20;
  if (stars >= 4000) return 19;
  if (stars >= 3500) return 18;
  if (stars >= 2800) return 17;
  if (stars >= 2400) return 16;
  if (stars >= 1900) return 15;
  if (stars >= 1600) return 14;
  if (stars >= 1300) return 13;
  if (stars >= 1150) return 12;
  if (stars >= 1000) return 11;
  if (stars >= 870) return 10;
  if (stars >= 670) return 9;
  if (stars >= 540) return 8; // 75 rupaye = 600 stars = Level 8
  if (stars >= 360) return 7;
  if (stars >= 280) return 6;
  if (stars >= 200) return 5; // 250 ka 2 level (approx)
  if (stars >= 160) return 4;
  if (stars >= 100) return 3; // 15 rupaye = 120 stars = Level 3
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


// =========================
// PHONEPE QR RECHARGE
// =========================

const BACKEND = "https://topking-backend.onrender.com";
// UPI ID neeche likho (QR ke niche dikhega, copy karne ke liye)

const MY_UPI_ID = "yourname@ybl";

const [payModal, setPayModal] = useState(false);
const [selectedPkg, setSelectedPkg] = useState(null);
const [utr, setUtr] = useState("");
const [submittingPay, setSubmittingPay] = useState(false);

// Recharge band hai: koi bhi package par click kare to ye message dikhega
const RECHARGE_BLOCK_MSG = "Retry";

const buyStars = (stars, price) => {
  alert(RECHARGE_BLOCK_MSG);
};

const submitRecharge = async () => {
  if (submittingPay || !selectedPkg) return;

  const cleanUtr = utr.trim();

  if (!/^[A-Za-z0-9]{8,30}$/.test(cleanUtr)) {
    alert("Sahi Transaction ID / UTR daalo (PhonePe me 'Transaction ID' ya 'UTR')");
    return;
  }

  try {
    setSubmittingPay(true);

    const token = await auth.currentUser?.getIdToken();

    if (!token) {
      alert("Please login again");
      return;
    }

    const res = await fetch(`${BACKEND}/recharge-request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: Number(selectedPkg.price),
        utr: cleanUtr,
      }),
    });

    const raw = await res.text();

    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (_) {}

    if (!data) {
      console.log("RECHARGE BAD RESPONSE", res.status, raw.slice(0, 200));
      alert(
        res.status === 404
          ? "Server me recharge feature abhi deploy nahi hua (404). Backend deploy karo."
          : `Server error (${res.status}). Thodi der baad try karo.`
      );
      return;
    }

    if (!res.ok || !data.success) {
      alert(data.error || "Request failed, try again");
      return;
    }

    setPayModal(false);
    setUtr("");

    alert(
      "Request bhej di gayi hai. Admin payment check karke Stars add kar dega."
    );
  } catch (error) {
    console.log(error);
    alert("Network error, try again");
  } finally {
    setSubmittingPay(false);
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

// ---- Payment details validation ----
const cleanName = accountName.trim();
const cleanMobile = mobileNumber.trim();
const cleanUpi = upiId.trim();
const cleanAccNo = accountNumber.trim();
const cleanConfirmAccNo = confirmAccountNumber.trim();
const cleanIfsc = ifsc.trim().toUpperCase();

if (cleanName.length < 3) {
  alert("Account Holder Name sahi se bharo");
  return;
}

if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
  alert("Sahi 10 digit Mobile Number daalo");
  return;
}

if (withdrawMethod === "UPI") {
  if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(cleanUpi)) {
    alert("Sahi UPI ID daalo (example: name@ybl)");
    return;
  }
} else {
  if (!/^\d{9,18}$/.test(cleanAccNo)) {
    alert("Sahi Account Number daalo (9 se 18 digit)");
    return;
  }
  if (cleanAccNo !== cleanConfirmAccNo) {
    alert("Account Number aur Confirm Account Number match nahi kar rahe");
    return;
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
    alert("Sahi IFSC Code daalo (example: SBIN0001234)");
    return;
  }
}

const payout =
  withdrawMethod === "BANK"
    ? { accountNumber: cleanAccNo, ifsc: cleanIfsc }
    : { upiId: cleanUpi };






try {

const uid = auth.currentUser?.uid;

if(!uid) return;


const lastWithdrawQuery = query(
  collection(
    db,
    "wallets",
    uid,
    "withdrawHistory"
  ),
  orderBy("createdAt", "desc")
);

const lastWithdrawSnap = await getDocs(
  lastWithdrawQuery
);

if (!lastWithdrawSnap.empty) {

  const lastData =
    lastWithdrawSnap.docs[0].data();

  if (lastData.createdAt) {

    const lastDate =
      lastData.createdAt.toDate();

    const now = new Date();

    const diffDays =
      (now - lastDate) /
      (1000 * 60 * 60 * 24);

    if (diffDays < 7) {

      alert(
        `You can withdraw again after ${Math.ceil(
          7 - diffDays
        )} days`
      );

      return;
    }
  }
}


const userSnap = await getDoc(
  doc(db, "users", uid)
);

const userData = userSnap.exists()
  ? userSnap.data()
  : {};

const agencyId = userData.agencyId || "";
const agencyName = userData.agencyName || "";


await addDoc(

collection(
db,
"wallets",
uid,
"withdrawHistory"
),

{

userId: uid,

agencyId,
agencyName,

accountName: cleanName,

mobileNumber: cleanMobile,

method: withdrawMethod,
payout,

amount: Number(withdrawAmount) * 37, // ₹
tk: Number(withdrawAmount),          // TK
giftStars: Number(withdrawAmount) * 600,

upiId: withdrawMethod === "UPI" ? cleanUpi : "",

status:"Pending",

createdAt:serverTimestamp()

}

);


await addDoc(

collection(db,"withdrawals"),

{

userId: uid,


name: userData.name || "",

username: userData.username || "",

profileImg: userData.profileImg || "",

agencyId,
agencyName,

accountName: cleanName,

mobileNumber: cleanMobile,

method: withdrawMethod,
payout,

amount:Number(withdrawAmount),

tk:Number(withdrawAmount),

giftStars:Number(withdrawAmount)*600,

upiId: withdrawMethod === "UPI" ? cleanUpi : "",

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
setAccountNumber("");
setConfirmAccountNumber("");
setIfsc("");
setWithdrawMethod("UPI");

}
catch(error){

console.log(error);

}

};


// =========================
// TK -> STARS CONVERT + GIFT
// =========================

// Convert rate: 1 TK (600 Gift Stars) = 300 Stars, yani aadha (rate yaha se change kar sakte ho)
const TK_TO_STARS = 300;
// 1 TK = 600 Gift Stars (withdraw wala same rate)
const GIFT_STARS_PER_TK = 600;

const [convertModal, setConvertModal] = useState(false);
const [convertTk, setConvertTk] = useState("");
const [converting, setConverting] = useState(false);

const [giftModal, setGiftModal] = useState(false);
const [giftUsername, setGiftUsername] = useState("");
const [giftAmount, setGiftAmount] = useState("");
const [sendingGift, setSendingGift] = useState(false);

const convertTkToStars = async () => {

  if (converting) return;

  const uid = auth.currentUser?.uid;

  if (!uid) {
    alert("Please login again");
    return;
  }

  const tk = Number(convertTk);

  if (!tk || tk <= 0) {
    alert("Please Enter TK");
    return;
  }

  if (tk < 1) {
    alert("Minimum 1 TK convert kar sakte ho");
    return;
  }

  const giftStarsNeeded = Math.round(tk * GIFT_STARS_PER_TK);
  const starsToAdd = Math.floor(tk * TK_TO_STARS);

  try {

    setConverting(true);

    await runTransaction(db, async (t) => {

      const walletRef = doc(db, "wallets", uid);
      const snap = await t.get(walletRef);
      const data = snap.exists() ? snap.data() : {};

      if ((data.receivedStars || 0) < giftStarsNeeded) {
        throw new Error("NOT_ENOUGH_TK");
      }

      t.update(walletRef, {
        receivedStars: increment(-giftStarsNeeded),
        stars: increment(starsToAdd),
      });

      t.set(doc(collection(db, "wallets", uid, "convertHistory")), {
        tk,
        giftStarsUsed: giftStarsNeeded,
        starsAdded: starsToAdd,
        createdAt: serverTimestamp(),
      });
    });

    alert(`${tk} TK convert ho gaya. ${starsToAdd} Stars add hue.`);
    setConvertModal(false);
    setConvertTk("");

  } catch (error) {

    console.log(error);

    if (error?.message === "NOT_ENOUGH_TK") {
      alert("Itna TK balance nahi hai");
    } else {
      alert("Convert fail hua, dobara try karo");
    }

  } finally {
    setConverting(false);
  }
};

const sendGift = async () => {

  if (sendingGift) return;

  const uid = auth.currentUser?.uid;

  if (!uid) {
    alert("Please login again");
    return;
  }

  const uname = giftUsername.trim().replace(/^@/, "");
  const amount = Math.floor(Number(giftAmount));

  if (!uname) {
    alert("User ka username daalo");
    return;
  }

  if (!amount || amount <= 0) {
    alert("Sahi Stars amount daalo");
    return;
  }

  if (amount > stars) {
    alert(`Tumhare paas sirf ${stars} Stars hai`);
    return;
  }

  try {

    setSendingGift(true);

    // Username se receiver dhundo
    const userSnap = await getDocs(
      query(
        collection(db, "users"),
        where("username", "==", uname),
        limit(1)
      )
    );

    if (userSnap.empty) {
      alert("User nahi mila");
      return;
    }

    const receiverUid = userSnap.docs[0].id;
    const receiverData = userSnap.docs[0].data();

    if (receiverUid === uid) {
      alert("Khud ko gift nahi bhej sakte");
      return;
    }

    await runTransaction(db, async (t) => {

      const senderRef = doc(db, "wallets", uid);
      const receiverRef = doc(db, "wallets", receiverUid);

      const senderSnap = await t.get(senderRef);

      if ((senderSnap.data()?.stars || 0) < amount) {
        throw new Error("NOT_ENOUGH_STARS");
      }

      // Sender se Stars kato
      t.update(senderRef, {
        stars: increment(-amount),
        totalSpent: increment(amount),
      });

      // Receiver ko Gift Stars do (ye TK me withdraw ho sakte hai)
      t.set(
        receiverRef,
        { receivedStars: increment(amount) },
        { merge: true }
      );

      t.set(doc(collection(db, "wallets", uid, "giftHistory")), {
        type: "sent",
        toUserId: receiverUid,
        toUsername: receiverData.username || uname,
        stars: amount,
        createdAt: serverTimestamp(),
      });

      t.set(doc(collection(db, "wallets", receiverUid, "giftHistory")), {
        type: "received",
        fromUserId: uid,
        stars: amount,
        createdAt: serverTimestamp(),
      });
    });

    alert(`${amount} Stars ${uname} ko gift ho gaye 🎁`);
    setGiftModal(false);
    setGiftUsername("");
    setGiftAmount("");

  } catch (error) {

    console.log(error);

    if (error?.message === "NOT_ENOUGH_STARS") {
      alert("Stars kam hai");
    } else {
      alert("Gift fail hua, dobara try karo");
    }

  } finally {
    setSendingGift(false);
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

        <TouchableOpacity
          style={styles.giftBtn}
          onPress={() => setGiftModal(true)}
        >
          <Text style={styles.giftBtnText}>🎁 Gift Stars</Text>
        </TouchableOpacity>
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

    <TouchableOpacity
      style={styles.convertBtn}
      onPress={() => setConvertModal(true)}
    >
      <Text style={styles.convertBtnText}>
        Convert TK → Stars
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
      • 1 TK = Rs 37
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
          {item.method === "BANK"
            ? `Bank A/C ••••${String(item.payout?.accountNumber || "").slice(-4)}`
            : item.upiId}
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

<ScrollView
contentContainerStyle={{ justifyContent:"center", flexGrow:1 }}
keyboardShouldPersistTaps="handled"
>

<View style={styles.modalBox}>

<Text style={styles.modalTitle}>
Withdrawal Details
</Text>

<Text style={{ color:"#FFD700", marginBottom:12, fontSize:13, textAlign:"center" }}>
Payment sahi jagah aaye isliye details dhyan se bharo
</Text>

{/* Method select */}
<View style={{ flexDirection:"row", marginBottom:15 }}>

<TouchableOpacity
style={[
  styles.methodBtn,
  withdrawMethod === "UPI" && styles.methodBtnActive
]}
onPress={() => setWithdrawMethod("UPI")}
>
<Text style={[
  styles.methodBtnText,
  withdrawMethod === "UPI" && styles.methodBtnTextActive
]}>
UPI
</Text>
</TouchableOpacity>

<TouchableOpacity
style={[
  styles.methodBtn,
  withdrawMethod === "BANK" && styles.methodBtnActive
]}
onPress={() => setWithdrawMethod("BANK")}
>
<Text style={[
  styles.methodBtnText,
  withdrawMethod === "BANK" && styles.methodBtnTextActive
]}>
Bank Account
</Text>
</TouchableOpacity>

</View>

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
maxLength={10}
style={styles.input}
value={mobileNumber}
onChangeText={setMobileNumber}
/>

{withdrawMethod === "UPI" ? (

<TextInput
placeholder="UPI ID (example: name@ybl)"
placeholderTextColor="#777"
autoCapitalize="none"
autoCorrect={false}
style={styles.input}
value={upiId}
onChangeText={setUpiId}
/>

) : (

<>

<TextInput
placeholder="Account Number"
placeholderTextColor="#777"
keyboardType="number-pad"
maxLength={18}
style={styles.input}
value={accountNumber}
onChangeText={setAccountNumber}
/>

<TextInput
placeholder="Confirm Account Number"
placeholderTextColor="#777"
keyboardType="number-pad"
maxLength={18}
style={styles.input}
value={confirmAccountNumber}
onChangeText={setConfirmAccountNumber}
/>

<TextInput
placeholder="IFSC Code (example: SBIN0001234)"
placeholderTextColor="#777"
autoCapitalize="characters"
autoCorrect={false}
maxLength={11}
style={styles.input}
value={ifsc}
onChangeText={setIfsc}
/>

</>

)}

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
1 TK = ₹37
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

</ScrollView>

</View>

</Modal>



{/* ===== Convert TK -> Stars ===== */}
<Modal visible={convertModal} transparent animationType="slide">
  <View style={styles.modalBg}>
    <View style={styles.modalBox}>

      <Text style={styles.modalTitle}>Convert TK → Stars</Text>

      <Text style={{ color: "#aaa", textAlign: "center", marginBottom: 6 }}>
        Available: {(receivedStars / GIFT_STARS_PER_TK).toFixed(2)} TK
      </Text>

      <Text style={{ color: "#FFD700", textAlign: "center", marginBottom: 15, fontSize: 13 }}>
        1 TK = {TK_TO_STARS} Stars
      </Text>

      <TextInput
        placeholder="Enter TK (Minimum 1 TK)"
        placeholderTextColor="#777"
        keyboardType="numeric"
        style={styles.input}
        value={convertTk}
        onChangeText={setConvertTk}
      />

      <Text style={{ color: "#fff", marginBottom: 15, marginLeft: 5 }}>
        You will get: ⭐ {Math.floor((Number(convertTk) || 0) * TK_TO_STARS)} Stars
      </Text>

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>

        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => setConvertModal(false)}
          disabled={converting}
        >
          <Text style={{ color: "#fff" }}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.submitBtn}
          onPress={convertTkToStars}
          disabled={converting}
        >
          {converting ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={{ color: "#000", fontWeight: "bold" }}>Convert</Text>
          )}
        </TouchableOpacity>

      </View>
    </View>
  </View>
</Modal>

{/* ===== Gift Stars to a user ===== */}
<Modal visible={giftModal} transparent animationType="slide">
  <View style={styles.modalBg}>
    <ScrollView
      contentContainerStyle={{ justifyContent: "center", flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.modalBox}>

        <Text style={styles.modalTitle}>🎁 Gift Stars</Text>

        <Text style={{ color: "#aaa", textAlign: "center", marginBottom: 15 }}>
          Your Stars: ⭐ {stars}
        </Text>

        <TextInput
          placeholder="Receiver Username"
          placeholderTextColor="#777"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          value={giftUsername}
          onChangeText={setGiftUsername}
        />

        <TextInput
          placeholder="Stars Amount"
          placeholderTextColor="#777"
          keyboardType="number-pad"
          style={styles.input}
          value={giftAmount}
          onChangeText={setGiftAmount}
        />

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => setGiftModal(false)}
            disabled={sendingGift}
          >
            <Text style={{ color: "#fff" }}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={sendGift}
            disabled={sendingGift}
          >
            {sendingGift ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={{ color: "#000", fontWeight: "bold" }}>Send Gift</Text>
            )}
          </TouchableOpacity>

        </View>
      </View>
    </ScrollView>
  </View>
</Modal>

<Modal visible={payModal} transparent animationType="slide">
  <View style={styles.modalBg}>
    <ScrollView
      contentContainerStyle={{ justifyContent: "center", flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.modalBox}>

        <Text style={styles.modalTitle}>
          Pay ₹{selectedPkg?.price}
        </Text>

        <Text style={{ color: "#aaa", textAlign: "center", marginBottom: 12 }}>
          PhonePe se scan karke ₹{selectedPkg?.price} bhejo
        </Text>

        <Text selectable style={styles.upiText}>
          UPI: {MY_UPI_ID}
        </Text>

        <Text style={{ color: "#FFD700", marginBottom: 8, fontSize: 13 }}>
          Payment ke baad Transaction ID / UTR yaha daalo:
        </Text>

        <TextInput
          placeholder="Transaction ID / UTR"
          placeholderTextColor="#777"
          autoCapitalize="characters"
          style={styles.input}
          value={utr}
          onChangeText={setUtr}
        />

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => setPayModal(false)}
            disabled={submittingPay}
          >
            <Text style={{ color: "#fff" }}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={submitRecharge}
            disabled={submittingPay}
          >
            {submittingPay ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={{ color: "#000", fontWeight: "bold" }}>
                I Have Paid
              </Text>
            )}
          </TouchableOpacity>

        </View>

      </View>
    </ScrollView>
  </View>
</Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  giftBtn: {
    backgroundColor: '#FFD700',
    paddingVertical: 8,
    paddingHorizontal: 22,
    borderRadius: 10,
    marginTop: 10,
    marginBottom: 8,
  },

  giftBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 13,
  },

  convertBtn: {
    borderWidth: 1,
    borderColor: '#FFD700',
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },

  convertBtnText: {
    color: '#FFD700',
    fontWeight: 'bold',
    fontSize: 12,
  },

  methodBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#1d1d1d',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#333',
  },

  methodBtnActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },

  methodBtnText: {
    color: '#888',
    fontWeight: 'bold',
  },

  methodBtnTextActive: {
    color: '#000',
  },

  upiText: {
    color: '#fff',
    textAlign: 'center',
    marginVertical: 12,
    fontWeight: 'bold',
  },

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


