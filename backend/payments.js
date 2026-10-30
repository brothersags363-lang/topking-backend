// Video star gift + manual (PhonePe) recharge routes
//  POST /gift/video-star          (user)  video ko star dena
//  POST /recharge-request         (user)  PhonePe payment ke baad UTR bhejna
//  POST /admin/approve-recharge   (admin) stars daal ke approve
//  POST /admin/reject-recharge    (admin) reject
module.exports = function mountPayments({ app, db, admin, verifyUser, rateLimit }) {
  const FieldValue = admin.firestore.FieldValue;

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Too many requests. Please try again later." },
  });

  async function requireAdmin(req, res, next) {
    try {
      if (req.user && req.user.admin === true) return next();
      const snap = await db.collection("admins").doc(req.user.uid).get();
      if (snap.exists && snap.data().role === "admin") return next();
    } catch (_) {}
    return res.status(403).json({ success: false, error: "Admin access required" });
  }

  // =====================================================
  // VIDEO STAR GIFT  (sender ke stars ghatte, owner ko earnings milti hain)
  // =====================================================
  const GIFT_AMOUNTS = [1, 3, 10];

  app.post("/gift/video-star", limiter, verifyUser, async (req, res) => {
    try {
      const uid = req.user.uid;
      const videoId = String((req.body && req.body.videoId) || "");
      const amount = Math.floor(Number(req.body && req.body.stars));

      if (!/^[A-Za-z0-9_-]{1,200}$/.test(videoId))
        return res.status(400).json({ success: false, error: "Invalid video" });
      if (!GIFT_AMOUNTS.includes(amount))
        return res.status(400).json({ success: false, error: "Invalid star amount" });

      // sender profile (topGifters me dikhane ke liye)
      const meSnap = await db.collection("users").doc(uid).get();
      const me = meSnap.exists ? meSnap.data() : {};

      const videoRef = db.collection("all_videos").doc(videoId);
      const senderWalletRef = db.collection("wallets").doc(uid);

      const result = await db.runTransaction(async (tx) => {
        const vSnap = await tx.get(videoRef);
        if (!vSnap.exists) throw new Error("VIDEO_NOT_FOUND");

        const ownerUid = vSnap.data().userId;
        if (typeof ownerUid !== "string" || !ownerUid) throw new Error("VIDEO_NOT_FOUND");
        if (ownerUid === uid) throw new Error("SELF_GIFT");

        const ownerWalletRef = db.collection("wallets").doc(ownerUid);
        const ownerUserRef = db.collection("users").doc(ownerUid);

        const sSnap = await tx.get(senderWalletRef);
        const oUserSnap = await tx.get(ownerUserRef);

        const balance = sSnap.exists ? Number(sSnap.data().stars || 0) : 0;
        if (balance < amount) throw new Error("NO_STARS");

        tx.update(senderWalletRef, { stars: FieldValue.increment(-amount), totalSpent: FieldValue.increment(amount) });

        tx.set(
          ownerWalletRef,
          {
            earnings: FieldValue.increment(amount),
            receivedStars: FieldValue.increment(amount),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        tx.update(videoRef, { stars: FieldValue.increment(amount) });

        if (oUserSnap.exists) {
          tx.update(ownerUserRef, {
            [`topGifters.${uid}.uid`]: uid,
            [`topGifters.${uid}.username`]: me.username || "",
            [`topGifters.${uid}.name`]: me.name || me.username || "User",
            [`topGifters.${uid}.profileImg`]: me.profileImg || me.photoURL || me.photo || "",
            [`topGifters.${uid}.stars`]: FieldValue.increment(amount),
          });
        }

        return { stars: balance - amount };
      });

      return res.json({ success: true, ...result });
    } catch (e) {
      const map = {
        VIDEO_NOT_FOUND: [404, "Video nahi mila"],
        SELF_GIFT: [400, "Apne video ko star nahi de sakte"],
        NO_STARS: [400, "Not enough Stars"],
      };
      if (map[e.message]) return res.status(map[e.message][0]).json({ success: false, error: map[e.message][1] });
      console.error("VIDEO STAR ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  // =====================================================
  // RECHARGE (PhonePe QR + UTR)
  // =====================================================
  const PACKAGE_PRICES = [15, 100, 500, 2500, 5000, 10000];

  app.post(["/recharge-request", "/recharge/request"], limiter, verifyUser, async (req, res) => {
    try {
      const uid = req.user.uid;
      const amount = Number(req.body && req.body.amount);
      const utr = String((req.body && req.body.utr) || "").trim().toUpperCase();

      if (!PACKAGE_PRICES.includes(amount))
        return res.status(400).json({ success: false, error: "Invalid package" });
      if (!/^[A-Z0-9]{8,30}$/.test(utr))
        return res.status(400).json({ success: false, error: "Sahi Transaction ID / UTR daalo" });

      const pending = await db
        .collection("rechargeRequests")
        .where("uid", "==", uid)
        .where("status", "==", "Pending")
        .limit(6)
        .get();
      if (pending.size >= 5)
        return res.status(429).json({ success: false, error: "Pehle wale pending requests approve hone do" });

      const uSnap = await db.collection("users").doc(uid).get();
      const u = uSnap.exists ? uSnap.data() : {};

      const id = "utr_" + utr; // ek UTR sirf ek baar
      try {
        await db.collection("rechargeRequests").doc(id).create({
          uid,
          userId: uid,
          name: u.name || "",
          username: u.username || "",
          profileImg: u.profileImg || u.photoURL || u.photo || "",
          amount,
          utr,
          status: "Pending",
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (e) {
        if (e.code === 6 || /already exists/i.test(e.message))
          return res.status(409).json({ success: false, error: "Ye UTR pehle hi use ho chuka hai" });
        throw e;
      }

      await db.collection("wallets").doc(uid).collection("purchaseHistory").doc(id).set({
        stars: 0,
        amount,
        paymentId: utr,
        status: "Pending",
        createdAt: FieldValue.serverTimestamp(),
      });

      return res.json({ success: true });
    } catch (e) {
      console.error("RECHARGE REQUEST ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  app.post("/admin/approve-recharge", limiter, verifyUser, requireAdmin, async (req, res) => {
    try {
      const id = String((req.body && req.body.id) || "");
      const stars = Math.floor(Number(req.body && req.body.stars));
      if (!id) return res.status(400).json({ success: false, error: "id required" });
      if (!Number.isFinite(stars) || stars < 1 || stars > 10000000)
        return res.status(400).json({ success: false, error: "Stars sahi number hona chahiye" });

      const reqRef = db.collection("rechargeRequests").doc(id);

      const out = await db.runTransaction(async (tx) => {
        const snap = await tx.get(reqRef);
        if (!snap.exists) throw new Error("NOT_FOUND");
        const r = snap.data();
        if (r.status !== "Pending") throw new Error("DONE");

        const walletRef = db.collection("wallets").doc(r.uid);
        const wSnap = await tx.get(walletRef);
        const total = (wSnap.exists ? Number(wSnap.data().stars || 0) : 0) + stars;
        // Recharge se level NAHI badhta. Level sirf kharch (totalSpent) se badhta hai
        // (functions/index.js -> syncWalletLevel). Isliye yahan level jyon ka tyon rehta hai.
        const level = wSnap.exists ? Number(wSnap.data().level || 0) : 0;

        if (wSnap.exists) tx.update(walletRef, { stars: total });
        else tx.set(walletRef, { stars: total, level, earnings: 0, receivedStars: 0, totalSpent: 0 });

        tx.update(reqRef, {
          status: "Approved",
          starsGiven: stars,
          approvedBy: req.user.uid,
          approvedAt: FieldValue.serverTimestamp(),
        });
        tx.set(
          walletRef.collection("purchaseHistory").doc(id),
          { stars, amount: r.amount, paymentId: r.utr, status: "Completed" },
          { merge: true }
        );
        return { total, level };
      });

      return res.json({ success: true, ...out });
    } catch (e) {
      if (e.message === "NOT_FOUND") return res.status(404).json({ success: false, error: "Request nahi mili" });
      if (e.message === "DONE") return res.status(409).json({ success: false, error: "Ye request pehle hi process ho chuki hai" });
      console.error("APPROVE RECHARGE ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  app.post("/admin/reject-recharge", limiter, verifyUser, requireAdmin, async (req, res) => {
    try {
      const id = String((req.body && req.body.id) || "");
      if (!id) return res.status(400).json({ success: false, error: "id required" });
      const reqRef = db.collection("rechargeRequests").doc(id);

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(reqRef);
        if (!snap.exists) throw new Error("NOT_FOUND");
        const r = snap.data();
        if (r.status !== "Pending") throw new Error("DONE");
        tx.update(reqRef, {
          status: "Rejected",
          rejectedBy: req.user.uid,
          rejectedAt: FieldValue.serverTimestamp(),
        });
        tx.set(
          db.collection("wallets").doc(r.uid).collection("purchaseHistory").doc(id),
          { status: "Rejected" },
          { merge: true }
        );
      });
      return res.json({ success: true });
    } catch (e) {
      if (e.message === "NOT_FOUND") return res.status(404).json({ success: false, error: "Request nahi mili" });
      if (e.message === "DONE") return res.status(409).json({ success: false, error: "Already processed" });
      console.error("REJECT RECHARGE ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });
};
