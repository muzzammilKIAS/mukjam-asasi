// Susun output OCR Vision (JSON Lines daripada tools/vocrpdf) menjadi data/pages.js.
// Guna:  node tools/bina_data_vision.js <fail.jsonl...>
//
// Setiap baris JSONL: {"pdf": N, "lines": [{t, c, x0, x1, y0, y1}, ...]}
// (koordinat Vision ternormal 0–1, asal di bawah kiri).
//
// Output: window.MUKJAM_PAGES = [[halamanEPUB, teks, kataPanduan], ...]
//   halamanEPUB = halaman PDF − 1 (selaras dengan versi EPUB sebelumnya).
//   teks: entri dipisahkan dengan '\n'.
const fs = require('node:fs');
const path = require('node:path');

const files = process.argv.slice(2);
if (!files.length) throw new Error('Beri sekurang-kurangnya satu fail .jsonl');

const pageNo = /^[\s\-–—_.]*[0-9٠-٩]{1,4}[\s\-–—_.]*$/;
const endsEntry = /[.؛][\s»"')\]]*$/;

function layout(lines) {
  let rows = lines
    .map((l) => ({ ...l, t: l.t.replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.t && !(l.c < 0.3 && l.t.length < 4));

  // Kaki halaman: nombor halaman di bawah.
  rows = rows.filter((l) => !(l.y1 < 0.16 && pageNo.test(l.t)));

  // Kepala halaman: kata panduan pendek di atas sekali.
  const top = Math.max(...rows.map((l) => l.y1));
  const guide = [];
  rows = rows.filter((l) => {
    const isHead = l.y0 > 0.895 && l.x1 - l.x0 < 0.25 && top - l.y1 < 0.03 && l.t.length <= 20;
    if (isHead) guide.push(l);
    return !isHead;
  });
  // Jika semua baris "kepala" (halaman hampir kosong), kembalikan.
  if (!rows.length && guide.length) { rows = guide.splice(0); }

  // Lajur: kanan, kiri atau penuh.
  for (const l of rows) {
    l.col = l.x0 >= 0.45 ? 'R' : l.x1 <= 0.55 ? 'L' : 'F';
  }
  // Atas → bawah; kepingan pada paras sama (|Δy| kecil) disusun kanan → kiri.
  for (const l of rows) l.ym = (l.y0 + l.y1) / 2;
  rows.sort((a, b) => (Math.abs(b.ym - a.ym) < 0.006 ? b.x1 - a.x1 : b.ym - a.ym));

  const ordered = [];
  let seg = [];
  const flush = () => {
    const r = seg.filter((l) => l.col === 'R');
    const lft = seg.filter((l) => l.col === 'L');
    ordered.push(...r, ...lft);
    seg = [];
  };
  for (const l of rows) {
    if (l.col === 'F') { flush(); ordered.push(l); } else seg.push(l);
  }
  flush();

  // Gabung baris menjadi entri.
  const paras = [];
  let cur = '';
  for (const l of ordered) {
    cur = cur ? `${cur} ${l.t}` : l.t;
    if (endsEntry.test(l.t)) { paras.push(cur); cur = ''; }
  }
  if (cur) paras.push(cur);

  // Akar kata (cth. «ج ر س») menjadi baris tersendiri bertanda '§'.
  const out = [];
  for (const para of paras) {
    const t = fixBrackets(para)
      // Pemisah buku (huruf «I» tebal) → ◆
      .replace(/(^|\s)[I\]|l1](?=\s)/g, '$1◆')
      // Token sampah berdiri sendiri (cth. «%!%!») → ◆
      .replace(/(^|\s)[%!'#&|]{2,}(?=\s|$)/g, '$1◆')
      .replace(/◆(\s*◆)+/g, '◆');
    let last = 0;
    for (const m of t.matchAll(rootRe)) {
      const start = m.index + m[1].length;
      const before = t.slice(last, start).trim();
      if (before) out.push(before);
      out.push('§' + m[2].trim());
      last = start + m[2].length;
    }
    const rest = t.slice(last).trim();
    if (rest) out.push(rest);
  }

  return {
    text: out.join('\n'),
    guide: guide.sort((a, b) => b.x1 - a.x1).map((g) => g.t).join(' · '),
  };
}

/**
 * Vision kerap membaca kurungan fon buku sebagai ' '' (pembuka) dan % ! (penutup).
 * Pulihkan secara berimbang: ! hanya ditukar jika ada kurungan terbuka.
 */
function fixBrackets(t) {
  const AR = '[\\u0600-\\u06FF0-9٠-٩]';
  t = t
    .replace(new RegExp(`(^|[\\s«:])''?\\s?(?=${AR})`, 'g'), '$1(')
    .replace(new RegExp(`(^|\\s)[%!](?=${AR})`, 'g'), '$1(');
  let out = '', open = 0, quote = 0;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '(') open++;
    else if (ch === ')') open = Math.max(0, open - 1);
    else if (ch === '«') quote++;
    else if (ch === '»') quote = Math.max(0, quote - 1);
    else if ((ch === '%' || ch === '!') && i > 0 && !/\s/.test(t[i - 1]) &&
      (i + 1 === t.length || /[\s:،.؛»)]/.test(t[i + 1]))) {
      if (open > 0) { out += ')'; open--; continue; }
      if (quote > 0) { out += '»'; quote--; continue; }
      if (ch === '%') { out += ')'; continue; }
    }
    out += ch;
  }
  return out;
}

// 2–4 huruf tunggal berturutan dipisah ruang = akar kata.
const rootRe = /(^|\s)((?:[ء-ي](?:\s+|$)){2,4})(?=\S|$)/g;

// Gabung semua fail; bagi halaman yang sama, ambil versi yang paling banyak baris.
const byPdf = new Map();
for (const f of files) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const d = JSON.parse(line);
    const prev = byPdf.get(d.pdf);
    if (!prev || d.lines.length > prev.length) byPdf.set(d.pdf, d.lines);
  }
}

const pages = [];
for (const pdf of [...byPdf.keys()].sort((a, b) => a - b)) {
  const lines = byPdf.get(pdf);
  if (!lines.length) continue;
  const { text, guide } = layout(lines);
  if (!text) continue;
  pages.push(guide ? [pdf - 1, text, guide] : [pdf - 1, text]);
}

const out = process.env.OUT || path.join(__dirname, '..', '..', 'ocr_vision', 'halaman.js');
fs.writeFileSync(
  out,
  '// Dijana oleh tools/bina_data_vision.js daripada OCR Apple Vision\n' +
    '// [halamanEPUB (= PDF − 1), teks (entri dipisah \\n), kataPanduan?]\n' +
    `window.MUKJAM_PAGES=${JSON.stringify(pages)};\n`,
  'utf8',
);
console.log(`${pages.length} halaman → ${out}`);
