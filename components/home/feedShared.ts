import { Dimensions } from 'react-native';
import { getAuth } from 'firebase/auth';


// Shared constants / tiny helpers used by many home-feed modules
export const runAfterIdle = (fn: () => void) => { const t = setTimeout(fn, 80); return { cancel: () => clearTimeout(t) }; };



export const { height, width } = Dimensions.get('screen');

export const auth = getAuth();

export const AVATAR_FALLBACK = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'; 

// Count ko short form me dikhao: 813 -> 813, 76000 -> 76K, 19200 -> 19.2K, 1200000 -> 1.2M
export const formatCount = (n) => {
  const num = Number(n) || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(num >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(num >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(num);
};

export const feedKeyExtractor = (item) => item.id;

export const getFeedItemLayout = (_data, index) => ({
  length: height,
  offset: height * index,
  index,
});

