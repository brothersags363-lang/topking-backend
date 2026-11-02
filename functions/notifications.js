'use strict';

// =====================================================================
// PUSH NOTIFICATIONS (FCM) - Firestore triggers
//
// Pehle app "/notify/live-started" jaise Render server routes ko call karta tha,
// lekin wo routes server.js me the hi nahi (aur Render free plan so jata hai = late/miss).
// Ab sab kuch yahin se: Firestore me doc bante hi push chala jata hai.
// App ko koi extra call nahi karni -> fast + smooth.
//
//   rooms/{roomId}                                  -> host ke followers ko "LIVE aa gaya"
//   all_videos/{videoId}/likes/{uid}                -> video owner ko "X ne like kiya"
//   all_videos/{videoId}/comments/{id}              -> video owner ko "X ne comment kiya"
//   all_videos/{videoId}/comments/{id}/replies/{id} -> comment ke owner ko "X ne reply kiya"
//   chats/{chatId}/messages/{id}  (type video/live) -> receiver ko "X ne video / live room share kiya"
//   follows/{id}                                    -> jisko follow kiya use "X ne follow kiya"
//
// Deploy:  firebase deploy --only functions
// =====================================================================

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { findProfanity } = require('./profanity');

// REGION wahi rakho jo index.js me hai (aur jo Firestore database ki location hai).
const REGION = 'us-central1';
const OPTS = { region: REGION, maxInstances: 20 };

const SHARE_PUSH_FROM_FUNCTION = false; // true karoge to share push function se bhi jayega (app wale ke saath duplicate hoga)
const MAX_FOLLOWERS = 5000;           // ek live par max itne followers ko push
const FCM_BATCH = 500;                // sendEachForMulticast ki limit
const GET_ALL_BATCH = 300;            // db.getAll ek baar me itne docs
const BAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

const db = () => getFirestore();

// ---------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------
const isStr = (v) => typeof v === 'string' && v.length > 0;
const clip = (s, n) => {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
// FCM data me sirf string values ja sakti hain
const toData = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    out[k] = String(v).slice(0, 500);
  }
  return out;
};

async function getUser(uid) {
  if (!isStr(uid)) return {};
  try {
    const snap = await db().doc(`users/${uid}`).get();
    return snap.exists ? snap.data() || {} : {};
  } catch (e) {
    return {};
  }
}
const nameOf = (u) => clip(u.username || u.name || u.displayName || 'Someone', 40);

// uids -> [{ uid, token }]  (sirf fcmToken field padhta hai = sasta + fast)
async function tokensForUids(uids) {
  const unique = [...new Set(uids.filter(isStr))];
  const out = [];
  for (let i = 0; i < unique.length; i += GET_ALL_BATCH) {
    const refs = unique.slice(i, i + GET_ALL_BATCH).map((uid) => db().doc(`users/${uid}`));
    if (!refs.length) continue;
    const snaps = await db().getAll(...refs, { fieldMask: ['fcmToken'] });
    for (const s of snaps) {
      const token = s.exists ? s.get('fcmToken') : null;
      if (isStr(token) && token.length < 5000) out.push({ uid: s.id, token });
    }
  }
  return out;
}

async function dropBadToken(uid, token) {
  try {
    const ref = db().doc(`users/${uid}`);
    const snap = await ref.get();
    if (snap.exists && snap.get('fcmToken') === token) {
      await ref.update({ fcmToken: FieldValue.delete() });
    }
  } catch (e) {}
}

/**
 * entries: [{uid, token}]
 * msg: { title, body, data, channelId, tag, ttlMs }
 */
async function push(entries, msg) {
  const seen = new Set();
  const list = entries.filter((e) => e && isStr(e.token) && !seen.has(e.token) && seen.add(e.token));
  if (!list.length) return { sent: 0, failed: 0 };

  const payload = {
    notification: { title: clip(msg.title, 100), body: clip(msg.body, 160) },
    data: toData(msg.data),
    android: {
      // Phone so raha ho / app band ho tab bhi turant pahunchao
      priority: 'high',
      ttl: msg.ttlMs || 24 * 60 * 60 * 1000,
      notification: {
        channelId: msg.channelId || 'activity', // client _layout.tsx me ye channels bante hain
        sound: 'default',
        tag: msg.tag || undefined,              // same tag = purana notification replace (spam nahi)
        defaultVibrateTimings: true,
        notificationPriority: 'PRIORITY_MAX',
        visibility: 'PRIVATE',
      },
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: { aps: { sound: 'default', ...(msg.tag ? { 'thread-id': msg.tag } : {}) } },
    },
  };

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < list.length; i += FCM_BATCH) {
    const chunk = list.slice(i, i + FCM_BATCH);
    try {
      const res = await getMessaging().sendEachForMulticast({ ...payload, tokens: chunk.map((e) => e.token) });
      sent += res.successCount;
      failed += res.failureCount;
      await Promise.all(
        res.responses.map((r, idx) =>
          !r.success && r.error && BAD_TOKEN_CODES.has(r.error.code)
            ? dropBadToken(chunk[idx].uid, chunk[idx].token)
            : null
        )
      );
    } catch (e) {
      failed += chunk.length;
      console.error('PUSH BATCH FAILED:', e && (e.code || e.message));
    }
  }
  console.log(`PUSH ${msg.data && msg.data.type}: sent=${sent} failed=${failed}`);
  return { sent, failed };
}

const pushToUser = async (uid, msg) => push(await tokensForUids([uid]), msg);

const isProfane = (text) => {
  try {
    return isStr(text) && findProfanity(text).found;
  } catch (e) {
    return false;
  }
};

// ---------------------------------------------------------------------
// 1) LIVE START -> host ke followers
// ---------------------------------------------------------------------
exports.pushOnLiveStart = onDocumentCreated({ ...OPTS, document: 'rooms/{roomId}' }, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const room = snap.data() || {};
  const roomId = event.params.roomId;
  const hostId = room.hostId;

  if (!isStr(hostId)) return;
  if (String(room.status || 'active').toLowerCase() !== 'active') return;
  // Private room sabko nahi dikhana
  if (room.roomType === 'private' || room.isPrivate === true) return;

  const followSnap = await db()
    .collection('follows')
    .where('followingId', '==', hostId)
    .select('followerId')
    .limit(MAX_FOLLOWERS)
    .get();

  const followerIds = followSnap.docs.map((d) => d.get('followerId')).filter((id) => isStr(id) && id !== hostId);
  if (!followerIds.length) return;

  const hostName = clip(room.hostName || nameOf(await getUser(hostId)), 40);
  const entries = await tokensForUids(followerIds);

  await push(entries, {
    title: `${hostName} is LIVE now 🔴`,
    body: clip(room.title, 80) || 'Tap to join the live room',
    channelId: 'live',
    tag: `live_${roomId}`,
    ttlMs: 10 * 60 * 1000, // purani live ka notification baad me bekaar hai
    data: { type: 'live', roomId, hostId, senderUid: hostId, senderName: hostName },
  });
});

// ---------------------------------------------------------------------
// 2) VIDEO LIKE -> video owner  (+ Messages > Likes me row)
// ---------------------------------------------------------------------
exports.pushOnVideoLike = onDocumentCreated(
  { ...OPTS, document: 'all_videos/{videoId}/likes/{likerId}' },
  async (event) => {
    const { videoId, likerId } = event.params;
    const videoSnap = await db().doc(`all_videos/${videoId}`).get();
    if (!videoSnap.exists) return;
    const video = videoSnap.data() || {};
    const ownerId = video.userId;
    if (!isStr(ownerId) || ownerId === likerId) return;

    const liker = await getUser(likerId);
    const name = nameOf(liker);

    // In-app notification (Messages > Likes). Fixed doc id => dobara trigger chale to duplicate nahi.
    await db()
      .doc(`users/${ownerId}/notifications/like_${videoId}_${likerId}`)
      .set(
        {
          type: 'like',
          isRead: false,
          senderId: likerId,
          senderName: name,
          senderPhoto: liker.profileImg || liker.profile || '',
          videoId,
          videoCaption: video.caption || '',
          videoThumbnail: video.thumbnail || video.videoThumbnail || '',
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch(() => {});

    await pushToUser(ownerId, {
      title: 'New like ❤️',
      body: `${name} liked your video`,
      channelId: 'activity',
      tag: `like_${videoId}`,
      data: { type: 'video_like', videoId, senderUid: likerId, senderName: name },
    });
  }
);

// ---------------------------------------------------------------------
// 3) COMMENT -> video owner
// ---------------------------------------------------------------------
exports.pushOnComment = onDocumentCreated(
  { ...OPTS, document: 'all_videos/{videoId}/comments/{commentId}' },
  async (event) => {
    const { videoId, commentId } = event.params;
    const c = (event.data && event.data.data()) || {};
    const commenterId = c.userId;
    if (!isStr(commenterId) || !isStr(c.text) || isProfane(c.text)) return;

    const videoSnap = await db().doc(`all_videos/${videoId}`).get();
    if (!videoSnap.exists) return;
    const ownerId = (videoSnap.data() || {}).userId;
    if (!isStr(ownerId) || ownerId === commenterId) return;

    const name = clip(c.username || nameOf(await getUser(commenterId)), 40);

    await pushToUser(ownerId, {
      title: `${name} commented 💬`,
      body: clip(c.text, 100),
      channelId: 'activity',
      tag: `comment_${videoId}_${commentId}`,
      data: { type: 'comment', videoId, commentId, senderUid: commenterId, senderName: name },
    });
  }
);

// ---------------------------------------------------------------------
// 4) REPLY -> jis comment ka reply hai uske owner ko
// ---------------------------------------------------------------------
exports.pushOnReply = onDocumentCreated(
  { ...OPTS, document: 'all_videos/{videoId}/comments/{commentId}/replies/{replyId}' },
  async (event) => {
    const { videoId, commentId, replyId } = event.params;
    const r = (event.data && event.data.data()) || {};
    const replierId = r.userId;
    if (!isStr(replierId) || !isStr(r.text) || isProfane(r.text)) return;

    const parent = await db().doc(`all_videos/${videoId}/comments/${commentId}`).get();
    if (!parent.exists) return;
    const targetId = (parent.data() || {}).userId;
    if (!isStr(targetId) || targetId === replierId) return;

    const name = clip(r.username || nameOf(await getUser(replierId)), 40);

    await pushToUser(targetId, {
      title: `${name} replied to your comment`,
      body: clip(r.text, 100),
      channelId: 'activity',
      tag: `reply_${commentId}_${replyId}`,
      data: { type: 'comment', videoId, commentId, senderUid: replierId, senderName: name },
    });
  }
);

// ---------------------------------------------------------------------
// 5) VIDEO / LIVE ROOM SHARE (chat message type video|live) -> receiver
//    (text/photo wale message ka push purana /send-message-notification hi bhejta hai)
// ---------------------------------------------------------------------
exports.pushOnShare = onDocumentCreated({ ...OPTS, document: 'chats/{chatId}/messages/{msgId}' }, async (event) => {
  const m = (event.data && event.data.data()) || {};
  // Share push ab app se (ShareVideo.js -> /send-message-notification) jata hai; duplicate se bachne ke liye yahan band.
  if (!SHARE_PUSH_FROM_FUNCTION) return;
  if (m.type !== 'video' && m.type !== 'live') return;
  // chat.tsx ke apne media message ("type: video" + mediaUrl) ka push already /send-message-notification se jata hai
  if (m.type === 'video' && !m.videoId) return;
  if (m.type === 'live' && !m.roomId) return;

  const senderId = m.senderId;
  const receiverId = m.receiverId;
  if (!isStr(senderId) || !isStr(receiverId) || senderId === receiverId) return;

  const name = nameOf(await getUser(senderId));

  if (m.type === 'live') {
    await pushToUser(receiverId, {
      title: `${name} shared a live room 🔴`,
      body: 'Tap to join the live now',
      channelId: 'live',
      tag: `share_${senderId}`,
      ttlMs: 30 * 60 * 1000,
      data: { type: 'live_share', roomId: m.roomId, senderUid: senderId, senderName: name },
    });
    return;
  }

  await pushToUser(receiverId, {
    title: `${name} sent you a video 🎥`,
    body: clip(m.caption, 80) || 'Tap to watch',
    channelId: 'messages',
    tag: `share_${senderId}`,
    data: { type: 'video_share', videoId: m.videoId, senderUid: senderId, senderName: name },
  });
});

// ---------------------------------------------------------------------
// 6) FOLLOW -> jisko follow kiya
// ---------------------------------------------------------------------
exports.pushOnFollow = onDocumentCreated({ ...OPTS, document: 'follows/{followId}' }, async (event) => {
  const f = (event.data && event.data.data()) || {};
  const { followerId, followingId } = f;
  if (!isStr(followerId) || !isStr(followingId) || followerId === followingId) return;

  const name = nameOf(await getUser(followerId));

  await pushToUser(followingId, {
    title: 'New follower 👤',
    body: `${name} started following you`,
    channelId: 'activity',
    tag: `follow_${followerId}`,
    data: { type: 'follow', senderUid: followerId, senderName: name },
  });
});
