// Waivers (spec 4c, goal 6; plan 16, task E): accept a finding on purpose, with a reason, and take
// it back. `store.waivers` holds the draft's waivers (`GET …/waivers`). Every finding row has a
// `waiverControl`: the Checks list's rows get one from `mountWaivers`, and the Live section (task
// C) puts its own on each live finding. Accepted findings show as accepted and are never marked.

import type { Waiver } from '../../../../src/studio/api/waivers/waiver-schemas.ts';
import { getWaivers, postWaiver, postWithdraw } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { text } from '../texts.ts';

/** Copy of `MAX_REASON` in `src/studio/api/waivers/waiver-schemas.ts`. */
export const MAX_REASON = 300;

/** What a waiver is about: the rule that fired and the element it fired on. */
export type WaiverKey = { rule: string; element: string | null };

export type ReasonProblem = 'empty' | 'long';

/** Why a reason is not taken; the server trims it too, so spaces alone are empty. */
export function reasonProblem(reason: string): ReasonProblem | null {
  const trimmed = reason.trim();
  if (trimmed === '') return 'empty';
  return trimmed.length > MAX_REASON ? 'long' : null;
}

/** The waiver of this rule on this element, if there is one. */
export function waiverOf(waivers: readonly Waiver[], key: WaiverKey): Waiver | undefined {
  return waivers.find((waiver) => waiver.rule === key.rule && waiver.element === key.element);
}

/**
 * The rule and element of a row of the Checks list. The rule is the row's `<code>` (the server
 * writes it inside the details); the element is `data-element`, or `data-waived-element` once the
 * row is accepted. `null` for a row with no rule.
 */
export function noteKey(row: {
  rule: string | null;
  element: string | undefined;
  waivedElement: string | undefined;
}): WaiverKey | null {
  const rule = row.rule?.trim() ?? '';
  if (rule === '') return null;
  return { rule, element: row.element ?? row.waivedElement ?? null };
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'waiver-button';
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
}

/**
 * "Accept…" for one finding, or "Accepted: <reason>" with Withdraw when `store.waivers` has it.
 * The element follows the store: it draws itself again when the waivers change.
 */
export function waiverControl(ctx: EditorContext, finding: WaiverKey): HTMLElement {
  const { store, slug } = ctx;
  const root = document.createElement('span');
  root.className = 'waiver';
  let asking = false;
  let connected = false;

  const failed = (code: string | null): string =>
    text(code === 'WAIVER_LIMIT' ? 'waiver.full' : 'waiver.failed');

  function form(): HTMLFormElement {
    const element = document.createElement('form');
    element.className = 'waiver-form';
    const label = document.createElement('label');
    label.textContent = text('waiver.reasonLabel');
    const input = document.createElement('input');
    input.type = 'text';
    input.required = true;
    input.maxLength = MAX_REASON;
    label.append(input);
    const error = document.createElement('span');
    error.className = 'waiver-error';
    error.setAttribute('role', 'alert');
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'waiver-button';
    save.textContent = text('waiver.save');
    const cancel = button(text('waiver.cancel'), () => {
      asking = false;
      render();
    });
    element.append(label, save, cancel, error);
    element.addEventListener('submit', (event) => {
      event.preventDefault();
      const problem = reasonProblem(input.value);
      if (problem !== null) {
        error.textContent = text(problem === 'empty' ? 'waiver.reasonEmpty' : 'waiver.reasonLong');
        return;
      }
      save.disabled = true;
      void postWaiver(slug, { ...finding, reason: input.value.trim() }).then((answer) => {
        if (answer.ok) {
          asking = false;
          store.set({ waivers: answer.body.waivers });
          return;
        }
        save.disabled = false;
        error.textContent = failed(answer.code);
      });
    });
    queueMicrotask(() => input.focus());
    return element;
  }

  function render(): void {
    root.replaceChildren();
    const waiver = waiverOf(store.get().waivers, finding);
    if (waiver) {
      const note = document.createElement('span');
      note.className = 'waiver-state';
      note.textContent = text('waiver.accepted', { reason: waiver.reason });
      root.append(
        note,
        button(text('waiver.withdraw'), () => {
          void postWithdraw(slug, finding).then((answer) => {
            if (answer.ok) store.set({ waivers: answer.body.waivers });
          });
        }),
      );
      return;
    }
    root.append(
      asking
        ? form()
        : button(text('waiver.accept'), () => {
            asking = true;
            render();
          }),
    );
  }

  // A control that was on the page and left it stops listening, so rebuilt lists leak nothing.
  const stop = store.subscribe((state, previous) => {
    if (root.isConnected) connected = true;
    else if (connected) {
      stop();
      return;
    }
    if (state.waivers !== previous.waivers) render();
  });
  render();
  return root;
}

/** The rows of the Checks list the controls go on: the numbered notes and the accepted ones. */
const ROWS = 'li.note, li.accepted-note';

function rowKey(row: HTMLElement): WaiverKey | null {
  return noteKey({
    rule: row.querySelector('code')?.textContent ?? row.dataset.rule ?? null,
    element: row.dataset.element,
    waivedElement: row.dataset.waivedElement,
  });
}

/**
 * Puts a control on each row that has none, and marks the rows the store accepts: `data-waived`,
 * and the element id moved to `data-waived-element`, so the canvas marks (read from `data-element`)
 * leave it out the next time they are read.
 */
export function decorateRows(ctx: EditorContext, region: HTMLElement): void {
  const { waivers } = ctx.store.get();
  for (const row of region.querySelectorAll<HTMLElement>(ROWS)) {
    const key = rowKey(row);
    if (!key) continue;
    if (row.classList.contains('note')) {
      const accepted = waiverOf(waivers, key) !== undefined;
      row.toggleAttribute('data-waived', accepted);
      if (accepted && row.dataset.element !== undefined) {
        row.dataset.waivedElement = row.dataset.element;
        delete row.dataset.element;
      } else if (!accepted && row.dataset.waivedElement !== undefined) {
        row.dataset.element = row.dataset.waivedElement;
        delete row.dataset.waivedElement;
      }
    }
    if (row.querySelector('.waiver')) continue;
    (row.querySelector(':scope > div') ?? row).append(waiverControl(ctx, key));
  }
}

export function mountWaivers(ctx: EditorContext): void {
  const { main, store, slug } = ctx;
  const load = (): void => {
    void getWaivers(slug).then((answer) => {
      if (answer.ok) store.set({ waivers: answer.body.waivers });
    });
  };
  load();
  // An edit can rename elements (ADR 0052): the server answers the waivers by the new ids.
  store.subscribe((state, previous) => {
    if (state.applied !== previous.applied) load();
  });
  const region = main.querySelector<HTMLElement>('[data-shell="checks"]');
  if (!region) return;
  let queued = false;
  const again = (): void => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      decorateRows(ctx, region);
    });
  };
  // The list is swapped as a whole when the state changes or a full check ends.
  new MutationObserver(again).observe(region, { childList: true, subtree: true });
  store.subscribe((state, previous) => {
    if (state.waivers !== previous.waivers) again();
  });
  again();
}
