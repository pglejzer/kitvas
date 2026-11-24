// The message after a delete (ADR 0064): at the foot of the window, announced to a screen reader
// (`role="status"`), with an Undo button while the delete can still be undone. One message at a
// time; a new one replaces the old. It stays while the focus is inside it.

export type Message = {
  text: string;
  /** Undo's name and what it does; without it the message is only a note. */
  undo?: { label: string; run(): void };
  /** How long it stays, in milliseconds. */
  ms: number;
};

let note: HTMLElement | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

function region(): HTMLElement {
  if (note?.isConnected) return note;
  note = document.createElement('p');
  note.className = 'k-pop k-toast k-rise trash-message';
  note.setAttribute('role', 'status');
  note.setAttribute('aria-live', 'polite');
  note.hidden = true;
  document.body.append(note);
  return note;
}

export function hideMessage(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  if (note) note.hidden = true;
}

function leaveSoon(box: HTMLElement, ms: number): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    // A keyboard user on Undo is not hurried: the message waits until the focus leaves.
    if (box.matches(':focus-within')) leaveSoon(box, 1000);
    else hideMessage();
  }, ms);
}

export function showMessage(message: Message): void {
  const box = region();
  const words = document.createElement('span');
  words.textContent = message.text;
  box.replaceChildren(words);
  if (message.undo) {
    const { label, run } = message.undo;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'k-btn';
    button.textContent = label;
    button.addEventListener('click', () => {
      hideMessage();
      run();
    });
    box.append(button);
  }
  box.hidden = false;
  leaveSoon(box, message.ms);
}
