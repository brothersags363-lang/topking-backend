import { Image as ExpoImage } from 'expo-image';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AVATAR_FALLBACK } from '../utils/profileHelpers';

// Ek hi FastImage, dono tarike se chalta hai:
//   1) <FastImage uri={url} fallback={...} />          (profile, follow rows, messages)
//   2) <FastImage source={{ uri: url }} resizeMode="cover" />   (explore, chat, allvideo - RN Image jaisa)
// Image.prefetch(url) bhi chalta hai.

const FIT: Record<string, any> = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  center: 'none',
  repeat: 'cover',
};

function pickSource(uri?: string | null, source?: any, fallback?: any) {
  // require(...) / number ya object {uri}
  if (typeof source === 'number') return source;
  const fromSource =
    source && typeof source === 'object' && !Array.isArray(source) ? source.uri : undefined;
  const u = uri || fromSource;
  if (typeof u === 'string' && u.trim()) return source && fromSource ? { ...source, uri: u } : u;
  return fallback ?? AVATAR_FALLBACK;
}

// FIX (photo kabhi dikhta kabhi nahi): server se image aate waqt net atakne par pehle
// image hamesha ke liye khali reh jati thi. Ab fail hone par 2 baar chup-chap dobara
// koshish (1.5s, 4s baad), phir bhi na aaye to fallback avatar dikhta hai.
const RETRY_DELAYS = [1500, 4000];

const FastImageBase = ({
  uri,
  source,
  fallback = AVATAR_FALLBACK,
  resizeMode,
  contentFit,
  cachePolicy,
  transition,
  onError,
  ...rest
}: any) => {
  const src = pickSource(uri, source, fallback);
  const key = typeof src === 'string' ? src : src?.uri;
  const [tries, setTries] = useState(0);
  const [useFallback, setUseFallback] = useState(false);
  const timer = useRef<any>(null);

  // nayi image aaye to counters reset
  useEffect(() => {
    setTries(0);
    setUseFallback(false);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [key]);

  const handleError = useCallback(
    (e: any) => {
      if (onError) onError(e);
      // local asset (number) ya fallback khud fail ho to kuch nahi kar sakte
      if (typeof src === 'number' || useFallback) return;
      if (tries < RETRY_DELAYS.length) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setTries((t) => t + 1), RETRY_DELAYS[tries]);
      } else {
        setUseFallback(true);
      }
    },
    [onError, src, tries, useFallback]
  );

  const shown = useFallback ? fallback ?? AVATAR_FALLBACK : src;
  return (
    <ExpoImage
      {...rest}
      key={`${key}#${tries}${useFallback ? 'f' : ''}`}
      source={shown}
      recyclingKey={key}
      contentFit={contentFit || FIT[resizeMode] || 'cover'}
      cachePolicy={cachePolicy || 'memory-disk'}
      transition={transition === undefined ? 120 : transition}
      onError={handleError}
    />
  );
};

const FastImage: any = memo(FastImageBase);

FastImage.prefetch = (urls: string | string[]) => {
  try {
    return Promise.resolve(ExpoImage.prefetch(urls as any, 'memory-disk'));
  } catch (e) {
    return Promise.resolve(false);
  }
};

export default FastImage;
