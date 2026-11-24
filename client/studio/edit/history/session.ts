// The editing session in the top bar (plan 15, task D): undo and redo buttons, the session line
// ("Version 4, 3 changes"), "Save version", and "Undo save" for 8 seconds after a save. The
// decisions are pure functions over plain data; `mountSession` only wires them to the buttons.

import type { EditOp } from '../../../../src/edit/index.ts';
import type { EditState } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { endSession, getEditState, reopenSession } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { requestFullCheck } from '../live/check.ts';
import type { EditorState, Gesture } from '../store.ts';
import { text } from '../texts.ts';

/** How long "Undo save" stays after a save. */
export const UNDO_SAVE_MS = 8000;
/** How long the note of a refused "Undo save" stays in the session line. */
export const NOTE_MS = 5000;

type OpenSession = NonNullable<EditState['session']>;

/** What a save leaves for "Undo save": the session and both stacks as they were. */
export type KeptSession = {
  session: OpenSession;
  undo: Gesture[];
  redo: Gesture[];
  savedAt: number;
};

/** A raw style value (marked off-kit in the code), as `history.ts` counts it. */
/** A raw value written with the off-kit marker; a keyword or an image (`mark: false`) is not one. */
const isOffKitOp = (op: EditOp): boolean =>
  op.op === 'setStyle' && 'raw' in op.value && op.value.mark !== false;

/** Steps that wrote a value outside the kit. */
export const offKitSteps = (steps: readonly Gesture[]): number =>
  steps.filter((step) => step.ops.some(isOffKitOp)).length;

/** A line of the session text: a key under `studio.edit.` and its values. */
export type LinePart = { key: string; params: Record<string, number> };

/**
 * What the session line says. No session: the first change starts a version. An open one: its
 * version and how many steps are on the undo stack, and the off-kit count when there is one.
 */
export function sessionLine(open: OpenSession | null, undo: readonly Gesture[]): LinePart[] {
  if (open === null) return [{ key: 'session.none', params: {} }];
  const parts: LinePart[] = [
    {
      key: undo.length === 1 ? 'session.change' : 'session.changes',
      params: { version: open.version, count: undo.length },
    },
  ];
  const off = offKitSteps(undo);
  if (off > 0) parts.push({ key: 'session.offKit', params: { count: off } });
  return parts;
}

export type ButtonStates = { undo: boolean; redo: boolean; save: boolean };

/** Which bar buttons are disabled (`true`): an empty stack, a request on its way, no session. */
export function disabledButtons(
  state: Pick<EditorState, 'undo' | 'redo' | 'busy' | 'edit'>,
): ButtonStates {
  const session = state.edit?.session ?? null;
  return {
    undo: state.busy || state.undo.length === 0,
    redo: state.busy || state.redo.length === 0,
    save: state.busy || session === null,
  };
}

/** The milliseconds "Undo save" has left; 0 when its window is over (or the clock went back). */
export function undoSaveLeft(savedAt: number, now: number): number {
  const left = UNDO_SAVE_MS - (now - savedAt);
  return now < savedAt ? 0 : Math.max(0, left);
}

/** "Undo save" shows while its window is open and no new session has started since the save. */
export function undoSaveVisible(
  kept: KeptSession | null,
  now: number,
  current: OpenSession | null,
): boolean {
  return kept !== null && current === null && undoSaveLeft(kept.savedAt, now) > 0;
}

/** What the page does with the answer of the reopen call. */
export function reopenOutcome(answer: {
  ok: boolean;
  status: number;
}): 'reopened' | 'refused' | 'failed' {
  if (answer.ok) return 'reopened';
  return answer.status === 409 ? 'refused' : 'failed';
}

export function mountSession(ctx: EditorContext): void {
  const { store, main, history } = ctx;
  const query = <T extends Element>(selector: string, kind: new () => T): T | null => {
    const found = main.querySelector(selector);
    return found instanceof kind ? found : null;
  };
  const undoButton = query('button[data-edit-undo]', HTMLButtonElement);
  const redoButton = query('button[data-edit-redo]', HTMLButtonElement);
  const saveButton = query('button[data-edit-save]', HTMLButtonElement);
  const unsaveButton = query('button[data-edit-unsave]', HTMLButtonElement);
  const line = main.querySelector('[data-edit-session]');

  let kept: KeptSession | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let note: string | null = null;
  let noteTimer: ReturnType<typeof setTimeout> | undefined;

  function render(): void {
    const state = store.get();
    const disabled = disabledButtons(state);
    if (undoButton) undoButton.disabled = disabled.undo;
    if (redoButton) redoButton.disabled = disabled.redo;
    if (saveButton) saveButton.disabled = disabled.save;
    if (line) {
      line.textContent =
        note ??
        sessionLine(state.edit?.session ?? null, state.undo)
          .map((part) => text(part.key, part.params))
          .join(' · ');
    }
    if (unsaveButton) {
      unsaveButton.hidden = !undoSaveVisible(kept, Date.now(), state.edit?.session ?? null);
    }
  }

  function forget(): void {
    kept = null;
    clearTimeout(hideTimer);
    render();
  }

  function say(key: string): void {
    note = text(key);
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      note = null;
      render();
    }, NOTE_MS);
    render();
  }

  async function refresh(patch: Partial<EditorState>): Promise<boolean> {
    const answer = await getEditState(store.get().slug);
    if (!answer.ok) return false;
    store.set({ edit: answer.body, etags: answer.body.etags, ...patch });
    return true;
  }

  async function save(): Promise<void> {
    const before = store.get();
    const open = before.edit?.session ?? null;
    if (open === null || before.busy) return;
    if (saveButton) saveButton.disabled = true;
    const ended = await endSession(before.slug);
    const stacks = { undo: before.undo, redo: before.redo };
    const read = await refresh({ undo: [], redo: [] });
    if (!read) {
      render();
      return;
    }
    if (ended.ok && ended.body.ended) {
      kept = { session: open, ...stacks, savedAt: Date.now() };
      clearTimeout(hideTimer);
      hideTimer = setTimeout(forget, UNDO_SAVE_MS);
      // Smart validation (spec 4c): only now does the full check run, in the background.
      requestFullCheck(main);
    }
    render();
  }

  async function unsave(): Promise<void> {
    const keep = kept;
    if (keep === null) return;
    if (unsaveButton) unsaveButton.disabled = true;
    const answer = await reopenSession(store.get().slug, keep.session);
    forget();
    if (unsaveButton) unsaveButton.disabled = false;
    const outcome = reopenOutcome(answer);
    if (outcome === 'reopened' && (await refresh({ undo: keep.undo, redo: keep.redo }))) return;
    say(outcome === 'refused' ? 'unsave.refused' : 'unsave.failed');
  }

  undoButton?.addEventListener('click', () => void history.undo());
  redoButton?.addEventListener('click', () => void history.redo());
  saveButton?.addEventListener('click', () => void save());
  unsaveButton?.addEventListener('click', () => void unsave());

  store.subscribe((state, previous) => {
    // A new session (the first edit after the save) ends the chance to undo the save.
    if (kept !== null && (state.edit?.session ?? null) !== null) forget();
    else if (
      state.edit !== previous.edit ||
      state.undo !== previous.undo ||
      state.redo !== previous.redo ||
      state.busy !== previous.busy
    ) {
      render();
    }
  });
  render();
}
