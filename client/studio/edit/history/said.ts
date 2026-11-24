// A button that just did its work says so for a moment (spec goal 7; plan 18, task D): Save
// version says "Saved", Apply says "Applied", for 1.4 s. Its own content comes back after that;
// a second call in that time starts the moment again and keeps the content it had first.

export const SAID_MS = 1400;

type Held = { nodes: Node[]; timer: ReturnType<typeof setTimeout> };

const held = new WeakMap<HTMLElement, Held>();

/** Whether the button says its word now: a redraw leaves its content alone until it is done. */
export const saying = (button: HTMLElement): boolean => held.has(button);

/**
 * `words` in the button for `ms`; then its content as it was, and `done` (a redraw that may
 * change it meanwhile).
 */
export function sayFor(
  button: HTMLElement,
  words: string,
  done?: () => void,
  ms: number = SAID_MS,
): void {
  const before = held.get(button);
  if (before) clearTimeout(before.timer);
  const nodes = before ? before.nodes : [...button.childNodes];
  button.replaceChildren(words);
  button.dataset.said = '';
  const timer = setTimeout(() => {
    held.delete(button);
    delete button.dataset.said;
    button.replaceChildren(...nodes);
    done?.();
  }, ms);
  held.set(button, { nodes, timer });
}
