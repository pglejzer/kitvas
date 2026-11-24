// The Changes tab (plan 13, task J; plan 18, task D): the session's steps as a rail of nodes, each
// with who made it, what changed as chips and, on the newest of the person's, its undo; the last
// saved version at the rail's end; the values outside the kit; and the foot with Undo all and
// Save version, always in view. The logic is in pure functions over plain data (`rail.ts`,
// `chips.ts`); `mountChanges` only draws it and wires the clicks.

import type { EditOp } from '../../../../src/edit/index.ts';
import type { OffKit } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { iconButton } from '../../ui/icon.ts';
import { getOffKit } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { mismatchedIds } from '../live/items.ts';
import type { ChangeEntry } from '../store.ts';
import { text } from '../texts.ts';
import { chipRow } from './chip-view.ts';
import { chipsOf, type StepEntry } from './chips.ts';
import { footNote, isFresh, savedVersion, undoableIndex } from './rail.ts';

export type OffKitItem = OffKit['items'][number];

/** `Pricing / Card.2` for `sections/Pricing:section/Stack/Card.2`; the whole id when it has no `:`. */
export function elementName(id: string): string {
  const colon = id.indexOf(':');
  if (colon < 0) return id;
  const stem = id.slice(0, colon).split('/').pop() ?? '';
  const tag =
    id
      .slice(colon + 1)
      .split('/')
      .pop() ?? '';
  return stem === '' ? tag : `${stem} / ${tag}`;
}

export type EntryParts = {
  who: 'person' | 'claude';
  /** The element, or the changed files for a change by Claude to whole files; `''` when neither. */
  element: string;
  label: string;
  offKit: boolean;
  /** The element to select when the entry is clicked; `null` when there is none. */
  id: string | null;
};

/** One change list line as plain data, without any text for people. */
export function entryParts(entry: ChangeEntry): EntryParts {
  return {
    who: entry.by,
    element: entry.id !== null ? elementName(entry.id) : entry.files.join(', '),
    label: entry.label,
    offKit: entry.offKit,
    id: entry.id,
  };
}

/** Newest first; entries of the same instant keep the later one first. */
export function newestFirst<T extends ChangeEntry>(changes: readonly T[]): T[] {
  return changes
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.at - a.entry.at || b.index - a.index)
    .map((item) => item.entry);
}

const pascal = (id: string): string =>
  id
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

/** `src/scss/sections/_order-summary.scss` is the section `order-summary`; `null` for another path. */
export function sectionOfFile(file: string): string | null {
  const match = /^src\/scss\/sections\/_?([a-z][a-z0-9-]*)\.scss$/.exec(file);
  return match?.[1] ?? null;
}

/**
 * The one `setStyle` that replaces an off-kit value by its nearest token. The section's SCSS is
 * written by class, so the op names the section's own element id (`sections/<Section>:section`).
 * `null` when the kit has no nearest token or the path is not a section file.
 */
export function mapToNearestOp(item: OffKitItem): EditOp | null {
  const section = sectionOfFile(item.file);
  if (item.nearest === null || section === null) return null;
  return {
    op: 'setStyle',
    id: `sections/${pascal(section)}:section`,
    className: item.className,
    property: item.property,
    value: { token: item.nearest.var },
    before: { raw: item.value },
    newRule: false,
  };
}

function element(tag: string, className?: string, content?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function button(className: string, words: string): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = words;
  return node;
}

function chip(words: string, tone?: 'review'): HTMLElement {
  const node = element('span', 'k-chip', words);
  if (tone !== undefined) node.dataset.tone = tone;
  return node;
}

/** The dot of a step on the rail; a version's is a square (`changes.ts` of the skin). */
const node = (): HTMLElement => {
  const dot = element('span', 'changes-node');
  dot.setAttribute('aria-hidden', 'true');
  return dot;
};

type StepView = { undo: boolean; flash: boolean; mismatched: ReadonlySet<string> };

function renderStep(ctx: EditorContext, entry: StepEntry, view: StepView): HTMLElement {
  const parts = entryParts(entry);
  const row = element('li', 'changes-step');
  row.dataset.by = parts.who;
  if (view.flash) row.classList.add('k-flash');
  const head = element('div', 'changes-row');
  const id = parts.id;
  if (parts.element !== '') {
    const name = button('changes-element k-clip', parts.element);
    name.title = parts.element;
    if (id === null) name.setAttribute('aria-disabled', 'true');
    else name.addEventListener('click', () => ctx.store.set({ selection: [id] }));
    head.append(name);
  }
  head.append(chip(text(parts.who === 'claude' ? 'changes.claude' : 'changes.you')));
  if (view.undo) {
    const undo = iconButton('undo', text('changes.undoStep'));
    undo.dataset.changesUndo = '';
    undo.disabled = ctx.store.get().busy;
    undo.addEventListener('click', () => void ctx.history.undo());
    head.append(undo);
  }
  row.append(node(), head);
  const chips = chipRow(chipsOf(entry));
  if (chips) row.append(chips);
  row.append(element('p', 'changes-label', parts.label));
  const flags: HTMLElement[] = [];
  if (parts.offKit) flags.push(chip(text('changes.entryOffKit'), 'review'));
  // Spec 4c, goal 8: the build shows another value than the editor did for this element.
  if (id !== null && view.mismatched.has(id)) flags.push(chip(text('live.mismatchFlag'), 'review'));
  if (flags.length > 0) {
    const line = element('div', 'changes-chips');
    line.append(...flags);
    row.append(line);
  }
  return row;
}

/** The rail's end: the last saved version, and whether the steps above are in it. */
function renderSaved(version: number, above: boolean): HTMLElement {
  const row = element('li', 'changes-step changes-saved');
  row.dataset.by = 'version';
  const head = element('div', 'changes-row');
  head.append(element('strong', undefined, text('changes.version', { version })));
  row.append(
    node(),
    head,
    element('p', 'k-meta', text(above ? 'changes.notInVersion' : 'changes.lastSaved')),
  );
  return row;
}

function renderOffKit(ctx: EditorContext, items: OffKitItem[]): HTMLElement {
  const box = element('section', 'changes-offkit');
  const title = text(items.length === 0 ? 'changes.offKitNone' : 'changes.offKit', {
    n: items.length,
  });
  box.append(element('h3', 'changes-offkit-title', title));
  if (items.length === 0) return box;
  const list = element('ul', 'k-stack');
  for (const item of items) {
    const row = element('li', 'k-item changes-offkit-item');
    const what = element('p', 'changes-offkit-what');
    what.append(
      element('code', 'k-mono', `.${item.className}`),
      element('span', undefined, item.property),
      element('code', 'k-mono changes-offkit-value', item.value),
    );
    const op = mapToNearestOp(item);
    const map = button(
      'k-btn k-btn-line',
      item.nearest === null
        ? text('changes.noNearest')
        : text('changes.map', { token: item.nearest.path }),
    );
    map.disabled = op === null;
    if (op !== null && item.nearest !== null) {
      const label = text('changes.mapLabel', { property: item.property, token: item.nearest.path });
      map.addEventListener('click', () => {
        void ctx.history.apply({ ops: [op], label, flash: true });
      });
    }
    row.append(what, map);
    list.append(row);
  }
  box.append(list);
  return box;
}

/**
 * Undo all: every step of the undo stack, one after another through the history (each one a
 * request, so a change by someone else is met as any undo meets it). A conflict, a refusal or a
 * request that did not go through stops it; redo brings the steps back.
 */
async function undoAll(ctx: EditorContext): Promise<void> {
  let left = ctx.store.get().undo.length;
  while (left > 0) {
    await ctx.history.undo();
    const state = ctx.store.get();
    if (state.conflict !== null || state.refused !== null || state.undo.length >= left) return;
    left = state.undo.length;
  }
}

export function mountChanges(ctx: EditorContext): void {
  const section = ctx.panel.querySelector('[data-edit="changes"]');
  if (!(section instanceof HTMLElement)) return;
  let items: OffKitItem[] = [];
  let reads = 0;
  /** How many lines the rail showed last: a new one flashes once. */
  let shown = ctx.store.get().changes.length;
  let undoing = false;

  // Drawn once: the part that scrolls, and the foot that stays in view (C8). The rail and the
  // values outside the kit are drawn apart, so a read of the one leaves the other as it is.
  const steps = element('div', 'changes-steps');
  const offKit = element('div');
  const body = element('div', 'k-pad changes-body');
  body.append(steps, offKit);
  const scroll = element('div', 'k-scroll');
  scroll.append(body);
  const foot = element('div', 'k-actions changes-foot');
  const note = element('span', 'k-meta changes-foot-note');
  const all = button('k-btn', text('changes.undoAll'));
  // Session (`session.ts`) runs every Save version button: the bar's and this one.
  const save = button('k-btn k-btn-primary', text('save'));
  save.dataset.changesSave = '';
  foot.append(note, all, save);
  section.replaceChildren(scroll, foot);

  all.addEventListener('click', () => {
    if (undoing) return;
    undoing = true;
    renderFoot();
    void undoAll(ctx).finally(() => {
      undoing = false;
      renderFoot();
    });
  });

  /** What follows `busy` and the stacks without drawing the rail again (focus stays put). */
  function renderFoot(): void {
    const state = ctx.store.get();
    const said = footNote(state.undo, (state.edit?.session ?? null) !== null);
    note.textContent = said === null ? '' : text(said.key, said.params);
    all.disabled = undoing || state.busy || state.undo.length === 0;
    const undo = steps.querySelector<HTMLButtonElement>('button[data-changes-undo]');
    if (undo) undo.disabled = undoing || state.busy;
  }

  const draw = (): void => {
    const state = ctx.store.get();
    const entries: StepEntry[] = newestFirst(state.changes);
    const mismatched = mismatchedIds(state.live);
    const undoAt = undoableIndex(entries, state.undo[state.undo.length - 1]);
    const fresh = isFresh(shown, state.changes.length);
    shown = state.changes.length;
    const rail = element('ol', 'changes-rail');
    rail.setAttribute('aria-label', text('changes.title'));
    entries.forEach((entry, index) => {
      const flash = fresh && index === 0;
      rail.append(renderStep(ctx, entry, { undo: index === undoAt, flash, mismatched }));
    });
    const version = savedVersion(state.edit);
    if (version !== null) rail.append(renderSaved(version, entries.length > 0));
    const empty = entries.length === 0 ? element('p', 'k-quiet', text('changes.empty')) : null;
    steps.replaceChildren(...(empty ? [empty] : []), ...(rail.childElementCount > 0 ? [rail] : []));
    renderFoot();
  };

  // The newest read wins: an answer for an older request is dropped.
  const refresh = async (): Promise<void> => {
    const mine = ++reads;
    const answer = await getOffKit(ctx.store.get().slug);
    if (mine !== reads || !answer.ok) return;
    items = answer.body.items;
    offKit.replaceChildren(renderOffKit(ctx, items));
  };

  // Every applied edit and every `source` event adds an entry, so a new list means new files.
  ctx.store.subscribe((state, previous) => {
    if (state.changes === previous.changes) {
      const stacks = state.undo !== previous.undo || state.edit !== previous.edit;
      if (state.live !== previous.live || stacks) draw();
      else if (state.busy !== previous.busy) renderFoot();
      return;
    }
    draw();
    void refresh();
  });
  draw();
  offKit.replaceChildren(renderOffKit(ctx, items));
  void refresh();
}
