/*
 * Kopicat: the owner's own cat, restyled as a cyborg, brought to life (three.js r160).
 *
 * The cat is the owner's artwork itself, cut out in three poses (images/cat/kopi-*.webp):
 * STAND (default), FRONT (turned toward the visitor) and SIT. Each pose is drawn on a finely
 * subdivided plane displaced by a depth map, so it tilts in real 3D toward the pointer. Per-vertex
 * weights computed from landmarks animate it in the vertex shader: breathing, a head that follows the
 * pointer, ear twitches and a tail that sways along its own bone chain (the crystal blade stays rigid).
 * The fragment shader moves the blue eyes toward the pointer, blends real painted eyelid frames for
 * blinks and the happy squint (kopi-*-lids.webp), and makes the blue armor lights glow and pulse.
 * Pose changes play a short holographic scan that re-materializes the cat.
 *
 * Contract (index.html): div.creature[data-creature] > img.cat-img (static fallback),
 * button[data-cat-pet], span[data-cat-hint], span[data-cat-status]. On success .creature gets
 * .has-3d and data-cat3d="ready". The module hit-tests the cat's own pixels, so the stage never
 * blocks clicks on anything else.
 *
 * Interaction: hover (eyes widen and glow), click or tap to pet (purr with sound, sparks, hearts,
 * happy squint). Three quick pets and he sits down to purr, then stands back up. Every so often he
 * turns to look at the visitor. Mouse drag turns the cat a little, Enter or Space on the pet button
 * pets, ArrowLeft and ArrowRight turn.
 * Motion: prefers-reduced-motion or html.motion-paused render still frames and switch poses without
 * the effect. The loop pauses when the hero is offscreen or the tab is hidden.
 * URL switches (testing): ?cat3d=off keeps the static image, ?cat3d=force allows software WebGL.
 * Test hooks: creature.cat3d.pet(), .setPose(name, { hold }), .forceBlink(frame, ms), .release().
 */

const TAU = Math.PI * 2;
const NAME = "Kopicat";
const DEFAULT_LABEL = "felis.kopicat · 0.99";
const MOODS = ["status · purring", "status · purring louder", "status · very happy", "status · best friends"];
const POSE_LABEL = { front: "status · watching you", sit: "status · sitting pretty" };
const PURR_MS = 2600;
const COMBO_MS = 4000;
const BLINK_MS = 160;
const TRANS_MS = 560;
const MUTE_KEY = "purr-muted";
const SVG_NS = "http://www.w3.org/2000/svg";

// World units: 1 = the standing image height (1464 stand px). The world origin is the stand ground
// point STAND_PIVOT, which sits at the same spot inside the .creature anchor (a 1288 x 1464 box).
const UNIT = 1464;
const STAND_W = 1288, STAND_H = 1464;
const STAND_PIVOT = [600, 1450];
const MARGIN = 120;               // extra plane around each image for the glow halo (pose px)
const MAXB = 10;                  // tail bones per pose (shader array size)

// Pose sheets. All coordinates are in that pose's own image pixels (origin top left, y down).
// k scales a pose to stand px, align = [pose x, stand x] that line up, ground = paw line.
const POSES = {
  stand: {
    file: "kopi-stand", size: [1288, 1464], ground: 1450, k: 1, align: [600, 600],
    lids: { box: [230, 248, 252, 142], tile: [252, 142] },
    eyeL: [300.3, 297.9], eyeLR: [27.6, 19.3], eyeLRot: 0.4305,
    eyeR: [430.1, 323.4], eyeRR: [15.1, 19.8], eyeRRot: 0.3489,
    headC: [285, 290], headR: [232, 222], neckY: [482, 590], neck: [334, 542],
    ears: [{ tip: [191, 22], base: [205, 162] }, { tip: [541, 84], base: [446, 206] }],
    bodyC: [500, 800], bodyR: [380, 230], bodyY: [900, 1060],
    chestCore: [134, 682],
    tail: [[842, 815], [910, 882], [985, 926], [1060, 940], [1125, 930], [1180, 905], [1206.6, 787.8], [1222.2, 670], [1256.4, 521.9]],
    swing: [0.3, 0.55, 0.75, 0.85, 0.9, 0.9, 0.7, 0.1], rigid: 7,
    hud: [345, 22], hint: [114, 722], hint2: [585, 330], fx: [330, 380], shadow: [40, 990],
    extPad: [30, 90],
  },
  front: {
    file: "kopi-front", size: [624, 1469], ground: 1455, k: 1.015, align: [308, 285],
    lids: { box: [170, 223, 276, 127], tile: [276, 127] },
    eyeL: [229, 281], eyeLR: [33, 23], eyeLRot: 0.06,
    eyeR: [385, 282], eyeRR: [32, 22], eyeRRot: -0.06,
    headC: [308, 250], headR: [236, 250], neckY: [440, 545], neck: [308, 470],
    ears: [{ tip: [114, 24], base: [176, 152] }, { tip: [503, 25], base: [440, 152] }],
    bodyC: [310, 830], bodyR: [245, 380], bodyY: [960, 1150],
    chestCore: [303, 686],
    tail: null,
    hud: [308, 20], hint: [84, 760], hint2: [560, 300], fx: [308, 360], shadow: [120, 510],
  },
  sit: {
    file: "kopi-sit", size: [2170, 1505], ground: 1474, k: 0.96, align: [802, 560],
    lids: { box: [128, 252, 144, 90], tile: [144, 90] },
    eyeL: [192, 300], eyeLR: [36, 18], eyeLRot: -0.22,
    eyeR: null,
    headC: [262, 290], headR: [214, 225], neckY: [470, 580], neck: [420, 540],
    ears: [{ tip: [200, 93], base: [238, 200] }, { tip: [279, 33], base: [330, 210] }],
    bodyC: [820, 900], bodyR: [470, 430], bodyY: [1150, 1350],
    chestCore: [544, 660],
    tail: [[1335.5, 1006], [1423.5, 1376.4], [1579.1, 1426.6], [1745.8, 1426], [1854.9, 1406.5], [1952.5, 1354.6], [2027.2, 1272.9], [2113.3, 996.7]],
    swing: [0, 0, 0, 0, 0.6, 0.75, 0.15], rigid: 6,
    hud: [262, 28], hint: [282, 760], hint2: [520, 250], fx: [300, 380], shadow: [300, 1960],
    extPad: [40, 190],
  },
};
const LID_GAP = 16;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
const rand = (a, b) => a + Math.random() * (b - a);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const creature = document.querySelector("[data-creature]");
let THREE = null;

if (creature && !creature.classList.contains("has-3d")) {
  const go = () => {
    const run = () => {
      boot().catch((err) => {
        mark("error");
        try { window.__cat3dError = String((err && err.stack) || err); } catch (e) { /* ignore */ }
      });
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 200);
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}

function mark(state) {
  try { creature.dataset.cat3d = state; } catch (e) { /* ignore */ }
}

function canUseWebGL2(allowSoftware) {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2", { failIfMajorPerformanceCaveat: !allowSoftware });
    if (!gl) return false;
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    return true;
  } catch (e) {
    return false;
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed: " + src));
    img.src = src;
  });
}

// the four files of one pose: color, glow mask, geometry data (depth + tail weight), eyelid frames
function loadPoseAssets(base, name, hd) {
  const f = base + POSES[name].file;
  return Promise.all([loadImage(f + (hd ? "-hd.webp" : ".webp")), loadImage(f + "-glow.png"), loadImage(f + "-geo.png"), loadImage(f + "-lids.webp")])
    .then(([map, glow, geo, lids]) => ({ map, glow, geo, lids }));
}

async function boot() {
  let flag = "";
  try { flag = new URLSearchParams(window.location.search).get("cat3d") || ""; } catch (e) { /* ignore */ }
  if (flag === "off") return mark("off");
  const conn = navigator.connection;
  if (conn && conn.saveData && flag !== "force") return mark("save-data");
  const force = flag === "force";
  if (!canUseWebGL2(force)) return mark("no-webgl");
  mark("loading");
  const load = () => import("three");
  let mod;
  try { mod = await load(); } catch (err) { await new Promise((r) => setTimeout(r, 1500)); mod = await load(); }
  THREE = mod;
  const base = new URL("../images/cat/", import.meta.url).href;
  // reuse whichever standing image the fallback <img> already picked from its srcset
  const fallback = creature.querySelector(".cat-img");
  const picked = fallback && fallback.currentSrc ? fallback.currentSrc : "";
  const hd = /kopi-stand/.test(picked) ? /-hd\./.test(picked) : (window.devicePixelRatio || 1) >= 1.5;
  const stand = await loadPoseAssets(base, "stand", hd);
  createApp(stand, { force, hd, base });
}

/* ------------------------------------------------------------------ helpers */

function makeEl(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }

function speakerIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const parts = [["cat3d-mute__spk", "M4 9.5h3.6L12.5 5v14l-4.9-4.5H4z"], ["cat3d-mute__wave", "M15.6 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"], ["cat3d-mute__x", "M16 9.5l5 5M21 9.5l-5 5"]];
  for (const [cls, d] of parts) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("class", cls);
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

function pixelsOf(img, w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

// blurred glow halo, padded by MARGIN, made by downscaling then upscaling (works in every browser)
function haloCanvas(glowImg, W, H) {
  const PW = W + MARGIN * 2, PH = H + MARGIN * 2;
  const step = (div) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(PW / div)); c.height = Math.max(1, Math.round(PH / div)); return c; };
  const small = step(14);
  small.getContext("2d").drawImage(glowImg, MARGIN / 14, MARGIN / 14, W / 14, H / 14);
  const mid = step(6);
  const m = mid.getContext("2d");
  m.imageSmoothingQuality = "high";
  m.drawImage(small, 0, 0, mid.width, mid.height);
  const out = step(6);
  const o = out.getContext("2d");
  o.drawImage(mid, 0, 0);
  o.globalAlpha = 0.6;
  o.drawImage(glowImg, MARGIN / 6, MARGIN / 6, W / 6, H / 6);
  return out;
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  const qx = ax + dx * t, qy = ay + dy * t;
  return [Math.hypot(px - qx, py - qy), t];
}

/* ------------------------------------------------------------------ shaders */

const VS = /* glsl */ `
#define MAXB ${MAXB}
attribute vec2 aUv;
attribute float aDepth;
attribute float aHead;
attribute vec2 aEar;
attribute float aBody;
attribute vec3 aTail;
uniform vec2 uSize;
uniform vec2 uPivot;
uniform float uK;
uniform float uS;
uniform float uTime;
uniform float uDepthAmt;
uniform vec2 uNeck;
uniform float uHeadRot;
uniform vec2 uHeadShift;
uniform vec4 uEarBase;
uniform vec2 uEarRot;
uniform vec2 uBoneRest[MAXB];
uniform vec2 uBonePos[MAXB];
uniform float uBoneRot[MAXB];
uniform float uBones;
uniform float uRigid;
uniform vec2 uBodyC;
uniform float uBreath;
uniform vec2 uJitter;
uniform float uReflect;
varying vec2 vUv;
varying float vFade;
varying float vH;
vec2 rot(vec2 p, vec2 c, float a) {
  float s = sin(a), co = cos(a);
  p -= c;
  return c + vec2(co * p.x - s * p.y, s * p.x + co * p.y);
}
vec2 bone(vec2 p, int i) {
  return uBonePos[i] + rot(p - uBoneRest[i], vec2(0.0), uBoneRot[i]);
}
void main() {
  vUv = aUv;
  vec2 p0 = aUv * uSize;
  vec2 p = p0;
  // tail: linear blend skinning along the bone chain, the blade bone stays rigid
  if (aTail.x > 0.001 && uBones > 0.5) {
    int n = int(uBones + 0.5);
    int rg = int(uRigid + 0.5);
    int i = int(aTail.y + 0.5);
    float t = aTail.z;
    vec2 q = bone(p0, i);
    if (i < rg) {
      if (t > 0.5 && i + 1 < rg) q = mix(q, bone(p0, i + 1), t - 0.5);
      else if (t < 0.5 && i > 0) q = mix(bone(p0, i - 1), q, 0.5 + t);
    }
    p = mix(p0, q, aTail.x);
  }
  p = rot(p, uEarBase.xy, uEarRot.x * aEar.x);
  p = rot(p, uEarBase.zw, uEarRot.y * aEar.y);
  p = rot(p, uNeck, uHeadRot * aHead);
  p += uHeadShift * aHead;
  vec2 d = p - uBodyC;
  p = uBodyC + d * (1.0 + aBody * uBreath * vec2(0.35, 1.0));
  p += uJitter * (aBody + aHead * 0.6);
  vH = (uPivot.y - p.y) * uK * uS;
  vec3 pos = vec3((p.x - uPivot.x) * uK / ${UNIT}.0, (uPivot.y - p.y) * uK / ${UNIT}.0, aDepth * uDepthAmt);
  vFade = 1.0;
  if (uReflect > 0.5) {
    vFade = 1.0 - smoothstep(0.0, 0.2, pos.y);
    pos.y = -pos.y * 0.92;
    pos.z *= 0.6;
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const FS = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uGlow;
uniform sampler2D uHalo;
uniform sampler2D uLids;
uniform vec2 uSize;
uniform float uMargin;
uniform float uTime;
uniform vec2 uEyeL; uniform vec2 uEyeLR; uniform float uEyeLRot;
uniform vec2 uEyeR; uniform vec2 uEyeRR; uniform float uEyeRRot;
uniform vec2 uLook;
uniform float uEyeBoost;
uniform float uGlowAmt;
uniform float uSweep;
uniform vec2 uCore;
uniform float uCorePulse;
uniform vec4 uLidBox;
uniform vec2 uLidRow;
uniform vec3 uLidW;
uniform float uReflect;
uniform float uScanY;
uniform float uScanMode;
uniform float uGlitch;
varying vec2 vUv;
varying float vFade;
varying float vH;

float hash(float n) { return fract(sin(n) * 43758.5453); }
vec4 texAt(vec2 px) {
  vec2 uv = px / uSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(uMap, uv);
}
vec2 eyeLocal(vec2 px, vec2 c, float a) {
  vec2 d = px - c;
  float s = sin(a), co = cos(a);
  return vec2(co * d.x + s * d.y, -s * d.x + co * d.y);
}
// gaze: the content inside the eye opening shifts toward the pointer, fading to zero at the rim
vec2 gaze(vec2 px, vec2 c, vec2 r, float a) {
  vec2 q = eyeLocal(px, c, a) / r;
  float w = 1.0 - smoothstep(0.35, 0.95, length(q));
  return -uLook * r * vec2(0.34, 0.26) * w;
}
float eyeMask(vec2 px, vec2 c, vec2 r, float a, float i0, float i1) {
  return 1.0 - smoothstep(i0, i1, length(eyeLocal(px, c, a) / r));
}

void main() {
  vec2 px = vUv * uSize;
  if (uReflect > 0.5) px.x += sin(px.y * 0.11 + uTime * 2.2) * 2.8;

  // transition: the scan line, slice glitches and a chromatic split
  float scanD = vH - uScanY;
  float band = abs(uScanMode) > 0.5 ? exp(-scanD * scanD / 420.0) : 0.0;
  float gl = clamp(uGlitch + band * 0.9, 0.0, 1.5);
  vec2 gpx = px;
  float ca = 0.0;
  if (gl > 0.001) {
    float sl = floor(px.y / 22.0);
    float tq = floor(uTime * 30.0);
    float r = hash(sl * 13.7 + tq * 7.1);
    gpx.x += (r > 0.68 ? (hash(sl * 3.1 + tq * 1.3) - 0.5) * 64.0 : 0.0) * gl;
    ca = 9.0 * gl;
  }

  vec2 spx = gpx + gaze(gpx, uEyeL, uEyeLR, uEyeLRot) + gaze(gpx, uEyeR, uEyeRR, uEyeRRot);
  vec4 col = texAt(spx);
  if (ca > 0.0) {
    vec4 cr = texAt(spx + vec2(ca, 0.0));
    vec4 cb = texAt(spx - vec2(ca, 0.0));
    col = vec4(cr.r, col.g, cb.b, max(col.a, max(cr.a, cb.a)));
  }

  // painted eyelid frames (premultiplied atlas: half, closed, happy), crossfaded by weight
  float lidCover = 0.0;
  vec2 lq = (gpx - uLidBox.xy) / uLidBox.zw;
  if (uLidW.x + uLidW.y + uLidW.z > 0.002 && lq.x > 0.0 && lq.y > 0.0 && lq.x < 1.0 && lq.y < 1.0) {
    vec2 a = vec2(lq.x, lq.y * uLidRow.x);
    vec4 h = texture2D(uLids, a) * uLidW.x;
    vec4 c = texture2D(uLids, a + vec2(0.0, uLidRow.y)) * uLidW.y;
    vec4 hp = texture2D(uLids, a + vec2(0.0, 2.0 * uLidRow.y)) * uLidW.z;
    col = h + col * (1.0 - h.a);
    col = c + col * (1.0 - c.a);
    col = hp + col * (1.0 - hp.a);
    lidCover = max(h.a, max(c.a, hp.a));
  }

  vec2 uv = px / uSize;
  float inImg = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  float g = texture2D(uGlow, clamp(uv, 0.0, 1.0)).r * inImg;
  float ge = texture2D(uGlow, clamp(spx / uSize, 0.0, 1.0)).r * inImg;
  float eyes = eyeMask(gpx, uEyeL, uEyeLR, uEyeLRot, 0.6, 1.25) + eyeMask(gpx, uEyeR, uEyeRR, uEyeRRot, 0.6, 1.25);
  float pulse = 0.5 + 0.5 * sin(uTime * 1.7);
  float diag = (px.x * 0.75 + px.y * 0.55) / uSize.y;
  float sweep = exp(-pow(diag - uSweep, 2.0) * 160.0);
  float core = 1.0 - smoothstep(36.0, 92.0, length(px - uCore));
  vec3 blue = vec3(0.42, 0.6, 1.0);
  float open = 1.0 - lidCover;
  float lit = g * uGlowAmt * (0.22 + 0.18 * pulse + 0.9 * sweep + core * uCorePulse * 1.1) * open + ge * eyes * uEyeBoost * open;
  col.rgb += blue * lit * col.a;

  // neon rim from the city: magenta on left-facing edges, cyan on right-facing edges
  float aL = texAt(gpx - vec2(6.0, 0.0)).a, aR = texAt(gpx + vec2(6.0, 0.0)).a;
  float aU = texAt(gpx - vec2(0.0, 6.0)).a, aD = texAt(gpx + vec2(0.0, 6.0)).a;
  vec2 grad = vec2(aR - aL, aD - aU);
  float edge = clamp(length(grad) * 1.1, 0.0, 1.0) * col.a;
  vec3 rim = mix(vec3(1.0, 0.32, 0.86), vec3(0.25, 0.85, 1.0), step(grad.x, 0.0));
  col.rgb += rim * edge * 0.2 * (1.0 - step(0.5, uReflect));

  // halo bloom around the blue lights (additive, adds no coverage), dimmed around shut eyes
  vec2 huv = (px + vec2(uMargin)) / (uSize + vec2(uMargin * 2.0));
  float h = texture2D(uHalo, huv).r;
  float shut = clamp(uLidW.y + uLidW.z + uLidW.x * 0.5, 0.0, 1.0);
  float nearEyes = eyeMask(px, uEyeL, uEyeLR, uEyeLRot, 1.2, 3.2) + eyeMask(px, uEyeR, uEyeRR, uEyeRRot, 1.2, 3.2);
  h *= 1.0 - shut * clamp(nearEyes, 0.0, 1.0);
  vec3 halo = blue * h * (0.32 + 0.22 * pulse + uCorePulse * 0.35 * core) * uGlowAmt;

  // holographic re-materialize: solid on one side of the scan line, hologram stripes near it
  float vis = 1.0;
  vec3 add = vec3(0.0);
  if (abs(uScanMode) > 0.5) {
    float side = uScanMode > 0.0 ? -scanD : scanD;
    float stripes = 0.5 + 0.5 * sin(vH * 0.72 - uTime * 42.0);
    float solid = smoothstep(-1.5, 1.5, side);
    float holo = solid * (1.0 - smoothstep(0.0, 120.0, side));
    float ghost = (1.0 - solid) * (1.0 - smoothstep(0.0, uScanMode > 0.0 ? 170.0 : 80.0, -side)) * stripes * (uScanMode > 0.0 ? 0.3 : 0.55);
    vis = solid * mix(1.0, 0.42 + 0.58 * stripes, holo * 0.85) + ghost;
    vec3 tint = mix(vec3(0.45, 0.62, 1.0), vec3(0.74, 0.52, 1.0), 0.5 + 0.5 * sin(vH * 0.012 + uTime * 3.0));
    float lum = dot(col.rgb, vec3(0.3, 0.59, 0.11));
    col.rgb = mix(col.rgb, tint * (lum * 1.25 + 0.22 * col.a), clamp(holo * 0.7 + (1.0 - solid), 0.0, 1.0));
    add = tint * col.a * band * 2.5 + tint * band * 0.08 * texAt(px).a;
  }

  if (uReflect > 0.5) {
    float f = vFade * 0.3;
    col.rgb *= vec3(0.5, 0.56, 0.82) * f;
    col.a *= f;
    halo *= f * 0.6;
    add *= f;
  }
  gl_FragColor = vec4((col.rgb + halo) * vis + add, col.a * vis);
}
`;

// scan beam and ground ring drawn during a pose change (additive light, no coverage)
const FX_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FX_FS = /* glsl */ `
uniform float uKind;
uniform float uAmt;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec3 blue = vec3(0.45, 0.65, 1.0), violet = vec3(0.75, 0.5, 1.0);
  vec3 c = mix(blue, violet, 0.5 + 0.5 * sin(vUv.x * 6.0 + uTime * 5.0));
  float i;
  if (uKind < 0.5) {
    float y = (vUv.y - 0.5) * 2.0;
    float x = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
    i = (exp(-y * y * 110.0) * 2.0 + exp(-y * y * 9.0) * 0.5) * x;
    i *= 0.85 + 0.15 * sin(vUv.x * 140.0 - uTime * 30.0);
  } else {
    vec2 q = (vUv - 0.5) * 2.0;
    float r = length(q);
    i = exp(-pow((r - 0.78) / 0.09, 2.0)) * 0.9 + exp(-r * r * 2.5) * 0.25;
    i *= 1.0 - smoothstep(0.92, 1.0, r);
  }
  i *= uAmt;
  gl_FragColor = vec4(c * i, i * 0.12);
}
`;

/* ------------------------------------------------------------------ app */

function createApp(standAssets, opts) {
  const T = THREE;
  const petBtn = creature.querySelector("[data-cat-pet]");
  const hint = creature.querySelector("[data-cat-hint]");
  const status = creature.querySelector("[data-cat-status]");
  const root = document.documentElement;

  const stage = makeEl("div", "creature__stage");
  stage.setAttribute("aria-hidden", "true");
  const canvas = makeEl("canvas");
  stage.appendChild(canvas);
  const fx = makeEl("div", "kopi-fx");
  stage.appendChild(fx);
  creature.appendChild(stage);

  const hud = makeEl("div", "cat3d-hud");
  const tag = makeEl("span", "cat3d-tag");
  tag.setAttribute("aria-hidden", "true");
  tag.textContent = DEFAULT_LABEL;
  const muteBtn = makeEl("button", "cat3d-mute");
  muteBtn.type = "button";
  muteBtn.appendChild(speakerIcon());
  hud.append(tag, muteBtn);
  creature.appendChild(hud);

  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: !opts.force });
  } catch (e) {
    stage.remove(); hud.remove();
    mark("no-webgl");
    return;
  }
  renderer.setClearColor(0x000000, 0);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const maxDpr = coarse ? 1.5 : 2;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new T.Scene();
  const group = new T.Group();
  scene.add(group);
  const tilt = new T.Group();
  group.add(tilt);

  // soft contact shadow under the paws (resized per pose)
  const shC = document.createElement("canvas");
  shC.width = 256; shC.height = 64;
  const sg = shC.getContext("2d");
  const grd = sg.createRadialGradient(128, 32, 4, 128, 32, 128);
  grd.addColorStop(0, "rgba(3,2,10,0.75)");
  grd.addColorStop(0.5, "rgba(3,2,10,0.35)");
  grd.addColorStop(1, "rgba(3,2,10,0)");
  sg.fillStyle = grd;
  sg.fillRect(0, 0, 256, 64);
  const shadow = new T.Mesh(new T.PlaneGeometry(1, 0.11), new T.MeshBasicMaterial({ map: new T.CanvasTexture(shC), transparent: true, depthWrite: false, depthTest: false }));
  shadow.position.set(0, -0.006, -0.01);
  shadow.renderOrder = 1;
  tilt.add(shadow);

  // transition light: a horizontal scan beam and a projector ring on the ground
  const fxMat = (kind) => new T.ShaderMaterial({ uniforms: { uKind: { value: kind }, uAmt: { value: 0 }, uTime: { value: 0 } }, vertexShader: FX_VS, fragmentShader: FX_FS, transparent: true, depthWrite: false, depthTest: false, premultipliedAlpha: true });
  const beam = new T.Mesh(new T.PlaneGeometry(1, 1), fxMat(0));
  beam.renderOrder = 5; beam.visible = false;
  const ring = new T.Mesh(new T.PlaneGeometry(1, 1), fxMat(1));
  ring.renderOrder = 1; ring.visible = false;
  tilt.add(beam, ring);

  const camera = new T.PerspectiveCamera(20, 1, 0.05, 50);
  let stageW = 1, stageH = 1, anchorH = 1, originX = 0, originY = 0, vw = 1;

  /* -------------------------------------------------------------- poses */
  const rigs = {};
  const pending = {};

  function texture(img, premul, mips) {
    const t = new T.Texture(img);
    t.flipY = false;
    t.premultiplyAlpha = !!premul;
    if (mips) { t.anisotropy = maxAniso; t.minFilter = T.LinearMipmapLinearFilter; }
    else { t.generateMipmaps = false; t.minFilter = T.LinearFilter; }
    t.needsUpdate = true;
    return t;
  }

  function buildPose(name, a) {
    const D = POSES[name];
    const [W, H] = D.size;
    const mapTex = texture(a.map, true, true);
    const glowTex = texture(a.glow, false, false);
    const lidsTex = texture(a.lids, true, true);
    const haloTex = new T.CanvasTexture(haloCanvas(a.glow, W, H));
    haloTex.flipY = false;

    // CPU copies: alpha (quarter size) for hit testing, depth and tail weight for the vertices
    const AW = Math.round(W / 4), AH = Math.round(H / 4);
    const alphaPx = pixelsOf(a.map, AW, AH);
    const alphaAt = (x, y) => {
      const xi = Math.round(x / 4), yi = Math.round(y / 4);
      if (xi < 0 || yi < 0 || xi >= AW || yi >= AH) return 0;
      return alphaPx[(yi * AW + xi) * 4 + 3] / 255;
    };
    let bx0 = AW, bx1 = 0, by0 = AH;
    for (let y = 0; y < AH; y++) {
      for (let x = 0; x < AW; x++) {
        if (alphaPx[(y * AW + x) * 4 + 3] > 40) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; }
      }
    }
    const GW = a.geo.naturalWidth, GH = a.geo.naturalHeight;
    const geoPx = pixelsOf(a.geo, GW, GH);
    const geoAt = (x, y, ch) => {
      const gx = clamp((x / W) * GW - 0.5, 0, GW - 1), gy = clamp((y / H) * GH - 0.5, 0, GH - 1);
      const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(GW - 1, x0 + 1), y1 = Math.min(GH - 1, y0 + 1);
      const fx_ = gx - x0, fy = gy - y0;
      const v = (xx, yy) => geoPx[(yy * GW + xx) * 4 + ch] / 255;
      return lerp(lerp(v(x0, y0), v(x1, y0), fx_), lerp(v(x0, y1), v(x1, y1), fx_), fy);
    };

    // tail bones
    let bones = null;
    if (D.tail) {
      const n = D.tail.length - 1;
      const rest = D.tail.map(([x, y]) => new T.Vector2(x, y));
      while (rest.length < MAXB) rest.push(new T.Vector2());
      const pos = rest.map((v) => v.clone());
      bones = { n, rest, pos, rot: new Array(MAXB).fill(0), swing: D.swing, rigid: D.rigid };
    }

    // geometry over the image plus a glow margin, with per-vertex animation weights
    const cell = coarse ? 14 : 11;
    const x0 = -MARGIN, y0 = -MARGIN, x1 = W + MARGIN, y1 = H + MARGIN;
    const NX = Math.round((x1 - x0) / cell), NY = Math.round((y1 - y0) / cell);
    const nv = (NX + 1) * (NY + 1);
    const aPos = new Float32Array(nv * 3), aUv = new Float32Array(nv * 2), aDepth = new Float32Array(nv);
    const aHead = new Float32Array(nv), aEar = new Float32Array(nv * 2), aTail = new Float32Array(nv * 3), aBody = new Float32Array(nv);
    const sc = D.k / UNIT;
    for (let j = 0, k = 0; j <= NY; j++) {
      for (let i = 0; i <= NX; i++, k++) {
        const x = lerp(x0, x1, i / NX), y = lerp(y0, y1, j / NY);
        aPos[k * 3] = (x - D.align[0]) * sc;
        aPos[k * 3 + 1] = (D.ground - y) * sc;
        aUv[k * 2] = x / W;
        aUv[k * 2 + 1] = y / H;
        aDepth[k] = geoAt(x, y, 0);
        // head (ears included), fading out across the neck
        const he = Math.hypot((x - D.headC[0]) / D.headR[0], (y - D.headC[1]) / D.headR[1]);
        let head = 1 - sstep(0.86, 1.12, he);
        for (let e = 0; e < 2; e++) {
          const ear = D.ears[e];
          const len = Math.hypot(ear.tip[0] - ear.base[0], ear.tip[1] - ear.base[1]);
          aEar[k * 2 + e] = clamp(1 - Math.hypot(x - ear.tip[0], y - ear.tip[1]) / (len * 1.15), 0, 1);
          const [d] = distToSeg(x, y, ear.base[0], ear.base[1], ear.tip[0], ear.tip[1]);
          head = Math.max(head, 1 - sstep(len * 0.32, len * 0.55, d));
        }
        aHead[k] = head * (1 - sstep(D.neckY[0], D.neckY[1], y));
        // tail: weight from the tail mask, nearest bone and the position along it
        let tw = 0, bi = 0, bt = 0;
        if (bones) {
          tw = geoAt(x, y, 1);
          if (tw > 0.002) {
            let best = Infinity;
            for (let b = 0; b < bones.n; b++) {
              const [d, u] = distToSeg(x, y, D.tail[b][0], D.tail[b][1], D.tail[b + 1][0], D.tail[b + 1][1]);
              if (d < best) { best = d; bi = b; bt = u; }
            }
          } else tw = 0;
        }
        aTail[k * 3] = tw; aTail[k * 3 + 1] = bi; aTail[k * 3 + 2] = bt;
        // torso breathing, legs and paws stay planted
        const be = Math.hypot((x - D.bodyC[0]) / D.bodyR[0], (y - D.bodyC[1]) / D.bodyR[1]);
        aBody[k] = (1 - sstep(0.7, 1.05, be)) * (1 - sstep(D.bodyY[0], D.bodyY[1], y)) * (1 - tw) * (1 - aHead[k]);
      }
    }
    const idx = [];
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const p = j * (NX + 1) + i, q = p + 1, r = p + NX + 1, s = r + 1;
        idx.push(p, r, q, q, r, s);
      }
    }
    const geo = new T.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute("position", new T.BufferAttribute(aPos, 3));
    geo.setAttribute("aUv", new T.BufferAttribute(aUv, 2));
    geo.setAttribute("aDepth", new T.BufferAttribute(aDepth, 1));
    geo.setAttribute("aHead", new T.BufferAttribute(aHead, 1));
    geo.setAttribute("aEar", new T.BufferAttribute(aEar, 2));
    geo.setAttribute("aTail", new T.BufferAttribute(aTail, 3));
    geo.setAttribute("aBody", new T.BufferAttribute(aBody, 1));

    const lid = D.lids;
    const atlasH = lid.tile[1] * 3 + LID_GAP * 2;
    const eyeR = D.eyeR || [-9999, -9999], eyeRR = D.eyeRR || [1, 1];
    const U = {
      uMap: { value: mapTex }, uGlow: { value: glowTex }, uHalo: { value: haloTex }, uLids: { value: lidsTex },
      uSize: { value: new T.Vector2(W, H) }, uPivot: { value: new T.Vector2(D.align[0], D.ground) }, uK: { value: D.k },
      uMargin: { value: MARGIN }, uTime: { value: 0 }, uDepthAmt: { value: 0.075 },
      uNeck: { value: new T.Vector2(D.neck[0], D.neck[1]) }, uHeadRot: { value: 0 }, uHeadShift: { value: new T.Vector2() },
      uEarBase: { value: new T.Vector4(D.ears[0].base[0], D.ears[0].base[1], D.ears[1].base[0], D.ears[1].base[1]) }, uEarRot: { value: new T.Vector2() },
      uBoneRest: { value: bones ? bones.rest : Array.from({ length: MAXB }, () => new T.Vector2()) },
      uBonePos: { value: bones ? bones.pos : Array.from({ length: MAXB }, () => new T.Vector2()) },
      uBoneRot: { value: bones ? bones.rot : new Array(MAXB).fill(0) },
      uBones: { value: bones ? bones.n : 0 }, uRigid: { value: bones ? bones.rigid : 0 },
      uBodyC: { value: new T.Vector2(D.bodyC[0], D.bodyC[1]) }, uBreath: { value: 0 }, uJitter: { value: new T.Vector2() },
      uEyeL: { value: new T.Vector2(D.eyeL[0], D.eyeL[1]) }, uEyeLR: { value: new T.Vector2(D.eyeLR[0], D.eyeLR[1]) }, uEyeLRot: { value: D.eyeLRot },
      uEyeR: { value: new T.Vector2(eyeR[0], eyeR[1]) }, uEyeRR: { value: new T.Vector2(eyeRR[0], eyeRR[1]) }, uEyeRRot: { value: D.eyeRRot || 0 },
      uLook: { value: new T.Vector2() }, uEyeBoost: { value: 0.35 },
      uLidBox: { value: new T.Vector4(lid.box[0], lid.box[1], lid.box[2], lid.box[3]) },
      uLidRow: { value: new T.Vector2(lid.tile[1] / atlasH, (lid.tile[1] + LID_GAP) / atlasH) },
      uLidW: { value: new T.Vector3() },
      uGlowAmt: { value: 1 }, uSweep: { value: -1 }, uCore: { value: new T.Vector2(D.chestCore[0], D.chestCore[1]) }, uCorePulse: { value: 0 },
      uReflect: { value: 0 }, uScanY: { value: 0 }, uScanMode: { value: 0 }, uGlitch: { value: 0 }, uS: { value: 1 },
    };
    const mk = (u) => new T.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: false, premultipliedAlpha: true });
    const mat = mk(U);
    const reflMat = mk(Object.assign({}, U, { uReflect: { value: 1 } }));
    const mesh = new T.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    const refl = new T.Mesh(geo, reflMat);
    refl.frustumCulled = false;
    refl.renderOrder = 0;
    const g = new T.Group();
    g.add(refl, mesh);
    g.visible = false;
    tilt.add(g);
    const baseX = (D.align[1] - STAND_PIVOT[0]) / UNIT;
    // horizontal extent and top in world units (relative to the pose group)
    // padding covers the glow halo, the swinging tail and the pointer tilt (pose px)
    const pad = D.extPad || [24, 28];
    const ext = [((bx0 * 4 - pad[0]) - D.align[0]) * sc, ((bx1 * 4 + pad[1]) - D.align[0]) * sc];
    const top = (D.ground - by0 * 4) * sc;
    const rig = { name, D, U, group: g, mesh, refl, alphaAt, bones, baseX, shift: 0, s: 1, ext, top };
    rigs[name] = rig;
    return rig;
  }

  // pose px -> world (tilt space) for a rig
  const toWorld = (rig, x, y) => [rig.baseX + rig.shift + ((x - rig.D.align[0]) * rig.D.k * rig.s) / UNIT, ((rig.D.ground - y) * rig.D.k * rig.s) / UNIT];
  const fromWorld = (rig, wx, wy) => [((wx - rig.baseX - rig.shift) * UNIT) / (rig.D.k * rig.s) + rig.D.align[0], rig.D.ground - (wy * UNIT) / (rig.D.k * rig.s)];

  function ensurePose(name) {
    if (rigs[name]) return Promise.resolve(rigs[name]);
    if (!pending[name]) {
      pending[name] = loadPoseAssets(opts.base, name, opts.hd).then((a) => {
        const r = buildPose(name, a);
        placePose(r);
        return r;
      });
      pending[name].catch(() => { delete pending[name]; });
    }
    return pending[name];
  }

  /* -------------------------------------------------------------- layout */
  const AVOID = ".hero__title, .hero__lead, .hero__actions, .social-row, .hero__portrait, .meta-strip, .motion-toggle";
  function placePose(rig) {
    // keep the whole pose on screen and clear of the hero copy, portrait and facts strip:
    // slide it sideways first, shrink it a little only when the free space is too narrow
    const pad = 10;
    const sr = stage.getBoundingClientRect(), cr = creature.getBoundingClientRect();
    const gx = sr.left + originX, gy = sr.top + originY;
    const top = gy - rig.top * anchorH, mid = cr.left + cr.width / 2;
    let minL = pad, maxR = vw - pad;
    document.querySelectorAll(AVOID).forEach((el) => {
      const o = el.getBoundingClientRect();
      if (!o.width || o.bottom <= top + 4 || o.top >= gy - 2) return;
      if ((o.left + o.right) / 2 < mid) { if (o.right < mid) minL = Math.max(minL, o.right + 8); }
      else if (o.left > mid) maxR = Math.min(maxR, o.left - 8);
    });
    const w = (rig.ext[1] - rig.ext[0]) * anchorH;
    const s = clamp((maxR - minL) / w, 0.72, 1);
    const left = gx + (rig.baseX + rig.ext[0] * s) * anchorH;
    const right = gx + (rig.baseX + rig.ext[1] * s) * anchorH;
    let shift = 0;
    if (right - left > maxR - minL) shift = maxR - right;
    else if (right > maxR) shift = maxR - right;
    else if (left < minL) shift = minL - left;
    rig.s = s;
    rig.shift = shift / anchorH;
    rig.group.position.x = rig.baseX + rig.shift;
    rig.group.scale.set(s, s, 1);
    rig.U.uS.value = s;
  }

  function layout() {
    const sr = stage.getBoundingClientRect();
    const cr = creature.getBoundingClientRect();
    if (!sr.width || !sr.height || !cr.height) return;
    stageW = sr.width; stageH = sr.height; anchorH = cr.height;
    vw = document.documentElement.clientWidth || window.innerWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(stageW, stageH, false);
    const worldH = stageH / anchorH;
    const dist = worldH / (2 * Math.tan((camera.fov * Math.PI) / 360));
    camera.aspect = stageW / stageH;
    camera.position.set(0, 0, dist);
    camera.near = dist * 0.1; camera.far = dist * 4;
    camera.updateProjectionMatrix();
    // the stand ground pivot sits at the same spot inside the anchor box
    originX = cr.left - sr.left + (STAND_PIVOT[0] / STAND_W) * cr.width;
    originY = cr.top - sr.top + (STAND_PIVOT[1] / STAND_H) * cr.height;
    group.position.set((originX - stageW / 2) / anchorH, (stageH / 2 - originY) / anchorH, 0);
    for (const k in rigs) placePose(rigs[k]);
    requestRender();
  }

  // world (tilt space) -> stage px
  const tmpV = new T.Vector3();
  function worldToStage(wx, wy, z) {
    tmpV.set(wx, wy, z || 0);
    tilt.updateWorldMatrix(true, false);
    tilt.localToWorld(tmpV);
    tmpV.project(camera);
    return [(tmpV.x * 0.5 + 0.5) * stageW, (-tmpV.y * 0.5 + 0.5) * stageH];
  }
  function poseToStage(rig, x, y, z) {
    const [wx, wy] = toWorld(rig, x, y);
    return worldToStage(wx, wy, z);
  }

  /* -------------------------------------------------------------- state */
  const S = {
    time: 0, last: 0, running: false, rafId: 0, visible: true, ready: false,
    pointer: { x: 0, y: 0, nx: 0, ny: 0, active: false },
    look: new T.Vector2(), lookT: new T.Vector2(),
    yaw: 0, pitch: 0, dragYaw: 0, dragVel: 0, dragging: false, dragStartX: 0, dragLastX: 0, downAt: 0, downOnCat: false, moved: false, releaseAt: 0,
    hover: 0, hoverT: 0,
    blinkStart: -1e9, nextBlink: performance.now() + rand(1800, 3500), happy: 0, force: null,
    ear: [0, 0], earT: [0, 0], nextEar: performance.now() + rand(3500, 7000),
    idleLookUntil: 0, nextIdleLook: performance.now() + rand(7000, 12000), idleLookX: -1,
    tailFlick: 0, nextFlick: performance.now() + rand(6000, 11000),
    pets: 0, lastPet: 0, purrUntil: 0, hopT: -1, moodTimer: 0,
    sweep: -1, nextSweep: performance.now() + 2500,
    pose: "stand", from: null, trans: null, queued: null, poseUntil: 0, nextFront: rand(20, 35), poseTimer: 0,
  };
  const reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionOK = () => !reduceMQ.matches && !root.classList.contains("motion-paused");
  const cur = () => rigs[S.pose];

  /* -------------------------------------------------------------- sound */
  const purrSound = (() => {
    let ctx = null, buf = null, src = null, inlet = null, env = null, firstExhale = 0, stopTimer = 0;
    let muted = false;
    try { muted = window.localStorage.getItem(MUTE_KEY) === "1"; } catch (e) { /* ignore */ }
    // Three breaths of a ~25 Hz pulse train. Each pulse is a short burst of band-limited noise
    // (about 60 to 600 Hz) over a soft low body. The inhale is softer than the exhale.
    function makeBuffer(c) {
      const sr = 24000;
      let seed = 1337;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const plan = [];
      let total = 0;
      for (let b = 0; b < 3; b++) {
        const gap0 = 0.05 + 0.03 * rnd(), inh = 0.9 * (0.94 + 0.12 * rnd()), gap1 = 0.06 + 0.04 * rnd(), exh = 1.1 * (0.94 + 0.12 * rnd());
        plan.push([total + gap0, inh, 0.56 + 0.08 * rnd(), 24.2 + 1.2 * rnd()]);
        plan.push([total + gap0 + inh + gap1, exh, 1.0, 25.8 + 1.6 * rnd()]);
        total += gap0 + inh + gap1 + exh + 0.04 + 0.04 * rnd();
      }
      firstExhale = plan[1][0] - 0.02;
      const n = Math.ceil(total * sr);
      const out = c.createBuffer(1, n, sr);
      const d = out.getChannelData(0);
      const aLo = 1 - Math.exp((-TAU * 600) / sr), aHp = Math.exp((-TAU * 60) / sr);
      let lp1 = 0, lp2 = 0, hp = 0, hpPrev = 0, peak = 0;
      for (const [t0, dur, amp, f0] of plan) {
        const i0 = Math.floor(t0 * sr), i1 = Math.min(n, Math.floor((t0 + dur) * sr));
        let ph = 0, pulseAmp = 1;
        for (let i = i0; i < i1; i++) {
          const tp = (i - i0) / sr;
          const breath = sstep(0, 0.16, tp) * (1 - sstep(dur - 0.22, dur, tp)) * amp;
          ph += (f0 + 0.8 * Math.sin((TAU * 1.3 * tp) / dur + f0)) / sr;
          if (ph >= 1) { ph -= 1; pulseAmp = 0.72 + 0.28 * rnd(); }
          const w = rnd() * 2 - 1;
          hp = aHp * (hp + w - hpPrev); hpPrev = w;
          lp1 += (hp - lp1) * aLo; lp2 += (lp1 - lp2) * aLo;
          const burst = (1 - Math.exp(-ph * 60)) * Math.exp(-ph * 7.5);
          const sp = Math.sin(Math.PI * ph);
          const body = Math.sin(TAU * 2 * ph) * sp * sp * sp;
          const v = breath * pulseAmp * (lp2 * 3.2 * burst + body * 0.32);
          d[i] = v;
          if (Math.abs(v) > peak) peak = Math.abs(v);
        }
      }
      const k = peak > 0 ? 0.9 / peak : 1;
      for (let i = 0; i < n; i++) d[i] *= k;
      return out;
    }
    function ensure() {
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        buf = makeBuffer(ctx);
        inlet = ctx.createBiquadFilter();
        inlet.type = "lowpass";
        inlet.frequency.value = 900;
        inlet.Q.value = 0.5;
        env = ctx.createGain();
        env.gain.value = 0;
        const master = ctx.createGain();
        master.gain.value = 0.25;
        inlet.connect(env);
        env.connect(master);
        master.connect(ctx.destination);
      } catch (e) { ctx = null; }
      return ctx;
    }
    function hold(g, now) {
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now);
      else { const v = g.value; g.cancelScheduledValues(now); g.setValueAtTime(v, now); }
    }
    function release() {
      clearTimeout(stopTimer);
      if (!src) return;
      try { src.stop(); } catch (e) { /* ignore */ }
      try { src.disconnect(); } catch (e) { /* ignore */ }
      src = null;
    }
    // one looping source: more pets raise the level and extend the purr with smooth ramps
    function play(seconds, pets) {
      if (muted) return;
      const c = ensure();
      if (!c) return;
      try {
        if (c.state === "suspended") { const pr = c.resume(); if (pr && pr.catch) pr.catch(() => {}); }
        const now = c.currentTime;
        const level = Math.min(1, 0.7 + 0.1 * (Math.max(1, pets) - 1));
        const g = env.gain;
        hold(g, now);
        if (!src) {
          src = c.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          src.connect(inlet);
          g.setValueAtTime(0, now);
          src.start(now, firstExhale);
        }
        g.linearRampToValueAtTime(level, now + 0.15);
        g.setValueAtTime(level, now + seconds);
        g.linearRampToValueAtTime(0, now + seconds + 0.5);
        clearTimeout(stopTimer);
        stopTimer = setTimeout(release, (seconds + 0.6) * 1000);
      } catch (e) { /* ignore */ }
    }
    function stop() {
      if (!ctx || !src) return;
      try {
        const now = ctx.currentTime, g = env.gain;
        hold(g, now);
        g.linearRampToValueAtTime(0, now + 0.15);
        clearTimeout(stopTimer);
        stopTimer = setTimeout(release, 220);
      } catch (e) { release(); }
    }
    function setMuted(v) {
      muted = !!v;
      try { window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (e) { /* ignore */ }
      if (muted) stop();
    }
    return {
      play, stop, setMuted,
      get muted() { return muted; },
      get state() { return ctx ? ctx.state : "none"; },
      get level() { return env ? env.gain.value : 0; },
      get playing() { return !!src; },
    };
  })();

  function syncMute() {
    const m = purrSound.muted;
    muteBtn.setAttribute("aria-pressed", m ? "true" : "false");
    muteBtn.setAttribute("aria-label", "Purr sound");
    muteBtn.title = m ? "Purr sound off" : "Purr sound on";
  }
  syncMute();
  muteBtn.addEventListener("click", () => { purrSound.setMuted(!purrSound.muted); syncMute(); });

  /* -------------------------------------------------------------- effects */
  const heartSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 5.3 3.1 1.7-1.9 3.1-3.1 5.3-3.1 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';
  function burst(count, hearts) {
    if (!motionOK() || !cur()) return;
    const [cx, cy] = poseToStage(cur(), cur().D.fx[0], cur().D.fx[1], 0.06);
    for (let i = 0; i < count; i++) {
      const isHeart = i < hearts;
      const el = makeEl("span", isHeart ? "kopi-heart" : "kopi-spark" + (i % 2 ? " kopi-spark--violet" : ""));
      if (isHeart) el.innerHTML = heartSvg;
      fx.appendChild(el);
      const ang = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const r = isHeart ? rand(50, 95) : rand(35, 110);
      const dx = Math.cos(ang) * r, dy = Math.sin(ang) * r - (isHeart ? 30 : 0);
      const sc = isHeart ? rand(0.7, 1.1) : rand(0.5, 1.2);
      const anim = el.animate([
        { transform: `translate(${cx}px, ${cy}px) scale(${sc * 0.4})`, opacity: 0 },
        { transform: `translate(${cx + dx * 0.4}px, ${cy + dy * 0.4}px) scale(${sc})`, opacity: 1, offset: 0.25 },
        { transform: `translate(${cx + dx}px, ${cy + dy}px) scale(${sc * 0.7})`, opacity: 0 },
      ], { duration: isHeart ? rand(1300, 1800) : rand(700, 1200), easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" });
      anim.onfinish = () => el.remove();
    }
  }

  function restLabel() {
    if (performance.now() < S.purrUntil) return;
    const l = POSE_LABEL[S.pose];
    tag.textContent = l || DEFAULT_LABEL;
    tag.classList.toggle("is-mood", false);
  }
  function setLabel(text, mood) {
    tag.textContent = text;
    tag.classList.toggle("is-mood", !!mood);
  }

  function pet() {
    const now = performance.now();
    S.pets = now - S.lastPet < COMBO_MS ? S.pets + 1 : 1;
    S.lastPet = now;
    S.purrUntil = now + PURR_MS + Math.min(S.pets - 1, 3) * 400;
    creature.classList.add("was-petted", "is-purring");
    setLabel(MOODS[Math.min(S.pets, MOODS.length) - 1], true);
    let msg = S.pets === 1 ? NAME + " purrs." : NAME + " purrs happily (" + S.pets + " pets).";
    // three quick pets: he sits down to purr, and stays a while longer with every extra pet
    if (S.pets >= 3) {
      if (S.pose !== "sit" && S.queued !== "sit") { setPose("sit"); msg = NAME + " sits down and purrs."; }
      S.poseUntil = Math.max(S.poseUntil, now + (S.pets === 3 ? rand(8000, 10000) : 5000));
      schedulePoseTick();
    }
    if (status) status.textContent = msg;
    clearTimeout(S.moodTimer);
    S.moodTimer = setTimeout(() => {
      creature.classList.remove("is-purring");
      restLabel();
      requestRender();
    }, S.purrUntil - now);
    purrSound.play((S.purrUntil - now) / 1000, S.pets);
    if (coarse && !purrSound.muted && navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* ignore */ } }
    burst(6 + S.pets * 3, S.pets >= 2 ? 2 + Math.min(S.pets, 4) : 1);
    if (S.pets >= 5 && motionOK() && !S.trans) S.hopT = 0;
    start();
    requestRender();
  }

  /* -------------------------------------------------------------- poses */
  let glitchTimer = 0;
  function setPose(name, o) {
    if (!POSES[name]) return Promise.resolve(false);
    const hold = o && typeof o.hold === "number" ? clamp(o.hold, 0, 1) : null;
    if (S.trans) {
      if (hold !== null && S.pose === name) { S.trans.hold = hold; requestRender(); return Promise.resolve(true); }
      S.queued = name;
      return Promise.resolve(true);
    }
    if (name === S.pose) { S.queued = null; return Promise.resolve(true); }
    S.queued = name;
    return ensurePose(name).then((rig) => {
      if (S.queued !== name || S.trans) return false;
      S.queued = null;
      const prev = rigs[S.pose];
      S.from = S.pose;
      S.pose = name;
      creature.classList.toggle("is-sitting", name === "sit");
      rig.group.visible = true;
      placePose(rig);
      if (motionOK()) {
        S.trans = { t0: performance.now(), hold, prev };
        hud.classList.add("is-glitch");
        clearTimeout(glitchTimer);
        glitchTimer = setTimeout(() => hud.classList.remove("is-glitch"), TRANS_MS);
        start();
      } else {
        if (prev) prev.group.visible = false;
        S.from = null;
      }
      if (name === "stand") S.nextFront = S.time + rand(20, 35);
      else schedulePoseTick();
      restLabel();
      requestRender();
      return true;
    }).catch(() => { S.queued = null; return false; });
  }

  function endTransition() {
    const t = S.trans;
    S.trans = null;
    if (t && t.prev && t.prev !== rigs[S.pose]) t.prev.group.visible = false;
    S.from = null;
    for (const k in rigs) { rigs[k].U.uScanMode.value = 0; rigs[k].U.uGlitch.value = 0; }
    beam.visible = false; ring.visible = false;
    if (S.queued && S.queued !== S.pose) { const q = S.queued; S.queued = null; setPose(q); }
  }

  function schedulePoseTick() {
    clearTimeout(S.poseTimer);
    if (S.pose === "stand") return;
    const ms = Math.max(50, S.poseUntil - performance.now() + 30);
    S.poseTimer = setTimeout(() => { poseTick(performance.now()); requestRender(); }, ms);
  }
  function poseTick(now) {
    if (S.trans || S.queued) return;
    if (S.pose !== "stand" && S.poseUntil && now > S.poseUntil && !S.dragging) {
      S.poseUntil = 0;
      setPose("stand");
    }
  }

  /* -------------------------------------------------------------- input */
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  const plane = new T.Plane();
  const hit = new T.Vector3();
  const inv = new T.Matrix4();
  function catPixelAt(clientX, clientY) {
    const rig = cur();
    if (!rig) return null;
    const sr = stage.getBoundingClientRect();
    if (clientX < sr.left || clientX > sr.right || clientY < sr.top || clientY > sr.bottom) return null;
    ndc.set(((clientX - sr.left) / sr.width) * 2 - 1, -((clientY - sr.top) / sr.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    tilt.updateMatrixWorld();
    plane.setFromNormalAndCoplanarPoint(new T.Vector3(0, 0, 1).transformDirection(tilt.matrixWorld), new T.Vector3().setFromMatrixPosition(tilt.matrixWorld));
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    inv.copy(tilt.matrixWorld).invert();
    hit.applyMatrix4(inv);
    const [x, y] = fromWorld(rig, hit.x, hit.y);
    return { x, y, a: rig.alphaAt(x, y) };
  }
  function setCursor(mode) {
    root.classList.toggle("cat3d-grab", mode === "grab");
    root.classList.toggle("cat3d-grabbing", mode === "grabbing");
  }
  let moveQueued = false, lastMove = null;
  function onMove(e) {
    lastMove = e;
    S.pointer.nx = (e.clientX / window.innerWidth) * 2 - 1;
    S.pointer.ny = (e.clientY / window.innerHeight) * 2 - 1;
    S.pointer.x = e.clientX; S.pointer.y = e.clientY; S.pointer.active = true;
    if (S.dragging && e.pointerType !== "touch") {
      const dx = e.clientX - S.dragLastX;
      S.dragLastX = e.clientX;
      if (Math.abs(e.clientX - S.dragStartX) > 6) S.moved = true;
      S.dragYaw = clamp(S.dragYaw + dx * 0.006, -0.42, 0.42);
      S.dragVel = dx * 0.006;
    } else if (Math.abs(e.clientX - S.dragStartX) > 8) {
      S.moved = true;
    }
    if (!moveQueued) {
      moveQueued = true;
      requestAnimationFrame(() => {
        moveQueued = false;
        if (!lastMove || S.dragging) return;
        const p = catPixelAt(lastMove.clientX, lastMove.clientY);
        const over = !!p && p.a > 0.35;
        S.hoverT = over ? 1 : 0;
        if (lastMove.pointerType !== "touch") setCursor(over ? "grab" : "");
      });
    }
    if (!motionOK()) { if (S.dragging) requestRender(); return; }
    start();
  }
  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const p = catPixelAt(e.clientX, e.clientY);
    S.downOnCat = !!p && p.a > 0.35;
    if (!S.downOnCat) return;
    S.downAt = performance.now();
    S.dragStartX = S.dragLastX = e.clientX;
    S.moved = false;
    if (e.pointerType !== "touch") {
      S.dragging = true;
      setCursor("grabbing");
    }
  }
  function onUp(e) {
    const wasOnCat = S.downOnCat;
    S.downOnCat = false;
    if (S.dragging) {
      S.dragging = false;
      const p = catPixelAt(e.clientX, e.clientY);
      setCursor(p && p.a > 0.35 ? "grab" : "");
    }
    if (wasOnCat && !S.moved && performance.now() - S.downAt < 700) pet();
    start();
  }
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });
  window.addEventListener("pointercancel", () => { S.dragging = false; S.downOnCat = false; setCursor(""); }, { passive: true });
  document.addEventListener("pointerleave", () => { S.pointer.active = false; S.hoverT = 0; setCursor(""); });
  if (petBtn) {
    petBtn.setAttribute("aria-label", "Pet " + NAME + ", the robot cat");
    petBtn.addEventListener("click", (e) => { e.preventDefault(); pet(); });
    petBtn.addEventListener("focus", () => { S.hoverT = 1; hud.classList.add("is-on"); requestRender(); });
    petBtn.addEventListener("blur", () => { S.hoverT = 0; requestRender(); });
    petBtn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        S.dragYaw = clamp(S.dragYaw + (e.key === "ArrowLeft" ? -0.12 : 0.12), -0.42, 0.42);
        S.dragVel = 0;
        S.releaseAt = performance.now();
        start();
        requestRender();
      }
    });
  }

  /* -------------------------------------------------------------- loop */
  let renderQueued = false;
  function requestRender() {
    if (S.running || renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; update(0, performance.now()); draw(); });
  }
  function start() {
    if (S.running || !S.visible || document.hidden || !motionOK()) return;
    S.running = true;
    S.last = performance.now();
    S.rafId = requestAnimationFrame(frame);
  }
  function stop() {
    S.running = false;
    cancelAnimationFrame(S.rafId);
  }
  function frame(now) {
    if (!S.running) return;
    const dt = Math.min(0.05, (now - S.last) / 1000);
    S.last = now;
    update(dt, now);
    draw();
    S.rafId = requestAnimationFrame(frame);
  }

  // eyelid frame weights from a lid closure (0 open, 1 shut) and the happy squint amount
  function lidWeights(lid, happy) {
    const half = Math.max(clamp(lid * 2, 0, 1), clamp(happy / 0.35, 0, 1) * (1 - clamp((happy - 0.7) / 0.3, 0, 1)));
    const closed = clamp(lid * 2 - 1, 0, 1);
    const hp = clamp((happy - 0.35) / 0.5, 0, 1);
    return [half, closed, hp];
  }

  function animateTail(rig, t, amp, flick, quiver, bias) {
    const B = rig.bones;
    if (!B) return;
    let theta = 0, px = B.rest[0].x, py = B.rest[0].y;
    for (let i = 0; i < B.n; i++) {
      const f = B.swing[i];
      let d = f * (amp * Math.sin(t * 1.7 - i * 0.55) + bias + flick * Math.sin(t * 5.6 - i * 0.9));
      if (i === B.n - 1) d += f * quiver * Math.sin(t * 19);
      if (i === B.rigid) d = -0.35 * (amp * Math.sin(t * 1.7 - (i - 1) * 0.55 - 0.6) + flick * Math.sin(t * 5.6 - i * 0.9 - 0.8)) * f * 3;
      theta += d;
      B.pos[i].set(px, py);
      B.rot[i] = theta;
      const dx = B.rest[i + 1].x - B.rest[i].x, dy = B.rest[i + 1].y - B.rest[i].y;
      const c = Math.cos(theta), s = Math.sin(theta);
      px += c * dx - s * dy;
      py += s * dx + c * dy;
    }
  }

  const SHARED = ["uTime", "uHeadRot", "uBreath", "uEyeBoost", "uGlowAmt", "uSweep", "uCorePulse"];
  function update(dt, now) {
    const moving = motionOK() && dt > 0;
    const purring = now < S.purrUntil;
    if (moving) S.time += dt;
    const t = S.time;
    const rig = cur();
    if (!rig) return;
    const D = rig.D;

    // pose timeline: a look at the visitor now and then, stand back up after sitting
    if (moving && !S.trans && !S.queued) {
      if (S.pose === "stand" && S.time > S.nextFront) {
        if (!purring && !S.dragging && S.hover < 0.5) { setPose("front"); S.poseUntil = now + rand(3500, 5200); schedulePoseTick(); }
        else S.nextFront = S.time + 4;
      }
      poseTick(now);
    }

    // hover and pointer tracking
    S.hover = moving ? damp(S.hover, S.hoverT, 8, dt) : S.hoverT;
    let lookX = 0, lookY = 0, yawT = 0, pitchT = 0;
    if (S.pointer.active) {
      const ex = D.eyeR ? (D.eyeL[0] + D.eyeR[0]) / 2 : D.eyeL[0], ey = D.eyeR ? (D.eyeL[1] + D.eyeR[1]) / 2 : D.eyeL[1];
      const [sx, sy] = poseToStage(rig, ex, ey, 0.05);
      const sr = stage.getBoundingClientRect();
      const dx = S.pointer.x - (sr.left + sx), dy = S.pointer.y - (sr.top + sy);
      lookX = clamp(dx / 260, -1, 1);
      lookY = clamp(dy / 220, -1, 1);
      yawT = clamp(S.pointer.nx * 0.12, -0.12, 0.12);
      pitchT = clamp(S.pointer.ny * 0.05, -0.05, 0.05);
    }
    if (now < S.idleLookUntil && S.pose === "stand") { lookX = S.idleLookX; lookY = 0.1; }
    if (moving && now > S.nextIdleLook) {
      S.idleLookX = Math.random() < 0.6 ? -1 : 0.7;
      S.idleLookUntil = now + rand(1200, 2200);
      S.nextIdleLook = now + rand(9000, 15000);
    }
    S.lookT.set(lookX, lookY);
    if (moving) { S.look.x = damp(S.look.x, S.lookT.x, 6, dt); S.look.y = damp(S.look.y, S.lookT.y, 6, dt); }
    else S.look.copy(S.lookT);

    // head follows the gaze a little, tilts into the pointer while purring
    const headT = -S.look.x * 0.045 + S.look.y * 0.012 + (purring ? Math.sin(t * 2.2) * 0.02 - 0.035 : 0) + Math.sin(t * 0.37) * 0.012;
    const headRot = moving ? damp(rig.U.uHeadRot.value, headT, 5, dt) : headT;

    // eyelids: open, half, shut, half, open over BLINK_MS, the happy squint while purring
    if (moving && now > S.nextBlink && !purring && !S.trans) {
      S.blinkStart = now;
      S.nextBlink = now + (Math.random() < 0.18 ? 280 : rand(2600, 6200));
    }
    const bt = (now - S.blinkStart) / BLINK_MS;
    let lid = 0;
    if (moving && bt >= 0 && bt < 1) lid = bt < 0.4 ? bt / 0.4 : bt < 0.55 ? 1 : 1 - (bt - 0.55) / 0.45;
    const happyT = purring ? 1 : 0;
    S.happy = moving ? damp(S.happy, happyT, happyT > S.happy ? 9 : 6, dt) : happyT;
    let lw = lidWeights(lid, S.happy);
    if (S.force && now < S.force.until) {
      const f = S.force.frame;
      lw = f === "half" ? [1, 0, 0] : f === "closed" ? [1, 1, 0] : f === "happy" ? [0, 0, 1] : [0, 0, 0];
    }
    const eyeBoost = 0.32 + S.hover * 0.55 + (purring ? 0.1 : 0);

    // ears
    if (moving && now > S.nextEar) {
      const which = Math.random() < 0.5 ? 0 : 1;
      S.earT[which] = (which ? 1 : -1) * rand(0.1, 0.18);
      setTimeout(() => { S.earT[which] = 0; }, rand(140, 260));
      S.nextEar = now + rand(3500, 8500);
    }
    const perk = S.hover * 0.05;
    for (let i = 0; i < 2; i++) S.ear[i] = moving ? damp(S.ear[i], S.earT[i] + (i ? perk : -perk), 18, dt) : 0;

    // tail: a slow travelling wave down the bones, an occasional flick, a quiver while purring
    if (moving && now > S.nextFlick) { S.tailFlick = 1; S.nextFlick = now + rand(6000, 12000); }
    S.tailFlick = moving ? damp(S.tailFlick, 0, 1.4, dt) : 0;
    const tailAmp = moving ? 0.011 + S.hover * 0.004 : 0;
    const tailFlick = moving ? S.tailFlick * 0.022 : 0;
    const tailQuiver = moving && purring ? 0.004 : 0;
    const tailBias = moving ? Math.sin(t * 0.43) * 0.004 : 0;

    // breathing and purr
    const breathRate = purring ? 0.62 : 0.22;
    const breath = moving ? Math.sin(t * TAU * breathRate) * (purring ? 0.016 : 0.011) : 0;
    const jx = moving && purring ? rand(-1.1, 1.1) : 0, jy = moving && purring ? rand(-0.9, 0.9) : 0;
    const corePulse = purring ? 0.5 + 0.5 * Math.sin(t * 9) : 0.15 + 0.15 * Math.sin(t * 2.1);

    // light sweep across the armor
    if (moving && now > S.nextSweep) { S.sweep = -0.2; S.nextSweep = now + rand(4200, 6500); }
    if (moving && S.sweep < 1.6) S.sweep += dt * 0.85;

    // pose change: a scan line rises from the paws, the new pose solid below it, the old above it
    let scanY = 0, glitch = 0, prog = 1;
    const tr = S.trans;
    if (tr) {
      prog = tr.hold !== null && tr.hold !== undefined ? tr.hold : clamp((now - tr.t0) / TRANS_MS, 0, 1);
      if (!moving && tr.hold === null) prog = 1;
    }
    const prev = tr ? tr.prev : null;
    if (tr) {
      const top = Math.max(rig.top * rig.s, prev ? prev.top * prev.s : 0) * UNIT;
      scanY = lerp(-50, top + 60, easeInOut(prog));
      glitch = 0.9 * (1 - sstep(0, 0.16, prog)) + 0.75 * sstep(0.82, 0.97, prog) * (1 - sstep(0.97, 1, prog));
      glitch *= 0.65 + 0.35 * Math.random();
    }

    const active = [rig];
    if (prev && prev !== rig) active.push(prev);
    for (const r of active) {
      const u = r.U;
      u.uTime.value = t;
      u.uLook.value.copy(S.look);
      u.uHeadRot.value = headRot;
      u.uHeadShift.value.set(S.look.x * 3.2, S.look.y * 2.0 + Math.sin(t * 1.38) * 1.2);
      u.uLidW.value.set(lw[0], lw[1], lw[2]);
      u.uEyeBoost.value = eyeBoost;
      u.uEarRot.value.set(S.ear[0], S.ear[1]);
      u.uBreath.value = breath;
      u.uJitter.value.set(jx, jy);
      u.uCorePulse.value = corePulse;
      u.uSweep.value = moving ? S.sweep : -1;
      u.uGlowAmt.value = 1 + S.hover * 0.25 + (tr ? 0.5 * Math.sin(Math.PI * prog) : 0);
      animateTail(r, t, tailAmp, tailFlick, tailQuiver, tailBias);
      u.uScanY.value = scanY;
      u.uScanMode.value = tr ? (r === rig ? 1 : -1) : 0;
      u.uGlitch.value = glitch;
    }

    // shadow, beam and ring follow the pose (and blend between poses mid-change)
    const ease = tr ? easeInOut(prog) : 1;
    const shadowOf = (r) => { const [a] = toWorld(r, r.D.shadow[0], 0), [b] = toWorld(r, r.D.shadow[1], 0); return [(a + b) / 2, b - a]; };
    const s1 = shadowOf(rig), s0 = prev ? shadowOf(prev) : s1;
    shadow.position.x = lerp(s0[0], s1[0], ease);
    shadow.scale.x = lerp(s0[1], s1[1], ease) * 1.05;
    if (tr) {
      const ex0 = Math.min(rig.group.position.x + rig.ext[0] * rig.s, prev ? prev.group.position.x + prev.ext[0] * prev.s : 1e9);
      const ex1 = Math.max(rig.group.position.x + rig.ext[1] * rig.s, prev ? prev.group.position.x + prev.ext[1] * prev.s : -1e9);
      const w = (ex1 - ex0) * 1.12;
      beam.visible = true; ring.visible = true;
      beam.position.set((ex0 + ex1) / 2, scanY / UNIT, 0.02);
      beam.scale.set(w, 70 / UNIT, 1);
      beam.material.uniforms.uAmt.value = sstep(0, 0.08, prog) * (1 - sstep(0.9, 1, prog));
      beam.material.uniforms.uTime.value = t;
      ring.position.set(lerp(s0[0], s1[0], 0.5), 0.004, -0.005);
      ring.scale.set(w * 0.95, 0.075, 1);
      ring.material.uniforms.uAmt.value = Math.sin(Math.PI * clamp(prog * 1.15, 0, 1)) * 1.5;
      ring.material.uniforms.uTime.value = t;
      if (prog >= 1 && (tr.hold === null || tr.hold === undefined)) endTransition();
    }

    // tilt toward the pointer, drag turns further, then springs back
    if (!S.dragging) {
      const since = now - (S.releaseAt || 0);
      if (since > 2200 || !S.releaseAt) S.dragYaw = moving ? damp(S.dragYaw, 0, 2.2, dt) : S.dragYaw;
      else if (moving) { S.dragYaw = clamp(S.dragYaw + S.dragVel, -0.42, 0.42); S.dragVel *= 0.9; }
    } else {
      S.releaseAt = now;
    }
    const yaw = (moving ? yawT : 0) + S.dragYaw;
    S.yaw = moving ? damp(S.yaw, yaw, 4, dt) : yaw;
    S.pitch = moving ? damp(S.pitch, pitchT, 4, dt) : 0;
    tilt.rotation.set(S.pitch, S.yaw, 0);

    // happy hop
    let lift = 0, squash = 1;
    if (S.hopT >= 0 && moving) {
      S.hopT += dt;
      const h = S.hopT / 0.55;
      if (h < 1) { lift = Math.sin(Math.PI * h) * 0.022; squash = 1 - 0.03 * Math.sin(Math.PI * clamp((h - 0.82) / 0.18, 0, 1)); }
      else S.hopT = -1;
    }
    tilt.position.y = lift;
    tilt.scale.set(1 / Math.sqrt(squash), squash, 1);

    placeHud(prog, prev);
  }

  function draw() {
    renderer.render(scene, camera);
    if (!S.ready) {
      S.ready = true;
      creature.classList.add("has-3d");
      mark("ready");
    }
  }

  // HUD above the head, hint beside the chest
  let hudW = 0, hudH = 0;
  function placeHud(prog, prev) {
    const rig = cur();
    if (!hudW) { hudW = hud.offsetWidth; hudH = hud.offsetHeight; }
    const cr = creature.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    let [hx, hy] = poseToStage(rig, rig.D.hud[0], rig.D.hud[1], 0.04);
    if (prev && prev !== rig) {
      const [px, py] = poseToStage(prev, prev.D.hud[0], prev.D.hud[1], 0.04);
      const e = easeInOut(prog);
      hx = lerp(px, hx, e); hy = lerp(py, hy, e);
    }
    const ox = sr.left - cr.left, oy = sr.top - cr.top;
    let x = ox + hx - hudW * 0.3, y = oy + hy - hudH - 16;
    const minX = -cr.left + 8, maxX = vw - cr.left - hudW - 8;
    x = clamp(x, minX, maxX);
    hud.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    tag.style.setProperty("--lead", clamp(ox + hx - x, 10, hudW - 40).toFixed(0) + "px");
    if (hint && !creature.classList.contains("was-petted")) {
      const [cx, cy] = poseToStage(rig, rig.D.hint[0], rig.D.hint[1], 0.05);
      const hw = hint.offsetWidth || 90;
      let hxp = ox + cx - hw - 14, hyp = oy + cy;
      if (cr.left + hxp < 8) {
        // no room left of the chest: beside the head instead, clear of the body
        const [ax, ay] = poseToStage(rig, rig.D.hint2[0], rig.D.hint2[1], 0.05);
        hxp = Math.min(ox + ax + 10, vw - cr.left - hw - 8);
        hyp = oy + ay - (hint.offsetHeight || 30) / 2;
      }
      hint.style.transform = `translate(${hxp.toFixed(1)}px, ${hyp.toFixed(1)}px)`;
    }
  }

  /* -------------------------------------------------------------- lifecycle */
  const io = new IntersectionObserver((entries) => {
    S.visible = entries[0].isIntersecting;
    if (S.visible) { start(); requestRender(); } else stop();
  }, { rootMargin: "80px" });
  io.observe(creature);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { stop(); purrSound.stop(); } else { start(); requestRender(); }
  });
  const onMotionChange = () => {
    if (motionOK()) start();
    else {
      stop();
      if (S.trans) { S.trans.hold = null; S.trans.t0 = -1e9; }
      requestRender();
    }
  };
  if (reduceMQ.addEventListener) reduceMQ.addEventListener("change", onMotionChange);
  new MutationObserver(onMotionChange).observe(root, { attributes: true, attributeFilter: ["class"] });
  if ("ResizeObserver" in window) new ResizeObserver(() => { hudW = 0; layout(); }).observe(creature);
  window.addEventListener("resize", () => { hudW = 0; layout(); }, { passive: true });

  buildPose("stand", standAssets).group.visible = true;
  layout();
  hud.classList.add("is-on");
  update(0, performance.now());
  draw();
  start();

  // fetch the other poses once the page has settled, so a pose change never waits
  const later = (fn, ms) => setTimeout(() => ("requestIdleCallback" in window ? window.requestIdleCallback(fn, { timeout: 4000 }) : fn()), ms);
  later(() => { ensurePose("front").then(() => later(() => ensurePose("sit"), 300)).catch(() => {}); }, 1800);

  // test hooks
  creature.cat3d = {
    pet, sound: purrSound, state: S, rigs, render: requestRender, layout,
    setPose: (name, o) => setPose(name, o),
    bbox: () => {
      const r = cur(), sr = stage.getBoundingClientRect();
      const x0 = r.group.position.x + r.ext[0] * r.s, x1 = r.group.position.x + r.ext[1] * r.s;
      const a = worldToStage(x0, r.top * r.s, 0), b = worldToStage(x1, 0, 0);
      return [Math.round(sr.left + a[0]), Math.round(sr.top + a[1]), Math.round(sr.left + b[0]), Math.round(sr.top + b[1])];
    },
    forceBlink: (frame, ms) => {
      if (!frame) { S.blinkStart = performance.now(); start(); return; }
      S.force = { frame, until: performance.now() + (ms || 2500) };
      start();
      requestRender();
    },
    release: () => {
      S.force = null;
      if (S.trans) { S.trans.hold = null; S.trans.t0 = performance.now() - TRANS_MS * 0.5; }
      start();
      requestRender();
    },
  };
}
