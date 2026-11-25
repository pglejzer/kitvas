// The start switch of the start page's block (markup: `src/studio/pages/start/block.ts`): a press
// on a choice shows its command and its line, and no other. The server draws the first choice as
// shown (`data-on`); the skin hides the others once the page's script has run. The copy button of
// a command is `ui/copy.ts`.

/** The choice a press asks for, from the element pressed; `undefined` when it is no choice button. */
export function choiceOf(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined;
  const button = target.closest('[data-start] [data-choice]');
  return button instanceof HTMLElement ? button.dataset.choice : undefined;
}

/** Shows the panel of `choice` and marks its button pressed; the others are put away. */
export function showChoice(start: Element, choice: string): void {
  for (const button of start.querySelectorAll<HTMLElement>('[data-choice]')) {
    button.setAttribute('aria-pressed', String(button.dataset.choice === choice));
  }
  for (const panel of start.querySelectorAll<HTMLElement>('[data-panel]')) {
    if (panel.dataset.panel === choice) panel.setAttribute('data-on', '');
    else panel.removeAttribute('data-on');
  }
}

export function mountStartSwitch(): void {
  document.addEventListener('click', (event) => {
    const choice = choiceOf(event.target);
    const start = event.target instanceof Element ? event.target.closest('[data-start]') : null;
    if (choice !== undefined && start) showChoice(start, choice);
  });
}
