// Drafts may not use a project kit that its last `kit verify` failed in a step that blocks them
// (ADR 0031): schema, imports or types. `render` and `tokens` problems are reported, not blocking.
// A kit that was never verified, or changed since (another hash), is not refused here.

import { join } from 'node:path';
import type { LoadedKit } from '../../kit/index.ts';
import { catalogDir, KitvasError } from '../../shared/index.ts';
import { readVerifyFile, VERIFY_FILE, type VerifyStep } from '../domain/kit/kit-verify.ts';

export const BLOCKING_STEPS: readonly VerifyStep[] = ['schema', 'imports', 'types'];

/** The blocking steps the last run failed for exactly this kit data; [] otherwise. */
export function blockingFailures(text: string | undefined, hash: string): VerifyStep[] {
  const file = readVerifyFile(text);
  if (file === undefined || file.hash !== hash) return [];
  return BLOCKING_STEPS.filter((step) => file.steps[step] === 'failed');
}

/** Throws KIT_INVALID for a project kit whose verify.json says a blocking step failed. */
export function refuseFailedKit(read: (path: string) => string | undefined, kit: LoadedKit): void {
  if (kit.project === undefined) return;
  const text = read(join(catalogDir(kit.project, kit.kit.id), VERIFY_FILE));
  const failed = blockingFailures(text, kit.hash);
  if (failed.length > 0) {
    throw new KitvasError('KIT_INVALID', {
      id: kit.kit.id,
      detail: `${VERIFY_FILE}: ${failed.join(', ')}`,
    });
  }
}
