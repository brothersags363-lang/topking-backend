// backend/liveList.js
// =====================================================================
// LIVE LIST CACHE  ->  GET /live/list
//
// PEHLE: har phone Firestore `rooms` collection ko seedha sunta tha. Ek room ka
//        har write (heartbeat, viewerCount, gift star) har phone ke liye 1 read tha.
//        300-400 users x kai rooms x har minute ke writes = karodon reads.
// AB:    SERVER ek hi baar rooms sunta hai (sirf badlav par read lagta hai) aur list
//        memory me rakhta hai. Phone har ~15 sec me yahi list le leta hai.
//        Firestore reads ab users ki ginti par nahi, sirf room ke badlav par lagte hain.
//
// Server.js me bas 2 line:
//   const registerLiveList = require("./liveList");
//   registerLiveList(app, { admin, db });
// =====================================================================

const ONE_DAY = 24 * 60 * 60 * 1000;
const HB_TIMEOUT = 10 * 60 * 1000;      // host heartbeat 10 min se purana => live khatam
const REBUILD_MS = 3000;                 // payload max 3 sec purana
const RESUBSCRIBE_MS = 60 * 60 * 1000;   // `since` cutoff ko taaza rakhne ke liye har ghante
const PER_USER_PER_MIN = 30;             // ek user ek minute me max 30 baar

const ms = (v) => {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v._seconds === "number") return v._seconds * 1000;
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return 0;
};

// Sirf wahi fields jo list/cards ko chahiye (poora room doc nahi => payload chhota)
function trim(id, d) {
  const hostId = d.hostId || (d.seatsData && d.seatsData.seat_1 && d.seatsData.seat_1.userId) || null;
  const out = {
    id,
    hostId,
    status: d.status || null,
    roomType: d.roomType || "public",
    isFamily: !!(d.isFamily || d.familyId),
    type: d.type || "audio",
    roomLayout: d.roomLayout || "chat",
    title: d.title || null,
    roomName: d.roomName || null,
    hostName: d.hostName || d.host || null,
    hostImg: d.hostImg || null,
    profileImg: d.profileImg || null,
    roomCover: d.roomCover || null,
    cover: d.cover || null,
    banner: d.banner || null,
    roomImg: d.roomImg || null,
    viewerCount: Number(d.viewerCount) || 0,
    createdAt: ms(d.createdAt),
    hostHeartbeat: ms(d.hostHeartbeat),
    lastHeartbeat: ms(d.lastHeartbeat),
  };
  // sirf host ke stars (sort ke liye)
  if (hostId && d.seatStars && d.seatStars[hostId] != null) {
    out.seatStars = { [hostId]: Number(d.seatStars[hostId]) || 0 };
  }
  // sirf 9 seat, aur har seat ke 3 field
  const seats = {};
  const sd = d.seatsData || {};
  Object.keys(sd)
    .sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]))
    .slice(0, 9)
    .forEach((k) => {
      const s = sd[k] || {};
      seats[k] = { userId: s.userId || null, userImg: s.userImg || null, isMuted: !!s.isMuted };
    });
  out.seatsData = seats;
  return out;
}

function isAlive(r, now) {
  const st = r.status ? String(r.status).toLowerCase().trim() : "";
  if (st === "ended" || st === "inactive" || st === "closed") return false;
  const rt = String(r.roomType || "public").toLowerCase();
  if (rt !== "public" && rt !== "family" && !r.isFamily) return false;
  const hb = r.hostHeartbeat || r.lastHeartbeat;
  if (hb && now - hb > HB_TIMEOUT) return false;
  if (r.createdAt && now - r.createdAt > ONE_DAY) return false;
  return true;
}

module.exports = function registerLiveList(app, { admin, db }) {
  const Timestamp = admin.firestore.Timestamp;
  const maps = { num: new Map(), ts: new Map() };
  let unsubs = [];
  let ready = false;
  let payload = null;
  let builtAt = 0;
  let dirty = true;

  const apply = (key) => (snap) => {
    const m = maps[key];
    snap.docChanges().forEach((c) => {
      if (c.type === "removed") m.delete(c.doc.id);
      else m.set(c.doc.id, trim(c.doc.id, c.doc.data()));
    });
    ready = true;
    dirty = true;
  };

  function subscribe() {
    unsubs.forEach((u) => { try { u(); } catch (_) {} });
    unsubs = [];
    maps.num.clear();
    maps.ts.clear();
    const since = Date.now() - ONE_DAY;
    const fail = (key) => (err) => {
      console.error("liveList listener error (" + key + "):", err && err.code);
      setTimeout(subscribe, 10000); // 10 sec baad dobara
    };
    unsubs.push(
      db.collection("rooms").where("createdAt", ">", since).onSnapshot(apply("num"), fail("num")),
      db.collection("rooms").where("createdAt", ">", Timestamp.fromMillis(since)).onSnapshot(apply("ts"), fail("ts"))
    );
  }
  subscribe();
  setInterval(subscribe, RESUBSCRIBE_MS).unref();

  function build() {
    const now = Date.now();
    const all = new Map();
    maps.ts.forEach((v, k) => all.set(k, v));
    maps.num.forEach((v, k) => all.set(k, v));
    const rooms = [];
    all.forEach((r) => { if (isAlive(r, now)) rooms.push(r); });
    payload = JSON.stringify({ success: true, t: now, rooms });
    builtAt = now;
    dirty = false;
  }

  // hafka verify: sirf token signature (network/Firestore call nahi). List private data nahi hai,
  // bas bahari scrapers ko rokne ke liye login-token maanga jata hai.
  const hits = new Map();
  setInterval(() => hits.clear(), 60 * 1000).unref();

  app.get("/live/list", async (req, res) => {
    try {
      const h = req.headers.authorization;
      if (!h || typeof h !== "string" || !h.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "Authentication required" });
      }
      const decoded = await admin.auth().verifyIdToken(h.slice(7).trim());
      const n = (hits.get(decoded.uid) || 0) + 1;
      hits.set(decoded.uid, n);
      if (n > PER_USER_PER_MIN) {
        return res.status(429).json({ success: false, error: "Too many requests" });
      }
      if (!ready) return res.status(503).json({ success: false, error: "Warming up" });
      if (dirty || !payload || Date.now() - builtAt > REBUILD_MS) {
        if (Date.now() - builtAt > REBUILD_MS || !payload) build();
      }
      res.set("Cache-Control", "private, max-age=5");
      res.type("application/json").send(payload);
    } catch (err) {
      return res.status(401).json({ success: false, error: "Authentication failed" });
    }
  });
};
