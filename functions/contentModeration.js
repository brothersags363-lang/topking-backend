'use strict';

// =====================================================================
// CONTENT MODERATION (server backstop)
//  1) Profile: name / username / bio me gali -> turant saaf kar deta hai
//  2) Video: caption / hashtag / subtitle me gali -> video hidden (feed me nahi aata)
// (Galat photo/video ka image check abhi band hai -- budget ke baad Vision API se jod sakte hain)
// =====================================================================

const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { findProfanity } = require('./profanity');

const db = getFirestore();
const REGION = 'us-central1'; // index.js ke REGION se SAME rakho
const OPTS = { region: REGION, maxInstances: 20 };

const looseHit = (text) => {
  const t = String(text || '');
  if (!t.trim()) return false;
  return findProfanity(t).found || findProfanity(t.replace(/[._\-]+/g, '')).found;
};

// ---------- USER: name / username / bio ----------
exports.moderateProfile = onDocumentWritten({ ...OPTS, document: 'users/{uid}' }, async (event) => {
  const after = event.data && event.data.after;
  if (!after || !after.exists) return;
  const before = event.data.before && event.data.before.exists ? event.data.before.data() : {};
  const d = after.data() || {};
  const fix = {};

  if (looseHit(d.name)) fix.name = looseHit(before.name) ? 'User' : before.name || 'User';
  if (looseHit(d.username)) {
    fix.username = looseHit(before.username) ? `user${event.params.uid.slice(0, 6).toLowerCase()}` : before.username;
  }
  if (looseHit(d.bioText)) fix.bioText = '';

  if (!Object.keys(fix).length) return; // saaf -> dobara write nahi (loop nahi)
  await after.ref.set({ ...fix, moderationFlaggedAt: Date.now() }, { merge: true });
  console.log('PROFILE CLEANED:', event.params.uid, Object.keys(fix).join(','));
});

// ---------- VIDEO: caption / hashtag / subtitle ----------
exports.moderateVideoPost = onDocumentCreated({ ...OPTS, document: 'all_videos/{videoId}' }, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const d = snap.data() || {};

  const texts = [d.caption, d.subtitleText, d.songName, d.musicName, ...(Array.isArray(d.hashtags) ? d.hashtags : [])];
  if (!texts.some(looseHit)) return;
  const reason = 'profanity';

  await snap.ref.set(
    { hidden: true, status: 'blocked', moderationReason: reason, moderationAt: Date.now() },
    { merge: true }
  );
  if (d.userId) {
    await db.collection('users').doc(d.userId)
      .set({ moderationStrikes: FieldValue.increment(1), lastModerationAt: Date.now() }, { merge: true })
      .catch(() => {});
  }
  console.log('VIDEO HIDDEN:', snap.id, reason);
});
