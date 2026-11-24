// Why a section was made this way (spec 4d, goal 7; plan 17): three to five short lines, the
// guideline ids it followed, and the hash of the section's source when they were written. The
// maker writes one file per section, `<version>/why/<Section>.json`, beside `src/`; the craft
// sketcher one per sketch. `draft version` copies them; a hash that no longer matches the section's
// source makes the entry "may be out of date". Pure: `app/why.ts` reads them.

import { type Zod, z } from '../../shared/index.ts';

export const WHY_FOLDER = 'why';
export const MAX_WHY_LINE = 200;
/** A section's file name: its component name, as `src/tsx/sections/<Name>.tsx` has it. */
export const WHY_NAME = /^[A-Z][A-Za-z0-9]{0,63}$/;

export const WhyFileSchema = z.strictObject({
  lines: z.array(z.string().trim().min(1).max(MAX_WHY_LINE)).min(1).max(5),
  /** Guideline ids of the book (`kitvas guidelines`), such as `ui-type-scale`. */
  guidelines: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)).max(20),
  /** sha256 hex of the section's TSX when the lines were written. */
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type WhyFile = Zod.infer<typeof WhyFileSchema>;
