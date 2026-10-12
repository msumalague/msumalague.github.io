/**
 * fx.js: neon night-city color and ambient motion for everything below the hero.
 * Classic script, loaded with defer after js/main.js. No dependencies.
 *
 * Injects decorative DOM only (every node is aria-hidden and ignores the pointer):
 * glow orbs per section, a two-row tech ticker between Projects and Skills, a comet on
 * the experience rail, Japanese neon signs, an email pulse ring, a katakana data rain
 * canvas, and an animated footer border. Adds progressive effects to existing markup:
 * section tag decode on reveal, neon title ink, card spotlights, staggered skill tags.
 *
 * Motion: honors prefers-reduced-motion and html.motion-paused (set by main.js), and
 * stops work for offscreen hosts (IntersectionObserver) and background tabs.
 */
(function () {
  "use strict";
  if (window.__fxReady) return;
  window.__fxReady = true;

  var doc = document.documentElement;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var mm = function (q) { return window.matchMedia ? window.matchMedia(q) : { matches: false }; };
  var reduceQuery = mm("(prefers-reduced-motion: reduce)");
  var finePointer = mm("(hover: hover) and (pointer: fine)").matches;
  var SECTIONS = ["about", "projects", "skills", "experience", "contact"];

  function motionOK() { return !reduceQuery.matches && !doc.classList.contains("motion-paused"); }
  function decor(tag, cls) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    node.setAttribute("aria-hidden", "true");
    return node;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* -------------------------------------------------------- motion state */
  var motionSubs = [];
  var lastMotion = motionOK();
  function onMotion(fn) { motionSubs.push(fn); }
  function checkMotion() {
    var now = motionOK();
    if (now === lastMotion) return;
    lastMotion = now;
    motionSubs.forEach(function (fn) { try { fn(now); } catch (err) { /* keep others running */ } });
  }
  if (window.MutationObserver) new MutationObserver(checkMotion).observe(doc, { attributes: true, attributeFilter: ["class"] });
  if (reduceQuery.addEventListener) reduceQuery.addEventListener("change", checkMotion);
  else if (reduceQuery.addListener) reduceQuery.addListener(checkMotion);

  /* ---------------------------------------------- offscreen host tracking */
  // Hosts start as .fx-off (paused) and switch on when near the viewport.
  var visSubs = [];
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var on = entry.isIntersecting;
      entry.target.__fxVisible = on;
      entry.target.classList.toggle("fx-off", !on);
      visSubs.forEach(function (s) { if (s.host === entry.target) s.fn(on); });
    });
  }, { rootMargin: "200px 0px" }) : null;
  function watch(host, fn) {
    if (fn) {
      visSubs.push({ host: host, fn: fn });
      if (host.__fxVisible !== undefined) fn(host.__fxVisible);
      else if (!io) fn(true);
    }
    if (host.__fxWatched || !io) return;
    host.__fxWatched = true;
    host.classList.add("fx-off");
    io.observe(host);
  }

  /* -------------------------------------------------- sections + glow orbs */
  // [color slot, top %, left %, size rem] per section
  var ORBS = {
    about: [["a", 6, -14, 34], ["b", 58, 72, 30]],
    projects: [["a", 3, 66, 36], ["b", 36, -16, 32], ["a", 70, 74, 30]],
    skills: [["a", 8, -14, 32], ["b", 46, 70, 30]],
    experience: [["a", 4, 70, 34], ["b", 52, -14, 32]],
    contact: [["b", 10, -12, 34], ["a", 34, 70, 34]],
  };
  function initSections() {
    SECTIONS.forEach(function (id) {
      var section = document.getElementById(id);
      if (!section || section.__fxHost) return;
      section.__fxHost = true;
      section.classList.add("fx-host");
      var amb = decor("div", "fx-amb");
      (ORBS[id] || []).forEach(function (o) {
        var orb = document.createElement("span");
        orb.className = "fx-orb fx-orb--" + o[0];
        orb.style.cssText = "top:" + o[1] + "%;left:" + o[2] + "%;--s:" + o[3] + "rem";
        amb.appendChild(orb);
      });
      section.insertBefore(amb, section.firstChild);
      watch(section);
    });
  }

  /* -------------------------------------------------------- section titles */
  function initTitles() {
    $$(".section .section-title").forEach(function (h) {
      if (h.querySelector(".fx-ink")) return;
      var plain = Array.prototype.every.call(h.childNodes, function (n) {
        return n.nodeType === 3 || (n.nodeType === 1 && /^(BR|WBR|EM|STRONG|SPAN|B|I)$/.test(n.tagName));
      });
      if (!plain || !h.textContent.trim()) return;
      var ink = document.createElement("span");
      ink.className = "fx-ink";
      while (h.firstChild) ink.appendChild(h.firstChild);
      h.appendChild(ink);
      h.classList.add("fx-title");
    });
    // Contact heading also gets a flickering neon glow (a blurred, aria-free copy of its text).
    var contactTitle = $("#contact .section-title");
    if (contactTitle && !contactTitle.querySelector("br")) {
      contactTitle.setAttribute("data-fx-text", contactTitle.textContent.replace(/\s+/g, " ").trim());
      contactTitle.classList.add("fx-neon-title");
    }
  }

  /* -------------------------------------------------- section tag decode */
  // Screen readers always get the real text: the scrambled copy is aria-hidden and the
  // real label keeps its box (only its color is hidden while decoding), so nothing shifts.
  var GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFGHJKLMNPRSTUVXYZ#%&*+=<>/";
  function randomGlyph() { return GLYPHS.charAt((Math.random() * GLYPHS.length) | 0); }

  function decode(wrap) {
    var real = wrap.firstChild;
    var text = real.textContent;
    if (!text.trim() || wrap.__fxRunning) return;
    wrap.__fxRunning = true;
    var fx = decor("span", "fx-decode__fx");
    wrap.appendChild(fx);
    wrap.classList.add("is-decoding");
    var n = text.length;
    var start = 0, lastSwap = 0, raf = 0;
    var DURATION = 720, LEAD = 140;

    function finish() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      wrap.classList.remove("is-decoding");
      if (fx.parentNode) fx.parentNode.removeChild(fx);
      wrap.__fxRunning = false;
    }
    function frame(t) {
      if (!start) start = t;
      var elapsed = t - start;
      if (elapsed >= LEAD + DURATION || !motionOK()) { finish(); return; }
      if (t - lastSwap > 48) {
        lastSwap = t;
        var p = (elapsed - LEAD) / DURATION;
        var html = "";
        for (var i = 0; i < n; i++) {
          var ch = text.charAt(i);
          var resolveAt = 0.18 + 0.78 * (i / Math.max(1, n - 1));
          if (ch === " " || p >= resolveAt) html += esc(ch);
          else html += '<span class="fx-g">' + esc(randomGlyph()) + "</span>";
        }
        fx.innerHTML = html;
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }

  function initDecode() {
    $$(".section .section-tag").forEach(function (tag) {
      if (tag.querySelector(".fx-decode")) return;
      var textNode = null;
      Array.prototype.forEach.call(tag.childNodes, function (n) {
        if (n.nodeType === 3 && n.nodeValue.trim()) textNode = n;
      });
      if (!textNode) return;
      var wrap = document.createElement("span");
      wrap.className = "fx-decode";
      var real = document.createElement("span");
      real.className = "fx-decode__real";
      real.textContent = textNode.nodeValue.trim();
      wrap.appendChild(real);
      tag.replaceChild(wrap, textNode);

      var revealer = tag.closest("[data-reveal]");
      // Only decode when the tag is revealed by scrolling (not when already visible).
      if (!revealer || revealer.classList.contains("is-in") || !doc.classList.contains("reveal-on") || !window.MutationObserver) return;
      var mo = new MutationObserver(function () {
        if (!revealer.classList.contains("is-in")) return;
        mo.disconnect();
        if (motionOK()) decode(wrap);
      });
      mo.observe(revealer, { attributes: true, attributeFilter: ["class"] });
    });
  }

  /* ------------------------------------------------------------ tech ticker */
  // Real tools from the skills section, interleaved with Japanese words:
  // 生成AI generative AI, 人工知能 artificial intelligence, 開発 development, 未来 future,
  // 機械学習 machine learning, 深層学習 deep learning, 画像認識 image recognition, データ data, 自動化 automation.
  var ROW_A = ["Claude", "OpenAI", "Gemini", { jp: "生成AI" }, "RAG", "MCP", "FastAPI", { jp: "人工知能" }, "React", "TypeScript", "Flutter", "Dart", "Firebase", "PostgreSQL", { jp: "開発" }, "Python", "Docker", "AWS", { jp: "未来" }];
  var ROW_B = ["XGBoost", "LightGBM", { jp: "機械学習" }, "scikit-learn", "TensorFlow", { jp: "深層学習" }, "OpenCV", "MediaPipe", "YOLO", { jp: "画像認識" }, "dbt", "Redash", "Airflow", { jp: "データ" }, "Jetson", "Raspberry Pi", { jp: "自動化" }];

  function pillsMarkup(items, offset) {
    return items.map(function (item, i) {
      var tone = " fx-p" + (((i + offset) % 4) + 1);
      if (typeof item === "object") return '<span class="fx-pill fx-pill--jp' + tone + '" lang="ja">' + esc(item.jp) + "</span>";
      return '<span class="fx-pill' + tone + '">' + esc(item) + "</span>";
    }).join("");
  }

  function initTicker() {
    var projects = document.getElementById("projects");
    if (!projects || !projects.parentNode || $(".fx-ticker")) return;
    var ticker = decor("div", "fx-ticker");
    var rows = [
      { set: pillsMarkup(ROW_A, 0), speed: 34, cls: "fx-ticker__row" },
      { set: pillsMarkup(ROW_B, 2), speed: 28, cls: "fx-ticker__row fx-ticker__row--rev" },
    ];
    rows.forEach(function (r) {
      var row = document.createElement("div");
      row.className = r.cls;
      r.track = document.createElement("div");
      r.track.className = "fx-ticker__track";
      row.appendChild(r.track);
      ticker.appendChild(row);
      r.k = 0;
    });
    projects.parentNode.insertBefore(ticker, projects.nextSibling);

    // Repeat the set until one half of the track covers the viewport, then double it:
    // translating by -50% lands exactly on the copy, so the loop is seamless.
    function layout(force) {
      var vw = ticker.clientWidth || window.innerWidth;
      rows.forEach(function (r) {
        if (!r.setW || force) {
          r.track.innerHTML = r.set;
          r.setW = r.track.scrollWidth || 1;
          r.k = 0;
        }
        var k = Math.max(1, Math.ceil(vw / r.setW));
        if (k === r.k) return;
        r.k = k;
        var unit = new Array(k + 1).join(r.set);
        r.track.innerHTML = unit + unit;
        r.track.style.setProperty("--fx-dur", Math.round((r.setW * k) / r.speed) + "s");
      });
    }
    layout(true);
    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { layout(false); }, 200);
    }, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(true); });
    watch(ticker);
  }

  /* ------------------------------------------------------------------ skills */
  function initSkills() {
    $$(".skill-grid .skill-card").forEach(function (card) {
      $$(".tags li", card).forEach(function (li, i) { li.style.setProperty("--fx-i", String(i)); });
      $$(["path", "circle", "rect", "ellipse", "line", "polyline", "polygon"].map(function (t) { return ".skill-card__icon svg " + t; }).join(","), card).forEach(function (shape) {
        shape.setAttribute("pathLength", "100");
        shape.classList.add("fx-draw");
      });
      if (!card.querySelector(":scope > .fx-spot")) card.insertBefore(decor("span", "fx-spot"), card.firstChild);
    });
  }

  /* ------------------------------------------------------ card spotlights */
  function initSpotlights() {
    if (!finePointer) return;
    var pending = null, raf = 0;
    function apply() {
      raf = 0;
      var p = pending;
      pending = null;
      if (!p) return;
      var r = p.card.getBoundingClientRect();
      p.card.style.setProperty("--fx-x", Math.round(p.x - r.left) + "px");
      p.card.style.setProperty("--fx-y", Math.round(p.y - r.top) + "px");
    }
    function track(container, selector) {
      if (!container) return;
      container.addEventListener("pointermove", function (e) {
        if (e.pointerType === "touch") return;
        var card = e.target && e.target.closest ? e.target.closest(selector) : null;
        if (!card) return;
        pending = { card: card, x: e.clientX, y: e.clientY };
        if (!raf) raf = requestAnimationFrame(apply);
      }, { passive: true });
    }
    track($("[data-project-grid]"), ".project-card");
    track($(".skill-grid"), ".skill-card");
  }

  /* ---------------------------------------------------------- timeline comet */
  function initTimeline() {
    var rail = $(".timeline__rail");
    if (!rail || rail.querySelector(".fx-comet")) return;
    var comet = decor("span", "fx-comet");
    comet.appendChild(document.createElement("span")).className = "fx-comet__body";
    rail.appendChild(comet);
  }

  /* ----------------------------------------------------------------- contact */
  function initSigns() {
    var panel = $("#contact .contact__panel");
    if (!panel || panel.querySelector(".fx-signs")) return;
    var signs = decor("div", "fx-signs");
    // お問い合わせ = "Contact / inquiries", お気軽にどうぞ = "Feel free (to reach out)"
    signs.innerHTML =
      '<span class="fx-sign" lang="ja">お問い<span class="fx-sign__flick">合</span>わせ</span>' +
      '<span class="fx-sign fx-sign--cyan" lang="ja">お気<span class="fx-sign__flick">軽</span>にどうぞ</span>';
    panel.appendChild(signs);
  }

  function initPulse() {
    var wrap = $("#contact .contact__email");
    var btn = wrap && $(".btn--primary", wrap);
    if (!btn || wrap.querySelector(".fx-pulse")) return;
    var ring = decor("span", "fx-pulse");
    ring.innerHTML =
      '<svg class="fx-pulse__ring" focusable="false"><defs><linearGradient id="fx-pulse-grad" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#b794ff"/><stop offset=".55" stop-color="#ff4fd8"/><stop offset="1" stop-color="#36e2ff"/></linearGradient></defs><path/></svg>' +
      '<svg class="fx-pulse__ring" focusable="false"><path/></svg>';
    wrap.insertBefore(ring, wrap.firstChild);
    var svgs = $$("svg", ring);
    var paths = $$("path", ring);

    function place() {
      var w = btn.offsetWidth, h = btn.offsetHeight;
      if (!w || !h) return;
      var notch = parseFloat(getComputedStyle(btn).getPropertyValue("--notch")) || 12;
      ring.style.cssText = "left:" + btn.offsetLeft + "px;top:" + btn.offsetTop + "px;width:" + w + "px;height:" + h + "px;" +
        "--fx-sx:" + (1 + 30 / w).toFixed(4) + ";--fx-sy:" + (1 + 30 / h).toFixed(4);
      var d = "M0.75 0.75H" + (w - notch) + "L" + (w - 0.75) + " " + notch + "V" + (h - 0.75) + "H" + notch + "L0.75 " + (h - notch) + "Z";
      svgs.forEach(function (s) { s.setAttribute("viewBox", "0 0 " + w + " " + h); });
      paths.forEach(function (p) { p.setAttribute("d", d); });
    }
    place();
    if (window.ResizeObserver) new ResizeObserver(place).observe(wrap);
    else window.addEventListener("resize", place, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
  }

  // Faint katakana "data rain" behind the contact section. Columns step at ~14 Hz and
  // old glyphs fade out with destination-out, so each step only draws the moving heads.
  function initRain() {
    var section = document.getElementById("contact");
    var amb = section && $(":scope > .fx-amb", section);
    if (!amb || amb.querySelector(".fx-rain")) return;
    var canvas = decor("canvas", "fx-rain");
    var ctx = canvas.getContext ? canvas.getContext("2d") : null;
    if (!ctx) return;
    amb.appendChild(canvas);

    var GL = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789";
    var FAMILY = '"DotGothic16", "MS Gothic", "Yu Gothic", "Hiragino Sans", monospace';
    var SIZE = 15, COL = 22, STEP = 72;
    var TONES = ["183,148,255", "183,148,255", "183,148,255", "255,79,216", "54,226,255"];
    var w = 0, h = 0, cols = [], visible = false, seen = false, raf = 0, last = 0, acc = 0, painted = false;

    function glyph() { return GL.charAt((Math.random() * GL.length) | 0); }
    function makeCol(x, anywhere) {
      return {
        x: x,
        y: anywhere ? Math.floor(Math.random() * (h / SIZE)) - 10 : -Math.floor(Math.random() * 30),
        rate: 0.3 + Math.random() * 0.7,
        acc: 0,
        prev: "",
        tone: TONES[(Math.random() * TONES.length) | 0],
        on: Math.random() < 0.5,
      };
    }
    function setFont() {
      ctx.font = SIZE + "px " + FAMILY;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
    }
    function resize() {
      if (!seen) return; // nothing is allocated or drawn until the section first nears the viewport
      var cw = section.clientWidth, ch = section.clientHeight;
      if (!cw || !ch || (cw === w && ch === h)) return;
      w = cw; h = ch;
      canvas.width = w; // 1x on purpose: a faint background texture does not need retina pixels
      canvas.height = h;
      setFont();
      cols = [];
      for (var x = COL / 2; x < w; x += COL) cols.push(makeCol(x, true));
      painted = false;
      if (!running()) paintStatic();
    }
    function advance(c) {
      var py = c.y * SIZE;
      if (c.prev && py >= 0) {
        ctx.clearRect(c.x - COL / 2, py, COL, SIZE);
        ctx.fillStyle = "rgba(" + c.tone + ",0.9)";
        ctx.fillText(c.prev, c.x, py);
      }
      c.y += 1;
      var ny = c.y * SIZE;
      if (ny > h) {
        var fresh = makeCol(c.x, false);
        for (var k in fresh) c[k] = fresh[k];
        return;
      }
      c.prev = glyph();
      if (ny >= 0) {
        ctx.fillStyle = "rgba(246,238,255,0.95)";
        ctx.fillText(c.prev, c.x, ny);
      }
    }
    function step() {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.085)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      for (var i = 0; i < cols.length; i++) {
        var c = cols[i];
        if (!c.on) {
          if (Math.random() < 0.004) c.on = true;
          continue;
        }
        c.acc += c.rate;
        while (c.acc >= 1) { c.acc -= 1; advance(c); }
      }
      painted = true;
    }
    function paintStatic() {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < 48; i++) step();
    }
    function running() { return visible && motionOK() && !document.hidden; }
    function frame(t) {
      raf = 0;
      if (!running()) return;
      if (last) acc += Math.min(t - last, 250);
      last = t;
      var guard = 0;
      while (acc >= STEP && guard++ < 3) { acc -= STEP; step(); }
      if (guard >= 3) acc = 0;
      raf = requestAnimationFrame(frame);
    }
    function update() {
      if (running()) {
        if (!raf) { last = 0; acc = 0; raf = requestAnimationFrame(frame); }
      } else {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (!painted && visible) paintStatic();
      }
    }

    if (window.ResizeObserver) new ResizeObserver(resize).observe(section);
    else window.addEventListener("resize", resize, { passive: true });
    if (document.fonts && document.fonts.load) {
      document.fonts.load(SIZE + 'px "DotGothic16"', "アイウ").then(function () { setFont(); }, function () {});
    }
    watch(section, function (on) {
      visible = on;
      if (on) { seen = true; resize(); }
      update();
    });
    onMotion(update);
    document.addEventListener("visibilitychange", update);
  }

  /* ------------------------------------------------------------------- footer */
  function initFooter() {
    var footer = $(".site-footer");
    if (!footer || footer.querySelector(".fx-footline")) return;
    var line = decor("div", "fx-footline");
    line.appendChild(document.createElement("span")).className = "fx-footline__beam";
    footer.insertBefore(line, footer.firstChild);
    footer.insertBefore(decor("div", "fx-footglow"), line.nextSibling);
    watch(footer);
  }

  /* --------------------------------------------------------------------- run */
  function run(fn) {
    try { fn(); } catch (err) { if (window.console) console.error("fx:", err); }
  }
  function init() {
    run(initSections);
    run(initTitles);
    run(initDecode);
    run(initTicker);
    run(initSkills);
    run(initSpotlights);
    run(initTimeline);
    run(initSigns);
    run(initPulse);
    run(initRain);
    run(initFooter);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
