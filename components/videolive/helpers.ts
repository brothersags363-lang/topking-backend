// @ts-nocheck
import { warmBackend } from '../../utils/warmBackend';
import { getAgoraToken } from '../../utils/agoraToken';


// Quick emoji row above the chat box
export const QUICK_EMOJIS = ["😂", "😍", "🔥", "👏", "🥰", "😮", "🎉", "💯"];

// Simple client-side bad-word filter (add your own words; hindi/roman ok)
export const BAD_WORDS = ["fuck", "bitch", "sex", "porn", "madarchod", "bhosdi", "chutiya", "randi", "gaand", "lund"];
export const cleanText = (t: string) => {
  let out = t;
  BAD_WORDS.forEach((w) => {
    out = out.replace(new RegExp(w, "gi"), "*".repeat(w.length));
  });
  return out;
};

export const VOICE_ABUSE_REASON = "Gali / abuse (voice)";
export const REPORT_REASONS = ["Nudity / sexual content", VOICE_ABUSE_REASON, "Abuse / harassment", "Spam / scam", "Underage user", "Other"];

export const getLevelTheme = (level = 1) => {
  if (level >= 50) return { bg: "#7B1FFF", border: "#FFD700", text: "#fff", icon: "#FFD700" };
  if (level >= 40) return { bg: "#00BFFF", border: "#9EF8FF", text: "#fff", icon: "#fff" };
  if (level >= 30) return { bg: "#FF0066", border: "#FFB6C1", text: "#fff", icon: "#fff" };
  if (level >= 20) return { bg: "#FFC107", border: "#FFE082", text: "#000", icon: "#fff" };
  if (level >= 10) return { bg: "#BDBDBD", border: "#fff", text: "#fff", icon: "#fff" };
  return { bg: "#222", border: "#555", text: "#FFD700", icon: "#00E5FF" };
};

export const fmtClock = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

// ---------- Agora token: shared helper (utils/agoraToken.js) ----------
// Pehle yahan ek request + 25s timeout + 3 koshish thi => Render so raha ho to 30-40s "Waking up server".
// Ab: cache (1 ghanta), live-list se prefetch, 3.5s me na aaye to parallel doosri request,
// 60s ka retry budget, aur ban (403) par saaf error. Kabhi throw nahi karta.
export const warmUpBackend = () => {
  // shared helper: server jaga hua ho to dobara ping nahi, soya ho to jagata hai
  warmBackend(false);
};

export type TokenResult = { token: string | null; uid: number; error?: { status?: number; code?: string; message?: string; until?: number }; cancelled?: boolean };

// onSlow: request 3.5s se zyada le rahi hai (server jag raha hai). force: cache chhodo (token reject / renew).
export const fetchAgoraToken = (
  channel: string,
  uid: number,
  isCancelled: () => boolean = () => false,
  onSlow?: () => void,
  force: boolean = false
): Promise<TokenResult> => getAgoraToken(channel, uid, { isCancelled, onSlow, force }) as Promise<TokenResult>;

// ============================================================
// Small memoized components that live OUTSIDE VideoLive so a
// re-render of the big screen doesn't restart them.
// ============================================================

