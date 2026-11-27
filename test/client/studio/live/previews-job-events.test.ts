import assert from 'node:assert/strict';
import { test } from 'node:test';
import { endedJobSlug, needsRefresh } from '../../../../client/studio/live/job-events.ts';

const job = (fields: Record<string, unknown>) => ({ event: 'job', data: JSON.stringify(fields) });

test("a previews job makes a kit's Insert pane previews, so it refreshes no page", () => {
  for (const state of ['succeeded', 'failed']) {
    const previews = job({ kind: 'previews', slug: 'kitvas-ui', state, result: { cached: false } });
    assert.equal(endedJobSlug(previews), undefined, state);
    assert.equal(
      needsRefresh(previews, () => true),
      false,
      state,
    );
  }
});
