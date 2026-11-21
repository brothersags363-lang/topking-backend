// utils/liveGiftApi.js
// Live gift ka PAISA server (POST /live/gift) kaatta hai - phone wallet nahi chhoota.
// requestId har batch ka ek hi rehta hai, isliye network fail par retry karne se double charge nahi hota.
import { callApi } from './api';

const makeRequestId = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// throws: err.code === 'NO_STARS' (stars kam), ya koi aur error
export async function chargeLiveGift({ roomId, giftId, taps = 1, receiverIds }) {
  const body = {
    roomId,
    giftId: String(giftId),
    taps: Math.max(1, Math.floor(Number(taps) || 1)),
    receiverIds,
    requestId: makeRequestId(),
  };
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      return await callApi('/live/gift', body);
    } catch (e) {
      lastErr = e;
      // server ne saaf mana kiya (400/404...) => retry nahi. Network / 5xx (Render so raha tha) => retry.
      if (e && e.status && e.status < 500) throw e;
      await sleep(1500);
    }
  }
  throw lastErr;
}
