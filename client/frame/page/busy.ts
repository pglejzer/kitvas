// The gestures a page must not be replaced under (ADR 0058): an inline text edit, a drag, a
// rectangle, a handle drag. Each one holds the page from its start to its end, and a build that
// is to be taken in place (`swap.ts`) waits for `idle()` first. The count is the page's own: one
// frame runtime runs a document, so one module keeps it.

let held = 0;
let waiting: (() => void)[] = [];

/** Marks a gesture as running; the function it returns ends it (a second call does nothing). */
export function hold(): () => void {
  held += 1;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    held -= 1;
    if (held > 0) return;
    const free = waiting;
    waiting = [];
    for (const resolve of free) resolve();
  };
}

/** Resolves once no gesture runs; at once when none does. */
export function idle(): Promise<void> {
  if (held === 0) return Promise.resolve();
  return new Promise((resolve) => {
    waiting.push(resolve);
  });
}
