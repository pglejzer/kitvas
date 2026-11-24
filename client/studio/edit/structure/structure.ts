// The structure map on the page (spec 4b; plan 14, task D1): read from `GET …/structure` when the editor
// starts, after every applied edit and after every `source` event, kept in the store, and sent
// to the frame as `structure` entries so it offers the right drop slots.
//
// Reads happen while edit mode is on (the panel is hidden before, and a page that is only looked
// at loads itself again after Claude's builds); a change heard while it is off is read when it
// turns on. One read runs at a time, and a change heard during it reads again afterwards. After a
// change by another writer the ids the editor holds are matched from the structure before it to
// the one after it (`afterOtherChange`).

import type { SourceEvent } from '../../../../src/studio/api/edit/edit-schemas.ts';
import type { Structure } from '../../../../src/studio/api/edit/structure-schemas.ts';
import { type FrameEntry, MAX_ENTRIES } from '../../../channel/structure-protocol.ts';
import { frameMessage } from '../../frames.ts';
import { sourceOf } from '../../live/job-events.ts';
import { onStudioEvent } from '../../live/live.ts';
import { type Answer, getStructure } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { afterOtherChange } from '../sync/match.ts';
import { text } from '../texts.ts';

/** What the frame needs of each element to offer drop slots; as many as the channel takes. */
export function frameEntries(structure: Structure): FrameEntry[] {
  return structure.elements.slice(0, MAX_ENTRIES).map((entry) => ({
    id: entry.id,
    movable: entry.movable === null,
    accepts: entry.accepts,
    mixed: entry.mixed,
    interactive: entry.interactive,
    root: entry.root,
  }));
}

/** The page's side of the structure map, replaceable in tests. */
export type StructureIo = {
  getStructure(slug: string): Promise<Answer<Structure>>;
  /** An element of the selection was not found again after another writer's change. */
  lost(): void;
};

export type StructureSync = {
  /** A `source` event of this draft. */
  heard(source: SourceEvent): void;
  /** The current frame said `ready`: a new page there knows no entries yet. */
  ready(): void;
};

export function createStructureSync(
  deps: Pick<EditorContext, 'slug' | 'store' | 'bridge'>,
  io: StructureIo,
): StructureSync {
  const { slug, store, bridge } = deps;
  /** A change was heard that no finished read has seen yet. */
  let dirty = true;
  let reading = false;
  /** `source` events by another writer so far. */
  let others = 0;
  /**
   * The structure as it was before the first change by another writer that is not matched yet;
   * `undefined` while none waits, `null` when there was no structure to match from.
   */
  let matchFrom: Structure | null | undefined;

  function send(structure: Structure): void {
    if (store.get().on) bridge.send({ type: 'structure', entries: frameEntries(structure) });
  }

  function take(next: Structure, seen: number): void {
    // A change by another writer heard during the read may be missing from `next`: the read
    // that follows matches it.
    const from = seen === others ? matchFrom : undefined;
    if (from !== undefined) matchFrom = undefined;
    // An element the editor's own edit removed (a delete, the undo of an insert) leaves the
    // selection here, so the panels never ask the server about it.
    const ids = new Set(next.elements.map((entry) => entry.id));
    const { selection, hovered } = store.get();
    const kept = selection.filter((id) => ids.has(id));
    store.set({
      structure: next,
      ...(kept.length === selection.length ? {} : { selection: kept }),
      ...(hovered !== null && !ids.has(hovered) ? { hovered: null } : {}),
    });
    send(next);
    if (!from) return;
    const { patch, lost } = afterOtherChange(store.get(), from.elements, next.elements);
    if (Object.keys(patch).length > 0) store.set(patch);
    if (lost) io.lost();
  }

  function pump(): void {
    if (reading || !dirty || !store.get().on) return;
    reading = true;
    dirty = false;
    const seen = others;
    void io.getStructure(slug).then((answer) => {
      reading = false;
      if (answer.ok) take(answer.body, seen);
      pump();
    });
  }

  function changed(): void {
    dirty = true;
    pump();
  }

  store.subscribe((state, previous) => {
    if (state.on && !previous.on) {
      if (state.structure) send(state.structure);
      pump();
    }
    // New ETags: an applied edit, a file someone else wrote, or the edit state read again.
    if (state.etags !== previous.etags) changed();
  });

  pump();

  return {
    heard(source) {
      if (source.slug !== slug || source.by !== 'other') return;
      if (source.version < (store.get().edit?.version ?? 0)) return;
      others += 1;
      if (matchFrom === undefined) matchFrom = store.get().structure;
      changed();
    },
    ready() {
      const { structure, hidden, locked, on } = store.get();
      if (structure) send(structure);
      // A new page in the frame shows everything again: the hidden ones are hidden once more.
      if (on && hidden.length > 0) bridge.send({ type: 'hide', ids: [...hidden] });
      if (locked.length > 0) bridge.send({ type: 'lock', ids: [...locked] });
    },
  };
}

export function mountStructure(ctx: EditorContext): void {
  const { panel, store, bridge, slug } = ctx;
  const note = document.createElement('p');
  note.className = 'k-pop structure-note';
  note.dataset.editNote = 'structure';
  note.setAttribute('role', 'status');
  note.hidden = true;
  note.textContent = text('structure.lost');
  // It floats over the canvas, at its top, where the toast at the foot never covers it.
  panel.prepend(note);

  const sync = createStructureSync(ctx, {
    getStructure,
    lost: () => {
      note.hidden = false;
    },
  });

  // The note stays until the person selects again or leaves edit mode.
  store.subscribe((state, previous) => {
    if (note.hidden) return;
    if (!state.on || (state.selection !== previous.selection && state.selection.length > 0)) {
      note.hidden = true;
    }
  });

  onStudioEvent((event) => {
    const source = sourceOf(event);
    if (source && source.slug === slug) sync.heard(source);
  });
  window.addEventListener('message', (event) => {
    const heard = frameMessage([bridge.frame], event);
    if (heard?.message.type === 'ready') sync.ready();
  });
}
