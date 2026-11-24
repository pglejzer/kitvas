// The rows of the properties panel (plan 13, task G; plan 15, task C): a catalog prop, the text,
// and a style row whose control follows the property's kind. Tokens come first in a picker with
// a raw length or value after them; a keyword is segmented buttons or a short list; a background
// image is a file of the version. With several elements selected a row writes to each of them,
// as one gesture. Every edit goes through `env.commit`; a row never sends anything itself.

import type {
  EditOp,
  PropValue,
  Refusal,
  StyleProperty,
  StyleValue,
  TokenOption,
} from '../../../src/edit/index.ts';
import type { Inspect } from '../../../src/studio/api/edit-schemas.ts';
import {
  checkboxControl,
  el,
  imageControl,
  keywordControl,
  numberControl,
  selectControl,
  textControl,
  tokenPicker,
} from './controls.ts';
import {
  imageOfUrl,
  imageUrl,
  KIND,
  keywordOfProp,
  keywordsOf,
  plainValue,
  propKeywords,
} from './props-kinds.ts';
import {
  type Format,
  opsForAll,
  opsForProp,
  opsForPropAll,
  PROP_NAME,
  readOnlyReason,
  sharedText,
} from './props-ops.ts';
import { attachScrub } from './props-scrub.ts';
import { allowsNegative, unitsFor } from './props-units.ts';
import { isOffKit, styleValueOf, tokensFor } from './steps.ts';
import type { EditorState } from './store.ts';
import { text } from './texts.ts';

/**
 * Sends a gesture when its turn comes: `build` gets the selected elements as the server last
 * described them. `watched`: the computed value to compare after the build (one element only).
 */
export type Commit = (
  row: string,
  build: (views: readonly Inspect[]) => EditOp[],
  label: string,
  watched?: StyleProperty,
) => void;

export type Env = {
  state: EditorState;
  /** The first selected element: the one the header names. */
  inspected: Inspect;
  /** Every selected element as its source writes it, the first one first. */
  views: readonly Inspect[];
  tokens: TokenOption[];
  format: Format;
  commit: Commit;
  notes: Map<string, string>;
  redraw(): void;
  refusal: { key: string; reason: Refusal } | null;
  select(id: string): void;
};

type Row = { root: HTMLElement; label: HTMLElement; body: HTMLElement; meta: HTMLElement };

export function makeRow(env: Env, key: string, aliases: string[], label: string): Row {
  const root = el('div', 'props-row');
  root.dataset.row = key;
  const name = el('span', 'props-label', label);
  const body = el('div', 'props-body');
  const meta = el('div', 'props-meta');
  root.append(name, body, meta);
  const note = env.notes.get(key);
  if (note) meta.append(el('span', 'props-note', text(note)));
  if (env.refusal && [key, ...aliases].includes(env.refusal.key)) {
    const problem = el('span', 'props-problem', text(`props.reason.${env.refusal.reason}`));
    problem.setAttribute('role', 'status');
    meta.append(problem);
  }
  return { root, label: name, body, meta };
}

function resetButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'props-reset', text('props.reset'));
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.addEventListener('click', onClick);
  return button;
}

const EDITABLE = new Set(['enum', 'boolean', 'string', 'number']);

/** The value every element writes for a prop; `undefined` when they differ or none writes it. */
function sharedProp(views: readonly Inspect[], name: string): PropValue | undefined {
  const values = views.map((view) => view.props.find((prop) => prop.name === name));
  const [one] = values;
  if (one?.kind !== 'literal') return undefined;
  const same = values.every(
    (value) =>
      value?.kind === 'literal' &&
      value.value.kind === one.value.kind &&
      value.value.value === one.value.value,
  );
  return same ? one.value : undefined;
}

/** One prop's control: a list, a box, a text or a number field, by the catalog's type. */
function propControl(
  kind: string,
  label: string,
  raw: string | number | boolean | undefined,
  set: (value: PropValue) => void,
): HTMLElement {
  if (kind === 'boolean') {
    const onChange = (value: boolean): void => set({ kind: 'boolean', value });
    return checkboxControl({ label, checked: raw === true, onChange });
  }
  if (kind === 'string') {
    const onCommit = (value: string): void => set({ kind: 'string', value });
    return textControl({ label, value: String(raw ?? ''), onCommit });
  }
  if (kind === 'number') {
    const onCommit = (value: number): void => set({ kind: 'number', value });
    return numberControl({ label, value: typeof raw === 'number' ? raw : null, onCommit });
  }
  return el('code', 'props-code', String(raw ?? ''));
}

/**
 * The catalog props and the props the tag writes. With several elements, only the catalog props
 * of one shared kit component, each set on every element.
 */
export function propRows(env: Env): HTMLElement[] {
  const { inspected, views, commit } = env;
  const single = views.length === 1;
  const component = inspected.component;
  if (!single && (component === null || views.some((v) => v.component?.name !== component.name))) {
    return [];
  }
  const catalog = component?.props ?? [];
  const names = [...catalog.map((prop) => prop.name), ...inspected.props.map((prop) => prop.name)];
  const rows: HTMLElement[] = [];
  for (const name of new Set(names)) {
    if (!PROP_NAME.test(name)) continue;
    const def = catalog.find((prop) => prop.name === name);
    const written = single ? inspected.props.find((prop) => prop.name === name) : undefined;
    const shared = single ? undefined : sharedProp(views, name);
    const kind = def?.type ?? (written?.kind === 'literal' ? written.value.kind : 'other');
    if (!written && !EDITABLE.has(kind)) continue;
    if (!single && def === undefined) continue;
    const key = `prop:${name}`;
    const row = makeRow(env, key, [], name);
    const set = (value: PropValue): void =>
      commit(key, (now) => opsForPropAll(now, name, value), text('props.label.prop', { name }));
    if (written?.kind === 'expr') {
      row.body.append(
        el('code', 'props-code', text('props.expr.source', { source: written.source })),
      );
      row.meta.append(el('span', 'props-note', text('props.reason.computed')));
      rows.push(row.root);
      continue;
    }
    const absent = views.every((view) => !view.props.some((prop) => prop.name === name));
    const value = written?.kind === 'literal' ? written.value : shared;
    const raw = value ? value.value : absent ? def?.default : undefined;
    if (kind === 'enum') {
      const options = (def?.values ?? []).map((one) => ({ value: one, label: one }));
      const onChange = (one: string): void => set({ kind: 'string', value: one });
      const placeholder = single || absent ? '' : text('props.mixed');
      row.body.append(
        selectControl({ label: name, value: String(raw ?? ''), options, placeholder, onChange }),
      );
    } else {
      row.body.append(propControl(kind, name, raw, set));
    }
    if (single && !written) row.meta.append(el('span', 'props-note', text('props.default')));
    else if (def) {
      const clear = (): void =>
        commit(key, (now) => opsForPropAll(now, name, null), text('props.label.reset', { name }));
      row.meta.append(resetButton(text('props.reset.label', { name }), clear));
    }
    rows.push(row.root);
  }
  return rows;
}

function sourceText(env: Env, property: StyleProperty): string {
  const source = env.inspected.styles[property];
  if (source?.kind === 'prop') return text('props.source.prop', { prop: source.prop });
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
  if (single && source?.kind === 'prop') {
    const def = env.inspected.component?.props.find((one) => one.name === source.prop);
    const keywords = def ? propKeywords(property, def) : [];
    // A prop named like the property but in the kit's own words: its values, as for a token.
    if (!def || keywords.length === 0) return propSelect(style, source.prop);
    const written = env.inspected.props.find((one) => one.name === source.prop);
    const value = written?.kind === 'literal' ? written.value.value : def.default;
    const current = keywordOfProp(property, def, value);
    return keywordControl({ label: property, keywords, current, hint: style.hint, onPick: pick });
  }
  const keywords = keywordsOf(property) ?? [];
  const current = held !== null && keywords.includes(held) ? held : null;
  if (held !== null && current === null) {
    meta.append(el('span', 'props-note', text('props.keyword.other', { value: held })));
  }
  return keywordControl({ label: property, keywords, current, hint: style.hint, onPick: pick });
}

function imageRow(style: Style): HTMLElement {
  const { env, property, held } = style;
  const current = held === null ? null : imageOfUrl(held);
  return imageControl({
    label: property,
    images: env.inspected.images ?? [],
    current,
    shown: held !== null && current === null ? held : style.hint,
    onPick: (file) => style.set(plainValue(imageUrl(file))),
  });
}

function tokenRow(style: Style, label: HTMLElement): HTMLElement {
  const { env, property, held } = style;
  const tokens = tokensFor(env.tokens, property);
  const length = KIND[property] === 'dimension';
  const current = held === null ? null : styleValueOf(held, style.offKit);
  // A scale to scrub through: lengths, weights and numbers; colours have no order to drag along.
  if (KIND[property] !== 'color') {
    attachScrub(label, {
      tokens,
      min: allowsNegative(property) ? null : 0,
      rawPx: length,
      getStart: () => style.start,
      onScrub: (value) => style.set(value),
    });
  }
  return tokenPicker({
    label: property,
    tokens,
    current,
    placeholder: style.hint,
    ...(length ? { length: { property, units: unitsFor(property) } } : {}),
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

/** A style row: its control by the property's kind, the reset, the source and the marks. */
export function styleRow(env: Env, property: StyleProperty): HTMLElement {
  const { inspected } = env;
  const single = env.views.length === 1;
  const source = inspected.styles[property];
  const key = `style:${property}`;
  const aliases = single && source?.kind === 'prop' ? [`prop:${source.prop}`] : [];
  const row = makeRow(env, key, aliases, property);
  const computed = single ? (env.state.computed?.[property] ?? '') : '';
  const reason = single ? readOnlyReason(inspected, property, env.format) : null;
  const { held, offKit, mixed } = heldOf(env, property, single);
  const set = (value: StyleValue | null): void => {
    const label = text(value === null ? 'props.label.resetStyle' : 'props.label.style', {
      property,
    });
    const watched = single && value !== null && source?.kind !== 'prop' ? property : undefined;
    const build = (now: readonly Inspect[]): EditOp[] =>
      opsForAll(now, property, value, { format: env.format });
    env.commit(key, build, label, watched);
  };
  const hint = mixed ? text('props.mixed') : computed;
  const start = held ?? (computed || null);
  const style: Style = { env, property, single, held, offKit, hint, start, set };
  const kind = KIND[property];
  if (reason) {
    row.body.append(el('code', 'props-code', computed || '-'));
    row.meta.append(el('span', 'props-note', text(`props.reason.${reason}`)));
  } else if (kind === 'keyword') {
    row.body.append(keywordRow(style, row.meta));
  } else if (single && source?.kind === 'prop') {
    row.body.append(propSelect(style, source.prop));
  } else if (kind === 'image') {
    row.body.append(imageRow(style));
  } else {
    row.body.append(tokenRow(style, row.label));
  }
  if (!reason && (held !== null || mixed)) {
    const name = single && source?.kind === 'prop' ? source.prop : property;
    row.meta.append(resetButton(text('props.reset.label', { name }), () => set(null)));
  }
  // A keyword and an image of the version are never off-kit; a prop holds the kit's own word.
  const tokenKind = kind !== 'keyword' && kind !== 'image';
  const fromRule = source?.kind !== 'prop';
  if (tokenKind && fromRule && held !== null && (offKit || isOffKit(held, env.tokens))) {
    const mark = el('span', 'props-offkit', text('props.offkit'));
    mark.title = text('props.offkit.title');
    row.meta.append(mark);
  }
  if (single) row.meta.append(el('span', 'props-source', sourceText(env, property)));
  if (computed) {
    row.meta.append(el('span', 'props-computed', text('props.computed', { value: computed })));
  }
  return row.root;
}

/** The element's one plain text; one element only. */
export function textRow(env: Env): HTMLElement | null {
  const { inspected } = env;
  if (env.views.length > 1 || inspected.text === null) return null;
  const row = makeRow(env, 'text', [], text('props.text'));
  const onCommit = (value: string): void => {
    const next = value.trim();
    if (next === inspected.text) return;
    if (next === '' || /[{}<>\r\n]/.test(next)) {
      env.notes.set('text', 'props.text.invalid');
      env.redraw();
      return;
    }
    env.commit(
      'text',
      (now) => {
        const view = now[0];
        return view === undefined || view.text === null
          ? []
          : [{ op: 'setText', id: view.id, value: next, before: view.text }];
      },
      text('props.label.text'),
    );
  };
  row.body.append(textControl({ label: text('props.text'), value: inspected.text, onCommit }));
  return row.root;
}
