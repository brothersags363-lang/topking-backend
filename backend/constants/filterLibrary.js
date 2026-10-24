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
  { id: "glossy",      label: "Glossy",       icon: "sparkles-outline", smooth: 0.8, glow: 0.3, blush: 0.45, b: 0.03, c: 1.05, s: 1.05, sh: [-0.02, 0.02, 0], hi: [0.05, 0, 0.04] },
  { id: "drainhook",   label: "drainHook V2", icon: "contrast-outline", keepRed: 1.5, c: 1.3, b: 0.06, gam: [0.9, 0.9, 0.9], glow: 0.25, grain: 0.03, vig: 0.15 },
  { id: "sunset",      label: "Sunset",       icon: "sunny-outline",    s: 1.4, gain: 0.9, c: 1.08, gam: [1, 1.02, 1], sh: [-0.04, 0.02, 0.05], hi: [0.04, 0.015, -0.01] },
  { id: "darkfusion",  label: "Dark Fusion",  icon: "moon-outline",     b: 0.03, c: 0.82, gain: 0.89, fade: 0.04, s: 0.85, vig: 0.3, grain: 0.02, sh: [-0.02, 0.02, 0.04], hi: [0.005, 0, 0] },
  { id: "colourful",   label: "Colourful",    icon: "color-palette-outline", s: 1.45, c: 1.15, gain: 0.93, sharp: 0.6, sh: [-0.02, 0, 0.04], hi: [0.03, 0.01, -0.005] },
  { id: "january",     label: "January",      icon: "snow-outline",     smooth: 0.8, blush: 0.6, glow: 0.25, fade: 0.03, b: 0.03, s: 1.1, sh: [0.03, 0, 0.05], hi: [0.06, 0.01, 0.05] },
  { id: "indonesia",   label: "Indonesia",    icon: "flag-outline",     flag: 0.35, smooth: 0.4, s: 1.1, c: 1.05 },
  { id: "smoothskin",  label: "Smooth skin",  icon: "happy-outline",    smooth: 0.95, glow: 0.15, blush: 0.1, b: 0.02, s: 1.05 },
  { id: "darkshade",   label: "Dark Shade",   icon: "contrast-outline", smooth: 0.6, blush: 0.9, glow: 0.2, c: 1.1, s: 1.2, gain: 0.95, vig: 0.35, sh: [0, 0, 0.05], hi: [0.05, 0, 0.04] },

  // ---- Instagram classics ----
  { id: "clarendon",   label: "Clarendon",    icon: "partly-sunny-outline", c: 1.2, b: 0.02, s: 1.35, gam: [1, 0.98, 0.92], sh: [-0.02, 0.03, 0.09], hi: [0, 0.03, 0.04] },
  { id: "gingham",     label: "Gingham",      icon: "grid-outline",     c: 0.88, b: 0.04, fade: 0.08, s: 0.85, sh: [0.05, 0.02, 0.07], hi: [0.03, 0.02, 0] },
  { id: "juno",        label: "Juno",         icon: "flame-outline",    c: 1.12, b: 0.01, s: 1.45, gam: [0.95, 1, 1.05], sh: [-0.03, 0.03, 0.06], hi: [0.08, 0.04, -0.03] },
  { id: "lark",        label: "Lark",         icon: "leaf-outline",     c: 1.02, b: 0.06, s: 0.92, gam: [0.95, 0.97, 1], sh: [-0.02, 0.02, 0.06], hi: [0.02, 0.03, 0.02] },
  { id: "moon",        label: "Moon",         icon: "moon-outline",     bw: 1, c: 1.1, b: 0.03, fade: 0.04, sh: [0, 0.01, 0.03], hi: [0.01, 0.02, 0.03], grain: 0.02 },
  { id: "reyes",       label: "Reyes",        icon: "camera-outline",   c: 0.85, b: 0.08, fade: 0.14, s: 0.78, sh: [0.04, 0.03, 0.02], hi: [0.07, 0.04, 0], grain: 0.03 },
  { id: "valencia",    label: "Valencia",     icon: "cafe-outline",     c: 1.02, b: 0.02, fade: 0.08, s: 1.1, sh: [0.04, 0.02, -0.01], hi: [0.08, 0.05, 0] },
  { id: "xpro2",       label: "X-Pro II",     icon: "aperture-outline", c: 1.3, s: 1.3, vig: 0.5, gam: [1, 0.97, 0.9], sh: [-0.03, 0, 0.08], hi: [0.07, 0.05, -0.04] },
  { id: "f1977",       label: "1977",         icon: "heart-outline",    c: 0.95, b: 0.04, fade: 0.1, s: 1.25, sh: [0.07, 0, 0.09], hi: [0.1, 0.02, 0.05], grain: 0.03 },
  { id: "lofi",        label: "Lo-Fi",        icon: "radio-outline",    c: 1.35, s: 1.6, vig: 0.4, hi: [0.03, 0, -0.02], grain: 0.02 },
  { id: "toaster",     label: "Toaster",      icon: "bonfire-outline",  c: 1.2, s: 1.2, vig: 0.55, gam: [0.9, 0.97, 1.05], sh: [0.05, 0, -0.02], hi: [0.1, 0.05, -0.04] },
  { id: "nashville",   label: "Nashville",    icon: "musical-notes-outline", c: 1.1, s: 1.1, fade: 0.05, gam: [0.95, 1, 1.05], sh: [0.02, 0, 0.1], hi: [0.1, 0.04, 0.05] },

  // ---- Beauty ----
  { id: "glowgirl",    label: "Glow Girl",    icon: "sparkles-outline", smooth: 0.7, glow: 0.35, blush: 0.35, b: 0.04, c: 1.03, s: 1.1, hi: [0.04, 0.02, 0.02] },
  { id: "rosy",        label: "Rosy",         icon: "rose-outline",     smooth: 0.5, blush: 0.8, fade: 0.03, s: 1.1, sh: [0.05, 0, 0.03], hi: [0.08, 0.02, 0.04] },
  { id: "softskin",    label: "Soft Skin",    icon: "water-outline",    smooth: 0.9, glow: 0.2, b: 0.03, c: 0.97 },
  { id: "barbie",      label: "Barbie",       icon: "heart-circle-outline", smooth: 0.6, blush: 0.6, glow: 0.3, b: 0.05, s: 1.2, sh: [0.06, 0, 0.08], hi: [0.1, 0.03, 0.08] },
  { id: "hotred",      label: "Hot Red",      icon: "flame-outline",    smooth: 0.5, blush: 1, c: 1.1, s: 1.25, vig: 0.2, hi: [0.05, 0, 0.01] },
];

const BY_ID = {};
FILTERS.forEach((f) => { BY_ID[f.id] = f; });

const ids = () => FILTERS.map((f) => f.id);
const get = (id) => BY_ID[id] || null;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const n = (v, d = 3) => Number(v.toFixed(d));

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

module.exports = { FILTERS, ids, get, toFfmpegChain, toAgora, liveFilters, toOverlay };
