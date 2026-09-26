import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  memo,
} from 'react';

import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';

import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';

import { db } from './firebaseConfig';

import {
  getAuth
} from 'firebase/auth';

import {
  useLocalSearchParams,
  useRouter,
} from 'expo-router';

const { width } = Dimensions.get('window');

const auth = getAuth();

// Fast, cached avatar: memory-disk cache means a friend's photo that has
// already loaded elsewhere in the app shows up instantly here instead of
// re-downloading, plus a smooth fade-in instead of a hard pop-in.
const FastImage = ({ style, uri, fallback }) => (
  <ExpoImage
    source={{ uri: uri || fallback }}
    style={style}
    contentFit="cover"
    cachePolicy="memory-disk"
    transition={150}
    recyclingKey={uri || fallback}
  />
);

// Memoized friend row: only re-renders when THIS row's selected state (or
// its own data) actually changes. Before this, tapping one friend to
// select them re-rendered the entire list (every avatar image included)
// because `renderItem` and the selection check were recreated fresh on
// every render - that's what was showing up as lag when selecting people.
const FriendRow = memo(
  function FriendRow({ item, isSelected, onPress }) {
    return (
      <TouchableOpacity style={styles.row} onPress={onPress}>
        <FastImage
          uri={item.profile}
          fallback="https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
          style={styles.profile}
        />

        <Text style={styles.name}>@{item.username}</Text>

        <View
          style={[styles.circle, isSelected && styles.selected]}
        >
          {isSelected && (
            <Ionicons name="checkmark" size={18} color="#fff" />
          )}
        </View>
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.item === next.item && prev.isSelected === next.isSelected
);

export default function ShareVideo() {

  const router = useRouter();

  const {
    type,
    roomId,

    videoId,
    videoUrl,
    thumbnail,
  } = useLocalSearchParams();

  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(true);

  const [search, setSearch] = useState('');

  const [selectedUsers, setSelectedUsers] = useState([]);

  const [sending, setSending] = useState(false);

  useEffect(() => {

    loadFriends();

  }, []);



  const loadFriends = async () => {

    const user = auth.currentUser;

    if (!user) {
      setFriendsLoading(false);
      return;
    }

    try {

      setFriendsLoading(true);

      // Main kin ko follow karta hu
      const followingQuery = query(
        collection(db, "follows"),
        where("followerId", "==", user.uid)
      );

      // Kaun mujhe follow karta hai
      const followerQuery = query(
        collection(db, "follows"),
        where("followingId", "==", user.uid)
      );

      // Both directions are independent reads - run them together
      // instead of one after another.
      const [followingSnap, followerSnap] = await Promise.all([
        getDocs(followingQuery),
        getDocs(followerQuery),
      ]);

      const followingIds = followingSnap.docs.map(
        (d) => d.data().followingId
      );

      const followerIds = followerSnap.docs.map(
        (d) => d.data().followerId
      );

      // Mutual follow
      const friendIds = followingIds.filter((id) =>
        followerIds.includes(id)
      );

      const friendUsers = await Promise.all(
        friendIds.map(async (uid) => {

          const userSnap = await getDoc(doc(db, "users", uid));

          if (userSnap.exists()) {
            return {
              id: uid,
              friendId: uid,
              username: userSnap.data().username,
              profile: userSnap.data().profileImg,
              fullData: userSnap.data(),
            };
          }

          return null;
        })
      );

      setFriends(friendUsers.filter(Boolean));

    } catch (error) {

      if (__DEV__) console.log("FRIEND ERROR:", error);

    } finally {

      setFriendsLoading(false);

    }
  };




  const selectUser = useCallback((uid) => {

    setSelectedUsers((prev) =>
      prev.includes(uid)
        ? prev.filter((x) => x !== uid)
        : [...prev, uid]
    );

  }, []);

  const sendVideo = async () => {

    // Guard against double-tap: without this, a fast double-press could
    // fire the whole send flow twice and create duplicate chat messages.
    if (sending) return;

    const me = auth.currentUser;

    if (!me) return;

    if (selectedUsers.length === 0) return;

    setSending(true);

    try {

      const [senderSnap, videoSnap] = await Promise.all([
        getDoc(doc(db, "users", me.uid)),
        type === "live"
          ? Promise.resolve(null)
          : getDoc(doc(db, "all_videos", videoId)),
      ]);

      const videoData =
        videoSnap && videoSnap.exists() ? videoSnap.data() : {};

      const senderData = senderSnap.exists() ? senderSnap.data() : {};

      // Send to every selected friend in parallel instead of one after
      // another - with several friends selected this is the difference
      // between one round-trip and N sequential round-trips.
      await Promise.all(
        selectedUsers.map(async (uid) => {

          const receiverData =
            friends.find((item) => item.friendId === uid)?.fullData || {};

          const chatId = [me.uid, uid].sort().join("_");

          const messagePayload =
            type === "live"
              ? {
                  type: "live",
                  roomId: roomId,
                  senderId: me.uid,
                  receiverId: uid,
                  createdAt: serverTimestamp(),
                }
              : {
                  type: "video",

                  videoId,
                  videoUrl,
                  thumbnail,

                  senderId: me.uid,
                  receiverId: uid,

                  userId: videoData.userId || "",
                  username: videoData.username || "",
                  profile: videoData.profile || "",
                  caption: videoData.caption || "",
                  likes: videoData.likes || 0,
                  commentsCount: videoData.commentsCount || 0,
                  shares: videoData.shares || 0,
                  views: videoData.views || 0,

                  createdAt: serverTimestamp(),
                };

          await Promise.all([

            addDoc(
              collection(db, "chats", chatId, "messages"),
              messagePayload
            ),

            setDoc(
              doc(db, "userChats", uid, "friends", me.uid),
              {
                userId: me.uid,
                username: senderData?.username || "",
                profileImg: senderData?.profileImg || "",
                lastMessage: "🎥 Video",
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            ),

            setDoc(
              doc(db, "userChats", me.uid, "friends", uid),
              {
                userId: uid,
                username: receiverData?.username || "",
                profileImg: receiverData?.profileImg || "",
                lastMessage: "🎥 Video",
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            ),

          ]);

        })
      );

      Alert.alert("Success", "Video Sent");

      router.back();

    } catch (e) {

      if (__DEV__) console.log(e);

      Alert.alert("Error", "Video send nahi ho paya, dobara try karein.");

    } finally {

      setSending(false);

    }
  };

  // Recomputed only when friends or the search text actually change -
  // not on every render (e.g. every time a friend gets selected).
  const filtered = useMemo(
    () =>
      friends.filter((item) =>
        item.username?.toLowerCase().includes(search.toLowerCase())
      ),
    [friends, search]
  );

  const renderItem = useCallback(
    ({ item }) => (
      <FriendRow
        item={item}
        isSelected={selectedUsers.includes(item.friendId)}
        onPress={() => selectUser(item.friendId)}
      />
    ),
    [selectedUsers, selectUser]
  );

  const keyExtractor = useCallback((item) => item.id, []);

  return (

    <View style={styles.container}>

      {/* Search */}

      <View style={styles.searchBox}>

        <Ionicons name="search" size={30} color="#000" />

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search"
          style={styles.input}
        />

      </View>

      {/* Friend List */}

      {friendsLoading ? (

        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#FFD700" />
        </View>

      ) : (

        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          removeClippedSubviews={true}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              Koi mutual friend nahi mila
            </Text>
          }
        />

      )}

      {/* Send */}

      {selectedUsers.length > 0 && (

        <TouchableOpacity
          style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
          onPress={sendVideo}
          disabled={sending}
        >

          {sending ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={{ color: '#000', fontWeight: 'bold' }}>
              Send ({selectedUsers.length})
            </Text>
          )}

        </TouchableOpacity>

      )}

    </View>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 60,
  },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    paddingHorizontal: 10,
    borderRadius: 5,
    height: 50,
  },

  input: {
    flex: 1,
    fontSize: 18,
    marginLeft: 10,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 25,
  },

  profile: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },

  name: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 12,
    flex: 1,
  },

  circle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },

  selected: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },

  sendBtn: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    height: 50,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 30,
  },

  sendBtnDisabled: {
    opacity: 0.7,
  },

  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyText: {
    color: '#777',
    textAlign: 'center',
    marginTop: 40,
  },

});
