(function () {
  "use strict";
  var root = document.documentElement;
  var clamp = function (v) { return Math.min(1, Math.max(0, v)); };

  // ---- Именное приглашение: index.html#g=Анна_Сергеевна
  // Имя стоит после #, поэтому на сервер оно не попадает. Допускаются только буквы, пробел и дефис.
  function greet() {
    var match = /^#g=(.+)$/.exec(window.location.hash), name = "";
    if (match) {
      try { name = decodeURIComponent(match[1]); } catch (e) { name = ""; }
      name = name.replace(/_/g, " ").trim();
    }
    var ok = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё \-]{0,39}$/.test(name);
    document.querySelectorAll("[data-guest]").forEach(function (el) { el.textContent = ok ? name + ", " : ""; });
    document.querySelector("[data-hello]").textContent = (ok ? "вам" : "Вам") + " о нас рассказали";
    document.querySelector("[data-welcome]").textContent = (ok ? "добро" : "Добро") + " пожаловать";
  }
  greet();
  window.addEventListener("hashchange", function () { if (window.location.hash.indexOf("#g=") === 0) greet(); });

  // ---- Рамка издания: копия в каждой секции, обрезанная по её границе
  var folio = document.getElementById("folio"), contents = document.querySelector(".contents");
  document.querySelectorAll("[data-n]").forEach(function (section) {
    var clip = document.createElement("div");
    clip.className = "folio-clip";
    clip.appendChild(folio.content.cloneNode(true));
    clip.querySelector(".folio-title").textContent = section.dataset.title;
    clip.querySelector(".folio-num").textContent = section.dataset.n;
    clip.querySelector(".folio-menu").addEventListener("click", function () { contents.showModal(); });
    section.appendChild(clip);
  });
  contents.querySelector("[data-close]").addEventListener("click", function () { contents.close(); });

  // ---- Переходы по разделам: после прокрутки проверяем, что попали точно
  document.addEventListener("click", function (e) {
    var link = e.target.closest('a[href^="#"]');
    if (!link) return;
    var target = document.getElementById(link.getAttribute("href").slice(1));
    if (!target) return;
    e.preventDefault();
    if (contents.open) contents.close();
    var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: calm ? "auto" : "smooth" });
    history.replaceState(null, "", link.getAttribute("href"));
    var last = -1, tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (Math.abs(window.scrollY - last) < 1) {
        if (Math.abs(target.getBoundingClientRect().top) > 2) target.scrollIntoView({ behavior: "auto" });
        if (tries > 4) clearInterval(timer);
      }
      last = window.scrollY;
      if (tries > 40) clearInterval(timer);
    }, 150);
    ["wheel", "touchstart", "keydown"].forEach(function (type) { window.addEventListener(type, function () { clearInterval(timer); }, { once: true, passive: true }); });
  });

  // ---- Двери
  var gate = document.querySelector(".gate"), site = document.getElementById("site");
  function set(p, walk) {
    gate.style.setProperty("--p", p);
    gate.style.setProperty("--ajar", Math.min(1, p * 6));
    gate.style.setProperty("--glow", p > 0.3 ? "hidden" : "visible");
    gate.style.setProperty("--walk", walk);
    if (window.Scenes) window.Scenes.dolly("p13-1", 0.22 * walk);
  }
  if (root.classList.contains("gated")) {
    var p = 0, busy = false, drag = null;
    var portal = gate.querySelector(".portal"), button = gate.querySelector(".gate-open");
    site.inert = true;
    window.scrollTo(0, 0);
    set(0, 0);
    button.focus({ preventScroll: true });

    var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    var animate = function (ms, step, done) {
      var from = performance.now();
      (function tick(now) {
        var t = clamp((now - from) / ms);
        step(ease(t));
        if (t < 1) requestAnimationFrame(tick); else if (done) done();
      })(from);
    };
    var finish = function () {
      root.classList.remove("gated");
      site.inert = false;
      gate.remove();
      try { sessionStorage.setItem("entered", "1"); } catch (e) {}
      document.removeEventListener("keydown", onKey);
    };
    var open = function () {
      if (busy) return;
      busy = true;
      var start = p;
      animate(1700 * (1 - start * 0.6), function (t) { p = start + (1 - start) * t; set(p, 0); });
      setTimeout(function () {
        animate(1500, function (t) { set(p, t); gate.style.opacity = 1 - Math.max(0, t - 0.72) / 0.28; }, finish);
      }, 1050 * (1 - start * 0.6));
    };
    var onKey = function (e) {
      if (e.key === "Escape" || e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); open(); }
    };
    document.addEventListener("keydown", onKey);
    button.addEventListener("click", open);
    gate.addEventListener("wheel", function (e) { e.preventDefault(); if (e.deltaY > 8) open(); }, { passive: false });
    gate.addEventListener("pointerdown", function (e) {
      if (busy || e.target === button) return;
      drag = { x: e.clientX, y: e.clientY, moved: false };
      gate.setPointerCapture(e.pointerId);
    });
    gate.addEventListener("pointermove", function (e) {
      if (!drag || busy) return;
      var dx = Math.abs(e.clientX - drag.x), dy = Math.abs(e.clientY - drag.y), d = Math.max(dx, dy);
      if (d > 6) drag.moved = true;
      p = clamp(d / (portal.offsetWidth * 0.75)) * 0.9;
      set(p, 0);
    });
    var release = function (e) {
      if (!drag || busy) return;
      var onDoor = e.type === "pointerup" && document.elementFromPoint(e.clientX, e.clientY);
      var tap = !drag.moved && onDoor && portal.contains(onDoor);
      drag = null;
      if (tap || p > 0.16) { open(); return; }
      var from = p;
      animate(500, function (t) { if (!drag && !busy) { p = from * (1 - t); set(p, 0); } });
    };
    gate.addEventListener("pointerup", release);
    gate.addEventListener("pointercancel", release);
  } else {
    gate.remove();
  }

  // ---- Проход: прокрутка ведёт из темноты в свет
  var passage = document.querySelector(".passage"), stage = passage.querySelector(".stage"), queued = false;
  function walk() {
    queued = false;
    var r = passage.getBoundingClientRect();
    var t = clamp(-r.top / (r.height - 2 * window.innerHeight));   // последний экран накрывает обложка
    stage.style.setProperty("--t", t.toFixed(4));
  }
  window.addEventListener("scroll", function () { if (!queued) { queued = true; requestAnimationFrame(walk); } }, { passive: true });
  window.addEventListener("resize", walk);
  walk();

  // ---- Детали: кадр начинается общим видом и приближается, когда до него дошли
  var macros = Array.prototype.slice.call(document.querySelectorAll(".macro"));
  macros.forEach(function (m) {
    var view = m.querySelector(".macro-view");
    view.addEventListener("click", function () {
      var far = m.classList.toggle("far");
      view.setAttribute("aria-pressed", String(!far));
    });
  });
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var eye = new IntersectionObserver(function (list) {
      list.forEach(function (e) {
        if (!e.isIntersecting) return;
        eye.unobserve(e.target);
        setTimeout(function () {
          e.target.classList.remove("far");
          e.target.querySelector(".macro-view").setAttribute("aria-pressed", "true");
        }, 450);
      });
    }, { threshold: 0.45 });
    macros.forEach(function (m) { m.classList.add("far"); m.querySelector(".macro-view").setAttribute("aria-pressed", "false"); eye.observe(m); });
  }

  // ---- Лупа на фотографиях объекта (только мышь)
  var lens = document.querySelector(".lens");
  var photos = Array.prototype.slice.call(document.querySelectorAll(".zoom"));
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    photos.forEach(function (link) {
      var img = link.querySelector("img");
      link.addEventListener("pointerenter", function () { lens.style.backgroundImage = "url('" + link.getAttribute("href") + "')"; lens.classList.add("on"); });
      link.addEventListener("pointerleave", function () { lens.classList.remove("on"); });
      link.addEventListener("pointermove", function (e) {
        // Учитываем обрезку object-fit: cover
        var r = img.getBoundingClientRect(), nw = +img.getAttribute("width"), nh = +img.getAttribute("height");
        var s = Math.max(r.width / nw, r.height / nh), z = Math.max(2, Math.min(2.6, 1 / s * 1.15));
        var fx = e.clientX - r.left + (nw * s - r.width) / 2, fy = e.clientY - r.top + (nh * s - r.height) / 2;
        lens.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)";
        lens.style.backgroundSize = nw * s * z + "px " + nh * s * z + "px";
        lens.style.backgroundPosition = 135 - fx * z + "px " + (135 - fy * z) + "px";
      });
    });
    window.addEventListener("scroll", function () { lens.classList.remove("on"); }, { passive: true });
  }

  // ---- Просмотр фото. Без JavaScript ссылка просто открывает фото.
  var viewer = document.querySelector(".viewer"), box = viewer.querySelector(".viewer-stage"), full = box.querySelector("img");
  var label = viewer.querySelector("p"), zoomBtn = viewer.querySelector("[data-zoom]"), current = 0;
  function near(on, x, y) {
    viewer.classList.toggle("near", on);
    zoomBtn.textContent = on ? "Отдалить" : "Приблизить";
    zoomBtn.setAttribute("aria-pressed", String(on));
    if (on) { box.scrollLeft = (box.scrollWidth - box.clientWidth) * x; box.scrollTop = (box.scrollHeight - box.clientHeight) * y; }
  }
  function show(index) {
    current = (index + photos.length) % photos.length;
    near(false);
    full.src = photos[current].href;
    full.alt = photos[current].querySelector("img").alt;
    label.textContent = full.alt;
  }
  if (typeof viewer.showModal === "function") {
    photos.forEach(function (link, index) {
      link.addEventListener("click", function (e) {
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        lens.classList.remove("on");
        show(index);
        viewer.showModal();
      });
    });
    full.addEventListener("click", function (e) {
      var r = full.getBoundingClientRect();
      near(!viewer.classList.contains("near"), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    });
    zoomBtn.addEventListener("click", function () { near(!viewer.classList.contains("near"), 0.5, 0.5); });
    viewer.querySelector("[data-prev]").addEventListener("click", function () { show(current - 1); });
    viewer.querySelector("[data-next]").addEventListener("click", function () { show(current + 1); });
    viewer.querySelector("[data-close]").addEventListener("click", function () { viewer.close(); });
    viewer.addEventListener("keydown", function (e) {
      if (viewer.classList.contains("near")) return;
      if (e.key === "ArrowLeft") show(current - 1);
      if (e.key === "ArrowRight") show(current + 1);
    });
    viewer.addEventListener("close", function () { photos[current].focus({ preventScroll: true }); });
  }
})();
