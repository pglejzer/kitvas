import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseExamples } from '../../../src/checks/app/verify/example-parse.ts';
import { type Capturer, lookStep } from '../../../src/checks/app/verify/look.ts';
import {
  type Capture,
  type CaptureReport,
  lookScore,
  type Pixels,
} from '../../../src/checks/index.ts';
import { bar, solid } from '../pixels.ts';
import { ACME_CATALOG, catalog, fakeBundler, tinyLoaded, writtenLoaded } from './support.ts';

const REF = bar(40, 20, 8);

type Answer = Partial<CaptureReport>;

/** A capture that records what it was asked and answers with `answer(input)`. */
function capturer(answer: (input: Capture) => Answer | Promise<Answer> = () => ({})) {
  const asked: Capture[] = [];
  const capture: Capturer = async (input) => {
    asked.push(input);
    return { errors: [], rendered: REF, reference: REF, ...(await answer(input)) };
  };
  return { asked, capture };
}

async function run(
  loaded = writtenLoaded(),
  capture: Capturer = capturer().capture,
  build = catalog({ shown: ['Button.1'] }),
) {
  const examples = await parseExamples(fakeBundler(), loaded.kit);
  return lookStep({ loaded, build, dir: ACME_CATALOG, examples, capture });
}

const NO_ICON_REFERENCE = {
  step: 'look',
  path: 'components.1',
  key: 'kitIssue.lookNoReference',
  params: { component: 'Icon' },
};

test('an example that looks like its reference passes; a component without one is only advice', async () => {
  const shop = capturer();
  const result = await run(writtenLoaded(), shop.capture);
  assert.deepEqual(result, {
    state: 'passed',
    issues: [NO_ICON_REFERENCE],
    look: [{ key: 'Button.1', score: 100, size: 100, colour: 100, structure: 100 }],
  });
  assert.deepEqual(shop.asked, [
    {
      page: catalog().path,
      search: '?example=Button.1',
      width: 1280,
      height: 900,
      shot: join(ACME_CATALOG, 'look', 'Button.1.png'),
      reference: join(writtenLoaded().dir, 'source', 'web', '1-1280', 'crops', 'button-0.png'),
    },
  ]);
});

test('a reference cut from the phone scan is compared at 390 px', async () => {
  const shop = capturer();
  await run(writtenLoaded('source/web/1-390/crops/button-0.png'), shop.capture);
  assert.equal(shop.asked[0]?.width, 390);
  // The Figma and image references are desktop ones.
  const other = capturer();
  await run(writtenLoaded('source/refs/Button.1.png'), other.capture);
  assert.equal(other.asked[0]?.width, 1280);
});

test('an example far from its reference fails the step with the three parts', async () => {
  const far: Pixels = solid(40, 20, [50, 50, 200]);
  const shop = capturer(() => ({ rendered: far }));
  const result = await run(writtenLoaded(), shop.capture);
  const score = lookScore(REF, far);
  assert.ok(score.score < 90);
  assert.equal(result.state, 'failed');
  assert.deepEqual(result.look, [{ key: 'Button.1', ...score }]);
  assert.deepEqual(result.issues, [
    {
      step: 'look',
      path: 'components.0.examples.0',
      key: 'kitIssue.lookFar',
      params: {
        key: 'Button.1',
        score: score.score,
        size: score.size,
        colour: score.colour,
        structure: score.structure,
      },
    },
    NO_ICON_REFERENCE,
  ]);
});

test('an image that could not be read is reported at the example, with the browser words', async () => {
  const missing = capturer(() => ({
    reference: undefined,
    errors: ['reference.png: not an image'],
  }));
  const first = await run(writtenLoaded(), missing.capture);
  assert.equal(first.state, 'failed');
  assert.deepEqual(first.look, []);
  assert.deepEqual(first.issues[0], {
    step: 'look',
    path: 'components.0.examples.0',
    key: 'kitIssue.lookUnreadable',
    params: { key: 'Button.1', detail: 'reference.png: not an image' },
  });

  const blank = capturer(() => ({ rendered: undefined }));
  const second = await run(writtenLoaded(), blank.capture);
  assert.deepEqual(second.issues[0]?.params, { key: 'Button.1', detail: 'no image' });

  const broken = capturer(() => {
    throw new Error('the page crashed');
  });
  const third = await run(writtenLoaded(), broken.capture);
  assert.equal(third.state, 'failed');
  assert.deepEqual(third.issues[0]?.params, { key: 'Button.1', detail: 'the page crashed' });
});

test('a kit with no reference at all passes with one note per component', async () => {
  const shop = capturer();
  const result = await run(writtenLoaded(null), shop.capture);
  assert.equal(result.state, 'passed');
  assert.deepEqual(
    result.issues.map((issue) => [issue.key, issue.path, issue.params.component]),
    [
      ['kitIssue.lookNoReference', 'components.0', 'Button'],
      ['kitIssue.lookNoReference', 'components.1', 'Icon'],
    ],
  );
  assert.deepEqual(result.look, []);
  assert.deepEqual(shop.asked, []);
});

test('a kit that is not written, or a catalog that did not build, is skipped', async () => {
  const shop = capturer();
  const builtin = tinyLoaded();
  const examples = await parseExamples(fakeBundler(), builtin.kit);
  const skipped = { state: 'skipped', issues: [], look: [] };
  assert.deepEqual(
    await lookStep({
      loaded: builtin,
      build: catalog({ shown: ['Button.1'] }),
      dir: ACME_CATALOG,
      examples,
      capture: shop.capture,
    }),
    skipped,
  );
  assert.deepEqual(await run(writtenLoaded(), shop.capture, catalog({ built: false })), skipped);
  assert.deepEqual(shop.asked, []);
});

test('an example the build left out is the render step to report, not this one', async () => {
  const shop = capturer();
  const result = await run(
    writtenLoaded(),
    shop.capture,
    catalog({ shown: [], skipped: ['Button.1'] }),
  );
  assert.equal(result.state, 'passed');
  assert.deepEqual(shop.asked, []);
  assert.deepEqual(result.look, []);
});
