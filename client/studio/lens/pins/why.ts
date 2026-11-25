// The Why lens's pins (redesign spec, goal 9; plan 19, task 1): one card pin per section that has
// reasons, on the section's element: the first words of its first reason in bold (`splitLead`, as
// the Why pane sets them), the rest as the quiet second line. A section of the layout that has an
// element and no reasons yet gets "No reasons yet"; a section the reasons name no element for gets
// no pin. Pure.

import {
  fit,
  isPinKey,
  type LensPin,
  MAX_PIN_SMALL,
  MAX_PIN_TEXT,
} from '../../../channel/lens-protocol.ts';
import { text } from '../../edit/texts.ts';
import type { WhyReport } from '../../edit/why/entries.ts';
import { splitLead } from '../../edit/why/lead.ts';

/** A section of the layout (`structure.sections`): its id and the element that renders it. */
export type SectionRef = { id: string; element: string | null };

/** `order-summary` is `OrderSummary`, as the reasons name the section (`why/entries.ts`). */
const pascal = (id: string): string =>
  id
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

/** `why:<Section>`: a click finds the section's card by it; `why#<n>` for a name no key can carry. */
export function whyKey(section: string, index: number): string {
  const key = `why:${section}`;
  return isPinKey(key) ? key : `why#${index}`;
}

/** The pins of the Why lens, the sections of the reasons first, then the layout's without any. */
export function whyPins(report: WhyReport, sections: readonly SectionRef[]): LensPin[] {
  const pins: LensPin[] = [];
  const none = (key: string, id: string): LensPin => ({
    key,
    id,
    kind: 'why',
    tone: 'plain',
    text: text('lens.why.none'),
  });
  const named = new Set<string>();
  report.sections.forEach((one, index) => {
    named.add(one.section);
    // A section the reasons name no element for has no pin (spec goal 9).
    if (one.element === null) return;
    const key = whyKey(one.section, index);
    const line = one.lines.find((each) => each.trim() !== '');
    if (line === undefined) {
      pins.push(none(key, one.element));
      return;
    }
    const { lead, rest } = splitLead(line);
    const small = fit(rest, MAX_PIN_SMALL);
    pins.push({
      key,
      id: one.element,
      kind: 'why',
      tone: 'plain',
      text: fit(lead === '' ? one.section : lead, MAX_PIN_TEXT),
      ...(small === '' ? {} : { small }),
    });
  });
  sections.forEach((one, index) => {
    const name = pascal(one.id);
    if (one.element === null || named.has(name)) return;
    named.add(name);
    pins.push(none(whyKey(name, report.sections.length + index), one.element));
  });
  return pins;
}
