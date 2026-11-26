// Use case: the builder of the Figma scripts, `client/figma/builder.ts`, as one plain script made by
// the render module's bundler (plan 21, call 3): minified, no module syntax, its six steps
// (`inspect`, `variables`, `frames`, `layers`, `targets`, `close`) on `var B`. A script of the
// package is `const D=<data>;`, then this text, then `return await B.<step>(figma, D);`
// (`domain/figma/scripts/scripts.ts`).

import { join } from 'node:path';
import type { Bundler } from '../../../render/index.ts';
import { KitvasError, PLUGIN_ROOT } from '../../../shared/index.ts';
import { FIGMA_BUILDER_GLOBAL } from '../../domain/figma/scripts/scripts.ts';

/** The folder of the builder's sources. */
export const FIGMA_CLIENT_DIR = join(PLUGIN_ROOT, 'client', 'figma');

/** The bundled builder, trimmed. A builder that does not bundle is kitvas's own fault: INTERNAL. */
export async function bundleFigmaBuilder(deps: { bundler: Bundler }): Promise<string> {
  const output = await deps.bundler.bundle({
    workingDir: FIGMA_CLIENT_DIR,
    entry: { name: 'figma-entry.ts', source: "export * from './builder.ts';\n" },
    alias: {},
    ids: {},
    script: { globalName: FIGMA_BUILDER_GLOBAL },
  });
  const first = output.errors[0];
  if (first !== undefined) {
    throw new KitvasError('INTERNAL', { detail: `${first.file}:${first.line}: ${first.message}` });
  }
  return output.js.trim();
}
