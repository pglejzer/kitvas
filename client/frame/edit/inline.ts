// The inline text editor of edit mode: one element's plain text, typed in place. Enter keeps
// what was typed and Escape puts the old text back; either way the studio hears the end, with the
// text the editor started from (ADR 0060). A write the studio could not make sends `text-back`,
// which puts the old text back here too. While the editor is open the page is held busy
// (`page/busy.ts`), so it is never swapped under the person's typing.

import { type EditFrameMessage, MAX_INLINE_TEXT } from '../../channel/edit-protocol.ts';
import { hold } from '../page/busy.ts';
import { cut } from '../page/snapshot.ts';

export type InlineDeps = {
  channel: string;
  post(message: EditFrameMessage): void;
  /** The text changed in the page: the outlines follow it. */
  changed(): void;
};

export type InlineText = {
  /**
   * Opens the editor on `element` after ending the one before, which keeps what was typed. An
   * element that is not there or holds elements is answered at once with `value: null`.
   */
  start(id: string, element: Element | undefined): void;
  /** Ends the open editor: `keep` sends the typed text, otherwise the old text comes back. */
  end(keep: boolean): void;
  /** An editor is open. */
  open(): boolean;
  /** `target` is inside the open editor. */
  holds(target: EventTarget | null): boolean;
  /**
   * A space typed in a button or a summary. The browser keeps that key for pressing the control
   * and types nothing, so the space is put in at the caret here. True when it was.
   */
  space(): boolean;
  /**
   * The last kept edit of `id` was not written: its old text comes back, while the page still
   * shows what was typed.
   */
  back(id: string): void;
};

type Open = {
  id: string;
  element: HTMLElement;
  before: string;
  editable: string | null;
  onBlur(): void;
  release(): void;
};

/** A kept edit, until the studio says how its write went. */
type Kept = { id: string; element: HTMLElement; before: string; value: string };

/** Puts `value` into the element as one text node, keeping the node React made when it can. */
function writeText(element: HTMLElement, value: string): void {
  const first = element.firstChild;
  if (first instanceof Text) {
    first.data = value;
    while (first.nextSibling) first.nextSibling.remove();
  } else {
    element.textContent = value;
  }
}

function caretToEnd(element: HTMLElement): void {
  const selection = getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function createInline({ channel, post, changed }: InlineDeps): InlineText {
  const head = { kitvas: 1 as const, channel };
  let inline: Open | undefined;
  let kept: Kept | undefined;

  function end(keep: boolean): void {
    const ending = inline;
    if (!ending) return;
    // First, so the blur that follows does not end it a second time.
    inline = undefined;
    const { element } = ending;
    element.removeEventListener('blur', ending.onBlur);
    // A pasted line break becomes a space: JSX text shows it as one, and the write refuses breaks.
    const typed = (element.textContent ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim();
    const value = keep ? cut(typed, MAX_INLINE_TEXT) : null;
    writeText(element, value ?? ending.before);
    if (ending.editable === null) element.removeAttribute('contenteditable');
    else element.setAttribute('contenteditable', ending.editable);
    if (document.activeElement === element) element.blur();
    const before = cut(ending.before, MAX_INLINE_TEXT);
    kept = undefined;
    if (value !== null && value !== ending.before) {
      kept = { id: ending.id, element, before: ending.before, value };
    }
    post({ ...head, type: 'text', id: ending.id, value, before });
    ending.release();
    changed();
  }

  return {
    start(id, element) {
      // Only one at a time: the one before keeps what was typed.
      end(true);
      // Only plain text is edited in place; the studio is told at once, so it never waits.
      if (!(element instanceof HTMLElement) || element.childElementCount > 0) {
        post({ ...head, type: 'text', id, value: null });
        return;
      }
      const started: Open = {
        id,
        element,
        before: element.textContent ?? '',
        editable: element.getAttribute('contenteditable'),
        onBlur: () => end(true),
        release: hold(),
      };
      element.setAttribute('contenteditable', 'plaintext-only');
      // A browser that does not know the value reads it back as something else.
      if (element.contentEditable !== 'plaintext-only') {
        element.setAttribute('contenteditable', 'true');
      }
      element.addEventListener('blur', started.onBlur);
      inline = started;
      element.focus();
      caretToEnd(element);
    },
    end,
    open: () => inline !== undefined,
    holds: (target) =>
      inline !== undefined && target instanceof Node && inline.element.contains(target),
    space() {
      if (inline === undefined || inline.element.closest('button, summary') === null) return false;
      // The browser's own typing, so its undo and its handling of a space at the end still hold.
      return document.execCommand('insertText', false, ' ');
    },
    back(id) {
      const last = kept;
      if (last === undefined || last.id !== id) return;
      kept = undefined;
      // A build may have put another page here, or the text changed since: nothing to take back.
      // An editor open on it again keeps what is being typed.
      if (!last.element.isConnected || inline?.element === last.element) return;
      if ((last.element.textContent ?? '') !== last.value) return;
      writeText(last.element, last.before);
      changed();
    },
  };
}
