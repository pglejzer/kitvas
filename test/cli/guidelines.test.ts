import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { type GuidelineView, guidelinesCommand, runCli } from '../../src/cli/index.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';
import { tempDir } from '../helpers/tmp.ts';

function harness() {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (text: string) => out.push(text),
    err: (text: string) => err.push(text),
    cwd: tempDir(),
    home: tempDir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  };
  const run = (...argv: string[]) => runCli(['guidelines', ...argv], [guidelinesCommand], io);
  const views = (): GuidelineView[] => {
    const answer = JSON.parse(out.at(-1) ?? '') as {
      ok: boolean;
      data: { guidelines: GuidelineView[] };
    };
    assert.equal(answer.ok, true);
    return answer.data.guidelines;
  };
  return { out, err, run, views };
}

test('--json answers with every guideline, translated', async () => {
  const h = harness();
  assert.equal(await h.run('--json'), 0);
  const views = h.views();
  assert.ok(views.length >= 24);
  const entry = views.find((view) => view.id === 'ui/squint');
  assert.ok(entry);
  assert.equal(entry.mode, 'manual');
  assert.equal(entry.severity, null);
  assert.ok(entry.rule.length > 0 && !entry.rule.startsWith('guideline.'));
  assert.ok(entry.why.length > 0 && !entry.why.startsWith('guideline.'));
});

test('--mode keeps one mode', async () => {
  const h = harness();
  assert.equal(await h.run('--mode', 'manual', '--json'), 0);
  const views = h.views();
  assert.equal(views.length, 20);
  assert.ok(views.every((view) => view.mode === 'manual'));
});

test('--check keeps one check', async () => {
  const h = harness();
  assert.equal(await h.run('--check', 'a11y', '--mode', 'manual', '--json'), 0);
  assert.deepEqual(
    h.views().map((view) => view.id),
    ['a11y/drag-alternative', 'a11y/redundant-entry'],
  );
});

test('--screen leaves out entries for other screens', async () => {
  const landing = harness();
  assert.equal(await landing.run('--mode', 'manual', '--screen', 'landing', '--json'), 0);
  const landingIds = landing.views().map((view) => view.id);
  assert.ok(!landingIds.includes('ux/guest-checkout'));
  assert.ok(landingIds.includes('ui/squint'));

  const checkout = harness();
  assert.equal(await checkout.run('--mode', 'manual', '--screen', 'checkout', '--json'), 0);
  assert.ok(checkout.views().some((view) => view.id === 'ux/guest-checkout'));
});

test('an id shows that one entry', async () => {
  const h = harness();
  assert.equal(await h.run('ux/paste-blocked', '--json'), 0);
  const views = h.views();
  assert.equal(views.length, 1);
  assert.equal(views[0]?.id, 'ux/paste-blocked');
  assert.equal(views[0]?.severity, 'fix');
  assert.ok(views[0]?.sources.every((source) => source.url.startsWith('https://')));
});

test('an unknown id exits 40', async () => {
  const h = harness();
  assert.equal(await h.run('ui/nothing-like-this', '--json'), 40);
});

test('a bad filter value exits 2', async () => {
  for (const argv of [
    ['--check', 'seo'],
    ['--mode', 'sometimes'],
    ['--screen', 'garden'],
  ]) {
    const h = harness();
    assert.equal(await h.run(...argv, '--json'), 2, argv.join(' '));
  }
});

test('the text output has one block per entry', async () => {
  const h = harness();
  assert.equal(await h.run('--mode', 'manual', '--check', 'a11y'), 0);
  const text = h.out.at(-1) ?? '';
  const blocks = text.split('\n\n');
  assert.equal(blocks.length, 2);
  assert.match(blocks[0] ?? '', /^a11y\/drag-alternative {2}\[manual\] {2}checklist {2}sourced/);
  assert.match(
    blocks[0] ?? '',
    /https:\/\/www\.w3\.org\/WAI\/WCAG22\/Understanding\/dragging-movements\.html/,
  );
});

test('the text output shows thresholds and the heuristic basis', async () => {
  const h = harness();
  assert.equal(await h.run('ui/mobile-text'), 0);
  assert.match(h.out.at(-1) ?? '', /minBodyPx=16/);
  const heuristic = harness();
  assert.equal(await heuristic.run('ui/real-media'), 0);
  assert.match(heuristic.out.at(-1) ?? '', /heuristic/);
});
