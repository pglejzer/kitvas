// The parts of the browser capabilities that need no browser: the shadow rule crops and captures
// share, the merge of what the frames of a page report, the order and numbering of candidates, and
// how an image's type is told.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstLine, imageMime } from '../../../src/checks/adapters/playwright-images.ts';
import {
  NO_REACH,
  REACH_MAX,
  type Reach,
  roundBox,
  shadowReach,
  widened,
} from '../../../src/checks/adapters/playwright-reach.ts';
import type { FrameCandidate } from '../../../src/checks/adapters/playwright-scan-candidates.ts';
import {
  type Chosen,
  mergeStyles,
  numberCandidates,
  rankCandidates,
} from '../../../src/checks/adapters/playwright-scan-merge.ts';
import type { FrameStyles } from '../../../src/checks/adapters/playwright-scan-styles.ts';
import { ScanFactsSchema } from '../../../src/checks/domain/scan-facts.ts';
import { encodePng } from './png.ts';

/** `shadowReach` runs in the page; here it gets a computed style with only `boxShadow`. */
function reachOf(boxShadow: string, max = REACH_MAX): Reach {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle');
  Object.assign(globalThis, { getComputedStyle: () => ({ boxShadow }) });
  try {
    return shadowReach({} as unknown as Element, max);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'getComputedStyle', saved);
    else Reflect.deleteProperty(globalThis, 'getComputedStyle');
  }
}

const reach = (top: number, right: number, bottom: number, left: number): Reach => ({
  top,
  right,
  bottom,
  left,
});

test('a shadow reaches by offset plus blur plus spread, per side, rounded up, at most 16', () => {
  assert.deepEqual(reachOf('none'), NO_REACH);
  assert.deepEqual(reachOf('rgba(0, 0, 0, 0.15) 0px 2px 6px 0px'), reach(4, 6, 8, 6));
  // A hard shadow below a button, as GOV.UK draws it.
  assert.deepEqual(reachOf('rgb(8, 61, 41) 0px 2px 0px 0px'), reach(0, 0, 2, 0));
  assert.deepEqual(
    reachOf('rgba(0, 0, 0, 0.1) 0px 1px 2px 0px, rgba(0, 0, 0, 0.2) 4px 0px 8px 2px'),
    reach(10, 14, 10, 6),
  );
  assert.deepEqual(reachOf('rgba(0, 0, 0, 0.1) 0px 0.5px 1.5px 0px'), reach(1, 2, 2, 2));
  assert.deepEqual(reachOf('oklch(0.5 0.1 200 / 0.3) 0px 2px 4px 0px'), reach(2, 4, 6, 4));
  assert.deepEqual(reachOf('rgba(0, 0, 0, 0.5) 0px 10px 40px 0px'), reach(16, 16, 16, 16));
  assert.deepEqual(reachOf('rgba(0, 0, 0, 0.5) 0px 10px 40px 0px', 4), reach(4, 4, 4, 4));
});

test('an inset shadow paints inside the box and reaches nowhere', () => {
  assert.deepEqual(reachOf('rgb(0, 0, 0) 0px 0px 0px 2px inset'), NO_REACH);
  assert.deepEqual(reachOf('inset rgb(0, 0, 0) 0px 0px 0px 2px'), NO_REACH);
  assert.deepEqual(
    reachOf('rgb(0, 0, 0) 0px 0px 0px 2px inset, rgba(0, 0, 0, 0.2) 0px 1px 3px 0px'),
    reach(2, 3, 4, 3),
  );
});

test('a box is rounded, widened by its reach and clamped to the page', () => {
  const page = { width: 1280, height: 900 };
  const card = { x: 32, y: 190, width: 320, height: 86 };
  assert.deepEqual(widened(card, reach(4, 6, 8, 6), page), [26, 186, 332, 98]);
  assert.deepEqual(
    widened({ x: 2, y: 0, width: 10, height: 10 }, reach(6, 6, 6, 6), page),
    [0, 0, 18, 16],
  );
  assert.deepEqual(
    widened({ x: 0, y: 890, width: 100, height: 40 }, NO_REACH, page),
    [0, 890, 100, 10],
  );
  assert.equal(widened({ x: 0, y: 950, width: 100, height: 40 }, NO_REACH, page), undefined);
  assert.equal(
    widened({ x: 10, y: 10, width: 0.3, height: 40 }, reach(4, 4, 4, 4), page),
    undefined,
  );
  const fractional = { x: 10.4, y: 20.6, width: 99.5, height: 30.49 };
  assert.deepEqual(roundBox(fractional), [10, 21, 100, 30]);
  assert.deepEqual(widened(fractional, NO_REACH, page), [10, 21, 100, 30]);
});

const frameA: FrameStyles = {
  title: 'Acme plans',
  colours: [
    { value: '#0b0c0c', count: 5, where: ['text'] },
    { value: '#ffffff', count: 3, where: ['background'] },
    { value: '#cecece', count: 2, where: ['border'] },
  ],
  families: [{ value: 'system-ui', count: 6 }],
  type: [{ family: 'system-ui', size: '16px', lineHeight: '24px', weight: '400', count: 4 }],
  roles: [{ tag: 'h1', family: 'system-ui', size: '32px', weight: '700', lineHeight: '40px' }],
  spacing: [
    { value: '16px', count: 3 },
    { value: '24px', count: 3 },
    { value: '8px', count: 1 },
  ],
  radii: [{ value: '6px', count: 2 }],
  shadows: [],
  borders: [{ value: '1px solid #cecece', count: 2 }],
  rootVars: [
    { name: '--ink', value: '#0b0c0c' },
    { name: '--brand', value: '#0f7a52' },
    { name: '--bad name', value: 'x' },
  ],
  breakpoints: [600, 1024],
};

const frameB: FrameStyles = {
  title: 'An example in a frame',
  colours: [
    { value: '#ffffff', count: 4, where: ['text', 'background'] },
    { value: 'red', count: 9, where: ['text'] },
  ],
  families: [{ value: 'Georgia', count: 6 }],
  type: [{ family: 'system-ui', size: '16px', lineHeight: '24px', weight: '400', count: 2 }],
  roles: [
    { tag: 'h1', family: 'Georgia', size: '28px', weight: '400', lineHeight: '32px' },
    { tag: 'p', family: 'Georgia', size: '16px', weight: '400', lineHeight: '24px' },
  ],
  spacing: [{ value: '8px', count: 2 }],
  radii: [],
  shadows: [{ value: 'rgba(0, 0, 0, 0.15) 0px 2px 6px 0px', count: 1 }],
  borders: [],
  rootVars: [{ name: '--ink', value: '#000000' }],
  breakpoints: [600, 320],
};

test('frames are merged: counts added, most used first, ties by value, the page first', () => {
  const merged = mergeStyles([frameA, frameB]);
  assert.deepEqual(merged, {
    title: { pageText: 'Acme plans' },
    colours: [
      { value: '#ffffff', count: 7, where: ['text', 'background'] },
      { value: '#0b0c0c', count: 5, where: ['text'] },
      { value: '#cecece', count: 2, where: ['border'] },
    ],
    families: [
      { value: 'Georgia', count: 6 },
      { value: 'system-ui', count: 6 },
    ],
    type: [{ family: 'system-ui', size: '16px', lineHeight: '24px', weight: '400', count: 6 }],
    roles: [
      { tag: 'h1', family: 'system-ui', size: '32px', weight: '700', lineHeight: '40px' },
      { tag: 'p', family: 'Georgia', size: '16px', weight: '400', lineHeight: '24px' },
    ],
    spacing: [
      { value: '16px', count: 3 },
      { value: '24px', count: 3 },
      { value: '8px', count: 3 },
    ],
    radii: [{ value: '6px', count: 2 }],
    shadows: [{ value: 'rgba(0, 0, 0, 0.15) 0px 2px 6px 0px', count: 1 }],
    borders: [{ value: '1px solid #cecece', count: 2 }],
    rootVars: [
      { name: '--brand', value: { pageText: '#0f7a52' } },
      { name: '--ink', value: { pageText: '#0b0c0c' } },
    ],
    breakpoints: [320, 600, 1024],
  });
});

test('merged facts keep to the sizes the schema takes', () => {
  const many = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => ({ value: `${prefix}${index}`, count: 1 }));
  const big: FrameStyles = {
    ...frameA,
    title: 'T'.repeat(100),
    colours: Array.from({ length: 30 }, (_, index) => ({
      value: `#0000${index.toString(16).padStart(2, '0')}`,
      count: 1,
      where: ['text' as const],
    })),
    families: many('family', 12),
    spacing: many('px', 20),
    radii: many('r', 10),
    shadows: [...many('s', 10), { value: 'x'.repeat(201), count: 50 }],
    borders: many('b', 10),
    rootVars: Array.from({ length: 420 }, (_, index) => ({
      name: `--v${String(index).padStart(3, '0')}`,
      value: 'v'.repeat(90),
    })),
  };
  const merged = mergeStyles([big]);
  assert.equal(merged.title.pageText.length, 80);
  assert.deepEqual(
    [
      merged.colours,
      merged.families,
      merged.spacing,
      merged.radii,
      merged.shadows,
      merged.borders,
    ].map((list) => list.length),
    [24, 8, 16, 8, 8, 8],
  );
  assert.equal(merged.rootVars.length, 400);
  assert.equal(merged.rootVars[0]?.value.pageText.length, 80);
  const facts = {
    schemaVersion: 1,
    url: 'https://example.com/',
    width: 1280,
    ...merged,
    candidates: [],
  };
  assert.doesNotThrow(() => ScanFactsSchema.parse(facts));
});

const candidate = (
  mark: string,
  kind: FrameCandidate['kind'],
  rank: number,
  order: number,
  overlay = false,
): FrameCandidate => ({
  mark,
  kind,
  rank,
  order,
  overlay,
  text: '',
  style: {},
});

test('candidates go by kind, then main before the rest before banners, then frame and page order', () => {
  const ranked = rankCandidates([
    [
      candidate('0', 'heading', 0, 1),
      candidate('1', 'button', 2, 9),
      candidate('2', 'button', 0, 5),
      candidate('3', 'button', 1, 2),
    ],
    [candidate('0', 'button', 0, 1), candidate('1', 'card', 0, 3)],
  ]);
  assert.deepEqual(
    ranked.map(({ frame, candidate: found }) => [frame, found.mark]),
    [
      [0, '2'],
      [1, '0'],
      [0, '3'],
      [0, '1'],
      [1, '1'],
      [0, '0'],
    ],
  );
});

test('candidates inside an overlay come after all others', () => {
  const ranked = rankCandidates([
    [candidate('0', 'button', 2, 1, true), candidate('1', 'heading', 0, 2)],
    [candidate('0', 'button', 1, 1)],
  ]);
  assert.deepEqual(
    ranked.map(({ frame, candidate: found }) => [frame, found.mark]),
    [
      [1, '0'],
      [0, '1'],
      [0, '0'],
    ],
  );
});

test('candidates are numbered per kind as their crops fit; the first that does not fit ends them', () => {
  const chosen = (
    kind: Chosen['kind'],
    text: string,
    style: Record<string, string> = {},
  ): Chosen => ({
    kind,
    box: [1, 2, 3, 4],
    rect: [0, 0, 5, 6],
    overlay: false,
    text,
    style,
  });
  const png = (bytes: number) => ({
    ok: true as const,
    width: 5,
    height: 6,
    png: new Uint8Array(bytes),
  });
  const kept = numberCandidates(
    [
      chosen('button', 'S'.repeat(100), {
        color: '#ffffff',
        'Bad Key': 'x',
        padding: 'p'.repeat(201),
      }),
      chosen('button', 'Accept'),
      chosen('card', 'Plan'),
      chosen('heading', 'Title'),
    ],
    [png(100), { ok: false, error: 'the box is outside the 5 x 6 px image' }, png(50), png(80)],
    160,
  );
  assert.deepEqual(
    kept.map(({ candidate: found }) => [found.id, found.crop, found.text.pageText.length]),
    [
      ['button-0', 'crops/button-0.png', 80],
      ['card-0', 'crops/card-0.png', 4],
    ],
  );
  assert.deepEqual(kept[0]?.candidate.style, { color: '#ffffff' });
  assert.deepEqual(kept[0]?.candidate.box, [1, 2, 3, 4]);
  assert.equal(kept[1]?.png.byteLength, 50);
});

test('an image is told by its first bytes', () => {
  assert.equal(imageMime(encodePng(1, 1, () => [0, 0, 0, 255])), 'image/png');
  assert.equal(imageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'image/jpeg');
  assert.equal(imageMime(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')), 'image/webp');
  assert.equal(imageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), undefined);
  assert.equal(imageMime(new Uint8Array(0)), undefined);
});

test('an error is told by its first line, without the call log', () => {
  assert.equal(
    firstLine(new Error('page.goto: net::ERR_FAILED at http://x/\nCall log:\n  - navigating')),
    'page.goto: net::ERR_FAILED at http://x/',
  );
  assert.equal(firstLine('plain words'), 'plain words');
});
