// The session change list and the off-kit counter (plan 13, task J). The logic is in pure
// functions over plain data; `mountChanges` only draws it and wires the clicks.

import type { EditOp } from '../../../src/edit/index.ts';
import type { OffKit } from '../../../src/studio/api/edit-schemas.ts';
import { getOffKit } from './api.ts';
import type { EditorContext } from './context.ts';
import type { ChangeEntry } from './store.ts';
import { text } from './texts.ts';

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
export function newestFirst(changes: ChangeEntry[]): ChangeEntry[] {
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

function renderEntry(ctx: EditorContext, entry: ChangeEntry): HTMLElement {
  const parts = entryParts(entry);
  const row = element('li');
  const line = element('button', 'edit-change');
  (line as HTMLButtonElement).type = 'button';
  const who = text(parts.who === 'claude' ? 'changes.claude' : 'changes.you');
  line.append(
    element('span', 'edit-change-who', who),
    element('span', 'edit-change-element', parts.element),
    element('span', 'edit-change-label', parts.label),
  );
  if (parts.offKit) line.append(element('span', 'edit-change-flag', text('changes.entryOffKit')));
  const id = parts.id;
  if (id === null) line.setAttribute('aria-disabled', 'true');
  else line.addEventListener('click', () => ctx.store.set({ selection: [id] }));
  row.append(line);
  return row;
}

function renderOffKit(ctx: EditorContext, items: OffKitItem[]): HTMLElement {
  const box = element('div', 'edit-offkit');
  const title = text(items.length === 0 ? 'changes.offKitNone' : 'changes.offKit', {
    n: items.length,
  });
  box.append(element('h4', undefined, title));
  const list = element('ul');
  for (const item of items) {
    const row = element('li', 'edit-offkit-item');
    row.append(
      element('span', 'edit-offkit-class', `.${item.className}`),
      element('span', undefined, item.property),
      element('span', 'edit-offkit-value', item.value),
    );
    const op = mapToNearestOp(item);
    const button = element(
      'button',
      undefined,
      item.nearest === null
        ? text('changes.noNearest')
        : text('changes.map', { token: item.nearest.path }),
    ) as HTMLButtonElement;
    button.type = 'button';
    button.disabled = op === null;
    if (op !== null && item.nearest !== null) {
      const label = text('changes.mapLabel', { property: item.property, token: item.nearest.path });
      button.addEventListener('click', () => {
        void ctx.history.apply({ ops: [op], label });
      });
    }
    row.append(button);
    list.append(row);
  }
  box.append(list);
  return box;
}

export function mountChanges(ctx: EditorContext): void {
  const section = ctx.panel.querySelector('[data-edit="changes"]');
  if (!(section instanceof HTMLElement)) return;
  let items: OffKitItem[] = [];
  let reads = 0;

  const draw = (): void => {
    const heading = element('h3', undefined, text('changes.title'));
    const entries = newestFirst(ctx.store.get().changes);
    const list = element('ol');
    for (const entry of entries) list.append(renderEntry(ctx, entry));
    section.replaceChildren(
      heading,
      entries.length === 0 ? element('p', 'edit-empty', text('changes.empty')) : list,
      renderOffKit(ctx, items),
    );
  };

  // The newest read wins: an answer for an older request is dropped.
  const refresh = async (): Promise<void> => {
    const mine = ++reads;
    const answer = await getOffKit(ctx.store.get().slug);
    if (mine !== reads || !answer.ok) return;
    items = answer.body.items;
    draw();
  };

  // Every applied edit and every `source` event adds an entry, so a new list means new files.
  ctx.store.subscribe((state, previous) => {
    if (state.changes === previous.changes) return;
    draw();
    void refresh();
  });
  draw();
  void refresh();
}
