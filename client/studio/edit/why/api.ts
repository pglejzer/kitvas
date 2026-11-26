// The Why tab's two calls (spec 4d, goal 7): the reasons, and a `why` request for a section that
// has none. A network error or a refusal answers `null` / `false`; the tab says so.

import { call, draftPath } from '../../api/request.ts';
import { parseWhy, type WhyItem, type WhyReport, whyRequestOf } from './entries.ts';

export async function getWhy(slug: string): Promise<WhyReport | null> {
  const answer = await call('GET', `${draftPath(slug)}/why`);
  return answer.ok ? parseWhy(answer.body) : null;
}

/** The request route is task A's (`POST …/requests`); the tab only needs to know it was taken. */
export async function askWhy(
  slug: string,
  item: Pick<WhyItem, 'section' | 'element'>,
): Promise<boolean> {
  return (await call('POST', `${draftPath(slug)}/requests`, whyRequestOf(item))).ok;
}
