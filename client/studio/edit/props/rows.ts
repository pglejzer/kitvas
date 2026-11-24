// The rows of the properties panel (plan 13, task G; plan 15, task C): a catalog prop and the
// text; the style rows are in `props-style.ts`. With several elements selected a row writes to
// each of them, as one gesture. Every edit goes through `env.commit`; a row never sends anything
// itself. Stage 4c: a prop has one value for every width and state, so its row is read-only in
// any other edit context.

import type {
  EditOp,
  PropValue,
  Refusal,
  StyleProperty,
  StyleState,
  TokenOption,
} from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import type { EditorState, Gesture } from '../store.ts';
import { isBase } from '../style/context-ops.ts';
import { type Format, opsForPropAll, PROP_NAME } from '../style/ops.ts';
import { text } from '../texts.ts';
import { checkboxControl, el, numberControl, selectControl, textControl } from './controls.ts';

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
  // Stage 4c (plan 16, task B).
  /** The state bar: edits go to `state` from now on. */
  pickState(state: StyleState | null): void;
  /** An edit the editor will not write, shown as refused so Ask Claude can take it. */
  refuse(gesture: Gesture, reason: Refusal): void;
  /** The image picker's Upload control (task E); `onStored` gets the stored file's name. */
  upload(onStored: (file: string) => void): HTMLElement;
  /** Reads the selected elements again: a new image file is in the version now. */
  reread(): void;
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

export function resetButton(label: string, onClick: () => void): HTMLButtonElement {
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
  // A prop has one value for every width and state (spec 4c, goal 1).
  const fixed = !isBase(env.state.context);
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
    if (fixed) {
      row.body.append(el('code', 'props-code', String(raw ?? '')));
      row.meta.append(el('span', 'props-note', text('context.propOnce')));
      rows.push(row.root);
      continue;
    }
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
