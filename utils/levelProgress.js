// utils/levelProgress.js
// Level = kharch (wallets/{uid}.totalSpent) se. Ye table backend ke
// functions/index.js (LEVEL_STEPS) aur backend/server.js (LEVEL_STEPS_SRV) se
// bilkul same hona chahiye. Agar wahan badlo to yahan bhi badlo.
//
// LEVEL_STEPS[i] = Level (i+1) tak pahunchne ke liye total kitna star kharch chahiye.
export const LEVEL_STEPS = [
  10, 60, 100, 160, 200, 280, 360, 540, 670, 870,
  1000, 1150, 1300, 1600, 1900, 2400, 2800, 3500, 4000, 5050,
  6100, 7200, 8200, 9000, 10500, 12300, 14000, 17000, 19000, 23000,
  26000, 31000, 43000, 51000, 67000, 78000, 89000, 99000, 101000, 110000,
  125000, 155000, 189000, 210000, 260000, 299000, 310000, 385000, 440000, 499000,
];

export const MAX_LEVEL = LEVEL_STEPS.length; // 50

// totalSpent  : abhi tak kitne stars kharch hue
// walletLevel : (optional) wallets/{uid}.level. Admin ka manualLevel spent-level se
//               upar ho sakta hai, to bar usi level se aage ka dikhata hai.
export function getLevelProgress(totalSpent, walletLevel) {
  const spent = Math.max(0, Number(totalSpent) || 0);

  let level = 0;
  for (let i = 0; i < LEVEL_STEPS.length; i++) {
    if (spent >= LEVEL_STEPS[i]) level = i + 1; else break;
  }
  const wl = Math.min(MAX_LEVEL, Math.max(0, Math.floor(Number(walletLevel) || 0)));
  if (wl > level) level = wl;

  if (level >= MAX_LEVEL) {
    return { level: MAX_LEVEL, nextLevel: null, progress: 1, starsToUpgrade: 0, isMax: true };
  }

  const start = level === 0 ? 0 : LEVEL_STEPS[level - 1];
  const next = LEVEL_STEPS[level];
  const progress = Math.max(0, Math.min(1, (spent - start) / Math.max(1, next - start)));

  return {
    level,
    nextLevel: level + 1,
    progress,
    starsToUpgrade: Math.max(0, next - spent),
    isMax: false,
  };
}
