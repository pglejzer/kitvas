// A short note over the canvas that goes away on its own: "Copied", or why something did not work.
// The screen floats any `.edit-note` put straight into it (edit-skin/screen.ts); one note is reused,
// so quick repeats never stack.

/** How long a note stays. */
export const TOAST_MS = 2500;

const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

export function toast(main: HTMLElement | undefined, message: string): void {
  // Tests run the actions without a page.
  if (main === undefined || typeof document === 'undefined') return;
  let note = main.querySelector<HTMLElement>(':scope > [data-edit-note="toast"]');
  if (!note) {
    note = document.createElement('p');
    note.className = 'edit-note';
    note.dataset.editNote = 'toast';
    note.setAttribute('role', 'status');
    main.prepend(note);
  }
  note.textContent = message;
  note.hidden = false;
  const shown = note;
  const before = timers.get(shown);
  if (before !== undefined) clearTimeout(before);
  timers.set(
    shown,
    setTimeout(() => {
      shown.hidden = true;
    }, TOAST_MS),
  );
}
