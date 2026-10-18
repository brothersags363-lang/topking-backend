import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useEffect } from "react";
import { ActivityIndicator, Alert, View } from "react-native";

import { db } from "./firebaseConfig";

export default function OpenVideo() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const videoId = String(id || "");
        const snap = videoId ? await getDoc(doc(db, "all_videos", videoId)) : null;

        if (cancelled) return;

        if (!snap || !snap.exists()) {
          Alert.alert("Video", "Ye video ab available nahi hai.");
          router.replace("/");
          return;
        }

        const item = { id: snap.id, ...snap.data() };

        router.replace({
          pathname: "/allvideo",
          params: {
            videoId: item.id,
            userId: item.userId,
            from: "link",
            videos: JSON.stringify([item]),
            index: 0,
          },
        });
      } catch (e) {
        if (!cancelled) router.replace("/");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator color="#fff" />
    </View>
  );
}
