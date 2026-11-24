// The trash scripts' texts, handed over by the page in `#trash-texts`
// (`src/studio/pages/trash/trash-texts.ts`). A key the page did not send shows as the key itself,
// so a missing text is easy to see.

let texts: Record<string, string> | undefined;

function load(): Record<string, string> {
  if (texts) return texts;
  texts = {};
  // Outside a page (the tests run in Node) there are no texts, and every key shows as itself.
  if (typeof document === 'undefined') return texts;
  const block = document.getElementById('trash-texts');
  try {
    const read: unknown = JSON.parse(block?.textContent ?? '{}');
    if (typeof read === 'object' && read !== null && !Array.isArray(read)) {
      for (const [key, value] of Object.entries(read)) {
        if (typeof value === 'string') texts[key] = value;
      }
    }
  } catch {
    // No texts: every key shows as itself.
  }
  return texts;
}

/** `text('delete.done', { title })`: the short key under `studio.trash.`, with `{name}` filled. */
export function text(key: string, params: Record<string, string | number> = {}): string {
  const template = load()[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}
