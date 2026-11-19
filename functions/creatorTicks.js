'use strict';
// =====================================================
// AUTO TICK (server par, koi claim / button nahi):
//   5 videos, har ek par 300+  views  -> White tick   (verifiedColor: "white")
//   5 videos, har ek par 3000+ views  -> Grey V tick  (verifiedColor: "yellow")
//
// Chalta tab hi hai jab kisi video ke views 300 ya 3000 cross karte hain
// (baaki sab update par turant return -> sasta). Us waqt owner ke videos
// ek baar padhe jaate hain (sirf "views" field).
//
// - Admin ne baad me tick hata diya -> dobara auto nahi lagega (whiteAutoGranted / greyAutoGranted)
// - Grey V white ko upgrade karta hai; Grey/white wale ko kabhi downgrade nahi karta
// - Banned user ko tick nahi
// =====================================================
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const REGION = 'us-central1';
const WHITE_VIEWS = 300;
const GREY_VIEWS = 3000;
const NEEDED = 5;

const db = getFirestore();

async function grantFor(uid) {
  if (!uid) return;
  const userRef = db.collection('users').doc(uid);
  const snap = await db.collection('all_videos').where('userId', '==', uid).select('views').get();
  let white = 0;
  let grey = 0;
  snap.forEach((d) => {
    const v = Number(d.get('views') || 0);
    if (v >= WHITE_VIEWS) white += 1;
    if (v >= GREY_VIEWS) grey += 1;
  });
  const wantColor = grey >= NEEDED ? 'yellow' : white >= NEEDED ? 'white' : null;
  if (!wantColor) return;

  await db.runTransaction(async (tx) => {
    const us = await tx.get(userRef);
    if (!us.exists) return;
    const u = us.data() || {};
    if (u.banned === true) return;

    const cur = u.verified === true ? (u.verifiedColor === 'yellow' ? 'yellow' : 'white') : null;

    if (wantColor === 'yellow') {
      if (cur === 'yellow') return;
      if (u.greyAutoGranted === true) return; // admin ne hataya tha
    } else {
      if (cur) return; // pehle se koi tick hai
      if (u.whiteAutoGranted === true || u.greyAutoGranted === true) return; // admin ne hataya tha
    }

    const patch = { verified: true, verifiedColor: wantColor };
    if (wantColor === 'yellow') {
      patch.greyAutoGranted = true;
      patch.greyAutoGrantedAt = FieldValue.serverTimestamp();
    } else {
      patch.whiteAutoGranted = true;
      patch.whiteAutoGrantedAt = FieldValue.serverTimestamp();
    }
    tx.update(userRef, patch);
    tx.set(db.collection('verifiedGrants').doc(), {
      userId: uid,
      username: u.username || '',
      verified: true,
      color: wantColor,
      adminId: 'auto',
      auto: true,
      reason: wantColor === 'yellow' ? `${NEEDED} videos x ${GREY_VIEWS}+ views` : `${NEEDED} videos x ${WHITE_VIEWS}+ views`,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

exports.autoCreatorTick = onDocumentUpdated(
  { region: REGION, document: 'all_videos/{videoId}', maxInstances: 10, memory: '256MiB' },
  async (event) => {
    const b = event.data && event.data.before && event.data.before.data();
    const a = event.data && event.data.after && event.data.after.data();
    if (!b || !a) return;
    const bv = Number(b.views || 0);
    const av = Number(a.views || 0);
    const crossed = (t) => bv < t && av >= t;
    if (!crossed(WHITE_VIEWS) && !crossed(GREY_VIEWS)) return;
    try {
      await grantFor(a.userId);
    } catch (e) {
      console.error('autoCreatorTick error', e);
    }
  }
);

exports._grantFor = grantFor;
