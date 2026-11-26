import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { matchPolicy } from '../../../src/checks/app/match-page.ts';
import {
  type Browser,
  LOOK_LINE,
  type Match,
  type MatchReport,
  PIXELS_MAX,
  type Pixels,
} from '../../../src/checks/index.ts';
import { compareHandoff } from '../../../src/handoff/app/code/compare.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { shopDraft } from '../../helpers/drafts.ts';

const lookup = async (): Promise<string[]> => ['93.184.216.34'];

/** A browser whose `match` answers as `answer` says and keeps every call it was given. */
function fakeBrowser(answer: (input: Match) => MatchReport): { browser: Browser; seen: Match[] } {
  const seen: Match[] = [];
  const browser: Browser = {
    open: async () => ({
      name: 'fake',
      visit: async () => {
        throw new Error('a comparison makes no visit');
      },
      match: async (input) => {
        seen.push(input);
        return answer(input);
      },
      close: async () => undefined,
    }),
  };
  return { browser, seen };
}

/** An image of one colour, or of two halves (the left one in `left`). */
function image(width: number, height: number, left: number, right = left): Pixels {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = x < width / 2 ? left : right;
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

/** The draft `shop` with its brief written and a check shot at each of the widths. */
function draft(widths: number[] = [1280, 390]) {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/handoff/code/brief.json', '{}');
  for (const width of widths) store.writeText('shop', `v1/build/shots/filled-${width}.png`, 'png');
  return store;
}

const INPUT = {
  slug: 'shop',
  url: 'http://127.0.0.1:5173/pricing',
  widths: [1280],
  selector: null,
  state: 'filled',
  allowPrivate: false,
};

const outcome = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof KitvasError) return { code: error.code, params: error.params };
    throw error;
  }
  return undefined;
};

test('a page like the reference is scored at the line and passes', async () => {
  const drafts = draft();
  const { browser, seen } = fakeBrowser(() => ({
    state: 'matched',
    rendered: image(40, 30, 255),
    reference: image(40, 30, 255),
    scale: 1,
  }));
  const compared = await compareHandoff({ drafts, browser, lookup }, INPUT);
  assert.equal(compared.passed, true);
  const [result] = compared.results;
  assert.equal(result?.state, 'scored');
  if (result?.state !== 'scored') return;
  assert.equal(result.width, 1280);
  assert.equal(result.score, 100);
  assert.equal(result.line, LOOK_LINE);
  assert.equal(result.scale, 1);
  assert.ok(result.shot.endsWith(join('v1', 'handoff', 'code', 'shots', '1280.png')));
  assert.ok(result.reference.endsWith(join('v1', 'build', 'shots', 'filled-1280.png')));
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.width, 1280);
  assert.equal(seen[0]?.height, 900);
  assert.equal(seen[0]?.selector, null);
  assert.equal(seen[0]?.maxPixels, PIXELS_MAX);
  assert.equal(seen[0]?.url, INPUT.url);
  assert.equal(seen[0]?.shot, result.shot);
  assert.equal(seen[0]?.reference, result.reference);
});

test('the phone width has its own window and its own shot', async () => {
  const drafts = draft();
  const { browser, seen } = fakeBrowser(() => ({
    state: 'matched',
    rendered: image(8, 8, 255),
    reference: image(8, 8, 255),
    scale: 1,
  }));
  const compared = await compareHandoff(
    { drafts, browser, lookup },
    { ...INPUT, widths: [1280, 390, 390] },
  );
  assert.deepEqual(
    compared.results.map((result) => result.width),
    [1280, 390],
  );
  assert.deepEqual(
    seen.map((call) => [call.width, call.height]),
    [
      [1280, 900],
      [390, 844],
    ],
  );
});

test('a width the draft was never checked at is no-reference, and no browser is started for it', async () => {
  const drafts = draft([1280]);
  const { browser, seen } = fakeBrowser(() => ({ state: 'failed', error: 'not asked' }));
  const compared = await compareHandoff(
    { drafts, browser, lookup },
    { ...INPUT, widths: [390], state: 'filled' },
  );
  assert.deepEqual(compared, {
    results: [{ width: 390, state: 'no-reference', detail: 'v1/build/shots/filled-390.png' }],
    passed: false,
  });
  assert.equal(seen.length, 0);
});

test('a state with no check shots is no-reference at every width', async () => {
  const drafts = draft();
  const { browser } = fakeBrowser(() => ({ state: 'failed', error: 'not asked' }));
  const compared = await compareHandoff(
    { drafts, browser, lookup },
    { ...INPUT, widths: [1280, 390], state: 'empty' },
  );
  assert.deepEqual(
    compared.results.map((result) => result.state),
    ['no-reference', 'no-reference'],
  );
  assert.equal(compared.passed, false);
});

test('a page 9,000 px tall is scaled and scored low on size, never skipped and never high', async () => {
  const drafts = draft();
  const { browser } = fakeBrowser(() => ({
    state: 'matched',
    rendered: image(40, 120, 255),
    reference: image(40, 40, 255),
    scale: 0.589,
  }));
  const compared = await compareHandoff({ drafts, browser, lookup }, INPUT);
  const [result] = compared.results;
  assert.equal(result?.state, 'scored');
  if (result?.state !== 'scored') return;
  assert.equal(result.scale, 0.589);
  assert.ok(result.size < LOOK_LINE, `size ${result.size}`);
  assert.ok(result.score < LOOK_LINE, `score ${result.score}`);
  assert.equal(compared.passed, false);
});

test('a login page where the screen should be is a low score, not a pass', async () => {
  const drafts = draft();
  const { browser } = fakeBrowser(() => ({
    state: 'matched',
    rendered: image(64, 48, 255),
    reference: image(64, 48, 0, 255),
    scale: 1,
  }));
  const compared = await compareHandoff({ drafts, browser, lookup }, INPUT);
  const [result] = compared.results;
  assert.equal(result?.state, 'scored');
  if (result?.state !== 'scored') return;
  assert.ok(result.score < LOOK_LINE, `score ${result.score}`);
  assert.equal(compared.passed, false);
});

test('a selector goes to the browser; one that matches nothing is missing, with no score', async () => {
  const drafts = draft();
  const { browser, seen } = fakeBrowser((input) => ({
    state: 'missing',
    selector: input.selector ?? '',
  }));
  const compared = await compareHandoff(
    { drafts, browser, lookup },
    { ...INPUT, selector: '#screen' },
  );
  assert.equal(seen[0]?.selector, '#screen');
  assert.deepEqual(compared, {
    results: [{ width: 1280, state: 'missing', detail: '#screen' }],
    passed: false,
  });
});

test('a server that is down is failed, with the browser own words', async () => {
  const drafts = draft();
  const { browser } = fakeBrowser(() => ({
    state: 'failed',
    error: 'page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5173/pricing',
  }));
  const compared = await compareHandoff({ drafts, browser, lookup }, INPUT);
  assert.deepEqual(compared.results, [
    {
      width: 1280,
      state: 'failed',
      detail: 'page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5173/pricing',
    },
  ]);
  assert.equal(compared.passed, false);
});

test('a redirect the browser refused is blocked with the address that was refused', async () => {
  const drafts = draft();
  const { browser } = fakeBrowser(() => ({ state: 'blocked', url: 'http://10.0.0.9/admin' }));
  const compared = await compareHandoff({ drafts, browser, lookup }, INPUT);
  assert.deepEqual(compared.results, [
    { width: 1280, state: 'blocked', detail: 'http://10.0.0.9/admin' },
  ]);
});

test('an address on the private network is blocked before a browser starts, unless allowed', async () => {
  const drafts = draft();
  const { browser, seen } = fakeBrowser(() => ({
    state: 'matched',
    rendered: image(8, 8, 255),
    reference: image(8, 8, 255),
    scale: 1,
  }));
  const lan = { ...INPUT, url: 'http://192.168.1.20:3000/' };
  const refused = await compareHandoff({ drafts, browser, lookup }, lan);
  assert.deepEqual(refused.results, [{ width: 1280, state: 'blocked', detail: lan.url }]);
  assert.equal(seen.length, 0);

  const allowed = await compareHandoff({ drafts, browser, lookup }, { ...lan, allowPrivate: true });
  assert.equal(allowed.results[0]?.state, 'scored');
  assert.equal(seen.length, 1);
  // The policy the browser got lets the person's own network through, and nothing it did not.
  assert.equal(await seen[0]?.policy(new URL('http://192.168.1.99/')), true);
});

test('an address that is not a web address is blocked', async () => {
  const drafts = draft();
  const { browser, seen } = fakeBrowser(() => ({ state: 'failed', error: 'not asked' }));
  for (const url of [
    'file:///C:/secret.html',
    'not a url',
    'ftp://127.0.0.1/',
    'http://u:p@127.0.0.1/',
  ]) {
    const compared = await compareHandoff({ drafts, browser, lookup }, { ...INPUT, url });
    assert.deepEqual(compared.results, [{ width: 1280, state: 'blocked', detail: url }], url);
  }
  assert.equal(seen.length, 0);
});

test('the policy: the machine itself passes without a flag, the private network does not', async () => {
  const policy = matchPolicy(async () => ['10.0.0.8'], false);
  for (const url of [
    'http://127.0.0.1:5173/',
    'http://127.1.2.3/',
    'http://localhost:3000/',
    'http://app.localhost:3000/',
    'http://[::1]:8080/',
    'https://93.184.216.34/',
  ]) {
    assert.equal(await policy(new URL(url)), true, url);
  }
  for (const url of [
    'http://10.0.0.5/',
    'http://192.168.0.1/',
    'http://169.254.169.254/latest/meta-data',
    'http://[fe80::1]/',
    'http://intranet.example/',
    'file:///etc/passwd',
    'http://user:pass@127.0.0.1/',
  ]) {
    assert.equal(await policy(new URL(url)), false, url);
  }
  const open = matchPolicy(async () => ['10.0.0.8'], true);
  assert.equal(await open(new URL('http://intranet.example/')), true);
  assert.equal(await open(new URL('file:///etc/passwd')), false);
  assert.equal(await open(new URL('http://user:pass@127.0.0.1/')), false);
  // A name that resolves to the public internet passes.
  assert.equal(await matchPolicy(lookup, false)(new URL('https://example.com/')), true);
});

test('before a brief exists the comparison refuses', async () => {
  const { store } = shopDraft();
  const { browser } = fakeBrowser(() => ({ state: 'failed', error: 'not asked' }));
  assert.deepEqual(await outcome(() => compareHandoff({ drafts: store, browser, lookup }, INPUT)), {
    code: 'HANDOFF_NO_BRIEF',
    params: { slug: 'shop', version: 1 },
  });
});

test('a state or a width that is not one is refused before anything is shot', async () => {
  const drafts = draft();
  const { browser, seen } = fakeBrowser(() => ({ state: 'failed', error: 'not asked' }));
  const deps = { drafts, browser, lookup };
  const code = async (input: typeof INPUT): Promise<unknown> =>
    ((await outcome(() => compareHandoff(deps, input))) as { code?: string } | undefined)?.code;
  assert.equal(await code({ ...INPUT, state: '../filled' }), 'HANDOFF_INVALID');
  assert.equal(await code({ ...INPUT, widths: [] }), 'HANDOFF_INVALID');
  assert.equal(await code({ ...INPUT, widths: [1280.5] }), 'HANDOFF_INVALID');
  assert.equal(await code({ ...INPUT, widths: [50] }), 'HANDOFF_INVALID');
  assert.equal(seen.length, 0);
});

test('a browser that cannot compare pages ends with BROWSER_MISSING', async () => {
  const drafts = draft();
  const browser: Browser = {
    open: async () => ({
      name: 'fake',
      visit: async () => {
        throw new Error('no visit');
      },
      close: async () => undefined,
    }),
  };
  assert.deepEqual(await outcome(() => compareHandoff({ drafts, browser, lookup }, INPUT)), {
    code: 'BROWSER_MISSING',
    params: {},
  });
});
