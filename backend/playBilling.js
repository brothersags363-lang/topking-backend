"use strict";

/**
 * GOOGLE PLAY BILLING – Stars recharge (server side verify)
 * --------------------------------------------------------
 * Flow:
 *  1) App Google Play ka payment sheet kholta hai (expo-iap)
 *  2) Payment ke baad app -> POST /play/verify { productId, purchaseToken }
 *  3) Server Google Play Developer API se purchase confirm karta hai
 *  4) Sahi ho to wallet me stars add, purchase "consume" (taaki dobara kharid sake)
 *  5) Har 6 ghante: refund/chargeback (voided) purchases ke stars wapas kaat-te hain
 *
 * Setup (ek baar):
 *  - Play Console > Users and permissions > Invite: service account ka email
 *    (default: backend/serviceAccountKey.json wala firebase-adminsdk-...@...iam.gserviceaccount.com)
 *    Permissions: "View financial data" + "Manage orders and subscriptions"
 *  - Google Cloud Console (same project) me "Google Play Android Developer API" Enable karo
 *  - Optional env: GOOGLE_PLAY_SA_JSON = alag service account ki poori JSON (ek line)
 *  - Optional env: PLAY_PACKAGE_NAME (default com.gufran.topking)
 */

const fs = require("fs");
const path = require("path");
const express = require("express");
const { readLevelStars } = require("./levelStars");

module.exports = function mountPlayBilling({ app, db, admin, verifyUser, rateLimit, axios, crypto, cron }) {
  const PACKAGE = process.env.PLAY_PACKAGE_NAME || "com.gufran.topking";
  const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" + encodeURIComponent(PACKAGE);

  // Play Console me yahi Product ID banana (In-app products > Create product)
  // price = Play Console ka INR price (GST + Google fee ke baad bhi purana budget bache)
  const PRODUCTS = {
    stars_120: { stars: 120, price: 20 },
    stars_800: { stars: 800, price: 140 },
    stars_4000: { stars: 4000, price: 700 },
    stars_20000: { stars: 20000, price: 3500 },
    stars_40000: { stars: 40000, price: 7000 },
    stars_80000: { stars: 80000, price: 14000 },
  };

  const PURCHASES = "playPurchases";
  // Testing ke time Render env me PLAY_ALLOW_TEST=true, testing ke baad hata do
  const ALLOW_TEST = String(process.env.PLAY_ALLOW_TEST || "").toLowerCase() === "true";
  const FV = admin.firestore.FieldValue;

  // ---------------------------------------------------
  // Service account -> OAuth access token (bina extra package)
  // ---------------------------------------------------
  function loadServiceAccount() {
    try {
      if (process.env.GOOGLE_PLAY_SA_JSON) return JSON.parse(process.env.GOOGLE_PLAY_SA_JSON);
      return JSON.parse(fs.readFileSync(path.join(__dirname, "serviceAccountKey.json"), "utf8"));
    } catch (e) {
      console.error("PLAY BILLING: service account load nahi hua:", e.message);
      return null;
    }
  }
  const SA = loadServiceAccount();

  let tokenCache = { token: "", exp: 0 };
  async function accessToken() {
    if (tokenCache.token && Date.now() < tokenCache.exp - 60000) return tokenCache.token;
    if (!SA) throw new Error("NO_SERVICE_ACCOUNT");
    const now = Math.floor(Date.now() / 1000);
    const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const input =
      b64u({ alg: "RS256", typ: "JWT" }) +
      "." +
      b64u({
        iss: SA.client_email,
        scope: "https://www.googleapis.com/auth/androidpublisher",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      });
    const sig = crypto.sign("RSA-SHA256", Buffer.from(input), SA.private_key).toString("base64url");
    const r = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: input + "." + sig }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
    );
    tokenCache = { token: r.data.access_token, exp: Date.now() + (r.data.expires_in || 3600) * 1000 };
    return tokenCache.token;
  }

  async function play(method, url, params) {
    const t = await accessToken();
    return axios({ method, url: API + url, params, headers: { Authorization: "Bearer " + t }, timeout: 15000 });
  }

  const tokenId = (purchaseToken) => crypto.createHash("sha256").update(purchaseToken).digest("hex");

  // ---------------------------------------------------
  // POST /play/verify
  // ---------------------------------------------------
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Too many requests. Please try again later." },
  });

  app.post("/play/verify", limiter, express.json({ limit: "20kb" }), verifyUser, async (req, res) => {
    const uid = req.user.uid;
    const productId = String((req.body || {}).productId || "");
    const purchaseToken = String((req.body || {}).purchaseToken || "");

    const product = PRODUCTS[productId];
    if (!product) return res.status(400).json({ success: false, error: "Invalid product" });
    if (!/^[A-Za-z0-9._:-]{20,1000}$/.test(purchaseToken))
      return res.status(400).json({ success: false, error: "Invalid purchase" });

    // 1) Google se poochho
    let p;
    try {
      const r = await play("get", `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`);
      p = r.data || {};
    } catch (e) {
      const st = e.response?.status;
      console.error("PLAY VERIFY API ERROR:", st, JSON.stringify(e.response?.data || e.message).slice(0, 400));
      if (st === 400 || st === 404 || st === 410) return res.status(400).json({ success: false, error: "Purchase valid nahi hai" });
      return res.status(503).json({ success: false, retry: true, error: "Verify abhi nahi ho paya, app dobara kholne par stars mil jayenge" });
    }

    // purchaseState: 0 = Purchased, 1 = Canceled, 2 = Pending
    if (p.purchaseState === 2) return res.json({ success: false, pending: true, error: "Payment pending hai" });
    if (p.purchaseState !== 0) return res.status(400).json({ success: false, error: "Payment complete nahi hua" });

    // Test purchase (License tester, paisa nahi kat-ta) sirf tab jab PLAY_ALLOW_TEST=true ho
    if (p.purchaseType === 0 && !ALLOW_TEST) {
      console.warn("PLAY TEST PURCHASE BLOCKED for uid", uid);
      return res.status(403).json({ success: false, error: "Test purchase par Stars nahi milte" });
    }

    // Purchase isi user ka hai? (app purchase ke time uid bhejta hai)
    if (p.obfuscatedExternalAccountId && p.obfuscatedExternalAccountId !== uid) {
      return res.status(403).json({ success: false, error: "Ye purchase is account ka nahi hai" });
    }

    // 2) Credit (ek token = ek hi baar)
    const ref = db.collection(PURCHASES).doc(tokenId(purchaseToken));
    let result;
    try {
      result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) {
          const d = snap.data();
          if (d.uid !== uid) throw new Error("OTHER_USER");
          return { already: true, stars: d.stars };
        }
        const walletRef = db.collection("wallets").doc(uid);
        const wSnap = await tx.get(walletRef);
        const old = wSnap.exists ? Number(wSnap.data().stars) || 0 : 0;
        const lvlBase = wSnap.exists ? await readLevelStars(tx, walletRef, wSnap.data()) : 0;

        if (wSnap.exists) {
          tx.update(walletRef, { stars: old + product.stars, levelStars: lvlBase + product.stars });
        } else {
          tx.set(walletRef, { stars: product.stars, level: 0, earnings: 0, receivedStars: 0, totalSpent: 0, levelStars: product.stars });
        }

        const orderId = String(p.orderId || "");
        tx.set(walletRef.collection("purchaseHistory").doc(orderId.replace(/[^A-Za-z0-9._-]/g, "_") || ref.id), {
          stars: product.stars,
          amount: product.price,
          paymentId: orderId,
          productId,
          gateway: "google_play",
          source: "app",
          status: "Completed",
          createdAt: FV.serverTimestamp(),
        });

        tx.set(ref, {
          uid,
          productId,
          stars: product.stars,
          amount: product.price,
          orderId,
          purchaseToken,
          isTest: p.purchaseType === 0, // license tester ki test purchase
          status: "credited",
          createdAt: FV.serverTimestamp(),
        });
        return { already: false, stars: product.stars };
      });
    } catch (e) {
      if (e.message === "OTHER_USER") return res.status(403).json({ success: false, error: "Ye purchase pehle hi use ho chuki hai" });
      console.error("PLAY CREDIT ERROR:", e.message);
      return res.status(500).json({ success: false, retry: true, error: "Stars add nahi ho paye, dobara try karo" });
    }

    // 3) Consume (taaki user ye pack dobara kharid sake). Fail ho to app bhi finishTransaction se karta hai.
    if (p.consumptionState === 0) {
      play("post", `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`).catch((e) =>
        console.warn("PLAY CONSUME WARN:", e.response?.status || e.message)
      );
    }

    return res.json({ success: true, stars: result.stars, alreadyCredited: result.already });
  });

  // ---------------------------------------------------
  // REFUND / CHARGEBACK: voided purchases ke stars wapas
  // ---------------------------------------------------
  async function processVoided() {
    if (!SA) return;
    const stateRef = db.collection("system").doc("playVoided");
    const st = await stateRef.get();
    const start = st.exists && st.data().lastTime ? Number(st.data().lastTime) : Date.now() - 30 * 24 * 3600 * 1000;
    let pageToken;
    let maxTime = start;
    let count = 0;

    do {
      const r = await play("get", "/purchases/voidedpurchases", { startTime: start, maxResults: 1000, token: pageToken });
      const list = r.data.voidedPurchases || [];
      pageToken = r.data.tokenPagination?.nextPageToken;

      for (const v of list) {
        maxTime = Math.max(maxTime, Number(v.voidedTimeMillis) || 0);
        const ref = db.collection(PURCHASES).doc(tokenId(v.purchaseToken));
        await db.runTransaction(async (tx) => {
          const s = await tx.get(ref);
          if (!s.exists || s.data().status === "voided") return;
          const d = s.data();
          const walletRef = db.collection("wallets").doc(d.uid);
          const w = await tx.get(walletRef);
          const cur = w.exists ? Number(w.data().stars) || 0 : 0;
          const lvl = w.exists ? Number(w.data().levelStars) || 0 : 0;
          const cut = Math.min(cur, d.stars);
          tx.set(walletRef, { stars: cur - cut, levelStars: Math.max(0, Math.min(lvl, cur - cut)) }, { merge: true });
          tx.update(ref, { status: "voided", voidedAt: FV.serverTimestamp(), starsReversed: cut, unrecovered: d.stars - cut });
          count++;
        });
      }
    } while (pageToken);

    await stateRef.set({ lastTime: maxTime, checkedAt: FV.serverTimestamp() }, { merge: true });
    if (count) console.log(`PLAY VOIDED: ${count} refunded purchases reversed`);
  }

  if (cron) {
    cron.schedule("17 */6 * * *", () => processVoided().catch((e) => console.error("PLAY VOIDED ERROR:", e.response?.status || e.message)));
  }

  console.log(`Google Play billing ready (package: ${PACKAGE}, service account: ${SA ? SA.client_email : "MISSING"}, test purchases: ${ALLOW_TEST ? "ALLOWED" : "blocked"})`);
};
