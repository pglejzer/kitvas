// A style row of the properties panel (plan 13, task G; plan 15, task C): its control follows the
// property's kind (`style-controls.ts`). Stage 4c (spec goals 1 and 5): the row shows and writes
// the value at the edit context (a width, a state), says where the value comes from, offers
// "Remove for this width" and "Apply to all widths", and marks colour and size options that would
// fail a live check. A value a shorthand of the rule holds shows as its part, and the source names
// the shorthand; a side of a box or of a pair has no reset (ADR 0070). Plan 18f (task 2): a value
// off the kit says "Off kit" with "Use <token>" for the nearest token; the sentences that explain
// a row (where its value comes from, what the frame computes, why a pick asks Claude) are its
// label's tooltip, read by a screen reader too, except the short source words of a context.

import type { EditOp, Shorthand, StyleProperty, StyleValue } from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { isBase, sourceAt } from '../style/context-ops.ts';
import {
  heldBySides,
  opsForAll,
  readOnlyReason,
  ruleHeld,
  type StyleOptions,
  sharedText,
} from '../style/ops.ts';
import { text } from '../texts.ts';
import { lockedChip } from './chips.ts';
import {
  askCovered,
  contextActions,
  coveredAt,
  coveredWords,
  heldAt,
  heldNote,
  removeAll,
  sourceWords,
} from './context.ts';
import { el } from './controls.ts';
import { KIND } from './kinds.ts';
import { onKit } from './kit-value.ts';
import { type Env, explain, makeRow, resetButton } from './rows.ts';
import { kitHolds } from './state-held.ts';
import { tokenNameOf } from './stepper.ts';
import { tokensFor } from './steps.ts';
import {
  imageRow,
  keywordRow,
  propSelect,
  type RowLook,
  type Style,
  tokenRow,
} from './style-controls.ts';

export type { RowLook } from './style-controls.ts';

/**
 * The words of a class rule as a row's source: the rule, or the shorthand of it that holds the
 * value (ADR 0070), as in "from padding of .card".
 */
export function ruleSourceText(
  className: string,
  via: Shorthand | undefined,
  all?: number,
): string {
  // A rule shared by the items of a list: the row says how many it changes.
  if (all !== undefined) return text('props.source.scssAll', { className, count: all });
  if (via !== undefined) return text('props.source.shorthand', { shorthand: via, className });
  return text('props.source.scss', { className });
}

function sourceText(env: Env, property: StyleProperty): string {
  const { context } = env.state;
  const source = env.inspected.styles[property];
  // A prop holds one value for every width and state: it is the source in any context.
  if (source?.kind === 'prop') return text('props.source.prop', { prop: source.prop });
  if (!isBase(context)) {
    const words = sourceWords(sourceAt(env.inspected, property, context), context);
    return text(words.key, words.params);
  }
  if (source?.kind === 'scss') {
    const all = env.scope?.mode === 'all' ? env.scope.count : undefined;
    return ruleSourceText(source.className, source.via, all);
  }
  if (source?.kind === 'utility')
    return text('props.source.utility', { className: source.className });
  return text('props.source.kit');
}

/** What the elements hold for the row: one element's source, or the text they all share. */
function heldOf(
  env: Env,
  property: StyleProperty,
  single: boolean,
): { held: string | null; offKit: boolean; mixed: boolean } {
  const { inspected } = env;
  if (!isBase(env.state.context)) {
    const at = heldAt(env.views, property, env.state.context);
    // A Tailwind value is its class name, no CSS value: the row shows the computed one, as at
    // the base.
    return env.format === 'tailwind' && !at.mixed ? { ...at, held: null, offKit: false } : at;
  }
  if (!single) {
    const shared = sharedText(env.views, property);
    return shared === 'mixed'
      ? { held: null, offKit: true, mixed: true }
      : { held: shared.text, offKit: true, mixed: false };
  }
  const source = inspected.styles[property];
  if (source?.kind === 'prop') {
    const written = inspected.props.find((one) => one.name === source.prop);
    const held = written?.kind === 'literal' ? String(written.value.value) : null;
    return { held, offKit: false, mixed: false };
  }
  // The rule's own declaration, or the part of a shorthand that holds the property (ADR 0070).
  const rule = ruleHeld(inspected, property);
  return { held: rule?.value ?? null, offKit: rule?.offKit ?? false, mixed: false };
}

/** The value shown when the context sets none: what it inherits, else what the frame computes. */
function hintOf(env: Env, property: StyleProperty, single: boolean, computed: string): string {
  if (!single || isBase(env.state.context)) return computed;
  const source = sourceAt(env.inspected, property, env.state.context);
  return computed || (source.kind === 'below' ? source.value : '');
}

/**
 * "Off kit", and "Use <token>" for the nearest token of the property's scale on a row that
 * writes: an ordinary edit, previewed while pointed at. Nothing for a value on the kit.
 */
function offKitMarks(style: Style, writes: boolean): HTMLElement[] {
  const scale = tokensFor(style.env.tokens, style.property);
  const on = onKit(style.held, scale, style.env.tokens);
  if (on.kind !== 'offkit') return [];
  // A state, said in the review tone: the value is no kit token.
  const mark = el('span', 'k-chip props-offkit', text('props.offkit'));
  mark.dataset.tone = 'review';
  mark.title = text('props.offkit.title');
  const { nearest } = on;
  if (nearest === null || !writes) return [mark];
  const token = { token: nearest.var };
  const words = text('props.offkit.use', { token: tokenNameOf(nearest) });
  const use = el('button', 'k-btn props-act', words);
  use.type = 'button';
  use.dataset.control = 'use-nearest';
  use.title = text('props.offkit.useTitle', { token: nearest.path, value: nearest.css });
  use.addEventListener('click', () => style.set(token));
  use.addEventListener('pointerenter', () => style.preview(token));
  use.addEventListener('pointerleave', () => style.preview(null));
  return [mark, use];
}

/**
 * A style row: its control by the property's kind, the reset, the source and the marks. `look`
 * draws it as a second view of the property (Layout's human rows) or without a label (Radius).
 */
export function styleRow(env: Env, property: StyleProperty, look: RowLook = {}): HTMLElement {
  const { inspected } = env;
  const { context } = env.state;
  const base = isBase(context);
  const single = env.views.length === 1;
  const source = inspected.styles[property];
  const own = `style:${property}`;
  const key = look.key ?? own;
  // A refusal of the property shows on every view of it.
  const aliases = [
    ...(key === own ? [] : [own]),
    ...(single && source?.kind === 'prop' ? [`prop:${source.prop}`] : []),
  ];
  const row = makeRow(env, key, aliases, look.label ?? property);
  if (look.bare === true) {
    row.root.dataset.bare = '';
    row.label.classList.add('k-sr');
  }
  const computed = single ? (env.state.computed?.[property] ?? '') : '';
  const covered = single && coveredAt(inspected, property, context);
  // ADR 0055: the kit's own rule for this state wins over anything written here.
  const beaten = !covered && single && !base && kitHolds(env.state, property);
  const reason =
    single && !covered ? readOnlyReason(inspected, property, env.format, context) : null;
  const { held, offKit, mixed } = heldOf(env, property, single);
  // The context and the tokens go with every style op; at the base the ops are those of 4a.
  const options: StyleOptions = { format: env.format, context, tokens: env.tokens };
  const set = (value: StyleValue | null): void => {
    if (covered || beaten) {
      askCovered(env, property, value, covered ? 'prop-covered' : 'kit-state-wins');
      return;
    }
    const label = text(value === null ? 'props.label.resetStyle' : 'props.label.style', {
      property,
    });
    const watched = single && value !== null && source?.kind !== 'prop' ? property : undefined;
    const build = (now: readonly Inspect[]): EditOp[] =>
      value === null && !base
        ? (removeAll(now, property, context, options) ?? [])
        : opsForAll(now, property, value, options);
    env.commit(key, build, label, watched);
  };
  const hint = mixed ? text('props.mixed') : hintOf(env, property, single, computed);
  const start = held ?? (computed || null);
  // The same ops a pick would write, shown in the cards; a covered or beaten row writes nothing.
  const preview = (value: StyleValue | null): void => {
    if (covered || beaten) return;
    env.preview(value === null ? null : opsForAll(env.views, property, value, options));
  };
  const style: Style = {
    env,
    property,
    key,
    look,
    single,
    covered,
    held,
    offKit,
    hint,
    start,
    computed,
    set,
    preview,
  };
  const kind = KIND[property];
  if (reason) {
    // Read-only: the value as the frame computes it, locked, and why as its tooltip.
    row.body.append(lockedChip(computed || '-', text(`props.reason.${reason}`)));
  } else if (kind === 'keyword') {
    row.body.append(keywordRow(style, row.meta));
  } else if (single && source?.kind === 'prop' && !covered) {
    row.body.append(propSelect(style, source.prop));
  } else if (kind === 'image') {
    row.body.append(imageRow(style));
  } else {
    row.body.append(tokenRow(style, row));
  }
  if (covered) {
    // Every covered row says why in its tooltip.
    explain(row.label, coveredWords(env));
  } else if (!reason && !base) {
    if (beaten) explain(row.label, heldNote(env).textContent ?? '');
    row.meta.append(...contextActions(env, property, key));
  } else if (!reason && (held !== null || mixed) && !heldBySides(env.views, property)) {
    // A side a box or a pair holds has no reset: the whole `padding` or `margin` has one.
    const name = single && source?.kind === 'prop' ? source.prop : property;
    row.meta.append(resetButton(text('props.reset.label', { name }), () => set(null)));
  }
  // A keyword and an image of the version are never off-kit; a prop holds the kit's own word.
  const tokenKind = kind !== 'keyword' && kind !== 'image';
  const fromRule = source?.kind !== 'prop' || !base;
  if (tokenKind && fromRule) row.meta.append(...offKitMarks(style, reason === null));
  if (single) {
    const said = sourceText(env, property);
    if (base) explain(row.label, said);
    else {
      // In a width or a state the source is a short status of its own, so it stays in view.
      const from = el('span', 'props-from', said);
      from.dataset.context = sourceAt(inspected, property, context).kind;
      row.meta.append(from);
    }
  }
  if (computed) explain(row.label, text('props.computed', { value: computed }));
  // A row without a label shows its tooltip on the control's ground.
  if (look.bare === true) row.body.title = row.label.title;
  return row.root;
}
