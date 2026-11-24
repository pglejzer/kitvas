import assert from 'node:assert/strict';
import { test } from 'node:test';
import { carryAcross, carryCopy, checkPaste, checkScope } from '../../src/edit/app/carry.ts';
import type { Span } from '../../src/edit/index.ts';

const KIT: ReadonlySet<string> = new Set(['Badge', 'Button', 'Card', 'Icon', 'Stack', 'Text']);

/** A section file whose function returns a `Stack` holding `lines`. */
function section(name: string, lines: readonly string[]): string {
  return [
    "import { Badge, Stack, Text } from '@kit';",
    '',
    `export function ${name}({ plan }: { plan: { name: string } }) {`,
    '  return (',
    '    <Stack>',
    ...lines.map((line) => `      ${line}`),
    '    </Stack>',
    '  );',
    '}',
    '',
  ].join('\n');
}

/** The span of the element written exactly as `element` in `text`. */
function spanOf(text: string, element: string): Span {
  const start = text.indexOf(element);
  assert.ok(start >= 0, `no ${element} in the text`);
  return { start, end: start + element.length };
}

const rule = (name: string, body: string): string => `.${name} {\n  ${body}\n}`;
const scss = (...rules: string[]): string => `${rules.join('\n\n')}\n`;

const PRICING_RULE = rule('pricing', 'display: grid;');
const TAG_RULE = rule('tag', 'color: var(--kit-color-accent);');
const FAQ_RULE = rule('faq', 'display: grid;');
const BADGE = '<Badge className="tag">New</Badge>';
const TARGET = section('Faq', ['<Text>Questions</Text>']);
const TARGET_AT = TARGET.indexOf('<Stack>');

/** `element` of `source` moved into the `Faq` section. */
function move(
  source: string,
  element: string,
  sourceScss: string | null,
  targetScss: string | null,
  kitNames?: ReadonlySet<string>,
) {
  return carryAcross({
    sourceText: source,
    sourceScss,
    targetText: TARGET,
    targetScss,
    subtree: spanOf(source, element),
    targetAt: TARGET_AT,
    kitNames,
  });
}

// ---- Class rules ---------------------------------------------------------------------------------

test('a class rule the subtree writes moves to the end of the target SCSS', () => {
  const source = section('Pricing', [BADGE, '<Text>Plans</Text>']);
  assert.deepEqual(move(source, BADGE, scss(PRICING_RULE, TAG_RULE), scss(FAQ_RULE)), {
    targetScss: scss(FAQ_RULE, TAG_RULE),
    sourceScss: scss(PRICING_RULE),
  });
});

test('a rule the target already has, written alike, is not written twice', () => {
  const source = section('Pricing', [BADGE]);
  const same = '.tag {\n    color: var(--kit-color-accent);\n}';
  assert.deepEqual(move(source, BADGE, scss(PRICING_RULE, TAG_RULE), scss(FAQ_RULE, same)), {
    targetScss: scss(FAQ_RULE, same),
    sourceScss: scss(PRICING_RULE),
  });
});

test('another rule of the same name in the target is a class clash', () => {
  const source = section('Pricing', [BADGE]);
  const other = scss(FAQ_RULE, rule('tag', 'color: red;'));
  assert.deepEqual(move(source, BADGE, scss(PRICING_RULE, TAG_RULE), other), {
    refused: 'class-clash',
  });
});

test('the rule stays in the source while another element there still writes the class', () => {
  const source = section('Pricing', [BADGE, '<Text className="tag">Plans</Text>']);
  assert.deepEqual(move(source, BADGE, scss(PRICING_RULE, TAG_RULE), scss(FAQ_RULE)), {
    targetScss: scss(FAQ_RULE, TAG_RULE),
    sourceScss: scss(PRICING_RULE, TAG_RULE),
  });
});

test('the rule stays in the source while another selector there names the class', () => {
  const source = section('Pricing', [BADGE]);
  const extending = scss(rule('pricing', '@extend .tag;'), TAG_RULE);
  assert.deepEqual(move(source, BADGE, extending, scss(FAQ_RULE)), {
    targetScss: scss(FAQ_RULE, TAG_RULE),
    sourceScss: extending,
  });
});

test('a class without a rule in the source carries nothing', () => {
  const loose = '<Badge className="loose">New</Badge>';
  const source = section('Pricing', [loose]);
  assert.deepEqual(move(source, loose, scss(PRICING_RULE), scss(FAQ_RULE)), {
    targetScss: scss(FAQ_RULE),
    sourceScss: scss(PRICING_RULE),
  });
});

test('the copied rule takes the line endings and the indent of the target', () => {
  const source = section('Pricing', [BADGE]);
  const target = '.faq {\r\n\tdisplay: grid;\r\n}\r\n';
  const result = move(source, BADGE, scss(PRICING_RULE, TAG_RULE), target);
  assert.deepEqual(result, {
    targetScss: `${target}\r\n.tag {\r\n\tcolor: var(--kit-color-accent);\r\n}\r\n`,
    sourceScss: scss(PRICING_RULE),
  });
});

test('a target without SCSS leaves the rule where it is: the stylesheet is one', () => {
  const source = section('Pricing', [BADGE]);
  assert.deepEqual(move(source, BADGE, scss(PRICING_RULE, TAG_RULE), null), {
    targetScss: null,
    sourceScss: scss(PRICING_RULE, TAG_RULE),
  });
});

test('with the kit names a move is checked for scope first', () => {
  const reads = '<Text className="tag">{plan.name}</Text>';
  const source = section('Pricing', [reads]);
  assert.deepEqual(move(source, reads, scss(TAG_RULE), scss(FAQ_RULE), KIT), {
    refused: 'scope',
  });
});

test('a copy takes the rules of its classes and leaves the SCSS it came from alone', () => {
  const copied = carryCopy({
    source: BADGE,
    fromScss: scss(PRICING_RULE, TAG_RULE),
    targetScss: scss(FAQ_RULE),
  });
  assert.deepEqual(copied, { targetScss: scss(FAQ_RULE, TAG_RULE) });
});

// ---- Scope ---------------------------------------------------------------------------------------

test('a subtree of kit components and literals may go to another file', () => {
  const source = section('Pricing', [BADGE]);
  assert.equal(checkScope(source, spanOf(source, BADGE), TARGET, TARGET_AT, KIT), null);
});

test('a subtree that reads a variable may not go to another file', () => {
  const reads = '<Text>{plan.name}</Text>';
  const source = section('Pricing', [reads]);
  assert.equal(checkScope(source, spanOf(source, reads), TARGET, TARGET_AT, KIT), 'scope');
});

test('a subtree that reads a variable may move within its own function body', () => {
  const reads = '<Text>{plan.name}</Text>';
  const source = section('Pricing', [BADGE, reads]);
  const at = source.indexOf(BADGE);
  assert.equal(checkScope(source, spanOf(source, reads), source, at, KIT), null);
});

test('a subtree that reads a variable may not move into another function of its file', () => {
  const reads = '<Text>{plan.name}</Text>';
  const text = [
    "import { Stack, Text } from '@kit';",
    '',
    'export function Pricing({ plan }: { plan: { name: string } }) {',
    '  return (',
    '    <Stack>',
    `      ${reads}`,
    '    </Stack>',
    '  );',
    '}',
    '',
    'function Aside() {',
    '  return <Stack className="aside" />;',
    '}',
    '',
  ].join('\n');
  const at = text.indexOf('<Stack className="aside" />');
  assert.equal(checkScope(text, spanOf(text, reads), text, at, KIT), 'scope');
});

test('a component of the file itself is unknown anywhere else', () => {
  const text = [
    "import { Stack } from '@kit';",
    '',
    'function PriceTag() {',
    '  return <span>9 EUR</span>;',
    '}',
    '',
    'export function Pricing() {',
    '  return (',
    '    <Stack>',
    '      <PriceTag />',
    '    </Stack>',
    '  );',
    '}',
    '',
  ].join('\n');
  const span = spanOf(text, '<PriceTag />');
  assert.equal(checkScope(text, span, TARGET, TARGET_AT, KIT), 'unknown-component');
});

test('a kit name the source binds itself is not the kit component', () => {
  const text = [
    "import { Stack } from '@kit';",
    '',
    'const Badge = () => <span />;',
    '',
    'export function Pricing() {',
    '  return (',
    '    <Stack>',
    '      <Badge />',
    '    </Stack>',
    '  );',
    '}',
    '',
  ].join('\n');
  const span = spanOf(text, '<Badge />');
  assert.equal(checkScope(text, span, TARGET, TARGET_AT, KIT), 'unknown-component');
});

test('a kit component may not go where the file binds its name to something else', () => {
  const source = section('Pricing', [BADGE]);
  const target = [
    "import { Stack } from '@kit';",
    '',
    'const Badge = () => <span />;',
    '',
    'export function Faq() {',
    '  return <Stack />;',
    '}',
    '',
  ].join('\n');
  const at = target.indexOf('<Stack />');
  assert.equal(checkScope(source, spanOf(source, BADGE), target, at, KIT), 'scope');
});

// ---- Paste ---------------------------------------------------------------------------------------

test('a pasted element or fragment of kit components and literals passes', () => {
  const row = '<Stack direction="row"><Badge tone="good">Paid</Badge></Stack>';
  assert.equal(checkPaste(row, KIT), null);
  assert.equal(checkPaste('  <><Text>One</Text><Text>Two</Text></>\n', KIT), null);
});

test('pasted text that is not one element or one fragment is invalid', () => {
  assert.equal(checkPaste('<Text>One</Text><Text>Two</Text>', KIT), 'invalid');
  assert.equal(checkPaste('Plain words', KIT), 'invalid');
  assert.equal(checkPaste('<Text>open', KIT), 'invalid');
  assert.equal(checkPaste('', KIT), 'invalid');
});

test('a pasted subtree that reads a variable is refused, a dotted tag on one too', () => {
  assert.equal(checkPaste('<Text>{plan.name}</Text>', KIT), 'scope');
  assert.equal(checkPaste('<motion.div>Hi</motion.div>', KIT), 'scope');
});

test('a pasted component the kit does not have is unknown', () => {
  assert.equal(checkPaste('<Chart data={[1, 2]} />', KIT), 'unknown-component');
});

test('a copy pasted into the function body it came from may read that body', () => {
  const reads = '<Text>{plan.name}</Text>';
  const source = section('Pricing', [reads]);
  const here = { text: source, at: source.indexOf('<Stack>') };
  assert.equal(checkPaste(reads, KIT, here), null);
  assert.equal(checkPaste(reads, KIT, { text: TARGET, at: TARGET_AT }), 'scope');
});
