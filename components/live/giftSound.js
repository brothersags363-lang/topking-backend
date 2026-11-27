import { createAudioPlayer } from 'expo-audio';

// ============================================================
// GIFT SOUND - car / camera gift ke animation ke saath awaaz.
//   car    -> engine paas aata, brake ki cheekh, ruki gaadi, rev karke nikalna (~3.9 sec)
//   camera -> 3 shutter click (animation ke 3 flash ke saath) (~4.2 sec)
//   horse  -> (Lv 50+ ENTRY) taapon ki awaaz, rukte hi hinhinana, ghurr, phir daud kar jana (~3.9 sec)
// Live room ka Agora audio mode NAHI chheda jata (setAudioModeAsync nahi), sirf chhota player.
// Awaaz band karni ho: GIFT_SOUND_ON = false. Dheemi karni ho: GIFT_SOUND_VOLUME kam karo (0..1).
// Nayi awaaz: mp3 assets/sounds/ me daalo aur SOUNDS me line jodo.
// ============================================================
export const GIFT_SOUND_ON = true;
export const GIFT_SOUND_VOLUME = 0.7;

const SOUNDS = {
  car: require('../../assets/sounds/gift_car.mp3'),
  camera: require('../../assets/sounds/gift_camera.mp3'),
  horse: require('../../assets/sounds/gift_horse.mp3'), // horse entry: taap + hinhinana + ghurr
};

const players = {}; // ek type ka ek hi player (baar baar banana nahi -> memory / lag nahi)

function getPlayer(type) {
  if (players[type]) return players[type];
  const src = SOUNDS[type];
  if (!src) return null;
  try {
    const p = createAudioPlayer(src);
    p.volume = GIFT_SOUND_VOLUME;
    players[type] = p;
    return p;
  } catch (e) {
    return null;
  }
}

// Room khulte hi pehle se load kar lo, taaki pehle gift par awaaz late na aaye
export function preloadGiftSounds() {
  if (!GIFT_SOUND_ON) return;
  Object.keys(SOUNDS).forEach(getPlayer);
}

export function playGiftSound(type) {
  if (!GIFT_SOUND_ON) return;
  const p = getPlayer(type);
  if (!p) return;
  try {
    p.volume = GIFT_SOUND_VOLUME;
    const r = p.seekTo(0);
    if (r && typeof r.then === 'function') r.then(() => p.play()).catch(() => p.play());
    else p.play();
  } catch (e) {}
}

export function stopGiftSound(type) {
  const p = players[type];
  if (!p) return;
  try { p.pause(); } catch (e) {}
}
