// Server (money.js) ko login-token ke saath call karne ka helper.
// Paise wale kaam (gift, recharge, withdraw, reward) sirf yahi se hote hain.
import { Platform } from "react-native";
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
