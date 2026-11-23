// Composition root: the one place that wires modules together.

import { lookup } from 'node:dns/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createBrowserInstaller } from './checks/adapters/browser-installer.ts';
import { createPlaywrightBrowser } from './checks/adapters/playwright-browser.ts';
import { createPlaywrightHost } from './checks/adapters/playwright-host.ts';
import { createTscChecker } from './checks/adapters/tsc-checker.ts';
import {
  cropKit,
  refuseFailedKit,
  SHARED_BROWSER_ENV,
  scanKit,
  verifyKit,
} from './checks/index.ts';
import {
  createBrowserCommand,
  createBuildCommand,
  createCheckCommand,
  createContextCommand,
  createDraftCommand,
  createInboxCommand,
  createKitCommand,
  createLayoutCommand,
  createMapCommand,
  createStudioCommand,
  disposeRenderTools,
  initCommand,
  type RenderTools,
  runCli,
  statusCommand,
} from './cli/index.ts';
import { createFsDraftStore } from './drafts/adapters/fs-draft-store.ts';
import { createFolderKitStore } from './kit/adapters/folder-store.ts';
import { createFolderKitWriter } from './kit/adapters/folder-writer.ts';
import { createLayeredKitStore } from './kit/adapters/layered-store.ts';
import { createProjectFiles } from './kit/adapters/project-files.ts';
import type { KitStore } from './kit/index.ts';
import { createEsbuildBundler } from './render/adapters/esbuild-bundler.ts';
import { createNodeBuildFs } from './render/adapters/node-build-fs.ts';
import { createSassPipeline } from './render/adapters/sass-pipeline.ts';
import { createTailwindCss } from './render/adapters/tailwind-css.ts';
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
import { createLifecycle, serveProject } from './studio/index.ts';

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
          'channel/protocol.ts',
          'frame/example.ts',
          'frame/flip.ts',
          'frame/marks.ts',
          'frame/measure.ts',
          'frame/motion.ts',
          'frame/place.ts',
          'frame/runtime.ts',
          'frame/snapshot.ts',
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
    serve: (project: string, t: Translate) =>
      serveProject({
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
      }),
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
    createDraftCommand(drafts),
    createLayoutCommand(drafts),
    createContextCommand(drafts),
    createMapCommand(drafts),
    createBuildCommand({ ...drafts, render }),
    createCheckCommand({ ...drafts, render, types, browser }),
    createBrowserCommand({ browser, installer, browsersDir }),
    createStudioCommand(studio),
    createInboxCommand({ lifecycle: studio.lifecycle }),
  ];
  return runCli(argv, commands, {
    out: (text) => console.log(text),
    err: (text) => console.error(text),
    cwd,
    home: homedir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  });
}
