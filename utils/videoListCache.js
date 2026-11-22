// Profile / Likes se video khulte waqt poori list yahan rakhi jaati hai.
// Route params me bada JSON bhejna limit/crash karta tha, isliye pehle sirf 40 video
// jaate the (40+ scroll nahi hota tha). Ab poori list memory se milti hai - 0 extra reads.
let cache = { key: null, list: null };

export const setVideoListCache = (key, list) => {
  cache = { key: key ? String(key) : null, list: Array.isArray(list) ? list : null };
};

export const takeVideoListCache = (key) =>
  key && cache.key === String(key) && Array.isArray(cache.list) ? cache.list : null;

export const clearVideoListCache = () => {
  cache = { key: null, list: null };
};
