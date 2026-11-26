// The lens pill at the canvas's top left (redesign spec, goal 9; plan 19, task 1; mock v10 lines 125
// to 135, 164 to 166 and 831 to 834): a quiet "Lens" caption and a button per lens, the one that is
// on pressed; Checks and Changes carry a count. Kit and Changes need Edit: outside it they are off,
// with a title that says why. When more pins exist than a frame draws, the pressed button's title
// says how many were left out. The pill only asks (`choose`); `mount.ts` sets the lens. It shows in
// Preview and in Edit. A toolbar: the arrow keys, Home and End move between its buttons.

import { MAX_PINS } from '../../channel/lens-protocol.ts';
import { el } from '../edit/props/controls/controls.ts';
import { text } from '../edit/texts.ts';
import { LENSES, type LensId, lensAllowed } from './lens.ts';

export type LensCounts = { checks: number; changes: number };

export type PillView = {
  lens: LensId;
  editing: boolean;
  counts: LensCounts;
  /** Pins the frames were not sent, past `MAX_PINS` (the most of any card). */
  left: number;
};

/** One button as the pill draws it. */
export type ButtonView = {
  id: LensId;
  label: string;
  pressed: boolean;
  /** Kit and Changes outside Edit: it says why, and a click does nothing. */
  off: boolean;
  /** The count after the label; `''` for none. */
  count: string;
  title: string;
};

export function lensLabel(id: LensId): string {
  switch (id) {
    case 'design':
      return text('lens.design');
    case 'kit':
      return text('lens.kit');
    case 'checks':
      return text('lens.checks');
    case 'why':
      return text('lens.why');
    case 'changes':
      return text('lens.changes');
  }
}

const countOf = (id: LensId, counts: LensCounts): number =>
  id === 'checks' ? counts.checks : id === 'changes' ? counts.changes : 0;

/** What each button shows: pressed, off, its count and its title. Pure. */
export function buttonViews(view: PillView): ButtonView[] {
  return LENSES.map((id): ButtonView => {
    const label = lensLabel(id);
    const off = !lensAllowed(id, view.editing);
    const pressed = id === view.lens && !off;
    const count = countOf(id, view.counts);
    let title = '';
    if (off) title = text('lens.needsEdit', { lens: label });
    else if (pressed && view.left > 0)
      title = text('lens.left', { left: view.left, max: MAX_PINS });
    return { id, label, pressed, off, count: count > 0 ? String(count) : '', title };
  });
}

export type Pill = { render(view: PillView): void };

type Parts = { button: HTMLButtonElement; count: HTMLElement };

/** The key a toolbar's focus moves by: the next button, the one before, the first or the last. */
function moved(key: string, at: number, length: number): number | null {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (at + 1) % length;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (at - 1 + length) % length;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return null;
}

export function mountPill(host: HTMLElement, choose: (lens: LensId) => void): Pill {
  const caption = el('span', 'pill-lens-cap', text('lens.label'));
  // The toolbar's own name says it; the caption is for the eye.
  caption.setAttribute('aria-hidden', 'true');
  const parts = new Map<LensId, Parts>();
  for (const id of LENSES) {
    const button = el('button', 'k-btn pill-lens-opt');
    button.type = 'button';
    button.dataset.lensSet = id;
    const label = lensLabel(id);
    const name = el('span', 'pill-lens-name', label);
    // The bold width is kept for the label (`lens.ts` of the skin): pressing moves nothing.
    name.dataset.text = label;
    const count = el('span', 'pill-num');
    button.append(name, count);
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') !== 'true') choose(id);
    });
    parts.set(id, { button, count });
  }
  const buttons = [...parts.values()].map((part) => part.button);
  host.replaceChildren(caption, ...buttons);
  host.addEventListener('keydown', (event) => {
    const at = buttons.findIndex((button) => button === document.activeElement);
    const next = at < 0 ? null : moved(event.key, at, buttons.length);
    if (next === null) return;
    event.preventDefault();
    buttons[next]?.focus();
  });

  return {
    render(view) {
      const views = buttonViews(view);
      // One button takes the Tab key: the pressed one, else the first.
      const tabbed = views.find((one) => one.pressed)?.id ?? 'design';
      for (const one of views) {
        const part = parts.get(one.id);
        if (!part) continue;
        const { button, count } = part;
        button.setAttribute('aria-pressed', String(one.pressed));
        if (one.off) button.setAttribute('aria-disabled', 'true');
        else button.removeAttribute('aria-disabled');
        if (one.title === '') button.removeAttribute('title');
        else button.title = one.title;
        if (count.textContent !== one.count) count.textContent = one.count;
        button.tabIndex = one.id === tabbed ? 0 : -1;
      }
    },
  };
}
