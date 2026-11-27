// The kit catalog as data: colour swatch rules, components grouped by category.

import {
  CATEGORIES,
  cssVarName,
  type FlatToken,
  formatTokenValue,
  type KitComponent,
} from '../../kit/index.ts';

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

function componentRow(component: KitComponent): ComponentRow {
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
  };
}

/** Components by category in the contract's order; a category with none is left out. */
export function groupComponents(components: KitComponent[]): CategoryGroup[] {
  return CATEGORIES.map((category) => ({
    category,
    components: components.filter((component) => component.category === category).map(componentRow),
  })).filter((group) => group.components.length > 0);
}
