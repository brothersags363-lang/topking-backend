// Instagram jaisa fast image: disk + memory cache, halka fade, repeat load nahi.
// React Native ke <Image> ki jagah drop-in replacement hai (same props).
import React, { memo } from 'react';
import { Image as ExpoImage } from 'expo-image';

const FIT = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  center: 'none',
  repeat: 'cover',
};

function FastImageBase({ resizeMode, contentFit, cachePolicy, transition, ...rest }) {
  return (
    <ExpoImage
      {...rest}
      contentFit={contentFit || FIT[resizeMode] || 'cover'}
      cachePolicy={cachePolicy || 'memory-disk'}
      transition={transition === undefined ? 120 : transition}
    />
  );
}

const FastImage = memo(FastImageBase);

// Purane code me Image.prefetch(url).catch(...) use hota hai - wo bhi chalega.
FastImage.prefetch = (urls) => {
  try {
    return Promise.resolve(ExpoImage.prefetch(urls, 'memory-disk'));
  } catch (e) {
    return Promise.resolve(false);
  }
};

export default FastImage;
