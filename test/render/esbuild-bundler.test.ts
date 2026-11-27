import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createEsbuildBundler } from '../../src/render/adapters/esbuild-bundler.ts';
import { createSassPipeline } from '../../src/render/adapters/sass-pipeline.ts';
import type { BundleInput } from '../../src/render/index.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';
import { JSX_RUNTIME } from '../helpers/draft/render.ts';
import { tempProject, writeFile } from './helpers/temp-project.ts';

/** A React of the project's own that no real React prints: proof of where the alias points. */
const PROJECT_REACT: Record<string, string> = {
  'node_modules/react/package.json':
    '{ "name": "react", "version": "18.3.1", "type": "module", "main": "index.js" }\n',
  'node_modules/react/index.js': 'export const marker = "project-react-18";\n',
  'node_modules/react-dom/package.json':
    '{ "name": "react-dom", "version": "18.3.1", "type": "module", "main": "index.js" }\n',
  'node_modules/react-dom/index.js': 'export const flushSync = (run) => run();\n',
};

const STYLES: Record<string, string> = {
  'work/Button.module.css': '.primary {\n  color: red;\n}\n',
  'work/Card.module.scss': '$pad: 4px;\n.card {\n  padding: $pad;\n}\n',
  'work/plain.css': '@font-face {\n  font-family: Brand;\n  src: url(./brand.woff2);\n}\n',
  'work/legacy.scss': [
    '@use "sass:math";',
    '@use "theme-pkg/vars" as v;',
    '.legacy {',
    '  width: math.div(16px, 2);',
    '  gap: v.$gap;',
    '}',
    '',
  ].join('\n'),
  'node_modules/theme-pkg/_vars.scss': '$gap: 12px;\n',
  'work/broken.scss': '.a {\n  color: $nope;\n}\n',
};

const ENTRY = [
  "import { marker } from 'react';",
  "import button from './Button.module.css';",
  "import card from './Card.module.scss';",
  "import './plain.css';",
  "import './legacy.scss';",
  'console.log(marker, button.primary, card.card, import.meta.env.DEV, process.env.API_URL);',
  '',
].join('\n');

function tools(withScss = true) {
  const roots = [PLUGIN_ROOT];
  const styles = createSassPipeline({ roots });
  const bundler = createEsbuildBundler({
    roots,
    jsxRuntime: JSX_RUNTIME,
    ...(withScss ? { scss: styles.compileFile } : {}),
  });
  const close = async (): Promise<void> => {
    await bundler.dispose();
    await styles.dispose();
  };
  return { bundler, close };
}

/** A build in `<project>/work`. The folder must exist: esbuild resolves nothing from a missing one. */
function input(project: string, source: string, withProject = true): BundleInput {
  const workingDir = join(project, 'work');
  mkdirSync(workingDir, { recursive: true });
  return {
    workingDir,
    entry: { name: 'entry.tsx', source },
    alias: {},
    ids: {},
    ...(withProject ? { project } : {}),
  };
}

test('one build gives the script and the CSS of every style the modules import', async () => {
  const project = tempProject([], { ...PROJECT_REACT, ...STYLES });
  writeFile(project, 'work/brand.woff2', 'abc');
  const { bundler, close } = tools();
  try {
    const result = await bundler.bundle(input(project, ENTRY));
    assert.deepEqual(result.errors, []);
    // React comes from the project when it has one.
    assert.ok(result.js.includes('project-react-18'));
    // CSS Modules: the scoped name in the script matches the sheet.
    assert.ok(result.js.includes('Button_primary'));
    assert.ok(result.css.includes('.Button_primary'));
    assert.ok(result.css.includes('.Card_module_card'));
    assert.ok(result.css.includes('padding: 4px'));
    // Sass: modules of its own and packages from the project's node_modules.
    assert.ok(result.css.includes('width: 8px'));
    assert.ok(result.css.includes('gap: 12px'));
    // A font a sheet refers to is inlined. esbuild writes short text bytes as they are and binary
    // ones in base64, so only the data URL's start is fixed.
    assert.match(result.css, /url\(data:font\/woff2[,;]/);
    // Code written for Vite reads import.meta.env and process.env without crashing.
    // esbuild keeps a `// <define:import.meta.env>` comment; no read of it is left in the code.
    assert.doesNotMatch(result.js, /import\.meta\.env\./);
    assert.ok(result.js.includes('"development"'));
  } finally {
    await close();
  }
});

test('without a project, or in a project without React, React is the copy kitvas ships', async () => {
  const project = tempProject([], PROJECT_REACT);
  const plain = tempProject([]);
  const { bundler, close } = tools();
  const source = "import { marker } from 'react';\nconsole.log(marker);\n";
  try {
    const outside = await bundler.bundle(input(project, source, false));
    assert.deepEqual(outside.errors, []);
    assert.ok(!outside.js.includes('project-react-18'));
    const without = await bundler.bundle(input(plain, source));
    assert.deepEqual(without.errors, []);
    assert.ok(!without.js.includes('project-react-18'));
    assert.equal(without.css, '');
  } finally {
    await close();
  }
});

test('React hoisted into a parent workspace is the project copy', async () => {
  const parent = tempProject([], PROJECT_REACT);
  writeFile(parent, 'package.json', '{ "name": "root", "private": true, "workspaces": ["app"] }\n');
  const app = join(parent, 'app');
  writeFile(app, 'package.json', '{ "name": "app", "private": true }\n');
  const { bundler, close } = tools();
  const source = "import { marker } from 'react';\nconsole.log(marker);\n";
  try {
    const result = await bundler.bundle(input(app, source));
    assert.deepEqual(result.errors, []);
    assert.ok(result.js.includes('project-react-18'));
  } finally {
    await close();
  }
});

test('a Sass import is found in a parent workspace node_modules', async () => {
  const parent = tempProject([], {
    'node_modules/theme-pkg/_vars.scss': '$gap: 12px;\n',
    'package.json': '{ "name": "root", "private": true, "workspaces": ["app"] }\n',
  });
  const app = join(parent, 'app');
  writeFile(app, 'package.json', '{ "name": "app", "private": true }\n');
  writeFile(app, 'work/legacy.scss', '@use "theme-pkg/vars" as v;\n.a { gap: v.$gap; }\n');
  const { bundler, close } = tools();
  try {
    const result = await bundler.bundle(input(app, "import './legacy.scss';\n"));
    assert.deepEqual(result.errors, []);
    assert.ok(result.css.includes('gap: 12px'));
  } finally {
    await close();
  }
});

test('a project tsconfig with classic JSX still gives dev JSX and keeps its paths', async () => {
  const project = tempProject([], {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        jsx: 'react',
        jsxFactory: 'h',
        paths: { '@/*': ['./src/*'] },
      },
    }),
    'src/lib/utils.ts': 'export const aliasMarker = "alias-resolved";\n',
    'work/Page.tsx': [
      "import { aliasMarker } from '@/lib/utils';",
      'export const page = <div title={aliasMarker}>Hi</div>;',
      '',
    ].join('\n'),
  });
  const { bundler, close } = tools();
  try {
    const result = await bundler.bundle(
      input(project, "import { page } from './Page';\nconsole.log(page);\n"),
    );
    assert.deepEqual(result.errors, []);
    assert.ok(result.js.includes('jsxDEV'));
    assert.ok(!result.js.includes('h("div"'));
    assert.ok(result.js.includes('alias-resolved'));
    const written = readFileSync(
      join(project, 'work', 'build', 'json', 'tsconfig.esbuild.json'),
      'utf8',
    );
    assert.ok(written.includes('"react-jsxdev"'));
    assert.ok(written.includes('"kitvas-jsx"'));
    assert.ok(!written.includes('\\'));
  } finally {
    await close();
  }
});

test('a Sass error is a styles error at its place in the file', async () => {
  const project = tempProject([], STYLES);
  const { bundler, close } = tools();
  try {
    const result = await bundler.bundle(input(project, "import './broken.scss';\n"));
    assert.equal(result.js, '');
    assert.equal(result.css, '');
    assert.equal(result.errors.length, 1);
    const [error] = result.errors;
    assert.deepEqual(
      { source: error?.source, file: error?.file, line: error?.line, column: error?.column },
      { source: 'styles', file: 'broken.scss', line: 2, column: 10 },
    );
    assert.match(error?.message ?? '', /Undefined variable/);
  } finally {
    await close();
  }
});

test('without a Sass compiler an imported .scss file is a bundle error', async () => {
  const project = tempProject([], STYLES);
  const { bundler, close } = tools(false);
  try {
    const result = await bundler.bundle(input(project, "import './legacy.scss';\n"));
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0]?.source, 'bundle');
  } finally {
    await close();
  }
});

const LOOKUP_FILES: Record<string, string> = {
  ...PROJECT_REACT,
  'node_modules/theme-pkg/_vars.scss': '$gap: 12px;\n',
  'src/shared/marker.ts': 'export const baseMarker = "base-folder";\n',
  'src/style/_space.scss': '$pad: 24px;\n',
  'design/tokens/names.ts': 'export const aliasMarker = "declared-alias";\n',
  'design/tokens/_ink.scss': '$ink: #123456;\n',
  'work/page.ts': "export { baseMarker as Page } from 'shared/marker';\n",
  'work/card.scss': [
    '@use "style/space" as space;',
    '@use "~tokens/ink" as ink;',
    '@use "theme-pkg/vars" as v;',
    '.card {',
    '  padding: space.$pad;',
    '  color: ink.$ink;',
    '  gap: v.$gap;',
    '}',
    '',
  ].join('\n'),
};

const LOOKUP_ENTRY = [
  "import { marker } from 'react';",
  "import { baseMarker } from 'shared/marker';",
  "import { aliasMarker } from '~tokens/names';",
  "import './card.scss';",
  'console.log(marker, baseMarker, aliasMarker);',
  '',
].join('\n');

const TOKENS_ALIAS = { roots: [], alias: { '~tokens': 'design/tokens' }, types: [] };

test("scripts and Sass find a project's files as its tsconfig and its kit say", async () => {
  const project = tempProject([], {
    ...LOOKUP_FILES,
    'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: 'src' } }),
  });
  const { bundler, close } = tools();
  try {
    const result = await bundler.bundle({
      ...input(project, LOOKUP_ENTRY),
      resolve: TOKENS_ALIAS,
    });
    assert.deepEqual(result.errors, []);
    // The base folder of the tsconfig and the name the kit declares, in scripts and in Sass.
    assert.ok(result.js.includes('base-folder'));
    assert.ok(result.js.includes('declared-alias'));
    assert.ok(result.css.includes('padding: 24px'));
    assert.ok(result.css.includes('color: #123456'));
    // Packages are still found in node_modules, React still by kitvas's alias.
    assert.ok(result.css.includes('gap: 12px'));
    assert.ok(result.js.includes('project-react-18'));
  } finally {
    await close();
  }
});

test('a project with no tsconfig is described by its kit alone', async () => {
  const project = tempProject([], LOOKUP_FILES);
  const written = join(project, 'work', 'build', 'json', 'tsconfig.esbuild.json');
  const { bundler, close } = tools();
  try {
    // Nothing says where `shared/marker` is: no tsconfig of kitvas is written, the build stops.
    const bare = await bundler.bundle(input(project, LOOKUP_ENTRY));
    assert.match(bare.errors[0]?.message ?? '', /Could not resolve "shared\/marker"/);
    assert.ok(!existsSync(written));

    const resolve = { ...TOKENS_ALIAS, roots: ['src'] };
    const result = await bundler.bundle({ ...input(project, LOOKUP_ENTRY), resolve });
    assert.deepEqual(result.errors, []);
    assert.ok(result.js.includes('base-folder'));
    assert.ok(result.css.includes('padding: 24px'));
    const config = readFileSync(written, 'utf8');
    assert.ok(!config.includes('"extends"'));
    assert.ok(config.includes('/src/*'));
    assert.ok(!config.includes('\\'));

    // `kit exports` reads the same record, and writes nothing into the project.
    const home = project.split('\\').join('/');
    const names = await bundler.exportNames({
      workingDir: project,
      modules: [`${home}/design/tokens/names.ts`, `${home}/work/page.ts`],
      project,
      resolve,
    });
    assert.deepEqual(names, { names: ['Page', 'aliasMarker'], errors: [] });
    assert.deepEqual(readdirSync(join(project, 'work')).sort(), ['build', 'card.scss', 'page.ts']);
  } finally {
    await close();
  }
});
