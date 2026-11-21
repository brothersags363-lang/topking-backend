// backend/liveSocket.js
// =====================================================================
// LIVE REALTIME (likes + viewer count)  ->  Socket.IO, path "/rt"
//
// PEHLE: har like (batch) room doc me likes:increment likhta tha. Room doc ko HAR viewer sunta hai,
//        isliye 1 write = (room me jitne log) reads. 300 viewers aur 50 log like dabate => har sec hazaron reads.
//        viewerCount bhi isi doc me tha.
// AB:    like / viewer count seedha socket se doosre phones tak jata hai (Firestore chhua hi nahi).
//        Server memory me ginta hai aur har 15 sec me ek hi write karta hai:
//            rooms/{id}.likes += (pending), rooms/{id}.viewerCount = (count)
//        => 1 write / 15 sec / room, chahe 10 log ho ya 10,000.
//
// Gift / stars ka paisa yahan nahi aata (wo /live/gift server transaction me hai).
// Socket na chale to app purane Firestore raste par wapas chali jati hai (fallback), kuch toota nahi.
//
// server.js me (server = app.listen(...) ke BAAD):
//   try { require("./liveSocket")({ server, admin, db }); } catch (e) { console.error(e.message); }
// Install:  npm i socket.io
// =====================================================================

const ROOM_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;
const FLUSH_MS = 15 * 1000;       // Firestore write itne gap par
const VIEWERS_MS = 3 * 1000;      // viewer count broadcast itne gap par (sirf badlav par)
const MAX_ROOMS_PER_SOCKET = 3;   // main room + PK opponent ke liye jagah
const MAX_LIKES_PER_EVENT = 30;
const LIKE_BURST = 80;            // ek socket ke liye bucket
const LIKE_REFILL_PER_SEC = 30;

// ---------------------------------------------------------------------
// Room ginti (pure logic: socket.io ke bina test ho sakta hai)
// ---------------------------------------------------------------------
class RoomRegistry {
  constructor() {
    this.rooms = new Map(); // roomId -> { viewers: Map(uid -> sockets), hosts: Map(uid -> sockets), pendingLikes, lastWrittenViewers, viewersSent, dirty }
  }

  _room(roomId) {
    let r = this.rooms.get(roomId);
    if (!r) {
      r = { viewers: new Map(), hosts: new Map(), pendingLikes: 0, lastWrittenViewers: -1, viewersSent: -1, dirty: false };
      this.rooms.set(roomId, r);
    }
    return r;
  }

  // Ek hi user ke kai socket (reconnect, 2 tab) = 1 viewer. Host ginti me nahi.
  join(roomId, uid, isHost, socketId) {
    const r = this._room(roomId);
    const bucket = isHost ? r.hosts : r.viewers;
    let set = bucket.get(uid);
    if (!set) { set = new Set(); bucket.set(uid, set); }
    set.add(socketId);
    r.dirty = true;
    return this.viewerCount(roomId);
  }

  leave(roomId, uid, socketId) {
    const r = this.rooms.get(roomId);
    if (!r) return;
    [r.viewers, r.hosts].forEach((bucket) => {
      const set = bucket.get(uid);
      if (!set) return;
      set.delete(socketId);
      if (set.size === 0) bucket.delete(uid);
    });
    r.dirty = true;
  }

  viewerCount(roomId) {
    const r = this.rooms.get(roomId);
    if (!r) return 0;
    let n = 0;
    r.viewers.forEach((_s, uid) => { if (!r.hosts.has(uid)) n += 1; });
    return n;
  }

  addLikes(roomId, n) {
    const r = this.rooms.get(roomId);
    if (!r) return;
    r.pendingLikes += n;
  }

  // Broadcast ke liye: jin rooms ka count badla, unki list { roomId, n }
  takeViewerUpdates() {
    const out = [];
    this.rooms.forEach((r, roomId) => {
      if (!r.dirty) return;
      r.dirty = false;
      const n = this.viewerCount(roomId);
      if (n !== r.viewersSent) {
        r.viewersSent = n;
        out.push({ roomId, n });
      }
    });
    return out;
  }

  // Firestore flush ke liye: sirf jahan kuch badla ho
  takeFlush(roomId) {
    const r = this.rooms.get(roomId);
    if (!r) return null;
    const viewers = this.viewerCount(roomId);
    const likes = r.pendingLikes;
    const viewersChanged = viewers !== r.lastWrittenViewers;
    if (likes === 0 && !viewersChanged) return null;
    r.pendingLikes = 0;
    r.lastWrittenViewers = viewers;
    return { likes, viewers, viewersChanged };
  }

  // flush fail hua => likes wapas jod do (viewers agli baar phir likhega)
  giveBack(roomId, likes) {
    const r = this.rooms.get(roomId);
    if (r) { r.pendingLikes += likes; r.lastWrittenViewers = -1; }
  }

  isEmpty(roomId) {
    const r = this.rooms.get(roomId);
    return !r || (r.viewers.size === 0 && r.hosts.size === 0);
  }

  drop(roomId) {
    this.rooms.delete(roomId);
  }

  ids() {
    return [...this.rooms.keys()];
  }
}

// ---------------------------------------------------------------------
// Per-socket like bucket (spam / modified app se bachav)
// ---------------------------------------------------------------------
function takeLikes(bucket, want, now) {
  const elapsed = Math.max(0, now - bucket.at) / 1000;
  bucket.tokens = Math.min(LIKE_BURST, bucket.tokens + elapsed * LIKE_REFILL_PER_SEC);
  bucket.at = now;
  const give = Math.min(want, Math.floor(bucket.tokens));
  bucket.tokens -= give;
  return give;
}

function register({ server, admin, db }) {
  let Server;
  try {
    ({ Server } = require("socket.io"));
  } catch (e) {
    console.warn("LIVE SOCKET: socket.io install nahi hai (npm i socket.io) - realtime band, app Firestore par chalegi");
    return null;
  }

  const FieldValue = admin.firestore.FieldValue;
  const reg = new RoomRegistry();

  const io = new Server(server, {
    path: "/rt",
    transports: ["websocket"],
    cors: { origin: "*" },
    maxHttpBufferSize: 2 * 1024,
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Login: Firebase ID token (har connect / reconnect par naya)
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (typeof token !== "string" || token.length < 20 || token.length > 10000) {
        return next(new Error("auth"));
      }
      const decoded = await admin.auth().verifyIdToken(token);
      if (!decoded || !decoded.uid) return next(new Error("auth"));
      socket.data.uid = decoded.uid;
      socket.data.rooms = new Set();
      socket.data.bucket = { tokens: LIKE_BURST, at: Date.now() };
      return next();
    } catch (_) {
      return next(new Error("auth"));
    }
  });

  io.on("connection", (socket) => {
    const uid = socket.data.uid;

    socket.on("join", (msg, ack) => {
      try {
        const roomId = msg && msg.roomId;
        if (typeof roomId !== "string" || !ROOM_ID_RE.test(roomId)) return ack && ack({ ok: false });
        if (!socket.data.rooms.has(roomId) && socket.data.rooms.size >= MAX_ROOMS_PER_SOCKET) {
          return ack && ack({ ok: false, error: "too-many-rooms" });
        }
        socket.join("r:" + roomId);
        socket.data.rooms.add(roomId);
        const n = reg.join(roomId, uid, !!(msg && msg.host), socket.id);
        if (ack) ack({ ok: true, viewers: n });
      } catch (_) {
        if (ack) ack({ ok: false });
      }
    });

    socket.on("leave", (msg) => {
      try {
        const roomId = msg && msg.roomId;
        if (typeof roomId !== "string" || !socket.data.rooms.has(roomId)) return;
        socket.leave("r:" + roomId);
        socket.data.rooms.delete(roomId);
        reg.leave(roomId, uid, socket.id);
      } catch (_) {}
    });

    // like: {roomId, n}. Baaki sabko turant; sender ko wapas nahi (wo apne phone par pehle hi dikha chuka).
    socket.on("like", (msg) => {
      try {
        const roomId = msg && msg.roomId;
        if (typeof roomId !== "string" || !socket.data.rooms.has(roomId)) return;
        const want = Math.floor(Number(msg.n));
        if (!Number.isFinite(want) || want < 1) return;
        const n = takeLikes(socket.data.bucket, Math.min(want, MAX_LIKES_PER_EVENT), Date.now());
        if (n < 1) return;
        socket.to("r:" + roomId).volatile.emit("like", { n });
        reg.addLikes(roomId, n);
      } catch (_) {}
    });

    socket.on("disconnect", () => {
      try {
        socket.data.rooms.forEach((roomId) => reg.leave(roomId, uid, socket.id));
        socket.data.rooms.clear();
      } catch (_) {}
    });
  });

  // viewer count: sirf badla ho tab, har 3 sec
  setInterval(() => {
    try {
      reg.takeViewerUpdates().forEach(({ roomId, n }) => {
        io.to("r:" + roomId).emit("viewers", { n });
      });
    } catch (e) {
      console.error("LIVE SOCKET viewers error:", e && e.message);
    }
  }, VIEWERS_MS).unref();

  // Firestore: har 15 sec me ek write / room. Room doc na ho (live khatam) to chupchap chhod do.
  async function flushRoom(roomId) {
    const f = reg.takeFlush(roomId);
    if (!f) return;
    const patch = {};
    if (f.likes > 0) patch.likes = FieldValue.increment(f.likes);
    if (f.viewersChanged) patch.viewerCount = f.viewers;
    try {
      await db.collection("rooms").doc(roomId).update(patch); // update: ended room dobara nahi banta
    } catch (e) {
      if (e && (e.code === 5 || /NOT_FOUND/i.test(String(e.message)))) {
        reg.drop(roomId); // room doc gaya => ginti bhi saaf
      } else {
        reg.giveBack(roomId, f.likes);
        console.error("LIVE SOCKET flush error:", roomId, e && (e.code || e.message));
      }
    }
  }

  setInterval(async () => {
    const ids = reg.ids();
    for (const roomId of ids) {
      await flushRoom(roomId);
      if (reg.isEmpty(roomId)) reg.drop(roomId);
    }
  }, FLUSH_MS).unref();

  console.log("LIVE SOCKET ready on /rt");
  return io;
}

module.exports = register;
module.exports.RoomRegistry = RoomRegistry;
module.exports.takeLikes = takeLikes;
