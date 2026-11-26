// "Dismiss this finding" (spec 4c, goal 6; the person's word for a waiver): an icon button in the
// head of a finding, and under it, inside the card, a short row: "Why dismiss it?", a few quick
// reasons that each save the waiver at once, and "Other…" for a reason of the person's own. A
// dismissed finding shows "Dismissed: <reason>" and Restore. The control follows `store.waivers`.
// The Checks cards and the Live section's rows share it; the Live rows build their own icon button,
// a card adopts the one the server wrote (`options.trigger`).

import { iconButton } from '../../ui/icon.ts';
import { postWaiver, postWithdraw } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import {
  MAX_REASON,
  QUICK_REASON_KEYS,
  reasonRequest,
  type WaiverKey,
  waiverOf,
} from './waiver-rules.ts';

/** The class every panel has: a row of the Checks list gets one only once. */
export const CONTROL = 'checks-waiver';

export type Dismissal = {
  /** The icon button that opens and closes the row. Hidden once the finding is dismissed. */
  trigger: HTMLButtonElement;
  /** The row, the form or the dismissed line: empty while closed. */
  panel: HTMLElement;
};

type Mode = 'closed' | 'reasons' | 'form';

function smallButton(label: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', 'k-btn k-btn-sm k-btn-soft', label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

export function dismissControl(
  ctx: EditorContext,
  finding: WaiverKey,
  options: { trigger?: HTMLButtonElement; showReason?: boolean } = {},
): Dismissal {
  const { store, slug } = ctx;
  const trigger = options.trigger ?? iconButton('eye-off', text('waiver.accept'));
  const panel = el('div', CONTROL);
  let mode: Mode = 'closed';
  let connected = false;

  const failed = (code: string | null): string =>
    text(code === 'WAIVER_LIMIT' ? 'waiver.full' : 'waiver.failed');

  function close(giveFocusBack: boolean): void {
    mode = 'closed';
    render();
    if (giveFocusBack) trigger.focus();
  }

  /** Saves the waiver with this reason; `show` tells the person what went wrong. */
  function save(reason: string, show: (words: string) => void, again: () => void): void {
    const request = reasonRequest(finding, reason);
    if (!request.ok) {
      show(text(request.problem === 'empty' ? 'waiver.reasonEmpty' : 'waiver.reasonLong'));
      return;
    }
    void postWaiver(slug, request.body).then((answer) => {
      if (answer.ok) {
        mode = 'closed';
        store.set({ waivers: answer.body.waivers });
        return;
      }
      again();
      show(failed(answer.code));
    });
  }

  function reasons(): HTMLElement {
    const row = el('div', 'checks-dismiss-row');
    const error = el('span', 'k-fix checks-waiver-error');
    error.setAttribute('role', 'alert');
    const buttons: HTMLButtonElement[] = QUICK_REASON_KEYS.map((key) => {
      const words = text(key);
      const button = smallButton(words, () => {
        for (const one of buttons) one.disabled = true;
        save(
          words,
          (shown) => {
            error.textContent = shown;
          },
          () => {
            for (const one of buttons) one.disabled = false;
          },
        );
      });
      return button;
    });
    const other = smallButton(text('waiver.other'), () => {
      mode = 'form';
      render();
    });
    const label = el('span', 'checks-dismiss-label', text('waiver.reasonLabel'));
    row.append(label, ...buttons, other, error);
    queueMicrotask(() => buttons[0]?.focus());
    return row;
  }

  function form(): HTMLFormElement {
    const element = el('form', 'checks-waiver-form');
    const label = el('label', 'checks-waiver-label', text('waiver.reasonLabel'));
    const input = el('input', 'k-field');
    input.type = 'text';
    input.required = true;
    input.maxLength = MAX_REASON;
    label.append(input);
    const error = el('span', 'k-fix checks-waiver-error');
    error.setAttribute('role', 'alert');
    const submit = el('button', 'k-btn k-btn-sm k-btn-soft', text('waiver.save'));
    submit.type = 'submit';
    const cancel = smallButton(text('waiver.cancel'), () => close(true));
    const actions = el('span', 'checks-waiver-actions');
    actions.append(submit, cancel);
    element.append(label, actions, error);
    element.addEventListener('submit', (event) => {
      event.preventDefault();
      const show = (shown: string): void => {
        error.textContent = shown;
      };
      // An empty or long reason is told at once and not sent.
      if (!reasonRequest(finding, input.value).ok) {
        save(input.value, show, () => undefined);
        return;
      }
      submit.disabled = true;
      save(input.value, show, () => {
        submit.disabled = false;
      });
    });
    queueMicrotask(() => input.focus());
    return element;
  }

  function render(): void {
    panel.replaceChildren();
    const waiver = waiverOf(store.get().waivers, finding);
    trigger.hidden = waiver !== undefined;
    trigger.setAttribute('aria-expanded', mode !== 'closed' && !waiver ? 'true' : 'false');
    if (waiver) {
      const line = el('div', 'checks-dismiss-state');
      if (options.showReason !== false) {
        const said = text('waiver.accepted', { reason: waiver.reason });
        line.append(el('span', 'k-meta checks-waiver-state', said));
      }
      line.append(
        smallButton(text('waiver.withdraw'), () => {
          void postWithdraw(slug, finding).then((answer) => {
            if (answer.ok) store.set({ waivers: answer.body.waivers });
          });
        }),
      );
      panel.append(line);
      return;
    }
    if (mode === 'reasons') panel.append(reasons());
    else if (mode === 'form') panel.append(form());
  }

  trigger.addEventListener('click', () => {
    if (waiverOf(store.get().waivers, finding)) return;
    if (mode === 'closed') {
      mode = 'reasons';
      render();
    } else close(true);
  });
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || mode === 'closed') return;
    // The editor's own Escape (deselect, leave a tool) is not for this row.
    event.stopPropagation();
    close(true);
  };
  panel.addEventListener('keydown', onKey);
  trigger.addEventListener('keydown', onKey);

  // A control that was on the page and left it stops listening, so rebuilt lists leak nothing.
  const stop = store.subscribe((state, previous) => {
    if (panel.isConnected) connected = true;
    else if (connected) {
      stop();
      return;
    }
    if (state.waivers !== previous.waivers) render();
  });
  render();
  return { trigger, panel };
}
