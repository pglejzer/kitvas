import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  nestedSelector,
  type RuleLike,
  splitList,
  twinCss,
  twinSelector,
} from '../../../../client/frame/live/force.ts';

const HOVER = '[data-kv-force~="hover"]';
const FOCUS = '[data-kv-force~="focus"]';
const ACTIVE = '[data-kv-force~="active"]';

test('a state pseudo-class becomes the attribute of its forced state', () => {
  assert.equal(twinSelector('.button:hover', 'hover'), `.button${HOVER}`);
  assert.equal(twinSelector('.button:active', 'active'), `.button${ACTIVE}`);
  assert.equal(twinSelector('a:HOVER', 'hover'), `a${HOVER}`);
});

test('focus covers both :focus and :focus-visible, never :focus-within', () => {
  assert.equal(twinSelector('.field:focus', 'focus'), `.field${FOCUS}`);
  assert.equal(twinSelector('.field:focus-visible', 'focus'), `.field${FOCUS}`);
  assert.equal(twinSelector('.form:focus-within', 'focus'), null);
  assert.equal(twinSelector('.field:focus-visible', 'hover'), null);
});

test('a compound selector keeps everything but the forced state', () => {
  assert.equal(twinSelector('.a.b:hover:focus-visible', 'hover'), `.a.b${HOVER}:focus-visible`);
  assert.equal(twinSelector('.a.b:hover:focus-visible', 'focus'), `.a.b:hover${FOCUS}`);
  assert.equal(twinSelector('.a:hover::before', 'hover'), `.a${HOVER}::before`);
  assert.equal(twinSelector('.a:not(.b):hover', 'hover'), `.a:not(.b)${HOVER}`);
});

test('a state on an ancestor is twinned where it is, so the descendants follow it', () => {
  assert.equal(twinSelector('.card:hover .title', 'hover'), `.card${HOVER} .title`);
  assert.equal(twinSelector('.list > li:active + li', 'active'), `.list > li${ACTIVE} + li`);
});

test('a state inside :is(), :where() and :has() is twinned; inside :not() it stays', () => {
  assert.equal(twinSelector(':is(.a:hover, .b) .c', 'hover'), `:is(.a${HOVER}, .b) .c`);
  assert.equal(twinSelector(':where(.a:hover)', 'hover'), `:where(.a${HOVER})`);
  assert.equal(twinSelector('.row:has(.cell:hover)', 'hover'), `.row:has(.cell${HOVER})`);
  assert.equal(twinSelector('.a:not(:hover)', 'hover'), null);
  assert.equal(twinSelector('.a:not(:is(.b:hover))', 'hover'), null);
  assert.equal(twinSelector(':is(.a:not(.b)):hover', 'hover'), `:is(.a:not(.b))${HOVER}`);
});

test('escaped colons, strings and attribute values are no pseudo-classes', () => {
  // A utility class such as Tailwind's `hover:bg-x`.
  assert.equal(twinSelector('.hover\\:bg-x:hover', 'hover'), `.hover\\:bg-x${HOVER}`);
  assert.equal(twinSelector('.hover\\:bg-x', 'hover'), null);
  assert.equal(twinSelector('[title=":hover"]', 'hover'), null);
  assert.equal(twinSelector('a[href=":hover"]:hover', 'hover'), `a[href=":hover"]${HOVER}`);
});

test('only the parts of a list that change are kept', () => {
  assert.equal(twinSelector('.a:hover, .b, .c:hover', 'hover'), `.a${HOVER}, .c${HOVER}`);
  assert.equal(twinSelector('.a, .b', 'hover'), null);
});

test('a rule with no state, and a twin itself, have no twin', () => {
  assert.equal(twinSelector('.button', 'hover'), null);
  assert.equal(twinSelector(`.button${HOVER}`, 'hover'), null);
  assert.equal(twinSelector(`.a${HOVER}, .b:hover`, 'hover'), null, 'twins are never twinned');
});

test('a selector list splits at its top level only', () => {
  assert.deepEqual(splitList('.a, :is(.b, .c), [x=","] , .d'), [
    '.a',
    ':is(.b, .c)',
    '[x=","]',
    '.d',
  ]);
  assert.deepEqual(splitList('.a\\,b, .c'), ['.a\\,b', '.c']);
});

test('a nested selector is read inside its parent', () => {
  assert.equal(nestedSelector('&:hover', '.card'), ':is(.card):hover');
  assert.equal(nestedSelector('.title', '.card, .tile'), ':is(.card, .tile) .title');
  assert.equal(nestedSelector('& .a, .b', '.card'), ':is(.card) .a, :is(.card) .b');
});

const style = (selector: string, declarations: string, children: RuleLike[] = []): RuleLike => ({
  kind: 'style',
  selector,
  declarations,
  children,
});

test('the twins copy the declarations, one rule per forced state the selector has', () => {
  const css = twinCss([
    style('.a:hover, .a:focus-visible', 'color: red;'),
    style('.b', 'color: blue;'),
    { kind: 'other' },
  ]);
  assert.equal(css, [`.a${HOVER} { color: red; }`, `.a${FOCUS} { color: red; }`].join('\n'));
  assert.equal(twinCss([style('.b', 'color: blue;')]), '');
});

const group = (prelude: string, children: RuleLike[]): RuleLike => ({
  kind: 'group',
  prelude,
  children,
});

test('a twin stays inside the media and supports blocks of its rule', () => {
  const css = twinCss([
    group('@media (min-width: 768px)', [
      group('@supports (display: grid)', [style('.a:active', 'gap: 4px;')]),
    ]),
  ]);
  assert.equal(
    css,
    `@media (min-width: 768px) { @supports (display: grid) { .a${ACTIVE} { gap: 4px; } } }`,
  );
});

test('nested rules are twinned with their parent, also declarations in a nested block', () => {
  const css = twinCss([
    style('.card', 'padding: 8px;', [
      style('&:hover', 'color: red;'),
      style('.title', 'font-weight: 600;'),
    ]),
    style('.tile:hover', 'color: red;', [
      group('@media (min-width: 768px)', [{ kind: 'declarations', declarations: 'color: blue;' }]),
      style('.icon', 'opacity: 1;'),
    ]),
  ]);
  assert.deepEqual(css.split('\n'), [
    `:is(.card)${HOVER} { color: red; }`,
    `.tile${HOVER} { color: red; }`,
    `@media (min-width: 768px) { .tile${HOVER} { color: blue; } }`,
    `:is(.tile${HOVER}) .icon { opacity: 1; }`,
  ]);
});

test('a rule with no declarations has no twin', () => {
  assert.equal(twinCss([style('.a:hover', '  ')]), '');
});
