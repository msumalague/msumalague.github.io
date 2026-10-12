# msumalague.github.io

Personal portfolio of **Mairene Sumalague**, AI/ML Engineer and Web & Mobile Developer.
Live at <https://msumalague.github.io/>.

A static site with no build step: plain HTML, CSS, and vanilla JavaScript, plus a self-hosted copy of three.js for the 3D cat, served by GitHub Pages from the `main` branch.

## Structure

```
index.html              page markup (hero, about, projects, skills, experience, contact)
css/main.css            all styles; design tokens live at the top in :root
js/projects.js          project data: edit this to add or change projects
js/main.js              navigation, scroll reveals, project cards/filters/dialog, hero scene
js/city.js              procedural neon city (hero backdrop and footer skyline band)
js/cat3d.js             interactive 3D robot cat (three.js), with a synthesized purr
js/fx.js                animations and neon accents below the hero
vendor/three/           self-hosted three.js r160 (MIT license)
images/profile/         profile photo (original + optimized 320/640 px WebP and JPG)
images/projects/        optimized project images (card crops + full size) and original SVG illustrations
images/portfolio/       original project screenshots (source files for images/projects/)
tools/                  image regeneration script and the local preview server
```

## Add a project

1. Put the original screenshot in `images/portfolio/`.
2. Add an entry to `JOBS` in `tools/build_project_images.py` (slug, file name, crop focus), then run:
   ```
   python tools/build_project_images.py .
   ```
   This writes `images/projects/<slug>-card-640|1120.{webp,jpg}` and `<slug>-full.{webp,jpg}` (needs Pillow).
3. Append an object to `window.PORTFOLIO_PROJECTS` in `js/projects.js`. The field reference is at the top of that file.
   Filters, counts, cards, and the details dialog update automatically.

Only link repositories and demos that are public and working, and keep descriptions to what the work actually shows.

## Preview locally

```
python tools/serve.py
```

Or `python -m http.server 8765` on systems where `.js` files are served as JavaScript (some Windows setups serve them as plain text, which blocks the 3D cat module).

Then open <http://localhost:8765/>.

## Notes

- Motion respects `prefers-reduced-motion` and the on-page "Pause motion" control, and animations pause while they are off-screen.
- Fonts load from Google Fonts (Chakra Petch, Inter, JetBrains Mono, Dela Gothic One, DotGothic16). Everything else is self-hosted.
- The hero artwork, its interactive creature, and the HUD elements are original artwork made for this site.
- Client projects are anonymized. Their cards use original illustrations instead of real interfaces or data.
