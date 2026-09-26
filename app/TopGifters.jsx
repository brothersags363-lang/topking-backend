import React, { useCallback, useEffect, useState, memo } from "react";

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  BackHandler,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";

import {
  doc,
  onSnapshot,
} from "firebase/firestore";

import { auth, db } from "./firebaseConfig";

import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";

// Fast, cached avatar - memory-disk cache means an already-seen gifter's
// photo shows up instantly instead of re-downloading, with a smooth
// fade-in instead of a hard pop-in.
const FastImage = ({ style, uri }) => (
  <ExpoImage
    source={{ uri }}
    style={style}
    contentFit="cover"
    cachePolicy="memory-disk"
    transition={150}
    recyclingKey={uri}
  />
);

// Memoized row: a gifter's row only re-renders when its own data changes,
// not on every re-render of the screen.
const GifterRow = memo(function GifterRow({ item, rank, onOpenProfile }) {

  const imageUri =
    item.profileImg ||
    item.photo ||
    item.photoURL ||
    item.profile ||
    item.avatar ||
    "";

  return (
    <View style={styles.gifterRow}>

      {/* RANK NUMBER */}
      <View style={styles.rankBox}>
        <Text style={styles.rankText}>{rank}</Text>
      </View>

      {/* PROFILE IMAGE */}
      <TouchableOpacity
        style={styles.imageWrapper}
        activeOpacity={0.8}
        onPress={onOpenProfile}
      >

        {imageUri ? (
          <FastImage uri={imageUri} style={styles.memberImg} />
        ) : (
          <View style={[styles.memberImg, styles.emptyImage]}>
            <Ionicons name="person" size={18} color="#999" />
          </View>
        )}

      </TouchableOpacity>

      {/* USERNAME */}
      <Text numberOfLines={1} ellipsizeMode="tail" style={styles.gifterName}>
        {item.username ? `@${item.username}` : item.name || "User"}
      </Text>

      {/* GIFTING STARS */}
      <View style={styles.starRow}>
        <Ionicons name="star" size={13} color="#FFD700" />
        <Text style={styles.starText}>
          {Number(item.stars || 0).toLocaleString()}
        </Text>
      </View>

    </View>
  );
},
(prev, next) => prev.item === next.item && prev.rank === next.rank
);

export default function TopGifters() {

  const router = useRouter();

  const [topGifters, setTopGifters] = useState([]);
  const [giftUserCount, setGiftUserCount] = useState(0);
  const [loading, setLoading] = useState(true);



  // =========================
  // MOBILE BACK BUTTON
  // =========================
  // Uses the same expo-router navigation as the rest of the app (instead
  // of raw @react-navigation/native) so back behaves consistently and
  // doesn't risk the "action not handled by any navigator" class of bug
  // that comes from mixing the two navigation systems.
  useEffect(() => {

    const onBackPress = () => {

      if (router.canGoBack()) {
        router.back();
        return true;
      }

      return false;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress
    );

    return () => {
      subscription.remove();
    };

  }, [router]);


  useEffect(() => {

    const uid = auth.currentUser?.uid;

    if (!uid) {
      setLoading(false);
      return;
    }

    const userRef = doc(db, "users", uid);

    const unsubscribe = onSnapshot(
      userRef,

      (snapshot) => {

        if (!snapshot.exists()) {

          setTopGifters([]);
          setGiftUserCount(0);
          setLoading(false);

          return;
        }

        const userData = snapshot.data();

        // Firestore stores topGifters as an object/map - convert to array.
        const topGiftersData = userData.topGifters || {};

        const gifters = Object.entries(topGiftersData).map(
          ([gifterUid, gifter]) => ({
            ...gifter,

            uid: gifter.uid || gifterUid,

            name: gifter.name || "",

            username: gifter.username || "",

            profileImg:
              gifter.profileImg ||
              gifter.photoURL ||
              gifter.photo ||
              "",

            photo:
              gifter.profileImg ||
              gifter.photoURL ||
              gifter.photo ||
              "",

            stars: Number(gifter.stars || 0),
          })
        );

        // Highest gifting first.
        gifters.sort(
          (a, b) => Number(b.stars || 0) - Number(a.stars || 0)
        );

        setGiftUserCount(gifters.length);
        setTopGifters(gifters);
        setLoading(false);

      },

      (error) => {

        if (__DEV__) {
          console.log("TOP GIFTERS SNAPSHOT ERROR =", error);
        }

        setLoading(false);

      }

    );

    return () => unsubscribe();

  }, []);


  const openGifterProfile = useCallback(
    (gifterUid) => {

      if (!gifterUid) return;

      router.push({
        pathname: "/userProfile",
        params: { userId: gifterUid },
      });

    },
    [router]
  );

  const renderItem = useCallback(
    ({ item, index }) => (
      <GifterRow
        item={item}
        rank={index + 1}
        onOpenProfile={() => openGifterProfile(item.uid)}
      />
    ),
    [openGifterProfile]
  );

  const keyExtractor = useCallback(
    (item, index) => item.uid || `gifter-${index}`,
    []
  );


  return (

    <View style={styles.container}>

      {/* TITLE */}
      <Text style={styles.title}>Angels</Text>

      {/* TOTAL GIFTER COUNT */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total Gifters:</Text>
        <Text style={styles.totalCount}>{giftUserCount}</Text>
      </View>

      {/* GIFTER LIST */}
      {loading ? (

        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#FFD700" />
        </View>

      ) : (

        <FlatList
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          data={topGifters}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          showsVerticalScrollIndicator={true}
          nestedScrollEnabled={true}
          removeClippedSubviews={true}
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={7}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <Ionicons name="gift-outline" size={30} color="#777" />
              <Text style={styles.emptyText}>No gifters yet</Text>
            </View>
          }
        />

      )}

    </View>

  );

}


const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 10,
  },

  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 29,
    marginBottom: 15,
  },

  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  totalLabel: {
    color: "#aaa",
    fontSize: 12,
    fontWeight: "600",
  },

  totalCount: {
    color: "#FFD700",
    fontSize: 13,
    fontWeight: "bold",
    marginLeft: 5,
  },

  scrollView: {
    flex: 1,
    backgroundColor: "#000",
  },

  scrollContent: {
    paddingBottom: 20,
  },

  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  gifterRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#171717",
  },

  rankBox: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },

  rankText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },

  imageWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFD700",
    backgroundColor: "#222",
    overflow: "hidden",
    marginRight: 6,
  },

  memberImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },

  emptyImage: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#222",
  },

  gifterName: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    width: 85,
    marginRight: 5,
  },

  starRow: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: "auto",
    minWidth: 65,
    justifyContent: "flex-end",
    paddingRight: 5,
  },

  starText: {
    color: "#FFD700",
    fontSize: 11,
    fontWeight: "bold",
    marginLeft: 2,
  },

  emptyList: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 30,
  },

  emptyText: {
    color: "#777",
    fontSize: 12,
    marginTop: 6,
  },

});
