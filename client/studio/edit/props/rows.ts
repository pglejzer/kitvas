// The rows of the properties panel (plan 13, task G; plan 15, task C): a catalog prop and the
// text; the style rows are in `style.ts`. With several elements selected a row writes to each of
// them, as one gesture. Every edit goes through `env.commit`; a row never sends anything itself.
// Stage 4c: a prop has one value for every width and state, so its row is read-only in any other
// edit context. Plan 18f (task 2): an enum prop is option chips, a boolean a switch, a prop set by
// code or held by the context a locked chip whose reason is its tooltip (`prop-control.ts`).

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
import { lockedChip, optionChips } from './chips.ts';
import { checkboxControl, el, numberControl, selectControl, textControl } from './controls.ts';
import { controlOf, type PropControl } from './prop-control.ts';

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
  // Plan 18e (task 1).
  /**
   * Shows `ops` in the cards at once (hover preview); `null` takes the preview back. Nothing is
   * shown while an edit is on its way.
   */
  preview(ops: readonly EditOp[] | null): void;
  /** The list scope switch: all items of a list or this one; `null` outside a list. */
  scope: { mode: 'all' | 'item'; count: number } | null;
  // Plan 18f (task 2).
  /**
   * The rows whose "Custom" editor is open (plan 19, task T5: the list's foot item and the
   * stepper's button share it). `open` and `toggle` put the cursor in the editor after the draw.
   */
  custom: {
    has(row: string): boolean;
    toggle(row: string): void;
    open(row: string): void;
    close(row: string): void;
    /** Escape: closes it, and the cursor goes back to its opener after the draw. */
    cancel(row: string): boolean;
    /** A press outside: forgets the row with no draw and no cursor; `false` if it was not held. */
    drop(row: string): boolean;
  };
};

type Row = { root: HTMLElement; label: HTMLElement; body: HTMLElement; meta: HTMLElement };

/**
 * A row (`.k-row`): the label, the control, and under the control its marks, notes and actions.
 * A long label is clipped and says itself in full as its tooltip.
 */
export function makeRow(env: Env, key: string, aliases: string[], label: string): Row {
  const root = el('div', 'k-row props-entry');
  root.dataset.row = key;
  const name = el('span', 'k-label props-key', label);
  name.title = label;
  const body = el('div', 'props-control');
  const meta = el('div', 'props-extra');
  root.append(name, body, meta);
  const note = env.notes.get(key);
  if (note) meta.append(el('span', 'props-hint', text(note)));
  if (env.refusal && [key, ...aliases].includes(env.refusal.key)) {
    const problem = el('span', 'props-error', text(`props.reason.${env.refusal.reason}`));
    problem.setAttribute('role', 'status');
    meta.append(problem);
  }
  return { root, label: name, body, meta };
}

/**
 * Plan 18f (spec S4.6 "Less text"): a sentence that explains a row goes into its label's tooltip
 * and, for a screen reader, into the label itself; it no longer stands under the control.
 */
export function explain(label: HTMLElement, sentence: string): void {
  if (sentence === '') return;
  label.title = label.title === '' ? sentence : `${label.title}\n${sentence}`;
  label.append(el('span', 'k-sr', ` ${sentence}`));
}

/** A value that cannot be edited here, as the source or the frame has it. */
export function staticValue(value: string): HTMLElement {
  return el('code', 'k-mono props-static', value);
}

/** Reset: a small quiet action under the row's control, as the context's actions are. */
export function resetButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'k-btn props-act', text('props.reset'));
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

/** What a prop's row shows and writes, read once for its control. */
type PropRow = {
  env: Env;
  name: string;
  /** The value the tag writes (or every selected element shares); `undefined` for none. */
  value: PropValue | undefined;
  /** The value in force: the written one, else the catalog's default when none is written. */
  raw: string | number | boolean | undefined;
  /** No selected element writes the prop: the catalog's default is in force. */
  absent: boolean;
  single: boolean;
  set(value: PropValue): void;
};

/** One prop's control, by `controlOf`: chips, a list, a switch, a text or a number field. */
function propControl(prop: PropRow, control: PropControl): HTMLElement {
  const { name: label, raw, set } = prop;
  switch (control.kind) {
    case 'chips': {
      // The written value is pressed; with none written, the default in force is outlined.
      const written = prop.value === undefined ? null : String(prop.value.value);
      const hint = prop.absent && raw !== undefined ? String(raw) : null;
      const onPick = (one: string): void => set({ kind: 'string', value: one });
      return optionChips({ label, options: control.options, current: written, hint, onPick });
    }
    case 'list': {
      const options = control.options.map((one) => ({ value: one, label: one }));
      const placeholder = prop.single || prop.absent ? '' : text('props.mixed');
      return selectControl({
        label,
        value: String(raw ?? ''),
        options,
        placeholder,
        onChange: (one) => set({ kind: 'string', value: one }),
        onClose: () => prop.env.redraw(),
      });
    }
    case 'switch': {
      const onChange = (value: boolean): void => set({ kind: 'boolean', value });
      return checkboxControl({ label, checked: raw === true, onChange });
    }
    case 'field': {
      if (control.type === 'string') {
        const onCommit = (value: string): void => set({ kind: 'string', value });
        return textControl({ label, value: String(raw ?? ''), onCommit });
      }
      const onCommit = (value: number): void => set({ kind: 'number', value });
      return numberControl({ label, value: typeof raw === 'number' ? raw : null, onCommit });
    }
    default:
      return staticValue(String(raw ?? ''));
  }
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
    const control = controlOf({ type: kind, values: def?.values, written });
    if (control.kind === 'code') {
      // Set in code: the expression, locked, with the reason as its tooltip.
      row.body.append(lockedChip(control.text, text('props.reason.computed')));
      rows.push(row.root);
      continue;
    }
    const absent = views.every((view) => !view.props.some((prop) => prop.name === name));
    const value = written?.kind === 'literal' ? written.value : shared;
    const raw = value ? value.value : absent ? def?.default : undefined;
    if (fixed) {
      // A prop has one value for every width and state: the reason is the chip's tooltip.
      row.body.append(lockedChip(String(raw ?? ''), text('context.propOnce')));
      rows.push(row.root);
      continue;
    }
    const prop: PropRow = { env, name, value, raw, absent, single, set };
    row.body.append(propControl(prop, control));
    if (single && !written) explain(row.label, text('props.default'));
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
