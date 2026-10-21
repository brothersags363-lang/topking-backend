// Push notification trigger helpers.
// Sab "fire and forget" hain: fail ho to bhi app ka kaam nahi rukta.
// Asli kaam (kisko bhejna hai, count sahi hai ya nahi) server/notifications.js karta hai.
import { callApi } from "./api";

export const LIKE_MILESTONES = [10, 50, 100, 1000, 10000, 50000];

const fire = (path, body) => {
  try {
    callApi(path, body).catch(() => {});
  } catch (e) {}
};

// Host live start kare -> uske followers ko push
export const notifyLiveStarted = (roomId) => {
  if (roomId) fire("/notify/live-started", { roomId: String(roomId) });
};

// Kisi ko follow kiya -> us user ko push
export const notifyNewFollower = (targetUid) => {
  if (targetUid) fire("/notify/new-follower", { targetUid: String(targetUid) });
};

// Like ke baad: sirf tab server ko bulao jab count kisi milestone ke aas-paas ho
// (har like par server call nahi). Final faisla server karta hai.
export const notifyVideoLike = (videoId, likesNow) => {
  if (!videoId) return;
  const n = Number(likesNow) || 0;

  const near = LIKE_MILESTONES.some(
    (m) => n >= m - 5 && n <= m + Math.max(10, Math.ceil(m * 0.2))
  );

  if (near) fire("/notify/video-like", { videoId: String(videoId) });
};
