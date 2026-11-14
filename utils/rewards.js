// =====================================================================
//  rewards.js  -  Live Reward + Gift Reward (sab kuch SERVER par)
//
//  Client sirf 2 cheez bhej sakta hai: "live-ping" (host zinda hai) aur
//  "claim". Minutes, viewers, gifts aur claim-lock sab server gintta hai,
//  isliye app me koi value badal ke fake claim nahi kar sakta.
//
//  Reward:
//    LIVE  : sirf VIDEO LIVE (videolive) me. Kisi bhi 24 ghante ke andar
//            kul 2 ghanta live (30 min + 30 min + ... judta hai)  -> 150 Stars
//            Claim ke baad agla reward 24 ghante baad. Voice room / private
//            live / room LOCK me kuch count nahi.
//    GIFT  : 6500 Gift Stars (ek din me received)  -> 180 Stars
//  Din ka reset: IST (Asia/Kolkata) raat 12 baje.
//
//  Routes:
//    POST /reward/live-ping  { roomId }   (host, har ~30s)
//    POST /reward/status     {}           (progress padhne ke liye, optional)
//    POST /reward/claim      { type: "live" | "gift" }
//    POST /reward/share      { videoId }   (1 share = 5 stars, din me max 3 share = 15 stars)
//
//  Mount (server.js me, payments se PEHLE):
//    require("./rewards")({ app, db, admin, verifyUser, rateLimit });
// =====================================================================

const REWARD = {
  LIVE_SECONDS: 2 * 60 * 60, // 2 ghanta (24 ghante ke andar kul)
  LIVE_WINDOW_MS: 24 * 60 * 60 * 1000, // 24 ghante ki window / claim cooldown
  LIVE_STARS: 150,           // video live reward
  GIFT_TARGET: 6500,         // 6500 gift stars
  GIFT_STARS: 180,           // niche wala reward
  SHARE_STARS: 5,            // 1 video share = 5 stars
  SHARE_DAILY_MAX: 3,        // din me max 3 share = 15 stars (3 alag video share par)
};

const PING_MIN_GAP_MS = 15 * 1000;      // isse tez ping ginti me nahi
const PING_MAX_CREDIT_S = 45;           // ek ping se max itna time judega
const PING_MAX_GAP_MS = 90 * 1000;      // isse zyada gap = beech me band tha
const SEAT_MIN_SECONDS = 10 * 60;       // har user seat par kam se kam 10 min
const SEAT_STORE_CAP = 60;              // seatSecs me max itne users track

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
    seatSecs: {},
    dailyGifts: 0,
    lastReceived: null,
    lastPingAt: 0,
    roomId: "",
    liveWindowStart: 0,
    lastLiveClaimAt: 0,
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
    if (!data) return freshDoc(today);
    if (data.date !== today) {
      // naya din: gift/claim-flags reset, lekin video-live ka 24 ghante wala hisaab chalu rahe
      const f = freshDoc(today);
      f.liveSeconds = num(data.liveSeconds);
      f.liveMinutes = num(data.liveMinutes);
      f.liveWindowStart = num(data.liveWindowStart);
      f.lastLiveClaimAt = num(data.lastLiveClaimAt);
      f.lastPingAt = num(data.lastPingAt);
      f.roomId = data.roomId || "";
      f.lastReceived = data.lastReceived === undefined ? null : data.lastReceived;
      f.lastLiveClaimDate = data.lastLiveClaimDate || "";
      f.lastGiftClaimDate = data.lastGiftClaimDate || "";
      return f;
    }
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
      // Live reward sirf video live (videolive) se. Voice room / baaki screens ka time count nahi.
      if (String((req.body && req.body.source) || "") !== "videolive") {
        return res.json({ success: true, counted: false });
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
      const pre = normalize((await ref.get()).data(), today);

      // PRIVATE live ya ROOM LOCK: time / seat-time kuch count nahi.
      // lastPingAt = 0 taaki unlock ke baad lock wala gap judta na ho.
      if (room.isPrivate === true || room.roomLocked === true) {
        if (num(pre.lastPingAt)) await ref.set({ ...pre, lastPingAt: 0 });
        return res.json({
          success: true,
          counted: false,
          liveMinutes: pre.liveMinutes,
          dailyGifts: pre.dailyGifts,
        });
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

        // claim ke baad 24 ghante tak naya time nahi judta (cooldown)
        if (num(d.lastLiveClaimAt) && now - num(d.lastLiveClaimAt) < REWARD.LIVE_WINDOW_MS) {
          d.lastPingAt = now;
          d.roomId = roomId;
          applyGiftDelta(d, receivedNow);
          tx.set(ref, d);
          return d;
        }

        // 24 ghante ki window: pehli live se shuru; poori ho gayi aur claim nahi hua to nayi shuru
        if (!num(d.liveWindowStart) || now - num(d.liveWindowStart) > REWARD.LIVE_WINDOW_MS) {
          d.liveWindowStart = now;
          d.liveSeconds = 0;
        }

        // time: pichle ping se agar gap theek hai to hi judega
        if (num(d.lastPingAt) && gap <= PING_MAX_GAP_MS && d.roomId === roomId) {
          const add = Math.min(PING_MAX_CREDIT_S, Math.floor(gap / 1000));
          d.liveSeconds = num(d.liveSeconds) + add;
        }
        d.liveSeconds = Math.min(num(d.liveSeconds), REWARD.LIVE_SECONDS);
        d.liveMinutes = Math.floor(d.liveSeconds / 60);
        d.lastPingAt = now;
        d.roomId = roomId;

        // gifts
        applyGiftDelta(d, receivedNow);

        tx.set(ref, d);
        return d;
      });

      return res.json({
        success: true,
        liveMinutes: out.liveMinutes,
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
        lastLiveClaimAt: num(out.lastLiveClaimAt),
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
      // live: 24 ghante me ek baar (cooldown doc ke andar), gift: din me ek baar
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

        const d = normalize(snap.data(), today);
        const nowMs = Date.now();
        if (type === "gift" && lock.exists) throw httpErr(400, "Aaj ka reward pehle hi le chuke ho");
        applyGiftDelta(d, wSnap.exists ? num(wSnap.data().receivedStars) : 0);

        if (type === "live") {
          if (num(d.lastLiveClaimAt) && nowMs - num(d.lastLiveClaimAt) < REWARD.LIVE_WINDOW_MS) {
            throw httpErr(400, "Live reward 24 ghante me ek baar milta hai");
          }
          if (num(d.liveSeconds) < REWARD.LIVE_SECONDS) {
            throw httpErr(400, "24 ghante me 2 ghanta live poora nahi hua");
          }
          d.lastLiveClaimAt = nowMs;
          d.lastLiveClaimDate = today;
          d.liveRewardClaimed = true;
          // naya hisaab claim ke 24 ghante baad shuru hoga
          d.liveSeconds = 0;
          d.liveMinutes = 0;
          d.liveWindowStart = 0;
          // 150 star withdraw wale (Gift Stars) me jayenge: ye gift nahi hai,
          // isliye gift-target (dailyGifts) me na judein
          d.lastReceived = num(d.lastReceived) + REWARD.LIVE_STARS;
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
        if (type === "gift") {
          tx.create(lockRef, {
            userId: uid,
            date: today,
            type,
            stars,
            createdAt: FieldValue.serverTimestamp(),
          });
        } else {
          tx.set(db.collection("rewardClaims").doc(`${uid}_live_${nowMs}`), {
            userId: uid,
            date: today,
            type,
            stars,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        if (type === "live") {
          // video live reward -> withdraw wale stars (receivedStars + earnings), sending stars nahi
          if (wSnap.exists) {
            tx.update(wRef, {
              receivedStars: FieldValue.increment(stars),
              earnings: FieldValue.increment(stars),
            });
          } else {
            tx.set(wRef, { stars: 0, earnings: stars, receivedStars: stars });
          }
        } else if (wSnap.exists) {
          tx.update(wRef, { stars: total });
        } else {
          tx.set(wRef, { stars: total, earnings: 0, receivedStars: 0 });
        }

        // wallet history me dikhega
        tx.set(wRef.collection("purchaseHistory").doc(), {
          stars,
          amount: 0,
          paymentId: type === "live" ? "REWARD_VIDEOLIVE" : "REWARD_GIFT",
          status: "Completed",
          createdAt: FieldValue.serverTimestamp(),
        });

        return { stars, total: type === "live" ? oldStars : total };
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
  // ------------------------------------------------------------------
  // SHARE REWARD (TikTok jaisa): 1 video share = 5 stars, din me max 3 share = 15 stars.
  //  - 3 share (15 stars) ke baad kitna bhi share karo, star nahi milega
  //  - ek hi video baar baar share karke star nahi milega (alag video chahiye)
  //  - sab kuch server par, transaction me; din ka reset IST raat 12 baje
  //  POST /reward/share { videoId }
  //  Response: { success, awarded: true|false, stars, todayCount, dailyMax, total }
  // ------------------------------------------------------------------
  app.post("/reward/share", claimLimiter, verifyUser, async (req, res) => {
    const uid = req.user.uid;
    const videoId = String((req.body && req.body.videoId) || "").trim();
    if (!videoId || videoId.length > 200 || videoId.includes("/")) {
      return res.status(400).json({ success: false, error: "Invalid video" });
    }

    try {
      const today = istDate();
      const sRef = db.collection("shareRewards").doc(`${uid}_${today}`);
      const wRef = walletRef(uid);
      const vRef = db.collection("all_videos").doc(videoId);
      const uRef = db.collection("users").doc(uid);
      // DEVICE LOCK: ek device par din me sirf EK account ko share star milega
      const dh = req.deviceHash || "";
      // Device ID ke bina (purani/modified app) share star nahi milega
      if (!dh) {
        return res.json({
          success: true,
          awarded: false,
          stars: 0,
          todayCount: 0,
          reason: "device_required",
          dailyMax: REWARD.SHARE_DAILY_MAX,
          total: 0,
        });
      }
      const dRef = dh ? db.collection("shareRewardsDevice").doc(`${dh}_${today}`) : null;

      const result = await db.runTransaction(async (tx) => {
        const [sSnap, wSnap, vSnap, uSnap, dSnap] = await Promise.all([
          tx.get(sRef),
          tx.get(wRef),
          tx.get(vRef),
          tx.get(uRef),
          dRef ? tx.get(dRef) : Promise.resolve(null),
        ]);

        if (!uSnap.exists || (uSnap.data() || {}).banned === true) {
          throw httpErr(403, "Account not allowed");
        }
        if (!vSnap.exists) throw httpErr(404, "Video not found");

        console.log(`SHARE CHECK uid=${uid} dev=${dh.slice(0, 8)} deviceDoc=${dSnap && dSnap.exists ? "yes owner=" + ((dSnap.data() || {}).ownerUid) : "no"}`);
        // Is device par aaj kisi DUSRE account ko share star mil chuka hai -> star nahi
        if (dSnap && dSnap.exists) {
          const owner = (dSnap.data() || {}).ownerUid;
          if (owner && owner !== uid) {
            return {
              awarded: false,
              stars: 0,
              todayCount: 0,
              reason: "device_used",
              total: wSnap.exists ? num(wSnap.data().stars) : 0,
            };
          }
        }

        const d = sSnap.exists ? sSnap.data() : { date: today, count: 0, videoIds: [] };
        const count = num(d.count);
        const videoIds = Array.isArray(d.videoIds) ? d.videoIds : [];

        // Limit poori ya ye video aaj pehle hi ginti me aa chuka -> star nahi
        if (count >= REWARD.SHARE_DAILY_MAX || videoIds.includes(videoId)) {
          return {
            awarded: false,
            stars: 0,
            todayCount: count,
            total: wSnap.exists ? num(wSnap.data().stars) : 0,
          };
        }

        const stars = REWARD.SHARE_STARS;
        const oldStars = wSnap.exists ? num(wSnap.data().stars) : 0;
        const total = oldStars + stars;

        tx.set(sRef, {
          userId: uid,
          date: today,
          count: count + 1,
          videoIds: [...videoIds, videoId],
          updatedAt: FieldValue.serverTimestamp(),
        });

        if (dRef) {
          tx.set(dRef, {
            deviceHash: dh,
            ownerUid: uid,
            date: today,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        if (wSnap.exists) {
          tx.update(wRef, { stars: total });
        } else {
          tx.set(wRef, { stars: total, earnings: 0, receivedStars: 0 });
        }

        // wallet history me dikhega
        tx.set(wRef.collection("purchaseHistory").doc(), {
          stars,
          amount: 0,
          paymentId: "REWARD_SHARE",
          status: "Completed",
          createdAt: FieldValue.serverTimestamp(),
        });

        return { awarded: true, stars, todayCount: count + 1, total };
      });

      if (result.awarded) {
        console.log(`REWARD SHARE: uid=${uid} video=${videoId} n=${result.todayCount}`);
      }
      return res.json({
        success: true,
        awarded: result.awarded,
        stars: result.stars,
        reason: result.reason || undefined,
        todayCount: result.todayCount,
        dailyMax: REWARD.SHARE_DAILY_MAX,
        total: result.total,
      });
    } catch (e) {
      if (e && e.httpCode) {
        return res.status(e.httpCode).json({ success: false, error: e.message });
      }
      console.error("REWARD SHARE ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

};

function httpErr(code, message) {
  const e = new Error(message);
  e.httpCode = code;
  return e;
}
