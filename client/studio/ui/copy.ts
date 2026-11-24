// The copy button of a command (`.k-cmd`, markup of `src/studio/pages/states/command.ts`): a click
// puts the command's text on the clipboard, and for a moment the button shows a check and the
// box says "Copied" to assistive technology. Mounted by every page's entry, because the paused
// view carries a command on every page. A page works without it: the command is text to select.

/** What the click needs of the button: the text of the command beside it. */
export type CommandButton = {
  closest(
    selector: string,
  ): { querySelector(selector: string): { textContent: string | null } | null } | null;
};

/** The command a button copies: the `code` of the `.k-cmd` it sits in; `undefined` when empty. */
export function commandOf(button: CommandButton): string | undefined {
  const text = button.closest('.k-cmd')?.querySelector('code')?.textContent?.trim();
  return text === undefined || text === '' ? undefined : text;
}

/** How long the button shows that it copied. */
export const DONE_MS = 1400;

const done = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/** The button's icon and the box's status line, as copied (`on`) or as before. */
function show(button: HTMLElement, on: boolean): void {
  if (on) button.dataset.done = '';
  else delete button.dataset.done;
  button.querySelector('use')?.setAttribute('href', on ? '#i-check' : '#i-copy');
  const status = button.closest('.k-cmd')?.querySelector('[data-copy-status]');
  // The page wrote the word (`data-text-copied`): a script has no texts of its own.
  if (status) status.textContent = on ? (button.dataset.textCopied ?? '') : '';
}

/** Listens on `root` for clicks on `[data-copy]`; one listener serves every button of the page. */
export function mountCopyButtons(root: Document | HTMLElement = document): void {
  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('[data-copy]');
    if (!(button instanceof HTMLElement)) return;
    const command = commandOf(button);
    if (command === undefined) return;
    navigator.clipboard.writeText(command).then(
      () => {
        clearTimeout(done.get(button));
        show(button, true);
        done.set(
          button,
          setTimeout(() => show(button, false), DONE_MS),
        );
      },
      () => {
        // Refused (no permission, an insecure page): the text is still there to select.
      },
    );
  });
}
