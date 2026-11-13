// =====================================================
// GREY V (auto system) - alag file, server.js ka purana code nahi badla.
//
// Rule (sab server par check hota hai, client par bharosa nahi):
//   1) Face verification done (faceStatus submitted / approved)
//   2) Profile me real photo + bio
//   3) Quiz pass
//   4) 5 videos, har ek par 3000+ views      <-- pehle "5 videos 300+ & 4500 total" tha
// Sab pura hote hi Grey V tick (verifiedColor: "yellow") khud lag jata hai.
//
// Admin ne agar baad me tick hata diya to dobara auto nahi lagega (greyAutoGranted flag).
// Blue tick wale ko kabhi downgrade nahi karta.
//
// server.js me bas ek hook:  require("./creatorTicks")({ app, db, admin, verifyUser, generalLimiter });
// =====================================================
const GREY_VIEWS = 3000; // har video par itne views
const GREY_NEEDED = 5; // itne videos
const DEFAULT_AVATAR_MARK = "3135715"; // default profile icon (creator.js jaisa hi)

module.exports = function creatorTicks({ app, db, admin, verifyUser, generalLimiter }) {
  const faceDone = (d) =>
    !!d && (d.faceVerified === true || d.faceStatus === "submitted" || d.faceStatus === "approved");

  const profileDone = (d) =>
    !!d &&
    !!d.profileImg &&
    !String(d.profileImg).includes(DEFAULT_AVATAR_MARK) &&
    !!String(d.bioText || "").trim();

  // Sirf "views" field padhte hain (poora video doc nahi) -> fast + sasta
  async function countGreyVideos(uid) {
    const snap = await db.collection("all_videos").where("userId", "==", uid).select("views").get();
    let n = 0;
    snap.forEach((doc) => {
      if (Number(doc.get("views") || 0) >= GREY_VIEWS) n += 1;
    });
    return n;
  }

  app.post("/creator/claim-grey", generalLimiter, verifyUser, async (req, res) => {
    try {
      const uid = req.user.uid;
      const userRef = db.collection("users").doc(uid);

      // Halka check pehle (transaction se bahar) taaki bekar me video query na chale
      const pre = await userRef.get();
      if (!pre.exists) return res.status(404).json({ success: false, error: "User not found" });
      const p = pre.data();
      if (p.banned === true) return res.status(403).json({ success: false, error: "Account blocked" });
      if (p.verifiedColor === "yellow" || p.verifiedColor === "blue") {
        return res.json({ success: true, granted: false, reason: "already" });
      }
      if (p.greyAutoGranted === true) {
        // pehle mil chuka tha aur admin ne hata diya -> auto dobara nahi
        return res.json({ success: true, granted: false, reason: "revoked" });
      }
      if (!faceDone(p)) {
        return res.status(403).json({ success: false, code: "FACE_REQUIRED", error: "Face verification pending" });
      }
      if (!profileDone(p)) {
        return res.status(403).json({ success: false, code: "PROFILE_REQUIRED", error: "Add a real photo and bio first" });
      }
      if (p.quizPassed !== true) {
        return res.status(403).json({ success: false, code: "QUIZ_REQUIRED", error: "Pass the quiz first" });
      }

      const count = await countGreyVideos(uid);
      if (count < GREY_NEEDED) {
        return res.status(403).json({
          success: false,
          code: "VIEWS_REQUIRED",
          error: `Need ${GREY_NEEDED} videos with ${GREY_VIEWS}+ views (${count}/${GREY_NEEDED})`,
        });
      }

      // Final likhna transaction me: do request ek saath aayein to bhi tick/log ek hi baar
      const granted = await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        const d = snap.exists ? snap.data() : null;
        if (!d || d.banned === true) return false;
        if (d.verifiedColor === "yellow" || d.verifiedColor === "blue") return false;
        if (d.greyAutoGranted === true) return false;

        tx.update(userRef, {
          verified: true,
          verifiedColor: "yellow",
          greyAutoGranted: true,
          greyAutoGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(db.collection("verifiedGrants").doc(), {
          userId: uid,
          username: d.username || "",
          verified: true,
          color: "yellow",
          adminId: "auto",
          auto: true,
          reason: `${GREY_NEEDED} videos x ${GREY_VIEWS}+ views`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return true;
      });

      return res.json({ success: true, granted, color: "yellow" });
    } catch (e) {
      console.error("CLAIM GREY ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });
};
