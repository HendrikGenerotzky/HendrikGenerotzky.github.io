(() => {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const narrow = () => window.matchMedia("(max-width: 860px)").matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  document.documentElement.classList.add("anim");

  /* ---------- Smooth scrolling ---------- */
  let lenis = null;
  if (!reduce && typeof window.Lenis === "function") {
    lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      const target = id === "#top" ? document.body : document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: 0 });
      else target.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    });
  });

  /* ---------- Topographic background ---------- */
  const topo = document.querySelector(".topo");
  const tctx = topo.getContext("2d");
  const perm = new Uint8Array(512);
  (() => { const p = []; for (let i = 0; i < 256; i++) p[i] = i; let s = 7;
    for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; })();
  const fade = (t) => t * t * (3 - 2 * t);
  const hash = (x, y) => perm[(perm[x & 255] + y) & 255] / 255;
  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    const u = fade(xf), v = fade(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const field = (x, y, t) => vnoise(x * 0.9 + t, y * 0.9) * 0.6 + vnoise(x * 2.1 - t * 0.6, y * 2.1 + 3) * 0.3 + vnoise(x * 4.3, y * 4.3 - t) * 0.1;

  let tw = 0, th = 0, tdpr = 1;
  const sizeTopo = () => {
    tdpr = Math.min(window.devicePixelRatio || 1, 2);
    tw = window.innerWidth; th = window.innerHeight;
    topo.width = tw * tdpr; topo.height = th * tdpr;
  };
  const drawTopo = (time) => {
    const cell = tw < 700 ? 18 : 16;
    const cols = Math.ceil(tw / cell) + 1, rows = Math.ceil(th / cell) + 1;
    const t = time * 0.00003;
    const vals = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) vals[j * cols + i] = field(i * cell / 260, j * cell / 260, t);
    tctx.setTransform(tdpr, 0, 0, tdpr, 0, 0);
    tctx.clearRect(0, 0, tw, th);
    const levels = 11;
    for (let L = 1; L < levels; L++) {
      const iso = 0.18 + L * 0.06;
      tctx.beginPath();
      for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
        const a = vals[j * cols + i], b = vals[j * cols + i + 1], c = vals[(j + 1) * cols + i + 1], d = vals[(j + 1) * cols + i];
        const idx = (a > iso) | ((b > iso) << 1) | ((c > iso) << 2) | ((d > iso) << 3);
        if (idx === 0 || idx === 15) continue;
        const x = i * cell, y = j * cell;
        const lerp = (p, q) => (iso - p) / (q - p);
        const top = [x + cell * lerp(a, b), y], right = [x + cell, y + cell * lerp(b, c)];
        const bottom = [x + cell * lerp(d, c), y + cell], left = [x, y + cell * lerp(a, d)];
        const seg = (p, q) => { tctx.moveTo(p[0], p[1]); tctx.lineTo(q[0], q[1]); };
        switch (idx) {
          case 1: case 14: seg(left, top); break;
          case 2: case 13: seg(top, right); break;
          case 3: case 12: seg(left, right); break;
          case 4: case 11: seg(right, bottom); break;
          case 5: seg(left, top); seg(right, bottom); break;
          case 6: case 9: seg(top, bottom); break;
          case 7: case 8: seg(left, bottom); break;
          case 10: seg(left, bottom); seg(top, right); break;
        }
      }
      tctx.strokeStyle = L % 4 === 0 ? "rgba(13,27,42,.13)" : "rgba(13,27,42,.06)";
      tctx.lineWidth = L % 4 === 0 ? 1.1 : 0.8;
      tctx.stroke();
    }
  };
  sizeTopo();
  drawTopo(0);
  if (!reduce) {
    let last = 0;
    const loop = (now) => {
      if (!document.hidden && now - last > 90) { drawTopo(now); last = now; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ---------- Hero: knowledge-graph layer ---------- */
  const hero = document.querySelector(".hero");
  const scene = document.querySelector(".hero-scene");
  const ghost = document.querySelector(".portrait-ghost");
  const gcan = document.querySelector(".graph");
  const gctx = gcan.getContext("2d");
  const counter = document.querySelector(".node-count");
  let nodes = [], edges = [], hubs = [], packets = [], gReady = false, gBox = null, wipeFrac = 1;

  const HUB_LABELS = ["Maschine", "Auftrag", "Werkzeug", "Störung", "Maßnahme", "Erfahrung", "Prozess"];
  const HUB_SPOTS = [[0.30, 0.22], [0.66, 0.26], [0.44, 0.42], [0.72, 0.52], [0.26, 0.60], [0.55, 0.78], [0.82, 0.88]];

  const buildGraph = () => {
    const r = ghost.getBoundingClientRect(), hr = hero.getBoundingClientRect();
    if (!r.width || !ghost.complete || !ghost.naturalWidth) return;
    gBox = { x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    gcan.style.left = gBox.x + "px"; gcan.style.top = gBox.y + "px";
    gcan.style.width = gBox.w + "px"; gcan.style.height = gBox.h + "px";
    gcan.width = Math.round(gBox.w * dpr); gcan.height = Math.round(gBox.h * dpr);
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sw = 200, sh = Math.round(200 * ghost.naturalHeight / ghost.naturalWidth);
    const off = document.createElement("canvas"); off.width = sw; off.height = sh;
    const octx = off.getContext("2d");
    octx.drawImage(ghost, 0, 0, sw, sh);
    let data;
    try { data = octx.getImageData(0, 0, sw, sh).data; } catch (e) { return; }
    const A = (x, y) => data[(y * sw + x) * 4 + 3];
    const Lum = (x, y) => { const k = (y * sw + x) * 4; return (data[k] * 0.3 + data[k + 1] * 0.59 + data[k + 2] * 0.11) / 255; };

    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const target = narrow() ? 380 : 620;
    nodes = []; let guard = 0;
    while (nodes.length < target && guard++ < 60000) {
      const x = 1 + Math.floor(rnd() * (sw - 2)), y = 1 + Math.floor(rnd() * (sh - 2));
      if (A(x, y) < 200) continue;
      const g = Math.abs(Lum(x + 1, y) - Lum(x - 1, y)) + Math.abs(Lum(x, y + 1) - Lum(x, y - 1));
      if (rnd() > 0.12 + g * 3.2) continue;
      nodes.push({ x: (x / sw) * gBox.w, y: (y / sh) * gBox.h, p: rnd() * Math.PI * 2 });
    }
    edges = [];
    const maxD = gBox.w * 0.075;
    for (let i = 0; i < nodes.length; i++) {
      const near = [];
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, d = dx * dx + dy * dy;
        if (d < maxD * maxD) near.push([d, j]);
      }
      near.sort((a, b) => a[0] - b[0]);
      near.slice(0, 3).forEach(([, j]) => { if (j > i) edges.push([i, j]); });
    }
    hubs = HUB_SPOTS.map(([fx, fy], k) => {
      const tx = fx * gBox.w, ty = fy * gBox.h;
      let best = 0, bd = Infinity;
      nodes.forEach((n, i) => { const d = (n.x - tx) ** 2 + (n.y - ty) ** 2; if (d < bd) { bd = d; best = i; } });
      return { i: best, label: HUB_LABELS[k] };
    });
    packets = Array.from({ length: narrow() ? 10 : 18 }, () => ({ e: Math.floor(rnd() * edges.length), t: rnd(), s: 0.006 + rnd() * 0.01 }));
    gReady = true;
    drawGraph(performance.now());
  };

  const drawGraph = (now) => {
    if (!gReady) return;
    gctx.clearRect(0, 0, gBox.w, gBox.h);
    gctx.lineWidth = 0.7;
    gctx.strokeStyle = "rgba(236,238,241,.22)";
    gctx.beginPath();
    edges.forEach(([a, b]) => { gctx.moveTo(nodes[a].x, nodes[a].y); gctx.lineTo(nodes[b].x, nodes[b].y); });
    gctx.stroke();
    gctx.fillStyle = "rgba(236,238,241,.85)";
    nodes.forEach((n) => {
      const r = 1 + 0.5 * Math.sin(now * 0.002 + n.p);
      gctx.fillRect(n.x - r * 0.75, n.y - r * 0.75, r * 1.5, r * 1.5);
    });
    gctx.fillStyle = "#F26B1D";
    packets.forEach((pk) => {
      const [a, b] = edges[pk.e] || [0, 0];
      const x = nodes[a].x + (nodes[b].x - nodes[a].x) * pk.t, y = nodes[a].y + (nodes[b].y - nodes[a].y) * pk.t;
      gctx.beginPath(); gctx.arc(x, y, 2, 0, Math.PI * 2); gctx.fill();
    });
    gctx.font = "500 10px 'IBM Plex Mono', monospace";
    gctx.textBaseline = "middle";
    hubs.forEach((h, k) => {
      const n = nodes[h.i];
      const pulse = 4 + 2 * Math.sin(now * 0.003 + k);
      gctx.strokeStyle = "rgba(242,107,29,.55)"; gctx.lineWidth = 1;
      gctx.beginPath(); gctx.arc(n.x, n.y, pulse + 4, 0, Math.PI * 2); gctx.stroke();
      gctx.fillStyle = "#F26B1D";
      gctx.beginPath(); gctx.arc(n.x, n.y, 3.2, 0, Math.PI * 2); gctx.fill();
      const text = h.label.toUpperCase(), tw2 = gctx.measureText(text).width;
      const flip = n.x + tw2 + 24 > gBox.w;
      const bx = flip ? n.x - tw2 - 19 : n.x + 9;
      gctx.fillStyle = "rgba(10,21,34,.85)"; gctx.fillRect(bx, n.y - 8, tw2 + 10, 16);
      gctx.fillStyle = "#ECEEF1"; gctx.fillText(text, bx + 5, n.y + 0.5);
    });
  };
  const stepPackets = () => packets.forEach((pk) => {
    pk.t += pk.s;
    if (pk.t >= 1) {
      const end = edges[pk.e][1];
      const next = edges.map((e, i) => (e[0] === end || e[1] === end) ? i : -1).filter((i) => i >= 0);
      pk.e = next.length ? next[Math.floor(Math.random() * next.length)] : Math.floor(Math.random() * edges.length);
      if (edges[pk.e][0] !== end) edges[pk.e] = [edges[pk.e][1], edges[pk.e][0]];
      pk.t = 0;
    }
  });

  const updateHero = () => {
    const total = scene.offsetHeight - window.innerHeight;
    const p = total > 0 ? clamp(-scene.getBoundingClientRect().top / total) : 1;
    const w = reduce ? 0.5 : 1 - 0.5 * ease(clamp((p - 0.08) / 0.62));
    wipeFrac = w;
    hero.style.setProperty("--wipe", (w * 100).toFixed(2) + "%");
    hero.classList.toggle("wiping", w < 0.995);
    hero.classList.toggle("scrolled", p > 0.02);
    if (counter && nodes.length) counter.textContent = Math.round(nodes.length * clamp((1 - w) * 2)).toLocaleString("de-DE");
  };

  const heroLoop = (now) => {
    const r = scene.getBoundingClientRect();
    const visible = r.bottom > 0 && r.top < window.innerHeight;
    if (visible && wipeFrac < 0.995 && !document.hidden) { stepPackets(); drawGraph(now); }
    requestAnimationFrame(heroLoop);
  };

  const initGraph = () => { buildGraph(); updateHero(); };
  if (ghost.complete) initGraph(); else ghost.addEventListener("load", initGraph);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => gReady && drawGraph(performance.now()));
  if (!reduce) requestAnimationFrame(heroLoop);

  /* ---------- Journey: horizontal pinned timeline ---------- */
  const journey = document.querySelector(".journey");
  const track = document.querySelector(".track");
  const cards = [...track.querySelectorAll(".card")];
  const barFill = document.querySelector(".bar i");
  const ticksEl = document.querySelector(".ticks");
  ticksEl.innerHTML = cards.map((c) => `<li><b>${c.dataset.year}</b><span>${c.dataset.short}</span></li>`).join("");
  const ticks = [...ticksEl.children];
  const aiIndex = cards.findIndex((c) => c.dataset.year === "2021");
  document.querySelector(".progress").style.setProperty("--phase-at", `calc(${(aiIndex / (cards.length - 1)) * 100}% - 4em)`);
  let travel = 0;

  const sizeJourney = () => {
    if (narrow() || reduce) {
      journey.style.height = ""; track.style.transform = ""; travel = 0;
      cards.forEach((c) => c.classList.remove("active"));
      return;
    }
    const gutR = parseFloat(getComputedStyle(track).paddingRight) || 0;
    travel = Math.max(0, track.scrollWidth - window.innerWidth + gutR * 0);
    journey.style.height = (window.innerHeight + travel) + "px";
  };

  const updateJourney = () => {
    if (!travel) return;
    const r = journey.getBoundingClientRect();
    const p = clamp(-r.top / travel);
    track.style.transform = `translate3d(${(-p * travel).toFixed(1)}px,0,0)`;
    barFill.style.width = (p * 100).toFixed(2) + "%";
    const active = Math.round(p * (cards.length - 1));
    cards.forEach((c, i) => c.classList.toggle("active", i === active));
    ticks.forEach((t, i) => t.classList.toggle("on", i <= active));
  };

  /* ---------- Reveals and count-up ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".rise").forEach((el) => io.observe(el));

  const countIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      countIO.unobserve(en.target);
      if (reduce) return;
      const el = en.target, end = +el.dataset.count, t0 = performance.now(), dur = 1200;
      const tick = (now) => { const k = clamp((now - t0) / dur); el.textContent = Math.round(end * ease(k)); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.6 });
  document.querySelectorAll("[data-count]").forEach((el) => {
    if (el.getBoundingClientRect().top > window.innerHeight) countIO.observe(el);
  });

  /* ---------- Copy e-mail ---------- */
  const copyBtn = document.getElementById("copy-email");
  copyBtn.addEventListener("click", () => {
    const email = copyBtn.dataset.email;
    const done = () => { copyBtn.textContent = "Kopiert"; setTimeout(() => (copyBtn.textContent = "E-Mail kopieren"), 1800); };
    const fallback = () => {
      const link = document.querySelector(".contact .email");
      const range = document.createRange(); range.selectNodeContents(link);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      copyBtn.textContent = "Markiert, jetzt kopieren";
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(email).then(done, fallback);
    else fallback();
  });

  /* ---------- Wiring ---------- */
  const onScroll = () => { updateHero(); updateJourney(); };
  if (lenis) lenis.on("scroll", onScroll);
  window.addEventListener("scroll", onScroll, { passive: true });
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { sizeTopo(); drawTopo(performance.now()); buildGraph(); sizeJourney(); onScroll(); }, 120);
  });
  sizeJourney();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sizeJourney(); onScroll(); });
  window.addEventListener("load", () => { sizeJourney(); onScroll(); });
  onScroll();
})();
