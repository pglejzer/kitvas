import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { hashOf, type Place } from '../../../src/edit/domain/ops.ts';
import {
  applyStructure,
  type Located,
  type StructureResult,
  type TreeOp,
} from '../../../src/edit/domain/structure/apply-structure.ts';
import { indentUnitOf, newlineOf, reindent } from '../../../src/edit/domain/tsx/format.ts';
import type { ApplyOptions, OffsetMap } from '../../../src/edit/domain/types.ts';

const KEEP: ApplyOptions = { force: false };
const FORCE: ApplyOptions = { force: true };

const H = '<Heading>Title</Heading>';
const T = '<Text>Lead</Text>';
const B = '<Button>Go</Button>';
const BADGE = '<Badge>New</Badge>';

/** A section whose root holds `rows`, one per line, two spaces a step. */
const page = (...rows: string[]): string =>
  [
    'export function Hero() {',
    '  return (',
    '    <section>',
    ...rows.map((row) => `      ${row}`),
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
/** A component that returns `jsx` on one line. */
const line = (jsx: string): string => `export const Row = () => ${jsx};\n`;
const crlf = (text: string): string => text.replaceAll('\n', '\r\n');
/** The same file indented with tabs: every two leading spaces become one tab. */
const tabs = (text: string): string =>
  text.replace(/^(?: {2})+/gm, (lead) => '\t'.repeat(lead.length / 2));

function at(text: string, needle: string): number {
  const found = text.indexOf(needle);
  assert.ok(found >= 0, `no ${needle} in the text`);
  return found;
}

type Applied = { text: string; moved: OffsetMap; created: number[] };

function applied(result: StructureResult): Applied {
  if (!('text' in result)) throw new Error(`not applied: ${JSON.stringify(result)}`);
  return result;
}

const run = (text: string, where: Located, op: TreeOp, options = KEEP): StructureResult =>
  applyStructure(text, where, op, options);
const remove = (text: string, needle: string, hash?: string, options = KEEP): StructureResult =>
  run(text, { target: at(text, needle) }, { op: 'removeElement', hash }, options);
const insert = (text: string, anchor: string, place: Place, source: string): StructureResult =>
  run(text, { anchor: at(text, anchor) }, { op: 'insertElement', place, source });
const move = (text: string, target: string, anchor: string, place: Place): StructureResult =>
  run(text, { target: at(text, target), anchor: at(text, anchor) }, { op: 'moveElement', place });

const ALL = page(H, T, B);

describe('removeElement', () => {
  test('takes an element that stands on its own line with its line', () => {
    const result = applied(remove(ALL, T));
    assert.equal(result.text, page(H, B));
    assert.deepEqual(result.created, []);
  });

  test('maps offsets before it to themselves, inside it to null, after it to the new place', () => {
    const result = applied(remove(ALL, T));
    assert.equal(result.moved(at(ALL, H)), at(result.text, H));
    assert.equal(result.moved(at(ALL, T)), null);
    assert.equal(result.moved(at(ALL, T) + 3), null);
    assert.equal(result.moved(at(ALL, B)), at(result.text, B));
  });

  test('leaves the tags of an emptied parent on their two lines', () => {
    assert.equal(applied(remove(page(H), H)).text, page());
  });

  test('takes an element that shares its line with the whitespace in front of it', () => {
    const text = line('<Card><Text>A</Text> <Badge /></Card>');
    assert.equal(applied(remove(text, '<Badge')).text, line('<Card><Text>A</Text></Card>'));
  });

  test('takes the first of several on one line with the blanks after it', () => {
    const text = line('<Card><Badge /> <Text>A</Text></Card>');
    assert.equal(applied(remove(text, '<Badge')).text, line('<Card><Text>A</Text></Card>'));
  });

  test('takes an only child on one line and nothing else', () => {
    const text = line('<Card><Badge /></Card>');
    assert.equal(applied(remove(text, '<Badge')).text, line('<Card></Card>'));
  });

  test('takes an element out of a text with one of the spaces around it', () => {
    const text = page('<Text>Hello <b>big</b> world</Text>');
    assert.equal(applied(remove(text, '<b>')).text, page('<Text>Hello world</Text>'));
  });

  test('keeps the line breaks of a CRLF file', () => {
    assert.equal(applied(remove(crlf(ALL), T)).text, crlf(page(H, B)));
  });

  test('keeps the tabs of a tab file', () => {
    assert.equal(applied(remove(tabs(ALL), T)).text, tabs(page(H, B)));
  });
});

describe('insertElement', () => {
  test('puts a sibling on its own line after an element that has its own line', () => {
    const result = applied(insert(ALL, H, 'after', BADGE));
    assert.equal(result.text, page(H, BADGE, T, B));
    assert.deepEqual(result.created, [at(result.text, BADGE)]);
  });

  test('puts a sibling on its own line before the first child', () => {
    assert.equal(applied(insert(ALL, H, 'before', BADGE)).text, page(BADGE, H, T, B));
  });

  test('puts a first and a last child at the depth of the other children', () => {
    assert.equal(applied(insert(ALL, '<section', 'first', BADGE)).text, page(BADGE, H, T, B));
    assert.equal(applied(insert(ALL, '<section', 'last', BADGE)).text, page(H, T, B, BADGE));
  });

  test('puts a child one indent unit deeper than an empty parent on two lines', () => {
    assert.equal(applied(insert(page(), '<section', 'last', H)).text, page(H));
    assert.equal(applied(insert(page(), '<section', 'first', H)).text, page(H));
  });

  test('uses a tab as the unit in a tab file', () => {
    assert.equal(applied(insert(tabs(page()), '<section', 'last', H)).text, tabs(page(H)));
    assert.equal(applied(insert(tabs(ALL), H, 'after', BADGE)).text, tabs(page(H, BADGE, T, B)));
  });

  test('stays on the line of a parent written on one line', () => {
    const text = line('<Card><Text>A</Text></Card>');
    assert.equal(
      applied(insert(text, '<Text', 'after', '<Badge />')).text,
      line('<Card><Text>A</Text> <Badge /></Card>'),
    );
    assert.equal(
      applied(insert(text, '<Card', 'last', '<Badge />')).text,
      line('<Card><Text>A</Text> <Badge /></Card>'),
    );
    assert.equal(
      applied(insert(text, '<Card', 'first', '<Badge />')).text,
      line('<Card><Badge /> <Text>A</Text></Card>'),
    );
    assert.equal(
      applied(insert(text, '<Text', 'before', '<Badge />')).text,
      line('<Card><Badge /> <Text>A</Text></Card>'),
    );
  });

  test('fills an empty parent on one line without a space', () => {
    const text = line('<Card></Card>');
    assert.equal(
      applied(insert(text, '<Card', 'last', '<Badge />')).text,
      line('<Card><Badge /></Card>'),
    );
  });

  test('shifts the later lines of a source to the new depth', () => {
    const source = '<Stack>\n  <Text>A</Text>\n</Stack>';
    const expected = page(H, '<Stack>', '  <Text>A</Text>', '</Stack>', T, B);
    assert.equal(applied(insert(ALL, H, 'after', source)).text, expected);
  });

  test('reads the depth a source was written at from its closing line', () => {
    const source = '<Stack>\n          <Text>A</Text>\n        </Stack>';
    const expected = page(H, '<Stack>', '  <Text>A</Text>', '</Stack>', T, B);
    assert.equal(applied(insert(ALL, H, 'after', source)).text, expected);
  });

  test('writes a source with the line breaks of the file', () => {
    const source = '<Stack>\n  <Text>A</Text>\n</Stack>';
    const expected = crlf(page(H, '<Stack>', '  <Text>A</Text>', '</Stack>', T, B));
    assert.equal(applied(insert(crlf(ALL), H, 'after', source)).text, expected);
  });

  test('maps the offsets after the place past the new source', () => {
    const result = applied(insert(ALL, H, 'after', BADGE));
    assert.equal(result.moved(at(ALL, H)), at(result.text, H));
    assert.equal(result.moved(at(ALL, T)), at(result.text, T));
  });

  test('answers with the elements a fragment holds as the created ones', () => {
    const result = applied(insert(ALL, H, 'after', '<><Badge>New</Badge><Icon name="x" /></>'));
    assert.deepEqual(result.created, [at(result.text, BADGE), at(result.text, '<Icon')]);
  });

  test('refuses a source that is not one whole element', () => {
    assert.deepEqual(insert(ALL, H, 'after', 'Hello'), { refused: 'invalid' });
    assert.deepEqual(insert(ALL, H, 'after', '<Badge /><Badge />'), { refused: 'invalid' });
  });

  test('refuses a child for a tag that closes itself', () => {
    const text = page('<Input />');
    assert.deepEqual(insert(text, '<Input', 'last', BADGE), { refused: 'not-accepted' });
    assert.deepEqual(insert(text, '<Input', 'first', BADGE), { refused: 'not-accepted' });
  });

  test('gives the text back byte for byte after a removal at the same place', () => {
    const texts = [
      ALL,
      crlf(ALL),
      tabs(ALL),
      line('<Card><Text>A</Text> <Text>Lead</Text> <Badge /></Card>'),
    ];
    for (const text of texts) {
      const removed = applied(remove(text, T));
      const anchor = removed.text.indexOf('<Heading') >= 0 ? '<Heading' : '<Text>A';
      assert.equal(applied(insert(removed.text, anchor, 'after', T)).text, text);
    }
  });
});

describe('moveElement', () => {
  test('moves an element before a sibling and says where everything went', () => {
    const result = applied(move(ALL, B, H, 'before'));
    assert.equal(result.text, page(B, H, T));
    assert.deepEqual(result.created, []);
    assert.equal(result.moved(at(ALL, B)), at(result.text, B));
    assert.equal(result.moved(at(ALL, B) + 8), at(result.text, B) + 8);
    assert.equal(result.moved(at(ALL, H)), at(result.text, H));
    assert.equal(result.moved(at(ALL, T)), at(result.text, T));
    assert.equal(result.moved(at(ALL, '</section>')), at(result.text, '</section>'));
  });

  test('moves an element after a later sibling', () => {
    assert.equal(applied(move(ALL, H, B, 'after')).text, page(T, B, H));
    assert.equal(applied(move(ALL, H, '<section', 'last')).text, page(T, B, H));
    assert.equal(applied(move(ALL, B, '<section', 'first')).text, page(B, H, T));
  });

  test('gives the text back when two neighbours are swapped twice', () => {
    for (const text of [ALL, crlf(ALL), tabs(ALL)]) {
      const once = applied(move(text, T, H, 'before'));
      assert.notEqual(once.text, text);
      assert.equal(applied(move(once.text, H, T, 'before')).text, text);
    }
  });

  test('swaps neighbours on one line and back', () => {
    const text = line('<Card><Text>A</Text> <Badge /> <Icon name="x" /></Card>');
    const once = applied(move(text, '<Badge', '<Text', 'before'));
    assert.equal(once.text, line('<Card><Badge /> <Text>A</Text> <Icon name="x" /></Card>'));
    assert.equal(applied(move(once.text, '<Text', '<Badge', 'before')).text, text);
  });

  test('leaves the text alone when the element is already at the place', () => {
    const same = [
      move(ALL, T, H, 'after'),
      move(ALL, T, B, 'before'),
      move(ALL, H, '<section', 'first'),
      move(ALL, B, '<section', 'last'),
    ];
    for (const result of same) {
      const done = applied(result);
      assert.equal(done.text, ALL);
      assert.equal(done.moved(at(ALL, B)), at(ALL, B));
      assert.deepEqual(done.created, []);
    }
  });

  test('shifts a subtree of several lines to its new depth, and its offsets with it', () => {
    const text = page(
      '<Stack>',
      '  <Text>A</Text>',
      '</Stack>',
      '<Card>',
      '  <Text>B</Text>',
      '</Card>',
    );
    const expected = page(
      '<Card>',
      '  <Text>B</Text>',
      '  <Stack>',
      '    <Text>A</Text>',
      '  </Stack>',
      '</Card>',
    );
    const there = applied(move(text, '<Stack', '<Card', 'last'));
    assert.equal(there.text, expected);
    assert.equal(there.moved(at(text, '<Stack')), at(expected, '<Stack'));
    assert.equal(there.moved(at(text, '<Text>A')), at(expected, '<Text>A'));
    assert.equal(there.moved(at(text, '<Text>B')), at(expected, '<Text>B'));
    assert.equal(there.moved(at(text, '<Card')), at(expected, '<Card'));
    assert.equal(applied(move(expected, '<Stack', '<Card', 'before')).text, text);
  });

  test('refuses a move into the element itself or into what it holds', () => {
    const text = page('<Stack>', '  <Text>A</Text>', '</Stack>', B);
    assert.deepEqual(move(text, '<Stack', '<Text>A', 'after'), { refused: 'into-self' });
    assert.deepEqual(move(text, '<Stack', '<Stack', 'last'), { refused: 'into-self' });
    assert.deepEqual(move(text, '<Stack', '<Stack', 'before'), { refused: 'into-self' });
  });
});

describe('what the structure engine refuses', () => {
  const MIXED = page('<Text>Hello <b>big</b> world</Text>', B);
  const LIST = page(
    '{items.map((item) => (',
    '  <Card key={item.id}>',
    '    <Text>{item.name}</Text>',
    '  </Card>',
    '))}',
    '{open && <Badge>New</Badge>}',
    B,
  );
  const SLOT = page('<Card title={<Heading>Title</Heading>}>', `  ${T}`, '</Card>', B);

  test('a place among the children of an element that mixes text and elements', () => {
    assert.deepEqual(insert(MIXED, '<b>', 'before', BADGE), { refused: 'mixed' });
    assert.deepEqual(insert(MIXED, '<b>', 'after', BADGE), { refused: 'mixed' });
    assert.deepEqual(insert(MIXED, '<Text', 'first', BADGE), { refused: 'mixed' });
    assert.deepEqual(insert(MIXED, '<Text', 'last', BADGE), { refused: 'mixed' });
    assert.deepEqual(move(MIXED, B, '<b>', 'after'), { refused: 'mixed' });
  });

  test('an element inside a child expression, as a target and as an anchor', () => {
    assert.deepEqual(remove(LIST, '<Card'), { refused: 'in-expression' });
    assert.deepEqual(remove(LIST, '<Badge'), { refused: 'in-expression' });
    assert.deepEqual(move(LIST, '<Card', B, 'after'), { refused: 'in-expression' });
    assert.deepEqual(insert(LIST, '<Badge', 'after', H), { refused: 'in-expression' });
    assert.deepEqual(insert(LIST, '<Card', 'last', H), { refused: 'in-expression' });
    assert.deepEqual(move(LIST, B, '<Card', 'before'), { refused: 'in-expression' });
  });

  test('the root a function returns, and a place beside it', () => {
    assert.deepEqual(remove(ALL, '<section'), { refused: 'section-root' });
    assert.deepEqual(move(ALL, '<section', H, 'after'), { refused: 'section-root' });
    assert.deepEqual(insert(ALL, '<section', 'after', BADGE), { refused: 'section-root' });
  });

  test('the JSX of a prop, and a move into it', () => {
    assert.deepEqual(remove(SLOT, '<Heading'), { refused: 'slot-root' });
    assert.deepEqual(move(SLOT, '<Heading', B, 'after'), { refused: 'slot-root' });
    assert.deepEqual(insert(SLOT, '<Heading', 'before', BADGE), { refused: 'slot-root' });
    assert.deepEqual(move(SLOT, B, '<Heading', 'last'), { refused: 'slot-root' });
  });

  test('an offset that holds no element, or none given', () => {
    const off = { target: at(ALL, T) + 1 };
    assert.deepEqual(run(ALL, off, { op: 'removeElement' }), { refused: 'not-found' });
    assert.deepEqual(run(ALL, {}, { op: 'removeElement' }), { refused: 'not-found' });
    assert.deepEqual(run(ALL, {}, { op: 'insertElement', place: 'after', source: BADGE }), {
      refused: 'not-found',
    });
    assert.deepEqual(run(ALL, { target: at(ALL, T) }, { op: 'moveElement', place: 'after' }), {
      refused: 'not-found',
    });
  });

  test('nothing of a refused op is written: the answer has no text', () => {
    assert.equal('text' in remove(LIST, '<Card'), false);
  });
});

describe('the hash of a structural op', () => {
  test('is a conflict when the subtree is not the one the editor saw', () => {
    assert.deepEqual(remove(ALL, T, hashOf('<Text>Other</Text>')), { conflict: 'changed' });
    const where = { target: at(ALL, B), anchor: at(ALL, H) };
    const op: TreeOp = { op: 'moveElement', place: 'before', hash: hashOf('<Button />') };
    assert.deepEqual(run(ALL, where, op), { conflict: 'changed' });
  });

  test('is passed over with force', () => {
    assert.equal(applied(remove(ALL, T, hashOf('<Text>Other</Text>'), FORCE)).text, page(H, B));
    const where = { target: at(ALL, B), anchor: at(ALL, H) };
    const op: TreeOp = { op: 'moveElement', place: 'before', hash: hashOf('<Button />') };
    assert.equal(applied(run(ALL, where, op, FORCE)).text, page(B, H, T));
  });

  test('lets the op through when it is the subtree as written', () => {
    assert.equal(applied(remove(ALL, T, hashOf(T))).text, page(H, B));
  });
});

describe('the formatting helpers', () => {
  test('newlineOf reads the line break of the file', () => {
    assert.equal(newlineOf(ALL), '\n');
    assert.equal(newlineOf(crlf(ALL)), '\r\n');
    assert.equal(newlineOf('one line'), '\n');
  });

  test('indentUnitOf reads two spaces, four spaces and a tab', () => {
    assert.equal(indentUnitOf(ALL), '  ');
    assert.equal(indentUnitOf(page()), '  ');
    assert.equal(indentUnitOf(ALL.replace(/^( +)/gm, '$1$1')), '    ');
    assert.equal(indentUnitOf(tabs(ALL)), '\t');
    assert.equal(indentUnitOf('const a = 1;\n'), '  ');
  });

  test('reindent shifts every line after the first and leaves blank lines alone', () => {
    const source = '<Stack>\n    <Text>A</Text>\n\n  </Stack>';
    const deeper = '<Stack>\n        <Text>A</Text>\n\n      </Stack>';
    assert.equal(reindent(source, '  ', '      '), deeper);
    assert.equal(reindent(deeper, '      ', '  '), source);
    assert.equal(reindent(source, '  ', '\t'), '<Stack>\n\t  <Text>A</Text>\n\n\t</Stack>');
    assert.equal(reindent('<Badge />', '', '    '), '<Badge />');
  });
});
