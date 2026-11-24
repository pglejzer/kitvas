import assert from 'node:assert/strict';
import { test } from 'node:test';
import { icon, iconSprite } from '../../../src/studio/pages/icons/icon.ts';
import { ICON_NAMES, ICONS, iconId } from '../../../src/studio/pages/icons/paths.ts';

test('an icon points to its symbol and is hidden from assistive technology', () => {
  assert.equal(
    icon('lock').text,
    '<svg class="k-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><use href="#i-lock"></use></svg>',
  );
});

test('the sprite holds every icon once, takes no room and is never read out', () => {
  const sprite = iconSprite().text;
  assert.ok(sprite.startsWith('<svg class="k-sprite" aria-hidden="true"'));
  assert.ok(ICON_NAMES.length >= 40);
  for (const name of ICON_NAMES) {
    const found = sprite.split(`<symbol id="${iconId(name)}" viewBox="0 0 16 16">`).length - 1;
    assert.equal(found, 1, name);
  }
});

test('an icon is a stroke drawing: shapes only, no colour, no script, no id of its own', () => {
  for (const name of ICON_NAMES) {
    const drawing = ICONS[name];
    assert.match(drawing, /^(<(path|circle|rect) [^<>]*\/>)+$/, name);
    assert.doesNotMatch(drawing, /fill|stroke|style|class|id=|href|on[a-z]+=/, name);
  }
});

test('an icon keeps inside its 16 by 16 grid', () => {
  for (const name of ICON_NAMES) {
    const drawing = ICONS[name];
    // Absolute positions of circles and rects; paths are checked by eye and by their start.
    for (const match of drawing.matchAll(/\b(cx|cy|x|y)="([0-9.]+)"/g)) {
      const value = Number(match[2]);
      assert.ok(value >= 1 && value <= 15, `${name}: ${match[1]} ${value}`);
    }
    for (const match of drawing.matchAll(/ d="M([0-9.]+) ([0-9.]+)/g)) {
      const [x, y] = [Number(match[1]), Number(match[2])];
      assert.ok(x >= 1 && x <= 15 && y >= 1 && y <= 15, `${name}: starts at ${x} ${y}`);
    }
  }
});

test('icon names are words with dashes, safe in an id and a selector', () => {
  for (const name of ICON_NAMES) assert.match(name, /^[a-z]+(-[a-z]+)*$/);
});
