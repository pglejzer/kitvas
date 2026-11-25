// The properties panel (plan 13, task G; plan 15, task C; spec goal 8): the element's header,
// then its catalog props, text and style rows in fixed groups, each row writing at its source,
// tokens first. Every edit is sent as a gesture through `ctx.history.apply`; the panel never calls
// another panel. With several elements selected it reads each of them and shows the rows they
// share; a change goes to each as one gesture. A redraw keeps the focus, the caret and a
// half-typed value. The parts are in `props-*.ts`; this file mounts them and keeps their state.
// Plan 18 (task C, C8): the pane holds a head that stays in view and one part that scrolls; both
// are kept across redraws, so the scroll stays where the person left it. The rows of a new
// selection rise in once.

import type { EditOp, StyleProperty } from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { inspect as readInspect } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { uploadControl } from '../insert/image-upload.ts';
import { type EditorState, elementOf } from '../store.ts';
import { HANDLE_NOTE, readHandleNote } from '../style/handle-writes.ts';
import { MAX_OPS, refusalKey } from '../style/ops.ts';
import { text } from '../texts.ts';
import { BOX_START, type BoxState, ruleLink, pickSide as withSide } from './box.ts';
import { el, showCustom } from './controls.ts';
import { readFolds, toggleFold, viewerStorage, writeFolds } from './groups.ts';
import type { Env } from './rows.ts';
import { type PanelUi, propsView } from './view.ts';

export { opsForProp, opsForStyle, readOnlyReason, refusalKey } from '../style/ops.ts';

/** Several elements: at most this many are read for the rows they share. */
export const MAX_MANY = 20;

/** What the panel draws: the head that stays in view, and what scrolls under it. */
type Drawn = { head: HTMLElement[]; body: HTMLElement[] };

/** A line in place of the rows: nothing selected, too many, or the element still being read. */
function emptyView(...lines: string[]): HTMLElement {
  const box = el('div', 'k-empty');
  const [first, ...rest] = lines;
  if (first !== undefined) box.append(el(rest.length > 0 ? 'strong' : 'p', undefined, first));
  for (const line of rest) box.append(el('p', undefined, line));
  return box;
}

/**
 * Starts an element's entrance again (`.k-rise`), as when it was just shown. An element not shown
 * now (another tab, a folded panel) does not rise: it comes in with its pane when that is shown.
 */
function rise(node: HTMLElement): void {
  node.classList.remove('k-rise');
  // Reading the layout ends the old animation, so the class starts a new one.
  if (node.getClientRects().length === 0) return;
  node.classList.add('k-rise');
}

/** The entrance's class goes once it has run, so showing the pane later does not run it again. */
function settle(node: HTMLElement): void {
  const done = (event: Event): void => {
    if (event.target === node) node.classList.remove('k-rise');
  };
  node.addEventListener('animationend', done);
  node.addEventListener('animationcancel', done);
}

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
  /** The element the box's link was last read for, and whether the person picked a link on it. */
  let opened: string | null = null;
  let linked = false;
  let handleNote: string | null = null;
  let inflight: Promise<void> = Promise.resolve();
  let chain: Promise<void> = Promise.resolve();
  let latest = 0;
  let reads = 0;
  /** The pane's head (`.k-pad`, C8) and the one part of it that scrolls. */
  const headBox = el('div', 'k-pad props-top');
  const scrollBox = el('div', 'k-scroll props-scroll');
  settle(scrollBox);
  /** The selection whose rows are drawn now; its rows rose in when they were first drawn. */
  let drawn: string | null = null;

  const ui = (): PanelUi => ({
    folds,
    box,
    toggle(id) {
      folds = toggleFold(folds, id);
      writeFolds(storage, folds);
      render();
    },
    pickSide(layer, side) {
      const moved = layer !== box.layer;
      box = withSide(box, layer, side);
      // Another layer opens on the link its own values say, unless the person picked a link.
      const first = store.get().inspected;
      if (moved && first && !linked) box = { ...box, link: ruleLink(first, layer) ?? box.link };
      render();
    },
    link(link) {
      box = { ...box, link };
      linked = true;
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
    // Nothing shows outside edit mode: the empty pane says how to start (its `data-empty`).
    if (!state.on) {
      drawn = null;
      section.replaceChildren();
      return;
    }
    const views = viewsOf(state);
    const count = state.selection.length;
    let view: Drawn = { head: [], body: [] };
    if (count === 0) {
      // With nothing selected the box is closed: the next element opens it again.
      opened = null;
      view.body.push(emptyView(text('props.none')));
    } else if (count > MAX_MANY) {
      view.body.push(emptyView(text('props.many', { count }), text('props.many.tooMany')));
    } else if (!views || !state.edit) view.body.push(emptyView(text('props.loading')));
    else view = viewOf(state, views, state.edit);
    headBox.replaceChildren(...view.head);
    headBox.hidden = view.head.length === 0;
    scrollBox.replaceChildren(...view.body);
    if (headBox.parentElement !== section || scrollBox.parentElement !== section) {
      section.replaceChildren(headBox, scrollBox);
    }
    // The rows of another selection rise in once, when they are first drawn.
    const key = view.head.length > 0 ? state.selection.join('\n') : null;
    if (key !== null && key !== drawn) rise(scrollBox);
    drawn = key;
    restoreFocus(section, kept);
  }

  function viewOf(
    state: EditorState,
    views: Inspect[],
    edit: NonNullable<EditorState['edit']>,
  ): Drawn {
    const [inspected] = views;
    if (!inspected) return { head: [], body: [] };
    // The box opens on the link the element's rule says (ADR 0070), once for each element: a
    // link the person picks after that stays.
    if (opened !== inspected.id) {
      opened = inspected.id;
      linked = false;
      box = { ...box, link: ruleLink(inspected, box.layer) ?? box.link };
    }
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
    // Under the head: the suggestion, what a handle could not write, then the notes.
    const lead: HTMLElement[] = view.offer === null ? [] : [view.offer];
    if (handleNote !== null) {
      const said = el('p', 'props-hint', text(handleNote));
      said.setAttribute('role', 'status');
      lead.push(said);
    }
    lead.push(...view.notes);
    const body: HTMLElement[] = [];
    if (lead.length > 0) {
      const under = el('div', 'props-lead');
      under.append(...lead);
      body.push(under);
    }
    body.push(...view.groups);
    return { head: view.head, body };
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
        // The suggestion is applied by its button: the ring shows what it changed.
        const outcome = await history.apply({ ops, label, flash: row === 'suggest' });
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
