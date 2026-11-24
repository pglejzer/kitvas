import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  applyTsx,
  offsetOf,
  openingTags,
  readTag,
  type TsxOp,
} from '../../../src/edit/domain/tsx/apply-tsx.ts';
import {
  type ApplyOptions,
  type ApplyResult,
  type EditOp,
  inverse,
  type PropValue,
  type Span,
  type TagView,
} from '../../../src/edit/index.ts';

const id = 'sections/Hero:div/Button';
const KEEP: ApplyOptions = { force: false };
const FORCE: ApplyOptions = { force: true };
const CONFLICT = { conflict: 'changed' };

const str = (value: string): PropValue => ({ kind: 'string', value });
const num = (value: number): PropValue => ({ kind: 'number', value });
const bool = (value: boolean): PropValue => ({ kind: 'boolean', value });

function setProp(
  name: string,
  value: PropValue,
  before: PropValue | null,
  after: string | null = null,
): TsxOp {
  return { op: 'setProp', id, name, value, before, after };
}
const removeProp = (name: string, before: PropValue, after: string | null = null): TsxOp => ({
  op: 'removeProp',
  id,
  name,
  before,
  after,
});
const setText = (value: string, before: string): TsxOp => ({ op: 'setText', id, value, before });
const addClass = (className: string): TsxOp => ({ op: 'addClass', id, className });
const removeClass = (className: string): TsxOp => ({ op: 'removeClass', id, className });

function tsxOp(op: EditOp): TsxOp {
  if (
    op.op === 'setProp' ||
    op.op === 'removeProp' ||
    op.op === 'setText' ||
    op.op === 'addClass' ||
    op.op === 'removeClass'
  ) {
    return op;
  }
  throw new Error('not a TSX operation');
}

/** Applies `op` to the first `<tag` of the text. */
function run(text: string, tag: string, op: TsxOp, options: ApplyOptions = KEEP): ApplyResult {
  return applyTsx(text, text.indexOf(`<${tag}`), op, options);
}

function applied(result: ApplyResult): { text: string; changed: Span[] } {
  if (!('text' in result)) throw new Error(`not applied: ${JSON.stringify(result)}`);
  return result;
}

const textOf = (text: string, tag: string, op: TsxOp, options: ApplyOptions = KEEP): string =>
  applied(run(text, tag, op, options)).text;

function tagAt(text: string, tag: string): TagView {
  const view = readTag(text, text.indexOf(`<${tag}`));
  if (typeof view === 'string') throw new Error(`no tag: ${view}`);
  return view;
}

/** The op changes the text to `expected`, only inside its span, and its inverse undoes it. */
function exact(text: string, tag: string, op: TsxOp, expected: string): void {
  const result = applied(run(text, tag, op));
  assert.equal(result.text, expected);
  const span = result.changed[0];
  assert.ok(span !== undefined && result.changed.length === 1);
  assert.equal(result.text.slice(0, span.start), text.slice(0, span.start));
  const tail = result.text.slice(span.end);
  assert.equal(tail, text.slice(text.length - tail.length));
  assert.equal(textOf(result.text, tag, tsxOp(inverse(op))), text);
}

const shape = (view: TagView): unknown[] =>
  view.props.map((prop) =>
    prop.kind === 'literal' ? [prop.name, prop.value.value] : [prop.name, 'expr', prop.source],
  );

describe('offsetOf', () => {
  test('counts lines from 1 by line feeds and columns from 1', () => {
    const text = 'a\nbc\ndef';
    assert.equal(offsetOf(text, 1, 1), 0);
    assert.equal(offsetOf(text, 2, 2), 3);
    assert.equal(offsetOf(text, 3, 3), 7);
  });

  test('answers -1 for a line the text does not have and for a place before 1', () => {
    assert.equal(offsetOf('a\nb', 3, 1), -1);
    assert.equal(offsetOf('a\nb', 0, 1), -1);
    assert.equal(offsetOf('a\nb', 1, 0), -1);
    assert.equal(readTag('a\nb', offsetOf('a\nb', 3, 1)), 'not-found');
  });

  test('finds a tag on the second line of a CRLF file', () => {
    const text = 'a\r\n<b />';
    assert.equal(offsetOf(text, 2, 1), 3);
    assert.equal(tagAt(text, 'b').name, 'b');
  });

  test('finds a tag after a Polish word by the column in UTF-16 units', () => {
    const text =
      'export const A = () => (\n  <p>\n    Zażółć gęślą jaźń <b>teraz</b>\n  </p>\n);\n';
    // esbuild gives line 3, column 23; in UTF-8 bytes the tag would be at column 32.
    const at = offsetOf(text, 3, 23);
    assert.equal(at, text.indexOf('<b>'));
    const view = readTag(text, at);
    assert.ok(typeof view !== 'string');
    assert.equal(view.name, 'b');
    assert.equal(view.text?.value, 'teraz');
  });
});

describe('readTag', () => {
  test('reads each way a prop is written', () => {
    const text =
      '<Button variant="solid" size=\'sm\' count={3} offset={-1.5} disabled ' +
      'loading={false} open={true} label={"Go"} tone={tone} />';
    const view = tagAt(text, 'Button');
    assert.equal(view.name, 'Button');
    assert.deepEqual(view.span, { start: 0, end: text.length });
    assert.equal(view.selfClosing, true);
    assert.equal(view.spread, false);
    assert.equal(view.className, null);
    assert.equal(view.text, null);
    assert.deepEqual(shape(view), [
      ['variant', 'solid'],
      ['size', 'sm'],
      ['count', 3],
      ['offset', -1.5],
      ['disabled', true],
      ['loading', false],
      ['open', true],
      ['label', 'expr', '"Go"'],
      ['tone', 'expr', 'tone'],
    ]);
    const first = view.props[0];
    assert.equal(text.slice(first?.span.start, first?.span.end), 'variant="solid"');
  });

  test('reads a dotted name, a spread, a string className and the text', () => {
    const text = '<Card.Header {...rest} className="head big" id="x">Title</Card.Header>';
    const view = tagAt(text, 'Card.Header');
    assert.equal(view.name, 'Card.Header');
    assert.equal(view.spread, true);
    assert.equal(view.selfClosing, false);
    assert.deepEqual(shape(view), [['id', 'x']]);
    assert.equal(view.className?.kind, 'string');
    assert.equal(
      text.slice(view.className?.span.start, view.className?.span.end),
      'className="head big"',
    );
    assert.equal(view.text?.value, 'Title');
    assert.equal(text.slice(view.text?.span.start, view.text?.span.end), 'Title');
  });

  test('reads a className built in code as an expression', () => {
    const view = tagAt("<div className={cx('a', b)} />", 'div');
    assert.deepEqual(view.className, {
      kind: 'expr',
      source: "cx('a', b)",
      span: { start: 5, end: 27 },
    });
  });

  test('answers not-found where no tag starts', () => {
    assert.equal(readTag('const a = 1;', 0), 'not-found');
    assert.equal(readTag('a < b', 2), 'not-found');
    assert.equal(readTag('<>x</>', 0), 'not-found');
    assert.equal(readTag('<a b="1', 0), 'not-found');
  });

  test('is not misled by strings, templates, comments, a regex or JSX inside braces', () => {
    const text = [
      '<Card',
      '  title="a > b"',
      "  note={'}'}",
      `  hint={\`\${ok ? \`}\` : ">"}\`}`,
      '  /* size="xl" > */',
      '  // tone="bad" />',
      '  icon={<Icon name="x" />}',
      "  footer={ok ? <Text>Don't {/* } */}</Text> : null}",
      '  match={/[/}]"/}',
      '  size="md"',
      '>',
      "  It's fine",
      '</Card>',
    ].join('\n');
    const view = tagAt(text, 'Card');
    assert.deepEqual(
      view.props.map((prop) => prop.name),
      ['title', 'note', 'hint', 'icon', 'footer', 'match', 'size'],
    );
    assert.deepEqual(shape(view).at(-1), ['size', 'md']);
    assert.equal(view.text?.value, "It's fine");
    exact(text, 'Card', setProp('size', str('lg'), str('md')), text.replace('"md"', '"lg"'));
  });

  test('reads a tag written across lines', () => {
    const text = ['<Button', '  variant="solid"', '  disabled', '>', '  Save', '</Button>'].join(
      '\n',
    );
    const view = tagAt(text, 'Button');
    assert.deepEqual(shape(view), [
      ['variant', 'solid'],
      ['disabled', true],
    ]);
    assert.equal(view.span.end, text.indexOf('>') + 1);
    assert.equal(view.text?.value, 'Save');
  });

  test('has no text for an expression, mixed children, nothing, or text over lines', () => {
    for (const text of [
      '<p>{plan.name}</p>',
      '<p>Hi {name}</p>',
      '<p>Hi <b>x</b></p>',
      '<p></p>',
      '<p>  \n</p>',
      '<p />',
      '<p>\n  one\n  two\n</p>',
    ]) {
      assert.equal(tagAt(text, 'p').text, null, text);
      assert.deepEqual(run(text, 'p', setText('New', 'Hi')), { refused: 'no-text' }, text);
    }
  });
});

describe('openingTags', () => {
  test('finds a tag beside JSX text with an apostrophe inside braces', () => {
    const text = [
      '<Stack gap="lg">',
      "  {cond ? <Text>Don't</Text> : null}",
      '  <Button size="md">Go</Button>',
      '</Stack>',
    ].join('\n');
    assert.deepEqual(openingTags(text), [0, text.indexOf('<Text'), text.indexOf('<Button')]);
    exact(text, 'Button', setProp('size', str('sm'), str('md')), text.replace('"md"', '"sm"'));
    exact(text, 'Text', setText("It's", "Don't"), text.replace("Don't", "It's"));
  });

  test('passes over type arguments, comparisons, strings, comments and fragments', () => {
    const text = [
      "import { type ComponentPropsWithRef, useRef } from 'react';",
      "type Props = Omit<ComponentPropsWithRef<'button'>, 'children'> & { n: number };",
      'const pick = <T,>(value: T): T => value;',
      '// <Ghost /> in a comment',
      "const s = '<Fake />' + `<Other />`;",
      'export function A({ n }: Props) {',
      '  const ref = useRef<HTMLButtonElement>(null);',
      '  if (n < 3 && n > 1) return null;',
      '  return (',
      '    // the real one',
      '    <button ref={ref}>',
      '      <>{n > 2 ? <b>big</b> : <i>small</i>}</>',
      '    </button>',
      '  );',
      '}',
    ].join('\n');
    assert.deepEqual(openingTags(text), [
      text.indexOf('<button'),
      text.indexOf('<b>'),
      text.indexOf('<i>'),
    ]);
  });
});

describe('applyTsx: props', () => {
  const button = '<Button variant="solid" size=\'md\'>Go</Button>';

  test('changes only the value of an existing prop and keeps its quotes', () => {
    const expected = '<Button variant="solid" size=\'sm\'>Go</Button>';
    exact(button, 'Button', setProp('size', str('sm'), str('md')), expected);
    const result = applied(run(button, 'Button', setProp('size', str('sm'), str('md'))));
    const at = button.indexOf('md');
    assert.deepEqual(result.changed, [{ start: at, end: at + 2 }]);
  });

  test('rewrites the whole prop when the kind changes', () => {
    const set = (value: PropValue): string =>
      textOf(button, 'Button', setProp('variant', value, str('solid')));
    assert.equal(set(num(2)), "<Button variant={2} size='md'>Go</Button>");
    assert.equal(set(bool(true)), "<Button variant size='md'>Go</Button>");
    assert.equal(set(bool(false)), "<Button variant={false} size='md'>Go</Button>");
    const bare = '<Button disabled>Go</Button>';
    assert.equal(
      textOf(bare, 'Button', setProp('disabled', str('yes'), bool(true))),
      '<Button disabled="yes">Go</Button>',
    );
  });

  test('writes a number inside its braces', () => {
    const grid = '<Grid columns={3} gap={ -1.5 } />';
    exact(grid, 'Grid', setProp('columns', num(4), num(3)), '<Grid columns={4} gap={ -1.5 } />');
    exact(grid, 'Grid', setProp('gap', num(2), num(-1.5)), '<Grid columns={3} gap={ 2 } />');
  });

  test('writes true as the bare name and false in braces', () => {
    const bare = '<Button disabled>Go</Button>';
    const off = '<Button disabled={false}>Go</Button>';
    exact(bare, 'Button', setProp('disabled', bool(false), bool(true)), off);
    exact(off, 'Button', setProp('disabled', bool(true), bool(false)), bare);
  });

  test('writes a string with a double quote in single quotes and refuses both quotes', () => {
    const double = '<a title="x" />';
    const single = "<a title='x' />";
    assert.equal(
      textOf(double, 'a', setProp('title', str('say "hi"'), str('x'))),
      '<a title=\'say "hi"\' />',
    );
    assert.equal(
      textOf(single, 'a', setProp('title', str("it's"), str('x'))),
      '<a title="it\'s" />',
    );
    assert.equal(
      textOf('<a />', 'a', setProp('title', str('say "hi"'), null)),
      '<a title=\'say "hi"\' />',
    );
    const both = str('"it\'s"');
    assert.deepEqual(run(double, 'a', setProp('title', both, str('x'))), { refused: 'invalid' });
    assert.deepEqual(run('<a />', 'a', setProp('title', both, null)), { refused: 'invalid' });
  });

  test('answers a conflict when the prop does not hold the value seen before', () => {
    assert.deepEqual(run(button, 'Button', setProp('size', str('sm'), str('lg'))), CONFLICT);
    assert.deepEqual(run(button, 'Button', setProp('size', str('sm'), num(1))), CONFLICT);
    assert.deepEqual(run(button, 'Button', setProp('size', str('sm'), null)), CONFLICT);
    assert.deepEqual(run(button, 'Button', setProp('tone', str('info'), str('bad'))), CONFLICT);
    assert.deepEqual(run(button, 'Button', removeProp('size', str('lg'))), CONFLICT);
    assert.deepEqual(run(button, 'Button', removeProp('tone', str('info'))), CONFLICT);
  });

  test('writes over a changed value with force, and still refuses a prop that is gone', () => {
    assert.equal(
      textOf(button, 'Button', setProp('size', str('sm'), str('lg')), FORCE),
      '<Button variant="solid" size=\'sm\'>Go</Button>',
    );
    assert.equal(
      textOf(button, 'Button', setProp('tone', str('info'), str('bad'), 'size'), FORCE),
      '<Button variant="solid" size=\'md\' tone="info">Go</Button>',
    );
    assert.equal(
      textOf(button, 'Button', removeProp('size', str('lg')), FORCE),
      '<Button variant="solid">Go</Button>',
    );
    assert.deepEqual(run(button, 'Button', removeProp('tone', str('info')), FORCE), {
      refused: 'not-found',
    });
  });

  test('refuses a prop written as an expression, with force too', () => {
    const text = '<Badge variant={tone} label={"Go"}>New</Badge>';
    const computed = { refused: 'computed' };
    assert.deepEqual(run(text, 'Badge', setProp('variant', str('info'), str('bad'))), computed);
    assert.deepEqual(run(text, 'Badge', setProp('label', str('Stop'), str('Go'))), computed);
    assert.deepEqual(run(text, 'Badge', removeProp('variant', str('bad')), FORCE), computed);
  });

  test('refuses a prop the tag leaves to a spread, and edits one it writes itself', () => {
    const text = '<Button {...rest} size="md">Go</Button>';
    const spread = { refused: 'spread' };
    assert.deepEqual(run(text, 'Button', setProp('tone', str('info'), null)), spread);
    assert.deepEqual(run(text, 'Button', removeProp('tone', str('info'))), spread);
    exact(text, 'Button', setProp('size', str('sm'), str('md')), text.replace('md', 'sm'));
  });

  test('refuses a prop the tag writes twice', () => {
    const text = '<a x="1" x="2" />';
    assert.deepEqual(run(text, 'a', setProp('x', str('3'), str('1'))), { refused: 'ambiguous' });
  });

  test('answers not-found when the offset is not a tag', () => {
    const op = setProp('size', str('sm'), null);
    assert.deepEqual(applyTsx(button, 1, op, KEEP), { refused: 'not-found' });
    assert.deepEqual(applyTsx(button, -1, op, KEEP), { refused: 'not-found' });
    assert.deepEqual(applyTsx('a < b', 2, op, KEEP), { refused: 'not-found' });
  });
});

describe('applyTsx: inserting and removing props', () => {
  const lines = ['<Button', '  variant="solid"', '  size="md"', '>', '  Save', '</Button>'];
  const tall = lines.join('\n');

  test('inserts after the tag name with one space when the tag has no props', () => {
    exact(
      '<Button>Go</Button>',
      'Button',
      setProp('disabled', bool(true), null),
      '<Button disabled>Go</Button>',
    );
    exact('<Icon />', 'Icon', setProp('name', str('x'), null), '<Icon name="x" />');
    exact('<br/>', 'br', setProp('data-rt', str('1'), null), '<br data-rt="1"/>');
  });

  test('inserts right after the prop named by after', () => {
    const text = '<Button variant="solid" size="md">Go</Button>';
    exact(
      text,
      'Button',
      setProp('tone', str('info'), null, 'variant'),
      '<Button variant="solid" tone="info" size="md">Go</Button>',
    );
    exact(
      text,
      'Button',
      setProp('count', num(2), null, 'size'),
      '<Button variant="solid" size="md" count={2}>Go</Button>',
    );
    exact(
      text,
      'Button',
      setProp('tone', str('info'), null),
      '<Button tone="info" variant="solid" size="md">Go</Button>',
    );
  });

  test('gives a new prop its own line with the indent of the first prop', () => {
    const after = [...lines.slice(0, 2), '  tone="info"', ...lines.slice(2)].join('\n');
    exact(tall, 'Button', setProp('tone', str('info'), null, 'variant'), after);
    const first = [lines[0], '  tone="info"', ...lines.slice(1)].join('\n');
    exact(tall, 'Button', setProp('tone', str('info'), null), first);
    const result = applied(run(tall, 'Button', setProp('tone', str('info'), null)));
    const span = result.changed[0];
    assert.equal(result.text.slice(span?.start, span?.end), '\n  tone="info"');
  });

  test('answers not-found when the prop named by after is not on the tag', () => {
    assert.deepEqual(run(tall, 'Button', setProp('tone', str('info'), null, 'color')), {
      refused: 'not-found',
    });
  });

  test('removes a prop with the whitespace in front of it', () => {
    const wide = '<Button variant="solid"  size="md">Go</Button>';
    const result = applied(run(wide, 'Button', removeProp('size', str('md'), 'variant')));
    assert.equal(result.text, '<Button variant="solid">Go</Button>');
    const at = '<Button variant="solid"'.length;
    assert.deepEqual(result.changed, [{ start: at, end: at }]);
    exact(
      tall,
      'Button',
      removeProp('size', str('md'), 'variant'),
      [...lines.slice(0, 2), ...lines.slice(3)].join('\n'),
    );
    exact(
      tall,
      'Button',
      removeProp('variant', str('solid')),
      [lines[0], ...lines.slice(2)].join('\n'),
    );
  });
});

describe('applyTsx: classes', () => {
  test('adds a className right after the tag name', () => {
    exact('<div>x</div>', 'div', addClass('card'), '<div className="card">x</div>');
    const tall = ['<Card', '  title="A"', '/>'].join('\n');
    const expected = ['<Card', '  className="card"', '  title="A"', '/>'].join('\n');
    exact(tall, 'Card', addClass('card'), expected);
  });

  test('refuses addClass on a tag that has any className', () => {
    const has = { refused: 'has-class' };
    assert.deepEqual(run('<div className="a" />', 'div', addClass('card')), has);
    assert.deepEqual(run('<div className={cx(a)} />', 'div', addClass('card')), has);
  });

  test('removes a className only when it is exactly that string', () => {
    exact('<div className="card">x</div>', 'div', removeClass('card'), '<div>x</div>');
    const gone = { refused: 'not-found' };
    assert.deepEqual(run('<div className="card big" />', 'div', removeClass('card')), gone);
    assert.deepEqual(run('<div className={card} />', 'div', removeClass('card')), gone);
    assert.deepEqual(run('<div id="card" />', 'div', removeClass('card')), gone);
  });
});

describe('applyTsx: text', () => {
  test('replaces only the trimmed text and keeps the whitespace around it', () => {
    const text = '<p>\n\t  Hello there \n</p>';
    exact(text, 'p', setText('Bye', 'Hello there'), '<p>\n\t  Bye \n</p>');
    exact('<p>Hi</p>', 'p', setText('Hello, you', 'Hi'), '<p>Hello, you</p>');
  });

  test('treats an apostrophe in JSX text as text', () => {
    const text = '<div><p>Don\'t</p><Button size="md">It\'s</Button></div>';
    exact(text, 'p', setText("Can't", "Don't"), text.replace("Don't", "Can't"));
    exact(text, 'Button', setProp('size', str('sm'), str('md')), text.replace('md', 'sm'));
    assert.deepEqual(openingTags(text), [0, text.indexOf('<p'), text.indexOf('<Button')]);
  });

  test('refuses a value that would not stay one plain text', () => {
    for (const value of ['a{b', 'a}b', 'a<b', 'a>b', 'a\nb', 'a\rb', '', ' a', 'a ']) {
      assert.deepEqual(run('<p>Hi</p>', 'p', setText(value, 'Hi')), { refused: 'invalid' }, value);
    }
  });

  test('answers a conflict when the text changed, and writes over it with force', () => {
    assert.deepEqual(run('<p>Hi</p>', 'p', setText('Yo', 'Hello')), CONFLICT);
    assert.equal(textOf('<p>Hi</p>', 'p', setText('Yo', 'Hello'), FORCE), '<p>Yo</p>');
  });
});

describe('applyTsx: a CRLF file indented with tabs', () => {
  const text =
    '<Stack>\r\n\t<Button\r\n\t\tvariant="solid"\r\n\t\tsize="md"\r\n\t>\r\n' +
    '\t\tSave\r\n\t</Button>\r\n</Stack>\r\n';

  test('changes nothing outside the span of a value or a text', () => {
    exact(text, 'Button', setProp('size', str('lg'), str('md')), text.replace('"md"', '"lg"'));
    exact(text, 'Button', setText('Send', 'Save'), text.replace('Save', 'Send'));
  });

  test('inserts and removes whole lines with their CRLF and tabs', () => {
    exact(
      text,
      'Button',
      setProp('tone', str('info'), null, 'size'),
      text.replace('size="md"', 'size="md"\r\n\t\ttone="info"'),
    );
    exact(
      text,
      'Button',
      removeProp('variant', str('solid')),
      text.replace('\r\n\t\tvariant="solid"', ''),
    );
    exact(text, 'Stack', addClass('list'), text.replace('<Stack>', '<Stack className="list">'));
  });
});
