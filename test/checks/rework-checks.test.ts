import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createTscChecker } from '../../src/checks/adapters/tsc-checker.ts';
import {
  BEFORE_FILES,
  type Browser,
  ChecksFileSchema,
  type FactNode,
  problemsOf,
  runChecks,
  uncappedFindings,
  writeBefore,
} from '../../src/checks/index.ts';
import { createDraft } from '../../src/drafts/index.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { KitvasError, PLUGIN_ROOT } from '../../src/shared/index.ts';
import { fakeBrowser, t } from '../helpers/checks.ts';
import { NOW, TINY, tempDrafts } from '../helpers/drafts.ts';
import { FIXTURE_KITS } from '../helpers/kits.ts';
import { closeRenderTools, renderTools, writeShopSections } from '../helpers/render.ts';
import { node, page, text, visit } from './rules/facts.ts';

/** The shop's `<p>`, showing copy left from a template: `ux/placeholder-text`. */
const LOREM = node({
  ks: 'sections/Hero:section/p',
  ownKs: true,
  tag: 'p',
  landmark: 'main',
  box: [24, 120, 300, 24],
  text: text('Lorem ipsum dolor sit amet'),
});

/** The shop's heading, holding a price. */
const priced = (sample: string): FactNode =>
  node({
    ks: 'sections/Hero:section/h1',
    ownKs: true,
    tag: 'h1',
    heading: 1,
    landmark: 'main',
    box: [24, 40, 300, 32],
    text: text(sample),
  });

/** The original had the template copy once at each width. */
const PROBLEMS = problemsOf(
  uncappedFindings([
    visit(page([LOREM])),
    visit(page([LOREM], { viewport: [1280, 900], scrollWidth: 1280 })),
  ]).filter((finding) => finding.rule === 'ux/placeholder-text'),
);

type Setup = { kind?: 'screen' | 'rework'; confirmed?: boolean; browser?: boolean };

/**
 * A `shop` draft built and checked with the real tools; its `before/` protects the price
 * `$1,299.00` and holds PROBLEMS. Every visit measures `nodes`.
 */
function setup(nodes: FactNode[], options: Setup = {}) {
  const { kind = 'rework', confirmed = true } = options;
  const { store, root } = tempDrafts();
  createDraft(store, {
    slug: 'shop',
    title: 'Shop',
    kit: TINY,
    now: NOW,
    ...(kind === 'rework' ? { kind, rework: { source: 'url' as const } } : {}),
  });
  writeShopSections(join(root, 'shop'));
  writeBefore(store, 'shop', {
    source: {
      schemaVersion: 1,
      source: 'url',
      url: 'https://example.com/shop',
      files: [],
      capturedAt: NOW.toISOString(),
      widths: [390, 1280],
      measured: true,
    },
    inventory: { items: [] },
    problems: PROBLEMS,
    protected: { confirmed, items: [{ id: 'price-1', kind: 'price', find: '$1,299.00' }] },
  });
  const fake = fakeBrowser((shown) => ({
    facts: page(nodes, { viewport: [shown.width, shown.height], scrollWidth: shown.width }),
  }));
  const browser: { browser?: Browser } = options.browser === false ? {} : { browser: fake.browser };
  const tools = renderTools();
  const check = () =>
    runChecks(
      {
        render: { drafts: store, kits: createFolderKitStore(FIXTURE_KITS), ...tools },
        types: createTscChecker({ roots: [PLUGIN_ROOT] }),
        t,
        ...browser,
      },
      'shop',
    );
  return { store, check, close: () => closeRenderTools(tools) };
}

const rules = (findings: { rule: string }[]) =>
  findings.map((finding) => finding.rule).filter((rule) => rule.startsWith('ux/'));

test('a rework version that drops a protected price gets ux/protected; the problems left are counted', async () => {
  const s = setup([LOREM]);
  try {
    const report = await s.check();
    const dropped = report.findings.find((finding) => finding.rule === 'ux/protected');
    assert.deepEqual(
      [dropped?.check, dropped?.severity, dropped?.element, dropped?.file, dropped?.widths],
      ['ux', 'fix', null, null, [390, 1280]],
    );
    assert.equal(
      dropped?.message,
      t('checkRule.uxProtected', { id: 'price-1', find: '$1,299.00' }),
    );
    const left = report.findings.find((finding) => finding.rule === 'ux/before-problems');
    assert.equal(left?.severity, 'review');
    assert.equal(left?.message, t('checkRule.uxBeforeProblems', { rule: 'ux/placeholder-text' }));
    assert.equal(left?.hint, t('checkHint.uxBeforeProblems', { before: 2, after: 2 }));
    assert.deepEqual(report.rework, { fixed: 0, left: 2 });
    const saved = ChecksFileSchema.parse(JSON.parse(readFileSync(report.path, 'utf8')));
    assert.deepEqual(saved.rework, { fixed: 0, left: 2 });
  } finally {
    await s.close();
  }
});

test('a price written another way is kept, and the problems gone are counted', async () => {
  const s = setup([priced('Now only $1299')]);
  try {
    const report = await s.check();
    assert.deepEqual(
      rules(report.findings).filter(
        (rule) => rule === 'ux/protected' || rule === 'ux/before-problems',
      ),
      [],
    );
    assert.deepEqual(report.rework, { fixed: 2, left: 0 });
  } finally {
    await s.close();
  }
});

test('a protected list the person has not confirmed is not checked', async () => {
  const s = setup([], { confirmed: false });
  try {
    const report = await s.check();
    assert.equal(rules(report.findings).includes('ux/protected'), false);
    assert.deepEqual(report.rework, { fixed: 2, left: 0 });
  } finally {
    await s.close();
  }
});

test('a screen draft gets neither rework rule, whatever folders it has', async () => {
  const s = setup([LOREM], { kind: 'screen' });
  try {
    const report = await s.check();
    const found = rules(report.findings);
    assert.ok(found.includes('ux/placeholder-text'));
    assert.equal(found.includes('ux/protected'), false);
    assert.equal(found.includes('ux/before-problems'), false);
    assert.equal(report.rework, undefined);
    const saved: unknown = JSON.parse(readFileSync(report.path, 'utf8'));
    assert.equal(typeof saved === 'object' && saved !== null && 'rework' in saved, false);
  } finally {
    await s.close();
  }
});

test('without a browser nothing is held against the original', async () => {
  const s = setup([], { browser: false });
  try {
    const report = await s.check();
    assert.deepEqual(rules(report.findings), []);
    assert.equal(report.rework, undefined);
  } finally {
    await s.close();
  }
});

test('a protected list of the wrong shape stops the check with DRAFT_INVALID', async () => {
  const s = setup([LOREM]);
  try {
    s.store.writeText('shop', BEFORE_FILES.protected, '{"confirmed":true,"items":[{"id":"x"}]}\n');
    await assert.rejects(
      s.check(),
      (error: unknown) =>
        error instanceof KitvasError &&
        error.code === 'DRAFT_INVALID' &&
        String(error.params.detail).startsWith('before/protected.json items.0'),
    );
  } finally {
    await s.close();
  }
});
