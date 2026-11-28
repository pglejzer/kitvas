// `kitvas studio serve`: runs the studio until it is told to stop, and owns its state file meanwhile.

import { join } from 'node:path';
import type { SharedBrowser } from '../../checks/index.ts';
import type { DraftStore } from '../../drafts/index.ts';
import type { KitStore } from '../../kit/index.ts';
import { PLUGIN_ROOT, type Translate, type ViewStore } from '../../shared/index.ts';
import type { EditDeps } from '../api/edit/edit-routes.ts';
import type { ImageStore } from '../api/images/image-rules.ts';
import type { LiveTools } from '../live/index.ts';
import type { StudioAssets } from '../pages/asset-routes.ts';
import type { IdleClock } from '../server/idle-stop.ts';
import { type StudioDeps, startStudio } from '../server/start-studio.ts';
import { readPorts, writePorts } from './ports-file.ts';
import { pageSecretOf } from './secret-file.ts';
import { removeState, type StudioFiles, type StudioState, writeState } from './state-file.ts';

export type ServeDeps = {
  drafts: DraftStore;
  kits: KitStore;
  t: Translate;
  assets: StudioAssets;
  version: string;
  /** The project's real path, written into the state file. */
  project: string;
  /** The project's studio files: the state it writes, the ports and the page secret it keeps. */
  files: Pick<StudioFiles, 'state' | 'ports' | 'secret'>;
  /** Errors kitvas did not raise; a detached studio writes them into its log. */
  log(text: string): void;
  /** Starts the browser the check jobs share; without it each check starts its own. */
  browser?: () => Promise<SharedBrowser>;
  /** Gets the function that stops the studio, for signals. */
  onStop?: (stop: () => void) => void;
  /** Minutes without use before the studio stops by itself (ADR 0042); 0 or absent: never. */
  idleMinutes?: number;
  /** The idle stop's time and timers; tests pass their own. */
  idleClock?: IdleClock;
  /** The editor's compiler and write hooks, from `src/main.ts`. */
  edit?: EditDeps;
  /** The live loop's watch and warm build, from `src/main.ts`. */
  live?: LiveTools;
  /** Image uploads into a version's `src/img/` (stage 4c), from `src/main.ts`. */
  imageStore?: ImageStore;
  /** The view the person chose, kept in their settings file; in memory when absent. */
  view?: ViewStore;
  /** The id of the kit the project uses, for the start page. */
  projectKit?: () => string;
  /** `kitvas doctor` for the Doctor page, from `src/main.ts`. */
  doctor?: StudioDeps['doctor'];
  /** The components of a `code` kit whose project files changed, from `src/main.ts`. */
  outdated?: StudioDeps['outdated'];
  /** The Insert pane's kit previews on disk (ADR 0075), from `src/main.ts`. */
  previews?: StudioDeps['previews'];
};

/**
 * Runs until the shutdown route, the idle stop or the stop function ends it; resolves with the
 * state it ran with.
 */
export async function serveStudio(deps: ServeDeps): Promise<StudioState> {
  let stop: () => void = () => undefined;
  const stopped = new Promise<void>((resolve) => {
    stop = resolve;
  });
  let state: StudioState | undefined;
  const stateFile = deps.files.state;
  const saved = readPorts(deps.files.ports);
  const studio = await startStudio(
    {
      drafts: deps.drafts,
      kits: deps.kits,
      project: deps.project,
      t: deps.t,
      assets: deps.assets,
      version: deps.version,
      onError: (error) =>
        deps.log(error instanceof Error ? (error.stack ?? error.message) : String(error)),
      onDenied: (line) => deps.log(line),
      onLog: (line) => deps.log(line),
      // The shutdown route and the idle stop end the studio the same way: through `stopped`.
      shutdown: () => stop(),
      ...(deps.idleClock ? { idleClock: deps.idleClock } : {}),
      cli: { bin: join(PLUGIN_ROOT, 'bin', 'kitvas.ts'), cwd: deps.project, env: process.env },
      ...(deps.browser ? { browser: deps.browser } : {}),
      ...(deps.edit ? { edit: deps.edit } : {}),
      ...(deps.live ? { live: deps.live } : {}),
      ...(deps.imageStore ? { imageStore: deps.imageStore } : {}),
      ...(deps.view ? { view: deps.view } : {}),
      ...(deps.projectKit ? { projectKit: deps.projectKit } : {}),
      ...(deps.doctor ? { doctor: deps.doctor } : {}),
      ...(deps.outdated ? { outdated: deps.outdated } : {}),
      ...(deps.previews ? { previews: deps.previews } : {}),
      // The browser's pid goes into the state file: `kitvas studio stop` ends one that lingers.
      onBrowser: (browserPid) => {
        if (!state) return;
        writeState(stateFile, browserPid === undefined ? state : { ...state, browserPid });
      },
    },
    {
      pageSecret: pageSecretOf(deps.files.secret),
      ...(saved ? { preferred: saved } : {}),
      ...(deps.idleMinutes === undefined ? {} : { idleMinutes: deps.idleMinutes }),
    },
  );
  // Only the first start writes the ports. A later one that had to take others leaves the file
  // alone: it names the address the person bookmarked, which works again once the port is free.
  if (!saved) writePorts(deps.files.ports, { port: studio.port, framePort: studio.framePort });
  state = {
    schemaVersion: 1,
    pid: process.pid,
    port: studio.port,
    framePort: studio.framePort,
    token: studio.token,
    version: deps.version,
    project: deps.project,
    startedAt: new Date().toISOString(),
  };
  writeState(stateFile, state);
  deps.onStop?.(() => stop());
  try {
    await stopped;
  } finally {
    removeState(stateFile, process.pid);
    await studio.close();
  }
  return state;
}
