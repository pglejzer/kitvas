// The properties panel: catalog props, text and style rows with their source, tokens first
// (plan 13, task G). Every edit is sent as a gesture through `ctx.history.apply`; the panel never
// calls another panel. Spec decisions 3, 4 and 9.

import type {
  EditOp,
  PropValue,
  Refusal,
  StyleProperty,
  StyleValue,
  TokenOption,
} from '../../../src/edit/index.ts';
import type { Inspect } from '../../../src/studio/api/edit-schemas.ts';
import { inspect as readInspect } from './api.ts';
import type { EditorContext } from './context.ts';
import {
  checkboxControl,
  el,
  numberControl,
  selectControl,
  textControl,
  tokenPicker,
} from './controls.ts';
import { isOffKit, PROPERTIES, styleValueOf, tokensFor } from './steps.ts';
import { type EditorState, elementOf, type Refused } from './store.ts';
import { text } from './texts.ts';

/** Copy of `PROP_NAME` in `src/edit/domain/ops.ts`: the props the editor may write. */
const PROP_NAME = /^(?!className$|key$|ref$|style$)[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

type Format = 'scss' | 'tailwind';
type StyleOptions = { format?: Format };

const sameProp = (a: PropValue, b: PropValue): boolean => a.kind === b.kind && a.value === b.value;

/** The prop written before `props[index]` that the editor may name; `null` when it is the first. */
function previousName(props: Inspect['props'], index: number): string | null {
  for (let at = index - 1; at >= 0; at -= 1) {
    const name = props[at]?.name;
    if (name && PROP_NAME.test(name)) return name;
  }
  return null;
}

/**
 * The ops that set (or, with `null`, remove) a prop. A literal keeps its place; a new prop goes
 * after the last prop written. An expression prop is read-only: no ops.
 */
export function opsForProp(inspected: Inspect, name: string, value: PropValue | null): EditOp[] {
  if (!PROP_NAME.test(name)) return [];
  const { id, props } = inspected;
  const index = props.findIndex((prop) => prop.name === name);
  const written = props[index];
  if (written?.kind === 'expr') return [];
  if (written) {
    const after = previousName(props, index);
    if (value === null) return [{ op: 'removeProp', id, name, before: written.value, after }];
    if (sameProp(written.value, value)) return [];
    return [{ op: 'setProp', id, name, value, before: written.value, after }];
  }
  if (value === null) return [];
  return [
    { op: 'setProp', id, name, value, before: null, after: previousName(props, props.length) },
  ];
}

/** The enum value a token stands for: `--kit-space-md` is `md` when the prop has `md`. */
function enumValueOf(values: string[], value: StyleValue): string | null {
  if ('raw' in value) return values.includes(value.raw) ? value.raw : null;
  const named = values.filter((name) => value.token.endsWith(`-${name}`));
  return named.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Why a style row cannot be edited by the editor, or `null` when it can (spec decisions 4, 9). */
export function readOnlyReason(
  inspected: Inspect,
  property: StyleProperty,
  format: Format,
): Refusal | null {
  const source = inspected.styles[property];
  if (format === 'tailwind' || source?.kind === 'utility') return 'utility';
  if (source?.kind === 'prop') {
    const written = inspected.props.find((prop) => prop.name === source.prop);
    if (written?.kind === 'expr') return 'computed';
    return !written && inspected.spread ? 'spread' : null;
  }
  const { component, scss, styleClass, className } = inspected;
  if (component && !component.takesClassName) return 'no-classname';
  if (!scss || !styleClass) return 'not-found';
  if (className?.kind === 'expr' && !styleClass.exists) return 'computed';
  const own = scss.declarations.some((declaration) => declaration.property === property);
  return !own && scss.nested.includes(property) ? 'nested' : null;
}

/**
 * The ops that set (or, with `null`, remove) a style property at its source. A prop source gives
 * one `setProp`; otherwise the class rule: `addClass` first when the element has no class yet, and
 * `newRule` when the rule does not exist.
 */
export function opsForStyle(
  inspected: Inspect,
  property: StyleProperty,
  value: StyleValue | null,
  options: StyleOptions = {},
): EditOp[] {
  if (readOnlyReason(inspected, property, options.format ?? 'scss') !== null) return [];
  const source = inspected.styles[property];
  if (source?.kind === 'prop') {
    if (value === null) return opsForProp(inspected, source.prop, null);
    const values = inspected.component?.props.find((prop) => prop.name === source.prop)?.values;
    const named = values ? enumValueOf(values, value) : null;
    return named === null
      ? []
      : opsForProp(inspected, source.prop, { kind: 'string', value: named });
  }
  const { id, scss, styleClass } = inspected;
  if (!scss || !styleClass) return [];
  const { className } = styleClass;
  const declaration = scss.declarations.find((own) => own.property === property);
  const before = declaration ? styleValueOf(declaration.value, declaration.offKit) : null;
  if (value === null) {
    return before ? [{ op: 'removeStyle', id, className, property, before, dropRule: false }] : [];
  }
  if (before && JSON.stringify(before) === JSON.stringify(value)) return [];
  const ops: EditOp[] = styleClass.exists ? [] : [{ op: 'addClass', id, className }];
  ops.push({ op: 'setStyle', id, className, property, value, before, newRule: !scss.rule });
  return ops;
}

/** The row a refused op belongs to, as `makeRow` keys it. */
export function refusalKey(refused: Refused): string | null {
  const op = refused.gesture.ops[refused.index];
  if (!op) return null;
  if (op.op === 'setProp' || op.op === 'removeProp') return `prop:${op.name}`;
  if (op.op === 'setText') return 'text';
  if (op.op === 'setStyle' || op.op === 'removeStyle') return `style:${op.property}`;
  const style = refused.gesture.ops.find(
    (one) => one.op === 'setStyle' || one.op === 'removeStyle',
  );
  return style && 'property' in style ? `style:${style.property}` : null;
}

// ---- The view ----

type Commit = (
  row: string,
  build: (inspected: Inspect) => EditOp[],
  label: string,
  watched?: StyleProperty,
) => void;

type Env = {
  state: EditorState;
  inspected: Inspect;
  tokens: TokenOption[];
  format: Format;
  commit: Commit;
  notes: Map<string, string>;
  redraw(): void;
  refusal: { key: string; reason: Refusal } | null;
};

type Row = { root: HTMLElement; body: HTMLElement; meta: HTMLElement };

function makeRow(env: Env, key: string, aliases: string[], label: string): Row {
  const root = el('div', 'props-row');
  root.dataset.row = key;
  const body = el('div', 'props-body');
  const meta = el('div', 'props-meta');
  root.append(el('span', 'props-label', label), body, meta);
  const note = env.notes.get(key);
  if (note) meta.append(el('span', 'props-note', text(note)));
  if (env.refusal && [key, ...aliases].includes(env.refusal.key)) {
    const problem = el('span', 'props-problem', text(`props.reason.${env.refusal.reason}`));
    problem.setAttribute('role', 'status');
    meta.append(problem);
  }
  return { root, body, meta };
}

function resetButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'props-reset', text('props.reset'));
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.addEventListener('click', onClick);
  return button;
}

const EDITABLE = new Set(['enum', 'boolean', 'string', 'number']);

function propRows(env: Env): HTMLElement[] {
  const { inspected, commit } = env;
  const catalog = inspected.component?.props ?? [];
  const names = [...catalog.map((prop) => prop.name), ...inspected.props.map((prop) => prop.name)];
  const rows: HTMLElement[] = [];
  for (const name of new Set(names)) {
    if (!PROP_NAME.test(name)) continue;
    const def = catalog.find((prop) => prop.name === name);
    const written = inspected.props.find((prop) => prop.name === name);
    const kind = def?.type ?? (written?.kind === 'literal' ? written.value.kind : 'other');
    if (!written && !EDITABLE.has(kind)) continue;
    const key = `prop:${name}`;
    const row = makeRow(env, key, [], name);
    const set = (value: PropValue): void =>
      commit(key, (now) => opsForProp(now, name, value), text('props.label.prop', { name }));
    if (written?.kind === 'expr') {
      row.body.append(
        el('code', 'props-code', text('props.expr.source', { source: written.source })),
      );
      row.meta.append(el('span', 'props-note', text('props.reason.computed')));
    } else {
      const raw = written ? written.value.value : def?.default;
      const label = name;
      if (kind === 'enum') {
        const options = (def?.values ?? []).map((value) => ({ value, label: value }));
        const onChange = (value: string): void => set({ kind: 'string', value });
        row.body.append(selectControl({ label, value: String(raw ?? ''), options, onChange }));
      } else if (kind === 'boolean') {
        const onChange = (value: boolean): void => set({ kind: 'boolean', value });
        row.body.append(checkboxControl({ label, checked: raw === true, onChange }));
      } else if (kind === 'string') {
        const onCommit = (value: string): void => set({ kind: 'string', value });
        row.body.append(textControl({ label, value: String(raw ?? ''), onCommit }));
      } else if (kind === 'number') {
        const onCommit = (value: number): void => set({ kind: 'number', value });
        const value = typeof raw === 'number' ? raw : null;
        row.body.append(numberControl({ label, value, onCommit }));
      } else {
        row.body.append(el('code', 'props-code', String(raw ?? '')));
      }
      if (!written) row.meta.append(el('span', 'props-note', text('props.default')));
      else if (def) {
        const clear = (): void =>
          commit(key, (now) => opsForProp(now, name, null), text('props.label.reset', { name }));
        row.meta.append(resetButton(text('props.reset.label', { name }), clear));
      }
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

function styleRow(env: Env, property: StyleProperty): HTMLElement {
  const { inspected, commit } = env;
  const source = inspected.styles[property];
  const key = `style:${property}`;
  const row = makeRow(env, key, source?.kind === 'prop' ? [`prop:${source.prop}`] : [], property);
  const computed = env.state.computed?.[property] ?? '';
  const reason = readOnlyReason(inspected, property, env.format);
  const declaration = inspected.scss?.declarations.find((own) => own.property === property);
  const tokens = tokensFor(env.tokens, property);
  const set = (value: StyleValue | null): void => {
    const label = text(value === null ? 'props.label.resetStyle' : 'props.label.style', {
      property,
    });
    const watched = value === null || source?.kind === 'prop' ? undefined : property;
    commit(key, (now) => opsForStyle(now, property, value, { format: env.format }), label, watched);
  };
  if (reason) {
    row.body.append(el('code', 'props-code', computed || '-'));
    row.meta.append(el('span', 'props-note', text(`props.reason.${reason}`)));
  } else if (source?.kind === 'prop') {
    const def = inspected.component?.props.find((prop) => prop.name === source.prop);
    const written = inspected.props.find((prop) => prop.name === source.prop);
    const value = String((written?.kind === 'literal' ? written.value.value : def?.default) ?? '');
    const options = (def?.values ?? []).map((name) => ({ value: name, label: name }));
    const onChange = (name: string): void =>
      commit(
        key,
        (now) => opsForProp(now, source.prop, { kind: 'string', value: name }),
        text('props.label.style', { property }),
      );
    row.body.append(selectControl({ label: property, value, options, onChange }));
    if (written) {
      const clear = (): void => set(null);
      row.meta.append(resetButton(text('props.reset.label', { name: source.prop }), clear));
    }
  } else {
    const current = declaration ? styleValueOf(declaration.value, declaration.offKit) : null;
    row.body.append(
      tokenPicker({ label: property, tokens, current, placeholder: computed, onPick: set }),
    );
    if (declaration) {
      row.meta.append(resetButton(text('props.reset.label', { name: property }), () => set(null)));
    }
  }
  if (declaration && (declaration.offKit || isOffKit(declaration.value, env.tokens))) {
    const mark = el('span', 'props-offkit', text('props.offkit'));
    mark.title = text('props.offkit.title');
    row.meta.append(mark);
  }
  row.meta.append(el('span', 'props-source', sourceText(env, property)));
  if (computed)
    row.meta.append(el('span', 'props-computed', text('props.computed', { value: computed })));
  return row.root;
}

function textRow(env: Env): HTMLElement | null {
  const { inspected } = env;
  if (inspected.text === null) return null;
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
      (now) =>
        now.text === null ? [] : [{ op: 'setText', id: now.id, value: next, before: now.text }],
      text('props.label.text'),
    );
  };
  row.body.append(textControl({ label: text('props.text'), value: inspected.text, onCommit }));
  return row.root;
}

function view(env: Env): HTMLElement[] {
  const { inspected, state } = env;
  const out: HTMLElement[] = [];
  const note = (key: string, params: Record<string, string | number> = {}): void => {
    out.push(el('p', 'props-note', text(key, params)));
  };
  if (state.selection.length > 1) note('props.multi', { count: state.selection.length });
  if ((state.tree.find((node) => node.id === inspected.id)?.count ?? 1) > 1) note('props.mapped');
  if (env.format === 'tailwind') note('props.tailwind');
  if (inspected.spread) note('props.spread');
  const props = propRows(env);
  if (props.length > 0) {
    const group = inspected.component
      ? text('props.group.component', { name: inspected.component.name })
      : text('props.group.element');
    out.push(el('h4', undefined, group), ...props);
  }
  const content = textRow(env);
  if (content) out.push(el('h4', undefined, text('props.group.text')), content);
  out.push(el('h4', undefined, text('props.group.styles')));
  for (const property of PROPERTIES) out.push(styleRow(env, property));
  return out;
}

export function mountProps(ctx: EditorContext): void {
  const section = ctx.panel.querySelector<HTMLElement>('[data-edit="props"]');
  if (!section) return;
  const { store, bridge, history, slug } = ctx;
  const notes = new Map<string, string>();
  /** Rows whose edit is waiting for the frame to show whether the computed value moved. */
  const pending = new Map<string, { property: StyleProperty; before: string | undefined }>();
  const probes = new Set<number>();
  let inflight: Promise<void> = Promise.resolve();
  let chain: Promise<void> = Promise.resolve();
  let latest = 0;

  function render(): void {
    const state = store.get();
    const active = document.activeElement;
    const focus = active instanceof HTMLElement && section?.contains(active) ? active : null;
    const row = focus?.closest<HTMLElement>('[data-row]')?.dataset.row;
    const control = focus?.dataset.control;
    const content: HTMLElement[] = [];
    const id = state.selection[0];
    const inspected = state.inspected;
    if (state.on) {
      content.push(el('h3', undefined, text('props.heading')));
      if (!id) content.push(el('p', 'props-note', text('props.none')));
      else if (!inspected || inspected.id !== id || !state.edit) {
        content.push(el('p', 'props-note', text('props.loading')));
      } else {
        const key = state.refused ? refusalKey(state.refused) : null;
        const first = state.refused?.gesture.ops[0];
        const own = first !== undefined && elementOf(first) === inspected.id;
        content.push(
          ...view({
            state,
            inspected,
            tokens: state.edit.tokens,
            format: state.edit.format,
            commit,
            notes,
            redraw: render,
            refusal: key && state.refused && own ? { key, reason: state.refused.reason } : null,
          }),
        );
      }
    }
    section?.replaceChildren(...content);
    if (row && control) {
      const found = `[data-row="${CSS.escape(row)}"] [data-control="${control}"]`;
      section?.querySelector<HTMLElement>(found)?.focus();
    }
  }

  // Edits are built when their turn comes, from the source as the server last described it, so a
  // quick second edit does not carry the first one's old value as `before`.
  function commit(
    row: string,
    build: (inspected: Inspect) => EditOp[],
    label: string,
    watched?: StyleProperty,
  ): void {
    chain = chain
      .then(async () => {
        await inflight;
        const state = store.get();
        const ops = state.inspected ? build(state.inspected) : [];
        if (ops.length === 0) return;
        notes.delete(row);
        if (state.refused) store.set({ refused: null });
        const before = watched ? state.computed?.[watched] : undefined;
        const outcome = await history.apply({ ops, label });
        if (outcome?.outcome === 'applied' && watched)
          pending.set(row, { property: watched, before });
      })
      .catch(() => undefined);
  }

  // The source changed (our edit, or Claude's): read the element again.
  function refresh(id: string): void {
    latest += 1;
    const mine = latest;
    inflight = readInspect(slug, id).then((answer) => {
      if (mine !== latest || store.get().selection[0] !== id || !answer.ok) return;
      store.set({ inspected: answer.body });
    });
  }

  store.subscribe((state, previous) => {
    if (state.selection[0] !== previous.selection[0]) {
      notes.clear();
      pending.clear();
      probes.clear();
    }
    const id = state.selection[0];
    if (id && state.etags !== previous.etags) refresh(id);
    const changed =
      state.on !== previous.on ||
      state.selection !== previous.selection ||
      state.inspected !== previous.inspected ||
      state.computed !== previous.computed ||
      state.refused !== previous.refused ||
      state.tree !== previous.tree ||
      state.edit !== previous.edit;
    if (changed) render();
  });

  // After a build the frame sends its tree again; ask for the styles once more and compare.
  bridge.on((message) => {
    const id = store.get().selection[0];
    if (message.type === 'tree' && pending.size > 0 && id) {
      const request = bridge.nextRequest();
      probes.add(request);
      bridge.send({ type: 'inspect', request, id });
    }
    if (message.type === 'inspected' && probes.delete(message.request)) {
      if (!message.found || message.id !== id) return;
      for (const [row, watch] of pending) {
        if (message.styles[watch.property] === watch.before) notes.set(row, 'props.noeffect');
      }
      pending.clear();
      render();
    }
  });
  render();
}
