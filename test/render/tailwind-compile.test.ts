import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  compileTailwind,
  parseAnswer,
  parseRequest,
} from '../../src/render/adapters/tailwind-compile.ts';
import type { UtilityInput } from '../../src/render/index.ts';
import {
  TAILWIND_ENTRY,
  TAILWIND_PACKAGES,
  TAILWIND_SOURCE,
  tempProject,
} from './helpers/temp-project.ts';

const slashes = (path: string): string => path.split('\\').join('/');

function tailwindProject(entry = TAILWIND_ENTRY, links = TAILWIND_PACKAGES) {
  const project = tempProject(links, {
    'src/app.css': entry,
    'src/Box.tsx': TAILWIND_SOURCE,
  });
  const request = (probe: string[] = []): UtilityInput => ({
    project,
    entry: join(project, 'src', 'app.css'),
    sources: [join(project, 'src', 'Box.tsx'), join(project, 'src', 'gone.tsx')],
    probe,
  });
  return { project, request };
}

test('the classes of the sources become CSS; the ones that are no class are listed', async () => {
  const { request } = tailwindProject();
  const answer = await compileTailwind(request());
  assert.equal(answer.ok, true);
  if (!answer.ok) return;
  for (const part of [
    '.flex',
    '.p-4',
    '.bg-brand',
    '.hover\\:opacity-90',
    '--color-brand: #0055ff',
  ]) {
    assert.ok(answer.css.includes(part), part);
  }
  assert.ok(!answer.css.includes('not-a-class'));
  // Theme variables no class uses are left out unless probed.
  assert.ok(!answer.css.includes('--color-spare'));
  assert.deepEqual(answer.unknown, ['bg-nope-x', 'not-a-class']);
  assert.equal(answer.files[0], request().entry);
  assert.ok(
    answer.files.some((file) => slashes(file).endsWith('tailwindcss/index.css')),
    answer.files.join(', '),
  );
});

test('a probed variable is in the CSS even when no class uses it', async () => {
  const { request } = tailwindProject();
  const answer = await compileTailwind(request(['--color-spare']));
  assert.equal(answer.ok, true);
  if (answer.ok) assert.ok(answer.css.includes('--color-spare: #123456'));
});

test('a package the project lacks is named', async () => {
  const none = tailwindProject(TAILWIND_ENTRY, []);
  assert.deepEqual(await compileTailwind(none.request()), { ok: false, missing: 'tailwindcss' });
  const half = tailwindProject(TAILWIND_ENTRY, ['tailwindcss']);
  assert.deepEqual(await compileTailwind(half.request()), {
    ok: false,
    missing: '@tailwindcss/node',
  });
});

test('a stylesheet Tailwind refuses is an answer with its message', async () => {
  const { request } = tailwindProject(
    '@import "tailwindcss";\n.x {\n  @apply not-a-real-utility;\n}\n',
  );
  const answer = await compileTailwind(request());
  assert.equal(answer.ok, false);
  assert.ok('message' in answer && /not-a-real-utility/.test(answer.message));
});

test('a missing entry is an answer, not a crash', async () => {
  const { project } = tailwindProject();
  const answer = await compileTailwind({
    project,
    entry: join(project, 'src', 'none.css'),
    sources: [],
    probe: [],
  });
  assert.deepEqual(answer, {
    ok: false,
    message: `Cannot read ${join(project, 'src', 'none.css')}.`,
  });
});

test('requests and answers are read only in their exact shape', () => {
  const request = { project: '/p', entry: '/p/a.css', sources: ['/p/a.tsx'], probe: ['--x'] };
  assert.deepEqual(parseRequest(JSON.stringify(request)), request);
  assert.equal(
    parseRequest('{"project":"/p","entry":"/p/a.css","sources":[1],"probe":[]}'),
    undefined,
  );
  assert.equal(parseRequest('[]'), undefined);
  assert.equal(parseRequest('not json'), undefined);

  const answer = { ok: true, css: '.a{}', unknown: ['b-c'], files: ['/p/a.css'] };
  assert.deepEqual(parseAnswer(JSON.stringify(answer)), answer);
  assert.deepEqual(parseAnswer('{"ok":false,"missing":"tailwindcss"}'), {
    ok: false,
    missing: 'tailwindcss',
  });
  assert.deepEqual(parseAnswer('{"ok":false,"message":"broke"}'), { ok: false, message: 'broke' });
  assert.equal(parseAnswer('{"ok":true,"css":1,"unknown":[],"files":[]}'), undefined);
  assert.equal(parseAnswer('{"ok":false}'), undefined);
  assert.equal(parseAnswer('{"ok":"yes"}'), undefined);
  assert.equal(parseAnswer(''), undefined);
});
