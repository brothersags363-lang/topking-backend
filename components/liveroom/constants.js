import { Dimensions } from 'react-native';
import { framePhoto } from '../LevelFrame';

export const { width, height } = Dimensions.get('window');
// ===== HAR MOBILE PE SAME LOOK =====
// Design 360dp width par bana hai. Sab size sirf WIDTH se scale hote hain (height se nahi),
// isliye lambi/chhoti screen par seats/header/bottom bar ka size same rehta hai.
// Bachi hui height chat ko milti hai (flex), isliye upar-niche shift nahi hota.
export const BASE_W = 360;
// Phones ki width sirf 360-412dp hoti hai -> CONSTANT scale = har phone par bilkul same size.
// Aur chhota/bada karna ho to sirf ye number badlo (0.88 = pehle se ~12% chhota).
export const UI_SCALE = 0.88;
export const sc = (n) => Math.round(n * UI_SCALE);
export const BOTTOM_BAR_H = 60;
// Chat ke upar dikhne wala welcome message (TopKing) - yahin se badlo
export const WELCOME_TEXT = "Welcome to TopKing Live, where you can interact with hosts and other viewers in real time. Please abide by our community guidelines to help us maintain a good community environment";
// Join animation: 'auto' (level se) | 'slide' | 'lv10' | 'lv20' | 'lv30' | 'lv40' | 'lv50'
export const JOIN_ANIM_VARIANT = 'auto';
export const log = __DEV__ ? console.log.bind(console) : () => {};
export const STABLE_AVATAR = 'https://avatar.iran.liara.run/public/65';
export const SEAT_KEYS = Array.from({ length: 12 }, (_, i) => `seat_${i + 1}`);
export const SEAT_OPTIONS = [9, 12]; // host 9 se 12 seat kar sakta hai (9 = 3-3-3, 12 = 4-4-4-4)
export const EMPTY_SEAT = {};
// PERF: har chat row me ye 3-4 baar call hota tha aur har baar naya object banta tha.
// Ab 6 fixed objects hain -> koi allocation nahi, rows turant render.
export const LEVEL_THEMES = {
  50: { bg: "#7B1FFF", border: "#FFD700", text: "#fff", icon: "#FFD700" },
  40: { bg: "#00BFFF", border: "#9EF8FF", text: "#fff", icon: "#fff" },
  30: { bg: "#FF0066", border: "#FFB6C1", text: "#fff", icon: "#fff" },
  20: { bg: "#FFC107", border: "#FFE082", text: "#000", icon: "#fff" },
  10: { bg: "#BDBDBD", border: "#fff", text: "#fff", icon: "#fff" },
  1:  { bg: "#222", border: "#555", text: "#FFD700", icon: "#00E5FF" },
};
export const SPEAK_HOLD_MS = 550;
// three.js WebView warm-up (gift 3D ke liye). Ye Android par naya WebView process banata hai ->
// 1 baar ~200ms atak. Smooth chahiye to false, pehli 3D gift turant chahiye to true.
// HEAT FIX: gift WebView (canvas) me pixel ratio 1.5 par cap -> canvas fill ~40-60% kam (phone me DPR 2.6-3 hota hai).
// Gift ka look lagbhag same, bas thoda soft. Pura sharp chahiye to 1.5 ko 2 kar do.
export const GIFT_WEB_PRE_JS = "try{var __r=window.devicePixelRatio||1;Object.defineProperty(window,'devicePixelRatio',{get:function(){return Math.min(__r,1.5)}})}catch(e){}true;";
export const WARM_GIFT_WEBVIEW = false; // HEAT FIX: room khulte hi extra hidden WebView nahi banta. Pehli 3D gift jaldi chahiye to true
export const WARM_GIFT_WEBVIEW_DELAY_MS = 12000;
// PERF: chat ki har row me 22-36px frame animate hota tha (40-80 rows = bahut load).
// false = chat me frame static (smooth). Seat/profile ke frames animated hi rehte hain.
// Pehle jaisa chahiye to true kar do.
export const CHAT_FRAME_ANIM = false;
// HEAT FIX: seat par 9-12 animated .webp frames (1.3-3.7MB each) ek saath decode hote the = phone garam.
// 'host' = sirf host seat ka frame animated, baaki static (default, thanda)
// 'all'  = pehle jaisa, sab seat animated      |  'off' = koi bhi animated nahi
export const SEAT_FRAME_ANIM_MODE = 'host';
// Seat ka size yahin se badlo: photo, seat aur frame sab isi se chalte hain
// Chhoti screen (kam height) wale phones par seats apne-aap thodi chhoti ho jati hain taaki chat dikhe
export const SEAT_SCALE = UI_SCALE;
export const SEAT_SIZE = Math.round(60 * SEAT_SCALE);
export const SEAT_RADIUS = Math.round(21 * SEAT_SCALE);
// 3 seats per row HAMESHA: integer width => decimal rounding se 2-column wrap nahi hoga
export const SEAT_CELL_W = Math.floor(Math.min(width, 480) / 3);
// 12 seat hone par 4 per row
export const SEAT_CELL_W4 = Math.floor(Math.min(width, 480) / 4);
// false = seat me gol level-ring nahi dikhegi, photo seat ki rounded-square shape me poori fit hogi
// true  = pehle jaisi ring wapas aa jayegi
export const SHOW_SEAT_FRAME = true;
// frame ka size = seat x scale (photo frame ke andar fit rahe). Frame bada/chhota karna ho to ye badlo
// NOTE: frame art ka andar ka khaali gola frame ke size ka sirf ~40-55% hota hai, isliye
// photo dikhane ke liye frame ko photo se kaafi bada rakhna padta hai (1.7x). Chhota dikhe to ise badhao.
export const SEAT_FRAME_SCALE = 1.7;
export const SEAT_FRAME_SIZE = Math.round(SEAT_SIZE * SEAT_FRAME_SCALE);
export const SEAT_FRAME_OFFSET = -(SEAT_FRAME_SIZE - SEAT_SIZE) / 2;

// ===== EK HI FRAME FORMULA (seat, chat, listener list, gift chip, host pill, popup sab jagah) =====
// Frame ka size = photo x FRAME_SCALE, aur photo ke THEEK BEECH me (top/left = -(frame-photo)/2).
// Frame bada/chhota karna ho to sirf SEAT_FRAME_SCALE badlo, sab jagah ek saath badlega.
// Seat frame ka style EK baar bana kar rakha: bolne (speaking) par seat re-render hota hai,
// naya style object banta to frame bhi re-render hota. Ab frame bina chhede chalta rehta hai.
export const SEAT_FRAME_STYLE = framePhoto({ position: 'absolute', width: SEAT_FRAME_SIZE, height: SEAT_FRAME_SIZE, top: SEAT_FRAME_OFFSET, left: SEAT_FRAME_OFFSET, zIndex: 10 }, SEAT_SIZE);
export const FRAME_SCALE = SEAT_FRAME_SCALE;
export const frameBox = (photoSize, container = photoSize) => {
  const size = Math.round(photoSize * FRAME_SCALE);
  const off = (container - size) / 2;
  return framePhoto({ position: 'absolute', width: size, height: size, top: off, left: off, zIndex: 10 }, photoSize);
};
export const FRAME_CHAT22 = frameBox(22);
export const FRAME_CHAT36 = frameBox(36, 42);
export const FRAME_LIST40 = frameBox(40);
export const FRAME_HOST38 = frameBox(38);
// Bolne par seat ke charo taraf glow. Frame (zIndex 10) ke UPAR aur bahar dikhta hai.
// Rang/size yahin se badlo. Frame gol nahi hai to GLOW_RADIUS chhota karo (jaise SEAT_RADIUS + 8).
export const GLOW_COLOR = '#2EE6A6';
// Glow photo se kitna bahar tak jaye. Chhota chahiye to 24 ghatao (jaise 16), bada chahiye to badhao.
export const GLOW_EXTRA = 24;
export const GLOW_SIZE = SEAT_SIZE + GLOW_EXTRA;
export const GLOW_RADIUS = GLOW_SIZE / 2;
export const GLOW_OFFSET = -(GLOW_SIZE - SEAT_SIZE) / 2;
