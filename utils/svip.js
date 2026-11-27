// utils/svip.js
// SVIP 1..5 ka data - "My Privileges" page aur SVIP page dono yahi use karte hain.
// Naya SVIP / privilege jodna ho to sirf yahan badlo.
//
// level  = kis level par ye SVIP khulta hai
// frame  = LevelFrame ka key (FRAME_IMAGES.STATIC[frame]) -> SVIP pendant
// badge  = chhota "SVIPn" chip (frame ke crest se kata hua)
// card   = upar wale card ka gradient, title = card ke heading ka rang
// header = page ke upar ka background gradient
// ret    = recharge par kitne % stars wapas

export const SVIP_TIERS = [
  {
    n: 1, level: 50, frame: 50, ret: 3,
    badge: require('../assets/svip/svip1_badge.webp'),
    chip: ['#B8461C', '#F09A5A'],
    card: ['#FFE7CF', '#F6B98C'], title: '#B4471A', sub: '#9A5A3A',
    header: ['#5A3424', '#2A1D18', '#121014'],
  },
  {
    n: 2, level: 60, frame: 60, ret: 4,
    badge: require('../assets/svip/svip2_badge.webp'),
    chip: ['#2B4FB0', '#6FA2F5'],
    card: ['#E3EDFF', '#9DBDF5'], title: '#2A4DA6', sub: '#4A6596',
    header: ['#22365E', '#18203A', '#101218'],
  },
  {
    n: 3, level: 65, frame: 65, ret: 5,
    badge: require('../assets/svip/svip3_badge.webp'),
    chip: ['#B86A00', '#F5C443'],
    card: ['#FFF3C9', '#F4C75A'], title: '#9A5800', sub: '#8A6A2A',
    header: ['#5C4314', '#2A2010', '#121014'],
  },
  {
    n: 4, level: 70, frame: 70, ret: 6,
    badge: require('../assets/svip/svip4_badge.webp'),
    chip: ['#7A35C8', '#C68BF5'],
    card: ['#F2E2FF', '#C9A0F4'], title: '#6A2DB0', sub: '#6E5290',
    header: ['#40245E', '#221832', '#110F16'],
  },
  {
    // SVIP 5 ka abhi frame / badge art nahi hai -> chip aur ring code se bante hain
    n: 5, level: 75, frame: null, ret: 8,
    badge: null,
    chip: ['#B0164A', '#F2638F'],
    card: ['#FFE0EA', '#F296B6'], title: '#A61D4C', sub: '#8E4A62',
    header: ['#5E1E36', '#2C1520', '#120E12'],
  },
];

export const svipOf = (n) => SVIP_TIERS.find((t) => t.n === Number(n)) || SVIP_TIERS[0];

// user ke level se uska SVIP (0 = koi nahi)
export const svipForLevel = (level) => {
  const lv = Number(level) || 0;
  let best = 0;
  SVIP_TIERS.forEach((t) => { if (lv >= t.level) best = t.n; });
  return best;
};

// SVIP page ki "Privileges obtained" list. icon = MaterialCommunityIcons ka naam,
// type = right side me kya dikhe: badge | pendant | icon
export const svipPrivileges = (t) => [
  { key: 'badge', title: 'SVIP Badge', sub: 'Display your honorable identity', type: 'badge' },
  { key: 'pendant', title: 'SVIP Pendant', sub: 'Exclusive avatar frame', type: 'pendant' },
  { key: 'entry', title: 'Entry effect', sub: 'Dominate the screen upon your entry', type: 'icon', icon: 'horse-variant' },
  { key: 'seat', title: 'Prioritised Seat', sub: 'Display Priority in Audience List', type: 'icon', icon: 'account-star' },
  { key: 'return', title: `Return ${t.ret}% stars`, sub: 'Recharge more, return more!', type: 'icon', icon: 'star-four-points' },
  { key: 'service', title: 'Exclusive Customer Service', sub: 'Get quick response within 5 minutes', type: 'icon', icon: 'face-agent' },
];
