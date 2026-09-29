import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "./firebaseConfig";

// Returns: null = checking, true = admin, false = not admin
export default function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(null);

  useEffect(() => {
    const check = async () => {
      const user = getAuth().currentUser;
      if (!user) return setIsAdmin(false);
      try {
        const snap = await getDoc(doc(db, "admins", user.uid));
        setIsAdmin(snap.exists() && snap.data().role === "admin");
      } catch (e) {
        setIsAdmin(false);
      }
    };
    check();
  }, []);

  return isAdmin;
}
