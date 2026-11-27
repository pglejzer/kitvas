import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import type { KitStore } from '../../../src/kit/index.ts';
import { createEsbuildBundler } from '../../../src/render/adapters/esbuild-bundler.ts';
import { createNodeBuildFs } from '../../../src/render/adapters/node-build-fs.ts';
import { createSassPipeline } from '../../../src/render/adapters/sass-pipeline.ts';
import { scssLookup } from '../../../src/render/adapters/scss-plugin.ts';
import { createTailwindCss } from '../../../src/render/adapters/tailwind-css.ts';
import { createProjectStyles, type ProjectStyles } from '../../../src/render/index.ts';
import { PLUGIN_ROOT, projectKitsDir } from '../../../src/shared/index.ts';
import { GOOD_LAYOUT } from './drafts.ts';

export const JSX_RUNTIME = join(PLUGIN_ROOT, 'client', 'jsx', 'jsx-dev-runtime.ts');

/**
 * The real bundler, style pipeline and Tailwind worker, with packages from the repository's
 * node_modules (Tailwind always from the project a build names).
 */
export function renderTools() {
  const roots = [PLUGIN_ROOT];
  const styles = createSassPipeline({ roots });
  return {
    bundler: createEsbuildBundler({ roots, jsxRuntime: JSX_RUNTIME, scss: styles.compileFile }),
    styles,
    fs: createNodeBuildFs(),
    runtimeFiles: [JSX_RUNTIME],
    utility: createTailwindCss(),
  };
}

export type TestRenderTools = ReturnType<typeof renderTools>;

/** A project's own style files compiled by the Sass of `tools`, as `src/main.ts` wires it. */
export function projectStylesOf(tools: TestRenderTools): ProjectStyles {
  return createProjectStyles({
    read: (file) => (existsSync(file) ? readFileSync(file, 'utf8') : undefined),
    exists: existsSync,
    lookup: scssLookup,
    compile: tools.styles.compileText,
    utility: tools.utility,
  });
}

/** Stops esbuild, Sass and a running Tailwind worker of `renderTools()`. */
export async function closeRenderTools(tools: TestRenderTools): Promise<void> {
  await tools.bundler.dispose();
  await tools.styles.dispose();
  await tools.utility.dispose();
}

/** The kits in a project's `.kitvas/kits/`, read as project kits, as the layered store reads them. */
export function projectKitStore(project: string): KitStore {
  const store = createFolderKitStore(projectKitsDir(project));
  return {
    ...store,
    read(id) {
      const files = store.read(id);
      return files === undefined ? undefined : { ...files, project };
    },
  };
}

export const HERO_TSX = [
  "import { Button } from '@kit';",
  '',
  'export function Hero({ state }: { state: string }) {',
  '  return (',
  '    <section className="hero">',
  '      <h1>Shop</h1>',
  '      <p>State: {state}</p>',
  '      <Button onClick={(event) => event.currentTarget.setAttribute("data-pressed", "true")}>Buy</Button>',
  '      <Button variant="plain" onClick={(event) => event.currentTarget.setAttribute("data-pressed", "true")}>Later</Button>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

const ORDER_SUMMARY_TSX = [
  "import { Button, Icon } from '@kit';",
  '',
  'export function OrderSummary(_props: { state: string }) {',
  '  return (',
  '    <aside className="order-summary">',
  '      <Icon name="check" />',
  '      <Button onClick={(event) => event.currentTarget.setAttribute("data-pressed", "true")}>Pay</Button>',
  '    </aside>',
  '  );',
  '}',
  '',
].join('\n');

/** The files an agent would write for the `shop` draft with GOOD_LAYOUT. */
export const SECTION_FILES: Record<string, string> = {
  'md/layout.md': GOOD_LAYOUT,
  'src/tsx/sections/Hero.tsx': HERO_TSX,
  'src/tsx/sections/OrderSummary.tsx': ORDER_SUMMARY_TSX,
  'src/scss/sections/hero.scss':
    '.hero {\n  color: var(--kit-color-ink);\n  padding-inline: var(--kit-space-sm);\n}\n',
  'src/scss/sections/order-summary.scss':
    '.order-summary {\n  padding-inline: var(--kit-space-sm);\n}\n',
};

/** `draftDir` is the folder of the draft: `<workspace>/drafts/shop`. */
export function writeShopSections(draftDir: string, version = 'v1'): void {
  for (const [relPath, text] of Object.entries(SECTION_FILES)) {
    const file = join(draftDir, version, ...relPath.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}
