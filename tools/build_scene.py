"""Generate layered SVG landscape art for the portfolio hero.

Usage (from the repo root): python tools/build_scene.py images/scene
Outputs (into the path given as argv[1]):
  ridge-far.svg   distant mountains + signal tower
  ridge-mid.svg   forested ridge
  ridge-near.svg  dark foreground forest edges
Deterministic (seeded) so the art is stable between runs.
"""
import math
import random
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1600, 520


def fmt(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def ridge(seed, base, amps, step=16):
    rnd = random.Random(seed)
    phases = [rnd.uniform(0, math.tau) for _ in amps]
    pts = []
    for x in range(0, W + step, step):
        y = base
        for (amp, freq), ph in zip(amps, phases):
            y += amp * math.sin(x / W * math.tau * freq + ph)
        y += rnd.uniform(-2.5, 2.5)
        pts.append((x, y))
    return pts


def ridge_path(pts):
    d = f"M0,{H} L" + " L".join(f"{fmt(x)},{fmt(y)}" for x, y in pts) + f" L{W},{H} Z"
    return d


def y_at(pts, x):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= x <= x1:
            t = (x - x0) / (x1 - x0)
            return y0 + (y1 - y0) * t
    return pts[-1][1]


def pine(x, y, h, rnd):
    """Layered conifer silhouette with slightly irregular tiers."""
    w = h * rnd.uniform(0.30, 0.38)
    tiers = 4 if h > 60 else 3
    parts = []
    for i in range(tiers):
        t0 = i / tiers
        top = y - h + h * t0 * 0.78
        bot = y - h * (1 - t0) * 0.30 - h * 0.08 * (tiers - i - 1) / tiers
        bot = min(bot + h * 0.18, y)
        half = w * (0.42 + 0.58 * (i + 1) / tiers) / 2
        jag = rnd.uniform(-0.12, 0.12) * half
        parts.append(
            f"M{fmt(x)},{fmt(top)} L{fmt(x + half + jag)},{fmt(bot)} "
            f"L{fmt(x + half * 0.35)},{fmt(bot - h * 0.04)} L{fmt(x - half * 0.35)},{fmt(bot - h * 0.04)} "
            f"L{fmt(x - half - jag)},{fmt(bot)} Z"
        )
    trunk_w = max(1.2, h * 0.035)
    parts.append(f"M{fmt(x - trunk_w)},{fmt(y)} L{fmt(x - trunk_w)},{fmt(y - h * 0.2)} L{fmt(x + trunk_w)},{fmt(y - h * 0.2)} L{fmt(x + trunk_w)},{fmt(y)} Z")
    return " ".join(parts)


def forest(pts, seed, density, hmin, hmax, skip=None):
    rnd = random.Random(seed)
    d = []
    x = rnd.uniform(0, 8)
    while x < W:
        if not (skip and skip[0] < x < skip[1]):
            h = rnd.uniform(hmin, hmax)
            if rnd.random() < 0.18:
                h *= 1.35
            d.append(pine(x, y_at(pts, x) + 6, h, rnd))
        x += rnd.uniform(density * 0.5, density * 1.4)
    return " ".join(d)


def svg(body, defs=""):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
        f'preserveAspectRatio="xMidYMax slice">'
        f"<defs>{defs}</defs>{body}</svg>\n"
    )


# ---------------------------------------------------------------- far ridge
far = ridge(7, 300, [(48, 1.1), (30, 2.7), (14, 6.3), (6, 13)])
tower_x = 1215
tower_y = y_at(far, tower_x)
tower = (
    f'<g fill="#1d3b35">'
    f'<path d="M{tower_x - 9},{fmt(tower_y + 4)} L{tower_x - 2.2},{fmt(tower_y - 150)} L{tower_x + 2.2},{fmt(tower_y - 150)} L{tower_x + 9},{fmt(tower_y + 4)} Z"/>'
    f'<path d="M{tower_x - 18},{fmt(tower_y - 92)} h36 v3 h-36 Z M{tower_x - 13},{fmt(tower_y - 122)} h26 v2.5 h-26 Z"/>'
    f'<path d="M{tower_x - 1},{fmt(tower_y - 150)} L{tower_x - 1},{fmt(tower_y - 176)} L{tower_x + 1},{fmt(tower_y - 176)} L{tower_x + 1},{fmt(tower_y - 150)} Z"/>'
    f"</g>"
    f'<circle class="beacon" cx="{tower_x}" cy="{fmt(tower_y - 178)}" r="2.6" fill="#f4b860"/>'
    f'<circle cx="{tower_x}" cy="{fmt(tower_y - 178)}" r="9" fill="url(#beaconGlow)"/>'
)
far_defs = (
    '<linearGradient id="farFill" x1="0" y1="0" x2="0" y2="1">'
    '<stop offset="0" stop-color="#1d3b35"/><stop offset="0.55" stop-color="#132a25"/>'
    '<stop offset="1" stop-color="#0c1916"/></linearGradient>'
    '<radialGradient id="beaconGlow"><stop offset="0" stop-color="#f4b860" stop-opacity=".55"/>'
    '<stop offset="1" stop-color="#f4b860" stop-opacity="0"/></radialGradient>'
    "<style>.beacon{animation:b 3.2s ease-in-out infinite}"
    "@keyframes b{0%,100%{opacity:.25}50%{opacity:1}}"
    "@media (prefers-reduced-motion:reduce){.beacon{animation:none;opacity:.8}}</style>"
)
far_back = ridge(3, 330, [(36, 1.6), (20, 3.9), (8, 9)])
(OUT / "ridge-far.svg").write_text(
    svg(
        f'<path d="{ridge_path(far_back)}" fill="#163029" opacity=".55"/>'
        f'{tower}<path d="{ridge_path(far)}" fill="url(#farFill)"/>',
        far_defs,
    ),
    encoding="utf-8",
)

# ---------------------------------------------------------------- mid ridge (forest)
mid = ridge(11, 392, [(26, 1.3), (14, 3.1), (6, 7.5)])
mid_trees = forest(mid, 21, 13, 26, 58)
(OUT / "ridge-mid.svg").write_text(
    svg(
        f'<g fill="#0f211c"><path d="{ridge_path(mid)}"/><path d="{mid_trees}"/></g>'
    ),
    encoding="utf-8",
)

# ---------------------------------------------------------------- near forest edges
near = ridge(29, 470, [(18, 1.2), (8, 3.3), (4, 8)])
near_trees = forest(near, 41, 22, 70, 150, skip=(380, 1080))
(OUT / "ridge-near.svg").write_text(
    svg(f'<g fill="#07100d"><path d="{ridge_path(near)}"/><path d="{near_trees}"/></g>'),
    encoding="utf-8",
)

for f in sorted(OUT.glob("*.svg")):
    print(f.name, f.stat().st_size)
