/**
 * Press/coverage gallery — fetches data/press.json at load and
 * renders one card per entry: outlet logo (or, failing that, a text
 * wordmark), the headline, and a "read →" link to the piece.
 *
 * Logos are pre-fetched (not fetched here) into assets/logos/<domain>.png
 * by a one-off script — see that directory's own provenance in the
 * project notes. This module never hits the network for a logo itself;
 * it just points an <img> at the local file and, if that 404s (a
 * domain added later with no cached logo, or the cached file removed),
 * swaps that one card over to its text-wordmark fallback via the
 * image's own error event. Every card is built with both the <img>
 * and the wordmark markup present from the start (wordmark hidden by
 * default) specifically so this swap is just a class toggle, not a
 * re-render.
 */
export async function initCoverage() {
  const grid = document.querySelector('[data-coverage-grid]');
  if (!grid) return;

  let entries;
  try {
    const res = await fetch('data/press.json');
    entries = await res.json();
  } catch (err) {
    console.warn('[coverage] failed to load data/press.json', err);
    return;
  }

  const frag = document.createDocumentFragment();

  for (const entry of entries) {
    const card = document.createElement('article');
    card.className = 'coverage-card';

    const mark = document.createElement('div');
    mark.className = 'coverage-card__mark';

    const img = document.createElement('img');
    img.className = 'coverage-card__logo';
    img.src = `assets/logos/${entry.domain}.png`;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = () => {
      mark.classList.add('coverage-card__mark--fallback');
      img.remove();
    };

    const wordmark = document.createElement('span');
    wordmark.className = 'coverage-card__wordmark';
    wordmark.textContent = entry.outlet;

    mark.append(img, wordmark);

    const headline = document.createElement('p');
    headline.className = 'coverage-card__headline';
    headline.textContent = entry.headline;

    const link = document.createElement('a');
    link.className = 'coverage-card__link';
    link.href = entry.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Read →';

    card.append(mark, headline, link);
    frag.appendChild(card);
  }

  grid.appendChild(frag);
}
