// Username ke baad dikhne wala tick — poore app me ek hi jagah se.
//
// Rules:
//  1. Admin ne verified tick (white / yellow) diya hai  -> sirf wahi tick dikhega
//  2. Tick nahi mila par face/ID verification complete  -> chhota "person" tick dikhega (Tiki jaisa)
//  3. Dono nahi -> kuch nahi
//
// Use:  <UserTick verified={x.verified} verifiedColor={x.verifiedColor} faceVerified={x.faceVerified} size={17} />
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../app/firebaseConfig";

// user doc (faceStatus) ya already-mapped item (faceVerified) dono se chalta hai
export const isFaceVerified = (d) =>
  !!d &&
  (d.faceVerified === true ||
    d.faceStatus === "submitted" ||
    d.faceStatus === "approved");

// ---- uid se user ka asli status (admin tick + face tick) ----
// Live room / feed / list me jo `verified` flag aata hai wo purana ya adhura ho sakta hai.
// Isliye uid mile to user ka record ek baar padhte hain (10 min cache, har uid ka 1 read):
//   admin tick (white/yellow) hai  -> sirf wahi, face tick kabhi nahi
//   admin tick nahi + face done    -> face tick
const TTL = 10 * 60 * 1000;
const cache = new Map(); // uid -> { face, verified, color, t }
const inflight = new Map(); // uid -> Promise<info>
const UID_RE = /^[A-Za-z0-9]{20,40}$/; // seat_1 / host jaise fake ids pe read nahi

const fetchInfo = (uid) => {
  const c = cache.get(uid);
  if (c && Date.now() - c.t < TTL) return Promise.resolve(c);
  if (inflight.has(uid)) return inflight.get(uid);
  const p = getDoc(doc(db, "users", uid))
    .then((snap) => {
      const d = snap.exists() ? snap.data() : null;
      const info = {
        face: isFaceVerified(d),
        verified: d?.verified === true,
        color: d?.verifiedColor === "yellow" ? "yellow" : "white",
        t: Date.now(),
      };
      cache.set(uid, info);
      return info;
    })
    .catch(() => null)
    .finally(() => inflight.delete(uid));
  inflight.set(uid, p);
  return p;
};

const isUid = (uid) => typeof uid === "string" && UID_RE.test(uid);

function useUserInfo(uid) {
  const valid = isUid(uid);
  const [info, setInfo] = useState(() => (valid ? cache.get(uid) || null : null));
  useEffect(() => {
    if (!valid) { setInfo(null); return; }
    let alive = true;
    fetchInfo(uid).then((r) => alive && r && setInfo(r));
    return () => { alive = false; };
  }, [uid, valid]);
  return info;
}

function UserTick({
  uid,
  verified,
  verifiedColor,
  faceVerified,
  size = 17,
  whiteColor = "#ffffff",
  style,
}) {
  // Props me admin tick already hai to record padhne ki zarurat nahi
  const info = useUserInfo(verified ? null : uid);
  const lookup = !verified && isUid(uid); // record se check hoga

  const adminOn = !!verified || (lookup && info?.verified === true);
  const color = verified ? verifiedColor : info?.color;

  // 1) Admin tick (white / yellow) — iske saath face tick KABHI nahi
  if (adminOn) {
    return (
      <MaterialCommunityIcons
        name="check-decagram"
        size={size}
        color={color === "yellow" ? "#FFD700" : whiteColor}
        style={[{ marginLeft: 4 }, style]}
      />
    );
  }

  // 2) Face / ID verified tick — record aane tak ruko, taaki galat tick na chamke
  const faceOn = lookup ? info?.face === true : !!faceVerified;
  if (faceOn) {
    const box = Math.round(size * 0.95);
    return (
      <View
        style={[
          {
            marginLeft: 4,
            width: box,
            height: box,
            borderRadius: Math.max(3, Math.round(box * 0.25)),
            borderWidth: 1.5,
            borderColor: "#c8c8cc",
            justifyContent: "center",
            alignItems: "center",
          },
          style,
        ]}
      >
        <Ionicons name="person" size={Math.round(box * 0.6)} color="#c8c8cc" />
      </View>
    );
  }

  return null;
}

export default React.memo(UserTick);
