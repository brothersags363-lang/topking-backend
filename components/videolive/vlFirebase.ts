// @ts-nocheck



// Firebase safety check (same pattern as LiveRoom.js / all-live.js)
export let db: any = null;
export let auth: any = null;
try {
  const firebaseModule = require("../../app/firebaseConfig");
  db = firebaseModule.db;
  auth = firebaseModule.auth;
} catch (e) {
  __DEV__ && console.log("Firebase config not found.");
}

