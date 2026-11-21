// Jana data/pages.js daripada EPUB Mukjam Asasi.
// Guna:  node tools/bina_data.js [laluan-epub]
// Perlukan `unzip`. Halaman EPUB N = halaman bercetak/PDF N + 1.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const epub = path.resolve(
  process.argv[2] ??
    path.join(root, '../../PROTOTYPE/mukjam_asasi/assets/source/mukjam_asasi.epub'),
);
const out = path.join(root, 'data/pages.js');

const decode = (v) =>
  v.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, c) => {
    if (c[0] === '#') {
      return String.fromCodePoint(
        c[1].toLowerCase() === 'x' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10),
      );
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[c.toLowerCase()];
  });

if (!fs.existsSync(epub)) throw new Error(`EPUB tidak dijumpai: ${epub}`);

const files = execFileSync('unzip', ['-Z1', epub], { encoding: 'utf8', maxBuffer: 1 << 24 })
  .split(/\r?\n/)
  .filter((n) => /^EPUB\/page_\d+\.html$/.test(n))
  .sort((a, b) => a.match(/\d+/)[0] - b.match(/\d+/)[0]);

const note = /^The text on this page is estimated to be only ([\d.]+)% accurate\s*/;
const pages = [];
for (const f of files) {
  const html = execFileSync('unzip', ['-p', epub, f], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const n = Number(html.match(/<title>\s*Page\s+(\d+)\s*<\/title>/i)?.[1]);
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  if (!Number.isInteger(n) || !body) continue;
  let text = decode(
    body.replace(/<(?:br|\/p|\/div|\/li)[^>]*>/gi, ' ').replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) continue;
  const m = text.match(note);

  if (m) text = text.slice(m[0].length).trim();
  pages.push([n, text]); // acc (ketepatan OCR) tidak disimpan lagi
}
if (!pages.length) throw new Error('Tiada teks halaman dalam EPUB.');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  '// Dijana oleh tools/bina_data.js (teks OCR EPUB lama) — [halamanEPUB, teks]\n' +
    `window.MUKJAM_PAGES=${JSON.stringify(pages)};\n`,
  'utf8',
);
console.log(`${pages.length} halaman → ${out}`);
