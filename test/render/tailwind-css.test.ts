import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { createTailwindCss } from '../../src/render/adapters/tailwind-css.ts';
import type { UtilityInput } from '../../src/render/index.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { tempDir } from '../helpers/tmp.ts';
import {
  TAILWIND_ENTRY,
  TAILWIND_PACKAGES,
  TAILWIND_SOURCE,
  TAILWIND3_PACKAGES,
  tempProject,
  writeFile,
} from './helpers/temp-project.ts';

function request(project: string): UtilityInput {
  return {
    project,
    entry: join(project, 'src', 'app.css'),
    sources: [join(project, 'src', 'Box.tsx')],
    probe: ['--color-spare'],
  };
}

const project = (entry = TAILWIND_ENTRY, links = TAILWIND_PACKAGES): string =>
  tempProject(links, { 'src/app.css': entry, 'src/Box.tsx': TAILWIND_SOURCE });

/** A stand-in worker script: what a broken or stuck worker would do. */
const standIn = (code: string): string => writeFile(tempDir('kitvas-worker-'), 'worker.mjs', code);

const failure = (message: string) => ({
  css: '',
  unknown: [],
  errors: [{ source: 'styles', file: 'src/app.css', line: 0, column: 0, message }],
});

test('the worker builds the CSS in its own process', async () => {
  const dir = project();
  const utility = createTailwindCss();
  try {
    const output = await utility.build(request(dir));
    assert.deepEqual(output.errors, []);
    assert.ok(output.css.includes('.bg-brand'));
    assert.ok(output.css.includes('--color-spare: #123456'));
    assert.deepEqual(output.unknown, ['bg-nope-x', 'not-a-class']);
    assert.equal(output.files[0], request(dir).entry);
    assert.equal(output.theme?.version, 4);
  } finally {
    await utility.dispose();
  }
});

test('the worker builds a Tailwind 3 project in its own process too', async () => {
  const dir = tempProject(TAILWIND3_PACKAGES, {
    'tailwind.config.cjs':
      "module.exports = { theme: { extend: { colors: { brand: '#0055ff' } } } };\n",
    'src/app.css': '@tailwind utilities;\n',
    'src/Box.tsx': TAILWIND_SOURCE,
  });
  const utility = createTailwindCss();
  try {
    const output = await utility.build({ ...request(dir), probe: ['theme(colors.brand)'] });
    assert.deepEqual(output.errors, []);
    assert.ok(output.css.includes('.bg-brand'));
    assert.ok(output.css.includes('--kitvas-theme-colors-brand: #0055ff'));
    assert.deepEqual(output.unknown, ['bg-nope-x', 'not-a-class']);
    assert.deepEqual(output.files, [request(dir).entry, join(dir, 'tailwind.config.cjs')]);
    assert.equal(output.theme?.version, 3);
  } finally {
    await utility.dispose();
  }
});

test('a project without Tailwind is KIT_PACKAGE_MISSING with the package name', async () => {
  const utility = createTailwindCss();
  await assert.rejects(
    utility.build(request(project(TAILWIND_ENTRY, []))),
    (error: unknown) =>
      error instanceof KitvasError &&
      error.code === 'KIT_PACKAGE_MISSING' &&
      error.params.name === 'tailwindcss',
  );
});

test('a stylesheet Tailwind refuses is a styles error on the entry', async () => {
  const dir = project('@import "tailwindcss";\n.x {\n  @apply not-a-real-utility;\n}\n');
  const output = await createTailwindCss().build(request(dir));
  assert.equal(output.css, '');
  assert.deepEqual(output.files, [request(dir).entry]);
  assert.equal(output.errors.length, 1);
  assert.equal(output.errors[0]?.source, 'styles');
  assert.equal(output.errors[0]?.file, 'src/app.css');
  assert.match(output.errors[0]?.message ?? '', /not-a-real-utility/);
});

test('a worker that does not finish in time is stopped', async () => {
  const dir = project();
  const worker = standIn('setInterval(() => {}, 1000);\n');
  const output = await createTailwindCss({ worker, timeoutMs: 300 }).build(request(dir));
  assert.deepEqual(output, {
    ...failure('Tailwind did not finish in 0.3 s.'),
    files: [request(dir).entry],
  });
});

test('a worker that prints too much is stopped', async () => {
  const dir = project();
  const worker = standIn("process.stdout.write('x'.repeat(100));\nsetInterval(() => {}, 1000);\n");
  const output = await createTailwindCss({ worker, outputBytes: 10 }).build(request(dir));
  assert.deepEqual(output, {
    ...failure('Tailwind printed more than 10 bytes.'),
    files: [request(dir).entry],
  });
});

test('a worker that crashes is a styles error with what it printed', async () => {
  const dir = project();
  const crash = standIn("process.stderr.write('boom\\n', () => process.exit(3));\n");
  assert.deepEqual(await createTailwindCss({ worker: crash }).build(request(dir)), {
    ...failure('boom'),
    files: [request(dir).entry],
  });
  const silent = standIn('process.exit(3);\n');
  assert.deepEqual(await createTailwindCss({ worker: silent }).build(request(dir)), {
    ...failure('The Tailwind worker ended with exit code 3.'),
    files: [request(dir).entry],
  });
});
