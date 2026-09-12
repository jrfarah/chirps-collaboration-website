/**
 * Scroll drift for the story section's prose.
 *
 * The hero's text holds still, then lifts away and fades near the top
 * of the frame. Below the hero, the story paragraphs were plain page
 * content — they just scrolled past at exactly the speed of everything
 * else, which is what made that section read as unchanged next to the
 * hero. This gives them the same language: each paragraph drifts
 * upward faster than the page scrolls, and only fades once it's most
 * of the way to the top of the viewport — the lift leads, the fade
 * catches up at the tail, never the other way round.
 *
 * Per-paragraph rather than per-section, so each one leaves on its own
 * schedule instead of the whole column dimming as a block.
 *
 * Fully skipped under prefers-reduced-motion: unlike the hero (whose
 * reduced-motion path is a separate static render), this text is
 * perfectly fine as ordinary scrolling content, so the fallback is
 * simply to leave it alone.
 */
export function initStoryDrift() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const paragraphs = Array.from(document.querySelectorAll('.section-intro__lede'));
  if (!paragraphs.length) return;

  function ready() {
    return !!(window.gsap && window.ScrollTrigger);
  }

  function setup() {
    const gsapLib = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    gsapLib.registerPlugin(ScrollTrigger);

    paragraphs.forEach((el) => {
      const tl = gsapLib.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: el,
          // Both ends are keyed to the paragraph's TOP edge, and the
          // range closes just past the top of the viewport. Keying the
          // end to 'bottom' instead (the obvious first guess) is wrong
          // for a block this tall: a ~300px paragraph's bottom doesn't
          // reach the top of the screen until its top is half a
          // viewport ABOVE it, so the entire fade played out off
          // screen and all you ever saw fade was the last line.
          start: 'top 75%',
          end: 'top -10%',
          // Same smoothing as the hero's own scrub, so the two
          // sections feel like one continuous piece of motion.
          scrub: 1,
        },
      });
      // Outruns the page: by the time it reaches the top it has
      // travelled well over half its own height further than the
      // scroll alone would have carried it.
      tl.to(el, { yPercent: -60, duration: 1 }, 0);
      // Fade over the back half of that travel — which now lands while
      // the paragraph is still on screen, roughly from a third of the
      // way up the viewport until it clears the top edge.
      tl.to(el, { opacity: 0, duration: 0.5 }, 0.5);
    });
  }

  if (ready()) {
    setup();
    return;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (ready()) {
      clearInterval(timer);
      setup();
    } else if (attempts >= 50) {
      clearInterval(timer);
      console.warn('[storyDrift] GSAP/ScrollTrigger never became available — story text left static.');
    }
  }, 100);
}
