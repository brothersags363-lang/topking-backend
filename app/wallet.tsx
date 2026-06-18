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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function WalletScreen() {

  const router = useRouter();
  const [activeTab, setActiveTab] = useState('Star');

  const [withdrawAmount, setWithdrawAmount] = useState('');

  useEffect(() => {
    const backAction = () => {
      router.back();
      return true;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, []);

  const packages = [
    { stars: '40', price: '20' },
    { stars: '103', price: '50' },
    { stars: '205', price: '100' },
    { stars: '1008', price: '500' },
    { stars: '2012', price: '1000' },
    { stars: '10025', price: '5000' },
    { stars: '20040', price: '10000' },
    { stars: '40100', price: '20000' },
  ];

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
        <Ionicons
          name="star"
          size={55}
          color="#FFD700"
        />

        <Text style={styles.balanceText}>
          0 Stars
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
      <View style={styles.banner}>

        <View style={styles.logoBox}>
          <Text style={styles.logoText}>
            TK
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>
            TopKing Star Recharge
          </Text>

          <Text style={styles.bannerSub}>
            GooglePay • PhonePe • Paytm
          </Text>

          <Text style={styles.agency}>
            Official Agency
          </Text>
        </View>

      </View>



{activeTab === 'Star' ? (

<View style={{ flex: 1 }}>
  <Text style={styles.sectionTitle}>
    Recharge Packages
  </Text>

  <FlatList
    data={packages}
    keyExtractor={(item, index) => index.toString()}
    showsVerticalScrollIndicator={false}
    contentContainerStyle={{ paddingBottom: 40 }}
    renderItem={({ item }) => (

      <View style={styles.packageCard}>

        <View style={styles.leftSide}>

          <View style={styles.starCircle}>
            <Ionicons
              name="star"
              size={30}
              color="#FFD700"
            />
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

        <TouchableOpacity style={styles.buyBtn}>
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
  contentContainerStyle={{
    paddingBottom: 100
  }}
>

  {/* Available Balance */}
  <View style={styles.withdrawCard}>

    <Text style={styles.withdrawTitle}>
      Available Withdrawal
    </Text>

    <Text style={styles.withdrawBalance}>
      ₹0
    </Text>

    <Text style={styles.withdrawInfo}>
      Minimum Withdrawal ₹100
    </Text>

  </View>


  {/* Payment Method */}
  <View style={styles.paymentCard}>

    <Text style={styles.cardTitle}>
      Payment Method
    </Text>

    <View style={styles.methodRow}>

      <Ionicons
        name="card"
        size={25}
        color="#FFD700"
      />

      <Text style={styles.methodText}>
        UPI / Bank Account
      </Text>

    </View>

  </View>


  {/* Withdraw Amount */}
  <View style={styles.paymentCard}>

    <Text style={styles.cardTitle}>
      Withdrawal Amount
    </Text>

    <TextInput
      style={styles.amountBox}
      placeholder="Enter Amount"
      placeholderTextColor="#777"
      keyboardType="numeric"
      value={withdrawAmount}
      onChangeText={setWithdrawAmount}
    />

    <TouchableOpacity style={styles.withdrawBtn}>

      <Text style={styles.withdrawBtnText}>
        Withdraw Now
      </Text>

    </TouchableOpacity>

  </View>


  {/* History */}
  <Text style={styles.sectionTitle}>
    Recent Withdrawals
  </Text>


  <View style={styles.historyCard}>

    <View>

      <Text style={styles.historyAmount}>
        ₹500
      </Text>

      <Text style={styles.historyDate}>
        22 Jun 2026
      </Text>

    </View>

    <Text style={styles.completed}>
      Completed
    </Text>

  </View>


  <View style={styles.historyCard}>

    <View>

      <Text style={styles.historyAmount}>
        ₹1000
      </Text>

      <Text style={styles.historyDate}>
        20 Jun 2026
      </Text>

    </View>

    <Text style={styles.pending}>
      Pending
    </Text>

  </View>


  <View style={styles.historyCard}>

    <View>

      <Text style={styles.historyAmount}>
        ₹2000
      </Text>

      <Text style={styles.historyDate}>
        18 Jun 2026
      </Text>

    </View>

    <Text style={styles.completed}>
      Completed
    </Text>

  </View>

</ScrollView>

)}



     

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
fontSize:17
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
}




});