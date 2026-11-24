// Edit mode: the toggle, selection by click, Shift-click and keys, the session line and "Save
// version" (plan 13, task F). It talks to the frame through the bridge and to the other panels
// only through the store and the history.

import type { EditFrameMessage } from '../../channel/edit-protocol.ts';
import { endSession, getEditState, inspect } from './api.ts';
import type { EditorContext } from './context.ts';
import { firstChildOf, nextSelection, parentOf } from './selection.ts';
import type { EditorState } from './store.ts';
import { text } from './texts.ts';

const sameIds = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index]);

export function mountMode(ctx: EditorContext): void {
  const { store, bridge, panel, main, history } = ctx;
  const toggle = main.querySelector('button[data-edit-toggle]');
  const session = panel.querySelector('[data-edit-session]');
  const save = panel.querySelector('button[data-edit-save]');

  /** Answers of the API to an older selection are dropped by this number. */
  let inspectToken = 0;
  let frameRequest = -1;
  /** A double click waits here for the source view of its element. */
  let pendingDouble: string | null = null;

  function sendInspectToFrame(id: string): void {
    frameRequest = bridge.nextRequest();
    bridge.send({ type: 'inspect', request: frameRequest, id });
  }

  function editTextOf(id: string): void {
    const inspected = store.get().inspected;
    if (inspected?.id === id && inspected.text !== null) bridge.send({ type: 'edit-text', id });
  }

  function load(id: string, keep: boolean): void {
    const token = ++inspectToken;
    if (!keep) store.set({ inspected: null, computed: null });
    sendInspectToFrame(id);
    inspect(store.get().slug, id).then((answer) => {
      if (token !== inspectToken || store.get().selection[0] !== id) return;
      store.set({ inspected: answer.ok ? answer.body : null });
      if (pendingDouble === id) {
        pendingDouble = null;
        editTextOf(id);
      }
    });
  }

  function onSelection(state: EditorState): void {
    bridge.send({ type: 'select', ids: state.selection });
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

  function renderSession(state: EditorState): void {
    const open = state.edit?.session ?? null;
    if (session) {
      session.textContent = open
        ? text('session.open', { version: open.version })
        : text('session.none');
    }
    if (save instanceof HTMLButtonElement) save.disabled = open === null;
  }

  function renderToggle(on: boolean): void {
    if (toggle instanceof HTMLElement) toggle.setAttribute('aria-pressed', String(on));
    panel.hidden = !on;
  }

  function requestTree(): void {
    bridge.send({ type: 'tree', request: bridge.nextRequest() });
  }

  function onToggle(on: boolean): void {
    renderToggle(on);
    bridge.send({ type: 'edit', on });
    if (!on) return;
    requestTree();
    const { selection } = store.get();
    if (selection.length > 0) bridge.send({ type: 'select', ids: selection });
  }

  store.subscribe((state, previous) => {
    if (state.on !== previous.on) onToggle(state.on);
    if (state.edit !== previous.edit) renderSession(state);
    if (state.on && !sameIds(state.selection, previous.selection)) {
      onSelection(state);
    } else if (state.on && state.etags !== previous.etags && state.selection[0] !== undefined) {
      // A file changed (our edit, or Claude's): the source view of the element may have moved.
      load(state.selection[0], true);
    }
  });

  if (toggle instanceof HTMLElement) {
    toggle.addEventListener('click', () => {
      const state = store.get();
      if (state.on) {
        pendingDouble = null;
        store.set({ on: false, selection: [], hovered: null, inspected: null, computed: null });
      } else {
        store.set({ on: true });
      }
    });
  }

  if (save instanceof HTMLButtonElement) {
    save.addEventListener('click', async () => {
      save.disabled = true;
      const slug = store.get().slug;
      await endSession(slug);
      const state = await getEditState(slug);
      if (state.ok) store.set({ edit: state.body, etags: state.body.etags, undo: [], redo: [] });
      else renderSession(store.get());
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
    void history.apply({
      ops: [{ op: 'setText', id, value, before: inspected.text }],
      label: text('label.text'),
    });
  }

  function onTree(nodes: EditorState['tree']): void {
    const state = store.get();
    const known = new Set(nodes.map((node) => node.id));
    // Ids that are gone after a build leave the selection; an empty tree prunes nothing.
    const kept =
      nodes.length === 0 ? state.selection : state.selection.filter((id) => known.has(id));
    const pruned = kept.length === state.selection.length ? {} : { selection: kept };
    store.set({ tree: nodes, ...pruned });
    // A tree after a build: the computed values of the selection are from the old page.
    const first = store.get().selection[0];
    if (state.on && first !== undefined) sendInspectToFrame(first);
  }

  bridge.on((message) => {
    const state = store.get();
    if (!state.on) return;
    switch (message.type) {
      case 'pick': {
        pendingDouble = null;
        const selection = nextSelection(state.selection, {
          id: message.id,
          add: message.add && !message.double,
        });
        if (message.double && message.id !== null) {
          pendingDouble = message.id;
          if (state.inspected?.id === message.id) editTextOf(message.id);
          if (state.inspected?.id === message.id) pendingDouble = null;
        }
        if (!sameIds(selection, state.selection)) store.set({ selection });
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

  renderToggle(store.get().on);
  renderSession(store.get());
}
