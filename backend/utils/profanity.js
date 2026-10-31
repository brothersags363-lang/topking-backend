// Gali (profanity) filter - Hindi (Devanagari), Hinglish (roman) aur English.
//
// Ye file CommonJS me hai taaki ek hi code teeno jagah chale:
//   - App (Expo/Metro):   import { isClean } from "../utils/profanity";
//   - Server (server.js / moderation.js): require("./utils/profanity")
//   - Cloud Function: functions/profanity.js (is file ki copy; badlav karo to dono me karo)
//
// Kaise pakadta hai:
//   1. Leetspeak:        "ch0d", "b@nc", "$hit"        -> normalize
//   2. Lambe letters:    "maaaderchoooood"              -> normalize
//   3. Beech me symbol:  "m.a.d.a.r.c.h.o.d", "m a d a r" -> jodkar check
//   4. Masked:           "ch*tiya", "f#ck"              -> vowel se badal kar check
//   5. Devanagari:       "मादरचोद", "रंडी"              -> seedha check
//
// False positive kam rakhne ke liye: chhote shabd (jaise "ass", "lund", "bc") sirf POORE
// shabd ke roop me pakde jaate hain, lambe unique gali shabd shabd ke andar bhi.
// Isliye "class", "grandi", "chodo(chhodo)" jaise normal shabd nahi katte.

"use strict";

// ---------------------------------------------------------------
// WORD LISTS  (roman, lowercase)
// ---------------------------------------------------------------

// Poore shabd ke roop me hi match honge ("ass" se "class" nahi katega)
const TOKEN_WORDS = [
  // Hinglish
  "lund", "lun", "lauda", "lavda", "loda", "lode", "lodu", "lawda", "laude",
  "gand", "gaand", "gandu", "gaandu", "gandfat", "gandmara",
  "chut", "chodu", "chudai",
  "randi", "raand", "randwa", "randiya",
  "bhosda", "bhosdi", "bhosdika", "bhosdike", "bhosadi", "bhosadike",
  "bhadwa", "bhadwe", "bhadva", "bhadve", "bhadwi", "bhadwapanti",
  "hijda",
  "bc", "bkl", "bsdk", "bhosdk", "mkc", "tmkc", "bkc", "mderchod",
  "harami", "haramzada", "haramzade", "haramkhor", "haramzadi",
  "kutiya", "dalla",
  // English
  "ass", "asshole", "dick", "cock", "cunt", "pussy", "whore", "slut", "bitch",
  "fuck", "fucker", "fucking", "fck", "fuk", "fuc", "fuking", "fcuk",
  "shit", "shitty", "bastard", "retard", "nigga", "nigger", "faggot", "fag",
  "motherfucker", "bur", "taeri ma chodun ga", " bur me land dalu ", "xxx", "sex",
  "chtiya", "chut maru", "sala", "laura", "land", "agency", "chut",
  "madhar chhod", "bal", "gar ", "bur bal", "jhhat", "laura", "",

];
// NOTE: "chod" (= chhod do) aur "rand" (= random) jaan-bujhkar list me nahi hain,
// warna normal chat kat jaati. Zarurat ho to server me admin config se jodo (setCustomWords).

// Lambe aur unique shabd: kisi bhi shabd ke ANDAR mile to bhi pakad lo
// ("madarchodd", "chutiyapa", "bhosdiwale")
const SUBSTR_WORDS = [
  "madarchod", "madrchod", "maderchod", "madharchod", "madarchud", "maderchud",
  "behenchod", "behnchod", "bhenchod", "bhanchod", "behanchod", "bahenchod",
  "bhosd", "bhosad", "bhosr",
  "chutiy", "chootiy", "chutia", "chutiye",
  "gaandu", "gandu", "gandmara", "gandfat",
  "haramzad", "haramkhor", "haraamzad", "haraamkhor",
  "bhadwa", "bhadva", "bhadwe",
  "maachod", "maakichut", "maakibhosd", "behenkilund",
  "motherfuck", "asshole", "bitch", "cunt", "whore",
  "fuck", "nigger", "faggot", "officl", "admin", 
];

// Devanagari (nukta hata kar match hota hai)
const DEVANAGARI_WORDS = [
  "मादरचोद", "मादरचोद", "बहनचोद", "भेनचोद", "बहनचोद", "भोसडी", "भोसड", "भोसडा",
  "चूतिया", "चुतिया", "चूतिये", "चुतिये", "चूत", "गांडू", "गान्डू", "गांड", "गाण्ड",
  "लंड", "लौडा", "लौड़ा", "लवडा", "लोडा", "रंडी", "रांड", "रण्डी",
  "हरामी", "हरामजादा", "हरामज़ादा", "हरामखोर", "हरामजादे", "भडवा", "भड़वा", "भडवे",
  "चोदू", "चुदाई", "चोदना",
];

// Admin dwara runtime me jode/hataye gaye shabd (server me use hota hai)
const custom = { extra: new Set(), allow: new Set() };

// ---------------------------------------------------------------
// NORMALIZE
// ---------------------------------------------------------------

const LEET = {
  "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a",
  "@": "a", "5": "s", "$": "s", "7": "t", "8": "b", "9": "g",
};

function stripInvisible(s) {
  // zero-width, soft hyphen, BOM, bidi marks
  return s.replace(/[\u200b-\u200f\u2060\u2066-\u2069\ufeff\u00ad]/g, "");
}

// "aaaa" -> "aa" (max 2 repeat)
function collapse2(s) {
  return s.replace(/(.)\1{2,}/g, "$1$1");
}
// "aa" -> "a"
function collapse1(s) {
  return s.replace(/(.)\1+/g, "$1");
}

function latinTokens(raw) {
  let s = stripInvisible(String(raw || ""));
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); // accents hatao (é -> e)
  s = s.toLowerCase();
  s = s.replace(/[0-9!|@$]/g, (c) => LEET[c] || c);
  s = s.replace(/[^a-z]+/g, " ").trim(); // baaki sab symbol/digit/emoji -> space
  if (!s) return [];
  return s.split(/\s+/);
}

// ---------------------------------------------------------------
// LOOKUP TABLES
// ---------------------------------------------------------------

const tokenSet2 = new Set();   // exact (max 2 repeat)
const tokenSet1 = new Set();   // collapse1, sirf len>=4 (chhote shabd me bahut false positive)
const substr1 = [];            // collapse1 substrings, len>=5
const devanagari = [];

function addToken(w) {
  const a = collapse2(w);
  tokenSet2.add(a);
  const b = collapse1(w);
  if (b.length >= 4) tokenSet1.add(b);
}
TOKEN_WORDS.forEach(addToken);
SUBSTR_WORDS.forEach((w) => {
  const b = collapse1(w);
  if (b.length >= 5 && !substr1.includes(b)) substr1.push(b);
});
function stripNukta(s) { return s.replace(/\u093c/g, ""); }
DEVANAGARI_WORDS.forEach((w) => {
  const n = stripNukta(w);
  if (!devanagari.includes(n)) devanagari.push(n);
});

// ---------------------------------------------------------------
// MATCHING
// ---------------------------------------------------------------

function tokenHit(tok) {
  if (!tok || custom.allow.has(tok)) return null;
  const t2 = collapse2(tok);
  if (tokenSet2.has(t2) || custom.extra.has(t2)) return tok;
  const t1 = collapse1(tok);
  if (t1.length >= 4 && (tokenSet1.has(t1) || custom.extra.has(t1))) return tok;
  if (t1.length >= 5) {
    for (let i = 0; i < substr1.length; i++) {
      if (t1.indexOf(substr1[i]) !== -1) return tok;
    }
  }
  return null;
}

function scanLatin(raw) {
  const tokens = latinTokens(raw);
  if (!tokens.length) return null;

  // 1) har token alag
  for (const t of tokens) {
    const h = tokenHit(t);
    if (h) return h;
  }

  // 2) "m a d a r c h o d" / "m.a.d.a.r" : lagatar 1-akshar wale tokens jodo
  let run = "";
  const flush = () => {
    if (run.length >= 3) {
      const h = tokenHit(run);
      if (h) return h;
    }
    run = "";
    return null;
  };
  for (const t of tokens) {
    if (t.length === 1) run += t;
    else { const h = flush(); if (h) return h; }
  }
  return flush();
}

function scanDevanagari(raw) {
  let s = stripNukta(stripInvisible(String(raw || "")));
  if (!/[\u0900-\u097f]/.test(s)) return null;
  for (const w of devanagari) {
    if (s.indexOf(w) !== -1) return w;
  }
  return null;
}

/**
 * { found: boolean, word?: string }
 */
function findProfanity(text) {
  const raw = String(text == null ? "" : text);
  if (!raw.trim()) return { found: false };

  let h = scanDevanagari(raw) || scanLatin(raw);
  if (h) return { found: true, word: h };

  // "ch*tiya", "f#ck", "m_dar": mask wale symbol ko vowel se badal kar try
  if (/[*#%_?+~^]/.test(raw)) {
    for (const v of ["a", "e", "i", "o", "u"]) {
      h = scanLatin(raw.replace(/[*#%_?+~^]/g, v));
      if (h) return { found: true, word: h };
    }
  }

  // Custom (admin) shabd jinme space/phrase ho
  if (custom.extra.size) {
    const flat = latinTokens(raw).join(" ");
    for (const w of custom.extra) {
      if (w.indexOf(" ") !== -1 && flat.indexOf(w) !== -1) return { found: true, word: w };
    }
  }
  return { found: false };
}

function containsProfanity(text) {
  return findProfanity(text).found;
}

function isClean(text) {
  return !findProfanity(text).found;
}

/** Server: admin ke shabd jodo/hatao. { extra: ["..."], allow: ["..."] } */
function setCustomWords(cfg) {
  const norm = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((w) => latinTokens(w).join(" "))
      .filter(Boolean)
      .map((w) => (w.indexOf(" ") === -1 ? collapse2(w) : w));
  custom.extra = new Set(norm(cfg && cfg.extra));
  custom.allow = new Set(norm(cfg && cfg.allow));
}

const PROFANITY_TITLE = "Gali allowed nahi hai";
const PROFANITY_MESSAGE =
  "Aapke message me galat shabd hain. Kripya izzat se baat karein.";

module.exports = {
  findProfanity,
  containsProfanity,
  isClean,
  setCustomWords,
  PROFANITY_TITLE,
  PROFANITY_MESSAGE,
};
