import { getLocalVideo } from './videoCache';
// Feed ke liye video ka sahi URL chunta hai.
//  - Cloudflare Stream ne multi-quality (HLS) bana di ho (hlsReady === true) -> .m3u8
//    (net / phone ke hisaab se quality khud badalti hai)
//  - Warna R2 mp4 (fallback) -> video hamesha chalti hai, naya ho ya purana.
//  - Purane docs me jo link pub-xxxx.r2.dev ka saved he, use cdn.topkingapp.com se badal do
//    (Cloudflare cache -> tez). r2.dev ko Disable mat karna.

const CDN_BASE = 'https://cdn.topkingapp.com';
const R2_DEV_RE = /^https?:\/\/pub-[a-z0-9]+\.r2\.dev/i;

// pub-....r2.dev wala link -> cdn.topkingapp.com. Baaki har link jaisa hai waisa.
export const fixCdn = (u) =>
  typeof u === 'string' && R2_DEV_RE.test(u) ? u.replace(R2_DEV_RE, CDN_BASE) : u;

// Har video ka quality-faisla PEHLI baar hi pakka: chalte-chalte source badla to video restart hoti.
// low = true (slow phone / mobile data / atakna) -> 480p, warna 720p.
const _picked = new Map();
// peek = true: sirf dekho kaunsa URL banta hai, faisla pakka (freeze) mat karo (prefetch ke liye)
export const pickVideoUri = (item, low, peek) => {
  if (!item) return undefined;
  const id = item.id || item.videoUrl || item.video;
  if (!peek && id && _picked.has(id)) {
    const c = _picked.get(id);
    // file phone se hat gayi (cache saaf) to dobara chuno
    if (!(typeof c === 'string' && c.startsWith('file:') && !getLocalVideo(item.id))) return c;
  }
  // q: 360 / 480 / 720 (purane code se true = 480, false/undefined = 720)
  const q = typeof low === 'number' ? low : low ? 480 : 720;
  let uri;
  const local = getLocalVideo(item.id); // phone me poori utri ho to wahi (turant chalegi)
  if (local) {
    uri = local;
  } else if (item.hlsReady === true && typeof item.hlsUrl === 'string' && item.hlsUrl) {
    uri = item.hlsUrl;
  } else if (q <= 360 && typeof item.videoUrl360 === 'string' && item.videoUrl360) {
    uri = fixCdn(item.videoUrl360);
  } else if (q <= 480 && typeof item.videoUrl480 === 'string' && item.videoUrl480) {
    uri = fixCdn(item.videoUrl480);
  } else {
    uri = fixCdn(item.videoUrl || item.video);
  }
  if (!peek && id && uri) {
    if (_picked.size > 300) _picked.clear();
    _picked.set(id, uri);
  }
  return uri;
};

export const isHlsUri = (uri) => typeof uri === 'string' && uri.includes('.m3u8');
