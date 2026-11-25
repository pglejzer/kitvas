// A click on a lens pin (redesign spec, goal 9; plan 19, task 1): in Edit the pin's element is
// selected, and its panel opens, Properties for a kit pin, Checks for a check, Why for a why and
// Changes for a change, with the finding, the section or the change scrolled into view. The panel
// opens the way every opener of the screen opens one: a click on a `[data-open-pane]` inside `main`
// (`shell/panels.ts`). The pin's key says which row it is (`rowOfKey`, pure).

import type { LensPin, PinKind } from '../../channel/lens-protocol.ts';
import { elementName } from '../edit/history/changes.ts';
import type { Store } from '../edit/store.ts';

/** The pane each kind of pin opens (`src/studio/pages/editor/editor-side.ts` names them). */
export const PIN_PANES: Record<PinKind, string> = {
  kit: 'properties',
  check: 'checks',
  why: 'why',
  change: 'changes',
};

/** The row a pin's key points at in its pane. */
export type PinRow =
  /** The full check's finding: its place among the page's `li.note` rows. */
  | { kind: 'finding'; index: number }
  /** A live finding: its group in the Live section, and its row there. */
  | { kind: 'live'; group: number; row: number }
  /** A section's card in the Why pane. */
  | { kind: 'section'; name: string }
  /** The newest step of the pin's element in the Changes tab. */
  | { kind: 'change' }
  | { kind: 'none' };

/** What a pin's key (`pins/checks.ts`, `pins/why.ts`, `pins/changes.ts`) says of its row. */
export function rowOfKey(pin: Pick<LensPin, 'key' | 'kind'>): PinRow {
  if (pin.kind === 'check') {
    const full = /^check:f(\d+)$/.exec(pin.key);
    if (full) return { kind: 'finding', index: Number(full[1]) };
    const live = /^check:l(\d+)\.(\d+)$/.exec(pin.key);
    if (live) return { kind: 'live', group: Number(live[1]), row: Number(live[2]) };
  }
  if (pin.kind === 'why') {
    const name = /^why:(.+)$/.exec(pin.key)?.[1];
    if (name !== undefined) return { kind: 'section', name };
  }
  if (pin.kind === 'change') return { kind: 'change' };
  return { kind: 'none' };
}

/** Shows `pane` in its panel, opening the panel: what any `[data-open-pane]` button does. */
function openPane(main: HTMLElement, pane: string): void {
  const opener = document.createElement('button');
  opener.type = 'button';
  opener.hidden = true;
  opener.dataset.openPane = pane;
  main.append(opener);
  opener.click();
  opener.remove();
}

const firstOf = (
  rows: Iterable<HTMLElement>,
  test: (row: HTMLElement) => boolean,
): HTMLElement | null => [...rows].find(test) ?? null;

/** The row the pin points at, in the pane it opened; `null` when it is not drawn. */
function rowFor(main: HTMLElement, pin: LensPin): Element | null {
  const row = rowOfKey(pin);
  switch (row.kind) {
    case 'finding':
      return main.querySelectorAll('li.note')[row.index] ?? null;
    case 'live': {
      const groups = main.querySelectorAll('[data-edit="live-checks"] .checks-live-groups > li');
      const group = groups[row.group];
      return group?.querySelectorAll('.checks-live-rows > li')[row.row] ?? group ?? null;
    }
    case 'section':
      return firstOf(
        main.querySelectorAll<HTMLElement>('[data-edit="why"] li.why-card'),
        (card) => card.dataset.section === row.name,
      );
    case 'change': {
      // The Changes tab names a step's element as `elementName` does, newest first.
      const name = elementName(pin.id);
      return firstOf(
        main.querySelectorAll<HTMLElement>('[data-edit="changes"] li.changes-step'),
        (step) => step.querySelector('.changes-element')?.getAttribute('title') === name,
      );
    }
    case 'none':
      return null;
  }
}

/** What a click on `pin` does. `store`: the editor's, `null` on a page without one. */
export function openPin(main: HTMLElement, store: Store | null, pin: LensPin): void {
  const state = store?.get();
  // Selected first, so the pane shows that element (Properties) or follows it.
  if (store && state?.on && (state.selection.length !== 1 || state.selection[0] !== pin.id)) {
    store.set({ selection: [pin.id] });
  }
  openPane(main, PIN_PANES[pin.kind]);
  rowFor(main, pin)?.scrollIntoView({ block: 'nearest' });
}
