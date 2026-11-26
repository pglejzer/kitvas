// What the handles read of the page (ADR 0059): the selected element's box, padding, display and
// children for `spotsFor`, and the lengths a handle's drag starts from. Reads only, in the frame's
// viewport pixels: `spots.ts` decides where the handles go and `handles.ts` draws them.

import { boxOf } from '../../page/rect.ts';
import { MAX_GAPS, type Side, type Spot, spotsFor } from './spots.ts';

/** A computed length in pixels; 0 for a value that is no number. */
export const px = (value: string): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** What a content-box element's CSS size leaves out on one axis: its padding and borders. */
export function aroundOf(style: CSSStyleDeclaration, sides: readonly [Side, Side]): number {
  if (style.boxSizing === 'border-box') return 0;
  let sum = 0;
  for (const side of sides) {
    sum += px(style.getPropertyValue(`padding-${side}`));
    sum += px(style.getPropertyValue(`border-${side}-width`));
  }
  return sum;
}

/** Every handle of `element` as the page lays it out; `scale`: frame pixels per screen pixel. */
export function readSpots(element: Element, scale: number): Spot[] {
  const style = getComputedStyle(element);
  const side = (name: Side): number => px(style.getPropertyValue(`padding-${name}`));
  const padding = {
    top: side('top'),
    right: side('right'),
    bottom: side('bottom'),
    left: side('left'),
  };
  const children = [...element.children]
    .map(boxOf)
    .filter((box) => box.width > 0 || box.height > 0)
    .slice(0, MAX_GAPS + 1);
  return spotsFor({ box: boxOf(element), padding, display: style.display, children, scale });
}
