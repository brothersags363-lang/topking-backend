// reelUploadService.js
//
// Ye file wahi kaam karti hai jo pehle post.tsx ke andar
// `handlePostNow` karta tha (video process karna, upload karna,
// Firestore me post likhna) — bas fark itna hai ki ab ye kisi
// screen ke component ke andar nahi hai, isliye jab user post.tsx
// se hatkar index.tsx par chala jaye tab bhi ye function chalta
// rehta hai aur progress `uploadManager` store me likhta rehta hai.
//
// Location: services/upload/reelUploadService.js (app/ folder ke
// BAHAR — isiliye Expo Router isko route nahi samjhega). Isko
// dusri files se `@/services/upload/reelUploadService` alias se
// import karo, folder kitna bhi neeche/upar ho fark nahi padega.

import axios from "axios";
import { Platform } from "react-native";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
  increment,
} from "firebase/firestore";

import { db } from "@/app/firebaseConfig";
import { setUploadState, resetUpload, getUploadState } from "./uploadManager";

const API = "https://topking-backend.onrender.com";

// Render ke free/cold servers kabhi-kabhi Cloudflare se transient
// 502/503/504 "bad gateway" bhej dete hain (server so raha tha ya
// overload tha). Aisi retryable errors par hum khud thodi der ruk kar
// dobara try karte hain, taaki user ko manually dobara Share na dabana
// pade.
const RETRYABLE_STATUS = [502, 503, 504];

function isRetryableError(error) {
  const status = error?.response?.status;
  const retryableFlag = error?.response?.data?.retryable;
  return retryableFlag === true || RETRYABLE_STATUS.includes(status);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postWithRetry(url, formData, config, { maxRetries = 2, label = "" } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await axios.post(url, formData, config);
    } catch (error) {
      const canRetry = attempt < maxRetries && isRetryableError(error);
      if (!canRetry) throw error;

      attempt += 1;
      const waitSeconds = error?.response?.data?.retry_after || 10;
      console.log(
        `⏳ ${label || url} failed with a retryable server error, retrying (${attempt}/${maxRetries}) in ${waitSeconds}s`
      );
      setUploadState({ retrying: true, retryAttempt: attempt });
      await sleep(waitSeconds * 1000);
      setUploadState({ retrying: false });
    }
  }
}

/**
 * payload me wahi sab cheezein aati hain jo pehle post.tsx ke
 * andar local variables/state ke roop me thi.
 */
export async function startReelUpload(payload) {
  // Agar pehle se hi ek upload chal raha hai to dobara mat shuru karo
  // (jaise pehle `if (uploading) return;` karta tha).
  if (getUploadState().uploading) {
    return;
  }

  const {
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
  } = payload;

  setUploadState({ uploading: true, progress: 0, error: null, justCompleted: false });

  try {
    let finalVideo = videoUri;
    let thumbnailUrl = "";

    const hasMusic = typeof audioUrl === "string" && audioUrl.trim() !== "";
    const hasVoice = typeof voiceUri === "string" && voiceUri.trim() !== "";
    const hasSubtitle = typeof subtitleText === "string" && subtitleText.trim() !== "";
    const hasEffect = typeof videoEffect === "string" && videoEffect !== "none";

    const needsProcessing = hasMusic || hasVoice || hasSubtitle || hasEffect;

    if (needsProcessing) {
      setUploadState({ progress: 5 });

      const processForm = new FormData();

      processForm.append("video", {
        uri: Platform.OS === "android" ? videoUri : String(videoUri).replace("file://", ""),
        type: "video/mp4",
        name: "video.mp4",
      });

      processForm.append("videoDuration", String(videoDuration || "0"));

      if (hasEffect) processForm.append("videoEffect", videoEffect);
      if (hasMusic) processForm.append("audioUrl", audioUrl);

      if (hasVoice) {
        processForm.append("voice", {
          uri: Platform.OS === "android" ? voiceUri : String(voiceUri).replace("file://", ""),
          type: "audio/mp4",
          name: "voice.m4a",
        });
        processForm.append("voiceDuration", String(voiceDuration || "0"));
      }

      if (hasSubtitle) {
        processForm.append("subtitleText", subtitleText);
        processForm.append("subtitleColor", subtitleColor || "#FFFFFF");
        processForm.append("subtitleXRatio", String(subtitleXRatio || "0"));
        processForm.append("subtitleYRatio", String(subtitleYRatio || "0"));
        processForm.append("subtitleSizeRatio", String(subtitleSizeRatio || "0.03"));
      }

      const processResponse = await postWithRetry(
        `${API}/merge`,
        processForm,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
          timeout: 5 * 60 * 1000,
          onUploadProgress: (event) => {
            if (event.total && event.loaded) {
              const uploadedPercent = Math.round((event.loaded * 70) / event.total);
              setUploadState({ progress: Math.min(70, Math.max(5, uploadedPercent)) });
            }
          },
        },
        { label: "video processing (/merge)" }
      );

      if (!processResponse.data?.success || !processResponse.data?.video) {
        throw new Error(processResponse.data?.error || "Video processing failed");
      }

      finalVideo = processResponse.data.video;
      thumbnailUrl = processResponse.data.thumbnailUrl || "";
      setUploadState({ progress: 85 });
    }

    let uploadedVideo = finalVideo;

    if (!needsProcessing) {
      const formData = new FormData();
      formData.append("video", {
        uri: Platform.OS === "android" ? finalVideo : finalVideo.replace("file://", ""),
        type: "video/mp4",
        name: "reel.mp4",
      });

      const response = await postWithRetry(
        `${API}/upload-video`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
          timeout: 5 * 60 * 1000,
          onUploadProgress: (event) => {
            if (event.total && event.loaded) {
              setUploadState({ progress: Math.round((event.loaded * 100) / event.total) });
            }
          },
        },
        { label: "video upload (/upload-video)" }
      );

      if (!response.data?.success || !response.data?.videoUrl) {
        throw new Error(response.data?.error || "Video upload failed");
      }

      uploadedVideo = response.data.videoUrl;
      thumbnailUrl = response.data.thumbnailUrl || "";
    }

    setUploadState({ progress: 100 });

    if (uploadedVideo) {
      const originalAudioUrl = uploadedVideo;

      const videoData = {
        videoUrl: uploadedVideo,
        musicId: musicId || "",
        audioUrl: audioUrl || originalAudioUrl,
        musicName: musicName || `${userData?.name}'s Original Audio`,
        songName: musicName || `${userData?.name}'s Original Audio`,
        artist: musicArtist || userData?.name,
        image: musicImage || userData?.profileImg,

        caption: caption,
        language: selectedLanguage,
        privacy: visibility,

        userId: user.uid,
        userName: userData?.name || "New User",
        username: userData?.username ? `@${userData.username}` : "@user",

        profile: userData?.profileImg || "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",

        createdAt: serverTimestamp(),

        likes: 0,
        commentsCount: 0,
        shares: 0,
        views: 0,
        engagementScore: 0,

        thumbnail: thumbnailUrl || uploadedVideo,
        verified: userData?.verified || false,

        hasMusic,
        hasVoice,
        hasSubtitle,
        videoEffect: videoEffect || "none",
        subtitleText: hasSubtitle ? subtitleText : "",
        subtitleColor: hasSubtitle ? subtitleColor : "",
        subtitleX: hasSubtitle ? subtitleX : "",
        subtitleY: hasSubtitle ? subtitleY : "",
        hashtags: usedHashtags.map((tag) => `#${tag}`),
      };

      await addDoc(collection(db, "all_videos"), videoData);

      await Promise.all(
        usedHashtags.map((tag) =>
          setDoc(
            doc(db, "hashtags", tag),
            { name: `#${tag}`, uses: increment(1), lastUsedAt: serverTimestamp() },
            { merge: true }
          )
        )
      );

      if (!hasMusic || !musicId) {
        await addDoc(collection(db, "songs"), {
          title: musicName || `${userData?.name}'s Original Audio`,
          artist: userData?.name,
          audioUrl: audioUrl || originalAudioUrl,
          image: userData?.profileImg,
          videoUrl: uploadedVideo,
          thumbnail: thumbnailUrl || uploadedVideo,
          userId: user.uid,
          uses: 0,
          createdAt: serverTimestamp(),
        });
      }
    }

    // 100% ho gaya — feed (index.tsx) apne aap naya post onSnapshot se
    // dikha dega. Yahan bas thodi der "Posted" state dikha ke overlay
    // hata dete hain.
    setUploadState({ uploading: false, justCompleted: true });
    setTimeout(() => {
      resetUpload();
    }, 1800);
  } catch (error) {
    console.log("Background upload error:", error?.response?.data || error.message);
    setUploadState({
      uploading: false,
      error: error?.response?.data?.error || error.message || "Upload failed",
    });
    // Error message ko thodi der dikha ke apne aap hata do.
    setTimeout(() => {
      resetUpload();
    }, 3500);
  }
}
