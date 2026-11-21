// Bina data/kamus.js daripada teks halaman yang dibaca semula daripada imbasan (../../ocr_claude/pNNNN.txt).
// Format setiap fail (satu halaman PDF):
//   @kata panduan            (baris pertama, pilihan)
//   ↩ sambungan …            (sambungan entri dari halaman sebelumnya)
//   §ك ت ب                   (tajuk akar)
//   ¶ …                      (perenggan pengenalan huruf)
//   kata masukan : takrif    (satu entri sebaris)
// Guna: node tools/bina_kamus_bersih.js [dirInput]
// Output: data/kamus.js → window.KAMUS = { r: [[akar, halamanEPUB, huruf]], e: [[kata, takrif, akarIdx, halamanEPUB]] }
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(process.argv[2] ?? path.join(__dirname, '../../ocr_claude'));
const files = fs.readdirSync(dir).filter((f) => /^p\d{4}\.txt$/.test(f)).sort();

// Halaman permulaan setiap huruf (halaman EPUB = PDF − 1).
const LETTERS = [
  ['ء', 62], ['ب', 125], ['ت', 190], ['ث', 208], ['ج', 224], ['ح', 283], ['خ', 374], ['د', 433],
  ['ذ', 475], ['ر', 491], ['ز', 566], ['س', 599], ['ش', 662], ['ص', 714], ['ض', 760], ['ط', 782],
  ['ظ', 807], ['ع', 812], ['غ', 883], ['ف', 910], ['ق', 960], ['ك', 1020], ['ل', 1064], ['م', 1112],
  ['ن', 1164], ['ه', 1247], ['و', 1283], ['ي', 1338],
];
const letterOf = (n) => { let k = 0; LETTERS.forEach(([, s], i) => { if (s <= n) k = i; }); return k; };
const HAMZA = 'ءأإآاؤئ';
const keyOf = (r) => r.replace(/[أإآاؤئ]/g, 'ء').replace(/ى/g, 'ي').replace(/[\sً-ْ]+/g, '');

const roots = [];
const entries = [];
const warn = { badRoot: [], noColon: 0, unsure: 0, pages: 0, missing: [] };
let cur = -1;

function pushRoot(r, n, li) {
  // Tajuk sama yang berulang (cth. disambung di halaman baharu) → kekal pada akar sedia ada.
  if (cur >= 0 && roots[cur][2] === li && keyOf(roots[cur][0]) === keyOf(r)) return;
  roots.push([r, n, li]);
  cur = roots.length - 1;
}
const appendToLast = (t) => { const e = entries[entries.length - 1]; if (e) e[1] = `${e[1]} ${t}`.trim(); };

/** Pisah «kata masukan : takrif». Sebilangan entri dicetak tanpa « : »; guna penanda lain. */
function splitEntry(line) {
  const c = line.indexOf(' : ');
  if (c > 0) return [line.slice(0, c).trim(), line.slice(c + 3).trim()];
  warn.noColon++;
  const cut = (i, skip = 0) => [line.slice(0, i).trim(), line.slice(i + skip).trim()];
  let m;
  if ((m = /\s?:\s?/.exec(line)) && m.index > 0 && m.index < 80) return cut(m.index, m[0].length);
  if ((m = / مص /.exec(line))) return cut(m.index + 1);
  if ((m = / \((?:انظر|انْظُر)/.exec(line))) return cut(m.index + 1);
  if ((m = / [١٢٣] /.exec(line)) && m.index < 60) return cut(m.index + 1);
  if ((m = /^(\S+(?: \([^)]{1,20}\))?(?: ج (?:ــ \S+|\S+)(?: و\S+)*)?)\s+(.+)$/.exec(line))) return [m[1], m[2]];
  return [line, ''];
}

const seen = new Set(files.map((f) => +f.slice(1, 5)));
for (let p = 63; p <= 1347; p++) if (!seen.has(p)) warn.missing.push(p);

for (const f of files) {
  const pdf = +f.slice(1, 5);
  const n = pdf - 1;
  const li = letterOf(n);
  warn.pages++;
  if (cur < 0 || roots[cur][2] !== li) pushRoot(`— ${LETTERS[li][0]}`, n, li);
  const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r/g, '');
  warn.unsure += (text.match(/⟦\?⟧/g) || []).length;
  for (let line of text.split('\n')) {
    line = line.replace(/\s+/g, ' ').trim();
    if (!line || line.startsWith('@')) continue;
    if (line.startsWith('↩')) { appendToLast(line.replace(/^↩\s*/, '')); continue; }
    if (line.startsWith('¶')) continue; // pengenalan huruf: bukan entri
    if (line.startsWith('§')) {
      const r = line.slice(1).replace(/[ً-ْ()]/g, '').trim().replace(/\s+/g, ' ');
      const first = r[0];
      if (!(li === 0 ? HAMZA.includes(first) : first === LETTERS[li][0])) warn.badRoot.push(`${pdf}:${r}`);
      pushRoot(r, n, li);
      continue;
    }
    const [h, d] = splitEntry(line);
    entries.push([h, d, cur, n]);
  }
}

// Akar tanpa entri dibuang; indeks dipetakan semula.
const used = new Set(entries.map((e) => e[2]));
const remap = [];
const outRoots = [];
roots.forEach((r, i) => { if (used.has(i)) { remap[i] = outRoots.length; outRoots.push(r); } });
for (const e of entries) e[2] = remap[e[2]];

const out = process.env.OUT ?? path.join(__dirname, '..', 'data', 'kamus.js');
fs.writeFileSync(
  out,
  '// Dijana oleh tools/bina_kamus_bersih.js — teks dibaca semula daripada imbasan dan disemak\n' +
    '// r: [akar, halamanEPUB, indeksHuruf]   e: [kataMasukan, takrif, indeksAkar, halamanEPUB]\n' +
    `window.KAMUS=${JSON.stringify({ r: outRoots, e: entries })};\n`,
  'utf8',
);
console.log(`${warn.pages} halaman → ${outRoots.length} akar, ${entries.length} kata masukan → ${out}`);
console.log(`tanpa « : »: ${warn.noColon} · ⟦?⟧: ${warn.unsure} · akar huruf lain: ${warn.badRoot.length}${warn.badRoot.length ? ' (' + warn.badRoot.slice(0, 12).join(', ') + ')' : ''}`);
if (warn.missing.length) console.log(`halaman belum ada: ${warn.missing.length} (cth. ${warn.missing.slice(0, 8).join(', ')})`);
