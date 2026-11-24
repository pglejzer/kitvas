import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { StructureResult } from '../../src/edit/domain/apply-structure.ts';
import {
  replaceElement,
  replaceOpen,
  unwrapElement,
  wrapElements,
} from '../../src/edit/domain/apply-wrap.ts';
import { hashOf } from '../../src/edit/domain/ops.ts';
import type { ApplyOptions } from '../../src/edit/domain/types.ts';

const KEEP: ApplyOptions = { force: false };
const FORCE: ApplyOptions = { force: true };
const ROW = '<Stack direction="row">';

const lines = (...parts: string[]): string => `${parts.join('\n')}\n`;
const crlf = (text: string): string => text.replaceAll('\n', '\r\n');
/** The same file indented with tabs: every two leading spaces become one tab. */
const tabs = (text: string): string =>
  text.replace(/^(?: {2})+/gm, (lead) => '\t'.repeat(lead.length / 2));

// The JSX starts one unit deep, so the file's indent unit reads as two spaces (or one tab).
const HERO = lines(
  "import { Button, Heading, Stack, Text } from '@kit';",
  '',
  'export const Hero = () => (',
  '  <section className="hero">',
  '    <Heading level={1}>Hello</Heading>',
  '    <Text>',
  '      Welcome',
  '',
  '      back',
  '    </Text>',
  '    <Button variant="solid">Save</Button>',
  '  </section>',
  ');',
);

const WRAPPED = lines(
  "import { Button, Heading, Stack, Text } from '@kit';",
  '',
  'export const Hero = () => (',
  '  <section className="hero">',
  '    <Heading level={1}>Hello</Heading>',
  '    <Stack direction="row">',
  '      <Text>',
  '        Welcome',
  '',
  '        back',
  '      </Text>',
  '      <Button variant="solid">Save</Button>',
  '    </Stack>',
  '  </section>',
  ');',
);

const LIST = lines(
  'export function Plans({ items }: Props) {',
  '  return (',
  '    <Stack>',
  '      {items.map((item) => (',
  '        <Card key={item.id}>',
  '          <Text>{item.name}</Text>',
  '        </Card>',
  '      ))}',
  '      <Input name="mail" />',
  '      <Badge></Badge>',
  '    </Stack>',
  '  );',
  '}',
);

type Applied = Extract<StructureResult, { text: string }>;

function applied(result: StructureResult): Applied {
  if (!('text' in result)) assert.fail(`not applied: ${JSON.stringify(result)}`);
  return result;
}

function at(text: string, needle: string): number {
  const found = text.indexOf(needle);
  assert.ok(found >= 0, `the fixture has no ${needle}`);
  return found;
}

const wrap = (text: string, first: string, last: string, open = ROW): StructureResult =>
  wrapElements(
    text,
    { first: at(text, first), last: at(text, last) },
    { op: 'wrapElements', open },
    KEEP,
  );
const unwrap = (text: string, target: number): StructureResult =>
  unwrapElement(text, { target }, { op: 'unwrapElement' }, KEEP);
const reopen = (text: string, target: string, open: string): StructureResult =>
  replaceOpen(text, { target: at(text, target) }, { op: 'replaceOpen', open }, KEEP);
const replace = (text: string, target: string, source: string): StructureResult =>
  replaceElement(text, { target: at(text, target) }, { op: 'replaceElement', source }, KEEP);

describe('wrapElements', () => {
  test('puts two siblings one indent unit deeper inside the new element', () => {
    const result = applied(wrap(HERO, '<Text>', '<Button'));
    assert.equal(result.text, WRAPPED);
    assert.deepEqual(result.created, [at(WRAPPED, '<Stack')]);
    assert.equal(result.created[0], at(HERO, '<Text>'));
  });

  test('says where every old offset went', () => {
    const { moved } = applied(wrap(HERO, '<Text>', '<Button'));
    assert.equal(moved(at(HERO, '<section')), at(WRAPPED, '<section'));
    assert.equal(moved(at(HERO, '<Heading')), at(WRAPPED, '<Heading'));
    assert.equal(moved(at(HERO, '<Text>')), at(WRAPPED, '<Text>'));
    assert.equal(moved(at(HERO, 'back')), at(WRAPPED, 'back'));
    assert.equal(moved(at(HERO, '<Button')), at(WRAPPED, '<Button'));
    assert.equal(moved(at(HERO, '</section>')), at(WRAPPED, '</section>'));
  });

  test('keeps the newline of a CRLF file and the tabs of a tab file', () => {
    assert.equal(applied(wrap(crlf(HERO), '<Text>', '<Button')).text, crlf(WRAPPED));
    assert.equal(applied(wrap(tabs(HERO), '<Text>', '<Button')).text, tabs(WRAPPED));
    assert.equal(applied(wrap(crlf(tabs(HERO)), '<Text>', '<Button')).text, crlf(tabs(WRAPPED)));
  });

  test('wraps inline when the siblings share a line with other code', () => {
    const text = 'const row = <div><A /><B /></div>;\n';
    const result = applied(wrap(text, '<A', '<B', '<Stack>'));
    assert.equal(result.text, 'const row = <div><Stack><A /><B /></Stack></div>;\n');
    assert.deepEqual(result.created, [at(text, '<A')]);
    assert.equal(result.moved(at(text, '<B')), at(result.text, '<B'));
  });

  test('wraps a root on its own lines', () => {
    const result = applied(wrap(HERO, '<section', '<section', '<Card>'));
    const expected = HERO.replace(
      /^ {2}<section[\s\S]*<\/section>$/m,
      (root) => `  <Card>\n${root.replace(/^(?=.*\S)/gm, '  ')}\n  </Card>`,
    );
    assert.equal(result.text, expected);
    assert.equal(applied(unwrap(result.text, result.created[0] ?? -1)).text, HERO);
  });

  test('refuses elements that are not siblings in that order', () => {
    const nested = lines(
      '<Stack>',
      '  <Heading>One</Heading>',
      '  <Card>',
      '    <Text>Two</Text>',
      '  </Card>',
      '</Stack>',
    );
    assert.deepEqual(wrap(nested, '<Heading', '<Text'), { refused: 'not-siblings' });
    assert.deepEqual(wrap(nested, '<Card', '<Text'), { refused: 'not-siblings' });
    assert.deepEqual(wrap(nested, '<Card', '<Heading'), { refused: 'not-siblings' });
    assert.deepEqual(wrap(HERO, '<Button', '<Text>'), { refused: 'not-siblings' });
  });

  test('refuses an open that is not exactly one opening tag', () => {
    for (const open of ['Stack', '<Stack />', '<Stack>x', '<Stack></Stack>', '<>', '<Stack']) {
      assert.deepEqual(wrap(HERO, '<Text>', '<Button', open), { refused: 'invalid' }, open);
    }
  });

  test('refuses an element written inside an expression', () => {
    assert.deepEqual(wrap(LIST, '<Card', '<Card'), { refused: 'in-expression' });
  });

  test('is a conflict when the range is not what the editor saw, unless forced', () => {
    const where = { first: at(HERO, '<Text>'), last: at(HERO, '<Button') };
    const seen = HERO.slice(where.first, at(HERO, '</Button>') + '</Button>'.length);
    const fresh = { op: 'wrapElements', open: ROW, hash: hashOf(seen) } as const;
    const stale = { op: 'wrapElements', open: ROW, hash: hashOf(`${seen} `) } as const;
    assert.equal(applied(wrapElements(HERO, where, fresh, KEEP)).text, WRAPPED);
    assert.deepEqual(wrapElements(HERO, where, stale, KEEP), { conflict: 'changed' });
    assert.equal(applied(wrapElements(HERO, where, stale, FORCE)).text, WRAPPED);
  });

  test('answers not-found without both offsets', () => {
    const op = { op: 'wrapElements', open: ROW } as const;
    assert.deepEqual(wrapElements(HERO, { first: 0 }, op, KEEP), { refused: 'not-found' });
    assert.deepEqual(wrapElements(HERO, { first: 0, last: 0 }, op, KEEP), {
      refused: 'not-found',
    });
  });
});

describe('unwrapElement', () => {
  const files: [string, string][] = [
    ['LF', HERO],
    ['CRLF', crlf(HERO)],
    ['tabs', tabs(HERO)],
    ['CRLF with tabs', crlf(tabs(HERO))],
  ];
  const ranges: [string, string][] = [
    ['<Text>', '<Button'],
    ['<Heading', '<Button'],
    ['<Heading', '<Heading'],
    ['<Text>', '<Text>'],
    ['<section', '<section'],
  ];

  for (const [kind, text] of files) {
    for (const [first, last] of ranges) {
      test(`gives the original back after a wrap of ${first} to ${last} (${kind})`, () => {
        const wrapped = applied(wrap(text, first, last));
        assert.notEqual(wrapped.text, text);
        const back = applied(unwrap(wrapped.text, wrapped.created[0] ?? -1));
        assert.equal(back.text, text);
        assert.deepEqual(back.created, []);
        // Through both maps every wrapped element is where it was.
        for (const needle of [first, last]) {
          const there = wrapped.moved(at(text, needle));
          assert.equal(there === null ? null : back.moved(there), at(text, needle));
        }
        assert.equal(back.moved(wrapped.created[0] ?? -1), null);
      });
    }
  }

  test('gives the original back after an inline wrap', () => {
    for (const text of [
      'const row = <div><A /><B /></div>;\n',
      'const one = <A />;\n',
      lines('<p>', '  Read <b>this</b> first', '</p>'),
      lines('<div>', '  <A>', '    text', '  </A> tail', '</div>'),
      lines('<div>', '  lead <A>', '    text', '  </A>', '</div>'),
    ]) {
      const first = text.includes('<b>') ? '<b>' : '<A';
      const last = text.includes('<B') ? '<B' : first;
      const wrapped = applied(wrap(text, first, last, '<Stack>'));
      assert.equal(applied(unwrap(wrapped.text, wrapped.created[0] ?? -1)).text, text);
    }
  });

  test('puts the children one unit shallower where the element stood', () => {
    const result = applied(unwrap(WRAPPED, at(WRAPPED, '<Stack')));
    assert.equal(result.text, HERO);
    assert.equal(result.moved(at(WRAPPED, '<Stack')), null);
    assert.equal(result.moved(at(WRAPPED, '<Text>')), at(HERO, '<Text>'));
    assert.equal(result.moved(at(WRAPPED, '<Button')), at(HERO, '<Button'));
    assert.equal(result.moved(at(WRAPPED, '</section>')), at(HERO, '</section>'));
  });

  test('refuses an element whose first or last child is no element', () => {
    const refused = { refused: 'no-element-children' };
    assert.deepEqual(unwrap(HERO, at(HERO, '<Button')), refused);
    assert.deepEqual(unwrap(LIST, at(LIST, '<Input')), refused);
    assert.deepEqual(unwrap(LIST, at(LIST, '<Badge')), refused);
    const textFirst = '<Card>Note <Text>One</Text></Card>\n';
    assert.deepEqual(unwrap(textFirst, 0), refused);
    const exprLast = lines('<Card>', '  <Text>One</Text>', '  {extra}', '</Card>');
    assert.deepEqual(unwrap(exprLast, 0), refused);
  });

  test('puts the children of a lone root with two children in a fragment', () => {
    const text = lines(
      'export function Hero() {',
      '  return (',
      '    <section className="hero">',
      '      <Heading>Hello</Heading>',
      '      <Text>Welcome</Text>',
      '    </section>',
      '  );',
      '}',
    );
    const result = applied(unwrap(text, at(text, '<section')));
    assert.equal(
      result.text,
      lines(
        'export function Hero() {',
        '  return (',
        '    <>',
        '      <Heading>Hello</Heading>',
        '      <Text>Welcome</Text>',
        '    </>',
        '  );',
        '}',
      ),
    );
    assert.deepEqual(result.created, []);
    assert.equal(result.moved(at(text, '<section')), null);
    assert.equal(result.moved(at(text, '<Text')), at(result.text, '<Text'));
  });

  test('puts the one child of a root in its place without a fragment', () => {
    const text = lines('const card = (', '  <Card>', '    <Text>One</Text>', '  </Card>', ');');
    const result = applied(unwrap(text, at(text, '<Card')));
    assert.equal(result.text, lines('const card = (', '  <Text>One</Text>', ');'));
  });

  test('refuses an element written inside an expression', () => {
    assert.deepEqual(unwrap(LIST, at(LIST, '<Card')), { refused: 'in-expression' });
  });

  test('is a conflict on another hash, unless forced', () => {
    const target = at(WRAPPED, '<Stack');
    const stale = { op: 'unwrapElement', hash: hashOf('<Stack />') } as const;
    assert.deepEqual(unwrapElement(WRAPPED, { target }, stale, KEEP), { conflict: 'changed' });
    assert.equal(applied(unwrapElement(WRAPPED, { target }, stale, FORCE)).text, HERO);
    assert.deepEqual(unwrapElement(WRAPPED, {}, stale, FORCE), { refused: 'not-found' });
  });
});

describe('replaceOpen', () => {
  test('keeps the children and gives the closing tag the new name', () => {
    const result = applied(reopen(HERO, '<Button', '<Badge tone="info">'));
    assert.equal(
      result.text,
      HERO.replace('<Button variant="solid">Save</Button>', '<Badge tone="info">Save</Badge>'),
    );
    assert.deepEqual(result.created, []);
  });

  test('keeps the lines of a multi-line element', () => {
    const result = applied(reopen(HERO, '<Text>', '<Heading level={2}>'));
    const expected = HERO.replace('<Text>', '<Heading level={2}>').replace('</Text>', '</Heading>');
    assert.equal(result.text, expected);
    // The element is the same one, and what follows its tags moved with them.
    assert.equal(result.moved(at(HERO, '<Text>')), at(expected, '<Heading level={2}>'));
    assert.equal(result.moved(at(HERO, 'Welcome')), at(expected, 'Welcome'));
    assert.equal(result.moved(at(HERO, '<Button')), at(expected, '<Button'));
    assert.equal(result.moved(at(HERO, '<Text>') + 1), null);
  });

  test('keeps nested elements of the same name apart', () => {
    const text = '<Stack><Stack><Text>One</Text></Stack></Stack>\n';
    const result = applied(reopen(text, '<Stack', '<Grid>'));
    assert.equal(result.text, '<Grid><Stack><Text>One</Text></Stack></Grid>\n');
  });

  test('leaves a self-closing element self-closing when the open closes itself', () => {
    const result = applied(reopen(LIST, '<Input', '<Select name="mail" />'));
    assert.equal(result.text, LIST.replace('<Input name="mail" />', '<Select name="mail" />'));
  });

  test('closes a self-closing element that now opens', () => {
    const result = applied(reopen(LIST, '<Input', '<Card>'));
    assert.equal(result.text, LIST.replace('<Input name="mail" />', '<Card></Card>'));
  });

  test('lets an empty element close itself and refuses one with children', () => {
    const result = applied(reopen(LIST, '<Badge', '<Icon name="star" />'));
    assert.equal(result.text, LIST.replace('<Badge></Badge>', '<Icon name="star" />'));
    assert.deepEqual(reopen(HERO, '<Button', '<Input />'), { refused: 'not-accepted' });
  });

  test('refuses an open that is no opening tag, and an element in an expression', () => {
    assert.deepEqual(reopen(HERO, '<Button', 'Badge'), { refused: 'invalid' });
    assert.deepEqual(reopen(HERO, '<Button', '<Badge>New</Badge>'), { refused: 'invalid' });
    assert.deepEqual(reopen(LIST, '<Card', '<Stack>'), { refused: 'in-expression' });
  });

  test('is a conflict on another hash, unless forced', () => {
    const target = at(HERO, '<Button');
    const op = { op: 'replaceOpen', open: '<Badge>', hash: hashOf('<Button />') } as const;
    assert.deepEqual(replaceOpen(HERO, { target }, op, KEEP), { conflict: 'changed' });
    const forced = applied(replaceOpen(HERO, { target }, op, FORCE));
    assert.ok(forced.text.includes('<Badge>Save</Badge>'));
    const seen = { ...op, hash: hashOf('<Button variant="solid">Save</Button>') };
    assert.ok(applied(replaceOpen(HERO, { target }, seen, KEEP)).text.includes('</Badge>'));
  });
});

describe('replaceElement', () => {
  const OLD = '<Button variant="solid">Save</Button>';

  test('re-indents a multi-line source to where the element stood', () => {
    const source = ['<Card>', '  <Text>One</Text>', '  <Text>Two</Text>', '</Card>'].join('\n');
    const result = applied(replace(HERO, '<Button', source));
    const written = ['<Card>', '      <Text>One</Text>', '      <Text>Two</Text>', '    </Card>'];
    assert.equal(result.text, HERO.replace(OLD, written.join('\n')));
    assert.deepEqual(result.created, [at(HERO, '<Button')]);
  });

  test('re-indents a source that was copied from another depth', () => {
    const source = ['<Card>', '            <Text>One</Text>', '          </Card>'].join('\n');
    const result = applied(replace(HERO, '<Button', source));
    const expected = ['<Card>', '      <Text>One</Text>', '    </Card>'].join('\n');
    assert.equal(result.text, HERO.replace(OLD, expected));
  });

  test('writes the source with the newline of the file', () => {
    const source = ['<Card>', '  <Text>One</Text>', '</Card>'].join('\n');
    const result = applied(replace(crlf(HERO), '<Button', source));
    const expected = ['<Card>', '      <Text>One</Text>', '    </Card>'].join('\r\n');
    assert.equal(result.text, crlf(HERO).replace(OLD, expected));
  });

  test('drops what was inside from the map and shifts what follows', () => {
    const result = applied(replace(HERO, '<Text>', '<Badge>New</Badge>'));
    assert.equal(result.moved(at(HERO, '<Heading')), at(HERO, '<Heading'));
    assert.equal(result.moved(at(HERO, '<Text>')), null);
    assert.equal(result.moved(at(HERO, 'Welcome')), null);
    assert.equal(result.moved(at(HERO, '<Button')), at(result.text, '<Button'));
    assert.equal(result.created[0], at(result.text, '<Badge'));
  });

  test('refuses a source that is not one element', () => {
    for (const source of ['Save', '<A /><B />', '<A>', '<A /> text', '']) {
      assert.deepEqual(replace(HERO, '<Button', source), { refused: 'invalid' }, source);
    }
  });

  test('refuses an element in an expression, and is a conflict on another hash', () => {
    assert.deepEqual(replace(LIST, '<Card', '<Badge />'), { refused: 'in-expression' });
    const target = at(HERO, '<Button');
    const op = { op: 'replaceElement', source: '<Badge />', hash: hashOf('x') } as const;
    assert.deepEqual(replaceElement(HERO, { target }, op, KEEP), { conflict: 'changed' });
    assert.ok(applied(replaceElement(HERO, { target }, op, FORCE)).text.includes('<Badge />'));
    assert.equal(
      applied(replaceElement(HERO, { target }, { ...op, hash: hashOf(OLD) }, KEEP)).text,
      HERO.replace(OLD, '<Badge />'),
    );
  });
});
