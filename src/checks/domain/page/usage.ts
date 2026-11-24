// The ds check of kit components as the page renders them: names, props and values of the catalog.

import { elementPlace, type IdEntry } from '../code/ids.ts';
import type { Message, RawFinding } from '../findings/finding.ts';

/** One kit component the draft rendered. Props that are not plain values are `null`. */
export type UsageRecord = {
  id: string;
  /** The kit's export name. */
  component: string;
  props: Record<string, string | number | boolean | null>;
};

/** The part of a catalog entry these rules read. */
export type CatalogComponent = {
  name: string;
  /** The kit's category: `action`, `input`, `feedback`… */
  category: string;
  props: {
    name: string;
    type: string;
    values?: string[] | undefined;
    required?: boolean | undefined;
    /** The value the component uses when the prop is not passed. */
    default?: string | number | boolean | undefined;
  }[];
  styling: string[];
};

export type UsageInput = {
  usage: UsageRecord[];
  catalog: CatalogComponent[];
  ids: IdEntry[];
  state: string;
  width: number;
};

/** Props any element may take without the catalog listing them. */
const OPEN_PROP = /^(?:aria-|data-)|^id$/;

export function usageFindings({ usage, catalog, ids, state, width }: UsageInput): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const record of usage) {
    const report = (rule: string, message: Message, hint: Message): void => {
      findings.push({
        check: 'ds',
        rule,
        severity: 'fix',
        ...elementPlace(ids, record.id),
        element: record.id,
        message,
        hint,
        states: [state],
        widths: [width],
      });
    };

    const entry = catalog.find((candidate) => candidate.name === record.component);
    if (!entry) {
      report(
        'ds/not-in-catalog',
        { key: 'checkRule.notInCatalog', params: { name: record.component } },
        { key: 'checkHint.notInCatalog', params: {} },
      );
      continue;
    }

    const component = entry.name;
    const known = new Map(entry.props.map((prop) => [prop.name, prop]));
    for (const [name, value] of Object.entries(record.props)) {
      const prop = known.get(name);
      if (!prop) {
        if (entry.styling.includes(name) || OPEN_PROP.test(name)) continue;
        report(
          'ds/unknown-prop',
          { key: 'checkRule.unknownProp', params: { component, prop: name } },
          { key: 'checkHint.unknownProp', params: { component } },
        );
        continue;
      }
      const comparable = value !== null && typeof value !== 'boolean';
      if (
        prop.type === 'enum' &&
        prop.values &&
        comparable &&
        !prop.values.includes(String(value))
      ) {
        report(
          'ds/bad-value',
          {
            key: 'checkRule.badValue',
            params: { component, prop: name, value: String(value), values: prop.values.join(', ') },
          },
          { key: 'checkHint.badValue', params: {} },
        );
      }
    }
    for (const prop of entry.props) {
      if (!prop.required || prop.name in record.props) continue;
      report(
        'ds/missing-prop',
        { key: 'checkRule.missingProp', params: { component, prop: prop.name } },
        { key: 'checkHint.missingProp', params: { component } },
      );
    }
  }
  return findings;
}
