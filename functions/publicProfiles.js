'use strict';
// =====================================================================
// publicProfiles/{uid} — users/{uid} ki SIRF SAFE copy (bina login wale bhi padh sakte hain)
//
// Kyun: bina login (guest) For You feed ko pata hona chahiye ki video banane wala
// verified hai ya nahi. Lekin users/{uid} me phone, birthday, fcmToken jaisi private
// cheezein hain, isliye users ko public nahi kar sakte.
// Ye function users/{uid} badalte hi sirf neeche wale SAFE fields publicProfiles me
// likh deta hai. Rules me publicProfiles: read = sab, write = sirf server.
//
// Naya field public karna ho to sirf SAFE_FIELDS me jodo (phone / email / birthday /
// fcmToken / location kabhi mat jodna).
// =====================================================================
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getFirestore } = require('firebase-admin/firestore');

const REGION = 'us-central1';

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

exports.toPublicProfile = toPublic;

exports.syncPublicProfile = onDocumentWritten(
  { document: 'users/{uid}', region: REGION, maxInstances: 20 },
  async (event) => {
    const uid = event.params.uid;
    const ref = getFirestore().collection('publicProfiles').doc(uid);
    const after = event.data && event.data.after && event.data.after.exists
      ? event.data.after.data()
      : null;

    if (!after) {
      await ref.delete().catch(() => {});
      return;
    }

    const before = event.data.before && event.data.before.exists ? event.data.before.data() : null;
    const next = toPublic(after);
    // COST: safe fields nahi badle (jaise sirf fcmToken / lastSeen badla) to kuch mat likho
    if (before && JSON.stringify(toPublic(before)) === JSON.stringify(next)) return;

    await ref.set(next);
  }
);
