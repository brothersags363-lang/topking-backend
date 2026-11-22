// Avatar pendants (frames) - Edit Profile > Avatar pendant.
// users/{uid}.pendantChoice = key  (user ki chuni hui pendant)
// Unlock rule: baaki sab lock rahte hain.
//  - fresh_angel  : ID verified (face/ID verification) ya admin tick -> isUserVerified
//  - senior_angel : sirf WHITE tick (admin ne white verified tick diya ho) -> isWhiteTick
//  - master_angel / region_star : abhi lock
// Baad me kisi aur ko kholna ho to uski `unlocked` function badal do.
// Server ke verified rule jaisa hi (server.js: verified === true ya faceStatus submitted/approved).
// Jo user pehle se verified hai, uska Fresh Angel apne aap khula milta hai.
export const isUserVerified = (u) =>
  !!u && (u.verified === true || u.faceStatus === 'submitted' || u.faceStatus === 'approved');

// White tick = admin ka verified tick, color white (yellow nahi). Default color white maana jata hai.
export const isWhiteTick = (u) =>
  !!u && u.verified === true && u.verifiedColor !== 'yellow';

export const PENDANTS = [
  {
    key: 'fresh_angel',
    label: 'Fresh Angel',
    img: require('../assets/pendants/fresh_angel.webp'),
    hint: 'Verified hone par milta hai',
    lockText: 'Verify to Unlock',
    unlocked: (u) => isUserVerified(u),
  },
  {
    key: 'senior_angel',
    label: 'Senior Angel',
    img: require('../assets/pendants/senior_angel.webp'),
    hint: 'White tick milne par milta hai',
    lockText: 'White Tick to Unlock',
    unlocked: (u) => isWhiteTick(u),
  },
  {
    key: 'master_angel',
    label: 'Master Angel',
    img: require('../assets/pendants/master_angel.webp'),
    hint: 'Locked',
    unlocked: () => false,
  },
  {
    key: 'region_star',
    label: 'Region Star',
    img: require('../assets/pendants/region_star.webp'),
    hint: 'Locked',
    unlocked: () => false,
  },
];

export const getPendant = (key) => PENDANTS.find((p) => p.key === key) || null;
