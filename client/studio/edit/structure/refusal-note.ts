// What the editor did not do, said over the canvas (ADR 0065): a key whose action is off, a menu
// action, a drop or a reordered item the server refused, a handle that wrote nothing, and an
// element lost after another writer's change. A change to a part of a list item is said there
// too, since it shows in every item. One short line at the canvas's top
// (`.k-pop.structure-note`), announced politely; a later note takes the place of the one shown,
// so two never cover each other. A refusal goes away on its own. The Ask Claude offer of a
// refused edit stays in the panel (`history/ask.ts`).

import type { EditorContext } from '../context.ts';
import type { Refused } from '../store.ts';
import { HANDLE_NOTE, readHandleNote } from '../style/handle-writes.ts';
import { refusalKey } from '../style/ops.ts';
import { originOf } from '../sync/remap.ts';
import { text } from '../texts.ts';
import type { ActionReason } from './actions.ts';

/** How long a note stays when it goes away on its own. */
export const NOTE_MS = 5000;

/** What a note is about: `hideNote` takes away only a note of its own kind. */
export type NoteKind = 'refusal' | 'handle' | 'lost' | 'done';

const SELECTOR = ':scope > [data-edit-note="canvas"]';

const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function stop(note: HTMLElement): void {
  const timer = timers.get(note);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(note);
}

/** Shows `message` over the canvas for `ms` milliseconds; `null` keeps it until `hideNote`. */
export function showNote(
  main: HTMLElement | undefined,
  kind: NoteKind,
  message: string,
  ms: number | null = NOTE_MS,
): void {
  // Tests run the actions without a page.
  if (main === undefined || typeof document === 'undefined') return;
  let note = main.querySelector<HTMLElement>(SELECTOR);
  if (!note) {
    note = document.createElement('p');
    note.className = 'k-pop structure-note';
    note.dataset.editNote = 'canvas';
    // A polite live region: a screen reader says the note once it has finished its sentence.
    note.setAttribute('role', 'status');
    note.hidden = true;
    main.prepend(note);
  }
  const shown = note;
  stop(shown);
  shown.dataset.kind = kind;
  shown.textContent = message;
  shown.hidden = false;
  if (ms === null) return;
  timers.set(
    shown,
    setTimeout(() => {
      shown.hidden = true;
      timers.delete(shown);
    }, ms),
  );
}

/** Takes the note away when the one shown is of `kind`. */
export function hideNote(main: HTMLElement | undefined, kind: NoteKind): void {
  if (main === undefined || typeof document === 'undefined') return;
  const note = main.querySelector<HTMLElement>(SELECTOR);
  if (!note || note.hidden || note.dataset.kind !== kind) return;
  stop(note);
  note.hidden = true;
}

/** The key of a reason's words: the menu's, which an action that is off shows there too. */
export const reasonKey = (reason: ActionReason): string => `menu.reason.${reason}`;

/** Says over the canvas why an action, a key or a drop did nothing. */
export function sayReason(main: HTMLElement | undefined, reason: ActionReason): void {
  showNote(main, 'refusal', text(reasonKey(reason)));
}

/** Says over the canvas what a written change did beyond the element it was made on. */
export function sayDone(main: HTMLElement | undefined, message: string): void {
  showNote(main, 'done', message);
}

/**
 * Whether a refused edit is said over the canvas. One the properties panel shows at its own row
 * (a prop, a text, a style) is not said twice, and the same refusal with its ids renamed after
 * another writer's change is no new one.
 */
export function saidOverCanvas(refused: Refused, previous: Refused | null): boolean {
  if (refusalKey(refused) !== null) return false;
  const again =
    previous !== null &&
    previous.reason === refused.reason &&
    previous.index === refused.index &&
    originOf(previous.gesture) === originOf(refused.gesture);
  return !again;
}

export function mountRefusalNote(ctx: EditorContext): void {
  const { store, main } = ctx;
  store.subscribe((state, previous) => {
    const { refused } = state;
    if (refused === null || refused === previous.refused) return;
    if (saidOverCanvas(refused, previous.refused)) sayReason(main, refused.reason);
  });
  // A handle that wrote nothing says why here too, where the person's eyes are.
  main.addEventListener(HANDLE_NOTE, (event) => {
    const said = event instanceof CustomEvent ? readHandleNote(event.detail) : null;
    if (said === null) return;
    if (said.key === null) hideNote(main, 'handle');
    else showNote(main, 'handle', text(said.key));
  });
}
