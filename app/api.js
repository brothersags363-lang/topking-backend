// Server (money.js) ko login-token ke saath call karne ka helper.
// Paise wale kaam (gift, recharge, withdraw, reward) sirf yahi se hote hain.
export const API_BASE = "https://topking-backend.onrender.com";

export async function callApi(path, body = {}) {
  const { auth } = require("./firebaseConfig");
  const user = auth.currentUser;
  if (!user) throw new Error("Please login first");

  const token = await user.getIdToken();

  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {}

  if (!res.ok || !data || data.success === false) {
    const err = new Error((data && data.error) || "Request failed");
    err.status = res.status;
    throw err;
  }

  return data;
}
