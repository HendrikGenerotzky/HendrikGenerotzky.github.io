(() => {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const narrow = () => window.matchMedia("(max-width: 860px)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches; // phones and tablets
  const stackedMode = () => narrow() && window.innerHeight > window.innerWidth;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const fmt = (n) => Math.round(n).toLocaleString("de-DE");
  document.documentElement.classList.add("anim");

  /* ---------- Smooth scrolling ---------- */
  let lenis = null;
  if (!reduce && !coarse && typeof window.Lenis === "function") {
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

  /* ---------- Mobile menu ---------- */
  const menu = document.getElementById("menu");
  const menuBtn = document.querySelector(".menu-btn");
  const setMenu = (open) => {
    menu.hidden = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("menu-open", open);
    if (lenis) open ? lenis.stop() : lenis.start();
  };
  menuBtn.addEventListener("click", () => setMenu(true));
  menu.querySelector(".menu-close").addEventListener("click", () => setMenu(false));
  menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false), { capture: true }));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) setMenu(false); });

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
    tdpr = coarse ? 1 : Math.min(window.devicePixelRatio || 1, 2);
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
    for (let L = 1; L < 11; L++) {
      const iso = 0.18 + L * 0.06;
      tctx.beginPath();
      for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
        const a = vals[j * cols + i], b = vals[j * cols + i + 1], c = vals[(j + 1) * cols + i + 1], d = vals[(j + 1) * cols + i];
        const idx = (a > iso) | ((b > iso) << 1) | ((c > iso) << 2) | ((d > iso) << 3);
        if (idx === 0 || idx === 15) continue;
        const x = i * cell, y = j * cell;
        const f = (p, q) => (iso - p) / (q - p);
        const T = [x + cell * f(a, b), y], R = [x + cell, y + cell * f(b, c)];
        const B = [x + cell * f(d, c), y + cell], Lf = [x, y + cell * f(a, d)];
        const seg = (p, q) => { tctx.moveTo(p[0], p[1]); tctx.lineTo(q[0], q[1]); };
        switch (idx) {
          case 1: case 14: seg(Lf, T); break;
          case 2: case 13: seg(T, R); break;
          case 3: case 12: seg(Lf, R); break;
          case 4: case 11: seg(R, B); break;
          case 5: seg(Lf, T); seg(R, B); break;
          case 6: case 9: seg(T, B); break;
          case 7: case 8: seg(Lf, B); break;
          case 10: seg(Lf, B); seg(T, R); break;
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
      if (!document.hidden && now - last > (coarse ? 220 : 90)) { drawTopo(now); last = now; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ---------- Hero ---------- */
  const hero = document.querySelector(".hero");
  const scene = document.querySelector(".hero-scene");
  const ghost = document.querySelector(".portrait-ghost");
  const gcan = document.querySelector(".graph");
  const gctx = gcan.getContext("2d");
  const nodeEl = document.querySelector(".node-count");
  const edgeEl = document.querySelector(".edge-count");
  const artLayer = document.querySelector(".artifacts");
  const feed = document.querySelector(".feed");

  // Concepts that live in the portrait graph from the start.
  const HUBS = [
    { label: "Maschine", at: [0.30, 0.22] }, { label: "Auftrag", at: [0.66, 0.26] },
    { label: "Werkzeug", at: [0.44, 0.42] }, { label: "Störung", at: [0.72, 0.52] },
    { label: "Maßnahme", at: [0.26, 0.60] }, { label: "Erfahrung", at: [0.55, 0.78] },
    { label: "Prozess", at: [0.82, 0.88] }
  ];
  // Shop-floor artefacts that enrich the graph, one after another while scrolling.
  // at = cluster centre as a fraction of the hero (always on the KI side, x > 0.5).
  const ARTIFACTS = [
    { name: "Arbeitsanweisung Montage", kind: "PDF, 14 Seiten", hub: "Prozess", n: 190, at: [0.62, 0.10] },
    { name: "Störmeldungen 2024", kind: "Ticketsystem", hub: "Störung", n: 230, at: [0.92, 0.70] },
    { name: "Gespräch mit der Schichtleitung", kind: "Gemba-Notiz", hub: "Erfahrung", n: 160, at: [0.66, 0.88] }
  ];

  let W = 0, H = 0, dpr = 1;
  let face = [], faceEdges = [], hubs = [], clusters = [], packets = [];
  let alpha = null, aw = 0, ah = 0, pBox = null;
  let hlBox = null;
  let gReady = false, state = { wipe: 1, faceF: 0, steps: ARTIFACTS.map(() => 0) };

  const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const knn = (pts, k, maxD) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const near = [];
      for (let j = 0; j < pts.length; j++) {
        if (i === j) continue;
        const d = (pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2;
        if (d < maxD * maxD) near.push([d, j]);
      }
      near.sort((a, b) => a[0] - b[0]);
      near.slice(0, k).forEach(([, j]) => { if (j > i) out.push([i, j]); });
    }
    return out;
  };

  const buildGraph = () => {
    if (!ghost.complete || !ghost.naturalWidth) return;
    const hr = hero.getBoundingClientRect(), r = ghost.getBoundingClientRect();
    W = hr.width; H = hr.height;
    pBox = { x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height };
    dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    gcan.width = Math.round(W * dpr); gcan.height = Math.round(H * dpr);
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    aw = 200; ah = Math.round(200 * ghost.naturalHeight / ghost.naturalWidth);
    const off = document.createElement("canvas"); off.width = aw; off.height = ah;
    const octx = off.getContext("2d");
    octx.drawImage(ghost, 0, 0, aw, ah);
    let data;
    try { data = octx.getImageData(0, 0, aw, ah).data; } catch (e) { return; }
    alpha = new Uint8Array(aw * ah);
    for (let i = 0; i < aw * ah; i++) alpha[i] = data[i * 4 + 3];
    const lum = (x, y) => { const k = (y * aw + x) * 4; return (data[k] * 0.3 + data[k + 1] * 0.59 + data[k + 2] * 0.11) / 255; };

    const rnd = rng(11);
    const small = narrow();
    const target = small ? 360 : 620;
    face = []; let guard = 0;
    while (face.length < target && guard++ < 80000) {
      const x = 1 + Math.floor(rnd() * (aw - 2)), y = 1 + Math.floor(rnd() * (ah - 2));
      if (alpha[y * aw + x] < 200) continue;
      const g = Math.abs(lum(x + 1, y) - lum(x - 1, y)) + Math.abs(lum(x, y + 1) - lum(x, y - 1));
      if (rnd() > 0.12 + g * 3.2) continue;
      face.push({ x: pBox.x + (x / aw) * pBox.w, y: pBox.y + (y / ah) * pBox.h, p: rnd() * 6.28 });
    }
    faceEdges = knn(face, 3, pBox.w * 0.075);
    hubs = HUBS.map((h) => {
      const tx = pBox.x + h.at[0] * pBox.w, ty = pBox.y + h.at[1] * pBox.h;
      let best = 0, bd = Infinity;
      face.forEach((n, i) => { const d = (n.x - tx) ** 2 + (n.y - ty) ** 2; if (d < bd) { bd = d; best = i; } });
      return { i: best, label: h.label };
    });

    // Artefact clusters: blobs of nodes, ordered from the centre outwards so they grow.
    const scale = small ? 0.55 : 1;
    const R = Math.min(W, H) * (small ? 0.16 : 0.11);
    clusters = ARTIFACTS.map((a, k) => {
      const cr = rng(101 + k * 17);
      const cx = a.at[0] * W, cy = (stackedMode() ? 0.46 + a.at[1] * 0.48 : a.at[1]) * H;
      const n = Math.round(a.n * scale);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const ang = cr() * 6.283, rad = R * Math.sqrt(-2 * Math.log(1 - cr() * 0.98)) * 0.55;
        pts.push({ x: cx + Math.cos(ang) * rad * 1.25, y: cy + Math.sin(ang) * rad, p: cr() * 6.28 });
      }
      pts.sort((p, q) => ((p.x - cx) ** 2 + (p.y - cy) ** 2) - ((q.x - cx) ** 2 + (q.y - cy) ** 2));
      const edges = knn(pts, 3, R * 0.5).map(([i, j]) => [i, j, Math.max(i, j)]);
      const hub = hubs.find((h) => h.label === a.hub);
      return { a, cx, cy, pts, edges, hub, bridges: [] };
    });
    // A few bridges from each cluster into the existing graph (portrait or earlier clusters).
    clusters.forEach((c, k) => {
      const pool = face.map((n) => n).concat(...clusters.slice(0, k).map((o) => o.pts));
      const picks = [Math.floor(c.pts.length * 0.15), Math.floor(c.pts.length * 0.5), Math.floor(c.pts.length * 0.85)];
      picks.forEach((pi) => {
        const p = c.pts[pi]; let best = null, bd = Infinity;
        pool.forEach((q) => { const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2; if (d < bd) { bd = d; best = q; } });
        if (best) c.bridges.push([pi, best]);
      });
    });

    const pr = rng(5);
    packets = Array.from({ length: small ? 10 : 18 }, () => ({ e: Math.floor(pr() * faceEdges.length), t: pr(), s: 0.006 + pr() * 0.01, dir: 1 }));
    gReady = true;
    buildArtifacts();
    fitHeadlines();
    updateHero();
    drawGraph(performance.now());
  };

  /* Artefact cards (DOM) and feed lines */
  let artEls = [], feedEls = [];
  const buildArtifacts = () => {
    artLayer.innerHTML = ""; feed.innerHTML = "";
    artEls = ARTIFACTS.map((a) => {
      const el = document.createElement("div");
      el.className = "artifact";
      el.innerHTML = `<i></i><b></b><small></small>`;
      el.querySelector("b").textContent = a.name;
      el.querySelector("small").textContent = a.kind;
      artLayer.appendChild(el);
      return el;
    });
    feedEls = clusters.map((c) => {
      const li = document.createElement("li");
      li.innerHTML = `<b>+${fmt(c.pts.length)}</b> Knoten<span class="src"> aus „<span></span>“</span>`;
      li.querySelector(".src span").textContent = c.a.name;
      feed.appendChild(li);
      return li;
    });
  };

  /* Size both three-line headlines as large as possible without touching the portrait,
     the counters, the feed or each other. Searches font size and vertical position together.
     Desktop: both blocks share one top, left and right of the portrait. Phones: stacked above it. */
  const fitHeadlines = () => {
    if (!alpha || !pBox) return;
    const all = [...hero.querySelectorAll(".hl")];
    const L = hero.querySelector(".hero-base .hl-left"), Rh = hero.querySelector(".hero-base .hl-right");
    const hr = hero.getBoundingClientRect();
    const stacked = stackedMode();
    all.forEach((el) => (el.style.top = ""));
    hero.style.removeProperty("--hl-fs");
    const fsMax = parseFloat(getComputedStyle(L).fontSize);

    // measure at a reference size; width and height scale linearly with font size
    const REF = 100;
    hero.style.setProperty("--hl-fs", REF + "px");
    const widest = (el) => Math.max(...[...el.children].map((sp) => sp.getBoundingClientRect().width));
    const wL0 = widest(L), wR0 = widest(Rh), hL0 = L.getBoundingClientRect().height, hR0 = Rh.getBoundingClientRect().height;

    // portrait silhouette per row, in hero coordinates
    const rowMin = new Float32Array(ah).fill(Infinity), rowMax = new Float32Array(ah).fill(-Infinity);
    for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) {
      if (alpha[y * aw + x] > 40) { const hx = pBox.x + x / aw * pBox.w; if (hx < rowMin[y]) rowMin[y] = hx; const hx2 = pBox.x + (x + 1) / aw * pBox.w; if (hx2 > rowMax[y]) rowMax[y] = hx2; }
    }
    const sil = (top, bottom) => {
      let mn = Infinity, mx = -Infinity;
      const y0 = Math.max(0, Math.floor((top - pBox.y) / pBox.h * ah)), y1 = Math.min(ah - 1, Math.ceil((bottom - pBox.y) / pBox.h * ah));
      for (let y = y0; y <= y1; y++) { if (rowMin[y] < mn) mn = rowMin[y]; if (rowMax[y] > mx) mx = rowMax[y]; }
      return mn === Infinity ? null : { left: mn, right: mx };
    };

    const gap = Math.max(16, W * 0.02);
    const gutL = parseFloat(getComputedStyle(L).left) || 20;
    const gutR = parseFloat(getComputedStyle(Rh).right) || 20;
    const tl = hero.querySelector(".hud-tl");
    const minTop = tl && tl.offsetParent ? tl.offsetTop + tl.offsetHeight + 18 : (H < 500 ? 58 : 84);
    const maxBottom = H - (stacked ? 110 : H < 500 ? 70 : 170); // keep clear of counters, feed and hints
    const preferTop = stacked ? minTop : H * 0.26;
    const fitsLeft = (t, w, h) => { const s2 = sil(t, t + h); return gutL + w <= (s2 ? s2.left - gap : W - gutR); };
    const fitsRight = (t, w, h) => { const s2 = sil(t, t + h); return W - gutR - w >= (s2 ? s2.right + gap : gutL); };

    let best = null;
    for (let fs = Math.floor(fsMax); fs >= 24 && !best; fs -= 1) {
      const k = fs / REF, wL = wL0 * k, wR = wR0 * k, hL = hL0 * k, hR = hR0 * k;
      if (stacked) {
        if (wL > W - gutL - gutR || wR > W - gutL - gutR) continue;
        for (let t = minTop; ; t += 4) {
          const rTop = t + hL + fs * 0.18;
          if (rTop + hR > maxBottom) break;
          if (fitsLeft(t, wL, hL) && fitsRight(rTop, wR, hR)) { best = { fs, t, rTop }; break; }
        }
      } else {
        if (wL + wR + gap * 2 > W - gutL - gutR) continue;
        let cand = null;
        for (let t = minTop; t + Math.max(hL, hR) <= maxBottom; t += 4) {
          if (fitsLeft(t, wL, hL) && fitsRight(t, wR, hR) && (!cand || Math.abs(t - preferTop) < Math.abs(cand - preferTop))) cand = t;
        }
        if (cand !== null) best = { fs, t: cand, rTop: cand };
      }
    }
    if (!best) best = { fs: 24, t: minTop, rTop: minTop + 3 * 24 };
    hero.style.setProperty("--hl-fs", best.fs + "px");
    hero.querySelectorAll(".hl-left").forEach((el) => (el.style.top = best.t + "px"));
    hero.querySelectorAll(".hl-right").forEach((el) => (el.style.top = best.rTop + "px"));
    const rr = hero.querySelector(".hero-ai .hl-right").getBoundingClientRect();
    hlBox = { left: rr.left - hr.left, right: rr.right - hr.left, top: rr.top - hr.top, bottom: rr.bottom - hr.top };
  };

  const nodeVisibleCount = (c, f) => Math.floor(c.pts.length * f);

  const drawGraph = (now) => {
    if (!gReady) return;
    gctx.clearRect(0, 0, W, H);
    const faceF = Math.max(state.faceF, lens.r > 1 ? 1 : 0);
    const faceCount = Math.floor(face.length * faceF);

    // edges
    gctx.lineWidth = 0.7;
    gctx.strokeStyle = "rgba(236,238,241,.22)";
    gctx.beginPath();
    faceEdges.forEach(([a, b]) => { if (a < faceCount && b < faceCount) { gctx.moveTo(face[a].x, face[a].y); gctx.lineTo(face[b].x, face[b].y); } });
    clusters.forEach((c, k) => {
      const vis = nodeVisibleCount(c, state.steps[k]);
      c.edges.forEach(([a, b, m]) => { if (m < vis) { gctx.moveTo(c.pts[a].x, c.pts[a].y); gctx.lineTo(c.pts[b].x, c.pts[b].y); } });
      c.bridges.forEach(([pi, q]) => { if (pi < vis) { gctx.moveTo(c.pts[pi].x, c.pts[pi].y); gctx.lineTo(q.x, q.y); } });
    });
    gctx.stroke();

    // links from each cluster to its concept in the portrait
    gctx.strokeStyle = "rgba(242,107,29,.55)";
    gctx.lineWidth = 1;
    gctx.setLineDash([3, 4]);
    gctx.beginPath();
    clusters.forEach((c, k) => {
      if (state.steps[k] <= 0 || !c.pts.length) return;
      const h = face[c.hub.i], p = c.pts[0];
      const f = clamp(state.steps[k] * 3);
      gctx.moveTo(p.x, p.y); gctx.lineTo(p.x + (h.x - p.x) * f, p.y + (h.y - p.y) * f);
    });
    gctx.stroke();
    gctx.setLineDash([]);

    // nodes
    gctx.fillStyle = "rgba(236,238,241,.85)";
    for (let i = 0; i < faceCount; i++) {
      const n = face[i]; const r = 1 + 0.5 * Math.sin(now * 0.002 + n.p);
      gctx.fillRect(n.x - r * 0.75, n.y - r * 0.75, r * 1.5, r * 1.5);
    }
    clusters.forEach((c, k) => {
      const exact = c.pts.length * state.steps[k];
      const vis = Math.floor(exact);
      for (let i = 0; i < vis; i++) {
        const n = c.pts[i];
        const fresh = exact - i < 14;
        const r = (fresh ? 1.9 : 1) + 0.5 * Math.sin(now * 0.002 + n.p);
        gctx.fillStyle = fresh ? "#F26B1D" : "rgba(236,238,241,.78)";
        gctx.fillRect(n.x - r * 0.75, n.y - r * 0.75, r * 1.5, r * 1.5);
      }
    });

    // query packets travelling through the portrait graph
    if (faceF > 0.5) {
      gctx.fillStyle = "#F26B1D";
      packets.forEach((pk) => {
        const e = faceEdges[pk.e]; if (!e) return;
        const [a, b] = pk.dir > 0 ? e : [e[1], e[0]];
        const x = face[a].x + (face[b].x - face[a].x) * pk.t, y = face[a].y + (face[b].y - face[a].y) * pk.t;
        gctx.beginPath(); gctx.arc(x, y, 2, 0, 6.283); gctx.fill();
      });
    }

    // concept labels
    gctx.font = "500 10px 'IBM Plex Mono', monospace";
    gctx.textBaseline = "middle";
    hubs.forEach((h, k) => {
      const n = face[h.i];
      const pulse = 4 + 2 * Math.sin(now * 0.003 + k);
      gctx.strokeStyle = "rgba(242,107,29,.55)"; gctx.lineWidth = 1;
      gctx.beginPath(); gctx.arc(n.x, n.y, pulse + 4, 0, 6.283); gctx.stroke();
      gctx.fillStyle = "#F26B1D";
      gctx.beginPath(); gctx.arc(n.x, n.y, 3.2, 0, 6.283); gctx.fill();
      const tw2 = gctx.measureText(h.label).width;
      const flip = n.x + tw2 + 30 > W;
      const bx = flip ? n.x - tw2 - 19 : n.x + 9;
      gctx.fillStyle = "rgba(10,21,34,.85)"; gctx.fillRect(bx, n.y - 8, tw2 + 10, 16);
      gctx.fillStyle = "#ECEEF1"; gctx.fillText(h.label, bx + 5, n.y + 0.5);
    });
  };

  const stepPackets = () => packets.forEach((pk) => {
    pk.t += pk.s;
    if (pk.t < 1) return;
    const e = faceEdges[pk.e]; const end = pk.dir > 0 ? e[1] : e[0];
    const next = [];
    for (let i = 0; i < faceEdges.length; i++) { const f = faceEdges[i]; if (i !== pk.e && (f[0] === end || f[1] === end)) next.push(i); }
    pk.e = next.length ? next[Math.floor(Math.random() * next.length)] : Math.floor(Math.random() * faceEdges.length);
    pk.dir = faceEdges[pk.e][0] === end ? 1 : -1;
    pk.t = 0;
  });

  /* Lens: before the scroll animation starts, the KI layer shows through a circle
     wherever the pointer (or a finger) is over the portrait. */
  const aiLayer = document.querySelector(".hero-ai");
  const lensEl = document.querySelector(".lens");
  const lens = { x: 0, y: 0, tx: 0, ty: 0, r: 0, tr: 0, on: false };
  const lensRadius = () => (narrow() ? 96 : 75);
  const overPortrait = (x, y) => {
    if (!pBox || !alpha) return false;
    if (x < pBox.x || x > pBox.x + pBox.w || y < pBox.y || y > pBox.y + pBox.h) return false;
    const ax = Math.floor((x - pBox.x) / pBox.w * aw), ay = Math.floor((y - pBox.y) / pBox.h * ah);
    return alpha[Math.min(ah - 1, ay) * aw + Math.min(aw - 1, ax)] > 40;
  };
  const lensAllowed = () => state.wipe >= 0.995 && !reduce;
  const pointAt = (cx, cy) => {
    const hr = hero.getBoundingClientRect();
    const x = cx - hr.left, y = cy - hr.top;
    lens.tx = x; lens.ty = y;
    const inside = lensAllowed() && overPortrait(x, y);
    if (inside && !lens.on) { lens.x = x; lens.y = y; }
    lens.on = inside;
    lens.tr = inside ? lensRadius() : 0;
    if (inside) hero.classList.add("revealed");
  };
  const lensOff = () => { lens.on = false; lens.tr = 0; };
  hero.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") pointAt(e.clientX, e.clientY); });
  hero.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") lensOff(); });
  let hold = null, holdTimer = 0;
  hero.addEventListener("touchstart", (e) => {
    const t = e.touches[0]; if (!t || e.touches.length > 1) return;
    hold = { x: t.clientX, y: t.clientY, active: false };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { if (hold) { hold.active = true; pointAt(hold.x, hold.y); if (!lens.on) hold = null; } }, 160);
  }, { passive: true });
  hero.addEventListener("touchmove", (e) => {
    const t = e.touches[0]; if (!t || !hold) return;
    if (hold.active) { e.preventDefault(); pointAt(t.clientX, t.clientY); return; }
    if (Math.hypot(t.clientX - hold.x, t.clientY - hold.y) > 10) { clearTimeout(holdTimer); hold = null; } // it is a scroll
    else { hold.x = t.clientX; hold.y = t.clientY; }
  }, { passive: false });
  const touchUp = () => { clearTimeout(holdTimer); hold = null; lensOff(); };
  hero.addEventListener("touchend", touchUp, { passive: true });
  hero.addEventListener("touchcancel", touchUp, { passive: true });
  hero.querySelectorAll("img").forEach((img) => img.addEventListener("contextmenu", (e) => e.preventDefault()));

  const stepLens = () => {
    if (!lensAllowed()) { lens.tr = 0; lens.on = false; }
    lens.x += (lens.tx - lens.x) * 0.22;
    lens.y += (lens.ty - lens.y) * 0.22;
    lens.r += (lens.tr - lens.r) * 0.18;
    if (lens.r < 0.6 && lens.tr === 0) lens.r = 0;
    if (state.wipe < 0.995) {
      aiLayer.style.clipPath = ""; aiLayer.style.webkitClipPath = "";
      lensEl.style.opacity = "0";
      return;
    }
    const cp = `circle(${lens.r.toFixed(1)}px at ${lens.x.toFixed(1)}px ${lens.y.toFixed(1)}px)`;
    aiLayer.style.clipPath = cp; aiLayer.style.webkitClipPath = cp;
    const d = lens.r * 2;
    lensEl.style.width = d + "px"; lensEl.style.height = d + "px";
    lensEl.style.transform = `translate3d(${(lens.x - lens.r).toFixed(1)}px,${(lens.y - lens.r).toFixed(1)}px,0)`;
    lensEl.style.opacity = lens.r > 2 ? "1" : "0";
  };

  // Scroll timeline of the hero, as fractions of the pinned distance.
  const WIPE = [0.03, 0.30], ENRICH = [0.34, 0.96];

  const updateHero = () => {
    const total = scene.offsetHeight - window.innerHeight;
    const p = reduce ? 1 : (total > 0 ? clamp(-scene.getBoundingClientRect().top / total) : 1);
    const wp = ease(clamp((p - WIPE[0]) / (WIPE[1] - WIPE[0])));
    state.wipe = 1 - 0.5 * wp;
    state.faceF = wp;
    hero.style.setProperty("--wipe", (state.wipe * 100).toFixed(2) + "%");
    hero.classList.toggle("wiping", state.wipe < 0.995);
    hero.classList.toggle("scrolled", p > 0.015);

    const seg = (ENRICH[1] - ENRICH[0]) / ARTIFACTS.length;
    let nodes = face.length * state.faceF, edges = faceEdges.length * state.faceF;
    ARTIFACTS.forEach((a, k) => {
      const s = clamp((p - ENRICH[0] - k * seg) / seg); // 0..1 within this artefact's step
      const grow = ease(clamp((s - 0.38) / 0.55));
      state.steps[k] = grow;
      const c = clusters[k];
      if (c) {
        const vis = nodeVisibleCount(c, grow);
        nodes += vis;
        edges += c.edges.filter((e) => e[2] < vis).length + c.bridges.filter((b) => b[0] < vis).length;
      }
      // card flies in from the right edge, lands on its cluster and dissolves
      const el = artEls[k];
      if (el && c) {
        const fly = ease(clamp(s / 0.45));
        const cw = el.offsetWidth || 230, ch = el.offsetHeight || 52;
        const x0 = W + 20, y0 = c.cy - ch / 2 + (1 - fly) * 40;
        const x1 = Math.max(W * 0.5 + 10, Math.min(c.cx - cw / 2, W - cw - 12));
        let y1 = Math.min(Math.max(c.cy - ch / 2, 70), H - ch - 120);
        if (hlBox && x1 < hlBox.right && x1 + cw > hlBox.left && y1 < hlBox.bottom + 8 && y1 + ch > hlBox.top - 8) {
          y1 = (c.cy < (hlBox.top + hlBox.bottom) / 2) ? hlBox.top - ch - 12 : hlBox.bottom + 12;
        }
        const x = x0 + (x1 - x0) * fly, y = y0 + (y1 - y0) * fly;
        const out = clamp((s - 0.42) / 0.2);
        const op = s <= 0 || s >= 0.62 ? 0 : (s < 0.06 ? s / 0.06 : 1 - out);
        el.style.opacity = op.toFixed(3);
        el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${(1 - out * 0.35).toFixed(3)})`;
      }
      if (feedEls[k]) feedEls[k].classList.toggle("on", s > 0.55);
    });
    // show only the latest four feed lines
    const on = feedEls.filter((li) => li.classList.contains("on"));
    feedEls.forEach((li) => (li.style.display = ""));
    const keep = narrow() ? 2 : 4;
    on.slice(0, Math.max(0, on.length - keep)).forEach((li) => (li.style.display = "none"));

    if (nodeEl) nodeEl.textContent = fmt(nodes);
    if (edgeEl) edgeEl.textContent = fmt(edges);
    if (gReady && (reduce || document.hidden)) drawGraph(performance.now());
  };

  const heroLoop = (now) => {
    const r = scene.getBoundingClientRect();
    const visible = r.bottom > 0 && r.top < window.innerHeight;
    if (visible && !document.hidden) {
      stepLens();
      if (state.wipe < 0.995 || lens.r > 1) { stepPackets(); drawGraph(now); }
    }
    requestAnimationFrame(heroLoop);
  };

  if (ghost.complete) buildGraph(); else ghost.addEventListener("load", buildGraph);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitHeadlines(); gReady && drawGraph(performance.now()); });
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
  document.querySelector(".progress").style.setProperty("--phase-at", `calc(${(aiIndex / (cards.length - 1)) * 100}% - 3em)`);
  let travel = 0;

  const sizeJourney = () => {
    if (narrow() || reduce) {
      journey.style.height = ""; track.style.transform = ""; travel = 0;
      cards.forEach((c) => c.classList.remove("active"));
      return;
    }
    const lastCard = cards[cards.length - 1];
    const gutR = parseFloat(getComputedStyle(track).paddingRight) || 0;
    travel = Math.max(0, lastCard.offsetLeft + lastCard.offsetWidth + gutR - window.innerWidth);
    journey.style.height = (window.innerHeight + travel) + "px";
  };

  const updateJourney = () => {
    if (!travel) return;
    const p = clamp(-journey.getBoundingClientRect().top / travel);
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
      copyBtn.textContent = "Markiert, bitte kopieren";
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(email).then(done, fallback);
    else fallback();
  });

  /* ---------- Wiring ---------- */
  const onScroll = () => { updateHero(); updateJourney(); };
  if (lenis) lenis.on("scroll", onScroll);
  window.addEventListener("scroll", onScroll, { passive: true });
  let rt;
  let lastW = window.innerWidth, lastH = window.innerHeight;
  window.addEventListener("resize", () => {
    const w = window.innerWidth, h = window.innerHeight;
    // the address bar on phones changes the height while scrolling; only re-layout on real changes
    if (w === lastW && Math.abs(h - lastH) < 160) return;
    lastW = w; lastH = h;
    clearTimeout(rt);
    rt = setTimeout(() => { sizeTopo(); drawTopo(performance.now()); buildGraph(); sizeJourney(); onScroll(); }, 120);
  });
  window.addEventListener("orientationchange", () => { lastW = -1; });

  sizeJourney();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sizeJourney(); onScroll(); });
  window.addEventListener("load", () => { sizeJourney(); onScroll(); });
  onScroll();
})();
