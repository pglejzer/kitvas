import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EDITOR_PARTS } from '../../../../src/studio/pages/skin/editor/index.ts';
import { SHARED_RULES } from '../../../../src/studio/pages/skin/index.ts';
import { PAGE_PARTS } from '../../../../src/studio/pages/skin/pages/index.ts';
import { themeCss, themeNames } from '../../../../src/studio/theme/theme-css.ts';

const NEW_TOKENS: Record<string, string> = {
  '--st-space-14': '14px',
  '--st-size-label': '84px',
  '--st-size-group': '34px',
  '--st-size-chip': '18px',
  '--st-font-size-label': '12.5px',
};

const NEW_CLASSES = ['k-card', 'k-card-meta', 'k-opts', 'k-stepper', 'k-change'];

const AREAS: [string, string][] = [
  ...Object.entries(PAGE_PARTS).map(([name, css]): [string, string] => [`pages/${name}`, css]),
  ...Object.entries(EDITOR_PARTS).map(([name, css]): [string, string] => [`editor/${name}`, css]),
];

const ruleOf = (selector: string): string => {
  const start = SHARED_RULES.indexOf(`\n${selector} {`);
  assert.notEqual(start, -1, `${selector} is defined`);
  return SHARED_RULES.slice(start, SHARED_RULES.indexOf('}', start));
};

test('each token the editor panes need is defined, with its value, for every theme to inherit', () => {
  const names = themeNames();
  const root = /:root \{[^}]*\}/.exec(themeCss())?.[0] ?? '';
  for (const [name, value] of Object.entries(NEW_TOKENS)) {
    assert.ok(names.has(name), `${name} is defined`);
    assert.ok(root.includes(`${name}: ${value};`), `${name} is ${value} on the root`);
  }
  // A theme block never sets a scale token of its own, so light and dark share them.
  for (const theme of ['light', 'dark']) {
    const block = new RegExp(`:root\\[data-theme="${theme}"\\] \\{[^}]*\\}`).exec(themeCss())?.[0];
    assert.ok(block);
    for (const name of Object.keys(NEW_TOKENS)) assert.ok(!block.includes(`${name}:`), name);
  }
});

test('each shared class of the editor base is defined once, in the shared skin only', () => {
  for (const name of NEW_CLASSES) {
    const definitions = SHARED_RULES.split('\n').filter((line) => line.startsWith(`.${name} {`));
    assert.equal(definitions.length, 1, `.${name} has one base rule`);
    // An area may style a shared class inside its own block (`.checks-ev .k-change`); it never
    // starts a rule with one, which would define it a second time.
    const starts = new RegExp(`(^|[},])\\s*\\.${name}(?![a-z0-9-])`, 'm');
    for (const [area, css] of AREAS) assert.ok(!starts.test(css), `${area} defines .${name}`);
  }
});

test('the pressed option chip, the card on show and the stepper handle carry the accent', () => {
  const pressed = /\.k-opts > button\[aria-pressed="true"\] \{[^}]*--st-color-accent\)/;
  const handle = /\.k-stepper-stop\[aria-checked="true"\]::after \{[^}]*--st-color-accent\)/;
  assert.match(SHARED_RULES, pressed);
  assert.match(ruleOf('.k-card[data-on]'), /--st-color-accent\)/);
  assert.match(SHARED_RULES, handle);
});

test('every control the base adds can be hit with a pointer and seen with the keyboard', () => {
  assert.match(ruleOf('.k-opts > button'), /min-height: var\(--st-size-target\)/);
  assert.match(ruleOf('.k-stepper-stop'), /padding: var\(--st-size-target\)/);
  assert.match(SHARED_RULES, /\.k-stepper-stop:focus-visible::after \{ outline: 2px solid/);
  assert.match(ruleOf('.k-group-head'), /min-height: var\(--st-size-group\)/);
});

test('a change strikes the old value and sets the new one in a small chip', () => {
  assert.match(SHARED_RULES, /\.k-change del \{[^}]*text-decoration: line-through/);
  assert.match(SHARED_RULES, /\.k-change ins \{[^}]*min-height: var\(--st-size-chip\)/);
});

test('the count after a tab is plain and regular, and the group header has its chevron and size', () => {
  const count =
    /\.k-tab \.k-count \{[^}]*background: none[^}]*font-weight: var\(--st-font-weight-regular\)/;
  const chevron = /\.k-group-head > \.k-icon \{[^}]*margin-left: calc\(-1 \* var\(--st-space-4\)\)/;
  assert.match(SHARED_RULES, count);
  assert.match(SHARED_RULES, chevron);
  assert.match(ruleOf('.k-group-head'), /font-size: var\(--st-font-size-label\)/);
  assert.match(ruleOf('.k-row'), /grid-template-columns: var\(--st-size-label\)/);
});

test('the new rules write no time by hand, so reduced motion turns them off', () => {
  for (const name of ['.k-stepper-stop::after', '.k-group-head > .k-icon']) {
    assert.doesNotMatch(ruleOf(name), /\b\d+m?s\b/, name);
  }
});
