// Bina indeks kamus (akar → kata masukan → takrif) daripada teks halaman berstruktur.
// Guna:  node tools/bina_kamus.js [halaman.js]
// Input lalai: ../ocr_vision/halaman.js (output tools/bina_data_vision.js)
// Output: data/kamus.js → window.KAMUS = { r: [[akar, halaman, huruf]], e: [[kata, takrif, akarIdx, halaman]] }
const fs = require('node:fs');
const path = require('node:path');

const input = path.resolve(process.argv[2] ?? path.join(__dirname, '../../ocr_vision/halaman.js'));
global.window = {};
require(input);
const PAGES = window.MUKJAM_PAGES.filter(([n]) => n >= 62);

// Halaman permulaan setiap huruf (halaman EPUB = PDF − 1).
const LETTERS = [
  ['ء', 62], ['ب', 125], ['ت', 190], ['ث', 208], ['ج', 224], ['ح', 283], ['خ', 374], ['د', 433],
  ['ذ', 475], ['ر', 491], ['ز', 566], ['س', 599], ['ش', 662], ['ص', 714], ['ض', 760], ['ط', 782],
  ['ظ', 807], ['ع', 812], ['غ', 883], ['ف', 910], ['ق', 960], ['ك', 1020], ['ل', 1064], ['م', 1112],
  ['ن', 1164], ['ه', 1247], ['و', 1283], ['ي', 1338],
];
const letterOf = (n) => { let k = 0; LETTERS.forEach(([, s], i) => { if (s <= n) k = i; }); return k; };
const HAMZA = 'ءأإآاؤئ';
const validRoot = (r, li) => {
  const f = r[0];
  const parts = r.split(/\s+/);
  if (parts.length < 2 || parts.length > 4) return false;
  return li === 0 ? HAMZA.includes(f) : f === LETTERS[li][0];
};
const endsEntry = /[.؛][\s»"')\]]*$/;

const roots = [];
const entries = [];
let curRoot = -1;
let open = false; // entri terakhir belum tamat (tiada noktah)

function pushRoot(r, n, li) {
  roots.push([r, n, li]);
  curRoot = roots.length - 1;
}
function appendToLast(text) {
  const last = entries[entries.length - 1];
  if (last) last[1] = `${last[1]} ${text}`.trim();
}
/** Pecah perenggan kepada entri; entri baharu selepas «مص X» jika diikuti « : ». */
function splitEntries(p) {
  const cuts = [0];
  for (const m of p.matchAll(/مص [^\s:]+ (?=[^:◆.]{1,40} : )/g)) cuts.push(m.index + m[0].length);
  // Selepas tanda penutup: kata bertanwin atau «X ج Y» diikuti « : » = entri baharu.
  for (const m of p.matchAll(/[)»!%،] (?=(?:[^\s:]*[ً-ٍ][^\s:]*|[^\s:]+ ج [^:◆]{1,30}?) : )/g)) {
    cuts.push(m.index + m[0].length);
  }
  cuts.sort((a, b) => a - b);
  cuts.push(p.length);
  const out = [];
  for (let i = 0; i + 1 < cuts.length; i++) out.push(p.slice(cuts[i], cuts[i + 1]).trim());
  return out.filter(Boolean);
}

// ---- Akar tersirat: tajuk akar yang tidak dibaca OCR ----
// Akar baharu dalam kamus ini dibuka dengan fiil madhi tiga huruf + mudhari'
// (cth. «دَرَسَ يَدْرُسُ»). Jika hurufnya berbeza daripada akar semasa dan
// terletak selepasnya mengikut abjad, buka akar baharu.
const ORDER = 'ءبتثجحخدذرزسشصضطظعغفقكلمنهوي';
const strip = (s) => s.replace(/[ً-ٰٟـ]/g, '');
const ord = (c) => (HAMZA.includes(c) ? 0 : ORDER.indexOf(c));
let inferred = 0;
function verbRoot(h, li) {
  const words = h.split(/\s+/);
  if (words.length < 2) return null;
  const raw = words[0];
  const w = strip(raw);
  const pres = strip(words[1]);
  if (!/^ي/.test(pres) || pres.length < 3 || pres.length > 5) return null;
  let L;
  if (w.length === 3 && !/[اى]/.test(w)) L = [...w];
  else if (w.length === 2 && raw.includes('ّ')) L = [w[0], w[1], w[1]];
  // Lemah akhir: شَفَى يَشْفِي → ش ف ي ; دَعَا يَدْعُو → د ع و
  else if (w.length === 3 && /[اى]$/.test(w) && !/[اى]/.test(w.slice(0, 2))) L = [w[0], w[1], pres.endsWith('و') ? 'و' : 'ي'];
  // Lemah tengah: قَالَ يَقُولُ → ق و ل ; بَاعَ يَبِيعُ → ب ي ع
  else if (w.length === 3 && w[1] === 'ا' && pres.length === 4) L = [w[0], 'وي'.includes(pres[2]) ? pres[2] : 'و', w[2]];
  else return null;
  if (!L.every((c) => ord(c) >= 0)) return null;
  const okFirst = li === 0 ? HAMZA.includes(L[0]) : L[0] === LETTERS[li][0];
  return okFirst ? L : null;
}
/** Tajuk akar yang dibaca bercantum: token tanpa baris di depan kata masukan berbaris. */
function leadingRoot(h, li) {
  const toks = h.split(/\s+/);
  let letters = '';
  let k = 0;
  while (k < toks.length - 1 && strip(toks[k]) === toks[k] && /^[ء-ي]+$/.test(toks[k]) && letters.length + toks[k].length <= 4) {
    letters += toks[k]; k++;
  }
  // Alif awal dibenarkan dalam bahagian hamzah (اخذ = أ خ ذ).
  if (!k || letters.length < 3 || /[اى]/.test(li === 0 ? letters.slice(1) : letters)) return null;
  const next = toks[k];
  if (strip(next) === next) return null; // kata seterusnya mesti berbaris
  const L = [...letters];
  if (!L.every((c) => ord(c) >= 0)) return null;
  const okFirst = li === 0 ? HAMZA.includes(L[0]) : L[0] === LETTERS[li][0];
  return okFirst ? { L, rest: toks.slice(k).join(' ') } : null;
}
// ---- Pembetulan tajuk akar: huruf bertitik yang tersalah baca ----
const GROUPS = ['دذ', 'رز', 'سش', 'صض', 'طظ', 'عغ', 'فق', 'بتثني', 'جحخ', 'هة', 'ىيا', 'وؤ', HAMZA];
const similar = (a, b) => a === b || GROUPS.some((g) => g.includes(a) && g.includes(b));
const sameCls = (a, b) => a === b || (HAMZA.includes(a) && HAMZA.includes(b)) || ('ىي'.includes(a) && 'ىي'.includes(b));
let rootFresh = 9;
let fixed = 0;
function fixRootFromEntry(h) {
  if (rootFresh > 3 || curRoot < 0) return;
  rootFresh++;
  const H = roots[curRoot][0].split(/\s+/);
  if (H.length !== 3) return;
  const toks = h.split(/\s+/).map(strip);
  const cands = [];
  for (let t = 0; t < Math.min(3, toks.length); t++) {
    const w = toks[t];
    if (w.length === 3) cands.push([...w]);
    if (w.length === 4 && w[0] === 'ي') cands.push([...w.slice(1)]);
  }
  if (cands.length < 2) return;
  const out = H.map((hl, i) => {
    const votes = new Map();
    for (const c of cands) if (c[i] && similar(c[i], hl)) {
      const key = [...votes.keys()].find((k) => sameCls(k, c[i])) ?? c[i];
      votes.set(key, (votes.get(key) || 0) + 1);
    }
    let best = hl, bestN = 0;
    for (const [k, v] of votes) if (v > bestN) { best = k; bestN = v; }
    // Kekalkan bentuk huruf tajuk jika kelasnya sama (cth. أ/ا, ى/ي).
    if (sameCls(best, hl) && !(hl === 'ى')) return hl;
    return bestN >= 2 ? (best === 'ى' ? 'ي' : best) : hl;
  });
  if (out.join(' ') !== H.join(' ')) { roots[curRoot][0] = out.join(' '); fixed++; }
}
function laterThanCurrent(L) {
  const cur = roots[curRoot];
  if (!cur || cur[0].startsWith('—')) return true;
  const C = cur[0].split(/\s+/);
  for (let i = 0; i < Math.max(L.length, C.length); i++) {
    const a = ord(L[i] ?? ''), b = ord(C[i] ?? '');
    if (a !== b) return a > b;
  }
  return false; // sama
}

for (const [n, text] of PAGES) {
  const li = letterOf(n);
  // Akar semula jadi untuk huruf baharu jika belum ada akar.
  if (curRoot < 0 || roots[curRoot][2] !== li) {
    if (!roots.length || roots[roots.length - 1][2] !== li) pushRoot(`— ${LETTERS[li][0]}`, n, li);
  }
  let first = true;
  for (let line of text.split('\n')) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith('§')) {
      const r = line.slice(1).trim();
      if (validRoot(r, li)) { pushRoot(r, n, li); rootFresh = 0; open = false; first = false; continue; }
      line = r;
    }
    const colon = line.indexOf(' : ');
    // Baris makna bernombor («٢ ج …», «[في …]», «- …») ialah sambungan entri sebelumnya.
    const isSense = /^[\s◆]*([0-9٠-٩]|\[|[-–_]|ج\s)/.test(line);
    const hasHead = colon > 0 && colon < 60 && !(isSense && entries.length);
    if ((first && open) || !hasHead) {
      if (entries.length) appendToLast(line);
      else entries.push(['', line, curRoot, n]);
    } else {
      for (const part of splitEntries(line)) {
        const c = part.indexOf(' : ');
        if (c > 0 && c < 60 && !/^[\s◆]*([0-9٠-٩]|\[|[-–_]|ج\s)/.test(part)) {
          let h = part.slice(0, c).replace(/^[\s◆\-–_•]+/, '').trim();
          const lr = leadingRoot(h, li);
          if (lr && laterThanCurrent(lr.L)) { pushRoot(lr.L.join(' '), n, li); inferred++; h = lr.rest; }
          fixRootFromEntry(lr ? `${lr.L.join('')} ${h}` : h);
          const vr = verbRoot(h, li);
          if (vr && laterThanCurrent(vr)) { pushRoot(vr.join(' '), n, li); inferred++; }
          entries.push([h, part.slice(c + 3).trim(), curRoot, n]);
        } else appendToLast(part);
      }
    }
    open = !endsEntry.test(line);
    first = false;
  }
}

// Gabung akar bersebelahan yang hurufnya sama (tajuk + akar tersirat).
const keyOf = (r) => r.replace(/[أإآا]/g, 'ء').replace(/ى/g, 'ي').replace(/\s+/g, '');
for (let i = 1; i < roots.length; i++) {
  let j = i - 1;
  while (j >= 0 && !entries.some((e) => e[2] === j) && roots[j][2] === roots[i][2]) j--;
  if (j >= 0 && roots[j][2] === roots[i][2] && keyOf(roots[j][0]) === keyOf(roots[i][0])) {
    for (const e of entries) if (e[2] === i) e[2] = j;
  }
}

// Akar sama yang berselerak dalam huruf yang sama → satukan pada kemunculan pertama.
const firstByKey = new Map();
roots.forEach((r, i) => {
  if (r[0].startsWith('—')) return;
  const k = `${r[2]}:${keyOf(r[0])}`;
  if (!firstByKey.has(k)) firstByKey.set(k, i);
});
for (const e of entries) {
  const r = roots[e[2]];
  if (!r || r[0].startsWith('—')) continue;
  e[2] = firstByKey.get(`${r[2]}:${keyOf(r[0])}`);
}

// Buang akar tanpa entri (tajuk OCR yang rosak, atau «— X» yang tidak digunakan).
const used = new Set(entries.map((e) => e[2]));
const keep = roots.map((_, i) => used.has(i));
const remap = [];
const outRoots = [];
roots.forEach((r, i) => {
  if (!keep[i]) return;
  if (r[2] === 0 && r[0].startsWith('ا ')) r[0] = 'أ' + r[0].slice(1); // paparan hamzah
  remap[i] = outRoots.length; outRoots.push(r);
});
for (const e of entries) e[2] = remap[e[2]] ?? 0;

const out = path.join(__dirname, '..', 'data', 'kamus.js');
fs.writeFileSync(
  out,
  '// Dijana oleh tools/bina_kamus.js — indeks kamus daripada OCR Apple Vision\n' +
    '// r: [akar, halamanEPUB, indeksHuruf]   e: [kataMasukan, takrif, indeksAkar, halamanEPUB]\n' +
    `window.KAMUS=${JSON.stringify({ r: outRoots, e: entries })};\n`,
  'utf8',
);
console.log(`${outRoots.length} akar (${inferred} tersirat, ${fixed} tajuk dibetulkan), ${entries.length} kata masukan → ${out}`);
