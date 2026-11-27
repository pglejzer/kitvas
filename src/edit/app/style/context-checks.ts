// What an op of a width, a state or an option must hold before it is applied (spec 4c, goals 1 and
// 2): its width is one of the kit's breakpoints, its option a value the version has (ADR 0082),
// and its property is not one a prop of the kit component covers. A prop has one value for every
// width and state, so a value written beside it for one width would fight it (ADR 0050); the
// panel says so and offers Ask Claude.

import type { DraftOption } from '../../../shared/index.ts';
import {
  type ContextOption,
  isBaseContext,
  type SimpleOp,
  type StyleContext,
} from '../../domain/ops.ts';
import { type SourceInput, styleSource, tokenGroupsOf } from '../../domain/style/source.ts';
import { contextOfVariants, ownProperties, splitUtility } from '../../domain/style/utilities.ts';
import { readTag } from '../../domain/tsx/apply-tsx.ts';
import { isStyleProperty, type Refusal, type StyleProperty } from '../../domain/types.ts';
import { catalogComponent, tokenOptions } from '../edit-state.ts';
import { breakpointsOf, kitOf, locate, optionsOf, type Work } from '../request-state.ts';

/** The context an op writes and the properties it sets there; `null` for an op of the base. */
function written(op: SimpleOp): { context: StyleContext; properties: StyleProperty[] } | null {
  if (op.op === 'setStyle' || op.op === 'removeStyle') {
    if (op.context === undefined) return null;
    // Taking a value away is never refused for the prop: it only makes the prop the one source.
    const { property } = op;
    const sets = op.op === 'setStyle' && isStyleProperty(property);
    return { context: op.context, properties: sets && isStyleProperty(property) ? [property] : [] };
  }
  if (op.op !== 'setUtility' || op.value === null) return null;
  const { variants, base } = splitUtility(op.value);
  const context = contextOfVariants(variants);
  return context === null ? null : { context, properties: ownProperties(base) };
}

/** The version has the option and the option has the value. */
const hasValue = (options: readonly DraftOption[], asked: ContextOption): boolean =>
  options.some(
    (option) => option.id === asked.id && option.values.some((one) => one.id === asked.value),
  );

/**
 * Why an op of a width, a state or an option is not applied: `not-breakpoint`, `invalid` for an
 * option or a value the version does not have (an op stored before the file changed),
 * `prop-covered`, or `null` when it may be. An op of the base is never refused here. The element
 * is found where the request's earlier ops left it; one that is not found is left to the op itself.
 */
export async function contextRefusal(work: Work, op: SimpleOp): Promise<Refusal | null> {
  const found = written(op);
  if (found === null) return null;
  const { context, properties } = found;
  if (isBaseContext(context)) return null;
  if (context.width !== null && !breakpointsOf(work).includes(context.width)) {
    return 'not-breakpoint';
  }
  if (context.option !== null && !hasValue(optionsOf(work), context.option)) return 'invalid';
  if (properties.length === 0) return null;

  const at = await locate(work, op.id);
  if (!('at' in at)) return null;
  const tag = readTag(at.text, at.at);
  const { loaded } = kitOf(work);
  // A part such as `Card.Header` takes none of the root's catalog props.
  const component =
    typeof tag === 'string' || tag.name.includes('.') ? null : catalogComponent(loaded, tag.name);
  if (typeof tag === 'string' || component === null) return null;
  const input: Omit<SourceInput, 'property'> = {
    component: { props: component.props },
    written: tag.props.map((prop) => prop.name),
    rule: null,
    classes: [],
    format: 'scss',
    tokenGroups: tokenGroupsOf(tokenOptions(loaded)),
  };
  const covered = properties.some(
    (property) => styleSource({ ...input, property }).kind === 'prop',
  );
  return covered ? 'prop-covered' : null;
}
