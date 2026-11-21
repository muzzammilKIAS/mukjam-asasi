# Mukjam Asasi — المعجم العربي الأساسي

Edisi web *al-Mu'jam al-'Arabi al-Asasi* (Larousse, 1989, dengan tugasan ALECSO), kamus Arab–Arab untuk penutur dan pelajar bahasa Arab.

**Buka:** https://muzzammilkias.github.io/mukjam-asasi/

- **Cari** kata masukan, dengan atau tanpa baris. Kata yang tiada dalam kamus dipadankan kepada akar yang paling mungkin (cth. «مستشفى» → ش ف ي).
- **Akar** dipaparkan sebagai buruj keluarga kata. Huruf akar ditanda merah dalam setiap kata terbitan.
- **Indeks huruf** dan tab indeks di tepi, seperti kamus bercetak.
- **Imbasan asal:** setiap entri dipautkan ke halamannya dalam PDF.
- Simpanan peribadi, papan kekunci Arab pada skrin, tema cerah dan gelap, serta pintasan papan kekunci (`/` cari, `↑ ↓ Enter` pilih, `← →` akar seterusnya).

Aplikasi ini HTML, CSS dan JavaScript biasa, tanpa kerangka kerja, pelayan atau rangkaian. Ia juga boleh dibuka terus daripada fail: dwiklik `web/index.html`.

## Struktur

```
web/                  aplikasi (inilah yang di-deploy)
  index.html, app.js, style.css
  data/kamus.js       indeks kamus: akar → kata masukan → takrif → halaman
  fonts/              Amiri, Noto Naskh Arabic, Plus Jakarta Sans, Instrument Serif (OFL)
  mukjam-asasi.pdf    imbasan asal
  tools/              alat penyusun data (tidak di-deploy)
ocr_claude/           teks setiap halaman, dibaca semula daripada imbasan (p0063.txt … p1347.txt)
```

## Cara teks dihasilkan

OCR biasa (EPUB asal, kemudian Apple Vision) terlalu banyak salah pada imbasan ini. Huruf bertitik tertukar (ت/ث/ن/ب), baris tertinggal dan harakat silap, jadi setiap halaman kamus (PDF 63–1347) dibaca semula daripada imbasan:

1. `web/tools/potong.py` merender halaman pada 300 dpi dan memotongnya kepada empat bahagian pada ruang kosong (lajur kanan dahulu).
2. Satu model penglihatan menyalin halaman itu tepat seperti dicetak: tajuk akar, satu entri sebaris, dan harakat hanya yang tercetak.
3. Model kedua yang bebas membandingkan salinan itu dengan imbasan baris demi baris dan membetulkan perbezaan.
4. `web/tools/bina_kamus_bersih.js` menyusun teks halaman menjadi `web/data/kamus.js`.

Format fail halaman: `@kata panduan`, `§ك ت ب` (tajuk akar), `kata masukan : takrif` (satu entri sebaris), `↩ …` (sambungan dari halaman sebelumnya), dan `⟦?⟧` (bahagian yang tidak terbaca).

Teks disalin seperti tercetak, termasuk salah cetak asal. Jika anda menemui perbezaan antara teks dan imbasan, sila buka *issue* dengan nombor halaman.

```
node web/tools/bina_kamus_bersih.js     # ocr_claude/ → web/data/kamus.js
```

## Hak cipta

- **Edisi digital** (aplikasi, reka bentuk dan teks yang disusun semula) © 2026 Shairazi Mohamad & Muzzammil Najib. Hak cipta terpelihara.
- **Kandungan kamus dan imbasan asal** © Larousse / المنظمة العربية للتربية والثقافة والعلوم (ALECSO), 1989.
- **Fon** di bawah SIL Open Font License.
