import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { HANDOFF_SUBCOMMANDS } from '../../src/cli/index.ts';
import { handoffCli } from '../helpers/handoff-cli.ts';
import { shopFacts } from '../helpers/handoff-fixtures.ts';

const KEY = 'aB3dE5fG7hJ9kL1mN3pQ5r';

const figmaResult = (state: 'sent' | 'partial', sendId = 'k7x2m9qa') => ({
  target: 'figma',
  version: 1,
  sendId,
  state,
  lastStep: state === 'partial' ? '30-1280-01.js' : null,
  file: { key: KEY, url: `https://www.figma.com/design/${KEY}/lab` },
  page: 'kitvas · shop',
  frames: [{ width: 1280, node: '12:34' }],
  fontsMissing: [],
});

function writeResult(cwd: string, result: unknown, name = 'result.json'): string {
  writeFileSync(join(cwd, name), JSON.stringify(result));
  return name;
}

test('an unknown or missing subcommand is USAGE and names the subcommands', async () => {
  const h = handoffCli();
  assert.equal(await h.run('handoff', 'nope', '--json'), 2);
  const failure = h.failure();
  assert.equal(failure.code, 'USAGE');
  assert.match(failure.message, /"nope"/);
  assert.match(failure.message, new RegExp(HANDOFF_SUBCOMMANDS.join(', ')));
  assert.equal(await h.run('handoff'), 2);
  assert.match(h.err.at(-1) ?? '', /figma, sent, list, target/);
});

test('figma prepares the package and answers with it, in both shapes', async () => {
  const h = handoffCli();
  assert.equal(await h.run('handoff', 'figma', 'shop', '--json'), 0);
  const data = h.data();
  assert.equal(data.view, 'figma');
  assert.equal(data.slug, 'shop');
  assert.equal(data.sendId, 'k7x2m9qa');
  assert.deepEqual(data.widths, [1280, 390]);
  assert.ok(existsSync(String(data.manifest)));
  assert.equal(h.calls.measure, 1);

  assert.equal(await h.run('handoff', 'figma', 'shop'), 0);
  const lines = (h.out.at(-1) ?? '').split('\n');
  assert.match(lines[0] ?? '', /shop/);
  assert.match(lines[0] ?? '', /k7x2m9qa/);
});

test('--widths, --state and --sections are read; a bad value is HANDOFF_INVALID', async () => {
  const h = handoffCli();
  assert.equal(await h.run('handoff', 'figma', 'shop', '--widths', '768', '--json'), 0);
  assert.deepEqual(h.data().widths, [768]);
  for (const [flag, value, at] of [
    ['--widths', '100', 'widths'],
    ['--widths', '1280,1280', 'widths'],
    ['--widths', 'wide', 'widths'],
    ['--sections', 'Not A Section', 'sections'],
    ['--sections', 'nope', 'sections'],
    ['--state', 'nope', 'state'],
  ] as const) {
    assert.equal(await h.run('handoff', 'figma', 'shop', flag, value, '--json'), 69, value);
    assert.equal(h.failure().code, 'HANDOFF_INVALID');
    assert.match(h.failure().message, new RegExp(`at ${at}`), value);
  }
});

test('figma needs a slug and an existing draft', async () => {
  const h = handoffCli();
  assert.equal(await h.run('handoff', 'figma', '--json'), 2);
  assert.equal(await h.run('handoff', 'figma', 'nope', '--json'), 9);
  assert.equal(h.failure().code, 'DRAFT_NOT_FOUND');
});

test('--resume keeps the send id of the package on disk and measures nothing', async () => {
  let made = 0;
  const h = handoffCli({ newSendId: () => `send000${++made}` });
  assert.equal(await h.run('handoff', 'figma', 'shop', '--json'), 0);
  assert.equal(h.data().sendId, 'send0001');
  assert.equal(await h.run('handoff', 'figma', 'shop', '--resume', '--json'), 0);
  assert.equal(h.data().sendId, 'send0001');
  assert.equal(h.calls.measure, 1);
  assert.equal(made, 1);
});

test('--resume with no package is HANDOFF_INVALID', async () => {
  const h = handoffCli();
  assert.equal(await h.run('handoff', 'figma', 'shop', '--resume', '--json'), 69);
  assert.equal(h.failure().code, 'HANDOFF_INVALID');
});

test('a draft that does not build is HANDOFF_BUILD_FAILED, in both shapes', async () => {
  const h = handoffCli({
    async measure() {
      return { version: 1, built: false, errors: ['x'], frames: [] };
    },
  });
  assert.equal(await h.run('handoff', 'figma', 'shop', '--json'), 67);
  assert.equal(h.failure().code, 'HANDOFF_BUILD_FAILED');
  assert.equal(await h.run('handoff', 'figma', 'shop'), 67);
  assert.match(h.err.at(-1) ?? '', /shop/);
});

test('a page over the layer cap is HANDOFF_TOO_LARGE and names the largest sections', async () => {
  const h = handoffCli({
    async measure(_render, input) {
      return {
        version: 1,
        built: true,
        errors: [],
        frames: input.widths.map((width) => ({ width, facts: shopFacts('../img/logo.png', true) })),
      };
    },
  });
  assert.equal(await h.run('handoff', 'figma', 'shop', '--json'), 68);
  assert.equal(h.failure().code, 'HANDOFF_TOO_LARGE');
  assert.match(h.failure().message, /hero/);
});

test('sent keeps a result file in the record, and list shows it', async () => {
  const h = handoffCli();
  const file = writeResult(h.cwd, figmaResult('sent'));
  assert.equal(await h.run('handoff', 'sent', 'shop', '--result', file, '--json'), 0);
  const data = h.data();
  assert.equal(data.view, 'sent');
  assert.equal(data.count, 1);
  assert.equal((data.send as { at: string }).at, '2026-11-25T10:00:00.000Z');
  const record = JSON.parse(
    readFileSync(join(h.cwd, '.kitvas', 'drafts', 'shop', 'handoff.json'), 'utf8'),
  ) as { sends: unknown[] };
  assert.equal(record.sends.length, 1);

  assert.equal(await h.run('handoff', 'list', 'shop', '--json'), 0);
  assert.equal(h.data().view, 'list');
  assert.equal((h.data().sends as unknown[]).length, 1);
  assert.equal(await h.run('handoff', 'list', 'shop'), 0);
  assert.match(h.out.at(-1) ?? '', /figma/);
});

test('a partial send is kept, and a later sent of the same send id replaces it', async () => {
  const h = handoffCli();
  const partial = writeResult(h.cwd, figmaResult('partial'), 'partial.json');
  const sent = writeResult(h.cwd, figmaResult('sent'), 'sent.json');
  assert.equal(await h.run('handoff', 'sent', 'shop', '--result', partial, '--json'), 0);
  assert.equal((h.data().send as { state: string }).state, 'partial');
  assert.equal(await h.run('handoff', 'sent', 'shop', '--result', sent, '--json'), 0);
  assert.equal(h.data().count, 1);
  assert.equal((h.data().send as { state: string }).state, 'sent');
  const other = writeResult(h.cwd, figmaResult('sent', 'zz99aa11'), 'other.json');
  assert.equal(await h.run('handoff', 'sent', 'shop', '--result', other, '--json'), 0);
  assert.equal(h.data().count, 2);
});

test('sent refuses a missing option, a missing file, bad JSON and a result outside the schema', async () => {
  const h = handoffCli();
  assert.equal(await h.run('handoff', 'sent', 'shop', '--json'), 2);
  assert.equal(await h.run('handoff', 'sent', 'shop', '--result', 'nope.json', '--json'), 69);
  assert.match(h.failure().message, /at result/);
  writeFileSync(join(h.cwd, 'broken.json'), '{');
  assert.equal(await h.run('handoff', 'sent', 'shop', '--result', 'broken.json', '--json'), 69);
  const bad = writeResult(h.cwd, { ...figmaResult('sent'), state: 'done' }, 'bad.json');
  assert.equal(await h.run('handoff', 'sent', 'shop', '--result', bad, '--json'), 69);
  assert.match(h.failure().message, /at state/);
  assert.equal(existsSync(join(h.cwd, '.kitvas', 'drafts', 'shop', 'handoff.json')), false);
});

test('list of a draft with no sends says so, in both shapes', async () => {
  const h = handoffCli();
  assert.equal(await h.run('handoff', 'list', 'shop'), 0);
  assert.match(h.out.at(-1) ?? '', /shop/);
  assert.equal(await h.run('handoff', 'list', 'shop', '--json'), 0);
  assert.deepEqual(h.data().sends, []);
});
