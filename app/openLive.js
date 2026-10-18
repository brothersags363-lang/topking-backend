import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useEffect } from "react";
import { ActivityIndicator, Alert, View } from "react-native";

import { db } from "./firebaseConfig";

export default function OpenLive() {
  const router = useRouter();
  const { id, key } = useLocalSearchParams();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const roomId = String(id || "");
        const snap = roomId ? await getDoc(doc(db, "rooms", roomId)) : null;

        if (cancelled) return;

        if (!snap || !snap.exists()) {
          Alert.alert("Live", "Ye live ab available nahi hai.");
          router.replace("/");
          return;
        }

        const data = snap.data() || {};
        const status = String(data.status || "").toLowerCase();
        if (status === "ended" || status === "closed" || status === "inactive") {
          Alert.alert("Live", "Ye live khatam ho chuki hai.");
          router.replace("/");
          return;
        }

        const isVideo = String(data.type || "audio").toLowerCase() === "video";
        const isPrivate = data.isPrivate === true || data.roomType === "private";

        if (isVideo) {
          router.replace({ pathname: "/videolive", params: { id: roomId, role: "viewer" } });
        } else if (isPrivate) {
          router.replace({
            pathname: "/LivePrivate",
            params: { id: roomId, ...(key ? { key: String(key) } : {}) },
          });
        } else {
          router.replace({ pathname: "/LiveRoom", params: { id: roomId } });
        }
      } catch (e) {
        if (!cancelled) router.replace("/");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, key]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator color="#fff" />
    </View>
  );
}
