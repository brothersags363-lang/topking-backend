// =====================================================================
//  withdrawRoutes.js  -  Real withdrawal flow (sab kuch SERVER par)
//
//  POST /withdraw/request          (user)  withdrawal request banao
//  POST /admin/withdrawal-status   (admin) Success / Failed
//
//  Rule:
//   - Request par stars NAHI kategte (sirf check hota hai).
//   - Admin "Success" dabaye -> usi transaction me user ke wallet se
//     receivedStars (Gift Stars) = tk * 600 KAT jate hain.
//     Agar user ke paas utne stars nahi bache to Success nahi hoga.
//   - Admin "Failed" dabaye -> stars jyon ke tyon (kuch kata hi nahi).
//   - Dono jagah (withdrawals + wallets/{uid}/withdrawHistory) ek hi
//     doc id use hoti hai, isliye status dono me sath badalta hai.
//
//  Mount (server.js me, rewards ke baad):
//    require("./withdrawRoutes")({ app, db, admin, verifyUser, rateLimit });
// =====================================================================

const GIFT_STARS_PER_TK = 600;
const RUPEES_PER_TK = 37;
const MIN_TK = 25;
const MAX_TK = 100000;
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function httpErr(code, message) {
  const e = new Error(message);
  e.httpCode = code;
  return e;
}
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

module.exports = function mountWithdraw({ app, db, admin, verifyUser, rateLimit }) {
  const FieldValue = admin.firestore.FieldValue;

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user && req.user.uid) || req.ip,
    message: { success: false, error: "Too many requests" },
  });

  async function requireAdmin(req, res, next) {
    try {
      if (req.user && req.user.admin === true) return next();
      const snap = await db.collection("admins").doc(req.user.uid).get();
      if (snap.exists && snap.data().role === "admin") return next();
    } catch (_) {}
    return res.status(403).json({ success: false, error: "Admin access required" });
  }

  // ------------------------------------------------------------------
  // USER: withdrawal request
  // ------------------------------------------------------------------
  app.post("/withdraw/request", limiter, verifyUser, async (req, res) => {
    try {
      const uid = req.user.uid;
      const b = req.body || {};

      const tk = Math.floor(num(b.tk));
      if (tk < MIN_TK) throw httpErr(400, `Minimum Withdrawal is ${MIN_TK} TK`);
      if (tk > MAX_TK) throw httpErr(400, "Amount bahut zyada hai");

      const method = b.method === "BANK" ? "BANK" : "UPI";
      const accountName = String(b.accountName || "").trim().slice(0, 80);
      const mobile = String(b.mobile || "").trim();
      if (accountName.length < 3) throw httpErr(400, "Account Holder Name sahi se bharo");
      if (!/^[6-9]\d{9}$/.test(mobile)) throw httpErr(400, "Sahi 10 digit Mobile Number daalo");

      let payout, payoutMasked, payoutKey, upiId = "";
      if (method === "UPI") {
        upiId = String(b.upiId || "").trim();
        if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId))
          throw httpErr(400, "Sahi UPI ID daalo (example: name@ybl)");
        payout = { upiId };
        payoutMasked = upiId.replace(/^(.{2}).*(@.*)$/, "$1***$2");
        payoutKey = "upi|" + upiId.toLowerCase();
      } else {
        const accountNumber = String(b.accountNumber || "").trim();
        const ifsc = String(b.ifsc || "").trim().toUpperCase();
        if (!/^\d{9,18}$/.test(accountNumber)) throw httpErr(400, "Sahi Account Number daalo");
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw httpErr(400, "Sahi IFSC Code daalo");
        payout = { accountNumber, ifsc };
        payoutMasked = `Bank A/C ••••${accountNumber.slice(-4)} (${ifsc})`;
        payoutKey = `bank|${accountNumber}|${ifsc}`;
      }

      const giftStars = tk * GIFT_STARS_PER_TK;

      const userRef = db.collection("users").doc(uid);
      const walletRef = db.collection("wallets").doc(uid);
      const [uSnap, wSnap] = await Promise.all([userRef.get(), walletRef.get()]);
      if (!uSnap.exists || uSnap.data().banned === true)
        throw httpErr(403, "Account not allowed");
      const u = uSnap.data() || {};

      if (num(wSnap.exists ? wSnap.data().receivedStars : 0) < giftStars)
        throw httpErr(400, "Itna TK balance nahi hai");

      // 7 din me ek hi withdrawal (Failed wali ginti me nahi) + pending ek hi
      const mine = await db.collection("withdrawals").where("userId", "==", uid).get();
      const now = Date.now();
      for (const d of mine.docs) {
        const w = d.data();
        const st = w.status || "Pending";
        if (st === "Pending")
          throw httpErr(400, "Aapki pehle wali withdrawal request abhi pending hai");
        if (st === "Success") {
          const t = w.processedAt && w.processedAt.toMillis ? w.processedAt.toMillis()
                  : w.createdAt && w.createdAt.toMillis ? w.createdAt.toMillis() : 0;
          if (now - t < COOLDOWN_MS) {
            const days = Math.ceil((COOLDOWN_MS - (now - t)) / 86400000);
            throw httpErr(400, `You can withdraw again after ${days} days`);
          }
        }
      }

      // fraud flag: same payout account kisi dusre user ne bhi use kiya?
      const flags = [];
      const same = await db.collection("withdrawals").where("payoutKey", "==", payoutKey).limit(10).get();
      if (same.docs.some((d) => d.data().userId !== uid)) flags.push("PAYOUT_SHARED_WITH_OTHER_USER");

      const ref = db.collection("withdrawals").doc();
      const base = {
        userId: uid,
        agencyId: u.agencyId || "",
        agencyName: u.agencyName || "",
        accountName,
        mobileNumber: mobile,
        mobile,
        method,
        payout,
        tk,
        giftStars,
        status: "Pending",
        createdAt: FieldValue.serverTimestamp(),
      };

      const batch = db.batch();
      batch.set(ref, {
        ...base,
        name: u.name || "",
        username: u.username || "",
        profileImg: u.profileImg || "",
        amount: tk * RUPEES_PER_TK, // ₹ jo admin ko bhejna hai
        payoutMasked,
        payoutKey,
        flags,
      });
      batch.set(walletRef.collection("withdrawHistory").doc(ref.id), {
        ...base,
        amount: tk * RUPEES_PER_TK,
        upiId,
      });
      await batch.commit();

      return res.json({ success: true, id: ref.id });
    } catch (e) {
      if (e && e.httpCode) return res.status(e.httpCode).json({ success: false, error: e.message });
      console.error("WITHDRAW REQUEST ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  // ------------------------------------------------------------------
  // ADMIN: Success / Failed
  // body: { withdrawId, status: "Success" | "Failed" }
  // ------------------------------------------------------------------
  app.post("/admin/withdrawal-status", limiter, verifyUser, requireAdmin, async (req, res) => {
    try {
      const id = String((req.body && req.body.withdrawId) || "");
      const status = String((req.body && req.body.status) || "");
      if (!id || id.includes("/")) throw httpErr(400, "Invalid withdrawal");
      if (status !== "Success" && status !== "Failed") throw httpErr(400, "Invalid status");

      const wdRef = db.collection("withdrawals").doc(id);

      const out = await db.runTransaction(async (tx) => {
        const wd = await tx.get(wdRef);
        if (!wd.exists) throw httpErr(404, "Withdrawal nahi mili");
        const d = wd.data();
        if ((d.status || "Pending") !== "Pending")
          throw httpErr(409, "Ye withdrawal pehle hi process ho chuki hai");

        const uid = d.userId;
        const walletRef = db.collection("wallets").doc(uid);
        const histRef = walletRef.collection("withdrawHistory").doc(id);
        const giftStars = num(d.giftStars);
        let received = null;
        // history doc na ho (purani request) to tx me pehle hi padh lo
        const histSnap = await tx.get(histRef);

        if (status === "Success") {
          const wSnap = await tx.get(walletRef);
          const have = wSnap.exists ? num(wSnap.data().receivedStars) : 0;
          if (giftStars <= 0) throw httpErr(400, "Invalid giftStars");
          if (have < giftStars)
            throw httpErr(400, `User ke paas ${giftStars} Gift Stars nahi bache (abhi ${have}). Isko Failed kar do.`);

          // ---- yahi asli kharcha: user ke stars KATTE hain ----
          tx.update(walletRef, { receivedStars: have - giftStars, updatedAt: FieldValue.serverTimestamp() });
          received = have - giftStars;
        }

        tx.update(wdRef, {
          status,
          processedBy: req.user.uid,
          processedAt: FieldValue.serverTimestamp(),
          ...(status === "Success" ? { starsDeducted: giftStars } : {}),
        });
        tx.set(
          histRef,
          {
            status: status === "Success" ? "Completed" : "Failed",
            processedAt: FieldValue.serverTimestamp(),
            ...(histSnap.exists ? {} : {
              userId: uid, tk: num(d.tk), giftStars, method: d.method || "UPI",
              accountName: d.accountName || "", mobileNumber: d.mobileNumber || "",
              payout: d.payout || {}, amount: num(d.amount),
              upiId: (d.payout && d.payout.upiId) || "",
              createdAt: d.createdAt || FieldValue.serverTimestamp(),
            }),
            ...(status === "Success" ? { starsDeducted: giftStars } : {}),
          },
          { merge: true }
        );
        return { status, receivedStars: received, starsDeducted: status === "Success" ? giftStars : 0 };
      });

      return res.json({ success: true, ...out });
    } catch (e) {
      if (e && e.httpCode) return res.status(e.httpCode).json({ success: false, error: e.message });
      console.error("WITHDRAWAL STATUS ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });
};
