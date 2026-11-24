// A style row of the properties panel (plan 13, task G; plan 15, task C): its control follows the
// property's kind. Tokens come first in a picker with a raw length or value after them; a keyword
// is segmented buttons or a short list; a background image is a file of the version, with Upload.
// Stage 4c (spec goals 1 and 5): the row shows and writes the value at the edit context (a width,
// a state), says where the value comes from, offers "Remove for this width" and "Apply to all
// widths", and marks colour and size options that would fail a live check. Plan 18: a colour row
// shows a swatch of the colour before its list; an off-kit value says so with a review chip.

import type { EditOp, StyleProperty, StyleValue, TokenOption } from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { isBase, sourceAt } from '../style/context-ops.ts';
import {
  opsForAll,
  opsForProp,
  readOnlyReason,
  type StyleOptions,
  sharedText,
} from '../style/ops.ts';
import { text } from '../texts.ts';
import {
  askCovered,
  contextActions,
  coveredAt,
  coveredNote,
  heldAt,
  heldNote,
  removeAll,
  sourceWords,
} from './context.ts';
import { el, imageControl, keywordControl, selectControl, tokenPicker } from './controls.ts';
import {
  imageOfUrl,
  imageUrl,
  KIND,
  keywordOfProp,
  keywordsOf,
  plainValue,
  propKeywords,
} from './kinds.ts';
import { type Env, makeRow, resetButton, staticValue } from './rows.ts';
import { attachScrub } from './scrub.ts';
import { kitHolds } from './state-held.ts';
import { isOffKit, styleValueOf, tokensFor, varOf } from './steps.ts';
import { allowsNegative, unitsFor } from './units.ts';
import { optionWarning, resolveCss } from './warn.ts';

function sourceText(env: Env, property: StyleProperty): string {
  const { context } = env.state;
  const source = env.inspected.styles[property];
  // A prop holds one value for every width and state: it is the source in any context.
  if (source?.kind === 'prop') return text('props.source.prop', { prop: source.prop });
  if (!isBase(context)) {
    const words = sourceWords(sourceAt(env.inspected, property, context), context);
    return text(words.key, words.params);
  }
  if (source?.kind === 'scss') return text('props.source.scss', { className: source.className });
  if (source?.kind === 'utility')
    return text('props.source.utility', { className: source.className });
  return text('props.source.kit');
}

/** What a style row shows and writes, read once for its control. */
type Style = {
  env: Env;
  property: StyleProperty;
  single: boolean;
  /** A kit prop sets it, and the context is not the base: a pick asks Claude. */
  covered: boolean;
  /** The value the source holds as text (a declaration, or the covering prop's word). */
  held: string | null;
  offKit: boolean;
  /** What to show when the source holds none: the computed value, or "mixed". */
  hint: string;
  /** Where a scrub starts: the held value, else the computed one. */
  start: string | null;
  set(value: StyleValue | null): void;
};

/** A token prop of one element as today: the prop's own enum values. */
function propSelect(style: Style, prop: string): HTMLElement {
  const { env, property } = style;
  const def = env.inspected.component?.props.find((one) => one.name === prop);
  const written = env.inspected.props.find((one) => one.name === prop);
  const value = String((written?.kind === 'literal' ? written.value.value : def?.default) ?? '');
  const options = (def?.values ?? []).map((name) => ({ value: name, label: name }));
  const onChange = (name: string): void =>
    env.commit(
      `style:${property}`,
      (now) => (now[0] ? opsForProp(now[0], prop, { kind: 'string', value: name }) : []),
      text('props.label.style', { property }),
    );
  return selectControl({ label: property, value, options, onChange });
}

function keywordRow(style: Style, meta: HTMLElement): HTMLElement {
  const { env, property, single, held } = style;
  const source = env.inspected.styles[property];
  const pick = (keyword: string): void => style.set(plainValue(keyword));
  if (single && source?.kind === 'prop' && !style.covered) {
    const def = env.inspected.component?.props.find((one) => one.name === source.prop);
    const keywords = def ? propKeywords(property, def) : [];
    // A prop named like the property but in the kit's own words: its values, as for a token.
    if (!def || keywords.length === 0) return propSelect(style, source.prop);
    const written = env.inspected.props.find((one) => one.name === source.prop);
    const value = written?.kind === 'literal' ? written.value.value : def.default;
    const current = keywordOfProp(property, def, value);
    const hint = style.hint;
    return keywordControl({ property, label: property, keywords, current, hint, onPick: pick });
  }
  const keywords = keywordsOf(property) ?? [];
  const current = held !== null && keywords.includes(held) ? held : null;
  if (held !== null && current === null) {
    meta.append(el('span', 'props-hint', text('props.keyword.other', { value: held })));
  }
  const hint = style.hint;
  return keywordControl({ property, label: property, keywords, current, hint, onPick: pick });
}

function imageRow(style: Style): HTMLElement {
  const { env, property, held } = style;
  const current = held === null ? null : imageOfUrl(held);
  const root = el('div', 'props-picture');
  root.append(
    imageControl({
      label: property,
      images: env.inspected.images ?? [],
      current,
      shown: held !== null && current === null ? held : style.hint,
      onPick: (file) => style.set(plainValue(imageUrl(file))),
    }),
    // A stored file is in the version only after the element is read again.
    env.upload((file) => {
      env.reread();
      style.set(plainValue(imageUrl(file)));
    }),
  );
  return root;
}

/** The colour a colour row's swatch shows: what the frame computes, else the value held. */
function sampleOf(style: Style, tokens: readonly TokenOption[]): string | null {
  const computed = style.single ? style.env.state.computed?.[style.property] : undefined;
  if (computed) return computed;
  if (style.held === null) return null;
  const name = varOf(style.held);
  if (name === null) return style.held;
  return tokens.find((token) => token.var === name)?.css ?? null;
}

function tokenRow(style: Style, label: HTMLElement): HTMLElement {
  const { env, property, held } = style;
  const tokens = tokensFor(env.tokens, property);
  const length = KIND[property] === 'dimension';
  const colour = KIND[property] === 'color';
  const current = held === null ? null : styleValueOf(held, style.offKit);
  // A scale to scrub through: lengths, weights and numbers; colours have no order to drag along.
  // A covered property is never written, so there is nothing to scrub.
  if (!colour && !style.covered) {
    attachScrub(label, {
      tokens,
      min: allowsNegative(property) ? null : 0,
      rawPx: length,
      getStart: () => style.start,
      onScrub: (value) => style.set(value),
    });
  }
  const card = style.single ? env.state.a11y : null;
  return tokenPicker({
    label: property,
    tokens,
    current,
    placeholder: style.hint,
    ...(length ? { length: { property, units: unitsFor(property) } } : {}),
    ...(colour ? { sample: sampleOf(style, tokens) } : {}),
    warn: (token) => optionWarning(property, token.css, card, resolveCss),
    onPick: (value) => style.set(value),
  });
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
  const declaration = inspected.scss?.declarations.find((own) => own.property === property);
  return { held: declaration?.value ?? null, offKit: declaration?.offKit ?? false, mixed: false };
}

/** The value shown when the context sets none: what it inherits, else what the frame computes. */
function hintOf(env: Env, property: StyleProperty, single: boolean, computed: string): string {
  if (!single || isBase(env.state.context)) return computed;
  const source = sourceAt(env.inspected, property, env.state.context);
  return computed || (source.kind === 'below' ? source.value : '');
}

/** A style row: its control by the property's kind, the reset, the source and the marks. */
export function styleRow(env: Env, property: StyleProperty): HTMLElement {
  const { inspected } = env;
  const { context } = env.state;
  const base = isBase(context);
  const single = env.views.length === 1;
  const source = inspected.styles[property];
  const key = `style:${property}`;
  const aliases = single && source?.kind === 'prop' ? [`prop:${source.prop}`] : [];
  const row = makeRow(env, key, aliases, property);
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
  const style: Style = { env, property, single, covered, held, offKit, hint, start, set };
  const kind = KIND[property];
  if (reason) {
    row.body.append(staticValue(computed || '-'));
    row.meta.append(el('span', 'props-hint', text(`props.reason.${reason}`)));
  } else if (kind === 'keyword') {
    row.body.append(keywordRow(style, row.meta));
  } else if (single && source?.kind === 'prop' && !covered) {
    row.body.append(propSelect(style, source.prop));
  } else if (kind === 'image') {
    row.body.append(imageRow(style));
  } else {
    row.body.append(tokenRow(style, row.label));
  }
  if (covered) {
    const note = coveredNote(env);
    if (note !== null) row.meta.append(note);
  } else if (!reason && !base) {
    if (beaten) row.meta.append(heldNote(env));
    row.meta.append(...contextActions(env, property, key));
  } else if (!reason && (held !== null || mixed)) {
    const name = single && source?.kind === 'prop' ? source.prop : property;
    row.meta.append(resetButton(text('props.reset.label', { name }), () => set(null)));
  }
  // A keyword and an image of the version are never off-kit; a prop holds the kit's own word.
  const tokenKind = kind !== 'keyword' && kind !== 'image';
  const fromRule = source?.kind !== 'prop' || !base;
  if (tokenKind && fromRule && held !== null && (offKit || isOffKit(held, env.tokens))) {
    // A state, said in the review tone: the value is no kit token.
    const mark = el('span', 'k-chip', text('props.offkit'));
    mark.dataset.tone = 'review';
    mark.title = text('props.offkit.title');
    row.meta.append(mark);
  }
  if (single) {
    const said = el('span', 'props-from', sourceText(env, property));
    if (!base) said.dataset.context = sourceAt(inspected, property, context).kind;
    row.meta.append(said);
  }
  if (computed) {
    row.meta.append(el('span', 'props-calc', text('props.computed', { value: computed })));
  }
  return row.root;
}
