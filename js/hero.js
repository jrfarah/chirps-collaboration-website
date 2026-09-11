/**
 * Hero — pinned, monotonic scroll sequence, rebuilt clean.
 *
 * .hero-engine — disk + magnetar + all four jet pieces + the cover
 * text overlay + cover_nature.png, ONE rigid group ("the object"). Its
 * CSS size (hero.css) is deliberately the exact size at which scale:1
 * makes the text overlay (and cover_nature.png, sharing its box — see
 * below) fill --frame-w — i.e. its *resting* scale is Beat 3's
 * registered, frame-filling state. Beat 1's look is a scale-up applied
 * on top of that (computed once, see computeEngineStartScale): the
 * rule is that the jet+glow assembly (jet_glow_1 at top:0%, jet_upper
 * from top:0%, jet_lower/jet_glow_2 to bottom:100% — see
 * assets/cover/layer_positions.json, already spanning the engine's
 * full square box edge-to-edge by construction) fills the viewport
 * top-to-bottom exactly, so the top glow touches the top of the
 * window and the bottom glow touches the bottom, full-bleed. That
 * scale-up holds fixed through all of Beat 2 — the object's size
 * never changes while the dust flies — and only eases down to 1
 * during the Beat 3 assembly window, monotonically, one direction, so
 * it reads as the frame gathering itself around a still object in one
 * deliberate motion, never a reversal. Hero-scoped only: this does
 * NOT persist past the hero (see .bg-fixed below for what does).
 *
 * Engine's own position is a plain, unanimated true-center settle
 * (xPercent/yPercent -50/-50, set once, never tweened) — no residual
 * "weak drift" on top of it. There used to be one (a few percent,
 * meant to read as "the calm anchor the dust drifts past"); it's gone
 * now because it was the ROOT CAUSE of two separate bugs fought over
 * several passes: it put engine's children a few percent off the
 * frame bars' own true-centered window (a gap exposed once the bars
 * faded), and, because cover_nature.png used to live outside engine
 * and had to choose between matching THAT offset (for the crossfade)
 * or true center (for the frame), it could never satisfy both at
 * once. True center for everyone, always, removes the conflict
 * instead of continuing to arbitrate it.
 *
 * Because every engine child (jets, disk, magnetar, overlay,
 * cover_nature.png) is positioned in the SAME percentage system
 * relative to one shared parallax transform on .hero-engine itself —
 * never one transform per child — nothing inside it can ever drift
 * apart from anything else inside it, at any scroll position, by
 * construction.
 *
 * .bg-fixed — bg_environment + all four corner dust/haze layers, one
 * unbroken scene. Unlike the engine, this is NOT hero-scoped: it's a
 * position:fixed layer (see hero.css) driven by its OWN single
 * ScrollTrigger (buildSceneDrift, below) spanning the ENTIRE page —
 * top of the hero to the bottom of the footer, one timeline, one
 * animation, that never restarts and is never re-created. The hero's
 * own timeline (buildScrollSequence) does not touch stage/bg/haze at
 * all; the two are fully independent, so there's exactly one
 * authority over the scene's transform at every scroll position on
 * the page, never two competing.
 *
 * Beat 3 has three parts, all monotonic, none reversing another:
 *   1. Register-and-reveal — the text overlay (cover_text_overlay.png,
 *      the real Nature masthead/cover text with the artwork cut out)
 *      fades and settles in over the still-live engine, and the four
 *      --bg bars close to the cover's trim size. No flat image is
 *      involved yet — the live disk showing through the overlay's
 *      negative space *is* the cover here. Once overlay reaches
 *      opacity 1, it is NEVER faded again — see part 2.
 *   2. Tail-end crossfade — only once part 1 is fully assembled, the
 *      live artwork (disk, magnetar, both jets, both jet-glows — NOT
 *      overlay, NOT the engine group itself) fades away while
 *      cover_nature.png (the same 880×1168 asset the overlay was cut
 *      from) fades in, freezing the living scene into the printed
 *      artifact for a pixel-clean final frame.
 *
 *      overlay and cover_nature.png are two renderings of the exact
 *      same canvas — same crop, same pixel coordinates for the
 *      masthead text — and, critically, they are SIBLINGS inside
 *      .hero-engine sharing the identical .hero-layer--cover-box CSS
 *      rule (hero.css): same top/left/width/height/object-fit,
 *      inheriting the same engine transform. Not "positioned to
 *      match" by separately-computed offsets (that was the old,
 *      fragile approach, and it drifted); their boxes are identical
 *      by construction — verify with getBoundingClientRect() on both
 *      and they report the same numbers to the pixel.
 *
 *      Because their text sits at identical pixels, overlay is left
 *      at full opacity through this entire fade rather than also
 *      fading out — cover_nature.png simply fades in on top of it.
 *      Overlay's text is never hidden by cover_nature.png's identical
 *      text underneath — same pixels, so nothing to hide — and the
 *      masthead reads as continuously present and perfectly still
 *      the whole time; only the artwork underneath (and around it,
 *      via the fading liveArt group) resolves from live scene to
 *      flat print. (An earlier version tried cross-dissolving overlay
 *      and cover_nature.png's opacities against each other, sequentially
 *      or simultaneously, while the two lived in different boxes —
 *      every version of that either ghosted the text against its own
 *      slightly-offset copy or dipped to zero text uncomfortably
 *      between them. Sharing one box removes the need for either.)
 *   3. Tail-end exit — once the resolve has fully held, the four bars
 *      and their corner-rounding patches (only ever an assembly
 *      effect for reaching the resolve) fade away too, so what's left
 *      scrolling off — just the small, cover-sized nature image, with
 *      overlay's identical (now redundant, harmless) text sitting
 *      exactly beneath it — has no opaque margins around it. It
 *      reveals the SAME continuous .bg-fixed scene the whole rest of
 *      the page sits on, instead of a black-bordered box cutting to it.
 */

// --- ANIMATED PROPERTIES (scroll-driven timeline only — the ambient
// idle loop below is wall-clock-driven, not scroll-position-driven,
// and out of scope for the monotonicity requirement here).
// Every row moves in exactly one direction as progress goes 0 → 1.
// None reverse; each is a single .to() with one start and one end.
//
// --- HERO-SCOPED (buildScrollSequence, ScrollTrigger id "hero-main")
//
//   property                     direction (start → end)
//   -------------------------    -----------------------------------
//   copy opacity                 1 → 0
//   copy yPercent                0 → -25   (lifts while fading)
//   scrollcue opacity            1 → 0
//   engine scale                 k1 → 1   (Beat 3 window only, one
//                                          direction — see
//                                          computeEngineStartScale;
//                                          typically shrinking. Fixed
//                                          through all of Beat 2, so
//                                          the object's SIZE is truly
//                                          still while the dust flies)
//   overlay opacity              0 → 1     (assembly window — then
//                                          held at 1 for the rest of
//                                          the hero; see the Beat 3b
//                                          note above for why it's
//                                          never animated again)
//   overlay scale                1.15 → 1  (assembly window)
//   bar scaleX (left/right)      0 → 1     (assembly window)
//   bar scaleY (top/bottom)      0 → 1     (assembly window)
//   corner opacity (×4)          0 → 1     (assembly window — rounds
//                                          the window the bars leave)
//   caption opacity              0 → 1     (assembly window)
//   caption yPercent             4 → 0     (assembly window)
//   statement opacity (×3)       0 → 1 → 0 (Beat 2 only — the one
//                                          deliberate exception to
//                                          single-direction motion:
//                                          each of the three is a
//                                          fully isolated, non-
//                                          overlapping fade-in/hold/
//                                          fade-out, done and back at
//                                          0 before the next begins
//                                          or the assembly window
//                                          opens. No two of the three
//                                          are ever above 0 at once,
//                                          and each one's own fade-in
//                                          and fade-out are themselves
//                                          monotonic — it's only the
//                                          element considered whole,
//                                          across its own brief
//                                          window, that goes up then
//                                          down.
//   statement yPercent (×3)      4 → 0     (fade-in only, once, per
//                                          element — stays at 0
//                                          through the hold and the
//                                          fade-out, so there's no
//                                          reverse motion)
//   liveArt opacity (×6)          1 → 0     (tail crossfade — disk,
//                                          magnetar, both jets, both
//                                          jet-glows; the photographic
//                                          content, not the text)
//   nature-cover opacity          0 → 1     (tail crossfade — fades in
//                                          on top of overlay, which
//                                          stays at 1 throughout; see
//                                          the Beat 3b note above)
//   bar scaleX/scaleY             — no change; bars stay fully closed
//   bar/corner opacity            1 → 0     (tail exit, AFTER the
//                                          crossfade has fully held —
//                                          the resolve itself, up to
//                                          and including this point,
//                                          is untouched by this row)
//
// Nothing here is ever animated back toward an earlier value. engine's
// own xPercent/yPercent is set once (true center) and never tweened at
// all anymore — see the header comment above for why that's now a
// plain constant rather than a "weak drift" row in this table.
//
// --- SCENE (buildSceneDrift, ScrollTrigger id "bg-scene") — entirely
// separate timeline/trigger, spanning the whole page (top of hero to
// bottom of footer). hero-main never touches these; this never
// touches anything hero-main owns above.
//
//   stage yPercent                base → base + drift  (one sign, the
//                                          full page)
//   haze-1..4 xPercent/yPercent   0 → large, own sign, the full page
//
// bg_environment's scale is a fixed, one-time computed value
// (computeEdgeSafeScale) for the WHOLE page's drift, set once and
// never animated at all — so it can't violate monotonicity, and
// can't read as a "zoom" (there is no scale tween to desync).

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
  const bgFixed = hero.querySelector('[data-bg-fixed]');
  const stage = hero.querySelector('[data-hero-stage]');
  const bg = hero.querySelector('[data-hero-bg]');
  const engine = hero.querySelector('[data-hero-engine]');
  const jetLower = hero.querySelector('[data-hero-jet-lower]');
  const jetUpper = hero.querySelector('[data-hero-jet-upper]');
  const disk = hero.querySelector('[data-hero-disk]');
  const magnetar = hero.querySelector('[data-hero-magnetar]');
  const jetGlow1 = hero.querySelector('[data-hero-jetglow-1]');
  const jetGlow2 = hero.querySelector('[data-hero-jetglow-2]');
  const overlay = hero.querySelector('[data-hero-overlay]');
  const natureCover = hero.querySelector('[data-hero-nature]');
  // The live scene's photographic content — everything that needs to
  // fade away for the tail crossfade EXCEPT the text (overlay, which
  // stays at opacity 1 throughout — see the header comment) and
  // cover_nature.png (which fades in separately). Deliberately a
  // named group, not "engine" itself: engine's own opacity is never
  // touched, precisely so overlay and cover_nature.png (both its
  // children) are unaffected by this fade and stay under their own
  // independent opacity control.
  const liveArt = [jetLower, disk, magnetar, jetUpper, jetGlow1, jetGlow2];
  const copy = hero.querySelector('[data-hero-copy]');
  const scrollcue = hero.querySelector('[data-hero-scrollcue]');
  const caption = hero.querySelector('[data-hero-caption]');
  const statements = Array.from(hero.querySelectorAll('[data-hero-statement]'));
  const bars = {
    left: hero.querySelector('[data-hero-bar="left"]'),
    right: hero.querySelector('[data-hero-bar="right"]'),
    top: hero.querySelector('[data-hero-bar="top"]'),
    bottom: hero.querySelector('[data-hero-bar="bottom"]'),
  };
  const corners = Array.from(hero.querySelectorAll('[data-hero-corner]'));

  await preloadLayers(hero);
  pin.classList.add('is-ready');
  // .bg-fixed is a separate element (see index.html/hero.css), so it
  // needs its own reveal-once-decoded toggle — added in lockstep with
  // .hero-pin's so the scene and the hero content never appear out of
  // step while images are still decoding.
  bgFixed?.classList.add('is-ready');

  if (prefersReducedMotion()) {
    // No pin, no scrub, no ambient loop, no engine scale-up, no scene
    // drift. Beat 1 renders at rest (engine at its frame-matching
    // resting scale — see hero.css) and the static block in the
    // markup gives a direct, non-animated path to the resolved cover.
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

  // Scene drift — bg_environment + the four dust/haze layers, for the
  // FULL PAGE, top of hero to bottom of footer. One number per axis
  // per layer, covering the entire scroll in one continuous tween —
  // there is no separate "hero portion" and "post-hero portion" of
  // these numbers; buildSceneDrift below maps this whole thing onto
  // the whole page in a single .fromTo(), once.
  //
  // These are the ORIGINAL (pre-amplification) hero-only magnitudes,
  // deliberately NOT scaled up for the much longer page-length scroll
  // they now cover: the whole point is that the dust stays visibly
  // on frame the entire way down (explicitly the priority now — "the
  // main thing"), not that it moves at any particular speed. Applying
  // the old, larger, hero-tuned magnitudes across a scroll distance
  // ~1.9× the hero's own was what made every wisp fully exit the
  // frame well before the page bottom.
  const SCENE_DRIFT = {
    stage: 6,
    haze1: { x: -62, y: 80 },
    haze2: { x: 66, y: 92 },
    haze3: { x: 56, y: -72 },
    haze4: { x: -70, y: -88 },
  };

  /**
   * Edge-safety rule: any layer that parallaxes must be scaled up
   * enough that its own image edge never enters the viewport, at any
   * scroll position — this is what a too-tight bg_environment scale
   * used to violate (a hard horizontal seam as its top edge slid into
   * frame). General formula: for a layer whose box exactly fills its
   * (possibly oversized) container and that travels up to
   * maxDriftPercent of that container's own size, the scale needed so
   * (scaled_size − container_size)/2 stays clear of that travel by at
   * least marginPercent more is:
   *
   *   scale = 1 + 2 × (maxDriftPercent + marginPercent) / 100
   *
   * Purely percentage-based, so it doesn't need — and doesn't change
   * with — measured pixels.
   *
   * Only bg_environment needs this: it's opaque and sized to exactly
   * fill its (oversized) container, so a hard image edge is only ever
   * one scroll-tick away from sliding into frame. The four haze layers
   * are exempt by construction, no matter how large SCENE_DRIFT.haze1-4
   * get — each carries its own radial-gradient mask (hero.css) that
   * fades to fully transparent at its own box's edge, and that mask
   * travels WITH the element under xPercent/yPercent (it isn't clipped
   * against the viewport). So there's no hard boundary for any amount
   * of translation to expose.
   *
   * bg's scale is computed from SCENE_DRIFT.stage — the FULL page's
   * worth of stage travel — and set exactly ONCE, never animated. That
   * (not a two-step or growing scale) is what keeps this from ever
   * reading as a zoom.
   */
  function computeEdgeSafeScale(maxDriftPercent, marginPercent = 6) {
    return 1 + (2 * (Math.abs(maxDriftPercent) + marginPercent)) / 100;
  }

  /**
   * .hero-engine's CSS size (hero.css) is set so that scale:1 is
   * exactly the size at which the text overlay fills --frame-w — the
   * registered, Beat-3 resting state. For Beat 1 the rule is instead:
   * the jet+glow assembly (jet_glow_1/jet_upper starting at the
   * engine's own top edge, jet_lower/jet_glow_2 reaching its bottom
   * edge — layer_positions.json, already 0%-to-100% of the engine's
   * square box by construction) should fill the viewport exactly
   * top-to-bottom, full-bleed. Engine is centered (top:50%,
   * yPercent:-50), so that's just: scaled height === innerHeight. That
   * target has no fixed ratio to the frame-matching size, so the one
   * extra scale factor needed to get from "frame-matching" to
   * "Beat-1 composition" is measured, once, off the engine's actual
   * laid-out (untransformed) height. This is the only JS measurement
   * in the whole sequence.
   */
  function computeEngineStartScale() {
    // getBoundingClientRect() would return the POST-transform box — on
    // every rebuild (every resize), engine already carries whatever
    // scale the previous buildScrollSequence() call left on it (killing
    // a tween/ScrollTrigger doesn't revert the properties it set), so
    // measuring the rect here would feed that leftover scale back into
    // the next one: k1_new = k1_true / k1_previous. That's a period-2
    // oscillation between k1_true and 1, not a real remeasurement — the
    // bug this function used to have. getComputedStyle().height is the
    // CSS layout height (--frame-w-driven, hero.css), which `transform`
    // never touches, so it's a stable, untransformed read no matter
    // what scale is currently applied — the single source of truth
    // both this function and hero.css's own sizing agree on.
    const naturalHeight = parseFloat(getComputedStyle(engine).height) || 1;
    return window.innerHeight / naturalHeight;
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

  // --- Hero-scoped scroll-driven timeline: monotonic, built once per
  // layout. Does NOT touch stage/bg/haze — see buildSceneDrift.
  let st = null;
  let tl = null;

  function buildScrollSequence() {
    const k1 = computeEngineStartScale();

    // True center, set once, never tweened — see the header comment
    // for why engine no longer carries a "weak drift" offset.
    gsapLib.set(engine, { xPercent: -50, yPercent: -50, scale: k1 });
    gsapLib.set(overlay, { opacity: 0, scale: 1.15 });
    // No xPercent/yPercent here at all: cover_nature.png is now a
    // plain CSS-positioned sibling of overlay inside .hero-engine
    // (.hero-layer--cover-box, hero.css), inheriting engine's
    // transform for free. Opacity is the only thing this element
    // ever needs from JS.
    gsapLib.set(natureCover, { opacity: 0 });
    gsapLib.set([bars.left, bars.right], { scaleX: 0 });
    gsapLib.set([bars.top, bars.bottom], { scaleY: 0 });
    gsapLib.set(corners, { opacity: 0 });
    gsapLib.set(copy, { opacity: 1, yPercent: 0 });
    gsapLib.set(caption, { opacity: 0, yPercent: 4 });
    gsapLib.set(statements, { opacity: 0, yPercent: 4 });

    tl = gsapLib.timeline({ defaults: { ease: 'none' } });

    // Title lifts away early. One direction: fading, lifting.
    tl.to(copy, { yPercent: -25, opacity: 0, duration: 0.15 }, 0);
    tl.to(scrollcue, { opacity: 0, duration: 0.08 }, 0);

    // The object: perfectly still position-wise across the whole
    // scroll (set once, above — no tween here at all) — its SIZE also
    // stays fixed through all of Beat 2 (no scale tween here either),
    // which is what actually reads as "still" while the dust flies
    // (the dust itself is entirely handled by buildSceneDrift now).

    // Beat 2 statements — three captions, one at a time, evenly spaced
    // between the title's exit (done by 0.15) and the assembly window
    // opening (0.8): each gets an identical 0.03 fade-in / 0.09 hold /
    // 0.03 fade-out (0.15 total), with a 0.05 gap on every side, so
    // none overlap and the last is back at opacity 0 a full 0.05 of
    // scroll before the cover overlay/bars begin.
    tl.to(statements[0], { opacity: 1, yPercent: 0, duration: 0.03 }, 0.20);
    tl.to(statements[0], { opacity: 0, duration: 0.03 }, 0.32);
    tl.to(statements[1], { opacity: 1, yPercent: 0, duration: 0.03 }, 0.40);
    tl.to(statements[1], { opacity: 0, duration: 0.03 }, 0.52);
    tl.to(statements[2], { opacity: 1, yPercent: 0, duration: 0.03 }, 0.60);
    tl.to(statements[2], { opacity: 0, duration: 0.03 }, 0.72);

    // Beat 3a — assembly: the real Nature text settles onto the
    // still-live engine, the engine eases from its Beat-1 scale-up
    // down to 1 (its frame-matching resting size), and the frame
    // closes to the cover's trim size — all concurrent, all
    // monotonic, no crossfade yet. Confining the engine's scale to
    // this window (rather than spreading it across the whole scroll)
    // is what keeps it feeling anchored during Beat 2 instead of
    // continuously zooming — the one moment it resizes is here.
    tl.to(engine, { scale: 1, duration: 0.2 }, 0.8);
    tl.to(overlay, { opacity: 1, scale: 1, duration: 0.2 }, 0.8);
    tl.to([bars.left, bars.right], { scaleX: 1, duration: 0.2 }, 0.8);
    tl.to([bars.top, bars.bottom], { scaleY: 1, duration: 0.2 }, 0.8);
    tl.to(corners, { opacity: 1, duration: 0.2 }, 0.8);
    tl.to(caption, { opacity: 1, yPercent: 0, duration: 0.1 }, 0.9);

    // Beat 3b — tail crossfade: only once assembly (above) is done,
    // the live artwork dissolves into the real cover_nature.png.
    // Positioned at timeline time 1.0 — i.e. after every tween above
    // has finished — this simply extends the timeline's total
    // duration rather than editing any position above, so it can't
    // disturb the already-verified assembly timing. stage/bg/haze are
    // never part of this fade — they're not part of this timeline at
    // all anymore (see buildSceneDrift) — so there's nothing to
    // exclude here.
    //
    // overlay is deliberately NOT included in this fade. overlay and
    // natureCover share the exact same box (.hero-layer--cover-box,
    // hero.css) as siblings inside .hero-engine — same position, same
    // size, same transform, same 880×1168 source canvas — so their
    // text sits at identical pixels. With that guaranteed, there's no
    // need to fade overlay out at all: it stays at opacity 1 (set
    // during assembly, above) for the rest of the hero, and
    // natureCover simply fades in on top of it. The masthead text is
    // therefore continuously present and perfectly stationary through
    // the whole crossfade — never doubled (nothing to double against;
    // same pixels), never dipping to invisible (overlay's copy is
    // always there) — only the artwork around/behind it (liveArt)
    // resolves from live scene to flat print.
    tl.to(liveArt, { opacity: 0, duration: 0.15 }, 1.0);
    tl.to(natureCover, { opacity: 1, duration: 0.15 }, 1.0);

    // Beat 3c — tail exit: the resolve holds fully framed from 1.15 to
    // 1.20 (a deliberate pause before anything else moves — the
    // resolve itself, everything up to and including this hold, is
    // pixel-identical to before this row existed), THEN the four bars
    // and corner patches — only ever an assembly effect for reaching
    // the resolve — fade away, so the small, cover-sized nature image
    // that's left has no opaque margins around it as it scrolls off:
    // just the same continuous .bg-fixed scene the rest of the page
    // sits on, not a black-bordered box cutting to it.
    tl.to([bars.left, bars.right, bars.top, bars.bottom, ...corners], { opacity: 0, duration: 0.15 }, 1.20);

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

  // --- Scene: ONE continuous ScrollTrigger for bg_environment + all
  // four dust/haze layers, spanning the entire page (top of hero to
  // bottom of the document). Completely independent of hero-main —
  // it is never rebuilt or restarted partway down the page, and
  // hero-main never touches these elements, so there is exactly one
  // authority over the scene's transform at any scroll position,
  // for the life of the page.
  let sceneSt = null;
  let sceneTl = null;

  function buildSceneDrift() {
    const bgScale = computeEdgeSafeScale(SCENE_DRIFT.stage);

    gsapLib.set(stage, { xPercent: -50, yPercent: -50 });
    gsapLib.set(bg, { scale: bgScale });

    sceneTl = gsapLib.timeline({ defaults: { ease: 'none' } });
    sceneTl.to(stage, { yPercent: -50 + dyn(SCENE_DRIFT.stage), duration: 1 }, 0);
    sceneTl.to('.haze-1', { xPercent: dyn(SCENE_DRIFT.haze1.x), yPercent: dyn(SCENE_DRIFT.haze1.y), duration: 1 }, 0);
    sceneTl.to('.haze-2', { xPercent: dyn(SCENE_DRIFT.haze2.x), yPercent: dyn(SCENE_DRIFT.haze2.y), duration: 1 }, 0);
    sceneTl.to('.haze-3', { xPercent: dyn(SCENE_DRIFT.haze3.x), yPercent: dyn(SCENE_DRIFT.haze3.y), duration: 1 }, 0);
    sceneTl.to('.haze-4', { xPercent: dyn(SCENE_DRIFT.haze4.x), yPercent: dyn(SCENE_DRIFT.haze4.y), duration: 1 }, 0);

    sceneSt = ScrollTrigger.create({
      id: 'bg-scene',
      trigger: document.body,
      start: 'top top',
      end: 'max',
      scrub: 1,
      animation: sceneTl,
    });
  }

  buildScrollSequence();
  buildSceneDrift();
  startAmbient();

  // computeEngineStartScale() depends on measured viewport/engine
  // pixels, so (unlike the scene, which is pure-CSS-sized) a resize
  // needs a fresh measurement — rebuild the hero sequence rather than
  // try to patch one running tween's start value. buildSceneDrift is
  // rebuilt alongside it because dyn()'s mobile scaling can itself
  // change across the resize breakpoint — it's still the SAME single
  // continuous scene conceptually, just re-measured, the same way
  // hero-main's own tweens are.
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      st?.kill();
      tl?.kill();
      sceneSt?.kill();
      sceneTl?.kill();
      buildScrollSequence();
      buildSceneDrift();
      ScrollTrigger.refresh();
    }, 200);
  });
}
