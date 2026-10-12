/*
 * Kopicat: the owner's own cat, restyled as a cyborg, brought to life (three.js r160).
 *
 * The cat is the owner's image itself (images/cat/cat.webp), not a model. It is drawn on a
 * finely subdivided plane that is displaced by a depth map, so it tilts in real 3D toward the
 * pointer. Soft per-vertex weights computed from a few landmarks animate it in the vertex shader:
 * breathing, a head that follows the pointer, ear twitches and a swaying tail. The fragment shader
 * moves the blue eyes toward the pointer, blinks by sliding the eyelid fur down, squints happily
 * while purring, and makes the blue armor lights glow and pulse.
 *
 * Contract (index.html): div.creature[data-creature] > img.cat-img (static fallback),
 * button[data-cat-pet], span[data-cat-hint], span[data-cat-status]. On success .creature gets
 * .has-3d and data-cat3d="ready". The module hit-tests the cat's own pixels, so the stage never
 * blocks clicks on anything else.
 *
 * Interaction: hover (eyes widen and glow), click or tap to pet (purr with sound, sparks, hearts,
 * happy squint), quick repeated pets escalate to a hop, mouse drag turns the cat a little,
 * Enter or Space on the pet button pets, ArrowLeft and ArrowRight turn.
 * Motion: prefers-reduced-motion or html.motion-paused render still frames. The loop pauses when
 * the hero is offscreen or the tab is hidden.
 * URL switches (testing): ?cat3d=off keeps the static image, ?cat3d=force allows software WebGL.
 */

const TAU = Math.PI * 2;
const NAME = "Kopicat";
const DEFAULT_LABEL = "felis.kopicat · 0.99";
const MOODS = ["status · purring", "status · purring louder", "status · very happy", "status · best friends"];
const PURR_MS = 2600;
const COMBO_MS = 4000;
const MUTE_KEY = "purr-muted";
const SVG_NS = "http://www.w3.org/2000/svg";

// image space (pixels of images/cat/cat.webp)
const IMG_W = 644, IMG_H = 732;
const PIVOT = [300, 708];              // ground point under the body, the mesh origin
const MARGIN = 64;                     // extra plane around the image for glow
const LM = {
  eyeL: [150, 147], eyeLR: [16, 10.5], eyeLRot: -0.08,
  eyeR: [216, 161], eyeRR: [12.5, 9], eyeRRot: -0.16,
  headC: [152, 140], headR: [150, 132], neck: [172, 268],
  earL: { tip: [85, 36], base: [118, 100] }, earR: { tip: [239, 61], base: [218, 118] },
  bodyC: [300, 418], bodyR: [235, 118],
  chestCore: [67, 341], headTop: [150, 18],
  tail: [[419, 381], [470, 425], [552, 471], [600, 440], [607, 391], [618, 340], [626, 292]],
  tailPoly: [[400, 352], [470, 352], [530, 388], [576, 410], [592, 362], [600, 300], [618, 262], [652, 270], [650, 350], [642, 456], [610, 488], [556, 502], [486, 494], [436, 458], [402, 410]],
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
const rand = (a, b) => a + Math.random() * (b - a);

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
  const [map, glow, depth] = await Promise.all([loadImage(base + "cat.webp"), loadImage(base + "cat-glow.png"), loadImage(base + "cat-depth.png")]);
  createApp({ map, glow, depth }, force);
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
function haloCanvas(glowImg) {
  const W = IMG_W + MARGIN * 2, H = IMG_H + MARGIN * 2;
  const small = document.createElement("canvas");
  small.width = Math.round(W / 7); small.height = Math.round(H / 7);
  const s = small.getContext("2d");
  s.drawImage(glowImg, MARGIN / 7, MARGIN / 7, IMG_W / 7, IMG_H / 7);
  const mid = document.createElement("canvas");
  mid.width = Math.round(W / 3); mid.height = Math.round(H / 3);
  const m = mid.getContext("2d");
  m.imageSmoothingQuality = "high";
  m.drawImage(small, 0, 0, mid.width, mid.height);
  const out = document.createElement("canvas");
  out.width = mid.width; out.height = mid.height;
  const o = out.getContext("2d");
  o.drawImage(mid, 0, 0);
  o.globalAlpha = 0.6;
  o.drawImage(glowImg, MARGIN / 3, MARGIN / 3, IMG_W / 3, IMG_H / 3);
  return out;
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  const qx = ax + dx * t, qy = ay + dy * t;
  return [Math.hypot(px - qx, py - qy), t];
}

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polyEdgeDist(x, y, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    d = Math.min(d, distToSeg(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1])[0]);
  }
  return d;
}

/* ------------------------------------------------------------------ shaders */

const VS = /* glsl */ `
attribute vec2 aUv;
attribute float aDepth;
attribute float aHead;
attribute vec2 aEar;
attribute vec2 aTail;
attribute float aBody;
uniform vec2 uSize;
uniform vec2 uPivot;
uniform float uTime;
uniform float uDepthAmt;
uniform vec2 uNeck;
uniform float uHeadRot;
uniform vec2 uHeadShift;
uniform vec4 uEarBase;
uniform vec2 uEarRot;
uniform vec2 uTailBase;
uniform float uTailAmp;
uniform float uTailQuiver;
uniform float uTailBias;
uniform vec2 uBodyC;
uniform float uBreath;
uniform vec2 uJitter;
uniform float uReflect;
varying vec2 vUv;
varying float vFade;
vec2 rot(vec2 p, vec2 c, float a) {
  float s = sin(a), co = cos(a);
  p -= c;
  return c + vec2(co * p.x - s * p.y, s * p.x + co * p.y);
}
void main() {
  vUv = aUv;
  vec2 p = aUv * uSize;
  p = rot(p, uEarBase.xy, uEarRot.x * aEar.x);
  p = rot(p, uEarBase.zw, uEarRot.y * aEar.y);
  p = rot(p, uNeck, uHeadRot * aHead);
  p += uHeadShift * aHead;
  float s = aTail.y;
  float wave = sin(uTime * 1.55 - s * 2.4) * uTailAmp + sin(uTime * 19.0 - s * 6.0) * uTailQuiver + uTailBias;
  p = rot(p, uTailBase, wave * pow(s, 1.35) * aTail.x);
  vec2 d = p - uBodyC;
  p = uBodyC + d * (1.0 + aBody * uBreath * vec2(0.35, 1.0));
  p += uJitter * (aBody + aHead * 0.6);
  vec3 pos = vec3((p.x - uPivot.x) / uSize.y, (uPivot.y - p.y) / uSize.y, aDepth * uDepthAmt);
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
uniform vec2 uSize;
uniform float uMargin;
uniform float uTime;
uniform vec2 uEyeL; uniform vec2 uEyeLR; uniform float uEyeLRot;
uniform vec2 uEyeR; uniform vec2 uEyeRR; uniform float uEyeRRot;
uniform vec2 uLook;
uniform float uBlink;
uniform float uEyeBoost;
uniform float uGlowAmt;
uniform float uSweep;
uniform vec2 uCore;
uniform float uCorePulse;
uniform float uReflect;
varying vec2 vUv;
varying float vFade;

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
  float e = length(q);
  float w = 1.0 - smoothstep(0.35, 0.95, e);
  return -uLook * r * vec2(0.34, 0.26) * w;
}
// blink: the lid fur above the eye slides down over it
vec4 lid(vec2 px, vec2 c, vec2 r, float a, vec4 col) {
  vec2 rr = r * vec2(1.2, 1.45);
  vec2 q = eyeLocal(px, c, a);
  float e = length(q / rr);
  if (e > 1.0 || uBlink <= 0.001) return col;
  float top = -rr.y;
  float lidY = top + uBlink * rr.y * 1.9;
  if (q.y > lidY + 1.2) return col;
  float travel = lidY - top + rr.y * 0.35;
  vec4 fur = texAt(px - vec2(0.0, travel));
  float edge = smoothstep(lidY - 2.4, lidY + 0.6, q.y);
  vec4 l = mix(fur, vec4(fur.rgb * 0.42, fur.a), edge);
  float m = 1.0 - smoothstep(0.82, 1.0, e);
  float cover = 1.0 - smoothstep(lidY - 0.4, lidY + 1.2, q.y);
  return mix(col, l, m * max(cover, edge * (1.0 - cover) * 0.9));
}

void main() {
  vec2 px = vUv * uSize;
  if (uReflect > 0.5) px.x += sin(px.y * 0.22 + uTime * 2.2) * 1.4;
  vec2 spx = px + gaze(px, uEyeL, uEyeLR, uEyeLRot) + gaze(px, uEyeR, uEyeRR, uEyeRRot);
  vec4 col = texAt(spx);
  col = lid(px, uEyeL, uEyeLR, uEyeLRot, col);
  col = lid(px, uEyeR, uEyeRR, uEyeRRot, col);

  vec2 uv = px / uSize;
  float inImg = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  float g = texture2D(uGlow, clamp(uv, 0.0, 1.0)).r * inImg;
  float eyes = (1.0 - smoothstep(0.6, 1.25, length(eyeLocal(px, uEyeL, uEyeLRot) / uEyeLR)))
             + (1.0 - smoothstep(0.6, 1.25, length(eyeLocal(px, uEyeR, uEyeRRot) / uEyeRR)));
  float open = 1.0 - uBlink * 0.85;
  float pulse = 0.5 + 0.5 * sin(uTime * 1.7);
  float diag = (px.x * 0.75 + px.y * 0.55) / uSize.y;
  float sweep = exp(-pow(diag - uSweep, 2.0) * 160.0);
  float core = 1.0 - smoothstep(18.0, 46.0, length(px - uCore));
  vec3 blue = vec3(0.42, 0.6, 1.0);
  float lit = g * uGlowAmt * (0.22 + 0.18 * pulse + 0.9 * sweep + core * uCorePulse * 1.1) + g * eyes * uEyeBoost * open;
  col.rgb += blue * lit * col.a;

  // neon rim from the city: magenta on left-facing edges, cyan on right-facing edges
  float aL = texAt(px - vec2(3.0, 0.0)).a, aR = texAt(px + vec2(3.0, 0.0)).a;
  float aU = texAt(px - vec2(0.0, 3.0)).a, aD = texAt(px + vec2(0.0, 3.0)).a;
  vec2 grad = vec2(aR - aL, aD - aU);
  float edge = clamp(length(grad) * 1.1, 0.0, 1.0) * col.a;
  vec3 rim = mix(vec3(1.0, 0.32, 0.86), vec3(0.25, 0.85, 1.0), step(grad.x, 0.0));
  col.rgb += rim * edge * 0.2 * (1.0 - step(0.5, uReflect));

  // halo bloom around the blue lights (additive, adds no coverage)
  vec2 huv = (px + vec2(uMargin)) / (uSize + vec2(uMargin * 2.0));
  float h = texture2D(uHalo, huv).r;
  vec3 halo = blue * h * (0.32 + 0.22 * pulse + uCorePulse * 0.35 * core) * uGlowAmt;

  if (uReflect > 0.5) {
    float f = vFade * 0.3;
    col.rgb *= vec3(0.5, 0.56, 0.82) * f;
    col.a *= f;
    halo *= f * 0.6;
  }
  gl_FragColor = vec4(col.rgb + halo, col.a);
}
`;

/* ------------------------------------------------------------------ app */

function createApp(imgs, allowSoftware) {
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
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: !allowSoftware });
  } catch (e) {
    stage.remove(); hud.remove();
    mark("no-webgl");
    return;
  }
  renderer.setClearColor(0x000000, 0);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const maxDpr = coarse ? 1.5 : 2;

  // textures
  const mapTex = new T.Texture(imgs.map);
  mapTex.premultiplyAlpha = true;
  mapTex.flipY = false;
  mapTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  mapTex.minFilter = T.LinearMipmapLinearFilter;
  mapTex.needsUpdate = true;
  const glowTex = new T.Texture(imgs.glow);
  glowTex.flipY = false;
  glowTex.needsUpdate = true;
  const haloTex = new T.CanvasTexture(haloCanvas(imgs.glow));
  haloTex.flipY = false;

  // CPU copies: alpha for hit testing, depth for vertex displacement
  const alphaPx = pixelsOf(imgs.map, IMG_W, IMG_H);
  const depthPx = pixelsOf(imgs.depth, IMG_W, IMG_H);
  const alphaAt = (x, y) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= IMG_W || yi >= IMG_H) return 0;
    return alphaPx[(yi * IMG_W + xi) * 4 + 3] / 255;
  };
  const depthAt = (x, y) => {
    const xi = clamp(Math.round(x), 0, IMG_W - 1), yi = clamp(Math.round(y), 0, IMG_H - 1);
    return depthPx[(yi * IMG_W + xi) * 4] / 255;
  };

  // geometry over the image plus a glow margin, with per-vertex animation weights
  const NX = coarse ? 96 : 128, NY = coarse ? 108 : 146;
  const x0 = -MARGIN, y0 = -MARGIN, x1 = IMG_W + MARGIN, y1 = IMG_H + MARGIN;
  const nv = (NX + 1) * (NY + 1);
  const aPos = new Float32Array(nv * 3), aUv = new Float32Array(nv * 2), aDepth = new Float32Array(nv);
  const aHead = new Float32Array(nv), aEar = new Float32Array(nv * 2), aTail = new Float32Array(nv * 2), aBody = new Float32Array(nv);
  const tailLen = [];
  let tl = 0;
  for (let i = 0; i < LM.tail.length - 1; i++) {
    tailLen.push(tl);
    tl += Math.hypot(LM.tail[i + 1][0] - LM.tail[i][0], LM.tail[i + 1][1] - LM.tail[i][1]);
  }
  for (let j = 0, k = 0; j <= NY; j++) {
    for (let i = 0; i <= NX; i++, k++) {
      const x = lerp(x0, x1, i / NX), y = lerp(y0, y1, j / NY);
      aPos[k * 3] = (x - PIVOT[0]) / IMG_H;
      aPos[k * 3 + 1] = (PIVOT[1] - y) / IMG_H;
      aUv[k * 2] = x / IMG_W;
      aUv[k * 2 + 1] = y / IMG_H;
      aDepth[k] = depthAt(x, y);
      // head (ears included), fading out across the neck
      const hx = (x - LM.headC[0]) / LM.headR[0], hy = (y - LM.headC[1]) / LM.headR[1];
      const he = Math.hypot(hx, hy);
      aHead[k] = (1 - sstep(0.78, 1.05, he)) * (1 - sstep(236, 292, y));
      // ears rotate about their bases
      for (const [n, ear] of [[0, LM.earL], [1, LM.earR]]) {
        const len = Math.hypot(ear.tip[0] - ear.base[0], ear.tip[1] - ear.base[1]);
        aEar[k * 2 + n] = clamp(1 - Math.hypot(x - ear.tip[0], y - ear.tip[1]) / (len * 1.15), 0, 1);
      }
      // tail: inside the tail region, parameter s along the tail curve
      let best = Infinity, s = 0;
      for (let t = 0; t < LM.tail.length - 1; t++) {
        const [d, u] = distToSeg(x, y, LM.tail[t][0], LM.tail[t][1], LM.tail[t + 1][0], LM.tail[t + 1][1]);
        if (d < best) {
          best = d;
          s = (tailLen[t] + u * Math.hypot(LM.tail[t + 1][0] - LM.tail[t][0], LM.tail[t + 1][1] - LM.tail[t][1])) / tl;
        }
      }
      const inside = inPoly(x, y, LM.tailPoly);
      const soft = inside ? sstep(0, 14, polyEdgeDist(x, y, LM.tailPoly)) * 0.5 + 0.5 : 0.5 - sstep(0, 14, polyEdgeDist(x, y, LM.tailPoly)) * 0.5;
      aTail[k * 2] = clamp(soft, 0, 1) * sstep(0.04, 0.3, s);
      aTail[k * 2 + 1] = s;
      // torso breathing, legs and paws stay planted
      const bx = (x - LM.bodyC[0]) / LM.bodyR[0], by = (y - LM.bodyC[1]) / LM.bodyR[1];
      aBody[k] = (1 - sstep(0.7, 1.05, Math.hypot(bx, by))) * (1 - sstep(470, 545, y)) * (1 - aTail[k * 2]);
    }
  }
  const idx = [];
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setIndex(idx);
  geo.setAttribute("position", new T.BufferAttribute(aPos, 3));
  geo.setAttribute("aUv", new T.BufferAttribute(aUv, 2));
  geo.setAttribute("aDepth", new T.BufferAttribute(aDepth, 1));
  geo.setAttribute("aHead", new T.BufferAttribute(aHead, 1));
  geo.setAttribute("aEar", new T.BufferAttribute(aEar, 2));
  geo.setAttribute("aTail", new T.BufferAttribute(aTail, 2));
  geo.setAttribute("aBody", new T.BufferAttribute(aBody, 1));

  const U = {
    uMap: { value: mapTex }, uGlow: { value: glowTex }, uHalo: { value: haloTex },
    uSize: { value: new T.Vector2(IMG_W, IMG_H) }, uPivot: { value: new T.Vector2(PIVOT[0], PIVOT[1]) },
    uMargin: { value: MARGIN }, uTime: { value: 0 }, uDepthAmt: { value: 0.075 },
    uNeck: { value: new T.Vector2(LM.neck[0], LM.neck[1]) }, uHeadRot: { value: 0 }, uHeadShift: { value: new T.Vector2() },
    uEarBase: { value: new T.Vector4(LM.earL.base[0], LM.earL.base[1], LM.earR.base[0], LM.earR.base[1]) }, uEarRot: { value: new T.Vector2() },
    uTailBase: { value: new T.Vector2(LM.tail[0][0], LM.tail[0][1]) }, uTailAmp: { value: 0.07 }, uTailQuiver: { value: 0 }, uTailBias: { value: 0 },
    uBodyC: { value: new T.Vector2(LM.bodyC[0], LM.bodyC[1]) }, uBreath: { value: 0 }, uJitter: { value: new T.Vector2() },
    uEyeL: { value: new T.Vector2(LM.eyeL[0], LM.eyeL[1]) }, uEyeLR: { value: new T.Vector2(LM.eyeLR[0], LM.eyeLR[1]) }, uEyeLRot: { value: LM.eyeLRot },
    uEyeR: { value: new T.Vector2(LM.eyeR[0], LM.eyeR[1]) }, uEyeRR: { value: new T.Vector2(LM.eyeRR[0], LM.eyeRR[1]) }, uEyeRRot: { value: LM.eyeRRot },
    uLook: { value: new T.Vector2() }, uBlink: { value: 0 }, uEyeBoost: { value: 0.35 },
    uGlowAmt: { value: 1 }, uSweep: { value: -1 }, uCore: { value: new T.Vector2(LM.chestCore[0], LM.chestCore[1]) }, uCorePulse: { value: 0 },
    uReflect: { value: 0 },
  };
  const mat = new T.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: false, premultipliedAlpha: true });
  const reflU = Object.assign({}, U, { uReflect: { value: 1 } });
  const reflMat = new T.ShaderMaterial({ uniforms: reflU, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: false, premultipliedAlpha: true });

  const scene = new T.Scene();
  const group = new T.Group();
  scene.add(group);
  const refl = new T.Mesh(geo, reflMat);
  refl.frustumCulled = false;
  refl.renderOrder = 0;
  const cat = new T.Mesh(geo, mat);
  cat.frustumCulled = false;
  cat.renderOrder = 2;

  // soft contact shadow under the paws
  const shC = document.createElement("canvas");
  shC.width = 256; shC.height = 64;
  const sg = shC.getContext("2d");
  const grd = sg.createRadialGradient(128, 32, 4, 128, 32, 128);
  grd.addColorStop(0, "rgba(3,2,10,0.75)");
  grd.addColorStop(0.5, "rgba(3,2,10,0.35)");
  grd.addColorStop(1, "rgba(3,2,10,0)");
  sg.fillStyle = grd;
  sg.fillRect(0, 0, 256, 64);
  const shadow = new T.Mesh(new T.PlaneGeometry(1.0, 0.11), new T.MeshBasicMaterial({ map: new T.CanvasTexture(shC), transparent: true, depthWrite: false, depthTest: false }));
  shadow.position.set(-0.02, -0.006, -0.01);
  shadow.renderOrder = 1;

  const tilt = new T.Group();
  tilt.add(refl, shadow, cat);
  group.add(tilt);

  const camera = new T.PerspectiveCamera(20, 1, 0.05, 50);
  let stageW = 1, stageH = 1, anchorH = 1;

  function layout() {
    const sr = stage.getBoundingClientRect();
    const cr = creature.getBoundingClientRect();
    if (!sr.width || !sr.height || !cr.height) return;
    stageW = sr.width; stageH = sr.height; anchorH = cr.height;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(stageW, stageH, false);
    const worldH = stageH / anchorH;
    const dist = worldH / (2 * Math.tan((camera.fov * Math.PI) / 360));
    camera.aspect = stageW / stageH;
    camera.position.set(0, 0, dist);
    camera.near = dist * 0.1; camera.far = dist * 4;
    camera.updateProjectionMatrix();
    // place the ground pivot where it sits inside the anchor
    const px = cr.left - sr.left + (PIVOT[0] / IMG_W) * cr.width;
    const py = cr.top - sr.top + (PIVOT[1] / IMG_H) * cr.height;
    group.position.set((px - stageW / 2) / anchorH, (stageH / 2 - py) / anchorH, 0);
    requestRender();
  }

  // image px -> stage px (after the current tilt)
  const tmpV = new T.Vector3();
  function toStage(x, y, z) {
    tmpV.set((x - PIVOT[0]) / IMG_H, (PIVOT[1] - y) / IMG_H, z || 0);
    tilt.updateWorldMatrix(true, false);
    tilt.localToWorld(tmpV);
    tmpV.project(camera);
    return [(tmpV.x * 0.5 + 0.5) * stageW, (-tmpV.y * 0.5 + 0.5) * stageH];
  }

  /* -------------------------------------------------------------- state */
  const S = {
    time: 0, last: 0, running: false, rafId: 0, visible: true, ready: false,
    pointer: { x: 0, y: 0, nx: 0, ny: 0, active: false },
    look: new T.Vector2(), lookT: new T.Vector2(),
    yaw: 0, pitch: 0, dragYaw: 0, dragVel: 0, dragging: false, dragStartX: 0, dragLastX: 0, downAt: 0, downOnCat: false, moved: false,
    hover: 0, hoverT: 0,
    blink: 0, blinkT: 0, nextBlink: performance.now() + rand(1800, 3500), blinkEnd: 0,
    ear: [0, 0], earT: [0, 0], nextEar: performance.now() + rand(3500, 7000),
    idleLookUntil: 0, nextIdleLook: performance.now() + rand(7000, 12000), idleLookX: -1,
    tailFlick: 0, nextFlick: performance.now() + rand(6000, 11000),
    pets: 0, lastPet: 0, purrUntil: 0, hopT: -1, moodTimer: 0,
    sweep: -1, nextSweep: performance.now() + 2500,
  };
  const reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionOK = () => !reduceMQ.matches && !root.classList.contains("motion-paused");

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
    if (!motionOK()) return;
    const [cx, cy] = toStage(LM.headC[0] + 40, LM.headC[1] + 60, 0.06);
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
    if (status) status.textContent = S.pets === 1 ? NAME + " purrs." : NAME + " purrs happily (" + S.pets + " pets).";
    clearTimeout(S.moodTimer);
    S.moodTimer = setTimeout(() => {
      creature.classList.remove("is-purring");
      setLabel(DEFAULT_LABEL, false);
      requestRender();
    }, S.purrUntil - now);
    purrSound.play((S.purrUntil - now) / 1000, S.pets);
    if (coarse && !purrSound.muted && navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* ignore */ } }
    burst(6 + S.pets * 3, S.pets >= 2 ? 2 + Math.min(S.pets, 4) : 1);
    if (S.pets >= 4 && motionOK()) S.hopT = 0;
    requestRender();
  }

  /* -------------------------------------------------------------- input */
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  const plane = new T.Plane();
  const hit = new T.Vector3();
  const inv = new T.Matrix4();
  function catPixelAt(clientX, clientY) {
    const sr = stage.getBoundingClientRect();
    if (clientX < sr.left || clientX > sr.right || clientY < sr.top || clientY > sr.bottom) return null;
    ndc.set(((clientX - sr.left) / sr.width) * 2 - 1, -((clientY - sr.top) / sr.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    tilt.updateMatrixWorld();
    plane.setFromNormalAndCoplanarPoint(new T.Vector3(0, 0, 1).transformDirection(tilt.matrixWorld), new T.Vector3().setFromMatrixPosition(tilt.matrixWorld));
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    inv.copy(tilt.matrixWorld).invert();
    hit.applyMatrix4(inv);
    const x = hit.x * IMG_H + PIVOT[0], y = PIVOT[1] - hit.y * IMG_H;
    return { x, y, a: alphaAt(x, y) };
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
    if (!motionOK()) return;
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

  function update(dt, now) {
    const moving = motionOK() && dt > 0;
    const purring = now < S.purrUntil;
    if (moving) S.time += dt;
    const t = S.time;
    U.uTime.value = t;

    // hover and pointer tracking
    S.hover = moving ? damp(S.hover, S.hoverT, 8, dt) : S.hoverT;
    let lookX = 0, lookY = 0, yawT = 0, pitchT = 0;
    if (S.pointer.active) {
      const [ex, ey] = toStage((LM.eyeL[0] + LM.eyeR[0]) / 2, (LM.eyeL[1] + LM.eyeR[1]) / 2, 0.05);
      const sr = stage.getBoundingClientRect();
      const dx = S.pointer.x - (sr.left + ex), dy = S.pointer.y - (sr.top + ey);
      lookX = clamp(dx / 260, -1, 1);
      lookY = clamp(dy / 220, -1, 1);
      yawT = clamp(S.pointer.nx * 0.12, -0.12, 0.12);
      pitchT = clamp(S.pointer.ny * 0.05, -0.05, 0.05);
    }
    if (now < S.idleLookUntil) { lookX = S.idleLookX; lookY = 0.1; }
    if (moving && now > S.nextIdleLook) {
      S.idleLookX = Math.random() < 0.6 ? -1 : 0.7;
      S.idleLookUntil = now + rand(1200, 2200);
      S.nextIdleLook = now + rand(9000, 15000);
    }
    S.lookT.set(lookX, lookY);
    if (moving) { S.look.x = damp(S.look.x, S.lookT.x, 6, dt); S.look.y = damp(S.look.y, S.lookT.y, 6, dt); }
    else S.look.copy(S.lookT);
    U.uLook.value.copy(S.look);

    // head follows the gaze a little, tilts into the pointer while purring
    const headT = -S.look.x * 0.045 + S.look.y * 0.012 + (purring ? Math.sin(t * 2.2) * 0.02 - 0.035 : 0) + Math.sin(t * 0.37) * 0.012;
    U.uHeadRot.value = moving ? damp(U.uHeadRot.value, headT, 5, dt) : headT;
    U.uHeadShift.value.set(S.look.x * 1.6, S.look.y * 1.0 + Math.sin(t * 1.38) * 0.6);

    // blinks
    if (moving && now > S.nextBlink && !purring) {
      S.blinkEnd = now + 170;
      S.nextBlink = now + (Math.random() < 0.18 ? 260 : rand(2600, 6200));
    }
    let blinkT = now < S.blinkEnd ? 1 : 0;
    if (purring) blinkT = 0.78;
    if (!moving) blinkT = purring ? 0.78 : 0;
    S.blink = moving ? damp(S.blink, blinkT, blinkT > S.blink ? 32 : 20, dt) : blinkT;
    U.uBlink.value = S.blink;
    U.uEyeBoost.value = 0.32 + S.hover * 0.55 + (purring ? 0.1 : 0);

    // ears
    if (moving && now > S.nextEar) {
      const which = Math.random() < 0.5 ? 0 : 1;
      S.earT[which] = (which ? 1 : -1) * rand(0.1, 0.18);
      setTimeout(() => { S.earT[which] = 0; }, rand(140, 260));
      S.nextEar = now + rand(3500, 8500);
    }
    const perk = S.hover * 0.05;
    for (let i = 0; i < 2; i++) S.ear[i] = moving ? damp(S.ear[i], S.earT[i] + (i ? perk : -perk), 18, dt) : 0;
    U.uEarRot.value.set(S.ear[0], S.ear[1]);

    // tail
    if (moving && now > S.nextFlick) { S.tailFlick = 1; S.nextFlick = now + rand(6000, 12000); }
    S.tailFlick = moving ? damp(S.tailFlick, 0, 1.6, dt) : 0;
    U.uTailAmp.value = moving ? 0.055 + S.tailFlick * 0.06 + S.hover * 0.02 : 0;
    U.uTailQuiver.value = moving && purring ? 0.012 : 0;
    U.uTailBias.value = moving ? Math.sin(t * 0.43) * 0.02 : 0;

    // breathing and purr
    const breathRate = purring ? 0.62 : 0.22;
    U.uBreath.value = moving ? Math.sin(t * TAU * breathRate) * (purring ? 0.016 : 0.011) : 0;
    if (moving && purring) U.uJitter.value.set(rand(-0.55, 0.55), rand(-0.45, 0.45));
    else U.uJitter.value.set(0, 0);
    U.uCorePulse.value = purring ? 0.5 + 0.5 * Math.sin(t * 9) : 0.15 + 0.15 * Math.sin(t * 2.1);

    // light sweep across the armor
    if (moving && now > S.nextSweep) { S.sweep = -0.2; S.nextSweep = now + rand(4200, 6500); }
    if (moving && S.sweep < 1.6) S.sweep += dt * 0.85;
    U.uSweep.value = moving ? S.sweep : -1;
    U.uGlowAmt.value = 1 + S.hover * 0.25;

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
    S.pitch = moving ? damp(S.pitch, moving ? pitchT : 0, 4, dt) : 0;
    tilt.rotation.set(S.pitch, S.yaw, 0);

    // happy hop
    let lift = 0, squash = 1;
    if (S.hopT >= 0 && moving) {
      S.hopT += dt;
      const h = S.hopT / 0.55;
      if (h < 1) { lift = Math.sin(Math.PI * h) * 0.03; squash = 1 - 0.03 * Math.sin(Math.PI * clamp((h - 0.82) / 0.18, 0, 1)); }
      else S.hopT = -1;
    }
    tilt.position.y = lift;
    tilt.scale.set(1 / Math.sqrt(squash), squash, 1);

    placeHud();
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
  function placeHud() {
    if (!hudW) { hudW = hud.offsetWidth; hudH = hud.offsetHeight; }
    const cr = creature.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const [hx, hy] = toStage(LM.headTop[0] + 20, LM.headTop[1], 0.04);
    const ox = sr.left - cr.left, oy = sr.top - cr.top;
    let x = ox + hx - hudW * 0.3, y = oy + hy - hudH - 16;
    const minX = -cr.left + 8, maxX = window.innerWidth - cr.left - hudW - 8;
    x = clamp(x, minX, maxX);
    hud.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    tag.style.setProperty("--lead", clamp(ox + hx - x, 10, hudW - 40).toFixed(0) + "px");
    if (hint && !creature.classList.contains("was-petted")) {
      const [cx, cy] = toStage(LM.chestCore[0] - 10, LM.chestCore[1] + 20, 0.05);
      const hw = hint.offsetWidth || 90;
      let hxp = ox + cx - hw - 14;
      if (cr.left + hxp < 8) hxp = ox + cx + 120;
      hint.style.transform = `translate(${hxp.toFixed(1)}px, ${(oy + cy).toFixed(1)}px)`;
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
    else { stop(); requestRender(); }
  };
  if (reduceMQ.addEventListener) reduceMQ.addEventListener("change", onMotionChange);
  new MutationObserver(onMotionChange).observe(root, { attributes: true, attributeFilter: ["class"] });
  if ("ResizeObserver" in window) new ResizeObserver(() => { hudW = 0; layout(); }).observe(creature);
  window.addEventListener("resize", () => { hudW = 0; layout(); }, { passive: true });

  layout();
  hud.classList.add("is-on");
  update(0, performance.now());
  draw();
  start();

  // test hooks
  creature.cat3d = { pet, sound: purrSound, state: S, uniforms: U, render: requestRender, layout };
}
