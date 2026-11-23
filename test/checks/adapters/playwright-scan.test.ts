// `kit scan` in a real browser against the fixture site (test/fixtures/site/, read its README),
// served on 127.0.0.1. Skips when this machine has no browser.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { type ScanFacts, ScanFactsSchema } from '../../../src/checks/domain/scan-facts.ts';
import type { BrowserSession, Scan, ScanReport } from '../../../src/checks/ports/browser.ts';
import { tempDir } from '../../helpers/tmp.ts';
import { pngSize } from './png.ts';
import { NO_BROWSER, openSession, refusing, type Site, serveSite } from './site.ts';

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

/** The scan of one fixture page, or undefined when there is no browser to scan with. */
async function scan(path: string, input: Partial<Scan> = {}): Promise<ScanReport | undefined> {
  const open = session;
  if (open?.scan === undefined) return undefined;
  return open.scan({
    url: `${site.origin}${path}`,
    width: 1280,
    out: tempDir('kitvas-scan-'),
    policy: refusing(),
    ...input,
  });
}

function scanned(report: ScanReport): ScanFacts {
  assert.equal(report.state, 'scanned', JSON.stringify(report));
  if (report.state !== 'scanned') throw new Error('not scanned');
  return report.facts;
}

test('the facts of the fixture page: main first, the banner last, crops widened by shadows', {
  timeout: TEST_MS,
}, async (t) => {
  const out = tempDir('kitvas-scan-');
  const report = await scan('/index.html', { out });
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = scanned(report);
  assert.doesNotThrow(() => ScanFactsSchema.parse(facts));
  assert.equal(facts.url, `${site.origin}/index.html`);
  assert.equal(facts.width, 1280);
  assert.deepEqual(facts.title, { pageText: 'Acme plans' });

  assert.deepEqual(
    facts.candidates.map((candidate) => [candidate.id, candidate.text.pageText]),
    [
      ['button-0', 'Save changes'],
      ['button-1', 'Accept cookies'],
      ['input-0', 'you@example.com'],
      ['card-0', 'Starter plan For one person.'],
      ['heading-0', 'Choose a plan'],
      ['heading-1', 'Starter plan'],
    ],
  );
  const button = facts.candidates[0];
  assert.equal(button?.style['background-color'], '#0f7a52');
  assert.equal(button?.style.color, '#ffffff');
  assert.equal(button?.style['border-radius'], '6px');
  assert.equal(button?.style.padding, '10px 16px');

  // The card's shadow, 0 2px 6px, reaches 4 px above, 6 px to each side and 8 px below.
  const card = facts.candidates.find((candidate) => candidate.id === 'card-0');
  assert.ok(card);
  const [x, , width, height] = card.box;
  assert.deepEqual([x, width, height], [32, 320, 86]);
  assert.equal(card.crop, 'crops/card-0.png');
  assert.deepEqual(pngSize(readFileSync(join(out, 'crops', 'card-0.png'))), [332, 98]);
  assert.equal(card.style['box-shadow'], 'rgba(0, 0, 0, 0.15) 0px 2px 6px 0px');

  for (const candidate of facts.candidates) {
    assert.ok(existsSync(join(out, ...candidate.crop.split('/'))), candidate.crop);
  }
  assert.deepEqual(pngSize(readFileSync(join(out, 'page.png'))), [1280, 900]);

  const colour = (value: string) => facts.colours.find((entry) => entry.value === value)?.where;
  assert.ok(colour('#0f7a52')?.includes('background'), JSON.stringify(facts.colours));
  assert.ok(colour('#0b0c0c')?.includes('text'), JSON.stringify(facts.colours));
  assert.ok(colour('#cecece')?.includes('border'), JSON.stringify(facts.colours));
  assert.equal(facts.families[0]?.value, 'system-ui');
  assert.deepEqual(
    facts.roles.find((role) => role.tag === 'h1'),
    { tag: 'h1', family: 'system-ui', size: '32px', weight: '700', lineHeight: '40px' },
  );
  assert.ok(facts.radii.some((radius) => radius.value === '6px'));
  assert.ok(facts.borders.some((border) => border.value === '1px solid #cecece'));
  assert.deepEqual(facts.rootVars, [
    { name: '--brand', value: { pageText: '#0f7a52' } },
    { name: '--ink', value: { pageText: '#0b0c0c' } },
    { name: '--line', value: { pageText: '#cecece' } },
    { name: '--soft', value: { pageText: '#f3f3f3' } },
  ]);
  assert.deepEqual(facts.breakpoints, [600]);
});

test('the phone width keeps the same order', { timeout: TEST_MS }, async (t) => {
  const report = await scan('/index.html', { width: 390 });
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = scanned(report);
  assert.equal(facts.width, 390);
  assert.deepEqual(
    facts.candidates.filter((candidate) => candidate.kind === 'button').map((c) => c.text.pageText),
    ['Save changes', 'Accept cookies'],
  );
  // The page's own rule for narrow windows moves the card to 16 px.
  assert.equal(facts.candidates.find((candidate) => candidate.kind === 'card')?.box[0], 16);
});

test('a dialog over the page is an overlay and its candidates come last; lazy content is found', {
  timeout: TEST_MS,
}, async (t) => {
  const report = await scan('/overlay.html');
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = scanned(report);
  assert.doesNotThrow(() => ScanFactsSchema.parse(facts));
  assert.equal(facts.overlays.length, 1, JSON.stringify(facts.overlays));
  assert.match(facts.overlays[0]?.text.pageText ?? '', /Join our newsletter/);
  // The dialog box itself (a card) and its button are both inside the overlay, and every
  // candidate of an overlay comes after every candidate of the page.
  const first = facts.candidates.findIndex((candidate) => candidate.overlay);
  assert.ok(first > 0, JSON.stringify(facts.candidates.map((c) => [c.id, c.overlay])));
  assert.ok(facts.candidates.slice(first).every((candidate) => candidate.overlay));
  assert.ok(facts.candidates.slice(0, first).every((candidate) => !candidate.overlay));
  const overlaid = facts.candidates.filter((candidate) => candidate.overlay);
  assert.ok(
    overlaid.some((c) => c.kind === 'button' && c.text.pageText === 'Dialog OK'),
    JSON.stringify(overlaid.map((c) => [c.kind, c.text.pageText])),
  );
  assert.ok(overlaid.every((c) => /Dialog OK/.test(c.text.pageText)));
  const buttons = facts.candidates.filter((candidate) => candidate.kind === 'button');
  assert.deepEqual(
    buttons.map((c) => c.text.pageText),
    ['Page action', 'Loaded later', 'Dialog OK'],
  );
});

test('a page with an empty main is scanned with no candidates', { timeout: TEST_MS }, async (t) => {
  const out = tempDir('kitvas-scan-');
  const report = await scan('/empty.html', { out });
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = scanned(report);
  assert.doesNotThrow(() => ScanFactsSchema.parse(facts));
  assert.deepEqual(facts.candidates, []);
  assert.deepEqual(facts.title, { pageText: 'Nothing yet' });
  assert.deepEqual(facts.breakpoints, [600]);
  assert.ok(existsSync(join(out, 'page.png')));
});

test('a redirect to a refused address blocks the scan before the address is asked', {
  timeout: TEST_MS,
}, async (t) => {
  const report = await scan('/redirect-to-private', { policy: refusing('/private.html') });
  if (report === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(report, { state: 'blocked', url: `${site.origin}/private.html` });
  assert.equal(site.hits('/private.html'), 0);
});

test('a refused page is blocked at its own address', { timeout: TEST_MS }, async (t) => {
  const report = await scan('/index.html', { policy: async () => false });
  if (report === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(report, { state: 'blocked', url: `${site.origin}/index.html` });
});

test('a refused image of the page is dropped and the page is still scanned', {
  timeout: TEST_MS,
}, async (t) => {
  const earlier = site.hits('/private.png');
  const report = await scan('/index.html', { policy: refusing('/private.png') });
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = scanned(report);
  assert.equal(facts.candidates[0]?.text.pageText, 'Save changes');
  assert.equal(site.hits('/private.png'), earlier);
});

test('a page that answers 404 fails with its status', { timeout: TEST_MS }, async (t) => {
  const report = await scan('/missing.html');
  if (report === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(report, { state: 'failed', error: 'the page answered with status 404' });
});

test('a policy that throws fails the scan with its message', { timeout: TEST_MS }, async (t) => {
  const report = await scan('/index.html', {
    policy: async () => {
      throw new Error('getaddrinfo ENOTFOUND acme.invalid');
    },
  });
  if (report === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(report, { state: 'failed', error: 'getaddrinfo ENOTFOUND acme.invalid' });
});
