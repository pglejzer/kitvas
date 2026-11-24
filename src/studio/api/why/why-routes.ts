// The reasons of each section (spec 4d, goal 7; plan 17, task E). The files are read by the drafts
// module; a file an agent left with a pending hash is stamped first, so "out of date" has a start.

import { latestVersion, loadDraft, readWhy, stampWhy } from '../../../drafts/index.ts';
import { type ApiRoute, apiRoute } from '../../http/router.ts';
import type { ApiDeps } from '../routes.ts';
import { SlugParams } from '../schemas.ts';
import { WhySchema } from './why-schemas.ts';

export function whyRoutes(deps: ApiDeps): ApiRoute[] {
  return [
    apiRoute({
      id: 'getWhy',
      summary: 'Why each section of the latest version was made this way, with what is missing.',
      method: 'GET',
      path: '/api/v1/drafts/{slug}/why',
      policy: 'read',
      params: SlugParams,
      request: null,
      response: { status: 200, schema: WhySchema },
      handle: ({ params }) => {
        const version = latestVersion(loadDraft(deps.drafts, params.slug));
        stampWhy(deps.drafts, params.slug, version);
        return { status: 200, body: readWhy(deps.drafts, params.slug, version) };
      },
    }),
  ];
}
