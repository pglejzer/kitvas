import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  ActionFacts,
  CatalogComponent,
  FactNode,
  VisitInput,
} from '../../../src/checks/index.ts';
import { VISIT_RULES } from '../../../src/checks/index.ts';
import { node, page, text, visit } from './facts.ts';

function run(id: string, input: VisitInput) {
  const rule = VISIT_RULES.find((candidate) => candidate.id === id);
  assert.ok(rule, `rule ${id} is registered`);
  return rule.run(input);
}

function action(part: Partial<ActionFacts> & { name: string }): ActionFacts {
  return {
    kind: 'button',
    text: part.name,
    href: null,
    submit: false,
    disabled: false,
    menu: false,
    current: null,
    ...part,
  };
}

const FILLED = { background: '#0f7a52ff', ground: '#ffffffff' };

function button(
  ks: string | null,
  name: string,
  style: Partial<FactNode['style']> = {},
  extra: Partial<FactNode> = {},
) {
  return node({
    ks,
    ownKs: ks !== null,
    tag: 'button',
    landmark: 'main',
    action: action({ name }),
    style,
    ...extra,
  });
}

function link(name: string, href: string | null, text_ = name) {
  return node({ tag: 'a', action: action({ kind: 'link', name, text: text_, href }) });
}

const VARIANTS = ['solid', 'outline', 'plain'];
const BASE_BUTTON: CatalogComponent = {
  name: 'Button',
  category: 'action',
  props: [{ name: 'variant', type: 'enum', values: VARIANTS, default: 'solid' }],
  styling: [],
};

/** A main landmark at index 0 and these nodes inside it. */
function inMain(...nodes: FactNode[]): FactNode[] {
  return [node({ tag: 'main', landmark: 'main' }), ...nodes.map((one) => ({ ...one, parent: 0 }))];
}

function withUsage(
  nodes: FactNode[],
  usage: { id: string; props: Record<string, string> }[],
  catalog: CatalogComponent[],
) {
  return visit(page(inMain(...nodes)), {
    catalog,
    report: { usage: usage.map((record) => ({ ...record, component: catalog[0]?.name ?? '' })) },
  });
}

test('one-primary: two Base buttons without a variant are both solid, so it fires at the second', () => {
  const input = withUsage(
    [button('sections/A:Button/1', 'Save'), button('sections/A:Button/2', 'Send')],
    [
      { id: 'sections/A:Button/1', props: {} },
      { id: 'sections/A:Button/2', props: {} },
    ],
    [BASE_BUTTON],
  );
  const found = run('ux/one-primary', input);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ux/one-primary');
  assert.equal(found[0]?.severity, 'review');
  assert.equal(found[0]?.element, 'sections/A:Button/2');
  assert.deepEqual(found[0]?.message, { key: 'checkRule.uxOnePrimary', params: { name: 'Send' } });
  assert.deepEqual(found[0]?.states, ['filled']);
  assert.deepEqual(found[0]?.widths, [390]);
});

test('one-primary: an outline variant is not primary', () => {
  const input = withUsage(
    [button('sections/A:Button/1', 'Save'), button('sections/A:Button/2', 'Cancel')],
    [
      { id: 'sections/A:Button/1', props: {} },
      { id: 'sections/A:Button/2', props: { variant: 'outline' } },
    ],
    [BASE_BUTTON],
  );
  assert.deepEqual(run('ux/one-primary', input), []);
});

test('one-primary: MUI contained is primary, text is not', () => {
  const mui: CatalogComponent = {
    ...BASE_BUTTON,
    props: [
      { name: 'variant', type: 'enum', values: ['text', 'outlined', 'contained'], default: 'text' },
    ],
  };
  const two = withUsage(
    [button('s/A:Button/1', 'Save'), button('s/A:Button/2', 'Send')],
    [
      { id: 's/A:Button/1', props: { variant: 'contained' } },
      { id: 's/A:Button/2', props: { variant: 'contained' } },
    ],
    [mui],
  );
  assert.equal(run('ux/one-primary', two).length, 1);
  const one = withUsage(
    [button('s/A:Button/1', 'Save'), button('s/A:Button/2', 'Send')],
    [
      { id: 's/A:Button/1', props: { variant: 'contained' } },
      { id: 's/A:Button/2', props: {} },
    ],
    [mui],
  );
  assert.deepEqual(run('ux/one-primary', one), []);
});

test('one-primary: a shadcn-like default variant falls back to computed style', () => {
  const shadcn: CatalogComponent = {
    ...BASE_BUTTON,
    props: [{ name: 'variant', type: 'enum', values: ['default', 'ghost'], default: 'default' }],
  };
  const usage = [
    { id: 's/A:Button/1', props: {} },
    { id: 's/A:Button/2', props: {} },
  ];
  const filled = withUsage(
    [button('s/A:Button/1', 'Save', FILLED), button('s/A:Button/2', 'Send', FILLED)],
    usage,
    [shadcn],
  );
  assert.equal(run('ux/one-primary', filled).length, 1);
  const plain = withUsage(
    [button('s/A:Button/1', 'Save', FILLED), button('s/A:Button/2', 'Send')],
    usage,
    [shadcn],
  );
  assert.deepEqual(run('ux/one-primary', plain), []);
});

test('one-primary: a kit with no variant prop falls back to style and does not throw', () => {
  const bare: CatalogComponent = { ...BASE_BUTTON, props: [] };
  const input = withUsage(
    [button('s/A:Button/1', 'Save', FILLED), button('s/A:Button/2', 'Send', FILLED)],
    [
      { id: 's/A:Button/1', props: {} },
      { id: 's/A:Button/2', props: {} },
    ],
    [bare],
  );
  assert.equal(run('ux/one-primary', input).length, 1);
});

test('one-primary: a filled background below 3:1 is not primary', () => {
  const input = visit(
    page(
      inMain(
        button(null, 'Save', { background: '#f3f4f6ff', ground: '#ffffffff' }),
        button(null, 'Send', { background: '#f3f4f6ff', ground: '#ffffffff' }),
      ),
    ),
  );
  assert.deepEqual(run('ux/one-primary', input), []);
});

test('one-primary: six repeated row buttons with one element id count once', () => {
  const rows = Array.from({ length: 6 }, () => button('sections/List:Button/row', 'Open', FILLED));
  assert.deepEqual(run('ux/one-primary', visit(page(inMain(...rows)))), []);
});

test('one-primary: primaries in different forms are separate groups', () => {
  const nodes = [
    node({ tag: 'main', landmark: 'main' }),
    node({ tag: 'form', landmark: 'main', parent: 0 }),
    button('s/A:Button/1', 'Save', FILLED, { parent: 1 }),
    node({ tag: 'form', landmark: 'main', parent: 0 }),
    button('s/A:Button/2', 'Send', FILLED, { parent: 3 }),
  ];
  assert.deepEqual(run('ux/one-primary', visit(page(nodes))), []);
});

test('one-primary: an empty page returns nothing', () => {
  assert.deepEqual(run('ux/one-primary', visit(page([]))), []);
  assert.deepEqual(run('ux/danger-primary', visit(page([]))), []);
});

test('danger-primary: the only primary named delete fires', () => {
  const input = visit(page([button('s/A:Button/1', 'Delete account', FILLED)]));
  const found = run('ux/danger-primary', input);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ux/danger-primary');
  assert.equal(found[0]?.severity, 'review');
  assert.equal(found[0]?.element, 's/A:Button/1');
  assert.deepEqual(found[0]?.message, {
    key: 'checkRule.uxDangerPrimary',
    params: { name: 'Delete account' },
  });
});

test('danger-primary: silent for a safe name, a second primary or a plain delete button', () => {
  assert.deepEqual(
    run('ux/danger-primary', visit(page([button('s/A:Button/1', 'Save', FILLED)]))),
    [],
  );
  assert.deepEqual(
    run(
      'ux/danger-primary',
      visit(
        page(
          inMain(button('s/A:Button/1', 'Delete', FILLED), button('s/A:Button/2', 'Keep', FILLED)),
        ),
      ),
    ),
    [],
  );
  assert.deepEqual(run('ux/danger-primary', visit(page([button('s/A:Button/1', 'Delete')]))), []);
});

test('button-text: OK, Submit, Yes, No, Go and Click here fire; outcome names do not', () => {
  for (const name of ['OK', ' submit ', 'Yes', 'No', 'Go', 'Click here']) {
    const found = run('ux/button-text', visit(page([button('s/A:Button/1', name)])));
    assert.equal(found.length, 1, name);
    assert.equal(found[0]?.rule, 'ux/button-text');
    assert.deepEqual(found[0]?.message, {
      key: 'checkRule.uxButtonText',
      params: { name: name.trim() },
    });
  }
  assert.deepEqual(
    run('ux/button-text', visit(page([button('s/A:Button/1', 'Save changes')]))),
    [],
  );
  assert.deepEqual(run('ux/button-text', visit(page([]))), []);
});

test('button-text: a link named OK is not a button', () => {
  assert.deepEqual(run('ux/button-text', visit(page([link('OK', '/ok')]))), []);
});

test('link-text: a vague name equal to its text fires', () => {
  const found = run('ux/link-text', visit(page([link('Read more', '/a')])));
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ux/link-text');
  assert.equal(found[0]?.severity, 'review');
  assert.deepEqual(found[0]?.message, {
    key: 'checkRule.uxLinkText',
    params: { name: 'Read more' },
  });
});

test('link-text: silent when the name adds context, or the name is specific', () => {
  assert.deepEqual(
    run('ux/link-text', visit(page([link('Read more about pricing', '/a', 'Read more')]))),
    [],
  );
  assert.deepEqual(run('ux/link-text', visit(page([link('Pricing', '/pricing')]))), []);
  assert.deepEqual(run('ux/link-text', visit(page([]))), []);
});

test('same-text-links: one finding per name with different addresses', () => {
  const input = visit(
    page([link('Details', '/a'), link('details', '/b'), link('Details', '/c'), link('Home', '/')]),
  );
  const found = run('ux/same-text-links', input);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ux/same-text-links');
  assert.deepEqual(found[0]?.message, {
    key: 'checkRule.uxSameTextLinks',
    params: { name: 'Details' },
  });
});

test('same-text-links: silent for one address, bare hashes and empty hrefs', () => {
  const input = visit(
    page([
      link('Details', '/a'),
      link('Details', '/a'),
      link('Top', '#'),
      link('Top', '/top'),
      link('Menu', ''),
      link('Menu', '/menu'),
    ]),
  );
  assert.deepEqual(run('ux/same-text-links', input), []);
  assert.deepEqual(run('ux/same-text-links', visit(page([]))), []);
});

test('a text node does not count as an action', () => {
  const input = visit(page([node({ text: text('Read more') })]));
  assert.deepEqual(run('ux/link-text', input), []);
});
