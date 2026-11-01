// Server (money.js) ko login-token ke saath call karne ka helper.
// Paise wale kaam (gift, recharge, withdraw, reward) sirf yahi se hote hain.
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { getDeviceId, getDeviceIdKind, emitDeviceBanned } from "./deviceId";

export const API_BASE = "https://topking-backend.onrender.com";

export async function callApi(path, body = {}) {
  const { auth } = require("../app/firebaseConfig");
  const user = auth.currentUser;
  if (!user) throw new Error("Please login first");

  const token = await user.getIdToken();
  const deviceId = await getDeviceId();

  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...(deviceId ? { "x-device-id": deviceId } : {}),
    },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {}

  if (!res.ok || !data || data.success === false) {
    if (data && data.code === "DEVICE_BANNED") emitDeviceBanned();
    const err = new Error((data && data.error) || "Request failed");
    err.status = res.status;
    err.code = data && data.code;
    throw err;
  }

  return data;
}

// Login se pehle / app start par: kya ye device banned hai? (login ki zarurat nahi)
export async function checkDeviceBanned() {
  try {
    const deviceId = await getDeviceId();
    if (!deviceId) return false;
    const res = await fetch(API_BASE + "/device/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });
    const data = await res.json();
    return !!(data && data.banned === true);
  } catch (e) {
    return false;
  }
}

// Login ke baad: is device ko user se jodo. Banned ho to { ok:false, banned:true }
export async function registerDevice() {
  try {
    const deviceId = await getDeviceId();
    if (!deviceId) return { ok: false, banned: false, unsupported: true };
    await callApi("/device/register", { deviceId, platform: Platform.OS, idKind: await getDeviceIdKind() });
    return { ok: true, banned: false };
  } catch (e) {
    return {
      ok: false,
      banned: !!(e && e.code === "DEVICE_BANNED"),
      unsupported: !!(e && e.code === "DEVICE_UNSUPPORTED"),
    };
  }
}

// DP (profile photo) -> server -> Cloudflare R2.
// Local file (file://...) bhejta hai, https URL wapas milta hai.
// Fail hone par Error throw karta hai (err.userMessage me user ko dikhane layak text).
export async function uploadDpToR2(fileUri) {
  const { auth } = require("../app/firebaseConfig");
  const user = auth.currentUser;
  if (!user) {
    const e = new Error("Please login first");
    e.userMessage = "Please login dobara karo.";
    throw e;
  }

  const token = await user.getIdToken();
  const deviceId = await getDeviceId();

  const lower = String(fileUri).toLowerCase().split("?")[0];
  let mime = "image/jpeg";
  if (lower.endsWith(".png")) mime = "image/png";
  else if (lower.endsWith(".webp")) mime = "image/webp";

  // 60 sec me jawab na aaye to rukna band (Render server soya ho / deploy chal raha ho
  // to request latak jaati hai aur Save ka spinner hamesha ghoomta rehta tha)
  const UPLOAD_TIMEOUT_MS = 60000;
  let timer;
  let up;
  try {
    up = await Promise.race([
      FileSystem.uploadAsync(API_BASE + "/upload-dp", fileUri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "media",
        mimeType: mime,
        headers: {
          Authorization: "Bearer " + token,
          ...(deviceId ? { "x-device-id": deviceId } : {}),
        },
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("DP_TIMEOUT")), UPLOAD_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    console.log("DP upload failed:", err && err.message);
    const e = new Error("DP upload network error");
    e.userMessage =
      err && err.message === "DP_TIMEOUT"
        ? "Server jawab nahi de raha. Thodi der baad dobara try karo."
        : "Internet check karo, photo upload nahi hui.";
    throw e;
  } finally {
    clearTimeout(timer);
  }

  console.log("DP upload reply:", up.status, String(up.body).slice(0, 200));

  let data = null;
  try {
    data = JSON.parse(up.body);
  } catch (e) {}

  if (!data || up.status < 200 || up.status >= 300 || !data.success || !data.url) {
    if (data && data.code === "DEVICE_BANNED") emitDeviceBanned();
    const e = new Error((data && data.error) || "DP upload failed (" + up.status + ")");
    e.status = up.status;
    e.userMessage =
      up.status === 429
        ? "Thodi der baad dobara try karo."
        : (data && data.error) || "Photo upload nahi hui, dobara try karo.";
    throw e;
  }

  return data.url;
}
