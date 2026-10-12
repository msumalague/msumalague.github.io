/*!
 * NeonCity: a procedural, animated cyberpunk skyline.
 * Chongqing's layered hillside towers, monorail, bridges and riverside Hongyadong,
 * dressed in Japanese neon. Classic script, no dependencies.
 *
 *   var city = NeonCity.mount(el, { mode: "hero" | "band", seed: 7, motion: true });
 *   city.setMotion(false);    // one complete static frame, no animation loop
 *   city.setPointer(nx, ny);  // -1..1, subtle parallax (ignored while motion is off)
 *   city.resize();            // force a re-layout (a ResizeObserver already handles this)
 *   city.destroy();
 *
 * Rendering model: the sky, far, mid and near layers are painted once per size into canvases that
 * never repaint. Only two overlay canvases are redrawn per frame ("dyn" sits between the mid and
 * near layers, "fx" sits on top). Mist banks and searchlights are pre-rendered canvases moved by
 * CSS animations on the compositor. Parallax moves whole layers with the CSS `translate` property.
 */
(function () {
  "use strict";
  if (window.NeonCity) return;

  /* ------------------------------------------------------------------ palette, words, fonts */

  var PAL = { violet: "#b794ff", pink: "#ff4fd8", cyan: "#36e2ff", amber: "#ffb547", red: "#ff4d5e", lime: "#9dff7a" };
  var NEON = [PAL.violet, PAL.pink, PAL.cyan, PAL.violet, PAL.pink, PAL.cyan, PAL.amber, PAL.red, PAL.lime];
  var FONT_SIGN = '"Dela Gothic One","Yu Gothic","Hiragino Sans","Noto Sans JP","Meiryo",sans-serif';
  var FONT_DOT = '"DotGothic16","Yu Gothic","Hiragino Sans","Noto Sans JP","Meiryo",sans-serif';

  // Every Japanese string drawn on the signs (see the integration notes for meanings).
  var WORDS = {
    ml: "機械学習", ai: "人工知能", neko: "猫カフェ", izakaya: "居酒屋", hotpot: "重慶火鍋",
    ramen: "ラーメン", kissa: "喫茶", karaoke: "カラオケ", hotel: "ホテル", mirai: "未来", dennou: "電脳",
    chongqing: "重慶", tokyo: "東京", open: "営業中", sushi: "寿司", gyoza: "餃子",
    tabi: "旅", yume: "夢", sake: "酒"
  };
  var TICKER = "ようこそ重慶へ　◆　次は東京　◆　機械学習　◆　人工知能　◆　未来へようこそ　◆　";
  var POOL_V = [WORDS.ramen, WORDS.kissa, WORDS.karaoke, WORDS.hotel, WORDS.mirai, WORDS.dennou, WORDS.chongqing, WORDS.tokyo, WORDS.open, WORDS.sushi, WORDS.gyoza];
  var POOL_BAND = POOL_V.concat([WORDS.izakaya, WORDS.neko, WORDS.ml, WORDS.ai]);
  var POOL_1 = [WORDS.tabi, WORDS.yume, WORDS.sake];
  var SMALL_KANA = "ァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎ";
  var WORD_GAP = 600; // the same word never appears twice within this many CSS px

  var GLYPHS = (function () {
    var all = TICKER, seen = {}, out = "";
    for (var k in WORDS) all += WORDS[k];
    for (var i = 0; i < all.length; i++) { var ch = all.charAt(i); if (!seen[ch] && ch !== "　") { seen[ch] = 1; out += ch; } }
    return out;
  })();

  var fontWait = null;
  function fontsAvailable() {
    try {
      if (!document.fonts || !document.fonts.check) return true;
      return document.fonts.check('40px "Dela Gothic One"', GLYPHS) && document.fonts.check('20px "DotGothic16"', GLYPHS);
    } catch (e) { return true; }
  }
  // Resolves when the sign fonts are loaded for our exact glyphs, or after a timeout (fallback fonts).
  function waitFonts() {
    if (fontWait) return fontWait;
    if (!document.fonts || !document.fonts.load || fontsAvailable()) { fontWait = Promise.resolve(); return fontWait; }
    var loads = Promise.all([
      document.fonts.load('40px "Dela Gothic One"', GLYPHS),
      document.fonts.load('20px "DotGothic16"', GLYPHS)
    ]).catch(function () {});
    var timeout = new Promise(function (r) { setTimeout(r, 2600); });
    fontWait = Promise.race([loads, timeout]);
    return fontWait;
  }

  /* ------------------------------------------------------------------ utilities */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return s - Math.floor(s); }
  function noise1(x, seed) {
    var i = Math.floor(x), f = x - i;
    f = f * f * (3 - 2 * f);
    return lerp(hash(i + seed * 57.31), hash(i + 1 + seed * 57.31), f);
  }
  function makeRng(seed) {
    var a = (seed >>> 0) || 1;
    function next() {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next: next,
      range: function (lo, hi) { return lo + (hi - lo) * next(); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      chance: function (p) { return next() < p; }
    };
  }
  var rgbCache = {};
  function hexRgb(h) {
    var c = rgbCache[h];
    if (c) return c;
    var n = parseInt(h.charAt(0) === "#" ? h.slice(1) : h, 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache[h] = c;
    return c;
  }
  function rgba(h, a) { var c = hexRgb(h); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + Math.round(clamp(a, 0, 1) * 1000) / 1000 + ")"; }
  function mix(h1, h2, t) {
    var a = hexRgb(h1), b = hexRgb(h2), o = "#";
    for (var i = 0; i < 3; i++) { var v = Math.round(a[i] + (b[i] - a[i]) * t); o += (v < 16 ? "0" : "") + v.toString(16); }
    return o;
  }
  function rrect(x, px, py, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }
  function newCanvas(w, h) {
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  // A sprite is a small pre-rendered canvas plus its size in CSS px. draw(ctx, w, h, k) where k = px per CSS px.
  function makeSprite(w, h, dpr, draw) {
    w = Math.max(1, w); h = Math.max(1, h);
    var c = newCanvas(w * dpr, h * dpr), x = c.getContext("2d"), kx = c.width / w;
    x.setTransform(kx, 0, 0, c.height / h, 0, 0);
    draw(x, w, h, kx);
    return { c: c, w: w, h: h, k: kx };
  }
  var mctx = null;
  function measureText(font, text) {
    if (!mctx) mctx = newCanvas(4, 4).getContext("2d");
    mctx.font = font;
    return mctx.measureText(text);
  }
  function ellipseGlow(x, cx, cy, rx, ry, color, a) {
    if (rx <= 0 || ry <= 0) return;
    x.save();
    x.translate(cx, cy);
    x.scale(1, ry / rx);
    var g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(0.45, rgba(color, a * 0.42));
    g.addColorStop(1, rgba(color, 0));
    x.fillStyle = g;
    x.fillRect(-rx, -rx, rx * 2, rx * 2);
    x.restore();
  }
  function vband(x, x0, w, y0, y1, color, a0, a1) {
    if (y1 <= y0) return;
    var g = x.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, rgba(color, a0));
    g.addColorStop(1, rgba(color, a1));
    x.fillStyle = g;
    x.fillRect(x0, y0, w, y1 - y0);
  }
  // Glow without shadowBlur: faint wide passes under a bright core. Cheap on CPU and GPU canvas alike.
  function glowStroke(x, path, color, w, core) {
    x.strokeStyle = color;
    x.globalAlpha = 0.09; x.lineWidth = w * 5.5; if (path) x.stroke(path); else x.stroke();
    x.globalAlpha = 0.22; x.lineWidth = w * 2.6; if (path) x.stroke(path); else x.stroke();
    x.globalAlpha = 1; x.lineWidth = w; if (path) x.stroke(path); else x.stroke();
    if (core) { x.strokeStyle = core; x.lineWidth = w * 0.45; if (path) x.stroke(path); else x.stroke(); }
  }
  function glowRect(x, rx, ry, rw, rh, color, spread, a) {
    x.fillStyle = color;
    x.globalAlpha = 0.1 * a; x.fillRect(rx - spread, ry - spread, rw + spread * 2, rh + spread * 2);
    x.globalAlpha = 0.24 * a; x.fillRect(rx - spread * 0.45, ry - spread * 0.45, rw + spread * 0.9, rh + spread * 0.9);
    x.globalAlpha = a; x.fillRect(rx, ry, rw, rh);
    x.globalAlpha = 1;
  }
  // Bloom: downsample the source by halves and add the blurry levels back on top.
  function bloom(dst, srcCanvas, W, H, strength) {
    var prev = srcCanvas, w = prev.width, h = prev.height, levels = [];
    for (var i = 0; i < 4; i++) {
      w = Math.max(1, Math.round(w / 2)); h = Math.max(1, Math.round(h / 2));
      var c = newCanvas(w, h), cx = c.getContext("2d");
      cx.drawImage(prev, 0, 0, w, h);
      levels.push(c);
      prev = c;
    }
    bloomLevels(dst, levels, W, H, strength);
    return levels;
  }
  function bloomLevels(dst, levels, W, H, strength) {
    dst.save();
    dst.globalCompositeOperation = "lighter";
    dst.globalAlpha = strength * 0.7; dst.drawImage(levels[3], 0, 0, W, H);
    dst.globalAlpha = strength * 0.85; dst.drawImage(levels[2], 0, 0, W, H);
    dst.globalAlpha = strength * 0.7; dst.drawImage(levels[1], 0, 0, W, H);
    dst.globalAlpha = strength * 0.45; dst.drawImage(levels[0], 0, 0, W, H);
    dst.restore();
  }

  function hits(r, list) {
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y) return true;
    }
    return false;
  }
  function overlapArea(r, list) {
    var a = 0;
    for (var i = 0; i < list.length; i++) {
      var o = list[i], w = Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x), h = Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y);
      if (w > 0 && h > 0) a += w * h;
    }
    return a;
  }
  function grow(r, p) { return { x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p }; }
  function union(list) {
    if (!list.length) return null;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /* ------------------------------------------------------------------ avoid zones (page content over the city) */

  // Layout position of an element's border box in document space, ignoring CSS transforms (intro
  // animations, parallax translate), so the measured layout is stable and deterministic.
  function layoutPos(e) {
    var x = 0, y = 0, n = e;
    while (n) {
      x += n.offsetLeft || 0; y += n.offsetTop || 0;
      n = n.offsetParent;
      if (n) { x += n.clientLeft || 0; y += n.clientTop || 0; }
    }
    return [x, y];
  }
  function htmlOwner(n) {
    while (n && (n.nodeType !== 1 || !("offsetLeft" in n))) n = n.parentNode;
    return n;
  }
  // Rect of a viewport-space client rect, relative to the city root, with the owner's transform offset removed.
  function relRect(cr, owner, base) {
    var o = owner ? owner.getBoundingClientRect() : null, l = owner ? layoutPos(owner) : null;
    var dx = o ? l[0] - o.left : 0, dy = o ? l[1] - o.top : 0;
    if (owner && !owner.offsetParent) { dx = base.sx; dy = base.sy; }
    return { x: cr.left + dx - base.x, y: cr.top + dy - base.y, w: cr.right - cr.left, h: cr.bottom - cr.top };
  }
  // Opacity is ignored on purpose: intro animations start content at opacity 0, and it is about to appear.
  function visibleStyle(cs) { return cs.display !== "none" && cs.visibility !== "hidden"; }
  function paints(cs) {
    // Gradient text (background-clip: text) paints only its glyphs: measure it as text.
    if (cs.backgroundClip === "text" || cs.webkitBackgroundClip === "text") return false;
    if (cs.backgroundImage && cs.backgroundImage !== "none") return true;
    if (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0) return true;
    var m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor || "");
    if (m) { var p = m[1].split(","); return p.length < 4 || parseFloat(p[3]) > 0.04; }
    return false;
  }
  var BOXY = /^(IMG|SVG|CANVAS|VIDEO|PICTURE|BUTTON|INPUT|SELECT|TEXTAREA|IFRAME)$/i;
  // Tight content rects: text line boxes plus boxes that visibly paint (buttons, icons, framed panels).
  function tightRects(el, base, out) {
    var stack = [el];
    while (stack.length) {
      var e = stack.pop(), cs = getComputedStyle(e);
      if (!visibleStyle(cs)) continue;
      // Screen-reader-only text (clipped to a pixel) takes no visible space.
      if (e !== el && e.offsetWidth <= 2 && e.offsetHeight <= 2 && cs.overflow === "hidden") continue;
      if (e !== el && (BOXY.test(e.tagName) || paints(cs))) {
        var r = e.getBoundingClientRect();
        if (r.width > 1 && r.height > 1) out.push(relRect(r, htmlOwner(e), base));
        continue;
      }
      for (var c = e.lastChild; c; c = c.previousSibling) {
        if (c.nodeType === 1) stack.push(c);
        else if (c.nodeType === 3 && /\S/.test(c.nodeValue)) {
          var rg = document.createRange();
          rg.selectNodeContents(c);
          var rs = rg.getClientRects(), ow = htmlOwner(e);
          for (var i = 0; i < rs.length; i++) if (rs[i].width > 0.5 && rs[i].height > 0.5) out.push(relRect(rs[i], ow, base));
        }
      }
    }
    return out;
  }
  // Merge rects that overlap or nearly touch, so the keep-out list stays short.
  function mergeRects(list, gap) {
    var out = list.slice(), changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < out.length && !changed; i++) {
        for (var j = i + 1; j < out.length; j++) {
          var a = out[i], b = out[j];
          if (a.x - gap < b.x + b.w && a.x + a.w + gap > b.x && a.y - gap < b.y + b.h && a.y + a.h + gap > b.y) {
            out[i] = union([a, b]); out.splice(j, 1); changed = true; break;
          }
        }
      }
    }
    return out;
  }
  function roleOf(item, el) {
    if (item && item.role) return String(item.role);
    if (el) {
      var d = el.getAttribute && el.getAttribute("data-city-avoid");
      if (d) return d;
      var c = " " + (typeof el.className === "string" ? el.className : (el.getAttribute && el.getAttribute("class")) || "") + " ";
      if (/copy|headline|intro/i.test(c)) return "copy";
      if (/portrait|avatar|photo/i.test(c)) return "portrait";
      if (/creature|\bcat\b|cat3d|mascot/i.test(c) || (el.hasAttribute && el.hasAttribute("data-creature"))) return "cat";
      if (/meta/i.test(c)) return "meta";
    }
    return "box";
  }
  // Resolve opts.avoid (Elements, viewport DOMRects, {el|rect, role}, or a function returning any of those)
  // into rects relative to the city root, grouped by role.
  function measureAvoid(avoid, root) {
    var list = typeof avoid === "function" ? avoid() : avoid;
    if (!list) return null;
    if (!(list instanceof Array)) list = [list];
    var rb = root.getBoundingClientRect(), lp = layoutPos(root);
    var base = { x: lp[0], y: lp[1], sx: lp[0] - rb.left, sy: lp[1] - rb.top };
    var Z = { copy: [], portrait: [], cat: [], meta: [], box: [] };
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (!it) continue;
      var el = it.nodeType === 1 ? it : (it.el && it.el.nodeType === 1 ? it.el : null);
      var role = roleOf(it.nodeType === 1 ? null : it, el), out = Z[role] || (Z[role] = []), rs = [];
      if (el) {
        if (!el.isConnected || !visibleStyle(getComputedStyle(el))) continue;
        if (role === "cat" || it.tight === false) {
          var p = layoutPos(el), ow = el.offsetWidth, oh = el.offsetHeight;
          // The cat's head and ears rise a little above its layout anchor.
          if (role === "cat") rs.push({ x: p[0] - base.x - ow * 0.05, y: p[1] - base.y - oh * 0.12, w: ow * 1.1, h: oh * 1.12 });
          else rs.push({ x: p[0] - base.x, y: p[1] - base.y, w: ow, h: oh });
        } else tightRects(el, base, rs);
      } else {
        var r = it.rect || it;
        if (r && r.width != null) rs.push({ x: (r.left != null ? r.left : r.x) - rb.left, y: (r.top != null ? r.top : r.y) - rb.top, w: r.width, h: r.height });
      }
      for (var k = 0; k < rs.length; k++) if (rs[k].w > 0 && rs[k].h > 0) out.push(rs[k]);
    }
    // Copy keeps one rect per text line (a short last line leaves room beside it), other roles merge loosely.
    for (var key in Z) Z[key] = mergeRects(Z[key], key === "copy" ? -0.5 : 14);
    return Z;
  }
  // Default avoid list for the hero: the content of the section that hosts the city. Elements marked
  // [data-city-avoid="copy|portrait|cat|meta"] win; otherwise the site's hero parts are used.
  function autoAvoid(container) {
    var host = container.closest ? container.closest("section, header, [data-city-host]") : null;
    if (!host) return null;
    return function () {
      var list = host.querySelectorAll("[data-city-avoid]");
      if (!list.length) list = host.querySelectorAll(".hero__copy, .hero__portrait, .hero__meta, .creature");
      return Array.prototype.slice.call(list);
    };
  }
  function zonesEmpty(Z) { if (!Z) return true; for (var k in Z) if (Z[k].length) return false; return true; }
  function zonesSig(Z) {
    if (!Z) return "-";
    var s = "";
    for (var k in Z) { s += k + ":"; for (var i = 0; i < Z[k].length; i++) { var r = Z[k][i]; s += Math.round(r.x / 6) + "," + Math.round(r.y / 6) + "," + Math.round(r.w / 6) + "," + Math.round(r.h / 6) + ";"; } }
    return s;
  }
  // Without opts.avoid, assume the site's hero layout: copy and portrait in a centred 76rem container.
  function fallbackAvoid(W, H, compact) {
    if (compact) {
      var g0 = 16;
      return { copy: [{ x: g0, y: H * 0.2, w: W - 2 * g0, h: H * 0.44 }], portrait: [{ x: g0, y: 92, w: Math.min(W - 2 * g0, 290), h: 120 }], cat: [{ x: W * 0.1, y: H * 0.71, w: W * 0.8, h: H * 0.28 }], meta: [], box: [] };
    }
    var gut = clamp(W * 0.04, 16, 48), cw = Math.min(W - 2 * gut, 1216), x0 = (W - cw) / 2, col1 = (cw - 32) * 0.6, col2 = x0 + col1 + 32, c2w = (cw - 32) * 0.4;
    var top = Math.max(90, H * 0.14), hud = clamp(Math.min(W * 0.22, H * 0.34), 152, 304), fw = Math.max(hud, 320);
    var tw = Math.min(col1, 640) * 0.94;
    return {
      copy: [{ x: x0, y: top, w: tw, h: H * 0.5 }, { x: x0, y: top + H * 0.5, w: Math.min(tw, 360), h: H * 0.14 }],
      portrait: [{ x: col2 + c2w / 2 - fw / 2, y: top, w: fw, h: hud + 40 }],
      cat: [{ x: W * 0.64, y: H * 0.42, w: W * 0.3, h: H * 0.5 }],
      meta: [{ x: x0, y: H - 104, w: cw * 0.55, h: 74 }], box: []
    };
  }

  // Words: a shuffled rotation that always prefers the least used word (unused ones first), and never the same
  // word twice within WORD_GAP px.
  function wordBag(S, pool, rng) {
    var key = pool.join("|"), bag = S.bags[key];
    if (!bag) {
      var order = pool.slice();
      for (var i = order.length - 1; i > 0; i--) { var j = (rng.next() * (i + 1)) | 0, t = order[i]; order[i] = order[j]; order[j] = t; }
      bag = S.bags[key] = { order: order, i: 0 };
    }
    return {
      take: function (x) {
        var n = bag.order.length, best = -1, bc = 1e9;
        for (var k = 0; k < n; k++) {
          var idx = (bag.i + k) % n, w = bag.order[idx], c = S.used[w] ? S.used[w].length : 0;
          if (c < bc && wordFree(S, w, x)) { best = idx; bc = c; if (!c) break; }
        }
        if (best < 0) return null;
        bag.i = (best + 1) % n;
        return bag.order[best];
      }
    };
  }
  function wordFree(S, w, x) {
    var u = S.used[w];
    if (!u) return true;
    for (var i = 0; i < u.length; i++) if (Math.abs(u[i] - x) < WORD_GAP) return false;
    return true;
  }
  function useWord(S, w, x) { (S.used[w] || (S.used[w] = [])).push(x); }

  /* ------------------------------------------------------------------ sprites */

  function glowSprite(color, r, dpr, core) {
    return makeSprite(r * 2, r * 2, dpr, function (x) {
      var g = x.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, core ? "rgba(255,255,255," + core + ")" : rgba(color, 1));
      g.addColorStop(0.14, rgba(color, 0.95));
      g.addColorStop(0.4, rgba(color, 0.3));
      g.addColorStop(1, rgba(color, 0));
      x.fillStyle = g;
      x.fillRect(0, 0, r * 2, r * 2);
    });
  }

  function signDims(spec) {
    if (spec.size < 11) spec.size = 11;
    var n = spec.text.length, s = spec.size, iw, ih;
    if (spec.vertical && n > 1) { iw = s * 1.46; ih = n * s * 1.1 + s * 0.5; }
    else if (n === 1) { iw = ih = s * 1.5; }
    else { iw = n * s + s * 0.95; ih = s * 1.5; }
    return { iw: iw, ih: ih, pad: Math.ceil(s * 0.85) };
  }

  // Neon sign: dark plate, glowing tube frame, glowing glyphs with a pale core. "off" is the unlit tube.
  // The glow is two shadowed blits of one colour layer (frame plus glyphs), not one shadow per glyph.
  function signSprites(spec, dpr, needOff) {
    var chars = spec.text.split(""), n = chars.length, s = spec.size, col = spec.color;
    var vertical = !!spec.vertical && n > 1, small = s < 17;
    // Lightboxes (dark glyphs on a bright plate) use the pixel face: its thin strokes stay legible where a heavy face merges.
    var fam = spec.font || (small || spec.box ? FONT_DOT : FONT_SIGN), font = s + "px " + fam;
    var d = signDims(spec), pad = d.pad, iw = d.iw, ih = d.ih, cell = s * 1.1;
    var W = iw + pad * 2, H = ih + pad * 2, cells = [];
    var full = measureText(font, spec.text);
    // Never squeeze kanji below 0.92: a slightly wider glyph run beats merged strokes.
    var hScale = (!vertical && n > 1 && full.width > iw - s * 0.55) ? Math.max(0.92, (iw - s * 0.55) / full.width) : 1;
    var r = Math.max(1, s * 0.16), lw = Math.max(1, s * 0.07), plate = spec.plate !== false;
    function glyphs(x, fill) {
      x.font = font;
      x.textAlign = "center";
      x.textBaseline = "alphabetic";
      x.fillStyle = fill;
      for (var i = 0; i < (vertical ? n : 1); i++) {
        var ch = vertical ? chars[i] : spec.text, mt = measureText(font, ch);
        var asc = mt.actualBoundingBoxAscent, desc = mt.actualBoundingBoxDescent;
        if (!(asc >= 0)) { asc = s * 0.8; desc = s * 0.1; }
        x.save();
        if (vertical) x.translate(pad + iw / 2, pad + s * 0.25 + cell * (i + 0.5));
        else x.translate(pad + iw / 2, pad + ih / 2);
        if (vertical && ch === "ー") x.rotate(Math.PI / 2);
        if (vertical && SMALL_KANA.indexOf(ch) >= 0) x.translate(s * 0.1, -s * 0.12);
        if (!vertical && hScale !== 1) x.scale(hScale, 1);
        x.fillText(ch, 0, (asc - desc) / 2);
        x.restore();
      }
    }
    function frame(x) { rrect(x, pad + lw * 1.5, pad + lw * 1.5, iw - lw * 3, ih - lw * 3, r * 0.6); }
    function base(x, on) {
      if (!plate) return;
      rrect(x, pad, pad, iw, ih, r);
      var pg = x.createLinearGradient(0, pad, 0, pad + ih);
      pg.addColorStop(0, mix(col, "#05020b", on ? 0.8 : 0.9));
      pg.addColorStop(1, mix(col, "#05020b", on ? 0.9 : 0.94));
      x.fillStyle = pg;
      x.fill();
    }
    var onS = spec.box ? null : makeSprite(W, H, dpr, function (x, w, h, k) {
      var src = makeSprite(W, H, dpr, function (g) {
        if (plate) { g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = "round"; frame(g); g.stroke(); }
        glyphs(g, col);
      });
      var lv = bloom(x, src.c, W, H, 1);
      base(x, true);
      bloomLevels(x, lv, W, H, plate ? 0.42 : 0.8);
      x.drawImage(src.c, 0, 0, W, H);
      if (plate) { x.strokeStyle = mix(col, "#ffffff", 0.55); x.lineWidth = lw * 0.45; frame(x); x.stroke(); }
      glyphs(x, mix(col, "#ffffff", small ? 0.4 : 0.6));
    });
    var offS = needOff && !spec.box ? makeSprite(W, H, dpr, function (x) {
      base(x, false);
      if (plate) { x.strokeStyle = mix(col, "#0a0612", 0.7); x.lineWidth = lw; x.lineJoin = "round"; frame(x); x.stroke(); }
      glyphs(x, mix(col, "#150c22", 0.68));
    }) : null;
    if (spec.box) {
      onS = makeSprite(W, H, dpr, function (x) {
        var src = makeSprite(W, H, dpr, function (g) { rrect(g, pad, pad, iw, ih, r); g.fillStyle = col; g.fill(); });
        bloom(x, src.c, W, H, 0.85);
        rrect(x, pad, pad, iw, ih, r);
        var pg = x.createLinearGradient(0, pad, 0, pad + ih);
        pg.addColorStop(0, mix(col, "#ffffff", 0.62)); pg.addColorStop(0.55, mix(col, "#ffffff", 0.3)); pg.addColorStop(1, mix(col, "#ffffff", 0.08));
        x.fillStyle = pg;
        x.fill();
        x.strokeStyle = mix(col, "#ffffff", 0.8); x.lineWidth = Math.max(0.8, lw * 0.6); frame(x); x.stroke();
        glyphs(x, mix(col, "#0b0420", 0.88));
      });
      offS = needOff ? makeSprite(W, H, dpr, function (x) {
        rrect(x, pad, pad, iw, ih, r);
        x.fillStyle = mix(col, "#05020b", 0.74);
        x.fill();
        glyphs(x, mix(col, "#05020b", 0.9));
      }) : null;
    }
    if (vertical) for (var i = 0; i < n; i++) cells.push({ y: pad + s * 0.25 + cell * i, h: cell });
    return { on: onS, off: offS, cells: vertical ? cells : null };
  }

  // Red paper lantern hanging from its cord. The sprite's top centre is the pivot.
  function lanternSprite(size, dpr) {
    var lw = size, lh = size * 1.28, cordL = size * 0.45, glowR = size * 2.4;
    var W = glowR * 2, H = cordL + lh / 2 + glowR;
    return makeSprite(W, H, dpr, function (x) {
      var cx = W / 2, cy = cordL + lh / 2;
      var g = x.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      g.addColorStop(0, "rgba(255,96,80,0.5)");
      g.addColorStop(0.35, "rgba(255,70,72,0.16)");
      g.addColorStop(1, "rgba(255,60,70,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
      x.strokeStyle = "rgba(30,14,14,0.9)";
      x.lineWidth = Math.max(0.5, size * 0.08);
      x.beginPath(); x.moveTo(cx, 0); x.lineTo(cx, cordL); x.stroke();
      var bg = x.createRadialGradient(cx - lw * 0.12, cy - lh * 0.1, 0, cx, cy, lw * 0.72);
      bg.addColorStop(0, "#fff1c4");
      bg.addColorStop(0.32, "#ff8f5c");
      bg.addColorStop(0.75, "#ff3c50");
      bg.addColorStop(1, "#9c1030");
      x.fillStyle = bg;
      x.beginPath(); x.ellipse(cx, cy, lw / 2, lh / 2, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = "rgba(120,12,30,0.45)";
      x.lineWidth = Math.max(0.4, size * 0.05);
      for (var i = 1; i < 4; i++) {
        var yy = cy - lh / 2 + (lh * i) / 4, half = (lw / 2) * Math.sqrt(1 - Math.pow((yy - cy) / (lh / 2), 2));
        x.beginPath(); x.moveTo(cx - half, yy); x.lineTo(cx + half, yy); x.stroke();
      }
      x.fillStyle = "#1c0b0b";
      x.fillRect(cx - lw * 0.28, cy - lh / 2 - size * 0.06, lw * 0.56, size * 0.13);
      x.fillRect(cx - lw * 0.28, cy + lh / 2 - size * 0.07, lw * 0.56, size * 0.13);
      x.strokeStyle = "rgba(255,190,90,0.8)";
      x.beginPath(); x.moveTo(cx, cy + lh / 2); x.lineTo(cx, cy + lh / 2 + size * 0.42); x.stroke();
    });
  }

  function trainSprite(o, dpr, dir) {
    var u = o.u, L = o.L, H = o.h, padX = 3 * u, padY = 5 * u;
    return makeSprite(L + padX * 2, H + padY * 2, dpr, function (x, w, h, k) {
      if (dir < 0) { x.translate(w, 0); x.scale(-1, 1); }
      var y0 = padY;
      for (var i = 0; i < o.cars; i++) {
        var cx0 = padX + i * (o.carL + o.gap), head = i === o.cars - 1, tail = i === 0;
        var rl = tail ? H * 0.55 : H * 0.18, rr = head ? H * 0.62 : H * 0.18;
        x.beginPath();
        x.moveTo(cx0 + rl, y0);
        x.lineTo(cx0 + o.carL - rr, y0);
        x.quadraticCurveTo(cx0 + o.carL, y0, cx0 + o.carL, y0 + rr);
        x.lineTo(cx0 + o.carL, y0 + H);
        x.lineTo(cx0, y0 + H);
        x.lineTo(cx0, y0 + rl);
        x.quadraticCurveTo(cx0, y0, cx0 + rl, y0);
        x.closePath();
        var g = x.createLinearGradient(0, y0, 0, y0 + H);
        g.addColorStop(0, "#5a4c8c"); g.addColorStop(0.18, "#3b2f66"); g.addColorStop(0.6, "#251c45"); g.addColorStop(1, "#130e26");
        x.fillStyle = g;
        x.fill();
        var ww = 4.2 * u, step = 6 * u, wy = y0 + H * 0.2, wh = H * 0.32;
        for (var wx = cx0 + (tail ? rl : 3.5 * u); wx < cx0 + o.carL - (head ? rr + 1.5 * u : 4.5 * u); wx += step) glowRect(x, wx, wy, ww, wh, "#fff1d6", 1.6 * u, 1);
        glowRect(x, cx0 + 1.5 * u, y0 + H * 0.64, o.carL - 3 * u, Math.max(1, 0.9 * u), PAL.pink, 1.4 * u, 1);
        x.fillStyle = "#0d0919";
        x.fillRect(cx0 + 2.5 * u, y0 + H * 0.8, o.carL - 5 * u, H * 0.2 + 1);
      }
      ellipseGlow(x, padX + L - 1.6 * u, y0 + H * 0.55, 3.5 * u, 3.5 * u, "#e6f6ff", 0.9);
      ellipseGlow(x, padX + 1.4 * u, y0 + H * 0.55, 3 * u, 3 * u, "#ff3a4a", 0.9);
    });
  }

  function coneSprite(len, hgt, dpr, dir) {
    return makeSprite(len, hgt, dpr, function (x, w, h) {
      if (dir < 0) { x.translate(w, 0); x.scale(-1, 1); }
      var g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, "rgba(220,240,255,0.42)");
      g.addColorStop(1, "rgba(220,240,255,0)");
      x.fillStyle = g;
      x.beginPath(); x.moveTo(0, h / 2 - 1); x.lineTo(w, 0); x.lineTo(w, h); x.lineTo(0, h / 2 + 1); x.closePath(); x.fill();
    });
  }

  function trailSprite(color, dpr, dir) {
    return makeSprite(96, 8, dpr, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, w, 0);
      if (dir > 0) { g.addColorStop(0, rgba(color, 0)); g.addColorStop(0.75, rgba(color, 0.5)); g.addColorStop(1, rgba(color, 0.95)); }
      else { g.addColorStop(0, rgba(color, 0.95)); g.addColorStop(0.25, rgba(color, 0.5)); g.addColorStop(1, rgba(color, 0)); }
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = "destination-in";
      var v = x.createLinearGradient(0, 0, 0, h);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(0.5, "rgba(0,0,0,1)"); v.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = v;
      x.fillRect(0, 0, w, h);
    });
  }

  function carSprite(color, size, dpr, dir) {
    var L = 11 * size, Hc = 3.4 * size, pad = 3.5 * size;
    return makeSprite(L + pad * 2, Hc + pad * 2, dpr, function (x, w, h, k) {
      if (dir < 0) { x.translate(w, 0); x.scale(-1, 1); }
      var y0 = pad, x0 = pad;
      ellipseGlow(x, x0 + L / 2, y0 + Hc * 0.85, L * 0.55, Hc * 0.55, color, 0.6);
      x.fillStyle = rgba(color, 0.9);
      x.fillRect(x0 + L * 0.15, y0 + Hc * 0.82, L * 0.7, Math.max(0.6, size * 0.5));
      rrect(x, x0, y0 + Hc * 0.2, L, Hc * 0.75, Hc * 0.35);
      var g = x.createLinearGradient(0, y0, 0, y0 + Hc);
      g.addColorStop(0, "#4a3d74"); g.addColorStop(1, "#140f26");
      x.fillStyle = g; x.fill();
      rrect(x, x0 + L * 0.42, y0, L * 0.36, Hc * 0.5, Hc * 0.25);
      x.fillStyle = "#7fe9ff"; x.globalAlpha = 0.8; x.fill(); x.globalAlpha = 1;
      glowRect(x, x0 + L - size * 0.9, y0 + Hc * 0.45, size * 0.9, size * 0.7, "#ffffff", size * 1.2, 1);
      glowRect(x, x0, y0 + Hc * 0.45, size * 0.8, size * 0.7, "#ff3048", size, 1);
    });
  }

  /* ------------------------------------------------------------------ tiers */

  var TIER = [
    { cTop: "#2f1f5e", cBot: "#5a2e84", winA: 0.45, ww: 1.1, wh: 1.4, px: 2.9, py: 3.3, mg: 1.8, rim: 0, litMul: 0.8 },
    { cTop: "#25184f", cBot: "#45236e", winA: 0.58, ww: 1.3, wh: 1.7, px: 3.2, py: 3.9, mg: 2.2, rim: 0.2, litMul: 0.85 },
    { cTop: "#1c1244", cBot: "#2a1652", winA: 0.75, ww: 1.7, wh: 2.2, px: 3.8, py: 4.6, mg: 2.8, rim: 0.32 },
    { cTop: "#170f36", cBot: "#1c103c", winA: 0.9, ww: 2.1, wh: 2.7, px: 4.4, py: 5.4, mg: 3.2, rim: 0.5 },
    { cTop: "#130b2b", cBot: "#0d081c", winA: 1, ww: 2.8, wh: 3.6, px: 5.8, py: 7, mg: 4, rim: 0.7, litMul: 0.6 }
  ];
  var TONES = {
    warm: ["#ffd79a", "#ffc677", "#ffe6bd", "#ffb46b"],
    cool: ["#bfe4ff", "#a8d8ff", "#e3f2ff", "#8fd0ff"],
    violet: ["#cdb1ff", "#b794ff", "#e4d6ff", "#a07cf5"],
    pink: ["#ff9fe6", "#ff7fd8", "#ffc8f1", "#f070d0"],
    cyan: ["#8af2ff", "#4fe6ff", "#c8fbff", "#36e2ff"]
  };
  var ROOFS = ["flat", "flat", "flat", "step", "step", "spire", "slant", "crown", "pyramid", "flat", "step"];
  var STYLES = ["grid", "grid", "grid", "res", "res", "res", "bands", "cols"];
  function pickTone(rng) { var r = rng.next(); return r < 0.34 ? "warm" : r < 0.5 ? "cool" : r < 0.68 ? "violet" : r < 0.84 ? "pink" : "cyan"; }

  function makeBuilding(rng, x, w, top, base, tier) {
    return {
      x: x, w: w, top: top, base: base, tier: tier,
      roof: rng.pick(ROOFS), style: rng.pick(STYLES), tone: pickTone(rng),
      lit: rng.range(0.16, 0.58), occ: rng.range(0.3, 0.8), hue: rng.next(),
      rimSide: rng.chance(0.5) ? 1 : -1, rim: rng.pick([PAL.pink, PAL.violet, PAL.cyan, PAL.violet, PAL.pink, PAL.amber]),
      outline: rng.chance(tier >= 3 ? 0.1 : tier === 2 ? 0.07 : 0.035) ? rng.pick(NEON) : null,
      r1: rng.next(), r2: rng.next(), r3: rng.next()
    };
  }

  function envAt(peaks, xf, base) {
    var e = base;
    for (var i = 0; i < peaks.length; i++) {
      var p = peaks[i], d = (xf - p[0]) / p[1];
      e = Math.max(e, p[2] * Math.exp(-d * d));
    }
    return e;
  }

  function minTopFor(S, tier, a, b) {
    var y = -1e9, K = S.keepouts;
    for (var i = 0; i < K.length; i++) {
      var k = K[i];
      if (tier >= k.tier && b > k.x0 && a < k.x1) y = Math.max(y, k.y);
    }
    return y;
  }

  // Fill a horizontal run with buildings. Heights follow a skyline envelope plus jitter.
  function fillRow(S, rng, o, baseFn) {
    var u = S.u, W = S.W, out = [];
    var x0 = o.x0 * W, x1 = o.x1 * W, high = o.high * S.H, low = o.low * S.H;
    var x = x0 - rng.range(0, o.wMax * u * 0.7);
    while (x < x1) {
      var w = rng.range(o.wMin, o.wMax) * u;
      if (rng.chance(0.1)) w *= 1.55;
      var cx = x + w / 2;
      var e = envAt(o.peaks || [], cx / W, o.envBase == null ? 0.3 : o.envBase);
      var hf = clamp(e * rng.range(0.6, 1.08) + rng.range(-0.06, 0.06), 0.02, 1);
      var top = lerp(low, high, hf);
      top = Math.max(top, minTopFor(S, o.tier, x, x + w) + rng.range(0, 8) * u);
      var base = baseFn(cx);
      top = Math.min(top, base - (o.minH || 18) * u);
      out.push(makeBuilding(rng, x, w, top, base, o.tier));
      x += w + rng.range(o.gMin == null ? -4 : o.gMin, o.gMax == null ? 4 : o.gMax) * u;
    }
    return out;
  }

  // Window rectangles are bucketed by colour and alpha, then filled as one path per bucket.
  var WB = { keys: [], map: {} };
  function wbPush(color, a, x, y, w, h) {
    var aq = Math.max(1, Math.round(a * 6)), key = color + aq, arr = WB.map[key];
    if (!arr) { arr = WB.map[key] = []; arr.color = color; arr.a = aq / 6; WB.keys.push(key); }
    arr.push(x, y, w, h);
  }
  function wbFlush(x) {
    for (var i = 0; i < WB.keys.length; i++) {
      var arr = WB.map[WB.keys[i]];
      x.globalAlpha = arr.a;
      x.fillStyle = arr.color;
      x.beginPath();
      for (var j = 0; j < arr.length; j += 4) x.rect(arr[j], arr[j + 1], arr[j + 2], arr[j + 3]);
      x.fill();
    }
    WB.keys.length = 0;
    WB.map = {};
    x.globalAlpha = 1;
  }

  function drawWindows(S, x, b, T, rng, y0, collect, cTop) {
    var u = S.u, ww = T.ww * u, wh = T.wh * u, px = T.px * u, py = T.py * u, mg = T.mg * u;
    if (b.style === "res") { ww *= 0.85; px *= 0.9; }
    var inner = b.w - 2 * mg;
    if (inner < ww) return;
    var cols = Math.floor((inner - ww) / px) + 1, used = (cols - 1) * px + ww, ox = b.x + (b.w - used) / 2;
    var rows = Math.floor((b.base - y0 - mg) / py);
    var tone = TONES[b.tone], shadeX = b.x + b.w * 0.66, BH = Math.max(1, b.base - b.top), yMax = S.H + S.m;
    var lit = b.lit * (T.litMul || 1) * (b.dim || 1), mull = null;
    for (var r = 0; r < rows; r++) {
      var y = y0 + r * py;
      if (y > yMax) break;
      var busy = rng.next() < b.occ, p = busy ? Math.min(0.92, lit * 1.8) : lit * 0.3;
      if (b.style === "bands") {
        if (rng.next() < p) {
          var bc = tone[r % tone.length];
          wbPush(bc, T.winA * rng.range(0.38, 0.8), b.x + mg, y, b.w - 2 * mg, wh * 0.8);
          mull = mull || [];
          for (var mx = b.x + mg + px; mx < b.x + b.w - mg; mx += px * 1.6) mull.push(mx, y, Math.max(0.5, 0.45 * u), wh * 0.8);
        }
        continue;
      }
      for (var c = 0; c < cols; c++) {
        if (b.style === "cols" && c % 3 === 2) continue;
        var wx = ox + c * px, on = rng.next() < p, col = null;
        if (on) {
          col = rng.next() < 0.07 ? TONES[rng.pick(["pink", "cyan", "violet"])][0] : tone[(rng.next() * tone.length) | 0];
          wbPush(col, T.winA * (0.5 + rng.next() * 0.5) * (wx > shadeX ? 0.78 : 1), wx, y, ww, wh);
        }
        if (collect && rng.next() < collect.rate) {
          var off = mix(cTop, T.cBot, clamp((y - b.top) / BH, 0, 1));
          if (wx > shadeX) off = mix(off, "#04020a", 0.24);
          collect.list.push({
            x: wx, y: y, w: ww, h: wh, on: on, color: col || tone[(rng.next() * tone.length) | 0], off: off,
            a: T.winA * 0.92, period: 5 + rng.next() * 24, phase: rng.next(), dur: 0.1 + rng.next() * 0.4, tv: rng.next() < 0.05
          });
        }
      }
      if (b.style === "res" && rows > 3) wbPush("#9a86d6", 0.16, b.x + mg * 0.5, y + wh + 0.5 * u, b.w - mg, Math.max(0.5, 0.42 * u));
    }
    wbFlush(x);
    if (mull) {
      x.globalAlpha = 0.5;
      x.fillStyle = T.cBot;
      x.beginPath();
      for (var q = 0; q < mull.length; q += 4) x.rect(mull[q], mull[q + 1], mull[q + 2], mull[q + 3]);
      x.fill();
      x.globalAlpha = 1;
    }
  }

  function drawBuilding(S, x, b, rng, collect) {
    var T = TIER[b.tier], u = S.u, k = S.k;
    var qk = inQuiet(S, { x: b.x, y: b.top, w: b.w, h: Math.max(1, b.base - b.top) });
    if (qk < 1) { b.dim = 0.5; b.outline = null; if (b.roof === "crown") b.roof = "flat"; }
    var bx = b.x, bw = b.w, top = b.top, base = b.base, wTop = top, roofY = top, sx = bx, sw = bw;
    var tint = b.hue < 0.5 ? "#2e2170" : "#4a1752";
    var cTop = mix(T.cTop, tint, 0.3 * Math.abs(b.hue - 0.5) * 2);
    var g = x.createLinearGradient(0, top, 0, base);
    g.addColorStop(0, cTop);
    g.addColorStop(1, T.cBot);
    x.fillStyle = g;
    x.beginPath();
    switch (b.roof) {
      case "step":
        var h1 = (5 + b.r1 * 10) * u, ins = bw * (0.12 + b.r2 * 0.16);
        x.rect(bx, top + h1, bw, base - top - h1);
        x.rect(bx + ins, top, bw - ins * 2, h1 + 1);
        wTop = top + h1; sx = bx + ins; sw = bw - ins * 2;
        break;
      case "slant":
        var d = bw * (0.18 + b.r1 * 0.3);
        if (b.r2 < 0.5) { x.moveTo(bx, top + d); x.lineTo(bx + bw, top); } else { x.moveTo(bx, top); x.lineTo(bx + bw, top + d); }
        x.lineTo(bx + bw, base); x.lineTo(bx, base); x.closePath();
        wTop = top + d; roofY = null;
        break;
      case "pyramid":
        var ph = bw * (0.3 + b.r1 * 0.35);
        x.moveTo(bx, top + ph); x.lineTo(bx + bw / 2, top); x.lineTo(bx + bw, top + ph); x.lineTo(bx + bw, base); x.lineTo(bx, base); x.closePath();
        wTop = top + ph; roofY = null;
        break;
      default:
        x.rect(bx, top, bw, base - top);
        if (b.roof === "crown") wTop = top + 6 * u;
    }
    x.fill();
    x.fillStyle = "rgba(4,2,10,0.24)";
    x.fillRect(bx + bw * 0.66, wTop, bw * 0.34, base - wTop);
    if (!b.noWindows) drawWindows(S, x, b, T, rng, wTop + 2 * u, collect, cTop);

    if (T.rim > 0) {
      var rw = Math.max(1, 0.8 * u), rx = b.rimSide > 0 ? bx + bw - rw : bx;
      var rg = x.createLinearGradient(0, wTop, 0, base);
      rg.addColorStop(0, rgba(b.rim, T.rim));
      rg.addColorStop(0.7, rgba(b.rim, 0));
      x.fillStyle = rg;
      x.fillRect(rx, wTop, rw, base - wTop);
      if (roofY !== null) { x.fillStyle = rgba(b.rim, T.rim * 0.55); x.fillRect(sx, roofY, sw, Math.max(0.6, 0.5 * u)); }
    }

    // Rooftop clutter: water tanks, plant rooms, antennas with aircraft lights.
    var tipX = null, tipY = null;
    if (roofY !== null) {
      var nb = Math.floor(b.r3 * 3);
      for (var i = 0; i < nb; i++) {
        var pw = (3 + hash(bx * 0.37 + i) * 6) * u, phh = (2 + hash(bx * 0.71 + i) * 4.5) * u;
        var pxx = sx + 1.5 * u + hash(bx * 1.3 + i) * Math.max(0, sw - pw - 3 * u);
        x.fillStyle = cTop;
        x.fillRect(pxx, roofY - phh, pw, phh + 0.5);
      }
      if (b.roof === "spire") {
        var sh = (14 + b.r2 * 30) * u, cx = bx + bw * (0.3 + b.r1 * 0.4);
        x.fillStyle = cTop;
        x.beginPath(); x.moveTo(cx - 1.4 * u, roofY + 0.5); x.lineTo(cx, roofY - sh); x.lineTo(cx + 1.4 * u, roofY + 0.5); x.closePath(); x.fill();
        tipX = cx; tipY = roofY - sh;
      } else if (b.r1 > 0.7) {
        var ah = (6 + b.r2 * 14) * u, ax = sx + sw * (0.2 + b.r3 * 0.6);
        x.fillStyle = cTop;
        x.fillRect(ax - 0.35 * u, roofY - ah, Math.max(0.6, 0.7 * u), ah);
        tipX = ax; tipY = roofY - ah;
      }
      if (b.roof === "crown") {
        var cc = b.outline || b.rim;
        x.beginPath(); x.rect(bx + 1.5 * u, top + 1.2 * u, bw - 3 * u, 3.6 * u);
        glowStroke(x, null, cc, Math.max(0.8, 1.1 * u), mix(cc, "#ffffff", 0.5));
      }
    } else if (b.roof === "pyramid") { tipX = bx + bw / 2; tipY = top; }
    if (tipX !== null && b.tier >= 1 && tipY < S.H * 0.7) {
      x.fillStyle = "rgba(255,77,94,0.75)";
      x.fillRect(tipX - 0.6 * u, tipY - 0.6 * u, 1.2 * u, 1.2 * u);
      S.blinkCand.push({ x: tipX, y: tipY, tier: b.tier });
    }

    if (b.outline) {
      var ow = Math.max(0.8, 0.9 * u), len = (base - wTop) * (0.45 + b.r2 * 0.4);
      var oa = b.tier >= 3 ? 0.95 : 0.65;
      glowRect(x, bx, wTop, ow, len, b.outline, 2.5 * u, oa);
      glowRect(x, bx + bw - ow, wTop, ow, len, b.outline, 2.5 * u, oa);
      if (roofY !== null) glowRect(x, sx, roofY, sw, ow, b.outline, 2.5 * u, oa);
    }
  }

  /* ------------------------------------------------------------------ layouts */

  // Hero layouts are solved against the page content measured over the city (copy, portrait, cat, meta):
  // featured towers and signs go into the free gaps and never sit behind text, the portrait or the cat.
  function blockedBy(S, r, placed) {
    if (hits(r, S.avoidPad)) return true;
    if (placed && hits(r, placed)) return true;
    var c = S.calmR;
    return !!(c && r.x < c.x1 && r.x + r.w > c.x0 && r.y < c.y);
  }
  // The free spot for a w x h box inside [x0, x1] x [y0, y1] closest to (px, py), or null.
  function findSpot(S, w, h, x0, x1, y0, y1, px, py, placed) {
    var step = Math.max(3, 4 * S.u), best = null, bd = 1e18;
    for (var y = y0; y <= y1 - h + 0.01; y += step) {
      for (var x = x0; x <= x1 - w + 0.01; x += step) {
        var r = { x: x, y: y, w: w, h: h };
        if (blockedBy(S, r, placed)) continue;
        var d = (x - px) * (x - px) + (y - py) * (y - py) * 0.7;
        if (d < bd) { bd = d; best = r; }
      }
    }
    return best;
  }
  function copyRightIn(Z, y0, y1) {
    var r = -1e9, L = Z.copy;
    for (var i = 0; i < L.length; i++) if (L[i].y < y1 && L[i].y + L[i].h > y0) r = Math.max(r, L[i].x + L[i].w);
    return r;
  }

  var SKY_DESK = [[0, "#0a0420"], [0.2, "#150938"], [0.36, "#22104c"], [0.5, "#36115e"], [0.6, "#561868"], [0.68, "#6b1d6c"], [0.78, "#3a0f4c"], [0.9, "#170a27"], [1, "#0b0613"]];

  function configFor(S) {
    if (S.mode === "band") return bandConfig(S);
    return S.compact ? compactConfig(S) : deskConfig(S);
  }

  function bandConfig(S) {
    S.calmR = null;
    var wide = S.W > 700;
    return {
      band: true, sky: false,
      glows: [
        { x: 0.22, y: 1.02, rx: 0.42, ry: 0.8, c: PAL.pink, a: 0.42 },
        { x: 0.62, y: 1.02, rx: 0.5, ry: 0.9, c: PAL.violet, a: 0.5 },
        { x: 0.92, y: 1.02, rx: 0.3, ry: 0.7, c: PAL.cyan, a: 0.22 },
        { x: 0.45, y: 0.92, rx: 0.9, ry: 0.35, c: "#7a2a9a", a: 0.35 },
        // A visible magenta and violet haze behind the skyline, where the top fade has finished.
        { x: 0.3, y: 0.62, rx: 0.36, ry: 0.42, c: PAL.pink, a: 0.26 },
        { x: 0.74, y: 0.6, rx: 0.42, ry: 0.44, c: PAL.violet, a: 0.34 },
        { x: 0.52, y: 0.7, rx: 0.2, ry: 0.3, c: PAL.cyan, a: 0.1 }
      ],
      stars: 0, clouds: 0, hills: [],
      far: [{ tier: 1, base: 1.02, wave: 0, high: 0.2, low: 0.58, wMin: 11, wMax: 28, gMin: -4, gMax: 3, envBase: 0.3 }],
      mid: { base: 1.02, hill: 0, rows: [
        { tier: 2, high: 0.18, low: 0.6, wMin: 16, wMax: 36, gMin: -5, gMax: 4, envBase: 0.3 },
        { tier: 3, high: 0.3, low: 0.7, wMin: 20, wMax: 44, gMin: -3, gMax: 6, envBase: 0.25 }
      ] },
      near: { base: 1.03, rows: [] },
      track: { y: 0.66 * S.H, x0: -1 }, liziba: { x: 0.36 * S.W, w: 50 * S.u, top: 0.66 * S.H - 54 * S.u, sign: null, ticker: false },
      raffles: wide ? { x: 0.7 * S.W, w: 106 * S.u, top: 0.28 * S.H } : null,
      houses: wide ? [[0.07, 0.19, "hong"], [0.56, 0.62, "pagoda"]] : [[0.05, 0.36, "hong"]],
      lanes: [0.12, 0.42], cars: [3, 2, 0], dust: 8, river: 0, signsEvery: 200,
      mistA: [0.42, 1.0], mistB: null, beams: [], pool: POOL_BAND, lanternScale: 0.85, trainCars: 3, quiet: [], shows: 0, washes: 3
    };
  }

  function deskConfig(S) {
    var W = S.W, H = S.H, u = S.u, Z = S.Z, pad = 20, placed = [];
    var cp = union(Z.copy) || { x: W * 0.07, y: H * 0.15, w: W * 0.42, h: H * 0.62 };
    var pt = union(Z.portrait) || { x: W * 0.66, y: H * 0.15, w: W * 0.21, h: H * 0.37 };
    var ct = union(Z.cat) || { x: W * 0.7, y: H * 0.55, w: W * 0.24, h: H * 0.43 };
    var mt = union(Z.meta.concat(Z.box));
    var calm = S.calmR = { x0: pt.x - 28, x1: pt.x + pt.w + 28, y: pt.y + pt.h + 12 };
    function copyR(y0, y1) { return copyRightIn(Z, y0, y1); }
    function keep(r) { if (r) placed.push(grow(r, 6 * u)); return r; }

    // Waterline above the meta strip, and the monorail just under the portrait's tag.
    var wl = clamp(Math.min(0.8 * H, (mt ? mt.y : H) - 36 * u), 0.7 * H, 0.84 * H);
    var ty = clamp(calm.y + 12 * u, 0.46 * H, wl - 0.19 * H);

    // Hongyadong: right of the copy and left of the cat, so its reds and ambers stay clear of the fire eyes.
    // It sits as high as the copy allows: lower tops are tried until the gap beside the copy is wide enough.
    var hx1 = Math.min(0.62 * W, ct.x + Math.min(ct.w * 0.05, 24 * u)), want = clamp(0.21 * W, 210 * u, 340 * u);
    var hTop = ty + 18 * u, hx0 = hx1 - want, hBest = null;
    for (var ht = ty + 18 * u; ht <= wl - 110 * u; ht += 6 * u) {
      var hc = Math.max(hx1 - want, copyR(ht - 30 * u, wl) + pad), hw = hx1 - hc;
      if (!hBest || hw > hBest.w + 2) hBest = { top: ht, x0: hc, w: hw };
      if (hw >= want * 0.75) break;
    }
    if (hBest) { hTop = hBest.top; hx0 = hBest.x0; }
    if (hx1 - hx0 < 150 * u) hx1 = Math.max(hx1, Math.min(hx0 + 170 * u, ct.x + ct.w * 0.3));
    var floors = clamp(Math.round((wl - hTop) / (25 * u)), 4, 9);

    // The line leaves a hillside tunnel just right of the copy and runs through the Liziba slab.
    var tr = copyR(ty - 64 * u, ty + 26 * u), portal = tr > -1e8 ? tr + pad + 8 * u : -1;
    var stageL = portal >= 0 ? portal : Math.max(0, cp.x + cp.w * 0.6);
    var lw = 78 * u, lx = stageL + 34 * u;
    if (lx + lw > calm.x0) { lx = Math.max(stageL + 14 * u, calm.x0 - lw); lw = Math.max(52 * u, Math.min(lw, calm.x0 - lx)); }
    var lTop = ty - clamp(0.1 * H, 70 * u, 120 * u);
    if (lx + lw > calm.x0 && lTop < calm.y) lTop = Math.min(ty - 16 * u, calm.y);
    // The 機械学習 lightbox on the Liziba roof: full size, then smaller, then vertical when the gap is narrow.
    var bSpec = null, bs = null;
    [[21, false], [17, false], [16, true]].some(function (v) {
      var sp = { text: WORDS.ml, size: v[0] * u, color: PAL.cyan, box: true, vertical: v[1] }, d = signDims(sp);
      var r = findSpot(S, d.iw, d.ih, lx + lw / 2 - d.iw / 2 - 60 * u, lx + lw / 2 + d.iw / 2 + 60 * u, lTop - d.ih - 50 * u, lTop - 4 * u, lx + lw / 2 - d.iw / 2, lTop - d.ih - 6 * u, placed);
      if (!r) return false;
      bSpec = sp; bs = keep(r);
      return true;
    });
    if (!bs) {
      // No room over the slab (narrow screens): the nearest free gap anywhere, off the monorail.
      var trk = placed.concat([{ x: -1e4, y: ty - 14 * u, w: 2e4, h: 24 * u }]);
      [[17, false], [15, true]].some(function (v) {
        var sp = { text: WORDS.ml, size: v[0] * u, color: PAL.cyan, box: true, vertical: v[1] }, d = signDims(sp);
        var r = findSpot(S, d.iw, d.ih, 0, W - 4, 0.1 * H, wl - 50 * u, lx + lw / 2 - d.iw / 2, lTop - d.ih - 6 * u, trk);
        if (!r) return false;
        bSpec = sp; bs = keep(r);
        return true;
      });
    }

    // 人工知能, the tallest sign: hung on the left face of a spire tower between the copy and the portrait.
    var aw = 48 * u, featA = null;
    [30, 25, 21].some(function (sz) {
      var sp = { text: WORDS.ai, vertical: true, size: sz * u, color: PAL.pink }, d = signDims(sp);
      var xr = calm.x0 - aw + d.iw * 0.38;
      var r = findSpot(S, d.iw, d.ih, 0, xr, Math.max(0.1 * H, 64), ty - 30 * u, xr - d.iw, 0.2 * H, placed);
      if (!r) r = findSpot(S, d.iw, d.ih, 0, ct.x, calm.y + 8, wl - 30 * u, ct.x - d.iw - 60 * u, calm.y + 40 * u, placed);
      if (!r) return false;
      keep(r);
      featA = { x: r.x + d.iw * 0.62, w: aw, top: r.y - 36 * u, spec: sp, sx: r.x, sy: r.y };
      return true;
    });

    // Right column: the izakaya tower (magenta, not red, beside the cat) and Raffles City when there is room.
    var rc0 = calm.x1 - 8, rc1 = W, featC = null, raf = null, rafSpan = 176 * u, roomy = rc1 - rc0 > rafSpan + 160 * u;
    [32, 26, 22].some(function (sz) {
      var sp = { text: WORDS.izakaya, vertical: true, size: sz * u, color: PAL.pink }, d = signDims(sp), cw = 84 * u;
      var px = roomy ? rc1 - cw * 0.45 - d.iw : rc0 + (rc1 - rc0) * 0.3;
      var r = findSpot(S, d.iw, d.ih, rc0, W - 4, 0.08 * H, wl - 40 * u, px, 0.13 * H, placed);
      if (!r) return false;
      keep(r);
      featC = { x: r.x + d.iw * 0.55, w: cw, top: r.y - 26 * u, spec: sp, sx: r.x, sy: r.y, showY: r.y + d.ih + 24 * u };
      var s2 = { text: WORDS.hotel, vertical: true, size: 18 * u, color: PAL.cyan }, d2 = signDims(s2);
      var r2 = findSpot(S, d2.iw, d2.ih, featC.x - d2.iw, Math.min(W - 2, featC.x + cw + 8 * u), r.y + d.ih + 20 * u, wl - 50 * u, featC.x + cw - d2.iw * 0.4, r.y + d.ih + 70 * u, placed);
      if (r2) { keep(r2); featC.s2 = s2; featC.s2x = r2.x; featC.s2y = r2.y; featC.showY = Math.max(featC.showY, r2.y + d2.ih + 16 * u); }
      return true;
    });
    var rTop = Math.max(0.26 * H, 70 + 34 * u), slots = [];
    if (roomy) slots.push([calm.x1 + 10 * u, featC ? featC.sx - 14 * u : rc1 - 90 * u]);
    var sl = copyR(rTop - 40 * u, rTop + 90 * u);
    slots.push([Math.max(sl > -1e8 ? sl + pad : stageL, 0), calm.x0]);
    for (var si = 0; si < slots.length && !raf; si++) {
      var s0 = slots[si][0], s1 = slots[si][1];
      if (s1 - s0 < rafSpan) continue;
      var rcx = (s0 + s1) / 2, rtw = 106 * u;
      if (blockedBy(S, { x: rcx - rtw / 2 - 3 * u, y: rTop - 3 * u, w: rtw + 6 * u, h: 7 * u }, null)) continue;
      raf = { x: rcx - rtw / 2, w: rtw, top: rTop };
    }

    // 猫カフェ beside the cat, on a small building of its own.
    var nSpec = { text: WORDS.neko, size: 16 * u, color: PAL.pink }, nd = signDims(nSpec);
    var ns = keep(findSpot(S, nd.iw, nd.ih, hx1 - 60 * u, ct.x + ct.w * 0.35, ty + 24 * u, wl - 44 * u, (hx1 + ct.x) / 2 - nd.iw / 2, ty + 64 * u, placed));
    var neko = ns ? { spec: nSpec, sx: ns.x, sy: ns.y, bx: ns.x + nd.iw / 2 - 23 * u, bw: 46 * u, btop: ns.y + nd.ih + 4 * u } : null;
    if (!ns) {
      // A wide cat leaves no room beside it: hang the sign vertically in the nearest free gap instead.
      nSpec.vertical = true; nd = signDims(nSpec);
      ns = keep(findSpot(S, nd.iw, nd.ih, 0, W - 4, ty + 20 * u, wl - 30 * u, ct.x - nd.iw - 12 * u, ty + 40 * u, placed));
      neko = ns ? { spec: nSpec, sx: ns.x, sy: ns.y, bx: null, bare: true } : null;
    }

    var wlf = wl / H, tyf = ty / H, stageC = (stageL + calm.x0) / 2;
    return {
      sky: true, stars: 1, clouds: 8, banks: true, skyStops: SKY_DESK,
      glows: [
        { x: (pt.x + pt.w / 2) / W, y: tyf + 0.03, rx: 0.5, ry: 0.28, c: PAL.pink, a: 0.5 },
        { x: 0.2, y: 0.6, rx: 0.45, ry: 0.26, c: PAL.violet, a: 0.38 },
        { x: 0.97, y: 0.42, rx: 0.22, ry: 0.26, c: PAL.cyan, a: 0.22 },
        { x: stageC / W, y: 0.4, rx: 0.25, ry: 0.14, c: PAL.violet, a: 0.16 },
        { x: (hx0 + hx1) / 2 / W, y: wlf - 0.05, rx: 0.2, ry: 0.16, c: PAL.amber, a: 0.24 },
        { x: 0.42, y: 0.3, rx: 0.3, ry: 0.12, c: "#4a6bff", a: 0.09 }
      ],
      hills: [
        { base: 0.71, amp: 0.2, sc: 0.22, seed: 1, top: "#3b2364", bot: "#2b1851", lights: 0.55 },
        { base: 0.75, amp: 0.11, sc: 0.13, seed: 2, top: "#2c1854", bot: "#20123f", lights: 0.75 }
      ],
      far: [
        { tier: 0, base: 0.75, wave: 0.03, high: 0.3, low: 0.64, wMin: 10, wMax: 24, gMin: -4, gMax: 3, peaks: [[0.1, 0.1, 0.75], [0.36, 0.1, 0.85], [0.6, 0.07, 1], [0.95, 0.08, 0.95]], envBase: 0.25 },
        { tier: 1, base: 0.8, wave: 0.03, high: 0.36, low: 0.68, wMin: 13, wMax: 32, gMin: -5, gMax: 4, peaks: [[0.2, 0.08, 0.85], [0.47, 0.08, 0.9], [0.62, 0.05, 0.8], [0.97, 0.06, 0.9]], envBase: 0.22 }
      ],
      mid: { base: Math.max(0.88, wlf + 0.05), hill: 0.1, rows: [
        { tier: 2, high: 0.28, low: 0.64, wMin: 18, wMax: 40, gMin: -6, gMax: 5, peaks: [[0.06, 0.08, 0.8], [0.3, 0.08, 0.9], [0.5, 0.06, 0.85], [0.93, 0.07, 1]], envBase: 0.25 },
        { tier: 3, high: 0.38, low: 0.7, wMin: 22, wMax: 48, gMin: -4, gMax: 8, peaks: [[0.15, 0.08, 0.7], [0.4, 0.06, 0.7], [0.98, 0.06, 0.9]], envBase: 0.22 }
      ] },
      calm: calm, raffles: raf, featA: featA,
      liziba: { x: lx, w: lw, top: lTop, sign: bs ? { spec: bSpec, sx: bs.x, sy: bs.y } : null, ticker: true },
      track: { y: ty, x0: portal },
      near: { base: wlf, rows: [
        { tier: 4, x0: -0.03, x1: hx0 / W, high: wlf - 0.16, low: wlf - 0.05, wMin: 30, wMax: 66, gMin: -3, gMax: 6, envBase: 0.4 },
        { tier: 4, x0: hx1 / W, x1: 1.03, high: 0.44, low: wlf - 0.04, wMin: 36, wMax: 80, gMin: -2, gMax: 6, peaks: [[0.98, 0.05, 1], [Math.min(0.97, hx1 / W + 0.04), 0.04, 0.55]], envBase: 0.3 }
      ] },
      featC: featC, neko: neko,
      hong: { x0: hx0 / W, x1: hx1 / W, top: hTop / H, bot: wlf, floors: floors, sign: { text: WORDS.hotpot, color: PAL.amber, size: 16 * u, vertical: true, box: true }, signX: hx1 - 24 * u },
      bridge: { x0: -0.04, x1: (hx0 + 12 * u) / W, deck: wlf - 0.062, top: wlf - 0.25, towers: [0.24, 0.72] },
      river: wlf,
      beams: [
        { x: 0.2, base: 0.74, h: 0.72, c: PAL.violet, dur: 19, a0: -26, a1: 18 },
        { x: clamp(stageC / W, 0.3, 0.7), base: 0.74, h: 0.7, c: PAL.cyan, dur: 15, a0: -12, a1: 26 },
        { x: 0.985, base: 0.76, h: 0.74, c: PAL.pink, dur: 23, a0: -30, a1: 6 }
      ],
      mistA: [tyf - 0.14, wlf - 0.05], mistB: [wlf - 0.25, wlf + 0.05],
      lanes: [0.1, 0.42], cars: [4, 3, 1], dust: 26, dustX0: Math.max(0, stageL / W - 0.02), signsEvery: 0, pool: POOL_V, lanternScale: 1, trainCars: 4,
      quiet: [{ x: cp.x - pad, y: cp.y - pad, w: cp.w + 2 * pad, h: cp.h + 2 * pad, keep: 0.2 }],
      scrim: cp, shows: 2, washes: 4
    };
  }

  // Phones and narrow tablets: the copy stacks over the top, so the skyline rises between the social row and
  // the cat, with featured signs kept below the social row and beside the cat.
  function compactConfig(S) {
    var W = S.W, H = S.H, u = S.u, Z = S.Z, pad = 14, placed = [];
    var cp = union(Z.copy) || { x: 16, y: H * 0.2, w: W - 32, h: H * 0.44 };
    var ct = union(Z.cat) || { x: W * 0.12, y: H * 0.74, w: W * 0.76, h: H * 0.24 };
    S.calmR = null;
    function keep(r) { if (r) placed.push(grow(r, 5)); return r; }
    var cB = cp.y + cp.h, catT = ct.y, yc = cB / H;
    var wl = clamp(0.88 * H, catT + 50, H - 12);
    var ty = clamp((cB + catT) / 2 + 6, cB + 34, Math.max(cB + 34, catT + 6));

    var bSpec = { text: WORDS.ml, size: Math.max(15, 16 * u), color: PAL.cyan, box: true }, bd = signDims(bSpec);
    var bs = keep(findSpot(S, bd.iw, bd.ih, 4, W - 4, cB - 30, ty - 22 * u, W * 0.42 - bd.iw / 2, ty - 30 * u - bd.ih, placed));
    var lw = Math.max(40, 72 * u), lx = bs ? bs.x + bs.w / 2 - lw / 2 : W * 0.42 - lw / 2;
    var lTop = Math.min(bs ? bs.y + bs.h + 5 * u : ty - 50 * u, ty - 14 * u);

    placed.push({ x: -1e4, y: ty - 10 * u, w: 2e4, h: 17 * u }); // keep it off the monorail and the train
    var featA = null;
    [Math.max(18, 22 * u), 17, 15].some(function (sz) {
      var aSpec = { text: WORDS.ai, vertical: true, size: sz, color: PAL.pink }, ad = signDims(aSpec);
      var as = findSpot(S, ad.iw, ad.ih, W * 0.5, W - 2, cB - 30, wl - 30, W - ad.iw - 12, cB + pad + 6, placed);
      if (!as) return false;
      keep(as);
      featA = { x: as.x + ad.iw * 0.62, w: Math.max(24, 40 * u), top: as.y - 18 * u, spec: aSpec, sx: as.x, sy: as.y };
      return true;
    });

    // 猫カフェ: vertical where it fits, else a horizontal plate, nearest the right edge just under the monorail.
    var nSpec = null, nd = null, ns = null;
    [true, false].some(function (vert) {
      var sp = { text: WORDS.neko, vertical: vert, size: Math.max(13, 15 * u), color: PAL.pink }, d = signDims(sp);
      var r = findSpot(S, d.iw, d.ih, 0, W - 2, cB - 30, wl - 10, W - d.iw - 8, ty + 12 * u, placed);
      if (!r) return false;
      nSpec = sp; nd = d; ns = keep(r);
      return true;
    });
    // Brackets run to the right edge only when the sign hangs there; elsewhere it is mounted on the facade behind it.
    var neko = ns ? { spec: nSpec, sx: ns.x, sy: ns.y, bx: null, bare: ns.x + nd.iw < W * 0.7 } : null;

    var hx1 = Math.max(W * 0.4, 150), hTop = ty + 16 * u, floors = clamp(Math.round((wl - hTop) / (30 * u)), 4, 8);
    var raf = null, rtw = 106 * u, rTop = Math.max(cB + pad + 6, ty - 70 * u);
    if (!blockedBy(S, { x: W * 0.2 - rtw / 2 - 3 * u, y: rTop - 3 * u, w: rtw + 6 * u, h: 7 * u }, placed)) raf = { x: W * 0.2 - rtw / 2, w: rtw, top: rTop };

    var st = [[0, "#04020b"], [yc - 0.3, "#0a0520"], [yc - 0.12, "#170a36"], [yc, "#331055"], [yc + 0.08, "#5a196a"], [yc + 0.17, "#3a0f4c"], [yc + 0.27, "#1a0a2a"], [1, "#0b0613"]], prev = 0;
    st.forEach(function (s) { s[0] = clamp(Math.max(prev, s[0]), 0, 1); prev = s[0]; });
    var wlf = wl / H, tyf = ty / H;
    return {
      sky: true, stars: 1, clouds: 5, banks: false, skyStops: st,
      glows: [
        { x: 0.62, y: yc + 0.1, rx: 0.9, ry: 0.18, c: PAL.pink, a: 0.5 },
        { x: 0.12, y: yc + 0.08, rx: 0.6, ry: 0.15, c: PAL.violet, a: 0.38 },
        { x: 0.95, y: yc + 0.03, rx: 0.4, ry: 0.12, c: PAL.cyan, a: 0.2 },
        { x: 0.25, y: wlf - 0.06, rx: 0.5, ry: 0.1, c: PAL.amber, a: 0.24 }
      ],
      hills: [
        { base: yc + 0.13, amp: 0.1, sc: 0.35, seed: 1, top: "#38215f", bot: "#29174d", lights: 0.6 },
        { base: yc + 0.16, amp: 0.06, sc: 0.2, seed: 2, top: "#2a1752", bot: "#1e113e", lights: 0.8 }
      ],
      far: [
        { tier: 0, base: yc + 0.2, wave: 0.02, high: yc - 0.05, low: yc + 0.12, wMin: 10, wMax: 22, gMin: -3, gMax: 3, peaks: [[0.2, 0.18, 0.8], [0.75, 0.15, 1]], envBase: 0.3 },
        { tier: 1, base: yc + 0.23, wave: 0.02, high: yc - 0.03, low: yc + 0.14, wMin: 12, wMax: 28, gMin: -4, gMax: 3, peaks: [[0.45, 0.15, 0.9], [0.95, 0.12, 0.9]], envBase: 0.25 }
      ],
      mid: { base: wlf + 0.03, hill: 0.04, rows: [
        { tier: 2, high: yc - 0.02, low: yc + 0.13, wMin: 16, wMax: 34, gMin: -5, gMax: 4, peaks: [[0.1, 0.12, 0.8], [0.62, 0.12, 0.9]], envBase: 0.3 },
        { tier: 3, high: yc + 0.01, low: yc + 0.16, wMin: 20, wMax: 40, gMin: -3, gMax: 6, peaks: [[0.3, 0.12, 0.8], [0.9, 0.1, 0.8]], envBase: 0.25 }
      ] },
      calm: null, raffles: raf, featA: featA,
      liziba: { x: lx, w: lw, top: lTop, sign: bs ? { spec: bSpec, sx: bs.x, sy: bs.y } : null, ticker: false },
      track: { y: ty, x0: -1 },
      near: { base: wlf, rows: [{ tier: 4, x0: hx1 / W - 0.02, x1: 1.04, high: tyf + 0.05, low: wlf - 0.05, wMin: 30, wMax: 60, gMin: -2, gMax: 6, peaks: [[0.93, 0.08, 1]], envBase: 0.3 }] },
      featC: null, neko: neko,
      hong: { x0: -0.03, x1: hx1 / W, top: hTop / H, bot: wlf, floors: floors, sign: { text: WORDS.hotpot, color: PAL.amber, size: Math.max(12, 13 * u), vertical: true, box: true }, signX: hx1 - 16 },
      bridge: null, river: wlf,
      beams: [{ x: 0.22, base: yc + 0.2, h: 0.46, c: PAL.violet, dur: 19, a0: -24, a1: 16 }, { x: 0.86, base: yc + 0.22, h: 0.46, c: PAL.pink, dur: 23, a0: -18, a1: 22 }],
      mistA: [yc + 0.02, yc + 0.22], mistB: [tyf + 0.03, wlf + 0.05],
      lanes: [yc - 0.1, yc + 0.05], cars: [2, 2, 1], dust: 12, dustX0: 0, signsEvery: 0, pool: POOL_V, lanternScale: 0.9, trainCars: 3,
      quiet: [{ x: -1e4, y: -1e4, w: 2e4, h: 1e4 + cB - 0.03 * H, keep: 0 }],
      scrim: { x: cp.x, y: cB - 0.12 * H, w: cp.w, h: 0.12 * H }, shows: 1, washes: 2
    };
  }

  /* ------------------------------------------------------------------ static painting */

  function paintSky(S, x, P, rng) {
    var W = S.W, H = S.H, m = S.m;
    if (P.sky) {
      var g = x.createLinearGradient(0, -m, 0, H + m);
      for (var i = 0; i < P.skyStops.length; i++) g.addColorStop(P.skyStops[i][0], P.skyStops[i][1]);
      x.fillStyle = g;
      x.fillRect(-m, -m, W + 2 * m, H + 2 * m);
    }
    P.glows.forEach(function (gl) { ellipseGlow(x, gl.x * W, gl.y * H, gl.rx * W, gl.ry * H, gl.c, gl.a); });
    for (var c = 0; c < P.clouds; c++) {
      var cy = rng.range(0.1, 0.48) * H * (S.compact ? 1.25 : 1), cx = rng.range(-0.1, 1.1) * W;
      var rx = rng.range(0.15, 0.4) * W, ry = rng.range(0.012, 0.03) * H;
      ellipseGlow(x, cx, cy, rx, ry, rng.chance(0.7) ? "#6d4fbf" : PAL.pink, rng.range(0.07, 0.13));
    }
    if (P.banks) {
      // Cloud banks in the right third, lit pink from below by the city.
      for (var b = 0; b < 6; b++) {
        var bx = rng.range(0.55, 1.08) * W, by = rng.range(0.06, 0.3) * H, brx = rng.range(0.09, 0.2) * W, bry = rng.range(0.016, 0.032) * H;
        ellipseGlow(x, bx, by, brx, bry, "#4a2886", 0.42);
        ellipseGlow(x, bx + brx * 0.06, by + bry * 0.8, brx * 0.86, bry * 0.55, PAL.pink, 0.2);
        ellipseGlow(x, bx - brx * 0.25, by + bry * 0.55, brx * 0.45, bry * 0.4, "#ffb0ea", 0.1);
      }
    }
  }

  function paintStars(S, x, P, rng) {
    var W = S.W, H = S.H, u = S.u, n = Math.round((W * H) / 6500), top = S.compact ? 0.66 : 0.6;
    var calm = P.calm;
    for (var i = 0; i < n; i++) {
      var sx = rng.range(-S.m, W + S.m), yy = Math.pow(rng.next(), 1.25) * top * H;
      var a = rng.range(0.15, 0.75) * (1 - yy / (top * H) * 0.6), r = rng.range(0.4, 1.05) * u;
      x.globalAlpha = a;
      x.fillStyle = rng.chance(0.8) ? "#e9e2ff" : rng.chance(0.5) ? "#ffd3f4" : "#c8f4ff";
      x.fillRect(sx, yy, r, r);
      if (rng.chance(0.025) && !(calm && sx > calm.x0 && sx < calm.x1)) {
        x.globalAlpha = a * 0.5;
        x.fillRect(sx - 2.5 * u, yy + r / 2 - 0.25 * u, 5 * u + r, 0.5 * u);
        x.fillRect(sx + r / 2 - 0.25 * u, yy - 2.5 * u, 0.5 * u, 5 * u + r);
      }
    }
    x.globalAlpha = 1;
  }

  function paintHill(S, x, h, rng) {
    var W = S.W, H = S.H, m = S.m, u = S.u, step = 4 * u;
    function ry(px) {
      var n = noise1(px / (W * h.sc) + h.seed * 7.7, h.seed) * 0.72 + noise1(px / (W * h.sc * 0.3) + h.seed * 3.1, h.seed + 9) * 0.28;
      return (h.base - h.amp * Math.pow(n, 1.3)) * H;
    }
    x.beginPath();
    x.moveTo(-m, H + m);
    for (var px = -m; px <= W + m + step; px += step) x.lineTo(px, ry(px));
    x.lineTo(W + m, H + m);
    x.closePath();
    var g = x.createLinearGradient(0, (h.base - h.amp) * H, 0, (h.base + 0.05) * H);
    g.addColorStop(0, h.top);
    g.addColorStop(1, h.bot);
    x.fillStyle = g;
    x.fill();
    // Hillside lights: the city climbs the hills, denser toward the base.
    var n = Math.round((W / 6) * h.lights), bottom = (h.base + 0.06) * H;
    var cols = ["#ffcf8a", "#ffcf8a", "#ff9fe6", "#c9a8ff", "#ffe2b8", "#9ff2ff"];
    for (var i = 0; i < n; i++) {
      var lx = rng.range(-m, W + m), t0 = ry(lx) + 2 * u, ly = t0 + (bottom - t0) * Math.sqrt(rng.next());
      x.globalAlpha = rng.range(0.18, 0.55);
      x.fillStyle = cols[(rng.next() * cols.length) | 0];
      x.fillRect(lx, ly, 1.05 * u, 1.05 * u);
    }
    x.globalAlpha = 1;
  }

  // Raffles City: four leaning towers with the horizontal "Crystal" sky bridge, plus the two taller outer towers.
  function paintRaffles(S, x, R) {
    var u = S.u, H = S.H;
    var x0 = R.x, tw = R.w, top = R.top, n = 4, gap = tw * 0.08, w1 = (tw - gap * (n - 1)) / n, base = H * 0.86;
    function tower(bx, bw, tt, lean) {
      var g = x.createLinearGradient(0, tt, 0, base);
      g.addColorStop(0, "#3a2a72"); g.addColorStop(1, "#2a1c55");
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(bx, base); x.lineTo(bx, tt + 6 * u);
      x.quadraticCurveTo(bx + bw * (lean > 0 ? 0.2 : 0.8), tt - 4 * u, bx + bw, tt + (lean > 0 ? 9 : 1) * u);
      x.lineTo(bx + bw, base); x.closePath(); x.fill();
      x.globalAlpha = 0.42;
      x.fillStyle = "#cbb8ff";
      for (var lx = bx + 1.6 * u; lx < bx + bw - 1 * u; lx += 2.6 * u) x.fillRect(lx, tt + 10 * u, Math.max(0.5, 0.5 * u), base - tt - 10 * u);
      x.globalAlpha = 1;
    }
    tower(x0 - w1 * 1.5, w1 * 1.05, top - 30 * u, 1);
    tower(x0 + tw + w1 * 0.45, w1 * 1.05, top - 24 * u, -1);
    for (var i = 0; i < n; i++) tower(x0 + i * (w1 + gap), w1, top + (i % 2 ? 4 : 0) * u, i < 2 ? 1 : -1);
    var cy = top - 3 * u, ch = 6.5 * u;
    rrect(x, x0 - 3 * u, cy, tw + 6 * u, ch, ch / 2);
    x.fillStyle = "#2d2163"; x.fill();
    glowStroke(x, null, PAL.violet, Math.max(0.8, 0.9 * u), null);
    glowRect(x, x0, cy + ch * 0.38, tw, Math.max(1, ch * 0.24), "#efe6ff", 2 * u, 0.85);
    S.blinkCand.push({ x: x0 - w1 * 1.0, y: top - 33 * u, tier: 1 });
    S.blinkCand.push({ x: x0 + tw + w1 * 1.0, y: top - 27 * u, tier: 1 });
  }

  function paintFar(S, x, P, rng) {
    var W = S.W, H = S.H, m = S.m, u = S.u;
    if (P.stars) paintStars(S, x, P, rng);
    P.hills.forEach(function (h) { paintHill(S, x, h, rng); });
    P.far.forEach(function (row, i) {
      var baseFn = function (px) { return (row.base + row.wave * (noise1(px / (W * 0.11) + i * 4.1, 5 + i) - 0.5)) * H + 4 * u; };
      var o = { tier: row.tier, x0: -m / W - 0.01, x1: 1 + m / W + 0.01, high: row.high, low: row.low, wMin: row.wMin, wMax: row.wMax, gMin: row.gMin, gMax: row.gMax, peaks: row.peaks || S.bandPeaks, envBase: row.envBase };
      var list = fillRow(S, rng, o, baseFn);
      list.forEach(function (b) { drawBuilding(S, x, b, rng, null); S.tops.push(b); });
      if (i === P.far.length - 1 && P.raffles) paintRaffles(S, x, P.raffles);
      if (!P.band) {
        vband(x, -m, W + 2 * m, (row.base - 0.14) * H, row.base * H + 6 * u, i === 0 ? "#7a3aa0" : "#5a3596", 0, 0.55);
        vband(x, -m, W + 2 * m, row.base * H + 6 * u, H + m, i === 0 ? "#7a3aa0" : "#5a3596", 0.55, 0.55);
      }
    });
  }

  function paintTerrain(S, x, baseFn, rng) {
    var W = S.W, H = S.H, m = S.m, u = S.u, step = 5 * u;
    x.beginPath();
    x.moveTo(-m, H + m);
    for (var px = -m; px <= W + m + step; px += step) x.lineTo(px, baseFn(px));
    x.lineTo(W + m, H + m);
    x.closePath();
    var g = x.createLinearGradient(0, S.P.mid.base * H - S.P.mid.hill * H, 0, H);
    g.addColorStop(0, "#1a1036"); g.addColorStop(1, "#0f0920");
    x.fillStyle = g;
    x.fill();
    // Hillside lanes and stairways, lit by warm street lamps.
    var n = Math.round(W / (52 * u));
    for (var i = 0; i < n; i++) {
      var lx = rng.range(-m, W + m), ly = baseFn(lx) + rng.range(3, 12) * u, steps = 4 + ((rng.next() * 7) | 0), dir = rng.chance(0.5) ? 1 : -1;
      for (var j = 0; j < steps; j++) {
        x.globalAlpha = rng.range(0.35, 0.8);
        x.fillStyle = rng.chance(0.8) ? "#ffcf8a" : "#ff9fe6";
        x.fillRect(lx, ly, 1.2 * u, 1.2 * u);
        lx += dir * rng.range(3, 7) * u; ly += rng.range(2, 5) * u;
      }
      if (rng.chance(0.5)) {
        x.globalAlpha = 0.85;
        x.fillStyle = "#130b28";
        var hw = rng.range(8, 18) * u, hh = rng.range(5, 10) * u, hx = lx - hw / 2, hy = baseFn(lx) + rng.range(2, 10) * u;
        x.fillRect(hx, hy, hw, hh);
        x.fillStyle = "#ffcf8a";
        for (var q = hx + 2 * u; q < hx + hw - 2 * u; q += 3.5 * u) if (rng.chance(0.45)) { x.globalAlpha = 0.7; x.fillRect(q, hy + 2 * u, 1.6 * u, 1.8 * u); }
      }
    }
    x.globalAlpha = 1;
  }

  function addOccl(S, layer, r) { S.occl[layer].push(r); }

  // Neon sign: register, and paint its unlit (dynamic) or lit (static) version into the static layer.
  var spriteCache = {}, spriteCacheN = 0;
  function cachedSign(spec, dpr, needOff, fontKey) {
    var key = spec.text + "|" + spec.color + "|" + Math.round(spec.size * 8) + "|" + (spec.vertical ? 1 : 0) + "|" + (spec.plate === false ? 0 : 1) + (spec.box ? "b" : "") + "|" + Math.round(dpr * 100) + "|" + (needOff ? 1 : 0) + "|" + fontKey;
    var hit = spriteCache[key];
    if (hit) return hit;
    if (spriteCacheN > 220) { spriteCache = {}; spriteCacheN = 0; }
    hit = spriteCache[key] = signSprites(spec, dpr, needOff);
    spriteCacheN++;
    return hit;
  }

  function addSign(S, x, spec, sx, sy, layerName, dynamic, extra) {
    var d = signDims(spec), u = S.u, id = S.signCount++;
    if (spec.size >= 15 * u) ellipseGlow(x, sx + d.iw / 2, sy + d.ih / 2, d.iw * 1.6 + 30 * u, d.ih * 0.9 + 26 * u, spec.color, spec.size >= 24 * u ? 0.2 : 0.13);
    var rec = {
      x: sx, y: sy, w: d.iw, h: d.ih, pad: d.pad, spec: spec, id: id + 1,
      flicker: dynamic && !(extra && extra.steady), glitch: hash(id * 3.7 + S.seed) < 0.45,
      broken: (extra && extra.broken != null) ? extra.broken : -1,
      period: 6 + hash(id * 1.9 + S.seed) * 13, burst: 0.25 + hash(id * 5.3 + S.seed) * 0.9, phase: hash(id * 7.1 + S.seed) * 20,
      delay: (extra && extra.delay != null) ? extra.delay : hash(id * 2.3 + S.seed) * 1.6
    };
    if (extra && extra.big) { rec.big = true; rec.bigIdx = S.bigN++; }
    if (S.fontsReady) {
      var sp = cachedSign(spec, S.dpr, dynamic, S.fontsExact ? "f" : "x");
      rec.on = sp.on; rec.off = sp.off; rec.cells = sp.cells;
      var s0 = dynamic ? sp.off : sp.on;
      x.drawImage(s0.c, sx - d.pad, sy - d.pad, s0.w, s0.h);
    }
    if (dynamic) (layerName === "dyn" ? S.signsDyn : S.signsFx).push(rec);
    S.signLog.push(spec.text + "@" + Math.round(sx) + "," + Math.round(sy));
    var r = { x: sx, y: sy, w: d.iw, h: d.ih };
    S.signRects.push(r);
    useWord(S, spec.text, sx + d.iw / 2);
    addOccl(S, layerName === "dyn" ? "mid" : "near", r);
    if (layerName === "fx" || sy > S.H * 0.55) S.refl.push({ x0: sx, x1: sx + d.iw, c: spec.color, s: Math.min(0.5, 0.12 + (d.iw * d.ih) / (2600 * u * u) * 0.12) });
    return rec;
  }

  function inQuiet(S, r) {
    var Q = S.P.quiet || [];
    for (var i = 0; i < Q.length; i++) {
      var q = Q[i];
      if (r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y) return q.keep;
    }
    return 1;
  }

  function signOk(S, r, occl) {
    if (r.x < -S.m * 0.5 || r.x + r.w > S.W + S.m * 0.5 || r.y < S.H * 0.06) return false;
    if (blockedBy(S, r, null)) return false;
    // Small hero signs never straddle the monorail (the train would pass in front of them).
    var T = S.mode === "hero" && S.P.track;
    if (T && r.y < T.y + 8 * S.u && r.y + r.h > T.y - 14 * S.u && r.x + r.w > T.x0) return false;
    if (hits(grow(r, 4 * S.u), S.signRects)) return false;
    if (occl && hits(r, occl)) return false;
    return true;
  }
  // Reds and ambers stay out of the zone around the cat's fire eyes.
  function signColor(S, c, sx, sy) {
    if (S.mode !== "hero" || (c !== PAL.red && c !== PAL.amber)) return c;
    var ct = S.catR;
    if (ct) return sx > ct.x - 90 * S.u && sx < ct.x + ct.w + 40 * S.u && sy > ct.y - 70 * S.u ? PAL.cyan : c;
    return sx > S.W * 0.6 && sy > S.H * 0.4 ? PAL.cyan : c;
  }

  // Small signs on procedural buildings: vertical tategaki signs protruding from a corner, rooftop billboards, square kanji plates.
  function paintRowSigns(S, x, list, rng, tier, layerName, chance) {
    var u = S.u, sc = S.signScale, bag = wordBag(S, S.P.pool, rng), bag1 = wordBag(S, POOL_1, rng);
    var sMin = tier >= 4 ? 13 : tier === 3 ? 11 : 9, sMax = tier >= 4 ? 19 : tier === 3 ? 15 : 12;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var roll = rng.next(), kind = rng.next(), size = rng.range(sMin, sMax) * u * sc, color = rng.pick(NEON), dyn = rng.chance(0.5) && tier >= 3, ty = rng.next(), side = rng.chance(0.5);
      if (roll > chance || b.base - b.top < 40 * u) continue;
      var txt = (kind < 0.82 ? bag : bag1).take(b.x + b.w / 2);
      if (!txt) continue;
      var spec, d, sx, sy;
      if (kind < 0.6) {
        spec = { text: txt, vertical: true, size: size, color: color };
        d = signDims(spec);
        sx = side ? b.x + b.w - d.iw * 0.3 : b.x - d.iw * 0.7;
        sy = b.top + 6 * u + ty * 0.3 * (b.base - b.top);
        if (sy + d.ih > Math.min(b.base, S.H) - 8 * u) continue;
      } else if (kind < 0.82) {
        if (b.roof === "slant" || b.roof === "pyramid") continue;
        spec = { text: txt, size: size * 0.8, color: color, box: ty > 0.55 };
        d = signDims(spec);
        if (d.iw > b.w * 1.3) continue;
        sx = b.x + (b.w - d.iw) / 2;
        sy = b.top - d.ih - 3 * u;
      } else {
        spec = { text: txt, size: size * 1.05, color: color };
        d = signDims(spec);
        if (d.iw > b.w * 0.9) continue;
        sx = b.x + (b.w - d.iw) / 2;
        sy = b.top + (8 + ty * 16) * u;
        if (sy + d.ih > b.base - 8 * u) continue;
      }
      var r = { x: sx, y: sy, w: d.iw, h: d.ih };
      if (!signOk(S, r, tier >= 4 ? S.occl.near : tier === 3 ? S.occl.mid : null)) continue;
      if (!wordFree(S, txt, sx + d.iw / 2)) continue;
      var keep = inQuiet(S, r);
      if (keep < 1 && hash(sx * 0.13 + sy * 0.07 + S.seed) > keep) continue;
      spec.color = signColor(S, spec.color, sx, sy);
      if (kind >= 0.6 && kind < 0.82) {
        x.fillStyle = "#0d0819";
        x.fillRect(sx + d.iw * 0.2, sy + d.ih, Math.max(0.8, u), b.top - sy - d.ih + 1);
        x.fillRect(sx + d.iw * 0.8, sy + d.ih, Math.max(0.8, u), b.top - sy - d.ih + 1);
      }
      addSign(S, x, spec, sx, sy, layerName, dyn);
    }
  }

  // A featured building at an absolute position (px).
  function paintFeatured(S, x, F, tier, rng, baseFn, layerName) {
    var u = S.u, base = baseFn(F.x + F.w / 2) + 6 * u;
    var b = makeBuilding(rng, F.x, F.w, F.top, base, tier);
    b.roof = F.roof || "flat"; b.style = F.style || "grid"; b.lit = F.lit == null ? 0.32 : F.lit; b.tone = F.tone || b.tone;
    b.outline = F.outline || null; b.noWindows = !!F.noWindows; b.r1 = 0.8; b.rim = F.rim || b.rim;
    drawBuilding(S, x, b, rng, null);
    addOccl(S, layerName === "dyn" ? "mid" : "near", { x: F.x, y: F.top - 50 * u, w: F.w, h: base - F.top + 50 * u });
    S.tops.push(b);
    return b;
  }

  function showStrip(S, w, h, phase) {
    var u = S.u, step = 3.2 * u, period = Math.max(step * 4, Math.round(h / step) * step);
    var cyc = [PAL.pink, PAL.violet, PAL.cyan, PAL.violet, PAL.pink];
    var spr = makeSprite(w, h + period, S.dpr, function (x, sw, sh) {
      for (var y = 0; y < sh; y += step) {
        var f = (((y % period) / period) + phase) % 1, fi = f * 4, i0 = Math.floor(fi), col = mix(cyc[i0], cyc[i0 + 1], fi - i0);
        x.fillStyle = col;
        x.globalAlpha = 0.22; x.fillRect(0, y - 0.7 * u, sw, 2.6 * u);
        x.globalAlpha = 0.95; x.fillRect(0, y, sw, Math.max(0.8, 1.05 * u));
      }
      x.globalAlpha = 1;
      x.globalCompositeOperation = "destination-out";
      for (var px = 3.5 * u; px < sw; px += 5.5 * u) x.fillRect(px, 0, Math.max(0.6, 0.7 * u), sh);
    });
    spr.period = period;
    return spr;
  }

  function addShow(S, b, layer, a, y0, y1) {
    var u = S.u, x0 = b.x + 2 * u, w = b.w - 4 * u, y = y0 != null ? y0 : b.top + 8 * u, h = Math.min(y1 != null ? y1 : b.base, S.H + S.m) - y;
    if (h < 20 * u || w < 8 * u) return;
    S.shows.push({ x: x0, y: y, w: w, h: h, layer: layer, a: a, speed: 16 * u, strip: showStrip(S, w, h, hash(b.x)) });
  }

  function addTicker(S, x, bx, by, bw, bh, layer, color) {
    var u = S.u;
    x.fillStyle = "#07040d";
    x.fillRect(bx - 1.2 * u, by - 1.2 * u, bw + 2.4 * u, bh + 2.4 * u);
    x.strokeStyle = rgba(color, 0.55); x.lineWidth = Math.max(0.6, 0.6 * u);
    x.strokeRect(bx - 1.2 * u, by - 1.2 * u, bw + 2.4 * u, bh + 2.4 * u);
    addOccl(S, layer === "dyn" ? "mid" : "near", { x: bx, y: by, w: bw, h: bh });
    if (!S.fontsReady) return;
    var fs = bh * 0.8, font = fs + "px " + FONT_DOT, tw = measureText(font, TICKER).width + fs;
    var strip = makeSprite(tw, bh, S.dpr, function (c, w, h, k) {
      c.font = font; c.textBaseline = "middle"; c.textAlign = "left";
      c.fillStyle = color;
      c.globalAlpha = 0.35;
      c.fillText(TICKER, fs * 0.5 - 0.6, h / 2 + fs * 0.06);
      c.fillText(TICKER, fs * 0.5 + 0.6, h / 2 + fs * 0.06);
      c.globalAlpha = 1;
      c.fillStyle = mix(color, "#ffffff", 0.35);
      c.fillText(TICKER, fs * 0.5, h / 2 + fs * 0.06);
    });
    var grid = makeSprite(bw, bh, S.dpr, function (c, w, h) {
      c.fillStyle = "rgba(5,3,10,0.55)";
      var st = Math.max(1.2, 1.25 * u);
      for (var gx = 0; gx < w; gx += st) c.fillRect(gx, 0, Math.max(0.4, st * 0.32), h);
      for (var gy = 0; gy < h; gy += st) c.fillRect(0, gy, w, Math.max(0.4, st * 0.32));
    });
    S.tickers.push({ x: bx, y: by, w: bw, h: bh, layer: layer, strip: strip, grid: grid, speed: 30 * u });
  }

  // Chongqing's whole-facade LED shows on a couple of visible towers, and coloured floodlight washes on a few more.
  function dressFacades(S, x, list, P, rng) {
    var u = S.u, W = S.W, riverY = P.river ? P.river * S.H : S.H, cands = [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i], top = b.top + 8 * u, bot = Math.min(b.base, riverY - 6 * u);
      if (b.w < 22 * u || bot - top < 60 * u) continue;
      var r = { x: b.x, y: top, w: b.w, h: bot - top };
      if (inQuiet(S, r) < 1 || blockedBy(S, { x: r.x, y: r.y, w: r.w, h: Math.min(r.h, 90 * u) }, null)) continue;
      cands.push({ b: b, r: r, s: r.h * (0.6 + rng.next() * 0.8) });
    }
    cands.sort(function (a, c) { return c.s - a.s; });
    var picked = [];
    for (var k = 0; k < cands.length && picked.length < (P.shows || 0); k++) {
      var c = cands[k], close = false;
      for (var q = 0; q < picked.length; q++) if (Math.abs(picked[q].b.x - c.b.x) < 110 * u) close = true;
      if (close) continue;
      picked.push(c); c.used = true;
      addShow(S, c.b, "dyn", 0.5, c.r.y, c.r.y + c.r.h);
    }
    var cols = [PAL.cyan, PAL.lime, PAL.amber, PAL.cyan, PAL.lime], nw = 0;
    x.save();
    x.globalCompositeOperation = "lighter";
    for (k = cands.length - 1; k >= 0 && nw < (P.washes || 0); k--) {
      c = cands[k];
      if (c.used) continue;
      var col = cols[nw % cols.length];
      if (col === PAL.amber && c.b.x > W * 0.55) col = PAL.cyan;
      vband(x, c.b.x, c.b.w, c.r.y + c.r.h * 0.3, c.r.y + c.r.h, col, 0, 0.3);
      x.globalAlpha = 0.7; x.fillStyle = col; x.fillRect(c.b.x, c.r.y + c.r.h - Math.max(0.8, u), c.b.w, Math.max(0.8, u)); x.globalAlpha = 1;
      nw++;
    }
    x.restore();
  }

  // The tunnel the monorail runs out of: a concrete headwall with a lit arch in a dark hillside.
  function paintPortal(S, x, hx, ty, bh, baseFn, rng) {
    var u = S.u, hr = 70 * u;
    x.beginPath();
    x.moveTo(hx - hr * 1.7, baseFn(hx - hr * 1.7) + 12 * u);
    x.quadraticCurveTo(hx - hr * 0.9, ty - 62 * u, hx - 4 * u, ty - 33 * u);
    x.quadraticCurveTo(hx + 22 * u, ty - 22 * u, hx + 30 * u, baseFn(hx + 30 * u) + 12 * u);
    x.closePath();
    var hg = x.createLinearGradient(0, ty - 60 * u, 0, ty + 60 * u);
    hg.addColorStop(0, "#241843"); hg.addColorStop(1, "#120b26");
    x.fillStyle = hg; x.fill();
    for (var q = 0; q < 14; q++) {
      x.globalAlpha = rng.range(0.4, 0.8); x.fillStyle = "#ffcf8a";
      x.fillRect(hx - 14 * u - rng.range(0, hr * 1.2), ty - rng.range(-22, 36) * u, 1.1 * u, 1.1 * u);
    }
    x.globalAlpha = 1;
    var aw = 17 * u, ah = 23 * u, ax = hx - 3 * u, ab = ty + bh, at = ab - ah;
    var wx0 = ax - 8 * u, wx1 = ax + aw + 5 * u, wy0 = at - 8 * u;
    x.fillStyle = "#2b2348"; x.fillRect(wx0, wy0, wx1 - wx0, ab + 5 * u - wy0);
    x.fillStyle = "rgba(10,6,22,0.4)";
    for (var py = wy0 + 6 * u; py < ab + 4 * u; py += 6 * u) x.fillRect(wx0, py, wx1 - wx0, Math.max(0.5, 0.45 * u));
    x.fillStyle = "#62559a"; x.fillRect(wx0 - 1.5 * u, wy0 - 2.2 * u, wx1 - wx0 + 3 * u, 2.4 * u);
    function arch(c) { c.beginPath(); c.moveTo(ax, ab); c.lineTo(ax, at + aw / 2); c.arc(ax + aw / 2, at + aw / 2, aw / 2, Math.PI, 0); c.lineTo(ax + aw, ab); }
    arch(x); x.closePath();
    x.fillStyle = "#0a0614"; x.fill();
    x.save(); arch(x); x.closePath(); x.clip();
    ellipseGlow(x, ax + aw * 0.45, ab - ah * 0.3, aw * 0.75, ah * 0.6, "#ffb86a", 0.55);
    x.fillStyle = "#3b3166"; x.fillRect(ax, ty, aw, bh);
    x.fillStyle = "#ffe3b0"; x.fillRect(ax + aw * 0.3, at + aw * 0.28, aw * 0.4, Math.max(0.7, 0.8 * u));
    x.restore();
    arch(x);
    glowStroke(x, null, PAL.cyan, Math.max(0.7, 0.8 * u), mix(PAL.cyan, "#ffffff", 0.5));
    var lamp = S.lampSpr;
    x.drawImage(lamp.c, wx0 + 3 * u - lamp.w * 0.4, wy0 + 4 * u - lamp.h * 0.4, lamp.w * 0.8, lamp.h * 0.8);
    x.drawImage(lamp.c, wx1 - 2 * u - lamp.w * 0.4, wy0 + 4 * u - lamp.h * 0.4, lamp.w * 0.8, lamp.h * 0.8);
    addOccl(S, "mid", { x: hx - hr * 1.7, y: ty - 64 * u, w: hr * 1.7 + 40 * u, h: 124 * u });
    S.trackClip = ax + aw * 0.3;
    // The right jamb is redrawn over the train as it leaves, so the train comes out of the arch.
    var jx = ax + aw - 0.5 * u, jy = at - 3 * u, jw = wx1 - jx + 1 * u, jh = ab - jy + 2 * u;
    S.occluders.push({ spr: grab(S, x.canvas, jx, jy, jw, jh), x: jx, y: jy, x0: jx - 30 * u, x1: jx + jw });
  }

  // Copy a region of a static layer into a sprite (used to redraw scenery over the train).
  function grab(S, src, rx, ry, rw, rh) {
    var spr = makeSprite(rw, rh, S.dpr, function () {});
    spr.c.getContext("2d").drawImage(src, Math.round((rx + S.m) * S.k), Math.round((ry + S.m) * S.k), spr.c.width, spr.c.height, 0, 0, spr.c.width, spr.c.height);
    return spr;
  }

  // Liziba: the residential slab the monorail runs straight through, with a two-storey station opening.
  function paintLiziba(S, x, Lz, ty, bh, baseFn, rng) {
    var u = S.u, lt = Lz.top, lb = baseFn(Lz.x + Lz.w / 2) + 10 * u, yMax = Math.min(lb, S.H + S.m);
    var b = makeBuilding(rng, Lz.x, Lz.w, lt, lb, 3);
    b.roof = "flat"; b.style = "res"; b.tone = "warm"; b.lit = 0.55; b.outline = null; b.r1 = 0.2; b.r3 = 0.6;
    drawBuilding(S, x, b, rng, null);
    S.tops.push(b);
    x.fillStyle = "rgba(160,138,222,0.3)";
    x.beginPath();
    for (var y = lt + 4 * u; y < yMax; y += 6.4 * u) x.rect(Lz.x + u, y, Lz.w - 2 * u, Math.max(0.6, 0.6 * u));
    for (var vx = Lz.x + 12 * u; vx < Lz.x + Lz.w - 4 * u; vx += 13 * u) x.rect(vx, lt + 4 * u, Math.max(0.6, 0.55 * u), yMax - lt - 4 * u);
    x.fill();
    var oy0 = ty - 15 * u, oy1 = ty + bh + 3 * u;
    x.fillStyle = "#07040e"; x.fillRect(Lz.x, oy0, Lz.w, oy1 - oy0);
    vband(x, Lz.x, Lz.w, oy0, oy1, PAL.cyan, 0.05, 0.2);
    x.fillStyle = "#56468c";
    x.fillRect(Lz.x - 1.5 * u, oy0 - 2.2 * u, Lz.w + 3 * u, 2.2 * u);
    x.fillRect(Lz.x - 1.5 * u, oy1, Lz.w + 3 * u, 2.4 * u);
    x.fillStyle = "#c8f8ff";
    for (var sx = Lz.x + 4 * u; sx < Lz.x + Lz.w - 5 * u; sx += 7 * u) x.fillRect(sx, oy0 + 1.4 * u, 3.6 * u, Math.max(0.6, 0.9 * u));
    x.fillStyle = "#3b3166"; x.fillRect(Lz.x, ty, Lz.w, bh);
    glowRect(x, Lz.x - 7 * u, oy1 - 0.5 * u, 15 * u, Math.max(0.8, 0.9 * u), PAL.cyan, 2.4 * u, 0.95);
    glowRect(x, Lz.x, oy0, Math.max(0.8, 0.9 * u), oy1 - oy0, PAL.cyan, 2 * u, 0.8);
    glowRect(x, Lz.x + Lz.w - Math.max(0.8, 0.9 * u), oy0, Math.max(0.8, 0.9 * u), oy1 - oy0, PAL.cyan, 2 * u, 0.8);
    glowRect(x, Lz.x + Lz.w - 8 * u, oy1 - 0.5 * u, 15 * u, Math.max(0.8, 0.9 * u), PAL.cyan, 2.4 * u, 0.95);
    addOccl(S, "mid", { x: Lz.x, y: lt - 4 * u, w: Lz.w, h: lb - lt });
    var ox = Lz.x - 1, oy = oy0 - 3 * u, ow = Lz.w + 2, oh = oy1 + 3 * u - oy;
    S.liziba = {
      x: Lz.x, w: Lz.w, occ: grab(S, x.canvas, ox, oy, ow, oh), ox: ox, oy: oy, oy0: oy0, oy1: oy1,
      glow: makeSprite(Lz.w + 40 * u, 34 * u, S.dpr, function (c, w, h) { ellipseGlow(c, w / 2, h / 2, w / 2, h / 2, "#78f0ff", 0.6); }), gy: ty - 20 * u
    };
    if (Lz.sign) {
      var sp = Lz.sign.spec, d = signDims(sp), lsx = Lz.sign.sx, lsy = Lz.sign.sy;
      var p0 = Math.max(lsx + d.iw * 0.18, Lz.x + 3 * u), p1 = Math.min(lsx + d.iw * 0.82, Lz.x + Lz.w - 4 * u);
      x.fillStyle = "#0d0819";
      if (p1 > p0 && lt > lsy + d.ih) {
        x.fillRect(p0, lsy + d.ih, Math.max(1, u), lt - lsy - d.ih + 1);
        x.fillRect(p1, lsy + d.ih, Math.max(1, u), lt - lsy - d.ih + 1);
      }
      S.pendingSigns.push([sp, lsx, lsy, { delay: 0.8, big: true }]);
    }
    if (Lz.ticker && Lz.w > 50 * u) addTicker(S, x, Lz.x + 4 * u, lt + 6 * u, Lz.w - 8 * u, 9 * u * S.signScale, "dyn", PAL.amber);
  }

  function paintMid(S, x, P, rng) {
    var W = S.W, H = S.H, m = S.m, u = S.u, M = P.mid;
    var baseFn = S.midBase = function (px) { return (M.base - M.hill * Math.pow(noise1(px / (W * 0.17) + 2.3, 21), 1.5)) * H; };
    var midList = [];
    M.rows.forEach(function (row, i) {
      var o = { tier: row.tier, x0: -m / W - 0.01, x1: 1 + m / W + 0.01, high: row.high, low: row.low, wMin: row.wMin, wMax: row.wMax, gMin: row.gMin, gMax: row.gMax, peaks: row.peaks || S.bandPeaks, envBase: row.envBase };
      var list = fillRow(S, rng, o, function (px) { return baseFn(px) + 10 * u; });
      var collect = row.tier === 3 ? S.twkMid : null;
      list.forEach(function (b) { drawBuilding(S, x, b, rng, collect); S.tops.push(b); midList.push(b); });
      if (row.tier === 2) {
        paintRowSigns(S, x, list, rng, 2, "dyn", P.band ? 0.12 : 0.14);
        vband(x, -m, W + 2 * m, (M.base - 0.2) * H, M.base * H, "#3d2370", 0, 0.42);
      }
    });
    var t3 = midList.filter(function (b) { return b.tier === 3; });
    dressFacades(S, x, t3, P, rng);

    var A = null;
    if (P.featA) A = paintFeatured(S, x, { x: P.featA.x, w: P.featA.w, top: P.featA.top, roof: "spire", style: "cols", lit: 0.22, tone: "violet", outline: PAL.pink, rim: PAL.pink }, 3, rng, baseFn, "dyn");
    if (P.band) {
      // Featured mid signs at intervals across the strip; two of them larger so the band reads at a glance.
      var every = P.signsEvery * u, k = 0, n = Math.floor(W / every), big1 = 1, big2 = Math.max(2, Math.floor(n / 2) + 1), bag = wordBag(S, P.pool, rng);
      for (var fx = every * 0.5; fx < W; fx += every, k++) {
        var cand = null, best = 1e9;
        for (var q = 0; q < midList.length; q++) {
          var mb = midList[q];
          if (mb.tier !== 3) continue;
          var dd = Math.abs(mb.x + mb.w / 2 - fx);
          if (dd < best && mb.base - mb.top > 60 * u) { best = dd; cand = mb; }
        }
        if (!cand) continue;
        var txt = bag.take(fx);
        if (!txt) continue;
        var big = k === big1 || k === big2;
        var spec = { text: txt, vertical: true, size: big ? Math.max(16, 14.5 * u) : rng.range(10, 13) * u, color: NEON[(k * 4 + 1) % NEON.length] };
        var dm = signDims(spec), sx = cand.x + cand.w - dm.iw * 0.35, sy = cand.top + 5 * u;
        var rr = { x: sx, y: sy, w: dm.iw, h: dm.ih };
        if (!signOk(S, rr, S.occl.mid)) continue;
        addSign(S, x, spec, sx, sy, "dyn", true);
        S.keepouts.push({ x0: sx - 4 * u, x1: sx + dm.iw + 4 * u, y: sy + dm.ih * 0.8, tier: 4 });
      }
    }

    paintTerrain(S, x, baseFn, rng);

    // Monorail: lit pillars, the beam with its LED underline, the tunnel portal and the Liziba slab it passes through.
    if (P.track) {
      var ty = P.track.y, tx0 = P.track.x0 >= 0 ? P.track.x0 : -m - 4, bh = 5.8 * u, Lz = P.liziba, lamp = S.lampSpr;
      for (var px = tx0 + 46 * u; px < W + m; px += 92 * u) {
        if (Lz && px > Lz.x - 10 * u && px < Lz.x + Lz.w + 10 * u) continue;
        var pb = Math.min(baseFn(px) + 14 * u, H + m), pw = 4.6 * u, rim = Math.max(0.7, 0.7 * u);
        x.fillStyle = "#3a2f5e"; x.fillRect(px - pw / 2, ty + bh, pw, pb - ty - bh);
        x.fillStyle = rgba(PAL.violet, 0.7); x.fillRect(px + pw / 2 - rim, ty + bh, rim, pb - ty - bh);
        x.fillStyle = "#7d6fb4"; x.fillRect(px - 6 * u, ty + bh, 12 * u, 2.4 * u);
        x.drawImage(lamp.c, px - lamp.w * 0.35, ty + bh + 7 * u - lamp.h * 0.35, lamp.w * 0.7, lamp.h * 0.7);
      }
      x.fillStyle = "#3b3166"; x.fillRect(tx0, ty, W + m - tx0, bh);
      x.fillStyle = "#8a7cc4"; x.fillRect(tx0, ty, W + m - tx0, Math.max(0.8, 0.9 * u));
      glowRect(x, tx0, ty + bh - 0.8 * u, W + m - tx0, Math.max(0.7, 0.8 * u), PAL.cyan, 2.4 * u, 0.8);
      addOccl(S, "mid", { x: tx0, y: ty - 14 * u, w: W + 2 * m, h: bh + 16 * u });
      S.trackClip = -1e9;
      if (P.track.x0 >= 0) paintPortal(S, x, tx0, ty, bh, baseFn, rng);
      if (Lz) paintLiziba(S, x, Lz, ty, bh, baseFn, rng);
    }

    S.pendingSigns.forEach(function (ps) { addSign(S, x, ps[0], ps[1], ps[2], "dyn", true, ps[3]); });
    S.pendingSigns.length = 0;
    if (A && P.featA.spec) {
      var F = P.featA, da = signDims(F.spec), ax = F.sx, ay = F.sy;
      addSign(S, x, F.spec, ax, ay, "dyn", true, { delay: 0.35, broken: 2, big: true });
      S.keepouts.push({ x0: ax - 6 * u, x1: ax + da.iw + 6 * u, y: ay + da.ih + 6 * u, tier: 4 });
      x.fillStyle = "#0d0819";
      var bl = Math.min(ax + da.iw, A.x) - 1, bw = Math.abs(A.x - (ax + da.iw)) + 2;
      x.fillRect(bl, ay + 10 * u, bw, 2 * u);
      x.fillRect(bl, ay + da.ih - 14 * u, bw, 2 * u);
    }
    paintRowSigns(S, x, t3, rng, 3, "dyn", P.band ? 0.24 : 0.3);

    if (!P.band) vband(x, -m, W + 2 * m, (M.base - 0.05) * H, H + m, "#120a26", 0, 0.75);
  }

  // Dark tiled roof with upturned corners. Its golden LED edge goes into `gold` (one stroke per complex).
  function paintEave(S, x, a, b, y, rh, gold) {
    var u = S.u, lift = Math.min(rh * 0.7, 3.4 * u), ins = rh * 1.15, ov = lift * 2.6;
    x.beginPath();
    x.moveTo(a - lift * 0.5, y - lift * 1.05);
    x.quadraticCurveTo(a + lift * 0.4, y + lift * 0.1, a + ov, y);
    x.lineTo(b - ov, y);
    x.quadraticCurveTo(b - lift * 0.4, y + lift * 0.1, b + lift * 0.5, y - lift * 1.05);
    x.lineTo(b - ins, y - rh);
    x.lineTo(a + ins, y - rh);
    x.closePath();
    var g = x.createLinearGradient(0, y - rh, 0, y);
    g.addColorStop(0, "#3a2433"); g.addColorStop(0.5, "#22131d"); g.addColorStop(1, "#10080d");
    x.fillStyle = g;
    x.fill();
    x.fillStyle = "#4a2d3c";
    x.fillRect(a + ins - u, y - rh - 0.7 * u, b - a - 2 * ins + 2 * u, Math.max(0.7, 1.1 * u));
    if (gold) {
      gold.moveTo(a - lift * 0.5, y - lift * 1.05);
      gold.quadraticCurveTo(a + lift * 0.4, y + lift * 0.1, a + ov, y);
      gold.lineTo(b - ov, y);
      gold.quadraticCurveTo(b - lift * 0.4, y + lift * 0.1, b + lift * 0.5, y - lift * 1.05);
    }
  }

  // One stilted hall bay: timber wall with warm lattice windows, a lit balcony rail, an eave and red lanterns.
  function paintHouse(S, x, hx, yb, hw, fh, rng, ls, gold) {
    var u = S.u, wallH = fh * 0.64, wy = yb - wallH, roofH = fh - wallH, kind = rng.next(), inner = wallH - 1.8 * u;
    x.fillStyle = "#170a08";
    x.fillRect(hx - 1.5 * u, yb - 1.9 * u, hw + 3 * u, 2.3 * u);
    x.fillStyle = kind < 0.92 ? "#5a2a10" : "#2a120a";
    x.fillRect(hx, wy, hw, inner);
    if (kind < 0.92) {
      var shop = kind < 0.4;
      var pw = (shop ? rng.range(9, 16) : rng.range(5, 8)) * u, gap = (shop ? 1.2 : rng.range(1.4, 2.4)) * u;
      var ph = inner * (shop ? 0.86 : 0.7), py = wy + inner * (shop ? 0.07 : 0.15);
      var n = Math.max(1, Math.floor((hw - 3 * u + gap) / (pw + gap))), used = n * pw + (n - 1) * gap, ox = hx + (hw - used) / 2;
      var g = x.createLinearGradient(0, py, 0, py + ph);
      g.addColorStop(0, "#ffe9b4"); g.addColorStop(0.5, "#ffc061"); g.addColorStop(1, "#f2892a");
      x.fillStyle = g;
      x.beginPath();
      for (var i = 0; i < n; i++) if (rng.next() < (shop ? 0.97 : 0.88)) x.rect(ox + i * (pw + gap), py, pw, ph);
      x.fill();
      x.fillStyle = "rgba(84,32,8,0.5)";
      x.beginPath();
      for (var j = 0; j < n; j++) {
        var qx = ox + j * (pw + gap);
        x.rect(qx + pw / 2 - 0.3 * u, py, Math.max(0.5, 0.6 * u), ph);
        x.rect(qx, py + ph * 0.48, pw, Math.max(0.5, 0.6 * u));
      }
      x.fill();
    }
    x.fillStyle = "#ffd27a";
    x.globalAlpha = 0.85;
    x.fillRect(hx - u, yb - 2.5 * u, hw + 2 * u, Math.max(0.6, 0.6 * u));
    x.globalAlpha = 1;
    paintEave(S, x, hx - 3.5 * u, hx + hw + 3.5 * u, wy, roofH, gold);
    var spacing = rng.range(10, 15) * u;
    for (var lx = hx + spacing * 0.55; lx < hx + hw - 2 * u; lx += spacing) {
      if (rng.chance(0.72)) S.lanterns.push({ x: lx, y: wy + 0.3 * u, s: ls, ph: rng.next() * 6.28, w: 1 + rng.next() * 0.9, amp: 0.05 + rng.next() * 0.06, fl: rng.next() * 10 });
    }
  }

  // Hongyadong: stilted timber halls stacked up a riverside stone cliff, glowing gold with rows of red lanterns.
  function paintHongyadong(S, x, Hg, rng) {
    var W = S.W, H = S.H, u = S.u;
    var x0 = Hg.x0 * W, x1 = Hg.x1 * W, top = Hg.top * H, bot = Hg.bot * H, floors = Hg.floors;
    var stilt = (bot - top) * 0.13, fh = (bot - top - stilt) / (floors + 0.3), cx0 = x0 - 14 * u, cx1 = x1 + 14 * u;
    var gold = typeof Path2D === "function" ? new Path2D() : null;
    ellipseGlow(x, (x0 + x1) / 2, top + (bot - top) * 0.55, (x1 - x0) * 0.8, (bot - top) * 0.8, PAL.amber, 0.26);
    function cliffY(px) { var e = Math.abs((px - (x0 + x1) / 2) / ((x1 - x0) / 2 + 14 * u)); return top + fh * 0.2 + noise1(px / (14 * u), 4) * fh * 0.9 + Math.pow(e, 2.2) * (bot - top) * 0.45; }
    // Stone cliff: retaining-wall courses lit warm from below, a violet rim along its crest.
    x.beginPath();
    x.moveTo(cx0, bot);
    for (var px = cx0; px <= cx1; px += 5 * u) x.lineTo(px, cliffY(px));
    x.lineTo(cx1, cliffY(cx1));
    x.lineTo(cx1, bot);
    x.closePath();
    var cg = x.createLinearGradient(0, top, 0, bot);
    cg.addColorStop(0, "#1e1530"); cg.addColorStop(0.6, "#2a1c2e"); cg.addColorStop(1, "#3a2318");
    x.fillStyle = cg;
    x.fill();
    x.save();
    x.clip();
    var course = 4.4 * u, row = 0;
    x.fillStyle = "rgba(255,190,120,0.16)";
    x.beginPath();
    for (var cy = top; cy < bot; cy += course, row++) {
      x.rect(cx0, cy, cx1 - cx0, Math.max(0.5, 0.5 * u));
      for (var jx = cx0 + (row % 2) * 5.5 * u; jx < cx1; jx += 11 * u) x.rect(jx, cy, Math.max(0.5, 0.45 * u), course);
    }
    x.fill();
    vband(x, cx0, cx1 - cx0, top, bot, PAL.amber, 0, 0.2);
    x.restore();
    // Zig-zag stairs with lamps climbing the cliff at both ends.
    var lamp = S.lampSpr;
    [cx0 + 6 * u, cx1 - 6 * u].forEach(function (sx0, side) {
      var dir = side ? -1 : 1, sy = bot - stilt, sx = sx0, top2 = cliffY(sx0) + 4 * u, k = 0;
      x.beginPath(); x.moveTo(sx, sy);
      while (sy > top2 && k < 12) {
        sx += dir * (k % 2 ? -7 : 7) * u; sy -= 6 * u; x.lineTo(sx, sy); k++;
        if (k % 2) x.drawImage(lamp.c, sx - lamp.w * 0.3, sy - lamp.h * 0.3, lamp.w * 0.6, lamp.h * 0.6);
      }
      x.strokeStyle = "rgba(150,110,80,0.7)"; x.lineWidth = Math.max(0.6, 0.8 * u); x.stroke();
    });
    x.beginPath();
    for (var rp = cx0; rp <= cx1; rp += 5 * u) { if (rp === cx0) x.moveTo(rp, cliffY(rp)); else x.lineTo(rp, cliffY(rp)); }
    glowStroke(x, null, rgba(PAL.violet, 0.55), Math.max(0.6, 0.7 * u), null);
    // Timber stilts and cross braces under the lowest tier, down to the water.
    x.fillStyle = "#5a3420";
    var braces = new Path2D(), prev = null;
    for (var sx2 = x0 + 3 * u; sx2 < x1 - 2 * u; sx2 += (6.5 + hash(sx2) * 4) * u) {
      x.fillRect(sx2, bot - stilt - 2 * u, 1.9 * u, stilt + 2 * u);
      if (prev !== null) { braces.moveTo(prev + 0.9 * u, bot - stilt * 0.15); braces.lineTo(sx2 + 0.9 * u, bot - stilt * 0.85); }
      prev = sx2;
    }
    x.strokeStyle = "rgba(128,76,44,0.9)";
    x.lineWidth = Math.max(0.5, 0.7 * u);
    x.stroke(braces);
    vband(x, x0, x1 - x0, bot - stilt, bot, PAL.amber, 0.28, 0.05);
    var ls = Hg.ls || 0, topL = x0, topR = x1, topY = top;
    var nb = (x1 - x0) > 190 * u ? 3 : (x1 - x0) > 110 * u ? 2 : 1, cuts = [x0];
    for (var ci = 1; ci < nb; ci++) cuts.push(lerp(x0, x1, ci / nb + rng.range(-0.05, 0.05)));
    cuts.push(x1);
    var tallest = nb === 3 ? 1 : 0, order = [];
    for (var oi = 0; oi < nb; oi++) if (oi !== tallest) order.push(oi);
    order.push(tallest);
    order.forEach(function (bi) {
      var L = cuts[bi] + (bi > 0 ? 1.5 * u : 0), R = cuts[bi + 1] - (bi < nb - 1 ? 1.5 * u : 0);
      var bf = bi === tallest ? floors : Math.max(2, floors - 1 - ((rng.next() * 3) | 0));
      var bfh = bi === tallest ? fh : fh * rng.range(0.9, 1.04);
      for (var f = 0; f < bf; f++) {
        var yb = bot - stilt - f * bfh;
        if (f > 0) {
          L += (bi === 0 ? rng.range(1, 8) : rng.range(-1, 3)) * u;
          R -= (bi === nb - 1 ? rng.range(1, 8) : rng.range(-1, 3)) * u;
        }
        if (R - L < 30 * u) break;
        var hx = L;
        while (hx < R - 6 * u) {
          var hw = Math.min(rng.range(34, 70) * u, R - hx);
          if (R - hx - hw < 14 * u) hw = R - hx;
          paintHouse(S, x, hx + rng.range(-1, 1) * u, yb, hw, bfh, rng, ls, gold);
          hx += hw + rng.range(0.5, 2) * u;
        }
        if (bi === tallest) { topL = L; topR = R; topY = yb - bfh; }
      }
    });
    var span = topR - topL, nPav = span > 150 * u ? 2 : 1;
    for (var p = 0; p < nPav; p++) {
      var pw = Math.min(span * (p === 0 ? 0.42 : 0.24), (p === 0 ? 90 : 46) * u), ph = fh * (p === 0 ? 0.95 : 0.8);
      var pc = p === 0 ? lerp(topL + pw / 2, topR - pw / 2, rng.range(0.35, 0.65)) : (rng.chance(0.5) ? topL + pw * 0.7 : topR - pw * 0.7);
      paintHouse(S, x, pc - pw / 2, topY, pw, ph, rng, ls, gold);
      if (p === 0) paintEave(S, x, pc - pw * 0.32, pc + pw * 0.32, topY - ph - 0.5 * u, fh * 0.32, gold);
    }
    if (gold) {
      x.lineCap = "round";
      glowStroke(x, gold, "#ffb547", Math.max(0.7, 0.95 * u), "#fff0c8");
      x.lineCap = "butt";
    }
    S.refl.push({ x0: x0 + 6 * u, x1: x1 - 6 * u, c: PAL.amber, s: 0.9 });
    S.refl.push({ x0: lerp(x0, x1, 0.25), x1: lerp(x0, x1, 0.6), c: "#ff6a3d", s: 0.45 });
    addOccl(S, "near", { x: x0 - 14 * u, y: topY - fh * 1.3, w: x1 - x0 + 28 * u, h: bot - topY + fh * 1.3 });
    if (Hg.sign) {
      var sp = { text: Hg.sign.text, vertical: true, size: Hg.sign.size, color: Hg.sign.color, box: !!Hg.sign.box };
      // Preferred spot first, then along the halls (right to left, two heights) clear of page content and other signs.
      var d = signDims(sp), syy = bot - stilt - fh * 1.2 - d.ih, taken = S.signRects.slice(), Nk = S.P.neko;
      if (Nk) { var nkd = signDims(Nk.spec); taken.push({ x: Nk.sx, y: Nk.sy, w: nkd.iw, h: nkd.ih }); }
      var cx = [Hg.signX];
      for (var qx = x1 - 20 * u; qx > x0 + 14 * u; qx -= 9 * u) cx.push(qx);
      [syy, syy + fh * 0.7].some(function (yy) {
        return cx.some(function (c) {
          var r = { x: c - d.iw / 2, y: yy, w: d.iw, h: d.ih };
          if (r.x < 4 || r.x + r.w > S.W - 4 || blockedBy(S, r, null) || hits(grow(r, 12 * u), taken)) return false;
          addSign(S, x, sp, r.x, r.y, "fx", true, { delay: 1.1, steady: true });
          return true;
        });
      });
    }
  }

  // Five-storey pagoda silhouette with gold eaves and lanterns (the band's second waterfront landmark).
  function paintPagoda(S, x, hs, rng) {
    var W = S.W, H = S.H, u = S.u, cx = (hs[0] + hs[1]) / 2 * W, base = H + 2 * u, tiers = 5;
    var w0 = Math.max(46 * u, (hs[1] - hs[0]) * W), th = (H * 0.6) / (tiers + 1.4);
    var gold = typeof Path2D === "function" ? new Path2D() : null;
    ellipseGlow(x, cx, base - th * 2.6, w0 * 1.15, th * 3.6, PAL.amber, 0.24);
    x.fillStyle = "#1a0d14"; x.fillRect(cx - w0 * 0.62, base - th * 0.5, w0 * 1.24, th * 0.5 + 2);
    var y = base - th * 0.5;
    for (var i = 0; i < tiers; i++) {
      var w = w0 * (1 - i * 0.13), h = th * (i === 0 ? 1.05 : 0.9), wallTop = y - h * 0.6;
      x.fillStyle = "#3a1414"; x.fillRect(cx - w * 0.36, wallTop, w * 0.72, h * 0.6);
      var g = x.createLinearGradient(0, wallTop, 0, y);
      g.addColorStop(0, "#ffe9b4"); g.addColorStop(1, "#f2892a");
      x.fillStyle = g;
      var nwin = Math.max(2, Math.round(w / (9 * u))), ww = (w * 0.6) / nwin;
      for (var k = 0; k < nwin; k++) if (rng.next() < 0.85) x.fillRect(cx - w * 0.3 + k * ww + ww * 0.18, wallTop + h * 0.12, ww * 0.64, h * 0.36);
      paintEave(S, x, cx - w / 2, cx + w / 2, wallTop, h * 0.4, gold);
      S.lanterns.push({ x: cx - w * 0.44, y: wallTop + 0.3 * u, s: 1, ph: rng.next() * 6.28, w: 1.2, amp: 0.06, fl: rng.next() * 10 });
      S.lanterns.push({ x: cx + w * 0.44, y: wallTop + 0.3 * u, s: 1, ph: rng.next() * 6.28, w: 1.1, amp: 0.06, fl: rng.next() * 10 });
      y -= h;
    }
    x.fillStyle = "#2a1414"; x.fillRect(cx - 0.8 * u, y - th * 1.1, 1.6 * u, th * 1.1 + 1);
    for (var r = 0; r < 4; r++) glowRect(x, cx - 2.2 * u, y - th * 0.25 - r * th * 0.2, 4.4 * u, Math.max(0.7, 0.8 * u), "#ffb547", 1.4 * u, 0.9);
    if (gold) { x.lineCap = "round"; glowStroke(x, gold, "#ffb547", Math.max(0.7, 0.95 * u), "#fff0c8"); x.lineCap = "butt"; }
    addOccl(S, "near", { x: cx - w0 * 0.65, y: y - th * 1.2, w: w0 * 1.3, h: base - y + th * 1.2 });
  }

  function paintBridge(S, x, B) {
    var W = S.W, H = S.H, u = S.u, m = S.m;
    var x0 = B.x0 * W, x1 = B.x1 * W, deck = B.deck * H, top = B.top * H, river = S.P.river * H;
    var t1 = lerp(x0, x1, B.towers[0]), t2 = lerp(x0, x1, B.towers[1]);
    function cableY(px) {
      var sag = deck - 6 * u, ty0 = top + 3 * u;
      if (px <= t1) { var f = (px - x0) / (t1 - x0); return lerp(deck - 2 * u, ty0, f * f); }
      if (px >= t2) { var f2 = (x1 - px) / (x1 - t2); return lerp(deck - 2 * u, ty0, f2 * f2); }
      var c = (t1 + t2) / 2, hspan = (t2 - t1) / 2, q = (px - c) / hspan;
      return lerp(sag, ty0, q * q);
    }
    function cable(c) {
      c.beginPath();
      c.moveTo(x0, cableY(x0));
      for (var p2 = x0; p2 <= x1; p2 += 4 * u) c.lineTo(p2, cableY(p2));
      c.lineTo(x1, cableY(x1));
    }
    [t1, t2].forEach(function (t) {
      x.fillStyle = "#1b1433";
      x.fillRect(t - 6 * u, top, 3.2 * u, river - top);
      x.fillRect(t + 2.8 * u, top, 3.2 * u, river - top);
      x.fillRect(t - 6 * u, top + 3 * u, 12 * u, 2.4 * u);
      x.fillRect(t - 6 * u, deck - 16 * u, 12 * u, 2.4 * u);
      glowRect(x, t - 6 * u, top, Math.max(0.6, 0.6 * u), deck - top, PAL.violet, 2 * u, 0.75);
      glowRect(x, t + 5.4 * u, top, Math.max(0.6, 0.6 * u), deck - top, PAL.violet, 2 * u, 0.75);
      x.fillStyle = "rgba(255,77,94,0.9)";
      x.fillRect(t - 0.8 * u, top - 2 * u, 1.6 * u, 1.6 * u);
      S.blinkCand.push({ x: t, y: top - 1.2 * u, tier: 4 });
      S.refl.push({ x0: t - 6 * u, x1: t + 6 * u, c: PAL.violet, s: 0.3 });
    });
    x.strokeStyle = rgba("#9fe8ff", 0.32);
    x.lineWidth = Math.max(0.5, 0.45 * u);
    x.beginPath();
    for (var px = Math.max(x0, -m) + 3 * u; px < x1 - 2 * u; px += 6 * u) {
      if (Math.abs(px - t1) < 7 * u || Math.abs(px - t2) < 7 * u) continue;
      x.moveTo(px, cableY(px)); x.lineTo(px, deck);
    }
    x.stroke();
    // The main cable is an LED strip: a dim static cable here, three pre-rendered tints crossfaded per frame.
    cable(x);
    x.strokeStyle = "#4a4378"; x.lineWidth = Math.max(0.8, 1.2 * u); x.stroke();
    var bx0 = Math.max(x0, -m) - 4 * u, by0 = top - 6 * u, bw = x1 - bx0 + 8 * u, bhh = deck - by0 + 6 * u;
    S.bridgeLed = {
      x: bx0, y: by0, w: bw, h: bhh,
      spr: [PAL.cyan, PAL.pink, PAL.lime].map(function (col) {
        return makeSprite(bw, bhh, Math.max(0.5, S.dpr * 0.75), function (g) {
          g.translate(-bx0, -by0);
          cable(g);
          glowStroke(g, null, col, Math.max(0.8, 1.2 * u), mix(col, "#ffffff", 0.5));
        });
      })
    };
    x.fillStyle = "#140f26";
    x.fillRect(x0, deck, x1 - x0, 4.5 * u);
    glowRect(x, x0, deck + 4.2 * u, x1 - x0, Math.max(0.6, 0.7 * u), PAL.cyan, 2 * u, 0.6);
    var lampG = S.lampSpr;
    for (var lp = x0 + 4 * u; lp < x1; lp += 9 * u) x.drawImage(lampG.c, lp + 0.55 * u - lampG.w / 2, deck - 0.85 * u - lampG.h / 2, lampG.w, lampG.h);
    S.refl.push({ x0: Math.max(x0, -m), x1: x1, c: "#ffcf8a", s: 0.28 });
    S.refl.push({ x0: Math.max(x0, -m), x1: x1, c: PAL.cyan, s: 0.12 });
    S.bridge = { x0: Math.max(x0, -m), x1: x1, deck: deck };
    addOccl(S, "near", { x: x0, y: deck - 2 * u, w: x1 - x0, h: 8 * u });
    addOccl(S, "near", { x: t1 - 7 * u, y: top - 3 * u, w: 14 * u, h: river - top });
    addOccl(S, "near", { x: t2 - 7 * u, y: top - 3 * u, w: 14 * u, h: river - top });
  }

  // The lit waterfront above the waterline, flipped and squashed into the river (drawn as rippling slices per frame).
  function captureReflection(S, src, ry) {
    var m = S.m, Wt = S.W + 2 * m, D = Math.max(8, S.H + m - ry), srcH = Math.min(D / 0.62, ry + m - 4);
    var rk = Math.max(0.3, S.k * 0.5), c = newCanvas(Wt * rk, D * rk), g = c.getContext("2d");
    g.save();
    g.translate(0, c.height);
    g.scale(1, -1);
    g.drawImage(src, 0, Math.round((ry + m - srcH) * S.k), src.width, Math.round(srcH * S.k), 0, 0, c.width, c.height);
    g.restore();
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(26,10,52,0.4)";
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = "destination-out";
    var fg = g.createLinearGradient(0, 0, 0, c.height);
    fg.addColorStop(0, "rgba(0,0,0,0.1)"); fg.addColorStop(1, "rgba(0,0,0,1)");
    g.fillStyle = fg;
    g.fillRect(0, 0, c.width, c.height);
    S.reflSpr = { c: c, x: -m, y: ry, w: Wt, h: D };
  }

  function paintRiver(S, x, P, rng) {
    var W = S.W, H = S.H, u = S.u, m = S.m, y0 = P.river * H, y1 = H + m, rh = y1 - y0;
    var g = x.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, "#2a1352"); g.addColorStop(0.4, "#170b30"); g.addColorStop(1, "#08040f");
    x.fillStyle = g;
    x.fillRect(-m, y0, W + 2 * m, rh);
    ellipseGlow(x, W * 0.6, y0, W * 0.6, rh * 0.7, PAL.pink, 0.24);
    ellipseGlow(x, W * 0.2, y0, W * 0.4, rh * 0.6, PAL.violet, 0.2);
    // Shimmering vertical streaks under every bright source.
    S.refl.forEach(function (r) {
      var cx = (r.x0 + r.x1) / 2, hw = (r.x1 - r.x0) / 2;
      for (var y = y0 + u; y < y1; y += (1.8 + rng.next() * 2.2) * u) {
        var f = (y - y0) / rh, a = Math.min(1, r.s * 1.3) * Math.pow(1 - f, 1.3) * (0.35 + rng.next() * 0.65);
        if (a < 0.02) continue;
        var ww = hw * 2 * (0.45 + rng.next() * 0.7) * (1 + f * 0.5);
        x.globalAlpha = Math.min(1, a);
        x.fillStyle = r.c;
        x.fillRect(cx - ww / 2 + (rng.next() - 0.5) * 6 * u, y, ww, Math.max(0.6, (0.7 + rng.next() * 0.9) * u));
      }
    });
    x.globalAlpha = 1;
    x.fillStyle = rgba(PAL.violet, 0.5);
    x.fillRect(-m, y0, W + 2 * m, Math.max(1, 0.8 * u));
    var R = [], cap = Math.round(W / 6);
    S.refl.forEach(function (r) {
      var n = Math.max(1, Math.round(((r.x1 - r.x0) / (9 * u)) * r.s * 1.6));
      for (var i = 0; i < n; i++) {
        var f = Math.pow(rng.next(), 1.4);
        R.push({ x: rng.range(r.x0, r.x1), y: y0 + 2 * u + f * (rh - 4 * u), len: rng.range(4, 14) * u * (1 + f), h: Math.max(0.6, 0.8 * u), c: r.c, a: Math.min(0.9, r.s * rng.range(0.6, 1.2) * (1 - f * 0.7)), sp: rng.range(0.5, 1.4), amp: rng.range(1.5, 5) * u, ph: rng.next() * 6.28 });
      }
    });
    for (var j = 0; j < W / (26 * u); j++) {
      var ff = rng.next();
      R.push({ x: rng.range(-m, W + m), y: y0 + 2 * u + ff * (rh - 4 * u), len: rng.range(6, 22) * u, h: Math.max(0.6, 0.7 * u), c: rng.chance(0.5) ? PAL.violet : PAL.pink, a: rng.range(0.12, 0.3), sp: rng.range(0.4, 1.1), amp: rng.range(2, 7) * u, ph: rng.next() * 6.28 });
    }
    while (R.length > cap) R.splice((rng.next() * R.length) | 0, 1);
    S.ripples = R;
    S.riverY = y0;
  }

  function paintNeko(S, x, N, rng, baseY) {
    var u = S.u, d = signDims(N.spec);
    x.fillStyle = "#0d0819";
    if (N.bx != null) {
      var b = makeBuilding(rng, N.bx, N.bw, N.btop, baseY + 6 * u, 4);
      b.roof = "flat"; b.style = "grid"; b.tone = "pink"; b.lit = 0.42; b.outline = null; b.r1 = 0.1; b.r3 = 0;
      drawBuilding(S, x, b, rng, null);
      x.fillStyle = "#0d0819";
      x.fillRect(N.sx + d.iw * 0.2, N.sy + d.ih, Math.max(1, u), N.btop - N.sy - d.ih + 1);
      x.fillRect(N.sx + d.iw * 0.8, N.sy + d.ih, Math.max(1, u), N.btop - N.sy - d.ih + 1);
      S.refl.push({ x0: N.bx + N.bw * 0.15, x1: N.bx + N.bw * 0.85, c: TONES.pink[0], s: 0.2 });
      addOccl(S, "near", { x: N.bx, y: N.btop, w: N.bw, h: baseY - N.btop });
    } else if (!N.bare) {
      x.fillRect(N.sx + d.iw, N.sy + 5 * u, S.W + S.m - N.sx - d.iw, Math.max(1, 1.4 * u));
      x.fillRect(N.sx + d.iw, N.sy + d.ih - 7 * u, S.W + S.m - N.sx - d.iw, Math.max(1, 1.4 * u));
    }
    addSign(S, x, N.spec, N.sx, N.sy, "fx", true, { delay: 1.6 });
  }

  function paintNear(S, x, P, rng) {
    var W = S.W, H = S.H, u = S.u, m = S.m, N = P.near, baseY = N.base * H;
    var baseFn = function () { return baseY + 6 * u; };
    var nearList = [];
    N.rows.forEach(function (row) {
      var o = { tier: 4, x0: row.x0, x1: row.x1, high: row.high, low: row.low, wMin: row.wMin, wMax: row.wMax, gMin: row.gMin, gMax: row.gMax, peaks: row.peaks || S.bandPeaks, envBase: row.envBase };
      var list = fillRow(S, rng, o, baseFn);
      list.forEach(function (b) {
        drawBuilding(S, x, b, rng, S.twkNear); S.tops.push(b); nearList.push(b);
        if (b.base - b.top > 30 * u) S.refl.push({ x0: b.x + b.w * 0.15, x1: b.x + b.w * 0.85, c: TONES[b.tone][0], s: 0.16 });
      });
    });
    if (P.band) {
      // Rooftop strip with gaps for the waterfront landmarks.
      var segs = [], last = -0.03;
      (P.houses || []).forEach(function (hs) { segs.push([last, hs[0]]); last = hs[1]; });
      segs.push([last, 1.03]);
      segs.forEach(function (sg) {
        if (sg[1] - sg[0] < 0.01) return;
        var o2 = { tier: 4, x0: sg[0], x1: sg[1], high: 0.48, low: 0.86, wMin: 22, wMax: 50, gMin: -2, gMax: 5, peaks: S.bandPeaks, envBase: 0.25 };
        var list2 = fillRow(S, rng, o2, function () { return H + 6 * u; });
        list2.forEach(function (b) { if (b.x > sg[1] * W + 6 * u) return; drawBuilding(S, x, b, rng, S.twkNear); S.tops.push(b); nearList.push(b); });
      });
    }
    if (P.bridge) paintBridge(S, x, P.bridge);

    if (P.featC) {
      var F = P.featC;
      var C = paintFeatured(S, x, { x: F.x, w: F.w, top: F.top, roof: "step", style: "res", lit: 0.3, tone: "warm", rim: PAL.pink }, 4, rng, baseFn, "fx");
      addShow(S, C, "fx", 0.6, F.showY, Math.min(C.base, baseY));
      addSign(S, x, F.spec, F.sx, F.sy, "fx", true, { delay: 0.6, big: true });
      if (F.s2) addSign(S, x, F.s2, F.s2x, F.s2y, "fx", true, { delay: 1.4 });
    }
    if (P.hong) paintHongyadong(S, x, P.hong, rng);
    if (P.band && P.houses) {
      P.houses.forEach(function (hs) {
        if (hs[2] === "pagoda") paintPagoda(S, x, hs, rng);
        else paintHongyadong(S, x, { x0: hs[0], x1: hs[1], top: 0.5, bot: 1.0, floors: 3, ls: 1, sign: null }, rng);
      });
    }
    if (P.neko) paintNeko(S, x, P.neko, rng, baseY);
    paintRowSigns(S, x, nearList, rng, 4, "fx", P.band ? 0.28 : 0.4);
    if (P.river) {
      // Embankment and promenade lamps where nothing else meets the water, then the reflection and the river.
      var ry = P.river * H, hx0 = P.hong ? P.hong.x0 * W : -1e9, hx1 = P.hong ? P.hong.x1 * W : -1e9;
      x.fillStyle = "#120b22";
      x.fillRect(-m, ry - 5 * u, W + 2 * m, 5 * u);
      var lampE = S.lampSpr;
      for (var lp = -m + 6 * u; lp < W + m; lp += 15 * u) {
        if (lp > hx0 - 4 * u && lp < hx1 + 4 * u) continue;
        x.drawImage(lampE.c, lp + 0.6 * u - lampE.w / 2, ry - 5.9 * u - lampE.h / 2, lampE.w, lampE.h);
      }
      addOccl(S, "near", { x: -m, y: ry - 7 * u, w: W + 2 * m, h: H });
      captureReflection(S, x.canvas, ry);
      paintRiver(S, x, P, rng);
    } else {
      vband(x, -m, W + 2 * m, H * 0.9, H + m, "#08060d", 0, 0.9);
    }
  }

  /* ------------------------------------------------------------------ mist and searchlights */

  function paintMist(S, el, band, tints, n, rng, aMul) {
    var W = (S.W + 2 * S.m) * 1.3, y0 = band[0] * S.H, h = Math.max(10, (band[1] - band[0]) * S.H), k = Math.max(0.35, Math.min(0.5, S.dpr * 0.5));
    el.width = Math.max(1, Math.round(W * k));
    el.height = Math.max(1, Math.round(h * k));
    el.style.width = W + "px";
    el.style.height = h + "px";
    el.style.left = -S.m + "px";
    el.style.top = y0 + "px";
    var x = el.getContext("2d");
    x.setTransform(el.width / W, 0, 0, el.height / h, 0, 0);
    x.clearRect(0, 0, W, h);
    for (var i = 0; i < n; i++) {
      ellipseGlow(x, rng.range(0, W), rng.range(h * 0.3, h * 0.75), rng.range(0.08, 0.2) * S.W + 40, rng.range(0.22, 0.42) * h, rng.pick(tints), rng.range(0.05, 0.12) * aMul);
    }
    vband(x, 0, W, h * 0.35, h * 0.65, tints[0], 0, 0.06 * aMul);
    vband(x, 0, W, h * 0.65, h, tints[0], 0.06 * aMul, 0);
  }

  function setupBeams(S, P) {
    var holder = S.el.beams, W = S.W, H = S.H, u = S.u;
    while (holder.firstChild) holder.removeChild(holder.firstChild);
    (P.beams || []).forEach(function (b, i) {
      var bw = Math.min(0.16 * H, 0.3 * W), bh = b.h * H, k = 0.5;
      var c = document.createElement("canvas");
      c.className = "nc-beam";
      c.width = Math.max(1, Math.round(bw * k));
      c.height = Math.max(1, Math.round(bh * k));
      c.style.width = bw + "px";
      c.style.height = bh + "px";
      c.style.left = (b.x * W - bw / 2) + "px";
      c.style.top = (b.base * H - bh) + "px";
      c.style.setProperty("--nc-a0", b.a0 + "deg");
      c.style.setProperty("--nc-a1", b.a1 + "deg");
      c.style.animationDuration = b.dur + "s";
      c.style.animationDelay = (-i * 5.3) + "s";
      var x = c.getContext("2d");
      x.setTransform(c.width / bw, 0, 0, c.height / bh, 0, 0);
      var g = x.createLinearGradient(0, bh, 0, 0);
      g.addColorStop(0, rgba(b.c, 0.16)); g.addColorStop(0.5, rgba(b.c, 0.065)); g.addColorStop(1, rgba(b.c, 0));
      x.fillStyle = g;
      [1, 0.62, 0.3].forEach(function (f) {
        x.beginPath();
        x.moveTo(bw / 2 - 1.5 * u, bh); x.lineTo(bw / 2 - (bw / 2) * f, 0); x.lineTo(bw / 2 + (bw / 2) * f, 0); x.lineTo(bw / 2 + 1.5 * u, bh);
        x.closePath(); x.fill();
      });
      holder.appendChild(c);
    });
  }

  /* ------------------------------------------------------------------ runtime entities */

  var CAR_COLORS = [PAL.cyan, PAL.pink, PAL.violet, PAL.amber, PAL.cyan, PAL.pink, PAL.lime];
  function carSprites(S, color, depth) {
    var key = color + depth;
    if (S.carCache[key]) return S.carCache[key];
    var size = [0.75, 1.15, 1.9][depth] * S.u;
    var o = { bodyR: carSprite(color, size, S.dpr, 1), bodyL: carSprite(color, size, S.dpr, -1), trR: trailSprite(color, S.dpr, 1), trL: trailSprite(color, S.dpr, -1) };
    S.carCache[key] = o;
    return o;
  }
  function respawnCar(S, c, initial) {
    var r = S.rt.next, P = S.P, W = S.W, H = S.H, u = S.u;
    c.dir = r() < 0.5 ? 1 : -1;
    var hiLane = c.depth === 2 ? lerp(P.lanes[0], P.lanes[1], 0.7) : P.lanes[1];
    c.y = lerp(P.lanes[0], hiLane, r()) * H;
    c.speed = [24, 58, 150][c.depth] * u * (0.8 + r() * 0.5);
    c.len = [46, 100, 230][c.depth] * u * (0.7 + r() * 0.6);
    c.th = [3.6, 5.2, 8][c.depth] * u;
    c.color = CAR_COLORS[(r() * CAR_COLORS.length) | 0];
    c.x = initial ? r() * W : (c.dir > 0 ? -S.m - 20 * u : W + S.m + 20 * u);
    c.wait = initial ? (c.depth === 2 ? 2 + r() * 5 : 0) : r() * [5, 4, 10][c.depth] + (c.depth === 2 ? 5 : 0.4);
    c.alpha = [0.75, 0.95, 1][c.depth];
    c.bob = 0.5 + r(); c.bobA = [0.5, 1.1, 2.2][c.depth] * u; c.ph = r() * 6.28;
    c.spr = carSprites(S, c.color, c.depth);
  }

  function setupRuntime(S, P, rng) {
    var W = S.W, H = S.H, u = S.u, dpr = S.dpr, m = S.m;
    S.rt = makeRng(S.seed ^ 0x5bd1e995);
    S.carCache = {};
    S.spr = {
      red: glowSprite(PAL.red, 4.2 * u, dpr, 0.9),
      white: glowSprite("#dff3ff", 2.4 * u, dpr, 1),
      warm: glowSprite("#ffd9a0", 2.2 * u, dpr, 1),
      tail: glowSprite("#ff3048", 2 * u, dpr, 0.7),
      dust: [glowSprite(PAL.violet, 4 * u, dpr, 0.9), glowSprite(PAL.pink, 4 * u, dpr, 0.9), glowSprite(PAL.cyan, 4 * u, dpr, 0.9)],
      lantern: [lanternSprite(5 * u * P.lanternScale, dpr), lanternSprite(4 * u * P.lanternScale, dpr), lanternSprite(6.5 * u * S.signScale, dpr)],
      warmGlow: makeSprite(120, 40, dpr, function (c, w, h) { c.save(); c.translate(w / 2, h / 2); c.scale(1, h / w); var g = c.createRadialGradient(0, 0, 0, 0, 0, w / 2); g.addColorStop(0, "rgba(255,226,170,0.5)"); g.addColorStop(1, "rgba(255,226,170,0)"); c.fillStyle = g; c.fillRect(-w / 2, -w / 2, w, w); c.restore(); })
    };
    var keepL = [];
    for (var li = 0; li < S.lanterns.length; li++) {
      var lt = S.lanterns[li], lr = { x: lt.x - 10 * u, y: lt.y - 4 * u, w: 20 * u, h: 22 * u };
      if (!hits(lr, S.signRects)) keepL.push(lt);
    }
    S.lanterns = keepL;
    S.cars = [];
    for (var d = 0; d < 3; d++) for (var i = 0; i < (P.cars[d] || 0); i++) { var c = { depth: d }; respawnCar(S, c, true); S.cars.push(c); }

    S.train = null;
    if (P.track) {
      var cars = P.trainCars, sc = S.compact ? 0.9 : P.band ? 0.85 : 1;
      var o = { u: u, cars: cars, carL: 52 * u * sc, h: 12 * u * sc, gap: 1.8 * u };
      o.L = cars * o.carL + (cars - 1) * o.gap;
      var ty = P.track.y;
      var T = S.train = {
        L: o.L, h: o.h, y: ty - o.h + 2.4 * u, padX: 3 * u, padY: 5 * u,
        sprR: trainSprite(o, dpr, 1), sprL: trainSprite(o, dpr, -1),
        coneR: coneSprite(70 * u, 26 * u, dpr, 1), coneL: coneSprite(70 * u, 26 * u, dpr, -1),
        clip: S.trackClip, dir: 1, wait: 1.6, x: 0
      };
      T.xMin = Math.max(S.trackClip, -m) - T.L - 20 * u;
      T.xMax = W + m + 80 * u;
      T.speed = Math.max(110 * u, (T.xMax - T.xMin) / (P.band ? 9 : 7.2));
      T.x = T.xMin;
    }

    S.dust = [];
    var x0 = P.dustX0 || 0;
    for (var j = 0; j < P.dust; j++) {
      S.dust.push({
        x: rng.range(x0, 1) * W, y: rng.range(P.band ? 0.1 : 0.12, 0.92) * H, vx: rng.range(-4, 4) * u, vy: -rng.range(2, 8) * u,
        r: rng.range(2.4, 4.6) * u, s: (rng.next() * 3) | 0, a: rng.range(0.25, 0.6), tw: rng.range(0.6, 2), ph: rng.next() * 6.28, x0: x0 * W
      });
    }

    S.traffic = [];
    if (S.bridge) {
      var span = S.bridge.x1 - S.bridge.x0, nT = Math.max(4, Math.round(span / (36 * u)));
      for (var q = 0; q < nT; q++) S.traffic.push({ off: rng.next() * span, v: rng.range(26, 52) * u, dir: q % 2 ? -1 : 1 });
    }

    // Finalize twinkles: drop any covered by something painted later in the same canvas.
    S.twk = { dyn: finalizeTwinkles(S, S.twkMid.list, S.occl.mid, S.midBase, P.band ? 24 : 70, rng), fx: finalizeTwinkles(S, S.twkNear.list, S.occl.near, null, P.band ? 24 : 60, rng) };

    // Aircraft warning lights: far ones must stay visible above the mid skyline.
    S.blinkDyn = []; S.blinkFx = [];
    var cand = S.blinkCand;
    for (var b = 0; b < cand.length; b++) {
      var bc = cand[b];
      if (bc.tier >= 4) { S.blinkFx.push(mkBlink(bc, rng)); continue; }
      if (bc.tier <= 2 && bc.y > midSkyAt(S, bc.x, bc.tier) - 2 * u) continue;
      S.blinkDyn.push(mkBlink(bc, rng));
    }
    if (S.blinkDyn.length > 18) S.blinkDyn.length = 18;
  }
  function mkBlink(bc, rng) { return { x: bc.x, y: bc.y, period: rng.range(1.6, 2.6), phase: rng.next(), r: 0 }; }
  function midSkyAt(S, px, tier) {
    var y = S.midBase ? S.midBase(px) : S.H;
    for (var i = 0; i < S.tops.length; i++) {
      var b = S.tops[i];
      if (b.tier <= tier || b.tier >= 4) continue;
      if (px >= b.x && px <= b.x + b.w && b.top < y) y = b.top;
    }
    return y;
  }
  function finalizeTwinkles(S, list, occl, baseFn, cap, rng) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      if (w.y < -S.m || w.y > S.H + S.m) continue;
      if (baseFn && w.y + w.h > baseFn(w.x) - 1) continue;
      if (hits(w, occl)) continue;
      out.push(w);
    }
    while (out.length > cap) out.splice((rng.next() * out.length) | 0, 1);
    return out;
  }

  /* ------------------------------------------------------------------ per-frame drawing */

  // Photosensitivity: sign states change at most 6 times a second (3 Hz flashes at most), the big signs never
  // drop below 35% and take turns, so only one of them bursts at a time.
  function bigTurn(S, s, t) { return S.bigN > 0 && Math.floor(t / 8) % S.bigN === s.bigIdx; }
  function signAlpha(S, s, t) {
    var ti = t - S.igniteAt - s.delay, lo = s.big ? 0.35 : 0.08;
    S._burst = false;
    if (ti < 0) return 0;
    if (ti < 0.85) return hash(Math.floor(ti * 6) * 3.1 + s.id) > 0.4 ? 0.5 + (ti / 0.85) * 0.5 : lo;
    if (!s.flicker) return 1;
    var c = (t + s.phase) / s.period, kk = Math.floor(c), f = (c - kk) * s.period;
    if (f < s.burst * (0.4 + hash(kk * 1.7 + s.id)) && (!s.big || bigTurn(S, s, t))) {
      S._burst = true;
      var n = hash(Math.floor(t * 6) + s.id * 13.7);
      return n > 0.5 ? 1 : n > 0.25 ? 0.62 : lo;
    }
    return 0.92 + 0.08 * Math.sin(t * 2.1 + s.id);
  }

  function drawSigns(S, x, list, t, still) {
    var u = S.u;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s.on) continue;
      var a = still ? 1 : signAlpha(S, s, t), burst = S._burst && !still;
      if (a <= 0.02) continue;
      var gx = s.x - s.pad, gy = s.y - s.pad, sp = s.on;
      x.globalAlpha = a;
      x.drawImage(sp.c, gx, gy, sp.w, sp.h);
      if (burst && s.glitch && hash(Math.floor(t * 6) + s.id * 3.3) > 0.55) {
        x.globalCompositeOperation = "lighter";
        x.globalAlpha = 0.28;
        x.drawImage(sp.c, gx + 2.2 * u, gy, sp.w, sp.h);
        x.drawImage(sp.c, gx - 1.6 * u, gy + 0.8 * u, sp.w, sp.h);
        x.globalCompositeOperation = "source-over";
      }
      // One tired character on some signs buzzes on its own.
      if (!still && s.broken >= 0 && s.cells && s.off && s.broken < s.cells.length) {
        var cyc = (t * 0.37 + s.id) % 7;
        if (cyc < 0.9 && hash(Math.floor(t * 6) + s.id) > 0.45) {
          var cell = s.cells[s.broken], kk = s.off.k;
          x.globalAlpha = 0.72;
          x.drawImage(s.off.c, 0, Math.round(cell.y * kk), s.off.c.width, Math.round(cell.h * kk), gx, gy + cell.y, sp.w, cell.h);
        }
      }
    }
    x.globalAlpha = 1;
  }

  function drawTwinkles(S, x, list, t, still) {
    if (still) return;
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      if (w.tv) {
        x.globalAlpha = 0.4 + 0.35 * hash(Math.floor(t * 4) + i);
        x.fillStyle = "#a9d8ff";
        x.fillRect(w.x, w.y, w.w, w.h);
        continue;
      }
      var ph = (t / w.period + w.phase) % 1;
      if (ph > w.dur) continue;
      if (w.on) { x.globalAlpha = 1; x.fillStyle = w.off; }
      else { x.globalAlpha = w.a; x.fillStyle = w.color; }
      x.fillRect(w.x, w.y, w.w, w.h);
    }
    x.globalAlpha = 1;
  }

  function drawBlinkers(S, x, list, t, still) {
    var spr = S.spr.red;
    for (var i = 0; i < list.length; i++) {
      var b = list[i], ph = (t / b.period + b.phase) % 1;
      var a = still ? (b.phase > 0.5 ? 0.7 : 0) : (ph < 0.14 ? Math.sin((ph / 0.14) * Math.PI) : 0);
      if (a <= 0.02) continue;
      x.globalAlpha = a;
      x.drawImage(spr.c, b.x - spr.w / 2, b.y - spr.h / 2, spr.w, spr.h);
    }
    x.globalAlpha = 1;
  }

  function drawShows(S, x, layer, t, still) {
    for (var i = 0; i < S.shows.length; i++) {
      var sh = S.shows[i];
      if (sh.layer !== layer) continue;
      var st = sh.strip, off = still ? st.period * 0.3 : (t * sh.speed) % st.period;
      x.globalAlpha = sh.a;
      x.drawImage(st.c, 0, off * st.k, st.c.width, sh.h * st.k, sh.x, sh.y, sh.w, sh.h);
    }
    x.globalAlpha = 1;
  }

  function drawTickers(S, x, layer, t, still) {
    for (var i = 0; i < S.tickers.length; i++) {
      var tk = S.tickers[i];
      if (tk.layer !== layer) continue;
      var sw = tk.strip.w, off = still ? 0 : (t * tk.speed) % sw;
      x.save();
      x.beginPath(); x.rect(tk.x, tk.y, tk.w, tk.h); x.clip();
      for (var px = tk.x - off; px < tk.x + tk.w; px += sw) x.drawImage(tk.strip.c, px, tk.y, sw, tk.h);
      x.drawImage(tk.grid.c, tk.x, tk.y, tk.w, tk.h);
      x.restore();
    }
  }

  function drawCars(S, x, depth, t) {
    for (var i = 0; i < S.cars.length; i++) {
      var c = S.cars[i];
      if (c.depth !== depth || c.wait > 0) continue;
      var y = c.y + Math.sin(t * c.bob + c.ph) * c.bobA, s = c.spr;
      x.globalAlpha = c.alpha * 0.85;
      if (c.dir > 0) x.drawImage(s.trR.c, c.x - c.len, y - c.th / 2, c.len, c.th);
      else x.drawImage(s.trL.c, c.x, y - c.th / 2, c.len, c.th);
      x.globalAlpha = c.alpha;
      var b = c.dir > 0 ? s.bodyR : s.bodyL;
      x.drawImage(b.c, c.x - b.w / 2, y - b.h / 2, b.w, b.h);
      if ((t + c.ph) % 1.2 < 0.08) {
        var wsp = S.spr.white;
        x.drawImage(wsp.c, c.x - wsp.w / 2, y - b.h * 0.35 - wsp.h / 2, wsp.w, wsp.h);
      }
    }
    x.globalAlpha = 1;
  }

  function drawTrain(S, x, t, still) {
    var T = S.train, u = S.u;
    if (!T || T.wait > 0) return;
    var spr = T.dir > 0 ? T.sprR : T.sprL, cone = T.dir > 0 ? T.coneR : T.coneL;
    var clip = T.clip > -1e8;
    if (clip) { x.save(); x.beginPath(); x.rect(T.clip, -S.m, S.W + 2 * S.m, S.H + 2 * S.m); x.clip(); }
    x.globalCompositeOperation = "lighter";
    x.globalAlpha = 0.8;
    var wg = S.spr.warmGlow;
    x.drawImage(wg.c, T.x - 10 * u, T.y - T.h * 0.9, T.L + 20 * u, T.h * 3.2);
    x.globalAlpha = 0.9;
    if (T.dir > 0) x.drawImage(cone.c, T.x + T.L - 1 * u, T.y + T.h * 0.55 - cone.h / 2, cone.w, cone.h);
    else x.drawImage(cone.c, T.x - cone.w + 1 * u, T.y + T.h * 0.55 - cone.h / 2, cone.w, cone.h);
    x.globalCompositeOperation = "source-over";
    x.globalAlpha = 1;
    x.drawImage(spr.c, T.x - T.padX, T.y - T.padY, spr.w, spr.h);
    if (clip) x.restore();
    var Lz = S.liziba;
    if (Lz) {
      var gap = Math.max(Lz.x - (T.x + T.L), T.x - (Lz.x + Lz.w), 0), near = clamp(1 - gap / (150 * u), 0, 1);
      if (T.x < Lz.x + Lz.w + 70 * u && T.x + T.L > Lz.x - 70 * u) {
        x.drawImage(Lz.occ.c, Lz.ox, Lz.oy, Lz.occ.w, Lz.occ.h);
        if (gap === 0) {
          // Seen dimly through the station glazing while it is inside.
          x.save();
          x.beginPath(); x.rect(Lz.x, Lz.oy0, Lz.w, Lz.oy1 - Lz.oy0); x.clip();
          x.globalAlpha = 0.38;
          x.drawImage(spr.c, T.x - T.padX, T.y - T.padY, spr.w, spr.h);
          x.restore();
        }
      }
      if (near > 0) {
        x.globalCompositeOperation = "lighter";
        x.globalAlpha = 0.8 * near;
        x.drawImage(Lz.glow.c, Lz.x - 20 * u, Lz.gy, Lz.glow.w, Lz.glow.h);
        x.globalCompositeOperation = "source-over";
        x.globalAlpha = 1;
      }
    }
    var O = S.occluders;
    for (var i = 0; i < O.length; i++) {
      var o = O[i];
      if (T.x < o.x1 && T.x + T.L > o.x0) x.drawImage(o.spr.c, o.x, o.y, o.spr.w, o.spr.h);
    }
  }

  function drawReflection(S, x, t, still) {
    var R = S.reflSpr;
    if (!R) return;
    var n = 14, sh = R.c.height / n, dh = R.h / n, u = S.u;
    x.globalAlpha = 0.9;
    for (var i = 0; i < n; i++) {
      var dx = still ? 0 : Math.sin(t * 1.5 + i * 0.85) * (0.5 + (i / n) * 4) * u;
      x.drawImage(R.c, 0, i * sh, R.c.width, sh, R.x + dx, R.y + i * dh, R.w, dh + 0.6);
    }
    x.globalAlpha = 1;
  }

  function drawBridgeLed(S, x, t, still) {
    var L = S.bridgeLed;
    if (!L) return;
    var p = still ? 0 : (t / 6) % 3, i0 = Math.floor(p), f = p - i0, k = f < 0.65 ? 0 : (f - 0.65) / 0.35, A = S.compact || S.P.band ? 0.85 : 0.7;
    x.globalAlpha = A * (1 - k);
    x.drawImage(L.spr[i0].c, L.x, L.y, L.w, L.h);
    if (k > 0) {
      x.globalAlpha = A * k;
      x.drawImage(L.spr[(i0 + 1) % 3].c, L.x, L.y, L.w, L.h);
    }
    x.globalAlpha = 1;
  }

  function drawRipples(S, x, t, still) {
    var R = S.ripples;
    if (!R || !R.length) return;
    x.globalCompositeOperation = "lighter";
    for (var i = 0; i < R.length; i++) {
      var r = R[i], dx = still ? 0 : Math.sin(t * r.sp + r.ph) * r.amp;
      var a = r.a * (0.5 + 0.5 * Math.sin(t * r.sp * 1.7 + r.ph * 2));
      if (a < 0.02) continue;
      x.globalAlpha = a;
      x.fillStyle = r.c;
      x.fillRect(r.x + dx, r.y, r.len, r.h);
    }
    var T = S.train;
    if (T && T.wait <= 0 && S.riverY && T.x + T.L > T.clip) {
      var wg = S.spr.warmGlow, cx = T.x + T.L / 2;
      x.globalAlpha = 0.22 + 0.06 * Math.sin(t * 7);
      x.drawImage(wg.c, cx - T.L * 0.5, S.riverY + 2 * S.u, T.L, 26 * S.u);
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
  }

  function drawTraffic(S, x, t) {
    if (!S.traffic.length) return;
    var B = S.bridge, span = B.x1 - B.x0, w = S.spr.white, tl = S.spr.tail;
    for (var i = 0; i < S.traffic.length; i++) {
      var c = S.traffic[i], p = (c.off + t * c.v) % span;
      if (c.dir > 0) x.drawImage(w.c, B.x0 + p - w.w / 2, B.deck - 1.6 * S.u - w.h / 2, w.w, w.h);
      else x.drawImage(tl.c, B.x1 - p - tl.w / 2, B.deck - 0.8 * S.u - tl.h / 2, tl.w, tl.h);
    }
  }

  function drawLanterns(S, x, t, still) {
    var L = S.lanterns, k = S.k, m = S.m, sprs = S.spr.lantern;
    if (!L.length) return;
    for (var i = 0; i < L.length; i++) {
      var l = L[i], spr = sprs[l.s] || sprs[0];
      var ang = still ? 0 : Math.sin(t * l.w + l.ph) * l.amp;
      var c = Math.cos(ang), s = Math.sin(ang);
      x.globalAlpha = still ? 1 : 0.9 + 0.1 * hash(Math.floor(t * 5 + l.fl));
      x.setTransform(k * c, k * s, -k * s, k * c, (l.x + m) * k, (l.y + m) * k);
      x.drawImage(spr.c, -spr.w / 2, 0, spr.w, spr.h);
    }
    x.setTransform(k, 0, 0, k, m * k, m * k);
    x.globalAlpha = 1;
  }

  function drawDust(S, x, t, still) {
    var D = S.dust;
    for (var i = 0; i < D.length; i++) {
      var d = D[i], spr = S.spr.dust[d.s];
      var a = d.a * (still ? 0.7 : 0.5 + 0.5 * Math.sin(t * d.tw + d.ph));
      if (a < 0.03) continue;
      x.globalAlpha = a;
      x.drawImage(spr.c, d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
    }
    x.globalAlpha = 1;
  }

  function update(S, dt) {
    var W = S.W, m = S.m, u = S.u, i;
    for (i = 0; i < S.cars.length; i++) {
      var c = S.cars[i];
      if (c.wait > 0) { c.wait -= dt; continue; }
      c.x += c.dir * c.speed * dt;
      if ((c.dir > 0 && c.x - c.len > W + m) || (c.dir < 0 && c.x + c.len < -m)) respawnCar(S, c, false);
    }
    var T = S.train;
    if (T) {
      if (T.wait > 0) {
        T.wait -= dt;
        if (T.wait <= 0) T.x = T.dir > 0 ? T.xMin : T.xMax;
      } else {
        T.x += T.dir * T.speed * dt;
        if ((T.dir > 0 && T.x > T.xMax) || (T.dir < 0 && T.x < T.xMin)) {
          T.wait = 3 + S.rt.next() * 3.5;
          T.dir = -T.dir;
        }
      }
    }
    for (i = 0; i < S.dust.length; i++) {
      var d = S.dust[i];
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.y < S.H * 0.08) { d.y = S.H * 0.95; }
      if (d.x < d.x0 - 10 * u) d.x = W + 8 * u; else if (d.x > W + 10 * u) d.x = d.x0;
    }
  }

  function clearCtx(S, x) {
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, x.canvas.width, x.canvas.height);
    x.setTransform(S.k, 0, 0, S.k, S.m * S.k, S.m * S.k);
  }

  function renderFrame(S, t, still) {
    var x = S.ctx.dyn;
    clearCtx(S, x);
    drawShows(S, x, "dyn", t, still);
    drawTwinkles(S, x, S.twk.dyn, t, still);
    drawBlinkers(S, x, S.blinkDyn, t, still);
    drawSigns(S, x, S.signsDyn, t, still);
    drawTickers(S, x, "dyn", t, still);
    drawCars(S, x, 0, t);
    drawCars(S, x, 1, t);
    drawTrain(S, x, t, still);

    x = S.ctx.fx;
    clearCtx(S, x);
    drawReflection(S, x, t, still);
    drawRipples(S, x, t, still);
    drawBridgeLed(S, x, t, still);
    drawTraffic(S, x, t);
    drawShows(S, x, "fx", t, still);
    drawTwinkles(S, x, S.twk.fx, t, still);
    drawBlinkers(S, x, S.blinkFx, t, still);
    drawSigns(S, x, S.signsFx, t, still);
    drawTickers(S, x, "fx", t, still);
    drawLanterns(S, x, t, still);
    drawCars(S, x, 2, t);
    drawDust(S, x, t, still);
  }

  /* ------------------------------------------------------------------ instance */

  function pickDpr(W, H, cap, budget) {
    var d = Math.min(window.devicePixelRatio || 1, cap);
    if (W * H * d * d > budget) d = Math.sqrt(budget / (W * H));
    return Math.max(0.5, d);
  }

  function sizeLayer(c, w, h, dpr, m) {
    var pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    c.style.width = w + "px";
    c.style.height = h + "px";
    c.style.left = -m + "px";
    c.style.top = -m + "px";
    var x = c.getContext("2d");
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, pw, ph);
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
    x.shadowBlur = 0;
    var k = pw / w;
    x.setTransform(k, 0, 0, ph / h, m * k, m * (ph / h));
    return x;
  }

  function mount(container, opts) {
    if (!container || !container.appendChild) throw new Error("NeonCity.mount needs a container element");
    opts = opts || {};
    var mode = opts.mode === "band" ? "band" : "hero";
    var S = {
      mode: mode, seed: (opts.seed == null ? (mode === "band" ? 2046 : 1997) : +opts.seed) >>> 0,
      motion: opts.motion != null ? opts.motion !== false : !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches), visible: true, nearView: false, canStart: false, generated: false, dirty: true,
      destroyed: false, building: false, raf: 0, clock: 0, last: 0,
      W: 0, H: 0, dpr: 1, k: 1, u: 1, m: 0, ptx: 0, pty: 0, px: 0, py: 0, apx: 1e9, apy: 1e9,
      fontsReady: fontsAvailable(), igniteAt: -1e9, ignited: false,
      stat: { n: 0, sum: 0, max: 0, recent: [] }, genMs: 0, buildMs: 0, longestStep: 0
    };

    var root = document.createElement("div");
    root.className = "neon-city neon-city--" + mode + " is-pending";
    root.setAttribute("aria-hidden", "true");
    var el = S.el = {}, ctx = S.ctx = {};
    function layer(name, cls) {
      var c = document.createElement("canvas");
      c.className = "nc-layer nc-" + name + (cls ? " " + cls : "");
      root.appendChild(c);
      el[name] = c;
      ctx[name] = c.getContext("2d");
    }
    layer("sky");
    el.beams = document.createElement("div");
    el.beams.className = "nc-beams";
    root.appendChild(el.beams);
    layer("far");
    layer("mistA", "nc-mist nc-mist--a");
    layer("mid");
    layer("dyn");
    layer("mistB", "nc-mist nc-mist--b");
    layer("near");
    layer("fx");
    // A soft dark scrim under the copy keeps lit windows from competing with the text.
    var scrim = document.createElement("div");
    scrim.className = "nc-scrim";
    root.appendChild(scrim);
    S.depth = { sky: 0.03, beams: 0.07, far: 0.12, mistA: 0.2, mid: 0.3, dyn: 0.3, mistB: 0.42, near: 0.55, fx: 0.55 };
    try { if (getComputedStyle(container).position === "static") container.style.position = "relative"; } catch (e) {}
    container.appendChild(root);

    // Page content to keep clear: opts.avoid, or (hero) the host section's copy, portrait, meta strip and cat.
    var avoidSrc = opts.avoid !== undefined ? opts.avoid : (mode === "hero" ? autoAvoid(container) : null);
    function zonesFor(W, H) {
      if (mode !== "hero") return { copy: [], portrait: [], cat: [], meta: [], box: [] };
      var Z = null;
      if (avoidSrc) { try { Z = measureAvoid(avoidSrc, root); } catch (e) { Z = null; } }
      if (zonesEmpty(Z)) Z = fallbackAvoid(W, H, W <= 900);
      ["copy", "portrait", "cat", "meta", "box"].forEach(function (k) { if (!Z[k]) Z[k] = []; });
      return Z;
    }

    // Build the static layers into fresh offscreen canvases a step at a time (so no single long task), then
    // swap them in at once. The old frame stays on screen until the swap, so a rebuild never flashes.
    var job = 0;
    function startBuild(W, H, Z) {
      var my = ++job;
      dropPending();
      S.building = true;
      var t0 = performance.now(), steps = prepare(W, H, Z), i = 0;
      S.longestStep = performance.now() - t0;
      function next() {
        if (S.destroyed || my !== job) return;
        var s0 = performance.now();
        steps[i++]();
        var dt = performance.now() - s0;
        if (dt > S.longestStep) S.longestStep = dt;
        if (i < steps.length) { setTimeout(next, 0); return; }
        S.buildMs = performance.now() - t0;
        finish();
      }
      setTimeout(next, 0);
    }
    function dropPending() {
      var B = S.nb;
      if (!B) return;
      for (var n in B) if (B[n] && B[n].tagName === "CANVAS") { B[n].width = 1; B[n].height = 1; }
      S.nb = null;
    }
    function prepare(W, H, Z) {
      S.W = W; S.H = H;
      S.compact = mode === "hero" && W <= 900;
      S.u = mode === "band" ? clamp(Math.min(H / 220, W / 1000), 0.6, 2.2) : clamp(Math.min(H / 900, (W / 1440) * 1.25), 0.62, 2.6);
      S.signScale = S.compact ? 1.2 : 1;
      S.m = Math.ceil(15 * S.u) + 2;
      var Wt = W + 2 * S.m, Ht = H + 2 * S.m;
      S.dpr = pickDpr(Wt, Ht, S.compact || (mode === "band" && W < 700) ? 1.25 : 1.5, mode === "band" ? 2.2e6 : 3.4e6);
      // On phones the cat spans the screen: only its body (below the head and the top of its back) is kept clear,
      // so the skyline and its signs can still rise behind the head.
      if (S.compact && Z.cat) Z.cat = Z.cat.map(function (r) { var t = r.h * 0.35; return { x: r.x, y: r.y + t, w: r.w, h: r.h - t }; });
      S.Z = Z;
      S.catR = union(Z.cat || []);
      S.avoidPad = [];
      for (var key in Z) Z[key].forEach(function (r) { S.avoidPad.push(grow(r, key === "cat" ? 14 : 20)); });
      S.keepouts = []; S.pendingSigns = []; S.occl = { mid: [], near: [] }; S.signRects = []; S.signCount = 0; S.bigN = 0; S.signLog = [];
      S.bags = {}; S.used = {};
      var P = S.P = configFor(S);
      // Featured signs claim their words first, so no smaller sign repeats one of them nearby.
      [P.featA, P.featC, P.featC && P.featC.s2 ? { spec: P.featC.s2, sx: P.featC.s2x } : null, P.neko, P.liziba && P.liziba.sign].forEach(function (f) {
        if (f && f.spec) useWord(S, f.spec.text, f.sx + signDims(f.spec).iw / 2);
      });
      if (P.hong && P.hong.sign) useWord(S, P.hong.sign.text, P.hong.signX);
      var rng = makeRng(S.seed);
      S.signsDyn = []; S.signsFx = []; S.tops = []; S.blinkCand = []; S.lanterns = []; S.shows = []; S.tickers = []; S.occluders = [];
      S.refl = []; S.ripples = []; S.riverY = 0; S.bridge = null; S.bridgeLed = null; S.reflSpr = null; S.liziba = null; S.midBase = null; S.trackClip = -1e9;
      S.twkMid = { list: [], rate: 0.03 }; S.twkNear = { list: [], rate: 0.04 };
      if (P.calm) S.keepouts.push({ x0: P.calm.x0, x1: P.calm.x1, y: P.calm.y, tier: 0 });
      if (P.raffles) S.keepouts.push({ x0: P.raffles.x - 40 * S.u, x1: P.raffles.x + P.raffles.w + 40 * S.u, y: P.raffles.top + 30 * S.u, tier: 2 });
      if (P.band) {
        S.bandPeaks = [];
        for (var bp = 0; bp < W / (180 * S.u) + 1; bp++) S.bandPeaks.push([(bp + rng.range(-0.3, 0.3)) * (180 * S.u) / W, rng.range(0.03, 0.07) * (1000 / Math.max(W, 300)), rng.range(0.6, 1)]);
      } else S.bandPeaks = [];

      var B = S.nb = {};
      ["sky", "far", "mid", "near", "mistA", "mistB"].forEach(function (n) { B[n] = document.createElement("canvas"); });
      var cs = sizeLayer(B.sky, Wt, Ht, Math.max(0.35, S.dpr * 0.5), S.m);
      var cf = sizeLayer(B.far, Wt, Ht, S.dpr, S.m);
      S.k = B.far.width / Wt;
      var cm = sizeLayer(B.mid, Wt, Ht, S.dpr, S.m);
      var cn = sizeLayer(B.near, Wt, Ht, S.dpr, S.m);
      S.lampSpr = glowSprite("#ffcf8a", 3.4 * S.u, S.dpr, 1);
      var tp = [];
      function lap() { tp.push(Math.round(performance.now())); }
      return [
        function () { lap(); paintSky(S, cs, P, rng); },
        function () { lap(); paintFar(S, cf, P, rng); },
        function () { lap(); paintMid(S, cm, P, rng); },
        function () { lap(); paintNear(S, cn, P, rng); },
        function () {
          lap();
          var mistRng = makeRng(S.seed + 77);
          if (P.mistA) paintMist(S, B.mistA, P.mistA, ["#9a74e6", "#c9a2ff", "#ff6fd8"], P.band ? 10 : 18, mistRng, P.band ? 0.9 : 1.6); else B.mistA = null;
          if (P.mistB) paintMist(S, B.mistB, P.mistB, ["#a184ea", "#ff8fe0", "#7a5cc8"], 16, mistRng, 1.3); else B.mistB = null;
          setupRuntime(S, P, rng);
          lap();
          S.genParts = tp.slice(1).map(function (v, j) { return v - tp[j]; });
        }
      ];
    }
    function finish() {
      var B = S.nb;
      S.nb = null;
      ["sky", "far", "mid", "near"].forEach(function (n) {
        var oc = el[n], nc = B[n];
        nc.className = oc.className;
        nc.style.translate = oc.style.translate;
        root.replaceChild(nc, oc);
        oc.width = 1; oc.height = 1;
        el[n] = nc; ctx[n] = nc.getContext("2d");
      });
      // Mist canvases keep their running CSS drift: copy the new pixels into them.
      ["mistA", "mistB"].forEach(function (n) {
        var t = B[n], d = el[n];
        if (!t) { d.style.display = "none"; return; }
        d.style.display = "";
        d.width = t.width; d.height = t.height;
        d.style.width = t.style.width; d.style.height = t.style.height; d.style.left = t.style.left; d.style.top = t.style.top;
        d.getContext("2d").drawImage(t, 0, 0);
        t.width = 1; t.height = 1;
      });
      setupBeams(S, S.P);
      var Wt = S.W + 2 * S.m, Ht = S.H + 2 * S.m;
      sizeLayer(el.dyn, Wt, Ht, S.dpr, S.m);
      sizeLayer(el.fx, Wt, Ht, S.dpr, S.m);
      var sr = S.P.scrim;
      if (sr) {
        scrim.style.display = "";
        scrim.style.left = (sr.x - sr.w * 0.12) + "px"; scrim.style.top = (sr.y - sr.h * 0.1) + "px";
        scrim.style.width = sr.w * 1.24 + "px"; scrim.style.height = sr.h * 1.2 + "px";
      } else scrim.style.display = "none";
      S.building = false;
      S.generated = true;
      S.genMs = S.buildMs;
      if (S.fontsReady && !S.ignited && S.motion) { S.igniteAt = S.clock + 0.25; S.ignited = true; }
      S.apx = 1e9;
      applyParallax(true);
      root.classList.remove("is-pending");
      if (!S.motion || !S.raf) renderStill();
      else renderFrame(S, S.clock, false);
      sync();
    }

    // (Re)build for the current box and page layout. Deferred until the sign fonts are ready (or a short
    // timeout passes) and the box is near the viewport, so a footer band costs nothing at page load.
    function measure(force) {
      if (S.destroyed) return;
      if (!S.canStart || !S.nearView) { S.dirty = true; return; }
      var W = Math.round(root.clientWidth || container.clientWidth), H = Math.round(root.clientHeight || container.clientHeight);
      if (!W || !H) { S.dirty = true; return; }
      var Z = zonesFor(W, H), sig = W + "x" + H + "|" + zonesSig(Z) + "|" + (S.fontsExact ? 1 : 0);
      if (!force && (S.generated || S.building) && sig === S.sig) return;
      S.sig = sig; S.dirty = false;
      startBuild(W, H, Z);
    }

    function renderStill() {
      if (!S.P || S.building || !S.generated) return;
      var T = S.train;
      if (!S.motion && T) {
        T.wait = 0; T.dir = 1;
        T.x = S.liziba ? S.liziba.x + S.liziba.w - T.L * 0.4 : S.W * 0.55;
      }
      renderFrame(S, S.motion ? S.clock : 12.5, !S.motion);
    }

    function applyParallax(force) {
      var u = S.u, ax = -S.px * 24 * u, ay = -S.py * 10 * u;
      if (!force && Math.abs(ax - S.apx) < 0.04 && Math.abs(ay - S.apy) < 0.04) return;
      S.apx = ax; S.apy = ay;
      for (var name in S.depth) {
        var node = el[name], v = S.depth[name];
        if (node) node.style.translate = (ax * v).toFixed(2) + "px " + (ay * v).toFixed(2) + "px";
      }
    }

    function tick(now) {
      S.raf = requestAnimationFrame(tick);
      if (S.building) return;
      var elapsed = now - S.last;
      // About 60 fps on high-refresh screens (30 for the band): skip frames that come too soon.
      if (elapsed < (mode === "band" ? 30 : 12)) return;
      S.last = now;
      var dt = Math.min(Math.max(elapsed, 0) / 1000, 0.1);
      var p0 = performance.now();
      S.clock += dt;
      var e = 1 - Math.exp(-dt * 4);
      S.px += (S.ptx - S.px) * e;
      S.py += (S.pty - S.py) * e;
      applyParallax(false);
      update(S, dt);
      renderFrame(S, S.clock, false);
      var ms = performance.now() - p0, st = S.stat;
      st.n++; st.sum += ms; if (ms > st.max) st.max = ms;
      st.recent.push(ms); if (st.recent.length > 240) st.recent.shift();
    }

    function sync() {
      if (S.destroyed) return;
      var run = S.generated && S.motion && S.visible && !document.hidden;
      root.classList.toggle("is-still", !S.motion);
      root.classList.toggle("is-offscreen", !S.visible || document.hidden);
      if (run && !S.raf) { S.last = performance.now(); S.raf = requestAnimationFrame(tick); }
      else if (!run && S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
    }

    var ro = null, io = null, rt = 0;
    function later(ms) { clearTimeout(rt); rt = setTimeout(function () { measure(false); }, ms); }
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () { later(S.W ? 160 : 0); });
      ro.observe(root);
      // Re-measure when the page content over the city changes size (fonts, copy edits, responsive changes).
      try {
        var watched = typeof avoidSrc === "function" ? avoidSrc() : avoidSrc;
        if (watched && !(watched instanceof Array)) watched = [watched];
        (watched || []).forEach(function (it) { var n = it && (it.nodeType === 1 ? it : it.el); if (n && n.nodeType === 1) ro.observe(n); });
      } catch (e) {}
    } else {
      window.addEventListener("resize", onWinResize);
    }
    function onWinResize() { later(160); }
    var ioNear = null;
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        S.visible = entries[entries.length - 1].isIntersecting;
        sync();
      }, { rootMargin: "80px" });
      io.observe(root);
      ioNear = new IntersectionObserver(function (entries) {
        S.nearView = entries[entries.length - 1].isIntersecting;
        if (S.nearView && (S.dirty || !S.generated)) measure(!S.generated);
      }, { rootMargin: "700px 0px" });
      ioNear.observe(root);
    } else S.nearView = true;
    function onVis() { sync(); }
    document.addEventListener("visibilitychange", onVis);

    // Fonts: the first build waits up to 700 ms for the sign fonts. If they arrive later, the city is rebuilt
    // in the background (same layout, crisp signs) and swapped in.
    var startTimer = 0;
    function begin() {
      if (S.canStart || S.destroyed) return;
      clearTimeout(startTimer);
      S.canStart = true;
      S.fontsReady = true;
      S.fontsExact = fontsAvailable();
      measure(true);
    }
    function onFontsLate() {
      if (S.destroyed || S.fontsExact || !fontsAvailable()) return;
      S.fontsExact = true;
      measure(true);
    }
    S.fontsExact = S.fontsReady;
    if (S.fontsReady) S.canStart = true;
    else {
      waitFonts().then(function () { if (S.canStart) onFontsLate(); else begin(); });
      startTimer = setTimeout(begin, 700);
    }
    function onLoadingDone() { if (S.canStart) { onFontsLate(); later(200); } }
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", onLoadingDone);

    measure(true);
    sync();

    var api = {
      setMotion: function (on) {
        on = !!on;
        if (on === S.motion) return;
        S.motion = on;
        if (!on) { S.ptx = S.pty = S.px = S.py = 0; applyParallax(true); renderStill(); }
        else if (!S.ignited && S.fontsReady) { S.igniteAt = S.clock + 0.2; S.ignited = true; }
        sync();
      },
      setPointer: function (nx, ny) {
        if (!S.motion) return;
        S.ptx = clamp(+nx || 0, -1, 1);
        S.pty = clamp(+ny || 0, -1, 1);
      },
      resize: function () { measure(true); },
      destroy: function () {
        if (S.destroyed) return;
        S.destroyed = true;
        if (S.raf) cancelAnimationFrame(S.raf);
        S.raf = 0;
        clearTimeout(rt);
        clearTimeout(startTimer);
        dropPending();
        if (ro) ro.disconnect(); else window.removeEventListener("resize", onWinResize);
        if (io) io.disconnect();
        if (ioNear) ioNear.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        if (document.fonts && document.fonts.removeEventListener) document.fonts.removeEventListener("loadingdone", onLoadingDone);
        for (var n in el) if (el[n] && el[n].tagName === "CANVAS") { el[n].width = 1; el[n].height = 1; }
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      // Diagnostics: per-frame JS cost of the animation loop, and the last build (total and longest step).
      stats: function () {
        var st = S.stat, r = st.recent.slice().sort(function (a, b) { return a - b; });
        return {
          frames: st.n, avgMs: st.n ? +(st.sum / st.n).toFixed(3) : 0, maxMs: +st.max.toFixed(3),
          p95Ms: r.length ? +r[Math.floor(r.length * 0.95)].toFixed(3) : 0, genMs: +S.genMs.toFixed(1), longestStepMs: +S.longestStep.toFixed(1),
          dpr: +S.dpr.toFixed(3), size: S.W + "x" + S.H, canvasPx: el.far.width + "x" + el.far.height,
          generated: !!S.generated, signs: S.generated ? S.signsDyn.length + S.signsFx.length : 0, lanterns: S.generated ? S.lanterns.length : 0,
          ripples: S.generated ? S.ripples.length : 0, twinkles: S.twk ? S.twk.dyn.length + S.twk.fx.length : 0, parts: S.genParts,
          running: !!S.raf, fonts: S.fontsReady, fontsExact: !!S.fontsExact,
          words: S.generated ? S.signLog.slice() : [], shows: S.generated ? S.shows.length : 0,
          zones: S.Z ? JSON.parse(JSON.stringify(S.Z, function (k, v) { return typeof v === "number" ? Math.round(v) : v; })) : null
        };
      }
    };
    // Diagnostics handle for tests and devtools (the container's city root carries its instance).
    try { Object.defineProperty(root, "neonCity", { value: api }); } catch (e) {}
    return api;
  }

  window.NeonCity = { mount: mount, glyphs: GLYPHS, words: WORDS, ticker: TICKER, version: "1.2.0" };
})();
