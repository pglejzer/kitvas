// Use case helper: which shots of an option's values equal the default combination's (plan 25, C7).
// The browser writes the shots; the bytes are compared here, where the files can be read.

import { join } from 'node:path';
import type { BuildFs } from '../../render/index.ts';
import type { ShotMatch } from '../domain/options/options-rules.ts';
import type { OptionShot } from './browser-checks.ts';

const sameBytes = (one: Uint8Array, other: Uint8Array): boolean =>
  one.length === other.length && one.every((byte, index) => byte === other[index]);

/** One match for each shot whose own file and default shot both exist; a missing one is left out. */
export function shotMatches(
  fs: BuildFs,
  versionDir: string,
  shots: readonly OptionShot[],
): ShotMatch[] {
  return shots.flatMap(({ id, value, width, file, base }): ShotMatch[] => {
    const own = join(versionDir, ...file.split('/'));
    const standard = join(versionDir, ...base.split('/'));
    if (!fs.exists(own) || !fs.exists(standard)) return [];
    return [{ id, value, width, same: sameBytes(fs.readBytes(own), fs.readBytes(standard)) }];
  });
}
