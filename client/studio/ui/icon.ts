// Icons made by the page's scripts: the same markup as `icon` of `src/studio/pages/icons/icon.ts`,
// pointing to the sprite the page already carries. The control an icon sits in carries the name.

import type { IconName } from '../../../src/studio/pages/icons/paths.ts';

const SVG = 'http://www.w3.org/2000/svg';

/** One icon, hidden from assistive technology. */
export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'k-icon');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

/**
 * A button that shows only an icon: `.k-icon-btn`, with `name` as its accessible name and its
 * tooltip (anti-slop 5.5).
 */
export function iconButton(name: IconName, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'k-icon-btn';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(icon(name));
  return button;
}
