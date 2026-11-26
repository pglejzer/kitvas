// "Make default" (plan 25): the values shown become the defaults of the version, written in
// `options.json`. It is an edit of the latest version, so it runs only in Edit, and it is one step
// of the editor's history: the answer carries the exact inverse (a `file` op, as a structural edit
// does), which Undo sends through the edits route as it sends every other step's. "Reset" writes nothing and is
// not here. The defaults the page shows follow the file: Undo and Redo change its ETag, and the
// ETag says which defaults the file holds.

import { defaultChoice, type OptionChoice } from '../../../src/shared/values/options.ts';
import type { EditOutcome } from '../../../src/studio/api/edit/edit-schemas.ts';
import { call, draftPath } from '../api/request.ts';
import type { ChangeEntry, Gesture, Store } from '../edit/store.ts';
import { text } from '../edit/texts.ts';
import { toast } from '../edit/toast.ts';
import type { ChoiceControl } from './choice.ts';

/** The file inside a version that holds the options. */
export const OPTIONS_FILE = 'src/json/options.json';

export type MakeDefault = {
  /** Edit is on, on the latest version, and no request is on its way. */
  available(): boolean;
  run(): Promise<void>;
};

export function mountMakeDefault(
  main: HTMLElement,
  slug: string,
  control: ChoiceControl,
  store: Store,
): MakeDefault {
  /** The defaults each ETag of the file stands for, as far as this page made them. */
  const known = new Map<string, OptionChoice>();
  /** The defaults the file had before the first "Make default" of this page. */
  let original: OptionChoice | null = null;
  let etagNow = store.get().etags[OPTIONS_FILE];

  // Undo and Redo of a step bring the file's ETag to the store: the defaults follow it. An ETag
  // this page never made is a file as it was before the first step.
  store.subscribe((state) => {
    const etag = state.etags[OPTIONS_FILE];
    if (etag === undefined || etag === etagNow) return;
    etagNow = etag;
    const defaults = known.get(etag) ?? original;
    if (defaults === null) return;
    known.set(etag, defaults);
    control.redefine(defaults);
  });

  const available = (): boolean => {
    const state = store.get();
    return state.on && state.edit !== null && !state.busy;
  };

  async function run(): Promise<void> {
    const edit = store.get().edit;
    if (!available() || edit === null) return;
    const made = control.get();
    const before = defaultChoice(control.options());
    store.set({ busy: true });
    const answer = await call<EditOutcome>('POST', `${draftPath(slug)}/options/default`, {
      version: edit.version,
      choice: made,
    });
    if (!answer.ok || answer.body.outcome !== 'applied') {
      store.set({ busy: false });
      toast(main, text('options.failed'));
      return;
    }
    const outcome = answer.body;
    if (outcome.inverse.length === 0) {
      store.set({ busy: false });
      control.redefine(made);
      return;
    }
    original ??= before;
    const after = outcome.etags[OPTIONS_FILE];
    if (after !== undefined) {
      known.set(after, made);
      // Set before the store speaks, so this step's own ETag is not taken for an Undo.
      etagNow = after;
    }
    const now = store.get();
    const label = text('options.makeDefaultLabel');
    // The step's own `ops` are never sent: Undo sends the answer's inverse.
    const step: Gesture = {
      ops: [{ op: 'file', file: OPTIONS_FILE, text: null, before: null }],
      label,
      undoOps: [...outcome.inverse],
    };
    const line: ChangeEntry = {
      by: 'person',
      id: null,
      label,
      files: [],
      offKit: false,
      at: Date.now(),
    };
    const session = outcome.started
      ? { version: outcome.version, startedAt: new Date().toISOString() }
      : (now.edit?.session ?? edit.session);
    store.set({
      busy: false,
      etags: { ...now.etags, ...outcome.etags },
      edit: { ...(now.edit ?? edit), version: outcome.version, session },
      undo: [...now.undo, step],
      redo: [],
      changes: [...now.changes, line],
    });
    control.redefine(made);
  }

  return { available, run };
}
