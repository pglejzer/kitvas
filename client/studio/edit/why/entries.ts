// The Why tab's data (spec 4d, goal 7), pure: the server's answer read from `unknown`, the entries
// in layout order with the state of each (written, missing, asked), and the body of a `why`
// request. The DOM is in `why.ts`.

import { isRecord } from '../../../../src/shared/values/guards.ts';
import { pascal } from '../../../../src/shared/values/names.ts';

export type WhySection = {
  section: string;
  element: string | null;
  lines: string[];
  guidelines: string[];
  stale: boolean;
};

/** GET `/api/v1/drafts/{slug}/why` (`WhySchema`). */
export type WhyReport = { sections: WhySection[]; missing: string[] };

/** `written`: has lines; `missing`: none yet; `asked`: none yet and a request waits for Claude. */
export type WhyItem = WhySection & { state: 'written' | 'missing' | 'asked' };

/** What the tab needs of a request: its kind, its status and its text. */
export type WhyRequest = { kind: string; status: string; text: string };

/** The strings of an array; `null` when it is no array or holds anything else. */
function strings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const one of value) {
    if (typeof one !== 'string') return null;
    out.push(one);
  }
  return out;
}

function sectionOf(raw: unknown): WhySection | null {
  if (!isRecord(raw)) return null;
  const { section, element, lines, guidelines, stale } = raw;
  const read = strings(lines);
  const named = strings(guidelines);
  if (typeof section !== 'string' || read === null || named === null) return null;
  if (typeof stale !== 'boolean') return null;
  if (element !== null && typeof element !== 'string') return null;
  return { section, element, lines: read, guidelines: named, stale };
}

/** The server's answer; `null` when it is not the shape the route promises. */
export function parseWhy(raw: unknown): WhyReport | null {
  if (!isRecord(raw) || !Array.isArray(raw.sections)) return null;
  const missing = strings(raw.missing);
  if (missing === null) return null;
  const sections: WhySection[] = [];
  for (const one of raw.sections) {
    const read = sectionOf(one);
    if (read === null) return null;
    sections.push(read);
  }
  return { sections, missing };
}

/** A `why` request for this section is waiting for Claude or being worked on. */
export function isAsked(requests: readonly WhyRequest[], section: string): boolean {
  return requests.some(
    (one) =>
      one.kind === 'why' &&
      one.text === section &&
      (one.status === 'waiting' || one.status === 'taken'),
  );
}

/**
 * One entry per section in the layout's order (`layout`: the section ids of the structure); a
 * section the layout does not name goes after them, in the order the server gave.
 */
export function itemsOf(
  report: WhyReport,
  requests: readonly WhyRequest[],
  layout: readonly string[],
): WhyItem[] {
  const written: WhyItem[] = report.sections.map((one) => ({ ...one, state: 'written' }));
  const missing: WhyItem[] = report.missing.map((section) => ({
    section,
    element: null,
    lines: [],
    guidelines: [],
    stale: false,
    state: isAsked(requests, section) ? 'asked' : 'missing',
  }));
  const order = layout.map(pascal);
  const place = (item: WhyItem): number => {
    const at = order.indexOf(item.section);
    return at < 0 ? order.length : at;
  };
  // `sort` is stable: sections the layout does not name keep the server's order.
  return [...written, ...missing].sort((a, b) => place(a) - place(b));
}

/** The body of a `why` request: the section's name is its text, its root element the target. */
export function whyRequestOf(item: Pick<WhyItem, 'section' | 'element'>): {
  kind: 'why';
  elements: string[];
  context: { width: null; state: null };
  text: string;
} {
  return {
    kind: 'why',
    elements: item.element === null ? [] : [item.element],
    context: { width: null, state: null },
    text: item.section,
  };
}
