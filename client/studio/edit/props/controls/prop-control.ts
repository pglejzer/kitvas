// The control a component prop gets in Properties (plan 18f, task 2; spec S4.6 item 3): an enum
// as option chips (a long one as a list), a boolean as a switch, a text or a number as a field,
// and a prop the tag sets by code as a locked chip with the expression in it. Pure, so a test runs
// it on plain data; `rows.ts` draws it.

import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';

/** An enum with more values than this is a list: a row of chips would take several lines. */
export const MAX_CHIPS = 6;

export type WrittenProp = Inspect['props'][number];

/** What the panel knows of a prop: the catalog's type and values, and what the tag writes. */
export type PropFacts = {
  /** `enum`, `boolean`, `string`, `number` from the catalog, else the written literal's kind. */
  type: string;
  /** An enum's values, in the catalog's order. */
  values?: readonly string[] | undefined;
  /** The prop as the tag writes it; left out when the tag does not write it. */
  written?: WrittenProp | undefined;
};

export type PropControl =
  | { kind: 'chips'; options: string[] }
  | { kind: 'list'; options: string[] }
  | { kind: 'switch' }
  | { kind: 'field'; type: 'string' | 'number' }
  | { kind: 'code'; text: string }
  | { kind: 'static' };

/** The control of one prop. An expression wins over the type: code is never edited here. */
export function controlOf(prop: PropFacts): PropControl {
  if (prop.written?.kind === 'expr') return { kind: 'code', text: prop.written.source.trim() };
  if (prop.type === 'enum') {
    const options = [...(prop.values ?? [])];
    if (options.length === 0) return { kind: 'static' };
    return options.length <= MAX_CHIPS ? { kind: 'chips', options } : { kind: 'list', options };
  }
  if (prop.type === 'boolean') return { kind: 'switch' };
  if (prop.type === 'string' || prop.type === 'number') return { kind: 'field', type: prop.type };
  return { kind: 'static' };
}
