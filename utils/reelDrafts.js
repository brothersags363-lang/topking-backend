// Reel drafts (Post screen "Drafts" button).
// The recorded video lives in the cache folder, which Android can clear,
// so a draft COPIES the video into the app's document folder and keeps
// all post params (music, filter, fx, subtitle...) in AsyncStorage.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

const KEY = "reel_drafts_v1";
const DIR = `${FileSystem.documentDirectory || ""}drafts/`;
const MAX_DRAFTS = 20;

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

async function writeAll(list) {
  await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_DRAFTS)));
}

export async function listDrafts() {
  return readAll();
}

export async function countDrafts() {
  return (await readAll()).length;
}

// params: plain object of strings (same params the post screen receives)
export async function saveDraft(params, caption) {
  const id = `${Date.now()}`;
  const src = String(params.videoUri || "");
  if (!src) throw new Error("Video missing");

  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  const videoCopy = `${DIR}${id}.mp4`;
  await FileSystem.copyAsync({ from: src, to: videoCopy });

  let voiceCopy = "";
  if (params.voiceUri) {
    voiceCopy = `${DIR}${id}.m4a`;
    try {
      await FileSystem.copyAsync({ from: String(params.voiceUri), to: voiceCopy });
    } catch (_) {
      voiceCopy = "";
    }
  }

  const draft = {
    id,
    createdAt: Date.now(),
    caption: caption || "",
    params: { ...params, videoUri: videoCopy, voiceUri: voiceCopy },
  };
  const list = await readAll();
  // Over the limit: delete the oldest draft's files too.
  const next = [draft, ...list];
  next.slice(MAX_DRAFTS).forEach((d) => removeFiles(d));
  await writeAll(next);
  return draft;
}

function removeFiles(d) {
  const p = (d && d.params) || {};
  [p.videoUri, p.voiceUri].forEach((u) => {
    if (u && String(u).startsWith(DIR)) {
      FileSystem.deleteAsync(u, { idempotent: true }).catch(() => {});
    }
  });
}

export async function deleteDraft(id, { keepFiles = false } = {}) {
  const list = await readAll();
  const d = list.find((x) => x.id === id);
  if (d && !keepFiles) removeFiles(d);
  await writeAll(list.filter((x) => x.id !== id));
}

// ---------------------------------------------------------------------
// SAVE ON DEVICE (no media-library permission needed)
// ---------------------------------------------------------------------
// Android: user picks a folder ONCE (system folder picker), we remember it
// and copy every posted video there. iOS: not supported here.
const SAF_KEY = "reel_save_dir_v1";

export async function pickSaveFolder() {
  if (Platform.OS !== "android") return null;
  const SAF = FileSystem.StorageAccessFramework;
  const res = await SAF.requestDirectoryPermissionsAsync();
  if (!res.granted) return null;
  await AsyncStorage.setItem(SAF_KEY, res.directoryUri);
  return res.directoryUri;
}

export async function getSaveFolder() {
  try {
    return await AsyncStorage.getItem(SAF_KEY);
  } catch (_) {
    return null;
  }
}

export async function saveVideoToDevice(localUri) {
  if (Platform.OS !== "android" || !localUri) return false;
  const SAF = FileSystem.StorageAccessFramework;
  const dir = await getSaveFolder();
  if (!dir) return false;
  try {
    const target = await SAF.createFileAsync(dir, `topking_${Date.now()}`, "video/mp4");
    try {
      await FileSystem.copyAsync({ from: String(localUri), to: target });
    } catch (_) {
      // Older expo-file-system: SAF target needs a write. Only for normal
      // reel sizes (base64 is held in memory once).
      const info = await FileSystem.getInfoAsync(String(localUri));
      if (!info.exists || (info.size || 0) > 60 * 1024 * 1024) return false;
      const b64 = await FileSystem.readAsStringAsync(String(localUri), {
        encoding: FileSystem.EncodingType.Base64,
      });
      await SAF.writeAsStringAsync(target, b64, { encoding: FileSystem.EncodingType.Base64 });
    }
    return true;
  } catch (e) {
    console.log("save to device failed:", e && e.message);
    return false;
  }
}
