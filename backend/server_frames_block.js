// =====================================================
// ADMIN SPECIAL FRAMES
// - Admin kisi bhi user ko special frame de sakta hai (users/{uid}.adminFrame)
// - Ye purane level/agency/BD frames se alag hai, unhe nahi chhedta
// =====================================================
const ADMIN_FRAME_KEYS = ["gold_heart", "bd_helmet", "agency_ref", "agency_wings", "tk_team"];

function userBrief(id, d) {
  return {
    uid: id,
    username: d.username || "",
    name: d.name || d.realName || "",
    profileImg: d.profileImg || "",
    level: d.level || 1,
    adminFrame: d.adminFrame || null,
  };
}

// body: { q }  -> username prefix search (max 15)
app.post("/admin/search-users", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const q = cleanText(req.body && req.body.q, 40).toLowerCase().replace(/^@/, "");
    if (q.length < 1) return res.json({ success: true, users: [] });
    const snap = await db
      .collection("users")
      .where("username", ">=", q)
      .where("username", "<=", q + "\uf8ff")
      .orderBy("username")
      .limit(15)
      .get();
    return res.json({ success: true, users: snap.docs.map((d) => userBrief(d.id, d.data())) });
  } catch (e) {
    console.error("ADMIN SEARCH USERS ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// body: { uid, frame }  frame = key ya null/"" (hatane ke liye)
app.post("/admin/set-user-frame", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const uid = String((req.body && req.body.uid) || "");
    const frame = req.body && req.body.frame ? String(req.body.frame) : null;
    if (!isValidUid(uid)) {
      return res.status(400).json({ success: false, error: "Invalid user" });
    }
    if (frame !== null && !ADMIN_FRAME_KEYS.includes(frame)) {
      return res.status(400).json({ success: false, error: "Invalid frame" });
    }
    const ref = db.collection("users").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    await ref.set(
      { adminFrame: frame === null ? admin.firestore.FieldValue.delete() : frame },
      { merge: true }
    );
    return res.json({ success: true, uid, frame });
  } catch (e) {
    console.error("ADMIN SET FRAME ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// jin users ko abhi admin frame mila hua hai
app.post("/admin/list-framed-users", generalLimiter, verifyUser, requireAdminDoc, async (req, res) => {
  try {
    const snap = await db.collection("users").where("adminFrame", "in", ADMIN_FRAME_KEYS).limit(200).get();
    const users = snap.docs.map((d) => userBrief(d.id, d.data()));
    users.sort((a, b) => a.username.localeCompare(b.username));
    return res.json({ success: true, users });
  } catch (e) {
    console.error("ADMIN LIST FRAMED ERROR:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

