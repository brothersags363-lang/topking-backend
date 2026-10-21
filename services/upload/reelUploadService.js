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
import * as FileSystem from "expo-file-system/legacy";
import * as VideoThumbnails from "expo-video-thumbnails";
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
const RETRYABLE_STATUS = [408, 502, 503, 504, 524];

function isRetryableError(error) {
  // Response hi nahi aaya (net toota / timeout) -> dobara try karo.
  if (!error?.response) return true;
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

// ---------------------------------------------------------------
// DIRECT UPLOAD (app -> Cloudflare R2, Render server beech me nahi)
// Badi video 5-8 min le tab bhi chalta rehta hai; net toote to
// khud dobara try karta hai (exponential backoff), user ko kuch
// dobara nahi dabana padta.
// ---------------------------------------------------------------
async function ensureFileUri(uri) {
  const u = String(uri);
  if (u.startsWith("file://")) return u;
  // content:// jaise uri ko cache me copy karo taaki native uploader padh sake
  const dest = `${FileSystem.cacheDirectory}reel-${Date.now()}.mp4`;
  await FileSystem.copyAsync({ from: u, to: dest });
  return dest;
}

async function putFileWithRetry(uploadUrl, fileUri, contentType, onProgress, maxAttempts = 6) {
  let lastErr = new Error("Upload failed");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const task = FileSystem.createUploadTask(
        uploadUrl,
        fileUri,
        {
          httpMethod: "PUT",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { "Content-Type": contentType },
        },
        (p) => {
          if (onProgress && p?.totalBytesExpectedToSend) {
            onProgress(p.totalBytesSent / p.totalBytesExpectedToSend);
          }
        }
      );
      const res = await task.uploadAsync();
      if (res && res.status >= 200 && res.status < 300) return;

      lastErr = new Error(`Upload failed (status ${res?.status})`);
      // 4xx (jaise 403 = link expire/signature galat) dobara try karne se theek nahi hoga
      if (res && res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        lastErr.nonRetryable = true;
        throw lastErr;
      }
    } catch (e) {
      lastErr = e;
      if (e?.nonRetryable) throw e;
    }

    if (attempt < maxAttempts) {
      const waitMs = Math.min(30000, 2000 * 2 ** (attempt - 1));
      console.log(`⏳ direct upload failed, retry ${attempt}/${maxAttempts - 1} in ${waitMs / 1000}s`);
      setUploadState({ retrying: true, retryAttempt: attempt });
      await sleep(waitMs);
      setUploadState({ retrying: false });
    }
  }
  throw lastErr;
}

async function uploadDirectToR2(videoUri, token) {
  const urlRes = await postWithRetry(
    `${API}/upload-url`,
    {},
    {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      timeout: 60 * 1000,
    },
    { label: "upload url (/upload-url)" }
  );
  const urls = urlRes.data;
  if (!urls?.success || !urls.videoUploadUrl || !urls.videoUrl) {
    throw new Error(urls?.error || "Upload url missing");
  }

  const fileUri = await ensureFileUri(videoUri);

  // Thumbnail pehle bana lo (fail ho to video ka url hi thumbnail ban jayega)
  let thumbUri = null;
  try {
    const t = await VideoThumbnails.getThumbnailAsync(fileUri, { time: 1000, quality: 0.7 });
    thumbUri = t?.uri || null;
  } catch (e) {
    console.log("thumbnail create failed:", e?.message);
  }

  setUploadState({ progress: 1 });
  await putFileWithRetry(urls.videoUploadUrl, fileUri, "video/mp4", (frac) => {
    setUploadState({ progress: Math.min(95, Math.max(1, Math.round(frac * 95))) });
  });

  let thumbnailUrl = "";
  if (thumbUri && urls.thumbnailUploadUrl) {
    try {
      await putFileWithRetry(urls.thumbnailUploadUrl, thumbUri, "image/jpeg", null, 3);
      thumbnailUrl = urls.thumbnailUrl || "";
    } catch (e) {
      console.log("thumbnail upload failed:", e?.message);
    }
  }

  return { videoUrl: urls.videoUrl, thumbnailUrl };
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
          timeout: 30 * 60 * 1000, // 30 min — dheemi net par bhi upload na toote
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
      // 1) Pehle seedha R2 par (tez + toot-ta nahi). 2) Agar server me
      // /upload-url nahi hai ya fail ho jaye to purana /upload-video.
      let direct = null;
      try {
        direct = await uploadDirectToR2(finalVideo, token);
      } catch (e) {
        console.log("Direct upload failed, purane route par fallback:", e?.message);
      }

      if (direct) {
        uploadedVideo = direct.videoUrl;
        thumbnailUrl = direct.thumbnailUrl || "";
      } else {
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
          timeout: 30 * 60 * 1000, // 30 min — dheemi net par bhi upload na toote
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
