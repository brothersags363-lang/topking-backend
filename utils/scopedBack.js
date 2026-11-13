// utils/scopedBack.js
// BACK BUTTON FIX: Stack me neeche ki screens mounted rehti hain aur unka hardwareBackPress
// handler bhi registered rehta hai. Naye screen me jaate hi neeche wali screen ka handler
// back press kha leta tha (popup band karna, setScreen('home'), exitApp...) -> back
// "kaam nahi karta" aur 5-6 baar dabana padta tha.
// Ab har screen ka handler sirf tab chalta hai jab wahi screen (pathname) abhi khuli ho.
// Handler false de to agla handler / default back chalta hai.
import { BackHandler } from 'react-native';

let currentPath = '';

// _layout.tsx ka RouteTracker har route badalne par ye set karta hai
export function setCurrentPath(p) {
  currentPath = p || '/';
}

function norm(p) {
  let s = String(p || '/').split('?')[0];
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s === '/index' || s === '' ? '/' : s;
}

function matches(ownerPath, path) {
  const o = norm(ownerPath);
  const c = norm(path);
  if (o === c) return true;
  const a = o.split('/');
  const b = c.split('/');
  if (a.length !== b.length) return false;
  return a.every((seg, i) =>
    seg.startsWith('[') && seg.endsWith(']') ? b[i].length > 0 : seg === b[i]
  );
}

export function scopedBackHandler(ownerPath, eventName, handler) {
  return BackHandler.addEventListener(eventName, () => {
    if (!matches(ownerPath, currentPath)) return false; // ye screen abhi upar nahi hai
    return handler();
  });
}
