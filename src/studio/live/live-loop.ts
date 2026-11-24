// The studio's live loop: the source watcher and the warm builder together. A change on disk, by
// the editor or by Claude, becomes a `source` event, then a build, then a `build` event that the
// open draft pages follow. The studio starts it with its servers and closes it in `shutdown`.

import type { DraftStore } from '../../drafts/index.ts';
import type { BuildEvent, SourceEvent } from '../api/edit/edit-schemas.ts';
import type { EventType } from '../events/event-hub.ts';
import { type IdleClock, SYSTEM_CLOCK } from '../server/idle-stop.ts';
import { type BuiltDraft, createWarmBuilder } from './builder.ts';
import { type LockDeps, type LocksEvent, watchLocks } from './locks.ts';
import { createSourceWatcher, type WatchPort } from './watcher.ts';

/** What the composition root hands the studio: the real watch, and builds with warm tools. */
export type LiveTools = {
  /** `fsWatchPort` over the project's `.kitvas/drafts/`. */
  watch: WatchPort;
  /** Builds a draft's latest version with tools kept loaded between builds. */
  build(slug: string): Promise<BuiltDraft>;
  /** Stops what the tools keep running (esbuild, the Sass compiler, a Tailwind worker). */
  dispose(): Promise<void>;
};

export type LiveLoopDeps = LiveTools & {
  drafts: Pick<DraftStore, 'readText'>;
  /** The ETag of a text: the same function the edit API answers with. */
  etag(text: string): string;
  /** The event hub's `publish`. */
  publish(
    type: Extract<EventType, 'source' | 'build' | 'locks'>,
    data: SourceEvent | BuildEvent | LocksEvent,
  ): void;
  /** Spec 4d: the locks are compared after each change by another writer (`locks.ts`). */
  locks?: LockDeps | undefined;
  clock?: IdleClock | undefined;
  onError?: ((error: unknown) => void) | undefined;
};

export type LiveLoop = {
  /** The edit API's `beforeWrite`: these files of this version are about to get these ETags. */
  expect(slug: string, version: number, etags: Record<string, string>): void;
  /** Stops the watch, waits for the running builds, then stops the tools. */
  close(): Promise<void>;
};

export function startLiveLoop(deps: LiveLoopDeps): LiveLoop {
  const clock = deps.clock ?? SYSTEM_CLOCK;
  const builder = createWarmBuilder({
    build: (slug) => deps.build(slug),
    publish: (event) => deps.publish('build', event),
    now: () => clock.now(),
    onError: deps.onError,
  });
  const locks =
    deps.locks === undefined
      ? undefined
      : watchLocks({
          ...deps.locks,
          publish: (event) => deps.publish('locks', event),
          onError: deps.onError,
        });
  const watcher = createSourceWatcher({
    watch: deps.watch,
    read: (slug, relPath) => deps.drafts.readText(slug, relPath),
    etag: (text) => deps.etag(text),
    publish: (event) => {
      deps.publish('source', event);
      locks?.heard(event);
    },
    build: (slug, version) => builder.request(slug, version),
    clock,
    onError: deps.onError,
  });
  let closing: Promise<void> | undefined;
  return {
    expect: (slug, version, etags) => watcher.expect(slug, version, etags),
    close() {
      closing ??= (async () => {
        watcher.close();
        await locks?.close();
        await builder.close();
        await deps.dispose();
      })();
      return closing;
    },
  };
}
