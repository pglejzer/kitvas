import assert from 'node:assert/strict';
import { test } from 'node:test';
import { comparedLevels } from '../../../src/checks/domain/kit/compared.ts';

const KIT = {
  components: [{ name: 'Button' }, { name: 'Card' }, { name: 'Field' }, { name: 'Tag' }],
};
const LOOK = { key: 'Button.1', score: 95, size: 100, colour: 95, structure: 95 };
const NUMBERS = { key: 'Card.2', width: 1280, frames: 1, differences: 0, score: 100 };

test('levels: a look entry gives app, an originals entry code, neither read', () => {
  assert.deepEqual(
    comparedLevels(
      KIT,
      [LOOK],
      [NUMBERS],
      [
        { component: 'Field', why: 'partial' },
        { component: 'Button', why: 'notDrawn' },
      ],
    ),
    [
      { component: 'Button', level: 'app' },
      { component: 'Card', level: 'code' },
      { component: 'Field', level: 'read', why: 'partial' },
      { component: 'Tag', level: 'read', why: 'none' },
    ],
  );
});

test('a component scored by both a picture and numbers is app', () => {
  const both = { ...NUMBERS, key: 'Button.1' };
  assert.deepEqual(comparedLevels({ components: [{ name: 'Button' }] }, [LOOK], [both], []), [
    { component: 'Button', level: 'app' },
  ]);
});
