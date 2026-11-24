import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EditorState, LiveItem } from '../../../../../client/studio/edit/store.ts';
import {
  isEmpty,
  LOCK_RULE,
  lockItems,
  locksModel,
  locksSlugOf,
  MAX_VIEW_IDS,
  readView,
  restoreAsk,
  viewToSave,
  withLockItems,
} from '../../../../../client/studio/edit/view/model.ts';
import { MAX_VIEW_IDS as SERVER_MAX } from '../../../../../src/drafts/index.ts';

const BADGE = 'sections/Hero:section/Badge';
const BUTTON = 'sections/Hero:section/Button';

const state = (over: Partial<EditorState> = {}) => ({
  on: true,
  selection: [] as string[],
  locked: [] as string[],
  lockChanged: [] as string[],
  refused: null as EditorState['refused'],
  ...over,
});

test('the client keeps the same list limit as the server', () => {
  assert.equal(MAX_VIEW_IDS, SERVER_MAX);
});

test('a view answer is read, and anything else is not', () => {
  const view = { locked: [BADGE], hidden: [], changed: [BADGE], lost: [] };
  assert.deepEqual(readView(view), view);
  assert.equal(readView({ ...view, lost: [1] }), null);
  assert.equal(readView(null), null);
});

test('a locks event names its draft', () => {
  assert.equal(locksSlugOf({ event: 'locks', data: '{"slug":"shop","changed":[]}' }), 'shop');
  assert.equal(locksSlugOf({ event: 'source', data: '{"slug":"shop"}' }), undefined);
  assert.equal(locksSlugOf({ event: 'locks', data: 'nope' }), undefined);
});

test('the saved lists keep a lost lock until the person deals with it', () => {
  const saved = viewToSave({ locked: [BADGE], hidden: [BUTTON, BUTTON] }, [BADGE, 'old:1']);
  assert.deepEqual(saved, { locked: [BADGE, 'old:1'], hidden: [BUTTON] });
});

test('each changed lock is a Live item to fix on its element, put back when the live checks drop it', () => {
  const items = lockItems([BADGE, BADGE], 'changed');
  assert.deepEqual(items, [
    {
      id: BADGE,
      rule: LOCK_RULE,
      severity: 'fix',
      width: null,
      message: 'changed',
      source: 'code',
    },
  ]);
  const other: LiveItem = {
    id: BUTTON,
    rule: 'a11y/target-size',
    severity: 'review',
    width: 390,
    message: 'small',
    source: 'frame',
  };
  const live = withLockItems([other], items);
  assert.deepEqual(live, [other, ...items]);
  // Already there: nothing to write, so no loop of store changes.
  assert.equal(withLockItems(live ?? [], items), null);
  // A lock restored: its item goes.
  assert.deepEqual(withLockItems(live ?? [], []), [other]);
});

test('the locks box offers Restore on a changed lock that is selected', () => {
  const model = locksModel(
    state({ selection: [BADGE], locked: [BADGE], lockChanged: [BADGE] }),
    [],
  );
  assert.deepEqual(model.changed, { id: BADGE, name: 'Hero / Badge' });
  assert.equal(isEmpty(model), false);
  // Unlocked meanwhile, or not editing: nothing to restore.
  assert.equal(locksModel(state({ selection: [BADGE], lockChanged: [BADGE] }), []).changed, null);
  assert.ok(isEmpty(locksModel(state({ on: false, lockChanged: [BADGE] }), [BADGE])));
});

test('a lost lock is locked again on a selection that is not locked yet', () => {
  const lost = ['sections/Hero:section/Old'];
  assert.equal(locksModel(state(), lost).canLockAgain, false);
  assert.equal(locksModel(state({ selection: [BUTTON] }), lost).canLockAgain, true);
  assert.equal(
    locksModel(state({ selection: [BUTTON], locked: [BUTTON] }), lost).canLockAgain,
    false,
  );
  assert.deepEqual(locksModel(state(), lost).lost, [{ id: lost[0], name: 'Hero / Old' }]);
});

test('an edit a lock refused offers Unlock when its own element is the locked one', () => {
  const refusedOn = (id: string): EditorState['refused'] => ({
    gesture: { ops: [{ op: 'removeElement', id }], label: 'Delete' },
    index: 0,
    reason: 'locked',
  });
  assert.deepEqual(locksModel(state({ locked: [BADGE], refused: refusedOn(BADGE) }), []).refused, {
    unlock: BADGE,
  });
  // An ancestor of a locked element: nothing of its own to unlock.
  assert.deepEqual(
    locksModel(state({ locked: [BADGE], refused: refusedOn('sections/Hero:section') }), []).refused,
    { unlock: null },
  );
});

test("Claude's words for a restore name the element, the missing names and the source", () => {
  const words = restoreAsk(BADGE, ['price'], '<Badge>{price}</Badge>');
  assert.match(words, /locked element sections\/Hero:section\/Badge/);
  assert.match(words, /lacks price/);
  assert.ok(words.endsWith('<Badge>{price}</Badge>'));
  assert.ok(restoreAsk(BADGE, ['x'], 'y'.repeat(5_000)).length <= 1_000);
});
