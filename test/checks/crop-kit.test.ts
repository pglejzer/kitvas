import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  type Browser,
  type BrowserSession,
  type Crop,
  type CropReport,
  cropKit,
} from '../../src/checks/index.ts';
import type { KitStore } from '../../src/kit/index.ts';
import { KitvasError } from '../../src/shared/index.ts';

const KIT_DIR = join('kits', 'site');

type Box = { image: string; box: number[]; scale?: number; name: string };

const box = (name: string, image = 'source/figma/sheet.png', extra: Partial<Box> = {}): Box => ({
  image,
  box: [10, 20, 30, 40],
  name,
  ...extra,
});

/** A kit with these files (path in the kit to parsed JSON) and a browser that cuts with `answer`. */
function shop(
  files: Record<string, unknown>,
  answer: (input: Crop) => CropReport = () => ({ state: 'written', width: 30, height: 40 }),
  options: { crop?: boolean } = {},
) {
  const cropped: Crop[][] = [];
  let closed = 0;
  let opened = 0;
  const kits: KitStore = {
    list: () => ['site'],
    read: (id) => (id === 'site' ? { id, dir: KIT_DIR, kitJson: {} } : undefined),
    readJson: (_id, relPath) => files[relPath],
    exists: (_id, relPath) => relPath in files,
  };
  const session: BrowserSession = {
    name: 'fake',
    async visit() {
      throw new Error('never visited');
    },
    ...(options.crop === false
      ? {}
      : {
          async crop(inputs: Crop[]) {
            cropped.push(inputs);
            return inputs.map(answer);
          },
        }),
    async close() {
      closed += 1;
    },
  };
  const browser: Browser = {
    async open() {
      opened += 1;
      return session;
    },
  };
  return { deps: { kits, browser }, cropped, closed: () => closed, opened: () => opened };
}

const SHEET = 'source/figma/sheet.png';

test('every box of every boxes file becomes a reference in source/refs', async () => {
  const kit = shop({
    [SHEET]: 'png',
    'source/images/photo.jpg': 'jpg',
    'source/figma/boxes.json': [box('Button.1', SHEET, { scale: 2 }), box('Card.1')],
    'source/images/boxes.json': [box('Badge.1', 'source/images/photo.jpg')],
  });
  const result = await cropKit(kit.deps, 'p', 'site');
  assert.deepEqual(result, {
    id: 'site',
    written: ['source/refs/Button.1.png', 'source/refs/Card.1.png', 'source/refs/Badge.1.png'],
    errors: [],
  });
  assert.deepEqual(kit.cropped, [
    [
      {
        image: join(KIT_DIR, 'source', 'figma', 'sheet.png'),
        box: [10, 20, 30, 40],
        scale: 2,
        out: join(KIT_DIR, 'source', 'refs', 'Button.1.png'),
      },
      {
        image: join(KIT_DIR, 'source', 'figma', 'sheet.png'),
        box: [10, 20, 30, 40],
        scale: 1,
        out: join(KIT_DIR, 'source', 'refs', 'Card.1.png'),
      },
      {
        image: join(KIT_DIR, 'source', 'images', 'photo.jpg'),
        box: [10, 20, 30, 40],
        scale: 1,
        out: join(KIT_DIR, 'source', 'refs', 'Badge.1.png'),
      },
    ],
  ]);
  assert.equal(kit.closed(), 1);
});

test('a bad boxes file is one error line and the good one is still cut', async () => {
  const kit = shop({
    [SHEET]: 'png',
    'source/figma/boxes.json': [{ image: SHEET, box: [0, 0, 0, 5], name: 'Zero' }],
    'source/images/boxes.json': { not: 'a list' },
    'source/web/boxes.json': [box('Good.1')],
  });
  const result = await cropKit(kit.deps, 'p', 'site');
  assert.deepEqual(result.written, ['source/refs/Good.1.png']);
  assert.deepEqual(
    result.errors.map((error) => error.name),
    ['source/figma/boxes.json', 'source/images/boxes.json'],
  );
  assert.match(result.errors[0]?.message ?? '', /^not a list of boxes \(0\.box\.2:/);
});

test('a boxes file that is not JSON is an error line too', async () => {
  // The store answers undefined for a file it cannot parse.
  const kit = shop({ 'source/figma/boxes.json': undefined });
  const result = await cropKit(kit.deps, 'p', 'site');
  assert.deepEqual(result, {
    id: 'site',
    written: [],
    errors: [{ name: 'source/figma/boxes.json', message: 'not a list of boxes' }],
  });
  assert.equal(kit.opened(), 0);
});

test('a repeated name, a missing image and a box the browser refuses are error lines', async () => {
  const kit = shop(
    {
      [SHEET]: 'png',
      'source/figma/boxes.json': [
        box('Button.1'),
        box('Button.1'),
        box('Gone.1', 'source/figma/gone.png'),
        box('Outside.1'),
      ],
    },
    (input) =>
      input.out.endsWith('Outside.1.png')
        ? { state: 'failed', error: 'the box is outside the image' }
        : { state: 'written', width: 30, height: 40 },
  );
  const result = await cropKit(kit.deps, 'p', 'site');
  assert.deepEqual(result.written, ['source/refs/Button.1.png']);
  assert.deepEqual(result.errors, [
    { name: 'Button.1', message: 'the name is used by an earlier box' },
    { name: 'Gone.1', message: 'source/figma/gone.png does not exist' },
    { name: 'Outside.1', message: 'the box is outside the image' },
  ]);
});

test('without boxes there is nothing to cut and no browser is started', async () => {
  const kit = shop({});
  assert.deepEqual(await cropKit(kit.deps, 'p', 'site'), { id: 'site', written: [], errors: [] });
  assert.equal(kit.opened(), 0);
});

test('a kit that is not there and a browser that cannot crop are errors', async () => {
  const kit = shop({ [SHEET]: 'png', 'source/figma/boxes.json': [box('A.1')] });
  await assert.rejects(
    cropKit(kit.deps, 'p', 'nope'),
    (error: unknown) => error instanceof KitvasError && error.code === 'KIT_NOT_FOUND',
  );
  const blind = shop({ [SHEET]: 'png', 'source/figma/boxes.json': [box('A.1')] }, undefined, {
    crop: false,
  });
  await assert.rejects(
    cropKit(blind.deps, 'p', 'site'),
    (error: unknown) => error instanceof KitvasError && error.code === 'BROWSER_MISSING',
  );
  assert.equal(blind.closed(), 1);
});
