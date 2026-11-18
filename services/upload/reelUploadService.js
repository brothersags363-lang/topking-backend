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

// ---------------------------------------------------------------
// SMOOTH PLAYBACK: upload se pehle video ko 720p + ~2 Mbps me chhota karo.
// Gallery ki 1080p/4K high-bitrate video weak phone par atakti/garam karti thi.
// Module install/build me na ho ya compress fail ho to original video hi upload hoti hai.
// Install: npx expo install react-native-compressor   (phir naya build)
// ---------------------------------------------------------------
let VideoCompressor = null;
let RNCompressor = null;
try {
  RNCompressor = require("react-native-compressor");
  VideoCompressor = RNCompressor.Video;
} catch (e) {
  VideoCompressor = null;
  RNCompressor = null;
}

// ---------------------------------------------------------------
// SIZE CAP: har quality ka FILE SIZE chhota rakho (bitrate video ki LAMBAI ke hisaab se).
// Pehle bitrate fix tha (720p = 2 Mbps) -> 60 sec ki video ~15 MB banti thi aur feed me der se
// load hoti thi. Ab: target MB se bitrate nikalta hai, [minBps, maxBps] ke beech rakhta hai.
//   720p: ~3.5 MB (chhoti video me max 1.5 Mbps)   480p: ~1.8 MB   360p: ~1 MB
// Compress ke baad bhi size target se 40% se zyada nikle to ek baar aur kam bitrate se.
// Numbers badalne ho to sirf neeche ki TARGETS table badlo.
// ---------------------------------------------------------------
const TARGETS = {
  p720: { maxSize: 1280, targetMB: 3.5, maxBps: 1500000, minBps: 650000 },
  p480: { maxSize: 854, targetMB: 1.8, maxBps: 700000, minBps: 300000 },
  p360: { maxSize: 640, targetMB: 1.0, maxBps: 400000, minBps: 200000 },
};
const AUDIO_BPS = 96000;

function pickBitrate(durationSec, t) {
  const total = (t.targetMB * 1024 * 1024 * 8) / Math.max(1, durationSec);
  return Math.round(Math.min(t.maxBps, Math.max(t.minBps, total - AUDIO_BPS)));
}

async function getDurationSec(uri, fallback) {
  try {
    if (RNCompressor && typeof RNCompressor.getVideoMetaData === "function") {
      const m = await RNCompressor.getVideoMetaData(String(uri));
      let d = Number(m && m.duration);
      if (d > 1000) d = d / 1000; // kuch versions ms deti hain
      if (d > 0) return d;
    }
  } catch (e) {}
  const f = Number(fallback);
  return f > 0 ? f : 30;
}

async function fileMB(uri) {
  try {
    let u = String(uri);
    if (u.startsWith("/")) u = "file://" + u;
    const info = await FileSystem.getInfoAsync(u);
    return info && info.exists && info.size ? info.size / (1024 * 1024) : 0;
  } catch (e) {
    return 0;
  }
}

async function compressTier(uri, t, durationSec, onProgress, minFileMB = 0) {
  let bps = pickBitrate(durationSec, t);
  let best = null;
  for (let pass = 0; pass < 2; pass++) {
    const out = await VideoCompressor.compress(
      String(uri),
      {
        compressionMethod: "manual",
        maxSize: t.maxSize,
        bitrate: bps,
        minimumFileSizeForCompress: minFileMB,
      },
      pass === 0 ? onProgress : undefined
    );
    if (!out) break;
    best = out;
    const mb = await fileMB(out);
    if (!mb || mb <= t.targetMB * 1.4) break;
    // encoder ne bitrate se zyada size banaya -> kam bitrate se dobara (original se)
    bps = Math.max(Math.round(t.minBps * 0.8), Math.round(bps * (t.targetMB / mb) * 0.9));
  }
  return best;
}

async function compressForFeed(uri, durationSec) {
  if (!VideoCompressor || !uri) return uri;
  try {
    const out = await compressTier(
      uri,
      TARGETS.p720,
      durationSec,
      (p) => setUploadState({ progress: Math.min(4, Math.max(1, Math.round((p || 0) * 4))) }),
      3
    );
    if (!out) return uri;
    // compress ke baad bhi bada nikla (original se) to original hi rakho
    const [a, b] = await Promise.all([fileMB(out), fileMB(uri)]);
    if (a && b && a >= b) return uri;
    return out;
  } catch (e) {
    console.log("compress failed, original video upload hogi:", e?.message);
    return uri;
  }
}

// 480p version (slow net / mobile data ke liye). Fail ho to null -> sirf 720p rahegi.
async function compress480(uri, durationSec) {
  if (!VideoCompressor || !uri) return null;
  try {
    const out = await compressTier(uri, TARGETS.p480, durationSec);
    return out || null;
  } catch (e) {
    console.log("480p compress skip:", e?.message);
    return null;
  }
}

// 360p version (bahut slow net ke liye). 480p wali file se banti hai -> jaldi.
async function compress360(uri, durationSec) {
  if (!VideoCompressor || !uri) return null;
  try {
    const out = await compressTier(uri, TARGETS.p360, durationSec);
    return out || null;
  } catch (e) {
    console.log("360p compress skip:", e?.message);
    return null;
  }
}

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

async function makeThumbnail(fileUri) {
  try {
    const t = await VideoThumbnails.getThumbnailAsync(fileUri, { time: 1000, quality: 0.7 });
    return t?.uri || null;
  } catch (e) {
    console.log("thumbnail create failed:", e?.message);
    return null;
  }
}

async function uploadDirectToR2(videoUri, token, durationSec) {
  // Upload-url, file-ready aur thumbnail teeno ek saath (pehle ek-ek karke hote the)
  const [urlRes, fileUri] = await Promise.all([
    postWithRetry(
      `${API}/upload-url`,
      {},
      {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        timeout: 60 * 1000,
      },
      { label: "upload url (/upload-url)", maxRetries: 1 }
    ),
    ensureFileUri(videoUri),
  ]);

  const urls = urlRes.data;
  if (!urls?.success || !urls.videoUploadUrl || !urls.videoUrl) {
    throw new Error(urls?.error || "Upload url missing");
  }

  setUploadState({ progress: 1 });

  // Thumbnail (chhota) video ke saath parallel upload hota hai -> extra wait nahi
  const thumbTask = (async () => {
    const thumbUri = await makeThumbnail(fileUri);
    if (!thumbUri || !urls.thumbnailUploadUrl) return "";
    try {
      await putFileWithRetry(urls.thumbnailUploadUrl, thumbUri, "image/jpeg", null, 3);
      return urls.thumbnailUrl || "";
    } catch (e) {
      console.log("thumbnail upload failed:", e?.message);
      return "";
    }
  })();

  // 480p + 360p: phone ka CPU compress me, net 720p upload me -> sab saath chalte hain
  const smallTask = (async () => {
    const out = { u480: "", u360: "" };
    try {
      const f480 = await compress480(fileUri, durationSec);
      if (f480 && urls.video480UploadUrl && urls.video480Url) {
        const p480 = await ensureFileUri(f480);
        try {
          await putFileWithRetry(urls.video480UploadUrl, p480, "video/mp4", null, 3);
          out.u480 = urls.video480Url;
        } catch (e) {
          console.log("480p upload skip:", e?.message);
        }
        if (urls.video360UploadUrl && urls.video360Url) {
          const f360 = await compress360(p480, durationSec);
          if (f360) {
            try {
              await putFileWithRetry(urls.video360UploadUrl, await ensureFileUri(f360), "video/mp4", null, 3);
              out.u360 = urls.video360Url;
            } catch (e) {
              console.log("360p upload skip:", e?.message);
            }
          }
        }
      }
    } catch (e) {
      console.log("small versions skip:", e?.message);
    }
    return out;
  })();

  await putFileWithRetry(urls.videoUploadUrl, fileUri, "video/mp4", (frac) => {
    setUploadState({ progress: Math.min(97, Math.max(1, Math.round(frac * 97))) });
  });

  const thumbnailUrl = await thumbTask;
  const small = await smallTask;
  return { videoUrl: urls.videoUrl, videoUrl480: small.u480, videoUrl360: small.u360, thumbnailUrl };
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
    // 720p compress (fail ho to original). Neeche ke dono raste (direct R2 aur /merge) isi ko use karte hain.
    const durationSec = await getDurationSec(videoUri, videoDuration);
    let finalVideo = await compressForFeed(videoUri, durationSec);
    let thumbnailUrl = "";

    const hasMusic = typeof audioUrl === "string" && audioUrl.trim() !== "";
    const hasVoice = typeof voiceUri === "string" && voiceUri.trim() !== "";
    const hasSubtitle = typeof subtitleText === "string" && subtitleText.trim() !== "";
    const hasEffect = typeof videoEffect === "string" && videoEffect !== "none";

    const needsProcessing = hasMusic || hasVoice || hasSubtitle || hasEffect;

    if (needsProcessing) {
      setUploadState({ progress: 5 });

      const processForm = new FormData();

      // FIX: pehle yahan ORIGINAL gallery video (videoUri) jati thi -> server ise as-is copy karta tha
      // aur music/subtitle/effect wali reels 20-75 MB ki ban jati thin. Ab compress ki hui 720p file.
      processForm.append("video", {
        uri: Platform.OS === "android" ? finalVideo : String(finalVideo).replace("file://", ""),
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
    let uploadedVideo480 = "";
    let uploadedVideo360 = "";

    if (!needsProcessing) {
      // 1) Pehle seedha R2 par (tez + toot-ta nahi). 2) Agar server me
      // /upload-url nahi hai ya fail ho jaye to purana /upload-video.
      let direct = null;
      try {
        direct = await uploadDirectToR2(finalVideo, token, durationSec);
      } catch (e) {
        console.log("Direct upload failed, purane route par fallback:", e?.message);
      }

      if (direct) {
        uploadedVideo = direct.videoUrl;
        uploadedVideo480 = direct.videoUrl480 || "";
        uploadedVideo360 = direct.videoUrl360 || "";
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

      // FASTSTART: direct-R2 video ka metadata shuru me laao (re-encode nahi, halka).
      // Fail / der ho to ignore: video waise hi chalti rahegi.
      if (!needsProcessing) {
        try {
          for (const u of [uploadedVideo, uploadedVideo480, uploadedVideo360]) {
            if (!u) continue;
            await axios.post(
              `${API}/video/faststart`,
              { videoUrl: u },
              { headers: { Authorization: `Bearer ${token}` }, timeout: 20 * 1000 }
            );
          }
        } catch (e) {
          console.log("faststart skip:", e?.response?.status || e?.message);
        }
      }

      // MULTI-QUALITY (HLS): server se kaho Cloudflare Stream me bhi daal de.
      // Fail / band ho to koi dikkat nahi: video R2 ke mp4 se chalti rahegi.
      let streamUid = "";
      try {
        const ing = await axios.post(
          `${API}/stream/ingest`,
          { videoUrl: uploadedVideo },
          { headers: { Authorization: `Bearer ${token}` }, timeout: 20 * 1000 }
        );
        if (ing?.data?.success && ing.data.uid) streamUid = String(ing.data.uid);
      } catch (e) {
        console.log("stream ingest skip:", e?.response?.status || e?.message);
      }

      const videoData = {
        videoUrl: uploadedVideo,
        ...(uploadedVideo480 ? { videoUrl480: uploadedVideo480 } : {}),
        ...(uploadedVideo360 ? { videoUrl360: uploadedVideo360 } : {}),
        ...(streamUid ? { streamUid, hlsReady: false } : {}),
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

      // Hashtag count + original-audio song ek saath likho (post already save ho chuki hai,
      // inme se kuch fail ho to bhi upload ko fail nahi dikhana)
      const extraWrites = usedHashtags.map((tag) =>
        setDoc(
          doc(db, "hashtags", tag),
          { name: `#${tag}`, uses: increment(1), lastUsedAt: serverTimestamp() },
          { merge: true }
        )
      );
      if (!hasMusic || !musicId) {
        extraWrites.push(
          addDoc(collection(db, "songs"), {
            title: musicName || `${userData?.name}'s Original Audio`,
            artist: userData?.name,
            audioUrl: audioUrl || originalAudioUrl,
            image: userData?.profileImg,
            videoUrl: uploadedVideo,
            thumbnail: thumbnailUrl || uploadedVideo,
            userId: user.uid,
            uses: 0,
            createdAt: serverTimestamp(),
          })
        );
      }
      await Promise.allSettled(extraWrites);
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
