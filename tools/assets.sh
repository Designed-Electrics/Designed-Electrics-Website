#!/bin/bash
# Build web assets for the site. Usage: assets.sh <src assets dir> <out site dir>
set -euo pipefail
SRC="$1"; OUT="$2"; A="$OUT/assets"; mkdir -p "$A"
# hero: forward then reverse (seamless loop), 1280x720, H.264, no audio, fast start
ffmpeg -v error -y -i "$SRC/hero.mp4" -filter_complex "[0:v]fps=30,scale=1280:720:flags=lanczos,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0,format=yuv420p[v]" \
  -map "[v]" -an -c:v libx264 -preset veryfast -crf 26 -movflags +faststart "$A/hero.mp4"
ffmpeg -v error -y -i "$SRC/hero.mp4" -vf "scale=1280:720:flags=lanczos" -frames:v 1 -q:v 4 "$A/hero-poster.jpg"
python3 - "$SRC" "$A" "$OUT" <<'PY'
import sys
from PIL import Image
src, a, out = sys.argv[1:4]
def fit(img, w):
    h = round(img.height * w / img.width); return img.resize((w, h), Image.LANCZOS)
fit(Image.open(f"{src}/logo-mark.png").convert("RGBA"), 351).save(f"{a}/logo-mark.png", optimize=True)
fit(Image.open(f"{src}/logo-full.png").convert("RGBA"), 780).save(f"{a}/logo-full.png", optimize=True)
mark = Image.open(f"{src}/logo-mark.png").convert("RGBA").crop((335, 11, 940, 508))
side = max(mark.size) + 40
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0)); sq.alpha_composite(mark, ((side - mark.width) // 2, (side - mark.height) // 2))
sq.resize((192, 192), Image.LANCZOS).save(f"{a}/icon-192.png", optimize=True)
wb = Image.new("RGBA", sq.size, (255, 255, 255, 255)); wb.alpha_composite(sq)
wb.convert("RGB").resize((180, 180), Image.LANCZOS).save(f"{a}/apple-touch-icon.png", optimize=True)
sq.save(f"{out}/favicon.ico", sizes=[(32, 32), (16, 16)])
p = Image.open(f"{a}/hero-poster.jpg"); w, h = p.size; th = round(w * 630 / 1200)
p.crop((0, (h - th) // 2, w, (h - th) // 2 + th)).resize((1200, 630), Image.LANCZOS).save(f"{a}/og-image.jpg", quality=82)
for f in ["logo-full.png", "icon-192.png", "apple-touch-icon.png"]:
    im = Image.open(f"{a}/{f}").convert("RGBA")
    im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(f"{a}/{f}", optimize=True)
PY
