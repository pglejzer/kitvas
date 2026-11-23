// The look score with a real browser: a button rendered a few ways and held against the first one.
// Needs Chrome, Edge or Chromium; the test skips when none starts. The variants are those of
// docs/spikes/11-look-score.md.

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createPlaywrightBrowser } from '../../../src/checks/adapters/playwright-browser.ts';
import { lookScore } from '../../../src/checks/index.ts';
import { KitvasError, PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { tempDir } from '../../helpers/tmp.ts';

const browser = createPlaywrightBrowser({
  roots: [PLUGIN_ROOT],
  browsersDir: join(tempDir(), 'browsers'),
});

type Variant = { name: string; css: string };

const BASE_CSS = [
  'body { margin: 20px; background: #fff; }',
  'button { font: 500 14px/20px Arial, Helvetica, sans-serif; padding: 8px 16px; border: 0;',
  '  border-radius: 4px; background: #2563eb; color: #fff; }',
].join('\n');

const VARIANTS: Variant[] = [
  { name: 'same', css: '' },
  { name: 'lower', css: 'button { padding: 9px 16px 7px; }' },
  { name: 'fill', css: 'button { background: #dc2626; }' },
  { name: 'wider', css: 'button { padding: 8px 28px; }' },
];

/** A catalog-like page: one button in `#root`, and the mark the examples of a catalog set. */
function writePage(dir: string, variant: Variant): string {
  const file = join(dir, `${variant.name}.html`);
  const html = [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><style>',
    BASE_CSS,
    variant.css,
    '</style></head><body>',
    '<div id="root"><button type="button">Save changes</button></div>',
    "<script>document.documentElement.dataset.example = 'shown';</script>",
    '</body></html>',
  ].join('\n');
  writeFileSync(file, html);
  return file;
}

test('the look score tells a shifted label from another fill and from a wider button', async (t) => {
  let session: Awaited<ReturnType<typeof browser.open>>;
  try {
    session = await browser.open();
  } catch (error) {
    if (error instanceof KitvasError && error.code === 'BROWSER_MISSING') {
      t.skip('no browser on this machine');
      return;
    }
    throw error;
  }
  try {
    const { capture } = session;
    if (!capture) {
      t.skip('this browser session cannot capture');
      return;
    }
    const dir = tempDir('kitvas-look-');
    const pages = new Map(VARIANTS.map((variant) => [variant.name, writePage(dir, variant)]));
    const shot = (name: string): string => join(dir, `${name}.png`);
    const shoot = (name: string, reference: string) =>
      capture.call(session, {
        page: pages.get(name) ?? '',
        search: '',
        width: 1280,
        height: 900,
        shot: shot(name),
        reference,
      });

    // The first capture has no reference yet; its screenshot becomes the reference.
    const first = await shoot('same', join(dir, 'none.png'));
    assert.ok(first.rendered, first.errors.join('; '));
    const reference = shot('same');

    const scores: Record<string, number> = {};
    for (const variant of VARIANTS) {
      const report = await shoot(variant.name, reference);
      assert.deepEqual(report.errors, [], variant.name);
      assert.ok(report.rendered && report.reference, variant.name);
      scores[variant.name] = lookScore(report.reference, report.rendered).score;
    }

    assert.equal(scores.same, 100);
    assert.ok((scores.lower ?? 0) >= 90, `text 1 px lower: ${scores.lower}`);
    assert.ok((scores.fill ?? 100) < 90, `other fill: ${scores.fill}`);
    assert.ok((scores.wider ?? 100) < 90, `12 px wider on each side: ${scores.wider}`);
  } finally {
    await session.close();
  }
});
