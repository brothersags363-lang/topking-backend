// =====================================================================
//  rewards.js  -  Live Reward + Gift Reward (sab kuch SERVER par)
//
//  Client sirf 2 cheez bhej sakta hai: "live-ping" (host zinda hai) aur
//  "claim". Minutes, viewers, gifts aur claim-lock sab server gintta hai,
//  isliye app me koi value badal ke fake claim nahi kar sakta.
//
//  Reward:
//    LIVE  : 2 ghanta live + 5 unique viewers      -> 300 Stars
//    GIFT  : 6500 Gift Stars (ek din me received)  -> 180 Stars
//  Din ka reset: IST (Asia/Kolkata) raat 12 baje.
//
//  Routes:
//    POST /reward/live-ping  { roomId }   (host, har ~30s)
//    POST /reward/status     {}           (progress padhne ke liye, optional)
//    POST /reward/claim      { type: "live" | "gift" }
//
//  Mount (server.js me, payments se PEHLE):
//    require("./rewards")({ app, db, admin, verifyUser, rateLimit });
// =====================================================================

const REWARD = {
  LIVE_SECONDS: 2 * 60 * 60, // 2 ghanta
  LIVE_VIEWERS: 5,           // 5 unique viewers
  LIVE_MIN_GIFTS: 0,         // pehle 1000 thi; abhi koi gift shart nahi
  LIVE_STARS: 300,           // upar wala reward
  GIFT_TARGET: 6500,         // 6500 gift stars
  GIFT_STARS: 180,           // niche wala reward
};

const PING_MIN_GAP_MS = 15 * 1000;      // isse tez ping ginti me nahi
const PING_MAX_CREDIT_S = 45;           // ek ping se max itna time judega
const PING_MAX_GAP_MS = 90 * 1000;      // isse zyada gap = beech me band tha
const VIEWER_MIN_STAY_MS = 60 * 1000;   // viewer kam se kam 1 min room me ho
const VIEWER_FRESH_MS = 3 * 60 * 1000;  // aur abhi bhi room me ho
const VIEWER_SCAN_LIMIT = 100;
const VIEWER_STORE_CAP = 50;

function istDate(ms = Date.now()) {
  // "YYYY-MM-DD" in Asia/Kolkata
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function freshDoc(date) {
  return {
    date,
    liveSeconds: 0,
    liveMinutes: 0,
    viewers: 0,
    viewerUids: [],
    dailyGifts: 0,
    lastReceived: null,
    lastPingAt: 0,
    roomId: "",
    liveRewardClaimed: false,
    giftRewardClaimed: false,
  };
}

module.exports = function mountRewards({ app, db, admin, verifyUser, rateLimit }) {
  const FieldValue = admin.firestore.FieldValue;

  const pingLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 12,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user && req.user.uid) || req.ip,
    message: { success: false, error: "Too many requests" },
  });

  const claimLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user && req.user.uid) || req.ip,
    message: { success: false, error: "Too many requests" },
  });

  const rewardRef = (uid) => db.collection("liveRewards").doc(uid);
  const walletRef = (uid) => db.collection("wallets").doc(uid);

  // Aaj ka doc; purani date ho to naya zero doc (claim-flags bhi reset)
  function normalize(data, today) {
    if (!data || data.date !== today) return freshDoc(today);
    return { ...freshDoc(today), ...data };
  }

  // wallet.receivedStars ka naya hissa = aaj ke gifts (server delta se).
  // receivedStars ghate (TK->Stars convert / withdraw) to sirf baseline neeche,
  // dailyGifts kam nahi hota.
  function applyGiftDelta(doc, receivedNow) {
    const now = num(receivedNow);
    if (doc.lastReceived === null || doc.lastReceived === undefined) {
      doc.lastReceived = now; // pehli baar: purana balance aaj ka gift nahi
      return;
    }
    const delta = now - num(doc.lastReceived);
    if (delta > 0) doc.dailyGifts = num(doc.dailyGifts) + delta;
    doc.lastReceived = now;
  }

  // Valid unique viewers: host nahi, room me >=1 min tika, abhi bhi online,
  // real (users doc hai) aur banned nahi.
  async function countNewViewers(roomId, hostUid, already) {
    const snap = await db
      .collection("rooms")
      .doc(roomId)
      .collection("audience")
      .limit(VIEWER_SCAN_LIMIT)
      .get();

    const now = Date.now();
    const cand = [];
    snap.forEach((d) => {
      const a = d.data() || {};
      const uid = String(a.uid || d.id);
      if (uid !== d.id) return;            // doc id aur uid same ho
      if (uid === hostUid) return;
      if (already.includes(uid)) return;
      if (a.online === false) return;
      const joinedAt = num(a.joinedAt);
      const lastSeen = num(a.lastSeen) || joinedAt;
      if (!joinedAt) return;
      if (now - joinedAt < VIEWER_MIN_STAY_MS) return;
      if (now - lastSeen > VIEWER_FRESH_MS) return;
      cand.push(uid);
    });
    if (!cand.length) return [];

    const refs = cand.map((u) => db.collection("users").doc(u));
    const users = await db.getAll(...refs);
    const ok = [];
    users.forEach((u) => {
      if (!u.exists) return;
      const ud = u.data() || {};
      if (ud.banned === true) return;
      ok.push(u.id);
    });
    return ok;
  }

  // ------------------------------------------------------------------
  // HOST PING - live ka time yahin se judta hai
  // ------------------------------------------------------------------
  app.post("/reward/live-ping", pingLimiter, verifyUser, async (req, res) => {
    try {
      const uid = req.user.uid;
      const roomId = String((req.body && req.body.roomId) || "");
      if (!roomId || roomId.length > 200 || roomId.includes("/")) {
        return res.status(400).json({ success: false, error: "Invalid room" });
      }

      // room sach me hai aur ye uid uska host hai?
      const roomSnap = await db.collection("rooms").doc(roomId).get();
      if (!roomSnap.exists) {
        return res.status(400).json({ success: false, error: "Room not live" });
      }
      const room = roomSnap.data() || {};
      if (room.status === "ended") {
        return res.status(400).json({ success: false, error: "Room not live" });
      }
      const hostId = String(room.hostId || roomId);
      if (hostId !== uid) {
        return res.status(403).json({ success: false, error: "Not the host" });
      }

      const today = istDate();
      const ref = rewardRef(uid);

      // Transaction se bahar: viewers ki scan (reads). Sirf tab jab target baaki ho.
      const pre = normalize((await ref.get()).data(), today);
      let newViewers = [];
      if (pre.viewerUids.length < REWARD.LIVE_VIEWERS) {
        newViewers = await countNewViewers(roomId, uid, pre.viewerUids);
      }

      const w = await walletRef(uid).get();
      const receivedNow = w.exists ? num(w.data().receivedStars) : 0;

      const out = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const d = normalize(snap.data(), today);
        const now = Date.now();

        const gap = now - num(d.lastPingAt);
        if (num(d.lastPingAt) && gap < PING_MIN_GAP_MS) {
          return d; // bahut jaldi: ginti me nahi
        }

        // time: pichle ping se agar gap theek hai to hi judega
        if (num(d.lastPingAt) && gap <= PING_MAX_GAP_MS && d.roomId === roomId) {
          const add = Math.min(PING_MAX_CREDIT_S, Math.floor(gap / 1000));
          d.liveSeconds = num(d.liveSeconds) + add;
        }
        d.liveSeconds = Math.min(num(d.liveSeconds), 24 * 3600);
        d.liveMinutes = Math.floor(d.liveSeconds / 60);
        d.lastPingAt = now;
        d.roomId = roomId;

        // viewers
        for (const v of newViewers) {
          if (d.viewerUids.length >= VIEWER_STORE_CAP) break;
          if (!d.viewerUids.includes(v)) d.viewerUids.push(v);
        }
        d.viewers = d.viewerUids.length;

        // gifts
        applyGiftDelta(d, receivedNow);

        tx.set(ref, d);
        return d;
      });

      return res.json({
        success: true,
        liveMinutes: out.liveMinutes,
        viewers: out.viewers,
        dailyGifts: out.dailyGifts,
      });
    } catch (e) {
      console.error("REWARD PING ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  // ------------------------------------------------------------------
  // STATUS - gifts ka delta bhi yahin judta hai (host live me na ho tab bhi)
  // ------------------------------------------------------------------
  app.post("/reward/status", claimLimiter, verifyUser, async (req, res) => {
    try {
      const uid = req.user.uid;
      const today = istDate();
      const ref = rewardRef(uid);
      const w = await walletRef(uid).get();
      const receivedNow = w.exists ? num(w.data().receivedStars) : 0;

      const out = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const d = normalize(snap.data(), today);
        applyGiftDelta(d, receivedNow);
        tx.set(ref, d);
        return d;
      });

      return res.json({
        success: true,
        date: out.date,
        liveMinutes: out.liveMinutes,
        viewers: out.viewers,
        dailyGifts: out.dailyGifts,
        liveRewardClaimed: out.liveRewardClaimed === true,
        giftRewardClaimed: out.giftRewardClaimed === true,
      });
    } catch (e) {
      console.error("REWARD STATUS ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  // ------------------------------------------------------------------
  // CLAIM - sab check server par, ek din me ek baar, transaction me
  // ------------------------------------------------------------------
  app.post("/reward/claim", claimLimiter, verifyUser, async (req, res) => {
    const uid = req.user.uid;
    const type = String((req.body && req.body.type) || "");
    if (type !== "live" && type !== "gift") {
      return res.status(400).json({ success: false, error: "Invalid reward type" });
    }

    try {
      const today = istDate();
      const ref = rewardRef(uid);
      const wRef = walletRef(uid);
      const lockRef = db.collection("rewardClaims").doc(`${uid}_${today}_${type}`);

      const userSnap = await db.collection("users").doc(uid).get();
      if (!userSnap.exists || (userSnap.data() || {}).banned === true) {
        return res.status(403).json({ success: false, error: "Account not allowed" });
      }

      const stars = type === "live" ? REWARD.LIVE_STARS : REWARD.GIFT_STARS;

      const result = await db.runTransaction(async (tx) => {
        const [snap, lock, wSnap] = await Promise.all([
          tx.get(ref),
          tx.get(lockRef),
          tx.get(wRef),
        ]);

        if (lock.exists) throw httpErr(400, "Aaj ka reward pehle hi le chuke ho");

        const d = normalize(snap.data(), today);
        applyGiftDelta(d, wSnap.exists ? num(wSnap.data().receivedStars) : 0);

        if (type === "live") {
          if (d.liveRewardClaimed) throw httpErr(400, "Live reward already claimed");
          if (num(d.liveSeconds) < REWARD.LIVE_SECONDS) {
            throw httpErr(400, "2 ghanta live poora nahi hua");
          }
          if (num(d.viewers) < REWARD.LIVE_VIEWERS) {
            throw httpErr(400, `${REWARD.LIVE_VIEWERS} unique viewers poore nahi hue`);
          }
          if (num(d.dailyGifts) < REWARD.LIVE_MIN_GIFTS) {
            throw httpErr(400, "Gift target poora nahi hua");
          }
          d.liveRewardClaimed = true;
          d.lastLiveClaimDate = today;
        } else {
          if (d.giftRewardClaimed) throw httpErr(400, "Gift reward already claimed");
          if (num(d.dailyGifts) < REWARD.GIFT_TARGET) {
            throw httpErr(400, `${REWARD.GIFT_TARGET} gift stars poore nahi hue`);
          }
          d.giftRewardClaimed = true;
          d.lastGiftClaimDate = today;
        }

        const oldStars = wSnap.exists ? num(wSnap.data().stars) : 0;
        const total = oldStars + stars;

        tx.set(ref, d);
        tx.create(lockRef, {
          userId: uid,
          date: today,
          type,
          stars,
          createdAt: FieldValue.serverTimestamp(),
        });

        if (wSnap.exists) {
          tx.update(wRef, { stars: total });
        } else {
          tx.set(wRef, { stars: total, earnings: 0, receivedStars: 0 });
        }

        // wallet history me dikhega
        tx.set(wRef.collection("purchaseHistory").doc(), {
          stars,
          amount: 0,
          paymentId: type === "live" ? "REWARD_LIVE" : "REWARD_GIFT",
          status: "Completed",
          createdAt: FieldValue.serverTimestamp(),
        });

        return { stars, total };
      });

      console.log(`REWARD CLAIM: uid=${uid} type=${type} stars=${result.stars}`);
      return res.json({ success: true, stars: result.stars, total: result.total });
    } catch (e) {
      if (e && e.httpCode) {
        return res.status(e.httpCode).json({ success: false, error: e.message });
      }
      console.error("REWARD CLAIM ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });
};

function httpErr(code, message) {
  const e = new Error(message);
  e.httpCode = code;
  return e;
}
