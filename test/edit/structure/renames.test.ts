import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createEsbuildCompiler } from '../../../src/edit/adapters/esbuild-compiler.ts';
import { type OffsetMap, renameMap, type SiteId, type Span } from '../../../src/edit/index.ts';
import { elementIds, readSites } from '../../../src/render/index.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

const FILE = 'src/tsx/sections/Hero.tsx';
const STACK = 'sections/Hero:section/Stack';

/** A section whose `Stack` holds `children`, each a line at the children's depth. */
function hero(children: string[], newline = '\n'): string {
  return [
    "import { Badge, Card, Stack, Text } from '@kit';",
    '',
    'export function Hero() {',
    '  return (',
    '    <section>',
    '      <Stack>',
    ...children.map((line) => `        ${line}`),
    '      </Stack>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join(newline);
}

const PAIR = ['<Text>One</Text>', '<Text>Two</Text>'];

type Change = { text: string; moved: OffsetMap };
type Splice = { start: number; end: number; text: string };

/** The whole line holding `needle`, with its line break. */
function lineOf(text: string, needle: string): Span {
  const at = text.indexOf(needle);
  if (at < 0) throw new Error(`no ${needle}`);
  return { start: text.lastIndexOf('\n', at) + 1, end: text.indexOf('\n', at) + 1 };
}

/** `splices` (apart, in order, on the old text) done at once, and where each old offset went. */
function spliced(text: string, splices: Splice[]): Change {
  let out = '';
  let from = 0;
  for (const splice of splices) {
    out += text.slice(from, splice.start) + splice.text;
    from = splice.end;
  }
  out += text.slice(from);
  const moved: OffsetMap = (old) => {
    let shift = 0;
    for (const splice of splices) {
      if (old >= splice.start && old < splice.end) return null;
      if (old >= splice.end) shift += splice.text.length - (splice.end - splice.start);
    }
    return old + shift;
  };
  return { text: out, moved };
}

/** `piece` cut out and put at `to` (an offset of the old text outside the piece). */
function movedTo(text: string, piece: Span, to: number): Change {
  const length = piece.end - piece.start;
  const rest = text.slice(0, piece.start) + text.slice(piece.end);
  const place = to <= piece.start ? to : to - length;
  const out = rest.slice(0, place) + text.slice(piece.start, piece.end) + rest.slice(place);
  const moved: OffsetMap = (old) => {
    if (old >= piece.start && old < piece.end) return place + old - piece.start;
    const inRest = old < piece.start ? old : old - length;
    return inRest < place ? inRest : inRest + length;
  };
  return { text: out, moved };
}

async function sitesOf(text: string): Promise<SiteId[]> {
  const code = await compiler.jsxDev(text, FILE);
  if (code === null) throw new Error(`does not compile:\n${text}`);
  const sites = readSites(code);
  if (sites === undefined) throw new Error('sites do not pair');
  return elementIds(FILE, sites);
}

async function renamesOf(before: string, change: Change): Promise<Record<string, string>> {
  const [old, now] = await Promise.all([sitesOf(before), sitesOf(change.text)]);
  return renameMap(old, now, before, change.text, change.moved);
}

/** Moves the line of `from` to the start of the line of `before`. */
function moveLineBefore(text: string, from: string, before: string): Change {
  return movedTo(text, lineOf(text, from), lineOf(text, before).start);
}

test('a move of a Text before its sibling Text swaps the .2 and the plain id', async () => {
  const text = hero(PAIR);
  const change = moveLineBefore(text, '<Text>Two</Text>', '<Text>One</Text>');
  assert.equal(change.text, hero(['<Text>Two</Text>', '<Text>One</Text>']));
  assert.deepEqual(await renamesOf(text, change), {
    [`${STACK}/Text`]: `${STACK}/Text.2`,
    [`${STACK}/Text.2`]: `${STACK}/Text`,
  });
});

test('the swap reads the same in a CRLF file', async () => {
  const text = hero(PAIR, '\r\n');
  const change = moveLineBefore(text, '<Text>Two</Text>', '<Text>One</Text>');
  assert.equal(change.text, hero(['<Text>Two</Text>', '<Text>One</Text>'], '\r\n'));
  assert.deepEqual(await renamesOf(text, change), {
    [`${STACK}/Text`]: `${STACK}/Text.2`,
    [`${STACK}/Text.2`]: `${STACK}/Text`,
  });
});

test('a move that changes no id gives an empty map', async () => {
  const text = hero(['<Text>One</Text>', '<Badge>New</Badge>']);
  const change = moveLineBefore(text, '<Badge>New</Badge>', '<Text>One</Text>');
  assert.deepEqual(await renamesOf(text, change), {});
});

test('a wrap renames each wrapped element under the new parent and the next one', async () => {
  const children = [
    '<Text>One</Text>',
    '<Card>',
    '  <Text>In card</Text>',
    '</Card>',
    '<Text>Two</Text>',
  ];
  const text = hero(children);
  const open = lineOf(text, '<Text>One</Text>').start;
  const splices: Splice[] = [
    { start: open, end: open, text: '        <Stack direction="row">\n  ' },
    ...['<Card>', '<Text>In card</Text>', '</Card>'].map((needle): Splice => {
      const at = lineOf(text, needle).start;
      return { start: at, end: at, text: '  ' };
    }),
  ];
  const close = lineOf(text, '<Text>Two</Text>').start;
  splices.push({ start: close, end: close, text: '        </Stack>\n' });
  const change = spliced(text, splices);
  assert.equal(
    change.text,
    hero([
      '<Stack direction="row">',
      '  <Text>One</Text>',
      '  <Card>',
      '    <Text>In card</Text>',
      '  </Card>',
      '</Stack>',
      '<Text>Two</Text>',
    ]),
  );
  assert.deepEqual(await renamesOf(text, change), {
    [`${STACK}/Text`]: `${STACK}/Stack/Text`,
    [`${STACK}/Card`]: `${STACK}/Stack/Card`,
    [`${STACK}/Card/Text`]: `${STACK}/Stack/Card/Text`,
    [`${STACK}/Text.2`]: `${STACK}/Text`,
  });
});

test('a removed element and its subtree are absent; the next one takes its id', async () => {
  const text = hero([
    '<Card>',
    '  <Text>First</Text>',
    '</Card>',
    '<Card>',
    '  <Text>Second</Text>',
    '</Card>',
  ]);
  const first = lineOf(text, '<Card>');
  const end = lineOf(text, '</Card>').end;
  const change = spliced(text, [{ start: first.start, end, text: '' }]);
  assert.equal(change.text, hero(['<Card>', '  <Text>Second</Text>', '</Card>']));
  const renames = await renamesOf(text, change);
  assert.deepEqual(renames, {
    [`${STACK}/Card.2`]: `${STACK}/Card`,
    [`${STACK}/Card.2/Text`]: `${STACK}/Card/Text`,
  });
  assert.equal(Object.hasOwn(renames, `${STACK}/Card`), false);
  assert.equal(Object.hasOwn(renames, `${STACK}/Card/Text`), false);
});

test('an inserted element gets no entry, and the siblings it pushed are renamed', async () => {
  const text = hero(PAIR);
  const at = lineOf(text, '<Text>One</Text>').start;
  const change = spliced(text, [{ start: at, end: at, text: '        <Text>Zero</Text>\n' }]);
  assert.deepEqual(await renamesOf(text, change), {
    [`${STACK}/Text`]: `${STACK}/Text.2`,
    [`${STACK}/Text.2`]: `${STACK}/Text.3`,
  });
});

test('an element whose tag changed at its place is left out', async () => {
  const text = hero(PAIR);
  const open = text.indexOf('<Text>One');
  const close = text.indexOf('</Text>', open);
  const change = spliced(text, [
    { start: open + 1, end: open + 5, text: 'Badge' },
    { start: close + 2, end: close + 6, text: 'Badge' },
  ]);
  assert.equal(change.text, hero(['<Badge>One</Badge>', '<Text>Two</Text>']));
  // The second Text is the only Text now, so it takes the plain id.
  assert.deepEqual(await renamesOf(text, change), { [`${STACK}/Text.2`]: `${STACK}/Text` });
});

test('lines added above every element change no id', async () => {
  const text = hero(PAIR);
  const at = text.indexOf('export function');
  const change = spliced(text, [{ start: at, end: at, text: 'const note = 1;\n\n' }]);
  assert.deepEqual(await renamesOf(text, change), {});
});
