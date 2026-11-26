// The controls of a style row (plan 15, task C; plan 18f, task 2): keywords as words, icons or a
// switch; a background image of the version; and a token property as the kit's own control, a
// stepper over its scale or its colours as swatches, with today's typed field behind "Custom" (a
// colour keeps the field under its swatches). Where the kit has no tokens of the type, or the
// scale is too long to label, the typed field alone, as before (`stepper.ts`). Every control
// writes through `style.set`, so a Tailwind draft still writes its utilities. Plan 19 (task T5):
// every "Custom" goes through `env.custom`, so a redraw draws its editor open.

import type { StyleProperty, StyleValue } from '../../../../../src/edit/index.ts';
import { opsForProp } from '../../style/ops.ts';
import { text } from '../../texts.ts';
import type { EditorKind } from '../custom/raw-editors.ts';
import type { Env } from '../groups/rows.ts';
import {
  imageOfUrl,
  imageUrl,
  KIND,
  keywordOfProp,
  keywordsOf,
  plainValue,
  propKeywords,
} from '../values/kinds.ts';
import { stepperOf, styleLook } from '../values/stepper.ts';
import { styleValueOf, tokensFor } from '../values/steps.ts';
import { allowsNegative, unitsFor } from '../values/units.ts';
import { optionWarning, resolveCss } from '../values/warn.ts';
import {
  checkboxControl,
  el,
  imageControl,
  keywordControl,
  selectControl,
  tokenPicker,
} from './controls.ts';
import { attachScrub } from './scrub.ts';
import { swatchRow } from './swatches.ts';
import { tokenStepper } from './token-stepper.ts';

/** How a row shows its property, when it is not the property's plain row (Layout, Radius). */
export type RowLook = {
  /** The row's key; `style:<property>` for the plain row. */
  key?: string;
  /** The label; the property's CSS name for the plain row. */
  label?: string;
  /** The keywords offered: a part of the property's list. */
  keywords?: readonly string[];
  /** Each keyword is shown and named by its human word (`props.word.<keyword>`). */
  words?: boolean;
  /** Two keywords as a switch: on is `on` (`flex-wrap`: `wrap`). */
  toggle?: { on: string; off: string };
  /** The control takes the row; its label is for a screen reader only (the group says it). */
  bare?: boolean;
};

/** What a style row shows and writes, read once for its control. */
export type Style = {
  env: Env;
  property: StyleProperty;
  /** The row's key: the one its notes, its focus and its edits go by. */
  key: string;
  look: RowLook;
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
  /** The value the frame computes for one element; empty when not known. */
  computed: string;
  set(value: StyleValue | null): void;
  /** Shows what a pick would write in the cards; `null` takes it back. Never on a covered row. */
  preview(value: StyleValue | null): void;
};

/** The parts of a row a control may add to: its label (a scrub), its root and its marks. */
export type RowParts = { root: HTMLElement; label: HTMLElement; meta: HTMLElement };

/** A token prop of one element as today: the prop's own enum values. */
export function propSelect(style: Style, prop: string): HTMLElement {
  const { env, property } = style;
  const def = env.inspected.component?.props.find((one) => one.name === prop);
  const written = env.inspected.props.find((one) => one.name === prop);
  const value = String((written?.kind === 'literal' ? written.value.value : def?.default) ?? '');
  const options = (def?.values ?? []).map((name) => ({ value: name, label: name }));
  const onChange = (name: string): void =>
    env.commit(
      style.key,
      (now) => (now[0] ? opsForProp(now[0], prop, { kind: 'string', value: name }) : []),
      text('props.label.style', { property }),
    );
  return selectControl({ label: property, value, options, onChange, onClose: () => env.redraw() });
}

const wordOf = (keyword: string): string => text(`props.word.${keyword}`);

export function keywordRow(style: Style, meta: HTMLElement): HTMLElement {
  const { env, property, single, held, look } = style;
  const label = look.label ?? property;
  const source = env.inspected.styles[property];
  const pick = (keyword: string): void => style.set(plainValue(keyword));
  // A human row offers its own keywords, in its own order, of those the property takes.
  const only = (keywords: readonly string[]): string[] =>
    look.keywords === undefined
      ? [...keywords]
      : look.keywords.filter((keyword) => keywords.includes(keyword));
  const draw = (keywords: readonly string[], current: string | null): HTMLElement => {
    if (look.toggle !== undefined) {
      const { on, off } = look.toggle;
      // Nothing set: the switch shows what the frame computes.
      const checked = current === null ? style.hint === on : current === on;
      return checkboxControl({ label, checked, onChange: (yes) => pick(yes ? on : off) });
    }
    return keywordControl({
      property,
      label,
      keywords,
      current,
      hint: style.hint,
      onPick: pick,
      onPreview: (keyword) => style.preview(keyword === null ? null : plainValue(keyword)),
      onClose: () => env.redraw(),
      ...(look.words === true ? { name: wordOf } : {}),
    });
  };
  if (single && source?.kind === 'prop' && !style.covered) {
    const def = env.inspected.component?.props.find((one) => one.name === source.prop);
    const keywords = def ? only(propKeywords(property, def)) : [];
    // A prop named like the property but in the kit's own words: its values, as for a token.
    if (!def || keywords.length === 0) return propSelect(style, source.prop);
    const written = env.inspected.props.find((one) => one.name === source.prop);
    const value = written?.kind === 'literal' ? written.value.value : def.default;
    return draw(keywords, keywordOfProp(property, def, value));
  }
  const keywords = only(keywordsOf(property) ?? []);
  const current = held !== null && keywords.includes(held) ? held : null;
  if (held !== null && current === null) {
    meta.append(el('span', 'props-hint', text('props.keyword.other', { value: held })));
  }
  return draw(keywords, current);
}

export function imageRow(style: Style): HTMLElement {
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
      onPreview: (file) => style.preview(file === null ? null : plainValue(imageUrl(file))),
      onClose: () => env.redraw(),
    }),
    // A stored file is in the version only after the element is read again.
    env.upload((file) => {
      env.reread();
      style.set(plainValue(imageUrl(file)));
    }),
  );
  return root;
}

/** "Custom…": opens or closes today's typed field under the kit's control. */
function customToggle(open: boolean, onToggle: () => void): HTMLButtonElement {
  const button = el('button', 'k-btn props-act', text('props.custom'));
  button.type = 'button';
  button.dataset.control = 'custom';
  button.setAttribute('aria-expanded', String(open));
  button.addEventListener('click', onToggle);
  return button;
}

export function tokenRow(style: Style, parts: RowParts): HTMLElement {
  const { env, property, held } = style;
  const tokens = tokensFor(env.tokens, property);
  const length = KIND[property] === 'dimension';
  const colour = KIND[property] === 'color';
  const current = held === null ? null : styleValueOf(held, style.offKit);
  // A scale to scrub through: lengths, weights and numbers; colours have no order to drag along.
  // A covered property is never written, so there is nothing to scrub.
  if (!colour && !style.covered && style.look.bare !== true) {
    attachScrub(parts.label, {
      tokens,
      min: allowsNegative(property) ? null : 0,
      rawPx: length,
      getStart: () => style.start,
      onScrub: (value) => style.set(value),
    });
  }
  const card = style.single ? env.state.a11y : null;
  const warn = (css: string): string | null => optionWarning(property, css, card, resolveCss);
  // What "Custom" opens: the colour panel, a number with units, a weight or a plain number.
  const editor: EditorKind = colour
    ? { kind: 'colour', warn }
    : length
      ? { kind: 'length', property, units: unitsFor(property) }
      : KIND[property] === 'fontWeight'
        ? { kind: 'weight' }
        : { kind: 'number' };
  const field = (open: boolean): HTMLElement =>
    tokenPicker({
      label: property,
      tokens,
      current,
      placeholder: style.hint,
      editor,
      // One memory for the list's "Custom..." and the stepper's button (plan 19, task T5).
      custom: {
        open: open || env.custom.has(style.key),
        show: () => env.custom.open(style.key),
        hide: () => env.custom.close(style.key),
        cancel: () => env.custom.cancel(style.key),
        drop: () => env.custom.drop(style.key),
      },
      // The colour panel is as wide as the whole row.
      ...(colour ? { dock: parts.root } : {}),
      warn: (token) => warn(token.css),
      onPick: (value) => style.set(value),
      onPreview: (value) => style.preview(value),
      onClose: () => env.redraw(),
    });
  const look = styleLook(property, env.tokens);
  if (look === 'field') return field(false);
  const root = el('div', 'props-kit');
  if (look === 'swatches') {
    const swatches = swatchRow({
      label: property,
      tokens,
      current: held,
      warn: (token) => warn(token.css),
      onPick: (token) => style.set({ token: token.var }),
      onPreview: (token) => style.preview(token === null ? null : { token: token.var }),
    });
    root.append(swatches, field(false));
    return root;
  }
  const stepper = stepperOf(env.tokens, property, held, style.computed || null);
  parts.root.dataset.wide = '';
  root.append(
    tokenStepper({
      label: style.look.label ?? property,
      stops: stepper.stops,
      at: stepper.at,
      hint: stepper.hint,
      warn: (stop) => warn(stop.css),
      onPick: (stop) => style.set({ token: stop.var }),
      onPreview: (stop) => style.preview(stop === null ? null : { token: stop.var }),
    }),
  );
  // Off the scale (a raw value, another token) the typed field shows what is written.
  const forced = held !== null && stepper.at < 0;
  const open = forced || env.custom.has(style.key);
  if (!forced) parts.meta.append(customToggle(open, () => env.custom.toggle(style.key)));
  if (open) root.append(field(true));
  return root;
}
