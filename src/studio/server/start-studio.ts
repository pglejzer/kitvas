// Starts the studio: the studio origin (pages and API) and the prototype origin, both on 127.0.0.1.

import type { Server } from 'node:http';
import { join } from 'node:path';
import type { SharedBrowser } from '../../checks/index.ts';
import type { DraftStore } from '../../drafts/index.ts';
import type { KitStore } from '../../kit/index.ts';
import {
  memoryViewStore,
  PLUGIN_ROOT,
  type Translate,
  type ViewStore,
} from '../../shared/index.ts';
import type { EditDeps } from '../api/edit/edit-routes.ts';
import type { ImageStore } from '../api/images/image-rules.ts';
import { apiRoutes } from '../api/routes.ts';
import { createEventHub, type EventLimits } from '../events/event-hub.ts';
import { BODY_LIMIT } from '../http/body.ts';
import { etagOf } from '../http/etag.ts';
import {
  answerClientErrors,
  closeServer,
  createLimitedServer,
  listenLoopback,
  listenPreferred,
} from '../http/listen.ts';
import { createInbox } from '../inbox/inbox.ts';
import { type CliTarget, cliRunner, JOB_LIMITS, type JobLimits } from '../jobs/cli-runner.ts';
import { createJobs } from '../jobs/jobs.ts';
import { keepBrowser } from '../jobs/shared-browser.ts';
import { type LiveTools, startLiveLoop } from '../live/index.ts';
import { assetRoutes, type StudioAssets } from '../pages/asset-routes.ts';
import { openRoute } from '../pages/open-route.ts';
import { type PageDeps, pageRoutes } from '../pages/routes.ts';
import { type StudioSkin, studioSkin } from '../pages/skin.ts';
import { createDeniedLog } from '../security/denied-log.ts';
import { createOpenLinks } from '../security/open-links.ts';
import { frameHeaders, studioHeaders } from '../security/response-headers.ts';
import { newFrameKey, newNonce, newToken } from '../security/token.ts';
import { handleFrame } from './frame-handler.ts';
import { type IdleClock, isUse, startIdleStop } from './idle-stop.ts';
import { handleStudio } from './studio-handler.ts';

export type StudioDeps = {
  /** The drafts of the project the studio shows. */
  drafts: DraftStore;
  /** The kits, for the kit pages and for building what a draft shows. */
  kits: KitStore;
  /** The project's folder: where the kits' built examples are. Without it the kit page shows none. */
  project?: string | undefined;
  t: Translate;
  /** The browser scripts of the pages, served from `/assets/`. */
  assets: StudioAssets;
  /** The plugin's version, reported by the status route. */
  version: string;
  now?: () => Date;
  /** Errors kitvas did not raise; the response only says that something went wrong. */
  onError?: (error: unknown) => void;
  /** A line for each refused request (`security/denied-log.ts`), at most 20 a minute. */
  onDenied?: (line: string) => void;
  /** Called by the shutdown route, after its answer, and by the idle stop. */
  shutdown?: () => void;
  /** Lines for the studio's log that are no errors: why it stopped by itself. */
  onLog?: (line: string) => void;
  /** The idle stop's time and timers; tests pass their own. */
  idleClock?: IdleClock;
  /** Where jobs run the CLI; by default this plugin's `bin/kitvas.ts` in the current folder. */
  cli?: CliTarget;
  /** Starts the browser the check jobs share; without it each check starts its own. */
  browser?: () => Promise<SharedBrowser>;
  /** The shared browser started (its pid) or went away by itself (`undefined`). */
  onBrowser?: (pid: number | undefined) => void;
  /**
   * The editor's compiler and its write hooks (`api/edit-routes.ts`); `src/main.ts` gives the
   * compiler. Without it the edit routes that read TSX answer 500.
   */
  edit?: EditDeps;
  /** Where an uploaded image is written (`src/edit/adapters/image-files.ts`, wired in main). */
  imageStore?: ImageStore;
  /** The live loop's watch and warm build (`live/`); without it nothing rebuilds by itself. */
  live?: LiveTools;
  /**
   * The view the person chose (theme, panels, accent). `serveProject` gives the one kept in the
   * person's settings file; without it the view lives in memory and ends with the studio.
   */
  view?: ViewStore;
  /** The id of the kit the project uses (`kit use`), for the start page; `base` without it. */
  projectKit?: () => string;
  /** `kitvas doctor` for the Doctor page, from `src/main.ts`; without it the page shows the commands. */
  doctor?: PageDeps['doctor'];
};

export type StudioOptions = {
  /** The port to listen on, or fail; 0 or absent: `preferred`, else a free port. */
  port?: number;
  framePort?: number;
  /**
   * Ports to try first, such as the ones the project's studio had before, so its address stays
   * the same. One that another program holds falls back to a free port.
   */
  preferred?: { port: number; framePort: number };
  /** The page cookie's secret; a fresh one when absent, so no browser gets in until `/open`. */
  pageSecret?: string;
  /** Largest request body in bytes. */
  bodyLimit?: number;
  jobLimits?: Partial<JobLimits>;
  eventLimits?: Partial<EventLimits>;
  /**
   * Minutes without use before the studio stops itself through `shutdown` (ADR 0042); 0 or
   * absent never stops it.
   */
  idleMinutes?: number;
};

export type Studio = {
  /**
   * `http://127.0.0.1:<port>`, for programs on this machine that call the studio. People get
   * `studioUrl(port)` on `kitvas.localhost`.
   */
  url: string;
  port: number;
  framePort: number;
  /** The session token for API calls. Never put it in a URL or a log. */
  token: string;
  close(): Promise<void>;
};

/** A port given outright must be had; a preferred one is tried first; else the system picks. */
function listenOn(
  server: Server,
  given: number | undefined,
  preferred: number | undefined,
): Promise<number> {
  if (given !== undefined && given !== 0) return listenLoopback(server, given);
  return preferred === undefined ? listenLoopback(server, 0) : listenPreferred(server, preferred);
}

export async function startStudio(deps: StudioDeps, options: StudioOptions = {}): Promise<Studio> {
  const view = deps.view ?? memoryViewStore();
  // The sheet is made once; the view is read for every page, so a change shows on the next one.
  const skin: StudioSkin = {
    css: studioSkin(),
    view: () => view.read(),
  };
  const { t } = deps;
  const studioServer = createLimitedServer();
  const frameServer = createLimitedServer();
  let port: number;
  let framePort: number;
  try {
    port = await listenOn(studioServer, options.port, options.preferred?.port);
    framePort = await listenOn(frameServer, options.framePort, options.preferred?.framePort);
  } catch (error) {
    await Promise.all([closeServer(studioServer), closeServer(frameServer)]);
    throw error;
  }
  const token = newToken();
  const key = newFrameKey();
  const now = deps.now ?? (() => new Date());
  const pageSecret = options.pageSecret ?? newToken();
  const links = createOpenLinks(now);
  const onError = deps.onError;
  // One log for both origins, so the limit of 20 a minute holds for the studio as a whole.
  const denied = deps.onDenied ? createDeniedLog(deps.onDenied) : undefined;
  const events = createEventHub(options.eventLimits);
  // What the editor and Claude write rebuilds in this process and reaches the open pages.
  const live = deps.live
    ? startLiveLoop({
        ...deps.live,
        drafts: deps.drafts,
        etag: etagOf,
        publish: (type, data) => events.publish(type, data),
        // Spec 4d: a locked element another writer changed is told, never reverted.
        locks: deps.edit ? { drafts: deps.drafts, compiler: deps.edit.compiler } : undefined,
        onError,
      })
    : undefined;
  // The editor's own writes are told to the watcher first, so they count as the editor's.
  const edit: EditDeps | undefined =
    deps.edit && live
      ? {
          ...deps.edit,
          beforeWrite: (slug, version, etags) => {
            deps.edit?.beforeWrite?.(slug, version, etags);
            live.expect(slug, version, etags);
          },
        }
      : deps.edit;
  const cli = deps.cli ?? {
    bin: join(PLUGIN_ROOT, 'bin', 'kitvas.ts'),
    cwd: process.cwd(),
    env: process.env,
  };
  const keeper = deps.browser ? keepBrowser(deps.browser, deps.onBrowser) : undefined;
  const run = cliRunner(
    cli,
    { ...JOB_LIMITS, ...options.jobLimits },
    t,
    (text) => onError?.(new Error(text)),
    keeper ? (args) => keeper.envFor(args) : undefined,
  );
  const jobs = createJobs({
    run,
    // A job that starts or ends is use: the idle wait counts from the end of the last one.
    publish: (job) => {
      idle.touch();
      events.publish('job', job);
    },
    now,
    t,
  });
  // Without a way to stop, there is nothing to stop when idle.
  const minutes = deps.shutdown ? (options.idleMinutes ?? 0) : 0;
  const idle = startIdleStop({
    minutes,
    busy: () => jobs.busy(),
    stop: () => {
      // The log says why the studio went away; the line holds no token and no page secret.
      deps.onLog?.(t('studio.log.idle', { minutes }));
      deps.shutdown?.();
    },
    ...(deps.idleClock ? { clock: deps.idleClock } : {}),
  });
  const inbox = createInbox({ now, publish: (pending) => events.publish('inbox', { pending }) });
  const routes = [
    ...pageRoutes({
      drafts: deps.drafts,
      kits: deps.kits,
      project: deps.project,
      t,
      skin,
      frame: { port: framePort, key },
      version: deps.version,
      projectKit: deps.projectKit ?? (() => 'base'),
      doctor: deps.doctor,
    }),
    ...assetRoutes(deps.assets),
    openRoute({ links, t, port, pageSecret, skin }),
    ...apiRoutes({
      drafts: deps.drafts,
      kits: deps.kits,
      version: deps.version,
      startedAt: now().toISOString(),
      port,
      framePort,
      now,
      jobs,
      events,
      inbox,
      t,
      links,
      view,
      ...(live ? { live: { settle: (slug: string) => live.settle(slug) } } : {}),
      ...(deps.shutdown ? { shutdown: deps.shutdown } : {}),
      ...(edit ? { edit } : {}),
      ...(deps.imageStore ? { imageStore: deps.imageStore } : {}),
    }),
  ];
  const studio = {
    routes,
    token,
    pageSecret,
    skin,
    port,
    framePort,
    bodyLimit: options.bodyLimit ?? BODY_LIMIT,
    t,
    onError,
    denied,
  };
  const frame = {
    drafts: deps.drafts,
    project: deps.project,
    key,
    port: framePort,
    studioPort: port,
    t,
    onError,
    denied,
  };
  // Handlers come only now: the security headers of each origin name the other one's port.
  studioServer.on('request', (req, res) => {
    // Use from the request until its answer ends; never the events stream (`isUse`).
    if (isUse(req.url)) res.once('close', idle.hold());
    handleStudio(studio, req, res).catch((error: unknown) => {
      onError?.(error);
      res.destroy();
    });
  });
  frameServer.on('request', (req, res) => handleFrame(frame, req, res));
  const unreadable = t('error.REQUEST_INVALID', { detail: t('studio.bad.unreadable') });
  answerClientErrors(studioServer, () => studioHeaders(newNonce(), framePort), unreadable);
  answerClientErrors(frameServer, () => frameHeaders(port, framePort), unreadable);
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    framePort,
    token,
    close: async () => {
      idle.close();
      // Running jobs end first, so their last event still reaches the open streams.
      await jobs.close();
      await keeper?.close();
      inbox.close();
      await live?.close();
      events.close();
      await Promise.all([closeServer(studioServer), closeServer(frameServer)]);
      await deps.edit?.dispose?.();
    },
  };
}
