// The CLI's use cases for a project's studio: make sure one runs, say whether one does, stop it.

import { KitvasError } from '../../shared/index.ts';
import { studioUrl } from '../security/host-names.ts';
import type { StudioState } from './state-file.ts';

/** How long `kitvas studio` waits for a new studio to write its file and answer. */
export const START_TIMEOUT_MS = 15_000;
/** How long a studio gets to stop through its route before it is ended by force. */
export const STOP_TIMEOUT_MS = 5_000;
const POLL_MS = 100;

export type LifecycleDeps = {
  /** The plugin's version; a studio of another version is replaced. */
  version: string;
  files: { state: string; log: string };
  readState(): StudioState | undefined;
  /** Removes the state file while it names `pid`; without `pid`, always. */
  removeState(pid?: number): void;
  /** Starts a detached `kitvas studio serve`; returns its pid. */
  spawnServer(): number;
  isAlive(pid: number): boolean;
  forceKill(pid: number): void;
  /** The status route; `undefined` when nothing answers as kitvas with this token. */
  probe(state: StudioState): Promise<{ version: string } | undefined>;
  /** The shutdown route; true when the studio accepted. */
  shutdown(state: StudioState): Promise<boolean>;
  /** The link route: a one-time link to `path`, a studio page. */
  link(state: StudioState, path: string): Promise<StudioLink>;
  sleep(ms: number): Promise<void>;
};

/** One one-time code on two addresses; it works once, on either. */
export type StudioLink = {
  /** On `kitvas.localhost`. */
  url: string;
  /** On `localhost`, for a browser that does not resolve `kitvas.localhost`. */
  fallbackUrl: string;
};

/** `url` is the address people open: `http://kitvas.localhost:<port>`. */
export type StudioView = { pid: number; port: number; version: string; url: string };

const viewOf = (state: StudioState): StudioView => ({
  pid: state.pid,
  port: state.port,
  version: state.version,
  url: studioUrl(state.port),
});

async function waitFor<T>(
  deps: LifecycleDeps,
  timeoutMs: number,
  check: () => Promise<T | undefined> | T | undefined,
): Promise<T | undefined> {
  for (let waited = 0; waited <= timeoutMs; waited += POLL_MS) {
    const value = await check();
    if (value !== undefined) return value;
    await deps.sleep(POLL_MS);
  }
  return undefined;
}

/** The studio that answers for this project. The file of one that does not answer is removed. */
async function findStudio(deps: LifecycleDeps): Promise<StudioState | undefined> {
  const state = deps.readState();
  if (!state) return undefined;
  if (await deps.probe(state)) return state;
  // Its process is left alone: without an answer the pid may belong to another program by now.
  deps.removeState(state.pid);
  return undefined;
}

/** Stops a studio that answered: its own route first, by force once the wait is over. */
async function stopRunning(deps: LifecycleDeps, state: StudioState): Promise<void> {
  await deps.shutdown(state);
  const gone = await waitFor(deps, STOP_TIMEOUT_MS, () =>
    deps.isAlive(state.pid) ? undefined : true,
  );
  if (!gone) deps.forceKill(state.pid);
  // A browser its studio did not end goes too; the pid is as fresh as the studio's answer.
  if (state.browserPid !== undefined && deps.isAlive(state.browserPid)) {
    deps.forceKill(state.browserPid);
  }
  deps.removeState(state.pid);
}

export async function ensureStudio(
  deps: LifecycleDeps,
): Promise<StudioView & { started: boolean }> {
  const running = await findStudio(deps);
  if (running && running.version === deps.version) return { ...viewOf(running), started: false };
  if (running) await stopRunning(deps, running);
  const pid = deps.spawnServer();
  const state = await waitFor(deps, START_TIMEOUT_MS, async () => {
    const current = deps.readState();
    if (!current || current.pid !== pid) return undefined;
    return (await deps.probe(current)) ? current : undefined;
  });
  if (!state) {
    // This process was started just now, so it is ours to end.
    if (deps.isAlive(pid)) deps.forceKill(pid);
    throw new KitvasError('STUDIO_START_FAILED', { log: deps.files.log });
  }
  return { ...viewOf(state), started: true };
}

export async function studioStatus(deps: LifecycleDeps): Promise<StudioView | undefined> {
  const running = await findStudio(deps);
  return running ? viewOf(running) : undefined;
}

export async function stopStudio(deps: LifecycleDeps): Promise<StudioView | undefined> {
  const running = await findStudio(deps);
  if (!running) return undefined;
  await stopRunning(deps, running);
  return viewOf(running);
}

/** A one-time link to `path` in this project's studio, which must answer. */
export async function openLink(deps: LifecycleDeps, path: string): Promise<StudioLink> {
  const running = await findStudio(deps);
  if (!running) throw new KitvasError('STUDIO_START_FAILED', { log: deps.files.log });
  return deps.link(running, path);
}
