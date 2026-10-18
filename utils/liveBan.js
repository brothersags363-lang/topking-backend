// Official ne live entry / live start ban lagaya ho to user ko turant bahar karta hai.
// Ban liveBans/{uid} me rehta hai (sirf server likhta hai). Asli rok server /token par hai,
// ye hook sirf achha message dikhane aur chalte hue user ko nikalne ke liye hai.
import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../app/firebaseConfig";

export function formatBanUntil(ms) {
  try {
    return new Date(ms).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return String(ms);
  }
}

export function banDaysLeft(ms) {
  const left = Number(ms) - Date.now();
  if (!(left > 0)) return 0;
  return Math.ceil(left / (24 * 60 * 60 * 1000));
}

/**
 * isHost = true  -> "live chalana" ban check
 * isHost = false -> "live room entry" ban check
 * onKick (optional) -> bahar nikalne ka apna function (jaise handleRoomEnded).
 *                      Na do to router.replace("/") hota hai.
 */
export function useLiveBanGuard(isHost, onKick) {
  const router = useRouter();
  const kickRef = useRef(onKick);
  kickRef.current = onKick;
  const shownRef = useRef(false);

  useEffect(() => {
    const uid = auth && auth.currentUser && auth.currentUser.uid;
    if (!uid) return undefined;
    shownRef.current = false;

    const unsub = onSnapshot(
      doc(db, "liveBans", uid),
      (snap) => {
        if (!snap.exists() || shownRef.current) return;
        const d = snap.data() || {};
        const until = Number(isHost ? d.liveBanUntil : d.entryBanUntil) || 0;
        if (until <= Date.now()) return;

        shownRef.current = true;
        Alert.alert(
          isHost ? "Live band hai" : "Live room entry band hai",
          isHost
            ? `Aap ${formatBanUntil(until)} tak live nahi chala sakte.`
            : `Aap ${formatBanUntil(until)} tak live room me nahi ja sakte.`
        );
        try {
          if (typeof kickRef.current === "function") kickRef.current();
          else router.replace("/");
        } catch (_) {
          try { router.replace("/"); } catch (__) {}
        }
      },
      () => {}
    );
    return () => unsub();
  }, [isHost]);
}
