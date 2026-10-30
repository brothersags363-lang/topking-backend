import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebaseConfig";

// null = checking, true = official, false = not official
export default function useIsOfficial() {
  const [isOfficial, setIsOfficial] = useState(null);

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;

      if (!user) {
        setIsOfficial(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (active) setIsOfficial(snap.exists() && snap.data().isOfficial === true);
      } catch (_) {
        if (active) setIsOfficial(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return isOfficial;
}
