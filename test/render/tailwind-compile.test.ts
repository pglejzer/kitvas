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

test('theme reports version 4, its prefix and breakpoints', async () => {
  const plain = await compileTailwind(tailwindProject().request());
  assert.ok(plain.ok, JSON.stringify(plain));
  assert.deepEqual(plain.theme, {
    version: 4,
    prefix: '',
    screens: { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 },
    aliases: {},
  });

  const { request } = tailwindProject(
    '@import "tailwindcss" prefix(tw);\n\n@theme {\n  --breakpoint-tablet: 700px;\n}\n',
  );
  const prefixed = await compileTailwind(request());
  assert.ok(prefixed.ok, JSON.stringify(prefixed));
  assert.equal(prefixed.theme.prefix, 'tw:');
  assert.equal(prefixed.theme.screens.tablet, 700);
  assert.equal(prefixed.theme.screens.sm, 640);
});

test('aliases name the theme variable that only points at a page variable', async () => {
  const { request } = tailwindProject(
    [
      '@import "tailwindcss";',
      '',
      '@theme inline {',
      '  --color-primary: var(--primary);',
      '}',
      '',
      '@theme {',
      '  --radius-md: 8px;',
      '}',
      '',
    ].join('\n'),
  );
  const answer = await compileTailwind(request());
  assert.ok(answer.ok, JSON.stringify(answer));
  assert.deepEqual(answer.theme.aliases, { '--primary': '--color-primary' });
});

test('a Tailwind 2 project is an error naming its version', async () => {
  const project = tempProject([], {
    'node_modules/tailwindcss/package.json': '{ "name": "tailwindcss", "version": "2.2.19" }\n',
    'src/app.css': '@tailwind utilities;\n',
  });
  const entry = join(project, 'src', 'app.css');
  assert.deepEqual(await compileTailwind({ project, entry, sources: [], probe: [] }), {
    ok: false,
    message: 'Tailwind CSS 2.2.19 is not supported: kitvas builds with Tailwind 3 or 4.',
  });
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

  const theme = {
    version: 4,
    prefix: 'tw:',
    screens: { tablet: 700 },
    aliases: { '--ink': '--color-ink' },
  };
  const answer = { ok: true, css: '.a{}', unknown: ['b-c'], files: ['/p/a.css'], theme };
  assert.deepEqual(parseAnswer(JSON.stringify(answer)), answer);
  // A build answer always says what the project's Tailwind is.
  const read = (value: unknown) => parseAnswer(JSON.stringify(value));
  assert.equal(read({ ...answer, theme: undefined }), undefined);
  assert.equal(read({ ...answer, theme: { ...theme, version: 2 } }), undefined);
  assert.deepEqual(parseAnswer('{"ok":false,"missing":"tailwindcss"}'), {
    ok: false,
    missing: 'tailwindcss',
  });
  assert.deepEqual(parseAnswer('{"ok":false,"message":"broke"}'), { ok: false, message: 'broke' });
  assert.equal(read({ ...answer, css: 1 }), undefined);
  assert.equal(parseAnswer('{"ok":false}'), undefined);
  assert.equal(parseAnswer('{"ok":"yes"}'), undefined);
  assert.equal(parseAnswer(''), undefined);
});
