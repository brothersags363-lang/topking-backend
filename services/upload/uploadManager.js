// uploadManager.js
//
// Ye ek chhota "global store" hai (Context ya Redux nahi chahiye).
// JS module singleton hota hai — iska matlab jab bhi koi screen
// (post.tsx ho ya index.tsx) is file ko import karega, sabko WAHI
// ek state milegi. Isi wajah se agar post.tsx se navigate karke
// index.tsx par chale jao, upload progress kho nahi jaata —
// kyunki progress kisi component ke andar store hi nahi ho raha,
// ye is module ke andar store ho raha hai jo screens ke upar/bahar
// zinda rehta hai.
//
// Har screen sirf `useUploadState()` hook use karke is state ko
// "subscribe" karti hai, taaki jab bhi progress badle, wo screen
// khud-ba-khud re-render ho jaye.

import { useEffect, useState } from "react";

let state = {
  uploading: false, // true jab tak background upload chal raha ho
  progress: 0, // 0 se 100
  error: null, // upload fail hua to yahan message aayega
  justCompleted: false, // 100% hone ke turant baad thodi der true rehta hai (UI me "Posted" dikhane ke liye)
  retrying: false, // server ne transient error di, hum thodi der ruk kar dobara try kar rahe hain
  retryAttempt: 0,
};

const listeners = new Set();

function notify() {
  listeners.forEach((cb) => cb(state));
}

/**
 * Kisi component se subscribe karne ke liye. Har state change par
 * callback naye state ke saath call hota hai. Cleanup function
 * return karta hai (useEffect ke return me use karo).
 */
export function subscribeUpload(cb) {
  listeners.add(cb);
  cb(state);
  return () => listeners.delete(cb);
}

export function getUploadState() {
  return state;
}

/**
 * Partial update — jo keys doge sirf wahi update hongi, baaki
 * as-it-hai rahengi.
 */
export function setUploadState(partial) {
  state = { ...state, ...partial };
  notify();
}

export function resetUpload() {
  state = { uploading: false, progress: 0, error: null, justCompleted: false, retrying: false, retryAttempt: 0 };
  notify();
}

/**
 * React hook — kisi bhi screen me ye call karo aur wo upload
 * progress se automatically sync ho jayegi.
 *
 *   const { uploading, progress, error } = useUploadState();
 */
export function useUploadState() {
  const [local, setLocal] = useState(getUploadState());
  useEffect(() => subscribeUpload(setLocal), []);
  return local;
}
