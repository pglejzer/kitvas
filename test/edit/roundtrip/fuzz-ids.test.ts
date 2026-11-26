// Plan 13, "the three hard places" 1: every element id the build makes must be found again by the
// editor, at the tag the build saw. For every `.tsx` file of the fixtures and the built-in kit, the
// file is compiled the way the build compiles it, every id is located again through the editor's own
// path (`locateElement`), and the tag read there must be the one the build named.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { after, test } from 'node:test';
import { createEsbuildCompiler } from '../../../src/edit/adapters/esbuild-compiler.ts';
import { locateElement, offsetOf, readTag } from '../../../src/edit/index.ts';
import { elementIds, readSites } from '../../../src/render/index.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

function tsxFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') found.push(...tsxFiles(path));
    } else if (entry.name.endsWith('.tsx')) {
      found.push(path);
    }
  }
  return found;
}

const files = [
  ...tsxFiles(join(PLUGIN_ROOT, 'test', 'fixtures')),
  ...tsxFiles(join(PLUGIN_ROOT, 'kits')),
];

test('every id the build makes is found again at the tag the build named', async () => {
  let checked = 0;
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    const where = relative(PLUGIN_ROOT, path).split('\\').join('/');
    // The id stem only names the file; the draft path keeps it the shape the build gives it.
    const file = `src/tsx/${where.replace(/[^A-Za-z0-9/_.-]/g, '-')}`;
    const code = await compiler.jsxDev(text, file);
    if (code === null) continue;
    const sites = readSites(code);
    assert.ok(sites, `${where}: the compiled calls and sources pair up`);
    for (const element of elementIds(file, sites)) {
      const at = await locateElement(compiler, text, file, element.id);
      assert.equal(typeof at, 'number', `${where} ${element.id}: located`);
      assert.equal(at, offsetOf(text, element.line, element.column), `${where} ${element.id}`);
      const tag = readTag(text, at as number);
      assert.equal(typeof tag === 'string' ? tag : tag.name, element.tag, `${where} ${element.id}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 50, `only ${checked} elements checked`);
});
