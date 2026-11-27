// =====================================================================
// VIDEO FX  (one source of truth for camera + edit + server)
// ---------------------------------------------------------------------
// Everything the camera / edit screens add on top of a "filter" travels
// as ONE small JSON string param called `videoFx`:
//
//   { speed: 2, intensity: 70, beauty: { soft: 40, white: 20, ... },
//     motion: "glitch", musicStart: 12.5 }
//
//   camera.tsx -> EditView -> post.tsx -> reelUploadService -> /merge
//
// CommonJS on purpose, so the app (Metro) and server.js (Node) both
// require() the same file, exactly like constants/filterLibrary.js.
// =====================================================================

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
const r3 = (v) => Number((+v).toFixed(3));

// ---------------------------------------------------------------------
// SPEED (0.3x / 0.5x / 1x / 2x / 3x)
// ---------------------------------------------------------------------
// Camera records normally. While recording at 2x the song plays at 0.5x,
// then the server speeds the video up 2x -> song and video stay in sync.
const SPEEDS = [
  { label: "0.3x", value: 0.3 },
  { label: "0.5x", value: 0.5 },
  { label: "1x", value: 1 },
  { label: "2x", value: 2 },
  { label: "3x", value: 3 },
];
const SPEED_VALUES = SPEEDS.map((s) => s.value);

// Song rate while recording (expo-audio supports ~0.25x .. 2x).
const musicRateFor = (speed) => clamp(1 / (speed || 1), 0.25, 2);

// ---------------------------------------------------------------------
// BEAUTY (Beautify tab)
// ---------------------------------------------------------------------
// `live: true` = really applied (preview + final video).
// `live: false` = face-shape tools that need a face-tracking AR SDK
// (Banuba / DeepAR / etc). They are shown with a "Soon" badge instead of
// pretending to work.
const BEAUTY = [
  { id: "soft",     label: "Softening",    icon: "happy-outline",      live: true,  def: 0 },
  { id: "white",    label: "Whitening",    icon: "sunny-outline",      live: true,  def: 0 },
  { id: "clarity",  label: "Clarity",      icon: "contrast-outline",   live: true,  def: 0 },
  { id: "blush",    label: "Blush",        icon: "rose-outline",       live: true,  def: 0 },
  { id: "lipstick", label: "Lipstick",     icon: "color-wand-outline", live: true,  def: 0 },
  { id: "kajal",    label: "Kajal",        icon: "eye",                live: true,  def: 0 },
  { id: "bright",   label: "Dark circles", icon: "eye-outline",        live: true,  def: 0 },
  { id: "slim",     label: "Slimming",     icon: "body-outline",       live: false, def: 0 },
  { id: "eyes",     label: "Eyes+",        icon: "eye-outline",        live: false, def: 0 },
  { id: "nose",     label: "Nose-",        icon: "triangle-outline",   live: false, def: 0 },
  { id: "lips",     label: "Lips",         icon: "happy-outline",      live: false, def: 0 },
  { id: "contour",  label: "Contour",      icon: "ellipse-outline",    live: false, def: 0 },
  { id: "teeth",    label: "Whiten Teeth", icon: "sparkles-outline",   live: false, def: 0 },
];
const DEFAULT_LIP = "#d10f2e";
const BEAUTY_LIVE_IDS = BEAUTY.filter((b) => b.live).map((b) => b.id);
const defaultBeauty = () => {
  const o = {};
  BEAUTY_LIVE_IDS.forEach((id) => { o[id] = BEAUTY.find((b) => b.id === id).def; });
  return o;
};

// Beauty values (0..100) -> extra filter params, merged into the
// selected colour filter so the server renders everything in ONE pass.
function beautyToFilterParams(beauty, skinOnly) {
  const b = beauty || {};
  const v = (id) => clamp(num(b[id], 0), 0, 100) / 100;
  // Server: softening / whitening / dark-circles sirf SKIN par lagte hain
  // (beautySkinFilter), isliye poori frame wale params se hata do.
  if (skinOnly) {
    return { smooth: 0, b: 0, fade: 0, glow: 0, sharp: v("clarity") * 0.8, blush: 0 };
  }
  return {
    smooth: v("soft") * 0.9,
    b: v("white") * 0.06 + v("bright") * 0.03,
    fade: v("bright") * 0.04,
    glow: v("white") * 0.25,
    sharp: v("clarity") * 0.8,
    blush: v("blush") * 0.6 + v("lipstick") * 0.25,
  };
}

// ---------------------------------------------------------------------
// MOTION EFFECTS (Edit screen: Dynamic / Beautiful / Split Screen)
// ---------------------------------------------------------------------
const EFFECT_TABS = ["Dynamic", "Beautiful", "Split Screen"];
const EFFECTS = [
  { id: "enlarge",  tab: "Dynamic",      label: "Enlarge",   icon: "expand-outline" },
  { id: "glitch",   tab: "Dynamic",      label: "glitch",    icon: "pulse-outline" },
  { id: "soulout",  tab: "Dynamic",      label: "Soul out",  icon: "people-outline" },
  { id: "hotwave",  tab: "Dynamic",      label: "Hot wave",  icon: "color-filter-outline" },
  { id: "flash",    tab: "Dynamic",      label: "Flash",     icon: "flash-outline" },
  { id: "shake",    tab: "Dynamic",      label: "Shake",     icon: "phone-portrait-outline" },
  { id: "dreamy",   tab: "Beautiful",    label: "Dreamy",    icon: "cloudy-outline" },
  { id: "sparkle",  tab: "Beautiful",    label: "Sparkle",   icon: "sparkles-outline" },
  { id: "rainbow",  tab: "Beautiful",    label: "Rainbow",   icon: "color-palette-outline" },
  { id: "oldfilm",  tab: "Beautiful",    label: "Old film",  icon: "film-outline" },
  { id: "split2",   tab: "Split Screen", label: "2 Screen",  icon: "reorder-two-outline" },
  { id: "split3",   tab: "Split Screen", label: "3 Screen",  icon: "reorder-three-outline" },
  { id: "split4",   tab: "Split Screen", label: "4 Screen",  icon: "grid-outline" },
  { id: "mirror",   tab: "Split Screen", label: "Mirror",    icon: "swap-horizontal-outline" },
];
const EFFECT_IDS = EFFECTS.map((e) => e.id);

// ---------------------------------------------------------------------
// STICKERS (camera "Stickers" panel) = light / frame effects on the
// whole video. Preview: components/camera/StickerOverlay.js
// Server: stickerFilter() below.
// ---------------------------------------------------------------------
const STICKERS = [
  { id: "neon",     label: "Neon",     colors: ["#ff00e6", "#00e5ff"] },
  { id: "sunset",   label: "Sunset",   colors: ["#ff5e00", "#ff0066"] },
  { id: "ocean",    label: "Ocean",    colors: ["#00c8ff", "#3a00ff"] },
  { id: "rainbow",  label: "Rainbow",  colors: ["#ff0040", "#ffd000", "#00ff80", "#0080ff"] },
  { id: "purple",   label: "Purple",   colors: ["#8a2be2", "#ff00aa"] },
  { id: "gold",     label: "Gold",     colors: ["#ffd700", "#ff7a00"] },
  { id: "pinkframe",label: "Love",     colors: ["#ff4fa3", "#ff9ccf"], frame: true },
  { id: "cinema",   label: "Cinema",   colors: ["#000000", "#333333"], frame: true },
  { id: "polaroid", label: "Polaroid", colors: ["#ffffff", "#e8e8e8"], frame: true },
  { id: "vhs",      label: "VHS",      colors: ["#1b1b1b", "#ff2d55"] },
];
const STICKER_IDS = STICKERS.map((x) => x.id);

// ---------------------------------------------------------------------
// PARSE / NORMALISE  (never trust the client)
// ---------------------------------------------------------------------
function parseFx(input) {
  let o = input;
  if (typeof input === "string") {
    try { o = JSON.parse(input); } catch (_) { o = null; }
  }
  if (!o || typeof o !== "object") o = {};

  const speedRaw = num(o.speed, 1);
  const speed = SPEED_VALUES.reduce((best, s) =>
    Math.abs(s - speedRaw) < Math.abs(best - speedRaw) ? s : best, 1);

  const beauty = {};
  BEAUTY_LIVE_IDS.forEach((id) => {
    const v = Math.round(clamp(num(o.beauty && o.beauty[id], 0), 0, 100));
    if (v > 0) beauty[id] = v;
  });

  // Segment recording: kept parts of the RAW camera file (seconds).
  const keep = [];
  if (Array.isArray(o.keep)) {
    o.keep.slice(0, 40).forEach((r) => {
      if (!Array.isArray(r)) return;
      const a = r3(clamp(num(r[0], 0), 0, 300));
      const b = r3(clamp(num(r[1], 0), 0, 300));
      if (b - a >= 0.05 && (!keep.length || a >= keep[keep.length - 1][1] - 0.001)) keep.push([a, b]);
    });
  }

  // Timed effects (Edit -> Effect, press & hold): OUTPUT seconds.
  const ranges = [];
  if (Array.isArray(o.ranges)) {
    o.ranges.slice(0, 12).forEach((r) => {
      if (!r || !EFFECT_IDS.includes(r.m)) return;
      const a = r3(clamp(num(r.s, 0), 0, 120));
      const b = r3(clamp(num(r.e, 0), 0, 120));
      if (b - a >= 0.05) ranges.push({ m: r.m, s: a, e: b });
    });
  }

  // Time Magic: repeat / slow-mo 1 second at `at` (OUTPUT seconds)
  let magic = null;
  if (o.magic && (o.magic.type === "repeat" || o.magic.type === "slow")) {
    magic = { type: o.magic.type, at: r3(clamp(num(o.magic.at, 0), 0, 120)) };
  }

  // Graffiti strokes: { c: "#rrggbb", w: 0..0.05, p: [[x,y],...] } (0..1)
  const graffiti = [];
  let pts = 0;
  if (Array.isArray(o.graffiti)) {
    o.graffiti.slice(0, 60).forEach((st) => {
      if (!st || !Array.isArray(st.p) || pts > 3000) return;
      const c = /^#[0-9a-fA-F]{6}$/.test(st.c) ? st.c : "#ffffff";
      const w = r3(clamp(num(st.w, 0.01), 0.002, 0.05));
      const p = st.p.slice(0, 400)
        .filter((q) => Array.isArray(q))
        .map((q) => [r3(clamp(num(q[0], 0), 0, 1)), r3(clamp(num(q[1], 0), 0, 1))]);
      if (p.length >= 1) { pts += p.length; graffiti.push({ c, w, p }); }
    });
  }

  return {
    speed,
    intensity: Math.round(clamp(num(o.intensity, 100), 0, 100)),
    beauty,
    lipColor: /^#[0-9a-fA-F]{6}$/.test(o.lipColor) ? o.lipColor.toLowerCase() : DEFAULT_LIP,
    motion: EFFECT_IDS.includes(o.motion) ? o.motion : "none",
    musicStart: r3(clamp(num(o.musicStart, 0), 0, 600)),
    keep,
    ranges,
    sticker: STICKER_IDS.includes(o.sticker) ? o.sticker : "none",
    magic,
    graffiti,
  };
}

const isDefaultFx = (fx) => {
  const f = parseFx(fx);
  return f.speed === 1 && f.intensity === 100 && Object.keys(f.beauty).length === 0 &&
    f.motion === "none" && f.musicStart === 0 && !f.keep.length && !f.ranges.length &&
    f.sticker === "none" && !f.magic && !f.graffiti.length;
};

// Only what differs from default is sent (keeps URLs short).
function stringifyFx(fx) {
  const f = parseFx(fx);
  const o = {};
  if (f.speed !== 1) o.speed = f.speed;
  if (f.intensity !== 100) o.intensity = f.intensity;
  if (Object.keys(f.beauty).length) o.beauty = f.beauty;
  if (f.motion !== "none") o.motion = f.motion;
  if (f.musicStart > 0) o.musicStart = f.musicStart;
  if (f.lipColor !== DEFAULT_LIP && f.beauty.lipstick) o.lipColor = f.lipColor;
  if (f.keep.length) o.keep = f.keep;
  if (f.ranges.length) o.ranges = f.ranges;
  if (f.sticker !== "none") o.sticker = f.sticker;
  if (f.magic) o.magic = f.magic;
  if (f.graffiti.length) o.graffiti = f.graffiti;
  return Object.keys(o).length ? JSON.stringify(o) : "";
}

// ---------------------------------------------------------------------
// SERVER: ffmpeg pieces
// ---------------------------------------------------------------------
// Final output duration of a raw clip after speed change.
const outputDuration = (rawSec, fx) => rawSec / parseFx(fx).speed;

// atempo accepts 0.5..100 per instance, so chain for slow-mo.
function atempoChain(speed) {
  const parts = [];
  let s = speed;
  while (s < 0.5) { parts.push("atempo=0.5"); s /= 0.5; }
  parts.push(`atempo=${r3(s)}`);
  return parts.join(",");
}

// Motion effect -> ffmpeg filter graph segment (single input, single
// output). W/H = real video size (even numbers).
function motionFilter(id, W, H) {
  W = Math.max(2, Math.floor((W || 720) / 2) * 2);
  H = Math.max(2, Math.floor((H || 1280) / 2) * 2);
  const half = (v) => Math.max(2, Math.floor(v / 4) * 2);
  switch (id) {
    case "enlarge":
      return `scale=w='trunc(${W}*(1.1+0.1*sin(2*PI*t*1.2))/2)*2':h=-2:eval=frame,crop=${W}:${H}`;
    case "glitch":
      return `rgbashift=rh='-8':bh='8':edge=smear,noise=alls=10:allf=t,` +
        `crop=w=${W}:h=${H}:x='if(lt(mod(t,1.3),0.12),8*sin(t*90),0)':y=0,pad=${W}:${H}`;
    case "soulout":
      return "tmix=frames=5:weights='1 0.7 0.45 0.25 0.12'";
    case "hotwave":
      return "hue=h='90*sin(2*PI*t*0.6)':s=1.35";
    case "flash":
      return "eq=brightness='0.35*lt(mod(t,0.9),0.08)':eval=frame";
    case "shake":
      return `crop=${W - 24}:${H - 24}:x='12+12*sin(t*38)':y='12+12*cos(t*33)',scale=${W}:${H}`;
    case "dreamy":
      return "split[fxa][fxb];[fxb]gblur=sigma=14[fxg];[fxa][fxg]blend=all_mode=screen:all_opacity=0.45";
    case "sparkle":
      return "split[fxa][fxb];[fxb]lutyuv=y='if(gt(val,215),255,0)',gblur=sigma=6[fxg];[fxa][fxg]blend=all_mode=screen:all_opacity=0.8";
    case "rainbow":
      return "hue=h='t*120'";
    case "oldfilm":
      return "hue=s=0.25,colorbalance=rm=0.15:bm=-0.12,noise=alls=22:allf=t,vignette=angle=PI/4";
    case "split2": {
      const h = half(H);
      return `crop=${W}:${h}:0:(ih-${h})/2,split[fxa][fxb];[fxa][fxb]vstack=inputs=2,scale=${W}:${H}`;
    }
    case "split3": {
      const h = Math.max(2, Math.floor(H / 6) * 2);
      return `crop=${W}:${h}:0:(ih-${h})/2,split=3[fxa][fxb][fxc];[fxa][fxb][fxc]vstack=inputs=3,scale=${W}:${H}`;
    }
    case "split4":
      return `scale=${half(W)}:${half(H)},split=4[fxa][fxb][fxc][fxd];[fxa][fxb]hstack[fxt];[fxc][fxd]hstack[fxu];[fxt][fxu]vstack,scale=${W}:${H}`;
    case "mirror":
      return `crop=${half(W)}:${H}:(iw-${half(W)})/2:0,split[fxa][fxb];[fxb]hflip[fxc];[fxa][fxc]hstack,scale=${W}:${H}`;
    default:
      return "";
  }
}

// ---------------------------------------------------------------------
// FILTER + INTENSITY + BEAUTY -> one filter object
// ---------------------------------------------------------------------
// Used by the preview overlay (toOverlay) and the server (toFfmpegChain)
// so both always agree. Returns null when nothing should be applied.
function composeFilter(filterId, fx, opts) {
  const LIB = require("./filterLibrary");
  const f = parseFx(fx);
  const base = filterId && filterId !== "none" ? LIB.get(filterId) : null;
  const scaled = base ? LIB.scaleFilter(base, f.intensity / 100) : null;
  const bp = beautyToFilterParams(f.beauty, opts && opts.skinOnly);
  const hasBeauty = Object.values(bp).some((v) => v > 0);
  if (!scaled && !hasBeauty) return null;
  const out = { ...(scaled || {}) };
  const add = (k, max) => {
    if (bp[k] > 0) out[k] = clamp((out[k] || 0) + bp[k], 0, max);
  };
  add("smooth", 1);
  add("b", 0.15);
  add("fade", 0.2);
  add("glow", 0.5);
  add("sharp", 1.2);
  add("blush", 1);
  return out;
}

// ---------------------------------------------------------------------
// SEGMENTS (keep ranges) helpers
// ---------------------------------------------------------------------
const keptSeconds = (keep, rawSec) =>
  keep && keep.length ? keep.reduce((t, r) => t + (r[1] - r[0]), 0) : rawSec;

// Raw file time -> final reel time (gaps removed, speed applied)
function rawToOut(t, keep, speed) {
  let out = 0;
  if (keep && keep.length) {
    for (const [a, b] of keep) {
      if (t <= a) break;
      out += Math.min(t, b) - a;
    }
  } else out = t;
  return out / (speed || 1);
}

// ffmpeg: drop deleted segments, close the gaps (works for VFR phones)
function keepVideoFilter(keep) {
  if (!keep || !keep.length) return "";
  const sel = keep.map(([a, b]) => `between(t,${a},${b})`).join("+");
  // offset (seconds to pull back) for the segment that frame T falls in
  let cum = 0;
  let off = "";
  keep.forEach(([a, b], k) => {
    const o = r3(a - cum);
    off = k === 0 ? `${o}` : `if(gte(T\\,${a})\\,${o}\\,${off})`;
    cum += b - a;
  });
  return `select='${sel}',setpts=PTS-(${off})/TB`;
}
function keepAudioFilter(keep) {
  if (!keep || !keep.length) return "";
  const sel = keep.map(([a, b]) => `between(t,${a},${b})`).join("+");
  return `aselect='${sel}',asetpts=N/SR/TB`;
}

// Timed effects: copy of the video with the effect, shown only between s..e
function rangeFilters(ranges, W, H) {
  return (ranges || []).map((r, i) => {
    const m = motionFilter(r.m, W, H).replace(/\[fx(\w)\]/g, `[fx${i}$1]`);
    if (!m) return "";
    return `split[rb${i}][re${i}];[re${i}]${m}[rf${i}];[rb${i}][rf${i}]overlay=enable='between(t,${r.s},${r.e})'`;
  }).filter(Boolean);
}

// Sticker (light / frame) on the whole video
function stickerFilter(id, W, H) {
  W = Math.max(2, Math.floor((W || 720) / 2) * 2);
  H = Math.max(2, Math.floor((H || 1280) / 2) * 2);
  const st = STICKERS.find((x) => x.id === id);
  if (!st) return "";
  const hex = (c) => "0x" + c.slice(1);
  switch (id) {
    case "cinema": {
      const bar = Math.round(H * 0.11);
      return `drawbox=x=0:y=0:w=iw:h=${bar}:color=black:t=fill,drawbox=x=0:y=ih-${bar}:w=iw:h=${bar}:color=black:t=fill`;
    }
    case "polaroid": {
      const iw = Math.floor((W * 0.86) / 2) * 2;
      const ih = Math.floor((H * 0.78) / 2) * 2;
      const x = Math.floor((W - iw) / 2);
      const y = Math.floor((H - ih) * 0.3);
      return `scale=${iw}:${ih},pad=${W}:${H}:${x}:${y}:white`;
    }
    case "pinkframe":
      return `drawbox=x=0:y=0:w=iw:h=ih:color=0xff4fa3@0.75:t=${Math.round(W * 0.035)}`;
    case "vhs":
      return "noise=alls=16:allf=t,rgbashift=rh=3:bh=-3,drawgrid=w=iw:h=4:t=1:c=black@0.22";
    default: {
      const cs = st.colors.map((c, i) => `c${i}=${hex(c)}`).join(":");
      return `null[stb];gradients=s=180x320:r=30:${cs}:nb_colors=${st.colors.length}:speed=0.015,` +
        `scale=${W}:${H},format=rgba,colorchannelmixer=aa=0.32[stl];[stb][stl]overlay=shortest=1,format=yuv420p`;
    }
  }
}

// Time Magic (2nd ffmpeg pass on the finished video, memory-safe):
// returns [{ss, to, slow}] pieces to concat.
function magicPieces(magic, dur) {
  if (!magic || !(dur > 1.2)) return null;
  const A = clamp(magic.at, 0, Math.max(0, dur - 1));
  const B = Math.min(dur, A + 1);
  const p = [];
  if (A > 0.05) p.push({ ss: 0, to: A });
  if (magic.type === "repeat") p.push({ ss: A, to: B }, { ss: A, to: B }, { ss: A, to: B });
  else p.push({ ss: A, to: B, slow: true });
  if (dur - B > 0.05) p.push({ ss: B, to: dur });
  return p;
}

// Graffiti -> ASS (libass draws vector paths). Each stroke is drawn
// forward+back so only the outline (= the pen line) is visible.
function graffitiToAss(strokes, W, H) {
  if (!strokes || !strokes.length) return "";
  const col = (c) => `&H00${c.slice(5, 7)}${c.slice(3, 5)}${c.slice(1, 3)}&`.toUpperCase();
  const lines = strokes.map((st) => {
    const pts = st.p.map(([x, y]) => [Math.round(x * W), Math.round(y * H)]);
    if (pts.length === 1) pts.push([pts[0][0] + 1, pts[0][1]]);
    const path = pts.concat(pts.slice(0, -1).reverse());
    const d = `m ${path[0][0]} ${path[0][1]} l ` + path.slice(1).map((q) => `${q[0]} ${q[1]}`).join(" ");
    const bord = Math.max(1, Math.round((st.w * H) / 2));
    return `Dialogue: 0,0:00:00.00,9:59:59.00,G,,0,0,0,,{\\an7\\pos(0,0)\\bord${bord}\\shad0\\1a&HFF&\\3c${col(st.c)}\\p1}${d}{\\p0}`;
  });
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nScaledBorderAndShadow: yes\n\n` +
    `[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n` +
    `Style: G,Arial,20,&H00FFFFFF,&H00FFFFFF,&H00FFFFFF,&H00000000,0,0,0,0,100,100,0,0,1,2,0,7,0,0,0,1\n\n` +
    `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` + lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------
// SKIN-ONLY BEAUTY (server): skin mask from colour (YCbCr range works for
// light AND dark skin), mask made at 1/4 size (fast), then smoothing +
// brightening merged only where the mask is skin. Background, hair,
// clothes stay sharp.
// ---------------------------------------------------------------------
function beautySkinFilter(beauty, W, H) {
  const b = beauty || {};
  const v = (id) => clamp(num(b[id], 0), 0, 100) / 100;
  const soft = v("soft");
  const white = v("white");
  const bright = v("bright");
  if (soft <= 0 && white <= 0 && bright <= 0) return "";
  W = Math.max(2, Math.floor((W || 720) / 2) * 2);
  H = Math.max(2, Math.floor((H || 1280) / 2) * 2);
  const work = [];
  if (soft > 0) {
    work.push(`smartblur=lr=${r3(2 + 3 * soft)}:ls=${r3(0.3 + 0.7 * soft)}:lt=-${Math.round(1 + 4 * soft)}`);
  }
  if (white > 0 || bright > 0) {
    work.push(`eq=brightness=${r3(0.1 * white + 0.04 * bright)}:gamma=${r3(1 + 0.35 * white + 0.15 * bright)}`);
  }
  const mw = Math.max(2, Math.floor(W / 8) * 2);
  const mh = Math.max(2, Math.floor(H / 8) * 2);
  return `split=3[bo][bs][bm];[bs]${work.join(",")}[bf];` +
    `[bm]scale=${mw}:${mh},format=yuv444p,` +
    `geq=lum='255*between(cb(X\\,Y)\\,77\\,127)*between(cr(X\\,Y)\\,133\\,173)':cb=128:cr=128,` +
    `format=yuv420p,gblur=sigma=1.5,scale=${W}:${H}[bk];[bo][bf][bk]maskedmerge=planes=1`;
}

// ---------------------------------------------------------------------
// MAKEUP (server): lipstick / kajal / blush WITHOUT face tracking.
//  - lips  = pixels clearly REDDER than the skin around them, inside a face
//  - eyes  = pixels clearly DARKER than the skin around them, inside a face
//  - blush = gentle rosy tint on skin
// Masks are computed at 1/4 size (fast) and only "near skin" areas count,
// so red clothes / walls are not painted.
// ---------------------------------------------------------------------
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

function makeupFilter(beauty, lipColor, W, H) {
  const b = beauty || {};
  const v = (id) => clamp(num(b[id], 0), 0, 100) / 100;
  const lips = v("lipstick");
  const kajal = v("kajal");
  const blush = v("blush");
  if (lips <= 0 && kajal <= 0 && blush <= 0) return "";
  W = Math.max(2, Math.floor((W || 720) / 2) * 2);
  H = Math.max(2, Math.floor((H || 1280) / 2) * 2);
  const mw = Math.max(2, Math.floor(W / 8) * 2);
  const mh = Math.max(2, Math.floor(H / 8) * 2);
  const R = r3(Math.max(2, mh / 1280 * 4 * 28 / 4)); // ~14px at 720p, in mask pixels
  const RL = r3(R * 1.8); // lips: wider ring so the lips don't hide in their own average
  const skinExpr = "255*between(cb(X\\,Y)\\,77\\,127)*between(cr(X\\,Y)\\,133\\,173)";
  const up = (lbl, out, k) =>
    `[${lbl}]scale=${W}:${H},gblur=sigma=1.2,lut=y='clip(val*${r3(k)}\\,0\\,255)',format=gbrp[${out}]`;

  const g = [];
  const parts = [];
  // base + low-res analysis copy
  g.push(`split=2[mkb][mka]`);
  g.push(`[mka]scale=${mw}:${mh},format=yuv444p,split=3[mk1][mk2][mk3]`);
  // skin mask S
  g.push(`[mk1]geq=lum='${skinExpr}':cb=128:cr=128,format=gray,split=5[mks][mksn][mksc][mksy][mksb]`);
  // blurred S (= how much skin is around) -> used as weight + "inside face"
  g.push(`[mksb]split=2[mksb1][mksb2];[mksb1]gblur=sigma=${RL}[mkSb1];[mksb2]gblur=sigma=${R},split=2[mkSb2][mkSb3]`);
  g.push(`[mksn]gblur=sigma=${R},lut=y='clip((val-150)*4\\,0\\,255)',split=2[mkn1][mkn2]`);
  // lips: red-ness (Cr) clearly above the SKIN-weighted local mean
  g.push(`[mk2]extractplanes=v,split=2[mkc][mkc2]`);
  g.push(`[mkc2][mksc]blend=all_expr='A*B/255',gblur=sigma=${RL}[mkcw]`);
  g.push(`[mkcw][mkSb1]blend=all_expr='if(gt(B\\,8)\\,A*255/B\\,255)'[mkcm]`);
  g.push(`[mkc][mkcm]blend=all_expr='clip((A-B-2)*80\\,0\\,255)',gblur=sigma=0.7,lut=y='clip((val-50)*1.4\\,0\\,255)'[mkl0];[mkl0][mkn1]blend=all_mode=multiply[mkl]`);
  // eyes: brightness clearly below the SKIN-weighted local mean
  g.push(`[mk3]extractplanes=y,split=2[mky][mky2]`);
  g.push(`[mky2][mksy]blend=all_expr='A*B/255',gblur=sigma=${R}[mkyw]`);
  g.push(`[mkyw][mkSb2]blend=all_expr='if(gt(B\\,8)\\,A*255/B\\,0)'[mkym]`);
  g.push(`[mky][mkym]blend=all_expr='clip((B-A-25)*8\\,0\\,255)'[mke0];[mke0][mkn2]blend=all_mode=multiply[mke]`);
  g.push(`[mkSb3]nullsink`);

  g.push(`[mkb]format=gbrp,split=4[mkx][mkbl][mkli][mkka]`);
  let cur = "mkx";
  if (blush > 0) {
    g.push(up("mks", "mkms", 0.4 * blush));
    g.push(`[mkbl]colorbalance=rm=0.14:gm=-0.04:bm=0.03:rs=0.06[mkbb]`);
    g.push(`[${cur}][mkbb][mkms]maskedmerge[mko1]`);
    cur = "mko1";
  } else g.push(`[mkbl]nullsink`, `[mks]nullsink`);
  if (lips > 0) {
    const [lr, lg, lb] = hexRgb(lipColor || DEFAULT_LIP);
    const k = 1.5;
    g.push(up("mkl", "mkml", 0.95 * lips));
    // lip colour + lift (dark skin par bhi lipstick saaf dikhe)
    g.push(
      `[mkli]colorchannelmixer=rr=${r3(lr * k)}:gg=${r3(lg * k)}:bb=${r3(lb * k)}:rg=${r3(lr * 0.25)},` +
      `curves=r='0/${r3(0.22 * lr)} 0.5/${r3(Math.min(1, 0.5 + 0.25 * lr))} 1/1':` +
      `g='0/${r3(0.06 * lg)} 1/1':b='0/${r3(0.08 * lb)} 1/1'[mklb]`
    );
    g.push(`[${cur}][mklb][mkml]maskedmerge[mko2]`);
    cur = "mko2";
  } else g.push(`[mkli]nullsink`, `[mkl]nullsink`);
  if (kajal > 0) {
    g.push(up("mke", "mkme", 0.9 * kajal));
    g.push(`[mkka]curves=all='0/0 0.35/0.18 0.7/0.55 1/0.9'[mkkb]`);
    g.push(`[${cur}][mkkb][mkme]maskedmerge[mko3]`);
    cur = "mko3";
  } else g.push(`[mkka]nullsink`, `[mke]nullsink`);
  g.push(`[${cur}]format=yuv420p`);
  parts.push(g.join(";"));
  return parts.join("");
}

// Live camera shader params (components/camera/BeautyCamera.js):
// colour filter + strength -> simple contrast/brightness/saturation/tint
function liveColorParams(filterId, fx) {
  const f = composeFilter(filterId, { ...parseFx(fx), beauty: {} });
  if (!f) return { contrast: 1, bright: 0, sat: 1, fade: 0, gain: 1, tint: [0, 0, 0] };
  const sh = f.sh || [0, 0, 0];
  const hi = f.hi || [0, 0, 0];
  const bl = f.blush || 0;
  const tint = [0, 1, 2].map((i) => r3((sh[i] + hi[i]) * 0.6 + (i === 0 ? bl * 0.03 : 0)));
  return {
    contrast: r3(f.c == null ? 1 : f.c),
    bright: r3((f.b || 0) + (f.glow || 0) * 0.04),
    sat: r3(f.bw ? 0 : f.s == null ? 1 : f.s),
    fade: r3(f.fade || 0),
    gain: r3(f.gain || 1),
    tint,
  };
}

module.exports = {
  makeupFilter,
  DEFAULT_LIP,
  beautySkinFilter,
  liveColorParams,
  STICKERS,
  STICKER_IDS,
  keptSeconds,
  rawToOut,
  keepVideoFilter,
  keepAudioFilter,
  rangeFilters,
  stickerFilter,
  magicPieces,
  graffitiToAss,
  composeFilter,
  SPEEDS,
  SPEED_VALUES,
  musicRateFor,
  BEAUTY,
  BEAUTY_LIVE_IDS,
  defaultBeauty,
  beautyToFilterParams,
  EFFECT_TABS,
  EFFECTS,
  EFFECT_IDS,
  parseFx,
  isDefaultFx,
  stringifyFx,
  outputDuration,
  atempoChain,
  motionFilter,
};
