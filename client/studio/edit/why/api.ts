// The Why tab's two calls (spec 4d, goal 7): the reasons, and a `why` request for a section that
// has none. A network error or a refusal answers `null` / `false`; the tab says so.

import { parseWhy, type WhyItem, type WhyReport, whyRequestOf } from './entries.ts';

const base = (slug: string): string => `/api/v1/drafts/${encodeURIComponent(slug)}`;

export async function getWhy(slug: string): Promise<WhyReport | null> {
  try {
    const response = await fetch(`${base(slug)}/why`, { credentials: 'same-origin' });
    if (!response.ok) return null;
    return parseWhy(await response.json().catch((): unknown => undefined));
  } catch {
    return null;
  }
}

/** The request route is task A's (`POST …/requests`); the tab only needs to know it was taken. */
export async function askWhy(
  slug: string,
  item: Pick<WhyItem, 'section' | 'element'>,
): Promise<boolean> {
  try {
    const response = await fetch(`${base(slug)}/requests`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(whyRequestOf(item)),
    });
    return response.ok;
  } catch {
    return false;
  }
}
