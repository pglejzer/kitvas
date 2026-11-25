// The properties panel (plan 13, task G; plan 15, task C; spec goal 8): the element's header,
// then its catalog props, text and style rows in fixed groups, each row writing at its source,
// tokens first. Every edit is sent as a gesture through `ctx.history.apply`; the panel never calls
// another panel. With several elements selected it reads each of them and shows the rows they
// share; a change goes to each as one gesture. A redraw keeps the focus, the caret and a
// half-typed value. The parts are in `props-*.ts`; this file mounts them and keeps their state.
// Plan 18 (task C, C8): the pane holds a head that stays in view and one part that scrolls; both
// are kept across redraws, so the scroll stays where the person left it. The rows of a new
// selection rise in once. Plan 18f (task 2): the Source strip is the pane's foot, in view under
// the rows; the drawing helpers are `pane-draw.ts`.

import type { EditOp, StyleProperty } from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { MAX_PREVIEW, type PreviewChange } from '../../../channel/edit-protocol.ts';
import { inspect as readInspect } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { uploadControl } from '../insert/image-upload.ts';
import { type EditorState, elementOf } from '../store.ts';
import { HANDLE_NOTE, readHandleNote } from '../style/handle-writes.ts';
import { MAX_OPS, refusalKey } from '../style/ops.ts';
import { previewContext, previewOf } from '../style/preview-of.ts';
import { text } from '../texts.ts';
import { BOX_START, type BoxState, ruleLink, pickSide as withSide } from './box.ts';
import { el } from './controls.ts';
import { createDrawScheduler } from './draw.ts';
import { readFolds, toggleFold, viewerStorage, writeFolds } from './groups.ts';
import { emptyView, fill, keptFocus, restoreFocus, rise, settle } from './pane-draw.ts';
import type { Env } from './rows.ts';
import { itemReread, itemTargetOf, refusedScope, type ScopeMode, switchCountOf } from './scope.ts';
import { type PanelUi, propsView } from './view.ts';

export { opsForProp, opsForStyle, readOnlyReason, refusalKey } from '../style/ops.ts';

/** Several elements: at most this many are read for the rows they share. */
export const MAX_MANY = 20;

/** What the panel draws: the head that stays in view, what scrolls under it, and the foot. */
type Drawn = { head: HTMLElement[]; body: HTMLElement[]; foot: HTMLElement[] };

/**
 * The live finding of `rule` on the selected element, in the block the live checks draw beside
 * the pane (`live/view.ts`), so Accessibility's problems can move the focus to it.
 */
function findingIn(panel: ParentNode, rule: string): HTMLElement | null {
  const block = panel.querySelector('[data-edit="live-props"]');
  for (const row of block?.querySelectorAll<HTMLElement>('[data-live-rule]') ?? []) {
    if (row.dataset.liveRule === rule && row.dataset.accepted === undefined) return row;
  }
  return null;
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
  /** ADR 0072: edits go to every item of a list, or to the one copy picked on the canvas. */
  let scope: ScopeMode = 'all';
  /** Why "This item" was refused (a `props.reason.*` key), until the selection changes. */
  let scopeNote: string | null = null;
  /** The rows whose typed field "Custom" opened under the kit's control, for this selection. */
  const custom = new Set<string>();
  let inflight: Promise<void> = Promise.resolve();
  let chain: Promise<void> = Promise.resolve();
  let latest = 0;
  let reads = 0;
  /** The pane's head (C8), the one part of it that scrolls, and the Source strip under it. */
  const headBox = el('div', 'props-top');
  const scrollBox = el('div', 'k-scroll props-scroll');
  const footBox = el('div', 'props-foot');
  settle(scrollBox);
  /** The selection whose rows are drawn now; its rows rose in when they were first drawn. */
  let drawn: string | null = null;
  // One draw for the asks of a frame; held while an edit or a re-read is on its way, so the rows
  // never show the old value of an element that is about to answer.
  const scheduler = createDrawScheduler({
    frame: (run) => void requestAnimationFrame(run),
    draw: () => draw(),
  });
  const render = (): void => scheduler.request();

  /** The hover preview: the ops' changes in the cards; `item` is the copy a list scope names. */
  function sendPreview(ops: readonly EditOp[] | null, item?: number): void {
    if (ops === null) {
      bridge.send({ type: 'unpreview' });
      return;
    }
    if (store.get().busy) return;
    const changes: PreviewChange[] = ops
      .flatMap((op) => {
        const change = previewOf(op);
        // `item` is a field of `PreviewChange` once the channel has it (plan 18e, task 5).
        return change ? [{ ...change, ...(item === undefined ? {} : { item }) }] : [];
      })
      .slice(0, MAX_PREVIEW);
    if (changes.length === 0) return;
    const width = ops.map(previewContext).find((one) => one !== null)?.width ?? null;
    if (bridge.sendPreview) bridge.sendPreview(changes, width);
    else bridge.send({ type: 'preview', changes });
  }

  /** The copy "This item" writes for: set only in that mode, with one element and one copy. */
  const itemNow = (state: EditorState) =>
    scope === 'item' && state.selection.length === 1 ? itemTargetOf(state) : null;

  const ui = (): PanelUi => ({
    folds,
    box,
    scope: {
      chosen: itemTargetOf(store.get()) !== null,
      pick(mode) {
        if (mode === scope) return;
        scope = mode;
        // The element is read again for the new scope; the draw is held until it answers.
        refresh(store.get());
        render();
      },
    },
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
    finding: (rule) => findingIn(ctx.panel, rule),
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

  function draw(): void {
    if (!section) return;
    const state = store.get();
    const kept = keptFocus(section);
    const focused = document.activeElement;
    // Nothing shows outside edit mode: the empty pane says how to start (its `data-empty`).
    if (!state.on) {
      drawn = null;
      section.replaceChildren();
      return;
    }
    const views = viewsOf(state);
    const count = state.selection.length;
    let view: Drawn = { head: [], body: [], foot: [] };
    if (count === 0) {
      // With nothing selected the box is closed: the next element opens it again.
      opened = null;
      view.body.push(emptyView(text('props.none')));
    } else if (count > MAX_MANY) {
      view.body.push(emptyView(text('props.many', { count }), text('props.many.tooMany')));
    } else if (!views || !state.edit) view.body.push(emptyView(text('props.loading')));
    else view = viewOf(state, views, state.edit);
    // The rows of another selection rise in once, when they are first drawn; they replace the old
    // ones whole. The same selection drawn again keeps every row that did not change.
    const key = view.head.length > 0 ? state.selection.join('\n') : null;
    const fresh = key !== drawn;
    fill(headBox, view.head, fresh);
    headBox.hidden = view.head.length === 0;
    fill(scrollBox, view.body, fresh);
    fill(footBox, view.foot, fresh);
    footBox.hidden = view.foot.length === 0;
    const placed = [headBox, scrollBox, footBox].every((box) => box.parentElement === section);
    if (!placed) section.replaceChildren(headBox, scrollBox, footBox);
    if (key !== null && fresh) rise(scrollBox);
    drawn = key;
    // The focus is put back only when its control was replaced.
    const stayed =
      focused instanceof HTMLElement &&
      section.contains(focused) &&
      document.activeElement === focused;
    if (!stayed) restoreFocus(section, kept);
  }

  function viewOf(
    state: EditorState,
    views: Inspect[],
    edit: NonNullable<EditorState['edit']>,
  ): Drawn {
    const [inspected] = views;
    if (!inspected) return { head: [], body: [], foot: [] };
    // The box opens on the link the element's rule says (ADR 0070), once for each element: a
    // link the person picks after that stays.
    if (opened !== inspected.id) {
      opened = inspected.id;
      linked = false;
      box = { ...box, link: ruleLink(inspected, box.layer) ?? box.link };
    }
    const switchCount = switchCountOf(inspected, views.length, edit.format);
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
      preview: (ops) => sendPreview(ops, itemNow(state)?.item),
      scope: switchCount === null ? null : { mode: scope, count: switchCount },
      custom: {
        has: (row) => custom.has(row),
        toggle(row) {
          if (!custom.delete(row)) custom.add(row);
          render();
        },
      },
    };
    const view = propsView(env, ui());
    // Under the head: the suggestion, what a handle could not write, then the notes.
    const lead: HTMLElement[] = view.offer === null ? [] : [view.offer];
    if (handleNote !== null) {
      const said = el('p', 'props-hint', text(handleNote));
      said.setAttribute('role', 'status');
      lead.push(said);
    }
    if (scopeNote !== null) lead.push(el('p', 'props-hint', text(scopeNote)));
    lead.push(...view.notes);
    const body: HTMLElement[] = [];
    if (lead.length > 0) {
      const under = el('div', 'props-lead');
      under.append(...lead);
      body.push(under);
    }
    body.push(...view.groups);
    return { head: view.head, body, foot: view.foot };
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
        // Held until the answer is in; an applied edit starts `refresh`, which holds on its own.
        scheduler.hold();
        try {
          const item = itemNow(state)?.item;
          const outcome = await history.apply({
            ops,
            label,
            flash: row === 'suggest',
            ...(item === undefined ? {} : { item }),
          });
          if (outcome?.outcome === 'applied' && watched && views?.length === 1) {
            pending.set(row, { property: watched, before });
          }
        } finally {
          scheduler.release();
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
    // No draw until the elements are read again, also when a read fails.
    scheduler.hold();
    // The chosen copy's path reads its list for that copy (as `select/mode.ts` does); in "This
    // item" the answer is also read for the item's own class.
    const target = state.selection.length === 1 ? itemTargetOf(state) : null;
    const path = target?.path;
    const own = scope === 'item' && target !== null;
    const read = (item: boolean) => readInspect(slug, id, path, item ? 'item' : undefined);
    const take = (answer: Awaited<ReturnType<typeof read>>): boolean =>
      mine === latest && store.get().selection[0] === id && answer.ok;
    const first = read(own).then(async (answer) => {
      if (!take(answer) || !answer.ok) return;
      const refused = own ? refusedScope(answer.body) : null;
      if (refused === null) {
        store.set({ inspected: answer.body });
        return;
      }
      // The item can have no class of its own: back to every item, and the reason stays shown.
      scope = 'all';
      scopeNote = `props.reason.${refused}`;
      const plain = await read(false);
      if (take(plain) && plain.ok) store.set({ inspected: plain.body });
    });
    inflight = Promise.all([first, readOthers(rest.slice(0, MAX_MANY - 1))])
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => scheduler.release());
  }

  function onSelection(state: EditorState, previous: EditorState): void {
    if (state.selection[0] !== previous.selection[0]) {
      notes.clear();
      pending.clear();
      probes.clear();
      handleNote = null;
      scope = 'all';
      scopeNote = null;
      custom.clear();
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
    else if (scope === 'item' && state.selection[0]) {
      const next = itemReread(state, previous);
      scope = next.scope;
      if (next.read) refresh(state);
    }
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
