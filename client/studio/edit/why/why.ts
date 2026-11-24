// The Why tab (spec 4d, goal 7; plan 17, task E): the left panel's reasons, one entry per section
// in layout order. A click on an entry selects the section's root; "may be out of date" says the
// section changed after its lines were written; a section with none offers "Ask Claude for the
// reasons", which sends a `why` request (task A's route). The data is pure (`entries.ts`).

import type { EditorContext } from '../context.ts';
import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import { askWhy, getWhy } from './api.ts';
import { itemsOf, type WhyItem, type WhyReport } from './entries.ts';

type Shown = WhyReport | 'loading' | 'failed';

function entryView(item: WhyItem, select: (id: string) => void, ask: () => void): HTMLElement {
  const row = el('li', 'why-item');
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
    if (item.guidelines.length > 0) {
      const names = item.guidelines.join(', ');
      row.append(el('p', 'props-note why-guidelines', text('why.guidelines', { names })));
    }
    if (item.stale) {
      const stale = el('p', 'props-note why-stale', text('why.stale'));
      stale.setAttribute('role', 'status');
      row.append(stale);
    }
    return row;
  }
  row.append(el('p', 'props-note', text('why.none')));
  if (item.state === 'asked') {
    row.append(el('p', 'props-note why-asked', text('why.asked')));
    return row;
  }
  const button = el('button', 'why-ask', text('why.ask'));
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

  function render(): void {
    if (shown === 'loading' || shown === 'failed') {
      const note = el('p', 'props-note', text(shown === 'loading' ? 'why.loading' : 'why.failed'));
      note.setAttribute('role', 'status');
      section?.replaceChildren(note);
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
      section?.replaceChildren(el('p', 'props-note', text('why.empty')));
      return;
    }
    const list = el('ul', 'why-list');
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
    section?.replaceChildren(list);
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
