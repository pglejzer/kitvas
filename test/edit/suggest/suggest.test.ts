import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Suggest, suggestFor } from '../../../src/edit/app/suggest/suggest.ts';
import { readTag } from '../../../src/edit/index.ts';
import type { KitComponent } from '../../../src/kit/index.ts';

type Prop = KitComponent['props'][number];

function component(name: string, category: string, props: Prop[] = []): KitComponent {
  return {
    name,
    category: category as KitComponent['category'],
    description: `${name} of the test kit.`,
    import: { from: '@kit', name },
    parts: [],
    styling: ['className'],
    props: [{ name: 'children', type: 'node', required: true }, ...props],
    state: [],
    examples: [],
    a11y: [],
    deprecated: false,
  };
}

const BUTTON = component('Button', 'action', [
  { name: 'variant', type: 'enum', values: ['solid', 'outline'] },
]);
const INPUT: KitComponent = {
  ...component('Input', 'input', [{ name: 'placeholder', type: 'string' }]),
  props: [{ name: 'placeholder', type: 'string' }],
};
const TEXT = component('Text', 'typography');
const HEADING = component('Heading', 'typography', [
  { name: 'level', type: 'number', required: true },
]);
const CARD = component('Card', 'layout');
const CATALOG = [BUTTON, INPUT, TEXT, HEADING, CARD];

type Options = Partial<{
  own: KitComponent | null;
  catalog: KitComponent[];
  format: 'scss' | 'tailwind';
  properties: string[];
  classes: string[];
}>;

/** The suggestion for the first element of `text`. */
function suggest(text: string, options: Options = {}): Suggest | null {
  const at = text.indexOf('<');
  const view = readTag(text, at);
  if (typeof view === 'string') assert.fail(`no tag in ${text}: ${view}`);
  return suggestFor({
    text,
    at,
    view,
    own: options.own ?? null,
    catalog: options.catalog ?? CATALOG,
    format: options.format ?? 'scss',
    properties: options.properties ?? [],
    classes: options.classes ?? [],
  });
}

test('a plain button looks like the kit Button and keeps its text and className', () => {
  const result = suggest('<button type="button" className="go" onClick={go}>Go</button>');
  assert.deepEqual(result, {
    component: 'Button',
    source: '<Button className="go">Go</Button>',
    dropped: ['onClick'],
  });
});

test('a type other than button is named as dropped', () => {
  const result = suggest('<button type="submit">Pay</button>');
  assert.deepEqual(result?.dropped, ['type']);
  assert.equal(result?.source, '<Button>Pay</Button>');
});

test('a self-closing input becomes the kit Input and names the props it lacks', () => {
  const result = suggest('<input type="text" placeholder="Name" />');
  assert.deepEqual(result, {
    component: 'Input',
    source: '<Input placeholder="Name" />',
    dropped: ['type'],
  });
});

test('a tag with no category, and a kit component, are never suggested over', () => {
  assert.equal(suggest('<span>Hi</span>'), null);
  assert.equal(suggest('<Button>Hi</Button>', { own: BUTTON }), null);
  assert.equal(suggest('<Card.Header>Hi</Card.Header>', { own: CARD }), null);
});

test('a tag whose category the catalog does not have is not suggested', () => {
  assert.equal(suggest('<button>Go</button>', { catalog: [TEXT, CARD] }), null);
});

test('a paragraph needs a component named Text, not any typography one', () => {
  assert.equal(suggest('<p>Hi</p>', { catalog: [HEADING, CARD] }), null);
  assert.equal(suggest('<p>Hi</p>', { catalog: [HEADING, TEXT] })?.component, 'Text');
});

test('a required prop the element cannot give leaves the offer with no source', () => {
  assert.deepEqual(suggest('<h2>Plans</h2>'), { component: 'Heading', source: '', dropped: [] });
});

test('a spread makes the replacement unsafe', () => {
  const result = suggest('<button {...rest}>Go</button>');
  assert.deepEqual(result, { component: 'Button', source: '', dropped: [] });
});

test('a div whose own rule sets background, radius and padding looks like a Card', () => {
  const properties = ['background-color', 'border-radius', 'padding-block', 'gap'];
  const result = suggest('<div className="plan"><p>Pro</p></div>', { properties });
  assert.deepEqual(result, {
    component: 'Card',
    source: '<Card className="plan"><p>Pro</p></Card>',
    dropped: [],
  });
});

test('a div missing one of the three, or a tag other than div and section, is no card', () => {
  const two = ['background-color', 'border-radius'];
  assert.equal(suggest('<div className="a">x</div>', { properties: two }), null);
  const three = [...two, 'padding'];
  assert.equal(suggest('<article className="a">x</article>', { properties: three }), null);
  assert.equal(
    suggest('<section className="a">x</section>', { properties: three })?.component,
    'Card',
  );
});

test('a card component is found by its name among layout and display components', () => {
  const panel = component('SidePanel', 'display');
  const three = ['background-color', 'border-radius', 'padding'];
  const wrong = component('Surface', 'action');
  const result = suggest('<div className="a">x</div>', {
    catalog: [wrong, panel],
    properties: three,
  });
  assert.equal(result?.component, 'SidePanel');
  assert.equal(
    suggest('<div className="a">x</div>', { catalog: [wrong], properties: three }),
    null,
  );
});

test('a Tailwind draft reads the card rule from the base utility classes only', () => {
  const classes = ['bg-surface', 'rounded-lg', 'p-4'];
  const result = suggest('<div className="bg-surface rounded-lg p-4">x</div>', {
    format: 'tailwind',
    classes,
  });
  assert.equal(result?.component, 'Card');
  const prefixed = ['bg-surface', 'rounded-lg', 'md:p-4'];
  assert.equal(
    suggest('<div className="a">x</div>', { format: 'tailwind', classes: prefixed }),
    null,
  );
});

test('a deprecated component is never suggested', () => {
  const old: KitComponent = { ...BUTTON, deprecated: true };
  assert.equal(suggest('<button>Go</button>', { catalog: [old] }), null);
});
