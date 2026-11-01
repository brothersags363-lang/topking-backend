import {
  doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where,
  serverTimestamp, deleteField,
} from "firebase/firestore";
import { db } from "../app/firebaseConfig";
import { uploadImage } from "./uploadImage";

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
  } else if ((u.familyLogo || "") !== (fs.data().logo || "") || (u.familyName || "") !== (fs.data().name || "")) {
    // leader ne logo / naam badla -> member ke users doc me bhi refresh
    await updateDoc(uRef, { familyLogo: fs.data().logo || "", familyName: fs.data().name || "" });
  }
}


// Logo upload -> apna server -> Cloudflare R2
export async function uploadFamilyLogo(uri) {
  return uploadImage(uri, "family");
}
