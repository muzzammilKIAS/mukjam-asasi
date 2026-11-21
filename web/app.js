/* Mukjam Asasi — kamus web ringan (tanpa kerangka kerja).
 * Data: data/kamus.js → window.KAMUS = { r: [[akar, halamanEPUB, indeksHuruf]], e: [[kata, takrif, indeksAkar, halamanEPUB]] }
 * Halaman EPUB N = halaman bercetak dan PDF N + 1. */
'use strict';
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = (n) => n.toLocaleString('en-US');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('mukjam2:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('mukjam2:' + k, JSON.stringify(v)); } catch { /* storan disekat */ } },
  };
  const pdfHref = (page) => `mukjam-asasi.pdf#page=${page + 1}`;

  // ---------- Normalisasi ----------
  const MARKS = /[ً-ٰٟـ]/g;
  const norm = (s) => s.replace(MARKS, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/["“”'`¹²³⁴⁵]/g, '').replace(/\s+/g, ' ').trim();
  const isMark = (c) => (c >= 0x064b && c <= 0x065f) || c === 0x0670 || c === 0x0640;
  const mapCh = (ch) => ('أإآٱ'.includes(ch) ? 'ا' : ch === 'ى' ? 'ي' : ch === 'ة' ? 'ه' : ch);
  /** Serlah [q] dalam teks berbaris (padanan tanpa baris). */
  function mark(text, q) {
    if (!q) return esc(text);
    let ns = ''; const map = [];
    for (let i = 0; i < text.length; i++) {
      if (isMark(text.charCodeAt(i)) || '"“”\'`'.includes(text[i])) continue;
      ns += mapCh(text[i]); map.push(i);
    }
    let html = '', pos = 0, from = 0;
    for (;;) {
      const p = ns.indexOf(q, from);
      if (p < 0) break;
      const s = map[p];
      let e = map[p + q.length - 1] + 1;
      while (e < text.length && isMark(text.charCodeAt(e))) e++;
      html += esc(text.slice(pos, s)) + '<mark>' + esc(text.slice(s, e)) + '</mark>';
      pos = e; from = p + q.length;
    }
    return html + esc(text.slice(pos));
  }

  // ---------- Data ----------
  const LETTERS = [
    ['ء', 'Hamzah'], ['ب', 'Ba'], ['ت', 'Ta'], ['ث', 'Tsa'], ['ج', 'Jim'], ['ح', 'Ha'], ['خ', 'Kho'], ['د', 'Dal'],
    ['ذ', 'Zal'], ['ر', 'Ra'], ['ز', 'Zai'], ['س', 'Sin'], ['ش', 'Syin'], ['ص', 'Sod'], ['ض', 'Dhod'], ['ط', 'Tho'],
    ['ظ', 'Zho'], ['ع', "'Ain"], ['غ', 'Ghain'], ['ف', 'Fa'], ['ق', 'Qaf'], ['ك', 'Kaf'], ['ل', 'Lam'], ['م', 'Mim'],
    ['ن', 'Nun'], ['ه', 'Ha'], ['و', 'Wau'], ['ي', 'Ya'],
  ];
  const K = window.KAMUS || { r: [], e: [] };
  // Sesetengah tajuk akar dicetak berganda, cth. «ش ف و / ش ف ى»: simpan setiap set huruf.
  const ROOTS = K.r.map(([r, p, l], i) => {
    const alts = r.split('/').map((s) => s.trim().split(/\s+/)).filter((a) => a[0]);
    const keys = alts.map((a) => norm(a.join('')));
    return { i, r, p, l, alts, keys, key: keys[0] || '', ents: [] };
  });
  const ENTS = K.e.map(([h, d, ri, p], i) => {
    const e = { i, h, d, ri, p, nh: norm(h), nd: null };
    ROOTS[ri]?.ents.push(e);
    return e;
  });
  const byLetter = LETTERS.map((_, li) => ROOTS.filter((r) => r.l === li));
  const entKey = (e) => `${e.p}:${e.nh}`;
  const ndOf = (e) => (e.nd ??= norm(e.d));
  const rootLabel = (r) => (r.r.startsWith('—') ? LETTERS[r.l][0] : r.r);

  // ---------- Keadaan ----------
  const S = {
    saved: new Set(store.get('saved', [])),
    recent: store.get('recent', []), // kunci akar
    theme: store.get('theme', 'system'),
    rootMarks: store.get('rootMarks', true),
  };
  const ROOT_BY_KEY = new Map(ROOTS.map((r) => [`${r.p}:${r.r}`, r]));
  const rKey = (r) => `${r.p}:${r.r}`;

  // ---------- Serlahan huruf akar dalam kata ----------
  const HAMZA = 'ءأإآاؤئى';
  const WEAK = 'اويى';
  function eqRoot(ch, rl) {
    if (ch === rl) return true;
    if (HAMZA.includes(rl) && HAMZA.includes(ch)) return true;
    if ((rl === 'و' || rl === 'ي') && WEAK.includes(ch)) return true;
    return false;
  }
  function markWord(w, letters) {
    const hits = [];
    let k = 0;
    for (let i = 0; i < w.length && k < letters.length; i++) {
      if (isMark(w.charCodeAt(i))) continue;
      if (eqRoot(w[i], letters[k])) {
        hits.push(i); k++;
        // Huruf akar berganda yang ditulis sekali dengan syaddah.
        if (k < letters.length && letters[k] === letters[k - 1] && /^[ً-ْ]*ّ/.test(w.slice(i + 1, i + 4))) k++;
      }
    }
    const last = letters[letters.length - 1];
    const need = letters.length - ((last === 'و' || last === 'ي') ? 1 : 0);
    if (k < need) return esc(w);
    let html = '', pos = 0;
    for (const i of hits) {
      let e = i + 1;
      while (e < w.length && isMark(w.charCodeAt(e))) e++;
      html += esc(w.slice(pos, i)) + '<span class="rl">' + esc(w.slice(i, e)) + '</span>';
      pos = e;
    }
    return html + esc(w.slice(pos));
  }
  function headwordHTML(h, root) {
    if (!root || root.r.startsWith('—')) return esc(h);
    const marked = (letters) => h.split(/(\s+)/).map((w) => (/\s/.test(w) || w.length < 2 ? esc(w) : markWord(w, letters))).join('');
    if (root.alts.length < 2) return marked(root.alts[0] || []);
    const outs = root.alts.map(marked);
    return outs.find((o) => o.includes('class="rl"')) ?? outs[0];
  }

  // ---------- Format takrif ----------
  const ABBR = { 'مص': 'Masdar (kata nama terbitan)', 'ج': 'Jamak', 'مؤ': 'Muannas', 'مذ': 'Muzakkar', 'مث': 'Musanna' };
  function defHTML(d) {
    let h = esc(d)
      .replace(/«([^«»]{1,240})»/g, '<span class="ex">«$1»</span>')
      .replace(/\[([^\[\]]{1,60})\]/g, '<span class="dom">[$1]</span>')
      .replace(/(^|\s)([١-٩][٠-٩]?)(?=\s*[-–_]?\s)/g, '$1<span class="sn">$2</span>')
      .replace(/◆/g, '<span class="sep" aria-hidden="true">◆</span>');
    h = h.replace(/(^|\s)(مص|مؤ|مذ|مث|ج)(?=\s)/g, (m, a, w) => `${a}<abbr title="${ABBR[w]}">${w}</abbr>`);
    return h;
  }

  // ---------- Carian ----------
  function search(raw) {
    const q = norm(raw);
    if (!q) return null;
    const qk = q.replace(/ /g, '');
    const exact = (r) => r.keys.includes(qk);
    const roots = ROOTS.filter((r) => !r.r.startsWith('—') && (exact(r) || (qk.length >= 2 && qk.length <= 3 && r.keys.some((k) => k.startsWith(qk)))))
      .sort((a, b) => exact(b) - exact(a) || a.i - b.i).slice(0, 16);
    const scored = [];
    for (const e of ENTS) {
      if (!e.nh) continue;
      let s = -1;
      const words = e.nh.split(/[\s،,/]+/);
      if (words[0] === q) s = 0;
      else if (words.includes(q)) s = 1;
      else if (words.some((w) => w.startsWith(q))) s = 2;
      else if (e.nh.includes(q)) s = 3;
      if (s >= 0) scored.push([s, e]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].i - b[1].i);
    const inHead = new Set(scored.map(([, e]) => e.i));
    const inDef = [];
    if (q.length >= 2) for (const e of ENTS) if (!inHead.has(e.i) && ndOf(e).includes(q)) inDef.push(e);
    // Tajuk yang sama huruf dengan kata (cth. «س ل ا م» bagi nama khas) masih perlu teka akar sebenar (س ل م).
    const plainRoot = roots.some((r) => exact(r) && !/.ا/.test(qk));
    const guess = plainRoot ? [] : guessRoots(q).filter((g) => !roots.includes(g));
    return { q, roots, guess, heads: scored.map(([, e]) => e), defs: inDef };
  }

  /** Teka akar bagi kata terbitan: huruf akar muncul mengikut susunan dalam kata. */
  const REAL_ROOTS = () => ROOTS.filter((r) => !r.r.startsWith('—'));
  let realRoots;
  function guessRoots(q) {
    if (q.includes(' ') || q.length < 3) return [];
    realRoots ??= REAL_ROOTS().flatMap((r) => r.alts.map((a) => ({ r, L: a.map(norm) })));
    const w = q;
    const out = [];
    for (const { r, L } of realRoots) {
      if (L.length < 3) continue;
      let k = 0, first = -1, last = -1, weakSubs = 0;
      for (let i = 0; i < w.length && k < L.length; i++) {
        if (eqRoot(w[i], L[k])) {
          if (w[i] !== L[k] && !(HAMZA.includes(w[i]) && HAMZA.includes(L[k]))) weakSubs++;
          // Alif di tengah kata biasanya vokal panjang, bukan hamzah akar.
          else if (L[k] === 'ا' && w[i] === 'ا' && i > 0) weakSubs++;
          if (first < 0) first = i; last = i; k++;
        }
      }
      const weakEnd = L[L.length - 1] === 'و' || L[L.length - 1] === 'ي';
      if (k < L.length - (weakEnd ? 1 : 0)) continue;
      const span = last - first;
      const extra = w.length - k;
      let score = span * 2 + first + extra + (k < L.length ? 4 : 0) + weakSubs * 3 + (r.ents.length ? 0 : 5);
      // Awalan biasa (مَفْعَل، تَفْعِيل، اِسْتِفْعَال…) jarang huruf akar pertama.
      if (first === 0 && w.length >= 4 && 'متاينس'.includes(w[0])) score += 2;
      // Akar yang memang mengandungi kata ini sebagai kata masukan.
      if (r.ents.some((e) => e.nh.split(/[\s،,/]+/).includes(w))) score -= 20;
      out.push({ r, score });
    }
    out.sort((a, b) => a.score - b.score || b.r.ents.length - a.r.ents.length);
    const seen = new Set();
    return out.filter((x) => !seen.has(x.r.key) && seen.add(x.r.key)).slice(0, 6).map((x) => x.r);
  }

  // ---------- Paparan ----------
  const main = $('#main');
  let current = { view: '', arg: '' };

  function swap(fn) {
    if (document.startViewTransition && !reduce) document.startViewTransition(fn);
    else fn();
  }

  function setLetter(li) {
    for (const nav of [$('#thumbs'), $('#strip')]) {
      nav.querySelectorAll('a').forEach((a) => a.setAttribute('aria-current', String(+a.dataset.l === li)));
    }
    const cur = $('#strip a[aria-current="true"]');
    cur?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }

  function viewHome() {
    setLetter(-1);
    const recent = S.recent.map((k) => ROOT_BY_KEY.get(k)).filter(Boolean).slice(0, 18);
    const nRoots = ROOTS.filter((r) => !r.r.startsWith('—')).length;
    main.innerHTML = `
      <section class="cover">
        <p class="cover-k">Larousse · 1989 · ALECSO</p>
        <h1 class="sr-only">المعجم العربي الأساسي — Mukjam Asasi</h1>
        ${penSVG([['المعجم'], ['العربي', 'red'], ['الأساسي']], 'cover-title', 120)}
        <p class="cover-sub">Kamus Arab–Arab · <b>${fmt(nRoots)}</b> akar · <b>${fmt(ENTS.length)}</b> kata masukan</p>
        <label class="cover-search">
          <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="q2" type="search" dir="rtl" lang="ar" autocomplete="off" spellcheck="false" placeholder="ابحث عن كلمة أو جذر" aria-label="Cari kata masukan atau akar (Arab)">
          <kbd aria-hidden="true">/</kbd>
        </label>
        <p class="cover-try">cuba ${['كتب', 'مستشفى', 'استغفار', 'سلام', 'مفتاح'].map((w) => `<button type="button" data-try="${w}" lang="ar">${w}</button>`).join('')}</p>
      </section>
      <section class="spot" aria-live="polite"><div class="spot-k">Kata pilihan</div><div id="spot"></div></section>
      ${recent.length ? `<h2 class="label">Akar terakhir dilihat</h2><div class="recent">${recent.map((r) => `<a href="#akar/${r.i}" lang="ar">${esc(r.r)}</a>`).join('')}</div>` : ''}
      <h2 class="label">Indeks huruf <span class="cnt">— setiap huruf dibuka mengikut akar</span></h2>
      <nav class="letters" aria-label="Indeks huruf">${LETTERS.map(([l, n], li) => {
        const real = byLetter[li].filter((r) => !r.r.startsWith('—'));
        const samp = [...real].sort((a, b) => b.ents.length - a.ents.length).slice(0, 3).map((r) => r.r).join(' · ');
        return `<a href="#huruf/${li}"><b lang="ar">${l}</b><small>${n} · ${real.length} akar</small><span class="samp" lang="ar">${esc(samp)}</span></a>`;
      }).join('')}</nav>
      <h2 class="label">Cara mencari</h2>
      <ol class="howto">
        <li><span>Taip kata, dengan atau tanpa baris: <span lang="ar">مكتبة</span> atau <span lang="ar">مَكْتَبَة</span>.</span></li>
        <li><span>Taip tiga huruf akar untuk melihat seluruh keluarga kata: <span lang="ar">كتب</span> → <span lang="ar">ك ت ب</span>.</span></li>
        <li><span>Dalam paparan akar, huruf akar ditanda merah dalam setiap kata terbitan.</span></li>
        <li><span>Kekunci <kbd>/</kbd> untuk mencari, <kbd>↑</kbd><kbd>↓</kbd> <kbd>Enter</kbd> untuk memilih hasil, <kbd>←</kbd><kbd>→</kbd> untuk akar seterusnya/sebelumnya.</span></li>
      </ol>`;
    document.title = 'Mukjam Asasi';
    fitPen(main);
    renderSpot(null);
    const q2 = $('#q2');
    q2.addEventListener('input', () => { qEl.value = q2.value; qEl.dispatchEvent(new Event('input')); });
    q2.addEventListener('keydown', (e) => { if (e.key === 'Enter') qEl.dispatchEvent(new Event('input')); });
    main.querySelectorAll('[data-try]').forEach((b) => b.addEventListener('click', () => { qEl.value = b.dataset.try; qEl.dispatchEvent(new Event('input')); }));
  }

  // ---------- Tajuk «lukisan pena» (SVG) ----------
  function penSVG(parts, cls, size) {
    const spans = parts.map(([t, c], i) => `${i ? '<tspan> </tspan>' : ''}<tspan${c ? ` class="${c}"` : ''}>${esc(t)}</tspan>`).join('');
    return `<svg class="draw ${cls}" viewBox="-600 -${size} 1200 ${size * 2}" role="img" aria-hidden="true">
      <text x="0" y="0" text-anchor="middle" dominant-baseline="central" direction="rtl" font-family="Amiri, serif" font-weight="700" font-size="${size}">${spans}</text></svg>`;
  }
  /** Muatkan viewBox SVG pada saiz teks sebenar (selepas fon dimuatkan). */
  function fitPen(root) {
    const go = () => root.querySelectorAll('svg.draw:not(.constel)').forEach((svg) => {
      try {
        const b = svg.querySelector('text').getBBox();
        if (b.width) svg.setAttribute('viewBox', `${b.x - 12} ${b.y - 6} ${b.width + 24} ${b.height + 12}`);
      } catch { /* belum dipaparkan */ }
    });
    go();
    document.fonts?.ready.then(go);
  }

  // ---------- Kata pilihan ----------
  let spotPool, spotI = null;
  function spotCandidates() {
    return (spotPool ??= ENTS.filter((e) => {
      const r = ROOTS[e.ri];
      if (!r || r.r.startsWith('—')) return false;
      if (e.h.split(/\s+/).length > 3 || e.h.length < 3) return false;
      if (/[%!#'"|&$()[\]]/.test(e.h) || /[%!#&$|']/.test(e.d)) return false;
      if (e.d.length < 50 || e.d.length > 260 || e.d.startsWith('مص')) return false;
      const toks = e.h.split(/\s+/);
      if (toks.some((t) => strip(t).length < 2 && t !== 'ج')) return false;
      if (!/[ً-ْ]/.test(toks[0])) return false;
      // Huruf akar mesti benar-benar ada dalam kata pertama.
      return r.alts.some((a) => markWord(toks[0], a).includes('class="rl"'));
    }));
  }
  function renderSpot(step) {
    const pool = spotCandidates();
    const box = $('#spot');
    if (!box || !pool.length) return;
    const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);
    spotI = step == null ? (day * 7919) % pool.length : (spotI + 1 + Math.floor(Math.random() * 97)) % pool.length;
    const e = pool[spotI], r = ROOTS[e.ri];
    box.innerHTML = `<div class="spot-body">
      <div class="spot-hw" lang="ar">${headwordHTML(e.h, r)}</div>
      <div class="spot-def def" lang="ar">${defHTML(e.d)}</div>
      <div class="spot-act">
        <a href="#akar/${r.i}/${e.i}">Lihat seluruh keluarga akar <b lang="ar">${esc(r.r)}</b></a>
        <button type="button" id="spotNext"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg>Kata lain</button>
      </div></div>`;
    $('#spotNext').addEventListener('click', () => renderSpot(1));
  }

  function viewLetter(li) {
    const roots = byLetter[li] || [];
    const real = roots.filter((r) => !r.r.startsWith('—'));
    const ents = roots.reduce((a, r) => a + r.ents.length, 0);
    const pages = roots.length ? `${roots[0].p + 1}–${(byLetter[li + 1]?.[0]?.p ?? roots[roots.length - 1].p + 1)}` : '';
    setLetter(li);
    main.innerHTML = `
      <nav class="crumbs"><a href="#">Indeks</a><span>›</span><span>Huruf ${LETTERS[li][1]}</span></nav>
      <div class="l-head"><span class="big" lang="ar">${LETTERS[li][0]}</span>
        <div><h1>Huruf ${LETTERS[li][1]}</h1><p>${fmt(real.length)} akar · ${fmt(ents)} kata masukan · halaman ${pages}</p></div></div>
      <div class="root-list">${roots.map((r) => `<a href="#akar/${r.i}"><b lang="ar">${esc(rootLabel(r))}</b><small>${r.ents.length}</small></a>`).join('')}</div>`;
    document.title = `Huruf ${LETTERS[li][1]} · Mukjam Asasi`;
  }

  /** Buruj: akar di tengah, kata terbitan mengelilinginya. */
  function constelHTML(r) {
    const seen = new Set(), items = [];
    for (const e of r.ents) {
      const w = (e.h.split(/\s+/)[0] || '').replace(/[،,.:؛"'()[\]!%/\\]/g, '');
      if (strip(w).length < 2) continue;
      const k = norm(w);
      if (seen.has(k)) continue;
      seen.add(k); items.push({ w, e });
      if (items.length >= 24) break;
    }
    if (items.length < 3) return '';
    const n = items.length;
    const n1 = n <= 9 ? n : Math.ceil(n * 0.42);
    const rings = [items.slice(0, n1), items.slice(n1)];
    const RAD = [190, 300], SY = 0.74;
    let out = '', d = 0;
    rings.forEach((ring, j) => {
      ring.forEach((it, k) => {
        const a = -Math.PI / 2 + ((k + (j ? 0.5 : 0)) * 2 * Math.PI) / ring.length;
        const R = RAD[j];
        const x = Math.cos(a) * R, y = Math.sin(a) * R * SY;
        const tx = Math.cos(a) * (R + 38), ty = Math.sin(a) * (R + 38) * SY;
        const x0 = Math.cos(a) * 112, y0 = Math.sin(a) * 112 * SY;
        out += `<g class="lnk"><line class="ln" style="--d:${d}" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/></g>
          <g class="w" tabindex="0" role="link" data-e="${it.e.i}" aria-label="${esc(it.w)}" style="--d:${d};--tx:${(-tx * 0.6).toFixed(0)}px;--ty:${(-ty * 0.6).toFixed(0)}px">
            <circle class="hit" cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="34"/>
            <circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"/>
            <text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" dominant-baseline="central" direction="rtl">${esc(it.w)}</text></g>`;
        d++;
      });
    });
    const H = Math.round((RAD[1] + 70) * SY) + 30;
    const ringsSvg = rings[1].length ? `<ellipse class="ring" rx="${RAD[1]}" ry="${RAD[1] * SY}"/>` : '';
    return `<svg class="constel" viewBox="-430 -${H} 860 ${H * 2}" aria-label="Keluarga kata akar ${esc(r.r)}">
      <ellipse class="ring" rx="${RAD[0]}" ry="${RAD[0] * SY}"/>${ringsSvg}
      ${out}
      <circle class="core2" r="122"/><circle class="core" r="104"/>
      <g class="draw root-t"><text x="0" y="0" text-anchor="middle" dominant-baseline="central" direction="rtl" font-size="64">${esc(r.r)}</text></g>
    </svg>`;
  }
  const strip = (s) => s.replace(MARKS, '');

  function entryHTML(e, root, k = 0) {
    const saved = S.saved.has(entKey(e));
    return `<li class="entry" id="e${e.i}" style="--i:${k}">
      ${e.h ? `<h2 class="hw" lang="ar">${headwordHTML(e.h, root)}</h2>` : ''}
      <div class="def" lang="ar">${defHTML(e.d)}</div>
      <div class="e-act">
        <button data-save="${e.i}" class="${saved ? 'on' : ''}" aria-pressed="${saved}">${saved ? 'Disimpan' : 'Simpan'}</button>
        <button data-copy="${e.i}">Salin</button>
        <a href="${pdfHref(e.p)}" target="_blank" rel="noopener">Imbasan hlm ${e.p + 1} ↗</a>
      </div></li>`;
  }

  function viewRoot(ri, focus) {
    const r = ROOTS[ri];
    if (!r) return viewHome();
    setLetter(r.l);
    S.recent = [rKey(r), ...S.recent.filter((k) => k !== rKey(r))].slice(0, 24);
    store.set('recent', S.recent);
    const prev = ROOTS[ri - 1], next = ROOTS[ri + 1];
    const pages = [...new Set(r.ents.map((e) => e.p + 1))];
    main.innerHTML = `
      <nav class="crumbs"><a href="#">Indeks</a><span>›</span><a href="#huruf/${r.l}">Huruf ${LETTERS[r.l][1]} <span lang="ar">${LETTERS[r.l][0]}</span></a><span>›</span><span lang="ar">${esc(rootLabel(r))}</span></nav>
      <header class="r-head">
        ${(() => { const c = r.r.startsWith('—') ? '' : constelHTML(r); return c ? `<h1 class="sr-only" lang="ar">${esc(rootLabel(r))}</h1>${c}` : `<h1 class="r-title-plain" lang="ar">${esc(rootLabel(r))}</h1>`; })()}
        <p class="r-meta"><span>${r.ents.length} kata masukan</span><span>·</span>
          <a href="${pdfHref(r.p)}" target="_blank" rel="noopener">Imbasan halaman ${pages.length > 1 ? `${pages[0]}–${pages[pages.length - 1]}` : r.p + 1} ↗</a></p>
        <div class="r-nav">
          ${next ? `<a href="#akar/${next.i}" rel="next" title="Akar seterusnya (←)">← <b lang="ar">${esc(rootLabel(next))}</b></a>` : '<span></span>'}
          ${prev ? `<a href="#akar/${prev.i}" rel="prev" title="Akar sebelumnya (→)"><b lang="ar">${esc(rootLabel(prev))}</b> →</a>` : '<span></span>'}
        </div>
        ${r.r.startsWith('—') ? '' : `<div class="r-tools"><label class="toggle"><input type="checkbox" id="rmToggle" ${S.rootMarks ? 'checked' : ''}> Tanda huruf akar dalam setiap kata</label></div>`}
      </header>
      <ol class="entries ${S.rootMarks ? '' : 'no-rl'}">${r.ents.map((e, k) => entryHTML(e, r, k)).join('')}</ol>`;
    document.title = `${rootLabel(r)} · Mukjam Asasi`;
    // Interaksi buruj ↔ entri
    const svg = main.querySelector('.constel');
    if (svg) {
      const jump = (id) => {
        const el = document.getElementById('e' + id);
        if (!el) return;
        el.classList.remove('focus'); void el.offsetWidth; el.classList.add('focus');
        el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      };
      svg.querySelectorAll('.w').forEach((g) => {
        const ent = document.getElementById('e' + g.dataset.e);
        g.addEventListener('click', () => jump(g.dataset.e));
        g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); jump(g.dataset.e); } });
        g.addEventListener('mouseenter', () => ent?.classList.add('hl'));
        g.addEventListener('mouseleave', () => ent?.classList.remove('hl'));
        ent?.addEventListener('mouseenter', () => g.classList.add('on'));
        ent?.addEventListener('mouseleave', () => g.classList.remove('on'));
      });
    }
    $('#rmToggle')?.addEventListener('change', (ev) => {
      S.rootMarks = ev.target.checked; store.set('rootMarks', S.rootMarks);
      $('.entries').classList.toggle('no-rl', !S.rootMarks);
    });
    if (focus != null) {
      const el = document.getElementById('e' + focus);
      if (el) { el.classList.add('focus'); requestAnimationFrame(() => el.scrollIntoView({ block: 'center' })); }
    } else window.scrollTo(0, 0);
  }

  let resLimit = { heads: 40, defs: 20 };
  function viewSearch(raw) {
    const res = search(raw);
    if (!res) return viewHome();
    setLetter(-1);
    const { q, roots, guess, heads, defs } = res;
    const hitHTML = (e, inDef) => {
      const r = ROOTS[e.ri];
      let d = e.d;
      if (inDef) {
        // Petikan sekitar padanan dalam takrif
        const nd = ndOf(e), at = nd.indexOf(q);
        const ratio = at / Math.max(1, nd.length);
        const c = Math.floor(ratio * d.length);
        d = (c > 60 ? '…' : '') + d.slice(Math.max(0, c - 60), c + 160);
      }
      return `<li><a class="hit" href="#akar/${e.ri}/${e.i}">
        <span class="h" lang="ar">${inDef ? esc(e.h) : mark(e.h, q)}</span>
        <span class="d" lang="ar">${inDef ? mark(d, q) : esc(d.slice(0, 200))}</span>
        <span class="r"><b lang="ar">${esc(rootLabel(r))}</b>hlm ${e.p + 1}</span></a></li>`;
    };
    if (!roots.length && !guess.length && !heads.length && !defs.length) {
      main.innerHTML = `<div class="none"><b lang="ar">${esc(raw.trim())}</b>Tiada padanan. Cuba akar kata (cth. <span lang="ar">كتب</span> bagi <span lang="ar">مكتبة</span>) atau ejaan tanpa baris.</div>`;
      return;
    }
    const top = heads[0] && heads[0].nh.split(/[\s،,/]+/).includes(q) ? heads[0] : null;
    const topR = top && ROOTS[top.ri];
    main.innerHTML = `
      <p class="res-sum"><b>${fmt(heads.length)}</b> kata masukan · <b>${fmt(roots.length)}</b> akar · <b>${fmt(defs.length)}</b> dalam takrif</p>
      ${top ? `<a class="top" href="#akar/${top.ri}/${top.i}">
        <div class="top-k">Padanan tepat</div>
        <div class="top-hw" lang="ar">${headwordHTML(top.h, topR)}</div>
        <div class="top-def" lang="ar">${esc(top.d.slice(0, 320))}</div>
        <div class="top-r">dalam keluarga akar <b lang="ar">${esc(rootLabel(topR))}</b> · halaman ${top.p + 1} →</div></a>` : ''}
      ${roots.length ? `<h2 class="label">Akar</h2><div class="roots-hit">${roots.map((r) => `<a href="#akar/${r.i}"><b lang="ar">${esc(r.r)}</b><small>${r.ents.length} kata</small></a>`).join('')}</div>` : ''}
      ${guess.length ? `<h2 class="label">Mungkin akar bagi <span lang="ar" class="cnt">${esc(raw.trim())}</span></h2><div class="roots-hit guess">${guess.map((r) => `<a href="#akar/${r.i}"><b lang="ar">${esc(r.r)}</b><small>${r.ents.length} kata</small></a>`).join('')}</div>` : ''}
      ${heads.length ? `<h2 class="label">Kata masukan <span class="cnt">${fmt(heads.length)}</span></h2>
        <ol class="hits">${heads.slice(0, resLimit.heads).map((e) => hitHTML(e, false)).join('')}</ol>
        ${heads.length > resLimit.heads ? `<button class="more" data-more="heads">Tunjuk ${fmt(Math.min(40, heads.length - resLimit.heads))} lagi</button>` : ''}` : ''}
      ${defs.length ? `<h2 class="label">Dalam takrif <span class="cnt">${fmt(defs.length)}</span></h2>
        <ol class="hits">${defs.slice(0, resLimit.defs).map((e) => hitHTML(e, true)).join('')}</ol>
        ${defs.length > resLimit.defs ? `<button class="more" data-more="defs">Tunjuk ${fmt(Math.min(40, defs.length - resLimit.defs))} lagi</button>` : ''}` : ''}`;
    document.title = `${raw.trim()} · Mukjam Asasi`;
    sel = -1;
  }

  function viewSaved() {
    setLetter(-1);
    const list = ENTS.filter((e) => S.saved.has(entKey(e)));
    main.innerHTML = `<nav class="crumbs"><a href="#">Indeks</a><span>›</span><span>Simpanan</span></nav>
      <div class="l-head"><div><h1>Simpanan</h1><p>${list.length ? `${list.length} kata masukan` : 'Tekan «Simpan» pada mana-mana entri untuk menyimpannya di sini.'}</p></div></div>
      <ol class="entries">${list.map((e) => entryHTML(e, ROOTS[e.ri]).replace('<div class="e-act">', `<div class="e-act"><a href="#akar/${e.ri}/${e.i}">Akar <span lang="ar">${esc(rootLabel(ROOTS[e.ri]))}</span></a>`)).join('')}</ol>`;
    document.title = 'Simpanan · Mukjam Asasi';
  }

  // ---------- Laluan ----------
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    const [view, a, b] = h.split('/');
    $('#savedLink').toggleAttribute('aria-current', view === 'simpan');
    if (view !== 'cari' && document.activeElement !== qEl) qEl.value = '';
    const run = () => {
      const home = !['akar', 'huruf', 'cari', 'simpan'].includes(view);
      document.body.classList.toggle('is-home', home);
      const fromCover = document.activeElement?.id === 'q2';
      queueMicrotask(() => {
        if (view === 'cari' && (fromCover || document.activeElement === document.body)) {
          qEl.focus(); const L = qEl.value.length; qEl.setSelectionRange(L, L);
        }
      });
      if (view === 'akar') viewRoot(+a, b != null && b !== '' ? +b : null);
      else if (view === 'huruf') { viewLetter(+a); window.scrollTo(0, 0); }
      else if (view === 'cari') { if (qEl.value !== (a || '')) qEl.value = a || ''; resLimit = { heads: 40, defs: 20 }; viewSearch(a || ''); window.scrollTo(0, 0); }
      else if (view === 'simpan') { viewSaved(); window.scrollTo(0, 0); }
      else { viewHome(); window.scrollTo(0, 0); }
      current = { view, arg: a };
    };
    swap(run);
  }
  window.addEventListener('hashchange', route);

  // ---------- Input carian ----------
  const qEl = $('#q');
  let typingT, sel = -1;
  qEl.addEventListener('input', () => {
    clearTimeout(typingT);
    typingT = setTimeout(() => {
      const v = qEl.value.trim();
      if (!v) { if (current.view === 'cari') location.hash = ''; return; }
      const target = '#cari/' + encodeURIComponent(v);
      if (current.view === 'cari') {
        history.replaceState(null, '', target);
        resLimit = { heads: 40, defs: 20 };
        viewSearch(v); current = { view: 'cari', arg: v };
      } else location.hash = target;
    }, 120);
  });
  function moveSel(d) {
    const items = [...main.querySelectorAll('.roots-hit a, .hit')];
    if (!items.length) return;
    items[sel]?.classList.remove('sel');
    sel = Math.max(0, Math.min(items.length - 1, sel + d));
    items[sel].classList.add('sel');
    items[sel].scrollIntoView({ block: 'nearest' });
  }
  qEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
    else if (e.key === 'Enter') {
      const items = [...main.querySelectorAll('.roots-hit a, .hit')];
      const t = items[Math.max(0, sel)];
      if (t) { location.hash = t.getAttribute('href').slice(1); qEl.blur(); }
    } else if (e.key === 'Escape') { qEl.value = ''; qEl.dispatchEvent(new Event('input')); }
  });
  document.addEventListener('keydown', (e) => {
    const typing = e.target.matches?.('input, textarea');
    if (e.key === '/' && !typing) {
      e.preventDefault();
      const t = document.body.classList.contains('is-home') ? $('#q2') : qEl;
      t?.focus(); t?.select(); return;
    }
    if (typing || current.view !== 'akar') return;
    if (e.key === 'ArrowLeft') { const n = $('.r-nav a[rel="next"]'); if (n) location.hash = n.getAttribute('href').slice(1); }
    if (e.key === 'ArrowRight') { const p = $('.r-nav a[rel="prev"]'); if (p) location.hash = p.getAttribute('href').slice(1); }
  });

  // Papan kekunci Arab
  const KB = [
    ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج', 'د'],
    ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط', 'ذ'],
    ['ء', 'أ', 'إ', 'آ', 'ؤ', 'ئ', 'ر', 'ى', 'ة', 'و', 'ز', 'ظ'],
  ];
  const kb = $('#kb');
  kb.innerHTML = KB.map((r) => `<div class="kb-row">${r.map((k) => `<button class="key" type="button" data-k="${k}">${k}</button>`).join('')}</div>`).join('')
    + '<div class="kb-row fn"><button class="key f" type="button" data-k="clear">kosongkan</button><button class="key f" type="button" data-k=" ">ruang</button><button class="key f" type="button" data-k="back">⌫ padam</button></div>';
  kb.addEventListener('pointerdown', (e) => { if (e.target.closest('.key')) e.preventDefault(); });
  kb.addEventListener('click', (e) => {
    const k = e.target.closest('.key')?.dataset.k; if (k == null) return;
    const s = qEl.selectionStart ?? qEl.value.length, en = qEl.selectionEnd ?? qEl.value.length;
    if (k === 'clear') qEl.value = '';
    else if (k === 'back') { if (s !== en) qEl.setRangeText('', s, en, 'end'); else if (s > 0) qEl.setRangeText('', s - 1, s, 'end'); }
    else qEl.setRangeText(k, s, en, 'end');
    qEl.dispatchEvent(new Event('input'));
  });
  $('#kbBtn').addEventListener('click', (e) => { kb.hidden = !kb.hidden; e.currentTarget.setAttribute('aria-pressed', String(!kb.hidden)); });

  // ---------- Tindakan ----------
  let toastT;
  function toast(msg, action) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
    if (action) t.querySelector('button').onclick = () => { action.fn(); t.classList.remove('show'); };
    t.classList.add('show'); clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), action ? 4000 : 1800);
  }
  function syncSaved() { $('#savedN').textContent = S.saved.size || ''; store.set('saved', [...S.saved]); }
  function toggleSave(e) {
    const k = entKey(e);
    const on = !S.saved.has(k);
    on ? S.saved.add(k) : S.saved.delete(k);
    syncSaved();
    return on;
  }
  main.addEventListener('click', async (ev) => {
    const save = ev.target.closest('[data-save]');
    if (save) {
      const e = ENTS[+save.dataset.save];
      const on = toggleSave(e);
      save.classList.toggle('on', on); save.setAttribute('aria-pressed', on); save.textContent = on ? 'Disimpan' : 'Simpan';
      toast(on ? 'Disimpan' : 'Dibuang daripada simpanan', on ? null : { label: 'Batal', fn: () => { toggleSave(e); if (current.view === 'simpan') viewSaved(); else { save.classList.add('on'); save.textContent = 'Disimpan'; } } });
      if (current.view === 'simpan' && !on) save.closest('.entry').remove();
      return;
    }
    const copy = ev.target.closest('[data-copy]');
    if (copy) {
      const e = ENTS[+copy.dataset.copy];
      try { await navigator.clipboard.writeText(`${e.h} : ${e.d}`.replace(/◆/g, '|')); toast('Entri disalin'); } catch { toast('Tidak dapat menyalin pada pelayar ini'); }
      return;
    }
    const more = ev.target.closest('[data-more]');
    if (more) { resLimit[more.dataset.more] += 40; const y = scrollY; viewSearch(qEl.value); window.scrollTo(0, y); }
  });

  // ---------- Tema ----------
  const THEME_ICON = {
    system: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/></svg>',
    light: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>',
    dark: '<svg class="i" viewBox="0 0 24 24"><path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/></svg>',
  };
  function applyTheme() {
    const root = document.documentElement;
    if (S.theme === 'system') root.removeAttribute('data-theme'); else root.dataset.theme = S.theme;
    const dark = S.theme === 'dark' || (S.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    $('meta[name="theme-color"]').content = dark ? '#14120F' : '#FAF7F0';
    const b = $('#themeBtn');
    b.innerHTML = THEME_ICON[S.theme];
    b.title = { system: 'Tema: ikut sistem', light: 'Tema: cerah', dark: 'Tema: gelap' }[S.theme];
    b.setAttribute('aria-label', b.title);
  }
  $('#themeBtn').addEventListener('click', () => {
    S.theme = { system: 'light', light: 'dark', dark: 'system' }[S.theme];
    store.set('theme', S.theme); applyTheme();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

  // ---------- Mula ----------
  const lettersNav = LETTERS.map(([l, n], li) => `<a href="#huruf/${li}" data-l="${li}" title="Huruf ${n}" aria-label="Huruf ${n}" lang="ar">${l}</a>`).join('');
  $('#thumbs').innerHTML = lettersNav;
  $('#strip').innerHTML = lettersNav;
  applyTheme();
  syncSaved();
  if (!ENTS.length) main.innerHTML = '<div class="none">Data kamus tidak dijumpai (data/kamus.js). Jalankan: node tools/bina_kamus.js</div>';
  else route();
})();
