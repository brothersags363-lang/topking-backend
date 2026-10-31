// =====================================================================
// MODERATION (gali / abuse) - server side
//
// Kya karta hai:
//   1. checkLiveBan(uid, channel)  -> /token isse call karta hai (ASLI ROK yahin hai)
//   2. applyAbuseBan(uid, ...)     -> 3 din ke liye live entry + live chalana band
//   3. POST /moderation/voice-report      -> viewers/host "voice me gali" report karte hain.
//                                            Alag-alag VOICE_REPORT_THRESHOLD log report kar de
//                                            to apne aap 3 din ka ban.
//   4. POST /moderation/voice-transcript  -> koi bhi Speech-to-Text service (Agora STT, Google STT,
//                                            Whisper...) bolne wale ka transcript yahan bhejti hai.
//                                            Transcript me gali mili to TURANT 3 din ka ban.
//   5. POST /moderation/words             -> admin: extra gali shabd jodo / allow list (live update)
//
// Ban wahi jagah likhta hai jo pehle se hai:
//   users/{uid}.entryBanUntil / liveBanUntil   (ms timestamp)
//   liveBans/{uid}                              (app ka useLiveBanGuard yahi sunta hai -> user turant bahar)
// =====================================================================

"use strict";

const crypto = require("crypto");
const { findProfanity, setCustomWords } = require("./utils/profanity");

const DAY_MS = 24 * 60 * 60 * 1000;

const BAN_DAYS = Number(process.env.ABUSE_BAN_DAYS) || 3;
const VOICE_REPORT_THRESHOLD = Number(process.env.VOICE_REPORT_THRESHOLD) || 3; // kitne alag-alag log
const VOICE_REPORT_WINDOW_MS = (Number(process.env.VOICE_REPORT_WINDOW_MIN) || 10) * 60 * 1000;
const HOST_REPORT_WEIGHT = 2; // host ka ek report = 2 log (host + 1 viewer = ban)

module.exports = function setupModeration(ctx) {
  const {
    app, admin, db, verifyUser, generalLimiter, requireOfficialOrAdmin, isValidUid,
  } = ctx;
  const FieldValue = admin.firestore.FieldValue;

  // -----------------------------------------------------------------
  // Admin ke jode hue shabd (moderation/config) - 5 min me refresh
  // -----------------------------------------------------------------
  let cfgLoadedAt = 0;
  async function loadWordConfig(force) {
    if (!force && Date.now() - cfgLoadedAt < 5 * 60 * 1000) return;
    cfgLoadedAt = Date.now();
    try {
      const snap = await db.collection("moderation").doc("config").get();
      setCustomWords(snap.exists ? snap.data() : {});
    } catch (e) {
      console.error("MODERATION CONFIG LOAD ERROR:", e.message);
    }
  }
  loadWordConfig(true);

  // -----------------------------------------------------------------
  // 1) BAN CHECK  (/token me use hota hai)
  // -----------------------------------------------------------------
  // return null  -> allowed
  // return {code, error, until} -> block
  async function checkLiveBan(uid, channel) {
    const uSnap = await db.collection("users").doc(uid).get();
    if (!uSnap.exists) return null;
    const d = uSnap.data() || {};
    const now = Date.now();
    const entryUntil = Number(d.entryBanUntil) || 0;
    const liveUntil = Number(d.liveBanUntil) || 0;

    if (entryUntil > now) {
      return {
        code: "LIVE_ENTRY_BANNED",
        until: entryUntil,
        error: `Aap ${fmt(entryUntil)} tak live room me nahi ja sakte.`,
      };
    }
    if (liveUntil > now) {
      // liveBan sirf HOST par lagta hai (live chalane se rokta hai)
      let isHost = true;
      try {
        const rSnap = await db.collection("rooms").doc(channel).get();
        isHost = !rSnap.exists || (rSnap.data() || {}).hostId === uid;
      } catch (_) {}
      if (isHost) {
        return {
          code: "LIVE_START_BANNED",
          until: liveUntil,
          error: `Aap ${fmt(liveUntil)} tak live nahi chala sakte.`,
        };
      }
    }
    return null;
  }

  function fmt(ms) {
    try {
      return new Date(ms).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch (_) { return String(ms); }
  }

  // -----------------------------------------------------------------
  // 2) BAN LAGAO  (entry + live dono, BAN_DAYS din)
  // -----------------------------------------------------------------
  async function applyAbuseBan(uid, { reason, source, roomId, evidence, by } = {}) {
    const until = Date.now() + BAN_DAYS * DAY_MS;
    const uRef = db.collection("users").doc(uid);
    const uSnap = await uRef.get();
    if (!uSnap.exists) return { ok: false, error: "User not found" };

    const u = uSnap.data() || {};
    // Admin / official ko auto-ban nahi (galti se na lag jaye)
    let isAdmin = false;
    try {
      const a = await db.collection("admins").doc(uid).get();
      isAdmin = a.exists && (a.data() || {}).role === "admin";
    } catch (_) {}
    if (isAdmin || u.isOfficial === true) return { ok: false, error: "Protected user" };

    // Pehle se lamba ban ho to usse chhota mat karo
    const entryUntil = Math.max(until, Number(u.entryBanUntil) || 0);
    const liveUntil = Math.max(until, Number(u.liveBanUntil) || 0);

    await uRef.set({ entryBanUntil: entryUntil, liveBanUntil: liveUntil }, { merge: true });
    await db.collection("liveBans").doc(uid).set({
      uid,
      entryBanUntil: entryUntil,
      liveBanUntil: liveUntil,
      reason: reason || "Live me gali dene ki wajah se",
      source: source || "auto",
      updatedBy: by || "system",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Record (appeal / review ke liye)
    await db.collection("moderationLogs").add({
      type: "abuse_ban",
      uid,
      roomId: roomId || "",
      source: source || "auto",
      reason: reason || "",
      evidence: String(evidence || "").slice(0, 300),
      days: BAN_DAYS,
      until: entryUntil,
      by: by || "system",
      createdAt: FieldValue.serverTimestamp(),
    }).catch(() => {});

    console.log(`ABUSE BAN: uid=${uid} source=${source} room=${roomId} until=${new Date(entryUntil).toISOString()}`);
    return { ok: true, until: entryUntil };
  }

  // -----------------------------------------------------------------
  // 3) VOICE REPORT (viewers/host)
  // body: { roomId, targetUid }
  // -----------------------------------------------------------------
  app.post("/moderation/voice-report", generalLimiter, verifyUser, async (req, res) => {
    try {
      const reporter = req.user.uid;
      const roomId = String((req.body && req.body.roomId) || "");
      const target = String((req.body && req.body.targetUid) || "");

      if (!/^[A-Za-z0-9_-]{1,100}$/.test(roomId) || !isValidUid(target)) {
        return res.status(400).json({ success: false, error: "Invalid request" });
      }
      if (reporter === target) {
        return res.status(400).json({ success: false, error: "Khud ko report nahi kar sakte" });
      }

      const roomRef = db.collection("rooms").doc(roomId);
      const [roomSnap, repAud, tgtAud] = await Promise.all([
        roomRef.get(),
        roomRef.collection("audience").doc(reporter).get(),
        roomRef.collection("audience").doc(target).get(),
      ]);
      if (!roomSnap.exists) return res.status(404).json({ success: false, error: "Live room nahi mila" });
      const hostId = (roomSnap.data() || {}).hostId;

      // Reporter aur target dono usi room me hone chahiye (bahar ke log fake report na kar saken)
      const reporterIn = repAud.exists || reporter === hostId;
      const targetIn = tgtAud.exists || target === hostId;
      if (!reporterIn || !targetIn) {
        return res.status(403).json({ success: false, error: "Sirf room ke log report kar sakte hain" });
      }

      const weight = reporter === hostId ? HOST_REPORT_WEIGHT : 1;
      const repRef = db.collection("voiceReports").doc(`${roomId}_${target}`);
      const now = Date.now();

      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(repRef);
        const old = (snap.exists && snap.data().reporters) || {};
        const reporters = {};
        // purane (window se bahar) report hata do
        Object.keys(old).forEach((k) => {
          if (now - Number(old[k].at || 0) <= VOICE_REPORT_WINDOW_MS) reporters[k] = old[k];
        });
        reporters[reporter] = { at: now, w: weight }; // ek banda = ek hi vote
        const score = Object.values(reporters).reduce((a, r) => a + (Number(r.w) || 1), 0);
        const hit = score >= VOICE_REPORT_THRESHOLD;
        if (hit) tx.delete(repRef);
        else tx.set(repRef, { roomId, target, reporters, score, updatedAt: now });
        return { hit, score };
      });

      if (result.hit) {
        await applyAbuseBan(target, {
          reason: "Live room me voice par gali dene ki wajah se (users ki report)",
          source: "voice-report",
          roomId,
          evidence: `score=${result.score}`,
        });
        return res.json({ success: true, banned: true });
      }
      return res.json({ success: true, banned: false, score: result.score, needed: VOICE_REPORT_THRESHOLD });
    } catch (e) {
      console.error("VOICE REPORT ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  // -----------------------------------------------------------------
  // 4) VOICE TRANSCRIPT WEBHOOK (Speech-to-Text service yahan bhejegi)
  // header: x-moderation-secret: <MODERATION_WEBHOOK_SECRET>
  // body:   { roomId, uid | agoraUid, transcript }
  // -----------------------------------------------------------------
  app.post("/moderation/voice-transcript", async (req, res) => {
    try {
      const secret = process.env.MODERATION_WEBHOOK_SECRET;
      if (!secret) return res.status(503).json({ success: false, error: "Webhook disabled" });

      const given = String(req.headers["x-moderation-secret"] || "");
      const a = Buffer.from(given);
      const b = Buffer.from(secret);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      await loadWordConfig(false);
      const body = req.body || {};
      const transcript = String(body.transcript || "").slice(0, 2000);
      const roomId = String(body.roomId || "");

      let uid = String(body.uid || "");
      if (!uid && body.agoraUid !== undefined) {
        const m = await db.collection("agoraUidMap").doc(String(body.agoraUid)).get();
        if (m.exists) uid = String(m.data().uid || "");
      }
      if (!isValidUid(uid)) return res.status(400).json({ success: false, error: "Unknown speaker" });

      const hit = findProfanity(transcript);
      if (!hit.found) return res.json({ success: true, banned: false });

      const r = await applyAbuseBan(uid, {
        reason: "Live room me voice par gali dene ki wajah se",
        source: "voice-transcript",
        roomId,
        evidence: transcript,
      });
      return res.json({ success: true, banned: r.ok === true });
    } catch (e) {
      console.error("VOICE TRANSCRIPT ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  // -----------------------------------------------------------------
  // 5) ADMIN: extra gali shabd / allow list
  // body: { extra?: string[], allow?: string[] }   (jo bheja wahi save hota hai)
  // -----------------------------------------------------------------
  app.post("/moderation/words", generalLimiter, verifyUser, requireOfficialOrAdmin, async (req, res) => {
    try {
      const clean = (arr) =>
        (Array.isArray(arr) ? arr : [])
          .map((w) => String(w || "").trim().toLowerCase().slice(0, 40))
          .filter(Boolean)
          .slice(0, 500);
      const upd = {};
      if (req.body && req.body.extra !== undefined) upd.extra = clean(req.body.extra);
      if (req.body && req.body.allow !== undefined) upd.allow = clean(req.body.allow);
      await db.collection("moderation").doc("config").set(upd, { merge: true });
      await loadWordConfig(true);
      return res.json({ success: true });
    } catch (e) {
      console.error("MODERATION WORDS ERROR:", e);
      return res.status(500).json({ success: false, error: "Server error" });
    }
  });

  return { checkLiveBan, applyAbuseBan };
};
