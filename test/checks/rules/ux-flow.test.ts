import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  ActionFacts,
  CatalogComponent,
  FactNode,
  StateKind,
  VisitInput,
} from '../../../src/checks/index.ts';
import { STATE_RULES, VISIT_RULES } from '../../../src/checks/index.ts';
import { node, page, states, text, visit } from './facts.ts';

function run(id: string, input: VisitInput) {
  const rule = VISIT_RULES.find((candidate) => candidate.id === id);
  assert.ok(rule, `rule ${id} is registered`);
  return rule.run(input);
}

function runStates(id: string, baseline: VisitInput, visits: VisitInput[]) {
  const rule = STATE_RULES.find((candidate) => candidate.id === id);
  assert.ok(rule, `rule ${id} is registered`);
  return rule.run(states(baseline, visits));
}

function action(name: string, part: Partial<ActionFacts> = {}): ActionFacts {
  return {
    kind: 'button',
    name,
    text: name,
    href: null,
    submit: false,
    disabled: false,
    menu: false,
    current: null,
    lines: 1,
    ...part,
  };
}

function inState(nodes: FactNode[], stateKind: StateKind, state: string, width = 390) {
  return visit(page(nodes, { viewport: [width, 844] }), { stateKind, seen: { state, width } });
}

const MAIN = node({ tag: 'main', landmark: 'main' });
const SENTENCE = 'Orders you place will show up here.';
const copy = (sample: string) => node({ landmark: 'main', parent: 0, text: text(sample) });
const cta = (name: string) =>
  node({ landmark: 'main', parent: 0, tag: 'button', action: action(name) });

test('empty-next-step: fires when main has no sentence or no action', () => {
  const input = inState([MAIN, copy('Nothing'), cta('Add order')], 'empty', 'empty');
  const found = run('ux/empty-next-step', input);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ux/empty-next-step');
  assert.equal(found[0]?.severity, 'review');
  assert.equal(found[0]?.element, null);
  assert.deepEqual(found[0]?.message, {
    key: 'checkRule.uxEmptyNextStep',
    params: { missing: 'text' },
  });
  assert.deepEqual(found[0]?.states, ['empty']);
  const noAction = run('ux/empty-next-step', inState([MAIN, copy(SENTENCE)], 'empty', 'empty'));
  assert.deepEqual(noAction[0]?.message.params, { missing: 'action' });
});

test('empty-next-step: silent with a sentence and an action, in other states and on an empty page', () => {
  assert.deepEqual(
    run('ux/empty-next-step', inState([MAIN, copy(SENTENCE), cta('Add order')], 'empty', 'empty')),
    [],
  );
  assert.deepEqual(
    run('ux/empty-next-step', inState([MAIN, copy('Hi')], 'baseline', 'filled')),
    [],
  );
  assert.deepEqual(run('ux/empty-next-step', inState([], 'empty', 'empty')), []);
});

test('empty-next-step: with no main, the whole page counts', () => {
  const nodes = [
    node({ text: text(SENTENCE) }),
    node({ tag: 'a', action: action('Add', { kind: 'link' }) }),
  ];
  assert.deepEqual(run('ux/empty-next-step', inState(nodes, 'empty', 'empty')), []);
});

test('loading-says-empty: a no-results phrase in a loading state fires at that text', () => {
  const input = inState([MAIN, copy('No results found')], 'loading', 'loading');
  const found = run('ux/loading-says-empty', input);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ux/loading-says-empty');
  assert.equal(found[0]?.severity, 'fix');
  assert.deepEqual(found[0]?.message, {
    key: 'checkRule.uxLoadingSaysEmpty',
    params: { text: 'No results' },
  });
});

test('loading-says-empty: silent in other states, for other words, and on an empty page', () => {
  assert.deepEqual(
    run('ux/loading-says-empty', inState([MAIN, copy('No results')], 'empty', 'empty')),
    [],
  );
  assert.deepEqual(
    run('ux/loading-says-empty', inState([MAIN, copy('Loading orders')], 'loading', 'loading')),
    [],
  );
  assert.deepEqual(run('ux/loading-says-empty', inState([], 'loading', 'loading')), []);
});

test('loading-indicator: fires with no busy, status, progressbar or feedback component', () => {
  const found = run(
    'ux/loading-indicator',
    inState([MAIN, copy('Your orders')], 'loading', 'loading'),
  );
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ux/loading-indicator');
  assert.equal(found[0]?.severity, 'fix');
  assert.deepEqual(found[0]?.message, { key: 'checkRule.uxLoadingIndicator', params: {} });
});

test('loading-indicator: silent with aria-busy, a status, a progressbar role or a feedback component', () => {
  const quiet = (nodes: FactNode[]) =>
    run('ux/loading-indicator', inState(nodes, 'loading', 'loading'));
  assert.deepEqual(quiet([MAIN, node({ busy: true })]), []);
  // A visible loading text is an indicator too (the spike's orders draft).
  assert.deepEqual(quiet([MAIN, copy("Loading today's orders…")]), []);
  assert.deepEqual(quiet([MAIN, copy('Please wait')]), []);
  assert.deepEqual(quiet([MAIN, node({ live: 'status' })]), []);
  assert.deepEqual(quiet([MAIN, node({ live: 'progressbar' })]), []);
  assert.deepEqual(quiet([MAIN, node({ role: 'progressbar' })]), []);
  assert.deepEqual(quiet([MAIN, node({ role: 'status' })]), []);
  const spinner: CatalogComponent = {
    name: 'Spinner',
    category: 'feedback',
    props: [],
    styling: [],
  };
  const withKit = visit(page([MAIN, copy('Loading')]), {
    stateKind: 'loading',
    catalog: [spinner],
    report: { usage: [{ id: 's/A:Spinner/1', component: 'Spinner', props: {} }] },
  });
  assert.deepEqual(run('ux/loading-indicator', withKit), []);
  assert.deepEqual(quiet([]), []);
  assert.deepEqual(run('ux/loading-indicator', inState([MAIN], 'baseline', 'filled')), []);
});

test('error-recovery: an error state with no action in main fires', () => {
  const found = run(
    'ux/error-recovery',
    inState([MAIN, copy('Something failed')], 'error', 'error-network'),
  );
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ux/error-recovery');
  assert.equal(found[0]?.severity, 'fix');
  assert.deepEqual(found[0]?.states, ['error-network']);
});

test('error-recovery: silent with an action, in other states and on an empty page', () => {
  assert.deepEqual(
    run('ux/error-recovery', inState([MAIN, cta('Try again')], 'error', 'error')),
    [],
  );
  assert.deepEqual(
    run('ux/error-recovery', inState([MAIN, copy('Failed')], 'loading', 'loading')),
    [],
  );
  assert.deepEqual(run('ux/error-recovery', inState([], 'error', 'error')), []);
});

const navLink = (name: string, current: string | null = null, parent = 0) =>
  node({
    tag: 'a',
    landmark: 'navigation',
    parent,
    action: action(name, { kind: 'link', href: `/${name}`, current }),
  });
const NAV = node({ tag: 'nav', landmark: 'navigation' });

test('hidden-nav: at 1280 a navigation with only a menu button fires at the button', () => {
  const menu = node({
    tag: 'button',
    landmark: 'navigation',
    parent: 0,
    action: action('Menu', { menu: true }),
  });
  const found = run('ux/hidden-nav', inState([NAV, menu], 'baseline', 'filled', 1280));
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ux/hidden-nav');
  assert.equal(found[0]?.severity, 'review');
  assert.deepEqual(found[0]?.widths, [1280]);
  assert.deepEqual(found[0]?.message, { key: 'checkRule.uxHiddenNav', params: {} });
});

test('hidden-nav: silent at 390, with visible links, without a menu button and on an empty page', () => {
  const menu = node({
    tag: 'button',
    landmark: 'navigation',
    parent: 0,
    action: action('Menu', { menu: true }),
  });
  assert.deepEqual(run('ux/hidden-nav', inState([NAV, menu], 'baseline', 'filled', 390)), []);
  assert.deepEqual(
    run('ux/hidden-nav', inState([NAV, menu, navLink('Home')], 'baseline', 'filled', 1280)),
    [],
  );
  assert.deepEqual(run('ux/hidden-nav', inState([NAV], 'baseline', 'filled', 1280)), []);
  assert.deepEqual(run('ux/hidden-nav', inState([], 'baseline', 'filled', 1280)), []);
});

test('current-page: two links with none current fires at the navigation', () => {
  const found = run('ux/current-page', visit(page([NAV, navLink('Home'), navLink('Pricing')])));
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ux/current-page');
  assert.equal(found[0]?.severity, 'review');
  assert.deepEqual(found[0]?.message, { key: 'checkRule.uxCurrentPage', params: {} });
});

test('current-page: silent with a current link, one link, aria-current false and an empty page', () => {
  assert.deepEqual(
    run('ux/current-page', visit(page([NAV, navLink('Home', 'page'), navLink('Pricing')]))),
    [],
  );
  assert.deepEqual(run('ux/current-page', visit(page([NAV, navLink('Home')]))), []);
  assert.equal(
    run('ux/current-page', visit(page([NAV, navLink('Home', 'false'), navLink('Pricing')]))).length,
    1,
  );
  assert.deepEqual(run('ux/current-page', visit(page([]))), []);
});

test('placeholder-text: lorem ipsum is fix, a bare template word is review', () => {
  const fix = run(
    'ux/placeholder-text',
    visit(page([node({ text: text('Lorem ipsum dolor sit amet') })])),
  );
  assert.equal(fix.length, 1);
  assert.equal(fix[0]?.rule, 'ux/placeholder-text');
  assert.equal(fix[0]?.severity, 'fix');
  const review = run('ux/placeholder-text', visit(page([node({ text: text('Feature one') })])));
  assert.equal(review[0]?.severity, 'review');
  assert.deepEqual(review[0]?.message, {
    key: 'checkRule.uxPlaceholderText',
    params: { text: 'Feature one' },
  });
  const todo = run('ux/placeholder-text', visit(page([node({ text: text('TODO: write this') })])));
  assert.equal(todo[0]?.severity, 'fix');
});

test('placeholder-text: real copy and a template word inside a sentence are silent', () => {
  assert.deepEqual(
    run('ux/placeholder-text', visit(page([node({ text: text('Title of the report is long') })]))),
    [],
  );
  assert.deepEqual(run('ux/placeholder-text', visit(page([node({ text: text('Pricing') })]))), []);
  assert.deepEqual(run('ux/placeholder-text', visit(page([]))), []);
});

// The baseline: a header with a title, a list region holding rows, a footer.
const header = (y = 0) =>
  node({
    ks: 's/Head:header',
    ownKs: true,
    tag: 'header',
    landmark: 'banner',
    box: [0, y, 390, 60],
  });
const baselineNodes = (): FactNode[] => [
  header(),
  node({ ks: 's/List:section', ownKs: true, parent: -1, landmark: 'main', box: [0, 60, 390, 200] }),
  node({
    ks: 's/List:section/row',
    ownKs: true,
    parent: 1,
    landmark: 'main',
    text: text('Order 1042'),
  }),
];

test('empty-region: a region with content in the baseline and nothing in the empty state fires', () => {
  const baseline = inState(baselineNodes(), 'baseline', 'filled');
  const empty = inState(
    [header(), node({ ks: 's/List:section', ownKs: true, landmark: 'main' })],
    'empty',
    'empty',
  );
  const found = runStates('ux/empty-region', baseline, [empty]);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ux/empty-region');
  assert.equal(found[0]?.severity, 'fix');
  assert.equal(found[0]?.element, 's/List:section');
  assert.deepEqual(found[0]?.states, ['empty']);
  assert.deepEqual(found[0]?.message, { key: 'checkRule.uxEmptyRegion', params: {} });
});

test('empty-region: silent when the region has text or a child, is gone, or is page chrome', () => {
  const baseline = inState(baselineNodes(), 'baseline', 'filled');
  const withText = inState(
    [
      header(),
      node({ ks: 's/List:section', ownKs: true, landmark: 'main', text: text('Nothing yet') }),
    ],
    'empty',
    'empty',
  );
  assert.deepEqual(runStates('ux/empty-region', baseline, [withText]), []);
  const withChild = inState(
    [header(), node({ ks: 's/List:section', ownKs: true, landmark: 'main' }), node({ parent: 1 })],
    'empty',
    'empty',
  );
  assert.deepEqual(runStates('ux/empty-region', baseline, [withChild]), []);
  const gone = inState([header()], 'empty', 'empty');
  assert.deepEqual(runStates('ux/empty-region', baseline, [gone]), []);
  const chromeBaseline = inState(
    [
      node({ ks: 's/Head:header', ownKs: true, landmark: 'banner' }),
      node({ parent: 0, landmark: 'banner', text: text('Logo') }),
    ],
    'baseline',
    'filled',
  );
  const bareHeader = inState(
    [node({ ks: 's/Head:header', ownKs: true, landmark: 'banner' })],
    'empty',
    'empty',
  );
  assert.deepEqual(runStates('ux/empty-region', chromeBaseline, [bareHeader]), []);
});

test('empty-region: only empty states are checked, and a baseline-only draft is silent', () => {
  const baseline = inState(baselineNodes(), 'baseline', 'filled');
  const loading = inState(
    [node({ ks: 's/List:section', ownKs: true, landmark: 'main' })],
    'loading',
    'loading',
  );
  assert.deepEqual(runStates('ux/empty-region', baseline, [loading]), []);
  assert.deepEqual(runStates('ux/empty-region', baseline, []), []);
  assert.deepEqual(runStates('ux/empty-region', inState([], 'baseline', 'filled'), []), []);
});

test('state-shift: a header that moves more than a pixel between states fires', () => {
  const baseline = inState(baselineNodes(), 'baseline', 'filled');
  const shifted = inState([header(8)], 'loading', 'loading');
  const found = runStates('ux/state-shift', baseline, [shifted]);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ux/state-shift');
  assert.equal(found[0]?.severity, 'review');
  assert.equal(found[0]?.element, 's/Head:header');
  assert.deepEqual(found[0]?.states, ['loading']);
  assert.deepEqual(found[0]?.message, {
    key: 'checkRule.uxStateShift',
    params: { landmark: 'banner' },
  });
  assert.deepEqual(found[0]?.hint, {
    key: 'checkHint.uxStateShift',
    params: { landmark: 'banner', dx: 0, dy: 8 },
  });
});

test('state-shift: a move of one pixel, a missing element and a baseline-only draft are silent', () => {
  const baseline = inState(baselineNodes(), 'baseline', 'filled');
  assert.deepEqual(
    runStates('ux/state-shift', baseline, [inState([header(1)], 'loading', 'loading')]),
    [],
  );
  assert.deepEqual(runStates('ux/state-shift', baseline, [inState([], 'error', 'error')]), []);
  assert.deepEqual(runStates('ux/state-shift', baseline, []), []);
  assert.deepEqual(runStates('ux/state-shift', inState([], 'baseline', 'filled'), []), []);
});

/** A navigation of mapped links: every link has the same own element id. */
const mappedNav = (moves: number[]) => [
  node({ ks: 's/Nav:nav', ownKs: true, tag: 'nav', landmark: 'navigation', box: [0, 0, 390, 40] }),
  ...moves.map((dx, at) =>
    node({
      parent: 0,
      ks: 's/Nav:nav/a',
      ownKs: true,
      tag: 'a',
      landmark: 'navigation',
      box: [at * 100 + dx, 0, 80, 40],
    }),
  ),
];

test('state-shift: the links of a mapped list are measured against their own item, not item one', () => {
  const baseline = inState(mappedNav([0, 0, 0]), 'baseline', 'filled');
  const same = inState(mappedNav([0, 0, 0]), 'empty', 'empty');
  assert.deepEqual(runStates('ux/state-shift', baseline, [same]), []);
});

test('state-shift: a mapped link that moves is still reported, and a missing n-th link is silent', () => {
  const baseline = inState(mappedNav([0, 0, 0]), 'baseline', 'filled');
  const moved = inState(mappedNav([0, 0, 30]), 'loading', 'loading');
  const found = runStates('ux/state-shift', baseline, [moved]);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.element, 's/Nav:nav/a');
  assert.deepEqual(found[0]?.hint.params, { landmark: 'navigation', dx: 30, dy: 0 });
  const fewer = inState(mappedNav([0]), 'error', 'error');
  assert.deepEqual(runStates('ux/state-shift', baseline, [fewer]), []);
});
