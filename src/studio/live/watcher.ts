// The live loop's eyes (spec 4a, "code is the canvas"): one recursive watch over `.kitvas/drafts/`.
// A change to what a version's build reads becomes a `source` event once its draft has been quiet
// for 100 ms, and a build request. The editor's own writes are told from anyone else's by the
// ETags the edit API registers right before it writes (`expect`, its `beforeWrite` hook).

import { type FSWatcher, watch } from 'node:fs';
import { isSlug } from '../../drafts/index.ts';
import { SOURCE_PATH, type SourceEvent } from '../api/edit-schemas.ts';
import { type IdleClock, SYSTEM_CLOCK } from '../server/idle-stop.ts';

/** A draft is looked at once nothing changed in it for this long. */
export const QUIET_MS = 100;
/** A draft that never goes quiet is still looked at this long after its first change. */
export const MAX_WAIT_MS = 1_000;
/** How long an ETag the editor registered marks a write as the editor's. */
export const EXPECT_MS = 5_000;
/** A file another program holds open is read again this many times before it is left alone. */
const READ_TRIES = 3;
/** How long the real watch waits before it tries again: the folder is missing, or the watch broke. */
const RETRY_MS = 2_000;

/**
 * Starts watching; `onChange` gets each changed path relative to the watched folder, with either
 * slash. The function it returns stops the watch.
 */
export type WatchPort = (
  onChange: (path: string) => void,
  onError: (error: unknown) => void,
) => { close(): void };

/** A reported path inside a version folder: `path` is relative to it, `''` for the folder itself. */
export type Change = { slug: string; version: number; path: string };

const VERSION = /^v([1-9][0-9]{0,5})$/;
/** Written by every build from the layout: watching them would build forever. */
const GENERATED = new Set(['src/tsx/index.tsx', 'src/scss/index.scss']);
/** The edit API's atomic write puts its new text here first, then renames it over the file. */
const TEMPORARY = '.kitvas-tmp';
const LAYOUT = 'md/layout.md';
/** What `seen` holds for a file that was there and is gone: no ETag is empty. */
const GONE = '';

/**
 * What a reported path means: a change a build of its version reads (its `src/` except the two
 * generated entries, its layout, or the version folder itself), or `undefined` for anything else,
 * such as the build's own output, a temporary file or `draft.json`.
 */
export function changeOf(reported: string): Change | undefined {
  const parts = reported.split(/[\\/]+/).filter((part) => part !== '' && part !== '.');
  const [slug, folder, ...rest] = parts;
  if (slug === undefined || !isSlug(slug)) return undefined;
  const number = VERSION.exec(folder ?? '')?.[1];
  if (number === undefined) return undefined;
  const version = Number(number);
  const path = rest.join('/');
  if (path === '') return { slug, version, path };
  if (path.endsWith(TEMPORARY) || GENERATED.has(path)) return undefined;
  if (path === LAYOUT || path.startsWith('src/')) return { slug, version, path };
  return undefined;
}

export type SourceWatcherDeps = {
  watch: WatchPort;
  /** A file of a draft by its path inside the draft; `undefined` when it is missing. */
  read(slug: string, relPath: string): string | undefined;
  /** The ETag of a text, the same function the edit API uses. */
  etag(text: string): string;
  publish(event: SourceEvent): void;
  /** Asks for a build of the draft; `version` is the newest version the change was in. */
  build(slug: string, version: number): void;
  clock?: IdleClock | undefined;
  onError?: ((error: unknown) => void) | undefined;
};

export type SourceWatcher = {
  /** These files of this version are about to be written with these ETags, by the editor. */
  expect(slug: string, version: number, etags: Record<string, string>): void;
  close(): void;
};

type Batch = { paths: Map<number, Set<string>>; since: number; cancel: () => void };
type Expected = { slug: string; version: number; etags: Record<string, string>; at: number };
type Read = { etag: string } | 'missing' | 'busy';

const codeOf = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;

export function createSourceWatcher(deps: SourceWatcherDeps): SourceWatcher {
  const clock = deps.clock ?? SYSTEM_CLOCK;
  /** Changes waiting for their draft's quiet time, by draft. */
  const batches = new Map<string, Batch>();
  /** ETags of the files looked at, by `<slug>/v<n>` and path: a write of the same text is none. */
  const seen = new Map<string, Map<string, string>>();
  /** The newest version each draft had a change in. */
  const newest = new Map<string, number>();
  /** Failed reads of a file, by `<slug>/v<n>/<path>`. */
  const tries = new Map<string, number>();
  let expected: Expected[] = [];
  let closed = false;

  const forget = (): void => {
    const now = clock.now();
    expected = expected.filter((item) => now - item.at <= EXPECT_MS);
  };

  const isExpected = (slug: string, version: number, path: string, etag: string): boolean =>
    expected.some(
      (item) => item.slug === slug && item.version === version && item.etags[path] === etag,
    );

  function note(slug: string, version: number, path: string): void {
    if (closed) return;
    const now = clock.now();
    const batch: Batch = batches.get(slug) ?? {
      paths: new Map<number, Set<string>>(),
      since: now,
      cancel: () => undefined,
    };
    batches.set(slug, batch);
    const paths = batch.paths.get(version) ?? new Set<string>();
    batch.paths.set(version, paths.add(path));
    batch.cancel();
    const wait = Math.max(0, Math.min(QUIET_MS, batch.since + MAX_WAIT_MS - now));
    batch.cancel = clock.after(wait, () => flush(slug));
  }

  function readEtag(slug: string, relPath: string): Read {
    try {
      const text = deps.read(slug, relPath);
      return text === undefined ? 'missing' : { etag: deps.etag(text) };
    } catch (error) {
      // A folder is no file. Anything else is most likely a file another program holds open.
      return codeOf(error) === 'EISDIR' ? 'missing' : 'busy';
    }
  }

  /** Reads it again soon, a few times at most. */
  function retry(slug: string, version: number, path: string): void {
    const key = `${slug}/v${version}/${path}`;
    const count = (tries.get(key) ?? 0) + 1;
    if (count > READ_TRIES) {
      tries.delete(key);
      return;
    }
    tries.set(key, count);
    note(slug, version, path);
  }

  /** Publishes what changed in one version; `true` when the draft needs a build. */
  function settle(slug: string, version: number, paths: Set<string>): boolean {
    const folder = `${slug}/v${version}`;
    const known = seen.get(folder) ?? new Map<string, string>();
    seen.set(folder, known);
    const fresh = version > (newest.get(slug) ?? 0);
    if (fresh) newest.set(slug, version);
    const files: Record<string, string> = {};
    let changed = false;
    for (const path of paths) {
      if (path === '') continue;
      const read = readEtag(slug, `v${version}/${path}`);
      if (read === 'busy') {
        retry(slug, version, path);
        continue;
      }
      tries.delete(`${folder}/${path}`);
      if (read === 'missing') {
        // Kept as gone: the file made again is a change even when it holds the old text.
        if (known.get(path)) {
          known.set(path, GONE);
          changed = true;
        }
        continue;
      }
      const { etag } = read;
      if (known.get(path) === etag) continue;
      const first = !known.has(path);
      known.set(path, etag);
      // A new version starts as a copy of the one before: only what differs from it is a change.
      // The editor's own write always counts, even when it puts the old text back (an undo).
      if (first && version > 1 && !isExpected(slug, version, path, etag)) {
        const before = readEtag(slug, `v${version - 1}/${path}`);
        if (typeof before === 'object' && before.etag === etag) continue;
      }
      changed = true;
      if (SOURCE_PATH.test(path)) files[path] = etag;
    }
    const names = Object.keys(files);
    if (names.length > 0) {
      const ours = names.every((path) => isExpected(slug, version, path, files[path] ?? ''));
      deps.publish({ slug, version, files, by: ours ? 'editor' : 'other' });
    }
    // A new version folder has no build yet, even when nothing in it differs from the one before.
    return changed || fresh;
  }

  function flush(slug: string): void {
    const batch = batches.get(slug);
    batches.delete(slug);
    if (!batch || closed) return;
    forget();
    try {
      let build = 0;
      for (const version of [...batch.paths.keys()].sort((a, b) => a - b)) {
        if (settle(slug, version, batch.paths.get(version) ?? new Set<string>())) build = version;
      }
      if (build > 0) deps.build(slug, build);
    } catch (error) {
      deps.onError?.(error);
    }
  }

  const handle = deps.watch(
    (reported) => {
      const change = changeOf(reported);
      if (change) note(change.slug, change.version, change.path);
    },
    (error) => deps.onError?.(error),
  );

  return {
    expect(slug, version, etags) {
      if (closed) return;
      forget();
      expected.push({ slug, version, etags: { ...etags }, at: clock.now() });
      // Looked at even when the watch misses them, as it may in a folder that was just made.
      for (const path of Object.keys(etags)) note(slug, version, path);
    },
    close() {
      if (closed) return;
      closed = true;
      for (const batch of batches.values()) batch.cancel();
      batches.clear();
      handle.close();
    },
  };
}

/**
 * The real watch: `node:fs` over `root`, recursive. `.kitvas/drafts/` is made with the first draft,
 * so a missing folder is tried again every 2 s, and so is a watch that broke (the folder was
 * removed).
 */
export function fsWatchPort(root: string, clock: IdleClock = SYSTEM_CLOCK): WatchPort {
  return (onChange, onError) => {
    let watcher: FSWatcher | undefined;
    let cancel: (() => void) | undefined;
    let closed = false;
    const later = (): void => {
      watcher?.close();
      watcher = undefined;
      if (!closed && cancel === undefined) cancel = clock.after(RETRY_MS, start);
    };
    function start(): void {
      cancel = undefined;
      if (closed) return;
      try {
        // Not persistent: the servers keep the studio alive; the watch alone must not.
        watcher = watch(root, { recursive: true, persistent: false }, (_event, name) => {
          if (name) onChange(name);
        });
        watcher.on('error', (error: unknown) => {
          onError(error);
          later();
        });
      } catch (error) {
        if (codeOf(error) !== 'ENOENT') onError(error);
        later();
      }
    }
    start();
    return {
      close() {
        closed = true;
        cancel?.();
        cancel = undefined;
        watcher?.close();
        watcher = undefined;
      },
    };
  };
}
