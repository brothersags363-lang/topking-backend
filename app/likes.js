// app/likes.js  -  jin videos ko is user ne like kiya hai unki list (halka + fast)
// 3-3 videos ke batch mein load hoti hain, har batch aate hi grid mein judta hai
import React, { useEffect, useState, useCallback, useRef, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  Dimensions,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, getDocs, documentId, query, where } from "firebase/firestore";
import { db } from "./firebaseConfig";

const { width } = Dimensions.get("window");
const ITEM_WIDTH = width / 3 - 2;
const THUMB_FALLBACK = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
const PAGE = 3; // ek baar mein 3 videos

// ek chhota batch (max 3 ids, Firestore "in" limit 10 se kam hai)
const fetchVideosByIds = async (ids) => {
  const snap = await getDocs(
    query(collection(db, "all_videos"), where(documentId(), "in", ids))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

const Thumb = memo(function Thumb({ item, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.85} style={styles.item} onPress={() => onPress(item)}>
      <ExpoImage
        source={{ uri: item.thumbnail || item.thumbUrl || THUMB_FALLBACK }}
        style={styles.thumb}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={item.id}
        transition={0}
      />
      <View style={styles.likeBadge}>
        <Ionicons name="heart" size={12} color="#ff3b5c" />
        <Text style={styles.likeText}>{item.likes || 0}</Text>
      </View>
    </TouchableOpacity>
  );
});

export default function LikesScreen() {
  const router = useRouter();
  const { userId, username } = useLocalSearchParams();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef([]);
  listRef.current = videos;

  // =========================
  // MOBILE HARDWARE BACK (wallet.tsx jaisa same)
  // =========================
  useEffect(() => {
    const backAction = () => {
      router.back();
      return true;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => {
      subscription.remove();
    };
  }, [router]);

  // ---- 3-3 karke load ----
  useEffect(() => {
    let alive = true;
    setVideos([]);
    setLoading(true);

    (async () => {
      if (!userId) return setLoading(false);
      try {
        const snap = await getDocs(collection(db, "userLikes", String(userId), "likedVideos"));

        // latest liked pehle (agar likedAt / createdAt saved ho)
        const ids = snap.docs
          .map((d) => {
            const t = d.data() || {};
            const ts = t.likedAt?.seconds || t.createdAt?.seconds || 0;
            return { id: d.id, ts };
          })
          .sort((a, b) => b.ts - a.ts)
          .map((x) => x.id);

        if (ids.length === 0) return;

        for (let i = 0; i < ids.length && alive; i += PAGE) {
          const part = await fetchVideosByIds(ids.slice(i, i + PAGE));
          if (!alive) break;

          // batch ke andar bhi order sahi rakho
          const order = ids.slice(i, i + PAGE);
          part.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

          setVideos((prev) => {
            const seen = new Set(prev.map((v) => v.id));
            return [...prev, ...part.filter((v) => !seen.has(v.id))];
          });
          if (i === 0) setLoading(false); // pehle 3 aate hi loader hata do
        }
      } catch (e) {
        if (__DEV__) console.log("LIKES LOAD ERROR =", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  const openVideo = useCallback(
    (item) => {
      const full = listRef.current;
      const idx = full.findIndex((v) => v.id === item.id);
      const start = Math.max(0, idx - 10);
      router.push({
        pathname: "/allvideo",
        params: {
          videos: JSON.stringify(full.slice(start, start + 40)),
          index: idx - start,
          userId,
        },
      });
    },
    [router, userId]
  );

  const renderItem = useCallback(({ item }) => <Thumb item={item} onPress={openVideo} />, [openVideo]);
  const keyExtractor = useCallback((item) => item.id, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {username ? `@${username} - Likes` : "Likes"}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFD700" />
        </View>
      ) : videos.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="heart-outline" size={40} color="#555" />
          <Text style={styles.empty}>Abhi koi liked video nahi</Text>
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          numColumns={3}
          initialNumToRender={12}
          maxToRenderPerBatch={9}
          windowSize={5}
          removeClippedSubviews
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#222",
  },
  title: { color: "#fff", fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: "#888", marginTop: 10 },
  item: { width: ITEM_WIDTH, height: ITEM_WIDTH * 1.4, margin: 1, backgroundColor: "#111" },
  thumb: { width: "100%", height: "100%" },
  likeBadge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  likeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
});
