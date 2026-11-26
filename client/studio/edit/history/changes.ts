// The Changes tab (plan 13, task J; plan 18, task D; plan 18f, task 3): a filter All | You | Claude,
// then the session's steps as a rail of nodes, each with the element, who made it, when, what
// changed as chips and, on the newest of the person's, its undo; the last saved version at the
// rail's end; the values outside the kit; and the foot with Undo all and Save version, always in
// view. The logic is in pure functions over plain data (`rail.ts`, `change-chips.ts`, `chips.ts`);
// `entry-view.ts` draws the rows; `mountChanges` wires them.

import type { EditOp } from '../../../../src/edit/index.ts';
import { pascal } from '../../../../src/shared/values/names.ts';
import type { OffKit } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { getOffKit } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { mismatchedIds } from '../live/items.ts';
import type { ChangeEntry } from '../store.ts';
import { text } from '../texts.ts';
import { type ChangeFilter, countChanges, filterChanges } from './change-chips.ts';
import type { StepEntry } from './chips.ts';
import { createFilterBar, renderEntry, renderMarker } from './entry-view.ts';
import { footNote, isFresh, savedVersion, undoableIndex } from './rail.ts';
import { readSavedAt } from './saved-at.ts';
import { mountTabCounts } from './tab-counts.ts';

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
  let filter: ChangeFilter = 'all';
  /** The saved version's clock time, by version: read once, drawn in the marker. */
  const savedAt = new Map<number, string | null>();

  // Drawn once: the part that scrolls, and the foot that stays in view (C8). The rail and the
  // values outside the kit are drawn apart, so a read of the one leaves the other as it is.
  const bar = createFilterBar((by) => {
    filter = by;
    draw();
  });
  const steps = element('div', 'changes-steps');
  const offKit = element('div');
  const body = element('div', 'k-pad changes-body');
  body.append(bar.element, steps, offKit);
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
    bar.render(filter, countChanges(entries));
    const now = Date.now();
    const rail = element('ol', 'changes-rail');
    rail.setAttribute('aria-label', text('changes.title'));
    // The filter hides lines, never the undo: the newest line keeps its place in the whole list.
    const newest = entries[0];
    for (const entry of filterChanges(entries, filter)) {
      const view = {
        undo: undoAt === 0 && entry === newest,
        flash: fresh && entry === newest,
        mismatched,
        now,
        element: entryParts(entry).element,
      };
      rail.append(renderEntry(ctx, entry, view));
    }
    const version = savedVersion(state.edit);
    if (version !== null) {
      rail.append(renderMarker(version, savedAt.get(version) ?? null, entries.length > 0));
      if (!savedAt.has(version)) {
        savedAt.set(version, null);
        void readSavedAt(state.slug, version).then((time) => {
          savedAt.set(version, time);
          if (time !== null) draw();
        });
      }
    }
    const none = entries.length === 0 ? 'changes.empty' : 'changes.emptyFilter';
    const hidden = filterChanges(entries, filter).length === 0;
    const empty = hidden ? element('p', 'k-quiet', text(none)) : null;
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
  mountTabCounts(ctx);
}
