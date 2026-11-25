// The Kit lens's pins (redesign spec goal 9, plan 19 task 2): from what `GET …/kit-lens` answers,
// the spacing token of a container, "Off kit: <value> · nearest <token>" and "Could be
// <Component>". Pure: no DOM. The words come from text keys; the frame writes the texts with
// `textContent`, so nothing here is HTML.

import type { StyleProperty, TokenOption } from '../../../../src/edit/index.ts';
import type { KitLens } from '../../../../src/studio/api/edit/kit-lens-schemas.ts';
import {
  type LensPin,
  MAX_PIN_CODE,
  MAX_PIN_KEY,
  MAX_PIN_TEXT,
} from '../../../channel/lens-protocol.ts';
import { nearestToken } from '../../edit/props/kit-value.ts';
import { tokenNameOf } from '../../edit/props/stepper.ts';
import { PROPERTIES, tokensFor } from '../../edit/props/steps.ts';
import { text } from '../../edit/texts.ts';

const SEP = ' · ';

const cut = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

/** `12px` is `12`; another unit stays as written. */
const bare = (css: string): string => /^(-?\d+(?:\.\d+)?)px$/.exec(css.trim())?.[1] ?? css.trim();

/** A short stable hash of an id, for a key too long to carry it. */
function hashOf(value: string): string {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619) >>> 0;
  return hash.toString(36);
}

/** `kit:<id>:<what>`; a long id is replaced by its hash so the key fits and stays unique. */
function keyOf(id: string, what: string): string {
  const key = `kit:${id}:${what}`;
  return key.length <= MAX_PIN_KEY ? key : `kit:${hashOf(id)}:${what}`;
}

const styleProperty = (name: string): StyleProperty | null =>
  PROPERTIES.find((property) => property === name) ?? null;

/** The kit's token nearest to a raw value of the property, by the property's own scale. */
function nearestOf(
  property: string,
  value: string,
  tokens: readonly TokenOption[],
): TokenOption | null {
  const known = styleProperty(property);
  return known === null ? null : nearestToken(value, tokensFor(tokens, known));
}

/** The pins of the Kit lens, in the order of the elements; `null` (nothing read) gives none. */
export function kitPins(report: KitLens | null, tokens: readonly TokenOption[]): LensPin[] {
  if (report === null) return [];
  const pins: LensPin[] = [];
  for (const element of report.elements) {
    for (const spacing of element.spacing) {
      pins.push({
        key: keyOf(element.id, spacing.property),
        id: element.id,
        kind: 'kit',
        tone: 'plain',
        code: cut(spacing.property, MAX_PIN_CODE),
        text: cut(`${spacing.token}${SEP}${bare(spacing.value)}`, MAX_PIN_TEXT),
      });
    }
    element.offKit.forEach((off, index) => {
      const near = nearestOf(off.property, off.value, tokens);
      const nearest = near === null ? '' : `${SEP}${text('lens.kit.nearest')} ${tokenNameOf(near)}`;
      pins.push({
        key: keyOf(element.id, `off${index}`),
        id: element.id,
        kind: 'kit',
        tone: 'review',
        text: cut(`${text('lens.kit.off')}: ${off.value}${nearest}`, MAX_PIN_TEXT),
      });
    });
    if (element.suggest !== null) {
      pins.push({
        key: keyOf(element.id, 'suggest'),
        id: element.id,
        kind: 'kit',
        tone: 'plain',
        text: cut(`${text('lens.kit.could')} ${element.suggest}`, MAX_PIN_TEXT),
      });
    }
  }
  return pins;
}
