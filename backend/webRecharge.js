"use strict";

/**
 * WEBSITE RECHARGE (Razorpay / Cashfree / PayU)
 * ---------------------------------------------
 * Ek hi wallet (Firestore: wallets/{uid}) website aur app dono me use hota hai.
 * Website par payment hone ke baad SERVER stars add karta hai, isliye app me
 * onSnapshot se balance apne aap update ho jata hai.
 *
 * Gateway badalna ho to sirf env me PAYMENT_GATEWAY badlo
 * (razorpay | cashfree | payu). Website code me kuch nahi badalna.
 *
 * Security:
 *  - Pack/price sirf server me tay hota hai (client ka amount nahi mana jata)
 *  - Stars sirf verified payment (signature / gateway status API) par milte hain
 *  - Har order sirf ek baar credit hota hai (Firestore transaction + status)
 */

const express = require("express");
const cors = require("cors");

module.exports = function mountWebRecharge({
  app,
  db,
  admin,
  verifyUser,
  rateLimit,
  axios,
  crypto,
}) {
  // ---------------------------------------------------
  // CONFIG (env)
  // ---------------------------------------------------
  const GATEWAY = (process.env.PAYMENT_GATEWAY || "razorpay").toLowerCase();

  const WEBSITE_URL = (process.env.WEBSITE_URL || "https://topking-short.vercel.app").replace(/\/+$/, "");
  const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || "https://topking-backend.onrender.com").replace(/\/+$/, "");

  const WEB_ORIGINS = (process.env.WEB_ORIGINS || WEBSITE_URL)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
  const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
  const RZP_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";

  const CF_APP_ID = process.env.CASHFREE_APP_ID || "";
  const CF_SECRET = process.env.CASHFREE_SECRET_KEY || "";
  const CF_PROD = (process.env.CASHFREE_ENV || "sandbox").toLowerCase() === "production";
  const CF_BASE = CF_PROD ? "https://api.cashfree.com" : "https://sandbox.cashfree.com";
  const CF_VERSION = "2023-08-01";

  const PAYU_KEY = process.env.PAYU_KEY || "";
  const PAYU_SALT = process.env.PAYU_SALT || "";
  const PAYU_LIVE = (process.env.PAYU_ENV || "test").toLowerCase() === "live";
  const PAYU_ACTION = PAYU_LIVE
    ? "https://secure.payu.in/_payment"
    : "https://test.payu.in/_payment";

  // Packs: app ke wallet.tsx wale hi (₹1 = 8 stars). Price rupaye me.
  const PACKS = [
    { id: "p15", stars: 120, price: 15 },
    { id: "p100", stars: 800, price: 100 },
    { id: "p500", stars: 4000, price: 500 },
    { id: "p2500", stars: 20000, price: 2500 },
    { id: "p5000", stars: 40000, price: 5000 },
    { id: "p10000", stars: 80000, price: 10000 },
  ];

  const ORDERS = "webRechargeOrders";

  // ---------------------------------------------------
  // LEVEL (wallet.tsx ke getLevel jaisa hi, wahi order)
  // NOTE: app me "stars >= 1150 -> 25" wali line galat lagti hai
  // (shayad 11500 chahiye). Jab app me theek karo, yahan bhi karna.
  // ---------------------------------------------------
  const LEVELS = [
    [499000, 50], [440000, 49], [385000, 48], [310000, 47], [299000, 46],
    [260000, 45], [210000, 44], [189000, 43], [155000, 42], [125000, 41],
    [110000, 40], [101000, 39], [99000, 38], [89000, 37], [78000, 36],
    [67000, 35], [51000, 34], [43000, 33], [31000, 32], [26000, 31],
    [23000, 30], [19000, 29], [17000, 28], [14000, 27], [12300, 26],
    [1150, 25], [9000, 24], [8200, 23], [7200, 22], [6100, 21],
    [5050, 20], [4000, 19], [3500, 18], [2800, 17], [2400, 16],
    [1900, 15], [1600, 14], [1300, 13], [1150, 12], [1000, 11],
    [870, 10], [670, 9], [540, 8], [360, 7], [280, 6],
    [200, 5], [160, 4], [100, 3], [60, 2], [10, 1],
  ];
  function getLevel(stars) {
    for (const [min, lvl] of LEVELS) if (stars >= min) return lvl;
    return 0;
  }

  // ---------------------------------------------------
  // HELPERS
  // ---------------------------------------------------
  const hmac = (algo, key, data, enc) =>
    crypto.createHmac(algo, key).update(data).digest(enc);

  function safeEqual(a, b) {
    const x = Buffer.from(String(a || ""));
    const y = Buffer.from(String(b || ""));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  }

  const sha512 = (s) => crypto.createHash("sha512").update(s).digest("hex");

  function newOrderId() {
    return "TK" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(5).toString("hex").toUpperCase();
  }

  function gatewayConfigured() {
    if (GATEWAY === "razorpay") return !!(RZP_KEY_ID && RZP_KEY_SECRET);
    if (GATEWAY === "cashfree") return !!(CF_APP_ID && CF_SECRET);
    if (GATEWAY === "payu") return !!(PAYU_KEY && PAYU_SALT);
    return false;
  }

  // Order ko ek hi baar credit karta hai (idempotent).
  async function creditOrder(orderId, paymentId) {
    const ref = db.collection(ORDERS).doc(orderId);

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("ORDER_NOT_FOUND");
      const o = snap.data();

      if (o.status === "paid") return { alreadyPaid: true, stars: o.stars };

      const walletRef = db.collection("wallets").doc(o.uid);
      const wSnap = await tx.get(walletRef);
      const old = wSnap.exists ? Number(wSnap.data().stars) || 0 : 0;
      const total = old + o.stars;
      const level = getLevel(total);
      const now = admin.firestore.FieldValue.serverTimestamp();

      if (wSnap.exists) {
        tx.update(walletRef, { stars: total, level });
      } else {
        tx.set(walletRef, { stars: total, level, earnings: 0, receivedStars: 0 });
      }

      tx.set(walletRef.collection("purchaseHistory").doc(orderId), {
        stars: o.stars,
        amount: o.amount,
        paymentId: String(paymentId || ""),
        gateway: o.gateway,
        source: "website",
        status: "Completed",
        createdAt: now,
      });

      tx.update(ref, {
        status: "paid",
        paymentId: String(paymentId || ""),
        paidAt: now,
      });

      return { alreadyPaid: false, stars: o.stars };
    });
  }

  async function getOrder(orderId) {
    if (typeof orderId !== "string" || !/^[A-Za-z0-9_-]{6,60}$/.test(orderId)) return null;
    const s = await db.collection(ORDERS).doc(orderId).get();
    return s.exists ? s.data() : null;
  }

  // ---------------------------------------------------
  // MIDDLEWARE
  // ---------------------------------------------------
  const webCors = cors({
    origin: (origin, cb) => cb(null, !origin || WEB_ORIGINS.includes(origin)),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    credentials: false,
  });

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Too many requests. Please try again later." },
  });

  const jsonBody = express.json({ limit: "20kb" });
  const rawBody = express.raw({ type: "*/*", limit: "200kb" });
  const formBody = express.urlencoded({ extended: false, limit: "50kb" });

  app.options("/web-recharge/*", webCors);

  // ---------------------------------------------------
  // GET /web-recharge/config  (login ke bina bhi chalega)
  // ---------------------------------------------------
  app.get("/web-recharge/config", webCors, limiter, (req, res) => {
    res.json({
      success: true,
      enabled: gatewayConfigured(),
      gateway: GATEWAY,
      razorpayKeyId: GATEWAY === "razorpay" ? RZP_KEY_ID : undefined,
      cashfreeMode: GATEWAY === "cashfree" ? (CF_PROD ? "production" : "sandbox") : undefined,
      packs: PACKS,
    });
  });

  // ---------------------------------------------------
  // POST /web-recharge/create-order
  // ---------------------------------------------------
  app.post("/web-recharge/create-order", webCors, limiter, jsonBody, verifyUser, async (req, res) => {
    try {
      if (!gatewayConfigured()) {
        return res.status(503).json({ success: false, error: "Recharge abhi available nahi hai." });
      }

      const pack = PACKS.find((p) => p.id === (req.body || {}).packId);
      if (!pack) return res.status(400).json({ success: false, error: "Invalid pack" });

      const phoneRaw = String((req.body || {}).phone || "").replace(/\D/g, "").slice(-10);
      const phone = /^[6-9]\d{9}$/.test(phoneRaw) ? phoneRaw : "";
      if (GATEWAY === "cashfree" && !phone) {
        return res.status(400).json({ success: false, error: "Valid 10 digit mobile number daalo." });
      }

      const uid = req.user.uid;
      const orderId = newOrderId();
      const base = {
        uid,
        packId: pack.id,
        stars: pack.stars,
        amount: pack.price,
        gateway: GATEWAY,
        status: "created",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // ---------- RAZORPAY ----------
      if (GATEWAY === "razorpay") {
        const r = await axios.post(
          "https://api.razorpay.com/v1/orders",
          { amount: pack.price * 100, currency: "INR", receipt: orderId, notes: { orderId, uid } },
          { auth: { username: RZP_KEY_ID, password: RZP_KEY_SECRET }, timeout: 15000 }
        );
        await db.collection(ORDERS).doc(orderId).set({ ...base, gatewayOrderId: r.data.id });
        return res.json({
          success: true,
          gateway: "razorpay",
          orderId,
          razorpayOrderId: r.data.id,
          keyId: RZP_KEY_ID,
          amount: pack.price * 100,
          currency: "INR",
        });
      }

      // ---------- CASHFREE ----------
      if (GATEWAY === "cashfree") {
        const r = await axios.post(
          CF_BASE + "/pg/orders",
          {
            order_id: orderId,
            order_amount: pack.price,
            order_currency: "INR",
            customer_details: {
              customer_id: uid.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 50) || "user",
              customer_phone: phone,
              customer_email: req.user.email || undefined,
            },
            order_meta: {
              return_url: `${WEBSITE_URL}/recharge?order_id=${orderId}`,
              notify_url: `${PUBLIC_API_URL}/web-recharge/webhook/cashfree`,
            },
          },
          {
            headers: {
              "x-client-id": CF_APP_ID,
              "x-client-secret": CF_SECRET,
              "x-api-version": CF_VERSION,
              "Content-Type": "application/json",
            },
            timeout: 15000,
          }
        );
        await db.collection(ORDERS).doc(orderId).set({ ...base, gatewayOrderId: r.data.cf_order_id ? String(r.data.cf_order_id) : orderId });
        return res.json({
          success: true,
          gateway: "cashfree",
          orderId,
          paymentSessionId: r.data.payment_session_id,
          mode: CF_PROD ? "production" : "sandbox",
        });
      }

      // ---------- PAYU ----------
      if (GATEWAY === "payu") {
        const amount = pack.price.toFixed(2);
        const productinfo = "TopKing Stars";
        const firstname = String(req.user.name || "User").replace(/[^A-Za-z ]/g, "").trim().slice(0, 40) || "User";
        const email = req.user.email || "user@topking.app";
        const hash = sha512(
          [PAYU_KEY, orderId, amount, productinfo, firstname, email, "", "", "", "", "", "", "", "", "", "", PAYU_SALT].join("|")
        );
        await db.collection(ORDERS).doc(orderId).set({ ...base, gatewayOrderId: orderId });
        return res.json({
          success: true,
          gateway: "payu",
          orderId,
          payu: {
            action: PAYU_ACTION,
            fields: {
              key: PAYU_KEY,
              txnid: orderId,
              amount,
              productinfo,
              firstname,
              email,
              phone,
              surl: `${PUBLIC_API_URL}/web-recharge/payu/return`,
              furl: `${PUBLIC_API_URL}/web-recharge/payu/return`,
              hash,
            },
          },
        });
      }

      return res.status(500).json({ success: false, error: "Gateway config error" });
    } catch (e) {
      console.error("WEB RECHARGE CREATE ERROR:", e.response?.data || e.message);
      return res.status(500).json({ success: false, error: "Order create nahi ho paya. Dobara try karo." });
    }
  });

  // ---------------------------------------------------
  // POST /web-recharge/razorpay/verify  (checkout success ke baad)
  // ---------------------------------------------------
  app.post("/web-recharge/razorpay/verify", webCors, limiter, jsonBody, verifyUser, async (req, res) => {
    try {
      const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
      const order = await getOrder(orderId);

      if (!order || order.uid !== req.user.uid || order.gateway !== "razorpay") {
        return res.status(404).json({ success: false, error: "Order not found" });
      }
      if (razorpay_order_id !== order.gatewayOrderId) {
        return res.status(400).json({ success: false, error: "Order mismatch" });
      }

      const expected = hmac("sha256", RZP_KEY_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`, "hex");
      if (!safeEqual(expected, razorpay_signature)) {
        return res.status(400).json({ success: false, error: "Payment verify nahi hua" });
      }

      const r = await creditOrder(orderId, razorpay_payment_id);
      return res.json({ success: true, stars: r.stars, alreadyPaid: r.alreadyPaid });
    } catch (e) {
      console.error("RZP VERIFY ERROR:", e.message);
      return res.status(500).json({ success: false, error: "Verify failed" });
    }
  });

  // ---------------------------------------------------
  // POST /web-recharge/status  (redirect ke baad / refresh par)
  // ---------------------------------------------------
  app.post("/web-recharge/status", webCors, limiter, jsonBody, verifyUser, async (req, res) => {
    try {
      const orderId = (req.body || {}).orderId;
      let order = await getOrder(orderId);
      if (!order || order.uid !== req.user.uid) {
        return res.status(404).json({ success: false, error: "Order not found" });
      }

      if (order.status !== "paid" && order.gateway === "cashfree") {
        await checkCashfreeAndCredit(orderId, order);
        order = await getOrder(orderId);
      }

      return res.json({ success: true, status: order.status, stars: order.stars, amount: order.amount });
    } catch (e) {
      console.error("STATUS ERROR:", e.message);
      return res.status(500).json({ success: false, error: "Status check failed" });
    }
  });

  async function checkCashfreeAndCredit(orderId, order) {
    const r = await axios.get(`${CF_BASE}/pg/orders/${encodeURIComponent(orderId)}`, {
      headers: { "x-client-id": CF_APP_ID, "x-client-secret": CF_SECRET, "x-api-version": CF_VERSION },
      timeout: 15000,
    });
    const d = r.data || {};
    if (d.order_status === "PAID" && Number(d.order_amount) === Number(order.amount)) {
      await creditOrder(orderId, d.cf_order_id || orderId);
      return true;
    }
    if (d.order_status === "EXPIRED" || d.order_status === "TERMINATED") {
      await db.collection(ORDERS).doc(orderId).update({ status: "failed" });
    }
    return false;
  }

  // ---------------------------------------------------
  // WEBHOOKS (server-to-server, login nahi hota; signature se verify)
  // ---------------------------------------------------

  // Razorpay: Dashboard > Webhooks > URL: PUBLIC_API_URL/web-recharge/webhook/razorpay
  // Event: payment.captured (aur order.paid)
  app.post("/web-recharge/webhook/razorpay", rawBody, async (req, res) => {
    try {
      if (!RZP_WEBHOOK_SECRET) return res.status(503).end();
      const sig = req.headers["x-razorpay-signature"];
      const expected = hmac("sha256", RZP_WEBHOOK_SECRET, req.body, "hex");
      if (!safeEqual(expected, sig)) return res.status(400).end();

      const evt = JSON.parse(req.body.toString("utf8"));
      if (evt.event === "payment.captured" || evt.event === "order.paid") {
        const p = evt.payload?.payment?.entity;
        const orderId = p?.notes?.orderId;
        const order = await getOrder(orderId);
        if (order && order.gateway === "razorpay" && p.order_id === order.gatewayOrderId && p.amount === order.amount * 100 && p.currency === "INR") {
          await creditOrder(orderId, p.id);
        }
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error("RZP WEBHOOK ERROR:", e.message);
      return res.status(500).end();
    }
  });

  // Cashfree: Dashboard > Developers > Webhooks > PAYMENT_SUCCESS
  // URL: PUBLIC_API_URL/web-recharge/webhook/cashfree
  app.post("/web-recharge/webhook/cashfree", rawBody, async (req, res) => {
    try {
      if (!CF_SECRET) return res.status(503).end();
      const ts = req.headers["x-webhook-timestamp"];
      const sig = req.headers["x-webhook-signature"];
      const expected = hmac("sha256", CF_SECRET, String(ts) + req.body.toString("utf8"), "base64");
      if (!safeEqual(expected, sig)) return res.status(400).end();

      const evt = JSON.parse(req.body.toString("utf8"));
      const orderId = evt?.data?.order?.order_id;
      const order = await getOrder(orderId);
      // Payload par bharosa nahi: Cashfree API se status dobara confirm karte hain
      if (order && order.gateway === "cashfree" && order.status !== "paid") {
        await checkCashfreeAndCredit(orderId, order);
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error("CF WEBHOOK ERROR:", e.message);
      return res.status(500).end();
    }
  });

  // PayU: browser yahan POST karta hai (surl/furl). Hash se verify, phir website par redirect.
  app.post("/web-recharge/payu/return", formBody, async (req, res) => {
    const b = req.body || {};
    const back = (status) => res.redirect(303, `${WEBSITE_URL}/recharge?order_id=${encodeURIComponent(b.txnid || "")}&status=${status}`);
    try {
      if (!PAYU_KEY || !PAYU_SALT) return res.status(503).end();
      const reverse = sha512(
        [PAYU_SALT, b.status, "", "", "", "", "", "", "", "", "", "", b.email, b.firstname, b.productinfo, b.amount, b.txnid, PAYU_KEY].join("|")
      );
      if (!safeEqual(reverse, String(b.hash || "").toLowerCase())) return back("invalid");

      const order = await getOrder(b.txnid);
      if (!order || order.gateway !== "payu") return back("invalid");

      if (b.status === "success" && Number(b.amount) === Number(order.amount)) {
        await creditOrder(b.txnid, b.mihpayid || b.txnid);
        return back("success");
      }
      await db.collection(ORDERS).doc(b.txnid).update({ status: "failed" }).catch(() => {});
      return back("failed");
    } catch (e) {
      console.error("PAYU RETURN ERROR:", e.message);
      return back("error");
    }
  });

  console.log(`Web recharge ready (gateway: ${GATEWAY}, configured: ${gatewayConfigured()})`);
};
