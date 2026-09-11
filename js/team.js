/**
 * "Who we are" grid — fetches data/people.json at load and renders one
 * entry per person, in file order: a square headshot (assets/headshots/)
 * masked into a portrait oval via CSS (see .person__photo, content.css),
 * then name/title/affiliation below in plain type. Every entry is the
 * same size — the labels carry the distinction, not the layout, so the
 * founder (first in the array) renders identically to everyone else
 * except for the title string itself and, because he's the only entry
 * with an `email` field, a small mailto icon next to his name. Any
 * future entry that gains an `email` field gets the same icon for free.
 */
export async function initTeam() {
  const grid = document.querySelector('[data-team-grid]');
  if (!grid) return;

  let people;
  try {
    const res = await fetch('data/people.json');
    people = await res.json();
  } catch (err) {
    console.warn('[team] failed to load data/people.json', err);
    return;
  }

  const frag = document.createDocumentFragment();

  for (const person of people) {
    const card = document.createElement('figure');
    card.className = 'person';

    const photo = document.createElement('div');
    photo.className = 'person__photo';

    const img = document.createElement('img');
    img.className = 'person__img';
    img.src = `assets/headshots/${person.photo}`;
    img.alt = person.name;
    img.loading = 'lazy';
    img.decoding = 'async';
    photo.appendChild(img);

    const caption = document.createElement('figcaption');
    caption.className = 'person__info';

    const nameLine = document.createElement('p');
    nameLine.className = 'person__name';
    nameLine.textContent = person.name;

    if (person.email) {
      const link = document.createElement('a');
      link.className = 'person__contact';
      link.href = `mailto:${person.email}`;
      link.setAttribute('aria-label', `Email ${person.name}`);
      link.title = `Email ${person.name}`;
      link.innerHTML = `
        <svg viewBox="0 0 20 20" width="1em" height="1em" aria-hidden="true" focusable="false">
          <path fill="currentColor" d="M2.5 5.5A1.5 1.5 0 0 1 4 4h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5v-9Zm1.75.35v8.4c0 .14.11.25.25.25h11c.14 0 .25-.11.25-.25v-8.4l-5.65 4.24a1 1 0 0 1-1.2 0L4.25 5.85Zm.6-.85 5.15 3.87a.25.25 0 0 0 .3 0L14.65 5H4.85Z"/>
        </svg>`;
      nameLine.append(' ', link);
    }

    const roleParts = [person.title, person.affiliation].filter((s) => s && s.trim());
    const roleLine = document.createElement('p');
    roleLine.className = 'person__role';
    roleLine.textContent = roleParts.join(' · ');

    caption.append(nameLine);
    if (roleParts.length) caption.append(roleLine);

    card.append(photo, caption);
    frag.appendChild(card);
  }

  grid.appendChild(frag);
}
