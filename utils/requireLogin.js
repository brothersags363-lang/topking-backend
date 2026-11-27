// =====================================================================
// requireLogin.js — bina login sirf For You feed. Baaki har kaam par login page.
//
//   if (!requireLogin(router)) return;   // login nahi hai -> login page khulta hai
//
// GUEST_ALLOWED: in pages par bina login ke ja sakte hain (baaki par _layout ka
// AuthGate khud login page par bhej deta hai: notification / link / koi bhi button).
// =====================================================================
import { getAuth } from 'firebase/auth';

export const GUEST_ALLOWED = ['/', '/index', '/login', '/guidelines', '/language'];

export const isLoggedIn = () => {
  try {
    return !!getAuth().currentUser;
  } catch (e) {
    return false;
  }
};

let lastAt = 0;
export function requireLogin(router) {
  if (isLoggedIn()) return true;
  const now = Date.now();
  if (now - lastAt < 800) return false; // double tap par do baar login page nahi
  lastAt = now;
  try { router.push('/login'); } catch (e) {}
  return false;
}

export default requireLogin;
