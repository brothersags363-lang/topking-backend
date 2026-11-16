// utils/usernameGate.js
// Live room / video live me entry sirf tab jab user ka username likha ho.
//
//   userHasUsername(userData)  -> true/false (users/{uid} ka data de do)
//   hasUsernameCached()        -> sync; true sirf tab jab pehle confirm ho chuka ho (tap smooth rakhne ke liye)
//   checkUsername()            -> async, true/false (cache + Firestore)
//   ensureUsername()           -> async; username nahi ho to alert + Edit Profile kholta hai, false deta hai
//
// NOTE: EDIT_PROFILE_ROUTE apne app ke Edit Profile ke route se match karo.

import { Alert } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';

let db = null;
let auth = null;
try {
  const m = require('../firebaseConfig');
  db = m.db;
  auth = m.auth;
} catch (e) {
  try {
    const m2 = require('../app/firebaseConfig');
    db = m2.db;
    auth = m2.auth;
  } catch (err) {
    __DEV__ && console.log('usernameGate: firebaseConfig not found');
  }
}

export const EDIT_PROFILE_ROUTE = '/editprofile'; // <- apna sahi route

// Sirf "haan" cache hota hai (username ek baar set ho gaya to khali nahi hota)
let okUid = null;

export function userHasUsername(d) {
  if (!d) return false;
  return (
    typeof d.username === 'string' &&
    d.username.trim() !== '' &&
    d.usernameSet !== false
  );
}

export function hasUsernameCached() {
  const uid = auth && auth.currentUser && auth.currentUser.uid;
  return !!uid && okUid === uid;
}

export async function checkUsername() {
  try {
    const uid = auth && auth.currentUser && auth.currentUser.uid;
    if (!uid || !db) return false;
    if (okUid === uid) return true;
    const snap = await getDoc(doc(db, 'users', uid));
    const ok = snap.exists() && userHasUsername(snap.data());
    if (ok) okUid = uid;
    return ok;
  } catch (e) {
    // net / read error: rules server par phir bhi rokenge
    return true;
  }
}

export async function ensureUsername(router) {
  const ok = await checkUsername();
  if (ok) return true;
  Alert.alert(
    'Username zaruri hai',
    'Live me aane ke liye pehle Edit Profile me apna username set karo.'
  );
  try {
    if (router && router.push) router.push(EDIT_PROFILE_ROUTE);
  } catch (e) {}
  return false;
}
