import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hold } from '../../../../client/frame/page/busy.ts';
import {
  type Bundle,
  createSwap,
  MAX_SWAPS,
  pagePorts,
  register,
  running,
  SWAP_TIMEOUT_MS,
  sameFile,
} from '../../../../client/frame/page/swap.ts';
import { fakeClock } from '../../../helpers/fake-clock.ts';

/** Lets every promise that can settle now settle. */
const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const bundle = (fields: Partial<Bundle> = {}): Bundle => ({
  states: ['default'],
  initial: 'default',
  mount: () => ({ render: () => undefined, unmount: () => undefined }),
  runtime: 'r1',
  ...fields,
});

type Options = {
  /** The page's own `idle`, in place of the fake gesture. */
  idle?: () => Promise<void>;
  /** The page cannot even start a sheet. */
  noSheet?: boolean;
};

/** A swap over a fake page. `log` is what the page was asked and what the studio heard, in order. */
function setup(options: Options = {}) {
  const clock = fakeClock();
  const log: string[] = [];
  const sheets: { live: number; load(ok: boolean): void }[] = [];
  const scripts: { live: number; end(): void }[] = [];
  let gesture: Promise<void> | null = null;
  const swap = createSwap({
    page: {
      idle: options.idle ?? (() => gesture ?? Promise.resolve()),
      sheet(live) {
        if (options.noSheet) throw new Error('no document');
        log.push(`sheet ${live}`);
        let load: (ok: boolean) => void = () => undefined;
        const loaded = new Promise<boolean>((resolve) => {
          load = resolve;
        });
        sheets.push({ live, load });
        return {
          loaded,
          use: () => {
            log.push(`use ${live}`);
          },
          drop: () => {
            log.push(`drop ${live}`);
          },
        };
      },
      script(live) {
        log.push(`script ${live}`);
        return new Promise((resolve) => {
          scripts.push({ live, end: resolve });
        });
      },
      after: (ms, fn) => clock.after(ms, fn),
    },
    runtime: 'r1',
    take(handed, sheet) {
      if (handed.initial === 'broken') throw new Error('the render cannot be replaced');
      sheet.use();
      log.push(`take ${handed.initial}`);
    },
    answer: (live, step) => {
      log.push(`${step} ${live}`);
    },
  });
  return {
    clock,
    log,
    sheets,
    scripts,
    swap,
    /** A gesture begins on the page; the function it returns ends it. */
    startGesture(): () => void {
      let end: () => void = () => undefined;
      gesture = new Promise<void>((resolve) => {
        end = resolve;
      });
      return () => {
        gesture = null;
        end();
      };
    },
    /** The sheet of the build asked for last loads. */
    async sheetLoads(ok = true): Promise<void> {
      sheets.at(-1)?.load(ok);
      await settled();
    },
    /** The script that runs now hands `handed` over (when given one) and ends. */
    async scriptRuns(handed?: Bundle): Promise<void> {
      if (handed) swap.hand(handed);
      scripts.at(-1)?.end();
      await settled();
    },
    /** One whole swap of build `live` with nothing in its way. */
    async takes(live: number): Promise<void> {
      swap.ask(live);
      await settled();
      sheets.at(-1)?.load(true);
      await settled();
      swap.hand(bundle());
      scripts.at(-1)?.end();
      await settled();
    },
  };
}

test('a build is taken: its sheet loads, its bundle runs, and the studio hears ready once', async () => {
  const page = setup();
  page.swap.ask(1);
  await settled();
  assert.deepEqual(page.log, ['sheet 1'], 'no script before the sheet is there');
  await page.sheetLoads();
  assert.deepEqual(page.log, ['sheet 1', 'script 1']);
  await page.scriptRuns(bundle());
  assert.deepEqual(page.log, ['sheet 1', 'script 1', 'use 1', 'take default', 'ready 1']);
  assert.equal(page.clock.pending(), 0, 'no timer is left behind');
});

test('a bundle made with another frame runtime is not taken', async () => {
  const page = setup();
  page.swap.ask(1);
  await settled();
  await page.sheetLoads();
  await page.scriptRuns(bundle({ runtime: 'r2' }));
  assert.deepEqual(page.log, ['sheet 1', 'script 1', 'drop 1', 'failed 1']);
});

test('a sheet that cannot load fails the swap, and no script runs', async () => {
  const page = setup();
  page.swap.ask(1);
  await settled();
  await page.sheetLoads(false);
  assert.deepEqual(page.log, ['sheet 1', 'drop 1', 'failed 1']);
});

test('a sheet that does not come in time fails the swap', async () => {
  const page = setup();
  page.swap.ask(1);
  await settled();
  page.clock.advance(SWAP_TIMEOUT_MS - 1);
  await settled();
  assert.deepEqual(page.log, ['sheet 1']);
  page.clock.advance(1);
  await settled();
  assert.deepEqual(page.log, ['sheet 1', 'drop 1', 'failed 1']);
});

test('a script that ran and handed nothing over fails the swap', async () => {
  const page = setup();
  page.swap.ask(1);
  await settled();
  await page.sheetLoads();
  await page.scriptRuns();
  assert.deepEqual(page.log, ['sheet 1', 'script 1', 'drop 1', 'failed 1']);
});

test('a bundle that does not come in time fails the swap, and a late one is dropped', async () => {
  const page = setup();
  page.swap.ask(1);
  await settled();
  await page.sheetLoads();
  page.clock.advance(SWAP_TIMEOUT_MS);
  await settled();
  const failed = ['sheet 1', 'script 1', 'drop 1', 'failed 1'];
  assert.deepEqual(page.log, failed);
  await page.scriptRuns(bundle());
  assert.deepEqual(page.log, failed, 'nothing is taken after the answer');
});

test('a render that cannot be replaced fails the swap', async () => {
  const page = setup();
  page.swap.ask(1);
  await settled();
  await page.sheetLoads();
  await page.scriptRuns(bundle({ initial: 'broken' }));
  assert.deepEqual(page.log, ['sheet 1', 'script 1', 'drop 1', 'failed 1']);
});

test('a page that cannot start the sheet fails the swap', async () => {
  const page = setup({ noSheet: true });
  page.swap.ask(1);
  await settled();
  assert.deepEqual(page.log, ['failed 1']);
});

test('a failed swap leaves the page able to take the next build', async () => {
  const page = setup();
  page.swap.ask(1);
  await settled();
  await page.sheetLoads(false);
  await page.takes(2);
  assert.deepEqual(page.log.slice(-3), ['use 2', 'take default', 'ready 2']);
});

test('under a gesture nothing is loaded: the studio hears held, then free', async () => {
  const page = setup();
  const end = page.startGesture();
  page.swap.ask(1);
  await settled();
  assert.deepEqual(page.log, ['held 1']);
  end();
  await settled();
  assert.deepEqual(page.log, ['held 1', 'free 1'], 'the frame takes nothing on its own');
  // The studio asks again.
  page.swap.ask(1);
  await settled();
  assert.deepEqual(page.log, ['held 1', 'free 1', 'sheet 1']);
});

test('a gesture that begins while the build loads keeps its page: the bundle is dropped', async () => {
  const page = setup();
  page.swap.ask(1);
  await settled();
  await page.sheetLoads();
  const end = page.startGesture();
  await page.scriptRuns(bundle());
  assert.deepEqual(page.log, ['sheet 1', 'script 1', 'held 1']);
  end();
  await settled();
  assert.deepEqual(page.log, ['sheet 1', 'script 1', 'held 1', 'drop 1', 'free 1']);
});

test('a build asked for under a gesture is held too, and the newest one is the one set free', async () => {
  const page = setup();
  const end = page.startGesture();
  page.swap.ask(1);
  await settled();
  page.swap.ask(2);
  assert.deepEqual(page.log, ['held 1', 'held 2']);
  end();
  await settled();
  assert.deepEqual(page.log, ['held 1', 'held 2', 'free 2']);
});

test('a newer build replaces the one whose sheet loads, which never answers', async () => {
  const page = setup();
  page.swap.ask(1);
  await settled();
  page.swap.ask(2);
  await page.sheetLoads();
  assert.deepEqual(page.log, ['sheet 1', 'drop 1', 'sheet 2']);
  await page.sheetLoads();
  await page.scriptRuns(bundle());
  assert.deepEqual(page.log.slice(3), ['script 2', 'use 2', 'take default', 'ready 2']);
});

test('a newer build replaces the one whose bundle runs: that bundle is not taken', async () => {
  const page = setup();
  page.swap.ask(1);
  await settled();
  await page.sheetLoads();
  page.swap.ask(2);
  await page.scriptRuns(bundle({ initial: 'older' }));
  assert.deepEqual(page.log, ['sheet 1', 'script 1', 'drop 1', 'sheet 2']);
});

test('of several builds asked for meanwhile only the last one is taken', async () => {
  const page = setup();
  page.swap.ask(1);
  await settled();
  page.swap.ask(2);
  page.swap.ask(3);
  await page.sheetLoads();
  assert.deepEqual(page.log, ['sheet 1', 'drop 1', 'sheet 3']);
});

test('a document takes a set number of builds, then gives the page up', async () => {
  const page = setup();
  for (let live = 1; live <= MAX_SWAPS; live += 1) await page.takes(live);
  assert.equal(page.log.filter((line) => line.startsWith('ready ')).length, MAX_SWAPS);
  const before = page.log.length;
  page.swap.ask(MAX_SWAPS + 1);
  await settled();
  assert.deepEqual(page.log.slice(before), [`failed ${MAX_SWAPS + 1}`], 'nothing is loaded');
});

test('a bundle handed over when none was asked for is dropped', async () => {
  const page = setup();
  page.swap.hand(bundle());
  await settled();
  assert.deepEqual(page.log, []);
});

test("the page's own gestures hold a swap (busy.ts)", async () => {
  const page = setup({ idle: pagePorts().idle });
  const end = hold();
  page.swap.ask(1);
  await settled();
  assert.deepEqual(page.log, ['held 1']);
  end();
  await settled();
  assert.deepEqual(page.log, ['held 1', 'free 1']);
  page.swap.ask(1);
  await settled();
  assert.deepEqual(page.log, ['held 1', 'free 1', 'sheet 1'], 'no gesture: the build loads');
});

test('two addresses name one file whatever their queries say', () => {
  const sheet = 'http://kitvas.localhost:5174/f/key/shop/v2/css/index.css';
  assert.equal(sameFile(sheet, `${sheet}?live=3`), true);
  assert.equal(sameFile(`${sheet}?live=2`, `${sheet}?live=3#x`), true);
  assert.equal(sameFile(sheet, sheet.replace('/v2/', '/v3/')), false);
  assert.equal(sameFile(sheet, sheet.replace(':5174', ':5180')), false);
  assert.equal(sameFile(sheet, 'not an address'), false);
  assert.equal(sameFile('', ''), false);
});

test('the first runtime of a document is found by the bundles that run in it later', () => {
  const scope: { __KITVAS_FRAME__?: (handed: Bundle) => void } = {};
  assert.equal(running(scope), undefined, 'a fresh document runs none');
  const handed: Bundle[] = [];
  register((one) => {
    handed.push(one);
  }, scope);
  const first = bundle();
  running(scope)?.(first);
  assert.deepEqual(handed, [first]);
});
