import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGesture } from '../../../../../../client/studio/edit/props/custom/gesture.ts';

function setup(value: string | null = '#112233') {
  const previews: (string | null)[] = [];
  const writes: string[] = [];
  const gesture = createGesture({
    value,
    preview: (css) => void previews.push(css),
    write: (css) => void writes.push(css),
  });
  return { gesture, previews, writes };
}

test('a drag previews many times and writes once', () => {
  const { gesture, previews, writes } = setup();
  for (const css of ['#aa0000', '#bb0000', '#cc0000', '#dd0000']) gesture.move(css);
  gesture.end();
  assert.equal(previews.length, 4);
  assert.deepEqual(writes, ['#dd0000']);
});

test('the release twice writes once', () => {
  const { gesture, writes } = setup();
  gesture.move('#010203');
  gesture.end();
  gesture.end();
  assert.deepEqual(writes, ['#010203']);
});

test('Escape writes nothing and previews the old value back', () => {
  const { gesture, previews, writes } = setup();
  gesture.move('#ff0000');
  gesture.cancel();
  gesture.end();
  assert.deepEqual(writes, []);
  assert.equal(previews.at(-1), null);
});

test('a colour equal to the one held is not written', () => {
  const { gesture, previews, writes } = setup('#112233');
  gesture.move('#112233');
  gesture.end();
  assert.deepEqual(writes, []);
  assert.equal(previews.at(-1), null);
});

test('two gestures are two writes', () => {
  const { gesture, writes } = setup(null);
  gesture.move('#111111');
  gesture.end();
  gesture.move('#222222');
  gesture.end();
  assert.deepEqual(writes, ['#111111', '#222222']);
  assert.equal(gesture.held(), '#222222');
});
