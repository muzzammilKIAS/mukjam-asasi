# Render satu halaman PDF dan potong kepada 4 keping untuk dibaca:
# R0 (kanan atas), R1 (kanan bawah), L0 (kiri atas), L1 (kiri bawah).
# Potongan dibuat pada lajur/baris kosong supaya tiada baris teks terpotong.
# Guna: python3 potong.py <pdf> <halamanPDF> <dirOutput> [dpi]
import subprocess, sys, os
from PIL import Image

pdf, n, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
dpi = int(sys.argv[4]) if len(sys.argv) > 4 else 300
os.makedirs(out, exist_ok=True)
base = os.path.join(out, f"full-{n}")
subprocess.run(["pdftoppm", "-f", str(n), "-l", str(n), "-r", str(dpi), "-gray", "-png", "-singlefile", pdf, base], check=True)
im = Image.open(base + ".png").convert("L")
W, H = im.size
px = im.load()

def dark_cols(x0, x1, y0, y1, step=2):
    return [sum(1 for y in range(y0, y1, step) if px[x, y] < 128) for x in range(x0, x1)]

def dark_rows(x0, x1, y0, y1, step=2):
    return [sum(1 for x in range(x0, x1, step) if px[x, y] < 128) for y in range(y0, y1)]

# Kawasan teks (buang tepi kosong)
rows = dark_rows(0, W, 0, H)
ink = [y for y, v in enumerate(rows) if v > 2]
top, bot = (ink[0], ink[-1]) if ink else (0, H)
# Longkang lajur: lajur paling kosong berhampiran tengah
mid0, mid1 = int(W * .40), int(W * .60)
cols = dark_cols(mid0, mid1, top, bot)
best = min(cols)
cands = [i for i, v in enumerate(cols) if v <= best + 1]
gx = mid0 + cands[len(cands) // 2]

def split_y(x0, x1):
    r = dark_rows(x0, x1, top, bot)
    m = (bot - top) // 2
    # baris kosong paling hampir dengan tengah
    for d in range(0, (bot - top) // 4):
        for y in (m - d, m + d):
            if 0 <= y < len(r) and r[y] == 0 and all(r[k] == 0 for k in range(max(0, y - 3), min(len(r), y + 4))):
                return top + y
    return top + m

pad = 12
for side, (x0, x1) in {"R": (gx, W), "L": (0, gx)}.items():
    sy = split_y(x0, x1)
    im.crop((max(0, x0 - pad), max(0, top - pad), min(W, x1 + pad), sy)).save(os.path.join(out, f"{n}-{side}0.png"))
    im.crop((max(0, x0 - pad), sy, min(W, x1 + pad), min(H, bot + pad))).save(os.path.join(out, f"{n}-{side}1.png"))
os.remove(base + ".png")
print(f"{n}: gutter x={gx}/{W}, crops → {out}/{n}-R0,R1,L0,L1.png")
