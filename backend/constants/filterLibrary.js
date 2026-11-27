// =====================================================================
// FILTER LIBRARY  (one source of truth)
// ---------------------------------------------------------------------
// Same filters are used in 4 places:
//   1. Camera preview   -> toOverlay()   (approximate tint, preview only)
//   2. Edit screen      -> toOverlay()   (preview)  +  server renders it
//   3. Upload server    -> toFfmpegChain() (REAL: baked into final video)
//   4. Live (Agora)     -> toAgora()     (REAL for beauty/colour filters,
//                                         viewers see it too)
//
// CommonJS on purpose, so both the app (Metro) and server.js (Node)
// can require() it.
//
// Param meaning (same as the web filter tool):
//   c contrast, b brightness, s saturation, gam [r,g,b] gamma (>1 darker),
//   fade lifted blacks, gain highlight cap, sh/hi shadow/highlight tint,
//   vig vignette, grain film grain, bw black&white, keepRed keep only red,
//   smooth skin smoothing, blush rosy red, glow soft glow, sharp clarity,
//   flag flag overlay strength.
// =====================================================================

const FILTERS = [
  // ---- From Instagram effects you sent ----
  { id: "glossy", cat: "Portrait",      label: "Glossy",       icon: "sparkles-outline", smooth: 0.8, glow: 0.3, blush: 0.45, b: 0.03, c: 1.05, s: 1.05, sh: [-0.02, 0.02, 0], hi: [0.05, 0, 0.04] },
  { id: "drainhook", cat: "Style",   label: "drainHook V2", icon: "contrast-outline", keepRed: 1.5, c: 1.3, b: 0.06, gam: [0.9, 0.9, 0.9], glow: 0.25, grain: 0.03, vig: 0.15 },
  { id: "sunset", cat: "Scenery",      label: "Sunset",       icon: "sunny-outline",    s: 1.4, gain: 0.9, c: 1.08, gam: [1, 1.02, 1], sh: [-0.04, 0.02, 0.05], hi: [0.04, 0.015, -0.01] },
  { id: "darkfusion", cat: "Style",  label: "Dark Fusion",  icon: "moon-outline",     b: 0.03, c: 0.82, gain: 0.89, fade: 0.04, s: 0.85, vig: 0.3, grain: 0.02, sh: [-0.02, 0.02, 0.04], hi: [0.005, 0, 0] },
  { id: "colourful", cat: "Vibes",   label: "Colourful",    icon: "color-palette-outline", s: 1.45, c: 1.15, gain: 0.93, sharp: 0.6, sh: [-0.02, 0, 0.04], hi: [0.03, 0.01, -0.005] },
  { id: "january", cat: "Vibes",     label: "January",      icon: "snow-outline",     smooth: 0.8, blush: 0.6, glow: 0.25, fade: 0.03, b: 0.03, s: 1.1, sh: [0.03, 0, 0.05], hi: [0.06, 0.01, 0.05] },
  { id: "indonesia", cat: "Vibes",   label: "Indonesia",    icon: "flag-outline",     flag: 0.35, smooth: 0.4, s: 1.1, c: 1.05 },
  { id: "smoothskin", cat: "Portrait",  label: "Smooth skin",  icon: "happy-outline",    smooth: 0.95, glow: 0.15, blush: 0.1, b: 0.02, s: 1.05 },
  { id: "darkshade", cat: "Style",   label: "Dark Shade",   icon: "contrast-outline", smooth: 0.6, blush: 0.9, glow: 0.2, c: 1.1, s: 1.2, gain: 0.95, vig: 0.35, sh: [0, 0, 0.05], hi: [0.05, 0, 0.04] },

  // ---- Instagram classics ----
  { id: "clarendon", cat: "Scenery",   label: "Clarendon",    icon: "partly-sunny-outline", c: 1.2, b: 0.02, s: 1.35, gam: [1, 0.98, 0.92], sh: [-0.02, 0.03, 0.09], hi: [0, 0.03, 0.04] },
  { id: "gingham", cat: "Style",     label: "Gingham",      icon: "grid-outline",     c: 0.88, b: 0.04, fade: 0.08, s: 0.85, sh: [0.05, 0.02, 0.07], hi: [0.03, 0.02, 0] },
  { id: "juno", cat: "Scenery",        label: "Juno",         icon: "flame-outline",    c: 1.12, b: 0.01, s: 1.45, gam: [0.95, 1, 1.05], sh: [-0.03, 0.03, 0.06], hi: [0.08, 0.04, -0.03] },
  { id: "lark", cat: "Scenery",        label: "Lark",         icon: "leaf-outline",     c: 1.02, b: 0.06, s: 0.92, gam: [0.95, 0.97, 1], sh: [-0.02, 0.02, 0.06], hi: [0.02, 0.03, 0.02] },
  { id: "moon", cat: "Style",        label: "Moon",         icon: "moon-outline",     bw: 1, c: 1.1, b: 0.03, fade: 0.04, sh: [0, 0.01, 0.03], hi: [0.01, 0.02, 0.03], grain: 0.02 },
  { id: "reyes", cat: "Food",       label: "Reyes",        icon: "camera-outline",   c: 0.85, b: 0.08, fade: 0.14, s: 0.78, sh: [0.04, 0.03, 0.02], hi: [0.07, 0.04, 0], grain: 0.03 },
  { id: "valencia", cat: "Food",    label: "Valencia",     icon: "cafe-outline",     c: 1.02, b: 0.02, fade: 0.08, s: 1.1, sh: [0.04, 0.02, -0.01], hi: [0.08, 0.05, 0] },
  { id: "xpro2", cat: "Style",       label: "X-Pro II",     icon: "aperture-outline", c: 1.3, s: 1.3, vig: 0.5, gam: [1, 0.97, 0.9], sh: [-0.03, 0, 0.08], hi: [0.07, 0.05, -0.04] },
  { id: "f1977", cat: "Vibes",       label: "1977",         icon: "heart-outline",    c: 0.95, b: 0.04, fade: 0.1, s: 1.25, sh: [0.07, 0, 0.09], hi: [0.1, 0.02, 0.05], grain: 0.03 },
  { id: "lofi", cat: "Vibes",        label: "Lo-Fi",        icon: "radio-outline",    c: 1.35, s: 1.6, vig: 0.4, hi: [0.03, 0, -0.02], grain: 0.02 },
  { id: "toaster", cat: "Food",     label: "Toaster",      icon: "bonfire-outline",  c: 1.2, s: 1.2, vig: 0.55, gam: [0.9, 0.97, 1.05], sh: [0.05, 0, -0.02], hi: [0.1, 0.05, -0.04] },
  { id: "nashville", cat: "Food",   label: "Nashville",    icon: "musical-notes-outline", c: 1.1, s: 1.1, fade: 0.05, gam: [0.95, 1, 1.05], sh: [0.02, 0, 0.1], hi: [0.1, 0.04, 0.05] },

  // ---- Beauty ----
  { id: "glowgirl", cat: "Portrait",    label: "Glow Girl",    icon: "sparkles-outline", smooth: 0.7, glow: 0.35, blush: 0.35, b: 0.04, c: 1.03, s: 1.1, hi: [0.04, 0.02, 0.02] },
  { id: "rosy", cat: "Portrait",        label: "Rosy",         icon: "rose-outline",     smooth: 0.5, blush: 0.8, fade: 0.03, s: 1.1, sh: [0.05, 0, 0.03], hi: [0.08, 0.02, 0.04] },
  { id: "softskin", cat: "Portrait",    label: "Soft Skin",    icon: "water-outline",    smooth: 0.9, glow: 0.2, b: 0.03, c: 0.97 },
  { id: "barbie", cat: "Portrait",      label: "Barbie",       icon: "heart-circle-outline", smooth: 0.6, blush: 0.6, glow: 0.3, b: 0.05, s: 1.2, sh: [0.06, 0, 0.08], hi: [0.1, 0.03, 0.08] },
  { id: "hotred", cat: "Vibes",      label: "Hot Red",      icon: "flame-outline",    smooth: 0.5, blush: 1, c: 1.1, s: 1.25, vig: 0.2, hi: [0.05, 0, 0.01] },
  // ---- GLAM looks (ladkiyon ke makeup filters) ----
  // `look` = beauty preset jo filter chunte hi lag jata hai:
  // lipstick (sirf hoth), kajal (aankh), blush, smooth, whitening.
  { id: "hotlips",     cat: "Glam", label: "Hot Lips",     icon: "heart",            s: 1.08, c: 1.04, hi: [0.02, 0, 0.01],
    look: { lipColor: "#d10f2e", beauty: { soft: 50, white: 25, lipstick: 85, kajal: 30, blush: 20 } } },
  { id: "pinkglow",    cat: "Glam", label: "Pink Glow",    icon: "flower-outline",   s: 1.05, glow: 0.15, hi: [0.04, 0, 0.03],
    look: { lipColor: "#ff4f8b", beauty: { soft: 60, white: 40, lipstick: 55, blush: 55 } } },
  { id: "glamdoll",    cat: "Glam", label: "Glam Doll",    icon: "diamond-outline",  c: 1.08, s: 1.1, vig: 0.05,
    look: { lipColor: "#a0001e", beauty: { soft: 70, white: 45, lipstick: 90, kajal: 60, blush: 30 } } },
  { id: "naturalglow", cat: "Glam", label: "Natural Glow", icon: "leaf-outline",     b: 0.02,
    look: { lipColor: "#c0606a", beauty: { soft: 40, white: 20, lipstick: 35, blush: 15 } } },

  // ---- Portrait pack (camera "Beauty > Filter > Portrait") ----
  { id: "cherry",      cat: "Portrait", label: "Cherry",     icon: "heart-outline",    smooth: 0.55, blush: 0.55, glow: 0.2, b: 0.03, s: 1.12, sh: [0.03, 0, 0.02], hi: [0.07, 0.01, 0.03] },
  { id: "chocolate",   cat: "Portrait", label: "Chocolate",  icon: "cafe-outline",     smooth: 0.4, c: 1.08, s: 0.95, gam: [0.97, 1, 1.05], sh: [0.04, 0.02, -0.01], hi: [0.06, 0.03, -0.02] },
  { id: "vintage",     cat: "Portrait", label: "Vintage",    icon: "film-outline",     smooth: 0.3, c: 0.92, fade: 0.1, s: 0.8, sh: [0.05, 0.03, 0], hi: [0.07, 0.05, -0.01], grain: 0.025, vig: 0.2 },
  { id: "salty",       cat: "Portrait", label: "Salty",      icon: "water-outline",    smooth: 0.45, b: 0.05, c: 0.95, s: 0.9, sh: [-0.02, 0.01, 0.05], hi: [0.02, 0.03, 0.05] },
  { id: "modern",      cat: "Portrait", label: "Modern",     icon: "cube-outline",     smooth: 0.35, c: 1.15, s: 1.05, sharp: 0.4, sh: [-0.02, 0, 0.03], hi: [0.03, 0.02, 0] },
  { id: "shimmer",     cat: "Portrait", label: "Shimmer",    icon: "star-outline",     smooth: 0.6, glow: 0.4, b: 0.04, s: 1.08, hi: [0.05, 0.04, 0.05] },
  { id: "dreamland",   cat: "Portrait", label: "Dreamland",  icon: "cloudy-night-outline", smooth: 0.7, glow: 0.35, fade: 0.05, s: 0.95, sh: [0.02, 0, 0.06], hi: [0.06, 0.02, 0.07] },
  { id: "bubbles",     cat: "Portrait", label: "Bubbles",    icon: "ellipse-outline",  smooth: 0.65, blush: 0.4, glow: 0.25, b: 0.05, s: 1.05, sh: [0.02, 0.01, 0.06], hi: [0.05, 0.03, 0.07] },
  { id: "sweety",      cat: "Portrait", label: "Sweety",     icon: "ice-cream-outline", smooth: 0.7, blush: 0.7, glow: 0.3, b: 0.05, s: 1.15, sh: [0.05, 0, 0.05], hi: [0.09, 0.02, 0.06] },

  // ---- Scenery / Food / Style / Vibes extras ----
  { id: "fresh",       cat: "Scenery",  label: "Fresh",      icon: "leaf-outline",     c: 1.06, b: 0.03, s: 1.25, gam: [1, 0.96, 1], sh: [-0.02, 0.03, 0.02], hi: [0.02, 0.04, 0] },
  { id: "skyblue",     cat: "Scenery",  label: "Sky Blue",   icon: "cloud-outline",    c: 1.08, s: 1.15, gam: [1.03, 1, 0.94], sh: [-0.03, 0, 0.07], hi: [0, 0.02, 0.06] },
  { id: "tasty",       cat: "Food",     label: "Tasty",      icon: "pizza-outline",    c: 1.12, s: 1.35, b: 0.02, sharp: 0.4, sh: [0.03, 0.01, -0.02], hi: [0.07, 0.04, -0.02] },
  { id: "creamy",      cat: "Food",     label: "Creamy",     icon: "cafe-outline",     c: 0.95, b: 0.05, fade: 0.05, s: 1.05, sh: [0.04, 0.03, 0.01], hi: [0.06, 0.05, 0.02] },
  { id: "noir",        cat: "Style",    label: "Noir",       icon: "contrast-outline", bw: 1, c: 1.35, vig: 0.4, grain: 0.03 },
  { id: "neon",        cat: "Vibes",    label: "Neon",       icon: "flash-outline",    c: 1.2, s: 1.5, sh: [0.02, -0.02, 0.09], hi: [0.08, -0.01, 0.07], vig: 0.25 },
];

const BY_ID = {};
FILTERS.forEach((f) => { BY_ID[f.id] = f; });

const ids = () => FILTERS.map((f) => f.id);
const get = (id) => BY_ID[id] || null;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const n = (v, d = 3) => Number(v.toFixed(d));


// ---------------------------------------------------------------------
// CATEGORIES + INTENSITY (camera "Filter" sheet: Portrait/Scenery/...)
// ---------------------------------------------------------------------
const CATEGORIES = ["Glam", "Portrait", "Scenery", "Food", "Style", "Vibes"];
const byCategory = (cat) => FILTERS.filter((f) => (f.cat || "Vibes") === cat);

// Scale a filter towards "original" by k (0..1). 1 = full filter,
// 0.5 = half strength. Used for the 0-100 intensity slider, both in the
// preview overlay and in the server render (so they always match).
function scaleFilter(f, k) {
  if (!f) return null;
  k = clamp(Number.isFinite(+k) ? +k : 1, 0, 1);
  if (k >= 0.999) return f;
  const lerp1 = (v) => (v == null ? v : 1 + (v - 1) * k);
  const mul = (v) => (v == null ? v : v * k);
  const arr = (a) => (Array.isArray(a) ? a.map((x) => x * k) : a);
  const out = { ...f };
  ["c", "s"].forEach((p) => { if (out[p] != null) out[p] = lerp1(out[p]); });
  if (out.gain != null) out.gain = lerp1(out.gain);
  if (out.gam) out.gam = out.gam.map((g) => 1 + (g - 1) * k);
  ["b", "fade", "vig", "grain", "smooth", "blush", "glow", "sharp", "flag"].forEach((p) => { if (out[p] != null) out[p] = mul(out[p]); });
  out.sh = arr(out.sh);
  out.hi = arr(out.hi);
  // black & white / keep-red can't be "half on" in ffmpeg's hue filter,
  // so below full strength they turn into reduced saturation instead.
  if (out.bw) { delete out.bw; out.s = 1 - k; }
  if (out.keepRed && k < 0.6) { delete out.keepRed; out.s = (out.s == null ? 1 : out.s); }
  return out;
}

// ---------------------------------------------------------------------
// 1) SERVER: ffmpeg -vf chain (baked into the final video)
// ---------------------------------------------------------------------
// Skin smoothing / blush / glow are applied to the WHOLE frame here
// (ffmpeg has no face or skin mask), so they are kept gentle.
function toFfmpegChain(f) {
  if (!f) return [];
  const out = [];

  if (f.smooth) {
    out.push(`smartblur=lr=2:ls=${n(0.4 + 0.6 * f.smooth, 2)}:lt=${Math.round(6 + 10 * f.smooth)}`);
  }
  if (f.bw) out.push("hue=s=0");
  if (f.keepRed) out.push("colorhold=color=0xC8202F:similarity=0.3:blend=0.15");

  // eq: contrast / brightness / saturation / gamma
  const g = f.gam || [1, 1, 1];
  const bright = (f.b || 0) + (f.glow ? f.glow * 0.05 : 0);
  const sat = f.keepRed ? 1.2 : (f.s == null ? 1 : f.s);
  out.push(
    `eq=contrast=${n(f.c || 1)}:brightness=${n(bright)}:saturation=${n(sat)}` +
    `:gamma_r=${n(1 / g[0])}:gamma_g=${n(1 / g[1])}:gamma_b=${n(1 / g[2])}`
  );

  // lifted blacks (fade) and capped highlights (gain)
  if (f.fade || (f.gain && f.gain < 1)) {
    const lo = n(f.fade || 0);
    const hi = n(f.gain || 1);
    out.push(`colorlevels=romin=${lo}:gomin=${lo}:bomin=${lo}:romax=${hi}:gomax=${hi}:bomax=${hi}`);
  }

  // shadow / highlight tint (+ rosy blush on midtones)
  const sh = f.sh || [0, 0, 0];
  const hi = f.hi || [0, 0, 0];
  const bl = f.blush || 0;
  if (sh.some(Boolean) || hi.some(Boolean) || bl) {
    const k = 3;
    const v = (x) => n(clamp(x * k, -1, 1));
    out.push(
      `colorbalance=rs=${v(sh[0])}:gs=${v(sh[1])}:bs=${v(sh[2])}` +
      `:rm=${n(clamp(bl * 0.1, 0, 1))}:gm=${n(-bl * 0.02)}:bm=${n(bl * 0.02)}` +
      `:rh=${v(hi[0])}:gh=${v(hi[1])}:bh=${v(hi[2])}`
    );
  }

  if (f.sharp) out.push(`unsharp=7:7:${n(f.sharp * 1.2, 2)}:7:7:0`);

  if (f.flag) {
    const a = n(f.flag, 2);
    out.push(`drawbox=x=0:y=0:w=iw:h=ih/2:color=0xD6112A@${a}:t=fill`);
    out.push(`drawbox=x=0:y=ih/2:w=iw:h=ih/2:color=0xF4F4F4@${a}:t=fill`);
  }

  if (f.vig) out.push(`vignette=angle=${n(Math.PI * (0.3 - 0.3 * f.vig))}`);
  if (f.grain) out.push(`noise=alls=${Math.round(f.grain * 250)}:allf=t`);

  out.push("format=yuv420p");
  return out;
}

// ---------------------------------------------------------------------
// 2) LIVE: Agora options (viewers see this too)
// ---------------------------------------------------------------------
// Agora can do beauty (smooth / lighten / redness / sharpness) and colour
// enhance. It can NOT do per-filter colour grading like Clarendon, so
// those map to the closest colour-enhance strength only.
function toAgora(f) {
  const hasBeauty = !!(f.smooth || f.blush || f.glow || f.sharp);
  const beauty = hasBeauty
    ? {
        lighteningContrastLevel: (f.c || 1) > 1.15 ? 2 : (f.c || 1) < 0.9 ? 0 : 1,
        lighteningLevel: n(clamp(0.2 + (f.glow || 0) * 1.2 + (f.b || 0) * 3, 0, 1), 2),
        smoothnessLevel: n(clamp(f.smooth || 0, 0, 1), 2),
        rednessLevel: n(clamp(f.blush || 0, 0, 1), 2),
        sharpnessLevel: n(clamp(f.sharp || 0.1, 0, 1), 2),
      }
    : null;
  const sat = f.s == null ? 1 : f.s;
  const color = sat > 1.05 ? { strengthLevel: n(clamp((sat - 1) * 1.6, 0, 1), 2), skinProtectLevel: 0.8 } : null;
  return { beauty, color };
}

// Ready-to-use entries for videolive.tsx's FILTERS array
const emojiFor = (f) => (f.smooth || f.blush ? "✨" : f.bw || f.keepRed ? "🖤" : f.flag ? "🚩" : "🎨");
function liveFilters() {
  return FILTERS.map((f) => {
    const a = toAgora(f);
    return { id: f.id, label: f.label, icon: emojiFor(f), beauty: a.beauty, color: a.color };
  });
}

// ---------------------------------------------------------------------
// 3) PREVIEW OVERLAY for the camera / edit screen (approximation only)
// ---------------------------------------------------------------------
// Returns plain data; components/FilterOverlay.js draws it.
function toOverlay(f) {
  if (!f) return null;
  const sh = f.sh || [0, 0, 0];
  const hi = f.hi || [0, 0, 0];
  const tv = [0, 1, 2].map((i) => (sh[i] + hi[i]) / 2 + (i === 0 ? (f.blush || 0) * 0.04 : 0));
  const hasTint = tv.some((x) => Math.abs(x) > 0.004);
  const rgb = tv.map((x) => Math.round(clamp(128 + x * 1600, 0, 255)));
  const sat = f.bw || f.keepRed ? 0 : f.s == null ? 1 : f.s;
  return {
    desaturate: sat < 1 ? n(clamp(1 - sat, 0, 1), 2) : 0,   // gray layer, 'saturation' blend
    tint: hasTint ? { color: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`, opacity: 0.55 } : null, // 'soft-light'
    lift: f.fade ? n(clamp(f.fade * 2.2, 0, 0.4), 2) : 0,   // white layer
    dim: f.gain && f.gain < 1 ? n(clamp((1 - f.gain) * 1.2, 0, 0.3), 2) : 0, // black layer
    glow: f.glow || f.b > 0.04 ? n(clamp((f.glow || 0) * 0.25 + (f.b || 0) * 1.2, 0, 0.3), 2) : 0,
    vignette: f.vig || 0,
    flag: f.flag || 0,
  };
}

module.exports = { FILTERS, CATEGORIES, byCategory, scaleFilter, ids, get, toFfmpegChain, toAgora, liveFilters, toOverlay };
