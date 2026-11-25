// The Kit lens's one call to the studio API (plan 19, task 2), with the page cookie, in the style
// of `client/studio/edit/api.ts`. Any failure (network, status, shape) answers `null`: the lens
// then draws no pins.

import type { KitLens } from '../../../src/studio/api/edit/kit-lens-schemas.ts';

export type { KitLens };

/** What `GET /api/v1/drafts/{slug}/kit-lens` answers for the latest version; `null` on failure. */
export async function getKitLens(slug: string): Promise<KitLens | null> {
  try {
    const response = await fetch(`/api/v1/drafts/${encodeURIComponent(slug)}/kit-lens`, {
      method: 'GET',
      credentials: 'same-origin',
    });
    if (!response.ok) return null;
    const read: unknown = await response.json().catch(() => null);
    if (typeof read !== 'object' || read === null || !('elements' in read)) return null;
    if (!Array.isArray(read.elements)) return null;
    return read as KitLens;
  } catch {
    return null;
  }
}
