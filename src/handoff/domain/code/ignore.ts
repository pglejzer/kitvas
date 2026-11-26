// Which folders of the person's project kitvas never reads for the hand-off: `node_modules`, every
// folder whose name starts with a dot, and the plain folder names in the project's `.gitignore`.
// Pure string work; the list goes to the files port's `walk` as its `skip` and is applied again to a
// list of paths by `isIgnoredPath`.

/** The entry of a skip list that stands for every folder whose name starts with a dot. */
export const DOT_FOLDERS = '.*';

/** A name with no slash, no wildcard, no negation and no escape: one folder's own name. */
const PLAIN_NAME = /^[^*?[\]!\\/\s]+$/;

/** One `.gitignore` line as a plain folder name, or undefined; a leading or trailing `/` is taken off. */
function plainName(line: string): string | undefined {
  const name = line.replace(/^\//, '').replace(/\/$/, '');
  return PLAIN_NAME.test(name) ? name : undefined;
}

/**
 * The skip list: `node_modules`, `.*` (every dot folder), then the plain names of the `.gitignore`
 * lines, sorted. A line with a wildcard, a path or an inner slash is not a plain name and is left
 * out; a `!name` line takes an earlier `name` back out.
 */
export function ignoredNames(gitignore: string | undefined): string[] {
  const named = new Set<string>();
  for (const raw of (gitignore ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('!')) {
      const name = plainName(line.slice(1));
      if (name !== undefined) named.delete(name);
      continue;
    }
    const name = plainName(line);
    if (name !== undefined && name !== 'node_modules' && !name.startsWith('.')) named.add(name);
  }
  const sorted = [...named].sort((a, b) => (a < b ? -1 : Number(a > b)));
  return ['node_modules', DOT_FOLDERS, ...sorted];
}

/** True when `name`, a folder's own name, is on the skip list. */
export function isIgnoredName(name: string, names: readonly string[]): boolean {
  return names.includes(name) || (names.includes(DOT_FOLDERS) && name.startsWith('.'));
}

/** True when a folder on the way to the file `path` (the file's own name does not count) is skipped. */
export function isIgnoredPath(path: string, names: readonly string[]): boolean {
  return path
    .split('/')
    .slice(0, -1)
    .some((segment) => isIgnoredName(segment, names));
}
