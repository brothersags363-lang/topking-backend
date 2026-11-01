// Chalane ke liye:  node tests/profanity.test.js
const assert = require("assert");
const { findProfanity } = require("../utils/profanity");

const MUST_BLOCK = [
  "madarchod", "MADARCHOOOD", "m a d a r c h o d", "m.a.d.a.r.c.h.o.d", "ch*tiya",
  "tu chutiyapa mat kar", "bhosdike", "bhosdiwale", "b h o s d i k e", "tera lund", "bc",
  "teri gaand", "gandu", "f#ck you", "fuuuuck", "what the fuck", "$hit", "asshole",
  "you bitch", "randi", "मादरचोद", "तू रंडी है", "चूतिया", "गांडू", "भोसड़ी के", "हरामी",
  "BKL", "mkc", "bhenchod", "behen ke lode", "harami kahin ka", "l.u.n.d", "fck",
];
const MUST_PASS = [
  "class", "grand idea", "assignment", "pass the ball", "chod do yaar", "chhodo", "random",
  "mc ka kya haal", "hello bhai kaise ho", "nice video", "bahut badhiya live", "gift bhej do",
  "I love this song", "cockpit", "Dickens", "assam", "hello world 100", "brandi", "lunch kar liya",
  "cocktail", "pussycat", "analysis", "bassist", "mass", "grass", "सुंदर वीडियो", "बहुत अच्छा",
  "छोड़ दो", "चौदह",
];

let failed = 0;
for (const t of MUST_BLOCK) if (!findProfanity(t).found) { failed++; console.log("MISSED   :", t); }
for (const t of MUST_PASS) if (findProfanity(t).found) { failed++; console.log("FALSE POS:", t); }
assert.strictEqual(failed, 0, `${failed} test fail`);
console.log(`OK - ${MUST_BLOCK.length} block + ${MUST_PASS.length} pass tests`);
