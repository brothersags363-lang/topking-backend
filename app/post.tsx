import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Alert,
  ActivityIndicator,
  StatusBar,
  Image,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useLocalSearchParams } from 'expo-router';
import { useRouter } from '../utils/safeRouter';
import axios from 'axios';



import { BackHandler } from 'react-native';
import { scopedBackHandler } from '../utils/scopedBack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { useNavigation } from "@react-navigation/native";

// FIREBASE
import { db, auth } from './firebaseConfig'; // 'auth' import kiya

// BACKGROUND UPLOAD (upload screen se hatne ke baad bhi chalta rehta hai)
// Ye files ab app/ folder ke BAHAR services/upload/ me hain, isliye
// '@/...' alias (tsconfig.json me set) se import kar rahe hain.
import { startReelUpload } from '@/services/upload/reelUploadService';
import { useUploadState } from '@/services/upload/uploadManager';
import { blockIfProfane } from '../utils/guardText';
import {
  saveDraft,
  deleteDraft,
  getSaveFolder,
  pickSaveFolder,
  saveVideoToDevice,
} from '../utils/reelDrafts';

// Screenshot jaisi "Video Language" chips. value = jo Firestore me jata hai.
const LANG_CHIPS = [
  { label: 'English', value: 'English' },
  { label: 'हिंदी', value: 'Hindi' },
  { label: 'বাংলা', value: 'Bengali' },
  { label: 'اردو', value: 'Urdu' },
  { label: 'ગુજરાતી', value: 'Gujarati' },
  { label: 'മലയാളം', value: 'Malayalam' },
  { label: 'भोजपुरी', value: 'Bhojpuri' },
  { label: 'ਪੰਜਾਬੀ', value: 'Punjabi' },
  { label: 'मराठी', value: 'Marathi' },
];
const YELLOW = '#FFD60A';

// Share button dabate hi is route par navigate karke feed dikha dete hain.
// Apne project ke actual reels/home route se match kar lena agar alag ho.
const REELS_HOME_ROUTE = '/';

import { doc, getDoc } from 'firebase/firestore';

import {
  Hashtag,
  cleanTag,
  extractHashtags,
  formatCount,
  subscribeHashtags,
} from '@/services/hashtags/hashtagService';

const HASH_ROW_HEIGHT = 56;

// memo: list scroll karte time sirf wahi rows re-render hongi jinka data badla
const HashtagRow = memo(function HashtagRow({
  item,
  rank,
  onPress,
}: {
  item: Hashtag;
  rank: number;
  onPress: (name: string) => void;
}) {
  return (
    <TouchableOpacity style={styles.hashRow} onPress={() => onPress(item.name)} activeOpacity={0.6}>
      <View style={styles.hashLeft}>
        <Text style={styles.hashRank}>{rank}</Text>
        <Text style={styles.hashName} numberOfLines={1}>#{item.name}</Text>
      </View>
      <Text style={styles.hashUses}>
        {formatCount(item.uses)} {item.uses === 1 ? 'video' : 'videos'}
      </Text>
    </TouchableOpacity>
  );
});

export default function PostPage() {

  

  const router = useRouter();
  // Android neeche ke buttons (back/home) ke upar Post Now rakhne ke liye
  const insets = useSafeAreaInsets();

const navigation = useNavigation();



  const params = useLocalSearchParams();

const audioUrl =
  Array.isArray(params.audioUrl)
    ? params.audioUrl[0]
    : params.audioUrl;

const musicName =
  Array.isArray(params.musicName)
    ? params.musicName[0]
    : params.musicName;

const musicArtist =
  Array.isArray(params.musicArtist)
    ? params.musicArtist[0]
    : params.musicArtist;

const musicImage =
  Array.isArray(params.musicImage)
    ? params.musicImage[0]
    : params.musicImage;

// Preserve the selected sound identity in the published reel.  This lets
// later viewers open the same sound rather than a duplicate "original" one.
const musicId =
  Array.isArray(params.musicId)
    ? params.musicId[0]
    : params.musicId || "";

const videoEffect =
  Array.isArray(params.videoEffect)
    ? params.videoEffect[0]
    : params.videoEffect || "none";



const subtitleText =
  Array.isArray(params.subtitleText)
    ? params.subtitleText[0]
    : params.subtitleText || "";

const subtitleColor =
  Array.isArray(params.subtitleColor)
    ? params.subtitleColor[0]
    : params.subtitleColor || "#FFFFFF";

const subtitleSize =
  Array.isArray(params.subtitleSize)
    ? params.subtitleSize[0]
    : params.subtitleSize || "28";

const subtitleX =
  Array.isArray(params.subtitleX)
    ? params.subtitleX[0]
    : params.subtitleX || "0";

const subtitleY =
  Array.isArray(params.subtitleY)
    ? params.subtitleY[0]
    : params.subtitleY || "0";

const subtitleXRatio =
  Array.isArray(params.subtitleXRatio)
    ? params.subtitleXRatio[0]
    : params.subtitleXRatio || "0";

const subtitleYRatio =
  Array.isArray(params.subtitleYRatio)
    ? params.subtitleYRatio[0]
    : params.subtitleYRatio || "0";

const subtitleSizeRatio =
  Array.isArray(params.subtitleSizeRatio)
    ? params.subtitleSizeRatio[0]
    : params.subtitleSizeRatio || "0.03";

const voiceUri =
  Array.isArray(params.voiceUri)
    ? params.voiceUri[0]
    : params.voiceUri || "";

const voiceDuration =
  Array.isArray(params.voiceDuration)
    ? params.voiceDuration[0]
    : params.voiceDuration || "0";

const videoDuration =
  Array.isArray(params.videoDuration)
    ? params.videoDuration[0]
    : params.videoDuration || "0";

// Speed / filter strength / beauty / motion effect / song cut (JSON string)
const videoFx =
  Array.isArray(params.videoFx)
    ? params.videoFx[0]
    : params.videoFx || "";

// Draft se khula ho to purana caption + draft id
const draftId =
  Array.isArray(params.draftId) ? params.draftId[0] : params.draftId || "";
const draftCaption =
  Array.isArray(params.draftCaption) ? params.draftCaption[0] : params.draftCaption || "";





useFocusEffect(
  useCallback(() => {
    const backAction = () => {

      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        router.replace("/profile");
      }

      return true;
    };

    const subscription = scopedBackHandler('/post', 
      "hardwareBackPress",
      backAction
    );

    return () => subscription.remove();

  }, [])
);


  

  const videoUri = Array.isArray(params?.videoUri)
    ? params.videoUri[0]
    : params?.videoUri;

const player = useVideoPlayer(videoUri ?? "", (player) => {
  try {
    player.bufferOptions = {
      maxBufferBytes: 12 * 1024 * 1024,
      preferredForwardBufferDuration: 6,
    };
  } catch (_) {}
  player.loop = true;
  player.muted = true;
  player.play();
});


useEffect(() => {
  return () => {
    try {
      player.pause();
    } catch (e) {
      console.log("Player already released");
    }
  };
}, []);
  // STATES
  const [caption, setCaption] = useState(draftCaption);
  const captionRef = useRef<TextInput>(null);
  const [whoSheet, setWhoSheet] = useState(false);
  const [permSheet, setPermSheet] = useState(false);
  const [allowComments, setAllowComments] = useState(true);
  const [allowDownload, setAllowDownload] = useState(true);
  const [saveOnDevice, setSaveOnDevice] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // "Save on device" yaad rehta hai (folder ek baar chuna to hamesha ON)
  useEffect(() => {
    getSaveFolder().then((d) => setSaveOnDevice(!!d)).catch(() => {});
  }, []);

  const toggleSaveOnDevice = useCallback(async () => {
    if (saveOnDevice) {
      setSaveOnDevice(false);
      return;
    }
    if (Platform.OS !== 'android') {
      Alert.alert('Save on device', 'Ye option abhi sirf Android par hai.');
      return;
    }
    const dir = (await getSaveFolder()) || (await pickSaveFolder());
    setSaveOnDevice(!!dir);
  }, [saveOnDevice]);

  const insertFriendTag = useCallback(() => {
    setCaption((prev) => `${prev}${prev.length === 0 || /\s$/.test(prev) ? '' : ' '}@`);
    setTimeout(() => captionRef.current?.focus(), 50);
  }, []);

  const allParams = useMemo(() => ({
    videoUri: videoUri || '', audioUrl: audioUrl || '', musicName: musicName || '',
    musicArtist: musicArtist || '', musicImage: musicImage || '', musicId: musicId || '',
    videoEffect, videoFx, subtitleText, subtitleColor, subtitleSize, subtitleX, subtitleY,
    subtitleXRatio, subtitleYRatio, subtitleSizeRatio, voiceUri, voiceDuration, videoDuration,
  }), [videoUri]);

  const handleSaveDraft = useCallback(async () => {
    if (savingDraft) return;
    setSavingDraft(true);
    try {
      if (draftId) await deleteDraft(draftId);
      await saveDraft(allParams, caption);
      Alert.alert('Drafts', 'Draft save ho gaya. Camera par "Drafts" se dobara khol sakte ho.');
      try { if (router.canDismiss()) router.dismissAll(); } catch (_) {}
      router.replace(REELS_HOME_ROUTE);
    } catch (e: any) {
      Alert.alert('Drafts', e?.message || 'Draft save nahi hua.');
    } finally {
      setSavingDraft(false);
    }
  }, [savingDraft, allParams, caption, router]);
  const [hashtagModal, setHashtagModal] = useState(false);
  const [hashtagQuery, setHashtagQuery] = useState('');
  const [hashtags, setHashtags] = useState<Hashtag[]>([]);
  const uploadState = useUploadState(); // { uploading, progress, error, justCompleted }
  const [visibility, setVisibility] = useState('public');

  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [userData, setUserData] = useState(null); // User info store karne ke liye


  // FETCH LOGGED IN USER DATA
  useEffect(() => {
    const getUserInfo = async () => {
      const user = auth.currentUser;
      if (user) {
        try {
          const docRef = doc(db, "users", user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUserData(docSnap.data());
          }
        } catch (error) {
          console.log("User data error:", error);
        }
      }
    };
    getUserInfo();
  }, []);

  


  

  

  // HASHTAGS
  // Caption se hashtags automatically nikalte hain (typed ya selected, dono).
  // Naya hashtag likha ho to upload ke baad service use bana deti hai.
  const usedHashtags = useMemo(() => extractHashtags(caption), [caption]);

  const [hashtagsLoading, setHashtagsLoading] = useState(true);

  // Realtime listener: koi bhi naya video post kare, count turant update.
  useEffect(() => {
    const unsub = subscribeHashtags(
      db,
      (list) => {
        setHashtags(list);
        setHashtagsLoading(false);
      },
      (e) => {
        console.log('Hashtag list:', e);
        setHashtagsLoading(false);
      }
    );
    return unsub;
  }, []);

  // name -> uses (chips me count dikhane ke liye), name -> rank
  const tagUses = useMemo(() => new Map(hashtags.map((h) => [h.name, h.uses])), [hashtags]);
  const tagRank = useMemo(() => new Map(hashtags.map((h, i) => [h.name, i + 1])), [hashtags]);

  const searchTag = cleanTag(hashtagQuery);
  const filteredHashtags = useMemo(
    () => (searchTag ? hashtags.filter((h) => h.name.includes(searchTag)) : hashtags),
    [hashtags, searchTag]
  );
  const canCreate = searchTag.length > 0 && !tagUses.has(searchTag);

  const selectHashtag = useCallback((tag: string) => {
    const clean = cleanTag(tag);
    if (!clean) return;
    setCaption((prev) => {
      if (extractHashtags(prev).includes(clean)) return prev; // duplicate nahi
      const sep = prev.length === 0 || /\s$/.test(prev) ? '' : ' ';
      return `${prev}${sep}#${clean} `;
    });
    setHashtagQuery('');
    setHashtagModal(false);
  }, []);

  const renderHashtagRow = useCallback(
    ({ item }: { item: Hashtag }) => (
      <HashtagRow item={item} rank={tagRank.get(item.name) || 0} onPress={selectHashtag} />
    ),
    [tagRank, selectHashtag]
  );

  // HANDLE POST
  //
  // Ab ye function upload ko background service (reelUploadService.js)
  // ko de deta hai aur us par AWAIT nahi karta — isliye Share dabate
  // hi hum turant reels feed par navigate kar sakte hain, aur upload
  // apne aap chalta rehta hai. Progress `uploadManager` store me jaake
  // update hota hai, jise index.tsx (feed) top-left corner me dikhata
  // hai, aur 100% hone par video Firestore me save ho chuka hota hai
  // (feed apne onSnapshot listener se usko khud dikha dega).
  const handlePostNow = async () => {
    // Ek time me sirf ek hi upload chale.
    if (uploadState.uploading) {
      return;
    }

    const user = auth.currentUser;

    if (!user) {
      Alert.alert('Error', 'Pehle login karein');
      return;
    }
    if (!videoUri) {
      Alert.alert('Error', 'Video select karo');
      return;
    }

    // Caption / hashtag / video par likha subtitle me gali nahi chalegi
    if (blockIfProfane(caption) || blockIfProfane(subtitleText)) return;

    try {
      const token = await auth.currentUser.getIdToken();

      // Background upload shuru karo — yahan jaan-boojh kar `await`
      // nahi kiya, taaki neeche wali line turant chal jaye.
      startReelUpload({
        user,
        token,
        videoUri,
        caption,
        usedHashtags,
        musicId,
        audioUrl,
        musicName,
        musicArtist,
        musicImage,
        videoEffect,
        videoFx,
        allowComments,
        allowDownload,
        subtitleText,
        subtitleColor,
        subtitleX,
        subtitleY,
        subtitleXRatio,
        subtitleYRatio,
        subtitleSizeRatio,
        voiceUri,
        voiceDuration,
        videoDuration,
        visibility,
        selectedLanguage,
        userData,
      });

      // Phone me copy (original recording; effects server par lagte hain)
      if (saveOnDevice) saveVideoToDevice(videoUri).catch(() => {});
      // Draft se post hua -> draft hata do (video file upload ke baad tak rakho)
      if (draftId) deleteDraft(draftId, { keepFiles: true }).catch(() => {});

      // Turant reels/feed screen par bhej do — user wahin reels dekh
      // sakta hai jab tak upload chalta rehta hai.
      // FIX: pehle stack ki saari screens (camera, edit, post) hata do,
      // taaki feed par back dabane se wo wapas na khulein.
      try {
        if (router.canDismiss()) {
          router.dismissAll();
        }
      } catch (e) {
        console.log("dismissAll error:", e);
      }
      router.replace(REELS_HOME_ROUTE);
    } catch (error) {
      console.log("Post start error:", error);
      Alert.alert('Error', error.message || 'Kuch galat ho gaya, dobara try karein.');
    }
  };

  const goBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      router.replace("/profile");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#151515" barStyle="light-content" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, paddingTop: insets.top }}
      >

        {/* HEADER: < Post */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={goBack} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollBody}
          keyboardShouldPersistTaps="handled"
        >

          {/* COVER + DESCRIPTION */}
          <View style={styles.topRow}>
            <View style={styles.videoWrapper}>
              <VideoView
                player={player}
                style={styles.video}
                contentFit="cover"
                nativeControls={false}
              />
              <View style={styles.coverLabel}>
                <Text style={styles.coverLabelText}>Title | Cover</Text>
              </View>
            </View>

            <View style={styles.rightContent}>
              <TextInput
                ref={captionRef}
                placeholder="Want more Likes? Write a description and use a suitable hashtag!"
                placeholderTextColor="#777"
                multiline
                value={caption}
                onChangeText={setCaption}
                style={styles.captionInput}
                maxLength={2200}
              />

              <View style={styles.tagBtnRow}>
                <TouchableOpacity style={styles.tagBtn} onPress={() => setHashtagModal(true)}>
                  <Text style={styles.tagBtnText}># Hashtags</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.tagBtn} onPress={insertFriendTag}>
                  <Text style={styles.tagBtnText}>@ Friends</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {usedHashtags.length > 0 && (
            <View style={styles.chipsRow}>
              {usedHashtags.map((tag) => {
                const uses = tagUses.get(tag);
                return (
                  <View key={tag} style={styles.chip}>
                    <Text style={styles.chipText}>#{tag}</Text>
                    {uses === undefined ? (
                      <Text style={styles.chipNew}>New</Text>
                    ) : (
                      <Text style={styles.chipCount}>{formatCount(uses)}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.divider} />

          {/* VIDEO LANGUAGE */}
          <View style={styles.langHeader}>
            <Text style={styles.sectionLabel}>Video Language</Text>
            <Ionicons name="help-circle-outline" size={15} color="#999" style={{ marginLeft: 4 }} />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.langRow}
          >
            {LANG_CHIPS.map((l) => {
              const on = selectedLanguage === l.value;
              return (
                <TouchableOpacity
                  key={l.value}
                  onPress={() => setSelectedLanguage(l.value)}
                  style={[styles.langChip, on && styles.langChipOn]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.langChipText, on && styles.langChipTextOn]}>{l.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* WHO CAN SEE */}
          <TouchableOpacity style={styles.rowItem} onPress={() => setWhoSheet(true)} activeOpacity={0.7}>
            <Ionicons name="lock-closed-outline" size={18} color="#ddd" />
            <Text style={styles.rowText}>Who can see</Text>
            <Text style={styles.rowValue}>{visibility === 'private' ? 'Only me' : 'Public'}</Text>
            <Ionicons name="chevron-forward" size={18} color="#999" />
          </TouchableOpacity>

          {/* PERMISSIONS */}
          <TouchableOpacity style={styles.rowItem} onPress={() => setPermSheet(true)} activeOpacity={0.7}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#ddd" />
            <Text style={styles.rowText}>Permissions</Text>
            <View style={{ flex: 1 }} />
            <Ionicons name="chevron-forward" size={18} color="#999" />
          </TouchableOpacity>

          {/* SAVE ON DEVICE */}
          <TouchableOpacity style={styles.saveRow} onPress={toggleSaveOnDevice} activeOpacity={0.7}>
            <Ionicons
              name={saveOnDevice ? 'checkmark-circle' : 'ellipse-outline'}
              size={16}
              color={saveOnDevice ? YELLOW : '#888'}
            />
            <Text style={styles.saveText}>Save on device</Text>
          </TouchableOpacity>

          {/* UPLOAD PROGRESS */}
          {uploadState.uploading && (
            <View style={styles.progressContainer}>
              <View style={styles.progressTop}>
                <Text style={styles.progressTitle}>Uploading Reel...</Text>
                <Text style={styles.progressPercent}>{uploadState.progress}%</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${uploadState.progress}%` }]} />
              </View>
            </View>
          )}
        </ScrollView>

        {/* BOTTOM: Drafts | Post Now */}
        <View style={[styles.bottomBar, { paddingBottom: 14 + insets.bottom }]}>
          <TouchableOpacity
            style={styles.draftBtn}
            onPress={handleSaveDraft}
            disabled={savingDraft || uploadState.uploading}
            activeOpacity={0.8}
          >
            {savingDraft ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.draftText}>Drafts</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.postBtn}
            onPress={handlePostNow}
            disabled={uploadState.uploading}
            activeOpacity={0.85}
          >
            {uploadState.uploading ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.postText}>Post Now</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* HASHTAG MODAL */}
        <Modal
          visible={hashtagModal}
          transparent
          animationType="slide"
          onRequestClose={() => setHashtagModal(false)}
        >
          <View style={styles.hashModalBackdrop}>
            <View style={styles.hashModal}>
              <View style={styles.hashModalHeader}>
                <View>
                  <Text style={styles.hashModalTitle}>Hashtags</Text>
                  <Text style={styles.hashModalSub}>{hashtags.length} hashtags in app</Text>
                </View>
                <TouchableOpacity onPress={() => setHashtagModal(false)}>
                  <Ionicons name="close" size={26} color="#fff" />
                </TouchableOpacity>
              </View>

              <TextInput
                value={hashtagQuery}
                onChangeText={setHashtagQuery}
                placeholder="Search or create hashtag..."
                placeholderTextColor="#888"
                style={styles.hashSearch}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => canCreate && selectHashtag(searchTag)}
              />

              {canCreate && (
                <TouchableOpacity style={styles.createRow} onPress={() => selectHashtag(searchTag)}>
                  <Ionicons name="add-circle" size={22} color={YELLOW} />
                  <Text style={styles.createText} numberOfLines={1}>
                    Create <Text style={{ color: YELLOW }}>#{searchTag}</Text>
                  </Text>
                  <Text style={styles.hashUses}>New</Text>
                </TouchableOpacity>
              )}

              {hashtagsLoading && hashtags.length === 0 ? (
                <ActivityIndicator color={YELLOW} style={{ marginTop: 20 }} />
              ) : (
                <FlatList
                  data={filteredHashtags}
                  keyExtractor={(item) => item.id}
                  renderItem={renderHashtagRow}
                  keyboardShouldPersistTaps="handled"
                  getItemLayout={(_, index) => ({
                    length: HASH_ROW_HEIGHT,
                    offset: HASH_ROW_HEIGHT * index,
                    index,
                  })}
                  initialNumToRender={14}
                  maxToRenderPerBatch={14}
                  windowSize={7}
                  ListEmptyComponent={
                    !canCreate ? <Text style={styles.emptyHash}>No hashtags yet.</Text> : null
                  }
                />
              )}
            </View>
          </View>
        </Modal>

        {/* WHO CAN SEE SHEET */}
        <Modal visible={whoSheet} transparent animationType="slide" onRequestClose={() => setWhoSheet(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setWhoSheet(false)}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Who can see this video</Text>
              {[
                { v: 'public', t: 'Public', d: 'Sab log dekh sakte hain', i: 'earth-outline' },
                { v: 'private', t: 'Only me', d: 'Sirf aap dekh sakte ho', i: 'lock-closed-outline' },
              ].map((o) => (
                <TouchableOpacity
                  key={o.v}
                  style={styles.sheetRow}
                  onPress={() => {
                    setVisibility(o.v);
                    setWhoSheet(false);
                  }}
                >
                  <Ionicons name={o.i as any} size={22} color="#fff" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.sheetTitle}>{o.t}</Text>
                    <Text style={styles.sheetSub}>{o.d}</Text>
                  </View>
                  {visibility === o.v && <Ionicons name="checkmark-circle" size={22} color={YELLOW} />}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* PERMISSIONS SHEET */}
        <Modal visible={permSheet} transparent animationType="slide" onRequestClose={() => setPermSheet(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPermSheet(false)}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Permissions</Text>
              {[
                { t: 'Allow comments', v: allowComments, set: setAllowComments },
                { t: 'Allow download', v: allowDownload, set: setAllowDownload },
              ].map((o) => (
                <TouchableOpacity key={o.t} style={styles.sheetRow} onPress={() => o.set(!o.v)}>
                  <Text style={[styles.sheetTitle, { flex: 1 }]}>{o.t}</Text>
                  <View style={[styles.switchTrack, o.v && styles.switchTrackOn]}>
                    <View style={[styles.switchKnob, o.v && styles.switchKnobOn]} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#151515' },
  header: {
    height: 56,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8,
  },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  scrollBody: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 30 },

  topRow: { flexDirection: 'row' },
  videoWrapper: { width: 106, height: 130, borderRadius: 6, overflow: 'hidden', backgroundColor: '#000' },
  video: { width: '100%', height: '100%' },
  coverLabel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center',
  },
  coverLabelText: { color: '#fff', fontSize: 11 },
  rightContent: { flex: 1, marginLeft: 10, justifyContent: 'space-between' },
  captionInput: { color: '#fff', fontSize: 13, minHeight: 84, textAlignVertical: 'top', padding: 0 },
  tagBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  tagBtn: { backgroundColor: '#2A2A2A', borderRadius: 4, paddingHorizontal: 9, paddingVertical: 5 },
  tagBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#333', marginVertical: 14 },
  langHeader: { flexDirection: 'row', alignItems: 'center' },
  sectionLabel: { color: '#fff', fontSize: 13 },
  langRow: { paddingVertical: 10, gap: 8 },
  langChip: { borderWidth: 1, borderColor: '#3A3A3A', borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 },
  langChipOn: { borderColor: YELLOW, backgroundColor: 'rgba(255,214,10,0.12)' },
  langChipText: { color: '#aaa', fontSize: 12 },
  langChipTextOn: { color: YELLOW, fontWeight: '700' },

  rowItem: {
    flexDirection: 'row', alignItems: 'center', height: 52,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2E2E2E',
  },
  rowText: { color: '#fff', fontSize: 14, marginLeft: 10, flex: 1 },
  rowValue: { color: '#999', fontSize: 13, marginRight: 4 },
  saveRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 16, gap: 5 },
  saveText: { color: '#ddd', fontSize: 12 },

  bottomBar: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14, gap: 10 },
  draftBtn: { flex: 1, height: 44, borderRadius: 6, backgroundColor: '#3A3A3A', alignItems: 'center', justifyContent: 'center' },
  draftText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  postBtn: { flex: 1.8, height: 44, borderRadius: 6, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  postText: { color: '#000', fontSize: 15, fontWeight: '700' },

  progressContainer: { backgroundColor: '#1E1E1E', borderRadius: 10, padding: 14, marginTop: 18 },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressTitle: { color: '#fff', fontWeight: '600' },
  progressPercent: { color: YELLOW, fontWeight: 'bold' },
  progressBarBg: { height: 6, backgroundColor: '#333', borderRadius: 10 },
  progressBarFill: { height: '100%', backgroundColor: YELLOW, borderRadius: 10 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, paddingBottom: 30 },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  sheetTitle: { color: '#fff', fontSize: 15 },
  sheetSub: { color: '#888', fontSize: 12, marginTop: 2 },
  switchTrack: { width: 44, height: 26, borderRadius: 13, backgroundColor: '#444', padding: 3 },
  switchTrackOn: { backgroundColor: YELLOW },
  switchKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  switchKnobOn: { transform: [{ translateX: 18 }] },

  hashModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  hashModal: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, height: '55%' },
  hashModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  hashModalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  hashModalSub: { color: '#777', fontSize: 12, marginTop: 2 },
  hashSearch: { backgroundColor: '#2A2A2A', color: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  hashRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    height: HASH_ROW_HEIGHT, borderBottomWidth: 0.5, borderBottomColor: '#333',
  },
  hashLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  hashRank: { color: '#555', fontSize: 12, fontWeight: '700', width: 34 },
  hashName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  hashUses: { color: '#888', fontSize: 12 },
  emptyHash: { color: '#777', textAlign: 'center', paddingVertical: 20 },
  createRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#2A2610',
    borderRadius: 10, paddingHorizontal: 12, height: 48, marginBottom: 10,
  },
  createText: { color: '#fff', fontSize: 14, fontWeight: '600', marginLeft: 8, flex: 1 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#262626',
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginBottom: 6,
  },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  chipCount: { color: '#888', fontSize: 11, marginLeft: 6 },
  chipNew: { color: YELLOW, fontSize: 11, marginLeft: 6, fontWeight: '700' },
});
