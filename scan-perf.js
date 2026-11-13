// scan-perf.js  --  project ke root folder (jaha package.json hai) me chalao:
//   node scan-perf.js
// Ye sirf code padhta hai, kuch badalta nahi. Batata hai kaun si file app ko hang kar sakti hai.
const fs = require('fs');
const path = require('path');

const ROOTS = ['app', 'components', 'context', 'utils'];
const EXT = /\.(js|jsx|ts|tsx)$/;

const CHECKS = [
  { key: 'setInterval',     re: /setInterval\(/g,                          weight: 3, why: 'har baar JS thread jagata hai' },
  { key: 'onSnapshot',      re: /onSnapshot\(/g,                           weight: 3, why: 'live Firestore listener, data aate hi re-render' },
  { key: 'Animated.loop',   re: /Animated\.loop/g,                         weight: 2, why: 'band na ho to hamesha chalta rehta hai' },
  { key: 'nativeDriver:false', re: /useNativeDriver:\s*false/g,            weight: 4, why: 'animation JS thread par chalti hai (tap atkate hain)' },
  { key: 'console.log',     re: /console\.(log|warn|info)\(/g,             weight: 1, why: 'debug build me slow karta hai' },
  { key: 'AsyncStorage.set',re: /AsyncStorage\.setItem/g,                  weight: 1, why: 'bar bar disk write' },
  { key: 'router.push',     re: /router\.(push|replace|navigate)\(/g,      weight: 0, why: '' },
  { key: 'useState',        re: /useState\(/g,                             weight: 0, why: '' },
  { key: 'useEffect',       re: /useEffect\(/g,                            weight: 0, why: '' },
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

const rows = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = fs.readFileSync(file, 'utf8');
    const counts = {};
    let score = 0;
    for (const c of CHECKS) {
      const n = (src.match(c.re) || []).length;
      counts[c.key] = n;
      score += n * c.weight;
    }
    const kb = Math.round(src.length / 1024);
    score += Math.floor(kb / 20);              // badi file = mount hone me der
    const hasFocusGuard = /useIsFocused|useFocusEffect/.test(src);
    const hasNavGuard = /navLock|isNavigating|lastNav|navigatingRef/.test(src);
    rows.push({ file, kb, score, counts, hasFocusGuard, hasNavGuard });
  }
}

rows.sort((a, b) => b.score - a.score);

console.log('\n=== SABSE BHARI 15 FILES (score zyada = zyada shak) ===\n');
console.log('score  KB    interval snapshot animLoop nativeFalse  focusGuard navGuard  file');
for (const r of rows.slice(0, 15)) {
  console.log(
    String(r.score).padEnd(6),
    String(r.kb).padEnd(5),
    String(r.counts['setInterval']).padEnd(8),
    String(r.counts['onSnapshot']).padEnd(8),
    String(r.counts['Animated.loop']).padEnd(8),
    String(r.counts['nativeDriver:false']).padEnd(11),
    (r.hasFocusGuard ? 'yes' : 'NO').padEnd(10),
    (r.hasNavGuard ? 'yes' : 'NO').padEnd(8),
    r.file
  );
}

console.log('\n=== Interval / loop wali file me focus guard NAHI (screen chhodne ke baad bhi chalti rahengi) ===');
for (const r of rows) {
  const busy = r.counts['setInterval'] + r.counts['Animated.loop'] + r.counts['onSnapshot'];
  if (busy > 0 && !r.hasFocusGuard) console.log(' -', r.file, `(timers/listeners: ${busy})`);
}

console.log('\n=== Navigation karne wali file jisme double-tap guard NAHI (tap atke to 4-6 baar push ho sakta hai) ===');
for (const r of rows) {
  if (r.counts['router.push'] >= 3 && !r.hasNavGuard) console.log(' -', r.file, `(router calls: ${r.counts['router.push']})`);
}

console.log('\n=== 150 KB se badi screens (mount hone me der = pehla tap kho jata hai) ===');
for (const r of rows) if (r.kb >= 150) console.log(' -', r.file, r.kb + ' KB');

const rootLayout = ['app/_layout.tsx', 'app/_layout.js'].find(fs.existsSync);
if (rootLayout) {
  const s = fs.readFileSync(rootLayout, 'utf8');
  console.log('\n=== Root layout check ===');
  if (/usePathname|useGlobalSearchParams/.test(s))
    console.log(' - ' + rootLayout + ': usePathname/useGlobalSearchParams hai -> har navigation par poora root re-render hota hai');
}

const ctx = 'context/LiveContext.js';
if (fs.existsSync(ctx)) {
  const s = fs.readFileSync(ctx, 'utf8');
  if (!/useMemo\(/.test(s))
    console.log(' - ' + ctx + ': value useMemo me nahi hai -> har render par sab consumers re-render');
}

console.log('\nDone.\n');
