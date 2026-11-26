// Composition root: the one place that wires modules together.

import { randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createBrowserInstaller } from './checks/adapters/browser/browser-installer.ts';
import { createPlaywrightBrowser } from './checks/adapters/browser/playwright-browser.ts';
import { createPlaywrightHost } from './checks/adapters/browser/playwright-host.ts';
import { createTscChecker } from './checks/adapters/tsc-checker.ts';
import {
  cropKit,
  makePreviews,
  measureLayers,
  readPreviews,
  refuseFailedKit,
  SHARED_BROWSER_ENV,
  type StartReworkInput,
  scanKit,
  startCraft,
  startRework,
  verifyKit,
} from './checks/index.ts';
import {
  createBrowserCommand,
  createBuildCommand,
  createCheckCommand,
  createContextCommand,
  createCraftCommand,
  createDecisionsCommand,
  createDoctorCommand,
  createDraftCommand,
  createHandoffCommand,
  createInboxCommand,
  createKitCommand,
  createLayoutCommand,
  createMapCommand,
  createRequestCommand,
  createReworkCommand,
  createStudioCommand,
  disposeRenderTools,
  doctorReport,
  guidelinesCommand,
  initCommand,
  type RenderTools,
  runCli,
  statusCommand,
} from './cli/index.ts';
import { createNodeMachine } from './doctor/adapters/node-machine.ts';
import { createFsDraftStore } from './drafts/adapters/fs-draft-store.ts';
import { createEsbuildCompiler } from './edit/adapters/esbuild-compiler.ts';
import { createImageFiles, createImageStore } from './edit/adapters/image-files.ts';
import { createNodeHandoffFiles } from './handoff/adapters/node-handoff-files.ts';
import { compareHandoff, writeBrief } from './handoff/index.ts';
import { createFolderKitStore } from './kit/adapters/folder-store.ts';
import { createFolderKitWriter } from './kit/adapters/folder-writer.ts';
import { createLayeredKitStore } from './kit/adapters/layered-store.ts';
import { createProjectFiles } from './kit/adapters/project-files.ts';
import type { KitStore } from './kit/index.ts';
import { createEsbuildBundler } from './render/adapters/esbuild-bundler.ts';
import { createNodeBuildFs } from './render/adapters/node-build-fs.ts';
import { createSassPipeline } from './render/adapters/sass-pipeline.ts';
import { createTailwindCss } from './render/adapters/tailwind-css.ts';
import { buildDraft } from './render/index.ts';
import {
  defaultDepRoots,
  PLUGIN_ROOT,
  pluginVersion,
  projectKitsDir,
  readDecisionsText,
  resolveDataDir,
  type Translate,
  workspaceDir,
} from './shared/index.ts';
import { createEsbuildAssets } from './studio/adapters/esbuild-assets.ts';
import { createSystemBrowser } from './studio/adapters/system-browser.ts';
import { createLifecycle, fsWatchPort, serveProject } from './studio/index.ts';

export function main(argv: string[]): Promise<number> {
  const cwd = process.cwd();
  const builtinKits = createFolderKitStore(join(PLUGIN_ROOT, 'kits'));
  // Built-in kits first, then the kits this project learned in `.kitvas/kits/`.
  const kitsAt = (project: string): KitStore =>
    createLayeredKitStore(builtinKits, {
      dir: project,
      store: createFolderKitStore(projectKitsDir(project)),
    });
  const kits = kitsAt(cwd);
  const kitWriter = createFolderKitWriter(projectKitsDir(cwd));
  const jsxRuntime = join(PLUGIN_ROOT, 'client', 'jsx', 'jsx-dev-runtime.ts');
  const drafts = {
    kits,
    draftsAt: (dir: string) => createFsDraftStore(join(workspaceDir(dir), 'drafts')),
  };
  const render = (): RenderTools => {
    const roots = defaultDepRoots();
    const styles = createSassPipeline({ roots });
    const fs = createNodeBuildFs();
    return {
      bundler: createEsbuildBundler({ roots, jsxRuntime, scss: styles.compileFile }),
      styles,
      fs,
      utility: createTailwindCss(),
      kitWriter,
      kitGate: (kit) => refuseFailedKit((path) => fs.readText(path), kit),
      // Everything of kitvas's own that a prototype or catalog bundle holds: the JSX runtime, the
      // frame runtimes and the protocol they speak.
      runtimeFiles: [
        jsxRuntime,
        ...[
          'channel/canvas-protocol.ts',
          'channel/edit-protocol.ts',
          'channel/gesture-protocol.ts',
          'channel/guards.ts',
          'channel/lens-protocol.ts',
          'channel/live-protocol.ts',
          'channel/protocol.ts',
          'channel/structure-protocol.ts',
          'frame/page/busy.ts',
          'frame/page/canvas.ts',
          'frame/edit/edit.ts',
          'frame/edit/row-pick.ts',
          'frame/drag/motion/preview.ts',
          'frame/drag/motion/drop-record.ts',
          'frame/drag/session.ts',
          'frame/drag/drag.ts',
          'frame/drag/gesture/gesture-log.ts',
          'frame/drag/slots/slot-read.ts',
          'frame/drag/page-read.ts',
          'frame/drag/gesture/rect-layer.ts',
          'frame/drag/gesture/cursor.ts',
          'frame/drag/gesture/autoscroll.ts',
          'frame/drag/handles/handles-sheet.ts',
          'frame/page/hush.ts',
          'frame/page/example.ts',
          'frame/page/options.ts',
          'frame/page/show.ts',
          'frame/flash/flash.ts',
          'frame/drag/motion/flip.ts',
          'frame/live/force.ts',
          'frame/drag/handles/guides.ts',
          'frame/drag/handles/handles.ts',
          'frame/drag/slots/item-slots.ts',
          'frame/drag/handles/magnet.ts',
          'frame/drag/handles/measure.ts',
          'frame/drag/handles/spots.ts',
          'frame/edit/claude-marks.ts',
          'frame/edit/hide.ts',
          'frame/edit/label.ts',
          'frame/live/live.ts',
          'frame/live/a11y.ts',
          'frame/live/measure.ts',
          'frame/live/specificity.ts',
          'frame/live/pins.ts',
          'frame/lens/pins.ts',
          'frame/lens/place.ts',
          'frame/edit/pick.ts',
          'frame/edit/indicator.ts',
          'frame/edit/inline.ts',
          'frame/edit/items.ts',
          'frame/edit/keys.ts',
          'frame/page/marks.ts',
          'frame/page/measure.ts',
          'frame/page/overlay-host.ts',
          'frame/drag/motion/motion.ts',
          'frame/drag/place.ts',
          'frame/edit/preview.ts',
          'frame/page/rect.ts',
          'frame/runtime.ts',
          'frame/tones/tones.ts',
          'frame/drag/slots/slots.ts',
          'frame/page/snapshot.ts',
          'frame/page/swap.ts',
          'frame/page/theme-body.ts',
          'frame/edit/structure.ts',
          'frame/edit/tree.ts',
        ].map((file) => join(PLUGIN_ROOT, 'client', file)),
        // The package-free `src/` files the frame imports (ADR 0080).
        ...[
          'edit/domain/types.ts',
          'shared/values/colour.ts',
          'shared/values/guards.ts',
          'shared/values/numbers.ts',
          'shared/values/options.ts',
          'shared/values/paths.ts',
          'studio/pages/brand/part.ts',
          'studio/pages/skin/logo.ts',
          'studio/theme/tokens.ts',
        ].map((file) => join(PLUGIN_ROOT, 'src', file)),
      ],
    };
  };
  const dataDir = resolveDataDir({ env: process.env.KITVAS_DATA_DIR, home: homedir() });
  const browsersDir = join(dataDir, 'browsers');
  // A check run as a studio job gets the studio's browser through these two variables.
  const endpoint = process.env[SHARED_BROWSER_ENV.endpoint];
  const shared = endpoint
    ? { endpoint, name: process.env[SHARED_BROWSER_ENV.name] ?? 'chromium' }
    : undefined;
  const browser = () =>
    createPlaywrightBrowser({
      roots: defaultDepRoots(),
      browsersDir,
      ...(shared ? { shared } : {}),
    });
  const types = () => createTscChecker({ roots: defaultDepRoots() });
  const verify = async (project: string, id: string) => {
    const tools = render();
    try {
      return await verifyKit(
        {
          kits,
          kitWriter,
          projectFiles: createProjectFiles,
          render: tools,
          types: types(),
          browser: browser(),
          now: () => new Date(),
        },
        id,
        project,
      );
    } finally {
      await disposeRenderTools(tools);
    }
  };
  // `kit scan` judges each host by every address it resolves to (private ones are refused).
  const addresses = async (host: string): Promise<string[]> =>
    (await lookup(host, { all: true })).map((entry) => entry.address);
  const scan = (project: string, id: string, options: { urls: string[]; allowPrivate: boolean }) =>
    scanKit({ kits, kitWriter, browser: browser(), lookup: addresses }, project, id, options);
  const crop = (project: string, id: string) => cropKit({ kits, browser: browser() }, project, id);
  // `kit previews` (ADR 0075): a studio job when the editor's Insert pane asks for them.
  const previews = async (project: string, id: string) => {
    const tools = render();
    try {
      return await makePreviews(
        { kits, kitWriter, render: tools, browser: browser() },
        id,
        project,
      );
    } finally {
      await disposeRenderTools(tools);
    }
  };
  const craftStart = (project: string, input: Parameters<typeof startCraft>[1], t: Translate) =>
    startCraft(
      {
        drafts: drafts.draftsAt(project),
        kits: kitsAt(project),
        browser: browser(),
        lookup: addresses,
        readFile: (path) => {
          try {
            return readFileSync(path);
          } catch {
            return undefined;
          }
        },
        writeFile: (path, bytes) => {
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, bytes);
        },
        now: () => new Date(),
        t,
      },
      input,
    );
  // `rework new`: like `kit scan` for a URL, and the person's images copied into the draft.
  const reworkStart = (project: string, input: StartReworkInput, t: Translate) =>
    startRework(
      {
        drafts: drafts.draftsAt(project),
        kits: kitsAt(project),
        browser: browser(),
        lookup: addresses,
        readFile: (path) => {
          try {
            return readFileSync(path);
          } catch {
            return undefined;
          }
        },
        writeFile: (path, bytes) => {
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, bytes);
        },
        remove: (path) => rmSync(path, { recursive: true, force: true }),
        now: () => new Date(),
        t,
      },
      input,
    );
  const browserHost = () => createPlaywrightHost({ roots: defaultDepRoots(), browsersDir });
  const installer = () => createBrowserInstaller({ roots: defaultDepRoots(), browsersDir });
  const version = pluginVersion();
  const studio = {
    draftsAt: drafts.draftsAt,
    openBrowser: createSystemBrowser(),
    lifecycle: (project: string) =>
      createLifecycle({
        dataDir,
        project,
        version,
        bin: join(PLUGIN_ROOT, 'bin', 'kitvas.ts'),
        env: process.env,
      }),
    serve: (project: string, t: Translate) => {
      // The editor finds elements again and checks its writes with one kept esbuild service.
      const compiler = createEsbuildCompiler(defaultDepRoots());
      // One set of build tools kept loaded for the studio's life: a rebuild after an edit costs no
      // process start.
      const warm = render();
      const projectDrafts = drafts.draftsAt(project);
      const projectKits = kitsAt(project);
      return serveProject({
        dataDir,
        home: homedir(),
        project,
        version,
        drafts: drafts.draftsAt(project),
        kits: kitsAt(project),
        t,
        assets: createEsbuildAssets({
          roots: defaultDepRoots(),
          clientDir: join(PLUGIN_ROOT, 'client'),
        }),
        browser: () => browserHost().serve(),
        edit: {
          compiler,
          images: createImageFiles(projectDrafts),
          dispose: () => compiler.dispose(),
        },
        imageStore: createImageStore(projectDrafts),
        // The Insert pane's previews on disk, read on each palette request; jobs make them.
        previews: {
          read: (kitId) =>
            readPreviews(
              { kits: projectKits, fs: warm.fs, runtimeFiles: warm.runtimeFiles },
              kitId,
              project,
            ),
        },
        doctor: () => doctorReport(doctorDeps, { cwd: project, home: homedir(), t }),
        live: {
          watch: fsWatchPort(join(workspaceDir(project), 'drafts')),
          build: async (slug) => {
            const report = await buildDraft(
              { drafts: projectDrafts, kits: projectKits, ...warm },
              slug,
            );
            return { ok: report.built, version: report.version, cached: report.cached };
          },
          dispose: () => disposeRenderTools(warm),
        },
      });
    },
  };
  // The doctor's parts, for its command and for the studio's Doctor page.
  const doctorDeps = {
    kits,
    projectFiles: createProjectFiles,
    browser,
    browsersDir,
    lifecycle: studio.lifecycle,
    dataDir,
    machine: createNodeMachine({ roots: defaultDepRoots() }),
    now: () => new Date(),
  };
  const commands = [
    statusCommand,
    initCommand,
    createDecisionsCommand({ kits }),
    createKitCommand({
      kits,
      kitWriter,
      projectFiles: createProjectFiles,
      render,
      verify,
      scan,
      crop,
      previews,
    }),
    createDraftCommand({ ...drafts, studio: { lifecycle: studio.lifecycle } }),
    createCraftCommand({ ...drafts, kitWriter, start: craftStart }),
    createReworkCommand({ ...drafts, start: reworkStart }),
    createLayoutCommand(drafts),
    createContextCommand(drafts),
    createMapCommand(drafts),
    createBuildCommand({ ...drafts, render }),
    createCheckCommand({ ...drafts, render, types, browser }),
    createHandoffCommand({
      ...drafts,
      render,
      // The layer walk (plan 21) opens the browser once for the widths of one send.
      measure: (renderDeps, input) =>
        measureLayers({ render: renderDeps, browser: browser() }, input),
      files: createNodeHandoffFiles(),
      newSendId: () => randomBytes(5).toString('hex'),
      now: () => new Date(),
      projectFiles: createProjectFiles,
      // Plan 22: the brief reads the draft, its kit and the project; the comparison opens one page.
      brief: (project, store, input) =>
        writeBrief(
          {
            drafts: store,
            kits: kitsAt(project),
            files: createProjectFiles(project),
            decisions: () => readDecisionsText(project),
            rules: join(PLUGIN_ROOT, 'reference', 'handoff-code.md'),
          },
          input,
        ),
      compare: (_project, store, input) =>
        compareHandoff({ drafts: store, browser: browser(), lookup: addresses }, input),
    }),
    createBrowserCommand({ browser, installer, browsersDir }),
    createDoctorCommand(doctorDeps),
    createStudioCommand(studio),
    createInboxCommand({ lifecycle: studio.lifecycle }),
    createRequestCommand({ lifecycle: studio.lifecycle }),
    guidelinesCommand,
  ];
  return runCli(argv, commands, {
    out: (text) => console.log(text),
    err: (text) => console.error(text),
    cwd,
    home: homedir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  });
}
