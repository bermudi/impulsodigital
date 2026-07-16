/* ============================================================
   cube.js — scroll-driven 3D portfolio cube
   Adapted from Luis Martinez Riancho's "Six Faces" technique:
   - Cube rotation interpolates between stops based on smoothed
     scroll position (inertia via rAF + exponential smoothing)
   - Faces show projects; HUD tracks progress; scene dots track
     active section
   - Cube + HUD fade out when user scrolls into post-cube content
   - IntersectionObserver fires reveal animations per card
   - prefers-reduced-motion = static fallback (CSS handles it)
   ============================================================ */

(function () {
  "use strict";

  // 6 cube sections (s0–s5). Rotation stops for each.
  const N = 6;
  const STOPS = [
    { rx: 90,  ry: 0    },  // s0 hero — shows TOP
    { rx: 0,   ry: 0    },  // s1 — shows FRONT
    { rx: 0,   ry: -90  },  // s2 — shows RIGHT
    { rx: 0,   ry: -180 },  // s3 — shows BACK
    { rx: 0,   ry: -270 },  // s4 — shows LEFT
    { rx: -90, ry: -360 },  // s5 — shows BOTTOM
  ];

  const FACE_NAMES = ["IMPULSO", "SERVICIOS", "POR QUÉ YO", "EN VIVO", "PRUÉBALO", "HABLEMOS"];

  const dom = {
    cube: document.getElementById("cube"),
    scene: document.getElementById("scene"),
    hud: document.getElementById("hud"),
    strip: document.getElementById("scene_strip"),
    faceCaption: document.getElementById("face_caption"),
    scrollEl: document.getElementById("scroll_container"),
    hudPct: document.getElementById("hud_pct"),
    progFill: document.getElementById("prog_fill"),
    sceneName: document.getElementById("scene_name"),
    captionNum: document.getElementById("face_caption_num"),
    captionName: document.getElementById("face_caption_name"),
    header: document.getElementById("site_header"),
  };

  const sections = [...document.querySelectorAll("#scroll_container section")];
  const sceneDots = [...document.querySelectorAll(".scene-dot")];

  // Check for reduced motion — if set, skip all the cube logic entirely.
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) {
    // Fire all reveals immediately so content is visible
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible"));
    // Hide cube UI
    [dom.scene, dom.hud, dom.strip, dom.faceCaption].forEach((el) => el && (el.style.display = "none"));
    return;
  }

  // ---------- Scroll smoothing state ----------
  let sectionTops = [];
  let maxScroll = 1;
  let lastScrollHeight = 0;
  let lastInnerHeight = 0;
  let tgt = 0;       // target scroll progress 0..1
  let smooth = 0;    // smoothed progress
  let velocity = 0;  // wheel velocity for inertia
  let currentStop = -1;

  const ease = 0.1;
  const easeIO = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

  // ---------- Section measurement ----------
  function buildSectionTops() {
    sectionTops = sections.map((s) => s.getBoundingClientRect().top + window.scrollY);
  }

  function resize() {
    const h = document.documentElement.scrollHeight;
    const vh = window.innerHeight;
    if (h === lastScrollHeight && vh === lastInnerHeight) return;
    lastScrollHeight = h;
    lastInnerHeight = vh;
    maxScroll = Math.max(1, h - vh);
    buildSectionTops();
  }

  // ---------- Cube transform ----------
  function setCubeTransform(s) {
    if (N < 2) return;
    const t = s * (N - 1);
    const i = Math.min(Math.floor(t), N - 2);
    const f = easeIO(t - i);
    const a = STOPS[i];
    const b = STOPS[i + 1];
    const rx = a.rx + (b.rx - a.rx) * f;
    const ry = a.ry + (b.ry - a.ry) * f;
    if (dom.cube) dom.cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  }

  // ---------- Section index from scroll ----------
  function sectionIndexFromScroll(y) {
    const mid = y + window.innerHeight * 0.5;
    let idx = 0;
    for (let i = 0; i < sectionTops.length; i++) {
      if (mid >= sectionTops[i]) idx = i;
    }
    return Math.min(idx, N - 1);
  }

  // ---------- HUD + caption update ----------
  function updateHUD(s) {
    const p = Math.round(s * 100);
    const si = sectionIndexFromScroll(window.scrollY);
    if (dom.hudPct) dom.hudPct.textContent = String(p).padStart(3, "0") + "%";
    if (dom.progFill) dom.progFill.style.width = `${p}%`;
    if (si !== currentStop) {
      currentStop = si;
      const name = FACE_NAMES[si] || "";
      if (dom.sceneName) dom.sceneName.textContent = name;
      if (dom.captionNum) dom.captionNum.textContent = String(si).padStart(2, "0");
      if (dom.captionName) dom.captionName.textContent = name;
      sceneDots.forEach((d, i) => d.classList.toggle("active", i === si));
    }
  }

  // ---------- Cube fade when entering post-cube content ----------
  function updateCubeFade() {
    // Find where the post_cube section starts
    const postCube = document.getElementById("post_cube");
    if (!postCube) return;
    const postTop = postCube.getBoundingClientRect().top + window.scrollY;
    const viewportBottom = window.scrollY + window.innerHeight;
    const fadeStart = postTop - window.innerHeight * 0.5;

    const shouldFade = window.scrollY > fadeStart;
    [dom.scene, dom.hud, dom.strip, dom.faceCaption].forEach((el) => {
      if (el) el.classList.toggle("fade", shouldFade);
    });
    // Also fade the header slightly when in cube zone, full opacity in post-cube
    if (dom.header) dom.header.style.opacity = shouldFade ? "1" : "0.7";
  }

  // ---------- Reveal animations (IntersectionObserver) ----------
  const revealEls = document.querySelectorAll(".reveal");
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.15 }
  );
  revealEls.forEach((el) => io.observe(el));

  // ---------- Smooth anchor scrolling ----------
  let anchorAnim = null;
  function stopAnchorAnim() {
    if (anchorAnim) { cancelAnimationFrame(anchorAnim); anchorAnim = null; }
  }
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function smoothScrollToY(targetY, duration = 900) {
    stopAnchorAnim();
    velocity = 0;
    const startY = window.scrollY;
    const diff = targetY - startY;
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const y = startY + diff * easeInOutCubic(p);
      window.scrollTo(0, y);
      if (p < 1) anchorAnim = requestAnimationFrame(tick);
      else anchorAnim = null;
    }
    anchorAnim = requestAnimationFrame(tick);
  }

  // ---------- Event listeners ----------
  window.addEventListener("scroll", () => {
    tgt = maxScroll > 0 ? window.scrollY / maxScroll : 0;
    tgt = Math.max(0, Math.min(1, tgt));
  }, { passive: true });

  // Wheel inertia (optional — only in cube zone, doesn't hijack normal scroll)
  const isSmallScreen = window.matchMedia("(max-width: 900px)").matches;
  if (!isSmallScreen) {
    window.addEventListener("wheel", (e) => {
      // Only apply smoothing in the cube section
      const inCubeZone = window.scrollY < (sectionTops[N - 1] || maxScroll);
      if (!inCubeZone) return;
      e.preventDefault();
      const linePx = 16;
      const pagePx = window.innerHeight * 0.9;
      const delta = e.deltaMode === 1 ? e.deltaY * linePx : e.deltaMode === 2 ? e.deltaY * pagePx : e.deltaY;
      if (Math.abs(delta) < 5) return;
      stopAnchorAnim();
      velocity += delta;
      velocity = Math.max(-800, Math.min(800, velocity));
    }, { passive: false });
  }

  window.addEventListener("touchstart", stopAnchorAnim, { passive: true });
  window.addEventListener("mousedown", stopAnchorAnim, { passive: true });
  window.addEventListener("keydown", stopAnchorAnim);
  window.addEventListener("resize", () => { resize(); tgt = maxScroll > 0 ? window.scrollY / maxScroll : 0; smooth = tgt; });

  // ResizeObserver for dynamic content
  let resizePending = false;
  const ro = new ResizeObserver(() => {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(() => { resize(); resizePending = false; });
  });
  ro.observe(document.documentElement);

  // Anchor link clicks (scene dots, nav, CTAs to #sN)
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#s"]');
    if (!a) return;
    const target = document.querySelector(a.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    const idx = sections.indexOf(target);
    const baseY = idx >= 0 ? sectionTops[idx] : target.getBoundingClientRect().top + window.scrollY;
    smoothScrollToY(Math.max(0, baseY));
  });

  // ---------- Animation loop ----------
  let lastNow = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { lastNow = now; return; }
    const dt = Math.min((now - lastNow) / 1000, 0.05);
    lastNow = now;

    // Apply wheel velocity to scroll
    const friction = Math.abs(velocity) > 200 ? 0.8 : 0.9;
    velocity *= Math.pow(friction, dt * 60);
    if (Math.abs(velocity) < 0.01) velocity = 0;
    if (Math.abs(velocity) > 0.2) {
      const next = Math.max(0, Math.min(window.scrollY + velocity * ease, maxScroll));
      window.scrollTo(0, next);
      tgt = next / maxScroll;
    }

    // Smooth the target
    smooth += (tgt - smooth) * (1 - Math.exp(-dt * 8));
    smooth = Math.max(0, Math.min(1, smooth));

    updateHUD(smooth);
    updateCubeFade();
    setCubeTransform(smooth);
  }

  // ---------- Init ----------
  resize();
  tgt = maxScroll > 0 ? window.scrollY / maxScroll : 0;
  smooth = tgt;
  requestAnimationFrame(frame);
})();
