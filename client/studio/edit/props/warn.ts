// Findings before a write (spec 4c, goal 5; plan 16, task B): a colour or size option that would
// fail a live check for the selected element gets a sign in its picker before it is chosen. The
// option's value is resolved the way a browser reads it (`rgb(…)`, `px`) and handed to task C's
// `pickerWarning`, which compares it with the element's accessibility card.

import type { StyleProperty } from '../../../../src/edit/index.ts';
import type { A11yCard } from '../../../channel/live-protocol.ts';
import { pickerWarning } from '../live/warn.ts';
import { text } from '../texts.ts';
import { KIND } from './kinds.ts';

/** Reads a CSS value as the browser resolves it; `null` when it cannot. Replaceable in tests. */
export type Resolve = (kind: 'color' | 'dimension', css: string) => string | null;

/**
 * The sign an option shows, as words for its label; `null` for none. Only colours and sizes are
 * checked, and only while the element's card is known.
 */
export function optionWarning(
  property: StyleProperty,
  css: string,
  card: A11yCard | null,
  resolve: Resolve,
): string | null {
  const kind = KIND[property];
  if (card === null || (kind !== 'color' && kind !== 'dimension')) return null;
  const value = resolve(kind, css);
  const sign = pickerWarning({ property, value, card });
  return sign === null ? null : text(`props.warn.${sign}`);
}

const resolved = new Map<string, string | null>();
let probe: HTMLElement | null = null;

/** A hidden element of the studio page that resolves values; never shown, never in a frame. */
function probeOf(): HTMLElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (probe?.isConnected) return probe;
  probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.position = 'absolute';
  probe.style.display = 'block';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  document.body.append(probe);
  return probe;
}

/** The page's own resolution: a colour as `rgb(…)`, a length in pixels; a variable is unknown. */
export const resolveCss: Resolve = (kind, css) => {
  const key = `${kind}|${css}`;
  if (resolved.has(key)) return resolved.get(key) ?? null;
  const node = probeOf();
  let value: string | null = null;
  if (node && !css.includes('var(')) {
    const property = kind === 'color' ? 'color' : 'width';
    node.style.setProperty(property, '');
    node.style.setProperty(property, css);
    // A value the browser does not take leaves the property empty.
    if (node.style.getPropertyValue(property) !== '') {
      value = getComputedStyle(node).getPropertyValue(property) || null;
    }
    node.style.setProperty(property, '');
  }
  resolved.set(key, value);
  return value;
};
