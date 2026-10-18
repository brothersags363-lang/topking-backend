// Share links ek hi jagah se banate hain.
// SHARE_HOST = wo domain jo tum Vercel (ya kisi hosting) pe lagaoge.
// Agar topking.app tumhara nahi hai to yahan apna domain likho
// (jaise "topking-short.vercel.app") aur app.json me bhi wahi host rakho.
export const SHARE_HOST = "topking.app";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.gufran.topking";

export const profileLink = (userId) => `https://${SHARE_HOST}/profile/${userId}`;
export const videoLink = (videoId) => `https://${SHARE_HOST}/video/${videoId}`;
export const liveLink = (roomId, key) =>
  key
    ? `https://${SHARE_HOST}/live/${roomId}?key=${encodeURIComponent(key)}`
    : `https://${SHARE_HOST}/live/${roomId}`;
