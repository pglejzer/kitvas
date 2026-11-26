// Edit mode: the top bar's Preview | Edit switch, selection by click, Shift-, Ctrl- or Cmd-click
// and keys (plan 13, task F; plan 15, task A). It talks to the frame through the bridge and to the
// other panels only through the store and the history. `store.on` is the truth;
// `main.dataset.mode` follows it, so the screen outside the editor reads the mode there, and
// `main[data-selected]` marks the rails while something is selected. A click takes the copy it
// was on (ADR 0065, `copies.ts`); this file alone tells the frame the selection and its copies.
// A double click edits a text in place: a plain one here, one through its source in
// `source-text.ts` (ADR 0060). The session's controls are `session.ts`.

import { samePath as samePathOf } from '../../../../src/shared/values/paths.ts';
import { type EditFrameMessage, textEditOf } from '../../../channel/edit-protocol.ts';
import type { Mode } from '../../shell/layout.ts';
import { inspect } from '../api.ts';
import type { EditorContext } from '../context.ts';
import type { EditorState } from '../store.ts';
import { text } from '../texts.ts';
import { chosenCopy, pickSelection, sameChosen, selectBody } from './copies.ts';
import { modeStorage, writeMode } from './mode-memory.ts';
import { firstChildOf, parentOf } from './selection.ts';
import { createSourceText, doubleKind } from './source-text.ts';

const sameIds = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index]);

const samePath = (a: readonly number[] | undefined, b: readonly number[] | undefined): boolean =>
  a === undefined || b === undefined ? a === b : samePathOf(a, b);

/** The path of the one chosen copy of the one selected element: what its list is read for. */
export const inspectPath = (
  state: Pick<EditorState, 'selection' | 'copies'>,
): readonly number[] | undefined => chosenCopy(state.selection, state.copies)?.path;

/** The screen's mode for the editor's `on`. */
export const modeOf = (on: boolean): Mode => (on ? 'edit' : 'preview');

/**
 * What pressing a mode button asks of the store; `null` when the editor is in that mode already.
 * Preview turns editing off and drops what Edit picked, as the toggle did before.
 */
export function modePatch(on: boolean, pressed: Mode): Partial<EditorState> | null {
  if (pressed === 'edit') return on ? null : { on: true };
  if (!on) return null;
  return { on: false, selection: [], hovered: null, inspected: null, computed: null };
}

export function mountMode(ctx: EditorContext): void {
  const { store, bridge, main, history } = ctx;
  const buttons = [...main.querySelectorAll<HTMLButtonElement>('button[data-shell-mode]')];

  /** Answers of the API to an older selection are dropped by this number. */
  let inspectToken = 0;
  let frameRequest = -1;
  /** A double click waits here for the source view of its element, with the copy it was on. */
  let pendingDouble: { id: string; item: number | null } | null = null;
  const source = createSourceText(ctx);

  function sendInspectToFrame(id: string): void {
    frameRequest = bridge.nextRequest();
    bridge.send({ type: 'inspect', request: frameRequest, id });
  }

  /** A double click on copy `item` of `id`, once its source view is in. */
  function editTextOf(id: string, item: number | null): void {
    const kind = doubleKind(store.get(), id, item);
    if (kind === 'text') bridge.send({ type: 'edit-text', id });
    else if (kind === 'source') source.open(id, item);
    // `item`: `lists.ts` opens the field of a literal list item; `none`: nothing to type in.
  }

  function load(id: string, keep: boolean): void {
    const token = ++inspectToken;
    if (!keep) store.set({ inspected: null, computed: null });
    sendInspectToFrame(id);
    // With the chosen copy's path the list is read for that copy: the features of that plan.
    inspect(store.get().slug, id, inspectPath(store.get())).then((answer) => {
      if (token !== inspectToken || store.get().selection[0] !== id) return;
      store.set({ inspected: answer.ok ? answer.body : null });
      const waiting = pendingDouble;
      if (waiting?.id === id) {
        pendingDouble = null;
        editTextOf(id, waiting.item);
      }
    });
  }

  function onSelection(state: EditorState): void {
    bridge.send(selectBody(state));
    const first = state.selection[0];
    if (first === undefined) {
      inspectToken += 1;
      if (state.inspected !== null || state.computed !== null) {
        store.set({ inspected: null, computed: null });
      }
      return;
    }
    load(first, false);
  }

  function renderMode(on: boolean): void {
    const mode = modeOf(on);
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.shellMode === mode));
    }
    main.dataset.mode = mode;
  }

  function requestTree(): void {
    bridge.send({ type: 'tree', request: bridge.nextRequest() });
  }

  function onToggle(on: boolean): void {
    renderMode(on);
    bridge.send({ type: 'edit', on });
    if (!on) return;
    requestTree();
    const state = store.get();
    if (state.selection.length > 0) bridge.send(selectBody(state));
  }

  store.subscribe((state, previous) => {
    if (state.on !== previous.on) onToggle(state.on);
    if (state.selection !== previous.selection) {
      main.toggleAttribute('data-selected', state.selection.length > 0);
    }
    const first = state.selection[0];
    if (state.on && !sameIds(state.selection, previous.selection)) {
      onSelection(state);
    } else if (state.on && state.copies !== previous.copies) {
      // The same elements on other copies: the frame outlines those, and the list of the first
      // one is read again when its copy stands in another list.
      bridge.send(selectBody(state));
      const moved = !samePath(inspectPath(state), inspectPath(previous));
      if (first !== undefined && (moved || state.etags !== previous.etags)) load(first, true);
    } else if (state.on && state.etags !== previous.etags && first !== undefined) {
      // A file changed (our edit, or Claude's): the source view of the element may have moved.
      load(first, true);
    }
  });

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const pressed: Mode = button.dataset.shellMode === 'edit' ? 'edit' : 'preview';
      const patch = modePatch(store.get().on, pressed);
      if (patch === null) return;
      if (pressed === 'preview') pendingDouble = null;
      // Only a press is the person's choice; it outlives a version switch.
      writeMode(modeStorage(), store.get().slug, pressed);
      store.set(patch);
    });
  }

  function onKey(key: Extract<EditFrameMessage, { type: 'key' }>['key']): void {
    const { selection, tree } = store.get();
    const first = selection[0];
    if (key === 'clear') store.set({ selection: [] });
    else if (key === 'undo') void history.undo();
    else if (key === 'redo') void history.redo();
    else if (first === undefined) return;
    else if (key === 'parent') {
      const parent = parentOf(tree, first);
      if (parent !== null) store.set({ selection: [parent] });
    } else if (key === 'child') {
      const child = firstChildOf(tree, first);
      if (child !== null) store.set({ selection: [child] });
    }
  }

  function onText(id: string, value: string | null): void {
    const inspected = store.get().inspected;
    if (value === null || inspected?.id !== id || inspected.text === null) return;
    if (value === inspected.text) return;
    const gesture = {
      ops: [{ op: 'setText' as const, id, value, before: inspected.text }],
      label: text('label.text'),
    };
    // A write that did not happen takes the typed text back out of the frame.
    void history.apply(gesture).then((outcome) => {
      if (outcome?.outcome !== 'applied') bridge.send({ type: 'text-back', id });
    });
  }

  function onTree(nodes: EditorState['tree']): void {
    const state = store.get();
    const known = new Set(nodes.map((node) => node.id));
    // Ids that are gone after a build leave the selection; an empty tree prunes nothing.
    const kept =
      nodes.length === 0 ? state.selection : state.selection.filter((id) => known.has(id));
    // What stays selected stays on its copies.
    const pruned =
      kept.length === state.selection.length ? {} : { selection: kept, copies: state.copies };
    store.set({ tree: nodes, ...pruned });
    // A tree after a build: the computed values of the selection are from the old page.
    const after = store.get();
    const first = after.selection[0];
    if (!state.on || first === undefined) return;
    sendInspectToFrame(first);
    // A page that loaded again was told the selection before it knew its copies: once more.
    if (after.copies.length > 0) bridge.send(selectBody(after));
  }

  bridge.on((message) => {
    const state = store.get();
    if (!state.on) return;
    switch (message.type) {
      case 'pick': {
        pendingDouble = null;
        // A double click with Shift, Ctrl or Cmd held: its first click added or took the element
        // out, and it starts no text edit.
        if (message.double && message.add) break;
        const next = pickSelection(state, message);
        if (!sameChosen(next, state)) store.set(next);
        const edited = textEditOf(message);
        if (edited !== null) {
          // Edited once the element's source view is in: another selection reads it first.
          const item = message.item ?? null;
          if (store.get().inspected?.id === edited) editTextOf(edited, item);
          else pendingDouble = { id: edited, item };
        }
        break;
      }
      case 'hovered':
        if (message.id !== state.hovered) store.set({ hovered: message.id });
        break;
      case 'key':
        onKey(message.key);
        break;
      case 'tree':
        onTree(message.nodes);
        break;
      case 'inspected':
        if (message.request === frameRequest && message.id === state.selection[0]) {
          store.set({ computed: message.found ? message.styles : null });
        }
        break;
      case 'text':
        onText(message.id, message.value);
        break;
    }
  });

  renderMode(store.get().on);
}
