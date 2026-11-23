import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Browser, PageReport, Visit } from '../../src/checks/index.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { checkShop } from '../helpers/checks.ts';

const CLEAN: PageReport = {
  rendered: true,
  console: [],
  pageErrors: [],
  failedRequests: [],
  violations: [],
  usage: [],
  shot: true,
  facts: null,
  deep: null,
  contrastUnsure: [],
  craft: null,
};

function fakeBrowser(report: Partial<PageReport> = {}) {
  const visits: Visit[] = [];
  let closed = 0;
  const browser: Browser = {
    async open() {
      return {
        name: 'fake',
        async visit(visit) {
          visits.push(visit);
          return { ...CLEAN, ...report };
        },
        async close() {
          closed += 1;
        },
      };
    },
  };
  return { browser, visits, closed: () => closed };
}

test('every state is visited at both widths and a screenshot is listed for each', async () => {
  const fake = fakeBrowser({
    violations: [
      {
        id: 'image-alt',
        impact: 'critical',
        help: 'Images must have alternative text',
        nodes: [{ element: 'sections/Hero:section/h1', summary: 'Add alt text.' }],
      },
    ],
  });
  const shop = checkShop({ browser: fake.browser });
  try {
    shop.write(
      'src/json/states.json',
      '{"schemaVersion":1,"default":"filled","states":[{"id":"filled","label":"With data"},{"id":"empty","label":"Empty"}]}\n',
    );
    const report = await shop.check();
    const version = join(shop.dir, 'v1');
    assert.deepEqual(
      fake.visits.map((visit) => [visit.state, visit.width, visit.height]),
      [
        ['filled', 390, 844],
        ['filled', 1280, 900],
        ['empty', 390, 844],
        ['empty', 1280, 900],
      ],
    );
    assert.equal(fake.visits[0]?.page, join(version, 'build', 'html', 'index.html'));
    assert.equal(fake.visits[0]?.screenshot, join(version, 'build', 'shots', 'filled-390.png'));
    assert.equal(fake.closed(), 1);
    assert.equal(report.browser, 'fake');
    assert.deepEqual(report.notes, []);
    assert.deepEqual(report.checks, {
      build: 'ran',
      types: 'ran',
      ds: 'ran',
      a11y: 'ran',
      ui: 'ran',
      ux: 'ran',
      runtime: 'ran',
    });
    assert.deepEqual(
      report.shots.map((shot) => shot.file),
      [
        'build/shots/filled-390.png',
        'build/shots/filled-1280.png',
        'build/shots/empty-390.png',
        'build/shots/empty-1280.png',
      ],
    );
    assert.equal(report.findings.length, 1);
    const finding = report.findings[0];
    assert.equal(finding?.rule, 'a11y/image-alt');
    assert.equal(finding?.file, 'src/tsx/sections/Hero.tsx');
    assert.equal(finding?.line, 6);
    assert.equal(finding?.message, 'Images must have alternative text');
    assert.equal(finding?.hint, 'Add alt text.');
    assert.deepEqual(finding?.states, ['filled', 'empty']);
    assert.deepEqual(finding?.widths, [390, 1280]);
  } finally {
    await shop.close();
  }
});

test('no browser: a11y and runtime are skipped with a note', async () => {
  const browser: Browser = {
    async open() {
      throw new KitvasError('BROWSER_MISSING', { dir: 'x' });
    },
  };
  const shop = checkShop({ browser });
  try {
    const report = await shop.check();
    assert.deepEqual([report.checks.a11y, report.checks.runtime], ['skipped', 'skipped']);
    assert.equal(report.browser, null);
    assert.deepEqual(report.notes, [
      'a11y, ui, ux and runtime need Chrome, Edge or Chromium; none was found. Run "kitvas browser install".',
    ]);
  } finally {
    await shop.close();
  }
});

test('a failed build is not opened; any other browser failure is an error', async () => {
  const fake = fakeBrowser();
  const shop = checkShop({ browser: fake.browser });
  try {
    rmSync(join(shop.dir, 'v1', 'src', 'tsx', 'sections', 'Hero.tsx'));
    const report = await shop.check();
    assert.deepEqual(fake.visits, []);
    assert.deepEqual(report.notes, ['a11y, ui, ux and runtime need a page; the build failed.']);
  } finally {
    await shop.close();
  }
  const broken: Browser = {
    async open() {
      throw new Error('crashed');
    },
  };
  const other = checkShop({ browser: broken });
  try {
    await assert.rejects(other.check(), /crashed/);
  } finally {
    await other.close();
  }
});
