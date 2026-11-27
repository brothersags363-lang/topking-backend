// =====================================================================
// backfillPublicProfiles.js — PURANE users ki publicProfiles ek baar bharo
//
// Naye badlav Cloud Function (functions/publicProfiles.js) khud karta hai. Ye script
// sirf ek baar chalani hai, taaki jo users pehle se hain unki safe copy bhi ban jaaye.
//
// Chalana (backend folder me, jahan serviceAccountKey.json hai):
//   node backfillPublicProfiles.js
// =====================================================================
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });

const db = admin.firestore();
const SAFE_FIELDS = ['username', 'name', 'profileImg', 'verified', 'verifiedColor'];

function toPublic(d) {
  const out = {};
  for (const k of SAFE_FIELDS) {
    if (d[k] !== undefined && d[k] !== null) out[k] = d[k];
  }
  out.faceVerified =
    d.faceVerified === true || d.faceStatus === 'submitted' || d.faceStatus === 'approved';
  return out;
}

async function main() {
  let last = null;
  let total = 0;
  for (;;) {
    let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(400);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.forEach((d) => {
      batch.set(db.collection('publicProfiles').doc(d.id), toPublic(d.data()));
    });
    await batch.commit();
    total += snap.size;
    last = snap.docs[snap.docs.length - 1];
    console.log('done', total);
  }
  console.log('Poora hua. Kul users:', total);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
