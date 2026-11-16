// Avatar pendants (frames) - Edit Profile > Avatar pendant.
// users/{uid}.pendantChoice = key  (user ki chuni hui pendant)
// Unlock rule: sab lock rahte hain. User verified ho (isUserVerified)
// to sirf "fresh_angel" khulta hai. Baaki 3 abhi lock hain.
// Baad me kisi aur ko kholna ho to uski `unlocked` function badal do.
// Server ke verified rule jaisa hi (server.js: verified === true ya faceStatus submitted/approved).
// Jo user pehle se verified hai, uska Fresh Angel apne aap khula milta hai.
export const isUserVerified = (u) =>
  !!u && (u.verified === true || u.faceStatus === 'submitted' || u.faceStatus === 'approved');

export const PENDANTS = [
  {
    key: 'fresh_angel',
    label: 'Fresh Angel',
    img: require('../assets/pendants/fresh_angel.png'),
    hint: 'Verified hone par milta hai',
    unlocked: (u) => isUserVerified(u),
  },
  {
    key: 'senior_angel',
    label: 'Senior Angel',
    img: require('../assets/pendants/senior_angel.png'),
    hint: 'Locked',
    unlocked: () => false,
  },
  {
    key: 'master_angel',
    label: 'Master Angel',
    img: require('../assets/pendants/master_angel.png'),
    hint: 'Locked',
    unlocked: () => false,
  },
  {
    key: 'region_star',
    label: 'Region Star',
    img: require('../assets/pendants/region_star.png'),
    hint: 'Locked',
    unlocked: () => false,
  },
];

export const getPendant = (key) => PENDANTS.find((p) => p.key === key) || null;
