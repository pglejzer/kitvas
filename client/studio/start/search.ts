// The search of the start page's drafts (markup: `src/studio/pages/start/search.ts` and
// `groups.ts`). Typing filters the cards as it goes, with no request: a card stays when every
// typed word is in its `data-search` words, case and accents aside. A group with no card left is
// hidden, a group's count tells the cards left, and one line says when nothing matches. Escape in
// the field clears it. The page's head row and list are swapped after a delete or a restore
// (`trash/gallery-swap.ts`), so the work is looked at again whenever the page's nodes change.
// Without the script the field does nothing and every card shows.

/** Lower case, accents taken off: `Café` and `cafe` are the same word. */
export function normalise(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** The typed words, normalised; none for an empty or blank query. */
export function wordsOf(query: string): string[] {
  return normalise(query)
    .split(/\s+/)
    .filter((word) => word !== '');
}

/** Whether every typed word is somewhere in `haystack`; an empty query matches everything. */
export function matches(query: string, haystack: string): boolean {
  const words = wordsOf(query);
  if (words.length === 0) return true;
  const text = normalise(haystack);
  return words.every((word) => text.includes(word));
}

const FIELD = '[data-gallery-search]';
const BODY = '[data-gallery-body]';

/** Shows the cards the field's words match and hides the rest; every write is made only on a change. */
function apply(): void {
  const body = document.querySelector<HTMLElement>(BODY);
  if (!body) return;
  const field = document.querySelector<HTMLInputElement>(FIELD);
  const query = field?.value ?? '';
  const searching = wordsOf(query).length > 0;
  if (body.hasAttribute('data-searching') !== searching) {
    body.toggleAttribute('data-searching', searching);
  }
  let shown = 0;
  for (const group of body.querySelectorAll<HTMLElement>('[data-group]')) {
    let inGroup = 0;
    for (const card of group.querySelectorAll<HTMLElement>('.gallery-card')) {
      const hit = matches(query, card.dataset.search ?? '');
      if (card.hidden === hit) card.hidden = !hit;
      if (hit) inGroup += 1;
    }
    if (group.hidden !== (inGroup === 0)) group.hidden = inGroup === 0;
    const count = group.querySelector('[data-group-count]');
    if (count && count.textContent !== String(inGroup)) count.textContent = String(inGroup);
    shown += inGroup;
  }
  const none = body.querySelector<HTMLElement>('[data-search-empty]');
  const nothing = searching && shown === 0;
  if (none && none.hidden === nothing) none.hidden = !nothing;
}

export function mountSearch(): void {
  document.addEventListener('input', (event) => {
    if (event.target instanceof Element && event.target.matches(FIELD)) apply();
  });
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (event.key !== 'Escape' || !(target instanceof HTMLInputElement)) return;
    if (!target.matches(FIELD) || target.value === '') return;
    target.value = '';
    event.preventDefault();
    apply();
  });
  const page = document.querySelector('main');
  if (page) new MutationObserver(apply).observe(page, { childList: true, subtree: true });
  apply();
}
