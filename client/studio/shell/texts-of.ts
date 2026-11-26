// The texts a studio page hands to its scripts in a JSON block (`#edit-texts`, `#trash-texts`). A
// key the page did not send shows as the key itself, so a missing text is easy to see.

export type Text = (key: string, params?: Record<string, string | number>) => string;

/** The `text(key, params)` of the block with this id, read once: `{name}` in a text is filled. */
export function textsOf(blockId: string): Text {
  let texts: Record<string, string> | undefined;

  function load(): Record<string, string> {
    if (texts) return texts;
    texts = {};
    // Outside a page (the tests run in Node) there are no texts, and every key shows as itself.
    if (typeof document === 'undefined') return texts;
    const block = document.getElementById(blockId);
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

  return (key, params = {}) => {
    const template = load()[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
      name in params ? String(params[name]) : whole,
    );
  };
}
