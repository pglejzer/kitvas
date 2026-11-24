// `survey` in a real browser against the fixture site (test/fixtures/site/, read its README),
// served on 127.0.0.1. Skips when this machine has no browser.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { BrowserSession, Survey, SurveyReport } from '../../../../src/checks/ports/browser.ts';
import { tempDir } from '../../../helpers/tmp.ts';
import { pngSize } from '../png.ts';
import { NO_BROWSER, openSession, refusing, type Site, serveSite } from '../site.ts';

const TEST_MS = 120_000;

let session: BrowserSession | undefined;
let site: Site;

before(async () => {
  site = await serveSite();
  session = await openSession();
});

after(async () => {
  await session?.close();
  await site.close();
});

/** The survey of one fixture page, or undefined when there is no browser to survey with. */
async function survey(
  path: string,
  input: Partial<Survey> = {},
): Promise<{ report: SurveyReport; shot: string } | undefined> {
  const open = session;
  if (open?.survey === undefined) return undefined;
  const shot = join(tempDir('kitvas-survey-'), 'shots', '1280.png');
  const report = await open.survey({
    url: `${site.origin}${path}`,
    width: 1280,
    height: 800,
    shot,
    policy: refusing(),
    ...input,
  });
  return { report, shot };
}

test('a survey writes the screenshot and returns facts, an inventory and the viewport meta', {
  timeout: TEST_MS,
}, async (t) => {
  const result = await survey('/index.html');
  if (result === undefined) return t.skip(NO_BROWSER);
  const { report, shot } = result;
  assert.equal(report.state, 'surveyed', JSON.stringify(report));
  if (report.state !== 'surveyed') return;
  assert.equal(report.viewportMeta, true);
  assert.ok(report.inventory.length > 0, 'an inventory');
  assert.ok(report.facts.nodes.length > 0, 'facts');
  const [width, height] = pngSize(readFileSync(shot));
  assert.equal(width, 1280);
  assert.ok((height ?? 0) >= 1, 'a screenshot with a height');
});

test('a page with no viewport meta says so', { timeout: TEST_MS }, async (t) => {
  const result = await survey('/noviewport.html');
  if (result === undefined) return t.skip(NO_BROWSER);
  assert.equal(result.report.state, 'surveyed', JSON.stringify(result.report));
  if (result.report.state !== 'surveyed') return;
  assert.equal(result.report.viewportMeta, false);
});

test('a page the policy refuses is blocked and nothing is written', {
  timeout: TEST_MS,
}, async (t) => {
  const result = await survey('/index.html', { policy: async () => false });
  if (result === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(result.report, { state: 'blocked', url: `${site.origin}/index.html` });
  assert.throws(() => readFileSync(result.shot));
});

test('a redirect to a refused address is blocked', { timeout: TEST_MS }, async (t) => {
  const result = await survey('/redirect-to-private', { policy: refusing('/private.html') });
  if (result === undefined) return t.skip(NO_BROWSER);
  assert.equal(result.report.state, 'blocked', JSON.stringify(result.report));
  if (result.report.state !== 'blocked') return;
  assert.ok(result.report.url.endsWith('/private.html'), result.report.url);
});

test('a page that does not exist fails with one line', { timeout: TEST_MS }, async (t) => {
  const result = await survey('/missing.html');
  if (result === undefined) return t.skip(NO_BROWSER);
  assert.equal(result.report.state, 'failed', JSON.stringify(result.report));
  if (result.report.state !== 'failed') return;
  assert.ok(result.report.error.length > 0);
  assert.ok(!result.report.error.includes('\n'));
});
