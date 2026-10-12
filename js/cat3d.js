/*
 * Kopicat, the owner's cat, as a 3D hologram (three.js r160).
 *
 * Model: "Siamese In Motion" by restore50 on Sketchfab (CC BY 4.0, https://skfb.ly/pKuUt), optimized
 * for the web (models/kopicat-holo.glb: normalized so the cat is 1 unit tall, paws on y = 0, head
 * toward +z). It is rendered as a hologram projected from a black circular base, with Kopicat's
 * cyborg accents (collar and chest core, joint rings, head modules, crystal tail blade) added here.
 *
 * Motion: he turns on the base between profile, three quarter and front views (and now and then
 * all the way around), breathes, sways his tail, flicks his ears, blinks his glowing eyes and turns
 * his head toward the pointer. Drag him to spin him, click or tap to pet him (purr with sound,
 * sparks and hearts, a happy spin or hop when petted again quickly). Enter or Space on the pet
 * button pets, ArrowLeft and ArrowRight turn him.
 *
 * Contract (index.html): div.creature[data-creature] > img.cat-img (static fallback),
 * button[data-cat-pet], span[data-cat-hint], span[data-cat-status]. Page blocks marked data-cat-avoid
 * (the hero text and controls) keep the base and the hint clear of them, shrinking the hologram a
 * little when the room is tight. On success .creature gets .has-3d and data-cat3d="ready".
 * The stage never takes pointer input itself, the module ray casts against the cat and the base,
 * so nearby links and buttons stay clickable.
 * prefers-reduced-motion or html.motion-paused render still frames. The loop pauses offscreen and
 * in hidden tabs. URL switches (testing): ?cat3d=off keeps the static image, ?cat3d=force allows
 * software WebGL.
 */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const NAME = "Kopicat";
const DEFAULT_LABEL = "felis.kopicat · 0.99";
const MOODS = ["status · purring", "status · purring louder", "status · very happy", "status · best friends"];
const PURR_MS = 2600;
const COMBO_MS = 4000;
const MUTE_KEY = "purr-muted";
const SVG_NS = "http://www.w3.org/2000/svg";

// Model space landmarks (cat height 1, paws on y = 0, head toward +z).
const LM = {
  neck: [0, 0.5, 0.5],
  eyes: [[-0.059, 0.539, 0.747], [0.045, 0.538, 0.749]],
  ears: [{ base: [-0.098, 0.618, 0.71] }, { base: [0.098, 0.618, 0.71] }],
  collar: { c: [0, 0.492, 0.53], rx: 0.112, ry: 0.152, tilt: -16 * DEG },
  core: [0, 0.405, 0.628],
  rings: [
    // shoulders, hips, elbows, hocks: [x, y, z, radius]
    [-0.149, 0.44, 0.4, 0.034], [0.149, 0.44, 0.4, 0.034],
    [-0.145, 0.46, -0.34, 0.036], [0.146, 0.46, -0.34, 0.036],
    [-0.147, 0.22, 0.338, 0.022], [0.134, 0.22, 0.54, 0.022],
    [-0.125, 0.2, -0.468, 0.022], [0.131, 0.2, -0.194, 0.022],
  ],
  modules: [[-0.126, 0.615, 0.675], [0.126, 0.615, 0.675]],
  tail: { tip: [0, 0.971, -0.58], dir: [0, 0.34, 0.94] },   // the tail curls up and over, its tip points forward
};
const BASE_R = 0.86;          // projector base radius (world units, the cat is 1 tall)
const IDLE = [                 // turntable program: [yaw in degrees, hold in ms]
  [-52, 4200], [-90, 3000], [-20, 3600], [-52, 2600], ["spin", 0],
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
const rand = (a, b) => a + Math.random() * (b - a);
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

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

async function boot() {
  let flag = "";
  try { flag = new URLSearchParams(window.location.search).get("cat3d") || ""; } catch (e) { /* ignore */ }
  if (flag === "off") return mark("off");
  const conn = navigator.connection;
  if (conn && conn.saveData && flag !== "force") return mark("save-data");
  const force = flag === "force";
  if (!canUseWebGL2(force)) return mark("no-webgl");
  mark("loading");
  const load = () => Promise.all([
    import("three"),
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/libs/meshopt_decoder.module.js"),
    import("three/addons/environments/RoomEnvironment.js"),
  ]);
  let mods;
  try { mods = await load(); } catch (err) { await new Promise((r) => setTimeout(r, 1500)); mods = await load(); }
  THREE = mods[0];
  const loader = new mods[1].GLTFLoader().setMeshoptDecoder(mods[2].MeshoptDecoder);
  const url = new URL("../models/kopicat-holo.glb", import.meta.url).href;
  let gltf;
  try { gltf = await loader.loadAsync(url); } catch (err) { await new Promise((r) => setTimeout(r, 1500)); gltf = await loader.loadAsync(url); }
  createApp(gltf, mods[3].RoomEnvironment, force);
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

function glowCanvas(size, inner, outer) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.35, outer);
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

/* ------------------------------------------------------------------ shaders */

const CAT_VS = /* glsl */ `
attribute vec4 aW;   // x head, y tail weight, z tail position (0 base to 1 tip), w torso
attribute vec2 aE;   // left and right ear weights
uniform float uTime;
uniform vec2 uHead;  // yaw, pitch (radians)
uniform vec3 uNeck;
uniform vec4 uEarL;  // base xyz, angle
uniform vec4 uEarR;
uniform float uTailAmp;
uniform float uTailQuiver;
uniform float uTailBias;
uniform float uBreath;
uniform vec2 uJitter;
uniform float uGlitch;
uniform float uGlitchSeed;
uniform mat3 uMapT;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying float vY;
varying float vTail;
varying float vHead;
mat3 rotY(float a) { float s = sin(a), c = cos(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a) { float s = sin(a), c = cos(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotZ(float a) { float s = sin(a), c = cos(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
void main() {
  vec3 p = position;
  vec3 n = normal;
  // breathing: the torso widens a little
  p.x *= 1.0 + uBreath * aW.w;
  p.y += uBreath * aW.w * 0.4 * (p.y - 0.3);
  // ear flicks around each ear base
  p = uEarL.xyz + rotZ(uEarL.w * aE.x) * (p - uEarL.xyz);
  p = uEarR.xyz + rotZ(uEarR.w * aE.y) * (p - uEarR.xyz);
  // tail sway, stronger toward the tip
  float s = aW.z;
  float sway = (sin(uTime * 1.6 - s * 3.0) * uTailAmp + sin(uTime * 21.0 - s * 7.0) * uTailQuiver + uTailBias) * pow(s, 1.3) * aW.y;
  p.x += sway;
  // head turn around the neck
  mat3 R = rotY(uHead.x * aW.x) * rotX(uHead.y * aW.x);
  p = uNeck + R * (p - uNeck);
  n = R * n;
  // purr vibration
  p.xy += uJitter * (aW.w + aW.x * 0.6);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  // glitch: thin horizontal slices jump sideways
  float band = floor(p.y * 42.0 + uGlitchSeed * 17.0);
  float gl = step(0.7, fract(sin(band * 91.7 + uGlitchSeed * 3.1) * 4375.85)) * uGlitch;
  wp.x += gl * (fract(sin(band * 12.9 + uGlitchSeed) * 9137.3) - 0.5) * 0.14;
  vY = p.y;
  vUv = (uMapT * vec3(uv, 1.0)).xy;
  vN = normalize(mat3(modelMatrix) * n);
  vV = normalize(cameraPosition - wp.xyz);
  vTail = aW.y;
  vHead = aW.x;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const CAT_FS = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uIntensity;
uniform float uBuild;
uniform float uScan;
uniform float uPulse;
uniform float uEye;
uniform float uFlicker;
uniform float uHover;
uniform float uStatic;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying float vY;
varying float vTail;
varying float vHead;
void main() {
  if (vY > uBuild) discard;
  vec3 tex = texture2D(uMap, vUv).rgb;
  float lum = dot(tex, vec3(0.299, 0.587, 0.114));
  float eye = smoothstep(0.06, 0.2, tex.b - max(tex.r, tex.g)) * vHead;
  float ndv = abs(dot(normalize(vN), normalize(vV)));
  float fres = pow(1.0 - ndv, 2.0);
  // fur and markings: light fur glows, the darker lynx points stay deep blue
  vec3 deep = vec3(0.08, 0.13, 0.55);
  vec3 light = vec3(0.55, 0.78, 1.0);
  vec3 col = mix(deep, light, pow(lum, 0.8)) * (0.22 + 0.95 * lum);
  // edges: violet and cyan rim, like light caught in the projection
  col += vec3(0.62, 0.42, 1.0) * fres * 0.9 + vec3(0.6, 0.95, 1.0) * pow(fres, 4.0) * 0.8;
  // scan lines and a sweep that travels up the body
  float lines = mix(0.66 + 0.34 * sin(vY * 620.0 - uTime * 9.0), 0.86, uStatic);
  col *= lines;
  col += vec3(0.45, 0.75, 1.0) * exp(-pow((vY - uScan) * 18.0, 2.0)) * 0.5;
  // eyes glow
  col += vec3(0.65, 0.95, 1.0) * eye * uEye * 1.6;
  col *= uFlicker * (1.0 + uPulse * 0.65 + uHover * 0.18);
  // materialize edge while the hologram builds up from the base
  float edge = exp(-pow((uBuild - vY) * 55.0, 2.0)) * step(uBuild, 1.04);
  col += vec3(0.75, 0.9, 1.0) * edge * 1.6;
  col *= uIntensity;
  gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));
}
`;

const DEPTH_FS = /* glsl */ `
uniform float uBuild;
varying float vY;
void main() { if (vY > uBuild) discard; gl_FragColor = vec4(0.0); }
`;

const SIMPLE_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const DISC_FS = /* glsl */ `
uniform float uTime; uniform float uOn; uniform float uPulse;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float a = atan(p.y, p.x);
  float rings = 0.5 + 0.5 * sin(r * 56.0 - uTime * 2.6);
  float spokes = smoothstep(0.92, 1.0, 0.5 + 0.5 * sin(a * 36.0 + uTime * 0.4)) * smoothstep(0.62, 0.7, r) * (1.0 - smoothstep(0.9, 0.98, r));
  float core = exp(-r * r * 9.0);
  float v = (1.0 - smoothstep(0.82, 1.0, r)) * (0.16 + 0.24 * rings) + spokes * 0.55 + core * (0.45 + uPulse * 0.6);
  vec3 c = vec3(0.3, 0.48, 1.0) * v * uOn;
  gl_FragColor = vec4(c, c.b);
}
`;

const BEAM_FS = /* glsl */ `
uniform float uTime; uniform float uOn;
varying vec2 vUv;
void main() {
  float fade = pow(1.0 - vUv.y, 1.7);
  float streaks = 0.75 + 0.25 * sin(vUv.x * 120.0 + uTime * 1.6) * sin(vUv.x * 37.0 - uTime * 0.9);
  float v = fade * 0.13 * streaks;
  vec3 c = vec3(0.38, 0.55, 1.0) * v * uOn;
  gl_FragColor = vec4(c, c.b);
}
`;

const PTS_VS = /* glsl */ `
attribute float aSeed;
uniform float uTime; uniform float uH; uniform float uPx;
varying float vA;
void main() {
  vec3 p = position;
  float y = fract(p.y + uTime * (0.05 + aSeed * 0.07)) * uH;
  p.y = y;
  p.x += sin(uTime * 0.7 + aSeed * 30.0) * 0.02;
  vA = (1.0 - y / uH) * (0.4 + 0.6 * fract(aSeed * 7.3));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uPx * (0.5 + aSeed) / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const PTS_FS = /* glsl */ `
uniform float uOn;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vA * uOn;
  vec3 c = vec3(0.55, 0.75, 1.0) * a;
  gl_FragColor = vec4(c, c.b);
}
`;

/* ------------------------------------------------------------------ app */

function createApp(gltf, RoomEnvironment, allowSoftware) {
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
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const maxDpr = coarse ? 1.5 : 1.75;

  const scene = new T.Scene();
  const pmrem = new T.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new T.PerspectiveCamera(22, 1, 0.05, 50);
  const PITCH = 13 * DEG;
  const LOOK_Y = 0.42;

  // Light added on top of the page. Every pass writes premultiplied color with its brightest
  // channel as alpha, and both add up, so the canvas composites like a screen over the page.
  // Built in materials get the same output through a small patch at the end of their shader.
  const PREMUL = "  gl_FragColor.rgb *= gl_FragColor.a;\n  gl_FragColor.a = max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b));\n}\n";
  const additive = (m) => {
    m.transparent = true;
    m.depthWrite = false;
    m.blending = T.CustomBlending;
    m.blendEquation = T.AddEquation;
    m.blendSrc = m.blendDst = m.blendSrcAlpha = m.blendDstAlpha = T.OneFactor;
    m.toneMapped = false;
    if (!m.isShaderMaterial) m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace(/\}\s*$/, PREMUL); };
    return m;
  };

  /* -------------------------------------------------------------- the cat geometry */
  let srcMesh = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => { if (o.isMesh && !srcMesh) srcMesh = o; });
  const sg = srcMesh.geometry;
  const map = srcMesh.material.map;
  map.updateMatrix();
  const mw = srcMesh.matrixWorld;
  const nmat = new T.Matrix3().getNormalMatrix(mw);
  const vc = sg.attributes.position.count;
  const P = new Float32Array(vc * 3), NN = new Float32Array(vc * 3), UV = new Float32Array(vc * 2);
  const W4 = new Float32Array(vc * 4), E2 = new Float32Array(vc * 2);
  const v3 = new T.Vector3();
  for (let i = 0; i < vc; i++) {
    v3.fromBufferAttribute(sg.attributes.position, i).applyMatrix4(mw);
    const x = v3.x, y = v3.y, z = v3.z;
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    v3.fromBufferAttribute(sg.attributes.normal, i).applyMatrix3(nmat).normalize();
    NN[i * 3] = v3.x; NN[i * 3 + 1] = v3.y; NN[i * 3 + 2] = v3.z;
    UV[i * 2] = sg.attributes.uv.getX(i); UV[i * 2 + 1] = sg.attributes.uv.getY(i);
    // animation weights from the vertex position
    const head = sstep(0.5, 0.64, z) * sstep(0.4, 0.5, y);
    const tailW = sstep(-0.44, -0.52, z) * sstep(0.55, 0.63, y);
    const tailS = clamp((y - 0.58) / 0.42, 0, 1);
    const torso = sstep(-0.5, -0.36, z) * (1 - sstep(0.38, 0.5, z)) * sstep(0.3, 0.4, y) * (1 - sstep(0.6, 0.68, y)) * (1 - tailW);
    W4[i * 4] = head; W4[i * 4 + 1] = tailW; W4[i * 4 + 2] = tailS; W4[i * 4 + 3] = torso;
    const ear = sstep(0.6, 0.66, y) * sstep(0.64, 0.68, z);
    E2[i * 2] = ear * sstep(-0.035, -0.07, x);
    E2[i * 2 + 1] = ear * sstep(0.035, 0.07, x);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.BufferAttribute(P, 3));
  geo.setAttribute("normal", new T.BufferAttribute(NN, 3));
  geo.setAttribute("uv", new T.BufferAttribute(UV, 2));
  geo.setAttribute("aW", new T.BufferAttribute(W4, 4));
  geo.setAttribute("aE", new T.BufferAttribute(E2, 2));
  if (sg.index) geo.setIndex(new T.BufferAttribute(sg.index.array.slice(), 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  sg.dispose();

  const U = {
    uMap: { value: map }, uMapT: { value: map.matrix },
    uTime: { value: 0 }, uIntensity: { value: 1 },
    uHead: { value: new T.Vector2() }, uNeck: { value: new T.Vector3(...LM.neck) },
    uEarL: { value: new T.Vector4(...LM.ears[0].base, 0) }, uEarR: { value: new T.Vector4(...LM.ears[1].base, 0) },
    uTailAmp: { value: 0.03 }, uTailQuiver: { value: 0 }, uTailBias: { value: 0 },
    uBreath: { value: 0 }, uJitter: { value: new T.Vector2() },
    uGlitch: { value: 0 }, uGlitchSeed: { value: 0 },
    uBuild: { value: 0 }, uScan: { value: -1 }, uPulse: { value: 0 }, uEye: { value: 1 }, uFlicker: { value: 1 }, uHover: { value: 0 }, uStatic: { value: 0 },
  };
  const catMat = (opts) => additive(new T.ShaderMaterial(Object.assign({ uniforms: U, vertexShader: CAT_VS, fragmentShader: CAT_FS }, opts)));
  const backMat = catMat({ side: T.BackSide, depthTest: false, uniforms: Object.assign({}, U, { uIntensity: { value: 0.2 } }) });
  const frontMat = catMat({ side: T.FrontSide });
  const depthMat = new T.ShaderMaterial({ uniforms: U, vertexShader: CAT_VS, fragmentShader: DEPTH_FS, colorWrite: false, depthWrite: true });

  const world = new T.Group();     // the projector and everything on it
  scene.add(world);
  const spin = new T.Group();      // turntable: the cat and his accents
  world.add(spin);
  const lift = new T.Group();      // hop
  spin.add(lift);
  const catBack = new T.Mesh(geo, backMat); catBack.renderOrder = 2; catBack.frustumCulled = false;
  const catDepth = new T.Mesh(geo, depthMat); catDepth.renderOrder = 3; catDepth.frustumCulled = false;
  const catFront = new T.Mesh(geo, frontMat); catFront.renderOrder = 4; catFront.frustumCulled = false;
  lift.add(catBack, catDepth, catFront);

  /* -------------------------------------------------------------- cyborg accents */
  const glowTex = new T.CanvasTexture(glowCanvas(128, "rgba(190,215,255,1)", "rgba(110,140,255,0.35)"));
  const accents = [];
  const ringMat = (color, o) => additive(new T.MeshBasicMaterial({ color, transparent: true, opacity: o }));
  function addGlow(parent, pos, size, strength) {
    const sp = new T.Sprite(additive(new T.SpriteMaterial({ map: glowTex, color: 0x7f9bff, opacity: strength })));
    sp.position.set(...pos);
    sp.scale.setScalar(size);
    sp.renderOrder = 6;
    parent.add(sp);
    accents.push({ mesh: sp, base: strength, kind: "glow" });
    return sp;
  }
  // collar with the chest core
  const collar = new T.Mesh(new T.TorusGeometry(1, 0.11, 10, 72), ringMat(0x9aa8ff, 0.85));
  collar.scale.set(LM.collar.rx, LM.collar.ry, 0.14);
  collar.position.set(...LM.collar.c);
  collar.rotation.x = LM.collar.tilt;
  collar.renderOrder = 5;
  lift.add(collar);
  accents.push({ mesh: collar, base: 0.85, kind: "ring" });
  const coreG = new T.Group();
  coreG.position.set(...LM.core);
  coreG.rotation.x = 0.42;
  lift.add(coreG);
  const coreRing = new T.Mesh(new T.TorusGeometry(0.03, 0.0055, 8, 40), ringMat(0xbfd0ff, 1));
  const coreDisc = new T.Mesh(new T.CircleGeometry(0.02, 32), ringMat(0xdfe8ff, 0.9));
  coreRing.renderOrder = coreDisc.renderOrder = 5;
  coreG.add(coreRing, coreDisc);
  accents.push({ mesh: coreRing, base: 1, kind: "core" }, { mesh: coreDisc, base: 0.9, kind: "core" });
  addGlow(coreG, [0, 0, 0.01], 0.13, 0.9);
  // joint rings
  for (const [x, y, z, r] of LM.rings) {
    const g = new T.Group();
    g.position.set(x, y, z);
    g.rotation.y = x < 0 ? -Math.PI / 2 : Math.PI / 2;
    const ring = new T.Mesh(new T.TorusGeometry(r, r * 0.16, 8, 36), ringMat(0x8fa2ff, 0.95));
    const dot = new T.Mesh(new T.CircleGeometry(r * 0.38, 20), ringMat(0xcfdcff, 0.75));
    ring.renderOrder = dot.renderOrder = 5;
    g.add(ring, dot);
    lift.add(g);
    accents.push({ mesh: ring, base: 0.95, kind: "ring" }, { mesh: dot, base: 0.75, kind: "ring" });
    addGlow(g, [0, 0, 0.005], r * 3.4, 0.55);
  }
  // head modules follow the head turn
  const headG = new T.Group();
  headG.position.set(...LM.neck);
  lift.add(headG);
  for (const [x, y, z] of LM.modules) {
    const g = new T.Group();
    g.position.set(x - LM.neck[0], y - LM.neck[1], z - LM.neck[2]);
    g.rotation.y = x < 0 ? -Math.PI / 2 : Math.PI / 2;
    const ring = new T.Mesh(new T.TorusGeometry(0.026, 0.006, 8, 32), ringMat(0x9fb0ff, 1));
    ring.renderOrder = 5;
    g.add(ring);
    headG.add(g);
    accents.push({ mesh: ring, base: 1, kind: "ring" });
    addGlow(g, [0, 0, 0.004], 0.09, 0.6);
  }
  // crystal blade on the tail tip, flat side toward the viewer when he stands in profile
  const bladeG = new T.Group();
  bladeG.position.set(...LM.tail.tip);
  lift.add(bladeG);
  const bladeDir = new T.Vector3(...LM.tail.dir).normalize();
  const bladeQ = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), bladeDir);
  const bladeGeo = new T.OctahedronGeometry(1, 0);
  bladeGeo.scale(0.009, 0.086, 0.032);
  bladeGeo.translate(0, 0.078, 0);
  const blade = new T.Mesh(bladeGeo, ringMat(0x4f9dff, 1));
  const bladeCore = new T.Mesh(bladeGeo, ringMat(0xcfeaff, 0.5));
  bladeCore.scale.set(1.2, 0.62, 0.42);
  blade.quaternion.copy(bladeQ);
  bladeCore.quaternion.copy(bladeQ);
  blade.renderOrder = bladeCore.renderOrder = 5;
  bladeG.add(blade, bladeCore);
  accents.push({ mesh: blade, base: 1, kind: "blade" }, { mesh: bladeCore, base: 0.5, kind: "blade" });
  addGlow(bladeG, bladeDir.clone().multiplyScalar(0.075).toArray(), 0.2, 0.75);
  // Kopicat's blue eyes: a soft halo and a bright core on each eye. They blink, and each one
  // fades as it turns away from the viewer (no depth test, so the glow reads from the side too).
  const eyeGlows = [];
  for (const e of LM.eyes) {
    const n = new T.Vector3(Math.sign(e[0]) * 0.5, 0.05, 0.86).normalize();
    for (const [size, color, base] of [[0.11, 0x3f9cff, 0.9], [0.034, 0xe6f6ff, 1]]) {
      const sp = new T.Sprite(additive(new T.SpriteMaterial({ map: glowTex, color, opacity: base, depthTest: false })));
      sp.position.set(e[0] - LM.neck[0], e[1] - LM.neck[1], e[2] - LM.neck[2] + 0.008);
      sp.scale.setScalar(size);
      sp.renderOrder = 6;
      sp.userData = { base, n };
      headG.add(sp);
      eyeGlows.push(sp);
    }
  }
  // each accent lights up when the build line reaches its height
  lift.updateMatrixWorld(true);
  const accentPos = new T.Vector3();
  for (const a of accents) a.y = a.mesh.getWorldPosition(accentPos).y;

  /* -------------------------------------------------------------- projector base */
  const base = new T.Group();
  world.add(base);
  const R = BASE_R;
  const profile = [
    [0, 0], [R * 0.86, 0], [R * 0.875, -0.006], [R * 0.95, -0.006], [R * 0.985, -0.018], [R, -0.04],
    [R, -0.095], [R * 1.05, -0.115], [R * 1.07, -0.135], [R * 1.07, -0.16], [0, -0.16],
  ].map(([x, y]) => new T.Vector2(x, y));
  const baseMat = new T.MeshPhysicalMaterial({ color: 0x07060c, metalness: 0.88, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.18, envMapIntensity: 0.55 });
  const body = new T.Mesh(new T.LatheGeometry(profile, 128), baseMat);
  body.renderOrder = 0;
  base.add(body);
  const topRing = new T.Mesh(new T.TorusGeometry(R * 0.905, 0.006, 8, 160), additive(new T.MeshBasicMaterial({ color: 0x6f86ff })));
  topRing.rotation.x = Math.PI / 2; topRing.position.y = -0.003; topRing.renderOrder = 1;
  const lowRing = new T.Mesh(new T.TorusGeometry(R * 1.072, 0.0045, 8, 180), additive(new T.MeshBasicMaterial({ color: 0xb794ff })));
  lowRing.rotation.x = Math.PI / 2; lowRing.position.y = -0.125; lowRing.renderOrder = 1;
  base.add(topRing, lowRing);
  const discU = { uTime: { value: 0 }, uOn: { value: 0 }, uPulse: { value: 0 } };
  const disc = new T.Mesh(new T.CircleGeometry(R * 0.86, 96), additive(new T.ShaderMaterial({ uniforms: discU, vertexShader: SIMPLE_VS, fragmentShader: DISC_FS })));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.002; disc.renderOrder = 1;
  base.add(disc);
  const beamU = { uTime: { value: 0 }, uOn: { value: 0 } };
  const beamGeo = new T.CylinderGeometry(R * 0.96, R * 0.86, 1.3, 72, 1, true);
  beamGeo.translate(0, 0.65, 0);
  const beam = new T.Mesh(beamGeo, additive(new T.ShaderMaterial({ uniforms: beamU, vertexShader: SIMPLE_VS, fragmentShader: BEAM_FS, side: T.DoubleSide })));
  beam.renderOrder = 1;
  base.add(beam);
  // rising specks inside the beam
  const NP = coarse ? 70 : 120;
  const pp = new Float32Array(NP * 3), ps = new Float32Array(NP);
  for (let i = 0; i < NP; i++) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * R * 0.8;
    pp[i * 3] = Math.cos(a) * r; pp[i * 3 + 1] = Math.random(); pp[i * 3 + 2] = Math.sin(a) * r;
    ps[i] = Math.random();
  }
  const pg = new T.BufferGeometry();
  pg.setAttribute("position", new T.BufferAttribute(pp, 3));
  pg.setAttribute("aSeed", new T.BufferAttribute(ps, 1));
  const ptsU = { uTime: { value: 0 }, uH: { value: 1.25 }, uPx: { value: 30 }, uOn: { value: 0 } };
  const pts = new T.Points(pg, additive(new T.ShaderMaterial({ uniforms: ptsU, vertexShader: PTS_VS, fragmentShader: PTS_FS })));
  pts.renderOrder = 1;
  pts.frustumCulled = false;
  base.add(pts);
  // neon city light on the base: magenta from the left, cyan from the right, blue from the emitter
  const lMag = new T.DirectionalLight(0xff4fd8, 1.4); lMag.position.set(-3, 1.5, 1);
  const lCyan = new T.DirectionalLight(0x36e2ff, 1.1); lCyan.position.set(3, 1.2, 1.5);
  const lEmit = new T.PointLight(0x5f7dff, 2.2, 3, 1.6); lEmit.position.set(0, 0.25, 0);
  scene.add(lMag, lCyan, lEmit);

  /* -------------------------------------------------------------- layout */
  let stageW = 1, stageH = 1, vw = window.innerWidth;
  let hudW = 0, hudH = 0;
  const tmp = new T.Vector3(), eyeN = new T.Vector3(), eyeV = new T.Vector3(), eyeP = new T.Vector3();
  function projectStage(x, y, z) {
    tmp.set(x, y, z).project(camera);
    return [(tmp.x * 0.5 + 0.5) * stageW, (-tmp.y * 0.5 + 0.5) * stageH];
  }
  function worldToStage(obj, x, y, z) {
    tmp.set(x, y, z);
    obj.updateWorldMatrix(true, false);
    obj.localToWorld(tmp);
    tmp.project(camera);
    return [(tmp.x * 0.5 + 0.5) * stageW, (-tmp.y * 0.5 + 0.5) * stageH];
  }
  const avoid = Array.from(document.querySelectorAll("[data-cat-avoid]"));
  function layout() {
    const sr = stage.getBoundingClientRect();
    const cr = creature.getBoundingClientRect();
    if (!sr.width || !sr.height || !cr.height) return;
    stageW = sr.width; stageH = sr.height;
    vw = document.documentElement.clientWidth || window.innerWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(stageW, stageH, false);
    // room for the base: the viewport, minus page blocks marked data-cat-avoid that share its rows
    let cx = cr.left + cr.width * 0.5, lo = 12, hi = vw - 16;
    const blocks = [];
    for (const el of avoid) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      blocks.push(r);
      if (r.bottom <= cr.top || r.top >= cr.bottom) continue;
      if (r.right <= cx) lo = Math.max(lo, r.right + 14);
      else if (r.left >= cx) hi = Math.min(hi, r.left - 14);
    }
    // the cat (1 unit tall) is about 0.6 anchor heights tall on screen, a little smaller when the room is tight
    const reach = BASE_R * 1.1;   // the lower rim, a little wider in perspective
    const pxPerUnit = clamp((hi - lo) / (2 * reach), cr.height * 0.42, cr.height * 0.6);
    cx = clamp(cx, lo + reach * pxPerUnit, hi - reach * pxPerUnit);
    const dist = stageH / (2 * Math.tan((camera.fov * DEG) / 2) * pxPerUnit);
    camera.aspect = stageW / stageH;
    camera.position.set(0, LOOK_Y + Math.sin(PITCH) * dist, Math.cos(PITCH) * dist);
    camera.lookAt(0, LOOK_Y, 0);
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // shift the view so the front rim of the base rests on the anchor's bottom edge
    const have = projectStage(0, 0, 0);
    const low = projectStage(0, -0.16, BASE_R * 1.07);
    const want = [cx - sr.left, cr.top - sr.top + cr.height - (low[1] - have[1])];
    camera.setViewOffset(stageW, stageH, have[0] - want[0], have[1] - want[1], stageW, stageH);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    ptsU.uPx.value = (stageH / 2 / Math.tan((camera.fov * DEG) / 2)) * 0.026;
    hudW = 0;
    placeHint(sr, cr, blocks);
    requestRender();
  }

  // "pet me" hint beside the base: the first spot that stays on screen and clear of the page blocks
  function placeHint(sr, cr, blocks) {
    if (!hint) return;
    const hw = hint.offsetWidth || 90, hh = hint.offsetHeight || 30;
    const [lx, ly] = projectStage(-BASE_R * 1.02, 0.08, 0);
    const [rx, ry] = projectStage(BASE_R * 1.02, 0.08, 0);
    const spots = [
      [lx - hw - 10, ly - hh / 2], [rx + 10, ry - hh / 2],
      [lx - hw - 4, ly - hh * 2], [rx + 4, ry - hh * 2],
      [lx - hw, ly - hh * 3.6], [rx, ry - hh * 3.6],
    ];
    let pick = null;
    for (const [sx, sy] of spots) {
      const x = clamp(sr.left + sx, 8, vw - hw - 8), y = sr.top + sy;
      if (Math.abs(x - (sr.left + sx)) > hw * 0.25) continue;
      if (blocks.some((r) => x < r.right + 6 && r.left - 6 < x + hw && y < r.bottom + 6 && r.top - 6 < y + hh)) continue;
      pick = [x, y];
      break;
    }
    // no room beside the base (small screens): a label centered on the base's front rim
    if (!pick) {
      const [fx, fy] = projectStage(0, -0.16, BASE_R * 1.07);
      pick = [clamp(sr.left + fx - hw / 2, 8, vw - hw - 8), sr.top + fy - hh - 2];
    }
    hint.style.transform = `translate(${(pick[0] - cr.left).toFixed(1)}px, ${(pick[1] - cr.top).toFixed(1)}px)`;
  }

  /* -------------------------------------------------------------- state */
  const now0 = performance.now();
  const S = {
    time: 0, last: 0, running: false, rafId: 0, visible: true, ready: false,
    pointer: { x: 0, y: 0, active: false, at: 0 },
    yaw: -52 * DEG, idleIdx: 0, idleUntil: now0 + IDLE[0][1], idleTarget: -52 * DEG, spinning: null,
    dragging: false, dragX: 0, dragLast: 0, dragT: 0, dragVel: 0, releaseAt: 0, downAt: 0, downOnCat: false, moved: false,
    manualUntil: 0, manualTarget: null,
    headYaw: 0, headPitch: 0, hover: 0, hoverT: 0,
    blinkEnd: 0, nextBlink: now0 + rand(2500, 4500),
    ear: [0, 0], earT: [0, 0], nextEar: now0 + rand(2500, 6000),
    flick: 0, nextFlick: now0 + rand(5000, 9000),
    glitchEnd: 0, nextGlitch: now0 + rand(5000, 9000),
    pets: 0, lastPet: 0, purrUntil: 0, hopT: -1, moodTimer: 0,
    build: 0, buildStart: 0, scan: -1, nextScan: now0 + 1800,
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
    const [cx, cy] = worldToStage(headG, 0, 0.12, 0.2);
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
  function glitch(ms) {
    S.glitchEnd = performance.now() + ms;
    U.uGlitchSeed.value = Math.random() * 100;
    hud.classList.remove("is-glitch");
    void hud.offsetWidth;
    hud.classList.add("is-glitch");
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
    if (motionOK()) {
      glitch(160);
      if (S.pets === 3) S.spinning = { from: S.yaw, to: S.yaw + TAU, t0: now, dur: 1300 };
      else if (S.pets >= 4) S.hopT = 0;
      start();
    }
    requestRender();
  }

  /* -------------------------------------------------------------- input */
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  function hitTest(clientX, clientY) {
    const sr = stage.getBoundingClientRect();
    if (clientX < sr.left || clientX > sr.right || clientY < sr.top || clientY > sr.bottom) return false;
    ndc.set(((clientX - sr.left) / sr.width) * 2 - 1, -((clientY - sr.top) / sr.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    world.updateMatrixWorld(true);
    return ray.intersectObjects([catFront, body], false).length > 0;
  }
  function setCursor(mode) {
    root.classList.toggle("cat3d-grab", mode === "grab");
    root.classList.toggle("cat3d-grabbing", mode === "grabbing");
  }
  let moveQueued = false, lastMove = null;
  function onMove(e) {
    lastMove = e;
    S.pointer.x = e.clientX; S.pointer.y = e.clientY; S.pointer.active = true; S.pointer.at = performance.now();
    if (S.dragging && e.pointerType !== "touch") {
      const dx = e.clientX - S.dragLast;
      S.dragLast = e.clientX;
      if (Math.abs(e.clientX - S.dragX) > 6) S.moved = true;
      const t = performance.now(), step = Math.max(0.008, (t - S.dragT) / 1000);
      S.dragT = t;
      S.yaw += dx * 0.012;
      S.dragVel = clamp(lerp(S.dragVel, (dx * 0.012) / step, 0.5), -7, 7);   // radians per second
      if (!motionOK()) requestRender();
    } else if (Math.abs(e.clientX - S.dragX) > 8) {
      S.moved = true;
    }
    if (!moveQueued) {
      moveQueued = true;
      requestAnimationFrame(() => {
        moveQueued = false;
        if (!lastMove || S.dragging) return;
        const over = hitTest(lastMove.clientX, lastMove.clientY);
        S.hoverT = over ? 1 : 0;
        if (lastMove.pointerType !== "touch") setCursor(over ? "grab" : "");
      });
    }
    if (motionOK()) start();
  }
  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    S.downOnCat = hitTest(e.clientX, e.clientY);
    if (!S.downOnCat) return;
    S.downAt = performance.now();
    S.dragX = S.dragLast = e.clientX;
    S.dragT = S.downAt;
    S.dragVel = 0;
    S.moved = false;
    if (e.pointerType !== "touch") {
      S.dragging = true;
      S.spinning = null;
      setCursor("grabbing");
    }
  }
  function onUp(e) {
    const wasOnCat = S.downOnCat;
    S.downOnCat = false;
    if (S.dragging) {
      S.dragging = false;
      S.releaseAt = performance.now();
      if (S.releaseAt - S.dragT > 90) S.dragVel = 0;   // the pointer stopped before letting go
      S.manualUntil = S.releaseAt + 5000;   // he stays where he was left for a moment
      S.manualTarget = null;
      setCursor(hitTest(e.clientX, e.clientY) ? "grab" : "");
    }
    if (wasOnCat && !S.moved && performance.now() - S.downAt < 700) pet();
    if (motionOK()) start();
  }
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });
  window.addEventListener("pointercancel", () => { S.dragging = false; S.downOnCat = false; setCursor(""); }, { passive: true });
  document.addEventListener("pointerleave", () => { S.pointer.active = false; S.hoverT = 0; setCursor(""); });
  if (petBtn) {
    petBtn.setAttribute("aria-label", "Pet " + NAME + ", the hologram cat");
    petBtn.addEventListener("click", (e) => { e.preventDefault(); pet(); });
    petBtn.addEventListener("focus", () => { S.hoverT = 1; hud.classList.add("is-on"); requestRender(); });
    petBtn.addEventListener("blur", () => { S.hoverT = 0; requestRender(); });
    petBtn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const now = performance.now();
        const from = now < S.manualUntil && S.manualTarget !== null ? S.manualTarget : S.yaw;
        S.spinning = null;
        S.dragVel = 0;
        S.manualTarget = from + (e.key === "ArrowLeft" ? -0.5 : 0.5);
        S.manualUntil = now + 6000;
        if (motionOK()) start();
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
    const still = !motionOK();
    const purring = now < S.purrUntil;
    if (moving) S.time += dt;
    const t = S.time;
    U.uTime.value = t;
    U.uStatic.value = still ? 1 : 0;
    discU.uTime.value = beamU.uTime.value = ptsU.uTime.value = t;

    // materialize: the beam powers on, then the cat builds up from the base
    if (still) S.build = 1.06;
    else if (S.build < 1.06) {
      if (!S.buildStart) S.buildStart = now;
      const k = (now - S.buildStart - 350) / 1500;
      S.build = k <= 0 ? 0 : Math.min(1.06, k * 1.06);
    }
    U.uBuild.value = S.build;
    const on = still ? 1 : clamp((now - (S.buildStart || now)) / 350, 0, 1);
    beamU.uOn.value = discU.uOn.value = ptsU.uOn.value = on;

    // turntable: idle program, drag with inertia, turns by the visitor, celebratory spin
    if (still) S.spinning = null;
    if (!S.dragging) {
      if (S.spinning) {
        const k = clamp((now - S.spinning.t0) / S.spinning.dur, 0, 1);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        S.yaw = lerp(S.spinning.from, S.spinning.to, e);
        if (k >= 1) { S.yaw = wrapPi(S.yaw); S.spinning = null; S.idleUntil = now + 2500; }
      } else if (moving && now - S.releaseAt < 1200) {
        S.yaw += S.dragVel * dt; S.dragVel *= Math.exp(-5 * dt);
      } else if (moving) {
        const manual = now < S.manualUntil;
        if (!manual) S.manualTarget = null;
        if (!manual && now > S.idleUntil && now - S.releaseAt > 2600) {
          S.idleIdx = (S.idleIdx + 1) % IDLE.length;
          const step = IDLE[S.idleIdx];
          if (step[0] === "spin") {
            S.spinning = { from: S.yaw, to: S.yaw + TAU, t0: now, dur: 7000 };
            S.idleUntil = now + 7000;
          } else {
            S.idleTarget = step[0] * DEG;
            S.idleUntil = now + step[1] + 1200;
          }
        }
        if (manual) {
          // the visitor turned him: ease to the angle they asked for and hold it for a moment
          if (S.manualTarget !== null) S.yaw += wrapPi(S.manualTarget - S.yaw) * (1 - Math.exp(-7 * dt));
        } else {
          // a hovering visitor gets looked at
          const target = S.hover > 0.5 ? -24 * DEG : S.idleTarget;
          S.yaw += wrapPi(target - S.yaw) * (1 - Math.exp(-1.6 * dt));
        }
      } else if (still && S.manualTarget !== null) {
        S.yaw = S.manualTarget;
      }
    }
    spin.rotation.y = S.yaw;

    // head follows the pointer, otherwise looks around now and then
    S.hover = moving ? damp(S.hover, S.hoverT, 8, dt) : S.hoverT;
    U.uHover.value = S.hover;
    let hy = Math.sin(t * 0.31) * 0.12, hp = Math.sin(t * 0.23 + 1.3) * 0.05;
    if (S.pointer.active && now - S.pointer.at < 4000) {
      const sr = stage.getBoundingClientRect();
      const [ex, ey] = worldToStage(headG, 0, 0.05, 0.25);
      const dx = S.pointer.x - (sr.left + ex), dy = S.pointer.y - (sr.top + ey);
      const face = clamp(dx / 520, -1, 1) * 0.95;          // where on screen he wants to look
      hy = clamp(wrapPi(face - S.yaw), -0.62, 0.62);
      hp = clamp(dy / 420, -1, 1) * 0.22;
    }
    if (purring) { hy *= 0.4; hp = -0.08 + Math.sin(t * 2.4) * 0.04; }
    S.headYaw = moving ? damp(S.headYaw, hy, 4.5, dt) : (still ? 0 : hy);
    S.headPitch = moving ? damp(S.headPitch, hp, 4.5, dt) : (still ? 0 : hp);
    U.uHead.value.set(S.headYaw, S.headPitch);
    headG.rotation.set(S.headPitch, S.headYaw, 0, "YXZ");

    // blinks (eyes dim briefly), happy dim while purring
    if (moving && now > S.nextBlink) {
      S.blinkEnd = now + 140;
      S.nextBlink = now + (Math.random() < 0.2 ? 280 : rand(2600, 5600));
    }
    let eye = now < S.blinkEnd ? 0.05 : 1;
    if (purring) eye = 0.35;
    U.uEye.value = eye * (1 + S.hover * 0.35);
    headG.updateWorldMatrix(true, false);
    for (const sp of eyeGlows) {
      eyeN.copy(sp.userData.n).transformDirection(headG.matrixWorld);
      eyeV.copy(camera.position).sub(sp.getWorldPosition(eyeP)).normalize();
      sp.material.opacity = sp.userData.base * eye * sstep(-0.2, 0.35, eyeN.dot(eyeV)) * sstep(0.52, 0.6, S.build) * (1 + S.hover * 0.4);
    }

    // ear flicks
    if (moving && now > S.nextEar) {
      const which = Math.random() < 0.5 ? 0 : 1;
      S.earT[which] = (which ? -1 : 1) * rand(0.18, 0.3);
      setTimeout(() => { S.earT[which] = 0; }, rand(130, 240));
      S.nextEar = now + rand(3000, 7500);
    }
    for (let i = 0; i < 2; i++) S.ear[i] = moving ? damp(S.ear[i], S.earT[i] + (i ? -1 : 1) * S.hover * 0.08, 18, dt) : 0;
    U.uEarL.value.w = S.ear[0];
    U.uEarR.value.w = S.ear[1];

    // tail
    if (moving && now > S.nextFlick) { S.flick = 1; S.nextFlick = now + rand(5500, 11000); }
    S.flick = moving ? damp(S.flick, 0, 1.4, dt) : 0;
    U.uTailAmp.value = moving ? 0.026 + S.flick * 0.03 + S.hover * 0.01 : 0;
    U.uTailQuiver.value = moving && purring ? 0.006 : 0;
    U.uTailBias.value = moving ? Math.sin(t * 0.43) * 0.012 : 0;
    const sTip = clamp((LM.tail.tip[1] - 0.58) / 0.42, 0, 1);
    bladeG.position.x = LM.tail.tip[0] + (Math.sin(t * 1.6 - sTip * 3) * U.uTailAmp.value + Math.sin(t * 21 - sTip * 7) * U.uTailQuiver.value + U.uTailBias.value) * Math.pow(sTip, 1.3);

    // breathing and purr
    U.uBreath.value = moving ? Math.sin(t * TAU * (purring ? 0.6 : 0.22)) * (purring ? 0.014 : 0.01) : 0;
    if (moving && purring) U.uJitter.value.set(rand(-0.0016, 0.0016), rand(-0.0012, 0.0012));
    else U.uJitter.value.set(0, 0);
    const pulse = purring ? 0.5 + 0.5 * Math.sin(t * 9) : 0;
    U.uPulse.value = pulse * 0.6;
    discU.uPulse.value = pulse;

    // hologram life: scan sweeps, flicker, the odd glitch
    if (moving && now > S.nextScan) { S.scan = -0.1; S.nextScan = now + rand(3200, 5200); }
    if (moving && S.scan < 1.4) S.scan += dt * 0.7;
    U.uScan.value = moving ? S.scan : -1;
    if (moving && now > S.nextGlitch) { glitch(rand(90, 170)); S.nextGlitch = now + rand(6000, 12000); }
    U.uGlitch.value = moving && now < S.glitchEnd ? 1 : 0;
    U.uFlicker.value = moving ? 0.94 + 0.06 * Math.sin(t * 61) * Math.sin(t * 17.3) : 1;

    // accents pulse gently, the chest core beats with the purr
    for (const a of accents) {
      const k = a.kind === "core" ? 0.75 + 0.25 * Math.sin(t * (purring ? 9 : 2.2)) : 0.85 + 0.15 * Math.sin(t * 1.7 + a.base * 9);
      a.mesh.material.opacity = a.base * (moving ? k : 0.95) * sstep(a.y - 0.02, a.y + 0.06, S.build);
    }

    // happy hop
    let hop = 0;
    if (S.hopT >= 0 && moving) {
      S.hopT += dt;
      const h = S.hopT / 0.55;
      if (h < 1) hop = Math.sin(Math.PI * h) * 0.06; else S.hopT = -1;
    }
    lift.position.y = hop;

    placeHud();
  }

  function draw() {
    renderer.render(scene, camera);
    if (!S.ready) {
      S.ready = true;
      creature.classList.add("has-3d");
      mark("ready");
      layout();   // the hint is placed against its .has-3d position
    }
  }

  // HUD above the cat
  function placeHud() {
    if (!hudW) { hudW = hud.offsetWidth; hudH = hud.offsetHeight; }
    const cr = creature.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const ox = sr.left - cr.left, oy = sr.top - cr.top;
    const [hx, hy] = worldToStage(world, 0, 1.17, 0);
    let x = ox + hx - hudW * 0.5, y = oy + hy - hudH;
    const minX = -cr.left + 8, maxX = vw - cr.left - hudW - 8;
    x = clamp(x, minX, maxX);
    hud.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    tag.style.setProperty("--lead", clamp(ox + hx - x, 10, hudW - 40).toFixed(0) + "px");
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
  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(() => layout());
    for (const el of [creature, hint, ...avoid]) if (el) ro.observe(el);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layout());
  window.addEventListener("resize", layout, { passive: true });

  layout();
  hud.classList.add("is-on");
  update(0, performance.now());
  draw();
  start();

  // small hooks for automated checks and preview recordings
  creature.cat3d = {
    pet, sound: purrSound, state: S,
    setYaw: (deg) => { S.spinning = null; S.yaw = deg * DEG; S.idleTarget = deg * DEG; S.idleUntil = performance.now() + 60000; S.releaseAt = performance.now(); requestRender(); },
    finishBuild: () => { S.buildStart = performance.now() - 5000; requestRender(); },
  };
}
