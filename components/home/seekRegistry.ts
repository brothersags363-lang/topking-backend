
import { VideoSeekBar } from './VideoSeekBar';

// ======================================================
// SEEK BAR (niche menu se chipka PEELA line)
// ======================================================
// Active video ka player yahan register hota hai. VideoSeekBar (jo niche
// menu me hai) isi ko sunta hai -> video ke hisaab se line chalti hai,
// time (0:12 / 0:30) dikhta hai, aur ungli se aage-peeche kar sakte ho.
export let seekTarget: { player: any; videoId: string } | null = null;
export const seekListeners = new Set<() => void>();
export const setSeekTarget = (t: { player: any; videoId: string } | null) => {
  seekTarget = t;
  seekListeners.forEach((fn) => fn());
};

export const fmtTime = (sec: number) => {
  const t = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

