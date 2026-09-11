/**
 * Site nav — hidden over the hero, fades in once you've scrolled past
 * it. Independent of hero.js's own scroll-driven sequence (it doesn't
 * touch any hero-timeline property), but keyed to the exact same
 * scroll position hero.js's two ScrollTriggers hand off at: .hero's
 * own 'bottom bottom'. Not gated behind prefers-reduced-motion — this
 * is a plain visibility toggle (chrome, not hero animation), not
 * parallax or scroll-jacking.
 */
export function initNav() {
  const nav = document.querySelector('[data-site-nav]');
  const hero = document.querySelector('[data-hero]');
  if (!nav || !hero) return;

  function ready() {
    return !!(window.gsap && window.ScrollTrigger);
  }

  function setup() {
    const gsapLib = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    // Idempotent — safe even if hero.js already registered it. Needed
    // here too because hero.js skips registration entirely under
    // prefers-reduced-motion, and nav's own reveal isn't gated by that.
    gsapLib.registerPlugin(ScrollTrigger);

    ScrollTrigger.create({
      id: 'site-nav-reveal',
      trigger: hero,
      start: 'bottom bottom',
      end: 'max', // to the very bottom of the page — without an
                  // explicit end, toggleClass defaults to roughly one
                  // viewport past start and un-toggles again there,
                  // hiding nav for the rest of the page instead of
                  // keeping it visible.
      toggleClass: { targets: nav, className: 'is-visible' },
    });
  }

  if (ready()) {
    setup();
    return;
  }

  // gsap/ScrollTrigger load via deferred <script> tags in <head>,
  // which should finish before this module ever runs — but that's a
  // race against CDN latency, not a guarantee. Poll briefly rather
  // than silently disabling nav forever if it loses that race once.
  let attempts = 0;
  const maxAttempts = 50; // 5s at 100ms
  const timer = setInterval(() => {
    attempts += 1;
    if (ready()) {
      clearInterval(timer);
      setup();
    } else if (attempts >= maxAttempts) {
      clearInterval(timer);
      console.warn('[nav] GSAP/ScrollTrigger never became available — nav reveal-on-scroll disabled.');
    }
  }, 100);
}
