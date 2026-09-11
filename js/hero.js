/**
 * Hero — pinned, three-beat scroll sequence.
 *
 * Beat 1  Immersion   — full-bleed scene + title, alive with a barely-
 *                        perceptible ambient loop (jet pulse, disk/haze
 *                        drift).
 * Beat 2  Descent     — scroll-scrubbed parallax; title lifts away
 *                        early, layers drift at different rates.
 * Beat 3  Convergence — layers settle back to registration, crossfade
 *                        to the clean cover art, the frame's margins
 *                        close in via sliding bars (transform only),
 *                        then crossfade to the published Nature cover.
 *
 * Geometry note on the disk's placement (.hero-layer--disk in
 * hero.css): assets/cover_art.jpeg is a flat, pre-graded render of the
 * same composition at the same 2880×2880 canvas as bg_environment.png.
 * Cross-correlating disk_foreground.png against it (see the session
 * notes) puts the disk at (360, 990)px, size 1980×1080 — i.e. left
 * 12.5%, top 34.375%, width 68.75%, height 37.5% of that square
 * canvas. The residual pixel diff after that alignment is
 * ~12/255, uniform and edge-shaped rather than ghosted, consistent
 * with a bloom/grain pass baked into the flat renders rather than any
 * positional error. That's what makes the Beat-3 crossfade to
 * cover_art.jpeg read as "coming into focus" rather than a jump cut.
 *
 * Cover path taken: PREFERRED for the art (live layers settle and
 * crossfade to cover_art.jpeg, the bare, pixel-verified target), then
 * FALLBACK for the masthead/text (crossfade on to cover_nature.png
 * as-is, rather than stitching cropped masthead/text pieces over the
 * art). There's no isolated masthead asset — cover_nature.png is a
 * flattened raster — and cover_nature.png's art is itself a
 * center-crop of the same square canvas (full height kept, ~355px
 * shaved off each side — verified the same way), so the second
 * crossfade lands on nearly the same framing as the first. Stitching
 * cropped text fragments over cover_art.jpeg would only risk visible
 * seams for a result that isn't meaningfully closer to the real cover
 * than just using it directly.
 */

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
  const frame = hero.querySelector('[data-hero-frame]');
  const stage = hero.querySelector('[data-hero-stage]');
  const bg = hero.querySelector('[data-hero-bg]');
  const jetpulse = hero.querySelector('[data-hero-jetpulse]');
  const disk = hero.querySelector('[data-hero-disk]');
  const art = hero.querySelector('[data-hero-art]');
  const cover = hero.querySelector('[data-hero-cover]');
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
    // No pin, no scrub, no ambient loop. Beat 1 renders at rest
    // (stage un-zoomed, bars open) and the static block in the
    // markup gives a direct, non-animated path to Beat 3.
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
  const parallaxScale = isMobile ? 0.5 : 1;

  /**
   * The stage is a square, sized (via CSS) to exactly match the
   * frame's rendered height — the same relationship cover_nature.png
   * has to cover_art.jpeg (full height kept, sides cropped). So
   * "zoomed to 1" is precisely the settled, cover-matching state, and
   * "zoomed to fill the viewport" is whatever multiple of the frame's
   * height covers the larger of the two viewport dimensions. CSS
   * can't express that ratio (calc() can't divide one length by
   * another), so it's measured here instead of guessed.
   */
  function computeZoom() {
    const frameH = frame.getBoundingClientRect().height || 1;
    return (Math.max(window.innerWidth, window.innerHeight) / frameH) * 1.02;
  }

  let ambient = null;
  function startAmbient() {
    ambient = gsapLib.timeline({ repeat: -1, yoyo: true, defaults: { ease: 'sine.inOut' } });
    ambient.to(jetpulse, { opacity: 0.85, duration: cssNum('--duration-ambient') }, 0);
    ambient.to(disk, { xPercent: 0.6, yPercent: -0.5, duration: cssNum('--duration-ambient-slow') }, 0);
    haze.forEach((el, i) => {
      ambient.to(el, {
        xPercent: (i % 2 === 0 ? 1 : -1) * (1.2 + i * 0.3),
        yPercent: (i % 3 === 0 ? -1 : 1) * (1 + i * 0.2),
        duration: cssNum('--duration-ambient-slow') * (0.9 + i * 0.08),
      }, 0);
    });
  }

  let scrollTween = null;
  let st = null;

  function buildScrollSequence() {
    const zoom = computeZoom();
    gsapLib.set(stage, { xPercent: -50, scale: zoom });
    gsapLib.set([bars.left, bars.right], { scaleX: 0 });
    gsapLib.set([bars.top, bars.bottom], { scaleY: 0 });
    gsapLib.set(art, { opacity: 0 });
    gsapLib.set(cover, { opacity: 0 });
    gsapLib.set(copy, { opacity: 1, yPercent: 0 });
    gsapLib.set(caption, { opacity: 0, yPercent: 0 });

    const dyn = (base) => base * parallaxScale;
    const tl = gsapLib.timeline({ defaults: { ease: 'none' } });

    // --- Beat 2: title lifts away early ---
    tl.to(copy, { yPercent: -30, opacity: 0, duration: 0.12 }, 0);
    tl.to(scrollcue, { opacity: 0, duration: 0.06 }, 0);

    // --- Beat 2: depth parallax (back layers move least, haze most,
    //     some wisps drifting opposite the rest) ---
    tl.to(bg, { yPercent: dyn(4), scale: 1.04, duration: 0.72 }, 0);
    tl.to(jetpulse, { yPercent: dyn(4), duration: 0.72 }, 0);
    tl.to(disk, { yPercent: dyn(14), duration: 0.72 }, 0);
    tl.to('.haze-1', { yPercent: dyn(22), xPercent: dyn(-8), duration: 0.72 }, 0);
    tl.to('.haze-2', { yPercent: dyn(26), xPercent: dyn(10), duration: 0.72 }, 0);
    tl.to('.haze-3', { yPercent: dyn(-18), xPercent: dyn(6), duration: 0.72 }, 0);
    tl.to('.haze-4', { yPercent: dyn(-22), xPercent: dyn(-10), duration: 0.72 }, 0);
    tl.to('.haze-5', { yPercent: dyn(30), duration: 0.72 }, 0);
    tl.to('.haze-6', { yPercent: dyn(-30), duration: 0.72 }, 0);

    // --- Beat 3: settle back to registration, crossfade to the bare
    //     art, close the frame, then crossfade to the real cover ---
    const settleTargets = [bg, jetpulse, disk, ...haze];
    tl.to(settleTargets, { yPercent: 0, xPercent: 0, scale: 1, duration: 0.1 }, 0.72);
    tl.to(haze, { opacity: 0, duration: 0.08 }, 0.74);
    tl.to(art, { opacity: 1, duration: 0.12 }, 0.74);
    tl.to(stage, { scale: 1, duration: 0.16 }, 0.78);
    tl.to([bars.left, bars.right], { scaleX: 1, duration: 0.16 }, 0.78);
    tl.to([bars.top, bars.bottom], { scaleY: 1, duration: 0.16 }, 0.78);
    tl.to(cover, { opacity: 1, duration: 0.14 }, 0.86);
    tl.to(caption, { opacity: 1, yPercent: -4, duration: 0.08 }, 0.94);

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
    scrollTween = tl;
  }

  buildScrollSequence();
  startAmbient();

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const progress = st ? st.progress : 0;
      st?.kill();
      scrollTween?.kill();
      buildScrollSequence();
      st.scroll(st.start + (st.end - st.start) * progress);
      ScrollTrigger.refresh();
    }, 200);
  });
}
