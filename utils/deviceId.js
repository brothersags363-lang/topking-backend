// Device ki pakki ID + "device ban ho gaya" ka chhota event system.
//
// Android: Settings.Secure.ANDROID_ID (uninstall/reinstall par same rehti hai,
//          sirf factory reset par badalti hai).
// iOS:     identifierForVendor.
// Agar expo-application native module build me nahi hai to AsyncStorage wali
// random ID fallback hoti hai (reinstall par badal jati hai - kamzor).
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

let cached = null;

export async function getDeviceId() {
  if (cached) return cached;

  try {
    const Application = require("expo-application");
    let id = null;
    if (Platform.OS === "android") {
      id =
        typeof Application.getAndroidId === "function"
          ? Application.getAndroidId()
          : Application.androidId;
    } else if (Platform.OS === "ios") {
      id = await Application.getIosIdForVendorAsync();
    }
    if (id && String(id).length >= 6) {
      cached = "d_" + Platform.OS + "_" + String(id);
      return cached;
    }
  } catch (e) {}

  try {
    let id = await AsyncStorage.getItem("tk_device_id");
    if (!id) {
      id =
        "f_" +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2) +
        Math.random().toString(36).slice(2);
      await AsyncStorage.setItem("tk_device_id", id);
    }
    cached = id;
    return cached;
  } catch (e) {
    return null;
  }
}

// "stable" = Android ID / iOS vendor ID (reinstall par same). "weak" = AsyncStorage random ID
// (reinstall / clear data par badal jati hai -> ban bypass ho jata hai). expo-application install karo.
export async function getDeviceIdKind() {
  const id = await getDeviceId();
  return id && String(id).startsWith("d_") ? "stable" : "weak";
}

// ---- "device banned" event (api.js emit karta hai, _layout.tsx sunta hai) ----
const listeners = new Set();

export function onDeviceBanned(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function emitDeviceBanned() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch (e) {}
  });
}
