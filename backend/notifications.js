// =====================================================================
//  notifications.js  -  App band ho tab bhi PUSH (FCM) notifications
//
//  1) Live start      : host live aaye -> uske sab followers ko push
//                       "Aman live chala raha hai"
//  2) Video likes     : 10 / 50 / 100 / 1000 / 10000 / 50000 likes poore
//                       hon -> video ke owner ko "Congratulations" push
//  3) New follower    : koi follow kare -> us user ko push
//
//  Chat push pehle se server.js me hai (/send-message-notification).
//
//  Routes (sab login-token ke saath, client sirf ID bhejta hai):
//    POST /notify/live-started   { roomId }
//    POST /notify/video-like     { videoId }
//    POST /notify/new-follower   { targetUid }
//
//  Mount (server.js me, 404 handler se PEHLE):
//    require("./notifications")({ app, db, admin, verifyUser, rateLimit });
//
//  Kuch bhi client ki baat par bharosa nahi: host, likes ginti, follow
//  hai ya nahi - sab server Firestore se khud padhta hai.
//
//  User chahe to push band kar sakta hai: users/{uid}.pushSettings
//    { live: false, likes: false, follows: false }
// =====================================================================

const LIKE_MILESTONES = [10, 50, 100, 1000, 10000, 50000];

const LIVE_COOLDOWN_MS = 10 * 60 * 1000;      // ek host ko 10 min me ek hi baar
const FOLLOW_COOLDOWN_MS = 24 * 60 * 60 * 1000; // follow/unfollow spam roko
const MAX_FOLLOWERS = 10000;                   // ek live par max itne logon ko push

module.exports = function mountNotifications({ app, db, admin, verifyUser, rateLimit }) {

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Too many notification requests." },
  });

  // ---------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------

  const isId = (v) =>
    typeof v === "string" && v.length >= 1 && v.length <= 200 && /^[A-Za-z0-9_\-:.]+$/.test(v);

  // FCM data me sirf string chalti hai
  const str = (v, n = 300) => (typeof v === "string" ? v.slice(0, n) : "");

  const fmtCount = (n) => Number(n).toLocaleString("en-IN");

  const pushAllowed = (userData, key) =>
    !(userData && userData.pushSettings && userData.pushSettings[key] === false);

  const BAD_TOKEN = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
  ]);

  const dropToken = (uid) =>
    db.collection("users").doc(uid)
      .update({ fcmToken: admin.firestore.FieldValue.delete() })
      .catch(() => {});

  // Ek message ka common dhancha (token baad me lagta hai)
  function buildMessage({ title, body, data, channelId, tag, ttlMs }) {
    return {
      notification: { title, body },
      data,
      android: {
        priority: "high",
        ttl: ttlMs,
        notification: {
          channelId,
          sound: "default",
          tag,
          defaultVibrateTimings: true,
          notificationPriority: "PRIORITY_MAX",
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
          "apns-expiration": String(Math.floor((Date.now() + ttlMs) / 1000)),
        },
        payload: { aps: { sound: "default", "thread-id": tag } },
      },
    };
  }

  // targets = [{ uid, token }]  ->  500-500 ke batch me bhejo
  async function sendToMany(targets, message) {
    let sent = 0;

    for (let i = 0; i < targets.length; i += 500) {
      const chunk = targets.slice(i, i + 500);

      try {
        const res = await admin.messaging().sendEachForMulticast({
          ...message,
          tokens: chunk.map((t) => t.token),
        });

        sent += res.successCount;

        res.responses.forEach((r, idx) => {
          if (!r.success && r.error && BAD_TOKEN.has(r.error.code)) {
            dropToken(chunk[idx].uid);
          }
        });
      } catch (e) {
        console.error("PUSH MULTICAST ERROR:", e.code || e.message);
      }
    }

    return sent;
  }

  // Ek user ko push (token Firestore se)
  async function sendToUser(uid, message, prefKey) {
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) return 0;

    const u = snap.data() || {};
    if (prefKey && !pushAllowed(u, prefKey)) return 0;

    const token = u.fcmToken;
    if (!token || typeof token !== "string" || token.length > 5000) return 0;

    return sendToMany([{ uid, token }], message);
  }

  // users docs me se (token, pushSettings) uthao - bade list ke liye chunk me
  async function loadTargets(uids, prefKey) {
    const out = [];

    for (let i = 0; i < uids.length; i += 300) {
      const refs = uids.slice(i, i + 300).map((id) => db.collection("users").doc(id));
      if (!refs.length) continue;

      const snaps = await db.getAll(...refs, { fieldMask: ["fcmToken", "pushSettings"] });

      for (const s of snaps) {
        if (!s.exists) continue;
        const d = s.data() || {};
        if (!pushAllowed(d, prefKey)) continue;
        if (typeof d.fcmToken === "string" && d.fcmToken && d.fcmToken.length <= 5000) {
          out.push({ uid: s.id, token: d.fcmToken });
        }
      }
    }

    return out;
  }

  // Host ke followers: naya "follows" collection + purana users/{id}/followers dono
  async function getFollowerIds(hostId) {
    const ids = new Set();

    try {
      const q = await db.collection("follows")
        .where("followingId", "==", hostId)
        .limit(MAX_FOLLOWERS)
        .get();
      q.forEach((d) => {
        const f = d.data().followerId;
        if (isId(f)) ids.add(f);
      });
    } catch (e) {
      console.error("FOLLOWERS (follows) ERROR:", e.message);
    }

    try {
      const q = await db.collection("users").doc(hostId).collection("followers")
        .limit(MAX_FOLLOWERS)
        .get();
      q.forEach((d) => {
        if (isId(d.id)) ids.add(d.id);
      });
    } catch (e) {
      console.error("FOLLOWERS (legacy) ERROR:", e.message);
    }

    ids.delete(hostId);
    return Array.from(ids);
  }

  // ---------------------------------------------------------------
  // 1) LIVE START  ->  followers ko push
  // ---------------------------------------------------------------

  app.post("/notify/live-started", limiter, verifyUser, async (req, res) => {
    try {
      const uid = req.user.uid;
      const roomId = req.body && req.body.roomId;

      if (!isId(roomId)) {
        return res.status(400).json({ success: false, error: "Invalid room" });
      }

      const roomRef = db.collection("rooms").doc(roomId);
      const userRef = db.collection("users").doc(uid);

      // Ek hi room ke liye ek baar + host ka cooldown (transaction = double push nahi)
      const gate = await db.runTransaction(async (tx) => {
        const [roomSnap, userSnap] = await Promise.all([tx.get(roomRef), tx.get(userRef)]);

        if (!roomSnap.exists) return { skip: "no_room" };

        const room = roomSnap.data() || {};

        if (room.hostId !== uid) return { skip: "not_host" };
        if (String(room.status || "").toLowerCase() !== "active") return { skip: "not_active" };
        if (room.isPrivate === true || String(room.roomType || "").toLowerCase() === "private") {
          return { skip: "private" }; // private live ka pata followers ko nahi dena
        }
        if (room.liveNotifiedAt) return { skip: "already" };

        const last = Number((userSnap.data() || {}).lastLivePushAt) || 0;
        if (Date.now() - last < LIVE_COOLDOWN_MS) return { skip: "cooldown" };

        tx.update(roomRef, { liveNotifiedAt: Date.now() });
        tx.set(userRef, { lastLivePushAt: Date.now() }, { merge: true });

        return { room, user: userSnap.data() || {} };
      });

      if (gate.skip) {
        return res.json({ success: true, sent: 0, skipped: gate.skip });
      }

      // Client ko turant jawab, push peeche se
      res.json({ success: true, queued: true });

      const { room, user } = gate;

      const hostName =
        str(room.hostName, 60).trim() ||
        str(user.name, 60).trim() ||
        str(user.username, 60).trim() ||
        "Host";

      const hostImg = str(room.hostImg, 400) || str(user.profileImg, 400) || str(user.profile, 400);

      const followerIds = await getFollowerIds(uid);
      if (!followerIds.length) return;

      const targets = await loadTargets(followerIds, "live");
      if (!targets.length) return;

      const message = buildMessage({
        title: "🔴 " + hostName + " live aa gaye",
        body: hostName + " live chala raha hai - abhi join karo!",
        data: {
          type: "live",
          roomId,
          hostId: uid,
          hostName,
          hostImg,
          liveType: String(room.type || "audio").toLowerCase() === "video" ? "video" : "audio",
        },
        channelId: "live",
        tag: "live_" + uid,
        ttlMs: 15 * 60 * 1000, // live khatam hone ke baad purana push na pahunche
      });

      const sent = await sendToMany(targets, message);
      console.log(`LIVE PUSH: host=${uid} room=${roomId} followers=${followerIds.length} sent=${sent}`);
    } catch (e) {
      console.error("NOTIFY LIVE ERROR:", e.message);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "Notification failed" });
      }
    }
  });

  // ---------------------------------------------------------------
  // 2) VIDEO LIKE MILESTONE  ->  owner ko "Congratulations"
  // ---------------------------------------------------------------

  app.post("/notify/video-like", limiter, verifyUser, async (req, res) => {
    try {
      const videoId = req.body && req.body.videoId;

      if (!isId(videoId)) {
        return res.status(400).json({ success: false, error: "Invalid video" });
      }

      const videoRef = db.collection("all_videos").doc(videoId);

      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(videoRef);
        if (!snap.exists) return { skip: "no_video" };

        const v = snap.data() || {};
        const owner = v.userId;
        const likes = Number(v.likes) || 0;

        if (!isId(owner)) return { skip: "no_owner" };

        const done = Array.isArray(v.likeMilestonesNotified) ? v.likeMilestonesNotified : [];
        const fresh = LIKE_MILESTONES.filter((m) => likes >= m && !done.includes(m));

        if (!fresh.length) return { skip: "nothing_new" };

        // Jitne milestone paar ho chuke sab "done" mark - dobara kabhi push nahi
        tx.update(videoRef, { likeMilestonesNotified: done.concat(fresh) });

        const top = Math.max(...fresh);

        // Purane video (feature se pehle ke likes) par "1000 complete" ka
        // jhootha congratulation na jaye: sirf tab bhejo jab abhi-abhi paar hua ho.
        const fresh_enough = likes - top <= Math.max(10, Math.ceil(top * 0.2));

        return {
          owner,
          likes,
          milestone: top,
          send: fresh_enough,
          caption: str(v.caption, 60),
        };
      });

      if (result.skip || !result.send) {
        return res.json({ success: true, sent: 0 });
      }

      res.json({ success: true, queued: true });

      const message = buildMessage({
        title: "Congratulations! 🎉",
        body: "Aapke video ko " + fmtCount(result.milestone) + " likes complete ho gaye!",
        data: {
          type: "video_like",
          videoId,
          milestone: String(result.milestone),
        },
        channelId: "activity",
        tag: "like_" + videoId,
        ttlMs: 24 * 60 * 60 * 1000,
      });

      await sendToUser(result.owner, message, "likes");
      console.log(`LIKE PUSH: video=${videoId} owner=${result.owner} milestone=${result.milestone}`);
    } catch (e) {
      console.error("NOTIFY LIKE ERROR:", e.message);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "Notification failed" });
      }
    }
  });

  // ---------------------------------------------------------------
  // 3) NEW FOLLOWER  ->  jisko follow kiya use push
  // ---------------------------------------------------------------

  app.post("/notify/new-follower", limiter, verifyUser, async (req, res) => {
    try {
      const uid = req.user.uid;
      const target = req.body && req.body.targetUid;

      if (!isId(target) || target === uid) {
        return res.status(400).json({ success: false, error: "Invalid user" });
      }

      // Sach me follow hua hai? (dono tarah ke structure check)
      const [a, b] = await Promise.all([
        db.collection("follows").doc(uid + "_" + target).get(),
        db.collection("users").doc(target).collection("followers").doc(uid).get(),
      ]);

      if (!a.exists && !b.exists) {
        return res.json({ success: true, sent: 0, skipped: "not_following" });
      }

      // Follow/unfollow baar-baar karke spam na ho
      const logRef = db.collection("pushLog").doc("follow_" + uid + "_" + target);

      const allowed = await db.runTransaction(async (tx) => {
        const s = await tx.get(logRef);
        const last = s.exists ? Number((s.data() || {}).at) || 0 : 0;
        if (Date.now() - last < FOLLOW_COOLDOWN_MS) return false;
        tx.set(logRef, { at: Date.now() });
        return true;
      });

      if (!allowed) return res.json({ success: true, sent: 0, skipped: "cooldown" });

      res.json({ success: true, queued: true });

      const meSnap = await db.collection("users").doc(uid).get();
      const me = meSnap.exists ? meSnap.data() || {} : {};

      const name =
        str(me.name, 60).trim() || str(me.username, 60).trim() || "Someone";
      const img = str(me.profileImg, 400) || str(me.profile, 400);

      const message = buildMessage({
        title: name + " ne aapko follow kiya",
        body: "Profile dekhne ke liye tap karein",
        data: { type: "follow", senderUid: uid, senderName: name, senderImg: img },
        channelId: "activity",
        tag: "follow_" + uid,
        ttlMs: 24 * 60 * 60 * 1000,
      });

      await sendToUser(target, message, "follows");
    } catch (e) {
      console.error("NOTIFY FOLLOW ERROR:", e.message);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "Notification failed" });
      }
    }
  });
};
