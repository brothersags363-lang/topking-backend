// =====================================================================
//  adminBroadcast.js  -  Admin Panel ke 2 naye kaam
//
//  1) PAYMENT PROOF   POST /admin/send-payment-proof
//     Admin ne user ko mobile se payment kiya -> screenshot + details submit.
//     User ko: (a) Messages me "Payments" row  (b) push notification.
//     Notification dabane par payment details + screenshot khulti hai.
//     Data:  users/{uid}/paymentProofs/{id}
//
//  2) ANNOUNCEMENT    POST /admin/send-announcement
//     Admin ghoshna likhe (photo ke saath ya bina) -> SAB users ko push.
//     Data:  announcements/{id}   (sab logged-in users padh sakte hain)
//
//  Mount (server.js me, 404 handler se PEHLE):
//    require("./adminBroadcast")({ app, db, admin, verifyUser, requireAdminDoc, limiter });
//
//  Firestore rules (zaroori, warna app list nahi padh payega):
//    match /announcements/{id} { allow read: if request.auth != null; allow write: if false; }
//    match /users/{uid}/paymentProofs/{id} {
//      allow read: if request.auth != null && request.auth.uid == uid;
//      allow update: if request.auth != null && request.auth.uid == uid
//                    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['seen']);
//      allow create, delete: if false;
//    }
// =====================================================================

const clip = (s, n) => {
  const t = String(s == null ? "" : s).trim();
  return t.length > n ? t.slice(0, n) : t;
};

const oneLine = (s, n) => {
  const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

module.exports = function mountAdminBroadcast({ app, db, admin, verifyUser, requireAdminDoc, limiter }) {
  const FieldValue = admin.firestore.FieldValue;

  const BAD_TOKEN = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
  ]);

  // Sirf apne R2 (upload-logo) ki photo chalegi - koi bhi random link nahi
  const isOurImage = (u) => {
    if (typeof u !== "string" || !u) return false;
    const base = String(process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
    return !!base && u.startsWith(base + "/") && u.length < 600;
  };

  const baseMessage = ({ title, body, data, channelId, tag, ttlMs }) => ({
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
      headers: { "apns-priority": "10" },
      payload: { aps: { sound: "default", "thread-id": tag } },
    },
  });

  const toData = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (v === undefined || v === null) continue;
      out[k] = String(v).slice(0, 500);
    }
    return out;
  };

  async function sendTokens(entries, message) {
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < entries.length; i += 500) {
      const chunk = entries.slice(i, i + 500);
      try {
        const r = await admin.messaging().sendEachForMulticast({
          ...message,
          tokens: chunk.map((e) => e.token),
        });
        sent += r.successCount;
        failed += r.failureCount;
        r.responses.forEach((x, idx) => {
          if (!x.success && x.error && BAD_TOKEN.has(x.error.code)) {
            db.collection("users")
              .doc(chunk[idx].uid)
              .update({ fcmToken: FieldValue.delete() })
              .catch(() => {});
          }
        });
      } catch (e) {
        failed += chunk.length;
        console.error("BROADCAST PUSH BATCH ERROR:", e && (e.code || e.message));
      }
    }
    return { sent, failed };
  }

  // ---------------------------------------------------------------
  // 1) PAYMENT PROOF
  // body: { uid, amount, method?, utr?, note?, imageUrl }
  // ---------------------------------------------------------------
  app.post("/admin/send-payment-proof", limiter, verifyUser, requireAdminDoc, async (req, res) => {
    try {
      const b = req.body || {};
      const uid = String(b.uid || "");
      const amount = Number(b.amount);
      const method = clip(b.method, 30) || "UPI";
      const utr = clip(b.utr, 40);
      const note = clip(b.note, 300);
      const imageUrl = String(b.imageUrl || "");

      if (!uid || uid.length > 128 || uid.includes("/")) {
        return res.status(400).json({ success: false, error: "User choose karo" });
      }
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
        return res.status(400).json({ success: false, error: "Sahi amount likho" });
      }
      if (!isOurImage(imageUrl)) {
        return res.status(400).json({ success: false, error: "Payment screenshot upload karo" });
      }

      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        return res.status(404).json({ success: false, error: "User nahi mila" });
      }

      const proofRef = userRef.collection("paymentProofs").doc();
      const proof = {
        amount,
        method,
        utr,
        note,
        imageUrl,
        sentBy: req.user.uid,
        seen: false,
        createdAt: FieldValue.serverTimestamp(),
      };

      // Messages me "Payments" row + unread count isi collection se banta hai
      await proofRef.set(proof);

      // Notification list (Messages tab) me bhi ek entry
      await userRef.collection("notifications").add({
        type: "payment",
        senderName: "TopKing Payment",
        proofId: proofRef.id,
        amount,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      }).catch(() => {});

      res.json({ success: true, id: proofRef.id });

      // Push (response ke baad, fail ho to bhi record save hai)
      const token = (userSnap.data() || {}).fcmToken;
      if (typeof token === "string" && token.length > 0 && token.length < 5000) {
        const amt = Number(amount).toLocaleString("en-IN");
        const msg = baseMessage({
          title: "💰 Payment bhej diya gaya",
          body: "₹" + amt + " aapko bheja gaya hai. Details dekhne ke liye tap karein.",
          data: toData({ type: "payment", proofId: proofRef.id }),
          channelId: "activity",
          tag: "payment_" + proofRef.id,
          ttlMs: 7 * 24 * 60 * 60 * 1000,
        });
        await sendTokens([{ uid, token }], msg);
      }
    } catch (e) {
      console.error("SEND PAYMENT PROOF ERROR:", e);
      if (!res.headersSent) res.status(500).json({ success: false, error: "Server error" });
    }
  });

  // ---------------------------------------------------------------
  // 2) ANNOUNCEMENT  ->  sabhi users ko push
  // body: { title, text, imageUrl? }
  // ---------------------------------------------------------------
  app.post("/admin/send-announcement", limiter, verifyUser, requireAdminDoc, async (req, res) => {
    try {
      const b = req.body || {};
      const title = clip(b.title, 80) || "Ghoshna";
      const text = clip(b.text, 2000);
      const imageUrl = String(b.imageUrl || "");

      if (!text && !imageUrl) {
        return res.status(400).json({ success: false, error: "Ghoshna likho ya photo lagao" });
      }
      if (imageUrl && !isOurImage(imageUrl)) {
        return res.status(400).json({ success: false, error: "Photo galat hai, dobara upload karo" });
      }

      const ref = db.collection("announcements").doc();
      await ref.set({
        title,
        text,
        imageUrl,
        sentBy: req.user.uid,
        createdAt: FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
      });

      res.json({ success: true, id: ref.id, queued: true });

      // Sabhi users ke tokens, page-by-page (memory halki rahe)
      const message = baseMessage({
        title: "📢 " + title,
        body: oneLine(text, 140) || "Nayi ghoshna - dekhne ke liye tap karein",
        data: toData({ type: "announcement", announcementId: ref.id }),
        channelId: "activity",
        tag: "announcement_" + ref.id,
        ttlMs: 3 * 24 * 60 * 60 * 1000,
      });

      let last = null;
      let total = 0;
      let sent = 0;
      for (;;) {
        let q = db
          .collection("users")
          .orderBy(admin.firestore.FieldPath.documentId())
          .select("fcmToken", "pushSettings")
          .limit(1000);
        if (last) q = q.startAfter(last);

        const snap = await q.get();
        if (snap.empty) break;
        last = snap.docs[snap.docs.length - 1];

        const entries = [];
        const seen = new Set();
        snap.docs.forEach((d) => {
          const u = d.data() || {};
          if (u.pushSettings && u.pushSettings.announcements === false) return;
          const t = u.fcmToken;
          if (typeof t === "string" && t && t.length < 5000 && !seen.has(t)) {
            seen.add(t);
            entries.push({ uid: d.id, token: t });
          }
        });

        total += entries.length;
        if (entries.length) {
          const r = await sendTokens(entries, message);
          sent += r.sent;
        }
        if (snap.size < 1000) break;
      }

      await ref.update({ pushTargets: total, pushSent: sent }).catch(() => {});
      console.log(`ANNOUNCEMENT PUSH: id=${ref.id} targets=${total} sent=${sent}`);
    } catch (e) {
      console.error("SEND ANNOUNCEMENT ERROR:", e);
      if (!res.headersSent) res.status(500).json({ success: false, error: "Server error" });
    }
  });
};
