// The Changes pane's rows drawn (plan 18f, task 3): an entry (the element's icon and name, the
// Claude tag, the time, the undo of the newest, the change as chips, Claude's reason), the version
// marker, and the filter All | You | Claude. Built with `createElement` and `textContent` only:
// the names are the draft's, never markup. `changes.ts` mounts them; the decisions are in
// `change-chips.ts` and `rail.ts`.

import { icon, iconButton } from '../../ui/icon.ts';
import type { EditorContext } from '../context.ts';
import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import {
  agoOf,
  CHANGE_FILTERS,
  type ChangeFilter,
  changeChips,
  iconOfEntry,
} from './change-chips.ts';
import { changeRow, chipName } from './chip-view.ts';
import type { StepEntry } from './chips.ts';

/** What a row needs besides its entry. */
export type EntryView = {
  undo: boolean;
  flash: boolean;
  mismatched: ReadonlySet<string>;
  now: number;
  /** The element's name; the pane's own rule (`entryParts`). */
  element: string;
};

function button(className: string, words: string): HTMLButtonElement {
  const node = el('button', className, words);
  node.type = 'button';
  return node;
}

/** "now", "2 min", "3 h", "4 d". */
export function agoWords(at: number, now: number): string {
  const { unit, n } = agoOf(at, now);
  return text(`changes.ago.${unit}`, { n });
}

function chip(words: string, tone: 'review'): HTMLElement {
  const node = el('span', 'k-chip', words);
  node.dataset.tone = tone;
  return node;
}

/** The dot of a step on the rail; a version's is a square (`changes.ts` of the skin). */
const node = (): HTMLElement => {
  const dot = el('span', 'changes-node');
  dot.setAttribute('aria-hidden', 'true');
  return dot;
};

export function renderEntry(ctx: EditorContext, entry: StepEntry, view: EntryView): HTMLElement {
  const row = el('li', 'changes-step');
  row.dataset.by = entry.by;
  if (view.flash) row.classList.add('k-flash');
  const head = el('div', 'changes-row');
  const id = entry.id;
  if (view.element !== '') {
    const name = el('button', 'changes-element');
    name.type = 'button';
    name.title = view.element;
    name.append(icon(iconOfEntry(entry)), el('span', 'k-clip', view.element));
    if (id === null) name.setAttribute('aria-disabled', 'true');
    else name.addEventListener('click', () => ctx.store.set({ selection: [id] }));
    head.append(name);
  }
  if (entry.by === 'claude') head.append(el('span', 'changes-by', text('changes.claude')));
  const when = el('time', 'changes-time', agoWords(entry.at, view.now));
  when.dateTime = new Date(entry.at).toISOString();
  when.title = new Date(entry.at).toLocaleTimeString();
  head.append(when);
  if (view.undo) {
    const undo = iconButton('undo', text('changes.undoStep'));
    undo.dataset.changesUndo = '';
    undo.disabled = ctx.store.get().busy;
    undo.addEventListener('click', () => void ctx.history.undo());
    head.append(undo);
  }
  row.append(node(), head);
  const chips = changeRow(changeChips(entry, chipName));
  if (chips) row.append(chips);
  // Claude's reason is the line under its chips; the person's own words stay in the row's title.
  if (entry.by === 'claude') row.append(el('p', 'changes-reason', entry.label));
  else row.title = entry.label;
  const flags: HTMLElement[] = [];
  if (entry.offKit) flags.push(chip(text('changes.entryOffKit'), 'review'));
  // Spec 4c, goal 8: the build shows another value than the editor did for this element.
  if (id !== null && view.mismatched.has(id)) flags.push(chip(text('live.mismatchFlag'), 'review'));
  if (flags.length > 0) {
    const line = el('div', 'changes-flags');
    line.append(...flags);
    row.append(line);
  }
  return row;
}

/** The rail's end: the last saved version, when it was saved, and whether steps above are not in it. */
export function renderMarker(version: number, savedAt: string | null, above: boolean): HTMLElement {
  const row = el('li', 'changes-step changes-saved');
  row.dataset.by = 'version';
  const head = el('div', 'changes-row');
  head.append(el('strong', 'changes-version', text('changes.version', { version })));
  if (savedAt !== null)
    head.append(el('span', 'changes-time', text('changes.savedAt', { time: savedAt })));
  row.append(
    node(),
    head,
    el('p', 'k-meta', text(above ? 'changes.everythingAbove' : 'changes.lastSaved')),
  );
  return row;
}

export type FilterBar = {
  element: HTMLElement;
  render(by: ChangeFilter, counts: Record<ChangeFilter, number>): void;
};

const FILTER_WORDS: Record<ChangeFilter, string> = {
  all: 'changes.filter.all',
  person: 'changes.you',
  claude: 'changes.claude',
};

/** The filter All N | You N | Claude N, drawn once; `render` moves the pressed one and the counts. */
export function createFilterBar(choose: (by: ChangeFilter) => void): FilterBar {
  const element = el('div', 'k-seg changes-filter');
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', text('changes.filter.label'));
  const counts = new Map<ChangeFilter, HTMLElement>();
  const buttons = new Map<ChangeFilter, HTMLButtonElement>();
  for (const by of CHANGE_FILTERS) {
    const one = button('', text(FILTER_WORDS[by]));
    const count = el('span', 'changes-filter-count');
    one.append(' ', count);
    one.addEventListener('click', () => choose(by));
    counts.set(by, count);
    buttons.set(by, one);
    element.append(one);
  }
  return {
    element,
    render(by, numbers) {
      for (const one of CHANGE_FILTERS) {
        const count = counts.get(one);
        if (count) count.textContent = String(numbers[one]);
        buttons.get(one)?.setAttribute('aria-pressed', one === by ? 'true' : 'false');
      }
    },
  };
}
