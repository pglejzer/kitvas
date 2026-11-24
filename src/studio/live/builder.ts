// The warm builder (spec 4a, spike 3): the studio builds a changed draft in its own process, with
// tools it keeps loaded, so an edit shows without starting the CLI. One build at a time per draft;
// a request while one runs makes one more run after it, so the last change is always built.

import { KitvasError } from '../../shared/index.ts';
import type { BuildEvent } from '../api/edit/edit-schemas.ts';

/** What a build of a draft's latest version gave: built or not, and which version it was. */
export type BuiltDraft = { ok: boolean; version: number };

export type WarmBuilderDeps = {
  /** Builds the draft's latest version: the render module's `buildDraft` with warm tools. */
  build(slug: string): Promise<BuiltDraft>;
  publish(event: BuildEvent): void;
  /** Milliseconds, for the event's `ms`. */
  now(): number;
  /** A build that threw for a reason kitvas did not raise. */
  onError?: ((error: unknown) => void) | undefined;
};

export type WarmBuilder = {
  /**
   * Builds the draft now, or once more after the build that runs. `version` is the version the
   * change was in: the event names it when the build throws before it knows its own.
   */
  request(slug: string, version: number): void;
  /** Drops a build waiting after the running one, and resolves once the running one has ended. */
  settle(slug: string): Promise<void>;
  /** Starts no more builds; resolves once the running ones have ended. */
  close(): Promise<void>;
};

type Run = { done: Promise<void>; again: boolean; version: number };

export function createWarmBuilder(deps: WarmBuilderDeps): WarmBuilder {
  const runs = new Map<string, Run>();
  let closed = false;

  async function once(slug: string, version: number): Promise<void> {
    const start = deps.now();
    let built: BuiltDraft = { ok: false, version };
    try {
      built = await deps.build(slug);
    } catch (error) {
      // A draft that does not build (a broken layout, a refused kit) is a failed build, no more.
      if (!(error instanceof KitvasError)) deps.onError?.(error);
    }
    const ms = Math.max(0, Math.round(deps.now() - start));
    deps.publish({ slug, version: built.version, state: built.ok ? 'succeeded' : 'failed', ms });
  }

  async function loop(slug: string, run: Run): Promise<void> {
    try {
      do {
        run.again = false;
        await once(slug, run.version);
      } while (run.again && !closed);
    } finally {
      runs.delete(slug);
    }
  }

  return {
    request(slug, version) {
      if (closed) return;
      const running = runs.get(slug);
      if (running) {
        running.again = true;
        running.version = Math.max(running.version, version);
        return;
      }
      const run: Run = { done: Promise.resolve(), again: false, version };
      runs.set(slug, run);
      run.done = loop(slug, run).catch((error: unknown) => deps.onError?.(error));
    },
    async settle(slug) {
      const running = runs.get(slug);
      if (!running) return;
      running.again = false;
      await running.done;
    },
    async close() {
      closed = true;
      await Promise.all([...runs.values()].map((run) => run.done));
    },
  };
}
