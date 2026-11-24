// Every element of every real `.tsx` file in the fixtures and the Base kit that is a plain child:
// removing it and inserting its source at the place it left gives the file back byte for byte,
// and so does swapping two neighbouring siblings twice (spec 4b, section 8; plan 14, task A2).

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Place } from '../../src/edit/domain/ops.ts';
import {
  applyStructure,
  type Located,
  type StructureResult,
  type TreeOp,
} from '../../src/edit/domain/structure/apply-structure.ts';
import {
  type Child,
  childrenOf,
  elementSpan,
  isMixed,
  parentOf,
} from '../../src/edit/domain/structure/subtree.ts';
import { openingTags } from '../../src/edit/domain/tsx/apply-tsx.ts';
import type { OffsetMap, Refusal } from '../../src/edit/domain/types.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FOLDERS = [join(ROOT, 'test', 'fixtures'), join(ROOT, 'kits')];
const KEEP = { force: false };
/** What keeps an element where it is: a list item or a condition, a root, a prop's JSX. */
const FIXED: readonly Refusal[] = ['in-expression', 'section-root', 'slot-root'];

function tsxFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : tsxFiles(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

type Applied = { text: string; moved: OffsetMap; created: number[] };

function applied(result: StructureResult, where: string): Applied {
  if (!('text' in result)) throw new Error(`${where}: ${JSON.stringify(result)}`);
  return result;
}

const run = (text: string, at: Located, op: TreeOp): StructureResult =>
  applyStructure(text, at, op, KEEP);

function there(moved: OffsetMap, old: number, where: string): number {
  const now = moved(old);
  if (now === null) throw new Error(`${where}: the offset ${old} is gone`);
  return now;
}

/**
 * The place an element left, named by what still stands around it: before the next sibling, else
 * after the previous one, else the end or the start of its parent. `null` between two `{…}`
 * children, where no op names the place.
 */
function placeOf(
  children: readonly Child[],
  index: number,
  parent: number,
): { anchor: number; place: Place } | null {
  const next = children[index + 1];
  const previous = children[index - 1];
  if (next?.kind === 'element') return { anchor: next.span.start, place: 'before' };
  if (previous?.kind === 'element') return { anchor: previous.span.start, place: 'after' };
  if (next === undefined) return { anchor: parent, place: 'last' };
  return previous === undefined ? { anchor: parent, place: 'first' } : null;
}

const files = FOLDERS.flatMap(tsxFiles);
const counts = { back: 0, swapped: 0, fixed: 0, skipped: 0 };

describe('a structural op and its opposite', () => {
  for (const file of files) {
    const name = relative(ROOT, file).replaceAll('\\', '/');
    const text = readFileSync(file, 'utf8');

    test(`remove and insert give ${name} back byte for byte at every element`, () => {
      for (const at of openingTags(text)) {
        const where = `${name} at ${at}`;
        const span = elementSpan(text, at);
        assert.ok(span !== null, where);
        const removed = run(text, { target: at }, { op: 'removeElement' });
        if ('refused' in removed) {
          assert.ok(FIXED.includes(removed.refused), `${where}: ${removed.refused}`);
          counts.fixed += 1;
          continue;
        }
        const gone = applied(removed, where);
        assert.notEqual(gone.text, text, where);
        assert.equal(gone.moved(at), null, where);

        const parent = parentOf(text, at);
        assert.ok(parent !== null, where);
        const children = childrenOf(text, parent) ?? [];
        const index = children.findIndex(
          (child) => child.kind === 'element' && child.span.start === at,
        );
        assert.ok(index >= 0, where);
        const place = placeOf(children, index, parent);
        // Among text, no element is put back: the spaces between the words would not be the same.
        if (place === null || isMixed(text, parent)) {
          counts.skipped += 1;
          continue;
        }
        const source = text.slice(span.start, span.end);
        const anchor = there(gone.moved, place.anchor, where);
        const op: TreeOp = { op: 'insertElement', place: place.place, source };
        const back = applied(run(gone.text, { anchor }, op), `${where} (insert ${place.place})`);
        assert.equal(back.text, text, `${where} (insert ${place.place})`);
        assert.deepEqual(back.created, [at], where);
        counts.back += 1;
      }
    });

    test(`two swaps of neighbouring siblings give ${name} back byte for byte`, () => {
      for (const at of openingTags(text)) {
        const where = `${name} at ${at}`;
        const parent = parentOf(text, at);
        if (parent === null || isMixed(text, parent)) continue;
        const children = childrenOf(text, parent) ?? [];
        const index = children.findIndex(
          (child) => child.kind === 'element' && child.span.start === at,
        );
        const next = children[index + 1];
        if (index < 0 || next?.kind !== 'element') continue;
        const move: TreeOp = { op: 'moveElement', place: 'before' };
        // The second in front of the first, then the first (now second) in front of it again.
        const first = run(text, { target: next.span.start, anchor: at }, move);
        if ('refused' in first) {
          assert.ok(FIXED.includes(first.refused), `${where}: ${first.refused}`);
          continue;
        }
        const once = applied(first, where);
        assert.notEqual(once.text, text, where);
        const target = there(once.moved, at, where);
        const anchor = there(once.moved, next.span.start, where);
        assert.ok(anchor < target, where);
        const twice = applied(run(once.text, { target, anchor }, move), `${where} (back)`);
        assert.equal(twice.text, text, `${where} (back)`);
        counts.swapped += 1;
      }
    });
  }

  test('covers the real files: elements were put back, swapped and refused', () => {
    assert.ok(files.length >= 10, `files: ${files.length}`);
    assert.ok(counts.back >= 10, `put back: ${counts.back}`);
    assert.ok(counts.swapped >= 5, `swapped: ${counts.swapped}`);
    assert.ok(counts.fixed >= 10, `refused: ${counts.fixed}`);
    assert.ok(counts.skipped <= counts.back, `skipped: ${counts.skipped}`);
  });
});
