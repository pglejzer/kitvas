import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { type KitSource, loadKit } from '../../../src/kit/index.ts';
import { kitLead } from '../../../src/studio/pages/kit/kit-provenance.ts';
import { componentParts } from '../../../src/studio/pages/kit/kit-sections.ts';
import { type CodeView, codeView, type VerifyView } from '../../../src/studio/views/kit-status.ts';
import { groupComponents } from '../../../src/studio/views/kit-view.ts';
import { FIXTURE_KITS } from '../../helpers/kit/kits.ts';
import { t } from '../../helpers/translate.ts';

const kit = loadKit(createFolderKitStore(FIXTURE_KITS), 'tiny').kit;
const names = kit.components.map((component) => component.name);
const CODE: KitSource = { type: 'code', path: 'src/ui', styles: [], urls: [] };
const WEB: KitSource = { type: 'web', urls: ['https://example.com/'] };
const PASSED: VerifyView = { state: 'passed', date: '2026-11-27', count: 0, issues: [] };
const NEVER: VerifyView = { state: 'never', date: '', count: 0, issues: [] };

const file = {
  hash: 'h',
  compared: [
    { component: 'Button', level: 'app' as const },
    { component: 'Icon', level: 'code' as const },
  ],
  originals: [
    { key: 'Button.1', width: 1280, frames: 1, differences: 2, score: 99.44 },
    { key: 'Button.1', width: 390, frames: 1, differences: 0, score: 100 },
  ],
};

function view(source: KitSource, verify: VerifyView): CodeView | undefined {
  return codeView({
    source,
    verify,
    components: names,
    file,
    outdated: [{ name: 'Button', reason: 'changed' }],
  });
}

const rows = (code: CodeView | undefined) =>
  groupComponents(kit.components, code).flatMap((group) => group.components);

test('a code kit carries the level and outdated of each component, a web kit neither', () => {
  const code = rows(view(CODE, PASSED));
  const button = code.find((row) => row.name === 'Button');
  assert.equal(button?.level, 'app');
  assert.equal(button?.outdated, 'changed');
  assert.equal(code.find((row) => row.name === 'Icon')?.level, 'code');
  for (const row of rows(view(WEB, PASSED))) {
    assert.equal(row.level, undefined);
    assert.equal(row.outdated, undefined);
  }
});

test('a code kit that was never verified shows no level but still its stale components', () => {
  const code = view(CODE, NEVER);
  assert.deepEqual(code?.levels, {});
  assert.equal(code?.counts, undefined);
  assert.deepEqual(code?.originals, {});
});

test('the counts of the three levels add up to the components', () => {
  const counts = view(CODE, PASSED)?.counts;
  assert.ok(counts);
  assert.equal(counts.app + counts.code + counts.read, names.length);
  assert.equal(counts.app, 1);
});

test('a read component says why, and one the list does not name has nothing to compare with', () => {
  const code = codeView({
    source: CODE,
    verify: PASSED,
    components: names,
    file: { hash: 'h', compared: [{ component: 'Button', level: 'read', why: 'partial' }] },
  });
  assert.deepEqual(code?.reasons, { Button: 'partial', Icon: 'none' });
  const html = componentParts(t, groupComponents(kit.components, code), {
    t,
    kit: 'tiny',
    stamp: undefined,
    src: () => '',
    host: 'h',
  })
    .map((part) => part.body.text)
    .join('');
  assert.ok(html.includes('data-tone="review" data-compared="read"'));
  assert.ok(
    html.includes('need the project&#39;s own build') ||
      html.includes("need the project's own build"),
  );
  assert.ok(html.includes('it has no original and no picture'));
});

test('the originals are kept by example key, a line a width', () => {
  assert.equal(view(CODE, PASSED)?.originals['Button.1']?.length, 2);
});

test('the page prints each mark text once per component, and the lead its counts', () => {
  const code = view(CODE, PASSED);
  const groups = groupComponents(kit.components, code);
  const html = componentParts(t, groups, {
    t,
    kit: 'tiny',
    stamp: undefined,
    src: () => '',
    host: 'h',
    originals: code?.originals,
  })
    .map((part) => part.body.text)
    .join('');
  const once = (text: string, times: number) =>
    assert.equal(html.split(`>${text}</span>`).length - 1, times, text);
  once('Compared with the app', 1);
  once('Out of date', 1);
  once('Compared with the code', 1);
  once('Read only', 0);
  assert.ok(html.includes('data-tone="good" data-compared="app"'));
  assert.ok(html.includes('title="Its files in the project changed after it was written."'));
  assert.ok(html.includes('Against the original at 1280 px: 2 differences, score 99.4'));
  const lead = kitLead(t, {
    source: 's',
    kitId: 'tiny',
    verify: PASSED,
    counts: code?.counts,
  }).text;
  assert.ok(lead.includes('data-compared-counts'));
  assert.ok(lead.includes('1 compared with the app'));
});

test('a kit without levels looks as today', () => {
  const html = componentParts(t, groupComponents(kit.components), {
    t,
    kit: 'tiny',
    stamp: undefined,
    src: () => '',
    host: 'h',
  })
    .map((part) => part.body.text)
    .join('');
  assert.ok(!html.includes('data-compared'));
  assert.ok(!html.includes('data-outdated'));
  const lead = kitLead(t, { source: 's', kitId: 'tiny', verify: NEVER }).text;
  assert.ok(!lead.includes('data-compared-counts'));
});
