// Join entry ki list (Settings me dikhane ke liye). Entry level se milti hai.
// key JoinEntry.js ke ENTRY_CFG / pickVariant se milta hai.
export const ENTRY_CATALOG = [
  { key: 'slide', label: 'Classic Slide', min: 0,  img: null },
  { key: 'wing1', label: 'Purple Wings',  min: 10, img: require('./entries/e1_base.png') },
  { key: 'wing2', label: 'Crimson Lion',  min: 20, img: require('./entries/e2_base.png') },
  { key: 'wing3', label: 'Angel Wings',   min: 30, img: require('./entries/e3_base.png') },
  { key: 'wing4', label: 'Flame Wings',   min: 40, img: require('./entries/e4_base.png') },
  { key: 'wing5', label: 'Golden Crown',  min: 50, img: require('./entries/e5_base.png') },
];

export const entryMinLevel = (key) => {
  const e = ENTRY_CATALOG.find((x) => x.key === key);
  return e ? e.min : 0;
};
