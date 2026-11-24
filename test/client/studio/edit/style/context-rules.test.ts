import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BAR_STATES,
  breakpointsOf,
  contextWidthOf,
  forceBody,
  forceOf,
  previewApplies,
  restContext,
  stateName,
  widthWords,
} from '../../../../../client/studio/edit/style/context-rules.ts';

test('without kit breakpoints the context uses 768 and 1280, sorted and once each', () => {
  assert.deepEqual(breakpointsOf(null), [768, 1280]);
  assert.deepEqual(breakpointsOf({}), [768, 1280]);
  assert.deepEqual(breakpointsOf({ breakpoints: [] }), [768, 1280]);
  assert.deepEqual(breakpointsOf({ breakpoints: [1024, 640, 1024] }), [640, 1024]);
});

test('an edit applies from the largest breakpoint at or below the edit card', () => {
  const kit = [768, 1280];
  assert.equal(contextWidthOf(390, kit), null, 'the base width edits every width');
  assert.equal(contextWidthOf(320, kit), null);
  assert.equal(contextWidthOf(700, kit), null, 'below the first breakpoint');
  assert.equal(contextWidthOf(768, kit), 768);
  assert.equal(contextWidthOf(1000, kit), 768);
  assert.equal(contextWidthOf(1280, kit), 1280);
  assert.equal(contextWidthOf(2400, kit), 1280);
  assert.equal(contextWidthOf(800, [640, 1024]), 640, "the kit's own breakpoints");
  assert.equal(contextWidthOf(390, [360]), null, 'the base preset still edits every width');
});

test('a preview shows in the cards from its width up', () => {
  assert.equal(previewApplies(390, null), true);
  assert.equal(previewApplies(390, 768), false);
  assert.equal(previewApplies(768, 768), true);
  assert.equal(previewApplies(1280, 768), true);
});

test('the state bar is Default, Hover, Focus and Active; Focus forces focus', () => {
  assert.deepEqual(BAR_STATES.map(stateName), ['default', 'hover', 'focus', 'active']);
  assert.equal(forceOf('focus-visible'), 'focus');
  assert.equal(forceOf('hover'), 'hover');
  assert.equal(forceOf(null), null);
});

test('a state forces itself on the selection; the resting state forces nothing', () => {
  assert.deepEqual(forceBody(['sections/Hero:a'], 'focus-visible'), {
    type: 'force',
    ids: ['sections/Hero:a'],
    state: 'focus',
  });
  assert.deepEqual(forceBody(['sections/Hero:a'], null), { type: 'force', ids: [], state: null });
  assert.deepEqual(forceBody([], 'hover'), { type: 'force', ids: [], state: null });
});

test('the bar says All widths at the base, and "768 and up" from a breakpoint', () => {
  assert.deepEqual(widthWords(null), { key: 'context.width.all', params: {} });
  assert.deepEqual(widthWords(768), { key: 'context.width.up', params: { width: 768 } });
});

test('another selection or leaving Edit lets the state rest; the width stays', () => {
  const hover = { width: 768, state: 'hover' as const };
  const before = { on: true, selection: ['a'], context: hover };
  assert.deepEqual(restContext({ ...before, selection: ['b'] }, before), {
    width: 768,
    state: null,
  });
  assert.deepEqual(restContext({ ...before, on: false }, before), { width: 768, state: null });
  assert.equal(restContext({ ...before, selection: ['a'] }, before), null, 'the same ids');
  const resting = { ...before, context: { width: 768, state: null } };
  assert.equal(restContext({ ...resting, selection: ['b'] }, resting), null);
});
