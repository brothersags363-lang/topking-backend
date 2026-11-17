// =====================================================================
// migrateToStream.js — PURANI videos ko bhi multi-quality (HLS) banao
//
// Kya karta hai: all_videos ki jin docs me streamUid nahi hai, unka R2 mp4
// Cloudflare Stream ko bhej deta hai, aur doc me streamUid + hlsReady:false likhta hai.
// Baaki kaam server ka cron (streamHls.js) karta hai: ready hote hi hlsUrl likh deta hai.
//
// Chalane ka tareeka (apne computer par, backend folder ke andar):
//   set CF_ACCOUNT_ID=...            (Windows)     export CF_ACCOUNT_ID=...   (Mac/Linux)
//   set CF_STREAM_TOKEN=...                        export CF_STREAM_TOKEN=...
//   set R2_PUBLIC_URL=https://...                  export R2_PUBLIC_URL=https://...
//   node migrateToStream.js --dry --limit 5        <- pehle sirf dekho (kuch likhta nahi)
//   node migrateToStream.js --limit 50             <- 50 videos
//   node migrateToStream.js                        <- sabhi (dobara chalane par jo ho chuki wo skip)
//
// Ye script rukne par bhi dobara chalayi ja sakti hai (resume safe).
// ZARUR PEHLE chhota test (--limit 5) karo; Stream ki billing stored minutes par hoti hai.
// =====================================================================
const admin = require("firebase-admin");

const { ingestFromUrl, isOurR2Mp4, ENABLED } = require("./streamHls");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) || 0 : 0;
const PAGE = 100;
const PAUSE_MS = 400; // Cloudflare ko dheere dheere bhejo

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!ENABLED) {
    console.error("CF_ACCOUNT_ID / CF_STREAM_TOKEN / R2_PUBLIC_URL set karo (upar likha hai), phir chalao.");
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.cert(require("./serviceAccountKey.json")) });
  const db = admin.firestore();

  let last = null;
  let scanned = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = db.collection("all_videos").orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      last = docSnap;
      scanned++;
      const d = docSnap.data() || {};

      if (d.streamUid || d.hlsReady === true) {
        skipped++;
        continue;
      }
      const url = d.videoUrl || d.video;
      if (!isOurR2Mp4(url)) {
        skipped++; // dusre host / mp4 nahi
        continue;
      }

      if (DRY) {
        console.log(`[dry] bhejni hai: ${docSnap.id}  ${url}`);
        sent++;
      } else {
        try {
          const r = await ingestFromUrl(url, `old-${docSnap.id}`);
          await docSnap.ref.update({ streamUid: r.uid, hlsReady: false });
          sent++;
          console.log(`ok  ${docSnap.id} -> ${r.uid}`);
        } catch (e) {
          failed++;
          console.log(`ERR ${docSnap.id}: ${e.message}`);
        }
        await sleep(PAUSE_MS);
      }

      if (LIMIT && sent >= LIMIT) break;
    }
    if (LIMIT && sent >= LIMIT) break;
  }

  console.log(
    `\nKhatam. dekhi: ${scanned}, ${DRY ? "bhejni hongi" : "bheji"}: ${sent}, skip: ${skipped}, fail: ${failed}`
  );
  if (!DRY && sent > 0) {
    console.log("Ab server ka cron har minute check karke hlsUrl likhta rahega (kuch minute me ho jayegi).");
  }
  process.exit(0);
})().catch((e) => {
  console.error("Script fail:", e);
  process.exit(1);
});
