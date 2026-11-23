import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createInboxCommand, runCli } from '../../src/cli/index.ts';
import { initWorkspace, PLUGIN_ROOT } from '../../src/shared/index.ts';
import type { InboxItem, LifecycleDeps } from '../../src/studio/index.ts';
import { fakeLifecycle } from '../helpers/fake-lifecycle.ts';
import { SAMPLE_STATE } from '../helpers/studio-state.ts';
import { tempDir } from '../helpers/tmp.ts';

function harness(lifecycle: LifecycleDeps, workspace = true) {
  const out: string[] = [];
  const io = {
    out: (text: string) => out.push(text),
    err: (text: string) => out.push(text),
    cwd: tempDir(),
    home: tempDir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  };
  if (workspace) {
    initWorkspace(io.cwd);
    writeFileSync(join(io.cwd, '.kitvas', 'config.json'), '{"schemaVersion":1,"kit":"tiny"}');
  }
  const commands = [createInboxCommand({ lifecycle: () => lifecycle })];
  const run = (...argv: string[]) => runCli(argv, commands, io);
  const data = (): unknown => (JSON.parse(out.at(-1) ?? '') as { data: unknown }).data;
  return { out, run, data };
}

const note = (n: number, slug: string | null, element: string | null, text: string): InboxItem => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  at: '2026-11-22T10:00:00.000Z',
  kind: 'note',
  slug,
  element,
  text,
});

const NOTES = [
  note(1, 'shop', 'hero-title', 'Bigger title'),
  note(2, null, null, 'A darker studio'),
  note(3, 'shop', null, 'More space'),
];

test('kitvas inbox prints the notes the studio got', async () => {
  const fake = fakeLifecycle({ running: SAMPLE_STATE, notes: NOTES });
  const h = harness(fake.deps);
  assert.equal(await h.run('inbox'), 0);
  assert.equal(
    h.out.at(-1),
    'Note on shop (hero-title): Bigger title\nNote: A darker studio\nNote on shop: More space',
  );
  assert.deepEqual(fake.calls, [`inbox ${SAMPLE_STATE.pid} 30`]);
  assert.equal(await h.run('inbox', '--timeout', '5', '--json'), 0);
  assert.deepEqual(h.data(), { running: true, items: NOTES });
  assert.equal(fake.calls.at(-1), `inbox ${SAMPLE_STATE.pid} 5`);
});

test('no notes, no studio, a wrong timeout, no workspace', async () => {
  const empty = harness(fakeLifecycle({ running: SAMPLE_STATE }).deps);
  assert.equal(await empty.run('inbox', '--timeout', '0'), 0);
  assert.equal(empty.out.at(-1), 'No new notes from the studio.');
  const none = harness(fakeLifecycle().deps);
  assert.equal(await none.run('inbox'), 0);
  assert.equal(none.out.at(-1), 'No studio runs for this project.');
  assert.equal(await none.run('inbox', '--timeout', '601'), 2);
  assert.equal(await none.run('inbox', '--timeout', 'soon'), 2);
  assert.equal(await harness(fakeLifecycle().deps, false).run('inbox'), 13);
});
