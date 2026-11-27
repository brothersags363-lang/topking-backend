import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  Dimensions,
  Animated,
   BackHandler,
  Share,
} from "react-native";
import { scopedBackHandler } from "../utils/scopedBack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Audio } from "../utils/audio";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  increment,
} from "firebase/firestore";

import { db } from "./firebaseConfig";

import { useLocalSearchParams } from "expo-router";
import { useRouter } from "../utils/safeRouter";

const { width } = Dimensions.get("window");

export default function MusicDetails() {

  const router = useRouter();
  const insets = useSafeAreaInsets();
const params = useLocalSearchParams();

const {
musicName,
username,
profile,
audioUrl,
} = useLocalSearchParams();

const firstParam = (value) =>
  Array.isArray(value) ? value[0] : value;

// Keep the same sound identity through camera, editor, and publish.  Older
// reel records only have username/profile, so use those as safe fallbacks.
const selectedMusicId = firstParam(params?.musicId) || "";
const selectedMusicArtist =
  firstParam(params?.musicArtist) ||
  firstParam(params?.artist) ||
  firstParam(username) ||
  "";
const selectedMusicImage =
  firstParam(params?.musicImage) ||
  firstParam(params?.image) ||
  firstParam(profile) ||
  "";

console.log("audioUrl =", audioUrl);


const [sound,setSound]=useState(null);

const [playing,setPlaying]=useState(false);

const [videos, setVideos] = useState([]);

const stopMusic = async () => {

  try {

    if (sound) {

      await sound.stopAsync();

      await sound.unloadAsync();

      setSound(null);

      setPlaying(false);

    }

  } catch (e) {

    console.log(e);

  }

};

useEffect(()=>{

let music;

const loadMusic=async()=>{

try{

const { sound }=
await Audio.Sound.createAsync(

{
uri:audioUrl,
},

{
shouldPlay:true,
isLooping:true,
}

);

music=sound;

setSound(sound);

setPlaying(true);

}catch(e){

console.log(e);

}

};

if(audioUrl){

loadMusic();

}

return () => {

  if (music) {

    music.stopAsync().catch(() => {});

    music.unloadAsync().catch(() => {});

  }

};

},[audioUrl]);





useEffect(() => {

  const backHandler = scopedBackHandler('/musicDetails', 

    "hardwareBackPress",

    () => {

      stopMusic();

      router.back();

      return true;

    }

  );

  return () => backHandler.remove();

}, [sound]);




useEffect(() => {

  const loadVideos = async () => {

    try {

      // Same sound ki saari reels: musicId se (naye reels), warna
      // audioUrl se (purane reels jinme musicId nahi hai).
      const q = selectedMusicId
        ? query(
            collection(db, "all_videos"),
            where("musicId", "==", selectedMusicId)
          )
        : query(
            collection(db, "all_videos"),
            where("audioUrl", "==", audioUrl)
          );

      const snap = await getDocs(q);

      const list = [];

      snap.forEach((doc) => {

        list.push({

          id: doc.id,

          ...doc.data(),

        });

      });

      setVideos(list);

    } catch (e) {

      console.log(e);

    }

  };

  if (audioUrl) {

    loadVideos();

  }

}, [audioUrl, selectedMusicId]);






  // ---------- favorite (same list as Select Music) ----------
  const FAV_KEY = "music_favorites_v1";
  const [fav, setFav] = useState(false);
  useEffect(() => {
    if (!selectedMusicId) return;
    AsyncStorage.getItem(FAV_KEY)
      .then((raw) => setFav((raw ? JSON.parse(raw) : []).includes(selectedMusicId)))
      .catch(() => {});
  }, [selectedMusicId]);
  const toggleFav = async () => {
    if (!selectedMusicId) return;
    try {
      const raw = await AsyncStorage.getItem(FAV_KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      const next = list.includes(selectedMusicId)
        ? list.filter((x) => x !== selectedMusicId)
        : [selectedMusicId, ...list];
      await AsyncStorage.setItem(FAV_KEY, JSON.stringify(next.slice(0, 200)));
      setFav(next.includes(selectedMusicId));
    } catch (_) {}
  };

  const shareMusic = () => {
    Share.share({
      message: `🎵 ${firstParam(musicName) || "Original Music"} - TopKing par is gaane par video banao!`,
    }).catch(() => {});
  };

  // Pioneer (pehli video) + baaki views ke hisaab se No.1, No.2 ...
  const ranked = useMemo(() => {
    if (!videos.length) return [];
    const ts = (v: any) => v.createdAt?.seconds ?? v.createdAt?._seconds ?? 0;
    const pioneer = videos.reduce((p: any, v: any) => (ts(v) && ts(v) < ts(p) ? v : p), videos[0]);
    const rest = videos
      .filter((v: any) => v.id !== pioneer.id)
      .sort((x: any, y: any) => (Number(y.views) || 0) - (Number(x.views) || 0));
    return [{ ...pioneer, _badge: "Pioneer" }, ...rest.map((v: any, i: number) => ({ ...v, _rank: i + 1 }))];
  }, [videos]);

  const usedBy = useMemo(() => new Set(videos.map((v: any) => v.userId).filter(Boolean)).size, [videos]);

  const applyMusic = async () => {
    try {
      if (selectedMusicId) await updateDoc(doc(db, "songs", selectedMusicId), { uses: increment(1) });
    } catch (e) { console.log("Song use counter:", e); }
    // Sirf preview band. Camera record dabane par gaana chalata hai.
    if (sound) {
      try {
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch (_) {}
      setPlaying(false);
      setSound(null);
    }
    router.push({
      pathname: "/camera",
      params: {
        audioUrl,
        musicName,
        profile,
        username,
        musicId: selectedMusicId,
        musicArtist: selectedMusicArtist,
        musicImage: selectedMusicImage,
      },
    });
  };

  const openVideo = (item: any) => {
    const selectedIndex = videos.findIndex((v: any) => v.id === item.id);
    router.push({
      pathname: "/allvideo",
      params: {
        videos: JSON.stringify(videos),
        index: selectedIndex,
        userId: item.userId,
        from: "userProfile",
      },
    });
  };

  const header = (
    <View>
      <View style={styles.header}>
        <TouchableOpacity
          hitSlop={10}
          onPress={async () => {
            await stopMusic();
            router.back();
          }}
        >
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cover}
          activeOpacity={0.85}
          onPress={async () => {
            if (!sound) return;
            if (playing) {
              await sound.pauseAsync();
              setPlaying(false);
            } else {
              await sound.playAsync();
              setPlaying(true);
            }
          }}
        >
          <Image
            source={{ uri: (selectedMusicImage || profile || "https://cdn-icons-png.flaticon.com/512/3135/3135715.png") as string }}
            style={styles.coverImg}
          />
          <View style={styles.coverPlay}>
            <Ionicons name={playing ? "pause" : "play"} size={20} color="#fff" />
          </View>
        </TouchableOpacity>

        <View style={styles.headerRight}>
          <TouchableOpacity onPress={toggleFav} hitSlop={8}>
            <Ionicons name={fav ? "star" : "star-outline"} size={24} color={fav ? "#FFD60A" : "#fff"} />
          </TouchableOpacity>
          <TouchableOpacity onPress={shareMusic} hitSlop={8} style={{ marginLeft: 16 }}>
            <Ionicons name="arrow-redo-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.musicTitle} numberOfLines={1}>{firstParam(musicName) || "Original Music"}</Text>
      {!!(selectedMusicArtist || username) && (
        <Text style={styles.userName} numberOfLines={1}>
          @{String(selectedMusicArtist || firstParam(username) || "").replace(/^@/, "")}
        </Text>
      )}
      <Text style={styles.totalVideos}>Used by {usedBy || videos.length} people</Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        data={ranked}
        keyExtractor={(item: any) => item.id}
        numColumns={3}
        ListHeaderComponent={header}
        initialNumToRender={9}
        maxToRenderPerBatch={9}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
        renderItem={({ item }: any) => (
          <TouchableOpacity style={styles.videoCard} activeOpacity={0.85} onPress={() => openVideo(item)}>
            <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFill} />
            {item._badge ? (
              <View style={styles.pioneer}>
                <Text style={styles.pioneerText}>{item._badge}</Text>
              </View>
            ) : null}
            {item._rank && item._rank <= 3 ? <Text style={styles.rank}>No.{item._rank}</Text> : null}
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={[styles.applyBtn, { bottom: 16 + insets.bottom }]} activeOpacity={0.85} onPress={applyMusic}>
        <Ionicons name="videocam" size={18} color="#000" />
        <Text style={styles.applyText}>Apply Music</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  header: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    paddingHorizontal: 14, paddingTop: 14,
  },
  headerRight: { flexDirection: "row", alignItems: "center", width: 64, justifyContent: "flex-end", marginTop: 4 },
  cover: { width: 70, height: 70, borderRadius: 6, overflow: "hidden", marginLeft: 36, backgroundColor: "#222" },
  coverImg: { width: "100%", height: "100%" },
  coverPlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
  musicTitle: { color: "#fff", fontSize: 17, fontWeight: "700", textAlign: "center", marginTop: 14, paddingHorizontal: 30 },
  userName: { color: "#FFD60A", fontSize: 13, textAlign: "center", marginTop: 6 },
  totalVideos: { color: "#ddd", fontSize: 12, textAlign: "center", marginTop: 6, marginBottom: 18 },
  videoCard: { width: width / 3 - 2, height: (width / 3) * 1.33, margin: 1, backgroundColor: "#222", overflow: "hidden" },
  pioneer: { position: "absolute", top: 0, left: 0, backgroundColor: "#7c4dff", paddingHorizontal: 5, paddingVertical: 1, borderBottomRightRadius: 4 },
  pioneerText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  rank: {
    position: "absolute", right: 6, bottom: 4, color: "#fff", fontSize: 13, fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.7)", textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 },
  },
  applyBtn: {
    position: "absolute", bottom: 28, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FFD60A", paddingHorizontal: 30, height: 46, borderRadius: 6,
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  applyText: { color: "#000", fontSize: 15, fontWeight: "700" },
});
