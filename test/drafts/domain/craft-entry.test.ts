import assert from 'node:assert/strict';
import { test } from 'node:test';
import { craftEntryScss, craftEntryTsx } from '../../../src/drafts/domain/craft-entry.ts';
import { sketchTemplate } from '../../../src/drafts/domain/templates.ts';

const count = (text: string, part: string): number => text.split(part).length - 1;

test('an icon board shows three sketches, each at three sizes on two grounds', () => {
  const text = craftEntryTsx({
    name: 'Spark',
    subject: 'icon',
    picked: null,
    kitIcons: ['check', 'close'],
  });
  for (const sketch of ['A', 'B', 'C']) {
    assert.ok(text.includes(`data-craft-sketch="${sketch}"`));
    assert.ok(text.includes(`import { Spark${sketch} } from './sketches/${sketch}.tsx';`));
  }
  assert.equal(count(text, 'data-craft-sketch='), 3);
  // 3 sketches x 2 grounds x 2 kit icons.
  assert.equal(count(text, 'data-kit-icon='), 12);
  assert.ok(text.includes('<SparkB size={16} />'));
  assert.ok(text.includes('<SparkB size={24} />'));
  assert.ok(text.includes('<SparkB size={32} />'));
  assert.ok(text.includes('craft-ground--light'));
  assert.ok(text.includes('craft-ground--dark'));
  assert.ok(text.includes("import { Icon } from '@kit';"));
  assert.ok(text.includes('<span data-kit-icon="check"><Icon name="check" /></span>'));
});

test('an icon board shows at most 6 kit icons and uses the named icon component', () => {
  const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const text = craftEntryTsx({
    name: 'Spark',
    subject: 'icon',
    picked: 'A',
    kitIcons: names,
    iconComponent: 'Glyph',
  });
  assert.equal(count(text, 'data-kit-icon='), 12);
  assert.ok(text.includes("import { Glyph } from '@kit';"));
  assert.equal(text.includes('data-kit-icon="g"'), false);
});

test('an icon board with no kit icons has no kit row and no kit import', () => {
  const text = craftEntryTsx({ name: 'Spark', subject: 'icon', picked: null, kitIcons: [] });
  assert.equal(text.includes('data-kit-icon'), false);
  assert.equal(text.includes('@kit'), false);
  assert.equal(count(text, 'data-craft-sketch='), 3);
});

test('a picked sketch is the only one imported and shown', () => {
  const text = craftEntryTsx({ name: 'Spark', subject: 'icon', picked: 'B', kitIcons: [] });
  assert.equal(count(text, "from './sketches/"), 1);
  assert.ok(text.includes("from './sketches/B.tsx'"));
  assert.equal(count(text, 'data-craft-sketch='), 1);
  assert.ok(text.includes('data-craft-sketch="B"'));
});

test('a logo board shows 16, 32 and natural size in colour and mono on both grounds', () => {
  const text = craftEntryTsx({ name: 'Mark', subject: 'logo', picked: 'C', kitIcons: [] });
  assert.ok(text.includes('<MarkC tone="colour" size={16} />'));
  assert.ok(text.includes('<MarkC tone="mono" size={32} />'));
  assert.ok(text.includes('<MarkC tone="mono" />'));
  // 2 tones x 2 grounds.
  assert.equal(count(text, 'craft-ground craft-ground--'), 4);
  assert.equal(text.includes('data-kit-icon'), false);
});

test('a component board renders the example export of each sketch', () => {
  const text = craftEntryTsx({ name: 'Badge', subject: 'component', picked: null, kitIcons: [] });
  assert.ok(text.includes("import { BadgeAExample } from './sketches/A.tsx';"));
  assert.ok(text.includes('<BadgeCExample />'));
  assert.equal(count(text, 'data-craft-sketch='), 3);
});

test('the board stylesheet uses kit tokens for spacing', () => {
  const scss = craftEntryScss();
  assert.ok(scss.includes('.craft-board {'));
  assert.ok(scss.includes('var(--kit-space-sm)'));
  assert.ok(scss.includes('.craft-ground--dark'));
});

test('an icon sketch template is an inline svg with currentColor and a size', () => {
  const text = sketchTemplate('Spark', 'A', 'icon');
  assert.ok(text.includes('export function SparkA('));
  assert.ok(text.includes('viewBox="0 0 24 24"'));
  assert.ok(text.includes('// viewBox: 0 0 24 24'));
  assert.ok(text.includes('fill="currentColor"'));
  assert.ok(text.includes('size = 24'));
  assert.ok(text.includes('aria-hidden={title === undefined ? true : undefined}'));
  assert.equal(text.includes('data-craft-tone'), false);
});

test('a logo sketch template adds the tone prop', () => {
  const text = sketchTemplate('Mark', 'B', 'logo');
  assert.ok(text.includes('export function MarkB('));
  assert.ok(text.includes("tone?: 'colour' | 'mono';"));
  assert.ok(text.includes('data-craft-tone={tone}'));
  assert.ok(text.includes('viewBox="0 0 128 128"'));
});

test('a component sketch template has typed props and one example export', () => {
  const text = sketchTemplate('StatusBadge', 'C', 'component');
  assert.ok(text.includes('export type StatusBadgeCProps = { label?: string };'));
  assert.ok(text.includes('export function StatusBadgeC('));
  assert.equal(count(text, 'export function StatusBadgeCExample()'), 1);
  assert.ok(text.includes('className="status-badge-c"'));
  assert.equal(text.includes('<svg'), false);
});
