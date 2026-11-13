// Video share ke baad star claim karo (server din me max 3 deta hai) aur message dikhao.
// Ye updateDoc/shares count se bilkul alag chalta hai, isliye wo fail ho to bhi reward milega.
import { callApi } from "./api";
import { showStarToast } from "./starToast";

export async function rewardShare(videoId) {
  if (!videoId) return;
  try {
    const r = await callApi("/reward/share", { videoId });
    if (r && r.awarded) showStarToast(`${r.stars} ${r.stars > 1 ? "stars" : "star"} received`);
    return r;
  } catch (e) {
    // Debug ke liye: backend deploy nahi hua ho to yaha 404 dikhega
    console.log("SHARE REWARD ERROR =", e && e.status, e && e.message);
  }
}
