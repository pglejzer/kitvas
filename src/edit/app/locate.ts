// Finding an element again in its file's current text (spec 4a, decision 6). The text is compiled
// the way the build compiles it, and the id is looked up among the ids that compile gives: an id is
// a path of tags, so it still names the same element after someone added lines above it. Never by
// the line in `build/json/ids.json`, which may be from an older text.

import { elementIds, readSites } from '../../render/index.ts';
import { offsetOf } from '../domain/apply-tsx.ts';
import type { Refusal } from '../domain/types.ts';
import type { EditCompiler } from '../ports/compiler.ts';

/**
 * The offset of the element's `<` in `text`. `file` is the path inside the version
 * (`src/tsx/sections/Hero.tsx`), as `fileOfId` gives it. `invalid`: the text does not compile.
 * `not-found`: no element has the id now.
 */
export async function locateElement(
  compiler: EditCompiler,
  text: string,
  file: string,
  id: string,
): Promise<number | Refusal> {
  const code = await compiler.jsxDev(text, file);
  if (code === null) return 'invalid';
  // Code whose calls and source objects cannot be paired gives no ids, so no element is found.
  const sites = readSites(code);
  if (sites === undefined) return 'not-found';
  const found = elementIds(file, sites).find((entry) => entry.id === id);
  if (found === undefined) return 'not-found';
  const at = offsetOf(text, found.line, found.column);
  return at >= 0 && text[at] === '<' ? at : 'not-found';
}
