// Request paths that may name a file: no tricks with separators, dots, drives or device names.

/** Windows device names, also with an extension: `con`, `con.txt`, `com1`, `lpt9.log`. */
const DEVICE =
  /^(con|prn|aux|nul|conin\$|conout\$|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])(\.|$)/i;
/** A percent-encoded slash, backslash or NUL. */
const ENCODED = /%(2f|5c|00)/i;

const hasControl = (text: string): boolean => [...text].some((char) => char.charCodeAt(0) < 32);

function safeSegment(segment: string): boolean {
  if (segment === '' || segment === '.' || segment === '..') return false;
  if (segment.includes('/') || segment.includes('\\') || segment.includes(':')) return false;
  if (hasControl(segment)) return false;
  // Windows drops a trailing dot or space, so `index.html.` would name `index.html`.
  if (segment.endsWith('.') || segment.endsWith(' ')) return false;
  return !DEVICE.test(segment);
}

/**
 * The decoded segments of a raw request path, or `undefined` when any segment could reach outside
 * the folder it names or alias another file on Windows.
 */
export function safeSegments(rawPath: string): string[] | undefined {
  if (ENCODED.test(rawPath) || rawPath.includes('\\')) return undefined;
  const segments: string[] = [];
  for (const raw of rawPath.split('/').slice(1)) {
    let segment: string;
    try {
      segment = decodeURIComponent(raw);
    } catch {
      return undefined;
    }
    if (!safeSegment(segment)) return undefined;
    segments.push(segment);
  }
  return segments;
}
