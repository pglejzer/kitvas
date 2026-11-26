import assert from 'node:assert/strict';
import { test } from 'node:test';
import { covers, kitHolds } from '../../../../../../client/studio/edit/props/context/state-held.ts';
import { createStore } from '../../../../../../client/studio/edit/store.ts';

const ID = 'sections/Plans:Stack/Card/Button';

test("the kit's longhands name the editor's properties they set", () => {
  assert.equal(covers('background-color', 'background-color'), true);
  assert.equal(covers('padding', 'padding-top'), true);
  assert.equal(covers('padding-block', 'padding-bottom'), true);
  assert.equal(covers('padding-block', 'padding-left'), false);
  assert.equal(covers('padding-inline', 'padding-right'), true);
  assert.equal(covers('border-color', 'border-top-color'), true);
  assert.equal(covers('border-width', 'border-inline-start-width'), true);
  assert.equal(covers('border-radius', 'border-top-left-radius'), true);
  assert.equal(covers('gap', 'column-gap'), true);
  assert.equal(covers('color', 'background-color'), false);
  assert.equal(covers('border-color', 'outline-color'), false);
});

test('a row is held only for the selected element in the state it was asked for', () => {
  const store = createStore('shop');
  const held = { id: ID, state: 'hover' as const, longhands: ['background-color'] };
  const at = (state: 'hover' | 'active' | null) => ({ width: null, state, option: null });
  store.set({ selection: [ID], context: at('hover'), stateHeld: held });
  assert.equal(kitHolds(store.get(), 'background-color'), true);
  assert.equal(kitHolds(store.get(), 'color'), false);
  store.set({ context: at('active') });
  assert.equal(kitHolds(store.get(), 'background-color'), false);
  store.set({ context: at('hover'), selection: ['sections/Plans:Stack'] });
  assert.equal(kitHolds(store.get(), 'background-color'), false);
  store.set({ selection: [ID], context: at(null) });
  assert.equal(kitHolds(store.get(), 'background-color'), false);
});
