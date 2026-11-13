// App me jahan video share COMPLETE hota hai (share sheet success / chat me bhejne ke baad) wahan call karo.
// BASE_URL aur token aapke app ke existing helper se lo (jaise /notify/share call hota hai).
export async function claimShareReward(videoId, getToken, BASE_URL) {
  try {
    const token = await getToken();
    const r = await fetch(`${BASE_URL}/share/reward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ videoId }),
    });
    const d = await r.json();
    if (d.success && d.rewarded) {
      // toast: "+5 Stars! Aaj ke shares: 1/3"
      return { ok: true, msg: `+${d.starsAdded} Stars! Aaj ke shares: ${d.sharesToday}/3` };
    }
    if (d.success && d.reason === "daily_limit") return { ok: false, msg: "Aaj ke 3 share rewards ho gaye" };
    if (d.success && d.reason === "already_shared") return { ok: false, msg: "Ye video aaj pehle hi share ho chuka" };
    return { ok: false, msg: "Reward nahi mila" };
  } catch (e) {
    return { ok: false, msg: "Network error" };
  }
}
