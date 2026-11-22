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
const WHITE_VIEWS = 300; // White tick: har video par itne views
const WHITE_NEEDED = 5; // itne videos
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

  // ---------------------------------------------------------------
  // AUTO SWEEP: pehle tick tabhi lagta tha jab user khud apna profile kholta tha.
  // Ab server har kuch ghante me khud check karta hai (user ko kuch kholna nahi padta).
  // Sirf wahi videos padhta hai jinke views >= GREY_VIEWS (kam reads).
  // Rule wahi: face + photo/bio + quiz + 5 videos x 3000+ views. Admin ne hataya ho to dobara nahi.
  // Band karna ho to Render env me AUTO_TICK_SWEEP=0.
  // ---------------------------------------------------------------
  let sweeping = false;
  async function grantGreyIfEligible(uid) {
    const userRef = db.collection("users").doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return false;
    const p = snap.data();
    if (p.banned === true || p.verifiedColor === "yellow" || p.verifiedColor === "blue") return false;
    if (p.greyAutoGranted === true) return false;
    if (!faceDone(p) || !profileDone(p) || p.quizPassed !== true) return false;
    return db.runTransaction(async (tx) => {
      const s2 = await tx.get(userRef);
      const d = s2.exists ? s2.data() : null;
      if (!d || d.banned === true) return false;
      if (d.verifiedColor === "yellow" || d.verifiedColor === "blue" || d.greyAutoGranted === true) return false;
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
        reason: `${GREY_NEEDED} videos x ${GREY_VIEWS}+ views (auto sweep)`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    });
  }

  // WHITE tick: 5 videos x 300+ views (koi aur shart nahi). Grey/Blue/White pehle se ho to kuch nahi.
  // Admin ne hataya ho (whiteAutoGranted / greyAutoGranted) to dobara auto nahi.
  async function grantWhiteIfEligible(uid) {
    const userRef = db.collection("users").doc(uid);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const d = snap.exists ? snap.data() : null;
      if (!d || d.banned === true) return false;
      if (d.verified === true || d.verifiedColor === "white" || d.verifiedColor === "yellow" || d.verifiedColor === "blue") return false;
      if (d.whiteAutoGranted === true || d.greyAutoGranted === true) return false;
      tx.update(userRef, {
        verified: true,
        verifiedColor: "white",
        whiteAutoGranted: true,
        whiteAutoGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(db.collection("verifiedGrants").doc(), {
        userId: uid,
        username: d.username || "",
        verified: true,
        color: "white",
        adminId: "auto",
        auto: true,
        reason: `${WHITE_NEEDED} videos x ${WHITE_VIEWS}+ views`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    });
  }

  async function countVideos(uid) {
    const snap = await db.collection("all_videos").where("userId", "==", uid).select("views").get();
    let w = 0;
    let g = 0;
    snap.forEach((doc) => {
      const v = Number(doc.get("views") || 0);
      if (v >= WHITE_VIEWS) w += 1;
      if (v >= GREY_VIEWS) g += 1;
    });
    return { w, g };
  }

  // Client (profile) ye call karta hai jab 5 video 300+ views par ho; server khud dobara ginta hai.
  app.post("/creator/claim-white", generalLimiter, verifyUser, async (req, res) => {
    try {
      const uid = req.user.uid;
      const { w } = await countVideos(uid);
      if (w < WHITE_NEEDED) {
        return res.status(403).json({ success: false, code: "VIEWS_REQUIRED", error: `Need ${WHITE_NEEDED} videos with ${WHITE_VIEWS}+ views (${w}/${WHITE_NEEDED})` });
      }
      const granted = await grantWhiteIfEligible(uid);
      return res.json({ success: true, granted, color: "white" });
    } catch (e) {
      console.error("CLAIM WHITE ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  async function sweepGreyTicks() {
    if (sweeping) return;
    sweeping = true;
    try {
      const per = new Map();
      const snap = await db.collection("all_videos").where("views", ">=", WHITE_VIEWS).select("userId", "views").get();
      snap.forEach((d) => {
        const uid = d.get("userId");
        if (!uid) return;
        const v = Number(d.get("views") || 0);
        const c = per.get(uid) || { w: 0, g: 0 };
        c.w += 1;
        if (v >= GREY_VIEWS) c.g += 1;
        per.set(uid, c);
      });
      let greyN = 0;
      let whiteN = 0;
      for (const [uid, c] of per) {
        try {
          let done = false;
          if (c.g >= GREY_NEEDED) done = await grantGreyIfEligible(uid);
          if (done) greyN += 1;
          else if (c.w >= WHITE_NEEDED && (await grantWhiteIfEligible(uid))) whiteN += 1;
        } catch (e) {
          console.error("AUTO TICK USER ERROR:", uid, e && e.message);
        }
      }
      if (greyN || whiteN) console.log(`AUTO TICK SWEEP: grey=${greyN} white=${whiteN}`);
    } catch (e) {
      console.error("AUTO TICK SWEEP ERROR:", e && e.message);
    } finally {
      sweeping = false;
    }
  }

  if (process.env.AUTO_TICK_SWEEP !== "0") {
    setTimeout(sweepGreyTicks, 90 * 1000);
    setInterval(sweepGreyTicks, 6 * 60 * 60 * 1000);
  }
};
