import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  ActionFacts,
  FactNode,
  NodeStyle,
  PageFacts,
  RawFinding,
} from '../../../src/checks/index.ts';
import { DEEP_WIDTH_RULE_IDS, VISIT_RULES } from '../../../src/checks/index.ts';
import { node, page, text, visit } from './facts.ts';

function run(id: string, nodes: FactNode[], part: Partial<PageFacts> = {}): RawFinding[] {
  const rule = VISIT_RULES.find((entry) => entry.id === id);
  assert.ok(rule, id);
  return rule.run(visit(page(nodes, part)));
}

const action = (part: Partial<ActionFacts> = {}): ActionFacts => ({
  kind: 'button',
  name: 'Try Pro free for 14 days',
  text: 'Try Pro free for 14 days',
  href: null,
  submit: false,
  disabled: false,
  menu: false,
  current: null,
  lines: 1,
  ...part,
});

const button = (part: Partial<ActionFacts>, style: Partial<NodeStyle> = {}): FactNode =>
  node({ tag: 'button', ks: 'sections/Plans:button', action: action(part), style });

const prose = (lines: number, longest: number, part: Partial<FactNode> = {}): FactNode =>
  node({ tag: 'p', ks: 'sections/Plans:p', text: text('x'.repeat(60), lines, longest), ...part });

const hints = (found: RawFinding[]) => found.map((finding) => finding.hint.params);

test('a button whose label takes two lines is soft', () => {
  const found = run('ui/wrapped-action', [button({ lines: 2 })]);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.severity, 'review');
  assert.deepEqual(hints(found), [{ lines: 2 }]);
});

test('on a kit component both findings stay the draft own, with their own hints', () => {
  const ks = 'sections/Plans:button';
  const seen = { components: new Map([[ks, 'Button']]) };
  const rule = (id: string) => VISIT_RULES.find((entry) => entry.id === id);
  const wrapped = rule('ui/wrapped-action')?.run(visit(page([button({ lines: 2 })]), { seen }));
  assert.deepEqual(wrapped?.[0]?.hint, { key: 'checkHint.uiWrappedAction', params: { lines: 2 } });
  const text = prose(4, 18, { ks });
  const narrow = rule('ui/narrow-column')?.run(visit(page([text]), { seen }));
  assert.equal(narrow?.[0]?.hint.key, 'checkHint.uiNarrowColumn');
});

test('a button whose label stays on one line is quiet', () => {
  assert.deepEqual(run('ui/wrapped-action', [button({ lines: 1 })]), []);
});

test('a link in running text is never a wrapped action, wherever it breaks', () => {
  const inline = node({
    tag: 'a',
    action: action({ kind: 'link', href: '/plans', lines: 2 }),
    style: { display: 'inline', background: '#ff0000ff' },
  });
  assert.deepEqual(run('ui/wrapped-action', [inline]), []);
});

test('a filled inline-block link counts as a button, a plain one or a block link does not', () => {
  const link = (style: Partial<NodeStyle>) =>
    node({ tag: 'a', action: action({ kind: 'link', href: '/plans', lines: 2 }), style });
  const filled = link({ display: 'inline-flex', background: '#0055ffff' });
  assert.equal(run('ui/wrapped-action', [filled]).length, 1);
  const bordered = link({ display: 'inline-block', border: [1, 1, 1, 1] });
  assert.equal(run('ui/wrapped-action', [bordered]).length, 1);
  assert.deepEqual(run('ui/wrapped-action', [link({ display: 'inline-block' })]), []);
  assert.deepEqual(
    run('ui/wrapped-action', [link({ display: 'block', background: '#0055ffff' })]),
    [],
  );
});

test('a hidden button is left out', () => {
  const hidden = node({ tag: 'button', hidden: true, action: action({ lines: 3 }) });
  assert.deepEqual(run('ui/wrapped-action', [hidden]), []);
});

test('a text of three lines with its longest line under 25 characters is soft', () => {
  const found = run('ui/narrow-column', [prose(3, 18)]);
  assert.equal(found.length, 1);
  assert.deepEqual(hints(found), [{ lines: 3, longest: 18 }]);
});

test('a narrow column stays quiet at 25 characters and at two lines', () => {
  assert.deepEqual(run('ui/narrow-column', [prose(3, 25)]), []);
  assert.equal(run('ui/narrow-column', [prose(3, 24)]).length, 1);
  assert.deepEqual(run('ui/narrow-column', [prose(2, 10)]), []);
});

test('a narrow heading is left out', () => {
  assert.deepEqual(run('ui/narrow-column', [prose(3, 12, { heading: 2 })]), []);
  const big = prose(3, 12, { style: { ...node().style, fontSize: 40 } });
  assert.deepEqual(run('ui/narrow-column', [big]), []);
});

test('text inside a table is left out, a table sibling is not', () => {
  const table = node({ tag: 'table' });
  const cell = prose(4, 8, { tag: 'td', parent: 0 });
  assert.deepEqual(run('ui/narrow-column', [table, cell]), []);
  const section = node({ tag: 'section' });
  assert.equal(run('ui/narrow-column', [section, prose(4, 8, { parent: 0 })]).length, 1);
});

test('the label of an action is left to the wrapped-action rule', () => {
  const label = prose(3, 10, { tag: 'button', action: action({ lines: 3 }) });
  assert.deepEqual(run('ui/narrow-column', [label]), []);
});

test('both rules run at every width visit', () => {
  assert.ok(DEEP_WIDTH_RULE_IDS.includes('ui/wrapped-action'));
  assert.ok(DEEP_WIDTH_RULE_IDS.includes('ui/narrow-column'));
});
