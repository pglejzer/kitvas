import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  headingLevel,
  type NameInput,
  nameOf,
  type RoleInput,
  roleOf,
  tabPosition,
} from '../../../../client/frame/live/a11y.ts';

const role = (patch: Partial<RoleInput>): string =>
  roleOf({
    tag: 'div',
    role: null,
    type: null,
    href: false,
    alt: null,
    named: false,
    sectioned: false,
    ...patch,
  });

const NO_NAME: NameInput = {
  labelledby: null,
  label: null,
  alt: null,
  labels: null,
  text: null,
  title: null,
};

const name = (patch: Partial<NameInput>, of: string): ReturnType<typeof nameOf> =>
  nameOf({ ...NO_NAME, ...patch }, of);

test('a written role wins, its first word only; tags imply the rest', () => {
  assert.equal(role({ role: ' Switch checkbox ' }), 'switch');
  assert.equal(role({ tag: 'button' }), 'button');
  assert.equal(role({ tag: 'h3' }), 'heading');
  assert.equal(role({ tag: 'a', href: true }), 'link');
  assert.equal(role({ tag: 'a' }), 'generic');
  assert.equal(role({ tag: 'nav' }), 'navigation');
  assert.equal(role({ tag: 'span' }), 'generic');
});

test('inputs take their role from their type, text by default', () => {
  assert.equal(role({ tag: 'input' }), 'textbox');
  assert.equal(role({ tag: 'input', type: 'checkbox' }), 'checkbox');
  assert.equal(role({ tag: 'input', type: 'range' }), 'slider');
  assert.equal(role({ tag: 'input', type: 'submit' }), 'button');
  // A name from the prototype chain is no type.
  assert.equal(role({ tag: 'input', type: 'constructor' }), 'textbox');
});

test('images, headers, footers and sections depend on their alt, place or name', () => {
  assert.equal(role({ tag: 'img', alt: 'Logo' }), 'img');
  assert.equal(role({ tag: 'img', alt: '' }), 'presentation');
  assert.equal(role({ tag: 'header' }), 'banner');
  assert.equal(role({ tag: 'header', sectioned: true }), 'generic');
  assert.equal(role({ tag: 'footer' }), 'contentinfo');
  assert.equal(role({ tag: 'section' }), 'generic');
  assert.equal(role({ tag: 'section', named: true }), 'region');
});

test('the name is taken in accname order and says where it came from', () => {
  const all = { labelledby: 'Plan', label: 'Choose', alt: 'Pic', labels: 'Field', text: 'Go' };
  assert.deepEqual(name(all, 'button'), { name: 'Plan', from: 'aria-labelledby' });
  assert.deepEqual(name({ ...all, labelledby: '  ' }, 'button'), {
    name: 'Choose',
    from: 'aria-label',
  });
  assert.deepEqual(name({ alt: 'Logo', title: 'Home' }, 'img'), { name: 'Logo', from: 'alt' });
  assert.deepEqual(name({ labels: ' E-mail\n address ' }, 'textbox'), {
    name: 'E-mail address',
    from: 'text',
  });
  assert.deepEqual(name({ title: 'Search' }, 'textbox'), { name: 'Search', from: 'title' });
});

test('content names only the roles that take their name from it', () => {
  assert.deepEqual(name({ text: 'Buy now' }, 'button'), { name: 'Buy now', from: 'text' });
  assert.deepEqual(name({ text: 'Pricing' }, 'heading'), { name: 'Pricing', from: 'text' });
  assert.deepEqual(name({ text: 'All plans' }, 'navigation'), { name: '', from: 'none' });
  assert.deepEqual(name({ text: '   ' }, 'link'), { name: '', from: 'none' });
});

test('a long name is cut', () => {
  assert.ok(name({ label: 'x'.repeat(900) }, 'button').name.length <= 500);
});

test('the tab order puts positive tabindex first, lowest first, then document order', () => {
  const entries: { node: string; tabIndex: number }[] = [
    { node: 'a', tabIndex: 0 },
    { node: 'b', tabIndex: 2 },
    { node: 'c', tabIndex: -1 },
    { node: 'd', tabIndex: 1 },
    { node: 'e', tabIndex: 2 },
  ];
  assert.equal(tabPosition(entries, 'd'), 1);
  assert.equal(tabPosition(entries, 'b'), 2);
  assert.equal(tabPosition(entries, 'e'), 3);
  assert.equal(tabPosition(entries, 'a'), 4);
  assert.equal(tabPosition(entries, 'c'), null);
  assert.equal(tabPosition(entries, 'z'), null);
});

test('a heading has the level of its tag, or aria-level, or 2 for a bare heading role', () => {
  assert.equal(headingLevel('h3', 'heading', null), 3);
  assert.equal(headingLevel('h3', 'heading', '5'), 5);
  assert.equal(headingLevel('div', 'heading', null), 2);
  assert.equal(headingLevel('div', 'heading', 'ten'), 2);
  assert.equal(headingLevel('h2', 'button', null), null);
  assert.equal(headingLevel('p', 'paragraph', null), null);
});
