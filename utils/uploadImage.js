// Shared logo/photo upload -> apna server -> Cloudflare R2.
// kind: "agency" | "family"  (server: POST /upload-logo?kind=...)
import * as FileSystem from "expo-file-system/legacy";
import { API_BASE } from "./api";
import { getDeviceId } from "./deviceId";

export async function uploadImage(uri, kind = "agency") {
  if (!uri) throw new Error("Photo select karo");
  if (/^https?:\/\//i.test(uri)) return uri; // pehle se upload hai (R2 url)

  const { auth } = require("../app/firebaseConfig");
  const user = auth.currentUser;
  if (!user) throw new Error("Please login dobara karo.");
  const token = await user.getIdToken();
  const deviceId = await getDeviceId();

  const lower = String(uri).toLowerCase().split("?")[0];
  let mime = "image/jpeg";
  if (lower.endsWith(".png")) mime = "image/png";
  else if (lower.endsWith(".webp")) mime = "image/webp";

  let timer;
  let up;
  try {
    up = await Promise.race([
      FileSystem.uploadAsync(`${API_BASE}/upload-logo?kind=${encodeURIComponent(kind)}`, uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "media",
        mimeType: mime,
        headers: {
          Authorization: "Bearer " + token,
          ...(deviceId ? { "x-device-id": deviceId } : {}),
        },
      }),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("TIMEOUT")), 60000); }),
    ]);
  } catch (err) {
    throw new Error(
      err && err.message === "TIMEOUT"
        ? "Server jawab nahi de raha. Thodi der baad dobara try karo."
        : "Internet check karo, photo upload nahi hui."
    );
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try { data = JSON.parse(up.body); } catch (e) {}
  if (!data || up.status < 200 || up.status >= 300 || !data.success || !data.url) {
    throw new Error(
      up.status === 429 ? "Thodi der baad dobara try karo."
        : (data && data.error) || "Photo upload nahi hui (" + up.status + ")"
    );
  }
  return data.url;
}
