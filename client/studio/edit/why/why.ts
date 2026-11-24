// The Why pane (spec 4d, goal 7; plan 17, task E; plan 18, task B): the left panel's reasons, one
// `.k-item` per section in layout order. A click on a name selects the section's root; "may be out
// of date" says the section changed after its lines were written; a section with none offers "Ask
// Claude for the reasons", which sends a `why` request (task A's route). The data is pure
// (`entries.ts`).

import type { EditorContext } from '../context.ts';
import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import { askWhy, getWhy } from './api.ts';
import { itemsOf, type WhyItem, type WhyReport } from './entries.ts';

type Shown = WhyReport | 'loading' | 'failed';

function entryView(item: WhyItem, select: (id: string) => void, ask: () => void): HTMLElement {
  const row = el('li', 'k-item why-item');
  row.dataset.section = item.section;
  row.dataset.state = item.state;
  const { element } = item;
  const name = el('button', 'why-name', item.section);
  name.type = 'button';
  name.disabled = element === null;
  name.title = text('why.select', { section: item.section });
  name.addEventListener('click', () => {
    if (element !== null) select(element);
  });
  row.append(name);
  if (item.state === 'written') {
    const lines = el('ul', 'why-lines');
    for (const line of item.lines) lines.append(el('li', undefined, line));
    row.append(lines);
    // Guideline ids and the stale mark sit under a hairline: one fill, the item's own.
    if (item.guidelines.length > 0 || item.stale) {
      const foot = el('div', 'why-foot');
      if (item.guidelines.length > 0) {
        const names = el('div', 'why-guidelines');
        names.setAttribute('role', 'group');
        names.setAttribute('aria-label', text('why.guidelinesLabel'));
        for (const id of item.guidelines) names.append(el('span', 'k-chip', id));
        foot.append(names);
      }
      if (item.stale) {
        const stale = el('span', 'why-stale k-chip', text('why.staleShort'));
        stale.dataset.tone = 'review';
        stale.title = text('why.stale');
        stale.setAttribute('role', 'status');
        foot.append(stale);
      }
      row.append(foot);
    }
    return row;
  }
  row.append(el('p', 'k-quiet', text('why.none')));
  if (item.state === 'asked') {
    row.append(el('p', 'why-asked k-meta', text('why.asked')));
    return row;
  }
  const button = el('button', 'why-ask k-btn k-btn-line', text('why.ask'));
  button.type = 'button';
  button.addEventListener('click', ask);
  row.append(button);
  return row;
}

export function mountWhy(ctx: EditorContext): void {
  const section = ctx.panel.querySelector('section[data-edit="why"]');
  if (!(section instanceof HTMLElement)) return;
  const { store } = ctx;
  let shown: Shown = 'loading';
  let reading = false;
  let again = false;
  /** Sections asked in this page, until the request list says so too. */
  const asked = new Set<string>();

  const head = el('div', 'k-pad why-head');
  const title = el('div', 'k-head');
  title.append(el('h2', undefined, text('why.title')));
  head.append(title);
  const scroll = el('div', 'k-scroll why-scroll');
  section.append(head, scroll);

  function say(words: string, status = false): void {
    const note = el('p', 'k-empty why-note', words);
    if (status) note.setAttribute('role', 'status');
    scroll.replaceChildren(note);
  }

  function render(): void {
    if (shown === 'loading' || shown === 'failed') {
      say(text(shown === 'loading' ? 'why.loading' : 'why.failed'), true);
      return;
    }
    const state = store.get();
    const requests = [
      ...state.requests,
      ...[...asked].map((name) => ({ kind: 'why', status: 'waiting', text: name })),
    ];
    const items = itemsOf(
      shown,
      requests,
      (state.structure?.sections ?? []).map((one) => one.id),
    );
    if (items.length === 0) {
      say(text('why.empty'));
      return;
    }
    const list = el('ul', 'k-stack why-list');
    for (const item of items) {
      const select = (id: string): void => store.set({ selection: [id] });
      const ask = (): void => {
        void askWhy(ctx.slug, item).then((sent) => {
          if (sent) asked.add(item.section);
          render();
        });
      };
      list.append(entryView(item, select, ask));
    }
    scroll.replaceChildren(list);
  }

  function read(): void {
    // One read at a time; a change that came during it asks for one more.
    if (reading) {
      again = true;
      return;
    }
    reading = true;
    void getWhy(ctx.slug).then((report) => {
      reading = false;
      shown = report ?? 'failed';
      render();
      if (again) {
        again = false;
        read();
      }
    });
  }

  store.subscribe((state, previous) => {
    // Claude answers a `why` request by writing the files; a build follows a new version.
    if (state.requests !== previous.requests || state.builds !== previous.builds) read();
    else if (state.structure !== previous.structure) render();
  });
  render();
  read();
}
