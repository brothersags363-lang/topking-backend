// Feed ke liye video ka sahi URL chunta hai.
//  - Cloudflare Stream ne multi-quality (HLS) bana di ho (hlsReady === true) -> .m3u8
//    (net / phone ke hisaab se quality khud badalti hai)
//  - Warna purana R2 mp4 (fallback) -> video hamesha chalti hai, naya ho ya purana.
export const pickVideoUri = (item) => {
  if (!item) return undefined;
  if (item.hlsReady === true && typeof item.hlsUrl === 'string' && item.hlsUrl) {
    return item.hlsUrl;
  }
  return item.videoUrl || item.video;
};

export const isHlsUri = (uri) => typeof uri === 'string' && uri.includes('.m3u8');
