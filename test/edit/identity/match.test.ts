import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bestMatch,
  type ElementFacts,
  MATCH_THRESHOLD,
  matchScore,
  pathCloseness,
  propLikeness,
  textLikeness,
  wordsOf,
} from '../../../src/edit/domain/identity/match.ts';

const STACK = 'sections/Hero:section/Stack';

function facts(id: string, text: string, props: string[] = []): ElementFacts {
  const tag = (id.split('/').at(-1) ?? '').replace(/\.\d+$/, '');
  return { id, tag, words: wordsOf(text), props, source: `<${tag}>${text}</${tag}>` };
}

test('an element with the same source is found exactly, wherever it went', () => {
  const target = facts(`${STACK}/Text.3`, 'One');
  const before = [facts(`${STACK}/Text`, 'Two'), facts(`${STACK}/Text.2`, 'One')];
  assert.deepEqual(bestMatch(target, before), { id: `${STACK}/Text.2`, exact: true });
});

test('of two equal sources the one with the same id wins, then the closer path', () => {
  const target = facts(`${STACK}/Card/Text`, 'Same');
  const far = facts('sections/Hero:section/Text', 'Same');
  const near = facts(`${STACK}/Card/Text.2`, 'Same');
  const own = facts(`${STACK}/Card/Text`, 'Same');
  assert.deepEqual(bestMatch(target, [far, near, own]), { id: own.id, exact: true });
  assert.deepEqual(bestMatch(target, [far, near]), { id: near.id, exact: true });
});

test('a rewritten element is matched by its words, its props and its path', () => {
  const target = facts(`${STACK}/Text.2`, 'Fast delivery to your door, every day', ['size']);
  const before = [
    facts(`${STACK}/Text`, 'Prices that stay low', ['size']),
    facts(`${STACK}/Text.4`, 'Fast delivery to your door', ['size']),
  ];
  assert.deepEqual(bestMatch(target, before), { id: `${STACK}/Text.4`, exact: false });
});

test('no text in common is no match, and another tag never matches', () => {
  const target = facts(`${STACK}/Text`, 'Hello there');
  assert.equal(bestMatch(target, [facts(`${STACK}/Text.2`, 'Something else entirely')]), null);
  assert.equal(bestMatch(target, [facts(`${STACK}/Badge`, 'Hello there')]), null);
  assert.equal(bestMatch(target, []), null);
});

test('an element without text never reaches the threshold by props and path alone', () => {
  const a = facts(`${STACK}/Icon`, '', ['name']);
  const b = { ...facts(`${STACK}/Icon.2`, '', ['name']), source: '<Icon name="x" />' };
  assert.ok(matchScore(a, b) < MATCH_THRESHOLD);
  assert.equal(bestMatch(a, [b]), null);
});

test('the scores are the ones the editor uses after another writer', () => {
  assert.equal(textLikeness(['a', 'b'], ['a', 'b']), 1);
  assert.equal(textLikeness(['a', 'a'], ['a']), 2 / 3);
  assert.equal(textLikeness([], []), 0);
  assert.equal(propLikeness([], []), 1);
  assert.equal(propLikeness(['size', 'tone'], ['size']), 0.5);
  assert.equal(pathCloseness(`${STACK}/Text.2`, `${STACK}/Text`), 1);
  assert.equal(pathCloseness(`${STACK}/Text`, 'sections/Hero:section/Text'), 1 / 3);
  assert.deepEqual(wordsOf('  Two,  CHANGED '), ['two,', 'changed']);
});
