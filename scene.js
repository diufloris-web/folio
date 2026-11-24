/* Объёмные кадры: фото + карта глубины -> трёхмерная сетка -> камера. Чистый WebGL, без библиотек.
   Данные сцен лежат в scenes/*.js и подгружаются, когда кадр приближается к экрану.
   Нет WebGL или включено «меньше движения» -> остаётся обычное фото. */
(function () {
  "use strict";
  var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var scenes = [];
  window.Scenes = { dolly: function (id, value) { scenes.forEach(function (s) { if (s.id === id) { s.extra = value; wake(); } }); } };
  if (calm) return;

  var VERT =
    "attribute vec3 a;uniform vec2 view,off;uniform vec3 cam;uniform vec2 rot;uniform float f,asp,piv,over;varying vec2 uv;" +
    "void main(){uv=a.xy;float z=a.z;vec3 p=vec3((a.x-.5)*asp/f*z,(.5-a.y)/f*z,z-piv);" +
    "float c=cos(rot.x),s=sin(rot.x);p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);" +
    "c=cos(rot.y);s=sin(rot.y);p=vec3(p.x,c*p.y+s*p.z,-s*p.y+c*p.z);p.z+=piv;p-=cam;" +
    "float n=.06,r=40.;gl_Position=vec4((f*p.x-off.x*p.z)*2./view.x*over,(f*p.y-off.y*p.z)*2./view.y*over,p.z*(r+n)/(r-n)-2.*r*n/(r-n),p.z);}";
  var FRAG = "precision mediump float;uniform sampler2D t;varying vec2 uv;void main(){gl_FragColor=texture2D(t,uv);}";

  function load(src) {
    return new Promise(function (ok, bad) {
      var el = document.createElement("script");
      el.src = src; el.onload = ok; el.onerror = bad;
      document.head.appendChild(el);
    });
  }
  function picture(src) {
    return new Promise(function (ok, bad) {
      var im = new Image();
      im.onload = function () { ok(im); }; im.onerror = bad; im.src = src;
    });
  }

  function Scene(el) {
    this.el = el; this.id = el.dataset.scene; this.mode = el.dataset.mode;
    this.ratio = +el.dataset.ratio || 5; this.piv = +el.dataset.focus || 2.5;
    this.walk = +el.dataset.walk || 0; this.oy = +el.dataset.oy || 0;
    this.amp = el.hasAttribute("data-strong") ? 1.7 : el.hasAttribute("data-soft") ? 0.7 : 1;
    this.x = this.y = this.tx = this.ty = this.z = 0; this.extra = 0;
    this.visible = false; this.state = 0;
  }

  Scene.prototype.start = function () {
    var self = this;
    if (this.state) return;
    this.state = 1;
    load("scenes/" + this.id + ".js").then(function () {
      var d = window.SCENES[self.id];
      return Promise.all([picture(d.color), picture(d.depth), d]);
    }).then(function (r) { self.build(r[0], r[1], r[2]); window.SCENES[self.id] = null; })
      .catch(function () { self.state = -1; });
  };

  Scene.prototype.build = function (color, depth, d) {
    var cv = document.createElement("canvas");
    var gl = cv.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "low-power" });
    if (!gl) { this.state = -1; return; }
    var gw = depth.naturalWidth, gh = depth.naturalHeight;
    var tmp = document.createElement("canvas"); tmp.width = gw; tmp.height = gh;
    var c2 = tmp.getContext("2d", { willReadFrequently: true });
    c2.drawImage(depth, 0, 0);
    var px = c2.getImageData(0, 0, gw, gh).data;
    var v = new Float32Array(gw * gh * 3), far = 1 / this.ratio, i, x, y;
    for (y = 0, i = 0; y < gh; y++) for (x = 0; x < gw; x++, i++) {
      var g = (px[i * 4] * 256 + px[i * 4 + 1]) / 65535;
      v[i * 3] = x / (gw - 1); v[i * 3 + 1] = y / (gh - 1); v[i * 3 + 2] = 1 / (far + (1 - far) * g);
    }
    var idx = new Uint32Array((gw - 1) * (gh - 1) * 6), k = 0;
    for (y = 0; y < gh - 1; y++) for (x = 0; x < gw - 1; x++) {
      i = y * gw + x;
      idx[k++] = i; idx[k++] = i + gw; idx[k++] = i + 1; idx[k++] = i + 1; idx[k++] = i + gw; idx[k++] = i + gw + 1;
    }
    var pr = gl.createProgram();
    [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]].forEach(function (s) {
      var sh = gl.createShader(s[0]); gl.shaderSource(sh, s[1]); gl.compileShader(sh); gl.attachShader(pr, sh);
    });
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { this.state = -1; return; }
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    var a = gl.getAttribLocation(pr, "a"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, color);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var ext = gl.getExtension("EXT_texture_filter_anisotropic");
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    gl.enable(gl.DEPTH_TEST);
    this.u = {};
    ["view", "off", "cam", "rot", "f", "asp", "piv", "over"].forEach(function (n) { this.u[n] = gl.getUniformLocation(pr, n); }, this);
    this.gl = gl; this.cv = cv; this.n = idx.length; this.asp = d.w / d.h; this.state = 2;
    var self = this;
    cv.addEventListener("webglcontextlost", function (e) { e.preventDefault(); self.state = -1; self.el.classList.remove("live"); });
    this.el.appendChild(cv);
    wake();
    requestAnimationFrame(function () { self.el.classList.add("live"); });
  };

  Scene.prototype.progress = function () {
    var r = (this.mode === "walk" ? this.el.closest(".passage") : this.el).getBoundingClientRect(), h = window.innerHeight;
    var t = this.mode === "walk" ? -r.top / (r.height - 2 * h) : (h - r.top) / (h + r.height);
    return Math.min(1, Math.max(0, t));
  };

  Scene.prototype.draw = function () {
    var w = this.el.clientWidth, h = this.el.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (!W || !H) return false;
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    var t = this.mode === "look" ? 0 : this.progress();
    var goal = this.walk * t + this.extra;
    this.x += (this.tx - this.x) * 0.07; this.y += (this.ty - this.y) * 0.07; this.z += (goal - this.z) * 0.16;
    var gl = this.gl, u = this.u, ca = W / H, vw = ca >= this.asp ? this.asp : ca, vh = ca >= this.asp ? this.asp / ca : 1;
    gl.viewport(0, 0, W, H); gl.clearColor(0.086, 0.07, 0.06, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform2f(u.view, vw, vh); gl.uniform2f(u.off, 0, -(1 - vh) * this.oy);
    gl.uniform3f(u.cam, this.x * 0.02, 0, this.z);
    gl.uniform2f(u.rot, this.x * 0.052 * this.amp, this.y * 0.02 * this.amp);
    gl.uniform1f(u.f, 0.82); gl.uniform1f(u.asp, this.asp); gl.uniform1f(u.piv, this.piv); gl.uniform1f(u.over, this.amp > 1 ? 1.1 : 1.07);
    gl.drawElements(gl.TRIANGLES, this.n, gl.UNSIGNED_INT, 0);
    return Math.abs(this.tx - this.x) + Math.abs(this.ty - this.y) + Math.abs(goal - this.z) > 0.0008;
  };

  // Рисуем, только когда что-то меняется и кадр на экране
  var running = false;
  function frame() {
    var more = false;
    scenes.forEach(function (s) { if (s.visible && s.state === 2 && s.draw()) more = true; });
    if (more) requestAnimationFrame(frame); else running = false;
  }
  function wake() { if (!running) { running = true; requestAnimationFrame(frame); } }

  document.querySelectorAll(".scene[data-scene]").forEach(function (el) { scenes.push(new Scene(el)); });
  var near = new IntersectionObserver(function (list) {
    list.forEach(function (e) { if (e.isIntersecting) scenes.forEach(function (s) { if (s.el === e.target) s.start(); }); });
  }, { rootMargin: "120% 0px" });
  var seen = new IntersectionObserver(function (list) {
    list.forEach(function (e) { scenes.forEach(function (s) { if (s.el === e.target) s.visible = e.isIntersecting; }); });
    wake();
  });
  scenes.forEach(function (s) { near.observe(s.el); seen.observe(s.el); });

  window.addEventListener("scroll", wake, { passive: true });
  window.addEventListener("resize", wake);
  window.addEventListener("pointermove", function (e) {
    scenes.forEach(function (s) {
      if (!s.visible || s.state !== 2) return;
      var r = s.el.getBoundingClientRect();
      if (e.pointerType === "touch" && !s.el.contains(e.target)) return;
      s.tx = Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width * 2 - 1));
      s.ty = Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height * 2 - 1));
    });
    wake();
  }, { passive: true });
})();
