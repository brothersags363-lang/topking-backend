import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Image,
  ScrollView,
  Dimensions,
  TextInput,
  Modal,
  Platform,
  StatusBar,
  BackHandler,
  KeyboardAvoidingView
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';

import {
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  getDoc,
  increment
} from 'firebase/firestore';



const { width } = Dimensions.get('window');
const STABLE_AVATAR = 'https://avatar.iran.liara.run/public/65';

// Firebase safety check
let db = null;
let auth = null;
try {
  const firebaseModule = require('./firebaseConfig');
  db = firebaseModule.db;
  auth = firebaseModule.auth;
} catch (e) {
  console.log("Firebase config not found.");
}

export default function LiveRoom() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const roomId = params?.id ? String(params.id) : null;

  const [roomData, setRoomData] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState('listener'); 
  const [loading, setLoading] = useState(true);
  const [chatMessage, setChatMessage] = useState('');
  const [controlModalVisible, setControlModalVisible] = useState(false);
const [raiseHandLoading, setRaiseHandLoading] = useState(false);
const [requestModalVisible, setRequestModalVisible] = useState(false);


  const isJoinedRef = useRef(false);
  
const currentUid = auth?.currentUser?.uid;
useEffect(() => {
  if (!auth?.currentUser) {
    router.replace('/login');
  }
}, []);

  const currentName = params?.hostName || auth?.currentUser?.displayName || "User";
  const currentAvatar = params?.hostProfilePic || auth?.currentUser?.photoURL || STABLE_AVATAR;

  // --- BackHandler Subscription Fix ---
  useEffect(() => {
    const backAction = () => {
      setControlModalVisible(true);
      return true;
    };

    const backHandlerSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => {
      if (backHandlerSubscription) backHandlerSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!db || !roomId) return;
    const roomRef = doc(db, 'rooms', roomId);

    const joinRoom = async () => {
if (!auth?.currentUser) return;

      if (isJoinedRef.current) return;
      isJoinedRef.current = true;
      try {
        const roomSnap = await getDoc(roomRef);
        if (!roomSnap.exists()) {
          router.replace('/'); // Path updated to root
          return;
        }

const data = roomSnap.data();

if (
  data?.roomLocked &&
  data?.hostId !== currentUid
) {
  alert("Room Locked");
  router.back();
  return;
}

        const updates = {};
       updates[`audienceList.${currentUid}`] = {
  uid: currentUid,
  name: currentName,
  img: currentAvatar,
  joinedAt: Date.now(),
  online: true
};

updates.listenersCount = increment(1);

if (data?.hostId === currentUid) {

 updates['seatsData.seat_1'] = {
   userId: currentUid,
   userName: currentName,
   userImg: currentAvatar,
   isMuted: false,
   roleTag: 'HOST'
 };

}


   if (data?.hostId === currentUid)
  



         
        await updateDoc(roomRef, updates);
      } catch (e) { console.log(e); }
    };
    
    joinRoom();

    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setRoomData(data);
        setLoading(false);
        const seats = data.seatsData || {};
        let onPod = false;
        Object.values(seats).forEach(s => { if(s?.userId === currentUid) onPod = true; });
        setCurrentUserRole(seats.seat_1?.userId === currentUid ? 'host' : (onPod ? 'speaker' : 'listener'));
      } else {
        router.replace('/'); // Path updated to root
      }
    });

    return () => unsubscribe();
  }, [roomId]);

  // --- CLEAN & EXIT: Direct Fix for Navigation ---
  const cleanAndExit = async () => {
    setControlModalVisible(false);
    
    // Pehle navigate karein taaki user ko wait na karna pade
    router.replace('/'); 

    try {
      if (db && roomId) {
        const roomRef = doc(db, 'rooms', roomId);
        if (currentUserRole === 'host') {
          await deleteDoc(roomRef);
        } else {
          const updates = {};
          updates[`audienceList.${currentUid}`] = null;

updates.listenersCount = increment(-1);

          if (roomData?.seatsData) {
            Object.keys(roomData.seatsData).forEach(key => {
              if (roomData.seatsData[key]?.userId === currentUid) {
                updates[`seatsData.${key}`] = { userId: null, userName: 'Open', userImg: STABLE_AVATAR, isMuted: false };
              }
            });
          }
          await updateDoc(roomRef, updates);
        }
      }
    } catch (e) { 
      console.log("Exit Process Error:", e);
    }
  };


  const handleSeatJoin = async (seatKey) => {
  try {

    if (currentUserRole !== 'listener') {
      return;
    }

    const roomRef = doc(db, 'rooms', roomId);

    await updateDoc(roomRef, {
      [`seatsData.${seatKey}`]: {
        userId: currentUid,
        userName: currentName,
        userImg: currentAvatar,
        isMuted: false,
        roleTag: 'SPEAKER'
      }
    });

  } catch (error) {
    console.log(error);
  }
};




const handleRaiseHand = async () => {
  try {

    setRaiseHandLoading(true);

    const roomRef = doc(db, 'rooms', roomId);

    await updateDoc(roomRef, {
      [`speakerRequests.${currentUid}`]: {
        uid: currentUid,
        name: currentName,
        img: currentAvatar,
        status: 'pending',
        requestedAt: Date.now()
      }
    });

    alert('Request Sent To Host');

  } catch (e) {
    console.log(e);
  }

  setRaiseHandLoading(false);
};


  const handleSendChat = async () => {
    if (!chatMessage.trim()) return;
    try {
      const roomRef = doc(db, 'rooms', roomId);
      const newChat = { id: Date.now().toString(), senderName: currentName, message: chatMessage, userImg: currentAvatar };
      const updatedChats = [...(roomData.chats || []), newChat].slice(-30);
      setChatMessage('');
      await updateDoc(roomRef, { chats: updatedChats });
    } catch (e) { console.log(e); }
  };


const approveRequest = async (user) => {

 try {

  const roomRef = doc(db,'rooms',roomId);

  await updateDoc(roomRef,{

   [`seatsData.seat_2`] : {
     userId:user.uid,
     userName:user.name,
     userImg:user.img,
     isMuted:false,
     roleTag:'SPEAKER'
   },

   [`speakerRequests.${user.uid}`] : null

  });

 } catch(e){
  console.log(e);
 }

};



const removeSpeaker = async (seatKey) => {

 try{

  const roomRef = doc(db,'rooms',roomId);

  await updateDoc(roomRef,{

   [`seatsData.${seatKey}`]:{
      userId:null,
      userName:'Open',
      userImg:STABLE_AVATAR,
      isMuted:false
   }

  });

 }catch(e){
  console.log(e);
 }

};



  if (loading) return <View style={styles.loader}><Text style={{color:'#fff'}}>Entering Live Room...</Text></View>;

  const audienceArray = roomData?.audienceList ? Object.values(roomData.audienceList) : [];
const requestsArray =
roomData?.speakerRequests
? Object.values(roomData.speakerRequests)
: [];



return (
  <View style={styles.mainContainer}>

    <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

    {/* ================= TOP HEADER ================= */}
    <SafeAreaView style={styles.topHeader}>
      <View style={styles.hostBadge}>
        <Image
          source={{ uri: roomData?.seatsData?.seat_1?.userImg || STABLE_AVATAR }}
          style={styles.topHostImg}
        />

        <View>
          <Text style={styles.roomNameText}>
            {roomData?.seatsData?.seat_1?.userName || "Live Room"}
          </Text>

          <View style={styles.viewRow}>
            <MaterialCommunityIcons name="waveform" size={14} color="#f1c40f" />
            <Text style={styles.onlineText}>
              {roomData?.listenersCount || 0} Listening
            </Text>

            <View style={styles.liveTag}>
              <Text style={styles.liveTagText}>● LIVE</Text>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>

    {/* ================= MAIN CONTENT ================= */}
    <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>

      {/* SEATS */}
      <View style={styles.micGrid}>
        {['seat_1','seat_2','seat_3','seat_4','seat_5','seat_6','seat_7','seat_8']
          .map((key) => {
            const seat = roomData?.seatsData?.[key] || {};
            const isActive = !!seat.userId;

            return (
              <TouchableOpacity
                key={key}
                style={styles.seatItem}
                onPress={() => {
                  if (!seat.userId) handleSeatJoin(key);
                }}
              >
                <View style={[
                  styles.avatarBox,
                  isActive
                    ? (key === 'seat_1' ? styles.hostBorder : styles.speakerBorder)
                    : styles.emptyBorder
                ]}>
                  {isActive ? (
                    <Image source={{ uri: seat.userImg || STABLE_AVATAR }} style={styles.avatarMain} />
                  ) : (
                    <Ionicons name="add" size={28} color="rgba(255,255,255,0.2)" />
                  )}

                  {key === 'seat_1' && (
                    <View style={styles.hostTag}>
                      <Text style={styles.tagLabel}>HOST</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.seatNameTxt}>
                  {seat.userName || "Tap to join"}
                </Text>
              </TouchableOpacity>
            );
          })}
      </View>

      {/* CHAT */}
      <View style={styles.chatArea}>
        {(roomData?.chats || []).map((chat, i) => (
          <View key={i} style={styles.chatRow}>
            <Image source={{ uri: chat.userImg || STABLE_AVATAR }} style={styles.chatAva} />
            <View style={styles.chatContent}>
              <Text style={styles.chatUser}>{chat.senderName}</Text>
              <View style={styles.bubble}>
                <Text style={styles.chatMsg}>{chat.message}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>

    </ScrollView>

    {/* ================= BOTTOM BAR ================= */}
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.bottomNav}
    >
      <View style={styles.inputBox}>
        <TextInput
          style={styles.inputStyle}
          placeholder="Chat"
          placeholderTextColor="#666"
          value={chatMessage}
          onChangeText={setChatMessage}
          onSubmitEditing={handleSendChat}
        />
      </View>

      {currentUserRole === 'listener' && (
        <TouchableOpacity style={styles.raiseHandBtn} onPress={handleRaiseHand}>
          <Text style={styles.raiseHandText}>✋ Raise Hand</Text>
        </TouchableOpacity>
      )}

      {currentUserRole === 'host' && (
        <TouchableOpacity
          style={styles.actionCircle}
          onPress={() => setRequestModalVisible(true)}
        >
          <Ionicons name="people-outline" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.actionCircle}
        onPress={() => setControlModalVisible(true)}
      >
        <Ionicons name="log-out-outline" size={24} color="#fff" />
      </TouchableOpacity>

    </KeyboardAvoidingView>

    {/* ================= EXIT MODAL ================= */}
    <Modal transparent visible={controlModalVisible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.exitBox}>
          <Text style={styles.exitTitle}>Exit Room?</Text>
          <Text style={styles.exitSub}>
            Kya aap waqai Home screen par jana chahte hain?
          </Text>

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.noBtn}
              onPress={() => setControlModalVisible(false)}
            >
              <Text style={styles.btnText}>Nahi</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.yesBtn}
              onPress={cleanAndExit}
            >
              <Text style={styles.btnText}>Haan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* ================= SPEAKER REQUEST MODAL ================= */}
    <Modal visible={requestModalVisible} transparent animationType="slide">
      <View style={styles.bottomSheetOverlay}>
        <View style={styles.requestSheet}>

          <Text style={{color:'#fff', fontSize:20, fontWeight:'bold', marginBottom:20}}>
            🎤 Speaker Requests
          </Text>

          <ScrollView>

            {requestsArray.map((user,index)=>(
              <View key={index} style={{
                backgroundColor:'#2B2D42',
                padding:12,
                borderRadius:12,
                marginBottom:10,
                flexDirection:'row',
                justifyContent:'space-between',
                alignItems:'center'
              }}>
                <Text style={{color:'#fff'}}>{user.name}</Text>

                <TouchableOpacity onPress={() => approveRequest(user)}>
                  <Text style={{color:'#00ff88', fontWeight:'bold'}}>Approve</Text>
                </TouchableOpacity>
              </View>
            ))}

            <Text style={{
              color:'#fff',
              fontSize:18,
              fontWeight:'bold',
              marginTop:20,
              marginBottom:10
            }}>
              Current Speakers
            </Text>

            {Object.entries(roomData?.seatsData || {})
              .filter(([key,seat]) => seat?.userId && key !== 'seat_1')
              .map(([key,seat]) => (
                <View key={key} style={{
                  backgroundColor:'#2B2D42',
                  padding:12,
                  borderRadius:12,
                  marginBottom:10,
                  flexDirection:'row',
                  justifyContent:'space-between',
                  alignItems:'center'
                }}>
                  <Text style={{color:'#fff'}}>{seat.userName}</Text>

                  <TouchableOpacity onPress={() => removeSpeaker(key)}>
                    <Text style={{color:'red', fontWeight:'bold'}}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}

          </ScrollView>

          <TouchableOpacity onPress={() => setRequestModalVisible(false)}>
            <Text style={{color:'#fff', marginTop:20}}>Close</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>

  </View>
);
  
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#0A0B14' },
  loader: { flex: 1, backgroundColor: '#0A0B14', justifyContent: 'center', alignItems: 'center' },
  topHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, marginTop: 35 },
  hostBadge: { flexDirection: 'row', alignItems: 'center' },
  topHostImg: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#f1c40f' },
  roomNameText: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginLeft: 10 },
  viewRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 10, marginTop: 2 },
  onlineText: { color: '#bdc3c7', fontSize: 11, marginLeft: 4 },
  liveTag: { backgroundColor: '#e74c3c', paddingHorizontal: 6, borderRadius: 4, marginLeft: 8 },
  liveTagText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  audienceAvatars: { flexDirection: 'row', alignItems: 'center' },
  miniRound: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: '#0A0B14' },
  moreCount: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1C1E2E', justifyContent: 'center', alignItems: 'center', marginLeft: -12, borderWidth: 1.5, borderColor: '#0A0B14' },
  moreText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  micGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', padding: 15, marginTop: 10 },
  seatItem: { width: '23%', alignItems: 'center', marginBottom: 20 },
  avatarBox: { width: 68, height: 68, borderRadius: 34, justifyContent: 'center', alignItems: 'center', backgroundColor: '#151728' },
  hostBorder: { borderWidth: 2.5, borderColor: '#f1c40f' },
  speakerBorder: { borderWidth: 1.5, borderColor: '#8e44ad' },
  emptyBorder: { borderWidth: 1.5, borderColor: '#2c3e50', borderStyle: 'dashed' },
  avatarMain: { width: '100%', height: '100%', borderRadius: 34 },
  hostTag: { position: 'absolute', top: -5, backgroundColor: '#f1c40f', borderRadius: 6, paddingHorizontal: 6 },
  tagLabel: { fontSize: 8, fontWeight: 'bold', color: '#000' },
  micIconOverlay: { position: 'absolute', bottom: 2, right: 2, backgroundColor: '#f1c40f', borderRadius: 10, padding: 3 },
  seatNameTxt: { color: '#95a5a6', fontSize: 10, marginTop: 8 },
  sysMessage: { backgroundColor: 'rgba(241, 196, 15, 0.08)', borderLeftWidth: 3, borderLeftColor: '#f1c40f', margin: 15, padding: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  sysText: { color: '#f1c40f', fontSize: 11, flex: 1, marginHorizontal: 10 },
  chatArea: { paddingHorizontal: 15 },
  chatRow: { flexDirection: 'row', marginBottom: 15, alignItems: 'flex-start' },
  chatAva: { width: 36, height: 36, borderRadius: 18 },
  chatContent: { flex: 1, marginLeft: 10 },
  chatHeaderInline: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  chatUser: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  bubble: { backgroundColor: 'rgba(255,255,255,0.05)', padding: 10, borderRadius: 12, alignSelf: 'flex-start' },
  chatMsg: { color: '#eee', fontSize: 13 },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', padding: 15, backgroundColor: '#0A0B14', alignItems: 'center', borderTopWidth: 0.5, borderColor: '#1C1E2E' },
  inputBox: { flex: 1, height: 44, backgroundColor: '#1C1E2E', borderRadius: 22, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginRight: 10 },
  inputStyle: { color: '#fff', fontSize: 14, flex: 1 },
  actionCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1C1E2E', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  exitBox: { width: '80%', backgroundColor: '#1C1E2E', padding: 25, borderRadius: 20, alignItems: 'center' },
  exitTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  exitSub: { color: '#7f8c8d', textAlign: 'center', marginTop: 10 },
  btnRow: { flexDirection: 'row', marginTop: 25 },
  noBtn: { backgroundColor: '#34495e', paddingVertical: 10, paddingHorizontal: 25, borderRadius: 10, marginRight: 15 },
  yesBtn: { backgroundColor: '#e74c3c', paddingVertical: 10, paddingHorizontal: 25, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: 'bold' },


  raiseHandBtn: {
  backgroundColor: '#f1c40f',
  paddingHorizontal: 15,
  paddingVertical: 10,
  borderRadius: 20,
  marginRight: 10
},

raiseHandText: {
  color: '#000',
  fontWeight: 'bold'
},

bottomSheetOverlay:{
 flex:1,
 justifyContent:'flex-end',
 backgroundColor:'rgba(0,0,0,0.5)'
},

requestSheet:{
 backgroundColor:'#1C1E2E',
 height:'55%',
 borderTopLeftRadius:25,
 borderTopRightRadius:25,
 padding:20
},

});        