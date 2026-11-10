// =====================================================
// RULES (alag file - server.js ka purana code nahi badla):
//   "Verified" = admin ka tick (verified) YA chehra verify (faceStatus submitted/approved).
//   1) Ek device (mobile) par sirf EK hi ID verified maani jayegi (pehle jo verify hui wahi).
//   2) Verify hone ke baad hi agency me add ho sakte ho (request bhi aur accept bhi).
//   3) Live = verified + agency me add (camera.tsx me check hota hai).
//
// Ye sirf "guard" hain: purane route se PEHLE chalte hain, rule todne par rok dete hain,
// warna next() se purana route bina badlaav ke chalta hai.
// server.js me bas ek line: require("./deviceVerifyRules")({ ... });
// =====================================================
module.exports = function deviceVerifyRules({
  app,
  db,
  verifyUser,
  requireAdminDoc,
  isValidUid,
}) {
  // admin tick ya chehra verify
  const isVerifiedDoc = (d) =>
    !!d &&
    (d.verified === true ||
      d.faceVerified === true ||
      d.faceStatus === "submitted" ||
      d.faceStatus === "approved");

  // kaun pehle verify hua (chhota = pehle). Admin tick sabse upar (0).
  const verifiedAt = (d) => (d.verified === true ? 0 : Number(d.faceVerifiedAt) || 1);

  async function getUser(uid) {
    const snap = await db.collection("users").doc(uid).get();
    return snap.exists ? snap.data() : null;
  }

  // Is user ke device(s) par login hue BAAKI accounts (uid list)
  async function linkedUids(uid) {
    const udSnap = await db.collection("user_devices").doc(uid).get();
    const hashes =
      udSnap.exists && Array.isArray(udSnap.data().hashes) ? udSnap.data().hashes : [];
    if (!hashes.length) return { registered: false, uids: [] };
    const devSnaps = await Promise.all(
      hashes.map((h) => db.collection("devices").doc(h).get())
    );
    const linked = new Set();
    devSnaps.forEach((d) => {
      if (d.exists && Array.isArray(d.data().uids)) {
        d.data().uids.forEach((u) => isValidUid(u) && u !== uid && linked.add(u));
      }
    });
    return { registered: true, uids: [...linked] };
  }

  // Is device par (is user ke alawa) jo verified accounts hain
  async function otherVerified(uid) {
    const { registered, uids } = await linkedUids(uid);
    if (!uids.length) return { registered, others: [] };
    const snaps = await db.getAll(...uids.map((u) => db.collection("users").doc(u)));
    const others = snaps
      .filter((x) => x.exists && isVerifiedDoc(x.data()))
      .map((x) => ({
        uid: x.id,
        username: x.data().username || "",
        at: verifiedAt(x.data()),
      }));
    return { registered, others };
  }

  // Ek device = ek verified ID.
  //  - user abhi verified nahi: device par koi aur verified ho to roko
  //  - user verified hai: sirf wahi chale jo sabse pehle verify hui (baaki roke jayenge)
  async function deviceCheck(uid, me) {
    const { others } = await otherVerified(uid);
    if (!others.length) return null;
    let blockers = others;
    if (isVerifiedDoc(me)) {
      const myAt = verifiedAt(me);
      blockers = others.filter((o) => o.at < myAt || (o.at === myAt && o.uid < uid));
    }
    if (!blockers.length) return null;
    const who = blockers.map((o) => o.username || o.uid).join(", ");
    return {
      code: "DEVICE_ALREADY_VERIFIED",
      error:
        "Is mobile par pehle se ek verified ID hai (" + who + "). Ek mobile par ek hi ID verify ho sakti hai.",
    };
  }

  const NOT_VERIFIED = {
    code: "NOT_VERIFIED",
    error: "Pehle apni ID verify karao (chehra verify), uske baad hi agency join kar sakte ho",
  };

  // ---- A) App ke liye: kya ye device is ID ko verify/live karne deta hai? ----
  // Face screen khulte hi aur camera (live) me background me chalta hai.
  app.post("/device/verified-check", verifyUser, async (req, res) => {
    try {
      const uid = req.user.uid;
      const me = await getUser(uid);
      const blocked = await deviceCheck(uid, me);
      if (blocked) return res.status(409).json({ success: false, ...blocked });
      return res.json({ success: true });
    } catch (e) {
      console.error("DEVICE VERIFIED CHECK ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  // ---- B) Admin tick: ek device = ek verified ID ----
  app.post("/admin/set-verified", verifyUser, requireAdminDoc, async (req, res, next) => {
    try {
      const uid = String((req.body && req.body.uid) || "");
      const verified = !!(req.body && req.body.verified);
      if (!verified || !isValidUid(uid)) return next(); // tick hatana / invalid -> purana route

      const { registered, others } = await otherVerified(uid);
      if (!registered) {
        return res.status(400).json({
          success: false,
          code: "DEVICE_NOT_REGISTERED",
          error:
            "Is user ka device register nahi hai. User ko updated app ek baar kholni hogi, phir verify karo.",
        });
      }
      const blockers = others.filter((o) => o.at === 0); // doosra admin-tick wala
      if (blockers.length) {
        const who = blockers.map((o) => o.username || o.uid).join(", ");
        return res.status(409).json({
          success: false,
          code: "DEVICE_ALREADY_VERIFIED",
          error:
            "Is device par pehle se verified ID hai (" + who + "). Ek device par ek hi ID verify ho sakti hai.",
        });
      }
      return next();
    } catch (e) {
      console.error("DEVICE VERIFY GUARD ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  // ---- C) Agency join request: pehle verify (aur device par sirf ek verified ID) ----
  app.post("/agency/request-join", verifyUser, async (req, res, next) => {
    try {
      const uid = req.user.uid;
      const me = await getUser(uid);
      if (!isVerifiedDoc(me)) return res.status(403).json({ success: false, ...NOT_VERIFIED });
      const blocked = await deviceCheck(uid, me);
      if (blocked) return res.status(403).json({ success: false, ...blocked });
      return next();
    } catch (e) {
      console.error("JOIN VERIFY GUARD ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  // ---- D) Owner accept kare to bhi: user verified hona chahiye ----
  app.post("/agency/respond-join-request", verifyUser, async (req, res, next) => {
    try {
      const requestId = String((req.body && req.body.requestId) || "");
      const accept = !!(req.body && req.body.accept === true);
      if (!accept || !isValidUid(requestId)) return next(); // reject / invalid -> purana route

      const rSnap = await db.collection("agencyJoinRequests").doc(requestId).get();
      const userId = rSnap.exists ? rSnap.data().userId : null;
      if (!userId || !isValidUid(userId)) return next();

      const u = await getUser(userId);
      if (!isVerifiedDoc(u)) return res.status(403).json({ success: false, ...NOT_VERIFIED });
      const blocked = await deviceCheck(userId, u);
      if (blocked) return res.status(403).json({ success: false, ...blocked });
      return next();
    } catch (e) {
      console.error("RESPOND VERIFY GUARD ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });
};
