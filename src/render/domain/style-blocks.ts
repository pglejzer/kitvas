// Reading style text out of files that are not style files, and keeping the files it points to.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BLOCK = /<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi;
const LANG = /\blang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/** Each `<style>` block of `text`, in order; `lang` is `css` when the tag names none. */
export function styleBlocks(text: string): { lang: string; css: string }[] {
  return [...text.matchAll(BLOCK)].map((match) => {
    const named = LANG.exec(match[1] ?? '');
    const lang = (named?.[1] ?? named?.[2] ?? named?.[3] ?? 'css').trim().toLowerCase();
    return { lang: lang === '' ? 'css' : lang, css: match[2] ?? '' };
  });
}

/**
 * The strings of an Angular component's `styles` (one string or an array of them), as `css`
 * blocks; none when the file declares no component.
 */
export function decoratorStyles(text: string): { lang: string; css: string }[] {
  if (!/@Component\s*\(/.test(text)) return [];
  const found: { lang: string; css: string }[] = [];
  for (const match of text.matchAll(/\bstyles\s*:\s*(\[?)/g)) {
    let at = match.index + match[0].length;
    for (;;) {
      while (/[\s,]/.test(text[at] ?? '')) at += 1;
      const quote = text[at];
      if (quote !== '`' && quote !== "'" && quote !== '"') break;
      let end = at + 1;
      while (end < text.length && text[end] !== quote) end += text[end] === '\\' ? 2 : 1;
      if (end >= text.length) break;
      found.push({ lang: 'css', css: text.slice(at + 1, end) });
      at = end + 1;
      if (match[1] === '') break;
    }
  }
  return found;
}

const URL_CALL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/gi;
/** A scheme (`data:`, `https:`), a fragment, or an absolute path: never a file beside the sheet. */
const NOT_RELATIVE = /^(?:[a-z][a-z0-9+.-]*:|#|\/|\\)/i;

/**
 * Every relative `url(...)` whose file exists in `folder` becomes an absolute `file:` address.
 * Any other address stays as written.
 */
export function rebaseUrls(css: string, folder: string, exists: (file: string) => boolean): string {
  return css.replace(URL_CALL, (call, double?: string, single?: string, bare?: string) => {
    const address = (double ?? single ?? bare ?? '').trim();
    if (address === '' || NOT_RELATIVE.test(address)) return call;
    const end = address.search(/[?#]/);
    const path = end === -1 ? address : address.slice(0, end);
    const file = join(folder, path);
    if (path === '' || !exists(file)) return call;
    return `url("${pathToFileURL(file).href}${end === -1 ? '' : address.slice(end)}")`;
  });
}
