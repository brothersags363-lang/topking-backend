import { Image as ExpoImage } from 'expo-image';
import React, { memo } from 'react';
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

const FastImageBase = ({
  uri,
  source,
  fallback = AVATAR_FALLBACK,
  resizeMode,
  contentFit,
  cachePolicy,
  transition,
  ...rest
}: any) => {
  const src = pickSource(uri, source, fallback);
  const key = typeof src === 'string' ? src : src?.uri;
  return (
    <ExpoImage
      {...rest}
      source={src}
      recyclingKey={key}
      contentFit={contentFit || FIT[resizeMode] || 'cover'}
      cachePolicy={cachePolicy || 'memory-disk'}
      transition={transition === undefined ? 120 : transition}
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
