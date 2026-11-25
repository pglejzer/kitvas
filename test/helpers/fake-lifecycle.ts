// A lifecycle with processes and a state file in memory, for the use cases and the CLI.

import type { LifecycleDeps, StudioState } from '../../src/studio/index.ts';
import { SAMPLE_STATE } from './studio-state.ts';

export type FakeOptions = {
  /** A studio that runs already. */
  running?: StudioState;
  /** Other pids that live, such as a browser. */
  alive?: number[];
  version?: string;
  /** Pids that live but never answer. */
  silent?: number[];
  /** The shutdown route answers, but the process keeps running. */
  stubborn?: boolean;
  /** Started processes never write their state file. */
  neverStarts?: boolean;
};

export function fakeLifecycle(options: FakeOptions = {}) {
  let state = options.running;
  const alive = new Set<number>([...(state ? [state.pid] : []), ...(options.alive ?? [])]);
  const silent = new Set(options.silent ?? []);
  const calls: string[] = [];
  let nextPid = 7000;
  const version = options.version ?? '1.0.0';
  const deps: LifecycleDeps = {
    version,
    files: { state: 'studio/state.json', log: 'studio/state.log' },
    readState: () => state,
    removeState: (pid) => {
      calls.push(`remove ${pid}`);
      if (pid === undefined || state?.pid === pid) state = undefined;
    },
    spawnServer: () => {
      nextPid += 1;
      const pid = nextPid;
      calls.push(`spawn ${pid}`);
      alive.add(pid);
      if (!options.neverStarts) state = { ...SAMPLE_STATE, pid, port: pid, version };
      return pid;
    },
    isAlive: (pid) => alive.has(pid),
    forceKill: (pid) => {
      calls.push(`kill ${pid}`);
      alive.delete(pid);
    },
    probe: async (current) =>
      alive.has(current.pid) && !silent.has(current.pid) ? { version: current.version } : undefined,
    shutdown: async (current) => {
      calls.push(`shutdown ${current.pid}`);
      if (!options.stubborn) alive.delete(current.pid);
      return true;
    },
    link: async (current, path) => {
      calls.push(`link ${current.pid} ${path}`);
      const target = `:${current.port}/open?code=c0de&to=${encodeURIComponent(path)}`;
      return { url: `http://kitvas.localhost${target}`, fallbackUrl: `http://localhost${target}` };
    },
    sleep: async () => undefined,
  };
  return { deps, calls, alive, current: () => state };
}
