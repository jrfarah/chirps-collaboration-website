/**
 * Section-jump rail — a fixed, vertically-centered list of every
 * top-level section (Home through Coverage), always clickable, with
 * the one currently in view brightened and the rest dimmed.
 *
 * Present from the first frame, deliberately: it used to be gated
 * behind the same past-the-hero reveal as .site-nav, which meant the
 * one control for skipping the hero only appeared once you'd already
 * scrolled the whole hero — exactly backwards. Its entrance is a
 * pure-CSS staggered animation (see .section-rail__link, content.css),
 * so this module needs no GSAP and no scroll trigger at all: it only
 * tracks which section is current.
 *
 * "Active section" is whichever section is crossing a thin band at
 * the vertical center of the viewport (IntersectionObserver rootMargin
 * shrinks the root to that band) — the standard scrollspy approach:
 * robust to sections of very different heights (the hero is 460vh;
 * Goals might be one viewport), unlike picking whichever section
 * merely has the largest raw intersection area.
 */
export function initSectionNav() {
  const rail = document.querySelector('[data-section-rail]');
  if (!rail) return;

  const links = Array.from(rail.querySelectorAll('[data-section-rail-link]'));
  const sections = links
    .map((link) => {
      const id = link.getAttribute('data-section-rail-link');
      const el = document.getElementById(id);
      return el ? { id, link, el } : null;
    })
    .filter(Boolean);
  if (!sections.length) return;

  function setActive(id) {
    links.forEach((link) => {
      link.classList.toggle('is-active', link.getAttribute('data-section-rail-link') === id);
    });
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    },
    { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
  );
  sections.forEach(({ el }) => observer.observe(el));

  /**
   * Whichever section covers the viewport's centre line right now (or,
   * if none does, the nearest one). Used to set the highlight once at
   * startup: IntersectionObserver's first callback is delivered on the
   * rendering lifecycle's own schedule, so relying on it alone can
   * leave the rail with nothing highlighted for the first moments on
   * the page — most visibly at the very top, where "Home" should
   * already be lit before the reader has scrolled anywhere.
   */
  function activeByPosition() {
    const mid = window.innerHeight / 2;
    let nearest = null;
    let nearestGap = Infinity;
    for (const { id, el } of sections) {
      const rect = el.getBoundingClientRect();
      if (rect.top <= mid && rect.bottom >= mid) return id;
      const gap = rect.top > mid ? rect.top - mid : mid - rect.bottom;
      if (gap < nearestGap) {
        nearestGap = gap;
        nearest = id;
      }
    }
    return nearest;
  }

  const initial = activeByPosition();
  if (initial) setActive(initial);
}
