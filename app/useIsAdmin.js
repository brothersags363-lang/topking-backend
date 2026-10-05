
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebaseConfig";

// null = checking, true = admin, false = not admin

export default function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(null);

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;

      setIsAdmin(null);

      if (!user) {
        setIsAdmin(false);
        return;
      }

      try {
        const snap = await getDoc(
          doc(db, "admins", user.uid)
        );

        if (active) {
          setIsAdmin(
            snap.exists() && snap.data().role === "admin"
          );
        }
      } catch (error) {
        if (active) setIsAdmin(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return isAdmin;
}