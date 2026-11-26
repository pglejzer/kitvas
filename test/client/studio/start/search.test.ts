import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matches, normalise, wordsOf } from '../../../../client/studio/start/search.ts';

test('case and accents do not matter', () => {
  assert.equal(normalise('Café ŻÓW'), 'cafe zow');
  assert.ok(matches('cafe', 'The Café page'));
  assert.ok(matches('CAFÉ', 'cafe'));
});

test('every typed word must be in the card, in any order', () => {
  const card = 'Pricing page pricing mui MUI Material screen Screen';
  assert.ok(matches('mui pricing', card));
  assert.ok(matches('pricing mui', card));
  assert.ok(!matches('mui checkout', card));
  assert.ok(matches('pric', card), 'a part of a word counts');
});

test('the kit name, the kit id and the kind are searchable words of a card', () => {
  const card = 'Shop shop Material UI mui screen Screen';
  assert.ok(matches('material', card));
  assert.ok(matches('mui', card));
  assert.ok(matches('screen', card));
  assert.ok(!matches('rework', card));
});

test('an empty or blank query matches everything', () => {
  assert.deepEqual(wordsOf('   '), []);
  assert.ok(matches('', 'anything'));
  assert.ok(matches('  ', ''));
  assert.deepEqual(wordsOf('  Two   words '), ['two', 'words']);
});
