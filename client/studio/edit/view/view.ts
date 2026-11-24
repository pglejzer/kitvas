// Locked and hidden elements that last (spec 4d, goal 4; plan 17, task C): loads `store.locked`
// and `store.hidden` from `view.json` at start, saves both lists whole when Layers or the menu
// change them (debounced, never while an edit is on its way), and shows the locks another writer
// changed: `store.lockChanged`, a Live item of rule `edit/locked-changed` on each, and Restore in
// the locks box. Lost locks (the element was not found) ask to be locked again. The lists are
// read again after each applied edit (a move renames ids) and on each `locks` event of the draft.
// Locks and hide never reach a build or a source file: the frame only marks them.

import { onStudioEvent } from '../../live/live.ts';
import { postRequest } from '../ai/api.ts';
import type { EditorContext } from '../context.ts';
import { showDiff } from '../diff/diff-dialog.ts';
import { elementName } from '../history/changes.ts';
import type { EditorState } from '../store.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';
import { getView, postLockRestore, postView } from './api.ts';
import { mountLocksBox } from './locks-view.ts';
import {
  lockItems,
  locksModel,
  locksSlugOf,
  restoreAsk,
  sameIds,
  type ViewAnswer,
  viewToSave,
  withLockItems,
} from './model.ts';

/** How long after the last change of a list it is written. */
const SAVE_MS = 400;

export function mountView(ctx: EditorContext): void {
  const { store, bridge, slug, main, history } = ctx;
  /** Locks whose element was not found, kept until the person locks again or forgets them. */
  let lost: string[] = [];
  /** The lists as the server last wrote or read them. */
  let saved: { locked: string[]; hidden: string[] } = { locked: [], hidden: [] };
  let loaded = false;
  let saving = false;
  /** A list changed in a way `saved` does not show (a lost lock forgotten). */
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const box = mountLocksBox(ctx, { restore, unlock, lockAgain, forget });
  const render = (): void => box.render(locksModel(store.get(), lost));

  function sendLists(patch: Partial<EditorState>): void {
    if (patch.locked) bridge.send({ type: 'lock', ids: [...patch.locked] });
    // As the structure sync does: hidden elements only while editing.
    if (patch.hidden && store.get().on) bridge.send({ type: 'hide', ids: [...patch.hidden] });
  }

  /** Takes a view answer; the lists only when no change of the person's waits to be written. */
  function take(view: ViewAnswer, lists: boolean): void {
    lost = view.lost;
    const state = store.get();
    const patch: Partial<EditorState> = {};
    if (lists) {
      saved = { locked: view.locked, hidden: view.hidden };
      if (!sameIds(state.locked, view.locked)) patch.locked = view.locked;
      if (!sameIds(state.hidden, view.hidden)) patch.hidden = view.hidden;
    }
    if (!sameIds(state.lockChanged, view.changed)) patch.lockChanged = view.changed;
    if (Object.keys(patch).length > 0) store.set(patch);
    sendLists(patch);
    render();
  }

  async function load(): Promise<void> {
    const view = await getView(slug);
    if (view === null) return;
    loaded = true;
    take(view, timer === null && !saving && !dirty);
  }

  const differs = (state: EditorState): boolean =>
    dirty || !sameIds(state.locked, saved.locked) || !sameIds(state.hidden, saved.hidden);

  function schedule(): void {
    if (!loaded) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void save();
    }, SAVE_MS);
  }

  async function save(): Promise<void> {
    const state = store.get();
    // An edit on its way may rename ids: the lists are written once it is back.
    if (saving || state.busy) {
      schedule();
      return;
    }
    if (!differs(state)) return;
    saving = true;
    dirty = false;
    const lists = viewToSave(state, lost);
    const view = await postView(slug, lists);
    saving = false;
    if (view === null) {
      box.say(text('locks.saveFailed'));
      return;
    }
    box.say('');
    const now = store.get();
    // Changed again meanwhile: those changes are written next, the answer's lists are not taken.
    const same = sameIds(now.locked, state.locked) && sameIds(now.hidden, state.hidden);
    take(view, same && timer === null);
    if (!same) schedule();
  }

  function unlock(id: string): void {
    const state = store.get();
    const locked = state.locked.filter((one) => one !== id);
    store.set({ locked, lockChanged: state.lockChanged.filter((one) => one !== id) });
    sendLists({ locked });
  }

  function lockAgain(lostId: string): void {
    const state = store.get();
    const target = state.selection[0];
    if (target === undefined || state.locked.includes(target)) return;
    lost = lost.filter((one) => one !== lostId);
    dirty = true;
    const locked = [...state.locked, target];
    store.set({ locked });
    sendLists({ locked });
    schedule();
  }

  function forget(lostId: string): void {
    lost = lost.filter((one) => one !== lostId);
    dirty = true;
    render();
    schedule();
  }

  function askClaude(id: string, missing: readonly string[], old: string): void {
    const request = {
      kind: 'ask' as const,
      elements: [id],
      context: store.get().context,
      text: restoreAsk(id, missing, old),
    };
    void postRequest(slug, request).then((sent) => {
      toast(main, text(sent ? 'locks.asked' : 'locks.askFailed'));
    });
  }

  async function restore(id: string): Promise<void> {
    const answer = await postLockRestore(slug, id);
    if (!answer.ok) {
      toast(main, text(answer.code === 'EDIT_ELEMENT_NOT_FOUND' ? 'locks.gone' : 'locks.failed'));
      void load();
      return;
    }
    const preview = answer.body;
    const name = elementName(id);
    showDiff(ctx, {
      title: text('locks.restoreTitle', { name }),
      file: preview.file,
      old: preview.old,
      current: preview.current,
      imports: preview.imports,
      missing: preview.missing,
      accept: () => {
        const ops = preview.ops;
        if (ops === null) return;
        void history.apply({ ops, label: text('locks.restoreLabel', { name }) }).then(() => load());
      },
      askClaude:
        preview.missing.length > 0 ? () => askClaude(id, preview.missing, preview.old) : undefined,
    });
  }

  store.subscribe((state, previous) => {
    if (state.locked !== previous.locked || state.hidden !== previous.hidden) {
      if (differs(state)) schedule();
    }
    // Hidden elements show again outside edit mode; back in it they are hidden once more.
    if (state.on && !previous.on && state.hidden.length > 0) {
      bridge.send({ type: 'hide', ids: [...state.hidden] });
    }
    // An applied edit may rename the ids of locked and hidden elements.
    if (state.applied !== previous.applied) void load();
    // The live checks write `store.live` from their own lists: the lock items are put back.
    if (state.live !== previous.live || state.lockChanged !== previous.lockChanged) {
      const live = withLockItems(state.live, lockItems(state.lockChanged, text('locks.live')));
      if (live !== null) store.set({ live });
    }
    const boxed =
      state.on !== previous.on ||
      state.selection !== previous.selection ||
      state.locked !== previous.locked ||
      state.lockChanged !== previous.lockChanged ||
      state.refused !== previous.refused;
    if (boxed) render();
  });

  onStudioEvent((event) => {
    if (locksSlugOf(event) === slug) void load();
  });

  render();
  void load();
}
