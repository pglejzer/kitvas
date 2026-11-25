import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { KitvasError, PLUGIN_ROOT, resolveDep } from '../../../src/shared/index.ts';
import { createEsbuildAssets } from '../../../src/studio/adapters/esbuild-assets.ts';
import { tempDir } from '../../helpers/tmp.ts';

const roots = [PLUGIN_ROOT];

function esbuildMissing(): string | false {
  try {
    resolveDep('esbuild', roots);
    return false;
  } catch {
    return 'esbuild cannot be loaded here';
  }
}

/** A client folder whose `studio/<name>.ts` entries hold `source`. */
function clientWith(source: string): string {
  const clientDir = tempDir();
  mkdirSync(join(clientDir, 'studio'), { recursive: true });
  for (const name of ['draft', 'gallery']) {
    writeFileSync(join(clientDir, 'studio', `${name}.ts`), source);
  }
  return clientDir;
}

test('the real studio entries bundle, so a broken client file fails here', async (context) => {
  const skip = esbuildMissing();
  if (skip) return context.skip(skip);
  const assets = createEsbuildAssets({ roots, clientDir: join(PLUGIN_ROOT, 'client') });
  for (const name of ['draft', 'gallery', 'page'] as const) {
    const text = await assets.script(name);
    assert.ok(text.length > 0, name);
    assert.ok(!/^\s*import\s/m.test(text), `${name} is one self-contained module`);
  }
});

test('a bundle is made once per name and kept', async (context) => {
  const skip = esbuildMissing();
  if (skip) return context.skip(skip);
  const clientDir = clientWith('export const answer: number = 42;\nconsole.log(answer);\n');
  const assets = createEsbuildAssets({ roots, clientDir });
  const first = await assets.script('draft');
  assert.ok(first.includes('42'));
  writeFileSync(join(clientDir, 'studio', 'draft.ts'), 'console.log(7);\n');
  assert.equal(await assets.script('draft'), first);
  const [one, two] = await Promise.all([assets.script('gallery'), assets.script('gallery')]);
  assert.equal(one, two);
});

test('a bundle that fails throws an internal error with the first message, and is tried again', async (context) => {
  const skip = esbuildMissing();
  if (skip) return context.skip(skip);
  const clientDir = clientWith('import { nothing } from "./missing.ts";\nconsole.log(nothing);\n');
  const assets = createEsbuildAssets({ roots, clientDir });
  await assert.rejects(assets.script('draft'), (error: unknown) => {
    assert.ok(error instanceof KitvasError);
    assert.equal(error.code, 'INTERNAL');
    assert.match(String(error.params.detail), /missing\.ts/);
    return true;
  });
  writeFileSync(join(clientDir, 'studio', 'draft.ts'), 'console.log("fixed");\n');
  assert.ok((await assets.script('draft')).includes('fixed'));
});
