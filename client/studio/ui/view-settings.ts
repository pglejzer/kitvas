// The View popover on every studio page (ADR 0057): the button in the bar opens it, a choice
// shows at once and is saved for the person. The markup is `src/studio/pages/view-settings.ts`.
// Without this script the page keeps the view it was sent with.

import type { ViewSettings } from '../../../src/shared/settings/config.ts';
import { readView, type Tones, tonesOf, withChoice, writeView } from './view.ts';

/** Fired on `document` after the view changed here or the system's theme changed. */
export const VIEW_EVENT = 'kitvas:view';

export type ViewEventDetail = { view: ViewSettings; tones: Tones };

const SYSTEM_DARK = '(prefers-color-scheme: dark)';

const root = (): HTMLElement => document.documentElement;

/** The view the page shows now. */
export const currentView = (): ViewSettings => readView(root().dataset);

/** The theme that shows now and the accent: what a prototype's overlays are drawn with. */
export const currentTones = (): Tones =>
  tonesOf(currentView(), window.matchMedia(SYSTEM_DARK).matches);

function announce(): void {
  const detail: ViewEventDetail = { view: currentView(), tones: currentTones() };
  document.dispatchEvent(new CustomEvent(VIEW_EVENT, { detail }));
}

async function save(view: ViewSettings): Promise<boolean> {
  try {
    const response = await fetch('/api/v1/settings/view', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(view),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Shows `view` at once. Nothing fades while the theme changes: the page changes in one step. */
function show(view: ViewSettings): void {
  const html = root();
  html.dataset.viewChanging = '';
  writeView(html.dataset, view);
  requestAnimationFrame(() => requestAnimationFrame(() => delete html.dataset.viewChanging));
}

function mark(pop: HTMLElement, view: ViewSettings): void {
  for (const set of pop.querySelectorAll<HTMLElement>('[data-view-set]')) {
    const key = set.dataset.viewSet;
    const chosen = key === 'theme' || key === 'panels' || key === 'accent' ? view[key] : null;
    for (const button of set.querySelectorAll<HTMLElement>('button[data-value]')) {
      button.setAttribute('aria-pressed', button.dataset.value === chosen ? 'true' : 'false');
    }
  }
}

export function mountViewSettings(): void {
  const pop = document.querySelector('[data-view-pop]');
  // The system's theme changing is news for a prototype's overlays even with no popover.
  window.matchMedia(SYSTEM_DARK).addEventListener('change', () => {
    if (currentView().theme === 'system') announce();
  });
  if (!(pop instanceof HTMLElement)) return;
  const note = pop.querySelector<HTMLElement>('[data-view-note]');
  let opener: HTMLElement | null = null;
  let saves = 0;

  const open = (from: HTMLElement): void => {
    opener = from;
    mark(pop, currentView());
    pop.hidden = false;
    from.setAttribute('aria-expanded', 'true');
    pop.querySelector<HTMLElement>('button[aria-pressed="true"]')?.focus();
  };
  const close = (refocus: boolean): void => {
    if (pop.hidden) return;
    pop.hidden = true;
    opener?.setAttribute('aria-expanded', 'false');
    if (refocus) opener?.focus();
    opener = null;
  };

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('[data-view-open]');
    if (button instanceof HTMLElement) {
      if (pop.hidden) open(button);
      else close(true);
      return;
    }
    if (target && !pop.contains(target)) close(false);
  });
  // Before the page's other Escape handlers: with the popover open, Escape closes only it.
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || pop.hidden) return;
      event.stopPropagation();
      event.preventDefault();
      close(true);
    },
    true,
  );
  // A click in the prototype's frame never reaches this page; the window losing focus does.
  window.addEventListener('blur', () => close(false));

  pop.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLElement>('button[data-value]');
    const set = button?.closest<HTMLElement>('[data-view-set]');
    if (!button || !set) return;
    const next = withChoice(currentView(), set.dataset.viewSet, button.dataset.value);
    if (!next) return;
    show(next);
    mark(pop, next);
    announce();
    saves += 1;
    const mine = saves;
    void save(next).then((saved) => {
      // Only the answer to the last choice says whether the view is saved.
      if (mine !== saves || !note) return;
      note.toggleAttribute('data-failed', !saved);
      note.textContent = (saved ? note.dataset.textSaved : note.dataset.textFailed) ?? '';
    });
  });
}
