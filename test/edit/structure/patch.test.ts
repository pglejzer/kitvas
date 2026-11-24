// Hunks, the server-made inverse of a structural change (spec 4b, decision 4):
// `applyHunks(after, makeHunks(before, after))` gives `before` back byte for byte, and a hunk
// applies only where its `find` is exactly once, so another writer's lines elsewhere survive.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Hunk } from '../../../src/edit/domain/ops.ts';
import { applyHunks, makeHunks } from '../../../src/edit/domain/structure/patch.ts';
import type { OffsetMap } from '../../../src/edit/domain/types.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FOLDERS = [join(ROOT, 'test', 'fixtures'), join(ROOT, 'kits', 'base')];
const CONFLICT = { conflict: 'changed' };

function tsxFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : tsxFiles(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

/** A seeded generator (mulberry32), so a failing run can be run again. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const lf = (text: string): string => text.replaceAll('\r\n', '\n');
const crlf = (text: string): string => lf(text).replaceAll('\n', '\r\n');
const linesOf = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

function occurrences(text: string, find: string): number {
  if (find === '') return text === '' ? 1 : 2;
  let count = 0;
  for (let at = text.indexOf(find); at >= 0; at = text.indexOf(find, at + 1)) count += 1;
  return count;
}

function applied(
  text: string,
  hunks: readonly Hunk[],
  where = '',
): { text: string; moved: OffsetMap } {
  const result = applyHunks(text, hunks);
  if ('conflict' in result) throw new Error(`${where}: conflict`);
  return result;
}

/** One to four random line edits: removed, copied, replaced, blank, moved deeper or shallower. */
function edited(text: string, random: () => number): string {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = linesOf(text);
  const pick = (n: number): number => Math.floor(random() * n);
  const edits = 1 + pick(4);
  for (let k = 0; k < edits; k += 1) {
    const at = pick(lines.length + 1);
    const other = lines[pick(lines.length)] ?? newline;
    const kind = pick(6);
    if (kind === 0) lines.splice(at, 1);
    else if (kind === 1) lines.splice(at, 0, other);
    else if (kind === 2) lines.splice(at, 1, `      <Badge>Edit ${k}</Badge>${newline}`);
    else if (kind === 3) lines.splice(at, 0, newline);
    else {
      const [line] = lines.splice(pick(lines.length), 1);
      const moved = kind === 4 ? `  ${line ?? ''}` : (line ?? '').replace(/^ {2}/, '');
      lines.splice(pick(lines.length + 1), 0, moved);
    }
  }
  return lines.join('');
}

describe('makeHunks and applyHunks', () => {
  const files = FOLDERS.flatMap(tsxFiles).map((file) => ({
    name: relative(ROOT, file).replaceAll('\\', '/'),
    text: lf(readFileSync(file, 'utf8')),
  }));

  test('give the text back byte for byte after 200 random line edits, LF and CRLF', () => {
    assert.ok(files.length >= 10, `files: ${files.length}`);
    const random = seeded(20_261_123);
    for (let run = 0; run < 200; run += 1) {
      const file = files[Math.floor(random() * files.length)];
      if (file === undefined) throw new Error('no file');
      const before = run % 2 === 0 ? file.text : crlf(file.text);
      const after = edited(before, random);
      const where = `run ${run}, ${file.name}`;
      const hunks = makeHunks(before, after);
      assert.ok(hunks.length <= 50, where);
      for (const hunk of hunks) assert.equal(occurrences(after, hunk.find), 1, where);
      assert.equal(applied(after, hunks, where).text, before, where);
    }
  });

  test('are none for equal texts', () => {
    assert.deepEqual(makeHunks('a\nb\n', 'a\nb\n'), []);
    assert.equal(applied('a\nb\n', []).text, 'a\nb\n');
  });

  test('carry only the changed line when it is unique', () => {
    assert.deepEqual(makeHunks('a\nb\nc\n', 'a\nB\nc\n'), [{ find: 'B\n', replace: 'b\n' }]);
  });

  test('widen the context by whole lines until the find occurs once', () => {
    // The removed line leaves nothing to find: one line of context on each side.
    assert.deepEqual(makeHunks('x\ny\nx\nz\n', 'x\ny\nz\n'), [
      { find: 'y\nz\n', replace: 'y\nx\nz\n' },
    ]);
    // The changed line is there twice: its neighbours make it unique.
    assert.deepEqual(makeHunks('a\nq\nb\nr\nc\n', 'a\nq\nb\nq\nc\n'), [
      { find: 'b\nq\nc\n', replace: 'b\nr\nc\n' },
    ]);
  });

  test('keep the \\r of CRLF lines and a last line without an ending', () => {
    assert.deepEqual(makeHunks('a\r\nb\r\nc\r\n', 'a\r\nB\r\nc\r\n'), [
      { find: 'B\r\n', replace: 'b\r\n' },
    ]);
    assert.equal(applied('a\nc', makeHunks('a\nb', 'a\nc')).text, 'a\nb');
    assert.equal(applied('', makeHunks('<Text>Hi</Text>\n', '')).text, '<Text>Hi</Text>\n');
    assert.equal(applied('x\n', makeHunks('', 'x\n')).text, '');
  });

  test('fit one patch op: at most 50 hunks however many places changed', () => {
    const before = Array.from({ length: 300 }, (_, i) => `const v${i} = ${i};\n`).join('');
    const after = linesOf(before)
      .map((line, i) => (i % 5 === 0 ? `// changed ${i}\n` : line))
      .join('');
    const hunks = makeHunks(before, after);
    assert.ok(hunks.length <= 50, `hunks: ${hunks.length}`);
    assert.equal(applied(after, hunks).text, before);
  });

  test('conflict when a find is not there, is there twice, or two hunks overlap', () => {
    assert.deepEqual(applyHunks('a\nb\n', [{ find: 'z\n', replace: '' }]), CONFLICT);
    assert.deepEqual(applyHunks('a\na\n', [{ find: 'a\n', replace: 'b\n' }]), CONFLICT);
    const overlap = [
      { find: 'ab', replace: 'x' },
      { find: 'bc', replace: 'y' },
    ];
    assert.deepEqual(applyHunks('abc', overlap), CONFLICT);
  });

  test('still apply after another writer changed a line elsewhere, and keep that change', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `      <Text>Line ${i}</Text>\n`);
    const before = lines.join('');
    const after = lines.map((line, i) => (i === 20 ? '      <Badge>New</Badge>\n' : line)).join('');
    const hunks = makeHunks(before, after);
    const claude = after.replace('<Text>Line 3</Text>', '<Text>Claude wrote this</Text>');
    const expected = before.replace('<Text>Line 3</Text>', '<Text>Claude wrote this</Text>');
    assert.equal(applied(claude, hunks).text, expected);
  });
});

describe('applyHunks moved', () => {
  test('shifts text outside the hunks and is null where a hunk took text out', () => {
    const before = '<A />\n<B />\n<C />\n';
    const after = '<A />\n<X />\n<B />\n<C />\n';
    const { text, moved } = applied(after, makeHunks(before, after));
    assert.equal(text, before);
    assert.equal(moved(0), 0);
    assert.equal(moved(after.indexOf('<C')), before.indexOf('<C'));
    assert.equal(moved(after.indexOf('<X')), null);
    assert.equal(moved(after.length), before.length);
  });

  test('follows the lines an undone swap puts back', () => {
    const before = '<Stack>\n  <Text>One</Text>\n  <Text>Two</Text>\n</Stack>\n';
    const after = '<Stack>\n  <Text>Two</Text>\n  <Text>One</Text>\n</Stack>\n';
    const { text, moved } = applied(after, makeHunks(before, after));
    assert.equal(text, before);
    assert.equal(moved(after.indexOf('<Text>One')), before.indexOf('<Text>One'));
    assert.equal(moved(after.indexOf('<Text>Two')), before.indexOf('<Text>Two'));
    assert.equal(moved(after.indexOf('</Stack>')), before.indexOf('</Stack>'));
  });

  test('follows a line an undone move puts back at another depth', () => {
    const before = [
      '<Stack>',
      '  <Text>One</Text>',
      '  <Card>',
      '    <Badge>New</Badge>',
      '  </Card>',
      '</Stack>',
      '',
    ].join('\n');
    const after = [
      '<Stack>',
      '  <Card>',
      '    <Text>One</Text>',
      '    <Badge>New</Badge>',
      '  </Card>',
      '</Stack>',
      '',
    ].join('\n');
    const { text, moved } = applied(after, makeHunks(before, after));
    assert.equal(text, before);
    assert.equal(moved(after.indexOf('<Text>One')), before.indexOf('<Text>One'));
    assert.equal(moved(after.indexOf('<Card>')), before.indexOf('<Card>'));
    assert.equal(moved(after.indexOf('<Badge>')), before.indexOf('<Badge>'));
  });
});
