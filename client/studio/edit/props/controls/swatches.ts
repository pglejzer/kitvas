// A colour row's kit colours (plan 18f, task 2; spec S4.6 item 5): each colour token as a swatch
// (the shared `.k-swatch` in a button of the target size), named by its token and marked when the
// source names it. One tab stop for the row: the arrow keys move between the swatches, a click or
// Enter takes one, pointing at one previews it. The typed field stays under the row (`style-
// controls.ts`), so a kit with more colours than are shown loses none of them.

import type { TokenOption } from '../../../../../src/edit/index.ts';
import { addedMark } from '../../../ui/added-mark.ts';
import { text } from '../../texts.ts';
import { tokenNameOf } from '../values/stepper.ts';
import { varOf } from '../values/steps.ts';
import { el } from './controls.ts';

/** At most this many swatches: the field lists every colour of the kit. */
export const MAX_SWATCHES = 24;

export function swatchRow(options: {
  label: string;
  tokens: readonly TokenOption[];
  /** The value the source holds; a `var()` of a token marks that swatch. */
  current: string | null;
  warn?: (token: TokenOption) => string | null;
  /** The mark's words for a token the project added (`props.added`); left out: no mark. */
  note?: string;
  onPick(token: TokenOption): void;
  onPreview?(token: TokenOption | null): void;
}): HTMLElement {
  const group = el('div', 'props-swatches');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', text('props.swatches', { property: options.label }));
  const named = options.current === null ? null : varOf(options.current);
  const shown = options.tokens.slice(0, MAX_SWATCHES);
  const pressed = shown.findIndex((token) => token.var === named);
  const buttons = shown.map((token, index) => {
    const button = el('button', 'props-swatch');
    button.type = 'button';
    button.dataset.control = `swatch-${token.var}`;
    const name = tokenNameOf(token);
    const warning = options.warn?.(token) ?? null;
    button.setAttribute('aria-label', name);
    button.title = warning === null ? `${name} (${token.css})` : `${name}: ${warning}`;
    if (warning !== null) button.setAttribute('aria-description', warning);
    button.setAttribute('aria-pressed', String(index === pressed));
    button.tabIndex = index === Math.max(0, pressed) ? 0 : -1;
    const sample = el('span', 'k-swatch');
    sample.style.backgroundColor = token.css;
    button.append(sample);
    if (token.added === true && options.note !== undefined) button.append(addedMark(options.note));
    button.addEventListener('click', () => {
      if (token.var !== named) options.onPick(token);
    });
    button.addEventListener('pointerenter', () => options.onPreview?.(token));
    button.addEventListener('pointerleave', () => options.onPreview?.(null));
    return button;
  });
  group.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    const from = buttons.findIndex((button) => button === document.activeElement);
    const next = buttons[Math.min(buttons.length - 1, Math.max(0, from + step))];
    if (next === undefined) return;
    event.preventDefault();
    for (const button of buttons) button.tabIndex = button === next ? 0 : -1;
    next.focus();
  });
  group.append(...buttons);
  return group;
}
