// The properties panel (plan 13, task G; plan 15, task C; spec goal 8): the element's header,
// then its catalog props, text and style rows in fixed groups, each row writing at its source,
// tokens first. Every edit is sent as a gesture through `ctx.history.apply`; the panel never calls
// another panel. With several elements selected it reads each of them and shows the rows they
// share; a change goes to each as one gesture. A redraw keeps the focus, the caret and a
// half-typed value. The parts are in `props-*.ts`; this file mounts them and keeps their state.

import type { EditOp, StyleProperty } from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { inspect as readInspect } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { uploadControl } from '../insert/image-upload.ts';
import { type EditorState, elementOf } from '../store.ts';
import { HANDLE_NOTE, readHandleNote } from '../style/handle-writes.ts';
import { MAX_OPS, refusalKey } from '../style/ops.ts';
import { text } from '../texts.ts';
import { BOX_START, type BoxState, pickSide as withSide } from './box.ts';
import { el, showCustom } from './controls.ts';
import { readFolds, toggleFold, viewerStorage, writeFolds } from './groups.ts';
import type { Env } from './rows.ts';
import { type PanelUi, propsView } from './view.ts';

export { opsForProp, opsForStyle, readOnlyReason, refusalKey } from '../style/ops.ts';

/** Several elements: at most this many are read for the rows they share. */
export const MAX_MANY = 20;

/** The focused control of the panel, and the text typed into it that was not sent yet. */
type Kept = { row: string; control: string; typed: string | null; caret: [number, number] | null };

function keptFocus(section: HTMLElement): Kept | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !section.contains(active)) return null;
  const row = active.closest<HTMLElement>('[data-row]')?.dataset.row;
  const control = active.dataset.control;
  if (!row || !control) return null;
  if (!(active instanceof HTMLInputElement)) return { row, control, typed: null, caret: null };
  const initial = active.dataset.initial;
  const typed = initial !== undefined && active.value !== initial ? active.value : null;
  // A number field has no caret to read.
  const { selectionStart, selectionEnd } = active;
  const caret: [number, number] | null =
    selectionStart === null || selectionEnd === null ? null : [selectionStart, selectionEnd];
  return { row, control, typed, caret };
}

function restoreFocus(section: HTMLElement, kept: Kept | null): void {
  if (kept === null) return;
  const row = section.querySelector<HTMLElement>(`[data-row="${CSS.escape(kept.row)}"]`);
  const selector = `[data-control="${CSS.escape(kept.control)}"]`;
  const found = row?.querySelector<HTMLElement>(selector);
  if (!row || !found) return;
  // A half-typed raw value lives in the picker's custom field, which a redraw draws closed.
  if (kept.typed !== null && found.closest('[hidden]')) showCustom(row);
  found.focus();
  if (!(found instanceof HTMLInputElement)) return;
  if (kept.typed !== null) found.value = kept.typed;
  try {
    if (kept.caret) found.setSelectionRange(kept.caret[0], kept.caret[1]);
  } catch {
    // A field type without a caret: the focus is enough.
  }
}

export function mountProps(ctx: EditorContext): void {
  const section = ctx.panel.querySelector<HTMLElement>('[data-edit="props"]');
  if (!section) return;
  const { store, bridge, history, slug, main } = ctx;
  const notes = new Map<string, string>();
  /** Rows whose edit is waiting for the frame to show whether the computed value moved. */
  const pending = new Map<string, { property: StyleProperty; before: string | undefined }>();
  const probes = new Set<number>();
  /** The other selected elements; `null` for one that could not be read. */
  const others = new Map<string, Inspect | null>();
  /** The latest read asked for each of them, so an older answer never wins. */
  const asked = new Map<string, number>();
  const storage = viewerStorage();
  let folds = readFolds(storage);
  let box: BoxState = BOX_START;
  let handleNote: string | null = null;
  let inflight: Promise<void> = Promise.resolve();
  let chain: Promise<void> = Promise.resolve();
  let latest = 0;
  let reads = 0;

  const ui = (): PanelUi => ({
    folds,
    box,
    toggle(id) {
      folds = toggleFold(folds, id);
      writeFolds(storage, folds);
      render();
    },
    pickSide(layer, side) {
      box = withSide(box, layer, side);
      render();
    },
    link(link) {
      box = { ...box, link };
      render();
    },
  });

  /** The selected elements as read, the first one first; `null` while one is being read. */
  function viewsOf(state: EditorState): Inspect[] | null {
    const [id, ...rest] = state.selection;
    const { inspected } = state;
    if (!id || !inspected || inspected.id !== id) return null;
    const views = [inspected];
    for (const other of rest.slice(0, MAX_MANY - 1)) {
      const view = others.get(other);
      if (view === undefined) return null;
      if (view !== null) views.push(view);
    }
    return views;
  }

  function render(): void {
    if (!section) return;
    const state = store.get();
    const kept = keptFocus(section);
    const content: HTMLElement[] = [];
    const note = (key: string, params: Record<string, string | number> = {}): void => {
      content.push(el('p', 'props-note', text(key, params)));
    };
    const views = viewsOf(state);
    const count = state.selection.length;
    // Nothing shows outside edit mode.
    if (state.on && count === 0) note('props.none');
    else if (state.on && count > MAX_MANY) {
      note('props.many', { count });
      note('props.many.tooMany');
    } else if (state.on && (!views || !state.edit)) note('props.loading');
    else if (state.on && views && state.edit) content.push(...viewOf(state, views, state.edit));
    section.replaceChildren(...content);
    restoreFocus(section, kept);
  }

  function viewOf(
    state: EditorState,
    views: Inspect[],
    edit: NonNullable<EditorState['edit']>,
  ): HTMLElement[] {
    const [inspected] = views;
    if (!inspected) return [];
    const key = state.refused ? refusalKey(state.refused) : null;
    const first = state.refused?.gesture.ops[0];
    const own = first !== undefined && elementOf(first) === inspected.id;
    const env: Env = {
      state,
      inspected,
      views,
      tokens: edit.tokens,
      format: edit.format,
      commit,
      notes,
      redraw: render,
      refusal: key && state.refused && own ? { key, reason: state.refused.reason } : null,
      select: (id) => store.set({ selection: [id] }),
      pickState: (next) => store.set({ context: { ...store.get().context, state: next } }),
      refuse: (gesture, reason) => store.set({ refused: { gesture, index: 0, reason } }),
      upload: (onStored) => uploadControl(ctx, onStored),
      reread: () => refresh(store.get()),
    };
    const view = propsView(env, ui());
    if (handleNote !== null) {
      const said = el('p', 'props-note props-handle-note', text(handleNote));
      said.setAttribute('role', 'status');
      view.splice(1, 0, said);
    }
    return view;
  }

  // Edits are built when their turn comes, from the source as the server last described it, so a
  // quick second edit does not carry the first one's old value as `before`.
  function commit(
    row: string,
    build: (views: readonly Inspect[]) => EditOp[],
    label: string,
    watched?: StyleProperty,
  ): void {
    chain = chain
      .then(async () => {
        await inflight;
        const state = store.get();
        const views = viewsOf(state);
        const ops = views ? build(views) : [];
        if (ops.length === 0) return;
        if (ops.length > MAX_OPS) {
          notes.set(row, 'props.many.tooMany');
          render();
          return;
        }
        notes.delete(row);
        if (state.refused) store.set({ refused: null });
        const before = watched ? state.computed?.[watched] : undefined;
        const outcome = await history.apply({ ops, label });
        if (outcome?.outcome === 'applied' && watched && views?.length === 1) {
          pending.set(row, { property: watched, before });
        }
      })
      .catch(() => undefined);
  }

  /** Reads other selected elements; the panel draws again once they are in. */
  function readOthers(ids: readonly string[]): Promise<void> {
    const reading = ids.map((id) => {
      reads += 1;
      const mine = reads;
      asked.set(id, mine);
      return readInspect(slug, id).then((answer) => {
        if (asked.get(id) !== mine || !store.get().selection.includes(id)) return;
        others.set(id, answer.ok ? answer.body : null);
      });
    });
    return Promise.all(reading).then(() => render());
  }

  // The source changed (our edit, or Claude's): read the elements again.
  function refresh(state: EditorState): void {
    const [id, ...rest] = state.selection;
    if (!id) return;
    latest += 1;
    const mine = latest;
    const first = readInspect(slug, id).then((answer) => {
      if (mine !== latest || store.get().selection[0] !== id || !answer.ok) return;
      store.set({ inspected: answer.body });
    });
    inflight = Promise.all([first, readOthers(rest.slice(0, MAX_MANY - 1))]).then(() => undefined);
  }

  function onSelection(state: EditorState, previous: EditorState): void {
    if (state.selection[0] !== previous.selection[0]) {
      notes.clear();
      pending.clear();
      probes.clear();
      handleNote = null;
    }
    for (const id of [...others.keys()]) {
      if (!state.selection.slice(1).includes(id)) others.delete(id);
    }
    const missing = state.selection.slice(1, MAX_MANY).filter((id) => !others.has(id));
    if (missing.length > 0) void readOthers(missing);
  }

  store.subscribe((state, previous) => {
    if (state.selection !== previous.selection) onSelection(state, previous);
    if (state.selection[0] && state.etags !== previous.etags) refresh(state);
    const changed =
      state.on !== previous.on ||
      state.selection !== previous.selection ||
      state.inspected !== previous.inspected ||
      state.computed !== previous.computed ||
      state.refused !== previous.refused ||
      state.tree !== previous.tree ||
      state.structure !== previous.structure ||
      state.edit !== previous.edit ||
      // Stage 4c: the rows show the context's values, and the pickers warn with the card.
      state.context !== previous.context ||
      state.a11y !== previous.a11y ||
      // ADR 0055: the rows the kit's own state rule holds warn.
      state.stateHeld !== previous.stateHeld;
    if (changed) render();
  });

  // A handle that wrote nothing says why here, for the element it was on.
  main.addEventListener(HANDLE_NOTE, (event) => {
    const said = event instanceof CustomEvent ? readHandleNote(event.detail) : null;
    if (said === null || said.id !== store.get().selection[0]) return;
    handleNote = said.key;
    render();
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
