import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { bundleFigmaBuilder } from '../../../../src/handoff/app/figma/bundle.ts';
import { FIGMA_BUILDER_GLOBAL } from '../../../../src/handoff/domain/figma/scripts/scripts.ts';
import { createEsbuildBundler } from '../../../../src/render/adapters/esbuild-bundler.ts';
import { PLUGIN_ROOT } from '../../../../src/shared/index.ts';
import { JSX_RUNTIME } from '../../../helpers/render.ts';

test('the builder bundles to one plain script with its six steps on B', async () => {
  const bundler = createEsbuildBundler({ roots: [PLUGIN_ROOT], jsxRuntime: JSX_RUNTIME });
  try {
    const builder = await bundleFigmaBuilder({ bundler });
    assert.equal(FIGMA_BUILDER_GLOBAL, 'B');
    assert.ok(builder.startsWith('var B='), builder.slice(0, 40));
    // Room for the data: a section's layers are most of every script.
    assert.ok(builder.length < 25_000, `${builder.length} characters`);
    // No module syntax, and nothing of kitvas's own files in what goes to Figma.
    assert.doesNotMatch(builder, /\b(?:import|export)\b/);
    assert.doesNotMatch(builder, /builder\.ts|client\/|kitvas-jsx/);
    // Loading it touches nothing: `figma` is first used inside a step.
    const keys = runInNewContext(`${builder}\nJSON.stringify(Object.keys(B).sort())`, {});
    assert.equal(typeof keys, 'string');
    assert.deepEqual(JSON.parse(String(keys)), [
      'close',
      'frames',
      'inspect',
      'layers',
      'targets',
      'variables',
    ]);
  } finally {
    await bundler.dispose();
  }
});
