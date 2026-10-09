# msumalague.github.io

Personal portfolio of **Mairene Sumalague**, AI/ML Engineer and Software Engineer.
Live at <https://msumalague.github.io/>.

A static site with no build step: plain HTML, CSS, and vanilla JavaScript, served by GitHub Pages from the `main` branch.

## Structure

```
index.html              page markup (hero, about, projects, skills, experience, contact)
css/main.css            all styles; design tokens live at the top in :root
js/projects.js          project data: edit this to add or change projects
js/main.js              navigation, scroll reveals, project cards/filters/dialog, hero scene
images/profile/         profile photo (original + optimized 320/640 px WebP and JPG)
images/projects/        optimized project images (card crops + full size) and iot-network.svg
images/scene/           generated SVG landscape layers for the hero
images/portfolio/       original project screenshots (source files for images/projects/)
tools/                  scripts that regenerate the optimized images and scene layers
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
python -m http.server 8765
```

Then open <http://localhost:8765/>.

## Notes

- Motion respects `prefers-reduced-motion`, and the hero animation pauses while it is off-screen.
- Fonts load from Google Fonts (Chakra Petch, Inter, JetBrains Mono). Everything else is self-hosted.
- The hero's interactive robotic cat (eyes follow the pointer; click, tap, or press Enter to pet it), landscape, and HUD elements are original artwork made for this site.
