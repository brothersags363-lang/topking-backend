// =====================================================================
// silenceLogs.js — release build me console.log band (poora app halka)
//
// App me 200+ console.log hain (kuch har Firestore update par poora data print karte
// hain, jaise wallet / live room). Release build me bhi ye chalte the: object ko text
// banana + Android logcat me likhna = JS thread par bekaar kaam = scroll / tap me atak.
//
// Development (expo start / dev build) me sab pehle jaisa dikhta hai.
// console.warn / console.error kabhi band nahi (crash / asli gadbad dikhni chahiye).
//
// _layout.tsx me SABSE PEHLE import hota hai, taaki baaki files ke logs bhi band hon.
// =====================================================================
if (typeof __DEV__ !== 'undefined' && !__DEV__) {
  const noop = () => {};
  // eslint-disable-next-line no-console
  console.log = noop;
  // eslint-disable-next-line no-console
  console.info = noop;
  // eslint-disable-next-line no-console
  console.debug = noop;
  // eslint-disable-next-line no-console
  console.trace = noop;
}
