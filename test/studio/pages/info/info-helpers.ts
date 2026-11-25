// The Guide, Shortcuts and Doctor routes, asked the way the studio asks them.

import assert from 'node:assert/strict';
import type { CheckResult } from '../../../../src/doctor/index.ts';
import { createFolderKitStore } from '../../../../src/kit/adapters/folder-store.ts';
import { pageRoutes } from '../../../../src/studio/pages/routes.ts';
import { tempDrafts } from '../../../helpers/drafts.ts';
import { FIXTURE_KITS } from '../../../helpers/kits.ts';
import { t } from '../../../helpers/translate.ts';

export type DoctorFn = () => Promise<{ checks: CheckResult[]; report: string }>;

/** The page a route answers, as the studio would send it: `id` is `guide`, `shortcuts` or `doctor`. */
export async function infoPage(id: string, doctor?: DoctorFn): Promise<string> {
  const routes = pageRoutes({
    drafts: tempDrafts().store,
    kits: createFolderKitStore(FIXTURE_KITS),
    t,
    skin: '/* skin */',
    frame: { port: 5001, key: 'k3y' },
    version: '0.1.0',
    projectKit: () => 'base',
    ...(doctor === undefined ? {} : { doctor }),
  });
  const route = routes.find((candidate) => candidate.id === id);
  assert.ok(route, id);
  const answer = await route.handle({
    params: {},
    headers: {},
    query: new URLSearchParams(''),
    host: '127.0.0.1:5000',
    nonce: 'N0nce',
  });
  assert.equal(typeof answer, 'string', 'these pages answer with HTML');
  return answer as string;
}

/** The page's own part: the `<main>` element, without the bar and the hidden paused view. */
export const mainOf = (text: string): string => /<main[\s\S]*?<\/main>/.exec(text)?.[0] ?? '';

/** How many times `part` is in `text`. */
export const count = (text: string, part: string): number => text.split(part).length - 1;
