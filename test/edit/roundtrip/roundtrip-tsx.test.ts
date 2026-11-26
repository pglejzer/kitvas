// Every opening tag of every real `.tsx` file in the fixtures and the Base kit: an operation
// and then its inverse must give the file back byte for byte (src/edit/AGENTS.md).

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  applyTsx,
  openingTags,
  readTag,
  type TsxOp,
} from '../../../src/edit/domain/tsx/apply-tsx.ts';
import { type ApplyResult, type EditOp, inverse } from '../../../src/edit/index.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FOLDERS = [join(ROOT, 'test', 'fixtures'), join(ROOT, 'kits', 'base')];
const id = 'sections/Hero:div';
const KEEP = { force: false };

function tsxFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : tsxFiles(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

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

function textOf(result: ApplyResult, where: string): string {
  if (!('text' in result)) throw new Error(`${where}: ${JSON.stringify(result)}`);
  return result.text;
}

/** Applies `op` and then its inverse to the tag at `at`; the answer is the text after both. */
function thereAndBack(text: string, at: number, op: TsxOp, where: string): string {
  const there = textOf(applyTsx(text, at, op, KEEP), where);
  assert.notEqual(there, text, where);
  return textOf(applyTsx(there, at, tsxOp(inverse(op)), KEEP), `${where} (inverse)`);
}

const files = FOLDERS.flatMap(tsxFiles);
let tags = 0;

describe('a TSX operation and its inverse', () => {
  for (const file of files) {
    const name = relative(ROOT, file).replaceAll('\\', '/');

    test(`give ${name} back byte for byte at every tag`, () => {
      const text = readFileSync(file, 'utf8');
      for (const at of openingTags(text)) {
        const where = `${name} at ${at}`;
        const tag = readTag(text, at);
        assert.ok(typeof tag !== 'string', where);
        tags += 1;

        const prop: TsxOp = {
          op: 'setProp',
          id,
          name: 'data-rt',
          value: { kind: 'string', value: '1' },
          before: null,
          after: null,
        };
        if (tag.spread) {
          // A spread may set any prop, so a new prop beside it is refused, and nothing is written.
          assert.deepEqual(applyTsx(text, at, prop, KEEP), { refused: 'spread' }, where);
        } else {
          assert.equal(thereAndBack(text, at, prop, where), text, where);
        }

        if (tag.text !== null) {
          const value = tag.text.value === 'Round trip' ? 'Round trip 2' : 'Round trip';
          const op: TsxOp = { op: 'setText', id, value, before: tag.text.value };
          assert.equal(thereAndBack(text, at, op, where), text, where);
        }
      }
    });
  }

  test('covers the real files: the walk and the scanner both found something', () => {
    assert.ok(files.length >= 10, `files: ${files.length}`);
    assert.ok(tags >= 30, `tags: ${tags}`);
  });
});
