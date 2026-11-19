// Ek baar chalao: jin users ke videos pehle se 300/3000 views cross kar chuke hain unko tick de do.
//   cd backend
//   node backfillTicks.js --dry     <- sirf dikhao
//   node backfillTicks.js           <- tick laga do
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(require("./serviceAccountKey.json")) });
const db = admin.firestore();
const DRY = process.argv.includes("--dry");
const WHITE = 300, GREY = 3000, NEEDED = 5;

(async () => {
  const per = new Map();
  let last = null;
  for (;;) {
    let q = db.collection("all_videos").select("userId", "views").orderBy(admin.firestore.FieldPath.documentId()).limit(500);
    if (last) q = q.startAfter(last);
    const s = await q.get();
    if (s.empty) break;
    s.forEach((d) => {
      const uid = d.get("userId"); if (!uid) return;
      const v = Number(d.get("views") || 0);
      const c = per.get(uid) || { w: 0, g: 0 };
      if (v >= WHITE) c.w++; if (v >= GREY) c.g++;
      per.set(uid, c);
    });
    last = s.docs[s.docs.length - 1];
  }
  let n = 0;
  for (const [uid, c] of per) {
    const want = c.g >= NEEDED ? "yellow" : c.w >= NEEDED ? "white" : null;
    if (!want) continue;
    const ref = db.collection("users").doc(uid);
    const u = await ref.get(); if (!u.exists) continue;
    const d = u.data();
    if (d.banned === true) continue;
    const cur = d.verified === true ? (d.verifiedColor === "yellow" ? "yellow" : "white") : null;
    if (want === "yellow" ? (cur === "yellow" || d.greyAutoGranted) : (cur || d.whiteAutoGranted || d.greyAutoGranted)) continue;
    console.log(DRY ? "[dry]" : "[grant]", uid, d.username || "", want, c);
    n++;
    if (DRY) continue;
    const patch = { verified: true, verifiedColor: want };
    patch[want === "yellow" ? "greyAutoGranted" : "whiteAutoGranted"] = true;
    await ref.update(patch);
    await db.collection("verifiedGrants").add({ userId: uid, username: d.username || "", verified: true, color: want, adminId: "auto", auto: true, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  }
  console.log("done:", n);
})();
