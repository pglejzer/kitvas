// The kit catalog as data: colour swatch rules, components grouped by category.

import {
  CATEGORIES,
  cssVarName,
  type FlatToken,
  formatTokenValue,
  type KitComponent,
} from '../../kit/index.ts';
import type { CodeView, CompareLevel, OutdatedEntry, ReadReason } from './kit-status.ts';

export type PropRow = {
  name: string;
  type: string;
  values: string;
  default: string;
  required: boolean;
  deprecated: boolean;
};

export type ComponentRow = {
  name: string;
  description: string;
  deprecated: boolean;
  props: PropRow[];
  examples: { title: string; code: string; reference?: string }[];
  a11y: string[];
  /** A `code` kit verified as it is now: the strongest comparison of this component. */
  level?: CompareLevel;
  /** Why a `read` component was not compared. */
  why?: ReadReason;
  /** A `code` kit: why this component is out of date with its project. */
  outdated?: OutdatedEntry['reason'];
};

export type CategoryGroup = { category: string; components: ComponentRow[] };

/** The part a kit's page shows: the one the address asks for when the kit has it, else its first. */
export function shownPart(ids: readonly string[], asked: string | undefined): string | undefined {
  return asked !== undefined && ids.includes(asked) ? asked : ids[0];
}

/** One rule per colour token, for the page's own `<style nonce>` block (no inline styles). */
export function swatchRules(tokens: FlatToken[]): string {
  return tokens
    .filter((token) => token.type === 'color')
    .map((token) => {
      const name = cssVarName(token.path);
      return `.kit-swatch[data-token="${name}"] { background: ${formatTokenValue(token)}; }`;
    })
    .join('\n');
}

function componentRow(component: KitComponent, code: CodeView | undefined): ComponentRow {
  const level = code?.levels[component.name];
  const outdated = code?.outdated[component.name];
  const why = code?.reasons[component.name];
  return {
    name: component.name,
    description: component.description,
    deprecated: component.deprecated,
    props: component.props.map((prop) => ({
      name: prop.name,
      type: prop.type,
      values: prop.values?.join(', ') ?? '',
      default: prop.default === undefined ? '' : String(prop.default),
      required: prop.required === true,
      deprecated: prop.deprecated === true,
    })),
    examples: component.examples.map(({ title, code, reference }) => ({
      title,
      code,
      ...(reference === undefined ? {} : { reference }),
    })),
    a11y: component.a11y,
    ...(level === undefined ? {} : { level }),
    ...(why === undefined ? {} : { why }),
    ...(outdated === undefined ? {} : { outdated }),
  };
}

/**
 * Components by category in the contract's order; a category with none is left out. `code` carries
 * the levels and the stale components of a `code` kit; any other kit passes none.
 */
export function groupComponents(
  components: KitComponent[],
  code?: CodeView | undefined,
): CategoryGroup[] {
  return CATEGORIES.map((category) => ({
    category,
    components: components
      .filter((component) => component.category === category)
      .map((component) => componentRow(component, code)),
  })).filter((group) => group.components.length > 0);
}
