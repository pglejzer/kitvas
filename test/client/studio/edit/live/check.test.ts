import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFullCheck,
  type FullCheckIo,
  type FullCheckStatus,
  fullCheckEnd,
} from '../../../../../client/studio/edit/live/check.ts';
import type { StreamEvent } from '../../../../../client/studio/live/sse.ts';

const SLUG = 'pricing';

const job = (data: Record<string, unknown>): StreamEvent => ({
  event: 'job',
  data: JSON.stringify({ id: 'j1', kind: 'check', slug: SLUG, state: 'running', ...data }),
});

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

test("the full check's end is the end of a check job of this draft", () => {
  assert.equal(fullCheckEnd(job({ state: 'succeeded' }), SLUG, 'j1'), 'succeeded');
  assert.equal(fullCheckEnd(job({ state: 'failed' }), SLUG, 'j1'), 'failed');
  assert.equal(fullCheckEnd(job({ state: 'cancelled' }), SLUG, null), 'failed');
  assert.equal(fullCheckEnd(job({ state: 'running' }), SLUG, 'j1'), null);
  assert.equal(fullCheckEnd(job({ state: 'succeeded', kind: 'build' }), SLUG, 'j1'), null);
  assert.equal(fullCheckEnd(job({ state: 'succeeded', slug: 'other' }), SLUG, 'j1'), null);
  assert.equal(fullCheckEnd(job({ state: 'succeeded', id: 'j2' }), SLUG, 'j1'), null);
  // A job started elsewhere (the answer was 409) ends the wait too.
  assert.equal(fullCheckEnd(job({ state: 'succeeded', id: 'j2' }), SLUG, null), 'succeeded');
  assert.equal(fullCheckEnd({ event: 'build', data: '{}' }, SLUG, null), null);
});

function check(answer: Awaited<ReturnType<FullCheckIo['post']>>, swapped = true) {
  const seen: FullCheckStatus[] = [];
  let posts = 0;
  let swaps = 0;
  const full = createFullCheck(
    SLUG,
    {
      post: async () => {
        posts += 1;
        return answer;
      },
      swap: async () => {
        swaps += 1;
        return swapped;
      },
    },
    (status) => seen.push(status),
  );
  return { full, seen, posts: () => posts, swaps: () => swaps };
}

test('Save starts the check; when its job ends, the Checks pane is swapped and it is done', async () => {
  const { full, seen, posts, swaps } = check({ ok: true, job: 'j1' });
  await full.start();
  assert.equal(posts(), 1);
  assert.equal(full.status(), 'running');
  full.hear(job({ state: 'succeeded', id: 'other-job' }));
  full.hear(job({ state: 'running' }));
  await flush();
  assert.equal(swaps(), 0);
  full.hear(job({ state: 'succeeded' }));
  await flush();
  assert.equal(swaps(), 1);
  assert.deepEqual(seen, ['running', 'done']);
  // Once done, later events change nothing.
  full.hear(job({ state: 'succeeded' }));
  await flush();
  assert.equal(swaps(), 1);
});

test('a check that is already running is waited for instead of failing', async () => {
  const { full, seen } = check({ ok: false, status: 409 });
  await full.start();
  assert.equal(full.status(), 'running');
  full.hear(job({ state: 'succeeded', id: 'started-by-claude' }));
  await flush();
  assert.deepEqual(seen, ['running', 'done']);
});

test('a refused start, a failed job or a pane that could not be read is a failed check', async () => {
  const refused = check({ ok: false, status: 500 });
  await refused.full.start();
  assert.deepEqual(refused.seen, ['running', 'failed']);

  const failed = check({ ok: true, job: 'j1' });
  await failed.full.start();
  failed.full.hear(job({ state: 'failed' }));
  await flush();
  assert.deepEqual(failed.seen, ['running', 'failed']);
  // The pane is swapped anyway: a failed check still writes what it found.
  assert.equal(failed.swaps(), 1);

  const unread = check({ ok: true, job: 'j1' }, false);
  await unread.full.start();
  unread.full.hear(job({ state: 'succeeded' }));
  await flush();
  assert.deepEqual(unread.seen, ['running', 'failed']);
});
