import {
  doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where,
  serverTimestamp, deleteField,
} from "firebase/firestore";
import { db } from "../app/firebaseConfig";

export const REVIEW_HOURS = 72;     // family request review time
export const MAX_MEMBERS = 100;     // ek family me max members
export const Y = "#FFE500";         // Tiki yellow
export const DEFAULT_AVATAR = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

// ---- Family kaun bana sakta hai (rules screen me: "verified creators only") ----
// Aapke app me verified = true (white/yellow tick). Blue/Grey type alag se
// rakhna ho to yahin ek jagah badalna hai.
export const canCreateFamily = (u) => !!(u && u.verified === true);

export const toMs = (t) => (t?.toMillis ? t.toMillis() : typeof t === "number" ? t : 0);

export const remainingText = (deadlineMs) => {
  if (!deadlineMs) return "";
  const diff = deadlineMs - Date.now();
  if (diff <= 0) return "Review jaldi hoga";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m baki`;
};

export const fmtPoints = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
};

// User ka apna data family ke sath sync karta hai (client-side, rules-safe):
//  - leader ki family approve ho gayi -> leader ko members me daalo + users doc update
//  - leader ne join request accept ki -> user ka users doc update
//  - family disable/delete hui -> user se family hata do
export async function syncMyFamily(uid) {
  if (!uid) return;
  const uRef = doc(db, "users", uid);
  const u = (await getDoc(uRef)).data() || {};

  const mine = await getDocs(query(collection(db, "families"), where("leaderId", "==", uid)));
  const approved = mine.docs.find((d) => d.data().status === "approved");

  if (approved && u.familyId !== approved.id) {
    const f = approved.data();
    await setDoc(doc(db, "families", approved.id, "members", uid), {
      uid, role: "leader",
      username: u.username || "", name: u.name || "",
      photoURL: u.profileImg || u.photoURL || "", verified: !!u.verified,
      points: 0, joinedAt: serverTimestamp(),
    }, { merge: true });
    await updateDoc(uRef, {
      familyId: approved.id, familyName: f.name, familyLogo: f.logo || "", familyRole: "leader",
    });
    return;
  }

  if (!u.familyId) {
    const rq = await getDocs(query(collection(db, "familyRequests"), where("userId", "==", uid)));
    const acc = rq.docs.find((d) => d.data().status === "accepted");
    if (acc) {
      const fs = await getDoc(doc(db, "families", acc.data().familyId));
      if (fs.exists() && fs.data().status === "approved") {
        await updateDoc(uRef, {
          familyId: fs.id, familyName: fs.data().name, familyLogo: fs.data().logo || "", familyRole: "member",
        });
      }
      await updateDoc(acc.ref, { status: "joined" });
    }
    return;
  }

  const fs = await getDoc(doc(db, "families", u.familyId));
  const mem = fs.exists() ? await getDoc(doc(db, "families", u.familyId, "members", uid)) : null;
  // family band/delete hui ya leader ne member se hata diya -> family hata do
  if (!fs.exists() || fs.data().status !== "approved" || !mem || !mem.exists()) {
    await updateDoc(uRef, {
      familyId: deleteField(), familyName: deleteField(), familyLogo: deleteField(), familyRole: deleteField(),
    });
  }
}


const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

// Logo upload -> Cloudinary (wahi preset jo profile photo me chalta hai).
// Firebase Storage bucket 404 de raha tha aur JS SDK React Native me blob error deta hai,
// isliye server ya Firebase Storage ki zaroorat nahi.
const CLOUD_NAME = "fzmrnrlz";
const UPLOAD_PRESET = "topking_upload";

async function cloudPost(body, headers) {
  const res = await withTimeout(
    fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", headers, body }),
    60000
  );
  const j = await res.json();
  if (!res.ok || !j.secure_url) throw new Error(j?.error?.message || `http-${res.status}`);
  return j.secure_url;
}

// base64 (ImagePicker base64:true) ho to wahi bhejta hai - file/FormData ke
// "Network request failed" se bachne ke liye. Warna file FormData (profile jaisa).
export async function uploadFamilyLogo(uri, uid, base64) {
  const errors = [];
  if (base64) {
    try {
      return await cloudPost(
        JSON.stringify({ file: `data:image/jpeg;base64,${base64}`, upload_preset: UPLOAD_PRESET }),
        { "Content-Type": "application/json" }
      );
    } catch (e) { errors.push("base64: " + (e?.message || "?")); console.log("LOGO UPLOAD FAIL base64", e?.message); }
  }
  try {
    const data = new FormData();
    data.append("file", { uri, type: "image/jpeg", name: "family_logo.jpg" });
    data.append("upload_preset", UPLOAD_PRESET);
    return await cloudPost(data);
  } catch (e) { errors.push("file: " + (e?.message || "?")); console.log("LOGO UPLOAD FAIL file", e?.message); }
  throw new Error("Logo upload nahi hua. Internet check karo.\n" + errors.join("\n"));
}
