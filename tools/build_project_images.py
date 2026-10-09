"""Build web-optimized project images (card crops + full-size) from the repo's originals.

Usage (from the repo root): python tools/build_project_images.py .
Card crops are 16:10 at 640w and 1120w; full images are capped at 1600px on the long edge.
Originals in images/portfolio/ are left untouched.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(sys.argv[1])
SRC = ROOT / "images" / "portfolio"
OUT = ROOT / "images" / "projects"
OUT.mkdir(parents=True, exist_ok=True)

# slug: (source file, focus_x, focus_y) -- focus is the 0..1 point the 16:10 crop centres on
JOBS = {
    "drone-detection": ("drone.png", 0.5, 0.45),
    "drone-hardware": ("drone_hardware.jpg", 0.42, 0.45),
    "filter-detection": ("filter_detection.jpg", 0.5, 0.13),
    "signature-forgery": ("deeplearning.png", 0.5, 0.5),
    "thyrocare": ("ThyroCare.png", 0.5, 0.31),
    "data-analysis": ("data.png", 0.5, 0.12),
    "benchmark": ("benchmark.png", 0.5, 0.2),
    "bookify": ("UI.png", 0.5, 0.5),
}


def crop_ratio(im, ratio, fx, fy):
    w, h = im.size
    if w / h > ratio:
        nw, nh = round(h * ratio), h
    else:
        nw, nh = w, round(w / ratio)
    left = min(max(round(fx * w - nw / 2), 0), w - nw)
    top = min(max(round(fy * h - nh / 2), 0), h - nh)
    return im.crop((left, top, left + nw, top + nh))


def save(im, stem):
    im.save(OUT / f"{stem}.webp", "WEBP", quality=80, method=6)
    im.save(OUT / f"{stem}.jpg", "JPEG", quality=80, optimize=True, progressive=True)


for slug, (name, fx, fy) in JOBS.items():
    src = Image.open(SRC / name)
    if src.mode in ("RGBA", "LA", "P"):
        src = src.convert("RGBA")
        bg = Image.new("RGB", src.size, (255, 255, 255))
        bg.paste(src, mask=src.getchannel("A"))
        src = bg
    else:
        src = src.convert("RGB")

    card = crop_ratio(src, 16 / 10, fx, fy)
    for w in (640, 1120):
        if card.width >= w * 0.9:
            save(card.resize((w, round(w / 1.6)), Image.LANCZOS), f"{slug}-card-{w}")
        else:
            save(card.resize((card.width, round(card.width / 1.6)), Image.LANCZOS), f"{slug}-card-{w}")

    full = src.copy()
    full.thumbnail((1600, 1600), Image.LANCZOS)
    save(full, f"{slug}-full")
    print(slug, "full", full.size)

total = sum(p.stat().st_size for p in OUT.iterdir())
print("files", len(list(OUT.iterdir())), "total KB", total // 1024)
