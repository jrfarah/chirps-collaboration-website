/**
 * Hero — pinned, monotonic scroll sequence, rebuilt clean.
 *
 * Two independently-scaled elements, siblings (neither's transform
 * touches the other):
 *   .hero-stage  — bg_environment + corner haze ("the dust"). Sized
 *                  to 100vmax (== max(100vw, 100vh)), the standard
 *                  "cover a viewport with a square" trick — this
 *                  always fills the screen, at any aspect ratio, with
 *                  no pillarbox bars, and needs no JS measurement.
 *   .hero-engine — disk + magnetar + all four jet pieces + the cover
 *                  text overlay, ONE rigid group ("the object"). Its
 *                  CSS size (hero.css) is deliberately the exact size
 *                  at which scale:1 makes the text overlay fill
 *                  --frame-w — i.e. its *resting* scale is Beat 3's
 *                  registered, frame-filling state. Beat 1's "small,
 *                  contained, ~35% of viewport width" look is a
 *                  scale-up applied on top of that (computed once,
 *                  see computeEngineStartScale). That scale-up holds
 *                  fixed through all of Beat 2 — the object's size
 *                  never changes while the dust flies — and only
 *                  eases down to 1 during the Beat 3 assembly window,
 *                  monotonically, one direction, so it reads as the
 *                  frame gathering itself around a still object in
 *                  one deliberate motion, never a reversal.
 *
 * Parallax rates are deliberately lopsided — this is the intended
 * feel, not an oversight: bg drifts slowest, haze ("dust") gets a
 * strong, fast, individually-directed drift per corner, and the
 * engine ("object") gets the weakest drift of all, so it reads as
 * the calm anchor the dust rushes past.
 *
 * Because every engine child (jets, disk, magnetar, overlay) is
 * positioned in the SAME percentage system relative to one shared
 * parallax transform on .hero-engine itself — never one transform
 * per child — nothing inside it can ever drift apart from anything
 * else inside it, at any scroll position, by construction.
 *
 * Beat 3 is a single register-and-reveal, not a crossfade: the text
 * overlay (cover_text_overlay.png — the real Nature masthead/cover
 * text with the artwork cut out) fades and settles in over the still-
 * live engine, and the four --bg bars close to the cover's trim size,
 * at the same time. cover_art.jpeg / cover_nature.png are not used
 * here at all — the live disk showing through the overlay's negative
 * space *is* the cover. (cover_nature.png still backs the separate,
 * fully static prefers-reduced-motion fallback in index.html — a
 * different code path, not part of this reveal.)
 */

// --- ANIMATED PROPERTIES (scroll-driven timeline only — the ambient
// idle loop below is wall-clock-driven, not scroll-position-driven,
// and out of scope for the monotonicity requirement here).
// Every row moves in exactly one direction as progress goes 0 → 1.
// None reverse; each is a single .to() with one start and one end.
//
//   property                     direction (start → end)
//   -------------------------    -----------------------------------
//   copy opacity                 1 → 0
//   copy yPercent                0 → -25   (lifts while fading)
//   scrollcue opacity            1 → 0
//   stage yPercent               base → base + drift  (slow, one sign)
//   haze-1 xPercent / yPercent   0 → large, own sign  (fast, monotonic)
//   haze-2 xPercent / yPercent   0 → large, own sign
//   haze-3 xPercent / yPercent   0 → large, own sign
//   haze-4 xPercent / yPercent   0 → large, own sign
//   engine yPercent              base → base + drift  (weak, one sign,
//                                          full scroll — Beat 2's only
//                                          motion on the object)
//   engine scale                 k1 → 1   (Beat 3 window only, one
//                                          direction — see
//                                          computeEngineStartScale;
//                                          typically shrinking. Fixed
//                                          through all of Beat 2, so
//                                          the object's SIZE is truly
//                                          still while the dust flies)
//   overlay opacity              0 → 1     (Beat 3 window only)
//   overlay scale                1.15 → 1  (Beat 3 window only)
//   bar scaleX (left/right)      0 → 1     (Beat 3 window only)
//   bar scaleY (top/bottom)      0 → 1     (Beat 3 window only)
//   caption opacity              0 → 1     (Beat 3 window only)
//   caption yPercent             4 → 0     (Beat 3 window only)
//
// Nothing here is ever animated back toward an earlier value.

function cssNum(name, el = document.documentElement) {
  return parseFloat(getComputedStyle(el).getPropertyValue(name));
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

async function preloadLayers(root) {
  const images = Array.from(root.querySelectorAll('.hero-layer'));
  const ready = images.map((img) =>
    img.decode ? img.decode().catch(() => {}) : Promise.resolve()
  );
  // Don't let one stalled decode hold the whole hero hidden forever.
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
  await Promise.race([Promise.all(ready), timeout]);
}

export async function initHero() {
  const hero = document.querySelector('[data-hero]');
  if (!hero) return;

  const pin = hero.querySelector('[data-hero-pin]');
  const stage = hero.querySelector('[data-hero-stage]');
  const engine = hero.querySelector('[data-hero-engine]');
  const jetLower = hero.querySelector('[data-hero-jet-lower]');
  const jetUpper = hero.querySelector('[data-hero-jet-upper]');
  const jetGlow1 = hero.querySelector('[data-hero-jetglow-1]');
  const jetGlow2 = hero.querySelector('[data-hero-jetglow-2]');
  const overlay = hero.querySelector('[data-hero-overlay]');
  const haze = Array.from(hero.querySelectorAll('.hero-layer--haze'));
  const copy = hero.querySelector('[data-hero-copy]');
  const scrollcue = hero.querySelector('[data-hero-scrollcue]');
  const caption = hero.querySelector('[data-hero-caption]');
  const bars = {
    left: hero.querySelector('[data-hero-bar="left"]'),
    right: hero.querySelector('[data-hero-bar="right"]'),
    top: hero.querySelector('[data-hero-bar="top"]'),
    bottom: hero.querySelector('[data-hero-bar="bottom"]'),
  };

  await preloadLayers(hero);
  pin.classList.add('is-ready');

  if (prefersReducedMotion()) {
    // No pin, no scrub, no ambient loop, no engine scale-up. Beat 1
    // renders at rest (engine at its frame-matching resting scale —
    // see hero.css) and the static block in the markup gives a
    // direct, non-animated path to the resolved cover.
    return;
  }

  const gsapLib = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  if (!gsapLib || !ScrollTrigger) {
    console.warn('[hero] GSAP failed to load from the CDN — hero will stay static.');
    return;
  }
  gsapLib.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  const isMobile = window.matchMedia('(max-width: 700px)').matches;
  const parallaxScale = isMobile ? 0.6 : 1;
  const dyn = (base) => base * parallaxScale;

  /**
   * .hero-engine's CSS size (hero.css) is set so that scale:1 is
   * exactly the size at which the text overlay fills --frame-w — the
   * registered, Beat-3 resting state. For Beat 1 we want the disk
   * (68.75% of the engine's box) to read at ~35% of viewport width
   * instead, which is a DIFFERENT, viewport-dependent size with no
   * fixed ratio to the frame-matching one — so the one extra scale
   * factor needed to get from "frame-matching" to "Beat-1 composition"
   * is measured, once, off the engine's actual laid-out (untransformed)
   * width. This is the only JS measurement in the whole sequence.
   */
  function computeEngineStartScale() {
    const naturalWidth = engine.getBoundingClientRect().width || 1;
    const targetDiskWidth = 0.35 * window.innerWidth;
    const targetEngineWidth = targetDiskWidth / 0.6875; // disk is 68.75% of engine
    return targetEngineWidth / naturalWidth;
  }

  // --- Beat-1 ambient idle loop (wall-clock, not scroll-linked) -----
  // Restrained on purpose: faint jet flicker only, nothing else moves
  // at rest.
  function startAmbient() {
    const ambient = gsapLib.timeline({ defaults: { ease: 'sine.inOut' } });
    ambient.fromTo([jetUpper, jetLower], { opacity: 0.9 }, {
      opacity: 1,
      duration: cssNum('--duration-ambient'),
      yoyo: true,
      repeat: -1,
    }, 0);
    ambient.fromTo([jetGlow1, jetGlow2], { opacity: 0.32 }, {
      opacity: 0.38,
      duration: cssNum('--duration-ambient'),
      yoyo: true,
      repeat: -1,
    }, 0);
  }

  // --- Scroll-driven timeline: monotonic, built once per layout.
  let st = null;
  let tl = null;

  function buildScrollSequence() {
    const k1 = computeEngineStartScale();

    gsapLib.set(stage, { xPercent: -50, yPercent: -50 });
    gsapLib.set(engine, { xPercent: -50, yPercent: -50, scale: k1 });
    gsapLib.set(overlay, { opacity: 0, scale: 1.15 });
    gsapLib.set([bars.left, bars.right], { scaleX: 0 });
    gsapLib.set([bars.top, bars.bottom], { scaleY: 0 });
    gsapLib.set(copy, { opacity: 1, yPercent: 0 });
    gsapLib.set(caption, { opacity: 0, yPercent: 4 });

    tl = gsapLib.timeline({ defaults: { ease: 'none' } });

    // Title lifts away early. One direction: fading, lifting.
    tl.to(copy, { yPercent: -25, opacity: 0, duration: 0.15 }, 0);
    tl.to(scrollcue, { opacity: 0, duration: 0.08 }, 0);

    // The dust: strong, fast, each corner its own direction — this is
    // the scene's dynamism. Background drifts far slower beneath it.
    tl.to(stage, { yPercent: -50 + dyn(4), duration: 1 }, 0);
    tl.to('.haze-1', { xPercent: dyn(-62), yPercent: dyn(80),  duration: 1 }, 0);
    tl.to('.haze-2', { xPercent: dyn(66),  yPercent: dyn(92),  duration: 1 }, 0);
    tl.to('.haze-3', { xPercent: dyn(56),  yPercent: dyn(-72), duration: 1 }, 0);
    tl.to('.haze-4', { xPercent: dyn(-70), yPercent: dyn(-88), duration: 1 }, 0);

    // The object: weak drift only, across the whole scroll — its
    // SIZE stays fixed through all of Beat 2 (no scale tween here),
    // which is what actually reads as "still" while the dust flies.
    tl.to(engine, { yPercent: -50 + dyn(3), duration: 1 }, 0);

    // Beat 3: the real Nature text settles onto the still-live scene,
    // the engine eases from its Beat-1 scale-up down to 1 (its
    // frame-matching resting size), and the frame closes to the
    // cover's trim size — all concurrent, all monotonic, no crossfade
    // to any flat image. Confining the engine's scale to this window
    // (rather than spreading it across the whole scroll) is what
    // keeps it feeling anchored during Beat 2 instead of continuously
    // zooming — the one moment it resizes is this single assembly.
    tl.to(engine, { scale: 1, duration: 0.2 }, 0.8);
    tl.to(overlay, { opacity: 1, scale: 1, duration: 0.2 }, 0.8);
    tl.to([bars.left, bars.right], { scaleX: 1, duration: 0.2 }, 0.8);
    tl.to([bars.top, bars.bottom], { scaleY: 1, duration: 0.2 }, 0.8);
    tl.to(caption, { opacity: 1, yPercent: 0, duration: 0.1 }, 0.9);

    st = ScrollTrigger.create({
      id: 'hero-main',
      trigger: hero,
      start: 'top top',
      end: 'bottom bottom',
      pin,
      scrub: 1,
      anticipatePin: 1,
      animation: tl,
    });
  }

  buildScrollSequence();
  startAmbient();

  // computeEngineStartScale() depends on measured viewport/engine
  // pixels, so (unlike stage, which is pure-CSS-sized) a resize needs
  // a fresh measurement — rebuild the whole sequence rather than try
  // to patch one running tween's start value.
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      st?.kill();
      tl?.kill();
      buildScrollSequence();
      ScrollTrigger.refresh();
    }, 200);
  });
}
