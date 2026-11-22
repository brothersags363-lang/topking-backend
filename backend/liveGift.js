// backend/liveGift.js
// =====================================================================
// LIVE GIFT (paise ka kaam SERVER par)  ->  POST /live/gift
//
// PEHLE: phone khud `wallets/{uid}` se stars ghatata tha aur receiver ke `wallets` ko badhata tha.
//        Firestore rules me thodi bhi chook ho to koi bhi apne stars badha sakta tha.
// AB:    phone sirf bolta hai "ye gift, in logon ko, itne tap". Server:
//          - gift ki keemat APNI list se leta hai (phone ka price nahi manta)
//          - ek transaction me sender ke stars kaatta, receivers ko deta, topGifters likhta hai
//          - requestId se double-charge rokta hai (retry safe)
//        Room ka animation / chat line / seatStars phone pehle jaise likhta hai (ye paisa nahi hai).
//
// server.js me:  require("./liveGift")(app, { admin, db, verifyUser });
//
// DHYAN: GIFT_PRICES ko assets/giftsData.js ke saath same rakhna. Naya gift add karo to yahan bhi daalo.
// =====================================================================

const { readLevelStars, spendFields } = require("./levelStars");

const GIFT_PRICES = {
  star: 3,
  Rose: 10,
  lovehearts: 50,
  camera: 999,
  mic: 499,
  topkingstar: 2999,
  car3d: 1299,
  king3d: 3999,
  trophy3d: 15999,
};

const MAX_TAPS = 999;
const MAX_RECEIVERS = 9;
const MAX_TOTAL = 2000000;
const PER_USER_PER_MIN = 90;

module.exports = function registerLiveGift(app, { admin, db, verifyUser }) {
  const FieldValue = admin.firestore.FieldValue;

  const hits = new Map();
  setInterval(() => hits.clear(), 60 * 1000).unref();

  app.post("/live/gift", verifyUser, async (req, res) => {
    try {
      const uid = req.user.uid;
      const n = (hits.get(uid) || 0) + 1;
      hits.set(uid, n);
      if (n > PER_USER_PER_MIN) {
        return res.status(429).json({ success: false, error: "Too many requests" });
      }

      const body = req.body || {};
      const roomId = String(body.roomId || "");
      const giftId = String(body.giftId || "");
      const requestId = String(body.requestId || "");
      const taps = Math.floor(Number(body.taps == null ? 1 : body.taps));
      const rawIds = Array.isArray(body.receiverIds) ? body.receiverIds : [];

      if (!/^[A-Za-z0-9_-]{1,200}$/.test(roomId)) {
        return res.status(400).json({ success: false, error: "Invalid room" });
      }
      if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) {
        return res.status(400).json({ success: false, error: "Invalid request" });
      }
      if (!Object.prototype.hasOwnProperty.call(GIFT_PRICES, giftId)) {
        return res.status(400).json({ success: false, error: "Invalid gift" });
      }
      if (!Number.isFinite(taps) || taps < 1 || taps > MAX_TAPS) {
        return res.status(400).json({ success: false, error: "Invalid amount" });
      }

      const ids = Array.from(new Set(rawIds.map((x) => String(x || "")).filter(Boolean)));
      if (!ids.length || ids.length > MAX_RECEIVERS || ids.some((x) => !/^[A-Za-z0-9_-]{1,128}$/.test(x))) {
        return res.status(400).json({ success: false, error: "Invalid receiver" });
      }
      if (ids.includes(uid)) {
        return res.status(400).json({ success: false, error: "Khud ko gift nahi de sakte" });
      }

      const unit = GIFT_PRICES[giftId] * taps;
      const total = unit * ids.length;
      if (total > MAX_TOTAL) {
        return res.status(400).json({ success: false, error: "Invalid amount" });
      }

      // room hona chahiye aur khatam nahi hona chahiye
      const roomSnap = await db.collection("rooms").doc(roomId).get();
      if (!roomSnap.exists) {
        return res.status(404).json({ success: false, error: "Live khatam ho gaya" });
      }
      const st = String(roomSnap.data().status || "").toLowerCase().trim();
      if (st === "ended" || st === "inactive" || st === "closed") {
        return res.status(404).json({ success: false, error: "Live khatam ho gaya" });
      }

      // sender profile SERVER se (topGifters me phone ka likha naam/photo nahi)
      const meSnap = await db.collection("users").doc(uid).get();
      const me = meSnap.exists ? meSnap.data() : {};

      const reqRef = db.collection("giftRequests").doc(uid + "_" + requestId);
      const senderWalletRef = db.collection("wallets").doc(uid);
      const receiverUserRefs = ids.map((id) => db.collection("users").doc(id));

      const result = await db.runTransaction(async (tx) => {
        // ---- saare reads pehle ----
        const reqSnap = await tx.get(reqRef);
        if (reqSnap.exists) {
          return { stars: Number(reqSnap.data().stars) || 0, duplicate: true };
        }
        const sSnap = await tx.get(senderWalletRef);
        const userSnaps = await Promise.all(receiverUserRefs.map((r) => tx.get(r)));

        const balance = sSnap.exists ? Number(sSnap.data().stars || 0) : 0;
        if (balance < total) throw new Error("NO_STARS");
        const lvlStars = await readLevelStars(tx, senderWalletRef, sSnap.data());

        // ---- phir writes ----
        // sirf recharge/admin wale stars kharch hone par totalSpent (level) badhta hai
        tx.update(senderWalletRef, spendFields(FieldValue, lvlStars, total));

        ids.forEach((id, i) => {
          tx.set(
            db.collection("wallets").doc(id),
            {
              earnings: FieldValue.increment(unit),
              receivedStars: FieldValue.increment(unit),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          if (userSnaps[i].exists) {
            tx.update(receiverUserRefs[i], {
              [`topGifters.${uid}.uid`]: uid,
              [`topGifters.${uid}.username`]: me.username || "",
              [`topGifters.${uid}.name`]: me.name || me.username || "User",
              [`topGifters.${uid}.profileImg`]: me.profileImg || me.photoURL || me.photo || "",
              [`topGifters.${uid}.stars`]: FieldValue.increment(unit),
            });
          }
        });

        const after = balance - total;
        tx.set(reqRef, {
          uid,
          roomId,
          giftId,
          taps,
          receiverIds: ids,
          total,
          stars: after,
          createdAt: FieldValue.serverTimestamp(),
        });
        return { stars: after, duplicate: false };
      });

      return res.json({ success: true, ...result });
    } catch (e) {
      if (e && e.message === "NO_STARS") {
        return res.status(400).json({ success: false, error: "Not enough stars", code: "NO_STARS" });
      }
      console.error("LIVE GIFT ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });
};
