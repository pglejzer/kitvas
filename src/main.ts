// Composition root: the one place that wires modules together.

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
  createDoctorCommand,
  createDraftCommand,
  createInboxCommand,
  createKitCommand,
  createLayoutCommand,
  createMapCommand,
  createRequestCommand,
  createReworkCommand,
  createStudioCommand,
  disposeRenderTools,
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
          'channel/live-protocol.ts',
          'channel/protocol.ts',
          'channel/structure-protocol.ts',
          'frame/page/busy.ts',
          'frame/page/canvas.ts',
          'frame/edit/edit.ts',
          'frame/drag/preview.ts',
          'frame/drag/session.ts',
          'frame/drag/drag.ts',
          'frame/drag/gesture-log.ts',
          'frame/drag/slot-read.ts',
          'frame/drag/page-read.ts',
          'frame/drag/rect-layer.ts',
          'frame/drag/cursor.ts',
          'frame/drag/autoscroll.ts',
          'frame/drag/handles-sheet.ts',
          'frame/page/hush.ts',
          'frame/page/example.ts',
          'frame/flash/flash.ts',
          'frame/drag/flip.ts',
          'frame/live/force.ts',
          'frame/drag/guides.ts',
          'frame/drag/handles.ts',
          'frame/drag/item-slots.ts',
          'frame/drag/magnet.ts',
          'frame/drag/measure.ts',
          'frame/drag/spots.ts',
          'frame/edit/hide.ts',
          'frame/edit/label.ts',
          'frame/live/live.ts',
          'frame/live/a11y.ts',
          'frame/live/colour.ts',
          'frame/live/marks.ts',
          'frame/live/measure.ts',
          'frame/live/specificity.ts',
          'frame/live/pins.ts',
          'frame/edit/indicator.ts',
          'frame/edit/inline.ts',
          'frame/edit/items.ts',
          'frame/edit/keys.ts',
          'frame/page/marks.ts',
          'frame/page/measure.ts',
          'frame/drag/motion.ts',
          'frame/drag/place.ts',
          'frame/edit/preview.ts',
          'frame/page/rect.ts',
          'frame/runtime.ts',
          'frame/tones/tones.ts',
          'frame/drag/slots.ts',
          'frame/page/snapshot.ts',
          'frame/page/swap.ts',
          'frame/edit/structure.ts',
          'frame/edit/tree.ts',
        ].map((file) => join(PLUGIN_ROOT, 'client', file)),
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
        live: {
          watch: fsWatchPort(join(workspaceDir(project), 'drafts')),
          build: async (slug) => {
            const report = await buildDraft(
              { drafts: projectDrafts, kits: projectKits, ...warm },
              slug,
            );
            return { ok: report.built, version: report.version };
          },
          dispose: () => disposeRenderTools(warm),
        },
      });
    },
  };
  const commands = [
    statusCommand,
    initCommand,
    createKitCommand({
      kits,
      kitWriter,
      projectFiles: createProjectFiles,
      render,
      verify,
      scan,
      crop,
    }),
    createDraftCommand({ ...drafts, studio: { lifecycle: studio.lifecycle } }),
    createCraftCommand({ ...drafts, kitWriter, start: craftStart }),
    createReworkCommand({ ...drafts, start: reworkStart }),
    createLayoutCommand(drafts),
    createContextCommand(drafts),
    createMapCommand(drafts),
    createBuildCommand({ ...drafts, render }),
    createCheckCommand({ ...drafts, render, types, browser }),
    createBrowserCommand({ browser, installer, browsersDir }),
    createDoctorCommand({
      kits,
      projectFiles: createProjectFiles,
      browser,
      browsersDir,
      lifecycle: studio.lifecycle,
      dataDir,
      machine: createNodeMachine({ roots: defaultDepRoots() }),
      now: () => new Date(),
    }),
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
