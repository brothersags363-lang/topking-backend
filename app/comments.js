import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, 
  TouchableOpacity, KeyboardAvoidingView, Platform, 
  ActivityIndicator, Image, Keyboard
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// FIREBASE IMPORTS
import { db, auth } from './firebaseConfig'; 
import { 
  collection, addDoc, query, orderBy, 
  onSnapshot, serverTimestamp, doc, updateDoc, increment, getDoc 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function CommentsScreen() {
  const router = useRouter();
  const { videoId } = useLocalSearchParams();
  
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUserData, setCurrentUserData] = useState({
    name: 'User',
    photo: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' 
  });

  // 1. User Data Fetch
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            setCurrentUserData({
              name: data.username || data.name || 'User',
              photo: data.profileImg || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
            });
          }
        } catch (e) { console.log(e); }
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // 2. Comments Load
  useEffect(() => {
    if (!videoId) return;
    const q = query(collection(db, 'all_videos', videoId, 'comments'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setComments(docs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [videoId]);

  // 3. Post Comment
  const postComment = async () => {
    const user = auth.currentUser;
    if (!user || !commentText.trim()) return;
    const textToSend = commentText;
    setCommentText(''); 
    Keyboard.dismiss();
    try {
      await addDoc(collection(db, 'all_videos', videoId, 'comments'), {
        text: textToSend,
        userId: user.uid, 
        username: currentUserData.name,
        profilePic: currentUserData.photo, 
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'all_videos', videoId), { commentsCount: increment(1) });
    } catch (error) { console.error(error); }
  };

  // ==========================================
  // 4. INSTA-STYLE BACK LOGIC (THE FIX)
  // ==========================================
  const handleBackNavigation = () => {
    if (router.canGoBack()) {
      router.back(); // Yeh user ko wapas usi video par le jayega jahan se wo aaya tha
    } else {
      router.replace('/'); // Safety: Agar koi history nahi hai toh home par bhej do
    }
  };

  const renderComment = ({ item }) => (
    <View style={styles.commentCard}>
      <Image source={{ uri: item.profilePic }} style={styles.avatar} />
      <View style={styles.commentContent}>
        <View style={styles.commentHeader}>
          <Text style={styles.usernameText}>{item.username}</Text>
          <Text style={styles.timeText}>just now</Text>
        </View>
        <Text style={styles.commentBody}>{item.text}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.commentSheet}></View>
      {/* HEADER */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBackNavigation}>
          <Ionicons name="chevron-down" size={32} color="white" />
        </TouchableOpacity>
        <Text style={styles.title}>Comments</Text>
        <View style={{ width: 45 }} />
      </View>

      {/* LIST */}
      {loading ? (
        <ActivityIndicator size="large" color="#FFD700" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={comments}
          renderItem={renderComment}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 15 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* INPUT */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.inputWrapper}
      >
        <View style={styles.inputContainer}>
          <Image source={{ uri: currentUserData.photo }} style={styles.mySmallPhoto} />
          <TextInput
            style={styles.input}
            placeholder={`Comment as ${currentUserData.name}...`}
            placeholderTextColor="#888"
            value={commentText}
            onChangeText={setCommentText}
            multiline
          />
          <TouchableOpacity onPress={postComment} disabled={!commentText.trim()}>
            <Text style={[styles.postText, { opacity: commentText.trim() ? 1 : 0.4 }]}>Post</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
container: {
  flex: 1,
  backgroundColor: '#000'

},

commentSheet: {
  height: "60%",
  backgroundColor: "#000",
  borderTopLeftRadius: 25,
  borderTopRightRadius: 25,

},
  topHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingBottom: 15, borderBottomWidth: 0.3, borderBottomColor: '#222' },
  backBtn: { marginLeft: 15 },
  title: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  commentCard: { flexDirection: 'row', marginTop: 20 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#333' },
  commentContent: { flex: 1, marginLeft: 12 },
  commentHeader: { flexDirection: 'row', alignItems: 'center' },
  usernameText: { color: 'white', fontSize: 13, fontWeight: 'bold' },
  timeText: { color: '#666', fontSize: 11, marginLeft: 8 },
  commentBody: { color: '#eee', fontSize: 14, marginTop: 3 },
  inputWrapper: { position: 'absolute', bottom: Platform.OS === 'ios' ? 40 : 10, width: '100%', backgroundColor: '#000', paddingVertical: 10 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121212', marginHorizontal: 10, borderRadius: 25, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 0.5, borderColor: '#333' },
  mySmallPhoto: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#FFD700' },
  input: { flex: 1, color: 'white', paddingHorizontal: 12, fontSize: 14 },
  postText: { color: '#0095f6', fontWeight: 'bold', fontSize: 15, paddingRight: 5 }
});