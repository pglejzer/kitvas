import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createDecisionsCommand, runCli } from '../../src/cli/index.ts';
import { decisionsTemplate, PLUGIN_ROOT } from '../../src/shared/index.ts';
import { tempDir } from '../helpers/tmp.ts';
import { layeredStore, tempProject } from '../kit/helpers/project-kit.ts';

/** A project whose decisions file holds `text`; the kits are the fixtures `tiny` and `broken`. */
function harness(text?: string, workspace = true) {
  const cwd = tempProject({}, {}, workspace);
  const file = join(cwd, '.kitvas', 'decisions.md');
  if (workspace && text !== undefined) writeFileSync(file, text);
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
    cwd,
    home: tempDir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  };
  const command = createDecisionsCommand({
    kits: layeredStore(cwd),
    now: () => new Date(2026, 10, 25),
  });
  return {
    cwd,
    file,
    out,
    err,
    run: (...argv: string[]) => runCli(['decisions', ...argv], [command], io),
    data: (): Record<string, unknown> =>
      (JSON.parse(out.at(-1) ?? '') as { data: Record<string, unknown> }).data,
    error: (): { code: string; message: string } =>
      (JSON.parse(err.at(-1) ?? '') as { error: { code: string; message: string } }).error,
    read: (): string => readFileSync(file, 'utf8'),
  };
}

const BODY = '# T\n\n## Kits\n- a (2026-01-01)\n';

test('decisions --json gives the path, settings, where each came from, the text and no warnings', async () => {
  const h = harness(`---\nkit: tiny\ncopy: pl\n---\n${BODY}`);
  assert.equal(await h.run('--json'), 0);
  assert.deepEqual(h.data(), {
    path: h.file,
    exists: true,
    settings: { kit: 'tiny', copy: 'pl', check: 'normal' },
    from: { kit: 'file', copy: 'file', check: 'default' },
    text: BODY,
    warnings: [],
  });
});

test('without a workspace the answer is the defaults and no text', async () => {
  const h = harness(undefined, false);
  assert.equal(await h.run('--json'), 0);
  assert.deepEqual(h.data(), {
    path: join(h.cwd, '.kitvas', 'decisions.md'),
    exists: false,
    settings: { kit: 'base', copy: null, check: 'normal' },
    from: { kit: 'default', copy: 'default', check: 'default' },
    text: '',
    warnings: [],
  });
  assert.equal(await h.run(), 0);
  assert.match(h.out.at(-1) ?? '', /no decisions file yet/);
});

test('a kit that does not exist and a bad value are warnings with their sentences', async () => {
  const h = harness('---\nkit: gone\ncheck: sometimes\n---\n');
  assert.equal(await h.run('--json'), 0);
  const data = h.data() as {
    settings: { kit: string; check: string };
    from: { kit: string };
    warnings: { code: string; line: number; message: string }[];
  };
  assert.equal(data.settings.kit, 'base');
  assert.equal(data.settings.check, 'normal');
  assert.equal(data.from.kit, 'default');
  assert.deepEqual(
    data.warnings.map((warning) => [warning.code, warning.line]),
    [
      ['kitMissing', 2],
      ['badValue', 3],
    ],
  );
  assert.deepEqual(Object.keys(data.warnings[0] ?? {}), ['code', 'line', 'message']);
  assert.match(data.warnings[0]?.message ?? '', /kit "gone" does not exist/);
  assert.match(data.warnings[0]?.message ?? '', /kitvas decisions set kit/);

  assert.equal(await h.run(), 0);
  assert.match(h.out.at(-1) ?? '', /kit: base \(default\)/);
  assert.match(h.out.at(-1) ?? '', /Line 3: "sometimes" is not a valid value for check/);
});

test('add puts a dated bullet at the end of the section and keeps the rest', async () => {
  const h = harness(decisionsTemplate('tiny'));
  assert.equal(await h.run('add', '--section', 'Kits', '--text', 'always 3 columns', '--json'), 0);
  assert.deepEqual(h.data(), { path: h.file, section: 'Kits', line: 9 });
  assert.equal(
    h.read(),
    decisionsTemplate('tiny').replace('## Kits\n', '## Kits\n- always 3 columns (2026-11-25)\n'),
  );
  assert.equal(await h.run('add', '--section', 'Other', '--text', 'second'), 0);
  assert.match(h.out.at(-1) ?? '', /Kept the decision under Other/);
  assert.ok(h.read().endsWith('## Other\n- second (2026-11-25)\n'));
});

test('add makes the file from the template when it is missing, and a heading when it is', async () => {
  const h = harness();
  rmSync(h.file);
  assert.equal(await h.run('add', '--section', 'Copy', '--text', 'Polish', '--json'), 0);
  assert.ok(h.read().startsWith('---\nkit: base\n---\n'));
  assert.ok(h.read().includes('## Copy\n- Polish (2026-11-25)\n'));

  const bare = harness('# Notes\n');
  assert.equal(await bare.run('add', '--section', 'Layout', '--text', 'wide', '--json'), 0);
  assert.equal(bare.read(), '# Notes\n\n## Layout\n- wide (2026-11-25)\n');
});

test('add refuses a bad section or text with DECISION_INVALID, and needs a workspace', async () => {
  const h = harness(BODY);
  const cases: string[][] = [
    ['add', '--text', 'x'],
    ['add', '--section', 'Nope', '--text', 'x'],
    ['add', '--section', 'Kits'],
    ['add', '--section', 'Kits', '--text', '   '],
    ['add', '--section', 'Kits', '--text', 'two\nlines'],
    ['add', '--section', 'Kits', '--text', 'x'.repeat(301)],
  ];
  for (const argv of cases) {
    assert.equal(await h.run(...argv, '--json'), 65, argv.join(' '));
    assert.equal(h.error().code, 'DECISION_INVALID');
  }
  assert.equal(h.read(), BODY);

  const bare = harness(undefined, false);
  assert.equal(await bare.run('add', '--section', 'Kits', '--text', 'x', '--json'), 13);
  assert.equal(bare.error().code, 'WORKSPACE_MISSING');
  assert.equal(await h.run('nope', '--json'), 2);
});

test('set changes one front matter line, or adds it, or adds the block', async () => {
  const h = harness(`---\nkit: tiny\n---\n${BODY}`);
  assert.equal(await h.run('set', 'check', 'deep', '--json'), 0);
  assert.deepEqual(h.data(), { path: h.file, key: 'check', value: 'deep' });
  assert.equal(h.read(), `---\nkit: tiny\ncheck: deep\n---\n${BODY}`);
  assert.equal(await h.run('set', 'check', 'normal', '--json'), 0);
  assert.equal(h.read(), `---\nkit: tiny\ncheck: normal\n---\n${BODY}`);

  const bare = harness(BODY);
  assert.equal(await bare.run('set', 'copy', 'pl', '--json'), 0);
  assert.equal(bare.read(), `---\ncopy: pl\n---\n${BODY}`);
});

test('set refuses an unknown key, a bad value and a kit that does not exist', async () => {
  const h = harness(`---\nkit: tiny\n---\n${BODY}`);
  for (const argv of [
    ['set', 'mode', 'x'],
    ['set', 'copy', 'Polish'],
    ['set', 'check', 'sometimes'],
    ['set', 'kit', '../x'],
    ['set', 'kit', 'nope'],
    ['set', 'kit'],
  ]) {
    assert.equal(await h.run(...argv, '--json'), 65, argv.join(' '));
    assert.equal(h.error().code, 'DECISION_INVALID');
  }
  assert.equal(h.read(), `---\nkit: tiny\n---\n${BODY}`);
  assert.equal(await h.run('set', 'kit', 'tiny', '--json'), 0);

  const bare = harness(undefined, false);
  assert.equal(await bare.run('set', 'check', 'deep', '--json'), 13);
});

const LAYOUT = '## Layout\n- always 2 columns (2026-01-01)\n- keep (2026-01-02)\n';

test('replace swaps one bullet for a new one with today, and keeps every other byte', async () => {
  const h = harness(`${BODY}\n${LAYOUT}`);
  const code = await h.run(
    'replace',
    '--section',
    'Layout',
    '--old',
    'always 2 columns',
    '--text',
    'always 3 columns',
    '--json',
  );
  assert.equal(code, 0);
  assert.deepEqual(h.data(), {
    path: h.file,
    section: 'Layout',
    old: 'always 2 columns',
    line: 7,
  });
  assert.equal(
    h.read(),
    `${BODY}\n${LAYOUT.replace('- always 2 columns (2026-01-01)', '- always 3 columns (2026-11-25)')}`,
  );
});

test('replace answers DECISION_NOT_FOUND when the old line is missing or found twice', async () => {
  const text = `${BODY}\n## Layout\n- a (2026-01-01)\n- a (2026-01-02)\n- b (2026-01-03)\n`;
  const h = harness(text);
  for (const old of ['a', 'zzz', 'b ', 'always']) {
    const code = await h.run(
      'replace',
      '--section',
      'Layout',
      '--old',
      old,
      '--text',
      'c',
      '--json',
    );
    assert.equal(code, old === 'b ' ? 0 : 66, old);
    if (code !== 0) assert.equal(h.error().code, 'DECISION_NOT_FOUND');
  }
  // `b ` is trimmed, so it matches `b`; the file then differs only on that line.
  assert.equal(h.read(), text.replace('- b (2026-01-03)', '- c (2026-11-25)'));
  assert.equal(
    await h.run('replace', '--section', 'Copy', '--old', 'x', '--text', 'c', '--json'),
    66,
  );
  assert.equal(await h.run('replace', '--section', 'Layout', '--text', 'c', '--json'), 65);
  assert.equal(h.error().code, 'DECISION_INVALID');
  const bare = harness(undefined, false);
  assert.equal(
    await bare.run('replace', '--section', 'Layout', '--old', 'a', '--text', 'c', '--json'),
    13,
  );
});
