// backend/agencyMonthly.js
// =====================================================================
// AGENCY MONTHLY RESET: har mahine agencies.monthlyStars = 0
//
// server.js isse aise use karta hai:
//   const { ensureMonthlyReset } = require("./agencyMonthly");
//   ensureMonthlyReset({ admin, db });
//
// Render free instance so jaye to 1 tarikh ka cron chhoot sakta hai, isliye ye function
// server start par, har ghante, aur cron par chalta hai. Mahina Firestore me likha rehta hai
// (serverState/agencyMonthly.lastMonth), isliye ek mahine me sirf ek hi baar reset hota hai,
// chahe kitni baar bulaya jaye ya kitne instance chal rahe hon.
//
// Pehli baar (record na ho) => sirf is mahine ka record likhta hai, stars 0 NAHI karta
// (warna chalte mahine ke stars ud jate). Reset agle mahine se shuru hota hai.
// =====================================================================

const TZ = process.env.TZ || "Asia/Kolkata";
const STATE_COLLECTION = "serverState";
const STATE_DOC = "agencyMonthly";
const BATCH_SIZE = 400;

// "YYYY-MM" us timezone me (default India)
function currentMonthKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  return `${y}-${m}`;
}

async function resetAllAgencies(db) {
  let last = null;
  let total = 0;
  for (;;) {
    let q = db.collection("agencies").orderBy("__name__").limit(BATCH_SIZE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.forEach((d) => batch.update(d.ref, { monthlyStars: 0 }));
    await batch.commit();
    total += snap.size;
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < BATCH_SIZE) break;
  }
  return total;
}

let running = false;

async function ensureMonthlyReset({ admin, db }) {
  if (running) return { skipped: "busy" };
  running = true;
  const stateRef = db.collection(STATE_COLLECTION).doc(STATE_DOC);
  const month = currentMonthKey();
  let previous = null;
  let claimed = false;

  try {
    // Pehle is mahine ko "claim" karo (transaction) => do instance ek saath reset nahi karenge
    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(stateRef);
      previous = snap.exists ? snap.data().lastMonth || null : null;
      if (previous === month) return "same";
      tx.set(
        stateRef,
        {
          lastMonth: month,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return previous ? "reset" : "first";
    });

    if (outcome === "same") return { month, action: "none" };
    if (outcome === "first") {
      console.log("AGENCY MONTHLY: pehli baar record likha (" + month + "), reset nahi kiya");
      return { month, action: "recorded" };
    }

    claimed = true;
    const count = await resetAllAgencies(db);
    console.log("AGENCY MONTHLY RESET done: " + count + " agencies, " + previous + " -> " + month);
    return { month, action: "reset", count };
  } catch (e) {
    console.error("AGENCY MONTHLY RESET ERROR:", e && e.message);
    // reset adhura reh gaya => purana mahina wapas likh do, agli baar dobara koshish hogi
    if (claimed && previous) {
      try {
        await stateRef.set({ lastMonth: previous }, { merge: true });
      } catch (_) {}
    }
    return { month, action: "error" };
  } finally {
    running = false;
  }
}

module.exports = { ensureMonthlyReset, currentMonthKey };
