// The real lifecycle of a project's studio: its state file, processes and the studio's own routes.

import type { SharedBrowser } from '../../checks/index.ts';
import type { DraftStore } from '../../drafts/index.ts';
import type { KitStore } from '../../kit/index.ts';
import {
  createViewStore,
  DEFAULT_KIT,
  KitvasError,
  loadSettings,
  type Translate,
} from '../../shared/index.ts';
import type { EditDeps } from '../api/edit/edit-routes.ts';
import type { ImageStore } from '../api/images/image-rules.ts';
import { LinkSchema } from '../api/schemas.ts';
import type { LiveTools } from '../live/index.ts';
import type { StudioAssets } from '../pages/asset-routes.ts';
import type { LifecycleDeps } from './lifecycle.ts';
import { forceKill, isAlive, spawnServer } from './processes.ts';
import { type ServeDeps, serveStudio } from './serve.ts';
import {
  readState as readStateFile,
  removeState as removeStateFile,
  type StudioState,
  studioFiles,
} from './state-file.ts';
import { callStudio } from './studio-client.ts';

const CALL_TIMEOUT_MS = 2_000;

export type LifecycleInput = {
  dataDir: string;
  /** The project's real path. */
  project: string;
  version: string;
  /** `bin/kitvas.ts` of the plugin. */
  bin: string;
  env: NodeJS.ProcessEnv;
};

export function createLifecycle(input: LifecycleInput): LifecycleDeps {
  const files = studioFiles(input.dataDir, input.project);
  return {
    version: input.version,
    files,
    readState: () => readStateFile(files.state),
    removeState: (pid) => removeStateFile(files.state, pid),
    spawnServer: () =>
      spawnServer({
        bin: input.bin,
        project: input.project,
        log: files.log,
        env: { ...input.env, KITVAS_DATA_DIR: input.dataDir },
      }),
    isAlive,
    forceKill,
    probe: async (state) => {
      try {
        const answer = await callStudio(state, {
          method: 'GET',
          path: '/api/v1/status',
          timeoutMs: CALL_TIMEOUT_MS,
        });
        const body = answer.body as { name?: unknown; version?: unknown } | undefined;
        if (answer.status !== 200 || body?.name !== 'kitvas') return undefined;
        return typeof body.version === 'string' ? { version: body.version } : undefined;
      } catch {
        return undefined;
      }
    },
    shutdown: async (state) => {
      try {
        const answer = await callStudio(state, {
          method: 'POST',
          path: '/api/v1/shutdown',
          body: {},
          timeoutMs: CALL_TIMEOUT_MS,
        });
        return answer.status === 202;
      } catch {
        return false;
      }
    },
    link: async (state, path) => {
      const answer = await callStudio(state, {
        method: 'POST',
        path: '/api/v1/links',
        body: { path },
        timeoutMs: CALL_TIMEOUT_MS,
      });
      if (answer.status === 200) {
        const link = LinkSchema.safeParse(answer.body);
        if (link.success) return { url: link.data.url, fallbackUrl: link.data.fallbackUrl };
      }
      throw new KitvasError('INTERNAL', { detail: `the link route answered ${answer.status}` });
    },
    sleep: (ms) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }),
  };
}

export type ServeInput = {
  dataDir: string;
  /** The user's home: `studioIdleMinutes` and the view are kept in its `.kitvas/config.json`. */
  home: string;
  project: string;
  version: string;
  drafts: DraftStore;
  kits: KitStore;
  t: Translate;
  assets: StudioAssets;
  /** Starts the browser the check jobs share. */
  browser?: () => Promise<SharedBrowser>;
  /** The editor's compiler and hooks (stage 4a); without it the edit routes refuse. */
  edit?: EditDeps;
  /** The live loop's watch and warm build. */
  live?: LiveTools;
  /** Image uploads (stage 4c). */
  imageStore?: ImageStore;
  /** `kitvas doctor` for the Doctor page. */
  doctor?: ServeDeps['doctor'];
  /** The Insert pane's kit previews on disk (ADR 0075). */
  previews?: ServeDeps['previews'];
};

/** `kitvas studio serve`: errors go to stderr, which is the log file of a detached studio. */
export function serveProject(input: ServeInput): Promise<StudioState> {
  return serveStudio({
    drafts: input.drafts,
    kits: input.kits,
    t: input.t,
    assets: input.assets,
    version: input.version,
    project: input.project,
    ...(input.browser ? { browser: input.browser } : {}),
    ...(input.edit ? { edit: input.edit } : {}),
    ...(input.live ? { live: input.live } : {}),
    ...(input.imageStore ? { imageStore: input.imageStore } : {}),
    ...(input.doctor ? { doctor: input.doctor } : {}),
    ...(input.previews ? { previews: input.previews } : {}),
    // Read on each page: `kit use` may change it while the studio runs. A config that does not
    // read is the doctor's to report; the start page then names the built-in kit.
    projectKit: () => {
      try {
        return loadSettings({ home: input.home, cwd: input.project }).kit;
      } catch {
        return DEFAULT_KIT;
      }
    },
    files: studioFiles(input.dataDir, input.project),
    view: createViewStore(input.home),
    // Read once at the start: a changed setting applies from the next start of the studio.
    idleMinutes: loadSettings({ home: input.home, cwd: input.project }).studioIdleMinutes,
    log: (text) => {
      process.stderr.write(`${new Date().toISOString()} ${text}\n`);
    },
    onStop: (stop) => {
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    },
  });
}
