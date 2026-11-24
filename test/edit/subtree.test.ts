// The subtree reader (plan 14, task A1): spans, children, parents, contexts, function bodies and
// free names, on every real `.tsx` file of the fixtures and kits and on a file written to be hard.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  childrenOf,
  contextOf,
  elementSpan,
  freeIdentifiers,
  functionBodyOf,
  isMixed,
  parentOf,
} from '../../src/edit/domain/subtree.ts';
import { openingTags } from '../../src/edit/domain/tsx-reader.ts';
import type { Span } from '../../src/edit/domain/types.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FOLDERS = [join(ROOT, 'test', 'fixtures'), join(ROOT, 'kits')];
const DOLLAR = '$';

function tsxFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : tsxFiles(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

/** `@{` stands for a template's `${`, so no line here looks like a template by mistake. */
const HARD = [
  "import { Card, Stack, Text } from '@kit';",
  '',
  '// a comment with <div> and } in it',
  '/* another <span> { */',
  'const pick = <T,>(x: T) => x;',
  'const tag = /<div>{2}\\/}/;',
  "const label = `a @{'}'} b @{`<i>@{1}</i>`}`;",
  '',
  'export function Hard({ items, cond, tone }) {',
  '  return (',
  '    <>',
  '      <Stack',
  '        gap="md" // a line comment with > and <b>',
  '        title={<Text tone={tone}>Title</Text>}',
  '      >',
  '        {/* a JSX comment with <p> and } */}',
  '        {cond && <Card>shown</Card>}',
  '        {cond ? <Text>yes</Text> : <Text>no</Text>}',
  '        {items.map((item) => (',
  '          <Card key={item.id}>',
  '            <Text>{item.name}</Text>',
  '          </Card>',
  '        ))}',
  "        <Text>It's Bob's {label} text</Text>",
  '        <br />',
  '      </Stack>',
  '    </>',
  '  );',
  '}',
  '',
]
  .join('\n')
  .replaceAll('@{', `${DOLLAR}{`);

function at(text: string, needle: string): number {
  const index = text.indexOf(needle);
  assert.ok(index >= 0, `"${needle}" is in the text`);
  return index;
}

function sourceOf(text: string, start: number): string {
  const span = elementSpan(text, start);
  assert.ok(span !== null, `an element at ${start}`);
  return text.slice(span.start, span.end);
}

/** The free names of a whole snippet. */
const free = (source: string): string[] =>
  freeIdentifiers(source, { start: 0, end: source.length });

const FRAGMENT = at(HARD, '<>');
const STACK = at(HARD, '<Stack');
const SLOT = at(HARD, '<Text tone');
const SHOWN = at(HARD, '<Card>shown');
const YES = at(HARD, '<Text>yes');
const NO = at(HARD, '<Text>no');
const ITEM = at(HARD, '<Card key');
const ITEM_TEXT = at(HARD, '<Text>{item.name}');
const WORDS = at(HARD, "<Text>It's");
const BREAK = at(HARD, '<br />');

describe('every element of the fixtures and kits', () => {
  const files = FOLDERS.flatMap(tsxFiles);
  let elements = 0;

  for (const file of files) {
    const name = relative(ROOT, file).replaceAll('\\', '/');

    test(`has a whole span that holds its children in ${name}`, () => {
      const text = readFileSync(file, 'utf8');
      for (const start of openingTags(text)) {
        const where = `${name} at ${start}`;
        const span = elementSpan(text, start);
        assert.ok(span !== null, where);
        elements += 1;
        assert.equal(span.start, start, where);
        assert.equal(text.charAt(span.start), '<', where);
        assert.equal(text.charAt(span.end - 1), '>', where);

        const children = childrenOf(text, start);
        assert.ok(children !== null, where);
        let end = start;
        for (const child of children) {
          assert.ok(child.span.start >= end && child.span.end < span.end, `${where}: in order`);
          end = child.span.end;
          if (child.kind !== 'element') continue;
          assert.deepEqual(elementSpan(text, child.span.start), child.span, where);
          assert.equal(parentOf(text, child.span.start), start, `${where}: the child's parent`);
          assert.notEqual(contextOf(text, child.span.start), 'expression', where);
        }

        const parent = parentOf(text, start);
        if (parent !== null) {
          const around = elementSpan(text, parent);
          assert.ok(around !== null && around.start < start && span.end <= around.end, where);
        }
        const body = functionBodyOf(text, start);
        assert.ok(body === null || (body.start <= start && span.end <= body.end), where);
      }
    });
  }

  test('were found at all', () => {
    assert.ok(files.length > 10);
    assert.ok(elements > 20);
  });
});

describe('elementSpan', () => {
  test('finds only the real elements of the hard file', () => {
    const tags = openingTags(HARD);
    assert.deepEqual(tags, [STACK, SLOT, SHOWN, YES, NO, ITEM, ITEM_TEXT, WORDS, BREAK]);
    for (const start of tags) {
      const source = sourceOf(HARD, start);
      assert.ok(source.startsWith('<') && source.endsWith('>'), source);
    }
  });

  test('reads a multi-line tag with a line comment to its closing tag', () => {
    const source = sourceOf(HARD, STACK);
    assert.ok(source.startsWith('<Stack\n'));
    assert.ok(source.endsWith('<br />\n      </Stack>'));
  });

  test('reads a fragment from <> to </>', () => {
    const source = sourceOf(HARD, FRAGMENT);
    assert.ok(source.startsWith('<>\n      <Stack'));
    assert.ok(source.endsWith('</Stack>\n    </>'));
  });

  test('reads a self-closing element and JSX in a prop', () => {
    assert.equal(sourceOf(HARD, BREAK), '<br />');
    assert.equal(sourceOf(HARD, SLOT), '<Text tone={tone}>Title</Text>');
    assert.equal(sourceOf(HARD, SHOWN), '<Card>shown</Card>');
    assert.equal(sourceOf(HARD, WORDS), "<Text>It's Bob's {label} text</Text>");
  });

  test('is null where no element starts', () => {
    assert.equal(elementSpan(HARD, at(HARD, '<T,>')), null);
    assert.equal(elementSpan(HARD, at(HARD, '</Stack>')), null);
    assert.equal(elementSpan(HARD, at(HARD, 'export')), null);
    assert.equal(elementSpan(HARD, HARD.length + 5), null);
    assert.equal(elementSpan('<div>never closed', 0), null);
  });
});

describe('childrenOf', () => {
  const kinds = (text: string, start: number): string[] =>
    (childrenOf(text, start) ?? []).map((child) => child.kind);

  test('lists the direct children in order, an expression as one child', () => {
    assert.deepEqual(kinds(HARD, STACK), ['expr', 'expr', 'expr', 'expr', 'element', 'element']);
    const children = childrenOf(HARD, STACK) ?? [];
    assert.equal(
      HARD.slice(children[0]?.span.start, children[0]?.span.end),
      '{/* a JSX comment with <p> and } */}',
    );
    assert.equal(children[4]?.span.start, WORDS);
    assert.equal(children[5]?.span.start, BREAK);
    assert.deepEqual(kinds(HARD, FRAGMENT), ['element']);
  });

  test('keeps text as the raw run, apostrophes and all', () => {
    const children = childrenOf(HARD, WORDS) ?? [];
    const sources = children.map((child) => HARD.slice(child.span.start, child.span.end));
    assert.deepEqual(kinds(HARD, WORDS), ['text', 'expr', 'text']);
    assert.deepEqual(sources, ["It's Bob's ", '{label}', ' text']);
  });

  test('leaves blank runs out', () => {
    const text = '<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>';
    assert.deepEqual(kinds(text, 0), ['element', 'element']);
  });

  test('is empty for a self-closing element and null for no element', () => {
    assert.deepEqual(childrenOf(HARD, BREAK), []);
    assert.equal(childrenOf(HARD, at(HARD, 'export')), null);
  });
});

describe('parentOf and contextOf', () => {
  test('a root has no parent and is plain, a fragment is a parent', () => {
    assert.equal(parentOf(HARD, FRAGMENT), null);
    assert.equal(contextOf(HARD, FRAGMENT), 'plain');
    assert.equal(parentOf(HARD, STACK), FRAGMENT);
    assert.equal(contextOf(HARD, STACK), 'plain');
    assert.equal(parentOf(HARD, WORDS), STACK);
    assert.equal(contextOf(HARD, BREAK), 'plain');
  });

  test('an element in a {…} child has the element around it as its parent', () => {
    for (const start of [SHOWN, YES, NO, ITEM]) {
      assert.equal(parentOf(HARD, start), STACK);
      assert.equal(contextOf(HARD, start), 'expression');
    }
  });

  test('a child of a mapped item is plain under that item', () => {
    assert.equal(parentOf(HARD, ITEM_TEXT), ITEM);
    assert.equal(contextOf(HARD, ITEM_TEXT), 'plain');
  });

  test('JSX in a prop is a slot of the element that writes the prop', () => {
    assert.equal(parentOf(HARD, SLOT), STACK);
    assert.equal(contextOf(HARD, SLOT), 'slot');
  });

  test('what a slot holds is a slot too, but an expression inside it is an expression', () => {
    const text = [
      'const a = (',
      '  <Card title={<Stack><Text>One</Text>{on && <Badge />}</Stack>} footer=<Text>Two</Text>>',
      '    <Text>Body</Text>',
      '  </Card>',
      ');',
    ].join('\n');
    const card = at(text, '<Card');
    const stack = at(text, '<Stack>');
    assert.equal(contextOf(text, stack), 'slot');
    assert.equal(parentOf(text, stack), card);
    assert.equal(contextOf(text, at(text, '<Text>One')), 'slot');
    assert.equal(parentOf(text, at(text, '<Text>One')), stack);
    assert.equal(contextOf(text, at(text, '<Badge')), 'expression');
    assert.equal(parentOf(text, at(text, '<Badge')), stack);
    assert.equal(contextOf(text, at(text, '<Text>Two')), 'slot');
    assert.equal(parentOf(text, at(text, '<Text>Two')), card);
    assert.equal(contextOf(text, at(text, '<Text>Body')), 'plain');
  });

  test('an offset that starts no element is a plain root', () => {
    assert.equal(parentOf(HARD, WORDS + 7), null);
    assert.equal(contextOf(HARD, WORDS + 7), 'plain');
  });
});

describe('isMixed', () => {
  test('is true only for text and elements side by side', () => {
    assert.equal(isMixed('<p>Hello <b>world</b></p>', 0), true);
    assert.equal(isMixed('<p><b>a</b> <i>b</i></p>', 0), false);
    assert.equal(isMixed('<p>{name} is here</p>', 0), false);
    assert.equal(isMixed('<p>plain</p>', 0), false);
    assert.equal(isMixed('<br />', 0), false);
    assert.equal(isMixed(HARD, STACK), false);
    assert.equal(isMixed(HARD, WORDS), false);
  });
});

describe('functionBodyOf', () => {
  const bodyOf = (text: string, needle: string): string | null => {
    const body = functionBodyOf(text, at(text, needle));
    return body === null ? null : text.slice(body.start, body.end);
  };

  test('is the braces of the function that returns the element', () => {
    const body: Span = { start: at(HARD, '{\n  return'), end: HARD.lastIndexOf('}') + 1 };
    assert.deepEqual(functionBodyOf(HARD, FRAGMENT), body);
    assert.deepEqual(functionBodyOf(HARD, STACK), body);
    assert.deepEqual(functionBodyOf(HARD, SLOT), body);
    assert.deepEqual(functionBodyOf(HARD, SHOWN), body);
  });

  test('is the parentheses of an arrow that gives its JSX without braces', () => {
    const body: Span = { start: at(HARD, '(\n          <Card key'), end: at(HARD, '))}') + 1 };
    assert.deepEqual(functionBodyOf(HARD, ITEM), body);
    assert.deepEqual(functionBodyOf(HARD, ITEM_TEXT), body);
  });

  test('reads arrows with and without braces', () => {
    assert.equal(bodyOf('const A = () => <div />;', '<div'), '<div />');
    assert.equal(bodyOf('const A = () => (<div />);', '<div'), '(<div />)');
    assert.equal(bodyOf('const A = () => { return <div />; };', '<div'), '{ return <div />; }');
    assert.equal(
      bodyOf('const A = () => <ul>{xs.map((x) => { return <li />; })}</ul>;', '<li'),
      '{ return <li />; }',
    );
    assert.equal(bodyOf('<ul>{xs.map((x) => <li />, 2)}</ul>', '<li'), '<li />');
  });

  test('takes a method body and never a block of an if', () => {
    const method = 'class C { render() { return <div />; } }';
    assert.equal(bodyOf(method, '<div'), '{ return <div />; }');
    const block = 'function F(a): Node { if (a) { return <i />; } return <b />; }';
    assert.equal(bodyOf(block, '<i'), '{ if (a) { return <i />; } return <b />; }');
  });

  test('is null outside every function', () => {
    assert.equal(bodyOf('const a = <div />;', '<div'), null);
  });
});

describe('freeIdentifiers', () => {
  test('gives the names an expression reads and the capitalised tags', () => {
    assert.deepEqual(free('<Text>{item.value}</Text>'), ['Text', 'item']);
    assert.deepEqual(free('{items.map((x) => <Card key={x.id}>{x.name}</Card>)}'), [
      'Card',
      'items',
    ]);
  });

  test('leaves out lowercase tags, keywords and literals', () => {
    assert.deepEqual(free('<div><span>{a}</span></div>'), ['a']);
    assert.deepEqual(free("<p>{ok ? null : undefined}{typeof value === 'string' && true}</p>"), [
      'ok',
      'value',
    ]);
    assert.deepEqual(free('<Badge tone="good">New</Badge>'), ['Badge']);
    assert.deepEqual(free('<p>{count + 1.5}{/* note */}</p>'), ['count']);
  });

  test('leaves out names after a dot and object keys, keeps spreads and shorthands', () => {
    const source = '<Box style={{ color: tone, size }} onClick={() => go(item.id)} {...rest} />';
    assert.deepEqual(free(source), ['Box', 'go', 'item', 'rest', 'size', 'tone']);
    assert.deepEqual(free('<p>{a?.b.c}{[...list]}</p>'), ['a', 'list']);
  });

  test('leaves out what the span binds: parameters, destructuring, declarations', () => {
    const rows =
      '{rows.map(({ id, name: label }, index) => <Row key={id} n={index}>{label ?? none}</Row>)}';
    assert.deepEqual(free(rows), ['Row', 'none', 'rows']);
    assert.deepEqual(free('{xs.map((x: Item, i = start) => <li key={i}>{x}</li>)}'), [
      'start',
      'xs',
    ]);
    assert.deepEqual(free('{xs.map(function (x) { const y = f(x); return <b>{y}</b>; })}'), [
      'f',
      'xs',
    ]);
    assert.deepEqual(free('{xs.filter(x => x.on).map(async x => x as Shown)}'), ['xs']);
  });

  test('reads the root of a dotted tag, a template and JSX in a prop', () => {
    assert.deepEqual(free('<Card.Header>{title}</Card.Header>'), ['Card', 'title']);
    const template = '<p className={`a @{size} b`} />'.replaceAll('@{', `${DOLLAR}{`);
    assert.deepEqual(free(template), ['size']);
    assert.deepEqual(free('<Card title={<Heading level={depth}>Hi</Heading>} />'), [
      'Card',
      'Heading',
      'depth',
    ]);
  });

  test('reads a run of siblings and a part of a file', () => {
    assert.deepEqual(free('<Text>{a}</Text>\n<Stack gap={b} />\n<>{c}</>'), [
      'Stack',
      'Text',
      'a',
      'b',
      'c',
    ]);
    const span = elementSpan(HARD, ITEM);
    assert.ok(span !== null);
    assert.deepEqual(freeIdentifiers(HARD, span), ['Card', 'Text', 'item']);
    const stack = elementSpan(HARD, STACK);
    assert.ok(stack !== null);
    assert.deepEqual(freeIdentifiers(HARD, stack), [
      'Card',
      'Stack',
      'Text',
      'cond',
      'items',
      'label',
      'tone',
    ]);
  });
});

describe('a CRLF file', () => {
  const CRLF = HARD.replaceAll('\n', '\r\n');
  /** Where an offset of the LF text is in the CRLF text: one `\r` more for every line before it. */
  const moved = (offset: number): number => offset + HARD.slice(0, offset).split('\n').length - 1;
  const movedSpan = (span: Span): Span => ({ start: moved(span.start), end: moved(span.end) });

  test('gives the same spans as the LF text plus the carriage returns', () => {
    assert.deepEqual(openingTags(CRLF), openingTags(HARD).map(moved));
    for (const start of [FRAGMENT, ...openingTags(HARD)]) {
      const span = elementSpan(HARD, start);
      assert.ok(span !== null);
      assert.deepEqual(elementSpan(CRLF, moved(start)), movedSpan(span));
      const children = (childrenOf(HARD, start) ?? []).map((child) => ({
        kind: child.kind,
        span: movedSpan(child.span),
      }));
      assert.deepEqual(childrenOf(CRLF, moved(start)), children);
    }
  });

  test('gives the same parents, contexts, bodies and names', () => {
    for (const start of [FRAGMENT, ...openingTags(HARD)]) {
      const parent = parentOf(HARD, start);
      assert.equal(parentOf(CRLF, moved(start)), parent === null ? null : moved(parent));
      assert.equal(contextOf(CRLF, moved(start)), contextOf(HARD, start));
      const body = functionBodyOf(HARD, start);
      assert.ok(body !== null);
      assert.deepEqual(functionBodyOf(CRLF, moved(start)), movedSpan(body));
      const span = elementSpan(HARD, start);
      assert.ok(span !== null);
      assert.deepEqual(freeIdentifiers(CRLF, movedSpan(span)), freeIdentifiers(HARD, span));
    }
  });
});
