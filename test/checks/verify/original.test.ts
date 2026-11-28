import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseExamples } from '../../../src/checks/app/verify/example-parse.ts';
import { originalStep } from '../../../src/checks/app/verify/original.ts';
import {
  blockingFailures,
  lookScore,
  type Measure,
  type PlacedRead,
  readVerifyFile,
} from '../../../src/checks/index.ts';
import type { LoadedKit } from '../../../src/kit/index.ts';
import type { CatalogReport, ProjectStyleResult } from '../../../src/render/index.ts';
import { bar } from '../pixels.ts';
import {
  ACME_CATALOG,
  catalog,
  codeLoaded,
  type FakeMeasure,
  fakeBundler,
  fakeMeasure,
  fakeStyles,
  frameOf,
  measured,
  memoryFs,
  ORIGINAL_MARKUP,
  PROJECT,
  writtenLoaded,
} from './support.ts';

const PAGE = join(ACME_CATALOG, 'originals', 'Button.1.html');
const RING: PlacedRead = {
  place: '/0',
  element: 'button',
  value: '2px solid rgb(31, 95, 208), offset 2px',
};

type Options = {
  loaded?: LoadedKit;
  build?: CatalogReport;
  measure?: FakeMeasure;
  styles?: Record<string, ProjectStyleResult>;
  markup?: string | null;
  /** Project files by their path from the project folder. */
  files?: Record<string, string>;
};

async function run(options: Options = {}) {
  const loaded = options.loaded ?? codeLoaded();
  const fs = memoryFs();
  const markup = options.markup === undefined ? ORIGINAL_MARKUP : options.markup;
  if (markup !== null) fs.writeText(join(loaded.dir, 'originals', 'Button.1.html'), markup);
  for (const [file, text] of Object.entries(options.files ?? {})) {
    fs.writeText(join(PROJECT, ...file.split('/')), text);
  }
  const examples = await parseExamples(fakeBundler(), loaded.kit);
  const measure = options.measure ?? fakeMeasure();
  const styles = fakeStyles(options.styles);
  const result = await originalStep({
    loaded,
    build: options.build ?? catalog({ shown: ['Button.1'] }),
    dir: ACME_CATALOG,
    examples,
    measure: measure.measure,
    projectStyles: styles.styles,
    fs,
  });
  return { result, fs, measure, styles };
}

/** Answers for the original's page (no search) and for the copy's page. */
const sides = (
  original: Parameters<typeof measured>[0],
  copy: Parameters<typeof measured>[0] = original,
) => fakeMeasure((input: Measure) => measured(input.search === '' ? original : copy));

test('the step is skipped for a web kit and for a catalog that did not build', async () => {
  const web = await run({ loaded: writtenLoaded() });
  assert.deepEqual(web.result, { state: 'skipped', issues: [], originals: [], drawn: [] });
  assert.equal(web.measure.asked.length, 0);
  const unbuilt = await run({ build: catalog({ built: false }) });
  assert.equal(unbuilt.result.state, 'skipped');
  assert.equal(unbuilt.measure.asked.length, 0);
});

test('an example that matches its original passes with one entry', async () => {
  const { result, measure } = await run();
  assert.deepEqual(result, {
    state: 'passed',
    issues: [],
    originals: [{ key: 'Button.1', width: 1280, frames: 1, differences: 0, score: 100 }],
    drawn: [],
  });
  const [theirs, mine] = measure.asked;
  assert.equal(theirs?.page, PAGE);
  assert.equal(theirs?.search, '');
  assert.deepEqual(theirs?.probe?.selectors, ['.btn']);
  assert.equal(theirs?.controls, 4);
  assert.equal(mine?.page, catalog().path);
  assert.equal(mine?.search, '?example=Button.1');
  assert.equal(mine?.probe, undefined);
  assert.equal(mine?.shot, join(ACME_CATALOG, 'originals', 'Button.1.1280.copy.png'));
  assert.equal(theirs?.shot, join(ACME_CATALOG, 'originals', 'Button.1.1280.original.png'));
});

test('a refused original is never opened', async () => {
  const script = await run({ markup: '<div data-kv-scope="Button"><script>go()</script></div>' });
  assert.equal(script.result.state, 'failed');
  assert.deepEqual(script.result.issues, [
    {
      step: 'original',
      path: 'components.0.examples.0',
      key: 'kitIssue.originalRefused',
      params: { key: 'Button.1', detail: 'it holds a <script> tag' },
    },
  ]);
  assert.equal(script.measure.asked.length, 0);
  assert.equal(script.fs.files.has(PAGE), false);
  const missing = await run({ markup: null });
  assert.equal(missing.result.issues[0]?.key, 'kitIssue.originalRefused');
  assert.equal(missing.measure.asked.length, 0);
});

test('styles that cannot be compiled are advice', async () => {
  const detail = 'src/button.css: no style block';
  const { result, measure } = await run({
    styles: { 'src/button.css': { ok: false, reason: 'unsupported', detail } },
  });
  assert.deepEqual(result, {
    state: 'passed',
    issues: [
      {
        step: 'original',
        path: 'components.0.examples.0',
        key: 'kitIssue.originalNotDrawn',
        params: { component: 'Button', detail },
      },
    ],
    originals: [],
    drawn: [{ component: 'Button', why: 'notDrawn' }],
  });
  assert.equal(measure.asked.length, 0);
});

test('a compile that throws is advice too', async () => {
  const loaded = codeLoaded();
  const examples = await parseExamples(fakeBundler(), loaded.kit);
  const fs = memoryFs();
  fs.writeText(join(loaded.dir, 'originals', 'Button.1.html'), ORIGINAL_MARKUP);
  const result = await originalStep({
    loaded,
    build: catalog({ shown: ['Button.1'] }),
    dir: ACME_CATALOG,
    examples,
    measure: fakeMeasure().measure,
    projectStyles: async () => {
      throw new Error('boom');
    },
    fs,
  });
  assert.equal(result.state, 'passed');
  assert.equal(result.issues[0]?.key, 'kitIssue.originalNotDrawn');
  assert.deepEqual(result.drawn, [{ component: 'Button', why: 'notDrawn' }]);
});

test('a measure that throws or fails is an issue, not a crash', async () => {
  const thrown = await run({
    measure: fakeMeasure(() => {
      throw new Error('page crashed');
    }),
  });
  assert.equal(thrown.result.state, 'failed');
  assert.deepEqual(thrown.result.issues[0]?.params, { key: 'Button.1', detail: 'page crashed' });
  assert.equal(thrown.result.issues[0]?.key, 'kitIssue.originalUnreadable');
  const failed = await run({ measure: fakeMeasure(() => ({ state: 'failed', error: 'no page' })) });
  assert.equal(failed.result.issues[0]?.key, 'kitIssue.originalUnreadable');
});

test('a page that cannot read a style is partial', async () => {
  const partial = await run({ measure: sides({ unread: ['::ng-deep .x'] }, {}) });
  assert.deepEqual(partial.result, {
    state: 'passed',
    issues: [
      {
        step: 'original',
        path: 'components.0.examples.0',
        key: 'kitIssue.originalPartial',
        params: { component: 'Button', count: 1, detail: '::ng-deep .x' },
      },
    ],
    originals: [],
    drawn: [{ component: 'Button', why: 'partial' }],
  });
  // A name written for another engine is dropped by the app's own browser too: no issue.
  const other = await run({ measure: sides({ unread: [':-moz-focusring'] }, {}) });
  assert.deepEqual(other.result.issues, []);
  assert.equal(other.result.originals.length, 1);
});

test('outlines are compared', async () => {
  const rest = frameOf('rest', -1);
  const measure = fakeMeasure((input) =>
    measured({
      frames: [rest, { ...frameOf('focus', 0), outlines: input.search === '' ? [RING] : [] }],
    }),
  );
  const { result } = await run({ measure });
  assert.equal(result.state, 'failed');
  assert.deepEqual(result.issues, [
    {
      step: 'original',
      path: 'components.0.examples.0',
      key: 'kitIssue.originalDiffers',
      params: {
        key: 'Button.1',
        element: 'button',
        property: 'outline',
        copy: 'none',
        original: RING.value,
        where: '1280 px: focus 1',
      },
    },
  ]);
  assert.deepEqual(result.originals, [
    { key: 'Button.1', width: 1280, frames: 2, differences: 1, score: 100 },
  ]);
});

test("a component's own tag in another display than the app gives it is a finding (W37)", async () => {
  const host = (value: string): PlacedRead[] => [{ place: '/0', element: 'app-button', value }];
  const measure = fakeMeasure((input) =>
    measured({
      frames: [frameOf('rest', -1, undefined, [], host(input.search === '' ? 'inline' : 'block'))],
    }),
  );
  const { result } = await run({ measure });
  assert.equal(result.state, 'failed');
  assert.deepEqual(
    result.issues.map((issue) => issue.params),
    [
      {
        key: 'Button.1',
        element: 'app-button',
        property: 'display',
        copy: 'block',
        original: 'inline',
        where: '1280 px: rest',
      },
    ],
  );
});

test('an example that stands in a page the component is not always on is a finding (W42)', async () => {
  const loaded = codeLoaded((json) => {
    const [button] = json.components as {
      examples: { around?: unknown }[];
      project: { name?: string };
    }[];
    if (!button?.examples[0]) return;
    button.project.name = 'app-button';
    button.examples[0].around = [{ tag: 'div', attributes: { class: 'profile-page' } }];
  });
  const files = {
    'src/components/button.html': '<button class="btn"><app-button-icon /></button>',
    'src/components/profile.html': '<div class="profile-page"><app-button></app-button></div>',
    'src/components/article.html': '<div class="article-page"><app-button></app-button></div>',
    'src/components/home.html': '<div class="home-page"><app-link></app-link></div>',
  };
  const { result } = await run({ loaded, files });
  assert.equal(result.state, 'failed');
  assert.deepEqual(result.issues, [
    {
      step: 'original',
      path: 'components.0.examples.0',
      key: 'kitIssue.originalAroundElsewhere',
      params: {
        key: 'Button.1',
        component: 'Button',
        page: 'profile-page',
        file: 'src/components/article.html',
      },
    },
  ]);
  // Every page that uses it is that page: nothing.
  const alone = await run({
    loaded,
    files: { 'src/components/profile.html': files['src/components/profile.html'] },
  });
  assert.deepEqual(alone.result.issues, []);
});

test('frames that do not match', async () => {
  const measure = fakeMeasure((input) =>
    measured({
      frames:
        input.search === '' ? [frameOf('rest', -1)] : [frameOf('rest', -1), frameOf('hover', 0)],
    }),
  );
  const { result } = await run({ measure });
  assert.deepEqual(result.issues, [
    {
      step: 'original',
      path: 'components.0.examples.0',
      key: 'kitIssue.originalDiffers',
      params: {
        key: 'Button.1',
        element: 'root',
        property: 'states',
        copy: 'rest, hover 1',
        original: 'rest',
        where: '1280 px: rest',
      },
    },
  ]);
});

test('a wrong value in the rest frame is named, with the frame it is in', async () => {
  const measure = fakeMeasure((input) => {
    const nodes = frameOf('rest', -1).facts.nodes;
    const first = nodes[0];
    assert.ok(first);
    const copy = [{ ...first, opacity: 0.5 }, ...nodes.slice(1)];
    return measured({ frames: [frameOf('rest', -1, input.search === '' ? nodes : copy)] });
  });
  const { result } = await run({ measure });
  assert.deepEqual(
    result.issues.map((issue) => issue.params),
    [
      {
        key: 'Button.1',
        element: 'button',
        property: 'opacity',
        copy: '0.5',
        original: '1',
        where: '1280 px: rest',
      },
    ],
  );
  assert.equal(result.originals[0]?.differences, 1);
});

test('a difference in several states and widths is one finding that names them', async () => {
  const measure = fakeMeasure((input) => {
    const nodes = frameOf('rest', -1).facts.nodes;
    const first = nodes[0];
    assert.ok(first);
    const own = input.search === '' ? nodes : [{ ...first, opacity: 0.5 }, ...nodes.slice(1)];
    return measured({ frames: [frameOf('rest', -1, own), frameOf('hover', 0, own)] });
  });
  const css = '.btn { padding: 4px; }\n@media (min-width: 600px) { .btn { padding: 8px; } }';
  const { result } = await run({ styles: { 'src/button.css': { ok: true, css } }, measure });
  assert.deepEqual(
    result.issues.map((issue) => issue.params),
    [
      {
        key: 'Button.1',
        element: 'button',
        property: 'opacity',
        copy: '0.5',
        original: '1',
        where: '1280 px: rest, hover 1; 390 px: rest, hover 1',
      },
    ],
  );
  assert.deepEqual(
    result.originals.map((entry) => entry.differences),
    [2, 2],
  );
});

test('states and widths', async () => {
  const frames = [
    frameOf('rest', -1),
    frameOf('hover', 0),
    frameOf('active', 0),
    frameOf('focus', 0),
  ];
  const plain = await run({ measure: fakeMeasure(() => measured({ frames })) });
  assert.deepEqual(plain.result.originals, [
    { key: 'Button.1', width: 1280, frames: 4, differences: 0, score: 100 },
  ]);
  assert.deepEqual(
    plain.measure.asked.map((input) => input.width),
    [1280, 1280],
  );

  const wide = await run({
    styles: {
      'src/button.css': {
        ok: true,
        css: '.btn { padding: 4px; }\n@media (min-width: 600px) { .btn { padding: 8px; } }',
      },
    },
    measure: fakeMeasure(() => measured({ frames })),
  });
  assert.deepEqual(
    wide.measure.asked.map((input) => input.width),
    [1280, 1280, 390, 390],
  );
  assert.deepEqual(
    wide.result.originals.map((entry) => entry.width),
    [1280, 390],
  );
});

test('a far picture fails', async () => {
  const near = bar(40, 20, 8);
  const far = bar(40, 20, 9);
  const measure = fakeMeasure((input) => measured({ pixels: input.search === '' ? near : far }));
  const { result } = await run({ measure });
  const score = lookScore(near, far);
  assert.ok(score.score < 100);
  assert.equal(result.state, 'failed');
  const [issue] = result.issues;
  assert.equal(issue?.key, 'kitIssue.originalFar');
  assert.equal(issue?.params.score, score.score);
  assert.equal(issue?.params.size, score.size);
  assert.equal(issue?.params.colour, score.colour);
  assert.equal(issue?.params.structure, score.structure);
  assert.match(String(issue?.params.copy), /Button\.1\.1280\.copy\.png$/);
  assert.match(String(issue?.params.original), /Button\.1\.1280\.original\.png$/);
  assert.equal(String(issue?.params.copy).includes('\\'), false);
  // The same picture on both sides is not far.
  const same = await run({ measure: fakeMeasure(() => measured({ pixels: near })) });
  assert.deepEqual(same.result.issues, []);
});

test('the shell reaches the page', async () => {
  const shelled = await run({
    loaded: codeLoaded((json) => {
      const source = json.source as Record<string, unknown>;
      source.shell = {
        html: { 'data-theme': 'light' },
        body: {},
        wrappers: [{ tag: 'div', attributes: { id: 'app' } }],
      };
    }),
  });
  const page = shelled.fs.files.get(PAGE) ?? '';
  assert.match(page, /<html[^>]*data-theme="light"/);
  assert.match(page, /<div id="app">[\s]*<div id="root">/);
  const plain = await run();
  const bare = plain.fs.files.get(PAGE) ?? '';
  assert.doesNotMatch(bare, /data-theme/);
  assert.doesNotMatch(bare, /id="app"/);
});

test('verify.json: version 3 is read, and versions 1 and 2 still are', () => {
  const base = {
    kit: 'tiny',
    hash: 'x',
    at: '2026-11-27T10:00:00.000Z',
    valid: true,
    steps: {
      schema: 'passed',
      imports: 'passed',
      types: 'passed',
      render: 'passed',
      tokens: 'skipped',
    },
    issues: [],
    notes: [],
  };
  const read = (value: unknown) => readVerifyFile(JSON.stringify(value));
  assert.equal(read({ ...base, schemaVersion: 1 })?.schemaVersion, 1);
  assert.equal(
    read({ ...base, schemaVersion: 2, steps: { ...base.steps, look: 'passed' } })?.schemaVersion,
    2,
  );
  const three = {
    ...base,
    schemaVersion: 3,
    valid: false,
    steps: { ...base.steps, look: 'skipped', original: 'failed' },
    originals: [{ key: 'Button.1', width: 1280, frames: 4, differences: 2, score: 97.4 }],
    compared: [
      { component: 'Button', level: 'code' },
      { component: 'Card', level: 'read', why: 'partial' },
    ],
  };
  const file = read(three);
  assert.equal(file?.steps.original, 'failed');
  assert.equal(file?.originals?.[0]?.score, 97.4);
  assert.deepEqual(file?.compared?.[1], { component: 'Card', level: 'read', why: 'partial' });
  assert.equal(read({ ...three, compared: [{ component: 'A', level: 'exact' }] }), undefined);
  // A failed `original` is reported, never a reason to refuse a draft.
  assert.deepEqual(blockingFailures(JSON.stringify(three), 'x'), []);
});
