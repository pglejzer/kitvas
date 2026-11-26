import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import type { CompareInput } from '../../../src/cli/index.ts';
import { type CodeBrief, listProject, type WriteSet } from '../../../src/handoff/index.ts';
import { createProjectFiles } from '../../../src/kit/adapters/project-files.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { handoffCli } from '../../helpers/handoff/handoff-cli.ts';

const APP_A = join(PLUGIN_ROOT, 'test', 'fixtures', 'handoff', 'app-a');
const KEY = 'aB3dE5fG7hJ9kL1mN3pQ5r';

function fakeBrief(write: WriteSet): CodeBrief {
  return {
    schemaVersion: 1,
    slug: 'shop',
    version: 1,
    kind: 'screen',
    kit: 'tiny',
    draft: { layout: null, sections: [], data: [], images: [], shots: [] },
    components: [],
    tokens: [],
    write,
    target: '.kitvas/drafts/shop/v1/handoff/code/target.json',
    rules: 'reference/handoff-code.md',
    report: '.kitvas/drafts/shop/v1/handoff/code/fit.json',
    decisions: [],
  };
}

/** The files `kitvas handoff brief` leaves for version 1, written by hand for `changes`. */
function writeBriefFiles(h: ReturnType<typeof handoffCli>, write: WriteSet): void {
  const code = (name: string, value: unknown) =>
    h.store.writeText('shop', `v1/handoff/code/${name}`, JSON.stringify(value));
  code('brief.json', fakeBrief(write));
  code('target.json', { base: '' });
  code('before.json', listProject({ files: createProjectFiles(h.cwd) }, { base: '' }));
}

function writeProjectFile(cwd: string, path: string, text: string): void {
  const file = join(cwd, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

const codeResult = {
  target: 'code',
  version: 1,
  state: 'done',
  to: 'src/pages/shop',
  scope: 'new',
  files: ['src/pages/shop/Shop.tsx'],
  outside: [],
  scripts: [{ command: 'npm run build', ok: true }],
  look: [{ width: 1280, score: 93 }],
};

test('target reads the project and answers with facts, in both shapes', async () => {
  const h = handoffCli();
  h.copyProject(APP_A);
  assert.equal(await h.run('handoff', 'target', '--json'), 0);
  const data = h.data();
  assert.equal(data.view, 'target');
  assert.equal(data.base, '');
  assert.ok((data.root as string[]).includes('src/'));
  assert.ok((data.packages as unknown[]).length >= 1);
  assert.equal(await h.run('handoff', 'target'), 0);
  assert.ok((h.out.at(-1) ?? '').length > 0);
});

test('target --in reads a folder; one outside the project is HANDOFF_OUTSIDE, .git is refused', async () => {
  const h = handoffCli();
  h.copyProject(APP_A);
  assert.equal(await h.run('handoff', 'target', '--in', 'src', '--json'), 0);
  assert.equal(h.data().base, 'src');
  for (const folder of ['../elsewhere', '/etc', 'C:/Users', 'src/../../x']) {
    assert.equal(await h.run('handoff', 'target', '--in', folder, '--json'), 70, folder);
    assert.equal(h.failure().code, 'HANDOFF_OUTSIDE');
  }
  assert.equal(await h.run('handoff', 'target', '--in', '.git', '--json'), 69);
  assert.equal(h.failure().code, 'HANDOFF_INVALID');
});

test('brief hands the write set to the brief writer and answers with what it wrote', async () => {
  const seen: { write: WriteSet; base: string; again: boolean }[] = [];
  const h = handoffCli({
    brief(_project, _drafts, input) {
      seen.push({ write: input.write, base: input.base, again: input.again });
      return { brief: fakeBrief(input.write), dir: 'somewhere', listed: true };
    },
  });
  assert.equal(await h.run('handoff', 'brief', 'shop', '--to', 'src/pages/shop', '--json'), 0);
  assert.equal(h.data().view, 'brief');
  assert.equal(h.data().dir, 'somewhere');
  assert.deepEqual(seen[0], {
    write: { to: 'src/pages/shop', scope: 'new', files: [] },
    base: '',
    again: false,
  });
  assert.equal(
    await h.run(
      'handoff',
      'brief',
      'shop',
      '--to',
      './src/pages/',
      '--scope',
      'named',
      '--files',
      'src/App.tsx,src/App.tsx',
      '--in',
      'src',
      '--again',
      '--json',
    ),
    0,
  );
  assert.deepEqual(seen[1], {
    write: { to: 'src/pages', scope: 'named', files: ['src/App.tsx'] },
    base: 'src',
    again: true,
  });
  assert.equal(await h.run('handoff', 'brief', 'shop', '--to', 'src/pages/shop'), 0);
  assert.ok((h.out.at(-1) ?? '').includes('somewhere'));
});

test('brief refuses a missing --to, a folder or file outside the project and a bad scope', async () => {
  const h = handoffCli();
  assert.equal(await h.run('handoff', 'brief', 'shop', '--json'), 2);
  assert.equal(h.failure().code, 'USAGE');
  for (const to of ['../escape', '/abs/path', 'C:/Users/x', 'a/../../b']) {
    assert.equal(await h.run('handoff', 'brief', 'shop', '--to', to, '--json'), 70, to);
    assert.equal(h.failure().code, 'HANDOFF_OUTSIDE');
  }
  const refusals: [string[], string][] = [
    [['--to', 'src', '--scope', 'wide'], 'scope'],
    [['--to', 'src', '--files', 'src/a.tsx'], 'files'],
    [['--to', 'src', '--scope', 'named', '--files', '.env'], 'files'],
    [['--to', '.git/hooks'], 'to'],
  ];
  for (const [flags, at] of refusals) {
    assert.equal(await h.run('handoff', 'brief', 'shop', ...flags, '--json'), 69, flags.join(' '));
    assert.equal(h.failure().code, 'HANDOFF_INVALID');
    assert.match(h.failure().message, new RegExp(`at ${at}`));
  }
  assert.equal(
    await h.run(
      'handoff',
      'brief',
      'shop',
      '--to',
      'src',
      '--scope',
      'named',
      '--files',
      '../x',
      '--json',
    ),
    70,
  );
});

test('changes, compare and a code send need a brief for the version: HANDOFF_NO_BRIEF', async () => {
  const h = handoffCli();
  h.copyProject(APP_A);
  assert.equal(await h.run('handoff', 'changes', 'shop', '--json'), 71);
  assert.equal(h.failure().code, 'HANDOFF_NO_BRIEF');
  assert.equal(
    await h.run('handoff', 'compare', 'shop', '--url', 'http://127.0.0.1:3000', '--json'),
    71,
  );
  assert.equal(h.failure().code, 'HANDOFF_NO_BRIEF');
  writeFileSync(join(h.cwd, 'code.json'), JSON.stringify(codeResult));
  assert.equal(await h.run('handoff', 'sent', 'shop', '--result', 'code.json', '--json'), 71);
  assert.equal(h.failure().code, 'HANDOFF_NO_BRIEF');
  assert.match(h.failure().message, /shop/);
});

test('changes lists what was written inside and outside the scope, and informs only', async () => {
  const h = handoffCli();
  h.copyProject(APP_A);
  writeBriefFiles(h, { to: 'src/pages/shop', scope: 'new', files: [] });
  writeProjectFile(h.cwd, 'src/pages/shop/Shop.tsx', 'export const Shop = () => null;\n');
  writeProjectFile(h.cwd, 'src/App.tsx', 'export const App = () => null; // edited\n');
  assert.equal(await h.run('handoff', 'changes', 'shop', '--json'), 0);
  const data = h.data();
  assert.equal(data.view, 'changes');
  assert.deepEqual(data.inside, ['src/pages/shop/Shop.tsx']);
  assert.deepEqual(data.outside, ['src/App.tsx']);
  assert.deepEqual(data.removed, []);
  assert.deepEqual(data.fit, { state: 'none' });
  assert.equal(await h.run('handoff', 'changes', 'shop'), 0);
  assert.match(h.out.at(-1) ?? '', /src\/App\.tsx/);
});

test('changes reads the fitter report only through readFit: read, or refused with its reason', async () => {
  const h = handoffCli();
  h.copyProject(APP_A);
  const write: WriteSet = { to: 'src/pages/shop', scope: 'new', files: [] };
  writeBriefFiles(h, write);
  const report = {
    schemaVersion: 1,
    stack: 'React with CSS Modules',
    files: [{ path: 'src/pages/shop/Shop.tsx', role: 'view' }],
    components: [{ kit: 'Button', to: 'Button', note: 'same job' }],
    tokens: [],
    wiring: [],
    installs: [],
    open: [],
  };
  const save = (value: unknown) =>
    h.store.writeText('shop', 'v1/handoff/code/fit.json', JSON.stringify(value));

  save(report);
  assert.equal(await h.run('handoff', 'changes', 'shop', '--json'), 0);
  const read = h.data().fit as { state: string; report?: { stack: string } };
  assert.equal(read.state, 'read');
  assert.equal(read.report?.stack, 'React with CSS Modules');

  const refusals: [unknown, string][] = [
    [{ ...report, stack: '' }, 'HANDOFF_INVALID'],
    [{ ...report, files: [{ path: '../secret', role: 'view' }] }, 'HANDOFF_OUTSIDE'],
    [
      { ...report, wiring: [{ file: 'src/App.tsx', change: 'route', done: true }] },
      'HANDOFF_INVALID',
    ],
    [{ ...report, installs: [{ name: 'left-pad', why: '' }] }, 'HANDOFF_INVALID'],
  ];
  for (const [bad, code] of refusals) {
    save(bad);
    assert.equal(await h.run('handoff', 'changes', 'shop', '--json'), 0);
    const fit = h.data().fit as { state: string; code?: string; message?: string };
    assert.equal(fit.state, 'refused');
    assert.equal(fit.code, code);
    assert.ok((fit.message ?? '').length > 0);
  }
  h.store.writeText('shop', 'v1/handoff/code/fit.json', '{');
  assert.equal(await h.run('handoff', 'changes', 'shop', '--json'), 0);
  assert.equal((h.data().fit as { state: string }).state, 'refused');
  assert.equal(await h.run('handoff', 'changes', 'shop'), 0);
  assert.match(h.out.at(-1) ?? '', /refused/i);
});

test('compare hands the address, widths and options to the comparison and answers with its results', async () => {
  const seen: CompareInput[] = [];
  const h = handoffCli({
    async compare(_project, _drafts, input) {
      seen.push(input);
      return {
        passed: false,
        results: [
          {
            width: 1280,
            state: 'scored',
            score: 84,
            size: 90,
            colour: 80,
            structure: 82,
            line: 90,
            scale: 1,
            shot: 'shots/1280.png',
            reference: 'ref/1280.png',
          },
          { width: 390, state: 'blocked', detail: 'private address' },
        ],
      };
    },
  });
  h.copyProject(APP_A);
  writeBriefFiles(h, { to: 'src/pages/shop', scope: 'new', files: [] });
  assert.equal(
    await h.run('handoff', 'compare', 'shop', '--url', 'http://127.0.0.1:3000/shop', '--json'),
    0,
  );
  assert.equal(h.data().view, 'compare');
  assert.equal(h.data().passed, false);
  assert.equal((h.data().results as unknown[]).length, 2);
  assert.deepEqual(seen[0], {
    slug: 'shop',
    url: 'http://127.0.0.1:3000/shop',
    widths: [1280, 390],
    selector: null,
    state: 'filled',
    allowPrivate: false,
  });
  assert.equal(
    await h.run(
      'handoff',
      'compare',
      'shop',
      '--url',
      'http://10.0.0.5:3000',
      '--widths',
      '768',
      '--selector',
      '#app main',
      '--allow-private',
      '--json',
    ),
    0,
  );
  assert.deepEqual(seen[1], {
    slug: 'shop',
    url: 'http://10.0.0.5:3000',
    widths: [768],
    selector: '#app main',
    state: 'filled',
    allowPrivate: true,
  });
  assert.equal(await h.run('handoff', 'compare', 'shop', '--url', 'http://127.0.0.1:3000'), 0);
  assert.match(h.out.at(-1) ?? '', /1280/);
});

test('compare refuses a missing or bad address, selector or state', async () => {
  const h = handoffCli();
  writeBriefFiles(h, { to: 'src', scope: 'new', files: [] });
  assert.equal(await h.run('handoff', 'compare', 'shop', '--json'), 2);
  assert.equal(h.failure().code, 'USAGE');
  for (const [flags, at] of [
    [['--url', 'file:///etc/passwd'], 'url'],
    [['--url', 'ftp://host/x'], 'url'],
    [['--url', 'http://localhost:3000', '--selector', ' '], 'selector'],
    [['--url', 'http://localhost:3000', '--state', 'nope'], 'state'],
    [['--url', 'http://localhost:3000', '--widths', '10'], 'widths'],
  ] as const) {
    assert.equal(
      await h.run('handoff', 'compare', 'shop', ...flags, '--json'),
      69,
      flags.join(' '),
    );
    assert.match(h.failure().message, new RegExp(`at ${at}`));
  }
});

test('a code send sits in the record beside a Figma send of the same draft', async () => {
  const h = handoffCli();
  h.copyProject(APP_A);
  writeBriefFiles(h, { to: 'src/pages/shop', scope: 'new', files: [] });
  writeFileSync(
    join(h.cwd, 'figma.json'),
    JSON.stringify({
      target: 'figma',
      version: 1,
      sendId: 'k7x2m9qa',
      state: 'sent',
      lastStep: null,
      file: { key: KEY, url: `https://www.figma.com/design/${KEY}/lab` },
      page: 'kitvas · shop',
      frames: [{ width: 1280, node: '12:34' }],
      fontsMissing: [],
    }),
  );
  writeFileSync(join(h.cwd, 'code.json'), JSON.stringify(codeResult));
  assert.equal(await h.run('handoff', 'sent', 'shop', '--result', 'figma.json', '--json'), 0);
  assert.equal(await h.run('handoff', 'sent', 'shop', '--result', 'code.json', '--json'), 0);
  assert.equal(h.data().count, 2);
  assert.equal(await h.run('handoff', 'list', 'shop', '--json'), 0);
  const sends = h.data().sends as { target: string }[];
  assert.deepEqual(
    sends.map((send) => send.target),
    ['code', 'figma'],
  );
  assert.equal(await h.run('handoff', 'list', 'shop'), 0);
  const lines = (h.out.at(-1) ?? '').split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0] ?? '', /code/);
  assert.match(lines[1] ?? '', /figma/);
});
