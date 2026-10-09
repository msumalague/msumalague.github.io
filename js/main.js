/**
 * Portfolio interactions. Vanilla JS, no dependencies.
 * Everything degrades gracefully: without JS the content is static and readable,
 * and prefers-reduced-motion (or the hero's "Pause motion" control) turns ambient motion off.
 */
(function () {
  "use strict";

  var doc = document.documentElement;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduceMotion = motionQuery.matches;
  var userPausedMotion = false;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var scene = null; // { setMotion(enabled) } once the hero scene is initialised

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function icon(id, cls) {
    return '<svg' + (cls ? ' class="' + cls + '"' : "") + ' aria-hidden="true"><use href="#' + id + '"/></svg>';
  }
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function motionAllowed() { return !reduceMotion && !userPausedMotion; }
  function storageGet(key) { try { return window.localStorage.getItem(key); } catch (err) { return null; } }
  function storageSet(key, value) { try { window.localStorage.setItem(key, value); } catch (err) { /* private mode */ } }

  /* ------------------------------------------------------------------ header */
  function initHeader() {
    var header = $("[data-header]");
    if (!header) return;
    var ticking = false;
    function update() {
      header.classList.toggle("is-scrolled", window.scrollY > 24);
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ------------------------------------------------------------- mobile menu */
  function initMenu() {
    var toggle = $("[data-menu-toggle]");
    var nav = $("#site-nav");
    var header = $("[data-header]");
    if (!toggle || !nav) return;
    var inertTargets = [$("main"), $(".site-footer"), $(".skip-link")];

    function setOpen(open, returnFocus) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.querySelector(".visually-hidden").textContent = open ? "Close menu" : "Menu";
      nav.classList.toggle("is-open", open);
      document.body.classList.toggle("menu-open", open);
      inertTargets.forEach(function (el) { if (el) el.inert = open; });
      if (open) {
        nav.scrollTop = 0;
        var first = nav.querySelector("a");
        if (first) first.focus();
      } else if (returnFocus) {
        toggle.focus();
      }
    }

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    // Any link in the header (nav items, brand, profiles) closes the open menu.
    (header || nav).addEventListener("click", function (e) {
      if (e.target.closest("a") && nav.classList.contains("is-open")) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) setOpen(false, true);
    });
    window.matchMedia("(min-width: 52.0625em)").addEventListener("change", function (mq) {
      if (mq.matches && nav.classList.contains("is-open")) setOpen(false);
    });
  }

  /* ------------------------------------------------------- active nav state */
  function initActiveNav() {
    var links = $$("[data-nav]");
    var indicator = $(".site-nav__indicator");
    if (!links.length || !("IntersectionObserver" in window)) return;
    var current = null;

    function moveIndicator() {
      if (!indicator) return;
      var link = current && links.filter(function (l) { return l.hash === "#" + current; })[0];
      if (!link || !link.offsetWidth) { indicator.style.opacity = "0"; return; }
      var pad = 14;
      indicator.style.width = (link.offsetWidth - pad * 2) + "px";
      indicator.style.transform = "translateX(" + (link.offsetLeft + pad) + "px)";
      indicator.style.opacity = "1";
    }
    function setCurrent(id) {
      if (id === current) return;
      current = id;
      links.forEach(function (l) {
        if (l.hash === "#" + id) l.setAttribute("aria-current", "true");
        else l.removeAttribute("aria-current");
      });
      moveIndicator();
    }

    var sections = links.map(function (l) { return $(l.hash); }).filter(Boolean);
    var hero = $("#top");
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setCurrent(entry.target.id === "top" ? null : entry.target.id);
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { observer.observe(s); });
    if (hero) observer.observe(hero);
    window.addEventListener("resize", moveIndicator, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveIndicator);
  }

  /* ------------------------------------------------------------ scroll reveal */
  function revealAll() {
    $$("[data-reveal]").forEach(function (el) { el.classList.add("is-in"); });
  }

  function initReveal() {
    var items = $$("[data-reveal]").filter(function (el) { return !el.classList.contains("is-in"); });
    window.addEventListener("beforeprint", revealAll);
    if (!items.length) return;
    if (reduceMotion || !("IntersectionObserver" in window)) { revealAll(); return; }
    doc.classList.add("reveal-on");
    // Stagger siblings that reveal together (skill cards, timeline entries).
    var groups = new Map();
    items.forEach(function (el) {
      var list = groups.get(el.parentElement) || [];
      list.push(el);
      groups.set(el.parentElement, list);
    });
    groups.forEach(function (list) {
      if (list.length < 3) return;
      list.forEach(function (el, i) { el.style.setProperty("--reveal-delay", Math.min(i * 0.07, 0.35) + "s"); });
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------ projects */
  var filterLabels = window.PORTFOLIO_FILTERS || {};
  var projects = (window.PORTFOLIO_PROJECTS || []).filter(function (p) {
    var ok = p && typeof p.id === "string" && /^[a-z0-9-]+$/.test(p.id) && p.title;
    if (!ok && window.console) console.warn("Skipping invalid project entry (needs a lowercase-hyphenated id and a title):", p);
    return ok;
  }).map(function (p) {
    // Fill in optional fields so one incomplete entry can't break the page.
    return Object.assign({ categories: [], stack: [], built: [], gallery: [], image: {}, context: "", tagline: "", summary: "", problem: "", theme: "vision" }, p);
  });
  var linkIcons = { github: "i-github", doc: "i-doc", demo: "i-external" };
  var themeTags = { agent: "GenAI", vision: "CV", neural: "ML", robotics: "Edge", data: "Data", product: "UI" };

  function hudMarkup(theme) {
    var corners = '<svg class="media-hud__corners" viewBox="0 0 100 100" preserveAspectRatio="none"><path vector-effect="non-scaling-stroke" d="M0 14V0h10M90 0h10v14M100 86v14H90M10 100H0V86"/></svg>';
    var extra = "";
    if (theme === "agent") {
      extra = '<svg class="hud-orbit" viewBox="0 0 64 64"><circle cx="32" cy="32" r="7"/><g class="orbit"><circle cx="32" cy="32" r="24" stroke-dasharray="3 5"/><circle cx="32" cy="8" r="4"/><circle cx="52.8" cy="44" r="4"/><circle cx="11.2" cy="44" r="4"/></g></svg>';
    } else if (theme === "vision") {
      extra = '<div class="hud-scan"></div><svg class="hud-reticle" viewBox="0 0 52 52"><circle cx="26" cy="26" r="9"/><g class="spin"><circle cx="26" cy="26" r="21" stroke-dasharray="7 5"/><path d="M26 2v9M26 41v9M2 26h9M41 26h9"/></g></svg>';
    } else if (theme === "neural") {
      var layers = [[10, [14, 34, 54]], [52, [8, 26, 44, 62]], [94, [24, 44]]];
      var lines = "", nodes = "";
      for (var l = 0; l < layers.length - 1; l++) {
        layers[l][1].forEach(function (y1) {
          layers[l + 1][1].forEach(function (y2) {
            lines += '<line x1="' + layers[l][0] + '" y1="' + y1 + '" x2="' + layers[l + 1][0] + '" y2="' + y2 + '"/>';
          });
        });
      }
      layers.forEach(function (layer) {
        layer[1].forEach(function (y) { nodes += '<circle cx="' + layer[0] + '" cy="' + y + '" r="4"/>'; });
      });
      extra = '<svg class="hud-net" viewBox="0 0 104 70">' + lines + nodes + "</svg>";
    } else if (theme === "robotics") {
      extra = '<svg class="hud-rotor" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" stroke-dasharray="2 4"/><circle cx="32" cy="32" r="4"/><g class="blade"><path d="M32 28V8M32 36v20"/></g><path d="M0 32h6M58 32h6"/></svg>';
    } else if (theme === "data") {
      extra = '<svg class="hud-bars" viewBox="0 0 88 52"><rect x="0" y="26" width="12" height="26"/><rect x="19" y="12" width="12" height="40"/><rect x="38" y="30" width="12" height="22"/><rect x="57" y="4" width="12" height="48"/><rect x="76" y="18" width="12" height="34"/></svg>';
    } else if (theme === "product") {
      extra = '<svg class="hud-grid" viewBox="0 0 52 76"><rect x="2" y="2" width="48" height="72" rx="7"/><path d="M11 15h30M11 24h18M11 36h30v18H11z"/></svg>';
    }
    return '<div class="media-hud" aria-hidden="true">' + corners + '<span class="media-hud__tag">' + esc(themeTags[theme] || "") + "</span>" + extra + "</div>";
  }

  function cardImage(p) {
    var img = p.image;
    if (img.svg) {
      return '<img src="' + esc(encodeURI(img.svg)) + '" alt="' + esc(img.alt) + '" width="800" height="500" loading="lazy" decoding="async">';
    }
    if (!img.base) return "";
    var base = esc(encodeURI("images/projects/" + img.base + "-card-"));
    var sizes = p.featured
      ? "(min-width: 64em) 42rem, (min-width: 44em) 92vw, 100vw"
      : "(min-width: 64em) 24rem, (min-width: 44em) 46vw, 100vw";
    return "<picture>" +
      '<source type="image/webp" srcset="' + base + "640.webp 640w, " + base + '1120.webp 1120w" sizes="' + sizes + '">' +
      '<img src="' + base + '640.jpg" srcset="' + base + "640.jpg 640w, " + base + '1120.jpg 1120w" sizes="' + sizes + '" width="1120" height="700" alt="' + esc(img.alt) + '" loading="lazy" decoding="async"' +
      (img.position ? ' style="object-position:' + esc(img.position) + '"' : "") + ">" +
      "</picture>";
  }

  function metaMarkup(p) {
    return esc(p.context).replace(/ · /g, '<span class="dot" aria-hidden="true">/</span>');
  }

  function linkMarkup(link, cls) {
    return '<a class="' + cls + '" href="' + esc(link.url) + '" target="_blank" rel="noopener noreferrer">' +
      icon(linkIcons[link.type] || "i-external") + esc(link.label) +
      '<span class="visually-hidden"> (opens in a new tab)</span></a>';
  }

  function cardMarkup(p) {
    var links = (p.links || []).map(function (l) { return linkMarkup(l, "action-link"); }).join("");
    var privateNote = !p.links && p.privateNote
      ? '<span class="private-note">' + icon("i-lock") + esc(p.privateNote) + "</span>" : "";
    return '<li class="' + (p.featured ? "is-featured" : "") + '" data-categories="' + esc(p.categories.join(" ")) + '" style="view-transition-name: card-' + p.id + '">' +
      '<article class="project-card' + (p.featured ? " project-card--featured" : "") + '" data-theme="' + esc(p.theme) + '" aria-labelledby="p-' + p.id + '-title">' +
        (p.featured ? '<span class="featured-flag">Featured</span>' : "") +
        '<div class="project-card__media' + (p.image.svg ? " project-card__media--svg" : "") + '">' + cardImage(p) + hudMarkup(p.theme) + "</div>" +
        '<div class="project-card__body">' +
          '<p class="project-card__meta">' + metaMarkup(p) + "</p>" +
          '<h3 class="project-card__title" id="p-' + p.id + '-title">' + esc(p.title) + "</h3>" +
          '<p class="project-card__tagline">' + esc(p.tagline) + "</p>" +
          '<p class="project-card__summary">' + esc(p.summary) + "</p>" +
          (p.stack.length ? '<ul class="tags" aria-label="Technologies">' + p.stack.slice(0, p.featured ? 6 : 4).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul>" : "") +
          '<div class="project-card__actions">' +
            '<button class="action-link action-link--primary" type="button" data-open-project="' + p.id + '" aria-haspopup="dialog">Case details' + icon("i-arrow") + '<span class="visually-hidden">: ' + esc(p.title) + "</span></button>" +
            links + privateNote +
          "</div>" +
        "</div>" +
      "</article></li>";
  }

  function initProjects() {
    var grid = $("[data-project-grid]");
    if (!grid) return;
    if (!projects.length) {
      // Data failed to load: hide the controls and show plain repository links instead.
      var filters = $(".filters");
      var fallback = $("[data-projects-fallback]");
      if (filters) filters.hidden = true;
      if (fallback) fallback.hidden = false;
      return;
    }
    grid.innerHTML = projects.map(cardMarkup).join("");
    var items = Array.prototype.slice.call(grid.children);
    items.forEach(function (li) { li.setAttribute("data-reveal", ""); });

    var buttons = $$("[data-filter]");
    var countEl = $("[data-filter-count]");
    buttons.forEach(function (btn) {
      var key = btn.getAttribute("data-filter");
      var n = key === "all" ? projects.length : projects.filter(function (p) { return p.categories.indexOf(key) !== -1; }).length;
      btn.insertAdjacentHTML("beforeend", '<span class="chip-count" aria-hidden="true">' + n + "</span>");
      if (n === 0) btn.hidden = true;
    });

    function apply(key, initial) {
      var shown = 0;
      items.forEach(function (li) {
        var match = key === "all" || li.getAttribute("data-categories").split(" ").indexOf(key) !== -1;
        var wasHidden = li.hidden;
        li.hidden = !match;
        if (match) {
          shown++;
          if (!initial) li.classList.add("is-in");
          if (wasHidden && !document.startViewTransition && !reduceMotion) {
            li.classList.remove("is-entering");
            void li.offsetWidth;
            li.style.setProperty("--enter-delay", (shown - 1) * 0.05 + "s");
            li.classList.add("is-entering");
          }
        }
      });
      if (countEl) {
        countEl.textContent = key === "all"
          ? "Showing all " + shown + " projects"
          : "Showing " + shown + " of " + projects.length + " · " + (filterLabels[key] || key);
      }
    }

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.getAttribute("aria-pressed") === "true") return;
        buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
        var key = btn.getAttribute("data-filter");
        if (document.startViewTransition && !reduceMotion) document.startViewTransition(function () { apply(key); });
        else apply(key);
      });
    });
    apply("all", true);

    grid.addEventListener("click", function (e) {
      var trigger = e.target.closest("[data-open-project]");
      if (trigger) openProject(trigger.getAttribute("data-open-project"), trigger);
    });
    grid.addEventListener("animationend", function (e) {
      if (e.target.classList && e.target.classList.contains("is-entering")) e.target.classList.remove("is-entering");
    });
  }

  /* -------------------------------------------------------------- project dialog */
  var dialog, dialogContent, lastTrigger, currentProject;
  var closeTimer = 0;
  var pressedBackdrop = false;

  function pictureFull(item, eager) {
    if (item.svg) return '<img src="' + esc(encodeURI(item.svg)) + '" alt="' + esc(item.alt) + '" width="800" height="500"' + (eager ? "" : ' loading="lazy"') + ">";
    var src = esc(encodeURI(item.src));
    return '<picture><source type="image/webp" srcset="' + src + '.webp"><img src="' + src + '.jpg" alt="' + esc(item.alt) + '"' + (eager ? "" : ' loading="lazy"') + ' decoding="async"></picture>';
  }

  function dialogMarkup(p, index) {
    var gallery = p.gallery;
    var first = gallery[0];
    var thumbs = gallery.length > 1
      ? '<div class="dialog__thumbs" role="group" aria-label="Project images">' + gallery.map(function (g, i) {
          return '<button type="button" data-thumb="' + i + '" aria-current="' + (i === 0) + '" aria-label="Show image ' + (i + 1) + " of " + gallery.length + '">' + pictureFull(g) + "</button>";
        }).join("") + "</div>"
      : "";
    var links = (p.links || []).map(function (l) { return linkMarkup(l, "btn btn--ghost"); }).join("");
    var privateNote = !p.links && p.privateNote ? '<span class="private-note">' + icon("i-lock") + esc(p.privateNote) + "</span>" : "";

    return '<div class="dialog__bar"><span>Project ' + String(index + 1).padStart(2, "0") + " / " + String(projects.length).padStart(2, "0") + "</span>" +
        '<button class="dialog__close" type="button" data-dialog-close aria-label="Close project details">' + icon("i-close") + "</button></div>" +
      (first ? '<figure class="dialog__media"><div data-dialog-image>' + pictureFull(first, true) + '</div><figcaption class="dialog__caption" data-dialog-caption>' + esc(first.caption || "") + "</figcaption></figure>" : "") +
      thumbs +
      '<div class="dialog__body">' +
        '<header class="dialog__head"><p class="project-card__meta">' + metaMarkup(p) + "</p>" +
          '<h2 class="dialog__title" id="dialog-title">' + esc(p.title) + "</h2>" +
          '<p class="dialog__tagline">' + esc(p.tagline) + "</p>" +
          '<p class="dialog__summary">' + esc(p.summary) + "</p></header>" +
        '<div class="dialog__cols">' +
          (p.problem ? '<section class="dialog__block"><h3>The problem</h3><p>' + esc(p.problem) + "</p></section>" : "") +
          (p.built.length ? '<section class="dialog__block"><h3>What I built</h3><ul class="bullets">' + p.built.map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("") + "</ul></section>" : "") +
          (p.stack.length ? '<section class="dialog__block dialog__block--wide"><h3>Stack</h3><ul class="tags">' + p.stack.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul></section>" : "") +
        "</div>" +
        (p.note ? '<p class="dialog__note">' + esc(p.note) + "</p>" : "") +
        ((links || privateNote) ? '<div class="dialog__links">' + links + privateNote + "</div>" : "") +
      "</div>";
  }

  function cancelPendingClose() {
    clearTimeout(closeTimer);
    closeTimer = 0;
    if (dialog) dialog.classList.remove("is-closing");
  }

  function openProject(id, trigger) {
    var index = -1;
    projects.some(function (p, i) { if (p.id === id) { index = i; return true; } return false; });
    if (index === -1 || !dialog || typeof dialog.showModal !== "function") return;
    var p = projects[index];
    cancelPendingClose();
    currentProject = p;
    // Opened from a shared link: return focus to the matching card when the dialog closes.
    lastTrigger = trigger || $('[data-open-project="' + id + '"]');
    dialogContent.innerHTML = dialogMarkup(p, index);
    dialog.setAttribute("data-theme", p.theme);
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    document.body.classList.add("dialog-open");
    var closeBtn = $("[data-dialog-close]", dialog);
    if (closeBtn) closeBtn.focus();
    if (history.replaceState) history.replaceState(null, "", "#project-" + id);
  }

  function closeDialog() {
    if (!dialog || !dialog.open || dialog.classList.contains("is-closing")) return;
    if (reduceMotion) { dialog.close(); return; }
    dialog.classList.add("is-closing");
    closeTimer = setTimeout(function () {
      closeTimer = 0;
      if (!dialog.classList.contains("is-closing")) return;
      dialog.classList.remove("is-closing");
      dialog.close();
    }, 260);
  }

  function projectIdFromHash() {
    var match = location.hash.match(/^#project-(.+)$/);
    if (!match) return null;
    try { return decodeURIComponent(match[1]); } catch (err) { return match[1]; }
  }

  function openFromHash(scroll) {
    var id = projectIdFromHash();
    if (!id) return;
    if (scroll) {
      var section = $("#projects");
      if (section) section.scrollIntoView();
    }
    openProject(id, null);
  }

  function initDialog() {
    dialog = $("[data-project-dialog]");
    dialogContent = $("[data-dialog-content]");
    if (!dialog || !dialogContent) return;

    dialog.addEventListener("cancel", function (e) { e.preventDefault(); closeDialog(); });
    dialog.addEventListener("close", function () {
      cancelPendingClose();
      document.body.classList.remove("dialog-open");
      if (history.replaceState && location.hash.indexOf("#project-") === 0) history.replaceState(null, "", "#projects");
      if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus();
    });
    // Only a press that starts AND ends on the backdrop closes the dialog (text selection drags don't).
    dialog.addEventListener("pointerdown", function (e) { pressedBackdrop = e.target === dialog; });
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) {
        if (pressedBackdrop) closeDialog();
        pressedBackdrop = false;
        return;
      }
      if (e.target.closest("[data-dialog-close]")) { closeDialog(); return; }
      var thumb = e.target.closest("[data-thumb]");
      if (thumb) {
        var item = currentProject && currentProject.gallery[Number(thumb.getAttribute("data-thumb"))];
        if (!item) return;
        $("[data-dialog-image]", dialog).innerHTML = pictureFull(item, true);
        $("[data-dialog-caption]", dialog).textContent = item.caption || "";
        $$("[data-thumb]", dialog).forEach(function (b) { b.setAttribute("aria-current", String(b === thumb)); });
      }
    });

    window.addEventListener("hashchange", function () { openFromHash(false); });
    openFromHash(true);
  }

  /* ---------------------------------------------------------------- copy email */
  function initCopy() {
    $$("[data-copy]").forEach(function (btn) {
      var status = $("[data-copy-status]");
      var timer;
      btn.addEventListener("click", function () {
        var text = btn.getAttribute("data-copy");
        var done = function (ok) {
          btn.classList.toggle("is-copied", ok);
          if (status) status.textContent = ok ? "Email address copied" : "Copy failed. The address is " + text;
          clearTimeout(timer);
          timer = setTimeout(function () { btn.classList.remove("is-copied"); if (status) status.textContent = ""; }, 2600);
        };
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
        } else {
          done(fallbackCopy(text));
        }
      });
    });
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  /* ----------------------------------------------------- timeline + lifecycle */
  function initTimeline() {
    var timeline = $("[data-timeline]");
    var progress = $("[data-timeline-progress]");
    if (!timeline || !progress) return;
    var rail = progress.parentElement;
    var ticking = false;
    function update() {
      var r = rail.getBoundingClientRect();
      var vh = window.innerHeight;
      var p = r.height ? clamp((vh * 0.62 - r.top) / r.height, 0, 1) : 0;
      progress.style.setProperty("--progress", p.toFixed(3));
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
  }

  function initLifecycle() {
    var track = $("[data-lifecycle]");
    if (!track) return;
    function update() { track.style.setProperty("--track-w", track.offsetWidth + "px"); }
    window.addEventListener("resize", update, { passive: true });
    update();
  }

  /* ---------------------------------------------------------------- hero scene */
  function initScene() {
    var hero = $("#top");
    var sceneEl = $("[data-scene]");
    if (!hero || !sceneEl) return null;
    var layers = $$("[data-depth]", sceneEl).map(function (el) {
      return { el: el, depth: parseFloat(el.getAttribute("data-depth")) || 0 };
    });
    var wolf = $("[data-wolf]", sceneEl);
    var canvas = $("[data-particles]", sceneEl);
    var ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;

    var visible = true;
    var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    var particles = [];
    var width = 0, height = 0, dpr = 1;
    var rafId = 0;

    function resize() {
      if (!ctx) return;
      var rect = hero.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var target = clamp(Math.round((width * height) / 17000), 16, 90);
      while (particles.length < target) particles.push(makeParticle(true));
      particles.length = target;
      if (!motionAllowed()) drawParticles(0);
    }

    function makeParticle(anywhere) {
      var roll = Math.random();
      return {
        x: Math.random() * width,
        y: anywhere ? Math.random() * height : height + 10,
        r: 0.5 + Math.random() * 1.5,
        vy: 0.08 + Math.random() * 0.28,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.004 + Math.random() * 0.01,
        twinkle: Math.random() * Math.PI * 2,
        color: roll < 0.68 ? "183,148,255" : roll < 0.88 ? "244,184,96" : "232,224,255",
        base: 0.25 + Math.random() * 0.55,
      };
    }

    function drawParticles(dt) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        if (dt) {
          p.y -= p.vy * dt;
          p.sway += p.swaySpeed * dt;
          p.twinkle += 0.02 * dt;
          p.x += Math.sin(p.sway) * 0.15 * dt;
          if (p.y < -10) { particles[i] = makeParticle(false); continue; }
        }
        // Fade out toward the top so particles read as low ground mist and fireflies.
        var heightFade = clamp(p.y / height, 0, 1);
        var a = p.base * (0.55 + 0.45 * Math.sin(p.twinkle)) * (0.25 + 0.75 * heightFade);
        ctx.beginPath();
        ctx.fillStyle = "rgba(" + p.color + "," + (a * 0.18).toFixed(3) + ")";
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = "rgba(" + p.color + "," + a.toFixed(3) + ")";
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    function applyLayers() {
      var sy = window.scrollY;
      for (var i = 0; i < layers.length; i++) {
        var l = layers[i];
        var x = -pointer.x * l.depth * 34;
        var y = -pointer.y * l.depth * 14 + sy * Math.max(0, 0.6 - l.depth) * 0.45;
        l.el.style.translate = x.toFixed(2) + "px " + y.toFixed(2) + "px";
      }
    }

    function resetPose() {
      layers.forEach(function (l) { l.el.style.translate = ""; });
      pointer.x = pointer.y = pointer.tx = pointer.ty = 0;
      if (wolf) { wolf.classList.remove("is-tracking"); wolf.style.removeProperty("--head-rot"); }
    }

    var last = 0;
    function frame(t) {
      rafId = 0;
      if (!visible || !motionAllowed()) return;
      var dt = last ? Math.min((t - last) / 16.67, 3) : 1;
      last = t;
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;
      applyLayers();
      if (!document.hidden) drawParticles(dt);
      rafId = requestAnimationFrame(frame);
    }
    function start() {
      if (!motionAllowed() || !visible || rafId) return;
      last = 0;
      rafId = requestAnimationFrame(frame);
    }
    function stop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        hero.classList.toggle("is-paused", !visible);
        if (visible) start(); else stop();
      }).observe(hero);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else start();
    });

    if (finePointer) {
      window.addEventListener("pointermove", function (e) {
        if (!visible || !motionAllowed()) return;
        pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
        if (wolf) {
          var box = wolf.getBoundingClientRect();
          var pivotY = box.top + box.height * (206 / 440);
          var pivotX = box.left + box.width * (284 / 820);
          // Positive rotation lifts the snout (the wolf faces left).
          var dy = (pivotY - e.clientY) / window.innerHeight;
          var facing = e.clientX < pivotX ? 1 : 0.35;
          wolf.style.setProperty("--head-rot", clamp(dy * 22 * facing, -7, 8).toFixed(2) + "deg");
          wolf.classList.add("is-tracking");
        }
      }, { passive: true });
      document.addEventListener("pointerleave", function () {
        pointer.tx = 0;
        pointer.ty = 0;
        if (wolf) { wolf.classList.remove("is-tracking"); wolf.style.removeProperty("--head-rot"); }
      });
    }

    window.addEventListener("resize", resize, { passive: true });
    resize();
    start();

    return {
      setMotion: function (enabled) {
        if (enabled) { start(); return; }
        stop();
        resetPose();
        drawParticles(0);
      },
    };
  }

  /* ------------------------------------------------------- motion preferences */
  function applyMotionState() {
    var allowed = motionAllowed();
    doc.classList.toggle("motion-paused", userPausedMotion);
    if (scene) scene.setMotion(allowed);
    if (!allowed) revealAll();
    var btn = $("[data-motion-toggle]");
    if (btn) {
      btn.querySelector("[data-motion-label]").textContent = userPausedMotion ? "Play motion" : "Pause motion";
      btn.classList.toggle("is-paused", userPausedMotion);
    }
  }

  function initMotionControls() {
    userPausedMotion = storageGet("motion") === "paused";
    var btn = $("[data-motion-toggle]");
    if (btn) {
      btn.addEventListener("click", function () {
        userPausedMotion = !userPausedMotion;
        storageSet("motion", userPausedMotion ? "paused" : "on");
        applyMotionState();
      });
    }
    var onChange = function (e) {
      reduceMotion = e.matches;
      applyMotionState();
    };
    if (motionQuery.addEventListener) motionQuery.addEventListener("change", onChange);
    else if (motionQuery.addListener) motionQuery.addListener(onChange);
  }

  /* ------------------------------------------------------------------- misc */
  function initYear() {
    $$("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
  }

  // Each step is isolated so a failure in one feature can't take the rest of the page down.
  function run(fn) {
    try { return fn(); } catch (err) { if (window.console) console.error(err); return null; }
  }

  run(initMotionControls);
  run(initHeader);
  run(initMenu);
  run(initProjects);
  run(initDialog);
  run(initReveal);
  run(initActiveNav);
  run(initCopy);
  run(initTimeline);
  run(initLifecycle);
  scene = run(initScene);
  run(applyMotionState);
  run(initYear);
})();
