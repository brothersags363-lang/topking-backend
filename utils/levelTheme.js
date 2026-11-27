// utils/levelTheme.js
// Level badge ke colours + "My Privileges" page ka data - ek hi jagah.
// Naya level/privilege add karna ho to sirf PRIVILEGE_TIERS me ek entry jodo.

// level -> tier (1-9 = 0)
export const tierOf = (level) => {
  const lv = Number(level) || 0;
  if (lv >= 65) return 65;
  if (lv >= 60) return 60;
  if (lv >= 50) return 50;
  if (lv >= 40) return 40;
  if (lv >= 30) return 30;
  if (lv >= 20) return 20;
  if (lv >= 10) return 10;
  return 0;
};

// Screenshot se liye rang. c1 -> c2 = pill ka gradient (left -> right), edge = pill ki border,
// gem = gem ka bahari rang, gem2 = gem ka andar ka rang, shape = gem ki shape
//   diamond | cube | box | crystal
const THEMES = {
  0:  { c1: '#3B3F4A', c2: '#4A4F5C', edge: 'rgba(255,255,255,0.28)', gem: '#AEB6C8', gem2: '#7C849A', shape: 'diamond' },
  10: { c1: '#2B72B8', c2: '#3A8AD0', edge: 'rgba(170,225,255,0.55)', gem: '#6FE6FF', gem2: '#B8F6FF', shape: 'diamond' },
  20: { c1: '#2C78AE', c2: '#3F8FC4', edge: 'rgba(170,230,255,0.5)',  gem: '#62E4F2', gem2: '#2AA9C4', shape: 'cube' },
  30: { c1: '#4743C4', c2: '#5A55DA', edge: 'rgba(200,200,255,0.55)', gem: '#B9C0FF', gem2: '#7C84E8', shape: 'box' },
  40: { c1: '#4B3AC2', c2: '#5E48D8', edge: 'rgba(215,195,255,0.6)',  gem: '#D8B8FF', gem2: '#9A5CE0', shape: 'crystal' },
  50: { c1: '#6E34CC', c2: '#8744E0', edge: 'rgba(245,190,255,0.65)', gem: '#FFB6E8', gem2: '#E060C8', shape: 'crystal' },
  60: { c1: '#6A30C4', c2: '#8040D6', edge: 'rgba(255,200,230,0.65)', gem: '#FFAA94', gem2: '#E8503C', shape: 'crystal' },
  65: { c1: '#B4309A', c2: '#DE4FB8', edge: 'rgba(255,220,240,0.7)',  gem: '#FFD86A', gem2: '#F09A1E', shape: 'crystal' },
};

export const levelThemeFor = (level) => THEMES[tierOf(level)];

// Privileges: har tier par kya milta hai. Item type -> page me row ka design
//   badge | pendant | banner | svip | family
// Entry banner ke rang - FRAME ke rang se match (page aur live room dono yahi use karte hain)
//   30-39 Gold Dragon -> gold, 40-49 Purple Crown -> purple, 50+ SVIP -> orange (fire)
export const FRAME_BANNER = {
  30: { colors: ['#6B4A0E', '#E3B23C'], edge: '#FFE08A' },
  40: { colors: ['#3A1670', '#8A3FE0'], edge: '#D9B8FF' },
  50: { colors: ['#B5300D', '#F7A02C'], edge: '#FFD27A' },
  60: { colors: ['#1D3A8F', '#4F8BF0'], edge: '#BFD8FF' },   // SVIP 2 (neela frame)
  65: { colors: ['#8A4A06', '#F2B630'], edge: '#FFE59A' },   // SVIP 3 (sunehra frame)
};
export const bannerFor = (tier) => FRAME_BANNER[tier] || FRAME_BANNER[30];

// frame  = LevelFrame ka tier number (30 / 40 / 50). Pendant row me wahi frame dikhta hai.
// banner = entry banner ke gradient colours - frame ke rang se match:
//   Lv30 Gold Dragon (gold + green) -> gold,  Lv40 Purple Crown -> purple,  Lv50 SVIP 1 (fire) -> orange
export const PRIVILEGE_TIERS = [
  { level: 10, items: ['badge'] },
  { level: 20, items: ['badge', 'family'] },
  { level: 30, items: ['badge', 'pendant', 'family'], frame: 30, banner: FRAME_BANNER[30].colors, bannerEdge: FRAME_BANNER[30].edge },
  { level: 40, items: ['badge', 'pendant', 'banner', 'family'], frame: 40, banner: FRAME_BANNER[40].colors, bannerEdge: FRAME_BANNER[40].edge },
  { level: 50, items: ['badge', 'pendant', 'banner', 'svip', 'family'], frame: 50, svip: 1, banner: FRAME_BANNER[50].colors, bannerEdge: FRAME_BANNER[50].edge },
  { level: 60, items: ['badge', 'pendant', 'banner', 'svip', 'family'], frame: 60, svip: 2, banner: FRAME_BANNER[60].colors, bannerEdge: FRAME_BANNER[60].edge },
  { level: 65, items: ['badge', 'pendant', 'banner', 'svip', 'family'], frame: 65, svip: 3, banner: FRAME_BANNER[65].colors, bannerEdge: FRAME_BANNER[65].edge },
];

export const PRIVILEGE_LABEL = {
  badge: 'Upgrade level badge',
  pendant: 'Upgrade level avatar pendant',
  banner: 'Upgrade entry banner',
  family: 'Right to join a family',
};
