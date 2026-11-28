// Tailwind 3 builds with the real package (kitvas's test copy `tailwindcss3`, linked into each temp
// project as `tailwindcss`), through the same entry point the worker calls.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { compileTailwind } from '../../src/render/adapters/tailwind-compile.ts';
import type { UtilityInput } from '../../src/render/index.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';
import { type PackageLink, TAILWIND3_PACKAGES, tempProject } from './helpers/temp-project.ts';

const FIXTURE = join(PLUGIN_ROOT, 'test', 'fixtures', 'projects', 'acme-tailwind3');
const fixtureText = (relPath: string): string =>
  readFileSync(join(FIXTURE, ...relPath.split('/')), 'utf8');

/** The fixture's TypeScript config and its stylesheet with the three `@tailwind` lines. */
const CONFIG_TS = { 'tailwind.config.ts': fixtureText('tailwind.config.ts') };
const ENTRY = { 'src/app.css': fixtureText('src/styles/globals.css') };

/** Classes of the config's colours, radius, screen, dark variant and plugin, and two that are none. */
const SOURCE =
  '<div className="flex p-4 bg-primary text-brand rounded-lg tablet:flex-row dark:bg-brand hover:opacity-90 edge-dashed bg-nope-x not-a-class" />\n';

const slashes = (path: string): string => path.split('\\').join('/');

function project(files: Record<string, string>, links: PackageLink[] = TAILWIND3_PACKAGES) {
  const dir = tempProject(links, { 'src/Box.tsx': SOURCE, ...files });
  const request = (probe: string[] = []): UtilityInput => ({
    project: dir,
    entry: join(dir, 'src', 'app.css'),
    sources: [join(dir, 'src', 'Box.tsx')],
    probe,
  });
  return { dir, request };
}

async function built(input: UtilityInput) {
  const answer = await compileTailwind(input);
  assert.ok(answer.ok, JSON.stringify(answer));
  return answer;
}

test("a Tailwind 3 project builds the classes its sources use, with its config's colours, plugin and dark class", async () => {
  const { css } = await built(project({ ...CONFIG_TS, ...ENTRY }).request());
  for (const part of [
    '.flex',
    '.p-4',
    '.bg-primary',
    '.text-brand',
    // A literal colour of the config, as Tailwind 3 writes it with its opacity variable.
    'rgb(31 95 208',
    '.rounded-lg',
    '.hover\\:opacity-90:hover',
    // The plugin of the config.
    '.edge-dashed',
    // The project's own variables, from its stylesheet.
    '--primary: 221 83% 53%',
  ]) {
    assert.ok(css.includes(part), part);
  }
  assert.match(css, /background-color:\s*hsl\(var\(--primary\)\)/);
  assert.match(css, /border-radius:\s*var\(--radius\)/);
  // Tailwind 3.4 writes the class strategy as the element inside `.dark`.
  assert.ok(css.includes('.dark\\:bg-brand:is(.dark *)'));
  assert.match(css, /@media \(min-width: 700px\)\s*\{\s*\.tablet\\:flex-row/);
  assert.ok(!css.includes('not-a-class'));
});

test('unknown lists a word that makes no CSS', async () => {
  const answer = await built(project({ ...CONFIG_TS, ...ENTRY }).request());
  assert.deepEqual(answer.unknown, ['bg-nope-x', 'not-a-class']);
});

test('a TypeScript config is loaded, and an ESM one', async () => {
  const typed = project({ ...CONFIG_TS, ...ENTRY });
  const answer = await built(typed.request());
  assert.ok(answer.css.includes('rgb(31 95 208'));
  assert.deepEqual(answer.files, [typed.request().entry, join(typed.dir, 'tailwind.config.ts')]);

  const esm = project({
    'tailwind.config.mjs':
      "export default { theme: { extend: { colors: { brand: '#1f5fd0' } } } };\n",
    'src/app.css': '@tailwind utilities;\n',
  });
  const fromEsm = await built(esm.request());
  assert.ok(fromEsm.css.includes('.text-brand'));
  assert.equal(fromEsm.files[1], join(esm.dir, 'tailwind.config.mjs'));
});

test('an @config line is taken out and names the config', async () => {
  const { dir, request } = project({
    ...CONFIG_TS,
    'other.config.cjs':
      "module.exports = { content: ['./nowhere/**/*.html'], theme: { extend: { colors: { nope: { x: '#00ff00' } } } } };\n",
    'src/app.css': '@config "../other.config.cjs";\n@tailwind utilities;\n',
  });
  const answer = await built(request());
  assert.ok(!answer.css.includes('@config'));
  // The named config's colour is built; the project's own config is not read.
  assert.ok(answer.css.includes('.bg-nope-x'));
  assert.ok(answer.unknown.includes('text-brand'));
  assert.deepEqual(answer.files, [request().entry, join(dir, 'other.config.cjs')]);
});

test('theme paths in the probe become variables on :root and the body', async () => {
  const { request } = project({ ...CONFIG_TS, ...ENTRY });
  const { css } = await built(
    request(['theme(colors.primary)', 'theme(colors.brand)', '--radius']),
  );
  assert.ok(css.includes(':root, body'));
  assert.ok(css.includes('--kitvas-theme-colors-primary: hsl(var(--primary))'));
  assert.ok(css.includes('--kitvas-theme-colors-brand: #1f5fd0'));
  assert.ok(css.includes('--kitvas-probe-0: var(--radius)'));
});

test("a path the theme lacks is a build error with Tailwind's words", async () => {
  const { request } = project({ ...CONFIG_TS, ...ENTRY });
  const answer = await compileTailwind(request(['theme(colors.primary)', 'theme(colors.nope)']));
  assert.ok(!answer.ok && 'message' in answer, JSON.stringify(answer));
  assert.match(answer.message, /'colors\.nope' does not exist in your theme config/);
});

test('theme reports version 3, the prefix tw- and the screen tablet 700', async () => {
  const { request } = project({
    'tailwind.config.cjs':
      "module.exports = { prefix: 'tw-', theme: { extend: { screens: { tablet: '700px' } } } };\n",
    'src/app.css': '@tailwind utilities;\n',
    'src/Box.tsx': '<div className="tw-p-4 hover:tw-p-4 p-4" />\n',
  });
  const answer = await built(request());
  assert.deepEqual(answer.theme, {
    version: 3,
    prefix: 'tw-',
    screens: { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536, tablet: 700 },
    aliases: {},
  });
  assert.ok(answer.css.includes('.tw-p-4'));
  assert.ok(answer.css.includes('.hover\\:tw-p-4:hover'));
  assert.deepEqual(answer.unknown, ['p-4']);
});

test('the files are the entry, the config and every @import', async () => {
  const { dir, request } = project({
    ...CONFIG_TS,
    'src/app.css': '@import "./base.css";\n@tailwind utilities;\n',
    'src/base.css': '.page-frame {\n  margin: 0;\n}\n',
  });
  const answer = await built(request());
  assert.ok(answer.css.includes('.page-frame'));
  assert.equal(answer.files.length, 3, answer.files.join(', '));
  assert.equal(answer.files[0], request().entry);
  assert.equal(answer.files[1], join(dir, 'tailwind.config.ts'));
  assert.ok(slashes(answer.files[2] ?? '').endsWith('/src/base.css'), answer.files.join(', '));
});

test('a Tailwind 3.2 project with a TypeScript config is an error that names the file', async () => {
  // A stand-in for a 3.2 package, with what kitvas loads of one: no `loadConfig` before 3.3.
  const { request } = project(
    {
      'node_modules/tailwindcss/package.json':
        '{ "name": "tailwindcss", "version": "3.2.7", "main": "index.js" }\n',
      'node_modules/tailwindcss/index.js':
        "module.exports = () => ({ postcssPlugin: 'tailwindcss' });\n",
      'node_modules/tailwindcss/resolveConfig.js': 'module.exports = (config) => config;\n',
      ...CONFIG_TS,
      'src/app.css': '@tailwind utilities;\n',
    },
    ['postcss', 'postcss-import'],
  );
  const answer = await compileTailwind(request());
  assert.ok(!answer.ok && 'message' in answer, JSON.stringify(answer));
  assert.match(
    answer.message,
    /tailwind\.config\.ts: a config in TypeScript or ESM needs Tailwind CSS 3\.3 or later; the project has 3\.2\.7\./,
  );
});
