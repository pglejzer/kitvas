// `kit crop` and the `look` capture in a real browser. Skips when this machine has no browser.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { BrowserSession, Capture, Crop } from '../../../../src/checks/ports/browser.ts';
import { tempDir } from '../../../helpers/tmp.ts';
import { decodePng, encodePng, type Rgba } from '../png.ts';
import { NO_BROWSER, openSession } from '../site.ts';

const TEST_MS = 120_000;
const RED: Rgba = [255, 0, 0, 255];
const BLUE: Rgba = [0, 0, 255, 255];

let session: BrowserSession | undefined;

before(async () => {
  session = await openSession();
});

after(async () => {
  await session?.close();
});

/** A 100 x 60 image, red on the left half and blue on the right. */
function halves(dir: string): string {
  const file = join(dir, 'sheet.png');
  writeFileSync(
    file,
    encodePng(100, 60, (x) => (x < 50 ? RED : BLUE)),
  );
  return file;
}

test('boxes are cut, clamped to the image, scaled down, and refused outside it', {
  timeout: TEST_MS,
}, async (t) => {
  const crop = session?.crop;
  if (crop === undefined) return t.skip(NO_BROWSER);
  const dir = tempDir('kitvas-crop-');
  const image = halves(dir);
  const notImage = join(dir, 'notes.png');
  writeFileSync(notImage, 'not an image');
  const out = (name: string) => join(dir, 'refs', name);
  const inputs: Crop[] = [
    { image, box: [40, 10, 20, 20], scale: 1, out: out('inside.png') },
    { image, box: [90, 50, 40, 40], scale: 1, out: out('edge.png') },
    { image, box: [200, 200, 10, 10], scale: 1, out: out('outside.png') },
    { image, box: [100, 0, 5, 5], scale: 1, out: out('empty.png') },
    { image, box: [0, 0, 40, 20], scale: 2, out: out('half.png') },
    { image: join(dir, 'gone.png'), box: [0, 0, 1, 1], scale: 1, out: out('gone.png') },
    { image: notImage, box: [0, 0, 1, 1], scale: 1, out: out('notes.png') },
  ];
  const reports = await crop(inputs);
  assert.deepEqual(reports, [
    { state: 'written', width: 20, height: 20 },
    { state: 'written', width: 10, height: 10 },
    { state: 'failed', error: 'the box is outside the 100 x 60 px image' },
    { state: 'failed', error: 'the box is outside the 100 x 60 px image' },
    { state: 'written', width: 20, height: 10 },
    { state: 'failed', error: 'the image could not be read' },
    { state: 'failed', error: 'the image is not a PNG, JPEG or WebP image' },
  ]);

  const inside = decodePng(readFileSync(out('inside.png')));
  assert.deepEqual([inside.width, inside.height], [20, 20]);
  // x 40 to 49 of the image is red, 50 and on blue.
  assert.deepEqual(
    [inside.pixel(0, 0), inside.pixel(9, 19), inside.pixel(10, 0)],
    [RED, RED, BLUE],
  );
  const edge = decodePng(readFileSync(out('edge.png')));
  assert.deepEqual(edge.pixel(9, 9), BLUE);
  const half = decodePng(readFileSync(out('half.png')));
  assert.deepEqual(half.pixel(5, 5), RED);
  for (const name of ['outside.png', 'empty.png', 'gone.png', 'notes.png']) {
    assert.equal(existsSync(out(name)), false, name);
  }
});

test('no boxes, no work', { timeout: TEST_MS }, async (t) => {
  const crop = session?.crop;
  if (crop === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(await crop([]), []);
});

/** A catalog page stand-in: `#root` holds the example, the page says it was shown. */
function examplePage(dir: string, body: string): string {
  const file = join(dir, 'index.html');
  writeFileSync(
    file,
    [
      '<!doctype html>',
      '<html data-example="shown"><head><meta charset="utf-8"><style>',
      'body { margin: 0; padding: 24px; background: #ffffff; }',
      '.box { width: 120px; height: 40px; background: #0f7a52; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15); }',
      `</style></head><body><div id="root">${body}</div></body></html>`,
    ].join('\n'),
  );
  return file;
}

test('a capture shoots the example with its shadow and decodes it beside its reference', {
  timeout: TEST_MS,
}, async (t) => {
  const capture = session?.capture;
  if (capture === undefined) return t.skip(NO_BROWSER);
  const dir = tempDir('kitvas-capture-');
  const page = examplePage(dir, '<div class="box"></div>');
  const input: Capture = {
    page,
    search: '?example=Box.1',
    width: 1280,
    height: 900,
    shot: join(dir, 'look', 'first.png'),
    reference: join(dir, 'source', 'refs', 'missing.png'),
  };

  const first = await capture(input);
  assert.deepEqual(first.errors, ['the reference could not be read']);
  assert.equal(first.reference, undefined);
  // 120 x 40 plus the shadow's reach: 6 px on each side, 4 px above, 8 px below.
  assert.deepEqual([first.rendered?.width, first.rendered?.height], [132, 52]);
  assert.equal(first.rendered?.data.length, 132 * 52 * 4);
  assert.ok(existsSync(input.shot));
  const centre = (66 + 24 * 132) * 4;
  assert.deepEqual(
    [...(first.rendered?.data.subarray(centre, centre + 4) ?? [])],
    [15, 122, 82, 255],
  );

  const second = await capture({
    ...input,
    shot: join(dir, 'look', 'second.png'),
    reference: input.shot,
  });
  assert.deepEqual(second.errors, []);
  assert.ok(second.rendered && second.reference);
  assert.deepEqual(second.rendered, second.reference);
});

test('a reference over the pixel limit is not decoded', { timeout: TEST_MS }, async (t) => {
  const capture = session?.capture;
  if (capture === undefined) return t.skip(NO_BROWSER);
  const dir = tempDir('kitvas-capture-');
  const reference = join(dir, 'huge.png');
  writeFileSync(
    reference,
    encodePng(2001, 2000, () => [255, 255, 255, 255]),
  );
  const report = await capture({
    page: examplePage(dir, '<div class="box"></div>'),
    search: '',
    width: 1280,
    height: 900,
    shot: join(dir, 'look', 'Box.1.png'),
    reference,
  });
  assert.deepEqual(report.errors, ['the reference is 2001 x 2000 px, more than 4000000 pixels']);
  assert.equal(report.reference, undefined);
  assert.equal(report.rendered?.width, 132);
});

test('an example that rendered nothing, or failed, gives no rendering and says why', {
  timeout: TEST_MS,
}, async (t) => {
  const capture = session?.capture;
  if (capture === undefined) return t.skip(NO_BROWSER);
  const dir = tempDir('kitvas-capture-');
  const reference = join(dir, 'ref.png');
  writeFileSync(
    reference,
    encodePng(4, 4, () => RED),
  );
  const input = (page: string): Capture => ({
    page,
    search: '',
    width: 1280,
    height: 900,
    shot: join(dir, 'look', 'shot.png'),
    reference,
  });

  const empty = await capture(input(examplePage(dir, '')));
  assert.deepEqual(empty.errors, ['the example rendered no element']);
  assert.equal(empty.rendered, undefined);
  assert.deepEqual([empty.reference?.width, empty.reference?.height], [4, 4]);
  assert.deepEqual([...(empty.reference?.data.subarray(0, 4) ?? [])], RED);

  const failedPage = join(dir, 'failed.html');
  writeFileSync(
    failedPage,
    '<!doctype html><html data-example="failed"><body><div id="root"><p>x</p></div></body></html>',
  );
  const failed = await capture(input(failedPage));
  assert.deepEqual(failed.errors, ['the example failed to render']);
  assert.equal(failed.rendered, undefined);
});
