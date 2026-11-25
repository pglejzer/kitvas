// "This item" (ADR 0072): the inspect asked with `scope=item` and a copy's path answers for the
// item's own class (`plans__card--pro`), the class a style edit in that scope writes. Its rows
// show the item rule's value where that rule sets the property, else the value every item
// shares. A shared value names its class (the panel says it is for all items) but no part of a
// shorthand, and the widths and states are the item rule's own: a write in this scope goes into
// the item's rule, never into the shared one, so nothing it reads may stand in the shared rule.

import { itemClassAt } from '../domain/list/item-class.ts';
import { readRule, scssOverrides, varKindOf } from '../domain/style/apply-scss.ts';
import { type SourceInput, styleSource } from '../domain/style/source.ts';
import {
  type Refusal,
  type RuleView,
  STYLE_PROPERTIES,
  type StyleProperty,
  type StyleSource,
} from '../domain/types.ts';
import type { InspectView } from './inspect.ts';

/**
 * The inspect's `itemScope` (`InspectSchema`): the item's own class for the copy at `path`, and
 * whether the element's `className` gives it already; or why the item can have none.
 */
export type ItemScope =
  | { className: string; inTsx: boolean; path: number[] }
  | { refused: Refusal };

/** What the scope reads besides the view: the element in its text, the section SCSS, the rows. */
export type ItemRead = {
  text: string;
  /** The offset of the element's `<`. */
  at: number;
  /** The copy the item is (ADR 0060); without one the item cannot be named. */
  path: readonly number[] | undefined;
  format: 'scss' | 'tailwind';
  scss: string | undefined;
  /** The input the view's rows were read with. */
  input: Omit<SourceInput, 'property'>;
};

function scopeOf(view: InspectView, read: ItemRead): ItemScope {
  if (read.format === 'tailwind') return { refused: 'utility' };
  if (view.list === null) return { refused: 'not-list-item' };
  const shared = view.styleClass;
  if (shared === null || !shared.exists) return { refused: 'no-classname' };
  const path = [...(read.path ?? [])];
  const found = itemClassAt(read.text, read.at, path, shared.className);
  if (typeof found === 'string') return { refused: found };
  return { className: found.className, inTsx: found.inTsx, path };
}

/** The item rule's source where it holds the property; else the shared one, without its part. */
function sourceOf(own: StyleSource, shared: StyleSource): StyleSource {
  if (own.kind === 'scss') return own;
  if (shared.kind !== 'scss') return shared;
  const { className, value, offKit } = shared;
  return { kind: 'scss', className, value, offKit };
}

/**
 * The view read for the item's own class when the element and the copy give one (`itemScope`
 * says which); else the view as it is, with the reason in `itemScope`.
 */
export function itemScoped(view: InspectView, read: ItemRead): InspectView {
  const scope = scopeOf(view, read);
  if ('refused' in scope) return { ...view, itemScope: scope };
  const { className } = scope;
  const found = read.scss === undefined ? null : readRule(read.scss, className);
  const rule: RuleView | null = found === null || found === 'ambiguous' ? null : found;
  const styles = Object.fromEntries(
    STYLE_PROPERTIES.map((property) => [
      property,
      sourceOf(styleSource({ ...read.input, rule, property }), view.styles[property]),
    ]),
  ) as Record<StyleProperty, StyleSource>;
  const overrides: InspectView['overrides'] =
    rule === null || read.scss === undefined
      ? []
      : scssOverrides(read.scss, className, varKindOf(read.input.tokenGroups)).map((each) => ({
          ...each,
          utility: null,
        }));
  return {
    ...view,
    styleClass: { className, exists: true },
    scss:
      view.scss === null
        ? null
        : {
            ...view.scss,
            rule: found !== null,
            declarations: (rule?.declarations ?? []).map(({ property, value, offKit }) => ({
              property,
              value,
              offKit,
            })),
            nested: rule?.nested ?? [],
          },
    styles,
    overrides,
    itemScope: scope,
  };
}
