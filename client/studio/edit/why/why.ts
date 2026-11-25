// The Why pane (spec 4d, goal 7; plan 17, task E; plan 18, task B; plan 18f, task 1): the left
// panel's reasons, one `.k-card` per section in layout order, as the mock's cards. A click on a name selects the section's root; "may be out
// of date" says the section changed after its lines were written; a section with none offers "Ask
// Claude for the reasons", which sends a `why` request (task A's route). The data is pure
// (`entries.ts`).

import type { EditorContext } from '../context.ts';
import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import { askWhy, getWhy } from './api.ts';
import { itemsOf, type WhyItem, type WhyReport } from './entries.ts';
import { splitLead } from './lead.ts';

type Shown = WhyReport | 'loading' | 'failed';

/** One reason: its first words in bold, then the rest, as the mock's card sets it. */
function reasonView(line: string): HTMLElement {
  const reason = el('p', 'why-line');
  const { lead, rest } = splitLead(line);
  if (lead !== '') {
    reason.append(el('em', undefined, lead), document.createTextNode(` ${rest}`));
  } else {
    reason.textContent = rest;
  }
  return reason;
}

function entryView(item: WhyItem, select: (id: string) => void, ask: () => void): HTMLElement {
  const row = el('li', 'k-card why-card');
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
    for (const line of item.lines) row.append(reasonView(line));
    // The files do not say which version wrote them (a new version copies them), so no number.
    row.append(el('small', 'why-by', text('why.writtenBy')));
    // Guideline ids and the stale mark sit under a hairline: one fill, the card's own.
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
